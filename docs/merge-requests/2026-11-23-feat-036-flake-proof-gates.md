# feat/036-flake-proof-gates
Spec: specs/036-flake-proof-gates/ · Intent: specs/036-flake-proof-gates/intent.md (accepted 2026-11-23) · Written by: Claude Code, a subagent of the Author's session, in one worktree · Date: 2026-11-23
Session: /tmp/claude-1000/wt-036 (worktree of /home/h4reet/h4reet-ai/h4reet-ai, branch from main 42019d3d) · Repo hooks active: yes (each commit ran the gitleaks and arrival-check hooks; the bash gate refused six commands: three whose text, a commit message or a script editing documents, named an Author-only make target, each redone with a message file, a script file, or the Edit tool, never respelled; one `env -i` call, dropped for the test that runs make itself; one recursive delete of a scratch folder in `$TMPDIR`, dropped and the folder left; and one `grep` after a `cd "$TMPDIR/…"` the gate couldn't resolve, redone with the absolute path)
Authorized by: the intent, accepted 2026-11-23 ("Yes, let's get those in there before we do c2"), and the Author's direction, relayed by his session, to build it today with the intent's recommended answers

## What changed and why

**What runs in your terminal.** The gate's change is a patch for your hand, `docs/merge-requests/human-patches/2026-11-23-036-gate.patch` (SHA-256 `e009769a1416ff55881f5de439d7cace5683f5425cbc941065c686efee4735d4`), to `tools/gates/gate` and `tools/gates/test/test_gate.py`. `deploy/scripts/release.py` runs in your terminal through `make release`. The Makefile's `test` recipe runs only in the gate's container and in agent sessions. Nothing else here runs on your host.

The intent's four outcomes, from `main` `42019d3d`. The first, deterministic flaky tests, is `fix/036-flaky-tests`'s, not this branch's.

| Item | What | Where |
|---|---|---|
| 1. One retry, visible | When `make test` fails, the gate reruns exactly the failed tests once, in `make test`'s own container (the same image, `/work`, `--network none`, user, and limits): `npm test -w <workspace> -- <files> -t '^(?:<names>)$'` per failing workspace, and `pytest <the branch's PYTEST_ARGS> <node ids>`. It retries only when the output names every failure as a test: the `test-part:` lines; a summary for each failing workspace whose failed counts equal its FAIL lines, each placed in a workspace by its file (vitest prints them on stderr, which docker forwards apart from stdout); pytest's failed count equal to its FAILED lines; no pytest ERROR, vitest failed suite, unhandled error, or `Errors` count; a failing workspace's script `vitest run`. A rerun must pass exactly its tests and fail none. Then the step is PASS with `flaky: <tests> (failed, then passed on the gate's one retry)`, and the summary line ends `; flaky: <tests>`. Otherwise it is FAIL as before, with `no retry: <why>` or `its one retry failed too: <why>` | the patch: `retry_plan`, `vitest_failures`, `pytest_failures`, `retry_test`, `Step.flaky`, `summary_line` |
| 2. Docs-only fast path | Every changed path is a plain Markdown file (mode 100644, added, changed, or deleted) directly in `docs/merge-requests/`, `docs/infra/applies/`, or `docs/incidents/`, not a README, and no file of the tree outside `specs/`, `intent/`, and `docs/`'s Markdown names it without `.md`. Then test, evals, redteam, matrix-h, and image are `SKIP docs-only: N files`, and a `links` step runs `evals/docs_links.py` in evals' place. Every other step runs as before, and a `docs-only:` line near the top says why, or names the path that kept the fast path off | the patch: `docs_only`, `names_in_tree`, `links` |
| 3. The release | A gate line with 0 FAIL, 0 PENDING, and a `flaky:` segment is a pass. The segment's test names are never read as a status. `failing:`, DEGRADED, and PENDING still refuse. `ACCEPT_GATE=<main's SHA, in full> REASON="…"` (`--accept-gate`, `--reason`) releases past a failing line for main's tip alone, never a DEGRADED line, a PENDING step, or a merge without a line, with a warning. `release.json` now keeps `gate.line` always, and `gate.accepted` (merge and reason) when used | `deploy/scripts/release.py`, the Makefile's `release` and `LITERAL_VARS` |
| 4. `make test` | Each workspace's tests by folder (`npm test -w <folder> --if-present`, the same script `--workspaces` ran), then pytest, each whatever the others exit. Then `test-part: workspace <folder> exited N` after each and `test-part: pytest exited N` last; it fails when any part did. Before, a failing workspace stopped make before pytest, and npm's one exit couldn't say which workspace failed (research.md R-4) | the Makefile's `test` |
| Records | ADR 0060 (amends 0017 and the releases contract §2.1); the local gate's runbook (symptoms, steps 16 and 17), the deploy runbook (step 5), the lifecycle guide's FR-041 row, START-HERE §7, spec 001's releases contract §1 and §2 | `docs/`, `specs/001-cloud-elevation/contracts/releases-deployer.md` |

**The fast path's set and its derivation** (research.md R-3). The search covered every read of a docs path in the tests, the room's build, the evals, the red team, the matrix, the Dockerfiles, and the gate's steps, by `git grep` for the folders' names and their split spellings in path joins, and for walkers (`rglob`, `os.walk`, `readdirSync`, `ls-files`). Tests read `docs/merge-requests/` by name: patches (P-I1 to P-I7, P-W2, P-6; `infra/test/patches.py` and four infra tests, `evals/test_breach.py`), `human-patches/` (the 032 patches, `023.md`), `2026-11-14-night-stack.md` (`film-links.test.ts`), `README.md` (`evals/test_repository_docs.py`), and a `.resolve.py`. `evals/docs_links.py` reads every Markdown file under `docs/`, so the fast path runs it as `links`. Nothing in a skipped step reads `docs/infra/applies/` or `docs/incidents/`. So the set is Markdown directly in the three folders, no README, no patch or script, no subfolder, and the by-name readers are caught at each gate by the name check over the branch's own tree, so a test added later that reads a note takes it out.

## Acceptance criteria

FR-001 to FR-007 are the patch's tests, FR-008 is `scripts/test_make_test_parts.py`, FR-009 to FR-012 are `deploy/scripts/test_release_accept_gate.py`, and FR-013 is the records above. SC-001 and SC-002 are the gate's retry tests, among them one for each no-retry case. SC-003 is the docs-only tests, which also check that no image is built and the engine isn't asked. SC-004 is the release tests. Your proof is your next gate: a flake's `flaky:` line, or `docs-only` on a notes branch.

## Constitution check

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local | no | Nothing leaves your machine. The reruns keep `--network none`. No disclosure row |
| II. Production-grade | yes | Tests for every FR, RED before GREEN, from real vitest 5.0.3 and pytest 9.1.1 output. No runtime endpoint, so no span or panel; the record is the gate line in the merge's message and `release.json` |
| III. Intent → spec → code | yes | Accepted intent, then spec, research, plan, and tasks, committed before code. The gate's part is a patch you apply |
| IV. Least privilege | yes | `tools/gates/**` is changed only by your patch, built from plain copies; no worktree's `tools/gates/` was written. The exception is yours alone: `make release` stays `AUTHOR_ONLY`, and the exception needs main's full SHA and a reason. No hook, permission, or sandbox setting changed |
| V. Cost | yes | $0 in the cloud; the gate's time drops |
| VI. Build in public | yes | A flake is named in the merge commit's message, and an accepted failing line in the release's record. ADR 0060 records the decision |
| VII, VIII | no | Nothing about your work or the twin |
| Quality gates (Development Workflow §5) | a named deviation | The release's exception releases past a failing line by your hand, with the reason kept. spec.md's Assumptions name it, and ADR 0060 records it. The retry is not a deviation: a test that passed only on its rerun is reported as flaky, never as a plain pass |

## Review

## Verification

Run in the worktree's sandbox: no Docker, no GPU, no browser. `make check`'s container stages, the evals' live adapters, and the red team's live runs aren't owed here: the change touches no model path and no agent configuration.

- **RED, then GREEN, on the branch.**
  - `3f580e6b` (the release and `make test`): 27 failed, 4 passed on main's code. The 4 that passed are the flag checks that refuse flags main's release.py doesn't know. GREEN `a2bcd4fb`: 31 passed.
  - `0c04b935` (per-workspace part lines): 6 failed, 1 passed. GREEN `ec55e054`: 86 passed with `scripts/test_makefile.py` and the release's new tests.
  - `71220a5d` (the exception never takes a PENDING step): 2 failed, 25 passed. GREEN `4cd395f3`: the release suites, 104 passed.
- **RED, then GREEN, for the patch** (in `$TMPDIR` exports, never a worktree):
  - The new tests against main's own gate: 50 failed, 1 passed (`test_only_the_test_step_is_retried`, which a gate that never retries passes).
  - The first patch: 51 passed.
  - After the per-workspace lines: 25 failed, 13 passed against the first patch's gate. With the final gate, the 53 new tests passed.
- **The patch on a fresh `git archive refs/heads/main` export:** `patch -p1 --dry-run`, then `patch -p1`: both files checked and patched, each byte-identical to the copies the diff was taken from. Then `pytest tools/gates`, every file there: `1614 passed in 500.97s (0:08:20)`. The first patch had passed the same suite: 1612 passed in 435.76 s.
- **On real output:** the gate's parser, run on the vitest 5.0.3 output of a scratch project (two workspaces, nested suites, a name with `( ) [ ] { } $ ^ * + ? .`) and pytest 9.1.1's (parametrized ids with ` - ` and nested brackets), planned exactly the failed tests. It refused pytest's real `ERROR` line. A real passing rerun (`npm test -w services/a -- … -t '^(?:…)$'`, and `pytest <ids>`) passed its checks, and the same rerun asked for one test more than it ran failed them. Real `npm test -w services/relay --if-present` in this repository: `Tests 90 passed (90)`, exit 0.
- **`make -f Makefile lint`** on the final tree: eslint `--max-warnings 0`, tsc for the three workspaces, `prettier --check .` ("All matched files use Prettier code style!"), `ruff check .` ("All checks passed!"), `ruff format --check` ("1003 files already formatted"), shellcheck. `exit 0`.
- **Touched suites** on the final tree: `scripts/test_make_test_parts.py`, `scripts/test_makefile.py`, the five `deploy/scripts/test_release*.py`, `deploy/scripts/test_deployer.py`, `evals/test_docs_links.py`, `evals/test_repository_docs.py`: 299 passed.
- **The docs' links:** `docs links: 0 failed, 2932 relative links in 601 files`, the ADR index 56 of 56.

## Cost and data-flow impact

$0 in the cloud. No data flow. A retry adds one container start per failing workspace and one for pytest, about a minute; the fast path saves `make test`, `make evals`, the red team, the matrix, and the image builds on a notes branch.

## Compatibility

- **Spec 031** (`feat/031-ci`, not merged) patches the same gate (`--ci`, `--only`, `--shard`, `--report`) and rewrites the same `test` recipe for CI's shards. Its patch is rebuilt on top of this one when it lands. Four things need care. `container_phase` takes `fast` beside its `ci`. Its `--ci` report carries `test`'s `flaky:` note, and `Step.flaky` if it reports one. Its `test` recipe must keep the `test-part:` lines in each shard. `tools/ci/parity.py` should list `links`, which only a docs-only run reports. The gate line's format is unchanged but for the new optional `; flaky: …` segment, after `failing:` and before `DEGRADED`. `tools/ci/summary.py` writes its `ci-gate:` line in the same counts, from the `--ci` reports rather than the line, and release.py reads your gate's line as before.
- **Branches cut before this one** get no retry until they merge main. Their `make test` prints no `test-part:` lines, and the gate says so: `no retry: make test didn't say what each of its parts exited …`. The fast path needs nothing from the branch.

## For the Author

1. **The patch on main, by your hand**, from main's checkout. It is independent of this branch, so it can go first, and then this branch's own gate retries a flake. Fetch it from the branch and check its hash:
   ```sh
   b=refs/heads/feat/036-flake-proof-gates
   d=docs/merge-requests/human-patches
   f=$d/2026-11-23-036-gate.patch
   git show "$b:$f" > ~/036-gate.patch
   sha256sum ~/036-gate.patch
   ```
   Check it prints `e009769a…4735d4`, then:
   ```sh
   patch -p1 --dry-run < ~/036-gate.patch
   patch -p1 < ~/036-gate.patch
   git add tools/gates/gate
   git add tools/gates/test/test_gate.py
   git commit -m "P-036-gate"
   ```
2. **Your gate on this branch, and the merge**, from main's checkout: `tools/gates/gate feat/036-flake-proof-gates`, then the merge line it prints. With the patch on main first, the gate notes that main has a commit the branch doesn't: the patch's two files, which the branch doesn't touch.
3. **When a release refuses a merge's failing line** you know is a flake: the deploy runbook's step 5. `sha=$(git rev-parse refs/heads/main)`, then `make release` with your usual values, `ACCEPT_GATE="$sha"`, and `REASON="<why>"`.

Questions, each with a recommendation:

1. **The exception and PENDING.** The intent's exception is for "a known flake's FAIL line", so the release refuses a PENDING step even with `ACCEPT_GATE=`: stage E's prove or the agent-config evals, runs only you make. Recommended: keep it so.
2. **The reruns go through npm and pytest, not make.** They use the workspace's own `test` script and the branch's `PYTEST_ARGS`, in `make test`'s container. What differs from the first run is make's own variables (`MAKEFLAGS`, `MAKELEVEL`) and the corpus check, which had passed. Recommended: keep it so.
3. **The fast path's folders.** Three, as the intent recommended. `docs/adr/`, `docs/research/`, and `docs/how-we-build/` aren't in it, since tests and the room's build read some of their files (ADR 0054, the disclosure, the studio's work orders). Recommended: widen it only by a later spec, with that folder's derivation.

## Backlog

- `make test-fast` still stops at its first failing part; nothing gates on it.
- `make check` in an agent session shows the test step's first run only. The retry is the gate's alone.
