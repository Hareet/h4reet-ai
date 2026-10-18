# Implementation Plan: Studio Assets — The Studio's Outputs, Brought In Safely

**Branch**: `spec/003-studio-assets` (this plan; the work runs on one feature branch per task group, [§9](#9-order-of-work-risks-and-proof)) | **Date**: 2026-10-18 | **Spec**: [spec.md](spec.md)

**Status**: Planned on 2026-10-18 by the Author's direction of 2026-10-17, which relaxed the overnight rules for this spec: "Let's relax some of the overnight rules so that you can continue with intent 002 and intent 003? I think you can create the tasks and implement them and we can always go back later and re-do a task or requirement if we highlight a needed change". Every decision the Author would have been asked is taken by recommendation and listed in [research.md](research.md#decided-by-recommendation-revisit-any-time), to revisit at any time.

**Input**: `specs/003-studio-assets/spec.md`, clarified on 2026-10-18 (its Clarifications); spec 000 as merged on main at 58bd232; spec 001's draft plan (branch `spec/001-cloud-elevation`) and spec 002's spec (branch `spec/002-the-room`), neither implemented.

**Companions**: [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md). Where this plan and a contract disagree on an interface detail, the contract is right and this plan is fixed.

**Conventions**: spec 000's. **The Author's terminal**: commands only the Author runs. **Human-only**: changed only by the Author's hand; agents deliver patches in `docs/merge-requests/`.

## Summary

The studio's pipeline stays outside this repository, and only its outputs come in. This plan builds the gate they come through, before the first file arrives:
- **the sandbox's deny** on the studio's folders, and the human-only policy files (the license allowlist, the likeness approvals, the caps), in a first patch (§2);
- **the arrival check,** a standard-library Python program in the human-only gates. It parses every image and model file down to its chunks, admits only an allowlisted set of fields and one machine-readable mark, checks each file against its public record and the license allowlist, and requires the Author's approval, read from `main`, for every likeness and room file. It runs before each commit, over every commit of a branch in `make check` and the Author's gate, and over the whole history before the first push (§3);
- **the tools** that make a file pass (`scrub.py`) and render the credits from the records (`credits.py`), the ADRs, the withdrawal runbook, and the evaluation note's image folder (§4, §5);
- **the GPU window,** an operator command, a gauge, and a runbook (§6).

What visitors see, the assets loading on desktop and phone with their degraded modes, needs spec 001's site and spec 002's room, neither built yet. This plan designs it ([contracts/site-loading.md](contracts/site-loading.md)) and schedules it in a task group that waits for them (§7).

## Technical Context

**Language/Version**: Python 3.12, standard library only, for the arrival check, the scrubber, and the credits renderer (as spec 000's gates); TypeScript 6.0.3 on Node 24 for the gateway's studio-window endpoint, and later the site's loader; Bash for the hook and the matrix.

**Primary Dependencies**: none new. The arrival check uses `struct`, `zlib`, `json`, `hashlib`, `xml.etree.ElementTree`, and `subprocess` (for git). No exiftool, Pillow, or glTF library in the repository.

**Storage**: plain git. Assets under `assets/`, published images under `docs/research/images/`, each directory with `records.json` and `LICENSE.md`; the policy in `assets/policy/` (human-only).

**Testing**: pytest for the check, the scrubber, and the renderer, against image and model files the tests build at run time (a committed binary fixture would itself be refused outside the asset roots); vitest for the gateway's endpoint; the forbidden-action matrix for the new denies.

**Target Platform**: the Author's WSL host and the agents' sandbox, where the check runs; later, the edge and the visitors' browsers.

**Project Type**: governance tooling for a content pipeline, plus one gateway endpoint; the browser side waits.

**Performance Goals**: the arrival check reads a 10 MB GLB in under a second, so the pre-commit hook stays quick; the history scan stays within `publish-check`'s run.

**Constraints**: nothing from the studio's folders reaches an agent session (FR-003); the policy changes only by the Author's hand (FR-005); no file enters any commit unchecked (FR-004); no new dependency in a human-only gate.

**Scale/Scope**: Phase 2's first set is the twin, four visitor avatars, a handful of animations, and their stills and previews; the evaluation note's grids, at most 15 MB; a 500 MB history cap.

## Constitution Check

*GATE: passed before research and re-checked after design ([below](#constitution-check-post-design)).*

| Principle or standard | What spec 003 does | Verdict |
|---|---|---|
| I. Data-local by default | **Photos:** the Author's photos never enter the repository (FR-002), and agent sessions can't read them (FR-003, §2). **Visitors:** pre-generated avatars, no camera (FR-031). The degraded mode is designed before the happy path (§7, [contracts/site-loading.md](contracts/site-loading.md)). The bytes that leave a visitor's device are disclosed with their change (FR-040, §7) | PASS |
| II. Production-grade or not shipped | **Tests:** the check's fixture set (SC-001), built at run time. **Runbooks:** withdrawal (FR-041) and the GPU window (FR-035). **Telemetry:** the asset events and their panel, with the site (§7). **Cost:** sizes in every note (FR-038) | PASS |
| III. Intent → spec → code | The accepted intent is in the folder. The plan comes before code, under the Author's relaxed direction (Status line) | PASS |
| IV. Least privilege | **Denies before risks:** the first patch denies the studio's folders and protects the policy, before any photo is staged or any asset arrives (§2). **Nothing widened.** The check reads its policy from `main`, so a branch can't approve itself (R-05) | PASS |
| V. Cost | No model call from this repository. The GPU window keeps the twin inside its $2/day sub-budget, with no budget changed (FR-035). The studio's own model runs are outside the system, a reading the Clarifications confirm | PASS |
| VI. Build in public | Records, the allowlist, the approvals, and the credits are public. The studio's workflows, photos, and blinding key stay in the studio | PASS |
| VII. Own the whole product | Each record says which steps a model did and which the Author did by hand (FR-010) | PASS |
| VIII. Honest AI | The twin is disclosed as an AI-made likeness in every mode, by a visible line and a machine-readable mark (FR-034, R-03, R-11) | PASS |
| Prohibited without a human | The policy, the hook, the gate's code, and the denies are the Author's patches | PASS |
| Secrets and supply chain | No new dependency; the check is standard library | PASS |
| Local until publication (ADR 0013) | Carried from spec 000. ADR 0032 extends its pre-publication cleanup to assets (FR-041) | PASS, carried deviation |

Gate result: **PASS**.

## Project Structure

### Documentation (this feature)

```text
specs/003-studio-assets/
├── intent.md, spec.md, checklists/requirements.md
├── plan.md                    # this file
├── research.md                # decisions, and those taken by recommendation
├── data-model.md              # the record, the policy files, the check's result, the asset events, the GPU window
├── quickstart.md              # the Author's runs, per task group
├── contracts/
│   ├── arrival-check.md       # the command, where it runs, its rules and their IDs, its output
│   ├── asset-record.md        # records.json's schema
│   ├── site-loading.md        # the manifest, the loading order, the degraded modes (waits for specs 001 and 002)
│   ├── asset-events.md        # the browser's events, the relay's route, the panel (waits for spec 001)
│   └── gpu-window.md          # the operator command, the endpoint, the gauge, the panel
└── tasks.md                   # next: /speckit-tasks
```

### Source Code (repository root)

**[A]** agent-editable; **[P]** delivered in a patch the Author applies.

```text
assets/                               [A] new: twin/, visitors/<character>/, animations/<rig>/ (and room/ in Phase 3),
                                          each with records.json and LICENSE.md; README.md; CREDITS.md (rendered)
assets/policy/                        [P] new, human-only: licenses.json, approvals.json, caps.json
docs/research/images/2026-10-12-image-model-evaluation/   [A] new: LICENSE.md, records.json (empty until the runs)
tools/gates/arrival_check.py          [P] new: the arrival check (§3)
tools/gates/test/test_arrival_check.py, arrival_fixtures.py   [P] new: tests, with fixtures built at run time
tools/gates/gate, run_checks.py, publish_check.py      [P] changed: the arrival step, and the history scan
.claude/git-hooks/pre-commit          [P] changed: the arrival check after gitleaks
.claude/settings.json, .claude/hooks/protected-paths.sh   [P] changed: the studio's folders, assets/policy/**
REVIEW.md                             [P] changed: an "Arriving assets" pass (FR-017, FR-037)
tools/gates/matrix-required.txt       [P] changed: the new rows
redteam/forbidden-actions.sh          [A] changed: the rows
scripts/assets/scrub.py, credits.py   [A] new, with tests
Makefile                              [A] changed: arrival, assets-scrub, assets-credits, studio-window
services/gateway/src/routes/admin.ts  [A] changed: POST /admin/studio-window (§6)
scripts/operator.py                   [A] changed: the studio-window command
deploy/grafana/dashboards/h4-runtime.json   [A] changed: the studio-window annotation and its spend panel
docs/runbooks/asset-withdrawal.md, studio-gpu-window.md   [A] new
docs/adr/0010, 0030, 0031, 0032       [A] new: 0010 proposed; the others with the plan's approval
docs/data-flow-disclosure.md          [A] changed: row D1 (FR-040d); later V6 and the asset requests (FR-040a, b)
README.md                             [A] changed: the license line (FR-015)
```

**Structure decision.** The check is one program in `tools/gates/`, beside `publish_check.py`, so the hook, `make check`, the gate, and the history scan all run the same code from the main working tree. The tools that help a file pass are agent-editable and live in `scripts/assets/`: if they're wrong, the check refuses their output.

---

## 1. The boundary, restated as paths

| What | Where | Who writes |
|---|---|---|
| The studio's photos, unstripped outputs, workflows, and the blinding key | the studio's folders on the Author's machine, outside the repository | the studio; agents denied (FR-003) |
| Assets | `assets/<family>/` | the Author, or an agent from the Author's exported files; the check guards each commit |
| Published images | `docs/research/images/<note>/` | the same |
| Records | `records.json` in each of those directories | the same |
| The license allowlist, the approvals, the caps | `assets/policy/` | the Author only (FR-005) |

## 2. The guard patch, first (FR-003, FR-005)

`docs/merge-requests/<date>-feat-003-guards.patch`, applied before any other group, because the studio may already hold photos:
- **`.claude/settings.json`:** `denyRead` and `Read(...)` denies for the studio's folders, written as `<STUDIO_PHOTOS>`, `<STUDIO_OUTPUTS>`, `<STUDIO_WORKFLOWS>`, and `<STUDIO_BLINDING_KEY>`, which the Author replaces with the real paths before applying (R-07); `denyWrite` and `Edit(...)` on `assets/policy/**`.
- **`.claude/hooks/protected-paths.sh`:** `assets/policy/**`.
- **`assets/policy/licenses.json`** with no entries, **`approvals.json`** with no entries, and **`caps.json`** saying ADR 0010 isn't accepted ([data-model.md](data-model.md)).
- **`tools/gates/matrix-required.txt`** and the rows in `redteam/forbidden-actions.sh`: a read of each studio folder (stage S), an Edit and a write of each policy file (stage H).

## 3. The arrival check (FR-001, FR-002, FR-004, FR-006 to FR-020)

[contracts/arrival-check.md](contracts/arrival-check.md) holds the command, the rules with their IDs, and the output. In brief:
- **Inputs:** a list of files, or a commit range (`--range main..HEAD`, checking each commit's added and changed files as that commit had them), or `--staged`, or `--history`.
- **The policy, the caps, and the check's own code come from the main working tree** (R-05, R-06).
- **The rules,** each with an ID that every refusal names:
  - **A:** where a file may be (R-01, R-02; FR-001), and model weights anywhere;
  - **M:** metadata, by container (R-03; FR-002, FR-006), and the mark's exact packet (FR-034);
  - **B:** forbidden bytes anywhere in a file (R-03; FR-007);
  - **R:** the record: present, matching, complete, with no photo's metadata or path (R-04; FR-008, FR-010 to FR-012);
  - **L:** licenses on the allowlist, and evaluation-only models refused in asset directories (R-05; FR-013, FR-014);
  - **N:** the license notice in each directory (FR-015);
  - **P:** the Author's approval, by hash, read from `main`, for likeness, photo-derived, and room files (FR-016, FR-037);
  - **F:** ADR 0010's format and the caps (R-08; FR-018, FR-019);
  - **H:** the history total (FR-020);
  - **C:** the arms B and D caption in the note (R-09; FR-036).
- **Output:** one line per finding, `<rule> <path> [@<commit>]: <reason>`, and the size table (FR-038). It never prints the bytes it matched.
- **Where it runs:** the pre-commit hook, `make check`'s `arrival`, the Author's gate, and `make publish-check` (R-06).

The patch that brings it is group 2's. Its tests build their fixtures at run time: one passing file per format, and one failing file per rule.

## 4. Records, credits, and the tools that make a file pass

- **`scripts/assets/scrub.py`** (R-03): rewrites a file's container to the allowlist and adds the mark. The studio runs it, or an agent runs it on a file the Author exported from the studio.
- **`scripts/assets/credits.py`** (R-04): renders `assets/CREDITS.md` and `docs/research/images/CREDITS.md` from the records. The arrival check fails when they differ (FR-033's repository half, FR-010).
- **`REVIEW.md`'s "Arriving assets" pass** (a patch): the reviewer checks the records against the files, the art direction, and third-party content (FR-017, FR-037), and confirms that the approval exists on `main` for each file the check says needs one.
- **The license line** in the README, and `LICENSE.md` in each directory (FR-015).

## 5. The comparison's images (FR-036; User Story 5)

`docs/research/images/2026-10-12-image-model-evaluation/` gets its `LICENSE.md` and an empty `records.json`. The evaluation note is updated where the clarification settled what it left open:
- the media license is chosen, so the interim notice is the license's notice;
- the mark is the IPTC one, applied by `scrub.py`;
- the record table's rows become `records.json` entries, with the arm.

The arrival check's rule C reads the note for each arm-B or arm-D image's caption.

## 6. The studio's GPU window (FR-035; User Story 6)

[contracts/gpu-window.md](contracts/gpu-window.md). `make studio-window ENV=prod STATE=start|end REASON="…"`, the Author's, calls the operator CLI's new command:
- it records the window on the gateway (`POST /admin/studio-window`), with an audit row and the gauge `h4_studio_window`;
- it stops prod's model server at `start`, and at `end` restarts prod at its run file's commit and checks that hello answers locally.

The dashboard shows the window as an annotation and the fallback spend inside it. No budget or ceiling changes. The Author rehearses it once (SC-011, Heavy).

## 7. The site, waiting for specs 001 and 002 (FR-021 to FR-034, FR-038 to FR-040)

Designed here, built when spec 001's site (its task group 6) and spec 002's room exist:
- [contracts/site-loading.md](contracts/site-loading.md): the manifest of content-derived names, the capability check, the loading order, the retry and the still image, the frame-rate step-down, the 2D control, the credits link, and the AI line in every mode.
- [contracts/asset-events.md](contracts/asset-events.md): the browser's payload-free events, the relay's `POST /api/events`, the panel, and disclosure row V6.
- **Measurements:** on the reference phone and the mobile profile (R-13), SC-004 to SC-006; fault injection for SC-007; the network log for SC-009.

Until then, nothing in this spec is served to a visitor.

## 8. Telemetry, disclosure, and runbooks

- **Telemetry now:** the gauge `h4_studio_window` and its panel (§6). **With the site:** the asset events and their panel (FR-039), and the edge's transfer for the assets (FR-038).
- **Disclosure now:** row D1 gains that committed assets, the Author's likeness among them, reach Anthropic when an agent session reads them (FR-040d). A record that names a hosted service needs a disclosure row naming that service before the check passes (FR-040c, rule R). **With the site:** the asset requests (FR-040a) and the events (FR-040b).
- **Runbooks:** `asset-withdrawal.md` (FR-041: before publication, through ADR 0032's cleanup; after it, off the site within a day, with an incident note) and `studio-gpu-window.md` (FR-035).

## 9. Order of work, risks, and proof

**Task groups.** Each is a feature branch, stacked on the one before it (the first on the spec stack's tip, `spec/002-the-room`, which sits on this branch), and merged by the Author in order.

| # | Branch | What | Can it be built now? |
|---|---|---|---|
| 1 | `feat/003-guards` | §2's patch | **yes** |
| 2 | `feat/003-us1-arrival-check` | §3's patch (the check, the hook, the gate and publish-check steps), §4's tools and pass, ADR 0010 drafted, ADRs 0030 to 0032, the withdrawal runbook, row D1, the README's license line | **yes** |
| 3 | `feat/003-us5-comparison` | §5 | **yes** |
| 4 | `feat/003-us6-gpu-window` | §6 | **yes**; its rehearsal is the Author's (Heavy) |
| 5 | `feat/003-us2-us3-site` | §7 | **waits** for spec 001's site and relay, and spec 002's room |
| 6 | `feat/003-us7-room` | the room's assets through the intake (FR-037) | **waits** for spec 002's room, Phase 3 |
| 7 | `feat/003-close` | the success-criteria table | after group 5 for SC-004 to SC-010; groups 1 to 4 can close their own criteria first |

**Risks:**

| Risk | Mitigation |
|---|---|
| The studio's folders aren't where the patch's placeholders guess | The Author fills them in before applying; the matrix rows fail while a placeholder stays (R-07) |
| A container field the parsers don't know | Refused: the check admits only the listed chunks and properties (R-03) |
| The scrubber damages a file | It never re-encodes pixels, and the check reads its output; the tests round-trip each format |
| ADR 0010 changes the formats | The check grows with it; until it's accepted, avatars and animations are refused (FR-018) |
| A large GLB slows the pre-commit hook | The parser reads the JSON and walks chunks without decoding images' pixels; one measured in the tests |
| Specs 001 and 002 change the site's shape | §7 is a contract, not code; group 5 re-reads both before it starts |

**Proof.** [quickstart.md](quickstart.md) runs each group. Each group's note carries `make check`'s whole output, the reviewer's passes, and, for the patch groups, the patch's verification on a scratch worktree.

## 10. Requirement coverage

| Requirement | Where | Group |
|---|---|---|
| FR-001, FR-002 | §3 (rules A, M), FR-016's approval | 2 |
| FR-003 | §2 | 1 |
| FR-004 | §3, R-06 | 2 |
| FR-005 | §2, R-05 | 1 |
| FR-006, FR-007, FR-008 | §3 (rules M, B, R) | 2 |
| FR-009 | §3 (rules B, R), the approval, REVIEW.md's pass | 2 |
| FR-010, FR-011, FR-012 | §3 (rule R), R-04 | 2 |
| FR-013, FR-014 | §3 (rule L), R-05 | 1 (the file), 2 (the rule) |
| FR-015 | §3 (rule N), §4 | 2 |
| FR-016 | §3 (rule P), R-05 | 2 |
| FR-017 | REVIEW.md's pass | 2 |
| FR-018, FR-019 | §3 (rule F), R-08, R-12 | 2 |
| FR-020 | §3 (rule H) | 2 |
| FR-021 to FR-032 | §7 | 5 (waits) |
| FR-033 | §4 (the repository's credits), §7 (the site's link) | 2, 5 |
| FR-034 | §3 (the mark), R-11 (the line) | 2 (the mark), 5 (the line shown) |
| FR-035 | §6 | 4 |
| FR-036 | §5, §3 (rule C) | 3 |
| FR-037 | §3 (rule P), REVIEW.md's pass | 2 (the rules), 6 (the room's first files) |
| FR-038 | §3 (the size table), §7 (the dashboard) | 2, 5 |
| FR-039 | §7 | 5 |
| FR-040 | §8: (c) and (d) now, (a) and (b) with the site | 2, 5 |
| FR-041 | §8, ADR 0032 | 2 |
| SC-001, SC-002, SC-003 | §3 | 2, 3 |
| SC-004 to SC-009 | §7 | 5 |
| SC-010 | §4, §7 | 2, 5 |
| SC-011 | §6 | 4 |
| SC-012 | §3 (rule H), §7 | 2, 5 |

## Constitution Check (post-design)

- **No new violation.**
- **Principle IV is stronger than the spec asked in one place:** the check reads its policy and its own code from `main`, so a branch can neither approve its own files nor carry a weakened check.
- **Principle I's degraded modes** are designed now and built with the site, so the happy path can't ship first: the site's group (5) carries both.

Verdict: **PASS**.

## Complexity Tracking

| Choice | Why needed | Simpler alternative rejected because |
|---|---|---|
| Parsers for four containers in the standard library | FR-006 is an allowlist, and a human-only gate takes no new dependency | exiftool or Pillow: a large dependency in a human-only gate, and a denylist's answer |
| The policy read from `main` | A branch mustn't approve its own files (FR-005, FR-016) | Reading the branch's copy: the approval would travel with the file |
| Placeholders in the guard patch | The studio's paths are only known on the Author's machine | Denying whole drives breaks spec 000's disk checks |
| A waiting group for the site | Specs 001 and 002 build the site and the room | Building a separate site for the assets would be thrown away |
