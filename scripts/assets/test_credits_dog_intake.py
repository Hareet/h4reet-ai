"""The dog's committed credit (spec 020 FR-014; plan.md R-08; intake-020, under the Author's orders' rule 15).

Round 4's records say `likeness: false` for the model and its clips, from a photo of the breed, not of his dog (rule 13),
and his disclosure line on main says "a dog of the breed and not a likeness of the Author's dog". So the committed
`assets/CREDITS.md`, rendered by `scripts/assets/credits.py` from the records, lists the dog's three files, each saying
"- A likeness of the Author's dog: no", and never that any of them is a likeness of the Author's dog, or of the Author.
`credits.py --check` passes on the committed tree.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CREDITS_MD = ROOT / "assets" / "CREDITS.md"
CREDITS = ROOT / "scripts" / "assets" / "credits.py"
DIRECTORY = "assets/visitors/dog"
FILES = ("dog-idle.glb", "dog-walk.glb", "dog.glb")


def section(text: str, directory: str) -> str:
    start = text.index(f"## `{directory}`\n")
    after = text.find("\n## ", start + 1)
    return text[start : after if after >= 0 else len(text)]


def test_the_dogs_section_lists_its_three_files_as_no_likeness() -> None:
    text = CREDITS_MD.read_text(encoding="utf-8")
    dog = section(text, DIRECTORY)
    names = [line[5:-1] for line in dog.splitlines() if line.startswith("### `")]
    assert names == list(FILES)
    assert dog.count("- A likeness of the Author's dog: no") == len(FILES)
    assert "- A likeness of the Author's dog: yes" not in text
    assert "- A likeness of the Author: " not in dog


def test_the_committed_credits_match_the_records() -> None:
    done = subprocess.run(
        [
            sys.executable,
            "-I",
            "-B",
            "-X",
            "pycache_prefix=/dev/null",
            str(CREDITS),
            "--check",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert done.returncode == 0, done.stdout + done.stderr
    assert "credits: OK" in done.stdout
