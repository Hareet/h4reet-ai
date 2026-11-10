# feat/014-room-after-the-demo

Spec: [specs/014-room-after-the-demo/](../../specs/014-room-after-the-demo/) · Intent:
[specs/014-room-after-the-demo/intent.md](../../specs/014-room-after-the-demo/intent.md) · Written by: implementer
subagent (Claude Opus 5.5), for the main session · Date: 2026-11-10

Status: a save point while the build runs. The sections below fill in task by task.

## T001: the base's facts

Read on 2026-11-10 in the worktree `/tmp/claude-1000/wt-feat014`, branch `feat/014-room-after-the-demo`, at
cb861c2af907d5609d701750dbe91aec819da49d: `spec/014-room-after-the-demo` with `refs/heads/main` at 32fb2bc3 merged
in (spec 012's hand merge, the shutdown test's fix, and gate 4's PDF). `node_modules` came from `npm ci
--ignore-scripts --cache "$TMPDIR/npm-cache-feat014"`, at Node 24.21.0, the toolchain's pin.

- **The base**: spec 012's tests, `test/room/loading-*.test.ts` and `test/ui/loading*.test.ts`, "Test Files 9
  passed (9)", "Tests 129 passed (129)". `npm run room:check`: "room: 0 findings in 0 files", 5.12 s wall clock
  (5.80 s user). Supported stages: 7,291, over 7,241 sweep screens. The entry chunk's gzip size, measured as
  `test/room/chunk.test.ts` does on a release build: 41,064 bytes of JavaScript (one chunk) and 4,953 of CSS, 46,017
  in all, against the 150 KB budget.
- **The twin's turn on dev-cpu** (R-4), read from the code: `services/gateway/src/core/gateway.ts`'s `complete` asks
  the local adapter first only while it is healthy; with it unhealthy, the reason is `local_unhealthy`, and the call
  goes to the route's fallback through `callMetered`. dev's route is `{ primary: local, fallback: synthetic }`
  (`config/routing.yaml`), and dev-cpu's env file sets `GATEWAY_TEST_SYNTHETIC_SPEND=1`, so the fallback is
  registered. The meter's admission (`meter/admission.ts`) has no rule by purpose, so a `twin` call is admitted as
  any fallback call. `routes/room-turn.ts` maps any route but `local` to `"fallback"`, and sends `cost_micro_usd` as
  the meter's settlement: the synthetic adapter's 1,000 output tokens at dev's $100 per million, 100,000. A guard's
  withheld answer keeps the 200, the route, and the cost. So by reading, yes: the plan's R-4 holds, and nothing moves
  to T059. Two conditions the turn needs that the stack, not this branch, holds: the feature's topic ready in
  `config/twin-readiness.yaml` at the running hashes (`snowboard`'s topic, `hobbies-and-travel`, reads `ready:
  true`), and dev's limits, which a dev stack defaults (`app.ts`, "the twin uses FR-027's defaults").
- **The edge** (R-5): x005 listens on 8087 inside the internal network (`deploy/edge/nginx.conf`), published on
  dev-cpu's `H4_SITE_PORT`, 18305. `POST /api/room/turn` is limited by `limit_req_zone $server_port
  zone=room_turn:1m rate=1r/s`, with `burst=5 nodelay`: two turns seconds apart pass.
- **The page's request**: `src/talk/turn-client.ts` sends `{"feature", "path", "turns"}`, JSON, with
  `content-type: application/json`; the engineer path's value is `"engineer"` (`src/choice/visit.ts`).
- **The rule IDs**: RD's next free is RD6 and RG's is RG10 (RD1 to RD5 and RG1 to RG9 are spec 004's). RD6 is the
  glow's shape (exactly one of `radius` and `path`; a path of at least two points with a `spread` in (0, 0.05]); RD7
  the grips (an avatar outside the table, a hand but `right` and `left`, an `at` past ±0.15, a turn past ±180); RG10
  a path point outside its piece's bounds, beside RG2. The next free ADR is 0046 (0045 is spec 012's, merged). The
  next free content-approval id on `refs/heads/main` is C-0003 (C-0001 and C-0002 are there).
- **The hand bones**, read from the GLBs' JSON chunks without opening any file under `assets/` for writing (the build
  copies them unchanged): in the man's and the woman's models and their three animation files each,
  `mixamorig:RightHand` and `mixamorig:LeftHand` each hold `…HandIndex1` to `3`, `…HandMiddle1` to `3`,
  `…HandPinky1` to `3`, `…HandRing1` to `3`, and `…HandThumb1` to `3`; each hand's parent is its `…ForeArm`. The
  hand bone stands 0.304 (the man) and 0.290 (the woman) from the right forearm's origin, in the models' units.

None of these differs from plan PD-2, PD-13, PD-16, PD-20, or §10, so no departure is recorded at T001.
