"""Tests for deploy/scripts/egress_proxy.py (spec 001 tasks.md T044, T049; FR-051; contracts/tunnel.md §6; research.md
R-10): a cloud host's one way out, an HTTPS CONNECT proxy whose allowlist is the host's
deploy/hosts/<host>/egress-allowlist.txt, which the disclosure's rows name.

  - a host matches an entry exactly, or a `*` stands for one DNS label or the rest of one, never a dot;
  - only CONNECT, only to 443, only to an allowed name, and only to a public address once resolved, so no name can
    point it at the instance's metadata or the VPC;
  - an allowed CONNECT is tunnelled both ways; each decision is one log line, with the host, the port, and the
    verdict, never a client's address or a byte of the tunnel.

The network is stood in for: the resolver and the address check are the proxy's arguments, and the test's upstream
listens on the sandbox's loopback.
"""

from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
SPEC = importlib.util.spec_from_file_location("egress_proxy", HERE / "egress_proxy.py")
assert SPEC and SPEC.loader
ep = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ep
SPEC.loader.exec_module(ep)

PATTERNS = [
    "api.ecr.us-east-1.amazonaws.com",
    "*.dkr.ecr.us-east-1.amazonaws.com",
    "h4reet-ai-releases-*.s3.us-east-1.amazonaws.com",
]


@pytest.mark.parametrize(
    ("host", "want"),
    [
        ("api.ecr.us-east-1.amazonaws.com", True),
        ("API.ECR.us-east-1.amazonaws.com.", True),
        ("x123.dkr.ecr.us-east-1.amazonaws.com", True),
        ("a.b.dkr.ecr.us-east-1.amazonaws.com", False),
        ("dkr.ecr.us-east-1.amazonaws.com", False),
        ("h4reet-ai-releases-abc123.s3.us-east-1.amazonaws.com", True),
        ("h4reet-ai-releases-.s3.us-east-1.amazonaws.com", True),
        ("other-bucket.s3.us-east-1.amazonaws.com", False),
        ("h4reet-ai-releases-x.evil.s3.us-east-1.amazonaws.com", False),
        ("api.ecr.us-east-1.amazonaws.com.evil.example", False),
        ("evilapi.ecr.us-east-1.amazonaws.com", False),
        ("", False),
        ("api.ecr.us-east-1.amazonaws.com:443", False),
    ],
)
def test_the_allowlists_match(host: str, want: bool) -> None:
    assert ep.allowed(host, PATTERNS) is want


def test_the_hosts_allowlist_parses_and_holds_only_names() -> None:
    patterns = ep.load_allowlist(
        REPO / "deploy" / "hosts" / "tunnel-end" / "egress-allowlist.txt"
    )
    assert patterns and all(":" not in p and " " not in p for p in patterns)


@pytest.mark.parametrize(
    ("address", "public"),
    [
        ("169.254.169.254", False),
        ("10.42.0.20", False),
        ("127.0.0.1", False),
        ("172.30.0.1", False),
        ("100.64.0.1", False),
        ("::1", False),
        ("fd00::1", False),
        ("52.94.133.131", True),
        ("2600:1f18::1", True),
    ],
)
def test_only_public_addresses_are_reached(address: str, public: bool) -> None:
    assert ep.is_public(address) is public


async def upstream() -> tuple[asyncio.AbstractServer, int, list[bytes]]:
    seen: list[bytes] = []

    async def echo(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        data = await reader.read(64)
        seen.append(data)
        writer.write(b"echo:" + data)
        await writer.drain()
        writer.close()

    server = await asyncio.start_server(echo, "127.0.0.1", 0)
    return server, server.sockets[0].getsockname()[1], seen


async def through(proxy: ep.Proxy, request: bytes, payload: bytes = b"") -> bytes:
    server = await asyncio.start_server(proxy.handle, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    reader, writer = await asyncio.open_connection("127.0.0.1", port)
    writer.write(request)
    await writer.drain()
    head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 5)
    body = b""
    if head.startswith(b"HTTP/1.1 200") and payload:
        writer.write(payload)
        await writer.drain()
        body = await asyncio.wait_for(reader.read(64), 5)
    writer.close()
    server.close()
    await server.wait_closed()
    return head + body


def connect(host: str, port: int = 443) -> bytes:
    return f"CONNECT {host}:{port} HTTP/1.1\r\nHost: {host}:{port}\r\n\r\n".encode()


def test_an_allowed_connect_is_tunnelled_both_ways(
    capsys: pytest.CaptureFixture[str],
) -> None:
    async def go() -> tuple[bytes, list[bytes]]:
        server, port, seen = await upstream()
        proxy = ep.Proxy(
            PATTERNS,
            resolve=lambda host: ["127.0.0.1"],
            public=lambda address: True,
            upstream_port=lambda port_: port,
        )
        got = await through(proxy, connect("api.ecr.us-east-1.amazonaws.com"), b"hello")
        server.close()
        await server.wait_closed()
        return got, seen

    got, seen = asyncio.run(go())
    assert got.startswith(b"HTTP/1.1 200 Connection established\r\n\r\n")
    assert got.endswith(b"echo:hello")
    assert seen == [b"hello"]
    log = capsys.readouterr().err
    assert "allowed api.ecr.us-east-1.amazonaws.com:443" in log
    assert "127.0.0.1" not in log and "hello" not in log


@pytest.mark.parametrize(
    ("request_", "status"),
    [
        (
            b"GET http://api.ecr.us-east-1.amazonaws.com/ HTTP/1.1\r\nHost: x\r\n\r\n",
            b"405",
        ),
        (connect("example.com"), b"403"),
        (connect("api.ecr.us-east-1.amazonaws.com", 80), b"403"),
        (b"CONNECT nonsense HTTP/1.1\r\n\r\n", b"400"),
    ],
)
def test_everything_else_is_refused(
    request_: bytes, status: bytes, capsys: pytest.CaptureFixture[str]
) -> None:
    proxy = ep.Proxy(
        PATTERNS, resolve=lambda host: ["52.94.133.131"], public=lambda a: True
    )
    got = asyncio.run(through(proxy, request_))
    assert got.startswith(b"HTTP/1.1 " + status), got
    assert "refused" in capsys.readouterr().err


def test_a_name_that_resolves_inside_is_refused(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # A DNS answer pointing an allowed name at the metadata service, or the VPC, is never followed.
    proxy = ep.Proxy(PATTERNS, resolve=lambda host: ["169.254.169.254"])
    got = asyncio.run(through(proxy, connect("api.ecr.us-east-1.amazonaws.com")))
    assert got.startswith(b"HTTP/1.1 403")
    assert "not public" in capsys.readouterr().err
