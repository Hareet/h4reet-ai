"""M9's conflict resolutions (spec 004 T045; docs/merge-requests/2026-10-26-fix-002-patches-on-003.md).

The note runs it from the object store, by its blob ID, at the root of the checkout where git stopped on a merge's
conflicts. It reads no file of its own, so it runs from standard input:

    git --no-replace-objects cat-file blob <blob> | python3 -I - web          after merging feat/002-web
    git --no-replace-objects cat-file blob <blob> | python3 -I - approvals    after merging feat/002-approvals
    git --no-replace-objects cat-file blob <blob> | python3 -I - narration    after merging feat/002-us3-narration
    git --no-replace-objects cat-file blob <blob> | python3 -I - events       after merging feat/002-us6-events

Each rewrites only the files its merge leaves in conflict, in place, and prints them for `git add`. It refuses (exit 1),
writing nothing, unless every file is byte for byte what git leaves after the note's merge commands (with
merge.conflictStyle=merge) from main at a964494, or from a main whose only additions since touch none of these files:
the SHA-256 in MERGES. So it never guesses at a shape it wasn't written for: after a merge that moved one of these
files, under diff3's or zdiff3's markers (a ||||||| line refuses on its own too), after rerere, or with CRLF line ends.
Each rule then checks what it keeps and drops against the text it was written for. It also refuses unless the current
directory holds .git and each file is a regular file at its own path below it, with no link on the way. It runs no git
and reads nothing but those files.
"""

import hashlib
import re
import sys
from pathlib import Path

MARKER = re.compile(r"^(<<<<<<<|\|\|\|\|\|\|\||=======|>>>>>>>)( |$)", re.MULTILINE)
BASE = re.compile(r"^\|\|\|\|\|\|\|( |$)", re.MULTILINE)
HUNK = re.compile(
    r"^<<<<<<< [^\n]*\n(.*?)^=======\n(.*?)^>>>>>>> [^\n]*\n",
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
    two blank lines, then the branch's whole block. A block runs from its opening, the shared lines git matched
    before the first marker (back to the blank line that ends what came before them), to the last marker; the lines
    between conflicts belong to both. The opening stays where it is, before main's block, and is repeated before the
    branch's, so each block keeps the header it was written with (in scripts/test_makefile.py, the `# ----` rule)."""
    first = MARKER.search(text)
    if not first or not first.group(1).startswith("<"):
        raise Refused("no conflict markers")
    start = text.rfind("\n\n", 0, first.start())
    if start < 0:
        raise Refused("no blank line before the first conflict, so no opening to keep")
    start += 2
    opening = text[start : first.start()]
    last = text.rindex("\n>>>>>>> ") + 1
    last = text.index("\n", last) + 1
    region = text[first.start() : last]
    ours = HUNK.sub(lambda m: m.group(1), region)
    theirs = HUNK.sub(lambda m: m.group(2), region)
    return (
        text[: first.start()]
        + ours.rstrip("\n")
        + "\n\n\n"
        + opening
        + theirs
        + text[last:]
    )


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


RULE_LINE = "# " + "-" * 98 + "\n"


def web_tests(text: str) -> str:
    """main's T167 tests, then the branch's room tests (both appended at the file's end, each under the `# ----` rule);
    and main's two tests that pin the relayed build now expect the room's build between the gateway's and compose's,
    since the merged Makefile builds it there."""
    first = MARKER.search(text)
    if not first or not text[: first.start()].endswith("\n\n\n" + RULE_LINE):
        raise Refused(
            "the blocks' shared opening isn't the `# ----` rule after two blank lines"
        )
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


# main's line at a964494, the branch's at 6c6bb7849a7d, and the line plan §4.2 has at M9.
MAIN_CHECK_GATES = (
    "CHECK_GATES := makefiles-check githooks-check toolchain-check policy validate-config lint test "
    "secrets arrival evals redteam=redteam-suite matrix image\n"
)
BRANCH_CHECK_GATES = (
    "CHECK_GATES := makefiles-check githooks-check toolchain-check policy validate-config lint test "
    "content-check secrets evals redteam=redteam-suite matrix image\n"
)
CHECK_GATES = (
    "CHECK_GATES := makefiles-check githooks-check toolchain-check policy validate-config lint test "
    "content-check secrets arrival evals redteam=redteam-suite matrix image\n"
)


def approvals_makefile(text: str) -> str:
    """CHECK_GATES: spec 002's content-check right after test, spec 003's arrival after secrets; spec 004 adds no
    gate. .PHONY: main's list, with content-check after test-fast, where the branch puts it."""

    def resolve(ours: str, theirs: str) -> str:
        if ours.startswith("CHECK_GATES :=") or theirs.startswith("CHECK_GATES :="):
            if ours != MAIN_CHECK_GATES or theirs != BRANCH_CHECK_GATES:
                raise Refused(
                    "a CHECK_GATES line other than a964494's and the branch's"
                )
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


# main's help line at a964494, which the branch's (naming the narration suite) replaces.
MAIN_EVALS_HELP = (
    "evals: ## The product evals (ADAPTER=fake; local and bedrock are the Author's), the agent-config static tier,"
    " the behavioral tier's status, and the docs' links\n"
)


def narration_makefile(text: str) -> str:
    """main's arrival and assets targets, then the branch's evals help line, which names the narration suite."""

    def resolve(ours: str, theirs: str) -> str:
        head, sep, last = ours.rpartition("\n" + MAIN_EVALS_HELP)
        if not sep or last or ours.count("evals: ## ") != 1:
            raise Refused("main's side doesn't end with a964494's evals help line")
        if not theirs.startswith("evals: ## ") or theirs.count("\n") != 1:
            raise Refused("the branch's side isn't one evals help line")
        return head + "\n" + theirs

    return each(text, resolve)


# main's row at a964494 (T185's table), which the branch's row of the same name, naming spec 002's panels, replaces.
MAIN_DASHBOARD_ROW = (
    "| Dashboard queries | a pytest test, `deploy/scripts/test_dashboard.py` | every metric name in `h4-runtime.json`"
    " appears in this file; every FR-028, FR-034, and FR-037 panel exists; the datasource uids are `prom`, `loki`,"
    " and `gateway` |\n"
)


def rows(text: str) -> str:
    """Table rows: main's, less the one row whose first cell the branch's side has too, then the branch's (T185's
    collector row, then the branch's Dashboard queries row, which names spec 002's panels)."""

    def first(line: str) -> str:
        return line.split("|")[1].strip()

    def resolve(ours: str, theirs: str) -> str:
        lines = ours.splitlines(keepends=True) + theirs.splitlines(keepends=True)
        if not all(line.startswith("| ") for line in lines):
            raise Refused("a conflict that isn't table rows")
        cells = {first(line) for line in theirs.splitlines()}
        mine = ours.splitlines(keepends=True)
        dropped = [line for line in mine if first(line) in cells]
        if dropped != [MAIN_DASHBOARD_ROW]:
            raise Refused("the row it drops isn't a964494's Dashboard queries row")
        return "".join(line for line in mine if line not in dropped) + theirs

    return each(text, resolve)


# Each merge's files: the path, the SHA-256 of the file exactly as git leaves it after the note's merge command (from
# main at a964494, conflictStyle merge), the number of conflicts in it, and the rule.
MERGES = {
    "web": [
        (
            "Makefile",
            "11346cc0a59f8e6f60019ee9bc2107dcfc59085a7624edc2c6dfd69abac9fbe6",
            3,
            web_makefile,
        ),
        (
            "docs/adr/README.md",
            "b1edd683d9f8277e7038b72a79639d038eeddd6f4c761ce9258c276482b689d4",
            1,
            both,
        ),
        (
            "scripts/test_makefile.py",
            "77b272e04454a32c24bce65a79bbe9abe9cb25fc5c1f02e878751601b23a9c09",
            2,
            web_tests,
        ),
    ],
    "approvals": [
        (
            "Makefile",
            "022b5b5fdd7ddd39ccb9c3eea84f115029ea7c26d3d5c338fd7dae094ad8408c",
            2,
            approvals_makefile,
        ),
        (
            "docs/START-HERE.md",
            "396b212019808eb5ef48f5649ced24b79096108402f7e83764c075b699156974",
            1,
            approvals_start_here,
        ),
        (
            "redteam/forbidden-actions.sh",
            "fb134d711eaad94e778a03cc9dbeca436b5a1198e06ae7858cf8353e446a9ba8",
            1,
            sections,
        ),
    ],
    "narration": [
        (
            "Makefile",
            "ccdf9fa0ca9029923c6518651a7f01928f4f7533f249d39ca29eb7a076605b34",
            1,
            narration_makefile,
        ),
    ],
    "events": [
        (
            "specs/000-local-foundations/contracts/telemetry.md",
            "99aa3048a9e6bdd0b0dfc965b0609d2a1001b53bb019228970029f87db9b6a23",
            1,
            rows,
        ),
    ],
}

USAGE = "git --no-replace-objects cat-file blob <blob> | python3 -I - {%s}"


def target(root: Path, name: str) -> Path:
    """name below root, as a regular file reached through no link."""
    relative = Path(name)
    if relative.is_absolute() or ".." in relative.parts:
        raise Refused("a path outside the current directory")
    path = root / relative
    if path.is_symlink() or path.resolve() != path:
        raise Refused("a link, or under one")
    if not path.resolve().is_relative_to(root):
        raise Refused("it resolves outside the current directory")
    if not path.is_file():
        raise Refused("not a regular file here")
    return path


def resolve_file(root: Path, name: str, pin: str, count: int, rule) -> tuple[Path, str]:
    path = target(root, name)
    data = path.read_bytes()
    text = data.decode("utf-8")
    if BASE.search(text):
        raise Refused(
            "a ||||||| line: diff3's or zdiff3's markers, which this script wasn't written for; "
            "merge with -c merge.conflictStyle=merge, as the note does"
        )
    digest = hashlib.sha256(data).hexdigest()
    if digest != pin:
        raise Refused(
            f"its bytes aren't the ones this rule was written for (SHA-256 {digest[:12]}…, expected {pin[:12]}…): "
            "main or the merge differs from the note's; git merge --abort, and tell the agents"
        )
    found = len(HUNK.findall(text))
    markers = len(MARKER.findall(text))
    if found != count or markers != 3 * count:
        raise Refused(
            f"{found} conflicts in {markers} marker lines, not {count} in {3 * count}"
        )
    out = rule(text)
    if MARKER.search(out):
        raise Refused("conflict markers left")
    return path, out


def main(argv: list[str], merges: dict | None = None) -> int:
    merges = MERGES if merges is None else merges
    if len(argv) != 1 or argv[0] not in merges:
        print("usage: " + USAGE % "|".join(merges), file=sys.stderr)
        return 2
    root = Path.cwd().resolve()
    if not (root / ".git").exists():
        print(
            f"m9-resolve: no .git in {root}: run it from the root of the checkout where git stopped; nothing written",
            file=sys.stderr,
        )
        return 1
    done: dict[Path, str] = {}
    for name, pin, count, rule in merges[argv[0]]:
        try:
            path, out = resolve_file(root, name, pin, count, rule)
        except (OSError, UnicodeDecodeError, Refused) as exc:
            print(f"m9-resolve: {name}: {exc}; nothing written", file=sys.stderr)
            return 1
        done[path] = out
    for path, out in done.items():
        path.write_bytes(out.encode("utf-8"))
    names = " ".join(str(path.relative_to(root)) for path in done)
    print(f"m9-resolve: {argv[0]}: resolved; now: git add {names}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
