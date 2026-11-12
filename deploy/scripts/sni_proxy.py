#!/usr/bin/env python3
"""EC2's gateway's one way out (spec 001 FR-051; contracts/tunnel.md §6; research.md R-10; plan.md §16, "Group 7, as
built"). nftables sends each container's TLS on 443, and SMTP's implicit TLS on 465, to this proxy (deploy/hosts/ec2/
nftables.nft); it reads the name the client's TLS hello asks for, never anything after it, and connects to that name
on the port it was sent to, if the allowlist holds it (443) or it is the alerts mailbox's SMTP host (465), and each
address it resolves to is public. So the gateway calls its providers as it does on the laptop, with no proxy setting of
its own, and its TLS runs end to end with the provider: the proxy splices bytes. Each decision is one log line, with
the name, the port, and the verdict, never a client's address or a byte of the stream.

    python3 -I -B sni_proxy.py --allowlist FILE --listen ADDR:PORT=UPSTREAM [--listen …] [--smtp-host-file FILE]

The standard library alone, in Python 3.9's syntax; it travels in EC2's user data, beside egress_proxy.py, whose name
matching and address check it shares.
"""

from __future__ import annotations

import argparse
import asyncio
import importlib.util
import sys
from pathlib import Path

PROG = "sni-proxy"
HELLO_LIMIT = 16389  # one TLS record: its 5-byte header and at most 16,384 bytes
SMTP_PORT = 465


def _egress_proxy():
    spec = importlib.util.spec_from_file_location(
        "egress_proxy", Path(__file__).resolve().parent / "egress_proxy.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ep = _egress_proxy()


def server_name(record: bytes) -> str | None:
    """The server_name a TLS ClientHello record asks for, lower case, or None if it isn't one or names none."""
    try:
        if len(record) < 5 or record[0] != 0x16:
            return None
        length = int.from_bytes(record[3:5], "big")
        body = record[5 : 5 + length]
        if len(body) < length or not body or body[0] != 0x01:
            return None
        at = 4 + 2 + 32  # handshake header, client version, random
        at += 1 + body[at]  # session id
        at += 2 + int.from_bytes(body[at : at + 2], "big")  # cipher suites
        at += 1 + body[at]  # compression methods
        end = at + 2 + int.from_bytes(body[at : at + 2], "big")
        at += 2
        while at + 4 <= min(end, len(body)):
            kind = int.from_bytes(body[at : at + 2], "big")
            size = int.from_bytes(body[at + 2 : at + 4], "big")
            data = body[at + 4 : at + 4 + size]
            if kind == 0 and len(data) >= 5 and data[2] == 0:
                n = int.from_bytes(data[3:5], "big")
                name = data[5 : 5 + n].decode("ascii")
                return name.lower().rstrip(".") if len(name) == n else None
            at += 4 + size
    except (IndexError, UnicodeDecodeError):
        return None
    return None


async def read_hello(reader: asyncio.StreamReader) -> bytes:
    head = await reader.readexactly(5)
    length = int.from_bytes(head[3:5], "big")
    if head[0] != 0x16 or length > HELLO_LIMIT - 5:
        return head
    return head + await reader.readexactly(length)


class Proxy:
    def __init__(
        self,
        patterns: list[str],
        smtp_host: str | None = None,
        resolve=ep.resolve,
        public=ep.is_public,
        upstream_port=lambda port: port,
    ) -> None:
        self.patterns, self.smtp_host = patterns, (smtp_host or "").lower() or None
        self.resolve, self.public, self.upstream_port = resolve, public, upstream_port

    def permits(self, name: str, port: int) -> bool:
        if port == SMTP_PORT:
            return self.smtp_host is not None and name == self.smtp_host
        return ep.allowed(name, self.patterns)

    async def handle(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter, port: int
    ) -> None:
        name, why, upstream, hello = None, "", None, b""
        try:
            hello = await asyncio.wait_for(read_hello(reader), 10)
            name = server_name(hello)
            if name is None:
                why = "not a TLS hello with a name"
            elif not self.permits(name, port):
                why = "not allowed"
            else:
                addresses = await asyncio.get_running_loop().run_in_executor(
                    None, self.resolve, name
                )
                if not addresses or not all(self.public(a) for a in addresses):
                    why = "not public"
                else:
                    upstream = await asyncio.wait_for(
                        asyncio.open_connection(addresses[0], self.upstream_port(port)),
                        10,
                    )
        except (asyncio.IncompleteReadError, asyncio.TimeoutError, OSError):
            why = "unreachable"
        if upstream is None:
            self.say("refused", name or "(no name)", port, why)
            writer.close()
            return
        self.say("allowed", str(name), port)
        up_reader, up_writer = upstream
        up_writer.write(hello)
        await asyncio.gather(self.pipe(reader, up_writer), self.pipe(up_reader, writer))

    @staticmethod
    async def pipe(source: asyncio.StreamReader, sink: asyncio.StreamWriter) -> None:
        try:
            while True:
                data = await source.read(65536)
                if not data:
                    break
                sink.write(data)
                await sink.drain()
        except OSError:
            pass
        finally:
            sink.close()

    @staticmethod
    def say(verdict: str, name: str, port: int, why: str = "") -> None:
        print(
            f"{PROG}: {verdict} {name}:{port}" + (f" ({why})" if why else ""),
            file=sys.stderr,
            flush=True,
        )


async def serve(proxy: Proxy, listens: list[tuple[str, int, int]]) -> None:
    servers = [
        await asyncio.start_server(
            lambda r, w, up=upstream: proxy.handle(r, w, up), host, port
        )
        for host, port, upstream in listens
    ]
    await asyncio.gather(*(s.serve_forever() for s in servers))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="sni_proxy.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument("--allowlist", required=True, type=Path)
    parser.add_argument("--listen", action="append", required=True)
    parser.add_argument("--smtp-host-file", type=Path)
    args = parser.parse_args(argv)
    try:
        patterns = ep.load_allowlist(args.allowlist)
        listens = []
        for item in args.listen:
            where, _, upstream = item.partition("=")
            host, _, port = where.rpartition(":")
            if int(upstream) not in (443, SMTP_PORT):
                raise ValueError(f"{item}: the upstream port is 443 or 465")
            listens.append((host, int(port), int(upstream)))
        smtp = (
            args.smtp_host_file.read_text(encoding="utf-8").strip()
            if args.smtp_host_file and args.smtp_host_file.is_file()
            else None
        )
    except (OSError, ValueError) as error:
        print(f"{PROG}: can't start: {error}", file=sys.stderr)
        return 2
    print(
        f"{PROG}: {len(patterns)} names allowed, SMTP {'named' if smtp else 'none'}",
        file=sys.stderr,
    )
    asyncio.run(serve(Proxy(patterns, smtp), listens))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
