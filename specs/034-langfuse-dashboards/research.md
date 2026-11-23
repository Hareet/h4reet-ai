# Research: Langfuse Dashboards

Spec: [spec.md](spec.md) · Plan: [plan.md](plan.md) · Read 2026-11-22.

How this was read: the agent session that wrote this spec had web search, but no page fetch and no network path to
any Langfuse (the sandbox; the Author's stacks are his; no dev-cpu stack was running on the agents' engine). So each
finding below comes from search results that quote Langfuse's documentation, changelog, MCP reference, and pull
requests, or from this repository's own records of Langfuse 4.54.0. Where a detail was not in any result, it says so,
and the plan's checks find it out on the Author's instance before anything is written (plan D3).

## R-1 Can Langfuse 4.54.0 create dashboards through an API?

**Yes, through endpoints marked unstable.** Langfuse's changelog of 2026-07-17, "Manage dashboards via API, CLI, and
MCP", added endpoints under `/api/public/unstable`: `/dashboards` (list, create, read, update, delete, "including their
filters and full layout definition"), `/dashboards/{dashboardId}/placements` (add, move or resize, remove one tile), and
`/dashboard-widgets` (list, create, read, update, delete the reusable widgets that placements reference). Its stated
uses include keeping "dashboard definitions in version control". Its caveat: "These endpoints and MCP tools are unstable
and may change while the dashboard and widget contract is being finalized." Langfuse's July update repeats it.

The repository pins `ghcr.io/langfuse/langfuse:4.54.0` (`deploy/compose.yaml`). Langfuse's v4.54.0 release is dated
2026-10-07 on its GitHub releases page, after the changelog, and its notes list a dashboards fix ("removed duplicate outer
grid padding", #18329), so the endpoints should be in it. A third-party project reported using the widget endpoint on
Langfuse 4.37.

Sources: [changelog 2026-07-17](https://langfuse.com/changelog/2026-07-17-dashboard-and-widget-operations-in-api),
[July update](https://langfuse.com/blog/2026-07-31-langfuse-july-update),
[v4.54.0 release](https://github.com/langfuse/langfuse/releases/tag/v4.54.0),
[custom dashboards](https://langfuse.com/docs/metrics/features/custom-dashboards).

## R-2 The widget's and the dashboard's shapes

From the MCP reference's tool schemas (the MCP tools expose "the same operations" as the endpoints):

- **Widget** (`createDashboardWidget`): `name` (required), `description`, `view` (`observations`, `scores-numeric`,
  `scores-boolean`, `scores-categorical`; "Traces widgets are not supported by this unstable API"), `dimensions`
  (`[{field}]`, at most one but in a pivot table), `metrics` (`[{measure, agg}]`, `agg` one of `sum`, `avg`, `count`,
  `max`, `min`, `p50`, `p75`, `p90`, `p95`, `p99`, `histogram`, `uniq`), `filters` (`column`, `operator`, `type`,
  `value`, `key`), `chartType` (`LINE_TIME_SERIES`, `AREA_TIME_SERIES`, `BAR_TIME_SERIES`, `HORIZONTAL_BAR`,
  `VERTICAL_BAR`, `PIE`, `NUMBER`, `HISTOGRAM`, `PIVOT_TABLE`), and `chartConfig` (its `type` equal to `chartType`;
  `row_limit` up to 1000, `show_value_labels`, `bins` 1 to 100, `defaultSort` with a column and `ASC` or `DESC`).
  Creating a widget doesn't place it.
- **Dashboard** (`createDashboard`): `name` (required), `description`, `filters`, and `definition` with a `widgets`
  array. A placement in the stored definition is `{id, type, widgetId, x, y, x_size, y_size}` on a 12-column grid
  (Langfuse's 2025 blog on its dashboards; its pull request #19832: "Placements are stored in
  current.definition.widgets", and "Full replacements declare supportedPlacementTypes (legacy default: widget and
  preset). Public PATCH, tRPC, MCP, and Fern share the contract").
- **Placement endpoint** (`addDashboardPlacement`): `type` (`widget`, `preset`), `widgetId`, `x`, `y`, and a size
  whose field names the results cut off after `width`.

Not found in any result: the exact request and response bodies of the REST endpoints, the update method (PATCH or PUT),
the list endpoints' pagination, whether a placement's `id` must be a Langfuse-made ID, and `defaultSort`'s inner field
names. Every self-hosted Langfuse since 4.36.0 serves its own API description at `/api/openapi.yaml` and a reference at
`/api/docs` (search results quoting Langfuse's docs), so the command reads the Author's instance's own description before
it writes (plan D3).

Sources: [MCP reference](https://mcp.reference.langfuse.com/),
[the 2025 dashboards blog](https://langfuse.com/blog/2025-05-21-customizable-dashboards),
[PR #19832](https://github.com/langfuse/langfuse/pull/19832).

## R-3 What others hit with these endpoints

- A widget created with `POST /dashboard-widgets` was listed at once but answered 404 at the placement endpoint for about
  5 seconds on Langfuse 4.37; the fix was to create every widget first, wait 6 seconds, then place them
  ([steamkid #39](https://github.com/Neckkup/steamkid/pull/39)).
- The API's rate limit is 30 requests a minute, with `Retry-After`; "Langfuse charts draw only the first metric"
  ([claimsight #17](https://github.com/shashankgupta0998/claimsight/pull/17)).
- A `status` filter on the observations view was refused ("Unsupported filter column for view observations: status");
  `level` is the column ([Langfuse #18913](https://github.com/langfuse/langfuse/pull/18913)).
- The widget endpoint once forced queries onto the v4 events tables, which a self-hosted Langfuse fills only when its
  `LANGFUSE_MIGRATION_V4_WRITE_MODE` is `dual` or `events_only` (fixed since). The repository's stacks run in
  `events_only` mode already: `evals/breach_probe.py` reads observations through the v2 list because
  `/api/public/traces` answers 404 there (T187).

## R-4 The read-only Metrics API, to check a widget's query before writing it

`GET /api/public/v2/metrics?query=<JSON>` is "available on Langfuse Cloud and self-hosted Langfuse v4". A query names
`view`, `dimensions` (`[{field}]`), `metrics` (`[{measure, aggregation}]`), `filters`, `timeDimension`
(`{granularity}`; `auto` appears in an example), `fromTimestamp`, `toTimestamp`, `orderBy`, and `config.row_limit`
(default 100). Output columns are named `<aggregation>_<measure>` (`sum_totalCost`, `p95_latency`). There is no traces
view in v2: the observations view carries the trace-level dimensions `traceName`, `traceRelease`, and `traceVersion`.
`id`, `traceId`, `userId`, and `sessionId` group only in a top-N query: an explicit `config.row_limit`, an `orderBy`
descending on one of the query's metrics, and no `timeDimension` (the current Metrics API page; an older changelog said
they couldn't group at all). Measures on the observations view include `count`, `latency` (milliseconds),
`timeToFirstToken`, `inputTokens`, `outputTokens`, `totalTokens`, and `totalCost`. `type` (GENERATION, SPAN, EVENT, …) and
`level` are dimensions, and the Observations API v2 documents their filters as `stringOptions` with `any of` and
`none of`.

The widget's `metrics` say `agg` where the Metrics API says `aggregation`; otherwise a widget's query and a metrics
query share their fields, which is what lets the command check a widget's fields read-only (plan D3).

Sources: [Metrics API](https://langfuse.com/docs/metrics/features/metrics-api),
[v2 Metrics and Observations API](https://langfuse.com/changelog/2025-12-17-v2-metrics-and-observations-api),
[Metrics API v2 cookbook](https://langfuse.com/guides/cookbook/example_metrics_api_v2),
[Observations API](https://langfuse.com/docs/api-and-data-platform/features/observations-api),
[deprecated APIs](https://langfuse.com/faq/all/deprecated-api-migration).

## R-5 Portable JSON

Since 2026-07-10, a widget exports as `{"$langfuseWidget": true, "version": 1, ...}` and a dashboard as a matching
`$langfuseDashboard` envelope with each widget inlined, without database IDs, and the UI imports them
([changelog 2026-07-10](https://langfuse.com/changelog/2026-07-10-home-is-a-dashboard)). The envelope's full fields were
not in any result, so the repository's files are its own format (plan D1), and the fallback is a recipe the command
prints, not an envelope it can't check (plan D6).

## R-6 What the traces hold here (the repository's own records)

- Each stack's Langfuse project is `h4reet-<stack>` (`LANGFUSE_INIT_PROJECT_ID`, `deploy/compose.yaml`); its keys are
  `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` in the stack's env file; edge publishes Langfuse on
  `127.0.0.1:${H4_LANGFUSE_PORT}` (x001: 18001 prod, 18101 dev, 18301 dev-cpu), passing every path through.
- A trace's root is the gateway's server span (`POST /hello`, `POST /room/turn`, the admin routes), so `traceName` is
  the endpoint; each provider attempt is a generation, with its model from `gen_ai.request.model`, tokens from
  `gen_ai.usage.*`, and the gateway's own cost (`h4.cost.usd`, 0 for local), which Langfuse reads as `gen_ai.usage.cost`
  (telemetry.md §3.5, T149). A failed attempt's span status is ERROR (§3.3).
- The models name the route on each host (config/routing.yaml): on the laptop, prod's `local` model is the local tier and
  `claude-haiku-5-5` (the Anthropic API) its fallback; on EC2, `claude-haiku-5-5` first and
  `us.anthropic.claude-haiku-5-5` (Bedrock) second; dev's `metered-test` is the synthetic spend.
- The route decision, the degraded cause, the room's feature and topic are span attributes, which Langfuse keeps in the
  observation's metadata (breach_probe.py's `attribute`); a widget can't group by a metadata key, and filtering by one
  depends on how v4 stores nested attributes, which no result settled.
- No trace carries a visitor, session, or conversation identifier (telemetry.md §1, rule 3).
- The evals and the red-team suite write their history to `evals/*/history/` and `redteam/history/`, and the gate posts
  dev-time eval cost to Prometheus (telemetry.md §4.4); nothing writes a Langfuse score or dataset.
