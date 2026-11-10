"""Tests for scripts/infra/infra_verify.py, make infra-verify ROOT=… (spec 001 tasks.md T021, T024; contracts/infra-
records.md §2, and September's §4 at 00309c47; FR-005, FR-007). It refuses, naming the reason, unless the checkout is
main and clean, HEAD's history merged a note whose block is this root's plan of main's infra/ tree, the saved plan is
that block's, byte for byte and in its redacted text, the credential audit finds nothing, and no apply holds the
state's lock. Then it prints the one apply command, and nothing else.

Each test builds a scratch repository on main with a merged note, a home with the saved plan and Terraform's data
folder, and a fake terraform (scripts/infra/infra_testkit.py). They need the guard patch's redaction and plan-note
checkers, so they skip until P-1 is applied (T010)."""

from __future__ import annotations

import importlib.util
import json
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


kit = _load("infra_testkit_for_verify", HERE / "infra_testkit.py")
pytestmark = pytest.mark.skipif(
    not kit.checkers_present(),
    reason="PLANNED (T010): tools/gates/infra_redact.py and infra_plan_note.py arrive with the guard patch, P-1",
)

SHOW = (
    "Terraform will perform the following actions:\n\n"
    '  # aws_s3_bucket.state will be created\n  + resource "aws_s3_bucket" "state" {\n'
    '      + bucket = "h4reet-ai-tfstate-someword"\n'
    '      + tags   = { "owner" = "' + "someone" + "@" + 'example.invalid" }\n'
    "    }\n\nPlan: 1 to add, 0 to change, 0 to destroy.\n"
)
PROFILE = "h4reet-admin"


def redacted(text: str) -> str:
    red = _load("infra_redact_for_verify", kit.GATES / "infra_redact.py")
    return red.redact(text, {"bucket"})


@pytest.fixture
def world(tmp_path: Path) -> dict:
    repo = kit.make_repo(tmp_path, ("infra_verify.py",))
    home = tmp_path / "home"
    home.mkdir()
    tree = kit.tree(repo)
    plan, sha = kit.write_plan(home, "bootstrap", tree)
    data = kit.write_backend(home, "bootstrap")
    bin_dir = kit.fakes(tmp_path, show_text=SHOW)
    kit.set_audit(home)
    kit.merge_note(repo, kit.block("bootstrap", tree, sha, redacted(SHOW)))
    return {
        "repo": repo,
        "home": home,
        "tree": tree,
        "plan": plan,
        "sha": sha,
        "data": data,
        "bin": bin_dir,
    }


def verify(w: dict, *extra: str, profile: bool = True, **env: str):
    args = ("--root", "bootstrap", *(("--profile", PROFILE) if profile else ()), *extra)
    return kit.run_script(
        w["repo"], w["home"], w["bin"], "infra_verify.py", *args, **env
    )


def refused(done) -> str:
    assert done.returncode == 1, (done.returncode, done.stdout, done.stderr)
    assert done.stdout == "", "a refusal prints no command"
    m = re.search(r"^infra-verify: refused: ([a-z_]+): ", done.stderr, re.MULTILINE)
    assert m, done.stderr
    return m.group(1)


def test_a_reviewed_plan_on_main_prints_the_one_apply_command(world: dict) -> None:
    done = verify(world)
    assert done.returncode == 0, done.stderr
    lines = done.stdout.splitlines()
    assert len(lines) == 1, "the one command, and nothing else"
    assert lines[0] == (
        f"AWS_PROFILE={PROFILE} TF_DATA_DIR={world['data']} terraform -chdir=infra/bootstrap apply {world['plan']}"
    )
    stamp = json.loads(
        world["plan"].with_suffix(".verified").read_text(encoding="utf-8")
    )
    assert (
        stamp["root"] == "bootstrap"
        and stamp["tree"] == world["tree"]
        and stamp["sha256"] == world["sha"]
    )
    assert (
        stamp["note"] == kit.NOTE
        and stamp["commit"] == kit.git(world["repo"], "rev-parse", "HEAD").strip()
    )
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", stamp["verified_at"])


def test_terraform_runs_with_its_data_outside_the_tree_and_nothing_of_the_shell(
    world: dict,
) -> None:
    done = verify(
        world,
        TF_CLI_ARGS="-auto-approve",
        AWS_SECRET_ACCESS_KEY="x" * 8,
        TF_VAR_alert_email="x",
    )
    assert done.returncode == 0, done.stderr
    (show,) = [c for c in kit.calls(world["bin"], "terraform") if "show" in c["argv"]]
    env = show["env"]
    assert env["TF_DATA_DIR"] == str(world["data"]) and not env[
        "TF_DATA_DIR"
    ].startswith(str(world["repo"]))
    assert not [k for k in env if k.startswith(("TF_CLI_ARGS", "TF_VAR_", "AWS_"))]
    assert env.get("CHECKPOINT_DISABLE") == "1"
    assert show["argv"] == [
        "-chdir=infra/bootstrap",
        "show",
        "-no-color",
        str(world["plan"]),
    ]
    assert not (world["repo"] / "infra" / "bootstrap" / ".terraform").exists()


def test_not_main(world: dict) -> None:
    kit.git(world["repo"], "switch", "-q", "feat/001-x")
    assert refused(verify(world)) == "not_main"


def test_dirty_with_a_tracked_change_anywhere(world: dict) -> None:
    (world["repo"] / "docs" / "merge-requests" / "README.md").write_text(
        "changed\n", encoding="utf-8"
    )
    assert refused(verify(world)) == "dirty"


def test_dirty_with_an_untracked_file_under_infra(world: dict) -> None:
    (world["repo"] / "infra" / "bootstrap" / "x_override.tf").write_text(
        "# planted\n", encoding="utf-8"
    )
    assert refused(verify(world)) == "dirty"


def test_dirty_with_an_ignored_file_under_infra(world: dict) -> None:
    # terraform reads every .tf file in the root, ignored or not, so an ignored one is as dirty as any.
    repo = world["repo"]
    (repo / ".gitignore").write_text("*_override.tf\n", encoding="utf-8")
    kit.git(repo, "add", ".gitignore")
    kit.git(repo, "commit", "-q", "-m", "ignore overrides")
    (repo / "infra" / "bootstrap" / "x_override.tf").write_text(
        "# planted\n", encoding="utf-8"
    )
    assert refused(verify(world)) == "dirty"


def test_an_ignored_file_terraform_never_reads_isnt_dirty(world: dict) -> None:
    # make test's bytecode under infra/test/, say: ignored, and nothing terraform reads.
    repo = world["repo"]
    (repo / ".gitignore").write_text("__pycache__/\n", encoding="utf-8")
    kit.git(repo, "add", ".gitignore")
    kit.git(repo, "commit", "-q", "-m", "ignore bytecode")
    cache = repo / "infra" / "test" / "__pycache__"
    cache.mkdir(parents=True)
    (cache / "test_x.cpython-312.pyc").write_bytes(b"\0")
    assert verify(world).returncode == 0


def test_an_untracked_file_outside_infra_isnt_dirty(world: dict) -> None:
    # The Author's checkout holds untracked files of his own at its top; they reach no terraform command.
    (world["repo"] / "notes-of-his.txt").write_text("mine\n", encoding="utf-8")
    assert verify(world).returncode == 0


def test_a_later_docs_merge_keeps_the_reviewed_plan(world: dict) -> None:
    kit.merge_note(
        world["repo"],
        "nothing of infra here\n",
        branch="docs/x",
        note_path="docs/merge-requests/2026-11-12-docs-x.md",
    )
    assert verify(world).returncode == 0


def test_no_reviewed_plan_when_the_note_wasnt_merged(tmp_path: Path) -> None:
    repo = kit.make_repo(tmp_path, ("infra_verify.py",))
    home = tmp_path / "home"
    home.mkdir()
    tree = kit.tree(repo)
    _, sha = kit.write_plan(home, "bootstrap", tree)
    kit.write_backend(home, "bootstrap")
    bin_dir = kit.fakes(tmp_path, show_text=SHOW)
    kit.set_audit(home)
    (repo / kit.NOTE).write_text(
        kit.block("bootstrap", tree, sha, redacted(SHOW)), encoding="utf-8"
    )
    kit.git(repo, "add", "-A")
    kit.git(repo, "commit", "-q", "-m", "a note committed on main, no merge")
    w = {"repo": repo, "home": home, "bin": bin_dir}
    assert refused(verify(w)) == "no_reviewed_plan"


@pytest.mark.parametrize("which", ["another root", "an older tree"])
def test_no_reviewed_plan_when_the_block_isnt_this_roots_of_this_tree(
    tmp_path: Path, which: str
) -> None:
    repo = kit.make_repo(tmp_path, ("infra_verify.py",))
    home = tmp_path / "home"
    home.mkdir()
    tree = kit.tree(repo)
    _, sha = kit.write_plan(home, "bootstrap", tree)
    kit.write_backend(home, "bootstrap")
    bin_dir = kit.fakes(tmp_path, show_text=SHOW)
    kit.set_audit(home)
    root, tree_in_block = (
        ("account", tree) if which == "another root" else ("bootstrap", "0" * 40)
    )
    kit.merge_note(repo, kit.block(root, tree_in_block, sha, redacted(SHOW)))
    assert (
        refused(verify({"repo": repo, "home": home, "bin": bin_dir}))
        == "no_reviewed_plan"
    )


def test_plan_missing(world: dict) -> None:
    world["plan"].unlink()
    assert refused(verify(world)) == "plan_missing"


def test_plan_stale_when_only_an_older_trees_plan_is_saved(world: dict) -> None:
    world["plan"].rename(world["plan"].with_name("bootstrap-" + "1" * 40 + ".tfplan"))
    assert refused(verify(world)) == "plan_stale"


def test_plan_not_reviewed_when_its_bytes_arent_the_blocks(world: dict) -> None:
    world["plan"].write_bytes(b"ANOTHER PLAN")
    assert refused(verify(world)) == "plan_not_reviewed"


def test_plan_differs_when_its_text_isnt_the_blocks(world: dict) -> None:
    kit.answer(world["bin"], show_text=SHOW.replace("1 to add", "2 to add"))
    assert refused(verify(world)) == "plan_differs"


def test_plan_differs_when_terraform_cant_show_it(world: dict) -> None:
    kit.answer(world["bin"], show_text=SHOW, show_exit=1)
    assert refused(verify(world)) == "plan_differs"


def test_plan_missing_when_terraforms_data_folder_is_gone(world: dict) -> None:
    (world["data"] / "terraform.tfstate").unlink()
    assert refused(verify(world)) == "plan_missing"


def test_credential_finding_names_the_check_and_resource_never_more(
    world: dict,
) -> None:
    kit.set_audit(
        world["home"], [{"check": "iam_user_access_key", "resource": "someone"}]
    )
    done = verify(world)
    assert refused(done) == "credential_finding"
    assert "iam_user_access_key: someone" in done.stderr


def test_credential_finding_when_the_audit_cant_run(world: dict) -> None:
    kit.set_audit(world["home"], exit_code=2)
    assert refused(verify(world)) == "credential_finding"


def test_state_locked_on_the_local_state(world: dict) -> None:
    state = kit.infra_home(world["home"]) / "state"
    state.mkdir(parents=True, exist_ok=True)
    (state / ".bootstrap.tfstate.lock.info").write_text("{}", encoding="utf-8")
    assert refused(verify(world)) == "state_locked"


@pytest.mark.parametrize(
    ("lock", "code"), [({}, "state_locked"), ({"__error__": "404"}, None)]
)
def test_the_buckets_lock_object(world: dict, lock: dict, code: str | None) -> None:
    kit.write_backend(
        world["home"],
        "bootstrap",
        "s3",
        bucket="b",
        key="bootstrap.tfstate",
        region="us-east-1",
    )
    kit.answer(world["bin"], show_text=SHOW, aws={"s3api head-object": lock})
    done = verify(world)
    if code:
        assert refused(done) == code
    else:
        assert done.returncode == 0, done.stderr
    (head,) = kit.calls(world["bin"], "aws")
    assert head["argv"][:2] == ["s3api", "head-object"]
    assert ["--key", "bootstrap.tfstate.tflock"] == head["argv"][
        4:6
    ] and "--profile" in head["argv"]


def test_state_locked_when_the_lock_cant_be_read(world: dict) -> None:
    kit.write_backend(
        world["home"],
        "bootstrap",
        "s3",
        bucket="b",
        key="bootstrap.tfstate",
        region="us-east-1",
    )
    kit.answer(
        world["bin"],
        show_text=SHOW,
        aws={"s3api head-object": {"__error__": "AccessDenied"}},
    )
    assert refused(verify(world)) == "state_locked"


def test_the_first_failing_check_is_the_one_named(world: dict) -> None:
    kit.git(world["repo"], "switch", "-q", "feat/001-x")
    world["plan"].unlink()
    assert refused(verify(world)) == "not_main"


@pytest.mark.parametrize(
    ("args", "env"),
    [
        ((), {"SANDBOX_RUNTIME": "1"}),
        (("--root", "elsewhere"), {}),
    ],
)
def test_it_cant_run_in_the_sandbox_or_for_another_root(
    world: dict, args: tuple, env: dict
) -> None:
    done = kit.run_script(
        world["repo"],
        world["home"],
        world["bin"],
        "infra_verify.py",
        *(args or ("--root", "bootstrap")),
        **env,
    )
    assert done.returncode == 2 and done.stdout == ""


def test_it_needs_a_named_profile(world: dict) -> None:
    done = verify(world, profile=False)
    assert done.returncode == 2 and "PROFILE" in done.stderr
    assert verify(world, profile=False, AWS_PROFILE=PROFILE).returncode == 0
