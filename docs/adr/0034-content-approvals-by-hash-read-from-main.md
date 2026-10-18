# ADR 0034: Content approvals by hash, in a human-only file read from `main`

Status: proposed, 2026-10-18 · Spec: 002 (FR-012, FR-017, FR-052; plan §3; research.md R-08, R-16; contracts/resume-source.md §5)

## Context

The room publishes words about the Author: the resume's items and, later, a narration script for each. FR-012 asks that each be published "only after it passes the product evals the twin's answers must pass and the Author has approved it". Agents draft that content, so whatever records the approval must be something agents can't write, and something a branch can't satisfy on its own.

Spec 003 faced the same question for likeness approvals and answered it with a human-only file in `assets/policy/`, read from `main` (spec 003 plan §2–§3). The plan review of 2026-10-18 found two gaps in the first design here. `git show main:` inside the image's build stage finds nothing, because a host stack builds from a `git archive` export, and `.dockerignore` drops `.git`. And the code that marks a file approved, `apps/web/build/approvals.ts`, is agent-editable, so a branch could change how it decides.

The Author's direction of 2026-10-17 was to take the recommended options and revisit any of them later: "Let's relax some of the overnight rules so that you can continue with intent 002 and intent 003? I think you can create the tasks and implement them and we can always go back later and re-do a task or requirement if we highlight a needed change".

## Decision

- **The approvals file.** `assets/policy/content-approvals.json` lists the SHA-256 of each approved content file, with an ID, its path when approved, its kind (`resume` or `narration`), the date, and the Author's reason (data-model.md §4).
  - A file is approved when an entry's digest equals the SHA-256 of its current bytes, whatever its path. Any edit makes it a draft again.
  - The PDF's header, the full name and one contact channel, sits beside it in `assets/policy/resume-header.json`, outside `corpus/`, where the surname may not go (R-16).
- **Human-only, from the start.** The approvals patch creates both files empty and protects them before the first draft is committed: `.claude/hooks/protected-paths.sh`, the sandbox's `denyWrite`, and `Edit(...)` denies. The forbidden-action matrix holds those rows.
- **Read from `main`, on the host, never in the build stage.**
  - `deploy/scripts/web_image.py` reads both files with `GIT_NO_REPLACE_OBJECTS=1 git cat-file blob refs/heads/main:<path>` from the working tree and hands them to the image's build as the named build context `policy`. The build stage runs no git. The full ref matters: a bare `main` resolves to a tag of that name first, and an agent session can make one (the review of 2026-10-18).
  - A checkout's build gets them from its prebuild, `apps/web/build/policy.ts`, the same way, into a directory under `node_modules/.cache`.
  - A file `main` lacks is absent: every content file is then a draft, and the PDF gets the room's header.
  - So an approval takes effect when the Author's commit is on `main`, at the next build.
- **Drafts are left out of prod, shown on dev.** A build without `ROOM_DRAFTS=1` leaves drafts out and lists them in `room-data.json`'s `drafts`. Only the `-drafts` images of dev and dev-cpu build with it, and they show drafts under a "Draft, not approved" banner (contracts/web-serving.md §1).
- **The gate enforces it.** `tools/gates/content_check.py` is human-only and runs in `make check` and in the Author's gate, after a build without drafts. It reads `main`'s approvals itself, by `refs/heads/main`, recomputes each content file's digest, and trusts none of the build's bookkeeping. It fails when `room-data.json`'s `published` claims a file `main` doesn't approve, or when an unapproved file's text appears in any file under `dist/`. `approvals.ts` is the build's convenience; the check is the enforcement, as spec 003 enforces its intake from human-only gate code.

## Alternatives considered

- **The Author's commits as the approval,** for example a commit by the Author touching the content file. Rejected: fragile to detect, and agents' commits carry the same name in this repository.
- **A signature over the content.** Rejected: no key infrastructure exists, and the Author's terminal already holds the only write access the approvals need.
- **Reading the approvals from the branch being built.** Rejected: a branch could approve its own content.
- **Reading `main` in the image's build stage.** Rejected: a host stack's context has no `.git`, so every file would be a draft (the review's first blocker).
- **One approvals file for spec 002 and spec 003.** Rejected: a content approval and a likeness approval confirm different things, so each has its own shape, in sibling files.

## Consequences

- Cost: $0.
- The Author's step: `sha256sum` of the file, then an entry in `assets/policy/content-approvals.json`, committed on `main` (quickstart §3). An approval reaches a stack's image at its next `make up`, which rebuilds the image.
- The gate gains two steps: `content-build`, the room built in the container phase with `main`'s policy mounted, and `content`, the check. `make check` gains `content-check`, PLANNED until the approvals patch adds the script.
- Two patches touch `assets/policy/`. Spec 003's protects the whole directory, and this one protects its two files by name. Each works alone. With both applied, the rules overlap and agree.
- Degraded mode: none at run time. Without `main`, or without the file, everything is a draft. That fails safe: prod shows only the room's fixed screens, and the PDF the room's header.

## Links

- Intent: [the room's intent](../../specs/002-the-room/intent.md)
- Spec: [002 spec](../../specs/002-the-room/spec.md) · Plan: [plan.md](../../specs/002-the-room/plan.md) · Research: [research.md](../../specs/002-the-room/research.md) · Contract: [resume-source.md](../../specs/002-the-room/contracts/resume-source.md)
- Merge request, in place of a PR until publication: [2026-10-18 note](../merge-requests/2026-10-18-feat-002-approvals.md)
- Related: [ADR 0033](0033-the-rooms-stack-apps-web-vite-threejs.md), [ADR 0017](0017-clean-room-gate-and-human-only-gate-paths.md)
