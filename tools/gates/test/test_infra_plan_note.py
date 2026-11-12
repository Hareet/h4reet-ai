"""Tests for tools/gates/infra_plan_note.py, the gate's infra-plan-note step (spec 001 contracts/infra-records.md §2;
September's §3 at 00309c47; tasks.md T004): which roots need a block, the block's tree hash against HEAD:infra, exactly
one block per root, and the block's text through the redaction check. Hash-shaped values are made at run time."""

from __future__ import annotations

import hashlib
import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location(
    "infra_plan_note", REPO / "tools" / "gates" / "infra_plan_note.py"
)
assert SPEC and SPEC.loader
pn = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = pn
SPEC.loader.exec_module(pn)

NOTE = "docs/merge-requests/2026-11-10-feat-001-x.md"


def git(repo: Path, *args: str) -> str:
    out = subprocess.run(
        [
            "git",
            "-C",
            str(repo),
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@example.invalid",
            "-c",
            "commit.gpgsign=false",
            *args,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return out.stdout.strip()


def write(repo: Path, rel: str, text: str) -> None:
    path = repo / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def commit(repo: Path, message: str) -> str:
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", message)
    return git(repo, "rev-parse", "HEAD")


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    git(tmp_path, "init", "-q", "-b", "trunk")
    write(tmp_path, "README.md", "x\n")
    commit(tmp_path, "base")
    git(tmp_path, "switch", "-q", "-c", "feature")
    return tmp_path


def block(
    root: str, tree: str, text: str = "Plan: 1 to add, 0 to change, 0 to destroy."
) -> str:
    digest = hashlib.sha256(text.encode()).hexdigest()
    return (
        f"<!-- h4-plan root={root} tree={tree} sha256={digest} terraform=1.17.1 made=2026-11-10T06:00:00Z -->\n"
        "```terraform-plan\n"
        f"{text}\n"
        "```\n"
        "<!-- /h4-plan -->\n"
    )


def run(repo: Path) -> pn.Result:
    base = git(repo, "rev-parse", "trunk")
    return pn.check(repo, base, "HEAD")


def test_no_infra_change_is_skip(repo: Path) -> None:
    write(repo, "docs/x.md", "y\n")
    commit(repo, "docs")
    result = run(repo)
    assert result.status == "SKIP" and "no infra change" in result.lines[0]


def test_only_tests_or_readme_under_infra_is_skip(repo: Path) -> None:
    write(repo, "infra/test/test_x.py", "def test_x():\n    pass\n")
    write(repo, "infra/README.md", "x\n")
    commit(repo, "tests")
    assert run(repo).status == "SKIP"


def test_a_root_without_its_block_fails(repo: Path) -> None:
    write(repo, "infra/bootstrap/main.tf", "# x\n")
    write(repo, NOTE, "# note\n")
    commit(repo, "infra")
    result = run(repo)
    assert result.status == "FAIL"
    assert any(
        "plan for bootstrap missing or made from an older infra tree" in line
        for line in result.lines
    )


def test_the_block_names_the_tree(repo: Path) -> None:
    write(repo, "infra/bootstrap/main.tf", "# x\n")
    commit(repo, "infra")
    tree = git(repo, "rev-parse", "HEAD:infra")
    write(repo, NOTE, "# note\n\n" + block("bootstrap", tree))
    commit(repo, "note")
    result = run(repo)
    assert result.status == "PASS", result.lines
    assert tree in result.lines[0] and "bootstrap" in result.lines[0]


def test_a_stale_tree_fails(repo: Path) -> None:
    write(repo, "infra/bootstrap/main.tf", "# x\n")
    commit(repo, "infra")
    old = git(repo, "rev-parse", "HEAD:infra")
    write(repo, "infra/bootstrap/main.tf", "# y\n")
    write(repo, NOTE, block("bootstrap", old))
    commit(repo, "changed after the plan")
    assert run(repo).status == "FAIL"


def test_exactly_one_block_per_root(repo: Path) -> None:
    write(repo, "infra/bootstrap/main.tf", "# x\n")
    commit(repo, "infra")
    tree = git(repo, "rev-parse", "HEAD:infra")
    write(repo, NOTE, block("bootstrap", tree) + "\n" + block("bootstrap", tree))
    commit(repo, "two")
    result = run(repo)
    assert result.status == "FAIL" and any(
        "exactly one" in line for line in result.lines
    )


@pytest.mark.parametrize(
    ("path", "roots"),
    [
        ("infra/modules/tagged-bucket/main.tf", {"bootstrap", "account", "prod"}),
        ("infra/policy/taggable.txt", {"bootstrap", "account", "prod"}),
        ("infra/lambdas/probe/probe.py", {"account"}),
        ("infra/prod/rds.tf", {"prod"}),
    ],
)
def test_which_roots_a_change_needs(repo: Path, path: str, roots: set[str]) -> None:
    for r in roots:
        write(repo, f"infra/{r}/main.tf", "# the root\n")
    write(repo, path, "# x\n")
    commit(repo, "infra")
    assert pn.roots_for([path]) == roots
    tree = git(repo, "rev-parse", "HEAD:infra")
    write(repo, NOTE, "".join(block(r, tree) for r in sorted(roots)))
    commit(repo, "note")
    assert run(repo).status == "PASS"


def test_the_block_text_must_be_redacted(repo: Path) -> None:
    write(repo, "infra/prod/main.tf", "# x\n")
    commit(repo, "infra")
    tree = git(repo, "rev-parse", "HEAD:infra")
    leaked = "  + endpoint = someone" + "@" + "example.com"
    write(repo, NOTE, "intro\n" + block("prod", tree, leaked))
    commit(repo, "note")
    result = run(repo)
    assert result.status == "FAIL"
    assert any("an email address" in line and NOTE in line for line in result.lines)
    assert all("example.com" not in line for line in result.lines)


def test_a_block_with_a_bad_field_fails(repo: Path) -> None:
    write(repo, "infra/prod/main.tf", "# x\n")
    commit(repo, "infra")
    tree = git(repo, "rev-parse", "HEAD:infra")
    write(
        repo, NOTE, block("prod", tree).replace("terraform=1.17.1", "terraform=latest")
    )
    commit(repo, "note")
    assert run(repo).status == "FAIL"


def test_only_notes_the_branch_adds_or_changes_count(repo: Path) -> None:
    write(repo, "infra/prod/main.tf", "# x\n")
    commit(repo, "infra")
    tree = git(repo, "rev-parse", "HEAD:infra")
    # A block left uncommitted in the working tree doesn't count: the check reads the commit.
    write(repo, NOTE, block("prod", tree))
    assert run(repo).status == "FAIL"


def test_main_exit_codes(repo: Path, capsys: pytest.CaptureFixture[str]) -> None:
    base = git(repo, "rev-parse", "trunk")
    write(repo, "infra/prod/main.tf", "# x\n")
    commit(repo, "infra")
    assert pn.main(["--repo", str(repo), "--base", base, "--head", "HEAD"]) == 1
    tree = git(repo, "rev-parse", "HEAD:infra")
    write(repo, NOTE, block("prod", tree))
    commit(repo, "note")
    assert pn.main(["--repo", str(repo), "--base", base, "--head", "HEAD"]) == 0
    assert "PASS" in capsys.readouterr().out


# --- group 3's finding (2026-11-10): a root needs its block only once its folder exists at the branch's tip -----------


def test_a_root_that_does_not_exist_yet_needs_no_block(repo: Path) -> None:
    # Group 3 writes infra/bootstrap and infra/lambdas/credential_audit/; infra/account arrives with group 4.
    write(repo, "infra/bootstrap/main.tf", "# x\n")
    write(repo, "infra/lambdas/credential_audit/audit.py", "# x\n")
    commit(repo, "group 3")
    tree = git(repo, "rev-parse", "HEAD:infra")
    write(repo, NOTE, block("bootstrap", tree))
    commit(repo, "note")
    result = run(repo)
    assert result.status == "PASS", result.lines
    assert "account" not in result.lines[0]


def test_only_lambdas_with_no_account_root_is_skip(repo: Path) -> None:
    write(repo, "infra/lambdas/probe/probe.py", "# x\n")
    commit(repo, "lambdas")
    result = run(repo)
    assert result.status == "SKIP" and "no root" in result.lines[0]


def test_once_the_account_root_exists_lambdas_need_its_block(repo: Path) -> None:
    write(repo, "infra/account/main.tf", "# x\n")
    commit(repo, "the account root")
    write(repo, "infra/lambdas/probe/probe.py", "# x\n")
    write(repo, NOTE, "# note\n")
    commit(repo, "lambdas")
    result = run(repo)
    assert result.status == "FAIL"
    assert any("plan for account missing" in line for line in result.lines)
