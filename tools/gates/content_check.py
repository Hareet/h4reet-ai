#!/usr/bin/env python3
"""The published-content check (spec 002, T080; FR-012; contracts/resume-source.md §5; research.md R-08).

    python3 -I -B -X pycache_prefix=/dev/null tools/gates/content_check.py --tree DIR --dist DIR
        (--repo DIR | --policy-dir DIR)

The room publishes a content file, the resume's source or a narration script, only when main's
assets/policy/content-approvals.json lists the SHA-256 of its bytes. The build's code that decides this,
apps/web/build/approvals.ts, is agent-editable, so a branch could change it to publish a draft and say otherwise. This
check is the enforcement, in human-only code, run by make check (make content-check) and by the Author's gate after a
build without drafts, and it trusts none of the build's bookkeeping:
  - main's approvals come from --repo, which it reads itself with `GIT_NO_REPLACE_OBJECTS=1 git cat-file blob
    refs/heads/main:assets/policy/content-approvals.json` (the branch's full ref: a bare `main` resolves to a tag of
    that name first, and an agent session can make one), or from --policy-dir, a directory the gate filled the same
    way. Absent means nothing is approved;
  - each content file's SHA-256 is recomputed from --tree: apps/web/content/resume.yaml and
    apps/web/content/narration/*.md, each a regular file, never a link;
  - every entry of dist/room-data.json's `published`, {path, sha256}, must name a content file, carry that file's
    current digest, and have main approve it;
  - and, whatever room-data.json says, no text of a content file main doesn't approve may appear in any file under
    dist/. The text is the resume's `text`, `title`, and `name` values and a script's body after its front matter, cut
    at slot placeholders and sentence ends into fragments of at least MIN_FRAGMENT characters; a fragment an approved
    file also holds doesn't count. dist/'s files are read with JSON's strings parsed, HTML's entities, and a bundle's
    string escapes undone. A PDF is read as it is, so its text is found only in uncompressed streams.
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
from pathlib import Path

APPROVALS = "assets/policy/content-approvals.json"
MAIN_REF = "refs/heads/main"
CONTENT = Path("apps/web/content")
SHA256_RE = re.compile(r"[0-9a-f]{64}")
ID_RE = re.compile(r"C-\d{4}")
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
KINDS = ("resume", "narration")
# The shortest piece of a draft's text that counts as publishing it: shorter shared words (a section title, an ID)
# say nothing about where they came from.
MIN_FRAGMENT = 24
TEXT_KEY_RE = re.compile(
    r"^(?P<indent>\s*)(?:-\s+)?(?P<key>text|title|name)\s*:\s*(?P<value>.*)$"
)
SLOT_RE = re.compile(r"\{\{[^}]*\}\}")
SENTENCE_END_RE = re.compile(r"(?<=[.!?])\s+")
JS_UNICODE_RE = re.compile(r"\\u([0-9a-fA-F]{4})")


class CantCheck(Exception):
    """Exit 2: main's approvals can't be read as the contract's shape."""


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
            ("kind", lambda v: v in KINDS, "isn't resume or narration"),
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
    """The resume's source, then the narration scripts in name order, as paths from the tree's root."""
    paths = []
    resume = CONTENT / "resume.yaml"
    if (tree / resume).exists() or (tree / resume).is_symlink():
        paths.append(resume.as_posix())
    narration = tree / CONTENT / "narration"
    if narration.is_dir():
        paths += [
            (CONTENT / "narration" / p.name).as_posix()
            for p in sorted(narration.iterdir())
            if p.name.endswith(".md")
        ]
    return paths


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


def yaml_texts(text: str) -> list[str]:
    """The displayed values of a resume source: `text`, `title`, and `name`, inline or as a block scalar."""
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
        indent = len(found["indent"])
        block = []
        while i < len(lines) and (
            not lines[i].strip() or len(lines[i]) - len(lines[i].lstrip()) > indent
        ):
            block.append(lines[i].strip())
            i += 1
        out.append(" ".join(b for b in block if b))
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


def displayed(rel: str, data: bytes) -> list[str]:
    text = data.decode("utf-8", errors="replace")
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


def readable(path: Path) -> str:
    """A dist/ file's text as a reader would see it: JSON's strings, HTML's entities and a bundle's escapes undone."""
    data = path.read_bytes()
    text = data.decode("utf-8", errors="replace")
    if path.suffix == ".json":
        try:
            return collapse("\n".join(json_strings(json.loads(text))))
        except json.JSONDecodeError:
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


def published_of(room_data: Path) -> tuple[list[dict] | None, str]:
    """room-data.json's published entries, or None with the reason it isn't a build's."""
    try:
        doc = json.loads(room_data.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return (
            None,
            f"{room_data} doesn't exist: the build without drafts didn't run, or wrote none",
        )
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        return None, f"{room_data} can't be read as JSON ({type(error).__name__})"
    if not isinstance(doc, dict):
        return None, f"{room_data} isn't an object"
    published = doc.get("published")
    if not isinstance(published, list) or not all(
        isinstance(e, dict)
        and isinstance(e.get("path"), str)
        and isinstance(e.get("sha256"), str)
        for e in published
    ):
        return None, f"{room_data}'s published isn't a list of {{path, sha256}}"
    return published, ""


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

    published, why = published_of(args.dist / "room-data.json")
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
        texts[rel] = displayed(rel, raw)

    # What the build says it published: each must be a content file, at its current digest, which main approves.
    for item in published:
        rel, claimed = item["path"], item["sha256"]
        if rel not in digests:
            problems.append(
                f"FAIL {rel}: room-data.json says it published this, and it isn't a content file"
            )
        elif claimed != digests[rel]:
            problems.append(
                f"FAIL {rel}: room-data.json's SHA-256 for it isn't the file's"
            )
        elif claimed not in approved:
            problems.append(
                f"FAIL {rel}: published, and main doesn't approve its SHA-256"
            )

    # What dist/ holds, whatever the build says: no fragment of a file main doesn't approve.
    unapproved = [rel for rel in digests if digests[rel] not in approved]
    # A draft's words that an approved file also shows (a script quoting an approved item) are the approved file's.
    allowed_text = "\n".join(
        collapse(t) for rel in digests if digests[rel] in approved for t in texts[rel]
    )
    wanted = {
        rel: {f for f in fragments(texts[rel]) if f not in allowed_text}
        for rel in unapproved
    }
    if any(wanted.values()):
        for path in dist_files(args.dist):
            seen = readable(path)
            where = (
                path.relative_to(args.dist.parent).as_posix()
                if args.dist.name == "dist"
                else str(path)
            )
            for rel in unapproved:
                if any(f in seen for f in wanted[rel]):
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
