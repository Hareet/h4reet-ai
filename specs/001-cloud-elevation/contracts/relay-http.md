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
2. **The client's address** from `CloudFront-Viewer-Address` (the address, without the port), on 8080 only. Missing: 403 `edge_required` (FR-032).
3. **The public cap** (FR-033): a token bucket and a UTC-day count per address, in memory, sized by `config/budgets.yaml`'s `public` section (the Author's patch). Over it: spec 000's 429 shape, cause `public_cap`, counted with no address.
4. **The kill switch**, from the shared state's `gateway.v_state` as `relay_ro`, `statement_timeout = 250ms` (contracts/shared-state.md §2). If it is `degraded`, unknown, unreadable, or not read successfully within the last 10 s: spec 000's degraded 503 with its cause, not forwarded (FR-030).
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
  "taken_at": "2026-11-12T09:20:00Z"
}
```

| Field | Values | Source |
|---|---|---|
| `serving` | `laptop`, `ec2`, `none` | §4 |
| `ec2` | `running`, `pending`, `stopping`, `stopped`, `interrupted`, `unknown` | the sink's last read (contracts/public-view.md §2), at most 2 minutes old |
| `kill_switch` | `normal`, `degraded`, `unknown` | §3 step 4 |
| `hello_would_get` | `answer` or the cause | §3 |

No model call, no address, nothing per client (FR-037).

## 7. What the relay never keeps or logs

- **Never kept:** the message, the answer, or a body after it responds (FR-031).
- **Never in a log line, span, or metric:** an address.
- **Addresses in memory:** only for the cap, for at most one UTC day (FR-042).
- **Its log:** the route, the host, the status, the cause, the duration, and the request ID.

## 8. While AWS has the tunnel end back (spec FR-076)

The relay is gone with it. CloudFront's error responses answer every dynamic request with `no_host_serving` (contracts/edge.md §4), and `GET /api/status` gets the same fixed body. On its return, the relay starts with empty caps, an unknown kill switch until its first read, and both hosts unhealthy until their checks pass.
