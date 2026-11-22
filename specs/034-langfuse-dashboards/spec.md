# Feature Specification: Langfuse Dashboards

**Feature Branch**: `feat/034-langfuse-dashboards`, from `main`'s `37e4a623`.

**Created**: 2026-11-22

**Status**: Draft, clarified the same day. Specified, clarified, planned, tasked, analyzed, and built in one session from the intent [`intent.md`](intent.md), under the Author's direction of 2026-11-22 (below). Every clarification takes its recommended answer under that direction, provisionally; each is his to overturn.

**Input**: the intent; the [constitution](../../.specify/memory/constitution.md) (1.1.0); `CLAUDE.md`; spec 000's [telemetry contract](../000-local-foundations/contracts/telemetry.md) (§3, the traces; §7, Grafana's `h4-runtime`); [ADR 0004](../../docs/adr/0004-langfuse-and-grafana-over-opentelemetry.md); `deploy/compose.yaml` (Langfuse 4.54.0); `docs/data-flow-disclosure.md` (rows S9, B1); and [research.md](research.md).

## Source: The Author's Words

From the intent, 2026-11-22, verbatim:

> "Let's create Langfuse dashboards that we can use"

**Readings, beside his words, never in their place.**

- "dashboards" is read as Langfuse's own custom dashboards, inside Langfuse's UI, in each stack's project, not Grafana
  panels: Grafana's `h4-runtime` exists and he named Langfuse.
- "that we can use" is read as: they answer the operator's questions about model calls at a glance, they lead from a
  number to the trace behind it, they don't repeat what Grafana already answers authoritatively, and they can be put
  back exactly by one command, since an agent can't reach his Langfuse to make them by hand.
- "we" is read as the Author and the sessions that work for him: the dashboards are files in the repository that a
  session can change and he can apply.

## Clarifications

### Session 2026-11-22, taken under the Author's direction to build it through the lifecycle in one session

- Q1: How do the dashboards get into Langfuse? Options: A (recommended): each dashboard is a file in the repository, and a command puts it into a stack's Langfuse through Langfuse's dashboard API (under `/api/public/unstable` since 2026-07-17; 4.54.0 is 2026-10-07, research R-1), read-only by default, checking first that the instance's own API description lists everything it uses and that Langfuse accepts each widget's query, and writing only when told to; B: Grafana panels over Langfuse's ClickHouse, which needs a ClickHouse plugin in Grafana (the stack preinstalls none), a ClickHouse login for Grafana (a new secret), and Langfuse's internal tables, which v4 changed and may change again; C: a written recipe the Author follows in Langfuse's UI. → A: **A (recommended)**, with C as the fallback the same command prints from the same files. Reading: the endpoints are marked unstable, so the command checks the instance before it writes, and a change in Langfuse costs a dry run's message, not a broken dashboard.
- Q2: Which stacks? Options: A (recommended): any stack whose Langfuse the Author's terminal reaches on `127.0.0.1`: prod and dev on the laptop, and dev-cpu on the agents' engine, chosen with `ENV=`; EC2's Langfuse is a follow-up, since `make cloud-session` forwards EC2's admin listener only; B: EC2 too, now. → A: **A (recommended)**.
- Q3: What do the dashboards show, next to Grafana's? Options: A (recommended): two dashboards, "h4 · Model calls" (spend, calls, failures, latency p50 and p95, and tokens, by model over time) and "h4 · Traces" (the costliest and slowest traces by ID, to open; spend and failures by endpoint; the spread of latency and of tokens per call); the meter, the ceilings, the kill switch, and the degraded causes stay in Grafana, from the meter, and each Langfuse widget that has a Grafana counterpart says where it is; B: also copy Grafana's meter panels into Langfuse. → A: **A (recommended)**. Reading: the route (local, fallback) is read from the model, which names it on each host (research R-6); the route decision itself is span metadata, which a widget can't group by.
- Q4: Cost per conversation or per visit? Options: A (recommended): per trace, that is per turn or per hello, since no trace carries a visit or conversation identifier, by design (telemetry.md §1, rule 3); a conversation identifier would be a new trace attribute with its own spec and its own disclosure review; B: add one in the gateway now. → A: **A (recommended)**.
- Q5: What happens to a dashboard the Author edits in Langfuse's UI? Options: A (recommended): the files win, as Grafana's `allowUiUpdates: false` makes them win there: the command marks what it manages at the end of each description (`[h4 <dashboard>]`, `[h4 <dashboard>/<widget>]`), puts a managed widget or dashboard back to its file when it differs, deletes managed ones no file names, and never touches anything without its mark, so the Author's own dashboards and Langfuse's presets stay his; B: the command only creates, and never updates or deletes. → A: **A (recommended)**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The Dashboards in Langfuse (Priority: P1)

As the Author, I want two dashboards in my stack's Langfuse that show the model calls' spend, latency, failures, and tokens by model and by endpoint, and the traces worth opening, so that I can read the twin's model use at a glance.

**Why this priority**: It is the Author's request.

**Independent Test**: Run `make langfuse-dashboards ENV=dev` (read-only), then with `APPLY=1`, and open Langfuse's Dashboards page: "h4 · Model calls" and "h4 · Traces" are there, with the widgets FR-013 lists, and their numbers match a few traces opened by hand.

**Acceptance Scenarios**:

1. **Given** a stack's Langfuse with no managed dashboard, **When** the Author runs the command with `APPLY=1`, **Then** Langfuse holds the two dashboards with FR-013's widgets in FR-013's layout, and the command prints each dashboard's address.
2. **Given** the same, **When** he runs it again with nothing changed, **Then** it writes nothing and says every widget and dashboard is unchanged.
3. **Given** the costliest-traces widget, **When** he copies a trace ID from it, **Then** that trace opens in Langfuse at `/project/h4reet-<stack>/traces/<ID>`.

---

### User Story 2 - Dashboards as Code (Priority: P1)

As the Author, I want each dashboard to be a file in the repository, so that a change is a reviewed commit and any stack's dashboards can be put back by one command.

**Why this priority**: Agents can't reach his Langfuse, so a dashboard only an agent could describe must be something he can apply in one step; and a hand-made dashboard is lost with a stack's volumes.

**Independent Test**: Change a widget's title in its file and run the command: the read-only run lists that one widget as "update" and nothing else; with `APPLY=1` Langfuse shows the new title.

**Acceptance Scenarios**:

1. **Given** a file changed, **When** the command runs without `APPLY=1`, **Then** it prints what it would create, update, keep, and delete, and writes nothing.
2. **Given** a managed widget edited in Langfuse's UI, **When** the command runs with `APPLY=1`, **Then** the widget is put back to its file.
3. **Given** a dashboard the Author made himself in Langfuse (no `[h4 …]` mark), **When** the command runs with `APPLY=1`, **Then** it is untouched.
4. **Given** a managed widget whose file entry was removed, **When** the command runs with `APPLY=1`, **Then** it is deleted, after the dashboards that placed it are rewritten.

---

### User Story 3 - Safe Against an API That May Change (Priority: P1)

As the Author, I want the command to find out, before it writes anything, whether my Langfuse's API is the one it was written for and whether Langfuse accepts each widget's query, so that an unstable endpoint costs me a message, not a half-made dashboard.

**Why this priority**: The dashboard endpoints are marked unstable (research R-1), and nobody could run the command against a real Langfuse while writing it.

**Independent Test**: Against a stand-in Langfuse whose API description lacks one operation, or whose Metrics API refuses one widget's query, the command exits 1, names the operation or the widget with Langfuse's answer, and makes no write.

**Acceptance Scenarios**:

1. **Given** an instance whose API description lacks an operation or a field the command uses, **When** the command runs, with or without `APPLY=1`, **Then** it exits 1 naming each missing one, and writes nothing.
2. **Given** an instance whose Metrics API refuses a widget's query, **When** the command runs, **Then** it exits 1 naming the widget and Langfuse's answer, and writes nothing.
3. **Given** Langfuse answering 429, **When** the command runs, **Then** it waits as `Retry-After` says, up to FR-007's bounds, and goes on.
4. **Given** Langfuse not answering, **When** the command runs, **Then** it exits 4 and says Langfuse at its address didn't answer.

---

### Edge Cases

- **An empty project** (a fresh stack, no traffic yet): the checks pass with 0 rows; the dashboards are made and show no data until calls arrive.
- **A degraded stack** (the kill switch tripped, the meter at its ceiling): no generations arrive, so the time series show the gap; the dashboards don't read the meter, and Grafana's State row says why.
- **Langfuse restarted with its volumes**: the dashboards stay; with its volumes removed, the command puts them back.
- **The widget-placement lag** (research R-3): a dashboard written in the same run as new widgets waits 6 seconds first, and a 404 on a dashboard write is tried again (FR-007).
- **A list without descriptions**: if Langfuse's list omits a widget's description, the command can't see its mark, so it reads each widget it can't classify (FR-006).
- **A stack without its env file or keys** (`__GENERATE__` still in place): the command exits 2 naming the key, never its value.

## Requirements *(mandatory)*

### Functional Requirements

**The files (User Story 2).**

- **FR-001**: THE REPOSITORY SHALL hold each Langfuse dashboard as one JSON file in `deploy/langfuse/dashboards/`: its key, name, and description, and its widgets, each with a key, a name, a description, a view, exactly one metric (a measure and its aggregation), at most one dimension (more only in a pivot table, up to two), its filters, a chart type, an optional chart configuration, and its place on the 12-column grid.
- **FR-002**: BEFORE ANY CALL, THE COMMAND SHALL refuse a file whose widget uses a view other than `observations`, a measure outside `count`, `latency`, `totalCost`, `inputCost`, `outputCost`, `totalTokens`, `inputTokens`, `outputTokens`, a dimension or filter column outside `providedModelName`, `traceName`, `traceId`, `name`, `type`, `level`, `environment`, an unknown aggregation or chart type, a chart configuration whose `type` isn't its chart type, a place outside the grid, or two places that overlap; so no widget can show an input, an output, metadata, or a user or session identifier, and the files hold aggregates alone.

**The command (User Stories 1 and 3).**

- **FR-003**: WHEN the Author runs `make langfuse-dashboards ENV=<stack>`, THE COMMAND SHALL read only `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `H4_LANGFUSE_PORT` from the stack's env file; call only `http://127.0.0.1:<H4_LANGFUSE_PORT>`, with no proxy and no redirect followed; read the instance's API description and check that it lists every operation and field name the command uses; run each widget's query, read-only, through Langfuse's Metrics API v2 over the last 7 days; print each check's result and the plan (create, update, keep, delete, for each widget and dashboard); and write nothing.
- **FR-004**: WHEN `APPLY=1` is given and every check passes, THE COMMAND SHALL create the missing widgets and update the changed ones, then create or update each dashboard with its full layout, then delete the managed dashboards and then the managed widgets that no file names; WHEN any check fails, IT SHALL write nothing.
- **FR-005**: WHEN the files and the instance already agree, THE COMMAND SHALL write nothing, with or without `APPLY=1`.
- **FR-006**: THE COMMAND SHALL mark each widget and dashboard it manages by ending its description with `[h4 <dashboard>/<widget>]` or `[h4 <dashboard>]`, SHALL identify managed objects by that mark alone, and SHALL never change or delete an object without it.
- **FR-007**: WHEN Langfuse answers 429, THE COMMAND SHALL wait the `Retry-After` seconds (1 when absent or unreadable, at most 60) and try again, at most 5 times a request; WHEN it created a widget in the run, IT SHALL wait 6 seconds before writing a dashboard; WHEN a dashboard write answers 404, IT SHALL try again up to 3 times, 5 seconds apart.
- **FR-008**: THE COMMAND SHALL print no key, no env-file value, and no request body, and SHALL print Langfuse's answer to a refused request trimmed to 300 characters with its control characters replaced.
- **FR-009**: THE COMMAND SHALL exit 0 when every check passed (and, with `APPLY=1`, every write); 1 when a check failed or Langfuse refused a request; 2 for its usage, the definitions, or the env file; 4 when Langfuse didn't answer.
- **FR-010**: WHEN run with `--recipe`, THE COMMAND SHALL print, from the same files and with no env file, key, or network, a recipe for making each dashboard by hand in Langfuse's UI: each widget's name, view, measure and aggregation, dimension, filters, chart type, and place.
- **FR-011**: THE MAKE TARGET SHALL be the Author's (`## (the Author)`), refuse inside the agent sandbox, take `APPLY` as `1` or unset only, and pass the stack's env file the Makefile names for `ENV`.
- **FR-012**: AFTER `APPLY=1`, THE COMMAND SHALL print each managed dashboard's address, `http://localhost:<H4_LANGFUSE_PORT>/project/h4reet-<stack>/dashboards/<ID>`.

**The dashboards (User Story 1).**

- **FR-013**: THE FILES SHALL define two dashboards, each with spend next to latency and failures (Principle V):
  - **"h4 · Model calls"** (`model-calls`): four numbers over the range (spend; model calls; failed model calls; model latency p95), then, by model over time, spend, model calls (the fallback's share on the laptop), latency p50, latency p95, failed model calls, and tokens.
  - **"h4 · Traces"** (`traces`): the 20 costliest traces and the 20 slowest traces by trace ID; spend by endpoint; the spread of model-call latency; failed model calls by endpoint; and the spread of input tokens and of output tokens per model call.
  "Model calls" are generations (`type` any of `GENERATION`); "failed" adds `level` any of `ERROR`; "endpoint" is the trace's name, the gateway's server span (`POST /room/turn`, `POST /hello`, the admin routes).
- **FR-014**: EACH WIDGET'S DESCRIPTION SHALL say what it counts and in which unit; each spend widget SHALL say that the cost is the gateway's own price (0 for local calls) and that the meter, its ceilings (prod's $5.00 a day and $20.00 a month, and the laptop's $2.00-a-day fallback, from `config/budgets.yaml`), and its authoritative spend are Grafana's "Spend" row; each widget with a Grafana counterpart SHALL name it.

**Records.**

- **FR-015**: `docs/runbooks/langfuse-dashboards.md` SHALL say how to put the dashboards into a stack, read them, change them, and take them out, in the runbooks' six sections, and the runbooks' index SHALL link it.
- **FR-016**: THE DATA-FLOW DISCLOSURE'S row S9 SHALL name the command among what reaches Langfuse's web app on x001.

### Key Entities

- **A dashboard file**: `deploy/langfuse/dashboards/<key>.json`, schema 1: `key`, `name`, `description`, `widgets`.
- **A widget entry**: `key`, `name`, `description`, `view`, `metric` (`measure`, `agg`), `dimensions` (field names), `filters`, `chartType`, `chartConfig`, `place` (`x`, `y`, `w`, `h`).
- **The mark**: `[h4 <dashboard>]` or `[h4 <dashboard>/<widget>]`, the last thing in a managed object's description.
- **A managed placement**: `{id: "h4-<dashboard>-<widget>", type: "widget", widgetId, x, y, x_size, y_size}` in the dashboard's definition.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Against the tests' stand-in Langfuse, a read-only run makes 0 writes; an `APPLY=1` run on an empty project makes 17 widgets and 2 dashboards; a second `APPLY=1` run makes 0 writes.
- **SC-002**: Against the stand-in, a missing operation or field in the API description, or a refused metrics query, gives exit 1 and 0 writes.
- **SC-003**: No test's output contains either Langfuse key.
- **SC-004**: The Author's run: `make langfuse-dashboards ENV=dev` and then `ENV=prod`, read-only, print every check as `ok`; with `APPLY=1` both dashboards open in Langfuse and show his recent calls; a second run says nothing changed.

## Out of Scope

- **EC2's Langfuse** (Q2): a follow-up once a cloud session forwards its x001.
- **Eval and red-team scores**: nothing writes them to Langfuse today (research R-6), so a score widget would be empty; posting them as Langfuse scores is a separate intent if the Author wants it.
- **A conversation or visit identifier** (Q4).
- **Grouping by the route decision, the room's feature or topic, or the degraded cause in Langfuse**: those are span metadata (research R-6); Grafana groups them already (telemetry.md §7.2, §7.10). Promoting one to a trace tag would be a telemetry change with its own spec.

## Assumptions

- The dashboard endpoints exist in 4.54.0 as research R-1 and R-2 describe; where a detail wasn't found (the update method, pagination, a placement's ID, `defaultSort`'s fields), the plan's choice is checked against the instance's own API description first, and the dry run and the Author's first run (SC-004) settle the rest.
- Langfuse's own dashboard date picker sets each widget's range and granularity; the files set none.
- Langfuse maps a failed span's ERROR status to the observation's `level` `ERROR`, and the root span's name to the trace's name (research R-6; telemetry.md §3.3, §3.5).
- No deviation from the constitution is taken: Principle V's "every dashboard shows spend next to latency and errors" is met by each dashboard (FR-013).

## Expected Cost Impact

$0 in the cloud and $0 model spend: no model call, no new service, no image. The dashboards query the stack's ClickHouse when the Author opens them, on the laptop's hardware. The command makes about 40 requests to the stack's own Langfuse on a first apply and about 20 on a dry run. Dev-time model spend for this session only.

## Degraded-Mode Behavior

The dashboards and the command are the operator's, outside every visitor's path; nothing in the gateway changes. With the kill switch tripped or the meter at a ceiling, no generation arrives and the time series show the gap; Grafana's State row says why. With Langfuse down, the dashboards are down with it (ADR 0004's consequence: telemetry and its views fail alone) and the command exits 4 having written nothing. With the local tier off, the laptop's stacks and their Langfuse are off too, and EC2's Langfuse has no managed dashboards until the follow-up.

## Data-Flow Disclosure Entries

No new byte leaves the visitor's device or the host. The command runs in the Author's terminal and calls his stack's Langfuse on `127.0.0.1` (edge's x001), with the project keys the env file already holds; the dashboards are read in his browser on the same port (rows S9 and B1). Row S9's "what" names the command (FR-016).

## The "New Endpoint or Feature" List (`CLAUDE.md`)

- **Telemetry span**: none; no endpoint or runtime path is added. The command prints its checks and plan; the dashboards are themselves the telemetry's view.
- **Dashboard panel**: this feature is two dashboards (FR-013); Grafana's `h4-runtime` is unchanged.
- **Cost estimate**: $0 (above).
- **Degraded mode**: above.
- **Data-flow disclosure entry**: S9 names the command (FR-016); no new row.

## Constitution Check

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local | yes | Nothing leaves the host; no payload or client identifier can be a widget's field (FR-002) |
| II. Production-grade | yes | Tests against a stand-in Langfuse for every FR the sandbox can test; a runbook (FR-015); the Author's run as SC-004 |
| III. Intent → spec → code | yes | The intent in his words; this spec, its plan and tasks before code |
| IV. Least privilege | yes | The Author's target, refused in the sandbox; the keys stay in his env file, which the sandbox can't read; only marked objects are changed |
| V. Cost | yes | $0; each dashboard shows spend next to latency and failures; the meter stays authoritative in Grafana |
| VI. Build in public | yes | The dashboards are files in the public repository; research.md records what couldn't be verified |
| VII. Own and say exactly | no | No claim about the Author |
| VIII. Honest AI | no | The twin is untouched |

## Open Questions

None blocking. Q1 (the unstable API, with its checks) and Q3 (the widget set) are the ones most worth his look; the first `APPLY=1` run is where an API difference would show.
