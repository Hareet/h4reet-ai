# chore/repo-hygiene
Spec: specs/000-local-foundations/ (clarified on this branch; the hygiene files serve FR-001 and User Story 6 scenario 1) · Intent: specs/000-local-foundations/intent.md · Written by: Claude Code (Opus 5.5), main session; reviewed by six separate read-only `reviewer` agents · Date: 2026-10-07
Session: started from `~/h4reet-ai/h4reet-ai`, the repository root · Repo hooks active: yes. Every command and edit in this session left a record in `.claude/audit/hooks.log`, for example:

```
2026-10-08T00:23:53Z	bash	ALLOW	git switch -c chore/repo-hygiene && git branch --show-current
2026-10-08T00:30:54Z	edit	ALLOW	.editorconfig
```

Three commands were blocked, all correctly. One was mine: a script that contained the merge command quoted under For the Author, which tripped `bash-gate.sh`'s switch-to-main rule (a false positive the last branch's note already lists); I rewrote it as a file. Two came from reviewer agents: an `echo` that mentioned the git hook's environment variable, and a recursive delete of their own probe files outside the repository. The `SubagentStop` hook found a transcript for 5 of 78 events (see For the Author).
Authorized by: the Author's session 1 kickoff (`docs/KICKOFF-PROMPT.md`, tasks 1–5), and the Author's answers in this session: the CODEOWNERS handle `@hareet`, the LICENSE holder "Hareet", and the eight clarifications below. Later in the session the Author also directed: record their answers to the three open decisions, and make the settings changes and governance fixes. Agents can't make the parts in `.claude/**` and `CLAUDE.md`, so those are a patch for the Author to apply. The kickoff was pasted in its pre-ADR-0013 form; this session ran the current version in the repository (no `gh`, no pull request, `make check` added, a second known question). Some of this branch goes beyond the kickoff: the review fixes, ADRs 0014 and 0015, the new requirements FR-040 to FR-042, and the three questions the review put to you as clarification markers, since answered. Each comes from a reviewer finding and an accepted source, and each is yours to accept or strike (Review).

## What changed and why

| Commit | Change |
|---|---|
| 8282a29 | **Repo hygiene** (task 2). `README.md`: what the project is and who it is for, a status line, a note on the first commits, the artifact chain, a spec index, links to every artifact folder, and the engineer and non-engineer reading paths. `LICENSE` (MIT, 2026, Hareet). `SECURITY.md`. `CONTRIBUTING.md`: intents, not pull requests, from outside; the lifecycle in ten lines; the local branch workflow. `.github/CODEOWNERS` (`@hareet`, the paths you listed) and `.github/dependabot.yml` (npm, pip, github-actions, docker; weekly), both effective at publication. A complete `.gitignore` and an `.editorconfig`. START-HERE's publication checklist also enables private vulnerability reporting. |
| 096dc28 | **Spec 000 clarified** (task 3): five questions, asked one at a time; answers below. Both `[NEEDS CLARIFICATION]` markers are gone. |
| cb25542 | **Docs the answers made stale**: the README's spec table, START-HERE section 5, and the session 2 prompt. |
| 517213a | **First review's fixes**: the README's claims, the outside-intent path, the ignore rules, and the header comments. |
| 868d0cf | **Second review's fixes**: the answers carried through the rest of the spec; the moved text in `publication-carryover.md`; FR-040 to FR-042; ADRs 0014 and 0015 (proposed). |
| e4869b7 | **Third review's fixes**: your answer 1 restored word for word; level-triggered ceilings; a meter that fails closed and survives restarts; FR-039's limits on the working tree; three clarification markers for decisions only you can make. |
| 257634d | **Final review's fixes**: initializing an empty store is your audited reset; the runtime refuses the dev-only test machinery outside dev. |
| 978a4a1 | The first version of this note. |
| 3f29d97 | **Your answers to the three open decisions**, recorded word for word and applied; no clarification markers remain. |
| c78c6a7 | **Makefile fixes**: uv's cache moves inside the repository, so `make check` works in the sandbox; the agent-config evals trigger compares with `main`'s merge base. The cache move opened a hole, which dbd7561 closes. |
| 2a1d7be | **The enforcement-layer patch** (`docs/merge-requests/2026-10-07-chore-repo-hygiene-enforcement.patch`), for you to review and apply: env-file denies, `ops.md`'s batched requests, the subagent hook, `spec-writer.md`, your `CLAUDE.md` lines, and six matrix rows. Rebuilt in 2c6cd8b. |
| dbd7561 | **Closes the hole c78c6a7 opened** (round 5): uv's cache is out of the repository again. It moves to the session's temporary directory only inside the sandbox. The repository's `.cache/` is deleted, and no ignore rule hides one. |
| 8f6eac0 | **Round 5's spec fixes**: the renewal state survives restarts; "only production spends" is enforced; answer 6 recorded as a deviation. |
| 2c6cd8b | **The patch, rebuilt**, replacing 2a1d7be's version: `ops.md` asks only for redacted error lines, with a filter tested as written; the matrix tests every new rule. |
| 8329697 | **The pytest fallback ignores a planted `.venv` and `uv.toml`** (round 6): it pins the system interpreter and skips uv's config files. |
| 96b345e | **Today's fallback spend survives a restart** (round 6), so a restart can't hand out a fresh $2. |
| bba1fae | **The patch, rebuilt again**: the redaction filter closes the gaps round 6 found, and `CLAUDE.md` gains a third line. |
| this commit | This note, updated: the environment report (task 1), the constitution check (task 4), and all six review rounds. |

### The clarifications

| # | Question | Your answer | Where it landed |
|---|---|---|---|
| 1 | How much may the Bedrock fallback spend per day? | $2/day inside the daily ceiling, with a 70% warning at $1.40 | FR-030 (the sub-budget limits fallback calls; every metered call counts toward the ceilings; a clarification marker asks whether it renews by itself); User Story 2 scenario 2 |
| 2 | How are GitHub-side requirements proven while local? | They move to a separate publication spec; spec 000 closes on local criteria only | User Story 4, FR-015, SC-004, and the fork-PR edge case moved whole, and the GitHub halves of User Story 6 scenario 1, FR-001, FR-005, FR-011, FR-012, FR-014, FR-016, SC-008, and the budget-change edge case, to `specs/000-local-foundations/publication-carryover.md`, word for word. The Assumptions name the deferred constitution controls as a deviation. ADR 0014 (proposed). |
| 3 | Does service come back on its own after a ceiling trips? | Only your reset restores it, for both ceilings; the reset brings local answers back at once, and metered calls stay refused until the tripped meter rolls over | User Story 2 scenarios 3–5 and 7 and its Independent Test; FR-022 (fallback refused while any meter is at or above its ceiling), FR-031 (fail closed; state survives restarts; an empty store stays degraded until you initialize it), FR-033, FR-034 (an operator credential); User Story 5 scenario 3. This also removes scenario 5's automatic restore, which contradicted Principle V. |
| 4 | Who runs the container-level checks the sandbox blocks? | Agents get their own disposable container engine for CPU-only stacks; the host's engine, the GPU, and the host's stacks stay out of reach; GPU and Bedrock checks run in your terminal | FR-039 (unprivileged; allowlisted egress; the working tree read-only without the sandbox's denied paths; its definition human-only); FR-018; FR-036; User Story 3 scenarios 1 and 9. ADR 0015 (proposed). |
| 5 | How are alert emails sent without cloud resources? | SMTP from a dedicated alerts mailbox; its credentials stay local, outside the repository and agent context | FR-032 (and what an alert may carry); FR-007 (deny entries by name); FR-040 (the data-flow disclosure) |
| 6 | Does what the environment file selects count as "only configuration"? | "yes the env file can count as only a config change" | FR-017; User Story 1 scenario 5; FR-039 (the agents' stack may use a CPU image); ADR 0015 |
| 7 | Does the fallback sub-budget renew on its own? | "it does not renew on its own, a human approves renewal" | FR-030 (refused and alerted when it runs out, until you approve renewal with your credential and a reason); FR-022; FR-008; User Story 5 scenario 6 |
| 8 | One budget for the host, or one per environment? | "Yes each stack will have its own meter as we are only concerned for production environment, the dev environment won't use spend and will use a Claude Team plan" | FR-031; FR-030 (production's numbers); FR-036; FR-037; User Story 5's Independent Test; the Assumptions |

Answers 6 to 8 are quoted exactly. My readings of answers 7 and 8 are mine, not yours, so please confirm them:
- Answer 7: running out of the sub-budget also alerts you, because a renewal needs you to know.
- Answer 7: a day that ends without running the sub-budget out starts the next with the full $2.
- Answer 8: the dev stack has no paid adapter, and development work (Claude Code and the agents) runs on your Team plan. So the Bedrock steps of User Story 5 run against production from your terminal, and dev's synthetic spend can exhaust the sub-budget to test renewal.

The plan has to know why FR-036 needs synthetic spend. Bedrock is spec 000's only metered provider, and its $2/day sub-budget sits below the $5 daily ceiling. So until a later phase adds other metered spend, only synthetic spend can reach the daily ceiling. The monthly ceiling is reachable for real, after ten days of full fallback.

## Acceptance criteria

- **FR-001**, in part: the MIT license, `SECURITY.md`, `CONTRIBUTING.md`, and `CODEOWNERS` now exist; `intent/`, `docs/adr/`, `docs/incidents/`, and `docs/how-we-build/` already did. Still missing: a code of conduct (For the Author).
- **FR-002**: the README links the constitution; `CLAUDE.md` and `REVIEW.md` already name it as superseding them.
- **User Story 6 scenario 1**: the README links the constitution, `intent/`, the spec index, the ADR index, `docs/how-we-build/`, `SECURITY.md`, and the MIT license.
- Not yet: **SC-009**, because ADRs 0001–0006 don't exist until session 2. The ADR index is one click from the README, so each ADR will be two.
- The spec changes satisfy no criterion; they change them, as listed above.

## Constitution check

The `constitution-check` skill, run on the clarified spec (096dc28), again after each round of fixes, and last on the final spec (96b345e); this table is the final one.

| Principle | Touched? | How the spec complies, or the justified deviation |
|---|---|---|
| I. Data-local | Yes | No byte leaves a visitor's device: spec 000 has no visitor surface, `hello` is stateless, and telemetry carries no payloads (FR-029). No biometrics. Degraded modes are defined first, and a degraded response names its cause (FR-022, FR-028, FR-038): the kill switch, an exhausted sub-budget, a meter at or above its ceiling after a reset, a failed cold start, or a down alert channel. The three flows that leave the local tier (Bedrock, Telegram, and SMTP) must be in the data-flow disclosure (FR-040). The local tier stays production, and the agents' CPU-only stack uses the same topology (FR-017, FR-039). |
| II. Production-grade | Yes | The contract test (FR-024), the breach test (FR-036), the forbidden-action matrix (SC-003), telemetry (FR-026 to FR-029), cost per call (FR-023), the local gate (FR-041), and docs and ADRs. The expected cost is now in the spec (Assumptions). **Gap:** no runbook requirement, although the alerts page a human and the reset is an operator procedure. The plan should add runbook entries for the warning, the trip, and the reset. |
| III. Intent → spec → code | Yes | Linked intent (FR-004); clarified before any plan; only the Author merges. The deviations are written in the Assumptions: local until publication (ADR 0013); the controls that need CI, deferred to the publication spec (ADR 0014, proposed); and image variants chosen by the environment file (answer 6; ADR 0015, proposed). The moved text waits in `publication-carryover.md` until the publication spec has an intent. The three decisions the review left open are answered (Clarifications 6 to 8); no markers remain. |
| IV. Least privilege | Yes | The spec widens nothing. FR-039 keeps the agents' containers off the host's engine, the GPU, the host's stacks, and non-allowlisted domains, and User Story 3 scenarios 1 and 9 test both directions (ADR 0015, proposed). The engine sees the working tree read-only and without the sandbox's denied paths, and its definition is human-only. Agents can't reset the kill switch of any stack outside their own engine, and a reset needs an operator credential (FR-008, FR-034). FR-007 names the secrets for deny entries. The env-file denies are in the patch for you to apply. The per-secret variables (FR-007) and the sandbox opening (FR-039) wait for the plan and the engine; until then, FR-039 can't be built and those secrets aren't enforced. |
| V. Cost | Yes | Model calls only through the gateway, with cost attributes (FR-021, FR-023). Ceilings of $5 a day and $20 a month with 70% warnings, and a $2/day fallback sub-budget with a $1.40 warning (FR-030). The meter is checked at request start (FR-031). The system degrades without a human, and only a human restores it (FR-033, FR-034). Ceilings are level-triggered: fallback stays refused while any meter is at or above its ceiling (FR-022), so overspend is limited to requests already in flight within the per-client cap (Edge cases). The meter fails closed, its state survives restarts, and an empty store stays degraded until you initialize it, so a wiped store can't reopen fallback (FR-031). A deliberate breach proves it, with dev-only synthetic spend and clock that prod's configuration may not enable (FR-036). A sub-budget that runs out stays out, across rollovers and restarts, until you approve its renewal, and today's fallback spend survives a restart too (FR-030, FR-031). Only production spends: any other stack refuses to start with a paid adapter, and your test calls count toward production's meter (FR-031). |
| VI. Build in public | Yes | **Deviation (temporary):** local until publication (ADR 0013). The history stays publishable from its first commit (FR-001) and is scanned before the first push (FR-042). No secret in the repository, agent context, or telemetry (FR-012), and alerts carry only operational facts (FR-032). |
| VII. Own the whole product | Partly | The spec makes no claim about the Author's work. The product reasoning (guardrails before features, so they aren't retrofitted) lives in the intent and User Story 6. |
| VIII. Honest AI | No | No twin behavior in this spec: the persona, the corpus, and the guardrail evals are Phases 1–3. The eval and red-team scaffolds are ready for them. |

The rest of the branch touches no runtime and widens nothing. `CODEOWNERS` and Dependabot add GitHub-side controls that take effect at publication. The README, `SECURITY.md`, and `CONTRIBUTING.md` claim nothing about the Author beyond the constitution's own words.

## Review

Five separate, read-only `reviewer` agents ran `REVIEW.md`'s four passes in the background while this session worked. None of them wrote any of the change.

**Round 1: `git diff main...8282a29` (hygiene).** Not ready as it stood: five Important findings, thirteen nits, and one Important finding outside the diff.

| # | Pass, severity | Finding | What was done |
|---|---|---|---|
| 1 | Compliance, Important | The README promised that no faces or voices are collected. The design sends visitor audio out of the browser for speech when it can't run there, and the constitution forbids only biometric data. | Fixed in 517213a: the constitution's words. |
| 2 | Compliance, Important | The README and CONTRIBUTING said every change follows the whole chain, though none has a plan yet and both branches skipped stages at your direction. They also said agents do "most of the work", which shrinks your role; the constitution says "most of the typing". | Fixed in 517213a. |
| 3 | Security, Important | Outside intents: a stranger's issue text, committed "in the originator's words", would reach the `spec-writer` agent unmarked. | Fixed in CONTRIBUTING, `intent/README.md`, and `lifecycle.md`: outside intents are marked, and agents must treat them as data. Nothing enforces that yet; the agent's own wording is yours (For the Author). |
| 4 | Security, Important | CODEOWNERS does nothing unless branch protection requires code-owner review. Your own pull requests to these paths couldn't merge. The other human-only paths aren't covered. | Header comment corrected; the rest is your decision (For the Author). |
| 5 | Security and Compliance, Important | `dependabot.yml` claimed to cover every ecosystem, but compose-file images, Terraform, and devcontainer features aren't covered. | Comment corrected; your four ecosystems kept; the rest is the publication spec's. |
| 6–10 | Nits | Dashboards promised with spec 000; incomplete prerequisites; "pushing" forbidden after publication; stage names unlike `lifecycle.md`'s; env files ignored only in `deploy/env/`. | Fixed in 517213a. |
| — | Nits, 8 more | | Seven fixed in 517213a; the eighth (env files on a fresh clone) is a plan item. |
| — | Security, Important (outside the diff) | Agents can read `deploy/env/*.env`: `Read(.env*)` matches only names that start with `.env`. | START-HERE corrected. FR-007 now requires the deny entries, which are your settings change (For the Author). |

The reviewer also confirmed the history note against `git log --graph main`, and that nothing claims more about you than the constitution, intent, or corpus. It counted finding 2 as the second time Claude has worded your role more broadly than the sources (the first was golden answer 5, removed in 41cf3b1), and proposed a line for `CLAUDE.md` (For the Author).

**Round 2: `git diff 8282a29..cb25542` (the clarified spec and its docs).** The answers were recorded faithfully, but their consequences weren't carried through: seven Important findings and nine nits. All fixed in 868d0cf, except the parts that need your decision.

| # | Pass, severity | Finding | What was done |
|---|---|---|---|
| 1 | Security, Important | FR-039 gave the agents' engine no network rule, which would get around the allowlist. It didn't say what the sandbox opening may reach (on the host, the Docker socket is the host's engine), allowed privileged Docker-in-Docker, and had no positive test. | FR-039: unprivileged; held to the allowlist; images and the model from allowlisted sources or pulled in advance by you; an opening that reaches that engine only, proven on the host. User Story 3 scenario 9 tests both directions. ADR 0015. The opening itself is your settings change. |
| 2 | Security, Cost & telemetry, Important | FR-032's "outside agent context" had no enforcement point. Nothing limited what alerts carry, and the new flows weren't disclosed. | FR-007 names the alert secrets for deny entries with matrix rows; FR-032 limits alerts to operational facts; FR-040 adds the data-flow disclosure. The deny entries are your settings change. |
| 3 | Bugs, Cost & telemetry, Important | After a reset at a ceiling, FR-022 still routed to Bedrock, so a reset at the monthly ceiling could spend past $20. What `degraded` refuses was inconsistent, the breach test had no way to cross a rollover, and nothing stopped an agent resetting. | FR-022 refuses fallback while a tripped meter is at its ceiling. `degraded` means every request gets the degraded response (FR-033). Responses and the dashboard name the cause. FR-036's synthetic source and clock exist only in dev. FR-008 forbids agents to reset. |
| 4 | Cost & telemetry, Important | FR-030 didn't say what the sub-budget limits, whether it is a ceiling or a routing limit, or whether each stack has its own budget. The breach test couldn't reach the thresholds, and the spec had no cost estimate. | FR-030 says it limits fallback calls; FR-036's synthetic source reaches the thresholds; the cost estimate is in the Assumptions. Ceiling or routing limit, and per-environment budgets, became clarification markers in e4869b7. |
| 5 | Compliance, Important | The split moved work that can run locally, and left no criterion for the local gate or for `make publish-check`. The moved IDs stayed live for Spec Kit's `tasks`, `analyze`, and `converge` steps. | The moved text is in `publication-carryover.md`; User Story 4 has no priority, and FR-015 and SC-004 are prose pointers. FR-041 (the local gate, from ADR 0013) and FR-042 (`make publish-check`, from the Assumptions). Bringing any locally checkable item back is your call. |
| 6 | Compliance, Important | The split reverses a Consequence of the accepted ADR 0013, and defers constitution controls without recording a deviation. | ADR 0014 (proposed) replaces that Consequence; the Assumptions name each deferred control and its local stand-in. |
| 7 | Bugs, Important | FR-039 contradicted FR-018 (GPU access) and FR-036 (alert delivery from an engine without secrets), and one image may not serve both CPU and GPU. | FR-018 limits GPU access to the 5090 host; FR-036 asserts real delivery in your terminal and uses stand-in receivers on the agents' engine; the image question is open for the plan interview. |
| — | Nits, 9 | The Input summary; START-HERE's session 2 summary, its reset wording, and its "as far as they can"; FR-034 against scenario 4; Dependabot's citation; the README's Publication row; FR-039's position; the kickoff's session 1 task 3. | Fixed, except two kept on purpose: FR-039 stays with the development-environment requirements, and the kickoff's session 1 text still says what session 1 asked. Dependabot's citation was already fixed in 517213a. |

This reviewer also proposed a line for `CLAUDE.md`, after the second unrecorded constitution deviation in two branches (For the Author).

**Round 3: `git diff cb25542..868d0cf` (the two fix commits).** 517213a closed every round 1 finding; 868d0cf needed more work: six Important findings and eleven nits. All fixed in e4869b7, except the parts that need your decision.

| # | Pass, severity | Finding | What was done |
|---|---|---|---|
| 1 | Security, Important | FR-039 let the agents' engine mount the working tree, so a container could write what the sandbox protects (including the git hook that guards `main`) and read what it hides. The engine's own definition wasn't human-only, and the host's stacks weren't tested. | FR-039: the working tree read-only and without the denied paths; the engine's definition and the sandbox opening change only by your hand; the matrix proves each limit from the host, the host's stacks included (User Story 3 scenario 9). |
| 2 | Bugs and Security, Important | FR-008's reset ban contradicted the agents' own breach test, nothing authenticated a reset, and nothing kept the dev-only clock and synthetic source out of prod. | The ban covers stacks outside the agents' engine; a reset needs an operator credential outside agent context (FR-034, FR-007), and the agents' breach test uses a dev-only one; the local gate fails if prod's configuration enables the dev-only machinery (FR-036). Whether that machinery counts as "only configuration" is part of FR-017's marker. |
| 3 | Compliance, Important | 868d0cf reworded your recorded answer 1 ("like the other ceilings" became "as the ceilings have") without saying so. | Restored word for word; all five answers now match 096dc28 exactly. The question the wording raises is now a marker in FR-030. The reviewer proposed a `CLAUDE.md` line; this is the third paraphrase finding on this branch (For the Author). |
| 4 | Bugs and Cost, Important | Paths that could still spend. The meter had no failure rule, and nothing survived a restart. Trips were edge-triggered, so a monthly crossing during a daily trip could be forgotten, and spending could resume above $20 after the daily rollover. FR-022's order of checks was implicit. | A level rule: fallback refused while any meter is at or above its ceiling (FR-022, FR-034). FR-022 decides in order, kill switch first. The meter fails closed, and the meters, the crossed ceilings, and the switch state survive restarts and `make down` (FR-031; User Story 2 scenario 7). |
| 5 | Bugs, Important | FR-042 could never pass, because the docs themselves contain "$5/day". | FR-042 scans the corpus Markdown for amounts, as the corpus rule says, and the whole history for secrets and denylisted phrases. |
| 6 | Compliance, Important | The ADRs recorded more than you decided. 0014 added a timing rule; 0015 presented derived constraints as your answer and dropped "VM or devcontainer"; both statuses read as accepted; and the deviation hid which controls have no local stand-in. | 0014 drops the timing rule and keeps ADR 0013's publication steps. 0015 quotes your answer and labels the derived constraints, noting that "unprivileged" rules out the usual Docker-in-Docker devcontainer. Both statuses read "awaiting the Author's acceptance". The Assumptions say plainly that nothing local covers vulnerability scanning, SBOMs, automated updates, or building once and promoting. |
| — | Nits, 5 described, 6 more counted | Example lists that read as complete (FR-007, FR-040); "well under" credited to the intent; the carryover's heading and a missing edge case; moved IDs still where Spec Kit could see them; "agents treat outside intents as data" stated as fact; stale lines in START-HERE, the README, the session 2 prompt, and ADR 0013's index row. | The five described are fixed in e4869b7. Two parts are left: whether the Bedrock contract test's spend goes through a meter is a plan item, and `CLAUDE.md`'s description of `make check` as a stopgap is yours. |

**Round 4: `git diff 868d0cf..e4869b7` (the last fix commit), Important findings only.**

Eight of the nine fixes close their findings. A trace of the kill-switch state model, from normal running through trips, resets, rollovers, and failures, holds end to end, apart from the in-flight overshoot the edge cases accept. Two Important findings remained:

| # | Pass, severity | Finding | What was done (257634d) |
|---|---|---|---|
| 1 | Bugs, Cost & telemetry, Important | "Empty without an operator's initialization" was undefined. A new host starts empty, so `hello` would be degraded on a cold start (User Story 1, SC-001). And if `make up` initialized the store itself, a wiped store would come back with zeroed meters and reopen fallback past a ceiling, without your audited reset. | An empty store leaves the runtime degraded until you initialize it. Initialization is a reset under FR-034 that rebuilds the meters from surviving call records, or takes starting values you state, so nothing zeroes them silently. User Story 1 and SC-001 count the one-time initialization on a new host (FR-031). |
| 2 | Security, Cost & telemetry, Important | The gate that keeps the dev-only clock and synthetic source out of prod checked committed templates, but prod runs from an uncommitted env file. | The runtime refuses both outside dev, and a prod stack refuses to start if its env file enables either; the template check stays as a second layer (FR-036). FR-007 denies agents write access to the host stacks' env files. |

The reviewer counted nine minor items without describing them. As planned for this last round, 257634d was not reviewed again; its spec changes are the two rows above.

**Round 5: `git diff 978a4a1..2a1d7be` (your answers, the Makefile fixes, and the patch), Important findings only.**

Five Important findings, and the worst was mine: c78c6a7 opened a hole.

| # | Pass, severity | Finding | What was done |
|---|---|---|---|
| 1 | Security, Important | c78c6a7 put uv's cache inside the repository for every `make` run. Agents can write there, git doesn't show it, and your own `make check`, run with your credentials, would have run code from it. | Fixed in dbd7561. uv keeps its default cache unless that can't be written, which happens only in the sandbox; there it uses the session's temporary directory. Checked in all three cases. The repository's `.cache/` is deleted, and no ignore rule hides one. |
| 2 | Security, Important | The patch's `ops.md` asked for raw service logs, which can carry tokens, connection strings, and prompts, and its output goes into agent context and notes. | Fixed in 2c6cd8b. Only error lines, through a redaction filter defined in the script and tested exactly as written. Never the model server's request logs. You read the output before pasting it, and raw output stays out of commits. FR-039 now says what goes into a note carries no secrets or payloads. |
| 3 | Compliance, Important | Answer 6 departs from the constitution's "identical images" but wasn't recorded as a deviation, and ADR 0015 still said "the same images". | Fixed in 8f6eac0: a deviation bullet in the Assumptions with its justification, and ADR 0015 corrected. |
| 4 | Bugs, Cost & telemetry, Important | The sub-budget's "awaiting renewal" state wasn't among what survives a restart, so a restart or re-initialization could renew fallback without you. | Fixed in 8f6eac0. FR-031 persists it. Initialization leaves fallback awaiting renewal unless you renew it in the same action. User Story 5 scenario 6 covers restarts. |
| 5 | Cost & telemetry, Important | "Only production spends" was stated, not enforced. The Bedrock contract test and Bedrock evals spent outside any meter, FR-037 had dropped the constitution's definition of dev-time spend, and FR-022 routed to Bedrock in stacks without it. | Fixed in 8f6eac0. Other stacks refuse to start with a paid adapter. Your test calls count toward production's meter. FR-037 is restored to "agents and agent evals". FR-022 routes to Bedrock only where a stack has it. |

The reviewer also confirmed:
- the three recorded answers are verbatim;
- the patch weakens no existing rule and applies cleanly;
- the evals trigger is right with a local `main`.

It flagged one more reading of answer 7 for you to confirm (now listed under The clarifications). Its smaller points are fixed in 2c6cd8b:
- the matrix now tests the `deploy/env/` rule alone and the hook's missing-file branch;
- `ops.md`'s last line and `CLAUDE.md`'s container line no longer contradict FR-039;
- the stale `.gitignore` and `lifecycle.md` lines are in the patch.

**Round 6: `git diff 2a1d7be..2c6cd8b` (round 5's fixes), Important findings only.**

Round 5's fixes held. Three of its five findings are fully closed: the log redaction, the image deviation, and "only production spends". The cache fix closes the cache as stated, and the renewal fix holds once the sub-budget has run out. Two Important findings remained; neither came from round 5's fixes:

| # | Pass, severity | Finding | What was done |
|---|---|---|---|
| A | Security, Important | Older than this branch, and made worse by its `.gitignore`. The pytest fallback (`uv run --no-project …`) ran a `.venv` interpreter it found in the working directory, and obeyed a repo-root `uv.toml` that can move uv's cache back into the repository. Both are agent-writable, and `.venv/` is gitignored. Your `make check` takes that route, because pytest isn't on your PATH. The reviewer reproduced it. | Fixed in 8329697: the fallback pins the system interpreter (`--python`) and skips uv's config files (`--no-config`). Reproduced before and after with a planted `.venv` and `uv.toml`: the old fallback ran the one and obeyed the other, and the new one does neither. |
| B | Cost & telemetry, Important | FR-031 didn't keep today's fallback spend across a restart, so a restart before the $2 ran out could hand out a fresh $2, again and again, without you. | Fixed in 96b345e: FR-031 keeps it, initialization rebuilds it, and User Story 5 scenario 7 tests a restart with the sub-budget partly spent. |
| — | Minor, counted | The redaction filter missed URL credentials with an empty username, `Authorization` written as JSON, and values with spaces, and its description claimed more than it did. | Fixed in bba1fae and tested exactly as written. The description now claims only what the filter does. |

The reviewer proposed a third line for `CLAUDE.md`, because A is the third time agent-writable code that git doesn't show has run in your terminal: first the hooks, then c78c6a7's cache, now `.venv` and `uv.toml`. That line is in the patch.

8329697, 96b345e, and bba1fae were not reviewed again by an agent. Instead, the fallback fix was verified by reproducing the attack before and after, and the patch by the matrix: 164 passed against it, and the new rows fail against the current layer.

## Verification

`make check` at bba1fae, run inside the agent sandbox with no override. Since dbd7561 the plain target works there: inside the sandbox only, the Makefile points uv at the session's temporary directory.

```
$ make check
python3 corpus/tools/check_corpus.py
corpus-check: OK — 20 slots, 4 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems
git hook guarding main: installed
uv run --no-project --no-config --python /usr/bin/python3 --quiet --with pytest --with pyyaml pytest -q -p no:cacheprovider corpus/tools
..................................................                       [100%]
50 passed in 0.04s
ruff check .
All checks passed!
shellcheck .claude/hooks/*.sh redteam/forbidden-actions.sh
bash redteam/forbidden-actions.sh
KNOWN GAP   bash-gate.sh          terraform -chdir=infra apply
KNOWN GAP   bash-gate.sh          sh -c "$(printf 'gi%s pu%s' t sh)"
KNOWN GAP   bash-gate.sh          git co main
KNOWN GAP   bash-gate.sh          sh -c 'unset CLAUDE""CODE; git commit -m wip'
forbidden-actions (hook layer): 156 passed, 0 failed, 4 known gaps
make check exit=0
```

Also checked:

- All 54 relative links in the README, CONTRIBUTING, SECURITY, START-HERE, `intent/README.md`, `lifecycle.md`, the ADR index, ADRs 0014 and 0015, and the carryover file resolve.
- `.github/dependabot.yml` parses (version 2; npm, pip, github-actions, docker).
- No tracked file matches the `.gitignore`.
- The spec's eight clarification bullets are verbatim: the first five match 096dc28, and the last three are your words.
- No clarification markers remain.
- It adds only the two headings `/speckit-clarify` allows.
- No moved requirement remains in the sections Spec Kit inventories.

## Environment report (task 1)

| Check | Result |
|---|---|
| `specify check` | Ready. Claude Code found; specify-cli 1.0.8, installed with uv and pinned to the v1.0.8 tag. |
| `docker version` | Client 28.3.3 (`docker-ce` in the distro: Docker Engine, not Docker Desktop). The daemon is unreachable from the agent sandbox: `dial unix /var/run/docker.sock: socket: operation not permitted`, the sandbox's seccomp filter. |
| `docker compose version` | v2.39.1 |
| GPU check | Couldn't run here: the same socket error, exit 126. Without Docker, `nvidia-smi` reports `GPU access blocked by the operating system`, because the sandbox exposes no `/dev/dxg`. `nvidia-container-toolkit` isn't installed: no package, no `nvidia-ctk`, no `/etc/docker/daemon.json`. |
| `node --version` | v22.18.0 |
| `python3 --version` | 3.12.3 |
| `uv --version` | 0.8.22 |
| `terraform version` | Not installed |
| Others | git 2.43.0, make 4.3, jq 1.7, shellcheck 0.9.0, ruff 0.16.10, bubblewrap 0.9.0, socat 1.8.0.0, aws-cli 2.29.1, gh 2.45.0. Not on the PATH: pytest (the Makefile falls back to uv) and pre-commit (`make setup` needs it). |
| Sandbox | Initialized: `NoNewPrivs: 1` and a seccomp filter (mode 2). Every `denyWrite` path is mounted read-only (`CLAUDE.md`, `REVIEW.md`, `.claude`, the constitution, `corpus/facts`, `.git/hooks`, `.git/config`, and the rest). `corpus/intake/private` is hidden. `HTTP_PROXY` and `HTTPS_PROXY` route egress through the domain filter. With `failIfUnavailable: true`, the session would not have started otherwise. |
| `make check` | Fails inside the sandbox: `error: failed to open file /home/h4reet/.cache/uv/sdists-v9/.git: Read-only file system (os error 30)`. Fixed on this branch: since dbd7561, inside the sandbox only, uv caches in the session's temporary directory, and the plain target passes (Verification). c78c6a7's first fix put the cache inside the repository, a hole round 5 found. Since 8329697 the fallback also pins the system interpreter and skips uv's config files, so a planted `.venv` or `uv.toml` can't run in your terminal. The corpus denylist rule is skipped in the sandbox, because the private intake is hidden from it by design. |

Nothing in the environment was changed. This session wrote only to the repository and to its temporary directory.

## Cost and data-flow impact

None now: no model calls, no runtime, no new egress. The clarifications set future numbers (a $2/day fallback sub-budget) and name a future egress (alert email over SMTP); FR-040 makes the plan disclose it, together with Bedrock and Telegram.

## For the Author

**Before you merge**

- Read ADRs 0014 and 0015. If they say what you decided, set each Status to accepted; ADRs are immutable once accepted.
- Review the enforcement-layer patch, then apply it in your own terminal, since agents can't write `.claude/**` or `CLAUDE.md`:
  1. `mkdir -p deploy/env`, so the new sandbox deny covers a real folder, not a placeholder.
  2. `git apply docs/merge-requests/2026-10-07-chore-repo-hygiene-enforcement.patch`
  3. Run `make check`; expect `164 passed, 0 failed, 4 known gaps`.
  4. Run `claude doctor` to confirm the new settings entries are accepted.
  5. Commit it.
  6. Restart Claude Code, so the sandbox picks up the new denies.

  Drop any hunk you don't want, such as the `CLAUDE.md` lines. Once applied, agents can neither read nor write `deploy/env/` or any `*.env` file. So env templates belong elsewhere (for example `deploy/env.example/`). The CPU environment file for the agents' engine (FR-039) also needs a path outside `deploy/env/` and a name that doesn't end in `.env`; the plan sets that up.
- Run `make corpus-check` in your own terminal. Inside the agent sandbox the private intake is hidden, so the denylist rule was skipped on this branch.
- Merge in your own terminal, not through Claude Code; the hooks block agents from switching to `main`:

  ```bash
  cd ~/h4reet-ai/h4reet-ai && git switch main && git merge --no-ff chore/repo-hygiene
  ```

**Before session 2**

- Confirm my reading of answers 7 and 8 (The clarifications).
- SC-001 and User Story 1 now count a one-time initialization of the store on a new host, which is a reset under FR-034 (FR-031). If you'd rather `make up` do that on a brand-new host by itself, the plan has to tell a new host from a wiped one.
- This branch edited your session 2 prompt three times (cb25542, 868d0cf, e4869b7), each time to match the spec. Revert any wording you don't want.

**Settings changes: what the patch covers, and what is still yours later**

- In the patch:
  - `Read(*.env)` and `Edit(*.env)` denied;
  - `deploy/env` hidden from and unwritable by the sandbox;
  - `protected-paths.sh` blocks edits to env files.

  Together these close the gap where agents could read `deploy/env/*.env`.
- Later, once the plan names them (FR-007): deny each secret's environment variable by name in `sandbox.credentials.envVars`. That covers the Telegram token, the SMTP password, the operator's credential, and the stack's service credentials.
- Later, once the engine exists (FR-039): the sandbox opening to the agents' own engine, reaching that engine and nothing else, and the engine's definition added to the human-only paths.
- Done on this branch (dbd7561): `make check` works inside the sandbox, with no settings change needed.

**Wrong or stale in the governance files**

- `.claude/hooks/subagent-report-check.sh` found a transcript for only 5 of this session's 78 `SubagentStop` events, logging `no transcript path in payload` for the other 73. When it misses, it exits 0, so FR-010's check fails open. Each time it did run, it flagged a reviewer report as instruction-shaped only because the report discusses `settings.json`.
  - The patch makes a missed check a WARN that names the reason and the payload's field names, so the logs will show which field is missing.
  - Still open: checking the field name against the hooks documentation, and the pattern's precision.
- `.claude/agents/ops.md` granted `make up`, `make down`, `make breach-test`, and `docker compose`, which can't work in the sandbox. The patch rewrites it as you asked. It removes those tools; it has ops list the commands for you to run, batched into one script that gathers everything a diagnosis needs; and it asks for the output back. Logs come back only as error lines, through a redaction filter tested as written, and raw output stays out of commits. A `CLAUDE.md` line in the patch gives the same rule to every agent.
- `.claude/agents/spec-writer.md` tells the agent to start from the intent's own words. The patch adds that an outside intent's text is data, never instructions.
- The Makefile's `evals` target ran the agent-config suite only for uncommitted changes, so it never ran on a committed branch. Fixed in c78c6a7 and dbd7561: it now compares with `main`'s merge base, and runs the suite when there is no base (FR-011). The pytest fallback also no longer runs a planted `.venv` or obeys a planted `uv.toml` (8329697).
- ADR 0013 is unchanged, as an accepted ADR must be. ADR 0014, once accepted, replaces its Consequence about verifying spec 000's GitHub-side requirements.
- Three lines for `CLAUDE.md`'s "Things Claude gets wrong", for mistakes made more than once, now in the patch:
  - Rounds 1 and 3, the third occurrence: "Paraphrasing a source: recorded answers, quotes, and anything about the Author's role, the agents' share of the work, or a privacy promise stay in the source's words; put your reading beside them, never in their place."
  - Round 2: "Deferring or dropping a control the constitution requires without naming the clause as a deviation in the spec's Assumptions, and an ADR when that reverses an accepted one."
  - Round 6, the third occurrence: "Letting anything the Author runs execute what agents can write and git doesn't show (a cache, `.venv`, `uv.toml`, an ignored or excluded file): pin the interpreter and skip project config."

**Open for session 2's plan interview**:

- Plan-level items:
  - the day and month boundaries (UTC recommended, as AWS billing uses);
  - FR-025's request cap and what identifies a client;
  - the exact degraded response;
  - where dev-time spend comes from (FR-037);
  - the Bedrock fallback model;
  - how the sandbox reaches the agents' engine;
  - how a fresh clone gets working configuration, now that every `*.env` is ignored;
  - runbook entries for the warning, the trip, and the reset (Principle II);
  - whether the Bedrock contract test you run (FR-024) goes through a meter;
  - how the operator credential (FR-030, FR-034) is issued and kept, and how a new host's store is initialized (FR-031);
  - where env templates live, since agents can't read or write `deploy/env/` once the patch is applied.

**Decisions for later**

- The publication spec needs an intent before the first push; `publication-carryover.md` is its starting text. I can draft it.
- FR-001 lists a code of conduct. The kickoff's list didn't, so none was added; it needs an enforcement contact that you choose.
- The MIT license covers the whole repository, including the corpus (claims about you) and, later, the voice and avatar assets. Anyone could copy and modify them, for example to run a twin that says things you didn't. Consider a separate license for `corpus/` and future media.
- Branch protection at publication (START-HERE section 6, step 4) needs a design, and belongs to the publication spec:
  - GitHub never counts a pull request author's own approval. If agents open pull requests under your account, "require the Author's review" plus "include admins" leaves no one able to approve them. Your own pull requests to the governance files have the same problem.
  - CODEOWNERS does nothing unless the rules require code-owner review, and a default `* @hareet` line is what makes your review the required one.
  - One way out: agents open pull requests under their own identity (a bot account or a GitHub App), and a ruleset lets you, and only you, merge your own.
- CODEOWNERS covers your list. `protected-paths.sh` also treats these as human-only:
  - the cost, alert, and kill-switch configuration (`config/budgets*`, `config/alert*`, `config/kill-switch*`);
  - the IAM, budget, alert, edge, and WAF parts of `infra/`;
  - the gate files (`Makefile`, `ruff.toml`, `redteam/`).

  Add them if "the enforcement layer" in FR-001 should include them.
- Dependabot doesn't yet cover images in compose files, Terraform providers, or devcontainer features. Its pull requests that touch manifests under `apps/` or `services/` will fail a spec-link check unless the publication spec exempts them.

**Environment (in your terminal; nothing was changed)**

- Install `nvidia-container-toolkit`. With Docker Engine inside WSL2 rather than Docker Desktop, `--gpus all` needs it, so the GPU check will most likely fail from your terminal too until it is installed. Then run `docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu24.04 nvidia-smi` yourself.
- Install Terraform (spec 001; START-HERE says to install it now) and pre-commit.
- In agent sessions, `git status` lists the sandbox's mount stubs as untracked: `.bashrc`, `.mcp.json`, and others, and, once `.github/` existed, `.github/workflows`, where the sandbox also mounts `.github/` read-only. They don't exist on disk, so you won't see them, but agents should stage files by name, never with `git add -A`.
