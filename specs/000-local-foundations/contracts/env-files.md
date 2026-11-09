# Contract: the environment files

Spec 000 (FR-007, FR-013, FR-017, FR-018, FR-020, FR-029, FR-031, FR-032, FR-036, FR-039, FR-040) · Plan: [§4](../plan.md#4-environment-files-preflight-and-the-stack-targets), [§5.8](../plan.md#58-startup-refusals), [§15](../plan.md#15-the-enforcement-layer-patch) · Research: [R-05](../research.md#r-05-one-compose-file-environments-differ-only-by-their-env-file-adr-0002), [R-30](../research.md#r-30-payload-sampling-is-dev-only-the-author), [R-31](../research.md#r-31-the-host-stacks-real-env-files-live-outside-the-repository), [R-32](../research.md#r-32-host-disk-space-is-the-windows-drives)

Every key in the env files, who consumes it, and how it is checked; the dev-only switches; the FR-007 deny list; `make init-env`; and every check `make up`'s preflight runs. Environments differ only by their env file (FR-017), so this file is the whole of what makes prod, dev, and dev-cpu different.

Related: the gateway's startup refusals and their reason codes are in [config-files.md](config-files.md) (§1.4, §2.5, §4.4) and [plan.md §5.8](../plan.md#58-startup-refusals); the credential is in [data-model.md §5](../data-model.md#5-the-operator-credential); the engine's paths are in [agents-engine.md](agents-engine.md).

## 1. The files

| File | Stack | Committed | Mode | Holds |
|---|---|---|---|---|
| `deploy/env.example/prod.env.example` | prod (template) | yes | 0644 | every prod key: fixed values filled, `__GENERATE__` for generated secrets, `__ASK__` for values only the Author has, `__REPO__` and `__HOME__` in machine paths |
| `deploy/env.example/dev.env.example` | dev (template) | yes | 0644 | the same for dev |
| `~/.config/h4reet-ai/env/prod.env` | prod | never; outside the repository | 0600, in a 0700 directory | the real values, written by `make init-env ENV=prod` and completed by the Author |
| `~/.config/h4reet-ai/env/dev.env` | dev | never; outside the repository | 0600, in a 0700 directory | the same for dev |
| `deploy/env.agents/dev-cpu.vars` | dev-cpu | yes, agent-editable | 0644 | dummy values only, including the public dummy operator token. The name avoids the `*.env` rules, and gitleaks allowlists this one path (plan §11). |
| `deploy/env/` | none | the directory exists and stays empty | – | a tripwire: denied to agents for reading and writing. Preflight refuses to start while any env file sits there or anywhere else in the working tree (R-31). |

`ENVFILE` in the Makefile is `deploy/env.agents/dev-cpu.vars` for `ENV=dev-cpu` and `$(HOME)/.config/h4reet-ai/env/$(ENV).env` otherwise. Every compose call is `docker compose -p h4reet-$(ENV) -f deploy/compose.yaml --env-file $(ENVFILE)`.

**How a value reaches a container.** Compose reads the env file for interpolation only. No service has an `env_file:` line; each service's `environment:` block names the few variables it needs, as `${KEY}` (plan §1). So a container never sees a key it doesn't consume: Langfuse never sees the gateway's SMTP password, and the gateway never sees ClickHouse's.

### 1.1 Grammar

Preflight, `init_env.py`, `validate-config`, and the CLI's dev-cpu token reader all parse the files as data with the same rules. Nothing ever `source`s them.

- One `KEY=VALUE` per line. Blank lines and lines starting with `#` are ignored. No `export`, and no spaces around `=`.
- `KEY` matches `^[A-Z][A-Z0-9_]*$` and appears once.
- `VALUE` is either:
  - unquoted, with none of these characters: whitespace, `$`, `"`, `'`, `` ` ``, `\`, `#`; or
  - single-quoted, `'…'`, with no `'` or newline inside. Compose treats single-quoted values literally, so a password holding `$` or `#` survives.
- Values are never interpolated: `${…}` inside a value is refused, because compose would expand it and preflight would not, and the two would disagree.
- Generated values are 64 lowercase hex characters or a fixed prefix and a UUID, so they never need quotes.

A violation is reported by key and line number, never with the value.

### 1.2 Sources

| Source | In the template | Who writes the real value |
|---|---|---|
| **fixed** | the value itself | the template; `init-env` copies it |
| **filled** | a path with `__REPO__` (the repository's absolute path) or `__HOME__` (the user's home), such as `__HOME__/.local/state/h4reet/prod` | `init-env`, from the machine it runs on |
| **generated** | `__GENERATE__` | `init-env`, in the key's shape ([§9.2](#92-generated-values)) |
| **asked** | `__ASK__`, or empty where the stack can run without it | the Author, by hand, in an editor in their own terminal |
| **dummy** | – | `dev-cpu.vars` only: public values that protect nothing |

`__REPO__` and `__HOME__` extend plan §4's two placeholders: a committed template can't hold a machine's absolute paths. Preflight refuses a file that still holds any of the four placeholders.

## 2. Stack keys

Compose and preflight read these; the gateway reads `H4_STACK`, `H4_ENV`, and two of the ports.

| Key | prod | dev | dev-cpu | Secret | Source | Consumed by | Validated by |
|---|---|---|---|---|---|---|---|
| `H4_STACK` | `prod` | `dev` | `dev-cpu` | no | fixed | compose, preflight, the gateway, the collector, Grafana | preflight: equals `ENV`. Gateway: one of the three, and agrees with `H4_ENV` (exit 78). |
| `H4_ENV` | `prod` | `dev` | `dev` | no | fixed | the gateway (routes, thresholds, dev-only switches), preflight | preflight: `prod` for prod, `dev` otherwise. Gateway: the same pairing (exit 78). |
| `COMPOSE_PROJECT_NAME` | `h4reet-prod` | `h4reet-dev` | `h4reet-dev-cpu` | no | fixed | compose (it also gets `-p h4reet-$(ENV)`) | preflight: equals `h4reet-<H4_STACK>` |
| `COMPOSE_PROFILES` | `gpu` | `gpu,dev-receivers` | `cpu,dev-receivers` | no | fixed | compose | preflight: exactly these values; exactly one of `gpu` and `cpu`; never `breach` (the breach test adds it per run) |
| `H4_TREE` | – | – | `/run/h4agents/tree` | no | dev-cpu only. Host stacks get it from the run file `make up` writes ([§12](#12-the-run-file-host-stacks)), never from the env file | compose: every bind under `deploy/` and `config/` | preflight: on a host stack, the key in the env file is refused, and the run file's value must be the export of the commit being started (P7); on dev-cpu, exactly `/run/h4agents/tree` ([§7.3](#73-the-worktree-question)) |
| `H4_MODEL_DIR` | `__HOME__/.local/share/h4reet/models` | the same | `/run/h4agents/models` | no | filled; fixed for dev-cpu | compose (`/models:ro`), `pull-models.sh`, preflight | preflight: absolute, not under `/mnt/`, on ext4 for host stacks; dev-cpu exactly as shown |
| `H4_STATE_DIR` | `__HOME__/.local/state/h4reet/prod` | `__HOME__/.local/state/h4reet/dev` | `/var/lib/h4agents/state/dev-cpu` | no | filled; fixed for dev-cpu | compose: the gateway's journal and incident drafts at `${H4_STATE_DIR}/gateway` ([data-model.md §1](../data-model.md#1-where-state-lives)) | preflight: absolute, ends in the stack's name; on a host stack exactly `$HOME/.local/state/h4reet/<stack>`, where make finds the run file without reading the env file (plan §4), created 0700 if missing |
| `H4_AWS_DIR` | `__HOME__/.config/h4reet-ai/aws-home/.aws` | `__REPO__/deploy/aws-none` | `/run/h4agents/tree/deploy/aws-none` | no (a path; the directory it names holds the SSO cache) | filled; fixed for dev-cpu | compose: the gateway's `/home/node/.aws:ro` | preflight: prod's exists, is mode 0700, and holds a `config` file; the others name `deploy/aws-none`, which holds only its README |
| `H4_VHDX_MOUNT` | `/mnt/c` | `/mnt/c` | `/mnt/c` | no | fixed; the Author changes it if WSL's disk moves | preflight, `pull-models.sh`, `make pull` | preflight: a mounted Windows drive (`9p` with `aname=drvfs` in `/proc/mounts`) |
| `H4_API_PORT` | `18000` | `18100` | `18300` | no | fixed | compose (edge publishes x000) | preflight: the stack's value exactly, and free ([§10](#10-make-up-preflight)) |
| `H4_LANGFUSE_PORT` | `18001` | `18101` | `18301` | no | fixed | compose (x001); Langfuse's `NEXTAUTH_URL`; Grafana's trace link; the gateway's incident-draft links ([alerts.md](alerts.md)) | the same |
| `H4_GRAFANA_PORT` | `18002` | `18102` | `18302` | no | fixed | compose (x002); Grafana's `GF_SERVER_ROOT_URL`; the gateway's incident-draft links | the same |
| `H4_ADMIN_PORT` | `18003` | `18103` | `18303` | no | fixed | compose (x003, the admin listener) | the same |
| `H4_OTLP_PORT` | `18004` | `18104` | `18304` | no | fixed | compose (x004, dev-time metrics; only prod's receives any, [telemetry.md §6.1](telemetry.md#61-receivers)) | the same |
| `H4_SITE_PORT` | `18005` | `18105` | `18305` | no | fixed | compose (x005, the room's site: spec 002, [web-serving.md §2](../../002-the-room/contracts/web-serving.md#2-the-stacks-edge)) | the same |
| `H4_BUILD_PROXY` | empty | empty | `http://198.18.0.1:3128` | no | fixed | the `HTTP_PROXY` and `HTTPS_PROXY` build arguments of the gateway's image, which `deploy/scripts/gateway_image.py` reads from the env file as data (plan §4; tasks.md T184), and, through compose, of the `telegram-standin` and `breach-probe` images; never a container's environment | preflight: empty on host stacks; exactly this value on dev-cpu ([agents-engine.md §4](agents-engine.md#4-egress-the-proxy)) |
| `H4_WEB_SUFFIX` | empty | `-drafts` | `-drafts` | no | fixed | the end of the room's web image tag, `h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}`, and the drafts flag of its build, which `deploy/scripts/web_image.py` reads from the env file as data (spec 002, [web-serving.md §1 and §4](../../002-the-room/contracts/web-serving.md#1-the-web-image)) | preflight: empty on `H4_ENV=prod`, `-drafts` on `H4_ENV=dev` |

- The ports are fixed per stack, so the stacks never overlap (FR-020), and compose binds them to the literal `127.0.0.1`, which no env file can change (plan §1). On dev-cpu, RootlessKit publishes them on the host's `127.0.0.1` as `h4agents`: host processes reach them, and the sandbox doesn't (agents-engine.md row E14).
- `H4_BUILD_PROXY` exists because the engine's builds reach npm only through the egress proxy. It is a build argument and not a container variable, because Python's urllib in the probe and the stand-in honours `HTTP_PROXY`, and would then send in-network calls to the proxy.

## 3. Model keys

| Key | prod | dev | dev-cpu | Secret | Source | Consumed by | Validated by |
|---|---|---|---|---|---|---|---|
| `MODEL_FILE` | `Qwen3-30B-A3B-Instruct-2507-Q4_K_M.gguf` | `qwen2.5-0.5b-instruct-q4_k_m.gguf` | the same as dev | no | fixed | the model server's `-m /models/${MODEL_FILE}`; `pull-models.sh` | preflight: names a `deploy/models.lock` entry whose `stacks` include `H4_STACK`; for host stacks the file exists with the lock's size, or is fetched; on dev-cpu it must exist ("ask the Author to run deploy/agents-engine/engine.sh seed") |
| `MODEL_ALIAS` | the lock entry's alias for the prod model | the stand-in's alias | the same as dev | no | fixed | `--alias`; the gateway's `LOCAL_MODEL_NAME` (`gen_ai.request.model`) | preflight: equals the lock entry's `alias` |
| `MODEL_CTX_SIZE` | `32768` | `8192` | `8192` | no | fixed | `-c` | preflight: a positive integer divisible by `MODEL_PARALLEL`. The first stack task may set prod to `16384` if the model doesn't fit (plan §3), with `MODEL_PARALLEL` `1` since 2026-11-08, so a slot still holds a spec 007 twin turn. |
| `MODEL_PARALLEL` | `2` | `2` | `2` | no | fixed | `-np` | preflight: 1 to 8. Prod's two slots of 16,384 tokens each hold a spec 007 twin turn: 32,000 characters in, plus 300 out. It was `4`: slots of 8,192 tokens, too small for a twin turn, so the model server refused every one (2026-11-08; spec 007's plan, D27). |
| `MODEL_THREADS` | `4` | `4` | `4` | no | fixed | `-t`, in the `cpu` profile only | preflight: 1 to 4 on dev-cpu (the engine's cap) |
| `LOCAL_MODEL_BASE_URL` | `http://model-server:8080/v1` | the same | the same | no | fixed | the gateway's local adapter (`base_url_env`, [config-files.md §1](config-files.md#1-configroutingyaml)) | the gateway: an `http` URL with a single-label host ([provider-adapter.md §3.1](provider-adapter.md#31-local-openai-type-openai-compatible)) |

Compose passes `MODEL_ALIAS` to the gateway as `LOCAL_MODEL_NAME`, the key `config/routing.yaml` names as `model_env`. A model change is an env-file and lock change, never a code change (FR-021, ADR 0019).

## 4. The gateway's keys

| Key | prod | dev | dev-cpu | Secret | Source | Consumed by | Validated by |
|---|---|---|---|---|---|---|---|
| `GATEWAY_DB_PASSWORD` | `__GENERATE__` | `__GENERATE__` | dummy | yes | generated | `gateway-state` (`POSTGRES_PASSWORD`), the gateway | preflight: present. A wrong value shows as `store_unreachable`, never as a refusal to start. |
| `GATEWAY_GRAFANA_RO_PASSWORD` | `__GENERATE__` | `__GENERATE__` | dummy | yes | generated | the gateway (it sets `grafana_ro`'s password at every start, [data-model.md §2.9](../data-model.md#29-the-view-v_state-and-the-role-grafana_ro)); Grafana's `gateway` datasource | preflight: present, and printable ASCII without spaces. The gateway: printable ASCII ([§11](#11-what-the-gateway-checks-for-itself)) |
| `OPERATOR_TOKEN_SHA256` | `__ASK__` | `__ASK__` | the dummy token's hash | no: a hash | asked: printed by `make operator-token ENV=<stack>` | the gateway | gateway: 64 lowercase hex, and on prod not the published dummy's hash (exit 78, [data-model.md §5](../data-model.md#5-the-operator-credential)). Preflight: the same shape, and for prod and dev the token file `~/.config/h4reet-ai/operator/<stack>.token` exists with mode 0600; preflight never reads it. |
| `H4_DEVCPU_OPERATOR_TOKEN` | – | – | `h4op_devcpu_<43 base64url characters, committed>` | no: a public dummy | dummy | `scripts/operator.py` and `evals/breach.py`, which read it from the file as data; never a container | preflight: matches `^h4op_devcpu_[A-Za-z0-9_-]{43}$`, and its SHA-256 equals `OPERATOR_TOKEN_SHA256` |
| `ALERT_DELIVERY` | `real` | `standin` | `standin` | no | fixed | the gateway | gateway: prod must be `real` (`alert_delivery_not_real`, [config-files.md §4.4](config-files.md#44-startup-refusals-exit-78-that-combine-this-file-with-the-environment)). Preflight: dev's file says `standin` (only the recorded run's overlay changes it, [§7.2](#72-the-delivery-overlay)); dev-cpu must be `standin`, because the engine has no route to Telegram or SMTP. |
| `TELEGRAM_API_BASE` | `https://api.telegram.org` | `https://api.telegram.org` | `http://telegram-standin:8080` | no | fixed | the gateway, in real mode | gateway: with `ALERT_DELIVERY=real`, exactly the Bot API (`telegram_base_not_bot_api`). In stand-in mode the gateway uses `config/alerts.yaml` `standin.*` and ignores this key. |
| `TELEGRAM_BOT_TOKEN` | `__ASK__` | empty, or the Author's value | dummy | yes | asked | the gateway, in real mode only | gateway: present in real mode (`missing_alert_env`) |
| `TELEGRAM_CHAT_ID` | `__ASK__` | empty, or the Author's value | `0` | no, but personal | asked | the same | the same |
| `SMTP_HOST` | `__ASK__` | empty, or the Author's value | `mailpit` | no | asked | the same | the same |
| `SMTP_PORT` | `__ASK__` (465 or 587) | empty, or the Author's value | `1025` | no | asked | the same | the same, and `smtp_without_tls` |
| `SMTP_TLS` | `__ASK__` (`implicit` or `starttls`) | `implicit` or `starttls` | `none` | no | asked | the same | gateway: in real mode `implicit` with port 465, or `starttls` with 587 and `requireTLS` (`smtp_without_tls`). Preflight: one of `implicit`, `starttls`, `none`, and `none` only on dev-cpu. |
| `SMTP_USER` | `__ASK__` | empty, or the Author's value | dummy | yes (FR-007's list) | asked | the same | `missing_alert_env` |
| `SMTP_PASSWORD` | `__ASK__` | empty, or the Author's value | dummy | yes | asked | the same | the same |
| `ALERT_EMAIL_FROM` | `__ASK__` | empty, or the Author's value | `alerts@h4reet.local` | no | asked | the same | the same |
| `ALERT_EMAIL_TO` | `__ASK__` | empty, or the Author's value | `operator@h4reet.local` | no, but personal | asked | the same | the same |
| `GATEWAY_AWS_PROFILE` | `h4reet-bedrock` | – | – | no | fixed | the gateway's container as `AWS_PROFILE` ([provider-adapter.md §3.2](provider-adapter.md#32-bedrock-converse-type-bedrock-converse)) | preflight: prod only, exactly this value |
| `GATEWAY_TEST_CLOCK` | – | `1` | `1` | no | fixed | the gateway: `POST /admin/test/clock` | [§7](#7-dev-only-switches-and-overlays) |
| `GATEWAY_TEST_SYNTHETIC_SPEND` | – | `1` | `1` | no | fixed | the gateway: the synthetic adapter and `POST /admin/test/synthetic` | [§7](#7-dev-only-switches-and-overlays) |
| `TELEMETRY_PAYLOAD_SAMPLING` | `off` | `off` | `off` | no | fixed | the gateway ([telemetry.md §3.4](telemetry.md#34-the-payload-rule)); the collector's payload transform | [§7](#7-dev-only-switches-and-overlays) |

- **dev's alert channels are optional.** dev runs on the stand-ins, so its real-channel keys may stay empty until the Author's recorded run (SC-002), which uses the same bot and chat as prod with the `[dev]` prefix ([alerts.md §4.3](alerts.md#43-prefixes-and-receivers)). That run checks them before it starts, and the gateway's `missing_alert_env` refusal is the backstop.
- **`GATEWAY_AWS_PROFILE` isn't named `AWS_PROFILE`.** Preflight refuses any template key that the calling shell also sets ([§10](#10-make-up-preflight)), and the Author's shell may well set `AWS_PROFILE`. Compose would let the shell's value win, which would point prod's gateway at the Author's own profile. Compose maps it: `AWS_PROFILE: ${GATEWAY_AWS_PROFILE:-none}`.

**Set by compose on the gateway, not by the env file:** `GATEWAY_STATE_DIR=/var/lib/h4-gateway`; `GATEWAY_DB_HOST=gateway-state`, `GATEWAY_DB_PORT=5432`, `GATEWAY_DB_NAME=gateway`, `GATEWAY_DB_USER=gateway` (the password stays a separate variable, never inside a URL); `LOCAL_MODEL_NAME=${MODEL_ALIAS}`; `HOME=/home/node`; `AWS_EC2_METADATA_DISABLED=true`, so the credential chain never tries the instance-metadata address; `TZ=UTC`; `NODE_ENV=production`; the `OTEL_*` variables in [telemetry.md §3.1](telemetry.md#31-sdk-setup); and the stack keys `H4_STACK`, `H4_ENV`, `H4_LANGFUSE_PORT`, and `H4_GRAFANA_PORT`. The dev-only switches arrive as `${GATEWAY_TEST_CLOCK:-0}` and `${GATEWAY_TEST_SYNTHETIC_SPEND:-0}`, so prod's gateway sees `0`.

**`GATEWAY_ANTHROPIC_API_KEY` (spec 010, Amendment 0-9).** Prod's alone: the Anthropic API key, which `deploy/compose.yaml` passes to the gateway alone as `${GATEWAY_ANTHROPIC_API_KEY:-}`, read by the adapter through its `api_key_env` setting. Prod's template lists it empty; dev's template and `dev-cpu.vars` don't hold it. The name differs from the SDK's own, `ANTHROPIC_API_KEY`, for the reason `GATEWAY_AWS_PROFILE` differs from `AWS_PROFILE`: P5 refuses a template key the calling shell also sets, and compose would let the shell's value win. No container holds an `ANTHROPIC_*` variable.

## 5. Langfuse 4.54.0's keys

Langfuse's own `docker-compose.yml` at 4.54.0 is the authority for its variable names; check 2 printed them (research.md [R-08](../research.md#r-08-langfuse-v4-not-v3)). The env file holds only the secrets and the one value an operator might change. Everything else is fixed in `deploy/compose.yaml`.

**In the env file:**

| Key | prod, dev | dev-cpu | Secret | Source | Becomes |
|---|---|---|---|---|---|
| `LANGFUSE_PUBLIC_KEY` | `__GENERATE__`: `pk-lf-` and a UUID | dummy, same shape | no on its own, but it is half of the collector's credential, so it is denied with the secret ([§8](#8-the-fr-007-deny-list)) | generated | web's `LANGFUSE_INIT_PROJECT_PUBLIC_KEY`; the collector's basic-auth user; the breach probe's Langfuse API user |
| `LANGFUSE_SECRET_KEY` | `__GENERATE__`: `sk-lf-` and a UUID | dummy, same shape | yes | generated | web's `LANGFUSE_INIT_PROJECT_SECRET_KEY`; the collector's basic-auth password; the probe's |
| `LANGFUSE_SALT` | `__GENERATE__` | dummy | yes | generated | web's and worker's `SALT` |
| `LANGFUSE_ENCRYPTION_KEY` | `__GENERATE__`: 64 hex (256 bits) | dummy, 64 hex | yes | generated | web's and worker's `ENCRYPTION_KEY` |
| `LANGFUSE_NEXTAUTH_SECRET` | `__GENERATE__` | dummy | yes | generated | web's `NEXTAUTH_SECRET` |
| `LANGFUSE_DB_PASSWORD` | `__GENERATE__` | dummy | yes | generated | `langfuse-db`'s `POSTGRES_PASSWORD`, and the password inside web's and worker's `DATABASE_URL` (hex, so it needs no URL escaping) |
| `LANGFUSE_INIT_USER_EMAIL` | `operator@h4reet.local` | the same | no | fixed | web's `LANGFUSE_INIT_USER_EMAIL`, the UI login |
| `LANGFUSE_INIT_USER_PASSWORD` | `__GENERATE__` | dummy | yes | generated | web's `LANGFUSE_INIT_USER_PASSWORD`, the UI password, which the Author reads from the env file |

**Fixed in compose, on web and worker:**
- `DATABASE_URL=postgresql://langfuse:${LANGFUSE_DB_PASSWORD}@langfuse-db:5432/langfuse`; `SALT`; `ENCRYPTION_KEY`; `TELEMETRY_ENABLED=false`.
- `CLICKHOUSE_URL=http://clickhouse:8123`, `CLICKHOUSE_MIGRATION_URL=clickhouse://clickhouse:9000`, `CLICKHOUSE_USER=clickhouse`, `CLICKHOUSE_PASSWORD=${CLICKHOUSE_PASSWORD}`, `CLICKHOUSE_CLUSTER_ENABLED=false`.
- `REDIS_HOST=valkey`, `REDIS_PORT=6379`, `REDIS_AUTH=${VALKEY_PASSWORD}`.
- `LANGFUSE_S3_EVENT_UPLOAD_BUCKET=langfuse`, `_REGION=auto`, `_ENDPOINT=http://seaweedfs:8333`, `_ACCESS_KEY_ID=${SEAWEEDFS_S3_ACCESS_KEY}`, `_SECRET_ACCESS_KEY=${SEAWEEDFS_S3_SECRET_KEY}`, `_FORCE_PATH_STYLE=true`, `_PREFIX=events/`.
- `LANGFUSE_S3_MEDIA_UPLOAD_*`: the same values with `_PREFIX=media/`. On web also `LANGFUSE_S3_MEDIA_UPLOAD_INTERNAL_ENDPOINT=http://seaweedfs:8333`. Spec 000 uploads no media, so no browser ever needs SeaweedFS (ADR 0022).
- `LANGFUSE_S3_BATCH_EXPORT_ENABLED=false`, `LANGFUSE_IN_APP_AGENT_ENABLED=false`.
- `HOSTNAME=0.0.0.0`. Both listen on `$HOSTNAME`, and Docker sets it to the container's ID, which binds only the container's network address, while their health checks ask 127.0.0.1. This was web-only until T065's third prod start (2026-10-09), where the worker's check was refused (tasks.md T180).
- `NODE_OPTIONS=--max-old-space-size=1024` on web and `=768` on the worker (plan §2).

**Fixed in compose, on web only:** `NEXTAUTH_URL=http://localhost:${H4_LANGFUSE_PORT}`, `NEXTAUTH_SECRET`, `AUTH_DISABLE_SIGNUP=true`, and headless initialization: `LANGFUSE_INIT_ORG_ID=h4reet`, `LANGFUSE_INIT_ORG_NAME=h4reet.ai`, `LANGFUSE_INIT_PROJECT_ID=h4reet-${H4_STACK}`, `LANGFUSE_INIT_PROJECT_NAME=h4reet-${H4_STACK}`, `LANGFUSE_INIT_PROJECT_PUBLIC_KEY`, `LANGFUSE_INIT_PROJECT_SECRET_KEY`, `LANGFUSE_INIT_USER_EMAIL`, `LANGFUSE_INIT_USER_NAME=operator`, `LANGFUSE_INIT_USER_PASSWORD`. The project ID is what the trace links use (`/project/h4reet-<stack>/traces/<id>`, [telemetry.md §6.6](telemetry.md#66-prometheus-loki-and-grafana)).

**Kept off** (plan §6, R-08): unset, or set to the value that switches it off. Each reaches out or calls a model. The internal network blocks them anyway; these settings are the first layer.

| Keys | State | Why |
|---|---|---|
| `LANGFUSE_IN_APP_AGENT_ENABLED` | `false`, with its sandbox and AWS keys unset | the in-app agent calls models |
| every `LANGFUSE_AI_*` | unset | AI features call models |
| `LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST`, `_IPS`, `_IP_SEGMENTS` | set to the empty string, on web and worker (tasks.md T149). The names come from the pinned images. They are the exceptions to Langfuse's block on internal addresses for an LLM connection's base URL, and `@langfuse/shared`'s `env.js` reads each as `s ? s.split(",")… : []`, so the empty string and unset are both an empty list: no exception | no LLM connection can name an in-stack host; with no provider keys and no route out, none reaches any host |
| `SMTP_CONNECTION_URL`, `EMAIL_FROM_ADDRESS` | unset | Langfuse's own email |
| `LANGFUSE_S3_BATCH_EXPORT_ENABLED` | `false` | batch exports |
| `LANGFUSE_USE_AZURE_BLOB`, `LANGFUSE_USE_OCI_NATIVE_OBJECT_STORAGE` | unset | other blob backends |
| the MCP keys | unset | MCP servers |
| any `AWS_*` | absent from both containers | cloud credentials |

None of these can be switched on from an env file: they aren't template keys, so preflight's key-parity check refuses them ([§10](#10-make-up-preflight)). A pytest test, `deploy/scripts/test_compose_env.py`, checks each service's `environment:` in `deploy/compose.yaml` against this section, sets the kept-off keys as the table says, and fails on any `AWS_*` key outside the gateway.

## 6. ClickHouse, Valkey, SeaweedFS, and Grafana

| Key | prod, dev | dev-cpu | Secret | Source | Consumed by |
|---|---|---|---|---|---|
| `CLICKHOUSE_PASSWORD` | `__GENERATE__` | dummy | yes | generated | `clickhouse` (with `CLICKHOUSE_USER=clickhouse` and `CLICKHOUSE_DB=default`, fixed in compose); Langfuse web and worker |
| `VALKEY_PASSWORD` | `__GENERATE__` | dummy | yes | generated | `valkey` (`--requirepass`, and its health check); Langfuse's `REDIS_AUTH` |
| `SEAWEEDFS_S3_ACCESS_KEY` | `__GENERATE__`: 20 uppercase hex | dummy, same shape | no: an identifier | generated | `seaweedfs`'s entrypoint, which renders `s3.json` (plan §6); Langfuse's S3 keys |
| `SEAWEEDFS_S3_SECRET_KEY` | `__GENERATE__` | dummy | yes | generated | the same |
| `GF_SECURITY_ADMIN_PASSWORD` | `__GENERATE__` | dummy | yes | generated | `grafana`: the `admin` login, which the Author reads from the env file |

**Fixed in compose on Grafana:** `GF_SECURITY_ADMIN_USER=admin`, `GF_SERVER_ROOT_URL=http://localhost:${H4_GRAFANA_PORT}/`, `GF_USERS_ALLOW_SIGN_UP=false`, `GF_AUTH_ANONYMOUS_ENABLED=false`, `GF_UNIFIED_ALERTING_ENABLED=false`, and the phone-home switches of plan §6: `GF_ANALYTICS_REPORTING_ENABLED=false`, `GF_ANALYTICS_CHECK_FOR_UPDATES=false`, `GF_ANALYTICS_CHECK_FOR_PLUGIN_UPDATES=false`, `GF_NEWS_NEWS_FEED_ENABLED=false`, `GF_SECURITY_DISABLE_GRAVATAR=true`, `GF_PLUGINS_PUBLIC_KEY_RETRIEVAL_DISABLED=true`, `GF_PLUGINS_PREINSTALL_DISABLED=true`, `GF_SNAPSHOTS_EXTERNAL_ENABLED=false`. Its provisioning files read `H4_STACK`, `H4_LANGFUSE_PORT`, and `GATEWAY_GRAFANA_RO_PASSWORD` ([telemetry.md §6.6](telemetry.md#66-prometheus-loki-and-grafana)).

**The collector** gets `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `TELEMETRY_PAYLOAD_SAMPLING`, and `H4_STACK`, and nothing else ([telemetry.md §6](telemetry.md#6-the-collector)).

### 6.1 dev-cpu's dummies

- Every secret-shaped key in `dev-cpu.vars` holds a fixed, public dummy. The engine holds nothing the Author needs (FR-039), so they protect nothing, and they are committed so agents can run the stack.
- Each dummy has its key's shape (64 hex, `pk-lf-…`, …), so the same validators pass. Each dummy text starts with `devcpu` or, where the shape forbids letters beyond hex, is a repeated pattern, so no one mistakes it for a real value. gitleaks allowlists this one path (plan §11).
- `dev-cpu.vars` has exactly the dev template's keys, plus `H4_DEVCPU_OPERATOR_TOKEN` and `H4_TREE` ([§2](#2-stack-keys), P4). `validate-config` and preflight both check that, so the two dev-class stacks can't drift apart.

## 7. Dev-only switches and overlays

### 7.1 The switches and every refusal

The synthetic metered source and the controllable clock would get around FR-034 anywhere but dev, so they exist only for dev (FR-036). Payload sampling is dev only by the Author's choice (R-30).

| Switch | Values | Allowed when | Effect |
|---|---|---|---|
| `GATEWAY_TEST_CLOCK` | unset or `0`; `1` | `H4_ENV=dev` | enables `POST /admin/test/clock`, forward only, persisted as `stack_state.test_clock_offset_ms` ([operator-admin.md §3.1](operator-admin.md#31-post-admintestclock)) |
| `GATEWAY_TEST_SYNTHETIC_SPEND` | unset or `0`; `1` | `H4_ENV=dev` | builds the synthetic adapter, dev's fallback, and enables `POST /admin/test/synthetic` at $0.10 a call ([provider-adapter.md §3.3](provider-adapter.md#33-synthetic-type-synthetic-dev-only)) |
| `TELEMETRY_PAYLOAD_SAMPLING` | `off`; `on` | `H4_ENV=dev` | payload attributes on client spans ([telemetry.md §3.4](telemetry.md#34-the-payload-rule)) |

The refusals, each with where it is enforced:

| # | Refused | Preflight | Gateway (exit 78) | Local gate | Runtime |
|---|---|---|---|---|---|
| D1 | `GATEWAY_TEST_CLOCK` or `GATEWAY_TEST_SYNTHETIC_SPEND` with any value but unset or `0`, outside `H4_ENV=dev` | yes | yes | `validate-config` and the compose policy refuse the prod template if it names either | `POST /admin/test/*` answers 403 outside dev and counts `h4.test_machinery.refused` |
| D2 | `TELEMETRY_PAYLOAD_SAMPLING=on` outside `H4_ENV=dev` | yes | yes | the same | the collector deletes payloads unless its own copy says `on` |
| D3 | any value of a switch but those listed | yes | yes | yes | – |
| D4 | a paid adapter in the route `H4_ENV` selects, outside `H4_ENV=prod` (FR-031) | yes: it reads `config/routing.yaml` | yes (`paid_route_outside_prod`) | `validate-config` (R2) | non-prod stacks mount `deploy/aws-none`, so no AWS call is possible |
| D5 | prod's route naming `synthetic` | – | yes | `validate-config` | – |
| D6 | prod's `stack_state.test_clock_offset_ms` not null | – | yes | – | the column's own `CHECK` ([data-model.md §2.2](../data-model.md#22-stack_state-the-kill-switch-one-row)) |
| D7 | a switch set in the calling shell, for any stack | yes ([§10](#10-make-up-preflight), check P5) | – | – | – |

- **In prod's file the two test keys don't exist,** so key parity refuses adding them, and compose hands prod's gateway `0`.
- **The breach test checks first:** `/health` must report `H4_ENV=dev` with the test machinery enabled, or it exits (plan §8).

### 7.2 The delivery overlay

The Author's recorded run, `make breach-test ENV=dev DELIVERY=real` (`evals/breach.py --delivery real`), sends dev's alerts to the real Telegram chat and mailbox (SC-002; [alerts.md §4.3](alerts.md#43-prefixes-and-receivers)). It does this with a second env file, the only overlay any stack accepts:
- **Content:** exactly one line, `ALERT_DELIVERY=real`.
- **Where:** a file named `delivery-real.vars` in a fresh 0700 temporary directory outside the working tree, deleted when the run ends.
- **How:** the run recreates dev's gateway with `--env-file ~/.config/h4reet-ai/env/dev.env --env-file <tmp>/delivery-real.vars` (Compose 2.30 applies them in order, later values winning) and `up -d --no-deps gateway`. At the end, success or not, it recreates the gateway with dev's file alone, back on the stand-ins. (Departure, tasks.md T080: the run file of §12 sits between the two, as on every compose call for a host stack, since compose can't render the file without its `H4_TREE`; and both recreations add `--wait --wait-timeout 120`, so the run goes on only once the gateway is healthy, or stops and names it.) (Departure, tasks.md T080's review: "success or not" holds for a run that passes, fails, or is stopped by Ctrl-C, SIGTERM, or SIGHUP, which a closed terminal sends; all run the same cleanup, which ignores any further interrupt until it has finished. A run killed outright, by SIGKILL or the host stopping, can't put the gateway back, and dev stays on real delivery until the next `make up ENV=dev` recreates it from dev's own files. The data-flow disclosure's row A1 says so.)
- **Refused:** on any stack but dev; inside the sandbox (`SANDBOX_RUNTIME=1`); and, before any restart, when any of dev's `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `ALERT_EMAIL_FROM`, or `ALERT_EMAIL_TO` is empty. The message names the empty keys, never a value.
- **Then the gateway's own rules apply,** as in prod: the Bot API base, TLS for SMTP, and every channel key present ([config-files.md §4.4](config-files.md#44-startup-refusals-exit-78-that-combine-this-file-with-the-environment)).

### 7.3 The worktree question

`dev-cpu.vars` sets `H4_TREE=/run/h4agents/tree`, the masked view of the repository's main working tree ([agents-engine.md §5](agents-engine.md#5-host-side-controls)). An agent that works in a linked worktree under the repository (`.claude/worktrees/<name>`) builds from its own checkout, because build contexts come from the client. But its bind mounts (`deploy/edge/nginx.conf`, `config/`, the collector, Prometheus, Loki, and Grafana files) would come from the main tree, so `make up ENV=dev-cpu` would test files the branch didn't write.

**Decision: one checkout at a time.** The engine serves the main working tree only. An agent working in a linked worktree doesn't run `make up ENV=dev-cpu` or `make breach-test ENV=dev-cpu`; the session that integrates its work runs them, from the main tree. Preflight refuses a dev-cpu run from a linked worktree (`git rev-parse --git-dir` differs from `--git-common-dir`), with the message "run dev-cpu from the main working tree". A per-worktree tree view is a later refinement, not needed while one engine serves one checkout ([plan.md §10](../plan.md#10-the-agents-engine-and-the-sandbox-opening)).

## 8. The FR-007 deny list

FR-007: every secret this spec introduces is denied by name, both its variable and the file that holds it, with a matrix row for each; the env files the host stacks run with are denied for writing as well as reading. The early patch (tasks.md T045) adds what isn't denied yet, before the first real secret exists ([plan.md §15](../plan.md#15-the-enforcement-layer-patch)).

| Secret | Variables, denied in the sandbox's `credentials.envVars` | File that holds it | Denied today? |
|---|---|---|---|
| The operator token | `H4_OPERATOR_TOKEN`. The CLI never reads a token from the environment; the name is denied anyway. | `~/.config/h4reet-ai/operator/<stack>.token` | no |
| The Telegram bot token | `TELEGRAM_BOT_TOKEN` | `~/.config/h4reet-ai/env/{prod,dev}.env` | the variable, yes |
| The alerts mailbox | `SMTP_PASSWORD`, `SMTP_USER` | the same env files | no |
| The gateway's database | `GATEWAY_DB_PASSWORD` | the same | no |
| Grafana's read-only role | `GATEWAY_GRAFANA_RO_PASSWORD` | the same | no |
| Langfuse | `LANGFUSE_SECRET_KEY`; `LANGFUSE_PUBLIC_KEY` (half of the collector's credential); `LANGFUSE_SALT`; `LANGFUSE_ENCRYPTION_KEY`; `LANGFUSE_NEXTAUTH_SECRET`; `LANGFUSE_DB_PASSWORD`; `LANGFUSE_INIT_USER_PASSWORD` | the same | `LANGFUSE_SECRET_KEY`, yes |
| ClickHouse | `CLICKHOUSE_PASSWORD` | the same | no |
| Valkey | `VALKEY_PASSWORD` | the same | no |
| SeaweedFS | `SEAWEEDFS_S3_SECRET_KEY` | the same | no |
| Grafana's admin | `GF_SECURITY_ADMIN_PASSWORD` | the same | no |
| AWS: the runtime identity's SSO session (FR-013) | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` (denied today), and `AWS_PROFILE`, `AWS_CONFIG_FILE`, `AWS_SHARED_CREDENTIALS_FILE`, `AWS_WEB_IDENTITY_TOKEN_FILE`, `AWS_ROLE_ARN`, `AWS_CONTAINER_CREDENTIALS_FULL_URI`, `AWS_CONTAINER_AUTHORIZATION_TOKEN` | `~/.config/h4reet-ai/aws-home/.aws/` (`config` and the SSO cache); the Author's own `~/.aws` | `~/.aws`, and the first three names |
| The engine's Author client key | – | `~/.config/h4reet-ai/agents-engine/` ([agents-engine.md §2](agents-engine.md#2-the-endpoint-and-the-client-configuration)) | no |
| The engine's server key and CA key | – | `/etc/h4agents/pki/` | no |
| The Anthropic API key (spec 010, FR-030, FR-032) | `GATEWAY_ANTHROPIC_API_KEY`, prod's name | prod's env file, as above | not before spec 010: P-A, the Author's patch, denies it, merged with spec 010 as one (its plan's B10) |

**`ANTHROPIC_API_KEY` (spec 010, FR-032; its plan's B9).** P-A denies it by name in the sandbox's `credentials.envVars` as well, as `GITHUB_TOKEN` is denied, but it is not an FR-007 variable and has no row in the table above. No stack reads it: rule R12 refuses an `api_key_env` that begins `ANTHROPIC_`, and P-A's compose policy refuses any `ANTHROPIC_*` variable on any service, and any reference to one. And it is the name Claude Code signs in with. The canary (`make matrix-canary`) and the behavioral tier put a fake value for every FR-007 variable into a Claude Code session, and a fake under this name would sign that session in with it, so both strip the name instead (their `STRIPPED`). The matrix checks its deny on a row of its own, `H/settings/spec 010: ANTHROPIC_API_KEY is denied by name`.

**The path rules the early patch adds or keeps:**
- `denyRead` and `denyWrite` on `~/.config/h4reet-ai`, which covers the env files, the operator tokens, the runtime AWS identity, and the Author's engine certificate in one entry (R-31).
- `denyRead` on `/etc/h4agents/pki` (plan §15's "engine's server key directory").
- For the Read and Edit tools as well as Bash: `Read(~/.config/h4reet-ai/**)` and `Edit(~/.config/h4reet-ai/**)` in `permissions.deny`, and `~/.config/h4reet-ai` in `credentials.files`, the three layers `~/.aws` already has.
- Kept: `./deploy/env` in `denyRead` and `denyWrite`, `Read(*.env)` and `Edit(*.env)`, and `~/.aws` in the credential files.

**Not denied, on purpose:**
- `deploy/env.agents/dev-cpu.vars`: public dummies under the same variable names. A name in `credentials.envVars` keeps the Author's session environment out of the sandbox; it says nothing about a committed file's contents.
- `~/.config/h4reet/agents-engine/docker/`: the agents' own client certificate for the engine, which agents must read. It is outside the sandbox's write roots, and its files are mode 0444 ([agents-engine.md §2](agents-engine.md#2-the-endpoint-and-the-client-configuration)).

**The rows that prove it** ([plan.md §13](../plan.md#13-the-forbidden-action-matrix)):
- Stage H, per secret: its variable is denied by name; its file is in `denyRead` and `denyWrite`; an Edit to the file is blocked.
- Stage S: each file is unreadable from inside the sandbox.
- The canary: `make matrix-canary` starts a session with fake values for every variable above, and none may appear in its environment or transcript.
- The static agent-config tier checks that every name in this table is denied (plan §14).

## 9. `make init-env`

`make init-env ENV=prod|dev [SYNC=1]`, the Author's terminal. It runs `python3 -I -B -X pycache_prefix=/dev/null deploy/scripts/init_env.py --stack $(ENV) [--sync]`, stdlib only.

### 9.1 What it does

1. **Refuses** `ENV=dev-cpu` (its file is committed), an unknown stack, and a run inside the sandbox (`SANDBOX_RUNTIME=1`), with exit 2.
2. **The directory.** Creates `~/.config/h4reet-ai/env/` with mode 0700 if it is missing. Refuses, with exit 5, a directory with a looser mode or another owner. For prod it also creates `~/.config/h4reet-ai/aws-home/.aws/` (0700, empty), so the gateway's bind source exists before the Author sets up Bedrock, and Docker never creates it as root.
3. **A new file** (without `SYNC`):
   - It refuses with exit 5 if `<stack>.env` exists: "exists; to start again, move it aside yourself". It never overwrites.
   - It copies the template line by line, comments included, and replaces `__GENERATE__` with a value in the key's shape (§9.2), `__REPO__` with the repository's real path (dev's `H4_AWS_DIR` only), and `__HOME__` with the user's home. It leaves `__ASK__` in place.
   - It writes with `O_WRONLY|O_CREAT|O_EXCL` and mode 0600, then fsyncs the file and the directory.
4. **`SYNC=1`** brings an existing file up to date with a template that has gained keys:
   - It requires the file to exist (exit 5 if not).
   - It appends each template key the file lacks, under a comment `# added by make init-env SYNC=1 on <UTC date>`, generating `__GENERATE__` values and leaving `__ASK__` in place.
   - It never changes, removes, or reorders an existing line.
   - It lists keys the file has and the template no longer has: "remove these by hand; preflight refuses them".
   - It writes a temporary file in the same directory with mode 0600, fsyncs it, and renames it over the original.
5. **It prints names, never values:** the path; each generated key; each `__ASK__` key still to fill; dev's empty optional channel keys ("fill these for the recorded run"); and the next steps: `make operator-token ENV=<stack>`, fill the `__ASK__` keys in an editor, then `make up ENV=<stack>`.

Exit codes: 0 done; 2 usage; 5 a file problem (it exists, it is missing for `SYNC`, or a mode or owner is wrong). pytest covers each case against a temporary `HOME` (plan §7).

### 9.2 Generated values

From Python's `secrets` module. No generated value needs quoting, URL escaping, or YAML escaping.

| Keys | Shape |
|---|---|
| `GATEWAY_DB_PASSWORD`, `GATEWAY_GRAFANA_RO_PASSWORD`, `LANGFUSE_DB_PASSWORD`, `LANGFUSE_SALT`, `LANGFUSE_NEXTAUTH_SECRET`, `LANGFUSE_INIT_USER_PASSWORD`, `CLICKHOUSE_PASSWORD`, `VALKEY_PASSWORD`, `SEAWEEDFS_S3_SECRET_KEY`, `GF_SECURITY_ADMIN_PASSWORD` | 32 random bytes as 64 lowercase hex (`secrets.token_hex(32)`) |
| `LANGFUSE_ENCRYPTION_KEY` | the same 64 hex, which is the 256-bit hex key Langfuse requires |
| `LANGFUSE_PUBLIC_KEY` | `pk-lf-` and a random UUID |
| `LANGFUSE_SECRET_KEY` | `sk-lf-` and a random UUID |
| `SEAWEEDFS_S3_ACCESS_KEY` | 10 random bytes as 20 uppercase hex |

The operator token is not generated here. `make operator-token ENV=<stack>` mints it into its own file and prints the hash for `OPERATOR_TOKEN_SHA256` ([operator-admin.md §6](operator-admin.md#6-the-operator-cli-scriptsoperatorpy)).

## 10. `make up` preflight

`deploy/scripts/preflight.py`, run as `python3 -I -B -X pycache_prefix=/dev/null $(TREE)/deploy/scripts/preflight.py --stack $(ENV) --env-file $(ENVFILE) [--run-file <the run file>] --repo <the working tree> [--ref=<REF>]`: on a host stack the export's own copy, so it checks the started commit's templates, locks, and compose file, like every Python the Author's terminal runs ([plan.md §4](../plan.md#4-environment-files-preflight-and-the-stack-targets)). It parses env files as data and never sources them (§1.1). It runs every check, prints one line per check (`PASS`, `WARN`, or `FAIL`, the check's ID, and a reason that names keys, paths, and figures, never a value), and exits 1 if any check failed. `make up` stops there, before anything starts.

| ID | Refuses when | Stacks |
|---|---|---|
| P1 | The env file is missing or unreadable. On host stacks: its mode isn't 0600, its owner isn't the user, or its directory isn't 0700. | all; the modes on prod and dev |
| P2 | A line breaks the grammar (§1.1), or a key appears twice. | all |
| P3 | A placeholder is left: `__GENERATE__`, `__ASK__`, `__REPO__`, or `__HOME__`; or a value is empty. Only dev's optional channel keys, `H4_BUILD_PROXY` on host stacks, and `H4_WEB_SUFFIX` on prod (spec 002), may be empty. | all |
| P4 | The keys differ from the template's (each missing and extra key is named). dev-cpu is compared with the dev template's keys plus `H4_DEVCPU_OPERATOR_TOKEN` and `H4_TREE`. | all |
| P5 | The calling shell sets any `COMPOSE_*` or `H4_*` variable, or any key of the template. Compose would let the shell's value silently override the file's. | all |
| P6 | `ENV`, `H4_STACK`, `H4_ENV`, and `COMPOSE_PROJECT_NAME` disagree, or `COMPOSE_PROFILES` isn't the stack's exact value, with exactly one of `gpu` and `cpu`. | all |
| P7 | A key's value fails the checks in §2 to §6: a port that isn't the stack's, a path in the wrong place, `H4_TREE` set in a host stack's env file, a run file whose `H4_TREE` isn't the export of its `H4_REF`, dev-cpu's `H4_TREE` not `/run/h4agents/tree`, `MODEL_FILE` or `MODEL_ALIAS` not matching `models.lock`, `ALERT_DELIVERY` or `SMTP_TLS` not allowed for the stack, prod's `GATEWAY_AWS_PROFILE`, `H4_BUILD_PROXY`, an `H4_WEB_SUFFIX` that isn't its stack class's (spec 002), an `OPERATOR_TOKEN_SHA256` that isn't 64 lowercase hex, a missing token file (prod, dev), or a dummy token that doesn't match its hash (dev-cpu). | all |
| P8 | A dev-only switch is set outside `H4_ENV=dev`, or the route `config/routing.yaml` gives this `H4_ENV` names a paid adapter outside `H4_ENV=prod` (D1 to D4, FR-031, FR-036). | all |
| P9 | A stray file exists: `deploy/.env`; a `compose.override.yaml` or `.yml`, or a `docker-compose.override.*`, beside the compose file; or an env file anywhere in the working tree (`*.env`, `.env`, `.env.*`, except `*.env.example`), including the legacy `deploy/env/`. The message names the path and says to move it to `~/.config/h4reet-ai/env/`. | all |
| P10 | Docker is unreachable, or Compose is older than 2.30. | all |
| P11 | The stack is on the wrong engine: prod or dev on a rootless engine, or dev-cpu on anything but the agents' engine (rootless, with the authorization plugin `h4-authz` listed by `docker info`). Inside the sandbox, the message says to run make through the relay. | all |
| P12 | For the `gpu` profile: the `nvidia` runtime is missing from `docker info`, or free VRAM is below the model's need in `models.lock` (read with `nvidia-smi` on the host, or with the pinned `nvidia/cuda` probe image when the host has no `nvidia-smi`). A model server this stack already runs is counted as free. | prod, dev |
| P13 | **Disk** (R-32). Free space falls short of what this run writes, on both: the Windows drive that holds WSL's `ext4.vhdx` (`H4_VHDX_MOUNT`, `/mnt/c` by default, through `statvfs`), and ext4 (Docker's root directory from `docker info`, and `H4_MODEL_DIR`). Required: the bytes of the stack's models still to download (from `models.lock`), plus 12 GB if any of the stack's images is missing locally, plus a 20 GB margin. The gateway's image isn't counted as an image to pull: `make up` builds it after preflight, mostly from cached layers, inside the margin (tasks.md T184). The message names every figure. `df /` inside WSL alone is not enough: it measures the virtual disk, not the drive under it. On dev-cpu the ext4 figure is `/`, because the engine's data root is on the same WSL disk; a Windows drive that can't be read fails closed. | all |
| P14 | `H4_MODEL_DIR` is under `/mnt/`, or (host stacks) isn't on ext4. | all |
| P15 | Memory: on host stacks, WSL's `MemAvailable` is below the sum of the stack's memory limits (from `docker compose config`) plus 4 GiB. On dev-cpu, the sum of the limits, with the breach probe's, is above the engine's 16 GB cap minus 1 GiB. The message names both figures: today about 13.2 GiB against 15 GiB. | all |
| P16 | A port is held by another process or project. A port held by this same project's `edge` passes. On dev-cpu the check reads the engine's published ports through the API. | all |
| P17 | An image is unpinned, or its digest differs from `deploy/images.lock` (`docker compose config --no-interpolate`, the same rule as the compose policy, plan §11). The one exception is the gateway's own build, `h4reet-gateway:${H4_REF:-working-tree}` as written, on `gateway` alone, with `pull_policy: never` (tasks.md T184); without `pull_policy: never` it is refused, and any other spelling is an unpinned image. | all |
| P18 | The model: on dev-cpu, `/run/h4agents/models/${MODEL_FILE}` is missing or the wrong size ("ask the Author to run deploy/agents-engine/engine.sh seed"). On host stacks a missing model is a WARN: `make up`'s next step, `pull-models.sh`, fetches and verifies it, and P13 has already counted its bytes. A present file must have the lock's size and mode 0444 (`pull-models.sh` checked its sha256 when it downloaded it). | all |
| P19 | prod's AWS directory, `H4_AWS_DIR`: missing, not mode 0700 (`make init-env ENV=prod` creates it empty), or a symbolic link, itself or its parent, which would put prod's mount wherever it points (tasks.md T194). Once prod's route in `config/routing.yaml` names a paid adapter, also a `config` with no `[profile h4reet-bedrock]` section, or whose SSO region isn't us-east-1: the profile's `sso_region`, or its sso-session's when it names one, as `deploy/scripts/aws-login.sh` reads it; before that (US1, before the Author sets up Bedrock) the directory may be empty. Preflight never reads the SSO cache; the gateway's `/health` and the `credentials_expiring` alert report the session. | prod |
| P20 | dev-cpu only: the run starts from a linked worktree (`git rev-parse --git-dir` differs from `--git-common-dir`). The engine serves the main working tree only ([§7.3](#73-the-worktree-question)): "run dev-cpu from the main working tree". | dev-cpu |
| P21 | Host stacks: a WARN, not a refusal, when the working tree has uncommitted changes under `config/`, `deploy/`, `services/`, `evals/`, or `scripts/`: they aren't in the export of the commit being started, and the message names them. A `REF` that doesn't resolve to a commit is a FAIL. | prod, dev |

P7's model keys, P12, and P18 read `deploy/models.lock` (one model per line, plan §3): a lock that is missing or doesn't parse fails P7 and P18, and a `gpu` stack whose compose file has no `model-server-gpu` fails P12. Each of P7 and P18 names the reason.

**The other commands that share these checks:**
- `make pull` runs P1 to P7, P10, P13 (for every image and model it will fetch), and P14.
- `pull-models.sh` runs P13 and P14 for its own bytes, through `python3 -I -B -X pycache_prefix=/dev/null deploy/scripts/preflight.py --disk-only --bytes <n> --path "$H4_MODEL_DIR"`, before each download.
- `deploy/agents-engine/engine.sh seed` has its own copy of the disk check in `deploy/agents-engine/engine.sh`, so the human-only boundary code never calls agent-editable code ([agents-engine.md §6](agents-engine.md#6-seeding)).

pytest covers every refusal with a fixture env file and a stubbed `docker` (plan §7).

**(spec 010)** P3: `GATEWAY_ANTHROPIC_API_KEY` may be empty while prod's route names no `anthropic-messages` adapter, and must not be while it does. P7: while it does, the key is printable ASCII without spaces, 20 to 256 characters, and preflight names the key, never its value. P19: the AWS profile's checks apply while prod's route names a `bedrock-converse` adapter, rather than any paid adapter.

## 11. What the gateway checks for itself

The gateway validates the variables it receives at startup (`src/config/validate-env.ts`) and exits 78 with a named reason ([plan.md §5.8](../plan.md#58-startup-refusals)). Preflight checks the same things earlier, but the gateway never relies on it: a container can be started without `make up`.

| Check | Reason |
|---|---|
| `H4_STACK` is `prod`, `dev`, or `dev-cpu`, and `H4_ENV` is its class | `invalid_stack`, `stack_env_mismatch` (plan §5.8) |
| A dev-only switch outside `H4_ENV=dev` (D1, D2), or a switch value that isn't listed (D3) | `dev_switch_outside_dev`, `invalid_switch_value` (plan §5.8; [data-model.md §4](../data-model.md#4-configuration-the-gateway-loads)) |
| A paid route outside prod; `synthetic` in prod; the local base URL not an in-stack service, or its keys unset | `paid_route_outside_prod`, `synthetic_in_prod`, `local_url_not_in_stack`, `missing_env` ([config-files.md §1.4](config-files.md#14-startup-refusals-exit-78)) |
| prod's `ALERT_DELIVERY` isn't `real`, or any stack's is neither `real` nor `standin`; in real mode, the Telegram base, SMTP's TLS, and every channel key | `alert_delivery_not_real`, `invalid_alert_delivery`, `telegram_base_not_bot_api`, `smtp_without_tls`, `missing_alert_env` ([config-files.md §4.4](config-files.md#44-startup-refusals-exit-78-that-combine-this-file-with-the-environment)) |
| `OPERATOR_TOKEN_SHA256` malformed, or on prod equal to the dev-cpu dummy's hash | `operator_hash_malformed`, `operator_hash_is_dummy` ([data-model.md §5](../data-model.md#5-the-operator-credential)) |
| prod's `AWS_PROFILE`, which compose sets from `GATEWAY_AWS_PROFILE`, is unset or `none` | `aws_profile_unset` (tasks.md T023) |
| `GATEWAY_GRAFANA_RO_PASSWORD` is set but isn't printable ASCII without spaces, which its SCRAM-SHA-256 verifier needs; the store refuses it too, rather than retry it forever | `grafana_ro_password_invalid` ([data-model.md §2.9](../data-model.md#29-the-view-v_state-and-the-role-grafana_ro)) |
| prod's `stack_state.test_clock_offset_ms` isn't null (checked once the store answers) | `test_clock_in_prod` (plan §5.8) |

`validate-config` (`make check`) runs the same validators over the three committed files: both templates, with `__GENERATE__` and `__ASK__` counting as present values of the right shape, and `dev-cpu.vars` ([config-files.md §5](config-files.md#5-validate-config)). It reads only the keys the gateway reads, so the path placeholders don't concern it.

## 12. The run file (host stacks)

A host stack runs the commit it was started from, not whatever the shared working tree holds later ([plan.md §4](../plan.md#4-environment-files-preflight-and-the-stack-targets)). `make up ENV=prod|dev [REF=<commit>]` exports the commit (`HEAD` by default) and writes `${H4_STATE_DIR}/run.env`, mode 0600, which every later compose call for the stack passes as a second `--env-file`, after the stack's own:

| Key | Value |
|---|---|
| `H4_TREE` | `${H4_STATE_DIR}/tree/<sha>`: `git archive <sha>`, extracted once per commit and made read-only |
| `H4_REF` | the full SHA being run; also the tag of the gateway's image, `h4reet-gateway:<sha>`, which the compose file names (tasks.md T184) |
| `H4_REF_BRANCH` | the branch name at start, or `detached` |
| `H4_REF_PREVIOUS` | the SHA that ran before, which `make up REF=$H4_REF_PREVIOUS` brings back (the rollback) |

- The compose file itself comes from the export too (`-f ${H4_TREE}/deploy/compose.yaml`), so the services, binds, and images are the started commit's.
- `make up` builds the gateway's image from the export once per commit, outside compose, as `h4reet-gateway:<H4_REF>`, and reuses it after that: an image with that tag on the host's engine was built from that commit's export, so prod and dev at one commit run one image (plan §4; tasks.md T184). It builds compose's own images from the export every time (`--build`; unchanged layers come from the cache), so a stale image can't certify code the commit doesn't contain.
- It keeps the exports of the running and the previous commit, and at most three in all; it deletes older ones.
- It also creates `${H4_STATE_DIR}/gateway`, mode 0700, for the gateway's journal and incident drafts: compose's long-syntax bind never creates a missing source. It refuses `tree/` or `gateway/` when either is a symbolic link.
- What it exports is the commit's own content. Git runs with `GIT_NO_REPLACE_OBJECTS=1`, so a replace ref under `.git/refs/replace` can't swap an object. The export refuses to run while `.git/info/attributes` exists, which `git archive` would apply (`export-ignore`, `export-subst`). Agents can write both, and `git status` shows neither.
- Then it proves it, without trusting any one file in `.git`. The commit object must hash to its own ID, and the extracted files must hash to the tree that object names, computed as git computes tree IDs. Otherwise the export is refused and removed. It checks an export again when a later `make up` reuses it. So the repository's `.gitattributes` may ask for no conversion but `eol=lf`, and no `export-ignore` or `export-subst`: either would change what `git archive` writes. A commit holding a submodule is refused by name: `git archive` writes one as an empty directory.
- The file is the stack's, not a template's: P4 doesn't compare it, P5 doesn't apply to it, and P7 checks it.
- Before a host stack's first `make up` there is no run file, and nothing of the stack runs. `make down` and `make logs` say so and do nothing; `make status` reports the stack as not started by `make up`. None of them fails on the missing file.
- dev-cpu has no run file: the engine serves the masked live tree, so agents test what they are writing ([§7.3](#73-the-worktree-question)). With no `H4_REF`, the compose file's default names its gateway image, `h4reet-gateway:working-tree`, which `make up ENV=dev-cpu` builds from the working tree on every run. No env file holds `H4_REF`, so P4 refuses it in one.

