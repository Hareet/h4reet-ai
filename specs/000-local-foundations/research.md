# Research: Local Foundations (spec 000)

Phase 0 output of `/speckit-plan`. One entry per decision the plan rests on: the decision, why, and what else was weighed. Entries marked **(the Author)** rest on an answer from the plan interview of 2026-10-08. The answers are quoted word for word in [The plan interview, word for word](#the-plan-interview-word-for-word): the option chosen and its text as offered. The entries give the plan's reading beside them. The rest are design choices made within the spec and the constitution. Hardware facts come from the Author's two verification runs in their own terminal, on 2026-10-07 (check 1) and 2026-10-08 (check 2). Nothing here was measured inside the agent sandbox, which has no Docker and no GPU.

No `NEEDS CLARIFICATION` remains in the plan's Technical Context. Check 2 stopped early when its download filled the Windows C: drive and WSL crashed (R-32). Three measurements are therefore still open, and all three run in the first stack task, as a separate Author step with no agents working and after the disk preflight:
- the production model's load time and VRAM (R-03);
- whether an internal-only network blocks egress, and whether a container on one can publish a port (R-06);
- the SeaweedFS image tag (R-09).

## The plan interview, word for word

Each row gives the question as asked, the option the Author chose, and that option's text as it was offered, all copied from the session. The answers from 2026-10-07 are in spec.md's Clarifications.

| Question (asked 2026-10-08 UTC) | Chosen | The option's text as offered | Entry |
|---|---|---|---|
| Answer 7 (the fallback sub-budget): I read it as running out also alerts you, and a day that ends WITHOUT running it out starts the next with the full $2. Is that right? | Yes, both readings (Recommended) | Running out alerts you and fallback stays off until you approve renewal; an unexhausted day resets to $2 normally. | R-15 |
| Answer 8: I read it as the dev stack makes no paid calls (no Bedrock configured), and development work (Claude Code and the agents) runs on your Team plan. Right? | Yes (Recommended) | Only production calls Bedrock; dev and the agents' engine use local or stand-in models only; dev tooling is on the Team plan. | R-05, R-28 |
| Which clock defines the budget day and month? | UTC (Recommended) | Matches AWS billing and Budgets (spec 001), no daylight-saving edge cases. | R-13 |
| FR-001 still lists a code of conduct, which needs an enforcement contact. Where should it land? | Publication spec (Recommended) | It only matters once outsiders can take part; move it with a contact chosen then (e.g. an address on the h4reet.ai domain from spec 001). | spec FR-001 |
| The Makefile defaults to ENV=local, but the design runs 'prod' (the production local tier) and 'dev' on the 5090, plus 'dev-cpu' on the agents' engine. Retire 'local'? | Retire local (Recommended) | Environments: prod and dev on the 5090, dev-cpu for agents; the Makefile defaults to ENV=prod. Spec 001 can split prod into cloud and local files later. | R-05 |
| Should 'make up ENV=prod' refuse to run from anything but a clean main? | No | Prod can run from any branch; you're trusted to know what you started. | R-14 |
| Anonymous Docker Hub pulls are rate-limited. Log in with a free account and a read-only token (denied to agents)? | No, stay anonymous | Fine for occasional pulls; cold starts may hit the limit. | R-29 |
| May payload sampling (prompts and completions in traces) ever be switched on in production during spec 000? | Dev only (Recommended) | Prod refuses TELEMETRY_PAYLOAD_SAMPLING=on in spec 000; revisit in Phase 1 with the data-flow disclosure. | R-30 |
| Which Bedrock model should the production fallback use? (You'll confirm the exact ID with `aws bedrock list-inference-profiles` and copy its prices from the Bedrock pricing page into config/prices.yaml.) | Claude Haiku 5.5 (Recommended) | Newest small Claude, the cheapest Claude by list price; used only if Bedrock offers it in your region, else falls back to Haiku 4.5. Region us-east-1 unless you say otherwise in Other. | R-12 |

**Correction, 2026-10-08, after the interview.** The recommended Bedrock option described Haiku 5.5 as "the cheapest Claude by list price". That wasn't verified: Haiku 5.5's price hadn't been published by 2026-10-08 ([R-12](#r-12-bedrock-through-converse-claude-haiku-55-the-author)). The row above stays as offered, and the merge-request note asks the Author whether the choice stands.
| When the $2 fallback sub-budget runs out and you approve renewal the SAME day, what does renewal give? | Fresh $2 immediately | Renewal grants another $2 today, still inside the $5 daily ceiling. | R-15 |
| How should you prove you're the operator when resetting the kill switch, renewing the sub-budget, or initializing a store? | Token file per stack (Recommended) | A random token in ~/.config/h4reet-ai/operator/<stack>.token (mode 0600), sent to an admin port on 127.0.0.1; the gateway stores only its hash. | R-16 |
| Which AWS identity should the Bedrock adapter use (via SSO, mounted read-only into prod's gateway)? | Narrow permission set (Recommended) | A dedicated SSO permission set allowing only bedrock:InvokeModel on the one model; you create it in IAM Identity Center. | R-17 |
| Where should agent sessions run? The spec (user story 3, scenario 1) currently says agents run with the repository opened in the devcontainer. | WSL, devcontainer versions (Recommended) | Agents keep the full sandbox on WSL. The devcontainer still sets every tool version, and make toolchain-check fails if WSL drifts from it. Means amending that scenario; ADR 0018 records why. | R-20 |
| What should the agents' own container engine be (FR-039)? | Rootless Docker, own user | A second Docker daemon under a separate Linux user. No VM, but it shares the host's kernel. It also needs per-user firewall rules to limit internet access, a permission change to keep it out of your Windows files, and its own fix to keep it off the GPU. | R-21 |
| MinIO is gone. What should Langfuse use for its S3 file storage? | SeaweedFS (Recommended) | Open source (Apache-2.0), actively maintained, with official images; runs as one container. Langfuse doesn't officially test it, so our own end-to-end trace checks serve as the test. | R-09 |
| At the end of spec 000, which files should become human-only? Agents could then change them only through patches you apply, as with .claude/**. | Gates only | Only tools/gates/** becomes human-only, and you run the gate directly. The Makefile and stack scripts stay agent-editable and are checked in review. Faster to change, but a branch's Makefile could run unreviewed code in your terminal. | R-14 |

## Hardware and platform

### R-01. The model server runs on the RTX 5090 through CUDA 12.8 images

- **Decision**: llama.cpp `llama-server` from `ghcr.io/ggml-org/llama.cpp`, build 11459 (commit `f498f864f`, version 0.6.0-dev).
  - GPU variant `server-cuda-b11459@sha256:fff6185edd2fbc4093aa5970bf6db53ed11c283e3a1c52a3e244cf27047264f4`.
  - CPU variant `server-b11459@sha256:33868c035b21dc63f7c60b7438774283fd99215bc319114eb03de5df4ce7cd6b`.
  - Check 2 found the build tags and the floating tags carrying the same digests.
- **Evidence**:
  - **Check 1:** the CUDA image carries `/usr/local/cuda-12.8`, the first CUDA line that supports Blackwell (sm_120). `--alias`, `--flash-attn`, `--jinja`, `--metrics`, `--no-slots`, and `--no-webui` all exist in this build.
  - **Check 2, GPU inside containers.** After `sudo nvidia-ctk runtime configure --runtime=docker` and a Docker restart, a container saw the GPU: `NVIDIA GeForce RTX 5090 Laptop GPU`, driver 592.01, compute capability 12.0, 24,463 MiB. Check 1 had failed with `could not select device driver "" with capabilities: [[gpu]]`, because the toolkit was installed but not registered with Docker. START-HERE §1 gets the step, and preflight checks for the `nvidia` runtime.
  - **Check 2, native sm_120 kernels.** With `CUDA_DISABLE_PTX_JIT=1`, the stand-in model was ready in 5 s and served about 300 tokens/s generated and 430 tokens/s for the prompt, so the image carries native Blackwell kernels. No JIT cache volume and no local rebuild are needed.
  - **Check 2, CPU.** The CPU image on 4 CPUs (the agents' engine's shape) was ready in 2 s and served the stand-in at about 70 tokens/s.
- **Alternatives**:
  - vLLM: the best batching, but a 10 GB Docker Hub image with no usable CPU sibling, so the agents' engine would run different server software. It is the documented swap if concurrency ever matters, behind the same OpenAI-compatible adapter.
  - Ollama: Docker Hub only, its model registry adds an egress flow, and it has no Prometheus metrics.
  - SGLang, TGI, NIM: heavier, no matching CPU image, or an NGC account.

### R-02. Image pins

- **Decision**: every image is pinned as `tag@sha256:<index digest>` in `deploy/compose.yaml` and `deploy/images.lock`, written by `make pin-images` in the Author's terminal.
  - Registries are preferred in this order: an official copy on ghcr.io, quay.io, or ECR Public's Docker library mirror (`public.ecr.aws/docker/library/*`, which check 2 showed carries the same digests as Docker Hub's official images), then Docker Hub.
  - Gate and devcontainer bases are pinned the same way.
- **Pins** (check 2, 2026-10-08):

  | Image | Tag | Digest |
  |---|---|---|
  | `ghcr.io/ggml-org/llama.cpp` | `server-cuda-b11459`, `server-b11459` | R-01 |
  | `ghcr.io/nginx/nginx-unprivileged` | `1.30.5-alpine` | `sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3` |
  | `ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib` | `0.162.0` | `sha256:39923a8e431bd1f57be82411999d389fcfe40857492e4365456d97a4c1f74be6` |
  | `ghcr.io/langfuse/langfuse` | `4.54.0` | `sha256:ea9f763af1181b444c081353cd2f8174323c84b2447ed7295857d04ae1153f2c` |
  | `ghcr.io/langfuse/langfuse-worker` | `4.54.0` | `sha256:fe7ea9e288c6586783989920ced1704172624f45da495a68d8ae07ba466641f2` |
  | `public.ecr.aws/docker/library/postgres` | `17.11-alpine3.24` | `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24` |
  | `docker.io/clickhouse/clickhouse-server` | `26.8.20.9` (R-08) | `sha256:9b61e3c635c04ad5bb521eb4f6e61ce7585b5580814e51c25bb9e8292ce43364` |
  | `docker.io/valkey/valkey` | `8.1.10-alpine` | `sha256:081c2f5cb575efc901aa80ff9cdbd1ec6a301682fd35e1ebb4b0990a4a4a8507` |
  | `docker.io/chrislusf/seaweedfs` | open (R-09) | open |
  | `quay.io/prometheus/prometheus` | `v3.15.0` | `sha256:efd719c99d83b060d9daefdcf00360461adf279f45ef5391f8d111892118753e` |
  | `docker.io/grafana/loki` | `3.7.8` | `sha256:1107dd5274e0ada47e42472b7a7e71f3b2a2fe878878108f3e2f9e51528f0193` |
  | `docker.io/grafana/grafana` (OSS) | `13.2.3` | `sha256:b28bae15e219c998fb0e0424ed724930cc61b1f61fb404d47c862f9a23f9e572` |
  | `ghcr.io/axllent/mailpit` | `v1.31.4` | `sha256:b68349e3a014b90c5610bfb26b2ae36f3892d7b8cf25ee140c6c71c98d2fcf48` |
  | `public.ecr.aws/docker/library/node` | `24.21.0-trixie-slim` | `sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66` |
  | `public.ecr.aws/docker/library/python` | `3.12.15-slim-trixie` | `sha256:05cda9777409a9c3ffddd94a4c476b79f0769a0b4857f0c7ed9226b6800b0d6f` (read from Docker Hub; the mirror is confirmed at pin time) |
  | `public.ecr.aws/docker/library/ubuntu` | `24.04` | `sha256:534baea6a22c03a63003dbc8dbe78fe34bc0d7e595d9a9dc9834884ff530eb55` (read from Docker Hub; the same) |
  | `ghcr.io/astral-sh/uv` | `0.8.22` | `sha256:9874eb7afe5ca16c363fe80b294fe700e460df29a55532bbfea234a0f12eddb1` |
  | `ghcr.io/astral-sh/ruff` | `0.16.10` | `sha256:e1675e92fe4d38ce10ab6cabaf4ab20f209b84433b789cfd1b683c028aa391e2` |
  | `ghcr.io/gitleaks/gitleaks` | `v8.30.1` | `sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f` |
  | `nvidia/cuda` (preflight's GPU probe only) | `12.8.0-base-ubuntu24.04` | `sha256:e778509d37d66475120929671500377524f7278478ba08131b07ef3ffcc0dce0` |

- **Also from check 2:**
  - MinIO's official images now answer HTTP 401 on both Docker Hub and Quay (R-09).
  - Docker Hub's live anonymous allowance was 100 pulls per hour (R-29).
  - The host's Docker uses the classic `overlay2` store, not the containerd image store (R-21).
- **Rationale**:
  - Digests make "every service starts from pinned images" (US1-1) literal.
  - Choosing registries keeps a cold start at 5 anonymous Docker Hub pulls.
  - The policy gate refuses drift between the compose file and the lock.
- **Alternatives**:
  - Tags only: mutable.
  - A local registry mirror: one more service to run before anything else works.
  - Logging in to Docker Hub: the Author's call (R-29).

### R-03. Models, VRAM, and SC-001's time budget

- **Decision**:
  - **prod:** Qwen3-30B-A3B-Instruct-2507, GGUF Q4_K_M: `unsloth/Qwen3-30B-A3B-Instruct-2507-GGUF` at revision `eea7b2be5805a5f151f8847ede8e5f9a9284bf77`, file `Qwen3-30B-A3B-Instruct-2507-Q4_K_M.gguf`, 18,556,686,752 bytes, sha256 `6c997b8af17debdfb01d890214400ccbab00db6acc0ba8da5de1cc906c4774d0`, Apache-2.0.
  - **stand-in, for dev and dev-cpu:** `Qwen/Qwen2.5-0.5B-Instruct-GGUF`, revision `9217f5db79a29953eb74d5343926648285ec7e67`, file `qwen2.5-0.5b-instruct-q4_k_m.gguf`, 491,400,032 bytes, sha256 `74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db`.
  - Both are pinned in `deploy/models.lock`. The first pin is trust-on-first-use, checked by the Author against the file's page.
- **Evidence**:
  - **Publisher:** neither `Qwen/` nor `ggml-org/` publishes this model as GGUF (Hugging Face answered 401). Unsloth's repository is Apache-2.0 with about 281,000 downloads. Bartowski's and LM Studio's copies exist too, but differ in size and hash.
  - **Download:** check 1 measured 786 Mbps from Hugging Face, so the model downloads in about 3.2 minutes. Images are about 4–5 GB compressed, and startup takes about 2 minutes, so SC-001's 10 minutes holds with margin.
  - **VRAM**, not yet measured. The GPU is the laptop RTX 5090 with 24,463 MiB, of which the Windows desktop held 524 MiB, leaving about 23.4 GiB. The estimate is about 21.3 GiB:
    - 17.3 GiB of weights;
    - 3 GiB of f16 KV cache for 32,768 tokens (48 layers × 4 KV heads × 128 dimensions × 2 × 2 bytes = 96 KiB per token);
    - about 1 GiB of compute buffers.

    That leaves about 2 GiB of headroom. The first stack task measures it. If it doesn't fit, `-c 16384 -np 2` halves the KV cache, and a q8_0 KV cache is the next step.
- **Rationale**:
  - A mixture-of-experts model with 3.3B active parameters is fast on the 5090.
  - It has no separate reasoning channel, so local and Bedrock answers keep one response shape for the contract test.
  - Phase 1's evals pick the twin's final model; changing it is a configuration change.
- **Consequence for later phases**: on a 24 GB card, this model leaves about 2 GiB of VRAM, not the 8 GB design A assumed for Phase 2's speech. Phase 1 revisits the model with that budget.
- **Alternatives**:
  - gpt-oss-20b (about 12 GB): it would leave room for speech, but its reasoning output complicates the contract test.
  - Qwen3-14B, Mistral Small 3.2 24B: dense, and slower.
  - A 4B model for spec 000 only: the fallback if bandwidth had been under about 400 Mbps. It wasn't.

### R-04. Host facts

| Fact | Value |
|---|---|
| CPU, memory | 24 CPUs; WSL sees 62 GB of RAM and 32 GB of swap (`.wslconfig`: `memory=64GB`, `swap=32GB`, which leaves Windows little headroom on this laptop; START-HERE suggests 48 GB) |
| Disk | R-32 |
| GPU | NVIDIA GeForce RTX 5090 Laptop GPU, 24,463 MiB, driver 592.01, NVIDIA Container Toolkit 1.19.0 |
| System | kernel 6.18.33.2-microsoft-standard-WSL2, Ubuntu 24.04.3, systemd as PID 1, cgroup v2 with the systemd driver, WSL NAT networking |
| Docker | Engine 28.3.3, Compose 2.39.1, buildx 0.26.1, the classic `overlay2` image store, runtimes `runc` and `nvidia` |
| Rootless prerequisites | `docker-ce-rootless-extras` 28.3.3, `uidmap`, slirp4netns 1.2.1, nftables 1.0.9 (no `passt`) |
| Toolchain | Node 22.18.0 (to be replaced by 24, R-19), uv 0.8.22, ruff 0.16.10, shellcheck 0.9.0, jq 1.7, Python 3.12.3; gitleaks not yet installed (`make tools` installs it) |
| Virtualization | KVM is available (`kvm_intel` loaded, `vmx` exposed), unused since the Author chose rootless Docker (R-21) |

## Runtime topology

### R-05. One compose file; environments differ only by their env file (ADR 0002)

- **Decision** (the Author):
  - One `deploy/compose.yaml`.
  - The make variable `ENV` names the stack: `prod` and `dev` on the 5090 host, and `dev-cpu` on the agents' engine. `local` is retired, and the Makefile defaults to `ENV=prod`.
  - Each env file sets `H4_STACK` (the stack) and `H4_ENV` (the class: `prod`, or `dev` for both dev stacks).
  - Whatever the env file selects (an image variant through a compose profile, a dev-only switch) counts as configuration (Clarifications 2026-10-07; FR-017).
- **Rationale**: exactly one topology to review and to ship to spec 001's VM. A stack's identity sits in one file the policy gate can inspect.
- **Alternatives**:
  - Per-environment override files: drift.
  - Separate CPU and GPU compose files: two topologies.
  - Local Kubernetes: weight with no requirement behind it.

### R-06. An internal-only network, with edge as the only publisher (ADR 0021)

- **Decision**:
  - Every service joins `internal` (`internal: true`).
  - `edge` (nginx-unprivileged) alone joins a bridge to publish on 127.0.0.1.
  - `gateway` alone joins `egress`.
- **Rationale**:
  - FR-040 is then enforced by the network, not only by each vendor's off-switch.
  - Published ports have one audit point (US1-3).
  - Spec 001's tunnel attaches to `edge`.
  - The cost is one 15 MB container.
- **Still to confirm** (check 2 stopped before its network tests): that an internal-only container can't reach the internet, and whether it can publish a port. The design assumes it can't, which is why `edge` joins a second network. The first stack task runs both tests.
- **Alternatives**:
  - Publishing Grafana and Langfuse directly, relying on their switches: unenforced.
  - A host firewall: crosses stacks, and is the Author's machine-wide state.

### R-07. Observability backends: Prometheus 3 and Loki 3 over OTLP, no Tempo (ADRs 0004, 0021)

- **Decision**:
  - The OTel collector (contrib) receives OTLP and fans out: traces to Langfuse, metrics to Prometheus's OTLP receiver, logs to Loki's.
  - Third-party services' logs stay in Docker's `local` log driver.
  - Metrics export every 10 s, so spend reaches the dashboard in about 25 s.
- **Rationale**:
  - Langfuse already holds every trace (FR-027), so a second trace store would double the disk for no requirement.
  - Shipping third-party container logs would mount the host's log directory, which crosses stacks (FR-020).
  - OTel's default 60 s export interval would miss the 60 s requirement.
- **Alternatives**:
  - Tempo: a duplicate trace store.
  - Mimir, VictoriaMetrics: no need at this scale.
  - Alloy: collector-contrib already redacts and authenticates.
  - Grafana Cloud: payloads would leave the local tier.

### R-08. Langfuse v4, not v3

- **Decision**: Langfuse **v4.54.0** (web and worker), with Postgres 17.11, ClickHouse 26.8 LTS, Valkey 8.1, and SeaweedFS (R-09).
- **Evidence**:
  - Self-hosted v4 has been generally available since 2026-07-29.
  - v3 receives security fixes only until January 2027, so a new deployment on v3 would need a migration within months.
  - **Langfuse's own compose at v4.54.0** (check 2) pins:
    - `clickhouse/clickhouse-server:25.12`, its minimum;
    - `redis:7`;
    - `postgres:${POSTGRES_VERSION:-17}`;
    - Chainguard's MinIO (`cgr.dev/chainguard/minio`).

    It pulls its own images from `docker.langfuse.com`. ghcr.io carries the same digests, and is on the sandbox allowlist.
  - **ClickHouse 26.8 LTS, not 25.12:** 25.12 is a regular release, past ClickHouse's support window. 26.8 is the newest long-term-support line and meets Langfuse's minimum. The end-to-end trace checks test the pairing on every run, and 25.12 is the fallback if 26.8 misbehaves.
  - **Valkey instead of `redis:7`:** BSD-licensed, and Redis-7-compatible.
- **Configuration**:
  - Headless initialization (`LANGFUSE_INIT_ORG_*`, `LANGFUSE_INIT_PROJECT_*`, `LANGFUSE_INIT_USER_*`) creates the project and the keys the collector uses, so no UI step stands between `make up` and the first trace (SC-001).
  - `TELEMETRY_ENABLED=false` and `AUTH_DISABLE_SIGNUP=true`.
  - The web and worker containers get heap caps.
  - ClickHouse gets a low-memory profile and a 4 GiB limit; Langfuse's published minimums are sized for production scale, not test traffic.
- **Variables Langfuse 4.54.0 reads** (names only, from check 2; the agent sandbox can't reach GitHub):
  - Web and worker: `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `DATABASE_URL`, `SALT`, `ENCRYPTION_KEY`, `TELEMETRY_ENABLED`, `CLICKHOUSE_{URL,MIGRATION_URL,USER,PASSWORD,CLUSTER_ENABLED}`, `REDIS_{HOST,PORT,AUTH}`, `LANGFUSE_S3_EVENT_UPLOAD_*`, `LANGFUSE_S3_MEDIA_UPLOAD_*` (with `..._INTERNAL_ENDPOINT` on web), and `LANGFUSE_INIT_{ORG,PROJECT,USER}_*`.
  - Off in this stack, because each one reaches out or calls a model:
    - the in-app agent: `LANGFUSE_IN_APP_AGENT_ENABLED=false`, with its sandbox and AWS keys unset;
    - the AI features: every `LANGFUSE_AI_*` key unset;
    - LLM connections: `LANGFUSE_LLM_CONNECTION_WHITELISTED_*` empty;
    - Langfuse's own email: `SMTP_CONNECTION_URL` and `EMAIL_FROM_ADDRESS` unset;
    - batch export: `LANGFUSE_S3_BATCH_EXPORT_ENABLED=false`;
    - other blob backends: `LANGFUSE_USE_AZURE_BLOB` and `LANGFUSE_USE_OCI_NATIVE_OBJECT_STORAGE` unset;
    - the MCP keys: unset;
    - cloud credentials: no `AWS_*` key in Langfuse's containers.
  - The internal network blocks all of these anyway; the settings are the first layer. The first stack task verifies how Langfuse reads cost from the gateway's spans.
- **Alternatives**:
  - v3: about to lose security fixes.
  - Langfuse Cloud: payloads would leave the local tier.
  - Phoenix: weaker evaluation workflow for Phase 1.

### R-09. SeaweedFS as Langfuse's S3 store (ADR 0022; the Author)

- **Decision**:
  - SeaweedFS (Apache-2.0) in single-container S3 mode (`weed server -s3`), on `internal`, unpublished.
  - An entrypoint renders the S3 identity file from the env file and creates the `langfuse` bucket idempotently.
- **Evidence**:
  - MinIO stopped publishing community images in October 2025.
  - The Docker Hub images now refuse pulls, and Quay stops at a September 2025 build.
  - The repository was archived on 2026-04-25.
- **Rationale**: actively maintained, Apache-2.0, official images, one container.
- **Check 2 found:**
  - MinIO's official images answer HTTP 401 on Docker Hub and Quay alike.
  - Langfuse's own compose has moved to Chainguard's MinIO. That strengthens Chainguard as the documented swap, though it doesn't change the Author's choice.
  - The tag lookup for `chrislusf/seaweedfs` matched no plain version tag. `make pin-images` lists the repository's tags in the first stack task. If no maintained release tag exists, the Author decides between Chainguard's MinIO and building SeaweedFS from source.
- **Known risks**:
  - Langfuse treats non-MinIO stores as community-supported, so the stack's own end-to-end trace checks every run (quickstart US1, breach-test trace assertions) are its test: write, read, list, and the retention delete.
  - The exact health path of the S3 port in the pinned version is checked at pin time. The fallback is the master's `/cluster/status`.
  - Spec 000 uploads no media, so browsers never reach the store.
- **Alternatives**:
  - Chainguard's MinIO: the same server Langfuse tests, but only `latest` is free, and the image depends on Chainguard keeping it free. This is the documented swap.
  - Garage: AGPL-3.0, with layout and key setup at first start, and thinner S3 coverage.
  - RustFS: its own documentation advises against production use.
  - The last MinIO image: unpatched.

### R-10. Grafana's audit panel reads the store, not telemetry

- **Decision**:
  - A read-only Postgres role `grafana_ro` can SELECT only `gateway.audit_log` and the view `gateway.v_state`.
  - Grafana uses it for the FR-034 audit panel.
  - Spend, state, and request panels read Prometheus; logs come from Loki.
- **Rationale**:
  - The audit log is enforcement data. When telemetry is down, the panel must still show who reset what and why.
  - A view and SELECT grants on one schema keep Grafana from writing anything.
- **Alternatives**:
  - Audit events through Loki only: empty during a telemetry outage.
  - Grafana with the gateway's own database user: write access the dashboard doesn't need.

## The gateway

### R-11. Fastify 5 on Node 24 (ADR 0020 for the store)

- **Decision**:
  - Fastify 5.12.5, with zod for validation, and @fastify/otel for server spans.
  - Two listeners: the api on 8080, and admin on 8081.
  - TypeScript 6.0.3, built with `tsc`, run as plain `node dist/server.js`.
- **Rationale**: a mature Node framework with schema validation; `inject()` tests that need no socket, so they work in the sandbox; and official OTel instrumentation.
- **Alternatives**:
  - Hono 4: lighter, but weaker Node-native instrumentation.
  - Express: no validation, and an older async model.

### R-12. Bedrock through Converse; Claude Haiku 5.5 (the Author)

- **Decision**:
  - The AWS SDK v3 `ConverseCommand` in us-east-1, with no streaming.
  - The model is Claude Haiku 5.5 if Bedrock offers it there; otherwise Claude Haiku 4.5's `us.` inference profile.
  - The Author confirms the ID with `aws bedrock list-inference-profiles` and copies its prices into the human-only `config/prices.yaml`.
- **Rationale**:
  - One request and response shape across model families, so changing the model is configuration (SC-006).
  - Usage and `latencyMs` come back with every answer.
  - Haiku 5.5's price hadn't been published by 2026-10-08, so the interview option's "the cheapest Claude by list price" is unverified (the correction under [the interview table](#the-plan-interview-word-for-word)). Haiku 4.5's list price is $1 per million input tokens and $5 per million output tokens. Whichever model Bedrock serves, the Author copies its price into `config/prices.yaml` (tasks.md T105), and the gateway refuses a paid model without one.
  - No streaming: providers can't be switched mid-stream, usage arrives at the end, and the contract test is simpler.
- **Alternatives**:
  - InvokeModel: a body mapper per model family.
  - A Claude-only client: outside the SDK's credential chain.
  - Streaming hello: no user value yet.

### R-13. Budget periods in UTC; integer micro-USD; reservation-based admission (the Author: UTC)

- **Decision**:
  - Days and months are UTC (Clarifications 2026-10-08; FR-031).
  - Money is integer micro-USD in `bigint`.
  - A metered call reserves its maximum cost in the admission transaction, and the level check is on spent plus reserved.
- **Rationale**:
  - UTC matches AWS billing and has no daylight-saving edges.
  - Integers make the thresholds exact.
  - Reservations bound the overshoot to 4 calls in flight × the maximum per call. The maximum, with the 2,000-character input cap counted as 2,000 tokens and 128 output tokens, is about $0.0026 at Haiku 4.5's list price. Haiku 5.5's price hadn't been published (R-12).
  - A reservation that expires without a commit is charged its maximum by a sweep, so the meter fails safe (data-model.md §2.4).
- **Alternatives**:
  - The Author's local time zone.
  - `numeric`: fine, but clumsy in TypeScript.
  - Checking spent only: a burst overshoots by the whole burst.

### R-14. Human-only paths: gates only (ADR 0017; the Author)

- **Decision**:
  - Human-only, added by spec 000's closing enforcement patch:
    - `tools/gates/**`;
    - the other gate definitions: `evals/agent-config/**` and `.gitleaks.toml`;
    - the FR-039 boundary, `deploy/agents-engine/**`;
    - agent tool configuration, `.mcp.json`;
    - cost configuration, `config/prices*`, next to the already-protected `config/budgets*` and `config/alert*`.
  - The Makefile, `deploy/scripts/**`, `scripts/operator.py`, and `.devcontainer/**` stay agent-editable and are reviewed.
  - Every merge-request note lists changes to anything that runs in the Author's terminal first.
- **Rationale**: the Author chose "Gates only", which read: "Only tools/gates/** becomes human-only, and you run the gate directly. The Makefile and stack scripts stay agent-editable and are checked in review. Faster to change, but a branch's Makefile could run unreviewed code in your terminal."
  - **The plan's reading:** the other files listed above are gate definitions or the FR-039 boundary, so they count as gates. The approved session plan named each of them for the Author to veto, and none was vetoed.
  - **The accepted risk:** the Author also answered "No" to a prod guard ("Prod can run from any branch; you're trusted to know what you started."). Together, the two answers are an accepted risk, mitigated by review, the note's heading, the compose policy, and the clean-room gate, which never runs project code outside a container.
- **Alternatives**: a human-only Makefile and `tools/**`, which design C recommended and the Author declined.

### R-15. Same-day renewal grants a fresh $2 at once (the Author)

- **Decision**:
  - A renewal makes $2 available at once, still inside the $5 daily ceiling.
  - Each UTC day's `fallback_day` meter row carries `allowance_micro`, which starts at 2,000,000.
  - A renewal sets it to today's fallback spend plus reservations plus 2,000,000, so exactly $2 more is available from that moment, on any day.
  - Warnings fire at 70% of each $2 grant.
- **Rationale**: the Author chose "Fresh $2 immediately", which read: "Renewal grants another $2 today, still inside the $5 daily ceiling." The plan's reading measures the $2 from what is already spent or reserved. A per-day count of renewals would leave $4 available after a renewal on a later day, when nothing had been spent yet. FR-030 states the rule.
- **Alternatives**: a renewal re-arms fallback only for the next day. Design B recommended it; the Author declined.

### R-16. The operator credential: a bearer token per stack (the Author)

- **Decision**:
  - A 256-bit token per stack, `h4op_<stack>_` followed by 43 base64url characters, kept in `~/.config/h4reet-ai/operator/<stack>.token` (0600) outside the repository.
  - The gateway keeps only its SHA-256 and checks the prefix before hashing.
  - The CLI is stdlib Python run through `PY_HOST` (`python3 -I -B` with its bytecode cache under `/dev/null`, R-35), so the credential never passes through `node_modules`, `dist/`, or a planted `__pycache__`, which agents can write and git doesn't show.
  - The dev-cpu token is a public dummy committed in `dev-cpu.vars`, and prod refuses it.
- **Alternatives**:
  - An SSH or FIDO2 signature: stronger, about 80 more lines, revisitable later.
  - A Node CLI from `dist/`: it would run unreviewed code with the credential.

### R-17. The runtime AWS identity (the Author, narrowed by the plan)

The Author chose "Narrow permission set (Recommended)", which read: "A dedicated SSO permission set allowing only bedrock:InvokeModel on the one model; you create it in IAM Identity Center." The dedicated Identity Center user below is the plan's addition, for the Author to confirm or decline.

- **Decision**:
  - The Author creates, in IAM Identity Center, a permission set allowing only `bedrock:InvokeModel` on the one inference profile and the foundation models it routes to.
  - That set is assigned to a **dedicated Identity Center user** (`h4reet-runtime`).
  - `make aws-login` runs `aws sso login` with `HOME` pointed at `~/.config/h4reet-ai/aws-home`, so that user's config and SSO cache live apart from the Author's own.
  - That directory is mounted read-only into prod's gateway only. Non-prod stacks mount an empty directory.
- **Rationale**: an SSO access token can fetch credentials for *every* permission set its user is assigned. Mounting the Author's own `~/.aws` would hand any gateway build (including one from an agent's branch, since there is no prod guard) the Author's whole AWS access. A dedicated user makes the narrow permission set the whole of what the container can reach. IAM changes are human actions under the constitution; nothing here is a resource this spec creates.
- **Consequences**:
  - The read-only mount means the SDK can't refresh the SSO token. The gateway raises `credentials_expiring` 2 h before expiry, and the Author runs `make aws-login`.
  - Prod's gateway reaches `portal.sso.us-east-1.amazonaws.com` to exchange the token for role credentials, which is listed in the disclosure.
- **Alternatives**:
  - The Author's own profile, mounted read-only: too broad, as above.
  - IAM user access keys: forbidden by FR-013.

### R-18. Alerts: a transactional outbox; Telegram, then SMTP (ADR 0005)

- **Decision**:
  - Crossings insert an outbox row in the same transaction that degrades the stack.
  - A dispatcher sends Telegram (the raw Bot API) and email (nodemailer over TLS) independently, with retries at 5, 15, 30, 60, and 120 s.
  - Each alert is deduplicated per stack, kind, meter, and period, and there is a daily reminder at 09:00 UTC.
  - Dev's alerts carry a prefix and go to stand-in receivers, except the Author's `--delivery real` run.
  - Incident drafts come from a template, with no model call.
- **Rationale**:
  - Degradation never waits on delivery, and a crash can't lose an alert.
  - "Detection never involves a model" (lifecycle.md).
  - SMTP from a dedicated alerts mailbox: the Author chose "SMTP, dedicated mailbox (Recommended)" on 2026-10-07 (spec Clarifications).
- **Alternatives**:
  - Sending inline: a crash loses the alert, and a slow channel delays the request.
  - SNS or SES: cloud resources.
  - A bot framework: unneeded.

## Development environment and governance

### R-19. Node 24 LTS everywhere

- **Decision**: Node 24 (24.21.0 at the time of writing) on the host through nvm, which the host already used (the default Node stays, with the Claude Code installed under it), in the devcontainer from the digest-pinned official Node image, and as the gateway image's base. `@types/node` 24.19.1.
- **Rationale**:
  - Node 22 leaves maintenance in April 2027, within this project's first year.
  - Every package in the gateway's list supports 24.
  - The host is on 22.18.0, so `make toolchain-check` fails until the Author installs 24. That's the check doing its job.
- **Alternatives**: Node 22, which would need an upgrade spec within six months.

### R-20. Agent sessions run on WSL with the devcontainer's tool versions (ADR 0018; the Author)

- **Decision**:
  - Agents keep running on WSL under the full bubblewrap sandbox.
  - The devcontainer defines every tool version. `make tools` installs the same versions on the host, where agents can't write, and `make toolchain-check` fails on drift.
  - US3-1 was amended to match.
- **Rationale**: bubblewrap inside Docker needs a custom seccomp profile (namespace `clone`, `mount`, and `pivot_root` need CAP_SYS_ADMIN under the default profile) and an unmasked `/proc`. The alternative is Claude Code's weaker nested sandbox, where sandboxed commands see the container's processes. Either weakens one boundary to add another.
- **Reading of the constitution**: "a devcontainer defines the single toolchain used by humans, agents, and CI". The devcontainer defines it; agents use that toolchain on the host, enforced by the check.
- **Alternatives**: Claude Code inside the devcontainer, which has the sandbox costs above.

### R-21. The agents' engine: rootless Docker under its own user (ADR 0016; the Author)

- **Decision**: rootless Docker under a dedicated user `h4agents`, set up once with sudo. Its parts:
  - nftables `skuid` rules that allow only the egress proxy;
  - `/dev/dxg` closed to the user;
  - `/mnt/c` closed by `umask=077`;
  - a read-only, masked view of the working tree at `/run/h4agents/tree`;
  - a Docker authorization plugin refusing privileged mode, devices, `--gpus`, added capabilities, host namespaces, and binds outside the tree, the models, and the engine's state directory;
  - a stdlib CONNECT proxy that allows exactly the sandbox's allowlist;
  - its API on `198.18.0.1:2376` with mutual TLS.
- **Check 2's host facts:**
  - **Already in place:** systemd is PID 1, cgroup v2 is on, and `docker-ce-rootless-extras`, `uidmap`, slirp4netns, and nftables are installed. `198.18.0.0/15` is unused. The Author's home is mode 750.
  - **What the setup must change:**
    - `/etc/subuid` and `/etc/subgid` hold ranges only for the Author, so `h4agents` gets its own range at setup;
    - `/dev/dxg` is mode 0666, open to every user;
    - `/run/WSL`'s interop sockets are 0777, and the D-Bus system bus is 0666;
    - `/mnt/c` is mounted with no `umask`, so every Linux user can read it.

    Each of these is a limit the setup or the admission plugin must hold.
  - **Seeding:** the host's Docker uses the classic `overlay2` store, so the Author switches it to the containerd image store before the first seed, and prunes first while C: is short of space (R-32).
- **Rationale**:
  - The Author chose "Rootless Docker, own user" over the KVM VM that design C recommended. That option read: "A second Docker daemon under a separate Linux user. No VM, but it shares the host's kernel. It also needs per-user firewall rules to limit internet access, a permission change to keep it out of your Windows files, and its own fix to keep it off the GPU."
  - Over the VM, it saves QEMU and about 12 GB of RAM while running.
  - It replaces one Consequence of the accepted ADR 0015, "The plan chooses the engine: a VM, or a devcontainer on an isolated runtime". ADR 0016 records that, as ADR 0014 did for ADR 0013.
  - Without the authorization plugin, a container could bind `/run/WSL`, Windows interop, and reach the Windows user's files. The plugin is what closes that.
- **Consequences**:
  - The kernel is shared, so a kernel exploit from a container reaches the host as `h4agents`.
  - The plugin is part of the boundary.
  - Matrix stage E proves every FR-039 limit.
  - The VM stays the documented upgrade.
- **Alternatives**:
  - The KVM VM: its own kernel, a QEMU install, and 12 GB while running.
  - A separate WSL distro: it shares the utility VM's kernel and network namespace, and sees the GPU device.
  - Sysbox: it must be installed into, and restart, the production engine, and WSL2 isn't a listed host.

### R-22. The sandbox opening: one IP entry, a relay, and mutual TLS

- **Decision**:
  - One `sandbox.network.allowedDomains` entry, `198.18.0.1:2376`, on a dummy interface.
  - `deploy/agents-engine/docker-relay` runs `socat` through the sandbox proxy and exposes it as `DOCKER_HOST=tcp://127.0.0.1:2376`.
  - TLS client certificates sit in a directory agents can read but not write.
- **Evidence** (design C, from Claude Code 2.1.293):
  - `allowUnixSockets` is macOS-only.
  - `allowAllUnixSockets` lifts the block on every Unix socket, including `docker.sock`.
  - `allowedDomains` entries parse as `host[:port]`, IP literals included, and the proxy refuses names that resolve to the host's own addresses unless that address and port are listed.

  Confidence: high on the key name and syntax, medium on the proxy's literal handling. Matrix row E9 and `claude doctor` verify both.
- **Rationale**: the opening reaches that engine and nothing else, as FR-039 requires. Docker's exec, attach, and BuildKit streams don't go through an HTTP proxy, so the relay keeps them working.
- **Alternatives**: the two socket settings above, both rejected.

### R-23. The Author's clean-room gate (ADR 0017)

- **Decision**: `tools/gates/gate <ref>` runs in three steps.
  1. Export the tree with `git archive`.
  2. Run project code (lint, tests, scaffolds, matrix stage H) in the devcontainer image, with `--network none` after `npm ci --ignore-scripts`.
  3. Run human-only gate code on the host: the policy, `corpus-check` with the denylist, gitleaks, the image build on the engine, and matrix stage E.

  It is run directly, not through make, because a planted `GNUmakefile` would shadow the Makefile.
- **Rationale**: session 1 found, one at a time, holes where the Author's terminal ran agent-written code git didn't show: a cache in the repository, `.venv`, `uv.toml`. Running project code only inside a container from an exported tree closes the whole class.
- **Alternatives**:
  - Per-tool flags in place: whack-a-mole.
  - Trusting the working tree: the holes above.

### R-24. gitleaks in a plain git hook and a content hook

- **Decision**:
  - gitleaks 8.30.1, from its pinned ghcr image.
  - It runs as `.claude/git-hooks/pre-commit`, as a PreToolUse content check on Write and Edit, in `make secrets`, and in publish-check.
  - It has rules for `h4op_prod_` and `h4op_dev_` tokens, and allowlists only `deploy/env.agents/dev-cpu.vars`.
- **Rationale**: nothing is fetched from GitHub, and nothing agent-writable runs at commit time. FR-008's "secret-pattern content" becomes a hook.
- **Alternatives**:
  - The pre-commit framework: its store must be writable in the sandbox, and it obeys a working-tree config.
  - detect-secrets: weaker rules for these shapes.

### R-25. The post-edit hook never runs project code (FR-009)

- **Decision**: TypeScript, JSON, YAML, and Markdown are linted by a human-only lint toolchain installed outside the repository (`~/.local/share/h4reet/lint-node`: eslint 10.12.0, typescript-eslint 8.71.1, typescript 6.0.3, prettier 3.9.9) with its own configs.
- **Rationale**: hooks run outside the sandbox. Running the repository's `node_modules` or its JavaScript config would let an agent's file execute unsandboxed. The existing hook already keeps to ruff and shellcheck for that reason.
- **Alternatives**: leaving TypeScript out of the hook, which fails FR-009.

### R-26. Agent-configuration evals: a static tier and a behavioral tier (FR-011)

- **Decision**:
  - The static checks run everywhere.
  - The behavioral cases run headlessly in the Author's terminal on the Team plan, about 12 cases × 3 runs, asserted on outcomes (the transcript, the diff, the audit log, `main`'s SHA).
  - They are triggered by a hash of the governance files and the Claude Code pin.
  - The history is committed (SC-008).
- **Rationale**: it measures what happened, not how the model phrased it. Runs abort on API-key auth, so spend stays on the Team plan (FR-037).
- **Alternatives**:
  - An LLM judge: subjective, and it costs money.
  - Static checks only: they can't see behavior.

### R-27. The breach test as a client-side orchestrator plus a probe container

- **Decision**:
  - `evals/breach.py` runs where `make` runs, the Author's terminal or an agent sandbox, and drives lifecycle steps with `docker compose` on the current engine.
  - Each HTTP assertion runs in a one-off `breach-probe` container on the stack's internal network.
- **Rationale**: on the agents' engine, stack ports are published on the host's loopback, which the sandbox's proxy refuses, so the sandbox can reach nothing but the Docker API. The probe sees what the stack sees. This reconciles design B's compose-driven steps with design A and C's in-network runs.
- **Alternatives**:
  - Opening stack ports to the sandbox: a second opening, against FR-039's "nothing else".
  - Running everything inside a container: it would need the Docker socket inside, which the plugin refuses.

### R-28. Dev-time usage on the dashboard (FR-037)

- **Decision**:
  - The FR-037 panel shows the agent-config eval history (tokens, notional cost) and Claude Code's own OTel metrics.
  - Claude Code's metrics are exported to prod's collector through edge's x004 port on 127.0.0.1, with no prompts (`OTEL_LOG_USER_PROMPTS` unset, logs exporter off).
- **Rationale**: the Team plan is a flat fee, so "cost" is notional, from Claude Code's own accounting. It's labelled that way and kept apart from the production meter. Claude Code's own process isn't sandboxed, so it reaches 127.0.0.1. Agents' Bash commands still can't.
- **Alternatives**:
  - The Anthropic Console's usage pages: outside the stack, and not available for a Team seat's local sessions.
  - Nothing: fails FR-037.

### R-29. Docker Hub stays anonymous (the Author)

- **Decision**:
  - No Docker Hub login.
  - `make pull` pulls Docker Hub images one at a time, with 5, 15, and 45 s backoff, and names an HTTP 429. A cold `make up` reports a rate-limit failure by name.
- **Evidence**: Docker's published anonymous limit is 100 pulls per 6 hours per IP (its April 2025 plan for 10 an hour never took effect). Check 2 read the live allowance from the registry's headers as `100;w=3600`: 100 per hour. A cold start needs 5 Docker Hub pulls.
- **Alternatives**: a free account with a read-only token. It doubles the allowance, but adds a credential file to deny.

### R-30. Payload sampling is dev only (the Author)

- **Decision**:
  - `TELEMETRY_PAYLOAD_SAMPLING=on` is allowed only when `H4_ENV=dev`. Prod refuses it in preflight and at gateway startup.
  - When on, payloads go only on spans that opt in, after secret redaction.
- **Rationale**: FR-029's "explicitly enabled", made stricter; a production payload never leaves the process in spec 000.

### R-31. The host stacks' real env files live outside the repository

- **Decision**:
  - Prod's and dev's real env files are `~/.config/h4reet-ai/env/<stack>.env`, mode 0600 in a 0700 directory, made by `make init-env`.
  - `deploy/env/` stays in the tree, empty, and denied to agents as a tripwire. Preflight refuses to start while any env file sits in the working tree.
- **Rationale**:
  - FR-032 keeps the alert mailbox's credentials "in a local environment file outside the repository and outside agent context". The option the Author chose on 2026-10-07 read: "its app password lives in a local env file outside the repo and agent context". A gitignored file inside the working tree is outside version control, but not outside the repository's directory.
  - Moving every host-stack secret there also keeps it out of `git clean -fdx`, out of copies of the working tree, and out of anything that scans it.
  - The operator tokens and the runtime AWS identity already live in `~/.config/h4reet-ai/`, so the early patch's single deny on that directory covers every secret.
- **Alternatives**:
  - `deploy/env/` as design A had it: outside version control only.
  - Splitting the alert secrets into a second file: two files for one stack, and a harder preflight.

### R-32. Host disk space is the Windows drive's

- **What happened** (2026-10-08): check 2's 18.6 GB model download stopped after 2.6 GB with `curl: (23) Failure writing output to destination`. Then `tee` reported `Read-only file system`, and WSL went down with every session and agent running in it.
- **Why:**
  - The distro's disk is a 650 GB virtual disk, `ext4.vhdx`, on the Windows C: drive (952 GB). Inside WSL, `df /` reported 375 GB free, which is free space in the virtual disk, not on C:.
  - C: had about 2.6 GB left. When it filled, the virtual disk couldn't grow, ext4 got write errors and remounted read-only, and WSL failed.
  - Check 1 had measured only the ext4 figure.
- **Decision**:
  - **Preflight.** `make up`, `make pull`, `pull-models.sh`, and `deploy/agents-engine/engine.sh seed` check both the drive holding the `ext4.vhdx` (`df /mnt/c` by default; `H4_VHDX_MOUNT` names another) and ext4, for the bytes they will write plus a 20 GB margin. They refuse, naming both figures, rather than start.
  - **Timing.** Heavy runs (big downloads, model loads, stack bring-ups) are their own step, taken when no agents are working and the branch is committed.
- **State and options** for the Author:
  - **Freed:** the Author pruned Docker's build cache (76 GB) and unused images (20 GB), cleared the home caches, ran `fstrim`, and compacted the virtual disk with `diskpart`. C: went from 0 to 129 GB free, and WSL now holds 461 GB.
  - **Moving the distro:** D: has 250 GB free. `wsl --manage <distro> --move` would put the distro there, but only once the virtual disk fits. It holds 461 GB after the cleanup, so a move needs ComfyUI's models or Docker's volumes to go elsewhere first. With 129 GB free on C:, it isn't needed.
  - **Reclaiming space:** deleting inside WSL doesn't shrink the virtual disk. Giving the space back to C: takes `fstrim`, `wsl --shutdown`, and `diskpart compact vdisk`.
  - **Not recommended:** sparse virtual disks, which current WSL disables because of data-corruption reports.
  - **What spec 000 needs:** about 50 GB beyond today's use: 10 GB of images, 19 GB of models, the engine's copy of the images, and data.

### R-33. Host stacks run the commit they were started from; rollback is one command (review, 2026-10-08)

- **Decision:**
  - `make up` for prod and dev exports the commit (`REF`, default `HEAD`) with `git archive` into `${H4_STATE_DIR}/tree/<sha>`, builds the images from it, and runs its compose file and configuration. The run file names the commit and the one before it ([contracts/env-files.md §12](contracts/env-files.md#12-the-run-file-host-stacks)).
  - `make up REF=<previous sha>` is the rollback. The gateway refuses a store whose schema is newer than its migrations (exit 78), so a rollback across a migration fails closed. The quickstart rehearses it on dev.
- **Rationale:**
  - Two reviewers found that prod reread `config/` and `deploy/` from the shared working tree on every restart, so it ran whatever branch an agent had checked out. That isn't "you're trusted to know what you started" (R-14).
  - `make up` never rebuilt the images, so a stale image could certify code the branch didn't contain.
  - The constitution's Development Workflow step 6 asks for a rollback that is "rehearsed and runnable as one command", and the spec hadn't named the clause.
- **Alternatives:**
  - Recording the live-tree behavior as an accepted risk: rejected, because it contradicts the decision it would rest on.
  - A prod guard: the Author declined one (R-14).
  - Naming step 6's rollback clause as a deviation: unnecessary once the export exists.

### R-34. Every deny lands before the risk it guards; four patches (review, 2026-10-08)

- **Decision:** plan §15's rule. A deny ships in a patch applied before its risk exists:
  - **the early patch** (Phase 2): credentials, the files prod reads, the code the Author runs, and secret scanning;
  - **the governance patch** (Phase 5): the gate and the agent-config evals;
  - **the closing patch** (Phase 8): only what is risky at the end.

  The fourth patch, the config patch (Phase 2), delivers `budgets.yaml` and `alerts.yaml` and carries no deny.
- **Rationale:** the same mistake surfaced three times in one round. `/speckit-analyze` found the credential denies after the first secrets. The reviewers found the config denies after the first paid route, and the gitleaks configuration agent-writable while the hooks obey it.
- **Alternatives:** one patch at the end, as first planned. Rejected, because each gap was real for several phases.

### R-35. Python in the Author's terminal ignores bytecode too (review, 2026-10-08)

- **Decision:** `PY_HOST := python3 -I -B -X pycache_prefix=/dev/null`, by script path and never with `-m`, for every Python the Author's terminal runs. Phase 1's review replaced the first form, `pycache_prefix=$(mktemp -d)`.
- **Rationale:**
  - `-I` keeps out `PYTHON*` variables, the user's site directory, and the working directory, but Python still loads a `__pycache__/*.pyc` whose header matches the source. An agent can write one, and git doesn't show it.
  - A reviewer reproduced it: under `-I` the planted bytecode ran instead of the source, and with a fresh, empty prefix directory the source ran.
  - `-m` would also import the package from the working directory, which `-I` can't then find.
  - **No temporary directory** (Phase 1's review). When `mktemp -d` fails, on a full or unwritable temporary filesystem, the prefix comes out as an empty string, and an empty-string prefix loads the planted file; a reviewer reproduced that too. `/dev/null` can never hold a directory, so Python finds no bytecode under it and compiles the source, and `-B` keeps it from trying to write any. Nothing is left behind, where each mktemp prefix left a directory of bytecode.
- **Alternatives:**
  - `-B` alone. It stops writing bytecode, not reading it.
  - `pycache_prefix=$(mktemp -d)`. It fails open when mktemp fails, and litters the temporary directory.

### R-36. gitleaks takes its configuration and ignore list only from the Author (review, 2026-10-08)

- **Decision:** every gitleaks call passes:
  - `--config` with the main working tree's `.gitleaks.toml`, which is human-only from the early patch on;
  - `--gitleaks-ignore-path` naming a fresh empty directory, made with a checked `mktemp -d`;
  - `--ignore-gitleaks-allow`;

  and refuses to run while a `.gitleaksignore` exists at its scan source: the scanned directory, the repository root in `git` mode, or the working directory for `stdin`, which therefore runs from a fresh empty directory.
- **Rationale:** without them, gitleaks loads a `.gitleaks.toml` from the directory it scans, honours a `.gitleaksignore` there, and skips any line marked `gitleaks:allow`. All three are agent-writable, and the hooks run outside the sandbox as the Author.
  - **The ignore flag isn't enough** (Phase 1's review). `--gitleaks-ignore-path` adds an ignore location; it doesn't stop gitleaks 8.30.1 from reading the source's own `.gitleaksignore`. A planted fingerprint suppressed a finding in `dir`, `git --pre-commit --staged`, and `stdin` modes, with the flag naming an empty directory (reproduced twice).
  - **What holds:** the early patch denies agents `./.gitleaksignore` at the root, but a source such as `docs/recordings` has no deny, so the refusal is what holds there.
  - **What the refusal refuses** (2026-10-09). The first `pre-commit` refused anything that existed. With the sandbox's mask in place, that refused every commit from a session. It now depends on where the file is.
    - **In the main tree,** the sandbox denies the path, so a session can't fill what is there. Two things that hold no entry pass:
      - `/dev/null` itself, device 1:3. The sandbox masks a denied path that doesn't exist this way while a session runs.
      - An empty regular file. A killed session leaves one at the masked path.

      A link is refused, and so is a FIFO, whose size is 0 but which gives gitleaks whatever a writer feeds it. So is anything with content.
    - **In a worktree of its own,** nothing masks the path and an agent can write it. An empty file there could be filled between the check and gitleaks' read, so anything at all is refused, as before (the hooks review).

    The matrix holds a row for each case. It meets the mask itself only when it runs inside a session, in the main tree, because making one takes a mount.
- **Alternatives:** none kept. Protecting the file alone leaves the ignore list and the inline marker.

### R-37. The agents' engine's memory cap is 16 GB (review, 2026-10-08)

- **Decision:** the `h4agents` slice gets `MemoryMax=16G`, up from 12 GB, and preflight P15 checks the summed limits against it, less 1 GiB.
- **Rationale:** dev-cpu's summed memory limits come to about 13.2 GiB with the breach probe (ClickHouse alone is 4 GiB), so at 12 GB P15 would refuse every dev-cpu start. The limits are ceilings; real use is 5–6 GB. Even with every stack at every ceiling, the host's 62 GB holds them.
- **Alternatives:** smaller memory limits on dev-cpu only, through new env keys. Rejected for now: more configuration that differs between stacks, and ClickHouse under 4 GiB is untested with Langfuse.

## Rejected for now, revisit later

- **An egress allowlist for prod's gateway** (a CONNECT proxy in front of `egress`): it would enforce FR-040's runtime flows rather than list them. It needs proxy support in the AWS SDK's HTTP handler, the Telegram `fetch`, and nodemailer. Deferred to spec 001, where the relay and edge get their own controls. **The premise needed correcting** (review, 2026-10-08). The gateway is the only service with a route out, but that route has no destination limit, and with no prod guard (R-14) prod's gateway may be built from any branch. A compromised dependency, or an unreviewed branch's gateway, could send the bot token, the SMTP password, or the SSO session anywhere. A stolen SSO session could call Bedrock outside the meter until it expires, and spec 000 has no AWS Budgets to cap that (spec 001 does); the runtime identity limits it to `bedrock:InvokeModel` on one model. **The Author decides,** in the merge-request note: accept the open route for spec 000, or ask for the allowlist now (`egress-proxy.py` is its template).
- **A human-only Makefile:** declined by the Author (R-14).
- **The KVM VM for the agents' engine:** the documented upgrade (R-21).
