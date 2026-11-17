"""Tests for scripts/infra/secrets_check.py, make secrets-check (spec 001 tasks.md T024; research.md R-26;
contracts/env-cloud.md §1; FR-009). The Author's secrets live in Parameter Store under /h4reet/, written by his hand
outside Terraform. It lists which of the names infra/parameters.txt expects exist, and their types, from
ssm:DescribeParameters alone: it never reads a value. It runs with a fake aws (scripts/infra/infra_testkit.py)."""

from __future__ import annotations

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


# F7, part 2 (spec 001 bug-fixes, night 5): after W2's deploy, make secrets-check listed five names as unexpected,
# each made by another hand than his: Terraform's autostart switch, EC2's instance ID, and the laptop's health check's
# ID, and the shared-state-tls target's key and certificate. The repository's own list names them, with their types.
REPO = HERE.parents[1]
DEPLOYED = (
    ("/h4reet/prod/ec2-autostart", "String"),
    ("/h4reet/prod/ec2-instance-id", "String"),
    ("/h4reet/tunnel-end/HEALTH_CHECK_ID", "String"),
    ("/h4reet/tunnel-end/SHARED_STATE_TLS_CERT", "String"),
    ("/h4reet/tunnel-end/SHARED_STATE_TLS_KEY", "SecureString"),
)


def listed() -> dict[str, str]:
    """infra/parameters.txt's names and types, read as the check reads them."""
    out = {}
    for raw in (
        (REPO / "infra" / "parameters.txt").read_text(encoding="utf-8").splitlines()
    ):
        line = raw.split("#", 1)[0].strip()
        if line:
            name, kind = line.split()
            out[name] = kind
    return out


def test_the_repositorys_list_leaves_nothing_the_deploy_made_unexpected(
    world: dict,
) -> None:
    (world["repo"] / "infra" / "parameters.txt").write_bytes(
        (REPO / "infra" / "parameters.txt").read_bytes()
    )
    everything = {**listed(), **dict(DEPLOYED)}
    kit.answer(world["bin"], aws={DESCRIBE: held(*everything.items())})
    done = check(world)
    assert done.returncode == 0, done.stdout
    assert "unexpected" not in done.stdout, done.stdout
    assert f"{len(everything)} of {len(everything)} present" in done.stdout


def terraform_parameters() -> dict[str, str]:
    """Every aws_ssm_parameter the Terraform roots make, by name and type: never a secret (rule T9)."""
    found = {}
    for root in ("account", "prod", "bootstrap"):
        for path in sorted((REPO / "infra" / root).glob("*.tf")):
            text = path.read_text(encoding="utf-8")
            for block in re.finditer(
                r'resource\s+"aws_ssm_parameter"\s+"[^"]+"\s*\{(.*?)\n\}',
                text,
                re.DOTALL,
            ):
                name = re.search(r'\n\s*name\s*=\s*"([^"]+)"', block.group(1))
                kind = re.search(r'\n\s*type\s*=\s*"([^"]+)"', block.group(1))
                assert name and kind, path
                found[name.group(1)] = kind.group(1)
    return found


def test_every_name_terraform_or_the_tls_target_makes_is_listed_with_its_type() -> None:
    made = terraform_parameters()
    assert {"/h4reet/prod/ec2-autostart", "/h4reet/prod/ec2-instance-id"} <= set(made)
    tls = (REPO / "scripts" / "infra" / "shared_state.py").read_text(encoding="utf-8")
    for constant, kind in (
        ("KEY_PARAMETER", "SecureString"),
        ("CERT_PARAMETER", "String"),
        ("CA_PARAMETER", "String"),
    ):
        name = re.search(rf'^{constant} = "([^"]+)"$', tls, re.MULTILINE)
        assert name, constant
        made[name.group(1)] = kind
    have = listed()
    wrong = {n: k for n, k in made.items() if have.get(n) != k}
    assert not wrong, f"infra/parameters.txt lacks, or types otherwise: {wrong}"
