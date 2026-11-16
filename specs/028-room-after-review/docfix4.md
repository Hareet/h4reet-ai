# docfix4-028: Q42's patch order (rv-patch7-026's P7-2), and P8 and P9 done on `main` `a556a933`

Task `docfix4-028` (spec-writer, Opus 5.5, documents only), night 2026-11-15. Branch: `night/docfix4-028/docfix4-028`. I wrote none of what I fix.

No code, no test, no `corpus/**`, no `assets/**`, and no human-only path changed. Nothing pushed or merged. `docs/merge-requests/2026-11-15-corpus-dog-intro-r4.patch` and `human-patches/026.md`'s r4 section are not added here: they reach the line with `merge-028-7`, as the brief says.

## Before starting

```text
$ git log -1 --format='%H %s'
8ffd20e2878713049501901ae379db6a1a504434 docs(028): the image stage's cause, the container's unexpanded DOCKER_CONFIG tilde; the refusal's time
```

Not `e34ef9d6`, so the task went on (no "Result: held").

The inputs, read rather than retold:

- The page: `git show refs/heads/night/supervisor/2026-11-15:docs/night-shift/2026-11-15.md`: patch7-026's row (P7-2, P7-5), Q42, Q1, Q2, and "What waits for his hand from item 2".
- r4, on `patch7-026`'s branch: `git show refs/heads/night/patch7-026/patch7-026:docs/merge-requests/2026-11-15-corpus-dog-intro-r4.patch | sha256sum` prints `7c06cf196f7d7a7eed18e4e297b49d6638c157970081dcfd273639b0f4b36214`, the brief's hash. Its `human-patches/026.md` row for 028's P1: "0 | 1 file, no offset, fuzz, or reject. The final check is the naming task's".
- `main`, from `git log refs/heads/main`:

  ```text
  a556a933 P:b4b474f1 4f6eb883 Merge intake/dino-resume (4f6eb88397cf)
  4f6eb883 P:cc1f8fcc content(023): film links
  cc1f8fcc P:60fe462e b4b474f1 Merge branch 'refs/heads/main' into intake/dino-resume
  b4b474f1 P:a36f98ec policy(023): approve the resume, C-0005
  60fe462e P:a36f98ec assets: the dinosaur, round 2
  ```

  `a556a933`'s body: "gate: 4f6eb88397cf35a1c1743b7c172d92ac900569fe (intake/dino-resume) by tools/gates/gate at b4b474f14630: 19 PASS, 3 SKIP, 2 WARN, 0 PLANNED, 0 PENDING, 3 FAIL; failing: test FAIL, studio-settings FAIL, image FAIL". Its date: 2026-11-15 17:20:49 -0700. On `main`, `apps/web/content/resume-author.pdf` is 245,437 bytes, SHA-256 `5de0e7eeaed34587d4d79e29f0cbfb7c577a224ce31616f1d75fcbe4e0ff21fb`, and `apps/web/content/candidates/resume-author-links.pdf` is not in the tree.
- `git merge-tree --write-tree --name-only HEAD refs/heads/main` (at `8ffd20e2` against `a556a933`): `a60ef06d2bb87f2ce637c475aa8c1eb3f7b8623b`, exit 0, no conflict. Read-only; used for the stack's note's "main is now" line.

## Finding by finding

### rv-patch7-026's P7-2: the order of the three corpus patches

In the page's words: "the order of the three corpus patches is still 022 → 026 → 028 in `docs/merge-requests/human-patches/028.md:14` and `:35`, spec 028's FR-033 (`spec.md:256`), and `plan.md:240`, against Q42's "022 → merge the 028 stack → 026 r4 → 028's P1"". On this base, T-INT had already put Q42's order first in `028.md` and added a departure to plan §7. What was still missing: the "provisional on the page's Q42" mark, r4's file and SHA-256, the check on the stack's tip + 022 + r4, FR-033 itself, the first sentence of plan §7, and the Assumptions line.

- `docs/merge-requests/human-patches/028.md`:
  - "The order, now": now "provisional on the page's Q42". It names 022's file and SHA-256, and r4 as `docs/merge-requests/2026-11-15-corpus-dog-intro-r4.patch`, SHA-256 `7c06cf19…b36214`. It says that r2 and r3 are kept for the record and not applied, and that the check after r4 is on the stack's tip + 022 + r4, on a tip that contains `a556a933` (the page's P7-5, `merge-028-7`'s). It quotes patch7-026's dry-run on its own tip + 022 + r4.
  - "The order, as first written": marked "superseded by Q42's above and kept for the record".
  - "His steps": in Q42's order, provisional, with r4's file and SHA-256. The first-written words are kept, marked superseded.
- `spec.md` FR-033: the check is now on plain main, main + 022, and the stack's tip + 022 + r4 (file and SHA-256). The order is "022 → merge the 028 stack → 026 r4 → 028's P1, provisional on the page's Q42". The first-written words are quoted at the clause's end.
- `spec.md` Assumptions:
  - The held-026 line gains "since Q42, after 022, the stack's merge, and 026 r4".
  - New line: **"Deviation named: the page's Q42"**. It gives the order with r4's file and SHA-256, against Q20 and FR-033 as first written. It also gives r4's build on main + 022 + the stack's tip, which Q42 names as departing from his rule 2's "built from plain copies of `refs/heads/main`" (Q42's quotation). Q42's reason is quoted.
- `plan.md` §7:
  - The order bullet's first sentence is now Q42's order, provisional, with 022's and r4's files and SHA-256s and the check on the stack's tip + 022 + r4. The first-written sentence is quoted after it.
  - T-INT's check sentence gains "(as first written; since Q42 …)".
  - The "hold patch 026" bullet's "only then check 028's patch on main + 022 + the reworked 026" gains "(since Q42, provisional: on the stack's tip + 022 + r4, the bullet above)". T-INT's departure paragraph is unchanged.

The stack's note already gave Q42's order (its table, "the page's Q42, recommended, taken provisionally"). Its row 3's file and SHA-256 cells still read "`human-patches/026.md` names it" and "(r4's, filled in by the naming task)". I left them to the naming task, which the note names for them.

### Main moved: P9 and P8 done on `main` `a556a933`

Each place where the four documents said that his intake (P9) or the resume's publication (P8) still waits for him now records it as done. Each quotes his commit subjects and his merge's gate line byte for byte. A `grep -F` of the gate line finds it once in each of the four files, and `git log` matches each of the four subjects exactly. Where a record said what `main` held at `b4b474f1`, it stays, marked with that commit. Nothing says what the model turns on in the room or why the gate's three checks failed: each place names `probe-dino-028` for that (the page). His words stay where they were quoted.

- `spec.md`:
  - Readings: a new bullet, "Since, on `main`", gives the four commits, the gate line, and the served file's hash.
  - Q11 and Q19 each gain one sentence pointing to it. Q19 says the four clicks stay his (Q24).
  - Assumptions: "It arrived" (P9) and "He published it" (P8).
- `plan.md` §7: the P8/P9 bullet gains "Since, both done by his hand on `main`", with the commits, the gate line, and the four clicks still his.
- `human-patches/028.md`:
  - P2: T-INT's "isn't on `main`" is marked "(at `b4b474f1`; since done, the next paragraph)".
  - P2 gains a new paragraph, "Done by his hand, on `main` at `a556a933`". Steps 1 and 2 are done; step 3, the clicks, is still his.
  - "Not patches, his alone": P9 is done (`60fe462e`), and whether the room shows it is `probe-dino-028`'s to find.
- The stack's note, "For the repo agent and the Author":
  - "main is now `a556a933`", with the merge-tree check above.
  - "What ships as a stand-in": the dinosaur's cut-out on this branch's tree, the intake reaching the stack with `merge-028-7`.
  - "What waits for him (item 2)": both steps done, with the commits and the gate line. P8 and P9 are each marked done. T-INT's first words for P8 are kept as a quotation. The clicks are still his.

Not changed, as records of what was true when written: `tasks.md`, `analysis.md`, `notes.md`, `impl-b.md`, the line's note, the stack's note outside "For the repo agent and the Author" (T-INT's step 4 and its Runs at `b4b474f1`), and `human-patches/023.md`.

## Runs

On this branch, after every edit above (at `wip(docfix4-028): docfix4.md, finding by finding; runs pending`):

```text
$ python3 -I -m pytest -q -p no:cacheprovider evals/test_repository_docs.py evals/test_docs_links.py
61 passed in 1.77s
exit=0
$ python3 -I evals/docs_links.py
PASS  the ADR index links every ADR file: 52 of 52
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 2527 relative links in 478 files
exit=0
$ make lint          # first try, before node_modules existed
node_modules is missing: run make setup
make: *** [Makefile:227: lint] Error 1
exit=2
$ npm ci --ignore-scripts
exit=0
$ make lint
All matched files use Prettier code style!
ruff check .
All checks passed!
865 files already formatted
(eslint --max-warnings 0, tsc for the three workspaces, and shellcheck, each silent)
exit=0
```

This file's own edit after these runs (this section) is text in a Markdown file. The final commit's hooks ran on it.

## Refusals

None: no hook or bash-gate refusal and no permission prompt.

A slip, recorded: my first command wrote a copy of the page to `/tmp/docfix4-028-page.md`, outside the worktree, to read it with `grep` and `sed`. It holds only the page's text and nothing secret. The same goes for two logs I kept there, `/tmp/docfix4-028-npmci.log` and `/tmp/docfix4-028-lint.log` (`npm ci`'s and `make lint`'s output). All three are left in place, since nothing in `/tmp` is deleted.

## Questions

None. P7-2's fix follows Q42's recommendation, already taken provisionally on the page.

## What's left

- The stack's note's table row 3, r4's file and SHA-256: the naming task's.
- The check of 028's P1 on the stack's tip + 022 + r4, on a tip that contains `a556a933`: `merge-028-7`'s (P7-5).
- What the model turns on, and the gate's three failures: `probe-dino-028`'s.
