# ADR 0051: Agents plan through a plan-only role and run the gate from the Author's checkout of main

Status: proposed, 2026-11-12 · Spec: 017 (FR-015, FR-032, FR-033, FR-039; User Stories 5 and 6; spec.md Clarifications, Q1 and Q7; Assumptions "Decision 1 reverses today's rules", "Decision 2 reverses today's rules", and "Plan and gate off until his patches merge"; plan.md §3, §8, §10) · **Reverses two lines of CLAUDE.md** (the Infra line and the Verifying line, by patch P-2) **and amends ADR 0017's statement that the Author runs the gate.** Accepted when the Author merges `feat/017-the-night-shift`. Neither request turns on before patches P-2, P-3, and P-6 merge.

## Context

Two rules hold today, both in the Author's hand:

- CLAUDE.md, the Infra line: "Infra: `make plan` only. There is no `make apply` on purpose — apply is a human action: the Author's, in his terminal, until publication (`make infra-verify`, `make infra-record`); then the protected CI environment."
- CLAUDE.md, the Verifying line: "Before merging, the Author runs `tools/gates/gate <branch>` from main's checkout, never `make check` in their own terminal."

ADR 0017 says the same in its own words: "In the Author's terminal the gate replaces `make check`". So does `docs/merge-requests/README.md`, which says the Author runs the clean-room gate "in their own terminal, from main's checkout".

Both rules make the Author the bottleneck. A plan waits on him, and so does every gate run, including the reruns of a known flake. The spec calls the plan's wait the slowest ("it removes the slowest wait, the plan blocks", User Story 5). The Author's answers to the questions the design raised:

> "Yes, let agents run terraform plan" (decision 1)

> "Let agents run tools/gates/gate" (decision 2)

> "It can use my checkout of main" (Q1, the question of where the gate runs)

**Reading (the session's):** decisions 1 and 2 let agents ask for both. They don't let agents apply, merge, or change the gate's code. Q1 settles the gate's checkout: his own, on main, not a copy. The rest of this ADR is how that is built, and what it touches.

## Decision

1. **The plan goes through a plan-only role, run by the runner.** A worker in the ops role writes a plan request, with a root (`bootstrap`, `account`, or `prod`) and a commit SHA. The runner, outside every container, does four things:
   - makes a detached worktree at that SHA, so the commit's own `infra/` code runs;
   - asks AWS for short-lived credentials for the plan-only role (`h4-agent-plan`, patch P-6), which lasts one hour (research R-06), and writes them to a file at mode 0600 in its own state folder;
   - runs that commit's `scripts/infra/infra_plan.py` in the plan container, which alone mounts the root's values and saved plans, and deletes the credentials file when the run ends;
   - returns only the redacted plan block to the worker (FR-014, FR-039).

   The saved plan stays in the Author's folder, where `make infra-verify` reads it for his apply, as it does today. The plan takes the state's lock, and the role may write and delete only the state's `.tflock` objects. An agent's plan therefore never races his apply (plan.md Q4, approved as recommended).

2. **The plan-only role (P-6) can read, and can do nothing else to the account.** Its trust runs only from the Author's Identity Center permission-set role, through one-hour sessions. Its permissions are AWS's managed read-only policy, minus the decrypting reads of parameters and secrets, plus writes and deletes on the state's `*.tflock` objects only. Its tags follow the project's convention. Its policy is tested offline in `infra/test/test_account.py` (T062). User Story 5, scenario 3, requires that AWS refuse any mutating action tried with the role. The offline tests check the policy document, not AWS's answer, so that refusal is proven only by the Author's first run under the role. **The apply stays his.** The Author applies the role, and every apply, himself.

3. **The gate runs from the Author's own checkout of main, under the gate lock, never with `--prove`.** A gate-runner worker asks for a gate with a SHA. The runner, outside every container, runs `tools/gates/gate <sha>` on the host, from the Author's checkout, under the gate lock, and never with `--prove` (plan.md Q7, approved as recommended; stage E stays PENDING for the Author, because `--prove` runs the agents' engine's proof, a heavy run that the Author starts by hand, R-09 and the agents'-engine runbook). The runner answers only while that checkout's HEAD is `refs/heads/main` and its tree is clean. Otherwise the request is answered with that reason and goes on the decision page (FR-033).

   The gate prints a merge line, and the runner puts the log and that line on the page. **The gate never merges, and main doesn't move** (US6, scenario 3). Principle III reserves merges to a human, and the Author merges as before.

4. **Both requests are off until P-2, P-3, and P-6 merge.** While off, each answers `off: waiting for P-2, P-3, P-6`, whatever the role. The second install turns them on, from a main that holds the patches, with `NIGHT_PLAN=on` and `NIGHT_GATE=on` in the facts file (plan.md §8, FR-015). The plan's §3 table names P-2 and P-3 for the gate and all three for the plan. This ADR records the stricter rule the runner enforces: both wait for all three.

5. **Nothing else changes.** The gate's code stays human-only, as ADR 0017 lists it: `tools/gates/**`, the evals' configuration, `.gitleaks.toml`, and the engine's boundary. Agents still can't edit `.claude/**`, CLAUDE.md, or the constitution. Only the way the gate is run moves.

**What it reverses and amends:**

- **CLAUDE.md, the Infra line.** "`make plan` only" becomes: agents may ask for a plan through the night shift's route, once P-2 merges. The apply sentence stays as written. Patch P-4 changes the bash gate's refusal message for `make plan ROOT=` to name the route; the rule stays.
- **CLAUDE.md, the Verifying line.** "the Author runs `tools/gates/gate <branch>`" becomes: the gate runner runs it, from the Author's checkout, when the request is on. The Author still reads the log and does the merge.
- **ADR 0017's statement that the Author runs the gate.** Its clean-room design, its container phase, and its list of human-only gate code all stand. Only the "who runs it" changes.
- **`docs/merge-requests/README.md`** says the same as the Verifying line, and this ADR doesn't change it. No patch in plan.md §10 names that file, so it needs the Author's decision on a follow-up.

## Constitution clauses touched (named deviations)

Spec 017's Assumptions name these, and the Governance section asks for a written justification and an ADR when a deviation is permanent. This ADR is that record.

- **Principle IV: "Cloud access is short-lived and identity-based (OIDC for CI, SSO for humans); `apply` and `destroy` are human actions."** **Deviation, named.** An agent's command gets cloud access, through a role assumed from the Author's SSO session, for one hour. The access is short-lived and identity-based; the actor is neither CI nor a human. The apply remains human.
- **Security & Agent Governance: "Ops may `plan` and never `apply`."** Complies, and this decision enables it.
- **Security & Agent Governance: "Prohibited without a human: … changing IAM, budgets, …".** Complies. The role is applied by the Author.
- **Security & Agent Governance: "network egress to non-allowlisted domains from an agent session".** Complies. The plan container's allowlist names only the AWS hosts `infra/` uses, for the plan's run alone (`allowlist-plan.json`).
- **Principle IV: "No secrets exist in the repository, in agent context, or in traces."** Complies, with a limit. AWS credentials exist only in the runner's file for one plan run, deleted when it ends. A session sees the redacted block and nothing else.
- **Principle III: "only a human merges to `main`, applies infrastructure, or amends this constitution."** Complies. The gate prints the merge line and never merges.
- **Principle IV: "Agents act up to the production gate and never past it."** Complies. The gate runs before any merge.
- **Principle IV: "the agent that implements a change MUST NOT be the agent that reviews it".** Complies. The gate runner writes nothing; it runs a gate on a SHA a worker names.
- **Development: "Claude Code as the agent harness, run under the project's committed permissions, hooks, and sandbox settings".** This is the gate's own deviation, named in spec 017's Assumptions. The gate's container phase uses the host's Docker engine, and its image step uses the Author's engine certificate, as he runs it today. The runner runs the gate on the host, from his checkout. No session's container gets either.
- **Governance, the roles list.** The constitution's list of roles doesn't include the gate runner, the supervisor, or the studio. That is a deviation until patch P-9, which the Author decides (Q10, approved as recommended).

## Alternatives considered

- **Keep today's rules.** Agents ask, and the Author plans and gates. It is simple and needs nothing new. It stays the degraded mode, and it is what the night shift falls back to with the requests off (spec 017, Degraded Modes).
- **Give agents the Author's own SSO session, or any administrator credential.** Rejected: it gives an agent a power to change the account, where the plan role can only read and lock. The role is the boundary.
- **Put the plan's credentials in the session's container.** Rejected: a session that can read a credential can use it. FR-039 keeps the plan's container and its credentials out of every session.
- **nono's `aws_auth`, or its `endpoint_policy`.** Rejected. nono has no per-command `aws_auth` (its issue #1987), and its `endpoint_policy` matches methods and paths, not AWS actions (#2274). On WSL2 its credential proxy is off unless the insecure opt-in is set (R-06). The IAM role is the boundary either way.
- **A separate gate checkout for agents.** Rejected by the Author's answer to Q1, "It can use my checkout of main". No separate checkout is made, so there is one gate, on the tree he merges from.
- **Running the gate with `--prove`.** Rejected (plan.md Q7, approved as recommended). `--prove` runs the agents' engine's proof, a heavy run (R-09). Stage E stays for the Author.
- **Letting a passed gate merge.** Rejected by Principle III, and by FR-033.

## Consequences

- **Cost.** The plan role costs nothing. Its read calls are free. Each plan runs on AWS's read APIs under the Author's session, and the state's lock writes cost a fraction of a cent a month (spec 017, Expected Cost Impact).
- **The plan's reach is only as wide as ReadOnlyAccess.** Whether the managed policy covers every data source the roots read is unconfirmed (R-06). The first plan under the role will say so, and a refusal names the action. The Author then decides whether to widen the role, by his patch.
- **The Author's AWS session matters overnight.** A plan fails closed when his session has ended, and the page says when it ended (spec 017, Edge Cases). Renewing it is his step (runbook).
- **The gate depends on the Author's checkout.** It runs only while that checkout is on `refs/heads/main` and clean. On nights with a gate queued, he leaves it that way; otherwise the request waits on the page with the reason.
- **The gate's container phase runs on the host's engine.** That is the Author's engine, and the gate runs with the socket, which the gate's own design needs (ADR 0017, R-09). The agent chooses only the SHA. The gate runs an untrusted branch as data, in containers with no network and every capability dropped, and the session's own container never gets the socket (ADR 0050).
- **One gate at a time.** The gate lock serialises the gate runs. Plans have their own state-lock behaviour, described above.
- **Off until the patches merge.** Until then, the page records each refusal, so the Author can see how often a plan or gate was needed and when the second install is worth doing.

## Links

- Spec: [017 spec](../../specs/017-the-night-shift/spec.md) (Clarifications, Assumptions, User Stories 5 and 6) · Plan: [plan.md](../../specs/017-the-night-shift/plan.md) §3, §8, §10 · Research: [R-06](../../specs/017-the-night-shift/research.md#r-06-the-plan-under-decision-1), [R-09](../../specs/017-the-night-shift/research.md#r-09-the-gate-under-decision-2)
- Contract: [runner, §5 requests](../../specs/017-the-night-shift/contracts/runner.md)
- Amends: [ADR 0017](0017-clean-room-gate-and-human-only-gate-paths.md) (who runs the gate). Related: [ADR 0008](0008-terraform-reviewed-plans-recorded-apply.md) (the reviewed plan and the recorded apply, unchanged), [ADR 0050](0050-containers-around-every-agent-session.md), [ADR 0052](0052-the-studio-line.md)
- Merge-request note: `docs/merge-requests/`, written at the build's last group (G6); not yet written.
