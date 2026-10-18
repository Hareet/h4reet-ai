# feat/002-us3-narration
Spec: specs/002-the-room/ (Phase 5, User Story 3: T050–T054 and T056; FR-011, FR-012, SC-006) · Intent: specs/002-the-room/intent.md · Written by: Claude Code (Opus 5.5), an implementer subagent · Date: 2026-10-18
Session: worked in `/tmp/claude-1000/wt-002-narration`, launched from `~/h4reet-ai/h4reet-ai` · Repo hooks active: yes. No refusals. The post-edit hook reformatted two files written with the Write tool (a test, and a scratch copy of the proposal's head, whose `*led*` it made `_led_`; the committed proposal quotes those rulings as code spans instead), and flagged lint in scratch scripts outside the tree, never committed. A first `npm install` failed on the read-only npm cache and left half-extracted packages; `node_modules` was copied again and installed with a cache under `$TMPDIR`, and `package-lock.json` is unchanged.
Authorized by: the Author's direction of 2026-10-17, "Let's relax some of the overnight rules so that you can continue with intent 002 and intent 003? I think you can create the tasks and implement them and we can always go back later and re-do a task or requirement if we highlight a needed change"; tasks.md T050–T054 and T056, against plan §5, research.md R-07 and R-08, data-model.md §3 and §5, and contracts/narration.md and resume-source.md.

**Status: ready for review. Review: pending (the integrating session runs it).**

**Merge order:** stacked on `feat/002-us1-resume` (32e426e, its review round's tip), which stacks on `feat/002-approvals`, `feat/002-web`, `spec/002-the-room`, and `spec/003-studio-assets`. Merge those first, in order, with their patches. This branch has no patch: it changes no human-only path.

**Beside it:** `feat/002-us2-room` (Phase 4), built in parallel. The shared lines this branch touched are listed under "For the Author".

Commits, after the rebase onto the resume's review fixes (the first two were written on d080221 and rebased cleanly):
- e9e8a2b: the tests, first (RED below);
- 2fef823: the code: the checks, the room-data part, the eval cases, the display, and the eval runner's refusal;
- 2ae252b: the thirty drafts and their thirty eval cases, written after the rebase, and three tests of the review's rules as narration inherits them;
- 38b3266: the proposal for you;
- 3d83f1a: plan.md's "What group 5 found", the contract, the data model, the README, and tasks.md;
- this note, first as a save point, then with `make check`'s output.

## Runs in the Author's terminal

ADR 0017 puts this section first. Nothing here is a patch.

| What | How it runs | Check before you run it |
|---|---|---|
| `make corpus-check` | your terminal, after the merge | `corpus/tools/check_corpus.py`, human-only, applies your private denylist to every public corpus file, `corpus/proposals/narration-2026-10-18.md` included, which repeats every script's words. No agent session can read the denylist, so this is where it meets the drafts. |
| The approvals (T055) | your terminal, when you're satisfied with a script | `sha256sum apps/web/content/narration/*.md` prints all thirty digests; one entry per script you approve in `assets/policy/content-approvals.json` (`kind: narration`), committed on `main` (contracts/resume-source.md §5). A script publishes only with its item, so the resume needs its own approval (T032) first. |
| Quickstart §5 on dev | your terminal, after `make up ENV=dev` | Selecting an item shows its words within 1 s, at the path's depth; another selection stops it; the same with the model server stopped. Until Phase 4's choice screen, the path is the non-engineer one. |

## What changed and why

FR-011: "WHEN the visitor selects a resume item, THE SYSTEM SHALL begin the twin's narration of that item within 1 second, at the depth of the visitor's path, show its words as text as they are spoken, and stop any narration already playing." FR-012: "THE SYSTEM SHALL prepare each resume item's narration ahead of time, one for each path, from the corpus, and SHALL publish a narration only after it passes the product evals the twin's answers must pass and the Author has approved it." This branch builds the scripts' checks, their eval suite, their place in the room's data, the display, and the first drafts, and publishes none of them until you approve their hashes.

1. **The scripts' files** (`apps/web/build/narration-source.ts`): `apps/web/content/narration/<item-id>.<path>.md`, YAML front matter (`item`, `path`, `claims`, `slots`) between two `---` lines, then the words. The reader holds each file to the contract's shape: its name `<item-id>.<path>.md`, front matter that agrees with it, no aliases, no field the contract doesn't name, LF line endings, a regular file, never a link. It imports nothing from `content.ts`, so the lock can use it (5).
2. **The checks** (`apps/web/build/narration.ts`, T052), each problem reported as `narration/<item-id>.<path>.md: <reason>`, at each script's first:
   - **N1:** the resume's own `checkSource` (C1–C8) runs on each script as an item with its item's `verb`. A script makes its item's claim, so every citation needs a tag sufficient for a role claim, and the words must say the verb. The review's stricter rules come with it: every ownership verb the words use is a verb in a cited sentence, only topic files are citable, and C9 checks each " or " alternative.
   - **N2:** every resume item has a script on each path, and no script names an item the resume doesn't have (FR-016's narration half).
   - **N3:** C9's forbidden list: every "Do not claim" key phrase, the surname rule from `main`'s `full_name`, and the private denylist when the checkout can read it, a private phrase reported by its line alone.
   - **N4:** at most 900 characters of words, as the file writes them.
   - **N5's precondition:** each citation shares a run of whole words of at least 12 characters with the words, its key phrase.
3. **The room's data:** `narrationPart`, a part of `room-data.json` after the resume's. Each published item carries `narration: {engineer, non-engineer}`, each `{words, approved, source, sha256}` with its slots filled, or `null` where a build without drafts left a draft out. A script whose item isn't published (the resume withheld) isn't published either, and `published` drops it, so `published` names exactly what the room shows.
4. **The eval cases** (N5): `npm run content:lock -w apps/web` writes `evals/narration/cases/narration-<item-id>-<path>.yaml`, one per script: `fake_response` is the words as the room shows them, `expect.contains` one key phrase per citation, and `expect.not_contains` the corpus's public "Do not claim" key phrases only. The generator never asks for the surname rule or the denylist, and drops their entries by source if they came anyway; a test puts a readable denylist in the tree and finds none of its phrases in any case. `make test` fails while a case is stale, missing, or left from a gone script. **Their own suite:** `make evals` runs `evals/run.py --suite narration --adapter fake`, whatever `ADAPTER` says, and `run.py` refuses `--suite narration` with any other adapter (exit 2, before it loads a case), so no narration case reaches a stack's `/hello` or prod's meter.
5. **The lock covers the scripts:** `content.ts`'s `lockedFiles` adds every corpus and facts file a script cites (data-model.md §5). The drafts cite the resume's five files, so the lock's bytes didn't change.
6. **The display** (`apps/web/src/narration/`, T053), on the interactive resume's `room:item-selected`:
   - the first word in the selection's own event, so it paints with the next frame; then a word every 375 ms (160 a minute), timed from the start, so a throttled tab catches up rather than drifting;
   - the whole script in the panel's polite live region, made when the resume opens so its first change is announced; the word-by-word copy beside the item is `aria-hidden`, so a screen reader reads the script once;
   - another selection stops it at once and starts the new one; the same item starts over; closing the resume stops it;
   - a draft (only a drafts build has one) under a "Draft" label; an item whose script was left out shows nothing.
   `src/main.ts` fetches `room-data.json` once for the resume and its narration, and gives the non-engineer path until the choice screen's visit (T040) holds the visitor's.
7. **The first drafts** (T054): thirty scripts, the fifteen items on both paths, every sentence cited, written after the rebase so they pass the review's rules. The non-engineer scripts stay at "Role at a glance" depth; the engineer scripts take the topic sections' detail. Filed for you as `corpus/proposals/narration-2026-10-18.md`, generated from the files, each script's words beside the corpus words it cites and the tag that opens each quote's span. The proposal also says how the drafts read and what they leave out: the ownership rulings in the corpus's words ("Ownership: led."), the counts the corpus spells in words, and why four engineer scripts are thin (the corpus tags those sections on their headings only).

**Where the build went past the plan**, recorded in plan.md §5 ("What group 5 found") in 3d83f1a, with contracts/narration.md §2–§4 and data-model.md §3 and §5 fixed where they were silent: the cases written by `content:lock` and held current by `make test`; N1's verb; N4's measure; N5's key phrase; the lock; the `room-data.json` shape; the display's region and live region; and the blank line after the front matter, which is part of each file's hash.

## Acceptance criteria

Quoted from spec.md:
- **FR-011:** "WHEN the visitor selects a resume item, THE SYSTEM SHALL begin the twin's narration of that item within 1 second, at the depth of the visitor's path, show its words as text as they are spoken, and stop any narration already playing." `test/ui/narration.test.ts`, with a fake clock: the first word at the click, a word every 375 ms, the whole text in the live region at the start, the path's script, another selection stopping the first. The path is the non-engineer one until Phase 4's choice screen supplies the visitor's.
- **FR-012:** "THE SYSTEM SHALL prepare each resume item's narration ahead of time, one for each path, from the corpus, and SHALL publish a narration only after it passes the product evals the twin's answers must pass and the Author has approved it." Thirty prepared scripts; N1–N5 on every build and in `make test`; the `narration` suite in `make evals`, 30 passed; publication only when `main` approves the script's hash and its item's (`test/content/narration.test.ts`, and the gate's content check below). The product evals the twin's answers must pass don't exist yet; these cases are the deterministic part this spec owns (research.md R-07), and the twin's spec adds model-judged cases for the same scripts.
- **SC-006:** "Narration begins within 1 second of selecting an item for 95% of selections, with the local tier up or off." The words are static text in `room-data.json`, loaded with the resume, and the first one is painted from the selection's own event, so the local tier plays no part. The measured run on a browser is quickstart §5's, the Author's.
- Also, FR-016's narration half: "IF … an item lacks a narration for either path, THEN the local gate SHALL fail." N2 fails the build and `make test`.

## Constitution check

| Principle | Touched? | How it complies |
|---|---|---|
| I. Data-local | no | No new flow. The words travel in `room-data.json`, a static file from the site's own origin, inside disclosure row V1. Nothing is fetched, stored, or sent when an item is selected. |
| II. Production-grade | yes | Tests first, RED below; N1–N5 in every build and in `make test`; an eval suite per script; the gate's content check run against this branch's builds. |
| III. Intent → spec → code | yes | tasks.md T050–T054 and T056; plan.md, the contract, and the data model updated in the same branch where the build went past them. |
| IV. Least privilege | no | No permission or deny changed. No corpus edit: the drafts are a proposal. |
| V. Cost | yes | No model call. `run.py` refuses the narration suite on any adapter that could call one. |
| VI. Build in public | yes | The scripts, their citations, their checks, their cases, and this note are public. |
| VII. Say exactly what you owned | yes | Each script carries its item's ownership verb, cited as a verb (C8 and N1), in the corpus's words: "sponsored the CHT skills", "AI system architect", "his pitch and design won Medic", "the Ministry owned the workflows and product decisions", "to a lesser extent than in Kenya's". |
| VIII. Honest AI | yes | Nothing is published until you approve it; a draft shows a "Draft" label. |

## RED and GREEN

- **RED, before any code** (e9e8a2b, first committed as aa2674b on d080221): vitest in `apps/web`, 2 test files failed to load (`Cannot find module '../../build/narration'`, `'../../src/narration/data'`); 11 files and 128 tests passed. `pytest evals/test_run.py`: 3 failed (the committed narration suite, and the refusal for both other adapters: `no suite 'narration'`), 18 passed.
- **Test fixes on the way,** each the test's error: a regex that removed a quote but left its indentation, so the YAML failed to parse before the check could answer; an N5 fixture whose words shared "the lantern service" with the citation it meant to leave unused; and an unsorted `readdirSync` in a helper. `test/lock.test.ts` pins the `content:lock` command, which now runs `build/narration.ts`; that's the interface changing, and the test changed with it.
- **After the rebase:** three narration tests of the review's rules (C1 refusing the corpus's README, C8 on a verb the cited sentence lacks, C9's " or " alternative with its verb carried over). They passed at once: N1 and N3 call the reviewed `checkSource`.
- **GREEN:** vitest in `apps/web`, 197 passed in 13 files; `pytest evals/test_run.py`, 21 passed; `evals/run.py --suite narration --adapter fake`, 30 passed, 0 failed; `--adapter local` refused with exit 2; `npm run content:check -w apps/web`, "C1–C9 and N1–N5 passed for the resume and 30 scripts …; the lock and the eval cases are current"; `make corpus-check` OK over the proposal; eslint, tsc, Prettier, and ruff clean.
- **The checks against the real corpus,** by breaking one committed script at a time in a scratch copy of the tree (a scratch script, not committed):
  - "He defined the market." in a script: `forbidden phrase (from corpus/00-profile.md:41)`;
  - "Hareet built cht-pr-review": `forbidden phrase (from corpus/01-ai-strategy-and-cht.md:135)`, the verb carried to the bullet's second alternative;
  - "He pitched and designed it" for Smart Task Prioritization: `ownership verb not cited`;
  - a year in the words: `bare number`; `corpus/README.md` cited: `not a corpus file`; a script deleted: `missing (each item needs a script for each path)`;
  - a second name in the words, with `full_name` set to a made-up one: `forbidden phrase (from the surname rule)`;
  - a script padded past 900 characters: `over 900 characters`; a script whose words no longer use its citation: `claims[0] shares no phrase of 12 characters or more with the words`.
- **The approvals patch's `content_check.py`,** taken from `docs/merge-requests/2026-10-18-feat-002-approvals.patch` into a scratch directory, on this branch's builds:
  - a build without drafts and an empty policy: "content check: PASS (31 content files: 0 approved by main, 31 drafts, none of whose text is in dist/)";
  - that `dist/` with a drafts build's narration planted in it: 30 FAIL lines, one per script, "main doesn't approve it, and its text is in …", exit 1;
  - a scratch policy approving the resume and one script, `cht-agent.non-engineer.md`: the build published those two and only that script's words (its engineer path `null`), and the check said "PASS (31 content files: 2 approved by main, 29 drafts, none of whose text is in dist/)".

## Review

Review: pending (the integrating session runs it).

## Backlog

- **The path until Phase 4.** `main.ts` gives every visitor the non-engineer scripts. When the choice screen lands, its visit object replaces `path` in the one `wireNarration` call; nothing else changes.
- **The cases pass on the fake adapter by construction:** they score the script against itself, so today they guard the committed files (a forbidden phrase, a lost citation) more than any answer. Their weight arrives with the twin's model-judged cases for the same scripts (contracts/narration.md §2).
- **N5's key phrase is a reading** of "one key phrase per citation": the longest shared run of words, at least 12 characters. It makes a citation the words don't use fail the build, which the contract doesn't ask for and the drafts all pass.
- **Thin engineer scripts** for Smart Task Prioritization, No-Code CHT Configuration, the Docker architecture, and the benchmarking: their depth is in heading-tagged sections the check can't cite (the proposal says which). Tagging those bullet lines is yours.
- **`content.ts`'s own command line** now checks the resume alone, since the npm scripts run `build/narration.ts`'s. Removing it touches the resume branch's lines; left for after both merge.
- **The private denylist never meets the scripts' files themselves,** as the resume's note says of `resume.yaml`: the proposal carries the words to `make corpus-check`, and a later edit to a script without a proposal meets the denylist only at `make publish-check`.
- **Thirty approvals by hand.** `sha256sum apps/web/content/narration/*.md` lists the digests; a helper that writes the entries would be human-only tooling, yours to want or not.
- **Vite's warning** about extensionless imports lists the new modules beside the old ones, the workspace's existing pattern.

## Cost and data-flow impact

None at run time: no model call, no new endpoint, and no byte leaves the visitor's device that row V1 doesn't already name. `room-data.json` grows by the published scripts' words and their sources and digests, about 15 KB when all thirty are approved (their words are about 11 KB). The build reads only the repository.

## For the Author

After `feat/002-us1-resume` has merged:
1. `git diff main...feat/002-us3-narration`.
2. `tools/gates/gate feat/002-us3-narration`, from main's checkout. Its `content` step runs `content_check.py` over this branch's build without drafts: every script is withheld, so it should pass.
3. Merge with the command the gate prints.
4. Read `corpus/proposals/narration-2026-10-18.md` and the scripts in `apps/web/content/narration/` (T055). Rewrite any as you like; `npm run content:check -w apps/web` tells you if a citation no longer holds, and `npm run content:lock -w apps/web` rewrites the cases. Run `make corpus-check` for the denylist.
5. When satisfied: approve the resume (T032) if you haven't, then each script by hash in `assets/policy/content-approvals.json` on `main`. The next `make up` rebuilds the image from `main`'s policy.
6. Quickstart §5 on dev: an item's words within 1 s, another selection stopping it, and the same with the model server stopped.

**Merging beside Phase 4 (`feat/002-us2-room`).** The shared lines this branch touched:
- `apps/web/build/content.ts`: `export` on `slotRefs`; `import { readScripts } from "./narration-source";`; `lockedFiles` adds the scripts' lines (one line, and its comment).
- `apps/web/vite.config.ts`: `import { narrationPart } from "./build/narration";`, `parts: [resumePart, narrationPart]`, and a comment line.
- `apps/web/package.json`: `content:lock` and `content:check` run `build/narration.ts`.
- `apps/web/src/main.ts`: one fetch of `room-data.json` for the resume and the narration, and `wireNarration(document, {load, path})`. Phase 4's router replaces this file's body; it should keep both wirings and pass the visit's path.
- `apps/web/test/smoke.test.ts`: the drafts list includes the scripts, and the withheld-draft check covers their words. `apps/web/test/lock.test.ts`: the pinned command.
- `apps/web/README.md`; `Makefile`'s `evals` target (one line and its help text); `evals/run.py` and `evals/test_run.py`.

## Verification

`make check ENGINE_MODE=none-yet` on this note's save-point commit, in `/tmp/claude-1000/wt-002-narration`, pasted whole below.

(Pending: the run follows this save point.)
