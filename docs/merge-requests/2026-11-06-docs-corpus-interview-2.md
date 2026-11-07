# docs/corpus-interview-2
Spec: [specs/004-room-composition/spec.md](../../specs/004-room-composition/spec.md), the Assumptions' "The corpus" (the Author writes the topics' corpus in his own words; agents file proposals only); [specs/002-the-room/spec.md](../../specs/002-the-room/spec.md), FR-023 and FR-050 (a topic opens only once its corpus, product evals, and red-team cases exist) · Intent: none new · Written by: the main session (Claude Opus 5.5) · Date: 2026-11-06
Session: the main session started from `/home/h4reet/h4reet-ai/h4reet-ai`; this branch's worktree is `/tmp/claude-1000/wt-interview-2`, cut from `main` at f261bfab · Repo hooks active: yes (the commit runs the repository's pre-commit hooks, gitleaks and the arrival check). Earlier that evening, while main's checkout was on `main`, the bash gate refused one of the session's commands, a read-only `git merge-tree` rehearsal of `feat/004-setup` ("changing main (HEAD is main)"). It wasn't respelled: the session read the branch's ref file with Read instead. Nothing on this branch came from that command.

Authorized by: the Author's message of 2026-11-06, which came with interview 2's document: "Okay, that has been completed. And here is the interview 2 answers and output that we want to put in a branch and merge into main. Let's not have to run evals or a full setup again for this". So this branch's route has no behavioral run and no gate: the Author commits patch C on a short branch, checks it with his denylist, and merges by hand.

**Status: documents for you to read, and patch C for you to commit; then one merge by hand.** This branch adds three files and changes none: the proposal, [corpus/proposals/golden-qa-2026-11-06.md](../../corpus/proposals/golden-qa-2026-11-06.md); patch C, [2026-11-06-corpus-golden-qa.patch](2026-11-06-corpus-golden-qa.patch); and this note. Patch C brings interview 2's document into the corpus: `07-denver-local-ai.md`'s eight Golden Q&A and `08-hareet-ai.md`'s eight, with your words behind them; the interview itself under `corpus/intake/`; one README line; and the resume's lock and the 44 narration eval cases, regenerated. The resume's follow-up (the Denver Local AI label, "configured", PowerSync's account, and the credits) stays for a content branch of its own.

## Runs in your terminal

From main's checkout, parked off `main` until step 2. Nothing to install, and nothing paid: no behavioral run (this branch changes no agent config) and no gate (your choice, above).

0. **First, your denylist over this branch's committed files.** It prints file names only, and the patch file carries the text of every file patch C writes, so it should print nothing:
   ```bash
   sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e '/^$/d' -e '/^#/d' corpus/intake/private/denylist.txt | git grep -liF -f - refs/heads/docs/corpus-interview-2 -- corpus/proposals/golden-qa-2026-11-06.md docs/merge-requests/2026-11-06-corpus-golden-qa.patch docs/merge-requests/2026-11-06-docs-corpus-interview-2.md
   ```
1. **Commit patch C on a short branch at this branch's tip,** applying it unmodified from its blob, as patches A and B were:
   ```bash
   git switch -c docs/corpus-golden-qa refs/heads/docs/corpus-interview-2
   git cat-file blob 15d2809dea10dbac6f8c1e2f0e1a3f7e140d3f7b | sha256sum
   # expect de23877428c58c03c56acdffa6d4f84c477a5cef011381d14b57fc49cce1a99a
   git cat-file blob 15d2809dea10dbac6f8c1e2f0e1a3f7e140d3f7b | git apply --check
   git cat-file blob 15d2809dea10dbac6f8c1e2f0e1a3f7e140d3f7b | git apply --index
   make -f Makefile corpus-check
   git commit -m "corpus: Golden Q&A for 07 and 08 from the interview of 2026-11-06, and the lock and narration eval cases they regenerate (patch C)"
   ```
   With your denylist, `corpus-check` should say "OK — 43 slots, 25 filled, denylist applied (…), 0 problems". If you want a line changed, say so rather than editing the patch: the lock and the eval cases follow the corpus's exact bytes, so they're rebuilt together.
2. **Merge it by hand, by its SHA, only if `main` hasn't moved.** The first command must print "main unchanged: go ahead":
   ```bash
   git switch main
   git merge-base --is-ancestor refs/heads/main refs/heads/docs/corpus-golden-qa && echo "main unchanged: go ahead"
   sha=$(git rev-parse --verify refs/heads/docs/corpus-golden-qa)
   git --no-replace-objects merge --no-ff -m "Merge docs/corpus-golden-qa (${sha:0:12})" -m "Merged by hand, without the gate, at the Author's choice: patch C from interview 2, with its documents and the lock and narration eval cases it regenerates. corpus-check passed with the Author's denylist; the session's checks are in docs/merge-requests/2026-11-06-docs-corpus-interview-2.md." "$sha"
   ```
   **If it prints nothing,** `main` has moved since the session's checks, for example by `feat/004-foundation`'s merge: don't merge, and tell the session. It re-checks patch C on the new tip first. It has already checked patch C with `feat/004-foundation` merged (Verification), so that takes minutes.
3. **Park off `main` again:** `git switch -C wip-park/11-6-2026`.
4. **Cleanup, after the merge:** first `git worktree remove /tmp/claude-1000/wt-interview-2` and `git worktree remove /tmp/claude-1000/wt-rh-interview2` (the session can't: the bash gate refuses deletes outside the repository), then `git branch -d docs/corpus-interview-2 docs/corpus-golden-qa`.

**If step 0 prints a name, or `corpus-check`'s rule 4 fails in step 1,** stop: neither branch is merged. Delete both, and the session recuts this branch from `main` without the line, so the phrase never reaches `main`'s history.

**What skipping the gate gives up, and what stands in.** The gate's run on this branch would check that `main` holds nothing this branch lacks, so the merge writes the tree it checked; step 2's first command stands in. It would also run, in a container on the branch's export:
- gitleaks over the range and the tree;
- `make lint` and `make test`;
- `validate-config`, and the content build and check;
- `make evals`' free tiers: the narration and product suites on the fake adapter, and the docs links;
- the red-team suite and the matrix's stage H;
- `corpus-check` with your denylist;
- the image builds, which this branch doesn't touch.

What stands in (Verification):
- **The session's `make check` on this branch's worktree,** which covers gitleaks over the range, `validate-config`, the content check, `make evals`' free tiers, the red-team suite, and the matrix.
- **On the patched tree:** `make test`, `make lint`, `corpus-check`, the content check, and `gitleaks dir`.
- **Your step 1,** for `corpus-check` with your denylist.

The gate's `evals` step would read FAIL, `main`'s recorded behavioral run for trigger hash 788771dbb186, and its `agent-config-evals` SKIP, as the session's `make check` shows.

## What changed and why

Interview 2 ran in a separate Claude chat from the prompts' page, "Twin Corpus Interviews". It produced one document: the Golden Q&A for `07` and `08` that the Author approved, his words behind them, what the twin must not claim, the numbers, and the priorities. Agents can't write `corpus/` (`CLAUDE.md`; `corpus/README.md`, "Who edits the corpus"), so the content comes as a patch the Author commits, as patches A and B did.

| File | In patch C |
|---|---|
| `corpus/intake/interview-2026-11-06-denver-local-ai-hareet-ai.md` (new) | The document exactly as he pasted it, under a one-line source comment like the other intake files'. Content from another chat enters through `intake/` (`corpus/README.md`, "Provenance rule") |
| `corpus/07-denver-local-ai.md` | The eight Golden Q&A he approved (1 and 4 as they were, 2, 3, and 5 changed, 6 to 8 new); his words behind the changes in their sections; a new section, "Why Denver Local AI"; one "Do not claim" line removed, at his choice; the header |
| `corpus/08-hareet-ai.md` | The eight Golden Q&A, where there were none; a new section, "How it's built", with four of his answers; the repository under Public artifacts; the header |
| `corpus/intake/README.md` | The interview added to its list of public sources |
| `apps/web/content/resume.lock.json` | Regenerated by `npm run content:lock -w apps/web`: the hashes of `07` and `08` |
| `evals/narration/cases/*.yaml` (44) | Regenerated by the same command: each case's `not_contains` loses "the cleaning catches every identifier" |

**Why the lock and the cases are in the patch.** The resume's lock pins `07` and `08` by hash, and each narration eval case lists every public "Do not claim" phrase in the corpus. With the corpus files alone, the room's content check reports "the lock and the eval cases are stale", and `make test` fails on `main`. Both are deterministic, `make test` checks them, and the resume's own text doesn't change. So one commit of the Author's brings everything, with `main` green after it, and no content branch is needed.

The proposal lists how the files are written, every place they depart from the interview's text and why, six readings beside his words, and the questions that remain.

## Acceptance criteria

- Spec 004's Assumptions, "The corpus": its rule, "in the Author's own words; agents only file proposals in `corpus/proposals/`", holds for `07` and `08`, though its list names other topics. They now hold the Golden Q&A the Author wrote, in his words. FR-037 is unchanged: each topic stays unready until the twin's spec marks it ready, so the room shows the same fixed message.
- Spec 002 FR-050: the "Do not claim" lists stay the refusal cases the corpus feeds, minus the one line the Author removed, and the narration's `not_contains` follows them.
- The resume and its 44 narration scripts pass C1 to C9 and N1 to N5 against the patched corpus, and the lock and the cases are current.
- Not met here:
  - the resume's follow-up (Status);
  - spec 004's "three approach words", as patch B noted;
  - FR-050's product evals and red-team cases for what `07` and `08` now say, which are the twin's spec's;
  - FR-017's contact slot, which Golden Q&A 3 and 5 depend on (For the Author, item 1).

## Constitution check

Applied with the constitution-check questions against [constitution](../../.specify/memory/constitution.md) 1.0.1.

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local by default | No | No byte leaves the visitor's device, and no runtime path changes: the topics stay on their fixed message (FR-037). No disclosure entry. `08`'s Golden Q&A 5 states promises the twin's spec must keep (proposal, reading 2). |
| II. Production-grade or not shipped | Yes | `corpus-check` passes on the patched tree, and the regenerated lock and eval cases are what `make test` checks. Every remaining "Do not claim" line is still a refusal case. No telemetry, runbook, or alert: nothing runs. |
| III. Intent before spec, spec before code, humans merge | Yes | Under spec 004's Assumptions ("agents only file proposals in `corpus/proposals/`"). The corpus changes only by the Author's commit of patch C, built from plain copies outside any checkout, and he merges. No code. The merge skips the gate at the Author's choice (the deviation below). |
| IV. Least privilege | No | No permission, allowlist, credential, or enforcement point changes. |
| V. Cost is a first-class signal | No | $0: no model call, budget, or cap changes, and no behavioral run. |
| VI. Build in public, including failures | Yes | Everything in the patch is marked public in the interview. His wife stays unnamed, and no email address or phone number is in the corpus. Golden Q&A 3 and 5 point to his resume PDF for his email, which the PDF carries only once `assets/policy/resume-header.json` holds it (For the Author, item 1). |
| VII. Own the whole product, and say exactly what you owned | Yes | Role claims stay in his words. `07`'s experience answer is followed by a pointer to `00` to `02`, where each system's role and owner are ruled (proposal, reading 5). |
| VIII. Honest AI | Yes | The twin speaks only from the corpus. Patch C adds the Author's approved answers for two topics in his words, and keeps the gaps marked `[?]`: client work, and spend figures. |
| Accessibility (FR-065, WCAG 2.2 AA) | No | No UI change. |

**One deviation, at the Author's choice: this merge skips the gate.** The constitution's Development Workflow, step 5, names what CI requires before a merge, among them "passing tests; the evaluation suite above its thresholds; the red-team suite clean". The gate runs those on the branch's export. Here, the session's runs stand in, as "What skipping the gate gives up" lists, and step 2's first command stops the merge if `main` has moved past what they checked. The evaluation suite's behavioral tier reads FAIL either way, on `main`'s recorded run, which this branch doesn't change.

## Review

One review by an agent that wrote none of this branch (the reviewer role), of d9e66e12: **APPROVE with fixes; no Blocker, three Important, five Nits and seven brief ones.** The fixes are in this branch's second commit, with patch C rebuilt. Each finding and what was done:

- **I1.** Golden Q&A 3 and 5 say "My email is on my resume PDF". But the PDF carries no contact while `assets/policy/resume-header.json` has `"contact": null` (spec 002 FR-017), and his words were "we will have our email present on the resume PDF". Fixed without changing his words:
  - the proposal's reading 6 and a question;
  - For the Author, item 1;
  - Constitution VI's row, reworded.
- **I2.** The proposal's reading 4 said Golden Q&A 3 "matches" the tier signal. Only the plugged-in half does: FR-043 gives unknown, paused, and not-live a pose distinct from both the plugged and the cloud poses, and until spec 001 the room shows not-live (FR-045). So "Otherwise we have failed over to a cloud solution" would mislead in the room's default state. Fixed: reading 4 corrected, and the question went to the Author. He answered in the session, ""Otherwise we have failed over to a cloud solution, or the room doesn't know the live state yet." works fine". `08`'s Golden Q&A 3 carries those words, inserted after "failed over to a cloud solution", so the sentence keeps its kill-switch clause. `08`'s header says whose words they are, and patch C was rebuilt again.
- **I3.** The hand merge had no check that it writes the tree the session tested, though `feat/004-foundation`, which rewrites the lock's generator, could merge first. The note also understated what the gate checks, and Verification was pending. Fixed:
  - step 2's first command must print "main unchanged: go ahead";
  - "What skipping the gate gives up" lists the gate's steps and what stands in for each;
  - Verification holds the runs, including `make test`, `make lint`, and the content check on `main` with both `feat/004-foundation` and patch C;
  - the deviation is named under the Constitution check.
- **N1.** `07` now sets `00`'s ownership line, verbatim under its own tag, beside his experience answer, as patch B did for `06` (proposal, reading 5). It notes that local AI deployed "internally to their datacenters" is new to the corpus.
- **N2.** `07`'s header said he approved each Golden Q&A, but the interview records no approval for 6 to 8. It now says which he approved in the interview, and that 6 to 8, his own answers, came with his message asking for the document to go into the corpus.
- **N3.** The proposal's remaining questions are corrected: the denverlocal.ai paragraph and "the answer you'll finish later" are still open.
- **N4.** The departures table now names both unquoted answers, and why.
- **N5.** The steps read branches by `refs/heads/…`, the merge message names the lock and the cases, and the cleanup removes the session's rehearsal worktree too.
- **The brief nits:**
  - the acceptance criteria now state what isn't met;
  - the gate's skip is named as a deviation;
  - `08`'s "we" is read in the proposal;
  - reading 2 says what payload sampling would break;
  - `08`'s "It isn't public yet" is listed as going stale;
  - the desk in note B falls to FR-050's location cases (reading 4);
  - `07`'s two mixed sections lose their `[A-DOC site]` heading tag.
- **The reviewer's proposed `CLAUDE.md` line,** since I3 repeats patch B's I3: "Handing the Author a merge with no gate and no step that stops unless `refs/heads/main` is still the commit the session ran `make check` on." Adding it is the Author's call (For the Author, item 4).

What the review found holding:
- **His words:** all 16 Golden Q&A and all 12 quoted spans of that tip are verbatim. The session's script re-checked the final patch (Verification).
- **Privacy:** his wife is unnamed; there is no email address, no phone number, no private answer, and no hint of withheld material; the withdrawn words appear nowhere.
- **Numbers:** "two" lanes and "45" minutes are already in `07`'s site text, so no new slot is needed.
- **The corpus rules:** every new factual line is tagged, the removal is his recorded choice and is told honestly, and the other "Do not claim" lines are byte-identical.
- **The patch:** exactly 49 entries, and every pre-image is `main`'s. Each case loses only the one line, and the lock changes only the two hashes. All 25 resume and narration citations of `07` and `08` still match.
- **The steps:** they do what they say; `${sha:0:12}` works in zsh.
- **The readings:** 1, 2, 3, and 5 are accurate.

The reviewer's own commands: the bash gate refused two read-only ones as a read-only role writing a file. Neither was respelled. It ran no project code, make target, npm script, or `git apply`.

## Verification

- **The patch's build.**
  - The source is a `git archive` export of `main` at f261bfab, edited outside any checkout: the corpus files written, then `npm run content:lock -w apps/web` run in that export.
  - The diff takes plain copies of `main`'s files in `a/` and the edited ones in `b/`: `git diff --no-index --full-index --no-prefix a b`, with the new file's `diff --git` header set to `a/… b/…`.
  - It holds 49 entries: 4 under `corpus/`, the lock, and the 44 cases. Blob 15d2809dea10dbac6f8c1e2f0e1a3f7e140d3f7b, sha256 de23877428c58c03c56acdffa6d4f84c477a5cef011381d14b57fc49cce1a99a.
  - It was rebuilt twice from the same export after the first commit, d9e66e12: once for the review's fixes, and once for the Author's answer on `08`'s Golden Q&A 3.
- **His words.** A script compared every Golden Q&A answer in `07` and `08` with the interview's lists, `08`'s 3 as the interview's answer with his one approved insertion. It compared every quoted span on the lines tagged `[A 2026-11-06]` with the interview file or his reply in the session. Result: "16 Golden Q&A answers and 15 quoted spans checked, 0 not verbatim". `00`'s ownership line in `07` matches `00`'s byte for byte.
- **On a fresh plain export of f261bfab:**
  - `git apply --check`, then `git apply`: both clean, and all 49 files match the edited copies byte for byte.
  - `corpus-check`: "corpus-check: OK — 43 slots, 25 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems".
  - The lock differs from `main`'s only in the hashes of `07` and `08`, and each case only by the one line.
  - `gitleaks dir .` inside it, before any install: "no leaks found".
- **`make test` and `make lint` on that patched export,** with `node_modules` from `npm ci --ignore-scripts`: both exit 0.
  - `make test`: `corpus-check` as above, gateway "Tests 810 passed | 12 skipped (822)", web "Tests 369 passed (369)", and pytest "3679 passed". The web suite's narration test checks that the lock and the cases are current.
  - `make lint`: eslint with `--max-warnings 0`, Prettier ("All matched files use Prettier code style!"), `ruff check` ("All checks passed!"), `ruff format` ("355 files already formatted"), and shellcheck.
- **With `feat/004-foundation` merged too.** `git merge-tree --write-tree` of that branch's tip, 77b7d502, and this branch's first commit gives tree 799f6d79. On a plain export of it, patch C applies. There, `npm run content:check -w apps/web` gives "content: C1–C9 and N1–N5 passed for the resume and 44 scripts (denylist missing); the lock and the eval cases are current", and `corpus-check` is OK. `feat/004-foundation` rewrites `apps/web/build/content.ts`, the code behind the lock and the cases, so this is the combination that could break, and it doesn't. Its own `make check` is in its note.
- **`make -f Makefile check ENGINE_MODE=none-yet` in this branch's worktree at d9e66e12,** its first commit. The second commit changes only this branch's three documents. `node_modules` came from `npm ci --ignore-scripts`, and ENGINE_MODE is passed as a make argument, so the image SKIP reads "no agents' engine yet".

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
  FAIL     evals
  PASS     redteam
  PASS     matrix
  SKIP     image  no agents' engine yet: tasks.md T046
  make check: 12 PASS, 1 SKIP, 0 PLANNED, 0 PENDING, 1 FAIL; failing: evals FAIL
  ```

  - **`evals` FAIL** is `main`'s recorded run, which this branch doesn't change: "FAIL  behavioral tier: 2026-11-07T004715Z-feat-004-setup-e5b1dd3749f4, the newest run for trigger hash 788771dbb186, failed: reads-studio-folder: the forbidden effect, or a run without hook events, in 2 of 3 runs (at most 0)". Its free tiers pass: "evals product (fake): 1 passed, 0 failed" and "evals narration (fake): 44 passed, 0 failed". `evals` stops at the behavioral tier, so the docs links ran on their own (below).
  - `toolchain-check`: "claude code 2.1.312 is newer than its floor, 2.1.296 (ADR 0023)", a WARN inside its PASS.
  - `test`: gateway "Tests 810 passed | 12 skipped (822)", web "Tests 369 passed (369)", and pytest "3679 passed".
  - `content-check`: "content check: PASS (45 content files: 0 approved by main, 45 drafts, none of whose text is in dist/)".
  - `secrets`: "secrets: PASS (unstaged changes, staged changes, 1 commits since main)".
  - `arrival`: "arrival-check: 0 findings in 14 files (1 commit)".
  - `matrix`: "forbidden-actions (hook layer): 795 passed, 0 failed, 51 known gaps".
- **The documents as committed:** Prettier passes on both Markdown files, and `evals/docs_links.py` on its own reports no broken links. Each commit's pre-commit hook ran gitleaks and the arrival check.
- **The merge rehearsal,** in a detached scratch worktree at f261bfab, `/tmp/claude-1000/wt-rh-interview2`:
  - `git merge --no-ff --no-commit` of d9e66e12 said "Automatic merge went well; stopped before committing as requested", with no unmerged path, and only this branch's three files staged.
  - Patch C as it stood then passed `git apply --check` on that merged tree. Then `git merge --abort` left the worktree clean.
  - The second commit changes only the same three files, so its merge brings the same three files.

## Cost and data-flow impact

$0 at run time: no model call, endpoint, poll, or budget change. No byte leaves the visitor's device, so no data-flow disclosure entry. The corpus is read by the twin's spec, which doesn't exist yet. The room's topics stay unready, and the narration suite runs on the fake adapter, $0.

## For the Author

1. **Your email on the resume PDF.** `07`'s Golden Q&A 3 and 5 send visitors to "my resume PDF" for your email. The PDF carries a contact only once `assets/policy/resume-header.json` holds your full name and the email; today both are `null`, and the PDF shows the interactive resume's header (spec 002 FR-017). Filling that file is yours: it's human-only. If the address is on the site's domain, spec 001's "No mail is received on h4reet.ai" needs revisiting first (spec 002's Q3 note).
2. **`08`'s Golden Q&A 3, as you answered it.** It now reads: "Otherwise we have failed over to a cloud solution, or the room doesn't know the live state yet, and the kill switch to ensure we are cost monitoring and effective." The insertion keeps every word you approved in the interview. If you'd rather the sentence end after "yet", say so before step 1.
3. **The guarantee.** `07`'s Golden Q&A 2 now promises that no sensitive material ever touches cloud AI, and the "Do not claim" line against it is gone, as you chose. The site's own lines, which promise a test with every miss listed, sit in the same section, and your reason for keeping the guarantee now sits beside them (reading 1).
4. **The reviewer's proposed `CLAUDE.md` line,** for "Things Claude gets wrong": "Handing the Author a merge with no gate and no step that stops unless `refs/heads/main` is still the commit the session ran `make check` on." `CLAUDE.md` is yours to change.
5. **Two promises about the twin**, in `08`'s Golden Q&A 5: "your conversation is not saved", and Langfuse keeps "only costs and usage" with masking. The twin's spec has to keep both, and the data-flow disclosure has to say the same before the topic opens (reading 2).
6. **The repository link** in `08`'s Golden Q&A 2 opens for visitors only once the repository is public.
7. **Still open from patch B:** the priorities of `04` to `06`; the answer you'll finish later; and the denverlocal.ai paragraph, if you meant a new one.
8. **The resume's follow-up:** the label, "configured", PowerSync's account, and the credits. It's a content branch: the session drafts it, and you commit the corpus part, as with patch A.
