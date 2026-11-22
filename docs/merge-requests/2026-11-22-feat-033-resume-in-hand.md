# feat/033-resume-in-hand
Spec: specs/033-resume-in-hand/ · Intent: specs/033-resume-in-hand/intent.md · Written by: Claude Code, a subagent of the Author's session, in one worktree · Date: 2026-11-22
Session: /tmp/claude-1000/wt-feat-033-resume-in-hand (worktree of /home/h4reet/h4reet-ai/h4reet-ai) · Repo hooks active: yes (every commit ran the gitleaks and arrival-check hooks; the subagent hook refused an `analysis.md` of its own, so the analysis is a section of tasks.md)
Authorized by: spec.md and plan.md, approved provisionally by the Author's direction of 2026-11-22: "Go with your recommendations. Let's have you build it out in this session"

## What changed and why

The Author's three items (intent, verbatim in spec.md), from `main` `f1abe245`:

| Item | What | Where |
|---|---|---|
| 1. No box | The offer at the hand-off's end ("The twin handed you the Author's resume.", "Read the resume now", "Keep it for later") is gone. The room opens when the hand-off ends; focus stays on the room's heading, so the next Tab is "Resume"; `resume_kept` is sent once a visit at the hand-off's end (spec Q1, Q2) | `src/room/app.ts` (`enterRoom`), `layout.ts`, `room.css`, `choice/visit.ts` |
| 2. The paper opens the resume | In 3D, the paper in the visitor's hand is a pick target, `held-paper`. It uses spec 008's targeting inputs and highlight: hover, press, and the focus of "Resume" all show the border. A click or tap runs `openResume`, the toolbar "Resume" button's own handler, and sends `resume_opened` and nothing else. The pick area is the sheet's bounds on screen, grown to at least 44 × 44 CSS pixels, and it is picked before the pieces behind it (Q3, Q4). The 2D paper stays a drawing (Q5) | `src/room/stage.ts` (`HELD_PAPER`), `scene/bundle3d.ts` (`heldPaperArea`), `scene.ts`, `app.ts` |
| 3. The flicker | **Cause:** the travelling sheet, faded to opacity 0 at the hand-off's end, was still drawn with `depthWrite` on at the visitor's grip. Whenever three sorted it first, it hid the top half of the held sheet. The 4 s "idle-holding" loop moves the hand through its plane twice, so the blank comes about every 2 s. Measured: 92 of 160 frames for the man, 86 for the woman, up to 200 of 441 points hidden (spec.md, "The flicker's cause", file:line). **Fix:** a sheet at opacity 0 is not drawn, and the hand-off's end always shows the kept sheet. This also fixes a handless visitor (dinosaur, dog, failed avatar) leaving the visible sheet in the air when it walked | `scene/bundle3d.ts` (`fadePaper`, `keptPaper`), `scene/avatars.ts`, `scene.ts` |
| Records | The five dashboard visit shares divide by `resume_kept` alone, with descriptions and a test to match. Spec 000 telemetry.md §7.8 changed with them. Disclosure row V4 reworded (same event, body and count). Amendments A1 to A7 are made in place in specs 002, 005, 008, 009 and 012 | `deploy/grafana/dashboards/h4-runtime.json`, `deploy/scripts/test_dashboard.py`, `docs/data-flow-disclosure.md`, `specs/…` |

Tests that encoded the offer changed with the amendments. plan.md's table lists each one with its reason. Most lost one "Keep it for later" click. Three lost `resumeKept`. `quality.test.ts` now counts `resume_kept` instead of the offer. `hud-contrast.test.ts` now checks the HUD's own ring. The full-suite run found the following further tests:

- `fullscreen.test.ts`, `loading-page.test.ts`, and `talk-answer-shows.test.ts` held the room's input through the offer. Each now does it through the hand-off alone (`toOffer` became `toHandoff`).
- In `highlight.test.ts`, scenario 7 now takes the target from the hand-off's end. The hover-equals-click check now knows the paper's area: there the hover targets `held-paper` and a click opens the resume.

No snapshot changed.

## Acceptance criteria

FR-001 to FR-013 and SC-001 to SC-003 are met by the tests in tasks.md's coverage list. SC-004 is the Author's look (below).

## Constitution check

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local | yes | No new flow. The paper opens the panel "Resume" opens. `resume_kept` keeps its body and its once-a-visit count, and V4's words now follow it |
| II. Production-grade | yes | Tests for every FR. The flicker's test came from its reproduction and fails on `main` |
| III. Intent → spec → code | yes | Accepted intent, then spec, plan, tasks and analysis, all committed before code. RED then GREEN commits. Amendments named |
| IV. Least privilege | no | No governance file, hook, or permission touched. No patch for the Author's hand |
| V. Cost | yes | $0 at runtime |
| VI. Build in public | yes | The cause and its numbers are in spec.md |
| VII, VIII | no | Nothing about the Author or the twin's disclosure |

## Review

Reviewed by a reviewer that wrote none of this change. Verdict: APPROVE, with no Important findings.

- At 842d8d18: the flicker's cause held against the code; paper-steady failed on main (man 92, woman 86 frames
  hidden) and passed on the tip; 84 related files passed 1337/1337; tsc and eslint were clean; pet-bench fails the
  same on main. Five nits followed.
- At 1b54ec03, all five are fixed: the amendments in specs 005, 008, 014, 016 and 029 are complete, V4 says the event
  is automatic, the caveat dates from the release, and the test asserts it. The fix for the split list's mark is RED
  on 842d8d18 and green on the tip.
- Results: split and highlight suites 130/130, test_dashboard 96 passed.
- One commit message went through `git commit -F` after the bash gate falsely matched its text; the message was
  unchanged.

## Verification

Run in the worktree's sandbox. It has no Docker, no GPU, no browser, and no network beyond loopback, so `make check`'s container stages, evals, the red team, and a pixel look are skipped here. The change touches no model path, so evals aren't owed: the gate runs them only for agent-config changes.

- **RED** (commit `21666336`) against `main`'s code: 22 failed and 8 passed, across 4 files. The flicker's test reported `man: … expected [ '0 ms: 195 of 441', …(91) ] to deeply equal []`.
- **GREEN**, the four new files: `Test Files 4 passed (4)`, `Tests 30 passed (30)`.
- **`make -f Makefile lint`**: eslint `--max-warnings 0`, tsc for the three workspaces, `prettier --check .` ("All matched files use Prettier code style!"), `ruff check .` ("All checks passed!"), `ruff format --check` ("962 files already formatted"), shellcheck. `exit 0`.
- **`pytest -q -p no:cacheprovider --tb=line deploy/scripts/test_dashboard.py`**: `96 passed in 0.12s`.
- **The whole `apps/web` suite**, three runs:
  1. First run: `Test Files 9 failed | 280 passed (289)`, `Tests 20 failed | 5010 passed | 6 skipped (5036)`. Of these:
     - five files encoded the offer and are fixed in `c698ef83` (listed above);
     - site and smoke read a build made before the disclosure edit, and pass on a rerun;
     - twin-2d and pet-bench-real were timing-sensitive under load, and pass on a rerun;
     - pet-bench is covered below.
  2. Second run after the fixes, with the host at a load average of 35 from other sessions: `Test Files 88 failed | 201 passed (289)`, `Tests 97 failed | 4924 passed | 15 skipped (5036)`. Of the 97: 95 were `Test timed out in 60000ms`, one was `Hook timed out in 120000ms`, and two were V8 optimizer checks.
  3. Those 88 files rerun alone, at a load of 7: `Test Files 1 failed | 87 passed (88)`, `Tests 1 failed | 1677 passed (1678)`.
- **The one remaining failure** is `test/room/pet-bench.test.ts`'s "hot function 1 optimized before the measure". It also fails with `main`'s `apps/web/src` put back for one run, so it comes from this sandbox, not this change. Your gate's container is the judge.

## Cost and data-flow impact

$0 at runtime: no model call, request, or asset. No byte leaves the device that didn't before. A visitor who reads the resume at once now sends `resume_kept` and then `resume_opened`, two counter increments where there used to be one. Both kinds were already in V4.

## For the Author

**Decisions (each provisional, from your direction; spec.md's Clarifications):**

- Q1: `resume_kept` now marks the hand-off's end and is the dashboard's visit count. A dashboard range that reaches back before the release that carries this change to the serving host reads high for that span, a range between the merge and that release too.
- Q2: focus stays on the heading at the hand-off's end.
- Q3: "Resume" is the paper's keyboard path and name.
- Q4: the paper uses spec 008's highlight, with a pick area of at least 44 px.
- Q5: in 2D the paper stays a drawing.

Q1 and Q5 most deserve your look.

**Your look** (SC-004), on this branch's checkout in your usual dev stack:

1. **Wide window** (about 1440 × 900), 3D, the man or the woman:
   - Enter. The hand-off plays, then no box appears.
   - Click a piece at once: it works. Tab once from the start: "Resume" has focus, and the paper in your hand shows the yellow border.
2. **Hover the paper.** The border shows and the cursor becomes a hand. Move off and the border clears. Click it: the resume panel opens with focus on "The resume". Escape returns focus to "Resume".
3. **Watch the paper for at least 30 seconds held**, standing and walking. No part of it goes blank. Try the dog or the dinosaur too: the paper walks with the figure.
4. **Narrow window** (about 800 × 900, the column layout): 1 and 2 again.
5. **Phone** (a real one, or devtools at 390 × 844 with touch): no box. Tap the paper and the resume opens. A tap slightly off the paper's edge still counts (44 px).
6. **2D view:** no box, "Resume" works, and the paper is only a drawing (Q5).

**Patches:** none. No human-only path changed.

**Gate and merge**, from main's checkout:

```bash
b=feat/033-resume-in-hand
tools/gates/gate "$b"
```

Then the merge command the gate prints.
