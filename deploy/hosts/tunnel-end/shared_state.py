#!/usr/bin/env python3
"""The shared state's host parts on the tunnel end (spec 001 tasks.md T164; FR-019, FR-060; contracts/shared-state.md
§1 to §3, §8; plan.md §16, "The shared state on the tunnel end"). From the release's tree, never the user data: the
deployer runs `prepare` before each start of the tunnel end's class (deploy/scripts/deployer.py, HOST_STEPS), and
`prepare` installs this file and the backup's units from the same tree. Runs on the host as root.

    python3 -I -B shared_state.py prepare --tree TREE   the deployer's host step
    python3 -I -B shared_state.py backup                h4-shared-state-backup.timer, every hour
    python3 -I -B shared_state.py roles                 the Author's roles target, through Systems Manager
    python3 -I -B shared_state.py restore               the Author's restore target: the dump's URL on stdin

prepare:  the data volume, /dev/sdf, formatted once while it holds no filesystem, mounted at /srv/h4reet/shared-state;
          the store's TLS key and certificate from Parameter Store to /run/h4reet/shared-state on tmpfs, 0400, the
          container's user's (70, the image's postgres), and a superuser password nobody keeps, which only the image's
          first start reads; this file and the backup's units installed, and the timer enabled; and, from group 10, the
          public view's write, deploy/scripts/snapshot_sink.py, with its unit, enabled and restarted; and, from fix F2,
          the private interface's replies: ens5's networkd drop-in (table 105, its two rules) and the marks' table
          with its unit, enabled and loaded (fixes/f2.md); and, from fix F9, never networkd's reload or reconfigure
          on the live interface: the drop-in is written for the next boot, and its route and rules made live here with
          `ip`, ens5's address checked before and after, the step's own changes undone if it went (fixes/f9.md). A
          missing parameter stops it, naming it, and the deployer's start with it; so does a reply route that isn't set.
backup:   pg_dump inside the container, over its socket, as its postgres user; the dump put to
          s3://h4reet-ai-shared-state-<account>/dumps/<UTC>.dump through the egress proxy. The last good dump stays on
          the host. A failed dump or put alerts shared_state_backup_failed once a failing streak, and each run pushes
          h4.shared_state.backup_age_seconds to the tunnel end's collector.
roles:    the four role passwords from Parameter Store, set as SCRAM-SHA-256 verifiers computed here, over the socket,
          on standard input: no password on a command line, in a log, or in the store's own log.
restore:  the dump from the presigned URL on standard input, through the egress proxy; the database dropped and made
          again, and the dump loaded, over the socket. Neither the URL nor the dump is printed.
Python 3.9's syntax, Amazon Linux 2023's python3; the standard library, the AWS CLI, and Docker's.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import time
import urllib.request
from collections.abc import Callable
from pathlib import Path

PREFIX = "[hareet.ai aws]"
CONTAINER = "h4reet-prod-shared-state-1"
COLLECTOR = "h4reet-prod-tunnel-end-collector-1"
NETWORK = "h4reet-prod_egress"
DEVICE = "/dev/sdf"
LABEL = "h4-shared-state"
POSTGRES_UID = 70  # the alpine image's postgres user
DATABASE = "h4reet"
DUMP_MAGIC = b"PGDMP"
TLS_PARAMETERS = {
    "server.key": "/h4reet/tunnel-end/SHARED_STATE_TLS_KEY",
    "server.crt": "/h4reet/tunnel-end/SHARED_STATE_TLS_CERT",
}
ROLE_PARAMETERS = {
    "gateway": "/h4reet/ec2/DB_GATEWAY_PASSWORD",
    "grafana_ro": "/h4reet/ec2/DB_GRAFANA_RO_PASSWORD",
    "relay_ro": "/h4reet/tunnel-end/DB_RELAY_RO_PASSWORD",
    "relay_rw": "/h4reet/tunnel-end/DB_RELAY_RW_PASSWORD",
}
# Each role as migrations 0002 and 0007 make it, so a store whose roles this target makes first matches them.
ROLE_ATTRIBUTES = {
    "gateway": "LOGIN CREATEROLE",
    "grafana_ro": "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT",
    "relay_ro": "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT",
    "relay_rw": "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT",
}
UNITS = (
    "h4-shared-state-backup.service",
    "h4-shared-state-backup.timer",
    # Group 10: the public view's write, a long-lived host service (deploy/scripts/snapshot_sink.py write).
    "h4-snapshot-sink.service",
    # Fix F2: the private interface's replies, marked at each boot (h4-reply-route.nft).
    "h4-reply-route.service",
)
# Fix F2 (specs/001-cloud-elevation/fixes/f2.md): what comes in by the private interface is answered by it. Its
# networkd drop-in (table 105 and the two rules) and the marks' table, from the release's tree.
REPLY_UNIT = "h4-reply-route.service"
REPLY_TABLE = "h4-reply-route.nft"
REPLY_DROPIN = "zz-h4-reply-route.conf"
PRIVATE_INTERFACE = "ens5"
# Fix F9 (specs/001-cloud-elevation/fixes/f9.md): ens5's fixed address (infra/prod/tunnel-end.tf, private_ips), which
# the relay, the store, and the sink publish on. A release never asks networkd to reload or reconfigure ens5: on
# 2026-11-18 that left it with no IPv4, and the release couldn't start, nor the one before it. The step checks the
# address before and after its own changes, waiting up to ADDRESS_WAIT seconds for a boot's lease, and SETTLE seconds
# after a change before it reads it again.
PRIVATE_ADDRESS = "10.42.1.10"
ADDRESS_WAIT = 30
SETTLE = 2
# What the step can make live from the drop-in, and how: a route by ens5's DHCP gateway into a table, and a rule by
# source or mark; any other key fails the step before anything changes, so the boot's state and the live one agree.
ROUTE_KEYS = {"Gateway", "Table"}
RULE_KEYS = {"From", "FirewallMark", "Table", "Priority"}
PROXY = "http://127.0.0.1:3128"


class Paths:
    def __init__(
        self,
        data: Path = Path("/srv/h4reet/shared-state"),
        tls: Path = Path("/run/h4reet/shared-state"),
        state: Path = Path("/var/lib/h4reet/shared-state"),
        install: Path = Path("/opt/h4reet/shared-state"),
        units: Path = Path("/etc/systemd/system"),
        snapshot: Path = Path("/opt/h4reet/snapshot"),
        network: Path = Path("/etc/systemd/network/70-ens5.network.d"),
        config: Path = Path("/etc/h4reet"),
    ) -> None:
        self.data, self.tls, self.state, self.install, self.units = (
            data,
            tls,
            state,
            install,
            units,
        )
        self.snapshot = snapshot
        # Fix F2: ens5's networkd drop-in, beside the user data's zz-h4-ec2-route.conf, and the marks' table.
        self.network, self.config = network, config


def iso(epoch: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoch))


def docker_exec(*args: str, stdin: bool = False) -> list[str]:
    """A command inside the store's container, as its postgres user, whom the socket's peer line alone admits."""
    return [
        "docker",
        "exec",
        *(["-i"] if stdin else []),
        "-u",
        "postgres",
        CONTAINER,
        *args,
    ]


def get_parameters(host, names: list[str]) -> tuple[dict[str, str], list[str]]:
    """The parameters' values, decrypted, and the names Parameter Store doesn't hold."""
    code, out = host.run(
        [
            "aws",
            "ssm",
            "get-parameters",
            "--region",
            "us-east-1",
            "--no-cli-pager",
            "--output",
            "json",
            "--with-decryption",
            "--names",
            *names,
        ]
    )
    if code != 0:
        return {}, list(names)
    try:
        doc = json.loads(out.decode() or "{}")
    except ValueError:
        return {}, list(names)
    values = {
        str(p.get("Name")): str(p.get("Value"))
        for p in doc.get("Parameters") or []
        if p.get("Value")
    }
    missing = [n for n in names if n not in values]
    return values, missing


def write_private(host, path: Path, text: str, mode: int, uid: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}")
    if tmp.exists():
        tmp.chmod(0o600)
        tmp.unlink()
    fd = os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as out:
        out.write(text)
    if path.exists():
        path.chmod(0o600)
    os.replace(str(tmp), str(path))
    host.chown(path, uid)
    path.chmod(mode)


# ----------------------------------------------------------------------------------------------------------------------
# The private interface's replies (fixes F2 and F9).


def dropin_sections(text: str) -> list[tuple[str, dict[str, str]]]:
    """systemd's syntax, each section in its order: a section may repeat, and each is its own route or rule."""
    out: list[tuple[str, dict[str, str]]] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith(("#", ";")):
            continue
        if line.startswith("[") and line.endswith("]"):
            out.append((line[1:-1], {}))
        elif out and "=" in line:
            key, _, value = line.partition("=")
            out[-1][1][key.strip()] = value.strip()
        else:
            raise ValueError(f"a line outside any section, {line!r}")
    return out


def live_plan(text: str) -> tuple[list[str], list[dict[str, str]]]:
    """The drop-in's tables, each with a default by ens5's DHCP gateway, and its rules; ValueError, naming the key or
    section, for anything else."""
    tables: list[str] = []
    rules: list[dict[str, str]] = []
    for name, keys in dropin_sections(text):
        if name == "Route":
            unknown = sorted(set(keys) - ROUTE_KEYS)
            if unknown or keys.get("Gateway") != "_dhcp4" or "Table" not in keys:
                raise ValueError(
                    f"[Route] {', '.join(unknown) or 'without Gateway=_dhcp4 and Table='}"
                )
            tables.append(keys["Table"])
        elif name == "RoutingPolicyRule":
            unknown = sorted(set(keys) - RULE_KEYS)
            selector = "From" in keys or "FirewallMark" in keys
            if unknown or not selector or not {"Table", "Priority"} <= set(keys):
                raise ValueError(
                    f"[RoutingPolicyRule] {', '.join(unknown) or 'without a selector, Table=, and Priority='}"
                )
            int(keys.get("FirewallMark", "0"), 0)
            int(keys["Priority"])
            rules.append(keys)
        else:
            raise ValueError(f"[{name}]")
    return tables, rules


def has_address(host) -> bool:
    code, out = host.run(["ip", "-4", "-o", "addr", "show", "dev", PRIVATE_INTERFACE])
    pattern = rf"\binet {re.escape(PRIVATE_ADDRESS)}/\d+\b"
    return code == 0 and re.search(pattern, out.decode(errors="replace")) is not None


def wait_for_address(host) -> bool:
    """The address, waited for while a boot's lease may still be coming, every 2 s, up to ADDRESS_WAIT."""
    for attempt in range(ADDRESS_WAIT // 2 + 1):
        if has_address(host):
            return True
        if attempt < ADDRESS_WAIT // 2:
            host.sleep(2)
    return False


def ip_json(host, args: list[str]) -> list | None:
    code, out = host.run(["ip", "-4", "-j", *args])
    if code != 0:
        return None
    try:
        doc = json.loads(out.decode() or "[]")
    except ValueError:
        return None
    return doc if isinstance(doc, list) else None


def rule_matches(entry: dict, rule: dict[str, str]) -> bool:
    """One of `ip -j rule show`'s entries is the drop-in's rule: the same priority, table, source, and mark."""
    if (
        entry.get("priority") != int(rule["Priority"])
        or str(entry.get("table")) != rule["Table"]
    ):
        return False
    if entry.get("src", "all") != rule.get("From", "all"):
        return False
    if "From" in rule and entry.get("srclen") not in (None, 32):
        return False
    mark = entry.get("fwmark")
    if "FirewallMark" not in rule:
        return mark is None
    try:
        return int(str(mark), 0) == int(rule["FirewallMark"], 0)
    except ValueError:
        return False


def route_args(entry: dict, table: str) -> list[str]:
    """`ip route replace`'s arguments for one of `ip -j route show`'s entries, to put it back."""
    args = [str(entry.get("dst", "default"))]
    if entry.get("gateway"):
        args += ["via", str(entry["gateway"])]
    if entry.get("dev"):
        args += ["dev", str(entry["dev"])]
    args += ["table", table]
    if entry.get("protocol"):
        args += ["proto", str(entry["protocol"])]
    if "metric" in entry:
        args += ["metric", str(entry["metric"])]
    return args


def make_live(
    host, tables: list[str], rules: list[dict[str, str]], undo: list[list[str]]
) -> str | None:
    """The drop-in's routes and rules, live, as networkd makes them at boot: each table's default by ens5's DHCP gateway,
    with that route's proto and metric, then each rule, proto static. Only what's missing is made; what's right is
    left alone. Each change's undo goes first in `undo`. None, or the command that failed."""
    for table in tables:
        current = ip_json(host, ["route", "show", "table", table])
        if current is None:
            return f"ip -4 -j route show table {table}"
        if any(
            e.get("dst") == "default"
            and e.get("dev") == PRIVATE_INTERFACE
            and e.get("gateway")
            for e in current
        ):
            continue
        main = (
            ip_json(host, ["route", "show", "default", "dev", PRIVATE_INTERFACE]) or []
        )
        dhcp = next((e for e in main if e.get("gateway")), None)
        if dhcp is None:
            return (
                f"ip -4 -j route show default dev {PRIVATE_INTERFACE} (no DHCP gateway)"
            )
        ours = [
            "default",
            "via",
            str(dhcp["gateway"]),
            "dev",
            PRIVATE_INTERFACE,
            "table",
            table,
            "proto",
            "dhcp",
        ]
        if "metric" in dhcp:
            ours += ["metric", str(dhcp["metric"])]
        replaced = [
            e
            for e in current
            if e.get("dst") == "default" and e.get("metric") == dhcp.get("metric")
        ]
        command = ["ip", "-4", "route", "replace", *ours]
        if host.run(command)[0] != 0:
            return " ".join(command)
        delete = [
            "ip",
            "-4",
            "route",
            "del",
            *[a for a in ours if a not in ("proto", "dhcp")],
        ]
        undo[0:0] = [
            delete,
            *(
                ["ip", "-4", "route", "replace", *route_args(e, table)]
                for e in replaced
            ),
        ]
    current = ip_json(host, ["rule", "show"])
    if current is None:
        return "ip -4 -j rule show"
    for rule in rules:
        if any(rule_matches(e, rule) for e in current):
            continue
        selector = ["from", rule["From"]] if "From" in rule else []
        if "FirewallMark" in rule:
            selector += ["fwmark", f"{int(rule['FirewallMark'], 0):#x}"]
        tail = [
            "table",
            rule["Table"],
            "priority",
            rule["Priority"],
            "protocol",
            "static",
        ]
        command = ["ip", "-4", "rule", "add", *selector, *tail]
        if host.run(command)[0] != 0:
            return " ".join(command)
        undo[0:0] = [["ip", "-4", "rule", "del", *selector, *tail]]
    return None


def reply_route(host, paths: Paths, dropin: bytes) -> int:
    """Fix F2's parts, by fix F9's rule: ens5's address checked first; the marks' unit enabled and restarted; the drop-in
    written, when its text differs, for networkd at the next boot; its route and rules made live here, never by
    networkd's reload or reconfigure; and the address checked again. A failure, or the address gone, undoes the step's
    own changes (the routes and rules it made, and a changed drop-in's old text; a new drop-in stays, right for the next
    boot and unchanged for a rollback's step), says so, and fails the step."""
    try:
        tables, rules = live_plan(dropin.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as error:
        print(
            f"shared_state: the release's {REPLY_DROPIN} holds {error}, which the host step can't make live: nothing "
            "of the network changed, and the release doesn't start",
            file=sys.stderr,
        )
        return 1
    if not wait_for_address(host):
        print(
            f"shared_state: {PRIVATE_INTERFACE} has no {PRIVATE_ADDRESS} before the host step (waited {ADDRESS_WAIT} s): "
            "nothing of the network changed, and the release doesn't start; docs/runbooks/tunnel-end.md, T058, says "
            "how to set it by hand",
            file=sys.stderr,
        )
        return 1
    if (
        host.run(["systemctl", "enable", REPLY_UNIT])[0] != 0
        or host.run(["systemctl", "restart", REPLY_UNIT])[0] != 0
    ):
        print(
            f"shared_state: the private interface's replies weren't set ({REPLY_UNIT}): the release doesn't start",
            file=sys.stderr,
        )
        return 1
    placed = paths.network / REPLY_DROPIN
    before = placed.read_bytes() if placed.is_file() else None
    undo: list[list[str]] = []

    def put_back(why: str) -> int:
        # A changed drop-in goes back to its old text. A new one stays (the review of bd7e0765, nit 1): its text is
        # right for the next boot, and the rollback that follows runs the previous release's step, which, before this
        # fix, reloaded networkd and reconfigured ens5 whenever the drop-in was missing or changed.
        undone = [" ".join(c) for c in undo if host.run(c)[0] != 0]
        try:
            if before is not None and placed.read_bytes() != before:
                placed.write_bytes(before)
        except OSError:
            undone.append(str(placed))
        left = f"; these didn't undo: {', '.join(undone)}" if undone else ""
        kept = "as it was" if before is not None else "kept for the next boot"
        print(
            f"shared_state: {why}: the step's own changes are undone ({len(undo)} live; the drop-in {kept})"
            f"{left}; the release doesn't start",
            file=sys.stderr,
        )
        return 1

    try:
        if before != dropin:
            paths.network.mkdir(parents=True, exist_ok=True)
            tmp = placed.with_name(f".{placed.name}")
            tmp.write_bytes(dropin)
            tmp.chmod(0o644)
            os.replace(str(tmp), str(placed))
    except OSError as error:
        return put_back(
            f"the release's {REPLY_DROPIN} didn't install ({type(error).__name__})"
        )
    failed = make_live(host, tables, rules, undo)
    if failed is not None:
        return put_back(f"the private interface's replies weren't set ({failed})")
    if undo:
        host.sleep(SETTLE)
    if not has_address(host):
        return put_back(
            f"{PRIVATE_INTERFACE} lost {PRIVATE_ADDRESS} during the host step"
        )
    return 0


def prepare(host, paths: Paths, tree: Path) -> int:
    # 1. The data volume: formatted once, while it holds no filesystem; never again. A volume mounted already isn't
    # probed; blkid's exit 2 alone means no filesystem, and any other failure formats nothing (group 6's review).
    paths.data.mkdir(parents=True, exist_ok=True)
    mounted = host.run(["findmnt", "-n", str(paths.data)])[0] == 0
    if not mounted:
        code, out = host.run(["blkid", "-o", "value", "-s", "TYPE", DEVICE])
        if code not in (0, 2) or (code == 0 and not out.strip()):
            print(
                f"shared_state: blkid couldn't read the data volume (exit {code}): nothing formatted",
                file=sys.stderr,
            )
            return 1
        if code == 2 and host.run(["mkfs.ext4", "-L", LABEL, DEVICE])[0] != 0:
            print(
                "shared_state: the data volume couldn't be formatted", file=sys.stderr
            )
            return 1
        mount = ["mount", "-o", "nodev,nosuid,noexec", DEVICE, str(paths.data)]
        if host.run(mount)[0] != 0:
            print("shared_state: the data volume couldn't be mounted", file=sys.stderr)
            return 1
    # 2. The store's key and certificate, from Parameter Store to tmpfs, before anything is written there.
    values, missing = get_parameters(host, list(TLS_PARAMETERS.values()))
    if missing:
        print(
            f"shared_state: Parameter Store has no {', '.join(missing)}: the Author's shared-state TLS target writes them",
            file=sys.stderr,
        )
        return 1
    paths.tls.mkdir(parents=True, exist_ok=True)
    paths.tls.chmod(0o711)
    for name, parameter in TLS_PARAMETERS.items():
        write_private(host, paths.tls / name, values[parameter], 0o400, POSTGRES_UID)
    write_private(
        host,
        paths.tls / "superuser.password",
        secrets.token_urlsafe(32),
        0o400,
        POSTGRES_UID,
    )
    # 3. This file and the backup's units, from the release's tree; then the timer.
    source = tree / "deploy" / "hosts" / "tunnel-end"
    try:
        paths.install.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(
            str(source / "shared_state.py"), str(paths.install / "shared_state.py")
        )
        (paths.install / "shared_state.py").chmod(0o755)
        # Group 10: the public view's write runs the release's own sink script on the host.
        paths.snapshot.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(
            str(tree / "deploy" / "scripts" / "snapshot_sink.py"),
            str(paths.snapshot / "snapshot_sink.py"),
        )
        (paths.snapshot / "snapshot_sink.py").chmod(0o755)
        paths.units.mkdir(parents=True, exist_ok=True)
        for unit in UNITS:
            shutil.copyfile(str(source / "release" / unit), str(paths.units / unit))
            (paths.units / unit).chmod(0o644)
        # Fix F2: the marks' table, which its unit loads; and ens5's drop-in, read here and written below, after the
        # address is checked (fix F9).
        paths.config.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(
            str(source / "release" / REPLY_TABLE), str(paths.config / REPLY_TABLE)
        )
        (paths.config / REPLY_TABLE).chmod(0o600)
        dropin = (source / "release" / REPLY_DROPIN).read_bytes()
    except OSError as error:
        print(
            f"shared_state: the release's host files didn't install: {type(error).__name__}",
            file=sys.stderr,
        )
        return 1
    host.run(["systemctl", "daemon-reload"])
    # Fix F2: the marks loaded again, whole, and ens5's route and rules in place. Without them the relay's replies time
    # out and the site answers nothing, so a failure fails the step, and the start with it. Fix F9: never by networkd
    # on the live interface (reply_route).
    if reply_route(host, paths, dropin) != 0:
        return 1
    if (
        host.run(["systemctl", "enable", "--now", "h4-shared-state-backup.timer"])[0]
        != 0
    ):
        print("shared_state: the backup timer didn't start", file=sys.stderr)
        return 1
    # The public view's write: enabled, and restarted, so each release's script runs (group 10). A failure here is
    # the view's alone, said, and never stops the store's start.
    if (
        host.run(["systemctl", "enable", "h4-snapshot-sink.service"])[0] != 0
        or host.run(["systemctl", "restart", "h4-snapshot-sink.service"])[0] != 0
    ):
        print("shared_state: the public view's write didn't start", file=sys.stderr)
    return 0


# ----------------------------------------------------------------------------------------------------------------------
# The backup.


def age_payload(age: int, now: float) -> dict:
    """h4.shared_state.backup_age_seconds, as OTLP/HTTP's JSON, for the tunnel end's collector."""
    return {
        "resourceMetrics": [
            {
                "resource": {
                    "attributes": [
                        {
                            "key": "service.name",
                            "value": {"stringValue": "shared-state-backup"},
                        },
                        {
                            "key": "service.namespace",
                            "value": {"stringValue": "h4reet"},
                        },
                    ]
                },
                "scopeMetrics": [
                    {
                        "scope": {"name": "h4-shared-state"},
                        "metrics": [
                            {
                                "name": "h4.shared_state.backup_age_seconds",
                                "unit": "s",
                                "gauge": {
                                    "dataPoints": [
                                        {
                                            "asInt": str(age),
                                            "timeUnixNano": str(
                                                int(now * 1_000_000_000)
                                            ),
                                        }
                                    ]
                                },
                            }
                        ],
                    }
                ],
            }
        ]
    }


def backup_age(payload: dict) -> int:
    (metric,) = payload["resourceMetrics"][0]["scopeMetrics"][0]["metrics"]
    return int(metric["gauge"]["dataPoints"][0]["asInt"])


def read_state(paths: Paths) -> dict:
    try:
        return json.loads((paths.state / "backup.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def keep_state(paths: Paths, state: dict) -> None:
    paths.state.mkdir(parents=True, exist_ok=True)
    tmp = paths.state / ".backup.json"
    tmp.write_text(json.dumps(state, sort_keys=True), encoding="utf-8")
    os.replace(str(tmp), str(paths.state / "backup.json"))


def backup(host, paths: Paths, now: float | None = None) -> int:
    at = time.time() if now is None else now
    state = read_state(paths)
    paths.state.mkdir(parents=True, exist_ok=True)
    pending = paths.state / "pending.dump"
    step = "dump"
    code, out = host.run(
        docker_exec(
            "pg_dump", "--username=postgres", f"--dbname={DATABASE}", "--format=custom"
        )
    )
    ok = code == 0 and out.startswith(DUMP_MAGIC)
    if ok:
        pending.write_bytes(out)
        pending.chmod(0o600)
        step = "put"
        key = f"dumps/{iso(at)}.dump"
        bucket = f"h4reet-ai-shared-state-{host.account()}"
        code, _ = host.run(
            [
                "aws",
                "s3",
                "cp",
                str(pending),
                f"s3://{bucket}/{key}",
                "--region",
                "us-east-1",
                "--no-cli-pager",
                "--only-show-errors",
            ]
        )
        ok = code == 0
    if ok:
        os.replace(str(pending), str(paths.state / "last-good.dump"))
        state = {"last_good_at": at, "last_good_key": key, "failing_since": None}
        keep_state(paths, state)
        host.post_metrics(age_payload(0, at))
        print(f"shared_state: the dump is in its bucket as {key}")
        return 0
    if pending.exists():
        pending.unlink()
    last = state.get("last_good_at")
    if state.get("failing_since") is None:
        host.publish(
            "\n".join(
                [
                    (
                        f"{PREFIX} shared_state_backup_failed: the shared state's hourly dump failed, and the last "
                        "good one is kept"
                    ),
                    f"- step: {step}",
                    f"- last_good: {iso(last) if isinstance(last, (int, float)) else 'none'}",
                ]
            )
        )
        state["failing_since"] = at
    keep_state(paths, state)
    if isinstance(last, (int, float)):
        host.post_metrics(age_payload(int(at - last), at))
    print(f"shared_state: the backup failed at its {step}", file=sys.stderr)
    return 1


# ----------------------------------------------------------------------------------------------------------------------
# The roles and the restore.


def scram_verifier(password: str) -> str:
    """Postgres's SCRAM-SHA-256 verifier for a password (RFC 5802, 7677), computed here so only it reaches the store."""
    salt = secrets.token_bytes(16)
    salted = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 4096)
    client_key = hmac.new(salted, b"Client Key", "sha256").digest()
    stored = hashlib.sha256(client_key).digest()
    server = hmac.new(salted, b"Server Key", "sha256").digest()
    b64 = lambda b: base64.b64encode(b).decode()
    return f"SCRAM-SHA-256$4096:{b64(salt)}${b64(stored)}:{b64(server)}"


# The gateway's right to its database, which the roles target sets and the restore sets again after its CREATE DATABASE:
# a pg_dump without --create carries no database ACLs (group 6's review, I-2).
DATABASE_GRANT = f"GRANT CREATE, CONNECT ON DATABASE {DATABASE} TO gateway"


def roles_sql(passwords: dict[str, str]) -> str:
    lines = ["BEGIN;"]
    for role, attributes in ROLE_ATTRIBUTES.items():
        lines.append(
            "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = "
            f"'{role}') THEN CREATE ROLE {role} {attributes}; END IF; END $$;"
        )
        lines.append(
            f"ALTER ROLE {role} WITH {attributes} PASSWORD '{scram_verifier(passwords[role])}';"
        )
    lines.append(f"{DATABASE_GRANT};")
    for role in ("grafana_ro", "relay_ro", "relay_rw"):
        # The gateway's migrations alter these roles (0002's settings, its grafana_ro password at each start): it
        # needs their admin option, and no membership.
        lines.append(
            f"GRANT {role} TO gateway WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;"
        )
    lines.append("COMMIT;")
    return "\n".join(lines) + "\n"


def psql(*args: str) -> list[str]:
    return docker_exec(
        "psql",
        "--username=postgres",
        "--no-psqlrc",
        "--quiet",
        "--set=ON_ERROR_STOP=1",
        *args,
        stdin=True,
    )


def roles(host, paths: Paths) -> int:
    values, missing = get_parameters(host, list(ROLE_PARAMETERS.values()))
    if missing:
        print(
            f"shared_state: Parameter Store has no {', '.join(missing)}: write each role's password first, and set none",
            file=sys.stderr,
        )
        return 1
    sql = roles_sql({role: values[name] for role, name in ROLE_PARAMETERS.items()})
    code, _ = host.run(psql(f"--dbname={DATABASE}", "--file=-"), data=sql.encode())
    if code != 0:
        print("shared_state: the roles' passwords weren't set", file=sys.stderr)
        return 1
    print(
        f"shared_state: set {', '.join(ROLE_PARAMETERS)}, each as a SCRAM-SHA-256 verifier"
    )
    return 0


def fetch_url(url: str) -> bytes:
    """The dump, through the tunnel end's egress proxy, which allows the backups' bucket."""
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({"https": PROXY}))
    with opener.open(url, timeout=300) as answer:
        return answer.read()


def restore(
    host, paths: Paths, url: str, fetch: Callable[[str], bytes] = fetch_url
) -> int:
    try:
        dump = fetch(url)
    except Exception as error:  # noqa: BLE001 - the URL's error text could carry it; only the class is shown
        print(
            f"shared_state: the dump couldn't be fetched: {type(error).__name__}",
            file=sys.stderr,
        )
        return 1
    if not dump.startswith(DUMP_MAGIC):
        print(
            "shared_state: what the URL answered isn't a pg_dump archive: nothing changed",
            file=sys.stderr,
        )
        return 1
    for statement in (
        f"DROP DATABASE IF EXISTS {DATABASE} WITH (FORCE)",
        f"CREATE DATABASE {DATABASE}",
        DATABASE_GRANT,
    ):
        if host.run(psql("--dbname=postgres", f"--command={statement}"))[0] != 0:
            print(
                f"shared_state: {statement.split(' ', 2)[0].lower()} failed",
                file=sys.stderr,
            )
            return 1
    load = docker_exec(
        "pg_restore",
        "--username=postgres",
        f"--dbname={DATABASE}",
        "--exit-on-error",
        "--single-transaction",
        stdin=True,
    )
    if host.run(load, data=dump)[0] != 0:
        # One transaction: a load that fails part way rolls back whole.
        print(
            "shared_state: the dump didn't load, and nothing of it was kept: the store is empty, and degraded "
            "everywhere",
            file=sys.stderr,
        )
        return 1
    print(
        f"shared_state: restored, {len(dump)} bytes loaded; next, the Author's operator restore and init"
    )
    return 0


# ----------------------------------------------------------------------------------------------------------------------
# The host's own tools.


class RealHost:
    def run(self, args: list[str], data: bytes | None = None) -> tuple[int, bytes]:
        try:
            done = subprocess.run(
                args, input=data, capture_output=True, check=False, timeout=900
            )
        except (OSError, subprocess.TimeoutExpired):
            return 127, b""
        return done.returncode, done.stdout

    def chown(self, path: Path, uid: int) -> None:
        os.chown(str(path), uid, uid)

    def sleep(self, seconds: float) -> None:
        time.sleep(seconds)

    def account(self) -> str:
        try:
            for line in (
                Path("/run/h4reet/tunnel-end.env")
                .read_text(encoding="utf-8")
                .splitlines()
            ):
                if line.startswith("H4_REGISTRY="):
                    return line.split("=", 1)[1].split(".", 1)[0]
        except OSError:
            pass
        return ""

    def publish(self, message: str) -> None:
        topic = f"arn:aws:sns:us-east-1:{self.account()}:h4-alerts"
        self.run(
            [
                "aws",
                "sns",
                "publish",
                "--region",
                "us-east-1",
                "--topic-arn",
                topic,
                "--message",
                message,
            ]
        )

    def post_metrics(self, payload: dict) -> None:
        """To the collector's OTLP/HTTP receiver, at its address on the stack's egress bridge, which the host reaches."""
        code, out = self.run(
            [
                "docker",
                "inspect",
                "--format",
                '{{(index .NetworkSettings.Networks "' + NETWORK + '").IPAddress}}',
                COLLECTOR,
            ]
        )
        address = out.decode().strip()
        if code != 0 or not address:
            return
        request = urllib.request.Request(
            f"http://{address}:4318/v1/metrics",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        try:
            opener.open(request, timeout=10).close()
        except OSError:
            pass


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="shared_state.py", description=__doc__.split("\n\n", 1)[0]
    )
    sub = parser.add_subparsers(dest="action", required=True)
    step = sub.add_parser("prepare")
    step.add_argument("--tree", type=Path, required=True)
    sub.add_parser("backup")
    sub.add_parser("roles")
    sub.add_parser("restore")
    args = parser.parse_args(argv)
    host, paths = RealHost(), Paths()
    if args.action == "prepare":
        return prepare(host, paths, args.tree)
    if args.action == "backup":
        return backup(host, paths)
    if args.action == "roles":
        return roles(host, paths)
    url = sys.stdin.readline().strip()
    if not url.startswith("https://"):
        print(
            "shared_state: restore takes the dump's presigned URL on standard input",
            file=sys.stderr,
        )
        return 2
    return restore(host, paths, url)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
