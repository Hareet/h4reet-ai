# ADR 0038: The behavioral tier off the merge path, interim (spec 006)

Status: proposed, 2026-11-07 · Spec: 006 (FR-001, FR-002, FR-004 to FR-007, FR-009, FR-029 to FR-031; its Assumptions' Deviations item) · If accepted, the deviations that item names are accepted: Development Workflow steps 3 and 5 and the Security & Agent Governance clause on running the agent-configuration evals before merge, of constitution 1.0.1; and, for a branch that changes no trigger, one sentence each of [ADR 0006](0006-artifact-chain-and-hooks.md) and [ADR 0017](0017-clean-room-gate-and-human-only-gate-paths.md), both proposed, quoted below.

## Context

`make evals` carries the behavioral tier's state for the tree's trigger hash into every branch (spec 000's plan §14), so a hash with no attested run, or a failed one, holds up every gate, whatever the branch changes. Spec 006 records the cost: twelve of main's sixteen merges from 2026-10-27 to 2026-11-06 went by hand with `evals` failing or waiting, each on a branch that changed no trigger path. On 2026-11-07 main's hash, 401d0a4d7341, had no run, after a failed run on the hash before it. Spec 006, approved on 2026-11-06, designs the whole change (FR-001 to FR-032), and has no `plan.md` yet.

The Author, on 2026-11-07:

> This eval command is still failing and why do we have to keep running it? This is really blocking us from progress with heavy constraints, can we lighten them up? No one else is working on this repo yet, so we can add more of these checks later?

The main session's question, in its words:

> From now on, make the behavioral tier advisory. I'd build a small patch to the gate, yours to apply, so the tier's FAIL or PENDING shows as a WARN instead of blocking "ready". … The tier itself stays available to run when you change `.claude/` or before publishing. The deviation gets recorded under spec 006, as `CLAUDE.md` requires. … Want it?

The Author's answer: "yes we want that" (2026-11-07).

## Decision

Proposed: the behavioral tier informs a merge it no longer holds up, ahead of spec 006's plan, as branch `feat/006-advisory-tier` and its patch build it.

- **In `make evals`, `make check`, and the gate's `evals` step,** the tier's PENDING, no attested run for the tree's trigger hash, and a recorded run's FAIL show as WARN, naming the hash, the run, and the Author's command. The merge doesn't wait on a WARN, and the gate's summary line counts it. The docs' links run whatever the tier says, and a case, `thresholds.yaml`, or a history entry that doesn't load still fails (FR-001, FR-002).
- **The rule lives in main's gate,** matched on the tier's own lines, so it holds for a branch whose tree predates it; in the Makefile and `evals/behavioral_line.py`, which run the links after the tier and print its WARN line; and in make check's runner, which reads a "WARN (" line as WARN.
- **A change to the enforcement layer still waits for its run:** the gate's `agent-config-evals` step stays PENDING, with the Author's command, for a branch that changes `CLAUDE.md`, `REVIEW.md`, `.claude/**`, or the Claude Code pin, until an attested run has the branch's hash, and a failed run still fails it until FR-009's escalations are built (FR-004, FR-006). A change confined to `evals/agent-config/**` is held to its own tests: the step is SKIP, naming it (FR-004, FR-005).
- **The deviations,** as spec 006's Deviations item names them: Development Workflow step 3 ("Approved `plan.md` is committed before code exists.") and step 5 ("CI requires — … the evaluation suite above its thresholds"), and Security & Agent Governance ("changes to them run the agent-configuration evals before merge"). For a branch that changes no trigger, it supersedes ADR 0006's "With the Team plan unavailable, the behavioral tier shows PENDING and the merge waits (FR-011)." and ADR 0017's "With the Team plan unavailable, the behavioral tier shows PENDING, and the merge waits (FR-011).". ADR 0023's "a moved floor does" still holds, since the pin is a trigger.

## Alternatives considered

- **Keep the tier blocking, and merge by hand with a reason,** as on twelve merges since 2026-10-27. Rejected by the Author's request: every hash without a passing run holds up every branch, and a run costs about $6 and 45 minutes notional on the Team plan.
- **Spec 006's Question 3, option A, as clarified:** the run comes before an enforcement-layer patch lands, on a scratch branch from `main` that the gate holds until its entry is attested (FR-007). It stays the route for a run before a patch lands, but the interim doesn't force it.
- **Question 3's option C,** "After the Author applies it, at the Author's choice", whose implications the spec gave as "But an enforcement-layer patch can sit on main with no run, which the constitution's "before merge" reads against (Q1)." The Author declined it on 2026-11-06 by taking option A. For a patch applied straight to `main`, the interim comes to option C in practice: the Security & Agent Governance deviation.
- **Make every run advisory, a triggered branch's too.** Rejected: against FR-009 and the Author's answer to Question 2, under which a proven effect blocks.
- **Wait for spec 006's whole implementation.** Rejected: the gates stay held up until then.

## Consequences

- **An enforcement-layer patch can sit on `main` with no run.** Nothing forces one any longer: before the interim, the hash such a patch moved made every later branch's `evals` step wait for a run.
- **Gates show the tier's WARN until a run for main's hash passes:** "WARN (behavioral tier): no run for trigger hash …", or the newest run's FAIL. An attested passing run gives the tier's PASS line again.
- **A run before a patch is applied goes through FR-007's scratch branch:** the patch applied on a branch from `main`, `make evals-agent-config` against it, its entry committed there, and the gate, whose `agent-config-evals` step waits (PENDING) until the entry is attested, then the gate's merge command.
- **The patch moves main's trigger hash, from 401d0a4d7341 to 0e1669499c9a,** since a human-only test of the Makefile's line changes with it. Nothing waits on the new hash.
- **A branch whose tree predates the change and whose hash has a failed run** still fails `evals`: its own `make evals` stops at that FAIL, before the docs' links. Merging `main` into it gives it the new one.
- **make check's statuses gain WARN,** beside ADR 0017's PASS, FAIL, SKIP, PENDING, and PLANNED; it still fails only on FAIL or PENDING.
- **Cost:** $0 at run time. Dev time: no run is forced on a branch that changes no agent configuration.
- **The record:** every WARN shows in the gate's report and its summary's count, and every run's entry stays committed and attested (FR-026).
- **When it ends: open.** Proposed, for the Author to answer: when FR-009's escalations become the thresholds, or at publication, whichever comes first?

## Links

- Intent: [intent 006](../../specs/006-behavioral-tier/intent.md)
- Spec: [006 spec](../../specs/006-behavioral-tier/spec.md), its Assumptions' Deviations item
- Merge request, in place of a PR until publication: [the `feat/006-advisory-tier` note](../merge-requests/2026-11-07-feat-006-advisory-tier.md) and its patch ([ADR 0013](0013-local-until-publication.md))
- Related: [ADR 0006](0006-artifact-chain-and-hooks.md), [ADR 0017](0017-clean-room-gate-and-human-only-gate-paths.md), [ADR 0023](0023-claude-code-pin-is-a-floor.md)
