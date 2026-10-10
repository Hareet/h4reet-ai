"""Tests for tools/gates/publish_check.py and make publish-check (spec 000 FR-042; plan §12; research.md R-36;
tasks.md T093).

Each test builds a throwaway repository shaped like h4reet.ai's: a committed .gitleaks.toml, corpus/.gitignore, and
the denylist untracked under corpus/intake/private/. It runs the script as make publish-check does, through
`python3 -I -B -X pycache_prefix=/dev/null`, with an environment the test builds whole, and reads its output. The
secret findings use the real gitleaks, which must be the pinned version; the refusals, the flags, and the denylist
and corpus rules use a fake gitleaks on PATH that records how it was run. The fake secrets are assembled at run time,
so this file holds none, and the denylisted phrases are made up for the fixtures.
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / "tools" / "gates" / "publish_check.py"
SPEC = importlib.util.spec_from_file_location("publish_check", SCRIPT)
assert SPEC and SPEC.loader
pc = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = pc  # dataclasses look their module up here
SPEC.loader.exec_module(pc)

PIN = next(
    line.split("=", 1)[1]
    for line in (REPO / ".devcontainer" / "toolchain.vars")
    .read_text(encoding="utf-8")
    .splitlines()
    if line.startswith("GITLEAKS_VERSION=")
)

IDENTITY = {
    "GIT_AUTHOR_NAME": "Fixture Author",
    "GIT_AUTHOR_EMAIL": "author@example.invalid",
    "GIT_COMMITTER_NAME": "Fixture Committer",
    "GIT_COMMITTER_EMAIL": "committer@example.invalid",
}

# The fixtures' denylist, written the way a hand-kept file might be: a comment, a blank line, mixed case, padding.
DENYLIST = "# the fixture's denylist\n\nZephyr Holdings\n  zephyr-holdings.example  \n# a comment\nlantern project\n"
PHRASE, PHRASE_LINE = "zephyr holdings", 3
DOMAIN, DOMAIN_LINE = "zephyr-holdings.example", 4
OTHER, OTHER_LINE = "lantern project", 6

# The fixtures' gitleaks configuration: gitleaks' own rules plus the project's operator-token rule, as the early
# patch's .gitleaks.toml has them (tasks.md T045).
GITLEAKS_TOML = """\
title = "publish-check fixture"

[extend]
useDefault = true

[[rules]]
id = "h4reet-operator-token"
description = "An h4reet.ai operator token for prod or dev"
regex = '''h4op_(?:prod|dev)_[A-Za-z0-9_-]{43}'''
keywords = ["h4op_"]
"""

needs_gitleaks = pytest.mark.skipif(
    shutil.which("gitleaks") is None,
    reason="needs gitleaks (make tools installs the pinned version)",
)
needs_make = pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")


def fake_token() -> str:
    """An operator token's shape, assembled at run time, which the fixture's operator-token rule matches."""
    return "h4op" + "_prod_" + secrets.token_urlsafe(32)[:43]


class Fixture:
    """A repository in a temporary directory, with a HOME of its own so no global git config or hook applies."""

    def __init__(self, root: Path, home: Path) -> None:
        self.root = root
        self.home = home
        root.mkdir(parents=True)
        self.git("init", "-q", "-b", "main")
        self.write(".gitleaks.toml", GITLEAKS_TOML)
        self.write("corpus/.gitignore", "intake/private/\n")
        self.write("README.md", "# A fixture for publish-check\n")
        self.denylist().write_text(DENYLIST, encoding="utf-8")
        self.first = self.commit("init")

    def git(self, *args: str, stdin: str | None = None, **env: str) -> str:
        done = subprocess.run(
            ["git", *args],
            cwd=self.root,
            env={
                "PATH": os.environ["PATH"],
                "HOME": str(self.home),
                **IDENTITY,
                **env,
            },
            input=stdin,
            capture_output=True,
            text=True,
            check=False,
            timeout=60,
        )
        assert done.returncode == 0, f"git {' '.join(args)}: {done.stderr}"
        return done.stdout.strip()

    def write(self, rel: str, text: str) -> None:
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def denylist(self) -> Path:
        path = self.root / "corpus" / "intake" / "private" / "denylist.txt"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def commit(
        self,
        message: str,
        files: dict[str, str | None] | None = None,
        force: tuple[str, ...] = (),
        **env: str,
    ) -> str:
        """Write (or, for None, delete) the files, stage everything, and commit; force adds ignored paths."""
        for rel, text in (files or {}).items():
            if text is None:
                (self.root / rel).unlink()
            else:
                self.write(rel, text)
        self.git("add", "-A")
        if force:
            self.git("add", "-f", *force)
        self.git("commit", "-q", "--allow-empty", "-m", message, **env)
        return self.git("rev-parse", "HEAD")


@pytest.fixture
def home(tmp_path: Path) -> Path:
    path = tmp_path / "home"
    path.mkdir()
    return path


@pytest.fixture
def repo(tmp_path: Path, home: Path) -> Fixture:
    return Fixture(tmp_path / "repo", home)


def run(
    cwd: Path, tmp_path: Path, path: str | None = None, **env: str
) -> subprocess.CompletedProcess[str]:
    """publish_check.py as make publish-check runs it, with an environment built whole: no SANDBOX_RUNTIME unless a
    test passes it, and a TMPDIR of its own, so a test can see the report's directory is gone afterwards."""
    scratch = tmp_path / "scratch"
    scratch.mkdir(exist_ok=True)
    environ = {
        "PATH": os.environ["PATH"] if path is None else path,
        "HOME": str(tmp_path / "home"),
        "TMPDIR": str(scratch),
        **env,
    }
    return subprocess.run(
        [sys.executable, "-I", "-B", "-X", "pycache_prefix=/dev/null", str(SCRIPT)],
        cwd=cwd,
        env=environ,
        capture_output=True,
        text=True,
        check=False,
        timeout=300,
    )


FAKE_GITLEAKS = """#!PYTHON -I
import json, os, sys
args = sys.argv[1:]
if args == ["version"]:
    print(os.environ.get("FAKE_GITLEAKS_VERSION", "vPIN"))
    sys.exit(0)
def value(flag):
    return args[args.index(flag) + 1]
ignore, report = value("--gitleaks-ignore-path"), value("--report-path")
record = {
    "argv": args,
    "cwd": os.getcwd(),
    "ignore": ignore,
    "ignore_entries": sorted(os.listdir(ignore)),
    "report_dir": os.path.dirname(report),
    "report_dir_mode": os.stat(os.path.dirname(report)).st_mode & 0o777,
    "names": sorted(k for k in os.environ if k.startswith(("GIT_", "GITLEAKS_"))),
}
with open(os.environ["FAKE_GITLEAKS_LOG"], "a", encoding="utf-8") as log:
    log.write(json.dumps(record) + "\\n")
mode = os.environ.get("FAKE_GITLEAKS_MODE", "clean")
leaks = int(value("--exit-code")) if "--exit-code" in args else 1
def say(line):
    print("4:52PM " + line, file=sys.stderr)
if mode == "crash":
    print("panic: the fake gitleaks crashed", file=sys.stderr)
    sys.exit(2)
if mode != "no-count":
    say("INF " + os.environ.get("FAKE_GITLEAKS_SCANNED", "1") + " commits scanned.")
if mode == "git-error":
    say("ERR [git] fatal: bad object")
    say('ERR error="stderr is not empty"')
entries = []
if mode == "leaks":
    entries = [{
        "RuleID": "fake-rule",
        "File": os.environ["FAKE_GITLEAKS_FILE"],
        "StartLine": 2,
        "Commit": os.environ["FAKE_GITLEAKS_COMMIT"],
        "Secret": "REDACTED",
        "Match": "REDACTED",
    }]
    say("WRN leaks found: 1")
with open(report, "w", encoding="utf-8") as out:
    out.write("not json" if mode == "garbage" else json.dumps(entries))
sys.exit(leaks if entries or mode == "garbage" else 0)
"""


def run_fake(
    cwd: Path, tmp_path: Path, **env: str
) -> tuple[subprocess.CompletedProcess[str], list[dict]]:
    """publish_check.py with the fake gitleaks first on PATH; returns the run and the fake's scan calls."""
    fake_bin = tmp_path / "fake-bin"
    fake_bin.mkdir(exist_ok=True)
    fake = fake_bin / "gitleaks"
    fake.write_text(
        FAKE_GITLEAKS.replace("PYTHON", sys.executable).replace("PIN", PIN),
        encoding="utf-8",
    )
    fake.chmod(0o755)
    log = tmp_path / "fake-gitleaks.log"
    done = run(
        cwd,
        tmp_path,
        path=f"{fake_bin}:{os.environ['PATH']}",
        FAKE_GITLEAKS_LOG=str(log),
        **env,
    )
    calls = (
        [json.loads(line) for line in log.read_text(encoding="utf-8").splitlines()]
        if log.exists()
        else []
    )
    return done, calls


def lines(done: subprocess.CompletedProcess[str]) -> list[str]:
    return done.stdout.splitlines()


def summary(done: subprocess.CompletedProcess[str]) -> str:
    out = lines(done)
    assert out, done.stderr
    return out[-1]


def assert_quiet(done: subprocess.CompletedProcess[str], *private: str) -> None:
    """Neither the phrases nor anything private the test names appears in the output, in any case."""
    out = (done.stdout + done.stderr).lower()
    for text in (PHRASE, DOMAIN, OTHER, *private):
        assert text.lower() not in out, f"the output holds {text!r}"


# --------------------------------------------------------------------------------------------------
# What a clean history and each kind of finding look like
# --------------------------------------------------------------------------------------------------
@needs_gitleaks
def test_a_clean_history_is_certified(repo: Fixture, tmp_path: Path) -> None:
    repo.commit(
        "notes",
        {
            "notes/plain.md": "Nothing private here.\n",
            "corpus/profile.md": "# Profile\nNo amounts.\n",
        },
    )
    done = run(repo.root, tmp_path)
    assert done.returncode == 0, done.stdout + done.stderr
    line = summary(done)
    assert line.startswith("publish-check: OK (exit 0) — 2 commits, ")
    assert f"gitleaks {PIN} scanned " in line
    assert "denylist applied (3 phrases)" in line
    assert line.endswith("0 problems")
    assert not any((tmp_path / "scratch").iterdir()), (
        "the report's directory outlived the run"
    )


@needs_gitleaks
def test_a_fake_secret_in_an_old_commit_is_found_and_never_printed(
    repo: Fixture, tmp_path: Path
) -> None:
    first, marked = fake_token(), fake_token()
    old = repo.commit(
        "add the old setting",
        {"config/old.txt": f"{first}\n{marked} # gitleaks:allow\n"},
    )
    repo.commit("drop the old setting", {"config/old.txt": None})
    done = run(repo.root, tmp_path)
    assert done.returncode == 1, done.stdout + done.stderr
    assert f"{old[:12]} config/old.txt:1: gitleaks rule h4reet-operator-token" in lines(
        done
    )
    # --ignore-gitleaks-allow: the marker on the second line switches nothing off.
    assert f"{old[:12]} config/old.txt:2: gitleaks rule h4reet-operator-token" in lines(
        done
    )
    assert summary(done).startswith("publish-check: FAIL (exit 1) — ")
    assert_quiet(done, first, marked)


def test_a_denylisted_phrase_in_a_removed_file_is_found_by_its_denylist_line(
    repo: Fixture, tmp_path: Path
) -> None:
    draft = repo.commit(
        "a draft",
        {"notes/draft.md": "# Draft\n\nLunch with ZEPHYR holdings on Friday.\n"},
    )
    repo.commit("drop the draft", {"notes/draft.md": None})
    done, _ = run_fake(repo.root, tmp_path)
    assert done.returncode == 1, done.stdout + done.stderr
    assert f"{draft[:12]} notes/draft.md:3: denylist line {PHRASE_LINE}" in lines(done)
    assert summary(done).startswith("publish-check: FAIL (exit 1) — ")
    assert "1 problem" in summary(done)
    assert_quiet(done, "lunch with")


def test_a_currency_amount_in_corpus_markdown_is_found_in_any_commit(
    repo: Fixture, tmp_path: Path
) -> None:
    amount = "a grant of $5,000"
    repo.write("corpus/intake/private/raw.md", f"{amount}\n")
    notes = repo.commit(
        "corpus notes",
        {
            "corpus/notes.md": f"# Notes\nThere was {amount} once.\n",
            # corpus-check's rule is for corpus Markdown outside the private intake: these three are out of it.
            "corpus/facts/money.yaml": f"note: {amount}\n",
            "docs/budget.md": f"{amount}\n",
        },
        force=("corpus/intake/private/raw.md",),
    )
    repo.commit("no amount", {"corpus/notes.md": "# Notes\nThere was a grant once.\n"})
    done, _ = run_fake(repo.root, tmp_path)
    assert done.returncode == 1, done.stdout + done.stderr
    currency = [line for line in lines(done) if "currency" in line]
    assert currency == [
        f"{notes[:12]} corpus/notes.md:2: currency amount (corpus-check's rule)"
    ]
    assert "$5,000" not in done.stdout + done.stderr
    assert_quiet(done)


def test_a_denylisted_author_email_is_found_once_at_its_first_commit(
    repo: Fixture, tmp_path: Path
) -> None:
    jane = {"GIT_AUTHOR_NAME": "Jane", "GIT_AUTHOR_EMAIL": f"jane@{DOMAIN}"}
    first = repo.commit("first by jane", {"a.txt": "a\n"}, **jane)
    repo.commit("second by jane", {"b.txt": "b\n"}, **jane)
    done, _ = run_fake(repo.root, tmp_path)
    assert done.returncode == 1, done.stdout + done.stderr
    assert (
        f"{first[:12]} author email: denylist line {DOMAIN_LINE} (and 1 more commit)"
        in lines(done)
    )
    assert not [line for line in lines(done) if "committer" in line]
    assert_quiet(done, "jane@")


def test_a_finding_is_attributed_to_the_first_commit_and_path_that_hold_it(
    repo: Fixture, tmp_path: Path
) -> None:
    first = repo.commit("plan", {"notes/plan.md": "The Lantern Project starts.\n"})
    # The same line, moved down a line, and an unrelated commit: nothing new to report.
    repo.commit("a heading", {"notes/plan.md": "# Plan\nThe Lantern Project starts.\n"})
    repo.commit("unrelated", {"notes/other.md": "x\n"})
    # The same text under a new path, and an edited line that still holds the phrase: each is new.
    copied = repo.commit("a copy", {"notes/copy.md": "The Lantern Project starts.\n"})
    edited = repo.commit(
        "an edit", {"notes/plan.md": "# Plan\nThe Lantern Project starts in May.\n"}
    )
    done, _ = run_fake(repo.root, tmp_path)
    assert done.returncode == 1, done.stdout + done.stderr
    assert [line for line in lines(done) if f"denylist line {OTHER_LINE}" in line] == [
        f"{first[:12]} notes/plan.md:1: denylist line {OTHER_LINE}",
        f"{copied[:12]} notes/copy.md:1: denylist line {OTHER_LINE}",
        f"{edited[:12]} notes/plan.md:2: denylist line {OTHER_LINE}",
    ]
    assert_quiet(done)


def test_messages_names_tags_refs_and_paths_are_checked_and_never_printed(
    repo: Fixture, tmp_path: Path
) -> None:
    tidy = repo.commit(
        "tidy up\n\nAgreed with Zephyr Holdings.",
        {"a.txt": "a\n"},
        GIT_COMMITTER_NAME="The Lantern Project",
    )
    named = repo.commit("a file named for it", {"notes/Lantern Project.md": "x\n"})
    repo.git(
        "tag",
        "-a",
        f"for/{DOMAIN}",
        "-m",
        "release\n\nfor the lantern project",
        tidy,
    )
    tag = repo.git("rev-parse", f"refs/tags/for/{DOMAIN}")
    repo.git("branch", f"deal/{DOMAIN}", tidy)
    done, _ = run_fake(repo.root, tmp_path)
    assert done.returncode == 1, done.stdout + done.stderr
    out = lines(done)
    for expected in (
        f"{tidy[:12]} commit message:3: denylist line {PHRASE_LINE}",
        f"{tidy[:12]} committer name: denylist line {OTHER_LINE}",
        f"{named[:12]} path notes/[denylist line {OTHER_LINE}].md: denylist line {OTHER_LINE}",
        f"{tag[:12]} tag name: denylist line {DOMAIN_LINE}",
        f"{tag[:12]} tag message:3: denylist line {OTHER_LINE}",
        f"{tidy[:12]} ref refs/heads/deal/[denylist line {DOMAIN_LINE}]: denylist line {DOMAIN_LINE}",
        f"{tag[:12]} ref refs/tags/for/[denylist line {DOMAIN_LINE}]: denylist line {DOMAIN_LINE}",
    ):
        assert expected in out, f"missing {expected!r} in {out}"
    assert_quiet(done)


def test_gitleaks_findings_name_commit_path_line_and_rule_and_hide_phrases_in_paths(
    repo: Fixture, tmp_path: Path
) -> None:
    sha = repo.commit("x", {"y.txt": "y\n"})
    done, _ = run_fake(
        repo.root,
        tmp_path,
        FAKE_GITLEAKS_MODE="leaks",
        FAKE_GITLEAKS_COMMIT=sha,
        FAKE_GITLEAKS_FILE="notes/Lantern Project.txt",
    )
    assert done.returncode == 1, done.stdout + done.stderr
    assert (
        f"{sha[:12]} notes/[denylist line {OTHER_LINE}].txt:2: gitleaks rule fake-rule"
        in lines(done)
    )
    assert_quiet(done)


def test_each_unique_blob_is_counted_once(repo: Fixture, tmp_path: Path) -> None:
    repo.commit("two copies", {"a.txt": "same\n", "b.txt": "same\n"})
    repo.commit("one more", {"c.txt": "other\n"})
    blobs = {
        line.split()[0]
        for line in repo.git("rev-list", "--all", "--objects").splitlines()
        if repo.git("cat-file", "-t", line.split()[0]) == "blob"
    }
    done, _ = run_fake(repo.root, tmp_path)
    assert done.returncode == 0, done.stdout + done.stderr
    assert f"3 commits, {len(blobs)} blobs, 1 ref" in summary(done)


def test_each_unique_blob_is_read_once(repo: Fixture) -> None:
    # The same blob in many commits and under two paths, and trees that repeat: one read each.
    repo.commit("two copies", {"a.txt": "same\n", "b.txt": "same\n"})
    repo.commit("unrelated", {"c.txt": "other\n"})
    repo.commit("empty", {})
    git = pc.Git(repo.root.resolve(), pc.scan_env())
    reads: list[str] = []
    with pc.Objects(git) as objects:
        real = objects.read

        def counted(oid: str) -> tuple[str, bytes]:
            reads.append(oid)
            return real(oid)

        objects.read = counted  # type: ignore[method-assign]
        report = pc.Report(deny=pc.Denylist([(1, "zephyr holdings")]))
        scanner = pc.Scanner(git, objects, report.deny, re.compile("$^"), report)
        scanner.commits(git.lines("rev-list", "--all", "--topo-order", "--reverse"))
    blob_reads = [oid for oid in reads if oid in scanner.blobs]
    assert sorted(blob_reads) == sorted(set(blob_reads)) and set(blob_reads) == set(
        scanner.blobs
    )


# --------------------------------------------------------------------------------------------------
# What can't hide a finding: replace refs, GIT_* variables, a linked worktree's own config
# --------------------------------------------------------------------------------------------------
def test_a_replace_ref_cant_hide_a_commit(repo: Fixture, tmp_path: Path) -> None:
    draft = repo.commit("draft", {"notes/draft.md": "zephyr holdings\n"})
    repo.commit("drop", {"notes/draft.md": None})
    clean = repo.git(
        "commit-tree", f"{repo.first}^{{tree}}", "-p", repo.first, "-m", "draft"
    )
    repo.git("replace", draft, clean)
    done, _ = run_fake(repo.root, tmp_path)
    assert done.returncode == 1, done.stdout + done.stderr
    assert f"{draft[:12]} notes/draft.md:1: denylist line {PHRASE_LINE}" in lines(done)


def test_git_variables_in_the_environment_cant_point_the_scan_elsewhere(
    repo: Fixture, tmp_path: Path
) -> None:
    draft = repo.commit("draft", {"notes/draft.md": "zephyr holdings\n"})
    elsewhere = tmp_path / "elsewhere.git"
    repo.git("init", "-q", "--bare", str(elsewhere))
    done, calls = run_fake(
        repo.root,
        tmp_path,
        GIT_DIR=str(elsewhere),
        GITLEAKS_CONFIG=str(tmp_path / "planted.toml"),
    )
    assert done.returncode == 1, done.stdout + done.stderr
    assert f"{draft[:12]} notes/draft.md:1: denylist line {PHRASE_LINE}" in lines(done)
    (call,) = calls
    assert call["names"] == [
        "GIT_NO_LAZY_FETCH",
        "GIT_NO_REPLACE_OBJECTS",
        "GIT_TERMINAL_PROMPT",
    ]


@needs_gitleaks
def test_a_linked_worktree_is_checked_with_the_main_trees_config_and_denylist(
    repo: Fixture, tmp_path: Path
) -> None:
    token = fake_token()
    old = repo.commit("old", {"old.txt": f"{token}\n"})
    repo.commit("gone", {"old.txt": None})
    linked = tmp_path / "linked"
    repo.git("worktree", "add", "-q", "-b", "side", str(linked))
    # A config in the linked worktree, which an agent working there could write, has no rules: it's never read.
    (linked / ".gitleaks.toml").write_text('title = "no rules"\n', encoding="utf-8")
    assert not (linked / "corpus" / "intake" / "private").exists()
    done = run(linked, tmp_path)
    assert done.returncode == 1, done.stdout + done.stderr
    assert f"{old[:12]} old.txt:1: gitleaks rule h4reet-operator-token" in lines(done)
    assert "denylist applied (3 phrases)" in summary(done)
    assert_quiet(done, token)
    for root in (linked, repo.root):
        ignore = root / ".gitleaksignore"
        ignore.write_text("anything\n", encoding="utf-8")
        done = run(linked, tmp_path)
        assert done.returncode == 3, done.stdout + done.stderr
        assert f"a .gitleaksignore exists at {root.resolve()}" in summary(done)
        ignore.unlink()


# --------------------------------------------------------------------------------------------------
# Exit 3: what it can't certify
# --------------------------------------------------------------------------------------------------
@pytest.mark.parametrize("kind", ["file", "dangling link", "directory"])
def test_a_gitleaksignore_at_the_root_means_it_cannot_certify(
    repo: Fixture, tmp_path: Path, kind: str
) -> None:
    target = repo.root / ".gitleaksignore"
    if kind == "file":
        target.write_text("fingerprint:old.txt:rule:1\n", encoding="utf-8")
    elif kind == "dangling link":
        target.symlink_to(tmp_path / "nowhere")
    else:
        target.mkdir()
    done, calls = run_fake(repo.root, tmp_path)
    assert done.returncode == 3, done.stdout + done.stderr
    line = summary(done)
    assert line.startswith("publish-check: CANNOT CERTIFY (exit 3) — ")
    assert ".gitleaksignore" in line and "research.md R-36" in line
    assert calls == []


def test_inside_the_agent_sandbox_it_cannot_certify(
    repo: Fixture, tmp_path: Path
) -> None:
    done, calls = run_fake(repo.root, tmp_path, SANDBOX_RUNTIME="1")
    assert done.returncode == 3, done.stdout + done.stderr
    assert "agent sandbox" in summary(done)
    assert calls == []


def test_a_shallow_clone_cannot_be_certified(repo: Fixture, tmp_path: Path) -> None:
    repo.commit("second", {"a.txt": "a\n"})
    shallow = tmp_path / "shallow"
    repo.git("clone", "-q", "--depth", "1", f"file://{repo.root}", str(shallow))
    denylist = shallow / "corpus" / "intake" / "private" / "denylist.txt"
    denylist.parent.mkdir(parents=True)
    denylist.write_text(DENYLIST, encoding="utf-8")
    done, calls = run_fake(shallow, tmp_path)
    assert done.returncode == 3, done.stdout + done.stderr
    assert "shallow" in summary(done)
    assert calls == []


def test_outside_a_work_tree_it_cannot_certify(tmp_path: Path, home: Path) -> None:
    empty = tmp_path / "empty"
    empty.mkdir()
    done, calls = run_fake(empty, tmp_path)
    assert done.returncode == 3, done.stdout + done.stderr
    assert "isn't inside a git work tree" in summary(done)
    assert calls == []


def test_without_the_main_trees_gitleaks_config_it_cannot_certify(
    repo: Fixture, tmp_path: Path
) -> None:
    (repo.root / ".gitleaks.toml").unlink()
    done, calls = run_fake(repo.root, tmp_path)
    assert done.returncode == 3, done.stdout + done.stderr
    assert "no .gitleaks.toml in the main working tree" in summary(done)
    assert calls == []


def test_without_gitleaks_it_cannot_certify(repo: Fixture, tmp_path: Path) -> None:
    only_git = tmp_path / "only-git"
    only_git.mkdir()
    git = shutil.which("git")
    assert git
    (only_git / "git").symlink_to(git)
    done = run(repo.root, tmp_path, path=str(only_git))
    assert done.returncode == 3, done.stdout + done.stderr
    assert "gitleaks isn't installed" in summary(done)


def test_another_gitleaks_version_cannot_certify(repo: Fixture, tmp_path: Path) -> None:
    done, calls = run_fake(repo.root, tmp_path, FAKE_GITLEAKS_VERSION="v8.0.0")
    assert done.returncode == 3, done.stdout + done.stderr
    assert f"is 8.0.0, not the pinned {PIN}" in summary(done)
    assert calls == []


@pytest.mark.parametrize("state", ["missing", "a directory", "no phrases", "not UTF-8"])
def test_without_a_usable_denylist_it_cannot_certify(
    repo: Fixture, tmp_path: Path, state: str
) -> None:
    path = repo.denylist()
    path.unlink()
    if state == "a directory":
        path.mkdir()
    elif state == "no phrases":
        path.write_text("# only comments\n\n   \n", encoding="utf-8")
    elif state == "not UTF-8":
        path.write_bytes(b"caf\xe9\n")
    done, calls = run_fake(repo.root, tmp_path)
    assert done.returncode == 3, done.stdout + done.stderr
    assert "the denylist" in summary(done)
    assert calls == []


@pytest.mark.parametrize(
    ("mode", "says"),
    [
        # gitleaks 8.30.1 logs git's own failures and exits 0, as if it had found nothing.
        ("git-error", "gitleaks reported errors, so its scan may be partial"),
        ("crash", "gitleaks exited 2"),
        ("garbage", "gitleaks' report can't be read"),
        ("no-count", "gitleaks didn't say how many commits it scanned"),
    ],
)
def test_a_gitleaks_run_that_may_be_partial_cannot_certify(
    repo: Fixture, tmp_path: Path, mode: str, says: str
) -> None:
    done, calls = run_fake(repo.root, tmp_path, FAKE_GITLEAKS_MODE=mode)
    assert done.returncode == 3, done.stdout + done.stderr
    assert says in summary(done)
    assert len(calls) == 1


def test_gitleaks_scanning_no_commits_of_a_history_with_content_cannot_certify(
    repo: Fixture, tmp_path: Path
) -> None:
    done, _ = run_fake(repo.root, tmp_path, FAKE_GITLEAKS_SCANNED="0")
    assert done.returncode == 3, done.stdout + done.stderr
    assert "gitleaks scanned no commits" in summary(done)


def test_a_ref_outside_every_commit_cannot_be_certified(
    repo: Fixture, tmp_path: Path
) -> None:
    blob = repo.git("hash-object", "-w", "--stdin", stdin="a loose blob\n")
    repo.git("tag", "loose", blob)
    done, _ = run_fake(repo.root, tmp_path)
    assert done.returncode == 3, done.stdout + done.stderr
    assert "ref refs/tags/loose names a blob outside every commit" in summary(done)


# --------------------------------------------------------------------------------------------------
# How gitleaks is run
# --------------------------------------------------------------------------------------------------
def test_gitleaks_runs_with_the_main_trees_config_an_empty_ignore_path_and_no_allow_markers(
    repo: Fixture, tmp_path: Path
) -> None:
    done, calls = run_fake(repo.root, tmp_path)
    assert done.returncode == 0, done.stdout + done.stderr
    (call,) = calls
    argv = call["argv"]
    top = str(repo.root.resolve())
    assert argv[0] == "git" and argv[-1] == top
    for flag in (
        "--log-opts=--all",
        "--redact",
        "--no-banner",
        "--ignore-gitleaks-allow",
    ):
        assert flag in argv, flag
    assert argv[argv.index("--config") + 1] == f"{top}/.gitleaks.toml"
    assert argv[argv.index("--report-format") + 1] == "json"
    # The ignore path is a fresh, empty directory, and gitleaks runs from it, so no .gitleaksignore is there.
    assert call["ignore_entries"] == [] and call["cwd"] == call["ignore"]
    # The report goes to a 0700 directory, deleted on exit.
    assert call["report_dir_mode"] == 0o700
    assert not Path(call["report_dir"]).exists()
    assert not any((tmp_path / "scratch").iterdir())


# --------------------------------------------------------------------------------------------------
# The pieces: the denylist as corpus-check reads it, its own currency rule, redaction
# --------------------------------------------------------------------------------------------------
def test_the_denylist_is_read_as_corpus_check_reads_it(tmp_path: Path) -> None:
    path = tmp_path / "denylist.txt"
    path.write_text(DENYLIST + "ZEPHYR HOLDINGS\n", encoding="utf-8")
    phrases = pc.read_denylist(path)
    # check_corpus: strip, lowercase, skip blank and # lines. A repeated phrase keeps its first line.
    assert phrases == [
        (PHRASE_LINE, PHRASE),
        (DOMAIN_LINE, DOMAIN),
        (OTHER_LINE, OTHER),
    ]
    text = path.read_text(encoding="utf-8")
    assert {p for _, p in phrases} == {
        s.strip().lower()
        for s in text.splitlines()
        if s.strip() and not s.lstrip().startswith("#")
    }


def test_the_currency_rule_is_corpus_checks_own() -> None:
    spec = importlib.util.spec_from_file_location(
        "check_corpus_for_publish_check", REPO / "corpus" / "tools" / "check_corpus.py"
    )
    assert spec and spec.loader
    check_corpus = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(check_corpus)
    assert pc.corpus_rule().pattern == check_corpus.CURRENCY.pattern


def test_redaction_names_each_phrases_line_and_can_be_trusted() -> None:
    deny = pc.Denylist([(3, "zephyr holdings"), (6, "lantern project"), (7, "line")])
    assert deny.redact("notes/Lantern Project.md") == "notes/[denylist line 6].md"
    assert deny.redact("ZEPHYR Holdings and lantern project") == (
        "[denylist line 3] and [denylist line 6]"
    )
    # "line" is in the label itself; the label isn't read as the phrase.
    assert deny.redact("a line") == "a [denylist line 7]"
    assert deny.redact("nothing here") == "nothing here"
    # Where the case-insensitive match and corpus-check's lowercase disagree, the whole text is hidden.
    odd = pc.Denylist([(2, "i̇stanbul")])
    shown = odd.redact("İstanbul office")
    assert "stanbul" not in shown.lower() and "denylist line 2" in shown


def test_without_a_temporary_directory_it_cannot_certify(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    def no_space(*_: object, **__: object) -> None:
        raise OSError(28, "No space left on device")

    monkeypatch.setattr(pc.tempfile, "TemporaryDirectory", no_space)
    report = pc.Report()
    found = pc.scan_secrets(
        "gitleaks", PIN, tmp_path, tmp_path / ".gitleaks.toml", {}, report
    )
    assert found == []
    assert report.reasons == [
        "there is no temporary directory for gitleaks' report (OSError)"
    ]


def test_a_crash_is_exit_3_with_a_summary_and_never_quotes_what_it_read(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    quoted = "token = " + secrets.token_hex(8)

    def crash(*_: object) -> None:
        raise ValueError(f"can't parse {quoted!r}")

    monkeypatch.setattr(pc, "certify", crash)
    assert pc.main([]) == 3
    out = capsys.readouterr().out
    assert out.strip() == (
        "publish-check: CANNOT CERTIFY (exit 3) — publish-check itself failed (ValueError)"
    )
    assert quoted not in out


def test_text_from_the_history_is_printed_without_control_characters() -> None:
    assert pc.printable("a\x1b[31mb\tc") == "a\\x1b[31mb\\tc"


def test_a_tool_pin_is_read_from_toolchain_vars(tmp_path: Path) -> None:
    pins = tmp_path / "toolchain.vars"
    pins.write_text(
        "# pins\nNODE_VERSION=24.21.0\nGITLEAKS_VERSION=8.30.1\n", encoding="utf-8"
    )
    assert pc.read_pin(pins, "GITLEAKS_VERSION") == "8.30.1"
    with pytest.raises(pc.CannotCertify):
        pc.read_pin(pins, "JQ_VERSION")


# --------------------------------------------------------------------------------------------------
# make publish-check, from the repository's Makefile
# --------------------------------------------------------------------------------------------------
def make(home: Path, *args: str, **env: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        # -f Makefile: T183's mask leaves plain make nothing to read in the main tree.
        ["make", "--no-print-directory", "-C", str(REPO), "-f", "Makefile", *args],
        env={"PATH": "/usr/bin:/bin", "HOME": str(home), **env},
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
    )


@needs_make
def test_make_publish_check_is_the_authors(home: Path) -> None:
    done = make(home, "publish-check", SANDBOX_RUNTIME="1")
    assert done.returncode == 2
    assert "make publish-check is the Author's" in done.stderr
    assert "publish-check:" not in done.stdout, "the script ran"


@needs_make
def test_make_publish_check_runs_the_script_through_py_host(home: Path) -> None:
    done = make(home, "-n", "publish-check")
    assert done.returncode == 0, done.stderr
    assert (
        "python3 -I -B -X pycache_prefix=/dev/null tools/gates/publish_check.py"
        in done.stdout
    )


def test_the_target_is_listed_as_the_authors() -> None:
    makefile = (REPO / "Makefile").read_text(encoding="utf-8")
    (line,) = [ln for ln in makefile.splitlines() if ln.startswith("publish-check:")]
    assert "## (the Author)" in line
    assert re.search(r"^\.PHONY:.*\bpublish-check\b", makefile, re.MULTILINE)
