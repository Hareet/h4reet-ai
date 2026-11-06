#!/usr/bin/env python3
"""The published-content check (spec 002, T080; FR-012; contracts/resume-source.md §5; research.md R-08), with spec
004's room text (P-9; FR-030, SC-008, Amendment B9; spec 004's research.md R-57, contracts/intake-amendments.md §11).

    python3 -I -B -X pycache_prefix=/dev/null tools/gates/content_check.py --tree DIR --dist DIR
        (--repo DIR | --policy-dir DIR)

The room publishes a content file, the resume's source, a narration script, or a room-text file (a block of room text
or an outline), only when main's assets/policy/content-approvals.json lists the SHA-256 of its bytes. The build's code
that decides this, apps/web/build/approvals.ts, is agent-editable, so a branch could change it to publish a draft and
say otherwise. This check is the enforcement, in human-only code, run by make check (make content-check) and by the
Author's gate after a build without drafts, and it trusts none of the build's bookkeeping:
  - main's approvals come from --repo, which it reads itself with `GIT_NO_REPLACE_OBJECTS=1 git cat-file blob
    refs/heads/main:assets/policy/content-approvals.json` (the branch's full ref: a bare `main` resolves to a tag of
    that name first, and an agent session can make one), or from --policy-dir, a directory the gate filled the same
    way. Absent means nothing is approved;
  - each content file's SHA-256 is recomputed from --tree: apps/web/content/resume.yaml,
    apps/web/content/narration/*.md, apps/web/content/room/*.yaml, then apps/web/content/room/outlines/*.outline.json,
    each group sorted by name, each a regular file, never a link;
  - every entry of dist/room-data.json's `published`, {path, sha256}, must name a content file, carry that file's
    current digest, and have main approve it;
  - every `lines[].text` in room-data.json's `room_text` must equal, whole, a displayed value of a room-text file main
    approves (a room-text file's displayed values are a block's `text` values and an outline's `words`);
  - and, whatever room-data.json says, no text of a content file main doesn't approve may appear in any file under
    dist/. The text is the resume's `text`, `title`, and `name` values and a script's body after its front matter, cut
    at slot placeholders and sentence ends into fragments of at least MIN_FRAGMENT characters; a fragment an approved
    file also holds doesn't count. dist/'s files are read with JSON's strings parsed, HTML's entities, and a bundle's
    string escapes undone. A PDF is read as it is, so its text is found only in uncompressed streams. A room-text
    file's kind is in ANY_LENGTH: each displayed value is matched whole, at any length, never cut into fragments, and
    counts when it equals one of dist/'s strings (dist_strings), white space collapsed on both sides, unless a file
    main approves shows the same value.
It prints paths and counts, never a file's text.

Exit codes: 0 nothing published that main doesn't approve; 1 something is, or dist/room-data.json isn't a build's; 2
usage, or main's approvals can't be read as the contract's shape.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path

APPROVALS = "assets/policy/content-approvals.json"
MAIN_REF = "refs/heads/main"
CONTENT = Path("apps/web/content")
SHA256_RE = re.compile(r"[0-9a-f]{64}")
ID_RE = re.compile(r"C-\d{4}")
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
ROOM = CONTENT / "room"
OUTLINES = ROOM / "outlines"
OUTLINE_SUFFIX = ".outline.json"
KINDS = ("resume", "narration", "room-text")
# The kinds whose displayed values are matched whole, at any length, and never cut into MIN_FRAGMENT fragments: room
# text is short ("I am very busy" is 14 characters), and a shorter fragment would match common words (Amendment B9).
ANY_LENGTH = ("room-text",)
# The shortest piece of a draft's text that counts as publishing it: shorter shared words (a section title, an ID)
# say nothing about where they came from.
MIN_FRAGMENT = 24
TEXT_KEY_RE = re.compile(
    r"^(?P<indent>\s*)(?:-\s+)?(?P<key>text|title|name)\s*:\s*(?P<value>.*)$"
)
# A room-text block is read strictly (P-9's review, I1): a value in a form this reader can't read exactly, or a
# displayed key spelled in a way TEXT_KEY_RE doesn't match, makes the file Unreadable, never read as something else.
#   - a displayed key anywhere in a line: in flow style, quoted, after a sequence's dash, or as a complex key;
KEY_SPELLING_RE = re.compile(r"""(?:^|[\s{,\[?-])["']?(?:text|title|name)["']?\s*:""")
COMPLEX_KEY_RE = re.compile(r"^\s*(?:-\s+)*\?(?:\s|$)")
#   - another key's block scalar, whose content lines are its words, never keys;
OTHER_BLOCK_RE = re.compile(
    r"^\s*(?:-\s+)?(?P<key>[A-Za-z_][\w-]*)\s*:\s+[>|][-+0-9]*\s*(?:#.*)?$"
)
#   - a block scalar's header, read exactly when it is >, |, and an optional chomping indicator;
BLOCK_HEADER_RE = re.compile(r"[>|][-+]?")
#   - a quoted value on one line, then nothing or a comment;
DOUBLE_QUOTED_RE = re.compile(r'"(?:[^"\\]|\\.)*"')
SINGLE_QUOTED_RE = re.compile(r"'(?:[^']|'')*'")
AFTER_QUOTE_RE = re.compile(r"\s*(?:\s#.*)?")
#   - on any line, outside quoted scalars and comments (flow_scan): a quoted key, since §6.1's keys are all plain words;
#     any alias, as a key or a value, since §6.1 needs none and an alias key can end at its colon ("*k:"); a quoted
#     scalar not closed on its line; and a flow collection not closed on its line. A scalar starts at a line's start or
#     after one of SCALAR_STARTS, with any anchor or tag before it.
SCALAR_STARTS = (None, "-", ":", ",", "[", "{", "?")
NODE_PROPERTY_RE = re.compile(r"[&!][^\s,\[\]{}]*")
KEY_COLON_RE = re.compile(r"\s*:(?:\s|$)")
#   - a line break str.splitlines() sees and YAML doesn't, so a line holds what YAML reads on it: VT, FF, the
#     information separators, NEL, LS, and PS.
NOT_YAML_LINE_BREAKS = frozenset("\x0b\x0c\x1c\x1d\x1e\x85  ")
#   - a plain value can't start with an indicator, hold a comment or a mapping's ": ", or be read by YAML as anything
#     but a string (YAML 1.1's and 1.2's nulls, booleans, numbers, and timestamps).
PLAIN_INDICATORS = "-?:,[]{}#&*!|>'\"%@`"
YAML_NOT_A_STRING_RE = re.compile(
    r"~|null|Null|NULL|true|True|TRUE|false|False|FALSE|yes|Yes|YES|no|No|NO|on|On|ON|off|Off|OFF|y|Y|n|N"
    r"|[-+]?(?:\.[0-9_]+|[0-9][0-9_]*(?:\.[0-9_]*)?)(?:[eE][-+]?[0-9]+)?"
    r"|[-+]?0[xX][0-9a-fA-F_]+|[-+]?0[oO]?[0-7_]+|[-+]?0[bB][01_]+"
    r"|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN)"
    r"|\d{4}-\d\d?-\d\d?(?:[Tt ].*)?"
    r"|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+(?:\.[0-9_]*)?"
)
SLOT_RE = re.compile(r"\{\{[^}]*\}\}")
SENTENCE_END_RE = re.compile(r"(?<=[.!?])\s+")
JS_UNICODE_RE = re.compile(r"\\u([0-9a-fA-F]{4})")
# dist/'s strings for the whole-string match (contracts/intake-amendments.md §11), by a file's suffix.
JSON_SUFFIXES = (".json", ".webmanifest", ".map", ".gltf")
JS_SUFFIXES = (".js", ".mjs", ".cjs")
MARKUP_SUFFIXES = (".html", ".htm", ".svg", ".xml")
TEXT_SUFFIXES = (".txt",)
# A string literal from its opening quote: the body runs to the first unescaped closing quote; a line end ends a ' or
# " literal unescaped, so none matches across one.
JS_LITERAL_RES = {
    "'": re.compile(r"'((?:[^'\\\n\r]|\\[\s\S])*)'"),
    '"': re.compile(r'"((?:[^"\\\n\r]|\\[\s\S])*)"'),
    "`": re.compile(r"`((?:[^`\\]|\\[\s\S])*)`"),
}
JS_ESCAPE_RE = re.compile(
    r"\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r\n|[\s\S])"
)
JS_SIMPLE_ESCAPES = {
    "n": "\n",
    "t": "\t",
    "r": "\r",
    "b": "\b",
    "f": "\f",
    "v": "\v",
    "0": "\0",
}
JS_LINE_CONTINUATIONS = ("\n", "\r\n", "\r", "\u2028", "\u2029")
POSITIVE_FAIL = "FAIL room-data.json: a room-text string isn't a displayed value of any approved room-text file"


class CantCheck(Exception):
    """Exit 2: main's approvals can't be read as the contract's shape."""


class Unreadable(Exception):
    """A content file whose displayed values can't be read, so they can't be held out of dist/."""


def git_env() -> dict[str, str]:
    """git's minimum: no GIT_DIR or other GIT_* of the caller's, no replace objects, no system or global config."""
    return {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": os.environ.get("HOME", "/nonexistent"),
        "LC_ALL": "C",
        "GIT_NO_REPLACE_OBJECTS": "1",
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_CONFIG_GLOBAL": "/dev/null",
        "GIT_TERMINAL_PROMPT": "0",
    }


def mains_approvals(repo: Path) -> bytes | None:
    """main's copy of the approvals file, by the branch's full ref, or None: no branch main, or no file on it."""
    try:
        done = subprocess.run(
            ["git", "-C", str(repo), "cat-file", "blob", f"{MAIN_REF}:{APPROVALS}"],
            capture_output=True,
            check=False,
            timeout=60,
            env=git_env(),
            stdin=subprocess.DEVNULL,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    return done.stdout if done.returncode == 0 else None


def approved_digests(data: bytes | None) -> set[str]:
    """The digests main approves, from data-model.md §4's shape, which every entry must have."""
    if data is None:
        return set()
    try:
        doc = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise CantCheck("not JSON") from None
    if not isinstance(doc, dict) or doc.get("schema") != 1:
        raise CantCheck("schema isn't 1")
    entries = doc.get("approvals")
    if not isinstance(entries, list):
        raise CantCheck("approvals isn't a list")
    found = set()
    for i, entry in enumerate(entries):
        at = f"approvals[{i}]"
        if not isinstance(entry, dict):
            raise CantCheck(f"{at} isn't an object")
        checks = (
            ("id", lambda v: isinstance(v, str) and ID_RE.fullmatch(v), "isn't C-nnnn"),
            ("path_when_approved", lambda v: isinstance(v, str) and v, "is missing"),
            (
                "kind",
                lambda v: v in KINDS,
                f"isn't {', '.join(KINDS[:-1])}, or {KINDS[-1]}",
            ),
            (
                "sha256",
                lambda v: isinstance(v, str) and SHA256_RE.fullmatch(v),
                "isn't 64 lowercase hex",
            ),
            (
                "date",
                lambda v: isinstance(v, str) and DATE_RE.fullmatch(v),
                "isn't YYYY-MM-DD",
            ),
            ("reason", lambda v: isinstance(v, str), "is missing"),
        )
        for key, ok, why in checks:
            if not ok(entry.get(key)):
                raise CantCheck(f"{at}.{key} {why}")
        found.add(entry["sha256"])
    return found


def content_files(tree: Path) -> list[str]:
    """The resume's source, then the narration scripts, the room-text blocks, and the outlines, each group in name
    order, as paths from the tree's root."""
    paths = []
    resume = CONTENT / "resume.yaml"
    if (tree / resume).exists() or (tree / resume).is_symlink():
        paths.append(resume.as_posix())
    for folder, suffix in (
        (CONTENT / "narration", ".md"),
        (ROOM, ".yaml"),
        (OUTLINES, OUTLINE_SUFFIX),
    ):
        if (tree / folder).is_dir():
            paths += [
                (folder / p.name).as_posix()
                for p in sorted((tree / folder).iterdir())
                if p.name.endswith(suffix)
            ]
    return paths


def kind_of(rel: str) -> str:
    """A content file's kind, by its path: the approvals' kinds name the same three."""
    if rel.startswith(f"{ROOM.as_posix()}/"):
        return "room-text"
    return "resume" if rel == (CONTENT / "resume.yaml").as_posix() else "narration"


def collapse(text: str) -> str:
    return " ".join(text.split())


def unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        inner = value[1:-1]
        return (
            inner.replace('\\"', '"') if value[0] == '"' else inner.replace("''", "'")
        )
    return value


def indent_of(line: str) -> int:
    return len(line) - len(line.lstrip())


def block_scalar(lines: list[str], i: int, column: int) -> tuple[str, int]:
    """A block scalar's content from lines[i]: every line blank or indented past its key's column, joined with
    spaces (white space is collapsed before any comparison), and the index of the line after it."""
    block = []
    while i < len(lines) and (not lines[i].strip() or indent_of(lines[i]) > column):
        block.append(lines[i].strip())
        i += 1
    return " ".join(b for b in block if b), i


def yaml_texts(text: str) -> list[str]:
    """The displayed values of a resume source: `text`, `title`, and `name`, inline or as a block scalar, whose
    content ends at a line no further in than its key (the key's column, not a sequence dash's before it)."""
    lines = text.splitlines()
    out = []
    i = 0
    while i < len(lines):
        found = TEXT_KEY_RE.match(lines[i])
        i += 1
        if not found:
            continue
        value = found["value"].strip()
        if value and value[0] not in ">|":
            out.append(unquote(value))
            continue
        words, i = block_scalar(lines, i, found.start("key"))
        out.append(words)
    return out


def strict_value(value: str, lines: list[str], i: int, column: int) -> tuple[str, int]:
    """One room-text value, from the text after its key's colon on lines[i - 1], read exactly or Unreadable: a block
    scalar; a double-quoted value on one line, read as JSON reads it (YAML's escapes that JSON shares mean the same);
    a single-quoted one on one line, '' its one escape; or a plain one on one line. Returns the value and the index
    of the line after it."""
    value = value.rstrip()
    if not value:
        raise Unreadable("a room-text value on the line after its key")
    first = value[0]
    if first in ">|":
        if not BLOCK_HEADER_RE.fullmatch(value):
            raise Unreadable("a block scalar's header with an indicator or a comment")
        return block_scalar(lines, i, column)
    if first in "\"'":
        quoted = (DOUBLE_QUOTED_RE if first == '"' else SINGLE_QUOTED_RE).match(value)
        if not quoted or not AFTER_QUOTE_RE.fullmatch(value[quoted.end() :]):
            raise Unreadable("a quoted room-text value that isn't whole on its line")
        if first == "'":
            return quoted.group(0)[1:-1].replace("''", "'"), i
        try:
            return json.loads(quoted.group(0)), i
        except ValueError:
            raise Unreadable("a double-quoted escape JSON doesn't read") from None
    if (
        first in PLAIN_INDICATORS
        or " #" in value
        or "\t#" in value
        or ": " in value
        or value.endswith(":")
    ):
        raise Unreadable("a plain room-text value with an indicator or a comment")
    if YAML_NOT_A_STRING_RE.fullmatch(value):
        raise Unreadable("a plain room-text value YAML reads as something else")
    following = next((line for line in lines[i:] if line.strip()), None)
    if following is not None and indent_of(following) > column:
        raise Unreadable("a plain room-text value continued onto another line")
    return value, i


def flow_scan(line: str) -> None:
    """Refuse (Unreadable) a line of a room-text block that holds, outside its quoted scalars and its comment, a quoted
    key, an alias, a quoted scalar that doesn't close on the line, or a flow collection that doesn't: each is legal
    YAML that this reader, which reads line by line, would read as nothing or as another value."""
    depth = 0
    previous: str | None = None
    i = 0
    while i < len(line):
        char = line[i]
        if char in " \t":
            i += 1
            continue
        if char == "#" and (i == 0 or line[i - 1] in " \t"):
            break
        at_start = previous in SCALAR_STARTS
        if at_start and char in "&!":
            prop = NODE_PROPERTY_RE.match(line, i)
            i = prop.end() if prop is not None else i + 1
            continue
        if at_start and char in "\"'":
            quoted = (DOUBLE_QUOTED_RE if char == '"' else SINGLE_QUOTED_RE).match(
                line, i
            )
            if quoted is None:
                raise Unreadable("a quoted value over several lines")
            i = quoted.end()
            if KEY_COLON_RE.match(line, i):
                raise Unreadable("a quoted key")
            previous = char
            continue
        if at_start and char == "*":
            raise Unreadable("an alias")
        if char in "[{":
            depth += 1
        elif char in "]}":
            depth -= 1
            if depth < 0:
                raise Unreadable("a flow collection over several lines")
        previous = char
        i += 1
    if depth:
        raise Unreadable("a flow collection over several lines")


def room_yaml_texts(text: str) -> list[str]:
    """A room-text block's displayed values, its `text` values (and `title` and `name`, which a block never names,
    data-model.md §6.1), each read exactly; any other spelling of those keys, or of their values, is Unreadable."""
    if NOT_YAML_LINE_BREAKS.intersection(text):
        raise Unreadable("a line break YAML doesn't read as one")
    lines = text.splitlines()
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]
        i += 1
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        flow_scan(line)
        found = TEXT_KEY_RE.match(line)
        if found is None:
            if KEY_SPELLING_RE.search(line) or COMPLEX_KEY_RE.match(line):
                raise Unreadable("a room-text key in a form this check doesn't read")
            other = OTHER_BLOCK_RE.match(line)
            if other is not None:
                _, i = block_scalar(lines, i, other.start("key"))
            continue
        if not re.match(r"\s*:(?:\s|$)", line[found.end("key") :]):
            raise Unreadable("a room-text key with no space after its colon")
        after = line[found.end("key") :].lstrip()[1:]
        words, i = strict_value(after.lstrip(), lines, i, found.start("key"))
        out.append(words)
    return out


def script_body(text: str) -> list[str]:
    """A narration script's words: its body after the front matter."""
    if text.startswith("---\n"):
        end = text.find("\n---\n", 4)
        if end != -1:
            text = text[end + 5 :]
    return [text]


def fragments(texts: list[str]) -> set[str]:
    """Each displayed text cut at slot placeholders and sentence ends; the pieces long enough to say where they came
    from, whitespace collapsed and trailing punctuation dropped."""
    out = set()
    for text in texts:
        for piece in SLOT_RE.split(text):
            for sentence in SENTENCE_END_RE.split(collapse(piece)):
                sentence = sentence.strip().rstrip(".!?,;:").strip()
                if len(sentence) >= MIN_FRAGMENT:
                    out.add(sentence)
    return out


def _no_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    keys = [k for k, _ in pairs]
    if len(set(keys)) != len(keys):
        raise ValueError("a key twice")
    return dict(pairs)


def _no_constant(name: str) -> object:
    raise ValueError(f"{name} isn't JSON")


def outline_words(data: bytes) -> list[str]:
    """An outline's displayed value, its `words`, read as strict JSON (spec 004's data-model.md §6.2): UTF-8 without a
    byte-order mark, an object, no key twice, no NaN or Infinity, and `words` a string."""
    try:
        doc = json.loads(
            data.decode("utf-8"),
            object_pairs_hook=_no_duplicate_keys,
            parse_constant=_no_constant,
        )
    except (UnicodeDecodeError, ValueError):
        raise Unreadable("an outline that isn't strict JSON") from None
    if not isinstance(doc, dict) or not isinstance(doc.get("words"), str):
        raise Unreadable("an outline whose words aren't a string")
    return [doc["words"]]


def displayed(rel: str, data: bytes) -> list[str]:
    """A content file's displayed values: the resume's `text`, `title`, and `name` values; a room-text block's, each
    read exactly or the file Unreadable (no other key of a block is named `title` or `name`, spec 004's data-model.md
    §6.1); a script's body; an outline's `words`."""
    if rel.endswith(OUTLINE_SUFFIX):
        return outline_words(data)
    text = data.decode("utf-8", errors="replace")
    if kind_of(rel) == "room-text":
        return room_yaml_texts(text)
    return yaml_texts(text) if rel.endswith(".yaml") else script_body(text)


def json_strings(node: object) -> list[str]:
    if isinstance(node, str):
        return [node]
    if isinstance(node, dict):
        return [
            s for k, v in node.items() for s in (*json_strings(k), *json_strings(v))
        ]
    if isinstance(node, list):
        return [s for v in node for s in json_strings(v)]
    return []


def _every_pair(pairs: list[tuple[str, object]]) -> list[object]:
    """An object as the list of its keys and values, every pair kept: a key given twice keeps both values."""
    return [part for pair in pairs for part in pair]


def json_texts(text: str) -> list[str]:
    """Every string of a JSON text, keys included, a key given twice keeping both values; and, for a string that is
    JSON itself, that JSON's strings too. Raises ValueError (or RecursionError) when the text isn't JSON."""
    out = []
    for string in json_strings(json.loads(text, object_pairs_hook=_every_pair)):
        out.append(string)
        if string.lstrip()[:1] in ("{", "["):
            try:
                out += json_texts(string)
            except (ValueError, RecursionError):
                pass
    return out


def readable(path: Path) -> str:
    """A dist/ file's text as a reader would see it: JSON's strings, HTML's entities and a bundle's escapes undone."""
    data = path.read_bytes()
    text = data.decode("utf-8", errors="replace")
    if path.suffix == ".json":
        try:
            return collapse("\n".join(json_texts(text)))
        except (ValueError, RecursionError):
            pass
    text = html.unescape(text)
    text = JS_UNICODE_RE.sub(lambda m: chr(int(m.group(1), 16)), text)
    text = (
        text.replace("\\'", "'")
        .replace('\\"', '"')
        .replace("\\n", " ")
        .replace("\\\\", "\\")
    )
    return collapse(text)


def js_unescape(body: str) -> str:
    """A JavaScript string literal's body with its escapes undone: \\n and the other one-letter escapes, \\xHH,
    \\uHHHH (a surrogate pair joined), \\u{H...}, a line continuation, and any other escaped character as itself."""

    def one(found: re.Match[str]) -> str:
        escape = found.group(1)
        if escape.startswith("u{"):
            point = int(escape[2:-1], 16)
            return chr(point) if point <= 0x10FFFF else ""
        if len(escape) == 5 and escape[0] == "u":
            return chr(int(escape[1:], 16))
        if len(escape) == 3 and escape[0] == "x":
            return chr(int(escape[1:], 16))
        if escape in JS_LINE_CONTINUATIONS:
            return ""
        return JS_SIMPLE_ESCAPES.get(escape, escape)

    text = JS_ESCAPE_RE.sub(one, body)
    return text.encode("utf-16-le", "surrogatepass").decode("utf-16-le", "replace")


def js_strings(text: str) -> list[str]:
    """Every string literal in a script, quoted with ', ", or a backtick holding no ${, its escapes undone; and, for a
    literal that is JSON (a bundler inlines a large JSON import as JSON.parse('...')), that JSON's strings too.
    Each literal is read from every quote character on, so a quote in a comment, a regular expression, or another
    literal can't hide the literal after it: the true literals are all among what this returns."""
    out = []
    for quote, literal_re in JS_LITERAL_RES.items():
        start = text.find(quote)
        while start != -1:
            found = literal_re.match(text, start)
            if found and not (quote == "`" and "${" in found.group(1)):
                value = js_unescape(found.group(1))
                out.append(value)
                if value.lstrip()[:1] in ("{", "["):
                    try:
                        out += json_texts(value)
                    except (ValueError, RecursionError):
                        pass
            start = text.find(quote, start + 1)
    return out


class _Markup(HTMLParser):
    """An HTML or SVG file's text nodes and attribute values, entities decoded; and an inline script's literals."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.strings: list[str] = []
        self.script: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.strings += [value for _, value in attrs if value is not None]
        if tag == "script":
            self.script = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self.script is not None:
            self.strings += js_strings("".join(self.script))
            self.script = None

    def handle_data(self, data: str) -> None:
        self.strings.append(data)
        if self.script is not None:
            self.script.append(data)

    def unknown_decl(self, data: str) -> None:
        if data.startswith("CDATA["):
            self.strings.append(data[len("CDATA[") :])


def dist_strings(path: Path) -> set[str]:
    """A dist/ file's whole strings, white space collapsed (contracts/intake-amendments.md §11): every JSON string,
    keys included; every string literal of a script; every text node and attribute value of an HTML or SVG file,
    entities decoded; each line of a .txt file. A .json file that isn't JSON, and any other file that is text (UTF-8,
    no NUL byte: a stylesheet's content, a Markdown file), is read for its string literals."""
    data = path.read_bytes()
    text = data.decode("utf-8", errors="replace")
    suffix = path.suffix.lower()
    strings: list[str] = []
    if suffix in JSON_SUFFIXES:
        try:
            strings = json_texts(text)
        except (ValueError, RecursionError):
            strings = js_strings(text)
    elif suffix in JS_SUFFIXES:
        strings = js_strings(text)
    elif suffix in MARKUP_SUFFIXES:
        parser = _Markup()
        parser.feed(text)
        parser.close()
        if parser.script is not None:
            parser.strings += js_strings("".join(parser.script))
        strings = parser.strings
    elif suffix in TEXT_SUFFIXES:
        strings = text.splitlines()
    elif is_text(data):
        strings = js_strings(text) + text.splitlines()
    return {s for s in map(collapse, strings) if s}


def is_text(data: bytes) -> bool:
    """A file of a kind the reader has no rule for, read as text when it is UTF-8 with no NUL byte."""
    if b"\0" in data:
        return False
    try:
        data.decode("utf-8")
    except UnicodeDecodeError:
        return False
    return True


def dist_files(dist: Path) -> list[Path]:
    """Every regular file under dist/, never following a link."""
    out = []
    for dirpath, dirnames, filenames in os.walk(dist):
        dirnames.sort()
        for name in sorted(filenames):
            path = Path(dirpath, name)
            if path.is_file() and not path.is_symlink():
                out.append(path)
    return out


def room_text_lines(doc: dict) -> list[str] | None:
    """Every `lines[].text` of room-data.json's `room_text` (spec 004's data-model.md §10.3), an outline's words
    included; [] when there is no room_text; None when it isn't {blocks: [{lines: [{text}]}]}."""
    if "room_text" not in doc:
        return []
    part = doc["room_text"]
    blocks = part.get("blocks") if isinstance(part, dict) else None
    if not isinstance(blocks, list):
        return None
    out = []
    for block in blocks:
        lines = block.get("lines") if isinstance(block, dict) else None
        if not isinstance(lines, list):
            return None
        for line in lines:
            if not isinstance(line, dict) or not isinstance(line.get("text"), str):
                return None
            out.append(line["text"])
    return out


def published_of(room_data: Path) -> tuple[list[dict] | None, list[str], str]:
    """room-data.json's published entries and its room text's lines, or None with the reason it isn't a build's."""
    try:
        doc = json.loads(room_data.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return (
            None,
            [],
            f"{room_data} doesn't exist: the build without drafts didn't run, or wrote none",
        )
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        return None, [], f"{room_data} can't be read as JSON ({type(error).__name__})"
    if not isinstance(doc, dict):
        return None, [], f"{room_data} isn't an object"
    published = doc.get("published")
    if not isinstance(published, list) or not all(
        isinstance(e, dict)
        and isinstance(e.get("path"), str)
        and isinstance(e.get("sha256"), str)
        for e in published
    ):
        return None, [], f"{room_data}'s published isn't a list of {{path, sha256}}"
    lines = room_text_lines(doc)
    if lines is None:
        return (
            None,
            [],
            f"{room_data}'s room_text isn't {{blocks: [{{lines: [{{text}}]}}]}}",
        )
    return published, lines, ""


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--tree", type=Path, required=True)
    parser.add_argument("--dist", type=Path, required=True)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--repo", type=Path)
    source.add_argument("--policy-dir", type=Path)
    args = parser.parse_args(argv)

    if args.repo is not None:
        data = mains_approvals(args.repo)
    else:
        path = args.policy_dir / Path(APPROVALS).name
        data = path.read_bytes() if path.is_file() and not path.is_symlink() else None
    try:
        approved = approved_digests(data)
    except CantCheck as error:
        print(
            f"content check: can't check: main's content-approvals.json: {error}",
            file=sys.stderr,
        )
        return 2

    published, room_lines, why = published_of(args.dist / "room-data.json")
    if published is None:
        print(f"FAIL room-data.json: {why}")
        print("content check: 1 problem (room-data.json isn't a build's)")
        return 1

    problems = []
    paths = content_files(args.tree)
    digests: dict[str, str] = {}
    texts: dict[str, list[str]] = {}
    for rel in paths:
        full = args.tree / rel
        if full.is_symlink() or not full.is_file():
            problems.append(
                f"FAIL {rel}: not a regular file: a content file is never a link"
            )
            continue
        raw = full.read_bytes()
        digests[rel] = hashlib.sha256(raw).hexdigest()
        try:
            texts[rel] = displayed(rel, raw)
        except Unreadable as error:
            texts[rel] = []
            problems.append(f"FAIL {rel}: {error}: its words can't be checked")

    # What the build says it published: each must be a content file, at its current digest, which main approves.
    # An entry that names no content file is named by its index: its path is a value the build wrote, never printed.
    for index, item in enumerate(published):
        rel, claimed = item["path"], item["sha256"]
        if rel not in digests:
            problems.append(
                f"FAIL room-data.json: published[{index}] says it published a file that isn't a content file"
            )
        elif claimed != digests[rel]:
            problems.append(
                f"FAIL {rel}: room-data.json's SHA-256 for it isn't the file's"
            )
        elif claimed not in approved:
            problems.append(
                f"FAIL {rel}: published, and main doesn't approve its SHA-256"
            )

    approved_files = [rel for rel in digests if digests[rel] in approved]
    unapproved = [rel for rel in digests if digests[rel] not in approved]
    # The room text the build published: each string, whole, a displayed value of a room-text file main approves.
    approved_room_text = {
        collapse(t)
        for rel in approved_files
        if kind_of(rel) == "room-text"
        for t in texts[rel]
    }
    problems += [
        POSITIVE_FAIL for line in room_lines if collapse(line) not in approved_room_text
    ]

    # What dist/ holds, whatever the build says: no fragment of a file main doesn't approve, and no whole displayed
    # value of one whose kind is in ANY_LENGTH.
    # A draft's words that an approved file also shows (a script quoting an approved item) are the approved file's.
    allowed_text = "\n".join(collapse(t) for rel in approved_files for t in texts[rel])
    allowed_values = {collapse(t) for rel in approved_files for t in texts[rel]}
    wanted = {
        rel: {f for f in fragments(texts[rel]) if f not in allowed_text}
        for rel in unapproved
        if kind_of(rel) not in ANY_LENGTH
    }
    whole = {
        rel: {v for v in map(collapse, texts[rel]) if v and v not in allowed_values}
        for rel in unapproved
        if kind_of(rel) in ANY_LENGTH
    }
    if any(wanted.values()) or any(whole.values()):
        for path in dist_files(args.dist):
            seen = readable(path) if any(wanted.values()) else ""
            strings = dist_strings(path) if any(whole.values()) else set()
            where = (
                path.relative_to(args.dist.parent).as_posix()
                if args.dist.name == "dist"
                else str(path)
            )
            for rel in unapproved:
                if any(f in seen for f in wanted.get(rel, ())) or (
                    whole.get(rel, set()) & strings
                ):
                    problems.append(
                        f"FAIL {rel}: main doesn't approve it, and its text is in {where}"
                    )

    for line in problems:
        print(line)
    if problems:
        print(
            f"content check: {len(problems)} problem(s) in {len(paths)} content files"
        )
        return 1
    if not paths:
        print("content check: PASS (no content files yet)")
    else:
        print(
            f"content check: PASS ({len(paths)} content files: {len(paths) - len(unapproved)} approved by main, "
            f"{len(unapproved)} drafts, none of whose text is in dist/)"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
