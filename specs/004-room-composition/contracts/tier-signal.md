# Contract: the tier signal (the laptop and its charger)

Spec 004: FR-041 to FR-045, with FR-060 (pause), FR-062, FR-074, and FR-076; SC-003, SC-004, SC-012; User Stories 2 and 8; Amendments A1, A2, and A4; Confirmations 9, 14, 15, and 17. Plan: [plan.md](../plan.md). Research: [research.md](../research.md). Data: [data-model.md](../data-model.md). Related contracts: [room-bundle.md](room-bundle.md) (how the live configuration and the switch reach the page), [turn-cost.md](turn-cost.md) (row 7's cue), and [room-live-state-telemetry.md](room-live-state-telemetry.md) (the relay's series and the panel).

The Author: "The laptop next ot the monitor should be plugged in, only when we are running locally, and unplugged when it has failed over to the cloud." The intent: "Unknown means degraded, and the laptop is never plugged in on unknown."

How the room keeps both:
- one pure function reduces the tier from what the page knows (§3);
- the poller is the only code in the room that asks the relay anything (§5);
- the laptop's switch and the text copy show the result at once (§6).

The tier gates nothing. The room renders in full whatever it reads (FR-062), and the talk panel decides from its own turn's answer, never from the tier. Nothing here calls a model (FR-076), stores anything, or runs before the visitor enters the room.

## 1. The live configuration

The `live` block of the scene file, `apps/web/room/scene.yaml` (the file's schema is in [room-data-files.md](room-data-files.md)). Switching a source on is a reviewed data edit, and the compositor refuses, in its rule family RL, anything the rules below don't allow.

| Key | Values | Default | What it sets |
|---|---|---|---|
| `source` | `off`, `site` | `off` | The live source. `site` polls `GET /api/status` on the room's own origin (§5). `off` makes no request and shows `not-live` (FR-041 row 1, FR-045). |
| `poll_s` | an integer from 30 to 120 | 30 | The poll interval, in seconds (FR-044). |
| `freshness_s` | an integer, at least `poll_s` + 5 | 35 | The freshness window, in seconds (FR-042). |
| `turn` | `off`, `site` | `off` | Whether the conversation's turn route, `POST /api/room/turn`, exists on the room's origin. While it is `off`, both of the neon sign's counters read "cost unavailable" ([turn-cost.md](turn-cost.md); FR-048). |
| `asset_events` | `off`, `site` | `off` | Whether spec 003's asset events go to `POST /api/events` ([room-live-state-telemetry.md](room-live-state-telemetry.md); FR-071). |

No other key is allowed: the schema refuses any key it doesn't define (FR-005).

**Constants, not data.** The request's 5-second timeout and the backoff's 120-second cap are FR-041's and FR-044's own figures; FR-042 and FR-044 make only the freshness window and the poll interval configuration. So the timeout and the cap are constants in `apps/web/src/room/signals/status-poller.ts`, pinned by its tests, and the scene file has no key for them: no data edit can move them past the spec's table. Confirmation 15 keeps the cadence: a request every 30 seconds, a 35-second window, a 5-second timeout, and backoff to 120 seconds.

**How it reaches the page.**
- The index, `room` in `virtual:room-content` (the entry chunk), carries `live: {source, turn, asset_events, poll_ms, freshness_ms}`, with the two durations in milliseconds. So the 2D room and the text copy read it without waiting for the 3D chunk (FR-011).
- `room-manifest.json` carries `live_source` (Amendment B7).

**The rules.** Findings take the compositor's form, `<rule> <file>:<path>: <reason>`, and never echo a value.

| Rule | Refuses | Why |
|---|---|---|
| RL1 | `poll_s` that isn't an integer from 30 to 120; `freshness_s` that isn't an integer of at least `poll_s` + 5 | 30 keeps A1's "at most 2 requests a minute". 120 is the backoff's cap: past it, a failure would shorten the wait instead of doubling it. The freshness floor is FR-042's "at least the poll interval plus the request timeout". |
| RL2 | `source: site` while `docs/data-flow-disclosure.md` has no row `V7` whose **From → To** names `GET /api/status`, whose **Trigger** names the room and its cadence as `every <poll_s> s` or `every <poll_s> seconds`, and whose **How to switch it off** names "Pause the room" | FR-074: the room never polls without Amendment A4's words on the status row. A changed interval needs the row changed in the same change. |
| RL3 | `asset_events: site` while the disclosure has no row `V6` whose **From → To** names `POST /api/events` | Spec 003's FR-040b: the asset events' row lands in the change that adds their route. |
| RL4 | `turn: site` while the disclosure has no row `V2` whose **Carries** names the turn's estimated cost and its route | FR-075 and Amendment B6: the turn row says what the reply carries before the sign reads it. |

- **Where RL2 to RL4 hold.** They read the disclosure from the tree being built, which the web image's build stage already copies. So they hold in `make test`, in the image build, in the gate's container, and in spec 001's release build (Amendment A5). A scene that would poll without its row can't be built, so it can't be deployed (FR-074).
- **Row IDs** follow the scheme the plan records for Confirmation 17, which spec.md states as Amendment A7: the first row written keeps its ID. Spec 001's planned V2, "hello and the status request", is therefore `V7`.

**Who switches each source on, and when.**
- **`source: site`** comes in User Story 8's switch-on change. It lands only once spec 001 serves `GET /api/status` on the room's origin with Amendments A1 to A3, and it carries A4's words on `V7` and the "Room live state" panels (FR-045, FR-074). RL2 checks the row; the change's merge-request note shows the route served.
- **`turn: site`** comes in the twin's spec's change that adds `POST /api/room/turn` (Amendments A5, B6), with B6's words on `V2`. Before paid figures reach public visitors, the Author runs Confirmation 6's price check.
- **`asset_events: site`** comes in spec 001's change that adds `POST /api/events`, with row `V6`.

Until then all three stay `off`, and every visitor sees the not-live laptop and "cost unavailable" (User Story 2, scenario 1).

## 2. The tier's values

Eight values. They are the code's closed vocabulary (`apps/web/src/room/compose/vocabulary.ts`), which the compositor's switch rules read too.

| Value | From (§3) | The laptop (FR-043) | Its sentence's UI word | What the sentence says |
|---|---|---|---|---|
| `local` | row 8 | the plugged pose; no other value shows it | `tier.local` | "The Author's machine is serving" (FR-035) |
| `cloud` | rows 7, 9 | the cloud pose; no other value shows it | `tier.cloud` | "The cloud fallback is serving" (FR-035) |
| `resting` | row 6 | the shared pose | `tier.resting` | nothing is serving: the Author's machine is resting, and the cloud fallback isn't available |
| `budget` | row 6 | the shared pose | `tier.budget` | nothing is serving: today's budget is used |
| `unavailable` | row 6 | the shared pose | `tier.unavailable` | nothing is serving: the service is unavailable |
| `unknown` | rows 3, 4, 5, 10 | the shared pose | `tier.unknown` | "Status unknown" (FR-035) |
| `paused` | row 2 | the shared pose | `tier.paused` | the status isn't checked while the room is paused or out of view |
| `not-live` | row 1 | the shared pose | `tier.not-live` | the live status isn't connected yet |

- **Three poses** (Q2, answered 2026-10-22): plugged in (the local tier serves), the cloud pose (the cloud fallback serves), and the shared pose, the plug resting on the desk (nobody serves now, or nobody knows). Each value keeps its own switch case, so splitting a pose later is a data edit.
- **The compositor refuses** a scene in which any value but `local` can show the plugged pose, or any value but `cloud` can show the cloud pose (FR-043). That is its switch-and-claim family, RS ([room-data-files.md](room-data-files.md)).
- **The runtime holds the same line**, whatever a bundle says. It draws the case that claims `local` only for `local`, and the case that claims `cloud` only for `cloud`; any other mapping falls to the shared case. So a faulty bundle can neither plug the laptop in nor leave the room blank (FR-062).
- **The sentences are UI words.** Agents draft them, they are reviewed like spec 002's `messages.yaml`, and spec 002's checks C9, C6, and C8 apply (FR-035). Three are FR-035's own words; the other five are drafted to the column above. Every sentence speaks about the machine and never claims that the twin is answering, and the compositor refuses one that names the twin.
- **The text copy** shows the switch's label and the current sentence. It updates in place, with no live region, so a poll announces nothing (FR-063). `Paused at <time>` is a separate line, the pause control's (FR-060); `tier.paused` explains the laptop beside it.

## 3. The reducer, `reduceTier`

`apps/web/src/room/signals/tier.ts`: pure TypeScript, with no DOM or Three.js, in the entry chunk.

```ts
type TierValue = "local" | "cloud" | "resting" | "budget" | "unavailable" | "unknown" | "paused" | "not-live";

/** The three fields the room reads from GET /api/status; tunnel, release, time, request_id, and any later field are ignored. */
interface StatusAnswer { local_tier: string; state: string; cause_now: string | null }

type StatusResult =
  | { ok: true; started: number; ended: number; endedWall: number; answer: StatusAnswer }
  | { ok: false; started: number; ended: number; endedWall: number;
      why: "network" | "timeout" | "status" | "shape"; status?: number; retryAfterMs?: number };

interface TierInputs {
  live: "off" | "site";           // live.source
  paused: boolean;                 // "Pause the room" (FR-060)
  hidden: boolean;                 // the page isn't visible (§5.4)
  now: number;                     // the room's Clock: monotonic milliseconds
  wallNow: number;                 // the wall clock: milliseconds since the epoch
  freshnessMs: number;             // live.freshness_ms
  last: StatusResult | null;       // the last completed status request; null before the first completes
  fallbackReplyAt: number | null;  // the Clock's time of the last turn reply whose route was "fallback"
}

interface TierReading { tier: TierValue; row: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10; recheckAt: number | null }

function reduceTier(inputs: TierInputs): TierReading;
```

Rows are tried in order, and the first that matches wins (FR-041). Below, `answer` is `last.answer`, and `age` is `max(now − last.ended, wallNow − last.endedWall)`.

| Row | Condition, in the inputs' terms | Tier | `recheckAt` |
|---|---|---|---|
| 1 | `live` is `"off"` | `not-live` | null |
| 2 | `paused` or `hidden` | `paused` | null |
| 3 | `last` is null, or `last.ok` is false | `unknown` | null |
| 4 | `age ≥ freshnessMs` | `unknown` | null |
| 5 | `answer.state` is `"unknown"` | `unknown` | `now + freshnessMs − age` |
| 6 | `answer.cause_now` isn't null | `causeClass(answer.cause_now)` (§4) | the same |
| 7 | `fallbackReplyAt` isn't null, and `fallbackReplyAt > last.started` | `cloud` | the same |
| 8 | `answer.state` is `"normal"`, and `answer.local_tier` is `"up"` | `local` | the same |
| 9 | `answer.state` is `"normal"`, and `answer.local_tier` is `"down"` | `cloud` | the same |
| 10 | anything else | `unknown` | the same |

- **A valid answer** (`ok: true`) is a 200 whose whole body arrived inside the 5-second timeout and parses as a JSON object holding `local_tier` and `state` as strings and `cause_now` as a string or null. Anything else is a failure with its `why` (§5.2), which is row 3's "failed, took over 5 s, answered other than 200, or lacked any of the three fields". Other fields are ignored, now and when spec 001 adds more (A1: the shape doesn't change).
- **Rows 4 to 10 are reached only when the last completed request was valid.** There `last` is the last valid answer, and `recheckAt` is the instant it turns stale. The live controller re-reduces then (§6), so the plugged pose leaves on the first frame after a stale answer (SC-003).
- **Two clocks, each used conservatively.** An answer's age is the larger of its monotonic age and its wall-clock age, so a device that slept can't make an old answer look fresh. The schedule (§5.3) uses the monotonic clock alone, so a changed wall clock can't put two requests inside one interval.
- **Reading of row 7's "after".** FR-041 says a fallback reply "received after the last valid answer". The reducer compares the reply with the moment that answer's request *began*. An answer whose request was already in flight when the fallback answered may predate the failover the reply reports, so it doesn't undo the cue. This reading only ever shows `cloud` where the literal one would show `local`, never the reverse. It keeps Confirmation 9: "once a paid call answers, the laptop isn't shown plugged in until a later valid status answer says the local tier serves".
- **A request in flight changes nothing** (FR-042): it isn't an input.

## 4. `causeClass`, shared with the talk panel

Row 6 classes the relay's `cause_now` with the talk panel's own map, so the laptop and the "can't talk" message never disagree about a cause.

```ts
type CauseClass = "resting" | "budget" | "unavailable";
function causeClass(cause: string | null | undefined): CauseClass;
```

| Class | Causes, as spec 002's room-conversation contract §3 maps them (on `feat/002-us6-events`) |
|---|---|
| `resting` | `local_unhealthy`, `local_error`, `no_fallback_in_stack`, `fallback_unavailable` |
| `budget` | `meter_at_ceiling`, `fallback_spent_today`, `fallback_awaiting_renewal`, `kill_switch_tripped` |
| `unavailable` | any other: `store_unreachable`, `store_uninitialized`, `journal_unwritable`, `api_unavailable`, the relay's `no_path_available`, `upstream_error`, and `edge_origin_unreachable`, any cause the room doesn't know, and no cause at all |

- **One map.** It moves out of `apps/web/src/talk/messages.ts` (on `feat/002-us6-events`) into `signals/tier.ts`, and `cannotTalkFor(cause)` becomes `` `cannot_talk.${causeClass(cause)}` ``. Spec 002's classes are unchanged: this spec amends none of them.
- **A test** runs every cause above, an unknown one, and none through both functions and checks that they agree.
- **Spec 001's relay** reduces its class gauge with the same table (§7, A2).

## 5. The poller

`apps/web/src/room/signals/status-poller.ts`, in the entry chunk. Each page is its own room: two tabs poll on their own schedules and share nothing (spec 004's Edge Cases).

### 5.1 The request

```ts
fetch("/api/status", {
  method: "GET",
  mode: "same-origin",
  credentials: "omit",
  cache: "no-store",
  redirect: "error",
  referrerPolicy: "no-referrer",
  signal, // aborted at 5 s on the room's Clock; the body counts
});
```

- **The URL is code, never data:** a root-relative path on the page's own origin, with no query string. `mode: "same-origin"` makes any other origin fail, so the poller can't reach a third party (SC-012).
- **The page sets no header** and sends no body, cookie, or credential. The browser adds only what it adds to any same-origin GET: its user agent and accept headers, and `Cache-Control: no-cache` with `Pragma: no-cache` for `no-store`. Spec 001's edge forwards none of them to the relay: its `h4-api` origin request policy forwards only `CloudFront-Viewer-Address`, `Content-Type`, and `X-H4-Probe` (spec 001's edge contract §3, on `spec/001-cloud-elevation`). The room never sends `X-H4-Probe`, the probes' mark.
- **One request at a time.** The next start is armed only when the last request has completed, and the 5-second timeout is shorter than any interval RL1 allows.

### 5.2 What counts as a valid answer

| The request ended with | `why` | The tier (§3) |
|---|---|---|
| a 200 whose body is a JSON object with the three fields, inside 5 s | – (valid) | rows 5 to 10; row 4 once it turns stale |
| a rejected fetch: a network error, a refused redirect, a request the browser blocked | `network` | unknown, at once |
| no response, or no whole body, within 5 s | `timeout` | unknown, at once |
| any status but 200: the local edge's 404, a 429, a 5xx | `status`, with `status`, and `retryAfterMs` for a 429 | unknown, at once |
| a 200 whose body doesn't parse, isn't an object, or lacks a field or its type | `shape` | unknown, at once |

The Author's own local-tier room, whose `edge` answers 404 under `/api/`, therefore reads unknown and is never plugged in (Confirmation 14: no local status endpoint).

### 5.3 The schedule

The poller keeps `lastStart`, `wait`, and `nextAt = lastStart + wait`, all on the room's monotonic Clock. `wait` starts at `poll_ms`.

| After | `wait` becomes |
|---|---|
| a valid answer | `poll_ms` |
| a failure | `min(2 × wait, 120 s)`: from the default, 60 s, then 120 s, then 120 s |
| a 429 | as after a failure, and at least its `Retry-After` |

- **`Retry-After`** is the header's delta-seconds (digits only), else the body's `retry_after_s` (a non-negative integer, as spec 001's relay sends it), else nothing. A value over 3,600 s counts as 3,600 s, which keeps the timer inside the Clock's range; the relay's status bucket asks for a few seconds at most.
- **Every start is at least one poll interval after the one before**, since no `wait` is shorter than the interval. So in any 60-second window a room starts at most 2 requests, and never two within one interval (A1; SC-012; User Story 8, scenario 4).

### 5.4 Enter, pause, hide, and resume

The poller is **running** while the visitor has entered, `live.source` is `site`, the room isn't paused, and the page is visible (FR-044). It arms a timer only while running.

| Event | The poller | The tier |
|---|---|---|
| **Enter**: the visitor confirms the choice, and the visit moves from `choosing` to `handoff` (spec 002's data model §9, on `feat/002-us6-events`) | starts the first request at once, if running | reduced: row 3, unknown, until the first answer |
| a timer reaches `nextAt` | starts a request | – |
| a request completes | records it as `last`; sets `wait` and `nextAt`; arms the timer if running | reduced at once |
| **pause** ("Pause the room" pressed), or the page **hides** (`visibilitychange` to hidden, or `pagehide`) | clears its timer; a request in flight completes and is recorded, and paused still wins (row 2) | reduced: row 2, paused (row 1, not-live, while `live.source` is `off`) |
| **resume**, or the page **shows** again (`visibilitychange` to visible, or `pageshow`) | if running and no request is in flight: starts one at once if `now ≥ nextAt`, or if none has started yet, else arms its timer for `nextAt` | reduced first, in the same event, before the next frame |
| reduced motion turns on or off | nothing: reduced motion stops motion, not polling (FR-059) | – |

This is FR-042's rule. On resume or return the room re-reduces, then requests once only if no backoff or `Retry-After` wait is running and the last request began at least one poll interval ago; both hold exactly when `now ≥ nextAt`. Otherwise it keeps its schedule.

### 5.5 What it never does

- request before Enter, while paused or hidden, or while `live.source` is `off` (FR-044, FR-045);
- store anything: no cookie, Web Storage, IndexedDB, Cache API, or URL change, and `no-store` keeps the answer out of the HTTP cache (FR-044);
- run on the lookdev page, whose tier comes from its sample control, every value badged "Sample", and whose phone copy's policy allows no connection at all ([lookdev.md](lookdev.md));
- call a model, or anything but `GET /api/status` (FR-076).

## 6. When the tier is reduced

`apps/web/src/room/signals/live.ts` wires the poller, the reducer, the motion store (pause, reduced motion, hidden), and the cost channel's fallback cue:

```ts
interface LiveSignals {
  readonly tier: TierReading;
  subscribe(listener: (reading: TierReading) => void): () => void;
  enter(): void;   // §5.4
  dispose(): void;
}
```

- **When it reduces:** at Enter; on every completed request; on pause, resume, hide, and show; on every turn reply whose route is `fallback`, through the cost channel's `onFallbackReply` ([turn-cost.md](turn-cost.md)); and when a Clock timer reaches `recheckAt`.
- **It applies at once.** Each reduction calls the laptop switch's `apply` synchronously, so the 3D room draws the new case on its next frame, and the 2D room, whose cases toggle `visibility`, on its next paint. It updates the text copy in place in the same call (FR-042, FR-058). So a failed request takes the plugged pose away on the first frame after it (SC-003).
- **Drafts builds keep a frame log**, the evidence for the Author's runs (§9).
  - It lives in page memory and keeps the newest 10,000 entries of `{t, wall, frame, event, …}`.
  - Its events: Enter, pause, resume, hide, and show; each request's start and its result (`ok` or its `why`, and the status); each reduction's tier and row; each fallback cue; and each new switch case, with the frame on which the 3D room first drew it (in 2D, the time it was applied).
  - In a drafts build, the console's `h4FrameLog()` returns it as JSON.
  - A release build has neither. Its code is drafts-only, like the fixtures, and a build test checks the release build for its marker.

## 7. What the relay must provide (Amendments A1, A2, A4)

Spec 001's relay contract, `contracts/relay-http.md` on `spec/001-cloud-elevation`, read with these amendments. The names below are proposals. If spec 001 renames them, the room's queries change in one place, spec 000's `telemetry.md` §7.9 ([room-live-state-telemetry.md](room-live-state-telemetry.md)).

**A1, its §8 and §4: the room as a consumer.**
- `GET /api/status` stays as its §8 has it: always 200 while the relay answers, with `local_tier`, `state`, and `cause_now`. The room reads those three and ignores `tunnel`, `release`, `time`, `request_id`, and any later field. The shape doesn't change.
- The room asks at most 2 times a minute per visible, unpaused room, same-origin, with no query string, extra header, or credentials (§5).
- The status bucket stays its §4's: 30 a minute, burst 10, per address, apart from hello's. Over it, the relay answers 429 `{"error": "relay_cap_exceeded", "limit": "status_per_minute", "retry_after_s": <n>, "request_id": "…"}` with `Retry-After: <n>`, which the poller honours (§5.3). Visitors behind one address share the bucket, and a refused room reads unknown until its next answer (spec 004's Edge Cases).

**A2, its §10: the series behind the "Room live state" panel** (FR-072).

| Change | OTel name and instrument | Attribute and values | Prometheus |
|---|---|---|---|
| a route label | `h4.relay.requests`, counter | `h4.relay.route`: `hello`, `status`, or `other` (a path or method the relay refuses), beside `h4.relay.path` and `h4.outcome` | `h4_relay_requests_total` |
| the same label, and the status bucket's own limit name | `h4.relay.cap_refusals`, counter | `h4.relay.route`; and `h4.cap.limit` gains `status_per_minute` | `h4_relay_cap_refusals_total` |
| the tier class the status would reduce to now | `h4.relay.status.class`, observable gauge, `{class}` | `h4.class`: `local`, `cloud`, `resting`, `budget`, `unavailable`, `unknown`. One-hot: every series at every export, exactly one at 1 | `h4_relay_status_class` |

- **The class** is FR-041's rows 5, 6, 8, 9, and 10 applied to the body `GET /api/status` would answer now, with §4's `causeClass`. A `state` of `"unknown"` is `unknown`; a `cause_now` is its class; `"normal"` with `local_tier` `"up"` is `local`, and with `"down"`, `cloud`; anything else is `unknown`. The page's own rows (the live source, pause, a failed or stale request, a fallback reply) aren't the relay's to know. Spec 001's relay tests pin its copy of the cause table to §4's.
- **Traces.** The relay drops the `relay.request` span of every `GET /api/status` it answers below 500 before export, as its §8 already does for probes; a 5xx keeps its trace. So a poll never becomes a trace.
- **Export.** The relay exports its metrics every 10 s, as spec 000's gateway does ([telemetry.md §3.1](../../000-local-foundations/contracts/telemetry.md#31-sdk-setup)). That keeps the panel inside spec 000's 60-second freshness budget ([§6.5](../../000-local-foundations/contracts/telemetry.md#65-the-freshness-budget)), which SC-014 needs.
- **No visitor in a series.** No attribute carries an address, a request ID, or anything else about a visitor ([§1](../../000-local-foundations/contracts/telemetry.md#1-rules-that-apply-to-every-signal) of spec 000's telemetry contract).

**A4, spec 001's spec.md, row V2, here `V7`, under Amendment A7's scheme.** The row gains the room's trigger, its default, what the relay keeps, and how to switch it off, in the words of spec 004's Data-Flow Disclosure Entries, in the switch-on change (FR-074). RL2 refuses `source: site` without them. There is no new row.

## 8. Cost, degraded mode, and data flow

- **Cost.** About 2 small requests a minute per visible, unpaused room, inside the relay's existing cap, and no model call. A 5-minute visit makes about 10, and 1,000 such visits a month about 10,000, around a cent (spec 004's Expected Cost Impact).
- **Degraded mode.** The tier is itself the room's display of the degraded modes. Every failure reads unknown at once, the laptop is never plugged in on unknown, the room renders in full whatever the tier, and the AI disclosure stays visible (FR-062; spec 004's Degraded-Mode Behavior).
- **Data flow.** One same-origin read, on spec 001's status row, `V7`, with A4's words (FR-074). The tier itself never leaves the page.

## 9. Proof

| Proof | How | Covers |
|---|---|---|
| The table | `apps/web/test/room/tier.test.ts`, table tests of `reduceTier`: each row; each failure kind of §5.2; a stale answer from each of rows 5 to 10, at `recheckAt − 1` and at `recheckAt`; row 7 with a reply before, during, and after a request; a wall-clock jump forward that stales an answer, and one backward that changes nothing | FR-041, FR-042, SC-003 |
| The first frame | `test/room/live.test.ts`, with `FakeClock`, a fake `fetch`, and the fake scene's `apply` recording the frame on which each case is first drawn: after each failure, at each stale instant, on pause and on hide with an answer in flight, and on resume before the next frame. The plugged case is drawn only for `local`, even from a bundle that maps another value to it | FR-042, FR-043, SC-003, User Story 2 scenarios 2 and 3 |
| One cause map | `test/room/tier.test.ts` and `test/ui/talk.test.ts` run §4's table through `causeClass` and `cannotTalkFor` | FR-041 row 6 |
| The poller | `test/room/status-poller.test.ts`: the exact `fetch` init; no request before Enter, while paused or hidden, or while `live.source` is `off`; the cadence; the 5 s timeout with a slow body; backoff of 60 s, 120 s, and 120 s, then back to 30 s; `Retry-After` from the header, from the body, and capped; the resume rule both ways; spies on storage and cookies showing 0 writes. A property test drives random sequences of answers, failures, pauses, hides, and shows over 10 simulated minutes: every start comes at least `poll_ms` after the one before, none falls while paused, hidden, or before Enter, and no 60-second window holds 3 | FR-044, FR-045, User Story 8 scenario 4, SC-012 (its automated part) |
| The live configuration | the compositor's known-bad overlays, one for each of RL1 to RL4, each refused with its rule, file, and path; the known-good set passes | FR-042, FR-044, FR-045, FR-074, SC-002 |
| Fault injection | `test/ui/degraded.test.ts`: the live source off; each failure; pause and hide while an answer is in flight. Each run ends with the AI disclosure visible, the text box working, and the text copy matching the drawing | User Story 2, FR-062, SC-007 (its tier part) |
| Drafts only | the release build has no frame log: its marker is absent, and the manifest reads `"release"` | §6 |
| The harness stays dev's | `deploy/scripts/test_compose_env.py` and `test_preflight.py`, extended in the switch-on change: the `status-harness` service sits in a profile of its own, publishes only on `127.0.0.1`, joins only `edge` and `internal`, and mounts only `deploy/edge/status-harness.conf`, read-only, which sends `GET /api/status` to the relay and every other request to `edge:8087`; preflight refuses the profile on prod and dev-cpu; `test_edge_site.py` still pins x005's `location /api/ { return 404; }` ([research.md](../research.md) R-70). And, once P-11 is applied, the compose policy's own test, `tools/gates/test/test_compose_policy.py`, whose real-file test runs over the raw `deploy/compose.yaml` with every profile's services: `main`'s policy admits `status-harness` alone past its port and edge-network rules, and its disclosure rule finds the harness in row S1's From → To cell ([intake-amendments.md](intake-amendments.md) §18) | SC-004's harness; the spec's "No local status endpoint" (Assumptions); Amendment Z1 |
| The failover, on dev (the Author's run) | after spec 001: the switch-on change's drafts image on dev, opened through SC-004's harness at `http://127.0.0.1:18106/`, which forwards the page's status requests to the dev relay on the stack's network ([quickstart.md](../quickstart.md), Q10). The Author trips the local path, then pauses the room for 10 minutes and hides the page for 10 minutes, exports the browser's network log (a HAR file) and the frame log, and runs `scripts/room/har_check.py` with the time of the relay's `relay.path.change` log line | SC-004, SC-012, User Story 8 |

`scripts/room/har_check.py` is agent code that runs in the Author's terminal, so each branch that changes it lists it there in its merge-request note (ADR 0017). It uses the standard library only and runs as `python3 -I`. From the HAR it reads only each request's URL, method, start time, and status, never a header, cookie, or body, and it prints counts and verdicts:
- 0 requests to any host but the page's own origin (SC-012);
- 0 status requests before Enter, between a pause and its resume, or between a hide and its show (SC-012);
- no two status requests starting closer together than the poll interval (SC-012);
- the first frame off the plugged pose within 40 s of the relay's path change (SC-004);
- 0 frames of the plugged pose while paused or hidden (SC-004).
