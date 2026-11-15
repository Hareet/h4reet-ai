#!/usr/bin/env python3
"""The dog-intro proposal's checker (spec 026, FR-017 to FR-023, SC-005's first half; plan.md R-13).

Read-only, deterministic, standard library only. Two modes:

- ``proposal FILE``: every quoted span in the proposal's source table (a Markdown table whose header names "His words"
  and "Source") is found verbatim in the file its Source cell names first, in backticks: a repository path, or
  ``main:<path>``, read from main (``git show main:<path>``, or ``--main-dir`` for a copy). A span from
  ``assets/policy/approvals.json`` is found in an approval's ``disclosure_line``. It reports whether the patch is
  buildable: only once ``approvals.json`` holds an approval of the dog's model with a non-empty line (FR-019).
- ``patch FILE [--page PAGE --entry QID]``: the patch the Author applies. It refuses: a touched path that is human-only
  (``config/twin-readiness.yaml``, ``.claude/**``, ``CLAUDE.md``, ``REVIEW.md``, the constitution, ``tools/gates/**``,
  ``evals/agent-config/**``, ``redteam/forbidden-actions.sh``, ``assets/**``) or in ``corpus/`` other than
  ``04-hobbies-and-travel.md`` and ``facts/hobbies-and-travel.yaml``; the slot ``hobbies.room_dog_name`` missing or with
  a field other than null (FR-018); a ``<his answer>`` or ``<his disclosure line>`` placeholder; a Golden Q&A 9 whose
  answer is empty or holds no word, or isn't found verbatim inside a quotation on an "Answered:" line of the page's
  entry QID, a line holding ``RECOMMENDED``'s match never counting: "re", one or more "c", "o", one or more "m",
  "end", in any case (Recommended, as recommended, recomended, reccommended, the recommendation); other misspellings
  (recommeded, recommanded), a hyphen or an invisible character inside the word, and look-alike letters of other
  scripts or fullwidth forms aren't caught, a deviation the stack note's Backlog holds (FR-020; Q143; rule 11); any
  numbered item the patch adds to ``04`` that isn't Golden Q&A 9 in its one form; a digit the patch adds to ``04``
  outside a ``{{slot:…}}``, a claim tag's date, Golden Q&A 9's leading ``9``, or a quotation that is the dog's
  approval's ``disclosure_line`` whole or lies inside his consent's own sentence in main's spec 017, line 48 (N-2;
  rv-impl-026's B-1); and the patch while the approval isn't there (FR-019).

In proposal mode too, a span named from ``approvals.json`` is looked up in the dog's approval's line only, and one named
from main's spec 017 in his consent's own sentence only: the rest of either file isn't his words for this proposal.

It never reads ``corpus/intake/private/``. Exit 0 with "OK" when nothing is refused, 1 otherwise, 2 on a usage error.
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_ROOT = Path(__file__).resolve().parents[2]
CORPUS_04 = "corpus/04-hobbies-and-travel.md"
FACTS_04 = "corpus/facts/hobbies-and-travel.yaml"
APPROVALS = "assets/policy/approvals.json"
CONSENT_SOURCE = "main:specs/017-the-night-shift/spec.md"
#: His consent, in his words (spec FR-019); its own sentence in CONSENT_SOURCE is the one part of that file a span may
#: come from.
CONSENT = "it's okay that we use the likeness of my dog"
DOG_MODEL = "assets/visitors/dog/dog.glb"
SLOT_ID = "hobbies.room_dog_name"
SLOT_FIELDS = ("value", "tag", "source", "public_safe")
PRIVATE = "corpus/intake/private/"

HUMAN_ONLY = (
    re.compile(r"^config/twin-readiness\.yaml$"),
    re.compile(r"^\.claude/"),
    re.compile(r"^CLAUDE\.md$"),
    re.compile(r"^REVIEW\.md$"),
    re.compile(r"^\.specify/memory/constitution\.md$"),
    re.compile(r"^tools/gates/"),
    re.compile(r"^evals/agent-config/"),
    re.compile(r"^redteam/forbidden-actions\.sh$"),
    re.compile(r"^assets/"),
)
CORPUS_ALLOWED = (CORPUS_04, FACTS_04)
PLACEHOLDERS = ("<his answer>", "<his disclosure line>")
QUOTED = re.compile(r'"([^"\n]+)"')
SLOT = re.compile(r"\{\{slot:[a-z0-9_.]+\}\}")
CLAIM_TAG = re.compile(r"`\[[A-Z]+ \d{4}-\d{2}-\d{2}\]`")
#: Golden Q&A 9's leading number, the one lead the digit rule exempts (FR-023: "9.").
GOLDEN_LEAD = re.compile(r"^9(?=\.\s)")
GOLDEN_9 = re.compile(r"^9\.\s+\*(?P<q>[^*]+)\*\s+—\s+(?P<a>.*?)\s*(?:\[[A-Z]+\]\s*)*$")
#: Any numbered item, in any form: each one the patch adds to `04` must be Golden Q&A 9 in GOLDEN_9's form.
NUMBERED = re.compile(r"^\s*\d+\s*[.)]")
#: An "Answered:" line, in any case, bold or listed.
ANSWERED = re.compile(r"^(?:[-*+]\s+)?(?:\*\*|__)?answered\s*:", re.IGNORECASE)
#: "recommend" in any case, its "c" and "m" doubled or not: recommend, Recommended, recomended, reccommended, the
#: recommendation. Not other misspellings, a hyphen or an invisible character inside the word, or look-alike letters
#: (the stack note's Backlog, B-2).
RECOMMENDED = re.compile(r"rec+om+end", re.IGNORECASE)
#: A sentence's end inside a line: its stop (an ellipsis too), a closing quote, then a space.
SENTENCE_END = re.compile(r"[.!?]+[\"”]?\s+")
WORD = re.compile(r"\w")
DIGIT = re.compile(r"\d")


class Refused(Exception):
    """A source the checker won't read."""


@dataclass
class Sources:
    """The files the checker reads: the repository's, main's, and the approvals, never the private intake."""

    root: Path
    main_dir: Path | None = None
    main_ref: str = "main"
    _cache: dict[str, str | None] = field(default_factory=dict)

    def read(self, name: str) -> str | None:
        if name in self._cache:
            return self._cache[name]
        path = name.removeprefix("main:")
        if path.startswith(PRIVATE) or "/../" in f"/{path}/":
            raise Refused(
                f"{name}: the private intake (or a path outside the repository) is never read"
            )
        text: str | None
        if name.startswith("main:"):
            text = self._main(path)
        else:
            file = self.root / path
            text = file.read_text(encoding="utf-8") if file.is_file() else None
        self._cache[name] = text
        return text

    def _main(self, path: str) -> str | None:
        if self.main_dir is not None:
            file = self.main_dir / path
            return file.read_text(encoding="utf-8") if file.is_file() else None
        r = subprocess.run(
            ["git", "-C", str(self.root), "show", f"{self.main_ref}:{path}"],
            capture_output=True,
            text=True,
            check=False,
        )
        return r.stdout if r.returncode == 0 else None

    def dog_lines(self) -> list[str]:
        """The non-empty `disclosure_line` of each approval of the dog's model: no other approval's line (B-1)."""
        return [
            a["disclosure_line"]
            for a in self._approvals()
            if a.get("path_when_approved") == DOG_MODEL
            and isinstance(a.get("disclosure_line"), str)
            and a["disclosure_line"].strip()
        ]

    def consent_sentence(self) -> str | None:
        """His consent's own sentence in main's spec 017 (line 48, his order): from the stop before CONSENT to the stop
        after it, within its line. None where the file or the consent isn't there. The rest of the file is the spec's
        words, not his (B-1)."""
        text = self.read(CONSENT_SOURCE)
        if text is None:
            return None
        at = text.find(CONSENT)
        if at < 0:
            return None
        line_start = text.rfind("\n", 0, at) + 1
        line_end = text.find("\n", at)
        if line_end < 0:
            line_end = len(text)
        starts = [m.end() for m in SENTENCE_END.finditer(text, line_start, at)]
        start = starts[-1] if starts else line_start
        stop = re.compile(r"[.!?]").search(text, at + len(CONSENT), line_end)
        return text[start : stop.end() if stop else line_end]

    def dog_approved(self) -> bool:
        """An approval of the dog's model with a non-empty line (FR-019)."""
        return bool(self.dog_lines())

    def _approvals(self) -> list[dict]:
        text = self.read(APPROVALS)
        if text is None:
            return []
        try:
            body = json.loads(text)
        except json.JSONDecodeError:
            return []
        approvals = body.get("approvals") if isinstance(body, dict) else None
        return (
            [a for a in approvals if isinstance(a, dict)]
            if isinstance(approvals, list)
            else []
        )

    def found(self, span: str, name: str) -> bool:
        """`span` verbatim in the source `name`: the dog's approval's line for approvals.json, his consent's own
        sentence for main's spec 017, else the file's text (B-1)."""
        if name == APPROVALS:
            return any(span in line for line in self.dog_lines())
        if name == CONSENT_SOURCE:
            sentence = self.consent_sentence()
            return sentence is not None and span in sentence
        text = self.read(name)
        return text is not None and span in text


# The proposal ---------------------------------------------------------------------------------------------------------


def _cells(row: str) -> list[str]:
    return [c.strip() for c in row.strip().strip("|").split("|")]


def source_rows(text: str) -> list[tuple[str, str]]:
    """The source table's (his words, source) cells, each data row of each table whose header names both."""
    rows: list[tuple[str, str]] = []
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        head = lines[i]
        if (
            head.lstrip().startswith("|")
            and i + 1 < len(lines)
            and re.match(r"^\s*\|[\s:|-]+\|\s*$", lines[i + 1])
        ):
            names = [c.lower() for c in _cells(head)]
            words = next((k for k, n in enumerate(names) if n == "his words"), None)
            source = next((k for k, n in enumerate(names) if n == "source"), None)
            i += 2
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                cells = _cells(lines[i])
                if (
                    words is not None
                    and source is not None
                    and max(words, source) < len(cells)
                ):
                    rows.append((cells[words], cells[source]))
                i += 1
            continue
        i += 1
    return rows


def check_proposal(text: str, sources: Sources) -> list[str]:
    problems: list[str] = []
    for words, source in source_rows(text):
        spans = QUOTED.findall(words)
        if not spans:
            continue
        named = re.search(r"`([^`]+)`", source)
        if not named:
            problems.append(f'the span "{spans[0]}" names no source in backticks')
            continue
        name = named.group(1)
        for span in spans:
            try:
                ok = sources.found(span, name)
            except Refused as why:
                problems.append(str(why))
                break
            if not ok:
                where = {
                    APPROVALS: " (the dog's approval's disclosure_line)",
                    CONSENT_SOURCE: " (his consent's own sentence, line 48)",
                }.get(name, "")
                problems.append(
                    f'the span "{span}" is not found verbatim in {name}{where}'
                )
    return problems


# The patch ------------------------------------------------------------------------------------------------------------


@dataclass
class FileDiff:
    path: str
    added: list[str] = field(default_factory=list)
    #: Each added line with the removed line it replaces, or None for a line the patch adds whole.
    pairs: list[tuple[str, str | None]] = field(default_factory=list)


def parse_patch(text: str) -> list[FileDiff]:
    files: list[FileDiff] = []
    current: FileDiff | None = None
    removed: list[str] = []
    paired = 0

    def flush() -> None:
        nonlocal removed, paired
        removed = []
        paired = 0

    old_path: str | None = None
    for line in text.splitlines():
        if line.startswith("diff --git "):
            flush()
            current = None
            old_path = None
            continue
        if line.startswith("--- "):
            flush()
            old = line[4:].strip()
            old_path = old[2:] if old.startswith("a/") else None
            continue
        if line.startswith("+++ "):
            flush()
            new = line[4:].strip()
            path = new[2:] if new.startswith("b/") else old_path
            current = FileDiff(path or "")
            files.append(current)
            continue
        if current is None:
            continue
        if line.startswith("@@"):
            flush()
        elif line.startswith("-"):
            if paired:
                flush()
            removed.append(line[1:])
        elif line.startswith("+"):
            body = line[1:]
            current.added.append(body)
            current.pairs.append(
                (body, removed[paired] if paired < len(removed) else None)
            )
            paired += 1
        else:
            flush()
    return files


def _mask(line: str, spans: list[tuple[int, int]]) -> list[bool]:
    marks = [False] * len(line)
    for a, b in spans:
        for k in range(a, b):
            marks[k] = True
    return marks


def _new_positions(new: str, old: str | None) -> list[bool]:
    if old is None:
        return [True] * len(new)
    marks = [True] * len(new)
    for block in difflib.SequenceMatcher(
        None, old, new, autojunk=False
    ).get_matching_blocks():
        for k in range(block.b, block.b + block.size):
            marks[k] = False
    return marks


def digit_problems(diff: FileDiff, sources: Sources) -> list[str]:
    """A digit the patch adds outside an exemption (FR-023, N-2). A quotation exempts its digits only where it is the
    dog's approval's line whole, or lies inside his consent's own sentence: not another approval's line, not the rest
    of spec 017, and not a bare fragment such as "4" of the dog's line (rv-impl-026's B-1)."""
    dog = [line.strip() for line in sources.dog_lines()]
    consent = sources.consent_sentence()
    problems: list[str] = []
    for new, old in diff.pairs:
        spans = [m.span() for m in SLOT.finditer(new)] + [
            m.span() for m in CLAIM_TAG.finditer(new)
        ]
        lead = GOLDEN_LEAD.match(new)
        if lead:
            spans.append(lead.span())
        for m in QUOTED.finditer(new):
            span = m.group(1)
            if span.strip() in dog or (consent is not None and span in consent):
                spans.append(m.span())
        exempt = _mask(new, spans)
        fresh = _new_positions(new, old)
        for m in DIGIT.finditer(new):
            k = m.start()
            if fresh[k] and not exempt[k]:
                problems.append(
                    f'{diff.path}: a digit the patch adds outside a slot, a tag, or a sourced quotation: "{new.strip()[:120]}"'
                )
                break
    return problems


def slot_problems(files: list[FileDiff]) -> list[str]:
    facts = next((f for f in files if f.path == FACTS_04), None)
    lines = facts.added if facts else []
    start = next(
        (
            k
            for k, line in enumerate(lines)
            if re.match(rf"^\s*-\s+id:\s*{re.escape(SLOT_ID)}\s*$", line)
        ),
        None,
    )
    if start is None:
        return [f"{FACTS_04}: the slot {SLOT_ID} is missing from the patch (FR-018)"]
    values: dict[str, str] = {}
    for line in lines[start + 1 :]:
        if re.match(r"^\s*-\s+id:", line):
            break
        m = re.match(r"^\s+([a-z_]+):\s*(.*?)\s*$", line)
        if m:
            values[m.group(1)] = m.group(2)
    filled = [k for k in SLOT_FIELDS if values.get(k, "null") not in ("null", "~", "")]
    missing = [k for k in SLOT_FIELDS if k not in values]
    if filled or missing:
        return [
            f"{FACTS_04}: the slot {SLOT_ID} must hold every field null, his to fill (FR-018): {', '.join(filled + missing)}"
        ]
    return []


def page_entry(page: str, entry: str) -> list[str] | None:
    """The lines of the page's `### <entry>:` section, or None."""
    lines = page.splitlines()
    start = next(
        (
            k
            for k, line in enumerate(lines)
            if re.match(rf"^###\s+{re.escape(entry)}\b", line)
        ),
        None,
    )
    if start is None:
        return None
    out: list[str] = []
    for line in lines[start + 1 :]:
        if line.startswith("#"):
            break
        out.append(line)
    return out


def golden_problems(
    files: list[FileDiff], page: str | None, entry: str | None
) -> list[str]:
    corpus = next((f for f in files if f.path == CORPUS_04), None)
    for line in corpus.added if corpus else []:
        if not NUMBERED.match(line):
            continue
        m = GOLDEN_9.match(line.strip())
        if not m:
            # A numbered item in another form would skip every rule below (B-1's class): refused, not skipped.
            return [
                (
                    "Golden Q&A: the patch adds a numbered item that isn't Golden Q&A 9 in its one form, "
                    f'`9. *<question>* — <answer> [A]`: "{line.strip()[:120]}"'
                )
            ]
        answer = m.group("a").strip()
        if not WORD.search(answer):
            # An empty answer is inside every quotation (B-1).
            return ["Golden Q&A 9: its answer is empty, or holds no word (FR-020)"]
        if page is None or entry is None:
            return [
                "Golden Q&A 9 is in the patch with no page entry to check its answer against (--page, --entry; FR-020)"
            ]
        lines = page_entry(page, entry)
        if lines is None:
            return [f"Golden Q&A 9: the page has no entry {entry}"]
        for at in lines:
            text = at.strip()
            # RECOMMENDED's match, anywhere on the line, makes it the rule's, not his (Q143; B-1).
            if not ANSWERED.match(text) or RECOMMENDED.search(text):
                continue
            if any(answer in span for span in QUOTED.findall(text)):
                return []
        return [
            (
                f'Golden Q&A 9: its answer isn\'t found inside a quotation of his own words on an "Answered:" line of {entry} '
                '(a line holding "recommend", in any case, its "c" and "m" doubled or not, is not his; Q143)'
            )
        ]
    return []


def check_patch(
    text: str, sources: Sources, page: str | None, entry: str | None
) -> list[str]:
    files = parse_patch(text)
    problems: list[str] = []
    for f in files:
        if any(rule.match(f.path) for rule in HUMAN_ONLY):
            problems.append(f"{f.path}: a human-only path; the patch may not touch it")
        elif f.path.startswith("corpus/") and f.path not in CORPUS_ALLOWED:
            problems.append(
                f"{f.path}: of corpus/, the patch touches only {CORPUS_04} and {FACTS_04}"
            )
    for placeholder in PLACEHOLDERS:
        if placeholder in text:
            problems.append(f"the placeholder {placeholder} is in the patch")
    problems += slot_problems(files)
    problems += golden_problems(files, page, entry)
    for f in files:
        if f.path == CORPUS_04:
            problems += digit_problems(f, sources)
    if not sources.dog_approved():
        problems.append(
            f"not buildable: {APPROVALS} holds no approval of {DOG_MODEL} with a disclosure line (FR-019); "
            "waiting on his approval of the dog's model"
        )
    return problems


# The command ----------------------------------------------------------------------------------------------------------


def buildable_line(sources: Sources) -> str:
    if sources.dog_approved():
        return "buildable: yes (his approval of the dog's model, with its line, is in approvals.json)"
    return "buildable: no (FR-019: waiting on his approval of the dog's model, with a disclosure line)"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument(
        "--main-dir",
        type=Path,
        default=None,
        help="a directory holding main's files, for a test",
    )
    parser.add_argument("--main-ref", default="main")
    sub = parser.add_subparsers(dest="mode", required=True)
    p = sub.add_parser("proposal")
    p.add_argument("file", type=Path)
    q = sub.add_parser("patch")
    q.add_argument("file", type=Path)
    q.add_argument("--page", type=Path, default=None)
    q.add_argument("--entry", default=None)
    args = parser.parse_args(argv)

    sources = Sources(args.root, args.main_dir, args.main_ref)
    text = args.file.read_text(encoding="utf-8")
    if args.mode == "proposal":
        problems = check_proposal(text, sources)
    else:
        page = (
            args.page.read_text(encoding="utf-8")
            if args.page is not None and args.page.is_file()
            else None
        )
        problems = check_patch(text, sources, page, args.entry)
    for problem in problems:
        print(f"REFUSED: {problem}")
    if problems:
        return 1
    print(f"OK: {args.mode} {args.file.name}")
    print(buildable_line(sources))
    return 0


if __name__ == "__main__":
    sys.exit(main())
