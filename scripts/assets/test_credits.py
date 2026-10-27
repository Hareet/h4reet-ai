"""Tests for scripts/assets/credits.py (spec 003 FR-010, FR-033's repository half; contracts/asset-record.md §1, §4;
tasks.md T010).

The renderer turns each directory's records.json into assets/CREDITS.md and docs/research/images/CREDITS.md: one
section per file, with its kind, its source's type (never its ID, which only the studio can read), each step by a
model or by hand, each model with its repository, revision, and license, each hand tool, any hosted service, and the
media license. `--check` exits 1 when a committed rendering is stale or hand-edited, or a records.json isn't in its
canonical form. The records here are made up at run time; their hashes are computed, never written out.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
CREDITS = ROOT / "scripts" / "assets" / "credits.py"
MEDIA = "all-rights-reserved-2026"
SOURCE_ID = "PH-7731"


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


def entry(name: str, **over) -> dict:
    record = {
        "file": name,
        "sha256": hashlib.sha256(name.encode()).hexdigest(),
        "kind": "avatar",
        "made": "2026-11-02",
        "source": {"type": "photo", "id": SOURCE_ID},
        "likeness": True,
        "steps": [
            {
                "name": "concept image",
                "by": "model",
                "models": [
                    {
                        "name": "Example Model",
                        "repository": "example-org/example-model",
                        "revision": "v1",
                        "role": "primary",
                        "license": "apache-2.0",
                        "license_version": "2.0",
                    }
                ],
                "models_checked": "2026-11-01",
            },
            {
                "name": "retopology and rig",
                "by": "hand",
                "tools": [
                    {
                        "name": "Blender",
                        "version": "4.2",
                        "license": "gpl-3.0-or-later",
                        "license_version": "3",
                    }
                ],
                "service": {
                    "name": "Example Upscaler",
                    "license": "apache-2.0",
                    "license_version": "2.0",
                    "disclosure_row": "D4",
                },
            },
        ],
        "media_license": MEDIA,
        "approval": "A-0001",
    }
    record.update(over)
    return record


def records(directory: str, entries: list[dict]) -> str:
    return (
        json.dumps(
            {"schema": 1, "directory": directory, "license": MEDIA, "entries": entries},
            indent=2,
        )
        + "\n"
    )


@pytest.fixture
def tree(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    for directory, entries in {
        "assets/twin": [entry("twin.glb")],
        "assets/visitors/dog": [
            entry("dog.glb", likeness=False, source={"type": "prompt", "id": "P-0002"})
        ],
        "assets/animations/humanoid": [],
    }.items():
        (root / directory).mkdir(parents=True)
        (root / directory / "records.json").write_text(
            records(directory, entries), encoding="utf-8"
        )
    return root


def test_it_renders_each_file_from_its_record(tree: Path) -> None:
    done = run(tree)
    assert done.returncode == 0, done.stderr
    text = (tree / "assets" / "CREDITS.md").read_text(encoding="utf-8")
    assert text.startswith("# Credits: assets\n")
    assert (
        text.index("`assets/animations/humanoid`")
        < text.index("`assets/twin`")
        < text.index("`assets/visitors/dog`")
    )
    twin = text[text.index("### `twin.glb`") : text.index("## `assets/visitors/dog`")]
    for expected in (
        "- Kind: avatar",
        "- Source: a photo",
        "- Made: 2026-11-02",
        "- A likeness of the Author: yes",
        "- Step 1, `concept image`, by a model: `Example Model` (`example-org/example-model`, revision `v1`), primary, under `apache-2.0` `2.0`",
        "- Step 2, `retopology and rig`, by hand: `Blender` `4.2`, under `gpl-3.0-or-later` `3`; a hosted service, `Example Upscaler`, under `apache-2.0` `2.0` (disclosure row D4)",
        f"- Media license: `{MEDIA}`",
    ):
        assert expected in twin, expected
    assert "No files yet." in text[text.index("`assets/animations/humanoid`") :]
    assert text.endswith("\n") and not text.endswith("\n\n")


def test_it_never_shows_a_sources_id_or_a_path_outside_the_tree(tree: Path) -> None:
    run(tree)
    text = (tree / "assets" / "CREDITS.md").read_text(encoding="utf-8")
    assert SOURCE_ID not in text and "P-0002" not in text
    assert str(tree) not in text and "/home/" not in text and "/tmp/" not in text


def test_check_passes_when_fresh_and_fails_when_stale_or_hand_edited(
    tree: Path,
) -> None:
    assert run(tree).returncode == 0
    assert run(tree, "--check").returncode == 0
    credits = tree / "assets" / "CREDITS.md"
    credits.write_text(
        credits.read_text(encoding="utf-8").replace("primary", "auxiliary"),
        encoding="utf-8",
    )
    done = run(tree, "--check")
    assert done.returncode == 1 and "assets/CREDITS.md" in done.stdout
    run(tree)
    path = tree / "assets" / "visitors" / "dog" / "records.json"
    path.write_text(
        records("assets/visitors/dog", [entry("dog.glb", kind="animation")]),
        encoding="utf-8",
    )
    assert run(tree, "--check").returncode == 1  # the rendering is stale


def test_check_fails_on_a_records_json_out_of_its_canonical_form(tree: Path) -> None:
    run(tree)
    path = tree / "assets" / "twin" / "records.json"
    canonical = path.read_text(encoding="utf-8")
    doc = json.loads(canonical)
    for bad in (
        json.dumps(doc, indent=4) + "\n",  # four spaces
        json.dumps(doc, indent=2),  # no trailing newline
        json.dumps(
            {**doc, "entries": [dict(reversed(list(doc["entries"][0].items())))]},
            indent=2,
        )
        + "\n",  # key order
    ):
        path.write_text(bad, encoding="utf-8")
        done = run(tree, "--check")
        assert done.returncode == 1 and "assets/twin/records.json" in done.stdout, bad
    path.write_text(canonical, encoding="utf-8")
    assert run(tree, "--check").returncode == 0


def test_entries_are_sorted_by_file(tree: Path) -> None:
    path = tree / "assets" / "twin" / "records.json"
    path.write_text(
        records("assets/twin", [entry("z.glb"), entry("a.glb")]), encoding="utf-8"
    )
    assert run(tree, "--check").returncode == 1
    assert (
        run(tree).returncode == 0
    )  # rendering writes the records back in canonical form
    assert [
        e["file"] for e in json.loads(path.read_text(encoding="utf-8"))["entries"]
    ] == ["a.glb", "z.glb"]
    assert run(tree, "--check").returncode == 0


def test_published_images_render_into_their_own_tree(tree: Path) -> None:
    directory = "docs/research/images/2026-10-12-image-model-evaluation"
    (tree / directory).mkdir(parents=True)
    grid = entry(
        "t1-grid.jpg",
        kind="published-image",
        arm="B",
        note="docs/research/2026-10-12-image-model-evaluation.md",
    )
    (tree / directory / "records.json").write_text(
        records(directory, [grid]), encoding="utf-8"
    )
    assert run(tree).returncode == 0
    text = (tree / "docs" / "research" / "images" / "CREDITS.md").read_text(
        encoding="utf-8"
    )
    assert "### `t1-grid.jpg`" in text and "- Arm: B" in text
    assert "- Shown in: `docs/research/2026-10-12-image-model-evaluation.md`" in text
    assert "t1-grid" not in (tree / "assets" / "CREDITS.md").read_text(encoding="utf-8")


def test_a_records_json_that_isnt_json_is_an_error_not_a_rendering(tree: Path) -> None:
    (tree / "assets" / "twin" / "records.json").write_text(
        "{not json", encoding="utf-8"
    )
    done = run(tree)
    assert done.returncode == 2 and "assets/twin/records.json" in done.stderr
