"""Tests for scripts/infra/infra_plan.py, make plan ROOT=… (spec 001 tasks.md T024; contracts/infra-records.md §1 and
§2; research.md R-13, R-14; FR-004, FR-005, FR-010). The Author's real plan: the policy on the HCL before init, since
init and plan run agent-written configuration with his administrator session; then init against his provider mirror
alone, with Terraform's data folder outside the tree; plan -out into ~/.config/h4reet-ai/infra/plans/<root>-<tree>.tfplan;
the policy again on the saved plan's JSON; and the block for the note, redacted, tied to HEAD:infra's tree hash.

They build on scripts/infra/infra_testkit.py's scratch repository and fake terraform, and need the guard patch's policy
and redaction (P-1), so they skip until it is applied (T010)."""

from __future__ import annotations

import hashlib
import importlib.util
import re
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


kit = _load("infra_testkit_for_plan", HERE / "infra_testkit.py")
pytestmark = pytest.mark.skipif(
    not kit.checkers_present(),
    reason="PLANNED (T010): tools/gates/infra_policy.py and infra_redact.py arrive with the guard patch, P-1",
)

PROFILE = "h4reet-admin"
EMAIL = "someone" + "@" + "example.invalid"
ACCOUNT = "4" * 12
SHOW = (
    "Terraform will perform the following actions:\n\n"
    '  # aws_s3_bucket.state will be created\n  + resource "aws_s3_bucket" "state" {\n'
    '      + bucket = "h4reet-ai-tfstate-someword"\n'
    f'      + policy = "arn:aws:iam::{ACCOUNT}:root"\n'
    f'      + owner  = "{EMAIL}"\n'
    "    }\n\nPlan: 1 to add, 0 to change, 0 to destroy.\n"
)
PLAN_JSON = {
    "terraform_version": "1.17.1",
    "planned_values": {},
    "resource_changes": [],
}
ENV_FILE = (
    "# the bootstrap root's values\n"
    "TF_VAR_state_bucket_suffix=someword\n"
    f"TF_VAR_alert_email={EMAIL}\n"
    'TF_VAR_server_budget_usd="40"\n'
)


@pytest.fixture
def world(tmp_path: Path) -> dict:
    repo = kit.make_repo(tmp_path, ("infra_plan.py",), whole_root=True)
    home = tmp_path / "home"
    home.mkdir()
    kit.write_env(home, "bootstrap", ENV_FILE)
    mirror = kit.seed_mirror(home)
    bin_dir = kit.fakes(
        tmp_path, show_text=SHOW, plan_json=PLAN_JSON, plan_bytes="SAVED PLAN"
    )
    return {
        "repo": repo,
        "home": home,
        "bin": bin_dir,
        "mirror": mirror,
        "tree": kit.tree(repo),
    }


def plan(w: dict, *extra: str, profile: bool = True, **env: str):
    args = ("--root", "bootstrap", *(("--profile", PROFILE) if profile else ()), *extra)
    return kit.run_script(w["repo"], w["home"], w["bin"], "infra_plan.py", *args, **env)


def terraform_calls(w: dict, word: str | None = None) -> list[dict]:
    rows = kit.calls(w["bin"], "terraform")
    return [r for r in rows if word is None or word in r["argv"]]


def saved(w: dict) -> Path:
    return kit.infra_home(w["home"]) / "plans" / f"bootstrap-{w['tree']}.tfplan"


def test_it_prints_the_block_for_the_note(world: dict) -> None:
    done = plan(world)
    assert done.returncode == 0, done.stderr
    m = re.fullmatch(
        r"<!-- h4-plan root=bootstrap tree=(?P<tree>[0-9a-f]{40}) sha256=(?P<sha>[0-9a-f]{64}) terraform=1\.17\.1 "
        r"made=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ -->\n```terraform-plan\n(?P<text>.*)\n```\n<!-- /h4-plan -->\n",
        done.stdout,
        re.DOTALL,
    )
    assert m, done.stdout
    assert m.group("tree") == world["tree"]
    assert (
        m.group("sha")
        == hashlib.sha256(b"SAVED PLAN").hexdigest()
        == hashlib.sha256(saved(world).read_bytes()).hexdigest()
    )
    text = m.group("text")
    assert ACCOUNT not in text and EMAIL not in text and "someword" not in text
    assert "<account>" in text and "<email>" in text and "+ bucket = <redacted>" in text


def test_the_block_passes_the_gates_own_check(world: dict) -> None:
    done = plan(world)
    note = _load("infra_plan_note_for_plan", kit.GATES / "infra_plan_note.py")
    (b,) = note.blocks_in("note.md", done.stdout)
    assert b.attrs["root"] == "bootstrap" and b.attrs["tree"] == world["tree"]
    red = _load("infra_redact_for_plan", kit.GATES / "infra_redact.py")
    assert red.check(b.text) == []


def test_terraform_reads_the_mirror_alone_and_keeps_its_data_outside_the_tree(
    world: dict,
) -> None:
    assert (
        plan(
            world, TF_CLI_ARGS_plan="-refresh=false", AWS_ACCESS_KEY_ID="x" * 8
        ).returncode
        == 0
    )
    data = kit.infra_home(world["home"]) / "data" / "bootstrap"
    for call in terraform_calls(world):
        env = call["env"]
        assert env["TF_DATA_DIR"] == str(data)
        assert not env["TF_DATA_DIR"].startswith(str(world["repo"]))
        assert env["CHECKPOINT_DISABLE"] == "1" and env["TF_IN_AUTOMATION"] == "1"
        assert not [k for k in env if k.startswith("TF_CLI_ARGS")]
        assert [k for k in env if k.startswith("AWS_")] in ([], ["AWS_PROFILE"])
        if "version" in call["argv"]:
            continue  # terraform version reads no configuration and calls no provider
        assert env["AWS_PROFILE"] == PROFILE
        assert (
            call["cli_config"] is not None
            and str(world["mirror"]) in call["cli_config"]
        )
        assert (
            "filesystem_mirror" in call["cli_config"]
            and "direct" not in call["cli_config"]
        )
    assert not (world["repo"] / "infra" / "bootstrap" / ".terraform").exists()
    assert not list((world["repo"] / "infra").rglob(".terraform"))


def test_the_values_come_from_the_env_file_as_data(world: dict) -> None:
    assert plan(world).returncode == 0
    (call,) = terraform_calls(world, "plan")
    env = call["env"]
    assert env["TF_VAR_state_bucket_suffix"] == "someword"
    assert env["TF_VAR_alert_email"] == EMAIL
    assert env["TF_VAR_server_budget_usd"] == "40"


def test_init_names_the_local_state_and_keeps_the_lockfile(world: dict) -> None:
    assert plan(world).returncode == 0
    (init,) = terraform_calls(world, "init")
    state = kit.infra_home(world["home"]) / "state" / "bootstrap.tfstate"
    assert init["argv"][0] == "-chdir=infra/bootstrap"
    assert f"-backend-config=path={state}" in init["argv"]
    assert "-lockfile=readonly" in init["argv"] and "-input=false" in init["argv"]
    assert not [
        a
        for a in init["argv"]
        if a.startswith(("-migrate-state", "-force-copy", "-reconfigure", "-upgrade"))
    ]
    (p,) = terraform_calls(world, "plan")
    assert f"-out={saved(world)}" in p["argv"] and "-input=false" in p["argv"]


def test_the_policy_runs_before_init_and_stops_it(world: dict) -> None:
    repo = world["repo"]
    main = repo / "infra" / "bootstrap" / "main.tf"
    main.write_text(
        main.read_text(encoding="utf-8") + f'\nlocals {{\n  owner = "{EMAIL}"\n}}\n',
        encoding="utf-8",
    )
    kit.git(repo, "commit", "-q", "-am", "an address in the HCL")
    done = plan(world)
    assert done.returncode == 1 and done.stdout == ""
    assert "T8" in done.stdout + done.stderr
    assert terraform_calls(world, "init") == []


def test_a_secret_pattern_in_the_plan_text_refuses_and_removes_the_plan(
    world: dict,
) -> None:
    key = "AKIA" + "Z" * 16
    kit.answer(
        world["bin"], show_text=SHOW + f'      + id = "{key}"\n', plan_json=PLAN_JSON
    )
    done = plan(world)
    assert done.returncode == 3 and done.stdout == "" and key not in done.stderr
    assert not saved(world).exists()


def test_the_policy_on_the_plans_json_refuses_and_removes_the_plan(world: dict) -> None:
    bad = {
        "planned_values": {
            "root_module": {
                "resources": [
                    {
                        "address": "aws_ssm_parameter.x",
                        "mode": "managed",
                        "type": "aws_ssm_parameter",
                        "values": {
                            "type": "SecureString",
                            "tags_all": {
                                "project": "p",
                                "environment": "e",
                                "component": "c",
                            },
                        },
                    }
                ]
            }
        },
        "resource_changes": [],
    }
    kit.answer(world["bin"], show_text=SHOW, plan_json=bad)
    done = plan(world)
    assert done.returncode == 1 and done.stdout == ""
    assert "T9" in done.stderr
    assert not saved(world).exists()


def test_a_failed_plan_prints_no_block(world: dict) -> None:
    kit.answer(world["bin"], show_text=SHOW, plan_json=PLAN_JSON, plan_exit=1)
    done = plan(world)
    assert done.returncode == 1 and done.stdout == ""


@pytest.mark.parametrize(
    "case",
    [
        "sandbox",
        "another root",
        "no profile",
        "no env file",
        "env file readable by others",
        "a line that isn't TF_VAR_",
        "an undeclared variable",
        "dirty infra",
        "no mirror",
        "another terraform",
    ],
)
def test_it_cant_run(world: dict, case: str) -> None:
    env: dict[str, str] = {}
    args: tuple[str, ...] = ()
    profile = True
    envfile = kit.infra_home(world["home"]) / "bootstrap.env"
    if case == "sandbox":
        env["SANDBOX_RUNTIME"] = "1"
    elif case == "another root":
        args = ("--root", "elsewhere")
    elif case == "no profile":
        profile = False
    elif case == "no env file":
        envfile.unlink()
    elif case == "env file readable by others":
        envfile.chmod(0o644)
    elif case == "a line that isn't TF_VAR_":
        kit.write_env(world["home"], "bootstrap", ENV_FILE + "AWS_PROFILE=other\n")
    elif case == "an undeclared variable":
        kit.write_env(world["home"], "bootstrap", ENV_FILE + "TF_VAR_alert_emial=x\n")
    elif case == "dirty infra":
        (world["repo"] / "infra" / "bootstrap" / "x_override.tf").write_text(
            "# planted\n", encoding="utf-8"
        )
    elif case == "no mirror":
        world["mirror"].rmdir()
    elif case == "another terraform":
        kit.answer(world["bin"], show_text=SHOW, plan_json=PLAN_JSON, tf="1.16.0")
    if args:
        done = kit.run_script(
            world["repo"], world["home"], world["bin"], "infra_plan.py", *args, **env
        )
    else:
        done = plan(world, profile=profile, **env)
    assert done.returncode == 2, (done.returncode, done.stderr)
    assert done.stdout == ""
    assert terraform_calls(world, "init") == []
    assert EMAIL not in done.stderr, "no value from the env file is printed"
