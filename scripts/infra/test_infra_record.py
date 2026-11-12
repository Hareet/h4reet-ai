"""Tests for scripts/infra/infra_record.py, make infra-record ROOT=… OUTCOME=… (spec 001 tasks.md T021, T024;
contracts/infra-records.md §2, and September's §6 at 00309c47; data-model.md §6.5; FR-007, FR-010). After the Author's
apply, it writes docs/infra/applies/<date>-<root>.md from the verified plan's JSON: the commit, the plan's hash and
tree, who applied it, when, the outcome, Terraform's version, and the resources changed, addresses and actions only,
redacted. It commits the record on a new branch, ops/apply-<root>-<date>, from main, without touching the checkout.

They build on scripts/infra/infra_testkit.py's scratch repository and fake terraform, and need the guard patch's
redaction (P-1), so they skip until it is applied (T010)."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


kit = _load("infra_testkit_for_record", HERE / "infra_testkit.py")
pytestmark = pytest.mark.skipif(
    not kit.checkers_present(),
    reason="PLANNED (T010): tools/gates/infra_redact.py arrives with the guard patch, P-1",
)

NOW = "2026-11-11T09:30:00Z"
DATE = "2026-11-11"
SECRET_VALUE = "a value of the plan's that no record holds"


def change(
    address: str, actions: list[str], mode: str = "managed", **extra: object
) -> dict:
    return {
        "address": address,
        "mode": mode,
        "type": address.split(".")[-2] if "." in address else address,
        "change": {
            "actions": actions,
            "after": {"bucket": SECRET_VALUE, "endpoint": SECRET_VALUE},
            **extra,
        },
    }


PLAN_JSON = {
    "terraform_version": "1.17.1",
    "resource_changes": [
        change("aws_s3_bucket.state", ["create"]),
        change("aws_s3_bucket_versioning.state", ["update"]),
        change("aws_sns_topic_subscription.email", ["delete", "create"]),
        change("aws_budgets_budget.old", ["delete"]),
        change("aws_sns_topic.alerts", ["no-op"]),
        change("data.aws_caller_identity.current", ["read"], mode="data"),
        change("aws_iam_role.imported", ["no-op"], importing={"id": "imported"}),
    ],
}


@pytest.fixture
def world(tmp_path: Path) -> dict:
    repo = kit.make_repo(tmp_path, ("infra_record.py",))
    home = tmp_path / "home"
    home.mkdir()
    tree = kit.tree(repo)
    plan, sha = kit.write_plan(home, "bootstrap", tree)
    kit.write_backend(home, "bootstrap")
    kit.merge_note(repo, "the note\n")
    commit = kit.git(repo, "rev-parse", "HEAD").strip()
    stamp = {
        "root": "bootstrap",
        "tree": tree,
        "sha256": sha,
        "commit": commit,
        "note": kit.NOTE,
        "verified_at": "2026-11-11T09:20:00Z",
    }
    plan.with_suffix(".verified").write_text(json.dumps(stamp), encoding="utf-8")
    bin_dir = kit.fakes(tmp_path, plan_json=PLAN_JSON)
    return {
        "repo": repo,
        "home": home,
        "tree": tree,
        "plan": plan,
        "sha": sha,
        "commit": commit,
        "bin": bin_dir,
    }


def record(w: dict, *extra: str, **env: str):
    return kit.run_script(
        w["repo"],
        w["home"],
        w["bin"],
        "infra_record.py",
        "--root",
        "bootstrap",
        "--now",
        NOW,
        *extra,
        **env,
    )


def recorded(
    w: dict,
    branch: str = f"ops/apply-bootstrap-{DATE}",
    path: str = f"{DATE}-bootstrap.md",
) -> str:
    return kit.git(w["repo"], "show", f"refs/heads/{branch}:docs/infra/applies/{path}")


def test_an_ok_apply_is_recorded_on_its_own_branch_from_main(world: dict) -> None:
    done = record(world, "--outcome", "ok")
    assert done.returncode == 0, done.stderr
    text = recorded(world)
    assert text.startswith(f"# Apply: bootstrap, {DATE}\n")
    for row in (
        "| Root | bootstrap |",
        f"| Commit | {world['commit']} (main) |",
        f"| Plan | sha256 {world['sha']}, tree {world['tree']} (the block in {kit.NOTE}) |",
        "| Applied by | the Author, from the Author's terminal |",
        f"| Started, finished | 2026-11-11T09:20:00Z, {NOW} |",
        "| Outcome | ok |",
        "| Terraform | 1.17.1 |",
    ):
        assert row in text, row
    branch = f"refs/heads/ops/apply-bootstrap-{DATE}"
    parent = kit.git(world["repo"], "rev-parse", f"{branch}^").strip()
    assert parent == world["commit"], "the record's branch starts at main"
    message = kit.git(world["repo"], "log", "-1", "--format=%s", branch).strip()
    assert message == f"ops: apply bootstrap at {world['commit'][:12]}"
    assert f"ops/apply-bootstrap-{DATE}" in done.stdout


def test_the_resources_are_addresses_and_actions_only(world: dict) -> None:
    assert record(world, "--outcome", "ok").returncode == 0
    text = recorded(world)
    table = text.split("## Resources changed\n", 1)[1]
    rows = [
        line
        for line in table.splitlines()
        if line.startswith("| ") and not line.startswith("| Address")
    ]
    assert rows == [
        "| aws_budgets_budget.old | delete |",
        "| aws_iam_role.imported | import |",
        "| aws_s3_bucket.state | create |",
        "| aws_s3_bucket_versioning.state | update |",
        "| aws_sns_topic_subscription.email | replace |",
    ]
    assert SECRET_VALUE not in text and "data.aws_caller_identity" not in text


def test_the_checkout_stays_as_it_was(world: dict) -> None:
    before = kit.git(world["repo"], "status", "--porcelain=v1", "--untracked-files=all")
    assert record(world, "--outcome", "ok").returncode == 0
    assert kit.git(world["repo"], "symbolic-ref", "HEAD").strip() == "refs/heads/main"
    assert kit.git(world["repo"], "rev-parse", "HEAD").strip() == world["commit"]
    assert (
        kit.git(world["repo"], "status", "--porcelain=v1", "--untracked-files=all")
        == before
    )
    assert not (world["repo"] / "docs" / "infra").exists()


def test_an_account_id_or_an_address_in_an_address_is_redacted(world: dict) -> None:
    account = "1" * 12
    email = "someone" + "@" + "example.invalid"
    plan = dict(PLAN_JSON)
    plan["resource_changes"] = [
        change(f'module.m["{account}"].aws_s3_bucket.b', ["create"]),
        change(f'aws_sns_topic_subscription.s["{email}"]', ["create"]),
    ]
    kit.answer(world["bin"], plan_json=plan)
    assert record(world, "--outcome", "ok").returncode == 0
    text = recorded(world)
    assert account not in text and email not in text
    assert '| module.m["<account>"].aws_s3_bucket.b | create |' in text
    assert '| aws_sns_topic_subscription.s["<email>"] | create |' in text


def test_a_secret_shaped_address_is_refused_and_nothing_is_committed(
    world: dict,
) -> None:
    key = "AKIA" + "Q" * 16
    plan = dict(PLAN_JSON)
    plan["resource_changes"] = [change(f'aws_s3_bucket.b["{key}"]', ["create"])]
    kit.answer(world["bin"], plan_json=plan)
    done = record(world, "--outcome", "ok")
    assert done.returncode == 3 and key not in done.stdout + done.stderr
    assert kit.git(world["repo"], "branch", "--list", "ops/*").strip() == ""


def test_a_failed_apply_records_the_exit_status_and_what_the_state_now_holds(
    world: dict,
) -> None:
    state = {
        "values": {
            "root_module": {
                "resources": [
                    {"address": "aws_s3_bucket.state"},
                    {"address": "aws_sns_topic.unrelated"},
                ],
                "child_modules": [
                    {"resources": [{"address": "aws_s3_bucket_versioning.state"}]}
                ],
            }
        }
    }
    kit.answer(world["bin"], plan_json=PLAN_JSON, state_json=state)
    done = record(world, "--outcome", "failed", "--exit-status", "1")
    assert done.returncode == 0, done.stderr
    text = recorded(world)
    assert "| Outcome | failed: terraform exited 1 |" in text
    held = text.split("## What the state holds of the plan\n", 1)[1]
    assert (
        "| aws_s3_bucket.state |" in held
        and "| aws_s3_bucket_versioning.state |" in held
    )
    assert "aws_sns_topic.unrelated" not in held


def test_a_second_record_that_day_takes_the_next_number(world: dict) -> None:
    assert record(world, "--outcome", "ok").returncode == 0
    kit.git(
        world["repo"],
        "merge",
        "-q",
        "--no-ff",
        "-m",
        "Merge the record",
        f"ops/apply-bootstrap-{DATE}",
    )
    done = record(world, "--outcome", "ok")
    assert done.returncode == 0, done.stderr
    assert recorded(
        world, f"ops/apply-bootstrap-{DATE}-2", f"{DATE}-2-bootstrap.md"
    ).startswith(f"# Apply: bootstrap, {DATE}\n")


@pytest.mark.parametrize(
    ("setup", "args"),
    [
        ("feature branch", ("--outcome", "ok")),
        ("no stamp", ("--outcome", "ok")),
        ("stamp of another plan", ("--outcome", "ok")),
        ("none", ("--outcome", "failed")),
        ("none", ("--outcome", "maybe")),
        ("sandbox", ("--outcome", "ok")),
    ],
)
def test_it_refuses(world: dict, setup: str, args: tuple[str, ...]) -> None:
    env = {}
    if setup == "feature branch":
        kit.git(world["repo"], "switch", "-q", "feat/001-x")
    elif setup == "no stamp":
        world["plan"].with_suffix(".verified").unlink()
    elif setup == "stamp of another plan":
        world["plan"].write_bytes(b"ANOTHER PLAN")
    elif setup == "sandbox":
        env["SANDBOX_RUNTIME"] = "1"
    done = record(world, *args, **env)
    assert done.returncode in (1, 2), (done.returncode, done.stderr)
    assert kit.git(world["repo"], "branch", "--list", "ops/*").strip() == ""
