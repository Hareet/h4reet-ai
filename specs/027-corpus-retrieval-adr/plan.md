# Plan: When the Twin's File Context Stops Being Enough (Corpus Retrieval ADR)

**Approved provisionally by the Author's order of 2026-11-13**, in his words:

> Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog.

> And if you finish early, I want you to continue for all the remaining items through to implmeentation and merging and choose your recommendations. Keep goign! You got this!

> I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over

His answer to the morning page (2026-11-13):

> We want the agents to continue with their reocmmendation and go through to implementation and then testing and then integration and merging

His item, as his orders file lists it (his own words are the quoted letter and title): j) "future knowledge corpus gains answers or more questions as we go to RAG then we go to vector DB and answers to why we are okay using file context as of now and this size". Each clarification answer (spec.md, Q1 to Q8) is the recommended one, his to confirm or overturn on the morning page; an overturned answer is reworked before he merges.

**Reworked 2026-11-14** after the Opus review rv-spec-027 (blocking): B1 (spec 026's corpus patch named beside 022's, §7, §8, T001, T007, T008; Q144, Q145), I1 (§4: the fit check's model, and what it leaves out), I2 (§4's `stageOf` per pack topic; §5's two-file fixture topic), I3 (the ADR's fourth reason: the reservation, not the billed cost), I4 (T005: the measurement's commit), N1 to N4. Q144 and Q145 are taken under the orders file's rule ("Every question, new ones included: the recommended answer stands"), provisional, his to overturn on the morning page.

**Reworked again 2026-11-14** after the Opus review rv-rework-spec-027 (not blocking): I-1 (spec 026's patch figures reread at `night/rework2-spec-026/rework2-spec-026`, b12ac0ba: the `04` block is 136 characters, mission keeps 1, hobbies and travel 130 then −7; §7 and R-3; T005 now takes the final figures from T008's records and corrects each place), I-2 (what T008 writes under `corpus/proposals/`), and nits 1 to 5 (the index row; the 900 micro-USD bound's ratio; Q157 cited; FR-002's commit; T008's order).

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
- These are the fit check's model of a turn (spec 007's plan, D5, D20), not the characters the gateway sends: the model leaves out the selectable's lead (`renderLead` in the system message; today only the snowboard's, "Winter hobbies first.", 41 rendered characters, on hobbies and travel), JSON escaping of each quoted turn beyond the 16 characters a turn is allowed, and it estimates the framing at 400 against what `services/gateway/src/twin/prompt.ts` writes (`CONVERSATION_HEAD`, 147 characters; `CONVERSATION_TAIL`, 177; the line breaks between the turns; the grounding's heading). At run time `turn.ts` counts the conversation as sent and `grounding.ts` counts the lead, so a real turn's bound differs from the model's by those terms (spec FR-010).

## 3. ADR 0054

Context (the item; his words from intent 015; what the twin does; how the gateway counts; the measured size, as the fit check's model, with what it leaves out; the context each routed model gets, dev's slot comparison marked as inferred), Decision (1, file context stays, why, the two pending corpus patches projected to cross T1; 2, T1, T2, T3 with today's values and note bands; 3, at T1 retrieve within the topic; 4, a crossing is a note, beside the fit check's own; 5, the record; 6, how the corpus gains answers or questions), Alternatives, Consequences (the record's extra file, "Do not claim" lines shrink every margin, with the header's 38 characters for `04` and the two pending patches by name, `01` can't be a whole-file topic, the dropped count isn't logged, the billed cost against the reservation and stage 1's possible saving, each later stage's cost), Links. Written with this plan; T005 finalizes its figures and its measurement commit.

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
  - `topics`, per pack topic in `pack.topics` order (what `fitProblems` iterates): `id`, `files` (its `files`), `rendered` = the rendered characters of every section whose file is in `files` but `00` (exactly `fitProblems`' `own`), `grounding` = `base + rendered`, `share` = `grounding ÷ room` rounded to 4 places, `margin` = `room − grounding`, and, as information outside T1, `lead` = the longest `renderLead` of the pack's selectables on that topic (`The piece's lead: ${lead}\n\n`, 0 when none has a lead; `renderLead` is the gateway's, so the check writes the same template, and a test pins it to `services/gateway/src/twin/render.ts`'s text) and `margin_after_lead` = `margin − lead`.
  - `by_file`, information outside T1: per topic file in the pack's sections but `00`, as if it were a one-file topic: `rendered`, `grounding` = `base + rendered`, `share`, `margin`, and `in_topics` = the pack topic IDs whose `files` include it (empty when none, as for `01` today).
  - `free_talk`: `room` = `room − base`, `rankable` = rendered characters of every section but `00`'s, `share` = `room ÷ rankable` rounded to 4 places.
  - `pack`: `sections`, `bytes` (`packBytes`), `rendered` (all sections), `longest_section`.
  - `model`, one fixed string the record carries so a reader knows what its figures are: `"the fit check's model (spec 007's plan, D5, D20): leaves out the selectable's lead (counted beside each topic as lead), JSON escaping of each quoted turn beyond PER_TURN_CHARS, and estimates the framing at FRAMING_CHARS against CONVERSATION_HEAD, CONVERSATION_TAIL, and the line breaks"`.
- `stageOf(measure)`: T1 crossed when any pack topic (`topics`) has `grounding > room`; in band when `grounding ≥ ceil(room × t1_band)`. `by_file` and `lead` never set the stage. T2 crossed when `free_talk.share < t2_share`; in band below `t2_band`. T3 crossed when `pack.bytes > t3_pack_bytes` or `pack.sections > t3_sections`; in band at half of either. Returns `{ stage, crossed: ["T1", …], band: ["T1", …], notes: string[] }`, `stage` the highest crossed threshold's number, else 0. A note reads, for example: `corpus:size: T1 crossed: the topic mission needs 21,200 characters of grounding, past the room's 21,182; ADR 0054 says stage 1 (retrieval within a topic) is due`. A band note says "within N characters of T1" or the share. At T1 the note prints beside `twin:pack`'s existing fit note for the same topic (`twin:pack: note: the topic mission needs 21200 characters of grounding, past the 21182 the input bound leaves (R-1); FR-008 drops its last sections, counted, at turn time`): the two name the same topic and figure, the first what the turn does, this one the stage (spec FR-011).
- `buildRecord(files, pack, stage)` → the record object in a fixed key order; `recordJson(record)` = `JSON.stringify(record, null, 2) + "\n"`. The record holds no commit and no date (FR-009), so two runs over the same tree give the same bytes.
- `main(root = REPO_ROOT)`: reads the committed pack (`PACK_PATH`; missing or unparseable: one line on stderr, exit 1, nothing written), the prompt, and the budgets; writes `RECORD_PATH`; prints each note on stderr and one summary line on stdout (`corpus:size: wrote docs/corpus-size.json: stage 0; mission 21,045 of 21,182`); exit 0 whatever the stage (Q4).

**The record** (`docs/corpus-size.json`), top-level keys in this order: `schema` (1), `generated_by` (`"apps/web/build/corpus-size.ts (npm run twin:pack -w apps/web)"`), `adr` (`"docs/adr/0054-when-file-context-stops-being-enough.md"`), `unit` (`"characters: a JavaScript string's length, which the gateway counts as one token each before a call"`), `files` (`topic`, `facts`, `total`, each `{ files, bytes, words, chars }`, and `by_file`: `{ path, bytes, words, chars }[]`), `limits` (`source`, `max_input_chars`, `history_max_chars`, `history_max_turns`), `model` (the string above), `room` (`instructions`, `framing`, `conversation`, `room`), `base` (`rules`, `profile`, `base`), `topics` (`{ id, files, rendered, grounding, share, margin, lead, margin_after_lead }[]`, in `pack.topics` order), `by_file` (`{ file, rendered, grounding, share, margin, in_topics }[]`, in file order), `free_talk` (`room`, `rankable`, `share`), `pack` (`sections`, `bytes`, `rendered`, `longest_section`), `thresholds` (`THRESHOLDS`), `stage` (`stage`, `crossed`, `band`).

**Wiring**: `apps/web/package.json`: `"twin:pack": "node --import tsx build/twin-pack.ts && node --import tsx build/corpus-size.ts"`. The size step runs only after the pack is written, so it measures the fresh pack.

## 5. Tests (small tests; rule 4)

`apps/web/test/corpus-size.test.ts`, test-first (T002 before T003):

| Case | What it holds |
|---|---|
| fresh | `recordJson` of the record computed from the repository equals `docs/corpus-size.json`'s bytes; the failure message names `npm run twin:pack -w apps/web` (FR-012) |
| deterministic | two computations over the repository give identical bytes (FR-008) |
| room parity | on a fixture pack with a two-file topic (two topic files, each under the room alone, together past it) and a one-file topic, the topics `fitProblems` names are exactly the record's `topics` whose grounding passes the room, the two-file topic among them, and the record's `room` equals the one `fitProblems` uses (FR-010) |
| T1 boundary | a fixture whose pack topic's grounding equals the room: stage 0, T1 in band; one character more: stage 1, T1 crossed, one note (SC-002) |
| not selectable | a file past the room that no pack topic holds (as `01` is): in `by_file` with empty `in_topics`, not crossed |
| lead | a fixture selectable with a lead: its topic's `lead` is `renderLead`'s length, `margin_after_lead` is `margin − lead`, and the stage doesn't move when `lead` passes the margin; the check's lead template equals the one in `services/gateway/src/twin/render.ts`, read as text (FR-010) |
| T2 boundary | free talk's share exactly 5%: not crossed; under: crossed |
| T3 boundary | `pack.bytes` 10,485,760: not; 10,485,761: crossed; `sections` 10,000 and 10,001 |
| defaults | `budgetsText` null, and one without `limits.twin`: `limits.source` is `"defaults"`, and the figures are FR-027's |
| reads only | a `PackReader` spy over a fixture tree holding `intake/`, `proposals/`, `tools/`, `README.md`, `INTAKE.md`, `private/`: none is read or listed beyond `corpus/` and `corpus/facts/` (FR-008) |
| words | a fixture with a lone "—" and a double space: `\S+` counts as the ADR says |

**Run** (in `apps/web`): `npx vitest run test/corpus-size.test.ts test/twin-pack.test.ts` (the second because the `twin:pack` command it covers changes), then `make lint`. Every `apps/web` vitest run first makes the workspace's two site builds (`test/global-build.ts`); that is the workspace's cost, not the suite's (SC-003). The full `make check` is the stack's last task, not this one's.

## 6. Degraded mode, telemetry, cost, disclosure

Unchanged at run time (FR-013). The record is a document; a failure to write it fails the CLI and its test, never `make up`. No span, no panel (spec.md; Q5). No cost. No disclosure row.

## 7. Files I expect to touch (the implementer merges this branch first)

Implementation runs on the night's line after item f (spec 026), which follows item h (spec 025): 026's corpus patch is then on the line's tip beside 022's. Expected:

- Added: `apps/web/build/corpus-size.ts`, `apps/web/test/corpus-size.test.ts`, `docs/corpus-size.json` (generated).
- Changed: `apps/web/package.json` (the `twin:pack` line); `docs/adr/0054-when-file-context-stops-being-enough.md` (T005: the check's figures, its measurement commit, and the pending patches' figures from T008's records); `spec.md`, `analysis.md`, `notes.md`, and `docs/merge-requests/human-patches/027.md` (T005: the same patch figures); `specs/027-corpus-retrieval-adr/plan.md` (§9, departures), `tasks.md` (marks).
- Changed by T008, on the line's tip, the two pending corpus patches and their notes (none is a human-only path; nothing under `corpus/` outside `proposals/` is written, and under it only the recorded blob IDs and SHA-256s below): spec 022's `docs/merge-requests/2026-11-14-corpus-film-scripts.patch` and `docs/merge-requests/human-patches/022.md`; spec 026's `docs/merge-requests/<date>-corpus-dog-intro.patch` (its T019's name) and `docs/merge-requests/human-patches/026.md`; each proposal's line that records its patch's blob ID and SHA-256 (`corpus/proposals/film-scripts-2026-11-14.md`, `corpus/proposals/dog-intro-2026-11-14.md`, or 026's FR-017 fallback under `docs/merge-requests/`), where the proposal records them.
- Already on this branch: `docs/adr/0054-…`, `docs/adr/README.md` (the index row), `intent/027-…`, `specs/027-…/*`, `docs/merge-requests/human-patches/027.md`.
- Not touched: `apps/web/build/twin-pack.ts`, `corpus/**` outside `proposals/`, `config/**`, `services/**`, `.claude/**`, `evals/agent-config/**`, any human-only path.
- **Overlap**: no other night spec's plan touches `apps/web/package.json`, `twin-pack.ts`, or `docs/adr/README.md` (checked on each `night/spec-0NN` branch). Two pending corpus patches regenerate with `npm run twin:pack -w apps/web` (Q144, Q145):
  - **Spec 026's** (item f, the dog-intro; `docs/merge-requests/human-patches/026.md`, item 1) adds `04`'s first "Do not claim" block: 136 characters in every turn's rules (`renderRules`, `apps/web/build/twin-pack.ts`: the 38-character header `[04-hobbies-and-travel] Do not claim:` with its line break, `- `, the 94-character bullet of 026's FR-021, "That the dog in the room is a real dog: it is an AI-made likeness, not a photo or a recording.", and its two line breaks). It leaves mission 1 character of its 137 and hobbies and travel 130 of its 266, and with its Arya line under "## Arya" (026's plan §3: at least 137 more characters in `04`'s sections, its fixed words, a 10-character date standing in for his approval's, and its line break, before his approval's disclosure line) is projected to take hobbies and travel past T1: 266 − 136 − 137 = −7. Read at `night/rework2-spec-026/rework2-spec-026`, b12ac0ba (`git --no-replace-objects`), whose tree is `night/rework-spec-026/rework-spec-026`'s at 3417bff2.
  - **Spec 022's** (item g, the film scripts; `docs/merge-requests/human-patches/022.md`) adds five "Do not claim" lines to `08`'s existing block, each its text plus 3 characters; after 026's, any one takes mission past T1, and alone they do once they total more than 137.
  - Neither is applied on the line; each is a patch for his hand. **T008** (after T004) adds `docs/corpus-size.json` to both patches' regenerated sets on the line's tip, under spec 026's rule that the patch he applies second is rebuilt on the first (`human-patches/026.md`, last paragraph: "If spec 022's corpus patch (the film scripts) is applied first, item 1 is rebuilt on it, and the reverse"): each patch is regenerated on a plain export of the line's tip with the patch alone, so each carries the record its own corpus change gives, and each patch's note names the stage its record shows (expected: "stage 1 due" for both, 026's for hobbies and travel, 022's for mission if its lines pass 137). The patch he applies second, rebuilt on the first, carries the record of both. A patch not yet built when T008 runs is noted there; built later, its `twin:pack` run writes the record itself.
  - If the Author applies either patch before this branch merges, the implementer regenerates the record after merging `main`.
  - **The projected figures are final only from T008's records.** The figures above (136, 94, mission 1, hobbies and travel 130 and −7) are read from 026's patch as it stands at b12ac0ba, and 026's text may still move. T005 takes the final figures from the records T008 measures on each patch's export (each topic's `margin`, the `base`'s `rules`, the stage) and corrects each place they appear before the line is named for his merge: ADR 0054's Decision 1 and Consequences; spec.md's Q144, Edge Cases, and Assumptions; this section and R-3; tasks.md's T007 and T008; `docs/merge-requests/human-patches/027.md`; analysis.md; notes.md. Each figure names the record (patch and line commit) it comes from. A patch not built when T008 runs keeps its projected figures, marked as projected, with the commit of its spec read.

## 8. Risks

| # | Risk | Answer |
|---|---|---|
| R-1 | The replica's figures differ from the check's | T005 takes the check's and records the difference in §9 |
| R-2 | The record's freshness test fails on a corpus, prompt, or `limits.twin` change made without the command | The message names the command; the same command already regenerates the pack those changes need (Consequences) |
| R-3 | Spec 026's `04` block (136 characters) and Arya line take hobbies and travel past T1 (−7), and leave mission 1; spec 022's `08` lines then take mission past T1 | Projected, not measured, until he applies a patch (Q144); T005 replaces the projected figures with T008's records in every place they appear (§7). A note, not a failure (Q4); FR-008 keeps the turn working; each patch's note names the stage its record shows (T008); stage 1's spec is the next item once he applies either patch and the record reads "stage 1 due" |
| R-6 | A pending patch, regenerated without the record, fails the record's freshness test on his branch | T008 adds the record to both patches' regenerated sets; a patch built later gets it from `twin:pack` itself |
| R-7 | The fit check's model differs from what the gateway sends (the lead, JSON escaping, the framing estimate) | The record says so (`model`) and counts each topic's lead beside its margin; the ADR names the difference (FR-010) |
| R-4 | `twin:pack`'s two steps: the first fails | `&&` stops the second, so no record is written over a stale pack |
| R-5 | The site's global build makes the small test slow | Run one file; the build is per run, not per file (§5) |

## 9. Departures

The implementer records here any difference from §4, and the replica-versus-check difference from T005.

- **D1 (T003, impl-027): `computeRecord(reader)`**, a function §4 doesn't list: the record from a tree through a `PackReader` (the committed pack, the prompt, the budgets, `measureFiles`), returning `{ record, stage, measure }`; it throws on a missing or unparseable pack, and `main` turns that into one stderr line and exit 1. The "fresh", "deterministic", and "reads only" cases call it, so the tests and the CLI compute the record one way.
- **D2 (T003): the budgets' source** is read with the workspace's `yaml` parser (already a dependency of `twin-pack.ts`; no new one), since `fitLimits` returns values, not where they came from: `"config/budgets.yaml"` when `limits.twin` holds all three keys as integers, else `"defaults"`, as §4 says.
- **D3 (T003): the import path** is `./twin-pack` without the extension, as every other `apps/web/build` import is written; the imports are §4's list (`PackSection` is a type; `TwinPack`'s `topics` and `selectables` are read, not imported functions).
- **D4 (T003): small exports beside §4's**: `renderLead` (the lead's template, which the "lead" case holds equal to `render.ts`'s), `MODEL`, `ADR_PATH`, `GENERATED_BY`, `UNIT`, and the record's types (`PackMeasure` and the rest).
- **D5 (T003): the stage's edges, where §4 leaves room**: T2 compares free talk's room with the rankable characters × the threshold, unrounded (the record's `share` is rounded to 4 places for reading only); with no rankable section, `share` is 1 and T2 isn't measured. A threshold is in `band` only when it isn't crossed. T1's band notes are one per topic in the band (today mission and hobbies and travel), e.g. `corpus:size: T1 band: the topic mission is within 137 characters of T1 (21,045 of the room's 21,182; ADR 0054)`; T2's and T3's band notes give the share or the pack's size. The stdout summary names the topic with the smallest margin.
- **D6 (T001, recorded by verify-027 after rv-impl-027's N2): the line's order.** §7 and T001 put implementation on the line after item f (spec 026). The supervisor moved T001's merge ahead of item f's (Q171): impl-027 merged `night/verify2-020/verify2-020` (3767859f, items 1 to 3; merge commit a90b0e82), then `night/verify-021/verify-021` (b3d043a2, item 4; 1da30321), and verify-027 put the item on the line after item 6 (verify-023, bb839ff1). Neither pending corpus patch (spec 022's, spec 026's) is on the line's tip, so T002 to T004 measure today's corpus only, and T008, T005's patch figures, and T007's patch figures wait until both patches are on the line (notes.md, "What waits (Q171)"). Nothing measured moved: `git diff --stat 3c0e4cd0 HEAD -- corpus/ config/twin/ config/budgets.yaml` was empty at T001.
