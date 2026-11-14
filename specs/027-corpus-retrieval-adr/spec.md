# Feature Specification: When the Twin's File Context Stops Being Enough (Corpus Retrieval ADR)

**Feature Branch**: `night/spec-027/spec-027` (the spec's branch; reworked on `night/rework-spec-027/rework-spec-027` after the Opus review rv-spec-027); implementation later runs on one line after item f (spec 026), the implementer merging this branch first ([plan.md](plan.md) §7).

**Created**: 2026-11-14

**Status**: Draft, specified on 2026-11-14 from the draft intent ([`intent/027-corpus-retrieval-adr.md`](../../intent/027-corpus-retrieval-adr.md)). Nothing under `corpus/` is written by this spec or its build.

**Input**: the intent; `corpus/` on `main` at 3c0e4cd0 (`corpus/README.md`, the topic files `00` to `08`, `facts/*.yaml`); `config/twin/corpus.json`, `config/twin/prompt.md`; `config/routing.yaml`; `config/budgets.yaml` (`limits.twin`); `config/prices.yaml`; `deploy/env.example/*.env.example` (the model server's `MODEL_CTX_SIZE`, `MODEL_PARALLEL`); `apps/web/build/twin-pack.ts` (the pack's build and its fit check); `services/gateway/src/twin/` (`grounding.ts`, `retrieve.ts`, `turn.ts`); `services/gateway/src/meter/admission.ts` (how the gateway counts a call's input before it is made); ADR 0040 (the twin's conversation core) and spec 007's plan (its D5, D17, D20, D27, D43); the constitution's Principles I, V, VIII.

Summary: the twin answers from a committed pack compiled from the corpus (ADR 0040). A topic's turn holds the rules, `00-profile.md`, and the topic's whole files; free talk adds sections a lexical ranking (BM25) scores highest, while the prompt stays within the input bound. Nobody has recorded how big the corpus is, how close a turn is to its bound, or at what size the design must change. This spec writes that down as ADR 0054, measured, and adds one small check that keeps the measurement true as the corpus grows. It builds no retrieval: the ADR decides that nothing is built yet (Clarifications, Q1).

## Clarifications

### Session 2026-11-14, taken under the Author's order of 2026-11-13

The order's rule 1: "the spec-writer takes the recommended answer at clarify and at the plan". Each answer below is the recommended one, provisional, his to overturn on the morning page; an overturned answer is reworked before he merges. Each is also in `/night/io/out/questions.md`. The figures are measured on `main` at 3c0e4cd0 (ADR 0054's table; plan §2).

- **Q1: What does ADR 0054 decide to build now?** → Taken: nothing beyond the size record and its test. Stage 0, file context, stands: every selectable topic's grounding fits whole at the worst case (mission 21,045 of 21,182 characters, hobbies and travel 20,916, work projects 19,643), and free talk already ranks sections (BM25) into what's left. Others: build stage 1 (retrieval within a topic) now, because mission has 137 characters left; raise `limits.twin.max_input_chars`. Reading: the corpus grows only by the Author's hand, and the record shows the crossing in the commit that makes it, so stage 1 is specified when it is due, not before.
- **Q2: Where is T1, where file context stops being enough for a topic's turn?** → Taken: when any selectable topic's grounding (the rules, `00`, and every file of the pack topic, `pack.topics[].files`, rendered by the fit check's model) passes the room at the worst case, a whole conversation (`history_max_chars` 4,000 + 8 turns × 16) beside it: 21,182 characters at the Author's `limits.twin`. A note band starts at 95% of the room (20,123). Others: the room at an opening, with no conversation, about 4,128 characters looser; a fixed margin floor, such as 1,000 characters. Reading: the worst case is the fit check's own (spec 007, D20), so the two agree; at an opening the turn still fits, so crossing T1 first shows in long conversations, where FR-008 drops the topic's last sections.
- **Q3: At T1, retrieve within the topic, or raise the input bound?** → Taken: retrieve within the topic (stage 1): the topic's sections ranked by the existing lexical ranker against the turn, in place of FR-008's drop in reverse file order. Others: raise `max_input_chars` (the schema allows up to 64,000) with prod's model server at one slot (`MODEL_PARALLEL=1`, 32,768 tokens); both, raise first. Reading: prod's template gives each local slot 16,384 tokens, which holds 32,000 characters only at D27's worst case of 2 characters a token; a higher bound needs one slot, which is his env file and his GPU's memory, and grows every paid call's reservation, which counts one token per character. Ranking costs nothing at run time.
- **Q4: When a threshold is crossed, a note or a failure?** → Taken: a note on the command's output, and the record's `stage` changing in the diff; the build and the test still pass. Others: fail `make test` until a stage's spec exists; fail only at T2 or T3. Reading: the fit check is a report, never a failure (spec 007, D20), and FR-008 keeps a crossed turn working; a failure would block the Author's own corpus commit.
- **Q5: The run-time count of dropped sections: add it now?** → Taken: no; it is stage 1's first task, and this spec records the gap. Spec 007's plan §4 says a dropped section is "counted (`h4.twin.turns`' outcome stays `ok`; the drop is a log field, no text)", and on `main` `services/gateway/src/twin/grounding.ts` computes `dropped`, but no log or span carries it. Others: add the log field and a span attribute in this spec; hand it to a spec 007 fix. Reading: the build-time record measures the worst case, which crosses before any real turn does, so it is the earlier signal; the run-time count says how often real turns hit it, which matters once stage 1 is due.
- **Q6: The T2 and T3 figures?** → Taken: T2, vector retrieval, when free talk's room is under 5% of the rankable sections' characters (today 9,160 of 78,202, 11.7%), or when the Author's live runs record a free-talk miss the corpus answers; T3, a vector database, when the pack passes 10 MiB (10,485,760 bytes; today 153,697) or 10,000 sections (today 131). Others: T2 at 10%; T3 never, vectors staying in the committed pack; T3 at 1 MiB. Reading: the session's figures, set where today's measure has room to grow (T2 at about 2.3 times today's sections, T3 at about 68 times the pack's bytes); each is the Author's to change in the ADR, and the check reads them from one place.
- **Q7: Where does the record live, and what writes it?** → Taken: `docs/corpus-size.json`, written by `npm run twin:pack -w apps/web`, the command every corpus change already needs; freshness-tested by `apps/web/test/corpus-size.test.ts`. Others: `config/twin/corpus-size.json`, beside the pack; a command of its own. Reading: outside `config/`, so nothing at run time can read it; one command, so spec 022's patch, regenerated by that command, carries the record too.
- **Q8: Which parts of `corpus/` are measured?** → Taken: the topic files (`NN-*.md`) and `facts/*.yaml`, which the pack is built from; `intake/` (source material the twin never reads), `proposals/` (not applied until the Author applies them), `tools/` (code), and `README.md`, `INTAKE.md`, `.gitignore` (about the corpus) are excluded, and the ADR gives their sizes once for scale. Others: measure all of `corpus/`; add the proposals as "pending growth". Reading: what the twin can say is what the pack holds.

### Session 2026-11-14 (rework after rv-spec-027), taken under the same order

Two questions the review raised, numbered by the decision page. Each answer is the recommended one, taken under the orders file's rule ("Every question, new ones included: the recommended answer stands"), and provisional: his to confirm or overturn on the morning page.

- **Q144: Two pending corpus patches are projected to cross T1. Does Q1 still stand?** → Taken: yes, nothing more is built tonight. Spec 026's patch (item f, the dog-intro) adds the first "Do not claim" block for `04`: 133 characters in every turn's rules (the 38-character header `[04-hobbies-and-travel] Do not claim:` and its line break, then the bullet's 91 characters and its line breaks), which leaves mission 4 characters and is projected to take hobbies and travel past T1 (its Arya line adds at least 137 more characters to `04`'s own sections, before his approval's disclosure line). Spec 022's patch (item g, the film scripts) adds five "Do not claim" lines to `08`'s existing block, each its text plus 3 characters; applied after 026's, any one of them takes mission past T1. Stage 1's spec is the next item once he applies either patch and the record reads "stage 1 due". Others: specify stage 1 tonight, ahead of the patches; raise `max_input_chars` in the same patches. Reading: both patches wait for his hand, so the crossing is projected, not measured; the record measures it in the commit that applies a patch (Q145), and FR-008 keeps a crossed turn working until stage 1 lands.
- **Q145: How does the record travel with the two pending corpus patches?** → Taken: a task after T004, in which 027's implementer, on the line's tip, adds `docs/corpus-size.json` to both pending patches' regenerated sets, under spec 026's rule that the patch he applies second is rebuilt on the first (`docs/merge-requests/human-patches/026.md`, its last paragraph); each patch's note names the stage its record shows. Others: leave the record out of the patches and let the freshness test fail after he applies one, naming the command; regenerate the record in a patch of its own. Reading: once 027's code is on the line, `npm run twin:pack -w apps/web` writes the record, so a patch regenerated by it without the record would fail the record's freshness test on his branch; and the note tells him, before he applies it, which stage the patch calls for.

## Source: The Author's Words

- **His item**, as his orders file lists it; his own words are the quoted letter and title:
  > j) "future knowledge corpus gains answers or more questions as we go to RAG then we go to vector DB and answers to why we are okay using file context as of now and this size"

  The orders file's line under it (its wording, not a quote of his): "Its first step is an ADR on when file context stops being enough, with the measured size of today's corpus. It's built only as far as that ADR decides."
  Reading: three questions for the ADR. Why file context is enough now, at this size; at what measured size RAG, then a vector DB, would start; and how the corpus gains answers or questions over time.
- **How far the night goes**, his words of 2026-11-13: "I'd like them to keep going beyond the plan and approval and finish implementation and keep merging down to as few patches and gates as we've seen the difficulty there. Ensure there are small tests that can be run instead of the whole suite over and over".
  Reading: one small test file for the check (plan §5), and the record regenerated by the command the corpus already needs, so no new step is added to his corpus edits.
- **His earlier words on the corpus's size**, from intent 015 (`intent/015-explainer-films.md`), in the parenthesis of his cost-meter film item: "we chose haiku since our context base is small and manually evaluated haiku and sonnet".
  Reading: the ADR quotes this as the reason the routed model was chosen, and measures "small".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The Author Reads Why File Context Is Enough Today, and When It Stops (Priority: P1)

As the Author, I want one ADR that says how big the corpus is today, how much of it each kind of turn can hold, why that is enough now, and the measured sizes at which retrieval within a topic, then vectors, then a vector database would have to start, so I can accept the decision, or change a threshold, without reading the code.

**Why this priority**: it is the item.

**Independent Test**: read `docs/adr/0054-when-file-context-stops-being-enough.md`; rerun each measurement by the command it names, at the commit it names, and get its figures.

**Acceptance Scenarios**:

1. **Given** the ADR, **When** the Author reads its measured size, **Then** each figure names its unit, its method, and a command he can rerun, and the commit it was measured at.
2. **Given** the ADR, **When** he looks for the thresholds, **Then** each is a figure in a measured unit, with today's value beside it and the step it starts.
3. **Given** the ADR, **When** he reads how the corpus gains answers or questions, **Then** every path it names is one the repository has today, and the privacy promise is quoted in the corpus's own words.

---

### User Story 2 - The Measurement Stays True as the Corpus Grows (Priority: P1)

As the Author, I want a committed record of the measured size that moves in the same commit as the corpus, the prompt, or the input bound it measures, so the ADR's figures can't silently go stale, and a crossed threshold shows up in the diff.

**Why this priority**: an ADR's figures go stale the day the corpus changes; the record is what keeps "this size" true.

**Independent Test**: `npx vitest run apps/web/test/corpus-size.test.ts` (plan §5): the committed record equals the one the check computes from the committed pack, prompt, budgets, and corpus files; on fixtures, a grounding one character under the room is stage 0 and one character over is "stage 1 due".

**Acceptance Scenarios**:

1. **Given** a corpus change regenerated by `npm run twin:pack -w apps/web`, **When** the change moves the size, **Then** `docs/corpus-size.json` changes in the same run.
2. **Given** a corpus, prompt, or `limits.twin` change without the regeneration, **When** the test runs, **Then** it fails and names the command.
3. **Given** a selectable topic (a pack topic, its files together) whose grounding passes the room, **When** the record is generated, **Then** its stage reads that stage 1 is due, the command prints a note naming ADR 0054, and the build still succeeds.

---

### User Story 3 - The Next Step Is Named When a Threshold Is Crossed (Priority: P2)

As an agent or the Author changing the corpus, I want the record to say which stage the measured size calls for and what ADR 0054 says to do next, so a crossing becomes a spec, not a surprise in a live run.

**Why this priority**: it turns the ADR's thresholds into something that acts.

**Independent Test**: the fixture cases of the same test file: each threshold crossed alone sets its stage and its note.

**Acceptance Scenarios**:

1. **Given** free talk's share of the rankable sections below the stage-2 floor, **When** the record is generated, **Then** it reads that stage 2 is due.
2. **Given** a pack above the stage-3 size or section count, **When** the record is generated, **Then** it reads that stage 3 is due.

### Edge Cases

- **`limits.twin` absent** from `config/budgets.yaml`: the record uses FR-027's defaults (spec 007), as the fit check does, and records which it used.
- **A topic file that isn't a selectable topic yet** (today `01` to `03`, `07`, `08`; `00` is in every turn): the record still measures it as if it were a one-file topic, as information outside T1, so the Author sees before opening a topic whether it fits whole. Today `01-ai-strategy-and-cht.md` does not, by about twice.
- **A "Do not claim" line added anywhere**: the rules go into every turn, so every topic's margin shrinks. A line added to a file's existing block costs its text plus 3 characters (`- ` and a line break); the first line of a file that has none costs its text plus the file's header and line breaks, 42 characters for `04` (the header `[04-hobbies-and-travel] Do not claim:` is 38 with its line break). Two pending patches do this: spec 026's adds `04`'s first block, 133 characters, leaving mission 4 and projected to take hobbies and travel past T1 (with its Arya line); spec 022's adds five lines to `08`, and after 026's any one takes mission past T1 (Q144). The record shows it in the run that regenerates each patch (Q145).
- **A selectable with a lead**: the gateway puts the lead in the system message (`renderLead`, "The piece's lead: …" and a blank line), and the fit check doesn't count it; the record counts it beside the topic as information, not in T1 (FR-010; a new question on the page, recommended answer taken: no). Today the snowboard's "Winter hobbies first." takes 41 characters of hobbies and travel's 266.
- **The prompt grows**: the instructions come off the same bound; the record moves.
- **A new topic file or a new selectable**: measured on the next run, no code change.
- **The pack is invalid or missing**: the record's generation fails with the pack's own error and writes nothing; the gateway and `make up` are untouched, since nothing at run time reads the record.
- **A threshold crossed**: a note, never a failure (Clarifications, Q4).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The spec MUST add ADR 0054, `docs/adr/0054-when-file-context-stops-being-enough.md`, `Status: proposed`, with Context, Decision, Alternatives considered, Consequences, and Links, and its row in `docs/adr/README.md`'s index.
- **FR-002**: ADR 0054 MUST record today's measured size at a named commit of `main`: bytes, words, and characters for the corpus's topic files and its facts files; what is excluded (`intake/`, `proposals/`, `tools/`, the README and `INTAKE.md`) and why; the pack's sections, characters, and bytes; and each topic file's grounding against the room a turn leaves it. Each figure MUST name its unit, its method, and a command to rerun it.
- **FR-003**: ADR 0054 MUST count tokens the way the gateway does: before a call, one token per character of input (`services/gateway/src/meter/admission.ts`, `maxMicroOf`), which is also how the input bound is set; after a call, the provider's own reported count. It MUST say which of the two each figure is, and MUST NOT state a provider's token count it did not observe; the ones it cites come from a recorded source.
- **FR-004**: ADR 0054 MUST set the measured size beside the context each routed model gets, per `config/routing.yaml`: the gateway's input bound (`limits.twin.max_input_chars`) and output cap, the local model server's slot (`MODEL_CTX_SIZE` ÷ `MODEL_PARALLEL`, per env template), and the paid adapters' models.
- **FR-005**: ADR 0054 MUST answer "why we are okay using file context as of now and this size", from the measurements.
- **FR-006**: ADR 0054 MUST name three thresholds, each in a measured unit with today's value beside it and the stage it starts: T1, retrieval within a topic (RAG for a topic's turn); T2, vector retrieval (embeddings) in place of the lexical ranking; T3, a vector database. Each MUST be marked as the Author's to change.
- **FR-007**: ADR 0054 MUST describe how the corpus "gains answers or more questions as we go", naming only paths the repository has, and MUST quote the corpus's privacy promise in its own words where it says what that means for visitors' questions.
- **FR-008**: The check MUST write `docs/corpus-size.json`, deterministically (two runs, identical bytes), as part of `npm run twin:pack -w apps/web`, reading only the corpus's topic and facts files, `config/twin/corpus.json`, `config/twin/prompt.md`, and `config/budgets.yaml`; never `intake/`, `proposals/`, `tools/`, or any private file.
- **FR-009**: The record MUST hold no commit or date (its commit is the one it is in, so two runs agree), and MUST hold: the measured size (bytes, words, characters, per group and per topic file); the limits it used and their source (the budgets file or the defaults); the instructions' characters, the framing, the conversation's worst case, and the room; each pack topic's grounding (the rules, `00`, and every file in `pack.topics[].files`), its share of the room, its margin, and its selectables' longest rendered lead; each topic file's grounding as if it were a one-file topic, its share and margin, and the pack topics that hold it, as information; free talk's room and its share of the rankable sections; the pack's sections and bytes; the three thresholds; and the stage the figures call for.
- **FR-010**: The check MUST compute the room and each grounding by the fit check's model (spec 007's plan, D5 and D20), with its own functions and constants (`renderSection`, `renderRules`, `instructionsChars`, `fitLimits`, `FRAMING_CHARS`, `PER_TURN_CHARS` in `apps/web/build/twin-pack.ts`), so a topic the fit check names is exactly a topic past T1. The model is not the characters the gateway sends, and the record and ADR 0054 MUST say what it leaves out: the selectable's lead, which `services/gateway/src/twin/prompt.ts` puts in the system message (`renderLead`) and the run-time grounding counts (`grounding.ts`); JSON escaping of each quoted turn (`JSON.stringify`), beyond the 16 characters a turn is allowed; and the framing, an allowance of 400 against what the gateway writes (`CONVERSATION_HEAD`, 147 characters, `CONVERSATION_TAIL`, 177, the line breaks between the turns, and the grounding's heading). The record counts each topic's longest rendered lead as information beside its margin, not in T1.
- **FR-011**: WHEN a threshold is crossed THE check SHALL print one note naming the threshold, the figure, and ADR 0054, and SHALL still succeed (Q4). At T1 the note prints beside the fit check's existing note for the same topic (`twin:pack: note: the topic … needs … characters of grounding, past the … the input bound leaves (R-1); FR-008 drops its last sections, counted, at turn time`), which `npm run twin:pack -w apps/web` already prints: the fit check's says what happens at turn time, this one which stage ADR 0054 calls for.
- **FR-012**: WHEN the committed record differs from the computed one THE test SHALL fail with a message naming `npm run twin:pack -w apps/web`.
- **FR-013**: The spec MUST change nothing the twin reads at run time: the pack, the prompt, the lines, readiness, the gateway, and `config/routing.yaml` stay as they are; no model is called and no byte leaves a device.
- **FR-014**: Every quote in the ADR (the Author's words, the corpus's, a spec's) MUST be in its source's words, with its source.

### Key Entities

- **The size record** (`docs/corpus-size.json`): the measured size and the stage, generated, committed, freshness-tested.
- **The room**: the characters a turn's grounding may take at the worst case, `max_input_chars` − instructions − framing − a whole conversation (spec 007's fit check).
- **A grounding**: the rules + `00-profile.md` + a topic's files (a pack topic's `files`), rendered by the fit check's model (FR-010), which leaves out the lead and JSON escaping and estimates the framing.
- **The stages**: 0, file context (today); 1, retrieval within a topic; 2, vector retrieval; 3, a vector database.

## Success Criteria *(mandatory)*

- **SC-001**: The Author can rerun every figure in ADR 0054 by a command the ADR names, at the commit it names, and get the same figure.
- **SC-002**: A one-character move across any threshold changes the record's stage, in a fixture test.
- **SC-003**: The check's test file runs alone, as one file (rule 4's small test, plan §5); its own cases take under 2 seconds, beside the two site builds every `apps/web` vitest run makes first (`test/global-build.ts`).
- **SC-004**: No file the twin reads at run time changes: the readiness hashes (the pack's and the prompt's) are the same before and after the merge.

## Cost, degraded mode, telemetry, disclosure (CLAUDE.md's "new endpoint or feature")

- **Cost estimate**: none at run time; the check runs at build and test time, with no model call. The spec's own cost is the night's tokens. ADR 0054 estimates each later stage's cost.
- **Degraded mode**: unchanged; ADR 0040's stands. The record is a document: if it can't be generated, the test fails and the stack runs.
- **Telemetry span and dashboard panel**: none; no endpoint and no run-time feature is added. The run-time count of dropped sections is a question (Q5).
- **Data-flow disclosure**: no entry; no byte leaves the visitor's device or the local tier.

## Assumptions

- The measurement is taken on `main` at 3c0e4cd0; the pack's figures can be rerun by the check only from the line's commit that carries it (T005). The line's earlier items deliver corpus changes as patches for his hand, not as corpus changes, so they shouldn't move it before this spec's implementation; the implementer checks that (T001), regenerates the record after merging, and corrects the ADR's table to the check's figures (T005).
- Two of those patches are projected to cross T1 when he applies them (Q144): spec 026's (item f) adds `04`'s first "Do not claim" block, 133 characters in every turn's rules, leaving mission 4 characters and, with its Arya line, taking hobbies and travel past T1; spec 022's (item g) adds five lines to `08`'s rules, and after 026's any one takes mission past T1. Projected, since neither is applied; the record measures each when it is regenerated (Q145, T008). Q1 stands: nothing more is built tonight, and stage 1's spec is the next item once he applies either patch and the record reads "stage 1 due".
- The paid model's own context window is not recorded in the repository and is not needed: the gateway sends no more than its input bound, which binds first (FR-004).
- No constitution control is deferred or dropped. Principle II's "telemetry that makes it observable in production" applies to a run-time capability; this spec adds none (Q5 records the run-time gap it found).
