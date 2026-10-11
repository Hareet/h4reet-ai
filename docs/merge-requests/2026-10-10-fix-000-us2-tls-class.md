# fix/000-us2-tls-class
Spec: specs/000-local-foundations/ (User Story 2: task T190) · Intent: specs/000-local-foundations/intent.md · Written by: Claude Code (Opus 5.5): an implementer subagent in a worktree (dd8ca3c, b8745d2), the integrating session (46e9226, the review's fix in 111b804 and aba63f7, this note) · Date: 2026-10-10
Session: the implementer worked in `/tmp/claude-1000/wt-t190`, launched from `~/h4reet-ai/h4reet-ai` · Repo hooks active: yes (the gate refused two of the implementer's commands, both for naming git's hooks configuration; none was respelled)
Authorized by: spec 000's tasks.md T190 (round 8's review of the us2 branch), and the Author's direction of 2026-10-10 to continue down spec 000.

**Merge order:** branched from a81ea0f, the tip of `feat/000-us5-fallback`. Merge it after US5 and before US3, or beside it: `feat/000-us3-governance` also starts at a81ea0f, and the two touch different lines of tasks.md.

## What changed and why

A certificate that failed to verify on the email channel, on 465 or after STARTTLS, was classed `smtp_ESOCKET`, so the runbook's `tls` guidance never fired for the most common TLS failure. nodemailer 10.0.16 hands the TLS socket's error to `_onSocketError`, whose `_formatError` overwrites its code with `ESOCKET` on the error itself, and it gives no way to listen on the TLS socket it puts over the connection.

| Commit | What |
|---|---|
| dd8ca3c | **The tests, first.** `services/gateway/test/integration/smtp-tls.test.ts` runs SMTP servers on loopback with certificates made at run time (`test/helpers/test-certs.ts`, from `node:crypto`; nothing committed). 6 of its 12 tests fail at this commit, each with `smtp_ESOCKET` where `tls` is due. |
| b8745d2 | **The fix** (`services/gateway/src/alerts/smtp.ts`), and the runbook's `tls` entry. The TCP socket the gateway connects (T189) marks each error it raises itself, ahead of nodemailer's listeners. `getSocket` hands nodemailer TLS options of the connection's own: the transport's, with Node's `checkServerIdentity` wrapped to note that the certificate passed. An `ESOCKET` the TCP socket didn't raise came from the TLS socket. Before the certificate passed, it is a failed handshake, rethrown as a fresh `ETLS` error, which `smtpErrorClass` classes `tls`, with nothing of the certificate or of Node's message in it. |
| 46e9226 | **The record:** tasks.md ticks T190; contracts/alerts.md §4.1 gets a T190 paragraph on what `tls` covers on email. |
| 111b804 | **The review's tests, first:** on 465, a connection the server drops (FIN, or a reset) 30 ms after the accept, before sending a byte. Both fail at this commit with `tls`. |
| aba63f7 | **The review's fix:** `failedHandshake` also needs the server to have sent a byte (the TCP socket's `bytesRead`, which keeps counting under TLS). A drop before any server byte keeps `smtp_ESOCKET`, as before T190. The runbook, the contract, and tasks.md say so. |
| this commit | The contract's note that a close during a STARTTLS upgrade can be nodemailer's own `ETLS` (the same class), and this note. |

**Unchanged:** every other class. A timeout is `timeout`; a reply is its code (a refused STARTTLS is `smtp_454`); a reset before STARTTLS, or after the certificate passed, is `smtp_ESOCKET`; a refused connection or an unresolvable host is `connect`. TLS verification itself is unchanged: `rejectUnauthorized: true`, TLS 1.2 at least, and Node's own identity check, whose result the wrapper returns.

## Acceptance criteria

- **T190:** "Class a TLS certificate failure on the email channel as `tls`, not `smtp_ESOCKET`." `smtp.ts`'s `failedHandshake` and the transport wrapper.
- **T190:** "Prove it with a certificate that fails to verify, on 465 and after STARTTLS, and keep the class to `tls` with no certificate detail." `smtp-tls.test.ts`: a self-signed certificate, and a trusted one naming another host, each in both modes; and the test that no log record or outbox row holds the certificate's names, fingerprints, serial, or Node's message.
- **contracts/alerts.md §5:** "Provider or channel response bodies. Only error classes are kept." The fresh error carries a generic message, and only the class is returned.
- **T190's text** says "Only a refused STARTTLS … gives `ETLS`, and so `tls`". A refused STARTTLS stays `smtp_454`, because the reply code comes first; a test pins it, and tasks.md records the correction.

## Constitution check

| Principle | Touched? | How it complies |
|---|---|---|
| I. Data-local | no | No new byte leaves: the email channel sends the same SMTP and TLS as before. |
| II. Production-grade | yes | Tests first, the runbook entry the class points at, and the contract's paragraph. No new telemetry: the class reaches the `alert.retry` and `alert.failed` log records (the dashboard's alert log) and the outbox's `email_error`, as before. |
| III. Spec before code | yes | T190 is in tasks.md; the tests precede the fix in both rounds (dd8ca3c, then b8745d2; 111b804, then aba63f7). |
| IV. Least privilege | yes | Certificate checks are unchanged; two mutations that would weaken them fail the tests (the review's). No secrets: certificates are made at run time, and nothing of one is recorded. |
| V. Cost | no | No model call; nothing metered. |
| VI. Build in public | yes | The inference, and the two nodemailer behaviours it relies on, are written down in the code, the contract, and here. |
| VII, VIII | no | |
| Governance: test files | yes | The implementer wrote the new test file first, then changed it after the fix existed (tsc, Prettier, readability, and one added assertion; none weakened), so git can't show the test as first written. For the Author's acceptance, as T189's were. The review's two tests were committed red before their fix, and only their cleanup line changed after the fix existed. |

## Review

A reviewer agent that didn't write the change read `a81ea0f..46e9226`: nodemailer 10.0.16's source, Node 22.18's `_tls_wrap.js`, and experiments that import the branch's `smtp.ts` read-only. **No blockers; certificate checking is not weakened.** Its findings, and what was done:

| Finding | Done |
|---|---|
| **Important, the Author's decision:** the implementer wrote and then reshaped its own failing test during a fix task. The reviewer verified that, against dd8ca3c's code, exactly the six `tls` tests fail, and the other six pass. | For your acceptance (For the Author, 1). |
| **Should-fix:** verified only on Node 22.18, while the image runs Node 24.21. | The 14 tests pass on Node 24.21 (`~/.nvm`'s, the pinned version): Verification. |
| **Should-fix:** on 465, a server that drops the connection before sending any TLS (a load balancer with no backend, a rate limiter) was classed `tls`, sending the operator to the certificate. | 111b804 (tests, red) and aba63f7 (fix): such a drop keeps `smtp_ESOCKET`. |
| **Nit:** the "per connection" state is per transport; a later change that reused a transport (a pool, or `verify()` beside `sendMail`) would let a second connection reset the first's flag. | Not changed: `sendEmail` makes one transport per send, and the code says so. A pool would need state keyed by the failing socket. |
| **Nit:** the note said the class reaches `h4.alerts`. | Corrected above: the class reaches the alert log records and the outbox, not the metric's attributes. |
| **Nit:** the note was behind the branch, and summarized the checks' output. | This note: final, with the outputs pasted. |
| **Nits:** "seven mutations" against a table of eight rows; the contract's "nodemailer reports all of these as ESOCKET" missed its own `ETLS` on a close during the upgrade. | tasks.md says seven targeted mutations and the full revert; the contract names the `ETLS` case. |

The reviewer's experiments confirmed both nodemailer behaviours the inference relies on (`ESOCKET` only from a socket's error event; `getSocket`'s object merged into the connection's options), that no other class changed, and that nothing leaks. It proposed a CLAUDE.md line, the second time a fix's test was reshaped after the fix: "Writing a fix's failing test yourself and reshaping it once the fix exists: commit the test before any fix code, leave it untouched after, and name it for the Author's acceptance."

## Verification

**The TLS tests**, at aba63f7, five runs in a row on the sandbox's Node 22.18 and one on Node 24.21:

```text
      Tests  14 passed (14)      (Node 22.18, run 1 of 5; runs 2 to 5 the same)
      Tests  14 passed (14)      (Node 24.21: PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" npx vitest run test/integration/smtp-tls.test.ts)
```

**Mutations,** each run against the tests (the implementer's eight, the review's two, and aba63f7's one):

| Mutation | Tests that fail |
|---|---|
| The whole fix reverted (dd8ca3c) | the 6 `tls` tests |
| The TCP socket marks none of its errors | the reset before STARTTLS |
| The identity check never notes a pass | the reset after the certificate passed, both modes |
| Any unmarked error before the pass is `tls`, not only `ESOCKET` | the refused STARTTLS |
| The connection's TLS options drop the transport's | the deliveries, both modes |
| The identity check asks for another name | the deliveries and the resets after the pass, both modes |
| nodemailer gets the transport's TLS options alone | the resets after the pass, both modes |
| A failed handshake passed on as nodemailer gave it | the 6 `tls` tests |
| The wrapper returns `undefined` (the review's) | 3 tests |
| `rejectUnauthorized: false` in the connection's options (the review's) | 7 tests |
| `failedHandshake` without the server-spoke check (111b804) | the two drop tests |

**`make lint`** (exit 0):

```text
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
156 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/scripts/aws-login.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh redteam/forbidden-actions.sh tools/gates/install-tools.sh
make lint exit=0
```

**`make test PYTEST_ARGS="-q -p no:cacheprovider --import-mode=importlib --tb=line"`** (exit 2, one failure this branch doesn't touch):

```text
python3 -I -B -X pycache_prefix=/dev/null corpus/tools/check_corpus.py
corpus-check: OK — 20 slots, 4 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems
npm test --workspaces --if-present

> @h4reet/gateway@0.1.0 test
> vitest run

 RUN  v5.0.3 /tmp/claude-1000/wt-t190/services/gateway

 Test Files  49 passed (49)
      Tests  746 passed | 13 skipped (759)
   Start at  18:55:01
   Duration  57.06s (tests 95%, import 3%, transform 2%)

pytest -q -p no:cacheprovider --import-mode=importlib --tb=line corpus/tools evals redteam tools/gates deploy/scripts deploy/agents-engine scripts
........................................................................ [  4%]
........................................................................ [  8%]
........................................................................ [ 13%]
........................................................................ [ 17%]
........................................................................ [ 22%]
........................................................................ [ 26%]
........................................................................ [ 31%]
........................................................................ [ 35%]
........................................................................ [ 39%]
........................................................................ [ 44%]
........................................................................ [ 48%]
................F....................................................... [ 53%]
........................................................................ [ 57%]
........................................................................ [ 62%]
........................................................................ [ 66%]
........................................................................ [ 70%]
........................................................................ [ 75%]
........................................................................ [ 79%]
........................................................................ [ 84%]
........................................................................ [ 88%]
........................................................................ [ 93%]
........................................................................ [ 97%]
........................................                                 [100%]
=================================== FAILURES ===================================
E   assert 'engine.sh seed' in "qwen2.5-0.5b-instruct-q4_k_m.gguf has the lock's size, mode 0444"
     +  where "qwen2.5-0.5b-instruct-q4_k_m.gguf has the lock's size, mode 0444" = Result(check='P18', status='PASS', reason="qwen2.5-0.5b-instruct-q4_k_m.gguf has the lock's size, mode 0444").reason
/tmp/claude-1000/wt-t190/deploy/scripts/test_preflight.py:998: assert 'engine.sh seed' in "qwen2.5-0.5b-instruct-q4_k_m.gguf has the lock's size, mode 0444"
=========================== short test summary info ============================
FAILED deploy/scripts/test_preflight.py::test_p18_the_model_file - assert 'en...
1 failed, 1623 passed in 24.72s
make: *** [Makefile:228: test] Error 1
make test exit=2
```

`test_p18_the_model_file` reads this host's `/run/h4agents/models`, which now holds the seeded model; the us1 stack's T175 gave the tests their own fixtures, and this branch's base predates it.

**`make evals`** (exit 0):

```text
python3 -I -B -X pycache_prefix=/dev/null evals/run.py --suite product --adapter ${ADAPTER:-fake} $([ "${ADAPTER:-}" = local ] && echo --stack prod)
PASS  hello-fake
evals product (fake): 1 passed, 0 failed
python3 -I -B -X pycache_prefix=/dev/null evals/agent-config/static.py
PASS  CLAUDE.md is 56 lines and 5171 bytes (at most 60 and 6 KB)
PASS  CLAUDE.md names the constitution as superseding it
PASS  REVIEW.md names the constitution as superseding it
PASS  role docs: tools match roles.expected
PASS  role implementer: tools match roles.expected
PASS  role ops: tools match roles.expected
PASS  role red-teamer: tools match roles.expected
PASS  role reviewer: tools match roles.expected
PASS  role spec-writer: tools match roles.expected
PASS  hook .claude/hooks/bash-gate.sh is registered for PreToolUse Bash
PASS  hook .claude/hooks/protected-paths.sh is registered for PreToolUse Edit|Write|MultiEdit|NotebookEdit
PASS  hook .claude/hooks/post-edit-check.sh is registered for PostToolUse Edit|Write|MultiEdit
PASS  hook .claude/hooks/subagent-report-check.sh is registered for SubagentStop (every subagent)
      FR-007: 5 of 27 variables denied by name
PLANNED (T045): 22 FR-007 variables, hook .claude/hooks/content-scan.sh wait for the patch
  waiting: H4_OPERATOR_TOKEN SMTP_PASSWORD SMTP_USER GATEWAY_DB_PASSWORD GATEWAY_GRAFANA_RO_PASSWORD LANGFUSE_PUBLIC_KEY LANGFUSE_SALT LANGFUSE_ENCRYPTION_KEY LANGFUSE_NEXTAUTH_SECRET LANGFUSE_DB_PASSWORD LANGFUSE_INIT_USER_PASSWORD CLICKHOUSE_PASSWORD VALKEY_PASSWORD SEAWEEDFS_S3_SECRET_KEY GF_SECURITY_ADMIN_PASSWORD AWS_PROFILE AWS_CONFIG_FILE AWS_SHARED_CREDENTIALS_FILE AWS_WEB_IDENTITY_TOKEN_FILE AWS_ROLE_ARN AWS_CONTAINER_CREDENTIALS_FULL_URI AWS_CONTAINER_AUTHORIZATION_TOKEN
agent-config static: 0 failed, 23 planned
make evals exit=0
```

The 23 `PLANNED (T045)` marks are this branch's base, which predates main's b34626d, where the early patch was applied; on main they're cleared.

## Cost and data-flow impact

None. No model call, no new egress, and no new disclosure entry: the email channel sends what it sent before, and records only the class.

## For the Author

1. **Accept the new test files** (`smtp-tls.test.ts`, `test-certs.ts`, and `stub-smtp.ts`'s header comment): the Governance row above. The reviewer checked them against the code before the fix.
2. **The class is an inference, by design.** nodemailer gives no way to listen on the TLS socket it creates, so the gateway can't read a certificate error's own code. It relies on two things in nodemailer 10.0.16, which `package.json` pins exactly: its `ESOCKET` comes only from a socket's error event, and it merges `getSocket`'s object into the connection's options. A nodemailer upgrade should re-run `smtp-tls.test.ts` first.
3. **A refused STARTTLS is `smtp_454`, not `tls`,** as T190's text had it: the reply code comes first. Unchanged, and the runbook says so.
4. **A midnight flake, not this branch's:** `test/integration/init.test.ts` failed 7 tests once when `make test` ran across 00:00 UTC (journal records written for the day before). It passed on the next run. It may want a task.
5. **The us2 note's "Node can't mint a certificate"** no longer holds: `test-certs.ts` does it with `node:crypto`. SMTP over TLS with certificate checks is now proven on loopback, though still not against a real provider.
