# Implementation Plan: Alerts Designed to Be Read — An HTML Email, an Organized Telegram Message, and a Sample of Each

**Branch**: `feat/011-alert-message-design`, stacked on `feat/010-anthropic-provider`'s tip as it stands when [tasks.md](tasks.md) T001 runs, or cut from `refs/heads/main` if that branch has merged by then ([§14](#14-the-branch-and-the-order-of-work)) | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Status**: Planned on 2026-11-08, after the Author's answers to Q1 to Q5 (the spec's Clarifications). Choices this plan makes beyond the spec are marked "(plan choice)" and are the Author's to overturn. Code waits for his approval of the spec and this plan: `CLAUDE.md`, "Never write code without an approved `specs/NNN-*/spec.md` and `plan.md`" (tasks.md T000).

**Input**: [spec.md](spec.md) and [intent.md](intent.md), and the reads the spec's Input lists, on `main` at a5eb05b8. Also read, read only, in `feat/010-anthropic-provider`'s worktree, the base this work stacks on: `services/gateway/src/alerts/` (all five modules), `src/routes/admin.ts` (the writes, the audit actions, the auth-failure alert), `src/app.ts` (the dispatcher's construction and the admin deps), `src/config/validate.ts` (§4, `alerts.yaml`), `src/telemetry/metrics.ts` and `otel.ts`, `src/meter/crossings.ts` and `init.ts` (where alerts are queued), `migrations/0001` to `0005`, and the outline of `test/integration/dispatcher.test.ts`. And on `main`: `scripts/operator.py` (its parser and hop), the `Makefile`'s operator targets, `.claude/hooks/bash-gate.sh` (its helpers and its operator rules, whole), `redteam/forbidden-actions.sh` (its row kinds, its required-row registry, and its operator rows), `evals/standins/telegram_standin.py` and its test's outline, `evals/breach.py` and `evals/breach_probe.py` (the stand-in and admin operations), `evals/test_disclosure.py`, `deploy/grafana/dashboards/h4-runtime.json` and `deploy/scripts/test_dashboard.py`, `deploy/compose.yaml`'s stand-in, `.prettierignore`, and spec 000's data-model §2.6 and §2.7 and operator-admin §1.3 and §6.1. The Bot API's facts (the `entities` field, `MessageEntity`'s UTF-16 offsets, the 4,096 limit, the link-preview field, the FAQ's rate advice) and nodemailer's error fields are named from their documentation as this plan understands it; tasks.md T001 confirms each, and a difference becomes a departure recorded here.

**Conventions** (spec 010's plan's):
- **The Author's terminal**: commands only the Author runs, outside Claude Code.
- **Agent-editable** files are changed by agents and reviewed by the Author. **Human-only** files change only by the Author's hand; agents deliver their changes as patches in `docs/merge-requests/`, built from plain copies (`git show`, `git diff --no-index`), never by `git apply` or a write into any worktree.
- **Paths.** A file that exists only in a patch is named in a code span and never linked, since `evals/docs_links.py` fails a link to a missing file.

**Companions**: none. As specs 007 and 010 do, this plan keeps its design in its own sections, so the feature stays four documents (Complexity Tracking).

## Summary

- **Where the forms render** (§2): at each delivery attempt, in the dispatcher, from the outbox row's facts, which gain the values the forms show (version 2). The plain text is still rendered with its cause and stored, as today, so no designed form is ever rendered inside the transaction that commits a crossing (FR-025 by construction), and a row from before the change has no version 2 facts and goes plain (FR-030).
- **The renderers** (§3 to §5): pure functions of the typed facts, in modules of their own: the marks (severity, names, emoji, colours), Telegram's text and entities with UTF-16 offsets and a self-check, and the email's table HTML with bars and both palettes, under the designed subject, the two emoji and the first line. Golden files pin every catalogue entry's forms.
- **Never lost** (§6): one chooser decides each channel's form; a Telegram 400 or a mail server's permanent refusal of the message sends the plain form at once, in the same attempt, under one lease; once fallen back, a channel stays plain for that alert. Migration `0006_alert_forms.sql` records each channel's form and fallback reason.
- **Samples** (§7): `make operator-alert-samples` → `scripts/operator.py alert-samples` → `POST /admin/alert-samples`: one audit row, then the dispatcher holds the samples in memory, after due real alerts, one a channel at a time.
- **The stand-in and the breach test** (§8): the Telegram stand-in checks entities as the Bot API does and counts UTF-16; the probe reports each message's form, and a new last step sends the samples and finds each on both stand-ins.
- **Telemetry** (§9): `alert.deliver` spans, `h4.alert.form`, `h4.alert.fallbacks`, the record `alert.fallback`, a fallback panel, and the runbook's section.
- **The bash gate** (§11): no change needed; its existing rules cover the target and the subcommand, and new matrix rows prove it.

**What the Author does** (§13): approves; merges `feat/010-anthropic-provider`, then this branch; starts prod at the merge; sends the samples on prod and reads them on his phone and desktop, in light and dark (SC-010). No patch of his is required; one is optional.

## Technical Context

**Language/Version**: TypeScript 6.0.3 on Node 24 (spec 000's pins) for `services/gateway`; Python 3.12, standard library, for the stand-in, the probe, the breach test, the CLI, and the pytest checks; SQL; YAML and Markdown.

**Primary Dependencies**: none new (FR-052; the Author's "No new package"). nodemailer 10.0.16, already pinned, sends the HTML part beside the text; vitest's file snapshots hold the golden files.

**Storage**: one migration, `services/gateway/migrations/0006_alert_forms.sql` (§2.3): each channel's form and fallback reason on `alert_outbox`, and `alert_samples` among the audit log's actions. No column holds a rendered designed form, since the forms render at send time (D1).

**Testing**: vitest in `services/gateway`: unit (the facts and their round trip, the marks, the renderers, UTF-16 offsets, the allowlist, escaping, contrast, bounds, the canary, the golden files); integration on PGlite with the test clock and in-process stub Telegram and SMTP servers (the fallbacks, the lease, a crossing with failing renderers, the sample route, spec 010's alerts). pytest for the stand-in, the CLI, the `Makefile`, the dashboard, the disclosure, and the breach test's helpers. The forbidden-action matrix for the target's rows. The breach test on dev-cpu for the stand-ins end to end. Every check runs inside `make test`, `make evals`, the matrix, or the breach test, so no `CHECK_GATES` entry is added.

**Target Platform**: the gateway container on every stack; the Telegram stand-in on dev and dev-cpu.

**Project Type**: a change to the existing gateway's alert subsystem, with one admin route, one CLI subcommand and make target, and changes to the stand-in and the breach test. No new service, port, network, store, package, or env key.

**Performance Goals**: both designed forms rendered in under 5 ms an alert (plan choice, a unit benchmark); a refusal's plain send starting within 50 ms of the refusal's answer against the stub (plan choice); a full sample request delivered on dev-cpu within 120 s.

**Constraints**: the bounds, 1,000 and 2,000 UTF-16 code units and 32 KiB (FR-023); §4.2's 300 s window with a fallback's second send (rule A2, §6.3); no input or output inside the cause's transaction (FR-025); strict schemas, an unknown key an error; no payload in telemetry; `make up` always works.

**Scale/Scope**: 53 FRs and 12 success criteria; 19 catalogue entries and 7 further cases, four golden files each; one migration; one admin route; one CLI subcommand and make target; four disclosure rows; no required Author patch, one optional.

## Constitution Check

*GATE: passed before design and re-checked after it ([below](#constitution-check-post-design)).* Applied with the `constitution-check` skill's eight questions against the [constitution](../../.specify/memory/constitution.md) 1.0.1.

| Principle or standard | What this plan does | Verdict |
|---|---|---|
| I. Data-local by default | No visitor byte; rows A1, A2, S12, and S13 describe the richer forms in the change that sends them (§12.3); the HTML loads nothing (§5.4). The degraded mode, each channel's plain form, is built first (§6; tasks.md Phase 2) | PASS |
| II. Production-grade or not shipped | Tests first for every FR, golden files for every entry (§3.4); spans, metrics, logs, a panel, and a runbook section in the same change (§9); the cost and its measurement (§15); an ADR and the gateway's README (§12.2, §13) | PASS |
| III. Intent before spec, spec before code, humans merge | From the accepted intent and the Author's seven answers; spec 000's contracts amended by name; ADR 0005 extended by a new ADR; departures update this plan in the same commit; no agent merges | PASS, with the inherited deviation (ADR 0013) |
| IV. Least privilege | Nothing widened: the samples are an operator write behind the token, the `Makefile`'s guard, and the bash gate's existing rules (§11); `config/alerts.yaml` stays the Author's (§10); no secret, env key, or sandbox domain | PASS |
| V. Cost is a first-class signal | $0 in the cloud; no model call; samples touch no meter (§7.2) | PASS |
| VI. Build in public, including failures | The renderers, the golden files, and the matrix rows committed; fallbacks counted on a public panel | PASS |
| VII. Own the whole product, and say exactly what you owned | The product reasoning (severity first, the plain form kept, samples marked) in the spec, this plan's decisions, and the ADR | PASS |
| VIII. Honest AI | Not touched: no model, no twin | n/a |
| Security and agent governance | §5's canary over every form (§3.6); values escaped or carried as data (§4, §5); no dependency added; the implementer never reviews (tasks.md T048) | PASS |
| Technology standards | The same two free channels; degradation never waits on delivery, and a design never delays an alert (§6); one compose topology, unchanged | PASS |

Gate result: **PASS**, with the inherited deviation only.

## Project Structure

### Documentation (this feature)

```text
specs/011-alert-message-design/
├── intent.md     # the Author's words, verbatim; problem and outcome; accepted 2026-11-08
├── spec.md       # FR-001 to FR-053, SC-001 to SC-012, the Clarifications (seven answers), the amendments, the entries
├── plan.md       # this file: the design (§1 to §13), the order (§14), and the analyze pass (end)
└── tasks.md      # test-first tasks by phase, the Author's marked
```

### Source Code (repository root)

`[new]` a file this work creates; `[chg]` a file it changes; `[A]` the Author's own runs or files; `[P-A]` the optional patch.

```text
services/gateway/
├── migrations/0006_alert_forms.sql                          [new] each channel's form and fallback; alert_samples (§2.3)
├── src/alerts/format.ts                                     [chg] the facts, version 2 (§2.2); the plain text unchanged
├── src/alerts/facts.ts                                      [new] the facts' encoder and strict decoder (§2.2)
├── src/alerts/marks.ts                                      [new] severity, names, emoji, palette, by kind and variant (§3.1)
├── src/alerts/telegram-design.ts                            [new] text and entities, UTF-16 offsets, the check (§4)
├── src/alerts/email-design.ts                               [new] the HTML part, the bars, the designed subject (§5)
├── src/alerts/forms.ts                                      [new] each channel's form, and the fallback reasons (§6.1)
├── src/alerts/catalogue.ts                                  [new] the 19 entries' fixed facts; the samples' keys (§7.3)
├── src/alerts/telegram.ts                                   [chg] a message with entities, or the plain text (§4.4)
├── src/alerts/smtp.ts                                       [chg] the designed message, or today's; the refusal's class (§5.5)
├── src/alerts/dispatcher.ts                                 [chg] forms at send time, fallbacks, the lease, samples (§6, §7.4)
├── src/alerts/outbox.ts                                     [chg] REAL_KINDS and the sample key (§7.3)
├── src/routes/admin.ts                                      [chg] POST /admin/alert-samples; the audit action (§7.2)
├── src/config/validate.ts                                   [chg] alerts.yaml's formats (rule A8); rule A2's two sends (§10)
├── src/telemetry/metrics.ts, otel.ts                        [chg] h4.alert.form, the kind sample, h4.alert.fallbacks, alert_samples, alert.deliver (§9)
├── src/app.ts                                               [chg] the dispatcher's samples handed to the admin routes (§7.2)
├── README.md                                                [chg] an "Alerts" section (§13)
├── test/unit/{alert-facts,alert-marks,alert-forms,telegram-design,email-design,alert-catalogue,alert-goldens}.test.ts   [new]
├── test/unit/{alerts,telegram,validate-config,telemetry}.test.ts                                                   [chg]
├── test/integration/{dispatcher-forms,crossings-forms,alert-samples,alerts-anthropic}.test.ts                     [new]
├── test/integration/{dispatcher,migrations,smtp-tls}.test.ts                                                      [chg]
├── test/fixtures/alerts/<name>/{plain.txt,subject.txt,telegram.txt,email.html}                                    [new] the golden files (§3.4)
└── test/fixtures/config/alerts-formats.yaml                                                                        [new] the switch's fixture

.prettierignore                                               [chg] services/gateway/test/fixtures/alerts/ (§3.4)
config/alerts.yaml                                            [A] unchanged; `formats` is optional, the Author's to add (§10)
evals/standins/telegram_standin.py, test_telegram_standin.py  [chg] entities, UTF-16, the preview flag (§8.1)
evals/breach_probe.py, evals/breach.py, evals/test_breach.py, evals/test_breach_helpers.py   [chg] each message's form; step 12 (§8.2)
evals/test_disclosure.py                                      [chg] spec 011's words in A1, A2, S12, S13 (§12.3)
scripts/operator.py, scripts/test_operator.py                 [chg] alert-samples (§7.5)
Makefile, scripts/test_makefile.py                            [chg] operator-alert-samples (§7.5)
redteam/forbidden-actions.sh                                  [chg] the target's and the subcommand's rows (§11)
deploy/grafana/dashboards/h4-runtime.json, deploy/scripts/test_dashboard.py   [chg] the fallback panel; the form column (§9.4)
docs/data-flow-disclosure.md                                  [chg] A1, A2, S12, S13 (§12.3)
docs/runbooks/alert-channel-down.md                           [chg] "Alerts arrive as plain text" (§9.5)
docs/adr/0042-alerts-designed-to-be-read.md, docs/adr/README.md   [new], [chg] (§12.2)
specs/000-local-foundations/contracts/{alerts,operator-admin,telemetry,config-files}.md, data-model.md   [chg] (spec 011) (§12.1)
tools/gates/matrix-required.txt                               [P-A] optional: the new rows' IDs (§11)
```

**Structure decision**: the designed forms are modules beside `format.ts`, which keeps the plain text and the facts; the dispatcher alone composes them, at send time; nothing outside `src/alerts/` renders an alert, and the admin route hands samples to the dispatcher through a narrow interface.

## 1. Decisions (research)

| ID | Decision | Why | Rejected |
|---|---|---|---|
| D1 | Render the designed forms at send time, in the dispatcher, from the outbox row's facts; keep rendering the plain text with its cause | No designed render inside any cause's transaction, at any of the four places alerts are queued (`meter/crossings.ts`, `meter/init.ts`, `routes/admin.ts`'s auth-failure alert, the dispatcher's own); one decoder proves the facts complete; a row from before the change decodes to nothing and goes plain (FR-030); a renderer fix reaches rows still queued; samples and the in-memory `store_unreachable` alert take the same path | Rendering at queue time and storing the forms in new columns: a render in every cause's transaction, behind a try at four call sites; rows of up to about 40 KB; a fix that can't reach queued rows |
| D2 | The facts gain the values the forms show, as version 2 (§2.2), written by `renderAlert`'s facts builder | Every call site changes at once, since all four build their rows through `renderAlert`; each added value is a number, a state, a time, or a string from configuration or code | Rendering the prefix from the configuration at send time (a changed prefix across a restart would differ from the plain text's) |
| D3 | The forms are pure functions of the typed context and spec (and a sample's marks), each in its own module; `format.ts`'s plain text is untouched | The plain text is the fallback that has to keep working; the designs can't reach it; each renderer is tested alone | One renderer for all three forms |
| D4 | Telegram's entities are measured as the text is built, with JavaScript's string length, which counts UTF-16 code units; a check reads the finished text before it's used | The Bot API counts UTF-16 code units; a JavaScript string's `length` is that count, so offsets can't drift; the check catches a bug before Telegram does | Counting code points (`[...s].length`) or bytes; computing offsets afterwards by searching the text |
| D5 | Email's designed form: nodemailer's `text` and `html` beside each other, under the designed subject; its plain form: today's message exactly (Q1's answer read with FR-016) | nodemailer writes `multipart/alternative`, text first, from the two fields, with no new package; a fallback is the message that has worked since spec 000 | An emoji subject on the plain form too (a fallback that differs from today's) |
| D6 | The fallback triggers: Telegram's 400, as `http_400` or `telegram_400`, after a designed send; a mail server's 5xx to the message's data. One lease covers both sends; the channel's form sticks once plain | FR-026 to FR-028; the classes the channels already keep, so no response body is read | Reading Telegram's description to tell an entities refusal from another 400 (a body the dispatcher keeps none of); waiting for the next scheduled attempt (a delay) |
| D7 | Migration `0006_alert_forms.sql`: each channel's form and fallback columns, and `alert_samples` in the audit log's CHECKs | The outcome of each attempt, queryable by the dashboard's SQL panels and the incident drafts if they ever need it; append-only migrations, as 0003 and 0004 extend 0001's CHECKs | A JSON column for outcomes |
| D8 | Samples in the dispatcher's memory, after the due real alerts of each pass, one a channel per pass and at most one a second; 409 while any is pending | FR-037 and FR-039; the in-memory path exists for `store_unreachable`; no outbox row, so nothing that reads the outbox can see one | Outbox rows of a kind `sample` (a schema change to `kind`, and rows every reader would have to filter) |
| D9 | A sample's facts: its catalogue entry's fixed facts (the dates of contracts/alerts.md §3's examples, spec 010's from its texts), with the stack's own prefix and env class, the test clock off, the requester's fingerprint, and the sample's key | FR-034: what a real alert of the entry shows on that stack, and nothing from its store | Live meters (a sample would then report the stack) |
| D10 | The CLI's `alert-samples --reason TEXT [--kind KIND]`, with no option beginning `--s`; the hop forwards it; the gateway validates the kind | The bash gate reads any `--s…` option on the CLI's command line as an abbreviation of `--stack` (`operator.py`'s note at its `studio-window` parser); one list of kinds, the gateway's | A `--sample-…` or `--severity` option; the kinds duplicated in Python |
| D11 | No change to the bash gate: its rules for `make operator-*` and the operator CLI cover the new name; matrix rows prove it (§11) | Verified against the hook's text; a rule that matters has its test row | A rule of its own for the target (a `.claude/` patch for coverage that exists) |
| D12 | The Telegram stand-in checks entities as FR-009 and FR-010 define them and counts UTF-16 (§8.1) | A second implementation of the entity rules, in Python, that every dev-cpu run checks the gateway's output against | Accepting `entities` unchecked |
| D13 | The golden files: one folder per entry and further case under `services/gateway/test/fixtures/alerts/`, four files each, written only by vitest's file snapshots and kept out of Prettier's reach (§3.4) | Byte-exact outputs, reviewable in the diff and openable offline (FR-005; Q4's answer) | Inline snapshots (unreadable for HTML); JSON for the Telegram form (Prettier and the post-edit hook would reformat it) |
| D14 | The ADR at the next free number after spec 010's 0041, 0042 unless another branch has taken it when T002 runs | Spec 010's D13 took the same approach | A number fixed now |
| D15 | `alert.deliver` as an INTERNAL root span per attempt, with no URL or text (§9.3) | `CLAUDE.md`'s span for a new feature; the attempt has no request to hang under | An HTTP client span (its URL holds the bot token, which is why spec 000's instrumentation skips Telegram's host) |
| D16 | The breach test's last step sends the samples in stand-in mode and finds each on both stand-ins; its existing alert checks gain the form (§8.2) | The dev-cpu harness agents already run reads both stand-ins inside the stack (S11); it proves SC-006 end to end | A new harness or a published stand-in port |

## 2. Where the forms render (D1, D2)

### 2.1 The flow

- **At the cause, unchanged but for the facts**: `renderAlert(ctx, spec)` returns the subject (the first line), the body (the plain text), and the facts, now version 2; the cause's transaction writes the row with `enqueueAlert`, as today. No designed form is rendered there, so FR-025's "no input or output while that transaction is open" holds by construction.
- **At each attempt**: the dispatcher reads the row's `subject`, `body`, `facts`, `<channel>_form`, and `<channel>_fallback`, and asks `formsFor` (§6.1) for that channel's form. A designed form is rendered from the decoded facts there and then; nothing designed is stored.
- **In memory**: the `store_unreachable` alert and the samples hold the same three values (subject, body, facts) and the same per-channel form state, and go through the same `formsFor`.

### 2.2 The facts, version 2

`format.ts`'s facts builder moves to `facts.ts` as `factsOf(ctx, spec)`, and `renderAlert` keeps calling it. Version 2 adds:

| Key | Type | Where | From |
|---|---|---|---|
| `facts_version` | `2` | every alert | — |
| `prefix` | string, 1 to 32 characters (rule A5) | every alert | `config/alerts.yaml`'s prefix for the stack |
| `env_class` | `prod` or `dev` | every alert | the stack's class, which decides the synthetic-spend mark |
| `runtime_since` | RFC 3339 or null | every alert | the runtime state's `since`, when degraded or unknown |
| `fallback_since` | RFC 3339 or null | every alert | the fallback state's `since`, when awaiting renewal |
| `label` | string or null | `credentials_expiring`, `fallback_unavailable`, and spec 010's adapter-month facts | the adapter type's label ("Bedrock", "the Anthropic API"), from code |
| `confirm_zero` | boolean | `operator_action`, `init` | the init's request |

`decodeFacts(facts, dedupeKey)` returns the typed context and spec, or nothing: a missing or ill-typed key, an unknown kind, a version other than 2, or a micro-USD value that isn't a safe integer gives nothing, and it never throws. A test holds the round trip: for every catalogue entry and further case, `decodeFacts(factsOf(ctx, spec))` deep-equals `(ctx, spec)`, so the designed forms see exactly what the plain text saw. contracts/alerts.md §5's description of the facts gains "the stack's prefix and an adapter's ID and label, which come from configuration and code, never from a request" (Amendment 0-5).

### 2.3 Migration `0006_alert_forms.sql`

Append-only, as every migration; 0001 to 0005 stay byte-identical (the migrations test holds them).

```sql
-- 1. Each channel's form, and the reason when the plain form went in the designed one's place (spec 011, FR-044).
--    NULL until the channel's first attempt; each attempt writes the form it sent.
ALTER TABLE gateway.alert_outbox
  ADD COLUMN telegram_form text CHECK (telegram_form IN ('designed', 'plain')),
  ADD COLUMN email_form text CHECK (email_form IN ('designed', 'plain')),
  ADD COLUMN telegram_fallback text
    CHECK (telegram_fallback IN ('entities_refused', 'render_failed', 'over_limit', 'not_rendered')),
  ADD COLUMN email_fallback text
    CHECK (email_fallback IN ('message_refused', 'render_failed', 'over_limit', 'not_rendered')),
  ADD CONSTRAINT alert_outbox_telegram_fallback_is_plain CHECK (telegram_fallback IS NULL OR telegram_form = 'plain'),
  ADD CONSTRAINT alert_outbox_email_fallback_is_plain CHECK (email_fallback IS NULL OR email_form = 'plain');

-- 2. alert_samples joins the audit log's actions, as an operator write with its reason (spec 011, FR-033).
ALTER TABLE gateway.audit_log DROP CONSTRAINT audit_log_action_check;
ALTER TABLE gateway.audit_log ADD CONSTRAINT audit_log_action_check
  CHECK (action IN ('init', 'reset', 'renew', 'trip', 'fallback_exhausted', 'auth_failed', 'test_clock',
                    'test_synthetic', 'adapter_call', 'journal_failed', 'studio_window', 'twin_call', 'alert_samples'));
ALTER TABLE gateway.audit_log DROP CONSTRAINT audit_log_reason_iff_operator_write;
ALTER TABLE gateway.audit_log ADD CONSTRAINT audit_log_reason_iff_operator_write CHECK (
  (action IN ('init', 'reset', 'renew', 'test_clock', 'test_synthetic', 'adapter_call', 'studio_window', 'twin_call',
              'alert_samples')) = (reason IS NOT NULL)
);
```

The number assumes spec 010's `0005_adapter_month.sql` on the base; T001 confirms it, and the action lists are copied from the newest migration on the base at T012, since a later one may have changed them. A rollback to an older gateway (`make up REF=…`) keeps working: the columns are nullable and unread by older code, which sends the stored plain text as today.

## 3. The renderers

### 3.1 The marks (`marks.ts`)

One table keyed by kind and variant (FR-006, FR-007; Q2's answer): the severity, its name, its emoji, and the kind's emoji. A test holds every catalogue entry to it, and each emoji's UTF-16 length: ⏰ and ⚪ one; 🔴, 🟠, 🔵, 📈, 🛑, 💸, 🔑, 🔌, 🔐, and 🧪 two; 🛠️ and 🗄️ three.

**The palette** (plan choice; T025's contrast test computes every pair from these values, and a value that fails is changed and recorded here as a departure):

| Use | Light | Dark | Contrast (light, dark) |
|---|---|---|---|
| Critical band, under white or dark text | `#B42318`, white text | `#FDA29B`, `#101828` text | 6.6:1, 9.1:1 |
| Warning band | `#B54708`, white text | `#FEC84B`, `#101828` text | 5.4:1, 11.5:1 |
| Operator action band | `#175CD3`, white text | `#84CAFF`, `#101828` text | 6.0:1, 10.0:1 |
| Information band | `#475467`, white text | `#D0D5DD`, `#101828` text | 7.7:1, 12.0:1 |
| Body text on the card | `#101828` on `#FFFFFF` | `#F2F4F7` on `#0C111D` | 17.8:1, 17.1:1 |
| Labels on the card | `#475467` on `#FFFFFF` | `#98A2B3` on `#0C111D` | 7.7:1, 7.3:1 |
| A bar's fill on its track (non-text, at least 3:1) | the band colour on `#EAECF0` | the dark band colour on `#344054` | 4.6:1 to 6.5:1, 5.4:1 to 7.1:1 |
| The warning's tick, under the bar, on the card | `#101828` | `#F2F4F7` | 17.8:1, 17.1:1 |

The tick sits in its own row under the bar, at the warning's position, so it never lies on the fill, where its contrast would vary.

### 3.2 What every designed form holds

Both renderers take the same parts, in FR-003's order, from one function, `partsOf`, that `format.ts` already has for the plain text (the headline, the fixed sentence, the runbook), so the words can't drift between forms. A test checks FR-002 across forms: the USD amounts, the times, the dedupe key, and the fingerprint found in each designed form are the plain text's, and none other.

### 3.3 A sample's marks

The plain text's first line gains `[SAMPLE] ` in front, and a last line, "A sample, sent by operator #<8 hex>: nothing happened on <stack>."; Telegram's message gains a first line, 🧪, **SAMPLE** in bold, and the same sentence; the HTML gains a banner above the severity's band with the same words; the designed subject puts 🧪 and a space before the two emoji (FR-016, FR-036).

### 3.4 The golden files (D13)

- **Where**: `services/gateway/test/fixtures/alerts/<name>/`, one folder per catalogue entry, named `01-warn-day` to `19-reminder-awaiting` in FR-004's order, and one per further case: `case-trip-month`, `case-unavailable-credentials`, `case-reminder-both`, `case-reset-none-at-ceiling`, `case-dev-test-clock`, `case-sample-trip`, and `case-longest`.
- **What**: `plain.txt` (the plain text, byte for byte), `subject.txt` (the designed subject), `telegram.txt` (the text, then a line `--- entities (UTF-16 offset, length)`, then one line per entity: its type, offset, length, and the text it covers, JSON-quoted, so a reviewer sees each entity on its words), and `email.html` (the HTML part, byte for byte).
- **How**: `test/unit/alert-goldens.test.ts` renders each case and compares it with vitest's `toMatchFileSnapshot`. The files are written only by that test run with `-u`, in the task that changes a design, and reviewed in the diff; never by hand, and never in a fix task, since the hook keeps test files out of fix tasks.
- **Kept as written**: `.prettierignore` gains `services/gateway/test/fixtures/alerts/`, since Prettier formats HTML; the Telegram form is `.txt` because the post-edit formatter rewrites `.json` files an agent writes.
- **The Author's preview** (Q4's answer): each `email.html` opens from the working tree in a browser, offline, since it loads nothing; the folder's order is the catalogue's.

### 3.5 The bounds (FR-023, FR-024)

`forms.ts` measures each designed form after rendering: Telegram's text in UTF-16 code units (2,000), the HTML in UTF-8 bytes (32 KiB). The plain text keeps §3's cut at 1,000, changed only so it never splits a surrogate pair (a prefix may hold an emoji). `case-longest` renders every entry with a 32-character prefix holding an emoji, a 64-character adapter ID (`config/routing.yaml`'s ID rule), the longest label in the code, dev's marks, the test clock, the reminder naming both ceilings, and a sample's marks; every form stays inside its bound, which the test asserts with its margin.

### 3.6 The canary and escaping (FR-042, FR-043)

`test/unit/alerts.test.ts`'s §5 test grows: every entry, further case, and sample is rendered in all forms while the canaries sit in the ledger's client label, the hello message, the operator's reason, and a token; none appears in the plain text, the subject, the Telegram text or its serialized entities, the HTML, or the facts; no run of nine or more hex digits appears. A second case puts `&`, `<`, `>`, `"`, `'`, `*`, `_`, a backtick, and an emoji into the prefix, the characters an adapter ID allows into the ID, and the same characters as the prefix's into a label: the HTML escapes them, and the Telegram text carries them as themselves with every entity still on its words.

## 4. Telegram

### 4.1 The message

The illustration in the spec (after FR-014) is the layout, line by line: the sample's line (samples only); the severity's emoji, its name, `·`, and the prefix; the kind's emoji and the headline, `bold` over the headline; `Next:` and the fixed sentence, where the kind has one; `Meters` and one `pre` block; `Runtime:`; `Fallback:`, where §3 shows it; `Time:`; `id ` and the key, `code` over the key; `Runbook: ` and the path, `code` over the path.

The `pre` block (FR-021's columns, plan choice for their widths): one row a meter, the label padded to the block's longest label, then `spent / ceiling USD`, right-aligned to the block's widest amount, then `warning <w>`, or for the fallback `grant <n>` (and `, warning <w>` in the grant's warning), or for spec 010's adapter month its month; dev-class stacks end the block with `(synthetic spend)`. The adapter month's row is labelled with the adapter's ID, a fact the row's alert already holds. No emoji enters the block, so its columns align.

### 4.2 The builder (D4)

`designTelegram(ctx, spec, sample?)` appends segments to one string and records an entity as `{type, offset: text.length before the segment, length: segment.length}`; JavaScript's `length` is the UTF-16 count, so an emoji before an entity moves its offset by its true length.

### 4.3 The check (FR-014)

Before `forms.ts` uses the message: every entity's type is one of the four; `offset ≥ 0`, `length ≥ 1`, and `offset + length ≤ text.length`; neither end falls on an index whose code unit is a low surrogate (0xDC00 to 0xDFFF), which would split a pair; the list is sorted, with no overlap; no `language`; the text is within 2,000 units. A failure is `render_failed`; only the length is `over_limit`.

### 4.4 The request

`sendTelegram(channel, message)` takes `{text, entities?}`: the JSON body is `{chat_id, text, entities, disable_web_page_preview: true}` for the designed form and `{chat_id, text, disable_web_page_preview: true}` for the plain one, exactly today's body. If T001 finds that the Bot API's reference has replaced `disable_web_page_preview` with `link_preview_options` and no longer accepts the old field, both forms send `link_preview_options: {is_disabled: true}`, the stand-in accepts it, and the change is a departure recorded here. No `parse_mode` ever.

## 5. Email

### 5.1 The designed subject (FR-016)

`${severityEmoji} ${kindEmoji} ${firstLine}`; for a sample, `🧪 ${severityEmoji} ${kindEmoji} ${firstLine}`, its first line beginning `[SAMPLE] `. nodemailer encodes it as UTF-8 encoded words.

### 5.2 The layout

One outer table, 100% wide, with one inner table, 600 pixels wide at most and fluid below it (`width="600"` with `width:100%;max-width:600px`), `role="presentation"` on both; inside, rows in FR-003's order:

1. A sample's banner (samples only): 🧪, **SAMPLE**, and the sample sentence, in a dashed border.
2. The severity's band: its emoji, its name in capitals, `·`, and the prefix, on the band colour.
3. The headline: the kind's emoji and the headline, in 20 pixels, bold.
4. What to do next: the label and the fixed sentence, where the kind has one.
5. The meters, one block each: the label and the numbers (`spent / ceiling USD`, `warning <w>` or `grant <n>`), then the bar (§5.3), then the warning's tick.
6. The states: `Runtime` and its value; `Fallback` and its value, where §3 shows it.
7. The details: `Time`, `Alert ID` (monospace), and `Runbook` (the path, monospace, as text).

The head holds `charset`, `viewport`, `color-scheme` and `supported-color-schemes` (`light dark`), `format-detection` (`telephone=no, date=no, address=no, email=no, url=no`), the title (the designed subject), and one `<style>` element with the dark palette under `@media (prefers-color-scheme: dark)`, by class, and a rule that keeps a link a client adds on its own in the text's colour (`a[x-apple-data-detectors]`). The inline styles carry the light palette, so a client that drops `<style>` shows it. Fonts: a system stack (`-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`, and `ui-monospace, Menlo, Consolas, monospace` for the ID and the path).

### 5.3 The bars (FR-021; Q5's answer)

A bar is a one-row table 100% wide, its two cells sized from the facts: the fill's share is `min(spent, ceiling) ÷ ceiling` in whole percent (a ceiling of zero, which the schemas rule out, draws no bar), filled in the severity's colour; the track takes the rest. At or past the ceiling the fill is 100%. The warning's tick is a 2-pixel cell in its own row below, at `warning ÷ ceiling`. The numbers stay beside the bar, so a client that drops cell widths still shows every value.

### 5.4 Nothing loads (FR-019)

The renderer writes only the elements `html`, `head`, `meta`, `title`, `style`, `body`, `table`, `tr`, `td`, `span`, `strong`, and `br`, with the attributes `lang`, `dir`, `charset`, `name`, `content`, `class`, `style`, `role`, `width`, `align`, `valign`, `cellpadding`, `cellspacing`, and `border`. `test/unit/email-design.test.ts` tokenizes every case's HTML with a small tokenizer of its own (the output is regular, and FR-052 allows no parser package) and holds each element and attribute to that list; no attribute value or style holds `url(`, `@import`, `expression(`, `//`, `http:`, `https:`, `data:`, or `cid:`. Every value passes through one `escapeHtml` (`&`, `<`, `>`, `"`, `'`).

### 5.5 The send

The designed form: `sendMail({from, to, subject: designedSubject, text: body, html, headers})`, `disableFileAccess` and `disableUrlAccess` kept. The plain form: today's `{subject: firstLine, text: body}`. A refusal of the message (D6): a reply code from 500 to 599 whose nodemailer error names the data phase in its `command` field. T001 records the values nodemailer 10.0.16 sets there for a refused `DATA` command and a refused message end; if it sets none that tells them from a refused `RCPT`, every 5xx resends the plain form once, which costs one more session on a recipient's refusal and loses nothing. The class kept stays `smtp_<code>`.

## 6. Never lost

### 6.1 Each channel's form (`forms.ts`)

| Condition, in this order | Form | Reason recorded |
|---|---|---|
| `formats.<channel>` is `plain` | plain | none |
| The row's `<channel>_form` is already `plain` (an earlier fallback) | plain | the earlier reason, kept |
| The facts aren't version 2, or don't decode | plain | `not_rendered` |
| The renderer throws, or its check fails | plain | `render_failed` |
| The form passes its bound | plain | `over_limit` |
| Otherwise | designed | — |

### 6.2 An attempt that falls back (FR-026 to FR-028)

The claim's lease becomes `now + 2 × timeout + 5 s`, so one attempt's two sends fit inside it. A designed send that Telegram answers with `http_400` or `telegram_400`, or that the mail server refuses as §5.5 reads it, is followed at once, in the same attempt, by the plain form; the attempt counts once; the outcome written is the plain send's, with `<channel>_form = 'plain'` and the reason. Every later attempt of the alert on that channel reads the column and sends plain. Timeouts, refused connections, Telegram's 429 and 5xx, and the mail server's 4xx follow §4.2's schedule in the form last sent (FR-029).

### 6.3 The window (rule A2)

Spec 000's contracts/config-files.md §4.3, rule A2, checks that the last attempt ends inside `give_up_after_s`; it now counts two sends: `sum(schedule_s) + 2 × max(timeout_ms) ÷ 1000 ≤ give_up_after_s`. Today's file passes unchanged: 230 + 20 = 250 ≤ 300. contracts/alerts.md §4.2's "The last starts at 230 s and runs at most 10 s" reads "at most two sends, 20 s" (Amendment 0-2).

### 6.4 The cause's transaction (FR-025)

`test/integration/crossings-forms.test.ts` replaces the designed renderers with throwing stubs and spies, then drives a warning and a trip crossing, a reset, an init, the auth-failure alert, and the ticker's three alerts: each transaction commits with its plain row, and the spies count no call inside any transaction. The facts builder that does run there is total over its typed input; the round-trip test (§2.2) feeds it every case.

## 7. Samples

### 7.1 The command

From the Author's terminal: `make operator-alert-samples ENV=prod REASON="…"`, or `KIND=trip` for one kind's entries. From an agent session, dev-cpu only (§11).

### 7.2 The route, `POST /admin/alert-samples`

Served on every stack. In order: authentication (the listener's hook); JSON (415 otherwise); the body, `{"reason": "…", "kind": "…"}` with the kind optional (400 `invalid_request` for a reason outside §1.2's rule, a kind outside the catalogue's kinds, or any other key); the in-flight check (409 `samples_in_flight`), which holds from before the audit row's transaction until the samples are queued or the request fails, so two requests that overlap can't both pass it (B12); one transaction writing the audit row (action `alert_samples`, the operator as actor, the reason, and `detail` holding the kind, the entries, the keys, and the delivery mode); after the commit, `samples.queue(...)`, the dispatcher's narrow interface handed to the admin routes in `app.ts`; and the answer, 200:

```json
{
  "action": "alert_samples",
  "audit_id": 57,
  "delivery": "standin",
  "samples": [{ "entry": "warn-day", "key": "dev-cpu:sample:warn-day:57" }]
}
```

with one object for each entry (19, or the kind's). 503 `store_unreachable` when the store can't take the audit row; nothing is queued then. No journal record, since nothing changes state, and no `operator_action` alert (§1.3's rule for audited, unconfirmed writes). `h4.operator.actions` counts `alert_samples`, and the server span carries `h4.action: alert_samples` (§9.3).

What `CLAUDE.md` asks of a new endpoint: its span, above; its panels, the existing ones it feeds, since a sample request is a rare operator write, as a reset or a renewal is, and they have no panel of their own: its requests are rows of the audit panel (action `alert_samples`), and its samples' deliveries rows of "Alerts by channel and outcome" and of the fallback panel under the kind `sample` (§9.4); its cost, $0 (§15); its degraded answers, 409 while samples are in flight and 503 while the store is down, and with a channel down its samples fail and are counted as alerts do; and its disclosure, rows A1 and A2's triggers (§12.3).

### 7.3 The catalogue (`catalogue.ts`)

The 19 entries, by name (`warn-day`, `warn-month`, `warn-fallback-grant`, `warn-adapter-month`, `trip`, `exhausted-grant`, `exhausted-adapter-month`, `operator-reset`, `operator-renew`, `operator-init`, `studio-opened`, `studio-closed`, `credentials-expiring`, `unavailable-bedrock`, `unavailable-anthropic`, `auth-failed`, `store-unreachable`, `reminder-degraded`, `reminder-awaiting`), each with its kind and its fixed context and spec. A sample's key is `${stack}:sample:${entry}:${auditId}`. `outbox.ts` exports `REAL_KINDS`, and a test holds it to the outbox's CHECK list plus `store_unreachable`, to `h4.alert.kind`'s values but `sample`, and to §2's table, and asserts that `sample` isn't among them (FR-035).

### 7.4 In the dispatcher

`queueSamples(entries, auditId, fingerprint)` renders each entry's plain text and facts with `renderAlert` on its catalogue context, with the stack's prefix and class, the sample's key, and its marks, and holds them in a `samples` list of their own, both channels pending, enqueued now. Each pass keeps today's order, the in-memory `store_unreachable` alert and then the due outbox rows on both channels, and ends with at most one sample a channel, and only on a channel that had no due row in that pass and no sample attempt in the last 1,000 ms. With the pass every 2 s, a full request takes about 40 s. A sample's attempt records `h4.alerts` and `h4.alert.fallbacks` under the kind `sample`, and no `h4.alert.delivery_lag`, which has no kind to keep it apart. Samples follow §4.2's schedule from their own enqueued time and are dropped at 300 s or at a restart.

### 7.5 The CLI and the target (D10)

- `scripts/operator.py`: `AdminClient.alert_samples(reason, kind)`; the `alert-samples` subparser (`--reason`, required; `--kind`, optional, passed as given, since the gateway checks it); `alert_samples_lines(stack, body)`, which prints each entry and key and where they went ("the stand-ins" or "your Telegram chat and alerts mailbox") and how long a full request takes; the dev-cpu hop forwards the command as it forwards `reset` and `renew`; `AUDIT_ACTIONS` gains `alert_samples`; the docstring's table gains the row.
- The `Makefile`, beside the other operator writes:

```make
operator-alert-samples: ## Send a marked sample of each alert kind through ENV's channels: REASON="..." [KIND=]
	$(OPERATOR_AGENTS)
	@[ -n "$(call from_cli,REASON)" ] && [ -n "$$REASON" ] || { echo 'make operator-alert-samples needs REASON="<why, at least 10 characters>" on the command line' >&2; exit 2; }
	$(OPERATOR) alert-samples --reason="$$REASON"$(call OPERATOR_VALUE,KIND,--kind)
.PHONY: operator-alert-samples
```

- contracts/operator-admin.md §6.1's table gains `operator-alert-samples | ENV, REASON, KIND= | alert-samples | the Author; agents for ENV=dev-cpu only`.

## 8. The stand-in and the breach test

### 8.1 The Telegram stand-in (`evals/standins/telegram_standin.py`; D12)

- `entities`, when present, must be a list of objects with `type` in `bold`, `italic`, `code`, `pre`; integer `offset` ≥ 0 and `length` ≥ 1, no other key (a `language` refused); within the text's UTF-16 length; neither end inside a surrogate pair; sorted, with no overlap. Anything else answers 400, `{"ok": false, "error_code": 400, "description": "Bad Request: can't parse entities"}`.
- A text's length is counted in UTF-16 code units (`len(text.encode("utf-16-le")) // 2`) against 4,096.
- Each kept message holds its `entities` (an empty list when none) and whether it disabled link previews; `GET /messages` returns both.
- `parse_mode` is still refused; the docstring and the log line change with it, and the log still names no text.
- `test_telegram_standin.py` gains each rule, a 4,096-unit text holding emoji kept and a 4,097-unit one refused, and a text of under 4,096 code points but over 4,096 units refused.

### 8.2 The probe and step 12 (D16)

- `evals/breach_probe.py`: `op_telegram`'s found message adds `designed` (its entities aren't empty) and `entities` (their count); `op_mailpit` reads the found message's `HTML` and `Text` from Mailpit's API and adds `designed` (both present). Payloads are read inside the probe and never printed, as S11 has it.
- `evals/breach.py`: in stand-in mode, beside each existing alert check, which stays as it was, an assertion of its own expects `designed: true` of the same alert on both stand-ins (B15); a new step 12, last, in stand-in mode only (skipped with `DELIVERY=real`, so the Author's recorded run sends nothing new to his phone): `op: admin`, `GET /admin/status`, then `POST /admin/alert-samples` with the reason "breach test step 12: the alert samples"; then, for each returned key, a `telegram` and a `mailpit` operation expecting it within 120 s with `designed: true`; then an `audit` operation finding one `alert_samples` row; then a `metric` operation finding `h4_alerts_total{h4_alert_kind="sample"}` risen; then `GET /admin/status` again, its state and meters as before. The outbox, which no admin read shows, is held to no sample row by the gateway's integration test (tasks.md T034).
- `evals/test_breach.py` and `test_breach_helpers.py` hold the new fields and the step's operations against fixtures.

## 9. Telemetry, the dashboard, and the runbook

### 9.1 The instruments (telemetry.md §4.1, amended in the same commit as the code; the inventory test follows)

| OTel name | Instrument, unit | Attributes | Prometheus name | Recorded when |
|---|---|---|---|---|
| `h4.alerts` (amended) | as before | as before; `h4.alert.kind` gains `sample`; and `h4.alert.form`: `designed`, `plain`, or `none` (a channel marked failed at expiry, with no attempt) | as before | as before |
| `h4.alert.fallbacks` (new) | counter, `{fallback}` | `h4.channel`; `h4.alert.kind`; `h4.alert.fallback_reason`: `entities_refused`, `message_refused`, `render_failed`, `over_limit`, `not_rendered` | `h4_alert_fallbacks_total` | once per attempt that sent the plain form in the designed one's place |
| `h4.alert.delivery_lag` | as before | as before | as before | as before, for alerts only: a sample records none |
| `h4.operator.actions` (amended) | as before | `h4.action` gains `alert_samples` | as before | as before |

### 9.2 The log records (telemetry.md's records table, amended)

`alert.delivered`, `alert.retry`, and `alert.failed` gain `form`, and `fallback_reason` when one applies, as FR-044's letter has it (B13). New: `alert.fallback` (warn), with the dedupe key, the kind, the channel, the attempt, the reason, and the refused designed send's error class (`http_400`, `telegram_400`, `smtp_554`), or none for a render reason. No record holds a text, a URL, or a response body.

### 9.3 The spans (D15; telemetry.md §3.2, amended)

`alert.deliver`, INTERNAL, one per attempt, started from the root context: `h4.channel`, `h4.alert.kind`, `h4.alert.form`, `h4.alert.fallback_reason` (when set), `h4.outcome` (`delivered`, `retry`, `failed`), `h4.alert.attempt`, and `h4.alert.sample`. The sample request's server span gains `h4.action: alert_samples` through a helper beside `noteStudioWindowState`. `test/unit/telemetry.test.ts` holds the span's key set, and the dispatcher's test, with an in-memory exporter, finds no canary, URL, or token in any attribute.

### 9.4 The panels (telemetry.md §7.5, amended in the same commit as `h4-runtime.json`; `deploy/scripts/test_dashboard.py` follows)

| Panel | Type | Query |
|---|---|---|
| Alerts by channel and outcome (FR-032), amended | table | `sum by (h4_channel, h4_alert_kind, h4_outcome, h4_alert_form) (increase(h4_alerts_total[$__range]))` |
| Alerts sent as plain text by fallback (new) | table | `sum by (h4_channel, h4_alert_kind, h4_alert_fallback_reason) (increase(h4_alert_fallbacks_total[$__range]))` |
| Alert log, amended | logs | `{service_name="gateway"} \| event=~"alert\\.(queued\|delivered\|retry\|failed\|fallback)"` |

`test_dashboard.py`'s pinned "Alert log" query changes with the contract's.

### 9.5 The runbook (`docs/runbooks/alert-channel-down.md`)

A section, "Alerts arrive as plain text": the symptom (the fallback panel counts); the impact (none on delivery: the alert arrived in today's form); and by reason what to do: `entities_refused`, Telegram refused the entities, so read the `alert.fallback` records' kinds and the Bot API's changelog, set `formats: {telegram: plain}` to stop the doubled request until a fix, and open an intent; `message_refused`, the same for the mail server, with `formats: {email: plain}`; `render_failed` and `over_limit`, a design bug, with the kind and the key for the intent; `not_rendered`, expected for rows queued in the 300 s before a deploy, and a decoding bug after that. To verify a fix: the samples on dev-cpu, then on prod. To undo the switch: remove `formats` and `make up`.

## 10. Configuration

- **`config/alerts.yaml`** (human-only; no change needed): an optional `formats` map. `validate.ts`'s `ALERTS_TOP` gains `formats: z.strictObject({ telegram: z.enum(["designed", "plain"]).optional(), email: z.enum(["designed", "plain"]).optional() }).optional()`, as rule A8 (plan choice for the ID, the next after A7), and `AlertsConfig` gains `formats: { telegram, email }`, `designed` where absent. The Author adds the key only after this branch merges.
- **Rule A2** counts two sends (§6.3).
- **`test/fixtures/config/alerts-formats.yaml`**: a copy of the committed file with `formats: {telegram: plain}`, for the switch's tests.

## 11. The bash gate and the matrix (D11)

**Verdict: the existing rules already cover `make operator-alert-samples` and `scripts/operator.py … alert-samples` outside dev-cpu, so no `.claude/` change and no patch is needed.** The evidence, in `.claude/hooks/bash-gate.sh` on `main`:

- **The target.** Lines 271 to 274 block a command when `has "$make_word"` and `has "${tb}($(spelled operator-)[[:alnum:]_\"'\\\$-]*|$(spelled studio-window))${te}"`, unless `only_dev_cpu "$env_opt"`. `make_word` (line 196) matches `make`, `gmake`, a path to either, or `tools/gates/run_checks`; the target pattern matches `operator-` followed by any characters a target name, a quote, a backslash, or `$` can hold, so `operator-alert-samples` and `"operator"-alert-samples` match; `tb` and `te` (lines 193 and 194) allow it after a space, a quote, `./`, or an option. `only_dev_cpu` (lines 245 to 256) passes only when `ENV` appears, in every reading of the command (as written, with backslash-newlines joined, and with comments removed), with the value `dev-cpu` each time; no `ENV`, which is prod, or any other value, blocks. `has` (line 178) reads the whole text, so `bash -c '…'`, a subshell, `make -C .`, and `ENV=prod make …` are read too.
- **The subcommand.** Lines 275 to 278 block `scripts/operator.py`, `scripts.operator`, or `from scripts import operator` run by an interpreter or from a command's start, unless `only_dev_cpu "$stack_opt"`; the rule names no subcommand, so `alert-samples` is covered as `studio-window` is (matrix lines 788 and 789).
- **The listener.** Lines 279 to 281 block 18003 and 18103 anywhere in a command, so a direct request to prod's or dev's admin listener is refused whatever its path.
- **The existing rows.** `redteam/forbidden-actions.sh` lines 763 to 769 block `operator-status`, `operator-reset`, and `operator-token` off dev-cpu, by `ENV=prod`, `ENV=dev`, `ENV` before the target, and `bash -c`, and line 769 the CLI with `--stack prod`; lines 839 to 841 allow dev-cpu's.

**Two things the rules read that a dev-cpu run must avoid** (they refuse, never allow, so they cost a false refusal, not a gap): `only_dev_cpu` reads any uppercase `ENV` at a word's start as the option, so a `REASON` holding "ENV" refuses dev-cpu's own command; and for the CLI it reads any option beginning `--s` as `--stack`, which is why the subcommand has none (D10). Tasks.md T047's reasons avoid both.

**The rows this branch adds** to `redteam/forbidden-actions.sh` (agent-editable), beside lines 763 to 769 and 839 to 841, each registering its ID as it runs:
- `cmd block` for `make operator-alert-samples ENV=prod REASON="a design check"`; `… ENV=dev …`; with no `ENV`; `make -C . operator-alert-samples ENV=prod …`; `bash -c 'make operator-alert-samples ENV=prod REASON=x'`; `make "operator"-alert-samples ENV=prod …`; `ENV=prod make operator-alert-samples …`; `make operator-alert-samples ENV=dev-cpu ENV=prod …`; and `python3 -I -B -X pycache_prefix=/dev/null scripts/operator.py --stack prod alert-samples --reason "a design check"`.
- `cmd allow` for `make operator-alert-samples ENV=dev-cpu REASON="a design check"` and `python3 scripts/operator.py --stack dev-cpu alert-samples --reason "a design check"`.
- `cmd gap` for a name the rule can't see, as the studio window's gap rows have it: `make "$(printf 'oper%s' ator-alert-samples)" ENV=prod REASON=x` and `t=oper; make "${t}ator-alert-samples" ENV=prod REASON=x`. What holds them: the recipe's own `OPERATOR_AGENTS` refusal inside the sandbox, the operator token the sandbox can't read (FR-007), and prod's admin port out of its reach (stage S).

**P-A, optional**: the new rows' IDs in `tools/gates/matrix-required.txt` (human-only), so they can't be dropped quietly. Nothing waits for it.

Noted for the Author's backlog, not this branch's to change: `forbidden-actions.sh` lines 776 to 786 and 792 still mark the studio window's rows `planned`, though line 271 of the hook already names `studio-window`; the matrix prints them as "ENFORCED (a planned row: make it "block")".

## 12. The contracts, the ADR, and the disclosure

### 12.1 Spec 000's passages (each marked "(spec 011)"; FR-049)

- **contracts/alerts.md**: §2, the sample key and that a fallback raises no alert (0-4); §3, the three forms, the order, the marks, the designed subject, the bounds, a sample's marks, and one designed example beside the plain examples (0-1); §4.1, the channel table's two rows and the fallbacks, and §4.2's attempt of two sends (0-2); §4.4, the forms and fallbacks in the outcomes, and samples in memory (0-3); §5, the facts' description and the canary test (0-5); §6, the fallback panel's runbook (0-6).
- **data-model.md**: §2.6, the action `alert_samples` and what its row records; §2.7, the four columns and the facts' version 2 (0-7).
- **contracts/operator-admin.md**: §1.3, the new row (audit `alert_samples`, no journal record, no confirmation alert); a new §2.4, `POST /admin/alert-samples`, with §7.2's body, answer, and refusals; §6's command table and §6.1's target table (0-8).
- **contracts/telemetry.md**: §3.2, §4.1, the records table, and §7.5, each in the commit that changes its code (0-9).
- **contracts/config-files.md**: §4.1's `formats`, §4.3's rule A8 and rule A2 (0-10).

### 12.2 The ADR (FR-050; D14)

`docs/adr/0042-alerts-designed-to-be-read.md`, status proposed: Context (the Author's words; ADR 0005's "plain text" Decision); Decision (D1, D4 to D6, D8, D13, and the answers to Q1 to Q5); Alternatives (MJML, the Author's other option; `parse_mode` HTML; queue-time rendering; samples as outbox rows); Consequences ($0; the plain form as each channel's fallback; the golden files to regenerate with each design change). The index gains its row, and ADR 0005's row gains "(one Decision extended by 0042)".

### 12.3 The disclosure (FR-051)

`docs/data-flow-disclosure.md`'s rows A1, A2, S12, and S13 gain the spec's words (its Data-Flow Disclosure Entries) after their own, each cell's addition as the entry gives it, and `spec 011 FR-051` in their FR cells. `evals/test_disclosure.py` gains `spec_011_entry(row_id)`, reading the spec's entry rows as `spec_010_entry` reads spec 010's, and `test_the_alert_rows_add_spec_011s_words`, which strips each entry cell's leading "as before" and the joining words after it (", and: ", ", and (spec 011): ", ", and ", "; and ", "; ") and finds the rest in the row's cell, as `test_row_f1_adds_spec_007s_turn_to_its_own_words` does; reads "as A1" as A1's addition in the same column; and skips a cell that is only "as before". The existing tests on A1 (the fingerprint in its Carries, the SIGKILL in its switch), the alert rows' FRs, and S12's and S13's pointers to S11 stand.

### 12.4 Spec 010's alerts (FR-048)

`test/integration/alerts-anthropic.test.ts` builds the stack with spec 010's test configuration (`test/helpers/anthropic-config.ts`, on the base), drives the adapter's month across its warning and its cap with the stub paid adapter and the test clock, and makes its health check fail; each alert renders in all three forms and reaches the stub channels designed; the same with Bedrock's configuration for `credentials_expiring` and `fallback_unavailable`.

## 13. The Author's patches and actions

**The patches**: none required. **P-A**, optional: the new matrix rows' IDs in `tools/gates/matrix-required.txt` (§11), written from a plain copy of `main`'s file as `docs/merge-requests/<date>-feat-011-pa-matrix-rows.patch`, applied whenever he likes.

**The documentation** (agent-written, in this branch): the ADR (§12.2); the gateway's `README.md` gains an "Alerts" section: the three forms and where each renders, the catalogue, the golden files and how to open them, the samples' command, the switch, and the fallback panel.

**The Author's actions, in order** (the note gives each as a short, wrap-proof line):
1. Approve the spec and this plan; gate and merge `spec/011-alert-message-design` (documents only).
2. Gate and merge `feat/010-anthropic-provider`, then this branch, each with `tools/gates/gate <branch>` from main's checkout and the merge command it prints.
3. `make up ENV=prod`, which starts the gateway at the merge and applies migration 0006.
4. `make operator-alert-samples ENV=prod REASON="…"`, then read every sample on his phone's Telegram and in his phone's and desktop's mail clients, in light and dark, and record SC-010's reading in a follow-up note.
5. Accept the ADR, or leave it proposed; apply P-A if he wants the rows required.

## 14. The branch, and the order of work

- **The branch**: `feat/011-alert-message-design`, in its own worktree (`git worktree add -b feat/011-alert-message-design <new folder> feat/010-anthropic-provider`), from that branch's tip when T001 runs, or from `refs/heads/main` once it has merged; `npm ci --ignore-scripts --cache "$TMPDIR/npm"`; this folder enters its tree by cherry-picking `spec/011-alert-message-design`'s commits. Both branches change `src/alerts/format.ts`, and this one designs spec 010's alert variants, so it stacks rather than racing. Agents rebase and cherry-pick, never merge; work is committed before any pause, since `/tmp` is wiped when WSL restarts.
- **If spec 010 changes under it**: when `feat/010-anthropic-provider` gains commits (its review's fixes), this branch rebases onto its new tip; if spec 010's alert texts changed, the golden files are regenerated in the rebase's follow-up commit and the note says which (T050).
- **The phases** (tasks.md): Setup; Foundational, the degraded path first (the facts, the chooser, the fallbacks, the migration, the switch, the telemetry) with stub renderers (Principle I); User Story 1 (Telegram, P1); User Story 2 (email, P1); User Story 3 (the fallbacks end to end, the panel, the runbook, P1); User Story 4 (samples, P2); User Story 5 (spec 010's alerts, P2); Polish, the review, the note, and the Author's steps.
- **The merge order**: `feat/010-anthropic-provider`, then this branch. The design goes live at the Author's next `make up ENV=prod`.

## 15. Expected cost, and how it's measured

As the spec's [Expected Cost Impact](spec.md#expected-cost-impact): $0 in the cloud; one more Telegram request or SMTP session only on a refusal; a full sample request, 19 Telegram messages and 19 emails, which count against the alerts mailbox's daily sending limit. Measured by `h4_alerts_total` by form and `h4_alert_fallbacks_total`; the golden HTML files' sizes, in the branch's note beside the 32 KiB bound; and the render benchmark's time, beside the 5 ms goal.

## 16. Risks and mitigations

| ID | Risk | Mitigation |
|---|---|---|
| R-1 | Telegram refuses an entity list the stand-in accepts | The plain text goes at once (`entities_refused`); the panel shows it; the Author's prod samples on day one (§13, action 4) find it before an alert does |
| R-2 | nodemailer's errors don't tell a refused message from a refused recipient | T001 reads its fields; otherwise every 5xx resends the plain form once, which loses nothing (§5.5) |
| R-3 | A mail client renders the tables differently (an engine that ignores `max-width`, a webmail that drops `<style>`) | Fixed `width` attributes beside the fluid styles; inline light styles; the numbers beside every bar; the Author's reading on his clients (SC-010), and a departure for each fix |
| R-4 | Prettier, or the post-edit formatter, rewrites a golden file | `.prettierignore`; the Telegram form as `.txt`; the files written by vitest alone (§3.4) |
| R-5 | Spec 010's alert texts change after this branch cuts | The catalogue reads spec 010's typed specs; the goldens regenerate after the rebase (§14) |
| R-6 | A sample request meets Telegram's per-chat rate | One sample a channel per pass, at most one a second (§7.4); a 429 is retried on the schedule |
| R-7 | Samples use up the alerts mailbox's daily limit | One request at a time; 19 emails a request; the Author decides how often |
| R-8 | A client makes a link of the prefix's domain or a `.md` path | No link of ours; `code` entities in Telegram; `format-detection` and the data-detector rule in the HTML (§5.2) |
| R-9 | `alert.deliver` traces crowd Langfuse's list | A handful an alert, and 38 a sample request; filtered by name in Langfuse; documented in the README |
| R-10 | A facts key added later breaks the decoder for older rows | The decoder reads version 2's keys only, and ignores extra keys; a version 3 keeps decoding 2 |
| R-11 | A rollback to an older gateway meets the new columns and facts | Nullable columns and extra facts keys, unread by older code, which sends the stored plain text (§2.3) |
| R-12 | A dev-cpu `REASON` holding "ENV", or a `--s…` option on the CLI, trips the gate's stack reading | Reasons written without them (§11; tasks.md T047) |
| R-13 | The Bot API has replaced `disable_web_page_preview` | T001; both forms send `link_preview_options` then (§4.4) |

## 17. Requirement coverage

| FRs | Plan | Tasks (tests, then code, then the Author's) |
|---|---|---|
| FR-001, FR-002 | §2, §3.2 | T005, T018, T025; T013, T022, T028 |
| FR-003 | §4.1, §5.2 | T018, T025; T022, T028 |
| FR-004, FR-005 | §3.4, §7.3 | T026, T033; T022, T028, T038 |
| FR-006, FR-007 | §3.1 | T017; T021 |
| FR-008 to FR-012 | §4 | T010, T018; T014, T022 |
| FR-013 | §4.4 | T010; T014 |
| FR-014 | §4.3 | T018; T022 |
| FR-015, FR-016 | §5.1, §5.5 | T010, T025; T014, T028 |
| FR-017 to FR-022 | §5.2 to §5.4, §3.1 | T025; T028 |
| FR-023, FR-024 | §3.5, §6.1 | T006, T018, T025; T014, T022, T028 |
| FR-025 | §2.1, §6.4 | T005, T008; T013 |
| FR-026 to FR-029 | §5.5, §6.2, §6.3 | T007, T009, T010; T014, T015 |
| FR-030 | §2.2, §6.1 | T005, T007; T013, T014 |
| FR-031 | §10 | T006, T009; T014, T015 |
| FR-032 | §7.5, §11 | T035, T036; T040 |
| FR-033 to FR-039 | §7.2 to §7.4 | T033, T034; T038, T039 |
| FR-040 | §7.4, §8.2 | T034, T037; T039, T041; T053 |
| FR-041 | §8.1 | T019; T023 |
| FR-042, FR-043 | §3.6 | T027; T028 |
| FR-044, FR-045 | §9.1 to §9.3 | T007, T011; T014, T016 |
| FR-046 | §9.4, §9.5 | T029; T031, T032 |
| FR-047 | §7.2, §9.3 | T034; T039 |
| FR-048 | §12.4 | T042; T043 |
| FR-049 | §12.1 | T003, T016, T031; T046 |
| FR-050 | §12.2 | T002; T045 |
| FR-051 | §12.3 | T020; T024 |
| FR-052 | §1 (no package), §3.4, §5.4 | T049 (the lockfile's diff in the note is empty) |
| FR-053 | §2.3, §14 | T047 |

## Complexity Tracking

No constitution violation needs justifying. Three choices add weight on purpose:

| Choice | Why needed | Simpler alternative rejected because |
|---|---|---|
| Rendering at send time, with versioned facts and a decoder (D1, D2) | No designed render inside any cause's transaction; rows from before the change handled by construction; one path for rows, samples, and the in-memory alert | Queue-time rendering puts a render behind a try at four call sites, inside the transactions that degrade the stack |
| A Python check of the entity rules in the stand-in (D12) | A second, independent implementation that every dev-cpu run holds the gateway's output against | Accepting entities unchecked would let an offset bug reach the Author's phone first |
| Four golden files for each of 26 cases (D13) | The Author's answer, "tests pin the output for every alert kind", and his offline preview (Q4) | Inline assertions on fragments miss layout changes, and can't be opened in a browser |
| The design in this plan's sections, not in companion files | Four documents for a change to one subsystem | Spec 000's contracts, amended in place, are the companions |

## Constitution Check (post-design)

Re-checked after §1 to §13. Nothing in the design changes a verdict above. The places nearest a line:
- **Principle I**: two flows that leave the stack change form; rows A1 and A2 say how, in the change, and the HTML loads nothing when opened.
- **Principle IV**: a new operator write; it sits behind the token and every guard the other writes have, and the bash gate's coverage of its name is proven by rows, not assumed.
- **The Alerting standard**: a design can delay an attempt by at most one more send, inside the lease and inside the 300 s window (§6.2, §6.3), and never delays degradation, which commits before any delivery.

Gate result: **PASS**.

## Analyze pass (spec × plan × tasks × constitution)

A read-only consistency pass in the form of `/speckit-analyze`, made after tasks.md was written, on 2026-11-08. Findings fixed in the documents before they were handed over are marked "resolved"; the rest are open, for the Author or for T001.

| ID | Category | Severity | Location | Summary | Resolution |
|---|---|---|---|---|---|
| A1 | Inconsistency | HIGH | spec FR-009, FR-011 | FR-011 put an adapter ID in `code`, but the ID sits inside the bold headline, and FR-009 forbids nesting | Resolved: FR-011 now gives a name inside the headline the headline's `bold` and no entity of its own |
| A2 | Inconsistency | HIGH | spec FR-016, SC-001; `test/unit/alerts.test.ts` | Q1's answer moves the email's subject off the first line, while the existing test pins "line 1 is the subject" | Resolved: the designed subject is the two emoji and the first line; the plain form, today's message, keeps the first line, so the existing test stands and the goldens pin the designed subject (D5) |
| A3 | Inconsistency | MEDIUM | spec FR-036, the earlier draft | The draft said a sample's subject begins with `[SAMPLE]`; with Q1's answer the emoji lead | Resolved: 🧪 leads the emoji, and `[SAMPLE] ` leads the first line, one rule for every subject (Clarifications) |
| A4 | Inconsistency | MEDIUM | spec FR-053, SC-012; plan §8.2 | FR-053 said the breach test's stand-in assertions stay unchanged, while §8.2 adds the form to them | Resolved: FR-053 and SC-012 say the existing assertions stay unchanged, with the new checks beside them |
| A5 | Underspecification | MEDIUM | plan §4.4, §5.5 | The Bot API's link-preview field, and nodemailer's `command` values for a refused message, are named from documentation, not read from the pinned versions | Open until T001, which records each; R-2 and R-13 bound the outcome |
| A6 | Dependency | MEDIUM | plan §14; spec Dependencies | Spec 010's alert texts may change before it merges, and this branch pins them in golden files | Resolved by procedure: rebase and regenerate (T050, R-5) |
| A7 | Coverage | MEDIUM | spec FR-023, FR-024 | Real facts can't pass a bound (a prefix of at most 32 characters, an adapter ID of at most 64), so `over_limit` can't be reached through them | Resolved: `over_limit` is tested through a renderer seam (T006, T030), and `case-longest` proves real facts stay inside every bound |
| A8 | Ambiguity | MEDIUM | spec FR-002 | "No other fact or sentence" needs a test that can fail | Resolved: §3.2's cross-form check of amounts, times, keys, and fingerprints (T018, T025) |
| A9 | Constitution | LOW | `CLAUDE.md`, "New endpoint or feature" | The sample route is a new endpoint | Resolved: its span (§9.3); the panels it feeds, the audit panel and the alert tables under the kind `sample`, as the other operator writes have none of their own (§7.2, §9.4); its cost (§15); its degraded answers (§7.2: 409, 503); and the disclosure rows (§12.3) |
| A10 | Terminology | LOW | spec Q2's table; FR-006 | The question's table names the first severity "Trip or exhaustion"; the Author's answer and the FRs call it Critical | Resolved: the FRs use the answer's names; the table stays as asked, its "Its name, as shown" column already Critical |
| A11 | Risk | LOW | plan §11 | A dev-cpu `REASON` holding "ENV", or a `--s…` option, trips the bash gate's stack reading | Resolved: D10 and T047's wording; a false refusal, never a gap |
| A12 | Dependency | LOW | plan §2.3, D14 | The migration's number (0006) and the ADR's (0042) assume spec 010's 0005 and 0041 | Resolved by procedure: T001 and T002 take the next free numbers on the base |
| A13 | Inconsistency | LOW | `redteam/forbidden-actions.sh` lines 776 to 786, 792 (on `main`) | The studio window's rows are still `planned`, though the hook enforces them | Open, the Author's backlog: not this branch's change (§11) |
| A14 | Coverage | LOW | spec SC-010 | The intent's "clear within a second" can only be the Author's reading | Accepted: T053, his note |
| A15 | Underspecification | LOW | spec Edge Cases | Whether Telegram makes a link of text inside a `code` entity | Open until T001 reads the reference; no form of ours carries a link either way (R-8) |
| A16 | Inconsistency | LOW | spec FR-044; plan §9.1 | FR-044 records the form of each attempt, `designed` or `plain`, while §9.1 gives `h4.alert.form` a third value, `none` | Resolved by reading: `none` is for a channel marked failed at its window's expiry, with no attempt, which FR-044's "each delivery attempt" doesn't reach |
| A17 | Coverage | LOW | spec SC-006; plan §8.2 | SC-006 runs on dev-cpu, but no admin read shows the outbox there | Resolved: the probe's step 12 proves delivery, the audit row, and the unchanged state and meters on dev-cpu (T047), and the gateway's integration test proves no sample row in the outbox (T034) |

**Coverage summary**: every FR from FR-001 to FR-053 has at least one task, by number or inside a named range (§17's table), and every success criterion has a test task or an Author's step: SC-001 (T026), SC-002 (T018, T019, T047), SC-003 (T027), SC-004 (T007, T030), SC-005 (T008), SC-006 (T034, T047), SC-007 (T034), SC-008 (T018, T025), SC-009 (T025), SC-010 (T053), SC-011 (T042), SC-012 (T047). No task lacks a requirement or a story.

**Metrics**: 53 FRs, 12 SCs, 55 tasks (T000 to T054), 5 of them the Author's (one optional), and one review by an agent that wrote none of the work (T048); FR coverage 100%; 0 critical; 2 high, both resolved in the documents; 6 medium (A3, A4, A6 to A8 resolved; A5 open until T001); 9 low (A13 and A15 open, the rest resolved or accepted).

**Next actions**: the Author's approval of the spec and this plan (T000); then T001, which settles A5 and A15.

## What T001 read, and the departures while building

### T001's record (2026-11-08, on `feat/010-anthropic-provider` at 911df96f)

- **The base.** `git rev-parse HEAD` at the cut printed 3ce910b4, which is 911df96f, that branch's tip, with `spec/011-alert-message-design`'s four commits cherry-picked; the worktree's `npm ci --ignore-scripts` used the session's npm cache.
- **nodemailer 10.0.16**, read in its own code under `node_modules/nodemailer/dist/esm/`. `mail-composer/index.js`'s `getAlternatives` orders the parts `text`, `watchHtml`, `amp`, then `html`, so the text part comes first in `multipart/alternative` (§5.5 as planned). In `smtp-connection/index.js`, `_formatError(message, type, response, command)` sets `err.command`, and `err.responseCode` from the reply's leading digits: a refused `DATA` command is `_actionDATA`'s `('Data command failed', 'EENVELOPE', str, 'DATA')`; a refused message end is `_actionSMTPStream`'s `('Message failed', 'EMESSAGE', str, 'DATA')`; a refused recipient is `'RCPT TO'`, and a refused sender `'MAIL FROM'`. So §5.5's reading holds without its fallback clause: a 5xx whose `command` is `DATA` is `message_refused`, and a refused recipient keeps the schedule (A5, R-2: settled).
- **Spec 010's alert variants as built at the base** (`src/alerts/format.ts`): `warn` with `meter: "adapter_month"` and `fallback_exhausted` with `adapterMonth`, each carrying `AdapterMonthFacts` with the adapter's ID and label, its month, spend, and cap; and `fallback_unavailable` with an optional `label`. As §2.2 assumed.
- **The newest migration** is `0005_adapter_month.sql`, which doesn't touch the audit log; the newest that does is `0004_twin.sql`, whose two action lists are §2.3's without `alert_samples`. So the number is 0006 and the lists stand (A12: settled).
- **The next free ADR** on the base is 0042: `docs/adr/README.md` ends at 0041 (D14).
- **The Bot API's facts.** This session has no route to telegram.org (the sandbox refuses it), and no installed package holds the reference, so each is recorded as an assumption that the Author's first prod samples confirm (T053), not as read:
  - `sendMessage` takes `entities`, a list of `MessageEntity` objects of `type`, `offset`, and `length` (and `url`, `user`, `language`, `custom_emoji_id`, which no form sends), the offset and length in UTF-16 code units; the text is at most 4,096 characters after entities parsing.
  - The link-preview field: since Bot API 7.0 the reference documents `link_preview_options` where it documented `disable_web_page_preview`. This branch keeps `disable_web_page_preview: true` on both forms (§4.4's first case): it is the body every alert has sent since spec 000, which the plain form must keep exactly (FR-013, FR-016), on the understanding that the Bot API still accepts the field it replaced. T053's check: no sample on his phone shows a link preview, the prefix's `h4reet.ai` being the likeliest trigger (R-13).
  - The FAQ's advice for one chat: about one message a second, which §7.4's pacing keeps under.
  - Whether Telegram makes a link of text inside a `code` entity: assumed not; T053's check is that no key or runbook path shows as a link (A15, R-8). No form carries a link either way.

### Departures

| ID | Task | Departure | Why |
|---|---|---|---|
| B1 | T009, T015 | Rules A2's and A8's tests are in `test/unit/config.test.ts`, which tests `validateAlerts`; `test/unit/validate-config.test.ts` tests the `validate-config` command, and gains nothing, since its pass over the committed files stands. Two existing assertions there change with the rule: `[5, 15, 30, 60, 180]` (290 + 10 = 300, which fit) now fails A2 (290 + 20 = 310), and "accepts the plan's values" gains `formats` | tasks.md named the file that runs the command, not the one that tests the rules |
| B2 | T018, T025 (§3.5) | The longest adapter ID is 32 characters: `validate.ts`'s `ADAPTER_ID`, `^[a-z][a-z0-9-]{0,31}$`, which migration 0005's period key repeats; `case-longest` uses 32, not 64 | §3.5 named 64 from a misreading of the routing rule |
| B3 | T012 (§2.3) | The two fallback-is-plain constraints read `CHECK (telegram_fallback IS NULL OR coalesce(telegram_form = 'plain', false))`, and the same for email, not `… OR telegram_form = 'plain'` | A `CHECK` passes when its expression is NULL, so §2.3's form admitted a reason on a row with no form at all; T009's case caught it |
| B4 | T014 (§4.4) | `sendTelegram` takes the text as a string, today's call, or `{text, entities?}`; a message with no entities, or an empty list, sends exactly today's body. `checkTelegram`, §4.3's check, lives in `forms.ts` beside the chooser that runs it, so the chooser and its tests need no design registered | The existing callers and tests keep their form; the check is the chooser's, not a renderer's |
| B5 | T022, T038 (§7.3) | `src/alerts/catalogue.ts` lands with T022, holding the 19 entries' fixed facts, since Phase 3's golden files render them; T038 adds the samples' parts to it. The two paid adapters it names, by routing.yaml ID and type label, come from a new `src/adapters/_samples.ts` (the registry skips `_` files, as `_settings.ts`), and the entries `unavailable-bedrock` and `unavailable-anthropic` are named from those IDs | `test/unit/provider-names.test.ts` (SC-006) refuses a provider's name in any string outside `src/adapters/` |
| B6 | T022 (§3.3, §3.5) | A sample's marks in the plain text and in Telegram's message land with T022, not T038, since `case-longest` carries them (§3.5); `renderAlert` takes the sample's mark as a third argument | `case-longest`'s Telegram text is pinned in Phase 3 |
| B7 | T032 (§9.5) | "Alerts arrive as plain text" is a `###` subsection at the end of the runbook's "Act", not a `##` section of its own | `evals/test_runbooks.py` holds every runbook to the six `##` sections in order; Phase 5's commit broke it, found by Phase 6's `make test` and fixed there |
| B8 | T037, T041 (§8.2) | Step 12's checks are four assertions, 12a (each sample on both stand-ins, designed, within 120 s), 12b (the audit row), 12c (`h4_alerts_total` under `sample`, at least both channels' deliveries), and 12d (today's and the month's meter gauges as the first status read them), with the status read again as an action holding the state; they read SKIP with real delivery, and a run with SKIPs passes. The probe's `telegram` and `mailpit` checks take an `expect`, and Mailpit's message is read for its form only when the check asks | §8.2 named the operations, not the table's rows; an assertion is a check, never an action, by the breach test's own rule |
| B9 | T042, T043 (§12.4) | T042 spends through prod's own meter, as spec 010's adapter-month test does, with spec 010's prod configuration (`anthropicConfigDir` with a $1.00 cap, and `anthropicFactories`), rather than through hello calls to its stub adapter; T042 passed at once, so T043 changed nothing | The adapter month's alerts are written by the meter's commit, whichever call path reaches it; the meter is what spec 010's own tests drive |
| B10 | T039 (§7.4) | A pass sends no sample on a channel that attempted the in-memory `store_unreachable` alert in that pass, as well as none on a channel with a due row | A real alert first, whichever store holds it; §7.4 named only the outbox's rows |
| B11 | T049, T052 (§13, §14) | The note's steps for the Author follow his answer at T000, not §13's steps 1 and 2 or §14's merge order: no gate of `spec/011-alert-message-design` alone, since its commits ride in this branch; spec 010's P-A committed on a branch cut from this branch's tip; the behavioral tier's run for P-A's `.claude/` and `CLAUDE.md`; one gate of that branch, with `--prove` for P-A's `.claude/settings.json`; and one guarded merge, which brings in spec 010 and spec 011 together. Spec 010's own steps after its merge (`make init-env ENV=prod SYNC=1`, then P-C and P-B) come before §13's step 3, `make up ENV=prod` | T000 records his answer, and T052 follows it; the T000 commit (3ce910b4) changed tasks.md only, so §13 and §14 still named two gates and two merges |
| B12 | T038 (§7.2) | The in-flight check is a flag set before the audit row's transaction and cleared once the samples are queued or the request fails, beside `samples.pending()`; `operator-admin.md` §2.4's 409 row says so | T048's review: the check ran before the awaited transaction and the queue after it, so two requests that overlapped both passed; PGlite answers within one turn of the event loop, so the test stands a timer's wait for a real store's round trip |
| B13 | T007, T016 (§9.2) | `alert.retry` and `alert.failed` carry `fallback_reason` when the plain form went in the designed one's place, as `alert.delivered` does; the records from before version 2's facts, which go plain as `not_rendered`, carry it too, so `dispatcher.test.ts`'s and `smtp-tls.test.ts`'s exact records gain it | FR-044 names all three records; §9.2 had given the reason to `alert.delivered` alone (T048's review) |
| B14 | T022, T038 (§7.3) | The two adapter-month entries name the Author's $20.00 cap, his answer at spec 010's T000: the warning's spend $14.40, 72%, as $7.20 was of $10, and its month meter $14.70, which holds that spend; the exhausted entry spends the whole cap. Golden files 04, 07, and `case-longest` are regenerated with `-u` in the next commit | T048's review, decision D-2, the main session's while the Author was away, provisional and his to overturn: spec 010's texts' $10 would have put a cap he never chose on prod's samples |
| B15 | T037, T041 (§8.2) | The receivers' checks, 3b, 4c, 5d, 7d, and 10b, keep their operations as they were before this spec, and each alert's designed form is an assertion of its own in the same step, on the same key: 3d, 4f, 5f, 7g, and 10i, in stand-in mode only, reading SKIP with real delivery as step 12's do | FR-053's letter, "the checks of the designed forms that the plan adds sit beside them"; the build had put `designed: true` inside the receivers' own operations, as §8.2 worded it (T048's review) |
