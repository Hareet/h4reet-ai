"""Tests for tools/gates/makefiles_check.py (tasks.md T183): the committed GNUmakefile passes, the sandbox's placeholders
count as no makefile, each way a branch could change what make reads before the Makefile fails, and what it shows of
a changed file can't drive the Author's terminal."""

from __future__ import annotations

import errno
import importlib.util
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
CHECK = REPO / "tools" / "gates" / "makefiles_check.py"
SPEC = importlib.util.spec_from_file_location("makefiles_check", CHECK)
assert SPEC and SPEC.loader
mc = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = mc
SPEC.loader.exec_module(mc)

PLANTED = b"help:\n\t@touch PWNED\n"


def test_the_committed_gnumakefile_passes() -> None:
    # In the main tree inside the sandbox, makefile is one of the sandbox's placeholders, which count as none.
    assert (REPO / "GNUmakefile").read_bytes() == mc.EXPECTED
    assert mc.problems(REPO)[0] == []


def test_make_check_runs_it_first() -> None:
    makefile = (REPO / "Makefile").read_text(encoding="utf-8")
    assert re.search(r"^CHECK_GATES := makefiles-check ", makefile, re.MULTILINE)
    assert re.search(
        r"^makefiles-check: .*\n\t\$\(PY_HOST\) tools/gates/makefiles_check\.py$",
        makefile,
        re.MULTILINE,
    )


@pytest.fixture
def tree(tmp_path: Path) -> Path:
    (tmp_path / "GNUmakefile").write_bytes(mc.EXPECTED)
    (tmp_path / "Makefile").write_text("help:\n", encoding="utf-8")
    return tmp_path


def test_a_tree_as_committed_passes(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert mc.main(["makefiles_check.py", str(tree)]) == 0
    assert "holds only its include" in capsys.readouterr().out


def test_dir_defaults_to_the_working_directory(
    tree: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(tree)
    assert mc.main(["makefiles_check.py"]) == 0


def test_only_the_sandboxs_two_placeholders_hold_nothing(tmp_path: Path) -> None:
    def made(name: str, data: bytes, mode: int) -> Path:
        path = tmp_path / name
        path.write_bytes(data)
        path.chmod(mode)
        return path

    (tmp_path / "link").symlink_to("/dev/null")
    assert mc.placeholder(Path("/dev/null")) == "the sandbox's mask, /dev/null's device"
    assert "no write bits" in (mc.placeholder(made("empty-0444", b"", 0o444)) or "")
    assert mc.placeholder(Path("/dev/zero")) is None  # a device too, but 1:5
    assert (
        mc.placeholder(made("empty-0644", b"", 0o644)) is None
    )  # a checkout's empty file
    assert mc.placeholder(made("full-0444", PLANTED, 0o444)) is None
    assert mc.placeholder(tmp_path / "link") is None  # a link to the device isn't it


def test_a_session_placeholder_at_makefile_counts_as_none(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # What a command started while another runs sees at makefile, and what the host shows meanwhile.
    (tree / "makefile").write_bytes(b"")
    (tree / "makefile").chmod(0o444)
    assert mc.main(["makefiles_check.py", str(tree)]) == 0
    assert "a running or killed session's" in capsys.readouterr().out


def test_the_sandbox_mask_at_makefile_counts_as_none(
    tree: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    # Making a device takes root, so the device's own test is the one above; here a stand-in answers for it.
    (tree / "makefile").write_bytes(b"")
    monkeypatch.setattr(
        mc,
        "placeholder",
        lambda path: (
            "the sandbox's mask, /dev/null's device"
            if path.name == "makefile"
            else None
        ),
    )
    assert mc.main(["makefiles_check.py", str(tree)]) == 0
    assert "the sandbox's mask" in capsys.readouterr().out


def change(tree: Path, how: str) -> None:
    gnu = tree / "GNUmakefile"
    lines = mc.EXPECTED.splitlines(keepends=True)
    if how == "a rule added":
        gnu.write_bytes(mc.EXPECTED + PLANTED)
    elif how == "another file included":
        gnu.write_bytes(b"".join(lines[:-1]) + b"include evil.mk\n")
    elif how == "a newline added":
        gnu.write_bytes(mc.EXPECTED + b"\n")
    elif how == "a comment changed":
        gnu.write_bytes(
            mc.EXPECTED.replace(b"Never add a rule here.", b"Add rules freely.")
        )
    elif how == "CRLF line ends":
        gnu.write_bytes(mc.EXPECTED.replace(b"\n", b"\r\n"))
    elif how == "not UTF-8":
        gnu.write_bytes(mc.EXPECTED + b"\xff\n")
    elif how == "missing":
        gnu.unlink()
    elif how == "a link to the same text":
        (tree / "elsewhere").write_bytes(mc.EXPECTED)
        gnu.unlink()
        gnu.symlink_to("elsewhere")
    elif how == "a directory":
        gnu.unlink()
        gnu.mkdir()
    elif how == "a makefile beside it":
        (tree / "makefile").write_bytes(PLANTED)
    elif how == "an empty writable makefile":
        (tree / "makefile").write_bytes(b"")
    else:
        raise AssertionError(how)


@pytest.mark.parametrize(
    ("how", "says"),
    [
        ("a rule added", "+help:"),
        ("another file included", "+include evil.mk"),
        ("a newline added", "differs from the text the Author committed"),
        ("a comment changed", "+# (tools/gates/makefiles_check.py). Add rules freely."),
        ("CRLF line ends", "\\x0d"),
        ("not UTF-8", "\\xff"),
        ("missing", "GNUmakefile is missing"),
        ("a link to the same text", "it is a link"),
        ("a directory", "isn't a regular file"),
        ("a makefile beside it", "a makefile exists"),
        ("an empty writable makefile", "a makefile exists"),
    ],
)
def test_a_change_fails(
    tree: Path, how: str, says: str, capsys: pytest.CaptureFixture[str]
) -> None:
    change(tree, how)
    assert mc.main(["makefiles_check.py", str(tree)]) == 1
    err = capsys.readouterr().err
    assert err.startswith("FAIL  ")
    assert says in err


def test_a_changed_file_cant_drive_the_terminal(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # OSC 52 would set the clipboard, CSI 2K erase a line, U+202E reverse what follows it, U+009B (an 8-bit CSI,
    # here as valid UTF-8) start a sequence, NEL and U+2028 break a line, U+3164 look blank, and U+E0001 tag text.
    hostile = (
        b"\x1b]52;c;ZWNobyBwd25lZA==\x07\x1b[2K\xe2\x80\xae\xc2\x9b2J\xc2\x85"
        b"\xe2\x80\xa8\xe3\x85\xa4\xf3\xa0\x80\x81\n"
    )
    (tree / "GNUmakefile").write_bytes(mc.EXPECTED + hostile)
    assert mc.main(["makefiles_check.py", str(tree)]) == 1
    err = capsys.readouterr().err
    for shown in (
        "\\x1b]52;",
        "\\x07",
        "\\x1b[2K",
        "\\u202e",
        "\\x9b2J",
        "\\x85",
        "\\u2028",
        "\\u3164",
        "\\U000e0001",
    ):
        assert shown in err
    raw = (
        "\x1b",
        "\x07",
        chr(0x202E),
        chr(0x9B),
        chr(0x85),
        chr(0x2028),
        chr(0x3164),
        chr(0xE0001),
    )
    assert not any(ch in err for ch in raw)
    assert err.isascii()


def test_a_long_file_is_read_only_in_part(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tree / "GNUmakefile").write_bytes(mc.EXPECTED + b"x" * 100_000)
    assert mc.main(["makefiles_check.py", str(tree)]) == 1
    assert f"the file's first {mc.SHOWN} bytes" in capsys.readouterr().err


@pytest.mark.skipif(os.geteuid() == 0, reason="root lists any directory")
def test_a_directory_it_cant_list_fails(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    tree.chmod(0o300)  # no read: listdir fails
    try:
        assert mc.main(["makefiles_check.py", str(tree)]) == 1
    finally:
        tree.chmod(0o700)
    assert "can't be checked" in capsys.readouterr().err


def test_a_fifo_fails_without_blocking(tree: Path) -> None:
    # Opening a FIFO would wait for a writer forever. Run as the gate runs it, with a timeout in case it ever does.
    gnu = tree / "GNUmakefile"
    gnu.unlink()
    os.mkfifo(gnu)
    done = subprocess.run(
        [sys.executable, "-I", "-B", str(CHECK), str(tree)],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert done.returncode == 1
    assert "isn't a regular file" in done.stderr


def test_the_gates_export_mode_has_no_placeholder(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # export_tree.py leaves an export read-only, so a committed empty makefile there is 0444, as a placeholder is.
    assert mc.main(["makefiles_check.py", "--export", str(tree)]) == 0
    (tree / "makefile").write_bytes(b"")
    (tree / "makefile").chmod(0o444)
    assert mc.main(["makefiles_check.py", str(tree)]) == 0  # a live tree's placeholder
    assert mc.main(["makefiles_check.py", "--export", str(tree)]) == 1
    assert "a makefile exists" in capsys.readouterr().err


def test_a_makefile_it_cant_stat_fails(
    tree: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def refused(path: Path) -> str | None:
        raise PermissionError(errno.EACCES, "Permission denied", str(path))

    (tree / "makefile").write_bytes(b"")
    monkeypatch.setattr(mc, "placeholder", refused)
    assert mc.main(["makefiles_check.py", str(tree)]) == 1
    assert "makefile can't be checked: Permission denied" in capsys.readouterr().err


@pytest.mark.parametrize(
    "argv",
    [
        ["makefiles_check.py", "a", "b"],
        ["makefiles_check.py", "--export", "a", "b"],
        ["makefiles_check.py", "--exported"],
        ["makefiles_check.py", ""],
        ["makefiles_check.py", "--export", ""],
        ["makefiles_check.py", "/nonexistent"],
    ],
)
def test_usage_errors(argv: list[str]) -> None:
    assert mc.main(argv) == 2
