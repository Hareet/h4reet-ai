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
     the run's minutes; every INTERVAL_S seconds meanwhile, `docker stats --no-stream`, each service's resident memory;
  5. `docker system df -v`: the shared state's data volume after the run;
  6. whatever happens, Ctrl-C included, `docker compose down -v` of the project, the load's container removed, and the
     temporary folder removed.

It prints a block for W1's note, then the record as one JSON line, marked "h4_measure_tunnel_end": 1. The type is the
smallest t4g that fits by memory alone, by R-33's rule as T016 applied it: the largest total of the five at one
sample, beside OS_DOCKER_MIB for the OS and Docker, within USABLE_SHARE of the type's memory. Standard library only,
by path through PY_HOST. Nothing it prints holds a stand-in secret, a payload, or an address.

Exit codes: 0 the record printed; 1 the run stopped (a docker call failed, or a signal), with no record; 2 refused.
"""

from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
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
LOAD_CONTAINER = f"{PROJECT}-load"
DATA_VOLUME = f"{PROJECT}_measure-shared-state-data"
STORE_CONTAINER = f"{PROJECT}-shared-state-1"
DEFAULT_MINUTES = 30
MIN_MINUTES, MAX_MINUTES = 5, 240
INTERVAL_S = 10
GRACE_S = 120
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
    return {
        "h4_measure_tunnel_end": 1,
        "started_utc": utc(started),
        "ended_utc": utc(ended),
        "minutes": minutes,
        "per_minute": per_minute,
        "samples": len(samples),
        "peak_mib": {service: peaks[service] for service in FIVE if service in peaks},
        "largest_total_mib": largest,
        "data_volume_mib": None
        if volume_bytes is None
        else round(volume_bytes / MIB, 1),
        "missing": missing,
        "type": None if missing or not samples else type_for(largest),
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
    if record["missing"]:
        lines.append(
            f"- Not measured: {', '.join(record['missing'])}; no type is named until all five are."
        )
    else:
        lines.append(
            "- The smallest arm64 type by memory alone, by R-33's rule (the largest total, and "
            f"{OS_DOCKER_MIB} MiB for the OS and Docker, within {round(USABLE_SHARE * 100)}% of its memory): "
            f"{record['type'] or 'none of t4g.nano to t4g.xlarge'}."
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
    clock: Callable[[], float] = time.time
    sleep: Callable[[float], None] = time.sleep
    say: Callable[[str], None] = print
    scratch_root: Path = field(default_factory=lambda: Path(tempfile.gettempdir()))
    per_minute: int | None = None


def _docker(
    ctx: Context, argv: list[str], stdin: str | None = None, timeout: float = 900
) -> str:
    code, out, err = ctx.run(argv, stdin, timeout)
    if code != 0:
        first = (err or out).strip().splitlines()[:1]
        raise Stop(
            f"{' '.join(argv[:3])} failed (exit {code}){': ' + first[0] if first else ''}"
        )
    return out


def measure(ctx: Context) -> dict[str, Any]:
    per_minute = ctx.per_minute or metered_per_minute(ctx.tree)
    scratch = Path(tempfile.mkdtemp(prefix="h4-measure-te-", dir=ctx.scratch_root))
    values = stand_ins()
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
    ]
    samples: list[dict[str, int]] = []
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
        deadline = started + ctx.minutes * 60
        while ctx.clock() < deadline:
            rows = ms.parse_ps(_docker(ctx, [*compose, "ps", "--format", "json"]))
            names = {row["Name"]: row["Service"] for row in ms.running(rows)}
            if names:
                stats = ms.parse_stats(
                    _docker(
                        ctx,
                        [
                            "docker",
                            "stats",
                            "--no-stream",
                            "--format",
                            "{{json .}}",
                            *sorted(names),
                        ],
                    )
                )
                sample = {
                    service: used
                    for service, (used, _limit) in ms.sample_of(stats, names).items()
                    if service in FIVE
                }
                if sample:
                    samples.append(sample)
            ctx.sleep(INTERVAL_S)
        code, out, _err = ctx.run(["docker", "logs", LOAD_CONTAINER], None, 60)
        if code == 0:
            for line in out.splitlines():
                if line.startswith("{") and '"h4_measure_load"' in line:
                    try:
                        load = json.loads(line)
                    except ValueError:
                        load = None
        df = json.loads(
            _docker(ctx, ["docker", "system", "df", "-v", "--format", "json"]) or "{}"
        )
        for entry in df.get("Volumes") or []:
            if str(entry.get("Name", "")) == DATA_VOLUME:
                try:
                    volume = ms.parse_size(str(entry.get("Size", "")))
                except ValueError:
                    volume = None
    finally:
        ctx.say(f"measure-tunnel-end: taking {PROJECT} down, its volumes with it")
        ctx.run(["docker", "rm", "--force", LOAD_CONTAINER], None, 120)
        ctx.run(
            [*compose, "down", "-v", "--remove-orphans", "--timeout", "30"], None, 600
        )
        shutil.rmtree(scratch, ignore_errors=True)
    ended = ctx.clock()
    return record_of(samples, volume, ctx.minutes, per_minute, started, ended, load)


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
