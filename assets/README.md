# Assets

The studio's outputs, and only its outputs: the twin's avatar, the visitor avatars, their animations and their still and preview images, and, in Phase 3, the room's assets. The studio's pipeline, its workflows, models, and photos stay in the studio, outside this repository ([spec 003](../specs/003-studio-assets/spec.md), FR-001).

## The directories

- `twin/`: the Author's twin, a stylized likeness the Author approves file by file.
- `visitors/<character>/`: the four visitor avatars, original characters.
- `animations/<rig>/`: the animations, by the rig they drive.
- `room/`: the room's assets, in Phase 3.
- `policy/`: the license allowlist, the likeness approvals, and the caps. Only the Author changes them, on `main`; agent sessions can't write them, and the arrival check reads them from the `main` branch, never from a branch.

Each asset directory holds its files, one `records.json`, and one `LICENSE.md`. Nothing else comes in: no workflow, node pack, script, or model weights ([ADR 0031](../docs/adr/0031-assets-in-plain-git.md)).

## The license

The files here are not covered by the repository's MIT license. They are all rights reserved, with viewing and linking welcome: each directory's `LICENSE.md` says so, and the Author fills in its copyright line before the directory's first file arrives ([ADR 0030](../docs/adr/0030-media-license-and-ai-mark.md)).

## How a file comes in

1. **Scrub it:** `make assets-scrub FILE=<path>` keeps only what the format needs to render, and adds the one mark, the IPTC digital source type for AI-made media. It never changes pixels.
2. **Record it:** add its entry to the directory's `records.json`: its hash, its kind, its source by an opaque ID, each step with every model it loaded, their revisions and licenses, the hand tools, and the date each step's models were last checked ([contracts/asset-record.md](../specs/003-studio-assets/contracts/asset-record.md)).
3. **Approve it, where it needs approval:** a likeness, a file made from the Author's photos, or a room file needs the Author's approval of its hash in `policy/approvals.json`, on `main`, first.
4. **Render the credits:** `make assets-credits` writes `CREDITS.md` from the records.
5. **Commit it:** the pre-commit hook runs the arrival check over the staged files, and `make check` over every commit on the branch ([contracts/arrival-check.md](../specs/003-studio-assets/contracts/arrival-check.md)). A refusal names the rule, the file, and the commit, never what it matched.

A file found after its merge to locate the Author, or to break a license, follows [the withdrawal runbook](../docs/runbooks/asset-withdrawal.md).
