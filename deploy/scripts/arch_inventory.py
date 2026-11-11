#!/usr/bin/env python3
"""make arch-inventory (spec 001, tasks.md T015 and T016; research.md R-33 and R-04; contracts/env-cloud.md §3).

    python3 -I -B -X pycache_prefix=/dev/null deploy/scripts/arch_inventory.py [--json]

For every image deploy/images.lock pins, it reads the image's index from the store of the engine docker would use, and
lists the platforms the index's image manifests name, whether linux/arm64 is among them, and the hosts the image runs
on, by contracts/env-cloud.md §3. Then each cloud host's answer: EC2 is Graviton only if every image it runs has an
arm64 build (R-04); the tunnel end is a t4g.micro, arm64 already, so every image it runs must have one.

Offline, against the store alone: one GET /images/{name}/json?manifests=1 an image (the Engine API's index view, from
1.48), which reads what the store holds and asks no registry. With the containerd image store, which the agents' engine
and the Author's host Docker both use, the store keeps each pinned image's index, platforms whose content was never
pulled included (deploy/agents-engine/engine.sh seed keeps every platform the host holds). `docker buildx imagetools
inspect`, which the plan first named, asks the registry, so it isn't used (plan.md §16, group 2's departures). Nothing
here pulls, loads, or tags: GET is the only method it sends.

Which engine: the one DOCKER_HOST names, as the docker CLI reads it. unix://… (the default, /var/run/docker.sock), or
tcp://host:port with DOCKER_TLS_VERIFY set, whose client certificates are where the CLI finds them: DOCKER_CERT_PATH,
else DOCKER_CONFIG, else ~/.docker. A plain tcp:// engine, any other scheme, or, without DOCKER_HOST, a context other
than the default (DOCKER_CONTEXT, or the currentContext in the CLI's config.json) is refused, since this script doesn't
read contexts and couldn't then be sure it reads the engine the CLI would. Inside the agent sandbox, make arch-inventory runs
itself again through deploy/agents-engine/docker-relay, which sets those for the agents' engine.

Standard library only, by path through PY_HOST, never with -m (research.md R-35). It prints names, platforms, and
figures: no payload, credential, or certificate path.

Exit codes: 0 every image a cloud host runs was read; 1 one wasn't (absent from this store, no index view, or the
engine answered an error), and that host's answer is "unknown"; 2 a refusal: an engine it can't name for certain, an
engine that doesn't answer, or a pinned image with no hosts row here.
"""

from __future__ import annotations

import argparse
import http.client
import json
import os
import re
import socket
import ssl
import sys
import urllib.parse
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TextIO

ROOT = Path(__file__).resolve().parents[2]
LOCK = ROOT / "deploy" / "images.lock"
API = "v1.48"  # the first Engine API version whose image inspect takes manifests (moby 28.0)
TIMEOUT_S = 30
MAX_BODY = 4 * 1024 * 1024
DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")

# contracts/env-cloud.md §3, by deploy/images.lock's service column: the hosts each pinned image runs on. "laptop" is
# the laptop's prod, "ec2" EC2, "tunnel-end" the tunnel end, and "dev" the laptop's dev and the agents' dev-cpu. A build
# base runs as the images built from it, which its note names. A new lock line needs its row here, or the script
# refuses (exit 2), so no image goes uncounted.
HOSTS: dict[str, tuple[tuple[str, ...], str]] = {
    "edge": (("laptop", "ec2", "dev"), "and the web image's runtime base"),
    "model-server-gpu": (("laptop", "dev"), "the gpu profile"),
    "model-server-cpu": (("dev",), "dev-cpu's cpu profile"),
    "gateway-state": (("dev",), "prod's meter is the shared state"),
    "otel-collector": (
        ("laptop", "ec2", "tunnel-end", "dev"),
        "and the tunnel end's small collector",
    ),
    "langfuse-web": (("laptop", "ec2", "dev"), ""),
    "langfuse-worker": (("laptop", "ec2", "dev"), ""),
    "langfuse-db": (("laptop", "ec2", "dev"), "Langfuse's store"),
    "clickhouse": (("laptop", "ec2", "dev"), "Langfuse's store"),
    "valkey": (("laptop", "ec2", "dev"), "Langfuse's store"),
    "seaweedfs": (("laptop", "ec2", "dev"), "Langfuse's store"),
    "prometheus": (("laptop", "ec2", "dev"), ""),
    "loki": (("laptop", "ec2", "dev"), ""),
    "grafana": (("laptop", "ec2", "dev"), ""),
    "mailpit": (("dev",), "the dev-receivers profile"),
    "base:node": (("laptop", "ec2", "dev"), "built into the gateway and web images"),
    "base:python": (("dev",), "built into the breach probe and the Telegram stand-in"),
    "base:ubuntu": ((), "the devcontainer's base"),
    "base:lambda-python": (
        (),
        "the three functions' base, for arm64: AWS Lambda runs them",
    ),
    "tool:uv": ((), "the gate and the devcontainer"),
    "tool:ruff": ((), "the gate and the devcontainer"),
    "tool:gitleaks": ((), "the gate"),
    "probe:cuda": (("laptop",), "preflight's GPU probe"),
}
CLOUD_HOSTS = ("ec2", "tunnel-end")
# What each host's answer adds, so nobody reads the tunnel end's "yes" as covering images that don't exist yet.
HOST_NOTES = {
    "ec2": "EC2 can be Graviton only when this is yes, research.md R-04",
    "tunnel-end": "of what is pinned today; its tunnel, relay, and sink images arrive in groups 5 and 8",
}


class Refusal(Exception):
    """Exit 2."""


@dataclass(frozen=True)
class Pin:
    service: str
    repository: str
    tag: str
    digest: str

    @property
    def pinned(self) -> bool:
        return bool(DIGEST.match(self.digest))

    @property
    def ref(self) -> str:
        """repository:tag@digest, as the lock pins it and the engine resolves it."""
        return (
            f"{self.repository}:{self.tag}@{self.digest}"
            if self.pinned
            else f"{self.repository}:{self.tag}"
        )

    @property
    def name(self) -> str:
        return f"{self.repository}:{self.tag}"


@dataclass(frozen=True)
class Row:
    service: str
    image: str
    status: str  # read, absent, no-index, error, unpinned
    platforms: list[str] | None
    hosts: tuple[str, ...]
    via: str

    @property
    def arm64(self) -> bool | None:
        return has_arm64(self.platforms)


@dataclass(frozen=True)
class Verdict:
    answer: str  # yes, no, unknown
    lacking: list[str]
    unknown: list[str]


@dataclass(frozen=True)
class Endpoint:
    kind: str  # unix or tls
    path: str = ""
    host: str = ""
    port: int = 0
    certs: Path | None = None

    def describe(self) -> str:
        return (
            f"unix://{self.path}"
            if self.kind == "unix"
            else f"tcp://{self.host}:{self.port}, over TLS"
        )


Fetch = Callable[[str], tuple[int, Any]]


# --- the lock and the index ---------------------------------------------------------------------------------------


def parse_lock(text: str) -> list[Pin]:
    """deploy/images.lock's lines: service, repository, tag, digest, registry, checked (its header)."""
    pins = []
    for line in text.splitlines():
        fields = line.split()
        if not fields or fields[0].startswith("#") or len(fields) < 4:
            continue
        pins.append(Pin(*fields[:4]))
    return pins


def _platform_name(platform: Any) -> str | None:
    if not isinstance(platform, Mapping):
        return None
    os_, arch = platform.get("os"), platform.get("architecture")
    if (
        not isinstance(os_, str)
        or not isinstance(arch, str)
        or not os_
        or not arch
        or "unknown" in (os_, arch)
    ):
        return None
    variant = platform.get("variant")
    return (
        f"{os_}/{arch}/{variant}"
        if isinstance(variant, str) and variant
        else f"{os_}/{arch}"
    )


def platforms_of(doc: Any) -> list[str] | None:
    """The platforms an index's image manifests name, from the store's manifests view: each manifest's own platform
    where its content is local (ImageData), else the index's descriptor's. Attestations and unknown/unknown entries
    aren't builds. None when the answer holds no manifests view, so the index can't be read from this store."""
    manifests = doc.get("Manifests") if isinstance(doc, Mapping) else None
    if not isinstance(manifests, list) or not manifests:
        return None
    names: set[str] = set()
    for manifest in manifests:
        if not isinstance(manifest, Mapping) or manifest.get("Kind") == "attestation":
            continue
        data = manifest.get("ImageData")
        descriptor = manifest.get("Descriptor")
        name = _platform_name(
            data.get("Platform") if isinstance(data, Mapping) else None
        ) or _platform_name(
            descriptor.get("platform") if isinstance(descriptor, Mapping) else None
        )
        if name:
            names.add(name)
    return sorted(names)


def has_arm64(platforms: Sequence[str] | None) -> bool | None:
    if platforms is None:
        return None
    return any(
        name == "linux/arm64" or name.startswith("linux/arm64/") for name in platforms
    )


def inventory(pins: Sequence[Pin], fetch: Fetch) -> list[Row]:
    rows = []
    for pin in pins:
        hosts, via = HOSTS[pin.service]
        if not pin.pinned:
            rows.append(Row(pin.service, pin.name, "unpinned", None, hosts, via))
            continue
        status, doc = fetch(pin.ref)
        if status == 404:
            rows.append(Row(pin.service, pin.name, "absent", None, hosts, via))
        elif status != 200:
            rows.append(Row(pin.service, pin.name, "error", None, hosts, via))
        else:
            platforms = platforms_of(doc)
            rows.append(
                Row(
                    pin.service,
                    pin.name,
                    "read" if platforms is not None else "no-index",
                    platforms,
                    hosts,
                    via,
                )
            )
    return rows


def verdict(rows: Sequence[Row], host: str) -> Verdict:
    mine = [row for row in rows if host in row.hosts]
    lacking = [row.service for row in mine if row.arm64 is False]
    unknown = [row.service for row in mine if row.arm64 is None]
    answer = "no" if lacking else "unknown" if unknown else "yes"
    return Verdict(answer, lacking, unknown)


# --- the engine ---------------------------------------------------------------------------------------------------


def current_context(environ: Mapping[str, str], home: Path) -> str:
    """The context the CLI's config names (its currentContext), or "" for none. The config is where the CLI finds it:
    DOCKER_CONFIG, else ~/.docker. A missing or empty file names none (the agent sandbox shows a denied file empty); one
    that can't be read or parsed is refused, never taken for the default."""
    path = Path(environ.get("DOCKER_CONFIG") or home / ".docker") / "config.json"
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""
    except (OSError, UnicodeDecodeError) as error:
        raise Refusal(
            f"docker's config, {path}, can't be read ({type(error).__name__}), so its context isn't known"
        ) from None
    if not text.strip():
        return ""
    try:
        doc = json.loads(text)
    except ValueError:
        raise Refusal(
            f"docker's config, {path}, isn't JSON, so its context isn't known"
        ) from None
    named = doc.get("currentContext", "") if isinstance(doc, Mapping) else ""
    return named if isinstance(named, str) else ""


def endpoint(environ: Mapping[str, str], home: Path) -> Endpoint:
    """The engine docker would use, from DOCKER_HOST as the CLI reads it, or a refusal. DOCKER_HOST wins over any
    context, as it does for the CLI; without it, a context other than the default, named by DOCKER_CONTEXT or by the
    CLI's config (`docker context use`), is refused, since this script doesn't read contexts (T018's review)."""
    host = environ.get("DOCKER_HOST", "")
    if not host:
        named = environ.get("DOCKER_CONTEXT") or current_context(environ, home)
        if named and named != "default":
            raise Refusal(
                f"docker's context is {named!r}, which this script doesn't read: set DOCKER_HOST to its engine"
            )
        return Endpoint("unix", path="/var/run/docker.sock")
    if host.startswith("unix://"):
        path = host.removeprefix("unix://")
        if not path.startswith("/"):
            raise Refusal(f"DOCKER_HOST {host}: a unix socket by its absolute path")
        return Endpoint("unix", path=path)
    if host.startswith("tcp://"):
        if not environ.get("DOCKER_TLS_VERIFY"):
            raise Refusal(
                f"DOCKER_HOST {host} without DOCKER_TLS_VERIFY: an engine on tcp:// is read over mutual TLS"
            )
        match = re.fullmatch(
            r"tcp://([A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\]):([0-9]{1,5})/?", host
        )
        if not match:
            raise Refusal(f"DOCKER_HOST {host}: tcp://host:port")
        certs = (
            environ.get("DOCKER_CERT_PATH")
            or environ.get("DOCKER_CONFIG")
            or str(home / ".docker")
        )
        return Endpoint(
            "tls",
            host=match.group(1).strip("[]"),
            port=int(match.group(2)),
            certs=Path(certs),
        )
    raise Refusal(f"DOCKER_HOST {host}: unix:// or tcp:// only")


def request_path(ref: str) -> str:
    """The one request an image takes: its inspect answer, with the index's manifests (Engine API 1.48)."""
    return f"/{API}/images/{urllib.parse.quote(ref, safe='/:@')}/json?manifests=1"


class _UnixConnection(http.client.HTTPConnection):
    def __init__(self, path: str) -> None:
        super().__init__("localhost", timeout=TIMEOUT_S)
        self._path = path

    def connect(self) -> None:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(TIMEOUT_S)
        sock.connect(self._path)
        self.sock = sock


def _connection(ep: Endpoint) -> http.client.HTTPConnection:
    if ep.kind == "unix":
        return _UnixConnection(ep.path)
    assert ep.certs is not None
    context = ssl.create_default_context(cafile=str(ep.certs / "ca.pem"))
    context.load_cert_chain(str(ep.certs / "cert.pem"), str(ep.certs / "key.pem"))
    return http.client.HTTPSConnection(
        ep.host, ep.port, context=context, timeout=TIMEOUT_S
    )


def engine_fetch(
    ep: Endpoint, connect: Callable[[], http.client.HTTPConnection] | None = None
) -> Fetch:
    """fetch(ref) -> (status, document) from the engine, one connection a request (connect: the tests' own). A transport
    failure is a refusal: an engine that doesn't answer can't say what its store holds."""
    connect = connect or (lambda: _connection(ep))

    def fetch(ref: str) -> tuple[int, Any]:
        try:
            conn = connect()
            try:
                conn.request(
                    "GET", request_path(ref), headers={"Accept": "application/json"}
                )
                response = conn.getresponse()
                body = response.read(MAX_BODY + 1)
            finally:
                conn.close()
        except (OSError, ssl.SSLError, http.client.HTTPException) as error:
            raise Refusal(
                f"the engine at {ep.describe()} didn't answer: {type(error).__name__}"
            ) from None
        if response.status != 200:
            return response.status, None
        if len(body) > MAX_BODY:
            return 0, None
        try:
            return 200, json.loads(body)
        except ValueError:
            return 0, None

    return fetch


# --- the report ---------------------------------------------------------------------------------------------------

STATUS_TEXT = {
    "absent": "absent from this store",
    "no-index": "no index view from this engine",
    "error": "the engine answered an error",
    "unpinned": "no digest yet in deploy/images.lock",
}


def mark(arm64: bool | None) -> str:
    return "?" if arm64 is None else "yes" if arm64 else "no"


def answer_line(host: str, v: Verdict) -> str:
    text = f"{host}: {v.answer}"
    if v.lacking:
        text += f"; lacking linux/arm64: {', '.join(v.lacking)}"
    if v.unknown:
        text += f"; not read: {', '.join(v.unknown)}"
    return f"{text} ({HOST_NOTES[host]})"


def short(image: str, width: int = 56) -> str:
    """An image's name cut to the column, its tag kept: the lock and the JSON record hold it whole."""
    return image if len(image) <= width else "…" + image[-(width - 1) :]


def table(rows: Sequence[Row], ep: Endpoint) -> list[str]:
    lines = [
        (
            f"arch-inventory: {len(rows)} images from deploy/images.lock, read from the store of the engine at "
            f"{ep.describe()}, never a registry"
        ),
        f"{'service':<17} {'arm64':<5}  {'hosts':<30} {'image':<56} platforms, or why not read",
    ]
    for row in rows:
        what = (
            ", ".join(row.platforms)
            if row.platforms is not None
            else STATUS_TEXT.get(row.status, row.status)
        )
        hosts = ", ".join(row.hosts) if row.hosts else "none"
        lines.append(
            f"{row.service:<17} {mark(row.arm64):<5}  {hosts:<30} {short(row.image):<56} {what}"
        )
    lines.append("every cloud host's images have linux/arm64:")
    lines.extend(f"  {answer_line(host, verdict(rows, host))}" for host in CLOUD_HOSTS)
    return lines


def record(rows: Sequence[Row], ep: Endpoint) -> dict[str, Any]:
    return {
        "h4_arch_inventory": 1,
        "source": f"the store of the engine at {ep.describe()}, never a registry",
        "images": [
            {
                "service": row.service,
                "image": row.image,
                "status": row.status,
                "platforms": row.platforms,
                "arm64": row.arm64,
                "hosts": list(row.hosts),
                "via": row.via,
            }
            for row in rows
        ],
        "hosts": {
            host: {"answer": v.answer, "lacking": v.lacking, "unknown": v.unknown}
            for host in CLOUD_HOSTS
            for v in [verdict(rows, host)]
        },
    }


def main(
    argv: list[str] | None = None,
    *,
    environ: Mapping[str, str] | None = None,
    fetch: Fetch | None = None,
    out: TextIO | None = None,
    lock_text: str | None = None,
    home: Path | None = None,
) -> int:
    out = out or sys.stdout
    environ = os.environ if environ is None else environ
    parser = argparse.ArgumentParser(
        prog="arch_inventory.py", description=__doc__.splitlines()[0]
    )
    parser.add_argument(
        "--json", action="store_true", help="print the record as one JSON document"
    )
    args = parser.parse_args(argv)
    try:
        pins = parse_lock(
            lock_text if lock_text is not None else LOCK.read_text(encoding="utf-8")
        )
        unknown = [pin.service for pin in pins if pin.service not in HOSTS]
        if unknown:
            raise Refusal(
                f"deploy/images.lock pins {', '.join(unknown)}, which has no hosts row in this script: add one from "
                "contracts/env-cloud.md §3"
            )
        ep = endpoint(environ, home or Path.home())
        rows = inventory(pins, fetch or engine_fetch(ep))
    except Refusal as refusal:
        print(f"arch_inventory.py: {refusal}", file=out)
        print("arch_inventory.py: exit 2: refused; nothing was read", file=out)
        return 2
    if args.json:
        print(json.dumps(record(rows, ep), indent=2), file=out)
    else:
        print("\n".join(table(rows, ep)), file=out)
    unread = [
        service for host in CLOUD_HOSTS for service in verdict(rows, host).unknown
    ]
    return 1 if unread else 0


if __name__ == "__main__":
    sys.exit(main())
