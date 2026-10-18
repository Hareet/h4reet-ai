# spec/003-studio-assets
Spec: specs/003-studio-assets/ · Intent: specs/003-studio-assets/intent.md (accepted 2026-10-17) · Written by: the spec-writer agent (the draft); the lead session (the intent's move, the checks, this note) · Date: 2026-10-18
Session: the spec-writer worked in `/tmp/claude-1000/wt-spec003` with no shell, writing under `specs/003-studio-assets/` only; the lead session committed · Repo hooks active: yes. The spec-writer's one refused write was `.specify/feature.json`, which is outside its scope and which git ignores.
Authorized by: the Author's acceptance of intents 002 and 003 on 2026-10-17 ("Yeah, they are accepted. We can always revise them later, but I am liking what you are putting out so trust the recommendations and keep going as far as we can!"), and the overnight plan agreed that evening: `/speckit-specify` for both, stopping at the clarify questions.

**Status: a draft for `/speckit-clarify`.** No plan and no code. Two `[NEEDS CLARIFICATION]` markers stay open on purpose, and eight recommended defaults wait for a yes.

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
