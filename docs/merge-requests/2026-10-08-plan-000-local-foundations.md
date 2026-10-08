# plan/000-local-foundations
Spec: specs/000-local-foundations/ · Intent: specs/000-local-foundations/intent.md · Written by: Claude Code (Opus 5.5), planning (the spec's touch-ups, the plan, the tasks); reviewed by six read-only reviewer agents in two rounds · Date: 2026-10-08
Session: started from `~/h4reet-ai/h4reet-ai`, the repository root · Repo hooks active: yes. `.claude/audit/hooks.log` records this session's commands (for example `2026-10-08T16:10:09Z bash ALLOW ls .claude/skills/ …`) and its blocks: bash-gate refused heredocs that contained a blocked variable name or a network tool, and those edits were rewritten so they no longer did.
Authorized by: the session 2 prompt in `docs/KICKOFF-PROMPT.md`; the Author's plan-interview answers of 2026-10-08 UTC, word for word in research.md ("The plan interview, word for word"); and the Author's messages, among them "Don't worry about terraform for now on an installation, you can just create boilerplate for when you get to that part." and "Keep going!"

## Runs in the Author's terminal

Nothing. This branch changes documents only: no Makefile, script, hook, settings, or configuration (ADR 0017 puts this section first).

## What changed and why

| Commits | Change |
|---|---|
| fcb5e8d, b01d52b, e39dafb | **Spec touch-ups** from the plan interview: the code of conduct moves to the publication spec (FR-001); UTC budget periods (FR-031); same-day renewal grants a fresh $2 (FR-030); agent sessions run on WSL with the devcontainer's tool versions (US3-1); and the Assumptions for the runtime identity and the WSL reading. |
| f969d4f | **plan.md and research.md.** The plan names everything the kickoff prompt lists, each with its cost (§18) and degraded mode (§19). Research holds one entry per decision, and hardware check 2's results. |
| 8c15b95 | **ADRs 0001–0006 and 0016–0022**, all `proposed`, and the index. |
| 85d689f | **The Author's answers word for word:** every Clarification, in both sessions, quotes the chosen option and its text, with readings beside them (CLAUDE.md's paraphrase rule). |
| b3aea9d, b1bdbeb | **data-model.md, the eight contracts, and quickstart.md.** |
| 47db416 | **tasks.md** (`/speckit-tasks`). |
| e7d5ab5 | **`/speckit-analyze` fixes.** The CRITICAL finding: real secrets would have been readable by agents from Phase 3 to Phase 8, so every credential deny moved into the early patch. `make check` gained PLANNED. |
| 7f69aeb | **A save point** at the usage limit, with the Haiku 5.5 price correction (below). |
| ed2f936 | **Review round 1's fixes:** 28 Important findings and the listed nits (see Review). |
| 4788b24 | **Review round 2's fixes:** 1 Important finding and 9 nits. |
| this commit | This note. |

## Acceptance criteria

- This branch is spec 000's planning stage. No FR or SC is met by running code here. It delivers what the constitution's Development Workflow step 3 asks for: "the files that change, the order of work, the risks, the proof, the cost impact, and the degraded-mode behavior".
- **FR-003:** ADRs 0001–0006 and 0016–0022 record this branch's decisions.
- **Coverage:** plan §20 maps every FR and SC to a section and a proof, and tasks.md maps them to 120 tasks. FR-015, SC-004, and User Story 4 moved to the publication spec (ADR 0014).
- **The spec's changes:** FR-001, FR-030, FR-031, US3-1, the Clarifications (both sessions, verbatim, with the confirmations of answers 7 and 8 added), and the Assumptions, which name two new deviations.

## Constitution check

| Principle | Touched? | How it complies, or the justified deviation |
|---|---|---|
| I. Data-local | Yes (design) | Local-first routing. Every flow that leaves the local tier is listed (plan §17), now including the devcontainer build and `make tools`. No visitor data flows. |
| II. Production-grade | Yes (design) | Tests, evals, telemetry, cost, runbooks, and a rollback that is one command and rehearsed (`make up REF=`, quickstart §1.12). |
| III. Intent → spec → code | Yes | The accepted intent and the clarified spec come first; no code on this branch. **Deviation:** local until publication, with notes in place of PRs (ADR 0013). |
| IV. Least privilege | Yes (design) | Every deny lands in a patch applied before the risk it guards (plan §15): four patches. The agents' own engine (FR-039). The Author's terminal runs only the gate and reviewed scripts, under `PY_HOST`. **Deviation, named in the spec:** the early patch gets the static agent-config tier only, because the behavioral tier is built later. |
| V. Cost | Yes (design) | The in-stack meter and kill switch, the $2/day sub-budget inside $5/day and $20/month, and reservations bound overshoot. The rebuild keeps a stated starting value; slots can't leak. |
| VI. Build in public | Yes | The history stays publishable, and `make publish-check` scans it (FR-042). **Deviation:** local until publication (ADRs 0013, 0014). |
| VII. Own the whole product | Yes (records) | The Author's answers are quoted word for word, with readings beside them. No claim or number about the Author. |
| VIII. Honest AI | No | hello stays a fixed test endpoint, not the twin. |
| "Infrastructure exclusively via Terraform" | Yes | **Deviation, named in the spec:** the Author creates the runtime identity by hand until spec 001 imports it. |
| Development Workflow step 6 | Yes | Rollback is met locally. **Deviation:** building once and promoting waits for CI (ADR 0014). |

## Review

### `/speckit-analyze` (before review)

Findings: 1 CRITICAL, 2 HIGH, 5 MEDIUM, and 7 LOW. Every requirement mapped to a task.
- **C1 (Principle IV):** credential denies arrived after the first secrets. Fixed in e7d5ab5, as were H2, M1–M5, and L1–L5.
- **H1 and L6:** left for the Author (below).
- **L7, the incident-eval rule:** already covered. The incident draft's Constraints say "an eval that would have caught this" (contracts/alerts.md §7).

### Round 1 (at e7d5ab5)

Four read-only reviewer agents, one slice each, ran REVIEW.md's four passes:

| Slice | Important | Nits | Verdict |
|---|---|---|---|
| plan, research, spec, ADRs | 6 | 18 (5 listed) | request changes |
| data model and gateway contracts | 4 | 20 (5 listed) | changes requested |
| alerts, telemetry, env files, agents' engine | 1 | 7 (5 listed) | request changes |
| tasks and quickstart | 17 | 17 (5 listed) | not ready |

REVIEW.md caps nits at five per review, so I never saw the nits beyond those five.

ed2f936 fixes every Important finding except the gateway's open egress, which is the Author's call (below). The main changes:
- **Denies before risks.** The early patch now also carries:
  - the config denies, applied before the first paid route;
  - the denies on `GNUmakefile` and `makefile`;
  - the deny on `deploy/agents-engine`;
  - `.gitleaks.toml`, with explicit flags, so a planted `.gitleaks.toml`, `.gitleaksignore`, or `gitleaks:allow` can't switch a rule off.

  A new governance patch protects the gate and the agent-config evals when the gate first runs. (Research R-34, R-36.)
- **Prod runs the commit it was started from.** Before, prod reread `config/` and `deploy/` from the shared working tree on every restart, so it followed any branch an agent checked out. Host stacks now run a `git archive` export recorded in a run file, and always build their images from it. `make up REF=<previous>` is the rollback, and a newer schema refuses with exit 78. (R-33.)
- **The Author's terminal.**
  - `python3 -I` still loads a planted `__pycache__`, so every Python there runs as `PY_HOST`, by path. A reviewer reproduced the bypass. (R-35.)
  - `make check` and `make test` run `node_modules`, so the Author runs `tools/gates/gate` instead.
- **The agents' engine.**
  - The tree's mask list missed `secrets/`. It now comes from the sandbox's own read denies, and planted env files are refused.
  - The relay runs only `docker` or `make`, and ops gets `docker-relay docker *`.
  - The proxy fails closed on an unreadable list.
  - Preflight P15 made dev-cpu unstartable: about 13.2 GiB of summed limits against a 12 GB cap. The cap is now 16 GB (R-37).
- **The meter.**
  - A second store wipe could rebuild below a stated starting value; the last `init` record is now a floor.
  - In-memory slots leaked on three exit paths; they are now released in a `finally`.
- **Order.** Several tasks would have failed as written:
  - prod's first `make up` (P19);
  - Phase 2's routing file (rule R6);
  - the seed before the models' lock;
  - no task ran `make tools`;
  - three checks failed with no PLANNED mark.

  tasks.md is renumbered to 120 tasks, with every reference across the documents remapped and checked.
- **The spec** names the hand-made runtime identity and the static-only early patch as deviations.

I also found and fixed these while the reviewers ran:
- `.devcontainer/toolchain.env` matched the existing `*.env` deny rules and the compose policy, so it is now `toolchain.vars`.
- The price table's example filled a Bedrock placeholder inside an already published version, against its own append-only rule.
- The FR-010 subagent-report hook logs nothing for a clean check, and it flags any report that names `settings.json`. The closing patch fixes both.

### Round 2 (at ed2f936)

Two reviewers re-checked every round-1 fix and the task-ID remap. Every fix had landed, with two small residues.
- **New Important finding:** the export redesign left "restart the gateway" as the way to apply a config change or a rotated token hash. On a host stack that restarts on the same export, and a restart never re-reads env files. Fixed in 4788b24: a change takes effect at the next `make up`.
- **Nine nits,** all fixed in 4788b24, among them:
  - the rollback rehearsal's order;
  - a wrong citation;
  - the gateway's build context, now pinned inside the export;
  - what `down`, `logs`, and `status` do before a stack's first `make up`;
  - a note that T013's toolchain check needs the host's existing tools to match their pins.

### Feed back (REVIEW.md)

- **Second occurrence:** a deny scheduled after the risk it guards. It came up three times in one round. The early patch now proposes this CLAUDE.md line: "Scheduling a deny after the risk it guards: a secret, a paid route, or a file prod reads gets its deny in the same patch that creates it, or an earlier one."
- **Second occurrence:** "a restart applies the change". This one went into no patch, so it is yours to add or skip: "Don't say a config or env change takes effect on restart: a host stack reloads only on `make up`, and `docker compose restart` never re-reads env-file values."
- **A paraphrase in an accepted ADR.** ADR 0015 quotes the 2026-10-07 answer as keeping "the host's stacks" out of reach, but the option said "the prod stack". ADR 0016 notes it. ADR 0015 is yours to correct.

## Verification

`make check` at 4788b24, exit 0:

```
python3 corpus/tools/check_corpus.py
corpus-check: OK — 20 slots, 4 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems
git hook guarding main: installed
uv run --no-project --no-config --python /usr/bin/python3 --quiet --with pytest --with pyyaml pytest -q -p no:cacheprovider corpus/tools
..................................................                       [100%]
50 passed in 0.03s
ruff check .
All checks passed!
shellcheck .claude/hooks/*.sh redteam/forbidden-actions.sh
bash redteam/forbidden-actions.sh
KNOWN GAP   bash-gate.sh          terraform -chdir=infra apply
KNOWN GAP   bash-gate.sh          sh -c "$(printf 'gi%s pu%s' t sh)"
KNOWN GAP   bash-gate.sh          git co main
KNOWN GAP   bash-gate.sh          sh -c 'unset CLAUDE""CODE; git commit -m wip'
forbidden-actions (hook layer): 164 passed, 0 failed, 4 known gaps
```

Also checked:
- every relative link and anchor in the spec folder, the ADRs, and this note resolves (0 broken);
- tasks.md has 120 tasks, T001 to T120, each in the checklist format, and no reference points outside that range.

The corpus denylist is hidden from the sandbox, so rule 4 was skipped: run `make corpus-check` yourself before merging. Nothing here needed Docker or the GPU. Hardware check 2 ran in your terminal earlier (research.md R-01 to R-03, R-32).

## Cost and data-flow impact

None for this branch: documents only, no model calls from code, and no new egress. The session ran on the Team plan, with one web search to check Haiku 5.5's price.

The plan's own estimates are in plan §18:
- Bedrock spend is bounded by prod's ceilings, and under $0.10 is expected during spec 000;
- the other components cost $0 in the cloud.

## For the Author

### Decide before merging (or say you accept the plan's default)

1. **SC-003's wording** (analysis H1 and L6). SC-003 says "100% of the forbidden-action matrix is blocked", but the matrix keeps known gap rows that another layer contains, such as an obfuscated push with no remote to reach. Either block every gap row before acceptance, or reword SC-003 to count a contained gap, with the matrix report as the audit record for OS-level denials. Until you decide, the plan keeps the gap rows.
2. **The gateway's open egress** (round 1). The gateway's `egress` network has no destination limit. With no prod guard, a compromised dependency or an unreviewed branch's gateway could send the bot token, the SMTP password, or the SSO session anywhere. A stolen session could call Bedrock outside the meter until it expires, and spec 000 has no AWS Budgets. The runtime identity limits that to `bedrock:InvokeModel` on one model. Accept it for spec 000, or ask for a CONNECT allowlist now (research.md, "Rejected for now, revisit later").
3. **Haiku 5.5.** The option I recommended described it as "the cheapest Claude by list price". That wasn't verified: its price hadn't been published by 2026-10-08. If Bedrock doesn't offer Haiku 5.5, the plan uses Haiku 4.5 anyway. Does your choice stand?
4. **The dedicated `h4reet-runtime` user** (research.md R-17) is the plan's proposal. Confirm it, or decline, and the permission set goes on your own Identity Center user.
5. **Session 1's Clarifications rewrite** (85d689f): confirm that the verbatim quotes and the readings beside them are right.
6. **The ADRs:** accept, amend, or reject 0001–0006 and 0016–0022, all `proposed`.
7. **Human-only paths.** Veto any of these: `config/prices*`, `deploy/agents-engine/**`, `tools/gates/**`, `evals/agent-config/**`, `.gitleaks.toml`, `.gitleaksignore`, `.mcp.json` (ADR 0017 and plan §15).
8. **The engine's 16 GB cap** (R-37). Say if you'd rather lower dev-cpu's memory limits instead.

### Yours to commit

- `intent/002-the-room.md`, a draft of the room idea for a later phase, left uncommitted on purpose. Correct and commit it yourself.

### CLAUDE.md, by your hand

- One line in its Architecture section is stale. It says `services/relay` holds the kill-switch flag, but in spec 000 the kill switch lives in the gateway's own store (ADR 0020). Consider "the cloud tier's kill-switch flag (spec 001)".
- The early patch rewrites two other stale lines: the engine line, and the "until spec 000" note on `make check`.

### A hook to know about

`subagent-report-check.sh` checks reports, but it logs nothing when a check is clean. It also flagged a review report today (16:38:29Z) because the report named `settings.json`. The closing patch fixes both. The log also holds well over a hundred "no file at the transcript path" warnings, and I couldn't establish their source.

### Merge

Nothing to run first. In your own terminal:

```bash
cd ~/h4reet-ai/h4reet-ai && git switch main && git merge --no-ff plan/000-local-foundations
```

After it, Phase 1 (`feat/000-setup`) can start. Its Author step is T013: `make tools`, then `make toolchain-check`.
