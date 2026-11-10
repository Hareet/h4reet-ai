#!/usr/bin/env python3
"""make measure-stack ENV=dev-cpu (spec 001, tasks.md T014 and T016; research.md R-33; FR-021).

    python3 -I -B -X pycache_prefix=/dev/null deploy/scripts/measure_stack.py --stack dev-cpu [--env-file F]
        [--minutes N]

It measures the production topology without the model server, as EC2 would run it, on dev-cpu: each service's peak
resident memory under load, the volumes' sizes before and after, and the sizes of the images the stack runs. The Author
prices instance types and disks from the record and sets the server budget's figure (spec question 14, "Measure, then
you set it"); this file writes no price.

How it runs, with dev-cpu already up (make up ENV=dev-cpu):
  1. it stops dev-cpu's model server, model-server-cpu, if it runs, and refuses to measure while any model server does;
  2. it starts the load, deploy/scripts/measure_load.py, in a one-off breach-probe container on the stack's internal
     network (`docker compose --profile breach run --build --rm -T --name h4reet-dev-cpu-measure-load breach-probe`):
     hello and the ready pieces' openings through edge, at config/budgets.yaml's global metered limit, the most the
     gateway admits however the public cap is set (P-6's figures are blank until group 8). The turns come from one
     client, so they go no faster than its per-minute cap or its daily cap over the run allows; hello takes the rest,
     over enough labels that none reaches either cap. With the model server stopped, the gateway answers from dev's
     route without it: the synthetic adapter, the stub of a paid one, while dev's meters allow, then degraded. So the
     run spends dev-cpu's $2 fallback grant for the day, in synthetic dollars, and the stub answers about 20 calls;
  3. every INTERVAL_S seconds until the load ends, `docker compose ps` and `docker stats --no-stream`: each stack
     service's resident memory (docker's MemUsage, the cgroup's usage less its inactive file cache) and its limit. The
     probe that sends the load is never one of them;
  4. then `docker system df -v` again. Whether the run passed, failed, or was stopped by Ctrl-C, SIGTERM, or SIGHUP (a
     closed terminal), it then puts the stack back: it stops the load's client, removes the load's container by its
     name if it's still there, and starts the model server again if it stopped it. A further signal while it does is
     ignored, as evals/breach.py's cleanup ignores one (T018's review, finding 3). Only a SIGKILL can cut it short; then
     `make up ENV=dev-cpu` starts the model server again, and `docker rm --force h4reet-dev-cpu-measure-load` ends the
     load.

It prints a table for the note and research.md R-33, then the record as one JSON line, marked "h4_measure_stack": 1.
The table and the record put the share of requests the stub answered beside the peaks: a run that's mostly degraded
measures a stack that's mostly not calling a model (research.md R-33).

dev-cpu only, on the agents' engine (FR-039): inside the sandbox every docker call goes through
deploy/agents-engine/docker-relay; from the Author's terminal, only with DOCKER_HOST=tcp://198.18.0.1:2376. It runs
from the main working tree, since the engine binds that tree's files (spec 000 contracts/env-files.md §7.3). prod is
refused: with its model server stopped, its route sends hello to the paid fallback. dev's repeat on the laptop isn't
built (plan.md §16, group 2's departures).

Standard library only, by path through PY_HOST, never with -m (research.md R-35). The docker client gets only the
variables docker and the relay need, so no COMPOSE_* or H4_* of the shell's can change the stack's services. Nothing it
prints carries a payload, a client identifier, or a secret: names, figures, codes, and times.

Exit codes: 0 the record printed; 1 the run stopped (a docker call failed, the load failed or ran past its time, or a
signal stopped it), with no record; 2 refused before anything changed; 3 a model server ran during the measurement,
so no record.
"""

from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import json
import math
import os
import re
import signal
import subprocess
import sys
import tempfile
import time
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, NoReturn, Protocol, TextIO

ROOT = Path(__file__).resolve().parents[2]
COMPOSE_FILE = ROOT / "deploy" / "compose.yaml"
DEVCPU_VARS = ROOT / "deploy" / "env.agents" / "dev-cpu.vars"
RELAY = ROOT / "deploy" / "agents-engine" / "docker-relay"
BUDGETS = ROOT / "config" / "budgets.yaml"
RELAY_HOST = "tcp://127.0.0.1:2376"  # the relay's end inside the sandbox
ENGINE_HOST = "tcp://198.18.0.1:2376"  # the agents' engine, from the Author's terminal (contracts/agents-engine.md §2)
STACK = "dev-cpu"
PROJECT = "h4reet-dev-cpu"
MODEL_SERVER = "model-server-cpu"  # dev-cpu's, by COMPOSE_PROFILES' cpu
LOAD_SERVICE = "breach-probe"
LOAD_CONTAINER = f"{PROJECT}-measure-load"  # the load's one-off container, by a name a stopped run can remove it by
UP_SERVICES = (
    "edge",
    "gateway",
)  # the load's path: without them there is nothing to measure
DEFAULT_MINUTES = 30  # three of Loki's compactions (its default 10-minute interval), and ClickHouse's merges
MAX_MINUTES = 240
MIN_LABELS = 8
MAX_LABELS = 64  # measure_load.py's own bound
INTERVAL_S = 10
GRACE_S = 600  # the probe image's build, and the load's last requests
DOCKER_TIMEOUT_S = 120.0
HOP_ENV = (
    "PATH",
    "HOME",
    "TMPDIR",
    "SANDBOX_RUNTIME",
    "HTTPS_PROXY",
    "https_proxy",
    "DOCKER_HOST",
    "DOCKER_TLS_VERIFY",
    "DOCKER_CERT_PATH",
    "DOCKER_CONFIG",
    "DOCKER_CONTEXT",
    "BUILDX_CONFIG",
    "XDG_RUNTIME_DIR",
)
UNITS = {
    "B": 1,
    "kB": 1000,
    "KB": 1000,
    "MB": 1000**2,
    "GB": 1000**3,
    "TB": 1000**4,
    "KiB": 1024,
    "MiB": 1024**2,
    "GiB": 1024**3,
    "TiB": 1024**4,
}
SIZE = re.compile(r"^([0-9]+(?:\.[0-9]+)?)\s*([A-Za-z]+)$")
MIB = 1024**2

Runner = Callable[
    [list[str], "str | None", dict[str, str], float], "tuple[int, str, str]"
]
Git = Callable[[list[str]], "tuple[int, str]"]


class Load(Protocol):
    def poll(self) -> int | None: ...

    def terminate(self) -> None: ...

    def result(self, timeout: float) -> tuple[int, str, str]: ...


StartLoad = Callable[[list[str], dict[str, str]], Load]


class Refusal(Exception):
    """Exit 2: refused before anything changed."""


class Stop(Exception):
    """Exit 1: the run stopped, with no record."""


class ModelServerRunning(Exception):
    """Exit 3: a model server ran, so the record would count it."""


# --- the signals, as evals/breach.py takes them -------------------------------------------------------------------


class Interrupted(BaseException):
    """SIGTERM or SIGHUP, which a closed terminal sends: the run stops, and puts the stack back, as on Ctrl-C. A
    BaseException, like KeyboardInterrupt, so nothing on the way out takes it for an error and goes on."""


def on_signal(signum: int, frame: object) -> NoReturn:
    raise Interrupted(signal.Signals(signum).name)


def restore_handlers(previous: Mapping[int, Any]) -> None:
    # A handler that wasn't set from Python comes back as None, which signal.signal won't take: the default, then.
    for signum, handler in previous.items():
        signal.signal(signum, signal.SIG_DFL if handler is None else handler)


@contextlib.contextmanager
def interruptible() -> Iterator[None]:
    """SIGTERM and SIGHUP stop the run the way Ctrl-C does, so it puts the stack back. The previous handlers come back
    when the run ends."""
    previous = {s: signal.signal(s, on_signal) for s in (signal.SIGTERM, signal.SIGHUP)}
    try:
        yield
    finally:
        restore_handlers(previous)


@contextlib.contextmanager
def ignoring_signals() -> Iterator[None]:
    """While the run puts the stack back, Ctrl-C, SIGTERM, and SIGHUP are ignored by this process, so a second one
    can't leave the model server stopped. The docker commands it starts run in their own sessions (real_run), where the
    terminal's signals never reach them. The run's handlers come back after."""
    previous = {
        s: signal.signal(s, signal.SIG_IGN)
        for s in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP)
    }
    try:
        yield
    finally:
        restore_handlers(previous)


# --- docker's output ----------------------------------------------------------------------------------------------


def parse_size(text: str) -> int:
    """A size as docker prints it: binary units in docker stats (MiB), decimal in docker system df (MB)."""
    match = SIZE.match(text.strip())
    if not match or match.group(2) not in UNITS:
        raise ValueError(f"not a size docker prints: {text!r}")
    return round(float(match.group(1)) * UNITS[match.group(2)])


def _json_lines(text: str) -> list[Any]:
    text = text.strip()
    if not text:
        return []
    if text.startswith("["):
        doc = json.loads(text)
        return doc if isinstance(doc, list) else []
    return [json.loads(line) for line in text.splitlines() if line.strip()]


def parse_ps(text: str) -> list[dict[str, str]]:
    """docker compose ps --format json: one object a line, or (older compose) one array."""
    rows = []
    for doc in _json_lines(text):
        if isinstance(doc, Mapping) and isinstance(doc.get("Service"), str):
            rows.append(
                {
                    key: str(doc.get(key, ""))
                    for key in ("Name", "Service", "State", "Image")
                }
            )
    return rows


def parse_stats(text: str) -> dict[str, tuple[int, int]]:
    """docker stats --no-stream --format '{{json .}}': each container's resident memory and limit, in bytes. A
    container that stopped between ps and stats prints no figure (-- / --), and is left out rather than counted 0."""
    out: dict[str, tuple[int, int]] = {}
    for doc in _json_lines(text):
        if not isinstance(doc, Mapping):
            continue
        usage, _, limit = str(doc.get("MemUsage", "")).partition("/")
        try:
            out[str(doc.get("Name", ""))] = (parse_size(usage), parse_size(limit))
        except ValueError:
            continue
    return out


def running(rows: Sequence[Mapping[str, str]]) -> list[Mapping[str, str]]:
    return [row for row in rows if row.get("State") == "running"]


def check_no_model_server(rows: Sequence[Mapping[str, str]]) -> None:
    for row in running(rows):
        if row["Service"].startswith("model-server"):
            raise ModelServerRunning(
                f"{row['Service']} is running, and the measurement is of the stack without a model server "
                "(research.md R-33): no record"
            )


def sample_of(
    stats: Mapping[str, tuple[int, int]], names: Mapping[str, str]
) -> dict[str, tuple[int, int]]:
    """A docker stats sample by service, for the containers names maps (container name to service)."""
    sample: dict[str, tuple[int, int]] = {}
    for name, figures in stats.items():
        service = names.get(name)
        if service is None:
            continue
        usage, limit = sample.get(service, (0, 0))
        sample[service] = (
            usage + figures[0],
            limit + figures[1],
        )  # a service's replicas, together
    return sample


def normalize_image(ref: str) -> str:
    """An image as docker system df lists it: no digest, and Docker Hub's host and library/ dropped."""
    ref = ref.split("@", 1)[0]
    for hub in ("docker.io/", "index.docker.io/"):
        if ref.startswith(hub):
            ref = ref.removeprefix(hub)
            if ref.startswith("library/") and ref.count("/") == 1:
                ref = ref.removeprefix("library/")
    return ref


def volumes_of(df: Mapping[str, Any]) -> tuple[dict[str, int], list[str]]:
    """This stack's volumes and their sizes, and the names of those whose size docker printed in no form it knows."""
    sizes, unread = {}, []
    for volume in df.get("Volumes") or []:
        name = str(volume.get("Name", ""))
        if name.startswith(f"{PROJECT}_"):
            try:
                sizes[name] = parse_size(str(volume.get("Size", "")))
            except ValueError:
                unread.append(name)
    return sizes, sorted(unread)


def images_of(
    df: Mapping[str, Any], wanted: set[str]
) -> tuple[dict[str, int], list[str]]:
    """The images the stack runs and their sizes, and the names docker's list didn't have, or sized in no form it
    knows: named rather than dropped (T018's review)."""
    sizes = {}
    for image in df.get("Images") or []:
        name = f"{image.get('Repository', '')}:{image.get('Tag', '')}"
        if name in wanted:
            with contextlib.suppress(ValueError):
                sizes[name] = parse_size(str(image.get("Size", "")))
    return sizes, sorted(wanted - set(sizes))


def load_rates(text: str, minutes: int) -> tuple[int, int, int]:
    """(hello, turns, labels) a minute from config/budgets.yaml's limits. The global metered limit in all. The turns
    come from one client, so no faster than its per-minute cap, half the whole, or what its daily cap allows over the
    run; hello takes the rest, over enough labels that none reaches the per-minute or the daily cap (T018's review,
    finding 1). Read by pattern, since this file runs without PyYAML."""

    def figure(section: str, key: str) -> int:
        match = re.search(
            rf"^\s*{section}:\s*\{{[^}}]*\b{key}:\s*([0-9]+)", text, re.MULTILINE
        )
        if not match:
            raise Refusal(f"config/budgets.yaml names no limits.{section}.{key}")
        return int(match.group(1))

    total = figure("global", "metered_per_minute")
    per_minute = figure("per_client", "requests_per_minute")
    per_day = figure("per_client", "requests_per_day")
    turns = min(per_minute, total // 2, per_day // minutes)
    hello = total - turns
    labels = max(
        MIN_LABELS, math.ceil(hello / per_minute), math.ceil(hello * minutes / per_day)
    )
    if labels > MAX_LABELS:
        raise Refusal(
            f"hello at {hello} a minute for {minutes} minutes needs {labels} labels, more than {MAX_LABELS}"
        )
    return hello, turns, labels


# --- the samples --------------------------------------------------------------------------------------------------


@dataclass
class Peaks:
    peak: dict[str, int] = field(default_factory=dict)
    limit: dict[str, int] = field(default_factory=dict)
    samples: dict[str, int] = field(default_factory=dict)
    largest_sample: int = 0
    count: int = 0

    def add(self, sample: Mapping[str, tuple[int, int]]) -> None:
        self.count += 1
        self.largest_sample = max(
            self.largest_sample, sum(usage for usage, _ in sample.values())
        )
        for service, (usage, limit) in sample.items():
            self.peak[service] = max(self.peak.get(service, 0), usage)
            self.limit[service] = limit
            self.samples[service] = self.samples.get(service, 0) + 1

    @property
    def sum_of_peaks(self) -> int:
        return sum(self.peak.values())


def answered(summary: Mapping[str, Any]) -> dict[str, Any]:
    """How many of the load's requests the stub answered (a 200), of all it sent."""
    requests = sum(int(n) for n in summary.get("sent", {}).values())
    by_the_stub = sum(
        int(n)
        for counts in summary.get("outcomes", {}).values()
        for key, n in counts.items()
        if key.split(" ", 1)[0] == "200"
    )
    return {
        "requests": requests,
        "by_the_stub": by_the_stub,
        "share": round(by_the_stub / requests, 4) if requests else 0.0,
    }


# --- the run ------------------------------------------------------------------------------------------------------


def utc(seconds: float) -> str:
    return dt.datetime.fromtimestamp(seconds, dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


@dataclass
class Context:
    runner: Runner
    start_load: StartLoad
    environ: Mapping[str, str]
    out: TextIO
    now: Callable[[], float]
    sleep: Callable[[float], None]
    minutes: int
    hello: int
    turns: int
    labels: int

    @property
    def sandboxed(self) -> bool:
        return self.environ.get("SANDBOX_RUNTIME") == "1"

    def say(self, text: str) -> None:
        with contextlib.suppress(
            OSError
        ):  # a terminal closed under the run fails every write
            print(text, file=self.out, flush=True)

    def docker(self) -> list[str]:
        # Inside the sandbox, the relay; it runs the command directly when a relay already answers (make's own).
        return [str(RELAY), "docker"] if self.sandboxed else ["docker"]

    def compose(self, *args: str) -> list[str]:
        return [
            *self.docker(),
            "compose",
            "-p",
            PROJECT,
            "-f",
            str(COMPOSE_FILE),
            "--env-file",
            str(DEVCPU_VARS),
            *args,
        ]

    def env(self) -> dict[str, str]:
        kept = {key: self.environ[key] for key in HOP_ENV if key in self.environ}
        return {**kept, "LC_ALL": "C"}

    def call(self, what: str, command: list[str], *, done_if: str | None = None) -> str:
        code, out, err = self.runner(command, None, self.env(), DOCKER_TIMEOUT_S)
        if code != 0 and not (done_if and done_if in err):
            tail = " | ".join(line.strip() for line in err.strip().splitlines()[-2:])
            raise Stop(f"{what} failed (exit {code}){': ' + tail if tail else ''}")
        return out

    def ps(self) -> list[dict[str, str]]:
        return parse_ps(
            self.call("docker compose ps", self.compose("ps", "--format", "json"))
        )

    def df(self) -> dict[str, Any]:
        text = self.call(
            "docker system df",
            [*self.docker(), "system", "df", "-v", "--format", "{{json .}}"],
        )
        try:
            doc = json.loads(text)
        except ValueError:
            raise Stop("docker system df printed no JSON") from None
        return doc if isinstance(doc, dict) else {}

    def stats(self, names: Sequence[str]) -> dict[str, tuple[int, int]]:
        command = [
            *self.docker(),
            "stats",
            "--no-stream",
            "--format",
            "{{json .}}",
            *names,
        ]
        return parse_stats(self.call("docker stats", command))

    def load_command(self) -> list[str]:
        return self.compose(
            "--profile",
            "breach",
            "run",
            "--build",
            "--rm",
            "-T",
            "--name",
            LOAD_CONTAINER,
            LOAD_SERVICE,
            "python3",
            "-I",
            "/app/measure_load.py",
            "--minutes",
            str(self.minutes),
            "--hello-per-minute",
            str(self.hello),
            "--turns-per-minute",
            str(self.turns),
            "--labels",
            str(self.labels),
        )


def stack_names(rows: Sequence[Mapping[str, str]]) -> dict[str, str]:
    """Container name to service, for the stack's running services: never the load's probe."""
    return {
        row["Name"]: row["Service"]
        for row in running(rows)
        if row["Service"] != LOAD_SERVICE
    }


def load_summary(stdout: str) -> dict[str, Any] | None:
    for line in reversed(stdout.splitlines()):
        with contextlib.suppress(ValueError):
            doc = json.loads(line)
            if isinstance(doc, dict) and doc.get("h4_measure_load") == 1:
                return doc
    return None


def put_back(ctx: Context, load: Load | None, was_running: bool) -> None:
    """The stack as the run found it: the load ended, its container gone, the model server started again if the run
    stopped it. Each step is tried whatever the one before it did, with signals ignored meanwhile."""
    with ignoring_signals():
        if load is not None and load.poll() is None:
            load.terminate()
            try:
                ctx.call(
                    f"docker rm {LOAD_CONTAINER}",
                    [*ctx.docker(), "rm", "--force", LOAD_CONTAINER],
                    done_if="No such container",
                )
            except Stop as stop:
                ctx.say(
                    f"measure-stack: {stop}; end it with docker rm --force {LOAD_CONTAINER}"
                )
        if was_running:
            try:
                ctx.call(
                    f"docker compose start {MODEL_SERVER}",
                    ctx.compose("start", MODEL_SERVER),
                )
                ctx.say(
                    f"measure-stack: {MODEL_SERVER} started again, as the run found it"
                )
            except Stop as stop:
                ctx.say(f"measure-stack: {stop}; start it with make up ENV=dev-cpu")


def measure(ctx: Context) -> dict[str, Any]:
    rows = ctx.ps()
    up = {row["Service"] for row in running(rows)}
    missing = [service for service in UP_SERVICES if service not in up]
    if missing:
        raise Refusal(
            f"dev-cpu isn't up ({', '.join(missing)} not running): run make up ENV=dev-cpu first"
        )
    was_running = MODEL_SERVER in up
    load: Load | None = None
    started = ctx.now()
    try:
        if was_running:
            ctx.say(f"measure-stack: stopping {MODEL_SERVER} for the run")
            ctx.call(
                f"docker compose stop {MODEL_SERVER}", ctx.compose("stop", MODEL_SERVER)
            )
        rows = ctx.ps()
        check_no_model_server(rows)
        images = {
            normalize_image(row["Image"])
            for row in running(rows)
            if row["Service"] != LOAD_SERVICE
        }
        before, _ = volumes_of(ctx.df())
        ctx.say(
            f"measure-stack: the load, {ctx.minutes} minutes of hello at {ctx.hello} a minute over {ctx.labels} "
            f"labels and the ready pieces' openings at {ctx.turns} a minute, from a breach-probe container; a sample "
            f"every {INTERVAL_S} s. The stub spends dev-cpu's $2 fallback grant for the day (synthetic)"
        )
        load = ctx.start_load(ctx.load_command(), ctx.env())
        peaks = Peaks()
        deadline = ctx.now() + ctx.minutes * 60 + GRACE_S
        while True:
            rows = ctx.ps()
            check_no_model_server(rows)
            names = stack_names(rows)
            peaks.add(sample_of(ctx.stats(sorted(names)), names))
            if load.poll() is not None:
                break
            if ctx.now() >= deadline:
                raise Stop(
                    f"the load ran past {ctx.minutes} minutes and {GRACE_S} s more"
                )
            ctx.sleep(INTERVAL_S)
        code, stdout, stderr = load.result(DOCKER_TIMEOUT_S)
        if code != 0:
            tail = " | ".join(line.strip() for line in stderr.strip().splitlines()[-2:])
            raise Stop(f"the load exited {code}{': ' + tail if tail else ''}")
        summary = load_summary(stdout)
        if summary is None:
            raise Stop("the load printed no summary")
        after_df = ctx.df()
        after, unread = volumes_of(after_df)
        sizes, unmatched = images_of(after_df, images)
        return {
            "h4_measure_stack": 1,
            "stack": STACK,
            "started_utc": utc(started),
            "ended_utc": utc(ctx.now()),
            "minutes": ctx.minutes,
            "interval_s": INTERVAL_S,
            "samples": peaks.count,
            "model_server": {"service": MODEL_SERVER, "running_before": was_running},
            "load": summary,
            "answered": answered(summary),
            "services": [
                {
                    "service": service,
                    "peak_bytes": peaks.peak[service],
                    "limit_bytes": peaks.limit[service],
                    "samples": peaks.samples[service],
                }
                for service in sorted(peaks.peak)
            ],
            "sum_of_peaks_bytes": peaks.sum_of_peaks,
            "largest_sample_bytes": peaks.largest_sample,
            "volumes": [
                {
                    "volume": name,
                    "before_bytes": before.get(name, 0),
                    "after_bytes": after.get(name, 0),
                }
                for name in sorted(set(before) | set(after))
            ],
            "volumes_unread": unread,
            "images": [{"image": name, "bytes": sizes[name]} for name in sorted(sizes)],
            "images_bytes": sum(sizes.values()),
            "images_unmatched": unmatched,
        }
    finally:
        put_back(ctx, load, was_running)


def mib(n: int) -> str:
    return f"{n / MIB:.1f}"


def answered_line(share: Mapping[str, Any]) -> str:
    text = f"Answered by the stub: {share['by_the_stub']} of {share['requests']} requests ({share['share'] * 100:.1f}%)."
    if share["by_the_stub"] < share["requests"]:
        text += " The rest were degraded or refused, so these peaks are of "
        text += (
            "a mostly degraded stack"
            if share["share"] < 0.5
            else "a partly degraded stack"
        )
        text += " (research.md R-33)"
    return text


def table(record: Mapping[str, Any]) -> list[str]:
    services = sorted(
        record["services"], key=lambda row: (-row["peak_bytes"], row["service"])
    )
    model = record["model_server"]
    how = (
        "stopped for the run"
        if model["running_before"]
        else "not running when the run began"
    )
    lines = [
        (
            f"measure-stack: {record['stack']}, {record['started_utc']} to {record['ended_utc']}, "
            f"{record['samples']} samples, one every {record['interval_s']} s; {model['service']} {how}"
        ),
        "",
        answered_line(record["answered"]),
        "",
        "| Service | Peak (MiB) | Limit (MiB) | Samples |",
        "|---|---|---|---|",
        *(
            f"| {row['service']} | {mib(row['peak_bytes'])} | {mib(row['limit_bytes'])} | {row['samples']} |"
            for row in services
        ),
        f"| All services, the sum of each one's peak | {mib(record['sum_of_peaks_bytes'])} | | |",
        f"| All services, the largest total in one sample | {mib(record['largest_sample_bytes'])} | | |",
        "",
        "| Volume | Before (MiB) | After (MiB) |",
        "|---|---|---|",
        *(
            f"| {row['volume']} | {mib(row['before_bytes'])} | {mib(row['after_bytes'])} |"
            for row in record["volumes"]
        ),
        "",
        (
            f"Images the stack runs: {len(record['images'])}, {mib(record['images_bytes'])} MiB in all "
            "(each image's size, so layers two images share count twice)"
        ),
    ]
    if record["images_unmatched"]:
        names = record["images_unmatched"]
        lines.append(
            f"Not in docker system df's image list: {len(names)} images: {', '.join(names)}"
        )
    if record["volumes_unread"]:
        lines.append(
            f"Volumes docker sized in no form this reads: {', '.join(record['volumes_unread'])}"
        )
    load = record["load"]
    lines.append(
        f"Load: {load['minutes']} minutes; hello {load['hello_per_minute']} a minute over {load.get('labels', '?')} "
        f"labels, turns {load['turns_per_minute']} a minute; sent: hello {load['sent']['hello']}, "
        f"turn {load['sent']['turn']}; late: {load['late']}"
    )
    for kind in ("hello", "turn"):
        counts = load["outcomes"].get(kind, {})
        lines.append(f"{kind}: " + ", ".join(f"{key} {n}" for key, n in counts.items()))
    return lines


# --- the refusals, and main ---------------------------------------------------------------------------------------


def real_run(
    argv: list[str], stdin: str | None, env: dict[str, str], timeout: float
) -> tuple[int, str, str]:
    try:
        done = subprocess.run(
            argv,
            input=stdin,
            stdin=subprocess.DEVNULL if stdin is None else None,
            capture_output=True,
            text=True,
            env=env,
            timeout=timeout,
            check=False,
            start_new_session=True,
        )
    except subprocess.TimeoutExpired:
        return 124, "", f"timed out after {round(timeout)} s"
    except OSError as error:
        return 127, "", f"couldn't run {argv[0]}: {error.strerror or error}"
    return done.returncode, done.stdout, done.stderr


class _RealLoad:
    """The load's process, its output in temporary files rather than pipes, which a long build log could fill. The
    files outlive __init__, so no with block holds them: result() and terminate() close them. It runs in its own
    session, so the terminal's signals reach only this script, which ends it."""

    def __init__(self, argv: list[str], env: dict[str, str]) -> None:
        self._out = tempfile.TemporaryFile(mode="w+", encoding="utf-8")  # noqa: SIM115 (closed in _close)
        self._err = tempfile.TemporaryFile(mode="w+", encoding="utf-8")  # noqa: SIM115 (closed in _close)
        self._process = subprocess.Popen(
            argv,
            stdin=subprocess.DEVNULL,
            stdout=self._out,
            stderr=self._err,
            text=True,
            env=env,
            start_new_session=True,
        )

    def poll(self) -> int | None:
        return self._process.poll()

    def _close(self) -> None:
        self._out.close()
        self._err.close()

    def terminate(self) -> None:
        self._process.terminate()
        with contextlib.suppress(subprocess.TimeoutExpired):
            self._process.wait(timeout=30)
        self._close()

    def result(self, timeout: float) -> tuple[int, str, str]:
        try:
            code = self._process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            return (
                124,
                "",
                f"the load didn't end within {round(timeout)} s of its last poll",
            )
        self._out.seek(0)
        self._err.seek(0)
        out, err = self._out.read(), self._err.read()
        self._close()
        return code, out, err


def real_git(args: list[str]) -> tuple[int, str]:
    try:
        done = subprocess.run(
            ["git", "-C", str(ROOT), *args],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return 1, ""
    return done.returncode, done.stdout


def check(args: argparse.Namespace, environ: Mapping[str, str], git: Git) -> None:
    if args.stack == "prod":
        raise Refusal(
            "prod is refused: with its model server stopped, its route sends hello to the paid fallback. The "
            "measurement runs on dev-cpu only (research.md R-33)"
        )
    if args.stack != STACK:
        raise Refusal(
            f"--stack {args.stack}: dev-cpu only; dev's repeat on the laptop isn't built (research.md R-33)"
        )
    if (
        args.env_file is not None
        and Path(args.env_file).resolve() != DEVCPU_VARS.resolve()
    ):
        raise Refusal(f"dev-cpu's env file is {DEVCPU_VARS.relative_to(ROOT)}")
    if not 1 <= args.minutes <= MAX_MINUTES:
        raise Refusal(f"--minutes is 1 to {MAX_MINUTES}")
    sandboxed = environ.get("SANDBOX_RUNTIME") == "1"
    if sandboxed and not RELAY.is_file():
        raise Refusal(f"{RELAY} is missing: the agents' engine is reached through it")
    if not sandboxed and environ.get("DOCKER_HOST", "") != ENGINE_HOST:
        raise Refusal(
            "dev-cpu runs on the agents' engine only (FR-039): from an agent session, through the relay, or from "
            f"your terminal with DOCKER_HOST={ENGINE_HOST}"
        )
    code, git_dir = git(["rev-parse", "--path-format=absolute", "--git-dir"])
    code2, common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"])
    if code or code2:
        raise Refusal(f"{ROOT} isn't a git working tree")
    if git_dir.strip() != common.strip():
        raise Refusal(
            "this is a linked worktree: run dev-cpu from the main working tree, whose files the engine binds "
            "(spec 000 contracts/env-files.md §7.3)"
        )


def main(
    argv: list[str] | None = None,
    *,
    runner: Runner | None = None,
    start_load: StartLoad | None = None,
    environ: Mapping[str, str] | None = None,
    git: Git | None = None,
    now: Callable[[], float] | None = None,
    sleep: Callable[[float], None] | None = None,
    out: TextIO | None = None,
    budgets_text: str | None = None,
) -> int:
    out = out or sys.stdout
    environ = os.environ if environ is None else environ
    parser = argparse.ArgumentParser(
        prog="measure_stack.py", description=__doc__.splitlines()[0]
    )
    parser.add_argument("--stack", required=True)
    parser.add_argument("--env-file", help="dev-cpu's env file (make passes it)")
    parser.add_argument("--minutes", type=int, default=DEFAULT_MINUTES)
    args = parser.parse_args(argv)

    def tell(text: str) -> None:
        with contextlib.suppress(OSError):
            print(text, file=out, flush=True)

    try:
        with interruptible():
            check(args, environ, git or real_git)
            text = (
                budgets_text
                if budgets_text is not None
                else BUDGETS.read_text(encoding="utf-8")
            )
            hello, turns, labels = load_rates(text, args.minutes)
            ctx = Context(
                runner=runner or real_run,
                start_load=start_load or _RealLoad,
                environ=environ,
                out=out,
                now=now or time.time,
                sleep=sleep or time.sleep,
                minutes=args.minutes,
                hello=hello,
                turns=turns,
                labels=labels,
            )
            record = measure(ctx)
    except Refusal as refusal:
        tell(f"measure_stack.py: {refusal}")
        tell("measure_stack.py: exit 2: refused before anything changed")
        return 2
    except ModelServerRunning as problem:
        tell(f"measure_stack.py: {problem}")
        tell("measure_stack.py: exit 3")
        return 3
    except Stop as stop:
        tell(f"measure_stack.py: {stop}")
        tell("measure_stack.py: exit 1: the run stopped, with no record")
        return 1
    except (KeyboardInterrupt, Interrupted) as stopped:
        name = "Ctrl-C" if isinstance(stopped, KeyboardInterrupt) else str(stopped)
        # put_back() has said above what it did, and what it couldn't.
        tell(f"measure_stack.py: exit 1: stopped by {name}, with no record")
        return 1
    tell("\n".join(table(record)))
    tell(json.dumps(record))
    return 0


if __name__ == "__main__":
    sys.exit(main())
