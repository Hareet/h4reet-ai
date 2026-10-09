#!/usr/bin/env python3
"""The agents' engine egress proxy (spec 000, FR-039; contracts/agents-engine.md §4).

A standard-library CONNECT/GET proxy, the engine's only way out. It runs as the Author's systemd
user service on `198.18.0.1:3128`; the firewall lets `h4agents`' traffic reach this port and nothing
else (§5, H4). It allows CONNECT to 443, and absolute-form GET on 80, only for a host on the sandbox's
`sandbox.network.allowedDomains`, read from `.claude/settings.json` at start, so the engine's list and
the sandbox's are the same by construction (FR-039).

Fail closed on the list: a missing, unreadable, or invalid settings file, or an empty list, refuses
every request (`no_list`). It never falls back to allowing. It drops IP literals and `host:port`
entries, so the opening `198.18.0.1:2376` never becomes a destination. It refuses IP-literal
destinations, unlisted hosts, and any listed name that resolves to a non-global address (loopback,
RFC 1918, link-local including `169.254.169.254`, `100.64.0.0/10`, `198.18.0.0/15`, multicast, and the
IPv6 equivalents). It resolves each name once and connects to the address it checked.

The decision logic (`parse_domains`, `host_listed`, `is_global_unicast`, `classify`) is pure, so the
tests exercise it without egress. This file is human-only: the copy `engine.sh setup` installs is what
runs (§5, H13). Run by path through `PY_HOST`, never with `-m`.
"""

from __future__ import annotations

import ipaddress
import json
import os
import select
import socket
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

LISTEN_DEFAULT = ("198.18.0.1", 3128)
MAX_TUNNELS = 64
CONNECT_TIMEOUT = 10.0
IDLE_TIMEOUT = 120.0
BUFFER = 65536

# Reasons, exactly as the log records them (§4).
R_ALLOWED = "allowed"
R_NOT_ON_LIST = "not_on_list"
R_NO_LIST = "no_list"
R_DENIED = "denied_domain"
R_IP_LITERAL = "ip_literal"
R_NON_GLOBAL = "non_global_address"
R_METHOD = "method"
R_PORT = "port"

# Extra ranges to reject even where a Python version's `is_private` might not (defensive, §4).
_EXTRA_V4 = (
    ipaddress.ip_network("100.64.0.0/10"),  # carrier-grade NAT
    ipaddress.ip_network(
        "198.18.0.0/15"
    ),  # benchmarking range; the engine's own address lives here
)


# --------------------------------------------------------------------------------------------------
# The list (§4)
# --------------------------------------------------------------------------------------------------
def parse_domains(raw: object) -> list[str]:
    """Keep hostname entries only. Drop IP literals and `host:port` entries."""
    kept: list[str] = []
    if not isinstance(raw, list):
        return kept
    for entry in raw:
        if not isinstance(entry, str):
            continue
        name = entry.strip()
        if (
            not name or ":" in name
        ):  # a `host:port` entry such as the opening 198.18.0.1:2376
            continue
        probe = name.removeprefix("*.")
        if _is_ip_literal(probe):  # a bare IP literal is not a hostname
            continue
        kept.append(name.lower())
    return kept


def _is_ip_literal(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return False
    return True


@dataclass
class Settings:
    """The proxy's fixed list, read once at start. `ok` is false when it must fail closed."""

    allowed: list[str] = field(default_factory=list)
    denied: list[str] = field(default_factory=list)
    ok: bool = False

    @classmethod
    def load(cls, path: str | os.PathLike[str]) -> Settings:
        try:
            data = json.loads(Path(path).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return cls(ok=False)  # missing, unreadable, or not valid JSON: fail closed
        network = (data.get("sandbox") or {}).get("network") or {}
        allowed = parse_domains(network.get("allowedDomains"))
        denied = parse_domains(network.get("deniedDomains"))
        if not allowed:  # an empty list fails closed
            return cls(allowed=[], denied=denied, ok=False)
        return cls(allowed=allowed, denied=denied, ok=True)

    def digest(self) -> str:
        """A stable hash of the list in use, for `make engine-status` (§4)."""
        import hashlib

        joined = "\n".join(sorted(self.allowed)).encode("utf-8")
        return hashlib.sha256(joined).hexdigest()[:12]


def host_listed(host: str, patterns: list[str]) -> bool:
    """`*.base` matches any subdomain of base, not base itself; any other entry matches exactly.

    That is §4's rule, and the sandbox's own: its allowedDomains matcher takes `*.example.com` to mean
    the names ending in `.example.com`. An entry for the apex is a separate, exact entry.
    """
    host = host.lower().rstrip(".")
    for pattern in patterns:
        if pattern.startswith("*."):
            if host.endswith("." + pattern[2:]):
                return True
        elif host == pattern:
            return True
    return False


# --------------------------------------------------------------------------------------------------
# Addresses (§4)
# --------------------------------------------------------------------------------------------------
def is_global_unicast(address: str) -> bool:
    """True only for a global unicast address. Everything else is refused."""
    try:
        addr = ipaddress.ip_address(address)
    except ValueError:
        return False
    if (
        addr.is_loopback
        or addr.is_link_local
        or addr.is_multicast
        or addr.is_private
        or addr.is_reserved
        or addr.is_unspecified
    ):
        return False
    return not (addr.version == 4 and any(addr in net for net in _EXTRA_V4))


# --------------------------------------------------------------------------------------------------
# The decision for one request (§4)
# --------------------------------------------------------------------------------------------------
@dataclass
class Verdict:
    ok: bool
    reason: str
    method: str = ""
    host: str = ""
    port: int = 0
    path: str = ""
    address: str = ""  # the validated address to connect to


def _resolve_global(host: str, resolver) -> str | None:
    """Resolve once and return the first global-unicast address, or None."""
    try:
        infos = resolver(host)
    except (OSError, ValueError):
        return None
    for info in infos:
        address = info[4][0]
        if is_global_unicast(address):
            return address
    return None


def _default_resolver(host: str) -> list:
    return socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)


def classify(
    method: str, target: str, settings: Settings, resolver=_default_resolver
) -> Verdict:
    """Judge one request line. Never connects; returns the address to connect to on allow."""
    method = method.upper()
    if not settings.ok:
        return Verdict(False, R_NO_LIST, method=method)

    if method == "CONNECT":
        host, _, port_text = target.rpartition(":")
        if not host or not port_text.isdigit():
            return Verdict(False, R_METHOD, method=method)
        port = int(port_text)
        return _judge_host(method, host, port, "", settings, resolver, allowed_port=443)

    if method == "GET":
        if not target.lower().startswith("http://"):
            return Verdict(False, R_METHOD, method=method)  # origin-form is refused
        rest = target[len("http://") :]
        authority, _, path = rest.partition("/")
        path = "/" + path
        host, _, port_text = authority.partition(":")
        if port_text and not port_text.isdigit():
            return Verdict(False, R_PORT, method=method, host=host)
        port = int(port_text) if port_text else 80
        return _judge_host(
            method,
            host,
            port,
            path.split("?", 1)[0],
            settings,
            resolver,
            allowed_port=80,
        )

    return Verdict(False, R_METHOD, method=method)


def _judge_host(method, host, port, path, settings, resolver, allowed_port) -> Verdict:
    host = host.lower().rstrip(".")
    if port != allowed_port:
        return Verdict(False, R_PORT, method=method, host=host, port=port, path=path)
    if _is_ip_literal(host):
        return Verdict(
            False, R_IP_LITERAL, method=method, host=host, port=port, path=path
        )
    if host_listed(host, settings.denied):
        return Verdict(False, R_DENIED, method=method, host=host, port=port, path=path)
    if not host_listed(host, settings.allowed):
        return Verdict(
            False, R_NOT_ON_LIST, method=method, host=host, port=port, path=path
        )
    address = _resolve_global(host, resolver)
    if address is None:
        return Verdict(
            False, R_NON_GLOBAL, method=method, host=host, port=port, path=path
        )
    return Verdict(
        True, R_ALLOWED, method=method, host=host, port=port, path=path, address=address
    )


# --------------------------------------------------------------------------------------------------
# The log (§4)
# --------------------------------------------------------------------------------------------------
class EgressLog:
    def __init__(self, path: str):
        self.path = path
        self._lock = threading.Lock()

    def record(
        self,
        verdict: Verdict,
        bytes_up: int = 0,
        bytes_down: int = 0,
        duration_ms: int = 0,
    ) -> None:
        line = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
            + f".{int(time.time() * 1000) % 1000:03d}Z",
            "decision": "allowed" if verdict.ok else "refused",
            "reason": verdict.reason,
            "method": verdict.method,
            "host": verdict.host,
            "port": verdict.port,
            "path": verdict.path,
            "bytes_up": bytes_up,
            "bytes_down": bytes_down,
            "duration_ms": duration_ms,
        }
        data = (json.dumps(line, separators=(",", ":"), sort_keys=True) + "\n").encode(
            "utf-8"
        )
        with self._lock:
            try:
                os.makedirs(os.path.dirname(self.path), exist_ok=True)
                fd = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
                try:
                    os.write(fd, data)
                finally:
                    os.close(fd)
            except OSError:
                pass


# --------------------------------------------------------------------------------------------------
# The tunnel (§4). Pure byte movement between two already-connected sockets.
# --------------------------------------------------------------------------------------------------
def tunnel(
    client: socket.socket, upstream: socket.socket, idle: float = IDLE_TIMEOUT
) -> tuple[int, int]:
    """Pump bytes both ways until either side closes or the idle timeout passes."""
    up = down = 0
    sockets = [client, upstream]
    client.setblocking(False)
    upstream.setblocking(False)
    while True:
        readable, _, errored = select.select(sockets, [], sockets, idle)
        if errored or not readable:
            break
        done = False
        for sock in readable:
            try:
                chunk = sock.recv(BUFFER)
            except (BlockingIOError, InterruptedError):
                continue
            except OSError:
                done = True
                break
            if not chunk:
                done = True
                break
            peer = upstream if sock is client else client
            try:
                peer.sendall(chunk)
            except OSError:
                done = True
                break
            if sock is client:
                up += len(chunk)
            else:
                down += len(chunk)
        if done:
            break
    return up, down


# --------------------------------------------------------------------------------------------------
# The server
# --------------------------------------------------------------------------------------------------
class EgressProxy:
    """A threaded CONNECT/GET proxy. `resolver` and `log` are injectable for the tests."""

    def __init__(self, settings: Settings, log: EgressLog, resolver=_default_resolver):
        self.settings = settings
        self.log = log
        self.resolver = resolver
        self._active = threading.BoundedSemaphore(MAX_TUNNELS)
        self._server_socket: socket.socket | None = None
        self._stop = threading.Event()

    def handle(self, client: socket.socket) -> None:
        """Read the request line, judge it, and tunnel or refuse. Closes the client."""
        started = time.monotonic()
        try:
            request_line, _ = _read_request_head(client)
            if not request_line:
                return
            parts = request_line.split(" ")
            if len(parts) < 2:
                self._refuse(client, Verdict(False, R_METHOD))
                return
            method, target = parts[0], parts[1]
            verdict = classify(method, target, self.settings, self.resolver)
            if not verdict.ok:
                self._refuse(client, verdict)
                return
            self._fulfil(client, verdict, started)
        except OSError:
            pass
        finally:
            _close(client)

    def _refuse(self, client: socket.socket, verdict: Verdict) -> None:
        status = (
            "503 No Egress List" if verdict.reason == R_NO_LIST else "403 Forbidden"
        )
        try:
            client.sendall(
                f"HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".encode()
            )
        except OSError:
            pass
        self.log.record(verdict)

    def _fulfil(self, client: socket.socket, verdict: Verdict, started: float) -> None:
        if not self._active.acquire(blocking=False):  # the 64-tunnel limit
            self._refuse(
                client,
                Verdict(False, R_METHOD, method=verdict.method, host=verdict.host),
            )
            return
        upstream = None
        try:
            upstream = socket.create_connection(
                (verdict.address, verdict.port), timeout=CONNECT_TIMEOUT
            )
            if verdict.method == "CONNECT":
                client.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            else:  # absolute-form GET on 80
                request = (
                    f"GET {verdict.path or '/'} HTTP/1.1\r\n"
                    f"Host: {verdict.host}\r\nConnection: close\r\n\r\n"
                ).encode()
                upstream.sendall(request)
            up, down = tunnel(client, upstream)
            self.log.record(verdict, up, down, int((time.monotonic() - started) * 1000))
        except OSError:
            self._refuse(
                client,
                Verdict(False, R_NON_GLOBAL, method=verdict.method, host=verdict.host),
            )
        finally:
            self._active.release()
            if upstream is not None:
                _close(upstream)

    def serve(self, listen: tuple[str, int]) -> None:
        server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind(listen)
        server.listen(128)
        self._server_socket = server
        try:
            while not self._stop.is_set():
                try:
                    client, _ = server.accept()
                except OSError:
                    break
                thread = threading.Thread(
                    target=self.handle, args=(client,), daemon=True
                )
                thread.start()
        finally:
            server.close()

    def shutdown(self) -> None:
        self._stop.set()
        if self._server_socket is not None:
            try:
                self._server_socket.close()
            except OSError:
                pass


def _read_request_head(sock: socket.socket, limit: int = 16384) -> tuple[str, bytes]:
    """Read up to the blank line. Return (request line, the rest of the head)."""
    buffer = b""
    sock.settimeout(CONNECT_TIMEOUT)
    while b"\r\n\r\n" not in buffer and len(buffer) < limit:
        chunk = sock.recv(BUFFER)
        if not chunk:
            break
        buffer += chunk
    head, _, _ = buffer.partition(b"\r\n\r\n")
    first, _, rest = head.partition(b"\r\n")
    return first.decode("latin-1").strip(), rest


def _close(sock: socket.socket) -> None:
    try:
        sock.shutdown(socket.SHUT_RDWR)
    except OSError:
        pass
    try:
        sock.close()
    except OSError:
        pass


def main() -> int:
    settings_path = os.environ.get("H4_EGRESS_SETTINGS", ".claude/settings.json")
    log_path = os.environ.get(
        "H4_EGRESS_LOG",
        str(Path.home() / ".local/state/h4reet/agents-engine/egress.jsonl"),
    )
    host = os.environ.get("H4_EGRESS_HOST", LISTEN_DEFAULT[0])
    port = int(os.environ.get("H4_EGRESS_PORT", str(LISTEN_DEFAULT[1])))
    settings = Settings.load(settings_path)
    proxy = EgressProxy(settings, EgressLog(log_path))
    proxy.serve((host, port))
    return 0


if __name__ == "__main__":
    sys.exit(main())
