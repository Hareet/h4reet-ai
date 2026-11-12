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
          first start reads; this file and the backup's units installed, and the timer enabled. A missing parameter
          stops it, naming it, and the deployer's start with it.
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
UNITS = ("h4-shared-state-backup.service", "h4-shared-state-backup.timer")
PROXY = "http://127.0.0.1:3128"


class Paths:
    def __init__(
        self,
        data: Path = Path("/srv/h4reet/shared-state"),
        tls: Path = Path("/run/h4reet/shared-state"),
        state: Path = Path("/var/lib/h4reet/shared-state"),
        install: Path = Path("/opt/h4reet/shared-state"),
        units: Path = Path("/etc/systemd/system"),
    ) -> None:
        self.data, self.tls, self.state, self.install, self.units = (
            data,
            tls,
            state,
            install,
            units,
        )


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
        paths.units.mkdir(parents=True, exist_ok=True)
        for unit in UNITS:
            shutil.copyfile(str(source / "release" / unit), str(paths.units / unit))
            (paths.units / unit).chmod(0o644)
    except OSError as error:
        print(
            f"shared_state: the release's host files didn't install: {type(error).__name__}",
            file=sys.stderr,
        )
        return 1
    host.run(["systemctl", "daemon-reload"])
    if (
        host.run(["systemctl", "enable", "--now", "h4-shared-state-backup.timer"])[0]
        != 0
    ):
        print("shared_state: the backup timer didn't start", file=sys.stderr)
        return 1
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
