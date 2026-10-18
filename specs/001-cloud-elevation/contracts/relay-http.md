# Contract: the relay's HTTP API (`POST /api/hello`, `GET /api/status`)

Spec 001 (FR-017, FR-025, FR-029 to FR-037, FR-042, FR-054, FR-060, FR-061) · Plan: [§4.2](../plan.md#42-the-relay-fr-029-to-fr-033-fr-035-to-fr-037-r-18), [§5.3](../plan.md#53-health-failover-and-recovery-fr-054-r-12) · Research: [R-18](../research.md#r-18-the-relay-a-thin-typescript-service), [R-12](../research.md#r-12-the-local-paths-health-and-the-local-edges-tunnel-blocks)

The relay is `services/relay`, a container in the one compose definition (FR-029). This contract covers:
- what visitors reach through the edge;
- the order of its checks;
- the two paths and how it chooses between them;
- every answer it gives, and the causes it adds to spec 000's;
- its telemetry.

The gateway's own answers, which the relay passes on, are spec 000's [gateway-http.md](../../000-local-foundations/contracts/gateway-http.md). Where this file says "spec 000's degraded body", it means that contract's §2.5.2 shape, with its fields and rules unchanged.

## 1. Listener, reachability, and common rules

- **Where it listens.** Two listeners in its container:
  - **8080, the edge listener.** On the cloud stack, compose publishes it at the literal `10.42.1.10:8080`, the VM's private interface, which is CloudFront's VPC origin ([edge.md §2](edge.md#2-origins)). Its security group admits only CloudFront's origin-facing prefix list. That keeps the internet out, but not the VM's own containers and host processes, which reach `relay:8080` directly. So, on the cloud stack, the edge listener refuses with 403 `not_through_edge` any request whose TCP peer is:
    - a loopback address;
    - an address in the Docker address pool the VM's `daemon.json` fixes (`default-address-pools`, `172.30.0.0/16`), which every compose network on the VM is cut from;
    - one of the VM's own interface addresses (`10.42.1.10`, `10.42.0.10`).

    Traffic from outside the VM keeps its source address through Docker's published-port NAT, because the VM's daemon runs with `"userland-proxy": false`, so no proxy rewrites it. Whether CloudFront's VPC-origin traffic arrives from the origin-facing ranges or from its service interface in the private subnet, it's in none of those three, and is admitted (measured in group 6, quickstart §6.5).
  - **8081, the internal listener,** on the `internal` network only, and published at the VM's `127.0.0.1:18505` for the operator's session. It serves `GET /api/status` to other services (the snapshot sink), and `POST /api/hello` for the Author's test client only (§2). It never serves a visitor.
  - **On dev and dev-cpu (the `dev-relay` profile):** neither listener is published, and the edge listener's peer rule is off, since there the peer is the caller (§2). The breach probe calls `http://relay:8080` on the stack's network.
- **Its paths:**
  - CloudFront forwards `/api/hello` and `/api/status` with the `/api` prefix, and the relay serves them as written.
  - `GET /health/live` is for the container's own check, answers `{"status":"live"}`, and produces no span.
  - Any other path gets 404 `{"error":"not_found","request_id":"…"}`, and any other method 405.
- **Headers on every response:** as spec 000's gateway (`Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `X-Request-Id`), plus `X-H4-Path` (§6.3). No CORS headers: the site calls the relay on its own origin.
- **The request ID:** the relay generates 32 lowercase hex characters for each request, and sends it on as `X-Request-Id`, so the gateway that answers adopts it.
- **Trace context:** the relay drops any `traceparent`, `tracestate`, or `baggage` a visitor sends, and starts every trace itself.
- **Body size:** 16 KB, as spec 000's edge: 413 `{"error":"body_too_large","limit_bytes":16384}`.
- **What it keeps:** nothing after it answers. It logs neither the message nor the answer, nor the address (FR-031, FR-042). Its access log line has the method, the path, the status, the duration, the path taken, and the cause.

## 2. The client's address (FR-032)

- **Where it comes from:** CloudFront sets `CloudFront-Viewer-Address` to the visitor's address and port, as `<ip>:<port>` (an IPv6 address is in brackets). The relay keeps the address and drops the port.
- **Without that header,** the request didn't come through the edge: 403 `{"error":"not_through_edge","request_id":"…"}`, counted, with no address logged. On dev and dev-cpu, where no edge exists, the relay takes the address from its TCP peer instead. That is `H4_STACK`-dependent, never a header a caller chooses.
- **What makes the header trustworthy** is the path, not the header. On the edge listener, the security group lets in only CloudFront's origin-facing ranges, and §1's peer rule refuses everything on the VM itself, so only CloudFront's VPC origin, which sets the header, reaches it (FR-032). CloudFront replaces a `CloudFront-Viewer-Address` a visitor sends with its own; group 6 measures that by sending a forged one (quickstart §6.5).
- **The one exception, named (FR-032):** the Author's test client. `make hello ENV=cloud` reaches the internal listener through the Author's Systems Manager session ([env-cloud.md §7](env-cloud.md#7-the-vms-host-credentials-the-operator-session-the-egress-proxy)), an identity-based, short-lived session on the Author's own SSO login, before the edge exists and for tests after. The internal listener ignores any `CloudFront-Viewer-Address` and always uses the fixed address `192.0.2.10`, from the documentation range, as the client's identity, with the same cap, kill switch, and path as a visitor. So a caller on the internal network can't choose an identity either, and the relay tells the test client from a visitor by the listener it arrived on, never by a header.
- **What the relay sends on:**
  - to the fallback gateway, as the one value of `X-Forwarded-For`. The gateway believes it because the relay is a trusted peer on the cloud stack ([data-model.md §3](../data-model.md#3-routing-the-cloud-stacks-class));
  - to the local path, as `X-H4-Viewer`. The local `edge`'s tunnel block moves it into `X-Forwarded-For` after its token check ([tunnel.md §5](tunnel.md#5-the-local-edges-tunnel-blocks)).
- **Where the address never goes:** no metric, span, log, alert, or store (FR-042). It lives in the cap's memory (§4) for at most one UTC day.

## 3. `POST /api/hello`: processing order

Each step passes or answers.

1. **The probe mark.** A request with `X-H4-Probe: 1` gets 400 `{"error":"probe_not_allowed","request_id":"…"}`: probes call status only, and never a model (FR-061).
2. **The address** (§2). Without it: 403 `not_through_edge`.
3. **The public cap** (§4). Over it: 429 `relay_cap_exceeded`.
4. **Validation,** spec 000's rules for hello's body (`Content-Type: application/json`, at most one field, `message`, 1 to 500 code points). The relay checks them itself, so an invalid body never crosses the tunnel. The answers are spec 000's 415 and 400 shapes.
5. **The kill switch of record** (§5). Unknown or tripped: 503, spec 000's degraded body, with no forwarding.
6. **The path** (§6). The relay forwards to the local path while it's healthy, else to the fallback gateway. A failed or degraded local answer goes to the fallback gateway once.
7. **The answer.** The gateway's 200, 429, or 503 passes through with its body unchanged, plus `X-H4-Path` and the relay's own `X-Request-Id`, which is the same ID. A 502 never does: the relay turns it into a degraded 503 that keeps its cause (§6.2), so at the edge a 502 or 504 always means the relay wasn't reached ([edge.md §5](edge.md#5-the-edges-own-degraded-body)).

**The deadline** is 28 s from arrival: the local path gets at most 12 s, and the fallback what remains. CloudFront's origin read timeout is 30 s ([edge.md §2](edge.md#2-origins)), so the edge never cuts an answer the relay would still give. If the fallback gateway gets less than 5 s, the relay answers degraded, `no_path_available`, instead of starting a call it can't finish.

## 4. The public cap (FR-033)

Counted in memory, per address, in the relay process.

| Limit | Default | From | Over it |
|---|---|---|---|
| Rate | 10 a minute, burst 3 (a token every 6 s) | `config/budgets.yaml` `public.per_address` | 429 `relay_cap_exceeded`, `limit: "per_minute"` |
| Day | 200 per UTC day | the same | 429, `limit: "per_day"` |
| In flight, across all addresses | 8 | `config/budgets.yaml` `public.global_in_flight` | 429, `limit: "global_in_flight"` |

```json
{ "error": "relay_cap_exceeded", "limit": "per_minute", "retry_after_s": 6, "request_id": "…" }
```

- **Headers:** `Retry-After: <retry_after_s>`. It's a refusal, not a degraded state: no `X-H4-Degraded-Cause`, as spec 000's 429s.
- **What counts:** every `POST /api/hello`, including one that ends in 400 or 503. `GET /api/status` counts against a separate bucket of 30 a minute, burst 10, so a page that polls status can't spend a visitor's hello allowance.
- **Memory bounds:** at most 50,000 addresses, evicting the least recently seen; idle entries dropped after one UTC day; everything lost on restart. That's acceptable: the meter, not the cap, bounds spend. Spec 000's per-client cap still runs in the gateway that answers, now on a real address (FR-032).
- **Why the defaults are tighter than spec 000's per-client cap** (20 a minute, burst 5, 500 a day): the relay's cap is the outer one, for the public internet, and the per-client cap stays the inner one.

## 5. The kill switch of record (FR-030)

- **The read:** at step 5 of every hello, the relay reads the meter of record's state as the role `relay_ro`. It uses the same pool rules as the gateway (`statement_timeout=250ms`, 500 ms to connect), against the cloud stack's `gateway-state` ([data-model.md §2.4](../data-model.md#24-the-role-relay_ro)):

  ```sql
  SELECT state, since, crossed FROM gateway.v_state;
  ```

- **Its outcomes:**

  | Outcome | Answer |
  |---|---|
  | `normal` | continue |
  | `degraded` | 503 `kill_switch_tripped`, with `ceilings` from `crossed` and `since` |
  | no row | 503 `store_uninitialized` |
  | an error or timeout | 503 `store_unreachable` |

- **No cache on hello:** every hello reads, so the relay's answer follows a trip within one request, inside FR-030's 10 seconds and SC-008. `GET /api/status` uses a read up to 5 s old.
- **The local stack's own kill switch** isn't read by the relay. If it is tripped, the local path answers degraded, and the relay treats that as a failed local path (§6.2). Only the meter of record's switch stops every answer (spec Clarifications, 2026-10-12).
- **On dev and dev-cpu** the relay reads its own stack's store, which is how the breach test asserts FR-025.

## 6. The path

### 6.1 The local path's health (FR-054)

- **The check:** every second, the relay calls `GET http://tunnel-end:2201/health` with `Authorization: Bearer ${H4_TUNNEL_API_TOKEN}` and an 800 ms timeout.
- **What passes:** a 200 whose body's `status` is `"ok"`, the local gateway's own verdict that a hello would be answered now ([gateway-http.md §5](../../000-local-foundations/contracts/gateway-http.md#5-get-health)).
- **What fails:** anything else, including a refused connection, which is what a dropped tunnel looks like.
- **The rule** is spec 000's: unhealthy after one failure, healthy again after three passes in a row.

```text
             1 failure                       3 passes in a row
  healthy ───────────────► unhealthy ───────────────────────────► healthy
```

- **On dev and dev-cpu,** where there is no tunnel, the local path is the stack's own `edge:8080`, and the same rule applies.
- **At startup** the path is unhealthy until its third pass, so a fresh relay never sends a visitor down an untested tunnel.

### 6.2 Choosing, and falling back once

| The local path | The relay | `X-H4-Local-Path` sent to the fallback gateway |
|---|---|---|
| healthy | `POST http://tunnel-end:2201/hello`, the visitor's body unchanged, with `Authorization`, `X-H4-Viewer`, `X-Request-Id`, and `Content-Type`; at most 12 s | – |
| healthy, but the call fails: refused, reset, or over 12 s | marks the path unhealthy, then calls the fallback gateway | `failed` |
| healthy, but it answers 503 with `X-H4-Degraded-Cause` | the path stays as its checks say; calls the fallback gateway | `degraded` |
| healthy, but it answers 502 `local_error` | doesn't fall back: the local model rejected the request, and retrying elsewhere would spend for nothing (spec 000's rule). It answers 503 with spec 000's degraded body and the cause `local_error` (§7), so the edge never sees a 502 from the relay | – |
| unhealthy | calls the fallback gateway at once | `unhealthy` |

- **The fallback call** is `POST http://gateway:8080/hello` on the cloud stack, with `X-Forwarded-For`, `X-Request-Id`, and `X-H4-Local-Path`.
- **The fallback gateway's answer** passes through as it is: a 200 with `route: "fallback"`, or a degraded body naming its own cause (`fallback_awaiting_renewal`, `meter_at_ceiling`, and so on). A 502 from it (no route in `prod-cloud` produces one, but a fault could) becomes a degraded 503 with the cause `upstream_error`.
- **Once only.** The relay never retries the fallback gateway, and never goes back to the local path within one request.
- **If the relay can't reach the fallback gateway** (a refused connection or a timeout), the answer is 503 `no_path_available` (§7).

### 6.3 `X-H4-Path`

On every hello answer: `local`, `fallback`, or `none` (the relay answered itself). The status document and the relay's span carry the same value.

## 7. Causes the relay adds

Spec 000's degraded body, with `stack` set to `"cloud"` and `trace_id` set to the relay's trace. These join spec 000's table of causes (its §3), and the dashboard's "why degraded" panel lists them.

| Cause | Meaning | `since` | `detail` (fixed text) |
|---|---|---|---|
| `no_path_available` | the local path is unhealthy, failed, or degraded, and the fallback gateway didn't answer, or too little of the deadline was left for it (FR-034) | when the fallback gateway was last unreachable; null for the deadline case | Neither the Author's machine nor the cloud fallback can answer right now. |
| `local_error` | the local path answered spec 000's 502 `local_error`: the local model rejected this request. The relay doesn't fall back (§6.2) | null | The Author's machine couldn't answer this message. |
| `upstream_error` | the fallback gateway answered 502, which no `prod-cloud` route should produce | null | The cloud fallback couldn't answer this message. |
| `edge_origin_unreachable` | the edge couldn't reach the relay. CloudFront serves this body itself, never the relay ([edge.md §5](edge.md#5-the-edges-own-degraded-body)) | null | The site's API is not answering. The edge answered instead. |

The relay also answers with three of spec 000's causes from its own read (§5): `store_unreachable`, `store_uninitialized`, and `kill_switch_tripped`, with spec 000's fixed texts.

**Refusals, not degraded states:** `not_through_edge` (403), `probe_not_allowed` (400), and `relay_cap_exceeded` (429).

**The relay never answers 502 or 504.** Its own failures are 503s with a cause, so CloudFront's custom 502 and 504 responses mean only that the relay wasn't reached.

## 8. `GET /api/status` (FR-037)

No model call, ever. Probes call it with `X-H4-Probe: 1`, which marks its spans so they never reach traces (FR-061).

```json
{
  "local_tier": "up",
  "tunnel": "up",
  "state": "normal",
  "cause_now": null,
  "release": "58bd2327212e",
  "time": "2026-11-02T14:31:07Z",
  "request_id": "9c1e5b0a3f2d4e6b8a7c1d2e3f4a5b6c"
}
```

| Field | Values | Meaning |
|---|---|---|
| `local_tier` | `"up"` or `"down"` | the local path's health (§6.1) |
| `tunnel` | `"up"` or `"down"` | whether `tunnel-end` holds the client's connection. A tunnel can be up while the local tier is down (the model is off) |
| `state` | `"normal"`, `"degraded"`, or `"unknown"` | the meter of record's kill switch (§5); `unknown` for an unreachable or empty store |
| `cause_now` | null, or a cause | the cause a hello would get now: the kill switch's if it is set; else null while the local path is healthy; else the fallback gateway's `/health` `degraded_cause` (read with a 1 s timeout, cached 5 s), or `no_path_available` |
| `release` | 12 hex characters | the running release's commit |
| `time` | RFC 3339 | the relay's clock |

- **Status:** always 200, even while degraded: it reports, it doesn't gate.
- **Its cap:** as §4, a bucket of 30 a minute, burst 10.
- **The site** shows its notice ("the Author's machine can't be reached") when `local_tier` is `down` (FR-036).

## 9. Timeouts and limits

| Limit | Value | Source | On breach |
|---|---|---|---|
| Request body | 16 KB | the relay | 413 |
| Whole request | 28 s | a constant | `no_path_available` |
| Local path, per call | 12 s | a constant | falls back once (§6.2) |
| Local path, health | every 1 s, 800 ms timeout; unhealthy after 1 failure, healthy after 3 passes | a constant (spec 000's local health rule) | path unhealthy |
| Fallback gateway, connect | 1 s | a constant | `no_path_available` |
| Store read | 250 ms per statement, 500 ms to connect | the pool | `store_unreachable` |
| Public cap | §4 | `config/budgets.yaml` `public` | 429 |

## 10. Telemetry (FR-060)

- **The span:** `relay.request`, the server span, with:
  - `h4.relay.path` (`local`, `fallback`, `none`) and `h4.relay.reason` (null, `unhealthy`, `failed`, `degraded`);
  - `h4.degraded.cause`, `h4.cap.refused` (the limit's name), and `h4.stack`;
  - `http.response.status_code`, and `h4.probe` when the probe header is present.

  Client spans cover the call to the local path and the call to the fallback gateway. The local path's trace continues on the local tier through `traceparent`, which the local `edge`'s tunnel block keeps from the relay and from no one else ([tunnel.md §5](tunnel.md#5-the-local-edges-tunnel-blocks)).
- **Metrics:**
  - `h4.relay.requests` (counter): `h4.relay.path`, `h4.outcome` (`answered`, `degraded`, `refused`, `invalid`);
  - `h4.relay.duration` (histogram, seconds): `h4.relay.path`;
  - `h4.relay.cap_refusals` (counter): `h4.cap.limit`;
  - `h4.relay.local_path.healthy` (gauge, 0 or 1);
  - `h4.degraded.responses` (spec 000's counter), with the relay's causes.
- **Never an attribute:** the address, the message, or the answer.
- **Logs:** pino, with `event` names `relay.request`, `relay.path.change` (healthy ↔ unhealthy, with no address), and `relay.state.unknown`.

## 11. Tests

The vitest suite in `services/relay/test/` uses:
- a PGlite store with the `v_state` view;
- a stub fallback gateway, and a stub local path that can be healthy, slow, refusing, degraded, or 502.

Each row of §3, §4, §5, §6.2, and §7 is a case, and so are §1's peer rule (a loopback, a pool, and an own-interface peer refused on the edge listener with `H4_STACK=cloud`; an outside peer admitted) and §2's exception (the internal listener ignoring a sent `CloudFront-Viewer-Address`). The suite also asserts that no log line holds the test's marker message or the test's address, and that no answer is a 502 or 504.
