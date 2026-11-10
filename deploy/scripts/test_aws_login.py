"""Tests for deploy/scripts/aws-login.sh and make aws-login (spec 000 FR-013; plan §4 and §5.2; research.md R-17;
tasks.md T104): a fake aws CLI, a home in a temporary directory, and the real script.

Every run of the script gets a PATH of its own: the fake aws, and links to the few tools the script needs, so the real
AWS CLI, which may be installed on the host, is never on it. The runs of make aws-login need make's PATH, with /usr/bin
and /bin, so there the fake comes first and shadows any real aws. Either way, no test can reach AWS. The fake records how it was run (its
arguments, its HOME, its umask, and the names of the AWS_* variables it received), writes a token cache as aws sso
login does, with canary values built at run time, and prints what the CLI prints, so the tests can show that the
script passes the CLI's output through and prints nothing of the cache or the calling shell's credentials.
"""

from __future__ import annotations

import json
import secrets
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "deploy" / "scripts" / "aws-login.sh"
PROFILE = "h4reet-bedrock"
# What aws sso login prints for the sign-in: the script must pass it through, since the Author needs it.
SIGN_IN = "Successfully logged into Start URL: https://example.invalid/start"

FAKE_AWS = """#!PYTHON -I
import json, os, sys
umask = os.umask(0o077)
record = {
    "argv": sys.argv[1:],
    "home": os.environ.get("HOME"),
    "aws_names": sorted(k for k in os.environ if k.startswith("AWS_")),
    "umask": umask,
}
with open(os.environ["FAKE_AWS_LOG"], "a", encoding="utf-8") as log:
    log.write(json.dumps(record) + "\\n")
canaries = json.loads(os.environ["FAKE_AWS_CANARIES"])
cache = os.path.join(os.environ["HOME"], ".aws", "sso", "cache")
os.makedirs(cache, exist_ok=True)
with open(os.path.join(cache, "fake-session.json"), "w", encoding="utf-8") as token:
    json.dump(dict(canaries, expiresAt="2026-10-29T18:00:00Z"), token)
print("SIGN_IN")
sys.exit(int(os.environ.get("FAKE_AWS_EXIT", "0")))
"""


class Stage:
    """A temporary HOME with the runtime identity's directory as make init-env and aws configure sso leave it."""

    def __init__(self, tmp_path: Path) -> None:
        self.tmp = tmp_path
        self.home = tmp_path / "home"
        self.aws_home = self.home / ".config" / "h4reet-ai" / "aws-home"
        self.aws_dir = self.aws_home / ".aws"
        for path in (
            self.home,
            self.home / ".config",
            self.home / ".config" / "h4reet-ai",
            self.aws_home,
            self.aws_dir,
        ):
            path.mkdir(mode=0o700)
            path.chmod(0o700)
        self.config = self.aws_dir / "config"
        self.config.write_text(
            f"[profile {PROFILE}]\nsso_session = h4reet-runtime\nsso_account_id = 000000000000\n"
            "sso_role_name = h4reet-bedrock-invoke\nregion = us-east-1\n\n"
            "[sso-session h4reet-runtime]\nsso_start_url = https://example.invalid/start\n"
            "sso_region = us-east-1\nsso_registration_scopes = sso:account:access\n",
            encoding="utf-8",
        )
        self.fake_bin = tmp_path / "fake-bin"
        self.fake_bin.mkdir()
        fake = self.fake_bin / "aws"
        fake.write_text(
            FAKE_AWS.replace("PYTHON", sys.executable).replace("SIGN_IN", SIGN_IN),
            encoding="utf-8",
        )
        fake.chmod(0o755)
        # The tools the script runs, and nothing else: no directory that could hold a real aws.
        self.tools = tmp_path / "tools"
        self.tools.mkdir()
        for tool in ("id", "stat", "grep"):
            found = shutil.which(tool)
            assert found, f"the test needs {tool}"
            (self.tools / tool).symlink_to(found)
        self.log = tmp_path / "aws.log"
        # The session's secrets, as the token cache holds them: built here, at run time.
        self.canaries = {
            "accessToken": "canary-access-" + secrets.token_urlsafe(18),
            "refreshToken": "canary-refresh-" + secrets.token_urlsafe(18),
            "clientSecret": "canary-client-" + secrets.token_urlsafe(18),
        }
        self.shell_secret = "canary-shell-" + secrets.token_urlsafe(18)
        self.environ = {
            "PATH": f"{self.fake_bin}:{self.tools}",
            "HOME": str(self.home),
            "LC_ALL": "C",
            "FAKE_AWS_LOG": str(self.log),
            "FAKE_AWS_CANARIES": json.dumps(self.canaries),
        }

    def run(
        self, *args: str, path: str | None = None, **environ: str
    ) -> subprocess.CompletedProcess:
        env = {**self.environ, **environ}
        if path is not None:
            env["PATH"] = path
        return subprocess.run(
            [shutil.which("bash") or "/bin/bash", str(SCRIPT), *args],
            capture_output=True,
            text=True,
            env=env,
            check=False,
            timeout=60,
        )

    def calls(self) -> list[dict]:
        if not self.log.exists():
            return []
        return [
            json.loads(line)
            for line in self.log.read_text(encoding="utf-8").splitlines()
        ]

    def secrets(self) -> list[str]:
        return [*self.canaries.values(), self.shell_secret]


@pytest.fixture
def stage(tmp_path: Path) -> Stage:
    return Stage(tmp_path)


def test_it_logs_the_runtime_profile_in_with_home_at_aws_home(stage: Stage) -> None:
    done = stage.run()
    assert done.returncode == 0, done.stderr
    (call,) = stage.calls()
    # plan §4: HOME=~/.config/h4reet-ai/aws-home aws sso login --profile h4reet-bedrock.
    assert call["argv"] == ["sso", "login", "--profile", PROFILE]
    assert call["home"] == str(stage.aws_home)
    # The session lands in the directory prod's gateway mounts as its ~/.aws (H4_AWS_DIR).
    assert (stage.aws_dir / "sso" / "cache" / "fake-session.json").is_file()
    # What the CLI creates is the Author's alone.
    assert call["umask"] == 0o077
    # The CLI's own output reaches the Author: the sign-in needs its URL and code.
    assert SIGN_IN in done.stdout
    assert "make operator-status ENV=prod" in done.stdout


def test_a_profile_chained_to_h4_laptop_bedrock_logs_its_source_in(
    stage: Stage,
) -> None:
    # Spec 001's group 4 (its tasks.md T036 and T040; docs/runbooks/laptop.md): h4reet-bedrock assumes h4-laptop-bedrock
    # from an SSO profile, so the session to start is that source's, one hop away, as preflight's P19 takes it.
    account = "".join(
        str(i % 10) for i in range(1, 13)
    )  # built at run time, never a literal
    sso = "[profile h4reet-bedrock-sso]\nsso_session = h4reet\n\n[sso-session h4reet]\nsso_region = us-east-1\n"

    def chained(role: str, source: str = "h4reet-bedrock-sso", rest: str = sso) -> str:
        return (
            f"[profile {PROFILE}]\nrole_arn = arn:aws:iam::{account}:role/{role}\nsource_profile = {source}\n\n"
            + rest
        )

    stage.config.write_text(chained("h4-laptop-bedrock"), encoding="utf-8")
    done = stage.run()
    assert done.returncode == 0, done.stderr
    (call,) = stage.calls()
    assert call["argv"] == ["sso", "login", "--profile", "h4reet-bedrock-sso"]
    assert call["home"] == str(stage.aws_home)
    assert account not in done.stdout + done.stderr
    # Any other role, a source that isn't there or isn't a plain name, or a second hop: refused, with no login.
    second_hop = (
        f"[profile h4reet-bedrock-sso]\nrole_arn = arn:aws:iam::{account}:role/h4-laptop-bedrock\n"
        "source_profile = h4reet-bedrock-sso-2\n\n[profile h4reet-bedrock-sso-2]\nsso_session = h4reet\n"
    )
    for config, words in (
        (chained("AdministratorAccess"), "h4-laptop-bedrock"),
        (chained("h4-laptop-bedrock", source="nowhere"), "source_profile"),
        (chained("h4-laptop-bedrock", source="a b"), "source_profile"),
        (chained("h4-laptop-bedrock", rest=second_hop), "source_profile"),
        (
            chained("h4-laptop-bedrock", rest=sso.replace("us-east-1", "eu-west-1")),
            "SSO region is eu-west-1",
        ),
    ):
        stage.log.unlink(missing_ok=True)
        stage.config.write_text(config, encoding="utf-8")
        done = stage.run()
        assert done.returncode == 2 and words in done.stderr, (config, done.stderr)
        assert account not in done.stderr
        assert stage.calls() == []


def test_the_shells_aws_settings_never_reach_the_cli(stage: Stage) -> None:
    # AWS_CONFIG_FILE or AWS_SHARED_CREDENTIALS_FILE could point the login at the Author's own files, and so hand the
    # gateway the Author's session (research.md R-17); AWS_PROFILE could name another profile.
    done = stage.run(
        AWS_PROFILE="default",
        AWS_DEFAULT_PROFILE="default",
        AWS_CONFIG_FILE=str(stage.home / ".aws" / "config"),
        AWS_SHARED_CREDENTIALS_FILE=str(stage.home / ".aws" / "credentials"),
        AWS_ACCESS_KEY_ID="canary-key-id",
        AWS_SECRET_ACCESS_KEY=stage.shell_secret,
        AWS_SESSION_TOKEN="canary-session",
        AWS_CA_BUNDLE="/nonexistent",
    )
    assert done.returncode == 0, done.stderr
    (call,) = stage.calls()
    assert call["aws_names"] == []
    assert call["argv"] == ["sso", "login", "--profile", PROFILE]


@pytest.mark.parametrize("exit_code", ["0", "255"])
def test_it_prints_no_secret(stage: Stage, exit_code: str) -> None:
    # The token cache holds the session's access token, refresh token, and client secret; the calling shell may hold
    # keys of its own. None of them may reach the script's output, whether the login succeeds or fails.
    done = stage.run(AWS_SECRET_ACCESS_KEY=stage.shell_secret, FAKE_AWS_EXIT=exit_code)
    assert stage.calls(), "the fake ran, so its cache holds the canaries"
    output = done.stdout + done.stderr
    assert [s for s in stage.secrets() if s in output] == []


def test_a_failed_login_exits_1(stage: Stage) -> None:
    done = stage.run(FAKE_AWS_EXIT="255")
    assert done.returncode == 1
    assert "aws sso login failed" in done.stderr
    assert (
        "make operator-status" not in done.stdout
    )  # it never claims a session it didn't get


def test_it_is_the_authors_alone(stage: Stage) -> None:
    done = stage.run(SANDBOX_RUNTIME="1")
    assert done.returncode == 2 and "the Author's" in done.stderr
    assert stage.calls() == []


def test_it_takes_no_arguments(stage: Stage) -> None:
    for args in (["--profile", "default"], ["--use-device-code"], ["prod"]):
        done = stage.run(*args)
        assert done.returncode == 2 and "no arguments" in done.stderr, args
    assert stage.calls() == []


def test_the_aws_cli_must_be_installed(stage: Stage) -> None:
    done = stage.run(path=str(stage.tools))
    assert done.returncode == 2 and "AWS CLI" in done.stderr
    assert "quickstart.md §0.6" in done.stderr


def test_the_directory_must_exist(stage: Stage) -> None:
    shutil.rmtree(stage.aws_home)
    done = stage.run()
    assert done.returncode == 2 and "make init-env ENV=prod" in done.stderr
    assert stage.calls() == []
    assert not stage.aws_home.exists()  # nor does it create one: init-env makes it 0700


@pytest.mark.parametrize("which", ["aws_home", "aws_dir"])
def test_the_directories_must_be_private(stage: Stage, which: str) -> None:
    path = getattr(stage, which)
    path.chmod(0o750)
    done = stage.run()
    assert done.returncode == 2 and "0700" in done.stderr and str(path) in done.stderr
    assert stage.calls() == []


@pytest.mark.parametrize("which", ["aws_home", "aws_dir"])
def test_a_symbolic_link_is_refused(stage: Stage, which: str) -> None:
    # A link would put the session, and the gateway's read-only mount, wherever it points: at worst the Author's own
    # ~/.aws, which research.md R-17 keeps from the gateway.
    path = getattr(stage, which)
    elsewhere = stage.tmp / f"elsewhere-{which}"
    path.rename(elsewhere)
    path.symlink_to(elsewhere, target_is_directory=True)
    done = stage.run()
    assert done.returncode == 2 and "symbolic link" in done.stderr
    assert stage.calls() == []


def test_the_directory_must_be_yours(stage: Stage) -> None:
    # The fake id answers another uid, so the directories, which this test's user owns, belong to someone else.
    fake_id = stage.fake_bin / "id"
    fake_id.write_text("#!/bin/sh\necho 4242\n", encoding="utf-8")
    fake_id.chmod(0o755)
    done = stage.run()
    assert done.returncode == 2 and "belongs to another user" in done.stderr
    assert stage.calls() == []


@pytest.mark.parametrize(
    "config",
    [
        None,
        "[profile default]\nsso_session = h4reet-runtime\n",
        f"[profile {PROFILE}-old]\nsso_session = h4reet-runtime\n",
        f"# [profile {PROFILE}]\n",
    ],
    ids=["missing", "another-profile", "a-longer-name", "commented-out"],
)
def test_the_profile_must_be_configured(stage: Stage, config: str | None) -> None:
    if config is None:
        stage.config.unlink()
    else:
        stage.config.write_text(config, encoding="utf-8")
    done = stage.run()
    assert done.returncode == 2 and f"[profile {PROFILE}]" in done.stderr
    # It names the one-time setup of quickstart.md §0.6, step 4.
    assert f"aws configure sso --profile {PROFILE}" in done.stderr
    assert stage.calls() == []


@pytest.mark.parametrize(
    ("config", "ok"),
    [
        (
            f"[profile {PROFILE}]\nsso_start_url = https://example.invalid/start\nsso_region = us-east-1\n",
            True,
        ),
        (
            f"[profile {PROFILE}]\nsso_start_url = https://example.invalid/start\nsso_region = eu-west-1\n",
            False,
        ),
        (
            f"[profile {PROFILE}]\nsso_session = s\n\n[sso-session s]\nsso_region = eu-west-1\n",
            False,
        ),
        (
            f"[profile {PROFILE}]\nsso_session = s\nsso_region = us-east-1\n\n[sso-session s]\nsso_region = eu-west-1\n",
            False,
        ),
        (
            f"[profile {PROFILE}]\nsso_start_url = https://example.invalid/start\n# sso_region = us-east-1\n",
            False,
        ),
        (f"[profile {PROFILE}]\nsso_session = s\n", False),
    ],
    ids=[
        "legacy-us-east-1",
        "legacy-elsewhere",
        "session-elsewhere",
        "session-wins",
        "commented-out",
        "no-region",
    ],
)
def test_the_sso_region_must_be_the_disclosures(
    stage: Stage, config: str, ok: bool
) -> None:
    # docs/data-flow-disclosure.md's row F2 lists us-east-1's portal and oidc hosts: an sso_session profile's region
    # is its session's, and a legacy profile's its own.
    stage.config.write_text(config, encoding="utf-8")
    done = stage.run()
    if ok:
        assert done.returncode == 0, done.stderr
        assert len(stage.calls()) == 1
    else:
        assert done.returncode == 2 and "it must be us-east-1" in done.stderr
        assert stage.calls() == []


def test_the_session_lands_where_prods_gateway_reads_it() -> None:
    # The script's directory and profile are the ones prod's env template and compose give the gateway (plan §5.2;
    # contracts/env-files.md §2 and §4; provider-adapter.md §3.2): H4_AWS_DIR, mounted read-only as the container's
    # ~/.aws with HOME=/home/node, and GATEWAY_AWS_PROFILE, which compose makes the container's AWS_PROFILE.
    template = {}
    for line in (
        (REPO / "deploy/env.example/prod.env.example")
        .read_text(encoding="utf-8")
        .splitlines()
    ):
        if "=" in line and not line.startswith("#"):
            key, value = line.split("=", 1)
            template[key] = value
    assert template["H4_AWS_DIR"] == "__HOME__/.config/h4reet-ai/aws-home/.aws"
    assert template["GATEWAY_AWS_PROFILE"] == PROFILE
    text = SCRIPT.read_text(encoding="utf-8")
    assert f"\nprofile={PROFILE}\n" in text
    assert '\naws_home="$HOME/.config/h4reet-ai/aws-home"\n' in text
    assert '\naws_dir="$aws_home/.aws"\n' in text
    gateway = yaml.safe_load(
        (REPO / "deploy/compose.yaml").read_text(encoding="utf-8")
    )["services"]["gateway"]
    assert gateway["environment"]["AWS_PROFILE"] == "${GATEWAY_AWS_PROFILE:-none}"
    assert gateway["environment"]["HOME"] == "/home/node"
    (mount,) = [v for v in gateway["volumes"] if v["target"] == "/home/node/.aws"]
    assert mount["source"] == "${H4_AWS_DIR:?set by the env file}"
    assert mount["read_only"] is True


def test_the_script_is_shellcheck_clean_and_strict() -> None:
    text = SCRIPT.read_text(encoding="utf-8")
    assert text.startswith("#!/usr/bin/env bash\n")
    assert "\nset -euo pipefail\n" in text
    assert "set -x" not in text  # a trace would print what the script handles
    if shutil.which("shellcheck"):
        done = subprocess.run(
            ["shellcheck", str(SCRIPT)],
            capture_output=True,
            text=True,
            check=False,
            timeout=60,
        )
        assert done.returncode == 0, done.stdout


# --------------------------------------------------------------------------------------------------
# make aws-login, from the repository's Makefile
# --------------------------------------------------------------------------------------------------
def make(stage: Stage, *args: str, **environ: str) -> subprocess.CompletedProcess:
    """make aws-login with the fake aws first on PATH, so the script's aws is always the fake. The environment is built
    whole, so the session's own SANDBOX_RUNTIME reaches make only when a test passes it."""
    env = {**stage.environ, "PATH": f"{stage.fake_bin}:/usr/bin:/bin", **environ}
    return subprocess.run(
        # -f Makefile: T183's mask leaves plain make nothing to read in the main tree.
        [
            "make",
            "--no-print-directory",
            "-C",
            str(REPO),
            "-f",
            "Makefile",
            "aws-login",
            *args,
        ],
        capture_output=True,
        text=True,
        env=env,
        check=False,
        timeout=120,
    )


needs_make = pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")


@needs_make
def test_make_aws_login_runs_the_script(stage: Stage) -> None:
    done = make(stage)
    assert done.returncode == 0, done.stderr
    (call,) = stage.calls()
    assert call["argv"] == ["sso", "login", "--profile", PROFILE]
    assert call["home"] == str(stage.aws_home)
    assert SIGN_IN in done.stdout


@needs_make
def test_make_aws_login_is_the_authors(stage: Stage) -> None:
    done = make(stage, SANDBOX_RUNTIME="1")
    assert done.returncode == 2 and "the Author's" in done.stderr
    assert stage.calls() == []


@needs_make
def test_make_aws_login_is_prods_alone(stage: Stage) -> None:
    # dev and dev-cpu mount deploy/aws-none and route no paid adapter: there is no session of theirs to start.
    for stack in ("dev", "dev-cpu"):
        done = make(stage, f"ENV={stack}")
        assert done.returncode == 2 and "prod's" in done.stderr, stack
    assert stage.calls() == []
    assert make(stage, "ENV=prod").returncode == 0


def test_the_target_is_listed_as_the_authors() -> None:
    makefile = (REPO / "Makefile").read_text(encoding="utf-8")
    (line,) = [ln for ln in makefile.splitlines() if ln.startswith("aws-login:")]
    assert "## (the Author)" in line
    assert "bash deploy/scripts/aws-login.sh" in makefile
    phony = makefile[makefile.index(".PHONY: help") :]
    assert " aws-login" in phony
