#!/usr/bin/env python3
"""make status, and make up's last step (spec 000; plan §4; contracts/env-files.md §12; gateway-http.md §5).

    python3 -I -B -X pycache_prefix=/dev/null deploy/scripts/status.py --stack prod|dev|dev-cpu --env-file PATH
        [--run-file PATH] [--root DIR] [--after-up]

It prints:
  - the commit a host stack runs, its branch, and the commit before it, from the run file. A host stack with no run
    file wasn't started by make up, and that is all it says. dev-cpu runs the working tree;
  - each service of the stack's profiles: its state, its health, and whether its image is the one deploy/images.lock
    pins; and a warning for a container created from another commit's export;
  - the gateway's GET /health, asked from inside the stack through edge, so it works on either engine: the store,
    the state, the degraded cause, and the adapters. With an uninitialized store it prints the one-time
    make operator-init command; it never initializes, resets, or changes anything itself (FR-031);
  - Prometheus's target health, asked from inside its own container; GPU memory on a gpu stack; and docker system df.

Exit codes: 0 every service is healthy, with WARN lines when the stack waits on the operator (an uninitialized
store, a tripped switch); 1 a service is down or unhealthy, which it names with its last health-check output and
its error lines from the logs, both through deploy/scripts/redact.sh; or Docker didn't answer. Reading a missing
run file is never a failure (contracts/env-files.md §12).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REDACT = Path(__file__).resolve().parent / "redact.sh"
DOCKER_ENV = (
    "PATH",
    "HOME",
    "DOCKER_HOST",
    "DOCKER_TLS_VERIFY",
    "DOCKER_CERT_PATH",
    "DOCKER_CONFIG",
    "DOCKER_CONTEXT",
    "BUILDX_CONFIG",
    "XDG_RUNTIME_DIR",
)
ERROR_LINE = re.compile(r"error|warn|fail|refused|timeout|exception", re.IGNORECASE)
HOST_STACKS = ("prod", "dev")


class Docker:
    """Every docker call status makes. The tests replace it."""

    def __init__(self, environ: dict[str, str] | None = None) -> None:
        source = os.environ if environ is None else environ
        self.env = {k: source[k] for k in DOCKER_ENV if k in source} | {"LC_ALL": "C"}

    def run(self, *args: str, timeout: float = 30) -> subprocess.CompletedProcess:
        try:
            return subprocess.run(
                ["docker", *args],
                capture_output=True,
                text=True,
                check=False,
                timeout=timeout,
                env=self.env,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            return subprocess.CompletedProcess(["docker", *args], 127, "", str(error))

    def nvidia(self) -> str | None:
        if not shutil.which("nvidia-smi"):
            return None
        done = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=memory.used,memory.total",
                "--format=csv,noheader",
            ],
            capture_output=True,
            text=True,
            check=False,
            timeout=15,
        )
        return done.stdout.strip() if done.returncode == 0 else None


def redact(text: str) -> str:
    done = subprocess.run(
        ["bash", str(REDACT)], input=text, capture_output=True, text=True, check=False
    )
    return (
        done.stdout
        if done.returncode == 0
        else "(redaction failed, so nothing is shown)\n"
    )


def read_env(path: Path) -> dict[str, str]:
    """KEY=VALUE, as data (contracts/env-files.md §1.1); a line that doesn't parse is skipped here."""
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.partition("=")
        if sep and re.fullmatch(r"[A-Z][A-Z0-9_]*", key) and not line.startswith("#"):
            values[key] = (
                value[1:-1]
                if len(value) >= 2 and value[0] == value[-1] == "'"
                else value
            )
    return values


def read_lock(path: Path) -> dict[str, tuple[str, str]]:
    pins = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip() and not line.startswith("#"):
            service, repository, _tag, digest, *_ = line.split()
            pins[service] = (repository, digest)
    return pins


def parse_ps(text: str) -> list[dict]:
    """docker compose ps --format json: one object per line, or (older compose) one array."""
    text = text.strip()
    if not text:
        return []
    if text.startswith("["):
        return json.loads(text)
    return [json.loads(line) for line in text.splitlines() if line.strip()]


def labels(container: dict) -> dict[str, str]:
    raw = container.get("Labels") or ""
    if isinstance(raw, dict):
        return raw
    return dict(item.partition("=")[::2] for item in raw.split(",") if "=" in item)


class Status:
    def __init__(
        self,
        stack: str,
        env_file: Path,
        run_file: Path | None,
        root: Path,
        docker: Docker,
        after_up: bool,
    ) -> None:
        self.stack, self.env_file, self.run_file, self.root = (
            stack,
            env_file,
            run_file,
            root,
        )
        self.docker, self.after_up = docker, after_up
        self.warnings: list[str] = []
        self.failing: list[str] = []

    def say(self, text: str = "") -> None:
        print(text, flush=True)

    def compose(
        self, tree: Path, *args: str, timeout: float = 30
    ) -> subprocess.CompletedProcess:
        command = [
            "compose",
            "-p",
            f"h4reet-{self.stack}",
            "-f",
            str(tree / "deploy/compose.yaml"),
        ]
        command += ["--env-file", str(self.env_file)]
        if self.run_file and self.run_file.is_file():
            command += ["--env-file", str(self.run_file)]
        return self.docker.run(*command, *args, timeout=timeout)

    def commit(self) -> Path | None:
        """The tree the stack runs, after printing which commit it is; None if a host stack has no run file."""
        if self.stack not in HOST_STACKS:
            self.say(
                f"h4reet-{self.stack}: the working tree, served to the agents' engine (no run file)"
            )
            return self.root
        if not self.run_file or not self.run_file.is_file():
            self.say(
                f"h4reet-{self.stack}: not started by make up (no run file at {self.run_file}); nothing to report"
            )
            return None
        run = read_env(self.run_file)
        previous = run.get("H4_REF_PREVIOUS") or "none"
        self.say(
            f"h4reet-{self.stack}: commit {run.get('H4_REF', '?')} (branch {run.get('H4_REF_BRANCH', '?')}); "
            f"previous {previous}"
        )
        if previous != "none":
            self.say(f"  rollback: make up ENV={self.stack} REF={previous}")
        return Path(run.get("H4_TREE", ""))

    def expected(self, tree: Path) -> dict[str, dict] | None:
        done = self.compose(
            tree,
            "config",
            "--no-interpolate",
            "--no-path-resolution",
            "--format",
            "json",
        )
        if done.returncode != 0:
            return None
        services = json.loads(done.stdout).get("services") or {}
        profiles = set(read_env(self.env_file).get("COMPOSE_PROFILES", "").split(","))
        out = {}
        for name, service in services.items():
            wanted = set(service.get("profiles") or [])
            if wanted == {"breach"}:
                continue  # the breach probe is a one-off, run by the breach test
            if not wanted or wanted & profiles:
                out[name] = service
        return out

    def image_note(
        self,
        name: str,
        service: dict,
        container: dict,
        pins: dict[str, tuple[str, str]],
    ) -> str:
        if service.get("build") is not None:
            return "built"
        pin = pins.get(name)
        if not pin:
            return "no pin"
        image = self.docker.run(
            "inspect", "--format", "{{.Image}}", container.get("ID", "")
        )
        digests = self.docker.run(
            "image",
            "inspect",
            "--format",
            "{{json .RepoDigests}}",
            image.stdout.strip(),
        )
        try:
            repo_digests = json.loads(digests.stdout) if digests.returncode == 0 else []
        except json.JSONDecodeError:
            repo_digests = []
        if f"{pin[0]}@{pin[1]}" in repo_digests:
            return "pinned"
        self.warnings.append(
            f"{name} runs an image whose digest isn't deploy/images.lock's: make up ENV={self.stack}"
        )
        return "differs from the pin"

    def explain(self, tree: Path, name: str, container: dict | None) -> None:
        """A failing service's last health-check output and error lines, redacted."""
        if container:
            health = self.docker.run(
                "inspect", "--format", "{{json .State.Health}}", container.get("ID", "")
            )
            try:
                log = (json.loads(health.stdout) or {}).get("Log") or []
            except json.JSONDecodeError:
                log = []
            if log:
                self.say(
                    f"  {name}'s last health check (exit {log[-1].get('ExitCode')}):"
                )
                self.say(
                    redact(
                        str(log[-1].get("Output", ""))[-400:].strip() + "\n"
                    ).rstrip()
                )
        logs = self.compose(
            tree,
            "logs",
            "--no-log-prefix",
            "--timestamps",
            "--tail",
            "200",
            name,
            timeout=60,
        )
        errors = [
            line
            for line in (logs.stdout + logs.stderr).splitlines()
            if ERROR_LINE.search(line)
        ][-20:]
        if errors:
            self.say(f"  {name}'s error lines, redacted:")
            self.say(redact("\n".join(errors) + "\n").rstrip())

    def services(self, tree: Path, expected: dict[str, dict] | None) -> bool:
        ps = self.compose(tree, "ps", "-a", "--format", "json")
        if expected is None or ps.returncode != 0:
            self.say("Docker didn't answer, or compose refused the stack's files")
            self.failing.append("docker")
            return False
        containers = {c.get("Service"): c for c in parse_ps(ps.stdout)}
        pins = (
            read_lock(tree / "deploy/images.lock")
            if (tree / "deploy/images.lock").is_file()
            else {}
        )
        self.say(f"{'service':<20} {'state':<10} {'health':<10} image")
        for name, service in sorted(expected.items()):
            container = containers.get(name)
            if container is None:
                self.say(f"{name:<20} {'missing':<10} {'-':<10} -")
                self.failing.append(name)
                continue
            state = container.get("State") or "?"
            health = container.get("Health") or ("none" if state == "running" else "-")
            note = self.image_note(name, service, container, pins)
            self.say(f"{name:<20} {state:<10} {health:<10} {note}")
            # After up --wait, a service still starting has missed its health check; make status only notes it.
            if (
                state != "running"
                or health == "unhealthy"
                or (health == "starting" and self.after_up)
            ):
                self.failing.append(name)
            elif health == "starting":
                self.warnings.append(f"{name} is still starting")
            created_from = labels(container).get(
                "com.docker.compose.project.config_files", ""
            )
            if (
                self.stack in HOST_STACKS
                and created_from
                and not created_from.startswith(str(tree) + "/")
            ):
                self.warnings.append(
                    f"{name} was created from another commit's compose file: make up ENV={self.stack} recreates it"
                )
        for name in self.failing:
            if name != "docker":
                self.explain(tree, name, containers.get(name))
        return True

    def health(self, tree: Path) -> None:
        done = self.compose(
            tree,
            "exec",
            "-T",
            "edge",
            "wget",
            "-qO-",
            "-T",
            "3",
            "http://gateway:8080/health",
        )
        try:
            report = json.loads(done.stdout) if done.returncode == 0 else None
        except json.JSONDecodeError:
            report = None
        if not isinstance(report, dict):
            self.say("gateway /health: no answer through edge")
            self.warnings.append("the gateway's /health didn't answer")
            return
        adapters = ", ".join(
            f"{a.get('id')} {'healthy' if a.get('healthy') else 'unhealthy: ' + str(a.get('reason'))}"
            for a in report.get("adapters") or []
        )
        self.say(
            f"gateway /health: {report.get('status')} · store {report.get('store')} · state {report.get('state')}"
            f" · cause {report.get('degraded_cause')} · adapters: {adapters or 'none'}"
        )
        if report.get("store") == "uninitialized":
            self.warnings.append(
                f"the store is uninitialized, so hello answers store_uninitialized. Once, in your terminal: "
                f'make operator-init ENV={self.stack} REASON="<why, at least 10 characters>", adding CONFIRM_ZERO=1 '
                f"only if this host has no earlier records, and RENEW=1 to grant today's fallback "
                f"(contracts/operator-admin.md §2.3)"
            )
        elif report.get("store") == "unreachable":
            self.warnings.append(
                "the gateway can't reach its store: see make logs ENV="
                + self.stack
                + " SERVICE=gateway-state"
            )
        if report.get("state") == "degraded":
            crossed = ", ".join(report.get("crossed") or []) or "?"
            self.warnings.append(
                f"the kill switch is tripped ({crossed}): make operator-status ENV={self.stack}; only you reset it, "
                f'with make operator-reset ENV={self.stack} REASON="..."'
            )

    def prometheus(self, tree: Path, expected: dict[str, dict] | None) -> None:
        if not expected or "prometheus" not in expected:
            self.say(
                "prometheus: not in this commit's compose file, so no target is checked"
            )
            self.warnings.append(
                "the stack has no Prometheus, so its targets weren't checked"
            )
            return
        done = self.compose(
            tree,
            "exec",
            "-T",
            "prometheus",
            "wget",
            "-qO-",
            "-T",
            "3",
            "http://127.0.0.1:9090/api/v1/targets?state=active",
        )
        try:
            targets = json.loads(done.stdout)["data"]["activeTargets"]
        except (json.JSONDecodeError, KeyError, TypeError):
            self.say("prometheus: no answer")
            self.warnings.append("Prometheus's targets couldn't be read")
            return
        down = sorted(
            {
                str(t.get("labels", {}).get("job"))
                for t in targets
                if t.get("health") != "up"
            }
        )
        up = sum(1 for t in targets if t.get("health") == "up")
        self.say(
            f"prometheus targets: {up} up, {len(targets) - up} down{(' (' + ', '.join(down) + ')') if down else ''}"
        )
        if down:
            self.warnings.append(f"Prometheus targets down: {', '.join(down)}")

    def run(self) -> int:
        tree = self.commit()
        if tree is None:
            return 0
        expected = self.expected(
            tree
        )  # one `docker compose config` per run, for both uses
        self.services(tree, expected)
        if "docker" in self.failing:
            self.say("status: Docker didn't answer")
            return 1
        running = {"edge", "gateway"}.isdisjoint(self.failing)
        if running:
            self.health(tree)
        else:
            self.say("gateway /health: not asked, because edge or the gateway is down")
        self.prometheus(tree, expected)
        profiles = read_env(self.env_file).get("COMPOSE_PROFILES", "")
        if self.stack in HOST_STACKS and "gpu" in profiles.split(","):
            gpu = self.docker.nvidia()
            self.say(
                f"gpu memory (used, total): {gpu}"
                if gpu
                else "gpu memory: nvidia-smi isn't available"
            )
        df = self.docker.run("system", "df")
        if df.returncode == 0:
            self.say("docker system df:")
            self.say(df.stdout.rstrip())
        for warning in self.warnings:
            self.say(f"WARN {warning}")
        if self.failing:
            self.say(
                f"status: {len(self.failing)} service(s) failing: {', '.join(self.failing)}; the rest keep running"
            )
            return 1
        self.say(
            "status: healthy" + (", waiting on the operator" if self.warnings else "")
        )
        return 0


def main(argv: list[str], docker: Docker | None = None) -> int:
    parser = argparse.ArgumentParser(description="The stack's state, from the outside")
    parser.add_argument("--stack", required=True, choices=("prod", "dev", "dev-cpu"))
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--run-file", type=Path)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--after-up", action="store_true")
    args = parser.parse_args(argv)
    run_file = args.run_file
    if run_file is None and args.stack in HOST_STACKS:
        run_file = Path.home() / ".local/state/h4reet" / args.stack / "run.env"
    if not args.env_file.is_file():
        print(f"status: {args.env_file} is missing", file=sys.stderr)
        return 1
    status = Status(
        args.stack,
        args.env_file,
        run_file,
        args.root.resolve(),
        docker or Docker(),
        args.after_up,
    )
    return status.run()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
