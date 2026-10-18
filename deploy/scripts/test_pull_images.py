"""Tests for deploy/scripts/pull_images.py: digests only, Docker Hub's 429 backoff, and nothing pulled twice."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

REPO = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "pull_images", REPO / "deploy" / "scripts" / "pull_images.py"
)
assert SPEC and SPEC.loader
pull = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = pull
SPEC.loader.exec_module(pull)

RAW = yaml.safe_load((REPO / "deploy/compose.yaml").read_text(encoding="utf-8"))
LOCK = {
    ln.split()[0]: ln.split()
    for ln in (REPO / "deploy/images.lock").read_text().splitlines()
    if ln and not ln.startswith("#")
}
HUB = "docker.io/grafana/loki:3.7.8@" + LOCK["loki"][3]


def ref(service: str) -> str:
    return f"{LOCK[service][1]}:{LOCK[service][2]}@{LOCK[service][3]}"


class FakeDocker:
    def __init__(
        self,
        services: dict,
        present: set[str],
        answers: dict[str, list[tuple[int, str]]],
    ) -> None:
        self.services, self.present, self.answers, self.calls = (
            services,
            present,
            answers,
            [],
        )

    def __call__(self, *args: str) -> subprocess.CompletedProcess:
        self.calls.append(args)
        if args[0] == "compose":
            return subprocess.CompletedProcess(
                args, 0, json.dumps({"services": self.services}), ""
            )
        if args[:2] == ("image", "inspect"):
            return subprocess.CompletedProcess(
                args, 0 if args[-1] in self.present else 1, "", ""
            )
        if args[0] == "pull":
            code, err = self.answers.get(args[-1], [(0, "")]).pop(0)
            if code == 0:
                self.present.add(args[-1])
            return subprocess.CompletedProcess(args, code, "", err)
        raise AssertionError(args)


@pytest.fixture(autouse=True)
def outside_the_sandbox(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SANDBOX_RUNTIME", raising=False)


def run(fake: FakeDocker, sleeps: list[float]) -> int:
    return pull.main(
        ["--stack", "dev", "--env-file", "/dev/null", "--root", str(REPO)],
        fake,
        sleeps.append,
    )


def test_it_pulls_the_compose_images_and_bases_by_digest_once(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # The real compose file's services, every profile's, but an image whose pin is still open (refused below).
    services = {
        name: service
        for name, service in RAW["services"].items()
        if "build" in service or "@sha256:" in service.get("image", "")
    }
    fake = FakeDocker(services, {ref("edge")}, {})
    assert run(fake, []) == 0
    pulled = [c[-1] for c in fake.calls if c[0] == "pull"]
    # By service name, each image once: langfuse-db and gateway-state share theirs.
    images = list(
        dict.fromkeys(
            s["image"]
            for _, s in sorted(services.items())
            if "image" in s and s["image"] != ref("edge")
        )
    )
    # edge is present; gateway is built; both model servers come, whatever the stack's own profile.
    assert pulled == [*images, ref("base:node"), ref("base:python")]
    assert ref("model-server-gpu") in pulled and ref("model-server-cpu") in pulled
    assert len(pulled) == len(set(pulled))
    assert all("@sha256:" in r for r in pulled)
    out = capsys.readouterr().out
    total = len(images) + 3
    assert (
        f"present  {ref('edge')}" in out
        and f"pull: {total} of {total} images present" in out
    )


def test_docker_hub_429_backs_off_5_15_45_and_then_names_it(
    capsys: pytest.CaptureFixture[str],
) -> None:
    services = {"loki": {"image": HUB}}
    limited = (
        1,
        "Error response from daemon: toomanyrequests: You have reached your unauthenticated pull rate limit",
    )
    sleeps: list[float] = []
    fake = FakeDocker(
        services,
        {ref("base:node"), ref("base:python")},
        {HUB: [limited, limited, (0, "")]},
    )
    assert run(fake, sleeps) == 0 and sleeps == [5, 15]
    fake = FakeDocker(
        services, {ref("base:node"), ref("base:python")}, {HUB: [limited] * 4}
    )
    sleeps = []
    assert run(fake, sleeps) == 1 and sleeps == [5, 15, 45]
    err = capsys.readouterr().err
    assert "HTTP 429, Docker Hub's anonymous rate limit, after 5, 15, and 45 s" in err


def test_other_registries_and_other_errors_fail_at_once(
    capsys: pytest.CaptureFixture[str],
) -> None:
    services = {"edge": {"image": ref("edge")}}
    fake = FakeDocker(
        services,
        {ref("base:node"), ref("base:python")},
        {ref("edge"): [(1, "manifest unknown")]},
    )
    sleeps: list[float] = []
    assert run(fake, sleeps) == 1 and sleeps == []
    assert "manifest unknown" in capsys.readouterr().err


def test_an_unpinned_image_is_refused(capsys: pytest.CaptureFixture[str]) -> None:
    fake = FakeDocker(
        {"seaweedfs": {"image": "docker.io/chrislusf/seaweedfs:latest"}}, set(), {}
    )
    assert run(fake, []) == 1
    assert (
        "seaweedfs: its image isn't pinned by digest: make pin-images"
        in capsys.readouterr().err
    )
    assert not [c for c in fake.calls if c[0] == "pull" and "seaweedfs" in c[-1]]


def test_docker_hub_detection() -> None:
    assert (
        pull.docker_hub(HUB)
        and pull.docker_hub("nvidia/cuda:12@sha256:x")
        and pull.docker_hub("postgres")
    )
    assert not pull.docker_hub(ref("edge")) and not pull.docker_hub(
        ref("gateway-state")
    )


def test_inside_the_sandbox_it_refuses(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SANDBOX_RUNTIME", "1")
    assert run(FakeDocker({}, set(), {}), []) == 2


def test_make_ups_own_gateway_build_is_never_pulled(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # tasks.md T184: compose names h4reet-gateway:<commit>, which make up builds and compose never pulls
    # (pull_policy: never). It is neither pulled nor reported as unpinned; any other unpinned image still is.
    services = {
        "gateway": {
            "image": "h4reet-gateway:${H4_REF:-working-tree}",
            "pull_policy": "never",
        },
        "edge": {"image": ref("edge")},
    }
    fake = FakeDocker(services, {ref("edge")}, {})
    assert run(fake, []) == 0
    assert not [c for c in fake.calls if "h4reet-gateway" in c[-1]]
    assert "gateway" not in capsys.readouterr().err
    services["edge"] = {
        "image": "ghcr.io/nginx/nginx-unprivileged:latest",
        "pull_policy": "never",
    }
    fake = FakeDocker(services, set(), {})
    assert run(fake, []) == 1
    assert "edge: its image isn't pinned by digest" in capsys.readouterr().err


def test_make_ups_own_web_build_is_never_pulled(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # spec 002: compose names h4reet-web:<commit>, with -drafts on dev, which make up builds and compose never pulls.
    services = {
        "web": {
            "image": "h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}",
            "pull_policy": "never",
        },
        "edge": {"image": ref("edge")},
    }
    fake = FakeDocker(services, {ref("edge")}, {})
    assert run(fake, []) == 0
    assert not [c for c in fake.calls if "h4reet-web" in c[-1]]
    assert "web" not in capsys.readouterr().err
