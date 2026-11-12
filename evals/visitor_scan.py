#!/usr/bin/env python3
"""The visitor scan (spec 001 FR-042, SC-011; tasks.md T101, T109; plan.md §10): after a scripted visit, no store on
any host, nor the shared state, the relay's logs, or the tunnel end's, holds the visit's marker message or its address.

    python3 -I -B evals/visitor_scan.py plan --host laptop|ec2|tunnel-end [--project h4reet-prod]
    python3 -I -B evals/visitor_scan.py collect --host … --out DIR [--project …]   (the Author's, on each host)
    python3 -I -B evals/visitor_scan.py scan --marker M --address A DIR

The Author's run (quickstart §8): he sends hello and a twin turn through hareet.ai with a marker of his own making in
the message, from an address he knows, waits for the stores to settle (a minute or two: the collectors' batches,
Langfuse's ingestion), then on each host runs `collect` into a folder of his and `scan` over it. `collect` runs each
source of the host's plan, a docker command, and writes its output to a file named for the source; it reads nothing
else and sends nothing anywhere. `scan` reads every file under the folder, and inside each tar stream and gzip member,
for the marker as written, JSON-escaped, or URL-encoded, and for the address as written, URL-encoded, IPv4-mapped in
IPv6, or with a port; it prints the sources that hold either, with counts, and never what it found around it.

The plan holds, for every service of the host's class in deploy/compose.yaml: its container's log, and each of its
named volumes as `docker cp` copies it; each Postgres's data as pg_dump writes it, run as the image's postgres user,
whose socket peer rule the stores keep (group 8's review B, I4), the shared state's among them; ClickHouse's tables
and Valkey's keys as their own clients print them; and the gateway's journal. Loki's chunks and Prometheus's blocks are
compressed on disk, and the gateway's and the relay's OTLP logs and metrics reach them through the collector, not
through any container's log (group 8's review B, I5). So where they run, the plan also asks each through its own API,
from inside its stack, over the gateway's container, whose Node fetches it: Loki's query_range over every stream for
the last two hours, the visit's window, and Prometheus's label names and every label's values.

Exit codes: 0 nothing found; 1 a source holds the marker or the address; 2 usage, or a source couldn't be collected.
"""

from __future__ import annotations

import argparse
import gzip
import io
import ipaddress
import json
import re
import subprocess
import sys
import tarfile
import urllib.parse
from dataclasses import dataclass
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[1]
COMPOSE = REPO / "deploy" / "compose.yaml"
CLOUD_PROFILES = ("tunnel-end", "ec2")
# The profiles the laptop's prod runs beside the services that have none (contracts/env-cloud.md §3).
LAPTOP_PROFILES = ("gpu", "tunnel")
# Each Postgres the stacks run, its database and the role pg_dump connects as, over the container's own socket.
POSTGRES = {
    "gateway-state": ("gateway", "gateway"),
    "langfuse-db": ("langfuse", "langfuse"),
    "shared-state": ("h4reet", "postgres"),
}
# Where the gateway keeps its journal, the one bind a store's data lives in (deploy/compose.yaml).
JOURNAL = ("gateway", "/var/lib/h4-gateway")
CLICKHOUSE = (
    'for t in $(clickhouse-client --user clickhouse --password "$CLICKHOUSE_PASSWORD" -q "SHOW TABLES"); do '
    'clickhouse-client --user clickhouse --password "$CLICKHOUSE_PASSWORD" -q "SELECT * FROM $t FORMAT TSVRaw"; done'
)
VALKEY = (
    'valkey-cli -a "$VALKEY_PASSWORD" --no-auth-warning --scan | while read -r k; do '
    'case "$(valkey-cli -a "$VALKEY_PASSWORD" --no-auth-warning TYPE "$k")" in '
    'string) valkey-cli -a "$VALKEY_PASSWORD" --no-auth-warning GET "$k";; '
    'hash) valkey-cli -a "$VALKEY_PASSWORD" --no-auth-warning HGETALL "$k";; '
    'list) valkey-cli -a "$VALKEY_PASSWORD" --no-auth-warning LRANGE "$k" 0 -1;; '
    'set) valkey-cli -a "$VALKEY_PASSWORD" --no-auth-warning SMEMBERS "$k";; '
    'zset) valkey-cli -a "$VALKEY_PASSWORD" --no-auth-warning ZRANGE "$k" 0 -1;; '
    'stream) valkey-cli -a "$VALKEY_PASSWORD" --no-auth-warning XRANGE "$k" - +;; '
    "esac; done"
)
# Loki's and Prometheus's live answers, asked from the gateway's container on the stack's internal network: Node's
# fetch prints each answer's text, which the scan reads as it reads every file. Two hours back covers the visit. Each
# exits 2, a source that couldn't be read, unless every answer is HTTP's ok and says `success` (an error's body, such
# as Loki's "ingester not ready", would otherwise scan clean); and Loki's, when it returns its limit's 5000 lines,
# since the window was cut short (group 8's fixes' review, I2).
LIVE_STORES = {
    "loki": (
        "(async()=>{const end=Date.now()*1e6,start=end-7200e9,limit=5000;"
        "const q=encodeURIComponent('{service_name=~\".+\"}');"
        "const r=await fetch(`http://loki:3100/loki/api/v1/query_range?query=${q}&start=${start}&end=${end}&limit=${limit}`);"
        "const t=await r.text();const j=JSON.parse(t);"
        "if(!r.ok||j.status!=='success')process.exit(2);"
        "const n=((j.data||{}).result||[]).reduce((a,s)=>a+(s.values||[]).length,0);"
        "if(n>=limit)process.exit(2);"
        "process.stdout.write(t)})().catch(()=>process.exit(2))"
    ),
    "prometheus": (
        "(async()=>{const base='http://prometheus:9090/api/v1';"
        "const get=async(u)=>{const r=await fetch(u);const t=await r.text();const j=JSON.parse(t);"
        "if(!r.ok||j.status!=='success')process.exit(2);return [t,j]};"
        "const [lt,lj]=await get('http://prometheus:9090/api/v1/labels');process.stdout.write(lt+'\\n');"
        "for(const n of lj.data||[]){const [vt]=await get(`${base}/label/${encodeURIComponent(n)}/values`);"
        "process.stdout.write(vt+'\\n')}"
        "})().catch(()=>process.exit(2))"
    ),
}
MARKER_RE = re.compile(r"[A-Za-z0-9-]{16,64}")


class Usage(Exception):
    pass


@dataclass(frozen=True)
class Source:
    name: str
    kind: str  # logs, volume, postgres, clickhouse, valkey, journal, loki, prometheus
    service: str
    argv: tuple[str, ...]
    volume: str | None = None


def host_services(host: str, compose: dict | None = None) -> tuple[str, ...]:
    """The services a host's class runs, as compose holds them (contracts/env-cloud.md §3)."""
    compose = (
        compose
        if compose is not None
        else yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))
    )
    services = compose["services"]
    out = []
    for name, service in services.items():
        profiles = set(service.get("profiles") or [])
        if host == "laptop":
            runs = not profiles or bool(profiles & set(LAPTOP_PROFILES))
        elif host == "ec2":
            # EC2's class: the whole topology but the model server and the local store, and its two doors.
            runs = (not profiles and name != "gateway-state") or "ec2" in profiles
        elif host == "tunnel-end":
            runs = "tunnel-end" in profiles
        else:
            raise Usage(f"the host is laptop, ec2, or tunnel-end, not {host!r}")
        if runs:
            out.append(name)
    return tuple(out)


def plan(
    host: str, project: str = "h4reet-prod", compose: dict | None = None
) -> list[Source]:
    compose = (
        compose
        if compose is not None
        else yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))
    )
    out: list[Source] = []
    for name in host_services(host, compose):
        service = compose["services"][name]
        container = f"{project}-{name}-1"
        out.append(Source(f"{name}.log", "logs", name, ("docker", "logs", container)))
        for v in service.get("volumes") or []:
            if isinstance(v, dict) and v.get("type") == "volume":
                out.append(
                    Source(
                        f"{v['source']}.tar",
                        "volume",
                        name,
                        ("docker", "cp", f"{container}:{v['target']}", "-"),
                        v["source"],
                    )
                )
        if name in POSTGRES:
            database, user = POSTGRES[name]
            out.append(
                Source(
                    f"{name}.sql",
                    "postgres",
                    name,
                    (
                        "docker",
                        "exec",
                        "-u",
                        "postgres",
                        container,
                        "pg_dump",
                        "--data-only",
                        "--no-owner",
                        "-U",
                        user,
                        database,
                    ),
                )
            )
        if name == "clickhouse":
            out.append(
                Source(
                    "clickhouse.tsv",
                    "clickhouse",
                    name,
                    ("docker", "exec", container, "sh", "-c", CLICKHOUSE),
                )
            )
        if name == "valkey":
            out.append(
                Source(
                    "valkey.txt",
                    "valkey",
                    name,
                    ("docker", "exec", container, "sh", "-c", VALKEY),
                )
            )
        if name in LIVE_STORES and JOURNAL[0] in host_services(host, compose):
            out.append(
                Source(
                    f"{name}-live.txt",
                    name,
                    name,
                    (
                        "docker",
                        "exec",
                        f"{project}-{JOURNAL[0]}-1",
                        "node",
                        "-e",
                        LIVE_STORES[name],
                    ),
                )
            )
        if name == JOURNAL[0]:
            out.append(
                Source(
                    "gateway-journal.tar",
                    "journal",
                    name,
                    ("docker", "cp", f"{container}:{JOURNAL[1]}", "-"),
                )
            )
    return out


def check_inputs(marker: str, address: str) -> None:
    if (
        not MARKER_RE.fullmatch(marker)
        or not re.search(r"\d", marker)
        or not re.search(r"[a-z]", marker, re.IGNORECASE)
    ):
        raise Usage(
            "the marker is 16 to 64 letters, digits, and hyphens, with a letter and a digit: one of your own"
        )
    try:
        ipaddress.ip_address(address)
    except ValueError:
        raise Usage("the address isn't an IPv4 or IPv6 address") from None


def _forms(marker: str, address: str) -> tuple[list[bytes], list[re.Pattern[bytes]]]:
    """The marker's forms, as bytes to find; and the address's, as patterns that don't match inside a longer number."""
    markers = {
        marker,
        json.dumps(marker)[1:-1],
        urllib.parse.quote(marker, safe=""),
        "".join(f"%{ord(c):02X}" if c == "-" else c for c in marker),
        "".join(f"%{ord(c):02x}" if c == "-" else c for c in marker),
    }
    ip = ipaddress.ip_address(address)
    texts = {
        str(ip),
        urllib.parse.quote(str(ip), safe=""),
        str(ip).replace(".", "%2E"),
        str(ip).replace(".", "%2e"),
    }
    if ip.version == 4:
        texts |= {f"::ffff:{ip}"}
    else:
        texts |= {ip.exploded}
    patterns = [
        re.compile(rb"(?<![0-9A-Za-z.])" + re.escape(t.encode()) + rb"(?![0-9])")
        for t in texts
    ]
    return [m.encode() for m in markers], patterns


def _blobs(data: bytes, depth: int = 0):
    """The bytes, and what's inside them: a tar stream's members, a gzip member's content, each in turn."""
    yield data
    if depth > 3:
        return
    if data[:2] == b"\x1f\x8b":
        try:
            yield from _blobs(gzip.decompress(data), depth + 1)
        except (OSError, EOFError):
            pass
    if len(data) >= 512 and data[257:262] == b"ustar":
        try:
            with tarfile.open(fileobj=io.BytesIO(data), mode="r:") as tar:
                for member in tar:
                    if member.isfile():
                        f = tar.extractfile(member)
                        if f is not None:
                            yield from _blobs(f.read(), depth + 1)
        except tarfile.TarError:
            pass


def scan(folder: Path, marker: str, address: str) -> dict[str, dict[str, int]]:
    """Each file under the folder that holds the marker or the address, with how many of each: names and counts."""
    check_inputs(marker, address)
    markers, patterns = _forms(marker, address)
    found: dict[str, dict[str, int]] = {}
    for path in sorted(p for p in folder.rglob("*") if p.is_file()):
        m = a = 0
        for blob in _blobs(path.read_bytes()):
            m += sum(blob.count(x) for x in markers)
            a += sum(len(p.findall(blob)) for p in patterns)
        if m or a:
            found[str(path.relative_to(folder))] = {"marker": m, "address": a}
    return found


def collect(
    host: str, out: Path, project: str, docker: tuple[str, ...] = ("docker",)
) -> int:
    out.mkdir(parents=True, exist_ok=True)
    failed = []
    for source in plan(host, project):
        argv = [*docker, *source.argv[1:]]
        result = subprocess.run(argv, capture_output=True, timeout=600, check=False)
        (out / source.name).write_bytes(result.stdout + result.stderr)
        if result.returncode != 0:
            failed.append(source.name)
    for name in failed:
        print(f"visitor scan: couldn't collect {name}", file=sys.stderr)
    return 2 if failed else 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="visitor_scan.py")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("plan", "collect"):
        p = sub.add_parser(name)
        p.add_argument("--host", required=True, choices=("laptop", "ec2", "tunnel-end"))
        p.add_argument("--project", default="h4reet-prod")
        if name == "collect":
            p.add_argument("--out", required=True, type=Path)
    s = sub.add_parser("scan")
    s.add_argument("--marker", required=True)
    s.add_argument("--address", required=True)
    s.add_argument("folder", type=Path)
    args = parser.parse_args(argv)
    try:
        if args.command == "plan":
            for source in plan(args.host, args.project):
                print(f"{source.name}\t{' '.join(source.argv)}")
            return 0
        if args.command == "collect":
            return collect(args.host, args.out, args.project)
        found = scan(args.folder, args.marker, args.address)
    except Usage as exc:
        print(f"visitor scan: {exc}", file=sys.stderr)
        return 2
    for name, counts in found.items():
        print(f"FOUND {name}: marker {counts['marker']}, address {counts['address']}")
    files = sum(1 for p in args.folder.rglob("*") if p.is_file())
    print(
        f"visitor scan: {len(found)} of {files} sources hold the marker or the address"
    )
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
