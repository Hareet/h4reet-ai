# fix/000-shutdown-test

Spec: [specs/000-local-foundations/](../../specs/000-local-foundations/), its
[tasks.md](../../specs/000-local-foundations/tasks.md)'s T027 ("graceful shutdown") · Intent: none · Written by:
implementer subagent (Claude Opus 5.5), for the main session · Date: 2026-11-10

Session: the main session started from `/home/h4reet/h4reet-ai/h4reet-ai`. This branch's worktree is
`/tmp/claude-1000/wt-shutdown`, which the main session created from `refs/heads/main` at d0fac811. Repo hooks active:
yes. In `.claude/audit/hooks.log`, the worktree's first event is the main session's `git worktree add -b
fix/000-shutdown-test /tmp/claude-1000/wt-shutdown refs/heads/main` at 2026-11-10T13:38:00Z. From then to 14:27:04Z
this session's events in `wt-shutdown` are 89 ALLOW and 1 BLOCK. The ALLOWs include the test's commit at 13:50:55Z,
main's merge into the branch at 13:51:58Z, and this note's first commit at 14:17:32Z. The BLOCK, at 14:13:51Z, is
that same commit refused while your checkout was on `main`: "changing main (HEAD is main)". It wasn't respelled: the
same command ran unchanged once your checkout was parked again.

Authorized by: your answer of 2026-11-10. The question was: "Shall I fix it, so the test waits until the request has
reached its handler instead of a fixed 50 ms? It's an edit to a test file, so it needs your OK." Your answer, verbatim:
"okay, fix the test". That answer is the authority for editing a test file here. This isn't a fix task in the
`FIX_TASK` sense: no gateway code changes, and no assertion's bound moves.

## Status: Review pending

The test change is 1571e069; this note is the branch's last commit. Review pending: no `REVIEW.md` pass has read this
branch yet, and this session, which wrote it, reviews none of it. Step 2's guard holds the gate to 1571e069, the
content the review is to read (Review).

| Check | Result |
|---|---|
| RED, the old test with each request held 100 ms before Fastify's router (a scratch copy) | 0 of 10 passed, 10 of 10 "expected 503 to be 200", the gates' failure |
| GREEN, the new test under the same hold | 10 of 10 passed |
| Both under 24 busy loops, on 24 CPUs at a load average near 20 | old 10 of 10, new 10 of 10: this burner didn't reproduce the race (Verification) |
| Mutation: `close()` drops every connection first (a scratch edit, reverted) | the new test fails, "fetch failed", "other side closed" |
| `make lint` | exit 0 |
| `make test` | exit 0, all three suites whole: the gateway "1653 passed \| 13 skipped (1666)"; the web "2704 passed (2704)"; pytest "4099 passed in 356.73s" |
| `make evals` | exit 0: product 187 passed, narration 44 passed, agent-config static 0 failed, docs links 0 failed of 1,850; the behavioral tier's advisory WARN |
| `make check ENGINE_MODE=none-yet`, run twice | The second run, on b13e9f58's tree: "11 PASS, 1 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 1 FAIL; failing: matrix FAIL", `matrix` E10 and E14 alone, the environment's, and `test` whole (the gateway "1653 passed \| 13 skipped (1666)", the web "2704 passed (2704)", pytest "4099 passed in 453.18s"). The first run also failed `test` on one gateway case, `twin-bench.test.ts`'s 20 ms speed bound (34.07 ms, at a 5-minute load average of 33.7), not this branch's; the graceful-shutdown test passed in both |
| `gitleaks dir` on a fresh export of b13e9f58 (this note's first commit) | exit 0, "no leaks found", 1,917 files |
| The rehearsal into `refs/heads/main` (67028747), on b13e9f58 | `main` is an ancestor; the merge writes the tip's own tree, 8ee8626b; step 2's ancestry, merge-tree, and diff lines print `go`, and the tip differs from the merge-tree in this note alone |

## Runs in your terminal

Every block runs from main's checkout, `~/h4reet-ai/h4reet-ai`. Each line is 45 characters or fewer. Every
`git switch` is `git --no-replace-objects switch`. Nothing paid, and no `--prove` or behavioral tier: against `main`
this branch touches `services/gateway/test/integration/app.test.ts` and this note alone, and in `tools/gates/gate`
stage E runs only when a branch touches `deploy/agents-engine/` or `.claude/settings.json` (line 88, and
`STAGE_E_PATHS`, line 199), and the behavioral tier only when it touches `CLAUDE.md`, `REVIEW.md`, `.claude/`, or the Claude Code pin
(line 90). Hold the steps until the review is in (Review).

**1. The gate.** It exits 2 unless your checkout is on `main` (line 14), so the block starts there:

```bash
cd ~/h4reet-ai/h4reet-ai
git --no-replace-objects switch main
b=fix/000-shutdown-test
log=~/gate-shutdown.log
tools/gates/gate "$b" 2>&1 | tee "$log"
```

Expect Ready, with `evals` WARN for the behavioral tier's information line, as `make check` printed it (Verification). With any FAIL, don't merge: tell the session.

**2. The guard.** It prints `guard: go` only if all of these hold:

- the gate printed its merge line;
- your checkout is on `main`;
- the branch is at the SHA the gate checked;
- `main` is an ancestor of that SHA;
- the test change, 1571e069, is an ancestor of that SHA;
- that SHA's tree is main merged with 1571e069, with nothing different but this note.

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
rv=1571e0697497c5744ca890733801c1340ed71b2a
git "${anc[@]}" "$rv" "$sha" || ok=no
mt=(merge-tree --write-tree "$mr" "$rv")
e=$(git "${mt[@]}") || ok=no
d=docs/merge-requests
n=$d/2026-11-10-fix-000-shutdown-test.md
x=(diff --quiet "$e" "$sha" --)
x+=(":(exclude)$n")
git "${x[@]}" || ok=no
echo "guard: $ok"
```

**Why the anchor is 1571e069, and why it compares against a merge-tree.** 1571e069 is the test change, the one commit
of this branch that isn't main's or this note, and the content the review is to read. If the review changes the
test, the session moves `rv` to the reviewed commit in this note. The branch merges main after 1571e069, so a plain
diff of 1571e069 against the gated SHA would show main's new changes and say no; `git merge-tree --write-tree` builds
the tree main and 1571e069 merge to, and writes no worktree. The guard excludes this note alone, not the folder.
`:(exclude)` is git's long form of `:!`, which zsh would read as history inside double quotes. If main moves before
your gate, the guard says no at the first ancestry line: tell the session, which merges main again. On `guard: no`,
don't merge: tell the session.

**3. The merge, only after `guard: go`,** the gate's merge line rebuilt from its log:

```bash
m="Merge $b (${sha:0:12})"
o=(--no-replace-objects merge --no-ff)
o+=(-m "$m" -m "$s" "$sha")
[ "$ok" = go ] && git "${o[@]}"
```

**4. Park off `main` again,** on a new branch at main's tip. `-c` refuses a name that exists; if it does, pick
another (a `-b` suffix), and never use `-C`, which would move the existing branch:

```bash
p=wip-park/11-10-2026
r=refs/heads/main
git --no-replace-objects switch -c "$p" "$r"
```

## What changed and why

The test, `services/gateway/test/integration/app.test.ts`, "graceful shutdown > lets a request in flight finish, then
closes both listeners and the store", started a fetch to a route whose handler waits 200 ms, waited a fixed 50 ms,
then called `close()`. It assumed 50 ms was enough for the request to reach its handler.

**The cause is that race, not shutdown.** Read from the code:

- `startGateway`'s `close()` (`services/gateway/src/app.ts:617-624`) closes both listeners with Fastify's `close()`,
  then stops the drafts, the dispatcher, the gateway, and the store.
- Fastify 5.12.5's close (`node_modules/fastify/fastify.js:385-387`) sets its `closing` state and calls
  `router.closeRoutes()`, then runs the preClose hooks, closes idle connections, and calls `server.close()`.
- Its router (`node_modules/fastify/lib/route.js:480-504`) checks `closing` once, when a request is routed. A request
  routed after `close()` began is answered 503 with `Connection: close`, by design: "Load-shedding fast path during
  drain" (`return503OnClosing`, true by default, which `app.ts` doesn't set). A request already in its handler isn't
  checked again and finishes; `app.ts`'s onSend hook (`app.ts:102-112`) adds `connection: close` to its response.

So "expected 503 to be 200" means the request reached the router after `close()` had begun: refused as new work,
not dropped in its handler.
That matches the `gateway.stopping` row of `specs/000-local-foundations/contracts/telemetry.md`: "the listeners stop
accepting, and requests in flight finish". No code bug: a request in its handler when shutdown begins isn't dropped.
The 503 failed your gates on `feat/010-anthropic-switch` and `docs/001-ec2-default` (2026-11-09/10) and agents'
`make check` runs under load (`2026-11-09-fix-007-steady-clock-test.md` records one, at a load average near 22).

**The change** (`app.test.ts`, 11 lines in, 1 out):

- The handler calls `arrived()` first, which resolves `reached`.
- The test waits for `reached` or the fetch, whichever settles first, and expects `"reached"`. A fetch that fails
  first ends the wait with its own error, not the 30 s timeout.
- Then `close()`, as before. Every assertion after it is unchanged: 200 and `{ done: true }`, `close()` resolving,
  both listeners refusing a connection, the store not `starting`, the database closed.
- A three-line comment says why.

The request is still in flight when shutdown starts, and now always: the handler resolves `reached`, then waits 200
ms on a timer, and the test's `close()` call follows through microtasks, which run before any timer. The old test
could call `close()` before the request arrived (the failure); the new one can't. A shutdown that drops a request in
flight still fails it (the mutation, Verification). Spec 000's plan says nothing of the test's wait, so it doesn't
change.

### Other fixed waits in the gateway's tests

A search of `services/gateway/test/` for fixed timers (`setTimeout`, `sleep`, `AbortSignal.timeout`, `setInterval`).
None is this one's shape, a fixed wait standing in for "the other side has reached a point", that a slow request can
fail, so this branch changes no other test.

| Where | The wait | Under load |
|---|---|---|
| `integration/dispatcher.test.ts:290` | 100 ms for "the first pass, which starts LISTEN", then an enqueue | The same shape, but it can't fail: a pass LISTENs before it reads due rows (`src/alerts/dispatcher.ts:363-369`), so after a late LISTEN the first pass delivers the row itself, and the test passes without proving the wake. A strength gap, not a flake (Backlog) |
| `unit/gateway.test.ts:157` | 120 ms for three probes at a 20 ms cadence | The wait is the test's speed bound, like `dispatcher-forms.test.ts`'s 50 ms. It can fail on a loaded host, and a wait for the condition would loosen the bound (Backlog) |
| `contract/adapter-contract.ts:664` | an abort at 50 ms against the stub's 5 s delay | A bound: fails only if the timer is about 5 s late |
| `contract/local-openai.errors.test.ts:200` | a connect still pending after 200 ms means the listener's queue is full | A timeout as a probe: a connect slower than 200 ms ends the fill early |
| `integration/migrations.test.ts:922`, `integration/meter.test.ts:956`, `unit/resolve.test.ts:193`, `integration/pg-database.test.ts:40, 77, 90, 97, 104, 126`, `unit/gateway.test.ts:161`, `contract/adapter-contract.ts:721, 734, 738`, `unit/telegram.test.ts:119` | a wait, then "nothing happened" (no log, no retry, no escaped error, no callback, no new probe) | Absence proofs: load can only make them see less, never fail them |
| `integration/alert-samples.test.ts:255`, `integration/smtp-tls.test.ts:227`, `integration/studio-window.test.ts:122`, `unit/anthropic-transport.test.ts:244`, `unit/gateway.test.ts:258`, the stubs' `delayMs` | a stub's latency or drop, a minimum gap between two writes, or an abort of a call that hangs | Not races: a later timer gives the same result. At `gateway.test.ts:258` the path from `g.complete` to the adapter is microtasks only (`backoff` runs between retries, `src/core/gateway.ts:255-288`), so the 20 ms abort can't come first |

## Acceptance criteria

| ID | How this branch meets it |
|---|---|
| Spec 000's T027 (`tasks.md:151-152`): "two listeners, the api on 8080 and admin on 8081, and graceful shutdown" | its test proves the same things, and no longer races the request's arrival |
| `contracts/telemetry.md`'s `gateway.stopping` row: "the listeners stop accepting, and requests in flight finish" | the test closes with the request in its handler, and expects 200, then both listeners refusing |
| Spec 000's FR-041 (`make check`, every local gate) | the gateway's workspace no longer fails this case under load (Verification) |

## Constitution check

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local by default | No | No flow added or changed |
| II. Production-grade or not shipped | Yes | RED and GREEN under the same load, ten runs each, and `make lint`, `make test`, `make evals`, `make check`, pasted below |
| III. Intent before spec, spec before code, humans merge | Yes | A test edit by your answer, quoted above; the plan doesn't describe the wait, so it doesn't change; you merge |
| IV. Least privilege | No | This session wrote nothing under `.claude/`, `tools/gates/`, `evals/agent-config/`, `assets/`, `corpus/`, `config/`, or `.specify/`, nor `CLAUDE.md` or `REVIEW.md`; no permission or sandbox change. Main's merge brings your constitution and ADR commits, unchanged |
| V. Cost is a first-class signal | No | $0; no model call |
| VI. Build in public | Yes | The race, its runs, and the other waits are in this note |
| VII. Own the whole product | Yes | Your words quoted, not paraphrased |
| VIII. Honest AI | No | Nothing the twin says changes |
| Development workflow, step 4 ("Bug fixes start from a failing test the agent may not edit") | Yes | The defect is in the test itself; your answer is the authority for the edit, and the code isn't changed |
| Security and agent governance | Yes | This session reviews none of its own work (Review) |

## Review

Pending. The review is to read the branch's own change, `d0fac811..1571e069` (the test), and this note. Main's merge,
5b69b884, adds nothing of its own: its tree is the one main and 1571e069 merge to (Verification). This session wrote
the branch and reviews none of it.

## Verification

All in `/tmp/claude-1000/wt-shutdown`, after `npm ci --cache "$TMPDIR/npm-cache"` under Node 24.21.0. The ten-run
loops ran the file with `npx vitest run test/integration/app.test.ts -t "graceful shutdown"` from
`services/gateway`, a fresh vitest each run.

### RED, then GREEN, under the same load

**The hold.** A scratch copy of the test file, never committed and deleted after, with four lines and a comment after
`if (result.kind !== "running") return;` that hold every request 100 ms before Fastify's router sees it, as a loaded
machine can:

```ts
const server = result.api.server;
const route = server.listeners("request")[0] as (req: unknown, res: unknown) => void;
server.removeAllListeners("request");
server.on("request", (req, res) => void setTimeout(() => route.call(server, req, res), 100));
```

The old test (main's file) with the hold, ten runs:

```text
held-old run 1: FAIL (Error: expected 503 to be 200 // Object.is equality)
held-old run 2: FAIL (Error: expected 503 to be 200 // Object.is equality)
held-old run 3: FAIL (Error: expected 503 to be 200 // Object.is equality)
held-old run 4: FAIL (Error: expected 503 to be 200 // Object.is equality)
held-old run 5: FAIL (Error: expected 503 to be 200 // Object.is equality)
held-old run 6: FAIL (Error: expected 503 to be 200 // Object.is equality)
held-old run 7: FAIL (Error: expected 503 to be 200 // Object.is equality)
held-old run 8: FAIL (Error: expected 503 to be 200 // Object.is equality)
held-old run 9: FAIL (Error: expected 503 to be 200 // Object.is equality)
held-old run 10: FAIL (Error: expected 503 to be 200 // Object.is equality)
held-old: 0 passed, 10 failed, of 10
```

The new test with the same hold, ten runs:

```text
held-new run 1: pass
held-new run 2: pass
held-new run 3: pass
held-new run 4: pass
held-new run 5: pass
held-new run 6: pass
held-new run 7: pass
held-new run 8: pass
held-new run 9: pass
held-new run 10: pass
held-new: 10 passed, 0 failed, of 10
```

**A CPU burner.** 24 busy shell loops (`while :; do :; done`, each under `timeout`) alongside, on this host's 24 CPUs,
where peer sessions already held the load average near 20 (`uptime` read 18.96 before the old runs and 26.48 after).
It didn't reproduce the race: the old file passed ten of ten, and so did the new one. A heavier burner would have
loaded the peer sessions' own test runs into this same flake, so the session didn't run one; the hold above is the
induced load that reproduces it.

```text
burn-old: 10 passed, 0 failed, of 10
burn-new: 10 passed, 0 failed, of 10
```

**Alone, cold.** The session's first run of main's file alone, before any edit, failed once (8.72 s, cold) and passed
on the next run (4.06 s); its output wasn't kept, so this note doesn't say it was the 503.

**The mutation.** A scratch edit of `app.ts`, reverted from a copy and checked clean with `git diff --quiet`: `close()`
calls `api.server.closeAllConnections()` first, so shutdown drops the request in flight. The new test fails:

```text
 FAIL  test/integration/app.test.ts > graceful shutdown > lets a request in flight finish, then closes both listeners and the store
TypeError: fetch failed
Caused by: SocketError: other side closed
```

### make lint

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
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/scripts/aws-login.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh redteam/forbidden-actions.sh tools/gates/install-tools.sh tools/gates/secrets.sh
(exit 0)
```

### make test

```text
 Test Files  95 passed (95)
      Tests  1653 passed | 13 skipped (1666)
 Test Files  109 passed (109)
      Tests  2704 passed (2704)
4099 passed in 356.73s (0:05:56)
(exit 0)
```

### make evals

```text
evals product (fake): 187 passed, 0 failed
evals narration (fake): 44 passed, 0 failed
agent-config static: 0 failed, 0 planned
WARN (behavioral tier): 2026-11-09T152345Z-feat-011-pa-anthropic-denies-09522968ea48, the newest run for trigger hash 05cec03a74a5, failed: conduct regressed against main's last entry 2026-11-08T151546Z-feat-007-p1-69ab1428d23d: held in 10 of 12 runs, against 11 of 12, over pastes-check-output, refuses-to-widen-allowlist, reviewer-reads-room-data, stays-on-branch
agent-config behavioral: fail, 0 planned
PASS  every relative link resolves: 1850 links in 266 files
PASS  README.md links the ADR index (docs/adr/)
PASS  the ADR index links every ADR file: 31 of 31
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 1850 relative links in 266 files
(exit 0; the 187 product and 44 narration cases' PASS lines are left out)
```

### make check ENGINE_MODE=none-yet, the first run

On 5b69b884 with this note in the working tree, before its commit. The 5-minute load average read 33.7 just after it.

```text
The test stage, the gateway's workspace:
 FAIL  test/unit/twin-bench.test.ts > the twin's own work per turn > builds the grounding and the messages and runs every guard in under 20 ms a turn
AssertionError: expected 34.06961113333333 to be less than 20
 Test Files  1 failed | 94 passed (95)
      Tests  1 failed | 1652 passed | 13 skipped (1666)

The matrix:
E10  FAIL  (from prove-limits.sh): E10   FAIL engine.sh reset leaves a new engine holding only the seeded images -- seen: engine.sh reset failed: engine.sh: not enough free space to seed: need 22 GiB on both the Windows drive and ext4; 19 of the 19 seeded images are missing
E14  FAIL  (from prove-limits.sh): E14   FAIL dev-cpu publishes on the host's 127.0.0.1 (ports 18300-18305); no answer on 18300 18301 18302 18303 18304 18305; the sandbox cannot reach them (stage S)
TOTALS      matrix                0 planned (reported, not failing), 1 skipped: stage S's SMTP row has no usable host
REQUIRED    matrix-required       every listed row ran
forbidden-actions (hook layer): 853 passed, 2 failed, 57 known gaps

The summary:
PASS     makefiles-check
PASS     githooks-check
PASS     toolchain-check
PASS     policy
PASS     validate-config
PASS     lint
FAIL     test
PASS     content-check
PASS     secrets
PASS     arrival
WARN     evals  WARN (behavioral tier): 2026-11-09T152345Z-feat-011-pa-anthropic-denies-09522968ea48, the newest run for trigger hash 05cec03a74a5, failed: conduct regressed against main's last entry 2026-11-08T151546Z-feat-007-p1-69ab1428d23d: held in 10 of 12 runs, against 11 of 12, over pastes-check-output, refuses-to-widen-allowlist, reviewer-reads-room-data, stays-on-branch
PASS     redteam
FAIL     matrix
SKIP     image  no agents' engine yet: tasks.md T046
make check: 10 PASS, 1 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 2 FAIL; failing: test FAIL, matrix FAIL
make: *** [Makefile:159: check] Error 1
exit 2
```

### make check ENGINE_MODE=none-yet, the second run

On b13e9f58's tree: it started on 5b69b884 with this note in the working tree, and the note's commit came while it
ran, before its arrival stage, which counted 3 commits since main. Your gate 5 (feat/005) was running beside it.
The graceful-shutdown test passed in both runs.

```text
The test stage, all three suites:
 Test Files  95 passed (95)
      Tests  1653 passed | 13 skipped (1666)
 Test Files  109 passed (109)
      Tests  2704 passed (2704)
4099 passed in 453.18s (0:07:33)

arrival:
arrival-check: 0 findings in 48 files (3 commits)

The matrix:
E10  FAIL  (from prove-limits.sh): E10   FAIL engine.sh reset leaves a new engine holding only the seeded images -- seen: engine.sh reset failed: engine.sh: not enough free space to seed: need 22 GiB on both the Windows drive and ext4; 19 of the 19 seeded images are missing
E14  FAIL  (from prove-limits.sh): E14   FAIL dev-cpu publishes on the host's 127.0.0.1 (ports 18300-18305); no answer on 18300 18301 18302 18303 18304 18305; the sandbox cannot reach them (stage S)
forbidden-actions (hook layer): 853 passed, 2 failed, 57 known gaps

The summary:
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
exit 2
```

### gitleaks on a fresh export

A `git archive` export of b13e9f58, this note's first commit, into a new, empty folder, scanned from inside it as the
gate scans: main's `.gitleaks.toml` (kept outside the export), an empty folder as the ignore path, and
`--ignore-gitleaks-allow`. This revision changes this note alone.

```text
export of b13e9f58 (shutdown) into a new folder: 1917 files
v8.30.1
7:17AM INF scanned ~51109694 bytes (51.11 MB) in 1.74s
7:17AM INF no leaks found
exit=0
report: []
```

### The rehearsal

`git merge-tree` against `refs/heads/main`, which writes no worktree, then step 2's ancestry, merge-tree, and diff
lines in `zsh -f` with `sha` set to b13e9f58 (the lines that read the gate's log and your checkout's HEAD can't run
here):

```text
$ git merge-tree --write-tree --name-only refs/heads/main b13e9f58866247880ac06d80ace07ac576682055
8ee8626b418c68414d6218967ff2fcafbfb6db10
(exit 0)
tip tree: 8ee8626b418c68414d6218967ff2fcafbfb6db10
main: 67028747d32e71d971c7c2e3555337b394433451
main is an ancestor of the tip: a --no-ff merge's tree is the tip's
sha b13e9f58866247880ac06d80ace07ac576682055, e c45e86bce1cc30407edfda34e909c18f127a26f2
guard (ancestry, merge-tree, diff): go
docs/merge-requests/2026-11-10-fix-000-shutdown-test.md
(above: every file the tip differs from the merge-tree in)
```

Main moved twice while this branch was open: from d0fac811 (the cut) to c01545ce (your docs/001 merge), then to
67028747 (your constitution 1.1.0 commit and ADR 0044 accepted). 5b69b884 merges 67028747 in; nothing conflicted.

## Cost and data-flow impact

$0: no model call, no AWS, and the only network traffic was `npm ci`'s registry reads. No byte path changes, so
`docs/data-flow-disclosure.md` doesn't change, and no degraded-mode behavior changes: this is a test.

## For the Author

### Decisions

None before the merge but the gate and the guard.

### Backlog

- `integration/dispatcher.test.ts:290`: to prove the wake, the enqueue should wait for the first pass to finish, not
  just its LISTEN. A test edit, yours to allow.
- `unit/gateway.test.ts:157`, `dispatcher-forms.test.ts`'s 50 ms, and `unit/twin-bench.test.ts`'s 20 ms a turn
  (34.07 ms in this session's first `make check`): speed bounds that a loaded host can fail. Whether to loosen any is
  yours; this branch keeps every bound.
