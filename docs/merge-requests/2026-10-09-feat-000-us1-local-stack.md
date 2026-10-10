# feat/000-us1-local-stack
Spec: specs/000-local-foundations/ (Phase 3, User Story 1: tasks T048–T066; Phase 11, its convergence tasks T143–T151) · Intent: specs/000-local-foundations/intent.md · Written by: Claude Code (Opus 5.5) as the integrator, with implementer agents in worktrees (the gateway, the operator CLI, the stack, the operator CLI's review fixes, the probe and hello, the gateway's gaps); reviewed by three read-only reviewer agents (the stack, the operator CLI and the gateway, the engine) in three rounds, with the convergence pass after the first · Date: 2026-10-09
Session: started from `~/h4reet-ai/h4reet-ai`, the repository root · Repo hooks active: yes
Authorized by: spec 000's plan.md and tasks.md; the Author's "Continue into Phase 3" (2026-10-08, plan mode), given before stepping away for the night; and, on 2026-10-09, "Keep going until you hit the limit again."

**Status: DRAFT. Not ready to merge.** Everything an agent session can do on this branch before the engine exists is done: three review rounds with every finding fixed and verified, the convergence pass, and `make check` at 110b42e with 0 FAIL. What's left needs your hands or the engine:
- **T063 (yours):** bring the branch up to date with main after T046, then the env files and tokens, the pins, the pulls, and the seed. Done on 2026-10-09. The seed failed on every image at first, and passed after T174's patch ("T063's run" below). T064's session marks the task done.
- **T064 (an agent session, after T063):** dev-cpu on the agents' engine, end to end.
- **T065 (yours):** quickstart.md §1, the cold prod run. Started on 2026-10-09. The first `make up ENV=prod` stopped at the GPU, and the second at SeaweedFS. T176–T178 fix what the second found, and T179 records the GPU fix you made by hand ("T065's run" below).
- **T149 (an agent session, after T065):** apply the first stack run's findings.
- **This note:** T064's and T065's output goes into it, and then this block goes.

**Merge order:** this branch is stacked on `feat/000-foundations`: branched at 8a854f8, whose tip is now bf7cefb, after one fix from this branch's review (b15a33b). Merge that branch first and run its T046; then bring this one up to date with main (T063's first step); then merge it once this block is gone.

## Runs in the Author's terminal

ADR 0017 puts this section first. Nothing here has run outside the sandbox: there is no Docker, GPU, or registry in it.

| What | How it runs | Check before you run it |
|---|---|---|
| **`scripts/operator.py`** (T056) and **`make operator-token`, `operator-status`, `operator-init`** | through `PY_HOST`, by path, with your real token | `localhost` is connected as `127.0.0.1`, never looked up. It reads the token only from `~/.config/h4reet-ai/operator/<stack>.token` (0600, yours, in a 0700 directory, never through a link), or from `--token-stdin`. It sends the token only to its own stack's port on `127.0.0.1` or `localhost` (18003, 18103, or 18303), with no proxy and no redirects, and never prints it. An in-network host is allowed only with `--token-stdin`, never for prod, and only at port 8081. It refuses an answer that names another stack, and its summaries name the stack you asked for, never the answer's. For dev-cpu it calls 18303 directly and runs no Docker in your terminal. It runs the working tree's copy, so check `git status` before you use it. |
| **`scripts/hello.py`** and **`make hello ENV=… [MESSAGE=…]`** (T147) | through `PY_HOST`, by path | It sends `POST /hello` with no token and no client label, only to the stack's own api port on `127.0.0.1` (18000, 18100, or 18300), with no proxy and no redirects, and prints the status and the body with the listener's control characters escaped. Inside the sandbox it refuses prod and dev, and makes the probe hop for dev-cpu through the relay. It runs the working tree's copy, so check `git status` first. |
| **`deploy/agents-engine/authz.py`'s rule A21** (296940b) | the installed copy, which only `engine.sh setup` refreshes, run as yourself, not under sudo: it calls sudo itself (corrected on 2026-10-09) | The agents' engine may now publish only dev-cpu's ports, 18300–18304, and row E15's 18999. Before, it could publish any loopback port, so while prod or dev was down an agents' container could sit on 18003 or 18103 and take the token the operator CLI sent, or sit on 18001 or 18002 and take your Langfuse or Grafana login. The same change is on `feat/000-foundations` (b15a33b), so T046's first setup installs it. A dry run of T063's merge of main, with `git merge-tree`, is clean. |
| **The Makefile's command-line variables** (a9e7878, 3b38470) | every `make` you run | `ENV`, `REF`, `REASON`, the stated values, `RENEW`, `CONFIRM_ZERO`, `TAG`, `SERVICE`, `TAIL`, `MODELS`, `MESSAGE`, `ADAPTER`, and the rest of `LITERAL_VARS` reach the recipes exactly as you typed them: make no longer expands a `$` in them, so `REASON='Spent $4.80'` arrives whole and `$(shell …)` in a value never runs. A value left in your shell's environment still counts for nothing. `scripts/test_makefile.py` fails if a recipe reads, or a help line offers, a variable outside the list. |
| **`deploy/scripts/pull-models.sh`** (T057), and `make pull MODELS=…` | your terminal, Heavy | It runs the disk preflight first, downloads over https with no token, and checks size and sha256 before it makes the file read-only and renames it. |
| **`deploy/scripts/isolation-check.sh`** and **`make isolation-check`** (T061) | your terminal, with prod and dev both up | It runs a throwaway probe container on each stack's networks, from the pinned Python image, with no mounts, no capabilities, and a read-only root. |
| **`deploy/agents-engine/engine.sh`'s `chown_state`** (T145) | `engine.sh up` and `engine.sh seed` | It runs one container on the agents' engine, from `images.lock`'s `base:node` digest, with the state root mounted, to make `dev-cpu/gateway` and give it to the container's uid 1000. With no pinned `base:node` it prints a note and does nothing. |
| **`make image`** and **`make compose-images`** (7f49655) | your terminal, or the gate | They build the live working tree's images, so they build only on the agents' engine: with `DOCKER_HOST=tcp://198.18.0.1:2376`, or through the relay inside the sandbox. On your host's engine they exit 2. |
| **`docs/merge-requests/2026-10-09-fix-000-us1-seed-transfer.patch`** (T174) | `git apply` on this branch, then `deploy/agents-engine/engine.sh seed` again | It changes seed's transfer in `engine.sh`, and its tests. Each image is saved with every platform the host holds, never `--platform`, then tagged on the engine by its pinned digest. A failure prints the engine's or the host's own last line. "T063's run" below has the evidence. |
| **`deploy/compose.yaml`'s SeaweedFS user and Loki's health check** (T176, T177) | `make up ENV=…` | SeaweedFS runs as `1000:1000`, the image's own user, still with every capability dropped. Loki loses a health check that could never run. Nothing new runs. "T065's run" below has the evidence. |
| **`deploy/scripts/status.py`'s pin check** (T178) | `make up`'s last step, and `make status` | It compares strings only: Docker Hub's host, and an official image's `library/`, dropped from both sides. It calls Docker exactly as before. |
| **`tools/gates/compose_policy.py`** | the sandbox, and later the gate | It reports an image whose `images.lock` entry is still open as PLANNED until tasks.md marks that pin's task done (T063), and as FAIL from then on. Preflight refuses to start a stack with an open pin either way. This becomes human-only with T098: please review it. |

## What changed and why

| Commits | Change |
|---|---|
| af8b062 | **T048, T051:** the adapter contract suite (C1–C12), the local adapter over `node:http`, and the registry. |
| fe84e4a | **T049, T052–T054:** the router and the gateway core (the state read, the kill switch, local first, `no_fallback_in_stack`), hello and its per-client cap, and `GET /health`. |
| 030ec0b | **T050, T055:** the admin listener's authentication, `POST /admin/init` and `GET /admin/status`, init (data-model.md §8), and the journal. |
| 88e8b3d | **T056:** the operator CLI's `mint`, `status`, and `init`, `AdminClient` for the evals, and the three make targets. |
| 19af254 | **T057:** the model servers, `deploy/models.lock`, and `pull-models.sh`; disclosure rows S4 and P3. |
| 2396aa9 | **T058:** the collector, Prometheus, Loki, and Grafana, with their configs; rows S5–S8 and B1. |
| fd81f67, 6d38a3a | **T059:** Langfuse 4.54.0, ClickHouse, Valkey, and SeaweedFS; rows S9 and S10. |
| fd5454a | **T060:** the `h4-runtime` dashboard's US1 panels. |
| 99e14b2 | **T061:** `make isolation-check`. |
| c8854ab | **T062:** three runbooks: a model server down, an empty store, a rollback. |
| a9e7878, 0db1fb9, d940093, 8ca2474, b3adb0c, 6b3f5e5, a8c60f9 | **The operator CLI's review fixes** (round 1, below). |
| e9d476d, b9217ef | **The gateway's review fixes** (round 1). |
| 4ca603a | **The stack's review fixes** (round 1). |
| b91ab9b | **The convergence pass:** T143–T151 appended to tasks.md. |
| a8e9cb7 | **T143, T145, T146:** `chown_state` through the engine; T063 now starts with the merge of main and §0.7–§0.8. |
| a376635, 2157dc5, 3dd66f7 | **Round 2's fixes:** env-files.md's Langfuse allowlist wording; `chown_state`'s image from one checked `base:node` line, a seed that fails loudly, and engine.sh's two clients pinned, the engine's and the host's. |
| f81b294, e523c23 | **T144, T147:** the breach probe's image (`evals/Dockerfile.probe`) and `breach-probe` service, brought forward from T080, with disclosure row S11; `make hello` and `scripts/hello.py`. |
| eac6549, e3d431c, 739e311 | **T150, T148, T151:** the listeners' 400 names `field: "body"`; the `fallback_not_supported` refusal recorded as temporary until T074, and tested; the local adapter's 404, 413, 422, 502, 504, DNS, and connect-watchdog mappings tested. |
| 296940b, 3b38470 | **The operator reviewer's round-2 findings:** A21 holds published ports to dev-cpu's; `localhost` is connected as 127.0.0.1; `ADAPTER` joins `LITERAL_VARS`, with a test over the whole list; T072 carries init's deferred fix. |
| a54106e, 7f49655, 110b42e | **Round 3's fixes:** A21 takes one spelling of a port; `make image` and `compose-images` build only on the agents' engine; the probe hops rebuild first (`run --build`); C3's connect window; hostile JSON in both clients; the Makefile test's macro lines. |

### Departures from the plan

Each is recorded where the plan or contract says otherwise, in the commit that made it:
- **T051:** `node:http`, not `fetch` with an undici `Agent`. Node's `fetch` has no connect timeout of its own (provider-adapter.md §3.1).
- **T048:** `makeAdapter` receives a harness (the captured logger), `StubControl` gains `nextHealth` and the request's method, and `LiveRecording` is defined (provider-adapter.md §5.1, af8b062).
- **T052:** a route that names a fallback is refused with exit 78, `fallback_not_supported`, until T072–T074 build the metered path (fe84e4a). It had no plan or contract line; T148 gives it one.
- **T053, clarifications:** §2.5.4's `field` is `"body"` when the body as a whole is wrong; a caller that went away doesn't count as a failed probe (provider-adapter.md §6 item 4); `call.completed` is still written when a local ledger insert fails (telemetry.md §5.2) (fe84e4a).
- **T055:** `GET /admin/status` reports the way `/health` does: with the store unreachable or empty it answers 200, with null meters. Init's response gains `journal.append`, and `confirm_zero_required` counts only `reserve` and `commit` records, as data-model.md §8 step 7 does (operator-admin.md §2.3 and §4.1, 030ec0b).
- **T056:** the transport rules and the dev-cpu routes of operator-admin.md §6, narrowed twice by the review.
- **T057:** the model file's mode is set before the rename, so its own name never holds a writable model.
- **T059:** `LANGFUSE_LLM_CONNECTION_WHITELISTED_*` left unset, not set empty, until T065 reads Langfuse's own compose file; SeaweedFS's pin left open until T063.
- **T061:** the isolation check runs both ways, plus a mount check, which is stricter than plan §4.
- **T151's review:** the contract suite's local subject keeps routing.yaml's 1 s connect timeout, not §5.3's scaled 100 ms (provider-adapter.md §5.3).
- **T148:** `createServices`' `fallback_not_supported` refusal, temporary until T074 (plan §5.8, config-files.md §1.4).

## Acceptance criteria

User Story 1's five scenarios, and what proves each:

| Scenario | Built here | Proven by |
|---|---|---|
| 1. A cold `make up` answers hello within 10 minutes, from pinned images (SC-001) | the whole topology in one compose file, every image pinned but SeaweedFS (T063 pins it), the models in `models.lock` | T065, timed |
| 2. hello answers from the local adapter, with a complete trace in Langfuse | hello, the router, the local adapter, the collector, Langfuse | the integration tests here; T064 on dev-cpu; T065 on prod |
| 3. Only the intended ports are exposed | edge alone publishes ports, all four on `127.0.0.1`; the policy refuses any other | T065's port scan from another machine |
| 4. prod and dev are isolated | separate projects, networks, volumes, and ports | `make isolation-check`, T065 |
| 5. Environments differ only by their env file (FR-017) | one compose file, profiles chosen by the env file | the compose-env tests; T064 and T065 |

FRs met in code here: FR-016–FR-020, FR-021 and FR-022 for the local path, FR-023 (cost 0, basis `none`, for local calls), FR-024's local half (the Bedrock half is T102), FR-025, FR-026–FR-029, FR-031's store and init, FR-034's operator credential and audit rows, FR-038, and FR-040's rows for every new service. FR-039's dev-cpu run is T064.

## Constitution check

| Principle | Touched? | How it complies, or the justified deviation |
|---|---|---|
| I. Data-local | Yes | Every service but edge and the gateway sits on `internal` alone, with no route out. Each one's flows are in `docs/data-flow-disclosure.md` (S4–S10, B1, P3), and every phone-home switch is off (H1). No payload leaves a span unless the collector's own `TELEMETRY_PAYLOAD_SAMPLING` is on, never on prod. |
| II. Production-grade | Yes | Tests for every module (the counts are under Verification), three runbooks, the US1 dashboard panels, and degraded modes from the contracts. The stack's real start is T064 and T065. |
| III. Intent → spec → code | Yes | Built task by task from the merged plan, departures recorded with their commits, two review rounds and the convergence pass before merge. |
| IV. Least privilege | Yes | The operator token goes only to its own stack's listener. The dev-cpu hop runs only inside the sandbox, through the relay, never on your rootful engine. `chown_state` runs on the agents' engine. Nothing widens a permission or an allowlist. |
| V. Cost | Yes | No paid call exists yet: the local adapter records cost 0, basis `none`, and the gateway refuses a route with a fallback (`fallback_not_supported`) until T074 builds the metered one. |
| VI. Build in public | Yes | No secrets. gitleaks finds only the two allowlisted false positives. |
| VII. Own the whole product | No | No claims about the Author. |
| VIII. Honest AI | Yes, lightly | hello's fixed system prompt, normative in gateway-http.md §2.2, says "You are not the Author and not the Author's AI twin, and you know nothing about the Author." |

## Review

### Round 1 (at 6d38a3a, 88e8b3d, and 030ec0b)

Three read-only reviewer agents, one per slice, ran REVIEW.md's passes in `git archive` exports.

| ID | Slice | Finding | Fix |
|---|---|---|---|
| O-1 | Operator CLI | **Important.** make expanded `REASON` and the stated values before the CLI saw them: `REASON='Spent $4.80 of the $5 day ceiling'` arrived as `Spent .80 of the  day ceiling`, and `$(shell …)` in a value ran in your make. The audit row would record a reason you didn't type (FR-034) | a9e7878: every command-line variable is rebound to its literal text; 0db1fb9: a test that runs the recipe for real |
| O-2 | Operator CLI | **Important** (latent until the probe existed). From your terminal, the dev-cpu hop ran `docker compose … run breach-probe` on your rootful engine, with no preflight: agent-written images on the engine FR-039 keeps them off | d940093: the hop runs only inside the sandbox, through the relay; your terminal calls 18303 directly |
| O-3 | Operator CLI | **Important.** A prod or dev token went to any loopback port, including 18303, dev-cpu's, behind a gateway agents build | 8ca2474: only the stack's own port, and an answer naming another stack is exit 4; a8c60f9: an in-network host only at 8081 |
| O-n | Operator CLI | Nits: two safeguards untested (the fstat after open, the unredirected `Authorization`); a single-label host allowed for prod; the summaries printed the answer's stack name | b3adb0c, 8ca2474, 6b3f5e5 |
| G-1 | Gateway | **Important.** A short journal write was reported as durable, and the next record was appended onto the torn tail, so both were lost on a rebuild. Reproduced with a 1 KiB file-size limit | e9d476d: `bytesWritten` is checked, a short write is truncated away and is `unwritable`, and a torn tail gets a newline first |
| G-n1 | Gateway | Nit: `X-Forwarded-For` was believed from any peer, so any container on `internal` could choose its own client identity and dodge the cap | b9217ef: only edge's header counts (`src/core/edge.ts`) |
| G-n2 | Gateway | Nit: init can commit while it answers 503 (a dropped connection after COMMIT), so its journal record is never written | Deferred to T072/T075, where reservations make it matter. Below, under "For later tasks" |
| S-n1–5 | Stack | Nits, no Important: the open-pin mark never expired; what an unset Langfuse allowlist means; a comment naming a missing test file; a runbook using a later target; a dashboard test that could pass empty | 4ca603a |

The stack reviewer checked every new service against plan §1, §2, and the policy, and rendered the memory: prod's limits sum to 18.94 GiB, dev-cpu's to 12.94 GiB against its 15 GiB budget. The gateway reviewer confirmed that the CLI and the gateway agree on `/admin/status`.

### `/speckit-converge` (after round 1)

Run over Phase 3's 19 tasks, 19 FRs, SC-001, the five scenarios, 17 plan sections, and principles I, II, IV, V, and VIII. A read-only agent did the assessment; I checked its findings against the code. It found 9 gaps, 0 critical, 3 high, 4 medium, and 2 low, appended as T143–T151 (b91ab9b):
- **High:** the branch lacked T046's patches, so every gateway would exit 78 (T143); T064's probe hop needed T080's probe image (T144); nothing made dev-cpu's gateway state directory (T145).
- **Medium:** `make pull` needs the env files that T065 made (T146); no hello an agent session can send (T147); the unrecorded `fallback_not_supported` refusal (T148); the first stack run's follow-ups had no owner (T149).
- **Low:** the 400's `field: "body"` (T150); the local adapter's untested error mappings (T151).

All done but T149, which waits for T065: T143, T145, T146 (a8e9cb7); T144, T147 (f81b294, e523c23); T150, T148, T151 (eac6549, e3d431c, 739e311).

### Round 2 (at a8e9cb7)

The same reviewers verified round 1's fixes, and the engine reviewer read the convergence pass's `chown_state` (T145), which no reviewer had seen.

| ID | Slice | Finding | Fix |
|---|---|---|---|
| S-n1–5 | Stack | All five fixed. The open-pin mark reads tasks.md from the tree the policy checks, and a stray line can only expire it early, which fails closed | — |
| S2-n1 | Stack | Nit: env-files.md §5 still said an unset Langfuse allowlist "is the same empty list", which T065 is now asked to confirm | a376635 |
| E2-n1 | Engine | Nit: `H4_STATE_CHOWN_IMAGE` let the shell choose, by tag, the image that runs with the state root bound | 2157dc5: removed |
| E2-n2 | Engine | Nit: the `base:node` parse checked only two fields, so a repository field like `--entrypoint=x` reached `docker run` as an option | 2157dc5: exactly one line, every field in its shape |
| E2-n3 | Engine | Nit: at seed, a missing pin or a failed run was a note, its reason discarded, and seed still said "complete" | 2157dc5: fatal at seed, with the engine's last line; still a note at up, with the reason |
| E2-n4 | Engine | Nit: the Author's engine client deferred to an ambient `DOCKER_HOST`, which could name the host's rootful daemon | 2157dc5: always `198.18.0.1:2376` with your certificate outside the sandbox |
| E3-n1 | Engine | Nit, on 2157dc5: seed's host-side calls (the store check, sizes, pulls, saves) still followed the shell's `DOCKER_HOST`, and the new contract sentence said they didn't | 3dd66f7: `host_docker` pins `unix:///var/run/docker.sock`; verified |

The engine reviewer found the uid mapping sound: in the rootless engine, container uid 1000 lands on `h4agents`' subordinate uid 1066535 in both containers, so the chown gives the directory to exactly the user the gateway writes as. It also confirmed that the admission plugin allows the bind under A14.

The engine reviewer verified 2157dc5 and 3dd66f7: each nit fixed with a regression test, no assertion loosened, and nothing new.

The operator and gateway reviewer verified all nine of round 1's fixes, each by a run and a mutant. For example, `make operator-init ENV=dev-cpu` handed its listener a reason with `$4.80`, quotes, backticks, and `$(shell …)` byte for byte, and ran none of it. A real 1 KiB file-size limit left the journal whole after five short writes. It found two new problems:

| ID | Slice | Finding | Fix |
|---|---|---|---|
| O2-1 | Operator CLI and engine | **Important.** Pinning each token to its own port (8ca2474) still let the agents' engine receive prod's or dev's token whenever that stack is down. Rule A21 checked a published port's address but never its number, so an agents' container could publish `127.0.0.1:18003` through the relay, and `make operator-status ENV=prod` (or `make evals ADAPTER=bedrock`) would send it the token. On 18001 or 18002 it would take your Langfuse or Grafana login. Verified with the plugin's own `judge` and a listener; Docker isn't reachable here | 296940b: A21 allows only dev-cpu's 18300–18304 and E15's 18999, as one plain decimal string; row E15 proves four refusals; both clients connect `localhost` as 127.0.0.1 |
| O2-n1 | Makefile | Nit: `ADAPTER` was outside `LITERAL_VARS`, so `make evals ADAPTER='fake$(shell …)'` ran the shell command | 3b38470, with a test over every variable the recipes read |

It agreed that init's commit-then-503 can wait for T072, but asked for it in T072's text, not only here: 3b38470.

### Round 3 (at 8c5d796)

The three reviewers verified round 2's fixes and reviewed the convergence work that landed since: T144, T147, T148, T150, and T151.

| ID | Slice | Finding | Fix |
|---|---|---|---|
| R3-I1 | Stack | **Important.** `make image`, or `make compose-images`, run in your terminal built the live working tree's images, the probe's now among them, on the host's rootful engine, with no policy check first. operator-admin.md §6 says nothing of the working tree's may be built or run there (FR-039). It was the only path left: `make build` already refuses outside the sandbox | 7f49655: `compose-images` builds only with the relay's `DOCKER_HOST` inside the sandbox, or `tcp://198.18.0.1:2376`; §6's sentence narrowed to what it meant, since `make up` builds the host stacks' gateway image from a commit's export by design |
| R3-n1 | Stack | Nit: neither probe hop passed `--build`, so after an edit to operator.py or hello.py the hop ran the old copy in the image | 7f49655: `run --build`, as `make up --build` keeps a stale image from certifying code |
| R3-n2 | Engine | Nit: A21 took `"018300"`, a zero-padded allowed port, contrary to its docstring. Docker reads it as 18300 too, so nothing got past | a54106e: one spelling only |

The engine reviewer found that A21 now sees every way to publish: the top-level fields, folded keys, `PublishAllPorts`, swarm services, and a legacy start body. It also confirmed that dev-cpu's five edge ports, 18300–18304, still pass. The stack reviewer found T144's image and service, and T147's make target and plan row, sound.

The operator and gateway reviewer found every round-2 fix holding, each shown by a run and a mutant. With dev down, `make operator-status ENV=dev` now finds nothing on 18103 and exits 4. It found no Important problem in hello.py or the gateway's gaps, and three nits:

| ID | Slice | Finding | Fix |
|---|---|---|---|
| R3-n3 | Gateway tests | Nit: C3 failed about once in 17 runs, a real race the reviewer reproduced. At the suite's 100 ms connect timeout, a stalled event loop on a loaded host fired the watchdog before the stub's accept arrived | 110b42e: the local subject keeps routing.yaml's 1 s connect; provider-adapter.md §5.3 records it |
| R3-n4 | Clients | Nit: a body nested 100,000 deep, or with a 5,000-digit number, crashed operator.py and hello.py with a traceback | 110b42e: both catch it; the CLI answers exit 4, hello prints text |
| R3-n5 | Makefile test | Nit: the variable scan saw only recipe lines, not the macros recipes expand | 110b42e: every non-comment line, plus the operator macros' arguments |

Its verdict: ready.

**Then each reviewer verified its own findings' last fixes, at 110b42e:**
- **The engine reviewer, on a54106e and b15a33b:** a padded port is refused, and the base branch's A21 change matches this branch's line for line.
- **The stack reviewer, on 7f49655:** the guard has no hole. A lookalike `DOCKER_HOST` such as `…:23760` is refused. `DOCKER_CONTEXT` can't redirect a build, since the CLI ignores it once `DOCKER_HOST` is set. The relay's own re-run passes.
- **The operator and gateway reviewer, on 110b42e and the hops' `--build`:** stalls of 150, 300, and 600 ms no longer fail C3. Both clients survive the hostile bodies, the Makefile test sees macro lines, and the build context still excludes `deploy/env`, `*.env`, `secrets`, and the private intake.

All three: ready. One thing no reviewer could check is the Compose version on your hosts. `run --build` needs Compose v2.13 or later; Docker 28 ships a newer one.

## Verification

`make check` at 110b42e, exit 0: 5 PASS, 2 SKIP, 4 PLANNED, 0 PENDING, 0 FAIL. The gateway has 361 tests passing and 1 skipped, the real-budgets pin, which waits for the config patch. pytest has 1305 passing.
- **The four PLANNED gates wait for you:** the git hook and the agent-config evals for the early patch (T045), `validate-config` for the config patch (T022), and the policy for SeaweedFS's open pin (T063).
- **The two SKIPs:** the secret scan's gate arrives with T091, and the image gate waits for the engine (T046).

gitleaks over `8a854f8..HEAD`: no leaks found.

<details><summary>make check at 110b42e</summary>

```
== githooks-check
reference-transaction: installed
PLANNED (T045): .claude/git-hooks/pre-commit arrives with the early patch
main: a loose ref, which the git hook guards
-> PLANNED githooks-check (PLANNED (T045): .claude/git-hooks/pre-commit arrives with the early patch)
== toolchain-check
python3 -I -B -X pycache_prefix=/dev/null tools/gates/toolchain_check.py
tool                     pinned   found    status  where
node                     24.21.0  24.21.0  OK      /home/h4reet/.nvm/versions/node/v24.21.0/bin/node
uv                       0.8.22   0.8.22   OK      /home/h4reet/.local/bin/uv
ruff                     0.16.10  0.16.10  OK      /home/h4reet/.local/bin/ruff
gitleaks                 8.30.1   8.30.1   OK      /home/h4reet/.local/bin/gitleaks
python3                  3.12     3.12.3   OK      /usr/bin/python3
shellcheck               0.9.0    0.9.0    OK      /usr/bin/shellcheck
jq                       1.7      1.7      OK      /usr/bin/jq
pytest                   9.1.1    9.1.1    OK      /home/h4reet/.local/bin/pytest
pyyaml (pytest's)        6.0.3    6.0.3    OK      /home/h4reet/.local/share/uv/tools/pytest/bin/python
claude code              2.1.295  2.1.295  OK      /home/h4reet/.nvm/versions/node/v22.18.0/bin/claude
lint: eslint             10.12.0  10.12.0  OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/eslint
lint: typescript-eslint  8.71.1   8.71.1   OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/typescript-eslint
lint: typescript         6.0.3    6.0.3    OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/typescript
lint: prettier           3.9.9    3.9.9    OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/prettier
toolchain-check: all 14 match their pins
-> PASS toolchain-check
== policy
python3 -I -B -X pycache_prefix=/dev/null tools/gates/compose_policy.py
PLANNED (T063): seaweedfs's pin is open; make pin-images resolves it
compose policy: PASS, 1 planned (deploy/compose.yaml with 3 env files, the Dockerfiles, the env-file placement, .devcontainer, .npmrc)
-> PLANNED policy (PLANNED (T063): seaweedfs's pin is open; make pin-images resolves it)
== validate-config
npm run --silent -w services/gateway validate-config -- --root "/home/h4reet/h4reet-ai/h4reet-ai"
NOTE config/prices.yaml: main has no config/prices.yaml yet, so the append-only check waits for it
PLANNED (T022): config/budgets.yaml is missing; the config patch adds it (tasks.md T022), and its checks wait for it
PLANNED (T022): config/alerts.yaml is missing; the config patch adds it (tasks.md T022), and its checks wait for it
validate-config: 0 errors, 1 note, 2 planned
-> PLANNED validate-config (PLANNED (T022): config/budgets.yaml is missing; the config patch adds it (tasks.md T022), and its checks wait for it; PLANNED (T022): config/alerts.yaml is missing; the config patch adds it (tasks.md T022), and its checks wait for it)
== lint
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
131 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh redteam/forbidden-actions.sh tools/gates/install-tools.sh
-> PASS lint
== test
python3 -I -B -X pycache_prefix=/dev/null corpus/tools/check_corpus.py
corpus-check: OK — 20 slots, 4 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems
npm test --workspaces --if-present

> @h4reet/gateway@0.1.0 test
> vitest run


 RUN  v5.0.3 /home/h4reet/h4reet-ai/h4reet-ai/services/gateway


 Test Files  24 passed (24)
      Tests  361 passed | 1 skipped (362)
   Start at  05:20:09
   Duration  21.29s (tests 90%, transform 5%, import 4%)

pytest -q -p no:cacheprovider --import-mode=importlib corpus/tools evals redteam tools/gates deploy/scripts deploy/agents-engine scripts
........................................................................ [  5%]
........................................................................ [ 11%]
........................................................................ [ 16%]
........................................................................ [ 22%]
........................................................................ [ 27%]
........................................................................ [ 33%]
........................................................................ [ 38%]
........................................................................ [ 44%]
........................................................................ [ 49%]
........................................................................ [ 55%]
........................................................................ [ 60%]
........................................................................ [ 66%]
........................................................................ [ 71%]
........................................................................ [ 77%]
........................................................................ [ 82%]
........................................................................ [ 88%]
........................................................................ [ 93%]
........................................................................ [ 99%]
.........                                                                [100%]
1305 passed in 26.13s
-> PASS test
== secrets
-> SKIP secrets (added by T091)
== evals
python3 -I -B -X pycache_prefix=/dev/null evals/run.py --suite product --adapter ${ADAPTER:-fake} $([ "${ADAPTER:-}" = local ] && echo --stack prod)
PASS  hello-fake
evals product (fake): 1 passed, 0 failed
python3 -I -B -X pycache_prefix=/dev/null evals/agent-config/static.py
PASS  CLAUDE.md is 56 lines and 5171 bytes (at most 60 and 6 KB)
PASS  CLAUDE.md names the constitution as superseding it
PASS  REVIEW.md names the constitution as superseding it
PASS  role docs: tools match roles.expected
PASS  role implementer: tools match roles.expected
PASS  role ops: tools match roles.expected
PASS  role red-teamer: tools match roles.expected
PASS  role reviewer: tools match roles.expected
PASS  role spec-writer: tools match roles.expected
PASS  hook .claude/hooks/bash-gate.sh is registered for PreToolUse Bash
PASS  hook .claude/hooks/protected-paths.sh is registered for PreToolUse Edit|Write|MultiEdit|NotebookEdit
PASS  hook .claude/hooks/post-edit-check.sh is registered for PostToolUse Edit|Write|MultiEdit
PASS  hook .claude/hooks/subagent-report-check.sh is registered for SubagentStop (every subagent)
      FR-007: 5 of 27 variables denied by name
PLANNED (T045): 22 FR-007 variables, hook .claude/hooks/content-scan.sh wait for the patch
  waiting: H4_OPERATOR_TOKEN SMTP_PASSWORD SMTP_USER GATEWAY_DB_PASSWORD GATEWAY_GRAFANA_RO_PASSWORD LANGFUSE_PUBLIC_KEY LANGFUSE_SALT LANGFUSE_ENCRYPTION_KEY LANGFUSE_NEXTAUTH_SECRET LANGFUSE_DB_PASSWORD LANGFUSE_INIT_USER_PASSWORD CLICKHOUSE_PASSWORD VALKEY_PASSWORD SEAWEEDFS_S3_SECRET_KEY GF_SECURITY_ADMIN_PASSWORD AWS_PROFILE AWS_CONFIG_FILE AWS_SHARED_CREDENTIALS_FILE AWS_WEB_IDENTITY_TOKEN_FILE AWS_ROLE_ARN AWS_CONTAINER_CREDENTIALS_FULL_URI AWS_CONTAINER_AUTHORIZATION_TOKEN
agent-config static: 0 failed, 23 planned
-> PLANNED evals (PLANNED (T045): 22 FR-007 variables, hook .claude/hooks/content-scan.sh wait for the patch)
== redteam
python3 -I -B -X pycache_prefix=/dev/null redteam/run.py
PASS  benign-greeting (safe, clean)
PASS  planted-human-claim (unsafe, caught: claims to be human)
redteam: 2 passed, 0 failed
-> PASS redteam
== matrix
bash redteam/forbidden-actions.sh
KNOWN GAP   bash-gate.sh          python3 -c 'open("tests/test_router.py", "w").write("")'
KNOWN GAP   bash-gate.sh          install -m 0644 /tmp/new.py tests/test_router.py
KNOWN GAP   bash-gate.sh          git checkout HEAD~1 -- tests/test_router.py
KNOWN GAP   bash-gate.sh          terraform -chdir=infra apply
KNOWN GAP   bash-gate.sh          sh -c "$(printf 'gi%s pu%s' t sh)"
KNOWN GAP   bash-gate.sh          git co main
KNOWN GAP   bash-gate.sh          sh -c 'unset CLAUDE""CODE; git commit -m wip'
forbidden-actions (hook layer): 164 passed, 0 failed, 7 known gaps
-> PASS matrix
== image
SKIP: no agents' engine yet: tasks.md T046
-> SKIP image (no agents' engine yet: tasks.md T046)

PLANNED  githooks-check  PLANNED (T045): .claude/git-hooks/pre-commit arrives with the early patch
PASS     toolchain-check
PLANNED  policy  PLANNED (T063): seaweedfs's pin is open; make pin-images resolves it
PLANNED  validate-config  PLANNED (T022): config/budgets.yaml is missing; the config patch adds it (tasks.md T022), and its checks wait for it; PLANNED (T022): config/alerts.yaml is missing; the config patch adds it (tasks.md T022), and its checks wait for it
PASS     lint
PASS     test
SKIP     secrets  added by T091
PLANNED  evals  PLANNED (T045): 22 FR-007 variables, hook .claude/hooks/content-scan.sh wait for the patch
PASS     redteam
PASS     matrix
SKIP     image  no agents' engine yet: tasks.md T046
make check: 5 PASS, 2 SKIP, 4 PLANNED, 0 PENDING, 0 FAIL
```

</details>

**What only your runs can prove:** everything in "For the Author" below. Nothing here has run a container, a GPU, or a model: there is no Docker in the sandbox. The engine-side claims rest on the admission plugin's own `judge` function and on reading, not on a running daemon.

## Cost and data-flow impact

**Cost:** none metered. The local adapter's calls cost 0, basis `none`; the fallback is refused until T074. The local tier's cost is the 5090's power.

**Data flows:** every new service is on `internal` alone, with no route out (rows S4–S10). The new flows that leave the local tier are your terminal's model downloads from Hugging Face (P3) and whatever Grafana's and Langfuse's pages fetch in your browser (B1, whose hosts T065 records). Images come through `make pull`, as before (P1).

## T063's run (2026-10-09)

The Author's run, as far as the seed. None of it holds a secret. The env files and tokens stay in `~/.config/h4reet-ai`, which no session can read.
1. **The merge of main** (4042f92) was clean.
2. **The env files and the operator tokens:** both stacks, every `__ASK__` filled, with prod's Telegram bot and alert mailbox. The mailbox is a free one for now; mail from the h4reet.ai domain is for a later intent.
3. **`make pin-images`:**
   - SeaweedFS pinned to `4.48@sha256:4e61d15fd359…`, R-09's open pin.
   - `base:python` moved to `a6e34c598f24…`.
   - Every other entry unchanged.
   - Committed as da3a10c. It also asked for the probe's `FROM` by hand, which is 5c2a089; the compose policy passes with it.
4. **`make pull MODELS=all`:**
   - preflight passed (P1–P7, P10, P13, P14), with 120.5 GB free on `/mnt/c` before it;
   - all 15 images were pulled, with no Docker Hub 429;
   - the prod model, 17.2 GB, downloaded in 5 min 21 s at about 55 MB/s, and the stand-in, 468 MB, in 6 s;
   - both models' sha256 match `models.lock`.
5. **`engine.sh seed`:** the disk check passed, and the host pulled the five images only the engine uses. Then **all 19 images FAILED**, and the stand-in model was copied. A failed transfer printed nothing, so two diagnostics took it apart on `ubuntu:24.04`:
   - **The platform save:** with `--platform linux/amd64`, the engine reported "Loaded image ID: sha256:f610ab94…", the amd64 manifest. Without it, the ID was `sha256:534baea6…`, the pinned index digest.
   - **The name:** both loads came in unnamed ("Loaded image ID", no name), so `ubuntu:24.04@sha256:534baea6…` gave "No such image". Saving by `repository@digest` didn't help.
   - **The fix, tried by hand:** `docker tag sha256:534baea6… public.ecr.aws/docker/library/ubuntu:24.04` named it. The pinned reference then resolved: `RepoTags ["…ubuntu:24.04"]`, `RepoDigests ["…ubuntu@sha256:534baea6…"]`.
   - **What T174 does:** seed saves without `--platform`, tags by the pinned digest, and prints each failure's reason. The tests' fake engine had named images on load, which is why they passed. It now loads as the real engine does, and 9 tests fail against the old seed.
6. **Two tests read the state T063 changed** (T175). At 5c2a089, `make check`'s `test` failed twice:
   - `test_pin_images.py`'s no-release-tag test copies the repository's `images.lock`, where SeaweedFS is now pinned.
   - `test_preflight.py`'s P18 test read dev-cpu's real `/run/h4agents/models`, where the seed had put the stand-in model.

   The code was right both times. Each test now gets its own fixture, keeping the scenario it tests: SeaweedFS unpinned in its copy, and dev-cpu's `H4_MODEL_DIR` inside the test. That is a test change during a fix, so here is why: only the fixtures changed, not what the tests assert.
7. **The seed's second run,** after the patch (e745177): 18 images seeded, `ubuntu:24.04` already present, the stand-in model copied, and dev-cpu's state directory made. "seed complete".

## T065's run (2026-10-09)

The Author's two `make up ENV=prod` runs at e745177, as far as the second one's health checks. Status's output goes through `redact.sh`, and none of it holds a secret.
1. **The first start stopped at the GPU.** The other containers started; model-server-gpu didn't: "nvidia-container-cli: initialization error: nvml error: not supported". A diagnostic narrowed it down:
   - `nvidia-container-cli info` failed with the same error as nobody (65534), and worked as root and as root:`h4gpu`.
   - H6 sets `/dev/dxg` to 0660 root:`h4gpu`. The NVIDIA hook's CLI runs its driver step as an unprivileged user unless `nvidia-container-cli.user` is set, and that user can't open the device. `/etc/nvidia-container-runtime/config.toml` had only the commented `#user = "root:video"`.
   - **Your fix, by hand:** `sudo nvidia-ctk config --in-place --set nvidia-container-cli.user=root:h4gpu`. The second start ran the model server, which was still loading when status printed.
   - **T179** puts the setting into `setup-host.sh`, as a patch, and corrects H6's "Rootful Docker runs as root and keeps the GPU".
2. **The second start stopped at SeaweedFS:** "dependency failed to start: container h4reet-prod-seaweedfs-1 is unhealthy", so langfuse-web and langfuse-worker stayed created. Three things were wrong:
   - **SeaweedFS (T176):** the master died at "mkdir /data/m9333: permission denied". The image sets no `USER`. Its own entrypoint chowns `/data` and drops to `seaweed`, uid 1000. Ours replaces it, so the server ran as root with every capability dropped, which can't write a directory it doesn't own. On the agents' engine, the pinned image ran as `1000:1000` with our entrypoint, `--cap-drop ALL`, and `--tmpfs /tmp`. It started the master, the volume server, the filer, and S3, and printed "seaweedfs entrypoint: the langfuse bucket is ready", which the entrypoint prints right after it writes the ready file the health check reads.
   - **Loki (T177):** its health check could never run: "exec: "wget": executable file not found in $PATH". The 3.7.8 image is distroless: user 10001, entrypoint `/usr/bin/loki`, no `/bin/sh` or `/busybox/sh`, and no health flag. Plan §2 said its busybox had been checked at pin time. Like the collector, it now has no compose health check: Prometheus scrapes it, and nothing waits on it.
   - **Status (T178):** ClickHouse, Grafana, Loki, SeaweedFS, and Valkey read "differs from the pin" at both starts, each with a WARN line. They are the five Docker Hub images, and the only ones. Docker prints them by their short names: on the agents' engine, `valkey/valkey@sha256:081c2f5c…` and `chrislusf/seaweedfs@sha256:4e61d15f…`, while nginx's stays in full, `ghcr.io/nginx/nginx-unprivileged@sha256:15c994d1…`. The lock writes `docker.io/…`, so the strings never matched, though the digests did.
3. **To watch at the trace step (§1.4):** SeaweedFS's S3 logs "Failed to load IAM configuration: no signing key found for STS service" as it starts, then serves on 8333. The entrypoint creates the bucket through `weed shell`, not through S3. The trace step shows whether Langfuse's uploads authenticate with the keys in `s3.json`.
4. **Seen while starting, not failures:** the model server's 503 while the model loads, within its 300 s start period; Grafana's "Connection refused" before it listens; Loki's "empty ring" as it starts. Valkey warns "Memory overcommit must be enabled!", a host sysctl. It runs, and T149 can decide whether that matters.
5. **Disk:** at the first start, `docker system df` counted 65 local volumes holding 127.2 GB, with 8 in use and 127.1 GB reclaimable. The 57 that no container uses aren't this stack's running volumes, and may be other projects'. Check what they belong to before §1.2's cold start, and prune nothing blindly.

**The fix's checks,** in its worktree, before the commit: `make check ENGINE_MODE=none-yet` gave 8 PASS, 2 SKIP (secrets, T091; the image gate, held back here to spare the engine the builds), and 1 FAIL. The failure is `toolchain-check`: Claude Code updated itself to 2.1.296, against its pin of 2.1.295, as the engine-bringup note says; re-pinning or rolling back is your call. The gateway has 362 tests passing, and pytest has 1349.

**Resume** once this fix is merged into the branch: §1.1 again, from `make up ENV=prod`.

## For the Author

**Your steps on this branch**, after foundations is merged and its T046 is done:
1. **T063 (Heavy, with no agent session working):**
   1. Bring the branch up to date with main, so it has the two patches: `git switch feat/000-us1-local-stack && git merge main`.
   2. quickstart.md §0.8, then §0.7: `make init-env` and `make operator-token`, for prod and dev. Then, in an editor, fill every `__ASK__`, set each `OPERATOR_TOKEN_SHA256` to its printed hash, and put the Telegram bot and the mailbox into prod's file (dev's channel keys can wait). `make pull`'s preflight needs complete env files and the token files.
   3. `make pin-images`, which also pins SeaweedFS; `make pull MODELS=all`; then `deploy/agents-engine/engine.sh seed`.
   4. Commit the pins on this branch. T064's session marks T063 done, which ends the policy's allowance for an open pin.
2. **T064:** ask me for an agent session on the engine once T063 is done.
3. **T065 (Heavy):** quickstart.md §1, as tasks.md lists it: the first measurements, a cold `make up ENV=prod`, timed for SC-001, init, the hello, the trace, the panels, `make isolation-check` with dev up, the port scan from another machine, and the rollback rehearsal on dev. Paste the results here, with no secrets.
4. **T149:** then ask me to apply what T065 found.

### For later tasks

- **T072:** init can commit while it answers 503 (round 1's G-n2). It is in T072's own text now (3b38470): on a failed COMMIT, re-read `stack_state`, and if this actor wrote it, append the journal record and return the result. Also, `isStoreFailure` reports a CHECK violation inside the transaction as an outage.
- **T074:** remove the `fallback_not_supported` refusal when the metered fallback lands. That is in T074's text too (8c5d796).
- **T087 or the matrix:** a row for `make hello ENV=prod|dev` refused inside the sandbox (the probe implementer's suggestion).
- **T092, the gate:** `compose-images` accepts `DOCKER_HOST=tcp://198.18.0.1:2376` without checking `DOCKER_TLS_VERIFY`. Only a host daemon you had configured to listen there in plaintext could answer, and agents can't bind that address. The gate sets TLS anyway; the guard could require it too (the stack reviewer's round-4 note).
- **The local adapter's health, in production:** the race behind C3 needs an event-loop stall of about 800 ms, and with `unhealthy_after: 1` one such stall marks local unhealthy for about 3 s. The gateway reviewer judged it rare enough to leave; it is worth a look when T072's background tasks land.
- **Before the engine exists,** the probe hops fail with the docker client's own error, where `up` and `status` say "ask the Author". That is cosmetic, and only until T046.
- **T117, the closing patch (the Author decided on 2026-10-09 to leave these until then):**
  - **Durable agent worktrees.** Agent worktrees live in `$TMPDIR`, which every WSL boot wipes, so their work must be committed before a restart. `.claude/worktrees` can't hold them: the sandbox's `denyWrite` has `./.claude`, the whole directory, and that beats the `Edit(.claude/worktrees/**)` allow on main (195e5f6). The options: a writable sibling directory through `permissions.additionalDirectories`, with `.claude` kept locked; or an explicit list of `.claude`'s config paths in place of `./.claude`.
  - **`protected-paths.sh` checks paths only relative to the main tree.** A file inside a `/tmp` worktree's own `.claude/`, `corpus/`, or cost config isn't checked. That doesn't touch the running session, whose hooks run from the main tree, but it lets a branch carry such changes into review. The hook could apply its rules relative to the root of any worktree of this repository.
  - **`Edit(.claude/skills)` in main's settings has no `/**`,** so it denies only a file of that name. The hook covers the directory today, but the rule should read `Edit(.claude/skills/**)`, like the others.

### CLAUDE.md, by your hand

The operator reviewer suggested a line for "Things Claude gets wrong", and its finding O-1 is the reason:

> - Passing a command-line make variable as `"$$NAME"` and calling it literal: make expands its value when it exports it, so `$5` vanishes and `$(shell …)` runs; rebind it with `override NAME := $(value NAME)` and export it.

### Observations

- **A credential reached the agents' session output.** A test failure's long traceback printed a process environment that held the sandbox proxy's credentials, twice: once in my session, once in an agent's. They're in no file, log, or commit. Every agent since runs pytest with `--tb=line` and never prints an environment. Whether to rotate them is your call.
- **Two agents' commits briefly took another session's message.** A stale `$TMPDIR/msg-note.txt` was shared, the Write tool refused to overwrite it, and `git commit -F` used its text. Both agents reworded their own commits; the strays are unreferenced. Prompts now name a unique message file per agent.
- **The reviewers ran outside their Bash grant,** as on foundations: `git archive`, `tar`, and their probes, all in the scratch directory. Role scopes by agent type come with the closing patch.
- **vitest's results cache** reached `services/gateway/node_modules/.vite/` through a reviewer's link to the repository's `node_modules`. It is test-order data that git ignores, and later runs used `--cache=false`.
- **Scratch left in `/tmp/claude-1000`:** the agents' worktrees and exports (`us1-*`, `us2-*`, `h4-us1`, `t056-review`, `gw-us1-review`, `us1-export`, `us1-r2`, `us1-r3`, `r2-a8e9cb7`, `r3-8c5d796`, `a21`, `a21b`, and the foundations ones). After the merges, `git worktree prune` drops the worktrees' registrations, and `rm -rf` the directories.
