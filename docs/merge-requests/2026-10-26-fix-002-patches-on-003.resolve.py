"""M9's conflict resolutions (spec 004 T045; docs/merge-requests/2026-10-26-fix-002-patches-on-003.md).

Usage, from the root of the checkout where git stopped on a merge's conflicts:

    python3 -I m9-resolve.py web          after merging feat/002-web
    python3 -I m9-resolve.py approvals    after merging feat/002-approvals
    python3 -I m9-resolve.py narration    after merging feat/002-us3-narration
    python3 -I m9-resolve.py events       after merging feat/002-us6-events

Each rewrites only the files its merge leaves in conflict, in place, and prints them for `git add`. It refuses
(exit 1), writing nothing, when a file's conflicts aren't the shape the note describes. It runs no git and reads
nothing but those files.
"""

import re
import sys
from pathlib import Path

HUNK = re.compile(
    r"^<<<<<<< [^\n]*\n(.*?)(?:^\|\|\|\|\|\|\| [^\n]*\n.*?)?^=======\n(.*?)^>>>>>>> [^\n]*\n",
    re.DOTALL | re.MULTILINE,
)


class Refused(Exception):
    pass


def each(text: str, fn) -> str:
    """Each conflict, replaced by fn(main's side, the branch's side)."""
    if not HUNK.search(text):
        raise Refused("no conflict markers")
    return HUNK.sub(lambda m: fn(m.group(1), m.group(2)), text)


def both(text: str) -> str:
    """Each conflict: main's lines, then the branch's (the ADR index: 0023 and 0030 to 0032, then 0033)."""
    return each(text, lambda ours, theirs: ours + theirs)


def sections(text: str) -> str:
    """Each conflict: main's section, a blank line, then the branch's (the matrix: spec 003's and spec 004's rows,
    then spec 002's content-policy rows)."""
    return each(text, lambda ours, theirs: ours + "\n" + theirs)


def blocks(text: str) -> str:
    """Two blocks appended at the same place, which git interleaved into several conflicts: main's whole block, then
    the branch's whole block, from the first marker to the last. The lines between conflicts belong to both."""
    if not HUNK.search(text):
        raise Refused("no conflict markers")
    first, last = text.index("<<<<<<< "), text.rindex(">>>>>>> ")
    last = text.index("\n", last) + 1
    region = text[first:last]
    ours = HUNK.sub(lambda m: m.group(1), region)
    theirs = HUNK.sub(lambda m: m.group(2), region)
    return text[:first] + ours.rstrip("\n") + "\n\n\n" + theirs + text[last:]


def replace_once(text: str, old: str, new: str) -> str:
    if text.count(old) != 1:
        raise Refused(f"expected exactly one {old!r}")
    return text.replace(old, new)


def web_makefile(text: str) -> str:
    """main's side (T167's engine probe), with the room's image after the gateway's in build, image, and .PHONY, and
    the image gate's help line naming it, as the branch has it."""

    def resolve(ours: str, theirs: str) -> str:
        if "gateway-image web-image compose-images" not in theirs:
            raise Refused("a conflict where the branch doesn't add web-image")
        out = replace_once(
            ours,
            "gateway-image compose-images",
            "gateway-image web-image compose-images",
        )
        return out.replace(
            "## The image gate: the gateway's and the compose images",
            "## The image gate: the gateway's, the room's, and the compose images",
        )

    return each(text, resolve)


def web_tests(text: str) -> str:
    """main's T167 tests, then the branch's room tests (both appended at the file's end); and main's two tests that
    pin the relayed build now expect the room's build between the gateway's and compose's, since the merged Makefile
    builds it there."""
    text = blocks(text)
    text = replace_once(
        text,
        'RELAYED_BUILD = "make --no-print-directory gateway-image compose-images ENV=dev-cpu"',
        'RELAYED_BUILD = (\n    "make --no-print-directory gateway-image web-image compose-images ENV=dev-cpu"\n)',
    )
    return replace_once(
        text,
        '    assert calls == ["version", GATEWAY_BUILD, COMPOSE_BUILD]\n',
        '    assert calls[:2] == ["version", GATEWAY_BUILD] and calls[3:] == [COMPOSE_BUILD]\n'
        "    assert len(calls) == 4 and WEB_BUILD.fullmatch(calls[2]), calls\n",
    )


CHECK_GATES = (
    "CHECK_GATES := makefiles-check githooks-check toolchain-check policy validate-config lint test "
    "content-check secrets arrival evals redteam=redteam-suite matrix image\n"
)


def approvals_makefile(text: str) -> str:
    """CHECK_GATES: spec 002's content-check right after test, spec 003's arrival after secrets; spec 004 adds no
    gate. .PHONY: main's list, with content-check after test-fast, where the branch puts it."""

    def resolve(ours: str, theirs: str) -> str:
        if ours.startswith("CHECK_GATES :=") and theirs.startswith("CHECK_GATES :="):
            return CHECK_GATES
        if ours.startswith(".PHONY:") and " test-fast content-check \\\n" in theirs:
            return replace_once(
                ours, " test-fast \\\n", " test-fast content-check \\\n"
            )
        raise Refused(f"a conflict this rule doesn't know: {ours[:60]!r}")

    return each(text, resolve)


BUILD_CLAUSE = (
    " Once spec 002's approvals patch is applied, a branch with the room also gets the room's build without drafts"
    " there, with main's content policy mounted, and on the host main's content check reads what that build"
    " published."
)
CREDITS = "and spec 003's credits check (`make credits-check`) with `--network none`."
REFUSES = (
    "Only its `lint`, `test`, and",
    "Only its `lint`, `test`, `content-check`, and",
)


def approvals_start_here(text: str) -> str:
    """§7, step 2's two paragraphs: main's (spec 003's credits check, arrival check, and make arrival), with the
    branch's two clauses for the content check."""

    def resolve(ours: str, theirs: str) -> str:
        if BUILD_CLAUSE not in theirs or REFUSES[1] not in theirs:
            raise Refused("the branch's side lacks its two clauses")
        out = replace_once(ours, CREDITS, CREDITS + BUILD_CLAUSE)
        return replace_once(out, *REFUSES)

    return each(text, resolve)


def narration_makefile(text: str) -> str:
    """main's arrival and assets targets, then the branch's evals help line, which names the narration suite."""

    def resolve(ours: str, theirs: str) -> str:
        head, _, last = ours.rstrip("\n").rpartition("\n")
        if not (
            last.startswith("evals: ## ")
            and theirs.startswith("evals: ## ")
            and theirs.count("\n") == 1
        ):
            raise Refused("the evals help line isn't where this rule expects it")
        return head + "\n" + theirs

    return each(text, resolve)


def rows(text: str) -> str:
    """Table rows: main's, less any row whose first cell the branch's side has too, then the branch's (T185's
    collector row, then the branch's Dashboard queries row, which names spec 002's panels)."""

    def first(line: str) -> str:
        return line.split("|")[1].strip()

    def resolve(ours: str, theirs: str) -> str:
        lines = ours.splitlines(keepends=True) + theirs.splitlines(keepends=True)
        if not all(line.startswith("| ") for line in lines):
            raise Refused("a conflict that isn't table rows")
        cells = {first(line) for line in theirs.splitlines()}
        kept = [
            line for line in ours.splitlines(keepends=True) if first(line) not in cells
        ]
        return "".join(kept) + theirs

    return each(text, resolve)


MERGES = {
    "web": [
        ("Makefile", web_makefile),
        ("docs/adr/README.md", both),
        ("scripts/test_makefile.py", web_tests),
    ],
    "approvals": [
        ("Makefile", approvals_makefile),
        ("docs/START-HERE.md", approvals_start_here),
        ("redteam/forbidden-actions.sh", sections),
    ],
    "narration": [("Makefile", narration_makefile)],
    "events": [("specs/000-local-foundations/contracts/telemetry.md", rows)],
}


def main(argv: list[str]) -> int:
    if len(argv) != 1 or argv[0] not in MERGES:
        print(
            f"usage: python3 -I m9-resolve.py {{{'|'.join(MERGES)}}}", file=sys.stderr
        )
        return 2
    done = {}
    for name, rule in MERGES[argv[0]]:
        path = Path(name)
        try:
            out = rule(path.read_text(encoding="utf-8"))
            if re.search(r"^(<<<<<<<|=======|>>>>>>>)( |$)", out, re.MULTILINE):
                raise Refused("conflict markers left")
        except (OSError, Refused) as exc:
            print(f"m9-resolve: {name}: {exc}; nothing written", file=sys.stderr)
            return 1
        done[path] = out
    for path, out in done.items():
        path.write_text(out, encoding="utf-8")
    print(f"m9-resolve: {argv[0]}: resolved; now: git add {' '.join(map(str, done))}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
