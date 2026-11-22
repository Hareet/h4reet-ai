# Implementation Plan: Langfuse Dashboards

Approved provisionally by the Author's direction of 2026-11-22: "Let's create Langfuse dashboards that we can use"

**Branch**: `feat/034-langfuse-dashboards` | **Date**: 2026-11-22 | **Spec**: [spec.md](spec.md) | **Intent**: [intent.md](intent.md) | **Research**: [research.md](research.md)

## Summary

Two Langfuse dashboards as JSON files in `deploy/langfuse/dashboards/`, and one standard-library command,
`scripts/langfuse_dashboards.py`, that checks them, checks the Author's Langfuse, and with `APPLY=1` puts them there
through Langfuse's dashboard API (`/api/public/unstable`, research R-1), idempotently, touching only what it marks.
`make langfuse-dashboards ENV=<stack> [APPLY=1]` is its one entry point, the Author's. Before any write, the command
reads the instance's own API description and runs every widget's query through the read-only Metrics API v2, so an
unstable endpoint that changed stops it with a message and no write. `--recipe` prints the same dashboards as a UI
recipe, the fallback. A runbook page, ADR 0058, and the disclosure's row S9 record it.

## Technical Context

Python 3.12, standard library only, run by path through the Makefile's `PY_HOST` (`python3 -I -B -X
pycache_prefix=/dev/null`), as `scripts/hello.py` and `scripts/operator.py` are (research.md R-35 of spec 000). Tests in
pytest against a stand-in Langfuse on `127.0.0.1` port 0. No dependency, image, service, compose change, env key, or
secret is added. The gateway, the collector, and Grafana are unchanged.

## Constitution Check

The spec's table holds. Principle V's "every dashboard shows spend next to latency and errors" is designed in (D1's
layout). Principle IV: the target is the Author's (`AUTHOR_ONLY`), and the keys it reads are in his env file, which the
sandbox's read deny already covers (`~/.config/h4reet-ai`, `*.env`), so no new deny is needed: the change adds no secret,
no paid route, and no file prod reads (`CLAUDE.md`'s "Scheduling a deny"). No human-only path changes, so there is no
patch for the Author's hand.

## Design

### D1. The files (FR-001, FR-002, FR-013, FR-014)

`deploy/langfuse/dashboards/<key>.json`, schema 1, the repository's own format (research R-5: Langfuse's portable
envelope couldn't be read whole):

```json
{
  "schema": 1,
  "key": "model-calls",
  "name": "h4 · Model calls",
  "description": "…",
  "widgets": [
    {
      "key": "spend-by-model",
      "name": "Spend by model",
      "description": "…",
      "view": "observations",
      "metric": { "measure": "totalCost", "agg": "sum" },
      "dimensions": ["providedModelName"],
      "filters": [{ "column": "type", "operator": "any of", "value": ["GENERATION"], "type": "stringOptions" }],
      "chartType": "BAR_TIME_SERIES",
      "chartConfig": { "type": "BAR_TIME_SERIES" },
      "place": { "x": 0, "y": 3, "w": 6, "h": 5 }
    }
  ]
}
```

One metric a widget, since Langfuse's charts draw only the first (research R-3). Keys are `[a-z0-9-]{1,40}`. The
validator (FR-002) holds every widget to the allowed view, measures, aggregations, dimensions, filter columns, filter
types (`string`, `stringOptions`, `number`, `boolean`), chart types, a `chartConfig.type` equal to the chart type, a place
inside the 12-column grid (`x + w ≤ 12`, `w`, `h` ≥ 1, `y` ≥ 0), no two places overlapping, unique keys, and at most one
dimension (two in a `PIVOT_TABLE`); a `traceId` dimension only in a `PIVOT_TABLE` with a `row_limit` and a `defaultSort`
(the top-N rule, research R-4).

"Model calls" filter `type` any of `GENERATION`; "failed" adds `level` any of `ERROR` (research R-3, R-4).

**`model-calls.json`, "h4 · Model calls"** (10 widgets):

| y | Widgets (x, w × h) |
|---|---|
| 0 | Spend over the range (NUMBER, sum `totalCost`; 0, 3 × 3) · Model calls over the range (NUMBER, count; 3) · Failed model calls over the range (NUMBER; 6) · Model latency p95 over the range (NUMBER, p95 `latency`; 9) |
| 3 | Spend by model (BAR_TIME_SERIES; 0, 6 × 5) · Model calls by model (BAR_TIME_SERIES; 6) |
| 8 | Model latency p50 by model (LINE_TIME_SERIES; 0) · Model latency p95 by model (LINE_TIME_SERIES; 6) |
| 13 | Failed model calls by model (BAR_TIME_SERIES; 0) · Tokens by model (LINE_TIME_SERIES, sum `totalTokens`; 6) |

**`traces.json`, "h4 · Traces"** (7 widgets):

| y | Widgets |
|---|---|
| 0 | The costliest traces (PIVOT_TABLE, `traceId`, sum `totalCost`, 20 rows, descending; 0, 6 × 6) · The slowest traces (PIVOT_TABLE, `traceId`, max `latency`; 6) |
| 6 | Spend by endpoint (HORIZONTAL_BAR, `traceName`; 0, 4 × 5) · Model latency spread (HISTOGRAM, 20 bins; 4) · Failed model calls by endpoint (HORIZONTAL_BAR; 8) |
| 11 | Input tokens per model call (HISTOGRAM; 0, 6 × 5) · Output tokens per model call (HISTOGRAM; 6) |

A trace's max `latency` over its observations is its root's, the server span that encloses the rest, so "slowest" needs
no root filter; its sum of `totalCost` is the trace's cost, since only generations carry one.

Descriptions (FR-014): what is counted, its unit (USD, milliseconds, tokens), and the Grafana counterpart by its panel
title in `h4-runtime` where one exists; every spend widget names the ceilings from `config/budgets.yaml` and Grafana's
"Spend" row as the authoritative meter. A test reads the ceilings from `config/budgets.yaml` and the panel titles from
`h4-runtime.json`, so neither can drift from what the descriptions say.

### D2. The command (FR-003, FR-008, FR-009, FR-012)

`scripts/langfuse_dashboards.py`:

```text
python3 -I -B -X pycache_prefix=/dev/null scripts/langfuse_dashboards.py --stack prod|dev|dev-cpu --env-file PATH [--apply]
python3 -I -B -X pycache_prefix=/dev/null scripts/langfuse_dashboards.py --recipe
```

- **The env file**: parsed as data with the env files' grammar (contracts/env-files.md §1.1: `KEY=VALUE`, comments,
  single quotes), keeping only `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `H4_LANGFUSE_PORT`. A missing or empty key,
  or `__GENERATE__`/`__PARAMETER__`, is exit 2 naming the key; a port outside 1024 to 65535 is exit 2. No value is
  printed.
- **The address**: `http://127.0.0.1:<port>`, a literal address, never looked up.
- **Output**: the address and project; the API check; each widget's metrics check (`ok` with its row count, or `FAIL`
  with Langfuse's answer); the plan, one line an object (`create`, `update`, `keep`, `delete`, with its mark and name);
  then "Read-only: nothing was written." and the command to apply, or, after `APPLY=1`, each write and each dashboard's
  address (FR-012).
- **Exit codes** (FR-009): 0, 1, 2, 4, the last line naming the code's meaning, as `hello.py` does, since make reports
  every failure as its own error 2.

### D3. The checks before any write (FR-003, FR-004; User Story 3)

1. **The API description.** `GET /api/openapi.yaml`, then `/generated/api/openapi.yml` if the first answers 404 (research
   R-2). Parsed as JSON when it starts with `{`, else by a small YAML reader that takes the `paths:` block's path keys
   and their method keys by indentation (no YAML library: the command is standard library only). Path parameters are
   compared as `{}`. Required: `GET` and `POST` `/api/public/unstable/dashboard-widgets`; `PATCH` or `PUT` and `DELETE`
   `/api/public/unstable/dashboard-widgets/{}`; `GET` and `POST` `/api/public/unstable/dashboards`; `GET`, `PATCH` or
   `PUT`, and `DELETE` `/api/public/unstable/dashboards/{}`; `GET /api/public/v2/metrics`. And the field names the command
   sends must each appear in the description's text: `chartType`, `chartConfig`, `dimensions`, `metrics`, `filters`,
   `definition`, `widgetId`, `x_size`, `y_size`, `row_limit`, `defaultSort`. A missing operation or name is a `FAIL`
   line each and exit 1. The update method is whichever of `PATCH` and `PUT` the description lists, `PATCH` first.
2. **Each widget's query**, through `GET /api/public/v2/metrics?query=<JSON>` over the last 7 days (research R-4): the
   widget's view, dimensions (`[{field}]`), metric as `{measure, aggregation}`, and filters; a time-series chart adds
   `timeDimension: {granularity: "auto"}`; a pivot table adds `config.row_limit` and an `orderBy` descending on its metric's
   output column (`<agg>_<measure>`); a histogram is checked with `p50` of its measure, since what the check proves is that
   Langfuse knows the view, the measure, the dimension, and the filters. A non-2xx is that widget's `FAIL`; a 200 prints
   its row count.

Any `FAIL` stops the run before the plan's writes, with or without `APPLY=1` (FR-004). What the checks can't prove (a
widget body Langfuse refuses for a reason its description doesn't show) surfaces as a refused write, exit 1, with
Langfuse's answer; the run is idempotent, so the next run after the fix completes it.

### D4. Plan and apply (FR-004 to FR-007)

- **Read**: list every widget and dashboard (`page`/`limit` pages while `meta.page < meta.totalPages`, or `meta.cursor`
  while one is given, or a bare list; at most 50 pages); a listed widget or dashboard with no `description` field is read
  by its ID (spec's edge case); a managed dashboard is read by its ID for its `definition`.
- **Mark**: `[h4 <dashboard>]`, `[h4 <dashboard>/<widget>]`, appended to the description after a blank line, with a
  sentence before it: "Managed by deploy/langfuse/dashboards/<file>; make langfuse-dashboards puts it back." Two managed
  objects with one mark: the first by ID is kept or updated, the rest deleted.
- **Compare**: a widget is `keep` when every field the command sends (name, description, view, dimensions, metrics,
  filters, chart type, chart configuration) equals the instance's, where a dict the command sends is compared on its
  own keys only (so fields Langfuse adds don't count); otherwise `update`. A dashboard likewise on its name, its
  description, and its placements, compared as `{widgetId, x, y, x_size, y_size}` by placement ID.
- **The bodies**: a widget `{name, description, view, dimensions: [{field}], metrics: [{measure, agg}], filters, chartType,
  chartConfig}`; a dashboard `{name, description, definition: {widgets: [placement…]}}`, each placement `{id:
  "h4-<dashboard>-<widget>", type: "widget", widgetId, x, y, x_size, y_size}` (research R-2's stored form).
- **Order** with `APPLY=1`: widgets (create, update); a 6 s wait if any was created; dashboards (create, update), each
  write tried again on 404 up to 3 times, 5 s apart; then stale managed dashboards, then stale managed widgets, deleted.
- **429**: wait `Retry-After` (seconds; 1 when absent or unreadable; at most 60), at most 5 tries a request (FR-007).
- **The waits** go through one function the tests replace.

### D5. HTTP (FR-003, FR-008)

`urllib` with an empty `ProxyHandler`, a redirect handler that refuses every redirect, basic authentication from the
two keys (Langfuse's public API scheme, as `evals/breach_probe.py` uses), `Accept: application/json`, a 30 s timeout,
and bodies read up to 8 MiB. A refused request's answer is reduced to its `message` or `error` field when it is JSON,
trimmed to 300 characters, with control characters replaced (FR-008). `URLError`, a timeout, or a dropped connection is
"no answer", exit 4.

### D6. The recipe (FR-010)

`--recipe` prints Markdown: for each dashboard, its name and description, then each widget in grid order with its name,
view, measure and aggregation, dimension, filters, chart type, chart options, and place, as Langfuse's widget editor asks
for them. No env file, key, or network.

### D7. The make target (FR-011)

```make
langfuse-dashboards: ## (the Author) ENV's Langfuse dashboards from deploy/langfuse/dashboards/: a read-only check and plan, or APPLY=1 to write them (docs/runbooks/langfuse-dashboards.md)
	$(call AUTHOR_ONLY,it reads Langfuse's keys from his env file and calls his stack's Langfuse on 127.0.0.1 (docs/runbooks/langfuse-dashboards.md))
	@[ -z "$(call from_cli,APPLY)" ] || [ "$$APPLY" = 1 ] || { echo "make $@: APPLY is 1 or unset, not \"$$APPLY\"" >&2; exit 2; }
	@$(PY_HOST) scripts/langfuse_dashboards.py --stack $(ENV) --env-file $(ENVFILE)$(if $(call from_cli,APPLY), --apply)
```

`APPLY` joins `LITERAL_VARS` (`scripts/test_makefile.py` holds every recipe variable to it). `ENV=shared` is refused by
the Makefile's own rule. The script runs from the checkout make runs in, by path.

### D8. Records (FR-015, FR-016)

**Runbooks**: `docs/runbooks/langfuse-dashboards.md` (new), with the six sections (Symptoms · Impact · Act · Verify · Undo · Record), linked from the runbooks' index; `evals/test_runbooks.py` admits it from this line, as it admits spec 010's and 017's pages.

- **ADR 0058**: dashboards as code through Langfuse's unstable dashboard API, with its checks, over Grafana-on-ClickHouse
  and a UI recipe alone; the ADR index's row.
- **Disclosure row S9**: its "what" names `make langfuse-dashboards` from the Author's terminal on x001.
- **ADR 0004**: unchanged; its Grafana decision stands, and this adds Langfuse's own views beside it.

## Files

| File | Change |
|---|---|
| `deploy/langfuse/dashboards/model-calls.json`, `traces.json` | new (D1) |
| `scripts/langfuse_dashboards.py` | new (D2 to D6) |
| `scripts/test_langfuse_dashboards.py` | new: the tests, with the stand-in Langfuse |
| `Makefile` | `langfuse-dashboards`; `APPLY` in `LITERAL_VARS`; `.PHONY` (D7) |
| `docs/runbooks/langfuse-dashboards.md`, `docs/runbooks/README.md` | new page; its index row (D8) |
| `evals/test_runbooks.py` | admits spec 034's page (D8) |
| `docs/adr/0058-langfuse-dashboards-as-code.md`, `docs/adr/README.md` | new ADR; its row (D8) |
| `docs/data-flow-disclosure.md` | row S9's "what" (D8) |
| `docs/merge-requests/2026-11-22-feat-034-langfuse-dashboards.md` | the note |

## Order of Work

1. RED: `scripts/test_langfuse_dashboards.py` and `evals/test_runbooks.py`'s admission, run and failing.
2. GREEN: the two files, the script, the target; then the runbook, the ADR, S9.
3. Verify: the new tests, `scripts/test_makefile.py`, `evals/test_runbooks.py`, `evals/test_docs_links.py`,
   `evals/test_disclosure.py`, and `make -f Makefile lint`.
4. The note, with the Author's steps.

## Risks

| Risk | Mitigation |
|---|---|
| The unstable endpoints differ from research R-2 (method, path, a field name) | D3's API check stops the run before any write and names the difference; the fix is one constant |
| A field the description lists is shaped differently (a placement's ID, `defaultSort`'s inner names) | Langfuse refuses the write with its reason, exit 1; idempotent re-runs finish once fixed; the runbook says so |
| The Metrics API accepts a query the widget engine doesn't, or the reverse | The refused write names it; `--recipe` makes the same widget by hand |
| The 30-a-minute limit (research R-3) | FR-007's waits; a first apply is about 40 requests |
| A managed object hand-edited in the UI | Q5: the files win, and the runbook says to change the file |
| Payloads on a dashboard | FR-002's allowlists hold the files to aggregates of non-payload fields; the traces carry no payload on prod anyway |

## Proof

- The stand-in Langfuse in the tests implements the endpoints as research R-2 reads them, keeps its objects in memory,
  and records every request: SC-001 (0 writes read-only; 17 widgets and 2 dashboards; 0 writes on a second apply),
  SC-002 (a missing operation or field, a refused query: exit 1, 0 writes), SC-003 (no key in any output), and the
  429, 404-lag, no-answer, pagination, unmarked-object, and stale-object cases.
- The files' own test: they load and validate; their descriptions name the ceilings `config/budgets.yaml` holds and
  Grafana panels `h4-runtime.json` has.
- The Author's first runs (SC-004) are the proof against the real 4.54.0, listed in the note.

## Cost

$0 (spec). No model call, service, or image.

## Degraded Mode

As the spec: the command and the dashboards are outside every visitor's path; Langfuse down is exit 4 and no write.
