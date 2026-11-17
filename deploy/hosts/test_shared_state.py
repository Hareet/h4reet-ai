"""The shared state on the tunnel end (spec 001 tasks.md T163; FR-019, FR-060; contracts/shared-state.md §1 to §3, §8;
plan.md §16, "The shared state on the tunnel end"): Postgres in a container, its configuration, its host script, its
backups, and the Author's three targets.

  - `shared-state` is in the `tunnel-end` profile and class, on spec 000's pinned Postgres 17, copied to the account's
    registry by its own digest, with its data on the data volume's mount, publishing 5432 on the private interface's
    fixed address alone;
  - its configuration: TLS on, from tmpfs; `hostssl` lines only, with scram-sha-256, for the four roles; the
    superuser through the local socket alone; no statement or value in a log;
  - the host script, deploy/hosts/tunnel-end/shared_state.py, from the release's tree: the volume's mount, the key and
    certificate from Parameter Store to tmpfs, the hourly backup over the socket to its own prefix, one alert per
    failing streak with the last good dump kept, and h4.shared_state.backup_age_seconds; the roles' passwords as
    verifiers over the socket; the restore from a URL on standard input, never printed;
  - the Author's targets, scripts/infra/shared_state.py: tls, roles, and restore, each refused inside the sandbox; the
    restore's presigned GET for one object, 15 minutes, nothing of it in the output, and a refusal while EC2 runs or
    the laptop's prod does.
Key- and certificate-shaped values are built at run time; nothing here reaches AWS, Docker, or a registry.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import importlib.util
import json
import re
import shutil
import sys
from pathlib import Path

import pytest
import yaml

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
HOST = HERE / "tunnel-end"
COMPOSE = yaml.safe_load((REPO / "deploy" / "compose.yaml").read_text(encoding="utf-8"))
SERVICE = COMPOSE["services"].get("shared-state", {})
CONF = REPO / "deploy" / "shared-state"
SCRIPT = HOST / "shared_state.py"
SINK = REPO / "deploy" / "scripts" / "snapshot_sink.py"
RELEASE_UNITS = HOST / "release"
ROLES = ("gateway", "grafana_ro", "relay_ro", "relay_rw")
PRIVATE = "10.42.1.10"


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def lock_line(service: str) -> list[str]:
    for line in (
        (REPO / "deploy" / "images.lock").read_text(encoding="utf-8").splitlines()
    ):
        if line.split()[:1] == [service]:
            return line.split()
    raise AssertionError(service)


# ----------------------------------------------------------------------------------------------------------------------
# The service.


def test_shared_state_is_the_tunnel_ends_on_spec_000s_pinned_postgres() -> None:
    assert SERVICE["profiles"] == ["tunnel-end"]
    _, repository, tag, digest, *_ = lock_line("gateway-state")
    assert repository.endswith("/postgres") and tag.startswith("17.")
    assert (
        SERVICE["image"]
        == f"${{H4_REGISTRY:-registry.invalid}}/h4reet/shared-state:{tag}@{digest}"
    )
    pf = _load(
        "preflight_for_shared_state", REPO / "deploy" / "scripts" / "preflight.py"
    )
    dp = _load("deployer_for_shared_state", REPO / "deploy" / "scripts" / "deployer.py")
    assert "shared-state" in pf.HOST_CLASSES["tunnel-end"]
    assert dp.HOST_CLASSES == pf.HOST_CLASSES


def test_it_publishes_5432_on_the_private_interface_alone() -> None:
    assert SERVICE["ports"] == [f"{PRIVATE}:5432:5432"]
    assert set(SERVICE["networks"]) == {"internal", "edge"}


def binds() -> list[tuple[str, str, bool]]:
    return [
        (v["source"], v["target"], bool(v.get("read_only")))
        for v in SERVICE.get("volumes", [])
        if v["type"] == "bind"
    ]


def test_its_data_is_the_volumes_mount_and_its_configuration_and_tls_are_read_only() -> (
    None
):
    assert binds() == [
        (
            "${H4_TREE:?set by make up}/deploy/shared-state",
            "/etc/h4reet/shared-state",
            True,
        ),
        ("/run/h4reet/shared-state", "/run/shared-state", True),
        ("/srv/h4reet/shared-state", "/var/lib/postgresql/data", False),
    ]
    assert SERVICE["environment"] == {
        "POSTGRES_DB": "h4reet",
        "POSTGRES_PASSWORD_FILE": "/run/shared-state/superuser.password",
        "PGDATA": "/var/lib/postgresql/data/pgdata",
    }
    assert SERVICE["command"] == [
        "postgres",
        "-c",
        "config_file=/etc/h4reet/shared-state/postgresql.conf",
    ]
    assert SERVICE["cap_add"] == COMPOSE["services"]["gateway-state"]["cap_add"]
    assert SERVICE["healthcheck"]["test"] == HEALTH_CHECK
    assert SERVICE["deploy"]["resources"]["limits"]["memory"] == "256M"


# F7, part 3 (spec 001 bug-fixes, night 5): the check ran pg_isready as Docker's exec user, root, and the hba's one
# local line takes postgres by peer alone, so the server logged a peer-authentication failure every 5 s. It steps down
# to postgres first, with the image's own step-down tool, whichever of the two its entrypoint uses ($$ is compose's
# escape for one $).
HEALTH_CHECK = [
    "CMD-SHELL",
    (
        'exec "$$(command -v gosu || command -v su-exec)" postgres '
        "pg_isready --host=/var/run/postgresql --username=postgres --dbname=h4reet"
    ),
]


def test_its_health_check_runs_pg_isready_as_postgres_never_as_root() -> None:
    test = SERVICE["healthcheck"]["test"]
    assert test[0] == "CMD-SHELL" and len(test) == 2, test
    line = test[1]
    words = line.replace(
        '"$$(command -v gosu || command -v su-exec)"', "STEPDOWN"
    ).split()
    assert words[:4] == ["exec", "STEPDOWN", "postgres", "pg_isready"], words
    assert "--username=postgres" in words and "--host=/var/run/postgresql" in words
    # The step-down is a root process's setuid and setgid, which the capabilities the entrypoint needs already allow.
    assert {"SETUID", "SETGID"} <= set(SERVICE["cap_add"])
    # Peer: the OS user must be postgres, which only the step-down makes it.
    hba = (CONF / "pg_hba.conf").read_text(encoding="utf-8")
    assert re.search(r"^local\s+all\s+postgres\s+peer\s*$", hba, re.MULTILINE)


def settings() -> dict[str, str]:
    out = {}
    for line in (CONF / "postgresql.conf").read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            key, _, value = line.partition("=")
            out[key.strip()] = value.strip().strip("'")
    return out


def test_its_configuration_turns_tls_on_and_keeps_statements_out_of_its_log() -> None:
    s = settings()
    assert s["ssl"] == "on"
    assert s["ssl_cert_file"] == "/run/shared-state/server.crt"
    assert s["ssl_key_file"] == "/run/shared-state/server.key"
    assert s["ssl_min_protocol_version"] == "TLSv1.3"
    assert s["password_encryption"] == "scram-sha-256"
    assert s["log_statement"] == "none"
    assert s["log_min_duration_statement"] == "-1"
    assert s["log_connections"] == "off" and s["log_disconnections"] == "off"
    assert s["hba_file"] == "/etc/h4reet/shared-state/pg_hba.conf"
    assert s["listen_addresses"] == "*"
    assert s["data_directory"] == "/var/lib/postgresql/data/pgdata"


def test_its_hba_takes_tls_for_the_four_roles_and_the_superuser_on_the_socket_alone() -> (
    None
):
    lines = [
        ln.split()
        for ln in (CONF / "pg_hba.conf").read_text(encoding="utf-8").splitlines()
        if ln.strip() and not ln.lstrip().startswith("#")
    ]
    assert lines == [
        ["local", "all", "postgres", "peer"],
        *(["hostssl", "h4reet", role, "all", "scram-sha-256"] for role in ROLES),
    ]


# ----------------------------------------------------------------------------------------------------------------------
# The host script, with a stub host: every command it would run is recorded, and answered from a table.

ss = _load("shared_state_host", SCRIPT)
DUMP = b"PGDMP" + b"\x01" * 64
KEY_PEM = (
    "-----BEGIN "
    + "PRIVATE KEY-----\n"
    + "K" * 64
    + "\n-----END "
    + "PRIVATE KEY-----\n"
)
CERT_PEM = (
    "-----BEGIN "
    + "CERTIFICATE-----\n"
    + "C" * 64
    + "\n-----END "
    + "CERTIFICATE-----\n"
)
ACCOUNT = "".join(str(i % 10) for i in range(12))


class StubHost:
    def __init__(self, tmp: Path) -> None:
        self.calls: list[tuple[list[str], bytes | None]] = []
        self.answers: dict[str, tuple[int, bytes]] = {}
        self.metrics: list[dict] = []
        self.alerts: list[str] = []
        self.owned: list[tuple[str, int]] = []
        self.root = tmp

    def answer(self, prefix: str, code: int = 0, out: bytes = b"") -> None:
        self.answers[prefix] = (code, out)

    def run(self, args: list[str], data: bytes | None = None) -> tuple[int, bytes]:
        self.calls.append((list(args), data))
        joined = " ".join(args)
        for prefix in sorted(self.answers, key=len, reverse=True):
            if joined.startswith(prefix):
                return self.answers[prefix]
        return 0, b""

    def chown(self, path: Path, uid: int) -> None:
        self.owned.append((path.name, uid))

    def post_metrics(self, payload: dict) -> None:
        self.metrics.append(payload)

    def publish(self, message: str) -> None:
        self.alerts.append(message)

    def account(self) -> str:
        return ACCOUNT


@pytest.fixture
def world(tmp_path: Path) -> tuple[StubHost, object]:
    host = StubHost(tmp_path)
    paths = ss.Paths(
        data=tmp_path / "srv",
        tls=tmp_path / "run" / "shared-state",
        state=tmp_path / "var" / "shared-state",
        install=tmp_path / "opt",
        units=tmp_path / "etc" / "systemd",
        snapshot=tmp_path / "opt-snapshot",
    )
    return host, paths


def ran(host: StubHost) -> list[str]:
    return [" ".join(args) for args, _ in host.calls]


def parameters(values: dict[str, str]) -> bytes:
    return json.dumps(
        {
            "Parameters": [{"Name": k, "Value": v} for k, v in values.items()],
            "InvalidParameters": [],
        }
    ).encode()


def test_prepare_mounts_the_volume_and_writes_the_key_and_certificate_to_tmpfs(
    world, tmp_path: Path
) -> None:
    host, paths = world
    tree = tmp_path / "tree"
    (tree / "deploy" / "hosts" / "tunnel-end" / "release").mkdir(parents=True)
    shutil.copy2(SCRIPT, tree / "deploy" / "hosts" / "tunnel-end" / "shared_state.py")
    for unit in RELEASE_UNITS.iterdir():
        shutil.copy2(
            unit, tree / "deploy" / "hosts" / "tunnel-end" / "release" / unit.name
        )
    (tree / "deploy" / "scripts").mkdir(parents=True)
    shutil.copy2(SINK, tree / "deploy" / "scripts" / "snapshot_sink.py")
    host.answer("blkid", 2)  # a blank volume: no filesystem yet
    host.answer("findmnt", 1)
    host.answer(
        "aws ssm get-parameters",
        out=parameters(
            {
                "/h4reet/tunnel-end/SHARED_STATE_TLS_KEY": KEY_PEM,
                "/h4reet/tunnel-end/SHARED_STATE_TLS_CERT": CERT_PEM,
            }
        ),
    )
    assert ss.prepare(host, paths, tree) == 0
    commands = ran(host)
    assert "mkfs.ext4 -L h4-shared-state /dev/sdf" in commands
    assert f"mount -o nodev,nosuid,noexec /dev/sdf {paths.data}" in commands
    get = next(c for c in commands if c.startswith("aws ssm get-parameters"))
    assert "--with-decryption" in get
    key = paths.tls / "server.key"
    assert key.read_text() == KEY_PEM and key.stat().st_mode & 0o777 == 0o400
    assert (paths.tls / "server.crt").read_text() == CERT_PEM
    password = paths.tls / "superuser.password"
    assert password.stat().st_mode & 0o777 == 0o400 and len(password.read_text()) >= 32
    assert ("server.key", 70) in host.owned and ("superuser.password", 70) in host.owned
    # The backup's units and the script come from the release's tree, not the user data.
    assert (paths.units / "h4-shared-state-backup.timer").is_file()
    assert (paths.install / "shared_state.py").read_bytes() == SCRIPT.read_bytes()
    assert "systemctl enable --now h4-shared-state-backup.timer" in commands
    # Group 10: the public view's write, the same way (deploy/scripts/snapshot_sink.py; plan.md §16, "Group 10, as
    # built"): its script and its unit from the release's tree, enabled, and restarted so each release's runs.
    assert (paths.snapshot / "snapshot_sink.py").read_bytes() == SINK.read_bytes()
    assert (paths.units / "h4-snapshot-sink.service").is_file()
    assert "systemctl enable h4-snapshot-sink.service" in commands
    assert "systemctl restart h4-snapshot-sink.service" in commands
    assert KEY_PEM not in "\n".join(commands)


def test_prepare_never_formats_a_volume_that_holds_a_filesystem(
    world, tmp_path: Path
) -> None:
    host, paths = world
    host.answer("blkid", 0, b"ext4\n")
    host.answer("findmnt", 0, b"/srv\n")
    host.answer(
        "aws ssm get-parameters",
        out=parameters(
            {
                "/h4reet/tunnel-end/SHARED_STATE_TLS_KEY": KEY_PEM,
                "/h4reet/tunnel-end/SHARED_STATE_TLS_CERT": CERT_PEM,
            }
        ),
    )
    (tmp_path / "tree").mkdir()
    ss.prepare(host, paths, tmp_path / "tree")
    assert not [c for c in ran(host) if c.startswith(("mkfs", "mount "))]


def test_prepare_formats_only_what_blkid_calls_blank_and_probes_no_mounted_volume(
    world, tmp_path: Path, capsys
) -> None:
    # Group 6's review, nit 3: blkid exits 2 for a device with no filesystem; any other failure is no reason to
    # format. A volume mounted already at the data folder isn't probed at all.
    host, paths = world
    (tmp_path / "tree").mkdir()
    host.answer("findmnt", 1)
    host.answer("blkid", 1)
    assert ss.prepare(host, paths, tmp_path / "tree") == 1
    assert not [c for c in ran(host) if c.startswith(("mkfs", "mount "))]
    assert "blkid" in capsys.readouterr().err
    host.calls.clear()
    host.answer("findmnt", 0, b"/srv\n")
    host.answer("blkid", 2)
    ss.prepare(host, paths, tmp_path / "tree")
    assert not [c for c in ran(host) if c.startswith(("blkid", "mkfs", "mount "))]


def test_prepare_refuses_a_store_without_its_key_or_certificate(
    world, tmp_path: Path, capsys
) -> None:
    host, paths = world
    host.answer("blkid", 0, b"ext4\n")
    host.answer("findmnt", 0, b"/srv\n")
    host.answer(
        "aws ssm get-parameters",
        out=json.dumps(
            {
                "Parameters": [
                    {
                        "Name": "/h4reet/tunnel-end/SHARED_STATE_TLS_CERT",
                        "Value": CERT_PEM,
                    }
                ],
                "InvalidParameters": ["/h4reet/tunnel-end/SHARED_STATE_TLS_KEY"],
            }
        ).encode(),
    )
    (tmp_path / "tree").mkdir()
    assert ss.prepare(host, paths, tmp_path / "tree") == 1
    assert "SHARED_STATE_TLS_KEY" in capsys.readouterr().err
    assert not (paths.tls / "server.key").exists()


def test_the_backup_dumps_over_the_socket_and_puts_under_its_prefix(world) -> None:
    host, paths = world
    host.answer("docker exec -u postgres h4reet-prod-shared-state-1 pg_dump", out=DUMP)
    assert ss.backup(host, paths, now=1_763_000_000) == 0
    commands = ran(host)
    dump = next(c for c in commands if " pg_dump " in c)
    assert dump == (
        # As the container's postgres user, whom the socket's peer line alone admits.
        "docker exec -u postgres h4reet-prod-shared-state-1 pg_dump --username=postgres --dbname=h4reet --format=custom"
    )
    assert "--host" not in dump  # the local socket
    put = next(c for c in commands if c.startswith("aws s3 cp"))
    assert re.search(
        rf" s3://h4reet-ai-shared-state-{ACCOUNT}/dumps/2025-11-13T02:13:20Z\.dump( |$)",
        put,
    ), put
    assert (paths.state / "last-good.dump").read_bytes() == DUMP
    assert host.alerts == []
    (payload,) = host.metrics
    assert ss.backup_age(payload) == 0


@pytest.mark.parametrize("step", ["dump", "put"])
def test_a_failed_backup_alerts_once_and_keeps_the_last_good_dump(
    world, step: str
) -> None:
    host, paths = world
    host.answer("docker exec -u postgres h4reet-prod-shared-state-1 pg_dump", out=DUMP)
    assert ss.backup(host, paths, now=1_763_000_000) == 0
    if step == "dump":
        host.answer(
            "docker exec -u postgres h4reet-prod-shared-state-1 pg_dump", 1, b""
        )
    else:
        host.answer("aws s3 cp", 1, b"")
    assert ss.backup(host, paths, now=1_763_003_600) == 1
    assert ss.backup(host, paths, now=1_763_007_200) == 1
    (alert,) = host.alerts
    first, *facts = alert.splitlines()
    assert first.startswith("[hareet.ai aws] shared_state_backup_failed: ")
    assert f"- step: {step}" in facts
    assert "- last_good: 2025-11-13T02:13:20Z" in facts
    assert ACCOUNT not in alert
    assert (paths.state / "last-good.dump").read_bytes() == DUMP
    assert [ss.backup_age(m) for m in host.metrics] == [0, 3600, 7200]
    # A good dump ends the streak: the next failure alerts again.
    host.answers.pop("docker exec -u postgres h4reet-prod-shared-state-1 pg_dump", None)
    host.answers.pop("aws s3 cp", None)
    host.answer("docker exec -u postgres h4reet-prod-shared-state-1 pg_dump", out=DUMP)
    assert ss.backup(host, paths, now=1_763_010_800) == 0
    host.answer("aws s3 cp", 1, b"")
    assert ss.backup(host, paths, now=1_763_014_400) == 1
    assert len(host.alerts) == 2


def test_the_backup_age_is_an_otlp_gauge_named_for_the_dashboard(world) -> None:
    host, paths = world
    host.answer("docker exec -u postgres h4reet-prod-shared-state-1 pg_dump", out=DUMP)
    ss.backup(host, paths, now=1_763_000_000)
    (payload,) = host.metrics
    (metric,) = payload["resourceMetrics"][0]["scopeMetrics"][0]["metrics"]
    assert metric["name"] == "h4.shared_state.backup_age_seconds"
    assert metric["unit"] == "s"
    assert "gauge" in metric


def scram_verifier_ok(verifier: str, password: str) -> bool:
    m = re.fullmatch(
        r"SCRAM-SHA-256\$4096:([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+)",
        verifier,
    )
    if not m:
        return False
    salt, stored, server = (base64.b64decode(g) for g in m.groups())
    salted = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 4096)
    client_key = hmac.new(salted, b"Client Key", "sha256").digest()
    return (
        hashlib.sha256(client_key).digest() == stored
        and hmac.new(salted, b"Server Key", "sha256").digest() == server
    )


def test_roles_set_each_password_as_a_verifier_over_the_socket(world) -> None:
    host, paths = world
    passwords = {role: f"pw-{role}-{'x' * 24}" for role in ROLES}
    host.answer(
        "aws ssm get-parameters",
        out=parameters(
            {
                "/h4reet/ec2/DB_GATEWAY_PASSWORD": passwords["gateway"],
                "/h4reet/ec2/DB_GRAFANA_RO_PASSWORD": passwords["grafana_ro"],
                "/h4reet/tunnel-end/DB_RELAY_RO_PASSWORD": passwords["relay_ro"],
                "/h4reet/tunnel-end/DB_RELAY_RW_PASSWORD": passwords["relay_rw"],
            }
        ),
    )
    assert ss.roles(host, paths) == 0
    (psql, sql) = next((args, data) for args, data in host.calls if "psql" in args)
    assert psql[:6] == [
        "docker",
        "exec",
        "-i",
        "-u",
        "postgres",
        "h4reet-prod-shared-state-1",
    ]
    assert "--username=postgres" in psql and "--host" not in " ".join(psql)
    text = (sql or b"").decode()
    for role, password in passwords.items():
        assert password not in text and password not in " ".join(psql)
        (verifier,) = re.findall(
            rf"ALTER ROLE {role} WITH LOGIN[^;]* PASSWORD '([^']+)';", text
        )
        assert scram_verifier_ok(verifier, password), role
    assert "GRANT CREATE, CONNECT ON DATABASE h4reet TO gateway;" in text
    for role in ROLES[1:]:
        assert (
            f"GRANT {role} TO gateway WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;"
            in text
        )


def test_roles_refuse_while_a_password_is_missing_and_set_none(world, capsys) -> None:
    host, paths = world
    host.answer(
        "aws ssm get-parameters",
        out=json.dumps(
            {
                "Parameters": [],
                "InvalidParameters": ["/h4reet/tunnel-end/DB_RELAY_RW_PASSWORD"],
            }
        ).encode(),
    )
    assert ss.roles(host, paths) == 1
    assert "DB_RELAY_RW_PASSWORD" in capsys.readouterr().err
    assert not [args for args, _ in host.calls if "psql" in args]


def test_restore_fetches_the_dump_from_the_url_on_stdin_empties_the_store_and_loads_it(
    world, capsys
) -> None:
    host, paths = world
    url = (
        "https://h4reet-ai-shared-state-"
        + ACCOUNT
        + ".s3.us-east-1.amazonaws.com/dumps/x.dump?X-Amz-Signature=abc"
    )
    fetched: list[str] = []
    assert (
        ss.restore(host, paths, url, fetch=lambda u: (fetched.append(u), DUMP)[1]) == 0
    )
    assert fetched == [url]
    commands = ran(host)
    drop = next(
        i
        for i, c in enumerate(commands)
        if "DROP DATABASE IF EXISTS h4reet WITH (FORCE)" in c
    )
    create = next(i for i, c in enumerate(commands) if "CREATE DATABASE h4reet" in c)
    load = next(i for i, c in enumerate(commands) if " pg_restore " in c)
    assert drop < create < load
    assert next(data for args, data in host.calls if "pg_restore" in args) == DUMP
    out = capsys.readouterr()
    assert "X-Amz-Signature" not in out.out + out.err and url not in "\n".join(commands)


# Group 6's review, I-2: a pg_dump without --create carries no database ACLs, so the restore's CREATE DATABASE must
# give the gateway back the grant the roles target set, or its CREATE SCHEMA IF NOT EXISTS fails at its next start; and
# the load is one transaction, so one that fails part way keeps nothing and the store is empty, as its message says.
def test_restore_gives_the_gateway_its_database_grant_back_before_the_load(
    world,
) -> None:
    host, paths = world
    assert ss.restore(host, paths, "https://x.invalid/d", fetch=lambda u: DUMP) == 0
    commands = ran(host)
    create = next(i for i, c in enumerate(commands) if "CREATE DATABASE h4reet" in c)
    grant = next(
        i
        for i, c in enumerate(commands)
        if "GRANT CREATE, CONNECT ON DATABASE h4reet TO gateway" in c
    )
    load = next(i for i, c in enumerate(commands) if " pg_restore " in c)
    assert create < grant < load
    # The very grant the roles target sets.
    assert ss.DATABASE_GRANT in ss.roles_sql(
        dict.fromkeys(ss.ROLE_ATTRIBUTES, "x" * 32)
    )
    assert ss.DATABASE_GRANT in commands[grant]


def test_restore_loads_in_one_transaction_and_a_part_way_failure_keeps_nothing(
    world, capsys
) -> None:
    host, paths = world
    host.answer("docker exec -i -u postgres h4reet-prod-shared-state-1 pg_restore", 1)
    assert ss.restore(host, paths, "https://x.invalid/d", fetch=lambda u: DUMP) == 1
    (load,) = [args for args, _ in host.calls if "pg_restore" in args]
    assert "--single-transaction" in load and "--exit-on-error" in load
    err = capsys.readouterr().err
    assert "nothing of it was kept" in err and "the store is empty" in err


def test_restore_refuses_what_isnt_a_dump_and_touches_nothing(world) -> None:
    host, paths = world
    assert (
        ss.restore(host, paths, "https://x.invalid/d", fetch=lambda u: b"<html>") == 1
    )
    assert not [c for c in ran(host) if "DROP DATABASE" in c]


def test_the_host_script_keeps_to_amazon_linux_2023s_python() -> None:
    import ast

    text = SCRIPT.read_text(encoding="utf-8")
    ast.parse(text, feature_version=(3, 9))
    assert text.startswith("#!/usr/bin/env python3\n")


def test_the_backup_timer_runs_every_hour_through_the_proxy() -> None:
    timer = (RELEASE_UNITS / "h4-shared-state-backup.timer").read_text(encoding="utf-8")
    assert "OnCalendar=hourly" in timer and "Persistent=true" in timer
    service = (RELEASE_UNITS / "h4-shared-state-backup.service").read_text(
        encoding="utf-8"
    )
    assert (
        "ExecStart=/usr/bin/python3 -I -B /opt/h4reet/shared-state/shared_state.py backup"
        in service
    )
    assert "HTTPS_PROXY=http://127.0.0.1:3128" in service


# ----------------------------------------------------------------------------------------------------------------------
# The Author's three targets (scripts/infra/shared_state.py), with the infra tests' fake aws and a fake docker.

INFRA = REPO / "scripts" / "infra"
kit = _load("infra_testkit_for_shared_state", INFRA / "infra_testkit.py")
MAKEFILE = (REPO / "Makefile").read_text(encoding="utf-8")
PROFILE = "h4reet-admin"


@pytest.mark.parametrize(
    ("target", "line"),
    [
        ("shared-state-tls", "scripts/infra/shared_state.py tls"),
        ("shared-state-roles", "scripts/infra/shared_state.py roles"),
        ("shared-state-restore", "scripts/infra/shared_state.py restore"),
    ],
)
def test_the_three_targets_are_the_authors(target: str, line: str) -> None:
    recipe = MAKEFILE.split(f"\n{target}:", 1)[1].split("\n\n", 1)[0]
    assert "## (the Author)" in recipe.splitlines()[0]
    assert "$(call AUTHOR_ONLY," in recipe
    assert line in recipe


FAKE_DOCKER = f"""#!{sys.executable} -I
import json, os, sys
from pathlib import Path
here = Path(__file__).parent
with open(here.parent / "calls.jsonl", "a", encoding="utf-8") as log:
    log.write(json.dumps({{"tool": "docker", "argv": sys.argv[1:]}}) + "\\n")
sys.stdout.write((here / "docker.out").read_text() if (here / "docker.out").exists() else "")
"""


@pytest.fixture
def terminal(tmp_path: Path) -> dict:
    repo = tmp_path / "repo"
    (repo / "scripts" / "infra").mkdir(parents=True)
    (repo / "scripts" / "infra" / "shared_state.py").write_bytes(
        (INFRA / "shared_state.py").read_bytes()
    )
    home = tmp_path / "home"
    env_dir = home / ".config" / "h4reet-ai" / "env"
    env_dir.mkdir(parents=True)
    (home / ".config" / "h4reet-ai").chmod(0o700)
    env_dir.chmod(0o700)
    prod = env_dir / "prod.env"
    prod.write_text(
        "H4_STACK=prod\nOTHER=kept\nGATEWAY_DB_URL=\nGATEWAY_DB_TLS_SERVERNAME=\nGATEWAY_DB_TLS_CA=\n",
        encoding="utf-8",
    )
    prod.chmod(0o600)
    bin_dir = kit.fakes(
        tmp_path,
        aws={
            "sts get-caller-identity": {"Account": ACCOUNT},
            "ssm put-parameter": {"Version": 1},
            "s3api list-objects-v2": {
                "Contents": [
                    {
                        "Key": "dumps/2026-11-13T05:00:00Z.dump",
                        "LastModified": "2026-11-13T05:00:04Z",
                    },
                    {
                        "Key": "dumps/2026-11-13T06:00:00Z.dump",
                        "LastModified": "2026-11-13T06:00:03Z",
                    },
                ]
            },
            "s3 presign": "https://h4reet-ai-shared-state-"
            + ACCOUNT
            + ".s3.amazonaws.com/dumps/x?X-Amz-Signature=zz",
            "ec2 describe-instances": {"Reservations": []},
            "ssm send-command": {"Command": {"CommandId": "c-1"}},
            "ssm get-command-invocation": {
                "Status": "Success",
                "StandardOutputContent": "restored",
            },
        },
    )
    (bin_dir / "docker").write_text(FAKE_DOCKER, encoding="utf-8")
    (bin_dir / "docker").chmod(0o755)
    return {"repo": repo, "home": home, "bin": bin_dir, "prod": prod}


def run(w: dict, *args: str, **env: str):
    return kit.run_script(
        w["repo"],
        w["home"],
        w["bin"],
        "shared_state.py",
        *args,
        "--profile",
        PROFILE,
        **env,
    )


def aws_calls(w: dict, verb: str) -> list[list[str]]:
    return [
        c["argv"]
        for c in kit.calls(w["bin"], "aws")
        if " ".join(c["argv"]).startswith(verb)
    ]


@pytest.mark.parametrize("action", ["tls", "roles", "restore"])
def test_each_refuses_inside_the_sandbox(terminal: dict, action: str) -> None:
    done = run(terminal, action, SANDBOX_RUNTIME="1")
    assert done.returncode == 2
    assert kit.calls(terminal["bin"]) == []


@pytest.mark.skipif(shutil.which("openssl") is None, reason="needs openssl")
def test_tls_keeps_the_ca_in_the_terminal_and_writes_the_servers_key_to_parameter_store(
    terminal: dict,
) -> None:
    done = run(terminal, "tls")
    assert done.returncode == 0, done.stderr
    folder = terminal["home"] / ".config" / "h4reet-ai" / "shared-state"
    assert folder.stat().st_mode & 0o777 == 0o700
    assert (folder / "ca.key").stat().st_mode & 0o777 == 0o600
    assert not (
        folder / "server.key"
    ).exists()  # no copy of the server's key stays on the laptop
    puts = {
        c[c.index("--name") + 1]: c for c in aws_calls(terminal, "ssm put-parameter")
    }
    assert set(puts) == {
        "/h4reet/tunnel-end/SHARED_STATE_TLS_KEY",
        "/h4reet/tunnel-end/SHARED_STATE_TLS_CERT",
        "/h4reet/hosts/SHARED_STATE_TLS_CA",
    }
    key = puts["/h4reet/tunnel-end/SHARED_STATE_TLS_KEY"]
    assert key[key.index("--type") + 1] == "SecureString"
    assert key[key.index("--value") + 1].startswith("file://")
    values = dict(
        ln.split("=", 1)
        for ln in terminal["prod"].read_text().splitlines()
        if "=" in ln
    )
    assert values["GATEWAY_DB_TLS_SERVERNAME"] == "shared-state"
    assert base64.b64decode(values["GATEWAY_DB_TLS_CA"]).startswith(
        b"-----BEGIN CERTIFICATE-----"
    )
    assert values["OTHER"] == "kept"
    assert "PRIVATE KEY" not in done.stdout + done.stderr
    # A second run keeps the CA unless told to rotate.
    ca = (folder / "ca.crt").read_bytes()
    assert run(terminal, "tls").returncode == 0
    assert (folder / "ca.crt").read_bytes() == ca


def test_roles_runs_on_the_tunnel_end_through_systems_manager(terminal: dict) -> None:
    done = run(terminal, "roles")
    assert done.returncode == 0, done.stderr
    (send,) = aws_calls(terminal, "ssm send-command")
    assert send[send.index("--document-name") + 1] == "AWS-RunShellScript"
    assert "Key=tag:Name,Values=h4-prod-tunnel-end" in send
    commands = json.loads(send[send.index("--parameters") + 1])["commands"]
    assert commands == ["python3 -I -B /opt/h4reet/shared-state/shared_state.py roles"]


def test_restore_presigns_one_object_for_15_minutes_and_prints_none_of_it(
    terminal: dict,
) -> None:
    done = run(terminal, "restore")
    assert done.returncode == 0, done.stderr
    (presign,) = aws_calls(terminal, "s3 presign")
    assert (
        presign[2]
        == f"s3://h4reet-ai-shared-state-{ACCOUNT}/dumps/2026-11-13T06:00:00Z.dump"
    )
    assert presign[presign.index("--expires-in") + 1] == "900"
    (send,) = aws_calls(terminal, "ssm send-command")
    assert "Key=tag:Name,Values=h4-prod-tunnel-end" in send
    assert "X-Amz-Signature" not in done.stdout + done.stderr
    assert "2026-11-13T06:00:00Z" in done.stdout


def test_restore_takes_the_dump_named(terminal: dict) -> None:
    done = run(terminal, "restore", "--dump", "dumps/2026-11-13T05:00:00Z.dump")
    assert done.returncode == 0, done.stderr
    (presign,) = aws_calls(terminal, "s3 presign")
    assert presign[2].endswith("/dumps/2026-11-13T05:00:00Z.dump")
    assert run(terminal, "restore", "--dump", "dumps/../x").returncode == 2


def test_restore_refuses_while_ec2_runs(terminal: dict) -> None:
    kit.answer(
        terminal["bin"],
        aws={
            "sts get-caller-identity": {"Account": ACCOUNT},
            "ec2 describe-instances": {
                "Reservations": [
                    {
                        "Instances": [
                            {"InstanceId": "i-0abc", "State": {"Name": "running"}}
                        ]
                    }
                ]
            },
        },
    )
    done = run(terminal, "restore")
    assert done.returncode == 1 and "EC2" in done.stderr
    assert (
        aws_calls(terminal, "s3 presign") == []
        and aws_calls(terminal, "ssm send-command") == []
    )


def test_restore_refuses_while_the_laptops_prod_runs(terminal: dict) -> None:
    (terminal["bin"] / "docker.out").write_text("h4reet-prod-gateway-1\n")
    done = run(terminal, "restore")
    assert done.returncode == 1 and "prod" in done.stderr
    assert aws_calls(terminal, "s3 presign") == []
