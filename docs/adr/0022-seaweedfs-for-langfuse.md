# ADR 0022: SeaweedFS as Langfuse's object store, because MinIO's community images are gone

Status: proposed, 2026-10-08 · Spec: 000 (FR-014, FR-027, FR-040; User Story 1 scenarios 2 and 3)

## Context

Langfuse writes event data to an S3-compatible object store. The first design used MinIO. MinIO's community images stopped in October 2025, and its repository was archived on 2026-04-25. The plan records that the Docker Hub copies now refuse pulls. Research.md records the registry check from hardware check 2.

Langfuse does not test SeaweedFS officially. This stack treats it as community-supported and tests it itself.

In the plan interview of 2026-10-08 the Author chose "SeaweedFS (Recommended)", which read: "Open source (Apache-2.0), actively maintained, with official images; runs as one container. Langfuse doesn't officially test it, so our own end-to-end trace checks serve as the test."

## Decision

- Langfuse's S3 store is SeaweedFS, Apache-2.0, in single-container S3 mode. The image is `chrislusf/seaweedfs`. Hardware check 2's tag lookup matched no plain version tag, so `make pin-images` picks the newest release tag in the first stack task and records its digest in `deploy/images.lock`. If no maintained release tag exists, the Author chooses between Chainguard's MinIO, which Langfuse 4.54.0's own compose now uses, and building SeaweedFS from source (research.md R-09).
- It joins `internal` only and publishes no port. Spec 000 uploads no media, so no browser reaches it (FR-040).
- The bucket is created at first start.
- The stack's end-to-end checks are the test of this store: write, read, list, and the retention delete, all through a real trace from hello to Langfuse. The quickstart runs them.
- Usage reporting, if the image has any, is switched off, as for every other third-party service (ADR 0004).

## Alternatives considered

- MinIO, pinned to its last image. Rejected: no further fixes come, and the plan records that the Docker Hub copies refuse pulls.
- Chainguard's MinIO build. Rejected: it is still MinIO code from an archived upstream, and it adds a second registry to trust for the object store.
- Garage. Rejected: AGPL-3.0, a configuration file plus a layout and key setup at first start, and thinner S3 coverage (no versioning, limited IAM) than SeaweedFS (research.md R-09).
- RustFS. Rejected: its own documentation advises against production use, and its 1.0 release was not confirmed when this was decided (research.md R-09).

## Consequences

- Cost: $0 cloud, and a small container. Disk use grows with traces, bounded by Langfuse's retention.
- Support risk: Langfuse does not test SeaweedFS, so an upgrade of either project can break the pairing. The quickstart's checks run after each upgrade of either.
- Degraded mode: SeaweedFS down stalls Langfuse's ingestion and worker. The collector retries for about 10 minutes, then drops, and the telemetry panel shows the drops. The meter and the kill switch never read Langfuse, so enforcement is unaffected (ADR 0004, ADR 0020).
- Data flows: this design makes no outbound connection, and the internal network enforces that (FR-040).

## Links

- Intent: [000 intent](../../intent/000-ai-twin-portfolio.md)
- Spec: [000 spec](../../specs/000-local-foundations/spec.md) · Plan: [plan.md](../../specs/000-local-foundations/plan.md) · Research: [research.md](../../specs/000-local-foundations/research.md)
- Merge request, in place of a PR until publication: [2026-10-08 note](../merge-requests/2026-10-08-plan-000-local-foundations.md)
- Related: [ADR 0004](0004-langfuse-and-grafana-over-opentelemetry.md), [ADR 0019](0019-llama-cpp-model-server.md), [ADR 0021](0021-internal-network-prometheus-loki-edge.md)
