# fix/000-us2-tls-class
Spec: specs/000-local-foundations/ (User Story 2: task T190) · Intent: specs/000-local-foundations/intent.md · Written by: Claude Code (Opus 5.5) as the implementer, a subagent in a worktree, for the integrating session · Date: 2026-10-10
Session: the implementer worked in `/tmp/claude-1000/wt-t190`, launched from `~/h4reet-ai/h4reet-ai` · Repo hooks active: yes (`.claude/audit/hooks.log`, this session: `2026-10-11T00:05:38Z	bash	ALLOW	ls -la /home/h4reet/h4reet-ai/h4reet-ai/.claude/audit/ …`; the gate also refused two of this session's commands, both for naming git's hooks configuration)
Authorized by: spec 000's tasks.md T190 (round 8's review of the us2 branch), and the integrating session's direction.

**Status: DRAFT, for review.** T190's code, tests, and runbook entry are done. Still to come: the REVIEW.md passes from an agent that didn't write this; tasks.md's record of T190 and any plan.md line, which the integrating session writes; and the constitution-check skill's table, given by hand below until then.

**Merge order:** branched from a81ea0f, the tip of `feat/000-us5-fallback`. Merge after it.

## What changed and why

A certificate that failed to verify on the email channel, on 465 or after STARTTLS, was classed `smtp_ESOCKET`, so the runbook's `tls` guidance never fired for the most common TLS failure. nodemailer 10.0.16 hands the TLS socket's error to `_onSocketError`, whose `_formatError` overwrites its code with `ESOCKET` on the error itself, and it gives no way to listen on the TLS socket it puts over the connection.

- **The seam** (`services/gateway/src/alerts/smtp.ts`): the class is decided from what the gateway can see before nodemailer formats anything.
  - The TCP socket the gateway connects (T189) marks each error it raises itself, ahead of nodemailer's listeners. nodemailer's `ESOCKET` is always a socket's error event, so one the TCP socket didn't raise came from the TLS socket over it. Once TLS is over it, the TCP socket raises none of its own: a reset comes through the TLS socket too.
  - `getSocket` hands nodemailer TLS options of the connection's own, which nodemailer merges into the connection's options, as its types document. They are the transport's, with Node's `checkServerIdentity` wrapped to note that the certificate passed. Node runs that check only once the chain has verified, and the handshake ends when it passes.
  - An `ESOCKET` the TCP socket didn't raise, before the certificate passed, is a failed handshake. The transport rethrows it as a fresh `ETLS` error, which `smtpErrorClass` classes `tls`, with nothing of the certificate or of Node's message in it.
- **Unchanged:** every other class. A timeout is `timeout`; a reply is its code (a refused STARTTLS is `smtp_454`); a reset before STARTTLS, or after the certificate passed, is `smtp_ESOCKET`. TLS verification itself is unchanged: `rejectUnauthorized: true`, TLS 1.2 at least, and Node's own identity check.
- **The runbook** (`docs/runbooks/alert-channel-down.md`): the `tls` entry drops "until T190 lands", says what `tls` now covers, and that a refused STARTTLS gives its own reply code.
- **The tests** (`services/gateway/test/integration/smtp-tls.test.ts`, `services/gateway/test/helpers/test-certs.ts`): SMTP servers on loopback with certificates made at run time from `node:crypto`, the DER written by hand. No key or certificate is committed. They come first, in dd8ca3c, where 6 of the 12 fail; b8745d2 is the fix.

## Acceptance criteria

T190, per contracts/alerts.md §4.1's error classes, and §5 (only error classes are kept). The tests prove each part:
- `tls` for a self-signed certificate and for a trusted certificate naming another host, each on 465 and after STARTTLS, and for implicit TLS against a plain SMTP server.
- The class alone in the outbox and the log: the dispatcher's `alert.retry` record and `email_error` are `tls`, and no log record holds the certificate's names, fingerprints, or serial, or Node's message.
- Unchanged classes: a delivery once the certificate verifies, in both modes, with the transport's TLS settings reaching `tls.connect`; `smtp_ESOCKET` for a reset after the certificate passed, in both modes, and before STARTTLS; `smtp_454` for a refused STARTTLS.

## Constitution check

By hand: the constitution-check skill wasn't available to this agent.

| Principle | Touched? | How it complies |
|---|---|---|
| I. Data-local | no | No new byte leaves: the email channel sends the same SMTP and TLS as before. |
| II. Production-grade | yes | Tests for the behavior, and the runbook entry the class points at. No new telemetry: the class already reaches `h4.alerts` and the alert log. |
| III. Spec before code | yes | T190 is in tasks.md. The tests precede the fix (dd8ca3c, then b8745d2). plan.md and tasks.md are the integrating session's to update. |
| IV. Least privilege | yes | No secrets: certificates are made at run time, and nothing of a certificate is recorded. Certificate checks are unchanged. |
| V. Cost | no | No model call; nothing metered. |
| VI. Build in public | yes | The seam, and what it relies on in nodemailer, are written down here and in the code. |
| VII, VIII | no | |
| Governance: test files | yes | T190 had no failing test before this session, so the implementer wrote the new test file first. It changed after the fix was written for tsc, Prettier, and readability, and gained one assertion; none was weakened. `stub-smtp.ts`'s header comment changed too. For the Author to accept, as T189's were. |

## Review

Pending: REVIEW.md's passes, from an agent that didn't write this change.

## Verification

From the worktree, at b8745d2's content:
- `cd services/gateway && npx vitest run`: 49 files passed; 744 tests passed, 13 skipped (757). Before the change: 48 files, 732 passed, 13 skipped.
- `npx tsc --noEmit -p .`, ESLint, and Prettier on the changed files: clean.
- `make lint`: exit 0.
- `make test`: the gateway as above; pytest 1 failed, 1623 passed. The failure is `deploy/scripts/test_preflight.py::test_p18_the_model_file`, which predates this branch; the us2 note says T175 fixed it on the us1 stack.
- `make evals`: exit 0 (`hello-fake` passed; agent-config static: 0 failed, 23 planned).
- Mutations of the fix, each run against the 12 tests:

| Mutation | Tests that fail |
|---|---|
| The whole fix reverted | the 6 `tls` tests |
| The TCP socket marks none of its errors | the reset before STARTTLS |
| The identity check never notes a pass | the reset after the certificate passed, both modes |
| Any unmarked error before the pass is `tls`, not only `ESOCKET` | the refused STARTTLS |
| The connection's TLS options drop the transport's | the deliveries, both modes |
| The identity check asks for another name | the deliveries and the resets after the pass, both modes |
| nodemailer gets the transport's TLS options alone | the resets after the pass, both modes |
| A failed handshake passed on as nodemailer gave it | the 6 `tls` tests |

- The new test file passed 10 runs in a row, and 4 copies at once.

## Cost and data-flow impact

None. No model call, no new egress, and no new disclosure entry: the email channel sends what it sent before, and records only the class, as before.

## For the Author

1. **The seam is an inference, by design.** nodemailer gives no way to listen on the TLS socket it creates, so the gateway can't read a certificate error's own code. It relies on two things in nodemailer 10.0.16, which the contract pins: its `ESOCKET` comes only from a socket's error event, and it merges `getSocket`'s object into the connection's options. A positive capture would need the gateway's own TLS on 465 and, for STARTTLS, an override of nodemailer's private `_upgradeConnection` or a global `tls.connect` wrapper. I took neither.
2. **A refused STARTTLS is `smtp_454`, not `tls`.** T190's text says it gives `ETLS`, and so `tls`, but nodemailer attaches the reply, and the reply code comes first. That is unchanged, the runbook says so now, and a test pins it.
3. **The new test files**, for your acceptance (Governance row above).
4. **A midnight flake, not this branch's:** `test/integration/init.test.ts` failed 7 tests once when `make test` ran across 00:00 UTC (journal records written for the day before). It passed on the next run. It may want a task.
5. **The us2 note's "Node can't mint a certificate"** no longer holds: `test-certs.ts` does it with `node:crypto`. SMTP over TLS with certificate checks is now proven on loopback, though still not against a real provider.
