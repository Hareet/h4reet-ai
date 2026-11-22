# Runbook: Langfuse's dashboards

Each stack's Langfuse holds two dashboards of the project's own, "h4 · Model calls" and "h4 · Traces": spend, model calls, failures, latency, and tokens by model, and the traces worth opening. They are files in the repository, `deploy/langfuse/dashboards/`, and `make langfuse-dashboards` puts them into a stack's Langfuse. This page puts them there, reads them, changes them, and takes them out. Spec 034: [spec.md](../../specs/034-langfuse-dashboards/spec.md), [plan.md](../../specs/034-langfuse-dashboards/plan.md); [ADR 0058](../adr/0058-langfuse-dashboards-as-code.md). Grafana's `h4-runtime` stays the authoritative view of spend, the ceilings, the kill switch, and the degraded causes; these dashboards stand beside it.

## Symptoms

- **No dashboards**: a stack's Langfuse (`http://localhost:18001` on prod, `18101` on dev, `18301` on dev-cpu) shows no "h4 · Model calls" or "h4 · Traces" under Dashboards: a fresh stack, a stack whose volumes were removed, or one never provisioned.
- **Out of date**: a dashboard file changed on main and Langfuse doesn't show it yet, or a managed dashboard or widget was edited in Langfuse's UI.
- **The command's own messages**:
  - `FAIL  the API description doesn't list …`: Langfuse's dashboard API is not the one the command was written for (its endpoints are marked unstable; an upgrade can change them). Nothing was written.
  - `FAIL  <dashboard>/<widget>  400: …`: Langfuse refused that widget's query. Nothing was written.
  - `langfuse-dashboards: Langfuse refused POST …` during an apply: a write Langfuse refused, with its reason.
  - `langfuse-dashboards: exit 4: Langfuse didn't answer`: the stack, or its Langfuse, is down.

## Impact

- **The Author's views only.** No visitor path, no meter, no alert, and no kill switch reads them. Missing or stale dashboards cost the views, nothing else: every trace is still in Langfuse, and Grafana still has the meter.
- **What the command touches**: only widgets and dashboards whose description ends with its mark, `[h4 <dashboard>]` or `[h4 <dashboard>/<widget>]`. Dashboards made by hand without the mark, and Langfuse's own, are never changed. A managed one edited in the UI is put back to its file on the next `APPLY=1`, and a managed one no file names is deleted.
- **What they show**: aggregates alone (counts, sums, percentiles, spreads) of the model calls' cost, latency, and tokens, by model, by endpoint, or by trace ID. No prompt, answer, or metadata, and no visitor identifier: the files can't name one (spec 034 FR-002), and prod's traces carry no payload.

## Act

In your own terminal, from main's checkout, with the stack up (`make status ENV=<stack>`). The target is yours: it reads Langfuse's two keys from the stack's env file, which an agent session can't read.

1. **Read-only first:**

   ```bash
   make langfuse-dashboards ENV=dev
   ```

   It prints the API check, one line for each widget's query (`ok  <dashboard>/<widget>  <n> rows over the last 7 days`), and the plan (`create`, `update`, `keep`, `delete`, one line each). It writes nothing.

2. **Write it:**

   ```bash
   make langfuse-dashboards ENV=dev APPLY=1
   ```

   It creates and updates the widgets, waits 6 seconds when it created any (Langfuse places a new widget only after a few seconds), writes the dashboards with their layouts, deletes what no file names, and prints each dashboard's address. Then the same for prod: `make langfuse-dashboards ENV=prod`, then with `APPLY=1`.

3. **Change a dashboard**: edit its file in `deploy/langfuse/dashboards/` on a branch (each widget: a view, one metric, at most one dimension, filters, a chart type, and its place on the 12-column grid; spec 034 FR-001, plan D1). The tests in `scripts/test_langfuse_dashboards.py` hold the files to aggregates of fields that carry no payload. Once merged, run steps 1 and 2. Don't edit a managed dashboard in Langfuse's UI: the next apply puts it back.

4. **When a check fails**, nothing was written:
   - `the API description doesn't list …`: paste the `FAIL` lines, and Langfuse's version (`deploy/compose.yaml`), into a session; the fix is in the command's constants. Until then, step 6.
   - `<dashboard>/<widget>  400: …`: paste the line; the widget's entry in its file changes.
   - A refused write during an apply: paste it. An apply can stop part way; once fixed, run it again: it creates only what is missing.
   - `exit 4`: `make status ENV=<stack>`, and `make logs ENV=<stack> SERVICE=langfuse-web`.

5. **Reading them**, with Langfuse's date picker at the top right setting every widget's range:
   - "h4 · Model calls": the four numbers over the range (spend in USD, model calls, failed model calls, latency p95 in milliseconds); then by model over time: spend, model calls (on the laptop, the paid model's bar is the fallback's share), latency p50 and p95, failed model calls, and tokens.
   - "h4 · Traces": the 20 costliest and 20 slowest traces by trace ID; copy an ID and open `http://localhost:<port>/project/h4reet-<stack>/traces/<ID>` to see each call in it. Then spend and failed model calls by endpoint (the trace's name: `POST /room/turn`, `POST /hello`, the admin routes), and how latency and input and output tokens spread across the model calls.
   - The cost is the gateway's own price (`config/prices.yaml`, 0 for local calls), as each trace carries it. The meter's committed spend and its ceilings are Grafana's "Spend" row, which is the one that enforces.

6. **By hand, the fallback**: the command prints the same dashboards as steps for Langfuse's UI, with no env file and no network:

   ```bash
   python3 -I -B -X pycache_prefix=/dev/null scripts/langfuse_dashboards.py --recipe
   ```

   Make each dashboard under Dashboards, then each widget with the settings given, and paste each description whole: its last words are the mark, so a later `make langfuse-dashboards` manages what you made.

## Verify

- `make langfuse-dashboards ENV=<stack>` again, read-only: every line `keep`, and `Plan: nothing to write: every widget and dashboard matches its file.`
- In Langfuse, Dashboards lists both, laid out as their files place them; open two or three of the costliest traces and check their cost against the widget's.
- For today's range, "Spend over the range" should agree with Grafana's "Spend today (stat)" within a reservation's rounding: Langfuse's is the traces' cost, Grafana's the meter's committed spend.

## Undo

- **One dashboard or widget**: remove it from its file on a branch, merge, and run `make langfuse-dashboards ENV=<stack> APPLY=1`: it deletes the managed dashboard, then the widgets nothing places.
- **All of them**: remove both files and apply, or delete, in Langfuse's UI, each dashboard and widget whose description ends with `[h4 …]`. Nothing else depends on them.
- The command never changes a trace, a score, or a dashboard without its mark.

## Record

Nothing for a routine apply. When a check fails because Langfuse changed, the fix's merge-request note records the `FAIL` lines and Langfuse's version. Never paste a key or an env-file value: the command prints neither.
