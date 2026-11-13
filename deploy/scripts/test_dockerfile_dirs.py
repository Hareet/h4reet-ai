"""Every Dockerfile in the tree: a `COPY --chmod=` into a directory has that directory made earlier in the file.

Found by T166's dry run on the Author's engine (spec 001 tasks.md T166; plan.md §16, "T166's harness"): BuildKit makes a
missing destination directory with the COPY's own mode, so `COPY --chmod=0644 … /app/` left /app at 0644, without the
execute bit, and the image's unprivileged user couldn't reach its own files ("python3: can't open file
'/app/snapshot_sink.py': [Errno 13] Permission denied"). deploy/tunnel/Dockerfile did the same to /etc/ssh/h4/. So the
directory comes first: a WORKDIR (made 0755, root's), or `install -d` or `mkdir` in an earlier RUN.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SKIP = {".git", "node_modules", ".venv", "dist", "build"}


def dockerfiles() -> list[Path]:
    found = []
    for path in REPO.rglob("*Dockerfile*"):
        if path.is_file() and not SKIP & set(path.relative_to(REPO).parts):
            found.append(path)
    return sorted(found)


def instructions(text: str) -> list[tuple[str, str]]:
    """Each instruction, its continuation lines joined, as (keyword, the rest)."""
    out: list[tuple[str, str]] = []
    parts: list[str] = []
    for line in text.splitlines():
        if not parts and (not line.strip() or line.lstrip().startswith("#")):
            continue
        continued = line.rstrip().endswith("\\")
        parts.append(line.rstrip().removesuffix("\\").strip())
        if continued:
            continue
        keyword, _, rest = " ".join(parts).partition(" ")
        out.append((keyword.upper(), rest.strip()))
        parts = []
    return out


def made_before(steps: list[tuple[str, str]], index: int, directory: str) -> bool:
    """The directory made in this stage before step `index`: by WORKDIR, or by `install -d` or `mkdir` in a RUN."""
    want = directory.rstrip("/") or "/"
    making = re.compile(
        rf"\b(?:install\b[^;&|]*?\s-d\b|mkdir\b)[^;&|]*?\s{re.escape(want)}/?(?=\s|$|;|&|\|)"
    )
    for keyword, rest in reversed(steps[:index]):
        if keyword == "FROM":
            return False
        if keyword == "WORKDIR" and rest.strip().rstrip("/") == want:
            return True
        if keyword == "RUN" and making.search(rest):
            return True
    return False


def copies_into_directories(path: Path) -> list[tuple[int, str]]:
    steps = instructions(path.read_text(encoding="utf-8"))
    out = []
    for i, (keyword, rest) in enumerate(steps):
        if keyword != "COPY" or "--chmod=" not in rest:
            continue
        destination = rest.split()[-1]
        if destination.endswith("/"):
            out.append((i, destination))
    return out


def test_the_tree_has_dockerfiles_and_the_two_that_copy_into_a_directory() -> None:
    names = {str(p.relative_to(REPO)) for p in dockerfiles()}
    assert {"deploy/snapshot/Dockerfile", "deploy/tunnel/Dockerfile"} <= names


def test_every_copy_chmod_into_a_directory_has_the_directory_made_first() -> None:
    missing = []
    for path in dockerfiles():
        steps = instructions(path.read_text(encoding="utf-8"))
        for index, directory in copies_into_directories(path):
            if not made_before(steps, index, directory):
                missing.append(f"{path.relative_to(REPO)}: {directory}")
    assert missing == [], missing


def test_the_check_catches_the_found_shape_and_passes_the_fixed_ones(
    tmp_path: Path,
) -> None:
    def ok(text: str) -> bool:
        path = tmp_path / "Dockerfile"
        path.write_text(text, encoding="utf-8")
        steps = instructions(text)
        return all(made_before(steps, i, d) for i, d in copies_into_directories(path))

    assert not ok("FROM x\nCOPY --chmod=0644 a.py b.py /app/\n")
    assert ok("FROM x\nWORKDIR /app\nCOPY --chmod=0644 a.py b.py /app/\n")
    assert ok("FROM x\nRUN install -d -m 0755 /app\nCOPY --chmod=0644 a.py /app/\n")
    assert ok(
        "FROM x\nRUN apk add y && \\\n    install -d -m 0755 /etc/ssh/h4\nCOPY --chmod=0644 c /etc/ssh/h4/\n"
    )
    assert not ok(
        "FROM x\nRUN install -d -m 0755 /app\nFROM y\nCOPY --chmod=0644 a.py /app/\n"
    )
    assert ok("FROM x\nCOPY --chmod=0755 entrypoint.sh /usr/local/bin/h4-tunnel\n")
