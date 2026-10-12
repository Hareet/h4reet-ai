"""Tests for deploy/scripts/isolation_probe.py: fixture facts for two stacks, with DNS and TCP stood in for."""

from __future__ import annotations

import importlib.util
import json
import socket
import sys
from pathlib import Path

import pytest
import yaml

REPO = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "isolation_probe", REPO / "deploy" / "scripts" / "isolation_probe.py"
)
assert SPEC and SPEC.loader
probe = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = probe  # dataclasses look their module up here
SPEC.loader.exec_module(probe)


def endpoint(ip: str, *aliases: str) -> dict:
    return {
        "IPAddress": ip,
        "GlobalIPv6Address": "",
        "Aliases": list(aliases),
        "DNSNames": [*aliases, f"c{ip.replace('.', '')}"],
    }


def container(
    stack: str, service: str, networks: dict, exposed: dict | None = None
) -> str:
    name = f"/h4reet-{stack}-{service}-1"
    return "\t".join(
        ["container", stack, service, name, json.dumps(networks), json.dumps(exposed)]
    )


# Two stacks of three services each. prod's addresses are 172.21-23.0.x, dev's 172.31-33.0.x.
FACTS = "\n".join(
    [
        container(
            "prod",
            "edge",
            {
                "h4reet-prod_edge": endpoint("172.21.0.2", "edge"),
                "h4reet-prod_internal": endpoint("172.22.0.2", "edge"),
            },
            {"8080/tcp": {}},
        ),
        container(
            "prod",
            "gateway",
            {
                "h4reet-prod_internal": endpoint("172.22.0.3", "gateway"),
                "h4reet-prod_egress": endpoint("172.23.0.2", "gateway"),
            },
        ),
        container(
            "prod",
            "gateway-state",
            {"h4reet-prod_internal": endpoint("172.22.0.4", "gateway-state")},
            {"5432/tcp": {}},
        ),
        container(
            "dev",
            "edge",
            {
                "h4reet-dev_edge": endpoint("172.31.0.2", "edge"),
                "h4reet-dev_internal": endpoint("172.32.0.2", "edge"),
            },
        ),
        container(
            "dev",
            "gateway",
            {
                "h4reet-dev_internal": endpoint("172.32.0.3", "gateway"),
                "h4reet-dev_egress": endpoint("172.33.0.2", "gateway"),
            },
        ),
        container(
            "dev",
            "gateway-state",
            {"h4reet-dev_internal": endpoint("172.32.0.4", "gateway-state")},
        ),
        *(f"published\tprod\t{port}" for port in range(18000, 18005)),
        *(f"published\tdev\t{port}" for port in range(18100, 18105)),
        "host\t172.32.0.1",
        "host\thost.docker.internal",
    ]
)
INTERNAL = "h4reet-dev_internal"


class Net:
    """Docker's DNS and TCP as seen from a container on one of dev's networks: dev's own containers on that network
    answer, and nothing else does unless a test says so."""

    def __init__(self, network: str = INTERNAL) -> None:
        facts = probe.parse_facts(FACTS)
        self.names: dict[str, list[str]] = {}
        self.open: set[tuple[str, int]] = set()
        for c in facts.of("dev"):
            for ip in c.addresses(network):
                for name in c.names(network):
                    self.names.setdefault(name, []).append(ip)
                for port in c.ports():
                    self.open.add((ip, port))
        self.calls: list[tuple[str, int]] = []

    def resolve(self, name: str) -> list[str]:
        return self.names.get(name, [])

    def connect(self, host: str, port: int) -> str:
        self.calls.append((host, port))
        if (host, port) in self.open:
            return "connected"
        return (
            "refused" if host in ("172.32.0.1", "host.docker.internal") else "timeout"
        )


def run(
    net: Net, network: str = INTERNAL, source: str = "dev", target: str = "prod"
) -> tuple[int, list[str]]:
    lines: list[str] = []
    failed = probe.network_checks(
        probe.parse_facts(FACTS),
        source,
        target,
        network,
        net.resolve,
        net.connect,
        lines.append,
    )
    return failed, lines


def test_isolated_stacks_pass_every_check() -> None:
    net = Net()
    failed, lines = run(net)
    assert failed == 0, lines
    assert [line.split()[:2] for line in lines] == [
        ["PASS", "names"],
        ["PASS", "addresses"],
        ["PASS", "host"],
        ["PASS", "control"],
    ]
    # The shared service names resolve to dev's own containers; prod's container names resolve to nothing.
    assert "resolve to dev's own" in lines[0]
    # Every port of every prod address was tried, and every published port on both host addresses.
    assert ("172.22.0.4", 5432) in net.calls and ("172.21.0.2", 8090) in net.calls
    assert ("host.docker.internal", 18004) in net.calls and (
        "172.32.0.1",
        18000,
    ) in net.calls


def test_a_name_that_resolves_to_the_other_stack_fails() -> None:
    net = Net()
    net.names["h4reet-prod-gateway-1"] = ["172.22.0.3"]
    failed, lines = run(net)
    assert failed == 1
    assert (
        "FAIL names" in lines[0]
        and "h4reet-prod-gateway-1 resolves to 172.22.0.3, prod's" in lines[0]
    )


def test_a_name_resolving_outside_both_stacks_is_only_noted() -> None:
    net = Net()
    # The host's own resolver, answering for a name on the LAN.
    net.names["h4reet-prod-edge-1"] = ["192.168.1.9"]
    failed, lines = run(net)
    assert failed == 0
    assert "1 resolve outside both stacks: h4reet-prod-edge-1 (192.168.1.9)" in lines[0]


def test_an_address_that_accepts_fails() -> None:
    net = Net()
    net.open.add(("172.22.0.4", 5432))
    failed, lines = run(net)
    assert (
        failed == 1 and "FAIL addresses" in lines[1] and "172.22.0.4:5432" in lines[1]
    )


def test_a_published_port_that_answers_through_the_host_fails() -> None:
    net = Net()
    net.open.add(("host.docker.internal", 18001))
    failed, lines = run(net)
    assert (
        failed == 1
        and "FAIL host" in lines[2]
        and "host.docker.internal:18001" in lines[2]
    )


def test_a_probe_that_reaches_nothing_proves_nothing() -> None:
    net = Net()
    net.open.clear()
    failed, lines = run(net)
    assert failed == 1 and lines[-1].startswith("FAIL control")
    assert "so the refusals prove nothing" in lines[-1]


def test_names_are_checked_on_the_internal_network_alone() -> None:
    """Docker's DNS forwards a name it doesn't know from a bridge network to the host's resolvers."""
    net = Net("h4reet-dev_edge")
    failed, lines = run(net, "h4reet-dev_edge")
    assert failed == 0, lines
    assert [line.split()[1] for line in lines] == ["addresses", "host", "control"]


def test_the_other_direction() -> None:
    facts = probe.parse_facts(FACTS)
    names = {
        "edge": ["172.22.0.2"],
        "gateway": ["172.22.0.3"],
        "gateway-state": ["172.22.0.4"],
    }
    open_ = {
        (ip, port)
        for c in facts.of("prod")
        for ip in c.addresses("h4reet-prod_internal")
        for port in c.ports()
    }
    lines: list[str] = []
    failed = probe.network_checks(
        facts,
        "prod",
        "dev",
        "h4reet-prod_internal",
        lambda name: names.get(name, []),
        lambda host, port: "connected" if (host, port) in open_ else "refused",
        lines.append,
    )
    assert failed == 0, lines
    assert "dev's ports 18100-18104 refuse" in lines[2]


def test_no_container_of_the_other_stack_is_a_failure() -> None:
    lines: list[str] = []
    facts = probe.parse_facts(
        "\n".join(ln for ln in FACTS.splitlines() if "\tprod\t" not in ln)
    )
    assert (
        probe.network_checks(
            facts, "dev", "prod", INTERNAL, Net().resolve, Net().connect, lines.append
        )
        == 1
    )
    assert lines == [
        "FAIL facts (dev → prod, h4reet-dev_internal): no container of prod, so nothing was checked"
    ]


@pytest.mark.parametrize(
    "line",
    [
        "container\tprod\tedge",
        "published\tprod\teighteen",
        "secret\tvalue",
        'container\tprod\tedge\t/x\t{"bad json\tnull',
    ],
)
def test_facts_out_of_shape_are_refused(
    line: str, capsys: pytest.CaptureFixture[str]
) -> None:
    assert probe.main(["network", "dev", "prod", INTERNAL], stdin=line + "\n") == 2
    assert "isolation probe: facts line 1" in capsys.readouterr().err


def test_the_ports_tried_are_the_services_own_and_its_images() -> None:
    facts = probe.parse_facts(FACTS)
    (state,) = [c for c in facts.of("prod") if c.service == "gateway-state"]
    assert state.ports() == [5432]
    (edge,) = [c for c in facts.of("prod") if c.service == "edge"]
    assert edge.ports() == [8080, 8081, 8082, 8083, 8084, 8090]


def test_every_listening_service_of_the_topology_has_its_ports() -> None:
    compose = yaml.safe_load((REPO / "deploy/compose.yaml").read_text(encoding="utf-8"))
    for name in compose["services"]:
        assert name in probe.PORTS, (
            f"{name}: isolation_probe.py doesn't know the ports it listens on"
        )


# ---------------------------------------------------------------------------------------------------------------
# Mounts.

CLEAN = (
    "prod\tvolume\th4reet-prod_gateway-state-data\ttrue\n"
    "dev\tvolume\th4reet-dev_gateway-state-data\ttrue\n"
    "prod\tbind\t/home/h/.local/share/h4reet/models\tfalse\n"
    "dev\tbind\t/home/h/.local/share/h4reet/models\tfalse\n"
    "prod\tbind\t/home/h/.local/state/h4reet/prod/gateway\ttrue\n"
    "dev\tbind\t/home/h/.local/state/h4reet/dev/gateway\ttrue\n"
    "prod\ttmpfs\t\ttrue\n"
    "dev\ttmpfs\t\ttrue\n"
)


def mounts(text: str) -> tuple[int, list[str]]:
    lines: list[str] = []
    return probe.mount_checks(text, "prod", "dev", lines.append), lines


def test_only_the_model_cache_is_shared_and_read_only() -> None:
    failed, lines = mounts(CLEAN)
    assert failed == 0
    assert lines == [
        (
            "PASS mounts: 2 volumes, each its own stack's; no writable bind shared; shared read-only: "
            "/home/h/.local/share/h4reet/models"
        )
    ]


@pytest.mark.parametrize(
    ("extra", "why"),
    [
        (
            "dev\tvolume\th4reet-prod_gateway-state-data\tfalse",
            "mounted by both prod and dev",
        ),
        (
            "dev\tbind\t/home/h/.local/state/h4reet/prod/gateway\tfalse",
            "writable by prod",
        ),
        (
            "prod\tvolume\tshared-data\ttrue",
            "outside their own stack's project: shared-data (prod)",
        ),
    ],
)
def test_shared_state_fails(extra: str, why: str) -> None:
    failed, lines = mounts(CLEAN + "\n" + extra)
    assert failed >= 1 and any(why in line for line in lines), lines


def test_mount_lines_out_of_shape_are_refused(
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert probe.main(["mounts", "prod", "dev"], stdin="staging\tbind\t/x\ttrue\n") == 2
    assert probe.main(["mounts", "prod", "dev"], stdin="prod\tbind\t/x\tyes\n") == 2
    assert probe.main(["nothing"], stdin="") == 2
    assert "usage:" in capsys.readouterr().err


def test_the_real_resolver_and_connector_on_loopback() -> None:
    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen(1)
    port = server.getsockname()[1]
    try:
        assert probe.connect("127.0.0.1", port) == "connected"
    finally:
        server.close()
    assert probe.connect("127.0.0.1", port) == "refused"
    assert "127.0.0.1" in probe.resolve("localhost")
    assert probe.resolve("no-such-name.invalid") == []
