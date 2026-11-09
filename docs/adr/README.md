# Architecture Decision Records

One file per decision, numbered, immutable once accepted (supersede with a new ADR). Template: Context · Decision · Alternatives considered · Consequences · Links (intent, spec, PR).

| # | Decision | Status | Spec |
|---|---|---|---|
| [0001](0001-local-first-routing-with-capped-bedrock-fallback.md) | Local-first routing with Bedrock as capped fallback (one Decision extended by 0041; amended by 0043) | proposed | 000 |
| [0002](0002-one-compose-topology-for-every-environment.md) | Everything containerized; one compose topology for every environment | proposed | 000 |
| [0003](0003-local-compose-first-then-terraform-elevation.md) | Local-compose-first delivery, then Terraform elevation to AWS | proposed | 000, 001 |
| [0004](0004-langfuse-and-grafana-over-opentelemetry.md) | Langfuse (self-hosted, in the stack) + Grafana dashboards | proposed | 000 |
| [0005](0005-telegram-and-smtp-alerting.md) | Telegram primary / email secondary alerting; no SNS SMS (one Decision extended by 0042) | proposed | 000, 011 |
| [0006](0006-artifact-chain-and-hooks.md) | intent.md + Spec Kit + REVIEW.md as the artifact chain; hooks as the deterministic layer | proposed | 000 |
| 0007 | One AWS account; environments separated by VM, IAM role, tag, and budget | proposed | 001 |
| 0008 | Terraform, plan-in-PR, human-gated apply | proposed | 001 |
| 0009 | Pull-based deployment to the local tier; no inbound ports; no self-hosted runners | proposed | 001 |
| [0010](0010-real-time-avatar-rig-and-art-direction.md) | Real-time 3D avatar rig (not generated video); GTA V-inspired original art direction | accepted (the Author's commit 1f929db0, with the avatar caps; the room's caps from his ec2fdb87; spec 004's look to come in ADR 0037, which amends it) | 003, Phase 2, 004 |
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
| [0023](0023-claude-code-pin-is-a-floor.md) | Claude Code's pin is a floor: a newer host warns, and the evals record the version they ran (replaces one Decision point and one Consequence of 0018) | accepted | 000 |
| [0030](0030-media-license-and-ai-mark.md) | The assets' media license (all rights reserved, viewing and linking welcome) and the AI-likeness mark, which follows the record (spec 004, Amendment C1) | proposed | 003, 004 |
| [0031](0031-assets-in-plain-git.md) | Assets in plain git, under fixed roots, served under content-derived names, with a 500 MB history cap | proposed | 003 |
| [0032](0032-pre-publication-cleanup-for-assets.md) | ADR 0013's pre-publication cleanup extends to an asset that locates the Author or breaks a license (extends one Decision of 0013) | proposed | 003 |
| [0033](0033-the-rooms-stack-apps-web-vite-threejs.md) | The room's stack: `apps/web`, Vite, Three.js, no framework (0023 to 0032 are allocated on other branches: the pin-rule proposal, spec 001, and spec 003) | proposed | 002 |
| [0034](0034-content-approvals-by-hash-read-from-main.md) | Content approvals by hash, in a human-only file read from `main`, beside spec 003's likeness approvals | proposed | 002 |
| [0036](0036-the-room-composed-from-data.md) | The room composed from data: a catalog and a scene compiled into one deterministic bundle, behaviour kinds a closed list in code, plain models through one fit check, every word drawn live, and caps read from `main` (0035 is reserved on spec 002's branches, for recognition) | proposed | 004 |
| [0038](0038-the-behavioral-tier-off-the-merge-path-interim.md) | The behavioral tier off the merge path, interim (spec 006): its PENDING and a recorded run's FAIL are a WARN in `make evals`, `make check`, and the gate, and a run waits only for a change to the enforcement layer; it names the interim's deviations (0037 is reserved for spec 004's look) | proposed | 006 |
| [0039](0039-the-walking-view.md) | The walking view: a third-person follow camera entered by a control beside the production framing, solid furniture from the frame boxes, reach targeting, the highlight as look data, and one figure driver an avatar takes over | proposed | 008 |
| [0040](0040-the-twins-conversation-core.md) | The twin's conversation core: a gateway route, a committed grounding pack, deterministic guards, and readiness by hash in a human-only file (0039 is allocated to spec 008's walking view) | proposed | 007 |
| [0041](0041-the-anthropic-api-as-a-second-paid-adapter.md) | The Anthropic API as a second paid adapter, prod's fallback one at a time: the official SDK pinned and vetted behind a transport of its own, the same ceilings and a monthly cap of its own, and its flow disclosed in the Author's words before any call (extends 0001's Decision item 3 and its model line) | proposed | 010 |
| [0042](0042-alerts-designed-to-be-read.md) | Alerts designed to be read: Telegram's message entities and a hand-written HTML email, each with its plain form as the fallback, and a marked sample of each (extends one Decision of 0005) | proposed | 011 |
| [0043](0043-ec2-as-prods-default-host.md) | EC2 as prod's default host: the Anthropic API answers first, Bedrock second, one host serving at a time, Route 53 failover over an outbound tunnel, one meter in the cloud, and the model ceilings separate from the server's budget (amends 0001's Decision) | proposed | 001 |
