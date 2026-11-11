# Contract: the sign's end-to-end check (spec 014, FR-056 to FR-059)

**Status: withdrawn** by spec.md's Amendment X1 after the review (T053), the Author's answer of 2026-11-10: "Drop the make target". Kept as the record of what was planned; nothing in the repository implements it.

A check on a running dev stack that a conversation turn, with the local model stopped, reaches the neon sign as a paid reading: through the gateway, the edge, and the page's own cost code, with no paid call. It sits beside the breach test (`evals/breach.py`, spec 000 FR-036), which already stops and starts a dev stack's model server and runs its HTTP calls from a probe on the stack's internal network. A file named here that doesn't exist yet is in a code span.

## 1. Entry points

| Command | Who | Stack |
|---|---|---|
| `make sign-check ENV=dev-cpu` | agent sessions, through `deploy/agents-engine/docker-relay`, as `make breach-test` relays | dev-cpu, on the agents' engine, from the main working tree |
| `make sign-check ENV=dev` | the Author's terminal | dev, from the export its run file names, as the breach test runs dev |

The target runs `evals/sign_check.py` with the same interpreter pins as the breach test (`$(PY_HOST)`, `-I -B`), and the probe's half in `evals/sign_probe.py`, inside the `breach-probe` service's image (`docker compose --profile breach run --build --rm -T breach-probe python3 -I -B /probe/sign_probe.py`), or a sibling service the plan names.

## 2. Refusals (exit 2, before anything changes)

- Any `ENV` but `dev` and `dev-cpu`. `prod` is refused by name, in the Makefile and in the script, each on its own.
- `dev-cpu` off the agents' engine, or from a linked worktree (the breach test's rule).
- A stack whose gateway's `GET /health` reports `test_machinery.synthetic` false: without dev's synthetic spend, the route has no fallback, and the check can't prove a paid reading. It never falls through to another adapter.
- A stack that isn't running (no run file, or the gateway not healthy).
- A stack whose kill switch isn't `normal`, or whose fallback sub-budget can't admit one synthetic call (a breach test left it tripped, say): the turn would be degraded, which proves nothing about the paid reading. The script names `make operator-reset` or `make operator-renew` for the Author, and runs neither.

## 3. Steps

1. **Read the stack.** `GET /health` through the probe: the routed adapters, `local`'s health, and the test machinery's switches.
2. **Stop the local model.** `docker compose stop` the stack's model server (`model-server-cpu` on dev-cpu, `model-server-gpu` on dev, as `breach.py`'s `MODEL_SERVER`). Wait, polling `GET /health` each second for at most 30 s, until `local` reads unhealthy.
3. **Send a turn through the edge.** From the probe, `POST http://edge:<x005>/api/room/turn` with `Content-Type: application/json` and the body `turn-client.ts` sends: `{"feature": "snowboard", "path": <the path the page sends for the engineer path>, "turns": [{"role": "user", "text": <a fixed question>}]}`, the plan fixing both values from the code at T001. One attempt, with the edge's own timeout.
4. **Keep only three facts.** The status, and, for a 200, the body's `route` and `cost_micro_usd`, as `turn-cost.md` §2 names them. The body's `text` is read into nothing and never printed or stored.
5. **Read the sign.** On the client, `node --import tsx apps/web/build/room/sign-reading.ts` with the three facts on standard input: it calls `classifyTurn`, `createCostChannel` (configured, as `live.turn: site` makes it), `report(..., "turn")`, and `costReadings` with the words of `apps/web/room/ui-words.yaml`, and prints the two counters' words as JSON. It imports the room's own modules, so the page's code is what reads the reply.
6. **Assert the paid reading.** Status 200; `route` `"fallback"`; `cost_micro_usd` a safe integer above 0; "this call" reads `sign.estimated` with the amount the cost gives, and "this visit" the same, with "est.".
7. **Start the local model.** `docker compose start` the model server; wait at most 120 s for `local` to read healthy.
8. **Send a second turn and read it** as in steps 3 to 5, with a fresh channel.
9. **Assert the local reading.** Status 200; `route` `"local"`; cost 0; "this call" reads `sign.local` with `$0`.

Whatever the outcome, the model server is started again before the script exits (a `finally`, and the signal handlers the breach test uses). A step that times out is a miss, recorded with its step.

## 4. Output

A table, one row per step: the step, its result (`pass`, `miss`, or `skip`), the status, the route, the cost in micro-dollars, and the two readings. Nothing else: no request text, no reply text, no token, no header. Exit 0 when every assertion passes, 1 on any miss, 2 on a refusal.

## 5. What it never does

- Call a paid adapter: dev's route is `{ primary: local, fallback: synthetic }` (`config/routing.yaml`), and the script refuses any other stack.
- Read Langfuse, Prometheus, or the meter: the sign never does (turn-cost.md §1), so the check doesn't either.
- Change `config/`, an env file, or the stack's state beyond stopping and starting its model server. Its fallback turn is metered as dev's synthetic test spend, at the synthetic adapter's configured test price, inside dev's own sub-budget, and no money is spent; the script prints no meter figure.

## 6. Proof

| Proof | How | Covers |
|---|---|---|
| The refusals | `evals/test_sign_check.py`: each refusal of §2, with docker and the probe stubbed, exits 2 and calls nothing | FR-057, SC-010 |
| The steps | the same test file, with a fake compose and a fake probe: the order of §3, the waits, the `finally` start, and a miss at each step | FR-056 |
| The reading | `apps/web/test/room/sign-reading.test.ts`: the script's readings for a fallback reply, a local reply, a degraded 503, and an invalid route, against `turn-cost.test.ts`'s expectations | FR-056 (d), FR-059 |
| No payload | the test's captured output holds no fixture reply's `text` | FR-058 |
| The live run | `make sign-check ENV=dev-cpu`'s whole output in the branch's note | SC-010 |
