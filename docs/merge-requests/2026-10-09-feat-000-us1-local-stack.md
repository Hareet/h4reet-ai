# feat/000-us1-local-stack
Spec: specs/000-local-foundations/ (Phase 3, User Story 1: tasks T048–T066; Phase 11, its convergence tasks T143–T151) · Intent: specs/000-local-foundations/intent.md · Written by: Claude Code (Opus 5.5) as the integrator, with implementer agents in worktrees (the gateway, the operator CLI, the stack, the operator CLI's review fixes, the probe and hello, the gateway's gaps); reviewed by read-only reviewer agents in two rounds, with the convergence pass between them · Date: 2026-10-09
Session: started from `~/h4reet-ai/h4reet-ai`, the repository root · Repo hooks active: yes
Authorized by: spec 000's plan.md and tasks.md; the Author's "Continue into Phase 3" (2026-10-08, plan mode), given before stepping away for the night; and, on 2026-10-09, "Keep going until you hit the limit again."

**Status: DRAFT. Not ready to merge.** Everything an agent session can do on this branch before the engine exists is done, reviewed, and passes `make check`. What's left needs your hands or the engine:
- **T063 (yours):** bring the branch up to date with main after T046, then the env files and tokens, the pins, the pulls, and the seed.
- **T064 (an agent session, after T063):** dev-cpu on the agents' engine, end to end.
- **T065 (yours):** quickstart.md §1, the cold prod run.
- **T149 (an agent session, after T065):** apply the first stack run's findings.
- **This note:** T064's and T065's output goes into it, and then this block goes.

**Merge order:** this branch is stacked on `feat/000-foundations`: branched at 8a854f8, whose tip is now bf7cefb, after one fix from this branch's review (b15a33b). Merge that branch first and run its T046; then bring this one up to date with main (T063's first step); then merge it once this block is gone.

## Runs in the Author's terminal

ADR 0017 puts this section first. Nothing here has run outside the sandbox: there is no Docker, GPU, or registry in it.

| What | How it runs | Check before you run it |
|---|---|---|
| **`scripts/operator.py`** (T056) and **`make operator-token`, `operator-status`, `operator-init`** | through `PY_HOST`, by path, with your real token | `localhost` is connected as `127.0.0.1`, never looked up. It reads the token only from `~/.config/h4reet-ai/operator/<stack>.token` (0600, yours, in a 0700 directory, never through a link), or from `--token-stdin`. It sends the token only to its own stack's port on `127.0.0.1` or `localhost` (18003, 18103, or 18303), with no proxy and no redirects, and never prints it. An in-network host is allowed only with `--token-stdin`, never for prod, and only at port 8081. It refuses an answer that names another stack, and its summaries name the stack you asked for, never the answer's. For dev-cpu it calls 18303 directly and runs no Docker in your terminal. It runs the working tree's copy, so check `git status` before you use it. |
| **`scripts/hello.py`** and **`make hello ENV=… [MESSAGE=…]`** (T147) | through `PY_HOST`, by path | It sends `POST /hello` with no token and no client label, only to the stack's own api port on `127.0.0.1` (18000, 18100, or 18300), with no proxy and no redirects, and prints the status and the body with the listener's control characters escaped. Inside the sandbox it refuses prod and dev, and makes the probe hop for dev-cpu through the relay. It runs the working tree's copy, so check `git status` first. |
| **`deploy/agents-engine/authz.py`'s rule A21** (296940b) | the installed copy, which only `sudo engine.sh setup` refreshes | The agents' engine may now publish only dev-cpu's ports, 18300–18304, and row E15's 18999. Before, it could publish any loopback port, so while prod or dev was down an agents' container could sit on 18003 or 18103 and take the token the operator CLI sent, or sit on 18001 or 18002 and take your Langfuse or Grafana login. The same change is on `feat/000-foundations` (b15a33b), so T046's first setup installs it. A dry run of T063's merge of main, with `git merge-tree`, is clean. |
| **The Makefile's command-line variables** (a9e7878, 3b38470) | every `make` you run | `ENV`, `REF`, `REASON`, the stated values, `RENEW`, `CONFIRM_ZERO`, `TAG`, `SERVICE`, `TAIL`, `MODELS`, `MESSAGE`, `ADAPTER`, and the rest of `LITERAL_VARS` reach the recipes exactly as you typed them: make no longer expands a `$` in them, so `REASON='Spent $4.80'` arrives whole and `$(shell …)` in a value never runs. A value left in your shell's environment still counts for nothing. `scripts/test_makefile.py` fails if a recipe reads, or a help line offers, a variable outside the list. |
| **`deploy/scripts/pull-models.sh`** (T057), and `make pull MODELS=…` | your terminal, Heavy | It runs the disk preflight first, downloads over https with no token, and checks size and sha256 before it makes the file read-only and renames it. |
| **`deploy/scripts/isolation-check.sh`** and **`make isolation-check`** (T061) | your terminal, with prod and dev both up | It runs a throwaway probe container on each stack's networks, from the pinned Python image, with no mounts, no capabilities, and a read-only root. |
| **`deploy/agents-engine/engine.sh`'s `chown_state`** (T145) | `engine.sh up` and `engine.sh seed` | It runs one container on the agents' engine, from `images.lock`'s `base:node` digest, with the state root mounted, to make `dev-cpu/gateway` and give it to the container's uid 1000. With no pinned `base:node` it prints a note and does nothing. |
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
| f81b294, e523c23 | **T144, T147:** the breach probe's image (`evals/Dockerfile.probe`) and `breach-probe` service, brought forward from T080, with disclosure row S11; `make hello` and `scripts/hello.py`. |
| eac6549, e3d431c, 739e311 | **T150, T148, T151:** the listeners' 400 names `field: "body"`; the `fallback_not_supported` refusal recorded as temporary until T074, and tested; the local adapter's 404, 413, 422, 502, 504, DNS, and connect-watchdog mappings tested. |
| 296940b, 3b38470 | **The operator reviewer's round-2 findings:** A21 holds published ports to dev-cpu's; `localhost` is connected as 127.0.0.1; `ADAPTER` joins `LITERAL_VARS`, with a test over the whole list; T072 carries init's deferred fix. |
| a376635, 2157dc5, 3dd66f7 | **Round 2's fixes:** env-files.md's Langfuse allowlist wording; `chown_state`'s image from one checked `base:node` line, a seed that fails loudly, and engine.sh's two clients pinned, the engine's and the host's. |

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

Pending: the operator and gateway reviewer's report on round 2's fixes, hello.py, and the gateway's gaps.

## Verification

Pending: the final `make check` at the tip.

## Cost and data-flow impact

**Cost:** none metered. The local adapter's calls cost 0, basis `none`; the fallback is refused until T074. The local tier's cost is the 5090's power.

**Data flows:** every new service is on `internal` alone, with no route out (rows S4–S10). The new flows that leave the local tier are your terminal's model downloads from Hugging Face (P3) and whatever Grafana's and Langfuse's pages fetch in your browser (B1, whose hosts T065 records). Images come through `make pull`, as before (P1).

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

- **T072/T075:** init can commit while it answers 503 (round 1's G-n2). The fix: on a failed COMMIT, re-read `stack_state`, and if this actor wrote it, append the journal record and return the result. `isStoreFailure` also reports a CHECK violation inside the transaction as an outage.
- **T074:** remove the `fallback_not_supported` refusal when the metered fallback lands.

### CLAUDE.md, by your hand

The operator reviewer suggested a line for "Things Claude gets wrong", and its finding O-1 is the reason:

> - Passing a command-line make variable as `"$$NAME"` and calling it literal: make expands its value when it exports it, so `$5` vanishes and `$(shell …)` runs; rebind it with `override NAME := $(value NAME)` and export it.

### Observations

- **A credential reached the agents' session output.** A test failure's long traceback printed a process environment that held the sandbox proxy's credentials, twice: once in my session, once in an agent's. They're in no file, log, or commit. Every agent since runs pytest with `--tb=line` and never prints an environment. Whether to rotate them is your call.
- **Scratch left in `/tmp/claude-1000`:** the agents' worktrees and exports (`us1-*`, `h4-us1`, `t056-review`, `gw-us1-review`, `us1-export`, and the foundations ones). After both merges, `git worktree prune` drops the worktrees' registrations, and `rm -rf` the directories.
