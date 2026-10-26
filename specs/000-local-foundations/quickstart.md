# Quickstart: validating spec 000

Phase 1 output of `/speckit-plan`. These are the runs that prove each user story end to end on the RTX 5090 host and on the agents' engine. They are a validation guide, not an implementation: the commands are the ones the plan defines, and the contracts hold the details this file links to instead of repeating.

Contracts: [gateway-http.md](contracts/gateway-http.md), [operator-admin.md](contracts/operator-admin.md), [provider-adapter.md](contracts/provider-adapter.md), [config-files.md](contracts/config-files.md), [alerts.md](contracts/alerts.md), [telemetry.md](contracts/telemetry.md), [env-files.md](contracts/env-files.md), [agents-engine.md](contracts/agents-engine.md); and [data-model.md](data-model.md).

## Conventions

- **The Author's terminal:** a WSL shell outside Claude Code. Hooks block these commands for agents (plan conventions).
- **An agent session:** inside Claude Code's sandbox. Container commands go through `deploy/agents-engine/docker-relay`, which the make targets add themselves ([agents-engine.md §2.2](contracts/agents-engine.md#22-the-relay)).
- **Heavy:** a big download, a model load, a stack bring-up, an image-store switch, or a `wsl --shutdown`. Run it only when no agent session is open and the branch is committed, after the disk check in [§0.1](#01-disk-first). A full Windows drive crashed WSL, and every session in it, on 2026-10-08 ([research.md R-32](research.md#r-32-host-disk-space-is-the-windows-drives)).
- **The evidence** goes into the merge-request note of the task group that runs the scenario (plan [§21](plan.md#21-order-of-work-risks-and-proof)), under a heading for Author-terminal results. Record commands, exit codes, timings, counts, and identifiers (trace IDs, alert dedupe keys, Telegram's `message_id`). Never a secret, a token, an env-file value, a payload, or raw logs. Logs come only through `make logs`, which redacts, and only the lines a result needs.
- **Ports,** per stack: prod 18000–18004, dev 18100–18104, dev-cpu 18300–18304, published by the agents' engine on the host's `127.0.0.1`, which the Author's terminal can reach and the sandbox can't (x000 api, x001 Langfuse, x002 Grafana, x003 admin, x004 OTLP; plan [§1](plan.md#1-topology)).

## 0. One-time host prerequisites

Each step is **the Author's terminal**. Plan [§21](plan.md#21-order-of-work-risks-and-proof) lists them; this section says how to check each.

### 0.1 Disk first

About 50 GB free beyond today's use, on the Windows drive that holds WSL's `ext4.vhdx`: images, both models, the engine's copy of the images, and data (R-32).

- **Check the right figure:** `df -h /mnt/c` (or the drive `H4_VHDX_MOUNT` names). `df /` inside WSL measures the virtual disk, not the drive under it.
- **To make room:**
  - free space on C:; or
  - reclaim what WSL already deleted: `sudo fstrim -av` in WSL, `wsl --shutdown` in PowerShell, then `diskpart` with `select vdisk file="<path to ext4.vhdx>"` and `compact vdisk` (Heavy);
  - or move the distro to D: (`wsl --manage <distro> --move <D: folder>`), which works only once the virtual disk fits D:'s free space.
  - Don't use a sparse virtual disk: current WSL disables it after data-corruption reports.
- **Optional:** `memory=48GB` in `%UserProfile%\.wslconfig`, then `wsl --shutdown`, so Windows keeps headroom (research.md R-04).
- **Record:** the Windows drive's and ext4's free space, before and after.

### 0.2 The NVIDIA runtime (done on 2026-10-08)

```bash
sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker
docker info --format '{{json .Runtimes}}'          # lists "nvidia"
docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu24.04@sha256:e778509d37d66475120929671500377524f7278478ba08131b07ef3ffcc0dce0 \
  nvidia-smi --query-gpu=name,driver_version,compute_cap,memory.total --format=csv
```

Expected: the RTX 5090 Laptop GPU, driver 592.01, compute capability 12.0, 24,463 MiB (research.md R-01).

Once §0.5 gives `/dev/dxg` to root:`h4gpu`, the NVIDIA hook's CLI needs a user in that group, or every GPU container fails with "nvml error: not supported" (T065). `engine.sh setup` sets it (§0.5; contracts/agents-engine.md H6, tasks.md T179).

### 0.3 Node 24 and the tools

```bash
make tools             # Node 24.21.0 through nvm, pytest, gitleaks, and the lint toolchain, where agents can't write (plan §9)
make toolchain-check   # PASS: every version matches .devcontainer/toolchain.vars
gitleaks version       # 8.30.1: the early patch's hooks fail closed without it
```

This is tasks.md T013, on the setup branch, before its note is written.

**Proposed: Claude Code's pin is a floor** ([ADR 0023](../../docs/adr/0023-claude-code-pin-is-a-floor.md), 2026-10-18). Claude Code updates itself from your other projects, which this project's `DISABLE_AUTOUPDATER` doesn't reach. Once you accept the ADR and apply its patch, `make toolchain-check` passes a newer Claude Code with a WARN row and a `WARN:` line, and fails only an older one. Every other tool must still match its pin exactly. Until then, a newer Claude Code fails the check.

Don't make Node 24 your default (`nvm alias default`): Claude Code is installed under your default Node, and the Makefile finds the pinned one itself. Also remove from your shell profile any variable an env template uses, such as `TELEGRAM_BOT_TOKEN`, and any `COMPOSE_*` or `H4_*`. Preflight refuses to start while the shell sets one, because compose would let it override the env file ([env-files.md §10](contracts/env-files.md#10-make-up-preflight), P5).

### 0.4 The host's Docker moves to the containerd image store (Heavy)

Follow [agents-engine.md §6.1](contracts/agents-engine.md#61-the-hosts-docker-moves-to-the-containerd-image-store-first): stacks down, prune, switch, restart, pull again. Expected: `docker info --format '{{json .DriverStatus}}'` names `io.containerd.snapshotter.v1`. Named volumes survive the switch. Record the free space before and after.

### 0.5 The agents' engine (Heavy: it ends with `wsl --shutdown`)

```bash
deploy/agents-engine/engine.sh setup      # sudo; the user h4agents, the firewall, /dev/dxg, the tree, the PKI (agents-engine.md §5)
# then in PowerShell: wsl --shutdown, and open a new WSL shell
id -nG                 # includes h4gpu
stat -c '%a %U:%G' /dev/dxg /mnt/c/Users   # 660 root:h4gpu, and 700 for /mnt/c/Users
deploy/agents-engine/engine.sh setup      # again, when its last lines ask: with /dev/dxg in H6's mode now, it tries nobody:h4gpu for the NVIDIA CLI (T179)
deploy/agents-engine/engine.sh up
make engine-status     # reachable, rootless, plugin h4-authz listed
deploy/agents-engine/engine.sh status     # also: /dev/dxg root:h4gpu 660; the NVIDIA container CLI runs as nobody:h4gpu (or root:h4gpu)
```

`wsl --shutdown` ends every WSL session, agents' included. Run the engine's commands directly, never through make ([agents-engine.md §8](contracts/agents-engine.md#8-commands)). Seeding comes after the pull ([§0.9](#09-the-first-pull-and-the-seed)), once US1 has the models' lock and the last image pin.

### 0.6 The runtime AWS identity (FR-013)

In IAM Identity Center, with the Author's own console session. IAM is a human action; this hand-made identity is a named deviation from "Infrastructure exclusively via Terraform" until spec 001 imports it (spec Assumptions; research.md [R-17](research.md#r-17-the-runtime-aws-identity-the-author-narrowed-by-the-plan)). It comes with US5 (tasks.md T105); prod starts without it.
1. Create the user `h4reet-runtime` (the plan's proposal, pending your confirmation), and a permission set that allows only `bedrock:InvokeModel` on the one inference profile and the foundation models it routes to. Assign it to the account. Grant model access in the Bedrock console if Anthropic's models need it.
2. Confirm the model ID with the Author's own session, not the runtime identity, which can only invoke: `aws bedrock list-inference-profiles --region us-east-1`. Claude Haiku 5.5 if it is offered, otherwise Claude Haiku 4.5's `us.` profile (research.md R-12).
3. Only after US5's enforcement patch is applied (`docs/merge-requests/2026-10-10-feat-000-us5-fallback-enforcement.patch`, plan §15's fourth patch), since `fallback: bedrock` is the first paid route and the patch refuses agents the targets that call it: write the ID into `config/routing.yaml` (`adapters.bedrock.model`), and add `fallback: bedrock` to prod's route. Append a new version to `config/prices.yaml`, which is human-only, with the ID and its prices from the Bedrock pricing page: a published version never changes, so the new one repeats the local and synthetic entries ([config-files.md §2.2](contracts/config-files.md#22-example)). Commit both, then `make up ENV=prod`: prod runs the committed files, and refuses to start while a routed adapter holds a placeholder ([config-files.md §5](contracts/config-files.md#5-validate-config)).
4. Once the early patch is applied ([§0.10](#010-the-enforcement-patch)), so that no agent session can read the SSO cache, configure the runtime identity's profile once, then log in:

   ```bash
   HOME="$HOME/.config/h4reet-ai/aws-home" aws configure sso --profile h4reet-bedrock   # region us-east-1; the runtime user's portal
   make aws-login
   stat -c %a ~/.config/h4reet-ai/aws-home/.aws    # 700
   ```
5. Before the first fallback call, complete Bedrock's one-time AWS Marketplace subscription for the model, as yourself: in the console, us-east-1, Bedrock → Model catalog → the model → open it in the Playground and send one short message. Bedrock subscribes the account on a model's first use, and that needs `aws-marketplace:ViewSubscriptions` and `aws-marketplace:Subscribe`, which your own identity has and the runtime role rightly doesn't. Until then the runtime role's calls fail with `AccessDeniedException` ("Model access is denied due to IAM user or service role is not authorized to perform the required AWS Marketplace actions…"), which the gateway classes `auth`, so hello answers `fallback_unavailable`. It can take a few minutes to take effect after the Playground call (the Author's run, 2026-10-12). The Playground's message is a Bedrock call billed to the account outside the gateway's meter, a fraction of a cent. Don't add the Marketplace actions to the runtime role's permission set (tasks.md T105 records what it holds).

**Record:** the inference profile ID and the price version's `id`. Not the account ID, the portal URL, or anything from the SSO cache.

### 0.7 The Telegram bot and the alerts mailbox

Only after the early patch is applied ([§0.10](#010-the-enforcement-patch)), and after `make init-env` (§0.8): the bot token is a secret from its first moment, and it goes straight into the env file.

- **Telegram:** create the bot with @BotFather, send it one message, and paste the token into `TELEGRAM_BOT_TOKEN` in the env file, in an editor. Then read your chat ID. The `getUpdates` URL holds the token, so keep it out of the browser, argv, and shell history. In this command the token goes from the file through bash builtins into curl's configuration on standard input:

  ```bash
  { IFS= read -r t; printf 'url = "https://api.telegram.org/bot%s/getUpdates"\n' "$t"; } \
    < <(sed -n 's/^TELEGRAM_BOT_TOKEN=//p' ~/.config/h4reet-ai/env/prod.env) | curl -sS -K - | jq '.result[-1].message.chat.id'
  ```
- **Email:** a free mailbox used only to send alerts (ADR 0005), with an app password, its SMTP host, and port 465 (implicit TLS) or 587 (STARTTLS).

### 0.8 The env files and the operator tokens

Only after the early patch is applied ([§0.10](#010-the-enforcement-patch)): until then an agent session could read `~/.config/h4reet-ai` (Principle IV).

```bash
make init-env ENV=prod           # writes ~/.config/h4reet-ai/env/prod.env, 0600; prints the keys left to fill
make init-env ENV=dev
make operator-token ENV=prod     # writes ~/.config/h4reet-ai/operator/prod.token, prints its SHA-256
make operator-token ENV=dev
```

1. In an editor in your own terminal, fill each `__ASK__` key, and set each `OPERATOR_TOKEN_SHA256` to the printed hash. dev's channel keys can wait until the recorded run ([§2.2](#22-the-recorded-run-with-real-delivery-sc-002)).
2. Check the modes: `stat -c '%a %n' ~/.config/h4reet-ai/env ~/.config/h4reet-ai/env/*.env` gives 700 and 600.
3. When a template later gains keys: `make init-env ENV=<stack> SYNC=1` ([env-files.md §9](contracts/env-files.md#9-make-init-env)).

### 0.9 The first pull and the seed

Heavy: about 19 GB of models and 10 GB of images.

```bash
make pull MODELS=all     # every profile's images, Docker Hub one at a time with backoff; then both models
deploy/agents-engine/engine.sh seed         # every image dev-cpu needs, by digest, and the stand-in model (agents-engine.md §6.2)
```

Both run the disk check before they write. **Record:** the durations; any Docker Hub 429, named by `make pull`; `docker system df`; and the seed's table.

### 0.10 The enforcement patch

There are four patches. The Author reviews each, applies it with `git apply`, and then runs `claude doctor` and `make git-hooks` (plan [§15](plan.md#15-the-enforcement-layer-patch)). Each lands before the risk it guards:

- **The config patch** comes with the foundations branch (tasks.md T022): `config/budgets.yaml` and `config/alerts.yaml`.
- **The early patch** comes with the foundations branch too (T045). It holds:
  - the engine opening: the sandbox's one allowlist entry for the engine, `DOCKER_CONFIG`, the ops role's relay grant (`docker-relay docker *`), and the bash-gate rule that keeps agents off `engine.sh`'s Author subcommands;
  - every credential deny: `~/.config/h4reet-ai`, the other credential stores, and every FR-007 variable;
  - the files prod reads and the code you run: the three config files, `GNUmakefile` and `makefile`, `deploy/agents-engine`, and the gitleaks files;
  - the secret scanners: `.gitleaks.toml`, `content-scan.sh`, and the `pre-commit` hook.

  Apply it before §0.6's login, §0.7, and §0.8: no real secret may exist while an agent session could read it (Principle IV). Every agent-session run on the engine needs it too.
- **The governance patch** comes with the US3 branch (T098): `tools/gates` and `evals/agent-config` become human-only when you first run the gate.
- **The closing patch** comes with the last branch (T117). It holds the remaining denies and hooks. Until it lands, the matrix reports the rows that need it as planned, and `make check` reports the items that need it as PLANNED. Stage S needs both patches; the canary needs the early one.

## 1. User Story 1: the whole production stack runs locally

### 1.1 First start, and the one-time initialization (US1-1, FR-031)

**Prerequisites:** §0.1 to §0.5, and §0.7 to §0.9. Bedrock (§0.6) comes with US5; prod starts without it. **Where:** the Author's terminal. Heavy.

```bash
make up ENV=prod
make operator-init ENV=prod REASON="First start on this host; no earlier records." CONFIRM_ZERO=1 RENEW=1
make operator-status ENV=prod
```

**Expected:**
- `make up` prints the commit it runs, runs preflight, fetches what is missing, builds the images from that commit (the gateway's once per commit, as `h4reet-gateway:<commit>`, plan §4), waits for every health check, and exits 0 with a WARN: the store is uninitialized, and it prints the `make operator-init` command. It never initializes anything itself (plan §4).
- Until the init, hello answers 503 `store_uninitialized` ([gateway-http.md §3](contracts/gateway-http.md#3-degraded-causes)).
- After it, `operator-status` shows `state normal`, every meter at 0.00, and fallback not awaiting renewal ([operator-admin.md §6](contracts/operator-admin.md#6-the-operator-cli-scriptsoperatorpy)).

**Record:** the exit codes, `operator-status`'s summary, and the audit row's ID.

### 1.2 A cold start, timed (US1-1, SC-001)

SC-001 counts from a cold start, including the model download, on a host whose store is already initialized. **Where:** the Author's terminal. Heavy.

1. Make it cold, keeping the store's volume: `make down ENV=prod`; remove the prod stack's images (`docker image rm` for each `deploy/images.lock` entry of the `gpu` profile, and the gateway's built image); delete the prod model from `H4_MODEL_DIR`. The disk check counts the download again.
2. Time it, through the first answer:

   ```bash
   start=$(date +%s)
   make up ENV=prod
   curl -sS -X POST http://127.0.0.1:18000/hello -H 'Content-Type: application/json' -d '{"message":"Say hello."}'
   echo "elapsed $(( $(date +%s) - start )) s"
   ```

3. Within 60 s of the answer, its `trace_id` opens a complete trace in Langfuse (§1.4).

**Expected:** the answer's `route` is `local`, and the elapsed time is at most 600 s. The estimate is about 3.2 minutes for the model at 786 Mbps plus about 2 minutes of startup (research.md R-03).

**Record:** the elapsed time, the phases (images, model, health), and the exit code.

### 1.3 Hello answers locally (US1-2, US5-1)

```bash
curl -sS -X POST http://127.0.0.1:18000/hello -H 'Content-Type: application/json' -d '{"message":"Say hello."}'
```

**Expected:** 200, with `route: "local"`, `provider: "local"`, `model` equal to the stack's `MODEL_ALIAS`, `cost_micro_usd: 0`, and a 32-hex `trace_id` ([gateway-http.md §2.5.1](contracts/gateway-http.md#251-200-answered)).

### 1.4 The trace in Langfuse (US1-2, FR-027)

Open `http://localhost:18001/project/h4reet-prod/traces/<trace_id>`. Log in as `operator@h4reet.local`, with the `LANGFUSE_INIT_USER_PASSWORD` you read from the env file in your editor. No UI setup came first: initialization was headless ([env-files.md §5](contracts/env-files.md#5-langfuse-4540s-keys)).

**Expected:**
- the root `POST /hello`, the span `gateway.route`, and one generation, `chat <alias>`, with the model, input and output tokens, latency, and a cost of 0 ([telemetry.md §3](contracts/telemetry.md#3-traces));
- no input or output payload, since prod never samples;
- the environment `prod`.

**Record:** the trace ID and the observation names.

### 1.5 The Grafana panel (US1, FR-028)

Open `http://localhost:18002/d/h4-runtime` and log in as `admin` with `GF_SECURITY_ADMIN_PASSWORD`. **Expected,** within about 25 s of the call ([telemetry.md §6.5](contracts/telemetry.md#65-the-freshness-budget)):
- the request count shows the call, with route `local`;
- latency and the error rate show it too;
- model-server health is 1;
- telemetry health shows the collector's exports succeeding.

The spend, kill-switch, and degraded-cause panels arrive with US2 (tasks.md T081), and §2 checks them.

The panels and their queries are in [telemetry.md §7](contracts/telemetry.md#7-the-dashboard-h4-runtime).

### 1.6 The first stack task's measurements (R-03, R-06, R-09)

Check 2 stopped before these ([research.md](research.md)). **Where:** the Author's terminal, as a separate step with no agents working. Heavy. Each result goes into research.md as well as the note.

1. **The prod model's VRAM** (R-03), after the first local answer:

   ```bash
   nvidia-smi --query-gpu=memory.used,memory.total --format=csv
   ```

   Expected: at most about 23.4 GiB used, the Windows desktop included; the estimate is 21.3 GiB. If the model server fails to load for lack of memory (`make logs ENV=prod SERVICE=model-server-gpu`), set `MODEL_CTX_SIZE=16384` and `MODEL_PARALLEL=2` in prod's env file, run `make up ENV=prod` again, and record it (plan §3).
2. **An internal-only network blocks egress** (R-06):

   ```bash
   docker run --rm --network h4reet-prod_internal --entrypoint curl \
     ghcr.io/ggml-org/llama.cpp:server-b11459@sha256:33868c035b21dc63f7c60b7438774283fd99215bc319114eb03de5df4ce7cd6b \
     -sS -m 5 -o /dev/null -w '%{http_code}\n' https://example.com
   ```

   Expected: it fails, with no HTTP code.
3. **A container on an internal-only network can't publish a port** (R-06):

   ```bash
   docker run -d --name h4-pubtest --network h4reet-prod_internal -p 127.0.0.1:18992:9090 \
     quay.io/prometheus/prometheus:v3.15.0@sha256:efd719c99d83b060d9daefdcf00360461adf279f45ef5391f8d111892118753e
   sleep 5; curl -sS -m 3 -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18992/-/ready; docker rm -f h4-pubtest
   ```

   Expected: unreachable, which is why `edge` alone joins a second network. If it answers, record that; the design holds either way.
4. **The SeaweedFS tag** (R-09): `make pin-images` lists the repository's tags and pins the newest release. If there is no maintained release tag, the Author chooses between Chainguard's MinIO and building SeaweedFS from source (ADR 0022).
5. **The telemetry facts** in [telemetry.md §8](contracts/telemetry.md#8-what-holds-this-contract): the `llamacpp:` metric names, which cost attribute Langfuse reads, whether it accepts gzip, and the Prometheus names of Claude Code's metrics.

### 1.7 Prod and dev isolated on one host (US1-4, FR-020)

**Prerequisites:** prod up (§1.1). **Where:** the Author's terminal. Heavy.

```bash
make up ENV=dev
nvidia-smi --query-gpu=memory.used,memory.total --format=csv   # both models loaded, if they fit
make isolation-check
```

**Expected:**
- `isolation-check` passes every assertion: from a throwaway container on dev's networks, prod's service names don't resolve, prod's container IPs refuse, and prod's ports refuse through the host gateway (plan §4).
- `docker volume ls --filter label=com.docker.compose.project=h4reet-dev` and the same for `h4reet-prod` list separate volumes.
- The two models together are near the GPU's limit (about 21.3 + 1.5 GiB of about 23.4). If dev's model server can't load, isolation still holds; record the VRAM figures.

### 1.8 Only the intended ports, from another machine (US1-3)

1. On WSL: `ss -ltnH | awk '{print $4}' | grep -E ':18[0-3][0-9]{2}$'` lists only `127.0.0.1:` addresses.
2. In PowerShell, `ipconfig` gives the host's LAN address. From another machine on the network: `nmap -Pn -p 18000-18399 <that address>`.

**Expected:** no open port. **Record:** nmap's summary line and the `ss` list.

### 1.9 One compose definition; only configuration differs (US1-5, FR-017)

With prod and dev up at one commit (`make up ENV=prod`, then `make up ENV=dev`, from the same `HEAD`):

- `make policy` passes for all three env files ([plan §11](plan.md#11-local-gates-fr-041)).
- Each service both stacks run has the same image ID in both, the gateway's included: `docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}} {{.Image}}' $(docker ps -q --filter label=com.docker.compose.project=h4reet-prod) | sort`, and the same for dev. The lists match line for line, but for dev's stand-ins, which only dev's profile runs.
- The gateway's, on its own: `p=$(docker inspect --format '{{.Image}}' h4reet-prod-gateway-1) && d=$(docker inspect --format '{{.Image}}' h4reet-dev-gateway-1) && [ -n "$p" ] && [ "$p" = "$d" ] && echo same` prints `same`. A stack whose gateway isn't there fails its inspect, and nothing is printed. Both containers name one image, `h4reet-gateway:<the commit>` (`docker inspect --format '{{.Config.Image}}' h4reet-prod-gateway-1 h4reet-dev-gateway-1`), and dev's `make up` printed `gateway image: h4reet-gateway:<the commit>, reused`: `make up` builds it once per commit, outside compose, and every stack at that commit runs that one build (plan §4; tasks.md T184).
- So nothing was built for an environment. Only the model server's variant (the profile) and the env file differ.

### 1.10 The browser's own requests (FR-040)

Open Grafana and Langfuse with the browser's developer tools on the Network tab. List every request to a host other than `localhost`, and add each one to `docs/data-flow-disclosure.md` (plan [§17](plan.md#17-data-flows-that-leave-the-local-tier-fr-040)). **Record:** the hosts, or "none".

### 1.11 `make down` keeps state (US1, FR-031)

```bash
make operator-status ENV=prod
make down ENV=prod
docker volume ls --filter label=com.docker.compose.project=h4reet-prod    # the volumes are still there
make up ENV=prod
make operator-status ENV=prod
```

**Expected:** the second status equals the first: state, meters, and the renewal flag.

### 1.12 Rollback, rehearsed on dev (FR-018; the constitution's Development Workflow step 6)

**Where:** the Author's terminal, dev, on a dev stack last started at `HEAD~1` or an older commit. Heavy: three stack restarts.

```bash
make up ENV=dev REF=HEAD~1       # the older commit: call it A
make operator-status ENV=dev
make up ENV=dev                  # the newer one, B (HEAD); make status shows the previous as A
make up ENV=dev REF=<A>          # the rollback: one command
make status ENV=dev              # running A again, with B as the previous
make operator-status ENV=dev
curl -sS -X POST http://127.0.0.1:18100/hello -H 'Content-Type: application/json' -d '{"message":"Say hello."}'
```

**Expected:** each `make up` exits 0; `make status` names the running commit and the one before it; the rollback builds no gateway: when A has `deploy/scripts/gateway_image.py`, its `make up` prints `gateway image: h4reet-gateway:<A>, reused`; hello answers after the rollback; and the two `operator-status` summaries match, because the store and the journal stay as they are. If B added a migration that A lacks, B's start applied it, and the rollback refuses with exit 78 `schema_newer_than_code`, naming the migration. That is the designed failure: record it, and roll forward instead (`make up ENV=dev`). The runbook is `docs/runbooks/rollback.md`.

**Record:** the three commits, the exit codes, and the two status summaries.

## 2. User Story 2: the kill switch fires before anyone can run up a bill

The breach test's steps, their order, and their figures are plan [§8](plan.md#8-the-breach-test). The test starts on the 20th of a month at 08:00 UTC on the dev clock, and advances a day before its fallback steps, so no ceiling trips before the step that tests it. Its first step wipes the dev stack's store. It asserts every step from a trace, a metric, or a log, and ends with a table of every assertion.

### 2.1 On the agents' engine, by an agent (US2, FR-036, FR-039)

**Prerequisites:** the early patch applied (§0.10); the engine up and seeded (§0.5, §0.9). **Where:** an agent session.

```bash
make up ENV=dev-cpu
make breach-test ENV=dev-cpu
make down ENV=dev-cpu
```

**Expected:** every assertion passes, and the run exits 0. Alerts go to the stand-ins inside the engine, and resets and renewals use the committed dummy token ([alerts.md §4.3](contracts/alerts.md#43-prefixes-and-receivers), [operator-admin.md §6](contracts/operator-admin.md#6-the-operator-cli-scriptsoperatorpy)). Each M assertion waits at most 60 s and each delivery at most 300 s, so the run takes several minutes.

**Record:** the assertion table (step, assertion, source, result), the duration, and the branch's commit.

### 2.2 The recorded run, with real delivery (SC-002)

**Prerequisites:** dev's channel keys filled (§0.7, §0.8); the phone at hand. **Where:** the Author's terminal, dev on the 5090. Heavy.

1. First, a run on the stand-ins: `make breach-test ENV=dev`. Expected: the table passes, as on dev-cpu.
2. Then the recorded run:

   ```bash
   asciinema rec docs/recordings/<date>-breach-test.cast --command 'make breach-test ENV=dev DELIVERY=real'
   ```

   It adds the one-line overlay `ALERT_DELIVERY=real` to dev's gateway for the run, and puts the stand-ins back at the end ([env-files.md §7.2](contracts/env-files.md#72-the-delivery-overlay)). The alerts carry `[dev]` and go to the same chat and mailbox as prod's. Film the phone as the warning and the trip arrive.
3. Before committing the recording: `test ! -e docs/recordings/.gitleaksignore && gitleaks dir docs/recordings --redact --no-banner --config .gitleaks.toml --gitleaks-ignore-path "$(mktemp -d)" --ignore-gitleaks-allow` finds nothing. The flags keep a planted `.gitleaks.toml` and inline `gitleaks:allow` markers from switching rules off. The test refuses a planted `.gitleaksignore`, which gitleaks reads from the scanned directory whatever its flags say (research.md R-36). and the cast shows no token, chat ID, or address (the run prints only dedupe keys and message IDs). Make the GIF from the cast. What gets committed is the cast and the GIF (plan [§16](plan.md#16-documentation-deliverables)); the camera recording is the Author's to keep or publish.

**Expected, and SC-002's two figures,** from the run's L records ([telemetry.md §5.2](contracts/telemetry.md#52-events)):
- `degraded` is active within 60 s of the ceiling: the `killswitch.tripped` record's time against the crossing call's. They commit in one transaction, so the gap is about 0 s.
- The Telegram alert arrives within 5 minutes, with no human action: the trip's `alert.delivered` record on channel `telegram`, with its `lag_s` and `message_id`, and the message on the phone.
- The email's `alert.delivered` record carries SMTP's 250 reply.

**Record:** both figures, the Telegram `message_id`, the SMTP reply code, and the cast's path. README's non-engineer path links the recording (plan §16).

## 3. User Story 3: agents can't do what the policy forbids

The matrix and its stages are plan [§13](plan.md#13-the-forbidden-action-matrix). SC-003 needs zero failures and zero planned rows, with an audit record for every block.

### 3.1 Stage H, the hook layer (US3-2 to US3-7)

**Where:** anywhere: an agent session or the Author's terminal.

```bash
make matrix
```

**Expected:** a report of `passed / failed / known gaps / planned / skipped (why)`, with 0 failed. Before each patch (§0.10), the rows that need it show as planned. After the closing patch, 0 planned. A row ID listed in `tools/gates/matrix-required.txt` that is missing fails the run.

### 3.2 Stage S, inside the sandbox (US3-1, FR-007)

**Where:** an agent session, after the early patch; the rows that need the closing patch show as planned until it lands. The same `make matrix` runs stage S when `SANDBOX_RUNTIME=1` is set and `.git/hooks` isn't writable. Give the session the alert channel's SMTP host, deploy/env's `SMTP_HOST`, which the sandbox can't read: it runs `H4_STAGE_S_SMTP_HOST=<host> make matrix`, adding `H4_STAGE_S_SMTP_PORT=<port>` if the port is neither 465 nor 587. Without it, the SMTP row is SKIP. **Expected:** every unwritable, unreadable, and refused-connection row passes. The FR-007 files are proved through the folders that hold them, `deploy/env` and `~/.config/h4reet-ai`, each unreadable and unwritable ([env-files.md §8](contracts/env-files.md#8-the-fr-007-deny-list)). The refused connections are hosts off the allowlist, the SMTP host, the egress proxy `198.18.0.1:3128`, and every stack's five ports on loopback, beside a loopback listener the row opens itself as the control. The allowed engine path, `198.18.0.1:2376` with the agents' certificate, is stage E's (E9, E14) and `make engine-smoke`'s, since it needs the proxy and the engine. An unwritable row passes on the sandbox's mount at that very path, not on a file that merely can't be written, and Windows interop is refused.

### 3.3 Stage E, the engine's limits from the host (US3-9, FR-039)

**Where:** the Author's terminal, with no agent session using the engine. Heavy: row E10 resets and reseeds the engine (about 10 GB), and row E14 needs dev-cpu up.

```bash
deploy/agents-engine/engine.sh prove
```

**Expected:** rows E1 to E16 pass ([agents-engine.md §7](contracts/agents-engine.md#7-the-fr-039-limits-and-their-proofs)), with excerpts from the admission plugin's log, the egress proxy's log, and the firewall's drop counter. Row E14 carries an open question about its mechanism; record what it finds. `prove` also writes its report to `~/.local/state/h4reet/agents-engine/prove-report.txt`, headed `H4-PROVE-REPORT commit=… engine-tree=… utc=…`. `make matrix` (§3.1, §3.2) folds rows E1 to E16 from it while `git rev-parse HEAD:deploy/agents-engine` matches the header's tree, and shows stage E as SKIP, with the reason, for a report with no header, from a tree with uncommitted changes, or from another engine tree. The header comes with the engine change review B asked for, the Author's to apply; until then stage E stays SKIP.

### 3.4 The engine's positive half (US3-9)

**Where:** an agent session, after the early patch.

```bash
make engine-smoke     # make up ENV=dev-cpu, make breach-test ENV=dev-cpu, make down ENV=dev-cpu
```

**Expected:** the stack comes up healthy on the agents' engine, the breach test passes (§2.1), and the stack stops.

### 3.5 The canary (FR-007)

**Where:** the Author's terminal.

```bash
make matrix-canary
```

**Expected:** it starts `claude -p --setting-sources project` with a fake value for every FR-007 variable, and none of them appears in the session's environment or transcript.

**Record for §3:** the matrix report's summary lines, stage E's table, the canary's result, and an excerpt of `.claude/audit/hooks.log` showing the block decisions (SC-003's three audit sources, plan §13).

## 4. User Story 5: local-first, with a capped cloud fallback, fully traced

### 4.1 A local answer (US5-1)

§1.3 and §1.4. In Langfuse, the generation carries the provider `local`, the model, the tokens, the latency, and a cost of 0, under the GenAI conventions ([telemetry.md §3.3](contracts/telemetry.md#33-span-attributes)).

### 4.2 Bedrock answers within 5 s when the model server stops (US5-2, SC-005)

**Prerequisites:** prod up; `make aws-login` within the SSO session's life; `make operator-status ENV=prod` shows Bedrock healthy and fallback not awaiting renewal. **Where:** the Author's terminal, prod, because production is the only stack that spends (FR-031). Heavy: the prod model reloads afterwards.

```bash
docker stop h4reet-prod-model-server-gpu-1
curl -sS -w '\n%{http_code} %{time_total}\n' -X POST http://127.0.0.1:18000/hello \
  -H 'Content-Type: application/json' -d '{"message":"Say hello."}'
sleep 3
curl -sS -w '\n%{http_code} %{time_total}\n' -X POST http://127.0.0.1:18000/hello \
  -H 'Content-Type: application/json' -d '{"message":"Say hello."}'
docker start h4reet-prod-model-server-gpu-1
```

**Expected:**
- Both answers are 200, with `route: "fallback"`, `provider: "aws.bedrock"`, and a `time_total` under 5 s. The first has `route_reason: "local_failed"` (the call itself failed over) when it lands before the model server's 1 s health check notices, and `local_unhealthy` when it lands after, as it did in the Author's run on 2026-10-12, since `docker stop` takes a few seconds; the second `local_unhealthy` (the health check had noticed). Either reason passes.
- In Langfuse, the first trace has two client spans: the failed local attempt, with `error.type`, then Bedrock's, with its cost.
- Within 60 s, the dashboard's "Fallback sub-budget remaining" drops by the calls' cost, and "Cost by provider and attribution" shows `aws.bedrock` with `fallback` (SC-005).
- After the start, once the model loads and passes three checks in a row, hello is local again.

**Cost:** a few calls, well under $0.01, inside the sub-budget (plan [§18](plan.md#18-cost-impact)). **Record:** both `time_total` values, the route reasons, the trace IDs, the cost in micro-USD, and fallback remaining before and after.

### 4.3 The sub-budget: exhaustion, renewal, restarts (US5-3, US5-6, US5-7)

Dev's synthetic spend proves these in the breach test's fallback steps (plan [§8](plan.md#8-the-breach-test), the rows tagged US5-6 and US5-7). Their rules are FR-030's and ADR 0001's ([data-model.md §6.2](data-model.md#62-the-fallback-sub-budget-fallback_awaiting_renewal-and-todays-fallback_day-row)):
- When committed fallback spend reaches today's allowance, fallback is refused with `fallback_awaiting_renewal`, and the exhaustion alert goes out.
- A restart keeps today's fallback spend; only the remainder can still be spent (US5-7).
- A renewal on the same day makes exactly $2 more available at once (US5-6).
- The flag survives a day's rollover and a restart. A renewal on a later day, with nothing spent yet that day, makes $2 available, not $4.
- While local is down and fallback is refused, the "Why responses are degraded" panel names the cause: `fallback_awaiting_renewal`, or `meter_at_ceiling` after a reset (US5-3).

To watch it by hand, run `make breach-test ENV=dev` in the Author's terminal, with `make operator-status ENV=dev` and the dashboard open beside it. The clock and the synthetic spend are the breach test's only; the CLI has no commands for them.

**Record:** the US5 rows of the assertion table.

### 4.4 Another adapter, the same shape (US5-4, SC-006)

§6.1.

### 4.5 No secrets and no payloads in telemetry (US5-5, FR-029)

**Where:** the Author's terminal.

1. **Prod, sampling off:** after §4.2, Grafana's Explore on Loki: `{service_name="gateway"} |= "Say hello"` returns nothing, because the message is never logged. The prod traces show no input or output.
2. **Dev, sampling on:**
   - set `TELEMETRY_PAYLOAD_SAMPLING=on` in dev's env file, and run `make up ENV=dev`, which recreates the gateway and the collector;
   - call dev's hello on port 18100 with a message that embeds a string shaped like an operator token, built at run time, for example from `printf 'h4op_dev_%s' "$(head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=')"`, which is always 43 characters after the prefix;
   - expected: dev's trace shows the input and output messages, with that string masked as `****` ([telemetry.md §3.4](contracts/telemetry.md#34-the-payload-rule), [§6.3](contracts/telemetry.md#63-processors));
   - set it back to `off`, and `make up ENV=dev` again.
3. **Prod refuses sampling:** preflight's P8 and the gateway's exit 78 are proved by the integration tests and the matrix rows (plan §5.8), never on the live prod stack.

**Record:** the query results as counts, never their contents.

## 5. User Story 6: the repository explains itself

### 5.1 The README's links (US6-1)

```bash
for t in .specify/memory/constitution.md intent/ specs/ docs/adr/ docs/how-we-build/ SECURITY.md LICENSE; do
  if grep -q "]($t" README.md && test -e "$t"; then echo "ok $t"; else echo "MISSING $t"; fi
done
```

**Expected:** `ok` on every line. After §2.2, the non-engineer path also links the recording in `docs/recordings/`.

### 5.2 Every ADR within two clicks (US6-2, SC-009)

The README links `docs/adr/`, whose index links each ADR file:

```bash
grep -q '](docs/adr/)' README.md && echo "ok README links the index"
for f in docs/adr/0*.md; do
  b=$(basename "$f"); if grep -q "]($b)" docs/adr/README.md; then echo "ok $b"; else echo "MISSING $b"; fi
done
```

**Expected:** `ok` on every line, including ADRs 0001 to 0005 for the five decisions User Story 6 names: local-first routing, one compose topology, Langfuse and Grafana, Telegram alerting, and local-compose-first delivery.

## 6. The other criteria

### 6.1 Both adapters pass one contract suite (SC-006, FR-024, US5-4)

1. **Stub mode,** in an agent session or in the gate's container phase. The Author never runs `make test` in their own terminal (plan §11):

   ```bash
   make test
   ```

   Expected: `describeAdapterContract` passes for `local-openai`, `bedrock-converse`, and `synthetic`, against the in-process stub server and `aws-sdk-client-mock` ([provider-adapter.md §5.3](contracts/provider-adapter.md#53-three-run-modes)). Its check C8 shows the two shipped adapters' spans have the same attribute keys ([telemetry.md §3.3](contracts/telemetry.md#33-span-attributes)). Switching adapters is a change to `config/routing.yaml`, never to source.
2. **Live,** the Author's terminal:

   ```bash
   make contract-live ENV=prod ADAPTER=local   REASON="Live contract run, local adapter."
   make operator-status ENV=prod
   make contract-live ENV=prod ADAPTER=bedrock REASON="Live contract run, Bedrock adapter."
   make operator-status ENV=prod
   ```

   Each run records first: `scripts/operator.py contract-record` reads `/admin/status`, sends each committed case to `POST /admin/adapters/{id}/complete` with the operator token, and writes the recording into a 0700 temporary directory. Then the vitest suite replays the recording in the devcontainer image with `--network none`, so the suite and the dependencies it loads never run with the token in the Author's terminal; `scripts/operator.py` and the Makefile, both reviewed, do (plan [§7](plan.md#7-tests-unit-contract-integration-live), ADR 0017). The temporary directory is deleted.

   Expected:
   - both runs pass every live assertion;
   - the local run is free, attributed `none`;
   - the Bedrock run, about 10 calls under $0.05, is charged to prod's day and month meters as `test`, not to the sub-budget (FR-031): the two statuses differ by its cost, and the dashboard's cost table shows `test`.

   **Record:** the pass counts, the Bedrock run's cost in micro-USD, and prod's meters before and after.

### 6.2 A newcomer's devcontainer in under 30 minutes (SC-007, FR-005)

**Where:** the Author's terminal, with an empty build cache. Heavy: `docker builder prune -af` empties the whole build cache, and the build downloads about 1.5 GB. No Claude login, engine, GPU, or denylist is needed (plan §9).

```bash
docker builder prune -af
git clone ~/h4reet-ai/h4reet-ai <a new directory> && cd <that directory>
time npx @devcontainers/cli@0.89.0 up --workspace-folder .          # builds the image; postCreateCommand runs make setup
time npx @devcontainers/cli@0.89.0 exec --workspace-folder . make test
```

**Expected:** the two times add up to under 30 minutes. The estimate is about 8 for the build, 3 for `make setup`, and 1 for `make test` (ADR 0017). **Record:** each duration, and that the cache was empty.

### 6.3 The local gate (FR-041, SC-008)

1. **`make check`,** in an agent session. The Author doesn't run it: in the Author's terminal the gate is step 3 (plan §11). Expected: one line per gate, PASS, FAIL, SKIP (with its reason), PENDING, or PLANNED (naming the patch's task), then a summary. It exits non-zero on any FAIL or PENDING; a PLANNED line doesn't fail it (plan [§11](plan.md#11-local-gates-fr-041)). The whole output goes into every merge-request note.
2. **When the agent-config evals show PENDING** (a branch changed CLAUDE.md, REVIEW.md, `.claude/**`, `evals/agent-config/**`, or the Claude Code pin): from main's checkout, on main with its tracked files clean and nothing untracked or ignored in `evals/agent-config/` but earlier entries and Python's `__pycache__/*.pyc` (untracked files elsewhere, like `.idea/`, don't matter), the Author runs

   ```bash
   make evals-agent-config REF=<branch>
   ```

   It runs main's `behavioral.py`, never the branch's: it clones the branch and reads its cases and thresholds as data. Each session runs the branch's `.claude/` hooks unsandboxed, so before any starts it prints the branch's diff against main under `.claude/`, CLAUDE.md, REVIEW.md, and every other human-only path (plan §15), and waits for the Author to type `yes`. It writes the entry, untracked, into main's checkout's `evals/agent-config/history/`, and attests its exact bytes in `~/.local/state/h4reet/evals/attested/`, where agents can't write; only an attested entry counts. The Author commits the entry on the branch as written (SC-008) by pasting the commands the run prints after it, and never by switching main's checkout to the branch, where the gate and the hooks would then run the branch's code as the Author (review D1, 1). From main's repository, and checking the branch out nowhere, they build the commit with git's plumbing in a temporary index from the branch's tip, with the entry's exact bytes; move the branch with `git update-ref` only if its tip is still the one they read; and remove the copy from main's checkout, which a merge of the branch would refuse to overwrite. They work while an agent's worktree holds the branch, which `git worktree add` refuses: that worktree's index then lags its HEAD, and the note after the commands gives the `git restore` that brings the entry in before its next commit. Then the Author runs the gate again. Since main's tier is what runs, the first run follows the merge that brings it: T099 runs against a branch holding the tree main will have, with US5's patch and the governance patch applied, commits the entry there, and merges that branch, so main's trigger hash is the run's (plan §14).
3. **The Author's gate,** run directly and not through make, because a planted `GNUmakefile` would shadow the Makefile:

   ```bash
   tools/gates/gate <branch>
   ```

   Run it from main's checkout. It refuses (exit 2), and runs nothing, unless HEAD is `main` itself, the tracked files are clean with no change hidden by assume-unchanged or skip-worktree, and nothing git doesn't track, ignored or not, sits in `tools/gates/`, `corpus/tools/`, `evals/agent-config/` (its `history/` aside), or `deploy/agents-engine/`, Python's `__pycache__/*.pyc` aside; untracked files elsewhere don't matter (plan §11). Expected: its container phase, run on an exported tree with `--network none`, and its host phase both pass. Its summary line goes into the merge commit's message, and the merge command it prints runs where the gate ran.

### 6.4 The history scan before publication (FR-042)

**Where:** the Author's terminal, in a full clone, with the denylist in place.

```bash
make publish-check
```

**Expected:** exit 0 and a clean summary line. Exit 1 lists findings by commit, path, line, and rule, never the phrase: clean the history before the first push, which ADR 0013 allows once. Exit 3 means it can't certify: inside the sandbox, in a shallow clone, with the wrong gitleaks, or with no denylist (plan [§12](plan.md#12-make-publish-check-fr-042)). **Record:** the summary line only.

## 7. Done when

Spec 000 is done when every success criterion passes on the 5090, and the matrix shows zero failures and zero planned rows (plan §21).

| Criterion | Scenario | Where |
|---|---|---|
| SC-001 | §1.1, §1.2, §1.4 | the Author's terminal |
| SC-002 | §2.2 | the Author's terminal |
| SC-003 | §3.1 to §3.5 | both |
| SC-005 | §4.2 | the Author's terminal |
| SC-006 | §6.1 | both |
| SC-007 | §6.2 | the Author's terminal |
| SC-008 | §6.3 | the Author's terminal |
| SC-009 | §5.2 | anywhere |
| US1 to US3, US5, US6 | §1 to §5 | as each section says |
| FR-040, FR-041, FR-042 | §1.10, §6.3, §6.4 | the Author's terminal |

SC-004 and User Story 4 moved to the publication spec (ADR 0014), so nothing here runs them.
