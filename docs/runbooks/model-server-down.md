# Runbook: the model server is down

The local model server (`model-server-gpu` on prod and dev, `model-server-cpu` on dev-cpu) isn't answering, so the gateway's local adapter is unhealthy. This page covers the degraded cause `no_fallback_in_stack`, and the local model being down on prod ([contracts/alerts.md §6](../../specs/000-local-foundations/contracts/alerts.md#6-runbooks)). Spec 000: FR-019, FR-022; plan §3 and §19; ADR 0019.

## Symptoms

- **hello**, on dev and dev-cpu, answers from the synthetic fallback (`route: fallback`, `provider: synthetic`), $0.10 of synthetic spend a call, until dev's own sub-budget is spent; with `GATEWAY_TEST_SYNTHETIC_SPEND` off, it answers 503 with `X-H4-Degraded-Cause: no_fallback_in_stack`. On prod it answers from Bedrock instead (`route: fallback`), until the fallback sub-budget is spent (`fallback_awaiting_renewal`) or Bedrock can't serve either (`fallback_unavailable`).
- **The dashboard** (`http://localhost:<x002>/d/h4-runtime`): "Model-server health" shows the model server down, and the local adapter down beside it. "Why responses are degraded" shows the cause.
- **`make status ENV=<stack>`** shows the model server `unhealthy`, `starting`, `exited`, or `missing`, with its last health-check output and its error lines, redacted.
- **`make up ENV=<stack>`** exits 1 and names the model server. The rest of the stack keeps running.

## Impact

- **dev and dev-cpu:** no money is spent: these stacks have no paid fallback (FR-031). Their synthetic fallback's spend counts toward dev's own meters, with prod's thresholds (FR-036), so a long outage there warns, exhausts the sub-budget, and can trip dev's kill switch, as the breach test does on purpose.
- **prod:** hello keeps answering, from Bedrock, and every answer costs money, inside the $2 a day fallback sub-budget and the $5 a day and $20 a month ceilings (ADR 0001). When the sub-budget is spent, hello answers degraded until you renew it (the runbook `fallback-renewal.md`).
- The meter, the kill switch, and the store are unaffected. The gateway checks the model server every second: one failed check marks it unhealthy, and three passing ones mark it healthy again ([contracts/provider-adapter.md](../../specs/000-local-foundations/contracts/provider-adapter.md)), so answers come back from local within seconds of it recovering.

## Act

All in your own terminal. On dev-cpu, the agents' engine, an agent session runs the same make targets.

1. **See what failed.**

   ```bash
   make status ENV=<stack>
   make logs ENV=<stack> SERVICE=model-server-gpu     # model-server-cpu on dev-cpu; warnings and errors only, redacted
   ```

2. **Fix the cause the log names:**
   - **The model file is missing, the wrong size, or not mode 0444** (preflight P18 says so too): `make pull ENV=<stack>` fetches it, checks its sha256 against `deploy/models.lock`, and sets it read-only. A file of another size is never overwritten: move it aside first. On dev-cpu the engine never downloads: ask the Author to run `deploy/agents-engine/engine.sh seed`.
   - **Out of GPU memory** (`cudaMalloc failed`, `out of memory`): check `nvidia-smi --query-gpu=memory.used,memory.total --format=csv`. With prod and dev both up, stop dev's model server, or dev itself (`make down ENV=dev`). If prod's model doesn't fit alone, set `MODEL_CTX_SIZE=16384` and `MODEL_PARALLEL=2` in `~/.config/h4reet-ai/env/prod.env`, which halves the KV cache (plan §3).
   - **No GPU in the container** (`could not select device driver "" with capabilities: [[gpu]]`): the NVIDIA runtime isn't registered with Docker. Run `sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker` (quickstart.md §0.2). Preflight P12 checks for it.
   - **It never becomes ready** within its start period (300 s on the GPU, 60 s on the CPU): read the log's last lines for the load error, and check the free disk and memory figures preflight prints.
3. **Start it again:** `make up ENV=<stack>`. It runs preflight, fetches what is missing, recreates only what changed, and waits for every health check.

On prod, while you work, watch the fallback spend: `make operator-status ENV=prod`. Don't renew the sub-budget just to cover a long outage without deciding to spend it.

## Verify

- `make status ENV=<stack>` shows the model server `running` and `healthy`, and the gateway's `/health` lists the local adapter as healthy.
- hello answers 200 with `route: "local"`:

  ```bash
  curl -sS -X POST http://127.0.0.1:<x000>/hello -H 'Content-Type: application/json' -d '{"message":"Say hello."}'
  ```

- The dashboard's "Model-server health" shows up again within about 15 s (Prometheus scrapes the model server every 5 s).

## Undo

- Put back any env value you changed, for example `MODEL_CTX_SIZE=32768` and `MODEL_PARALLEL=4` on prod, then `make up ENV=prod`.
- A model file you moved aside can come back once the cause is fixed. `make pull` keeps a file only if it has the lock's size and sha256.

## Record

In the next merge-request note, or in an incident note in `docs/incidents/` when prod was affected: the stack, when it started and ended, the cause in the log's own words (through `make logs`, so redacted), what you changed (env keys by name, never a value), the GPU memory figures, and on prod the fallback spend during the outage (`make operator-status ENV=prod`).
