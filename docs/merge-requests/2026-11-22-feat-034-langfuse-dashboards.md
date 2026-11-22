# feat/034-langfuse-dashboards

Spec: [specs/034-langfuse-dashboards/](../../specs/034-langfuse-dashboards/) · Intent: [specs/034-langfuse-dashboards/intent.md](../../specs/034-langfuse-dashboards/intent.md) · Written by: Claude Code (a subagent of the Author's session), every lifecycle step in one session · Date: 2026-11-22
Session: /home/h4reet/h4reet-ai/h4reet-ai, working in the worktree /tmp/claude-1000/wt-feat-034-langfuse-dashboards (from main `37e4a623`) · Repo hooks active: yes (the bash gate refused the first commit, "changing main (HEAD is main)", while main's checkout was on main; once the Author parked it on `wip-park/11-22-2026`, every commit passed, each through the gitleaks and arrival-check hooks)
Authorized by: the Author's direction of 2026-11-22, verbatim: "Let's create Langfuse dashboards that we can use"

## What changed and why

Langfuse had every model call's trace but no dashboard of the project's own. This branch adds two, as files, and one command that puts them into a stack's Langfuse.

- **The dashboards** (`deploy/langfuse/dashboards/`): "h4 · Model calls" (spend, model calls, failed calls, and latency p95 over the range; then by model over time: spend, calls, latency p50 and p95, failures, tokens) and "h4 · Traces" (the 20 costliest and 20 slowest traces by ID, to open; spend and failures by endpoint; the spread of latency and of input and output tokens per call). Each shows spend next to latency and failures (Principle V); each widget says its unit and names its Grafana counterpart; the spend widgets name the ceilings from `config/budgets.yaml` and Grafana's "Spend" row as the authoritative meter. The route reads from the model: on the laptop, the paid model's share of "Model calls by model" is the fallback's.
- **The command** (`scripts/langfuse_dashboards.py`, standard library, by path through `PY_HOST`): it refuses any widget that isn't an aggregate of non-payload fields (no input, output, metadata, user, or session), then, against the stack's Langfuse on `127.0.0.1` only, reads the instance's own API description and checks every operation and field name it uses, runs every widget's query read-only through the Metrics API v2, and prints the plan. With `APPLY=1`, and only if every check passed, it writes: widgets, then dashboards with their layouts, then deletes managed ones no file names. It manages only what carries its mark (`[h4 <dashboard>/<widget>]`); the files win over UI edits; a second run writes nothing. `--recipe` prints the same dashboards as UI steps, the fallback.
- **The target**: `make langfuse-dashboards ENV=<stack> [APPLY=1]`, the Author's (`AUTHOR_ONLY`), reading Langfuse's two keys and port from the stack's env file and printing neither.
- **Why the API, and why the checks** (spec Q1, ADR 0058): Langfuse 4.54.0 carries dashboard endpoints under `/api/public/unstable` (since 2026-07-17), and no source this session could read gave their exact bodies, nor could it reach any Langfuse. So the command checks the instance before it writes: an operation or field name missing costs a `FAIL` line and no write; a body whose shape changed under the same names shows as a write refused part way through an apply, with Langfuse's reason, and the next run, once fixed, makes only what is missing. Grafana over Langfuse's ClickHouse would have needed a plugin, a new ClickHouse login, and Langfuse's private tables.
- **Records**: `docs/runbooks/langfuse-dashboards.md` (provision, read, change, remove) and its index row; ADR 0058; disclosure row S9 names the command; `evals/test_runbooks.py` admits the page.

## Acceptance criteria

Spec 034 FR-001 to FR-016; SC-001 to SC-003 by the tests against the stand-in Langfuse; SC-004 is the Author's run, below.

## Constitution check

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local | yes | Nothing leaves the host: the command calls `127.0.0.1` (x001), with no proxy and no redirect; the files can't name a payload or client field (FR-002); S9 names the command, no new row |
| II. Production-grade | yes | 66 tests against a stand-in Langfuse; a runbook; the Author's first run as the proof against the real 4.54.0 |
| III. Intent → spec → code | yes | Intent in his words, spec with five clarifications taken at their recommendations, research, plan, tasks with analysis, RED then GREEN |
| IV. Least privilege | yes | The target is the Author's and refuses in the sandbox; the keys stay in his env file, which the sandbox can't read, so no new deny is needed; only marked objects are changed |
| V. Cost | yes | $0; each dashboard shows spend next to latency and failures; Grafana's meter stays authoritative |
| VI. Build in public | yes | The dashboards are files; research.md says what couldn't be verified |
| VII, VIII | no | No claim about the Author; the twin is untouched |

No governance file, protected path, or human-only path changes, so there is no patch for the Author's hand.

## Review

## Verification

From the worktree (no `make check`, by the brief: the machine is busy; the suites this branch touches instead):

```text
$ UV_CACHE_DIR=$TMPDIR/uv uv run --offline --frozen pytest -q -p no:cacheprovider --import-mode=importlib \
    --tb=line scripts/test_langfuse_dashboards.py scripts/test_makefile.py evals/test_runbooks.py \
    evals/test_disclosure.py evals/test_docs_links.py
256 passed in 12.65s
$ ... scripts/test_langfuse_dashboards.py
66 passed in 7.84s
$ ... scripts/infra/test_infra_targets.py evals/test_repository_docs.py tools/gates/test/test_makefiles_check.py \
    evals/test_behavioral_line.py
1 failed, 91 passed: test_infra_check_runs_the_policy_then_waits_for_terraform, "mktemp: failed to create file via
template '/tmp/tmp.XXXXXXXXXX': Read-only file system": the sandbox's /tmp, in infra-check's recipe, which this branch
doesn't touch
$ make -f Makefile lint
All matched files use Prettier code style! · ruff check: All checks passed! · 984 files already formatted · shellcheck
clean; exit 0
$ python3 -I -B -X pycache_prefix=/dev/null scripts/langfuse_dashboards.py --recipe
exit 0, 221 lines
```

RED, before the command existed (commit `d86990d8`): `ERROR scripts/test_langfuse_dashboards.py - FileNotFoundError ... scripts/langfuse_dashboards.py`, `1 error in 0.12s`.

## Cost and data-flow impact

$0 in the cloud and in model spend; the dashboards query the stack's ClickHouse when opened. No new data flow: the Author's terminal and browser on `127.0.0.1` (x001), rows S9 and B1.

## Backlog and open questions

Each with my recommended answer; none blocks the merge.

1. **EC2's Langfuse.** EC2 is prod's default host (ADR 0044), so most visitors' traces are in EC2's Langfuse, and the laptop's dashboards show only what the laptop served. Recommended: a small follow-up that lets `make cloud-session` forward EC2's x001 too, then the same command against the forwarded port. Not here: it touches the Author's AWS session script.
2. **Route as a dimension.** The route decision is span metadata, which a widget can't group by; the model names the route on each host (EC2's two paid routes have distinct model names), so the dashboards read it from there. Recommended: leave it unless the model reading proves too coarse; promoting it to a trace tag is a telemetry change with its own spec.
3. **Eval and red-team scores.** Nothing writes them to Langfuse today, so no score widget exists. Recommended: not now; if wanted, a separate intent, into dev's project rather than prod's.
4. **A bash-gate rule for `make langfuse-dashboards` outside dev-cpu.** Recommended: no; the sandbox's read deny on the env files already keeps the keys from agent sessions, and the target refuses in the sandbox.
5. **Cost per conversation or visit** (spec Q4): per trace only, since no trace carries a visit or conversation identifier, by design.

## For the Author

No patches: nothing here is human-only.

1. **Gate and merge**, from main's checkout:

   ```bash
   B=feat/034-langfuse-dashboards
   tools/gates/gate "$B"
   ```

   Then the merge command it prints.

2. **Read-only, on a stack that's up** (dev or prod), from main's checkout after the merge:

   ```bash
   make langfuse-dashboards ENV=dev
   ```

   You should see `ok  the API description lists every operation and field this uses (update: PATCH)` (or `PUT`), 17 `ok  <dashboard>/<widget>  <n> rows over the last 7 days` lines, a plan of 17 `create widget` and 2 `create dashboard` lines, and `Read-only: nothing was written.` Nothing in it is secret.

3. **Write it:**

   ```bash
   make langfuse-dashboards ENV=dev APPLY=1
   ```

   17 `created widget` lines, 2 `created dashboard` lines, and two addresses, `http://localhost:18101/project/h4reet-dev/dashboards/<ID>`. Then the same two steps with `ENV=prod` (addresses on `18001`).

4. **Look** (SC-004): both dashboards open with your recent calls; copy an ID from "The costliest traces" and open `/project/h4reet-<stack>/traces/<ID>`; run step 2 again: every line `keep`, and `Plan: nothing to write`.

5. **If anything says `FAIL` or `refused`**, nothing was written (or, for a refused write, the run stopped part way and is safe to repeat). Paste the `FAIL` or `refused` lines back to a session: the command prints no key or value. Meanwhile `python3 -I -B -X pycache_prefix=/dev/null scripts/langfuse_dashboards.py --recipe` gives the same dashboards as UI steps.
