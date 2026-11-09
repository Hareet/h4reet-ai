# Feature Specification: Alerts Designed to Be Read — An HTML Email, an Organized Telegram Message, and a Sample of Each

**Feature Branch**: `spec/011-alert-message-design` (documents only), in a worktree cut from `main` at a5eb05b8; the implementation branch, which the plan names, builds on spec 010's implementation tip (`feat/010-anthropic-provider`) or on `main` once that branch merges (Assumptions, "Dependencies")

**Created**: 2026-11-08

**Status**: Draft, for `/speckit-clarify`. Written from the intent beside it, which the Author accepted on 2026-11-08, together with his answer on how the email's HTML is built (Clarifications). Five questions wait for him (Clarifications, "Pending"); each FR that rests on one carries a needs-clarification marker naming it. No plan or tasks yet: clarify comes first, with the Author. Nothing is built before he answers them and approves this spec and its plan.

**Input**: [`intent.md`](intent.md) in this folder, with the Author's words verbatim, Claude's reading beside them, and his two answers of 2026-11-08. Also read, on `main` at a5eb05b8: the [constitution](../../.specify/memory/constitution.md) 1.0.1 and `CLAUDE.md`; [ADR 0005](../../docs/adr/0005-telegram-and-smtp-alerting.md) and the ADR index; spec 000's [spec](../000-local-foundations/spec.md) (FR-032 to FR-034), its [alerts contract](../000-local-foundations/contracts/alerts.md), whole, its [data model](../000-local-foundations/data-model.md) §2.7, its [telemetry contract](../000-local-foundations/contracts/telemetry.md) §3.2, §3.5, §4.1, its log records, and §7.5, and its [operator-admin contract](../000-local-foundations/contracts/operator-admin.md) §1 and §2.1 to §2.2; the gateway's `src/alerts/` (`format.ts`, `telegram.ts`, `smtp.ts`, `outbox.ts`, `dispatcher.ts`) and `test/unit/alerts.test.ts`; `config/alerts.yaml`; `evals/standins/telegram_standin.py` and the stand-in checks of `evals/breach_probe.py`; `scripts/operator.py`'s header and the `Makefile`'s operator targets; `.claude/settings.json` and `.claude/hooks/bash-gate.sh`'s operator rules (read, not changed); `docs/runbooks/alert-channel-down.md`'s outline; and the [data-flow disclosure](../../docs/data-flow-disclosure.md), rows S11 to S13, A1, and A2. On spec 010's branch, read only, in its worktree: its spec (FR-023, FR-037), its amended alerts contract's three "(spec 010)" passages, and its `format.ts`'s adapter-month variants. Not read: the skill and the Telegram page the Author linked, since this session has no route to github.com or telegram.org; the facts about the Bot API below are its documented ones, which the plan confirms against the reference.

Summary: every alert keeps its facts, and its plain text, and gains two designed forms beside it. Telegram gets short labelled lines, an emoji for the alert's kind and one for its severity, the headline in bold, the ID and the runbook in monospace, and the meters in an aligned block, all through message entities and never `parse_mode`, with every offset counted in UTF-16 code units and pinned by tests. Email becomes a `multipart/alternative` message: today's text for clients that show no HTML, and a hand-written table layout, 600 pixels wide at most, light and dark, that loads nothing when opened. Both render from the same typed facts as the plain text, add no fact, and read in one order: severity, headline, what to do next, the meters, the states, the time, the ID, the runbook. A design never costs an alert: a designed form that a channel refuses, or that can't be rendered, gives way at once to the plain text, recorded as a fallback with its reason, counted, and shown on the dashboard. An operator command sends a marked sample of every kind, spec 010's included, through the channels, outside the outbox and every count of real alerts. Cloud cost: $0.

## Clarifications

### Session 2026-11-08: the Author's answers

Recorded in his words, as the intent records them. Each question is the session's; each answer is the option he chose, and the option's text is as it read.

- Q: "Intent 011, the alert redesign (an HTML email and an organized Telegram message with emoji): shall I move it into specs/011 and have a spec written now?" → A (the Author): "Accept and specify (Recommended)". The intent is accepted, and this spec is written from it.
- Q: "How should the HTML alert email be built: hand-written email tables with no new dependency, or MJML compiled at build time?" → A (the Author): "Hand-written tables (Recommended)". The option read: "No new package. A small renderer writes the table-and-inline-style HTML that MJML would produce, and tests pin the output for every alert kind." This answers the intent's open question 1 (FR-005, FR-018, FR-052).

Not asked, and why:

- **Telegram's formatting** (the intent's open question 2). The Author's own link names message entities, so this spec takes them (FR-008) and asks nothing about it. It is this spec's reading of his link, not his answer.
- **The order with spec 010** (the intent's open question 6). A dependency, which the plan settles from the branches' state when it starts (Assumptions, "Dependencies").

### Pending, for `/speckit-clarify`

Five questions wait for the Author. Each is asked in full, with its options and a recommended one, under Open Questions at the end.

- **Q1** (pending): Does the email's subject change, and may it carry an emoji? (FR-016)
- **Q2** (pending): Which severity is each kind, and which emoji and colours mark them? (FR-006, FR-007, FR-020)
- **Q3** (pending): What replaces §3's "at most 1,000 characters", for each form? (FR-023, FR-024)
- **Q4** (pending): Where may samples go, and how does the Author look at dev's? (FR-040)
- **Q5** (pending): Does the email draw the meters as bars? (FR-021)

## Source: The Author's Words, and the Record

Quoted as the sources record them. The reading beside each is this spec's, to correct where it's wrong; it never replaces the words.

- **The Author, 2026-11-08**, as the intent records his words:

  > "We also want to update the alerting message designs. Let's make the email look like a well-designed email page, perhaps html detailing the alert. Let's make the Telegram message cleanly organized, using some emoji's. Maybe something like this skill could help? https://github.com/framix-team/skill-email-html-mjml https://core.telegram.org/api/entities"

  Reading: "make the email look like a well-designed email page, perhaps html detailing the alert" is User Story 2: an HTML part that details every fact of the alert, beside today's text, not in its place (FR-015). "make the Telegram message cleanly organized, using some emoji's" is User Story 1: labelled lines, an emoji for the kind and one for the severity, bold and monospace from entities (FR-007 to FR-011). Of the two links, the skill writes MJML, which his answer replaced with hand-written tables (Clarifications), and the Telegram page names message entities, which this spec takes (FR-008).

  > "And we want the alerts working and going on when using the new anthropic api directly"

  Reading: spec 010's alerts, its adapter month's warning and exhaustion and `fallback_unavailable` naming the Anthropic API, get these designs and are tested with prod routing the Anthropic API (User Story 5, FR-048). That its spend counts against the ceilings and its own cap is spec 010's (its FR-020 to FR-023), not repeated here.

- **The intent's reading of what better looks like** (Claude's, accepted with the intent): "An alert's severity, its headline, and what to do next are clear within a second, on a phone and in a mail client, in light and dark themes." Reading: FR-003's order, FR-006 and FR-007's marks, FR-020's two palettes, and SC-010, which the Author judges. And: "The Author can see each design before it matters: a sample of each kind, marked as a sample, in dev's stand-in mailbox and on his real channels." Reading: User Story 4 and FR-032 to FR-041. Dev's stand-in mailbox has no published interface, which Q4 puts to him.
- **The constitution's Alerting standard**: "Telegram bot as primary channel, email as secondary; both free. Automated degradation never depends on an alert being delivered." Reading: the same two channels and destinations (FR-051, FR-053); a design never loses or delays an alert (User Story 3, FR-025 to FR-030).
- **Spec 000's FR-032**: "Alerts MUST carry only operational facts (which threshold, the meter values, the runtime state, the time), never payloads, client identifiers, or secrets." Reading: the designed forms add no fact (FR-002), and §5 holds for every form (FR-042, FR-043).
- **contracts/alerts.md §1**: "**Degradation never waits on delivery** (the constitution's Alerting standard). An alert row is committed in the same transaction as the crossing, trip, exhaustion, or operator action that caused it." Reading: rendering a designed form can't fail, abort, or delay that transaction (FR-025).
- **contracts/alerts.md §3**: "Plain text, UTF-8, at most 1,000 characters", and "**Telegram** gets the whole text. **Email** gets line 1 as its subject and the whole text as its body." Reading: the plain text stays as written (FR-002), and the forms beside it get bounds of their own (Q3); amended by name (0-1, 0-2).
- **contracts/alerts.md §5**: "The formatter (`src/alerts/format.ts`) takes a typed `Facts` object holding only numbers, states, times, the dedupe key, and the fingerprint. It has no field a payload or a client label could arrive through." Reading: every form renders from those facts alone (FR-001), and the canary test grows to cover every form (FR-043).
- **ADR 0005's Decision**: "Telegram through the Bot API (plain text), and email through SMTP with TLS (nodemailer)." Reading: extended, not replaced, by a new ADR (FR-050).
- **contracts/operator-admin.md §1.3**: "Only the three operator writes send one, so an unexpected reset, renewal, or initialization gets noticed. The test and adapter endpoints are audited but not confirmed." Reading: a sample request is audited and not confirmed; the samples themselves, each naming who asked, are its notice (FR-033).
- **Spec 010's FR-037** (on its branch): "THE ALERTS SHALL name the adapter's month in its warning and its exhaustion, and "the Anthropic API" in `fallback_unavailable`". Reading: catalogue entries 4, 7, and 15 (FR-004).
- **`CLAUDE.md`**: "New endpoint or feature → also: telemetry span, dashboard panel, cost estimate in the spec, degraded-mode behavior, data-flow disclosure entry (`docs/data-flow-disclosure.md`) if a byte leaves the visitor's device." Reading: the spans (FR-044, FR-047), the panel (FR-046), the cost (Expected Cost Impact), the degraded mode (its table), and the disclosure: no visitor's byte is involved, and rows A1, A2, S12, and S13 are described again (FR-051).

## User Scenarios & Testing *(mandatory)*

The user is the Author, the alerts' only reader, on Telegram (the primary channel) and email (the secondary). Principle I asks for the degraded mode before the happy path: User Story 3 and the Degraded-Mode Behavior table define it, and the plan builds it first, before either design ships.

### User Story 1 - The Author Reads a Telegram Alert at a Glance (Priority: P1)

As the Author, I want each alert on my phone's Telegram to show at once how serious it is, what happened, and what to do next, so I can act without reading a block of run-together text.

**Why this priority**: Telegram is the primary channel (contracts/alerts.md §1). His words: "Let's make the Telegram message cleanly organized, using some emoji's."

**Independent Test**: Render every catalogue entry's Telegram form from its fixed facts, and send each through the Telegram channel to the stand-in on dev-cpu: the severity's emoji and name lead, then the kind's emoji and the headline in bold, the next step comes before the meters, the meters are one monospace block, the ID and the runbook are monospace; every entity is valid in UTF-16 code units; the stand-in accepts each message; and the breach test's search finds each alert by its key.

**Acceptance Scenarios**:

1. **Given** a trip on prod, **When** its alert goes to Telegram, **Then** the message opens with the severity's emoji and name and the stack's prefix, then the trip's emoji and the headline in bold, then the fixed sentence, the meters in a monospace block, the runtime and fallback states, the time, `id <key>`, and the runbook path in monospace; and the request carries `text` and `entities`, no `parse_mode`, and link previews disabled.
2. **Given** any catalogue entry, **When** its designed message is rendered, **Then** every entity's offset and length, counted in UTF-16 code units, covers exactly its intended text, starts and ends on no half of a surrogate pair, overlaps no other entity, and is `bold`, `italic`, `code`, or `pre`.
3. **Given** a stack prefix or an adapter label that holds `*`, `_`, `<`, `&`, a backtick, or an emoji, **When** the message is rendered, **Then** those characters appear as themselves and every entity still covers its intended text.
4. **Given** dev with the test clock and synthetic spend, **When** an alert is rendered, **Then** every time carries "(test clock)" and the meters carry "(synthetic spend)", as the plain text does.
5. **Given** a designed message on the Telegram stand-in, **When** the breach test searches the stand-in for the alert's key, **Then** it finds it, as it does today.

---

### User Story 2 - The Author Opens an Alert Email That Details the Alert (Priority: P1)

As the Author, I want each alert email to open as a well-designed page that details the alert, readable on my phone and my desktop in light or dark, while a client that shows no HTML still shows today's text.

**Why this priority**: His words: "Let's make the email look like a well-designed email page, perhaps html detailing the alert." Email is the secondary channel, tried on its own, so it ships alone if it must.

**Independent Test**: Render every catalogue entry's email: one `multipart/alternative` message whose text part is the §3 text byte for byte and whose HTML part passes the element and attribute allowlist, escapes every value, holds no URL, declares both themes, and keeps FR-003's order; both palettes pass the contrast check; each output matches its golden file; and Mailpit on dev-cpu receives both parts with the alert's header.

**Acceptance Scenarios**:

1. **Given** any alert, **When** its email is sent, **Then** it is one `multipart/alternative` message: a `text/plain` part identical to the §3 text, then a `text/html` part, both UTF-8, with no attachment or embedded image, and with `Auto-Submitted` and `X-H4-Alert-Id` as today.
2. **Given** the HTML part, **When** it is opened, **Then** it loads nothing from anywhere: no image, font, stylesheet, script, frame, or link, and no element or attribute outside the allowlist.
3. **Given** a client that honours `prefers-color-scheme: dark`, **When** it shows the HTML, **Then** it shows the dark palette; and in either palette every text contrasts with its background at 4.5:1 or more.
4. **Given** a phone about 360 pixels wide, or a desktop client, **When** the HTML is shown, **Then** one column fits the width, 600 pixels at most, and the severity, the headline, and the next step come first.
5. **Given** a prefix or a label holding `<`, `>`, `&`, `"`, or `'`, **When** the HTML is rendered, **Then** each appears escaped, as text.
6. **Given** any alert, **When** its email is sent, **Then** its subject is as Q1 settles it.

---

### User Story 3 - An Alert Is Never Lost to Its Design (Priority: P1)

As the Author, I want an alert never to be lost or delayed by its design: if a channel refuses the designed message, or the design can't be rendered, the plain text still goes out, at once.

**Why this priority**: The constitution's Alerting standard, "Automated degradation never depends on an alert being delivered"; contracts/alerts.md §1, "Degradation never waits on delivery"; and the intent's constraint, "An alert is never lost to its design". This is the degraded mode, built in the foundation before Stories 1 and 2 ship (Principle I).

**Independent Test**: With stubbed channels and a test clock, in unit and integration tests: make Telegram refuse the entities, make the HTML renderer throw, make the mail server refuse the multipart message, queue a row as the code before this change wrote it, and set `formats` to `plain`. Each alert arrives in its plain form in the same attempt, with no added wait, recorded with its reason; and a renderer that throws inside a crossing's transaction leaves the crossing committed.

**Acceptance Scenarios**:

1. **Given** Telegram answers a designed message with a 400, **When** the dispatcher handles the answer, **Then** it sends the same alert's plain text at once, in the same attempt, with no entities and no `parse_mode`; the attempt counts once; the outcome records the form `plain` and the reason `entities_refused`; and every later attempt of that alert on Telegram sends the plain text.
2. **Given** the HTML renderer throws for an alert, **When** its email goes, **Then** it goes as `text/plain` only, recorded as `render_failed`, with no delay.
3. **Given** the mail server refuses the multipart message's data with a permanent reply, **When** the dispatcher handles it, **Then** it sends the text-only message at once, in the same attempt, recorded as `message_refused`.
4. **Given** the renderer throws while a crossing's transaction queues its alert, **When** the transaction ends, **Then** the crossing, its state change, and its outbox row with the plain text have all committed.
5. **Given** an outbox row written before this change, **When** it is delivered, **Then** it goes in its plain form, recorded as `not_rendered`.
6. **Given** any fallback, **When** it happens, **Then** it is counted, logged, on its span, and on the dashboard's fallback panel, and it raises no alert of its own.
7. **Given** `formats: {telegram: plain}` in `config/alerts.yaml`, **When** an alert goes to Telegram, **Then** Telegram gets today's plain text, recorded as the form `plain` with no fallback.

---

### User Story 4 - The Author Sees Each Design Through a Marked Sample (Priority: P2)

As the Author, I want to send a sample of every alert kind through the channels, marked so that no one could take it for a real alert, so I can see each design before a real alert needs it.

**Why this priority**: The intent's outcome, "The Author can see each design before it matters". The designs ship without it, but then a real alert is the first time he sees one.

**Independent Test**: On dev-cpu, run `make operator-alert-samples ENV=dev-cpu REASON="…"`: one audit row; every catalogue entry arrives at both stand-ins in its designed form, marked as a sample in every form, keyed `dev-cpu:sample:…`; the outbox, the state, the meters, and the journal are unchanged; and the metrics count the samples under the kind `sample` alone.

**Acceptance Scenarios**:

1. **Given** dev-cpu, **When** the operator asks for samples with a reason, **Then** one audit row records the request, and every catalogue entry arrives at both stand-ins in its designed form.
2. **Given** any sample, **When** any of its forms is read, **Then** it says it is a sample: the subject and the plain text's first line begin with `[SAMPLE]`, Telegram's first line names it a sample, and the HTML opens with a sample banner; and each says that nothing happened, and names the requester's fingerprint.
3. **Given** a sample's key, **When** it is compared with every real alert's key form, **Then** the two can never be equal.
4. **Given** samples were sent, **When** the outbox, the meters, the state, the journal, the reminder, or an incident draft is read, **Then** none of them shows a sample.
5. **Given** samples are pending, **When** a real alert falls due, **Then** the real alert is attempted before the next sample.
6. **Given** an earlier request's samples are pending, **When** another request arrives, **Then** it is refused with 409 `samples_in_flight`.
7. **Given** an agent session, **When** it runs the target with `ENV=prod` or `ENV=dev`, **Then** the target and the bash gate refuse it, as they refuse every operator target outside dev-cpu.
8. **Given** prod, **When** the Author asks for samples, **Then** they go where Q4 settles.

---

### User Story 5 - Alerts Keep Working When Prod's Paid Fallback Is the Anthropic API (Priority: P2)

As the Author, I want the alerts to keep working, in their new designs, when prod's paid fallback is the Anthropic API rather than Bedrock.

**Why this priority**: His words: "And we want the alerts working and going on when using the new anthropic api directly." Spec 010 adds the alerts; this spec designs them, so this story needs spec 010's code.

**Independent Test**: On the gateway's test stack with prod's route naming `anthropic` (spec 010's stub and test clock): drive the adapter's month past its warning and then its cap, and make its health check fail. Each alert renders in all three forms, passes the canary test, and is delivered to the stand-ins. Repeat with the route naming `bedrock`.

**Acceptance Scenarios**:

1. **Given** prod routes `anthropic`, **When** the adapter's month crosses its warning, **Then** the warning alert shows the adapter's month against its cap, under the warning severity, in every form.
2. **Given** the same, **When** the month reaches its cap, **Then** the exhaustion alert shows the month against its cap, its sentence, and `fallback-renewal.md`, under the trip-or-exhaustion severity, in every form.
3. **Given** the adapter turns unhealthy, **When** `fallback_unavailable` fires, **Then** every form names "the Anthropic API" and `anthropic-unavailable.md`.
4. **Given** prod routes `bedrock`, **When** `credentials_expiring` or `fallback_unavailable` fires, **Then** each renders as before in its plain text, and in both designed forms.

### Edge Cases

- **Telegram refuses a message for another reason with the same 400** (a chat that doesn't exist): the plain resend gets the same answer, and the channel follows the schedule in its plain form until it is marked failed, as today (§4.4).
- **A restart between a refusal and its plain send:** the lease ends, the next claim sends the designed form once more, is refused again, and falls back: at most one extra request.
- **A client that shows no HTML** (a plain-text reader, a watch): it shows the text part, today's text.
- **A client that drops `<style>`, or forces its own dark mode:** the inline light palette and the reading order carry the alert, and the severity reads in words and emoji as well as colour (FR-007).
- **Text a client links on its own:** some clients make links of text that reads as a domain, such as the prefix's `h4reet.ai`, or a runbook's name, since `.md` is a top-level domain, so a tap could open a site the alert never names. No form carries a link (FR-022). Telegram's form puts the key and the path in `code` (FR-011); the plan confirms that Telegram links nothing there. The HTML carries the declarations that turn off a client's detection where clients offer them.
- **A device that lacks an emoji:** a box, or nothing, shows in its place; the labels and the severity's name are words.
- **The meters block:** it holds no emoji, so its columns stay aligned in a monospace font.
- **A meter past its ceiling** (spec 000 bounds the overshoot): the numbers show it; a bar, if Q5 adds bars, shows full.
- **Rows pending at the deploy:** they go in their plain form (FR-030).
- **Samples while both channels are down:** they fail as alerts do and are counted under `sample` on the panel; the request's answer never waits for delivery.
- **Samples and the alerts mailbox's sending limit:** a full catalogue is 19 emails. The alerts mailbox is a free account, whose daily sending limit the repository doesn't hold and real alerts share; one request at a time (FR-039) bounds a burst.
- **The store down while samples are pending:** samples already held keep going, since they are in memory; a new request answers 503.
- **Dev's recorded real-delivery run** (`make breach-test ENV=dev DELIVERY=real`): samples sent during it go to the real channels, with the `[dev]` prefix.

## Requirements *(mandatory)*

### Functional Requirements

**The forms, from the same facts**

- **FR-001**: THE GATEWAY SHALL render every alert in three forms from the same typed facts, the alert's context and spec that contracts/alerts.md §5 describes: (1) the plain text of §3; (2) Telegram's designed message, a text with message entities; (3) the email's HTML part. No form SHALL be built from another form's output, and none SHALL take any input but those facts, the stack's prefix from `config/alerts.yaml`, and fixed words in the renderer's code.
- **FR-002**: THE PLAIN TEXT SHALL stay §3's text, byte for byte, for every alert (a sample adds its marks, FR-036): it is the email's `text/plain` part and each channel's fallback. THE DESIGNED FORMS SHALL carry the plain text's content and no other fact or sentence: they arrange it, and add only the severity's name and emoji, the kind's emoji, labels that group the facts, a meter's bar if Q5 adds bars, and a sample's marks.
- **FR-003**: EVERY designed form SHALL present the alert in this order: the severity's marks; the headline and the stack's prefix; what to do next, the kind's fixed sentence, where the kind has one; the meters against their ceilings or allowances, with spec 010's adapter month against its cap where its alert carries it; the runtime state and the fallback state, the latter left out where §3 leaves it out; the time; the alert's ID; and the runbook path. A kind with no meter facts SHALL omit the meters, as §3 omits its meters line.
- **FR-004**: THE DESIGNS SHALL cover every kind and variant at this spec's base, spec 010's included, as a fixed catalogue of 19 entries, one for each kind and each variant whose layout differs, each with fixed sample facts committed beside the renderer: (1) `warn`, day; (2) `warn`, month; (3) `warn`, fallback grant; (4) `warn`, a capped adapter's month (spec 010); (5) `trip`; (6) `fallback_exhausted`, a grant; (7) `fallback_exhausted`, a capped adapter's month (spec 010); (8) to (12) `operator_action`: reset, renew, init, and spec 003's studio GPU window opened and closed; (13) `credentials_expiring`; (14) `fallback_unavailable`, Bedrock; (15) `fallback_unavailable`, the Anthropic API (spec 010); (16) `auth_failed`; (17) `store_unreachable`; (18) `reminder`, degraded; (19) `reminder`, awaiting renewal. A kind or variant added later SHALL join the catalogue in the change that adds it.
- **FR-005**: TESTS SHALL pin each catalogue entry's three forms as committed golden files ("tests pin the output for every alert kind", the option the Author chose), and the cases the entries leave out as further cases: the monthly trip, each health reason of `fallback_unavailable`, the reminder covering both conditions, a reset with no meter at its ceiling, dev's marks and the test clock, and FR-024's longest facts. The golden HTML files SHALL be an offline preview: a browser opens them from the working tree, and they load nothing (FR-019).

**Severity and its marks**

- **FR-006**: EACH catalogue entry SHALL have one of four severities: trip or exhaustion; warning; operator action; information. [NEEDS CLARIFICATION: Q2, which kinds take which; recommended: trip or exhaustion for `trip`, both `fallback_exhausted` variants, and `store_unreachable`; warning for every `warn`, `credentials_expiring`, `fallback_unavailable`, and `auth_failed`; operator action for every `operator_action`; information for `reminder`.] A sample SHALL take its entry's severity.
- **FR-007**: EVERY designed form SHALL mark the severity by its emoji and its name in words, and the HTML also by its colour, so that no form carries severity by colour alone; and each kind SHALL have an emoji of its own. [NEEDS CLARIFICATION: Q2, which emoji and colours; recommended: a red, orange, blue, or white circle by severity, and one symbol for each kind, as Q2's table gives them.] Every emoji SHALL be one code point, or one code point and the emoji variation selector U+FE0F: no joined sequence, skin tone, flag, or keycap, so each has a fixed length in UTF-16 code units that the tests pin. Every label SHALL be a word, so no fact's meaning rests on an emoji.

**Telegram**

- **FR-008**: THE TELEGRAM CHANNEL SHALL send a designed message as `sendMessage` with `text` and `entities`, the Bot API's list of `MessageEntity` objects, which are the message entities of the Author's link, and SHALL NEVER send `parse_mode`, so that no character of any value can be read as markup and nothing needs escaping.
- **FR-009**: THE ENTITIES SHALL be of four types only: `bold`, `italic`, `code`, and `pre`, a `pre` with no `language`. None SHALL link, mention, or hide text: no `url`, `text_link`, `text_mention`, `mention`, `email`, `custom_emoji`, or `spoiler`. Entities SHALL have a length above zero, SHALL neither overlap nor nest, and SHALL come in increasing order of offset.
- **FR-010**: EACH entity's `offset` and `length` SHALL count UTF-16 code units of `text`, as the Bot API defines them, and no entity SHALL begin or end between the two halves of a surrogate pair. Tests SHALL check every entity of every entry against the text's own UTF-16 code units, with emoji of one, two (a surrogate pair), and three code units (with the variation selector) placed before entities, whichever of them the designs use, and with a prefix that holds an emoji.
- **FR-011**: THE DESIGNED MESSAGE SHALL put the headline in `bold`; the dedupe key, the runbook path, and any adapter ID in `code`; and the meters in one `pre` block, aligned in columns. Short labelled lines SHALL group the other facts.
- **FR-012**: THE DESIGNED MESSAGE SHALL hold the alert's dedupe key as the whitespace-delimited token `id <dedupe key>`, as the plain text's runtime line does, so that the breach test's search of the Telegram stand-in finds each alert unchanged (`evals/breach_probe.py`, `token_match`).
- **FR-013**: EVERY Telegram request, designed or plain, SHALL keep link previews disabled: §4.1's `disable_web_page_preview: true`, or the field the Bot API's reference documents in its place when the plan is written.
- **FR-014**: THE RENDERER SHALL check its Telegram output before it is used: every entity within the text, of an allowed type, on boundaries that split no surrogate pair, overlapping none, and the text within its bound (FR-023). Output that fails the check SHALL never be sent; the plain text SHALL go in its place (FR-025, `render_failed`).

An illustration of the trip's designed message, not normative (the golden files are), with the circle, the name, and the symbol that Q2 recommends: `bold` over the second line's headline, `pre` over the three meter lines, and `code` over the key and the path. The first two lines are what a phone's notification shows.

```text
🔴 Critical · [h4reet.ai prod]
🛑 KILL SWITCH TRIPPED: daily ceiling reached
Next: Every request now gets the degraded response, local answers included. Only an operator reset restores service.
Meters
Daily      5.00 /  5.00 USD   warning  3.50
Month     13.40 / 20.00 USD   warning 14.00
Fallback   2.00 /  4.00 USD   grant 2
Runtime: degraded since 2026-10-29T16:40:03Z
Fallback: available
Time: 2026-10-29T16:40:03Z
id prod:trip:day:2026-10-29
Runbook: docs/runbooks/kill-switch-trip.md
```

**Email**

- **FR-015**: THE EMAIL CHANNEL SHALL send each alert as one `multipart/alternative` message: the `text/plain` part (FR-002) first, then the `text/html` part, both UTF-8, with no other part, attachment, or embedded image. The headers `Auto-Submitted: auto-generated` and `X-H4-Alert-Id` SHALL stay as §4.1 has them, and the message SHALL gain no header but MIME's own.
- **FR-016**: THE SUBJECT SHALL be [NEEDS CLARIFICATION: Q1; recommended: today's, the plain text's first line, the prefix and the headline, with no emoji, and `[SAMPLE] ` before it for a sample].
- **FR-017**: THE HTML PART SHALL escape every value it writes (`&`, `<`, `>`, `"`, and `'`), the stack's prefix and an adapter's ID and label included.
- **FR-018**: THE HTML PART SHALL be laid out with tables and inline styles, in one column 600 pixels wide at most that narrows to a phone's width, with a viewport declaration, the document's language, presentation roles on its layout tables, and its text in FR-003's order, so that a client that drops styles, or a screen reader, reads the facts in that order. It SHALL use only fonts already on the reader's device, through a system font stack.
- **FR-019**: THE HTML PART SHALL load nothing when opened: no image, font, stylesheet, script, frame, object, form, base, or link element; no `src`, `srcset`, `href`, `action`, or `background` attribute, and no `url(…)` or `@import` in a style; no tracking of any kind; and no hyperlink, so that opening an alert sends nothing anywhere. Tests SHALL hold every element and attribute of every entry's HTML to an allowlist, and find no URL in it.
- **FR-020**: THE HTML PART SHALL declare both themes (`color-scheme` and `supported-color-schemes`, `light dark`) and give a dark palette under `prefers-color-scheme: dark` where a client honours it. In each palette, every text SHALL contrast with its background at 4.5:1 or more (WCAG 2.x, level AA), which a test computes from the palette. (The severity colours rest on Q2.)
- **FR-021**: THE HTML'S METERS SHALL show each meter's spend against its ceiling or allowance, with its warning where the facts hold one, as numbers that are always printed. [NEEDS CLARIFICATION: Q5, whether the meters are also drawn as bars; recommended: yes, a bar to the ceiling built from table cells sized from the same facts, with a mark at the warning, and full when past the ceiling.]
- **FR-022**: THE RUNBOOK SHALL appear in every form as its repository path, in text, and never as a link, since the repository is local; no form SHALL link anywhere.

**Bounds**

- **FR-023**: EACH form SHALL have a bound. [NEEDS CLARIFICATION: Q3; recommended: the plain text 1,000 UTF-16 code units, as the renderer counts today; Telegram's designed message 2,000 UTF-16 code units, under half the Bot API's 4,096; the HTML part 32 KiB of UTF-8.] A designed form past its bound SHALL never be cut: the plain form SHALL go in its place (FR-025, `over_limit`). The plain text's own cut, kept from §3 as a last resort, SHALL never split a surrogate pair.
- **FR-024**: TESTS SHALL render every entry at its longest facts (the longest adapter ID and label the schemas allow, dev's synthetic-spend mark, the test-clock mark on every time, the reminder naming both ceilings, and a sample's marks) and assert each form within its bound.

**Never lost to its design**

- **FR-025**: RENDERING a designed form SHALL never fail or abort the transaction that commits an alert's cause, SHALL do no input or output while that transaction is open, and SHALL never stop the alert's plain text being queued (§1: "Degradation never waits on delivery"). IF a designed form can't be rendered, or fails its check, THEN the alert SHALL go on that channel in its plain form, recorded as a fallback with the reason `render_failed`.
- **FR-026**: WHEN Telegram answers a designed message with a 400, as its HTTP status or as its answer's `error_code` (a refusal such as "can't parse entities"), THE DISPATCHER SHALL send the same alert's plain text at once, in the same attempt, with no entities and no `parse_mode`, and record the fallback with the reason `entities_refused`.
- **FR-027**: WHEN the mail server refuses the multipart message itself, with a permanent (5xx) reply to its data after accepting its sender and recipient, THE DISPATCHER SHALL send the text-only message at once, in the same attempt, and record the fallback with the reason `message_refused`.
- **FR-028**: ONCE a channel has fallen back for an alert, EVERY later attempt of that alert on that channel SHALL send the plain form. A fallback SHALL add no wait: the plain send SHALL follow at once, the attempt SHALL count once in §4.2's schedule, and the attempt's lease SHALL cover both sends, so that no other pass can claim the row between them.
- **FR-029**: EVERY other failure SHALL keep §4's handling: a timeout, a refused connection, a 429 or a 5xx from Telegram, and a transient (4xx) reply from the mail server are retried on the schedule in the form last sent. Only FR-025 to FR-027 change the form.
- **FR-030**: AN ALERT queued before this change, which has no designed form, SHALL go in its plain form, recorded with the reason `not_rendered`, so that the rows pending at a deploy are delivered as before.
- **FR-031**: `config/alerts.yaml`, the Author's file, SHALL accept an optional `formats` map, with `telegram` and `email` each `designed` or `plain`, and `designed` where absent. WHILE a channel's value is `plain`, that channel SHALL send every alert in its plain form, recorded as the form `plain` with no fallback. The gateway's schema SHALL accept the key in the change that adds the designs, so his file needs no edit for the default.

**Samples**

- **FR-032**: `make operator-alert-samples ENV=<stack> REASON="…" [KIND=<kind>]` SHALL run `scripts/operator.py --stack <stack> alert-samples --reason TEXT [--kind KIND]`, which SHALL call the admin listener's `POST /admin/alert-samples` with the operator token, as every operator write does (contracts/operator-admin.md §1, §6). Agent sessions SHALL reach it on dev-cpu only: the target SHALL carry the `Makefile`'s `OPERATOR_AGENTS` guard, and the bash gate's existing rules, which refuse `make operator-*` and the operator CLI outside dev-cpu, cover the name with no change to `.claude/**`.
- **FR-033**: WHEN the operator asks for samples, THE GATEWAY SHALL hold the reason to §1.2's rule, write one audit row (action `alert_samples`, with the reason, the kinds asked for, and the samples' keys), and answer at once, before delivery, with the samples' keys and the stack's delivery mode, `real` or `standin`. `KIND` SHALL name a kind in the catalogue, or be absent for every entry; any other value SHALL be refused with 400 `invalid_request`. The request SHALL raise no `operator_action` alert, as the test and adapter endpoints raise none (§1.3): the samples, each naming the requester's fingerprint, are its notice.
- **FR-034**: A SAMPLE SHALL be rendered from its entry's fixed sample facts, never from the stack's meters, state, or store, with the stack's own prefix, its own key (FR-035), and the requester's fingerprint, and SHALL go through the same renderers, senders, schedule, and fallbacks as a real alert, so that it shows exactly what a real alert of its entry would.
- **FR-035**: A SAMPLE'S dedupe key SHALL be `<stack>:sample:<entry>:<audit id>`. `sample` SHALL be no real alert kind, and a test SHALL hold the real kinds (the outbox's `CHECK` list, the metric's kind values, and §2's table) against it, so that a sample's key can never equal a real alert's.
- **FR-036**: EVERY form of a sample SHALL say it is a sample: the subject and the plain text's first line SHALL begin with `[SAMPLE]`; Telegram's message SHALL begin with a line naming it a sample, before the severity; and the HTML SHALL begin with a banner naming it a sample, above the severity. Each form SHALL say that nothing happened on the stack, and name the requester's fingerprint.
- **FR-037**: A SAMPLE SHALL never be written to the alert outbox. THE DISPATCHER SHALL hold samples in memory, as it holds the `store_unreachable` alert (§4.4); a restart before delivery SHALL drop them, and the Author sends them again. No count, report, incident draft, reminder, or breach-test assertion that reads the outbox SHALL see a sample, and the metrics SHALL count samples under the kind `sample` alone.
- **FR-038**: A SAMPLE REQUEST SHALL change no state, meter, flag, journal, or real alert. It SHALL work in any runtime state in which the store answers, since its audit row needs the store, and SHALL answer 503 `store_unreachable` otherwise, as every write does.
- **FR-039**: SAMPLES SHALL never delay a real alert: a real alert that falls due while samples are pending SHALL be attempted before the next sample. Samples SHALL go one at a time on each channel, at most one a second to the Telegram chat (the Bot API's FAQ advises about one message a second to one chat, which the plan confirms), and a request SHALL be refused with 409 `samples_in_flight` while an earlier request's samples are pending.
- **FR-040**: SAMPLES SHALL go where the stack's alerts go. [NEEDS CLARIFICATION: Q4; recommended: on prod, the Author's real channels; on dev and dev-cpu, the stand-ins in stand-in mode, and the real channels only during dev's recorded real-delivery run.]
- **FR-041**: THE TELEGRAM STAND-IN SHALL accept `entities`, check them as FR-009 and FR-010 define them, refuse an invalid list with a 400 in the Bot API's error shape, keep a message's entities with its text in `GET /messages`, count a text's length in UTF-16 code units against 4,096, and keep refusing `parse_mode`, so that dev-cpu's samples and tests exercise the designed path end to end.

**What never appears**

- **FR-042**: contracts/alerts.md §5 SHALL hold unchanged for every form and every sample: no payload, client identifier, secret, operator reason, or provider or channel response body in the plain text, the Telegram text or its entities, the subject, the HTML, the facts, the delivery columns, or the logs, metrics, and spans about delivery.
- **FR-043**: §5's canary test SHALL extend to every form. It SHALL render every entry, every further case of FR-005, and every sample while canaries sit in the ledger's client label, the hello message, the operator's reason, and a token, and assert that no canary appears in any form, in the serialized entities, or in the facts, and that no run of nine or more hex digits does (only the 8-hex fingerprint). It SHALL also put characters that need escaping into each field that can hold text (the prefix, an adapter's ID and label) and assert that the HTML escapes them and that the Telegram text carries them as themselves, with every entity still on its intended text.

**Telemetry, the dashboard, and the runbook**

- **FR-044**: EACH delivery attempt SHALL record the form it sent, `designed` or `plain`, and a fallback's reason: in the outbox row's columns for its channel, where the alert has a row, in the `alert.delivered`, `alert.retry`, and `alert.failed` log records, and as `h4.alert.form` on `h4.alerts`. A span, `alert.deliver`, SHALL record each attempt with its channel, its kind, its form, a fallback's reason, its outcome, and whether it is a sample, and never a text, a URL, a token, a chat ID, an address, or a response body.
- **FR-045**: THE GATEWAY SHALL count each fallback on a new counter, `h4.alert.fallbacks` (`h4.channel`; `h4.alert.kind`; `h4.alert.fallback_reason`: `entities_refused`, `message_refused`, `render_failed`, `over_limit`, or `not_rendered`), and log it as `alert.fallback` (warn, with the dedupe key, the channel, the attempt, the reason, and the error class). A fallback SHALL raise no alert of its own, as a failed delivery raises none (§2's notes).
- **FR-046**: THE DASHBOARD'S audit-and-alerts row SHALL gain "Alerts sent as plain text by fallback", by channel and reason, beside "Alerts by channel and outcome", which SHALL show the form too; and `docs/runbooks/alert-channel-down.md`, the alert panel's runbook (§6), SHALL say what each reason means and what to do about it (Principle II).
- **FR-047**: THE SAMPLE REQUEST'S server span, `POST /admin/alert-samples`, SHALL carry `h4.action: alert_samples` and its outcome, and `h4.operator.actions` SHALL count the request under `alert_samples`.

**The Anthropic API**

- **FR-048**: WHILE prod's route names the Anthropic API (spec 010), THE ALERTS SHALL keep working in every form: the adapter month's warning and exhaustion (spec 010, FR-023) and `fallback_unavailable` naming "the Anthropic API" (spec 010, FR-037) SHALL render in all three forms and be delivered as every alert is, and the alert tests SHALL run with prod's route naming `bedrock` and naming `anthropic`.

**The contracts, the ADR, the disclosure, and the local stack**

- **FR-049**: THIS SPEC'S changes to spec 000 SHALL be made by name (Amendments). Its contracts and data model, which are living interfaces, SHALL carry each changed passage marked "(spec 011)": alerts.md §2, §3, §4, §5's enforcement, and §6; data-model.md §2.6 and §2.7; operator-admin.md §1.3, a new write's section, and §6; telemetry.md's spans, §4.1, its log records, and §7.5; and config-files.md §4.
- **FR-050**: A NEW ADR, proposed, at the next free number, SHALL record the decision, extending ADR 0005's Decision "Telegram through the Bot API (plain text), and email through SMTP with TLS (nodemailer)": Telegram through message entities, never `parse_mode`; email as `multipart/alternative`, with hand-written table HTML and no new package, in the Author's words "Hand-written tables (Recommended)"; the plain text kept as each channel's fallback; and the samples.
- **FR-051**: THE DATA-FLOW DISCLOSURE'S rows A1 and A2 SHALL describe the designed forms, the fallbacks, and the samples, and rows S12 and S13 what the stand-ins now receive and keep, in the change that sends the first designed form (Data-Flow Disclosure Entries). No row SHALL be added: no destination and no kind of data is new, and nothing leaves a visitor's device.
- **FR-052**: THE CHANGE SHALL add no package to the gateway or its tests (the Author's answer: "No new package"): the renderer is the gateway's own code, nodemailer, already pinned, carries the HTML part, and the tests' HTML check needs no parser package.
- **FR-053**: WHEN the operator runs `make up` on any stack, IT SHALL start as before. The change SHALL need no new env key, secret, service, port, or network, and dev's and dev-cpu's breach test SHALL pass with its stand-in assertions unchanged.

### Key Entities

- **Alert facts**: the typed context and spec every form renders from (contracts/alerts.md §5): numbers, states, times, the dedupe key, the fingerprint, and an adapter's ID and label.
- **Plain form**: §3's text, unchanged: the email's text part and each channel's fallback.
- **Designed Telegram message**: a text with entities of four types, whose offsets and lengths count UTF-16 code units.
- **Designed email**: one `multipart/alternative` message: the plain form, and an HTML part that loads nothing.
- **Severity**: trip or exhaustion, warning, operator action, or information; each with a name, an emoji, and a light and a dark colour.
- **Fallback**: an attempt that sent the plain form in place of the designed one, with its reason: `entities_refused`, `message_refused`, `render_failed`, `over_limit`, or `not_rendered`.
- **Catalogue entry**: one kind or variant, with its fixed sample facts and its three golden files.
- **Sample**: an entry sent through the channels on the operator's request: marked in every form, keyed `<stack>:sample:…`, held in memory, never in the outbox.
- **Form switch**: `config/alerts.yaml`'s optional `formats`, the Author's.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 19 catalogue entries render in three forms that match their committed golden files; the plain text equals today's §3 text byte for byte (and the subject equals today's, unless Q1 changes it), so the existing cases of `test/unit/alerts.test.ts` pass unchanged.
- **SC-002**: Across every entry, further case, and sample, 0 entities are out of range, split a surrogate pair, overlap another, have no length, or are of a type outside the four; on dev-cpu, the Telegram stand-in accepts 100% of the designed messages, and the breach test finds 100% of its alerts as before.
- **SC-003**: Across every form of every entry, further case, and sample: 0 canaries, 0 token shapes, 0 runs of nine or more hex digits, 0 URLs, 0 HTML elements or attributes outside the allowlist, and 0 unescaped values.
- **SC-004**: In the fallback tests, 100% of alerts whose designed form is refused, can't be rendered, fails its check, or passes its bound arrive in their plain form; a refusal's plain send starts in the same attempt, with no scheduled wait; 0 alerts are lost; and each fallback is recorded with its reason in the row, the log record, the counter, and the span.
- **SC-005**: In the integration tests, 100% of crossings committed while the renderer is made to fail keep their state change and their outbox row with the plain text.
- **SC-006**: On dev-cpu, one sample request delivers 100% of the catalogue to both stand-ins in the designed forms, each marked as a sample in every form; afterwards the outbox holds 0 sample rows, the state, the meters, and the journal are unchanged, and the audit log holds exactly 1 new row.
- **SC-007**: In the dispatcher's tests on a test clock, 100% of real alerts that fall due while samples are pending are attempted before the next sample.
- **SC-008**: At their longest facts, 100% of the forms of every entry stay within the bounds Q3 settles.
- **SC-009**: In both palettes, 100% of the pairs of text and background contrast at 4.5:1 or more.
- **SC-010**: The Author reads every sample where Q4 settles, on his phone's Telegram and in his phone's and his desktop's mail clients, in light and dark themes, and records in the branch's note, for each entry, whether its severity, headline, and next step read within a second (the intent's "clear within a second"), naming those that don't.
- **SC-011**: With prod's route naming `anthropic` (spec 010's test configuration), 100% of the adapter's alerts (the month's warning, the month's exhaustion, and `fallback_unavailable`) render in three forms and are delivered to the stand-ins; with `bedrock`, the same for Bedrock's.
- **SC-012**: `make up ENV=dev-cpu` starts, the breach test passes on dev-cpu with its stand-in assertions unchanged, and the change's measured cloud cost is $0.

## Amendments to Spec 000, and to ADR 0005

As specs 007 and 010 do, the amended text stays as it is; each amendment supersedes the clause it names from this spec's approval. Spec 000's contracts and data model are living interfaces: their passages change in the implementation branch, each marked "(spec 011)" (FR-049). Clauses were read at a5eb05b8, with spec 010's alert passages read on its branch.

**Spec 000 (local foundations)**

| ID | Clause | Change | Why |
|---|---|---|---|
| 0-1 | contracts/alerts.md §3: "Plain text, UTF-8, at most 1,000 characters"; "**Telegram** gets the whole text. **Email** gets line 1 as its subject and the whole text as its body." | Every alert in three forms from the same facts: the plain text, unchanged, as the email's text part and each channel's fallback; Telegram's designed message; the email's HTML part. FR-003's order, the severity and its marks (Q2), the subject (Q1), each form's bound (Q3), and a sample's marks | FR-001 to FR-007, FR-016, FR-023, FR-036 |
| 0-2 | contracts/alerts.md §4.1's channel table: Telegram's "JSON `{chat_id, text, disable_web_page_preview: true}`, with no `parse_mode` (plain text)"; email's "`text/plain` only" | Telegram: `text` and `entities`, never `parse_mode`, and the plain text again at once on a 400; email: `multipart/alternative`, and text only at once on a refusal of the message or a failed render; one lease over both sends | FR-008 to FR-015, FR-025 to FR-029 |
| 0-3 | contracts/alerts.md §4.4 (outcomes) | Each attempt's form and a fallback's reason, in the row, the log, and the metric; samples held in memory beside `store_unreachable`, never before a real alert | FR-037, FR-039, FR-044, FR-045 |
| 0-4 | contracts/alerts.md §2 (kinds and dedupe keys) and its notes | A sample's key, `<stack>:sample:<entry>:<audit id>`, never a real kind's; a fallback raises no alert, as a failed delivery raises none | FR-035, FR-045 |
| 0-5 | contracts/alerts.md §5, "How this is enforced" | The canary test over every form, every sample, and the serialized entities, and the escaping check; what never appears is unchanged | FR-042, FR-043 |
| 0-6 | contracts/alerts.md §6: "failed deliveries (the alert panel)" → `alert-channel-down.md` | And fallbacks to plain text, on the same row's panel | FR-046 |
| 0-7 | data-model.md §2.6 (the audit log's actions) and §2.7 (`alert_outbox`) | The action `alert_samples`; each channel's form and fallback reason; what the designed forms are rendered from, as the plan chooses within FR-025 and FR-030 | FR-030, FR-033, FR-044 |
| 0-8 | contracts/operator-admin.md §1.3 (what each write produces), §2 (a new write), §6 and §6.1 (the CLI and its make targets) | `POST /admin/alert-samples`: its body, its answer, its refusals (400, 409 `samples_in_flight`, 503), one audit row, no journal record, no confirmation alert; the CLI's `alert-samples` and `make operator-alert-samples` | FR-032, FR-033, FR-038, FR-039 |
| 0-9 | contracts/telemetry.md §3.2 (the spans), §4.1 (`h4.alerts`, `h4.operator.actions`), its log records, and §7.5 (the audit-and-alerts panels) | The `alert.deliver` span; `h4.alert.form`; the kind `sample`; the counter `h4.alert.fallbacks`; the record `alert.fallback`; the action `alert_samples`; the fallback panel, and the form in the outcomes table | FR-044 to FR-047 |
| 0-10 | contracts/config-files.md §4 (`config/alerts.yaml`) | The optional `formats` map | FR-031 |

**ADR 0005** (Telegram primary / email secondary alerting; no SNS SMS), proposed: its Decision's "Telegram through the Bot API (plain text), and email through SMTP with TLS (nodemailer)" is extended, not replaced, by a new ADR, proposed, at the next free number (0041 is spec 010's, on its branch): "Alerts designed to be read: Telegram's message entities and a hand-written HTML email, each with its plain text as the fallback". ADR 0005's own text stays, and its index row gains "(one Decision extended by 00NN)".

**Spec 010** is not amended: its alert texts (FR-023, FR-037) render in these designs (FR-004, FR-048). **Spec 003** is not amended: its studio GPU window's alerts are catalogue entries 11 and 12.

## Assumptions

**Scope**

- **In:** the renderer's two designed forms, with the plain text kept; the Telegram and email channels' sending and fallbacks; the outbox's form columns; the form switch's schema; the samples (the make target, the CLI subcommand, the admin route, and their delivery in memory); the Telegram stand-in's entities; the golden files and the tests; the spans, the metric attribute, the counter, the log record, the panel, and the runbook's section; the contract passages; the ADR; and the disclosure's rows.
- **Out:** what an alert says: its facts, sentences, headlines, kinds, triggers, real dedupe keys, and runbooks (spec 010's additions are spec 010's); the channels, destinations, retry schedule, receivers, and prefixes; a new channel; MJML or any new package; images, links, or remote content in any form; local times, or another language; Telegram's `parse_mode`; publishing Mailpit's web interface, unless the Author's answer to Q4 is B; the incident draft's template, which records each alert's delivery as before; and the skill the Author linked, which would live in `.claude/` and is his call.

**Readings**

- **"perhaps html detailing the alert"** reads as an HTML part beside the plain text, not in its place, since some clients show no HTML; the intent read it so, and the Author accepted the intent.
- **"https://core.telegram.org/api/entities"**: that page describes message entities for Telegram's own client API; the Bot API's `MessageEntity` is the same model, with offsets and lengths in UTF-16 code units. His link names the mechanism, so this spec takes it (FR-008) and asks nothing about it. `parse_mode` HTML, the intent's alternative, would need every value escaped. This session didn't open the page; the plan confirms the Bot API's fields and limits against its reference.
- **"Maybe something like this skill could help?"**: the skill writes MJML; his answer chose hand-written tables that follow the patterns MJML produces (Clarifications). The skill wasn't read, and nothing depends on it.
- **"the same facts in a richer form"** (the intent's data-flow reading) is FR-002's rule: the designed forms add no fact and no sentence.
- **Where the designed forms are rendered**, when the alert is queued (and stored with its row) or when it is sent (from the row's facts), is the plan's choice within FR-025 and FR-030. Today's `facts` leave out some values the forms show (the runtime's and the fallback's times, and the prefix), so rendering at send time would extend them.
- **Samples are not alerts.** They report nothing about the stack, so they stay out of every count and record of alerts (FR-037); their delivery outcomes are counted apart, under `sample`, where a failed sample still shows a channel down.
- **Dev's stand-ins are read inside the stack.** Mailpit's web interface and the Telegram stand-in aren't published on any stack (rows S11 and S13), so dev's samples are checked by the tests and the probe, and the golden files are the Author's offline view (FR-005; Q4).
- **The operator command's name** follows the existing operator targets (`make operator-reset`, `make operator-renew`, and the rest) and the CLI's subcommands, so the bash gate's existing pattern for `make operator-*` and its rule for the operator CLI already cover it (FR-032).
- **Dates.** The intent and the Author's answers are dated 2026-11-08, his local date (it was already 2026-11-09 in UTC).

**Dependencies**

- **Spec 010's alert variants** (its FR-023 and FR-037), on `feat/010-anthropic-provider`, which change `src/alerts/format.ts`, the file this spec's renderer grows from. The implementation builds on that branch's tip, or on `main` once it merges; the plan chooses when it starts, from the branches' state then.
- **Spec 003's studio GPU window alerts** (`operator_action`, `studio_window`), on `main`.
- **No Author patch for the default.** `config/alerts.yaml`'s `formats` is optional (FR-031). The Author edits his file only to choose `plain`, and only after the branch that accepts the key merges, since the gateway's strict schema refuses an unknown key until then.
- **The Author's own steps:** his answers to Q1 to Q5, and his reading of the samples (SC-010).

**Deviations** (named, as the constitution's Governance requires: "Deviations require a written justification in the spec and an ADR if permanent.")

- **Inherited: local until publication** (ADR 0013). This spec and its branch are reviewed with a note in `docs/merge-requests/`, not a pull request, and the Author's gate stands in for CI (spec 000, FR-041).
- **None of this spec's own.** ADR 0005's "plain text" is extended by a new ADR (FR-050); ADR 0005 is proposed, so nothing accepted is reversed.

## Expected Cost Impact

- **Cloud: $0.** No model call, service, account, or paid tier is added; the same alerts go to the same two free channels, in the same numbers.
- **Per alert:** Telegram, one request, or two on a refusal; email, one message a few kilobytes larger than today (its HTML part within Q3's bound), or two on a refusal. Telegram is free, and the alerts mailbox is a free account (ADR 0005).
- **Samples:** free. A full catalogue is 19 Telegram messages and 19 emails, which count against the alerts mailbox's daily sending limit, shared with real alerts; the repository doesn't hold that limit, and one request at a time bounds a burst (FR-039).
- **Local:** rendering takes about a millisecond an alert on the gateway's CPU; the gateway's image gains no package (FR-052).
- **Development time:** agent sessions on the Author's existing plan (spec 000, FR-037), with no metered API spend.
- **Measurement:** `h4_alerts_total` by form, and the fallback counter; each golden HTML file's size, recorded in the branch's note beside Q3's bound.

## Degraded-Mode Behavior

Defined before the happy path, as Principle I asks, and built in the foundation.

| What fails or is off | What the Author receives | Added delay | Recorded |
|---|---|---|---|
| Telegram refuses the entities (a 400) | the plain text, at once, in the same attempt | none | fallback `entities_refused` |
| A designed form can't be rendered, or fails its check | the plain form, on that channel | none | fallback `render_failed` |
| A designed form passes its bound | the plain form | none | fallback `over_limit` |
| The mail server refuses the multipart message (a permanent reply to its data) | the text-only email, at once, in the same attempt | none | fallback `message_refused` |
| A row queued before this change | the plain form | none | fallback `not_rendered` |
| The Author sets `formats.<channel>: plain` | the plain form, for every alert | none | form `plain`, no fallback |
| A client that shows no HTML | the text part, today's text | none | — |
| A client that drops styles or forces dark mode | the same facts in reading order; the light palette's contrast holds | none | — |
| A device without an emoji | the words carry the severity and the labels | none | — |
| Telegram or SMTP is down | §4.4, as today, in the form last sent | the schedule's | `retry`, `failed` |
| The store is down | the in-memory `store_unreachable` alert, in the designed forms; a sample request answers 503 | as today | as today |
| Samples are pending when a real alert falls due | the real alert first | none for it | — |
| Any of the above | degradation itself is unaffected: it committed before any delivery (§1) | — | — |

## Telemetry and the Dashboard

- **The spans** (FR-044, FR-047): `alert.deliver` for each delivery attempt, with its channel, kind, form, fallback reason, outcome, and sample flag, and never a text, URL, token, chat ID, address, or response body; and the sample request's server span, `POST /admin/alert-samples`, with `h4.action: alert_samples`. Langfuse, the stack's only trace store, shows an `alert.deliver` span as a trace with no generation.
- **The instruments** (FR-044, FR-045): `h4.alerts` gains `h4.alert.form` and the kind `sample`; the new counter `h4.alert.fallbacks` counts fallbacks by channel, kind, and reason; `h4.operator.actions` gains `alert_samples`.
- **The log records** (FR-044, FR-045): `alert.delivered`, `alert.retry`, and `alert.failed` gain the form and a fallback's reason; `alert.fallback` (warn) is new.
- **The panels** (FR-046): "Alerts sent as plain text by fallback", by channel and reason, in the audit-and-alerts row, beside "Alerts by channel and outcome", which shows the form too.
- **The runbook** (FR-046): `alert-channel-down.md` says what each fallback reason means and what to do. A fallback raises no alert of its own.
- **Never in telemetry:** an alert's text, a URL, a token, a chat ID, an address, or a response body (FR-042).

## Data-Flow Disclosure Entries

For `docs/data-flow-disclosure.md`, in the change that sends the first designed form (FR-051). No row is new: rows A1, A2, S12, and S13 change.

| ID | From → To | Trigger | Carries | Never carries | Why | Default | How to switch it off |
|---|---|---|---|---|---|---|---|
| A1 (changed) | as before | as before, and: each sample the Author sends with `make operator-alert-samples` while the stack is in real mode, where Q4 allows it (spec 011) | as before, and (spec 011): the text laid out in short labelled lines, with an emoji for the alert's kind and one for its severity; beside the text, its message entities, each a type (`bold`, `italic`, `code`, or `pre`), an offset, and a length over that same text; if Telegram refuses the entities, the same alert's plain text, as before, in a second request; a sample's text, from fixed sample facts, marked as a sample, with the requester's fingerprint | as before, and: `parse_mode`; an entity that links, mentions, or hides text; anything the text doesn't hold; a link preview, which every message disables | as before, and: the same facts, laid out so that the severity, the headline, and the next step read at a glance (spec 011); a sample lets the Author see a design before a real alert needs it | as before | as before; and `formats: {telegram: plain}` in `config/alerts.yaml`, the Author's file, sends today's plain text (spec 011, FR-031) |
| A2 (changed) | as before | as A1 | as before, and (spec 011): the message as `multipart/alternative`, with the plain text part, as before, and an HTML part that lays out the same facts in tables with inline styles; a text-only message, if the server refuses the multipart one; a sample's, marked as A1's are | as before, and: anything fetched when the message is opened: no remote image, font, stylesheet, script, or tracking pixel, and no link, so that opening an alert sends nothing anywhere and nothing learns when or where it was read | as A1 | as before | as before; and `formats: {email: plain}` sends `text/plain` only |
| S12 (changed) | as before | as before, and dev's and dev-cpu's samples (spec 011) | as before; it keeps each message's entities with its text, in memory, until it stops, and checks them as the Bot API does | as before | as before | as before | as before |
| S13 (changed) | as before | as before, and dev's and dev-cpu's samples (spec 011) | as before; the messages are now multipart, with their HTML parts, still in the temporary database under its tmpfs `/tmp` | as before | as before | as before | as before |

Not new rows: a golden file opened in the Author's browser loads nothing, so it makes no flow; the stand-ins' checks run inside the stack (S11).

## Constitution Check

Applied with the `constitution-check` skill's eight questions against constitution 1.0.1.

| Principle | Touched | How it complies, or the named deviation |
|---|---|---|
| I. Data-local by default | Yes | No byte leaves a visitor's device. The two alert flows that leave the stack carry the same facts in richer forms, and rows A1 and A2 say so in the change that sends them (FR-051); opening an email loads nothing (FR-019). The degraded mode, each channel's plain text, is defined first and built first (User Story 3; the table above). The whole topology still runs locally with one command (FR-053). No biometrics. |
| II. Production-grade or not shipped | Yes | Tests for every FR, with golden files for every entry (FR-005), the UTF-16 checks (FR-010), the canary test extended (FR-043), and the fallbacks (FR-025 to FR-031); the spans, the form attribute, the counter, the log record, and the panel (FR-044 to FR-047); the runbook's section (FR-046); the cost estimate above and its measurement; an ADR (FR-050). No model-driven behaviour, so no evaluation. |
| III. Intent before spec, spec before code, humans merge | Yes | From the accepted intent, in the Author's words, with his two answers (Clarifications); five questions left to him and marked; spec 000's contracts amended by name, ADR 0005 extended by a new ADR; no code on this branch; the Author merges. |
| IV. Least privilege | Yes | Nothing is widened. The sample command is an operator write behind the token, the `Makefile`'s guard, and the bash gate's existing operator rules (FR-032); `config/alerts.yaml` stays the Author's (FR-031); no new secret, env key, permission, or sandbox domain; `.claude/**` unchanged; the skill he linked isn't added (the intent: "Whether to add it is the Author's call"). |
| V. Cost is a first-class signal | Yes | $0 in the cloud: no model call, service, account, or paid tier (Expected Cost Impact); samples cost nothing and touch no meter (FR-038). |
| VI. Build in public, including failures | Yes | The renderer, the golden files, and the designs are committed; fallbacks are counted on a public panel (FR-046); none of them holds a secret or a private value (FR-042). |
| VII. Own the whole product, and say exactly what you owned | Yes | The product reasoning (the severity first, the plain text kept, samples marked, a design never costing an alert) sits beside the systems reasoning, in the spec and the ADR. |
| VIII. Honest AI | No | No model or twin behaviour changes. |
| Security & Agent Governance | Yes | §5 holds in every form (FR-042, FR-043); every value escaped, or carried as data with no markup (FR-008, FR-017); no new dependency (FR-052); the implementer never reviews (the plan's tasks). |
| Technology Standards, Alerting | Yes | "Telegram bot as primary channel, email as secondary; both free. Automated degradation never depends on an alert being delivered.": the same two channels, and a design never delays or loses an alert (FR-025 to FR-030). |
| Workflow step 7, "A feature without a graph is not done." | Yes | The fallback panel ships with the designs (FR-046). |

## Open Questions for `/speckit-clarify`

All five are pending: the Author's to answer. Each names the FRs its answer changes.

### Question 1: Does the email's subject change, and may it carry an emoji? (FR-016)

Pending.

**Context**: Today the subject is the plain text's first line, the prefix and the headline: `[h4reet.ai prod] KILL SWITCH TRIPPED: daily ceiling reached` (§3; `test/unit/alerts.test.ts` pins that line 1 is the subject). Telegram's message will lead with the severity's emoji and the kind's (FR-007). Any mail filter the Author keeps may key on the prefix. The prefix itself is his, in `config/alerts.yaml`: an emoji he puts there reaches every form, the subject included, whatever the answer.

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | Today's subject, unchanged: the prefix and the headline, with no emoji; a sample's begins with `[SAMPLE] ` | The text part's first line stays the subject; filters and threads keep working; the severity reads in the headline's own first words (WARNING, KILL SWITCH TRIPPED, OPERATOR ACTION); the inbox list shows no colour cue |
| B | The severity's emoji leads: `🔴 [h4reet.ai prod] KILL SWITCH TRIPPED: daily ceiling reached` | A glance cue in the inbox list and the phone's notification; the text part's first line gains it too, or stops being the subject; it renders differently by client and font |
| C | Both emoji, the severity's and the kind's: `🔴 🛑 [h4reet.ai prod] KILL SWITCH TRIPPED: daily ceiling reached` | The strongest cue; as B, twice over |

### Question 2: Which severity is each kind, and which emoji and colours mark them? (FR-006, FR-007, FR-020)

Pending.

**Context**: The brief names four severities: trip and exhaustion, warning, operator action, and information. Nothing in §2 or §3 assigns them, and spec 010 adds two variants. Every emoji must have a fixed UTF-16 length (FR-007), and colour is never the only mark.

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | The four severities as the table below gives them, with a circle for each severity and a symbol for each kind | Severity and kind at a glance; emoji of all three UTF-16 lengths, which the tests pin |
| B | Severity marks only: the four circles, and no emoji for the kind | Calmer; the kind reads in the headline's words alone; fewer emoji to test |
| C | As A, but the reminder takes the severity of the condition it reminds of: trip or exhaustion while degraded, warning while only renewal is pending | A reminder looks as urgent as its cause, every morning, until the Author acts |

Option A's marks:

| Severity | Its name, as shown | Kinds and variants | Emoji | Email colour |
|---|---|---|---|---|
| Trip or exhaustion | Critical | `trip`; `fallback_exhausted` (a grant; spec 010's adapter month); `store_unreachable`, under which every request fails closed | 🔴 | red |
| Warning | Warning | every `warn` (day, month, fallback grant; spec 010's adapter month); `credentials_expiring`; `fallback_unavailable`; `auth_failed` | 🟠 | amber |
| Operator action | Operator action | every `operator_action` (reset, renew, init, the studio window opened and closed) | 🔵 | blue |
| Information | Information | `reminder` | ⚪ | grey |

The kinds' emoji: `warn` 📈, `trip` 🛑, `fallback_exhausted` 💸, `operator_action` 🛠️, `credentials_expiring` 🔑, `fallback_unavailable` 🔌, `auth_failed` 🔐, `store_unreachable` 🗄️, `reminder` ⏰, and a sample's banner 🧪. Their lengths in UTF-16 code units: ⏰ and ⚪ one; 🔴, 🟠, 🔵, 📈, 🛑, 💸, 🔑, 🔌, 🔐, and 🧪 two, a surrogate pair each; 🛠️ and 🗄️ three, with U+FE0F. The colours' exact values are the plan's, held to FR-020's contrast in both palettes.

### Question 3: What replaces §3's "at most 1,000 characters", for each form? (FR-023, FR-024)

Pending.

**Context**: Today's renderer cuts the text at 1,000 UTF-16 code units (`format.ts`). The Bot API documents a limit of 4,096 characters for a message's text, after entities parsing (the plan confirms it against the reference), which the brief gives as 4,096 UTF-16 code units; a bound in UTF-16 code units at or under it is safe either way, since a text never holds more code points than code units. Today's longest texts, the reminder naming both ceilings on a test clock and spec 010's exhaustion, are well under 1,000 units; the designed Telegram message adds emoji, labels, and aligned columns. Webmail clients clip a long HTML message (at about 102 KB in Gmail, as widely reported).

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | The plain text, 1,000 UTF-16 code units, as today; Telegram's designed message, 2,000; the HTML part, 32 KiB. A designed form past its bound is never cut: the plain form goes in its place | Wide margins under every outside limit; a design that grows past its bound shows on the fallback panel as `over_limit`, never as a cut message |
| B | One bound for every text form, 1,000 UTF-16 code units, and 32 KiB for the HTML | One number to remember; the Telegram layout must stay compact, and spec 010's longer texts with dev's marks come close to it |
| C | Telegram's own 4,096 for its message, and no bound of the gateway's own for the HTML | The fewest refusals of the gateway's own; a counting mistake meets Telegram's limit first, and a long HTML part may be clipped |

### Question 4: Where may samples go, and how does the Author look at dev's? (FR-040)

Pending.

**Context**: The intent: "a sample of each kind, marked as a sample, in dev's stand-in mailbox and on his real channels". Prod is the stack whose alerts go to his real channels; dev's go there only during its recorded real-delivery run (§4.3). Mailpit's web interface and the Telegram stand-in aren't published on any stack (rows S11 and S13): only the breach probe reads them, inside the stack. The tests pin every form in committed golden files, which a browser opens offline (FR-005).

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | Wherever the stack's alerts go: on prod, his real channels; on dev and dev-cpu, the stand-ins. The whole catalogue by default, `KIND=` to narrow it, one request at a time. The golden files are his offline view | He sees the real thing on his phone, from prod; samples there cost nothing and touch no state; dev's are checked inside the stack, not viewed |
| B | As A, and Mailpit's web interface published on dev's `127.0.0.1` through edge, as a seventh port | He opens dev's samples in his browser; rows S1 and S13 change, and edge gains a port on dev |
| C | Never on prod: dev and dev-cpu only, with the golden files | Prod's channels carry real alerts alone; he sees a design on his phone only when a real alert fires, or during dev's recorded real-delivery run |

### Question 5: Does the email draw the meters as bars? (FR-021)

Pending.

**Context**: Each meter is a spend against a ceiling or an allowance, with a warning level (§3). The HTML can draw a bar from table cells sized by percentage from the same typed facts: no image, and nothing loaded.

| Option | Answer | Implications |
|---|---|---|
| A (recommended) | Bars in the email: each meter a bar to its ceiling, with a mark at its warning, filled in the severity's colour, the numbers printed beside it; a meter past its ceiling shows full. Telegram shows the numbers in aligned columns | The level reads at a glance; a bar is never the only carrier of a value; a few hundred bytes a meter |
| B | Numbers only, in a table, in both forms | The smallest and plainest; the reader compares the numbers |
| C | Bars in both: cells in the email, and in Telegram's monospace block a bar of block characters (`▓▓▓▓▓▓▓░░░`) | Bars on the phone too; a longer Telegram text; block characters' widths vary by font |
