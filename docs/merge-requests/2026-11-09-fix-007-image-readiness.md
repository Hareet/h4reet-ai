# fix/007-image-readiness

Spec: [specs/007-twin-conversation/](../../specs/007-twin-conversation/), its
[plan.md](../../specs/007-twin-conversation/plan.md)'s D44 · Intent: none · Written by: implementer subagent (Claude
Opus 5.5), for the main session · Date: 2026-11-09

Session: the main session started from `/home/h4reet/h4reet-ai/h4reet-ai`. This branch's worktree is
`/tmp/claude-1000/wt-imgready`, cut at `fix/007-steady-clock-test`'s tip, 40624d2d (gate 1; Status). Repo hooks
active: yes. In `.claude/audit/hooks.log`, every event in `wt-imgready` from the worktree's `git worktree add -b
fix/007-image-readiness` at 2026-11-10T01:04:34Z on was ALLOW, but one post-edit WARN at 01:11:59Z: the lint of the new
test between two edits (a helper not yet used), clean after the next edit.

Authorized by: spec 007's FR-030 ("THE GATEWAY and THE ROOM'S BUILD SHALL read the same file under the same rule") and
FR-037 ("THE ROOM'S BUILD SHALL write each selectable's `ready` and `free_talk.ready` into `room-manifest.json` from
`config/twin-readiness.yaml` under FR-030's rule"), which this branch makes hold in the web image; and the main
session's brief, which named the suspected bug and asked for it confirmed, then fixed test-first. No decision of yours
was relayed to this session.

## Status: draft, before its verification

(Draft: the checks run on this commit; the note follows.)

## What changed and why

**The bug.** The room's build composes the room with `readiness: twinReadiness(tree)` and `talkLimits(tree)`, the tree
being the repository's root (`apps/web/build/room/plugin.ts`'s `buildStart`; `vite.config.ts`'s `roomBundle({ root:
here("../..") })`, `/src` in the image). `apps/web/build/room/readiness.ts` reads five files from it:
`config/twin-readiness.yaml`, `config/twin/corpus.json`, `config/twin/prompt.md`, `config/twin/lines.yaml`, and
`config/budgets.yaml`. A missing one makes nothing ready, and the build goes on (FR-030: "WHILE the file is missing or
invalid, nothing SHALL be ready"). `apps/web/Dockerfile`'s install stage copied no `config/`, and nothing in
`deploy/compose.yaml`, `nginx.conf`, or `deploy/scripts/web_image.py` brings readiness in at run time. So prod's web
image marked every topic not ready, and a visitor's selection of a piece gave its fixed message and sent nothing
(FR-032), while every build in a checkout, `make test`'s among them, saw your file and the three ready topics.

**The fix** (acde8b8b): the install stage copies those five files to their tree paths, before either of apps/web's
builds runs (`build`, and the lookdev phone copy's `build:lookdev-phone`, which builds on the same install stage), and
no other part of `config/`:

```dockerfile
COPY config/twin-readiness.yaml config/budgets.yaml config/
COPY config/twin/corpus.json config/twin/prompt.md config/twin/lines.yaml config/twin/
```

with a comment citing FR-030 and FR-037 and plan.md's D44. The runtime stage still copies only `dist/` (`COPY
--from=build /src/apps/web/dist /usr/share/nginx/html`, held there by `deploy/scripts/test_web_image.py`'s
`test_only_the_build_stage_reads_the_models`), so none of the five files reaches nginx's root.

**The test** (1bb042eb, RED; `apps/web/test/room/image-inputs.test.ts`, beside the room's other build tests): it takes
the list from `readiness.ts`'s own constants (`READINESS_PATH`, `PACK_FILE`, `PROMPT_FILE`, `LINES_FILE`,
`BUDGETS_FILE`), not a second list, and

- holds the tree's reads to exactly those: `twinReadiness` and `talkLimits` over the repository's tree log exactly the
  five paths, so a new read that bypasses the constants fails it;
- reads the Dockerfile's stages (comments dropped, continuations joined, as the Python tests read them), finds each RUN
  of an apps/web build, walks the stages it stands on, and checks that a COPY from the context before that RUN puts
  each file at its tree path under the RUN's working directory, the room's root there; a sanity case checks the reader
  on the build's existing inputs (`docs/data-flow-disclosure.md` into a folder, `assets/policy/caps.json` to its own
  path, `apps/web/vite.config.ts` through a folder copy) and on a file it doesn't copy (`deploy/compose.yaml`);
- holds the context's copies from `config/`, in any stage, to exactly those five.

**`talkLimits` too.** `config/budgets.yaml`'s `limits.twin` (600, 8, 4,000) equals FR-027's defaults today, so the image
built without it showed the same limits (`twin:{limits:{turnMaxChars:600,historyMaxTurns:8,historyMaxChars:4e3}}` both
before and after); with the copy, a change of yours to `limits.twin` now reaches the image's text box as it reaches the
route.

**Anything else the room's build reads from `config/`:** nothing. Over the export of 40624d2d, the whole of `buildStart`
(`compose` in release and in drafts mode, with `twinReadiness` and `talkLimits`) reads these five `config/` paths and
no other (Verification). `config/room-events.yaml` and `config/room-topics.yaml` are `room:generate`'s outputs, which
the build never reads; `twin-pack.ts`'s reads are its CLI's, not the build's.

**Spec 007's plan.md** gets D44's row, §6's sentence on the tree the build reads (now naming the image's install
stage), and the Dockerfile and the test in Project Structure.

## Acceptance criteria

| ID | How this branch meets it |
|---|---|
| Spec 007 FR-030 | the gateway and the room's build now read the same file under the same rule in the image too: the image's index has the three topics your file marks ready, and free talk not ready, as the gateway reads it |
| Spec 007 FR-037 | the image's `room-manifest.json` has each talk object's `ready` from `config/twin-readiness.yaml` (four `true`, `free_talk.ready` `false`), where it had all `false` |
| Spec 007 FR-027, FR-041 | the image's text box takes `limits.twin` from `config/budgets.yaml`, not FR-027's defaults by absence |
| Spec 007 FR-032 | with a ready topic in the index, a visitor's selection of its piece starts a conversation in prod's room; your browser check (step 6) |

## Constitution check

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local by default | No | No flow added; the turn's flow is V2's, already disclosed |
| II. Production-grade or not shipped | Yes | Confirmed in the built image, RED then GREEN, and re-confirmed in the image built from the fix; `make lint`, `make test`, `make evals`, and `make check` below |
| III. Intent before spec, spec before code, humans merge | Yes | Under spec 007's FR-030 and FR-037; plan.md's D44 in the same commit as the fix; you merge |
| IV. Least privilege | No | This session wrote nothing under `.claude/`, `tools/gates/`, `evals/agent-config/`, `assets/`, `corpus/`, `config/`, or `.specify/`, nor `CLAUDE.md` or `REVIEW.md`; the image build ran on the agents' engine through its relay, as `make image` does |
| V. Cost is a first-class signal | Yes | $0 here; prod's room can now send turns, at spec 007's estimate (Cost) |
| VI. Build in public | Yes | The image's readings, before and after, are in this note |
| VII. Own the whole product | Yes | The image is the product; the check now holds the image to the checkout |
| VIII. Honest AI | No | Nothing the twin says changes |
| Security and agent governance | Yes | This session reviews none of its own work (Review) |

## Review

(Pending: a `REVIEW.md` pass from an agent that wrote none of this branch.)

## Verification

(Pending.)

## Cost and data-flow impact

- **Model spend here: $0.** No model call; this session's work is on the Claude Team plan.
- **In prod, after the merge,** the room's three ready topics start conversations, so visitors' turns reach the gateway
  as spec 007 planned: $0 a local turn, about $0.0007 to $0.00095 a fallback turn ([plan.md §15](../../specs/007-twin-conversation/plan.md#15-expected-cost-and-how-its-measured)),
  within the paid route's sub-budget and caps. This branch adds no cost of its own.
- **The visitor's bytes:** the entry chunk's three `ready:!1` become `ready:!0`, the same length; no file is added to
  nginx's root (its listing is the same eight entries before and after).
- **Data flow: none new.** The turn's request is V2 in `docs/data-flow-disclosure.md`, already there; no new row.

## Backlog

(Pending.)

## For the Author

(Pending.)
