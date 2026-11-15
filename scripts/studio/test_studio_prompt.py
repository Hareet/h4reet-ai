"""The studio agent's prompt and line.py agree on the rounds (rv-rounds4-020's I-1; spec 017's FR-028).

`deploy/night-shift/runner/prompts/studio.md` tells the studio agent how many rounds it has, in words ("Four rounds
at most", "After round four's failure"). `scripts/studio/line.py`'s `ROUNDS` is the number the line enforces. Each
is read as text, so nothing here runs either; the case fails when one moves without the other.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LINE = ROOT / "scripts" / "studio" / "line.py"
PROMPT = ROOT / "deploy" / "night-shift" / "runner" / "prompts" / "studio.md"
WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6}
HIS_WORDS = (
    "Let's go with the approval of the SHA and use the actual image "
    "/srv/studio/workflows/inbox/duck-toller.jpg"
)


def rounds_in_line() -> int:
    found = re.findall(
        r"^ROUNDS = (\d+)\b", LINE.read_text(encoding="utf-8"), re.MULTILINE
    )
    assert len(found) == 1, found
    return int(found[0])


def test_the_prompts_rounds_are_line_pys() -> None:
    text = PROMPT.read_text(encoding="utf-8")
    at_most = re.findall(r"\b(\w+) rounds at most\b", text, re.IGNORECASE)
    after = re.findall(r"\bafter round (\w+)'s failure\b", text, re.IGNORECASE)
    assert at_most and after, "the prompt names its rounds"
    said = {WORDS.get(w.lower()) for w in at_most + after}
    assert said == {rounds_in_line()}, (at_most, after)


def test_the_prompt_gives_the_authors_words_as_the_reason() -> None:
    assert HIS_WORDS in PROMPT.read_text(encoding="utf-8")
