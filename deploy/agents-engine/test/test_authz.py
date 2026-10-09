"""Tests for deploy/agents-engine/authz.py (spec 000, FR-039; contracts/agents-engine.md §3).

A case for every admission rule A0-A35, plus `default_deny`, `malformed`, the read path, and the
audit record's shape, on recorded Docker API request bodies. The module is loaded by path and
registered in sys.modules, as the engine's tests must (no package, run through PY_HOST).

    PYTHONPYCACHEPREFIX=$TMPDIR/pyc pytest -q -p no:cacheprovider --import-mode=importlib deploy/agents-engine
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location(
    "authz", REPO / "deploy" / "agents-engine" / "authz.py"
)
assert SPEC and SPEC.loader
authz = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = authz
SPEC.loader.exec_module(authz)

API = "/v1.51"  # a version prefix the plugin strips; the rules are the same without it
TREE = "/run/h4agents/tree"
MODELS = "/run/h4agents/models"
STATE = "/var/lib/h4agents/state"


def create(
    host: dict | None = None, config: dict | None = None, name: str = ""
) -> authz.Decision:
    """Judge a recorded POST /containers/create body."""
    body = {"Image": "img@sha256:" + "0" * 64}
    if config is not None:
        body["Config"] = config
    if host is not None:
        body["HostConfig"] = host
    uri = f"{API}/containers/create"
    if name:
        uri += f"?name={name}"
    return authz.judge("POST", uri, json.dumps(body).encode())


def post(path: str, body: object = None) -> authz.Decision:
    raw = b"" if body is None else json.dumps(body).encode()
    return authz.judge("POST", API + path, raw)


# --------------------------------------------------------------------------------------------------
# A0: the body
# --------------------------------------------------------------------------------------------------
def test_a0_missing_body() -> None:
    assert authz.judge("POST", f"{API}/containers/create", b"").rule == "A0"


def test_a0_empty_body() -> None:
    assert authz.judge("POST", f"{API}/containers/create", b"   ").rule == "A0"


def test_a0_non_json_body() -> None:
    assert authz.judge("POST", f"{API}/containers/create", b"not-json{").rule == "A0"


def test_a0_body_not_an_object() -> None:
    assert authz.judge("POST", f"{API}/containers/create", b"[1,2,3]").rule == "A0"


def test_a0_oversized_body() -> None:
    # Docker forwards bodies up to 1 MiB; a larger one arrives without its body and is refused.
    giant = b'{"Image":"x","pad":"' + b"a" * (authz.MAX_BODY + 10) + b'"}'
    assert authz.judge("POST", f"{API}/containers/create", giant).rule == "A0"


def test_a0_allows_a_minimal_body() -> None:
    assert create(config={"Image": "x"}).allow


# --------------------------------------------------------------------------------------------------
# A1-A13, A16, A19, A20, A24: HostConfig scalar fields
# --------------------------------------------------------------------------------------------------
def test_a1_privileged() -> None:
    assert create({"Privileged": True}).rule == "A1"
    assert create({"Privileged": False}).allow


def test_a2_devices() -> None:
    decision = create(
        {"Devices": [{"PathOnHost": "/dev/dxg", "PathInContainer": "/dev/dxg"}]}
    )
    assert decision.rule == "A2"


def test_a3_device_requests_gpus() -> None:
    decision = create({"DeviceRequests": [{"Driver": "nvidia", "Count": -1}]})
    assert decision.rule == "A3"


def test_a4_device_cgroup_rules() -> None:
    assert create({"DeviceCgroupRules": ["c 10:200 rwm"]}).rule == "A4"


def test_a5_capadd_outside_default_set() -> None:
    assert create({"CapAdd": ["SYS_ADMIN"]}).rule == "A5"
    assert create({"CapAdd": ["ALL"]}).rule == "A5"
    assert create({"CapAdd": ["CAP_NET_ADMIN"]}).rule == "A5"


def test_a5_capadd_within_default_set_allowed() -> None:
    # plan §1's databases add these back after cap_drop: [ALL]; any case, with or without CAP_.
    assert create({"CapAdd": ["CHOWN", "setuid", "cap_dac_override", "FOWNER"]}).allow


def test_a6_securityopt() -> None:
    assert create({"SecurityOpt": ["seccomp=unconfined"]}).rule == "A6"
    assert create({"SecurityOpt": ["no-new-privileges:false"]}).rule == "A6"
    assert create({"SecurityOpt": ["systempaths=unconfined"]}).rule == "A6"


def test_a6_securityopt_no_new_privileges_allowed() -> None:
    for value in (
        "no-new-privileges",
        "no-new-privileges:true",
        "no-new-privileges=true",
    ):
        assert create({"SecurityOpt": [value]}).allow


def test_a7_masked_and_readonly_paths() -> None:
    assert (
        create({"MaskedPaths": []}).rule == "A7"
    )  # even the defaults spelled out are refused
    assert create({"ReadonlyPaths": ["/proc/bus"]}).rule == "A7"
    assert create({"MaskedPaths": None}).allow  # absent or null uses Docker's defaults


def test_a8_pid_mode() -> None:
    assert create({"PidMode": "host"}).rule == "A8"
    assert create({"PidMode": "container:abc"}).allow
    assert create({"PidMode": ""}).allow


def test_a9_ipc_mode() -> None:
    assert create({"IpcMode": "host"}).rule == "A9"
    for value in ("private", "shareable", "none", "container:abc", ""):
        assert create({"IpcMode": value}).allow


def test_a10_uts_mode() -> None:
    assert create({"UTSMode": "host"}).rule == "A10"
    assert create({"UTSMode": ""}).allow


def test_a11_userns_mode() -> None:
    assert create({"UsernsMode": "host"}).rule == "A11"
    assert create({"UsernsMode": "keep-id"}).rule == "A11"  # any other value too
    assert create({"UsernsMode": ""}).allow


def test_a12_cgroupns_and_cgroup() -> None:
    assert create({"CgroupnsMode": "host"}).rule == "A12"
    assert create({"Cgroup": "/custom"}).rule == "A12"
    assert create({"CgroupnsMode": "private"}).allow


def test_a13_network_mode() -> None:
    assert create({"NetworkMode": "host"}).rule == "A13"
    for value in ("default", "bridge", "none", "my-user-net", "container:abc"):
        assert create({"NetworkMode": value}).allow


def test_a16_volume_driver() -> None:
    assert create({"VolumeDriver": "some-plugin"}).rule == "A16"
    assert create({"VolumeDriver": "local"}).allow


def test_a19_sysctls() -> None:
    assert create({"Sysctls": {"net.ipv4.ip_forward": "1"}}).rule == "A19"
    assert create({"Sysctls": {}}).allow


def test_a20_runtime() -> None:
    assert create({"Runtime": "nvidia"}).rule == "A20"
    assert create({"Runtime": "runc"}).allow


def test_a24_log_driver() -> None:
    assert create({"LogConfig": {"Type": "syslog"}}).rule == "A24"
    assert create({"LogConfig": {"Type": "gelf"}}).rule == "A24"
    for value in ("local", "json-file", "none", ""):
        assert create({"LogConfig": {"Type": value}}).allow


# --------------------------------------------------------------------------------------------------
# A14: HostConfig.Binds
# --------------------------------------------------------------------------------------------------
def test_a14_bind_under_tree_ro_allowed() -> None:
    assert create({"Binds": [f"{TREE}:/w:ro"]}).allow
    assert create({"Binds": [f"{TREE}/config:/w:ro"]}).allow
    assert create({"Binds": [f"{MODELS}:/models:ro"]}).allow


def test_a14_bind_state_rw_allowed() -> None:
    assert create({"Binds": [f"{STATE}/dev-cpu:/s:rw"]}).allow
    assert create(
        {"Binds": [f"{STATE}:/s"]}
    ).allow  # default rw under the state root is fine


def test_a14_named_volume_allowed() -> None:
    assert create({"Binds": ["metervol:/var/lib/data"]}).allow


@pytest.mark.parametrize(
    "source",
    [
        "/",
        "/home/h4reet",
        "/mnt/c",
        "/run/WSL",
        "/run/user/1000",
        "/run/dbus",
        "/var/run/docker.sock",
        "/run/docker.sock",
        "/etc",
        "/proc",
        "/sys",
        "/dev",
        "/usr/lib/wsl",
    ],
)
def test_a14_bind_forbidden_sources(source: str) -> None:
    assert create({"Binds": [f"{source}:/w:ro"]}).rule == "A14"


def test_a14_bind_rw_under_readonly_root_refused() -> None:
    assert create({"Binds": [f"{TREE}:/w:rw"]}).rule == "A14"
    assert (
        create({"Binds": [f"{TREE}:/w"]}).rule == "A14"
    )  # no mode means rw, which ro roots refuse


def test_a14_bind_traversal_refused() -> None:
    assert create({"Binds": [f"{TREE}/../../etc:/w:ro"]}).rule == "A14"


def test_a14_bind_forbidden_options_refused() -> None:
    for option in ("shared", "rshared", "slave", "rslave", "z", "Z"):
        assert create({"Binds": [f"{STATE}:/s:rw,{option}"]}).rule == "A14"


# --------------------------------------------------------------------------------------------------
# A15: HostConfig.Mounts
# --------------------------------------------------------------------------------------------------
def test_a15_mount_bind_outside_roots_refused() -> None:
    mount = {"Type": "bind", "Source": "/home/h4reet", "Target": "/w", "ReadOnly": True}
    assert create({"Mounts": [mount]}).rule == "A15"


def test_a15_mount_bind_tree_requires_readonly() -> None:
    writable = {"Type": "bind", "Source": TREE, "Target": "/w", "ReadOnly": False}
    assert create({"Mounts": [writable]}).rule == "A15"
    read_only = {"Type": "bind", "Source": TREE, "Target": "/w", "ReadOnly": True}
    assert create({"Mounts": [read_only]}).allow


def test_a15_mount_bad_propagation_refused() -> None:
    mount = {
        "Type": "bind",
        "Source": STATE,
        "Target": "/s",
        "ReadOnly": False,
        "BindOptions": {"Propagation": "rshared"},
    }
    assert create({"Mounts": [mount]}).rule == "A15"


def test_a15_mount_npipe_and_cluster_refused() -> None:
    assert create({"Mounts": [{"Type": "npipe", "Source": "x"}]}).rule == "A15"
    assert create({"Mounts": [{"Type": "cluster", "Source": "x"}]}).rule == "A15"


def test_a15_mount_tmpfs_and_image_allowed() -> None:
    assert create({"Mounts": [{"Type": "tmpfs", "Target": "/t"}]}).allow
    assert create(
        {"Mounts": [{"Type": "image", "Source": "img", "Target": "/i"}]}
    ).allow


def test_a15_mount_volume_with_bind_device_refused() -> None:
    mount = {
        "Type": "volume",
        "Target": "/v",
        "VolumeOptions": {
            "DriverConfig": {
                "Name": "local",
                "Options": {"type": "none", "o": "bind", "device": "/home/h4reet"},
            }
        },
    }
    assert create({"Mounts": [mount]}).rule == "A17"


# --------------------------------------------------------------------------------------------------
# A17: POST /volumes/create and DriverConfig
# --------------------------------------------------------------------------------------------------
def test_a17_volume_local_no_options_allowed() -> None:
    assert post("/volumes/create", {"Name": "data", "Driver": "local"}).allow


def test_a17_volume_tmpfs_allowed() -> None:
    body = {
        "Name": "scratch",
        "Driver": "local",
        "DriverOpts": {"type": "tmpfs", "device": "tmpfs", "o": "size=64m"},
    }
    assert post("/volumes/create", body).allow


def test_a17_volume_other_driver_refused() -> None:
    assert post("/volumes/create", {"Name": "x", "Driver": "nfs"}).rule == "A17"


def test_a17_volume_bind_in_disguise_refused() -> None:
    body = {
        "Name": "x",
        "Driver": "local",
        "DriverOpts": {"type": "none", "o": "bind", "device": "/home/h4reet"},
    }
    assert post("/volumes/create", body).rule == "A17"
    device_path = {"Name": "x", "Driver": "local", "DriverOpts": {"device": "/etc"}}
    assert post("/volumes/create", device_path).rule == "A17"


# --------------------------------------------------------------------------------------------------
# A18, A22: fields that are allowed; A21: ports, on the host's loopback only
# --------------------------------------------------------------------------------------------------
def test_a18_volumes_from_allowed() -> None:
    assert create({"VolumesFrom": ["other-container:ro"]}).allow


@pytest.mark.parametrize("address", ["127.0.0.1", "::1"])
def test_a21_ports_on_the_loopback_allowed(address: str) -> None:
    host = {"PortBindings": {"8080/tcp": [{"HostIp": address, "HostPort": "18300"}]}}
    assert create(host).allow
    assert create({"PortBindings": {"8080/tcp": None}}).allow  # exposed, not published


@pytest.mark.parametrize(
    "entry",
    [
        {"HostPort": "18300"},  # docker run -p 18300:8080: every interface
        {"HostIp": "", "HostPort": "18300"},
        {"HostIp": "0.0.0.0", "HostPort": "18300"},
        {"HostIp": "::", "HostPort": "18300"},
        {"HostIp": "172.17.0.1", "HostPort": "18300"},
        {"HostIp": "127.0.0.2", "HostPort": "18300"},
        "18300",
    ],
)
def test_a21_ports_off_the_loopback_refused(entry: object) -> None:
    decision = create({"PortBindings": {"8080/tcp": [entry]}})
    assert not decision.allow and decision.rule == "A21"


def test_a21_publish_all_refused() -> None:
    decision = create({"PublishAllPorts": True})
    assert not decision.allow and decision.rule == "A21"
    assert create({"PortBindings": ["8080:8080"]}).rule == "A21"  # not an object


def test_a22_extra_hosts_allowed() -> None:
    assert create({"ExtraHosts": ["example.com:93.184.216.34"]}).allow


# --------------------------------------------------------------------------------------------------
# A25-A33, A35: the other endpoints
# --------------------------------------------------------------------------------------------------
def test_a25_exec_privileged_refused() -> None:
    assert post("/containers/abc/exec", {"Privileged": True}).rule == "A25"
    assert post("/containers/abc/exec", {"Cmd": ["ls"]}).allow


def test_a26_update_devices_refused() -> None:
    assert (
        post("/containers/abc/update", {"DeviceRequests": [{"Count": -1}]}).rule
        == "A26"
    )
    assert post("/containers/abc/update", {"Memory": 1024}).allow


def test_a27_start_with_body_refused() -> None:
    assert post("/containers/abc/start", {"Binds": ["/:/host"]}).rule == "A27"
    assert post("/containers/abc/start").allow
    assert post("/containers/abc/start", {}).allow


def test_a28_plugins_refused_get_allowed() -> None:
    assert post("/plugins/pull").rule == "A28"
    assert authz.judge("POST", f"{API}/plugins/privileged/enable", b"{}").rule == "A28"
    assert authz.judge("GET", f"{API}/plugins", b"").allow


def test_a29_swarm_writes_refused() -> None:
    for path in (
        "/swarm/init",
        "/services/create",
        "/nodes/x/update",
        "/secrets/create",
        "/configs/create",
    ):
        assert post(path, {}).rule == "A29"
    assert authz.judge("GET", f"{API}/services", b"").allow


def test_a30_build_host_network_and_remote_refused() -> None:
    assert authz.judge("POST", f"{API}/build?networkmode=host", b"").rule == "A30"
    assert (
        authz.judge("POST", f"{API}/build?remote=https://evil/ctx.tar", b"").rule
        == "A30"
    )
    assert authz.judge("POST", f"{API}/build?t=img:latest", b"").allow


def test_a32_image_push_refused() -> None:
    assert authz.judge("POST", f"{API}/images/registry/repo/push", b"").rule == "A32"


def test_a33_auth_refused() -> None:
    assert post("/auth", {"username": "x", "password": "y"}).rule == "A33"


def test_a35_networks_create_driver() -> None:
    for driver in ("host", "macvlan", "ipvlan", "overlay", "weird"):
        assert post("/networks/create", {"Name": "n", "Driver": driver}).rule == "A35"
    assert post("/networks/create", {"Name": "n", "Driver": "bridge"}).allow
    assert post("/networks/create", {"Name": "n"}).allow  # no driver named


# --------------------------------------------------------------------------------------------------
# Read endpoints, allowed writes, default_deny, malformed
# --------------------------------------------------------------------------------------------------
@pytest.mark.parametrize(
    "path",
    [
        "/_ping",
        "/version",
        "/info",
        "/events",
        "/system/df",
        "/containers/json",
        "/containers/abc/logs",
    ],
)
def test_read_endpoints_allowed(path: str) -> None:
    assert authz.judge("GET", API + path, b"").allow


@pytest.mark.parametrize(
    "method,path",
    [
        ("POST", "/containers/abc/stop"),
        ("POST", "/containers/abc/kill"),
        ("DELETE", "/containers/abc"),
        ("POST", "/exec/abc/start"),
        ("POST", "/networks/abc/connect"),
        ("DELETE", "/volumes/data"),
        ("POST", "/containers/prune"),
        ("POST", "/images/create"),
        ("POST", "/commit"),
    ],
)
def test_allowed_writes(method: str, path: str) -> None:
    assert authz.judge(method, API + path, b"{}" if method != "DELETE" else b"").allow


def test_default_deny_unknown_endpoint() -> None:
    assert authz.judge("POST", f"{API}/widgets/create", b"{}").rule == "default_deny"
    assert (
        authz.judge("PUT", f"{API}/containers/abc/anything", b"{}").rule
        == "default_deny"
    )


def test_malformed_traversal() -> None:
    assert (
        authz.judge("POST", f"{API}/containers/../secrets/create", b"{}").rule
        == "malformed"
    )


def test_malformed_double_encoding() -> None:
    # %252e decodes to %2e the first time, which differs again the second time.
    assert (
        authz.judge("GET", f"{API}/containers/%252e%252e/json", b"").rule == "malformed"
    )


def test_version_prefix_and_slashes_normalized() -> None:
    assert authz.judge("GET", "/v1.51//containers///json", b"").endpoint == "read"


# --------------------------------------------------------------------------------------------------
# The audit record (§3.5)
# --------------------------------------------------------------------------------------------------
def test_audit_record_for_a_refusal() -> None:
    decision = create({"Privileged": True}, name="probe")
    record = authz.audit_record(decision, "h4agents-sandbox")
    assert record["decision"] == "refuse"
    assert record["rule"] == "A1"
    assert record["user"] == "h4agents-sandbox"
    assert record["method"] == "POST"
    assert record["endpoint"] == "containers.create"
    assert record["field"] == "HostConfig.Privileged"
    assert record["container"] == "probe"
    assert record["image"].startswith("img@sha256:")
    assert record["ts"].endswith("Z")


def test_audit_path_carries_query_keys_not_values() -> None:
    decision = create({"Privileged": True}, name="secret-name")
    record = authz.audit_record(decision, "h4agents-sandbox")
    # The path logs the query's keys, never its values (§3.5).
    assert record["path"] == "/containers/create?name"
    assert "secret-name" not in record["path"]


def test_audit_record_never_logs_env_or_cmd() -> None:
    config = {
        "Env": ["SECRET=abcd"],
        "Cmd": ["/bin/sh", "-c", "echo hi"],
        "User": "root",
    }
    decision = create({"Privileged": True}, config=config)
    record = authz.audit_record(decision, "h4agents-author")
    flat = json.dumps(record)
    assert "SECRET" not in flat
    assert "abcd" not in flat
    assert "/bin/sh" not in flat


def test_audit_record_for_an_allow() -> None:
    decision = create({"NetworkMode": "bridge"})
    record = authz.audit_record(decision, "h4agents-sandbox")
    assert record["decision"] == "allow"
    assert "field" not in record


def test_both_identities_held_to_the_same_rules() -> None:
    # The common name only names who acted; the decision is the same for either (§2.1).
    decision = create({"Privileged": True})
    assert not decision.allow
    for user in ("h4agents-sandbox", "h4agents-author"):
        assert authz.audit_record(decision, user)["user"] == user


# --------------------------------------------------------------------------------------------------
# The rotating audit log (§3.5): one JSON line per decision, rotated at 10 MB, keeping 5 files.
# --------------------------------------------------------------------------------------------------
def test_audit_log_writes_one_json_line_per_decision(tmp_path: Path) -> None:
    log = authz.AuditLog(str(tmp_path / "authz.jsonl"))
    log.write({"decision": "refuse", "rule": "A1"})
    log.write({"decision": "allow", "rule": "allow"})
    lines = (tmp_path / "authz.jsonl").read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2
    assert json.loads(lines[0])["rule"] == "A1"


def test_audit_log_rotates_and_keeps_five(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "authz.jsonl"
    log = authz.AuditLog(str(path))
    monkeypatch.setattr(authz.AuditLog, "MAX_BYTES", 200)
    for index in range(50):
        log.write({"decision": "refuse", "rule": f"A{index}", "pad": "x" * 50})
    rotated = sorted(p.name for p in tmp_path.glob("authz.jsonl*"))
    # The live file plus at most KEEP rotated files; the oldest is dropped.
    assert "authz.jsonl" in rotated
    assert not (tmp_path / f"authz.jsonl.{authz.AuditLog.KEEP + 1}").exists()
    assert len([p for p in rotated if p != "authz.jsonl"]) <= authz.AuditLog.KEEP


# --------------------------------------------------------------------------------------------------
# The server path: what dockerd's AuthZReq call reaches. The rules above are judged directly; these
# drive the handler, so a request that never reaches the rules (as a wrong call once did) fails here.
# --------------------------------------------------------------------------------------------------
class _Recorder(authz._Handler):
    """The plugin's handler without a socket (AF_UNIX is blocked in the sandbox): it keeps what it sends."""

    def __init__(
        self, log: authz.AuditLog
    ) -> None:  # skips BaseHTTPRequestHandler's socket setup
        self.server = type("Server", (), {"audit_log": log})()
        self.sent: list[dict] = []

    def _send(self, payload: dict) -> None:
        self.sent.append(payload)


def authz_req(log: authz.AuditLog, request: dict) -> dict:
    handler = _Recorder(log)
    handler._handle_req(json.dumps(request).encode("utf-8"))
    assert len(handler.sent) == 1
    return handler.sent[0]


def encoded(body: dict) -> str:
    import base64

    return base64.b64encode(json.dumps(body).encode("utf-8")).decode("ascii")


def test_the_server_path_judges_each_request_and_audits_it(tmp_path: Path) -> None:
    log = authz.AuditLog(str(tmp_path / "authz.jsonl"))
    read = {
        "RequestMethod": "GET",
        "RequestUri": API + "/containers/json",
        "User": "h4agents",
    }
    assert authz_req(log, read) == {"Allow": True}
    privileged = {
        "RequestMethod": "POST",
        "RequestUri": API + "/containers/create",
        "RequestBody": encoded(
            {"Image": "img@sha256:" + "0" * 64, "HostConfig": {"Privileged": True}}
        ),
    }
    refused = authz_req(log, privileged)
    assert refused["Allow"] is False
    assert refused["Msg"].startswith("refused by h4-authz (")
    records = [
        json.loads(line) for line in (tmp_path / "authz.jsonl").read_text().splitlines()
    ]
    assert [r["decision"] for r in records] == ["allow", "refuse"]
    assert records[0]["user"] == "h4agents"
    # No User: no client certificate, so a client on the daemon's own unix socket, never the sandbox.
    assert records[1]["user"] == "unknown"


def test_the_server_path_refuses_an_unreadable_request(tmp_path: Path) -> None:
    log = authz.AuditLog(str(tmp_path / "authz.jsonl"))
    handler = _Recorder(log)
    handler._handle_req(b"{not json")
    assert handler.sent == [{"Allow": False, "Msg": "unreadable authz request"}]


# --------------------------------------------------------------------------------------------------
# §3.1: the body as Docker reads it
# --------------------------------------------------------------------------------------------------
IMAGE = "img@sha256:" + "0" * 64


def raw_create(text: str) -> authz.Decision:
    return authz.judge("POST", f"{API}/containers/create", text.encode("utf-8"))


@pytest.mark.parametrize(
    ("body", "rule"),
    [
        ({"Image": IMAGE, "hostconfig": {"privileged": True}}, "A1"),
        ({"Image": IMAGE, "HOSTCONFIG": {"Privileged": True}}, "A1"),
        ({"Image": IMAGE, "HostConfig": {"binds": ["/etc:/x"]}}, "A14"),
        # Go's simple folding also matches U+017F to s and U+212A to k.
        ({"Image": IMAGE, "HostConfig": {"Bind\u017f": ["/etc:/x"]}}, "A14"),
        ({"Image": IMAGE, "HostConfig": {"Mas\u212aedPaths": []}}, "A7"),
        (
            {
                "Image": IMAGE,
                "HostConfig": {"portbindings": {"80/tcp": [{"hostport": "9"}]}},
            },
            "A21",
        ),
        (
            {
                "Image": IMAGE,
                "HostConfig": {
                    "Mounts": [{"type": "bind", "source": "/etc", "target": "/x"}]
                },
            },
            "A15",
        ),
    ],
)
def test_keys_match_as_docker_matches_them(body: dict, rule: str) -> None:
    decision = authz.judge(
        "POST", f"{API}/containers/create", json.dumps(body).encode()
    )
    assert not decision.allow and decision.rule == rule


@pytest.mark.parametrize(
    "text",
    [
        # Go merges a repeated object into the first, so this is privileged to the daemon.
        f'{{"Image":"{IMAGE}","HostConfig":{{"Privileged":true}},"HostConfig":{{"CapAdd":[]}}}}',
        f'{{"Image":"{IMAGE}","HostConfig":{{}},"hostConfig":{{"Privileged":true}}}}',
        # A repeated map keeps the first one's entries too.
        f'{{"Image":"{IMAGE}","HostConfig":{{"PortBindings":{{"80/tcp":[{{"HostPort":"9"}}]}},"PortBindings":{{}}}}}}',
    ],
)
def test_a_repeated_key_is_malformed(text: str) -> None:
    decision = raw_create(text)
    assert not decision.allow and decision.rule == "malformed"


@pytest.mark.parametrize(
    ("body", "rule"),
    [
        ({"Image": IMAGE, "Privileged": True}, "A1"),
        ({"Image": IMAGE, "Binds": ["/:/host"]}, "A14"),
        ({"Image": IMAGE, "NetworkMode": "host"}, "A13"),
        ({"Image": IMAGE, "PortBindings": {"80/tcp": [{"HostPort": "9"}]}}, "A21"),
    ],
)
def test_host_fields_at_the_top_level_are_held_to_the_same_rules(
    body: dict, rule: str
) -> None:
    decision = authz.judge(
        "POST", f"{API}/containers/create", json.dumps(body).encode()
    )
    assert not decision.allow and decision.rule == rule


def test_case_folding_reaches_the_other_endpoints() -> None:
    assert (
        post("/containers/abc/exec", {"privileged": True, "Cmd": ["sh"]}).rule == "A25"
    )
    assert (
        post("/containers/abc/update", {"devices": [{"PathOnHost": "/dev/dxg"}]}).rule
        == "A26"
    )
    assert post("/networks/create", {"Name": "n", "driver": "macvlan"}).rule == "A35"
    assert (
        post(
            "/volumes/create",
            {
                "Name": "v",
                "driverOpts": {"type": "none", "o": "bind", "device": "/etc"},
            },
        ).rule
        == "A17"
    )


def test_an_ordinary_compose_body_is_still_allowed() -> None:
    body = {
        "Image": IMAGE,
        "Env": ["A=1"],
        "Labels": {"com.docker.compose.project": "h4reet-dev-cpu"},
        "HostConfig": {
            "CapDrop": ["ALL"],
            "SecurityOpt": ["no-new-privileges:true"],
            "PortBindings": {
                "8080/tcp": [{"HostIp": "127.0.0.1", "HostPort": "18300"}]
            },
            "Mounts": [
                {
                    "Type": "bind",
                    "Source": TREE + "/deploy",
                    "Target": "/d",
                    "ReadOnly": True,
                }
            ],
            "LogConfig": {"Type": "local"},
        },
    }
    assert authz.judge(
        "POST", f"{API}/containers/create", json.dumps(body).encode()
    ).allow
