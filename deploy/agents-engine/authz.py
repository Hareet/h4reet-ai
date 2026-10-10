#!/usr/bin/env python3
"""The agents' engine admission plugin (spec 000, FR-039; contracts/agents-engine.md §3).

A Docker authorization plugin (plugin API v1), standard library only. It is consulted by
`dockerd-rootless` on every API call. `Plugin.Activate` answers `{"Implements": ["authz"]}`;
`AuthZPlugin.AuthZReq` judges a request; `AuthZPlugin.AuthZRes` always allows (only requests are
judged). The judging logic is pure (`judge`), so the tests exercise every rule A0-A35, `default_deny`,
and `malformed` on recorded Docker API request bodies without a daemon.

This file is human-only: it is the FR-039 boundary. The copy that runs is the root-owned one
`engine.sh setup` installs at `/usr/local/lib/h4agents/authz.py`, never the working tree's file
(contracts/agents-engine.md §5, H13). Run by path through `PY_HOST`, never with `-m`.

Fail closed: an endpoint not in the table, a request the plugin can't parse, or any internal error
is a refusal (ADR 0016). The daemon itself refuses every request when the plugin is down (row E12).
"""

from __future__ import annotations

import base64
import json
import os
import posixpath
import re
import sys
import threading
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler
from socketserver import ThreadingMixIn, UnixStreamServer
from urllib.parse import unquote

# --- The three bind roots (contracts/agents-engine.md §3.4). Nothing else may be a bind source. ---
RO_ROOTS = (
    "/run/h4agents/tree",
    "/run/h4agents/models",
)  # read-only: the masked tree and the model
STATE_ROOT = "/var/lib/h4agents/state"  # read-write: the engine stack's journal and incident drafts

MAX_BODY = (
    1 << 20
)  # Docker forwards bodies up to 1 MiB; a larger one arrives without its body (A0).

# Docker's default capability set, without the CAP_ prefix, upper-cased (A5). Adding these back after
# cap_drop: [ALL] gives a container nothing it would not have by default; plan §1's databases do that.
DEFAULT_CAPS = frozenset(
    {
        "CHOWN",
        "DAC_OVERRIDE",
        "FSETID",
        "FOWNER",
        "MKNOD",
        "NET_RAW",
        "SETGID",
        "SETUID",
        "SETFCAP",
        "SETPCAP",
        "NET_BIND_SERVICE",
        "SYS_CHROOT",
        "KILL",
        "AUDIT_WRITE",
    }
)

# SecurityOpt: only no-new-privileges, in the three spellings Docker accepts (A6).
NNP_ALLOWED = frozenset(
    {"no-new-privileges", "no-new-privileges:true", "no-new-privileges=true"}
)

# Bind options. `rw` is allowed only under the state root; the mode governs the read-only roots.
BIND_OPTS_ALLOWED = frozenset({"ro", "rw", "nocopy", "private", "rprivate"})
LOG_DRIVERS_ALLOWED = frozenset({"", "local", "json-file", "none"})
PROPAGATION_ALLOWED = frozenset({"", "private", "rprivate"})

_VERSION_RE = re.compile(r"^/v[0-9]+(?:\.[0-9]+)*/")
_SLASHES_RE = re.compile(r"/{2,}")
_ID = r"[^/]+"
_IMG = r".+"  # an image reference can hold slashes: registry/repo/name


class Malformed(Exception):
    """A path that still holds `..`, or that decodes differently a second time (§3.2); or a body whose
    objects repeat a key, as Docker would read it (§3.1)."""


class Folded(dict):
    """A JSON object read the way Docker reads it (§3.1).

    The daemon decodes request bodies with Go's encoding/json, which matches an object key to a struct field
    "preferring an exact match but also accepting a case-insensitive match", under Unicode simple folding: so
    `"hostconfig": {"privileged": true}` is a privileged container, and so is a key spelled with U+017F for
    an s or U+212A for a k. Keys are stored casefolded, the wider folding, so every lookup sees what the daemon
    sees. Two keys that fold together are refused: Go decodes both into one field, and merges a repeated
    object or map instead of replacing it, so the plugin and the daemon would read different requests.
    """

    def __init__(self, pairs: list[tuple[str, object]]):
        super().__init__()
        for key, value in pairs:
            folded = key.casefold()
            if super().__contains__(folded):
                raise Malformed(f"repeated key {key!r}")
            super().__setitem__(folded, value)

    def get(self, key: str, default: object = None) -> object:  # type: ignore[override]
        return super().get(key.casefold(), default)

    def __getitem__(self, key: str) -> object:
        return super().__getitem__(key.casefold())

    def __contains__(self, key: object) -> bool:
        return isinstance(key, str) and super().__contains__(key.casefold())


@dataclass
class Decision:
    """One admission decision. `path` is the logged form: normalized, query keys without values."""

    allow: bool
    rule: str
    endpoint: str = ""
    method: str = ""
    path: str = ""
    field: str | None = None
    value: str | None = None
    container: str | None = None
    image: str | None = None


# --------------------------------------------------------------------------------------------------
# Path normalization (§3.2 step 1)
# --------------------------------------------------------------------------------------------------
def normalize(uri: str) -> tuple[str, str]:
    """Return (normalized path, raw query string). Raise Malformed per §3.2.

    Strip a version prefix, split off the query, collapse repeated slashes, percent-decode once.
    A path that still holds `..`, or that decodes to something different a second time, is malformed.
    """
    raw_path, _, query = uri.partition("?")
    stripped = _VERSION_RE.sub("/", raw_path)
    collapsed = _SLASHES_RE.sub("/", stripped)
    decoded = unquote(collapsed)
    if unquote(decoded) != decoded:
        raise Malformed("double-encoded")
    if not decoded.startswith("/"):
        raise Malformed("not absolute")
    if ".." in decoded.split("/"):
        raise Malformed("traversal")
    return decoded, query


def _query_keys(query: str) -> list[str]:
    """The query's keys, never its values (§3.5)."""
    keys = []
    for part in query.split("&"):
        if not part:
            continue
        key = unquote(part.split("=", 1)[0])
        if key:
            keys.append(key)
    return keys


def _logged_path(path: str, query: str) -> str:
    keys = _query_keys(query)
    return f"{path}?{'&'.join(sorted(set(keys)))}" if keys else path


def _query_value(query: str, name: str) -> str:
    for part in query.split("&"):
        key, _, value = part.partition("=")
        if unquote(key) == name:
            return unquote(value)
    return ""


# --------------------------------------------------------------------------------------------------
# Endpoint table (§3.2)
# --------------------------------------------------------------------------------------------------
def _p(pattern: str) -> re.Pattern[str]:
    return re.compile(r"^" + pattern + r"$")


# (methods, compiled path, endpoint name, action). First match wins. GET and HEAD are judged
# separately (read-only). `action` is "create"/"start"/"update"/"exec"/"volumes_create"/
# "networks_create"/"build" (parse the body), "allow", or ("refuse", rule).
_RULES: list[tuple[frozenset[str], re.Pattern[str], str, object]] = [
    (frozenset({"POST"}), _p(r"/containers/create"), "containers.create", "create"),
    (
        frozenset({"POST"}),
        _p(r"/containers/" + _ID + r"/start"),
        "containers.start",
        "start",
    ),
    (
        frozenset({"POST"}),
        _p(r"/containers/" + _ID + r"/update"),
        "containers.update",
        "update",
    ),
    (
        frozenset({"POST"}),
        _p(r"/containers/" + _ID + r"/exec"),
        "containers.exec",
        "exec",
    ),
    (frozenset({"POST"}), _p(r"/volumes/create"), "volumes.create", "volumes_create"),
    (
        frozenset({"POST"}),
        _p(r"/networks/create"),
        "networks.create",
        "networks_create",
    ),
    (frozenset({"POST"}), _p(r"/build"), "build", "build"),
    (
        frozenset({"POST"}),
        _p(r"/images/" + _IMG + r"/push"),
        "images.push",
        ("refuse", "A32"),
    ),
    (frozenset({"POST"}), _p(r"/auth"), "auth", ("refuse", "A33")),
    # Plugin installs and swarm endpoints. GET is handled above as read-only.
    (
        frozenset({"POST", "PUT", "DELETE"}),
        _p(r"/plugins(/.*)?"),
        "plugins",
        ("refuse", "A28"),
    ),
    (
        frozenset({"POST", "PUT", "DELETE"}),
        _p(r"/(swarm|services|nodes|secrets|configs|tasks)(/.*)?"),
        "swarm",
        ("refuse", "A29"),
    ),
    # Allowed mutating endpoints: the engine is disposable.
    (
        frozenset({"POST"}),
        _p(
            r"/containers/"
            + _ID
            + r"/(stop|kill|restart|wait|attach|attach/ws|resize|rename|pause|unpause)"
        ),
        "containers.write",
        "allow",
    ),
    (frozenset({"DELETE"}), _p(r"/containers/" + _ID), "containers.delete", "allow"),
    (
        frozenset({"PUT"}),
        _p(r"/containers/" + _ID + r"/archive"),
        "containers.archive",
        "allow",
    ),
    (
        frozenset({"POST"}),
        _p(r"/exec/" + _ID + r"/(start|resize)"),
        "exec.write",
        "allow",
    ),
    (
        frozenset({"POST"}),
        _p(r"/networks/" + _ID + r"/(connect|disconnect)"),
        "networks.write",
        "allow",
    ),
    (frozenset({"DELETE"}), _p(r"/networks/" + _ID), "networks.delete", "allow"),
    (frozenset({"DELETE"}), _p(r"/volumes/" + _ID), "volumes.delete", "allow"),
    (
        frozenset({"POST"}),
        _p(r"/(containers|images|networks|volumes|build)/prune"),
        "prune",
        "allow",
    ),
    (frozenset({"POST"}), _p(r"/images/create"), "images.create", "allow"),
    (frozenset({"POST"}), _p(r"/images/load"), "images.load", "allow"),
    (frozenset({"POST"}), _p(r"/images/" + _IMG + r"/tag"), "images.tag", "allow"),
    (frozenset({"DELETE"}), _p(r"/images/" + _IMG), "images.delete", "allow"),
    (frozenset({"POST"}), _p(r"/commit"), "commit", "allow"),
    (frozenset({"POST"}), _p(r"/(session|grpc)"), "buildkit", "allow"),
]


def match_endpoint(method: str, path: str) -> tuple[str, object]:
    """Return (endpoint name, action). GET and HEAD are read-only. Otherwise the table, then deny."""
    if method in ("GET", "HEAD"):
        return "read", "allow"
    for methods, pattern, name, action in _RULES:
        if method in methods and pattern.match(path):
            return name, action
    return "", ("refuse", "default_deny")


# --------------------------------------------------------------------------------------------------
# Field helpers
# --------------------------------------------------------------------------------------------------
def _is_empty(value: object) -> bool:
    """Absent, null, or an empty collection."""
    return value is None or value == [] or value == {} or value == ""


def _under(path: str, root: str) -> bool:
    return path == root or path.startswith(root + "/")


def _bind_decision(source: str, mode_ro: bool) -> tuple[bool, str | None]:
    """Judge one absolute bind source and its mode. Return (ok, offending detail)."""
    if ".." in source.split("/"):
        return False, f"{source} (traversal)"
    normalized = posixpath.normpath(source)
    # A second layer: resolve a real path where the plugin can see it and refuse one leaving its root.
    resolved = os.path.realpath(source) if os.path.exists(source) else normalized
    for candidate in {normalized, resolved}:
        in_ro = any(_under(candidate, root) for root in RO_ROOTS)
        in_state = _under(candidate, STATE_ROOT)
        if not in_ro and not in_state:
            return False, source
        if in_ro and not mode_ro:
            return False, f"{source} (rw under a read-only root)"
    return True, None


def _parse_bind(spec: str) -> tuple[bool, str | None]:
    """A `source:target[:options]` string (A14)."""
    parts = spec.split(":")
    if len(parts) < 2 or len(parts) > 3:
        return False, spec  # fail closed on an unexpected shape
    source = parts[0]
    options = parts[2].split(",") if len(parts) == 3 else []
    if not source.startswith("/"):
        return True, None  # a named volume
    for opt in options:
        if opt and opt not in BIND_OPTS_ALLOWED:
            return False, f"{source} (option {opt})"
    mode_ro = (
        "ro" in options
    )  # no explicit mode means rw, which the read-only roots refuse
    return _bind_decision(source, mode_ro)


def _volume_driver_ok(driver: str, opts: dict) -> bool:
    """A17: driver empty or local, with no options, or tmpfs options only."""
    if driver not in ("", "local"):
        return False
    if not opts:
        return True
    kind = str(opts.get("type", ""))
    device = str(opts.get("device", ""))
    o_field = str(opts.get("o", ""))
    if kind != "tmpfs":
        return False  # any type but tmpfs (nfs, cifs, none, …)
    if device not in ("", "tmpfs"):
        return False  # a device that is a path is a bind mount in disguise
    tokens = {token.strip() for token in o_field.split(",") if token.strip()}
    if tokens & {"bind", "rbind"}:
        return False
    for key in opts:
        if key not in ("type", "device", "o", "size", "mode"):
            return False
    return True


# --------------------------------------------------------------------------------------------------
# The container-create field rules (§3.3, §3.4). The first refusal wins.
# --------------------------------------------------------------------------------------------------
def _refuse(rule: str, field: str, value: object) -> Decision:
    return Decision(False, rule, field=field, value=str(value))


LOOPBACK_PUBLISH = ("127.0.0.1", "::1")
# The host ports the engine may publish on: dev-cpu's x000-x004 (deploy/env.agents/dev-cpu.vars) and the one
# prove-limits.sh's row E15 runs on. Any other loopback port may be another stack's while it is down: prod's and
# dev's 18000-18004 and 18100-18104 hold their admin listeners and the Author's Langfuse and Grafana logins, so a
# container squatting there would be handed the Author's token or password (A21; T056's review, round 2).
PUBLISH_PORTS = frozenset((*range(18300, 18305), 18999))


def _publish_port_ok(value: object) -> bool:
    """A HostPort of PUBLISH_PORTS, as one plain decimal string: never empty (Docker would choose a port), a range,
    or any other spelling. No leading zeros either, so the rule never rests on another parser reading a padded
    number as this one does."""
    return (
        isinstance(value, str)
        and value.isascii()
        and value.isdigit()
        and value == str(int(value))
        and int(value) in PUBLISH_PORTS
    )


def _check_create(body: dict) -> Decision | None:
    host = body.get("HostConfig") or {}
    if not isinstance(host, dict):
        return _refuse("A0", "HostConfig", "not an object")
    # Older daemons' create wrapper also embedded a HostConfig at the top level, to read fields "not in the
    # inner host config", so the same rules hold the body itself. No top-level Config field shares a name
    # with a field below, so a body from the docker CLI or compose is judged exactly as before.
    for scope in (host, body):
        decision = _check_host(scope)
        if decision is not None:
            return decision
    return None


def _check_host(host: dict) -> Decision | None:
    if host.get("Privileged") is True:
        return _refuse("A1", "HostConfig.Privileged", True)
    if not _is_empty(host.get("Devices")):
        return _refuse("A2", "HostConfig.Devices", host.get("Devices"))
    if not _is_empty(host.get("DeviceRequests")):
        return _refuse("A3", "HostConfig.DeviceRequests", host.get("DeviceRequests"))
    if not _is_empty(host.get("DeviceCgroupRules")):
        return _refuse(
            "A4", "HostConfig.DeviceCgroupRules", host.get("DeviceCgroupRules")
        )

    for cap in host.get("CapAdd") or []:
        bare = str(cap).upper().removeprefix("CAP_")
        if bare not in DEFAULT_CAPS:
            return _refuse("A5", "HostConfig.CapAdd", cap)

    for opt in host.get("SecurityOpt") or []:
        if str(opt) not in NNP_ALLOWED:
            return _refuse("A6", "HostConfig.SecurityOpt", opt)

    # A7: allowed only when absent or null, so Docker's defaults apply. Any value, even the
    # defaults spelled out or an empty list, is refused.
    for key in ("MaskedPaths", "ReadonlyPaths"):
        if key in host and host[key] is not None:
            return _refuse("A7", f"HostConfig.{key}", host[key])

    namespace_rules = (
        ("A8", "PidMode", lambda v: v == "" or v.startswith("container:")),
        (
            "A9",
            "IpcMode",
            lambda v: (
                v in ("", "private", "shareable", "none") or v.startswith("container:")
            ),
        ),
        ("A10", "UTSMode", lambda v: v == ""),
        ("A11", "UsernsMode", lambda v: v == ""),
        ("A12", "CgroupnsMode", lambda v: v in ("", "private")),
        ("A13", "NetworkMode", lambda v: v != "host"),
    )
    for rule, key, ok in namespace_rules:
        value = str(host.get(key) or "")
        if not ok(value):
            return _refuse(rule, f"HostConfig.{key}", value or "host")
    if not _is_empty(host.get("Cgroup")):
        return _refuse("A12", "HostConfig.Cgroup", host.get("Cgroup"))

    if str(host.get("VolumeDriver") or "") not in ("", "local"):
        return _refuse("A16", "HostConfig.VolumeDriver", host.get("VolumeDriver"))
    if not _is_empty(host.get("Sysctls")):
        return _refuse("A19", "HostConfig.Sysctls", host.get("Sysctls"))
    if str(host.get("Runtime") or "") not in ("", "runc"):
        return _refuse("A20", "HostConfig.Runtime", host.get("Runtime"))

    log_config = host.get("LogConfig") or {}
    if (
        isinstance(log_config, dict)
        and str(log_config.get("Type") or "") not in LOG_DRIVERS_ALLOWED
    ):
        return _refuse("A24", "HostConfig.LogConfig.Type", log_config.get("Type"))

    for spec in host.get("Binds") or []:
        ok, detail = _parse_bind(str(spec))
        if not ok:
            return _refuse("A14", "HostConfig.Binds", detail)

    # A21: a published port names the host's loopback, and one of PUBLISH_PORTS. Docker reads a missing or
    # empty HostIp as every interface, and RootlessKit's port driver would then listen on the WSL VM's own
    # interfaces as h4agents, a way in that no allowlist governs (H3). PublishAllPorts publishes every exposed
    # port that way. A loopback port outside PUBLISH_PORTS may be a stopped stack's, where the Author's clients
    # would hand their credentials to the container.
    if host.get("PublishAllPorts"):
        return _refuse("A21", "HostConfig.PublishAllPorts", True)
    bindings = host.get("PortBindings")
    if not _is_empty(bindings):
        if not isinstance(bindings, dict):
            return _refuse("A21", "HostConfig.PortBindings", "not an object")
        for port, entries in bindings.items():
            if entries is None:
                continue  # exposed, not published
            for entry in entries if isinstance(entries, list) else [entries]:
                address = entry.get("HostIp") if isinstance(entry, dict) else None
                if address not in LOOPBACK_PUBLISH:
                    return _refuse(
                        "A21",
                        "HostConfig.PortBindings",
                        f"{port} on {address or 'every interface'}",
                    )
                host_port = entry.get("HostPort") if isinstance(entry, dict) else None
                if not _publish_port_ok(host_port):
                    chosen = host_port or "chosen by the daemon"
                    return _refuse(
                        "A21",
                        "HostConfig.PortBindings",
                        f"{port} on host port {chosen}",
                    )

    mount_decision = _check_mounts(host.get("Mounts") or [])
    if mount_decision is not None:
        return mount_decision
    return None


def _check_mounts(mounts: list) -> Decision | None:
    for mount in mounts:
        if not isinstance(mount, dict):
            return _refuse("A15", "HostConfig.Mounts", "not an object")
        kind = str(mount.get("Type") or "")
        if kind in ("npipe", "cluster"):
            return _refuse("A15", "HostConfig.Mounts.Type", kind)
        if kind == "bind":
            source = str(mount.get("Source") or "")
            read_only = bool(mount.get("ReadOnly"))
            ok, detail = _bind_decision(source, read_only)
            if not ok:
                return _refuse("A15", "HostConfig.Mounts", detail)
            propagation = str(
                ((mount.get("BindOptions") or {}).get("Propagation")) or ""
            )
            if propagation not in PROPAGATION_ALLOWED:
                return _refuse(
                    "A15", "HostConfig.Mounts.BindOptions.Propagation", propagation
                )
        elif kind == "volume":
            volume_options = mount.get("VolumeOptions") or {}
            driver_config = volume_options.get("DriverConfig") or {}
            driver = str(driver_config.get("Name") or "")
            opts = driver_config.get("Options") or {}
            if not _volume_driver_ok(driver, opts if isinstance(opts, dict) else {}):
                return _refuse("A17", "HostConfig.Mounts.VolumeOptions", driver or opts)
        elif kind in ("tmpfs", "image"):
            continue
        else:
            return _refuse("A15", "HostConfig.Mounts.Type", kind or "unset")
    return None


# --------------------------------------------------------------------------------------------------
# judge: the whole decision for one request
# --------------------------------------------------------------------------------------------------
def judge(method: str, uri: str, body: bytes) -> Decision:
    """Judge one Docker API request. Never raises: any error is a refusal (fail closed).

    The common name only names who acted in the audit log; both identities are held to the same
    rules (§2.1), so the decision does not depend on the user.
    """
    method = (method or "").upper()
    raw_path = uri.partition("?")[0]
    try:
        return _judge(method, uri, body)
    except Malformed:
        return Decision(False, "malformed", method=method, path=raw_path)
    except Exception as exc:  # noqa: BLE001 — the boundary fails closed on any error (ADR 0016)
        return Decision(
            False, "error", method=method, path=raw_path, value=type(exc).__name__
        )


def _judge(method: str, uri: str, body: bytes) -> Decision:
    path, query = normalize(uri)
    logged = _logged_path(path, query)
    endpoint, action = match_endpoint(method, path)

    def finish(decision: Decision) -> Decision:
        decision.endpoint = endpoint
        decision.method = method
        decision.path = logged
        return decision

    if action == "allow":
        return finish(Decision(True, "allow"))
    if isinstance(action, tuple):  # ("refuse", rule)
        return finish(Decision(False, action[1]))

    # Endpoints that take a body.
    if action == "start":
        # A27: the legacy start-time HostConfig. Refused with any non-empty body.
        if body and body.strip() not in (b"", b"{}", b"null"):
            return finish(
                Decision(False, "A27", field="HostConfig", value="non-empty start body")
            )
        return finish(Decision(True, "allow"))

    if action == "build":
        # A30: build's body is a tar context, never JSON. The limits are query parameters:
        # host networking, and a `remote` context the daemon would fetch itself.
        if _query_value(query, "networkmode") == "host":
            return finish(Decision(False, "A30", field="networkmode", value="host"))
        if _query_value(query, "remote"):
            return finish(
                Decision(False, "A30", field="remote", value="remote context")
            )
        return finish(Decision(True, "allow"))

    if len(body) > MAX_BODY:
        return finish(Decision(False, "A0", field="body", value="oversized"))
    if not body or not body.strip():
        return finish(Decision(False, "A0", field="body", value="empty"))
    try:
        parsed = json.loads(body, object_pairs_hook=Folded)
    except (ValueError, UnicodeDecodeError):
        return finish(Decision(False, "A0", field="body", value="non-JSON"))
    if not isinstance(parsed, dict):
        return finish(Decision(False, "A0", field="body", value="not an object"))

    if action == "create":
        container = _query_value(query, "name") or None
        image = (
            str((parsed.get("Config") or {}).get("Image") or parsed.get("Image") or "")
            or None
        )
        refusal = _check_create(parsed)
        decision = refusal if refusal is not None else Decision(True, "allow")
        decision.container = container
        decision.image = image
        return finish(decision)
    if action == "exec":
        if parsed.get("Privileged") is True:
            return finish(Decision(False, "A25", field="Privileged", value=True))
        return finish(Decision(True, "allow"))
    if action == "update":
        for key in ("Devices", "DeviceRequests", "DeviceCgroupRules"):
            if not _is_empty(parsed.get(key)):
                return finish(Decision(False, "A26", field=key, value=parsed.get(key)))
        return finish(Decision(True, "allow"))
    if action == "volumes_create":
        driver = str(parsed.get("Driver") or "")
        opts = parsed.get("DriverOpts") or {}
        if not _volume_driver_ok(driver, opts if isinstance(opts, dict) else {}):
            return finish(
                Decision(False, "A17", field="DriverOpts", value=driver or opts)
            )
        return finish(Decision(True, "allow"))
    if action == "networks_create":
        driver = str(parsed.get("Driver") or "")
        if driver not in ("", "bridge"):
            return finish(Decision(False, "A35", field="Driver", value=driver))
        return finish(Decision(True, "allow"))

    return finish(Decision(False, "default_deny"))  # unreachable; deny by default


# --------------------------------------------------------------------------------------------------
# The audit record (§3.5)
# --------------------------------------------------------------------------------------------------
def audit_record(decision: Decision, user: str) -> dict:
    """One JSON-serializable record per decision. Never an env var, a command, or a body."""
    record = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
        + f".{int(time.time() * 1000) % 1000:03d}Z",
        "decision": "allow" if decision.allow else "refuse",
        "rule": decision.rule,
        "user": user,
        "method": decision.method,
        "path": decision.path,
        "endpoint": decision.endpoint,
    }
    if not decision.allow:
        if decision.field is not None:
            record["field"] = decision.field
        if decision.value is not None:
            record["value"] = decision.value
    if decision.endpoint == "containers.create":
        record["container"] = decision.container
        record["image"] = decision.image
    return record


# --------------------------------------------------------------------------------------------------
# The rotating audit log
# --------------------------------------------------------------------------------------------------
class AuditLog:
    """One JSON line per decision, rotated at 10 MB, keeping 5 files (§3.5)."""

    MAX_BYTES = 10 * 1024 * 1024
    KEEP = 5
    WARN_EVERY = 60.0  # seconds between two reports of records it can't write

    def __init__(self, path: str):
        self.path = path
        self._lock = threading.Lock()
        self._warned = float("-inf")

    def write(self, record: dict) -> None:
        line = json.dumps(record, separators=(",", ":"), sort_keys=True) + "\n"
        data = line.encode("utf-8")
        failed: OSError | None = None
        with self._lock:
            try:
                if (
                    os.path.exists(self.path)
                    and os.path.getsize(self.path) + len(data) > self.MAX_BYTES
                ):
                    self._rotate()
                flags = os.O_WRONLY | os.O_CREAT | os.O_APPEND
                fd = os.open(self.path, flags, 0o640)
                try:
                    os.write(fd, data)
                finally:
                    os.close(fd)
            except OSError as err:
                failed = err
        if failed is not None:
            self._report(failed)

    def _report(self, err: OSError) -> None:
        """The block still happens when the record can't be written (§3.1), but not silently: the journal shows
        it, once a minute. A root-owned directory lost every record unseen (T046, 2026-10-09). The path and the
        error only, never the record. A report that fails to print is dropped too, so the request still gets
        its answer."""
        now = time.monotonic()
        if now - self._warned < self.WARN_EVERY:
            return
        self._warned = now
        try:
            print(
                f"h4-authz: cannot write the audit log {self.path}: {err.strerror or err}",
                file=sys.stderr,
                flush=True,
            )
        except (OSError, ValueError):
            pass

    def _rotate(self) -> None:
        oldest = f"{self.path}.{self.KEEP}"
        if os.path.exists(oldest):
            os.remove(oldest)
        for index in range(self.KEEP - 1, 0, -1):
            src = f"{self.path}.{index}"
            if os.path.exists(src):
                os.replace(src, f"{self.path}.{index + 1}")
        if os.path.exists(self.path):
            os.replace(self.path, f"{self.path}.1")


# --------------------------------------------------------------------------------------------------
# The plugin server (Unix socket, plugin API v1)
# --------------------------------------------------------------------------------------------------
class _ThreadingUnixServer(ThreadingMixIn, UnixStreamServer):
    daemon_threads = True
    allow_reuse_address = True


class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "h4-authz/1"

    def log_message(self, *args: object) -> None:  # silence default stderr logging
        pass

    def _send(self, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # http.server requires this exact method name
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        if self.path.endswith("/Plugin.Activate"):
            self._send({"Implements": ["authz"]})
            return
        if self.path.endswith("/AuthZPlugin.AuthZRes"):
            self._send({"Allow": True})  # only requests are judged (§3.1)
            return
        if self.path.endswith("/AuthZPlugin.AuthZReq"):
            self._handle_req(raw)
            return
        self._send({"Allow": False, "Msg": "unknown plugin endpoint"})

    def _handle_req(self, raw: bytes) -> None:
        log: AuditLog = self.server.audit_log  # type: ignore[attr-defined]
        try:
            request = json.loads(raw) if raw else {}
            method = request.get("RequestMethod", "")
            uri = request.get("RequestUri", "")
            # No certificate: a client on the daemon's own unix socket, which is h4agents itself (§2.1).
            user = request.get("User") or "unknown"
            body_field = request.get("RequestBody")
            body = base64.b64decode(body_field) if body_field else b""
        except (ValueError, TypeError):  # binascii.Error subclasses ValueError
            self._send({"Allow": False, "Msg": "unreadable authz request"})
            return
        decision = judge(method, uri, body)
        log.write(audit_record(decision, user))
        if decision.allow:
            self._send({"Allow": True})
        else:
            self._send(
                {"Allow": False, "Msg": f"refused by h4-authz ({decision.rule})"}
            )


def serve(socket_path: str, log_path: str) -> None:
    """Run the plugin on a Unix socket. Replaces a stale socket atomically."""
    directory = os.path.dirname(socket_path)
    os.makedirs(directory, exist_ok=True)
    if os.path.exists(socket_path):
        os.remove(socket_path)
    server = _ThreadingUnixServer(socket_path, _Handler)
    server.audit_log = AuditLog(log_path)  # type: ignore[attr-defined]
    os.chmod(socket_path, 0o660)
    try:
        server.serve_forever()
    finally:
        server.server_close()
        if os.path.exists(socket_path):
            os.remove(socket_path)


def main() -> int:
    runtime = os.environ.get("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")
    socket_path = os.environ.get(
        "H4_AUTHZ_SOCKET", f"{runtime}/docker/plugins/h4-authz.sock"
    )
    log_path = os.environ.get("H4_AUTHZ_LOG", "/var/log/h4agents/authz.jsonl")
    serve(socket_path, log_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
