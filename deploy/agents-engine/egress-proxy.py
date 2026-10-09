#!/usr/bin/env python3
"""The agents' engine egress proxy (spec 000, FR-039; contracts/agents-engine.md §4).

A standard-library CONNECT/GET proxy, the engine's only way out. It runs as the Author's systemd
user service on `198.18.0.1:3128`; the firewall lets `h4agents`' traffic reach this port and nothing
else (§5, H4). It allows CONNECT to 443, and absolute-form GET on 80, only for a host on the sandbox's
`sandbox.network.allowedDomains`, read from `.claude/settings.json` at start, so the engine's list and
the sandbox's are the same by construction (FR-039).

Fail closed on the list: a missing, unreadable, or invalid settings file, valid JSON that isn't a
settings object, or an empty list, refuses every request (`no_list`), logged at most once a minute. It
never falls back to allowing. It drops IP literals and `host:port` entries, so the opening
`198.18.0.1:2376` never becomes a destination. It refuses IP-literal destinations, unlisted hosts, and
any listed name that resolves to a non-global address (loopback, RFC 1918, link-local including
`169.254.169.254`, `100.64.0.0/10`, `198.18.0.0/15`, multicast, and the IPv6 equivalents). It resolves
each name once and connects to the address it checked. A GET goes upstream with its query and the
client's end-to-end headers; the hop-by-hop ones and every `Proxy-*` header stay behind.

The decision logic (`parse_domains`, `host_listed`, `is_global_unicast`, `classify`) is pure, so the
tests exercise it without egress. This file is human-only: the copy `engine.sh setup` installs is what
runs (§5, H13). Run by path through `PY_HOST`, never with `-m`.
"""

from __future__ import annotations

import hashlib
import ipaddress
import json
import os
import re
import select
import socket
import sys
import threading
import time
from dataclasses import dataclass, field, replace
from pathlib import Path

LISTEN_DEFAULT = ("198.18.0.1", 3128)
MAX_TUNNELS = 64
CONNECT_TIMEOUT = 10.0
IDLE_TIMEOUT = 120.0
BUFFER = 65536
HEAD_LIMIT = 16384  # bytes; a request head that doesn't end within it is refused
# Seconds: with no list, one `no_list` line a minute at most (§4).
NO_LIST_LOG_INTERVAL = 60.0
EXIT_NO_LIST = 3  # `--list`'s status when the settings yield no list
# Where the running proxy records the list it serves, for `engine.sh status` (§8).
LIST_FILE_DEFAULT = "~/.local/state/h4reet/agents-engine/egress-list.json"

# Reasons, exactly as the log records them (§4).
R_ALLOWED = "allowed"
R_NOT_ON_LIST = "not_on_list"
R_NO_LIST = "no_list"
R_DENIED = "denied_domain"
R_IP_LITERAL = "ip_literal"
R_NON_GLOBAL = "non_global_address"
R_METHOD = "method"
R_PORT = "port"
# The listed name didn't resolve, or its address didn't answer.
R_UPSTREAM_UNREACHABLE = "upstream_unreachable"
R_TUNNEL_CAP = "tunnel_cap"  # MAX_TUNNELS were already open

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


def _object_member(value: object, key: str) -> dict | None:
    """`value[key]` when value is a JSON object and that member is one too; otherwise None."""
    if not isinstance(value, dict):
        return None
    member = value.get(key)
    return member if isinstance(member, dict) else None


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
        # Valid JSON of the wrong shape fails closed too: the file, its `sandbox`, and its `network` are
        # objects, and a `deniedDomains` the proxy can't read is never taken for an empty one.
        network = _object_member(_object_member(data, "sandbox"), "network")
        if network is None or not isinstance(network.get("deniedDomains", []), list):
            return cls(ok=False)
        allowed = parse_domains(network.get("allowedDomains"))
        denied = parse_domains(network.get("deniedDomains"))
        if not allowed:  # an empty list fails closed
            return cls(allowed=[], denied=denied, ok=False)
        return cls(allowed=allowed, denied=denied, ok=True)

    def served(self) -> tuple[list[str], list[str]]:
        """The allowed and denied entries the proxy serves, sorted, each once; none without a list."""
        if not self.ok:
            return [], []
        return sorted(set(self.allowed)), sorted(set(self.denied))

    def digest(self) -> str:
        """The sha256, in hex, of the list in use: its allowed and its denied entries (§4, §8).

        `engine.sh status` prints the running proxy's digest beside the one `--list` gives for the
        settings as they are now. A change to either list changes it; order and repeats don't, since
        they don't change what the proxy serves.
        """
        allowed, denied = self.served()
        canonical = json.dumps(
            {"allowed": allowed, "denied": denied},
            separators=(",", ":"),
            sort_keys=True,
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def list_json(settings: Settings) -> str:
    """The list in use as one line of JSON, `{"digest": "<sha256 hex>", "hosts": [...]}` (§4, §8).

    What `--list` prints and what the running proxy records. `hosts` is the allowed entries as the
    proxy serves them: hostnames only, lowercased, sorted, each once; empty without a list.
    """
    hosts, _ = settings.served()
    return json.dumps({"digest": settings.digest(), "hosts": hosts}, sort_keys=True)


def write_list_file(path: str | os.PathLike[str], settings: Settings) -> None:
    """Record the list in use for `engine.sh status`: mode 0600, atomically, never through a link.

    Each missing directory is made 0700, and the record's directory is opened without following a
    link. The record goes to a new temporary name in it (`O_EXCL`, `O_NOFOLLOW`), is synced, and is
    renamed over the last one, so a reader sees the old record or the new one, never a part, and a link
    at the name is replaced rather than written through.
    """
    target = Path(path)
    missing = []
    directory = target.parent
    while not directory.exists():
        missing.append(directory)
        directory = directory.parent
    for directory in reversed(missing):
        directory.mkdir(mode=0o700, exist_ok=True)
    data = memoryview((list_json(settings) + "\n").encode("utf-8"))
    dir_fd = os.open(target.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        tmp = f".{target.name}.{os.getpid()}.{os.urandom(4).hex()}.tmp"
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
        fd = os.open(tmp, flags, 0o600, dir_fd=dir_fd)
        try:
            os.fchmod(fd, 0o600)  # whatever the umask was
            while data:
                data = data[os.write(fd, data) :]
            os.fsync(fd)
        except BaseException:
            os.close(fd)
            os.unlink(tmp, dir_fd=dir_fd)
            raise
        os.close(fd)
        try:
            os.replace(tmp, target.name, src_dir_fd=dir_fd, dst_dir_fd=dir_fd)
        except BaseException:
            os.unlink(tmp, dir_fd=dir_fd)
            raise
        os.fsync(dir_fd)
    finally:
        os.close(dir_fd)


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
    path: str = ""  # what the log records: a GET's path, without its query
    address: str = ""  # the validated address to connect to
    request_path: str = (
        ""  # what goes upstream: a GET's path with its query; never logged
    )


# A request-target goes upstream as it came, so it may hold printable ASCII only: no space, no control
# character that could end the line early.
_UNSAFE_TARGET = re.compile(r"[^\x21-\x7e]")


def _resolve_global(host: str, resolver) -> tuple[str | None, str]:
    """Resolve once. Return (the first global-unicast address, "") or (None, the refusal's reason).

    A name that resolves only to addresses that aren't global is `non_global_address`. One that doesn't
    resolve at all has nothing to reach, so it is `upstream_unreachable`.
    """
    try:
        infos = resolver(host)
    except (OSError, ValueError):
        return None, R_UPSTREAM_UNREACHABLE
    for info in infos:
        address = info[4][0]
        if is_global_unicast(address):
            return address, ""
    return None, (R_NON_GLOBAL if infos else R_UPSTREAM_UNREACHABLE)


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
        if _UNSAFE_TARGET.search(target):
            return Verdict(False, R_METHOD, method=method)
        rest = target[len("http://") :]
        authority, _, path = rest.partition("/")
        request_path = "/" + path
        host, _, port_text = authority.partition(":")
        if port_text and not port_text.isdigit():
            return Verdict(False, R_PORT, method=method, host=host)
        port = int(port_text) if port_text else 80
        verdict = _judge_host(
            method,
            host,
            port,
            request_path.split("?", 1)[0],
            settings,
            resolver,
            allowed_port=80,
        )
        return replace(verdict, request_path=request_path) if verdict.ok else verdict

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
    address, reason = _resolve_global(host, resolver)
    if address is None:
        return Verdict(False, reason, method=method, host=host, port=port, path=path)
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
# Forwarding a GET (§4)
# --------------------------------------------------------------------------------------------------
# A field name is an RFC 9110 token; a value holds no control character but the tab.
_FIELD_NAME = re.compile(r"[!#$%&'*+\-.^_`|~0-9A-Za-z]+")
_UNSAFE_VALUE = re.compile(r"[\x00-\x08\x0a-\x1f\x7f]")
# The fields that belong to one connection rather than to the request (RFC 9110 §7.6.1), and `Host`,
# which the proxy sets from the request-target (RFC 9112 §3.2.2). Every `Proxy-*` field stays too.
_NOT_FORWARDED = frozenset(
    {
        "connection",
        "keep-alive",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
        "host",
    }
)


def parse_fields(raw: bytes) -> list[tuple[str, str]]:
    """The header fields of a request head (the lines after the request line), in order.

    A line that starts with a space or a tab continues the field before it (obs-fold, RFC 9112 §5.2)
    and is joined to it, so a field that is dropped leaves no stray piece behind. A line that isn't
    `name: value`, and a field whose value holds a control character, are dropped whole.
    """
    fields: list[tuple[str, str]] = []
    for line in raw.decode("latin-1").split("\n"):
        line = line.removesuffix("\r")
        if not line:
            continue
        if line[0] in " \t":
            if fields:
                name, value = fields[-1]
                folded = line.strip(" \t")
                fields[-1] = (name, f"{value} {folded}")
            continue
        name, colon, value = line.partition(":")
        if not colon or not _FIELD_NAME.fullmatch(name):
            fields.append(
                ("", "")
            )  # holds the place, so a folded line can't join the field before it
            continue
        fields.append((name, value.strip(" \t")))
    return [(n, v) for n, v in fields if n and not _UNSAFE_VALUE.search(v)]


def forward_request(verdict: Verdict, fields: list[tuple[str, str]]) -> bytes:
    """The head an absolute-form GET goes upstream with (§4).

    The path keeps its query. The client's fields go with it, but not the hop-by-hop ones (RFC 9110
    §7.6.1: `Connection`, each field it names, `Keep-Alive`, `TE`, `Trailer`, `Transfer-Encoding`,
    `Upgrade`), and not any `Proxy-*` field, so the client's proxy credentials never leave the proxy.
    `Host` is the request-target's, and `Connection: close` ends the exchange after one response.
    """
    named = {
        token.strip(" \t").lower()
        for name, value in fields
        if name.lower() == "connection"
        for token in value.split(",")
    }
    lines = [f"GET {verdict.request_path or '/'} HTTP/1.1", f"Host: {verdict.host}"]
    for name, value in fields:
        lower = name.lower()
        if lower in _NOT_FORWARDED or lower in named or lower.startswith("proxy-"):
            continue
        lines.append(f"{name}: {value}")
    lines.append("Connection: close")
    return ("\r\n".join(lines) + "\r\n\r\n").encode("latin-1")


# --------------------------------------------------------------------------------------------------
# The server
# --------------------------------------------------------------------------------------------------
# The status a refusal answers with: 403 unless the proxy itself, not the request, is why.
_REFUSAL_STATUS = {
    R_NO_LIST: "503 No Egress List",
    R_TUNNEL_CAP: "503 Service Unavailable",
    R_UPSTREAM_UNREACHABLE: "502 Bad Gateway",
}


class EgressProxy:
    """A threaded CONNECT/GET proxy. `resolver`, `connect`, `clock`, and `log` are injectable for the
    tests, which never reach past the loopback."""

    def __init__(
        self,
        settings: Settings,
        log: EgressLog,
        resolver=_default_resolver,
        *,
        connect=socket.create_connection,
        clock=time.monotonic,
        max_tunnels: int = MAX_TUNNELS,
        list_file: str | os.PathLike[str] | None = None,
    ):
        self.settings = settings
        self.log = log
        self.resolver = resolver
        self.list_file = list_file
        self._connect = connect
        self._clock = clock
        self._active = threading.BoundedSemaphore(max_tunnels)
        self._no_list_lock = threading.Lock()
        self._no_list_logged_at: float | None = None
        self._server_socket: socket.socket | None = None
        self._stop = threading.Event()

    def handle(self, client: socket.socket) -> None:
        """Read the request head, judge it, and tunnel or refuse. Closes the client."""
        started = self._clock()
        try:
            head = _read_request_head(client)
            if head is None:
                return  # the client sent nothing
            request_line, raw_fields, leftover = head
            parts = request_line.split(" ")
            if len(parts) < 2:
                self._refuse(client, Verdict(False, R_METHOD))
                return
            method, target = parts[0], parts[1]
            verdict = classify(method, target, self.settings, self.resolver)
            if not verdict.ok:
                self._refuse(client, verdict)
                return
            self._fulfil(client, verdict, raw_fields, leftover, started)
        except OSError:
            pass
        finally:
            _close(client)

    def _refuse(self, client: socket.socket, verdict: Verdict) -> None:
        status = _REFUSAL_STATUS.get(verdict.reason, "403 Forbidden")
        try:
            client.sendall(
                f"HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".encode()
            )
        except OSError:
            pass
        if verdict.reason == R_NO_LIST and not self._no_list_due():
            return  # refused all the same; this minute's line is already written
        self.log.record(verdict)

    def _no_list_due(self) -> bool:
        """True at most once a minute (§4): with no list every request is refused, and one line says so."""
        with self._no_list_lock:
            now = self._clock()
            last = self._no_list_logged_at
            if last is not None and now - last < NO_LIST_LOG_INTERVAL:
                return False
            self._no_list_logged_at = now
            return True

    def _fulfil(
        self,
        client: socket.socket,
        verdict: Verdict,
        raw_fields: bytes,
        leftover: bytes,
        started: float,
    ) -> None:
        if not self._active.acquire(blocking=False):  # the tunnel cap
            self._refuse(client, replace(verdict, ok=False, reason=R_TUNNEL_CAP))
            return
        upstream = None
        try:
            try:
                upstream = self._connect(
                    (verdict.address, verdict.port), timeout=CONNECT_TIMEOUT
                )
            except OSError:
                self._refuse(
                    client, replace(verdict, ok=False, reason=R_UPSTREAM_UNREACHABLE)
                )
                return
            up = down = 0
            try:
                if verdict.method == "CONNECT":
                    client.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                else:  # absolute-form GET on 80
                    upstream.sendall(forward_request(verdict, parse_fields(raw_fields)))
                if leftover:  # what the client sent after its head, before any answer
                    upstream.sendall(leftover)
                    up = len(leftover)
                more_up, down = tunnel(client, upstream)
                up += more_up
            except OSError:
                pass  # a side went away mid-exchange: the decision stands, logged with what moved
            self.log.record(verdict, up, down, int((self._clock() - started) * 1000))
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
        # Only once it listens: a proxy that can't bind, because another still serves, leaves that one's
        # record as it is.
        self._record_list()
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

    def _record_list(self) -> None:
        """Write the list in use where `engine.sh status` reads it (§8). If that fails, remove the last
        record, so status reports none rather than another run's list."""
        if self.list_file is None:
            return
        try:
            write_list_file(self.list_file, self.settings)
        except OSError as error:
            print(
                f"egress-proxy: could not record the list in {self.list_file}: {error}",
                file=sys.stderr,
            )
            try:
                os.unlink(self.list_file)
            except OSError:
                pass

    def shutdown(self) -> None:
        self._stop.set()
        if self._server_socket is not None:
            # On Linux a close alone doesn't wake an accept() blocked in another thread; this does.
            _close(self._server_socket)


def _read_request_head(
    sock: socket.socket, limit: int = HEAD_LIMIT
) -> tuple[str, bytes, bytes] | None:
    """Read up to the blank line that ends the head.

    Return (the request line, the header lines, the bytes that came after the head), or None when the
    client sent nothing at all. A head that doesn't end within `limit` bytes, or before the client
    stops sending, has no request line the proxy will act on, so it comes back empty and is refused.
    """
    buffer = b""
    sock.settimeout(CONNECT_TIMEOUT)
    while b"\r\n\r\n" not in buffer and len(buffer) < limit:
        chunk = sock.recv(BUFFER)
        if not chunk:
            break
        buffer += chunk
    if not buffer:
        return None
    head, end, leftover = buffer.partition(b"\r\n\r\n")
    if not end or len(head) > limit:
        return "", b"", b""
    first, _, rest = head.partition(b"\r\n")
    return first.decode("latin-1").strip(), rest, leftover


def _close(sock: socket.socket) -> None:
    try:
        sock.shutdown(socket.SHUT_RDWR)
    except OSError:
        pass
    try:
        sock.close()
    except OSError:
        pass


USAGE = "usage: egress-proxy.py [--list <settings.json>]"


def main(argv: list[str] | None = None) -> int:
    """Serve, or with `--list <settings.json>`, print the list those settings give and exit.

    `--list` prints `list_json`'s one line and exits 0, or EXIT_NO_LIST (3) when the settings yield no
    list. It starts no listener and records nothing: `engine.sh status` runs it to set the settings'
    current digest beside the running proxy's (§8).
    """
    args = sys.argv[1:] if argv is None else argv
    if args:
        if len(args) != 2 or args[0] != "--list":
            print(USAGE, file=sys.stderr)
            return 2
        settings = Settings.load(args[1])
        print(list_json(settings))
        return 0 if settings.ok else EXIT_NO_LIST

    settings_path = os.environ.get("H4_EGRESS_SETTINGS", ".claude/settings.json")
    log_path = os.environ.get(
        "H4_EGRESS_LOG",
        str(Path.home() / ".local/state/h4reet/agents-engine/egress.jsonl"),
    )
    list_file = os.environ.get(
        "H4_EGRESS_LIST_FILE", os.path.expanduser(LIST_FILE_DEFAULT)
    )
    host = os.environ.get("H4_EGRESS_HOST", LISTEN_DEFAULT[0])
    port = int(os.environ.get("H4_EGRESS_PORT", str(LISTEN_DEFAULT[1])))
    settings = Settings.load(settings_path)
    if not settings.ok:
        print(
            f"egress-proxy: no usable list in {settings_path}: every request is refused (no_list)",
            file=sys.stderr,
        )
    proxy = EgressProxy(settings, EgressLog(log_path), list_file=list_file)
    proxy.serve((host, port))
    return 0


if __name__ == "__main__":
    sys.exit(main())
