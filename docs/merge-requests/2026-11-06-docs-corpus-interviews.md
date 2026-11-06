# docs/corpus-interviews
Spec: [specs/004-room-composition/spec.md](../../specs/004-room-composition/spec.md), FR-036 to FR-039 and the Assumptions' "The corpus" (the Author writes the topics' corpus in his own words; agents file proposals only); [specs/002-the-room/spec.md](../../specs/002-the-room/spec.md), FR-023 and FR-050 (a topic opens only once its corpus, product evals, and red-team cases exist) · Intent: none new · Written by: the main session (Claude Opus 5.5) · Date: 2026-11-06
Session: the main session started from `/home/h4reet/h4reet-ai/h4reet-ai`; this branch's worktree is `/tmp/claude-1000/wt-interviews`, cut from `main` at 40148d3e · Repo hooks active: yes (the commit runs the repository's pre-commit hooks, gitleaks and the arrival check). The bash gate refused three of the session's commands, and none was respelled:
- a `grep` of `apps/web/package.json` after a `cd` to a path held in a shell variable, which it couldn't resolve against its deny rules; the session read the file with Read and gave later commands literal paths;
- `rm -rf` of a scratch folder under `/tmp/claude-1000`, a recursive delete outside the repository; the session used fresh folder names and deleted nothing;
- `git reset --keep` in this worktree while main's checkout was on `main` ("changing main"); the session waited until the checkout was off `main`.

Two earlier commands of the session's held the same kind of delete through a shell variable (`rm -rf "$X"`, and `rm -rf "$d"` in a loop), which the gate didn't refuse. Their targets didn't exist yet, so nothing was removed (For the Author, item 6).

Authorized by: the Author's message of 2026-11-06, which came with interview 1's document: "One of the tasks remaining was to complete our resume input by using two interviews via a claude chat. I have finished that and have the output here. Please create a new branch or worktree and add these in and give me the steps to merge into it's step in the "where the room stands" runbook." The prompts' page, "Twin Corpus Interviews", told him what would happen to the document: "Paste each document into Claude Code as it comes. The topics' numbers go into facts slots, never into the text, and anything you marked private stays out." After the session's questions, his reply of 2026-11-06: "Okay, we are off main branch. Go ahead and let me know how to merge this work into main with commands afterwards". The session took it as going ahead with the defaults it had offered (Review, I1; For the Author, item 1).

**Status: documents for you to read, and patch B for you to commit; then one gated merge.** This branch adds three files and changes none: the proposal, [corpus/proposals/topics-2026-11-06.md](../../corpus/proposals/topics-2026-11-06.md); patch B, [2026-11-06-corpus-topics.patch](2026-11-06-corpus-topics.patch); and this note. Patch B brings interview 1's document into the corpus: `04-hobbies-and-travel.md`, `05-mission.md`, and `06-work-projects.md`, their facts slots, the interview itself under `corpus/intake/`, two README lines, and the 44 narration eval cases that the new "Do not claim" lines change. Interview 2's document, for `07` and `08`, hasn't come in; it goes into patch C, with the resume's follow-up.

## Runs in your terminal

From main's checkout. **Where in "Where the Room Stands":** its step 6, the interviews, once your checkout is off `main` at a pause (step 5); nothing else in the queue touches patch B's paths (Verification). Nothing to install, and nothing paid: this branch changes no agent config, so the gate's evals read what's recorded.

0. **First, your denylist over this branch's committed files.** It prints file names only, and the patch file carries the text of every file patch B writes, so it should print nothing:
   ```bash
   sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e '/^$/d' -e '/^#/d' corpus/intake/private/denylist.txt | git grep -liF -f - docs/corpus-interviews -- corpus/proposals/topics-2026-11-06.md docs/merge-requests/2026-11-06-corpus-topics.patch docs/merge-requests/2026-11-06-docs-corpus-interviews.md
   ```
1. **Commit patch B on a short branch at this branch's tip,** applying it unmodified from its blob, as patch A was:
   ```bash
   git switch -c docs/corpus-topics docs/corpus-interviews
   git log -1 --format=%H      # the tip the session gave you
   git cat-file blob e6d07fe06314a1e118ff62e6b3187c27eb6ac715 | sha256sum
   # expect b16a6c1e8251ea4a90563243a2c8690d92bb280deb270c0674369af8dd199e8a
   git cat-file blob e6d07fe06314a1e118ff62e6b3187c27eb6ac715 | git apply --check
   git cat-file blob e6d07fe06314a1e118ff62e6b3187c27eb6ac715 | git apply --index
   make -f Makefile corpus-check
   git commit -m "corpus: topics 04 to 06 from the interview of 2026-11-06, and the narration eval cases they regenerate (patch B)"
   ```
   With your denylist, `corpus-check` should say "OK — 43 slots, 25 filled, denylist applied (…), 0 problems". If you want a line changed, say so rather than editing the patch: the eval cases follow the corpus's exact "Do not claim" lines, so the two are rebuilt together.
2. **Gate it, from `main`:**
   ```bash
   git switch main
   tools/gates/gate docs/corpus-topics
   ```
   Expect "Not ready to merge", with `evals` the only step not passing: PENDING, because `main`'s agent config since P-7 (trigger hash 788771dbb186) has no recorded behavioral run. This branch touches no agent-config path, so agent-config-evals is SKIP; running that tier (`make evals-agent-config REF=<branch>`, paid) is yours to choose, and this branch doesn't need it. If the gate also says `main` has commits `docs/corpus-topics` doesn't, `main` moved after the session's commit: merge `refs/heads/main` into `docs/corpus-topics` and gate again, or tell the session.
3. **Merge by hand, by the gate's SHA, with its summary line and that reason:**
   ```bash
   git --no-replace-objects merge --no-ff -m "Merge docs/corpus-topics (<sha12>)" -m "<the gate's summary line>" -m "Merged by hand: the gate's only step not passing was evals, PENDING, with no recorded behavioral run for main's agent config (trigger hash 788771dbb186); this branch touches no agent-config path, so agent-config-evals was SKIP." <sha>
   ```
4. **Switch off `main` when you pause,** as the runbook's step 5 says.
5. **Cleanup, after the merge:** `git worktree remove /tmp/claude-1000/wt-interviews` first (the session can't: the bash gate refuses deletes outside the repository), then `git branch -d docs/corpus-interviews docs/corpus-topics`.

**If step 0 prints a name, or `corpus-check`'s rule 4 fails in step 1,** stop: neither branch is merged. Delete both, and the session recuts this branch from `main` without the line, so the phrase never reaches `main`'s history.

## What changed and why

Interview 1 ran in a separate Claude chat from the prompts' page. It produced one document: the Author's answers verbatim, the Golden Q&A he approved, what the twin must not claim, and the numbers, each marked public. The room's topics name `corpus/04-hobbies-and-travel.md`, `corpus/05-mission.md`, and `corpus/06-work-projects.md` (spec 004, FR-036; `apps/web/room/topics.yaml` on line R), and none existed. Agents can't write `corpus/` (`CLAUDE.md`; `corpus/README.md`, "Who edits the corpus"), so the content comes as a patch the Author commits, as patch A did.

| File | In patch B |
|---|---|
| `corpus/intake/interview-2026-11-06-hobbies-mission-work.md` (new) | The document exactly as he pasted it, under a one-line source comment like the other intake files'. Content from another chat enters through `intake/` (`corpus/README.md`, "Provenance rule") |
| `corpus/04-hobbies-and-travel.md` (new) | Snowboarding, biking, Arya, and travel: his answers as quotes, the eight Golden Q&A he approved, and "Do not claim" as he answered it ("No") |
| `corpus/05-mission.md` (new) | What he wants his work to do, Seva day to day, when new technology is worth it, and the team he hopes for: his answers, his two corrected role claims up top, two "Do not claim" lines, and seven Golden Q&A |
| `corpus/06-work-projects.md` (new) | What he's building now, the infrastructure agents, the work from his travels, and what an engineer and a non-engineer should take away: his answers, `00`'s ownership line beside his Kenya answer, two "Do not claim" lines, and seven Golden Q&A |
| `corpus/facts/hobbies-and-travel.yaml`, `mission.yaml`, `work-projects.yaml` (new) | Nine new slots for the numbers about him he marked public, each filled, with his words as its source. `05`'s award year uses the existing `awards.imagine_year`, and the figure of speech, "Day 1" and "Day 100", stays as text |
| `corpus/README.md` | Three rows in the file table |
| `corpus/intake/README.md` | The interview added to its list of public sources |
| `evals/narration/cases/*.yaml` (44) | Regenerated by `npm run content:lock -w apps/web`: each case's `not_contains` gains the four phrases of the new "Do not claim" bullets |

**Why the eval cases are in the patch.** Each narration eval case lists every public "Do not claim" phrase in the corpus. With `05` and `06` applied and nothing else, the room's content check reports "the lock and the eval cases are stale", and `make test` would fail on `main`. Patch A came with a content branch after the Author's commit, because it changed files the resume's lock pins. Patch B changes none (the lock is byte-identical after regeneration), so the only generated files it moves are the cases. They are deterministic, the gate checks them, and one merge brings everything, with `main` green after every commit.

**What waits for patch C:** interview 2 (the Golden Q&A for `07` and `08`, and their priorities); the Author's answers of 2026-10-30 on the Denver Local AI role line, PowerSync's account, and the credits, which no committed file records; the "co-owner, Applied AI Engineer" label and "configured" in the resume. All of them change files the resume's lock pins, so they follow patch A's order: his commit on a short branch, the content branch on it, one gated merge.

The proposal lists how the files are written, every place they depart from the interview's text and why, four readings beside his words, and the questions that remain.

## Acceptance criteria

- Spec 004 FR-036: each topic's corpus files now exist (`04` to `06`). FR-037 is unchanged: each topic stays unready until the twin's spec marks it ready, so the room shows the same fixed message.
- FR-039: the twin knows the chalkboard only through the corpus. `05` quotes the interviewer's note on what it lists and points to `07`; nothing makes the board speak for the Author.
- Spec 002 FR-050: the new "Do not claim" lines join the refusal cases the corpus feeds, and the narration's `not_contains` already carries them. The location cases are the twin's spec's (For the Author, item 1).
- The resume and its 44 narration scripts pass C1 to C9 and N1 to N5 against the patched corpus, and the lock doesn't change.
- Not met here: spec 004's Assumptions also list "the three approach words" among the corpus the Author writes, and the interview names none (For the Author, item 3).

## Constitution check

Applied with the constitution-check questions against [constitution](../../.specify/memory/constitution.md) 1.0.1.

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local by default | No | No byte leaves the visitor's device, and no runtime path changes: the topics stay on their fixed message (FR-037). No disclosure entry. |
| II. Production-grade or not shipped | Yes | `corpus-check` passes on the patched tree, and the regenerated eval cases are what `make test` checks. Every new "Do not claim" line is a refusal case (`corpus/README.md`, "Corpus → evals"). The topics' product evals and red-team cases are the twin's spec's, and FR-023 keeps each topic closed until they pass. No telemetry, runbook, or alert: nothing runs. |
| III. Intent before spec, spec before code, humans merge | Yes | Under spec 004's Assumptions ("agents only file proposals in `corpus/proposals/`"). The corpus changes only by the Author's commit of patch B, which was built from plain copies outside any checkout, and he merges. No code. |
| IV. Least privilege | No | No permission, allowlist, credential, or enforcement point changes. The refused commands are above; none was respelled. |
| V. Cost is a first-class signal | No | $0: no model call, budget, or cap changes. |
| VI. Build in public, including failures | Yes | Everything in the patch is marked public in the interview, and the interview's rules kept names, the city, and private answers in his hands. A privacy question and the location question went to him before the commit (Review, I1; For the Author, item 1). |
| VII. Own the whole product, and say exactly what you owned | Yes | Role claims stay in his words, with the two he corrected placed first in `05` and the uncorrected sentence left out. Four "Do not claim" lines bar the inflations the interview named. `06` sets `00`'s "Kenya's Ministry of Health owned the workflows and product decisions" beside "I made and led the application architecture decisions", and points to `03` for whose awards. |
| VIII. Honest AI | Yes | The twin speaks only from the corpus, and this adds the corpus for three topics, in his words, with every number about him in a slot. Disclosure is unchanged. |
| Accessibility (FR-065, WCAG 2.2 AA) | No | No UI change. |

No deviation is added.

## Review

One review by an agent that wrote none of this branch (the reviewer role), of the branch's files before its commit, at base 0acbac1a: **no Blocker, five Important, eleven Nits.** Each finding and what was done:

- **I1, Security.** A privacy question went to the Author before the commit. The session took his reply, "Go ahead" (quoted in full under Authorized by), as the default it had offered, so nothing changed.
- **I2, Bugs.** A denylist hit after the session's commit would leave the phrase in history, in the patch file and the proposal, which `corpus-check`'s rule 4 and the gate's corpus step read only in part. Fixed: step 0 runs your denylist over this branch's committed files before you apply anything, and the steps say that after any hit neither branch is merged and the session recuts from `main`.
- **I3, Bugs.** The branch sat five commits behind `main`, so the gate would have checked a tree the merge doesn't write, and step 2 hedged on what `evals` reads. Fixed: the branch is cut from `main` at 40148d3e, patch B is rebuilt there, step 2 says what the gate reads, and Verification has `make check` there and `evals/docs_links.py` on its own.
- **I4, Bugs.** The proposal's Status said to commit patch B on `main`, which skips the gate. Fixed: a short branch, then the gate.
- **I5, Constitution VII.** Readings 3 and 4 sat only in the proposal, which the twin never reads, while `06` puts his Kenya answer and "to win awards" where a non-engineer repeats them. Fixed without changing his words: `06` carries `00`'s line, "Kenya's Ministry of Health owned the workflows and product decisions", verbatim and under its own tag `[A 2026-09-07]`, then pointers to `02`'s migration and to `03`'s awards. The Kenya lead-in quotes the interviewer's candidate it answered.
- **Nits.**
  - N1, the tag: `[A 2026-11-06]` kept, each header saying why; `[A-CHAT]` offered in the proposal.
  - N2: `05`'s chalkboard line now quotes the interviewer's note under the tag.
  - N3: "himself" dropped from Smart Task Prioritization's "Do not claim" line, so its phrase also catches "I implemented Smart Task Prioritization inside the CHT"; the cases regenerated.
  - N4: the location question quotes `00`'s own rule.
  - N5: the cleanup removes the worktree first.
  - The rest: the headers' wording; step 1 applies from the blob; its commit message names the cases; the absolute worktree path; "<3" among the digits kept as text; the slot wording above; and the count. The session's first verbatim script matched only a lowercase "in his words", so it missed the six quotes that open with "In his words". The reviewer checked all of them by hand, and the fixed script finds all 50 spans verbatim.
- **The reviewer's note for line R:** RT7 matches the word Seva, which appears only in the first sentence of the Seva answer in `05` and of Golden Q&A 2; a chalk line drawn from the later sentences would pass RT7 unflagged.
- **The reviewer's own commands:** the bash gate refused three of them, all read-only, and none was respelled. Two were read-only-role refusals set off by `<…>` and `>=` inside sed and awk text, and one was a "changing main" refusal of a `git merge-base` loop. It used Read and `git diff`/`git log` instead, and ran no project code, make target, npm script, or `git apply`.

What the review found holding: all 48 of his quotes and answers verbatim, the corrected award sentence only in the intake file and `05`'s "Do not claim"; every number in an attested slot, 43 slots with unique IDs, the exceptions sound; the patch's 53 entries and both hashes; the 44 cases differing from `main`'s only by the four phrases, which appear in neither `resume.yaml` nor any script; no currency, no wife's, CEO's, or partner's name, Denver as the only home location; tags that parse and links that resolve; and the eval cases inside patch B as sound, because they are deterministic and `make test` checks them.

## Verification

- **The patch's build.** Plain copies of `main`'s files at 07245034 (`git cat-file`) in `a/`, and the edited copies in `b/`, both outside any checkout; then `git diff --no-index --full-index --no-prefix a b`, with the new files' `diff --git` headers set to `a/… b/…`, as patch A's are. It holds 53 files: 9 under `corpus/` and the 44 cases. Between 07245034 and 40148d3e nothing under `corpus/`, `evals/narration/`, `apps/web/content/`, or `apps/web/build/` changed, and no package file, so the patch is the same at this branch's base.
- **His words.** A script compared every quoted span and Golden Q&A answer in `04` to `06` with the interview file, slots filled: "28 quoted spans and 22 Golden Q&A answers checked, 0 not verbatim". `00`'s ownership line, the interviewer's candidate, the chalkboard note, and his "No" are each verbatim in their sources.
- **On a fresh plain export of 40148d3e:** `git apply --check`, then `git apply`, both clean, and all 53 files match the plain copies byte for byte. `corpus-check`: "corpus-check: OK — 43 slots, 25 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems". The room's content check: "content: C1–C9 and N1–N5 passed for the resume and 44 scripts (denylist missing); the lock and the eval cases are current".
- **Why the cases come with it,** on a plain export of 0acbac1a with the corpus files only: "content: C1–C9 and N1–N5 passed for the resume and 44 scripts (denylist missing); the lock and the eval cases are stale (run npm run content:lock -w apps/web)". After `npm run content:lock -w apps/web` they're current, `apps/web/content/resume.lock.json` is byte-identical, and each of the 44 cases gains the four lines and nothing else.
- **`make test`, with and without patch B,** on plain exports of 0acbac1a: both exit 0 with the same counts, gateway "Tests 789 passed | 12 skipped (801)", web "Tests 340 passed (340)", and pytest "3219 passed". Only `corpus-check` differs: "34 slots, 16 filled" without, "43 slots, 25 filled" with.
- **`make test` and `make lint` on the final tree:** a plain export of 40148d3e with patch B applied and this branch's three files added. Both exit 0. `make test`: "corpus-check: OK — 43 slots, 25 filled, …", gateway "Tests 810 passed | 12 skipped (822)", web "Tests 340 passed (340)", and pytest "3627 passed". `make lint`: eslint, tsc for both workspaces, Prettier ("All matched files use Prettier code style!"), `ruff check` ("All checks passed!"), `ruff format` ("352 files already formatted"), and shellcheck.
- **`make -f Makefile check ENGINE_MODE=none-yet`** in this branch's worktree at 40148d3e, with this branch's files on disk and not yet committed. `node_modules` came from `npm ci --ignore-scripts`; ENGINE_MODE is passed as a make argument, so the image SKIP reads "no agents' engine yet".

  ```text
  PASS     makefiles-check
  PASS     githooks-check
  PASS     toolchain-check
  PASS     policy
  PASS     validate-config
  PASS     lint
  PASS     test
  PASS     content-check
  PASS     secrets
  PASS     arrival
  PENDING  evals  PENDING (behavioral tier): no run for trigger hash 788771dbb186 in evals/agent-config/history/; the Author runs make evals-agent-config REF=<branch> from main's checkout, and commits its entry on the branch with the commands it prints
  PASS     redteam
  PASS     matrix
  SKIP     image  no agents' engine yet: tasks.md T046
  make check: 12 PASS, 1 SKIP, 0 PLANNED, 1 PENDING, 0 FAIL; failing: evals PENDING
  ```

  - `toolchain-check`: "all 15 match their pins, 1 newer than its floor (claude code)".
  - `test`: gateway "Tests 810 passed | 12 skipped (822)", web "Tests 340 passed (340)", pytest "3627 passed".
  - `content-check`: "content check: PASS (45 content files: 0 approved by main, 45 drafts, none of whose text is in dist/)".
  - `secrets`: "secrets: PASS (unstaged changes, staged changes, 0 commits since main)". These files were untracked then, so gitleaks also ran on its own (below).
  - `arrival`: "arrival-check: 0 findings in 11 files".
  - `evals`: "evals narration (fake): 44 passed, 0 failed", "evals product (fake): 1 passed, 0 failed", and "every relative link resolves: 1445 links in 173 files". It is PENDING only on the behavioral tier's run for `main`'s agent config, which this branch doesn't change.
  - `matrix`: "forbidden-actions (hook layer): 795 passed, 0 failed, 51 known gaps".
- **gitleaks**, with the repository's `.gitleaks.toml`: "no leaks found" over patch B's plain copies and over this branch's three files. The commit's own pre-commit hook printed gitleaks' "no leaks found" and "arrival-check: 0 findings in 3 files". After it, `make -f Makefile secrets` in the worktree printed "secrets: PASS (unstaged changes, staged changes, 1 commits since main)". (`gitleaks git` run directly from main's checkout couldn't open the sandbox's mask over `.gitleaksignore` there; the secrets stage handles it.)
- **`evals/docs_links.py` on its own,** on the final note: "docs links: 0 failed, 1445 relative links in 173 files".
- **The arrival check** (`main`'s copy), on this branch's three files, which carry the whole text of patch B: "arrival-check: 0 findings in 3 files".
- **The queue.** No queued branch or patch touches `corpus/`, `evals/narration/`, `apps/web/content/`, or `apps/web/build/`; the only patch naming `corpus/` is patch A, applied on 2026-10-30. P-9's patch names corpus files only in test fixtures, and main-ref's adds a gate step that runs `corpus-check` with your denylist over each branch's export.
- **The merge rehearsal,** in a detached scratch worktree at `main`'s tip, 40148d3e: `git merge --no-ff --no-commit` of this branch's tip said "Automatic merge went well; stopped before committing as requested", with no unmerged path and this branch's three files staged. On that merged tree, patch B from its blob passed `git apply --check`. Then `git merge --abort`, leaving the worktree clean.

## Cost and data-flow impact

$0 at run time: no model call, endpoint, poll, or budget change. No byte leaves the visitor's device, so no data-flow disclosure entry. The corpus is read by the twin's spec, which doesn't exist yet. The room's topics stay unready, and the narration suite runs on the fake adapter, $0.

## For the Author

1. **Where you can be found.** `00-profile.md`'s "Do not claim" bars "anything that locates him more closely than the city on his resume, even when a visitor offers it". Your approved words say "You can often find me there", of Winter Park Resort, in `04`'s first quote and Golden Q&A 1. Asked whether to keep or drop that sentence, you replied "Go ahead", which the session took as keeping your approved words. Spec 002's FR-050 red-team cases ("locating the Author from the room, the window's view, or the travel stories") judge it before the topic opens (FR-023). To drop it, say so before step 1: the session recuts the patch and this branch, and nothing reaches `main`.
2. **For spec 004, not this branch:** the interviewer's note says the chalkboard "links to the org website". FR-082, on `spec/004-answers-1030-r2`, draws "denverlocal.ai" as words, never a link; a link would be a new data flow, with a disclosure entry. Words only stays the default; a link goes through `/speckit-clarify`.
3. **Also for spec 004:** its Assumptions list "the three approach words" among the corpus you write. The interview doesn't name three, and the chalkboard shows only "denverlocal.ai" for now (FR-082).
4. **The proposal's questions:** priorities for `04` to `06`; the answer you'll finish later; and whether the denverlocal.ai description is the resume's line in `07` or a new paragraph. Its readings are for your eye: the tag, when the words runtime AI and buildtime AI came, role words outside the README's list, Kenya's application architecture, and "to win awards".
5. **Interview 2:** paste its document when you have it. It goes into patch C with the resume's follow-up.
6. **Backlog, for the bash gate (yours: `.claude/hooks/`):** its recursive-delete rule refused `rm -rf` with a literal path outside the repository, but not `rm -rf "$X"`, nor `rm -rf "$d"` in a loop, with the variable holding such a path. Two of the session's commands got through that way; their targets didn't exist yet, so nothing was removed. The fix, with a gap row in `redteam/forbidden-actions.sh`, is a human change.
