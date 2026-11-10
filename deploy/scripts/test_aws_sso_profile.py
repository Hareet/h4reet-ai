"""Tests for deploy/scripts/aws-sso-profile.sh and make aws-login PROFILE=… (spec 001 tasks.md T008; research.md R-32):
the Author's own SSO session for a named profile, with a fake aws CLI and a home in a temporary directory.

Every run gets a PATH of its own: the fake aws and a link to grep, so a real AWS CLI on the host is never reached. The
fake records its arguments, its HOME, and the names of the AWS_* variables it received, and prints the sign-in line."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "deploy" / "scripts" / "aws-sso-profile.sh"
BASH = shutil.which("bash") or "/bin/bash"
SIGN_IN = "Successfully logged into Start URL: https://example.invalid/start"
FAKE = f"""#!{sys.executable} -I
import json, os, sys
with open(os.environ["FAKE_LOG"], "a", encoding="utf-8") as log:
    log.write(json.dumps({{"argv": sys.argv[1:], "home": os.environ.get("HOME"),
                          "aws": sorted(k for k in os.environ if k.startswith("AWS_"))}}) + "\\n")
print({SIGN_IN!r})
sys.exit(int(os.environ.get("FAKE_EXIT", "0")))
"""
CONFIG = (
    "[profile h4reet-admin]\nsso_session = h4reet-author\nsso_account_id = 000000000000\n"
    "sso_role_name = AdministratorAccess\nregion = us-east-1\n\n"
    "[sso-session h4reet-author]\nsso_start_url = https://example.invalid/start\nsso_region = us-east-1\n"
)


@pytest.fixture
def stage(tmp_path: Path) -> dict:
    home = tmp_path / "home"
    (home / ".aws").mkdir(parents=True)
    (home / ".aws" / "config").write_text(CONFIG, encoding="utf-8")
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "aws").write_text(FAKE, encoding="utf-8")
    (bin_dir / "aws").chmod(0o755)
    grep = shutil.which("grep")
    assert grep
    (bin_dir / "grep").symlink_to(grep)
    return {"home": home, "bin": bin_dir, "log": tmp_path / "calls.jsonl"}


def run(stage: dict, *args: str, **env: str) -> subprocess.CompletedProcess[str]:
    base = {
        "HOME": str(stage["home"]),
        "PATH": str(stage["bin"]),
        "FAKE_LOG": str(stage["log"]),
    }
    return subprocess.run(
        [BASH, str(SCRIPT), *args],
        capture_output=True,
        text=True,
        env={**base, **env},
        check=False,
    )


def calls(stage: dict) -> list[dict]:
    log = stage["log"]
    return (
        [json.loads(x) for x in log.read_text(encoding="utf-8").splitlines()]
        if log.exists()
        else []
    )


def test_it_logs_the_named_profile_in_with_the_authors_home(stage: dict) -> None:
    done = run(stage, "h4reet-admin", AWS_PROFILE="other", AWS_CONFIG_FILE="/elsewhere")
    assert done.returncode == 0, done.stderr
    (call,) = calls(stage)
    assert call["argv"] == ["sso", "login", "--profile", "h4reet-admin"]
    assert call["home"] == str(stage["home"])
    assert call["aws"] == []  # the calling shell's AWS_* settings never reach the CLI
    assert SIGN_IN in done.stdout


def test_a_failed_login_exits_1(stage: dict) -> None:
    assert run(stage, "h4reet-admin", FAKE_EXIT="3").returncode == 1


@pytest.mark.parametrize(
    "args",
    [
        (),
        ("h4reet-admin", "extra"),
        ("admin",),
        ("h4reet-Admin",),
        ("h4reet-a;b",),
        ("h4reet-bedrock",),
    ],
)
def test_it_refuses_a_bad_or_runtime_profile(stage: dict, args: tuple) -> None:
    done = run(stage, *args)
    assert done.returncode == 2
    assert calls(stage) == []


def test_it_is_the_authors_alone(stage: dict) -> None:
    done = run(stage, "h4reet-admin", SANDBOX_RUNTIME="1")
    assert done.returncode == 2 and "the Author's" in done.stderr
    assert calls(stage) == []


@pytest.mark.parametrize(
    "config",
    [
        None,
        CONFIG.replace("[profile h4reet-admin]", "[profile h4reet-other]"),
        CONFIG.replace("sso_region = us-east-1", "sso_region = eu-west-1"),
    ],
)
def test_the_profile_must_be_configured_in_us_east_1(
    stage: dict, config: str | None
) -> None:
    path = stage["home"] / ".aws" / "config"
    if config is None:
        path.unlink()
    else:
        path.write_text(config, encoding="utf-8")
    assert run(stage, "h4reet-admin").returncode == 2
    assert calls(stage) == []


def test_the_aws_cli_must_be_installed(stage: dict) -> None:
    (stage["bin"] / "aws").unlink()
    assert run(stage, "h4reet-admin").returncode == 2


def test_make_aws_login_with_profile_runs_this_script() -> None:
    makefile = (REPO / "Makefile").read_text(encoding="utf-8")
    assert 'bash deploy/scripts/aws-sso-profile.sh "$$PROFILE"' in makefile
    assert "ifneq ($(call from_cli,PROFILE),)" in makefile


needs_make = pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")


def make(stage: dict, *args: str, **env: str) -> subprocess.CompletedProcess[str]:
    """make aws-login with the fake aws first on PATH; -f Makefile, as in the main tree (T183)."""
    base = {
        "HOME": str(stage["home"]),
        "PATH": f"{stage['bin']}:/usr/bin:/bin",
        "FAKE_LOG": str(stage["log"]),
    }
    argv = [
        "make",
        "--no-print-directory",
        "-C",
        str(REPO),
        "-f",
        "Makefile",
        "aws-login",
        *args,
    ]
    return subprocess.run(
        argv,
        capture_output=True,
        text=True,
        env={**base, **env},
        check=False,
        timeout=120,
    )


@needs_make
def test_make_aws_login_with_profile_starts_that_session(stage: dict) -> None:
    done = make(stage, "PROFILE=h4reet-admin")
    assert done.returncode == 0, done.stderr
    (call,) = calls(stage)
    assert call["argv"] == ["sso", "login", "--profile", "h4reet-admin"]
    assert call["home"] == str(stage["home"])


@needs_make
def test_make_aws_login_takes_profile_from_the_command_line_only(stage: dict) -> None:
    # From the environment, PROFILE is no choice: make takes spec 000's prod path, which this stage can't serve.
    done = make(stage, PROFILE="h4reet-admin")
    assert done.returncode != 0
    assert all(c["argv"][-1] != "h4reet-admin" for c in calls(stage))
