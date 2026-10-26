# spec/004-cube-amend
Spec: [specs/004-room-composition/spec.md](../../specs/004-room-composition/spec.md), the cube amendment (FR-052, FR-064, FR-073, FR-078, SC-009, SC-010; FR-048 unchanged) · Intent: [specs/004-room-composition/intent.md](../../specs/004-room-composition/intent.md) · Written by: a local opencode agent (the first draft, on `oc/004-spec-amend`), reworked by the spec-writer role, a Claude subagent of the main session · Date: 2026-10-26
Session: the main session started from `/home/h4reet/h4reet-ai/h4reet-ai`; this branch's worktree is `/tmp/claude-1000/wt-004-cube-amend`, on `spec/004-cube-amend`, cut from `main` at ed3799d · Repo hooks active: yes for this rework (Claude Code's hooks; `.claude/audit/hooks.log`, 2026-10-26T14:37:45Z: `subagent OK checked the handback: clean :: agent_type: spec-writer`). The local agent's five commits ran under opencode, where only git's own hooks run.
Authorized by: the Author's decisions of 2026-10-23 and 2026-10-26, quoted verbatim, once, in spec.md's Clarifications (Sessions 2026-10-23 and 2026-10-26), and the spec and plan in `specs/004-room-composition/`.

**Status: reviewed, ready to merge by hand** (documents only). Against `main`, seven files under `specs/004-room-composition/` change (spec.md, data-model.md, quickstart.md, tasks.md, plan.md, contracts/room-data-files.md, contracts/room-bundle.md), plus this note. FR-048, contracts/turn-cost.md, data-model.md §6.3, and T263 end equal to `main`'s text. The local agent's note was added and removed within the branch. No code, bundle, gate, Makefile, disclosure, or human-only path changes.

**Commits:** the local opencode agent's five commits from `oc/004-spec-amend`, cherry-picked onto `main` (ed3799d) as 9005c7c, 3719f5d, 0f8b69e, 934c9dc, and 9267b24, then this rework's commits. 0f8b69e's subject ("…as Confirmation 25") is superseded: no Confirmation 25 exists in the merged text.

## What changed and why

The Author laid the room out as a small brick cube on 2026-10-23, then took two recommendations that amend the tap-area rule and the legibility floor. A local opencode agent drafted the amendment on `oc/004-spec-amend` (2026-10-24). The reviews of that draft found that it went past the Author's words in three places, and the Author's five decisions of 2026-10-26 settled the rest. This branch keeps the draft's history and reworks its text.

**Which parts came from where.**
- **From the local opencode agent's draft** (kept, reworded where needed): the Clarifications entry for 2026-10-23 with the Author's four verbatim blocks; the structural test for a side-wall selectable, its members all mounted on the shell's `left-wall` or `right-wall` anchor, so the rule names no piece; the report naming each such selectable and its stages; and FR-052's exemption read from the turn-cost signal.
- **From this rework** (2026-10-26): the carve-out narrowed to the smallest stages, with D1's condition; the exemption narrowed to the counter faces, with Confirmation 25 removed; the "$99.99+" cap removed everywhere; the Session 2026-10-26 entry (D1 to D5); FR-078, FR-073, SC-009, and SC-010; data-model.md §4.5, §4.9, §10.1, §10.9, and §13; contracts/room-bundle.md §3.1 and §10; contracts/room-data-files.md §5.5 and §13.3; quickstart.md's Q3, Q5, Q7, and Q9; and tasks T292 to T302, with T100, T117, T119, and T170 amended.

**The review findings this rework fixes.**
1. Confirmation 25 (the sign's word face exempt on the phone) was the local agent's own; the Author never gave it. It is gone. Per D2, FR-052 exempts only the counter faces, on the reference phone alone, and the word face meets the floor on both reference stages, on a larger panel inside the 1.5 m sign.
2. The carve-out had been widened to every side-wall selectable at every stage. It now covers the smallest stages only, as recommendation 1 (a) names them: 304 × 208 (a 568 × 320 screen in landscape), 304 × 640 (a 320 × 960 screen held upright), and the 2D drawing at its smallest scale. Everywhere else tapping works as before, and the compositor refuses a side-wall selectable without its core at any other stage. That refusal is D1's condition: the choice between (b), (c), and (d) then goes back to the Author.
3. The draft's note and Clarifications said the session had reported "the carve-out's scope is every supported stage, not only the smallest" before the Author's answer. The session never said that. Its words are now quoted in the Clarifications as it offered them.
4. The "$99.99+" cap is dropped from FR-048, contracts/turn-cost.md, data-model.md's `sign.*` UI words, and T263, which are back to `main`'s text. "2) a. yes shorter longest reading is fine." is recorded as a permission given but not used, with D5 (i).
5. FR-078 said the chalkboard sits beside the twin. It now lays out the cube in the Author's terms, quoting "on a brick wall that is left of the monitor" and "in middle, being able to look at everything", with the snowboard on the left wall next to the chalkboard and the visitor where D3 puts them.
6. The report contract and the data model now carry the side-wall section, the `exempt on the phone` status, and the index's `side_wall` field (from `oc/004-us3-cube`'s room-bundle.md §3.1 and data-model.md §4.9, adjusted to the narrowed rule).
7. T170 and quickstart.md's SC-009 lines follow the amended FR-064, and tasks T292 to T302 cover RG6's carve-out in the kernel's `pick.ts`, RG7's per-face exemption, the report's two sections, the runtime's list-only picking in 3D and 2D, the cube's data, and D1's re-lay with its measurement.
8. The reading of "a little deeper" now says what was measured: no depth from 4 ft to 7 ft gave both boards their tap areas (the best was 4.5 px short), so the cube stays 4 ft deep. The draft's "3.85, clip-on scale" is gone.
9. The Author's words are quoted verbatim once, in spec.md's Clarifications; elsewhere the documents point there.
10. This note replaces `2026-10-24-oc-004-spec-amend.md`, which this branch deletes.

**Per file.**
- [spec.md](../../specs/004-room-composition/spec.md): the Status line; Clarifications, Session 2026-10-23 rewritten and Session 2026-10-26 added; FR-048 back to `main`'s text; FR-052, FR-064, FR-073, and FR-078 amended; User Story 7's Independent Test, SC-009, and SC-010 follow; an edge case for screens too small for wall taps; the Constitution Check's Principle III row; the Open Questions without Confirmation 25, and a short "Open after the cube amendment" list.
- [data-model.md](../../specs/004-room-composition/data-model.md): §4.5's carve-out; §4.9's default scene, the cube; §6.3's `sign.*` words back to `main`'s; §10.1's `side_wall`; §10.9's legibility status and side-wall row; §13's key numbers.
- [contracts/room-data-files.md](../../specs/004-room-composition/contracts/room-data-files.md): §5.5's pick area; §13.3's stages, RG6, and RG7.
- [contracts/room-bundle.md](../../specs/004-room-composition/contracts/room-bundle.md): §3.1's `side_wall`; §10's report, its example and its parts.
- [quickstart.md](../../specs/004-room-composition/quickstart.md): Q3's Author runs; Q5's report; Q7's SC-010 half; Q9's checks.
- [tasks.md](../../specs/004-room-composition/tasks.md): Prerequisites; T100, T117, T119, and T170; T292 to T302; the dependencies, the graph, and the parallel examples.
- [plan.md](../../specs/004-room-composition/plan.md): FR-078's data in three commits, and a §10 "Foreseen" entry for the camera change and the cube's data commits.

### The merge

- **Position:** after M3, on `main`, before line R's User Story 1 (`feat/004-us1-composition`), so US1's tasks T292 to T302 are written against the amended spec. Line R carries a cherry-picked copy, as it carries the rest of spec 004.
- **The code branch `oc/004-us3-cube`** implements the local agent's wider draft (the carve-out at every stage, the word face exempt). It is not to merge. `feat/004-us1-composition` also carries its three code commits for now (bc897a6, d8b9c2e, 4aa2e0a, cherry-picked as the starting point), and T292 to T302 rework them to this amendment, test-first, before US1's review (T116).

## Acceptance criteria

None in code: this branch amends the spec and implements nothing. It amends FR-052, FR-064, FR-073, FR-078, SC-009, and SC-010, and each is covered by a task: FR-052 and SC-010 by T293 and T297; FR-064 and SC-009 by T170, T292, T295, T296, T299, and T301; FR-073 by T294 and T298; FR-078 by T300 and T301. FR-048's text is `main`'s again.

## Constitution check

Applied with the constitution-check questions against constitution 1.0.1 ([constitution](../../.specify/memory/constitution.md)).

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local by default | No | No new byte leaves the visitor's device. The list-only picking is in the page, and the counters' figures were already in "Around the room". Degraded mode is unchanged. |
| II. Production-grade or not shipped | Yes | Tests come first (T292 to T295). The report's two sections measure the carve-out and the exemption in every room note (FR-073). Selecting from the list sends the same `object_selected` event, so no telemetry changes. |
| III. Intent before spec, spec before code, humans merge | Yes | The Author's decisions are quoted verbatim in the Clarifications. No confirmation is taken in the Author's name, and the draft's Confirmation 25 is removed. D1's fallback is written as a condition, and D4 goes to a new intent. |
| IV. Least privilege | No | No permission, allowlist, credential, or enforcement point changes. |
| V. Cost is a first-class signal | No | $0. No model call, budget, or cap changes. |
| VI. Build in public, including failures | Yes | The local agent's draft and what its reviews found are recorded here and in the Clarifications, not erased. |
| VII. Own the whole product, and say exactly what you owned | Yes | This note says which parts the local opencode agent wrote and which this rework wrote. |
| VIII. Honest AI | No | The counters' readings stay true (FR-048 unchanged), and the twin states no amount. |
| Accessibility (FR-065, WCAG 2.2 AA) | Yes | Every selectable stays reachable at full size through the "In the room" list, by pointer, touch, keyboard, and screen reader. |

No deviation is added.

## Review

`REVIEW.md`'s four passes, by a reviewer agent that wrote none of this branch, over its diff from `main` at 0a043e3: no blocker. It checked every quote of the Author character for character against its source, and every relative link. Its findings and what was done:

- **S1, Important:** the carve-out named three exact stages while the build sweeps stages every 16 px, so the neighbouring stages would refuse by construction, and 304 × 248 was held to the full rule unseen. Fixed: "FR-064's smallest stages" is defined once, in contracts/room-data-files.md §13.3, as Reading R1 (default: the class of phone-sized stages), waiting for the Author's yes. T301 reports the margins at the neighbouring stages.
- **S2, Important:** the two readings (the bicycle covered; a tap on a list-only board selects nothing) are decisions, not consequences. Fixed: Readings R2 and R3, each with its default and what changes on a no, in spec.md's "Open after the cube amendment".
- **S3:** SC-009, quickstart Q9, and T170 now carry FR-064's exception.
- **S4:** citations of plan.md §10 that didn't exist now cite T300 and T301; plan.md gains its third data commit and a "Foreseen" entry.
- **S5:** this note's file list and commit list corrected (above).
- **S6:** T301 also reports the chalkboard slate's horizontal foreshortening on the side wall.
- **S7:** `feat/004-us1-composition` carries the wide draft's code for now (see "The merge").
- **Nits:** RG7's exemption in its own sentence; "mounted directly on"; SC-010 split; `left-wall` and `right-wall` declared reserved shell anchor names; T300 names its check; "304 × 640, the narrowest aspect"; spec.md quotes the session's "No depth from 4 ft to 7 ft solves it".

The findings the reviews of `oc/004-spec-amend` raised, and what this rework did about each, are listed under "What changed and why".

## Verification

`make check` on this branch's tip, run by the main session:

```text
<<MAKE CHECK OUTPUT>>
```

## Cost and data-flow impact

None: documents only. No model call, request, flow, or byte leaving a device is added, so `docs/data-flow-disclosure.md` doesn't change.

## For the Author

1. **Merge after M3, on `main`, before line R's US1.** Documents only.
2. **Three readings wait for your yes** (spec.md, "Open after the cube amendment"). Each is written beside your words, not in their place, and the build uses its default until you answer:
   - **R1, which screens are "too small for wall taps":** default, every phone-sized stage (every upright 320-wide screen, every landscape stage 208 px high, and the 2D drawing at those stages); on a no, only 304 × 208, 304 × 640, and the 2D drawing at its smallest scale.
   - **R2, the bicycle:** default, the rule covers both side walls, so the bicycle too; on a no, only the left wall.
   - **R3, a tap on a list-only board:** default, it selects nothing on those screens, and the list reaches it; on a no, a tap on its frontmost part selects it.
3. **Two things stay open as conditions:**
   - **D1's condition.** If the re-laid left wall and the lower, closer camera still leave a side-wall board without its own tap area at any stage outside FR-064's smallest, the build refuses the room, and you choose between (b), (c), and (d) with the numbers (T301, T302).
   - **D4** is a new intent (`intent/005-full-window-room.md`, a draft), for spec 002's layout. It will move the stages the tap-area rule measures, so that work re-measures them.
