# 017: the studio prompt says four rounds (for the Author's hand)

Spec: specs/017-the-night-shift/ (FR-028; plan.md §7's departure; data-model.md's Round result) · Written by: implementer (patch-rounds4-020) · Date: 2026-11-14
Branch: `night/patch-rounds4-020/patch-rounds4-020`, on `night/rework-rounds4-020/rework-rounds4-020` (`8383fcc3`). Built from plain copies of `refs/heads/main` at `3c0e4cd0`.

## Status: on main before the gate

The runner treats `deploy/night-shift/` as a human-only path (spec 017 `plan.md:240`: "main's denyWrite, main's `protected-paths.sh`, or `deploy/night-shift/`") and refuses a branch that changes it. So this prompt reaches main only by your hand, before the gate runs on the rounds4-020 stack. The branch now leaves `deploy/night-shift/` as main has it (`git diff refs/heads/main -- deploy/night-shift/` is empty).

## Why

Your words, 2026-11-14, about 21:00Z: "Let's go with the approval of the SHA and use the actual image /srv/studio/workflows/inbox/duck-toller.jpg". Rule 13 gives the dog a fourth round for that, and the rounds4-020 stack sets `scripts/studio/line.py`'s `ROUNDS` to 4 on the line. The studio agent's prompt still says "Three rounds at most" on main (`deploy/night-shift/runner/prompts/studio.md:7`). rv-rounds4-020's I-1 asked for the prompt to match `ROUNDS`. rework-rounds4-020 wrote that line on its branch, which was the supervisor's error, so it moves here, word for word.

## What it changes

- `deploy/night-shift/runner/prompts/studio.md:7`: the rework's line. It says four rounds, citing `line.py`'s `ROUNDS`, gives your words as the reason, and says to stop after round four's failure or after a failure in a round after a pass (rv-rounds4-020's N-3, as the page's Q267 answers it).
- `scripts/studio/test_studio_prompt.py` (new): the rework's test, unchanged. It reads both files as text: every "N rounds at most" and "after round N's failure" in the prompt must equal `ROUNDS`, and the prompt must hold your words. It moves with the prompt because it reads the prompt and would fail on the branch without it.

## Order

1. Apply this patch on main and commit it.
2. Run the gate on the rounds4-020 stack and merge it.

Between 1 and 2, main's `scripts/studio/test_studio_prompt.py` fails: main's `ROUNDS` is still 3, and the prompt says four. It passes once the stack merges. The checks in `docs/merge-requests/2026-11-14-rounds4-020.md`, under "Patch route (patch-rounds4-020)", show both.

## Apply

From the repository's root, on main (one line each):

```bash
B=night/patch-rounds4-020/patch-rounds4-020
F=docs/merge-requests/human-patches/017-studio-prompt-rounds.md
git show "refs/heads/$B:$F" > /tmp/017-studio-prompt-rounds.md
patch -p1 --dry-run < /tmp/017-studio-prompt-rounds.md
patch -p1 < /tmp/017-studio-prompt-rounds.md
```

`patch` skips this prose and reads only the diff below. The diff alone, as a file, has SHA-256 `c63e07a728ac2ed730f6de1cd059b2805e0bbbe5df46aa22bedc2ddfbb0f4f65`.

## The diff

```diff
--- a/deploy/night-shift/runner/prompts/studio.md
+++ b/deploy/night-shift/runner/prompts/studio.md
@@ -4,7 +4,7 @@
 
 - You read the brief in `/srv/studio/briefs/<asset>/<round>.json` and the workflows in `/srv/studio/workflows/`, work in `/srv/studio/outputs/`, and write your candidate to `/srv/studio/handoff/<asset>/<round>/`: the files, `candidate.json`, and `records.json`. You have no worktree and no repository.
 - Use only the tools the brief lists, each `outputs_ship: true`. Never use Qwen-Image-2.1 or FLUX [dev] for anything that ships, whatever a list says. Stay within the brief's limits.
-- Three rounds at most. After round three's failure, stop and leave the asset to the Author's decision.
+- Four rounds at most (`scripts/studio/line.py`'s `ROUNDS`), since the Author's words of 2026-11-14, about 21:00Z: "Let's go with the approval of the SHA and use the actual image /srv/studio/workflows/inbox/duck-toller.jpg". After round four's failure, or a failure in a round after a pass, stop and leave the asset to the Author's decision.
 - You hold the gpu lock for your whole task. You can't reach the Author's photos, the studio key, his secrets, or the Docker socket; your only way out is `api.anthropic.com`. Never push, merge, or open a PR.
 
 ## Save points
--- /dev/null
+++ b/scripts/studio/test_studio_prompt.py
@@ -0,0 +1,41 @@
+"""The studio agent's prompt and line.py agree on the rounds (rv-rounds4-020's I-1; spec 017's FR-028).
+
+`deploy/night-shift/runner/prompts/studio.md` tells the studio agent how many rounds it has, in words ("Four rounds
+at most", "After round four's failure"). `scripts/studio/line.py`'s `ROUNDS` is the number the line enforces. Each
+is read as text, so nothing here runs either; the case fails when one moves without the other.
+"""
+
+from __future__ import annotations
+
+import re
+from pathlib import Path
+
+ROOT = Path(__file__).resolve().parents[2]
+LINE = ROOT / "scripts" / "studio" / "line.py"
+PROMPT = ROOT / "deploy" / "night-shift" / "runner" / "prompts" / "studio.md"
+WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6}
+HIS_WORDS = (
+    "Let's go with the approval of the SHA and use the actual image "
+    "/srv/studio/workflows/inbox/duck-toller.jpg"
+)
+
+
+def rounds_in_line() -> int:
+    found = re.findall(
+        r"^ROUNDS = (\d+)\b", LINE.read_text(encoding="utf-8"), re.MULTILINE
+    )
+    assert len(found) == 1, found
+    return int(found[0])
+
+
+def test_the_prompts_rounds_are_line_pys() -> None:
+    text = PROMPT.read_text(encoding="utf-8")
+    at_most = re.findall(r"\b(\w+) rounds at most\b", text, re.IGNORECASE)
+    after = re.findall(r"\bafter round (\w+)'s failure\b", text, re.IGNORECASE)
+    assert at_most and after, "the prompt names its rounds"
+    said = {WORDS.get(w.lower()) for w in at_most + after}
+    assert said == {rounds_in_line()}, (at_most, after)
+
+
+def test_the_prompt_gives_the_authors_words_as_the_reason() -> None:
+    assert HIS_WORDS in PROMPT.read_text(encoding="utf-8")
```
