"""Tests for deploy/scripts/sni_proxy.py (spec 001 tasks.md T086, T087; FR-051; contracts/tunnel.md §6): EC2's gateway's
one way out. nftables sends each container's 443 and 465 to it; it reads the name the TLS hello asks for and nothing
after it, and connects to that name if the allowlist holds it (443) or it is the alerts mailbox's SMTP host (465).

  - the name comes from a real ClientHello's server_name; anything that isn't a hello with a name is refused;
  - 443 to an allowed name alone, 465 to the SMTP host alone, and only to public addresses once resolved;
  - an allowed hello is spliced both ways, the hello first; each decision is one log line, with the name, the port, and
    the verdict, never a client's address or a byte of the stream.

The network is stood in for: the resolver and the address check are the proxy's arguments, and the test's upstream
listens on the sandbox's loopback. The hello is the standard library's own ssl client's.
"""

from __future__ import annotations

import asyncio
import importlib.util
import ssl
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("sni_proxy", HERE / "sni_proxy.py")
assert SPEC and SPEC.loader
sp = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = sp
SPEC.loader.exec_module(sp)

PATTERNS = ["api.anthropic.com", "bedrock-runtime.us-east-1.amazonaws.com"]


def hello(name: str | None) -> bytes:
    """The first record an ssl client writes for server_hostname=name, with nothing sent anywhere."""
    context = ssl.create_default_context()
    incoming, outgoing = ssl.MemoryBIO(), ssl.MemoryBIO()
    tls = context.wrap_bio(incoming, outgoing, server_side=False, server_hostname=name)
    if name is None:
        context.check_hostname = False
        tls = context.wrap_bio(incoming, outgoing, server_side=False)
    with pytest.raises(ssl.SSLWantReadError):
        tls.do_handshake()
    return outgoing.read()


@pytest.mark.parametrize(
    "name", ["api.anthropic.com", "Bedrock-Runtime.US-East-1.amazonaws.com"]
)
def test_the_name_is_the_hellos_server_name(name: str) -> None:
    assert sp.server_name(hello(name)) == name.lower()


@pytest.mark.parametrize(
    "data",
    [b"", b"GET / HTTP/1.1\r\n\r\n", b"\x16\x03\x01\x00\x05\x02\x00\x00\x00\x00"],
)
def test_anything_but_a_hello_with_a_name_has_none(data: bytes) -> None:
    assert sp.server_name(data) is None


def test_a_hello_without_a_name_has_none() -> None:
    assert sp.server_name(hello(None)) is None


async def upstream() -> tuple[asyncio.AbstractServer, int, list[bytes]]:
    seen: list[bytes] = []

    async def echo(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        data = await reader.read(65536)
        seen.append(data)
        writer.write(b"echo:" + data[:5])
        await writer.drain()
        writer.close()

    server = await asyncio.start_server(echo, "127.0.0.1", 0)
    return server, server.sockets[0].getsockname()[1], seen


async def through(proxy: sp.Proxy, data: bytes, port: int) -> bytes:
    server = await asyncio.start_server(
        lambda r, w: proxy.handle(r, w, port), "127.0.0.1", 0
    )
    listen = server.sockets[0].getsockname()[1]
    reader, writer = await asyncio.open_connection("127.0.0.1", listen)
    writer.write(data)
    await writer.drain()
    got = await asyncio.wait_for(reader.read(64), 5)
    writer.close()
    server.close()
    await server.wait_closed()
    return got


def run_through(
    name: str | None, port: int, smtp: str | None = None, public: bool = True
) -> tuple[bytes, list[bytes]]:
    async def go() -> tuple[bytes, list[bytes]]:
        server, up_port, seen = await upstream()
        proxy = sp.Proxy(
            PATTERNS,
            smtp,
            resolve=lambda host: ["127.0.0.1"],
            public=lambda address: public,
            upstream_port=lambda p: up_port,
        )
        got = await through(proxy, hello(name), port)
        server.close()
        await server.wait_closed()
        return got, seen

    return asyncio.run(go())


def test_an_allowed_name_on_443_is_spliced_hello_first(
    capsys: pytest.CaptureFixture[str],
) -> None:
    got, seen = run_through("api.anthropic.com", 443)
    assert got == b"echo:" + hello("api.anthropic.com")[:5]
    assert len(seen) == 1 and seen[0][:1] == b"\x16"
    log = capsys.readouterr().err
    assert "allowed api.anthropic.com:443" in log and "127.0.0.1" not in log


@pytest.mark.parametrize(
    ("name", "port", "smtp", "public", "why"),
    [
        ("example.com", 443, None, True, "not allowed"),
        ("api.anthropic.com", 465, "smtp.example.invalid", True, "not allowed"),
        ("smtp.example.invalid", 443, "smtp.example.invalid", True, "not allowed"),
        ("smtp.example.invalid", 465, None, True, "not allowed"),
        ("api.anthropic.com", 443, None, False, "not public"),
        (None, 443, None, True, "not a TLS hello with a name"),
    ],
)
def test_everything_else_is_refused_and_said_once(
    name: str | None,
    port: int,
    smtp: str | None,
    public: bool,
    why: str,
    capsys: pytest.CaptureFixture[str],
) -> None:
    got, seen = run_through(name, port, smtp, public)
    assert got == b"" and seen == []
    (line,) = capsys.readouterr().err.splitlines()
    assert line.startswith("sni-proxy: refused") and why in line


def test_the_smtp_host_on_465_alone() -> None:
    got, seen = run_through("smtp.example.invalid", 465, "smtp.example.invalid")
    assert got.startswith(b"echo:") and len(seen) == 1


def test_it_starts_only_with_upstream_ports_443_and_465(tmp_path: Path) -> None:
    allow = tmp_path / "allow.txt"
    allow.write_text("api.anthropic.com\n", encoding="utf-8")
    assert sp.main(["--allowlist", str(allow), "--listen", "127.0.0.1:0=80"]) == 2


# ----------------------------------------------------------------------------------------------------------------------
# Group 7's review B: I3 (each public address in turn) and nit 4 (a connection cap, and an idle timeout).


def test_an_address_that_refuses_is_passed_over_for_the_next() -> None:
    # I3: the proxy connected to addresses[0] alone, so a name whose first address didn't answer failed every time.
    async def go() -> tuple[bytes, list[bytes]]:
        server, up_port, seen = await upstream()
        proxy = sp.Proxy(
            PATTERNS,
            resolve=lambda host: ["127.0.0.3", "127.0.0.1"],
            public=lambda address: True,
            upstream_port=lambda p: up_port,
        )
        got = await through(proxy, hello("api.anthropic.com"), 443)
        server.close()
        await server.wait_closed()
        return got, seen

    got, seen = asyncio.run(go())
    assert got.startswith(b"echo:") and len(seen) == 1


def test_a_full_proxy_refuses_a_new_connection_as_busy(
    capsys: pytest.CaptureFixture[str],
) -> None:
    async def go() -> bytes:
        server, up_port, _ = await upstream()
        proxy = sp.Proxy(
            PATTERNS,
            resolve=lambda host: ["127.0.0.1"],
            public=lambda address: True,
            upstream_port=lambda p: up_port,
            max_connections=1,
        )
        proxy.active = 1
        got = await through(proxy, hello("api.anthropic.com"), 443)
        server.close()
        await server.wait_closed()
        return got

    assert asyncio.run(go()) == b""
    assert "refused api.anthropic.com:443 (busy)" in capsys.readouterr().err


def test_an_idle_splice_is_closed_and_its_slot_given_back() -> None:
    async def go() -> tuple[bytes, int]:
        async def silent(
            reader: asyncio.StreamReader, writer: asyncio.StreamWriter
        ) -> None:
            await reader.read(65536)
            await asyncio.sleep(5)
            writer.close()

        server = await asyncio.start_server(silent, "127.0.0.1", 0)
        up_port = server.sockets[0].getsockname()[1]
        proxy = sp.Proxy(
            PATTERNS,
            resolve=lambda host: ["127.0.0.1"],
            public=lambda address: True,
            upstream_port=lambda p: up_port,
            idle_seconds=0.2,
        )
        front = await asyncio.start_server(
            lambda r, w: proxy.handle(r, w, 443), "127.0.0.1", 0
        )
        listen = front.sockets[0].getsockname()[1]
        reader, writer = await asyncio.open_connection("127.0.0.1", listen)
        writer.write(hello("api.anthropic.com"))
        await writer.drain()
        got = await asyncio.wait_for(reader.read(64), 3)
        writer.close()
        await asyncio.sleep(0.1)
        front.close()
        server.close()
        return got, proxy.active

    got, active = asyncio.run(go())
    assert got == b"" and active == 0
