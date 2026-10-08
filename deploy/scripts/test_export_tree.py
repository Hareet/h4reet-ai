"""Tests for deploy/scripts/export_tree.py (contracts/env-files.md §12), on a throwaway git repository."""

from __future__ import annotations

import importlib.util
import os
import stat
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "export_tree", REPO / "deploy" / "scripts" / "export_tree.py"
)
assert SPEC and SPEC.loader
et = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = et
SPEC.loader.exec_module(et)

IDENTITY = {
    "GIT_AUTHOR_NAME": "t",
    "GIT_AUTHOR_EMAIL": "t@example.invalid",
    "GIT_COMMITTER_NAME": "t",
    "GIT_COMMITTER_EMAIL": "t@example.invalid",
}


def git(repo: Path, *args: str) -> str:
    env = {**os.environ, **IDENTITY, "HOME": str(repo.parent)}
    done = subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        env=env,
        check=True,
    )
    return done.stdout.strip()


def commit(repo: Path, text: str) -> str:
    (repo / "deploy").mkdir(exist_ok=True)
    (repo / "deploy/compose.yaml").write_text(
        f"# {text}\nservices: {{}}\n", encoding="utf-8"
    )
    (repo / "deploy/run.sh").write_text("#!/bin/sh\necho hi\n", encoding="utf-8")
    (repo / "deploy/run.sh").chmod(0o755)
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", text)
    return git(repo, "rev-parse", "HEAD")


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    git(repo, "init", "-q", "-b", "main")
    return repo


def export(repo: Path, state: Path, *extra: str) -> int:
    return et.main(
        ["--stack", "dev", "--repo", str(repo), "--state-dir", str(state), *extra]
    )


def run_file(state: Path) -> dict[str, str]:
    return dict(
        line.split("=", 1) for line in (state / "run.env").read_text().splitlines()
    )


def test_it_exports_the_commit_read_only_and_writes_the_run_file(
    repo: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    sha = commit(repo, "first")
    (repo / "deploy/compose.yaml").write_text("uncommitted\n", encoding="utf-8")
    (repo / "stray.txt").write_text("untracked\n", encoding="utf-8")
    state = tmp_path / "state"
    assert export(repo, state) == 0
    tree = state / "tree" / sha
    assert run_file(state) == {
        "H4_TREE": str(tree),
        "H4_REF": sha,
        "H4_REF_BRANCH": "main",
        "H4_REF_PREVIOUS": "",
    }
    assert (
        tree / "deploy/compose.yaml"
    ).read_text() == "# first\nservices: {}\n"  # the commit, not the tree
    assert not (tree / "stray.txt").exists()
    assert stat.S_IMODE((tree / "deploy/compose.yaml").stat().st_mode) == 0o444
    assert stat.S_IMODE((tree / "deploy/run.sh").stat().st_mode) == 0o555
    assert stat.S_IMODE((tree / "deploy").stat().st_mode) == 0o555
    assert stat.S_IMODE((state / "run.env").stat().st_mode) == 0o600
    assert stat.S_IMODE(state.stat().st_mode) == 0o700
    assert f"h4reet-dev: commit {sha} (main)" in capsys.readouterr().out


def test_the_previous_commit_and_the_rollback(
    repo: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    state = tmp_path / "state"
    first = commit(repo, "first")
    assert export(repo, state) == 0
    second = commit(repo, "second")
    assert export(repo, state) == 0
    assert run_file(state)["H4_REF_PREVIOUS"] == first
    assert f"rollback: make up ENV=dev REF={first}" in capsys.readouterr().out
    # The same commit again keeps what ran before it.
    assert export(repo, state) == 0
    assert run_file(state)["H4_REF_PREVIOUS"] == first
    # The rollback: the older commit, by SHA, detached; the newer becomes the previous.
    assert export(repo, state, "--ref", first) == 0
    assert run_file(state) | {} == {
        "H4_TREE": str(state / "tree" / first),
        "H4_REF": first,
        "H4_REF_BRANCH": "detached",
        "H4_REF_PREVIOUS": second,
    }


def test_at_most_three_exports_and_never_the_running_or_previous(
    repo: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    state = tmp_path / "state"
    shas = []
    for n in range(5):
        shas.append(commit(repo, f"c{n}"))
        assert export(repo, state) == 0
    kept = sorted(p.name for p in (state / "tree").iterdir())
    assert len(kept) == 3 and shas[-1] in kept and shas[-2] in kept
    assert "removed older exports" in capsys.readouterr().out
    # Rolling back to an old one that was pruned exports it again, and keeps the one it replaces.
    assert export(repo, state, "--ref", shas[0]) == 0
    kept = {p.name for p in (state / "tree").iterdir()}
    assert {shas[0], shas[-1]} <= kept and len(kept) == 3


def test_a_branch_name_is_recorded(repo: Path, tmp_path: Path) -> None:
    commit(repo, "first")
    git(repo, "branch", "feat/x")
    assert export(repo, tmp_path / "state", "--ref", "feat/x") == 0
    assert run_file(tmp_path / "state")["H4_REF_BRANCH"] == "feat/x"


@pytest.mark.parametrize(("ref", "code"), [("nope", 1), ("-c", 2), ("HEAD..main", 2)])
def test_bad_refs(repo: Path, tmp_path: Path, ref: str, code: int) -> None:
    commit(repo, "first")
    # make passes --ref=VALUE, so a value starting with "-" is a value, and refused, not an option.
    assert export(repo, tmp_path / "state", f"--ref={ref}") == code
    assert not (tmp_path / "state/run.env").exists()


def test_a_commit_without_a_compose_file_isnt_a_stack(
    repo: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (repo / "README").write_text("x\n", encoding="utf-8")
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "no compose")
    assert export(repo, tmp_path / "state") == 1
    assert "has no deploy/compose.yaml" in capsys.readouterr().err
    assert not list((tmp_path / "state/tree").iterdir())


def test_dev_cpu_has_no_export(repo: Path, tmp_path: Path) -> None:
    assert (
        et.main(
            [
                "--stack",
                "dev-cpu",
                "--repo",
                str(repo),
                "--state-dir",
                str(tmp_path / "s"),
            ]
        )
        == 2
    )
