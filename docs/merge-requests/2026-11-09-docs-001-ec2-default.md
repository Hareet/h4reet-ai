# docs/001-ec2-default
Spec: specs/001-cloud-elevation/ (its intent: specs/001-cloud-elevation/intent.md; the reworked spec is on `spec/001-cloud-elevation`, which ADR 0044 cites at 8acc2686, and at d3c7ee02 for its plan's question 8) · Written by: docs role, a Claude session drafting from the main session's brief; this revision (main's merges, decision 13, the checks, your steps) by a Claude subagent (Claude Opus 5.5) for the main session · Date: 2026-11-09, revised 2026-11-10
Session: the main session started from `/home/h4reet/h4reet-ai/h4reet-ai`; this branch's worktree is `/tmp/claude-1000/wt-adr001`, cut from main at ada55c98 · Repo hooks active: yes (`.claude/audit/hooks.log`: 194 entries for this worktree as of 2026-11-10T07:18Z, all ALLOW but the one under Status)
Authorized by: the Author's direction of 2026-11-09, quoted in ADR 0044: his four workflow quotes; his answers on Principle I, the version, EC2's spend, relay selection, the tunnel's end, and the two added wording changes; his approval of five points on the workflow; and his approval of 2026-11-10, "Let's approve the t000 and spec 001 plan.", under which ADR 0044's decision 13 takes spec 001's plan question 8 as its option A, as the session's reading, at the main session's direction.

## Status: ready for its gate on this commit, main d0fac811 merged in; reviewed through 3f7e7c64, every finding answered; decision 13 (e366345b) came after the review; not merged

| Commit | What |
|---|---|
| 7843cc67 | ADR 0043 (now 0044), ADR 0001's status line, the index, `lifecycle.md`, `README.md`, the patch, this note |
| 4fe34783 | the first review's findings I1 to I8 and its nits; your answers on Principle I, the version, and EC2's spend; renumbered 0044 |
| b50ba582 | your plan answers: relay selection, the tunnel's end on spot, the amendment's two added wording changes |
| 3f7e7c64 | ADR 0044's references follow spec 001 at 8acc2686. The content the review read |
| dcc4dec1 | the merge of main at 787d85af, no conflicts |
| 8d1d1764 | the merge of main at d0fac811, no conflicts |
| e366345b | ADR 0044's decision 13, and the patch's Cloud line: the relay "on spot capacity where the Author accepts the gap (ADR 0044)", plan question 8's option A under your approval of 2026-11-10. The content the guard anchors on |
| this commit | this note: ready for its gate, with the checks and the guard on e366345b |

Main was merged in twice, with `git --no-replace-objects merge --no-edit refs/heads/main`, and neither merge conflicted:

- dcc4dec1: main at 787d85af, with the avatars, the timing fix, the image fix, and the Anthropic switch.
- 8d1d1764: main at d0fac811, "twin: three topics ready, local and anthropic". Your commit is dated 06:39:40Z, as this session's first `make test` began on dcc4dec1. The sandbox doesn't show that run's process, so it couldn't be stopped. It finished with exit 0 (its totals are under Verification), and the checks then ran again on the newer tree.

**`docs/how-we-build/lifecycle.md` didn't conflict.** Main never edited it. The switch's note only listed its line 54 as stale (its review's nit 4, and its Backlog), because this branch rewrites that line. The merged line is this branch's wording, unchanged from 3f7e7c64. One part of it is now stale: see Backlog.

**Decision 13 came after the review.** On 2026-11-10 the main session relayed your approval, "Let's approve the t000 and spec 001 plan.", and directed that spec 001's plan question 8 be taken under it as its recommended option A, in the still-unapplied 1.1.0 amendment. e366345b does that in two files: ADR 0044 gains decision 13, which quotes the question's two options and your words and calls option A the session's reading, and its Consequences show the Cloud line old → new; the patch's Cloud line keeps the relay on the always-on list "on spot capacity where the Author accepts the gap (ADR 0044)". No reviewer has read e366345b; `git diff 8d1d1764 e366345b` shows all of it, 8 lines added and 3 removed. If you want it reviewed before your gate, tell the session.

Against main, the branch still changes only its seven files: the four documents, ADR 0001's status line, the patch, and this note. Main's three old gate failures (Prettier on four history files, the room's chunk and dist tests, the D43 timing test) are gone on the merged tip: `fix/007-steady-clock-test` and its stack are on main (Verification).

**The bash gate refused one command, and nothing ran.** This worktree's one entry in the hook log that wasn't ALLOW:

```text
2026-11-10T06:41:43Z	bash	BLOCK	changing main (HEAD is main) :: cd /tmp/claude-1000/wt-adr001 && sha=$(git rev-parse HEAD); mr=refs/heads/main; rv=3f7e7c6454e936e5cdf078e78ac9fd0aefdcaa74; git merge-base --is-ancestor "$
```

- It was a read-only check: two ancestry tests, a merge-tree, and a diff. It came while your checkout was on `main` for d0fac811. Other sessions' commands were refused the same way from 06:40:07Z to 06:41:28Z.
- It wasn't respelled. What it would have shown came from reads that weren't in it: the merge's parents, main's tip, and a tree diff, which found d0fac811. Once your checkout was parked again, the same command ran as written, unchanged: both ancestry tests returned 0, the merge-tree printed 7b09dd61, and nothing differed outside the notes.

## What changed and why

Documents only: no code, no configuration, no test. The Author decided where prod runs. This branch records that decision as ADR 0044 and gives the constitution change as a patch for his hand.

| File | Change |
|---|---|
| `docs/adr/0044-ec2-as-prods-default-host.md` | new, Status proposed. Renumbered from 0043, which `feat/005-full-window-room` already holds. Its spec numbers follow the reworked spec at 8acc2686, and a mapping from the 2026-09-07 outline sits under Consequences. Decision 13 (2026-11-10): the relay on spot capacity in the Cloud standard. |
| `docs/adr/0001-local-first-routing-with-capped-bedrock-fallback.md` | its Status line only: "Amended by ADR 0044 (2026-11-09)" |
| `docs/adr/README.md` | 0044's row; 0001's row notes the amendment |
| `docs/merge-requests/2026-11-09-constitution-1.1.0.patch` | the amendment, for the Author's hand. First built from a proposed copy, `docs/merge-requests/constitution-proposed.md.txt`, which isn't in the tree; rebuilt for decision 13 with `diff -u` from plain copies of main's file in `$TMPDIR`. Principle V's reason; the Cloud standard, with the relay on spot capacity (decision 13); the Local tier and Model access standards; Observability's Langfuse clause; the version line 1.0.1 → 1.1.0 |
| `docs/how-we-build/lifecycle.md` | one sentence on the default host, "by the amendment of ADR 0044", true before and after the Author's commit |
| `README.md` | one sentence in "The engineering", with the same wording |

What the Author decided, in short: EC2 is the default production host, with the Anthropic API answering first and Bedrock second, and it runs without the local model server. The laptop serves when he runs it. One host serves at a time. The relay at the tunnel's end picks the host, so Route 53 no longer moves DNS between hosts. The tunnel's end is a spot instance, and the amendment's Cloud standard says so of the relay (decision 13, the session's reading of his 2026-11-10 approval). The model ceilings are $5 a day and $20 a month. The server has its own budget, and its figure is not set. The five workflow points, with his reply, are in ADR 0044's Decision, verbatim.

## Acceptance criteria

none: process change. This branch records decisions for spec 001's rework. It satisfies no FR or SC. Its own checks are these:

- ADR 0044 quotes the Author's words, and his answers, verbatim. Every number in it is in the repository or in his words, or is labelled as the session's estimate or as an option's own October figure.
- ADR 0044 is numbered 0044 everywhere: the file, the index row, ADR 0001's status line, the constitution copy, and this note.
- ADR 0044's spec numbers match the reworked spec at 8acc2686. Where a number changed from the 2026-09-07 outline, the mapping under Consequences says so.
- ADR 0001 changes its Status line only.
- The patch applies cleanly to main's `.specify/memory/constitution.md` (dry run, below). No agent edits the constitution.
- Every change to the constitution is shown as old → new in ADR 0044's Consequences, and the patch matches that list. Checked again on e366345b: each line the patch adds contains a "new:" text from the list, and the Cloud line's whole new text appears in both.

## Constitution check

| Principle or rule | Touched? | How this branch complies |
|---|---|---|
| I. Data-Local by Default | the EC2-first order is a question for "The system MUST prefer on-device or self-hosted inference where it meets the quality bar." | Principle I stays as written. The Author's answer, "Record the reason (Recommended)", is recorded in ADR 0044: EC2 has no GPU within the server budget, a CPU model run there would not meet the twin's quality bar, and the laptop's GPU model does, so the API meets the bar on EC2 and the laptop stays self-hosted-first. On the laptop, "a production tier, not a demo" applies: when the laptop serves, it serves production. |
| III. Intent Before Spec, Humans Merge | yes | The constitution changes only by the Author's hand, so it ships as a patch. No agent edits it. |
| IV. Least Privilege | yes | "no inbound connections" holds, since the laptop dials out. The IAM for the Lambda and the start function is a human act and stays open (ADR 0044, open item 6). |
| V. Cost Is a First-Class Signal | yes, its reason changes | The meter and the kill switch are the enforcement point, unchanged. The reason for the local tier changes from "the cloud bill" to "the model spend". The model ceilings count model calls only, and the server's budget is separate. |
| Governance, version | yes | The Author's answer is 1.1.0, MINOR: "Principle V's rules stay (the meter, the kill switch, degrading). Only its reason changes. This follows general semantic versioning rather than the rule's text." The rule says "MAJOR for removing or redefining a principle". The reviewer read the changed Principle V sentence as a redefinition, and so as MAJOR. The Author chose 1.1.0, so the patch keeps 1.1.0. Decision 13 qualifies a Technology Standards list, not a principle, and the patch stays 1.1.0. |
| Technology Standards: Cloud, Local tier, Model access, Observability | yes | Amended by the patch, as ADR 0044 lists old → new. Cloud takes Bedrock off the always-on list: Bedrock is called from the serving host. Cloud keeps the relay on that list "on spot capacity where the Author accepts the gap (ADR 0044)" (decision 13), so the relay on the spot tunnel's end is no deviation once the patch is applied; until then, 1.0.1 is in force. Observability places Langfuse in the stack on whichever host serves. |

CLAUDE.md line 24 also describes routing, and it is the Author's hand. See "For the Author" below.

## Review

A reviewer that didn't write these documents read the branch. Its first review returned "not ready", and 4fe34783 answers its findings I1 to I8 and its nits (that commit's message lists them). Your answers after it (relay selection, the tunnel's end, the two wording changes) came in b50ba582, and 3f7e7c64 moved ADR 0044's references to spec 001 at 8acc2686. The main session reports that the reviewer read the branch through 3f7e7c64 and that every finding is answered.

e366345b, decision 13, came after that, at the main session's direction (Status), and no reviewer has read it. The guard (step 2) anchors on e366345b: since then only this note changed, and the guard checks that nothing else did.

## Backlog

- **`docs/how-we-build/lifecycle.md` line 54's first sentence is stale.** It still says "local models on the RTX 5090 first, Bedrock as capped fallback". Since 787d85af, prod's route names the Anthropic API as its fallback (`config/routing.yaml`, `envs.prod`). The switch's note proposed "the paid fallback prod's route names" there. Not edited here: the line is reviewed content, outside what decision 13 changed. This branch's sentence after it, on EC2, isn't affected. A one-line follow-up after this merges.
- **`README.md` line 12** says "a capped cloud fallback that is built and switched on once the Author sets up Bedrock (tasks.md T105)". That sentence is main's, not this branch's; it has the same staleness, for the same follow-up.
- **`spec/001-cloud-elevation` has moved on from 8acc2686.** It is at d3c7ee02 now, after its analyze pass. Its FR, SC, and user-story numbers are the same as at 8acc2686, in the same order, so ADR 0044's references by number still point at the same items. This session read FR-054 and FR-063 to FR-065 at both commits; their relay wording holds, and FR-065's exception now reads "the autostart switch `off`" where it read "paused it". The other cited items weren't compared one by one. ADR 0044 keeps citing 8acc2686, and d3c7ee02 for question 8.
- **The patch's date.** Its version line, and ADR 0044's list, say "**Last Amended**: 2026-11-09". Decision 13 is of 2026-11-10, and you apply the patch later still. If the line should carry the day you apply it, the patch and ADR 0044's Consequences change together, before step 4.

## Verification

### What ran, and on which tree

- On 8d1d1764 (main d0fac811 merged in), before decision 13: `make lint`, `make test`, the guard's comparison, and the dry run of the patch as it was then.
- On e366345b, after decision 13: what that commit touches (the dry run of the new patch, Prettier on the docs, `evals/docs_links.py`, `make lint`), and the runs that hadn't happened yet: `make evals` and `make check ENGINE_MODE=none-yet`, whose test stage reruns `make test` in full. The main session's message took `make check` as already run; it hadn't been, so it ran here, after decision 13, on the final content.
- On this commit's tree, before the commit (`git write-tree` with this note staged): gitleaks on a fresh export, and the guard's comparison.

Every run ran alone, since you were running paid live runs on prod. For the second item, this note's text is the only difference from this commit, since the note was finished after those runs; for the first, decision 13's two files differ too.

### The patch's dry run, on e366345b

Against `refs/heads/main`'s `.specify/memory/constitution.md`, on a fresh plain copy in `$TMPDIR`, not in a worktree. The copy came from `git --no-replace-objects show`. The patch is e366345b's, which main doesn't have yet; it is byte for byte the file the dry run read (`cmp`). Main hasn't changed the constitution since ada55c98: `git diff ada55c98 refs/heads/main` shows nothing for it.

```text
main: d0fac811ca297a6d9ead42022043d8a12fb4418e
constitution blob: b304d8397da1b06a6cae7ac1b258e3f801550833
$ patch -p1 --dry-run < constitution.patch
checking file .specify/memory/constitution.md
exit=0
```

How the patch was built, all in `$TMPDIR`: main's file from `git show refs/heads/main:.specify/memory/constitution.md`; the old patch applied to a copy with `patch -p1`; the copy's Cloud line edited; then `diff -u --label a/.specify/memory/constitution.md --label b/.specify/memory/constitution.md`. No `git apply`, and nothing written into any worktree's `.specify/`. The new patch differs from the old in the Cloud line alone. Applied to the fresh copy, it left no `.orig` file and gave the edited copy exactly; the version line reads `**Version**: 1.1.0 | **Ratified**: 2026-09-07 | **Last Amended**: 2026-11-09`. Before decision 13, the old patch dry-ran the same way on 8d1d1764, with the same one `checking file` line.

### Prettier on the docs, on e366345b

```text
$ prettier --check (the three changed docs)
Checking formatting...
All matched files use Prettier code style!
exit=0
```

That pass checks nothing in them: `.prettierignore` lists `docs/`, among "the human-authored and protected documentation", and `prettier --file-info` reads `{"ignored":true,"inferredParser":null}` for ADR 0044 and this note. `make lint`'s `prettier --check .` (below) is the repository's Prettier check.

### evals/docs_links.py, on e366345b

```text
PASS  README.md links the ADR index (docs/adr/)
PASS  the ADR index links every ADR file: 31 of 31
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 1848 relative links in 265 files
exit=0
```

### make lint, on e366345b: exit 0

```text
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
464 files already formatted
… | xargs -0 -t shellcheck -- …
shellcheck -- …
exit=0
```

On 8d1d1764 it printed the same, also exit 0.

### make evals, on e366345b: exit 0

Its summary lines. The other 272 lines are the commands make echoed, a `PASS` line for each case, the topics' golden-case counts, and two lines on the behavioral tier; none of them reports a failure.

```text
evals product (fake): 187 passed, 0 failed
INFO (twin readiness): hobbies-and-travel: ready, its evidence at the running hashes
INFO (twin readiness): mission: ready, its evidence at the running hashes
INFO (twin readiness): work-projects: ready, its evidence at the running hashes
evals narration (fake): 44 passed, 0 failed
PASS  FR-007: 28 of 28 variables denied by name
agent-config static: 0 failed, 0 planned
WARN (behavioral tier): 2026-11-09T152345Z-feat-011-pa-anthropic-denies-09522968ea48, the newest run for trigger hash 05cec03a74a5, failed: conduct regressed against main's last entry 2026-11-08T151546Z-feat-007-p1-69ab1428d23d: held in 10 of 12 runs, against 11 of 12, over pastes-check-output, refuses-to-widen-allowlist, reviewer-reads-room-data, stays-on-branch
agent-config behavioral: fail, 0 planned
PASS  every relative link resolves: 1848 links in 265 files
docs links: 0 failed, 1848 relative links in 265 files
exit=0
```

The WARN line is the behavioral tier's, information only (spec 006 FR-002). It names a run for the current trigger hash, which this branch doesn't change.

### make check ENGINE_MODE=none-yet, on e366345b

Its summary, whole:

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
WARN     evals  WARN (behavioral tier): 2026-11-09T152345Z-feat-011-pa-anthropic-denies-09522968ea48, the newest run for trigger hash 05cec03a74a5, failed: conduct regressed against main's last entry 2026-11-08T151546Z-feat-007-p1-69ab1428d23d: held in 10 of 12 runs, against 11 of 12, over pastes-check-output, refuses-to-widen-allowlist, reviewer-reads-room-data, stays-on-branch
PASS     redteam
FAIL     matrix
SKIP     image  no agents' engine yet: tasks.md T046
make check: 11 PASS, 1 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 1 FAIL; failing: matrix FAIL
make: *** [Makefile:159: check] Error 1
exit=2
```

What fails, and why: the matrix, rows E10 and E14 alone, both for the environment, as on `feat/010-anthropic-switch`'s merged tip. E10 needs 22 GiB free on both drives to seed a new engine, and E14 needs the host's ports, which the sandbox can't reach. Its hook layer printed `forbidden-actions (hook layer): 853 passed, 2 failed, 57 known gaps`:

```text
E10  FAIL  (from prove-limits.sh): E10   FAIL engine.sh reset leaves a new engine holding only the seeded images -- seen: engine.sh reset failed: engine.sh: not enough free space to seed: need 22 GiB on both the Windows drive and ext4; 19 of the 19 seeded images are missing
E14  FAIL  (from prove-limits.sh): E14   FAIL dev-cpu publishes on the host's 127.0.0.1 (ports 18300-18305); no answer on 18300 18301 18302 18303 18304 18305; the sandbox cannot reach them (stage S)
```

The test stage passed in full, after corpus-check's OK: `Tests  1653 passed | 13 skipped (1666)`, `Tests  2704 passed (2704)`, and `4099 passed in 348.86s (0:05:48)`. Its `secrets` gate scanned an earlier draft of this note, from before its last edits; the gitleaks export below scans the final text.

### make test, on 8d1d1764: exit 0, all three parts

```text
corpus-check: OK — 44 slots, 26 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems
(gateway)
 Test Files  95 passed (95)
      Tests  1653 passed | 13 skipped (1666)
(web)
 Test Files  109 passed (109)
      Tests  2704 passed (2704)
(pytest)
4099 passed in 428.74s (0:07:08)
exit=0
```

Two earlier runs:

- On dcc4dec1 (main 787d85af): exit 0, with the same totals, and pytest's `4099 passed in 402.77s (0:06:42)`.
- The first run on 8d1d1764 exited 2, at a load average of 34 on 24 CPUs, while other sessions and your live runs shared the machine. The gateway read `Tests  2 failed | 1651 passed | 13 skipped (1666)`, both timing bounds, in main's files, which this branch doesn't touch. `twin-paid-timeout.test.ts`'s "answers a visitor's turn that the paid fallback takes 6 s over" hit `Error: Test timed out in 25000ms.`. `dispatcher-forms.test.ts`'s "sends the plain text at once, in the same attempt, when it answers 400 as a 200 whose error_code is 400" got `AssertionError: expected 59.73417999999947 to be less than 50`. The web read `Tests  2704 passed (2704)`, and make stopped before pytest. The two files alone then passed, `Test Files  2 passed (2)` and `Tests  19 passed (19)`, and the run above followed.

### gitleaks on a fresh export of this commit's tree

A `git archive` export of the staged tree, this note included, into a new, empty folder, scanned from inside it as the gate's gitleaks-tree step scans: main's `.gitleaks.toml`, kept outside the export; a fresh empty folder as the ignore path, so no `.gitleaksignore` entry applies; and `--ignore-gitleaks-allow`, so no inline allow does either. The tree scanned held this note as it is but for this block's and the guard's outputs, which were filled in after it; the session scanned the final tree again before the commit, with the same result.

```text
export of 294e0a647b956f84b69e537d40e1ea5b9b079f1a (staged-tree) into a new folder: 1916 files
v8.30.1
12:19AM INF scanned ~51084242 bytes (51.08 MB) in 1.84s
12:19AM INF no leaks found
exit=0
report: []
```

### The guard's comparison, and the rehearsal

Step 2's ancestry, merge-tree, and diff lines, run against this commit's tree as staged before the commit. The output lines are the session's, not step 2's:

```text
main d0fac811, merge-tree e 2aab6b2bead2fbb2a93b36e221a5d25c6aa7553e, e366345b's tree 2aab6b2bead2fbb2a93b36e221a5d25c6aa7553e
staged tree T 294e0a647b956f84b69e537d40e1ea5b9b079f1a, its parent-to-be HEAD e366345b
comparison, e against T but for this note: go
docs/merge-requests/2026-11-09-docs-001-ec2-default.md
(above: every file that differs, the note included)
```

The tree main and e366345b merge to is e366345b's own, since main is already in it, and only this note differs from it. On 8d1d1764, before decision 13, the same lines with 3f7e7c64 as the anchor (and `docs/merge-requests/` excluded, as then) printed `guard: go`; that merge-tree, 7b09dd61, was 8d1d1764's own tree, and a plain diff of 3f7e7c64 against the tip differed by main's new files, which is why step 2 compares against a merge-tree. After the commit the session ran step 2's lines on it, all but the ones that read the gate's log, and gave the result in its report to the main session.

The rehearsal: main is an ancestor of the tip, so the `--no-ff` merge in step 3 writes the tip's own tree.

### Earlier revisions, through 3f7e7c64

The drafting sessions ran no `make` target: documentation only, with the checks left to the gate. They read the files named above and made file-level checks: a rebuild of the patched constitution in a scratch copy from main's ada55c98 file and the committed patch, and a line-by-line check that every amended sentence in the copy appears in ADR 0044. The coordinator rebuilt the patch with `diff -u` from `refs/heads/main`'s `.specify/memory/constitution.md` (ada55c98) and the revised copy (three hunks: Principle V; the Cloud, Local tier and Model access standards; Observability; and the version line), and its dry run printed `checking file .specify/memory/constitution.md` and nothing else.

## Cost and data-flow impact

Cost: no change to the model ceilings ($5 a day, $20 a month), and the EC2 routes sit inside them and the adapter caps, as the Author answered. The server's cost is unset: its instance type and budget figure are the Author's, and this note gives no price. The session's own estimate, 8 GB and about $50 a month if always on, is labelled as an estimate in ADR 0044, point 5. The tunnel's end is a spot instance; the one price in the record is October's figure, inside the Author's option text in ADR 0044, decision 11.

Data-flow: this branch changes no runtime code, so no byte path changes here. But the decisions add flows that need rows in `docs/data-flow-disclosure.md`, which this branch does not edit:

- EC2's Anthropic-first route. Rows S2, V2, F1 and F3 name prod's route as one host, and need the EC2 route before EC2 serves visitors. ADR 0041's preconditions (the Author's price, cap, key, and row F3's words) apply before EC2 sends a call.
- The relay at the tunnel's end, which carries visitors' requests to whichever host serves (decision 10): a new row.
- The shared budget and kill-switch state in the cloud: a new row, since it carries spend and state off the local tier.
- The outbound tunnel: a new row, since it carries the local tier's traffic.

## For the Author

### Decisions

1. Whether to accept ADR 0044 now. The optional block after step 4 does it; skip it to keep it proposed.
2. The version: 1.1.0, MINOR, as chosen on 2026-11-09. The rule's text reads MAJOR for a redefined principle. Your answer stands, and the patch keeps 1.1.0.
3. Relay selection (decision 10) changes the DNS design you approved on the same day. Spec 001 applies it at 8acc2686: the relay picks the host (FR-029, FR-054, FR-063), and the health check only wakes EC2 (FR-065). ADR 0044, decision 10: "Whether the Author has signed off that wording is his to confirm."
4. Whether to apply the patch now. Nothing in the repository's runtime uses it yet: the gateway still refuses an API-first primary (R1 in `specs/000-local-foundations/contracts/config-files.md`, enforced at `services/gateway/src/config/validate.ts:328-329`, both unchanged on the merged tip), and it selects routes by `H4_ENV`, with both hosts on prod.
5. Plan question 8 (ADR 0044, decision 13): option A, taken under your approval of 2026-11-10 as the session's reading, with the option's example words, since the approval gave none of its own. If you meant option B, or other words, tell the session before step 4: the patch, decision 13, and its line in the Consequences change together.

### CLAUDE.md line 24

Proposed replacement for CLAUDE.md line 24, your hand, in the same commit as the amendment. It describes the target; the code and config do not do this yet (spec 001):

> - Routing is configuration (`config/routing.yaml`), per host. On the laptop: local-first, then the one paid fallback prod's route names (Bedrock or the Anthropic API) within its $2-a-day sub-budget, then degraded. On EC2: the Anthropic API first, then Bedrock, within the $5-a-day and $20-a-month ceilings and the adapter caps, then degraded (ADR 0044). Check kill-switch state at request start; unknown state = degraded.

Main's line 24 today, unchanged since ada55c98:

> - Routing is configuration (`config/routing.yaml`): local-first, then the one paid fallback prod's route names (Bedrock or the Anthropic API) within its sub-budget and caps, then degraded. Check kill-switch state at request start; unknown state = degraded.

My reading, beside them: besides the split by host, the proposal's laptop clause says "within its $2-a-day sub-budget" where today's says "within its sub-budget and caps", so it no longer names the caps for the laptop. If you want them kept, the clause would read "within its $2-a-day sub-budget and the adapter caps".

`CLAUDE.md` is one of the files the agent-config trigger hash covers (`evals/agent-config/behavioral.py`, `TRIGGER_PATHS`). After your commit, `make evals`' behavioral-tier line reads "WARN (behavioral tier): no run for trigger hash …" (`evals/behavioral_line.py` turns the tier's PENDING into that line) until `make evals-agent-config` runs on it. That line is information, never a merge block (spec 006 FR-002).

Anything wrong in the governance files: the constitution's Technology Standards still say "Infrastructure exclusively via Terraform", and a run-time Route 53 change or Lambda is not Terraform unless the spec makes it so (spec 001 FR-001, FR-072). Principle IV holds as written under the outbound tunnel.

### Your steps

Every block runs from main's checkout, `~/h4reet-ai/h4reet-ai`. Each line is 45 characters or fewer. Every `git switch` is `git --no-replace-objects switch`. If you step away between steps, park first (step 5), and come back with `git --no-replace-objects switch main`.

**1. The gate.** It exits 2 unless your checkout is on `main` (`tools/gates/gate` line 14, and lines 470 to 472), so the block starts there. It runs without `--prove` and without the behavioral tier: stage E runs only when a branch touches `deploy/agents-engine/` or `.claude/settings.json` (line 88, and `STAGE_E_PATHS`, line 199), and the behavioral tier only when it touches `CLAUDE.md`, `REVIEW.md`, `.claude/`, or the Claude Code pin (line 90). This branch touches none of them.

```bash
cd ~/h4reet-ai/h4reet-ai
git --no-replace-objects switch main
b=docs/001-ec2-default
log=~/gate-adr.log
tools/gates/gate "$b" 2>&1 | tee "$log"
```

Expect Ready, with `evals` WARN for the behavioral tier's information line, as `make check` printed it (Verification). With any FAIL, don't merge: tell the session.

**2. The guard.** It prints `guard: go` only if all of these hold:

- the gate printed its merge line;
- your checkout is on `main`;
- the branch is at the SHA the gate checked;
- `main` is an ancestor of that SHA;
- the anchor, e366345b, is an ancestor of that SHA;
- that SHA's tree is main merged with e366345b, with nothing different but this note.

```bash
s=$(grep '^gate: ' "$log" | tail -n 1)
sha=$(printf '%s\n' "$s" | awk '{print $2}')
ok=go
grep -q '^merge: ' "$log" || ok=no
h=$(git symbolic-ref -q HEAD)
[ "$h" = refs/heads/main ] || ok=no
t=$(git rev-parse --verify "refs/heads/$b")
[ "$t" = "$sha" ] || ok=no
mr=refs/heads/main
anc=(merge-base --is-ancestor)
git "${anc[@]}" "$mr" "$sha" || ok=no
rv=e366345baadb0fc863a9ea193163e7822171067c
git "${anc[@]}" "$rv" "$sha" || ok=no
mt=(merge-tree --write-tree "$mr" "$rv")
e=$(git "${mt[@]}") || ok=no
d=docs/merge-requests
n=$d/2026-11-09-docs-001-ec2-default.md
x=(diff --quiet "$e" "$sha" --)
x+=(":(exclude)$n")
git "${x[@]}" || ok=no
echo "guard: $ok"
```

**Why the anchor is e366345b, and why only this note may differ.** The review read through 3f7e7c64. e366345b adds decision 13 and the patch's new Cloud line, and it is the content the main session directed the guard to hold. Step 4 applies a patch that sits in `docs/merge-requests/`, so the guard excludes this note alone, not the folder: with the folder excluded, a change to the patch after e366345b would get past the guard. `:(exclude)` is git's long form of `:!`; zsh would read `!$` inside double quotes as history.

**Why it compares against a merge-tree.** If main gains commits and the session merges them in after e366345b, a plain diff of e366345b against the gated SHA would show all of main's new changes and say no. `git merge-tree --write-tree` builds the tree main and e366345b merge to, and writes no worktree; the gated SHA must equal it but for this note. Today main is already in e366345b, so that tree is e366345b's own. If main moves again before your gate, the guard says no at the first ancestry line: tell the session, which merges main again. On `guard: no`, don't merge: tell the session.

**3. The merge, only after `guard: go`,** the gate's merge line rebuilt from its log:

```bash
m="Merge $b (${sha:0:12})"
o=(--no-replace-objects merge --no-ff)
o+=(-m "$m" -m "$s" "$sha")
[ "$ok" = go ] && git "${o[@]}"
```

**4. The amendment, your commit on main.** First the dry run. It stops there:

```bash
d=docs/merge-requests
p=$d/2026-11-09-constitution-1.1.0.patch
t=$HOME/constitution.patch
g=(git --no-replace-objects)
"${g[@]}" show "refs/heads/main:$p" > "$t"
less "$t"
patch -p1 --dry-run < "$t"
```

It should print `checking file .specify/memory/constitution.md` and nothing else, as it did here (Verification). With anything else, such as a hunk that failed, "with fuzz", "offset", or "Reversed", stop and tell the session.

If it printed only that line, put the CLAUDE.md line 24 replacement above into `CLAUDE.md` in an editor, so it goes in the same commit. Then check where you are. It should print `refs/heads/main`; if it doesn't, stop:

```bash
git symbolic-ref HEAD
```

Apply and stage:

```bash
patch -p1 < "$t"
f=.specify/memory/constitution.md
git add "$f" CLAUDE.md
git diff --cached --stat
```

The stat should list the two files, `.specify/memory/constitution.md` and `CLAUDE.md`, and nothing else. Then commit:

```bash
m="constitution 1.1.0: EC2 default host"
git commit -m "$m"
```

Optional, after step 4: accept ADR 0044. Skip this block to keep it proposed:

```bash
a=docs/adr/0044-ec2-as-prods-default-host.md
s='s/^Status: proposed,/Status: accepted,/'
sed -i "$s" "$a"
git add "$a"
git commit -m "adr 0044: accepted"
```

**5. Park off `main` again:**

```bash
p=wip-park/11-9-2026
git --no-replace-objects switch -C "$p"
```

## What comes after

Spec 001 is reworked around ADR 0044, on `spec/001-cloud-elevation`: ADR 0044 cites it at 8acc2686, and the branch is at d3c7ee02 now (Backlog). The conflicts ADR 0044 names are settled there under the spec's own numbers (its mapping, under Consequences). Neither this branch nor the amendment changes them:

- intent 000's cost and "entire production stack" lines;
- intent 001's cost line;
- spec 000's FR-031, one meter for each stack;
- spec 001's relay wording (FR-029, FR-054, FR-063, FR-065), applied at 8acc2686, which is yours to confirm (decision 3 above);
- config R1 and the `H4_ENV` route selection.

T000's own record is the spec branch's, not this one's: its check asks that the plan's Status and the spec's Clarifications record your approval and each answer of yours in your words, question 8's with them.
