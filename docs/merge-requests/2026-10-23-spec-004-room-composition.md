# spec/004-room-composition
Spec: [specs/004-room-composition/spec.md](../../specs/004-room-composition/spec.md), with its [plan](../../specs/004-room-composition/plan.md), [tasks](../../specs/004-room-composition/tasks.md), and the rest of that folder · Intent: [specs/004-room-composition/intent.md](../../specs/004-room-composition/intent.md) (accepted 2026-10-22) · Written by: a docs-role helper of the lead session, for this note only; the spec was drafted by the spec-writer role · Date: 2026-10-23
Session: started from the primary checkout, `/home/h4reet/h4reet-ai/h4reet-ai`; the branch's worktree, `/tmp/claude-1000/wt-004-spec` (on `spec/004-room-composition`), holds the spec, the plan, the tasks, and this note · Repo hooks active: yes, with the excerpt below from `.claude/audit/hooks.log` in the primary checkout (the worktree has no audit folder)

```text
2026-10-08T00:21:50Z	bash	ALLOW	git log --oneline --all -40 && echo "---BRANCHES---" && git branch -a && echo "---REMOTE ...
2026-10-23T13:10:50Z	subagent	OK	checked the closing message: clean :: agent_type: none
```

Authorized by: the Author's approval of the plan in plan mode on 2026-10-22, and the Author's answers of 2026-10-22, quoted under "The Author's words, as recorded". The analysis remediation of 2026-10-23 ran under the Author's overnight direction, which `spec.md`'s Clarifications (session 2026-10-23) records. Confirmations 21 and 22, which that remediation added, and Confirmations 23 and 24, which the remediation of this branch's REVIEW.md pass added the same night, are taken under that direction, not answered, and they wait for the Author's yes.

## What changed and why

This branch is documents only. It carries spec 004, Room Composition: the specification with its clarifications and amendments, the plan, the research, the data model, nine contracts, the quickstart, 291 tasks, the fixes from the analysis, and the fixes from this branch's REVIEW.md pass. Nothing runs differently. No code, model call, route, or byte flow changed. No other spec's file was edited: the amendments to specs 000 to 003 are named in this spec, not written into those specs.

**The idea, in plain words.** Spec 002's room is code today: each object is written by hand. This spec makes the room data. Each kind of piece becomes one catalog entry, and each placement and each clickable object becomes one line in a scene file. A build step, the compositor, checks that data and writes one room bundle for the 3D room, the 2D room, and the text copy. Adding, moving, or retargeting a piece is then an edit to data. A new kind of behaviour is written once in code and reused.

The design keeps these rules, each traced in the spec to the intent or to the Author's answers:
- Studio models are plain: no behaviour, and no readable text. Every word the room shows is drawn live from approved text.
- The laptop's charger shows whether the Author's machine is serving: plugged in when the local tier serves, the cloud pose when the cloud fallback serves, and the shared resting pose when nobody is answering or the state is unknown.
- The neon sign counts the visitor's own conversation costs, from each turn's reply. The room never reads Langfuse.
- The photos stay on the Author's machine. Only outputs the Author has reviewed cross into the studio's inbox.

| # | User story (the title in `spec.md`) | Priority |
|---|---|---|
| 1 | Moving, Adding, or Retargeting a Piece Is a Data Edit | P1 |
| 2 | The Room Tells No Lie, and Never Stops | P1 |
| 3 | The Look Is Settled at the Room's Real Framing | P1 |
| 4 | Studio Pieces Arrive as Plain Models, and the Photos Stay Home | P2 |
| 5 | Every Readable Word Is Drawn Live From Approved Text | P2 |
| 6 | Selecting a Piece Opens Its Topic | P2 |
| 7 | Every Visitor Reaches Every Piece | P2 |
| 8 | The Laptop Shows Whether the Author's Machine Is Serving | P3 |
| 9 | The Neon Sign Counts What My Conversation Costs | P3 |

**The shape of the spec.** 79 functional requirements (FR-001 to FR-079) and 15 success criteria in force (SC-001 to SC-015; SC-016 is folded into SC-001), written in EARS form. Thirty-three amendment rows name the clauses of other specs they change: Z1 to spec 000, A1 to A7 to spec 001, B1 to B14 to spec 002, and C1 to C11 to spec 003. The amended specs keep their text; each amendment supersedes its clause from this spec's approval.

**The shape of the plan.** Two lines of branches. Line I is governance and intake: the Author's patches P-1 to P-11, applied to `main` in the order FR-077 sets, with P-11 outside that order. Line R is the room itself, built now on branches stacked on spec 002's branch. The Author merges in the order M1 to M9, and line R merges after P-10. Agents never merge; they rebase and cherry-pick.

**What this branch carries**, all in `specs/004-room-composition/`: [`spec.md`](../../specs/004-room-composition/spec.md), [`intent.md`](../../specs/004-room-composition/intent.md) (moved from `intent/004-room-pieces.md` with `git mv` in the draft commit), [`checklists/requirements.md`](../../specs/004-room-composition/checklists/requirements.md), [`plan.md`](../../specs/004-room-composition/plan.md) (the patches and the merge order), [`research.md`](../../specs/004-room-composition/research.md) (70 decisions), [`data-model.md`](../../specs/004-room-composition/data-model.md), `contracts/` (nine files; the largest is [`intake-amendments.md`](../../specs/004-room-composition/contracts/intake-amendments.md)), [`quickstart.md`](../../specs/004-room-composition/quickstart.md) (Q0 to Q12), and [`tasks.md`](../../specs/004-room-composition/tasks.md) (291 tasks in twelve phases).

### The record of the lifecycle

| Stage | Commit | What happened |
|---|---|---|
| Intent | `303e79e`, `84e08c3` | Intent 004 accepted on 2026-10-22; then a revision, "intent(004): the photos feed local models; the studio sees only reviewed outputs". |
| Draft | `2b47aab` | The first draft of the spec. |
| Review | `595e471` | Revision 1, after one review pass by four read-only reviewers (constitution, intent fidelity, testability, cross-spec). |
| Verification | `3209951` | Revision 2, after a verification workflow of 14 agents over revision 1: 37 confirmed fixes, none a blocker. |
| Checklist | `93ee588` | The specification quality checklist: 16 of 16 items pass. |
| The Author's answers | `8c5c46f` | "yes to all, go ahead" to the two questions and Confirmations 1 to 20. |
| Clarify | `64937ab`, `3fcf0bf` | Five clarifications, each answered by the Author (below). |
| Plan | `435f8a5` | Approved by the Author in plan mode. Three explorers and three designers; six writers and a plan writer; three checkers with skeptics (30 confirmed). |
| Tasks | `311fda6` | 285 tasks in twelve phases, lookdev first; 15 confirmed findings applied. |
| Analyze | `d5e8ec3` | Three lenses with skeptics: 33 confirmed. The 8 HIGH findings are applied here; the rest are in the Backlog below. |
| Note | `8b9d2da` | This note's first draft. |
| REVIEW.md | this note's Review | The reviewer agent, on `8b9d2da`: changes requested before M3, 3 Important and 5 Nits. |
| Port | `76bfb42` | Line R's four document fixes (`0972b92`, `62c711f`, `13a6843`, `598eb59`), so the plan and the tasks agree (the review's finding 3). |
| Review fixes | `9e916cb` and this note's commit | Findings 1 and 2 and the nits resolved; Confirmations 23 and 24; tasks T290 and T291; the rebase claim in T057 and the intake contract's §14 corrected. |

**The Author's words, as recorded.** The Author's answers are quoted as the spec records them. The labels before each quote are the questions' topics; the readings stay in the spec's Clarifications.
- During the specify review, 2026-10-22, on whether the chalkboard joins the stylized scale: "Yes, chalkboard can get stylized scale too".
- After the specify pass, 2026-10-22, the two questions and Confirmations 1 to 20: "yes to all, go ahead".
- `/speckit-clarify`, 2026-10-22, five answers:
  - models sent gzip-encoded: "yes, go with recommended";
  - the legibility floor's measure: "yes";
  - the check that the studio's session can't read the photos folder or the blinding key: "B is fine";
  - the sign's lettering: "C is fine", then "actually let's do B for that" and "and use a local tool";
  - the "Around the room" section's visibility: "okay go with recommendation".
- The overnight direction, recorded in `spec.md`'s Clarifications (session 2026-10-23): "I want you to keep going! that way i can do the merges and lookdev with the studio input in the morning", and later that night, "You are also free to continue beyond lookdev if you reach that point, try to keep going!". Under it, recommended answers were taken, not given, as Confirmations 21 to 24.

### The merge

- **Position: M3.** M1 is `spec/003-studio-assets` and M2 is `spec/002-the-room`. Both are fast-forwards: `refs/heads/main` is an ancestor of each (checked read-only for this note). This branch is based on `main` at `58bd2327212e`, and changes 18 files: 17 under `specs/004-room-composition/`, and this note.
- **No conflict on top of M2.** The lead's dry run with `git merge-tree` showed none. A read-only legacy `git merge-tree` run for this note found no path changed on both sides.
- **The tip to gate and merge is the one the gate prints.** Run `tools/gates/gate spec/004-room-composition` from `main`'s checkout, then merge with the command the gate prints ([ADR 0017](../adr/0017-clean-room-gate-and-human-only-gate-paths.md); [START-HERE §7](../START-HERE.md#7-before-you-merge)).
- **Then M4,** `feat/003-guards` with P-1. With T290's interim deny (For the Author, item 1) it closes the exposure item 13 names, so it is the next thing to do.
- **Line R's copy matches.** `feat/004-setup` carries this branch's documents through `d5e8ec3` (cherry-picked as `0b98727`), and this branch carries line R's four document fixes (`76bfb42`), so `git diff spec/004-room-composition feat/004-setup -- specs/004-room-composition/` showed only line R's ticks before the review's fixes. Those fixes (`9e916cb` and this note's commit) reach line R on `feat/004-foundation`, by cherry-pick.

## Acceptance criteria

none: this branch writes the spec and implements no requirement, so it satisfies no FR or SC in code. Its own acceptance is the spec-quality checklist, 16 of 16 items ([`checklists/requirements.md`](../../specs/004-room-composition/checklists/requirements.md)), and the analysis's coverage: every FR and every SC is referenced by a task in [`tasks.md`](../../specs/004-room-composition/tasks.md), by its ID or by a range that includes it. FR-016 and FR-018 appear only inside the ranges "FR-015 to FR-019" and "FR-017 to FR-019". SC-016 is folded into SC-001.

## Constitution check

Applied with the constitution-check questions against constitution 1.0.1 ([constitution](../../.specify/memory/constitution.md)), as the spec and the plan record them. The plan's post-design check gives the verdict: PASS, with the spec's named deviations only.

| Principle | How the spec and plan comply | Verdict |
|---|---|---|
| I. Data-local by default | One same-origin status poll, switched on only in the change that serves it. The turn's cost travels in the reply the device already gets. Nothing is stored on the device. The photos stay on the Author's machine, behind the guard and the outline check. | PASS; deviations 3 and 4 below |
| II. Production-grade or not shipped | Every success criterion has a proof. The cost is measured by the compositor's report. §7.9 of the telemetry contract is written now. | PASS; deviation 1 |
| III. Intent before spec, spec before code, humans merge | Built from the accepted intent. Amendments are named, not edited into other specs. No agent merges. | PASS; deviation 2 |
| IV. Least privilege | Each human-only change is one of the Author's patches (P-1 to P-11), and each adds denies or checks, except the approved admissions: P-5 (C1, C2, C4, C5), P-9 (room text), and P-11 (the status harness). Nothing else is widened. | PASS; P-11 is the one named exception to "nothing is widened" |
| V. Cost is a first-class signal | $0 model spend at run time. No budget, ceiling, or price changes. Agents never raise a cap. | PASS |
| VI. Build in public, including failures | The catalog, the scene, the work orders, the photo guide, the records, and the approved room text are public. The photos and the studio's working files are not. | PASS |
| VII. Own the whole product, and say exactly what you owned | "The mark follows the record" (C1). A `design` source for original work (C2). A step the studio's session scripted is a model step, credited to its service (C8). | PASS |
| VIII. Honest AI | An unready topic says so and calls no model. The twin states no amount. The chalkboard draws corpus lines only. | PASS |
| Security & Agent Governance | The implementer never reviews. Reviewer tasks T288 and T289 were added. Behavioural evals run after P-1, P-2, P-4, and P-7. | PASS |
| Workflow steps 7 and 8 | §7.9 is written now, and its panels join at User Story 8's switch-on. P-2 and P-7 update [`docs/how-we-build/lifecycle.md`](../how-we-build/lifecycle.md) when they land. | PASS; deviation 1 for step 7 |

The four named deviations, from the spec's Deviations and the plan's Complexity Tracking:
1. Principle II and workflow step 7: until spec 001 carries the status and the asset events, the room's piece loads and the "Room live state" panel have no production series.
2. Local until publication (ADR 0013): this branch is reviewed with a note here, as specs 000 to 003 are.
3. The guard came after the first photos: spec 003's FR-003 and the intent's constraint say the guard is applied before the first photo is staged. The room photos were staged on 2026-10-22; P-1 and P-2 close the rest before the first studio output is brought in.
4. The studio's session's disclosure row (spec 003's FR-040(c), C8 here, row D4 in the plan) lands at M5, after the studio's first sessions.

## Review

**REVIEW.md's pass** (bugs, security, compliance, cost and telemetry), by the reviewer agent, which wrote none of this branch, over `git diff main...spec/004-room-composition` at `8b9d2da`. Its verdict line, as given:

> Review (REVIEW.md: bugs, security, compliance, cost & telemetry), reviewer agent, 2026-10-23, on 8b9d2da: changes requested before M3. 3 Important: the studio's photos are readable by paths outside FR-025's proof; the guard's remaining denies are scheduled after their risk, and FR-025's rewording was not put to the Author; the spec folder has diverged from line R's copy (plan versus tasks, review N1). 5 Nits, plus 2 already in the Backlog. Cost and telemetry: no findings.

What it found, and what was done (all before M3; no second pass, one review pass per branch):
- **Important 1, routes to the photos outside FR-025's proof.** ComfyUI's HTTP server serves its input, output, and temp folders (`/view`, and its previews) to anything that reaches 127.0.0.1:8188, whatever the file denies say; and Blender's autosaves and a tracing tool's recent files can land where a session reads them. Done in `9e916cb`: FR-025 in five parts, with a listener rule and a side-file rule; P-3's rules SS9 to SS11; two stage-S matrix rows for the port; the photo guide's setup step and checklist; the Author's check, T291; and Confirmation 24, since the studio's session can then no longer queue ComfyUI's runs itself. The listener rule covers the folders each session is denied, so a photo-free route stays open for the Author to choose on a no.
- **Important 2, the guard's denies after their risk.** Until P-1 (M4) this repository's sessions can read the outputs and workflows folders, and until P-2 (M5) write them; the analyze's rewording of FR-025 wasn't put to the Author. Done in `9e916cb`: Confirmation 23, the exposure named under Deviations with when each part ends, and the Author's interim deny, T290. The reviewer proposed that deny at user level; the studio's own session loads the user settings and works in those two folders, so the deny goes in this repository's `.claude/settings.local.json`, which git ignores.
- **Important 3, two diverged copies of the spec's folder.** Done in `76bfb42` (the port), with `d5e8ec3` on line R as `0b98727`, and the rebase claim in T057 and the intake contract's §14 corrected in this note's commit.
- **Nits 4 to 8, and two from the Backlog.** Done in `9e916cb`: Z1 names ADR 0021, amended on P-11's branch while it is proposed; the Author's two overnight sentences recorded verbatim; Amendment A7 for spec 001's row IDs (V7); the guard's behavioural case aimed at the canary alone; P-7's pass checks what the work orders ask of the studio's session; T191's intent numbered 005; User Story 2's scenario 3 agrees with FR-060.
- **Its feedback for `CLAUDE.md`:** finding 2 is a second occurrence of "Scheduling a deny after the risk it guards", whose examples don't cover a private folder agent sessions can reach (For the Author, item 12).

The lifecycle reviews before it, each by agents that did not write what they checked:

| Pass | Who | Result | Done about it |
|---|---|---|---|
| Draft review (`2b47aab`) | four read-only reviewers: constitution, intent fidelity, testability, cross-spec | Findings went into revision 1 (`595e471`). | Revision 1. The Author answered one question during the review: "Yes, chalkboard can get stylized scale too". |
| Verification of revision 1 | 14 agents: item verifiers, regression lenses, and a skeptic per checker | 37 confirmed fixes; none a blocker. | Revision 2 (`3209951`). |
| Plan check (`435f8a5`) | three checkers, each with a skeptic: coverage, consistency, governance | 30 confirmed: 9 major, 21 minor; no blockers. | The fix record applied 28 of the 29 findings it counts. The one it left, consistency 5 (the intent's two links, which the record said blocked M3), was made in `435f8a5`, and the docs link check passes. |
| Tasks (`311fda6`) | a check of `tasks.md` (reviewers not named in the record) | 15 confirmed findings. | Applied: 285 tasks, then 289 after analyze. |
| Analyze (`d5e8ec3`) | three lenses, each with a skeptic: dup-amb-under, constitution-coverage, inconsistency | 33 confirmed: 8 HIGH, 12 MEDIUM, 13 LOW; no CRITICAL. | The 8 HIGH applied in `d5e8ec3`. The 25 others are in the Backlog. |

The plan's fix record and the analyze's remediation log were cut short when they were saved. Their full texts, read from the workflows' own records, leave nothing unapplied but consistency 5 (made in `435f8a5`), coverage 3 (the relay's port, worded "dev's relay" since spec 001 is plan-only), and one point the remediation didn't check, now in the Backlog.

**The analyze's eight HIGH fixes, checked against the files.**
- C1: P-11, the compose-policy patch for the status harness, is in the plan's patch table and its other sections.
- A1: FR-025 and FR-077's first item are reworded so that neither states a timing that had already passed. The room photos were staged on 2026-10-22.
- C5, D3, and F2: FR-070 is amended, so the look is chosen on runs that show the whole vignette. The Clarifications (session 2026-10-23) and Confirmation 21 record it. Tasks T286 and T287 are added, and T145 is made preliminary.
- D1 and F3: Amendment Z1 and P-11 together. Row S1 names `status-harness`, so the disclosure rule holds with no exemption, and the disclosure entries include "Spec 000's S1, amended (Z1)".
- D2: reviewer tasks T288 (the outline branch) and T289 (P-11's branch) are added.

The lens verdicts call C2, D4, and F1 HIGH, but their finding records say MEDIUM; this note follows the records. C6, D4, and F1, one order problem, are resolved by `76bfb42`. The analysis counted 16 SCs; SC-016 is folded into SC-001, so 15 are in force.

### Backlog

The 18 findings of the analyze pass still open: 5 MEDIUM and 13 LOW, one line each, with the lens, the ID, the location, and a summary. Paths are under `specs/004-room-composition/` unless shown otherwise. A line marked "the lens verdict called this HIGH" is one whose lens verdict used a higher severity than its record.

Resolved before M3, and so left out below: C2, C3, D9, and F7 (`9e916cb`), and C6, D4, and F1 (`76bfb42`).

MEDIUM:
- **dup-amb-under · A2.** `spec.md` FR-045, FR-074, User Story 8 scenario 5, and Amendment A4; `contracts/tier-signal.md` §1; `tasks.md` T252 to T261. The live-source switch-on rule is written three times in three wordings; one statement should carry it, with the disclosure words.
- **dup-amb-under · B2.** `spec.md` FR-064, Terms, and SC-009; `research.md` R-20; `tasks.md` T062 and T170. A selectable's hit area and core need one definition, so the pick areas cannot overlap and the stray-pick rule has one meaning.
- **dup-amb-under · B4.** `spec.md` SC-007 and FR-062; `tasks.md` T157 and T182. "Blank" and "frozen" are undefined, and the jsdom fault-injection suite that proves them draws no pixels; the fix defines both in SC-007.
- **constitution-coverage · D7.** `tasks.md` T142 and the Implementation Strategy's "MVP first" paragraph. T142 allows a route for the morning desktop run that works before M9, listed under what the Author runs; before M9 that route would run code from unmerged branches. The fix deletes it.
- **constitution-coverage · D8.** `tasks.md` T189, `contracts/room-data-files.md` §7, `research.md` (FR-012's proof). Chalkboard lines drafted before the corpus exists are marked pending, which skips the citation checks, though research calls them non-public; the fix uses one neutral placeholder per slot.

LOW:
- **dup-amb-under · B1.** `spec.md` FR-041 (the inputs sentence and row 7), `contracts/tier-signal.md` §3 row 7, `tasks.md` T154. The failover cue is timed from the reply's arrival in the spec and from the request's start in the contract; the fix aligns the wording to "after the last valid answer's request began".
- **dup-amb-under · B6.** `spec.md` FR-022. The clause "as the chosen look needs" can read as making the flat-colour ban depend on the look; the fix deletes it.
- **constitution-coverage · D6.** `tasks.md` T027, T042, T045, T051, T055, T151, T238, T257, and T283. Each names a merge-request note without its form (Acceptance criteria and Constitution check, as T016 defines it); the fix names the form.
- **constitution-coverage · E5.** `tasks.md` T184, T178, and T179; `spec.md` FR-033 and Confirmation 11. The board's resume outline, which FR-033 withholds whenever the resume is withheld, is built in T184 with no test written first; T179 has no case for it.
- **constitution-coverage · E6.** `spec.md` FR-046; `tasks.md` T095, T100, T130, T150, and T194; `contracts/turn-cost.md` §5. No rule, test, or work-order note checks the neon sign's colours against FR-046's ban on Langfuse's logo, wordmark, or colours.
- **inconsistency · F4.** `spec.md` FR-041 (intro and row 7), Edge Cases, and Confirmation 9; `contracts/tier-signal.md` §3; `data-model.md` §11.1 row 7; `research.md` R-30; `tasks.md` T154 and T158. The row-7 timing question from the reading side: the contract's reading needs adding beside R-34 for the Author to confirm.
- **inconsistency · F5.** `spec.md` SC-004, FR-042, FR-044, and the Assumptions' "Fresh"; `contracts/tier-signal.md` §1 (RL1); `contracts/room-data-files.md` §13.9; `data-model.md` §4.7; `tasks.md` T076. SC-004's 40 seconds holds only at the default poll cadence; the fix scopes it there.
- **inconsistency · F6.** `contracts/plain-model-fit.md` §12; `tasks.md` T033 and T034 (line I), T073, and T222 (line R). §12 says the scrubber and the `glb/rules.ts` change land in one commit, but the tasks put them on different lines.
- **inconsistency · F8.** `spec.md` User Story 2, scenario 1; `quickstart.md` Q4; `tasks.md` T157, T165, and T182; `plan.md` §6. Q4 asks for checks that only later stories build (the neon counters and the cost channel); the fix moves them to Q7 and Q11.
- **inconsistency · F9.** `spec.md` Terms, FR-015 to FR-023, FR-053, and Amendment C6. "Image cards", still images drawn on a plane, are used in the design and the contracts but not defined in the spec's Terms; the fix adds the definition.
- **inconsistency · F11.** `tasks.md` T018; `plan.md` §4.1; `contracts/intake-amendments.md` §17; `quickstart.md` Q1. Four places say the four studio folders should sit "ideally under one parent", while the photos folder and ComfyUI's four folders already exist inside it; the fix rewords them to "whichever of the four don't exist yet".
- **inconsistency · F13.** `data-model.md` §3; `contracts/room-data-files.md` §1 and §4; `contracts/room-bundle.md` §3.3 and §14; `contracts/lookdev.md` §2; `tasks.md` T069, T093, and T131. The dagger ("never reaches the built site") marks different fields in different artifacts (budget, name, estimated).
- **inconsistency · F14.** `contracts/turn-cost.md` §5, `tasks.md` T263, `spec.md` FR-048 and SC-011. turn-cost adds a $100 bound that FR-048 does not have, and its "at least $99.999999 est." display conflicts with SC-011's exact sum; the fix flags it as a reading for the Author to confirm.

From the REVIEW.md remediation, points it didn't settle, and one from the analyze's full log:
- **Thumbnail caches.** A desktop's thumbnail cache of a photo is covered only by FR-025's general side-file clause.
- **The photos and key before P-2.** If the user-level deny is read-only, this repository's sessions may have no write deny on those two folders until P-2; the interim deny (T290) covers the outputs and workflows folders.
- **The settings check is a snapshot.** The studio's session could change its own `.claude/` or `.mcp.json` between two checks.
- **P-8 and TMPDIR.** The outline check could refuse to run unless TMPDIR lies inside the photos folder.
- **The proxy row.** Telling a policy refusal from a gateway error depends on the pinned Claude Code's proxy, which needs checking when the row is written.
- **Intent 005** holds a recorded description, not a proto-spec, so a future spec 005 can't pair with it as specs pair with intents.
- **The harness's port.** Spec 000's plan §1 says each stack's ports are ones "which no env file can change", while the harness's port comes from `H4_STATUS_HARNESS_PORT` in dev's env file; whether spec 000's preflight enforces this wasn't checked (P-11's branch).

## Verification

Commands run:
- `make check ENGINE_MODE=none-yet` at `19d14b0`, the tree with every fix and this note before this section, in the worktree `/tmp/claude-1000/wt-004-spec`. Its whole output is below. Result: 10 PASS, 1 SKIP (`image`: no agents' engine yet, tasks.md T046), and 1 FAIL (`toolchain-check`). `make lint`, `make test`, and `make evals` run inside it, and all three PASS. The run at `d5e8ec3`, before the review, gave the same result.
- The FAIL is environment drift on this machine, not this branch. The branch changes only documents: 18 files, 17 under `specs/004-room-composition/` and this note, against `main` at `58bd2327212e`. Claude Code 2.1.309 is installed against a 2.1.296 pin. The Author's gate's toolchain step will show the same drift until the pin is updated under the Claude Code pin rule (For the Author, item 15).
- `gitleaks dir` on the worktree at `19d14b0`: no leaks found. `make check`'s pytest run writes `__pycache__/*.pyc` files, compiled copies of test files that hold fake tokens; they are untracked, and they were removed before the scan.
- The M1 to M3 dry runs at `19d14b0`, read-only: `refs/heads/main` is an ancestor of `spec/003-studio-assets`, which is an ancestor of `spec/002-the-room`, so M1 and M2 fast-forward; `git merge-tree --write-tree refs/heads/spec/002-the-room` with this branch reports no conflict.
- This note, after this section was written: `evals/docs_links.py` and `gitleaks dir` were run again; their results are in the commit that adds this section.

**`make check ENGINE_MODE=none-yet`, whole output, at `19d14b0`:**

```text
== makefiles-check
python3 -I -B -X pycache_prefix=/dev/null tools/gates/makefiles_check.py
makefiles: GNUmakefile holds only its include, and there is no makefile
-> PASS makefiles-check
== githooks-check
reference-transaction: installed
pre-commit: installed
main: a loose ref, which the git hook guards
-> PASS githooks-check
== toolchain-check
python3 -I -B -X pycache_prefix=/dev/null tools/gates/toolchain_check.py
tool                     pinned   found    status  where
node                     24.21.0  24.21.0  OK      /home/h4reet/.nvm/versions/node/v24.21.0/bin/node
uv                       0.8.22   0.8.22   OK      /home/h4reet/.local/bin/uv
ruff                     0.16.10  0.16.10  OK      /home/h4reet/.local/bin/ruff
gitleaks                 8.30.1   8.30.1   OK      /home/h4reet/.local/bin/gitleaks
python3                  3.12     3.12.3   OK      /usr/bin/python3
shellcheck               0.9.0    0.9.0    OK      /usr/bin/shellcheck
jq                       1.7      1.7      OK      /usr/bin/jq
pytest                   9.1.1    9.1.1    OK      /home/h4reet/.local/bin/pytest
pyyaml (pytest's)        6.0.3    6.0.3    OK      /home/h4reet/.local/share/uv/tools/pytest/bin/python3
claude code              2.1.296  2.1.309  DRIFT   /home/h4reet/.nvm/versions/node/v22.18.0/bin/claude
lint: eslint             10.12.0  10.12.0  OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/eslint
lint: typescript-eslint  8.71.1   8.71.1   OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/typescript-eslint
lint: typescript         6.0.3    6.0.3    OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/typescript
lint: prettier           3.9.9    3.9.9    OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/prettier
lint: node               24.21.0  24.21.0  OK      /home/h4reet/.local/share/h4reet/lint-node/node
toolchain-check: 1 of 15 differ from their pins (claude code); see tasks.md T013
make[1]: *** [Makefile:140: toolchain-check] Error 1
-> FAIL toolchain-check
== policy
python3 -I -B -X pycache_prefix=/dev/null tools/gates/compose_policy.py
compose policy: PASS (deploy/compose.yaml with 3 env files, the Dockerfiles, the env-file placement, .devcontainer, .npmrc)
-> PASS policy
== validate-config
npm run --silent -w services/gateway validate-config -- --root "/tmp/claude-1000/wt-004-spec"
validate-config: 0 errors, 0 notes
-> PASS validate-config
== lint
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
208 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/scripts/aws-login.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh redteam/forbidden-actions.sh tools/gates/install-tools.sh tools/gates/secrets.sh
-> PASS lint
== test
python3 -I -B -X pycache_prefix=/dev/null corpus/tools/check_corpus.py
corpus-check: OK — 20 slots, 4 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems
npm test --workspaces --if-present

> @h4reet/gateway@0.1.0 test
> vitest run


 RUN  v5.0.3 /tmp/claude-1000/wt-004-spec/services/gateway


 Test Files  49 passed (49)
      Tests  747 passed | 12 skipped (759)
   Start at  08:24:07
   Duration  70.66s (tests 92%, import 5%, transform 3%)

pytest -q -p no:cacheprovider --import-mode=importlib corpus/tools evals redteam tools/gates deploy/scripts deploy/agents-engine scripts
........................................................................ [  2%]
........................................................................ [  5%]
........................................................................ [  8%]
........................................................................ [ 11%]
........................................................................ [ 14%]
........................................................................ [ 17%]
........................................................................ [ 20%]
........................................................................ [ 23%]
........................................................................ [ 26%]
........................................................................ [ 29%]
........................................................................ [ 32%]
........................................................................ [ 35%]
........................................................................ [ 38%]
........................................................................ [ 41%]
........................................................................ [ 43%]
........................................................................ [ 46%]
........................................................................ [ 49%]
........................................................................ [ 52%]
........................................................................ [ 55%]
........................................................................ [ 58%]
........................................................................ [ 61%]
........................................................................ [ 64%]
........................................................................ [ 67%]
........................................................................ [ 70%]
........................................................................ [ 73%]
........................................................................ [ 76%]
........................................................................ [ 79%]
........................................................................ [ 82%]
........................................................................ [ 84%]
........................................................................ [ 87%]
........................................................................ [ 90%]
........................................................................ [ 93%]
........................................................................ [ 96%]
........................................................................ [ 99%]
.........                                                                [100%]
2457 passed in 157.41s (0:02:37)
-> PASS test
== secrets
bash tools/gates/secrets.sh
secrets: gitleaks with /home/h4reet/h4reet-ai/h4reet-ai/.gitleaks.toml, over /tmp/claude-1000/wt-004-spec
== gitleaks: unstaged changes
8:28AM INF 0 commits scanned.
8:28AM INF scanned ~0 bytes (0) in 27ms
8:28AM INF no leaks found
-> PASS unstaged changes
== gitleaks: staged changes
8:28AM INF 0 commits scanned.
8:28AM INF scanned ~0 bytes (0) in 25.2ms
8:28AM INF no leaks found
-> PASS staged changes
== gitleaks: 16 commits since main (58bd2327212e..HEAD)
8:28AM INF 16 commits scanned.
8:28AM INF scanned ~1388196 bytes (1.39 MB) in 189ms
8:28AM INF no leaks found
-> PASS 16 commits since main (58bd2327212e..HEAD)
secrets: PASS (unstaged changes, staged changes, 16 commits since main)
-> PASS secrets
== evals
python3 -I -B -X pycache_prefix=/dev/null evals/run.py --suite product --adapter ${ADAPTER:-fake} $([ "${ADAPTER:-}" = local ] && echo --stack prod)
PASS  hello-fake
evals product (fake): 1 passed, 0 failed
python3 -I -B -X pycache_prefix=/dev/null evals/agent-config/static.py
PASS  CLAUDE.md is 58 lines and 5901 bytes (at most 60 and 6 KB)
PASS  CLAUDE.md names the constitution as superseding it
PASS  REVIEW.md names the constitution as superseding it
PASS  role docs: tools match roles.expected
PASS  role implementer: tools match roles.expected
PASS  role ops: tools match roles.expected
PASS  role red-teamer: tools match roles.expected
PASS  role reviewer: tools match roles.expected
PASS  role spec-writer: tools match roles.expected
PASS  hook .claude/hooks/bash-gate.sh is registered for PreToolUse Bash
PASS  hook .claude/hooks/protected-paths.sh is registered for PreToolUse Edit|Write|MultiEdit|NotebookEdit
PASS  hook .claude/hooks/post-edit-check.sh is registered for PostToolUse Edit|Write|MultiEdit
PASS  hook .claude/hooks/subagent-report-check.sh is registered for SubagentStop (every subagent)
PASS  hook .claude/hooks/content-scan.sh is registered for PreToolUse Edit|Write|MultiEdit
PASS  FR-007: 27 of 27 variables denied by name
agent-config static: 0 failed, 0 planned
python3 -I -B -X pycache_prefix=/dev/null evals/agent-config/behavioral.py status
behavioral tier: 13 cases (10 enforcement, 3 conduct), 3 runs each; trigger hash 3f4caf1b916a
PASS  behavioral tier: 2026-10-12T184140Z-fix-000-gate-on-main-4907f2bf42e8 passed for trigger hash 3f4caf1b916a, the newest run for it
agent-config behavioral: pass, 0 planned
python3 -I -B -X pycache_prefix=/dev/null evals/docs_links.py
PASS  every relative link resolves: 1164 links in 100 files
PASS  README.md links the ADR index (docs/adr/)
PASS  the ADR index links every ADR file: 17 of 17
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 1164 relative links in 100 files
-> PASS evals
== redteam
python3 -I -B -X pycache_prefix=/dev/null redteam/run.py
PASS  benign-greeting (safe, clean)
PASS  planted-human-claim (unsafe, caught: claims to be human)
redteam: 2 passed, 0 failed
-> PASS redteam
== matrix
bash redteam/forbidden-actions.sh
KNOWN GAP   bash-gate.sh          make $(printf 'aws-%s' login) ENV=prod
KNOWN GAP   bash-gate.sh          t=aws; make "$t-login" ENV=prod
KNOWN GAP   bash-gate.sh          bash deploy/scripts/aws-l?gin.sh
KNOWN GAP   bash-gate.sh          gh pr \<newline>merge 1
KNOWN GAP   bash-gate.sh          make $'aws\x2dlogin' ENV=prod
KNOWN GAP   bash-gate.sh          python3 -c "import importlib; importlib.import_module(\"evals\" + \".run\").main()" --adapter bedrock
KNOWN GAP   bash-gate.sh          cd evals && python3 run.py --suite product --adapter bedrock
KNOWN GAP   bash-gate.sh          python3 /tmp/o.py --stack prod contract-record --adapter bedrock --out /tmp/r.json --reason "a live run"
KNOWN GAP   bash-gate.sh          /tmp/a sso login --profile h4reet-bedrock
KNOWN GAP   bash-gate.sh          python3 -c 'open("tests/test_router.py", "w").write("")'
KNOWN GAP   bash-gate.sh          install -m 0644 /tmp/new.py tests/test_router.py
KNOWN GAP   bash-gate.sh          git checkout HEAD~1 -- tests/test_router.py
KNOWN GAP   role:red-teamer       make redteam 2>&1 -f /tmp/x.mk
KNOWN GAP   role:red-teamer       make redteam 2>&1 -f /tmp/x.mk [--agent]
KNOWN GAP   role:red-teamer       make evals X='a|b' -f /tmp/x.mk
KNOWN GAP   role:red-teamer       make evals X='a|b' -f /tmp/x.mk [--agent]
KNOWN GAP   role:red-teamer       make redteam --fi=/tmp/x.mk
KNOWN GAP   role:red-teamer       make redteam --fi=/tmp/x.mk [--agent]
KNOWN GAP   role:red-teamer       GNUMAKEFLAGS=-f/tmp/x.mk make redteam
KNOWN GAP   role:red-teamer       GNUMAKEFLAGS=-f/tmp/x.mk make redteam [--agent]
KNOWN GAP   role:red-teamer       MAKEFILES+=/tmp/x.mk make redteam
KNOWN GAP   role:red-teamer       MAKEFILES+=/tmp/x.mk make redteam [--agent]
KNOWN GAP   role:reviewer         git log -p >&1x
KNOWN GAP   role:reviewer         git log -p >&1x [--agent]
KNOWN GAP   bash-gate.sh          python3 evals/agent-config/behavioral.py run
KNOWN GAP   bash-gate.sh          python3 tools/gates/matrix_canary.py
KNOWN GAP   bash-gate.sh          python3 tools/gates/publish_check.py
KNOWN GAP   bash-gate.sh          git commit $(printf -- '--no-%s' verify) -m wip
KNOWN GAP   bash-gate.sh          $(printf 'cla%s' ude) mcp add fs cmd
KNOWN GAP   bash-gate.sh          python3 -c "import urllib.request as u; u.urlopen('http://127.0.0.1:%d/admin/status' % (18000 + 3))"
KNOWN GAP   bash-gate.sh          make $(printf 'to%s' ols)
KNOWN GAP   bash-gate.sh          a shell write in a linked worktree: tools/gates/gate
KNOWN GAP   bash-gate.sh          a shell write in a linked worktree: evals/agent-config/static.py
KNOWN GAP   bash-gate.sh          git apply --cached /tmp/gates.patch
KNOWN GAP   bash-gate.sh          git update-index --add --cacheinfo "100644,$(git hash-object -w /tmp/new),tools/gates/gate"
KNOWN GAP   bash-gate.sh          git read-tree --prefix=tools/gates/ feature/x:tools/gates
KNOWN GAP   bash-gate.sh          git read-tree --prefix=evals/agent-config/ feature/x:evals/agent-config
--- stage S: the sandbox (SANDBOX_RUNTIME=1, .git/hooks unwritable) ---
NOTE        stage-S-unwritable    ~/.local/state/h4reet: no mask of its own, but it sits on a read-only mount (covered read-only /)
SKIP        stage-S-conn          the SMTP host row: H4_STAGE_S_SMTP_HOST isn't set: it names the alert channel's SMTP host, deploy/env's SMTP_HOST
NOTE        stage-S-conn          npm and 198.18.0.1:2376 (allowed) need the proxy and the engine; proved by stage E and make engine-smoke
--- stage E: the host (folded from /home/h4reet/.local/state/h4reet/agents-engine/prove-report.txt, which proved commit 58bd2327212e at 2026-10-18T00:54:24Z) ---
E1   PASS  (from prove-limits.sh)
E2   PASS  (from prove-limits.sh)
E3   PASS  (from prove-limits.sh)
E4   PASS  (from prove-limits.sh)
E5   PASS  (from prove-limits.sh)
E6   PASS  (from prove-limits.sh)
E7   PASS  (from prove-limits.sh)
E8   PASS  (from prove-limits.sh)
E9   PASS  (from prove-limits.sh)
E10  PASS  (from prove-limits.sh)
E11  PASS  (from prove-limits.sh)
E12  PASS  (from prove-limits.sh)
E13  PASS  (from prove-limits.sh)
E14  PASS  (from prove-limits.sh)
E15  PASS  (from prove-limits.sh)
E16  PASS  (from prove-limits.sh)
KNOWN GAP   bash-gate.sh          sh -c "$(printf 'gi%s pu%s' t sh)"
KNOWN GAP   bash-gate.sh          sh -c 'unset CLAUDE""CODE; git commit -m wip'
KNOWN GAP   bash-gate.sh          e=engine; deploy/agents-engine/$e.sh up
TOTALS      matrix                0 planned (reported, not failing), 1 skipped: stage S's SMTP row has no usable host
REQUIRED    matrix-required       every listed row ran
forbidden-actions (hook layer): 658 passed, 0 failed, 40 known gaps
-> PASS matrix
== image
SKIP: no agents' engine yet: tasks.md T046
-> SKIP image (no agents' engine yet: tasks.md T046)

PASS     makefiles-check
PASS     githooks-check
FAIL     toolchain-check
PASS     policy
PASS     validate-config
PASS     lint
PASS     test
PASS     secrets
PASS     evals
PASS     redteam
PASS     matrix
SKIP     image  no agents' engine yet: tasks.md T046
make check: 10 PASS, 1 SKIP, 0 PLANNED, 0 PENDING, 1 FAIL; failing: toolchain-check FAIL
make: *** [Makefile:146: check] Error 1
```

**`gitleaks dir`, at `19d14b0`** (terminal colour codes removed):

```text
8:29AM INF scanned ~8349484 bytes (8.35 MB) in 454ms
8:29AM INF no leaks found
```

## Cost and data-flow impact

- **This branch:** $0, and no byte leaves a device. It is documents only, and no runtime behaviour changed, so `docs/data-flow-disclosure.md` and `docs/how-we-build/` are not edited here.
- **The spec's cost estimate, for what it builds (not this branch):** $0 model spend at run time, since no piece, poll, or renderer calls a model. About 12 MB of room models per first visit, inside spec 003's 25 MB first-visit budget; 1,000 first visits a month is about 12 GB, under $1.20 at typical CDN rates and possibly free inside the allowance. About two status requests a minute per visible room, around a cent for 1,000 five-minute visits. $0 in the cloud before publication. The compositor's report measures it in each room note (FR-073).
- **The data flows the spec adds, as four disclosure entries.** Each lands in the change of its own flow (FR-027, FR-074):
  - spec 001's V2, amended (A4): the status poll, same-origin; it lands with the switch-on (User Story 8);
  - spec 002's V2, amended (B6): the turn's estimated cost and route, in the reply; it lands with the conversation (User Story 9's counters);
  - the studio's Claude Code session (C8, row D4 in the plan): the studio's sessions are hosted by Anthropic; it lands at M5 with `feat/004-guard`, before any room file names the session, and no row for it exists in `docs/data-flow-disclosure.md` yet;
  - spec 000's S1, amended (Z1): names `status-harness` in its From → To cell, before the arrow; it lands with P-11 and the switch-on.

## For the Author

What waits for you, in order. Items 1 and 2 are for now, before any merge. Items 3 to 6 are the confirmations taken under your overnight direction, waiting for your yes. Items 7 to 12 are the decisions and actions the spec names. Items 13 to 15 bear on the merge.

1. **Now, before any merge: the interim deny (T290).** Until P-1 (M4) this repository's agent sessions can read the studio's outputs and workflows folders, and until P-2 (M5) write them; the workflows folder is the studio session's own workspace. Add `Read` and `Edit` denies and sandbox `denyRead` and `denyWrite` for those two folders to this repository's `.claude/settings.local.json` (your global git ignore skips it), never at user level, which the studio's own session loads too. The run sheet has the file's content. Where: `tasks.md` T290; `spec.md` FR-025 and Deviations; `plan.md` "Do first".

2. **Now, before the next studio session: the ComfyUI check (T291).** Check whether the studio's session could reach ComfyUI's port at any time since 2026-10-22: through a hook or an MCP server in any of its settings scopes, a WebFetch rule, a sandbox network allowance for a loopback host, or its own queueing of ComfyUI's runs. If it could, close the route and hand the workflows over as files (item 6). If its transcripts show a file or a preview fetched from ComfyUI, record an incident in `docs/incidents/`. Where: `tasks.md` T291; `spec.md` Assumptions ("An Author action, now").

3. **Confirmation 21: FR-070, the runs that settle the look.** Taken under your overnight direction, not answered. FR-070 now chooses the look on lookdev runs that show the intent's whole vignette, on the reference phone and on the desktop; earlier runs may show part of it and are preliminary. The intent's order reads: "Lookdev settles the look on a small vignette, at the room's real framing, on a reference phone." Yes keeps it. On a no, FR-070 keeps its first wording, and the morning runs judge no look until the lookdev page shows the cable states and the faces. Where: `spec.md` FR-070, its Clarifications (session 2026-10-23), and Confirmation 21.

4. **Confirmation 22: Amendment Z1, the status harness.** The ID "Z1" is the writer's choice; A, B, and C are taken by specs 001 to 003. Z1 amends spec 000's plan §1 for one dev-only service, `status-harness`, which forwards SC-004's failover run's status requests to dev's relay. Yes keeps it. On a no, the harness is not added, and SC-004's failover run waits for another route to dev's relay. Where: `spec.md` Amendments (Z1), Assumptions ("No local status endpoint"), and Confirmation 22.

5. **Confirmation 23: FR-025, the guard's deadline.** Taken under your overnight direction, not answered. The analyze's remediation moved the deadline for the guard's remaining denies (the outputs and workflows folders, and every write deny) from "WHEN the first room photo is staged on the Author's machine" to the first studio output brought in for intake, with your interim deny (item 1) covering this repository's sessions until then. Yes keeps it. On a no, FR-025's first wording comes back, and the "Already past" deviation stays. Where: `spec.md` FR-025, Deviations, and Confirmation 23.

6. **Confirmation 24: the studio's ComfyUI runs.** Taken under your overnight direction, not answered. ComfyUI's port serves the photos folder, so the studio's session no longer reaches it: it writes each ComfyUI workflow as a file in the workflows folder, and you read it and queue it, outside any Claude session; the outputs stay in the photos folder until you've reviewed them. Yes keeps it. On a no, you name another route, such as a second ComfyUI for work that loads no photo, with its folders inside the workflows folder and no node that reads outside them; the plan designs it before the session uses it, and you queue the runs until then. Where: `spec.md` FR-025 (Listeners), FR-024, and Confirmation 24.

7. **P-11: your patch to spec 000's compose policy.** It is the one named exception to "nothing is widened". It lets `tools/gates/compose_policy.py` admit `status-harness` alone: in its own compose profile, published only on the literal `127.0.0.1`, on the `edge` and `internal` networks. Every other rule still applies to it, and disclosure row S1 names it. P-11 sits outside FR-077's order, because it guards no risk that order names. It lands before User Story 8's switch-on, which waits for spec 001's dev relay. Where: `plan.md` §4.1; `contracts/intake-amendments.md` §18.

8. **The IPTC term, before P-5.** A piece a person made by hand carries IPTC's own human-made value, not the AI value. The exploration's guess, `digitalCreation`, is unverified, and agents have no route to IPTC's vocabulary. You check the term there and name it; P-5, the scrubber, and RX5 then use exactly that one term. The intent's words: "the AI mark follows the record, so hand-made work is marked as a digital creation". Where: `research.md` R-53; `contracts/intake-amendments.md` §17.

9. **P-6, your commit to `main`.** Name the list of `small_props`, the props that may carry 1024-pixel textures. Read each licence (Blender, the local tracing tool, MPFB and COLMAP if the studio uses them, and the studio session's terms), and fill in its terms and the date you read it. The draft leaves those dates blank. Where: `research.md` R-54; `contracts/intake-amendments.md` §8 and §17.

10. **The studio's contract, by hand.** Update it to accept the reviewed lettering outlines. A sign's lettering, traced from its photo with a local tool and reviewed by you, may leave the photos folder as vector paths. The contract the studio's session was given on 2026-10-22 lets only a mesh stripped to geometry leave that folder, and it lists no traced outline. The update goes in `docs/studio/handoff.md`, which this branch does not contain, before the first outline is handed over and before the window is modeled. Its ComfyUI change (item 6) comes at once, with item 2. Where: `spec.md` Assumptions ("Where this spec differs") and FR-032; `research.md` R-59.

11. **ComfyUI's four folders stay inside the photos folder.** FR-025 says every file a photo touches stays in the photos folder, and ComfyUI's input, output, temp, and user folders already sit there, as they have since 2026-10-22. Keep them there. R-51's advice to give the four folders one parent that holds nothing else is not a reason to move the photos folder. Where: `spec.md` FR-025 and Assumptions ("Already past"); `research.md` R-51; Backlog item F11.

12. **Two lines for [`CLAUDE.md`](../../CLAUDE.md): yours to add or not.** The writer proposes both. This note does not edit the file, which is human-only. Quoted verbatim:

   > "Calling an exception a reading: a path that crosses a line a principle, ADR, or spec draws ('no inbound from outside the host') is a deviation, named with every clause it breaks, never a new reading of the clause."

   > "Putting a file a photo touched anywhere but the studio's photos folder: the studio's own agent session reads its workflows and outputs folders."

   Adding both breaks the static eval. `CLAUDE.md` is 58 lines and 5,901 bytes today. The eval in `evals/agent-config/static.py` allows 60 lines and 6 KB (6,144 bytes). With both lines it would be 60 lines and 6,259 bytes, 115 bytes over the cap. Trim the file elsewhere, or raise the cap (an `evals/agent-config/` change, which is also yours).

   The REVIEW.md pass adds, for this file: finding 2 is a second occurrence of "Scheduling a deny after the risk it guards", whose examples don't cover a private folder that agent sessions can reach; the first proposed line above fits the static eval alone (59 lines, 6,117 bytes).

### Also before the merge

13. **Guard exposure: merge M4 with P-1 as early as you can.** The room photos were staged on 2026-10-22, before spec 003's guard (T005) landed, so the guard came after the risk it guards. The user-level denies on the photos and key folders have held since then. Until P-1 is on `main`, this repository's agent sessions can still read the studio's outputs and workflows folders, and until P-2 (M5) write them (plan §3.3; `research.md` R-50 and R-51). Your interim deny (item 1) closes both now; P-1 and P-2 then put the denies in the committed settings, where the matrix proves them. The spec names this as a deviation (Assumptions, "Already past"; Deviations).

14. **The studio's Claude Code sessions have no disclosure row yet.** The spec's disclosure entry lists the studio's sessions, since 2026-10-22, as a flow to Anthropic. `docs/data-flow-disclosure.md` has row D1 for the repository's agent sessions, and no row for the studio's session. The row (spec 003's FR-040(c); C8 here; D4 in the plan) lands with `feat/004-guard` at M5, before any room file names the session. The spec names this as a deviation.

15. **The Claude Code pin is out of step on this machine.** `toolchain-check` pins Claude Code at 2.1.296, and 2.1.309 is installed here. That is a governance setting, and it is why this branch's `make check` fails. The Author's gate will show the same drift until the pin is updated under the Claude Code pin rule.
