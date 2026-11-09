# fix/007-steady-clock-test

Spec: [specs/007-twin-conversation/](../../specs/007-twin-conversation/), its
[plan.md](../../specs/007-twin-conversation/plan.md)'s D43 · Intent: none · Written by: implementer subagent (Claude
Opus 5.5), for the main session · Date: 2026-11-09

Session: the main session started from `/home/h4reet/h4reet-ai/h4reet-ai`. This branch's worktree is
`/tmp/claude-1000/wt-clock`, which the main session created from `main` at ada55c98. Repo hooks active: yes. In
`.claude/audit/hooks.log`, this session's events in `wt-clock` from 2026-11-09T23:04Z were ALLOW, among them its
`git --no-replace-objects merge refs/heads/fix/009-avatars-ready` at 23:11:12Z (Status). The BLOCK at 23:11:39Z
("redirecting git hooks or config", in `wt-switch`) is another session's.

Authorized by: your decision of 2026-11-09, answering "How should we get your gates passing?": "Fix the test
(Recommended)", whose description read: "A small branch that makes the timing test measure with the same steady clock
the gateway's timers use (performance.now() in place of Date.now()). It's an edit to a test file, so your OK is
needed." That answer is the authority for editing a test file here. This isn't a fix task in the `FIX_TASK` sense: no
gateway code changes, and the test's bounds are as they were.

## Status

STATUS_PLACEHOLDER

## Runs in your terminal

Nothing paid, and no `--prove` or behavioral tier: the gate's stage E waits for `--prove` only when a branch touches
`deploy/agents-engine/` or `.claude/settings.json` (`stage_e`: "the branch touches neither deploy/agents-engine/ nor
.claude/settings.json"), and its behavioral tier runs only for `CLAUDE.md`, `REVIEW.md`, `.claude/`, or the Claude Code
pin (`agent_config_evals`: "the branch touches none of the triggers"). Against `main` (ada55c98), this branch touches
`services/gateway/test/integration/twin-paid-timeout.test.ts`, `specs/007-twin-conversation/plan.md`, and this note.
No step runs git in an agent's worktree. If `main` moves before the gate, the guard says `no`: tell the session, which
merges `main` into the branch.

1. **The gate, from main's checkout:**

   ```bash
   cd ~/h4reet-ai/h4reet-ai
   git --no-replace-objects switch main
   b=fix/007-steady-clock-test
   log=~/gate-clock.log
   tools/gates/gate "$b" 2>&1 | tee "$log"
   ```

   Expect Ready, with `evals` WARN (the behavioral tier's advisory line). With any FAIL, don't merge, and tell the
   session.

2. **The guard.** It goes only if the gate printed its merge line, your checkout is on `main`, the branch is at the SHA
   the gate checked, and `main` has nothing that SHA lacks:

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
   echo "guard: $ok"
   ```

3. **The merge, only after `guard: go`,** the gate's merge line rebuilt from its log:

   ```bash
   m="Merge $b (${sha:0:12})"
   o=(--no-replace-objects merge --no-ff)
   o+=(-m "$m" -m "$s")
   [ "$ok" = go ] && git "${o[@]}" "$sha"
   ```

STEPS_AFTER_PLACEHOLDER

## What changed and why

`services/gateway/test/integration/twin-paid-timeout.test.ts` (D43, on `main` since 330bfe0b) timed its three cases
with `Date.now()` in its `timed()` helper and held each to at least the gateway's cut: 6 s for the stub's delay on a
visitor's turn, 4 s for hello's first attempt, 9 s for the Author's admin twin call. Those cuts run on the monotonic
clock; `Date.now()` reads the wall clock, which on this WSL host has been stepped back since about 15:35 today
(Hyper-V's time sync, with the kernel's `tick` moving, as the main session measured). A 20-second Node timer read 20,021
ms on `performance.now()` and 19,360 ms on `Date.now()`, the wall clock 661 ms behind, so the test read the cuts short
and failed, and `make test`, which stops at the gateway's workspace, never ran the web tests or pytest.

The one change: `timed()` reads `performance.now()` at the start and the end. Every assertion's bound is as it was, and
nothing else in the file moved. Spec 007's plan.md, D43's row, gets one sentence saying the three cases time the call
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
- The vitest runner's own duration for the case that read 8,363 ms was 10,205 ms (RED run 1, below): the 9 s cut held.

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
| Spec 007's D43, its tests | unchanged in what they check: a visitor's turn the fallback answers at 6 s, hello cut at 4 s and retried, the admin call cut at 9 s after one attempt; now measured on the clock the cuts run on |
| SC-005 (spec 000) | hello's 4 s cut and retry, as before, its bounds unchanged |
| FR-041 (`make check`, every local gate) | the gateway's workspace passes whole again on this host, so `make test` reaches the web tests and pytest |

## Constitution check

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local by default | No | No flow added or changed |
| II. Production-grade or not shipped | Yes | RED from the environment, GREEN five runs of five, `make lint`, `make test`, `make evals`, and `make check` pasted below |
| III. Intent before spec, spec before code, humans merge | Yes | A test edit by your answer, quoted above; plan.md's D43 updated in the same commit; you merge |
| IV. Least privilege | No | Nothing under `.claude/`, `tools/gates/`, `evals/agent-config/`, `assets/`, `corpus/`, or `config/` written; no permission or sandbox change |
| V. Cost is a first-class signal | No | $0; no model call |
| VI. Build in public | Yes | The runs and the clock reading are in this note |
| VII. Own the whole product | Yes | Your words quoted, not paraphrased |
| VIII. Honest AI | No | Nothing the twin says changes |
| Security and agent governance | Yes | This session reviews none of its own work (Review) |

## Review

None yet. A reviewer agent's `REVIEW.md` pass, from a session that wrote none of this, goes here.

## Verification

All in `/tmp/claude-1000/wt-clock`, with the pinned Node (v24.21.0), after `npm ci --cache "$TMPDIR/npm-cache"`.

### RED, then GREEN

RED: the file alone, as committed on `main` (ada55c98), five runs (`npx vitest run
test/integration/twin-paid-timeout.test.ts` in `services/gateway`); three failed, each on a different case or bound,
as the environment gives it:

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

VERIFICATION_PLACEHOLDER

## Cost and data-flow impact

- **Model spend: $0.** No model call; this session's work is on the Claude Team plan.
- **The visitor's bytes:** unchanged; nothing the site or the gateway sends changes.
- **Data flow: none new,** so no new row in `docs/data-flow-disclosure.md`.

## Backlog

- **The gateway's deadline arithmetic is on the wall clock** (What changed, the gateway's clocks): each adapter's
  `remaining = req.deadline - realNow()` and the retry rule's `now() + backoff + request timeout <= deadline`. A
  forward step of the wall clock mid-request would cut an attempt short or skip a retry it had time for; a step back
  does neither. The deadline is epoch milliseconds by contract (provider-adapter.md §2.1), so a change would pair it
  with a monotonic twin, as the contract suite's C10 does in the tests. A spec 000 question for a later branch, not a
  blocker.
- `test/unit/clock.test.ts:132`'s two `Date.now()` reads around `realNow()` (Other tests): a microsecond window, left
  as it is.

## For the Author

FOR_AUTHOR_PLACEHOLDER
