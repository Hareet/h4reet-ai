"""edge's hosts' blocks under nginx itself (spec 001 tasks.md T042, T048; contracts/tunnel.md §4; group 5's review, I2
and its nit on the token maps), on the agents' engine, with the pinned nginx image compose runs for edge.

  - `nginx -t` passes on deploy/edge/nginx.conf with the token maps edge's entrypoint writes: with both tokens, at
    the shortest and the longest shape the entrypoint takes, and with neither (dev and dev-cpu);
  - a running edge matches a block's token exactly, case and all: the token passes the 401, the same token in
    another case, or with another scheme's case, doesn't.

The files go into the container by `docker cp`, so nothing binds the session's tree. The image must be seeded on the
engine (deploy/agents-engine/engine.sh seed, the Author's), as every pinned image is; where it isn't, or where no
engine answers, these checks skip, saying which. Tokens are made at run time.
"""

from __future__ import annotations

import io
import os
import re
import secrets
import string
import subprocess
import tarfile
import time
from pathlib import Path

import pytest
import yaml

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
RELAY = REPO / "deploy" / "agents-engine" / "docker-relay"
COMPOSE = REPO / "deploy" / "compose.yaml"
TOKEN_CHARS = string.ascii_letters + string.digits + "_-"


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


def said(done: subprocess.CompletedProcess) -> str:
    """What the command said, without the relay's own socat lines."""
    text = (done.stdout or b"").decode(errors="replace") + (done.stderr or b"").decode(
        errors="replace"
    )
    return "\n".join(line for line in text.splitlines() if "socat[" not in line)


def edge_image() -> str:
    return yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))["services"]["edge"][
        "image"
    ]


@pytest.fixture(scope="module")
def image() -> str:
    if os.environ.get("SANDBOX_RUNTIME") != "1" or not RELAY.is_file():
        pytest.skip(
            "no agents' engine here: these checks run in an agent session, through its relay"
        )
    done = docker("version", "--format", "{{.Server.Version}}", timeout=60)
    if done.returncode != 0:
        pytest.skip(
            "the agents' engine isn't answering (deploy/agents-engine/docker-relay docker version)"
        )
    ref = edge_image()
    if docker("image", "inspect", "--format", "{{.Id}}", ref).returncode != 0:
        pytest.skip(
            f"edge's pinned image isn't seeded on the agents' engine: {ref} (engine.sh seed, the Author's)"
        )
    return ref


def tar_of(files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        for name, data in files.items():
            info = tarfile.TarInfo(name)
            info.size, info.mode = len(data), 0o644
            tar.addfile(info, io.BytesIO(data))
    return buf.getvalue()


def edge(image: str, command: list[str], **env: str) -> str:
    """A container of edge's image with the tree's nginx.conf and entrypoint, created, not started; its name."""
    name = f"h4-edge-test-{secrets.token_hex(4)}"
    flags = [f"--env={k}={v}" for k, v in env.items()]
    done = docker(
        "create",
        "--name",
        name,
        "--network",
        "none",
        "--entrypoint",
        "/bin/sh",
        *flags,
        image,
        "/etc/nginx/h4-entrypoint.sh",
        *command,
    )
    assert done.returncode == 0, said(done)
    files = {
        "nginx.conf": (HERE / "nginx.conf").read_bytes(),
        "h4-entrypoint.sh": (HERE / "entrypoint.sh").read_bytes(),
    }
    done = docker("cp", "-", f"{name}:/etc/nginx/", stdin=tar_of(files))
    assert done.returncode == 0, said(done)
    return name


def token(length: int) -> str:
    return "".join(secrets.choice(TOKEN_CHARS) for _ in range(length))


@pytest.mark.parametrize(
    "tokens",
    [
        {"RELAY_TOKEN_SELF": 32, "TELEMETRY_BLOCK_TOKEN": 32},
        {"RELAY_TOKEN_SELF": 128, "TELEMETRY_BLOCK_TOKEN": 128},
        {},
    ],
    ids=["shortest", "longest", "none"],
)
def test_nginx_takes_the_conf_with_the_entrypoints_maps(
    image: str, tokens: dict[str, int]
) -> None:
    name = edge(image, ["nginx", "-t"], **{k: token(n) for k, n in tokens.items()})
    try:
        done = docker("start", "--attach", name, timeout=120)
        text = said(done)
        assert done.returncode == 0, text
        assert "syntax is ok" in text and "test is successful" in text, text
    finally:
        docker("rm", "-f", name)


def status(name: str, authorization: str) -> int:
    done = docker(
        "exec",
        name,
        "wget",
        "-S",
        "-q",
        "-O",
        "/dev/null",
        "--post-data",
        "{}",
        "--header",
        f"Authorization: {authorization}",
        "http://127.0.0.1:8086/v1/traces",
    )
    codes = re.findall(r"HTTP/1\.[01] (\d{3})", said(done))
    assert codes, said(done)
    return int(codes[-1])


def test_a_blocks_token_matches_exactly_case_and_all(image: str) -> None:
    telemetry = token(48)
    while telemetry.swapcase() == telemetry:
        telemetry = token(48)
    name = edge(image, ["nginx", "-g", "daemon off;"], TELEMETRY_BLOCK_TOKEN=telemetry)
    try:
        assert docker("start", name).returncode == 0
        for _ in range(50):
            ready = docker(
                "exec",
                name,
                "wget",
                "-q",
                "-O",
                "/dev/null",
                "http://127.0.0.1:8090/ping",
            )
            if ready.returncode == 0:
                break
            time.sleep(0.2)
        assert ready.returncode == 0, said(docker("logs", name))
        # The token passes the 401: with no network the collector can't be reached, so nginx answers 502 or 504. (A
        # trailing blank isn't another token: HTTP trims it from the header's value before nginx reads it.)
        assert status(name, f"Bearer {telemetry}") in (502, 504)
        for other in (
            f"Bearer {telemetry.swapcase()}",
            f"bearer {telemetry}",
            f"BEARER {telemetry}",
            f"Bearer {telemetry[:-1]}",
            "Bearer",
        ):
            assert status(name, other) == 401, other
    finally:
        docker("rm", "-f", name)
