# ADR 0017: A clean-room gate, and gate code only the Author runs

Status: proposed, 2026-10-08 · Spec: 000 (FR-005, FR-011, FR-012, FR-014, FR-041, FR-042; SC-003, SC-007)

## Context

FR-041 requires `make check` to run every local gate, and every merge-request note to carry its output and the reviewer's passes. FR-042 requires `make publish-check` to scan every commit before the first push.

Session 1 found the holes one at a time. Commit `c78c6a7` opened a cache hole, closed in `dbd7561`. Commit `8329697` fixed a fallback that trusted a planted `.venv` and `uv.toml`. Agents can also write `.git/info/exclude`, which can hide a planted `GNUmakefile` that would shadow the Makefile.

On 2026-10-08 the Author chose "Gates only", which read: "Only tools/gates/** becomes human-only, and you run the gate directly. The Makefile and stack scripts stay agent-editable and are checked in review. Faster to change, but a branch's Makefile could run unreviewed code in your terminal." (plan research, "The plan interview, word for word"). The other paths below are the plan's reading: they are gate definitions or the FR-039 boundary. The approved session plan named each of them for the Author to veto.

## Decision

The clean-room gate is `tools/gates/gate <ref>`, run directly, not through `make`. A planted `GNUmakefile` could shadow the Makefile.

1. Export: `git archive <ref>`. Only committed content gets in. A cache, a `.venv`, a `uv.toml`, or an ignored file cannot change the result.
2. Container phase: in the devcontainer image. Dependencies come from the lockfiles with scripts off (`npm ci --ignore-scripts`; there is no Python project to sync). Then, with `--network none`, lint, tests, the scaffolds, and matrix stage H run. Project code runs without network.
3. Host phase: githooks, toolchain, and compose policy; `corpus-check` with the denylist; gitleaks; the image build on the engine; and matrix stage E and the behavioral evals when their triggers change.

`make check` runs the same targets inside the sandbox and prints PASS, FAIL, SKIP (with a reason), PENDING, or PLANNED for each. Any FAIL or PENDING fails the run. PLANNED marks enforcement a patch hasn't applied yet, and acceptance requires none. In the Author's terminal the gate replaces `make check`, which would run the working tree's `node_modules`. The gate's summary line goes into the merge commit message.

Gate code only the Author runs (human-only):

- `tools/gates/**`: the gate, publish-check, the compose policy, `matrix-required.txt`, and `roles.expected`.
- `evals/agent-config/**`: the agent-configuration cases, thresholds, and history.
- `.gitleaks.toml`: the secret rules.
- `deploy/agents-engine/**`: the FR-039 boundary, parts of which run with sudo.
- `.mcp.json`: agent tool configuration.
- `config/prices*`: cost configuration, beside the already protected `config/budgets*` and `config/alert*`.
- `denyWrite` on `.git/info` and `.git/refs/heads/main`.

Already human-only: `config/kill-switch*`, `deploy/env/*`, `*.env`, `.claude/**`, `REVIEW.md`, `CLAUDE.md`, and the constitution.

Agent-editable and reviewed: the Makefile, `deploy/scripts/**`, `scripts/operator.py`, and `.devcontainer/**`. These run in the Author's terminal, so each merge-request note lists changes to them under its own heading, first, and the reviewer checks that heading first. The compose policy also refuses, in `.devcontainer/**`, an `initializeCommand`, features, host mounts, privileged `runArgs`, and `.npmrc` keys outside an allowlist.

Gitleaks runs in four places: the Author's plain git pre-commit hook, a PreToolUse content check, branch scans, and publish-check. Each uses the pinned image.

Publish-check (FR-042) exits 0 when clean, 1 on findings, and 3 when it cannot certify: inside the sandbox, in a shallow clone, with the wrong gitleaks, or with no denylist. Findings name a commit, path, line, and rule. They never print the matched text.

## Alternatives considered

- Review alone. Rejected: a gate edited by what it gates shows up only if a reviewer reads closely.
- Per-tool flags, fixed one at a time. Rejected: that is how session 1 found its holes.
- Running the gate through `make`. Rejected: a planted `GNUmakefile` would shadow the Makefile.
- Making the Makefile and `.devcontainer/**` human-only as well. Rejected under the "gates only" choice. They run in the Author's terminal, so they are reviewed, and their changes are listed first.
- The pre-commit framework for secret scanning. Rejected: its store must be writable, and it reads a working-tree config. A plain git hook is smaller.
- detect-secrets. Rejected in favour of gitleaks, which has rules for the operator tokens.

## Consequences

- Cost: $0. A fresh devcontainer build is about 8 minutes, `make setup` about 3, and `make test` about 1. The newcomer path must stay under 30 minutes (SC-007), timed on a fresh clone with an empty cache.
- Degraded mode: without gitleaks, the hooks and `make check` fail closed, and publish-check exits 3. A devcontainer that won't build sends the Author to the host gate, marked DEGRADED. A missing denylist makes publish-check exit 3, not pass. With the Team plan unavailable, the behavioral tier shows PENDING, and the merge waits (FR-011). Engine down gives a failed image gate that names the Author's command.
- Trade-off: the Author reviews every gate change by hand. That is the cost of keeping the gates out of agents' reach.

## Links

- Intent: [000 intent](../../intent/000-ai-twin-portfolio.md)
- Spec: [000 spec](../../specs/000-local-foundations/spec.md) · Plan: [plan.md](../../specs/000-local-foundations/plan.md) · Research: [research.md](../../specs/000-local-foundations/research.md)
- Merge request, in place of a PR until publication: [2026-10-08 note](../merge-requests/2026-10-08-plan-000-local-foundations.md)
- Related: [ADR 0006](0006-artifact-chain-and-hooks.md), [ADR 0013](0013-local-until-publication.md), [ADR 0016](0016-agents-engine-rootless-docker.md)
