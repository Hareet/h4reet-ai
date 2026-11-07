# docs/corpus-resume-followup
Spec: [specs/002-the-room/spec.md](../../specs/002-the-room/spec.md), FR-014 and FR-015 (the resume cites the corpus, with the ownership verb the corpus rules for each role), and [data-model.md](../../specs/002-the-room/data-model.md) §2; the corpus's own rules, [corpus/README.md](../../corpus/README.md) ("Who edits the corpus": agents file proposals only; "Public safety", rule 2: a public amount goes through an attested facts slot) · Intent: none new (intent 002) · Written by: the main session (Claude Opus 5.5) · Date: 2026-11-06
Session: the main session started from `/home/h4reet/h4reet-ai/h4reet-ai`; this branch's worktree is `/tmp/claude-1000/wt-fu-docs`, cut from `main` at df2dcf45 · Repo hooks active: yes (each commit runs the repository's pre-commit hooks, gitleaks and the arrival check). The bash gate refused one of the session's commands, and it wasn't respelled: a `git diff --no-index` after a `cd` to a path held in a shell variable, which the gate couldn't resolve against its deny rules. The session gave later commands literal paths, as patch B's session did.

Authorized by: the Author's message of 2026-11-06: "build patch D, the resume's follow-up, the way patches B and C were built", with his answers of 2026-10-30 in his words, and "The corpus part is a patch I commit. Agents never write corpus/. Build it from plain copies outside any checkout, never with git apply in a worktree." Then the answers he chose in the session: "The same credits", "Medic, on my application", "Merge by hand, no gate", and, after the review, "Yes: add the exception".

**Status: documents for you to read, and patch D for you to commit.** This branch adds three files and changes none: the proposal, [corpus/proposals/resume-followup-2026-11-06.md](../../corpus/proposals/resume-followup-2026-11-06.md); patch D, [2026-11-06-corpus-resume-followup.patch](2026-11-06-corpus-resume-followup.patch); and this note. Once you've committed patch D, the session cuts `feat/002-resume-followup` on your commit: "configured" as an ownership verb, the two resume items, and the lock. That branch's note, `docs/merge-requests/2026-11-06-feat-002-resume-followup.md`, holds the merge, by hand and without the gate, as you chose. One merge brings this branch, your commit, and the content.

## Runs in your terminal

From main's checkout, parked off `main` (it is now, on `wip-park/11-6-2026`). Nothing to install, and nothing paid.

0. **First, your denylist over this branch's committed files.** It prints file names only, and the patch file carries the text of every file patch D writes, so it should print nothing:
   ```bash
   sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e '/^$/d' -e '/^#/d' corpus/intake/private/denylist.txt | git grep -liF -f - refs/heads/docs/corpus-resume-followup -- corpus/proposals/resume-followup-2026-11-06.md docs/merge-requests/2026-11-06-corpus-resume-followup.patch docs/merge-requests/2026-11-06-docs-corpus-resume-followup.md
   ```
1. **Commit patch D on a short branch at this branch's tip,** applying it unmodified from its blob, as patches A to C were:
   ```bash
   git switch -c docs/corpus-patch-d refs/heads/docs/corpus-resume-followup
   git cat-file blob 9198237ee5166288f5c7e38cd2039e37150df74b | sha256sum
   # expect 37003ca00dfc69b77ae367265d351d7c01848306caaee14035816332314cde85
   git cat-file blob 9198237ee5166288f5c7e38cd2039e37150df74b | git apply --check
   git cat-file blob 9198237ee5166288f5c7e38cd2039e37150df74b | git apply --index
   make -f Makefile corpus-check
   git commit -m "corpus: the resume's follow-up from the answers of 2026-10-30 and 2026-11-06: the Denver Local AI label, PowerSync's account and the Anthropic credits' slot, and 00's pointer to 04 to 06 (patch D)"
   git rev-parse --verify HEAD
   ```
   With your denylist, `corpus-check` should say "OK — 44 slots, 26 filled, denylist applied (…), 0 problems". If you want a line changed, say so rather than editing the patch: the content branch's lock pins the patched files' exact bytes.
2. **Tell the session the SHA the last command printed,** and leave your checkout where it is, off `main`. The session cuts the content branch on that commit, runs `make check` and the merge rehearsals there, and gives you the merge step. Until then `make test` on `docs/corpus-patch-d` reports the resume's lock stale for `00`, `01`, `02`, `03`, and `07`; that's expected, and nothing merges until the content branch brings the lock.

**If step 0 prints a name, or `corpus-check`'s rule 4 fails in step 1, stop:** no branch is merged. Undo your step 1, then tell the session, which recuts this branch from `main` without the line, so the phrase never reaches `main`'s history:
```bash
git reset --hard                   # only if patch D is applied but not committed
git switch wip-park/11-6-2026
git branch -D docs/corpus-patch-d
```
The session's worktrees for this branch (`/tmp/claude-1000/wt-fu-docs`, `/tmp/claude-1000/wt-fu-wip`) go with `git worktree remove` once the recut is in, and then `git branch -D docs/corpus-resume-followup wip/002-resume-followup`.

## What changed and why

Your answers of 2026-10-30 settled four things patch A had left open: the Denver Local AI label, "configured" as a verb, PowerSync's account, and whether the credits' amount may be public. No committed file recorded them, and patches B and C left them for "the resume's follow-up", with `00`'s missing pointer to `04` to `06`. Agents can't write `corpus/` (`CLAUDE.md`; `corpus/README.md`, "Who edits the corpus"), so the corpus part comes as a patch you commit, and the resume and code part as a content branch on your commit, in patch A's order.

| File | In patch D |
|---|---|
| `corpus/00-profile.md` | The pointer to `04` to `06` at the end of "Background and values"; the header's line on untagged lines; and in "Do not claim", the credits' amount named as the exception to "Award amounts" |
| `corpus/01-ai-strategy-and-cht.md` | The same exception in its "Held back until cleared" list: "every award amount, except the Anthropic credits', …" |
| `corpus/02-production-infrastructure-national-scale.md` | Your PowerSync account, verbatim, with the amount in its slot, and beside it the answer you chose on who received the credits, "Medic, on my application" |
| `corpus/03-grants-and-credits.md` | The Anthropic credits' bullet filled from your account and the two answers you chose, quoted, with program and year still `[?]`; the header's "No amounts" and the "Do not claim" line on amounts each name the credits' amount as the one exception; the header says the words of your chosen answers are the session's |
| `corpus/07-denver-local-ai.md` | Your resume label, verbatim: "(co-owner, Applied AI Engineer)" |
| `corpus/facts/credits.yaml` (new) | The slot `credits.anthropic_amount`: the amount as you said it, tagged A, public-safe, with your words as its source |
| `corpus/README.md` | `03`'s row: one amount, in a facts slot |

The proposal sets every change beside your words, with five readings, the questions that remain, and the lines patch D leaves stale.

**What the content branch will carry,** reviewed with this branch (Review) from its draft, the never-merged `wip/002-resume-followup`: "configured" in `OWNERSHIP_VERBS` (`apps/web/build/content.ts`), in `data-model.md` §2, and in `plan.md` §2, with a test that failed before the code change; `resume.yaml`'s `agent-orchestrator` declaring "configured" and `denver-local-ai` reading "(co-owner, Applied AI Engineer)"; and the lock, regenerated. The narration scripts, their eval cases, and `config/room-events.yaml` don't change.

## Acceptance criteria

- Spec 002 FR-014: the label is cited, from `07`'s new line under `[A 2026-10-30]`, on the content branch. The credits' amount is a number about the Author's work, so it sits in a filled, attested slot, and no resume line uses it.
- FR-015: "configured" is the Author's ruling ("Yes, configured for technical software is a verb"), and `01` already rules it for the agent orchestrator. The content branch makes it a verb the check knows.
- `corpus/README.md`, "Public safety", rule 2: the amount became public-safe, so it goes through a facts slot with an explicit attestation, and no corpus Markdown holds it.
- Every "Do not claim" line stays a refusal case. The two on amounts name their exception, and their key phrases, "any amount" and "award amounts", are unchanged.
- Not met here: the credits' program and year (`[?]`); a Golden Q&A for them; and the open items patches B and C left (the proposal's questions).

## Constitution check

Applied with the constitution-check questions against [constitution](../../.specify/memory/constitution.md) 1.0.1.

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local by default | No | No byte leaves the visitor's device, and no runtime path changes. No disclosure entry. |
| II. Production-grade or not shipped | Yes | `corpus-check` passes on the patched tree. On a plain export of the tree the content branch will hold, the content check, `make test`, and `make lint` pass (Verification). The amount is attested in a slot that the check reads. |
| III. Intent before spec, spec before code, humans merge | Yes | The corpus changes only by your commit of patch D, built from plain copies outside any checkout. The code change comes with its spec change, `data-model.md` §2 and `plan.md`, by your answer, on the content branch. You merge. |
| IV. Least privilege | No | No permission, allowlist, credential, or enforcement point changes. The refused command is above; it wasn't respelled. |
| V. Cost is a first-class signal | No | $0: no model call, budget, or cap changes. |
| VI. Build in public, including failures | Yes | The amount is public by your choice of 2026-10-30, for the resume and the twin. Nothing in this branch names a private detail, and your denylist runs over it first (step 0). The first test run's failure, on the wrong tree, is recorded under Verification. |
| VII. Own the whole product, and say exactly what you owned | Yes | Your account keeps its verbs, and beside them `02` and `03` quote your answer on who received the credits, "Medic, on my application". "That Hareet won anything personally" stands. The label is yours, verbatim. |
| VIII. Honest AI | Yes | The twin speaks only from the corpus. The credits' program and year stay `[?]`, and the corpus doesn't say whether the sync layer is built (proposal, reading 2). The words of your chosen answers are marked as the session's. |
| Accessibility (FR-065, WCAG 2.2 AA) | No | No UI change. |

No deviation on this branch. The merge's skipped gate is named in the content branch's note, which carries the merge.

## Review

One review by an agent that wrote none of this (the reviewer role), of this branch at 3c1b90b0 and `wip/002-resume-followup` at 521148fe together: **no Blocker, four Important, eight Nits.** Each finding and what was done:

- **I-1, the session's wording for your chosen answers.** `02` and `03` said "Medic received the credits, on his application" and "they are the credits in his account of the PowerSync work" under `[A 2026-11-06]`, and `03`'s header said "which he made public". Fixed: both now quote the answers you chose, "Medic, on my application" and "The same credits", after "he chose"; `03`'s header says their words are the session's; and every line on the amount quotes "public for the resume and the twin". Patch D was rebuilt, with a new blob, SHA-256, and lock.
- **I-2, the lines that refuse award amounts.** `00`'s "Award amounts", `01`'s "every award amount", and `03`'s Golden Q&A 2 were neither changed nor listed, while the patch's exception to "Any amount, for any award" treated the credits as an award. The question went to you, and you chose "Yes: add the exception". Fixed: `00` and `01` name the credits' amount as the one exception too, and `03`'s Golden Q&A 2 stays as you approved it, since it answers about the grant (proposal, reading 3).
- **I-3, the only test run on record failed, on a tree that wasn't the branch.** The first export was of the wip commit before it was rebased onto this branch, so it lacked the proposal, and `evals/test_docs_links.py` failed on `plan.md`'s link to it. Fixed: the runs below are on an export of the final tree, the constitution row is corrected, and the failure is recorded.
- **I-4, two quotations.** The reviewer couldn't find two quotes in the words it was given. Both are verbatim in your message of 2026-11-06: "build patch D, the resume's follow-up, the way patches B and C were built", and, in the content branch's note, "Rehearse it against main's tip and against line R's top branch, feat/004-us9-neon-sign, since line R also changes apps/web." No change.
- **Nits.**
  - The content branch's commit takes its own message, not the wip one, and its note records that its content matches the reviewed commit.
  - Its merge chain now checks the branch's tip against the SHA the session gives you.
  - The failure path above gives the commands, in order.
  - This Review section is filled before your step 1.
  - Every `[A 2026-10-30]` line rests on your message's own dating.
  - The proposal says `04` to `07`, not `08`, carry the untagged-lines sentence, and names `--no-prefix`.
  - Adding "configured" to the single-word verb list changes no behavior, since `/[a-z]ed$/` already matches it. It stays, as "architected" did, so the list matches its comment.
- **The reviewer's one refused command:** a `git show --format` with angle brackets, refused as a redirection. It wasn't respelled; the reviewer used `--format=%B` instead. It ran no project code, make target, npm script, or `git apply`.

What the review found holding:
- the patch file, its blob and hash, and its rebuild from the plain copies;
- the lock's hashes against the patched files;
- the 44 eval cases and `config/room-events.yaml`, byte-identical to `main`'s;
- every quote of yours, and no currency or slot reference in the proposal;
- Medic as the credits' recipient, "won anything personally" standing, and the sync layer's status not overstated;
- C8 for the orchestrator's item and both its scripts, and no other display text saying "configured", on `main` or on line R's top branch;
- the RED failure as real;
- the steps in zsh;
- no surname, email address, phone number, or private detail.

## Verification

- **The patch's build.** Plain copies of `main`'s six files at df2dcf45 (`git cat-file`) in `a/`, and the edited copies plus the new facts file in `b/`, both outside any checkout; then `git diff --no-index --full-index --no-prefix a b`, with the new file's `diff --git` header set to `a/… b/…`. It holds 7 entries, every pre-image `main`'s blob. Blob 9198237ee5166288f5c7e38cd2039e37150df74b, SHA-256 37003ca00dfc69b77ae367265d351d7c01848306caaee14035816332314cde85, 124 lines.
- **His words.** A script filled the slots and counted each of his quotes, in quotation marks, in the patched files: the PowerSync account in `02` and its credits clause in `03`; "The same credits" and "Medic, on my application"; "public for the resume and the twin" in `00`, `01`, and twice in `03`; the label in `07`; and the verb in `data-model.md` §2. "11 quotes checked, 0 not as expected".
- **On a fresh plain export of df2dcf45:** `git apply --check`, then `git apply`, both clean; all seven files match the plain copies byte for byte. `corpus-check`: "corpus-check: OK — 44 slots, 26 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems".
- **The lock.** On a plain export of the content with patch D applied, `npm run content:lock -w apps/web` gives "C1–C9 and N1–N5 passed for the resume and 44 scripts (denylist missing); wrote apps/web/content/resume.lock.json and 44 eval cases", and the check after it, "the lock and the eval cases are current". The lock differs from `main`'s only in the hashes of `00`, `01`, `02`, `03`, and `07`; all 44 eval cases and `config/room-events.yaml` are byte-identical to `main`'s.
- **The new test, RED then GREEN,** in the wip worktree, before and after the code change: `npx vitest run test/content/citations.test.ts` first gave "Tests 1 failed | 60 passed (61)", the new case failing with "sections[0].items[0].verb isn't one of the corpus's ownership verbs (built, designed, co-authored, sourced, sponsored, AI system architect, led, was part of a team that, architected)"; then "Tests 61 passed (61)".
- **`make test` and `make lint` on the final tree:** a plain export of the wip content commit, with this branch's three files and patch D applied, which is what the content branch will hold but its note. `node_modules` came from `npm ci --ignore-scripts`. Both exit 0.
  - `make test`: "corpus-check: OK — 44 slots, 26 filled, …", gateway "Tests 810 passed | 12 skipped (822)", web "Tests 1400 passed (1400)", and pytest "3692 passed".
  - `make lint`: eslint with `--max-warnings 0`, tsc for both workspaces, Prettier ("All matched files use Prettier code style!"), `ruff check` ("All checks passed!"), `ruff format` ("364 files already formatted"), and shellcheck.
  - The content check there: "content: C1–C9 and N1–N5 passed for the resume and 44 scripts (denylist missing); the lock and the eval cases are current".
- **The first run, on the wrong tree:** an export of the wip commit before it was rebased onto this branch. `make test` failed one test, `evals/test_docs_links.py`, with "FAIL  specs/002-the-room/plan.md:215: ../../corpus/proposals/resume-followup-2026-11-06.md: no such file or directory", because that tree lacked this branch's proposal. Everything else passed.
- **This branch's files:** `corpus-check` in its worktree ("OK — 43 slots, 25 filled", the proposal holding no amount and no slot reference), Prettier ("All matched files use Prettier code style!"), and `evals/docs_links.py` ("docs links: 0 failed, 1507 relative links in 178 files"). The patch file in the worktree is blob 9198237e…, the blob step 1 names.

## Cost and data-flow impact

$0 at run time: no model call, endpoint, poll, or budget change. No byte leaves the visitor's device, so no data-flow disclosure entry. The resume's text changes on the content branch and stays a draft until you approve its hash.

## For the Author

1. **The order:** steps 0 to 2 here, then the content branch's note, which holds the merge.
2. **The proposal's questions:** the credits' program and year; PowerSync's place in time; a Golden Q&A for the credits; and whether the Denver Local AI scripts should name your label. None blocks this.
