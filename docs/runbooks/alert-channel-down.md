# Runbook: an alert channel is down

Telegram or email, or both, can't deliver the gateway's alerts. This page covers failed deliveries, which the dashboard's alert panel shows and which send no alert of their own ([contracts/alerts.md §4.4 and §6](../../specs/000-local-foundations/contracts/alerts.md#44-outcomes-and-when-something-is-down)). Spec 000: FR-032; ADR 0005; the spec's edge case "Alert channel down".

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
   - **`tls`:** the TLS handshake failed. `SMTP_TLS` must be `implicit` with port 465, or `starttls` with 587, and the server's certificate must verify.
   - **`timeout` or `connect`:** the host's network, its DNS, or the provider. Nothing in the stack needs changing; check the host's connection.
   - **dev and dev-cpu,** in stand-in mode, deliver to the stand-ins: `make status ENV=<stack>` shows whether `telegram-standin` and `mailpit` are healthy, and `make up ENV=<stack>` starts them again.
3. **Never** paste the bot token or the mailbox password into a terminal command, a browser's address bar, or a note.

## Verify

- The next alert reads `delivered` on both channels in "Alerts by channel and outcome", and "Alert delivery lag p95" falls back.
- To try the real channels without waiting for prod's next alert, run dev's recorded breach test, which sends dev's alerts through the same bot, chat, and mailbox as prod's: `make breach-test ENV=dev DELIVERY=real` (Heavy; quickstart.md §2.2).

## Undo

Put back any env value you changed, and run `make up ENV=<stack>` again.

## Record

In the next merge-request note, or an incident note in `docs/incidents/` when prod's alerts were lost: the channel, the error class, when it started and ended, the ids of the alerts that failed, and what you changed, by key name, never a value.
