"""Tests for deploy/scripts/pin_images.py, on recorded `docker buildx imagetools inspect` output and a fake registry."""

from __future__ import annotations

import importlib.util
import io
import json
import shutil
import subprocess
import sys
import urllib.error
from email.message import Message
from pathlib import Path
from typing import Self

import pytest

REPO = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "pin_images", REPO / "deploy" / "scripts" / "pin_images.py"
)
assert SPEC and SPEC.loader
pi = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = pi  # dataclasses look their module up here
SPEC.loader.exec_module(pi)

# Recorded on 2026-10-08 from the agent sandbox (ghcr.io is on its allowlist), trimmed after two manifests. The
# index digest is the one check 2 pinned (research.md R-02). The blank-looking lines hold spaces, as recorded.
RECORDED_EDGE = """\
Name:      ghcr.io/nginx/nginx-unprivileged:1.30.5-alpine
MediaType: application/vnd.oci.image.index.v1+json
Digest:    sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3
           \n\
Manifests: \n\
  Name:        ghcr.io/nginx/nginx-unprivileged:1.30.5-alpine@sha256:4483b2e4c12fe77211e051cd0546ee79770d5174535c961b04ac918ebb75b469
  MediaType:   application/vnd.oci.image.manifest.v1+json
  Platform:    linux/amd64
               \n\
  Name:        ghcr.io/nginx/nginx-unprivileged:1.30.5-alpine@sha256:f4b79de8037939f63df50d079c09669949251dd6db8b860c0735fb60af951b34
  MediaType:   application/vnd.oci.image.manifest.v1+json
  Platform:    linux/arm/v6
"""
TODAY = "2026-10-09"


def digest(char: str) -> str:
    return "sha256:" + char * 64


def inspect_output(ref: str, index_digest: str) -> str:
    """The recorded output's shape, for another image."""
    return RECORDED_EDGE.replace(
        "ghcr.io/nginx/nginx-unprivileged:1.30.5-alpine", ref
    ).replace(
        "sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3",
        index_digest,
    )


class FakeDocker:
    """`docker buildx imagetools inspect <ref>`: each ref's digest, or a failure."""

    def __init__(
        self, digests: dict[str, str], failures: dict[str, str] | None = None
    ) -> None:
        self.digests, self.failures, self.calls = digests, failures or {}, []

    def __call__(
        self, command: list[str], **kwargs: object
    ) -> subprocess.CompletedProcess:
        assert command[:4] == ["docker", "buildx", "imagetools", "inspect"]
        ref = command[4]
        self.calls.append(ref)
        if ref in self.failures:
            return subprocess.CompletedProcess(command, 1, "", self.failures[ref])
        if (
            ref == "ghcr.io/nginx/nginx-unprivileged:1.30.5-alpine"
            and ref not in self.digests
        ):
            return subprocess.CompletedProcess(command, 0, RECORDED_EDGE, "")
        return subprocess.CompletedProcess(
            command, 0, inspect_output(ref, self.digests[ref]), ""
        )


class Response(io.BytesIO):
    def __init__(self, body: object, link: str = "") -> None:
        super().__init__(json.dumps(body).encode())
        self.headers = Message()
        if link:
            self.headers["Link"] = link

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()


class FakeRegistry:
    """Docker Hub's anonymous flow: 401 with a Bearer challenge, a token, then paginated tag lists."""

    def __init__(self, pages: list[list[str]]) -> None:
        self.pages, self.requests = pages, []

    def __call__(self, request, timeout: float) -> Response:
        url = request.full_url
        self.requests.append((url, request.get_header("Authorization")))
        if url.startswith("https://auth.docker.io/token"):
            return Response({"token": "anonymous-pull-token"})
        if request.get_header("Authorization") != "Bearer anonymous-pull-token":
            headers = Message()
            headers["WWW-Authenticate"] = (
                'Bearer realm="https://auth.docker.io/token",service="registry.docker.io",'
                'scope="repository:chrislusf/seaweedfs:pull"'
            )
            raise urllib.error.HTTPError(
                url, 401, "Unauthorized", headers, io.BytesIO()
            )
        page = 0 if "last=" not in url else int(url.rsplit("page", 1)[1])
        link = (
            f'</v2/chrislusf/seaweedfs/tags/list?n=1000&last=page{page + 1}>; rel="next"'
            if page + 1 < len(self.pages)
            else ""
        )
        return Response({"name": "chrislusf/seaweedfs", "tags": self.pages[page]}, link)


@pytest.fixture
def root(tmp_path: Path) -> Path:
    for rel in (pi.LOCK, pi.COMPOSE, ".devcontainer/Dockerfile"):
        (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(REPO / rel, tmp_path / rel)
    return tmp_path


def current(root: Path) -> dict[str, pi.Entry]:
    return {e.service: e for e in pi.read_lock(root / pi.LOCK)[1]}


def same_digests(root: Path) -> dict[str, str]:
    return {
        f"{e.repository}:{e.tag}": e.digest
        for e in current(root).values()
        if e.digest != "-"
    }


# ---------------------------------------------------------------------------------------------------------------


def test_the_recorded_output_gives_the_index_digest() -> None:
    assert (
        pi.parse_inspect(RECORDED_EDGE)
        == "sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3"
    )
    with pytest.raises(pi.PinError):
        pi.parse_inspect("Name: x\nManifests:\n  Digest: " + digest("a") + "\n")


def test_newest_release() -> None:
    tags = [
        "latest",
        "3.97",
        "3.97_large_disk",
        "3.100",
        "4.0",
        "dev",
        "v4.1.2",
        "4.01",
        "nightly",
    ]
    assert pi.newest_release(tags) == "v4.1.2"
    assert pi.newest_release(["3.9", "3.10"]) == "3.10"
    assert pi.newest_release(["latest", "dev", "3.97_full"]) is None


def test_tags_come_from_the_registry_with_an_anonymous_token() -> None:
    registry = FakeRegistry([["latest", "3.96"], ["3.97", "3.97_large_disk"]])
    assert pi.list_tags("docker.io/chrislusf/seaweedfs", registry) == [
        "latest",
        "3.96",
        "3.97",
        "3.97_large_disk",
    ]
    urls = [url for url, _ in registry.requests]
    assert (
        urls[0]
        == "https://registry-1.docker.io/v2/chrislusf/seaweedfs/tags/list?n=1000"
    )
    assert urls[1] == (
        "https://auth.docker.io/token?service=registry.docker.io&scope=repository%3Achrislusf%2Fseaweedfs%3Apull"
    )
    assert registry.requests[2] == (urls[0], "Bearer anonymous-pull-token")
    assert urls[3].endswith("last=page1")


def test_the_token_realm_must_be_https() -> None:
    with pytest.raises(pi.PinError):
        pi.anonymous_token(
            'Bearer realm="http://evil.invalid/token",service="x"', FakeRegistry([[]])
        )


def test_the_committed_lock_is_in_its_canonical_form() -> None:
    header, entries = pi.read_lock(REPO / pi.LOCK)
    assert pi.render_lock(header, entries) == (REPO / pi.LOCK).read_text(
        encoding="utf-8"
    )
    assert [e.service for e in entries if e.digest == "-"] == ["seaweedfs"]


def test_rewrite_compose_changes_only_the_pinned_image_lines() -> None:
    text = (REPO / pi.COMPOSE).read_text(encoding="utf-8")
    lock = current(REPO)
    new_ref = f"{lock['edge'].repository}:{lock['edge'].tag}@{digest('e')}"
    pins = {
        "edge": new_ref,
        "gateway-state": lock["gateway-state"].ref,
        "seaweedfs": "x",
    }
    rewritten, changes = pi.rewrite_compose(text, pins)
    assert changes == {"edge": (lock["edge"].ref, new_ref)}
    before, after = text.splitlines(), rewritten.splitlines()
    assert [(a, b) for a, b in zip(before, after, strict=True) if a != b] == [
        (f"    image: {lock['edge'].ref}", f"    image: {new_ref}")
    ]


def test_pinning_updates_the_lock_and_compose_together(
    root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    digests = same_digests(root)
    digests["ghcr.io/nginx/nginx-unprivileged:1.30.5-alpine"] = digest("e")
    digests["public.ecr.aws/docker/library/node:24.21.0-trixie-slim"] = digest("f")
    digests["docker.io/chrislusf/seaweedfs:3.97"] = digest("5")
    docker = FakeDocker(digests)
    registry = FakeRegistry([["latest", "3.96", "3.97", "3.97_full"]])
    assert pi.pin(root, None, {}, False, docker, registry, TODAY) == 0
    out = capsys.readouterr().out
    lock = current(root)
    assert lock["edge"].digest == digest("e") and lock["edge"].checked == TODAY
    assert (
        lock["seaweedfs"].tag,
        lock["seaweedfs"].digest,
        lock["seaweedfs"].checked,
    ) == ("3.97", digest("5"), TODAY)
    assert lock["gateway-state"].digest == current(REPO)["gateway-state"].digest
    compose = (root / pi.COMPOSE).read_text(encoding="utf-8")
    assert f"image: {lock['edge'].ref}" in compose
    assert f"image: {lock['gateway-state'].ref}" in compose
    assert "edge" in out and "updated" in out and "pinned" in out and "same" in out
    assert "update FROM by hand (base:node" in out and ".devcontainer/Dockerfile" in out
    # A second run with nothing new changes nothing.
    before = (root / pi.LOCK).read_text(encoding="utf-8"), compose
    assert (
        pi.pin(root, None, {}, False, FakeDocker(same_digests(root)), registry, TODAY)
        == 0
    )
    assert (
        (root / pi.LOCK).read_text(encoding="utf-8"),
        (root / pi.COMPOSE).read_text(encoding="utf-8"),
    ) == before


def test_a_failure_writes_nothing_and_names_a_rate_limit(
    root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    before = (
        (root / pi.LOCK).read_text(encoding="utf-8"),
        (root / pi.COMPOSE).read_text(encoding="utf-8"),
    )
    digests = same_digests(root)
    digests["ghcr.io/nginx/nginx-unprivileged:1.30.5-alpine"] = digest("e")
    failures = {
        "docker.io/grafana/loki:3.7.8": "ERROR: toomanyrequests: You have reached your pull rate limit"
    }
    code = pi.pin(
        root,
        None,
        {"seaweedfs": "3.97"},
        False,
        FakeDocker(
            {**digests, "docker.io/chrislusf/seaweedfs:3.97": digest("5")}, failures
        ),
        FakeRegistry([[]]),
        TODAY,
    )
    assert code == 1
    err = capsys.readouterr().err
    assert (
        "loki: docker.io/grafana/loki:3.7.8: HTTP 429" in err and "wrote nothing" in err
    )
    assert (
        (root / pi.LOCK).read_text(encoding="utf-8"),
        (root / pi.COMPOSE).read_text(encoding="utf-8"),
    ) == before


def test_no_release_tag_stops_for_the_author(
    root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code = pi.pin(
        root,
        {"seaweedfs"},
        {},
        False,
        FakeDocker({}),
        FakeRegistry([["latest", "dev", "full"]]),
        TODAY,
    )
    assert code == 1
    err = capsys.readouterr().err
    assert (
        "no release tag" in err
        and "TAG=seaweedfs=<tag>" in err
        and "dev, full, latest" in err
    )


def test_only_dry_run_and_an_explicit_tag(
    root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    before = (root / pi.LOCK).read_text(encoding="utf-8")
    docker = FakeDocker({"docker.io/chrislusf/seaweedfs:4.01": digest("6")})
    assert (
        pi.pin(
            root,
            {"seaweedfs"},
            {"seaweedfs": "4.01"},
            True,
            docker,
            FakeRegistry([[]]),
            TODAY,
        )
        == 0
    )
    assert docker.calls == ["docker.io/chrislusf/seaweedfs:4.01"]
    assert "dry run" in capsys.readouterr().out
    assert (root / pi.LOCK).read_text(encoding="utf-8") == before


def test_unknown_services_and_the_sandbox_are_refused(
    root: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    assert (
        pi.pin(root, {"nope"}, {}, True, FakeDocker({}), FakeRegistry([[]]), TODAY) == 2
    )
    monkeypatch.setenv("SANDBOX_RUNTIME", "1")
    assert pi.main(["--root", str(root), "--dry-run"]) == 2
    assert "Author's terminal" in capsys.readouterr().err
    monkeypatch.delenv("SANDBOX_RUNTIME")
    assert pi.main(["--root", str(root), "--tag", "seaweedfs"]) == 2


def test_atomic_write_never_writes_through_a_planted_link(tmp_path: Path) -> None:
    # deploy/ is agent-writable, so a link at the predictable temp name could point at the Author's env file.
    deploy = tmp_path / "deploy"
    deploy.mkdir()
    target = tmp_path / "prod.env"
    target.write_text("KEEP=1\n", encoding="utf-8")
    (deploy / ".images.lock.pin-images").symlink_to(target)
    pi.atomic_write(deploy / "images.lock", "pinned\n")
    assert target.read_text(encoding="utf-8") == "KEEP=1\n"
    assert (deploy / "images.lock").read_text(encoding="utf-8") == "pinned\n"
    assert not (deploy / ".images.lock.pin-images").exists()
