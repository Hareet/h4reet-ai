# Plan: When the Twin's File Context Stops Being Enough (Corpus Retrieval ADR)

**Approved provisionally by the Author's order of 2026-11-13**, in his words:

> Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.

> And if you finish early, I want you to continue for all the remaining items through to implmeentation and merging and choose your recommendations. Keep goign! You got this!

> I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over

His answer to the morning page (2026-11-13):

> We want the agents to continue with their reocmmendation and go through to implementation and then testing and then integration and merging

His item, as his orders file lists it (his own words are the quoted letter and title): j) "future knowledge corpus gains answers or more questions as we go to RAG then we go to vector DB and answers to why we are okay using file context as of now and this size". Each clarification answer (spec.md, Q1 to Q8) is the recommended one, his to confirm or overturn on the morning page; an overturned answer is reworked before he merges.

Spec: [spec.md](spec.md) · Intent: [`intent/027-corpus-retrieval-adr.md`](../../intent/027-corpus-retrieval-adr.md) (draft) · ADR: [0054](../../docs/adr/0054-when-file-context-stops-being-enough.md) (proposed) · Constitution: VIII (the twin speaks only from the corpus), V (cost), I (the local tier is production), III (ADRs record decisions; a human merges), VI (in the open).

## 1. What gets built

What ADR 0054 decides, and no more (Q1): no retrieval, no change to anything the twin reads at run time.

1. **ADR 0054**, `docs/adr/0054-when-file-context-stops-being-enough.md`, drafted with this plan as `Status: proposed`, and its row in `docs/adr/README.md`. The number is the next free on `main`: 0001 to 0053 are taken or reserved (0011, 0035, 0037 reserved), and no branch, night or otherwise, has a 0054.
2. **The size check**, `apps/web/build/corpus-size.ts`: a pure measurement and a small CLI that writes `docs/corpus-size.json`.
3. **Its test**, `apps/web/test/corpus-size.test.ts`.
4. **One script line**, `apps/web/package.json`'s `twin:pack`, so the command every corpus change already runs writes the record too (Q7).

## Technical Context

TypeScript (Node 24, `tsx`, as the pack's build), vitest in `apps/web`. No new dependency. Reads `corpus/NN-*.md`, `corpus/facts/*.yaml`, `config/twin/corpus.json`, `config/twin/prompt.md`, `config/budgets.yaml`; writes `docs/corpus-size.json`. No network, no model, no store, no container. `docs/` is in `.prettierignore`, so the record's bytes are the check's.

## Constitution Check

- **VIII, Honest AI**: the twin's grounding is unchanged; the ADR records how much of the corpus a turn holds, which is what "speaks only from a curated, versioned corpus" rests on. PASS.
- **V, Cost**: no run-time cost; the ADR states a paid twin call's reservation and each later stage's cost. PASS.
- **I, Data-local, degraded first**: no byte leaves; nothing at run time changes, so the degraded modes are ADR 0040's; stage 2's degraded mode is named in the ADR (today's lexical ranking). PASS.
- **II, Production-grade**: tests for the check; no run-time capability, so no span or panel (spec.md, "Cost, degraded mode, telemetry, disclosure"; Q5 records the run-time gap found). PASS.
- **III**: intent (draft), spec, plan, ADR; nothing merges but by the Author. PASS.
- **IV, Least privilege**: no human-only path is written; `docs/merge-requests/human-patches/027.md` says none is needed. PASS.

## 2. The measurement, as taken for the ADR

On `main` at 3c0e4cd0, in this session:

- Bytes, words, and characters per file by Node (`Buffer` length, `\S+` runs, string length) and checked against `LC_ALL=C.UTF-8 wc -c -w`: equal. The plain C locale's `wc -w` gives 14,862 for the topic files, 227 fewer: GNU `wc` doesn't count a run with no printable ASCII character (a lone dash). The ADR names the UTF-8 locale.
- The pack's figures (sections, rendered characters, rules, `00`, the room, each topic file's grounding, free talk's share) by a replica of `fitProblems`, `renderSection`, `renderRules`, and `instructionsChars`, since the worktree has no `node_modules`. **Task T005 replaces them with the check's output**; if the two differ, the ADR's table takes the check's figures and the difference is recorded in this plan's departures (§9).

## 3. ADR 0054

Context (the item; his words from intent 015; what the twin does; how the gateway counts; the measured size; the context each routed model gets), Decision (1, file context stays, why; 2, T1, T2, T3 with today's values and note bands; 3, at T1 retrieve within the topic; 4, a crossing is a note; 5, the record; 6, how the corpus gains answers or questions), Alternatives, Consequences (the record's extra file, "Do not claim" lines shrink every margin, `01` can't be a whole-file topic, the dropped count isn't logged, each later stage's cost), Links. Written with this plan; T005 finalizes its figures.

## 4. The check: `apps/web/build/corpus-size.ts`

**Imports** from `./twin-pack.ts` (no cycle: `twin-pack.ts` doesn't import it): `fsReader`, `PackReader`, `TwinPack`, `PackSection`, `renderSection`, `renderRules`, `instructionsChars`, `fitLimits`, `FRAMING_CHARS`, `PER_TURN_CHARS`, `PROFILE_FILE`, `PACK_PATH`, `PROMPT_PATH`, `BUDGETS_PATH`, `REPO_ROOT`. Each is exported on `main` at 3c0e4cd0, so `twin-pack.ts` doesn't change; its CLI runs only when it is the script node was given, so importing it runs nothing.

**Constants**, the one place the thresholds live (ADR 0054's Decision 2; a change to one is an ADR amendment in the same commit):

```ts
export const THRESHOLDS = {
  t1_band: 0.95, // a selectable topic's grounding ÷ the room
  t2_share: 0.05, // free talk's room ÷ the rankable sections' characters: crossed below
  t2_band: 0.075,
  t3_pack_bytes: 10_485_760,
  t3_sections: 10_000,
  t3_band: 0.5, // of either T3 figure
} as const;
export const RECORD_PATH = "docs/corpus-size.json";
```

**Functions** (pure, except `main`):

- `measureFiles(reader: PackReader)`: the topic files (`corpus/` entries matching `^\d{2}-[a-z0-9-]+\.md$`) and `corpus/facts/*.yaml`, sorted; for each, `bytes` (`Buffer.byteLength(text, "utf8")`), `words` (`text.match(/\S+/g)?.length ?? 0`), `chars` (`text.length`); totals per group and together. Reads nothing else.
- `measurePack(o: { pack: TwinPack; packBytes: number; prompt: string; budgetsText: string | null })`:
  - `limits` = `fitLimits(budgetsText)`, and `limits_source` = `"config/budgets.yaml"` when `limits.twin` holds all three keys, else `"defaults"`.
  - `instructions` = `instructionsChars(prompt)`; `conversation` = `history_max_chars + history_max_turns × PER_TURN_CHARS`; `room` = `max_input_chars − instructions − FRAMING_CHARS − conversation` (exactly `fitProblems`' `room`).
  - `rules` = `renderRules(pack).length`; `profile` = the rendered characters of `00`'s sections; `base` = `rules + profile`.
  - Per topic file in the pack's `files` but `00`: `rendered` (its sections, rendered), `grounding` = `base + rendered`, `share` = `grounding ÷ room` rounded to 4 places, `margin` = `room − grounding`, `selectable` = the pack topic IDs whose `files` include it (empty list when none).
  - `free_talk`: `room` = `room − base`, `rankable` = rendered characters of every section but `00`'s, `share` = `room ÷ rankable` rounded to 4 places.
  - `pack`: `sections`, `bytes` (`packBytes`), `rendered` (all sections), `longest_section`.
- `stageOf(measure)`: T1 crossed when any file with a non-empty `selectable` has `grounding > room`; in band when `grounding ≥ ceil(room × t1_band)`. T2 crossed when `free_talk.share < t2_share`; in band below `t2_band`. T3 crossed when `pack.bytes > t3_pack_bytes` or `pack.sections > t3_sections`; in band at half of either. Returns `{ stage, crossed: ["T1", …], band: ["T1", …], notes: string[] }`, `stage` the highest crossed threshold's number, else 0. A note reads, for example: `corpus:size: T1 crossed: the topic mission needs 21,200 characters of grounding, past the room's 21,182; ADR 0054 says stage 1 (retrieval within a topic) is due`. A band note says "within N characters of T1" or the share.
- `buildRecord(files, pack, stage)` → the record object in a fixed key order; `recordJson(record)` = `JSON.stringify(record, null, 2) + "\n"`. The record holds no commit and no date (FR-009), so two runs over the same tree give the same bytes.
- `main(root = REPO_ROOT)`: reads the committed pack (`PACK_PATH`; missing or unparseable: one line on stderr, exit 1, nothing written), the prompt, and the budgets; writes `RECORD_PATH`; prints each note on stderr and one summary line on stdout (`corpus:size: wrote docs/corpus-size.json: stage 0; mission 21,045 of 21,182`); exit 0 whatever the stage (Q4).

**The record** (`docs/corpus-size.json`), top-level keys in this order: `schema` (1), `generated_by` (`"apps/web/build/corpus-size.ts (npm run twin:pack -w apps/web)"`), `adr` (`"docs/adr/0054-when-file-context-stops-being-enough.md"`), `unit` (`"characters: a JavaScript string's length, which the gateway counts as one token each before a call"`), `files` (`topic`, `facts`, `total`, each `{ files, bytes, words, chars }`, and `by_file`: `{ path, bytes, words, chars }[]`), `limits` (`source`, `max_input_chars`, `history_max_chars`, `history_max_turns`), `room` (`instructions`, `framing`, `conversation`, `room`), `base` (`rules`, `profile`, `base`), `topics` (`{ file, rendered, grounding, share, margin, selectable }[]`, in file order), `free_talk` (`room`, `rankable`, `share`), `pack` (`sections`, `bytes`, `rendered`, `longest_section`), `thresholds` (`THRESHOLDS`), `stage` (`stage`, `crossed`, `band`).

**Wiring**: `apps/web/package.json`: `"twin:pack": "node --import tsx build/twin-pack.ts && node --import tsx build/corpus-size.ts"`. The size step runs only after the pack is written, so it measures the fresh pack.

## 5. Tests (small tests; rule 4)

`apps/web/test/corpus-size.test.ts`, test-first (T002 before T003):

| Case | What it holds |
|---|---|
| fresh | `recordJson` of the record computed from the repository equals `docs/corpus-size.json`'s bytes; the failure message names `npm run twin:pack -w apps/web` (FR-012) |
| deterministic | two computations over the repository give identical bytes (FR-008) |
| room parity | on a fixture pack, a topic `fitProblems` names is exactly a topic whose record grounding passes the room, and the record's `room` equals the one `fitProblems` uses (FR-010) |
| T1 boundary | a fixture whose selectable topic's grounding equals the room: stage 0, T1 in band; one character more: stage 1, T1 crossed, one note (SC-002) |
| not selectable | a file past the room that no topic selects (as `01` is): measured, not crossed |
| T2 boundary | free talk's share exactly 5%: not crossed; under: crossed |
| T3 boundary | `pack.bytes` 10,485,760: not; 10,485,761: crossed; `sections` 10,000 and 10,001 |
| defaults | `budgetsText` null, and one without `limits.twin`: `limits.source` is `"defaults"`, and the figures are FR-027's |
| reads only | a `PackReader` spy over a fixture tree holding `intake/`, `proposals/`, `tools/`, `README.md`, `INTAKE.md`, `private/`: none is read or listed beyond `corpus/` and `corpus/facts/` (FR-008) |
| words | a fixture with a lone "—" and a double space: `\S+` counts as the ADR says |

**Run** (in `apps/web`): `npx vitest run test/corpus-size.test.ts test/twin-pack.test.ts` (the second because the `twin:pack` command it covers changes), then `make lint`. Every `apps/web` vitest run first makes the workspace's two site builds (`test/global-build.ts`); that is the workspace's cost, not the suite's (SC-003). The full `make check` is the stack's last task, not this one's.

## 6. Degraded mode, telemetry, cost, disclosure

Unchanged at run time (FR-013). The record is a document; a failure to write it fails the CLI and its test, never `make up`. No span, no panel (spec.md; Q5). No cost. No disclosure row.

## 7. Files I expect to touch (the implementer merges this branch first)

Implementation runs on the night's line after item h (spec 025). Expected:

- Added: `apps/web/build/corpus-size.ts`, `apps/web/test/corpus-size.test.ts`, `docs/corpus-size.json` (generated).
- Changed: `apps/web/package.json` (the `twin:pack` line); `docs/adr/0054-when-file-context-stops-being-enough.md` (T005: the check's figures); `specs/027-corpus-retrieval-adr/plan.md` (§9, departures), `tasks.md` (marks).
- Already on this branch: `docs/adr/0054-…`, `docs/adr/README.md` (the index row), `intent/027-…`, `specs/027-…/*`, `docs/merge-requests/human-patches/027.md`.
- Not touched: `apps/web/build/twin-pack.ts`, `corpus/**`, `config/**`, `services/**`, `.claude/**`, `evals/agent-config/**`, any human-only path.
- **Overlap**: no other night spec's plan touches `apps/web/package.json`, `twin-pack.ts`, or `docs/adr/README.md` (checked on each `night/spec-0NN` branch). Spec 022's corpus patch regenerates with `npm run twin:pack -w apps/web`: applied after this spec's code, it rewrites `docs/corpus-size.json` too, and its new "Do not claim" lines shrink every margin, so its note should say the record shows whether mission crosses T1 (questions page). If the Author applies 022's patch before this branch merges, the implementer regenerates the record after merging `main`.

## 8. Risks

| # | Risk | Answer |
|---|---|---|
| R-1 | The replica's figures differ from the check's | T005 takes the check's and records the difference in §9 |
| R-2 | The record's freshness test fails on a corpus, prompt, or `limits.twin` change made without the command | The message names the command; the same command already regenerates the pack those changes need (Consequences) |
| R-3 | Spec 022's lines push mission past T1 | A note, not a failure (Q4); FR-008 keeps the turn working; stage 1's spec is due, the Author's call |
| R-4 | `twin:pack`'s two steps: the first fails | `&&` stops the second, so no record is written over a stale pack |
| R-5 | The site's global build makes the small test slow | Run one file; the build is per run, not per file (§5) |

## 9. Departures

None yet. The implementer records here any difference from §4, and the replica-versus-check difference from T005.
