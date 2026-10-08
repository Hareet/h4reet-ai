# ADR 0002: Everything containerized; one compose topology for every environment

Status: proposed, 2026-10-08 · Spec: 000 (FR-014, FR-016, FR-017, FR-018, FR-019, FR-020, FR-036, FR-039; User Story 1 scenarios 4 and 5; Assumptions, "Deviation: image variants")

## Context

The constitution asks for one compose definition in every environment, "with identical images and only configuration differing" (Technology Standards, Compute). FR-017 says environments "MUST differ only by an environment file."

The open question was what an environment file may select. The Author's answer, from spec.md's Clarifications of 2026-10-07, on whether an image, a compose profile, or a dev-only switch counts as configuration: "yes the env file can count as only a config change".

The agents' engine has no GPU (FR-039), so it needs a CPU model-server image. Spec.md records the image variant as a deviation from "identical images" (ADR 0015).

## Decision

- One definition, `deploy/compose.yaml`. No override files: no `compose.override.yaml`, no `deploy/.env`.
- The stack is chosen by `ENV`: `prod` (the default), `dev`, or `dev-cpu`. Each env file sets `H4_STACK` (the same value as ENV) and `H4_ENV`, the class: `prod` for prod, `dev` for dev and dev-cpu. Dev-only switches need `H4_ENV=dev`. A paid adapter needs `H4_ENV=prod`.
- Env files:
  - `deploy/env.example/prod.env.example` and `dev.env.example`: committed templates.
  - `~/.config/h4reet-ai/env/prod.env` and `dev.env`: real files, outside the repository (FR-032), mode 0600 in a 0700 directory, made by `make init-env`, never committed, denied to agents for reading and writing (FR-007). `deploy/env/` stays empty and denied, as a tripwire.
  - `deploy/env.agents/dev-cpu.vars`: committed, agent-editable, dummy credentials only. The name avoids the `*.env` deny rules, and gitleaks allowlists this one path.
- The env file selects the model server's compose profile, `gpu` or `cpu`. Both answer at `model-server:8080/v1` and come from one llama.cpp build (ADR 0019). The difference is the backend, not the server.
- Isolation (FR-020): compose project `h4reet-<stack>`, a network and a volume per project, and ports on 127.0.0.1 only, published by `edge` (ADR 0021). Ports: prod 18000–18004, dev 18100–18104, dev-cpu 18300–18304. RootlessKit publishes dev-cpu's on the host's 127.0.0.1 as `h4agents`, so host processes reach them and the sandbox doesn't (plan §1).
- Every image is pinned by tag and digest. Digests are in `deploy/images.lock`. The local gate refuses unpinned images (ADR 0017).
- Shell variables named `COMPOSE_*` or `H4_*` are refused at preflight, because they would silently override the env file.
- Prod has no branch guard. `make up ENV=prod` runs from any branch, which the Author chose.

## Alternatives considered

- Per-environment override files. Rejected: two definitions drift apart, and FR-017 asks for one.
- Separate CPU and GPU compose files. Rejected: the same drift, and a profile already selects the service.
- Local Kubernetes. Rejected: a second topology, with no requirement that asks for it.
- Model servers outside compose. Rejected: they fall outside the pins, the isolation, and the policy checks.

## Consequences

- Cost: no cloud spend. Images take about 10 GB of disk. The model cache is one read-only copy shared by every stack (`H4_MODEL_DIR`), so no stack holds its own copy of the roughly 19 GB of models.
- Pulls: images with an official copy on ghcr.io, quay.io, or ECR Public come from there. Docker Hub stays anonymous. `make pull` retries with backoff and names a rate limit (HTTP 429).
- Degraded mode: a bad env file stops `make up` at preflight, before anything starts. A failed service does not take the others down; `make up` names it.
- The "identical images" clause is a deviation, named in spec.md's Assumptions. Any new per-environment image or switch needs the same justification.
- Preflight and the compose policy check the class boundary: no dev-only switch in the prod template (FR-036). The gateway refuses the same at startup (exit 78).

## Links

- Intent: [000 intent](../../intent/000-ai-twin-portfolio.md)
- Spec: [000 spec](../../specs/000-local-foundations/spec.md) · Plan: [plan.md](../../specs/000-local-foundations/plan.md) · Research: [research.md](../../specs/000-local-foundations/research.md)
- Merge request, in place of a PR until publication: [2026-10-08 note](../merge-requests/2026-10-08-plan-000-local-foundations.md)
- Related: [ADR 0015](0015-agents-run-containers-on-their-own-engine.md), [ADR 0016](0016-agents-engine-rootless-docker.md), [ADR 0019](0019-llama-cpp-model-server.md)
