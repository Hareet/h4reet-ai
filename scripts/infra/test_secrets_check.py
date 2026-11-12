"""Tests for scripts/infra/secrets_check.py, make secrets-check (spec 001 tasks.md T024; research.md R-26;
contracts/env-cloud.md §1; FR-009). The Author's secrets live in Parameter Store under /h4reet/, written by his hand
outside Terraform. It lists which of the names infra/parameters.txt expects exist, and their types, from
ssm:DescribeParameters alone: it never reads a value. It runs with a fake aws (scripts/infra/infra_testkit.py)."""

from __future__ import annotations

import importlib.util
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


kit = _load("infra_testkit_for_secrets", HERE / "infra_testkit.py")
PROFILE = "h4reet-admin"
DESCRIBE = "ssm describe-parameters"


@pytest.fixture
def world(tmp_path: Path) -> dict:
    repo = tmp_path / "repo"
    (repo / "scripts" / "infra").mkdir(parents=True)
    (repo / "infra").mkdir()
    (repo / "scripts" / "infra" / "secrets_check.py").write_bytes(
        (HERE / "secrets_check.py").read_bytes()
    )
    home = tmp_path / "home"
    home.mkdir()
    return {"repo": repo, "home": home, "bin": kit.fakes(tmp_path)}


def expect(w: dict, *lines: str) -> None:
    (w["repo"] / "infra" / "parameters.txt").write_text(
        "# name type\n" + "".join(f"{line}\n" for line in lines), encoding="utf-8"
    )


def held(*names: tuple[str, str]) -> dict:
    return {"Parameters": [{"Name": n, "Type": t, "Version": 1} for n, t in names]}


def check(w: dict, profile: bool = True, **env: str):
    args = ("--profile", PROFILE) if profile else ()
    return kit.run_script(
        w["repo"], w["home"], w["bin"], "secrets_check.py", *args, **env
    )


def test_with_no_name_expected_yet_it_lists_what_is_there(world: dict) -> None:
    expect(world)
    kit.answer(world["bin"], aws={DESCRIBE: held(("/h4reet/ec2/X", "SecureString"))})
    done = check(world)
    assert done.returncode == 0, done.stderr
    assert "no name expected yet" in done.stdout
    assert "/h4reet/ec2/X" in done.stdout and "unexpected" in done.stdout


def test_every_expected_name_present_with_its_type(world: dict) -> None:
    expect(
        world,
        "/h4reet/account/TELEGRAM_BOT_TOKEN SecureString",
        "/h4reet/prod/ec2-autostart String",
    )
    kit.answer(
        world["bin"],
        aws={
            DESCRIBE: held(
                ("/h4reet/account/TELEGRAM_BOT_TOKEN", "SecureString"),
                ("/h4reet/prod/ec2-autostart", "String"),
            )
        },
    )
    done = check(world)
    assert done.returncode == 0, done.stderr
    assert "2 of 2 present" in done.stdout


@pytest.mark.parametrize(
    ("there", "word"),
    [
        ((), "missing"),
        (
            (("/h4reet/account/TELEGRAM_BOT_TOKEN", "String"),),
            "type String, not SecureString",
        ),
    ],
)
def test_a_missing_name_or_a_wrong_type_fails(
    world: dict, there: tuple, word: str
) -> None:
    expect(world, "/h4reet/account/TELEGRAM_BOT_TOKEN SecureString")
    kit.answer(world["bin"], aws={DESCRIBE: held(*there)})
    done = check(world)
    assert done.returncode == 1
    assert word in done.stdout


def test_it_only_describes_and_never_reads_a_value(world: dict) -> None:
    expect(world, "/h4reet/account/TELEGRAM_BOT_TOKEN SecureString")
    kit.answer(
        world["bin"],
        aws={DESCRIBE: held(("/h4reet/account/TELEGRAM_BOT_TOKEN", "SecureString"))},
    )
    assert check(world, AWS_SECRET_ACCESS_KEY="x" * 8).returncode == 0
    (call,) = kit.calls(world["bin"], "aws")
    assert call["argv"][:2] == ["ssm", "describe-parameters"]
    assert "Key=Path,Option=Recursive,Values=/h4reet/" in call["argv"]
    assert call["argv"][call["argv"].index("--profile") + 1] == PROFILE
    assert not [
        a for a in call["argv"] if "get-parameter" in a or "with-decryption" in a
    ]
    assert not [k for k in call["env"] if k.startswith("AWS_")]


@pytest.mark.parametrize("case", ["sandbox", "no profile", "aws fails", "a bad line"])
def test_it_cant_run(world: dict, case: str) -> None:
    expect(world)
    env = {}
    profile = True
    if case == "sandbox":
        env["SANDBOX_RUNTIME"] = "1"
    elif case == "no profile":
        profile = False
    elif case == "a bad line":
        expect(world, "/elsewhere/X SecureString")
    kit.answer(world["bin"], aws={} if case == "aws fails" else {DESCRIBE: held()})
    done = check(world, profile=profile, **env)
    assert done.returncode == 2, (done.returncode, done.stdout, done.stderr)
