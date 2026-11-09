# Contract: the conversation turn (for the twin's spec), and the room's fixed messages

The room's side of a conversation, built now; the twin's side, specified here so the twin's spec can serve it without changing the room. Spec: FR-020 to FR-025, FR-032 to FR-041. Plan: §7. Research: R-14. Data: [data-model.md](../data-model.md) §6, §7.

## 1. Readiness

`room-manifest.json` marks each object's topic `ready: true|false`. Free talk is ready when the manifest's `free_talk.ready` is true. Readiness is set by the twin's spec when a topic's corpus material exists and its evals and red-team cases pass (FR-023, FR-050). **Until then, every topic is `false`**, and the room never calls the endpoint below.

## 2. The endpoint (served by the twin's spec)

`POST /api/room/turn`, through the stack's `edge` (x005), and through spec 001's relay when public.

**Request:**

```json
{"feature": "snowboard", "path": "engineer", "turns": [{"role": "visitor", "text": "<text>"}]}
```

- `feature`: `snowboard`, `bicycle`, `laptop`, or `free_talk`.
- `path`: `engineer` or `non-engineer`.
- `turns`: the conversation so far, newest last, within the twin's spec's limits.

**Response, an answer:** 200 `{"text": "<the twin's words>", "feature": "<feature>"}`.

**Response, degraded:** spec 000's degraded status and body, whose cause the room maps to a fixed message class (§3).

**The twin's spec's obligations, recorded here:**
- every model call through the gateway, with `h4.room.feature` on its spans (FR-032);
- the kill switch read first (FR-035);
- the per-client cap and per-turn limits (FR-037);
- no turn text in any store on prod (FR-031's companion for text, SC-011).

## 3. Fixed messages

From `content/messages.yaml`, never generated:

| Situation | Message ID | The room also |
|---|---|---|
| An object whose topic isn't ready | `topic_not_ready` | sends `object_selected`; calls nothing |
| A turn while free talk isn't ready | `cannot_talk.unavailable` | sends `turn_sent`; calls nothing |
| Degraded, cause class "local tier off": spec 000's `local_unhealthy`, `local_error`, `no_fallback_in_stack`, or `fallback_unavailable` | `cannot_talk.resting` | keeps the text box usable |
| Degraded, cause class "budget": spec 000's `meter_at_ceiling`, `fallback_spent_today`, `fallback_awaiting_renewal`, or `kill_switch_tripped` | `cannot_talk.budget` | the same |
| Degraded, any other cause (`store_unreachable`, `store_uninitialized`, `journal_unwritable`, `api_unavailable`, a cause the room doesn't know), or a network failure | `cannot_talk.unavailable` | the same |
| The talk button, recognition unavailable or not built | `voice_unavailable` | moves focus to the text box; asks for no microphone |

Each `cannot_talk` message ends with a link to the resume and one to the PDF. The cause classes map spec 000's causes by name ([gateway-http.md](../../000-local-foundations/contracts/gateway-http.md)); an unknown cause is "unavailable". The kill switch's trip counts as "budget", since a trip follows a ceiling; `cannot_talk.budget` says the day's budget is used, which is the cause's class, not its detail.

**(spec 010, Amendment 2-1)** `adapter_month_spent`, the paid fallback's monthly cap, is of the budget class: `cannot_talk.budget`, with the resume and the PDF (`apps/web/src/room/signals/tier.ts`'s `BUDGET_CAUSES`).

## 4. Push-to-talk (for the push-to-talk group)

- **Capture:** only while the button or its held key is down, at most 30 s, stopped on `visibilitychange` to hidden (FR-026, FR-029).
- **Recognition:** `POST /api/room/recognize`, the audio as the request body, answered with `{"transcript": "<text>"}` or a degraded status. It goes **through the gateway**, like every model call the room causes (FR-032): the gateway reads the kill switch before anything else and answers degraded while it's `degraded` or unknown (FR-035), then calls the recognizer through a local adapter only (FR-030, FR-034). Each call records its provider, model, size in audio seconds, latency, routing decision, estimated cost from the price table (0 for a local model), and `h4.room.feature = free_talk` or the object that started the turn.
- **Audio:** never stored, logged, traced, or forwarded, and discarded after transcription (FR-031).

This is specified with that group, with its ADR and its disclosure row V3.

## 5. The twin's voice (for the voice group)

The twin's spoken answers and voiced narration made at run time go through the gateway the same way: the kill switch first (FR-035), a local adapter only (FR-034), and each call recording its provider, model, size in characters and audio seconds, latency, routing decision, estimated cost, and room feature (FR-032). Narration voiced ahead of time (contracts/narration.md §4) is a build step, not a call the room causes, so it isn't metered at run time.
