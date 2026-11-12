#!/usr/bin/env python3
"""A cloud host's one way out (spec 001 FR-051; contracts/tunnel.md §6; research.md R-10; tasks.md T049): an HTTPS
CONNECT proxy to port 443 alone, to the names deploy/hosts/<host>/egress-allowlist.txt holds alone, each resolving to
public addresses only; nothing in a tunnel is read, and each decision is one log line with no client address
(deploy/scripts/test_egress_proxy.py's docstring). nftables lets only its user, h4-egress, beyond the VPC.

    python3 -I -B egress_proxy.py --allowlist FILE --listen 127.0.0.1:3128

The standard library alone, in Python 3.9's syntax: it travels in the tunnel end's user data.
"""

from __future__ import annotations

import argparse
import asyncio
import ipaddress
import re
import socket
import sys
from collections.abc import Callable, Iterable
from pathlib import Path

PROG = "egress-proxy"
PORTS = (443,)
HEAD_LIMIT = 8192
LABEL = re.compile(r"[a-z0-9-]{1,63}")

Resolve = Callable[[str], list[str]]


def load_allowlist(path: Path) -> list[str]:
    """One name a line, # comments and blank lines aside; refuses an entry that isn't a name or a name with stars."""
    out = []
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.split("#", 1)[0].strip().lower()
        if not line:
            continue
        if not all(
            LABEL.fullmatch(label.replace("*", "x")) for label in line.split(".")
        ):
            raise ValueError(f"{path.name}:{number} isn't a host name")
        out.append(line)
    return out


def _label(pattern: str) -> re.Pattern[str]:
    return re.compile(
        "".join("[a-z0-9-]*" if c == "*" else re.escape(c) for c in pattern)
    )


def allowed(host: str, patterns: Iterable[str]) -> bool:
    name = host.lower().rstrip(".")
    labels = name.split(".")
    if not name or not all(LABEL.fullmatch(label) for label in labels):
        return False
    for pattern in patterns:
        want = pattern.split(".")
        if len(want) == len(labels) and all(
            _label(w).fullmatch(label) for w, label in zip(want, labels)
        ):
            return True
    return False


def is_public(address: str) -> bool:
    try:
        return ipaddress.ip_address(address).is_global
    except ValueError:
        return False


def resolve(host: str) -> list[str]:
    found = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    return sorted({str(info[4][0]) for info in found})


class Proxy:
    def __init__(
        self,
        patterns: list[str],
        resolve: Resolve = resolve,
        public: Callable[[str], bool] = is_public,
        ports: tuple[int, ...] = PORTS,
        upstream_port: Callable[[int], int] = lambda port: port,
        log: Callable[[str], None] = lambda line: print(
            f"{PROG}: {line}", file=sys.stderr, flush=True
        ),
    ) -> None:
        self.patterns = patterns
        self.resolve = resolve
        self.public = public
        self.ports = ports
        self.upstream_port = upstream_port
        self.log = log

    async def answer(
        self, writer: asyncio.StreamWriter, status: str, verdict: str
    ) -> None:
        self.log(verdict)
        writer.write(
            f"HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".encode()
        )
        try:
            await writer.drain()
        finally:
            writer.close()

    async def handle(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        try:
            head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 10)
        except (
            asyncio.IncompleteReadError,
            asyncio.LimitOverrunError,
            asyncio.TimeoutError,
            ConnectionError,
        ):
            writer.close()
            return
        if len(head) > HEAD_LIMIT:
            await self.answer(
                writer,
                "431 Request Header Fields Too Large",
                "refused a request (headers too large)",
            )
            return
        parts = head.split(b"\r\n", 1)[0].decode("latin-1").split()
        if len(parts) != 3 or not parts[2].startswith("HTTP/1."):
            await self.answer(
                writer, "400 Bad Request", "refused a request (malformed)"
            )
            return
        method, target = parts[0], parts[1]
        if method != "CONNECT":
            await self.answer(
                writer, "405 Method Not Allowed", f"refused {method} (CONNECT alone)"
            )
            return
        host, sep, port_text = target.rpartition(":")
        if not sep or not host or not port_text.isdigit():
            await self.answer(
                writer, "400 Bad Request", "refused a CONNECT (malformed target)"
            )
            return
        port = int(port_text)
        where = f"{host.lower()}:{port}"
        if port not in self.ports or not allowed(host, self.patterns):
            await self.answer(
                writer, "403 Forbidden", f"refused {where} (not on the allowlist)"
            )
            return
        try:
            addresses = await asyncio.get_running_loop().run_in_executor(
                None, self.resolve, host
            )
        except OSError:
            await self.answer(
                writer, "502 Bad Gateway", f"refused {where} (doesn't resolve)"
            )
            return
        if not addresses or not all(self.public(a) for a in addresses):
            await self.answer(writer, "403 Forbidden", f"refused {where} (not public)")
            return
        try:
            up_reader, up_writer = await asyncio.wait_for(
                asyncio.open_connection(addresses[0], self.upstream_port(port)), 10
            )
        except (OSError, asyncio.TimeoutError):
            await self.answer(
                writer, "502 Bad Gateway", f"refused {where} (unreachable)"
            )
            return
        self.log(f"allowed {where}")
        writer.write(b"HTTP/1.1 200 Connection established\r\n\r\n")
        await writer.drain()
        await asyncio.gather(pipe(reader, up_writer), pipe(up_reader, writer))


async def pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        while True:
            data = await reader.read(65536)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    except ConnectionError:
        pass
    finally:
        writer.close()


async def serve(proxy: Proxy, listens: list[tuple[str, int]]) -> None:
    servers = [
        await asyncio.start_server(proxy.handle, host, port) for host, port in listens
    ]
    await asyncio.gather(*(s.serve_forever() for s in servers))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="egress_proxy.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument("--allowlist", required=True, type=Path)
    parser.add_argument("--listen", action="append", required=True)
    args = parser.parse_args(argv)
    try:
        patterns = load_allowlist(args.allowlist)
        listens = []
        for item in args.listen:
            host, _, port = item.rpartition(":")
            listens.append((host, int(port)))
    except (OSError, ValueError) as error:
        print(f"{PROG}: can't start: {error}", file=sys.stderr)
        return 2
    print(
        f"{PROG}: {len(patterns)} names allowed, listening on {', '.join(args.listen)}",
        file=sys.stderr,
    )
    asyncio.run(serve(Proxy(patterns), listens))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
