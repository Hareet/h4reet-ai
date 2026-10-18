# ADR 0032: ADR 0013's pre-publication cleanup extends to an asset that locates the Author or breaks a license

Status: proposed, 2026-10-18, recording spec 003's confirmation 7, taken by recommendation under the Author's direction of 2026-10-17, for the Author to accept. It extends one Decision of ADR 0013 (accepted), and changes nothing else in it · Spec: 003 (FR-041)

## Context

ADR 0013 publishes this repository's history from its first commit, with one allowed rewrite: "a pre-publication cleanup: if a history-wide scan finds a secret, an amount, or a denylisted phrase in any commit, the Author removes it before the first push (corpus/README.md, Public safety) and records the cleanup in a merge-request note." Intent 003: "ADR 0013 publishes this repository's history from its first commit, so an asset committed under the wrong license, or a texture that locates me, stays public in every clone." The arrival check refuses what a machine can see; the Author's approval covers what it can't (FR-016), and either can be wrong. Spec 003's confirmation 7, as worded: "extend ADR 0013's cleanup to a file that locates the Author or breaks a license, with an ADR."

## Decision

- **Before publication,** the pre-publication cleanup ADR 0013 allows also covers an asset or published image that locates the Author, or whose license turns out not to allow publishing it. The Author removes it from the history before the first push, by the same procedure as a secret, and records the cleanup in a merge-request note. Only the Author rewrites history; agents never do.
- **After publication,** a file can't be recalled from the clones that have it. It comes off the site and is replaced within one day, and an incident note records it (Principle VI).
- `docs/runbooks/asset-withdrawal.md` holds both procedures (FR-041).

## Alternatives considered

- **No cleanup for assets:** the history would keep a file that locates the Author, public from the first push, though the mistake was found before it.
- **A broader rewrite right** (any file, any time before publication): more than the risk needs, and less of an audit trail than Principles III and VI ask.

## Consequences

- The cleanup ADR 0013 allows has two more triggers. Each is the Author's decision, recorded in a note, and happens only before the first push.
- After publication nothing changes in ADR 0013: the history is public, and a mistake is a withdrawal and an incident note.

## Links

Intent: `specs/003-studio-assets/intent.md`. Spec: `specs/003-studio-assets/spec.md` (Clarifications, confirmation 7; FR-041; Assumptions, "Mistakes found before publication"). ADR 0013. Runbook: `docs/runbooks/asset-withdrawal.md`. Merge request: `docs/merge-requests/2026-10-18-feat-003-us1-arrival-check.md`.
