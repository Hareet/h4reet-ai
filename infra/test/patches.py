"""The tree as the Author's unapplied patches would leave it (spec 001 W1 and W2; plan.md §16, "Four gates"; tasks.md
Format, "Patches").

A protected file changes only by the Author's patch, which he applies on W1's `-p` branch after the review. Until
then the agent branch holds the patch beside its note, and the tests read each file the patch touches as the patch
leaves it: a new file's text from the patch, a changed file's by applying the patch's hunks to the tree's copy. Once
he has applied it, the tree already holds that text, and the tree is read. A hunk that matches neither the tree as it
was nor the tree as patched fails the read: the patch is stale, and the tests say so rather than guess.

Gate A's tests read only new files from their patches (test_account.py's and test_bootstrap.py's `from_patch`). W1's
patches change files gate A applied, so this reader also takes a changed file's hunks. It reads unified diffs as
`diff -u` writes them, with `a/` and `b/` labels, and applies them exactly, with no fuzz.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MERGE_REQUESTS = REPO / "docs" / "merge-requests"
# W1's patches for infra/ and the files they carry, in the order the Author applies them (tasks.md T171).
PI3 = MERGE_REQUESTS / "2026-11-13-feat-001-pi3-tunnel-end.patch"
# Group 6's, on top of P-I3's iam.tf, bridge, and contract rows (tasks.md T073).
PI7 = MERGE_REQUESTS / "2026-11-13-feat-001-pi7-shared-state.patch"
# Group 7's, on top of both: EC2's spot instance, its two roles, its ID's parameter, and the two budget actions (T089).
PI4 = MERGE_REQUESTS / "2026-11-13-feat-001-pi4-ec2.patch"
# Group 8's, after P-I4: the edge's two protected files, and the probe's switch in the account's alerts.tf (T107).
PI5 = MERGE_REQUESTS / "2026-11-13-feat-001-pi5-edge.patch"
# Group 9's, after P-I5: the handover's health check, alarm, rules, functions, roles, schedules, and the hours, with
# the tunnel end's dashboard reads and the bridge's new kinds (tasks.md T124).
PI6 = MERGE_REQUESTS / "2026-11-13-feat-001-pi6-handover.patch"
# W2's, after W1's (tasks.md T175): P-W2, both roots' local.wired = true. A patch that isn't in the tree yet is skipped,
# so a test that needs it fails until it is (W2's RED).
PW2 = MERGE_REQUESTS / "2026-11-13-feat-001-pw2-switch-on.patch"
# And P-I5b, after P-W2: edge.tf's index function on the folders alone, and a folder's path to its slash (group 8's
# review B, the smaller ones).
PI5B = MERGE_REQUESTS / "2026-11-13-feat-001-pi5b-edge.patch"
W1_PATCHES = (PI3, PI7, PI4, PI5, PI6)
W2_PATCHES = (PW2, PI5B)
# W1's are in the tree since W1's -p branch merged into main (the Author applied them there), so only W2's
# are pending on this branch: the tests read the tree as it will be once P-W2 and P-I5b are on.
PATCHES = W2_PATCHES

HUNK = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


class StalePatch(AssertionError):
    """A patch's hunk matches the tree neither before nor after it."""


@dataclass
class Hunk:
    old_start: int
    old: list[str] = field(default_factory=list)
    new: list[str] = field(default_factory=list)
    new_start: int = 0


@dataclass
class FileDiff:
    old_path: str | None
    new_path: str | None
    hunks: list[Hunk] = field(default_factory=list)


def _label(line: str, prefix: str) -> str | None:
    path = line[len(prefix) :].split("\t", 1)[0].rstrip("\n")
    if path == "/dev/null":
        return None
    assert path.startswith(("a/", "b/")), f"a patch label without a/ or b/: {path}"
    return path[2:]


def parse(text: str) -> dict[str, FileDiff]:
    """Each file a unified diff touches, by its path after the patch (or before it, for a deletion)."""
    lines = text.splitlines(keepends=True)
    out: dict[str, FileDiff] = {}
    i = 0
    while i < len(lines):
        if not (
            lines[i].startswith("--- ")
            and i + 1 < len(lines)
            and lines[i + 1].startswith("+++ ")
        ):
            i += 1
            continue
        diff = FileDiff(_label(lines[i], "--- "), _label(lines[i + 1], "+++ "))
        i += 2
        while i < len(lines) and lines[i].startswith("@@ "):
            m = HUNK.match(lines[i])
            assert m, f"an unreadable hunk header: {lines[i]!r}"
            old_n = int(m.group(2) if m.group(2) is not None else 1)
            new_n = int(m.group(4) if m.group(4) is not None else 1)
            hunk = Hunk(int(m.group(1)), new_start=int(m.group(3)))
            i += 1
            last: list[str] | None = None
            while (old_n or new_n) and i < len(lines):
                line = lines[i]
                tag, body = line[:1], line[1:]
                if tag == " ":
                    hunk.old.append(body)
                    hunk.new.append(body)
                    old_n, new_n, last = old_n - 1, new_n - 1, None
                elif tag == "-":
                    hunk.old.append(body)
                    old_n, last = old_n - 1, hunk.old
                elif tag == "+":
                    hunk.new.append(body)
                    new_n, last = new_n - 1, hunk.new
                else:
                    raise AssertionError(f"an unreadable hunk line: {line!r}")
                i += 1
            while i < len(lines) and lines[i].startswith("\\ No newline"):
                if last:
                    last[-1] = last[-1].rstrip("\n")
                i += 1
            diff.hunks.append(hunk)
        key = diff.new_path or diff.old_path
        assert key is not None, "a diff between two /dev/nulls"
        out[key] = diff
    return out


def _apply(text: str, hunks: list[Hunk]) -> str | None:
    """text with the hunks applied exactly, or None where one doesn't match. A hunk that only adds lines starts after
    its old_start'th line, as diff -u writes it (`-N,0`)."""
    lines = text.splitlines(keepends=True)
    out: list[str] = []
    pos = 0
    for h in hunks:
        index = h.old_start - 1 if h.old else h.old_start
        if index < pos or lines[index : index + len(h.old)] != h.old:
            return None
        out.extend(lines[pos:index])
        out.extend(h.new)
        pos = index + len(h.old)
    out.extend(lines[pos:])
    return "".join(out)


def _reversed(hunks: list[Hunk]) -> list[Hunk]:
    """The hunks as the reverse patch reads them, each from where it lands in the patched file."""
    return [Hunk(h.new_start, list(h.new), list(h.old), h.old_start) for h in hunks]


def apply_diff(current: str | None, diff: FileDiff, name: str) -> str | None:
    """The file after the diff, from the tree's current text; the tree's text when the diff is already applied."""
    if diff.old_path is None:  # a new file
        text = "".join(diff.hunks[0].new) if diff.hunks else ""
        if current is None or current == text:
            return text
        raise StalePatch(
            f"{name} creates {diff.new_path}, which the tree holds otherwise"
        )
    if diff.new_path is None:  # a deletion
        return None
    if current is None:
        raise StalePatch(f"{name} changes {diff.old_path}, which the tree lacks")
    forward = _apply(current, diff.hunks)
    if forward is not None:
        return forward
    if _apply(current, _reversed(diff.hunks)) is not None:
        return current  # applied already: the tree holds the patched text
    raise StalePatch(
        f"{name}'s hunks for {diff.old_path} match the tree neither before nor after"
    )


def _diffs(rel: str, patches: tuple[Path, ...]) -> list[tuple[str, FileDiff]]:
    out = []
    for patch in patches:
        if patch.is_file():
            diff = parse(patch.read_text(encoding="utf-8")).get(rel)
            if diff is not None:
                out.append((patch.name, diff))
    return out


def _unapplied(text: str | None, diffs: list[tuple[str, FileDiff]]) -> str | None:
    """The text before every diff, from the text after all of them: each reversed, the last first."""
    for name, diff in reversed(diffs):
        if text is None:
            raise StalePatch(f"{name}: the file is gone before its diff is undone")
        if diff.old_path is None:  # a new file: before it, no file
            if text != ("".join(diff.hunks[0].new) if diff.hunks else ""):
                raise StalePatch(f"{name} created a text the tree no longer holds")
            text = None
            continue
        undone = _apply(text, _reversed(diff.hunks))
        if undone is None:
            raise StalePatch(f"{name}'s hunks for {diff.old_path} don't undo")
        text = undone
    return text


def patched_text(
    rel: str, patches: tuple[Path, ...] = PATCHES, repo: Path = REPO
) -> str | None:
    """rel's text once each patch is applied, in order; None if the file doesn't exist either way. A tree that holds
    every patch already, which a later patch changing an earlier one's file leaves past each one's own check, is read
    as it is once undoing them all and applying them again gives it back."""
    path = repo / rel
    current = path.read_text(encoding="utf-8") if path.is_file() else None
    diffs = _diffs(rel, patches)
    try:
        text = current
        for name, diff in diffs:
            text = apply_diff(text, diff, name)
        return text
    except StalePatch:
        if current is None or len(diffs) < 2:
            raise
        before = _unapplied(current, diffs)
        text = before
        for name, diff in diffs:
            text = apply_diff(text, diff, name)
        if text != current:
            raise
        return current


def touched(patches: tuple[Path, ...] = PATCHES) -> set[str]:
    """Every path the patches create or change."""
    out: set[str] = set()
    for patch in patches:
        if patch.is_file():
            out |= set(parse(patch.read_text(encoding="utf-8")))
    return out
