# feat/004-foundation
Spec: specs/004-room-composition/ (Phase 2, Foundational: T059 to T086; Amendments B7 and C11) · Intent: specs/004-room-composition/intent.md · Written by: docs agent (Claude Haiku 5.5), from the implementer, review, and fix reports · Date: 2026-10-23
Session: implementer and fix sessions worked in their own worktrees under `/tmp/claude-1000/` (`wt-004-kernel`, `wt-004-glb`, `wt-004-core`, `wt-004-emit`, `wt-004-rgrs`, `wt-004-rtrv`, `wt-004-rxkl`, `wt-004-scan`, and others the reports don't name). The branch was assembled and reviewed in `/tmp/claude-1000/wt-004-r`. Repo hooks active: yes. From `.claude/audit/hooks.log`, post-edit lint warnings on this branch's worktrees, as the hook wrote them:

```text
2026-10-23T08:08:56Z  post-edit  WARN  lint failed :: /tmp/claude-1000/wt-004-kernel/apps/web/test/room/mount.test.ts
2026-10-23T12:31:10Z  post-edit  WARN  lint failed :: /tmp/claude-1000/wt-004-glb/apps/web/test/room/glb.test.ts
2026-10-23T14:11:34Z  post-edit  WARN  lint failed :: /tmp/claude-1000/wt-004-core/apps/web/test/helpers/room-fixtures.ts
```

Authorized by: the spec and plan in `specs/004-room-composition/`, and tasks.md T059 to T086. tasks.md's Prerequisites say: "the spec, clarified on 2026-10-22, and the plan approved that day." The Author's overnight direction, as the Prerequisites quote it: "I want you to keep going! that way i can do the merges and lookdev with the studio input in the morning" and "You are also free to continue beyond lookdev if you reach that point, try to keep going!"

**Status: reviewed, no blocker.** The review of four slices raised 22 findings: 7 important, 2 refuted to nits, and 13 nits. Each important finding was fixed test first. Where a fix took less than the review asked, the rest is in [plan.md §10](../../specs/004-room-composition/plan.md#10-departures-from-this-plan) or in the Backlog. Three nits went to the Backlog. The decisions for the Author are under For the Author.

**Merge order:** line R, after P-10 and `feat/004-setup`, per [plan.md §3](../../specs/004-room-composition/plan.md#3-the-order-of-work), which says line R merges "in this order after P-10". This branch's base is `feat/004-setup` (9d326e2). After the Author merges `feat/004-setup` at T058, T087 rebases this branch onto `main`. The Author then gates and merges it. The steps are under For the Author.

**Commits:** 105 between `feat/004-setup` (9d326e2) and this branch's tip, b6a3cf7, which is the tip before this note. The diff is 303 files, with 27,564 insertions and 397 deletions. No file under `.claude/`, `tools/gates/`, `assets/policy/`, `evals/agent-config/`, `deploy/`, `services/`, or `infra/` changes. Neither do `Makefile`, `REVIEW.md`, `CLAUDE.md`, `docs/data-flow-disclosure.md`, or `apps/web/vite.config.ts`.

| Track | Tasks | Records in the sources |
|---|---|---|
| Kernel | T061, T062, T070, T071, T072, and T066's cable half | `red-kernel.txt`, `green-kernel.txt`, `make-test-kernel.txt`, `make-evals-kernel.txt` |
| GLB | T063, T073 | `red-glb.txt`, `red-glb-hardening.txt`, `green-glb.txt`, `green-glb-suite.txt`, `make-test-glb.txt`, `make-evals-glb.txt`, `make-lint-glb.txt` |
| Stage A: the core, gzip, typefaces | T064, T065 (the fixtures), T067 (the policy half), T074 to T079, and the core of T075 to T078 | `core-report.json`. The sources hold no report for the gzip, checkLine, or typefaces commits. |
| Stage B: rule families, emit, orders, report, scan | T065 to T069, T078 (RG to RL), T080 to T082 | `stageb-004-emit.json`, `stageb-004-rgrs.json`, `stageb-004-rtrv.json`, `stageb-004-rxkl.json`, `stageb-004-scan.json` |
| Stage C: plugin, command line, one shared framing | T083, T084, T069's built-site half, and the one production framing (T078, T080, T081) | `stagec-004-plugin.json`, `stagec-004-unify.json` |
| Review and fixes | T085 | `review.md` (four slices), `fix1.json` (core and words), `fix2.json` (models and outputs) |

## What changed and why

This is line R's second branch. It builds the room's compositor: the code that reads the room's data, checks it against the rules in the contracts, and writes the bundle the site will read. The site does not use the bundle yet. This branch holds no room data (`apps/web/room/` is absent), and the Vite plugin is not wired into the site. One runtime file changes: `apps/web/src/room/framing.ts`. See Cost and data-flow impact.

What the branch holds:

1. **The kernel** (T061, T062, T070 to T072). Pure TypeScript in `apps/web/src/room/compose/`, with no three.js and no DOM. It holds the room's mount and framing math, the six aspects and reference stages, pick areas, legibility, the cable's run, load order, and the closed lists of kinds, renderers, signals, and UI keys. The camera's framing is in [compose/framing.ts](../../apps/web/src/room/compose/framing.ts).
2. **The GLB reader and fit check** (T063, T073). `apps/web/src/room/glb/` reads a GLB strictly and checks it against RX1 to RX10. The fit module's header says the compositor runs it in Node and the lookdev page runs it in a browser.
3. **The gzip copy** (T064). [gzip.ts](../../apps/web/src/room/glb/gzip.ts) writes a gzip-9 copy with pako, at time 0 and OS 255. A parity test checks lengths and trailers against Python's `gzip`.
4. **The compositor core** (T065, T067, T075 to T078 in part). The source tree, the strict YAML and JSON readers, the zod schemas ([schema.ts](../../apps/web/build/room/schema.ts)), the RD and RI rules, the policy reader ([policy.ts](../../apps/web/build/room/policy.ts)), and `compose()`. `compose()` reads no clock, environment variable, or network.
5. **The rule families** (T078, with T065 and T066). RG, RS, RT, RV, RX, RK, and RL, one module each in `apps/web/build/room/checks/`. With RD and RI, that is nine families and 65 rules. RG8 only reports.
6. **The outputs** (T080 to T082). [emit.ts](../../apps/web/build/room/emit.ts) builds the index, the 3D part, the digest, the models, and the cards. [orders.ts](../../apps/web/build/room/orders.ts) writes the work orders and the photo guide. [report.ts](../../apps/web/build/room/report.ts) writes the FR-073 report. [scan.ts](../../apps/web/build/room/scan.ts) is the source scan that fails on a fixture ID in committed code.
7. **The plugin and the command line** (T083, T084). [plugin.ts](../../apps/web/build/room/plugin.ts), `roomBundle()`, a Vite plugin that is not wired yet. [cli.ts](../../apps/web/build/room/cli.ts) and four npm scripts: `room:check`, `room:report`, `room:scan`, and `room:fit`. `room:generate` comes with T108. A vitest global setup builds the site once for release and once for drafts.
8. **The review's fixes** (T085). Two fix branches, `fix1` and `fix2`, each test first. The table under Review lists them.

## Dependencies pinned (T060)

Three packages are pinned exactly in `apps/web`'s devDependencies, in [apps/web/package.json](../../apps/web/package.json). The commit is a3af8f9.

- `zod` 4.6.5: "the gateway's pin, declared here because the image installs only this workspace" (T060's words). [services/gateway/package.json](../../services/gateway/package.json) pins the same version.
- `fontkit` 2.0.4: "already locked through pdfkit, made explicit" (T060's words).
- `pako` 2.1.0: "the one gzip-9 implementation" (T060's words).

Why each is a devDependency of `apps/web`:

- **The image installs only that workspace.** The web image's build stage copies `package.json` and the root lock, then runs `npm ci --ignore-scripts -w apps/web`. The [Dockerfile](../../apps/web/Dockerfile) says: "Only the room's workspace: npm skips the others, whose package.json files aren't in this stage." So all three must sit in that workspace's own list.
- **`zod` is build code only.** It is imported by [build/room/schema.ts](../../apps/web/build/room/schema.ts), and by a type import in `build/room/checks/rd.ts`.
- **`fontkit` is build code only.** It is imported by [build/room/typefaces.ts](../../apps/web/build/room/typefaces.ts).
- **`pako` is build code, and drafts-only if it reaches the lookdev page.** `src/room/glb/gzip.ts` is called from `build/room/checks/rx.ts`, `emit.ts`, and `report.ts`. If the lookdev page ever computes a gzip-9 length in a browser, that page is drafts only: FR-066, "THE LOOKDEV PAGE AND THE FIXTURES SHALL be built only into drafts builds".
- **No release's client chunks carry them.** No module the release's site imports loads any of the three. This follows from the import graph. No test asserts it: [chunk.test.ts](../../apps/web/test/room/chunk.test.ts) does not name these packages.

The lock: the root [package-lock.json](../../package-lock.json) pins fontkit 2.0.4 and zod 4.6.5. `pako` 2.1.0 sits under `apps/web/node_modules`. The root's pako 0.2.9 belongs to another package, per the review.

## The plugin is not wired into the site on this branch

[apps/web/vite.config.ts](../../apps/web/vite.config.ts) is unchanged here. It still builds with `roomContentModule`. T096 makes the swap, on `feat/004-us1-composition`. tasks.md says: "`roomBundle()` replaces `roomContentModule`" (T096). Until then the plugin runs only in its own tests: [plugin.test.ts](../../apps/web/test/room/plugin.test.ts), through [vite-plugin.ts](../../apps/web/test/helpers/vite-plugin.ts).

## Runs in the Author's terminal

Nothing. [ADR 0017](../adr/0017-clean-room-gate-and-human-only-gate-paths.md) asks that a note list any change to the Makefile, `deploy/scripts/**`, `scripts/operator.py`, or `.devcontainer/**` first, under its own heading. This branch changes none of them. The four `room:*` scripts are new and run by hand. None is in `make check`, since the Makefile has no line that names them. The vitest global setup ([global-build.ts](../../apps/web/test/global-build.ts)) builds the site twice inside `make test`, so it runs in the gate's run, not in your terminal.

## RED and GREEN

**RED.** tasks.md's Prerequisites set the rule: "In each phase the test tasks come first and must fail (RED) before the code that makes them pass; each merge-request note records the RED and GREEN runs." The RED for T061 to T069:

| Task | Tests | RED commit | Where the RED output is |
|---|---|---|---|
| T061 | `mount`, `framing`, `stages` | b0f5344 | `red-kernel.txt` |
| T062 | `pick`, `legibility` | b0f5344 | `red-kernel.txt` |
| T063 | `glb.test.ts`, and its helper | bf3cf45 | `red-glb.txt`; `red-glb-hardening.txt` |
| T064 | the gzip parity | ef1bb53 | none in the sources; the test commit came before the code, 23e486d |
| T065 | the fixture set; the schema, compose, and policy tests | 0fe935f, 4b92754, fe10d63, 729cdd3 | `core-report.json`; `stageb-004-rxkl.json`; `stagec-004-unify.json` |
| T066 | `words.test.ts`, `switches.test.ts` | 4b92754 (words), b0f5344 (cable), fe10d63 (the switch half of RS) | `red-kernel.txt` (cable); none in the sources for the words half |
| T067 | `policy.test.ts`, `budgets.test.ts` | 0fe935f (policy), 729cdd3 (budgets) | `stageb-004-rxkl.json` (budgets); none in the sources for the policy half |
| T068 | `determinism.test.ts` | 88684e5 | `stageb-004-emit.json` |
| T069 | `scan.test.ts`, `dist.test.ts` | 625eff3 (scan), 3309ae1 (built site) | `stageb-004-scan.json`; `stagec-004-plugin.json` |

What the RED records show:

- **T061 and T062** (`red-kernel.txt`). The kernel's eight suites failed before any kernel code existed: "Test Files 8 failed (8)", with "Tests no tests". Each failed on a missing module. `mount.test.ts` on `src/room/compose/math`; `framing.test.ts`, `legibility.test.ts`, and `pick.test.ts` on `src/room/compose/framing`; `stages.test.ts` on `src/room/compose/stages`.
- **T063** (`red-glb.txt`). `glb.test.ts` failed to load: "Cannot find module '../../src/room/glb/fit'".
- **T063, hardening** (`red-glb-hardening.txt`). Once the reader existed: "Tests 2 failed | 1 passed | 147 skipped (150)". The record doesn't say why 147 were skipped. The two failures: an accessor with no buffer view, a billion zeros and one sparse value, "expected 45317.010792 to be less than 2000"; and a live face's quad without reading a billion indices, "RangeError: Invalid array length" at `src/room/glb/fit.ts:397`. Later commits answer them: e6dd665 (the fit check streams what it measures) and e05b4b8 (a live face's mesh).
- **T065** (`core-report.json`). At the core's GREEN, the coverage test in `compose.test.ts` was red by design: "expected [ 'RG1', 'RG2', 'RG3', 'RG4', …(44) ] to deeply equal []". The RX, RK, and RL commit, 729cdd3 (de03946 in its own branch), "failed 50 tests across the three test files" (`stageb-004-rxkl.json`). The manifest half (812a2ff) passed on arrival. Its RED was a temporary change to emit's stand-in reason, which the agent then restored (`stagec-004-unify.json`).
- **T069** (`stageb-004-scan.json`, `stagec-004-plugin.json`). The scan's RED: "Test Files 1 failed (1)", "Error: Cannot find module '/build/room/scan'". The built-site RED: "failed at import, 'Cannot find module '../../build/room/plugin''".
- **T068** (`stageb-004-emit.json`): "the new and changed tests failed on the stub's empty outputs."

**GREEN.**

- Kernel, `green-kernel.txt`: "Test Files 8 passed (8)", "Tests 65 passed (65)".
- GLB, `green-glb.txt`: "Tests 152 passed (152)". The web workspace in `green-glb-suite.txt`: "Test Files 26 passed (26)", "Tests 492 passed (492)".
- `make-test-kernel.txt` and `make-test-glb.txt`: the gateway's suite, "Tests 789 passed | 12 skipped (801)"; the web workspace, 33 files and 405 tests at the kernel and 26 files and 492 tests at GLB. Pytest, "4 failed, 2572 passed" in both. The four failures are in `tools/gates/test/test_compose_policy.py`, the same as feat/004-setup's note records. This branch touches neither `deploy/compose.yaml` nor `tools/gates/`, which those tests read.
- `make-evals-kernel.txt` and `make-evals-glb.txt`: "docs links: 0 failed", over 1275 and 1273 links.
- `make-lint-glb.txt`: ESLint, tsc, Prettier, ruff check, and ruff format pass. The shellcheck command is echoed, with no error after it.
- The fix branches' own tips: fix1 at 0338f80, "Test Files 51 passed (51); Tests 1386 passed (1386)"; fix2 at 6819d97, "51 files, 1373 tests passed". These are their branches' counts, not this branch's total.

**Test-first exceptions, said plainly.**

- `fileTree`'s tests and `namespaceIds`' test came after their code (`core-report.json`).
- The manifest half of T065's strict-versus-lenient case passed on arrival, because T080 had already built the behaviour (`stagec-004-unify.json`).
- The sources hold no RED output for T064's parity test, the words half of T066, or the policy half of T067.

## Acceptance criteria

This branch serves parts of the following, as tasks.md names them for T061 to T083: FR-001 to FR-007; FR-009 to FR-011; FR-012 to FR-014; FR-015 to FR-020; FR-022; FR-026; FR-029 to FR-036; FR-040; FR-043; FR-049; FR-052 to FR-054; FR-064; FR-066; FR-068; FR-073; FR-074; FR-079; SC-001; SC-002; SC-006; SC-009; SC-010. Quoted from [spec.md](../../specs/004-room-composition/spec.md), in part:

- FR-005: "THE COMPOSITOR SHALL refuse any key its schema doesn't define and any value outside its declared type"
- FR-007: "A SOURCE SCAN SHALL fail `make check`, naming the file and the ID"
- FR-013: "THE BUILD SHALL warn and use that piece's stand-in, so `make up` always works"
- FR-043: "THE COMPOSITOR SHALL refuse a scene in which any value but local can show the plugged pose"
- FR-053: "THE CAPS SHALL be configuration the Author owns, read from `main`"
- FR-064: "each selectable SHALL keep an exclusive pick area of that size"
- FR-066: "THE LOOKDEV PAGE AND THE FIXTURES SHALL be built only into drafts builds"
- SC-002: "refuses 100% of a fixture set with one known-bad case per rule", and "accepts 100% of the known-good set"

Not yet, and where each comes:

- The site builds from the bundle, with the first room files: T096 (the plugin, on `feat/004-us1-composition`) and T100.
- The copy-of-data test, FR-006: T101.
- The scan over committed data, FR-007: T107.
- The freshness checks in `make test`, FR-013 and FR-014: T102. The generated files and `room:generate`: T108.
- The lookdev page and its fixtures, drafts only (FR-066): User Story 3, on `feat/004-us3-lookdev`.

## Constitution check

| Principle | Touched? | How it complies |
|---|---|---|
| I. Data-Local by Default | yes | No new flow, and no byte newly leaves the visitor's device. `src/room/framing.ts` now calls the kernel's framing (see Cost and data-flow impact). No font and no CSP change. |
| II. Production-Grade or Not Shipped | yes | Tests first (RED above), with the exceptions said plainly above. $0 at run time. No endpoint, so no span or panel is due. |
| III. Intent Before Spec, Spec Before Code, Humans Merge | yes | tasks.md T059 to T086. Departures are recorded in plan.md §10, in the commits that make them, except the readings listed under Backlog and Open problems, which live in code comments or the reports only. This note is T086's. |
| IV. Least Privilege for Humans and Agents Alike | yes | No permission, sandbox domain, or human-only path changes. The diff touches none of them. |
| V. Cost Is a First-Class Signal | yes | No model call. $0 at run time. |
| VI. Build in Public, Including Failures | yes | The RED and GREEN runs, the late tests, and every review finding are recorded here. |
| VII. Own the Whole Product — and Say Exactly What You Owned | no | Nothing about the Author's work or role changes. |
| VIII. Honest AI | no | Nothing the twin says changes. No room text is committed on this branch. |

## Security and agent governance

Nothing under `.claude/`, `tools/gates/`, `REVIEW.md`, `CLAUDE.md`, `.specify/memory/constitution.md`, `assets/policy/`, or `evals/agent-config/` changes. The reviewers wrote none of this branch. Each review session was read-only. No secret, no new egress, and no new domain or permission. The gitleaks run is under Verification.

## Cost and data-flow impact

**Cost:** $0 at run time. No model call, endpoint, or runtime path is added. The site's client bundle gains `compose/framing.ts`, the camera's framing math, through `src/room/framing.ts`.

**Data flow:** no new flow. No byte newly leaves the visitor's device. `docs/data-flow-disclosure.md` is not in the diff. No font, CSP, nginx, or index file changes.

**Runtime behaviour:** one runtime file changes. [src/room/framing.ts](../../apps/web/src/room/framing.ts) now calls the kernel's `framing(aspect, boxes)`. The room's 3D scene imports it for `LAYOUT`, `LABEL_LIFT`, and `framing` ([scene.ts](../../apps/web/src/room/scene.ts)). The camera's algorithm moved to the kernel. [framing.test.ts](../../apps/web/test/room/framing.test.ts) holds the camera at the six aspects to the numbers spec 002's code gave before the move. The only other changed file under `src/` that existed before is `content.d.ts`, which holds types only. The review's cost line says "no runtime path changed, since the plugin isn't wired yet." That is true of the plugin, but it does not cover `framing.ts`. I judge that the data-flow disclosure and `docs/how-we-build/` need no edit, since no byte, flow, or pinned output changes. The Author should confirm that (For the Author, item 6).

## Review

**Verdict: no blocker.** Four reviewers covered four slices: core, words, models, and outputs. Each worked read-only. A skeptic checked each important finding. The result: 7 important and confirmed, 2 refuted to nits, 13 nits.

Some findings were checked by reading only. The bash gate refused the read-only role's probes. The review says so for words-2, words-4, and models-1. For models-1, the finder says it "reproduced this in memory", and its skeptic says "I traced it by hand". The outputs slice ran its findings 1 to 3 on fixture inputs.

| Finding | Status after the skeptic | What was done | Commits (RED, then GREEN) |
|---|---|---|---|
| core-1: an empty drawing composes clean | refuted to nit | RV1 refuses `primitives: []` (`bad/RV1-empty`). Unpainted primitives and stand-in sizes of 0 stay allowed, as §4.1 and §4.2 allow. Recorded in §10. | 35a3e37, 3444378 |
| core-2: an entry named `constructor` or `__proto__` throws | nit | Entry names are looked up in Maps, so such names give RD5. | 40f3780, d78e138 |
| core-3: a file, link, or empty folder where a data folder belongs | nit | RD5 for each. Recorded in §10. | 61bd28f, fc89055 |
| core-4: a look's ink colour checked only in the scene's look | nit | RI4 checks each look's `outlines.color` in its own palette. Recorded in §10. | 71390f9, 974c63a |
| words-1: a core inside another selectable's union | important, confirmed | RG6 refuses it. Recorded in §10. | 92185b6, 4ee96e5 |
| words-2: the plug's claims don't force `local` and `cloud` | important, confirmed | RS2 refuses claims that give no pose `local`, or none `cloud`. The other branch, refusing a claimless switch, isn't taken, since §5.4's `default` row and T101's data-only proof need such a switch. Recorded in §10. | 68966da, 03795a9 |
| words-3: counter regions not checked against the turn-cost readings | important, confirmed | RT8 checks every reading of turn-cost §5 against the counter grid. The counter's label isn't held to the grid. Recorded in §10. | 86c90ff, e48ee03; 4473ad8, f97b151 |
| words-4: a hyphenated surname ID passes RT2 | refuted to nit | Fixed anyway: RT2 reads map keys and ID-shaped strings a second time, with `-` and `.` as spaces. Recorded in §10. | 5bd72d6, 1da0730 |
| words-5: a neon grid holds one row, so two `ui` keys fail | nit | Settled by `feat/004-us1-composition`'s data (a face of its own for the second line), recorded in §10 there. | none |
| words-6: the cable's rest clamp puts the tube in the surface | nit | The clamp lifts the centreline by the tube's radius. | 1906ec6, d4246d3 |
| words-7: `smallestCapPx` measures a point behind the camera | nit | Returns null at or behind the near plane. | 560f1a9, 53fc3af |
| words-8: RS5 compares poses only on the same anchor | nit | RS5 compares poses where the world places them. Recorded in §10. | ab376a1, 5654de7 |
| words-9: RT4 and RT5 pass no verb to `checkLine` | nit | Backlog. | none |
| models-1: a negative sparse offset throws | important, confirmed | RX2 refuses a negative sparse offset before its view. A sweep now covers negative, huge, and fractional numbers. | a3edac1, e1da873 |
| models-2: figure budgets counted twice in RK3 | nit | Fixed with outputs-3. | 210d602, 5739aeb |
| models-3: an unreadable figure model counts as 0 | nit | Counts 0, with a note in the report. Fixed with outputs-3. | 210d602, 5739aeb |
| outputs-1: `config/room-topics.yaml` in a form Prettier rewrites | important, confirmed | `corpus` as a block list, and `"` as `\x22`. Recorded in §10. | 3340987, 09db843 |
| outputs-2: a set switch piece's model not in the 3D part | important, confirmed | `switches[].model`, after `cable`. Recorded in §10. `room-bundle.md` §3.2 and `data-model.md` §10.2 don't list it yet. | 7280016, f6bee53 |
| outputs-3: the report's texture total isn't RK3's sum | important, confirmed | The report prints RK3's own total, through `sceneTextureTotal`. Whether a figure's catalog budget counts is for the Author. Recorded in §10. | 210d602, 5739aeb |
| outputs-4: the photo guide's fixed words are natural IDs | nit | Backlog. Moot with the IDs User Story 1 chose. | none |
| outputs-5: a card's row shows gzip-9 bytes the file isn't served as | nit | The row shows the plain length, "as stored". Recorded in §10. | 9c4a438, 286f4d3 |
| outputs-6: `screen_css` [0, 0] for a face behind a reference camera | nit | `screen_css` is the face's `px`. Recorded in §10. | 03619b1, 524ce65 |

**Changed assertions in the fixes, and the contract text that justified each.**

- **fix1, `bundle.test.ts`**, "binds each face in placement order with its regions' grids and sources." The panel's expected regions change. The word region goes from [0,0,1,0.5] at 10 characters to [0,0,0.32,0.45] at 10. The call region goes from [0,0.5,0.5,0.5] at 6 to [0,0.5,1,0.5] at 24. The visit region goes from [0.5,0.5,0.5,0.5] at 6 to [0.32,0,0.68,0.4] at 24. The justification is [turn-cost.md §5](../../specs/004-room-composition/contracts/turn-cost.md): "The neon renderer's counter regions are sized for the longest readings below $100: "cost unavailable" and `at least $99.999999 est.`. The compositor checks the grid (rule family RT, [room-data-files.md](../../specs/004-room-composition/contracts/room-data-files.md))." A 6-character counter holds neither reading.
- **fix1, `switches.test.ts`**, "never dips below the rest plane, so a cable lying on a surface lies on it." The flat run's expected height changes from 0.75 to 0.754. The clamp threshold and the clamped height in the sagging run change with it (radius 0.004 times scale 1). The justification is [room-data-files.md §5.4](../../specs/004-room-composition/contracts/room-data-files.md): "whose plane the run never dips below, so a lead lying on the desk lies on it." The fix's own words: "A centreline on the plane sinks half the tube into the desk."
- **fix2, `budgets.test.ts`**, "adds each piece the scene places once, by its budget, the switch's piece among them." It is renamed "... among them and the figures' not". Its PLACED table loses fx-twin and fx-visitor, 349,525 each, so `memory.pieces` drops by 699,050, from 21,058,898 to 20,359,848. The justification is [plain-model-fit.md §8.2](../../specs/004-room-composition/contracts/plain-model-fit.md): "the piece's budgeted `texture_bytes`, which a set model never exceeds (RK2)." A figure's piece has no model for that budget to bound, since RI8 forbids one. The figures are counted once, by their measured models.
- **fix2, `bundle.test.ts`**, "holds the switches with their poses and cable, the look without its notes, the figures, and the hand-off." `scene.switches[0]` gains `model: null`, since the known-good set's plug is a stand-in. The justification is [room-bundle.md §3.4](../../specs/004-room-composition/contracts/room-bundle.md): "each catalog `model` a placement or pose shows". The old `toEqual` held the switch to having no model field, which was the defect.

## Backlog

- **words-5** (nit). A neon grid is one row, so RT8 refuses a region whose `ui` list holds two keys. Settled on `feat/004-us1-composition`, the branch after this one: T100's data puts the sign's second line on a face of its own, and plan.md §10 there records it as a departure from data-model.md §4.3, R-03's three faces, and T100's text.
- **words-9** (nit). RT4 and RT5 call `checkLine` with no verb, so C4's bar never applies to room words. The review's two ways out: derive C4's bar from an ownership verb in the line's text, or record the verb-less reading in contracts §13.5.
- **outputs-4** (nit). The photo guide's fixed text holds words that are the natural IDs for T095's pieces, so the committed-tree scan would hit `orders.ts`. It is moot with the IDs User Story 1 chose.
- **core-1, if the Author wants it** (refuted to nit). Refusing an unpainted drawing and stand-ins of size 0 is a contract amendment first, per the review.
- **words-4's hardening** (refuted to nit). After publication, once `full_name` is filled, an image built without the denylist would let a hyphenated surname ID pass RT2. The review puts this in the backlog as hardening for spec 002's shared matcher.
- **feat/004-setup's Backlog** still stands on this branch, unchanged. It covers the licences' line endings, R-58's known gap, and the pre-existing items.

## Plan §10 departures recorded on this branch

Listed by task. Each is in [plan.md §10](../../specs/004-room-composition/plan.md#10-departures-from-this-plan) on this branch. The entries for T003 and T004 are in `feat/004-setup`'s note.

| Task | Departure, in brief |
|---|---|
| T061, T071 | The smallest landscape stage is 304 × 208, not 326 × 208. `room.css` gives it at 568 × 320. The 2D scale is unchanged at 0.95. |
| T065, T078 | `checks/family.ts` and `test/helpers/room-fixtures.ts` are modules the Project Structure doesn't name. |
| T076, T077 | A constraint another family's rule names is that rule's finding, reported as the file is read, not as RD3. |
| T075, T067 | `build/room/policy.ts` is a module the Project Structure doesn't name. `RoomPolicy` gains `caps_block`, `caps_problems`, and `full_name`. |
| T075 | `apps/web/room/scene.yaml` and `ui-words.yaml` are required. A tree without either is RD3. |
| T064 | Python 3.12's gzip header differs from pako's (OS byte 3, not 255). Lengths and trailers are compared, and only the TypeScript test checks the header. |
| T073 | `src/room/glb/pako.d.ts` declares only the call made. No `@types/pako` is added. |
| T074 | `checkLine`'s tests sit in spec 002's `citations.test.ts`. `lineContext` is exported. |
| T079 | `typefaces.test.ts` is a new file. `pdf.ts` splits `parseFontsLock(text)` out of `readFontsLock`. |
| T078, T065 | `geometry.test.ts` is a new file: RG's measures, on the fixtures. |
| T078 | RG framed every placement by its expected bounds. Retired by the one production framing entry below. |
| T078, T066 | RT's additions to the kernel and `content.ts`: the typing rate, 60 characters a second, in `layout.ts`; `treeLineContext`; advance widths and a per-font measure cache in `typefaces.ts`; RT2 to RT5 take the Author's name from the resume source's room name. |
| T080, T081, T068 | The outputs' tests and helper (`bundle`, `orders`, `report`, `room-models.ts`). `ComposeResult` gains `cards`. `emit` takes the tree and RT2's `printable`. |
| T080, T081 | Readings the outputs make: a pose is `<switch>.<pose>` in `load_order`; placeholders hold while a figure has no model; a 2D stand-in sits at its frame box's farthest depth; work orders name the caps' source as main or FR-053's figures. |
| T082, T069 | The source scan reads its IDs through the loader (`namespaceIds`), not `compose()`'s outputs. On this branch those outputs are `emit`'s stub. |
| T082, T069 | The scan never hits inside a token the reserved prefix `fx-` begins. This departs from §16's "There is no allowlist." |
| T078, T080, T081 | One production framing. RG frames a set model by its measured bounds, and RK3, the bundle, and the report share its numbers. |
| T083, T069 | `plugin.test.ts`, `vite-plugin.ts`, and two readings of `dist.test.ts`. |
| T083 | `cli.test.ts` is a new file. The modes: `room:generate` composes lenient, `room:check` strict with drafts, `room:report` strict. A stale file prints as `FR-013`. |
| T085, core-3 | A data folder's place holding a file, a link, or an empty folder is RD5. |
| T085, core-4 | RI4 holds every look's `outlines.color` to that look's own palette. |
| T085, core-1 | RV1 refuses a drawing with no primitive. |
| T085, words-8 | RS5 compares two poses where the world places them. |
| T085, words-2 | RS2 refuses claims that give no pose `local`, or none `cloud`. A switch with no claims and a `default` stays allowed. |
| T085, words-1 | RG6 refuses a core over another selectable's union. |
| T085, words-4 | RT2 reads a map key, and an ID-shaped string, a second time with `-` and `.` as spaces. |
| T085, words-3 | RT8 holds a turn-cost counter to its readings. The label isn't held to the grid. The known-good neon panel widens to 1.5 m. |
| T085, outputs-1 | `config/room-topics.yaml` is in the form Prettier writes: `corpus` as a block list, and `"` as `\x22`. |
| T085, outputs-2 | `switches[]` gains `model`, the switch piece's model, after `cable`. |
| T085, models-2, models-3, outputs-3 | RK3 counts a figure once, by its measured model. An unreadable figure model counts 0, with a note. The report prints RK3's own total. |
| T085, outputs-5 | A card's row reads "as stored", not "gzip-9 bytes". |
| T085, outputs-6 | `screen_css` is the face's `px` for a face behind a reference camera, not `[0, 0]`. |

## Stale-file notes the agents left

- `/tmp/claude-1000/later-wip-004-us1` and `/tmp/claude-1000/later-wip-004-us1data`. Git-archive copies, made to check later room data against this compositor. The bash gate refused a recursive delete outside the workspace, and the agent did not try another way (`fix1.json`). They stay until WSL's next restart clears `/tmp`.
- `/tmp/claude-1000/probe-policy-MnrDw4`. A scratch probe folder with one 8-byte `content-approvals.json`, holding "not json". The bash gate refused its removal (`stagec-004-plugin.json`). It is harmless, and `/tmp` is wiped at WSL restart.
- An auto-gc warning from a `refs/replace` placeholder. It comes from the repository's own `.git`, not from this branch. It is harmless.

## Open problems

The agents' reports raised these. None is fixed on this branch. One line each.

1. The four `test_compose_policy.py` failures remain until spec 002's web patch lands. They are pre-existing, as feat/004-setup's note records.
2. RD findings are formatted before RT2's walk, so a printable data map key in an RD path is printed unvetted (`core-report.json`).
3. Work orders print the cap values. A committed order can still differ between a checkout and the gate's export, where the export's copy can lag main. §10 records only that the source isn't named (`stageb-004-emit.json`).
4. The report and RK3 can frame differently when a non-lenient finding sits on a catalog model entry, such as RI7 on `records.json`. That build's outputs aren't used (`fix2.json`).
5. emit's set models come from the findings, while RG and RK take theirs from `modelChecks`. They agree in every build whose outputs are used (`stagec-004-unify.json`).
6. The outputs-6 test's fixtures put the desktop and phone reference cameras at one position, so its face is behind both. A face behind one camera isn't built on these fixtures (`fix2.json`).
7. `room-bundle.md` §3.2 and `data-model.md` §10.2 don't list `switches[].model` yet (`fix2.json`).
8. The stand-in shape readings in `rg.ts` were to match emit's stand-in builder. The sources record no comparison (`stageb-004-rgrs.json`).
9. RS4's tie order, RS5's distance and angle measures, and RG8's measure are readings in code comments, not in §10 (`stageb-004-rgrs.json`).
10. T107's committed-tree scan passes vacuously until T100's data lands, unless it checks that the ID list isn't empty (`stageb-004-scan.json`).
11. The vitest global setup builds the site twice on every run, about 2 s. The drafts build has no reader until T093 and T121 (`stagec-004-plugin.json`).
12. `room:check` exits 1 until T100 and T108 land the first data. That is expected (`stagec-004-plugin.json`).
13. Later branches' data must compose under RT and RV, which exist only on this branch until it merges (`stageb-004-rtrv.json`).
14. `emit.ts` is about 1,500 lines and stays whole. Splitting it would be another Project Structure departure (`stageb-004-emit.json`).
15. Carried to later tasks. T170's pick test (User Story 7) may measure through `pickProblems` and miss the union gap (words-1). T160's runtime fallback keys on the case that claims `local` (words-2). These are the review's "Not handled elsewhere".

## Verification

`make check ENGINE_MODE=none-yet`, run in `/tmp/claude-1000/wt-004-r` on `feat/004-foundation` at b6a3cf7, the tip before this note. Result: 7 PASS, 1 SKIP (`image`, no agents' engine yet), 2 PLANNED (`content-check`, `matrix`), and 3 FAIL, each pre-existing: `toolchain-check` (this machine's Claude Code drift from its pin), `policy` (spec 002's unpinned web image), and `test`, whose only failures are the four `test_compose_policy.py` tests, until spec 002's web patch; inside it the web workspace passes 51 files and 1399 tests, and the gateway 789. The `__pycache__` folders that run wrote were removed before the gitleaks scan. Its whole output:

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
make[1]: *** [Makefile:141: toolchain-check] Error 1
-> FAIL toolchain-check
== policy
python3 -I -B -X pycache_prefix=/dev/null tools/gates/compose_policy.py
FAIL deploy/compose.yaml service web: image: h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}: not pinned by digest (repository:tag@sha256:...)
compose policy: 1 refusal(s) (deploy/compose.yaml with 3 env files, the Dockerfiles, the env-file placement, .devcontainer, .npmrc)
make[1]: *** [Makefile:162: policy] Error 1
-> FAIL policy
== validate-config
npm run --silent -w services/gateway validate-config -- --root "/tmp/claude-1000/wt-004-r"
validate-config: 0 errors, 0 notes
-> PASS validate-config
== lint
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
291 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/scripts/aws-login.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh redteam/forbidden-actions.sh tools/gates/install-tools.sh tools/gates/secrets.sh
-> PASS lint
== test
python3 -I -B -X pycache_prefix=/dev/null corpus/tools/check_corpus.py
corpus-check: OK — 20 slots, 4 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems
npm test --workspaces --if-present

> @h4reet/gateway@0.1.0 test
> vitest run


 RUN  v5.0.3 /tmp/claude-1000/wt-004-r/services/gateway


 Test Files  51 passed (51)
      Tests  789 passed | 12 skipped (801)
   Start at  12:03:48
   Duration  58.07s (tests 95%, import 3%, transform 2%)


> @h4reet/web@0.1.0 test
> vitest run


 RUN  v5.0.3 /tmp/claude-1000/wt-004-r/apps/web


 Test Files  51 passed (51)
      Tests  1399 passed (1399)
   Start at  12:04:50
   Duration  12.63s (tests 70%, import 18%, transform 12%)

pytest -q -p no:cacheprovider --import-mode=importlib corpus/tools evals redteam tools/gates deploy/scripts deploy/agents-engine scripts
........................................................................ [  2%]
........................................................................ [  5%]
........................................................................ [  8%]
........................................................................ [ 10%]
........................................................................ [ 13%]
........................................................................ [ 16%]
........................................................................ [ 19%]
........................................................................ [ 21%]
........................................................................ [ 24%]
........................................................................ [ 27%]
.........................................................F..........FFF. [ 29%]
........................................................................ [ 32%]
........................................................................ [ 35%]
........................................................................ [ 38%]
........................................................................ [ 40%]
........................................................................ [ 43%]
........................................................................ [ 46%]
........................................................................ [ 49%]
........................................................................ [ 51%]
........................................................................ [ 54%]
........................................................................ [ 57%]
........................................................................ [ 59%]
........................................................................ [ 62%]
........................................................................ [ 65%]
........................................................................ [ 68%]
........................................................................ [ 70%]
........................................................................ [ 73%]
........................................................................ [ 76%]
........................................................................ [ 79%]
........................................................................ [ 81%]
........................................................................ [ 84%]
........................................................................ [ 87%]
........................................................................ [ 89%]
........................................................................ [ 92%]
........................................................................ [ 95%]
........................................................................ [ 98%]
.................................................                        [100%]
=================================== FAILURES ===================================
____________________ test_the_breach_probe_meets_the_policy ____________________

    def test_the_breach_probe_meets_the_policy() -> None:
        """The probe (tasks.md T144): built from this tree on the pinned base:python, on internal alone, and disclosed."""
        model = real_model()
        lock = cp.parse_lock(REPO / cp.LOCK_FILE)
        assert cp.check_service(PROBE, model["services"][PROBE], model, lock, REPO) == []
        disclosed = cp.disclosed_services(REPO / cp.DISCLOSURE_FILE)
        assert PROBE in disclosed
        # The policy requires its row, as every service's (FR-040).
        found = cp.check_model(model, lock, REPO, disclosed - {PROBE})
>       assert [(f.where, f.rule) for f in found if not f.planned] == [
            (f"{cp.COMPOSE_FILE} service {PROBE}", "disclosure")
        ]
E       AssertionError: assert [('deploy/com...'disclosure')] == [('deploy/com...'disclosure')]
E         
E         At index 0 diff: ('deploy/compose.yaml service web', 'image') != ('deploy/compose.yaml service breach-probe', 'disclosure')
E         Left contains one more item: ('deploy/compose.yaml service breach-probe', 'disclosure')
E         Use -v to get more diff

tools/gates/test/test_compose_policy.py:894: AssertionError
_________________ test_the_real_compose_file_passes_as_written _________________

    def test_the_real_compose_file_passes_as_written() -> None:
        """The raw file, through PyYAML (short-syntax ports, anchors), meets every compose rule too."""
        model = yaml.safe_load((REPO / cp.COMPOSE_FILE).read_text(encoding="utf-8"))
        lock = cp.parse_lock(REPO / cp.LOCK_FILE)
        disclosed = cp.disclosed_services(REPO / cp.DISCLOSURE_FILE)
        found = cp.check_model(model, lock, REPO, disclosed)
>       assert [f for f in found if not f.planned] == []
E       AssertionError: assert [Finding(wher...sha256:...)')] == []
E         
E         Left contains one more item: Finding(where='deploy/compose.yaml service web', rule='image', detail='h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}: not pinned by digest (repository:tag@sha256:...)')
E         Use -v to get more diff

tools/gates/test/test_compose_policy.py:951: AssertionError
___________________________ test_the_real_files_pass ___________________________

tree = PosixPath('/tmp/claude-1000/pytest-of-h4reet/pytest-25/test_the_real_files_pass0')
capsys = <_pytest.capture.CaptureFixture object at 0x7704e564e3f0>

    @needs_compose
    def test_the_real_files_pass(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
>       assert cp.run(tree) == 0
E       AssertionError: assert 1 == 0
E        +  where 1 = <function run at 0x7704e651ee80>(PosixPath('/tmp/claude-1000/pytest-of-h4reet/pytest-25/test_the_real_files_pass0'))
E        +    where <function run at 0x7704e651ee80> = cp.run

tools/gates/test/test_compose_policy.py:965: AssertionError
----------------------------- Captured stdout call -----------------------------
FAIL deploy/compose.yaml service web: image: h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}: not pinned by digest (repository:tag@sha256:...)
compose policy: 1 refusal(s) (deploy/compose.yaml with 3 env files, the Dockerfiles, the env-file placement, .devcontainer, .npmrc)
___________________________ test_end_to_end_refusals ___________________________

tree = PosixPath('/tmp/claude-1000/pytest-of-h4reet/pytest-25/test_end_to_end_refusals0')
capsys = <_pytest.capture.CaptureFixture object at 0x7704e564d190>

    @needs_compose
    def test_end_to_end_refusals(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
        compose = tree / cp.COMPOSE_FILE
        # gateway-state's own networks line, the first after its name: it alone joins egress below.
        head, name, tail = compose.read_text(encoding="utf-8").partition(
            "  gateway-state:\n"
        )
        assert name and "networks: [internal]\n" in tail
        compose.write_text(
            head
            + name
            + tail.replace("networks: [internal]\n", "networks: [internal, egress]\n", 1),
            encoding="utf-8",
        )
        write(tree / "deploy/stray.env", "A=1\n")
        assert cp.run(tree) == 1
        out = capsys.readouterr().out
        assert (
            "FAIL deploy/compose.yaml service gateway-state: networks: only gateway joins egress"
            in out
        )
        assert "FAIL deploy/stray.env: env file" in out
>       assert "compose policy: 2 refusal(s)" in out
E       assert 'compose policy: 2 refusal(s)' in "FAIL deploy/compose.yaml service gateway-state: networks: only gateway joins egress, the stack's one route out (FR-04... 3 refusal(s) (deploy/compose.yaml with 3 env files, the Dockerfiles, the env-file placement, .devcontainer, .npmrc)\n"

tools/gates/test/test_compose_policy.py:996: AssertionError
=========================== short test summary info ============================
FAILED tools/gates/test/test_compose_policy.py::test_the_breach_probe_meets_the_policy
FAILED tools/gates/test/test_compose_policy.py::test_the_real_compose_file_passes_as_written
FAILED tools/gates/test/test_compose_policy.py::test_the_real_files_pass - As...
FAILED tools/gates/test/test_compose_policy.py::test_end_to_end_refusals - as...
4 failed, 2637 passed in 200.43s (0:03:20)
make[1]: *** [Makefile:234: test] Error 1
-> FAIL test
== content-check
PLANNED (T080): tools/gates/content_check.py arrives with the approvals patch
-> PLANNED content-check (PLANNED (T080): tools/gates/content_check.py arrives with the approvals patch)
== secrets
bash tools/gates/secrets.sh
secrets: gitleaks with /home/h4reet/h4reet-ai/h4reet-ai/.gitleaks.toml, over /tmp/claude-1000/wt-004-r
== gitleaks: unstaged changes
12:08PM INF 0 commits scanned.
12:08PM INF scanned ~0 bytes (0) in 26.3ms
12:08PM INF no leaks found
-> PASS unstaged changes
== gitleaks: staged changes
12:08PM INF 0 commits scanned.
12:08PM INF scanned ~0 bytes (0) in 20.7ms
12:08PM INF no leaks found
-> PASS staged changes
== gitleaks: 209 commits since main (58bd2327212e..HEAD)
12:08PM INF 209 commits scanned.
12:08PM INF scanned ~5231675 bytes (5.23 MB) in 343ms
12:08PM INF no leaks found
-> PASS 209 commits since main (58bd2327212e..HEAD)
secrets: PASS (unstaged changes, staged changes, 209 commits since main)
-> PASS secrets
== evals
python3 -I -B -X pycache_prefix=/dev/null evals/run.py --suite product --adapter ${ADAPTER:-fake} $([ "${ADAPTER:-}" = local ] && echo --stack prod)
PASS  hello-fake
evals product (fake): 1 passed, 0 failed
python3 -I -B -X pycache_prefix=/dev/null evals/run.py --suite narration --adapter fake
PASS  narration-agent-watchdog-engineer
PASS  narration-agent-watchdog-non-engineer
PASS  narration-ai-strategy-engineer
PASS  narration-ai-strategy-non-engineer
PASS  narration-change-management-engineer
PASS  narration-change-management-non-engineer
PASS  narration-cht-agent-data-layer-engineer
PASS  narration-cht-agent-data-layer-non-engineer
PASS  narration-cht-agent-engineer
PASS  narration-cht-agent-non-engineer
PASS  narration-cht-codebase-engineer
PASS  narration-cht-codebase-non-engineer
PASS  narration-cht-docker-architecture-engineer
PASS  narration-cht-docker-architecture-non-engineer
PASS  narration-cht-skills-engineer
PASS  narration-cht-skills-non-engineer
PASS  narration-claude-medic-aws-engineer
PASS  narration-claude-medic-aws-non-engineer
PASS  narration-kenya-localization-engineer
PASS  narration-kenya-localization-non-engineer
PASS  narration-national-benchmarking-engineer
PASS  narration-national-benchmarking-non-engineer
PASS  narration-no-code-configuration-engineer
PASS  narration-no-code-configuration-non-engineer
PASS  narration-other-deployments-engineer
PASS  narration-other-deployments-non-engineer
PASS  narration-smart-task-prioritization-engineer
PASS  narration-smart-task-prioritization-non-engineer
PASS  narration-voice-for-cht-engineer
PASS  narration-voice-for-cht-non-engineer
evals narration (fake): 30 passed, 0 failed
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
PASS  every relative link resolves: 1300 links in 141 files
PASS  README.md links the ADR index (docs/adr/)
PASS  the ADR index links every ADR file: 20 of 20
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 1300 relative links in 141 files
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
PLANNED     protected-paths.sh    assets/policy/content-approvals.json
PLANNED     protected-paths.sh    assets/policy/resume-header.json
PLANNED     protected-paths.sh    apps/../assets/policy/content-approvals.json
PLANNED     protected-paths.sh    ./assets//policy/resume-header.json
PLANNED     protected-paths.sh    Edit in a linked worktree: assets/policy/content-approvals.json
KNOWN GAP   bash-gate.sh          a shell write in a linked worktree: assets/policy/content-approvals.json
--- stage S: the sandbox (SANDBOX_RUNTIME=1, .git/hooks unwritable) ---
NOTE        stage-S-unwritable    ~/.local/state/h4reet: no mask of its own, but it sits on a read-only mount (covered read-only /)
PLANNED     stage-S-unwritable    assets/policy/content-approvals.json has no mask yet: open writable /home/h4reet/h4reet-ai/h4reet-ai (its patch denies it)
PLANNED     stage-S-unwritable    assets/policy/resume-header.json has no mask yet: open writable /home/h4reet/h4reet-ai/h4reet-ai (its patch denies it)
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
PLANNED     settings.json         the content policy files are write-denied, by the sandbox and by Edit denies (spec 002, T016)
PLANNED (T016): 8 content-policy rows wait for the approvals patch, which protects assets/policy/content-approvals.json and resume-header.json
TOTALS      matrix                8 planned (reported, not failing), 1 skipped: stage S's SMTP row has no usable host
REQUIRED    matrix-required       every listed row ran
forbidden-actions (hook layer): 663 passed, 0 failed, 41 known gaps
-> PLANNED matrix (PLANNED (T016): 8 content-policy rows wait for the approvals patch, which protects assets/policy/content-approvals.json and resume-header.json)
== image
SKIP: no agents' engine yet: tasks.md T046
-> SKIP image (no agents' engine yet: tasks.md T046)

PASS     makefiles-check
PASS     githooks-check
FAIL     toolchain-check
FAIL     policy
PASS     validate-config
PASS     lint
FAIL     test
PLANNED  content-check  PLANNED (T080): tools/gates/content_check.py arrives with the approvals patch
PASS     secrets
PASS     evals
PASS     redteam
PLANNED  matrix  PLANNED (T016): 8 content-policy rows wait for the approvals patch, which protects assets/policy/content-approvals.json and resume-header.json
SKIP     image  no agents' engine yet: tasks.md T046
make check: 7 PASS, 1 SKIP, 2 PLANNED, 0 PENDING, 3 FAIL; failing: toolchain-check FAIL, policy FAIL, test FAIL
make: *** [Makefile:147: check] Error 1
```

`gitleaks dir` on the same tree, after that run:

```text
12:09PM INF scanned ~11410231 bytes (11.41 MB) in 566ms
12:09PM INF no leaks found
```

If `gitleaks dir` reports `.pyc` files under `__pycache__`, as feat/004-setup's run did, they are untracked, ignored files that the pytest run in `make test` writes. The pre-existing failures that feat/004-setup's Verification records are toolchain-check's Claude Code drift, policy's unpinned web image, and the four `test_compose_policy.py` tests.

## After the rebase (T087)

T087 adds here, after T058: `feat/004-foundation was <sha>`, the tip before the rebase, and the `make check ENGINE_MODE=none-yet` run after it. Nothing is recorded here yet.

## For the Author

1. **FR-070's first lookdev run: still open from feat/004-setup.** plan.md §10 on this branch reads "Not accepted yet: the Author decides before the morning runs". This branch doesn't change it. Decide it before T143 to T145, as feat/004-setup's note says, under its "For the Author" heading first.
2. **Figure budgets (outputs-3): your call.** The code counts a figure once, by its measured model, and not also by its catalog budget. The RK3 row in [plain-model-fit.md](../../specs/004-room-composition/contracts/plain-model-fit.md) says the total "adds, once for each piece the scene places". Keep the reading, which plan.md §10 records, or have the code count the figures' pieces again. The contract's words are unchanged either way.
3. **words-5: settled on the next branch.** `feat/004-us1-composition`'s data gives the neon sign's second line a face of its own, recorded in plan.md §10 there. Nothing to decide on this branch.
4. **core-1, optional.** If you want the hardening (refuse an unpainted drawing, and stand-in sizes of 0), it is a contract amendment first.
5. **CLAUDE.md (models-1).** The review proposes a line for "Things Claude gets wrong": "A parser that says it never throws gets fuzzed over every optional numeric field (negative, huge, fractional), not only the fields its clean fixtures hold." CLAUDE.md is yours. The review leaves it to you to take or leave.
6. **src/room/framing.ts.** The review's cost line doesn't cover this runtime file (see Cost and data-flow impact). Confirm that no disclosure or how-we-build edit is needed.

Decisions taken by recommendation, each easy to reverse (all in plan.md §10):

- The scan's `fx-` token rule. It departs from §16's "There is no allowlist."
- RT8's typing rate, 60 characters a second. The plan gives the 5-second limit, not the rate.
- The known-good neon panel widens to 1.5 m. The reference and 2D cameras and each face's cap height don't change. The framing camera moves at 246 of the 1727 supported stages, all narrow.
- `screen_css` is the face's `px` for a face behind a reference camera.
- RK3 rounds a canvas down.

Merging:

7. **Merge position.** Line R's second branch: after P-10 and `feat/004-setup`, per [plan.md §3](../../specs/004-room-composition/plan.md#3-the-order-of-work). The chain is setup, foundation, US1, US3 lookdev, US2, US7, US5, US6, US4 studio, US8, US9.
8. **T087's rebase.** After T058 merges `feat/004-setup`, record this branch's tip in this note, as `feat/004-foundation was <sha>`. Then rebase it onto `main`: `git rebase --onto refs/heads/main 9d326e2 feat/004-foundation`. Re-run `make check ENGINE_MODE=none-yet`, and append the record here. 9d326e2 is the commit this branch was cut from.
9. **The gate, from main's checkout.** Run `git diff main...feat/004-foundation`, then `tools/gates/gate feat/004-foundation`, with the engine up. Merge with the command the gate prints. Its shape is in the [merge-request README](README.md). The branch stays local until publication ([ADR 0013](../adr/0013-local-until-publication.md)).
10. **What your next `make up` does.** It builds the site with three more packages in the build stage, and with the framing change in the bundle. The image's policy label doesn't change, since no policy file changes on this branch.
