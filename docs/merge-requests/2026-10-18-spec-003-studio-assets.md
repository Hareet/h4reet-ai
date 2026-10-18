# spec/003-studio-assets
Spec: specs/003-studio-assets/ · Intent: specs/003-studio-assets/intent.md (accepted 2026-10-17) · Written by: the spec-writer agent (the draft); the lead session (the intent's move, the checks, this note) · Date: 2026-10-18
Session: the spec-writer worked in `/tmp/claude-1000/wt-spec003` with no shell, writing under `specs/003-studio-assets/` only; the lead session committed · Repo hooks active: yes. The spec-writer's one refused write was `.specify/feature.json`, which is outside its scope and which git ignores.
Authorized by: the Author's acceptance of intents 002 and 003 on 2026-10-17 ("Yeah, they are accepted. We can always revise them later, but I am liking what you are putting out so trust the recommendations and keep going as far as we can!"), and the overnight plan agreed that evening: `/speckit-specify` for both, stopping at the clarify questions.

**Status: clarified, planned, tasked, and analyzed on 2026-10-18,** by the Author's direction of 2026-10-17 to continue with the recommended options (see "Clarify, 2026-10-18" below). No code yet: Phases 1 to 4 of tasks.md can be implemented now. The first draft's status, kept for the record: "a draft for `/speckit-clarify`. No plan and no code. Two `[NEEDS CLARIFICATION]` markers stay open on purpose, and eight recommended defaults wait for a yes."

## What's on this branch

It carries `intent/003-studio-assets`'s three commits, rebased onto main at 58bd232 (they were on an older main): the image-model evaluation plan (2026-10-12), its review fixes and note, and the intent's acceptance. Then this commit:
- **`specs/003-studio-assets/spec.md`**, a full specify pass (452 lines): seven user stories, FR-001 to FR-041, SC-001 to SC-012, Key Entities, Assumptions, Expected Cost Impact, a Constitution Check, and the open questions. A new first section, "Source: The Author's Words", quotes each source as written, with the reading beside it.
- **`specs/003-studio-assets/checklists/requirements.md`**: every item passes except "no markers remain".
- **The intent moved** to `specs/003-studio-assets/intent.md` with `git mv`, as `intent/README.md` step 2 asks ("`git mv` the intent into that folder as `intent.md` so the intent/spec pair travels together"). Its links to intents 000 and 002 now climb to `intent/`, and the evaluation plan's header names the new path.

**Stacking.** spec/002-the-room sits on top of this branch, so merge this one first. Main holds intent 002's draft at `intent/002-the-room.md`, so this branch's links to it resolve; spec/002 then moves intent 002 and repoints them. The branches `intent/002-the-room` and `intent/003-studio-assets` are fully contained in the two spec branches, so they need no merge of their own.

## The stories

| # | Story | Priority |
|---|---|---|
| 1 | Nothing enters the history that locates the Author or breaks a license (the arrival check) | P1 |
| 2 | When an asset can't load, or a phone can't hold the scene, the visit goes on | P1, before 3 because Principle I puts the degraded mode first |
| 3 | Visitors meet the twin and their chosen avatar, on desktop and phone | P1 |
| 4 | Anyone can see what made each asset, and that the twin's face is AI-made | P2 |
| 5 | The model comparison's images are published under the same rules | P2 |
| 6 | The studio borrows the GPU without surprising production | P3 |
| 7 | The room's assets come through the same intake | P3, Phase 3 |

## For the Author: `/speckit-clarify`

Two questions, each with a recommended option (the spec's "Open Questions for `/speckit-clarify`"):
1. **The media license (FR-015).** A (recommended): all rights reserved, with a notice that viewing and linking are welcome; it can be loosened later, while a Creative Commons grant can't be taken back. B: CC BY-NC-ND 4.0. C: all rights reserved for the likeness, CC BY-NC-ND 4.0 for the rest.
2. **Disclosing and marking the AI-made likeness (FR-034).** A (recommended): both a visible line in the twin's disclosure and one machine-readable mark per file (the IPTC digital source type for AI-generated media). B: the visible line only. C: the mark only. The evaluation plan needs this settled before its first run.

Eight confirmations, each a recommended default (a yes keeps it): the intake's scope and phasing; ADR 0010 before the studio's workflow; plain git with a 500 MB history cap; fetching only the chosen avatar, disclosed; payload-free asset events, disclosed; the budget and load-time defaults; extending ADR 0013's pre-publication cleanup to assets; and reading the studio's model runs as outside Principle V.

## Checks

- **Quotes:** each of the spec's 40 quoted passages of 25 characters or more was matched against the repository and the accepted intent 002. All 40 are word for word; one drops the source's bold markup ("Object and resume clicks are telemetry events, with no payloads.", intent 002's line 71).
- **Links:** `evals/docs_links.py`: 0 failed, 829 relative links in 88 files.
- **Format:** `ruff format --check` on the new Markdown: already formatted.
- **Secrets:** the commit's pre-commit scan.
- `make check` wasn't run: no gate reads `specs/003-studio-assets/` beyond the links check above, as spec 001's note found for its folder.

## Review

A `REVIEW.md` pass by an agent that didn't write the spec belongs after `/speckit-clarify`, once your answers settle the markers, as with spec 001.

## Cost and data-flow impact

None until the spec is planned and built. The spec commits to new disclosure rows (FR-040: asset requests to the edge, which reveal the chosen avatar; the asset events; any hosted studio step; and an amendment to row D1).

## Clarify, 2026-10-18

Written by: a forked helper of the lead session, in `/tmp/claude-1000/wt-spec003`. Authorized by the Author's direction, mid-session on 2026-10-17: "Let's relax some of the overnight rules so that you can continue with intent 002 and intent 003? I think you can create the tasks and implement them and we can always go back later and re-do a task or requirement if we highlight a needed change", with their earlier "trust the recommendations and keep going as far as we can!". Security rules didn't change: no merge, push, AWS, or host stack, and human-only paths only through patches.

spec.md's new Clarifications section records each answer, quoting the recommended option as the spec worded it:
- **The media license (FR-015):** all rights reserved, with a notice that viewing and linking are welcome. The evaluation note's interim notice is this license's notice.
- **The AI-made likeness (FR-034):** disclosed both ways: a visible line in the twin's disclosure, whose wording you approve before the first likeness file is published, and one IPTC digital-source-type mark per file, with nothing else in it.
- **The eight confirmations:** yes, as worded.

No marker remains, and the checklist's last item passes. Two other edits followed from the answers: User Story 5's third scenario and the edge case about an unchosen license now describe the chosen one, and the Assumptions' note on the intent's move says it moved.

## Plan, tasks, and analyze, 2026-10-18

**What's new:** `research.md` (15 decisions), `plan.md`, `data-model.md`, five contracts (`arrival-check`, `asset-record`, `site-loading`, `asset-events`, `gpu-window`), `quickstart.md`, and `tasks.md` (52 tasks in seven phases).

**The design in one paragraph.** The arrival check is one standard-library Python program in the human-only gates, `tools/gates/arrival_check.py`. It runs before each commit, over every commit of a branch in `make check` and your gate, and over the whole history in `make publish-check`. It parses PNG, JPEG, WebP, and GLB down to their chunks and admits only a listed set of fields and the clarified IPTC mark. It checks each file against its directory's public `records.json` and the license allowlist, and requires your approval, by the file's hash, for every likeness, photo-derived, and room file. It reads the allowlist, the approvals, and the caps from the `main` ref, so a branch can never approve its own files. Every refusal names a rule's ID (contracts/arrival-check.md §3).

**Decided by recommendation, revisit any time** (research.md's table):
1. Assets under `assets/`, one directory per family; published images beside their note, in `docs/research/images/<note>/`.
2. One `records.json` per directory, read with the standard library.
3. The allowlist and approvals read from the `main` ref.
4. The mark as one XMP property, `Iptc4xmpExt:DigitalSourceType` = `trainedAlgorithmicMedia`, in images, and in glTF's `KHR_xmp_json_ld` in models.
5. The visible line's draft: "This avatar is a stylized likeness of the Author, made with AI from the Author's photos and published by the Author's choice." You approve the wording with the twin's first file.
6. The reference phone, a 2023 mid-range Android phone (a Samsung Galaxy A54 or the closest you have), and spec 002's 4G profile, 9 Mbps and 150 ms.
7. ADR 0010 drafted as proposed by this spec's second task group, from intent 003's survey, for you to accept.
8. The GPU window as an operator command, an audit row, a gauge, and a dashboard annotation.
9. New ADRs 0030 to 0032, after the pin rule's 0023 and spec 001's draft 0024 to 0029.

**What can be built now, and what waits:**

| Phase | Branch | Now? |
|---|---|---|
| 1 | `feat/003-guards`: the studio's folders denied, the policy protected | **yes**. It carries placeholders for the studio's folders, which only you can fill |
| 2 | `feat/003-us1-arrival-check`: the check, the hook, the gate and publish-check steps, the scrubber, the credits, ADR 0010's draft, ADRs 0030 to 0032, the withdrawal runbook | **yes** |
| 3 | `feat/003-us5-comparison`: the evaluation note's image folder and caption rule | **yes**; the grids themselves after the evaluation runs |
| 4 | `feat/003-us6-gpu-window`: the command, the endpoint, the gauge, the panel, the runbook | **yes**; the rehearsal is yours (Heavy) |
| 5 | `feat/003-us2-us3-site`: loading, degraded modes, events, credits on the site | **waits** for spec 001's site and relay and spec 002's room |
| 6 | `feat/003-us7-room` | **waits** for spec 002's room (Phase 3) |
| 7 | `feat/003-close` | after the rest |

**`/speckit-analyze`** (read-only, over spec.md, plan.md, and tasks.md):

| ID | Category | Severity | Location | Summary | Resolution |
|---|---|---|---|---|---|
| A1 | Inconsistency | HIGH | research R-05, contracts/arrival-check.md §1 | The policy was read from the main working tree, which can be parked on another branch (as tonight), so approvals made on `main` would be invisible, or a switched tree could show another branch's policy | Fixed: read from the `main` ref, which only your merges and patches move |
| A2 | Underspecification | HIGH | contracts/arrival-check.md §1, data-model.md §6 | Exit 2 on a missing policy would refuse every commit, code included, until Phase 1's patch is applied and merged | Fixed: a run that meets no studio file needs no policy and exits 0 |
| A3 | Inconsistency | MEDIUM | research R-02 against contracts/arrival-check.md §2 | `.bin` was weights "over 1 MB" in one and any `.bin` in the other | Fixed: over 1 MB in both |
| A4 | Coverage gap | MEDIUM | FR-038, SC-012 | The dashboard's monthly transfer and cost for the assets had no task | Fixed: T047 |
| A5 | Ordering | MEDIUM | FR-003 against tasks Phase 1 | FR-003 needs the deny before the studio stages its first photo; the evaluation may already have photos on the machine | Not a document change: apply Phase 1's patch first (quickstart §1) |
| A6 | Inconsistency | LOW | spec User Story 5 test against research R-09 | The spec checks the arms B and D caption "at review"; the plan makes it a machine rule (C1) too | Kept: stricter than the spec |
| A7 | Ambiguity | LOW | research R-13 | "the closest one the Author has" leaves the reference phone open | Kept: each measurement records the phone's model |
| A8 | Coordination | LOW | research R-15 | ADR numbers are allocated across three unmerged specs (0024 to 0029 in spec 001's draft, 0030 to 0032 here) | Kept: spec 002's plan should start after 0032 |

**Metrics:** 41 functional requirements and 12 success criteria, 53 in all; 52 tasks; coverage 100% (every FR and SC has at least one task, after A4); ambiguities 1 (A7); duplications 0; critical issues 0. No constitution conflict: the post-design check passes, with the carried local-phase deviation (ADR 0013).

### Checks

- **Links:** `evals/docs_links.py`: 0 failed, 866 relative links in 99 files.
- **Format:** `ruff format --check` on the folder and the notes: already formatted.
- **Quotes:** each new file's quotes of 25 characters or more, checked against the spec, the intent, spec 000, the intents, the docs, the configuration, the constitution, CLAUDE.md, and the corpus. Unmatched, and expected:
  - the Author's message of 2026-10-17, quoted from the session;
  - confirmation 5, which drops its source's bold markup;
  - `publish_check.py`'s comment, which the checker doesn't read (it's in a `.py` file, word for word on its line 49);
  - JSON keys, a panel's title, and the proposed disclosure line, which are new text rather than quotes.
- `make check` wasn't run: no gate reads `specs/003-studio-assets/` beyond the links check.
