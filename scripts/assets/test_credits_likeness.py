"""Tests for the credits' likeness line (spec 020 FR-014, Q6; plan.md R-08; tasks.md T018).

`scripts/assets/credits.py` said "- A likeness of the Author: yes" for any entry recorded `likeness: true`, so the dog's
model, a likeness of the Author's dog, would have read as a likeness of the Author. The line names whose likeness it is
by the record's directory, from a small table: `assets/visitors/dog` is "the Author's dog"; every other directory is
"the Author", so every committed credit renders byte for byte as before (`--check` passes on the committed tree).
The records here are made up at run time, as test_credits.py makes them.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CREDITS = ROOT / "scripts" / "assets" / "credits.py"
MEDIA = "all-rights-reserved-2026"
AUTHOR_YES = "- A likeness of the Author: yes"
AUTHOR_NO = "- A likeness of the Author: no"
DOG_YES = "- A likeness of the Author's dog: yes"
DOG_NO = "- A likeness of the Author's dog: no"


def run(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            "-I",
            "-B",
            "-X",
            "pycache_prefix=/dev/null",
            str(CREDITS),
            "--root",
            str(root),
            *args,
        ],
        capture_output=True,
        text=True,
        check=False,
    )


def entry(name: str, likeness: bool, source: str = "photo") -> dict:
    return {
        "file": name,
        "sha256": hashlib.sha256(name.encode()).hexdigest(),
        "kind": "avatar" if "-" not in name else "animation",
        "made": "2026-11-14",
        "source": {"type": source, "id": "X-0001"},
        "likeness": likeness,
        "steps": [
            {
                "name": "rig",
                "by": "hand",
                "tools": [
                    {
                        "name": "Blender",
                        "version": "5.2.3",
                        "license": "gpl-3.0-or-later",
                        "license_version": "3",
                    }
                ],
            }
        ],
        "media_license": MEDIA,
    }


def rendered(tmp_path: Path, folders: dict[str, list[dict]]) -> str:
    root = tmp_path / "repo"
    for directory, entries in folders.items():
        (root / directory).mkdir(parents=True, exist_ok=True)
        (root / directory / "records.json").write_text(
            json.dumps(
                {
                    "schema": 1,
                    "directory": directory,
                    "license": MEDIA,
                    "entries": entries,
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
    done = run(root)
    assert done.returncode == 0, done.stderr
    return (root / "assets" / "CREDITS.md").read_text(encoding="utf-8")


def section(text: str, directory: str) -> str:
    start = text.index(f"## `{directory}`\n")
    after = text.find("\n## ", start + 1)
    return text[start : after if after >= 0 else len(text)]


def test_the_dogs_likeness_names_the_authors_dog(tmp_path: Path) -> None:
    text = rendered(
        tmp_path,
        {
            "assets/visitors/dog": [
                entry("dog.glb", True),
                entry("dog-walk.glb", False, "asset"),
            ]
        },
    )
    dog = section(text, "assets/visitors/dog")
    model = dog[dog.index("### `dog.glb`") :]
    clip = dog[dog.index("### `dog-walk.glb`") : dog.index("### `dog.glb`")]
    assert DOG_YES in model
    assert DOG_NO in clip
    assert AUTHOR_YES not in text
    assert AUTHOR_NO not in text


def test_the_dogs_entry_not_a_likeness_says_no(tmp_path: Path) -> None:
    text = rendered(
        tmp_path, {"assets/visitors/dog": [entry("dog.glb", False, "prompt")]}
    )
    assert DOG_NO in text
    assert DOG_YES not in text


def test_every_other_directory_names_the_author(tmp_path: Path) -> None:
    text = rendered(
        tmp_path,
        {
            "assets/twin": [entry("twin.glb", True)],
            "assets/visitors/man": [entry("man.glb", False, "prompt")],
            "assets/visitors/woman": [entry("woman.glb", False, "prompt")],
            "assets/visitors": [],
            "assets/room": [entry("desk.glb", False, "prompt")],
        },
    )
    assert AUTHOR_YES in section(text, "assets/twin")
    for directory in ("assets/visitors/man", "assets/visitors/woman", "assets/room"):
        assert AUTHOR_NO in section(text, directory)
    assert "the Author's dog" not in text


def test_the_committed_credits_render_as_before() -> None:
    done = run(ROOT, "--check")
    assert done.returncode == 0, done.stdout + done.stderr
    assert "credits: OK" in done.stdout
