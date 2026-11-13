#!/usr/bin/env python3
"""make measure-tunnel-end [MINUTES=30] (spec 001 tasks.md T166; research.md R-33; plan.md §16, "T166's harness").

    python3 -I -B -X pycache_prefix=/dev/null deploy/scripts/measure_tunnel_end.py [--minutes N]

It measures the tunnel end's five services, as its instance would run them, on the engine of whoever runs it: the
Author's own engine from his terminal (docker's own DOCKER_HOST, or none), or, inside an agent sandbox, the agents'
engine through deploy/agents-engine/docker-relay, where the tunnel's image doesn't build (its Ubuntu packages are
behind the engine's egress proxy; the note's "T166" section). It writes no price and sets no type: the session sets
`local.tunnel_end_type` in infra/prod/tunnel-end.tf from the block it prints, once the Author pastes it.

How it runs, in its own project, h4reet-measure-tunnel-end, never a stack's:
  1. a temporary folder outside the repository and ~/.config holds the run's env file, mode 0600: stand-in tokens and
     passwords made for the run (secrets.token_urlsafe), which nothing outside the run knows; it is removed after;
  2. `docker compose -f deploy/compose.yaml -f deploy/measure/tunnel-end.overlay.yaml up --build --wait` of
     tunnel-end, relay, snapshot-sink, tunnel-end-collector, shared-state, and the stub host, measure-host. The
     overlay publishes nothing, binds no host path but the tree's, and gives the relay the measurement's stand-in
     public-cap figures, deploy/measure/budgets.measure.yaml, not the Author's;
  3. the store, as the gateway's migrations make it, with its kill switch `normal`, and the relay's two roles' stand-in
     passwords, over its socket inside its container;
  4. the load, a one-off container (deploy/measure/load_tunnel_end.py): hello through the relay to the stub host at
     config/budgets.yaml's global metered limit, the status every 5 s, and a host part to the sink each minute, for
     the run's minutes, kept by the monotonic clock; every INTERVAL_S seconds meanwhile, `docker stats --no-stream`,
     each service's resident memory and limit. A sample whose `compose ps` or `docker stats` fails is skipped and
     counted, never fatal. Then the load's container is given GRACE_S to finish and print its counts;
  5. the shared state's data volume after the run: `du -sk` of the store's data folder, in the store's own container,
     which mounts that volume alone (never `docker system df -v`, which would size every volume on the engine); a
     failed read is said in the block, and the peaks kept;
  6. whatever happens, Ctrl-C included, SIGINT, SIGTERM, and SIGHUP are ignored from then on, and `docker compose
     down -v` takes the project down, the load's container is removed, and the temporary folder removed; a print that
     fails there (a closed terminal) doesn't stop it. The overlay gives the five `restart: "no"`, so a measurement cut
     short never comes back at the engine's next start.

It prints a block for W1's note, then the record as one JSON line, marked "h4_measure_tunnel_end": 1. Two types, each
the smallest t4g by R-33's rule as T016 applied it (a figure, beside OS_DOCKER_MIB for the OS and Docker, within
USABLE_SHARE of the type's memory): by the largest total of the five at one sample, and by the five's memory limits
together, as docker stats reports them (deploy/compose.yaml's, 528 MiB); the type it names is the larger. The host's
own timers (the sink's writer and the backup) run beside Docker and aren't counted, which the block says. The images
it builds, h4reet-measure-{tunnel,relay,snapshot}:local, stay after the run (the note's "T166" says how to remove
them). Standard library only, by path through PY_HOST. Nothing it prints holds a stand-in secret, a payload, or an
address.

Exit codes: 0 the record printed; 1 the run stopped (a docker call failed, or a signal), with no record; 2 refused.
"""

from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import importlib.util
import json
import os
import re
import secrets
import shutil
import signal
import sys
import tempfile
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
OVERLAY = Path("deploy") / "measure" / "tunnel-end.overlay.yaml"
PROJECT = "h4reet-measure-tunnel-end"
FIVE = ("tunnel-end", "relay", "snapshot-sink", "tunnel-end-collector", "shared-state")
SERVICES = (*FIVE, "measure-host")
LOAD_SERVICE = "measure-load"
# Every compose call names these, so each of the run's services is in the project's view, its take-down included:
# compose skips a profiled service its call doesn't enable (the Author's first run left the five running).
PROFILES = ("tunnel-end", LOAD_SERVICE)
# A failed docker call's stderr: its last lines, without compose's interpolation warnings (it reads the whole file, and
# VALKEY_PASSWORD is the Langfuse stack's), and the whole of it in a file under the home folder, since the run's
# temporary folder goes with it.
ERROR_LINES = 20
UNSET_WARNING = "variable is not set"
LOAD_CONTAINER = f"{PROJECT}-load"
STORE_CONTAINER = f"{PROJECT}-shared-state-1"
DEFAULT_MINUTES = 30
# The longest run stays under the stand-in's requests a day: at 60 hellos a minute across the load's 16 addresses,
# each passes 500 a day after about 133 minutes, and the relay would answer 429.
MIN_MINUTES, MAX_MINUTES = 5, 120
INTERVAL_S = 10
GRACE_S = 120
DATA_DIR = "/var/lib/postgresql/data"
HOST_TIMERS = ("h4-snapshot-sink.service", "h4-shared-state-backup.timer")
MIB = 1024**2
# R-33's rule, as T016 applied it to EC2's stack (research.md R-33): a size fits when the largest sample, beside the
# OS's and Docker's own memory, leaves a fifth of it free for an answered load. The t4g family, arm64, by memory.
OS_DOCKER_MIB = 512
USABLE_SHARE = 0.8
TYPES = (
    ("t4g.nano", 512),
    ("t4g.micro", 1024),
    ("t4g.small", 2048),
    ("t4g.medium", 4096),
    ("t4g.large", 8192),
    ("t4g.xlarge", 16384),
)


def _measure_stack():
    spec = importlib.util.spec_from_file_location(
        "measure_stack_for_tunnel_end",
        Path(__file__).resolve().parent / "measure_stack.py",
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


ms = _measure_stack()


class Stop(Exception):
    """The run stopped: a docker call failed, or a signal came."""


def type_for(total_mib: float) -> str | None:
    """The smallest t4g that holds the largest total beside the OS and Docker within USABLE_SHARE; None past them."""
    for name, memory in TYPES:
        if total_mib + OS_DOCKER_MIB <= USABLE_SHARE * memory:
            return name
    return None


def larger(a: str, b: str) -> str:
    order = [name for name, _memory in TYPES]
    return max(a, b, key=order.index)


def hold_signals() -> None:
    """The cleanup's guard: a second Ctrl-C, a closed terminal's SIGHUP, or a SIGTERM no longer stops it."""
    for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, signal.SIG_IGN)


def stand_ins() -> dict[str, str]:
    """The run's tokens and passwords, made for it alone."""
    keys = (
        "RELAY_TOKEN_LAPTOP",
        "RELAY_TOKEN_EC2",
        "DB_RELAY_RO_PASSWORD",
        "DB_RELAY_RW_PASSWORD",
        "SNAPSHOT_SINK_TOKEN",
        "TELEMETRY_BLOCK_TOKEN",
        "MEASURE_SUPERUSER_PASSWORD",
    )
    return {key: secrets.token_urlsafe(32) for key in keys}


def env_text(tree: Path, scratch: Path, values: Mapping[str, str]) -> str:
    """The run's env file: the tree, the bind roots compose requires of every stack (the scratch folder, which no
    service of the run binds), the stack's names, and the stand-ins."""
    lines = [
        "# MEASUREMENT ONLY (tasks.md T166): a temporary file of make measure-tunnel-end, removed after the run.",
        f"H4_TREE={tree}",
        "H4_HOST=tunnel-end",
        "H4_STACK=dev",
        "H4_ENV=dev",
        f"H4_STATE_DIR={scratch / 'none'}",
        f"H4_AWS_DIR={scratch / 'none'}",
        f"H4_MODEL_DIR={scratch / 'none'}",
        "SHARED_STATE_TLS_CA=",
        *(f"{key}={value}" for key, value in values.items()),
    ]
    return "\n".join(lines) + "\n"


def compose_files(tree: Path) -> list[str]:
    return ["-f", str(tree / "deploy" / "compose.yaml"), "-f", str(tree / OVERLAY)]


def metered_per_minute(tree: Path) -> int:
    """config/budgets.yaml's global metered limit, the gateway's, the most a host would be asked to answer."""
    text = (tree / "config" / "budgets.yaml").read_text(encoding="utf-8")
    match = re.search(
        r"^\s*global:\s*\{[^}]*metered_per_minute:\s*(\d+)", text, re.MULTILINE
    )
    if match is None:
        raise ValueError("config/budgets.yaml names no global metered_per_minute")
    return int(match.group(1))


def store_sql(tree: Path, values: Mapping[str, str]) -> str:
    """The store as the gateway makes it: its schema, each migration in order, the kill switch's row, and the relay's
    two roles' stand-in passwords."""
    parts = ["CREATE SCHEMA IF NOT EXISTS gateway;"]
    for path in sorted((tree / "services" / "gateway" / "migrations").glob("*.sql")):
        parts.append(path.read_text(encoding="utf-8"))
    parts.append(
        "INSERT INTO gateway.stack_state (id, stack, env, state, since, crossed, fallback_awaiting_renewal,"
        " initialized_at, initialized_by, updated_at) VALUES (1, 'dev', 'dev', 'normal', now(), '{}', false, now(),"
        " 'measure-tunnel-end', now()) ON CONFLICT (id) DO NOTHING;"
    )
    for role, key in (
        ("relay_ro", "DB_RELAY_RO_PASSWORD"),
        ("relay_rw", "DB_RELAY_RW_PASSWORD"),
    ):
        parts.append(f"ALTER ROLE {role} PASSWORD '{values[key]}';")
    return "\n".join(parts) + "\n"


def utc(seconds: float) -> str:
    return dt.datetime.fromtimestamp(seconds, dt.timezone.utc).strftime(
        "%Y-%m-%d %H:%M"
    )


def record_of(
    samples: Sequence[Mapping[str, int]],
    volume_bytes: int | None,
    minutes: int,
    per_minute: int,
    started: float,
    ended: float,
    load: Mapping[str, Any] | None = None,
    limits: Mapping[str, int] | None = None,
    failed_samples: int = 0,
) -> dict[str, Any]:
    peaks: dict[str, float] = {}
    for sample in samples:
        for service, used in sample.items():
            if service in FIVE:
                peaks[service] = max(peaks.get(service, 0.0), round(used / MIB, 1))
    totals = [
        sum(used for service, used in sample.items() if service in FIVE)
        for sample in samples
    ]
    largest = round(max(totals) / MIB, 1) if totals else 0.0
    missing = [service for service in FIVE if service not in peaks]
    limits_mib = {
        service: round(limits[service] / MIB, 1)
        for service in FIVE
        if limits and service in limits
    }
    limits_total = (
        round(sum(limits_mib.values()), 1) if len(limits_mib) == len(FIVE) else None
    )
    by_peaks = None if missing or not samples else type_for(largest)
    by_limits = None if limits_total is None else type_for(limits_total)
    named = by_peaks
    if by_peaks is not None and limits_total is not None:
        named = None if by_limits is None else larger(by_peaks, by_limits)
    return {
        "h4_measure_tunnel_end": 1,
        "started_utc": utc(started),
        "ended_utc": utc(ended),
        "minutes": minutes,
        "per_minute": per_minute,
        "samples": len(samples),
        "failed_samples": failed_samples,
        "peak_mib": {service: peaks[service] for service in FIVE if service in peaks},
        "largest_total_mib": largest,
        "data_volume_mib": None
        if volume_bytes is None
        else round(volume_bytes / MIB, 1),
        "missing": missing,
        "limits_mib": limits_mib,
        "limits_total_mib": limits_total,
        "type_by_peaks": by_peaks,
        "type_by_limits": by_limits,
        "type": named,
        "load": dict(load or {}),
    }


def block(record: Mapping[str, Any]) -> list[str]:
    lines = [
        (
            f"T166, the tunnel end's five services, measured {record['started_utc']} to {record['ended_utc']} UTC: "
            f"{record['minutes']} minutes of hello through the relay to a stub host at {record['per_minute']} a minute "
            "(the gateway's global metered limit), the status every 5 s, and a host part to the sink each minute; "
            f"{record['samples']} samples, every {INTERVAL_S} s."
        ),
        "",
        "| Service | Peak (MiB) |",
        "|---|---|",
    ]
    for service in FIVE:
        peak = record["peak_mib"].get(service)
        lines.append(
            f"| {service} | {'not measured' if peak is None else f'{peak:.1f}'} |"
        )
    volume = record["data_volume_mib"]
    lines += [
        "",
        f"- Largest total of the five at one sample: {record['largest_total_mib']:.1f} MiB.",
        "- The shared state's data volume after the run: "
        + ("not read" if volume is None else f"{volume:.1f} MiB")
        + ".",
    ]
    if record.get("failed_samples"):
        lines.append(
            f"- Samples skipped, their docker call failed: {record['failed_samples']}."
        )
    limits = record.get("limits_mib") or {}
    total = record.get("limits_total_mib")
    rule = f"beside {OS_DOCKER_MIB} MiB for the OS and Docker, within {round(USABLE_SHARE * 100)}% of its memory"
    beyond = "none of t4g.nano to t4g.xlarge"
    if total is None:
        lines.append(
            "- The five's memory limits: not read, so the type is named by the peaks alone."
        )
    else:
        each = ", ".join(f"{service} {limits[service]:.1f}" for service in FIVE)
        lines.append(
            f"- The five's memory limits, as docker stats reported them: {total:.1f} MiB together ({each}); "
            f"the smallest type that holds them, {rule}: {record.get('type_by_limits') or beyond}."
        )
    if record["missing"]:
        lines.append(
            f"- Not measured: {', '.join(record['missing'])}; no type is named until all five are."
        )
    else:
        lines.append(
            f"- The smallest type by the peaks (the largest total, {rule}): "
            f"{record.get('type_by_peaks') or beyond}."
        )
        lines.append(
            "- **The type, the larger of the two (R-33's rule on the peaks and on the limits): "
            f"{record['type'] or beyond}.**"
        )
    lines.append(
        "- The host's own timers beside Docker, the sink's writer ("
        + HOST_TIMERS[0]
        + ") and the backup ("
        + HOST_TIMERS[1]
        + "), are not counted: they run outside the five's limits, within the OS's share."
    )
    load = record.get("load") or {}
    if load:
        lines.append(
            "- The load's answers by status: "
            + "; ".join(
                f"{kind} {json.dumps(load.get(kind, {}), sort_keys=True)}"
                for kind in ("hello", "status", "part")
            )
            + "."
        )
    else:
        lines.append(
            "- The load's answers by status: load counts not read, so nothing here shows the relay forwarded."
        )
    lines += [
        (
            "- The relay's public cap in the run: the measurement's stand-in figures "
            "(deploy/measure/budgets.measure.yaml), not the Author's."
        ),
        "- No price: the prices are the Author's (T167).",
    ]
    return lines


Runner = Callable[..., "tuple[int, str, str]"]


@dataclass
class Context:
    tree: Path
    minutes: int
    run: Runner
    clock: Callable[[], float] = (
        time.time
    )  # the record's start and end, by the wall clock
    sleep: Callable[[float], None] = time.sleep
    monotonic: Callable[[], float] = (
        time.monotonic
    )  # the sampling window, which the wall clock's steps can't stretch
    hold_signals: Callable[[], None] = hold_signals
    say: Callable[[str], None] = print
    scratch_root: Path = field(default_factory=lambda: Path(tempfile.gettempdir()))
    per_minute: int | None = None
    error_log: Path = field(default_factory=lambda: Path.home() / "t166-error.log")
    # The run's stand-in values, which no message or log may hold.
    redact: list[str] = field(default_factory=list)


def _docker(
    ctx: Context, argv: list[str], stdin: str | None = None, timeout: float = 900
) -> str:
    code, out, err = ctx.run(argv, stdin, timeout)
    if code != 0:
        text = err or out
        for value in ctx.redact:
            if value:
                text = text.replace(value, "[stand-in]")
        where = f"the whole stderr is in {ctx.error_log}"
        try:
            ctx.error_log.parent.mkdir(parents=True, exist_ok=True)
            # Never through a symlink, and 0600 even when an older file had wider bits (the review of b78e3492, N1).
            fd = os.open(
                ctx.error_log,
                os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW,
                0o600,
            )
            with os.fdopen(fd, "w", encoding="utf-8") as log:
                os.fchmod(log.fileno(), 0o600)
                log.write(text)
        except OSError as exc:
            where = f"{ctx.error_log} couldn't be written ({exc.strerror})"
        lines = [
            line
            for line in text.strip().splitlines()
            if line.strip() and UNSET_WARNING not in line
        ][-ERROR_LINES:]
        raise Stop(
            f"{' '.join(argv[:3])} failed (exit {code}); {where}; its last lines:\n"
            + "\n".join(lines)
        )
    return out


def measure(ctx: Context) -> dict[str, Any]:
    per_minute = ctx.per_minute or metered_per_minute(ctx.tree)
    scratch = Path(tempfile.mkdtemp(prefix="h4-measure-te-", dir=ctx.scratch_root))
    values = stand_ins()
    ctx.redact[:] = [v for v in values.values() if v]
    env_file = scratch / "measure.vars"
    env_file.touch(mode=0o600)
    env_file.write_text(env_text(ctx.tree, scratch, values), encoding="utf-8")
    compose = [
        "docker",
        "compose",
        *compose_files(ctx.tree),
        "--env-file",
        str(env_file),
        "-p",
        PROJECT,
        *(word for profile in PROFILES for word in ("--profile", profile)),
    ]
    samples: list[dict[str, int]] = []
    limits: dict[str, int] = {}
    failed = 0
    volume: int | None = None
    load: dict[str, Any] | None = None
    started = ctx.clock()
    try:
        ctx.say(
            "measure-tunnel-end: the relay's public cap is the measurement's stand-in figures "
            "(deploy/measure/budgets.measure.yaml), not the Author's"
        )
        ctx.say(
            f"measure-tunnel-end: building and starting {', '.join(SERVICES)} as {PROJECT}"
        )
        _docker(
            ctx,
            [
                *compose,
                "up",
                "-d",
                "--build",
                "--wait",
                "--wait-timeout",
                "600",
                *SERVICES,
            ],
        )
        ctx.say(
            "measure-tunnel-end: the store, as the gateway's migrations make it, with its kill switch normal"
        )
        _docker(
            ctx,
            [
                "docker",
                "exec",
                "-i",
                "-u",
                "postgres",
                STORE_CONTAINER,
                "psql",
                "-X",
                "-q",
                "-v",
                "ON_ERROR_STOP=1",
                "--dbname=h4reet",
            ],
            store_sql(ctx.tree, values),
        )
        ctx.say(
            f"measure-tunnel-end: the load, {ctx.minutes} minutes of hello at {per_minute} a minute, "
            "the status every 5 s, a host part each minute"
        )
        _docker(
            ctx,
            [
                *compose,
                "run",
                "-d",
                "--no-deps",
                "--name",
                LOAD_CONTAINER,
                LOAD_SERVICE,
                "--minutes",
                str(ctx.minutes),
                "--per-minute",
                str(per_minute),
            ],
        )
        started = ctx.clock()
        deadline = ctx.monotonic() + ctx.minutes * 60
        while ctx.monotonic() < deadline:
            sample, seen = _sample(ctx, compose)
            if sample is None:
                failed += 1
            elif sample:
                samples.append(sample)
                for service, limit in seen.items():
                    limits[service] = max(limits.get(service, 0), limit)
            ctx.sleep(INTERVAL_S)
        ctx.run(["docker", "wait", LOAD_CONTAINER], None, GRACE_S)
        load = _load_counts(ctx)
        volume = _volume(ctx)
    finally:
        ctx.hold_signals()
        # A closed terminal's EIO, or anything else a print raises: the down still runs.
        with contextlib.suppress(Exception):
            ctx.say(f"measure-tunnel-end: taking {PROJECT} down, its volumes with it")
        ctx.run(["docker", "rm", "--force", LOAD_CONTAINER], None, 120)
        ctx.run(
            [*compose, "down", "-v", "--remove-orphans", "--timeout", "30"], None, 600
        )
        shutil.rmtree(scratch, ignore_errors=True)
    ended = ctx.clock()
    return record_of(
        samples,
        volume,
        ctx.minutes,
        per_minute,
        started,
        ended,
        load,
        limits=limits or None,
        failed_samples=failed,
    )


def _sample(
    ctx: Context, compose: list[str]
) -> tuple[dict[str, int] | None, dict[str, int]]:
    """One sample of the five's resident memory, and each one's limit; None when its docker call failed."""
    code, out, _err = ctx.run([*compose, "ps", "--format", "json"], None, 120)
    if code != 0:
        return None, {}
    names = {row["Name"]: row["Service"] for row in ms.running(ms.parse_ps(out))}
    if not names:
        return {}, {}
    argv = ["docker", "stats", "--no-stream", "--format", "{{json .}}", *sorted(names)]
    code, out, _err = ctx.run(argv, None, 120)
    if code != 0:
        return None, {}
    figures = {
        service: pair
        for service, pair in ms.sample_of(ms.parse_stats(out), names).items()
        if service in FIVE
    }
    return (
        {service: used for service, (used, _limit) in figures.items()},
        {service: limit for service, (_used, limit) in figures.items()},
    )


def _load_counts(ctx: Context) -> dict[str, Any] | None:
    code, out, _err = ctx.run(["docker", "logs", LOAD_CONTAINER], None, 60)
    if code != 0:
        return None
    for line in out.splitlines():
        if line.startswith("{") and '"h4_measure_load"' in line:
            try:
                return json.loads(line)
            except ValueError:
                return None
    return None


def _volume(ctx: Context) -> int | None:
    """The store's data volume, from inside the store's container, which mounts that volume alone."""
    argv = ["docker", "exec", "-u", "postgres", STORE_CONTAINER, "du", "-sk", DATA_DIR]
    code, out, _err = ctx.run(argv, None, 120)
    first = out.split()[:1] if code == 0 else []
    if not first or not first[0].isdigit():
        return None
    return int(first[0]) * 1024


def real_run(
    argv: list[str], stdin: str | None = None, timeout: float = 900
) -> tuple[int, str, str]:
    import os

    env = {key: value for key, value in os.environ.items() if key in ms.HOP_ENV}
    return ms.real_run(argv, stdin, env, timeout)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="measure_tunnel_end.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument("--minutes", type=int, default=DEFAULT_MINUTES)
    args = parser.parse_args(argv)
    if not MIN_MINUTES <= args.minutes <= MAX_MINUTES:
        print(
            f"measure-tunnel-end: --minutes is {MIN_MINUTES} to {MAX_MINUTES}",
            file=sys.stderr,
        )
        return 2
    if shutil.which("docker") is None:
        print("measure-tunnel-end: no docker CLI here", file=sys.stderr)
        return 2

    def stop(signum: int, frame: object) -> None:
        raise Stop(f"signal {signum}")

    for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, stop)
    try:
        record = measure(Context(tree=ROOT, minutes=args.minutes, run=real_run))
    except Stop as exc:
        print(f"measure-tunnel-end: stopped: {exc}; no record", file=sys.stderr)
        return 1
    print("\n".join(block(record)))
    print(json.dumps(record, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
