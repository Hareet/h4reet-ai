# ADR 0019: llama.cpp's llama-server as the model server, on one build for GPU and CPU

Status: proposed, 2026-10-08 · Spec: 000 (FR-014, FR-018, FR-019, FR-021; SC-001, SC-005; User Story 1 scenario 1; User Story 5)

## Context

FR-019 asks for a local model server with an OpenAI-compatible endpoint, and for images that support the RTX 5090's GPU architecture. FR-039 needs the same stack on a CPU-only engine, so the server must also run on CPU with the same behavior.

The prod model is Qwen3-30B-A3B-Instruct-2507, quantized to GGUF Q4_K_M. It is about 18.6 GB and needs about 22 GB of VRAM at 4 slots of 8K context. The dev and engine stand-in is Qwen2.5-0.5B-Instruct, Q4_K_M, about 0.5 GB (491,400,032 bytes).

Hardware check 1 (2026-10-07) measured the download at 786 Mbps, so the 18.6 GB model takes about 3.2 minutes. That keeps SC-001's 10 minutes achievable.

## Decision

- Server: llama.cpp's `llama-server`, from `ghcr.io/ggml-org/llama.cpp`, build 11459 for both variants.
  - GPU: `server-cuda-b11459` (CUDA 12.8), profile `gpu`.
  - CPU: `server-b11459`, profile `cpu`.
  - Both answer at `model-server:8080/v1` and expose `/health` and `/metrics`. Digests are in `deploy/images.lock`.
- Flags for both: `--jinja --metrics --no-webui --no-slots`, and the model alias. No `-v`, because verbose logs carry prompts. Never `-hf`, because the server must not download at runtime. `--no-slots` hides the in-flight prompts that a slots endpoint would show.
- GPU run: `-c 32768 -np 4 -ngl 999`. CPU run: `-ngl 0 -c 8192 -np 2`.
- `/health` returns 503 while the model loads and 200 once it is ready. The healthcheck start period is 300 seconds on GPU and 60 seconds on CPU.
- Models are pinned in `deploy/models.lock` by repository, revision, file, size, and sha256. The stand-in pin starts at revision `9217f5db` and is 491,400,032 bytes. The prod model comes from `unsloth/Qwen3-30B-A3B-Instruct-2507-GGUF` at revision `eea7b2be`, 18,556,686,752 bytes, because neither `Qwen/` nor `ggml-org/` publishes it as GGUF (research.md R-03).
- Downloads run on the host only. `deploy/scripts/pull-models.sh` fills `H4_MODEL_DIR` on ext4, verifies sha256, and mounts the cache read-only into every stack. The engine verifies and never downloads.
- Blackwell check: on 2026-10-08, hardware check 2 ran the CUDA image with `CUDA_DISABLE_PTX_JIT=1`. The stand-in was ready in 5 s at about 300 tokens/s, which proves native kernels for the RTX 5090 (research.md R-01). No local rebuild is needed.
- Swap path: vLLM, behind the same OpenAI adapter, if concurrency ever matters. The Phase 1 evals pick the twin's final model. Changing it is a configuration change (FR-021).

## Alternatives considered

- vLLM. The best batching, but its image is about 10 GB on Docker Hub, it has no usable CPU sibling (so the engine would run different server code), and it preallocates VRAM. It is the documented swap.
- Ollama. One image for CPU and GPU, but only on Docker Hub, its model registry adds an outbound flow, and it has no Prometheus metrics.
- SGLang, TGI, and NVIDIA NIM. Heavier, with no matching CPU image, or they need an NGC account.
- Other models. gpt-oss-20b: its reasoning output complicates the contract test. Mistral Small 3.2 24B: dense, so slower.

## Consequences

- Cost: $0 cloud. Models use about 19 GB of disk, once per host. VRAM: an estimated 21.3 GiB for prod on the laptop RTX 5090's 24 GB, of which the Windows desktop holds about 0.5 GB, so about 2 GiB of headroom; and about 1.5 GB for the dev stand-in. The first stack task measures the prod figure. `-c 16384 -np 2` is the fallback (research.md R-03).
- Degraded mode: an unhealthy server fails the gateway's health check. Prod then falls back within the sub-budget (ADR 0001). Dev uses its synthetic fallback when enabled, and otherwise answers degraded with `no_fallback_in_stack`. The dashboard's model-server panel turns red (FR-028). `make up` names the failing service. On a host without the GPU runtime or enough VRAM, `make up` refuses at preflight.
- The model file and alias are configuration. Swapping them changes no code (FR-021).
- Trade-off: the prod model is 18.6 GB, so a cold start includes that download, which SC-001 counts.

## Links

- Intent: [000 intent](../../intent/000-ai-twin-portfolio.md)
- Spec: [000 spec](../../specs/000-local-foundations/spec.md) · Plan: [plan.md](../../specs/000-local-foundations/plan.md) · Research: [research.md](../../specs/000-local-foundations/research.md)
- Merge request, in place of a PR until publication: [2026-10-08 note](../merge-requests/2026-10-08-plan-000-local-foundations.md)
- Related: [ADR 0001](0001-local-first-routing-with-capped-bedrock-fallback.md), [ADR 0002](0002-one-compose-topology-for-every-environment.md), [ADR 0022](0022-seaweedfs-for-langfuse.md)
