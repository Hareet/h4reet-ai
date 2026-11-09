"""The asset tree as committed (spec 003 FR-015, FR-036; research R-01; contracts/asset-record.md §1, §3; tasks.md
T018, T028, T029).

The arrival check holds every asset and published-image directory to these rules (its R1 and N1), but it runs from
the main working tree's copy only, so until the Author applies Phase 2's patch nothing else reads the committed tree.
These tests do, from the files themselves:
- every directory with a records.json, under assets/ (but assets/policy/) and docs/research/images/, carries the
  media license's notice, asset-record.md §3's text exactly, read from the contract, with its copyright line's
  `<YEAR>` and `<HOLDER>` kept (the Author fills them before the directory's first file) or filled;
- every records.json names its own directory, schema 1, and the media license, with a list of entries;
- a published-image folder is named for the note that shows its images, docs/research/<folder>.md, the note every
  entry's `note` must name (R1);
- the evaluation note's folder is there (T028), and the note links its notice and its records, and has each grid
  scrubbed with `make assets-scrub` (T029).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = ROOT / "specs" / "003-studio-assets" / "contracts" / "asset-record.md"
MEDIA = "all-rights-reserved-2026"
TREES = ("assets", "docs/research/images")
POLICY = "assets/policy"
PUBLISHED = "docs/research/images"
EVALUATION = "docs/research/images/2026-10-12-image-model-evaluation"
NOTE = ROOT / "docs" / "research" / "2026-10-12-image-model-evaluation.md"


def notice_pattern() -> re.Pattern[str]:
    """asset-record.md §3's notice, with the copyright line's placeholders kept or filled, as rule N1 reads it."""
    section = CONTRACT.read_text(encoding="utf-8").split("## 3. The media license", 1)
    assert len(section) == 2, "asset-record.md has no §3"
    block = re.search(r"```text\n(.*?)```", section[1], re.DOTALL)
    assert block, "asset-record.md §3 has no notice"
    text = re.escape(block.group(1))
    text = text.replace(re.escape("<YEAR>"), r"(?:<YEAR>|\d{4})", 1)
    text = text.replace(re.escape("<HOLDER>"), r"(?:<HOLDER>|[^\n<>]+?)", 1)
    return re.compile(rf"\A{text}\Z")


def directories() -> list[str]:
    found = []
    for top in TREES:
        for path in sorted((ROOT / top).rglob("records.json")):
            directory = path.parent.relative_to(ROOT).as_posix()
            if directory == POLICY or directory.startswith(POLICY + "/"):
                continue
            found.append(directory)
    return found


def test_the_evaluation_notes_folder_is_there() -> None:
    folder = ROOT / EVALUATION
    assert (folder / "LICENSE.md").is_file(), f"{EVALUATION} has no LICENSE.md"
    assert (folder / "records.json").is_file(), f"{EVALUATION} has no records.json"
    assert EVALUATION in directories()
    assert (ROOT / PUBLISHED / "CREDITS.md").is_file(), (
        f"{PUBLISHED}/CREDITS.md isn't rendered"
    )


@pytest.mark.parametrize("directory", directories())
def test_every_notice_is_the_contracts_text(directory: str) -> None:
    notice = ROOT / directory / "LICENSE.md"
    assert notice.is_file(), f"{directory} has no LICENSE.md"
    assert notice_pattern().match(notice.read_text(encoding="utf-8")), (
        f"{directory}/LICENSE.md isn't asset-record.md §3's notice"
    )


@pytest.mark.parametrize("directory", directories())
def test_every_record_names_its_directory_and_the_media_license(
    directory: str,
) -> None:
    doc = json.loads((ROOT / directory / "records.json").read_text(encoding="utf-8"))
    assert doc.get("schema") == 1
    assert doc.get("directory") == directory
    assert doc.get("license") == MEDIA
    assert isinstance(doc.get("entries"), list)


@pytest.mark.parametrize(
    "directory", [d for d in directories() if d.startswith(PUBLISHED + "/")]
)
def test_a_published_image_folder_is_named_for_its_note(directory: str) -> None:
    folder = directory.removeprefix(PUBLISHED + "/")
    assert "/" not in folder, f"{directory} sits below a note's folder"
    assert (ROOT / "docs" / "research" / f"{folder}.md").is_file(), (
        f"{directory} has no note, docs/research/{folder}.md"
    )


def test_the_note_links_its_folder_and_scrubs_each_grid() -> None:
    text = NOTE.read_text(encoding="utf-8")
    relative = EVALUATION.removeprefix("docs/research/")
    for name in ("LICENSE.md", "records.json"):
        assert f"]({relative}/{name})" in text, (
            f"the note doesn't link {relative}/{name}"
        )
    grid = next(
        (line for line in text.splitlines() if line.startswith("- **Making a grid:**")),
        "",
    )
    assert "`make assets-scrub FILE=" in grid, (
        '"Making a grid" doesn\'t run make assets-scrub'
    )
