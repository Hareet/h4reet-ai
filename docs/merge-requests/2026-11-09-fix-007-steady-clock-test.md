# fix/007-steady-clock-test

Spec: [specs/007-twin-conversation/](../../specs/007-twin-conversation/), its
[plan.md](../../specs/007-twin-conversation/plan.md)'s D43 · Intent: none · Written by: implementer subagent (Claude
Opus 5.5), for the main session · Date: 2026-11-09

Session: the main session started from `/home/h4reet/h4reet-ai/h4reet-ai`. This branch's worktree is
`/tmp/claude-1000/wt-clock`, which the main session created from `main` at ada55c98; it's stacked on
`fix/009-avatars-ready` (Status). Repo hooks active: yes. In `.claude/audit/hooks.log`, this session's events in
`wt-clock` from 2026-11-09T23:04Z were ALLOW, among them its `git --no-replace-objects merge
refs/heads/fix/009-avatars-ready` at 23:11:12Z, which Claude Code's auto-mode classifier then refused (Status). The
BLOCKs in the same window are other sessions': 23:11:39Z ("redirecting git hooks or config", in `wt-switch`), 23:25:03Z
and 23:25:29Z ("a read-only role writing a file"), and 23:34:02Z ("an Author-only make target", in `wt-feat005`).

Authorized by: your decision of 2026-11-09, answering "How should we get your gates passing?": "Fix the test
(Recommended)", whose description read: "A small branch that makes the timing test measure with the same steady clock
the gateway's timers use (performance.now() in place of Date.now()). It's an edit to a test file, so your OK is
needed." That answer is the authority for editing a test file here. This isn't a fix task in the `FIX_TASK` sense: no
gateway code changes, and the test's bounds are as they were.

## Status: ready for your gate, stacked on fix/009-avatars-ready

The checks below pass but for the environment's `matrix` rows. This branch's own `REVIEW.md` pass (Review) says "ready.
No Important findings", and fix/009's says "ready"; its nits are recorded with what was done about each, in this
note alone, and the guard (step 2) holds the gate to the reviewed tip, 2f3c18bb, with only `docs/merge-requests/`
changed after it.

This branch is the clock fix (a63a74ea) and this note, stacked on `fix/009-avatars-ready` (2423a5a6, reviewed: ready;
its note, [2026-11-09-fix-009-avatars-ready.md](2026-11-09-fix-009-avatars-ready.md)). That branch's F1 to F3 fix two
of `main`'s own gate steps, `make lint` (Prettier on four of your history files from e324771e) and the web tests
(`test/room/chunk.test.ts` and `dist.test.ts`, 8 failures); this branch fixes the third, the gateway's timing test. So
**one gate on this tip, and one merge, bring both branches**: don't gate or merge `fix/009-avatars-ready` on its own.

**You ran the stacking merge in your terminal:** 6ee7a6de, "Merge branch 'refs/heads/fix/009-avatars-ready' into
fix/007-steady-clock-test", its parents 5ad8fcd2 (this branch) and 2423a5a6 (fix/009). This session's own `git
--no-replace-objects merge refs/heads/fix/009-avatars-ready`, at 23:11:12Z, was refused by Claude Code's auto-mode
classifier ("Merge Without Review"), though the repository's bash gate had allowed it; nothing was respelled. Your
merge's tree, 93481939, is the one this session had rehearsed without moving a ref (Verification), and both
`refs/heads/main` (ada55c98) and `fix/009-avatars-ready` are ancestors of the tip. The checks below are on 6ee7a6de,
before this note's rewrite.

| Check, on 6ee7a6de (the stacked tip) | Result |
|---|---|
| The timing file alone, five runs each (on a63a74ea) | RED on `main`: 3 of 5 failed (8,363 against 9,000; 5,424 and 5,394 against 6,000); GREEN: 5 of 5 passed |
| `make lint` | exit 0 |
| `make test` | exit 0, all three suites whole: the gateway "95 passed (95)", "1652 passed \| 13 skipped (1665)"; the web "108 passed (108)", "2699 passed (2699)"; pytest "4099 passed in 426.62s (0:07:06)" |
| `make evals` | exit 0: product 187 passed, narration 44 passed, agent-config static 0 failed, docs links 0 failed of 1,830; the behavioral tier's advisory WARN |
| `make check ENGINE_MODE=none-yet` | "11 PASS, 1 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 1 FAIL; failing: matrix FAIL": `matrix` E10 and E14 alone, the environment's; `test` whole (pytest "4099 passed"); `arrival` "0 findings in 75 files (20 commits), 8 warnings", the intake's. The run before it, under a load average near 22, failed one other gateway case, `app.test.ts`'s graceful shutdown, a 50 ms race this branch doesn't touch (Verification, Backlog) |
| The rehearsal into `refs/heads/main` (ada55c98) | `main` and `fix/009-avatars-ready` ancestors; the merge writes the tip's own tree, 93481939; `gitleaks dir` on that tree, no leaks |

## Runs in your terminal

Nothing paid, and no `--prove` or behavioral tier: the gate's stage E waits for `--prove` only when a branch touches
`deploy/agents-engine/` or `.claude/settings.json` (`stage_e`: "the branch touches neither deploy/agents-engine/ nor
.claude/settings.json"), and its behavioral tier runs only for `CLAUDE.md`, `REVIEW.md`, `.claude/`, or the Claude Code
pin (`agent_config_evals`: "the branch touches none of the triggers"). Against `main` (ada55c98), this branch touches,
from this branch, `services/gateway/test/integration/twin-paid-timeout.test.ts`, `specs/007-twin-conversation/plan.md`,
and this note; and, from `fix/009-avatars-ready`, your intake under `assets/` (`assets/visitors/`, `assets/CREDITS.md`),
`.prettierignore`, `apps/web/`, `specs/009-room-avatars/`, and its three files in `docs/merge-requests/`. No step runs
git in an agent's worktree. If `main` moves before the gate, the guard says `no`: tell the session, which merges `main`
into the branch.

1. **The gate, from main's checkout:**

   ```bash
   cd ~/h4reet-ai/h4reet-ai
   git --no-replace-objects switch main
   b=fix/007-steady-clock-test
   log=~/gate-clock.log
   tools/gates/gate "$b" 2>&1 | tee "$log"
   ```

   Expect Ready, with `evals` WARN (the behavioral tier's advisory line); and, from fix/009, as its note says,
   `arrival` PASS with the intake's eight `WARN assets/visitors/…` lines (spec 004's C1, the composite mark), and
   `studio-settings` run on your studio session's settings, since the range adds files under `assets/`. With any FAIL,
   don't merge, and tell the session.

2. **The guard.** It goes only if the gate printed its merge line, your checkout is on `main`, the branch is at the SHA
   the gate checked, `main` has nothing that SHA lacks, and that SHA holds the reviewed tip, 2f3c18bb, with nothing
   changed after it outside `docs/merge-requests/` (Review, N3):

   ```bash
   s=$(grep '^gate: ' "$log" | tail -n 1)
   sha=$(printf '%s\n' "$s" | awk '{print $2}')
   n=$(grep -c '^merge: ' "$log")
   on=$(git symbolic-ref -q HEAD)
   tip=$(git rev-parse --verify "refs/heads/$b")
   mr=refs/heads/main
   want="$mr.$sha"
   ```

   Then, on its own lines:

   ```bash
   ok=no
   [ "$n" -gt 0 ] && ok=go
   [ "$on.$tip" = "$want" ] || ok=no
   anc=(merge-base --is-ancestor)
   git "${anc[@]}" "$mr" "$sha" || ok=no
   rv=2f3c18bbe9ecaf9114573926b81f1b19f0b61b6b
   git "${anc[@]}" "$rv" "$sha" || ok=no
   x=(diff --quiet "$rv" "$sha" --)
   x+=(':!docs/merge-requests')
   git "${x[@]}" || ok=no
   echo "guard: $ok"
   ```

3. **The merge, only after `guard: go`,** the gate's merge line rebuilt from its log:

   ```bash
   m="Merge $b (${sha:0:12})"
   o=(--no-replace-objects merge --no-ff)
   o+=(-m "$m" -m "$s")
   [ "$ok" = go ] && git "${o[@]}" "$sha"
   ```

   This merge brings `fix/009-avatars-ready` too, so its note's steps 1 to 3 are done; the rest of its steps follow,
   from [its note](2026-11-09-fix-009-avatars-ready.md#runs-in-your-terminal).

4. **The stack,** from main's checkout (fix/009's step 4):

   ```bash
   make up ENV=prod
   ```

5. **T046, the demo (L5),** in the browser, as fix/009's step 5 has it: the woman at the door, the hand-off ending in
   her left hand, a talk with the twin, the stand-in line, and "2D view". Your verdict goes in a follow-up note, as that
   step says.

6. **Park off `main` again** (fix/009's step 6):

   ```bash
   p=wip-park/11-9-2026
   git --no-replace-objects switch -C "$p"
   ```

## What changed and why

`services/gateway/test/integration/twin-paid-timeout.test.ts` (D43, on `main` since 330bfe0b) timed its three cases
with `Date.now()` in its `timed()` helper and held each to at least a timer's length: the stub's 6 s delay on a
visitor's turn, hello's 4 s cut, and the 9 s cut on the Author's admin twin call. Those timers run on the monotonic
clock; `Date.now()` reads the wall clock, which on this WSL host has been stepped back since about 15:35 local time
today (Hyper-V's time sync, with the kernel's `tick` moving, as the main session measured). A 20-second Node timer read 20,021
ms on `performance.now()` and 19,360 ms on `Date.now()`, the wall clock 661 ms behind, so the test read the cuts short
and failed, and `make test`, which stops at the gateway's workspace, never ran the web tests or pytest.

The one change: `timed()` reads `performance.now()` at the start and the end, with a two-line comment saying why. Every
assertion's bound is as it was, and nothing else in the file moved. Spec 007's plan.md, D43's row, gets one sentence saying the three cases time the call
on the monotonic clock and why, so plan and test agree.

This is the pattern c0cd58d9 ("test(000): the gateway's tests time every duration on the monotonic clock,
performance.now() (Fix B)") set for the gateway's tests on 2026-11-07; D43's test came after it and timed with
`Date.now()`.

### The gateway's clocks, so the test compares like with like

- **The cut is a Node timer.** The Bedrock adapter bounds each attempt with `AbortSignal.timeout(limitMs)`
  (`services/gateway/src/adapters/bedrock-converse.ts:272`), and `settleBy` (`:369`) settles the call when that signal
  aborts. The Anthropic adapter does the same (`anthropic-messages.ts:252`). The retry's backoff is a `setTimeout`
  (`core/gateway.ts:258`). The test's stub delays with `setTimeout` too (`test/helpers/stub-bedrock.ts:75`). Node's
  timers run on libuv's loop time, which is the monotonic clock, and `performance.now()` reads that clock.
- **The limit that timer gets is computed from the wall clock.** Each adapter's `complete()` takes
  `remaining = req.deadline - this.ctx.realNow()` and uses `Math.min(requestMs, remaining)`:
  `bedrock-converse.ts:266` to `:271`, `anthropic-messages.ts:245` to `:251`, `local-openai.ts:133` to `:146`. Here
  `realNow` is `Date.now` by default (`app.ts:220`), and `req.deadline` is `call.arrivedAt + deadlineMs`
  (`core/gateway.ts:1020`, `:1268`, `:1323`), epoch milliseconds on the real clock by contract (`core/types.ts:31`,
  "epoch milliseconds, real clock"; `core/gateway.ts:560`). The retry rule reads the same clock:
  `now() + policy.backoffMs + ctx.requestTimeoutMs <= req.deadline` (`core/gateway.ts:286`, `now` being
  `ctx.realNow ?? Date.now`, `:274`). A wall clock stepped back makes `remaining` read longer, so the limit stays the
  adapter's 4 s or 9 s, which is why the cuts held on the monotonic clock. A forward step would shorten the limit. That
  isn't what failed here, and this branch changes no gateway code; it's in the Backlog.
- The vitest runner's own duration for the case that read 8,363 ms was 10,205 ms (RED run 1, below), on the monotonic
  clock with the stack's setup in it. With the call itself measured on that clock (GREEN), every bound holds.

### Other tests of the same shape

Searched every test under `services/*/test`, `apps/*/test`, and the Python suites for an elapsed time on the wall
clock compared with a timer's length. None is left beyond this file:

- The gateway's other duration checks already read `performance.now()` (c0cd58d9 and after): the contract suite
  (`adapter-contract.ts:407`, `:655`, `:671` to `:682`), the adapters' error tests, the dispatcher, Telegram, the
  Anthropic transport and health tests, and the benches; so do the web's GLB timing checks (`glb.test.ts:147`, `:783`).
- `test/integration/adapter-calls.test.ts:370` to `:377` compares the audit row's stamp (the gateway's clock plus a
  day's test offset) with `Date.now()` before and after, within 1,000 ms either way. Both are instants on the wall
  clock and the slack is a second, not a timer's length; not the same shape, unchanged.
- `test/unit/clock.test.ts:132` checks `GatewayClock.realNow()` defaults to `Date.now`, which has to read the wall
  clock; a step back between its two reads could fail it, but the window is microseconds. Unchanged.
- `apps/web/test/lookdev/phone.test.ts:608`, a 10 s poll deadline on `Date.now()`: a step back only makes the wait
  longer. `apps/web/test/lookdev/metrics.test.ts` and `test/ui/talk-turns.test.ts` time on fake clocks.
- The Python tests time with `time.monotonic()`; none uses `time.time()` for a duration.

## Acceptance criteria

| ID | How this branch meets it |
|---|---|
| Spec 007's Clarification (spec.md:38): "9 s for twin turns (Recommended)", whose option read: "Twin turns on Bedrock or the Anthropic API get one attempt with a 9 s limit, which still fits the turn's 20 s deadline after local's 10 s; hello keeps 4 s for SC-005. Added to the fix branch with tests (a spec 000/007 amendment), then you rerun the two Bedrock runs." | its tests (plan.md's D43) unchanged in what they check: a visitor's turn the fallback answers at 6 s, hello cut at 4 s and retried, the admin call cut at 9 s after one attempt; now measured on the clock the cuts run on |
| SC-005 (spec 000) | hello's 4 s cut and retry, as before, its bounds unchanged |
| Spec 000's FR-041 (`make check`, every local gate) | the gateway's workspace passes whole again on this host, so `make test` reaches the web tests and pytest; with fix/009 stacked, `make lint` and `make test` pass whole, and `make check` fails `matrix` alone (E10 and E14, the environment's) |
| fix/009's own criteria (FR-018, FR-043, SC-014, User Story 7) | that branch's, as its note gives them; this branch changes none of its files |

## Constitution check

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local by default | No | No flow added or changed |
| II. Production-grade or not shipped | Yes | RED from the environment, GREEN five runs of five, `make lint`, `make test`, `make evals`, and `make check` pasted below |
| III. Intent before spec, spec before code, humans merge | Yes | A test edit by your answer, quoted above; plan.md's D43 updated in the same commit; you merge |
| IV. Least privilege | No | This session wrote nothing under `.claude/`, `tools/gates/`, `evals/agent-config/`, `assets/`, `corpus/`, `config/`, or `.specify/`, nor `CLAUDE.md` or `REVIEW.md`; no permission or sandbox change. The stack's `assets/` files are your intake, by your merge; nothing in the range touches the other paths |
| V. Cost is a first-class signal | No | $0; no model call |
| VI. Build in public | Yes | The runs and the clock reading are in this note |
| VII. Own the whole product | Yes | Your words quoted, not paraphrased |
| VIII. Honest AI | No | Nothing the twin says changes |
| Security and agent governance | Yes | This session reviews none of its own work (Review) |

## Review

A reviewer agent's `REVIEW.md` pass over this branch's own diff, `2423a5a6..2f3c18bb` (the clock fix, the plan's
sentence, and this note), from a session that wrote none of it, as the main session relayed it to this session. It
read only this branch's diff: `fix/009-avatars-ready` has its own review ("ready", in its note), and your stacking merge
adds nothing of its own. This session wrote this branch and reviews none of it.

- **Verdict:** "Verdict: ready. No Important findings", with four nits and a line for your `CLAUDE.md`. The review's
  full text wasn't relayed to this session; the nits below are in the relay's words where quoted, and summarized where
  not.
- **N1:** the gateway's durations, not only its deadlines, come from `Date.now()` differences, and the Backlog's
  wall-clock entry didn't say why a step back can't lengthen a cut. **Done:** a Backlog line names them
  (`core/gateway.ts:197`, `:201`, `:233`, into `gen_ai.client.operation.duration` unclamped at `:215` and `:240`;
  `hello.ts:121`, `:232`; `room-turn.ts:265`), and the wall-clock entry now says the cut stays at most `requestMs`.
  Gateway code, so not on this branch.
- **N2:** the Acceptance criteria cited D43 as a criterion, and FR-041 without its spec. **Done:** they quote spec
  007's Clarification (spec.md:38), "9 s for twin turns (Recommended)", with its option text, and name spec 000's
  FR-041.
- **N3:** the guard didn't hold the gated SHA to the reviewed tip, so a commit after the review could pass. **Done:**
  step 2's guard now also requires 2f3c18bb to be an ancestor of the gated SHA and nothing outside
  `docs/merge-requests/` to differ between them, the lines as the review gave them; this commit, the note alone, is
  the only one after it.
- **N4:** the test's header says "Here the committed file's values: Bedrock at 4 s with a retry on a timeout", but
  `config/routing.yaml:42` and `:59` retry paid adapters on `[rate_limited]` only. **Backlog:** a test-header edit,
  yours to allow; this session edits no test file without your OK, and the review's own pass is on the file as it is.
- **Feed-back:** a `CLAUDE.md` line, for your hand only, in For the Author ("For your CLAUDE.md"); the second time
  this has come up, after c0cd58d9 and then f1f1f197.

## Verification

All in `/tmp/claude-1000/wt-clock`, with the pinned Node (v24.21.0), after `npm ci --cache "$TMPDIR/npm-cache"`. RED
and GREEN are on the fix's own commit; `make lint`, `make test`, `make evals`, `make check`, the rehearsal, and
gitleaks are on the stacked tip, 6ee7a6de. The runs on 5ad8fcd2, before the stack, are kept at the end (Before the
stack).

### RED, then GREEN

RED: the file alone, as committed on `main` (ada55c98), five runs (`npx vitest run
test/integration/twin-paid-timeout.test.ts` in `services/gateway`); three failed, once on the 9 s case and twice on
the 6 s case, as the environment gives it:

```text
=== RED run 1 (23:06:05Z)
     × gives the Author's twin call on Bedrock one attempt, cut at 9 s 10205ms
 FAIL  test/integration/twin-paid-timeout.test.ts > a twin turn's one 9 s attempt on a paid adapter (spec 007's plan, D43) > gives the Author's twin call on Bedrock one attempt, cut at 9 s
AssertionError: expected 8363 to be greater than or equal to 9000
      Tests  1 failed | 2 passed (3)
=== RED run 2 (23:06:29Z)
      Tests  3 passed (3)
=== RED run 3 (23:06:54Z)
     × answers a visitor's turn that the paid fallback takes 6 s over 7581ms
AssertionError: expected 5424 to be greater than or equal to 6000
      Tests  1 failed | 2 passed (3)
=== RED run 4 (23:07:27Z)
     × answers a visitor's turn that the paid fallback takes 6 s over 7623ms
AssertionError: expected 5394 to be greater than or equal to 6000
 ❯ test/integration/twin-paid-timeout.test.ts:97:16
      Tests  1 failed | 2 passed (3)
=== RED run 5 (23:07:50Z)
      Tests  3 passed (3)
20 s timer: wall 19360 ms, monotonic 20021 ms, wall behind by 661 ms
```

GREEN: `timed()` on `performance.now()`, five runs of the file alone:

```text
=== GREEN run 1 (23:09:00Z)
 Test Files  1 passed (1)
      Tests  3 passed (3)
=== GREEN run 2 (23:09:23Z)
 Test Files  1 passed (1)
      Tests  3 passed (3)
=== GREEN run 3 (23:09:47Z)
 Test Files  1 passed (1)
      Tests  3 passed (3)
=== GREEN run 4 (23:10:12Z)
 Test Files  1 passed (1)
      Tests  3 passed (3)
=== GREEN run 5 (23:10:38Z)
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

### make lint

On 6ee7a6de, exit 0:

```text
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
460 files already formatted
```

followed by shellcheck over the repository's scripts, with no finding.

### make test

On 6ee7a6de, exit 0, all three suites:

```text
corpus-check: OK — 44 slots, 26 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems
npm test --workspaces --if-present
> @h4reet/gateway@0.1.0 test
 Test Files  95 passed (95)
      Tests  1652 passed | 13 skipped (1665)
   Duration  104.43s (tests 96%, import 2%, transform 1%)
> @h4reet/web@0.1.0 test
 Test Files  108 passed (108)
      Tests  2699 passed (2699)
   Duration  139.92s (tests 75%, import 23%, transform 2%)
pytest -q -p no:cacheprovider --import-mode=importlib corpus/tools evals redteam tools/gates deploy/scripts deploy/agents-engine scripts
4099 passed in 426.62s (0:07:06)
```

### make evals

On 6ee7a6de, with this note's rewrite unstaged, exit 0:

```text
evals product (fake): 187 passed, 0 failed
INFO (twin readiness): hobbies-and-travel: ready, its evidence at the running hashes
INFO (twin readiness): mission: ready, its evidence at the running hashes
INFO (twin readiness): work-projects: ready, its evidence at the running hashes
evals narration (fake): 44 passed, 0 failed
agent-config static: 0 failed, 0 planned
behavioral tier: 15 cases (11 enforcement, 4 conduct), 3 runs each; trigger hash 05cec03a74a5
WARN (behavioral tier): 2026-11-09T152345Z-feat-011-pa-anthropic-denies-09522968ea48, the newest run for trigger hash 05cec03a74a5, failed: conduct regressed against main's last entry 2026-11-08T151546Z-feat-007-p1-69ab1428d23d: held in 10 of 12 runs, against 11 of 12, over pastes-check-output, refuses-to-widen-allowlist, reviewer-reads-room-data, stays-on-branch
agent-config behavioral: fail, 0 planned
note: the behavioral tier's line is information in make evals, not a merge block (spec 006 FR-002): the gate's agent-config-evals step waits for a run only for a branch that changes CLAUDE.md, REVIEW.md, .claude/, or the Claude Code pin
PASS  every relative link resolves: 1830 links in 261 files
docs links: 0 failed, 1830 relative links in 261 files
```

### make check ENGINE_MODE=none-yet

On 6ee7a6de, with this note's rewrite unstaged, exit 2, `matrix` alone failing, on E10 and E14:

```text
secrets: PASS (unstaged changes, staged changes, 20 commits since main)
first visit (phase 3): 9,841,044 of 25,000,000 bytes · history: 25,459,087 of 500,000,000 bytes
arrival-check: 0 findings in 75 files (20 commits), 8 warnings
redteam: 68 passed, 0 failed
E10  FAIL  (from prove-limits.sh): E10   FAIL engine.sh reset leaves a new engine holding only the seeded images -- seen: engine.sh reset failed: engine.sh: not enough free space to seed: need 22 GiB on both the Windows drive and ext4; 19 of the 19 seeded
E14  FAIL  (from prove-limits.sh): E14   FAIL dev-cpu publishes on the host's 127.0.0.1 (ports 18300-18305); no answer on 18300 18301 18302 18303 18304 18305; the sandbox cannot reach them (stage S)
forbidden-actions (hook layer): 853 passed, 2 failed, 57 known gaps

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
WARN     evals  WARN (behavioral tier): 2026-11-09T152345Z-feat-011-pa-anthropic-denies-09522968ea48, the newest run for trigger hash 05cec03a74a5, failed: conduct regressed against main's last entry 2026-11-08T151546Z-feat-007-p1-69ab1428d23d: held in 10 of 1
PASS     redteam
FAIL     matrix
SKIP     image  no agents' engine yet: tasks.md T046
make check: 11 PASS, 1 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 1 FAIL; failing: matrix FAIL
```

Its `test` step: the gateway "95 passed (95)", "1652 passed | 13 skipped (1665)"; the web "108 passed (108)", "2699
passed (2699)"; pytest "4099 passed in 489.17s (0:08:09)". The eight arrival warnings are the intake's
`WARN assets/visitors/…` lines (spec 004's C1, the composite mark), as fix/009's note expects.

The first `make check` on 6ee7a6de (23:48Z to 23:55Z, with the host's load average near 22 on 24 cores while other
sessions ran) gave "10 PASS, 1 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 2 FAIL; failing: test FAIL, matrix FAIL". Its one
`test` failure was another gateway case, not this branch's file:

```text
 FAIL  test/integration/app.test.ts > graceful shutdown > lets a request in flight finish, then closes both listeners and the store
AssertionError: expected 503 to be 200 // Object.is equality
 ❯ test/integration/app.test.ts:525:24
 Test Files  1 failed | 94 passed (95)
      Tests  1 failed | 1651 passed | 13 skipped (1665)
```

That case gives a request 50 ms (a `setTimeout`) to reach its handler before it closes the server, and a server that
is closing answers 503; under that load the request came late. No wall clock is involved, and this branch doesn't touch
the file. It passed in both full `make test` runs, alone three runs of three ("Tests 18 passed (18)" each, 23:55Z to
23:56Z), and in the rerun above. It's in the Backlog.

### The rehearsal into refs/heads/main, and gitleaks

On 6ee7a6de, against `refs/heads/main` at ada55c98, read without moving a ref: `main` and `fix/009-avatars-ready`
are both ancestors of the tip, and `git merge-tree --write-tree refs/heads/main HEAD` writes the tip's own tree
(93481939, the same as `HEAD^{tree}`, and the tree this session had rehearsed for the stack before your merge), so the
merge writes exactly the tree the gate checks. Nothing in the range touches `tools/gates/`, `.claude/`,
`evals/agent-config/`, `corpus/`, `config/`, `.specify/`, `deploy/agents-engine/`, `CLAUDE.md`, or `REVIEW.md`.

`gitleaks dir` over that tree, a `git archive` export of 6ee7a6de with this note's rewrite copied in, with the gate's
flags (`--redact`, `--config` main's `.gitleaks.toml` shown into a scratch file, a fresh empty
`--gitleaks-ignore-path`, `--ignore-gitleaks-allow`, `--exit-code 99`), from inside the export, with no
`.gitleaksignore` at its root; its JSON report `[]`:

```text
5:10PM INF scanned ~50759261 bytes (50.76 MB) in 1.66s
5:10PM INF no leaks found
exit 0
```

The export and its scratch folder (`$TMPDIR/exp-clock-stacked`, `$TMPDIR/gl-clock2`) were deleted by name after.

### Before the stack (a63a74ea and b36576b2, on `main` alone)

These ran before your stacking merge, when the branch sat on `main` alone; `lint` and `test` failed there on `main`'s
own files, which the stack fixes. Kept as the record.

#### make lint

On a63a74ea, exit 2, at Prettier, on `main`'s four history files, which fix/009's F1 keeps from Prettier (ESLint and
tsc passed first; ruff and shellcheck come after Prettier, so they didn't run):

```text
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
[warn] evals/product/history/2026-11-09T175245Z-local.json
[warn] evals/product/history/2026-11-09T191058Z-bedrock.json
[warn] redteam/history/20261109T175353Z-local.json
[warn] redteam/history/20261109T191059Z-bedrock.json
[warn] Code style issues found in 4 files. Run Prettier with --write to fix.
make: *** [Makefile:222: lint] Error 1
```

The two files this branch changes, alone: `prettier --check` "All matched files use Prettier code style!", and
`eslint --max-warnings 0` on the test file, no output. This note, the same.

#### make test

On a63a74ea, exit 2. The gateway's workspace passes whole; the web workspace fails `main`'s own eight cases, fix/009's
F2 and F3; make stops there:

```text
corpus-check: OK — 44 slots, 26 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems
npm test --workspaces --if-present
> @h4reet/gateway@0.1.0 test
 Test Files  95 passed (95)
      Tests  1652 passed | 13 skipped (1665)
   Duration  103.27s (tests 96%, import 3%, transform 1%)
> @h4reet/web@0.1.0 test
 FAIL  test/room/chunk.test.ts > the release build > the room's bundle (FR-011) > puts the index, `room`, in the entry chunk, within 16,384 bytes at gzip level 9
 FAIL  test/room/chunk.test.ts > the drafts build > the room's bundle (FR-011) > puts the index, `room`, in the entry chunk, within 16,384 bytes at gzip level 9
 FAIL  test/room/chunk.test.ts > the release build > the room's bundle (FR-011) > puts the 3D part only behind the entry's dynamic import, beside the scene module, the digest with it
 FAIL  test/room/chunk.test.ts > the release build > room-manifest.json (Amendment B7) > is compose()'s manifest, its build_kind "release"
 FAIL  test/room/chunk.test.ts > the drafts build > room-manifest.json (Amendment B7) > is compose()'s manifest, its build_kind "drafts"
 FAIL  test/room/chunk.test.ts > the drafts build > the room's bundle (FR-011) > puts the 3D part only behind the entry's dynamic import, beside the scene module, the digest with it
 FAIL  test/room/dist.test.ts > the site's release build (contracts/room-bundle.md §14) > holds no † field's value and no pending line of the committed data, in any file
 FAIL  test/room/dist.test.ts > the site's drafts build (contracts/room-bundle.md §14) > holds no † field's value and no pending line of the committed data, in any file
 Test Files  2 failed | 105 passed (107)
      Tests  8 failed | 2685 passed (2693)
npm error workspace @h4reet/web@0.1.0
make: *** [Makefile:246: test] Error 1
```

pytest, run alone as `make test` runs it (`pytest -q -p no:cacheprovider --import-mode=importlib corpus/tools evals
redteam tools/gates deploy/scripts deploy/agents-engine scripts`, with `--tb=line`):

```text
4095 passed in 481.54s (0:08:01)
exit 0
```

The web workspace on the rehearsed stack (tree 98582d5a, a `git archive` export, `npm ci` there), `npm test -w
apps/web`, exit 0:

```text
 Test Files  108 passed (108)
      Tests  2699 passed (2699)
```

#### make evals

On a63a74ea, exit 0:

```text
evals product (fake): 187 passed, 0 failed
INFO (twin readiness): hobbies-and-travel: ready, its evidence at the running hashes
INFO (twin readiness): mission: ready, its evidence at the running hashes
INFO (twin readiness): work-projects: ready, its evidence at the running hashes
evals narration (fake): 44 passed, 0 failed
agent-config static: 0 failed, 0 planned
behavioral tier: 15 cases (11 enforcement, 4 conduct), 3 runs each; trigger hash 05cec03a74a5
WARN (behavioral tier): 2026-11-09T152345Z-feat-011-pa-anthropic-denies-09522968ea48, the newest run for trigger hash 05cec03a74a5, failed: conduct regressed against main's last entry 2026-11-08T151546Z-feat-007-p1-69ab1428d23d: held in 10 of 12 runs, against 11 of 12, over pastes-check-output, refuses-to-widen-allowlist, reviewer-reads-room-data, stays-on-branch
agent-config behavioral: fail, 0 planned
note: the behavioral tier's line is information in make evals, not a merge block (spec 006 FR-002): the gate's agent-config-evals step waits for a run only for a branch that changes CLAUDE.md, REVIEW.md, .claude/, or the Claude Code pin
PASS  every relative link resolves: 1823 links in 259 files
docs links: 0 failed, 1823 relative links in 259 files
```

#### make check ENGINE_MODE=none-yet

On b36576b2 (a63a74ea and this note's first draft), with this note's later edits unstaged, exit 2. Its `lint` and
`test` failed on `main`'s files exactly as above (the gateway "95 passed (95)", "1652 passed | 13 skipped (1665)"; the
web "8 failed | 2685 passed (2693)"); `matrix` on E10 and E14 alone:

```text
E10  FAIL  (from prove-limits.sh): E10   FAIL engine.sh reset leaves a new engine holding only the seeded images -- seen: engine.sh reset failed: engine.sh: not enough free space to seed: need 22 GiB on both the Windows drive and ext4; 19 of the 19 seeded imag
E14  FAIL  (from prove-limits.sh): E14   FAIL dev-cpu publishes on the host's 127.0.0.1 (ports 18300-18305); no answer on 18300 18301 18302 18303 18304 18305; the sandbox cannot reach them (stage S)
forbidden-actions (hook layer): 853 passed, 2 failed, 57 known gaps
-> FAIL matrix
secrets: PASS (unstaged changes, staged changes, 2 commits since main)
arrival-check: 0 findings in 37 files (2 commits)
redteam: 68 passed, 0 failed

PASS     makefiles-check
PASS     githooks-check
PASS     toolchain-check
PASS     policy
PASS     validate-config
FAIL     lint
FAIL     test
PASS     content-check
PASS     secrets
PASS     arrival
WARN     evals  WARN (behavioral tier): 2026-11-09T152345Z-feat-011-pa-anthropic-denies-09522968ea48, the newest run for trigger hash 05cec03a74a5, failed: conduct regressed against main's last entry 2026-11-08T151546Z-feat-007-p1-69ab1428d23d: held in 10 of 1
PASS     redteam
FAIL     matrix
SKIP     image  no agents' engine yet: tasks.md T046
make check: 9 PASS, 1 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 3 FAIL; failing: lint FAIL, test FAIL, matrix FAIL
```

#### The rehearsal into refs/heads/main, and gitleaks

On b36576b2, against `refs/heads/main` at ada55c98, read without moving a ref: `main` is an ancestor of the tip, and
`git merge-tree --write-tree refs/heads/main HEAD` writes the tip's own tree (0be849b3, the same as `HEAD^{tree}`), so
the merge writes exactly the tree the gate checks. Against `main` the branch changes three files, none under
`tools/gates/`, `.claude/`, `evals/agent-config/`, `assets/`, `corpus/`, `config/`, `.specify/`, `CLAUDE.md`, or
`REVIEW.md`. `gitleaks dir` over that tree, a `git archive` export of b36576b2 with this note copied in, with the gate's
flags (`--redact`, `--config` main's `.gitleaks.toml` shown into a scratch file, a fresh empty
`--gitleaks-ignore-path`, `--ignore-gitleaks-allow`, `--exit-code 99`), from inside the export, with no
`.gitleaksignore` at its root; its JSON report `[]`:

```text
4:32PM INF scanned ~40196517 bytes (40.20 MB) in 2.23s
4:32PM INF no leaks found
exit 0
```

The stack, rehearsed the same way: `git merge-tree --write-tree --name-only refs/heads/fix/009-avatars-ready a63a74ea`
exits 0 with tree 98582d5a and no conflicted file; its export is the one the web tests and Prettier ran on above. The
exports and scratch folders (`$TMPDIR/exp-clock-stack`, `$TMPDIR/exp-clock-final`, `$TMPDIR/gl-clock`) were deleted
by name after.

## Cost and data-flow impact

- **Model spend: $0.** No model call; this session's work is on the Claude Team plan.
- **The visitor's bytes:** unchanged; nothing the site or the gateway sends changes.
- **Data flow: none new,** so no new row in `docs/data-flow-disclosure.md`.

## Backlog

- **The gateway's deadline arithmetic is on the wall clock** (What changed, the gateway's clocks): each adapter's
  `remaining = req.deadline - realNow()` and the retry rule's `now() + backoff + request timeout <= deadline`. A
  forward step of the wall clock mid-request would cut an attempt short or skip a retry it had time for; a step back
  does neither, because the cut is `Math.min(requestMs, remaining)` and so stays at most `requestMs` however long
  `remaining` reads. A step back can instead let a call run past its deadline by up to the step, with a retry it had
  less time for than it read. The deadline is epoch milliseconds by contract (provider-adapter.md §2.1), so a change
  would pair it with a monotonic twin, as the contract suite's C10 does in the tests. A spec 000 question for a later
  branch, not a blocker.
- **The gateway's durations are wall-clock differences too** (Review, N1): an attempt's `startedAt` and `endedAt` are
  `now()` (`services/gateway/src/core/gateway.ts:197`, `:201`, `:233`), and their difference feeds
  `gen_ai.client.operation.duration` unclamped (`:215`, `:240`); the routes' latencies are `realNow() - arrivedAt`
  (`routes/hello.ts:121`, `:232`; `routes/room-turn.ts:265`), clamped at 0. A wall-clock step inside a call makes them
  read short, and the unclamped histogram can receive a negative value. Gateway code, for a later branch: time
  durations on `performance.now()`, as this branch does in its test.
- `test/unit/clock.test.ts:132`'s two `Date.now()` reads around `realNow()` (Other tests): a microsecond window, left
  as it is.
- `services/gateway/test/integration/app.test.ts:520` to `:525`, graceful shutdown: the 50 ms wait before `close()`
  is a race with the request's arrival, which a heavily loaded host lost once (Verification, make check). Waiting for
  the request to reach the `/slow` handler, rather than for a fixed 50 ms, would remove it. A test edit, so yours to
  allow; not a blocker, since it passed every other run.
- **The timing test's header** (Review, N4): `twin-paid-timeout.test.ts`'s header says "Here the committed file's
  values: Bedrock at 4 s with a retry on a timeout", but `config/routing.yaml:42` and `:59` retry paid adapters on
  `[rate_limited]` only; the test's own routing fixture is what retries on a timeout. A test-header edit, yours to
  allow.

## For the Author

1. **One gate on this tip brings both branches** (Status): your stacking merge, 6ee7a6de, put `fix/009-avatars-ready`
   in it, so don't gate or merge that branch on its own.
2. **Your answer is the authority for the test edit,** quoted above in your words; the bounds are yours from D43,
   unchanged.
3. **The gateway's wall-clock deadline arithmetic** (Backlog) is a question for spec 000 when you want it; nothing
   failed from it here.
4. **The order:** steps 1 to 6 above; then the cleanup, after the merge: `git worktree remove
   /tmp/claude-1000/wt-clock`, and fix/009's own, `/tmp/claude-1000/wt-avfix` and `/tmp/claude-1000/wt-intake009`, as
   its note says.
5. **For your CLAUDE.md,** by your hand only (the review's feed-back line; the second time this has come up, after
   c0cd58d9 and then f1f1f197), under "Things Claude gets wrong":

   ```text
   - Timing a duration with Date.now(). Elapsed time, in tests and code, reads performance.now(); Date.now() is for instants (this host's wall clock steps).
   ```
