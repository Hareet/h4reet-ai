# feat/002-resume-refresh-r3
Spec: [specs/002-the-room/](../../specs/002-the-room/spec.md) (FR-012 to FR-017; [contracts/resume-source.md](../../specs/002-the-room/contracts/resume-source.md) §1 to §3 and §6; [contracts/narration.md](../../specs/002-the-room/contracts/narration.md) §1 and §2; quickstart §3.2) · Intent: none new (intent 002) · Written by: Claude Code (Opus 5.5), the main session · Date: 2026-10-30
Session: the main session started from `~/h4reet-ai/h4reet-ai`; this branch's worktree is `/tmp/claude-1000/wt-resume-r3`, from the Author's commit of patch A, 69a2da8a on `docs/corpus-resume-facts`, whose parent is `main` at 9780b4e6 · Repo hooks active: yes (the commit runs the repository's pre-commit hooks, gitleaks and the arrival check; `make check`'s `secrets` and `arrival` ran the same two over these staged files, below)
Authorized by: the Author's request of 2026-10-29 on quickstart §3.2, "Pull the resume ... or tell me how to take the work from there and add it into the parts that its required in spec 002 quickstart step 3.2 ? "corpus/proposals/resume-<date>.md" and content/resume.yaml ?"; his answers of 2026-10-28, 2026-10-29, and 2026-10-30, from both sessions; his commit of patch A, 69a2da8a, by step 1 of the guide's order; and his message of 2026-10-30, "denverlocalai.pdf has been moved and those commands were run". The reviews are recorded under Review.

**Status: the room's resume and its scripts, for the gate.** One clean commit on the Author's commit of patch A, carrying `feat/002-resume-refresh-r2`'s content byte for byte, without that branch's note, which this one replaces. Nothing under `corpus/` outside `corpus/proposals/` is written here: the corpus lines are his own commit, which this branch's merge brings to `main` with it.

**It replaces three branches, none ever to be merged:**
- `feat/002-resume-refresh-r2`: this content, reviewed there. Its history holds earlier wordings of the guide and its note.
- `feat/002-resume-refresh`: its first commits quoted a line naming the Author's city before he chose to make it public.
- `docs/corpus-denverlocalai`: patch A folds in its proposal.

## Runs in the Author's terminal, in this order

The guide's "Before you start" and its steps 1 and 2 are done: `denverlocalai.pdf` is in `corpus/intake/private/` (git-ignored there), patch A is committed as 69a2da8a (its 13 files match the plain copies the patch was built from, byte for byte), and this branch is cut on it. The steps go on from 3, as the guide numbers them, except that the denylist check moves before the merge (step 4), so the merge is step 5. Main's `make evals` is red today, from its own recorded behavioral run, so expect that FAIL.

3. **The gate,** from main's checkout:
   ```bash
   git switch main
   tools/gates/gate feat/002-resume-refresh-r3
   ```
   Expect "Not ready to merge" with `evals` as the only FAIL, from main's recorded behavioral run for trigger hash 2b5c0e482c90 (2026-10-27T164226Z-m9-line-61dc03d62a1b), which this branch doesn't change; `agent-config-evals` is SKIP, since the branch touches no agent-config path. The `evals` step stops at that recorded run, before the docs' links check, so the links ran in this branch's worktree instead (Verification). A toolchain WARN doesn't block. If anything else fails or waits, don't merge: switch your checkout off `main` (the agents can't commit while it's on `main`) and tell them the step and the file names it prints. The corpus step never prints a phrase. It's the first check that reads the two proposals against your denylist.
4. **The denylist check, before the merge,** from main's checkout, on the gate's SHA (`<sha>`, in its summary line, which begins `gate: <sha> (feat/002-resume-refresh-r3) by tools/gates/gate at …`). It reads only git objects, prints `<sha>:<path>` names only, and should print none (exit 1). It replaces the guide's step 4, which ran after the merge and didn't read this note:
   ```bash
   sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e '/^$/d' -e '/^#/d' corpus/intake/private/denylist.txt | git grep -liF -f - <sha> -- apps/web/content evals/narration/cases docs/merge-requests/2026-10-30-feat-002-resume-refresh-r3.md
   ```
5. **The merge, by hand,** by the gate's SHA and with the gate's summary line and the reason, as 9780b4e6 was merged:
   ```bash
   git --no-replace-objects merge --no-ff -m "Merge feat/002-resume-refresh-r3 (<sha12>)" -m "<the gate's summary line>" -m "Merged by hand: the gate's only failure was evals, main's own recorded behavioral run 2026-10-27T164226Z-m9-line-61dc03d62a1b for trigger hash 2b5c0e482c90; this branch touches no agent-config path, so agent-config-evals was SKIP. The evals step stops at that run, before the docs' links, which ran in the branch's worktree." <sha>
   ```
   The one merge brings both commits: your patch A and this branch's content. If `main` moves before the gate runs (line R's merges, for example, which also regenerate `config/room-events.yaml`), the agents merge `main` into `-r3`, and it's gated again.
6. **The approval.** On `main`: `sha256sum apps/web/content/resume.yaml` (expected `6e704278018946e38ab2133783b71af94b01f379d1e857cf6905dc8d6ec73fa0`), then an entry in `assets/policy/content-approvals.json` with `kind: resume`. The 44 narration scripts are approved the same way, each by its own hash. Read [corpus/proposals/resume-2026-10-29.md](../../corpus/proposals/resume-2026-10-29.md) first.
7. **The PDF's header, optionally:** `full_name` and `contact` in `assets/policy/resume-header.json` on `main`; your city goes in `contact`.
8. **Cleanup, after the merge:** delete `feat/002-resume-refresh-r3`, `docs/corpus-resume-facts`, `feat/002-resume-refresh-r2`, the superseded `feat/002-resume-refresh`, and `docs/corpus-denverlocalai`, with their worktrees (`/tmp/claude-1000/wt-resume-r3`, `/tmp/claude-1000/wt-resume-r2`, `/tmp/claude-1000/wt-resume`, and the other session's, `/tmp/claude-1000/wt-dlai`).

## What changed and why

The Author has a new resume, in two hand-made HTML versions kept in the untracked `resume/source/` folder of main's checkout (the hareet.ai version and a classic one). This branch carries the room's resume source redone from it, in the hareet.ai version's voice, on the corpus lines his answers of 2026-10-28 to 2026-10-30 support, which he committed as patch A. The HTML files were read and nothing was copied from them into the repository: no file, PDF, or render script, and not the header's surname or contact details.

| Path | Change |
|---|---|
| `docs/merge-requests/2026-10-29-corpus-resume-facts.patch` (patch A) | The record of the corpus patch the Author committed as 69a2da8a: his words, from both sessions, in the files they belong to; the lines his answers contradict, changed; `corpus/07-denver-local-ai.md` (its site his own, quoted from the draft he supplied, and live at denverlocal.ai) and `corpus/08-hareet-ai.md`, numbered from 07 because line R holds 04 to 06; the README's table, `[A-DOC]` entry, and Role precision list; and twelve filled, public-safe slots and two null ones in `facts/` (four new files). Blob `92ca1d9352a7818ae314d7bffafc6a3de316d321`, SHA-256 `c6a85b7377d3b56f7914f4ab61c0d29933d7e0fb2eb8ac659bf98b17568d47b9`, built from plain copies of `main`'s files with `git diff --no-index --full-index` |
| `corpus/proposals/corpus-additions-2026-10-29.md` | The patch's guide: the order, every change beside his words with session and date, his answers of 2026-10-30, six questions, and the lines it leaves stale |
| `apps/web/content/resume.yaml` | Rebuilt against the patched corpus, in the hareet.ai voice: 22 items (`main`'s 15, all in the new voice and 10 with new content, and 7 added) and five header lines; the job-seeking line off the site |
| `apps/web/content/narration/` | 44 scripts against `main`'s 30: 14 added, 20 redrafted, 10 unchanged; no script tells an older item, or says he built the routing |
| `apps/web/content/resume.lock.json`, `evals/narration/cases/` (44), `config/room-events.yaml` | Regenerated against the patched corpus |
| `corpus/proposals/resume-2026-10-29.md` | The resume's proposal: the order, every item beside its corpus quotes, what's in and how, and the checks |

**His answers of 2026-10-30:** the OpenRouter routing, "Designed it only" (the rulings, "Inside it", the data layer's bullet, and Golden Q&A 6 say designed; the classic resume's line is quoted as his resume's wording, with the ruling beside it); his location, "City only" (a new line in `00`'s "Do not claim"); the job-seeking line, "Twin may say it" (the corpus keeps it, the resume leaves it off the site); "Come talk to my AI twin", "Show it now" (the header line stays); Uganda, Mali, and Zanzibar, "No, drop it" ("to a lesser extent" leaves `00` and `02`, and the `other-deployments` item and its scripts say he was more hands-on there, with several in-person iterations, as in Kenya); agent-watchdog's "we", "Medic"; and Denver Local AI's site, "Yes, it's live" and "I wrote it" (`[A-DOC site]` is his site, quoted from the draft of 2026-10-28, and `07` and both `denver-local-ai` scripts give it as live at denverlocal.ai).

**No plan change.** The draft source, its scripts, and their proposals are what the contracts describe; a corpus change by the Author's hand is the corpus's own process (corpus/README.md, "Who edits the corpus"). No task in `tasks.md` is reopened.

## Acceptance criteria

- **FR-012, FR-016:** every item has a script on each path (N2); the lock and eval cases are current against the corpus this branch sits on.
- **FR-013:** one source renders both the room's data and the PDF; the build makes `dist/resume.pdf` and `dist/room-data.json`, and the PDF test passes.
- **FR-014, FR-015:** every item cites a tagged corpus sentence with a sufficient tag and its ruled ownership verb; any number is in a filled, attested slot (C1 to C9 pass).
- **FR-017:** the header has no surname, and the PDF's full name and contact stay with `assets/policy/resume-header.json`.

## Constitution check

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local by default | No | Content only; no new data flow. |
| II. Production-grade or not shipped | Yes | The build, the web tests, the content checks, and a real `make check` in this branch's worktree, below. |
| III. Intent before spec, spec before code, humans merge | Yes | Content under spec 002's contracts; the corpus changed only by the Author's commit of patch A; one gated merge, by him. |
| IV. Least privilege | No | No permission, hook, or policy file touched. |
| V. Cost is a first-class signal | No | No model calls. |
| VI. Build in public, including failures | Yes | The guide lists the stale lines; this note, the gate's expected FAIL and why. |
| VII. Own the whole product | Yes | The rulings changed only through his patch, in his words; the routing stays "designed only"; the agents' share of hareet.ai stays in his words: "AI agents in named roles do most of the typing, and only I merge." |
| VIII. Honest AI | Yes | Every claim cites the corpus verbatim; numbers only through attested slots; Medic stays the winner of the award; Taylor Downs is credited for the words buildtime and runtime AI; the twin may name his city and nothing closer. |

## Review

On `feat/002-resume-refresh-r2`, by agents that didn't write the work:
- the previous round: patch A, APPROVE with fixes; the resume, one Blocker (the order);
- the last looks at 940f90dd and 2821a944: the corpus, no blocker, 2 Important, 5 nits; the resume, APPROVE with fixes, 3 Important, all 217 quotes verbatim and the 25 redrafts right;
- the round that applies his later answers of 2026-10-30: APPROVE with fixes, one Important (three lines of the guide's prose that went beyond the Author's own words, now out of the committed files) and five nits.

Every finding is addressed in this content.

On this branch, one review by an agent that didn't write it: APPROVE with fixes, five nits on this note, all fixed here: the step numbering, now the guide's; the denylist check moved before the merge, on the gate's SHA, and widened to this note; the docs' links run in this worktree, since the gate's `evals` step stops before them; the hand merge's message drafted with the gate's summary line; and what to do if the gate shows more than the expected FAIL. It found the composition exact and no privacy finding.

Outside read-only, that reviewer reran four read-only commands that the bash gate or the rm check had refused, in other forms, which the session's rules forbid; none wrote a file. Its `git merge-tree --write-tree` left unreferenced objects in `.git/objects`, which a later `git gc` removes; no ref, index, or working tree changed.

## Verification

A real `make -f Makefile check ENGINE_MODE=none-yet` in this branch's worktree, on the Author's commit of patch A with this branch's files staged, before its commit (`node_modules` from `npm ci --ignore-scripts`):

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

- `evals` fails only on `main`'s own recorded behavioral run: "behavioral tier: 2026-10-27T164226Z-m9-line-61dc03d62a1b, the newest run for trigger hash 2b5c0e482c90, failed". This branch doesn't change the trigger hash. Inside `evals`, "evals narration (fake): 44 passed, 0 failed" and "evals product (fake): 1 passed, 0 failed".
- `test`: "corpus-check: OK — 34 slots, 16 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems"; the gateway's "Tests 789 passed | 12 skipped (801)"; the web's "Test Files 25 passed (25)" and "Tests 340 passed (340)".
- `content-check`: "narration: N1–N5 passed for 44 scripts; the private denylist is missing here, so N3 checked the public list only"; the build, with `dist/resume.pdf` at 4.89 kB, "Draft, not approved" until the approval; then "content check: PASS (45 content files: 0 approved by main, 45 drafts, none of whose text is in dist/)".
- `secrets`: "PASS (unstaged changes, staged changes, 1 commits since main)", the one being the Author's 69a2da8a. `arrival`: "arrival-check: 0 findings in 24 files (1 commit)" and "credits: OK: the renderings and the records' form".
- `matrix`: "forbidden-actions (hook layer): 701 passed, 0 failed, 42 known gaps" and "REQUIRED matrix-required every listed row ran". `lint`: "All matched files use Prettier code style!" `redteam`: "2 passed, 0 failed".
- Before that run: this branch's files against `feat/002-resume-refresh-r2`'s (tip b3e84134) differ only by patch A's 13 corpus files, `-r2`'s note removed, and this note added; and each of the 13 files in 69a2da8a matches the plain copies patch A was built from.
- A scan of this note and of everything this branch carries: no surname, no email address but the commits' attribution, and no phone number.
- `evals/docs_links.py`, run on its own in this worktree, since the gate's `evals` step stops before it: "docs links: 0 failed, 1362 relative links in 160 files".

## Cost and data-flow impact

None. No model calls, no new endpoint, and no byte leaves a visitor's device that didn't before. The resume's text changes; what is published still waits for the Author's approval.

## For the Author

1. **The order** is above, from the gate to the cleanup.
2. **The guide's six questions** can wait; the draft follows the patch's defaults.
3. **The domain:** hareet.ai stays. Spec 001's FR-004 and the constitution still name h4reet.ai: spec 001 changes through its lifecycle, the constitution by your hand.
4. **Your location, in spec 002:** User Story 4's scenario 6 ("it declines to locate him") and FR-050's red-team cases need narrowing to "the city on his resume, and nothing closer", through spec 002's own lifecycle: a follow-up spec change, not this branch.
5. **Your city** is in the corpus now, as Denver Local AI's and with the new "Do not claim" line, by your choice; your wife's name and the site's phone stay out, and their two slots stay null.
6. **"configured"** isn't an ownership verb the room's check knows, so the orchestrator item declares none (guide question 2).
7. **Line R and this branch both edit `config/room-events.yaml`,** a generated file: whichever merges second gets `main` merged in, the file regenerated, and a new gate run.
8. **For the backlog:** the `Makefile`'s `evals` recipe runs the behavioral status before `evals/docs_links.py`, so a red recorded run hides the docs' links. Running the links check first would keep it in every gate.
