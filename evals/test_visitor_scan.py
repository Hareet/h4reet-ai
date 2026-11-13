"""Spec 001 group 8 (tasks.md T101, T109; FR-042, SC-011): the visitor scan, evals/visitor_scan.py.

After a scripted visit, with a marker message and the visit's address, it scans every store on each host, plus the
shared state, the relay's logs, and the tunnel end's, for either, and names the sources that hold one, never what it
found around it:
  - its plan covers every named volume and every service of each host's class in deploy/compose.yaml, the shared
    state and the relay among them, so a new store can't be left out;
  - it finds the marker or the address as written, JSON-escaped, URL-encoded, as an IPv4-mapped IPv6 address, inside a
    tar stream (what `docker cp` writes) and inside a gzip member;
  - it refuses a marker that could match by chance, and an address that isn't one;
  - its report names sources and counts alone.
"""

from __future__ import annotations

import gzip
import importlib.util
import io
import json
import secrets
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

import pytest
import yaml

REPO = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "visitor_scan", REPO / "evals" / "visitor_scan.py"
)
assert SPEC and SPEC.loader
vs = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = vs
SPEC.loader.exec_module(vs)

ADDRESS = "203.0.113.41"
COMPOSE = yaml.safe_load((REPO / "deploy" / "compose.yaml").read_text(encoding="utf-8"))


def marker() -> str:
    return "visit-" + secrets.token_hex(8)


def write(folder: Path, name: str, data: bytes) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / name
    path.write_bytes(data)
    return path


def tar_of(members: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as tar:
        for name, data in members.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    return buffer.getvalue()


def test_a_clean_set_of_sources_passes(tmp_path: Path) -> None:
    m = marker()
    write(
        tmp_path,
        "gateway-state.sql",
        b"INSERT INTO gateway.ledger VALUES (1, 'hello');\n",
    )
    write(
        tmp_path, "relay.log", b'{"route":"/api/hello","host":"laptop","status":200}\n'
    )
    found = vs.scan(tmp_path, m, ADDRESS)
    assert found == {}


@pytest.mark.parametrize(
    "form",
    [
        lambda m, a: f"message={m}".encode(),
        lambda m, a: json.dumps({"x": f"{m}é"}).encode(),
        lambda m, a: json.dumps({"x": m}, ensure_ascii=True).encode(),
        lambda m, a: f"q={m.replace('-', '%2D')}".encode(),
        lambda m, a: f"peer={a}".encode(),
        lambda m, a: f"peer=::ffff:{a}".encode(),
        lambda m, a: f"peer={a.replace('.', '%2E')}".encode(),
        lambda m, a: f"x-forwarded-for: {a}:51234".encode(),
    ],
)
def test_each_form_is_found(tmp_path: Path, form) -> None:
    m = marker()
    write(tmp_path, "store.dump", b"before " + form(m, ADDRESS) + b" after")
    found = vs.scan(tmp_path, m, ADDRESS)
    assert list(found) == ["store.dump"], found


def test_it_reads_inside_a_tar_stream_and_a_gzip_member(tmp_path: Path) -> None:
    m = marker()
    inner = gzip.compress(f'{{"message": "{m}"}}'.encode())
    write(
        tmp_path,
        "seaweedfs.tar",
        tar_of({"data/events/1.json.gz": inner, "data/clean.txt": b"nothing"}),
    )
    found = vs.scan(tmp_path, m, ADDRESS)
    assert list(found) == ["seaweedfs.tar"]
    assert found["seaweedfs.tar"] == {"marker": 1, "address": 0}


def test_an_address_inside_a_longer_number_isnt_counted(tmp_path: Path) -> None:
    write(tmp_path, "metrics.txt", b"value 1203.0.113.410 and 203.0.113.4\n")
    assert vs.scan(tmp_path, marker(), ADDRESS) == {}


def test_it_refuses_a_weak_marker_and_a_non_address() -> None:
    with pytest.raises(vs.Usage):
        vs.check_inputs("hello", ADDRESS)
    with pytest.raises(vs.Usage):
        vs.check_inputs(marker(), "not-an-address")
    vs.check_inputs(marker(), ADDRESS)
    vs.check_inputs(marker(), "2001:db8::41")


def test_the_report_names_sources_and_counts_alone(tmp_path: Path, capsys) -> None:
    m = marker()
    write(tmp_path, "langfuse-db.sql", f"text with {m} and {ADDRESS}".encode())
    code = vs.main(["scan", "--marker", m, "--address", ADDRESS, str(tmp_path)])
    out = capsys.readouterr()
    assert code == 1
    assert "langfuse-db.sql" in out.out
    assert m not in out.out + out.err and ADDRESS not in out.out + out.err
    code = vs.main(
        ["scan", "--marker", marker(), "--address", "198.51.100.9", str(tmp_path)]
    )
    assert code == 0


def volumes_of(names: tuple[str, ...]) -> set[str]:
    out = set()
    for name in names:
        for v in COMPOSE["services"].get(name, {}).get("volumes", []) or []:
            if isinstance(v, dict) and v.get("type") == "volume":
                out.add(v["source"])
    return out


@pytest.mark.parametrize("host", ["laptop", "ec2", "tunnel-end"])
def test_the_plan_covers_every_service_and_volume_of_each_hosts_class(
    host: str,
) -> None:
    plan = vs.plan(host)
    services = vs.host_services(host, COMPOSE)
    assert services
    logs = {s.service for s in plan if s.kind == "logs"}
    assert logs == set(services), sorted(set(services) - logs)
    data = {s.volume for s in plan if s.kind == "volume"}
    assert data == volumes_of(services), sorted(volumes_of(services) - data)
    for s in plan:
        assert s.argv[0] == "docker", s
        assert not any("PASSWORD=" in a or "TOKEN=" in a for a in s.argv), s


def test_the_plan_holds_the_shared_state_the_relay_and_the_tunnel_ends_logs() -> None:
    plan = {s.name for s in vs.plan("tunnel-end")}
    for name in (
        "shared-state.sql",
        "relay.log",
        "tunnel-end.log",
        "tunnel-end-collector.log",
    ):
        assert name in plan, name
    laptop = {s.name for s in vs.plan("laptop")}
    for name in ("gateway.log", "langfuse-db.sql", "edge.log", "gateway-journal.tar"):
        assert name in laptop, name


def test_each_postgres_dump_runs_as_the_postgres_user() -> None:
    # Group 8's review B, I4: `docker exec` runs as root, and the shared state's only local rule is `local all
    # postgres peer`, so a dump as root is refused; each runs as the image's postgres user.
    for host in ("laptop", "ec2", "tunnel-end"):
        for s in vs.plan(host):
            if s.kind == "postgres":
                assert s.argv[:4] == ("docker", "exec", "-u", "postgres"), s


def test_the_plan_reads_loki_and_prometheus_live_where_they_run() -> None:
    # Group 8's review B, I5: the gateway's and the relay's OTLP logs and metrics reach Loki and Prometheus, whose
    # files are compressed: the plan asks each store for the visit's window through its own API, from inside its stack.
    for host in ("laptop", "ec2"):
        kinds = {s.kind: s for s in vs.plan(host)}
        assert "loki" in kinds and "prometheus" in kinds, host
        loki = " ".join(kinds["loki"].argv)
        assert "query_range" in loki and "loki:3100" in loki
        prom = " ".join(kinds["prometheus"].argv)
        assert "/api/v1/labels" in prom and "prometheus:9090" in prom
    assert {s.kind for s in vs.plan("tunnel-end")} & {"loki", "prometheus"} == set()


def test_each_postgres_dump_names_its_database_and_user_never_a_password() -> None:
    dumps = [
        s
        for host in ("laptop", "tunnel-end")
        for s in vs.plan(host)
        if s.kind == "postgres"
    ]
    assert {s.service for s in dumps} >= {
        "gateway-state",
        "langfuse-db",
        "shared-state",
    }
    for s in dumps:
        assert "pg_dump" in s.argv and "--data-only" in s.argv


# Group 8's fixes' review, I2: each live source exits 2 unless every answer is ok and says success, and Loki's
# answer at its limit is a truncated window, never a clean one. Run with node, its fetch a stub.
NODE = shutil.which("node")


def run_live(
    name: str, answers: dict[str, tuple[int, str]]
) -> subprocess.CompletedProcess:
    stub = (
        "globalThis.fetch=async(u)=>{const a="
        + json.dumps(answers)
        + ";const k=Object.keys(a).find(p=>String(u).includes(p));"
        "if(!k)throw new Error('unexpected');const [s,b]=a[k];"
        "return {ok:s>=200&&s<300,status:s,text:async()=>b,json:async()=>JSON.parse(b)}};"
    )
    # On standard input: a window at Loki's limit is longer than one argument may be.
    return subprocess.run(
        [NODE or "node", "-"],
        input=stub + vs.LIVE_STORES[name],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )


def loki(lines: int, status: str = "success") -> str:
    return json.dumps(
        {
            "status": status,
            "data": {
                "resultType": "streams",
                "result": [
                    {
                        "stream": {"service_name": "gateway"},
                        "values": [
                            [str(1800000000000000000 + i), "a line"]
                            for i in range(lines)
                        ],
                    }
                ],
            },
        }
    )


@pytest.mark.skipif(NODE is None, reason="node isn't on this machine")
@pytest.mark.parametrize(
    ("answer", "code"),
    [
        ((200, loki(3)), 0),
        ((503, "Ingester not ready: waiting for 15s after being ready"), 2),
        ((400, json.dumps({"status": "error", "error": "parse error"})), 2),
        ((200, loki(3, status="error")), 2),
        ((200, loki(5000)), 2),
    ],
)
def test_lokis_source_fails_on_an_error_answer_or_a_window_at_its_limit(
    answer: tuple[int, str], code: int
) -> None:
    done = run_live("loki", {"query_range": answer})
    assert done.returncode == code, done.stderr
    if code == 0:
        assert "a line" in done.stdout


PROM_OK = json.dumps({"status": "success", "data": ["__name__", "job"]})
VALUES_OK = json.dumps({"status": "success", "data": ["h4_gateway_requests_total"]})


@pytest.mark.skipif(NODE is None, reason="node isn't on this machine")
@pytest.mark.parametrize(
    ("labels", "values", "code"),
    [
        ((200, PROM_OK), (200, VALUES_OK), 0),
        ((500, json.dumps({"status": "error", "error": "x"})), (200, VALUES_OK), 2),
        ((200, json.dumps({"status": "error", "error": "x"})), (200, VALUES_OK), 2),
        ((200, PROM_OK), (503, "unavailable"), 2),
        ((200, PROM_OK), (200, json.dumps({"status": "error"})), 2),
    ],
)
def test_prometheus_source_fails_on_any_error_answer(
    labels: tuple[int, str], values: tuple[int, str], code: int
) -> None:
    done = run_live("prometheus", {"/labels": labels, "/values": values})
    assert done.returncode == code, done.stderr
    if code == 0:
        assert "h4_gateway_requests_total" in done.stdout
