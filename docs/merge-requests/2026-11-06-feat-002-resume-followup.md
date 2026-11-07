# feat/002-resume-followup
Spec: [specs/002-the-room/](../../specs/002-the-room/spec.md) (FR-014, FR-015; [contracts/resume-source.md](../../specs/002-the-room/contracts/resume-source.md) §1 to §3; [data-model.md](../../specs/002-the-room/data-model.md) §2; [plan.md](../../specs/002-the-room/plan.md) §2) · Intent: none new (intent 002) · Written by: the main session (Claude Opus 5.5) · Date: 2026-11-06
Session: the main session started from `/home/h4reet/h4reet-ai/h4reet-ai`; this branch's worktree is `/tmp/claude-1000/wt-fu`, cut from `main` at 054d7c12, the Author's commit of patch D · Repo hooks active: yes (each commit runs the repository's pre-commit hooks, gitleaks and the arrival check). The bash gate's one refusal of the session's commands is in `docs/corpus-resume-followup`'s note; none since.

Authorized by: the Author's message of 2026-11-06: "The resume and code part is a content branch on top of the patch, with a reviewer's pass, make check ENGINE_MODE=none-yet, and a merge rehearsal. Rehearse it against main's tip and against line R's top branch, feat/004-us9-neon-sign, since line R also changes apps/web." His answers of 2026-10-30, in his words: the label, "(co-owner, Applied AI Engineer)", and "Yes, configured for technical software is a verb", which "goes in spec 002's data-model.md §2 and the content code's OWNERSHIP_VERBS". His commit of patch D, 054d7c12, and the SHA he sent. And the answer he chose in the session: "Merge by hand, no gate".

**Status: ready to merge by hand, without the gate, at your choice.** You committed patch D on `main` itself, as 054d7c12, rather than on `docs/corpus-patch-d`; its seven files are patch D's, byte for byte. This branch is cut from it and holds three commits:
- 37f3e9b6, the merge of `docs/corpus-resume-followup` (c047ab8b): the proposal, patch D's file, and that branch's note, reviewed;
- c7847fe0, the content, reviewed as `wip/002-resume-followup` (5f48a360) and committed under its own message: its diff is the reviewed commit's, byte for byte;
- this note, with an update line in the docs branch's note saying where patch D went.

**Until this merges, `main`'s `make test` fails:** the resume's lock is stale for `00`, `01`, `02`, `03`, and `07` ("corpus changed since the lock"). This branch's lock is the fix.

## Runs in your terminal

From main's checkout, parked off `main` until step 1. Nothing to install, and nothing paid: no gate (your choice) and no behavioral run (this branch changes no agent config).

0. **First, your denylist over everything this branch adds to `main`.** It prints file names only, and should print nothing:
   ```bash
   sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e '/^$/d' -e '/^#/d' corpus/intake/private/denylist.txt | git grep -liF -f - refs/heads/feat/002-resume-followup -- corpus/proposals/resume-followup-2026-11-06.md docs/merge-requests/2026-11-06-corpus-resume-followup.patch docs/merge-requests/2026-11-06-docs-corpus-resume-followup.md docs/merge-requests/2026-11-06-feat-002-resume-followup.md apps/web/content/resume.yaml apps/web/content/resume.lock.json apps/web/build/content.ts apps/web/test/content/citations.test.ts apps/web/test/fixtures/corpus/01-fixture.md specs/002-the-room/data-model.md specs/002-the-room/plan.md
   ```
1. **Merge it by hand, by its SHA, only if `main` hasn't moved and the branch's tip is the one the session checked.** Put the tip the session gave you in place of `PASTE_THE_TIP`. The `corpus-check` runs on `main`, which holds patch D, with your denylist. The last command is one chain: it prints "main unchanged, tip as checked: go ahead" and merges, or does neither:
   ```bash
   git switch main
   make -f Makefile corpus-check
   tip=PASTE_THE_TIP
   git merge-base --is-ancestor refs/heads/main "$tip" && [ "$(git rev-parse --verify refs/heads/feat/002-resume-followup)" = "$tip" ] && echo "main unchanged, tip as checked: go ahead" && git --no-replace-objects merge --no-ff -m "Merge feat/002-resume-followup (${tip:0:12})" -m "Merged by hand, without the gate, at the Author's choice: the resume's follow-up on his patch D (054d7c129487): configured as an ownership verb, the Denver Local AI label, the lock, and the documents of docs/corpus-resume-followup. The session's checks are in docs/merge-requests/2026-11-06-feat-002-resume-followup.md." "$tip"
   ```
   `corpus-check` should say "OK — 44 slots, 26 filled, denylist applied (…), 0 problems". **If it fails, or the chain prints nothing,** don't merge, and tell the session: `main` has moved, the branch has a commit the session didn't check, or a phrase needs to come out. If you left `PASTE_THE_TIP` as it is, nothing runs either.
2. **Park off `main` again:** `git switch -C wip-park/11-6-2026`.
3. **The approval, when you're ready** (you held it for this branch): on `main`, `sha256sum apps/web/content/resume.yaml` should print e77c72127e84da60ead201997fa3d77348463a297e350f46f0abfe8b63bd80fb. Then an entry in `assets/policy/content-approvals.json` with `kind: resume`, committed on `main` (contracts/resume-source.md §5). The 44 narration scripts are approved the same way, each by its own hash; this branch changes none of them. Read [corpus/proposals/resume-followup-2026-11-06.md](../../corpus/proposals/resume-followup-2026-11-06.md) first.
4. **Cleanup, after the merge:** first `git worktree remove` for `/tmp/claude-1000/wt-fu`, `/tmp/claude-1000/wt-fu-docs`, `/tmp/claude-1000/wt-fu-wip`, and the rehearsal worktrees `/tmp/claude-1000/wt-rh-fu` and `/tmp/claude-1000/wt-rh-fu-us9`, one at a time (the session can't: the bash gate refuses deletes outside the repository). Then `git branch -d docs/corpus-resume-followup feat/002-resume-followup`, and `git branch -D wip/002-resume-followup`, which was never merged: its content came in as this branch's c7847fe0.

**What skipping the gate gives up, and what stands in.** The gate would check that `main` holds nothing this branch lacks, so the merge writes the tree it checked; step 1's chain stands in, and also checks the tip. It would also run, in a container on the branch's export:
- gitleaks over the range and the tree;
- `make lint` and `make test`;
- `validate-config`, and the content build and check;
- `make evals`' free tiers: the narration and product suites on the fake adapter, and the docs links;
- the red-team suite and the matrix's stage H;
- `corpus-check` with your denylist;
- the image builds, which this branch doesn't touch.

What stands in (Verification):
- **The session's `make check` on this branch's worktree,** which covers gitleaks over the range, `validate-config`, `lint`, `test`, the content check, `make evals`' free tiers, the red-team suite, and the matrix.
- **`gitleaks dir` on a plain export of this branch's tip.**
- **Your `corpus-check` with your denylist,** in step 1, and step 0.

The gate's container also differs from the session's sandbox (no network, a user without a passwd entry, `HOME=/tmp`), and `feat/004-foundation`'s gate failed `test` there only, for a reason not yet found. Nothing here reads the network, the user, or `HOME`: the new test reads the fixture corpus from disk.

## What changed and why

Patch D, your commit, puts your answers of 2026-10-30 into the corpus. This branch carries what they change outside it: the verb in the content check and spec 002, and the two resume items. Agents can't write `corpus/`, so it sits on your commit, in patch A's order.

| Path | Change |
|---|---|
| `apps/web/build/content.ts` | `OWNERSHIP_VERBS` gains "configured", and so does the single-word verb list beside it, as "architected" did (no change in behavior there: `/[a-z]ed$/` already matches it, and the list stays equal to its comment). The comment cites your answer and `01`'s ruling |
| `specs/002-the-room/data-model.md` §2 | The `verb` field's list gains "configured", "the Author's verb for technical software", with your words |
| `specs/002-the-room/plan.md` §2 | A line recording it, beside "architected", in the same commit as the code (`CLAUDE.md`: a departure from the plan updates `plan.md`) |
| `apps/web/test/content/citations.test.ts`, `apps/web/test/fixtures/corpus/01-fixture.md` | A C8 case that declares "configured" and passes with a cited sentence that says it, and fails "ownership verb not cited" without one; and the fixture's sentence it cites, about the fixture's made-up keeper |
| `apps/web/content/resume.yaml` | `agent-orchestrator` declares `verb: configured`; `denver-local-ai` reads "Denver Local AI Solutions (co-owner, Applied AI Engineer): …" and cites `07`'s new line; the header comment names patch D |
| `apps/web/content/resume.lock.json` | Regenerated: the hashes of `00`, `01`, `02`, `03`, and `07`, and nothing else |
| `corpus/proposals/resume-followup-2026-11-06.md`, `docs/merge-requests/2026-11-06-corpus-resume-followup.patch`, `docs/merge-requests/2026-11-06-docs-corpus-resume-followup.md` | From `docs/corpus-resume-followup`, by the merge; the docs note gains its update line here |

Unchanged, and checked: the 44 narration scripts, their 44 eval cases (no "Do not claim" key phrase moved), `config/room-events.yaml` (no item added or removed), and the `powersync-postgres` item, as you said. The Denver Local AI item's text is 21 characters longer, within the 400-character bound.

## Acceptance criteria

- **FR-014:** every item cites a tagged corpus sentence with a sufficient tag; the label cites `07`'s line, tagged `[A 2026-10-30]`. No number outside a slot (C1 to C9 pass).
- **FR-015:** the orchestrator's role carries the verb the corpus rules for it, "configured", now one the check knows and holds (C8), by your answer.
- **FR-016:** the lock is current against your commit of patch D, and every item still has a script on each path (N2).
- **FR-017:** unchanged. The PDF's header comes from `assets/policy/resume-header.json`, which you filled on `main` (df2dcf45).

## Constitution check

Applied with the constitution-check questions against [constitution](../../.specify/memory/constitution.md) 1.0.1.

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local by default | No | Content and the check's word list; no new data flow. |
| II. Production-grade or not shipped | Yes | A RED-first test for the verb; `make check` in this branch's worktree; `gitleaks dir` on its export (Verification). |
| III. Intent before spec, spec before code, humans merge | Yes | The code change comes with its spec change, `data-model.md` §2 and `plan.md` §2, by your answer. The corpus changed only by your commit of patch D. You merge, by hand (the deviation below). |
| IV. Least privilege | No | No permission, hook, or policy file touched. |
| V. Cost is a first-class signal | No | No model calls. |
| VI. Build in public, including failures | Yes | This note lists what skipping the gate gives up, the gate's container-only failure it can't reproduce, and that `main`'s `make test` fails until it merges. |
| VII. Own the whole product, and say exactly what you owned | Yes | "configured" is your ruling, and the item already said it. The label is yours, verbatim. The credits' amount, Medic's on your application, stays off the resume: the PowerSync item "stays as it is". |
| VIII. Honest AI | Yes | Every claim cites the corpus verbatim; numbers only through attested slots. |
| Accessibility (FR-065, WCAG 2.2 AA) | No | No UI change. |

**One deviation, at your choice: this merge skips the gate.** The constitution's Development Workflow, step 5, names what CI requires before a merge, among them "passing tests; the evaluation suite above its thresholds; the red-team suite clean". The gate runs those on the branch's export. Here the session's runs stand in, as "What skipping the gate gives up" lists, and step 1's chain stops the merge if `main` has moved past what they checked or the branch has an unchecked commit. As with patch C, the evaluation suite's behavioral tier reads FAIL on `main`'s recorded run, which this branch doesn't change. Patch D itself reached `main` without a branch; it is the corpus part of this change, and `main`'s red `make test` lasts until this merge.

## Review

One review, by an agent that wrote none of this (the reviewer role), covered this branch's content as `wip/002-resume-followup` (521148fe, its content and the draft of this note) together with `docs/corpus-resume-followup`: no Blocker, four Important, eight Nits. The findings and what was done are in `docs/corpus-resume-followup`'s note, under Review. For this branch:
- **I-3:** the only test run then on record was on an export that lacked the docs branch's files, and failed on `plan.md`'s link to the proposal. The runs below are on this branch's own worktree.
- **Nit 1:** the content commit has its own message, and its diff is the reviewed commit's, byte for byte.
- **Nit 2:** step 1's chain checks the branch's tip against the SHA the session gives you.
- **The single-word verb list:** kept, as above.
- What the review found holding here: C8 for the orchestrator's item and both its scripts; no other display text saying "configured", on `main` or on line R's top branch; no test pinning the verb list; the RED failure as real; and only `data-model.md` and `plan.md` listing the verbs in spec 002, both updated.

The review's fixes changed patch D and the lock, and they weren't reviewed again; the runs below are on the result.

## Verification

- **Your commit.** 054d7c12's seven files match patch D's plain copies byte for byte, and nothing else changed; its parent is df2dcf45, `main`'s tip when patch D was built.
- **The content commit.** c7847fe0's diff against its parent is the reviewed wip commit 5f48a360's diff against its parent, byte for byte.
- **`make -f Makefile check ENGINE_MODE=none-yet`** in this branch's worktree at c7847fe0, with both notes staged: this one before its results, and the docs note's update line. `node_modules` came from `npm ci --ignore-scripts`, and ENGINE_MODE is passed as a make argument, so the image SKIP reads "no agents' engine yet".

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
  - `toolchain-check`: "all 15 match their pins, 1 newer than its floor (claude code)", a WARN inside its PASS: "claude code 2.1.312 is newer than its floor, 2.1.296 (ADR 0023)".
  - `test`: "corpus-check: OK — 44 slots, 26 filled, …", gateway "Tests 810 passed | 12 skipped (822)", web "Tests 1400 passed (1400)", and pytest "3692 passed".
  - `content-check`: "content check: PASS (45 content files: 0 approved by main, 45 drafts, none of whose text is in dist/)".
  - `secrets`: "secrets: PASS (unstaged changes, staged changes, 4 commits since main)".
  - `arrival`: "arrival-check: 0 findings in 24 files (4 commits)".
  - `redteam`: "redteam: 2 passed, 0 failed".
  - `matrix`: "forbidden-actions (hook layer): 795 passed, 0 failed, 51 known gaps" and "REQUIRED matrix-required every listed row ran". Its two skipped rows are the sandbox's: stage S's SMTP row has no host set, and stage E's prove report is for another engine tree.
- **The new test, RED then GREEN,** in the wip worktree, before and after the code change: `npx vitest run test/content/citations.test.ts` first gave "Tests 1 failed | 60 passed (61)", the new case failing with "sections[0].items[0].verb isn't one of the corpus's ownership verbs (built, designed, co-authored, sourced, sponsored, AI system architect, led, was part of a team that, architected)"; then "Tests 61 passed (61)".
- **The content and corpus checks** in this worktree: "content: C1–C9 and N1–N5 passed for the resume and 44 scripts (denylist missing); the lock and the eval cases are current", and "corpus-check: OK — 44 slots, 26 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems".
- **The merge rehearsals,** each in a detached scratch worktree, each ended with `git merge --abort` and a clean tree:
  - **Into `main`'s tip,** 054d7c12, in `/tmp/claude-1000/wt-rh-fu`: `git merge --no-ff --no-commit` of c7847fe0 said "Automatic merge went well; stopped before committing as requested", with no unmerged path and the 10 files above staged. This note's commit adds only documents.
  - **Into line R's top,** `feat/004-us9-neon-sign` at a65763ea, in `/tmp/claude-1000/wt-rh-fu-us9`: the merge stops on 63 conflicted paths. `git merge-tree` finds the same 63 when `main`'s tip merges into us9 without this branch, because us9 still sits on the setup and foundation from before their rebase (it forks from `main` at dc7f0234). None is a file this branch changes, and each of its files comes through as the branch has it. Line R's own stories don't edit `content.ts` or its test: the three commits on us9 that do are foundation's (T066, T074), and their rebased copies are on `main`.
- **`gitleaks dir`** on a plain export of the final tree (this branch's commits with both notes, before any install): "no leaks found". **The docs links,** `evals/docs_links.py` on its own: "docs links: 0 failed, 1514 relative links in 179 files". **Prettier** passes on both notes. **A privacy scan** of every file this branch changes against `main`, and of its commit messages: no surname, no email address but the commits' attribution, and no phone number.

## Cost and data-flow impact

None. No model calls, no new endpoint, and no byte leaves a visitor's device that didn't before. The resume's text changes; what is published still waits for your approval (step 3).

## For the Author

1. **The order:** steps 0 to 4 above.
2. **The proposal's questions,** none blocking: the credits' program and year; PowerSync's place in time; a Golden Q&A for the credits; and whether the Denver Local AI scripts should name your label.
3. **Line R** is mid-rebase onto `main`: the main session's implementer is on US1, and US3 to US9 still sit on the old base. If this branch merges first, line R's rebases take it in; the main session knows that `main`'s `make test` fails until then. If line R merges first, this branch gets `main` merged in and is checked again.
