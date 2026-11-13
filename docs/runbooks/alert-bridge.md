# Runbook: the alert bridge couldn't send

`h4-alert-bridge` is `h4-alerts`' Telegram half: SNS hands it each notice on the topic, and it sends you one message through Telegram's Bot API ([spec 001 contracts/aws-alerts.md §1](../../specs/001-cloud-elevation/contracts/aws-alerts.md#1-the-path)). A notice it couldn't send, after three attempts and Lambda's two retries, goes to its failure queue, `h4-alert-bridge-failed`, kept 14 days (`infra/account/lambdas.tf`). This page covers the alert `alert_bridge_failed` ([§2](../../specs/001-cloud-elevation/contracts/aws-alerts.md#2-the-alerts)), from the alarm `h4-alert-bridge-failed` on that queue (`infra/account/alerts.tf`; tasks.md T159).

## Symptoms

- **SNS's email**, and a Telegram message if the bridge can send this one: `[hareet.ai aws] alert_bridge_failed: a notice the bridge couldn't send is in its failure queue, since <time>`.
- An AWS-side alert reached your mailbox but not Telegram.
- The queue's `ApproximateNumberOfMessagesVisible` is 1 or more in the console (SQS, `h4-alert-bridge-failed`, Monitoring).

## Impact

- One channel of two is down for AWS's alerts. The mailbox still gets SNS's own copy of every notice, so nothing is lost: the alerting standard's second channel holds.
- No visitor sees anything.

## Act

In the console, or your own terminal, with your SSO session.

1. **Read the bridge's log**, `/aws/lambda/h4-alert-bridge`: each run logs its source, the kind, and the outcome, never the message, the token, or the chat. An outcome of `failed` with Telegram's status names the cause.
2. **By cause:**
   - **401 or 404 from Telegram:** the bot's token is wrong or revoked. Make a new one with BotFather and write it to `/h4reet/alerts/TELEGRAM_BOT_TOKEN` (SecureString) by hand; `make secrets-check PROFILE=h4reet-admin` shows it present.
   - **400, chat not found:** `/h4reet/alerts/TELEGRAM_CHAT_ID` names the wrong chat, or the bot left it.
   - **A timeout or a 5xx:** Telegram was down. Nothing to fix.
   - **`ParameterNotFound` or an access error:** a parameter is missing, or the bridge's role changed outside Terraform; the account's next plan shows the drift.
3. **Replay the messages** once the cause is gone: read each one from the queue in the console (SQS, Send and receive messages, Poll), find its alert in SNS's email of the same time, and delete it. The queue's messages are Lambda's records of the failed invocation, which hold the notice; they never leave the account.

## Verify

- The queue's `ApproximateNumberOfMessagesVisible` is 0, and the alarm returns to OK in the console.
- The next AWS-side alert reaches Telegram. To check sooner, publish one line to `h4-alerts` from the console (SNS, Topics, Publish message), `[hareet.ai aws] unrecognized: a test`: the bridge sends it as `unrecognized`.

## Undo

Nothing to undo: deleting a message you've read changes nothing else. A token you replaced can't come back; BotFather revokes the old one.

## Record

In the next merge-request note, or an incident note in `docs/incidents/` if an alert went unread: the time, the cause from the log, the messages replayed, and what you changed. Never the token, the chat's ID, or the account's ID.
