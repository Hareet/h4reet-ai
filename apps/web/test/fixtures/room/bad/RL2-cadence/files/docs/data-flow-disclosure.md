# Data-flow disclosure

A fixture for rule RL2: row V7 holds Amendment A4's words, with the room's polling every 30 s.

| ID | From → To | Trigger | Carries | Never carries | Why | Default | How to switch it off | FR |
|---|---|---|---|---|---|---|---|---|
| V7 | the visitor's browser → the edge → the relay, `GET /api/status` | as before, and now the room: every 30 s while the visitor has entered, the page is visible, the room isn't paused, and the live source is on, and once on resume or return, at most once an interval | the request; the IP address, which the relay holds in memory for the status bucket, at most one UTC day; the user agent; and, by their timing, how long the room stayed open and visible | the engineer or non-engineer path, the avatar, anything typed or said, any identifier of the visit; nothing is stored on the device | the laptop shows whether the Author's machine is serving (FR-041) | on once the live source is | "Pause the room", or block the path | FR-074 |
