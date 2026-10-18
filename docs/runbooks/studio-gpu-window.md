# Runbook: handing the GPU to a studio job and taking it back

A studio job needs prod's GPU. Spec 003's intent puts it this way: "Prod's model server holds about 21 GiB of the GPU's 24 GB (spec 000's plan, §18), so the studio's heavier jobs can't run beside it." This page hands the GPU over and takes it back, so production degrades as designed while the job runs and comes back at the commit it was running. It covers `make studio-window`, the `operator_action` alert for a `studio_window`, and the dashboard's "Studio GPU windows" row. Spec 003: FR-035, SC-011; [contracts/gpu-window.md](../../specs/003-studio-assets/contracts/gpu-window.md); [quickstart.md §4](../../specs/003-studio-assets/quickstart.md#4-group-4-the-gpu-window-fr-035-sc-011). It generalizes step 3, "Free the GPU", of [the image-model evaluation](../research/2026-10-12-image-model-evaluation.md).

## Symptoms

- **Before a job:** prod is up and holds the GPU. With the prod model loaded, `nvidia-smi` showed 21,768 of 24,463 MiB in use ([T065's measurement](../merge-requests/2026-10-09-feat-000-us1-local-stack.md)), so a heavy studio job runs out of memory, or won't start.
- **While a window is open:**
  - The alert, on Telegram and by email: "OPERATOR ACTION: studio GPU window opened by operator #<8 hex>", id `prod:operator_action:studio_window:<audit id>`, then "The model server stops next: hello falls back within the sub-budget, or degrades, until the window closes."
  - The dashboard shades the window on every time series ("Studio GPU windows", from `h4_studio_window`), and "Fallback spend in studio windows" shows the window with no end yet. "Model-server health" reads `local` down.
  - `make hello ENV=prod` answers `route: fallback` with `route_reason: local_unhealthy`, or a degraded 503: `fallback_awaiting_renewal` or `fallback_spent_today` once the sub-budget is spent, `fallback_unavailable` with Bedrock unhealthy, `meter_at_ceiling` at a ceiling.
- **Once it ends:** "OPERATOR ACTION: studio GPU window closed by operator #<8 hex>", then "Hello answers from the local model again. The window's fallback spend: $<USD> in <n> calls." The alert's amount is truncated to cents; the end's own answer and the panel give it to the micro-dollar.

## Impact

- **While the window is open,** hello is answered by the fallback, within its sub-budget, or degrades, exactly as spec 000 routes a model server that is down. No budget, ceiling, or routing changes for the window (FR-035). Before publication, nobody is served.
- **Each fallback call** is charged to the day's fallback sub-budget like any other: at most about $0.0026 a call at Haiku 4.5's list price (spec 000's plan §5.4). Spent, fallback stays refused until a renewal, and hello degrades for the rest of the window.
- **The window stays open** across restarts until `STATE=end` records its end: its state is the store's audit log, so a restarted gateway still reads it open.
- **dev** isn't covered: it routes no fallback, and the target refuses it. If dev is up on the same GPU, `make down ENV=dev` frees its share.

## Act

In your own terminal. An agent session may rehearse the same target on dev-cpu, `make studio-window ENV=dev-cpu …`, whose model server is `model-server-cpu`.

1. **Check prod first:**
   - `make status ENV=prod`: started by `make up`, every service healthy. Note the running commit: SC-011 asks that prod comes back at it.
   - `make operator-status ENV=prod`: `awaiting renewal: no` and some fallback available. Otherwise hello degrades for the whole window; renew first if you want fallback to answer (the runbook `fallback-renewal.md`).
2. **Open the window, with your reason:**

   ```bash
   make studio-window ENV=prod STATE=start REASON="studio: <the job>"
   ```

   It records the window, and only then stops `model-server-gpu`. It says when the model server is stopped.
3. **Optional: one hello,** `make hello ENV=prod`, to see the fallback or the degraded answer. A fallback answer is charged to the sub-budget.
4. **Run the studio job.** `nvidia-smi` shows the GPU free of prod's model.
5. **Once the job has ended and released the GPU, close the window:**

   ```bash
   make studio-window ENV=prod STATE=end REASON="studio: <the job> done"
   ```

   It runs these steps, and records the end only when all of them pass:
   - `make up ENV=prod REF=<H4_REF>`, at the commit prod's run file names: every service healthy, the model's load included, within 600 s;
   - waits, up to 60 s, until the gateway sees the local model healthy (`make operator-status ENV=prod` reads `local healthy`), so the one hello isn't charged to the fallback;
   - one hello, which must answer `route: local`;
   - then the record. Its answer gives the window's open and close times and its fallback spend and calls.
6. **If something is refused:**
   - **409 `already_open` at `start`:** a window is open already. If an earlier start's stop failed, close it (step 5), then start again.
   - **"the window is open, but model-server-gpu didn't stop":** the record went in and the stop didn't. Close it (step 5), which brings prod back, then start again.
   - **409 `not_open` at `end`:** no window is open. If the model server is down anyway, `make up ENV=prod REF=<the commit>` brings it back.
   - **"make up didn't bring h4reet-prod back healthy":** the window stays open. Is the studio job still holding the GPU (`nvidia-smi`)? Stop it. Then `make logs ENV=prod SERVICE=model-server-gpu`, the runbook `model-server-down.md`, and step 5 again. Each step is safe to repeat.
   - **"the gateway didn't see the local model healthy" or "hello didn't answer route: local":** the window stays open, and hello's answer is printed above the message. The runbook `model-server-down.md`, then step 5 again.
   - **409 `store_uninitialized`:** the runbook `store-initialization.md`. **401:** the token file doesn't match the env file's `OPERATOR_TOKEN_SHA256` (the runbook `operator-auth-failures.md`).

## Verify

- **SC-011:** "In a rehearsed GPU hand-off, prod answers hello from the local model within 10 minutes of the job's end, at the commit it ran before, and the window's fallback spend appears on the dashboard, within the sub-budget."
  - The end's own hello answered `route: local`; its time against the job's end is the first number.
  - `make status ENV=prod` shows the commit you noted in step 1.
  - "Fallback spend in studio windows" shows the window with its end, its spend, and its calls; "Fallback sub-budget remaining" never read "awaiting renewal" during it, unless you chose to let it degrade.
- `make operator-audit ENV=prod` shows two `studio_window` rows with your reasons: the start and the end.
- The dashboard's shaded region ends where the end was recorded, and "Model-server health" reads `local` up.

## Undo

- **An open window** is undone by closing it (step 5). There is nothing to delete: the audit log is append-only, and the window's rows are its record.
- **prod at the wrong commit** after the end: the runbook `rollback.md`.

## Record

The two audit IDs, the window's open and close times, the studio job it was for, the fallback spend and calls from the end's answer, the minutes from the job's end to hello answering `route: local` (SC-011's 10), the commit before and after, and any refusal with what you did about it.
