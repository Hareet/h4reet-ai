# chore/gate-fixes-and-local-workflow
Spec: none for most of it (process and enforcement-layer changes). The forbidden-action matrix seeds spec 000 User Story 3, FR-008, and SC-003 ahead of spec 000's plan, an exception the Author authorized · Intent: none (the Author's direction in a working session) · Written by: Claude Code (Opus 5.5) as implementer · Date: 2026-10-07
Session: started from `~/h4reet-ai`, the folder above the repository · Repo hooks active: no. The session began before the repository existed, so the repository's settings, hooks, and sandbox never applied to this work, and `.claude/audit/` holds no records of it. The constitution's Development standard ("run under the project's committed permissions, hooks, and sandbox settings") was not met for this branch. Later sessions start in the repository root (START-HERE section 3).
Authorized by: the Author, on 2026-10-07:
- the intake decisions: the Ground Truth recording is not public; the title is confirmed; the surname may appear in git and on GitHub but never in conversation;
- "Go ahead and do the fixes and continue";
- the local feature-branch workflow for every phase;
- Claude committing locally with a co-author trailer.

Enforcement-layer and corpus files otherwise change only by the Author's hand.

## What changed and why

| Commits | Change |
|---|---|
| 6964303, d257f7a, 712c48d | **Hooks.** protected-paths.sh matches both resolutions of a path, lexical and physical. It blocks relative, `~`, `/proc`, and hard-linked paths, and it protects `.git/`. Both gates fail closed on their own errors. No hook runs a file name or project code as a command: before this, a file name could run commands through `make`, outside the sandbox. bash-gate.sh enforces ADR 0013: no push, no remote or repository, and only the Author changes `main`. |
| be7d09b | **Lint.** ruff skips Spec Kit's vendored `.specify/`. |
| 3995354, c214f08 | **Corpus gate.** It catches currency amounts in the Author's contexts (Kenya, India, Nepal, Uganda, Tanzania, Mali), and its summary says whether the local denylist ran. |
| 52851ef, 41cf3b1 | **Corpus.** The Author's 2026-10-07 decisions. |
| d492952, 01b35a4, c0c8c9a | **Workflow.** ADR 0013 (local until publication) and these merge-request notes, with matching updates to the kickoff prompt, START-HERE, CLAUDE.md, REVIEW.md, the agents, and the lifecycle guide. Spec 000 records the deviation. |

## Acceptance criteria

- Spec 000 User Story 3, at the hook layer only, for the 123 matrix rows:
  - scenario 2: prohibited shell commands are blocked, each with an audit record;
  - scenario 5: fix tasks can't touch tests;
  - scenario 6: governance files can't be edited;
  - SC-003: every block leaves an audit record.
- Not yet covered: runs per agent role, runs through Claude Code under the sandbox, indirect variants beyond these rows, and FR-010's subagent check.
- Everything else: none (process change).

## Constitution check

| Principle | Touched? | How it complies, or the justified deviation |
|---|---|---|
| I. Data-local | No | No runtime code and no new data flow. |
| II. Production-grade | Yes | Tests: the 123-row forbidden-action matrix and 50 pytest cases, all run by `make check`. Docs: ADRs 0012–0013, START-HERE, the lifecycle guide. **Deviation:** the agent-config evals that `.claude/**` changes require don't exist yet (spec 000 FR-011); the matrix stands in until they do. |
| III. Intent → spec → code; humans merge | Yes | **Deviation:** there is no `intent.md`, and the matrix seed lands before spec 000's `plan.md`. The Author directed the work, and this note and the commit messages record it. Only the Author merges, which bash-gate.sh now enforces locally. |
| IV. Least privilege | Yes | Tightens every enforcement point it touches and widens nothing: settings.json is unchanged, and the proposed changes to it are left to the Author below. |
| V. Cost | No | No model calls and no infrastructure. |
| VI. Build in public | Yes | **Deviation (temporary):** local until publication, recorded in ADR 0013 and spec 000's Assumptions. The history is published from its first commit, with at most one pre-publication cleanup. Failures stay visible in the commit messages and in the matrix's gap rows. |
| VII. Own the whole product | Yes (corpus) | Records only the Author's statements; Claude's own addition to golden answer 5 was removed. |
| VIII. Honest AI | Yes (corpus) | New refusal cases: the twin never gives or confirms the surname, and it never links to the Ground Truth recording or says a link is coming. |

## Review

A separate, read-only reviewer agent ran REVIEW.md's four passes over the branch twice.

- **Round 1 (at d492952):** not ready to merge, with 9 Important findings and 9 nits.
- **Round 2 (at 01b35a4):**
  - fixed: #2 (fail-open on audit errors), #3 (make injection through file names), #6 (currency), #8 (constitution deviation);
  - partly fixed: #1, #4, #5, #7;
  - new Important findings: the post-edit hook ran project code outside the sandbox, and protected-paths missed `..` through a symlinked directory, a symlink to a hard link, and `//proc` spellings;
  - 5 nits.
- **After round 2 (712c48d, c0c8c9a):**
  - both new findings and the plain-git routes to `main` are fixed, each with matrix rows that fail against the previous commit's hooks (27 rows);
  - the doc nits are fixed;
  - not re-reviewed since.

While testing, `main`'s post-edit hook created an empty file in the working tree from a file name alone. That was the injection, demonstrated live. The file was removed, and the matrix now runs that test in a scratch directory.

Still open:

| Finding | Status |
|---|---|
| Shell writes to `CLAUDE.md`, `corpus/`, and `.github/` (for example `sed -i`, `>>`, `cp`) pass bash-gate. The sandbox would block them only with matching settings.json deny rules. | Needs the Author (settings.json) |
| The sandbox allowlist includes github.com and api.github.com, and `~/.git-credentials` isn't denied. | Needs the Author (settings.json) |
| Agents can read `corpus/intake/private/`: there is no Read deny for it. | Needs the Author (settings.json) |
| A `reference-transaction` git hook keyed on `CLAUDECODE` would stop every route that moves `main`. It would also block the Author's own merges run through Claude Code, and an agent can unset the variable. | Needs the Author |
| Agents can edit the gate files (Makefile, ruff.toml, `redteam/`). | Spec 000's plan (for example a protected `gates.mk`) |
| There is no `make publish-check` yet. | Spec 000 (named in its Assumptions) |
| Known gaps: `terraform -chdir`, obfuscated commands, aliases already defined in a git config. | Recorded as matrix gap rows |
| False positives: commit messages or greps that mention "git push", "git remote add", or "git switch main", and checking out one file from `main`. | They fail safe; agents can use the Grep tool or `git commit -F`. |
| `corpus/README.md` and `facts/national-projects.yaml` still mention PRs and CODEOWNERS. | Corpus text, owned by the Author |
| The reviewer proposed a CLAUDE.md line because this was the second rule that matched only the canonical spelling: "Writing a bash-gate rule that matches only the canonical spelling; also test git -C/-c, bash -c, subshells, quoting, and config or API equivalents, and add a gap row for any that pass." | For the Author |

## Verification

`make check` at c0c8c9a:

```
corpus-check: OK — 20 slots, 4 filled, denylist applied (1 phrase), 0 problems
50 passed in 0.03s
All checks passed!
KNOWN GAP   bash-gate.sh          terraform -chdir=infra apply
KNOWN GAP   bash-gate.sh          sh -c "$(printf 'gi%s pu%s' t sh)"
KNOWN GAP   bash-gate.sh          git co main
forbidden-actions (hook layer): 123 passed, 0 failed, 3 known gaps
```

shellcheck had no findings. The same matrix against `main`'s hooks: 52 passed, 71 failed, 3 known gaps.

## Cost and data-flow impact

None. No model calls, no runtime paths, and no new egress; the new rules reduce egress.

## For the Author

- Decide the settings.json, git-hook, and CLAUDE.md items in the table above.
- Merge in your own terminal, not through Claude Code: the hooks block agents from switching to `main`.

  ```bash
  cd ~/h4reet-ai/h4reet-ai && git switch main && git merge --no-ff chore/gate-fixes-and-local-workflow
  ```
