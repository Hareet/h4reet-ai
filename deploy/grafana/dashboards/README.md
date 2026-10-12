# Grafana dashboards

Grafana provisions every `.json` file in this folder, mounted read-only at `/etc/grafana/dashboards`, through the file provider in `deploy/grafana/provisioning/dashboards/h4.yaml` (`allowUiUpdates: false`, `disableDeletion: true`). The files are the source: change a panel here, in a commit, never in the UI.

The panels and their exact queries are in `specs/000-local-foundations/contracts/telemetry.md` §7, and `deploy/scripts/test_dashboard.py` reads them from there: each section of §7 is in `h4-runtime.json` whole or not at all, with the contract's queries exactly. Every section must be whole: US1's (§7.3, §7.4, §7.6), US2's (§7.1, §7.2, §7.5), and US3's dev-time row (§7.7), whose panels each say their cost is the Team plan's notional cost, outside the production meter (FR-037). Open the dashboard at `http://localhost:<x002>/d/h4-runtime`.

How a row of the contract becomes panels:

- A type that names two visualizations of the same queries, such as "stat, and a state timeline" or "time series and stat", is two panels: the first under the row's title, the second under the title with the other visualization in parentheses, as "Kill switch (state timeline)" or "Spend today (stat)".
- "time series, and a stat over the range" with its own `stat:` query is a time series and a stat titled "… over the range".
- "table (SQL)" panels read the store's `gateway.v_state` and `gateway.audit_log` through the `gateway` datasource, as `grafana_ro`; "logs" panels read Loki; every other panel is PromQL on `prom`.
