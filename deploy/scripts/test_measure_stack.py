"""Tests for deploy/scripts/measure_stack.py and its load, deploy/scripts/measure_load.py (spec 001, tasks.md T012 and
T014; research.md R-33): dev-cpu's stack without its model server, under load, each service's peak memory from docker
stats samples, the volumes' and images' sizes, and the record. A stub docker and a stub load stand in for the agents'
engine and the probe; nothing here starts a container."""

from __future__ import annotations

import importlib.util
import io
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]


def load(name: str):
    spec = importlib.util.spec_from_file_location(
        name, REPO / "deploy" / "scripts" / f"{name}.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


ms = load("measure_stack")
ml = load("measure_load")

PROJECT = "h4reet-dev-cpu"
# dev-cpu's services as make up ENV=dev-cpu starts them (COMPOSE_PROFILES=cpu,dev-receivers).
STACK = (
    "edge",
    "gateway",
    "web",
    "gateway-state",
    "otel-collector",
    "prometheus",
    "loki",
    "grafana",
    "langfuse-web",
    "langfuse-worker",
    "langfuse-db",
    "clickhouse",
    "valkey",
    "seaweedfs",
    "telegram-standin",
    "mailpit",
)
MIB = 1024 * 1024


# --- docker's own output, as the fixtures -------------------------------------------------------------------------


def ps_line(service: str, state: str = "running", image: str | None = None) -> str:
    """One line of `docker compose ps --format json`."""
    return json.dumps(
        {
            "Name": f"{PROJECT}-{service}-1",
            "Service": service,
            "State": state,
            "Image": image or f"ghcr.io/example/{service}:1.0@sha256:{'ab' * 32}",
            "Project": PROJECT,
            "Status": "Up 3 minutes",
        }
    )


def ps(*extra: str, model: str | None = None, probe: bool = False) -> str:
    lines = [ps_line(service) for service in STACK]
    if model:
        lines.append(ps_line("model-server-cpu", state=model))
    if probe:
        lines.append(ps_line("breach-probe"))
    lines.extend(extra)
    return "\n".join(lines) + "\n"


def stats_line(service: str, mem: str, limit: str = "512MiB") -> str:
    """One line of `docker stats --no-stream --format '{{json .}}'`."""
    return json.dumps(
        {
            "BlockIO": "0B / 0B",
            "CPUPerc": "0.50%",
            "Container": "c0ffee",
            "ID": "c0ffee",
            "MemPerc": "1.00%",
            "MemUsage": f"{mem} / {limit}",
            "Name": f"{PROJECT}-{service}-1",
            "NetIO": "1kB / 1kB",
            "PIDs": "7",
        }
    )


def stats(values: dict[str, str]) -> str:
    """Every stack service at 10MiB, but those values names; the probe's own container at 100MiB, never counted."""
    lines = [stats_line(service, values.get(service, "10MiB")) for service in STACK]
    lines.append(stats_line("breach-probe", "100MiB", "128MiB"))
    return "\n".join(lines) + "\n"


def df(**volumes: str) -> str:
    """`docker system df -v --format '{{json .}}'`, with this stack's volumes, another project's, and its images."""
    return json.dumps(
        {
            "Images": [
                {
                    "Repository": "ghcr.io/example/clickhouse",
                    "Tag": "1.0",
                    "Size": "1.2GB",
                },
                {
                    "Repository": "ghcr.io/example/gateway",
                    "Tag": "1.0",
                    "Size": "493MB",
                },
                {"Repository": "ghcr.io/example/unused", "Tag": "9", "Size": "9GB"},
            ],
            "Containers": [],
            "Volumes": [
                *(
                    {"Name": f"{PROJECT}_{name}", "Size": size, "Links": "1"}
                    for name, size in volumes.items()
                ),
                {"Name": "h4reet-dev_clickhouse-data", "Size": "50GB", "Links": "0"},
            ],
            "BuildCache": [],
        }
    )


SUMMARY = {
    "h4_measure_load": 1,
    "minutes": 30,
    "hello_per_minute": 40,
    "turns_per_minute": 20,
    "sent": {"hello": 1200, "turn": 600},
    "late": 0,
    "seconds": 1800,
    "outcomes": {
        "hello": {"200 fallback": 20, "503 fallback_awaiting_renewal": 1180},
        "turn": {"409 not_ready": 600},
    },
}


class FakeDocker:
    """The runner: docker's answers by subcommand, in order, the last one repeating."""

    def __init__(
        self,
        ps_frames: list[str],
        stats_frames: list[str],
        df_frames: list[str] | None = None,
        fail: str | None = None,
    ) -> None:
        self.ps_frames, self.stats_frames = list(ps_frames), list(stats_frames)
        self.df_frames = list(
            df_frames
            or [df(**{"clickhouse-data": "100MB"}), df(**{"clickhouse-data": "300MB"})]
        )
        self.fail = fail
        self.calls: list[list[str]] = []
        self.envs: list[dict[str, str]] = []

    @staticmethod
    def _next(frames: list[str]) -> str:
        return frames.pop(0) if len(frames) > 1 else frames[0]

    def __call__(
        self, argv: list[str], stdin: str | None, env: dict[str, str], timeout: float
    ):
        self.calls.append(argv)
        self.envs.append(env)
        words = " ".join(argv)
        if self.fail and self.fail in words:
            return 1, "", "Error response from daemon: it failed\n"
        if " ps " in f" {words} ":
            return 0, self._next(self.ps_frames), ""
        if " stats " in f" {words} ":
            return 0, self._next(self.stats_frames), ""
        if " system df " in f" {words} ":
            return 0, self._next(self.df_frames), ""
        return 0, "", ""


class FakeLoad:
    def __init__(
        self, polls: int = 3, code: int = 0, stdout: str | None = None, stderr: str = ""
    ) -> None:
        self.polls, self.code = polls, code
        self.stdout = json.dumps(SUMMARY) + "\n" if stdout is None else stdout
        self.stderr = stderr
        self.n = 0
        self.terminated = False

    def poll(self) -> int | None:
        self.n += 1
        return self.code if self.n >= self.polls else None

    def terminate(self) -> None:
        self.terminated = True

    def result(self, timeout: float) -> tuple[int, str, str]:
        return self.code, self.stdout, self.stderr


class Clock:
    def __init__(self) -> None:
        self.t = 1_800_000_000.0
        self.slept: list[float] = []

    def now(self) -> float:
        return self.t

    def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.t += seconds


def main_tree_git(args: list[str]) -> tuple[int, str]:
    return 0, "/repo/.git\n"


def linked_worktree_git(args: list[str]) -> tuple[int, str]:
    return 0, ("/repo/.git/worktrees/x\n" if "--git-dir" in args else "/repo/.git\n")


SANDBOX = {
    "SANDBOX_RUNTIME": "1",
    "PATH": "/usr/bin",
    "HOME": "/home/x",
    "COMPOSE_PROFILES": "gpu",
}


def run(
    docker: FakeDocker,
    load_: FakeLoad | None = None,
    argv: list[str] | None = None,
    environ: dict[str, str] | None = None,
    git=main_tree_git,
):
    load_ = load_ or FakeLoad()
    started: list[list[str]] = []

    def start_load(command: list[str], env: dict[str, str]) -> FakeLoad:
        started.append(command)
        return load_

    clock = Clock()
    out = io.StringIO()
    code = ms.main(
        argv if argv is not None else ["--stack", "dev-cpu"],
        runner=docker,
        start_load=start_load,
        environ=SANDBOX if environ is None else environ,
        git=git,
        now=clock.now,
        sleep=clock.sleep,
        out=out,
    )
    return code, out.getvalue(), started, load_


def record_of(text: str) -> dict:
    lines = [
        line for line in text.splitlines() if line.startswith('{"h4_measure_stack"')
    ]
    assert len(lines) == 1, text
    return json.loads(lines[0])


def verbs(docker: FakeDocker) -> list[str]:
    """Each docker call by what it does, without the client's prefix and the compose file's arguments."""
    out = []
    for argv in docker.calls:
        words = argv[argv.index("docker") + 1 :]
        if words[0] == "compose":
            words = words[words.index("--env-file") + 2 :]
        out.append(" ".join(words[:3]))
    return out


# --- sizes and samples --------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "value"),
    [
        ("0B", 0),
        ("512B", 512),
        ("12.5MiB", int(12.5 * MIB)),
        ("4GiB", 4 * 1024 * MIB),
        ("1.5KiB", 1536),
        ("1.2GB", 1_200_000_000),
        ("19.88MB", 19_880_000),
        ("1.5kB", 1500),
        ("2TB", 2_000_000_000_000),
    ],
)
def test_sizes_as_docker_prints_them(text: str, value: int) -> None:
    assert ms.parse_size(text) == value


@pytest.mark.parametrize("text", ["", "--", "12", "MiB", "1.2 XB", "-1MiB", "1e3MB"])
def test_a_size_docker_never_prints_is_refused(text: str) -> None:
    with pytest.raises(ValueError):
        ms.parse_size(text)


def test_docker_stats_samples_give_each_containers_memory_and_limit() -> None:
    text = (
        stats({"clickhouse": "812.5MiB"})
        + json.dumps({"Name": "gone", "MemUsage": "-- / --"})
        + "\n"
    )
    sample = ms.parse_stats(text)
    assert sample[f"{PROJECT}-clickhouse-1"] == (int(812.5 * MIB), 512 * MIB)
    # A container that stopped between ps and stats has no figure, and is left out rather than counted as zero.
    assert "gone" not in sample


def test_compose_ps_in_either_form() -> None:
    lines = ps()
    rows = ms.parse_ps(lines)
    assert [row["Service"] for row in rows] == list(STACK)
    # Older compose printed one array.
    assert ms.parse_ps("[" + ",".join(lines.split()) + "]") == rows
    assert ms.parse_ps("") == []


def test_the_peak_resident_memory_per_service_over_a_run() -> None:
    peaks = ms.Peaks()
    names = {f"{PROJECT}-{s}-1": s for s in STACK}
    for frame in (
        {"clickhouse": "500MiB", "gateway": "100MiB"},
        {"clickhouse": "900MiB", "gateway": "120MiB"},
        {"clickhouse": "700MiB", "gateway": "300MiB"},
    ):
        peaks.add(ms.sample_of(ms.parse_stats(stats(frame)), names))
    assert peaks.count == 3
    assert peaks.peak["clickhouse"] == 900 * MIB
    assert peaks.peak["gateway"] == 300 * MIB
    assert peaks.limit["clickhouse"] == 512 * MIB
    assert peaks.samples["clickhouse"] == 3
    # The peaks needn't coincide: the largest total any one sample saw, and the sum of each service's peak, its bound.
    others = (len(STACK) - 2) * 10 * MIB
    assert peaks.largest_sample == 900 * MIB + 120 * MIB + others
    assert peaks.sum_of_peaks == 900 * MIB + 300 * MIB + others
    # The probe that sends the load is never one of the stack's services.
    assert "breach-probe" not in peaks.peak


# --- the refusals -------------------------------------------------------------------------------------------------


def test_a_running_model_server_is_refused() -> None:
    rows = ms.parse_ps(ps(model="running"))
    with pytest.raises(ms.ModelServerRunning, match="model-server-cpu"):
        ms.check_no_model_server(rows)
    rows = ms.parse_ps(ps(ps_line("model-server-gpu")))
    with pytest.raises(ms.ModelServerRunning, match="model-server-gpu"):
        ms.check_no_model_server(rows)
    # Stopped, or exited, it's not measured, so the run goes on.
    ms.check_no_model_server(ms.parse_ps(ps(model="exited")))
    ms.check_no_model_server(ms.parse_ps(ps()))


def test_a_model_server_still_running_after_the_stop_ends_the_run_with_no_record() -> (
    None
):
    docker = FakeDocker([ps(model="running"), ps(model="running")], [stats({})])
    code, text, started, _ = run(docker)
    assert code == 3, text
    assert "h4_measure_stack" not in text
    assert started == []
    assert "model-server-cpu is running" in text


def test_a_model_server_that_comes_back_mid_run_ends_it_with_no_record() -> None:
    frames = [
        ps(model="running"),
        ps(model="exited"),
        ps(model="exited"),
        ps(model="running"),
    ]
    docker = FakeDocker(frames, [stats({})])
    code, text, _, load_ = run(docker, FakeLoad(polls=10))
    assert code == 3, text
    assert "h4_measure_stack" not in text
    assert load_.terminated
    # It was running when the run began, so the run starts it again as it found it.
    assert verbs(docker)[-1] == "start model-server-cpu"


@pytest.mark.parametrize(
    ("argv", "environ", "says"),
    [
        (["--stack", "prod"], SANDBOX, "paid fallback"),
        (["--stack", "dev"], SANDBOX, "dev-cpu only"),
        (
            ["--stack", "dev-cpu", "--env-file", "deploy/env.example/dev.env.example"],
            SANDBOX,
            "dev-cpu.vars",
        ),
        (["--stack", "dev-cpu", "--minutes", "0"], SANDBOX, "--minutes"),
        (["--stack", "dev-cpu", "--minutes", "241"], SANDBOX, "--minutes"),
        (["--stack", "dev-cpu"], {"PATH": "/usr/bin"}, "agents' engine"),
        (
            ["--stack", "dev-cpu"],
            {"PATH": "/usr/bin", "DOCKER_HOST": "unix:///var/run/docker.sock"},
            "agents' engine",
        ),
    ],
)
def test_refused_before_anything_changes(
    argv: list[str], environ: dict[str, str], says: str
) -> None:
    docker = FakeDocker([ps(model="running")], [stats({})])
    code, text, started, _ = run(docker, argv=argv, environ=environ)
    assert code == 2, text
    assert says in text
    assert "refused before anything changed" in text
    assert started == [] and docker.calls == []


def test_a_linked_worktree_is_refused() -> None:
    # The engine binds the main working tree's files (spec 000 contracts/env-files.md §7.3).
    docker = FakeDocker([ps(model="running")], [stats({})])
    code, text, _, _ = run(docker, git=linked_worktree_git)
    assert code == 2 and "main working tree" in text
    assert docker.calls == []


def test_a_stack_that_isnt_up_is_refused() -> None:
    down = "\n".join(ps_line(s) for s in STACK if s not in ("gateway", "edge")) + "\n"
    docker = FakeDocker([down], [stats({})])
    code, text, started, _ = run(docker)
    assert code == 2, text
    assert "make up ENV=dev-cpu" in text
    assert verbs(docker) == ["ps --format json"]
    assert started == []


def test_the_engine_from_the_authors_terminal() -> None:
    docker = FakeDocker([ps(model="running"), ps(model="exited")], [stats({})])
    environ = {
        "PATH": "/usr/bin",
        "DOCKER_HOST": "tcp://198.18.0.1:2376",
        "DOCKER_TLS_VERIFY": "1",
    }
    code, text, _, _ = run(docker, environ=environ)
    assert code == 0, text
    assert all(argv[0] == "docker" for argv in docker.calls)


# --- the run ------------------------------------------------------------------------------------------------------


def test_the_run_stops_the_model_server_loads_samples_and_puts_the_stack_back() -> None:
    frames = [ps(model="running"), ps(model="exited"), ps(model="exited", probe=True)]
    samples = [
        stats({"clickhouse": "500MiB"}),
        stats({"clickhouse": "900MiB"}),
        stats({"clickhouse": "700MiB"}),
    ]
    docker = FakeDocker(frames, samples)
    code, text, started, load_ = run(docker)
    assert code == 0, text
    assert verbs(docker) == [
        "ps --format json",
        "stop model-server-cpu",
        "ps --format json",
        "system df -v",
        "ps --format json",
        "stats --no-stream --format",
        "ps --format json",
        "stats --no-stream --format",
        "ps --format json",
        "stats --no-stream --format",
        "system df -v",
        "start model-server-cpu",
    ]
    # Inside the sandbox, every docker call goes through the relay, with only what docker and the relay need: no
    # COMPOSE_PROFILES of the shell's can pick the stack's services.
    assert all(argv[:2] == [str(ms.RELAY), "docker"] for argv in docker.calls)
    assert all("COMPOSE_PROFILES" not in env for env in docker.envs)
    compose = docker.calls[1]
    assert compose[2:9] == [
        "compose",
        "-p",
        PROJECT,
        "-f",
        str(ms.COMPOSE_FILE),
        "--env-file",
        str(ms.DEVCPU_VARS),
    ]
    # The load, from a one-off breach-probe container on the stack's internal network, at the rates budgets.yaml gives.
    assert len(started) == 1
    assert started[0][2:9] == compose[2:9]
    assert started[0][9:] == [
        "--profile",
        "breach",
        "run",
        "--build",
        "--rm",
        "-T",
        "breach-probe",
        "python3",
        "-I",
        "/app/measure_load.py",
        "--minutes",
        "30",
        "--hello-per-minute",
        "40",
        "--turns-per-minute",
        "20",
    ]
    assert not load_.terminated
    record = record_of(text)
    assert record["samples"] == 3
    clickhouse = next(
        row for row in record["services"] if row["service"] == "clickhouse"
    )
    assert clickhouse == {
        "service": "clickhouse",
        "peak_bytes": 900 * MIB,
        "limit_bytes": 512 * MIB,
        "samples": 3,
    }


def test_a_model_server_already_stopped_stays_stopped() -> None:
    docker = FakeDocker([ps(model="exited")], [stats({})])
    code, text, _, _ = run(docker)
    assert code == 0, text
    assert "stop model-server-cpu" not in verbs(docker)
    assert "start model-server-cpu" not in verbs(docker)
    assert record_of(text)["model_server"] == {
        "service": "model-server-cpu",
        "running_before": False,
    }


def test_minutes_from_the_command_line() -> None:
    docker = FakeDocker([ps(model="exited")], [stats({})])
    code, text, started, _ = run(docker, argv=["--stack", "dev-cpu", "--minutes", "45"])
    assert code == 0, text
    assert started[0][started[0].index("--minutes") + 1] == "45"
    assert record_of(text)["minutes"] == 45


@pytest.mark.parametrize(
    ("load_", "says"),
    [
        (
            FakeLoad(code=1, stdout="", stderr="no such service\n"),
            "the load exited 1: no such service",
        ),
        (FakeLoad(stdout="not json\n"), "printed no summary"),
    ],
)
def test_a_load_that_fails_ends_the_run_with_no_record_and_puts_the_stack_back(
    load_: FakeLoad, says: str
) -> None:
    docker = FakeDocker([ps(model="running"), ps(model="exited")], [stats({})])
    code, text, _, _ = run(docker, load_)
    assert code == 1, text
    assert says in text
    assert "h4_measure_stack" not in text
    assert verbs(docker)[-1] == "start model-server-cpu"


def test_a_load_that_runs_past_its_time_is_stopped() -> None:
    docker = FakeDocker([ps(model="exited")], [stats({})])
    code, text, _, load_ = run(
        docker, FakeLoad(polls=10**9), argv=["--stack", "dev-cpu", "--minutes", "1"]
    )
    assert code == 1 and "ran past" in text
    assert load_.terminated


def test_a_docker_call_that_fails_ends_the_run() -> None:
    docker = FakeDocker(
        [ps(model="running"), ps(model="exited")], [stats({})], fail="stats"
    )
    code, text, _, load_ = run(docker)
    assert code == 1 and "docker stats failed" in text
    assert load_.terminated
    assert verbs(docker)[-1] == "start model-server-cpu"


# --- the record ---------------------------------------------------------------------------------------------------


def test_the_records_shape() -> None:
    docker = FakeDocker(
        [ps(model="running"), ps(model="exited")],
        [stats({"clickhouse": "900MiB", "gateway": "300MiB"})],
        [
            df(**{"clickhouse-data": "100MB", "loki-data": "1MB"}),
            df(**{"clickhouse-data": "300MB", "loki-data": "2MB"}),
        ],
    )
    code, text, _, _ = run(docker)
    assert code == 0, text
    record = record_of(text)
    assert set(record) == {
        "h4_measure_stack",
        "stack",
        "started_utc",
        "ended_utc",
        "minutes",
        "interval_s",
        "samples",
        "model_server",
        "load",
        "services",
        "sum_of_peaks_bytes",
        "largest_sample_bytes",
        "volumes",
        "images",
        "images_bytes",
    }
    assert record["h4_measure_stack"] == 1 and record["stack"] == "dev-cpu"
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", record["started_utc"])
    assert record["model_server"] == {
        "service": "model-server-cpu",
        "running_before": True,
    }
    assert record["load"] == SUMMARY
    assert [row["service"] for row in record["services"]] == sorted(STACK)
    assert all(isinstance(row["peak_bytes"], int) for row in record["services"])
    # This stack's volumes only, before and after, never another project's.
    assert record["volumes"] == [
        {
            "volume": f"{PROJECT}_clickhouse-data",
            "before_bytes": 100_000_000,
            "after_bytes": 300_000_000,
        },
        {
            "volume": f"{PROJECT}_loki-data",
            "before_bytes": 1_000_000,
            "after_bytes": 2_000_000,
        },
    ]
    # The images the stack's containers run, found in docker's list by repository and tag.
    assert {
        "image": "ghcr.io/example/clickhouse:1.0",
        "bytes": 1_200_000_000,
    } in record["images"]
    assert record["images_bytes"] == sum(row["bytes"] for row in record["images"])
    assert all("unused" not in row["image"] for row in record["images"])
    # A measurement, not a price (tasks.md T016's check).
    assert not re.search(r"usd|price|cost|\$", json.dumps(record), re.IGNORECASE)


def test_the_table_for_the_note_and_r33() -> None:
    docker = FakeDocker(
        [ps(model="running"), ps(model="exited")], [stats({"clickhouse": "900MiB"})]
    )
    code, text, _, _ = run(docker)
    assert code == 0, text
    lines = text.splitlines()
    assert "| Service | Peak (MiB) | Limit (MiB) | Samples |" in lines
    assert "| clickhouse | 900.0 | 512.0 | 1 |" in lines
    assert any(
        line.startswith("| All services, the sum of each one's peak |")
        for line in lines
    )
    assert any(
        line.startswith("| All services, the largest total in one sample |")
        for line in lines
    )
    assert any(line.startswith(f"| {PROJECT}_clickhouse-data |") for line in lines)
    assert "hello: 200 fallback 20, 503 fallback_awaiting_renewal 1180" in lines


def test_the_rates_are_budgets_yamls() -> None:
    text = (REPO / "config" / "budgets.yaml").read_text(encoding="utf-8")
    # 60 metered calls a minute globally; turns, which come from one client, at its 20 a minute; hello the rest.
    assert ms.load_rates(text) == (40, 20)
    assert ms.load_rates(
        "limits:\n  per_client: { requests_per_minute: 10 }\n  global: { metered_per_minute: 12 }\n"
    ) == (6, 6)
    with pytest.raises(ms.Refusal):
        ms.load_rates("limits:\n  per_client: { requests_per_minute: 20 }\n")


# --- the load ------------------------------------------------------------------------------------------------------


def test_the_loads_schedule_mixes_hello_and_turns_at_their_rates() -> None:
    kinds = ml.kinds(hello=40, turns=20, minutes=1)
    assert len(kinds) == 60 and kinds.count("hello") == 40 and kinds.count("turn") == 20
    assert kinds[:6] == ["hello", "hello", "turn", "hello", "hello", "turn"]
    assert ml.kinds(hello=5, turns=0, minutes=2) == ["hello"] * 10


def test_the_loads_requests_are_fixed_text_to_edge() -> None:
    # The path a visitor's request takes, edge first: its api listener for hello, its site listener for the turn.
    assert ml.HELLO_URL == "http://edge:8080/hello"
    assert ml.TURN_URL == "http://edge:8087/api/room/turn"
    assert json.loads(ml.HELLO_BODY) == {}
    assert json.loads(ml.TURN_BODY) == {
        "feature": "free_talk",
        "path": "engineer",
        "turns": [{"role": "visitor", "text": "Hello."}],
    }
    assert ml.LABELS == tuple(f"measure-{n}" for n in range(1, 9))


@pytest.mark.parametrize(
    ("status", "body", "key"),
    [
        (
            200,
            b'{"text": "a secret answer", "route": "fallback", "cost_micro_usd": 100000}',
            "200 fallback",
        ),
        (
            503,
            b'{"state": "degraded", "cause": "fallback_awaiting_renewal", "detail": "words"}',
            "503 fallback_awaiting_renewal",
        ),
        (429, b'{"error": "client_cap_exceeded"}', "429 client_cap_exceeded"),
        (503, b'{"cause": "Not A Code, with words"}', "503 other"),
        (502, b"<html>bad gateway</html>", "502"),
        (None, b"", "no answer"),
    ],
)
def test_an_answer_counts_by_its_status_and_code_never_its_text(
    status: int | None, body: bytes, key: str
) -> None:
    assert ml.outcome(status, body) == key


def test_the_load_paces_counts_and_never_prints_an_answer() -> None:
    clock = Clock()
    sent: list[tuple[str, str | None]] = []

    def send(kind: str, label: str | None) -> tuple[int | None, bytes]:
        sent.append((kind, label))
        if len(sent) == 4:
            clock.t += 10  # a slow answer: the next request goes out late
        if kind == "hello":
            return 200, b'{"text": "SECRET-ANSWER-TEXT", "route": "fallback"}'
        return 409, b'{"error": "not_ready", "detail": "SECRET-DETAIL"}'

    summary = ml.run(
        minutes=1, hello=40, turns=20, send=send, now=clock.now, sleep=clock.sleep
    )
    assert summary["sent"] == {"hello": 40, "turn": 20}
    assert summary["outcomes"] == {
        "hello": {"200 fallback": 40},
        "turn": {"409 not_ready": 20},
    }
    assert summary["late"] >= 1
    # Hello rotates the labels; the turn sends none, since edge drops it there.
    assert [label for kind, label in sent if kind == "hello"][:9] == [
        *ml.LABELS,
        "measure-1",
    ]
    assert {label for kind, label in sent if kind == "turn"} == {None}
    # One request a second at 60 a minute.
    assert max(clock.slept) <= 1.0 + 1e-9
    assert "SECRET" not in json.dumps(summary)


def test_the_loads_one_line() -> None:
    out = io.StringIO()
    code = ml.main(
        ["--minutes", "1", "--hello-per-minute", "2", "--turns-per-minute", "1"],
        send=lambda kind, label: (200, b'{"route": "fallback"}'),
        now=Clock().now,
        sleep=lambda s: None,
        out=out,
    )
    assert code == 0
    lines = out.getvalue().splitlines()
    assert len(lines) == 1
    doc = json.loads(lines[0])
    assert doc["h4_measure_load"] == 1 and doc["sent"] == {"hello": 2, "turn": 1}
    assert set(doc) == set(SUMMARY)


@pytest.mark.parametrize(
    "argv",
    [
        ["--minutes", "0", "--hello-per-minute", "1", "--turns-per-minute", "1"],
        ["--minutes", "1", "--hello-per-minute", "0", "--turns-per-minute", "0"],
        ["--minutes", "1", "--hello-per-minute", "-1", "--turns-per-minute", "1"],
        ["--minutes", "1"],
    ],
)
def test_the_loads_usage(argv: list[str]) -> None:
    out = io.StringIO()
    assert ml.main(argv, send=lambda k, label: (200, b"{}"), out=out) == 2


def test_the_probes_image_holds_the_load() -> None:
    text = (REPO / "evals" / "Dockerfile.probe").read_text(encoding="utf-8")
    assert re.search(
        r"^COPY deploy/scripts/measure_load\.py /app/measure_load\.py$",
        text,
        re.MULTILINE,
    )


# --- make measure-stack and make arch-inventory -------------------------------------------------------------------

needs_make = pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")


def make(*args: str, **env: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["make", "--no-print-directory", "-C", str(REPO), *args],
        env={
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "HOME": "/nonexistent",
            "LC_ALL": "C",
            **env,
        },
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )


@needs_make
@pytest.mark.parametrize("stack", ["prod", "dev"])
def test_make_measure_stack_takes_dev_cpu_alone(stack: str) -> None:
    done = make("measure-stack", f"ENV={stack}")
    assert done.returncode == 2, done.stderr
    assert "dev-cpu only" in done.stderr


@needs_make
def test_make_measure_stack_runs_the_script_with_minutes_as_typed() -> None:
    done = make(
        "-n",
        "measure-stack",
        "ENV=dev-cpu",
        "MINUTES=45",
        DOCKER_HOST="tcp://198.18.0.1:2376",
    )
    assert done.returncode == 0, done.stderr
    assert (
        "python3 -I -B -X pycache_prefix=/dev/null deploy/scripts/measure_stack.py --stack dev-cpu "
        '--env-file deploy/env.agents/dev-cpu.vars --minutes="$MINUTES"'
    ) in done.stdout


@needs_make
def test_make_measure_stack_relays_itself_in_the_sandbox() -> None:
    done = make("-n", "measure-stack", "ENV=dev-cpu", SANDBOX_RUNTIME="1")
    assert done.returncode == 0, done.stderr
    assert (
        "deploy/agents-engine/docker-relay make --no-print-directory measure-stack ENV=dev-cpu"
        in done.stdout
    )


@needs_make
def test_make_arch_inventory_runs_the_script_or_relays_itself() -> None:
    done = make("-n", "arch-inventory", DOCKER_HOST="unix:///var/run/docker.sock")
    assert done.returncode == 0, done.stderr
    assert (
        "python3 -I -B -X pycache_prefix=/dev/null deploy/scripts/arch_inventory.py"
        in done.stdout
    )
    done = make("-n", "arch-inventory", SANDBOX_RUNTIME="1")
    assert (
        "deploy/agents-engine/docker-relay make --no-print-directory arch-inventory"
        in done.stdout
    )
