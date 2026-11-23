# fix/036-flaky-tests

Spec: specs/036-flake-proof-gates/ (on `feat/036-flake-proof-gates`, in the same stack: its intent's first outcome, "The known flaky tests are deterministic", and spec.md's note that the three flaky tests are this branch's) · Intent: specs/036-flake-proof-gates/intent.md · Written by: Claude Code (a subagent of the Author's session) · Date: 2026-11-23
Session: /tmp/claude-1000/wt-flaky (worktree of /home/h4reet/h4reet-ai/h4reet-ai) · Repo hooks active: yes (the bash gate refused the first commit while the Author's checkout was on main, and took it once he parked the checkout on `wip-park/11-23-0950`; the post-edit lint, gitleaks and arrival-check hooks ran on every edit and commit)
Authorized by: the Author's approval of 2026-11-23, quoted under "Deviation, with the Author's approval"

## What changed and why

The three tests that failed the Author's gates today, the timeouts behind a loaded `make check`, and the gateway's
other bounds of the same shape. No product code changes: in each case the fault was in a test or in the tests'
configuration, and the code under test was already right. Each section gives the cause, where the fix went and why,
and its proof. Mutations and scratch copies named below were run and then removed; none is committed.

### 1. The probe's cleanup (`deploy/night-shift/tests/test_container_probe.py`)

`test_it_removes_its_containers_and_networks` failed on `stack/2026-11-23` with `['h4-cprobe-egress-cojyrk']`.

- **Cause:** the tests' stand-in docker, `stub_docker.py`. Its `rm` and `stop` dropped every all-digit argument as an
  option's value (for `stop -t 60`). It names a detached container by the first 12 hex digits of a SHA-256 of its name
  and sequence number, and the gate's run (folder `h4-cprobe.cojyrk`) gave the egress proxy `504080177739`. The
  probe's `docker rm -f 504080177739` then removed nothing. A 12-digit hex ID is all digits with probability
  (10/16)^12, about 1 in 281 per container. The module makes three (two in the success run, one in the failure run),
  so about one module run in 94 failed.
- **Fix in the test's stub, not the probe:** real docker removes a container by an all-digit ID. The probe's cleanup
  (`docker ps -aq --filter label=… | xargs -r docker rm -f`) runs in its EXIT trap after `main | redact | tee` has
  ended, so the probe returns only after it: nothing raced. The stub's `rm` and `stop` now skip only the value of an
  option that takes one (`-t`, `--time`, `--timeout`, `-s`, `--signal`), as docker reads them.
- **Proof:** RED `e40b3585` replays the gate's run: a `mktemp` on the probe's PATH names its folder
  `h4-cprobe.cojyrk`. It failed as the gate did, `assert not ['h4-cprobe-egress-cojyrk']`. GREEN `96ea4705` fixes
  the stub without touching that test. The probe's and the install's tests (they share the stub): 91 passed. Review 5
  (`d759dc9d`) adds that the cleanup's `docker rm` carried `504080177739`, so the replay can't pass without its case.

### 2. FR-028's "at once" (`services/gateway/test/integration/dispatcher-forms.test.ts`)

"sends the plain text at once, in the same attempt, when it answers 400 as a 200 whose error_code is 400" failed on
`ops/apply-records-2026-11-23` with `expected 51.50356800000009 to be less than 50`.

- **Cause:** a wall-clock bound. The test measured 50 ms on the Telegram stub's clock, from its answer to the
  designed send to the plain request's arrival. Load stretches that window (two loopback hops, a log line, a metric)
  without the dispatcher adding any wait.
- **Fix in the test:** FR-028 says "A fallback SHALL add no wait: the plain send SHALL follow at once". The dispatcher
  does that: `attemptForms` awaits nothing between the two sends. The rig now sends through the real `sendTelegram`,
  traced. The assertion is that the plain send starts before the event loop turns once after the refusal's answer
  reached the dispatcher (`[null, false]`). A timer, an I/O wait or a later tick between the sends would each turn
  the loop first. The attempt counting once (`telegram_attempts: 1`, `alert.fallback`'s `attempt: 1`) and both sends
  in one `tick()` are asserted as before.
- **Proof:** a 1 ms `setTimeout`, or a `setImmediate`, before the plain send fails the new test (`[null, true]`), and
  the old bound passed the 1 ms one. 60 ms of synchronous work in the window (the fallback's log line made slow, as
  load makes it) fails the old test with 65.5 ms and 64.5 ms and passes the new one. Both cases ran 20 times under 48
  CPU burners on 24 CPUs, all passed. The old test also passed 20 runs under the burners, so they alone didn't
  reproduce the gate's 51.5 ms. The slow log line reproduces it deterministically.

### 3. The gateway's other bounds of that shape

The gateway's and the relay's other wall-clock bounds were checked too. The relay has none. In the gateway, these can
fail on a slow machine, and now hold without the clock:

| Test | Was | Now |
| --- | --- | --- |
| `local-openai.errors`: the connect watchdog's two tests | `ms < 3_000`; failed on 2026-11-11 (`feat/016`) at 4,201 ms | the error is the watchdog's (`unavailable`, `ETIMEDOUT`; the 10 s request timeout's is a `timeout`, and due timers run in the order they fell due); a spy shows `setTimeout` armed for `connect_ms` before the event loop turns once (review 4); `ms >= 900` stays |
| `local-openai.errors`: a DNS failure, two codes | `ms < 500` | ends before the event loop turns once; the code is the lookup's own |
| `adapter-contract` C10, direct branch (the synthetic adapter) | `< 100` ms | ends before the event loop turns once |
| `telegram.test`: a lookup that never answers | `ms < 2_000` | the error is the deadline's (`timeout`); the spy shows it armed for `timeoutMs` before the loop turns once; `ms >= 250` stays |
| `anthropic-transport.test`: the connect watchdog | `< 2_000` ms | `ETIMEDOUT` unreached, the watchdog's own error; the spy shows it armed for `connectMs` before the loop turns once |
| `bedrock-converse.errors`: health, a chain that never answers | `< 1_000` ms after a 200 ms signal | the probe's signal is aborted by hand; the check is still waiting before it and ends before the loop turns after it |

**Proof:** each new test fails on a mutation that adds the fault it guards against, and the old bounds passed several
of these mutations:

- a watchdog at 2 s ("expected [ 2000 ] to include 1000", which the 3 s bound passed);
- a 1 ms timer before a lookup's error settles (which `< 500` passed);
- a 1 ms timer in the synthetic adapter's `complete()`;
- a doubled Telegram deadline and a doubled transport watchdog (which the 2 s bounds passed);
- a 1 ms timer in Bedrock's `settleBy` abort.

A 2.5 s stall of the event loop as the call starts fails the old watchdog bound with 3,507 ms, as on 2026-11-11, and
passes the new tests. The changed tests' 20-run results under load are under Verification.

Left as they are, with their margins (the backlog below):

- the micro-benchmarks: render 0.006 ms against 2.5, adapter overhead about 0.02 ms against 5, the twin at most 3 ms a
  turn against 20 (the whole test took 181 ms for 60 turns);
- bounds of 1 s or more past the expected time: C3, and C10's stub branch (already widened by T157),
  `anthropic-messages.errors`, `anthropic-health`, `dispatcher.test`, `twin-paid-timeout`;
- `clock.test`'s `before <= now <= Date.now()`, which reads the wall clock twice.

### 4. The twin's still in 2D (`apps/web/test/room/twin-2d.test.ts`)

"is fetched once, same-origin with its integrity, and drawn as a data: image, clipped, the drawing hidden"
(`expected undefined to be 'data:image/png;base64,iVBORw0KGgoAAAA…'`) and "refuses bytes that fail their integrity:
the drawing, never the image" (`expected undefined to deeply equal { kind: 'picture', …(3) }`) failed on the same
branch's rerun.

- **Cause:** a fixed number of event-loop turns. The tests gave `fetchStill` forty `flush()`es, 200 `setImmediate`
  turns, to settle. `fetchStill` checks the bytes with `crypto.subtle.digest`, which Node runs on libuv's threadpool.
  Under load those threads wait for a CPU while the main thread spins through its turns in milliseconds. The
  integrity test failed five of the Author's gates from 11-11 to 11-23 (the logs `gate-feat016`, `gate-reh`,
  `gate-w1`, `gate-017-2` and today's `gate.log`), and the first test failed with it today.
- **Fix in the test:** `renderFlat` signals the twin's picture once the fetch has settled, after drawing the image,
  and that signal is what the room's line slot reads. The code doesn't depend on timing. `stage()` now returns a
  promise of that signal, and the three tests await it instead of counting turns, each within 30 s (review 3). The
  integrity case also asserts its two tries and its one signal.
- **Proof:** in a scratch copy with libuv's four threads held by `pbkdf2` jobs, the old file fails the gate's two
  tests with the gate's two messages, and the new file passes all five. Under 48 burners the old file failed the
  first test with the gate's message within 20 repeats, and the new file passed all five tests, 20 runs each.

### 5. The web suite's timeouts under load (`apps/web/vitest.config.ts`)

- **Cause:** a timeout below the slowest legitimate test under load. 130 of the web's test files compose the
  repository's room once each (`repositoryBundle`, once a file, since vitest isolates modules per file), as they load
  or in a first test. One compose takes about 21 s of CPU on its own (measured: 21.3 s; a second one in the same
  process 9.6 s). In today's gate, with only the suite's own 23 workers (vitest's default on 24 CPUs), tests doing
  that work took 29 to 47 s. The 60 s timeout left them 1.3 times the slowest, so other load tipped first tests over
  it. `gate-off.log` (2026-11-12) lost 14 first tests, every one composing the room, and the session's loaded
  `make check` about 15.
- **Ruled out:** memory (about 395 MB a worker on 62 GB), and the global setup. It builds the site twice a run, before
  any test file, outside every timeout. The worker count is vitest's default, and lowering it would lengthen every
  unloaded gate.
- **Fix in config:** `testTimeout` 180 s (about four times the slowest; a hung test still fails, at 180 s) and
  `hookTimeout` 360 s (twice the tests', as before), with the reason in the file.
- **Proof:** the full web suite under 24 burners, under Verification.

## Acceptance criteria

Intent 036's first outcome: "The known flaky tests are deterministic. They prove the same behavior without racing
wall clocks, cleanup, or load." Each changed test still proves its claim (spec 017's cleanup; spec 011's FR-026 and
FR-028; spec 016's FR-034 and FR-035; provider-adapter.md §2.5 and §3.1; C10). None bounds a duration from above on
the wall clock. The two lower bounds kept (`ms >= 900`, `ms >= 250`) can only be met more easily under load.

## Constitution check

- **Development Workflow 4, "Bug fixes start from a failing test the agent may not edit":** the probe's fix did
  (RED `e40b3585`, untouched by GREEN `96ea4705`). In the other cases the failing test was the fault. Each kept its
  claims, and is stricter where the old one leaned on time. Each new assertion was shown failing on a mutation that
  adds the fault it guards against. Where the old one was made to fail (a held threadpool, a slow synchronous step, a
  stalled event loop, CPU burners), the new one passed. The code under test is unchanged.
- **Development Workflow 2 and 3 (spec and plan before code):** spec 036 (`specs/036-flake-proof-gates/`, on
  `feat/036-flake-proof-gates`) covers this branch: its intent's first outcome is "The known flaky tests are
  deterministic", and its spec.md leaves the three tests to this branch. Its other outcomes (the gate's one retry, the
  docs-only fast path, the release exception) are that branch's.
- **"Prohibited without a human: … editing test files during a fix task", a deviation:** this is a fix task that edits
  test files, under the Author's approval, quoted in the next section.
- **Gates stay honest:** no retry, skip or tolerance was added. Nothing that fails is reported as passing. A test
  that hangs still fails.
- No secret, no network, no model call, no AWS resource.

## Deviation, with the Author's approval

The constitution's Security & Agent Governance lists "editing test files during a fix task" as "Prohibited without a
human". On 2026-11-23 the Author's session proposed: "Fix the three flaky tests. Use fake or steady clocks instead of
wall-clock bounds, wait for the probe's cleanup instead of racing it, and isolate twin-2d's load sensitivity. This is
ordinary agent work on a small branch, and can run now in parallel with the push." The Author approved it: "Yes,
let's get those in there before we do c2. We are exhausted of this process and want to fix it now rather than in the
future". Spec 036's Assumptions record the same deviation.

The eight existing test files this branch edits:

- the three named tests:
  - `deploy/night-shift/tests/test_container_probe.py`;
  - `services/gateway/test/integration/dispatcher-forms.test.ts`;
  - `apps/web/test/room/twin-2d.test.ts`;
- five beyond them, the gateway's other wall-clock bounds of the same shape (§3), which go past the three named
  tests under that approval:
  - `services/gateway/test/contract/local-openai.errors.test.ts`;
  - `services/gateway/test/contract/adapter-contract.ts`;
  - `services/gateway/test/unit/telegram.test.ts`;
  - `services/gateway/test/unit/anthropic-transport.test.ts`;
  - `services/gateway/test/contract/bedrock-converse.errors.test.ts`.

Beside them it edits the probe's tests' stub, `deploy/night-shift/tests/stub_docker.py` (the first test's fix), and
`apps/web/vitest.config.ts`. It also adds one test helper, `services/gateway/test/helpers/armed-timers.ts` (the
review's finding 4).

## Review

By a reviewer agent that wrote none of the branch, on `0e213f80`: **changes required**, one procedural blocker.
Technically sound: each test still proves its requirement, and in all five cases the faults were in tests, the stub,
and the config. Each finding, and the commit that answers it:

1. **[Blocker, compliance]** "Spec: none" (REVIEW.md: "A diff without a linked spec is a blocking finding"), and
   eight existing test files edited in a fix task. Answered in this note's commit: spec 036 linked, and the deviation
   with the Author's approval, in his words, with the eight files.
2. **[Should-fix]** Spec documents still named the removed bounds as the proof. `cea8d7a5`: dated departures in spec
   011's plan.md (Performance Goals) and tasks.md T007, and in provider-adapter.md §5.3 (C10's direct variant).
3. **[Nit]** twin-2d's waits on the signal were bounded only by the 180 s timeout. `776347eb`: `SIGNAL_MS`, 30 s, on
   the three tests. With the signals removed, each fails at 30 s.
4. **[Nit]** The spies proved each timer's length, not when it was armed. `9a14c98a`: the local watchdog, Telegram's
   deadline and the transport's watchdog are each armed before the event loop turns once
   (`test/helpers/armed-timers.ts`). With the arming put off by one `setImmediate`, the old assertions pass and the
   new ones fail.
5. **[Nit]** The probe's replay never checked that the stub used `504080177739`. `d759dc9d`: a `docker rm` call
   carried that ID. With the stub's IDs made another way, the old replay passes and the new assertion fails.
6. **[Nit]** `git switch -c $B main` after a guard on `refs/heads/main`. Answered in this note's commit: `"$R"`.

## Verification

From the worktree, on this branch's commits (the tree the gate gets). Load is 48 (or 24) CPU-burning Python loops
beside the run, on the 24-CPU host. vitest's `--repeats 19` runs a test 20 times.

**Two Nodes.** The agents' sandbox runs Node 22.18.0; the devcontainer, and so the gate, pins 24.21.0
(`.devcontainer/Dockerfile`). The proofs above and the first runs below are on 22. The changed tests were run again on
24 (from `~/.nvm`), and so were the gateway's and the web's suites. The night shift's are Python.

On Node 22.18.0:

- The probe's file, 20 runs in a row with no burners, then 20 under 48: 20 of 20 and 20 of 20 passed
  (`10 passed in 9.57s` each).
- The changed gateway tests, 20 runs each under load: dispatcher-forms' two cases, the local adapter's four, and C10
  under 48 burners; the Telegram, transport and Bedrock cases under 24 of their own while the probe's ran (load
  average 40 at the start, 45 at the end). All passed.
- twin-2d, all five tests, 20 runs each under 48 burners: all passed.
- The night shift's tests (`deploy/night-shift/tests`): `793 passed in 271.05s (0:04:31)`.
- The gateway's (`npx vitest run`): `Tests  1757 passed | 13 skipped (1770)`.
- apps/web's (`npx vitest run`, with the global setup): `Tests  1 failed | 5030 passed | 6 skipped (5037)`. Under 24
  burners: the same counts in 865 s, and no test timed out (the 60 s limit had lost 14 in the gate of 2026-11-12).
  twin-2d passed in both. The one failure, both times, is `pet-bench.test.ts` > "the wired twin (T014)" > "adds no
  allocation and under 0.1 ms a frame to the controller's frame": `hot function 1 optimized before the measure:
  expected false to be true`. It also fails alone and idle on Node 22, and passes on 24 (below), and passed in your
  gate today: it's V8's tiering on the sandbox's Node, not load and not this branch.
- `make -f Makefile lint`: exit 0. eslint `--max-warnings 0`, tsc for the three workspaces, `All matched files use
  Prettier code style!`, ruff `All checks passed!`, `995 files already formatted`, shellcheck clean.

On Node 24.21.0, the gate's:

- The gateway's: `Tests  1757 passed | 13 skipped (1770)`.
- The ten changed gateway tests, 20 runs each under 48 burners: all passed.
- twin-2d, all five tests, 20 runs each under 48 burners: all passed. pet-bench's two files: `6 passed`.
- apps/web's (`npx vitest run`, with the global setup): `Test Files  289 passed (289)`,
  `Tests  5031 passed | 6 skipped (5037)`, in 535.74 s.

After the review, on `cea8d7a5` (this note's commit changes only the note), each change's own proof is under Review.
Then the touched suites:

- The night shift's tests: `793 passed in 251.60s (0:04:11)`.
- The gateway's, on Node 24.21.0: `Tests  1757 passed | 13 skipped (1770)`.
- apps/web's, on Node 24.21.0, with the global setup: `Test Files  289 passed (289)`,
  `Tests  5031 passed | 6 skipped (5037)`.
- `make -f Makefile lint`, on the tree with this note: exit 0 (eslint `--max-warnings 0`, tsc, `All matched files use
  Prettier code style!`, ruff `All checks passed!`, `995 files already formatted`, shellcheck clean).

## Cost and data-flow impact

None.

## For the Author

1. **One gate with the apply records and spec 036.** `ops/apply-records-2026-11-23` (`52c0b1c2`) touches only
   `docs/infra/applies/` and its note. `feat/036-flake-proof-gates` holds the spec this note links, and its own note
   gives its patch's steps. All three sit on main `42019d3d` and touch disjoint files. From your checkout:

   ```bash
   M=42019d3d8cd1
   R=$(git rev-parse refs/heads/main)
   [ "${R:0:12}" = "$M" ] && echo main-ok
   F=fix/036-flaky-tests
   S=feat/036-flake-proof-gates
   A=ops/apply-records-2026-11-23
   B=stack/2026-11-23b
   git switch -c $B "$R"
   git merge --no-ff $F
   git merge --no-ff $S
   git merge --no-ff $A
   tools/gates/gate $B
   ```

   Then merge `$B` into main as you merged `stack/2026-11-23`.
2. **The rest of intent 036** (one retry for the test step, the docs-only fast path, the recorded release exception)
   is spec 036's, on `feat/036-flake-proof-gates`. Its `tools/gates/**` part is yours, as that branch's patch.
3. **The sandbox's Node** is 22.18.0 against the pin's 24.21.0, so a session's `vitest` runs on another V8 than
   your gate's. pet-bench's wired twin failed in all three of this session's runs there (Verification), which a
   session can mistake for a flake.
4. **Backlog**, none urgent:
   - C3's slow health, the same shape as the bounds in §3: `reason: "timeout"` already proves its signal ended it, and
     converting it needs an event for "request in flight" in the shared contract.
   - `clock.test`'s two wall-clock reads, if the WSL clock steps back again.
   - Composing the room once a run (for example in the global setup) instead of once a file would remove most of the
     web suite's CPU: about 130 composes a run.
