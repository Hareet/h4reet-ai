# feat/002-us3-narration
Spec: specs/002-the-room/ (Phase 5, User Story 3: T050–T054 and T056; FR-011, FR-012, SC-006) · Intent: specs/002-the-room/intent.md · Written by: Claude Code (Opus 5.5), an implementer subagent · Date: 2026-10-18
Session: worked in `/tmp/claude-1000/wt-002-narration`, launched from `~/h4reet-ai/h4reet-ai` · Repo hooks active: yes. No refusals. The post-edit hook formatted files written with the Write tool, as it does; in a scratch copy of the proposal's head it made the corpus's `*led*` into `_led_`, so the committed proposal quotes those rulings as code spans. It flagged lint in a test (an unused binding, fixed before the first commit) and in scratch scripts outside the tree, never committed. A first `npm install` failed on the read-only npm cache and left half-extracted packages; `node_modules` was copied again and installed with a cache under `$TMPDIR`, and `package-lock.json` is unchanged.
Authorized by: the Author's direction of 2026-10-17, "Let's relax some of the overnight rules so that you can continue with intent 002 and intent 003? I think you can create the tasks and implement them and we can always go back later and re-do a task or requirement if we highlight a needed change"; tasks.md T050–T054 and T056, against plan §5, research.md R-07 and R-08, data-model.md §3 and §5, and contracts/narration.md and resume-source.md.

**Status: reviewed, BLOCK with one blocker; the blocker and every script fix are done (5d0ae4e, 75e3bde), tests first. Ready for the review's follow-up check.**

**Merge order:** stacked on `feat/002-us2-room` (244dc6f, the room's tip after its follow-up check), which stacks on `feat/002-us1-resume`, `feat/002-approvals`, `feat/002-web`, `spec/002-the-room`, and `spec/003-studio-assets`. Merge those first, in order, with their patches. This branch has no patch: it changes no human-only path.

Commits, after two rebases: onto the resume's review fixes (32e426e), then onto the room (244dc6f), as the review's blocker asked:
- 98e0c6e: the tests, first (RED below);
- 2e8d985: the code: the checks, the room-data part, the eval cases, the display, and the eval runner's refusal. Its `main.ts` is the room's, since its own wiring used the resume's stand-alone opener, which the room removed; 75e3bde wires narration into the room, and the display's old test fails to compile in the commits between;
- b2cd734: the thirty drafts and their thirty eval cases, and three tests of the resume review's rules as narration inherits them;
- fa4cbcf: the proposal for you;
- 0202394: plan.md's "What group 5 found", the contract, the data model, the README, and tasks.md;
- 0f6a86c and ee2da2e: this note, with the first round's `make check`;
- 5d0ae4e: the review's script fixes and the rules that hold them (C8's act verbs and voice, N1's ruling annotations);
- 75e3bde: the blocker's fix: narration through the room's resume adapter, the visitor's chosen path, the AI line, and the disclosure test;
- this note, after the review, first as a save point, then with `make check`'s output.

## Runs in the Author's terminal

ADR 0017 puts this section first. Nothing here is a patch.

| What | How it runs | Check before you run it |
|---|---|---|
| `make corpus-check` | your terminal, after the merge | `corpus/tools/check_corpus.py`, human-only, applies your private denylist to every public corpus file, `corpus/proposals/narration-2026-10-18.md` included, which repeats every script's words. No agent session can read the denylist, so this is where it meets the drafts. |
| The approvals (T055) | your terminal, when you're satisfied with a script | `sha256sum apps/web/content/narration/*.md` prints all thirty digests; one entry per script you approve in `assets/policy/content-approvals.json` (`kind: narration`), committed on `main` (contracts/resume-source.md §5). A script publishes only with its item, so the resume needs its own approval (T032) first. |
| Quickstart §5 on dev | your terminal, after `make up ENV=dev` | In the room, on each path: selecting an item shows its words within 1 s, at that path's depth, under "The AI twin narrates this, not the Author."; another selection stops it; closing the resume stops it; the AI disclosure stays at the top while words show, on a phone and a laptop; the same with the model server stopped. |

## What changed and why

FR-011: "WHEN the visitor selects a resume item, THE SYSTEM SHALL begin the twin's narration of that item within 1 second, at the depth of the visitor's path, show its words as text as they are spoken, and stop any narration already playing." FR-012: "THE SYSTEM SHALL prepare each resume item's narration ahead of time, one for each path, from the corpus, and SHALL publish a narration only after it passes the product evals the twin's answers must pass and the Author has approved it." This branch builds the scripts' checks, their eval suite, their place in the room's data, the display in the room, and the first drafts, and publishes none of them until you approve their hashes.

1. **The scripts' files** (`apps/web/build/narration-source.ts`): `apps/web/content/narration/<item-id>.<path>.md`, YAML front matter (`item`, `path`, `claims`, `slots`) between two `---` lines, then the words. The reader holds each file to the contract's shape: its name `<item-id>.<path>.md`, front matter that agrees with it, no aliases, no field the contract doesn't name, LF line endings, a regular file, never a link. It imports nothing from `content.ts`, so the lock can use it (5).
2. **The checks** (`apps/web/build/narration.ts`, T052), each problem reported as `narration/<item-id>.<path>.md: <reason>`, at each script's first:
   - **N1:** the resume's own `checkSource` (C1–C8) runs on each script as an item with its item's `verb`, which sets C4's bar: every citation under a tag sufficient for a role claim. After the review, the words keep the cited sentences' grammar for your acts: every ownership verb, and every act verb the corpus uses (`ACT_VERBS`: "released", "organized", "found", and the rest), that the words say is one a cited sentence says, as an act; an agentless passive never becomes your act (`passive made active`); and a ruling annotation (`Ownership: *led*.`) is neither cited nor read out. So the words needn't say the item's verb. The resume review's rules come with it too: only topic files are citable, and C9 checks each " or " alternative.
   - **N2:** every resume item has a script on each path, and no script names an item the resume doesn't have (FR-016's narration half).
   - **N3:** C9's forbidden list: every "Do not claim" key phrase, the surname rule from `main`'s `full_name`, and the private denylist when the checkout can read it, a private phrase reported by its line alone.
   - **N4:** at most 900 characters of words, as the file writes them.
   - **N5's precondition:** each citation shares a run of whole words of at least 12 characters with the words, its key phrase.
3. **C8 in `content.ts`, for the resume and the scripts** (the review): the act verbs and the voice test above. The resume's source passes it unchanged.
4. **The room's data:** `narrationPart`, a part of `room-data.json` after the resume's. Each published item carries `narration: {engineer, non-engineer}`, each `{words, approved, source, sha256}` with its slots filled, or `null` where a build without drafts left a draft out. A script whose item isn't published (the resume withheld) isn't published either, and `published` drops it, so `published` names exactly what the room shows.
5. **The eval cases** (N5): `npm run content:lock -w apps/web` writes `evals/narration/cases/narration-<item-id>-<path>.yaml`, one per script: `fake_response` is the words as the room shows them, `expect.contains` one key phrase per citation, and `expect.not_contains` the corpus's 28 public "Do not claim" key phrases only. The generator never asks for the surname rule or the denylist, and drops their entries by source if they came anyway; a test puts a readable denylist in the tree and finds none of its phrases in any case. `make test` fails while a case is stale, missing, or left from a gone script. **Their own suite:** `make evals` runs `evals/run.py --suite narration --adapter fake`, whatever `ADAPTER` says, and `run.py` refuses `--suite narration` with any other adapter (exit 2, before it loads a case), so no narration case reaches a stack's `/hello` or prod's meter.
6. **The lock covers the scripts:** `content.ts`'s `lockedFiles` adds every corpus and facts file a script cites (data-model.md §5). The drafts cite the resume's five files, so the lock's bytes didn't change.
7. **The display in the room** (`apps/web/src/narration/`, T053, driven by `src/room/resume-port.ts`'s adapter):
   - the adapter prepares the panel's polite live region when the resume mounts, passes each `room:item-selected` with its context's path (the visit's: the path the visitor chose, FR-002), and stops the narration when the panel unmounts (FR-024);
   - the first word in the selection's own event, so it paints with the next frame; then a word every 375 ms (160 a minute), timed from the start, so a throttled tab catches up rather than drifting;
   - the region opens with "The AI twin narrates this, not the Author.", and the view sits in the page's flow, so the room's sticky, opaque AI disclosure stays in view while words show (FR-004);
   - the whole script in the live region; the word-by-word copy beside the item is `aria-hidden`, so a screen reader reads the script once;
   - another selection stops it at once and starts the new one; the same item starts over; a draft (only a drafts build has one) under a "Draft" label; an item whose script was left out shows nothing.
   `src/main.ts` gives the adapter one `room-data.json` loader, `roomDataLoader`, for the resume and its narration, which fetches again after a failed load, as the view retries.
8. **The first drafts** (T054): thirty scripts, the fifteen items on both paths, every sentence cited, in the cited sentences' own grammar after the review. Filed for you as `corpus/proposals/narration-2026-10-18.md`, generated from the files, each script's words beside the corpus words it cites and the tag that opens each quote's span, with how the drafts read and what they leave out.

**Where the build went past the plan**, recorded in plan.md §5 ("What group 5 found"), with contracts/narration.md §2–§4, contracts/resume-source.md's C8 row, and data-model.md §3 and §5 fixed to match: the cases written by `content:lock` and held current by `make test`; N1's verb, act verbs, voice, and annotations; N4's measure; N5's key phrase; the lock; the `room-data.json` shape; the display in the room; and the blank line after the front matter, which is part of each file's hash.

## Acceptance criteria

Quoted from spec.md:
- **FR-011:** "WHEN the visitor selects a resume item, THE SYSTEM SHALL begin the twin's narration of that item within 1 second, at the depth of the visitor's path, show its words as text as they are spoken, and stop any narration already playing." `test/ui/narration.test.ts`, with a fake clock: the first word at the click, a word every 375 ms, the whole text in the live region at the start, another selection stopping the first. `test/ui/narration-room.test.ts`: in the room, the script for the path the visitor chose, stopping when the resume closes.
- **FR-012:** "THE SYSTEM SHALL prepare each resume item's narration ahead of time, one for each path, from the corpus, and SHALL publish a narration only after it passes the product evals the twin's answers must pass and the Author has approved it." Thirty prepared scripts; N1–N5 on every build and in `make test`; the `narration` suite in `make evals`, 30 passed; publication only when `main` approves the script's hash and its item's (`test/content/narration.test.ts`, and the gate's content check below). The product evals the twin's answers must pass don't exist yet; these cases are the deterministic part this spec owns (research.md R-07), and the twin's spec adds model-judged cases for the same scripts.
- **SC-006:** "Narration begins within 1 second of selecting an item for 95% of selections, with the local tier up or off." The words are static text in `room-data.json`, loaded with the resume, and the first one is painted from the selection's own event, so the local tier plays no part. The measured run in a browser is quickstart §5's, the Author's.
- **FR-004** (the review's blocker): "THE SYSTEM SHALL show, from the choice screen to the end of the visit, that the twin is an AI representation." While narration words show, the room's disclosure stays in view (`test/ui/narration-room.test.ts`, at 320 and 1280 CSS pixels, from the page and its stylesheets), and the region says the AI twin narrates.
- Also, FR-016's narration half: "IF … an item lacks a narration for either path, THEN the local gate SHALL fail." N2 fails the build and `make test`.
- **A reading of FR-015** ("THE SYSTEM SHALL describe each role in the resume and its narration with the ownership verb the corpus rules for it"): the narration applies the rulings through the corpus's sentences. Kenya's "led" is only a ruling annotation, so its scripts say "localized", the sentence's verb; the resume's item says "Led", from the ruling. The proposal asks you for a sentence if you want the narration to say it.

## Constitution check

| Principle | Touched? | How it complies |
|---|---|---|
| I. Data-local | no | No new flow. The words travel in `room-data.json`, a static file from the site's own origin, inside disclosure row V1, fetched once for the resume and its narration. Nothing is fetched, stored, or sent when an item is selected. |
| II. Production-grade | yes | Tests first, RED below; N1–N5 in every build and in `make test`; an eval suite per script; the gate's content check run against this branch's builds. |
| III. Intent → spec → code | yes | tasks.md T050–T054 and T056; plan.md, the contracts, and the data model updated in the same commits where the build went past them. |
| IV. Least privilege | no | No permission or deny changed. No corpus edit: the drafts are a proposal. |
| V. Cost | yes | No model call. `run.py` refuses the narration suite on any adapter that could call one. |
| VI. Build in public | yes | The scripts, their citations, their checks, their cases, and this note are public. |
| VII. Say exactly what you owned | yes | Each script keeps the cited sentences' grammar for your acts, and the check holds it: "agent-watchdog was built by Hareet and released to production", "sponsored the CHT skills, including cht-pr-review, which others built", "AI system architect", "his pitch and design won Medic", "the Ministry owned the workflows and product decisions", "to a lesser extent than in Kenya's". |
| VIII. Honest AI | yes | The AI disclosure stays in view while narration shows, and the narration says the AI twin narrates. Nothing is published until you approve it; a draft shows a "Draft" label. |

## RED and GREEN

- **RED, before any code** (98e0c6e, first committed as aa2674b on d080221): vitest in `apps/web`, 2 test files failed to load (`Cannot find module '../../build/narration'`, `'../../src/narration/data'`); 11 files and 128 tests passed. `pytest evals/test_run.py`: 3 failed (the committed narration suite, and the refusal for both other adapters: `no suite 'narration'`), 18 passed.
- **Test fixes on the way,** each the test's error: a regex that removed a quote but left its indentation; an N5 fixture whose words shared "the lantern service" with the citation it meant to leave unused; and an unsorted `readdirSync` in a helper. `test/lock.test.ts` pins the `content:lock` command, which now runs `build/narration.ts`; that's the interface changing, and the test changed with it.
- **GREEN, first round:** vitest in `apps/web`, 197 passed in 13 files; `pytest evals/test_run.py`, 21 passed; the narration suite 30 passed.
- **The review's rules, RED:** with `content.ts` and `narration.ts` stashed, the five new tests failed (C8's act verbs and `passive made active`, in `test/content/citations.test.ts` and `narration.test.ts`; N1's annotations; the item's verb no longer required), 111 passed. With the rules in, the committed scripts failed them: `agent-watchdog.engineer.md: passive made active`, and five `reads out a ruling annotation` (Kenya's two, the benchmarking's two, the Docker engineer script). The scripts were rewritten; the resume's source passed throughout.
- **The room integration, RED:** after the rebase onto the room, with the display's test rewritten against the room's adapter and the new room test, `test/ui` had 15 failed and 74 passed.
- **GREEN, after the review:** vitest in `apps/web`, 327 passed in 24 files (the room's included); `pytest evals/test_run.py`, 21 passed; `evals/run.py --suite narration --adapter fake`, 30 passed, 0 failed; `--adapter local` refused with exit 2; `npm run content:check -w apps/web`, "C1–C9 and N1–N5 passed for the resume and 30 scripts …; the lock and the eval cases are current"; `make corpus-check` OK over the proposal; eslint, tsc, Prettier, and ruff clean.
- **The checks against the real corpus,** in the first round, by breaking one committed script at a time in a scratch copy of the tree (a scratch script, not committed): "He defined the market." gave `forbidden phrase (from corpus/00-profile.md:41)`; "Hareet built cht-pr-review" gave `forbidden phrase (from corpus/01-ai-strategy-and-cht.md:135)`, the verb carried to the bullet's second alternative; "He pitched and designed it" gave `ownership verb not cited`; a year gave `bare number`; `corpus/README.md` cited gave `not a corpus file`; a deleted script gave `missing (each item needs a script for each path)`; a second name with `full_name` set gave `forbidden phrase (from the surname rule)`; padding gave `over 900 characters`; a citation the words don't use gave `claims[0] shares no phrase of 12 characters or more with the words`. After the review, the committed scripts themselves were the rules' first cases (above).
- **The approvals patch's `content_check.py`,** taken from `docs/merge-requests/2026-10-18-feat-002-approvals.patch` into a scratch directory:
  - on the room's base, a build without drafts and an empty policy: "content check: PASS (31 content files: 0 approved by main, 31 drafts, none of whose text is in dist/)";
  - in the first round, that `dist/` with a drafts build's narration planted in it gave 30 FAIL lines, one per script, exit 1; and a scratch policy approving the resume and `cht-agent.non-engineer.md` published those two and only that script's words, "PASS (31 content files: 2 approved by main, 29 drafts, none of whose text is in dist/)".

## Review

**Verdict: BLOCK, one blocker** (a reviewer agent that didn't write the change, run by the integrating session, against REVIEW.md), with seven script and contract fixes.

**The blocker** (FR-004, "SHALL show, from the choice screen to the end of the visit, that the twin is an AI representation"; contracts/room-scene.md, "The AI disclosure is always visible"; Principle VIII): on the resume branch, the resume panel was a fixed, opaque overlay (`inset: 0`, `z-index: 10`) that hid `index.html`'s AI disclosure, and the narration showed the twin's words inside it with only a "Draft" label. **Fixed** (75e3bde) by rebasing onto the room, where the disclosure is sticky and opaque and the resume sits in the room's flow with no overlay; narration now runs through the room's resume adapter at the visitor's chosen path, its region opens with "The AI twin narrates this, not the Author.", and `test/ui/narration-room.test.ts` checks the disclosure in view whenever words show, at 320 and 1280 CSS pixels.

**The script and contract fixes** (Principle VII; CLAUDE.md's "Paraphrasing a source"), all in 5d0ae4e:
1. `agent-watchdog.engineer.md` made the corpus's passive ("Built by Hareet and released to production") an act ("Hareet built agent-watchdog and released it"). Now in the corpus's grammar; C8 holds "released" and the corpus's other act verbs, and fails a verb the corpus says only in an agentless passive made your act (`passive made active`, tested on a fixture sentence of that shape).
2. `cht-codebase.engineer.md` cut the first clause of your quoted definition. "Buildtime AI in Hareet's words: …" is now quoted whole, there and in `change-management.engineer.md`.
3. "Ownership: led/built/architected." read the corpus's annotation out as narration. Rewritten as the corpus's sentences; N1 refuses citing or reading out a ruling annotation.
4. `claude-medic-aws.*` said "built security-first" of a system ruled designed. Now "designed … security-first for a non-technical user base", as the resume words it.
5. `cht-skills.*` keeps "which others built", as the resume does.
6. `other-deployments.engineer.md` put Jamii ni Afya beside your involvement. Now it says exactly what `02` tells the twin to say, and nothing beside it.
7. contracts/narration.md held two contradictory `fake_response` bullets; one remains.

**What it checked clean:** all 30 scripts read against their citations; no digit in any script's words; no "Do not claim" item; no surname; the 30 cases hold only the 28 public phrases; `run.py` refuses non-fake adapters before it loads a case; a withheld resume publishes no script; and the display (its timing, live region, stop on selection, drafts).

**Recorded as backlog,** below: scenario 3's "depth differs, facts same"; C9 cutting bullets at "(" or ". "; re-selecting an item may not re-announce; the "Draft" label not in the live region.

Review of the fixes: pending (the integrating session runs its follow-up check).

## Backlog

- **Scenario 3, "the depth differs and the facts are the same."** Six pairs are thin, their engineer script little deeper than the other: Smart Task Prioritization, No-Code CHT Configuration, the Docker architecture, the benchmarking, Kenya, and the other deployments. Their depth is in heading-tagged sections the check can't cite (the proposal says which); tagging those bullet lines is yours. And some pairs' facts differ: agent-watchdog's EKS-node story is in its non-engineer script and not its engineer one, and claude-medic-aws's only in its engineer one; Voice for CHT's engineer script names the roles and the Nepali plan, which its other script doesn't.
- **C9 cuts a "Do not claim" bullet at "(" or ". "**, so a bullet's later sentences ("Quantization, compression, model names, or hardware specifics …", after "That Hareet built the partner's speech model.") aren't phrases of their own. The resume branch's rule; the scripts avoid them.
- **Re-selecting an item may not re-announce it:** the live region gets the same text again, which some screen readers don't repeat.
- **The "Draft" label isn't in the live region,** so a screen reader hears a draft's words without hearing it's a draft. Only drafts builds (dev, dev-cpu) show drafts.
- **The voice test is a heuristic:** an auxiliary before a verb, or "and" after a "by" passive in the same clause, makes it agentless. A participle after a comma ("…, built security-first for …") reads as an act, so it passes the check and needed your eye (fix 4).
- **The resume's Kenya item says "Led", from the ruling annotation.** N1 refuses the annotation for narration; C8 still accepts it for the resume, whose wording is the resume branch's and yours.
- **The cases pass on the fake adapter by construction:** they score the script against itself, so today they guard the committed files more than any answer. Their weight arrives with the twin's model-judged cases for the same scripts.
- **N5's key phrase is a reading** of "one key phrase per citation": the longest shared run of words, at least 12 characters, which makes a citation the words don't use fail the build.
- **`content.ts`'s own command line** checks the resume alone, since the npm scripts run `build/narration.ts`'s. Removing it touches the resume branch's lines.
- **The private denylist never meets the scripts' files themselves,** as the resume's note says of `resume.yaml`: the proposal carries the words to `make corpus-check`.
- **Thirty approvals by hand.** `sha256sum apps/web/content/narration/*.md` lists the digests; a helper that writes the entries would be human-only tooling.
- **jsdom lays nothing out,** so the disclosure test reads the page and its stylesheets; a browser's look on a phone and a laptop is quickstart §5's.
- **Vite's warning** about extensionless imports lists the new modules beside the old ones, the workspace's existing pattern.

## Cost and data-flow impact

None at run time: no model call, no new endpoint, and no byte leaves the visitor's device that row V1 doesn't already name. `room-data.json` grows by the published scripts' words and their sources and digests, about 15 KB when all thirty are approved (their words are about 11 KB), and the room fetches it once for the resume and its narration. The build reads only the repository.

## For the Author

After `feat/002-us2-room` has merged:
1. `git diff main...feat/002-us3-narration`.
2. `tools/gates/gate feat/002-us3-narration`, from main's checkout. Its `content` step runs `content_check.py` over this branch's build without drafts: every script is withheld, so it should pass.
3. Merge with the command the gate prints.
4. Read `corpus/proposals/narration-2026-10-18.md` and the scripts in `apps/web/content/narration/` (T055). Rewrite any as you like; `npm run content:check -w apps/web` tells you if a citation no longer holds, and `npm run content:lock -w apps/web` rewrites the cases. Run `make corpus-check` for the denylist.
5. When satisfied: approve the resume (T032) if you haven't, then each script by hash in `assets/policy/content-approvals.json` on `main`. The next `make up` rebuilds the image from `main`'s policy.
6. Quickstart §5 on dev, as in the first table.

**The shared lines this branch touched**, beside its own files (`build/narration*.ts`, `src/narration/`, `content/narration/`, `evals/narration/`, its tests, and the proposal):
- `apps/web/build/content.ts` (the resume's): `export` on `slotRefs`; `import { readScripts } from "./narration-source";`; `lockedFiles` adds the scripts' lines; and, from the review, `ACT_VERBS`, `saysAsAct`, `Item.verbUnsaid`, and C8's loop over both verb lists with `passive made active`.
- `apps/web/src/room/resume-port.ts` (the room's): `resumeView`'s optional `narration` source (prepare on mount, select with the context's path, stop on unmount) and `roomDataLoader`.
- `apps/web/src/main.ts`: the room's wiring, with the loader and the narration source.
- `apps/web/vite.config.ts`: `narrationPart` after `resumePart`. `apps/web/package.json`: `content:lock` and `content:check` run `build/narration.ts`.
- Tests: `test/helpers/room.ts` (a `narration` option), `test/content/citations.test.ts` (one C8 test), `test/fixtures/corpus/01-fixture.md` (one sentence, "The night lamp was designed by Robin and released to the docks."), `test/smoke.test.ts` (the drafts list and the withheld words cover the scripts), `test/lock.test.ts` (the pinned command).
- `apps/web/README.md`; `Makefile`'s `evals` target (one line and its help text); `evals/run.py` and `evals/test_run.py`; specs/002-the-room's plan, contracts, data model, and tasks.

## Verification

`make check ENGINE_MODE=none-yet` on 0a66dde (this note in place, its output not yet in it), on the room's base, in `/tmp/claude-1000/wt-002-narration`, pasted whole below: 7 PASS, 1 SKIP, 2 PLANNED, 0 PENDING, 3 FAIL. It is the result the room's, the resume's, and the approvals branches report for themselves without their patches, and the first round's:
- `toolchain-check` fails on the known drift, Claude Code 2.1.301 against the pin 2.1.296.
- `policy`, and four tests of `tools/gates/test/test_compose_policy.py` in `test`, fail on the `web` image until `feat/002-web`'s patch. Every other test passes: the gateway's 747 (12 skipped), the room's workspace 327 (narration's among them), and pytest's 2562.
- `content-check` and `matrix` are PLANNED until the approvals patch; the content check's runs against this branch's builds are under RED and GREEN.
- `make lint`, `make test`, and `make evals` run inside it as the `lint`, `test`, and `evals` gates; `lint`, `evals` (the narration suite among them: "evals narration (fake): 30 passed, 0 failed"), `redteam`, and `secrets` pass.

```text
== makefiles-check
python3 -I -B -X pycache_prefix=/dev/null tools/gates/makefiles_check.py
makefiles: GNUmakefile holds only its include, and there is no makefile
-> PASS makefiles-check
== githooks-check
reference-transaction: installed
pre-commit: installed
main: a loose ref, which the git hook guards
-> PASS githooks-check
== toolchain-check
python3 -I -B -X pycache_prefix=/dev/null tools/gates/toolchain_check.py
tool                     pinned   found    status  where
node                     24.21.0  24.21.0  OK      /home/h4reet/.nvm/versions/node/v24.21.0/bin/node
uv                       0.8.22   0.8.22   OK      /home/h4reet/.local/bin/uv
ruff                     0.16.10  0.16.10  OK      /home/h4reet/.local/bin/ruff
gitleaks                 8.30.1   8.30.1   OK      /home/h4reet/.local/bin/gitleaks
python3                  3.12     3.12.3   OK      /usr/bin/python3
shellcheck               0.9.0    0.9.0    OK      /usr/bin/shellcheck
jq                       1.7      1.7      OK      /usr/bin/jq
pytest                   9.1.1    9.1.1    OK      /home/h4reet/.local/bin/pytest
pyyaml (pytest's)        6.0.3    6.0.3    OK      /home/h4reet/.local/share/uv/tools/pytest/bin/python3
claude code              2.1.296  2.1.301  DRIFT   /home/h4reet/.nvm/versions/node/v22.18.0/bin/claude
lint: eslint             10.12.0  10.12.0  OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/eslint
lint: typescript-eslint  8.71.1   8.71.1   OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/typescript-eslint
lint: typescript         6.0.3    6.0.3    OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/typescript
lint: prettier           3.9.9    3.9.9    OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/prettier
lint: node               24.21.0  24.21.0  OK      /home/h4reet/.local/share/h4reet/lint-node/node
toolchain-check: 1 of 15 differ from their pins (claude code); see tasks.md T013
make[1]: *** [Makefile:141: toolchain-check] Error 1
-> FAIL toolchain-check
== policy
python3 -I -B -X pycache_prefix=/dev/null tools/gates/compose_policy.py
FAIL deploy/compose.yaml service web: image: h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}: not pinned by digest (repository:tag@sha256:...)
compose policy: 1 refusal(s) (deploy/compose.yaml with 3 env files, the Dockerfiles, the env-file placement, .devcontainer, .npmrc)
make[1]: *** [Makefile:162: policy] Error 1
-> FAIL policy
== validate-config
npm run --silent -w services/gateway validate-config -- --root "/tmp/claude-1000/wt-002-narration"
validate-config: 0 errors, 0 notes
-> PASS validate-config
== lint
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
264 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/scripts/aws-login.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh redteam/forbidden-actions.sh tools/gates/install-tools.sh tools/gates/secrets.sh
-> PASS lint
== test
python3 -I -B -X pycache_prefix=/dev/null corpus/tools/check_corpus.py
corpus-check: OK — 20 slots, 4 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems
npm test --workspaces --if-present

> @h4reet/gateway@0.1.0 test
> vitest run


 RUN  v5.0.3 /tmp/claude-1000/wt-002-narration/services/gateway


 Test Files  49 passed (49)
      Tests  747 passed | 12 skipped (759)
   Start at  08:32:44
   Duration  59.76s (tests 94%, import 4%, transform 2%)


> @h4reet/web@0.1.0 test
> vitest run


 RUN  v5.0.3 /tmp/claude-1000/wt-002-narration/apps/web


 Test Files  24 passed (24)
      Tests  327 passed (327)
   Start at  08:33:44
   Duration  3.49s (tests 51%, import 38%, transform 11%)

pytest -q -p no:cacheprovider --import-mode=importlib corpus/tools evals redteam tools/gates deploy/scripts deploy/agents-engine scripts
........................................................................ [  2%]
........................................................................ [  5%]
........................................................................ [  8%]
........................................................................ [ 11%]
........................................................................ [ 14%]
........................................................................ [ 16%]
........................................................................ [ 19%]
........................................................................ [ 22%]
........................................................................ [ 25%]
........................................................................ [ 28%]
...............F..........FFF........................................... [ 30%]
........................................................................ [ 33%]
........................................................................ [ 36%]
........................................................................ [ 39%]
........................................................................ [ 42%]
........................................................................ [ 44%]
........................................................................ [ 47%]
........................................................................ [ 50%]
........................................................................ [ 53%]
........................................................................ [ 56%]
........................................................................ [ 58%]
........................................................................ [ 61%]
........................................................................ [ 64%]
........................................................................ [ 67%]
........................................................................ [ 70%]
........................................................................ [ 72%]
........................................................................ [ 75%]
........................................................................ [ 78%]
........................................................................ [ 81%]
........................................................................ [ 84%]
........................................................................ [ 86%]
........................................................................ [ 89%]
........................................................................ [ 92%]
........................................................................ [ 95%]
........................................................................ [ 98%]
..............................................                           [100%]
=================================== FAILURES ===================================
____________________ test_the_breach_probe_meets_the_policy ____________________

    def test_the_breach_probe_meets_the_policy() -> None:
        """The probe (tasks.md T144): built from this tree on the pinned base:python, on internal alone, and disclosed."""
        model = real_model()
        lock = cp.parse_lock(REPO / cp.LOCK_FILE)
        assert cp.check_service(PROBE, model["services"][PROBE], model, lock, REPO) == []
        disclosed = cp.disclosed_services(REPO / cp.DISCLOSURE_FILE)
        assert PROBE in disclosed
        # The policy requires its row, as every service's (FR-040).
        found = cp.check_model(model, lock, REPO, disclosed - {PROBE})
>       assert [(f.where, f.rule) for f in found if not f.planned] == [
            (f"{cp.COMPOSE_FILE} service {PROBE}", "disclosure")
        ]
E       AssertionError: assert [('deploy/com...'disclosure')] == [('deploy/com...'disclosure')]
E         
E         At index 0 diff: ('deploy/compose.yaml service web', 'image') != ('deploy/compose.yaml service breach-probe', 'disclosure')
E         Left contains one more item: ('deploy/compose.yaml service breach-probe', 'disclosure')
E         Use -v to get more diff

tools/gates/test/test_compose_policy.py:894: AssertionError
_________________ test_the_real_compose_file_passes_as_written _________________

    def test_the_real_compose_file_passes_as_written() -> None:
        """The raw file, through PyYAML (short-syntax ports, anchors), meets every compose rule too."""
        model = yaml.safe_load((REPO / cp.COMPOSE_FILE).read_text(encoding="utf-8"))
        lock = cp.parse_lock(REPO / cp.LOCK_FILE)
        disclosed = cp.disclosed_services(REPO / cp.DISCLOSURE_FILE)
        found = cp.check_model(model, lock, REPO, disclosed)
>       assert [f for f in found if not f.planned] == []
E       AssertionError: assert [Finding(wher...sha256:...)')] == []
E         
E         Left contains one more item: Finding(where='deploy/compose.yaml service web', rule='image', detail='h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}: not pinned by digest (repository:tag@sha256:...)')
E         Use -v to get more diff

tools/gates/test/test_compose_policy.py:951: AssertionError
___________________________ test_the_real_files_pass ___________________________

tree = PosixPath('/tmp/claude-1000/pytest-of-h4reet/pytest-31/test_the_real_files_pass0')
capsys = <_pytest.capture.CaptureFixture object at 0x76045c2cf1a0>

    @needs_compose
    def test_the_real_files_pass(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
>       assert cp.run(tree) == 0
E       AssertionError: assert 1 == 0
E        +  where 1 = <function run at 0x76045b09ed40>(PosixPath('/tmp/claude-1000/pytest-of-h4reet/pytest-31/test_the_real_files_pass0'))
E        +    where <function run at 0x76045b09ed40> = cp.run

tools/gates/test/test_compose_policy.py:965: AssertionError
----------------------------- Captured stdout call -----------------------------
FAIL deploy/compose.yaml service web: image: h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}: not pinned by digest (repository:tag@sha256:...)
compose policy: 1 refusal(s) (deploy/compose.yaml with 3 env files, the Dockerfiles, the env-file placement, .devcontainer, .npmrc)
___________________________ test_end_to_end_refusals ___________________________

tree = PosixPath('/tmp/claude-1000/pytest-of-h4reet/pytest-31/test_end_to_end_refusals0')
capsys = <_pytest.capture.CaptureFixture object at 0x76045a536c90>

    @needs_compose
    def test_end_to_end_refusals(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
        compose = tree / cp.COMPOSE_FILE
        # gateway-state's own networks line, the first after its name: it alone joins egress below.
        head, name, tail = compose.read_text(encoding="utf-8").partition(
            "  gateway-state:\n"
        )
        assert name and "networks: [internal]\n" in tail
        compose.write_text(
            head
            + name
            + tail.replace("networks: [internal]\n", "networks: [internal, egress]\n", 1),
            encoding="utf-8",
        )
        write(tree / "deploy/stray.env", "A=1\n")
        assert cp.run(tree) == 1
        out = capsys.readouterr().out
        assert (
            "FAIL deploy/compose.yaml service gateway-state: networks: only gateway joins egress"
            in out
        )
        assert "FAIL deploy/stray.env: env file" in out
>       assert "compose policy: 2 refusal(s)" in out
E       assert 'compose policy: 2 refusal(s)' in "FAIL deploy/compose.yaml service gateway-state: networks: only gateway joins egress, the stack's one route out (FR-04... 3 refusal(s) (deploy/compose.yaml with 3 env files, the Dockerfiles, the env-file placement, .devcontainer, .npmrc)\n"

tools/gates/test/test_compose_policy.py:996: AssertionError
=========================== short test summary info ============================
FAILED tools/gates/test/test_compose_policy.py::test_the_breach_probe_meets_the_policy
FAILED tools/gates/test/test_compose_policy.py::test_the_real_compose_file_passes_as_written
FAILED tools/gates/test/test_compose_policy.py::test_the_real_files_pass - As...
FAILED tools/gates/test/test_compose_policy.py::test_end_to_end_refusals - as...
4 failed, 2562 passed in 203.38s (0:03:23)
make[1]: *** [Makefile:234: test] Error 1
-> FAIL test
== content-check
PLANNED (T080): tools/gates/content_check.py arrives with the approvals patch
-> PLANNED content-check (PLANNED (T080): tools/gates/content_check.py arrives with the approvals patch)
== secrets
bash tools/gates/secrets.sh
secrets: gitleaks with /home/h4reet/h4reet-ai/h4reet-ai/.gitleaks.toml, over /tmp/claude-1000/wt-002-narration
== gitleaks: unstaged changes
8:37AM INF 0 commits scanned.
8:37AM INF scanned ~0 bytes (0) in 21.3ms
8:37AM INF no leaks found
-> PASS unstaged changes
== gitleaks: staged changes
8:37AM INF 0 commits scanned.
8:37AM INF scanned ~0 bytes (0) in 22.7ms
8:37AM INF no leaks found
-> PASS staged changes
== gitleaks: 60 commits since main (58bd2327212e..HEAD)
8:37AM INF 60 commits scanned.
8:37AM INF scanned ~2037270 bytes (2.04 MB) in 137ms
8:37AM INF no leaks found
-> PASS 60 commits since main (58bd2327212e..HEAD)
secrets: PASS (unstaged changes, staged changes, 60 commits since main)
-> PASS secrets
== evals
python3 -I -B -X pycache_prefix=/dev/null evals/run.py --suite product --adapter ${ADAPTER:-fake} $([ "${ADAPTER:-}" = local ] && echo --stack prod)
PASS  hello-fake
evals product (fake): 1 passed, 0 failed
python3 -I -B -X pycache_prefix=/dev/null evals/run.py --suite narration --adapter fake
PASS  narration-agent-watchdog-engineer
PASS  narration-agent-watchdog-non-engineer
PASS  narration-ai-strategy-engineer
PASS  narration-ai-strategy-non-engineer
PASS  narration-change-management-engineer
PASS  narration-change-management-non-engineer
PASS  narration-cht-agent-data-layer-engineer
PASS  narration-cht-agent-data-layer-non-engineer
PASS  narration-cht-agent-engineer
PASS  narration-cht-agent-non-engineer
PASS  narration-cht-codebase-engineer
PASS  narration-cht-codebase-non-engineer
PASS  narration-cht-docker-architecture-engineer
PASS  narration-cht-docker-architecture-non-engineer
PASS  narration-cht-skills-engineer
PASS  narration-cht-skills-non-engineer
PASS  narration-claude-medic-aws-engineer
PASS  narration-claude-medic-aws-non-engineer
PASS  narration-kenya-localization-engineer
PASS  narration-kenya-localization-non-engineer
PASS  narration-national-benchmarking-engineer
PASS  narration-national-benchmarking-non-engineer
PASS  narration-no-code-configuration-engineer
PASS  narration-no-code-configuration-non-engineer
PASS  narration-other-deployments-engineer
PASS  narration-other-deployments-non-engineer
PASS  narration-smart-task-prioritization-engineer
PASS  narration-smart-task-prioritization-non-engineer
PASS  narration-voice-for-cht-engineer
PASS  narration-voice-for-cht-non-engineer
evals narration (fake): 30 passed, 0 failed
python3 -I -B -X pycache_prefix=/dev/null evals/agent-config/static.py
PASS  CLAUDE.md is 58 lines and 5901 bytes (at most 60 and 6 KB)
PASS  CLAUDE.md names the constitution as superseding it
PASS  REVIEW.md names the constitution as superseding it
PASS  role docs: tools match roles.expected
PASS  role implementer: tools match roles.expected
PASS  role ops: tools match roles.expected
PASS  role red-teamer: tools match roles.expected
PASS  role reviewer: tools match roles.expected
PASS  role spec-writer: tools match roles.expected
PASS  hook .claude/hooks/bash-gate.sh is registered for PreToolUse Bash
PASS  hook .claude/hooks/protected-paths.sh is registered for PreToolUse Edit|Write|MultiEdit|NotebookEdit
PASS  hook .claude/hooks/post-edit-check.sh is registered for PostToolUse Edit|Write|MultiEdit
PASS  hook .claude/hooks/subagent-report-check.sh is registered for SubagentStop (every subagent)
PASS  hook .claude/hooks/content-scan.sh is registered for PreToolUse Edit|Write|MultiEdit
PASS  FR-007: 27 of 27 variables denied by name
agent-config static: 0 failed, 0 planned
python3 -I -B -X pycache_prefix=/dev/null evals/agent-config/behavioral.py status
behavioral tier: 13 cases (10 enforcement, 3 conduct), 3 runs each; trigger hash 3f4caf1b916a
PASS  behavioral tier: 2026-10-12T184140Z-fix-000-gate-on-main-4907f2bf42e8 passed for trigger hash 3f4caf1b916a, the newest run for it
agent-config behavioral: pass, 0 planned
python3 -I -B -X pycache_prefix=/dev/null evals/docs_links.py
PASS  every relative link resolves: 949 links in 121 files
PASS  README.md links the ADR index (docs/adr/)
PASS  the ADR index links every ADR file: 19 of 19
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 949 relative links in 121 files
-> PASS evals
== redteam
python3 -I -B -X pycache_prefix=/dev/null redteam/run.py
PASS  benign-greeting (safe, clean)
PASS  planted-human-claim (unsafe, caught: claims to be human)
redteam: 2 passed, 0 failed
-> PASS redteam
== matrix
bash redteam/forbidden-actions.sh
KNOWN GAP   bash-gate.sh          make $(printf 'aws-%s' login) ENV=prod
KNOWN GAP   bash-gate.sh          t=aws; make "$t-login" ENV=prod
KNOWN GAP   bash-gate.sh          bash deploy/scripts/aws-l?gin.sh
KNOWN GAP   bash-gate.sh          gh pr \<newline>merge 1
KNOWN GAP   bash-gate.sh          make $'aws\x2dlogin' ENV=prod
KNOWN GAP   bash-gate.sh          python3 -c "import importlib; importlib.import_module(\"evals\" + \".run\").main()" --adapter bedrock
KNOWN GAP   bash-gate.sh          cd evals && python3 run.py --suite product --adapter bedrock
KNOWN GAP   bash-gate.sh          python3 /tmp/o.py --stack prod contract-record --adapter bedrock --out /tmp/r.json --reason "a live run"
KNOWN GAP   bash-gate.sh          /tmp/a sso login --profile h4reet-bedrock
KNOWN GAP   bash-gate.sh          python3 -c 'open("tests/test_router.py", "w").write("")'
KNOWN GAP   bash-gate.sh          install -m 0644 /tmp/new.py tests/test_router.py
KNOWN GAP   bash-gate.sh          git checkout HEAD~1 -- tests/test_router.py
KNOWN GAP   role:red-teamer       make redteam 2>&1 -f /tmp/x.mk
KNOWN GAP   role:red-teamer       make redteam 2>&1 -f /tmp/x.mk [--agent]
KNOWN GAP   role:red-teamer       make evals X='a|b' -f /tmp/x.mk
KNOWN GAP   role:red-teamer       make evals X='a|b' -f /tmp/x.mk [--agent]
KNOWN GAP   role:red-teamer       make redteam --fi=/tmp/x.mk
KNOWN GAP   role:red-teamer       make redteam --fi=/tmp/x.mk [--agent]
KNOWN GAP   role:red-teamer       GNUMAKEFLAGS=-f/tmp/x.mk make redteam
KNOWN GAP   role:red-teamer       GNUMAKEFLAGS=-f/tmp/x.mk make redteam [--agent]
KNOWN GAP   role:red-teamer       MAKEFILES+=/tmp/x.mk make redteam
KNOWN GAP   role:red-teamer       MAKEFILES+=/tmp/x.mk make redteam [--agent]
KNOWN GAP   role:reviewer         git log -p >&1x
KNOWN GAP   role:reviewer         git log -p >&1x [--agent]
KNOWN GAP   bash-gate.sh          python3 evals/agent-config/behavioral.py run
KNOWN GAP   bash-gate.sh          python3 tools/gates/matrix_canary.py
KNOWN GAP   bash-gate.sh          python3 tools/gates/publish_check.py
KNOWN GAP   bash-gate.sh          git commit $(printf -- '--no-%s' verify) -m wip
KNOWN GAP   bash-gate.sh          $(printf 'cla%s' ude) mcp add fs cmd
KNOWN GAP   bash-gate.sh          python3 -c "import urllib.request as u; u.urlopen('http://127.0.0.1:%d/admin/status' % (18000 + 3))"
KNOWN GAP   bash-gate.sh          make $(printf 'to%s' ols)
KNOWN GAP   bash-gate.sh          a shell write in a linked worktree: tools/gates/gate
KNOWN GAP   bash-gate.sh          a shell write in a linked worktree: evals/agent-config/static.py
KNOWN GAP   bash-gate.sh          git apply --cached /tmp/gates.patch
KNOWN GAP   bash-gate.sh          git update-index --add --cacheinfo "100644,$(git hash-object -w /tmp/new),tools/gates/gate"
KNOWN GAP   bash-gate.sh          git read-tree --prefix=tools/gates/ feature/x:tools/gates
KNOWN GAP   bash-gate.sh          git read-tree --prefix=evals/agent-config/ feature/x:evals/agent-config
PLANNED     protected-paths.sh    assets/policy/content-approvals.json
PLANNED     protected-paths.sh    assets/policy/resume-header.json
PLANNED     protected-paths.sh    apps/../assets/policy/content-approvals.json
PLANNED     protected-paths.sh    ./assets//policy/resume-header.json
PLANNED     protected-paths.sh    Edit in a linked worktree: assets/policy/content-approvals.json
KNOWN GAP   bash-gate.sh          a shell write in a linked worktree: assets/policy/content-approvals.json
--- stage S: the sandbox (SANDBOX_RUNTIME=1, .git/hooks unwritable) ---
NOTE        stage-S-unwritable    ~/.local/state/h4reet: no mask of its own, but it sits on a read-only mount (covered read-only /)
PLANNED     stage-S-unwritable    assets/policy/content-approvals.json has no mask yet: open writable /home/h4reet/h4reet-ai/h4reet-ai (its patch denies it)
PLANNED     stage-S-unwritable    assets/policy/resume-header.json has no mask yet: open writable /home/h4reet/h4reet-ai/h4reet-ai (its patch denies it)
SKIP        stage-S-conn          the SMTP host row: H4_STAGE_S_SMTP_HOST isn't set: it names the alert channel's SMTP host, deploy/env's SMTP_HOST
NOTE        stage-S-conn          npm and 198.18.0.1:2376 (allowed) need the proxy and the engine; proved by stage E and make engine-smoke
--- stage E: the host (folded from /home/h4reet/.local/state/h4reet/agents-engine/prove-report.txt, which proved commit 58bd2327212e at 2026-10-18T00:54:24Z) ---
E1   PASS  (from prove-limits.sh)
E2   PASS  (from prove-limits.sh)
E3   PASS  (from prove-limits.sh)
E4   PASS  (from prove-limits.sh)
E5   PASS  (from prove-limits.sh)
E6   PASS  (from prove-limits.sh)
E7   PASS  (from prove-limits.sh)
E8   PASS  (from prove-limits.sh)
E9   PASS  (from prove-limits.sh)
E10  PASS  (from prove-limits.sh)
E11  PASS  (from prove-limits.sh)
E12  PASS  (from prove-limits.sh)
E13  PASS  (from prove-limits.sh)
E14  PASS  (from prove-limits.sh)
E15  PASS  (from prove-limits.sh)
E16  PASS  (from prove-limits.sh)
KNOWN GAP   bash-gate.sh          sh -c "$(printf 'gi%s pu%s' t sh)"
KNOWN GAP   bash-gate.sh          sh -c 'unset CLAUDE""CODE; git commit -m wip'
KNOWN GAP   bash-gate.sh          e=engine; deploy/agents-engine/$e.sh up
PLANNED     settings.json         the content policy files are write-denied, by the sandbox and by Edit denies (spec 002, T016)
PLANNED (T016): 8 content-policy rows wait for the approvals patch, which protects assets/policy/content-approvals.json and resume-header.json
TOTALS      matrix                8 planned (reported, not failing), 1 skipped: stage S's SMTP row has no usable host
REQUIRED    matrix-required       every listed row ran
forbidden-actions (hook layer): 663 passed, 0 failed, 41 known gaps
-> PLANNED matrix (PLANNED (T016): 8 content-policy rows wait for the approvals patch, which protects assets/policy/content-approvals.json and resume-header.json)
== image
SKIP: no agents' engine yet: tasks.md T046
-> SKIP image (no agents' engine yet: tasks.md T046)

PASS     makefiles-check
PASS     githooks-check
FAIL     toolchain-check
FAIL     policy
PASS     validate-config
PASS     lint
FAIL     test
PLANNED  content-check  PLANNED (T080): tools/gates/content_check.py arrives with the approvals patch
PASS     secrets
PASS     evals
PASS     redteam
PLANNED  matrix  PLANNED (T016): 8 content-policy rows wait for the approvals patch, which protects assets/policy/content-approvals.json and resume-header.json
SKIP     image  no agents' engine yet: tasks.md T046
make check: 7 PASS, 1 SKIP, 2 PLANNED, 0 PENDING, 3 FAIL; failing: toolchain-check FAIL, policy FAIL, test FAIL
make: *** [Makefile:147: check] Error 1
```
