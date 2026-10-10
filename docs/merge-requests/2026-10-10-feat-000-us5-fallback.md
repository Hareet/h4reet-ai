# feat/000-us5-fallback
Spec: specs/000-local-foundations/ (Phase 6, User Story 5: tasks T101–T108) · Written by: Claude Code (Opus 5.5) as the implementer and integrator, with one implementer agent in a worktree (T104 and T106); reviewed by read-only reviewer agents
Session: started from `~/h4reet-ai/h4reet-ai`, the repository root · Repo hooks active: yes
Authorized by: spec 000's plan.md and tasks.md; the Author's "Awesome job! Is there anything you can keep continuing on? I am stepping away and I want you to keep going! Group the things that I will check for later" (2026-10-10); and the standing rule to stack the next phase's branch while a finished one waits for its merge.

**Status: DRAFT. Not ready to merge.** The reviews of this branch are running; this note is a save point until they're applied. What's left:
- **T103's replay (an agent session, after T092):** `make contract-live` records, then hands the recording to `tools/gates/gate --contract-replay`, the gate's container phase. T092 builds the gate and now carries that mode. Until then the target stops before it calls anything (`PLANNED (T092)`).
- **T105 (yours):** Bedrock's identity, model, price, and route. It includes one decision below: the kind of SSO profile.
- **T107 (yours, Heavy):** quickstart.md §4 and §6.1 on prod: the fallback within 5 s, its cost on the dashboard (SC-005), and `make contract-live` for local and bedrock (SC-006).
- **This note:** the reviews, then the runs' results.

**Merge order:** this branch is stacked on `feat/000-us2-kill-switch` (9211a64). Merge the us1 stack, then US2, as their notes say. Then bring this branch up to date with main by US2's recipe plus one Makefile conflict ("Verification" below), and apply this branch's enforcement patch.

## Runs in the Author's terminal

ADR 0017 puts this section first. Nothing here has run outside the sandbox, and nothing here has called AWS.

| What | How it runs | Check before you run it |
|---|---|---|
| **`make aws-login`** and **`deploy/scripts/aws-login.sh`** (T104) | `bash` in your terminal, prod only | It runs `HOME=~/.config/h4reet-ai/aws-home aws sso login --profile h4reet-bedrock` with every `AWS_*` variable of your shell dropped and under `umask 077`. It refuses the agent sandbox, any argument, no `aws` on PATH, an `aws-home` or `.aws` that is missing, a symbolic link, another user's, or not 0700, and a config without `[profile h4reet-bedrock]`. It never reads the token cache, so it prints nothing secret. |
| **`make contract-live ENV= ADAPTER=local\|bedrock REASON=`** and **`scripts/operator.py contract-record`** (T103) | through `PY_HOST`, by path, with your real token | It refuses the agent sandbox, a missing reason or adapter, and bedrock off prod. Until `tools/gates/gate` exists (T092) it stops before any call. Then it records into a 0700 temporary directory, which it deletes, and replays in the gate's container phase with `--network none`. Bedrock's calls go through prod's admission as `test`: charged to the day and month, never to the sub-budget, about 10 calls under $0.05. |
| **The enforcement patch**, `docs/merge-requests/2026-10-10-feat-000-us5-fallback-enforcement.patch` | `git apply`, after the us1 stack's patches | Two bash-gate rules that refuse `make contract-live`, `make aws-login`, `operator.py contract-record`, `aws-login.sh`, and `aws sso login` to agents, and the matrix rows that switch from planned to block. It applies to this branch and to its merge with the us1 stack (`git apply --check`), and the matrix passes 262 rows, 0 failed, 11 known gaps, with it applied to that merge. |

## Decisions for you

1. **The SSO profile, and with it the SDK's token refresh (T102, T105).** `aws configure sso` asks for an optional session name.
   - **With one** (an `sso_session` profile), the CLI caches a refresh token. The SDK then refreshes the token in memory while prod runs, contacting `oidc.us-east-1.amazonaws.com` (plan.md §5.2's correction, disclosure row F2). The cache's `expiresAt` is the short access token's end, so the gateway reports no session end, and `credentials_expiring` never warns. fallback_unavailable says so once the session has ended.
   - **Left blank** (a legacy profile), there is no refresh token. The SDK never refreshes at runtime, so F2's runtime clause can go, and `expiresAt` is the session's end, so the 2 h warning works as the plan says.
   - **My recommendation is the legacy profile:** it keeps both the plan's "the Author runs `make aws-login`" and the disclosure's "at login". The code works either way; T105 confirms which one `make operator-status ENV=prod` shows after the first login.
2. **Whether `make contract-live` may replay any other way than the gate.** I made it wait for T092, since project code never runs outside a container in your terminal (plan.md §11), and the gate is that container.

## What changed and why

| Commits | Change |
|---|---|
| cb61985 | **T102:** `src/adapters/bedrock-converse.ts` (provider-adapter.md §3.2): the client and its c-ares agent shared with the credential chain, Converse both ways, §2.5's mapping, the health probe, and `close()`. `AdapterHealth` keeps the probe's `credentialsExpireAt`, which it had dropped; the 10 s ticker queues `credentials_expiring` once per session end; routing.yaml gets bedrock with its placeholder model. |
| 5c379e2 | **T103, the endpoint:** `POST /admin/adapters/{id}/complete` (operator-admin.md §5), through `Gateway.adapterCall`. The metered path is split so hello's answers are unchanged, and each attempt carries its span's keys. |
| ae1c0f5 | **T103 and T101:** `operator.py contract-record`, `make contract-live`, `live-cases.json`, and `replay.test.ts`. |
| 7a64881, 3ecb693 | **T104 and T106,** from the implementer agent: `make aws-login`; the dashboard's Bedrock readings, disclosure rows F1 and F2, and the two Bedrock runbooks. |
| c475acc | **The enforcement patch** and the matrix rows. |
| 463a07c | **No session end from a token cache holding a refresh token** (the agent's finding, decision 1). |
| 93ff7de | **The replay test's lint error** (see "Observations"). |

## Test files for your acceptance

New, for new behavior:
- `services/gateway/test/contract/bedrock-converse.contract.test.ts`, `bedrock-converse.errors.test.ts`, `replay.test.ts`, and `live-cases.json`;
- `services/gateway/test/unit/bedrock-wiring.test.ts` and `credentials-expiring.test.ts`;
- `services/gateway/test/integration/credentials-expiring.test.ts` and `adapter-calls.test.ts`;
- `services/gateway/test/helpers/stub-bedrock.ts`;
- `scripts/test_operator_record.py` and `scripts/test_contract_live.py`;
- `deploy/scripts/test_aws_login.py` (the agent's).

Existing ones, changed:
- `services/gateway/test/helpers/stack.ts`: a `configDir` option.
- `services/gateway/test/unit/registry.test.ts`: the registered types now name bedrock-converse, as its comment anticipated.
- `services/gateway/test/unit/config.test.ts`: its sample §1.3 error was the unregistered bedrock-converse type; it now passes the pre-T102 type set explicitly and keeps its assertions.
- `redteam/forbidden-actions.sh`: 22 rows added (16 planned, 3 gaps, 3 allow), none changed.
- `deploy/scripts/test_dashboard.py`, `evals/test_disclosure.py`, and `evals/test_runbooks.py` (the agent's): tests added for its changes.

No assertion was weakened.

## Review

Pending: two read-only reviewers, one for the gateway's code and one for the rest.

## Verification

- **The gateway's suite, on this branch,** at 463a07c: 686 passed, 13 skipped; tsc, ESLint (from 93ff7de), and Prettier clean.
- **`make check ENGINE_MODE=none-yet` on this branch alone:** `test` fails only `test_p18_the_model_file`, which the us1 stack fixed (T175), and `toolchain-check` is the known drift. To be pasted at the final commit.
- **`make check ENGINE_MODE=none-yet` on this branch merged with the us1 stack:** `sim/000-us5-on-us1-stack` (0fb9e35), this branch at 93ff7de merged with the stack at 903439e. It is US2's recipe plus one Makefile conflict: US5's `.PHONY` line with `aws-login`, then the stack's makefile guard, still last. The tree differs from `git merge-tree`'s result in four files alone (the Makefile, the disclosure, T117's bullets, the stand-in's digest). Exit 2: every gate passes but `toolchain-check`; the gateway has 687 passing and 12 skipped, pytest 1669 passing; the matrix is PLANNED for T117's 13 rows and this branch's 16. To be pasted whole at the final commit.

## For the Author

1. **After US2 merges:** bring this branch up to date with main by the recipe above, then `git apply docs/merge-requests/2026-10-10-feat-000-us5-fallback-enforcement.patch` and commit it.
2. **Decide** decision 1 before T105, and say whether decision 2 stands.
3. **T105:** the identity, the model, the price, and `fallback: bedrock` on prod's route; then `make aws-login`, and `make operator-status ENV=prod` to see the session's end.
4. **T107, Heavy:** after T092 for `make contract-live`.
5. **Accept the test files** above, or say what each should be instead.

## Observations

- **I ran `make contract-live` with `SANDBOX_RUNTIME` unset once,** to see its later refusals while writing them. It stopped at its own checks before calling anything. That spelling is one the enforcement patch refuses.
- **A wrong claim, corrected:** ae1c0f5's message said ESLint was clean, but ESLint hadn't run since the replay test was added; `make check` caught the lint error, fixed in 93ff7de.
- **The T104/T106 agent's findings for T107:** Prometheus 3.15 here ingests no zero at a new series' start, so the cost table's `increase()` may show the first call of a new `aws.bedrock` row as 0; and preflight P19 follows symbolic links, so a linked `H4_AWS_DIR` passes (aws-login.sh refuses links; P19 is left, since changing it changes env-files.md).
- **Reviewers' Bash grants aren't enforced** until the closing patch (T117).
