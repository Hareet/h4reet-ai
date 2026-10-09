"""The checks behind make isolation-check (spec 000 FR-020, US1-4; plan §1 and §4; quickstart.md §1.7).

deploy/scripts/isolation-check.sh gathers the facts on the host and runs this file twice over:

    python3 -I -B -c "<this file>" network FROM TO NETWORK < facts      (inside a throwaway container on NETWORK)
    python3 -I -B -X pycache_prefix=/dev/null deploy/scripts/isolation_probe.py mounts A B < mounts   (on the host)

network: from a container on one of FROM's networks, nothing of TO answers. The facts, tab-separated, one a line:

    container  <stack>  <service>  <container name>  <its NetworkSettings.Networks, JSON>  <its ExposedPorts, JSON>
    published  <stack>  <host port>
    host       <an address of the host, as this network sees it: the network's gateway, host-gateway>

  - names: on FROM's internal network, none of TO's names (service, container, alias, DNS name) resolves to an
    address of TO's. A name that resolves to FROM's own container is expected: the stacks share service names.
  - addresses: none of TO's container addresses accepts a TCP connection on a port its service listens on.
  - host: none of TO's published ports accepts one on the host's addresses: they listen on the host's 127.0.0.1
    alone (plan §1).
  - control: FROM's own containers on NETWORK resolve and accept, so the refusals above prove isolation, not a probe
    that can reach nothing.

mounts: no named volume, and no writable bind, belongs to both stacks; the sources they share are read-only in both
(the model cache, plan §1). Each stdin line: <stack> <type> <volume name or source> <true if writable>.

Each check prints PASS or FAIL with its figures. Exit 0 when all pass, 1 when any fails, 2 on bad input.
"""

from __future__ import annotations

import concurrent.futures
import json
import socket
import sys
from collections.abc import Callable
from dataclasses import dataclass, field

TIMEOUT_S = 1.5
# What each service of deploy/compose.yaml listens on, beside what its image exposes.
PORTS = {
    "edge": (8080, 8081, 8082, 8083, 8084, 8090),
    "gateway": (8080, 8081),
    "gateway-state": (5432,),
    "model-server-gpu": (8080,),
    "model-server-cpu": (8080,),
    "otel-collector": (4317, 4318, 4319, 8888, 13133),
    "prometheus": (9090,),
    "loki": (3100, 9095),
    "grafana": (3000,),
    "langfuse-web": (3000,),
    "langfuse-worker": (3030,),
    "langfuse-db": (5432,),
    "clickhouse": (8123, 9000, 9363),
    "valkey": (6379,),
    "seaweedfs": (8080, 8333, 8888, 9333, 18080, 18888, 19333),
    "telegram-standin": (8080,),
    "mailpit": (1025, 8025),
}

Resolve = Callable[[str], list[str]]
Connect = Callable[
    [str, int], str
]  # "connected", "refused", "timeout", or "unreachable"


@dataclass
class Container:
    stack: str
    service: str
    name: str
    networks: dict[str, dict] = field(default_factory=dict)
    exposed: list[int] = field(default_factory=list)

    def addresses(self, network: str | None = None) -> list[str]:
        out = []
        for net, settings in self.networks.items():
            if network is None or net == network:
                for key in ("IPAddress", "GlobalIPv6Address"):
                    if settings.get(key):
                        out.append(str(settings[key]))
        return out

    def names(self, network: str | None = None) -> set[str]:
        found = {self.service, self.name}
        for net, settings in self.networks.items():
            if network is None or net == network:
                found.update(settings.get("Aliases") or [])
                found.update(settings.get("DNSNames") or [])
        return {n for n in found if n}

    def ports(self) -> list[int]:
        return sorted({*PORTS.get(self.service, ()), *self.exposed})


@dataclass
class Facts:
    containers: list[Container] = field(default_factory=list)
    published: dict[str, list[int]] = field(default_factory=dict)
    hosts: list[str] = field(default_factory=list)

    def of(self, stack: str) -> list[Container]:
        return [c for c in self.containers if c.stack == stack]


def parse_facts(text: str) -> Facts:
    facts = Facts()
    for number, line in enumerate(text.splitlines(), 1):
        if not line.strip():
            continue
        fields = line.split("\t")
        kind = fields[0]
        try:
            if kind == "container" and len(fields) == 6:
                _, stack, service, name, networks, exposed = fields
                ports = []
                for spec in json.loads(exposed) or {}:
                    port, _, protocol = spec.partition("/")
                    if protocol in ("", "tcp"):
                        ports.append(int(port))
                facts.containers.append(
                    Container(
                        stack,
                        service,
                        name.lstrip("/"),
                        json.loads(networks) or {},
                        ports,
                    )
                )
            elif kind == "published" and len(fields) == 3:
                facts.published.setdefault(fields[1], []).append(int(fields[2]))
            elif kind == "host" and len(fields) == 2:
                facts.hosts.append(fields[1])
            else:
                raise ValueError(kind)
        except (ValueError, TypeError) as error:
            raise ValueError(f"facts line {number}: not a fact ({error})") from None
    return facts


def resolve(name: str) -> list[str]:
    try:
        return sorted(
            {
                info[4][0]
                for info in socket.getaddrinfo(name, None, proto=socket.IPPROTO_TCP)
            }
        )
    except (socket.gaierror, UnicodeError, OSError):
        return []


def connect(host: str, port: int) -> str:
    try:
        with socket.create_connection((host, port), timeout=TIMEOUT_S):
            return "connected"
    except ConnectionRefusedError:
        return "refused"
    except TimeoutError:
        return "timeout"
    except OSError:
        return "unreachable"


def try_all(pairs: list[tuple[str, int]], probe: Connect) -> dict[tuple[str, int], str]:
    if not pairs:
        return {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=64) as pool:
        return dict(zip(pairs, pool.map(lambda p: probe(*p), pairs), strict=True))


def tally(results: dict[tuple[str, int], str]) -> str:
    counts = {
        k: sum(v == k for v in results.values())
        for k in ("refused", "timeout", "unreachable")
    }
    return ", ".join(f"{n} {k}" for k, n in counts.items())


def network_checks(
    facts: Facts,
    source: str,
    target: str,
    network: str,
    lookup: Resolve = resolve,
    probe: Connect = connect,
    say: Callable[[str], None] = print,
) -> int:
    where = f"{source} → {target}, {network}"
    failed = 0
    theirs, ours = facts.of(target), facts.of(source)
    if not theirs:
        say(f"FAIL facts ({where}): no container of {target}, so nothing was checked")
        return 1
    their_ips = {ip for c in theirs for ip in c.addresses()}
    our_ips = {ip for c in ours for ip in c.addresses()}

    # Names, on the internal network only: Docker's DNS forwards a name it doesn't know from a bridge network to the
    # host's resolvers, and internal answers for every service of the stack.
    if network.endswith("_internal"):
        names = sorted({n for c in theirs for n in c.names()})
        theirs_hit, own, elsewhere = [], 0, []
        for name in names:
            found = set(lookup(name))
            if found & their_ips:
                theirs_hit.append(
                    f"{name} resolves to {', '.join(sorted(found & their_ips))}, {target}'s"
                )
            elif found and found <= our_ips:
                own += 1
            elif found:
                elsewhere.append(f"{name} ({', '.join(sorted(found))})")
        if theirs_hit:
            failed += 1
            say(f"FAIL names ({where}): {'; '.join(theirs_hit)}")
        else:
            note = (
                f"; {len(elsewhere)} resolve outside both stacks: {', '.join(elsewhere)}"
                if elsewhere
                else ""
            )
            say(
                f"PASS names ({where}): none of {target}'s {len(names)} names resolves to {target}; {own} resolve to {source}'s own{note}"
            )

    # Addresses: every port each of the other stack's services listens on, at every address it has.
    pairs = sorted(
        {(ip, port) for c in theirs for ip in c.addresses() for port in c.ports()}
    )
    results = try_all(pairs, probe)
    open_ = [f"{ip}:{port}" for (ip, port), r in results.items() if r == "connected"]
    if open_:
        failed += 1
        say(
            f"FAIL addresses ({where}): {target} accepted connections at {', '.join(open_)}"
        )
    else:
        say(
            f"PASS addresses ({where}): none of {len(pairs)} ports at {target}'s {len(their_ips)} addresses accepted ({tally(results)})"
        )

    # The host: the other stack's published ports, on each address of the host this network can try.
    ports = sorted(set(facts.published.get(target, [])))
    if not ports:
        failed += 1
        say(f"FAIL host ({where}): {target} publishes no port, so edge isn't running")
    else:
        pairs = [(host, port) for host in facts.hosts for port in ports]
        results = try_all(pairs, probe)
        open_ = [
            f"{host}:{port}" for (host, port), r in results.items() if r == "connected"
        ]
        if open_:
            failed += 1
            say(
                f"FAIL host ({where}): {target}'s published ports answered at {', '.join(open_)}"
            )
        else:
            span = f"{ports[0]}-{ports[-1]}" if len(ports) > 1 else str(ports[0])
            say(
                f"PASS host ({where}): {target}'s ports {span} refuse on {', '.join(facts.hosts) or 'no address'} ({tally(results)})"
            )

    # The control: this stack's own containers on this network answer.
    mine = [c for c in ours if c.addresses(network)]
    if not mine:
        say(
            f"FAIL control ({where}): no container of {source} on {network}, so the refusals prove nothing"
        )
        return failed + 1
    resolved = [
        c.service for c in mine if set(lookup(c.service)) & set(c.addresses(network))
    ]
    pairs = sorted(
        {(ip, port) for c in mine for ip in c.addresses(network) for port in c.ports()}
    )
    reached = [
        f"{ip}:{port}"
        for (ip, port), r in try_all(pairs, probe).items()
        if r == "connected"
    ]
    if not reached or not resolved:
        failed += 1
        say(
            f"FAIL control ({where}): {source}'s own containers didn't answer ({len(resolved)} resolved, "
            f"{len(reached)} accepted), so the refusals prove nothing"
        )
    else:
        say(
            f"PASS control ({where}): {source}'s {', '.join(sorted(set(resolved)))} resolve, and {len(reached)} of its ports accept"
        )
    return failed


def mount_checks(
    text: str, first: str, second: str, say: Callable[[str], None] = print
) -> int:
    seen: dict[tuple[str, str], dict[str, bool]] = {}
    for number, line in enumerate(text.splitlines(), 1):
        if not line.strip():
            continue
        fields = line.split("\t")
        if (
            len(fields) != 4
            or fields[0] not in (first, second)
            or fields[3] not in ("true", "false")
        ):
            raise ValueError(
                f"mounts line {number}: not <stack> <type> <source> <true|false>"
            )
        stack, kind, source, writable = fields
        if kind not in ("bind", "volume"):
            continue  # a tmpfs is the container's own memory, never shared
        mode = seen.setdefault((kind, source), {})
        mode[stack] = mode.get(stack, False) or writable == "true"
    failed = 0
    shared = {
        key: modes for key, modes in seen.items() if set(modes) == {first, second}
    }
    for (kind, source), modes in sorted(shared.items()):
        if kind == "volume":
            failed += 1
            say(
                f"FAIL mounts: the volume {source} is mounted by both {first} and {second}"
            )
        elif any(modes.values()):
            writers = " and ".join(s for s, w in modes.items() if w)
            failed += 1
            say(f"FAIL mounts: {source} is shared, and writable by {writers}")
    read_only = sorted(
        source
        for (kind, source), modes in shared.items()
        if kind != "volume" and not any(modes.values())
    )
    misnamed = sorted(
        f"{source} ({stack})"
        for (kind, source), modes in seen.items()
        if kind == "volume"
        for stack in modes
        if not source.startswith(f"h4reet-{stack}_")
    )
    if misnamed:
        failed += 1
        say(
            f"FAIL mounts: volumes outside their own stack's project: {', '.join(misnamed)}"
        )
    if not failed:
        note = f"; shared read-only: {', '.join(read_only)}" if read_only else ""
        volumes = sum(1 for kind, _ in seen if kind == "volume")
        say(
            f"PASS mounts: {volumes} volumes, each its own stack's; no writable bind shared{note}"
        )
    return failed


def main(argv: list[str], stdin: str | None = None) -> int:
    text = sys.stdin.read() if stdin is None else stdin
    try:
        if len(argv) == 4 and argv[0] == "network":
            return 1 if network_checks(parse_facts(text), *argv[1:]) else 0
        if len(argv) == 3 and argv[0] == "mounts":
            return 1 if mount_checks(text, argv[1], argv[2]) else 0
    except ValueError as error:
        print(f"isolation probe: {error}", file=sys.stderr)
        return 2
    print(
        "usage: isolation_probe.py network FROM TO NETWORK < facts | mounts A B < mounts",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
