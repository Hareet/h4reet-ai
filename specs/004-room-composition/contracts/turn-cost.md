# Contract: the turn's cost (the neon sign's counters)

Spec 004: FR-046 to FR-050, FR-075, and FR-076; SC-011; User Story 9; Amendments A5 and B6; Confirmations 1, 2, and 6. Plan: [plan.md](../plan.md). Research: [research.md](../research.md). Data: [data-model.md](../data-model.md). Related contracts: [tier-signal.md](tier-signal.md) (the live configuration's `turn`, and FR-041's row 7, which this channel's fallback cue feeds) and [room-bundle.md](room-bundle.md).

The Author, answer 6: "A clip-on display that functions as a glowing arrow neon sign, think in that gta art style. "Langfuse" and then just has counter numbers for spend on this current call and spend on the session." Answer 7: "Yes it can have cost unavailable for now."

The counters show the visitor's own conversation, from each turn's own reply. They never read Langfuse, never show another visitor's turns, and never make a request of their own. The visit's total is summed in page memory and leaves with the page (FR-047).

## 1. Where the figures come from

- **Only two fields** of each conversation turn's 200 reply feed the counters: `cost_micro_usd` and `route` (Amendment B6). The talk panel reports each turn to the cost channel through `onTurnOutcome` (§7). Nothing else feeds them.
- **The cost is the gateway's estimate** from `config/prices.yaml`, the same figure it records on each call's trace, not the provider's bill; hence "est." (spec 004's Assumptions, "The cost is the gateway's estimate"). If the meter later charges more, because a reservation expired before its commit landed, the sign doesn't follow.
- **Langfuse never sees a visit's total**, and the room never reads Langfuse (spec 001's FR-052; FR-050).

## 2. The reply's two fields (Amendment B6), for the twin's spec

Spec 002's turn endpoint, `POST /api/room/turn` (its room-conversation contract §2, on `feat/002-us6-events`), answers 200 `{"text", "feature"}` today. B6 adds two required fields:

```json
{ "text": "<the twin's words>", "feature": "bicycle", "cost_micro_usd": 950, "route": "fallback" }
```

| Field | Type | Meaning |
|---|---|---|
| `cost_micro_usd` | an integer, at least 0 | the gateway's estimated cost, summed over every call the turn made: 0 when all were local; in the final frame if the answer streams |
| `route` | `"local"` or `"fallback"` | which path answered, as hello's 200 carries it (spec 000's [gateway-http.md §2.5.1](../../000-local-foundations/contracts/gateway-http.md#251-200-answered)) |

The twin's spec's obligations, recorded here:
- **Both fields on every 200**, the cost as a JSON number and never a string. (Spec 000's operator adapters route sends its cost as a string; the turn route follows hello's form.)
- **`turns[]` stays `{role, text}`**, and the server refuses extra fields, so a cost never goes back to the twin (FR-038).
- **Through spec 001's relay**, the 200 body passes through unchanged, both fields included (Amendment A5).
- **Spec 002's turn row, `V2`,** says the reply carries the turn's estimated cost and its route, in the change that serves the route (FR-075, B6). The live configuration's RL4 refuses `turn: site` without it ([tier-signal.md](tier-signal.md) §1).
- **The degraded body gains no cost field** (Confirmation 2). A degraded turn reads "cost unavailable".
- **Reading, for the twin's spec to confirm:** a turn any of whose calls the fallback answered carries `route: "fallback"`. B6 says only "as hello's 200 carries it", and hello makes one call. The room depends on this twice: the laptop's failover cue (FR-041 row 7) and the "est." mark.

## 3. Classifying a turn, `classifyTurn`

`apps/web/src/room/signals/turn-cost.ts`: pure, in the entry chunk.

```ts
/** How one sent turn ended, as the talk panel reports it (§7). */
type TurnResult =
  | { kind: "response"; status: number; body: unknown }       // the whole body, parsed; for a stream, its final frame
  | { kind: "error"; error: "network" | "aborted" | "body" };

type TurnOutcome =
  | { kind: "reply"; route: unknown; cost_micro_usd: unknown }
  | { kind: "degraded"; cause: string }     // the cause, for the talk panel's own message (§7)
  | { kind: "failed" }
  | { kind: "lost" }
  | { kind: "refused"; status: number };

function classifyTurn(result: TurnResult): TurnOutcome;
```

| The turn ended with | Outcome | Could it have cost money? |
|---|---|---|
| a 200 | `reply`, carrying the body's `route` and `cost_micro_usd` as found (absent when the body isn't an object) | yes, and a valid reply says how much (§4) |
| a 503 whose body is spec 000's degraded body: `state` `"degraded"` and a string `cause` | `degraded` | possibly: a failed fallback call can be charged its reservation |
| a status from 400 to 499, 429 included | `refused` | no: a refused turn "provably costs $0 (the per-call cost check)" (FR-048) |
| any other status: another 2xx, a 3xx, or a 5xx without the degraded body | `failed` | possibly |
| a network error before any response (`network`) | `failed` | possibly |
| an abort, a body that failed to read or parse, or a stream that ended without its final frame (`aborted`, `body`) | `lost` | possibly: the turn may have been answered and charged |

## 4. A valid reply

A `reply` is valid when its `route` is exactly `"local"` or `"fallback"`, and its `cost_micro_usd` is a number for which `Number.isSafeInteger(cost_micro_usd)` holds and `cost_micro_usd >= 0`. So each of these is invalid (FR-048):
- the gateway's `"metered"` route, its route for the metered test paths (dev's synthetic spend among them), and any other route;
- a missing field;
- a string such as `"950"`, a fraction, or a negative;
- an integer past 2^53 − 1, which JSON can't carry exactly.

## 5. What the counters read

The readings follow FR-048:

| Situation | "this call" | "this visit" |
|---|---|---|
| `live.turn` is `off` (today) | cost unavailable | cost unavailable |
| the route exists, before the visit's first counted turn | no call yet | $0 |
| a valid reply with route `local` and cost 0 | local · $0 | unchanged |
| a paid reply: any other valid reply, with a cost above 0 or route `fallback` | its cost to six decimals, "est.", or `$99.99+` at or above the $99.99 cap (the cap bullet below) | the cost added exactly; to six decimals, "est.", from then on, or `$99.99+` at or above the cap |
| `degraded`, `failed`, `lost`, or an invalid reply | cost unavailable | the sum unchanged, marked "at least" from then until the page reloads |
| `refused` | unchanged | unchanged |

- **Exact sums.** The visit's total is a `bigint` of micro-dollars, and each valid cost is added as `BigInt(cost_micro_usd)`. Amounts are formatted with integer arithmetic: `$`, the micro-dollars divided by 1,000,000, a point, then the remainder in six digits. So 950 reads `$0.000950`, and dev's synthetic 100,000 reads `$0.100000`. "This visit" is the exact integer sum of the valid costs (SC-011).
- **"At least" persists.** Once set, a later paid turn adds its cost and the mark stays: `at least $0.000950 est.`, or `at least $99.99+` at or above the cap. Only a reload clears it, and a reload makes a new channel, which reads "no call yet" and "$0" (User Story 9, scenarios 3 and 5).
- **A fallback reply that costs 0** counts as paid and reads `$0.000000 est.`: it took the paid path, and its figure is the gateway's estimate. Only a local answer reads "local · $0".
- **The $99.99 cap** (Clarifications, 2026-10-23: "a. yes shorter longest reading is fine."). An amount at or above $99.99 — a call's cost or the visit's total — reads `$99.99+` instead of its six decimals: the "+" says the amount is at least what is shown, so the reading stays true. The "est." mark is dropped for a capped reading: the cap already withholds the figure, and "est." marks an estimate of a shown one. The "at least" mark, once set, still prefixes the capped reading: `at least $99.99+`. The exact sum is unchanged (SC-011); the cap is the display's, and "cost unavailable" is now only the reading for a turn with no valid cost (FR-048, answer 7) — a call of $100 or more no longer reads it. The meter's ceilings, $5 a day and $20 a month ([budgets.yaml](../../../config/budgets.yaml)), keep the cap far out of reach.
- **Within the grid.** The neon renderer's counter regions are sized for the longest readings: "cost unavailable" (16 characters) and `at least $99.989999 est.` (24) — the largest amount below the cap, with the "at least" mark and the "est." mark. The compositor checks the grid (rule family RT, [room-data-files.md](room-data-files.md)), so a reword can't overflow it (RT8).
- **Amounts are live values, never UI words** (FR-048). Every digit the sign shows comes from a slot, so spec 002's C6 holds for the UI words below (FR-035).

**Drafts builds and fixtures** (FR-049):
- In a drafts build (spec 002's `-drafts` images of dev and dev-cpu, and the self-contained vignette FR-069 copies to the reference phone), every reading that shows an amount carries the badge "test", since dev's fallback spends synthetic money. "No call yet" and "cost unavailable" carry none.
- A figure a fixture feeds carries "Sample" instead. Fixtures exist only in drafts builds and tests ([lookdev.md](lookdev.md)).
- A badge is the renderer's own drawing operation beside the figure, never part of the amount, and the text copy says it in brackets.

**The sign's fixed lines** (FR-046, FR-049):
- the neon word, "Langfuse", in the room's own neon lettering (IBM Plex Sans Bold drawn as a stroked tube), with no Langfuse logo, wordmark, or colours, no "by ClickHouse", and nothing from Rockstar or GTA;
- a visible second line, "metered by the gateway · traced in Langfuse";
- on the site, in the text copy, a line saying the project isn't affiliated with or endorsed by Langfuse or its owner (Confirmation 1).

**The UI words** the sign uses. They are keys of the code's closed list, and their texts are FR-048's, FR-049's, and Confirmation 1's words.

| Key | Text | Slot |
|---|---|---|
| `sign.word` | Langfuse | – |
| `sign.second_line` | metered by the gateway · traced in Langfuse | – |
| `sign.call_label` | this call | – |
| `sign.visit_label` | this visit | – |
| `sign.no_call_yet` | no call yet | – |
| `sign.unavailable` | cost unavailable | – |
| `sign.local` | local · {amount} | `amount`: `$0` |
| `sign.estimated` | {amount} est. | `amount`: a formatted amount |
| `sign.at_least` | at least {amount} | `amount`: an amount, or an estimated amount |
| `sign.not_affiliated` | This project isn't affiliated with or endorsed by Langfuse or its owner. | – |
| `sign.test` | test | – |
| `sign.sample` | Sample | – |

## 6. The channel, `createCostChannel`

```ts
type CallReading = "unconfigured" | "no-call-yet" | "local-zero" | { paid: bigint } | "unavailable";

interface CostState {
  readonly configured: boolean;                   // live.turn is "site"
  readonly call: CallReading;
  readonly callFrom: "turn" | "fixture" | null;   // what fed the current call reading
  readonly visitMicro: bigint;
  readonly visitPaid: boolean;                    // the total includes a paid reply, so it reads "est."
  readonly visitAtLeast: boolean;                 // set by a turn with no valid cost; cleared only by a reload
  readonly visitSample: boolean;                  // a fixture fed the total
}

interface CostChannel {
  report(outcome: TurnOutcome, from: "turn" | "fixture"): void;
  readonly state: CostState;
  subscribe(listener: (state: CostState) => void): () => void;
  onFallbackReply(listener: (at: number) => void): () => void;
}

function createCostChannel(options: { configured: boolean; clock: Clock }): CostChannel;
```

- **`report`** applies §5's table, then notifies each subscriber once. While `configured` is false, it changes nothing.
- **Row 7's cue.** A `reply` from a turn whose `route` is `"fallback"`, with a valid cost or not, calls the `onFallbackReply` listeners with the room Clock's time. The live controller passes it to the tier ([tier-signal.md](tier-signal.md) §6). A fixture never does: lookdev sets the tier from its own sample.
- **What it never does:** make a request of any kind (`fetch`, XHR, beacon, socket, image), or write Web Storage, IndexedDB, the Cache API, a cookie, or the URL (FR-047, FR-050). There is one channel per page, and a reload starts a new one.
- **Pause and motion.** "Pause the room" doesn't stop it: the counters still update for the visitor's own turns, and only the glow's motion stops (FR-060). Under reduced motion, a new reading shows at once (FR-059). In 2D, the face's still image is redrawn on each change (FR-058).
- **Badges.** The renderer takes "test" from the bundle's build kind (drafts or release), and "Sample" from `callFrom` and `visitSample`.

## 7. The hookup for the twin's spec: `onTurnOutcome`

Spec 002's talk panel never sends a turn today. This spec adds the seam the twin's spec plugs into, so the sign needs no change when conversations arrive:

```ts
renderTalk(doc, {
  // …spec 002's options, unchanged
  onTurnOutcome(result: TurnResult): void; // once for each turn the panel sends, when it has ended
});
```

- **The room's wiring:** `onTurnOutcome: (result) => channel.report(classifyTurn(result), "turn")`.
- **When the twin's spec calls it:** exactly once for each `POST /api/room/turn` it sends, after the whole answer (a stream's final frame), a failure, or an abort. Never for a turn it didn't send: a topic that isn't ready, or free talk that isn't, calls no model and reports nothing (FR-037, SC-015).
- **The talk panel's own messages** read the same outcome. A `degraded` turn shows spec 002's `cannot_talk` message for its cause's class, through the shared `causeClass` ([tier-signal.md](tier-signal.md) §4).
- **Nothing flows the other way.** The channel's state never reaches the turn request, the twin's context, or its voice (FR-038, FR-050).
- **Until the twin's spec,** nothing calls `onTurnOutcome`, `live.turn` is `off`, and both counters read "cost unavailable" (answer 7; User Story 9, scenario 7).

## 8. The text copy

- **"Around the room"** holds the sign's entry: its label, the word, "this call" and "this visit" with their readings, any badge in brackets, the second line, and the line saying the project isn't affiliated. These come from the renderer's own word list, so the drawing and the text copy can't differ (FR-034, FR-063). "est." is marked up as an abbreviation of "estimated".
- **It updates in place**, with no live region, so a changed reading announces nothing (FR-063).
- **It stays apart from the twin's words:** outside the talk panel's log, never announced, and never voiced (FR-050).
- **The twin never states an amount** (FR-039, FR-050). Amendment B4's red-team case "gives an amount" covers the neon sign.

## 9. Cost, degraded mode, and data flow

- **Cost.** None of its own. The sign displays what the conversation already costs (spec 002's estimate: about $0.00095 a paid turn, and $0 a local one) and adds no request (FR-076).
- **Degraded mode.** As spec 004's Degraded-Mode Behavior sets: before the conversation core exists, "cost unavailable"; for a degraded, failed, or lost turn, "cost unavailable", with the visit marked "at least" from then on; the room works throughout.
- **Data flow.** Nothing new leaves the device. The cost and the route arrive inside the reply the device already gets, on spec 002's turn row, `V2` (FR-075, B6).

## 10. Proof

| Proof | How | Covers |
|---|---|---|
| Classification | `apps/web/test/room/turn-cost.test.ts`: each row of §3 | FR-048 |
| Validity | each invalid form of §4, `"metered"` among them | FR-048, SC-011 |
| Readings | each row of §5's table; every sequence of up to 4 outcomes from a fresh channel, against a reference model; "at least" after a later paid turn; the $99.99 cap; "test" in a drafts build, and "Sample" from a fixture | FR-048, FR-049, SC-011, User Story 9 scenarios 1 to 5 and 7 |
| Exact sums | 10,000 random valid costs, up to 2^53 − 1, against a `bigint` reference sum | FR-047, SC-011 |
| No request, no storage | spies on `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket`, `EventSource`, `Image`, Web Storage, IndexedDB, the Cache API, `document.cookie`, and `history`: 0 calls across the suite | FR-047, FR-050, SC-011 |
| Not configured | with `live.turn` `off`, both counters read "cost unavailable" before and after reports | FR-048, SC-011, User Story 9 scenario 7 |
| Row 7's cue | a fallback reply stamps the tier; a fixture doesn't | FR-041 row 7 |
| The text copy | equals the face's word list in every reading, and has no live region | FR-034, FR-063 |
| The twin states no amount | B4's "gives an amount" case, scaffolded now in `redteam/` and made live by the twin's spec | FR-050, User Story 9 scenario 6 |
| A stub turn endpoint | with the twin's spec: local, paid, degraded, failed, lost, refused, invalid-cost, and invalid-route turns through the real talk panel | User Story 9's Independent Test |
