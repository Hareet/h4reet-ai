# ADR 0012: Constitution 1.0.1 — the Spec Kit 1.0.8 lifecycle

Status: accepted by the Author, 2026-10-07 · Spec: none (process change)

## Context

The repository adopted Spec Kit 1.0.8 at bootstrap. Two things in constitution 1.0.0 did not match the tool:

1. Principle III listed the lifecycle as `specify` → `clarify` → `plan` → `tasks` → `implement` → `analyze`. Spec Kit runs `analyze` after `tasks` and before `implement`: it is a read-only consistency check of `spec.md`, `plan.md`, and `tasks.md`, useful only while it can still stop inconsistent work. `docs/START-HERE.md` already used that order. Spec Kit 1.0.8 also adds `converge`, which runs after `implement`, compares the code with the spec, plan, and tasks, and appends any unbuilt work to `tasks.md` as new tasks.
2. Spec Kit 1.0.8 installs its commands as skills invoked as `/speckit-<name>`. The constitution named them in the dotted form of earlier releases (`/speckit.specify`), which no longer resolves to an installed command.

## Decision

Amend the constitution to 1.0.1, a PATCH (clarification) under its own Governance section:

- Principle III lists the lifecycle as `specify` → `clarify` → `plan` → `tasks` → `analyze` → `implement` → `converge`.
- Development Workflow steps 2 and 3 name the commands `/speckit-specify`, `/speckit-plan`, and `/speckit-tasks`.

No principle is added, removed, or redefined. `CLAUDE.md` and `docs/how-we-build/lifecycle.md` follow the same order, as `CLAUDE.md` ("When they disagree, fix this file") and Development Workflow step 8 require.

## Alternatives considered

- **Keep 1.0.0 unchanged.** Agents reading Principle III would run `analyze` after implementation, and the constitution would name commands that do not exist.
- **Keep the dotted names as informal aliases.** Typing `/speckit.specify` does not run anything, so every reader would have to translate.
- **Fold the change into the bootstrap commit.** Simpler, but the ratified 1.0.0 text would never appear in the history, and this first amendment would be invisible.

## Consequences

- The constitution, `CLAUDE.md`, and the how-we-build guide describe the lifecycle Spec Kit 1.0.8 actually runs.
- `converge` is part of the documented loop. It only appends tasks, so `tasks.md` can grow after implementation starts; each addition is traceable to the requirement it closes.
- A future Spec Kit upgrade that renames or reorders commands needs the same kind of PATCH amendment and ADR.

## Links

Intent: none (process change). Spec: none. PR: none. The repository has no remote until the stack is locally sufficient and tested; the amendment is the commit immediately after the bootstrap commit.
