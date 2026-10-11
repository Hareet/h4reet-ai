"""Tests for make secrets, tools/gates/secrets.sh (spec 000 FR-012, FR-041; plan §11; research.md R-35, R-36).

Each test builds its own repository in a temporary directory: a main working tree with its own .gitleaks.toml,
holding one rule for a probe token that the tests assemble at run time, so this file holds nothing shaped like a
secret. The real gitleaks scans those repositories where it is installed. A stand-in gitleaks records each call
and its flags, and stand-in mktemps fail the ways an unchecked mktemp fails open.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / "tools" / "gates" / "secrets.sh"
GITLEAKS = shutil.which("gitleaks")
BASH = (
    shutil.which("bash") or "/bin/bash"
)  # by path: a test's PATH may hold nothing at all
needs_gitleaks = pytest.mark.skipif(
    GITLEAKS is None, reason="needs gitleaks (make tools; the devcontainer has it)"
)
SYSTEM_PATH = "/usr/local/bin:/usr/bin:/bin"
PATH = f"{Path(GITLEAKS).parent}:{SYSTEM_PATH}" if GITLEAKS else SYSTEM_PATH
TOKEN = "h4probe_" + "q" * 20
CONFIG = """title = "probe"
[[rules]]
id = "probe-token"
description = "a probe token, assembled at run time"
regex = '''h4probe_[a-z]{20}'''
keywords = ["h4probe_"]
"""
# A worktree's own config that would switch every rule off, if gitleaks read it.
NOTHING = """title = "nothing"
[allowlist]
paths = ['''.*''']
"""

STUB_GITLEAKS = r"""#!/usr/bin/env python3
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[1:]
ignore = args[args.index("--gitleaks-ignore-path") + 1] if "--gitleaks-ignore-path" in args else ""
entry = {
    "argv": args,
    "cwd": os.getcwd(),
    "no_replace": os.environ.get("GIT_NO_REPLACE_OBJECTS"),
    "ignore_was_fresh": bool(ignore) and os.path.isdir(ignore) and not os.path.islink(ignore)
    and not os.listdir(ignore),
}
with open(os.path.join(here, "gitleaks.calls"), "a", encoding="utf-8") as handle:
    handle.write(json.dumps(entry) + "\n")
def control(name, default=""):
    path = os.path.join(here, "gitleaks." + name)
    return open(path, encoding="utf-8").read().strip() if os.path.exists(path) else default
# A scan whose flags hold gitleaks.fail's text exits 1, as gitleaks does on its own errors.
fail = control("fail")
if fail and fail in " ".join(args):
    sys.exit(1)
# Otherwise what gitleaks 8.30.1 does, unless gitleaks.mode says otherwise: its log on stderr, a JSON report, 0 when
# clean, and --exit-code's value with findings.
mode = control("mode", "clean")
def log(line):
    print("6:25PM " + line, file=sys.stderr)
if mode == "git-error":  # git failed beneath it: gitleaks logs git's error and exits 0
    log("ERR [git] fatal: bad object")
    log('ERR error="stderr is not empty"')
if mode != "no-count":
    log("INF " + control("scanned", "1") + " commits scanned.")
log("INF scanned ~10 bytes (10 bytes) in 1ms")
findings = []
if mode == "finds":
    findings = [{"RuleID": "probe-token", "File": "c.txt", "StartLine": 1, "Commit": "c" * 40}]
    log("WRN leaks found: 1")
if mode != "no-report":
    report = args[args.index("--report-path") + 1]
    with open(report, "w", encoding="utf-8") as handle:
        json.dump(findings, handle)
code = int(args[args.index("--exit-code") + 1]) if "--exit-code" in args else 1
sys.exit(code if findings else 0)
"""


def git(cwd: Path, *args: str) -> str:
    done = subprocess.run(
        [
            "git",
            "-C",
            str(cwd),
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@example.invalid",
            "-c",
            "commit.gpgsign=false",
            *args,
        ],
        env={
            "PATH": SYSTEM_PATH,
            "HOME": str(cwd),
            "LC_ALL": "C",
            "GIT_CONFIG_NOSYSTEM": "1",
        },
        capture_output=True,
        text=True,
        check=True,
    )
    return done.stdout.strip()


def commit(tree: Path, name: str, text: str, message: str) -> None:
    (tree / name).write_text(text, encoding="utf-8")
    git(tree, "add", name)
    git(tree, "commit", "-qm", message)


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """A main working tree on a feature branch one clean commit past main, with the probe rule in .gitleaks.toml."""
    main = tmp_path / "main"
    main.mkdir()
    git(main, "init", "-q", "-b", "main")
    (main / ".gitleaks.toml").write_text(CONFIG, encoding="utf-8")
    git(main, "add", ".gitleaks.toml")
    commit(main, "a.txt", "hello\n", "init")
    git(main, "switch", "-qc", "feature")
    commit(main, "b.txt", "clean\n", "feature work")
    return main


@pytest.fixture
def stub_bin(tmp_path: Path) -> Path:
    """A directory first on PATH with the stand-in gitleaks."""
    path = tmp_path / "stub-bin"
    path.mkdir()
    stub = path / "gitleaks"
    stub.write_text(STUB_GITLEAKS, encoding="utf-8")
    stub.chmod(0o755)
    return path


def calls(stub_bin: Path) -> list[dict]:
    log = stub_bin / "gitleaks.calls"
    if not log.exists():
        return []
    return [json.loads(line) for line in log.read_text(encoding="utf-8").splitlines()]


def secrets(cwd: Path, path: str = PATH) -> subprocess.CompletedProcess[str]:
    scratch = (
        cwd.parent / "tmp"
    )  # mktemp's own directory, so the run never needs a writable /tmp
    scratch.mkdir(exist_ok=True)
    return subprocess.run(
        [BASH, str(SCRIPT)],
        cwd=cwd,
        env={"PATH": path, "HOME": str(cwd), "LC_ALL": "C", "TMPDIR": str(scratch)},
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )


def mktemp_stub(stub_bin: Path, body: str) -> None:
    stub = stub_bin / "mktemp"
    stub.write_text(f"#!/bin/sh\n{body}\n", encoding="utf-8")
    stub.chmod(0o755)


def leaks_control(stub_bin: Path, name: str, value: str) -> None:
    """A control file for the stand-in gitleaks: mode, scanned, or fail."""
    (stub_bin / f"gitleaks.{name}").write_text(value, encoding="utf-8")


def verdicts(done: subprocess.CompletedProcess[str]) -> dict[str, str]:
    """Each scan's "-> PASS label" or "-> FAIL label: why" line, by the label's first two words."""
    found = {}
    for line in done.stdout.splitlines():
        if line.startswith(("-> PASS ", "-> FAIL ")):
            words = line.split()
            found[" ".join(words[2:4]).rstrip(":")] = line
    return found


def path_without(tmp_path: Path, missing: str) -> str:
    """A PATH with every program in /usr/bin and /bin but one, each linked into a folder of its own."""
    folder = tmp_path / f"without-{missing}"
    folder.mkdir()
    for directory in ("/usr/bin", "/bin"):
        for entry in os.scandir(directory):
            if entry.name != missing and not os.path.lexists(folder / entry.name):
                (folder / entry.name).symlink_to(entry.path)
    assert shutil.which(missing, path=str(folder)) is None
    return str(folder)


# --------------------------------------------------------------------------------------------------
# The three scans, each with the flags of plan §11 (a stand-in gitleaks records them)
# --------------------------------------------------------------------------------------------------
def test_three_scans_each_with_the_main_trees_config_a_fresh_empty_ignore_path_and_no_allow_comments(
    repo: Path, stub_bin: Path
) -> None:
    done = secrets(repo, f"{stub_bin}:{SYSTEM_PATH}")
    assert done.returncode == 0, done.stderr
    base = git(repo, "merge-base", "main", "HEAD")
    made = calls(stub_bin)
    assert [c["argv"][:3] for c in made] == [
        ["git", "--pre-commit", "--no-banner"],
        ["git", "--pre-commit", "--staged"],
        ["git", f"--log-opts={base}..HEAD", "--no-banner"],
    ]
    ignore_dirs = set()
    for call in made:
        argv = call["argv"]
        assert argv[argv.index("--exit-code") + 1] == "99"
        assert argv[argv.index("--config") + 1] == str(repo / ".gitleaks.toml")
        assert "--ignore-gitleaks-allow" in argv
        assert "--redact" in argv
        assert argv[-1] == str(repo)  # the scan source: the work tree make runs in
        assert call["ignore_was_fresh"], (
            "the ignore path wasn't a fresh, empty directory"
        )
        assert (
            call["no_replace"] == "1"
        )  # git log reads the commits' own objects, never a replacement
        ignore_dirs.add(argv[argv.index("--gitleaks-ignore-path") + 1])
    (ignore,) = ignore_dirs
    assert os.path.isabs(ignore)
    assert not Path(ignore).exists(), "the ignore directory outlived the run"
    assert "secrets: PASS" in done.stdout


def test_a_failing_scan_fails_the_run_and_the_others_still_run(
    repo: Path, stub_bin: Path
) -> None:
    (stub_bin / "gitleaks.fail").write_text("--staged", encoding="utf-8")
    done = secrets(repo, f"{stub_bin}:{SYSTEM_PATH}")
    assert done.returncode == 1
    assert len(calls(stub_bin)) == 3
    assert "staged changes" in done.stdout + done.stderr
    assert "secrets: FAIL" in done.stdout + done.stderr


def test_an_error_gitleaks_only_logs_fails_every_scan(
    repo: Path, stub_bin: Path
) -> None:
    # gitleaks 8.30.1 logs git's own failure and exits 0, as if it had found nothing.
    leaks_control(stub_bin, "mode", "git-error")
    done = secrets(repo, f"{stub_bin}:{SYSTEM_PATH}")
    assert done.returncode == 1
    found = verdicts(done)
    assert len(found) == 3, done.stdout
    for line in found.values():
        assert line.startswith("-> FAIL "), line
        assert "gitleaks logged an error, so its scan may be partial: " in line, line
    assert "secrets: FAIL" in done.stdout


def test_a_range_scan_that_doesnt_say_its_count_fails(
    repo: Path, stub_bin: Path
) -> None:
    # The --pre-commit scans count no commits, so only the range scan needs the line.
    leaks_control(stub_bin, "mode", "no-count")
    done = secrets(repo, f"{stub_bin}:{SYSTEM_PATH}")
    assert done.returncode == 1
    found = verdicts(done)
    assert found["unstaged changes"].startswith("-> PASS ")
    assert found["staged changes"].startswith("-> PASS ")
    assert found["1 commits"].startswith("-> FAIL "), done.stdout
    assert "gitleaks didn't say how many commits it scanned" in found["1 commits"]


def test_a_range_scan_of_no_commits_fails_when_the_branch_adds_lines(
    repo: Path, stub_bin: Path
) -> None:
    leaks_control(stub_bin, "scanned", "0")
    done = secrets(repo, f"{stub_bin}:{SYSTEM_PATH}")
    assert done.returncode == 1
    line = verdicts(done)["1 commits"]
    assert "gitleaks scanned 0 commits, though the branch adds 1 line(s)" in line


def test_a_branch_that_adds_no_line_may_scan_no_commits(
    repo: Path, stub_bin: Path
) -> None:
    # gitleaks counts a commit only when its diff has a line: deletions and empty commits honestly scan none.
    git(repo, "switch", "-qc", "deletions", "main")
    git(repo, "rm", "-q", "a.txt")
    git(repo, "commit", "-qm", "a deletion")
    git(repo, "commit", "-q", "--allow-empty", "-m", "nothing")
    leaks_control(stub_bin, "scanned", "0")
    done = secrets(repo, f"{stub_bin}:{SYSTEM_PATH}")
    assert done.returncode == 0, done.stdout + done.stderr


@pytest.mark.parametrize("mode", ["no-report"])
def test_a_scan_without_a_readable_report_fails(
    repo: Path, stub_bin: Path, mode: str
) -> None:
    leaks_control(stub_bin, "mode", mode)
    done = secrets(repo, f"{stub_bin}:{SYSTEM_PATH}")
    assert done.returncode == 1
    for line in verdicts(done).values():
        assert "gitleaks wrote no readable report" in line, line


def test_findings_without_jq_say_jq_is_missing(
    repo: Path, stub_bin: Path, tmp_path: Path
) -> None:
    leaks_control(stub_bin, "mode", "finds")
    done = secrets(repo, f"{stub_bin}:{path_without(tmp_path, 'jq')}")
    assert done.returncode == 1
    for line in verdicts(done).values():
        assert line.startswith("-> FAIL "), line
        assert "jq is missing" in line, line
        assert "couldn't scan" not in line


def test_findings_are_named_with_their_commit(repo: Path, stub_bin: Path) -> None:
    leaks_control(stub_bin, "mode", "finds")
    done = secrets(repo, f"{stub_bin}:{SYSTEM_PATH}")
    assert done.returncode == 1
    assert "  probe-token in c.txt:1 (commit cccccccccccc)" in done.stdout
    # Exit 99, gitleaks' code for findings with --exit-code 99: nothing else is wrong with the scan.
    assert verdicts(done)["1 commits"].endswith(
        ": gitleaks found something shaped like a secret; keep it out of the repository"
    )


def test_from_a_linked_worktree_it_reads_the_main_trees_config_and_scans_the_worktree(
    repo: Path, stub_bin: Path, tmp_path: Path
) -> None:
    worktree = tmp_path / "wt"
    git(repo, "worktree", "add", "-q", "-b", "other", str(worktree))
    (worktree / ".gitleaks.toml").write_text(NOTHING, encoding="utf-8")
    done = secrets(worktree, f"{stub_bin}:{SYSTEM_PATH}")
    assert done.returncode == 0, done.stderr
    for call in calls(stub_bin):
        argv = call["argv"]
        assert argv[argv.index("--config") + 1] == str(repo / ".gitleaks.toml")
        assert argv[-1] == str(worktree)


# --------------------------------------------------------------------------------------------------
# Refusals before anything is scanned
# --------------------------------------------------------------------------------------------------
def test_missing_gitleaks_fails_closed(repo: Path, tmp_path: Path) -> None:
    empty = tmp_path / "no-tools"
    empty.mkdir()
    done = secrets(repo, str(empty))
    assert done.returncode != 0
    assert "gitleaks isn't installed" in done.stderr


def test_no_config_in_the_main_tree_fails_closed(repo: Path, stub_bin: Path) -> None:
    (repo / ".gitleaks.toml").unlink()
    done = secrets(repo, f"{stub_bin}:{SYSTEM_PATH}")
    assert done.returncode == 1
    assert "no .gitleaks.toml in the main working tree" in done.stderr
    assert calls(stub_bin) == []


def test_no_main_branch_fails_closed(repo: Path, stub_bin: Path) -> None:
    git(repo, "branch", "-m", "main", "trunk")
    done = secrets(repo, f"{stub_bin}:{SYSTEM_PATH}")
    assert done.returncode == 1
    assert "main" in done.stderr
    assert calls(stub_bin) == []


@pytest.mark.parametrize(
    ("body", "says"),
    [
        # Prints nothing and succeeds: $(mktemp -d) is "", the fail-open case (R-35).
        ("exit 0", "mktemp -d gave '', not an absolute path"),
        ("exit 1", "mktemp -d failed"),
        (
            'f="$TMPDIR_FOR_STUB/a-file"; : > "$f"; echo "$f"',
            "not a fresh empty directory",
        ),
        (
            'd="$TMPDIR_FOR_STUB/full"; mkdir -p "$d"; : > "$d/.gitleaksignore"; echo "$d"',
            "not a fresh empty directory",
        ),
        # A directory relative to the working directory, which exists there.
        ("echo relative-dir", "mktemp -d gave 'relative-dir', not an absolute path"),
    ],
)
def test_an_unchecked_mktemp_never_reaches_gitleaks(
    repo: Path, stub_bin: Path, tmp_path: Path, body: str, says: str
) -> None:
    scratch = tmp_path / "scratch"
    scratch.mkdir()
    (repo / "relative-dir").mkdir()
    mktemp_stub(stub_bin, body.replace("$TMPDIR_FOR_STUB", str(scratch)))
    done = secrets(repo, f"{stub_bin}:{SYSTEM_PATH}")
    assert done.returncode == 1
    assert says in done.stderr
    assert calls(stub_bin) == []


@pytest.mark.parametrize("content", ["", "x:y:z:1\n"])
def test_a_gitleaksignore_at_a_linked_worktrees_root_is_refused_even_empty(
    repo: Path, stub_bin: Path, tmp_path: Path, content: str
) -> None:
    worktree = tmp_path / "wt"
    git(repo, "worktree", "add", "-q", "-b", "other", str(worktree))
    (worktree / ".gitleaksignore").write_text(content, encoding="utf-8")
    done = secrets(worktree, f"{stub_bin}:{SYSTEM_PATH}")
    assert done.returncode == 1
    assert ".gitleaksignore" in done.stderr
    assert calls(stub_bin) == []


def test_a_gitleaksignore_with_entries_in_the_main_tree_is_refused(
    repo: Path, stub_bin: Path
) -> None:
    (repo / ".gitleaksignore").write_text("x:y:z:1\n", encoding="utf-8")
    done = secrets(repo, f"{stub_bin}:{SYSTEM_PATH}")
    assert done.returncode == 1
    assert ".gitleaksignore" in done.stderr
    assert calls(stub_bin) == []


def test_the_main_trees_empty_placeholder_holds_nothing_and_is_let_through(
    repo: Path, stub_bin: Path
) -> None:
    # A killed session leaves the sandbox's mount point there as an empty file, which the sandbox denies agents.
    (repo / ".gitleaksignore").write_text("", encoding="utf-8")
    done = secrets(repo, f"{stub_bin}:{SYSTEM_PATH}")
    assert done.returncode == 0, done.stderr
    assert len(calls(stub_bin)) == 3


def test_a_link_or_a_fifo_in_the_main_tree_is_refused(
    repo: Path, stub_bin: Path, tmp_path: Path
) -> None:
    target = tmp_path / "elsewhere"
    target.write_text("", encoding="utf-8")
    (repo / ".gitleaksignore").symlink_to(target)
    assert secrets(repo, f"{stub_bin}:{SYSTEM_PATH}").returncode == 1
    (repo / ".gitleaksignore").unlink()
    os.mkfifo(
        repo / ".gitleaksignore"
    )  # size 0, but gitleaks reads what a writer feeds it
    done = secrets(repo, f"{stub_bin}:{SYSTEM_PATH}")
    assert done.returncode == 1
    assert calls(stub_bin) == []


# --------------------------------------------------------------------------------------------------
# The real gitleaks: what each scan finds, and what can't switch a finding off
# --------------------------------------------------------------------------------------------------
@needs_gitleaks
def test_a_clean_branch_passes(repo: Path) -> None:
    done = secrets(repo)
    assert done.returncode == 0, done.stdout + done.stderr
    assert "secrets: PASS" in done.stdout


@needs_gitleaks
def test_an_unstaged_change_is_found(repo: Path) -> None:
    (repo / "a.txt").write_text(f"hello\nvalue {TOKEN}\n", encoding="utf-8")
    done = secrets(repo)
    assert done.returncode == 1
    out = done.stdout + done.stderr
    assert "probe-token in a.txt:2" in out
    assert "unstaged changes" in out
    assert TOKEN not in out  # redacted


@needs_gitleaks
def test_a_staged_change_is_found(repo: Path) -> None:
    (repo / "c.txt").write_text(f"value {TOKEN}\n", encoding="utf-8")
    git(repo, "add", "c.txt")
    done = secrets(repo)
    assert done.returncode == 1
    assert "probe-token in c.txt:1" in done.stdout + done.stderr
    assert TOKEN not in done.stdout + done.stderr


@needs_gitleaks
def test_a_commit_since_main_is_found_even_once_removed(repo: Path) -> None:
    commit(repo, "c.txt", f"value {TOKEN}\n", "add it")
    commit(repo, "c.txt", "gone\n", "remove it")
    done = secrets(repo)
    assert done.returncode == 1
    out = done.stdout + done.stderr
    assert "probe-token in c.txt:1" in out
    assert "commits since main" in out


@needs_gitleaks
def test_a_commit_main_already_holds_is_outside_the_range(repo: Path) -> None:
    git(repo, "switch", "-q", "main")
    commit(repo, "old.txt", f"value {TOKEN}\n", "on main before the branch")
    git(repo, "switch", "-qc", "later")
    commit(repo, "d.txt", "clean\n", "later work")
    done = secrets(repo)
    assert done.returncode == 0, done.stdout + done.stderr


@needs_gitleaks
def test_a_branch_of_deletions_and_empty_commits_passes(repo: Path) -> None:
    # The real gitleaks scans no commit of such a branch: it counts only commits whose diff has a line.
    git(repo, "switch", "-qc", "deletions", "main")
    git(repo, "rm", "-q", "a.txt")
    git(repo, "commit", "-qm", "a deletion")
    git(repo, "commit", "-q", "--allow-empty", "-m", "nothing")
    done = secrets(repo)
    assert done.returncode == 0, done.stdout + done.stderr
    assert "INF 0 commits scanned" in done.stdout


@needs_gitleaks
def test_a_gitleaks_allow_comment_doesnt_hide_a_finding(repo: Path) -> None:
    commit(repo, "c.txt", f"value {TOKEN}  # gitleaks:allow\n", "marked")
    done = secrets(repo)
    assert done.returncode == 1
    assert "probe-token in c.txt:1" in done.stdout + done.stderr


@needs_gitleaks
def test_a_worktrees_own_config_doesnt_switch_the_rules_off(
    repo: Path, tmp_path: Path
) -> None:
    worktree = tmp_path / "wt"
    git(repo, "worktree", "add", "-q", "-b", "other", str(worktree))
    (worktree / ".gitleaks.toml").write_text(NOTHING, encoding="utf-8")
    git(worktree, "add", ".gitleaks.toml")
    commit(
        worktree, "c.txt", f"value {TOKEN}\n", "with a config that allows everything"
    )
    done = secrets(worktree)
    assert done.returncode == 1
    assert "probe-token in c.txt:1" in done.stdout + done.stderr


# --------------------------------------------------------------------------------------------------
# The make target
# --------------------------------------------------------------------------------------------------
def test_make_secrets_runs_the_script_and_make_check_lists_it_without_a_mark() -> None:
    text = (REPO / "Makefile").read_text(encoding="utf-8")
    gates = next(
        line for line in text.splitlines() if line.startswith("CHECK_GATES :=")
    )
    assert (
        " secrets " in f" {gates.split(':=', 1)[1]} "
    )  # T091 added the target, so its mark is gone
    done = subprocess.run(
        ["make", "-f", "Makefile", "--no-print-directory", "-n", "secrets"],
        cwd=REPO,
        env={"PATH": SYSTEM_PATH, "HOME": str(REPO), "LC_ALL": "C"},
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert done.returncode == 0, done.stderr
    assert "bash tools/gates/secrets.sh" in done.stdout
    phony = " ".join(
        line for line in text.split(".PHONY:")[-1].splitlines() if line.strip()
    )
    assert " secrets " in f" {phony.replace(chr(92), ' ')} "
