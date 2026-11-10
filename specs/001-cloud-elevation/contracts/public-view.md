> **Superseded on 2026-11-09.** Spec 001 was reworked that day around the Author's decisions (ADR 0044, proposed: EC2 is prod's default host); this contract is the September design's (the laptop serves, the cloud is a thin control plane) and waits for a re-plan, kept unedited below as the record.

# Contract: the public view

Spec 001 (FR-057 to FR-059, FR-042, FR-060; SC-013) · Plan: [§8.3](../plan.md#83-the-public-view-fr-057-to-fr-059-r-19) · Research: [R-19](../research.md#r-19-the-public-view-a-snapshot-the-local-tier-pushes-up-to-ask-question-9)

The public view is what visitors see of the running system: `/status/` on the site. The constitution asks for "a cloud-hosted last-known snapshot so the public view never goes dark", and the spec reads Grafana's public dashboards as snapshots (Clarifications, 2026-10-12). The view's values come from two places:
- **The local part:** the local tier's Prometheus. The local tier pushes it up through the tunnel every 2 minutes, while the tier is up.
- **The cloud part:** the meter of record on the cloud stack. The VM reads it every 2 minutes, whether or not the local tier is up.

`snapshot-sink` on the VM merges them into one document, `/status/latest.json`, and the static page renders it. The operator's Grafana never faces the internet.

## 1. The publisher (the local tier)

`snapshot-publisher`, in the `tunnel` profile, every 120 s:

1. **Reads the public panels' queries** from the provisioned dashboard `deploy/grafana/dashboards/h4-runtime.json`: the panels whose `description` starts with `[public]`. A panel's query is therefore the same text in Grafana and in the view, and the two can't drift. A test fails if a public panel names anything but the fields in §3.
2. **Evaluates each query** against the local Prometheus (`http://prometheus:9090/api/v1/query`) at one instant, so all values are from the same moment.
3. **Builds the local part** (§3), and posts it to `http://tunnel:2301/v1/local`, which is `snapshot-sink` on the VM, with `Authorization: Bearer ${H4_SNAPSHOT_TOKEN}` and a 10 s timeout.
4. **Logs** the outcome, never the values. If a post fails, the next run tries again, and nothing queues.

## 2. The sink

`snapshot-sink`, on the VM, in the `cloud` profile, listens on 8080 on the cloud stack's `internal` network only. The tunnel's `-L` forward is its one way in.

**`POST /v1/local`.** Each step either passes or refuses:

| Step | Refuses with |
|---|---|
| The bearer token, compared in constant time | 401 `{"error":"snapshot_auth"}` |
| The body's size: at most 16 KB | 413 |
| The body against the local part's schema (§3): strict, with unknown fields refused, numbers finite and non-negative, enums from their lists, and every string from a closed set | 400 `{"error":"invalid_snapshot","field":"…"}` (never the value) |
| `taken_at` in the past and no more than 5 minutes old at receipt | 400 `{"error":"stale_snapshot"}` |

If it passes, the sink keeps the local part in memory, replacing the last one, and answers 204.

**Every 120 s, and after each accepted local part,** the sink:
1. **Reads the cloud part** from the cloud stack's store as `grafana_ro`: `gateway.v_state` (the kill switch, the meters, the fallback's allowance) and the month's `infra` total ([data-model.md §2.3](../data-model.md#23-the-view-v_state-grows-two-columns)).
2. **Reads** the relay's `GET /api/status` on its internal listener, `http://relay:8081/api/status`, for the local tier's status and the tunnel. The edge listener would refuse it, as a caller on the VM itself ([relay-http.md §1](relay-http.md#1-listener-reachability-and-common-rules)).
3. **Merges** the last local part, with its own `taken_at`, and the cloud part, with its own, into the document (§3).
4. **Writes** it to `s3://<site bucket>/site/status/latest.json` with `Content-Type: application/json` and `Cache-Control: max-age=60`, as its role `h4-prod-public-view-writer` ([env-cloud.md §7](env-cloud.md#7-the-vms-host-credentials-the-operator-session-the-egress-proxy)), through the egress proxy.

**When the local tier is down:** no local part arrives. The document keeps the last local part, with its old `taken_at`, while the cloud part stays fresh. The view never goes dark (FR-057).

**When the VM is down:** nothing is written. The last document stays in the bucket and the edge's cache, and the page shows its age.

## 3. The document

```json
{
  "schema": 1,
  "written_at": "2026-11-02T14:32:00Z",
  "local": {
    "taken_at": "2026-11-02T14:31:58Z",
    "requests_5m": 41,
    "latency_p50_s": 0.38,
    "latency_p95_s": 1.42,
    "error_rate_5m": 0.0,
    "model_server_healthy": true,
    "degraded_causes_1h": { "kill_switch_tripped": 0, "fallback_awaiting_renewal": 0, "no_path_available": 0 }
  },
  "cloud": {
    "taken_at": "2026-11-02T14:32:00Z",
    "kill_switch": "normal",
    "spend_today_usd": 0.27,
    "spend_month_usd": 2.11,
    "infra_month_usd": 1.62,
    "metered_month_usd": 0.49,
    "fallback_remaining_usd": 1.99,
    "ceilings": { "day_usd": 5, "month_usd": 20 }
  },
  "now": {
    "local_tier": "up",
    "tunnel": "up",
    "release": "58bd2327212e",
    "telemetry_delayed_or_lost": { "queued_items": 0, "dropped_items_24h": 0 }
  }
}
```

| Part | Field | From | FR-059 panel |
|---|---|---|---|
| `local` | `requests_5m` | the relay's and the gateways' request counters (through the tunnel's telemetry) | request count |
| `local` | `latency_p50_s`, `latency_p95_s` | `h4.relay.duration`, which covers both paths | latency p50 and p95 |
| `local` | `error_rate_5m` | 5xx that aren't degraded, over all answers | error rate |
| `local` | `model_server_healthy` | the local model server's health | model-server health |
| `local` | `degraded_causes_1h` | `h4.degraded.responses` by cause, the last hour; only the causes spec 000 and [relay-http.md §7](relay-http.md#7-causes-the-relay-adds) define | why responses are degraded |
| `cloud` | `kill_switch` | `v_state.state` | kill-switch state |
| `cloud` | `spend_today_usd`, `spend_month_usd` | `v_state`'s day and month meters (infra included) | spend today and month to date |
| `cloud` | `infra_month_usd`, `metered_month_usd` | the month's `infra` ledger total, and the rest | idle cloud cost next to metered spend |
| `cloud` | `fallback_remaining_usd` | the allowance less the fallback meter's spent and reserved | fallback remaining |
| `now` | `local_tier`, `tunnel`, `release` | the relay's status | the local tier's status, the tunnel's state, the running release |
| `now` | `telemetry_delayed_or_lost` | the cloud collector's queue and drop counters | FR-060's delayed or lost telemetry |

**Rules:**
- **Money** is in USD with two decimals, rounded down. The view isn't the meter.
- **Nothing per client:** the document has no address, label, payload, operator reason, secret, or trace ID. The schema allows none (FR-059).
- **Times** are RFC 3339 UTC.

## 4. The page, `/status/`

A static page in `apps/web`, with no framework and no third-party request. It fetches `/status/latest.json` and `/api/status` on its own origin, every 60 s while it's visible. It shows:
- every field in §3, with its panel's name;
- the times: **"Local values taken at <time> (<age> ago)"** and **"Cloud values taken at <time>"**. An age over 5 minutes shows as stale, in words, not by colour alone (FR-058);
- the local tier's status from `/api/status`, live, with "the Author's machine can't be reached" when it's down (FR-036);
- no write action, no form, no cookie, and no local storage (FR-042).

If `/api/status` fails, the page shows the document's `now` part, and says it is the last known.

## 5. Tests

- **The publisher:** fixture dashboard JSON with `[public]` panels; a stub Prometheus; the posted body against the schema.
- **The sink:** every refusal in §2; the merge with a fresh local part, with an old one, and with none; the written object's headers. A test asserts the document's serialized text never contains the stub's marker address or token.
- **The page:** `apps/web/test_site.py` checks that the page requests nothing off its origin.
