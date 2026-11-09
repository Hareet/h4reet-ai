# Intent: Alerts designed to be read: an HTML email and an organized Telegram message
Author: the Author (drafted by Claude from the Author's words of 2026-11-08). Status: accepted (2026-11-08). Created: 2026-11-08.

Accepted in the session, by the Author's answers to two questions (2026-11-08):
- "Intent 011, the alert redesign (an HTML email and an organized Telegram message with emoji): shall I move it into specs/011 and have a spec written now?" → "Accept and specify (Recommended)".
- "How should the HTML alert email be built: hand-written email tables with no new dependency, or MJML compiled at build time?" → "Hand-written tables (Recommended)". The option read: "No new package. A small renderer writes the table-and-inline-style HTML that MJML would produce, and tests pin the output for every alert kind." This answers open question 1.

## The Author's words

> "We also want to update the alerting message designs. Let's make the email look like a well-designed email page, perhaps html detailing the alert. Let's make the Telegram message cleanly organized, using some emoji's. Maybe something like this skill could help? https://github.com/framix-team/skill-email-html-mjml https://core.telegram.org/api/entities"
>
> "And we want the alerts working and going on when using the new anthropic api directly"

## Problem

Every alert today is one block of plain text, at most 1,000 characters, in the shape spec 000's contract fixes (`specs/000-local-foundations/contracts/alerts.md` §3): a headline line, a meters line, a state line, a fixed sentence for some kinds, and a runbook path. Telegram receives it with no formatting at all: `sendMessage` with no `parse_mode` (`services/gateway/src/alerts/telegram.ts`). Email receives it as `text/plain`, with the first line as the subject (`src/alerts/smtp.ts`).

Claude's reading, not the Author's words: on a phone, the meters, the states, the time, the alert's ID, and the runbook run together in long lines joined by middle dots. The thing to act on is hard to find at a glance, and nothing shows how serious an alert is.

## Proposed outcome

- **Email:** in the Author's words, "a well-designed email page, perhaps html detailing the alert."
- **Telegram:** in the Author's words, "cleanly organized, using some emoji's."
- **The Anthropic API:** in the Author's words, "the alerts working and going on when using the new anthropic api directly."

Claude's reading of what better looks like, for the Author to correct:

- An alert's severity, its headline, and what to do next are clear within a second, on a phone and in a mail client, in light and dark themes.
- The email's HTML version details the alert: the meters against their ceilings, the runtime and fallback states, the time, the alert's ID, and the runbook. The plain-text version stays alongside it for clients that don't show HTML.
- The Telegram message groups the same facts into short labelled lines. An emoji marks each alert's kind and severity, and bold and monospace come from Telegram's message entities.
- Every alert kind gets the new design, including spec 010's: the Anthropic API's monthly warning and exhaustion, and `fallback_unavailable` naming the Anthropic API.
- Alerts keep working when prod's paid fallback is the Anthropic API rather than Bedrock. Its spend counts against the ceilings and its own cap, and its failures raise the same alerts.
- The Author can see each design before it matters: a sample of each kind, marked as a sample, in dev's stand-in mailbox and on his real channels.

## Affected users and systems

- The Author, the alerts' only reader, on Telegram (the primary channel) and email (the secondary).
- `services/gateway/src/alerts/`: the formatter, the two channel senders, the outbox's rows, and their tests.
- Spec 000's `contracts/alerts.md`: this changes §3 (the message format) and §4 (the channels), and keeps §5 (what never appears).
- Dev's stand-ins (§4.3): the in-network Mailpit and the Telegram stand-in, where the designs can be previewed.
- Spec 010, which adds the Anthropic API's alert kinds and is being built now. This work builds on it or comes after it.
- The runbooks the alerts name (§6).

## Constraints

- **What never appears stays the same** (§5; FR-032). The designs render from the same typed facts, with no field that a payload, a client label, the operator's reason, or a secret could arrive through. Every value is escaped for the format it goes into.
- **Nothing remote in the email.** No images, fonts, stylesheets, or tracking are fetched when it opens, so reading an alert makes no request anywhere.
- **An alert is never lost to its design** (the constitution's Alerting standard). If a channel refuses the formatted message, the plain text still goes out. Degradation still never waits on delivery (§1).
- **The same two free channels and destinations.** No new service, account, or paid tier.
- **Dependencies follow the project's rules:** pinning, the seven-day rule, and the licence and audit checks. MJML, which the Author's link uses, would add a build-time dependency tree. Whether that's worth it is an open question.
- **The skill the Author linked.** Skills live in `.claude/`, which only the Author changes, and this session's sandbox can't reach github.com, so it hasn't read the skill. Whether to add it is the Author's call; the spec won't depend on it.
- **Constitution:** production-grade (tests for every kind, the delivery outcomes and telemetry kept, degraded behavior), privacy, and cost.

## Expected cost impact

Cloud: none. The same alerts go to the same two free channels in the same numbers; an HTML email is a few kilobytes larger. Dev-time model spend: one spec and its implementation, in agent sessions on the Author's existing plan, with no metered API spend. Samples on the real channels cost nothing.

## Data-flow impact

No new destination and no new kind of data, and nothing leaves the visitor's device. The existing alert flows carry the same facts in a richer form: an HTML part beside the plain text in the email to the Author's SMTP provider, and message entities beside the text sent to Telegram's Bot API. Because the email loads nothing remote, opening it sends nothing anywhere. `docs/data-flow-disclosure.md`'s alert rows may need their payload described again; the spec decides.

## Open questions

1. MJML compiled at build time, a new dependency, or hand-written table HTML that follows the patterns MJML produces, with no dependency?
2. Telegram's formatting through message entities, as the Author's link describes, or through `parse_mode` HTML? Entities need no escaping, but their offsets count UTF-16 units, which emoji make matter. HTML needs escaping.
3. The 1,000-character limit (§3): does it stay for the plain text, and what limits apply to the HTML and to the Telegram message?
4. Which emoji and colours mark each kind and severity, and does the email's subject line carry an emoji?
5. How does the Author preview and approve the designs? For example, sample alerts of every kind, marked as samples, on dev's Mailpit and on his real channels. And what makes a sample impossible to mistake for a real alert?
6. Order with spec 010: build on its tip, or after it merges?
7. Should the email show anything beyond today's facts, such as the meters drawn as bars, still from typed facts only?
