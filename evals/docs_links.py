#!/usr/bin/env python3
"""The docs-link check (spec 000 FR-003, SC-009; plan §16; tasks.md T114): the repository explains itself only if its
links lead somewhere.

    python3 -I -B -X pycache_prefix=/dev/null evals/docs_links.py      # what `make evals` runs

Standard library only. It reads Markdown as text and runs nothing. Four checks:
  1. Every relative link in README.md, and in the Markdown under docs/ and specs/, resolves: its file or directory
     exists inside the repository, and a #fragment names a heading, or an explicit anchor, of the Markdown page it
     points at (for a directory, its README.md). Inline links, images, and reference definitions count. Links inside
     code, HTML comments, and front matter don't, since they don't render as links. A destination with a scheme
     (https:, mailto:) or starting with // leaves the repository and isn't followed. A leading / is the repository's
     root, as GitHub reads it, and a query string is ignored. A fragment on a file that isn't Markdown isn't checked.
  2. README.md links the ADR index, docs/adr/ or its README.md.
  3. The index links every ADR file, docs/adr/NNNN-*.md. With 2, every ADR is two clicks from the README (SC-009).
  4. Each decision User Story 6 names has its ADR: 0001 to 0005 (quickstart.md §5.2).

Anchors follow GitHub's rule for headings: the heading's text as it renders, lowercased, keeping only letters, marks,
digits, underscores, hyphens, and spaces, each space then a hyphen. A repeated anchor gets -1, -2, and so on. Only
ATX headings (#) are read, which is all this repository writes.
Exit codes: 0 every check passed, 1 a check failed.
"""

from __future__ import annotations

import html
import os
import re
import sys
import unicodedata
import urllib.parse
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ROOTS = ("docs", "specs")  # beside README.md
ADR_DIR = Path("docs") / "adr"
ADR_INDEX = ADR_DIR / "README.md"
ADR_FILE = re.compile(r"\d{4}-[^/]+\.md")
# The five decisions User Story 6 names (spec.md, its scenario 2), by the ADR that records each (quickstart.md §5.2).
US6_DECISIONS = {
    "0001": "local-first routing",
    "0002": "one compose topology",
    "0003": "local-compose-first delivery",
    "0004": "Langfuse and Grafana",
    "0005": "Telegram alerting",
}

SCHEME = re.compile(r"[A-Za-z][A-Za-z0-9+.-]*:")
FENCE = re.compile(r"[ \t]*(`{3,}|~{3,})")
CODE_SPAN = re.compile(r"(?<![`\\])(`+)(?!`)(.+?)(?<!`)\1(?!`)", re.DOTALL)
COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
BLANK_LINE = re.compile(r"\n[ \t]*\n")
HEADING = re.compile(r" {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*")
EXPLICIT_ANCHOR = re.compile(
    r"<a\s[^>]*?\b(?:id|name)\s*=\s*([\"'])(.*?)\1", re.IGNORECASE
)
REFERENCE = re.compile(
    r"^ {0,3}\[(?!\^)(?:[^\[\]\\\n]|\\.)+\]:[ \t]*\n?[ \t]*(<[^<>\n]*>|\S+)"
    r"(?:[ \t]+(?:\"[^\"\n]*\"|'[^'\n]*'|\([^()\n]*\)))?[ \t]*$",
    re.MULTILINE,
)
ESCAPE = re.compile(r"\\([!-/:-@\[-`{-~])")


def blank(match: re.Match[str]) -> str:
    """The match's text with everything but line breaks turned into spaces, so offsets and line numbers hold."""
    return re.sub(r"[^\n]", " ", match.group(0))


def mask_blocks(text: str) -> str:
    """The text with front matter, fenced code, and HTML comments blanked: none of them renders a link or a heading."""
    lines = text.split("\n")
    out: list[str] = []
    start = 0
    if lines and lines[0].strip() == "---":
        for i in range(1, len(lines)):
            if lines[i].strip() in ("---", "..."):
                out, start = [""] * (i + 1), i + 1
                break
    fence = ""
    for line in lines[start:]:
        if fence:
            stripped = line.strip()
            if stripped and set(stripped) == {fence[0]} and len(stripped) >= len(fence):
                fence = ""
            out.append("")
            continue
        opened = FENCE.match(line)
        if opened and (opened.group(1)[0] == "~" or "`" not in line[opened.end() :]):
            fence = opened.group(1)
            out.append("")
            continue
        out.append(line)
    return COMMENT.sub(blank, "\n".join(out))


def mask(text: str) -> str:
    """mask_blocks, and code spans blanked too: what's left is where links can be."""

    def span(match: re.Match[str]) -> str:
        return match.group(0) if BLANK_LINE.search(match.group(0)) else blank(match)

    return CODE_SPAN.sub(span, mask_blocks(text))


def escaped(text: str, at: int) -> bool:
    count = 0
    while at - count - 1 >= 0 and text[at - count - 1] == "\\":
        count += 1
    return count % 2 == 1


def opening(text: str, close: int) -> int | None:
    """Where the link text ending at text[close], a "]", opens; None when no "[" in its paragraph opens it."""
    depth = 0
    for i in range(close, -1, -1):
        char = text[i]
        if char == "\n":
            if not text[text.rfind("\n", 0, i) + 1 : i].strip():
                return None  # a blank line ends a paragraph, and link text never crosses one
        elif char in "[]" and not escaped(text, i):
            depth += 1 if char == "]" else -1
            if depth == 0:
                return i
    return None


def destination(text: str, start: int) -> tuple[str, int] | None:
    """An inline link's destination, read from just after its "](", and where it starts; None if it isn't a link."""
    n, i = len(text), start
    while i < n and text[i] in " \t":
        i += 1
    if i < n and text[i] == "\n":
        i += 1
        while i < n and text[i] in " \t":
            i += 1
    at = i
    if i < n and text[i] == "<":
        end = i + 1
        while end < n and text[end] not in "<>\n":
            end += 2 if text[end] == "\\" else 1
        if end >= n or text[end] != ">":
            return None
        found, i = text[i + 1 : end], end + 1
    else:
        depth, end = 0, i
        while end < n:
            char = text[end]
            if char == "\\" and end + 1 < n:
                end += 2
                continue
            if char.isspace() or ord(char) < 0x20:
                break
            if char == "(":
                depth += 1
            elif char == ")":
                if depth == 0:
                    break
                depth -= 1
            end += 1
        if depth:
            return None
        found, i = text[i:end], end
    j = i
    while j < n and text[j] in " \t\n":
        j += 1
    if j > i and j < n and text[j] in "\"'(":
        closer = ")" if text[j] == "(" else text[j]
        k = j + 1
        while k < n and text[k] != closer:
            k += 2 if text[k] == "\\" else 1
        if k >= n:
            return None
        j = k + 1
        while j < n and text[j] in " \t\n":
            j += 1
    if j >= n or text[j] != ")":
        return None
    return ESCAPE.sub(r"\1", found), at


def find_links(text: str) -> list[tuple[int, str]]:
    """Each link's line and destination, as written: inline links and images, then reference definitions."""
    masked = mask(text)
    found = []
    for match in re.finditer(r"\]\(", masked):
        close = match.start()
        if escaped(masked, close) or opening(masked, close) is None:
            continue
        parsed = destination(masked, match.end())
        if parsed:
            dest, at = parsed
            found.append((masked.count("\n", 0, at) + 1, dest))
    for match in REFERENCE.finditer(masked):
        dest = ESCAPE.sub(r"\1", match.group(1).removeprefix("<").removesuffix(">"))
        found.append((masked.count("\n", 0, match.start(1)) + 1, dest))
    return sorted(found)


def render(heading: str) -> str:
    """A heading's text as it renders: code spans as written, links' text, and no images, tags, or emphasis marks."""

    def inline(part: str) -> str:
        part = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", part)
        part = re.sub(r"\[((?:[^\[\]\\]|\\.)*)\]\([^)]*\)", r"\1", part)
        part = re.sub(r"<((?:https?|mailto):[^>\s]*)>", r"\1", part)
        part = re.sub(r"</?[A-Za-z][^>]*>", "", part)
        part = re.sub(r"(?<![\w\\])(_+)(?!\s)(.+?)(?<!\s)\1(?!\w)", r"\2", part)
        return html.unescape(ESCAPE.sub(r"\1", part))

    parts, pos = [], 0
    for match in CODE_SPAN.finditer(heading):
        parts.append(inline(heading[pos : match.start()]))
        code = match.group(2)
        if len(code) > 2 and code[0] == code[-1] == " " and code.strip():
            code = code[1:-1]
        parts.append(code)
        pos = match.end()
    parts.append(inline(heading[pos:]))
    return "".join(parts)


def slug(heading: str) -> str:
    """GitHub's anchor for a heading, before a repeat gets its number."""
    out = []
    for char in render(heading).lower():
        category = unicodedata.category(char)
        if char == " ":
            out.append("-")
        elif char in "-_" or category[0] in "LM" or category == "Nd":
            out.append(char)
    return "".join(out)


def anchors(text: str) -> set[str]:
    """Every anchor a page has: its headings', numbered as GitHub numbers repeats, and its explicit <a id> or name."""
    seen: dict[str, int] = {}
    for line in mask_blocks(text).split("\n"):
        heading = HEADING.fullmatch(line)
        if not heading:
            continue
        base = found = slug(heading.group(2) or "")
        while found in seen:
            seen[base] += 1
            found = f"{base}-{seen[base]}"
        seen[found] = 0
    return set(seen) | {m.group(2) for m in EXPLICIT_ANCHOR.finditer(mask(text))}


class Checker:
    def __init__(self, repo: Path) -> None:
        self.repo = Path(os.path.abspath(repo))
        self.failed = 0
        self.cache: dict[Path, set[str] | None] = {}

    def ok(self, what: str) -> None:
        print(f"PASS  {what}")

    def fail(self, what: str) -> None:
        self.failed += 1
        print(f"FAIL  {what}")

    def rel(self, path: Path) -> str:
        return path.relative_to(self.repo).as_posix() if path != self.repo else "."

    def markdown_files(self) -> list[Path]:
        files = [self.repo / "README.md"] if (self.repo / "README.md").is_file() else []
        for root in ROOTS:
            base = self.repo / root
            if base.is_dir():
                files.extend(sorted(p for p in base.rglob("*.md") if p.is_file()))
        return files

    def read(self, path: Path) -> str | None:
        try:
            return path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            return None

    def anchors_of(self, page: Path) -> set[str] | None:
        if page not in self.cache:
            text = self.read(page)
            self.cache[page] = None if text is None else anchors(text)
        return self.cache[page]

    def target(self, page: Path, dest: str) -> tuple[Path, str] | None:
        """Where a relative destination leads, and its fragment; None when it leaves the repository by a scheme."""
        if SCHEME.match(dest) or dest.startswith("//"):
            return None
        path, _, fragment = dest.partition("#")
        path = urllib.parse.unquote(path.split("?", 1)[0])
        if not path:
            return page, urllib.parse.unquote(fragment)
        base = self.repo if path.startswith("/") else page.parent
        return Path(os.path.normpath(base / path.lstrip("/"))), urllib.parse.unquote(
            fragment
        )

    def problem(self, page: Path, dest: str) -> str | None:
        """Why a relative destination doesn't resolve, or None when it does."""
        found = self.target(page, dest)
        assert found is not None
        target, fragment = found
        if os.path.commonpath([self.repo, target]) != str(self.repo):
            return "outside the repository"
        if not target.exists():
            return "no such file or directory"
        if not fragment:
            return None
        holder = target / "README.md" if target.is_dir() else target
        if holder.suffix.lower() != ".md":
            return None  # a line anchor on a source file, say: GitHub's, not a heading
        if not holder.is_file():
            return f"{self.rel(target)} has no README.md to hold #{fragment}"
        names = self.anchors_of(holder)
        if names is None:
            return f"{self.rel(holder)} isn't UTF-8"
        if fragment not in names:
            return f"no heading or anchor #{fragment} in {self.rel(holder)}"
        return None

    def links_resolve(self) -> dict[Path, list[tuple[int, str]]]:
        files, count, broken = self.markdown_files(), 0, 0
        links: dict[Path, list[tuple[int, str]]] = {}
        for page in files:
            text = self.read(page)
            if text is None:
                self.fail(f"{self.rel(page)}: not UTF-8")
                continue
            links[page] = find_links(text)
            for line, dest in links[page]:
                if not dest or self.target(page, dest) is None:
                    continue
                count += 1
                why = self.problem(page, dest)
                if why:
                    broken += 1
                    self.fail(f"{self.rel(page)}:{line}: {dest}: {why}")
        self.files, self.links = len(files), count
        if broken:
            print(f"      {broken} of {count} relative links don't resolve")
        else:
            self.ok(
                f"every relative link resolves: {count} links in {len(files)} files"
            )
        return links

    def targets(self, page: Path, links: list[tuple[int, str]]) -> set[Path]:
        found = (self.target(page, dest) for _, dest in links if dest)
        return {t[0] for t in found if t is not None}

    def adr_index(self, links: dict[Path, list[tuple[int, str]]]) -> None:
        readme, index = self.repo / "README.md", self.repo / ADR_INDEX
        if {self.repo / ADR_DIR, index} & self.targets(readme, links.get(readme, [])):
            self.ok(f"README.md links the ADR index ({ADR_DIR.as_posix()}/)")
        else:
            self.fail(f"README.md doesn't link the ADR index ({ADR_DIR.as_posix()}/)")
        adrs = sorted(
            p for p in (self.repo / ADR_DIR).glob("*.md") if ADR_FILE.fullmatch(p.name)
        )
        if not index.is_file():
            self.fail(f"{ADR_INDEX.as_posix()}, the ADR index, is missing")
        else:
            linked = self.targets(index, links.get(index, []))
            missing = [p for p in adrs if p not in linked]
            for adr in missing:
                self.fail(f"the ADR index doesn't link {adr.name}")
            if not missing:
                self.ok(
                    f"the ADR index links every ADR file: {len(adrs)} of {len(adrs)}"
                )
        absent = [
            n
            for n in US6_DECISIONS
            if not any(p.name.startswith(f"{n}-") for p in adrs)
        ]
        for number in absent:
            self.fail(
                f"no ADR {number}, for User Story 6's decision: {US6_DECISIONS[number]}"
            )
        if not absent:
            self.ok(
                "User Story 6's five decisions have their ADRs: "
                + ", ".join(f"{n} ({d})" for n, d in US6_DECISIONS.items())
            )


def main(repo: Path = REPO) -> int:
    checker = Checker(repo)
    links = checker.links_resolve()
    checker.adr_index(links)
    print(
        f"docs links: {checker.failed} failed, {checker.links} relative links in {checker.files} files"
    )
    return 1 if checker.failed else 0


if __name__ == "__main__":
    sys.exit(main())
