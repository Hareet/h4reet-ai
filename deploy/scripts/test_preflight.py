"""Tests for deploy/scripts/preflight.py (contracts/env-files.md §10): fixture env files, a fixture tree and home, and
a stubbed docker, free space (statvfs, P13), mounts, memory, ports, and git."""

from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

REPO = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "preflight", REPO / "deploy" / "scripts" / "preflight.py"
)
assert SPEC and SPEC.loader
pf = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = pf  # dataclasses look their module up here
SPEC.loader.exec_module(pf)

GB, GIB = pf.GB, pf.GIB
SHA = "a" * 40
# Token-shaped values are built here, at run time, so this file holds none.
OPERATOR_TOKEN = "h4op_" + "prod_" + "t" * 43
BOT_TOKEN = "1234567" + ":" + "B" * 35
SECRET_SHAPES = {
    "LANGFUSE_PUBLIC_KEY": "pk-lf-" + "11111111-1111-4111-8111-111111111111",
    "LANGFUSE_SECRET_KEY": "sk-lf-" + "22222222-2222-4222-8222-222222222222",
    "SEAWEEDFS_S3_ACCESS_KEY": "A1" * 10,
}
ASKED = {
    "OPERATOR_TOKEN_SHA256": hashlib.sha256(OPERATOR_TOKEN.encode()).hexdigest(),
    "TELEGRAM_BOT_TOKEN": BOT_TOKEN,
    "TELEGRAM_CHAT_ID": "424242",
    "SMTP_HOST": "smtp.example.invalid",
    "SMTP_PORT": "465",
    "SMTP_TLS": "implicit",
    "SMTP_USER": "alerts-user",
    "SMTP_PASSWORD": "q" * 24,
    "ALERT_EMAIL_FROM": "alerts@example.invalid",
    "ALERT_EMAIL_TO": "me@example.invalid",
}
RAW = yaml.safe_load((REPO / "deploy/compose.yaml").read_text(encoding="utf-8"))
LOCK = {
    line.split()[0]: line.split()
    for line in (REPO / "deploy/images.lock").read_text().splitlines()
    if line and not line.startswith("#")
}
OPEN_PIN_DIGEST = "sha256:" + "5" * 64


def ref(service: str) -> str:
    _, repository, tag, digest, *_ = LOCK[service]
    return f"{repository}:{tag}@{digest}"


def to_bytes(text: str) -> str:
    number, unit = re.fullmatch(r"(\d+)([KMG]?)", text).groups()
    return str(int(number) * {"": 1, "K": 2**10, "M": 2**20, "G": 2**30}[unit])


def rendered(raw: dict) -> dict:
    """What `docker compose config --format json` does to the limits: memory becomes bytes."""
    model = copy.deepcopy(raw)
    for service in model["services"].values():
        limits = service.get("deploy", {}).get("resources", {}).get("limits", {})
        if "memory" in limits:
            limits["memory"] = to_bytes(limits["memory"])
    return model


def with_model_servers(raw: dict) -> dict:
    model = copy.deepcopy(raw)
    base = {
        k: v
        for k, v in raw["services"]["gateway-state"].items()
        if k in ("restart", "security_opt", "cap_drop")
    }
    model["services"]["model-server-gpu"] = {
        **base,
        "image": ref("model-server-gpu"),
        "profiles": ["gpu"],
        "deploy": {"resources": {"limits": {"cpus": "4", "memory": "8G"}}},
    }
    model["services"]["model-server-cpu"] = {
        **base,
        "image": ref("model-server-cpu"),
        "profiles": ["cpu"],
        "deploy": {"resources": {"limits": {"cpus": "4", "memory": "2G"}}},
    }
    return model


class FakeHost(pf.Host):
    def __init__(self, home: Path, environ: dict[str, str] | None = None) -> None:
        super().__init__(
            {"PATH": "/usr/bin:/bin", "HOME": str(home), **(environ or {})}
        )
        self._home = home
        self.mount_table = [
            ("/", "ext4", "rw"),
            ("/mnt/c", "9p", "rw,noatime,aname=drvfs;uid=1000"),
        ]
        self.free = {"/": 500 * GB, "/mnt/c": 150 * GB}
        self.mem = 40 * GIB
        self.busy: set[int] = set()
        self.server, self.compose_version = "28.3.3", "2.39.1"
        self.security = ["name=seccomp,profile=builtin", "name=cgroupns"]
        self.authz: list[str] = []
        self.runtimes = {"runc": {}, "nvidia": {}}
        self.root = "/var/lib/docker"
        self.raw = copy.deepcopy(RAW)
        self.images = {ref(s) for s in LOCK if LOCK[s][3].startswith("sha256:")}
        self.containers: list[tuple[str, str, str]] = []
        self.gpu_running = False
        self.vram: str | None = "23000"
        self.git_dir = self.common = "/repo/.git"
        self.status_lines: list[str] = []
        self.bad_refs: set[str] = set()
        self.docker_calls: list[tuple[str, ...]] = []

    def docker(self, *args: str, timeout: float = 60) -> subprocess.CompletedProcess:
        self.docker_calls.append(args)

        def done(code: int = 0, out: str = "") -> subprocess.CompletedProcess:
            return subprocess.CompletedProcess(["docker", *args], code, out, "")

        if self.server is None:
            return done(1)
        if args[0] == "version":
            return done(0, self.server + "\n")
        if args[:2] == ("compose", "version"):
            return done(0, self.compose_version + "\n")
        if args[0] == "info":
            return done(
                0,
                "\n".join(
                    [
                        json.dumps(self.security),
                        json.dumps(self.authz),
                        json.dumps(self.runtimes),
                        self.root,
                    ]
                ),
            )
        if args[0] == "compose" and "config" in args:
            return done(
                0,
                json.dumps(
                    self.raw if "--no-interpolate" in args else rendered(self.raw)
                ),
            )
        if args[:2] == ("image", "inspect"):
            return done(0 if args[-1] in self.images else 1)
        if args[0] == "ps" and "--filter" in args:
            return done(0, "c0ffee\n" if self.gpu_running else "")
        if args[0] == "ps":
            return done(
                0, "".join(f"{p}\t{s}\t{ports}\n" for p, s, ports in self.containers)
            )
        if args[0] == "run":
            return done(0 if self.vram else 1, f"{self.vram}\n" if self.vram else "")
        raise AssertionError(f"unexpected docker {args}")

    def run(self, args: list[str], timeout: float = 60) -> subprocess.CompletedProcess:
        assert args[0] == "nvidia-smi", args
        return subprocess.CompletedProcess(
            args, 0 if self.vram else 1, f"{self.vram}\n" if self.vram else "", ""
        )

    def git(self, repo: Path, *args: str) -> subprocess.CompletedProcess:
        if args[:3] == ("rev-parse", "--path-format=absolute", "--git-dir"):
            return subprocess.CompletedProcess(args, 0, self.git_dir + "\n", "")
        if args[:3] == ("rev-parse", "--path-format=absolute", "--git-common-dir"):
            return subprocess.CompletedProcess(args, 0, self.common + "\n", "")
        if args[:2] == ("rev-parse", "--verify"):
            return subprocess.CompletedProcess(
                args, 1 if args[-1].split("^")[0] in self.bad_refs else 0, "", ""
            )
        if args[0] == "status":
            return subprocess.CompletedProcess(
                args, 0, "".join(f"{s}\n" for s in self.status_lines), ""
            )
        raise AssertionError(f"unexpected git {args}")

    def which(self, name: str) -> str | None:
        return "/usr/bin/nvidia-smi" if name == "nvidia-smi" else None

    def free_bytes(self, path: Path) -> int:
        target = str(path)
        mount = max(
            (
                m
                for m in self.free
                if target == m or target.startswith(m.rstrip("/") + "/")
            ),
            key=len,
        )
        return self.free[mount]

    def mounts(self) -> list[tuple[str, str, str]]:
        return self.mount_table

    def mem_available(self) -> int:
        return self.mem

    def port_free(self, port: int) -> bool:
        return port not in self.busy

    def home(self) -> Path:
        return self._home


def env_text(template: Path, home: Path, root: Path) -> str:
    out = []
    for line in template.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.partition("=")
        if sep and not line.startswith("#"):
            if value == "__GENERATE__":
                value = SECRET_SHAPES.get(key, hashlib.sha256(key.encode()).hexdigest())
            elif value == "__ASK__":
                value = ASKED[key]
            value = value.replace("__HOME__", str(home)).replace("__REPO__", str(root))
            line = f"{key}={value}"
        out.append(line)
    return "\n".join(out) + "\n"


class Stage:
    """A fixture tree, home, env file, run file, and host for one stack, valid until a test changes it."""

    def __init__(self, tmp_path: Path, stack: str) -> None:
        self.stack = stack
        self.root = tmp_path / stack / "tree"
        self.home = tmp_path / stack / "home"
        for rel in (
            "deploy/compose.yaml",
            "deploy/images.lock",
            "deploy/models.lock",
            "deploy/env.example/prod.env.example",
            "deploy/env.example/dev.env.example",
            "deploy/env.agents/dev-cpu.vars",
            "deploy/aws-none/README.md",
        ):
            (self.root / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(REPO / rel, self.root / rel)
        self.write(
            self.root / "config/routing.yaml",
            "schema: 1\nadapters:\n  local: {type: openai-compatible, kind: local}\nenvs:\n  prod: {primary: local}\n  dev: {primary: local}\n",
        )
        self.host = FakeHost(self.home)
        self.pin_open_images()
        self.run_file: Path | None = None
        if stack == "dev-cpu":
            self.env_file = self.root / "deploy/env.agents/dev-cpu.vars"
            return
        config = self.home / ".config/h4reet-ai"
        self.env_file = config / "env" / f"{stack}.env"
        self.env_file.parent.mkdir(parents=True)
        for path in (config, self.env_file.parent):
            path.chmod(0o700)
        template = self.root / f"deploy/env.example/{stack}.env.example"
        self.env_file.write_text(
            env_text(template, self.home, self.root), encoding="utf-8"
        )
        self.env_file.chmod(0o600)
        if stack == "dev":
            self.set(
                **{
                    k: ""
                    for k in (
                        "TELEGRAM_BOT_TOKEN",
                        "TELEGRAM_CHAT_ID",
                        "SMTP_HOST",
                        "SMTP_PORT",
                        "SMTP_USER",
                        "SMTP_PASSWORD",
                        "ALERT_EMAIL_FROM",
                        "ALERT_EMAIL_TO",
                    )
                }
            )
        token = config / "operator" / f"{stack}.token"
        self.write(token, OPERATOR_TOKEN + "\n")
        token.chmod(0o600)
        if stack == "prod":
            (config / "aws-home/.aws").mkdir(parents=True)
            (config / "aws-home/.aws").chmod(0o700)
        state = self.home / ".local/state/h4reet" / stack
        export = state / "tree" / SHA
        self.write(export / "deploy/compose.yaml", "services: {}\n")
        self.run_file = state / "run.env"
        self.write(
            self.run_file,
            f"H4_TREE={export}\nH4_REF={SHA}\nH4_REF_BRANCH=main\nH4_REF_PREVIOUS=\n",
        )
        (self.home / ".local/share/h4reet/models").mkdir(parents=True)

    @staticmethod
    def write(path: Path, text: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def pin_open_images(self) -> None:
        """The tree as make pin-images leaves it (tasks.md T063): every open deploy/images.lock line gets a tag and a
        digest, in the fixture's lock and in the compose model, and its image is present. With the committed lock
        already pinned, this changes nothing."""
        lock = self.root / "deploy/images.lock"
        lines = []
        for line in lock.read_text(encoding="utf-8").splitlines():
            fields = line.split()
            if fields and not line.startswith("#") and fields[3] == "-":
                fields[2], fields[3], fields[5] = "3.97", OPEN_PIN_DIGEST, "2026-10-09"
                image = f"{fields[1]}:{fields[2]}@{fields[3]}"
                self.host.raw["services"][fields[0]]["image"] = image
                self.host.images.add(image)
                line = "  ".join(fields)
            lines.append(line)
        lock.write_text("\n".join(lines) + "\n", encoding="utf-8")

    def set(self, **values: str | None) -> None:
        lines = self.env_file.read_text(encoding="utf-8").splitlines()
        out = []
        for line in lines:
            key = line.split("=", 1)[0]
            if key in values:
                if values[key] is not None:
                    out.append(f"{key}={values.pop(key)}")
                else:
                    values.pop(key)
                continue
            out.append(line)
        out += [f"{k}={v}" for k, v in values.items() if v is not None]
        self.env_file.write_text("\n".join(out) + "\n", encoding="utf-8")

    def models_lock(self, gpu_vram: str = "21800") -> None:
        self.write(
            self.root / "deploy/models.lock",
            "# id alias repo revision file sha256 bytes license vram stacks\n"
            f"qwen3-30b qwen3-30b-a3b-instruct-2507 unsloth/x {'e' * 40} Qwen3-30B-A3B-Instruct-2507-Q4_K_M.gguf {'1' * 64} 18556686752 Apache-2.0 {gpu_vram} prod\n"
            f"qwen25-05b qwen2.5-0.5b-instruct Qwen/y {'9' * 40} qwen2.5-0.5b-instruct-q4_k_m.gguf {'2' * 64} 491400032 Apache-2.0 1536MiB dev,dev-cpu\n",
        )
        self.host.raw = with_model_servers(self.host.raw)

    def context(
        self, mode: str = "up", models: str = "stack", ref: str | None = None
    ) -> pf.Context:
        return pf.Context(
            pf.STACKS[self.stack],
            self.env_file,
            self.root,
            self.root,
            self.host,
            mode,
            models,
            self.run_file,
            ref,
        )

    def results(self, **kwargs: str) -> dict[str, pf.Result]:
        return {r.check: r for r in pf.run_checks(self.context(**kwargs))}


@pytest.fixture(params=["prod", "dev", "dev-cpu"])
def any_stack(request: pytest.FixtureRequest, tmp_path: Path) -> Stage:
    stage = Stage(tmp_path, request.param)
    if request.param == "dev-cpu":
        stage.host.security.append("name=rootless")
        stage.host.authz = ["h4-authz"]
    return stage


@pytest.fixture
def prod(tmp_path: Path) -> Stage:
    return Stage(tmp_path, "prod")


@pytest.fixture
def dev(tmp_path: Path) -> Stage:
    return Stage(tmp_path, "dev")


@pytest.fixture
def devcpu(tmp_path: Path) -> Stage:
    stage = Stage(tmp_path, "dev-cpu")
    stage.host.security.append("name=rootless")
    stage.host.authz = ["h4-authz"]
    return stage


def statuses(results: dict[str, pf.Result]) -> dict[str, str]:
    return {k: r.status for k, r in results.items()}


def seed_engine_model(stage: Stage, monkeypatch: pytest.MonkeyPatch) -> Path:
    """dev-cpu's model as engine.sh seed leaves it: the lock's size, mode 0444, in the engine's model directory,
    which this test moves under tmp_path (P7 holds dev-cpu to the fixed path, and P18 looks there)."""
    models = stage.root.parent / "engine-models"
    models.mkdir()
    monkeypatch.setitem(pf.DEVCPU, "H4_MODEL_DIR", str(models))
    stage.write(
        stage.env_file,
        stage.env_file.read_text(encoding="utf-8").replace(
            "H4_MODEL_DIR=/run/h4agents/models", f"H4_MODEL_DIR={models}"
        ),
    )
    (entry,) = [
        m
        for m in pf.read_models(stage.root / "deploy/models.lock")
        if "dev-cpu" in m.stacks
    ]
    path = models / entry.file
    with path.open("wb") as handle:
        handle.truncate(entry.bytes)  # sparse: the lock's size, without the bytes
    path.chmod(0o444)
    return path


# ---------------------------------------------------------------------------------------------------------------


def test_a_valid_stack_passes(
    any_stack: Stage, monkeypatch: pytest.MonkeyPatch
) -> None:
    if any_stack.stack == "dev-cpu":
        seed_engine_model(any_stack, monkeypatch)
    results = any_stack.results()
    assert {
        k: (r.status, r.reason) for k, r in results.items() if r.status == "FAIL"
    } == {}
    expected = {f"P{i}" for i in range(1, 19)} | (
        {"P19", "P21"} if any_stack.stack == "prod" else set()
    )
    expected |= {"P21"} if any_stack.stack == "dev" else set()
    expected |= {"P20"} if any_stack.stack == "dev-cpu" else set()
    assert set(results) == expected
    # The model checks run against the committed deploy/models.lock. A host stack's model isn't in the cache yet,
    # and pull-models.sh fetches it next; dev-cpu's is the seeded one.
    assert results["P7"].status == "PASS"
    if any_stack.stack == "dev-cpu":
        assert results["P18"].status == "PASS"
    else:
        assert results["P18"].status == "WARN"
        assert "pull-models.sh fetches it next" in results["P18"].reason
    assert "T057" not in "".join(r.reason for r in results.values())


def test_main_prints_one_line_per_check_and_never_a_value(
    prod: Stage, capsys: pytest.CaptureFixture[str]
) -> None:
    code = pf.main(
        ["--stack", "prod", "--env-file", str(prod.env_file), "--root", str(prod.root)],
        prod.host,
    )
    out = capsys.readouterr().out
    assert code == 0, out
    lines = out.splitlines()
    assert [ln.split()[1] for ln in lines[:-1]] == [
        f"P{i}" for i in (*range(1, 20), 21)
    ]
    assert lines[-1].startswith("preflight: passed with warnings")
    values = pf.read_env(prod.env_file)
    for key in (
        "GATEWAY_DB_PASSWORD",
        "LANGFUSE_SECRET_KEY",
        "SMTP_PASSWORD",
        "TELEGRAM_BOT_TOKEN",
        "OPERATOR_TOKEN_SHA256",
    ):
        assert values[key] not in out, key


def test_p1_the_file_and_its_modes(prod: Stage) -> None:
    prod.env_file.chmod(0o644)
    assert "not 0600" in prod.results()["P1"].reason
    prod.env_file.chmod(0o600)
    prod.env_file.parent.chmod(0o755)
    assert "not 0700" in prod.results()["P1"].reason
    prod.env_file.parent.chmod(0o700)
    prod.env_file.unlink()
    results = prod.results()
    assert (
        results["P1"].status == "FAIL"
        and "make init-env ENV=prod" in results["P1"].reason
    )
    assert results["P2"].reason == "needs a readable env file (P1)"


def test_p1_dev_cpus_committed_file_needs_no_mode(devcpu: Stage) -> None:
    devcpu.env_file.chmod(0o644)
    assert devcpu.results()["P1"].status == "PASS"


def test_p2_the_grammar_names_the_line_and_key_never_the_value(dev: Stage) -> None:
    dev.set(SMTP_HOST="has space", GATEWAY_DB_PASSWORD="p$ssword")
    with dev.env_file.open("a", encoding="utf-8") as handle:
        handle.write("export X=1\nH4_STACK=dev\n")
    reason = dev.results()["P2"].reason
    assert (
        "SMTP_HOST" in reason
        and "GATEWAY_DB_PASSWORD" in reason
        and "appears twice" in reason
        and "not KEY=VALUE" in reason
    )
    assert "has space" not in reason and "p$ssword" not in reason


def test_p3_placeholders_and_empty_values(prod: Stage, dev: Stage) -> None:
    prod.set(TELEGRAM_CHAT_ID="__ASK__", VALKEY_PASSWORD="__GENERATE__", SMTP_HOST="")
    reason = prod.results()["P3"].reason
    assert (
        "TELEGRAM_CHAT_ID" in reason
        and "VALKEY_PASSWORD" in reason
        and "empty: SMTP_HOST" in reason
    )
    assert dev.results()["P3"].status == "PASS"  # dev's channel keys may be empty


def test_p4_key_parity_with_the_template(dev: Stage, devcpu: Stage) -> None:
    dev.set(GATEWAY_TEST_CLOCK=None, LANGFUSE_AI_FEATURES="on")
    reason = dev.results()["P4"].reason
    assert (
        "missing GATEWAY_TEST_CLOCK" in reason
        and "SYNC=1" in reason
        and "not in the template: LANGFUSE_AI_FEATURES" in reason
    )
    assert devcpu.results()["P4"].status == "PASS"


def test_p5_the_shell_may_not_override_the_file(tmp_path: Path) -> None:
    stage = Stage(tmp_path, "dev")
    stage.host.environ.update(
        {"COMPOSE_PROFILES": "breach", "H4_TREE": "/", "TELEGRAM_BOT_TOKEN": BOT_TOKEN}
    )
    reason = stage.results()["P5"].reason
    assert (
        "COMPOSE_PROFILES, H4_TREE, TELEGRAM_BOT_TOKEN" in reason
        and BOT_TOKEN not in reason
    )


def test_p6_the_stack_agrees(dev: Stage) -> None:
    dev.set(H4_STACK="prod", COMPOSE_PROFILES="gpu,cpu,dev-receivers")
    reason = dev.results()["P6"].reason
    assert (
        "H4_STACK isn't dev" in reason
        and "COMPOSE_PROFILES isn't gpu,dev-receivers" in reason
    )


@pytest.mark.parametrize(
    ("changes", "expected"),
    [
        ({"H4_API_PORT": "18100"}, "H4_API_PORT isn't prod's 18000"),
        ({"H4_TREE": "/x"}, "H4_TREE is set in a host stack's env file"),
        ({"H4_STATE_DIR": "/tmp/prod"}, "H4_STATE_DIR isn't"),
        (
            {"H4_BUILD_PROXY": "http://198.18.0.1:3128"},
            "H4_BUILD_PROXY is set on a host stack",
        ),
        ({"ALERT_DELIVERY": "standin"}, "ALERT_DELIVERY isn't real on prod"),
        (
            {"TELEGRAM_API_BASE": "http://telegram-standin:8080"},
            "TELEGRAM_API_BASE isn't https://api.telegram.org",
        ),
        ({"SMTP_PORT": "587"}, "aren't implicit with 465 or starttls with 587"),
        ({"SMTP_TLS": "none"}, "none only on dev-cpu"),
        (
            {"GATEWAY_AWS_PROFILE": "default"},
            "GATEWAY_AWS_PROFILE isn't h4reet-bedrock",
        ),
        ({"OPERATOR_TOKEN_SHA256": "ABC"}, "isn't 64 lowercase hex"),
        (
            {"LOCAL_MODEL_BASE_URL": "https://api.example.com/v1"},
            "LOCAL_MODEL_BASE_URL",
        ),
        # Numeric hosts are IPv4 addresses (8.8.8.8, 127.0.0.1, 127.0.0.1 again), never in-stack services.
        ({"LOCAL_MODEL_BASE_URL": "http://134744072:8080/v1"}, "LOCAL_MODEL_BASE_URL"),
        ({"LOCAL_MODEL_BASE_URL": "http://0x7f000001:8080/v1"}, "LOCAL_MODEL_BASE_URL"),
        ({"LOCAL_MODEL_BASE_URL": "http://017700000001/v1"}, "LOCAL_MODEL_BASE_URL"),
        # The gateway's label rule: at most 63 characters, never ending in a hyphen; and a real port.
        (
            {"LOCAL_MODEL_BASE_URL": f"http://m{'o' * 63}:8080/v1"},
            "LOCAL_MODEL_BASE_URL",
        ),
        ({"LOCAL_MODEL_BASE_URL": "http://model-:8080/v1"}, "LOCAL_MODEL_BASE_URL"),
        (
            {"LOCAL_MODEL_BASE_URL": "http://model-server:65536/v1"},
            "LOCAL_MODEL_BASE_URL",
        ),
        ({"LOCAL_MODEL_BASE_URL": "http://model-server:0/v1"}, "LOCAL_MODEL_BASE_URL"),
        (
            {"LANGFUSE_SECRET_KEY": "pk-lf-x"},
            "LANGFUSE_SECRET_KEY doesn't start sk-lf-",
        ),
        ({"LANGFUSE_ENCRYPTION_KEY": "short"}, "LANGFUSE_ENCRYPTION_KEY isn't 64"),
        ({"LANGFUSE_DB_PASSWORD": "a/b@c"}, "URL escaping"),
        # A bare space doesn't parse (P2), but single quotes carry one to P7; so can a non-ASCII character.
        (
            {"GATEWAY_GRAFANA_RO_PASSWORD": "'correct horse battery'"},
            "isn't printable ASCII",
        ),
        ({"GATEWAY_GRAFANA_RO_PASSWORD": "p\u00e4ssword"}, "isn't printable ASCII"),
        ({"H4_VHDX_MOUNT": "/mnt/z"}, "isn't a mounted Windows drive"),
    ],
)
def test_p7_values(prod: Stage, changes: dict[str, str], expected: str) -> None:
    prod.set(**changes)
    result = prod.results()["P7"]
    assert result.status == "FAIL" and expected in result.reason
    # One bad value fails P7, and only the checks that depend on it: H4_TREE is also a key the template lacks
    # (P4), and a mount that isn't a Windows drive fails the disk check closed (P13).
    cascades = {"H4_TREE": "P4", "H4_VHDX_MOUNT": "P13"}
    others = {k for k, r in prod.results().items() if r.status == "FAIL" and k != "P7"}
    assert others == {cascades[k] for k in changes if k in cascades}


def test_p7_the_operator_token(prod: Stage, devcpu: Stage) -> None:
    (prod.home / ".config/h4reet-ai/operator/prod.token").unlink()
    assert "make operator-token ENV=prod" in prod.results()["P7"].reason
    dummy = pf.read_env(REPO / "deploy/env.agents/dev-cpu.vars")[
        "OPERATOR_TOKEN_SHA256"
    ]
    prod.set(OPERATOR_TOKEN_SHA256=dummy)
    assert "published dev-cpu dummy's hash" in prod.results()["P7"].reason
    devcpu.write(
        devcpu.env_file,
        devcpu.env_file.read_text().replace(
            "OPERATOR_TOKEN_SHA256=a2d3", "OPERATOR_TOKEN_SHA256=b2d3"
        ),
    )
    assert "isn't the dummy token's SHA-256" in devcpu.results()["P7"].reason


def test_p7_the_run_file(prod: Stage) -> None:
    other = prod.home / "elsewhere"
    prod.write(
        prod.run_file,
        f"H4_TREE={other}\nH4_REF={SHA}\nH4_REF_BRANCH=main\nH4_REF_PREVIOUS=\n",
    )
    assert (
        "isn't" in prod.results()["P7"].reason
        and "the export of its H4_REF" in prod.results()["P7"].reason
    )
    prod.run_file.unlink()
    assert "no run file" in prod.results()["P7"].reason
    # make pull needs no run file.
    pulled = prod.results(mode="pull")["P7"]
    assert pulled.status == "PASS" and "run file" not in pulled.reason


def test_p7_dev_cpus_fixed_paths_and_devs_aws_none(devcpu: Stage, dev: Stage) -> None:
    devcpu.write(
        devcpu.env_file,
        devcpu.env_file.read_text().replace(
            "H4_TREE=/run/h4agents/tree", "H4_TREE=/home/h4reet/repo"
        ),
    )
    assert "H4_TREE isn't /run/h4agents/tree" in devcpu.results()["P7"].reason
    (dev.root / "deploy/aws-none/credentials").write_text("x")
    assert "holds more than its README.md" in dev.results()["P7"].reason


def test_p7_the_model_keys(dev: Stage) -> None:
    dev.models_lock()
    assert dev.results()["P7"].status == "PASS"
    dev.set(MODEL_ALIAS="other")
    assert "MODEL_ALIAS isn't the lock's alias" in dev.results()["P7"].reason
    dev.set(MODEL_ALIAS="qwen2.5-0.5b-instruct", MODEL_CTX_SIZE="8191")
    assert "positive multiple of MODEL_PARALLEL" in dev.results()["P7"].reason
    # No division by zero: the range check comes first.
    dev.set(MODEL_CTX_SIZE="8192", MODEL_PARALLEL="0")
    assert "MODEL_PARALLEL isn't 1 to 8" in dev.results()["P7"].reason
    dev.set(MODEL_PARALLEL="2", MODEL_FILE="other.gguf")
    assert (
        "MODEL_FILE names no deploy/models.lock entry for dev"
        in dev.results()["P7"].reason
    )
    dev.set(MODEL_FILE="qwen2.5-0.5b-instruct-q4_k_m.gguf")
    dev.write(dev.root / "deploy/models.lock", "m a r v f.gguf\n")
    results = dev.results()
    assert (
        "deploy/models.lock doesn't parse: models.lock line 1: expected 10 fields"
        in results["P7"].reason
    )
    assert results["P18"].status == "FAIL" and "doesn't parse" in results["P18"].reason
    (dev.root / "deploy/models.lock").unlink()
    results = dev.results()
    assert results["P7"].reason.endswith("deploy/models.lock is missing")
    assert results["P18"].reason == "deploy/models.lock is missing"


def test_the_committed_models_lock_names_both_models_one_per_line() -> None:
    """research.md R-03's two pins, each on one line with its file and sha256, as engine.sh seed reads them."""
    models = {m.file: m for m in pf.read_models(REPO / "deploy/models.lock")}
    assert set(models) == {
        "Qwen3-30B-A3B-Instruct-2507-Q4_K_M.gguf",
        "qwen2.5-0.5b-instruct-q4_k_m.gguf",
    }
    prod = models["Qwen3-30B-A3B-Instruct-2507-Q4_K_M.gguf"]
    standin = models["qwen2.5-0.5b-instruct-q4_k_m.gguf"]
    assert (prod.repo, prod.revision, prod.bytes, prod.stacks) == (
        "unsloth/Qwen3-30B-A3B-Instruct-2507-GGUF",
        "eea7b2be5805a5f151f8847ede8e5f9a9284bf77",
        18556686752,
        ("prod",),
    )
    assert (
        prod.sha256
        == "6c997b8af17debdfb01d890214400ccbab00db6acc0ba8da5de1cc906c4774d0"
    )
    assert (standin.repo, standin.revision, standin.bytes, standin.stacks) == (
        "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
        "9217f5db79a29953eb74d5343926648285ec7e67",
        491400032,
        ("dev", "dev-cpu"),
    )
    assert (
        standin.sha256
        == "74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db"
    )
    assert {m.license for m in models.values()} == {"Apache-2.0"}
    for stack, path in (
        ("prod", REPO / "deploy/env.example/prod.env.example"),
        ("dev", REPO / "deploy/env.example/dev.env.example"),
        ("dev-cpu", REPO / "deploy/env.agents/dev-cpu.vars"),
    ):
        values = pf.read_env(path)
        model = models[values["MODEL_FILE"]]
        assert stack in model.stacks and values["MODEL_ALIAS"] == model.alias, stack
    # engine.sh seed_model takes the first 64-hex run on the lines that name the stand-in's file: exactly one line
    # does, and that run is its sha256 (the 40-hex revision can't be one).
    text = (REPO / "deploy/models.lock").read_text(encoding="utf-8")
    lines = [ln for ln in text.splitlines() if standin.file in ln]
    assert len(lines) == 1
    assert re.findall(r"[0-9a-f]{64}", lines[0])[0] == standin.sha256


def test_p8_switches_and_paid_routes(prod: Stage, dev: Stage) -> None:
    prod.set(TELEMETRY_PAYLOAD_SAMPLING="on")
    assert (
        "TELEMETRY_PAYLOAD_SAMPLING is on outside H4_ENV=dev"
        in prod.results()["P8"].reason
    )
    dev.set(GATEWAY_TEST_CLOCK="yes")
    assert "GATEWAY_TEST_CLOCK isn't 0 or 1" in dev.results()["P8"].reason
    dev.set(GATEWAY_TEST_CLOCK="1")
    dev.write(
        dev.root / "config/routing.yaml",
        "adapters:\n  local: {kind: local}\n  bedrock: {kind: paid}\nenvs:\n  prod: {primary: local}\n  dev: {primary: local, fallback: bedrock}\n",
    )
    assert (
        "routes dev to bedrock, a paid adapter, outside prod"
        in dev.results()["P8"].reason
    )
    (dev.root / "config/routing.yaml").unlink()
    result = dev.results()["P8"]
    assert result.status == "WARN" and "exit 78" in result.reason


@pytest.mark.parametrize(
    "rel",
    [
        "deploy/.env",
        "deploy/compose.override.yaml",
        "deploy/docker-compose.override.yml",
        "deploy/env/prod.env",
        "services/x/.env.local",
        "a/b/real.env",
    ],
)
def test_p9_stray_files(dev: Stage, rel: str) -> None:
    dev.write(dev.root / rel, "A=1\n")
    result = dev.results()["P9"]
    assert result.status == "FAIL" and rel.split("/")[-1] in result.reason


def test_p9_templates_and_node_modules_pass(dev: Stage) -> None:
    dev.write(dev.root / ".env.example", "A=1\n")
    dev.write(dev.root / "node_modules/pkg/.env", "A=1\n")
    assert dev.results()["P9"].status == "PASS"


def test_p10_docker_and_compose(dev: Stage) -> None:
    dev.host.compose_version = "2.29.7"
    assert "older than 2.30" in dev.results()["P10"].reason
    dev.host.server = None
    dev.host.environ["SANDBOX_RUNTIME"] = "1"
    assert "docker-relay" in dev.results()["P10"].reason


def test_p11_the_right_engine(prod: Stage, devcpu: Stage) -> None:
    prod.host.security.append("name=rootless")
    assert "rootless" in prod.results()["P11"].reason
    devcpu.host.authz = []
    assert "rootless, with h4-authz" in devcpu.results()["P11"].reason


def test_p12_the_gpu(prod: Stage, devcpu: Stage) -> None:
    prod.models_lock()
    assert prod.results()["P12"].status == "PASS"
    prod.host.vram = "12000"
    assert (
        "12000 MiB of VRAM free" in prod.results()["P12"].reason
        and prod.results()["P12"].status == "FAIL"
    )
    prod.host.gpu_running = True
    assert prod.results()["P12"].status == "PASS"
    prod.host.runtimes = {"runc": {}}
    assert "nvidia runtime is missing" in prod.results()["P12"].reason
    assert devcpu.results()["P12"].reason == "no gpu profile"


def test_p12_a_gpu_stack_needs_the_gpu_model_server(prod: Stage) -> None:
    # The committed compose file defines it, so P12 checks the GPU itself.
    assert "model-server-gpu" in RAW["services"]
    del prod.host.raw["services"]["model-server-gpu"]
    result = prod.results()["P12"]
    assert result.status == "FAIL" and "has no model-server-gpu" in result.reason


def test_p13_both_drives_with_every_figure(prod: Stage) -> None:
    prod.models_lock()
    result = prod.results()["P13"]
    # The 18.6 GB model and the 20 GB margin fit the stub's 150 GB on C: and 500 GB on ext4.
    assert result.status == "PASS"
    assert (
        "1 model(s) to download, 18.6 GB" in result.reason
        and "needs 38.6 GB" in result.reason
    )
    for figure in (
        "/mnt/c 150.0 GB free",
        "/var/lib/docker 500.0 GB free",
        "models 500.0 GB free",
    ):
        assert figure in result.reason


def test_p13_the_windows_drive(prod: Stage) -> None:
    model = (
        prod.home / ".local/share/h4reet/models/Qwen3-30B-A3B-Instruct-2507-Q4_K_M.gguf"
    )
    with model.open("wb") as handle:
        handle.truncate(18556686752)  # sparse: the lock's size, so no model to download
    prod.host.free["/mnt/c"] = 30 * GB
    result = prod.results()["P13"]
    assert (
        result.status == "PASS" and "/mnt/c 30.0 GB free" in result.reason
    )  # 0 models, 0 images: 20 GB needed
    prod.host.images.clear()
    result = prod.results()["P13"]
    assert (
        result.status == "FAIL"
        and "counted as 12.0 GB" in result.reason
        and "/mnt/c has 30.0 GB free" in result.reason
    )
    assert "32.0 GB" in result.reason
    prod.host.mount_table = [("/", "ext4", "rw")]
    assert "fails closed" in prod.results()["P13"].reason


def test_p13_ext4_and_the_model_download(prod: Stage) -> None:
    prod.models_lock()
    prod.host.free["/"] = 30 * GB
    result = prod.results()["P13"]
    assert (
        result.status == "FAIL"
        and "38.6 GB" in result.reason
        and "/var/lib/docker has 30.0 GB free" in result.reason
    )
    model = (
        prod.home / ".local/share/h4reet/models/Qwen3-30B-A3B-Instruct-2507-Q4_K_M.gguf"
    )
    with model.open("wb") as handle:
        handle.truncate(18556686752)  # sparse: the lock's size, nothing to download
    assert prod.results()["P13"].status == "PASS"


def test_p13_pull_counts_every_model(dev: Stage) -> None:
    dev.models_lock()
    result = dev.results(mode="pull", models="all")["P13"]
    assert "2 model(s) to download, 19.0 GB" in result.reason


def test_p14_the_model_directory(prod: Stage) -> None:
    prod.set(H4_MODEL_DIR="/mnt/c/models")
    assert "under /mnt/" in prod.results()["P14"].reason
    prod.set(H4_MODEL_DIR=str(prod.home / "models"))
    prod.host.mount_table = [("/", "xfs", "rw"), ("/mnt/c", "9p", "aname=drvfs")]
    assert "not ext4" in prod.results()["P14"].reason


def limits_gib(raw: dict, profiles: set[str]) -> str:
    """The memory limits of the services the profiles start, summed from the compose file as written."""
    total = 0
    for service in raw["services"].values():
        wanted = set(service.get("profiles") or [])
        if not wanted or wanted & profiles:
            total += int(to_bytes(service["deploy"]["resources"]["limits"]["memory"]))
    return f"{total / GIB:.1f} GiB"


def test_p15_memory(prod: Stage, devcpu: Stage) -> None:
    prod.host.mem = 4 * GIB
    result = prod.results()["P15"]
    assert result.status == "FAIL"
    assert (
        f"the limits sum to {limits_gib(RAW, {'gpu'})}, plus 4.0 GiB" in result.reason
    )
    # The engine's budget holds dev-cpu's whole stack.
    assert devcpu.results()["P15"].status == "PASS"
    assert (
        f"the limits sum to {limits_gib(RAW, {'cpu', 'dev-receivers', 'breach'})} with the breach probe"
        in devcpu.results()["P15"].reason
    )
    devcpu.models_lock()
    devcpu.host.raw["services"]["clickhouse"] = {
        "profiles": [],
        "deploy": {"resources": {"limits": {"memory": "14G"}}},
    }
    result = devcpu.results()["P15"]
    assert result.status == "FAIL" and "against the engine's 15.0 GiB" in result.reason
    del devcpu.host.raw["services"]["clickhouse"]["deploy"]
    assert "no memory limit on clickhouse" in devcpu.results()["P15"].reason


def test_p16_ports(prod: Stage, devcpu: Stage) -> None:
    prod.host.containers = [
        ("h4reet-prod", "edge", "127.0.0.1:18000->8080/tcp, 127.0.0.1:18001->8081/tcp")
    ]
    assert prod.results()["P16"].status == "PASS"
    prod.host.containers.append(("h4reet-dev", "edge", "127.0.0.1:18002->8082/tcp"))
    assert "18002 is published by h4reet-dev/edge" in prod.results()["P16"].reason
    prod.host.containers.pop()
    prod.host.busy = {18003}
    assert "18003 is held by another process" in prod.results()["P16"].reason
    devcpu.host.busy = {
        18300
    }  # the sandbox's own loopback doesn't matter on the engine
    assert devcpu.results()["P16"].status == "PASS"


def test_p17_images_against_the_lock(dev: Stage) -> None:
    dev.host.raw["services"]["edge"]["image"] = (
        ref("edge").rsplit(":", 1)[0] + ":" + "f" * 64
    )
    assert "edge: differs from deploy/images.lock" in dev.results()["P17"].reason
    dev.host.raw["services"]["edge"]["image"] = (
        "ghcr.io/nginx/nginx-unprivileged:latest"
    )
    assert "edge: not pinned by digest" in dev.results()["P17"].reason


def test_p17_an_open_pin_starts_nothing(dev: Stage) -> None:
    """SeaweedFS's lock line, as it stands until make pin-images (T063): the policy says PLANNED, preflight refuses."""
    lock = dev.root / "deploy/images.lock"
    lines = []
    for line in lock.read_text(encoding="utf-8").splitlines():
        fields = line.split()
        if fields and fields[0] == "seaweedfs":
            fields[2] = fields[3] = fields[5] = "-"
            line = "  ".join(fields)
        lines.append(line)
    lock.write_text("\n".join(lines) + "\n", encoding="utf-8")
    dev.host.raw["services"]["seaweedfs"]["image"] = "docker.io/chrislusf/seaweedfs"
    result = dev.results()["P17"]
    assert result.status == "FAIL"
    assert (
        "seaweedfs: its pin in deploy/images.lock is still open: make pin-images"
        in (result.reason)
    )


def test_p18_the_model_file(dev: Stage, devcpu: Stage) -> None:
    dev.models_lock()
    assert dev.results()["P18"].status == "WARN"  # pull-models.sh fetches it next
    model = dev.home / ".local/share/h4reet/models/qwen2.5-0.5b-instruct-q4_k_m.gguf"
    model.write_bytes(b"x")
    model.chmod(0o644)
    reason = dev.results()["P18"].reason
    assert "not the lock's 491400032" in reason and "mode 0444" in reason
    assert "make pull ENV=dev checks a file of the lock's size" in reason
    model.unlink()
    real = dev.home / "elsewhere.gguf"
    real.write_bytes(b"x")
    model.symlink_to(real)
    result = dev.results()["P18"]
    assert result.status == "FAIL" and "a symbolic link" in result.reason
    devcpu.models_lock()
    assert "engine.sh seed" in devcpu.results()["P18"].reason


def test_p19_prods_aws_directory(prod: Stage) -> None:
    aws = prod.home / ".config/h4reet-ai/aws-home/.aws"
    assert prod.results()["P19"].status == "PASS"
    aws.chmod(0o755)
    assert "isn't mode 0700" in prod.results()["P19"].reason
    aws.chmod(0o700)
    prod.write(
        prod.root / "config/routing.yaml",
        "adapters:\n  local: {kind: local}\n  bedrock: {kind: paid}\nenvs:\n  prod: {primary: local, fallback: bedrock}\n  dev: {primary: local}\n",
    )
    assert "[profile h4reet-bedrock]" in prod.results()["P19"].reason
    # The profile's SSO region is its sso-session's, and must be us-east-1 (tasks.md T194).
    prod.write(
        aws / "config",
        "[profile h4reet-bedrock]\nsso_session = x\n\n[sso-session x]\nsso_region = us-east-1\n",
    )
    assert prod.results()["P19"].status == "PASS"
    prod.write(aws / "config", "[profile h4reet-bedrock]\nsso_session = x\n")
    assert "SSO region is not set" in prod.results()["P19"].reason
    # A file that doesn't parse says so, rather than calling the region missing (round 3's review).
    prod.write(
        aws / "config",
        "[profile h4reet-bedrock]\nsso_session = x\nnot a key and a value\n",
    )
    assert "isn't a config the AWS CLI can read" in prod.results()["P19"].reason
    prod.write(
        aws / "config",
        "[profile h4reet-bedrock]\nsso_session = x\n\n[sso-session x]\nsso_region = eu-west-1\n",
    )
    assert "SSO region is eu-west-1" in prod.results()["P19"].reason
    prod.write(
        aws / "config",
        "[profile h4reet-bedrock]\nsso_start_url = https://example.invalid/start\nsso_region = us-east-1\n",
    )
    assert prod.results()["P19"].status == "PASS"  # a legacy profile names its own


def test_p19_refuses_a_linked_aws_directory(prod: Stage, tmp_path: Path) -> None:
    # A link would put prod's mount wherever it points, the Author's own ~/.aws among them (tasks.md T194).
    aws = prod.home / ".config/h4reet-ai/aws-home/.aws"
    real = tmp_path / "elsewhere-aws"
    real.mkdir(mode=0o700)
    real.chmod(0o700)
    aws.rmdir()
    aws.symlink_to(real)
    result = prod.results()["P19"]
    assert result.status == "FAIL" and f"{aws} is a symbolic link" in result.reason
    aws.unlink()
    home = aws.parent
    moved = tmp_path / "elsewhere-home"
    home.rename(moved)
    (moved / ".aws").mkdir(mode=0o700, exist_ok=True)
    home.symlink_to(moved)
    result = prod.results()["P19"]
    assert result.status == "FAIL" and f"{home} is a symbolic link" in result.reason


def test_p20_dev_cpu_from_the_main_tree_only(devcpu: Stage) -> None:
    devcpu.host.git_dir = "/repo/.git/worktrees/x"
    assert "linked worktree" in devcpu.results()["P20"].reason


def test_p21_uncommitted_changes_warn_and_a_bad_ref_fails(dev: Stage) -> None:
    dev.host.status_lines = [" M deploy/compose.yaml", "?? config/new.yaml"]
    result = dev.results()["P21"]
    assert (
        result.status == "WARN"
        and "deploy/compose.yaml, config/new.yaml" in result.reason
    )
    dev.host.bad_refs = {"nope"}
    assert dev.results(ref="nope")["P21"].status == "FAIL"


def test_pull_runs_its_subset(dev: Stage) -> None:
    assert set(dev.results(mode="pull")) == {
        "P1",
        "P2",
        "P3",
        "P4",
        "P5",
        "P6",
        "P7",
        "P10",
        "P13",
        "P14",
    }


def test_disk_only(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    host = FakeHost(tmp_path)
    assert (
        pf.main(
            [
                "--disk-only",
                "--bytes",
                str(18 * GB),
                "--path",
                str(tmp_path / "models"),
            ],
            host,
        )
        == 0
    )
    host.free["/mnt/c"] = 30 * GB
    assert (
        pf.main(
            [
                "--disk-only",
                "--bytes",
                str(18 * GB),
                "--path",
                str(tmp_path / "models"),
            ],
            host,
        )
        == 1
    )
    out = capsys.readouterr().out
    assert "38.0 GB" in out and "/mnt/c has 30.0 GB free" in out
    assert (
        pf.main(["--disk-only", "--bytes", "1", "--path", "/mnt/c/models"], host) == 1
    )


def test_the_real_host_wrapper_keeps_the_shell_out_of_compose(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    host = pf.Host(
        {
            "PATH": "/usr/bin",
            "HOME": "/h",
            "COMPOSE_FILE": "x",
            "H4_TREE": "/",
            "DOCKER_HOST": "tcp://127.0.0.1:2376",
        }
    )
    assert host._env() == {
        "PATH": "/usr/bin",
        "HOME": "/h",
        "DOCKER_HOST": "tcp://127.0.0.1:2376",
        "LC_ALL": "C",
    }
    free = host.free_bytes(
        Path("/definitely/not/here")
    )  # falls back to the nearest existing ancestor
    assert free > 0


def test_models_lock_parsing(tmp_path: Path) -> None:
    path = tmp_path / "models.lock"
    path.write_text(
        f"# c\nm a r v f.gguf {'1' * 64} 10 MIT 21.5GiB prod,dev\n", encoding="utf-8"
    )
    (model,) = pf.read_models(path)
    assert (model.vram_mib, model.stacks, model.bytes) == (22016, ("prod", "dev"), 10)
    path.write_text("m a r\n", encoding="utf-8")
    with pytest.raises(ValueError):
        pf.read_models(path)


def test_env_parsing_matches_the_grammar() -> None:
    values, errors = pf.parse_env("A='p$ss #1'\nB=\n# c\n\nC=x\n")
    assert values == {"A": "p$ss #1", "B": "", "C": "x"} and errors == []
    assert os.path.basename(pf.__file__) == "preflight.py"
