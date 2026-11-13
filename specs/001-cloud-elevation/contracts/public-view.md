# Contract: the public view

Spec 001, re-planned 2026-11-09. Replaces the September contract (`contracts/public-view.md` at 00309c47). The sink moves to the tunnel end, which runs around the clock on spot, and each serving host publishes. While AWS has the tunnel end back, the last document stays in place, with its time. Spec FR-057 to FR-059. Research: R-19. The document's fields are in [data-model.md §5](../data-model.md#5-the-public-views-document-sitestatuslatestjson-researchmd-r-19).

## 1. The publishers (each serving host)

`snapshot-publisher`, on the laptop's prod and on EC2. Every 2 minutes while its host serves:
- **it evaluates** the public dashboard's panel queries against its own Prometheus, and the shared state as `grafana_ro`. The queries are read from the provisioned dashboard's public panels, as September did, so the view and Grafana can't drift;
- **it posts** the values, with the time they were taken and its `H4_HOST`, to `snapshot-sink`: from the laptop through the tunnel's `-L 2301`, from EC2 inside the VPC, with the sink's token, `SNAPSHOT_SINK_TOKEN` (contracts/env-cloud.md §2).

A host that doesn't serve, by the relay's status, doesn't post.

**As built (group 10; plan.md §16, "Group 10, as built"):**
- **Two services, one script:** the laptop's `snapshot-publisher`, in the `tunnel` profile, built from the tree, on `internal` alone, posts to `tunnel:2301`; EC2's `ec2-snapshot-publisher`, the release's `h4reet/snapshot` image by its digest, on `internal` and `egress`, posts to the tunnel end's `10.42.1.10:2301` inside the VPC (`deploy/scripts/snapshot_publisher.py`; `deploy/snapshot/Dockerfile`).
- **Which host serves:** each publisher asks the sink, `GET /v1/serving`, which answers the relay's own `serving` from its internal listener; a publisher has no other route to the relay. Unless the answer is its own host, it posts nothing and asks its Prometheus nothing.
- **The panels' queries** are read from the provisioned dashboard's panels by title (`PANELS` in the script): "Request count", "Error rate", "Latency p50 and p95", "Model-server health", "Why responses are degraded", the two spend stats' warnings and ceilings, and "The release on each host", with Grafana's `$__rate_interval` as `5m`. The part's fields are §2's host part.
- **Every minute, at a fixed rate** (group 10's review, I3): each run sleeps the period less its own time, so with the write's 2 minutes, its run, and the edge's 60 s the view stays under FR-058's 5 minutes (60 + 30 + 120 + 60 = 270 s, `test_snapshot.py`). The 30 s is a stated figure for the write's run, not a bound: a slower run (seven AWS calls under a slow AWS) can pass it, and the page then says honestly that its values are older than 5 minutes (the final review, nit 2). Both loops keep their cadence by a monotonic clock (nit 3).
- **The causes and the tunnel** (group 10's review, I1 and I2): the cause gauge's own `none` (1 while nothing is degraded) is dropped, never posted as a cause; `tunnel_up` is true while every end "Tunnel up" reads says up, false if one says down, `null` with none. Its range is narrow: a tunnel fully down stops the laptop's own posts, so the page then shows the last part, "up", marked by its age; the host part's age, older than 5 minutes and last-known, is the tunnel-down signal, and "Tunnel: down" shows only for a one-end reading (the final review, nit 4).
- **No store:** the publishers read no shared state; the store's values are the sink's cloud part alone, so no publisher holds `grafana_ro`'s password.

## 2. The sink (the tunnel end)

`snapshot-sink`:
- **It checks** each post against the document's schema: numbers, states, and times only. It refuses a payload, a client identifier, an operator reason, a secret, or any field it doesn't know (FR-059).
- **It adds the cloud part,** every 2 minutes, whether or not a host serves:
  - the serving host and its `since`, from the relay;
  - EC2's state, from `ec2:DescribeInstances`;
  - the kill switch, today's and the month's model spend, the laptop's fallback remainder, and the adapters' months, from the shared state as `grafana_ro`;
  - the last 10 handover events;
  - the server's month to date against its budget, from `budgets:DescribeBudget` on `h4-server-month`, read once an hour.
- **Its cloud reads go to the dashboard too.** Group 9 writes them first, before the document exists, and exports them as metrics through the tunnel end's collector (C15) to the serving host's Prometheus: EC2's state and its spot request's, the autostart switch, the health check's status, the server action's status, the server's month against its budget, and each function's outcome count, which the start function and the guard log as one embedded-metric line per outcome (`cloudwatch:GetMetricData`, to confirm). All are reads (research.md R-15; plan §11).
- **It writes** the merged document to `site/status/latest.json`, with the tunnel end's role, which may write that one key (granted in group 9's P-I6; used from group 10).
- **While no host serves,** it keeps the last host part, with its time, and sets `serving.host` to `none` (FR-057).

**As built (group 10):** two parts of `deploy/scripts/snapshot_sink.py`, split by what each may hold, since no container reaches the tunnel end's role (IMDSv2, one hop):
- **`snapshot-sink`, the container** (`serve`), the publishers' one way in: on `internal`, where the tunnel's `-L 2301` lands, and on `10.42.1.10:2301`, which the security group and the tunnel end's nftables hold to EC2's group. It holds the sink's token alone. `POST /v1/host`: the bearer token, compared in constant time (401 `snapshot_auth`); at most 16 KiB (413 `body_too_large`); the host part's schema, every field named with its kind (400 `invalid_snapshot` with the field's name, never its value); `taken_at` no more than 5 minutes old nor a minute ahead (400 `stale_snapshot`); its host the one the relay serves (409 `not_serving`); then kept, 204, with `taken_at` the sink's own time of receipt, so a publisher's clock bounds the skew alone and never the page's ages (group 10's review). A `none` among the causes is dropped. Its server closes a client that stalls past 10 s. `GET /v1/serving`: the relay's `serving`, or `unknown`. `GET /v1/host`: the last part and the refusals' counts, for the host's write.
- **`h4-snapshot-sink.service`, the host** (`write`), as root with the instance role, a long-lived process every 2 minutes: the cloud reads above (the budget once an hour, the outcomes once in 30 minutes); the relay's status on `127.0.0.1:18505`; the shared state's `v_state`, `v_adapter_months` (this month), and `v_handovers` (the last 10), inside its container over its socket, in a read-only transaction under `SET LOCAL ROLE grafana_ro`; and the container's last part. It merges them with the document it keeps in `/var/lib/h4reet/snapshot/`, keeping the newer host part with its own time, checks the whole against the schema (a document that fails is `refused`, never written), and puts it with `Content-Type: application/json` and `Cache-Control: max-age=60`, through the egress proxy. The deployer's host step installs it from the release's tree, beside the backup's timer.
- **The document's fields** (data-model.md §5, as built): `schema` (1); `written_at`; `serving` (`host`, `since`, `ec2_state`: `pending`, `running`, `stopping`, `stopped`, `interrupted` (stopped with its spot request's status `instance-stopped-*` but `-by-user`), or `unknown`, which no tagged instance, two of them, or a failed read give; `taken_at`); `spend` (`kill_switch`, `today_usd`, `month_usd`, `fallback_remaining_usd`, `fallback_awaiting_renewal`, `adapter_months`: `adapter`, `month`, `spent_usd`; `taken_at`), or `null` while the store can't be read; `server` (`month_to_date_usd`, `budget_usd`, `as_of`), or `null` until the first read, and last-known with its `as_of` after a failed one; `handovers` (`events`: `at`, `from`, `to`, `gap_s`; `taken_at`), with no reason; `host_panels`, the last host part (`host`, `taken_at`, `requests_per_s`, `error_rate`, `latency_p50_s`, `latency_p95_s`, `model_server_up`, `degraded_causes` from spec 000's, the relay's, and the edge's causes alone, `ceilings` and `warnings` (`day_usd`, `month_usd`), and `release`, its commit's first 12 hex, and `tunnel_up`, FR-059's tunnel state, a boolean or `null`), or `null`; and `releases`, each host's last (`release`, `taken_at`). Money is USD rounded down to the cent.

## 3. The page, `/status/`

A static page of the site. It reads `latest.json` (cached for 60 s) and the relay's live `/api/status`, and shows:
- spec 000's FR-028 panels;
- which host serves, the handovers and their gaps, and EC2's state;
- the server's month against its budget, next to model spend against the ceilings;
- the adapters' months;
- the release on each host;
- when each part was taken (FR-058).

**Which host serves** comes from `/api/status` first. While the tunnel end is gone, the sink is gone with it, and `latest.json` keeps the last host it wrote. So the page names `none` whenever `/api/status` gives the edge's degraded answer (503, cause `no_host_serving`, `stack` null) or no answer, whatever the document says, and shows the document's values as last-known, with their times (spec FR-057, FR-076).

It has no write action, and nothing per client.

**As built (group 10; T138):** the build emits `status/index.html`, `status/style.css`, and its one module script, an entry of its own (`apps/web/build/status.ts`, `apps/web/status/main.ts`, `apps/web/status/view.ts`), so the room's page never loads it. It reads `./latest.json` and `../api/status` on load and every 60 s while visible, and writes every value as text. Its parts, each with "taken at <time> UTC (<n> minutes ago)": which host serves and EC2's state; the host's FR-028 panels; model spend beside the ceilings, the kill switch, the fallback's remainder, and the adapters' months; the server's month beside its budget; the handovers with each gap; the release on each host. Values older than 5 minutes say so in words. "Last-known" marks every part, EC2's line among them, while the relay names no host, or names another than the document's. The host part's lines include the tunnel: up, down, or unknown (FR-059). Which host serves reads `none` on the edge's degraded answer or none at all, and "unknown" on any other answer, the status cap's 429 or another 5xx (group 10's review). The write runs at a fixed rate too, and one round's error is said and the loop goes on; the hourly and half-hourly reads keep their times in `/var/lib/h4reet/snapshot/cloud.json` across a restart.

## 4. Tests

- the sink refuses each forbidden kind of field;
- the cloud part is written while no host serves;
- a stale host part shows its time;
- the page names `none` when no host serves (SC-013);
- the page names `none` when `latest.json` names a host but `/api/status` gives the edge's degraded answer, or none, as while the tunnel end is gone (FR-057).

As built: `deploy/scripts/test_snapshot.py` (T135) and `apps/web/test/status.test.ts` (T136).

## 5. The dashboard's Hosts row: the public view (group 10)

(new in group 10; tasks.md T137; FR-057, FR-058, FR-060; plan.md §11.) `deploy/grafana/dashboards/h4-runtime.json`'s "Hosts" row, below group 9's panels (contracts/handover.md §10):

| Panel | Type | Query |
|---|---|---|
| The public view's age (FR-058) | stat | `max(h4_snapshot_age_seconds)` |
| The public view's writes and posts (FR-057) | time series | `sum by (outcome) (increase(h4_snapshot_writes_total[1h]))` and `sum by (h4_host, outcome) (increase(h4_snapshot_publishes_total[1h]))` |

- **`h4_snapshot_age_seconds`** is `h4.snapshot.age_seconds`, the host part's age at each write, which the tunnel end's write pushes to its collector: green under 300 s, red from 300 s. While no host serves it grows, as the page's "last-known" says.
- **`h4_snapshot_writes_total`** is `h4.snapshot.writes`, each write by `outcome` (`written`, `failed`, `refused`), cumulative from the process's start, as the collector passes counters on unconverted; **`h4_snapshot_publishes_total`** is `h4.snapshot.publishes`, each publisher's runs by `outcome` (`posted`, `refused`, `failed`, `not_serving`, `unread`), labelled with its `h4.host`.
- **Spans:** `snapshot.write` on the tunnel end and `snapshot.publish` on each host, each with `h4.snapshot.outcome`, never a value of the document.
- `deploy/scripts/test_dashboard.py` reads this section's table with the other Hosts sections'.
