# docs/004-m9-three-parts
Spec: [specs/004-room-composition/plan.md](../../specs/004-room-composition/plan.md) §4.2 and §10 (line I: T048, M9) · Written by: Claude Code (Opus 5.5), a spec-writer subagent, then the main session · Date: 2026-10-27
Session: the main session started from `~/h4reet-ai/h4reet-ai`; this branch's worktree is in the session's scratch folder · Repo hooks active: yes
Authorized by: the Author's overnight direction of 2026-10-26, "make the steps to continue forward with all the work that is possible", and `fix/002-patches-on-003`'s note, which says where this update goes: "The update goes on a spec 004 docs branch from `main`, as docs/004-m5-record did".

**Status: documents only, for the Author to merge by hand.** It records in spec 004's plan, contract, research, and tasks that M9 runs in three parts, as the approved note on `fix/002-patches-on-003` (d20eaa4) gives it. Nothing here changes behavior.

## Runs in the Author's terminal

**It stacks on `spec/004-cube-amend` (fffdb55),** because both edit plan.md §4.2 and §10. Merge that branch first, then this one, both by hand:

```bash
git --no-replace-objects merge --no-ff -m "Merge docs/004-m9-three-parts (<sha12>)" \
  -m "Merged by hand: documents only" <the branch's tip>
```

It can go before or after M9: the steps the Author runs are in `fix/002-patches-on-003`'s note and the runbook, not here.

## What changed and why

Plan §4.2, contracts/intake-amendments.md §14, and T048 described M9 as one scratch branch holding spec 002's whole line, gated once. The note found that gate can't pass: main's compose policy refuses spec 002's `web` image ("not pinned by digest") until the web patch is on `main`, and the patch can't go first, because one of its tests reads the compose file's `web` service. So M9 runs as `feat/002-web` on `m9/web` (expected "Not ready"; `main` fast-forwards to it and takes the web patch at once), then `feat/002-approvals` on `m9/approvals` with the regenerated approvals patch, then the rest of the line and `fix/002-patches-on-003` on `m9/line`.

| File | Edit |
|---|---|
| plan.md §4.2 | M9's row names the three parts; a bullet gives why and each part; a bullet gives the two behavioral runs (01ff6257051b, 00257d84866c), both already owed |
| plan.md §10 | A departure entry: what the plan said, why, the three parts, and why this update is on a spec 004 docs branch |
| contracts/intake-amendments.md §14 | The same three-part wording, and a pointer to plan.md §10 for M9 before M8 |
| tasks.md T048 | Rewritten as the Author's three-part step; ID and tags unchanged |
| research.md R-49 | One sentence added beside the original decision |

One reading to check: plan.md §10 attributes "the same order as T184" to spec 000's T184 (the shared gateway build), the only T184 in spec 000 or 002. The note says only "T184".

## Constitution check

| Principle | Touched | How it complies |
|---|---|---|
| III. Intent before spec, spec before code, humans merge | Yes | The plan is updated to match what the Author will run, as CLAUDE.md asks when implementation departs from the plan. |
| VI. Build in public, including failures | Yes | The one-gate plan's failure is recorded with its reason. |
| Others | No | Documents only. |

## Review

None needed for a documents-only record; the steps it records were reviewed twice on `fix/002-patches-on-003` (T047 and its delta review, which approved d20eaa4).

## Verification

- Every added relative link resolves (one anchor, `#10-departures-from-this-plan`, already used in §4.2). Files on other branches are named in code spans.
- gitleaks on commit: no leaks.

## Cost and data-flow impact

None.
