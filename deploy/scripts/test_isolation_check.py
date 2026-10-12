"""Tests for deploy/scripts/isolation-check.sh with a fake docker: what it gathers, what it runs, and how it decides.

The probe's own checks are tested in test_isolation_probe.py; here every probe container is the fake's, and the
mount check is the real probe, run on the host as the script runs it.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "deploy" / "scripts" / "isolation-check.sh"
PROBE = REPO / "deploy" / "scripts" / "isolation_probe.py"
SECRET = "s3cr3t-" + "value-in-a-container-environment"


def pinned_python() -> str:
    for line in (REPO / "deploy/images.lock").read_text(encoding="utf-8").splitlines():
        fields = line.split()
        if fields and fields[0] == "base:python":
            return f"{fields[1]}:{fields[2]}@{fields[3]}"
    raise AssertionError("no base:python in deploy/images.lock")


FAKE_DOCKER = r"""#!/usr/bin/env python3
import json, os, sys
state = json.load(open(os.environ["FAKE_DOCKER_STATE"]))
args = sys.argv[1:]
with open(os.environ["FAKE_DOCKER_LOG"], "a") as log:
    log.write(json.dumps(args) + "\n")
def everyone():
    for stack, s in state["stacks"].items():
        for c in s["containers"]:
            yield stack, c
if args[0] == "version":
    if not state["server"]:
        sys.exit(1)
    print(state["server"]); sys.exit(0)
if args[:2] == ["image", "inspect"]:
    sys.exit(0 if args[-1] in state["images"] else 1)
if args[0] == "ps":
    stack = args[-1].rsplit("h4reet-", 1)[1]
    for c in state["stacks"].get(stack, {}).get("containers", []):
        print(c["id"])
    sys.exit(0)
if args[:2] == ["network", "ls"]:
    stack = args[args.index("--filter") + 1].rsplit("h4reet-", 1)[1]
    for net in state["stacks"][stack]["networks"]:
        print(net)
    sys.exit(0)
if args[:2] == ["network", "inspect"]:
    for s in state["stacks"].values():
        if args[-1] in s["networks"]:
            print(s["networks"][args[-1]] + " ")
    sys.exit(0)
if args[0] == "inspect":
    fmt = args[args.index("--format") + 1]
    with open(os.environ["FAKE_DOCKER_FORMATS"], "a") as formats:
        formats.write(json.dumps(fmt) + "\n")
    ids = args[args.index("--format") + 2:]
    for stack, c in everyone():
        if c["id"] not in ids:
            continue
        if "com.docker.compose.service" in fmt:
            line = fmt.split("\t", 2)[:2] + [c["service"], c["name"], json.dumps(c["networks"]), json.dumps(c["exposed"])]
            print("\t".join(line))
        elif ".NetworkSettings.Ports" in fmt:
            for port in c["ports"]:
                print(port)
        elif ".Mounts" in fmt:
            for kind, source, rw in c["mounts"]:
                print(f"{kind}\t{source}\t{rw}")
        else:
            sys.exit(98)
    sys.exit(0)
if args[0] == "run":
    net = args[args.index("--network") + 1]
    record = {"args": args, "stdin": sys.stdin.read()}
    with open(os.environ["FAKE_DOCKER_RUNS"], "a") as runs:
        runs.write(json.dumps(record) + "\n")
    print(f"PASS probe on {net}")
    sys.exit(state["run_exits"].get(net, 0))
sys.exit(99)
"""


def endpoint(ip: str, service: str) -> dict:
    return {
        "IPAddress": ip,
        "GlobalIPv6Address": "",
        "Aliases": [service],
        "DNSNames": [service],
    }


def stack_state(stack: str, base: int) -> dict:
    nets = {
        f"h4reet-{stack}_{n}": f"172.{base + i}.0.1"
        for i, n in enumerate(("edge", "egress", "internal"))
    }
    edge_ports = [str(18000 + (100 if stack == "dev" else 0) + i) for i in range(5)]
    return {
        "networks": nets,
        "containers": [
            {
                "id": f"{stack}-edge",
                "service": "edge",
                "name": f"/h4reet-{stack}-edge-1",
                "networks": {
                    f"h4reet-{stack}_edge": endpoint(f"172.{base}.0.2", "edge"),
                    f"h4reet-{stack}_internal": endpoint(f"172.{base + 2}.0.2", "edge"),
                },
                "exposed": {"8080/tcp": {}},
                "ports": edge_ports,
                "mounts": [
                    ["bind", f"/state/{stack}/tree/x/deploy/edge/nginx.conf", "false"]
                ],
                "env": [f"NOT_SHOWN={SECRET}"],
            },
            {
                "id": f"{stack}-gateway",
                "service": "gateway",
                "name": f"/h4reet-{stack}-gateway-1",
                "networks": {
                    f"h4reet-{stack}_internal": endpoint(
                        f"172.{base + 2}.0.3", "gateway"
                    ),
                    f"h4reet-{stack}_egress": endpoint(
                        f"172.{base + 1}.0.2", "gateway"
                    ),
                },
                "exposed": None,
                "ports": [],
                "mounts": [
                    ["bind", f"/state/{stack}/gateway", "true"],
                    ["bind", "/models", "false"],
                    ["volume", f"h4reet-{stack}_gateway-state-data", "true"],
                ],
                "env": [f"GATEWAY_DB_PASSWORD={SECRET}"],
            },
        ],
    }


class Stage:
    def __init__(self, tmp_path: Path) -> None:
        self.tmp = tmp_path
        scripts = tmp_path / "tree/deploy/scripts"
        scripts.mkdir(parents=True)
        shutil.copy2(SCRIPT, scripts / "isolation-check.sh")
        shutil.copy2(PROBE, scripts / "isolation_probe.py")
        shutil.copy2(REPO / "deploy/images.lock", tmp_path / "tree/deploy/images.lock")
        bin_dir = tmp_path / "bin"
        bin_dir.mkdir()
        (bin_dir / "docker").write_text(FAKE_DOCKER, encoding="utf-8")
        (bin_dir / "docker").chmod(0o755)
        self.state = {
            "server": "28.3.3",
            "images": [pinned_python()],
            "stacks": {"prod": stack_state("prod", 20), "dev": stack_state("dev", 30)},
            "run_exits": {},
        }
        self.files = {k: tmp_path / f"{k}.jsonl" for k in ("log", "runs", "formats")}
        self.environ = {
            "PATH": f"{bin_dir}:/usr/bin:/bin",
            "HOME": str(tmp_path),
            "TMPDIR": str(tmp_path),
            "FAKE_DOCKER_STATE": str(tmp_path / "state.json"),
            "FAKE_DOCKER_LOG": str(self.files["log"]),
            "FAKE_DOCKER_RUNS": str(self.files["runs"]),
            "FAKE_DOCKER_FORMATS": str(self.files["formats"]),
        }

    def run(self, **environ: str) -> subprocess.CompletedProcess:
        (self.tmp / "state.json").write_text(json.dumps(self.state), encoding="utf-8")
        return subprocess.run(
            ["bash", str(self.tmp / "tree/deploy/scripts/isolation-check.sh")],
            capture_output=True,
            text=True,
            env={**self.environ, **environ},
            check=False,
            timeout=60,
        )

    def lines(self, name: str) -> list:
        path = self.files[name]
        return (
            [json.loads(ln) for ln in path.read_text(encoding="utf-8").splitlines()]
            if path.exists()
            else []
        )


@pytest.fixture
def stage(tmp_path: Path) -> Stage:
    return Stage(tmp_path)


def test_both_directions_on_every_network_then_the_mounts(stage: Stage) -> None:
    done = stage.run()
    assert done.returncode == 0, done.stderr
    assert done.stdout.rstrip().endswith(
        "isolation-check: PASS: neither stack reaches the other's names, addresses, ports, or volumes (FR-020)"
    )
    runs = stage.lines("runs")
    probe_source = PROBE.read_text(encoding="utf-8").rstrip("\n")
    seen = []
    for record in runs:
        args = record["args"]
        net = args[args.index("--network") + 1]
        # The throwaway container: nothing pulled, nothing mounted, no capability, a read-only root, nobody.
        for flag in ("--rm", "-i", "--read-only"):
            assert flag in args, flag
        for flag, value in (
            ("--pull", "never"),
            ("--cap-drop", "ALL"),
            ("--security-opt", "no-new-privileges:true"),
            ("--user", "65534:65534"),
            ("--add-host", "host.docker.internal:host-gateway"),
        ):
            assert args[args.index(flag) + 1] == value, flag
        for absent in (
            "-v",
            "--volume",
            "--mount",
            "-e",
            "--env",
            "--env-file",
            "--privileged",
            "--cap-add",
        ):
            assert absent not in args, absent
        image_at = args.index(pinned_python())
        assert args[image_at + 1 : image_at + 4] == ["python3", "-I", "-B"]
        assert args[image_at + 4] == "-c" and args[image_at + 5] == probe_source
        source, target, network = args[image_at + 7 : image_at + 10]
        assert args[image_at + 6] == "network" and network == net
        seen.append((source, target, net))
        # The facts: both stacks' containers and published ports, and this network's ways to the host.
        stdin = record["stdin"]
        gateway = stage.state["stacks"][source]["networks"][net]
        assert f"host\t{gateway}\n" in stdin and "host\thost.docker.internal\n" in stdin
        assert (
            "published\tprod\t18000\n" in stdin and "published\tdev\t18104\n" in stdin
        )
        assert "container\tprod\tgateway\t/h4reet-prod-gateway-1\t" in stdin
        assert "container\tdev\tedge\t/h4reet-dev-edge-1\t" in stdin
        assert SECRET not in stdin  # no container's environment
    assert sorted(seen) == sorted(
        [("dev", "prod", f"h4reet-dev_{n}") for n in ("edge", "egress", "internal")]
        + [("prod", "dev", f"h4reet-prod_{n}") for n in ("edge", "egress", "internal")]
    )
    # It asks Docker for names, addresses, ports, and mounts, and never for an environment.
    for fmt in stage.lines("formats"):
        assert "Env" not in fmt and "{{json .}}" not in fmt
    assert (
        "PASS mounts: 2 volumes, each its own stack's; no writable bind shared; shared read-only: /models"
        in (done.stdout)
    )


def test_a_probe_that_finds_a_way_through_fails_the_check(stage: Stage) -> None:
    stage.state["run_exits"]["h4reet-dev_egress"] = 1
    done = stage.run()
    assert done.returncode == 1
    assert (
        "isolation-check: FAIL: 1 check(s) found a way between prod and dev (FR-020)"
        in done.stdout
    )
    assert len(stage.lines("runs")) == 6  # it still runs every other probe


def test_a_probe_that_cannot_run_proves_nothing(stage: Stage) -> None:
    stage.state["run_exits"]["h4reet-prod_internal"] = 125
    done = stage.run()
    assert done.returncode == 2
    assert "the probe on h4reet-prod_internal couldn't run (exit 125)" in done.stderr
    assert "so isolation isn't proven" in done.stderr


def test_a_writable_bind_both_stacks_mount_fails(stage: Stage) -> None:
    stage.state["stacks"]["dev"]["containers"][1]["mounts"].append(
        ["bind", "/state/prod/gateway", "false"]
    )
    done = stage.run()
    assert done.returncode == 1
    assert (
        "FAIL mounts: /state/prod/gateway is shared, and writable by prod"
        in done.stdout
    )


def test_both_stacks_must_be_up(stage: Stage) -> None:
    stage.state["stacks"]["dev"]["containers"] = []
    done = stage.run()
    assert done.returncode == 2 and "h4reet-dev isn't running" in done.stderr
    assert stage.lines("runs") == []


def test_the_probe_image_must_be_on_the_host(stage: Stage) -> None:
    stage.state["images"] = []
    done = stage.run()
    assert done.returncode == 2 and "make pull fetches it" in done.stderr
    assert stage.lines("runs") == []


def test_docker_must_answer(stage: Stage) -> None:
    stage.state["server"] = None
    done = stage.run()
    assert done.returncode == 2 and "Docker isn't reachable" in done.stderr


def test_it_is_the_authors_alone(stage: Stage) -> None:
    done = stage.run(SANDBOX_RUNTIME="1")
    assert done.returncode == 2 and "the Author's" in done.stderr
    assert stage.lines("log") == []  # not one docker call
