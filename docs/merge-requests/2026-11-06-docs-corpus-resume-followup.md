# docs/corpus-resume-followup
Spec: [specs/002-the-room/spec.md](../../specs/002-the-room/spec.md), FR-014 and FR-015 (the resume cites the corpus, with the ownership verb the corpus rules for each role), and [data-model.md](../../specs/002-the-room/data-model.md) §2; the corpus's own rules, [corpus/README.md](../../corpus/README.md) ("Who edits the corpus": agents file proposals only; "Public safety", rule 2: a public amount goes through an attested facts slot) · Intent: none new (intent 002) · Written by: the main session (Claude Opus 5.5) · Date: 2026-11-06
Session: the main session started from `/home/h4reet/h4reet-ai/h4reet-ai`; this branch's worktree is `/tmp/claude-1000/wt-fu-docs`, cut from `main` at df2dcf45 · Repo hooks active: yes (the commit runs the repository's pre-commit hooks, gitleaks and the arrival check). The bash gate refused one of the session's commands, and it wasn't respelled: a `git diff --no-index` after a `cd` to a path held in a shell variable, which the gate couldn't resolve against its deny rules. The session gave later commands literal paths, as patch B's session did.

Authorized by: the Author's message of 2026-11-06: "build patch D, the resume's follow-up, the way patches B and C were built", with his answers of 2026-10-30 in his words, and "The corpus part is a patch I commit. Agents never write corpus/. Build it from plain copies outside any checkout, never with git apply in a worktree." Then his answers in the session: "The same credits", "Medic, on my application", and "Merge by hand, no gate".

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
   git cat-file blob 0c20cdee2459cb59004f576de7f54e7ffa9f61f5 | sha256sum
   # expect 5dab3bf8a31a5caa8e1ecb90a5b9c7c0e650a1a1e34c66f06cdc478588c94613
   git cat-file blob 0c20cdee2459cb59004f576de7f54e7ffa9f61f5 | git apply --check
   git cat-file blob 0c20cdee2459cb59004f576de7f54e7ffa9f61f5 | git apply --index
   make -f Makefile corpus-check
   git commit -m "corpus: the resume's follow-up from the answers of 2026-10-30 and 2026-11-06: the Denver Local AI label, PowerSync's account and the Anthropic credits' slot, and 00's pointer to 04 to 06 (patch D)"
   git rev-parse --verify HEAD
   ```
   With your denylist, `corpus-check` should say "OK — 44 slots, 26 filled, denylist applied (…), 0 problems". If you want a line changed, say so rather than editing the patch: the content branch's lock pins the patched files' exact bytes.
2. **Tell the session the SHA the last command printed,** and leave your checkout where it is, off `main`. The session cuts the content branch on that commit, runs `make check` and the merge rehearsals there, and gives you the merge step. Until then `make test` on `docs/corpus-patch-d` reports the resume's lock stale for `00`, `02`, `03`, and `07`; that's expected, and nothing merges until the content branch brings the lock.

**If step 0 prints a name, or `corpus-check`'s rule 4 fails in step 1,** stop: no branch is merged. Delete `docs/corpus-patch-d` and this branch, and the session recuts this branch from `main` without the line, so the phrase never reaches `main`'s history.

## What changed and why

Your answers of 2026-10-30 settled four things patch A had left open: the Denver Local AI label, "configured" as a verb, PowerSync's account, and whether the credits' amount may be public. No committed file recorded them, and patches B and C left them for "the resume's follow-up", with `00`'s missing pointer to `04` to `06`. Agents can't write `corpus/` (`CLAUDE.md`; `corpus/README.md`, "Who edits the corpus"), so the corpus part comes as a patch you commit, and the resume and code part as a content branch on your commit, in patch A's order.

| File | In patch D |
|---|---|
| `corpus/00-profile.md` | The pointer to `04` to `06` at the end of "Background and values", and the header's line on untagged lines |
| `corpus/02-production-infrastructure-national-scale.md` | Your PowerSync account, verbatim, with the amount in its slot, and beside it that Medic received the credits, on your application |
| `corpus/03-grants-and-credits.md` | The Anthropic credits' bullet filled from your account and your two answers of 2026-11-06, with program and year still `[?]`; the header's "No amounts" and the "Do not claim" line on amounts each name the credits' amount as the one exception |
| `corpus/07-denver-local-ai.md` | Your resume label, verbatim: "(co-owner, Applied AI Engineer)" |
| `corpus/facts/credits.yaml` (new) | The slot `credits.anthropic_amount`: the amount as you said it, tagged A, public-safe, with your words as its source |
| `corpus/README.md` | `03`'s row: one amount, in a facts slot |

The proposal sets every change beside your words, with five readings, the questions that remain, and the lines patch D leaves stale.

**What the content branch will carry,** reviewed with this branch (Review) from its draft, the never-merged `wip/002-resume-followup`: "configured" in `OWNERSHIP_VERBS` (`apps/web/build/content.ts`), in `data-model.md` §2, and in `plan.md` §2, with a test that failed before the code change; `resume.yaml`'s `agent-orchestrator` declaring "configured" and `denver-local-ai` reading "(co-owner, Applied AI Engineer)"; and the lock, regenerated. The narration scripts, their eval cases, and `config/room-events.yaml` don't change.

## Acceptance criteria

- Spec 002 FR-014: the label is cited, from `07`'s new line under `[A 2026-10-30]`, on the content branch. The credits' amount is a number about the Author's work, so it sits in a filled, attested slot, and no resume line uses it.
- FR-015: "configured" is the Author's ruling ("Yes, configured for technical software is a verb"), and `01` already rules it for the agent orchestrator. The content branch makes it a verb the check knows.
- `corpus/README.md`, "Public safety", rule 2: the amount became public-safe, so it goes through a facts slot with an explicit attestation, and no corpus Markdown holds it.
- Every "Do not claim" line stays a refusal case. The one on amounts names its exception, and its key phrase, "any amount", is unchanged.
- Not met here: the credits' program and year (`[?]`); a Golden Q&A for them; and the open items patches B and C left (the proposal's questions).

## Constitution check

Applied with the constitution-check questions against [constitution](../../.specify/memory/constitution.md) 1.0.1.

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local by default | No | No byte leaves the visitor's device, and no runtime path changes. No disclosure entry. |
| II. Production-grade or not shipped | Yes | `corpus-check` passes on the patched tree, and the content check and `make test` pass with the content branch on it (Verification). The amount is attested in a slot that the check reads. |
| III. Intent before spec, spec before code, humans merge | Yes | The corpus changes only by your commit of patch D, built from plain copies outside any checkout. The code change comes with its spec change, `data-model.md` §2 and `plan.md`, by your answer, on the content branch. You merge. |
| IV. Least privilege | No | No permission, allowlist, credential, or enforcement point changes. The refused command is above; it wasn't respelled. |
| V. Cost is a first-class signal | No | $0: no model call, budget, or cap changes. |
| VI. Build in public, including failures | Yes | The amount is public by your choice of 2026-10-30, for the resume and the twin. Nothing in this branch names a private detail, and your denylist runs over it first (step 0). |
| VII. Own the whole product, and say exactly what you owned | Yes | Your account keeps its verbs, and beside them `02` and `03` say the credits are Medic's, on your application. "That Hareet won anything personally" stands. The label is yours, verbatim. |
| VIII. Honest AI | Yes | The twin speaks only from the corpus. The credits' program and year stay `[?]`, and the corpus doesn't say whether the sync layer is built (proposal, reading 2). |
| Accessibility (FR-065, WCAG 2.2 AA) | No | No UI change. |

No deviation on this branch. The merge's skipped gate is named in the content branch's note, which carries the merge.

## Review

Pending: one review, by an agent that wrote none of this, of this branch and `wip/002-resume-followup` together.

## Verification

- **The patch's build.** Plain copies of `main`'s five files at df2dcf45 (`git cat-file`) in `a/`, and the edited copies plus the new facts file in `b/`, both outside any checkout; then `git diff --no-index --full-index --no-prefix a b`, with the new file's `diff --git` header set to `a/… b/…`. It holds 6 entries, every pre-image `main`'s blob. Blob 0c20cdee2459cb59004f576de7f54e7ffa9f61f5, SHA-256 5dab3bf8a31a5caa8e1ecb90a5b9c7c0e650a1a1e34c66f06cdc478588c94613.
- **His words.** A script filled the slots and found each of his four quotes verbatim, in quotation marks: the PowerSync account in `02`, its credits clause in `03`, the label in `07`, and the verb in `data-model.md` §2. "4 quotes checked, 0 not verbatim".
- **On a fresh plain export of df2dcf45:** `git apply --check`, then `git apply`, both clean; all six files match the plain copies byte for byte. `corpus-check`: "corpus-check: OK — 44 slots, 26 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems".
- **With the content too,** on a plain export of the wip commit with patch D applied, before the lock: "corpus changed since the lock" for exactly `00`, `02`, `03`, and `07`, and "content: C1–C9 and N1–N5 passed for the resume and 44 scripts (denylist missing); the lock and the eval cases are stale". After `npm run content:lock -w apps/web`: "the lock and the eval cases are current". The lock differs from `main`'s only in those four hashes; all 44 eval cases and `config/room-events.yaml` are byte-identical to `main`'s.
- **`make test` and `make lint` on that export:** pending.

## Cost and data-flow impact

$0 at run time: no model call, endpoint, poll, or budget change. No byte leaves the visitor's device, so no data-flow disclosure entry. The resume's text changes on the content branch and stays a draft until you approve its hash.

## For the Author

1. **The order:** steps 0 to 2 here, then the content branch's note, which holds the merge.
2. **The proposal's questions:** the credits' program and year; PowerSync's place in time; a Golden Q&A for the credits; and whether the Denver Local AI scripts should name your label. None blocks this.
