# Runbook: Bedrock is unavailable

Prod's paid fallback, the `bedrock` adapter, can't serve: its credentials are missing, expired, or refused, its circuit breaker opened after three failed calls, or a call failed. This page covers the `fallback_unavailable` alert and the degraded cause `fallback_unavailable` ([contracts/alerts.md §6](../../specs/000-local-foundations/contracts/alerts.md#6-runbooks)). Spec 000: FR-022, FR-030, FR-031; plan §5.2 and §19; [contracts/provider-adapter.md §2.5](../../specs/000-local-foundations/contracts/provider-adapter.md#25-provider-errors), [§3.2](../../specs/000-local-foundations/contracts/provider-adapter.md#32-bedrock-converse-type-bedrock-converse), and [§6](../../specs/000-local-foundations/contracts/provider-adapter.md#6-around-an-adapter-call-what-the-gateway-does).

## Symptoms

- **The alert**, on Telegram and by email: "FALLBACK UNAVAILABLE: bedrock is unhealthy (credentials)", or "(circuit open)", id `prod:fallback_unavailable:bedrock:<YYYY-MM-DDTHHZ>`, at most one an hour, with the sentence "If the local model goes down, hello answers degraded with fallback_unavailable."
- **hello, with the local model down,** answers 503 with `X-H4-Degraded-Cause: fallback_unavailable` ([contracts/gateway-http.md §3](../../specs/000-local-foundations/contracts/gateway-http.md#3-degraded-causes)): "The local model is unavailable, and so is the fallback." One failed fallback call gets the same answer with no alert, while the circuit stays closed: the first or second failure in a row, or a request Bedrock refused (`bad_request`).
- **`make operator-status ENV=prod`**: `bedrock unhealthy (credentials)` or `bedrock unhealthy (circuit_open)` on the adapters line.
- **The dashboard** (`http://localhost:18002/d/h4-runtime`): "Model-server health" shows `adapter bedrock` down. While the local model is down too, "Why responses are degraded" shows `fallback_unavailable`.
- **The gateway's log:** an `adapter.health_changed` record for `bedrock` with `healthy` false and the reason, and a `call.completed` record for each failed call, with `"adapter":"bedrock"` and its `error_kind`.
- **Only prod**: the other stacks route no paid adapter.

## Impact

- **While the local model is up:** none. hello answers locally, and Bedrock serves only when local can't.
- **While the local model is down too:** hello answers 503 `fallback_unavailable`. A failed call costs nothing, except one that timed out: it may have reached the model, so the meter charges its reserved maximum (`possiblyBilled`).
- **The circuit** opens for 30 s after 3 failures in a row of kind `unavailable`, `timeout`, `rate_limited`, `auth`, or `provider_error`. Then one trial call is allowed: a success closes it, and a failure opens it for another 30 s. So while Bedrock keeps failing, a fallback request reaches it at most once every 30 s.
- The meter, the kill switch, and the sub-budget are unaffected.

## Act

In your own terminal.

1. **Find the reason:**

   ```bash
   make operator-status ENV=prod                  # bedrock unhealthy (credentials) or (circuit_open)
   make logs ENV=prod SERVICE=gateway TAIL=2000   # adapter.health_changed, and call.completed for bedrock
   ```

   Each failed call's `call.completed` names its `error_kind`, never a payload or the provider's text. In Langfuse, the call's span adds the exception's name as `error.type`.
2. **By the reason:**
   - **`credentials`, and the SSO session has ended** (the end on the adapters line is past): `make aws-login` (the runbook `bedrock-credentials-expiring.md`).
   - **`credentials` with the session's end still ahead, or `auth` calls** (`AccessDeniedException`, `UnrecognizedClientException`, `ExpiredTokenException`): the runtime identity can't call the model. In IAM Identity Center, with your own console session, check that its permission set allows `bedrock:InvokeModel` on the inference profile `config/routing.yaml` names and on the foundation models it routes to, that the set is assigned to the runtime user, and that the model's access is granted in the Bedrock console (quickstart.md §0.6). IAM changes are yours alone. If they don't explain it, `make aws-login` again, as the runtime user.
   - **`circuit_open`:** three calls failed in a row; their `error_kind` says how:
     - **`rate_limited`** (`ThrottlingException`, `ServiceQuotaExceededException`): Bedrock is limiting the account. Throttled calls aren't billed, and the circuit lets a trial through every 30 s. If it lasts, check the model's quotas in the Service Quotas console.
     - **`timeout`:** no answer within 4 s, each charged at its reserved maximum. Check the host's connection, and Bedrock's status in us-east-1 on the AWS Health Dashboard.
     - **`unavailable`** (`ServiceUnavailableException`, `ModelNotReadyException`, a refused connection, a failed name lookup) or **`provider_error`** (`InternalServerException`, `ModelErrorException`): the network or Bedrock. Nothing in the stack needs changing, and the circuit closes once a trial call succeeds.
     - **`auth`:** as `credentials` above.
   - **`bad_request`** (`ValidationException`, `ResourceNotFoundException`) opens no circuit and sends no alert, but each such call answers `fallback_unavailable`. Usually it's the model: `adapters.bedrock.model` in `config/routing.yaml` must be the inference profile you confirmed with `aws bedrock list-inference-profiles --region us-east-1`, and `additional_request_fields` must suit it (quickstart.md §0.6). Fix it, commit, then `make up ENV=prod`, which runs the committed file.
3. **While you work,** bring the local model back if it's down (the runbook `model-server-down.md`): hello then answers locally, whatever Bedrock's state.
4. **To take Bedrock out of service on purpose,** for a long AWS outage or an IAM fix that has to wait: remove `fallback: bedrock` from `envs.prod` in `config/routing.yaml`, commit, then `make up ENV=prod`. Prod then has no fallback, and with the local model down, hello answers `no_fallback_in_stack` (contracts/config-files.md §1.1).

## Verify

- `make operator-status ENV=prod` shows `bedrock healthy`: about 10 s after a credentials fix (the health check's cadence), and once an open circuit's 30 s are over.
- The dashboard's "Model-server health" shows `adapter bedrock` up.
- To prove a real call end to end, quickstart.md §4.2 stops the model server and watches hello fall back to Bedrock within 5 s, then starts it again. It is Heavy: the prod model reloads afterwards.

## Undo

- Put back what you changed, `fallback: bedrock` in prod's route or the model's ID, commit, then `make up ENV=prod`.
- An IAM change is undone in IAM Identity Center, with your own console session.

## Record

In the next merge-request note, or in an incident note in `docs/incidents/` when prod answered degraded because of it: when it started and ended, the health reason, the failed calls' `error_kind` and how many (from `make logs`, so redacted), what they cost (the dashboard's "Cost by provider and attribution", and the fallback line of `make operator-status ENV=prod`), and what you changed, by name, never a value. Never the account ID or anything from the SSO cache.
