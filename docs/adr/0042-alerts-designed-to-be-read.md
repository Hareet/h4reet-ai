# ADR 0042: Alerts designed to be read: Telegram's message entities and a hand-written HTML email, each with its plain form as the fallback (spec 011)

Status: proposed, 2026-11-08 · Spec: 011 (FR-001 to FR-053; its Clarifications, the Author's seven answers; plan §1, D1 to D16, and its departures) · Extends [ADR 0005](0005-telegram-and-smtp-alerting.md), its Decision "Telegram through the Bot API (plain text), and email through SMTP with TLS (nodemailer)"; replaces nothing · Number: the next free one after spec 010's 0041, on `feat/010-anthropic-provider` at 911df96f, when the branch's task T002 ran

## Context

The Author, on 2026-11-08, as spec 011's intent records his words:

> "We also want to update the alerting message designs. Let's make the email look like a well-designed email page, perhaps html detailing the alert. Let's make the Telegram message cleanly organized, using some emoji's. Maybe something like this skill could help? https://github.com/framix-team/skill-email-html-mjml https://core.telegram.org/api/entities"

> "And we want the alerts working and going on when using the new anthropic api directly"

ADR 0005 decided "Telegram through the Bot API (plain text), and email through SMTP with TLS (nodemailer)". Spec 000's contracts/alerts.md §3 made every alert one plain text of at most 1,000 characters: Telegram got the whole text, and email got line 1 as its subject and the whole text as its body. The text carried every fact, run together, with nothing to say how serious it was before it was read.

The constitution's Alerting standard holds whatever the design: "Telegram bot as primary channel, email as secondary; both free. Automated degradation never depends on an alert being delivered."

## Decision

1. **Three forms from the same typed facts** (FR-001, FR-002): the plain text of §3, byte for byte; Telegram's designed message; and the email's HTML part under a designed subject. The designed forms add no fact or sentence: they arrange the plain text's content, and add only the severity's name and emoji, the kind's emoji, labels, the email's meter bars, and a sample's marks.
2. **Rendered at send time** (plan D1): the dispatcher renders a designed form at each delivery attempt, from the outbox row's facts, which gain the values the forms show (version 2, plan §2.2). The plain text is still rendered with its cause, in the cause's transaction, so no designed render can touch that transaction (FR-025), and a row from before the change goes plain (FR-030).
3. **Telegram through message entities, never `parse_mode`** (FR-008 to FR-014; plan D4): `sendMessage` with `text` and `entities` of four types, `bold`, `italic`, `code`, and `pre`, their offsets and lengths counted in UTF-16 code units as the text is built, and checked before the message is used. No character of any value can be read as markup, so nothing is escaped.
4. **Email as `multipart/alternative`, with hand-written table HTML and no new package** (FR-015 to FR-022; plan D5): the plain text first, then an HTML part that loads nothing, in one column 600 pixels wide at most, light and dark, each meter a bar to its ceiling. The Author's answer, in his words: "Hand-written tables (Recommended)". The option read: "No new package. A small renderer writes the table-and-inline-style HTML that MJML would produce, and tests pin the output for every alert kind."
5. **The designed subject leads with both emoji** (Q1's answer, "Both emoji"): the severity's emoji, a space, the kind's emoji, a space, and the plain text's first line. The email's plain form, its fallback, stays today's message exactly, first-line subject included.
6. **Four severities, each in words and emoji** (Q2's answer, "Circle + kind emoji (Recommended)"): 🔴 Critical, 🟠 Warning, 🔵 Operator action, ⚪ Information; and a symbol for each kind. Every emoji is one code point, or one and U+FE0F, so its UTF-16 length is fixed and pinned by tests.
7. **Bounds that never cut a designed form** (Q3's answer, "1,000 / 2,000 / 32 KiB (Recommended)"): a designed form past its bound gives way to the plain form, recorded as `over_limit`.
8. **The plain form as each channel's fallback** (FR-025 to FR-031; plan D6): a Telegram 400 to a designed message, or a mail server's permanent refusal of the message's data, sends the plain form at once, in the same attempt, under one lease; a render that fails, a form past its bound, or a row with no version 2 facts goes plain too. Each fallback is recorded with its reason, counted, logged, and shown on the dashboard, and raises no alert of its own. Once fallen back, a channel stays plain for that alert. `config/alerts.yaml`'s optional `formats` keeps a channel plain, the Author's switch.
9. **Samples** (FR-032 to FR-041; plan D8; Q4's answer, "Wherever alerts go (Recommended)"): `make operator-alert-samples` sends a marked sample of each of the 19 catalogue entries wherever the stack's alerts go, held in the dispatcher's memory, never in the outbox, and never before a real alert, counted under the kind `sample` alone.
10. **Golden files** (FR-005; plan D13): every catalogue entry and further case has its four forms committed under `services/gateway/test/fixtures/alerts/`, written only by the golden test run with `-u`, and the HTML files are the Author's offline preview.
11. **Bars in the email, numbers in Telegram** (Q5's answer, "Bars in the email (Recommended)").

## Alternatives considered

- **MJML compiled at build time**, the Author's other option and the skill his link names: a new package and a build step for output the renderer writes by hand.
- **`parse_mode` HTML for Telegram**: every value would need escaping, and an escaping bug becomes a refused or mangled alert; entities carry values as data.
- **Rendering the designed forms at queue time**, stored in new columns: a render inside every cause's transaction, behind a try at four call sites; rows of up to about 40 KB; and a renderer fix that can't reach queued rows (plan D1).
- **Samples as outbox rows of a kind `sample`**: a change to `kind`, and rows every reader of the outbox would have to filter (plan D8).
- **One bound for every text form, or Telegram's own 4,096**: the Author's options B and C of Q3.

## Consequences

- **Cost: $0.** The same two free channels, in the same numbers; one more Telegram request or SMTP session only on a refusal; a full sample request is 19 messages and 19 emails, which count against the alerts mailbox's daily sending limit.
- **The plain form keeps working**: it is the email's text part and each channel's fallback, unchanged since spec 000, so a design can delay an attempt by at most one more send, inside the lease and the 300 s window, and never delays degradation.
- **A design change regenerates the golden files** with `-u`, in the change that makes it, and the diff is reviewed.
- **Telegram's acceptance of each entity list** is checked twice before the Author's phone: by the renderer's own check and by the stand-in's Python rules on every dev-cpu run. Facts about the Bot API this branch couldn't read from its sandbox are confirmed by the Author's first prod samples (spec 011's T053).
- **ADR 0005's own text stays**; its index row notes the extension.
