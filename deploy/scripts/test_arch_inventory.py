"""Tests for deploy/scripts/arch_inventory.py (spec 001, tasks.md T013; research.md R-33, R-04; contracts/env-cloud.md
§3): which images deploy/images.lock pins have a linux/arm64 build, read from the engine's own store, and the hosts each
one runs on. A stub engine stands in for docker's, as image indexes the engine's GET /images/{name}/json?manifests=1
returns; one test serves them over a unix socket, so the script's own HTTP code runs too."""

from __future__ import annotations

import http.server
import importlib.util
import io
import json
import os
import socketserver
import sys
import tempfile
import threading
import urllib.parse
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "arch_inventory", REPO / "deploy" / "scripts" / "arch_inventory.py"
)
assert SPEC and SPEC.loader
ai = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ai
SPEC.loader.exec_module(ai)

LOCK = REPO / "deploy" / "images.lock"

# contracts/env-cloud.md §3: what EC2 runs (edge, web, gateway, the collector, Prometheus, Loki, Grafana, and Langfuse
# with its four stores), by images.lock's service column. The gateway and web images are built from base:node, and web's
# runtime stage is edge's nginx-unprivileged, so their rows are those bases'. The tunnel end's own images (tunnel-end,
# relay, snapshot-sink) arrive in groups 5 and 8; of what is pinned today it runs the collector alone.
EC2 = {
    "edge",
    "otel-collector",
    "prometheus",
    "loki",
    "grafana",
    "langfuse-web",
    "langfuse-worker",
    "langfuse-db",
    "clickhouse",
    "valkey",
    "seaweedfs",
    "base:node",
}
TUNNEL_END = {"otel-collector"}
DEV_ONLY = {"gateway-state", "mailpit", "model-server-cpu", "base:python"}


def digest(n: int) -> str:
    """A digest-shaped value built at run time, never a 64-hex literal in this file."""
    return "sha256:" + format(n, "x").rjust(2, "0") * 32


def platform(name: str) -> dict[str, str]:
    os_, arch, *variant = name.split("/")
    return {
        "os": os_,
        "architecture": arch,
        **({"variant": variant[0]} if variant else {}),
    }


def index(
    *platforms: str,
    local: tuple[str, ...] = ("linux/amd64",),
    attestations: bool = True,
) -> dict:
    """An image inspect answer with manifests=1, as the containerd store gives it for an index: one entry per image
    manifest, Available only for the platform the store holds, and ImageData only where its content is local; the
    platform then comes from the index's descriptor alone. With attestations, BuildKit's unknown/unknown manifests."""
    manifests = []
    for n, name in enumerate(platforms, start=1):
        entry: dict = {
            "ID": digest(n),
            "Descriptor": {
                "mediaType": "application/vnd.oci.image.manifest.v1+json",
                "digest": digest(n),
                "size": 1024,
                "platform": platform(name),
            },
            "Available": name in local,
            "Kind": "image",
        }
        if name in local:
            entry["ImageData"] = {
                "Platform": platform(name),
                "Containers": [],
                "Size": {"Unpacked": 1},
            }
        manifests.append(entry)
        if attestations:
            manifests.append(
                {
                    "ID": digest(n + 100),
                    "Descriptor": {
                        "mediaType": "application/vnd.oci.image.manifest.v1+json",
                        "digest": digest(n + 100),
                        "size": 512,
                        "platform": {"os": "unknown", "architecture": "unknown"},
                    },
                    "Available": False,
                    "Kind": "attestation",
                    "AttestationData": {"For": digest(n)},
                }
            )
    return {
        "Id": digest(99),
        "Os": "linux",
        "Architecture": "amd64",
        "Manifests": manifests,
    }


MULTI = index("linux/amd64", "linux/arm64/v8", "linux/arm/v7")
AMD64_ONLY = index("linux/amd64")


def pins() -> list:
    return ai.parse_lock(LOCK.read_text(encoding="utf-8"))


def stub_engine(docs: dict[str, dict | None], default: dict | None = MULTI):
    """fetch(ref) -> (status, document): the document for a service's pinned reference, 404 for None."""
    by_ref = {pin.ref: docs.get(pin.service, default) for pin in pins()}
    asked: list[str] = []

    def fetch(ref: str) -> tuple[int, dict | None]:
        asked.append(ref)
        doc = by_ref.get(ref)
        return (200, doc) if doc is not None else (404, None)

    return fetch, asked


# --- the hosts each image runs on (contracts/env-cloud.md §3) -------------------------------------------------------


def test_every_pinned_image_has_a_hosts_row_and_no_row_is_stale() -> None:
    services = {pin.service for pin in pins()}
    assert services - set(ai.HOSTS) == set(), (
        "add a HOSTS row from contracts/env-cloud.md §3"
    )
    assert set(ai.HOSTS) - services == set(), (
        "a HOSTS row names no image deploy/images.lock pins"
    )


def test_the_hosts_are_contracts_env_cloud_section_3s() -> None:
    def on(host: str) -> set[str]:
        return {service for service, (hosts, _) in ai.HOSTS.items() if host in hosts}

    assert on("ec2") == EC2
    assert on("tunnel-end") == TUNNEL_END
    # Neither model server runs in the cloud: EC2 has none, and the tunnel end runs no stack (§3).
    assert {"model-server-gpu", "model-server-cpu"}.isdisjoint(
        on("ec2") | on("tunnel-end")
    )
    # dev and dev-cpu's own: the local store, the mail stand-in, the CPU model server, and the probes' base.
    for service in DEV_ONLY:
        assert ai.HOSTS[service][0] == ("dev",), service
    # Every name is one of §3's columns.
    assert {host for hosts, _ in ai.HOSTS.values() for host in hosts} <= {
        "laptop",
        "ec2",
        "tunnel-end",
        "dev",
    }
    assert ai.CLOUD_HOSTS == ("ec2", "tunnel-end")


def test_a_lock_line_without_a_hosts_row_is_refused() -> None:
    text = (
        LOCK.read_text(encoding="utf-8")
        + "newthing  ghcr.io/x/newthing  1.0  "
        + digest(7)
        + "  ghcr.io  2026-11-10\n"
    )
    out = io.StringIO()
    code = ai.main([], environ={}, fetch=stub_engine({})[0], out=out, lock_text=text)
    assert code == 2
    assert (
        "newthing" in out.getvalue() and "contracts/env-cloud.md §3" in out.getvalue()
    )


# --- the platforms, from the index the store holds ------------------------------------------------------------------


def test_the_platforms_come_from_the_index_whether_or_not_the_store_holds_their_content() -> (
    None
):
    # arm64's content was never pulled into the store (seed moves the host's platform), but the index names it.
    assert ai.platforms_of(MULTI) == ["linux/amd64", "linux/arm/v7", "linux/arm64/v8"]
    assert ai.has_arm64(ai.platforms_of(MULTI)) is True
    assert ai.has_arm64(ai.platforms_of(AMD64_ONLY)) is False
    # 32-bit arm isn't arm64.
    assert ai.has_arm64(["linux/amd64", "linux/arm/v7"]) is False
    assert ai.has_arm64(["linux/arm64"]) is True


def test_attestations_and_unknown_platforms_are_not_builds() -> None:
    doc = index("linux/amd64", attestations=True)
    assert ai.platforms_of(doc) == ["linux/amd64"]
    doc["Manifests"].append(
        {
            "Kind": "unknown",
            "Descriptor": {"platform": {"os": "unknown", "architecture": "unknown"}},
        }
    )
    assert ai.platforms_of(doc) == ["linux/amd64"]


def test_a_store_that_shows_no_index_is_unknown_never_amd64_only() -> None:
    # A daemon older than API 1.48, or the classic store, answers without Manifests: the store then can't say what else
    # the image's index named, so the answer is unknown rather than "no arm64".
    for doc in (
        {"Id": digest(1), "Os": "linux", "Architecture": "amd64"},
        {"Manifests": None},
        {"Manifests": []},
    ):
        assert ai.platforms_of(doc) is None
        assert ai.has_arm64(None) is None


# --- the inventory, and each cloud host's answer --------------------------------------------------------------------


def test_the_inventory_reads_each_pinned_reference_and_nothing_else() -> None:
    fetch, asked = stub_engine({})
    rows = ai.inventory(pins(), fetch)
    assert asked == [pin.ref for pin in pins()]
    # By its pinned digest, as the lock pins it: repository:tag@sha256:…
    assert all("@sha256:" in ref for ref in asked)
    assert [row.service for row in rows] == [pin.service for pin in pins()]
    assert all(row.status == "read" and row.arm64 is True for row in rows)


def test_each_cloud_host_is_yes_only_when_every_image_it_runs_has_arm64() -> None:
    rows = ai.inventory(pins(), stub_engine({})[0])
    assert ai.verdict(rows, "ec2") == ai.Verdict("yes", [], [])
    assert ai.verdict(rows, "tunnel-end") == ai.Verdict("yes", [], [])

    rows = ai.inventory(
        pins(), stub_engine({"clickhouse": AMD64_ONLY, "mailpit": AMD64_ONLY})[0]
    )
    # mailpit is dev's, so it changes no cloud host's answer.
    assert ai.verdict(rows, "ec2") == ai.Verdict("no", ["clickhouse"], [])
    assert ai.verdict(rows, "tunnel-end") == ai.Verdict("yes", [], [])

    rows = ai.inventory(pins(), stub_engine({"otel-collector": None})[0])
    assert ai.verdict(rows, "ec2") == ai.Verdict("unknown", [], ["otel-collector"])
    assert ai.verdict(rows, "tunnel-end") == ai.Verdict(
        "unknown", [], ["otel-collector"]
    )

    rows = ai.inventory(
        pins(), stub_engine({"loki": AMD64_ONLY, "grafana": {"Manifests": None}})[0]
    )
    assert ai.verdict(rows, "ec2") == ai.Verdict("no", ["loki"], ["grafana"])


def test_an_image_the_store_lacks_is_absent_and_unknown() -> None:
    rows = ai.inventory(
        pins(), stub_engine({"model-server-gpu": None, "probe:cuda": None})[0]
    )
    by = {row.service: row for row in rows}
    assert (
        by["model-server-gpu"].status == "absent"
        and by["model-server-gpu"].arm64 is None
    )
    assert by["model-server-gpu"].platforms is None


def test_an_unpinned_line_is_never_looked_up() -> None:
    text = LOCK.read_text(encoding="utf-8").replace(
        "chrislusf/seaweedfs                                                                      4.48                     sha256:",
        "chrislusf/seaweedfs  4.48  -  ",
    )
    lock = ai.parse_lock(text)
    seaweed = next(pin for pin in lock if pin.service == "seaweedfs")
    fetch, asked = stub_engine({})
    rows = ai.inventory([seaweed], fetch)
    assert asked == [] and rows[0].status == "unpinned" and rows[0].arm64 is None


# --- what it prints, and its exit status ----------------------------------------------------------------------------


def test_the_table_and_the_answers() -> None:
    out = io.StringIO()
    fetch, _ = stub_engine(
        {"model-server-gpu": None, "probe:cuda": None, "valkey": AMD64_ONLY}
    )
    code = ai.main([], environ={}, fetch=fetch, out=out)
    text = out.getvalue()
    # The GPU-only images aren't on the agents' engine, and run on the laptop alone: no cloud host waits on them.
    assert code == 0, text
    lines = text.splitlines()
    row = next(line for line in lines if line.split()[:1] == ["valkey"])
    assert row.split()[1] == "no" and "linux/amd64" in row and "laptop, ec2, dev" in row
    row = next(line for line in lines if line.split()[:1] == ["edge"])
    assert row.split()[1] == "yes" and "linux/arm64/v8" in row
    row = next(line for line in lines if line.split()[:1] == ["model-server-gpu"])
    assert row.split()[1] == "?" and "absent from this store" in row
    assert "ec2: no; lacking linux/arm64: valkey" in text
    assert "tunnel-end: yes" in text
    # Read from the store, never a registry.
    assert "never a registry" in text


def test_an_unread_image_on_a_cloud_host_fails() -> None:
    out = io.StringIO()
    code = ai.main([], environ={}, fetch=stub_engine({"prometheus": None})[0], out=out)
    assert code == 1
    assert "ec2: unknown; not read: prometheus" in out.getvalue()


def test_the_json_record() -> None:
    out = io.StringIO()
    code = ai.main(
        ["--json"], environ={}, fetch=stub_engine({"seaweedfs": AMD64_ONLY})[0], out=out
    )
    assert code == 0
    doc = json.loads(out.getvalue())
    assert doc["h4_arch_inventory"] == 1
    assert set(doc) == {"h4_arch_inventory", "source", "images", "hosts"}
    first = doc["images"][0]
    assert set(first) == {
        "service",
        "image",
        "status",
        "platforms",
        "arm64",
        "hosts",
        "via",
    }
    assert doc["hosts"]["ec2"] == {
        "answer": "no",
        "lacking": ["seaweedfs"],
        "unknown": [],
    }
    assert doc["hosts"]["tunnel-end"] == {"answer": "yes", "lacking": [], "unknown": []}
    # No price, and no digest of the engine's own: the lock's pins only.
    assert "usd" not in out.getvalue().lower()


# --- where it reads from --------------------------------------------------------------------------------------------


def test_the_engine_is_docker_s_own_choice_from_the_environment(tmp_path: Path) -> None:
    home = tmp_path
    assert ai.endpoint({}, home) == ai.Endpoint("unix", path="/var/run/docker.sock")
    assert (
        ai.endpoint({"DOCKER_HOST": "unix:///run/user/1/docker.sock"}, home).path
        == "/run/user/1/docker.sock"
    )
    # The relay's end inside the sandbox, over mutual TLS, with the certificates where the docker CLI finds them.
    relay = {
        "DOCKER_HOST": "tcp://127.0.0.1:2376",
        "DOCKER_TLS_VERIFY": "1",
        "DOCKER_CONFIG": "/c",
    }
    assert ai.endpoint(relay, home) == ai.Endpoint(
        "tls", host="127.0.0.1", port=2376, certs=Path("/c")
    )
    assert ai.endpoint({**relay, "DOCKER_CERT_PATH": "/p"}, home).certs == Path("/p")
    no_config = {"DOCKER_HOST": "tcp://198.18.0.1:2376", "DOCKER_TLS_VERIFY": "1"}
    assert ai.endpoint(no_config, home).certs == home / ".docker"


@pytest.mark.parametrize(
    "environ",
    [
        {
            "DOCKER_HOST": "tcp://127.0.0.1:2376"
        },  # no TLS: the engine answers mutual TLS only
        {"DOCKER_HOST": "ssh://user@host"},
        {"DOCKER_HOST": "tcp://127.0.0.1"},  # no port
        {
            "DOCKER_CONTEXT": "other"
        },  # a context isn't read: DOCKER_HOST names the engine
    ],
)
def test_an_engine_it_cant_name_for_certain_is_refused(
    environ: dict[str, str], tmp_path: Path
) -> None:
    with pytest.raises(ai.Refusal):
        ai.endpoint(environ, tmp_path)
    out = io.StringIO()
    assert ai.main([], environ=environ, out=out) == 2


def test_the_request_is_one_get_of_the_image_with_its_manifests() -> None:
    path = ai.request_path(
        "ghcr.io/nginx/nginx-unprivileged:1.30.5-alpine@" + digest(5)
    )
    assert path.startswith(
        "/v1.48/images/ghcr.io/nginx/nginx-unprivileged:1.30.5-alpine@sha256:"
    )
    assert path.endswith("/json?manifests=1")
    # Nothing that would make it a different request.
    assert (
        "?" not in path[: -len("?manifests=1")] and " " not in path and "#" not in path
    )


class _Engine(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True


def test_a_fake_engine_on_a_unix_socket() -> None:
    """The script's own HTTP: GET only, the manifests view, a 404 for an image the store lacks."""
    docs = {pin.ref: (AMD64_ONLY if pin.service == "loki" else MULTI) for pin in pins()}
    docs = {
        ref: doc
        for ref, doc in docs.items()
        if not ref.startswith("ghcr.io/ggml-org/llama.cpp:server-cuda")
    }
    seen: list[tuple[str, str]] = []

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            seen.append(("GET", self.path))
            parsed = urllib.parse.urlsplit(self.path)
            name = urllib.parse.unquote(
                parsed.path.removeprefix("/v1.48/images/").removesuffix("/json")
            )
            doc = docs.get(name) if parsed.query == "manifests=1" else None
            body = json.dumps(doc if doc else {"message": "No such image"}).encode()
            self.send_response(200 if doc else 404)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self) -> None:
            seen.append(("POST", self.path))
            self.send_response(403)
            self.end_headers()

        def log_message(self, *args: object) -> None:
            pass

        def address_string(self) -> str:
            return "unix"

    folder = tempfile.mkdtemp(dir=os.environ.get("TMPDIR") or "/tmp")
    sock = os.path.join(folder, "e.sock")
    if len(sock) > 100:
        pytest.skip("the temporary folder's path is too long for a unix socket")
    server = _Engine(sock, Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        out = io.StringIO()
        code = ai.main([], environ={"DOCKER_HOST": f"unix://{sock}"}, out=out)
    finally:
        server.shutdown()
        server.server_close()
        os.unlink(sock)
        os.rmdir(folder)
    text = out.getvalue()
    assert code == 0, text
    assert {method for method, _ in seen} == {"GET"}
    assert len(seen) == len(pins())
    assert all(path.endswith("/json?manifests=1") for _, path in seen)
    assert "ec2: no; lacking linux/arm64: loki" in text
    row = next(
        line for line in text.splitlines() if line.split()[:1] == ["model-server-gpu"]
    )
    assert "absent from this store" in row
