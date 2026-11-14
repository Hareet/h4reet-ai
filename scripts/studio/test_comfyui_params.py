"""The ComfyUI launch allowlist (spec 017 FR-040; plan Q15; contracts/runner.md; tasks.md T045).

deploy/night-shift/comfyui-params.json holds the parameters the studio agent may ask the runner to launch ComfyUI
with. The Author's answer to Q15 seeds it, in his words: "--birefnet" and sometimes it was run with that parameter
off, depending on the asset output that was needed. So the allowlist is one optional flag that takes no value, and
the runner alone sets the listening address, the port, and the folders.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PARAMS = ROOT / "deploy" / "night-shift" / "comfyui-params.json"
FIXED = {
    "--listen",
    "--port",
    "--output-directory",
    "--temp-directory",
    "--user-directory",
}


def load() -> dict:
    return json.loads(PARAMS.read_text(encoding="utf-8"))


def test_the_allowlist_parses_and_holds_only_birefnet() -> None:
    doc = load()
    assert doc["schema"] == 1
    assert [p["flag"] for p in doc["allowed"]] == ["--birefnet"]
    (birefnet,) = doc["allowed"]
    assert birefnet["value"] is None
    assert birefnet["optional"] is True


def test_the_runner_fixes_the_address_port_and_folders() -> None:
    doc = load()
    assert set(doc["fixed_by_runner"]) == FIXED
    assert not {p["flag"] for p in doc["allowed"]} & FIXED


def test_the_note_says_birefnet_is_unconfirmed_and_quotes_the_author() -> None:
    (birefnet,) = load()["allowed"]
    assert birefnet["core_flag_confirmed"] is False
    assert "first studio task" in birefnet["note"]
    assert birefnet["source"].startswith(
        'the Author, plan Q15: "--birefnet" and sometimes'
    )
