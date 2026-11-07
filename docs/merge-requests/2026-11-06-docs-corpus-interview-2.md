# docs/corpus-interview-2
Spec: [specs/004-room-composition/spec.md](../../specs/004-room-composition/spec.md), the Assumptions' "The corpus" (the Author writes the topics' corpus in his own words; agents file proposals only); [specs/002-the-room/spec.md](../../specs/002-the-room/spec.md), FR-023 and FR-050 (a topic opens only once its corpus, product evals, and red-team cases exist) · Intent: none new · Written by: the main session (Claude Opus 5.5) · Date: 2026-11-06
Session: the main session started from `/home/h4reet/h4reet-ai/h4reet-ai`; this branch's worktree is `/tmp/claude-1000/wt-interview-2`, cut from `main` at f261bfab · Repo hooks active: yes (the commit runs the repository's pre-commit hooks, gitleaks and the arrival check). Earlier that evening, while main's checkout was on `main`, the bash gate refused one of the session's commands, a read-only `git merge-tree` rehearsal of `feat/004-setup` ("changing main (HEAD is main)"). It wasn't respelled: the session read the branch's ref file with Read instead. Nothing on this branch came from that command.

Authorized by: the Author's message of 2026-11-06, which came with interview 2's document: "Okay, that has been completed. And here is the interview 2 answers and output that we want to put in a branch and merge into main. Let's not have to run evals or a full setup again for this". So this branch's route has no behavioral run and no gate: the Author commits patch C on a short branch, checks it with his denylist, and merges by hand.

**Status: documents for you to read, and patch C for you to commit; then one merge by hand.** This branch adds three files and changes none: the proposal, [corpus/proposals/golden-qa-2026-11-06.md](../../corpus/proposals/golden-qa-2026-11-06.md); patch C, [2026-11-06-corpus-golden-qa.patch](2026-11-06-corpus-golden-qa.patch); and this note. Patch C brings interview 2's document into the corpus: `07-denver-local-ai.md`'s eight Golden Q&A and `08-hareet-ai.md`'s eight, with your words behind them; the interview itself under `corpus/intake/`; one README line; and the resume's lock and the 44 narration eval cases, regenerated. The resume's follow-up (the Denver Local AI label, "configured", PowerSync's account, and the credits) stays for a content branch of its own.

## Runs in your terminal

From main's checkout, parked off `main` until step 2. Nothing to install, and nothing paid: no behavioral run (this branch changes no agent config) and no gate (your choice, above).

0. **First, your denylist over this branch's committed files.** It prints file names only, and the patch file carries the text of every file patch C writes, so it should print nothing:
   ```bash
   sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e '/^$/d' -e '/^#/d' corpus/intake/private/denylist.txt | git grep -liF -f - docs/corpus-interview-2 -- corpus/proposals/golden-qa-2026-11-06.md docs/merge-requests/2026-11-06-corpus-golden-qa.patch docs/merge-requests/2026-11-06-docs-corpus-interview-2.md
   ```
1. **Commit patch C on a short branch at this branch's tip,** applying it unmodified from its blob, as patches A and B were:
   ```bash
   git switch -c docs/corpus-golden-qa docs/corpus-interview-2
   git cat-file blob 8e6eff5c2057b9ae6628d6e7313ee739efde6216 | sha256sum
   # expect 6f2fbc8d54337e86f742b644c804cfe3b1e078d8e9c0bf9931874bfd1d141105
   git cat-file blob 8e6eff5c2057b9ae6628d6e7313ee739efde6216 | git apply --check
   git cat-file blob 8e6eff5c2057b9ae6628d6e7313ee739efde6216 | git apply --index
   make -f Makefile corpus-check
   git commit -m "corpus: Golden Q&A for 07 and 08 from the interview of 2026-11-06, and the lock and narration eval cases they regenerate (patch C)"
   ```
   With your denylist, `corpus-check` should say "OK — 43 slots, 25 filled, denylist applied (…), 0 problems". If you want a line changed, say so rather than editing the patch: the lock and the eval cases follow the corpus's exact bytes, so they're rebuilt together.
2. **Merge it by hand, by its SHA:**
   ```bash
   git switch main
   sha=$(git rev-parse --verify refs/heads/docs/corpus-golden-qa)
   git --no-replace-objects merge --no-ff -m "Merge docs/corpus-golden-qa (${sha:0:12})" -m "Merged by hand, without the gate, at the Author's choice: documents and corpus only, patch C from interview 2; corpus-check passed with the Author's denylist, and the session ran make test and make lint on main with patch C applied (docs/merge-requests/2026-11-06-docs-corpus-interview-2.md)." "$sha"
   ```
3. **Park off `main` again:** `git switch -C wip-park/11-6-2026`.
4. **Cleanup, after the merge:** `git worktree remove /tmp/claude-1000/wt-interview-2` first (the session can't: the bash gate refuses deletes outside the repository), then `git branch -d docs/corpus-interview-2 docs/corpus-golden-qa`.

**If step 0 prints a name, or `corpus-check`'s rule 4 fails in step 1,** stop: neither branch is merged. Delete both, and the session recuts this branch from `main` without the line, so the phrase never reaches `main`'s history.

**What the gate would have added.** It runs the same `make test` and `make lint` in a container on the exact tree, `corpus-check` with your denylist on the export, and the image builds, which this branch doesn't touch. The session ran `make test` and `make lint` on that tree (Verification), and step 1 runs `corpus-check` with your denylist. Its `evals` step would read FAIL, `main`'s recorded behavioral run for trigger hash 788771dbb186, and its `agent-config-evals` SKIP.

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

The proposal lists how the files are written, every place they depart from the interview's text and why, five readings beside his words, and what remains.

## Acceptance criteria

- Spec 004's Assumptions, "The corpus": `07` and `08` now hold the Golden Q&A the Author wrote and approved, in his words. FR-037 is unchanged: each topic stays unready until the twin's spec marks it ready, so the room shows the same fixed message.
- Spec 002 FR-050: the "Do not claim" lists stay the refusal cases the corpus feeds, minus the one line the Author removed, and the narration's `not_contains` follows them.
- The resume and its 44 narration scripts pass C1 to C9 and N1 to N5 against the patched corpus, and the lock and the cases are current.
- The resume's follow-up isn't in this branch (Status).

## Constitution check

Applied with the constitution-check questions against [constitution](../../.specify/memory/constitution.md) 1.0.1.

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local by default | No | No byte leaves the visitor's device, and no runtime path changes: the topics stay on their fixed message (FR-037). No disclosure entry. `08`'s Golden Q&A 5 states promises the twin's spec must keep (proposal, reading 2). |
| II. Production-grade or not shipped | Yes | `corpus-check` passes on the patched tree, and the regenerated lock and eval cases are what `make test` checks. Every remaining "Do not claim" line is still a refusal case. No telemetry, runbook, or alert: nothing runs. |
| III. Intent before spec, spec before code, humans merge | Yes | Under spec 004's Assumptions ("agents only file proposals in `corpus/proposals/`"). The corpus changes only by the Author's commit of patch C, built from plain copies outside any checkout, and he merges. No code. The merge skips the gate at the Author's choice; the session's runs stand in for its `make test` and `make lint`, and his `corpus-check` for its denylist step. |
| IV. Least privilege | No | No permission, allowlist, credential, or enforcement point changes. |
| V. Cost is a first-class signal | No | $0: no model call, budget, or cap changes, and no behavioral run. |
| VI. Build in public, including failures | Yes | Everything in the patch is marked public in the interview. His wife stays unnamed, and his email stays on his resume PDF, not in the corpus. |
| VII. Own the whole product, and say exactly what you owned | Yes | Role claims stay in his words. `07`'s experience answer is followed by a pointer to `00` to `02`, where each system's role and owner are ruled (proposal, reading 5). |
| VIII. Honest AI | Yes | The twin speaks only from the corpus. Patch C adds the Author's approved answers for two topics in his words, and keeps the gaps marked `[?]`: client work, and spend figures. |
| Accessibility (FR-065, WCAG 2.2 AA) | No | No UI change. |

No deviation is added.

## Review

REVIEW PENDING

## Verification

VERIFICATION PENDING

## Cost and data-flow impact

$0 at run time: no model call, endpoint, poll, or budget change. No byte leaves the visitor's device, so no data-flow disclosure entry. The corpus is read by the twin's spec, which doesn't exist yet. The room's topics stay unready, and the narration suite runs on the fake adapter, $0.

## For the Author

1. **The guarantee.** `07`'s Golden Q&A 2 now promises that no sensitive material ever touches cloud AI, and the "Do not claim" line against it is gone, as you chose. The site's own lines, which promise a test with every miss listed, sit in the same section, and your reason for keeping the guarantee now sits beside them (proposal, reading 1).
2. **Two promises about the twin**, in `08`'s Golden Q&A 5: "your conversation is not saved", and Langfuse keeps "only costs and usage" with masking. The twin's spec has to keep both, and the data-flow disclosure has to say the same before the topic opens (reading 2).
3. **The repository link** in `08`'s Golden Q&A 2 opens for visitors only once the repository is public.
4. **Still open from patch B:** the priorities of `04` to `06`.
5. **The resume's follow-up:** the label, "configured", PowerSync's account, and the credits. It's a content branch: the session drafts it, and you commit the corpus part, as with patch A.
