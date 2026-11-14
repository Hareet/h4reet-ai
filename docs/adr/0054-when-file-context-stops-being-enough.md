# ADR 0054: When file context stops being enough: today's corpus measured, three thresholds (retrieval within a topic, vectors, a vector database), and nothing built until one is crossed

Status: proposed, 2026-11-14 · Spec: 027 (FR-001 to FR-014; its Clarifications Q1 to Q8, each the recommended answer, provisional under the Author's order of 2026-11-13) · Number: 0054, the next free on `main` (0011, 0035, and 0037 are reserved there) · Accepted when the Author merges the night line that carries spec 027. Measured on `main` at 3c0e4cd0.

## Context

**The Author's item**, as his orders file lists it; his own words are the quoted letter and title:

> j) "future knowledge corpus gains answers or more questions as we go to RAG then we go to vector DB and answers to why we are okay using file context as of now and this size"

**His earlier words on the corpus's size**, in intent 015's cost-meter item:

> "we chose haiku since our context base is small and manually evaluated haiku and sonnet"

**What the twin does today** (ADR 0040, spec 007). The room's build compiles the corpus's topic files and filled slots into one committed pack, `config/twin/corpus.json`. A turn's prompt holds the twin's instructions (`config/twin/prompt.md`), then the grounding, then the conversation, within one input bound, `config/budgets.yaml`'s `limits.twin.max_input_chars`, 32,000 characters (the Author's P-2). The grounding is:

- **A topic's turn** (a selectable in the room: hobbies and travel, mission, work projects): the rules (every "Do not claim" bullet, and `01`'s ownership rulings), `00-profile.md`, and the topic's whole files. This is "file context". A topic section that doesn't fit is dropped in reverse file order (spec 007, FR-008).
- **Free talk**, and a topic's follow-up while free talk is ready: the rules, `00`, then the sections an in-process BM25 ranking (`services/gateway/src/twin/retrieve.ts`) scores highest for the visitor's newest turn, each added while it fits. This is already retrieval, lexical, with no model and no store.

**How the gateway counts tokens.** Before a call, one token per character of input: a call's reservation counts its input bound as that many tokens (`services/gateway/src/meter/admission.ts`, `maxMicroOf`: "the input cap, counted one token per character"). A character is a JavaScript string's length (UTF-16 code units). After a call, the gateway records the provider's own reported count. This ADR's figures are characters, so each is also the gateway's pre-call token count. No provider count is converted from them; the ones cited below were observed.

### Today's corpus, measured

At 3c0e4cd0. Bytes are UTF-8 bytes; words are runs of non-white-space characters; characters are the gateway's unit.

| Part of `corpus/` | Files | Bytes | Words | Characters (= the gateway's tokens before a call) | Measured? |
|---|---:|---:|---:|---:|---|
| Topic files, `00` to `08` | 9 | 96,567 | 15,089 | 96,128 | yes: the pack's source |
| `facts/*.yaml` | 11 | 17,556 | 2,312 | 17,544 | yes: filled slots enter the pack |
| **What the twin is built from** | **20** | **114,123** | **17,401** | **113,672** | |
| `intake/` | 6 | 53,641 | 8,883 | 53,499 | no: source material the twin never reads |
| `proposals/` | 8 | 154,418 | 23,223 | 154,209 | no: not in the corpus until the Author applies one |
| `tools/` | 2 | 7,770 | 840 | 7,750 | no: the check's code |
| `README.md`, `INTAKE.md`, `.gitignore` | 3 | 11,628 | 1,885 | 11,560 | no: about the corpus |
| All of `corpus/` | 39 | 341,580 | | | for scale |

**The pack**, compiled from the first two rows: 131 sections, 153,697 bytes as a file. Rendered as the prompt sends them (each with its delimiter line), the sections take 84,391 characters, the longest 3,140; the rules take 5,833. `00-profile.md`'s sections take 6,189, so the rules and `00`, which every turn holds, take 12,022.

**The room** a turn's grounding has, at the worst case, a whole conversation beside it (spec 007's fit check, D20): 32,000 − 6,290 (the instructions, the longer path's) − 400 (the framing) − 4,128 (the conversation: `history_max_chars` 4,000 + 8 turns × 16) = **21,182 characters**.

**Each topic file as a topic's grounding** (the rules + `00` + the file), against the room:

| File | Bytes | Words | Characters | Rendered in the pack | Grounding as a topic | Share of the room | Margin | A selectable topic today |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `00-profile.md` | 7,427 | 1,160 | 7,367 | 6,189 | (in every turn) | | | |
| `01-ai-strategy-and-cht.md` | 33,175 | 4,963 | 32,946 | 30,059 | 42,081 | 198.7% | −20,899 | no |
| `02-production-infrastructure-national-scale.md` | 8,768 | 1,174 | 8,724 | 7,456 | 19,478 | 92.0% | 1,704 | no |
| `03-grants-and-credits.md` | 2,890 | 423 | 2,872 | 2,049 | 14,071 | 66.4% | 7,111 | no |
| `04-hobbies-and-travel.md` | 9,822 | 1,727 | 9,804 | 8,894 | 20,916 | 98.7% | 266 | hobbies and travel |
| `05-mission.md` | 10,158 | 1,663 | 10,142 | 9,023 | **21,045** | **99.4%** | **137** | mission |
| `06-work-projects.md` | 8,679 | 1,298 | 8,663 | 7,621 | 19,643 | 92.7% | 1,539 | work projects |
| `07-denver-local-ai.md` | 10,349 | 1,754 | 10,331 | 8,797 | 20,819 | 98.3% | 363 | no |
| `08-hareet-ai.md` | 5,299 | 927 | 5,279 | 4,303 | 16,325 | 77.1% | 4,857 | no |

**Free talk's room** for ranked sections: 21,182 − 12,022 = 9,160 characters, 11.7% of the 78,202 characters of sections it may rank (every section but `00`'s).

**How to rerun it**, from the repository's root at 3c0e4cd0:

- Bytes and words: `LC_ALL=C.UTF-8 wc -c -w corpus/[0-9][0-9]-*.md corpus/facts/*.yaml`. (In the plain C locale `wc -w` gives 14,862 for the topic files: it skips the 227 runs, such as a lone dash, that hold no printable ASCII character.)
- Characters: `node -e 'const fs=require("fs");for(const f of process.argv.slice(1))console.log(fs.readFileSync(f,"utf8").length,f)' corpus/[0-9][0-9]-*.md corpus/facts/*.yaml`.
- The pack, the room, each grounding, and the stage: `npm run twin:pack -w apps/web`, which writes `docs/corpus-size.json` (spec 027's check). The per-topic figures above were first computed by a replica of the fit check (`fitProblems` in `apps/web/build/twin-pack.ts`); spec 027's tasks replace them with the check's own output, and the two must agree.

### The context each routed model gets

`config/routing.yaml` and the env templates, at 3c0e4cd0:

| Where | Adapter | Model | What a twin turn gets |
|---|---|---|---|
| prod, laptop, primary | `local` | `qwen3-30b-a3b-instruct-2507` (`deploy/env.example/prod.env.example`) | A slot of 16,384 tokens: `MODEL_CTX_SIZE=32768` ÷ `MODEL_PARALLEL=2`. Spec 007's D27 measured the twin's turns at 8,201 to 8,803 tokens by this server's count, and sized the slot to hold "even 32,000 characters at 2 characters a token, plus 300 out". |
| prod, laptop, fallback; prod, EC2, first | `anthropic` | `claude-haiku-5-5` | At most the gateway's bound, 32,000 characters in and 300 tokens out. D43 records "about 9k tokens in" for a twin turn on the paid path. The model's own window isn't recorded in the repository; the gateway's bound binds first. |
| prod, EC2, second | `bedrock` | `us.anthropic.claude-haiku-5-5` | The same. |
| dev and dev-cpu, primary | `local` | `qwen2.5-0.5b-instruct` | A slot of 4,096 tokens (8,192 ÷ 2), below a twin turn's measured size; dev's twin turns don't fit its local slot. That is outside this ADR, and recorded here only because the comparison shows it. |

A paid twin call's reservation, at `config/prices.yaml`'s Haiku 5.5 price ($0.10 a million input tokens, $0.50 output): 32,000 × 0.10 + 300 × 0.50 = 3,350 micro-USD, whatever the grounding holds.

## Decision

1. **File context stays, and nothing is built now** (Q1). A topic's turn holds the rules, `00`, and its whole files; free talk ranks sections lexically; the pack stays committed and in-process. Why this is enough at this size:
   - Every selectable topic fits whole at the worst case: the closest, mission, is 21,045 of 21,182 characters. A topic's turn therefore holds every sentence the corpus has on its topic. Nothing is retrieved, so nothing is missed by retrieval, and the guards, which hold an answer to the grounding's words, never withhold a true claim from the topic for lack of grounding.
   - What the twin is built from is 113,672 characters, and the pack's 131 sections are 84,391: "small", in the Author's word, measured. Free talk already retrieves, over 131 sections, in process, with no model and no store, and it holds 11.7% of them in a turn.
   - Everything stays deterministic and reviewable: one pack, its hashes, readiness by hash (ADR 0040). A vector step adds a model whose output must itself be evaluated.
   - The input bound, not the size of the corpus, sets the cost of a paid call: retrieval wouldn't lower the reservation unless the bound came down too.

2. **Three thresholds, each in a measured unit, each the Author's to change** (Q2, Q6). The check computes each on every run.

   | | Stage it starts | Crossed when | Today | Note band |
   |---|---|---|---|---|
   | **T1** | 1: retrieval within a topic (RAG for a topic's turn) | any selectable topic's grounding passes the room (21,182 at his `limits.twin`) | mission at 21,045, 99.4% | from 95% of the room (20,123): mission and hobbies and travel are in it |
   | **T2** | 2: vector retrieval, in-process, from vectors committed in the pack | free talk's room falls under 5% of the rankable sections' characters, or the Author's live runs record a free-talk miss that the corpus answers | 11.7% (9,160 of 78,202) | from 7.5% |
   | **T3** | 3: a vector database, a service in the one compose topology | the pack passes 10 MiB (10,485,760 bytes) or 10,000 sections | 153,697 bytes; 131 sections | from half of either |

   T1 is the fit check's worst case, so the check and this ADR agree; at an opening, with no conversation, the room is about 4,128 characters larger, so a crossing first shows in long conversations. T2 is a ratio because the smaller the share of the pack a turn can hold, the more a lexical miss costs; at today's room it falls at about 183,000 characters of sections, 2.3 times today's. The check measures T2's ratio only; a free-talk miss in a live run is the Author's to record, on the decision page, and calls for stage 2's spec the same way. T3's figures are where vectors in a committed, reviewed file stop being reasonable to load at the gateway's start and to diff in git.

3. **At T1, retrieve within the topic, rather than raise the bound** (Q3). Stage 1 ranks the topic's own sections with the existing lexical ranker against the turn (an opening keeps file order), after the rules, `00`, and the lead, in place of FR-008's drop in reverse file order. Raising `max_input_chars` (the schema allows 64,000) needs prod's model server at one slot of 32,768 tokens, which is the Author's env file and his GPU's memory, and grows every paid reservation; it stays his option.

4. **A crossing is a note, and the stage is in the diff** (Q4). The check prints one note per crossed threshold, naming it, its figure, and this ADR, and writes the stage into `docs/corpus-size.json`; the build and the tests still pass. The commit that crosses a threshold shows it; the next step is a spec for that stage.

5. **The record** (Q7, Q8): `docs/corpus-size.json`, written by `npm run twin:pack -w apps/web`, the command every corpus change already needs, from the topic files, `facts/`, the pack, the prompt, and `limits.twin` alone, and freshness-tested beside the pack. Nothing at run time reads it.

6. **How the corpus "gains answers or more questions as we go"**, by the paths the repository has, each by the Author's hand:
   - He edits a topic file, or applies a proposal an agent wrote in `corpus/proposals/` (the Golden Q&A of 2026-11-06, spec 022's film scripts): new sections and Golden Q&A, which are new answers.
   - He fills a facts slot (`value`, `tag`, `source`, `public_safe: true`), and the twin may say its number.
   - A gap is a question the corpus holds open. In `corpus/README.md`'s words: "every `[?]` and empty slot is an "I don't know that yet" test". Resolving one turns a question into an answer; a new `[?]` adds a question.
   - Not from visitors. The corpus records the privacy promise in his words of 2026-11-06 (`08-hareet-ai.md`): "We disclose every data flow, their conversation is not saved and they can look at the GitHub repo for how all the code works." So the questions the corpus gains come from the Author, his interviews in `intake/`, his live runs, and the evals generated from the corpus, never from a visitor's conversation.

   Each gain moves the pack, its cases, and the record in one command, and the record says which stage the new size calls for.

## Alternatives considered

- **Build stage 1 now**, since mission has 137 characters left. Code that changes how every topic's turn is grounded, and needs the Author's live runs again, for a crossing that hasn't happened and that the record will show when it does. Rejected provisionally (Q1).
- **Raise the input bound at T1** (Q3's other answer): needs one model-server slot and a larger reservation on every paid call. Left as the Author's option.
- **Send the whole pack every turn** (long context): 90,224 characters with the rules, almost three times the bound, 2.75 times what a local slot holds at D27's worst case of 2 characters a token (32,768), and about three times the paid reservation. Rejected.
- **Vectors now** (embeddings in the pack): an embedding model to run, call through the gateway, and evaluate, for 131 sections, while no lexical miss has been recorded. Rejected until T2.
- **A vector database now**: a new service in every environment, the local tier included (Principle I), for a 153,697-byte pack. Rejected until T3.

## Consequences

- `npm run twin:pack -w apps/web` writes one more file, and a change to the prompt or to `limits.twin` now also needs it, which the record's test names when it fails.
- Every "Do not claim" line added anywhere shrinks every topic's margin by its length, since the rules are in every turn. Spec 022's proposal adds some to `08`; its regenerated record will show whether mission crosses T1.
- `01-ai-strategy-and-cht.md`, the corpus's priority 1, can't be a whole-file topic: its grounding is 42,081 characters, almost twice the room. Opening a selectable on it starts at stage 1.
- On `main`, `services/gateway/src/twin/grounding.ts` computes the dropped sections' count, and no log or span carries it, though spec 007's plan §4 says "the drop is a log field". Stage 1's spec starts with it (Q5).
- **Each later stage's cost**: stage 1, none at run time (in-process ranking, no model). Stage 2, one embedding of the visitor's turn per ranked turn, on the local model server at no marginal cost, plus the pack's vectors at build time, through the gateway; no adapter in `config/routing.yaml` offers embeddings today, so a paid route would be a new adapter, a new price line, and a new data-flow disclosure row; its degraded mode is today's lexical ranking. Stage 3, a service in every environment, under the server budget (ADR 0044), estimated by its own spec.
- Changing a threshold is an amendment of this ADR and the check's constant in the same commit.

## Links

Intent: `intent/027-corpus-retrieval-adr.md` (draft) · Spec: `specs/027-corpus-retrieval-adr/` · ADR 0040 (the conversation core), ADR 0019 (llama.cpp), ADR 0041 and 0044 (the paid adapters and prod's hosts) · Spec 007's plan, D5, D17, D20, D27, D43 · Spec 022 (the film-scripts proposal) · Record: `docs/corpus-size.json`.
