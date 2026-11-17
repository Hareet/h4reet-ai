# Contract: the relay's HTTP API, on the tunnel end

Spec 001, re-planned 2026-11-09. Replaces the September contract (`contracts/relay-http.md` at 00309c47), whose processing order and listener rules it carries; the host choice is new. The relay runs on the tunnel end and picks the host, by the Author's answer to the plan's question 1 ("Relay picks the host"); §8 covers the tunnel end on spot (question 2). Research: R-18, R-07, R-08, R-12.

## 1. Listeners

| Listener | Bound to | Reached by | Serves |
|---|---|---|---|
| 8080, the edge listener | the tunnel end's private interface address, a literal in the compose file's `tunnel-end` profile | CloudFront's VPC origin only | `POST /api/hello`, `POST /api/room/turn`, `POST /api/room/events`, `GET /api/status` |
| 8081, the internal listener | the tunnel end's `127.0.0.1:18505` | the Author, through `make cloud-session HOST=tunnel-end`; `snapshot-sink` | `GET /api/status`; `POST /api/hello` with the fixed identity `192.0.2.10` (spec FR-032's one named exception, as September) |
| 8082, health | the container network | the container's own check | `GET /health/live` |

**The peer rule** (as September): on 8080, a request whose TCP peer is loopback, in the Docker address pool the tunnel end's daemon fixes, or one of the tunnel end's own addresses is refused with 403 `edge_required`. Containers and host processes could otherwise set `CloudFront-Viewer-Address`. The daemon runs without the userland proxy, so published ports keep the source address.

## 2. Routes, and what each forwards

| Relay route | Forwarded to the host's relay block (contracts/tunnel.md §4) as | Body limit |
|---|---|---|
| `POST /api/hello` | `POST /hello` | spec 000's |
| `POST /api/room/turn` | `POST /room/turn` | spec 007's |
| `POST /api/room/events` | `POST /room/events` | spec 002's |
| `GET /api/status` | not forwarded; the relay answers (§6) | — |

Any other method or path: 404, not forwarded.

## 3. Processing order (spec FR-030 to FR-033, FR-063, FR-066)

1. **The probe mark.** `X-H4-Probe: 1` sets `h4.probe=true` on the spans. On anything but `GET /api/status` it gets 400 `probe_not_allowed`: probes never cause a model call (FR-061).
2. **The client's address** from `CloudFront-Viewer-Address` (the address, without the port), on 8080 only. Missing: 403 `edge_required` (FR-032). An IPv6 address is keyed by its /64, the network one subscriber holds, written as that network's first address (`2001:db8:1:2::`), in the cap and in `X-H4-Viewer` alike, so rotating the lower 64 bits rotates nothing past either cap (group 8's review A, I1).
3. **The public cap** (FR-033): a token bucket and a UTC-day count per address, in memory, sized by `config/budgets.yaml`'s `public` section (the Author's patch). Over it: spec 000's 429 shape, cause `public_cap`, counted with no address.
4. **The kill switch**, from the shared state's `gateway.v_state` as `relay_ro`, `statement_timeout = 250ms` (contracts/shared-state.md §2), read on every forwarded request, so a trip reaches the relay within 10 s (SC-008). If it is `degraded`, unknown, or unreadable: spec 000's degraded 503 with its cause, not forwarded (FR-030). A failed read is `store_unreachable` at once, with no grace on the last good read (group 8's review A, I3).
5. **The host** (§4). If none: 503 `no_host_serving` (§5).
6. **Forward,** with:
   - `Authorization: Bearer <that host's relay token>`;
   - `X-H4-Viewer: <address>`;
   - `traceparent`;
   - the body unchanged.

   Never forwarded: `X-Forwarded-For`, `X-H4-Client`, cookies, or any viewer header but `Content-Type` and `Accept`.
7. **The answer:** the host's status and body, with two exceptions:
   - a host's 502 or 504 becomes spec 000's degraded 503 with the host's cause kept, or `host_error` if it gave none, so the relay never answers 502 or 504 and CloudFront's error mapping never hides a cause (research.md R-08);
   - a failure to connect, before the request was sent, is retried once on the other host if it is healthy (§4).

The relay's deadline per forwarded request is 25 s: the gateway's 20 s (`config/routing.yaml`'s `deadline_ms`) plus the hops. The room's own timeout is 35 s (spec 007).

## 4. The host choice

| Rule | Value |
|---|---|
| Each host's check | `GET /health` on its relay block, with its token, every 1 s, 800 ms timeout |
| Healthy means | 200, which the block answers only while its gateway is up and reports the shared state readable (contracts/tunnel.md §4) |
| Unhealthy after | 1 failed check |
| Healthy again after | 3 passing checks in a row |
| The order | the laptop while healthy; else EC2 while healthy; else `none` |
| On a change | the relay writes a row to `gateway.handover_events` as `relay_rw` (data-model.md §1.2); a move out of `none` records the gap since the last answer |

The laptop is reached at `tunnel-end:2201`, the tunnel's reverse forward. EC2 is reached at its private address, port 8085, inside the VPC.

## 5. Causes this contract adds

| Cause | Status | When | Room's class (spec 002 §3, amended by name) |
|---|---|---|---|
| `no_host_serving` | 503 | neither host is healthy | local tier off: `cannot_talk.resting` |
| `host_error` | 503 | a host answered 502 or 504 with no cause | local tier off |
| `public_cap` | 429 | §3 step 3 | `turn_refused.slow_down` (spec 007, for a 429) |
| `edge_required`, `probe_not_allowed` | 403, 400 | §3 steps 1 and 2 | — |

Bodies use spec 000's degraded shape, with `X-H4-Degraded-Cause`.

## 6. `GET /api/status`

```json
{
  "serving": "laptop",
  "since": "2026-11-12T09:14:03Z",
  "ec2": "stopped",
  "kill_switch": "normal",
  "hello_would_get": "answer",
  "taken_at": "2026-11-12T09:20:00Z",
  "local_tier": "up",
  "state": "normal",
  "cause_now": null
}
```

| Field | Values | Source |
|---|---|---|
| `serving` | `laptop`, `ec2`, `none` | §4 |
| `ec2` | `running`, `pending`, `stopping`, `stopped`, `interrupted`, `unknown` | the sink's last read (contracts/public-view.md §2): `serving.ec2_state` of the document its host write keeps, `/var/lib/h4reet/snapshot/latest.json`, bound read-only into the relay and read at most once in 5 s; `unknown` when missing, unreadable, more than 150 s old (the write's 2 minutes and its run's 30 s), or more than a minute ahead (F7, night 5: until then nothing supplied it, and the relay always said `unknown`) |
| `kill_switch` | `normal`, `degraded`, `unknown` | §3 step 4 |
| `hello_would_get` | `answer` or the cause | §3 |
| `local_tier` | `up` while the laptop serves, else `down` | spec 004's Amendment A1 |
| `state` | `kill_switch`'s value | A1 |
| `cause_now` | `hello_would_get`'s cause, or `null` for `answer` | A1 |

No model call, no address, nothing per client (FR-037). **From spec 004's Amendments A1 and A2** (group 8's review A, I2): the status has its own bucket, 30 a minute with a burst of 10 per address, apart from hello's; over it, 429 `{"error": "relay_cap_exceeded", "limit": "status_per_minute", "retry_after_s": <n>, "request_id": "…"}` with `Retry-After: <n>`. It reads the store at most once in 5 s; hello reads it every request. A status answered below 500 makes no span, and its requests and 429s are counted apart from hello's (§9).

## 7. What the relay never keeps or logs

- **Never kept:** the message, the answer, or a body after it responds (FR-031).
- **Never in a log line, span, or metric:** an address.
- **Addresses in memory:** only for the cap, for at most one UTC day (FR-042).
- **Its log:** the route, the host, the status, the cause, the duration, and the request ID.

## 8. While AWS has the tunnel end back (spec FR-076)

The relay is gone with it. CloudFront's error responses answer every dynamic request with `no_host_serving` (contracts/edge.md §4), and `GET /api/status` gets the same fixed body. On its return, the relay starts with empty caps, an unknown kill switch until its first read, and both hosts unhealthy until their checks pass.

## 9. The dashboard's Hosts row: the relay (group 8)

(new in group 8; tasks.md T110; FR-060.) `deploy/grafana/dashboards/h4-runtime.json`'s "Hosts" row, below group 7's panels (contracts/releases-deployer.md §6):

| Panel | Type | Query |
|---|---|---|
| Which host serves (FR-060) | state timeline | `max by (h4_serving) (h4_serving_host)` |
| Handovers and their gaps (SC-007, SC-016) | table (SQL) | `SELECT at AS "time", from_host, to_host, reason, gap_ms / 1000.0 AS gap_s FROM gateway.v_handovers ORDER BY at DESC LIMIT 50` |
| The relay's requests by host and outcome (FR-060) | time series | `sum by (h4_relay_host, h4_relay_outcome) (rate(h4_relay_requests_total[5m]))` |
| The public cap's refusals (FR-033) | time series | `sum by (h4_cap_limit) (increase(h4_cap_refused_total[1h]))` |

- **`h4_serving_host`** is `h4.serving_host`, a one-hot gauge the relay observes every export, labelled `h4.serving` (`laptop`, `ec2`, `none`): 1 for the host it sends to now. The timeline shows `none`'s 1 in red, by a value mapping of its own, since a mapping's colour wins over a field's. Beside it the relay reports `h4.relay.host_healthy`, labelled `h4.relay.checked`, 1 while it counts a host healthy (§4). Neither label is `h4.relay.host`, which the tunnel end's collector routes on per datapoint: each series reaches both hosts' Prometheus, and the one-hot set stays whole in either (group 8's review A, I4).
- **The handovers** come from the shared state's `gateway.v_handovers` (data-model.md §1.2), through `grafana_ro`, so the panel answers while telemetry is down: each change of serving host, its reason, and the gap, in seconds, on a move out of `none`. The relay also counts `h4.handover.events` by direction and reason, and records `h4.handover.gap_seconds`.
- **`h4_relay_requests_total`** is `h4.relay.requests`, labelled `h4.relay.host` (the host the relay sent to, or `none`), `h4.relay.outcome` (`answered`, `degraded`, `refused`, `status`), `http.route`, and, from spec 004's Amendment A2, `h4.relay.route` (`hello`, `status`, or `other`). Never an address. A status answered below 500 makes no span (A2), and the relay observes `h4.relay.status.class`, one-hot by `h4.class` (`local`, `cloud`, `resting`, `budget`, `unavailable`, `unknown`), the class its status would reduce to now; spec 004's "Room live state" panel reads both.
- **`h4_cap_refused_total`** is `h4.cap.refused`, labelled `h4.cap.limit` (`per_minute`, `per_day`, `global_in_flight`, and the status bucket's `status_per_minute`) and `h4.relay.route`, never by address.
- The relay's spans, `relay.request`, carry `h4.relay.host`, `h4.relay.reason`, `h4.degraded.cause`, `h4.cap.refused`, and `h4.probe`, and reach the serving host's collector through the tunnel end's (C15), so the gateway's spans are their children. `deploy/scripts/test_dashboard.py` reads this section's table with the other Hosts sections'.
