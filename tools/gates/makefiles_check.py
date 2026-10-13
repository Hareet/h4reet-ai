#!/usr/bin/env python3
"""GNUmakefile holds only the Author's include, and there is no makefile (spec 000, tasks.md T183).

    python3 -I -B -X pycache_prefix=/dev/null tools/gates/makefiles_check.py [--export] [DIR]

GNU make reads the first of GNUmakefile, makefile, and Makefile that it finds, so either of the first two would run
in place of the Makefile. GNUmakefile must be a regular file, not a link, whose bytes are exactly EXPECTED, which
only includes the Makefile; and makefile must not exist.

In a live tree, two things count as no makefile, both of the sandbox's making in the main tree, and both holding
nothing (placeholder() below). With --export, nothing does: the gate checks its own export of a commit, where the
sandbox never makes a placeholder, and where a read-only export gives a committed empty file the placeholder's mode.

The gate's own makefiles step holds a branch's export to the same rule, with main's GNUmakefile as the expected
bytes, before anything runs make (tasks.md T092); --export is this script's form of that rule. make check runs it
(`makefiles-check`), but through make it reports only an accidental edit: a hostile GNUmakefile has already run by
then, and can skip or fake this check. What it shows of a changed file is printable ASCII, since an agent wrote it.
Standard library only.

Exit 0 when both hold, 1 when either doesn't, 2 on a usage error. DIR defaults to the working directory.
"""

from __future__ import annotations

import difflib
import errno
import os
import stat
import sys
from pathlib import Path

EXPECTED = b"""\
# The Makefile, and nothing else (spec 000, tasks.md T183). GNU make reads GNUmakefile first. With no file here,
# the sandbox's write-deny on this path (T045) left a placeholder no process could open, and every make in an agent
# session stopped: "make: GNUmakefile: Permission denied". Agents must not change this file. In the main tree,
# protected-paths.sh blocks their edits and the sandbox binds it read-only; a worktree has neither, so the gate (T092)
# holds a branch's copy to main's bytes before any make, and make check holds it to this text
# (tools/gates/makefiles_check.py). Never add a rule here.
include $(dir $(lastword $(MAKEFILE_LIST)))Makefile
"""

SANDBOX_MASK = os.makedev(1, 3)  # /dev/null
SHOWN = (
    len(EXPECTED) + 4096
)  # read at most this much: enough to show a change, never a whole planted file
USAGE = "usage: makefiles_check.py [--export] [DIR]"


def placeholder(path: Path) -> str | None:
    """Why the makefile at path holds nothing and counts as none in a live tree, or None. Inside a session, the
    sandbox binds /dev/null's device over a write-denied path that doesn't exist. To bind it, it makes an empty file
    with no write bits there, which the host, a command that starts while another runs, and a killed session's
    leftovers show."""
    st = os.lstat(path)
    if stat.S_ISCHR(st.st_mode) and st.st_rdev == SANDBOX_MASK:
        return "the sandbox's mask, /dev/null's device"
    if stat.S_ISREG(st.st_mode) and st.st_size == 0 and not st.st_mode & 0o222:
        return "an empty placeholder with no write bits, a running or killed session's"
    return None


def read_regular(path: Path, limit: int) -> tuple[bytes | None, str]:
    """Up to limit bytes of path, or None and why it can't be read as a regular file. It never follows a link, never
    waits on a FIFO, and checks the type of what it opened, not of what the name pointed to a moment before."""
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except OSError as err:
        if err.errno == errno.ELOOP:
            return None, "it is a link"
        return None, f"it can't be opened: {err.strerror}"
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            return (
                None,
                "it isn't a regular file: a directory, a FIFO, a socket, or a device",
            )
        chunks: list[bytes] = []
        while limit > 0 and (chunk := os.read(fd, limit)):
            chunks.append(chunk)
            limit -= len(chunk)
        return b"".join(chunks), ""
    except OSError as err:
        return None, f"it can't be read: {err.strerror}"
    finally:
        os.close(fd)


def printable(text: str) -> str:
    """text as printable ASCII, newlines, and tabs: anything else shows as \\x.., \\u...., or \\U........, so nothing
    an agent wrote can drive the terminal or pass for what it isn't. EXPECTED is ASCII, so a diff loses nothing."""
    out = []
    for ch in text:
        code = ord(ch)
        if ch in "\n\t" or 0x20 <= code < 0x7F:
            out.append(ch)
        elif code < 0x100:
            out.append(f"\\x{code:02x}")
        elif code < 0x10000:
            out.append(f"\\u{code:04x}")
        else:
            out.append(f"\\U{code:08x}")
    return "".join(out)


def problems(root: Path, export: bool = False) -> tuple[list[str], list[str]]:
    """What is wrong with the makefiles make would read in root before its Makefile, and what was noted about them.
    With export, root is the gate's export of a commit, and no makefile counts as a placeholder."""
    found: list[str] = []
    notes: list[str] = []
    try:
        names = set(
            os.listdir(root)
        )  # exact names, also on a filesystem that ignores case
        why_none = None
        if "makefile" in names and not export:
            why_none = placeholder(root / "makefile")
    except OSError as err:
        return [f"{err.filename or root} can't be checked: {err.strerror}"], notes
    if "makefile" in names:
        if why_none:
            notes.append(f"makefile: {why_none}, which holds nothing: counted as none")
        else:
            found.append(
                "a makefile exists: make reads it instead of the Makefile whenever GNUmakefile is missing"
            )
    if "GNUmakefile" not in names:
        found.append("GNUmakefile is missing")
        return found, notes
    data, why = read_regular(root / "GNUmakefile", SHOWN)
    if data is None:
        found.append(f"GNUmakefile can't be checked: {why}")
    elif data != EXPECTED:
        shown = printable(data.decode("utf-8", errors="backslashreplace"))
        diff = difflib.unified_diff(
            EXPECTED.decode("ascii").splitlines(keepends=True),
            shown.splitlines(keepends=True),
            "expected",
            "GNUmakefile",
        )
        cut = (
            f"\n(the diff shows the file's first {SHOWN} bytes)"
            if len(data) == SHOWN
            else ""
        )
        found.append(
            "GNUmakefile differs from the text the Author committed:\n"
            + "".join(diff).rstrip("\n")
            + cut
        )
    return found, notes


def main(argv: list[str]) -> int:
    args = argv[1:]
    export = bool(args) and args[0] == "--export"
    if export:
        args = args[1:]
    if len(args) > 1 or (args and (not args[0] or args[0].startswith("-"))):
        print(USAGE, file=sys.stderr)
        return 2
    root = Path(args[0]) if args else Path.cwd()
    if not root.is_dir():
        print(f"makefiles_check: not a directory: {root}", file=sys.stderr)
        return 2
    found, notes = problems(root, export)
    for note in notes:
        print(note)
    for problem in found:
        print(f"FAIL  {problem}", file=sys.stderr)
    if found:
        print(
            "Read the change before any make there; make -f Makefile reads only the Makefile.",
            file=sys.stderr,
        )
        return 1
    print("makefiles: GNUmakefile holds only its include, and there is no makefile")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
