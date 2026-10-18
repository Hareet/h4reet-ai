# Contract: usage events

Spec: FR-054, FR-056, SC-010. Plan: §6. Research: R-10. Data: [data-model.md](../data-model.md) §8.

## 1. The browser's side

`navigator.sendBeacon("/api/room/events", body)`, where the body is JSON:

```json
{"kind": "item_selected", "id": "<item-id>"}
```

| Kind | `id` | Sent when |
|---|---|---|
| `object_selected` | the object's ID | an object is selected by pointer, touch, or the list |
| `item_selected` | the resume item's ID | a resume item is selected |
| `resume_opened` | – | the resume opens |
| `resume_kept` | – | "Keep it for later" after the hand-off |
| `pdf_downloaded` | – | the PDF link is followed, on any screen |
| `turn_sent` | – | the text box sends, or a transcript is sent |
| `voice_pressed` | – | the talk button is pressed |
| `mode_2d` | – | the room enters the 2D mode |

Nothing else goes in the body. A failed or refused beacon is ignored: the room doesn't retry, queue, or store it.

## 2. The edge

The stack's `edge` listener 8087 (x005) forwards `POST /api/room/events` to `gateway:8080/room/events`. It applies:
- `limit_req zone=room_events rate=10r/s burst=20 nodelay`, keyed per stack (one zone), since every visitor's address on the local tier is the loopback;
- `client_max_body_size 512`;
- no logging of the body.

Spec 001's relay applies its own public cap when this route is public.

## 3. The gateway's route

`POST /room/events` on the gateway's API listener:

| Check | On failure |
|---|---|
| `Content-Type` is `application/json` or `text/plain` (beacons may send either) | 415, counted as `content_type` |
| The body is a JSON object with exactly `kind`, plus `id` when the kind takes one | 400, counted as `shape` |
| `kind` is in the list | 400, counted as `kind` |
| `id` is in `config/room-events.yaml`'s objects or items, matching its kind | 400, counted as `id` |

**On success:** increment `h4.room.events{kind, id}` (with `id="-"` when absent), then 204.

**Never:** a log line with the body, a span attribute with the body, a ledger row, a model call, or a meter admission. The route sits outside spec 000's `/hello` path, so admission and routing never see it.

**Where the gateway gets the kinds and IDs:** `config/room-events.yaml`, a committed file the build generates from the same source as `room-manifest.json`: `{schema: 1, kinds: [...], objects: [...], items: [...]}`. The gateway reads it at start from `${H4_TREE}/config`, which compose already mounts into it read-only. `apps/web/dist/` isn't a choice: it's gitignored, not in a host stack's export, and compose binds only `deploy/` and `config/`. `make test` fails when the committed file differs from what the build would write, as the resume's lock does, naming the first difference. A missing or invalid file makes every event 400 `id`, and the gateway still starts.

## 4. Telemetry and the dashboard

| Series | Type | Labels |
|---|---|---|
| `h4.room.events` | counter | `kind`, `id` (bounded by `config/room-events.yaml`) |
| `h4.room.events.refused` | counter | `reason` (`content_type`, `shape`, `kind`, `id`) |

**The "Room" row** of `h4-runtime.json`:
- **built now:** use per object per day, use per item per day, PDF downloads per day, the share of visits shown the 2D mode (`mode_2d` over `resume_opened` + `resume_kept`, a stand-in for visits, since no visit is counted), turns sent, and refusals;
- **when conversations exist:** cost per room feature today and this month, beside latency and errors, from spec 000's `h4.cost.usd` and duration series filtered by `h4.room.feature`, plus degraded responses by cause.
