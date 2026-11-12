"""The functions' images (spec 001 tasks.md T034, T035; plan.md Technical Context, §16 group 4's departure 3; research.md
R-02): each function's Dockerfile builds on AWS's python3.14 Lambda base for arm64, pinned by digest in
deploy/images.lock as base:lambda-python, and copies its one module, with nothing fetched at build and nothing run.

The digest is the Author's resolve on 2026-11-11 (the combined merge-request note, For the Author, 2:
`docker buildx imagetools inspect`, as make pin-images resolves a tag). The bridge's folder is protected (spec 000's
infra/*alert*), so its Dockerfile travels in P-I2 with its code: while the tree lacks it, it is read from the patch.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
LOCK = REPO / "deploy" / "images.lock"
PI2 = REPO / "docs" / "merge-requests" / "2026-11-10-feat-001-pi2-account.patch"
BASE = "base:lambda-python"
REPOSITORY = "public.ecr.aws/lambda/python"
TAG = "3.14-arm64"
REGISTRY = "public.ecr.aws"
# The Author's resolve of REPOSITORY:TAG, 2026-11-11.
PINNED = "sha256:9ffc23f871c4db05f101f457e1742655f7629459bd3623c0ce60a65a01872904"
CHECKED = "2026-11-11"
# Each function's folder and its one module, whose handler() is the entry.
FUNCTIONS = {
    "alert_bridge": "bridge",
    "probe": "probe",
    "credential_audit": "audit",
    # Group 9's two (tasks.md T122): the start function and the guard, each on the same base.
    "ec2_start": "start",
    "ec2_guard": "guard",
}
# The folders P-I2 creates, whose Dockerfiles it carries.
PROTECTED = {"alert_bridge"}


def lock_lines() -> list[list[str]]:
    out = []
    for raw in LOCK.read_text(encoding="utf-8").splitlines():
        fields = raw.split()
        if fields and not raw.lstrip().startswith("#") and fields[0] == BASE:
            out.append(fields)
    return out


def instructions(text: str) -> list[tuple[str, str]]:
    out = []
    for raw in text.splitlines():
        line = raw.strip()
        if line and not line.startswith("#"):
            word, _, rest = line.partition(" ")
            out.append((word.upper(), rest.strip()))
    return out


def from_patch(patch: str, rel: str) -> str | None:
    """The text a unified diff gives a new file, `--- /dev/null` then `+++ b/<rel>`, or None if it holds none."""
    lines = patch.splitlines(keepends=True)
    for i, line in enumerate(lines):
        if (
            line.rstrip("\n") != f"+++ b/{rel}"
            or i == 0
            or lines[i - 1].rstrip("\n") != "--- /dev/null"
        ):
            continue
        m = (
            re.match(r"@@ -0,0 \+1(?:,(\d+))? @@", lines[i + 1])
            if i + 1 < len(lines)
            else None
        )
        assert m, f"P-I2's hunk for {rel} isn't a new file's"
        body = lines[i + 2 : i + 2 + int(m.group(1) or 1)]
        assert all(b.startswith("+") for b in body), (
            f"P-I2's hunk for {rel} holds a line that isn't added"
        )
        return "".join(b[1:] for b in body)
    return None


def dockerfile(folder: str) -> str:
    path = HERE / folder / "Dockerfile"
    if path.is_file():
        return path.read_text(encoding="utf-8")
    assert folder in PROTECTED, f"infra/lambdas/{folder}/Dockerfile is missing"
    text = from_patch(
        PI2.read_text(encoding="utf-8"), f"infra/lambdas/{folder}/Dockerfile"
    )
    assert text is not None, (
        f"neither the tree nor P-I2 holds infra/lambdas/{folder}/Dockerfile"
    )
    return text


def test_the_base_is_awss_python_314_lambda_base_for_arm64_by_the_authors_digest() -> (
    None
):
    assert lock_lines() == [[BASE, REPOSITORY, TAG, PINNED, REGISTRY, CHECKED]]


@pytest.mark.parametrize("folder", sorted(FUNCTIONS))
def test_each_dockerfile_copies_its_module_onto_the_pinned_base(folder: str) -> None:
    module = FUNCTIONS[folder]
    assert instructions(dockerfile(folder)) == [
        ("FROM", f"{REPOSITORY}:{TAG}@{PINNED}"),
        ("COPY", f"{module}.py ${{LAMBDA_TASK_ROOT}}/"),
        ("CMD", f'["{module}.handler"]'),
    ]


def test_p_i2_carries_the_bridges_dockerfile_whole() -> None:
    # Once P-I2 is applied, the tree's copy is the patch's, byte for byte.
    text = from_patch(
        PI2.read_text(encoding="utf-8"), "infra/lambdas/alert_bridge/Dockerfile"
    )
    assert text is not None
    tree = HERE / "alert_bridge" / "Dockerfile"
    if tree.is_file():
        assert tree.read_text(encoding="utf-8") == text
