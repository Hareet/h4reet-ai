#!/usr/bin/env python3
"""Check a corpus proposal drawn from the film scripts (spec 022; plan §3, R1 to R7).

Usage: python3 -I scripts/corpus/film_claims.py [--root DIR] [--rules R1,R2,...] [--third-party] <proposal.md>

The proposal holds the new text for `corpus/08-hareet-ai.md` in fenced blocks (```corpus-08, and ```corpus-08-golden-5
for Golden Q&A 5's suggested sentence), the one new slot in a ```facts block, and a table under "## The table" with one
row per script line in scope: `films/SCRIPTS.md` §1 to §6 by their numbered lines, and `films/kill-switch-b2/script.txt`
by sentence. Its columns: Script | Line | Script line | Status | Carried | Left out | Corpus line | Source | Tag | Mark.

R1  each row's script line is found verbatim (whitespace collapsed) in its script, a `kill-switch-b2` row's file lines
    are the sentence's, and each row names a repository source: for a carried row, one that exists; for a
    `kill-switch-b2` row, a path `materials.md` lists, or one `SCRIPTS.md`'s notes give where materials.md has no row
    for the claim (plan §9). No row's source is outside the repository: after normalising, a path that is absolute,
    starts with `..`, or resolves (through a link) outside the root fails, and so does a glob that matches nothing or
    has a match resolving outside, for carried, in-part, and left-out rows alike. Its corpus lines are in the new text and carry its tags; its mark is in the one form.
R2  every line in scope is in the table once, carried, in part, or left out, each left-out span with a reason from the
    closed list (FR-006), each span found in its line; "contradicted by the repository" names the file, and "a
    duplicate of" names the corpus file. An "about you" line is carried only under the Author's tag.
R3  no line `SCRIPTS.md` marks unbuilt or retracted is carried whole, and no carried `kill-switch-b2` row cites a
    `materials.md` row noted "shown as built".
R4  the new text states no number outside a slot (digits, or G1's number words; its exempt spans aside: slots, URLs,
    the claim tags [P], [?], [A], [A <date>] and [slot `id`], paths (no whitespace, no segment that is a number but a
    date, inside --root, found under it or rooted at its top-level entry, and, holding a number, found or a file name
    in a directory it holds; a backticked `:<line>` suffix only on a file that holds every line it names), a setting
    such as ENV=prod whose value holds no digit and no number word, dates, a list item's number, and the quotes R5
    accepts) and no currency amount (check_corpus.py's CURRENCY, redteam/run.py's AMOUNT_WORDS, guards.ts's
    EXTRA_PATTERN); every slot exists; and the whole file holds no CURRENCY match, since corpus-check reads
    `corpus/proposals/` too.
R5  every quotation in the new text is the Author's words as `SCRIPTS.md` quotes them or his one sentence in the
    disclosure's row F3 (the checker's fixed lists, HIS_WORDS and F3_WORDS), or a cited file's own text: a carried or
    in-part row's source only, never the proposal being checked, a file under `films/`, `corpus/proposals/`,
    `docs/merge-requests/`, `specs/`, or `intent/`, or a file outside the repository, its path normalised and
    resolved; and the disclosure, when cited, is read without row F3.
R6  with --third-party, no quoted span longer than a title, anywhere in the proposal, that the repository doesn't hold.
R7  the summary says the denylist was not applied: this checker never reads `corpus/intake/private/`.

Deterministic, read-only, no network, no model, and it imports nothing from the files whose patterns it copies; the
tests hold its copies equal to those files' text. Exit 0 when clean, 1 with one line per problem.
"""

from __future__ import annotations

import argparse
import posixpath
import re
import sys
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SCRIPTS_MD = "films/SCRIPTS.md"
KS = "kill-switch-b2"
KS_SCRIPT = "films/kill-switch-b2/script.txt"
KS_MATERIALS = "films/kill-switch-b2/materials.md"
DISCLOSURE = "docs/data-flow-disclosure.md"
RULES = ("R1", "R2", "R3", "R4", "R5", "R6", "R7")

# ---- The sources' patterns and words, copied (the tests hold them equal to the sources' text) ----

# corpus/tools/check_corpus.py's CURRENCY.
CURRENCY = re.compile(
    r"[$€£₹₨]\s?\d"
    r"|\b(?:USD|EUR|GBP|KES|INR|NPR|UGX|USh|TZS|TSh|XOF|F?CFA|(?i:usd|kes|kshs?)\.?|K?Shs?\.?|N?Rs\.?)\s?\d"
    r"|\b\d[\d,.]*\s?(?:[kKmMbB]n?|(?i:thousand|million|billion|lakh|crore))?\s?"
    r"(?:(?i:US|U\.S\.|Kenyan|Indian|Nepali|Nepalese|Ugandan|Tanzanian)\s)?"
    r"(?:USD|EUR|GBP|KES|KSh|INR|NPR|UGX|TZS|XOF|CFA|(?i:dollars?|euros?|shillings?|rupees?|francs?))\b"
    r"|\b\d[\d,.]*-(?:(?i:thousand|million|billion|lakh|crore)-)?(?i:dollar|shilling|rupee|franc)\b"
    r"|\b\d[\d,]*\s?/[=-]"
)

# redteam/run.py's _NUMBER_WORDS and AMOUNT_WORDS, which guards.ts's AMOUNT_WORDS_PY_SOURCE ports.
NUMBER_WORDS_PY = (
    r"(?:a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|"
    r"a hundred|hundred|a thousand|thousand|a few|few|several|half a|a couple of)"
)
AMOUNT_WORDS = re.compile(
    r"\bcents?\b|\d\s?\u00a2|\bmicro-?dollars?\b|\bmicro[-_ ]?usd\b|[\u00b5\u03bc](?:\$|usd\b)"
    rf"|\b{NUMBER_WORDS_PY}\s+(?:[a-z-]+\s+)?(?:dollars?|bucks?|euros?|rupees?|shillings?|francs?|pennies|penny)\b",
    re.IGNORECASE,
)

# services/gateway/src/twin/guards.ts's G1 number words: UNITS, TENS, and SCALES ("one" and ordinals aren't numbers).
UNITS = {
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
}
TENS = {
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "fifty": 50,
    "sixty": 60,
    "seventy": 70,
    "eighty": 80,
    "ninety": 90,
}
SCALES = {
    "hundred": 100,
    "thousand": 1_000,
    "million": 1_000_000,
    "billion": 1_000_000_000,
    "dozen": 12,
}

# guards.ts's EXTRA_PATTERN, rebuilt from G1's UNITS and TENS and its fixed words.
EXTRA_LEADING_WORDS = ("one", "a hundred", "a thousand")
EXTRA_AFTER_WORD = ("cents?", "dollars?", "bucks?")
EXTRA_AFTER_DIGITS = ("cents?", "dollars?", "usd", "bucks?")
EXTRA = re.compile(
    rf"\b\d[\d,.]*\s?(?:{'|'.join(EXTRA_AFTER_DIGITS)})\b"
    rf"|\b(?:{'|'.join([*UNITS, *TENS, *EXTRA_LEADING_WORDS])})\s+(?:{'|'.join(EXTRA_AFTER_WORD)})\b",
    re.IGNORECASE,
)

# G1's WORD, its groups non-capturing (a parity test holds it equal): a tens word with an optional unit, a unit, or a
# scale with its plural; and its DIGITS.
_SMALL = "|".join(u for u, v in UNITS.items() if v < 10)
WORD = re.compile(
    rf"\b(?:(?:{'|'.join(TENS)})(?:-(?:{_SMALL}))?|(?:{'|'.join(UNITS)})|(?:{'|'.join(SCALES)})(?:s?))\b",
    re.IGNORECASE,
)
DIGITS = re.compile(r"\d[\d,]*(?:\.\d+)?")

# ---- The closed list of reasons (FR-006) and the markers (R3) ----

REASONS = (
    "unbuilt",
    "retracted",
    "a recorded run's result",
    "a currency amount",
    "a moving count",
    "a statement about the Author that no corpus file holds",
    "a duplicate of",
    "contradicted by the repository",
    # FR-003's own rule as a reason (plan §9): a number the new prose may not state outside a slot.
    "a number outside a slot",
)
MARKERS = {
    "Not in the repository yet": "unbuilt",
    "Not built on main yet": "unbuilt",
    "didn't hold up": "retracted",
}
# The left-out reasons that answer a marker in a row carried in part.
ANSWERS = {
    "unbuilt": ("unbuilt",),
    "retracted": ("retracted", "a recorded run's result"),
}
SHOWN_AS_BUILT = "shown as built"
MARK = re.compile(r"^changed after his approval \(note, line \d+\)$")
TITLE_WORDS = 8
NONE = {"", "—", "-"}


def norm(text: str) -> str:
    return " ".join(text.split())


# ---- The scripts ----


@dataclass
class Sentence:
    text: str
    first: int
    last: int


@dataclass
class ScriptLine:
    n: int
    text: str
    notes: list[str] = field(default_factory=list)
    markers: set[str] = field(default_factory=set)
    about_you: bool = False


def _ends(text: str, k: int) -> bool:
    """A sentence ends here: at the end, or before whitespace and then a capital, an opening quote, or the end."""
    if k >= len(text):
        return True
    if not text[k].isspace():
        return False
    rest = text[k:].lstrip()
    return rest == "" or rest[0].isupper() or rest[0] == '"'


def split_sentences(text: str) -> list[Sentence]:
    """plan §3 R1's split: at `.`, `?`, `!`, or `...` before whitespace and a capital, a quote, or the end; never
    inside a quotation."""
    out: list[Sentence] = []
    start, i, quoted = 0, 0, False

    def close(end: int) -> None:
        nonlocal start
        raw = text[start:end]
        lead = len(raw) - len(raw.lstrip())
        if raw.strip():
            first = text.count("\n", 0, start + lead) + 1
            last = text.count("\n", 0, end) + 1
            out.append(Sentence(norm(raw), first, last))
        start = end

    while i < len(text):
        c = text[i]
        if c == '"':
            quoted = not quoted
            if not quoted and i > 0 and text[i - 1] in ".?!" and _ends(text, i + 1):
                close(i + 1)
        elif not quoted and c in ".?!":
            j = i
            while j + 1 < len(text) and text[j + 1] == ".":
                j += 1
            if _ends(text, j + 1):
                close(j + 1)
            i = j
        i += 1
    if text[start:].strip():
        close(len(text))
    return out


def file_lines(text: str, s: Sentence) -> str:
    """A sentence's non-blank file lines, as the table writes them: "file line 5", "file lines 5 and 7"."""
    lines = text.splitlines()
    ns = [n for n in range(s.first, s.last + 1) if lines[n - 1].strip()]
    if len(ns) == 1:
        return f"file line {ns[0]}"
    return f"file lines {', '.join(map(str, ns[:-1]))} and {ns[-1]}"


def read_scripts_md(text: str) -> dict[str, list[ScriptLine]]:
    """`SCRIPTS.md`'s sections, `§n`, each its numbered lines with their notes, markers, and "about you"."""
    sections: dict[str, list[ScriptLine]] = {}
    current: list[ScriptLine] | None = None
    for raw in text.splitlines():
        heading = re.match(r"^## (\d+)\. ", raw)
        if heading:
            current = sections.setdefault(f"§{heading.group(1)}", [])
            continue
        if raw.startswith("#"):
            current = None
            continue
        if current is None:
            continue
        numbered = re.match(r"^(\d+)\. (.*)$", raw)
        if numbered:
            current.append(ScriptLine(int(numbered.group(1)), norm(numbered.group(2))))
        elif raw[:1].isspace() and raw.strip() and current:
            line = current[-1]
            line.notes.append(raw.strip())
            for marker, kind in MARKERS.items():
                if marker in raw:
                    line.markers.add(kind)
            if "**about you**" in raw:
                line.about_you = True
    return sections


def film_dirs(text: str) -> dict[str, str]:
    """Each `SCRIPTS.md` section's film directory, from its heading's `films/<name>`."""
    out = {}
    for m in re.finditer(r"^## (\d+)\. .*?`(films/[\w-]+)`", text, re.MULTILINE):
        out[f"§{m.group(1)}"] = m.group(2)
    return out


def paths_in(cell: str) -> list[str]:
    """The repository paths a cell names in backticks, without their line numbers."""
    out = []
    for token in re.findall(r"`([^`]+)`", cell):
        path = token.split(":", 1)[0].strip()
        if "/" in path or re.search(r"\.[a-z]{1,5}$", path):
            out.append(path)
    return out


def read_materials(text: str) -> tuple[set[str], set[str]]:
    """`materials.md`'s source paths, and those of its rows noted "shown as built"."""
    listed: set[str] = set()
    shown: set[str] = set()
    for raw in text.splitlines():
        if not raw.startswith("|") or re.match(r"^\|\s*-", raw):
            continue
        cells = [c.strip() for c in raw.strip().strip("|").split("|")]
        if len(cells) < 2 or cells[0] == "What":
            continue
        paths = paths_in(cells[1])
        listed.update(paths)
        if len(cells) > 2 and SHOWN_AS_BUILT in cells[2]:
            shown.update(paths)
    return listed, shown


def normalised(path: str) -> str:
    """A cited path as one spelling: a leading `./` stripped, then `posixpath.normpath` (`a//b`, `a/./b`, `a/x/../b`)."""
    while path.startswith("./"):
        path = path[2:]
    return posixpath.normpath(path)


def in_root(root: Path, path: str) -> bool:
    """The path is in the repository: after normalising, it isn't absolute, doesn't start with `..`, and resolves
    (through any link) inside `root.resolve()`."""
    path = normalised(path)
    if posixpath.isabs(path) or path == ".." or path.startswith("../"):
        return False
    return (root / path).resolve().is_relative_to(root.resolve())


# The trees R5 never reads as a cited file's text: the films' own text (scripts, captions, notes, materials;
# rv-rework-022's F-1), and the agents' proposals, merge-request notes, specs, and intents (rv-rework3-022's B-4,
# page Q217). Each is the agents' writing about a source, not the source.
UNREAD = ("films", "corpus/proposals", "docs/merge-requests", "specs", "intent")
GLOB = "*?["


def unread(root: Path, path: str) -> bool:
    """A file under one of the trees R5 never reads (`UNREAD`), by its normalised spelling or, through a link, by
    where it resolves."""
    path = normalised(path)
    resolved = (root / path).resolve()
    return any(
        path == tree
        or path.startswith(tree + "/")
        or resolved.is_relative_to((root / tree).resolve())
        for tree in UNREAD
    )


def is_glob(path: str) -> bool:
    return any(ch in path for ch in GLOB)


def glob_inside(root: Path, path: str) -> bool:
    """A glob is in the repository only if something matches and every match resolves, through any link, inside the
    root (rv-rework3-022's B-7: `docs/out?ide.txt` matching only a link out, `docs/*` matching one among files)."""
    matches = list(root.glob(normalised(path)))
    inside = root.resolve()
    return bool(matches) and all(m.resolve().is_relative_to(inside) for m in matches)


def not_in_repository(root: Path, path: str) -> bool:
    """R1's test for every row's source: outside the root (`in_root`), or a glob not wholly inside (`glob_inside`)."""
    return not in_root(root, path) or (is_glob(path) and not glob_inside(root, path))


def exists(root: Path, path: str) -> bool:
    """The path names something in the repository: inside the root (`in_root`), and, for a glob, something matches
    and every match resolves inside it (`glob_inside`)."""
    if not_in_repository(root, path):
        return False
    return is_glob(path) or (root / normalised(path)).exists()


# ---- The proposal ----


@dataclass
class Row:
    n: int
    script: str
    line: str
    text: str
    status: str
    carried: str
    left: str
    corpus: str
    source: str
    tag: str
    mark: str
    label: str = ""
    key: tuple[str, int] | None = None


BLOCK = re.compile(
    r"^```(corpus-08-golden-5|corpus-08|facts)[ \t]*\n(.*?)^```[ \t]*$",
    re.MULTILINE | re.DOTALL,
)
COLUMNS = [
    "Script",
    "Line",
    "Script line",
    "Status",
    "Carried",
    "Left out",
    "Corpus line",
    "Source",
    "Tag",
    "Mark",
]


def blocks(text: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for m in BLOCK.finditer(text):
        out.setdefault(m.group(1), []).append(m.group(2))
    return out


def new_text_items(texts: Iterable[str]) -> dict[str, dict[int, str]]:
    """The new text's items by heading: bullets numbered from 1, Golden Q&A by their own numbers."""
    items: dict[str, dict[int, str]] = {}
    heading = ""
    for text in texts:
        for raw in text.splitlines():
            h = re.match(r"^##\s+(.*?)\s*$", raw)
            if h:
                heading = h.group(1)
                items.setdefault(heading, {})
                continue
            bucket = items.setdefault(heading, {})
            item = re.match(r"^(\d+)\.\s", raw.strip())
            if heading.lower() == "golden q&a" and item:
                bucket[int(item.group(1))] = raw
            elif re.match(r"^\s*[-*]\s", raw):
                bucket[len(bucket) + 1] = raw
    return items


def read_table(text: str) -> tuple[list[Row], list[str]]:
    rows: list[Row] = []
    problems: list[str] = []
    lines = text.splitlines()
    try:
        at = next(
            i for i, raw in enumerate(lines) if raw.startswith("| Script | Line |")
        )
    except StopIteration:
        return rows, [
            "R1: the proposal has no table (a header starting `| Script | Line |`)"
        ]
    header = [c.strip() for c in lines[at].strip().strip("|").split("|")]
    if header != COLUMNS:
        problems.append(f"R1: the table's columns are {header}, not {COLUMNS}")
        return rows, problems
    for i in range(at + 2, len(lines)):
        raw = lines[i]
        if not raw.startswith("|"):
            break
        cells = [c.strip() for c in raw.strip().strip("|").split("|")]
        if len(cells) != len(COLUMNS):
            problems.append(
                f"R1: table row at proposal line {i + 1} has {len(cells)} cells, not {len(COLUMNS)}"
            )
            continue
        rows.append(Row(i + 1, *cells))
    return rows, problems


@dataclass
class Context:
    root: Path
    sections: dict[str, list[ScriptLine]]
    ks_text: str
    ks: list[Sentence]
    materials: set[str]
    shown: set[str]
    scripts_paths: set[str]
    author_quotes: list[str]
    f3: str
    dirs: dict[str, str]
    slots: set[str]

    def scope(self) -> dict[str, int]:
        out = {key: len(lines) for key, lines in self.sections.items()}
        out[KS] = len(self.ks)
        return out


# His words as `SCRIPTS.md` quotes them: a fixed list, FR-005's Q6 quotes from that file, each with its file line
# (rv2-rework2-022's B-3, page Q213). A marker scan took a note's quote as his whenever the note named him ("Not in
# Hareet's words: …", "**about you**: …"); no scan reads them now. F3's words come from the disclosure. A test holds
# each quote verbatim on its line, after "In Hareet's words:"; a new quote of his is a change to this list.
HIS_WORDS: tuple[tuple[int, str], ...] = (
    (
        18,
        "we chose haiku since our context base is small and manually evaluated haiku and sonnet.",
    ),
)
# And his F3 words: the one sentence of row F3 of `docs/data-flow-disclosure.md` after its marker, on the same fixed
# list (rv-rework3-022's B-6). The rest of the row (the endpoints, the model and its version, Anthropic's terms, how
# long a flagged request is kept) is the disclosure's, not his promise, so R5 reads none of it, as his words or as a
# cited file. A test holds the sentence verbatim in the row, after the marker.
F3_WORDS: tuple[str, str] = (
    "Against my promise that a visitor's conversation isn't saved:",
    "this site saves none of it, and Anthropic may keep a turn it answered for up to 30 days, never for training.",
)
F3_ROW = "| F3 |"


def read_context(root: Path) -> Context:
    scripts_text = (root / SCRIPTS_MD).read_text()
    sections = read_scripts_md(scripts_text)
    ks_text = (root / KS_SCRIPT).read_text()
    materials, shown = read_materials((root / KS_MATERIALS).read_text())
    scripts_paths = {
        p
        for lines in sections.values()
        for line in lines
        for note in line.notes
        for p in paths_in(note)
    }
    author_quotes = [quote for _, quote in HIS_WORDS]
    f3 = F3_WORDS[1]
    slots: set[str] = set()
    facts = root / "corpus" / "facts"
    if facts.is_dir():
        for f in sorted(facts.glob("*.yaml")):
            slots.update(
                re.findall(r"^\s*-\s*id:\s*(\S+)", f.read_text(), re.MULTILINE)
            )
    return Context(
        root,
        sections,
        ks_text,
        split_sentences(ks_text),
        materials,
        shown,
        scripts_paths,
        author_quotes,
        f3,
        film_dirs(scripts_text),
        slots,
    )


# ---- R4's reading ----

# The corpus's claim tags and nothing else (rv-impl-022's I-2): [P], [?], [A], [A YYYY-MM-DD], runs of them such as
# [?][A], and a new slot's display form [slot `id`]; any other bracketed span is prose, and its numbers count.
_CLAIM_TAG = re.compile(
    r"`?(?:\[(?:P|\?|A(?: \d{4}-\d{2}-\d{2})?|slot `[a-z0-9_.-]+`)\])+`?"
)
_DATE = re.compile(r"\b\d{4}-\d{2}-\d{2}(?:/\d{1,2})?\b")
_LIST_NUMBER = re.compile(r"^\s*\d+\.\s", re.MULTILINE)
_SLOT = re.compile(r"\{\{slot:[^}]*\}\}")
_URL = re.compile(r"\bhttps?://\S+")
_CODE = re.compile(r"`([^`\n]*)`")
_BARE_PATH = re.compile(
    r"(?<![\w/])[\w.-]+(?:/[\w.*-]+)+/?|\b[\w-]+\.(?:md|ya?ml|ts|py|json|txt|sh)\b"
)
_PATHLIKE = re.compile(r"/|\.[a-z]{1,5}$")
_QUOTE = re.compile(r'"([^"\n]+)"|“([^”\n]+)”')


_PUNCTUATION = ".,;:!?"  # a sentence's punctuation around a segment isn't the segment's


def _numeric(segment: str) -> bool:
    """A segment that is a number: a digit and no letter or underscore (`100`, `2026-11-13`, `267-299`), or one of
    G1's number words (`twelve`, `fifty-two`)."""
    segment = segment.strip(_PUNCTUATION)
    digits = bool(re.search(r"\d", segment)) and not re.search(r"[A-Za-z_]", segment)
    return digits or bool(WORD.fullmatch(segment))


def _holds_number(text: str) -> bool:
    """A digit or one of G1's number words anywhere in the text, its dates aside (a search, not a fullmatch:
    `100k`, `five-dollars`, `twelve-hundred`, `day/100-requests`; rv2-rework2-022's B-1)."""
    text = _DATE.sub(" ", text)
    return bool(re.search(r"\d", text) or WORD.search(text))


_LINE_SUFFIX = re.compile(
    r":\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$"
)  # `redteam/run.py:267-299`
_EXTENSION = re.compile(r"\.[a-z]{1,5}$")


def _top_level(root: Path) -> set[str]:
    return {p.name for p in root.iterdir()} if root.is_dir() else set()


def found_under(root: Path, path: str) -> bool:
    """The path, inside the root, names something at the root or under one of its top-level directories (the real
    proposal cites `05-mission.md`, which is `corpus/05-mission.md`)."""
    if not in_root(root, path):
        return False
    if exists(root, path):
        return True
    return any(
        (root / top).is_dir()
        and in_root(root, f"{top}/{path}")
        and exists(root, f"{top}/{path}")
        for top in _top_level(root)
    )


def is_path(token: str, root: Path | None = None) -> bool:
    """A path has no whitespace and no segment that is a number, but a date `_DATE` takes: `52/52`, `100/day`,
    `52/run`, `twelve/hour`, and `fifty-two of fifty-two passed/run` aren't paths (rv-impl-022's I-2, rv-rework-022's
    F-2). And it is read against the root (rv2-rework2-022's B-1): it is found under the root, or its first segment
    is a top-level entry of the root; and if it holds a number (a digit or one of G1's words, outside a date), it is
    found, or it is a file name with an extension in a directory the root holds. So `5k/day`, `day/100-requests`,
    `docs/100-per-day`, and `100-per-day.md` aren't paths; `docs/adr/0020-x.md`, `history/2026-11-09/run.json`, and
    `films/kill-switch-b2/` are. A `:<line>` suffix is `_code`'s to read, not this function's (B-5)."""
    root = REPO if root is None else root
    if re.search(r"\s", token):
        return False
    bare = normalised(token.rstrip("/") or token)
    segments = bare.split("/")
    if any(
        _numeric(s) and not _DATE.fullmatch(s.strip(_PUNCTUATION)) for s in segments
    ):
        return False
    if not in_root(root, bare):
        return False
    if found_under(root, bare):
        return True
    if segments[0] not in _top_level(root):
        return False
    if not _holds_number(bare):
        return True
    parent = "/".join(segments[:-1])
    return bool(
        parent and _EXTENSION.search(segments[-1]) and (root / parent).is_dir()
    ) and in_root(root, parent)


def file_of(root: Path, path: str) -> Path | None:
    """The file a path names in the repository: itself, or under one of the root's top-level directories (as
    `found_under` reads `05-mission.md`); none for a glob, a directory, a missing file, or a path outside."""
    path = normalised(path)
    if is_glob(path) or not in_root(root, path):
        return None
    for candidate in [path, *(f"{top}/{path}" for top in sorted(_top_level(root)))]:
        if in_root(root, candidate) and (root / candidate).is_file():
            return root / candidate
    return None


def lines_within(root: Path, path: str, suffix: str) -> bool:
    """A `:<n>`, `:<a>-<b>`, or `:<n>,<a>-<b>` suffix names lines the path's file holds: each from 1 to its line
    count, each range forwards (rv-rework3-022's B-5)."""
    file = file_of(root, path)
    if file is None:
        return False
    count = len(file.read_text(errors="replace").splitlines())
    for part in suffix.lstrip(":").split(","):
        first, _, last = part.partition("-")
        if not 1 <= int(first) <= int(last or first) <= count:
            return False
    return True


def _code(token: str, root: Path) -> str:
    """A backticked token, with R4's exempt spans blanked: a setting, or a path; and a path's `:<line>` suffix only
    when its file holds every line it names. Otherwise the suffix's numbers count (rv-rework3-022's B-5)."""
    if _assignment(token):
        return " "
    suffix = _LINE_SUFFIX.search(token)
    path = token[: suffix.start()] if suffix else token
    if not (path and _PATHLIKE.search(path) and is_path(path, root)):
        return token
    if suffix and not lines_within(root, path, suffix.group(0)):
        # Each line number on its own (`DIGITS` would read `5,9000` as one).
        return " " + suffix.group(0).replace(",", " ")
    return " "


def _assignment(token: str) -> bool:
    """`ENV=prod`, `COMPOSE_PROFILES=gpu`: a setting whose value holds no digit and no G1 word anywhere
    (`DAILY_CAP=100`, `CAP=100k`, `CAP=five-dollars`, and `LIMIT=per-100` state one; rv2-rework2-022's B-1)."""
    m = re.fullmatch(r"[A-Z_]+=([\w-]+)", token)
    return bool(m) and not (re.search(r"\d", m.group(1)) or WORD.search(m.group(1)))


def without_exempt(text: str, quotes: Iterable[str], root: Path | None = None) -> str:
    """The text with plan §3 R4's exempt spans blanked: slots, URLs, claim tags, paths (read against the root),
    dates, a list item's leading number, and the quotes R5 accepts."""
    root = REPO if root is None else root
    for q in quotes:
        text = text.replace(f'"{q}"', " ").replace(f"“{q}”", " ")
    text = _SLOT.sub(" ", text)
    text = _URL.sub(" ", text)
    text = _CLAIM_TAG.sub(" ", text)
    text = _CODE.sub(lambda m: _code(m.group(1), root), text)
    text = _BARE_PATH.sub(
        lambda m: " " if is_path(m.group(0), root) else m.group(0), text
    )
    text = _DATE.sub(" ", text)
    return _LIST_NUMBER.sub(" ", text)


def numbers_in(text: str) -> list[str]:
    """Every number a text states, as G1 reads them: digit runs and its number words, in order."""
    found = [(m.start(), m.group(0)) for m in DIGITS.finditer(text)]
    found += [(m.start(), m.group(0).lower()) for m in WORD.finditer(text)]
    return [t for _, t in sorted(found)]


def currency_in(text: str) -> list[str]:
    return [
        m.group(0) for p in (CURRENCY, AMOUNT_WORDS, EXTRA) for m in p.finditer(text)
    ]


# ---- The check ----


def _reason_problem(ctx: Context, label: str, reason: str) -> str | None:
    key = next((r for r in REASONS if reason.startswith(r)), None)
    if key is None:
        return f"R2: {label}: reason {reason!r} isn't in the closed list"
    if key == "contradicted by the repository":
        paths = paths_in(reason)
        if not paths or not all(exists(ctx.root, p) for p in paths):
            return f"R2: {label}: 'contradicted by the repository' must name the file that contradicts it"
    if key == "a duplicate of":
        names = re.findall(r"`(\d\d-[\w-]+\.md)`", reason)
        corpus = ctx.root / "corpus"
        if not names or (
            corpus.is_dir() and not all((corpus / n).exists() for n in names)
        ):
            return (
                f"R2: {label}: 'a duplicate of' must name the corpus file it duplicates"
            )
    return None


def _left_items(cell: str) -> list[tuple[str | None, str]]:
    """A Left out cell: the whole line's reason, or `“span” → reason` items separated by <br>."""
    if not cell.startswith("“"):
        return [(None, cell)]
    out: list[tuple[str | None, str]] = []
    for part in cell.split("<br>"):
        m = re.match(r"^\s*“(.+?)”\s*→\s*(.+?)\s*$", part)
        out.append((m.group(1), m.group(2)) if m else ("", part.strip()))
    return out


def cited_text(root: Path, path: str) -> str:
    """A cited file's text as R5 reads it; for the disclosure, by whatever spelling or link reaches it, without row
    F3, whose one sentence of his words R5 reads from `F3_WORDS` (rv-rework3-022's B-6)."""
    file = root / path
    text = file.read_text()
    if file.resolve() == (root / DISCLOSURE).resolve():
        text = "\n".join(raw for raw in text.splitlines() if not raw.startswith(F3_ROW))
    return norm(text)


def check(
    proposal: Path,
    root: Path = REPO,
    rules: Iterable[str] | None = None,
    third_party: bool = False,
) -> list[str]:
    active = set(rules) if rules is not None else set(RULES)
    ctx = read_context(root)
    text = proposal.read_text()
    found = blocks(text)
    prose = found.get("corpus-08", []) + found.get("corpus-08-golden-5", [])
    items = new_text_items(found.get("corpus-08", []))
    if found.get("corpus-08-golden-5"):
        items.setdefault("Golden Q&A", {})[5] = "\n".join(found["corpus-08-golden-5"])
    rows, problems = read_table(text)
    out: dict[str, list[str]] = {r: [] for r in RULES}
    for p in problems:
        out[p[:2]].append(p)

    # ---- R1 and R2, row by row; R3 beside them ----
    seen: dict[tuple[str, int], int] = {}
    # The carried and in-part rows' sources: the only cited files R5 reads (B-4).
    read: set[str] = set()
    for row in rows:
        status = row.status
        if row.script == KS:
            m = re.match(r"^S(\d+) \((file lines? [\d, and]+)\)$", row.line)
            row.label = f"{KS} {row.line.split(' ', 1)[0]}"
            if not m:
                out["R1"].append(
                    f"R1: {row.label}: its line isn't `S<n> (file line <n>)`"
                )
                continue
            n = int(m.group(1))
            if not 1 <= n <= len(ctx.ks):
                out["R1"].append(f"R1: {row.label}: {KS_SCRIPT} has no sentence {n}")
                continue
            sentence = ctx.ks[n - 1]
            script_text, row.key = sentence.text, (KS, n)
            want = file_lines(ctx.ks_text, sentence)
            if m.group(2) != want:
                out["R1"].append(
                    f"R1: {row.label}: the sentence is at {want}, the table says {m.group(2)}"
                )
            about_you, markers = False, set()
        elif row.script in ctx.sections:
            row.label = f"{row.script} line {row.line}"
            line = next(
                (x for x in ctx.sections[row.script] if str(x.n) == row.line), None
            )
            if line is None:
                out["R1"].append(f"R1: {row.label}: {SCRIPTS_MD} has no such line")
                continue
            script_text, row.key = line.text, (row.script, line.n)
            about_you, markers = line.about_you, line.markers
        else:
            out["R1"].append(
                f"R1: table row at proposal line {row.n}: unknown script {row.script}"
            )
            continue
        seen[row.key] = seen.get(row.key, 0) + 1
        where = KS_SCRIPT if row.script == KS else SCRIPTS_MD
        if norm(row.text) != script_text:
            out["R1"].append(
                f"R1: {row.label}: the script line isn't verbatim in {where}: {script_text!r}"
            )
        sources = paths_in(row.source)
        carrying = status in ("carried", "in part")
        if carrying:
            read.update(sources)
        if not sources:
            out["R1"].append(f"R1: {row.label}: no repository source")
        # A path outside the repository is no repository source, whatever the row's status (rv2-rework2-022's B-2),
        # and nor is a glob that matches nothing or has a match outside (rv-rework3-022's B-7).
        outside = [p for p in sources if not_in_repository(root, p)]
        for path in outside:
            why = (
                "a glob: nothing inside matches, or a match resolves outside the root"
                if in_root(root, path)
                else "it resolves outside the root"
            )
            out["R1"].append(
                f"R1: {row.label}: source `{path}` isn't in the repository ({why})"
            )
        for path in sources if carrying else ():
            if path in outside:
                continue
            if not exists(root, path):
                out["R1"].append(
                    f"R1: {row.label}: source `{path}` isn't in the repository"
                )
            if (
                row.script == KS
                and path not in ctx.materials
                and path not in ctx.scripts_paths
            ):
                out["R1"].append(
                    f"R1: {row.label}: source `{path}` is one neither materials.md nor SCRIPTS.md lists"
                )
        refs = [] if row.corpus in NONE else [r.strip() for r in row.corpus.split(";")]
        targets = []
        for ref in refs:
            m = re.match(r"^(.+?) #(\d+)$", ref)
            target = items.get(m.group(1), {}).get(int(m.group(2))) if m else None
            if target is None:
                out["R1"].append(
                    f"R1: {row.label}: corpus line {ref!r} isn't in the new text"
                )
            else:
                targets.append((ref, target))
        if carrying:
            for tag in re.findall(r"\[[^\]]+\]", row.tag):
                if targets and not any(tag in target for _, target in targets):
                    out["R1"].append(
                        f"R1: {row.label}: tag {tag} isn't on {'; '.join(r for r, _ in targets)}"
                    )
        if row.mark not in NONE and not MARK.match(row.mark):
            out["R1"].append(
                f"R1: {row.label}: its mark isn't 'changed after his approval (note, line <n>)'"
            )

        # R2: status, spans, reasons.
        reasons: list[str] = []
        if status not in ("carried", "in part", "left out"):
            out["R2"].append(
                f"R2: {row.label}: status {status!r} isn't carried, in part, or left out"
            )
            continue
        if carrying and not refs:
            out["R2"].append(f"R2: {row.label}: {status}, but it names no corpus line")
        if status == "carried" and row.left not in NONE:
            out["R2"].append(
                f"R2: {row.label}: carried whole, but its Left out cell isn't empty"
            )
        if status == "in part":
            spans = re.findall(r"“([^”]+)”", row.carried)
            if not spans:
                out["R2"].append(f"R2: {row.label}: in part, but no carried span")
            for span in spans:
                if norm(span) not in script_text:
                    out["R2"].append(
                        f"R2: {row.label}: carried span “{span}” isn't in the line"
                    )
        if status in ("in part", "left out"):
            left = _left_items(row.left)
            if status == "in part" and any(span is None for span, _ in left):
                out["R2"].append(
                    f"R2: {row.label}: in part, but its Left out cell names no span"
                )
            for span, reason in left:
                if span is not None and (span == "" or norm(span) not in script_text):
                    out["R2"].append(
                        f"R2: {row.label}: left-out span “{span}” isn't in the line"
                    )
                problem = _reason_problem(ctx, row.label, reason)
                if problem:
                    out["R2"].append(problem)
                reasons.append(reason)
        if about_you and carrying and "[A " not in row.tag:
            out["R2"].append(
                f"R2: {row.label}: an about you line carried without the Author's tag [A <date>]"
            )

        # R3: markers and "shown as built".
        for kind in sorted(markers):
            if status == "carried" or (
                status == "in part"
                and not any(r.startswith(ANSWERS[kind]) for r in reasons)
            ):
                out["R3"].append(
                    f"R3: {row.label}: {status}, but {SCRIPTS_MD} marks it {kind}"
                )
        if row.script == KS and carrying:
            for path in sources:
                if path in ctx.shown:
                    out["R3"].append(
                        f"R3: {row.label}: cites `{path}`, which materials.md notes was shown as built"
                    )

    for key, count in seen.items():
        if count > 1:
            label = f"{KS} S{key[1]}" if key[0] == KS else f"{key[0]} line {key[1]}"
            out["R2"].append(f"R2: {label}: in the table {count} times")
    for key, total in ctx.scope().items():
        numbers = range(1, total + 1) if key == KS else [x.n for x in ctx.sections[key]]
        for n in numbers:
            if (key, n) not in seen:
                label = f"{KS} S{n}" if key == KS else f"{key} line {n}"
                out["R2"].append(f"R2: {label}: not in the table")

    # ---- R5: quotes in the new text ----
    # R5 reads only the carried and in-part rows' sources (a left-out row's source backs nothing the new text says),
    # and of those, no glob, no path outside the repository (rv2-rework2-022's B-2), not the proposal being checked
    # (it holds every quote it makes), and no file under `UNREAD`'s trees, however its path is spelled and wherever a
    # link leads (rv-rework3-022's B-4, Q217). The films' files are the agents' text: a row may cite
    # `films/SCRIPTS.md` (§1 line 5 does, for his words), but a quote from it stands only as his words (HIS_WORDS).
    here = proposal.resolve()
    cited_texts = [
        cited_text(root, p)
        for p in sorted({normalised(c) for c in read})
        if not is_glob(p)
        and in_root(root, p)
        and (root / p).is_file()
        and (root / p).resolve() != here
        and not unread(root, p)
    ]
    accepted: list[str] = []
    for block in prose:
        for m in _QUOTE.finditer(block):
            q = m.group(1) or m.group(2)
            nq = norm(q)
            if (
                any(nq in a for a in ctx.author_quotes)
                or (ctx.f3 and nq in ctx.f3)
                or any(nq in t for t in cited_texts)
            ):
                accepted.append(q)
            else:
                out["R5"].append(
                    f"R5: new text: the quote “{q}” is neither the Author's words nor a cited file's text"
                )

    # ---- R4: numbers, money, slots ----
    new_slots = {
        s
        for block in found.get("facts", [])
        for s in re.findall(r"^\s*-\s*id:\s*(\S+)", block, re.MULTILINE)
    }
    heading = ""
    for block in prose:
        for raw in block.splitlines():
            h = re.match(r"^##\s+(.*?)\s*$", raw)
            if h:
                heading = h.group(1)
            for slot in re.findall(r"\{\{slot:\s*([a-z0-9_.-]+)", raw):
                if slot in new_slots and slot not in ctx.slots:
                    out["R4"].append(
                        f"R4: new text, {heading!r}: {slot} is a new slot; write it [slot `{slot}`] until the patch "
                        "adds it, since corpus-check reads proposals/ and fails a {{slot:…}} whose fact doesn't exist"
                    )
                elif slot not in ctx.slots:
                    out["R4"].append(f"R4: new text, {heading!r}: unknown slot {slot}")
            for slot in re.findall(r"\[slot `([a-z0-9_.-]+)`\]", raw):
                if slot not in ctx.slots and slot not in new_slots:
                    out["R4"].append(f"R4: new text, {heading!r}: unknown slot {slot}")
            plain = without_exempt(raw, accepted, root)
            for amount in currency_in(plain):
                out["R4"].append(
                    f"R4: new text, {heading!r}: a currency amount: {amount!r}"
                )
            for number in numbers_in(plain):
                out["R4"].append(
                    f"R4: new text, {heading!r}: a number outside a slot: {number!r}"
                )
    for i, raw in enumerate(text.splitlines(), 1):
        m = CURRENCY.search(raw)
        if m:
            out["R4"].append(
                f"R4: proposal line {i}: a currency amount in digits, {m.group(0)!r} (corpus-check reads proposals/)"
            )

    # ---- R6: third-party text ----
    if third_party:
        pool = [
            norm((root / SCRIPTS_MD).read_text()),
            norm(ctx.ks_text),
            norm((root / KS_MATERIALS).read_text()),
            ctx.f3,
        ]
        pool += [
            norm(p.read_text()) for p in sorted((root / "films").glob("*/script.txt"))
        ]
        pool += (
            [norm(p.read_text()) for p in sorted((root / "corpus").glob("*.md"))]
            if (root / "corpus").is_dir()
            else []
        )
        pool += cited_texts
        outside = BLOCK.sub(lambda m: m.group(0) if m.group(1) != "facts" else "", text)
        for m in _QUOTE.finditer(outside):
            q = norm(m.group(1) or m.group(2))
            if len(q.split()) > TITLE_WORDS and not any(q in t for t in pool):
                out["R6"].append(
                    f"R6: the quote “{q}” is longer than a title and the repository doesn't hold it"
                )

    return [p for r in RULES if r in active for p in out[r]]


def summary(root: Path, problems: list[str], rows: int) -> str:
    ctx = read_context(root)
    scope = ctx.scope()
    total = sum(scope.values())
    agree = held = 0
    for key, lines in ctx.sections.items():
        film = ctx.dirs.get(key)
        path = root / film / "script.txt" if film else None
        if path and path.is_file():
            spoken = norm(path.read_text())
            held += len(lines)
            agree += sum(1 for x in lines if x.text in spoken)
    parts = ", ".join(f"{k} {v}" for k, v in scope.items())
    verdict = "FAIL" if problems else "OK"
    return (
        f"film-claims: {verdict} — {len(problems)} problems, {rows} rows, {total} lines in scope ({parts}); "
        f"the films' script.txt holds {agree} of {held} SCRIPTS.md lines verbatim; "
        "the denylist was not applied (this checker never reads corpus/intake/private/)"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("proposal", type=Path)
    parser.add_argument("--root", type=Path, default=REPO)
    parser.add_argument(
        "--rules", default=",".join(RULES), help="comma-separated, e.g. R1,R2,R3"
    )
    parser.add_argument("--third-party", action="store_true")
    args = parser.parse_args(argv)
    rules = {r.strip() for r in args.rules.split(",") if r.strip()}
    problems = check(
        args.proposal, root=args.root, rules=rules, third_party=args.third_party
    )
    for p in problems:
        print(p)
    print(summary(args.root, problems, len(read_table(args.proposal.read_text())[0])))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
