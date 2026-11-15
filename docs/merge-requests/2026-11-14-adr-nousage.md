# adr-nousage: ADR 0055, the one "no usage event" ADR for specs 024, 025, and 026 (page Q300)

Branch `night/adr-nousage/adr-nousage`, from the line's tip `refs/heads/night/merge-2/merge-2` at `ce3f6305`. Documents only: no code, test, scene, asset, or human-only path changes; nothing merged or pushed. merge-3 takes this branch's tip. Reviewer: rv-docs3, on another worker.

## Why

Tonight's page, Q300's answer: "The queue has no docs role, so, as ADR 0054 was (spec-027's spec-writer), queued **adr-nousage** (a spec-writer, documents only, from the line's tip ce3f6305): ADR 0055 as `proposed`, one for specs 024, 025, and 026". The constitution's governance (`.specify/memory/constitution.md:73`): "Deviations require a written justification in the spec and an ADR if permanent." Night 1's Q149, Q152, and Q161 took the recommended answers that ask for it, one ADR for the three.

## What changed

| File | Change |
|---|---|
| `docs/adr/0055-no-usage-event-for-what-only-the-dinosaur-causes.md` | New. Status `proposed, 2026-11-15`, accepted when the Author merges the stack that carries specs 024, 025, and 026. Context: the constitution's clauses and CLAUDE.md's lines, quoted; row V4's "Never carries", quoted; each spec's own words for the deviation, quoted with file:line; Q116, Q117, Q142, Q149, Q152, Q161, and Q300's recommended answers, quoted. Decision: no event, span, or panel for the eating, the run, and the petting; a permanent deviation from Principle II and Workflow 7; what each spec does instead (degraded mode, what is observed, its data-flow entry), as a table of quotes; scope; when it reaches `main`. Alternatives (the questions' "Others"), Consequences, and what would reverse it. |
| `docs/adr/README.md` | The index's row for 0055. |
| `specs/024-dino-eats-room-assets/spec.md` | Assumptions, new A9 (line 188): "ADR 0055 (proposed) records this deviation (A5)", with the link. Inserted after every line the ADR cites, so no citation moves. |
| `specs/025-twin-and-dog-run-from-dino/spec.md` | Assumptions, a new bullet (line 241): "ADR 0055 (proposed) records this deviation ("Deviations named", above)", with the link. The ADR cites spec 025's lines as they are after it (250, 254, 258). |

**Number.** 0055 is free: `git ls-tree --name-only refs/heads/main docs/adr/` ends at `0053-the-studio-line.md`; the line ends at `0054-when-file-context-stops-being-enough.md` (proposed, spec 027's); no `refs/heads/night/*` branch holds a `docs/adr/0055*` or `005[6-9]*` file. The only mention of "0055" on any night branch is tonight's page (Q300 and the 01:40Z log row, which name it).

**One difference from the brief, from the sources.** The brief reads the deviation as "no usage event; for 025 also no span or panel". The specs' own words have no span and no panel in all three: spec 024's A5 (`spec.md:184`), "it sends no usage event, writes no span, and has no panel"; spec 026's (`spec.md:231`, `:249` at 215b4eea), "no usage event and has no dashboard panel or count" and "Telemetry span: none for the petting". The ADR follows the specs.

## For merge-3: spec 026's pointer

Spec 026 isn't on this branch. When merge-3 brings `night/rework5-026/rework5-026` (215b4eea or its later tip) onto the line, add one Assumptions line to `specs/026-twin-pets-dog/spec.md`, after line 231 (the bullet beginning "- **Deviation named** (CLAUDE.md, "Deferring or dropping a control the constitution requires"; the page's Q142, taken provisionally)") and before line 232 ("- No other constitution control is deferred or dropped."):

```markdown
- ADR 0055 (proposed) records this deviation ("Deviation named", above): [`docs/adr/0055-no-usage-event-for-what-only-the-dinosaur-causes.md`](../../docs/adr/0055-no-usage-event-for-what-only-the-dinosaur-causes.md), one ADR for specs 024, 025, and 026 (the page's Q161, Q300).
```

The ADR cites spec 026's lines at 215b4eea and says so, so the insertion moves no citation the ADR relies on. If merge-3's tip of spec 026 differs from 215b4eea at lines 183, 231, 241, 245, or 249, the ADR's spec 026 quotes need re-checking against it.

## What I read

- `.specify/memory/constitution.md`, whole.
- `CLAUDE.md:26` ("New endpoint or feature → also: …") and `:56` ("Deferring or dropping a control …").
- Spec 024: `spec.md` (Summary, Clarifications Q3, Q108, Q117, Q-R2c, Q149; FR-014; SC-006; Cost Estimate; Degraded Mode; Assumptions A1 to A8; the revisions), `plan.md:17`, `:45`, `:172`, `:175`.
- Spec 025: `spec.md` (Q10, Q13; FR-026, FR-027; Assumptions; Expected Cost Impact; Degraded-Mode Behavior; Data-Flow Disclosure Entries; the "New Endpoint or Feature" list; Constitution Check), `plan.md:21`, `:34`.
- Spec 026, by `git show refs/heads/night/rework5-026/rework5-026:specs/026-twin-pets-dog/<file>` (215b4eea): `spec.md` (Q142, Q161; FR-026; Assumptions; Expected Cost Impact; Degraded-Mode Behavior; Data-Flow Disclosure Entries; the list; Constitution Check), `plan.md:36`, `:62`.
- Night 1's page (`refs/heads/night/supervisor/2026-11-13`, `docs/night-shift/2026-11-13.md`): Q116 (line 512), Q117 (517), Q142 (646), Q149 (682), Q152 (697), Q161 (743), each with its answer.
- Tonight's page (`refs/heads/night/supervisor/2026-11-14`, `docs/night-shift/2026-11-14.md`): Q300 (line 55) and the 01:40Z log row.
- `docs/data-flow-disclosure.md:43`, `:50` (row V4), `:54`.
- `apps/web/src/room/events.ts:6-26` (`EVENT_KINDS`: no kind for the eating or the run) and `deploy/grafana/dashboards/h4-runtime.json:3215-3216` (the "Visits whose avatar failed" panel's description names the room's dog's files).
- ADR 0054 and `docs/adr/README.md`, for the form.

No fact about the Author is stated: the ADR quotes the constitution, the specs, row V4, and the pages, and the questions' answers are given as the pages record them ("Answered: recommended, the Author 2026-11-13 (the orders file's rule: …; yours to confirm or overturn here)").

## Question for the page

One, in `/night/io/out/questions.md`: Development Workflow 5's "telemetry present for new paths" (`.specify/memory/constitution.md:66`), which no spec names. Recommended, taken provisionally and written into the ADR's Decision 2: not deviated from, since "paths" are read as request paths and none of the three adds one. Others: name it as a third deviated clause in the ADR and each spec; leave it unmentioned.

No refusal was hit (Interruptions: none).

## Small tests and lint (rule 4)

The worktree had no `node_modules`, and the lint target stopped with "node_modules is missing: run make setup"; the setup target ran (exit 0; its last line: "git hooks: … isn't writable here (the agent sandbox); the Author runs make git-hooks"). Then:

`python3 -I -m pytest -q evals/test_docs_links.py` (the test covering `docs/**`, `specs/**`, and the ADR index):

```text
............................................                             [100%]
44 passed in 0.99s
```

The lint target (the shellcheck lines, which list the repository's `.sh` files, left out here):

```text
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
828 files already formatted
exit 0
```

Both runs above are the last, with this note in the tree (an earlier run, before the note, read "827 files already formatted" and exit 0).

The full check isn't run here (rule 4: once, at the end of the stack).

## What's left

- rv-docs3 (another worker) reviews this branch.
- merge-3 takes this tip and adds spec 026's pointer (above).
- The Author: the page's Q300 and this task's question; ADR 0055 is accepted, amended, or rejected when he merges the stack. Overturning Q116, Q117, or Q142 reverses it (the ADR's "What would reverse it").
