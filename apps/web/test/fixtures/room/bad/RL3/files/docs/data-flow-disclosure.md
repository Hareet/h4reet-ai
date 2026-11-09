# Data-flow disclosure

A fixture for rule RL3: row V6 names the room's own events route, not the asset events' `POST /api/events`.

| ID | From → To | Trigger | Carries | Never carries | Why | Default | How to switch it off | FR |
|---|---|---|---|---|---|---|---|---|
| V6 | the visitor's browser → the site's own origin, `POST /api/room/events` | a piece's model loading, or failing to | the asset's kind, its bytes, and the outcome | the visitor's address, any identifier of the visit | spec 003's transfer panel | off | `asset_events: off` | FR-071 |
