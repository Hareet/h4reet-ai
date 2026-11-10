"""The functions' images (spec 001 tasks.md T034, T035; plan.md Technical Context; research.md R-02): each function's
Dockerfile builds on AWS's python3.14 Lambda base for arm64, pinned by digest in deploy/images.lock as
base:lambda-python, and copies its one module, with nothing fetched at build and nothing run.

The digest can't be fetched offline, so the lock line and the three Dockerfiles wait for the Author's resolve (the
merge-request note's step, `docker buildx imagetools inspect`, as make pin-images resolves a tag): until the line is
there this reads PLANNED, and no function folder holds a Dockerfile, since the compose policy refuses a FROM the lock
doesn't pin. Once it is, each Dockerfile is held to it.
"""

from __future__ import annotations

from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
LOCK = REPO / "deploy" / "images.lock"
BASE = "base:lambda-python"
REPOSITORY = "public.ecr.aws/lambda/python"
TAG = "3.14-arm64"
# Each function's folder and its one module, whose handler() is the entry.
FUNCTIONS = {
    "alert_bridge": "bridge",
    "probe": "probe",
    "credential_audit": "audit",
}
RESOLVE = f"docker buildx imagetools inspect {REPOSITORY}:{TAG}"


def lock_line() -> list[str] | None:
    for raw in LOCK.read_text(encoding="utf-8").splitlines():
        fields = raw.split()
        if fields and not raw.lstrip().startswith("#") and fields[0] == BASE:
            return fields
    return None


def instructions(text: str) -> list[tuple[str, str]]:
    out = []
    for raw in text.splitlines():
        line = raw.strip()
        if line and not line.startswith("#"):
            word, _, rest = line.partition(" ")
            out.append((word.upper(), rest.strip()))
    return out


def test_until_the_base_is_pinned_no_function_holds_a_dockerfile() -> None:
    if lock_line() is not None:
        pytest.skip("the base is pinned: the next test holds each Dockerfile to it")
    assert [f for f in FUNCTIONS if (HERE / f / "Dockerfile").exists()] == []


def test_the_base_is_awss_python_314_lambda_base_for_arm64_by_digest() -> None:
    line = lock_line()
    if line is None:
        pytest.skip(
            f"PLANNED (the Author's resolve, in the merge-request note): {RESOLVE}; then {BASE}'s line and the "
            "Dockerfiles"
        )
    _, repository, tag, digest, registry, checked = line
    assert (repository, tag, registry) == (REPOSITORY, TAG, "public.ecr.aws")
    assert digest.startswith("sha256:") and len(digest) == 71
    assert len(checked) == 10


@pytest.mark.parametrize("folder", sorted(FUNCTIONS))
def test_each_dockerfile_copies_its_module_onto_the_pinned_base(folder: str) -> None:
    line = lock_line()
    if line is None:
        pytest.skip(f"PLANNED: the Dockerfiles follow {BASE}'s pin ({RESOLVE})")
    module = FUNCTIONS[folder]
    text = (HERE / folder / "Dockerfile").read_text(encoding="utf-8")
    assert instructions(text) == [
        ("FROM", f"{line[1]}:{line[2]}@{line[3]}"),
        ("COPY", f"{module}.py ${{LAMBDA_TASK_ROOT}}/"),
        ("CMD", f'["{module}.handler"]'),
    ]
