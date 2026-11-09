# ADR 0031: Assets in plain git, under fixed roots, served under content-derived names

Status: proposed, 2026-10-18, recording spec 003's confirmation 3, taken by recommendation under the Author's direction of 2026-10-17, for the Author to accept · Spec: 003 (FR-001, FR-020, FR-029; research R-01, R-02, R-08)

## Context

Intent 003's second open question: "Where the files live: in git, in Git LFS, or in object storage at the edge with their hashes in git. GitHub meters LFS past its free allowance, so the survey leans toward the final files in plain git, served from object storage by their hashes." Spec 003's confirmation 3, as worded: "final files in plain git, served from the edge under content-derived names; no LFS or object store; a 500 MB history cap."

## Decision

- **Plain git.** The studio's final files are committed as they are: no Git LFS, no object store holding the canonical copy. If spec 001's edge serves from object storage, it copies them from the repository when it deploys.
- **Fixed roots** (research R-01): `assets/<family>/`, one directory per family (`twin/`, `visitors/<character>/`, `animations/<rig>/`, and `room/` in Phase 3), and `docs/research/images/<note's file stem>/` for a note's published images. Each directory holds its files, `records.json`, and `LICENSE.md`; `assets/policy/` holds the Author's policy. A binary image, video, or model file anywhere else is refused (rules A1 to A4), and so are model weights anywhere.
- **Admitted formats** (research R-02): PNG, JPEG, WebP, and binary glTF with embedded PNG, JPEG, or WebP textures: each one the arrival check can parse completely with Python's standard library.
- **Content-derived names when served** (FR-029): the site's release names each served file `<stem>.<first 16 hex of its SHA-256>.<ext>`, so a changed file gets a new name and a returning visitor never mixes old and new.
- **A 500 MB cap** on the asset and published-image blobs across the whole history (FR-020): the arrival check sums the distinct blobs ever stored under the roots and refuses a change that brings the total over `caps.json`'s `history_bytes` (rule H1).

## Alternatives considered

- **Git LFS:** keeps clones small, but GitHub meters its storage and bandwidth past a free allowance, and the local tier would need the LFS server to serve the assets.
- **An object store with hashes in git:** the repository stays small, but it isn't self-sufficient: the local tier would depend on the cloud to show the twin.
- **Records beside each file** (`<file>.record.json`): one more file per asset, and "a file no record names" becomes a pairing rule instead of a set difference.

## Consequences

- No storage or transfer bill from git, and the local tier serves the assets with no cloud dependency.
- Every committed asset stays in every clone for good (ADR 0013): the arrival check runs before every commit, over every commit of a branch, and over the history before the first push, so nothing it refuses enters the history. ADR 0032 covers what it can't see.
- The cap bounds the repository's growth; a replaced asset still counts, since its old blob stays in the history.

## Links

Intent: `specs/003-studio-assets/intent.md`. Spec: `specs/003-studio-assets/spec.md` (Clarifications, confirmation 3; FR-001, FR-020, FR-029); research R-01, R-02, R-08. Merge request: `docs/merge-requests/2026-10-18-feat-003-us1-arrival-check.md`.
