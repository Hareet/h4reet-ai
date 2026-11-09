# Runbook: an alert channel is down

Telegram or email, or both, can't deliver the gateway's alerts, or they arrive as plain text where their designed form was refused or couldn't be rendered (below). This page covers failed deliveries, which the dashboard's alert panel shows and which send no alert of their own ([contracts/alerts.md §4.4 and §6](../../specs/000-local-foundations/contracts/alerts.md#44-outcomes-and-when-something-is-down)). Spec 000: FR-032; ADR 0005; the spec's edge case "Alert channel down".

## Symptoms

- **The dashboard** (`http://localhost:<x002>/d/h4-runtime`): "Alerts by channel and outcome" shows `failed`, or a run of `retry`, for `telegram` or `email`; "Alert delivery lag p95" climbs toward 300 s; "Alert log" shows `alert.retry` and `alert.failed` events.
- **`make operator-status ENV=<stack>`** adds a line: alerts pending, and failed in the last 24 hours.
- **An alert arrived on one channel and not the other.**
- **On dev and dev-cpu,** the breach test's delivery assertions miss.

## Impact

- Enforcement is unaffected: a trip or an exhaustion is committed before any delivery is attempted (FR-033), and the other channel carries on alone.
- Each channel tries an alert at 0, 5, 20, 50, 110, and 230 s after it was committed, then gives up at 300 s and marks it failed. With both channels down, nobody hears of a trip until the 09:00 UTC reminder, which tries again each day while the stack is degraded or awaiting renewal.

## Act

In your own terminal.

1. **Find the channel and the error class.** Each failed attempt logs one, never a URL or a response body (the Telegram URL holds the bot token, [contracts/alerts.md §4.1](../../specs/000-local-foundations/contracts/alerts.md#41-the-dispatcher)):

   ```bash
   make logs ENV=<stack> SERVICE=gateway TAIL=2000
   ```

   Look for the `alert.failed` and `alert.retry` lines: each names the alert's id, the channel, the attempt, and the error class.
2. **By the class:**
   - **`telegram_401`, or `http_401` from Telegram:** the bot token is wrong or revoked. Put the current one in `TELEGRAM_BOT_TOKEN` in `~/.config/h4reet-ai/env/<stack>.env`, in an editor, never on a command line, where the shell's history would keep it. Then `make up ENV=<stack>`, which recreates the gateway with it.
   - **`telegram_400`:** usually the chat. Check `TELEGRAM_CHAT_ID` the way quickstart.md §0.7 reads it, without the token in anything you type.
   - **`telegram_429` or `http_429`:** Telegram is limiting the bot. The retries carry on within the 300 s window.
   - **`smtp_535`, or another `smtp_5xx`:** the mailbox refused the login or the message. Check `SMTP_USER` and `SMTP_PASSWORD` (the mailbox's app password), then `make up ENV=<stack>`.
   - **`tls`:** the TLS handshake failed, on 465 or after STARTTLS: the server's certificate didn't verify or doesn't name `SMTP_HOST`, the server doesn't speak TLS where `SMTP_TLS` says it does, or the connection dropped once the server had begun its handshake. A connection dropped before the server sent anything is `smtp_ESOCKET`, as a reset is: the network's or the provider's, and the retries carry on. `SMTP_TLS` must be `implicit` with port 465, or `starttls` with 587, and the server's certificate must verify. A server that refuses STARTTLS gives its own reply code instead, such as `smtp_454`.
   - **`timeout` or `connect`:** the host's network, its DNS, or the provider. Nothing in the stack needs changing; check the host's connection. One exception, on email: `connect` also follows an `SMTP_HOST` that resolved only through resolv.conf's search domains. The channel asks for the name as given (tasks.md T189), so give the host's full name.
   - **dev and dev-cpu,** in stand-in mode, deliver to the stand-ins: `make status ENV=<stack>` shows whether `telegram-standin` and `mailpit` are healthy, and `make up ENV=<stack>` starts them again.
3. **Never** paste the bot token or the mailbox password into a terminal command, a browser's address bar, or a note.

## Verify

- The next alert reads `delivered` on both channels in "Alerts by channel and outcome", and "Alert delivery lag p95" falls back.
- To try the real channels without waiting for prod's next alert, run dev's recorded breach test, which sends dev's alerts through the same bot, chat, and mailbox as prod's: `make breach-test ENV=dev DELIVERY=real` (Heavy; quickstart.md §2.2).

## Undo

Put back any env value you changed, and run `make up ENV=<stack>` again.

## Alerts arrive as plain text

Spec 011 (FR-046; its plan §9.5): an alert's designed form, Telegram's message with its entities or the email's HTML part, gave way to its plain form, today's text, and the alert arrived ([contracts/alerts.md §4.1](../../specs/000-local-foundations/contracts/alerts.md#41-the-dispatcher)).

- **Symptom.** The dashboard's "Alerts sent as plain text by fallback" counts, by channel, kind, and reason; "Alert log" shows `alert.fallback` events; an alert on your phone or in your mailbox reads as one block of text, with no emoji, bold, or HTML.
- **Impact.** None on delivery: the plain form went in the same attempt, with no added wait, and a fallback raises no alert of its own. That alert stays plain on that channel for its remaining attempts.
- **Act, by reason** (the `reason` of each `alert.fallback` record, with its `kind` and `dedupe_key`; `make logs ENV=<stack> SERVICE=gateway TAIL=2000`):
  - `entities_refused`: Telegram answered the designed message with a 400 (`error_class` `http_400` or `telegram_400`). Read which kinds it refused, and the Bot API's changelog. To stop the doubled request until a fix lands, set `formats: {telegram: plain}` in `config/alerts.yaml` and run `make up ENV=<stack>`; then open an intent with the kinds and the keys.
  - `message_refused`: the mail server refused the multipart message itself, a 5xx to its data (`error_class` `smtp_5xx`). The same, with `formats: {email: plain}`.
  - `render_failed` or `over_limit`: a design bug: the renderer threw, failed its own check, or passed its bound. Open an intent with the kind and the key; the golden files under `services/gateway/test/fixtures/alerts/` show what each design should be.
  - `not_rendered`: expected for rows queued in the 300 s before a deploy that brought the designs, which hold facts from before them. After that, a decoding bug: open an intent with the kind and the key.
- **Verify a fix.** Send the samples on dev-cpu, then on prod (`make operator-alert-samples` with that stack's `ENV` and a `REASON`), and read them: each arrives designed, and the panel stays at zero.
- **Undo the switch.** Remove `formats` from `config/alerts.yaml`, and run `make up ENV=<stack>`.

## Record

In the next merge-request note, or an incident note in `docs/incidents/` when prod's alerts were lost: the channel, the error class, when it started and ended, the ids of the alerts that failed, and what you changed, by key name, never a value.
