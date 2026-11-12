"""Tests for scripts/infra/tunnel_keys.py and cloud_session.py: the Author's tunnel-keys, tunnel-revoke, and
cloud-session targets (spec 001 tasks.md T052; FR-050, FR-055; contracts/tunnel.md §5; research.md R-11, R-32). His
terminal alone: each refuses inside the agent sandbox, and the bash gate refuses the targets to agent sessions
(redteam/forbidden-actions.sh's rows).

tunnel_keys.py keys:
  - makes the client's key and the host's key with ssh-keygen, and the relay's two host tokens, the sink's token, and
    the telemetry block's token;
  - writes the host's private key, the client's public key, and the tokens to Parameter Store under /h4reet/tunnel-end/,
    each as its type, and EC2's copies under /h4reet/ec2/, each value from a 0600 file, never on a command line;
  - keeps the client's key and the pinned host key in ~/.config/h4reet-ai/tunnel/client/, 0600 in 0700, and nothing of
    the host's private key on the laptop;
  - fills the laptop prod env file's tunnel keys, which make init-env's SYNC=1 adds first, and nothing else in it;
  - refuses to replace keys that exist unless told to rotate; prints names, never a value.
tunnel_keys.py revoke empties the authorized key and restarts the tunnel end's sshd in one Systems Manager command;
--restore puts the client's public key back the same way.
cloud_session.py opens a Systems Manager port-forwarding session to the named host's listener.

The aws CLI is scripts/infra/infra_testkit.py's fake; ssh-keygen is the machine's.
"""

from __future__ import annotations

import importlib.util
import json
import shutil
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


kit = _load("infra_testkit_for_tunnel", HERE / "infra_testkit.py")
pytestmark = pytest.mark.skipif(
    shutil.which("ssh-keygen") is None, reason="needs ssh-keygen"
)
PROFILE = "h4reet-admin"
ADDRESS = "198.51.100.7"
TUNNEL_KEYS = (
    "RELAY_TOKEN_SELF",
    "TELEMETRY_BLOCK_TOKEN",
    "TUNNEL_END_ADDRESS",
    "H4_TUNNEL_DIR",
)


@pytest.fixture
def world(tmp_path: Path) -> dict:
    repo = tmp_path / "repo"
    (repo / "scripts" / "infra").mkdir(parents=True)
    for name in ("tunnel_keys.py", "cloud_session.py"):
        (repo / "scripts" / "infra" / name).write_bytes((HERE / name).read_bytes())
    home = tmp_path / "home"
    env_dir = home / ".config" / "h4reet-ai" / "env"
    env_dir.mkdir(parents=True)
    (home / ".config" / "h4reet-ai").chmod(0o700)
    env_dir.chmod(0o700)
    prod = env_dir / "prod.env"
    prod.write_text(
        "H4_STACK=prod\nCOMPOSE_PROFILES=gpu\nOTHER=kept\n"
        + "".join(f"{k}=\n" for k in TUNNEL_KEYS),
        encoding="utf-8",
    )
    prod.chmod(0o600)
    bin_dir = kit.fakes(
        tmp_path,
        aws={
            "ssm put-parameter": {"Version": 1, "Tier": "Standard"},
            "ssm get-parameter": {
                "Parameter": {
                    "Name": "/h4reet/prod/tunnel-end-address",
                    "Value": ADDRESS,
                }
            },
            "ec2 describe-instances": {
                "Reservations": [
                    {
                        "Instances": [
                            {"InstanceId": "i-0abc", "State": {"Name": "running"}}
                        ]
                    }
                ]
            },
            "ssm send-command": {"Command": {"CommandId": "c-1"}},
            "ssm start-session": {},
        },
    )
    return {"repo": repo, "home": home, "bin": bin_dir, "prod": prod}


def run(w: dict, script: str, *args: str, **env: str):
    return kit.run_script(
        w["repo"], w["home"], w["bin"], script, *args, "--profile", PROFILE, **env
    )


def env_values(path: Path) -> dict[str, str]:
    return dict(
        line.split("=", 1)
        for line in path.read_text(encoding="utf-8").splitlines()
        if "=" in line
    )


def puts(w: dict) -> dict[str, list[str]]:
    out = {}
    for call in kit.calls(w["bin"], "aws"):
        argv = call["argv"]
        if argv[:2] == ["ssm", "put-parameter"]:
            out[argv[argv.index("--name") + 1]] = argv
    return out


def test_each_refuses_inside_the_sandbox(world: dict) -> None:
    for script, args in (
        ("tunnel_keys.py", ("keys",)),
        ("tunnel_keys.py", ("revoke",)),
        ("cloud_session.py", ("--host", "ec2")),
    ):
        done = run(world, script, *args, SANDBOX_RUNTIME="1")
        assert done.returncode == 2, script
        assert "the Author's" in done.stderr
    assert kit.calls(world["bin"], "aws") == []


def test_keys_makes_and_writes_everything_once(world: dict) -> None:
    done = run(world, "tunnel_keys.py", "keys")
    assert done.returncode == 0, done.stderr
    written = puts(world)
    assert sorted(written) == sorted(
        [
            "/h4reet/tunnel-end/HOST_KEY",
            "/h4reet/tunnel-end/AUTHORIZED_KEY",
            "/h4reet/tunnel-end/RELAY_TOKEN_LAPTOP",
            "/h4reet/tunnel-end/RELAY_TOKEN_EC2",
            "/h4reet/tunnel-end/SNAPSHOT_SINK_TOKEN",
            "/h4reet/tunnel-end/TELEMETRY_BLOCK_TOKEN",
            "/h4reet/ec2/RELAY_TOKEN_SELF",
            "/h4reet/ec2/SNAPSHOT_SINK_TOKEN",
        ]
    )
    for name, argv in written.items():
        kind = argv[argv.index("--type") + 1]
        assert kind == (
            "String" if name.endswith("AUTHORIZED_KEY") else "SecureString"
        ), name
        assert argv[argv.index("--value") + 1].startswith("file://"), name
        assert "--overwrite" in argv and argv[argv.index("--profile") + 1] == PROFILE
    client = world["home"] / ".config" / "h4reet-ai" / "tunnel" / "client"
    assert client.stat().st_mode & 0o777 == 0o700
    assert (client / "id_ed25519").stat().st_mode & 0o777 == 0o600
    (line,) = (client / "known_hosts").read_text(encoding="utf-8").splitlines()
    assert line.startswith("h4-tunnel-end ssh-ed25519 ")
    on_laptop = {p.name for p in client.parent.rglob("*") if p.is_file()}
    assert on_laptop == {"id_ed25519", "id_ed25519.pub", "known_hosts"}
    values = env_values(world["prod"])
    assert values["TUNNEL_END_ADDRESS"] == ADDRESS
    assert values["H4_TUNNEL_DIR"] == str(client)
    assert (
        len(values["RELAY_TOKEN_SELF"]) >= 43
        and len(values["TELEMETRY_BLOCK_TOKEN"]) >= 43
    )
    assert values["OTHER"] == "kept" and values["COMPOSE_PROFILES"] == "gpu"
    assert world["prod"].stat().st_mode & 0o777 == 0o600
    said = done.stdout + done.stderr
    for value in (values["RELAY_TOKEN_SELF"], values["TELEMETRY_BLOCK_TOKEN"]):
        assert value not in said
        assert all(
            value not in " ".join(c["argv"]) for c in kit.calls(world["bin"], "aws")
        )


def test_keys_refuses_to_replace_keys_unless_rotating(world: dict) -> None:
    assert run(world, "tunnel_keys.py", "keys").returncode == 0
    first = env_values(world["prod"])["RELAY_TOKEN_SELF"]
    again = run(world, "tunnel_keys.py", "keys")
    assert again.returncode == 1 and "--rotate" in again.stderr
    assert env_values(world["prod"])["RELAY_TOKEN_SELF"] == first
    rotated = run(world, "tunnel_keys.py", "keys", "--rotate")
    assert rotated.returncode == 0, rotated.stderr
    assert env_values(world["prod"])["RELAY_TOKEN_SELF"] != first


def test_keys_wants_the_env_files_tunnel_keys_first(world: dict) -> None:
    world["prod"].write_text("H4_STACK=prod\n", encoding="utf-8")
    done = run(world, "tunnel_keys.py", "keys")
    assert done.returncode == 1
    assert "make init-env ENV=prod SYNC=1" in done.stderr
    assert kit.calls(world["bin"], "aws") == []


def test_revoke_empties_the_key_and_restarts_sshd_in_one_command(world: dict) -> None:
    done = run(world, "tunnel_keys.py", "revoke")
    assert done.returncode == 0, done.stderr
    written = puts(world)
    assert list(written) == ["/h4reet/tunnel-end/AUTHORIZED_KEY"]
    sends = [
        c["argv"]
        for c in kit.calls(world["bin"], "aws")
        if c["argv"][:2] == ["ssm", "send-command"]
    ]
    (send,) = sends
    assert send[send.index("--document-name") + 1] == "AWS-RunShellScript"
    assert send[send.index("--targets") + 1] == "Key=tag:Name,Values=h4-prod-tunnel-end"
    assert json.loads(send[send.index("--parameters") + 1]) == {
        "commands": ["systemctl start h4-tunnel-restart.service"]
    }


def test_restore_puts_the_clients_key_back(world: dict) -> None:
    assert run(world, "tunnel_keys.py", "keys").returncode == 0
    done = run(world, "tunnel_keys.py", "revoke", "--restore")
    assert done.returncode == 0, done.stderr
    assert "restored" in done.stdout


def test_cloud_session_forwards_the_hosts_listener(world: dict) -> None:
    for host, port in (("ec2", "18503"), ("tunnel-end", "18505")):
        done = run(world, "cloud_session.py", "--host", host)
        assert done.returncode == 0, done.stderr
        start = [
            c["argv"]
            for c in kit.calls(world["bin"], "aws")
            if c["argv"][:2] == ["ssm", "start-session"]
        ][-1]
        assert start[start.index("--target") + 1] == "i-0abc"
        assert (
            start[start.index("--document-name") + 1]
            == "AWS-StartPortForwardingSession"
        )
        assert json.loads(start[start.index("--parameters") + 1]) == {
            "portNumber": [port],
            "localPortNumber": [port],
        }


def test_cloud_session_names_only_the_two_hosts(world: dict) -> None:
    done = run(world, "cloud_session.py", "--host", "laptop")
    assert done.returncode == 2


MAKEFILE = (REPO / "Makefile").read_text(encoding="utf-8")


@pytest.mark.parametrize(
    ("target", "line"),
    [
        ("tunnel-keys", "scripts/infra/tunnel_keys.py keys"),
        ("tunnel-revoke", "scripts/infra/tunnel_keys.py revoke"),
        ("cloud-session", "scripts/infra/cloud_session.py --host"),
    ],
)
def test_the_targets_are_the_authors_and_run_their_scripts(
    target: str, line: str
) -> None:
    recipe = MAKEFILE.split(f"\n{target}:", 1)[1].split("\n\n", 1)[0]
    assert "## (the Author)" in recipe.splitlines()[0]
    assert "$(call AUTHOR_ONLY," in recipe
    assert line in recipe
    phony = MAKEFILE.split("\n.PHONY:", 1)[1].split("\n\n", 1)[0]
    assert f" {target}" in phony.replace("\\\n", " ")
