# Runbook: withdrawing an asset that locates the Author or breaks a license

A merged asset or published image turns out to show something that locates the Author (a reflection, a sign, a screen, a view), or a model in its record turns out to be under a license that doesn't allow publishing it. The arrival check refuses what a machine can see, and the Author's approval covers the rest (spec 003 FR-016); this page is for what both missed. Spec 003: FR-041; [ADR 0032](../adr/0032-pre-publication-cleanup-for-assets.md), which extends [ADR 0013](../adr/0013-local-until-publication.md)'s pre-publication cleanup to assets.

What to do depends on one fact: whether the repository has been published (ADR 0013).

## Symptoms

- Someone, the Author, a reviewer, or a reader, points at a file under `assets/` or `docs/research/images/` that shows a street, a sign, an address, a screen's content, a document, or a view that identifies the place; or a likeness the Author didn't mean to publish.
- A model, tool, or service named in a `records.json` is relicensed, or its license is found to forbid display on a site that promotes the studio, in some countries, or public distribution (FR-013), or it's evaluation-only and the studio has no commercial license (FR-014).

## Impact

- **Before publication:** the file is in the local history only. Nothing has been served; nobody outside the Author's machine has it, apart from the agent sessions that read it (disclosure row D1).
- **After publication:** every clone and fork has the file, for good, and the site may be serving it.

## Act

### Before publication: the pre-publication cleanup

1. **Stop new copies:** don't merge or push anything until the cleanup is done. Tell running agent sessions to stop reading the file.
2. **Find every commit that holds it:** `git log --all --format='%H %s' -- <path>`, and, for a file that moved, `git log --all --find-object=<blob sha>`.
3. **Remove it from the history,** the Author only, in the Author's terminal: the same procedure ADR 0013 allows for a secret, applied to the file's path and blobs. Agents never rewrite history.
4. **Fix the record:** remove the file's entry from `records.json`, or replace the file with a corrected recreation, scrubbed, recorded, and approved again by its new hash (FR-016).
5. **Revoke its approval** on `main`, in `assets/policy/approvals.json`, if it had one, and record why in the entry's `reason`.
6. **For a license:** change the license's entry in `assets/policy/licenses.json` to read `no` on the term that fails, so the arrival check refuses every file that names it (rule L1).

### After publication: off the site within a day

1. **Take it off the site,** within one day of learning of it: replace the file with a corrected recreation, or remove it and its references, and deploy (spec 001's edge).
2. **Revoke its approval and fix the license entry,** as steps 4 to 6 above, on `main`.
3. **Write an incident note** in `docs/incidents/`: what was published, for how long, how it was found, and what changed so it doesn't happen again (Principle VI). It names the file by its path and hash only.
4. Don't rewrite the published history: it can't recall the clones that have it, and it would erase the record Principles III and VI depend on.

## Verify

- `make arrival` passes on `main`, and `make publish-check` finds nothing in any commit (before publication), or the site's network log no longer shows the file (after).
- `git log --all -- <path>` lists no commit holding the old blob (before publication only).

## Undo

- A cleanup can't be undone after the first push; that is why it happens before it. Before the push, the Author's backup of the repository, taken at step 3, restores the old history.
- A withdrawal after publication can be reversed only by publishing the file again, which needs a new approval.

## Record

- **Before publication:** a merge-request note in `docs/merge-requests/` recording the cleanup: the paths and hashes removed, the commits rewritten, and why, never the content.
- **After publication:** the incident note, and the merge-request note for the replacement.
