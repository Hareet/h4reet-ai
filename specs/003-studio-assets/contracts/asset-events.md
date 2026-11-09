# Contract: the asset events

**Waits for spec 001's relay.** Spec 003's FR-039 and FR-040b; plan §7; research R-10.

## 1. What the browser sends

`POST /api/events` on the site's own origin, which the edge sends to spec 001's relay. At most one request every 10 seconds, and one more when the page is hidden (`navigator.sendBeacon`), each carrying up to 20 events:

```json
{ "events": [ { "asset": "twin-idle", "outcome": "loaded", "ms_bucket": "<1000", "bytes": 812345, "mode": "full" } ] }
```

| Field | Allowed |
|---|---|
| `asset` | an `id` from the manifest, or `mode` for a mode change |
| `outcome` | `loaded`, `retried`, `failed`, `skipped` |
| `ms_bucket` | `<250`, `<1000`, `<3000`, `<10000`, `>=10000` |
| `bytes` | an integer, at most the file's size |
| `mode` | `full`, `reduced`, `2d` |

No identifier, cookie, session, timestamp finer than the request's own arrival, or free text. The site sends nothing else.

## 2. What the relay does

- **Admission:** spec 001's public cap applies, then the schema. Anything outside it is refused with 400 and counted, with no body kept.
- **Metrics:** each event becomes counters and a histogram, `h4.assets.events{asset, outcome, mode}` and `h4.assets.bytes{asset}`, with no address on them. Nothing is logged or stored per event (spec 001's FR-031 and FR-042).
- **Answer:** 204.

## 3. The panel

The dashboard's "Assets" panel shows the load success rate, the p50 and p95 time until the twin is visible (from the twin's `ms_bucket`), the share of visits in each mode, the bytes served, and the studio's GPU windows (FR-039, FR-035).

## 4. The disclosure

Row **V6**, in the change that adds the route: the visitor's browser → the edge → the relay, for the asset events; what it carries (the fields above, the address, the user agent); what it never carries (anything that identifies the visitor beyond the address the edge sees); why (to know whether the assets load); its default (on); how to switch it off (block `/api/events`; the site doesn't depend on it).

And a row for the asset requests themselves (FR-040a): the visitor's browser → the edge, carrying the paths, which show the chosen avatar.
