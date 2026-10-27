# Architecture Decision Records

One file per decision, numbered, immutable once accepted (supersede with a new ADR). Template: Context · Decision · Alternatives considered · Consequences · Links (intent, spec, PR).

| # | Decision | Status | Spec |
|---|---|---|---|
| [0001](0001-local-first-routing-with-capped-bedrock-fallback.md) | Local-first routing with Bedrock as capped fallback | proposed | 000 |
| [0002](0002-one-compose-topology-for-every-environment.md) | Everything containerized; one compose topology for every environment | proposed | 000 |
| [0003](0003-local-compose-first-then-terraform-elevation.md) | Local-compose-first delivery, then Terraform elevation to AWS | proposed | 000, 001 |
| [0004](0004-langfuse-and-grafana-over-opentelemetry.md) | Langfuse (self-hosted, in the stack) + Grafana dashboards | proposed | 000 |
| [0005](0005-telegram-and-smtp-alerting.md) | Telegram primary / email secondary alerting; no SNS SMS | proposed | 000 |
| [0006](0006-artifact-chain-and-hooks.md) | intent.md + Spec Kit + REVIEW.md as the artifact chain; hooks as the deterministic layer | proposed | 000 |
| 0007 | One AWS account; environments separated by VM, IAM role, tag, and budget | proposed | 001 |
| 0008 | Terraform, plan-in-PR, human-gated apply | proposed | 001 |
| 0009 | Pull-based deployment to the local tier; no inbound ports; no self-hosted runners | proposed | 001 |
| [0010](0010-real-time-avatar-rig-and-art-direction.md) | Real-time 3D avatar rig (not generated video); GTA V-inspired original art direction | proposed (drafted by spec 003; avatars wait for its acceptance) | 003, Phase 2 |
| 0011 | Cloned voice for the twin, disclosed | proposed | Phase 2 |
| [0012](0012-constitution-1-0-1-spec-kit-lifecycle.md) | Constitution 1.0.1: Spec Kit 1.0.8 lifecycle order and command names | accepted | — |
| [0013](0013-local-until-publication.md) | Develop locally until publication; publish the history from its first commit | accepted (one Consequence replaced by 0014; its cleanup extended to assets by 0032, proposed) | 000, 001, 003 |
| [0014](0014-github-side-requirements-to-a-publication-spec.md) | Spec 000's GitHub-side requirements move to a publication spec (replaces one Consequence of 0013) | accepted | 000, publication |
| [0015](0015-agents-run-containers-on-their-own-engine.md) | Agent sessions run containers on their own disposable engine, never the host's | accepted (one Consequence to be replaced by 0016, proposed) | 000 |
| [0016](0016-agents-engine-rootless-docker.md) | Agents' containers run on rootless Docker under their own user, reached through one sandbox opening (replaces one Consequence of 0015) | proposed | 000 |
| [0017](0017-clean-room-gate-and-human-only-gate-paths.md) | A clean-room gate, and gate code only the Author runs | proposed | 000 |
| [0018](0018-agent-sessions-on-wsl.md) | Agent sessions run on WSL under the full sandbox, with the devcontainer's tool versions | proposed | 000 |
| [0019](0019-llama-cpp-model-server.md) | llama.cpp's llama-server as the model server, on one build for GPU and CPU | proposed | 000 |
| [0020](0020-gateway-state-store-and-meter.md) | The gateway's state store is its own Postgres, and the meter counts integer micro-USD | proposed | 000 |
| [0021](0021-internal-network-prometheus-loki-edge.md) | Prometheus and Loki on an internal-only network, with edge as the only publisher | proposed | 000 |
| [0022](0022-seaweedfs-for-langfuse.md) | SeaweedFS as Langfuse's object store, because MinIO's community images are gone | proposed | 000 |
| [0023](0023-claude-code-pin-is-a-floor.md) | Claude Code's pin is a floor: a newer host warns, and the evals record the version they ran (replaces one Decision point and one Consequence of 0018) | proposed | 000 |
| [0030](0030-media-license-and-ai-mark.md) | The assets' media license (all rights reserved, viewing and linking welcome) and the AI-likeness mark | proposed | 003 |
| [0031](0031-assets-in-plain-git.md) | Assets in plain git, under fixed roots, served under content-derived names, with a 500 MB history cap | proposed | 003 |
| [0032](0032-pre-publication-cleanup-for-assets.md) | ADR 0013's pre-publication cleanup extends to an asset that locates the Author or breaks a license (extends one Decision of 0013) | proposed | 003 |
