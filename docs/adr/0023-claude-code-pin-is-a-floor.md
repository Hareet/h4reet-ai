# ADR 0023: Claude Code's pin is a floor; a newer host warns, and the evals record the version they ran

Status: proposed, 2026-10-18 · Spec: 000 (FR-005, FR-011; SC-008) · If accepted, replaces one Decision point of [ADR 0018](0018-agent-sessions-on-wsl.md), "`make toolchain-check` compares installed versions with the pins and fails on any drift, Claude Code included", for Claude Code alone, and the one Consequence quoted below; the rest of ADR 0018 stands.

## Context

ADR 0018 puts every tool version in one pin file, `.devcontainer/toolchain.vars`, Claude Code's included, and makes `make toolchain-check` fail on any drift. Its Consequences say: "A Claude Code upgrade changes the enforcement layer, so it also triggers the behavioral evals (ADR 0006)."

The exact pin hasn't held. `DISABLE_AUTOUPDATER=1`, in `.claude/settings.json`, reaches only sessions started in this repository, and Claude Code updates itself from the Author's other projects, which share its one global install. The pin has moved from 2.1.294 to 2.1.295 (2026-10-08) and to 2.1.296 (2026-10-11), each time after the host moved first. By 2026-10-17 the host ran 2.1.301, so every gate run fails its `toolchain` step, whatever the branch.

On 2026-10-17 the Author declined to pin the global install, which their other projects share, and asked to "change the pin demand later".

What reads the pin today:

- `tools/gates/toolchain_check.py` marks any other version DRIFT, which fails `make check` and the gate's `toolchain` step.
- The behavioral agent-config evals put the pin's line in their trigger hash, so moving the pin runs them again.
- `make evals-agent-config` refuses to start when the installed `claude` isn't the pin.
- Each history entry records `claude_code_version` and `claude_code_pin`.

What the exact pin protects. Several enforcement layers live in the Claude Code binary: the sandbox it sets up from the settings, the permission rules, the hooks it calls, and how it parses the settings. Other checks cover some of them:

- Stage S of the forbidden-action matrix re-tests the sandbox from inside every agent session's `make check`, under the binary that runs the session.
- Stage H tests the hook scripts, but not whether the binary calls them.
- Only the behavioral evals test the permission rules and the hook calls end to end.

The evals' cost: about $5 notional and 20 to 45 minutes on the Team plan. The two runs to date cost $4.92 (19 minutes) and $5.21 (45 minutes), from Team-plan usage that the agents also need.

## Decision

Proposed: option A of the three below.

- **A floor.** `CLAUDE_CODE_VERSION` names the oldest Claude Code that agent sessions and the behavioral evals may run. Every other pin stays exact.
- **`make toolchain-check`:**
  - Claude Code at the floor, or a release in its series, is OK.
  - A newer one is WARN: its row, and a line starting `WARN:`. A WARN doesn't fail the check.
  - An older one is DRIFT and fails, as before.
- **The gate's `toolchain` step:**
  - It shows WARN, and its summary line counts it, so the merge commit records that a step warned. The gate's output names the step and the version; the summary line doesn't.
  - The merge doesn't wait on a WARN.
- **The behavioral evals:**
  - `make evals-agent-config` takes a Claude Code at the floor or newer, and refuses an older one.
  - Each entry records the version that ran, beside the floor, as entries already do.
  - When `make evals` shows a pass, it also names the Claude Code version that run used.
- **The trigger hash** still holds the floor's line, not the installed version. A Claude Code update alone doesn't make the evals pending; a moved floor does.
- **Moving the floor** is the Author's call, made in a commit that runs the evals again. A cheap habit: when a branch runs the evals anyway, move the floor on that branch first, to the host's version.
- **The code** is human-only (`tools/gates/**`, `evals/agent-config/**`), so it comes as a patch: [2026-10-18-docs-000-claude-pin-rule.patch](../merge-requests/2026-10-18-docs-000-claude-pin-rule.patch).

The options:

| | Rule | Cost per Claude Code update | What it catches |
|---|---|---|---|
| **A** (proposed) | The pin is a floor. A newer host is a WARN, and the evals record the version they ran. | None | An older host. A newer one shows in the gate's summary and in each evals entry, but the evals don't re-run for it. |
| **B** | As A, plus a gate step that waits (PENDING) while the host is newer than the newest attested evals run. | One evals run before the next merge: about $5 and 20 to 45 minutes. At the rate seen so far (four versions on the host in nine days), about one run a week. | An update that changes the permission rules or the hook calls, found at the next merge. Agents run on the new version from the moment it installs, so B finds the change; it doesn't prevent it. |
| **C** | The exact pin, with the Author managing the version. | A pin commit and an evals run per update, or the global `DISABLE_AUTOUPDATER` the Author declined. Until the pin follows the host, every gate fails. | Everything, while the global install is held. |

Why A: it's what the Author asked for, and it costs nothing per update. Each evals entry records the version that ran, and each gate run's summary line records a WARN when the host is above the floor. The layer most exposed to a binary change, the sandbox, is still re-tested in every agent session, by stage S. B buys earlier detection of the rest, for about one evals run a week. If the Author wants that coverage, B is a small step on top of A: the gate already reads the history, and the toolchain check already reads `claude --version`.

## Alternatives considered

- B and C, as in the table.
- **A project-only Claude Code, pinned exactly.** `make tools` would install the pinned Claude Code beside the lint toolchain, and this repository's sessions would start with that binary, while the global install updates freely. This keeps the exact pin. But every session has to be started with that binary, and nothing can check that it was: a session started with the global `claude` would run the newer version, and nothing would show it. It's more machinery and habit than the risk calls for.

## Consequences

- **Cost:** $0 cloud. The patch changes `evals/agent-config/behavioral.py`, which is in the trigger hash, so applying it takes one evals run (about $5 notional, on the Team plan). After that, a Claude Code update by itself takes none.
- **What A gives up:** a Claude Code update that changes the permission rules or the hook calls goes unnoticed until the next evals run. That run comes with the next branch that touches the triggers or moves the floor. Two signals remain:
  - stage S, which re-tests the sandbox on every agent `make check`;
  - each merge-request note's "Repo hooks active" line, which records whether the repository's hooks fired in that session.
- **Records:** the gate's summary line in each merge commit counts the WARN, and each evals entry names the version that ran.
- **Degraded mode:** unchanged. A missing Claude Code, or one older than the floor, still fails `make check` and the gate until the Author updates it. The devcontainer builds without Claude Code by default (`WITH_CLAUDE=0`), so its row is SKIP there, as before. With `WITH_CLAUDE=1` the devcontainer installs exactly the floor.
- **Constitution:** under Technology Standards, the Development standard says "a devcontainer defines the single toolchain used by humans, agents, and CI". For the agent harness alone, the devcontainer would define the minimum version, not the exact one. Spec 000's Assumptions name this as a proposed deviation, which applies only if this ADR is accepted.

## Links

- Spec: [000 spec](../../specs/000-local-foundations/spec.md) · Plan: [plan.md §9](../../specs/000-local-foundations/plan.md#9-development-environment), [§14](../../specs/000-local-foundations/plan.md#14-evals-and-red-team-scaffolds-agent-configuration-evals) · Tasks: [T013](../../specs/000-local-foundations/tasks.md)
- Merge request, in place of a PR until publication: [2026-10-18 note](../merge-requests/2026-10-18-docs-000-claude-pin-rule.md)
- Related: [ADR 0006](0006-artifact-chain-and-hooks.md), [ADR 0017](0017-clean-room-gate-and-human-only-gate-paths.md), [ADR 0018](0018-agent-sessions-on-wsl.md)
