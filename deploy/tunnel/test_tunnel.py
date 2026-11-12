"""The tunnel and its far end (spec 001 tasks.md T041; FR-052, FR-053, FR-055; contracts/tunnel.md §2, §3, and §5;
research.md R-11; plan.md §16, "The shared state on the tunnel end").

Two kinds of check:
  - on the files, always: deploy/tunnel/sshd_config and ssh_config hold the contract's settings and no other forward,
    the entrypoint's backoff and metrics, and the Dockerfile's pinned base, its one user, and no host key baked in;
  - on the agents' engine, two containers of the tunnel's image, `tunnel-end` and `tunnel`, with stand-ins for the
    laptop's `edge`, the store (`shared-state:5432`), and the sink (`snapshot-sink:8080`): only 2201, 2202, and 2203
    may be listened on, and only the store and the sink opened; no shell or command opens; a wrong host key is refused;
    and the forward to the store reaches only the store.

The second kind needs the image, which builds from Ubuntu's archive (deploy/tunnel/Dockerfile). The agents' engine
reaches only the hosts its egress proxy allows, which don't include the archive. So these checks take the image the
Author built on his engine and moved to the agents' engine as `h4reet-tunnel-seed:local` (W1's note, "For the Author",
group 5), when its files and what its Dockerfile makes of it are the tree's (seeded()); otherwise they build it, and skip only when the build fails exactly as the
archive out of reach makes it fail (archive_unreachable). Any other failure fails them (group 5's review, I2). Keys are
made at run time, never written as literals.
"""

from __future__ import annotations

import io
import json
import os
import re
import secrets
import shutil
import subprocess
import tarfile
import time
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
RELAY = REPO / "deploy" / "agents-engine" / "docker-relay"
LOCK = REPO / "deploy" / "images.lock"
SSHD = HERE / "sshd_config"
CLIENT = HERE / "ssh_config"
ENTRYPOINT = HERE / "entrypoint.sh"
DOCKERFILE = HERE / "Dockerfile"
UID = 10001


def directives(path: Path) -> list[tuple[str, list[str]]]:
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            word, *args = line.split()
            out.append((word, args))
    return out


def setting(path: Path, name: str) -> list[list[str]]:
    return [args for word, args in directives(path) if word.lower() == name.lower()]


# ----------------------------------------------------------------------------------------------------------------------
# The files.

# contracts/tunnel.md §2, with W1's store (plan.md §16): every setting the contract names, as it names it.
SSHD_CONTRACT = {
    "Port": ["2222"],
    "HostKey": ["/run/keys/ssh_host_ed25519_key"],
    "AuthorizedKeysFile": ["/run/keys/authorized_keys"],
    "PasswordAuthentication": ["no"],
    "KbdInteractiveAuthentication": ["no"],
    "PubkeyAuthentication": ["yes"],
    "PermitRootLogin": ["no"],
    "AllowUsers": ["tunnel"],
    "MaxSessions": ["0"],
    "AllowTcpForwarding": ["yes"],
    "GatewayPorts": ["clientspecified"],
    "PermitListen": ["0.0.0.0:2201", "0.0.0.0:2202", "0.0.0.0:2203"],
    "PermitOpen": ["shared-state:5432", "snapshot-sink:8080"],
    "ClientAliveInterval": ["10"],
    "ClientAliveCountMax": ["3"],
}
# What else closes a shell, a command, or another kind of forward, beside MaxSessions 0.
SSHD_CLOSED = {
    "PermitTTY": ["no"],
    "X11Forwarding": ["no"],
    "AllowAgentForwarding": ["no"],
    "AllowStreamLocalForwarding": ["no"],
    "PermitTunnel": ["no"],
    "PermitUserRC": ["no"],
    "PermitUserEnvironment": ["no"],
    "UsePAM": ["no"],
    "StrictModes": ["yes"],
    "PidFile": ["none"],
}
# 2222 is open to the world, and one client connects: a short grace, few unauthenticated connections, from one address
# fewer still, and two tries (group 5's review, nits).
SSHD_LIMITS = {
    "LoginGraceTime": ["10"],
    "MaxStartups": ["4:50:10"],
    "PerSourceMaxStartups": ["2"],
    "MaxAuthTries": ["2"],
}


def test_sshd_holds_the_contracts_settings_once_each() -> None:
    for name, value in {**SSHD_CONTRACT, **SSHD_CLOSED, **SSHD_LIMITS}.items():
        assert setting(SSHD, name) == [value], name


def test_sshd_includes_no_other_file_and_has_no_match_block() -> None:
    words = {w.lower() for w, _ in directives(SSHD)}
    assert "include" not in words and "match" not in words
    assert "forcecommand" not in words or setting(SSHD, "ForceCommand") == [
        ["/bin/false"]
    ]


# contracts/tunnel.md §3: the client's five forwards, with the laptop's health block on edge:8088 (8087 is spec 002's
# site on edge; the tunnel end's public 8087 still leads to 2203).
REMOTE = [
    ["0.0.0.0:2201", "edge:8085"],
    ["0.0.0.0:2202", "edge:8086"],
    ["0.0.0.0:2203", "edge:8088"],
]
LOCAL = [
    ["0.0.0.0:5432", "shared-state:5432"],
    ["0.0.0.0:2301", "snapshot-sink:8080"],
]
CLIENT_SETTINGS = {
    "User": ["tunnel"],
    "Port": ["2222"],
    "HostKeyAlias": ["h4-tunnel-end"],
    "UserKnownHostsFile": ["/run/tunnel-client/known_hosts"],
    "GlobalKnownHostsFile": ["/dev/null"],
    "IdentityFile": ["/run/tunnel-client/id_ed25519"],
    "IdentitiesOnly": ["yes"],
    "StrictHostKeyChecking": ["yes"],
    "UpdateHostKeys": ["no"],
    "BatchMode": ["yes"],
    "ServerAliveInterval": ["10"],
    "ServerAliveCountMax": ["3"],
    "ExitOnForwardFailure": ["yes"],
    "SessionType": ["none"],
    "RequestTTY": ["no"],
    "ForwardAgent": ["no"],
    "ForwardX11": ["no"],
    "GatewayPorts": ["yes"],
}


def test_the_client_holds_the_five_forwards_and_nothing_more() -> None:
    assert setting(CLIENT, "RemoteForward") == REMOTE
    assert setting(CLIENT, "LocalForward") == LOCAL
    assert setting(CLIENT, "DynamicForward") == []
    for name, value in CLIENT_SETTINGS.items():
        assert setting(CLIENT, name) == [value], name


def test_the_client_pins_the_host_key_and_never_learns_one() -> None:
    assert setting(CLIENT, "StrictHostKeyChecking") == [["yes"]]
    assert setting(CLIENT, "UpdateHostKeys") == [["no"]]
    assert setting(CLIENT, "HostKeyAlgorithms") == [["ssh-ed25519"]]
    assert setting(SSHD, "HostKeyAlgorithms") == [["ssh-ed25519"]]


def test_the_entrypoint_reconnects_with_the_contracts_backoff() -> None:
    text = ENTRYPOINT.read_text(encoding="utf-8")
    assert re.search(r"^BACKOFF=\(1 2 5 10 30\)$", text, re.MULTILINE)
    assert "/usr/sbin/sshd -D -e -f /etc/ssh/h4/sshd_config" in text
    assert '-F "$config"' in text and "client) client /etc/ssh/h4/ssh_config ;;" in text


# Spec 001 group 6 (tasks.md T071; contracts/shared-state.md §7): the admin-only stack's tunnel, the client's own
# connection and pinned host key with the shared state's -L 5432 alone, and no reverse forward.
ADMIN = HERE / "ssh_config_admin"


def test_the_admin_only_tunnel_holds_the_shared_states_forward_alone() -> None:
    assert setting(ADMIN, "LocalForward") == [["0.0.0.0:5432", "shared-state:5432"]]
    assert (
        setting(ADMIN, "RemoteForward") == [] and setting(ADMIN, "DynamicForward") == []
    )
    for name, value in CLIENT_SETTINGS.items():
        assert setting(ADMIN, name) == [value], name
    text = ENTRYPOINT.read_text(encoding="utf-8")
    assert "admin) client /etc/ssh/h4/ssh_config_admin ;;" in text
    assert "ssh_config_admin" in (HERE / "Dockerfile").read_text(encoding="utf-8")


def test_both_ends_emit_up_and_reconnects() -> None:
    # plan.md §11: h4.tunnel.up and h4.tunnel.reconnects, from both ends, labelled with the end.
    text = ENTRYPOINT.read_text(encoding="utf-8")
    assert '"h4.tunnel.up"' in text and '"h4.tunnel.reconnects"' in text
    assert '"h4.tunnel.end"' in text
    assert re.search(r"end=laptop\b", text) and re.search(r"end=tunnel-end\b", text)


def lock_base(service: str) -> str:
    for line in LOCK.read_text(encoding="utf-8").splitlines():
        fields = line.split()
        if fields and fields[0] == service:
            return f"{fields[1]}:{fields[2]}@{fields[3]}"
    raise AssertionError(f"no {service} line in images.lock")


def test_the_image_is_the_pinned_base_one_user_and_no_host_key() -> None:
    text = DOCKERFILE.read_text(encoding="utf-8")
    froms = re.findall(r"^FROM (\S+)", text, re.MULTILINE)
    assert froms == [lock_base("base:ubuntu")]
    assert "useradd --uid 10001" in text
    assert "rm -f /etc/ssh/ssh_host_" in text
    assert re.search(r"^USER tunnel$", text, re.MULTILINE)
    assert "openssh-server" in text and "openssh-client" in text


# ----------------------------------------------------------------------------------------------------------------------
# The one build failure that skips (group 5's review, I2): the agents' engine's egress proxy doesn't reach Ubuntu's
# archive, so apt can't resolve it and finds no package. Any other failure of the build fails these checks.

# The build's own lines on the agents' engine, 2026-11-12 (`docker build --progress=plain deploy/tunnel`), shortened.
ARCHIVE_UNREACHABLE = """\
#6 4.830 W: Failed to fetch http://archive.ubuntu.com/ubuntu/dists/noble/InRelease  Temporary failure resolving 'archive.ubuntu.com'
#6 4.830 W: Failed to fetch http://security.ubuntu.com/ubuntu/dists/noble-security/InRelease  Temporary failure resolving 'security.ubuntu.com'
#6 4.830 W: Some index files failed to download. They have been ignored, or old ones used instead.
#6 4.854 E: Unable to locate package openssh-server
#6 4.854 E: Unable to locate package openssh-client
#6 ERROR: process "/bin/sh -c apt-get update  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends openssh-server openssh-client" did not complete successfully: exit code: 100
ERROR: failed to build: failed to solve: process "/bin/sh -c apt-get update" did not complete successfully: exit code: 100
"""


def archive_unreachable(text: str) -> bool:
    """The build failed because apt couldn't resolve Ubuntu's archive, and for nothing else: every fetch it reports
    failed to resolve the archive, so neither package was found, and the RUN that installs them exited 100."""
    fetches = [line for line in text.splitlines() if "Failed to fetch" in line]
    return (
        bool(fetches)
        and all(
            re.search(
                r"Temporary failure resolving '(archive|security)\.ubuntu\.com'", f
            )
            for f in fetches
        )
        and "E: Unable to locate package openssh-server" in text
        and "E: Unable to locate package openssh-client" in text
        and "apt-get install" in text
        and "did not complete successfully: exit code: 100" in text
    )


def test_only_the_archive_out_of_reach_reads_as_the_engines_own_failure() -> None:
    assert archive_unreachable(ARCHIVE_UNREACHABLE)
    for other in (
        # the archive reached, and something else wrong with it
        ARCHIVE_UNREACHABLE.replace(
            "Temporary failure resolving 'archive.ubuntu.com'", "Hash Sum mismatch"
        ),
        # a package the archive doesn't have
        ARCHIVE_UNREACHABLE.replace(
            "Temporary failure resolving 'archive.ubuntu.com'", ""
        ).replace("Temporary failure resolving 'security.ubuntu.com'", ""),
        # another step failing
        'ERROR: failed to build: failed to solve: failed to compute cache key: "/sshd_config": not found\n',
        ARCHIVE_UNREACHABLE.replace("exit code: 100", "exit code: 1"),
        ARCHIVE_UNREACHABLE.replace("openssh-server", "openssh-sftp-server"),
        "",
    ):
        assert not archive_unreachable(other), other


# ----------------------------------------------------------------------------------------------------------------------
# The containers, on the agents' engine.


def docker(
    *args: str, stdin: bytes | None = None, timeout: float = 120
) -> subprocess.CompletedProcess:
    return subprocess.run(
        [str(RELAY), "docker", *args],
        input=stdin,
        capture_output=True,
        timeout=timeout,
        check=False,
    )


@pytest.fixture(scope="module")
def engine() -> None:
    if os.environ.get("SANDBOX_RUNTIME") != "1" or not RELAY.is_file():
        pytest.skip(
            "no agents' engine here: these checks run in an agent session, through its relay"
        )
    done = docker("version", "--format", "{{.Server.Version}}", timeout=60)
    if done.returncode != 0:
        pytest.skip(
            "the agents' engine isn't answering (deploy/agents-engine/docker-relay docker version)"
        )


# The image the Author builds on his engine and moves to the agents' engine (W1's note, "For the Author", group 5).
SEED = "h4reet-tunnel-seed:local"
# Each file the Dockerfile copies in, by its place in the image.
BAKED = {
    "/etc/ssh/h4/sshd_config": SSHD,
    "/etc/ssh/h4/ssh_config": CLIENT,
    "/etc/ssh/h4/ssh_config_admin": HERE / "ssh_config_admin",
    "/usr/local/bin/h4-tunnel": ENTRYPOINT,
}


def said(done: subprocess.CompletedProcess) -> str:
    """What a command said, without the relay's own socat lines."""
    text = (done.stdout or b"").decode(errors="replace") + (done.stderr or b"").decode(
        errors="replace"
    )
    return "\n".join(line for line in text.splitlines() if "socat[" not in line)


def seeded() -> bool:
    """The seed is on the engine and was built from this tree's folder: it holds the tree's files, and what the
    Dockerfile makes of the image shows in it, its pinned base's layers first, its user, its entrypoint, its SHELL, and
    the two packages its RUN installs, with the user's uid (group 5's fixes' review, nit 5)."""
    if docker("image", "inspect", "--format", "{{.Id}}", SEED).returncode != 0:
        return False
    layers = "{{json .RootFS.Layers}}"
    base = docker("image", "inspect", "--format", layers, lock_base("base:ubuntu"))
    mine = docker("image", "inspect", "--format", layers, SEED)
    config = docker(
        "image",
        "inspect",
        "--format",
        "{{json .Config.User}} {{json .Config.Entrypoint}} {{json .Config.Env}}",
        SEED,
    )
    if base.returncode != 0 or mine.returncode != 0 or config.returncode != 0:
        return False
    base_layers = json.loads(base.stdout)
    if json.loads(mine.stdout)[: len(base_layers)] != base_layers:
        return False
    user, entrypoint, env = config.stdout.decode().split(" ", 2)
    if (
        json.loads(user) != "tunnel"
        or json.loads(entrypoint) != ["/usr/local/bin/h4-tunnel"]
        or "SHELL=/bin/sh" not in json.loads(env)
    ):
        return False
    probe = docker(
        "run",
        "--rm",
        "--network",
        "none",
        "--entrypoint",
        "/bin/sh",
        SEED,
        "-c",
        "dpkg-query -W openssh-server openssh-client >/dev/null && id -u tunnel",
    )
    if probe.returncode != 0 or probe.stdout.strip() != str(UID).encode():
        return False
    for place, path in BAKED.items():
        done = docker(
            "run", "--rm", "--network", "none", "--entrypoint", "/bin/cat", SEED, place
        )
        if done.returncode != 0 or done.stdout != path.read_bytes():
            return False
    return True


@pytest.fixture(scope="module")
def image(engine: None) -> str:
    if seeded():
        yield SEED
        return
    tag = f"h4reet-tunnel-test:{secrets.token_hex(4)}"
    done = docker("build", "--progress=plain", "-t", tag, str(HERE), timeout=600)
    if done.returncode != 0:
        text = said(done)
        if archive_unreachable(text):
            pytest.skip(
                "the tunnel's image doesn't build on the agents' engine, whose egress proxy doesn't reach Ubuntu's "
                f"archive (apt: Temporary failure resolving 'archive.ubuntu.com'), and {SEED} isn't there with the "
                "tree's files: W1's note, For the Author, group 5, seeds it"
            )
        pytest.fail(
            "the tunnel's image doesn't build: " + " | ".join(text.splitlines()[-6:])
        )
    yield tag
    docker("image", "rm", "-f", tag)


def keypair(directory: Path, name: str) -> tuple[bytes, bytes]:
    keygen = shutil.which("ssh-keygen")
    if keygen is None:
        pytest.skip("no ssh-keygen here to make the test's keys")
    path = directory / name
    subprocess.run(
        [keygen, "-q", "-t", "ed25519", "-N", "", "-C", name, "-f", str(path)],
        check=True,
        capture_output=True,
    )
    return path.read_bytes(), (directory / f"{name}.pub").read_bytes()


def tar_of(files: dict[str, tuple[bytes, int]]) -> bytes:
    """A tar of files owned by the image's user, so sshd's StrictModes and the key checks pass as on the host."""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        for name, (data, mode) in files.items():
            info = tarfile.TarInfo(name)
            info.size, info.mode, info.uid, info.gid = len(data), mode, UID, UID
            tar.addfile(info, io.BytesIO(data))
    return buf.getvalue()


# A stand-in that answers each connection with its own name and port, then closes.
STANDIN = (
    "import socket,sys,threading\n"
    "def serve(p):\n"
    " s=socket.socket();s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);s.bind(('0.0.0.0',p));s.listen(8)\n"
    " while True:\n"
    "  c,_=s.accept();c.sendall(('%s:%d\\n'%(sys.argv[1],p)).encode());c.close()\n"
    "for p in sys.argv[2:]:threading.Thread(target=serve,args=(int(p),),daemon=True).start()\n"
    "threading.Event().wait()\n"
)
PROBE = (
    "import socket,sys\n"
    "s=socket.create_connection((sys.argv[1],int(sys.argv[2])),5);print(s.recv(64).decode().strip())\n"
)


@pytest.fixture(scope="module")
def tunnel(image: str, tmp_path_factory: pytest.TempPathFactory) -> dict:
    tmp = tmp_path_factory.mktemp("tunnel")
    run = secrets.token_hex(3)
    net = f"h4-tunnel-test-{run}"
    python = lock_base("base:python")
    client_key, client_pub = keypair(tmp, "client")
    host_key, host_pub = keypair(tmp, "host")
    _, other_pub = keypair(tmp, "other")
    known = b"h4-tunnel-end " + b" ".join(host_pub.split()[:2]) + b"\n"
    wrong = b"h4-tunnel-end " + b" ".join(other_pub.split()[:2]) + b"\n"
    made: list[str] = []
    assert docker("network", "create", "--internal", net).returncode == 0
    try:
        for name, alias, ports in (
            ("edge", "edge", ["8085", "8086", "8088"]),
            ("store", "shared-state", ["5432", "5433"]),
            ("sink", "snapshot-sink", ["8080"]),
            ("langfuse", "langfuse-web", ["3000"]),
        ):
            ctr = f"{net}-{name}"
            done = docker(
                "run",
                "-d",
                "--name",
                ctr,
                "--network",
                net,
                "--network-alias",
                alias,
                "--read-only",
                "--cap-drop",
                "ALL",
                "--security-opt",
                "no-new-privileges:true",
                python,
                "python3",
                "-c",
                STANDIN,
                alias,
                *ports,
            )
            assert done.returncode == 0, done.stderr
            made.append(ctr)
        common = [
            "--network",
            net,
            "--read-only",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges:true",
            "--tmpfs",
            f"/run:uid={UID},gid={UID},mode=0700",
        ]
        server = f"{net}-tunnel-end"
        assert (
            docker(
                "create",
                "--name",
                server,
                "--network-alias",
                "tunnel-end",
                "--mount",
                "type=volume,dst=/run/keys",
                *common,
                image,
                "server",
            ).returncode
            == 0
        )
        made.append(server)
        keys = tar_of(
            {
                "ssh_host_ed25519_key": (host_key, 0o600),
                "authorized_keys": (client_pub, 0o600),
            }
        )
        assert (
            docker("cp", "-a", "-", f"{server}:/run/keys", stdin=keys).returncode == 0
        )
        assert docker("start", server).returncode == 0

        def client_with(name: str, known_hosts: bytes, *extra: str) -> str:
            ctr = f"{net}-{name}"
            done = docker(
                "create",
                "--name",
                ctr,
                "--network-alias",
                name,
                "--mount",
                "type=volume,dst=/run/tunnel-client",
                "-e",
                "TUNNEL_END_ADDRESS=tunnel-end",
                *common,
                *extra,
            )
            assert done.returncode == 0, done.stderr
            made.append(ctr)
            files = tar_of(
                {"id_ed25519": (client_key, 0o600), "known_hosts": (known_hosts, 0o644)}
            )
            assert (
                docker(
                    "cp", "-a", "-", f"{ctr}:/run/tunnel-client", stdin=files
                ).returncode
                == 0
            )
            return ctr

        client = client_with("tunnel", known, image, "client")
        assert docker("start", client).returncode == 0
        yield {
            "net": net,
            "python": python,
            "image": image,
            "client_with": client_with,
            "known": known,
            "wrong": wrong,
            "client": client,
            "server": server,
        }
    finally:
        for ctr in made:
            docker("rm", "-f", "-v", ctr)
        docker("network", "rm", net)


def probe(t: dict, host: str, port: int) -> str:
    done = docker(
        "run",
        "--rm",
        "--network",
        t["net"],
        "--read-only",
        "--cap-drop",
        "ALL",
        t["python"],
        "python3",
        "-c",
        PROBE,
        host,
        str(port),
        timeout=30,
    )
    return done.stdout.decode().strip() if done.returncode == 0 else ""


def wait_for(t: dict, host: str, port: int, want: str, seconds: float = 30) -> str:
    end = time.monotonic() + seconds
    got = ""
    while time.monotonic() < end:
        got = probe(t, host, port)
        if got == want:
            break
        time.sleep(1)
    return got


def one_shot(t: dict, known_hosts: bytes, *args: str) -> subprocess.CompletedProcess:
    """A second client of the same key, run once with its own arguments, as an intruder holding the key would."""
    ctr = t["client_with"](
        f"probe-{secrets.token_hex(3)}",
        known_hosts,
        "--entrypoint",
        "ssh",
        t["image"],
        "-F",
        "/etc/ssh/h4/ssh_config",
        "-o",
        "ConnectTimeout=5",
        *args,
        "tunnel-end",
    )
    docker("start", "-a", ctr, timeout=60)
    return docker("wait", ctr, timeout=60)


def exit_code(done: subprocess.CompletedProcess) -> int:
    return int(done.stdout.decode().strip() or "255")


def test_the_three_reverse_forwards_reach_the_laptops_edge(tunnel: dict) -> None:
    for port, want in ((2201, "edge:8085"), (2202, "edge:8086"), (2203, "edge:8088")):
        assert wait_for(tunnel, "tunnel-end", port, want) == want


def test_the_two_local_forwards_reach_the_store_and_the_sink(tunnel: dict) -> None:
    assert wait_for(tunnel, "tunnel", 5432, "shared-state:5432") == "shared-state:5432"
    assert (
        wait_for(tunnel, "tunnel", 2301, "snapshot-sink:8080") == "snapshot-sink:8080"
    )


def test_no_other_port_may_be_listened_on(tunnel: dict) -> None:
    done = one_shot(
        tunnel,
        tunnel["known"],
        "-o",
        "ClearAllForwardings=yes",
        "-R",
        "0.0.0.0:2204:edge:8085",
        "-N",
    )
    assert exit_code(done) != 0
    assert probe(tunnel, "tunnel-end", 2204) == ""


def test_nothing_but_the_store_and_the_sink_may_be_opened(tunnel: dict) -> None:
    for target in (
        "langfuse-web:3000",
        "shared-state:5433",
        "edge:8085",
        "snapshot-sink:5432",
    ):
        done = one_shot(
            tunnel, tunnel["known"], "-o", "ClearAllForwardings=yes", "-W", target
        )
        assert exit_code(done) != 0, target


def test_no_shell_or_command_opens(tunnel: dict) -> None:
    for args in (("-o", "SessionType=default", "-o", "ClearAllForwardings=yes", "-T"),):
        done = one_shot(tunnel, tunnel["known"], *args)
        assert exit_code(done) != 0
    done = one_shot(
        tunnel,
        tunnel["known"],
        "-o",
        "SessionType=default",
        "-o",
        "ClearAllForwardings=yes",
    )
    assert exit_code(done) != 0


def test_a_wrong_host_key_is_refused(tunnel: dict) -> None:
    done = one_shot(
        tunnel,
        tunnel["wrong"],
        "-o",
        "ClearAllForwardings=yes",
        "-W",
        "shared-state:5432",
    )
    assert exit_code(done) != 0


def test_the_forward_to_the_store_reaches_only_the_store(tunnel: dict) -> None:
    # The laptop's -L 5432 reaches the store, and the store's own other port stays closed through the tunnel.
    assert wait_for(tunnel, "tunnel", 5432, "shared-state:5432") == "shared-state:5432"
    done = one_shot(
        tunnel,
        tunnel["known"],
        "-o",
        "ClearAllForwardings=yes",
        "-W",
        "shared-state:5433",
    )
    assert exit_code(done) != 0
