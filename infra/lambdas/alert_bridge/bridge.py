#!/usr/bin/env python3
"""The alert bridge, h4-alert-bridge (spec 001 FR-022; contracts/aws-alerts.md §1 and §2, and September's §2 at
00309c47; research.md R-23; tasks.md T035): h4-alerts' Telegram half. SNS hands it each notice on the topic, and it
sends the Author one plain-text message through the Telegram Bot API:

    [hareet.ai aws] <kind>: <the line's facts>
    - <fact>: <value>
    Runbook: docs/runbooks/<page>

The kinds and their pages are contracts/aws-alerts.md §2's. It knows a notice by its shape:
  - this project's own, already in the format, from the credential audit, the handover's functions, the hosts'
    deployers, and the EventBridge rules' input transformers: its kind must be one §2 lists, and only its fact lines,
    `- <key>: <value>`, pass; a rule's string template arrives as a JSON string, read once as its text;
  - AWS Budgets' threshold notices and its actions' notices, by the budget's name;
  - Cost Anomaly Detection's, CloudWatch's alarms' (the probe's, and from W1 the credential audit's errors and the
    bridge's own failure queue), and EventBridge's events (ACM's expiry, EC2's spot
    warning), as JSON.
Anything else is `unrecognized`, and carries nothing of the notice: the alerts mailbox has SNS's own copy.

It picks the facts it sends, never a whole notice, and takes out of them whatever has a secret's, an account ID's, a
key ID's, an email address's, or a network address's shape. It reads the bot's token and the chat ID from Parameter
Store at each run, and logs neither, nor the message: its log is the source, the kind, and the outcome. sendMessage gets
5 s and 3 attempts, 2 s apart; a message that can't be sent raises, so Lambda retries the run twice and then hands it to
the function's failure destination (infra/account/lambdas.tf).

The standard library, but for Parameter Store, which it reads with the AWS SDK the Lambda's base image carries, as the
credential audit does. The function runs on python3.14, arm64 (research.md R-02); this file holds to 3.12's syntax.
The shapes of Budgets' notices are to confirm against the real ones at the rehearsal (tasks.md T040).
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field

PREFIX = "[hareet.ai aws]"
TELEGRAM = "https://api.telegram.org/bot{token}/sendMessage"
TOKEN_PARAMETER = "/h4reet/alerts/TELEGRAM_BOT_TOKEN"
CHAT_PARAMETER = "/h4reet/alerts/TELEGRAM_CHAT_ID"
ATTEMPTS = 3
GAP_S = 2
TIMEOUT_S = 5
MAX_LINE = 200
MAX_FACTS = 12
MAX_TEXT = 2000

# contracts/aws-alerts.md §2: each kind and its runbook. A reason, where the kind takes one, may have a page of its own.
KINDS: dict[str, str] = {
    "model_budget_warn": "aws-budget.md",
    "model_budget_reached": "aws-budget.md",
    "server_budget_warn": "server-budget.md",
    "server_budget_reached": "server-budget.md",
    "model_action_executed": "aws-budget-action.md",
    "server_action_executed": "server-budget.md",
    "aws_anomaly": "aws-anomaly.md",
    "cert_expiring": "certificate.md",
    "probe_failing": "probe-failing.md",
    "probe_recovered": "probe-failing.md",
    "credential_finding": "credential-audit.md",
    "credential_audit_failed": "credential-audit.md",
    "alert_bridge_failed": "alert-bridge.md",
    "ec2_started": "handover.md",
    "ec2_start_refused": "handover.md",
    "ec2_stopped_laptop_serving": "handover.md",
    "ec2_stopped_paused": "handover.md",
    "ec2_stopped_server_budget": "server-budget.md",
    "ec2_stopped_by_author": "handover.md",
    # Group 9's review A (I3): the laptop's loop's failed stop, published through the Author's stop profile.
    "handover_stop_failed": "handover.md",
    # Group 9 (P-I6; ADR 0048; contracts/handover.md §4, amended): the guard's stop outside the hours, its stop of a
    # second tagged instance, and its own failure.
    "ec2_stopped_outside_hours": "ec2.md",
    "ec2_unrecognised_instance": "ec2.md",
    "ec2_guard_failed": "ec2.md",
    "spot_interruption": "spot-interruption.md",
    "deploy_rolled_back": "deploy.md",
    "deploy_rollback_failed": "deploy.md",
    "deploy_refused": "deploy.md",
    "tunnel_end_interruption": "tunnel-end.md",
    "tunnel_end_back": "tunnel-end.md",
    # Group 6: the tunnel end's backup timer (deploy/hosts/tunnel-end/shared_state.py).
    "shared_state_backup_failed": "shared-state.md",
}
REASONS: dict[str, dict[str, str]] = {
    "ec2_start_refused": {
        "paused": "handover.md",
        # Group 9 (P-I6; ADR 0048): outside EC2's hours.
        "outside_hours": "handover.md",
        "server_budget_stopped": "handover.md",
        "laptop_serving": "handover.md",
        "start_failed": "handover.md",
        "tunnel_end_down": "tunnel-end.md",
    },
}
# The project's budgets, by name, and which kinds they give (infra/bootstrap/budgets.tf, infra/account/killswitch.tf).
BUDGETS: dict[str, tuple[str, bool]] = {
    "h4-model-month": ("model", False),
    "h4-model-day": ("model", False),
    "h4-server-month": ("server", False),
    "h4-rehearsal-model": ("model", True),
    "h4-rehearsal-server": ("server", True),
}
PROBE_ALARM = "h4-probe-failing"
# W1's alarms (tasks.md T159; infra/account/alerts.tf): each has an ALARM action only, so ALARM is its one notice.
ALARMS: dict[str, tuple[str, str]] = {
    "h4-credential-audit-errors": (
        "credential_audit_failed",
        "the weekly credential audit raised",
    ),
    "h4-alert-bridge-failed": (
        "alert_bridge_failed",
        "a notice the bridge couldn't send is in its failure queue",
    ),
}

# What never leaves, in the order they're taken out: each shape, and what stands in for it.
SCRUB = (
    (
        re.compile(
            r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?(-----END [A-Z ]*PRIVATE KEY-----|$)",
            re.DOTALL,
        ),
        "<secret>",
    ),
    (re.compile(r"\b[0-9]{5,15}:[A-Za-z0-9_-]{30,50}\b"), "<secret>"),
    (re.compile(r"sk-ant-[A-Za-z0-9_-]{8,}"), "<secret>"),
    (re.compile(r"h4op_[A-Za-z0-9_-]{8,}"), "<secret>"),
    (re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}"), "<secret>"),
    (re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"), "<key>"),
    (
        re.compile(
            r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}"
        ),
        "<email>",
    ),
    (re.compile(r"(?<![0-9])[0-9]{12}(?![0-9])"), "<account>"),
    (re.compile(r"(?<![0-9.])(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?![0-9.])"), "<address>"),
    (
        re.compile(
            r"(?<![0-9A-Za-z:])(?:[0-9A-Fa-f]{1,4}:){2,7}(?::|[0-9A-Fa-f]{1,4})(?![0-9A-Za-z:])"
        ),
        "<address>",
    ),
)
FACT = re.compile(r"^- ([a-z][a-z0-9_]{0,39}): (.+)$")
OURS = re.compile(r"^\[hareet\.ai aws\] ([a-z0-9_]+)(?: \(([a-z_]+)\))?: (.+)$")


class BridgeError(RuntimeError):
    """A run that couldn't send. Its message never names the token, the chat, the URL, or the notice."""


@dataclass
class Alert:
    source: str
    kind: str
    summary: str
    reason: str | None = None
    facts: list[tuple[str, str]] = field(default_factory=list)


def scrub(text: str) -> str:
    for pattern, stand_in in SCRUB:
        text = pattern.sub(stand_in, text)
    return text


def money(text: str | None) -> str | None:
    m = re.search(r"\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)", text or "")
    if not m:
        return None
    return f"${float(m.group(1).replace(',', '')):.2f}"


def unrecognized(source: str) -> Alert:
    return Alert(
        source,
        "unrecognized",
        "a notice on h4-alerts the bridge doesn't know; the alerts mailbox has its copy",
    )


# ----------------------------------------------------------------------------------------------------------------------
# Knowing a notice by its shape.


def from_ours(text: str) -> Alert | None:
    lines = text.strip().splitlines()
    if not lines or not lines[0].startswith(PREFIX):
        return None
    m = OURS.match(lines[0].strip())
    if not m:
        return unrecognized("h4")
    kind, reason, summary = m.groups()
    if kind not in KINDS or (
        reason is not None and reason not in REASONS.get(kind, {})
    ):
        return unrecognized("h4")
    facts = []
    for line in lines[1:]:
        f = FACT.match(line.strip())
        if f:
            facts.append((f.group(1), f.group(2)))
    return Alert("h4", kind, summary, reason, facts)


def budget_fields(text: str) -> dict[str, str]:
    fields = {}
    for line in text.splitlines():
        key, sep, value = line.partition(":")
        if sep and key.strip() and len(key) <= 40:
            fields.setdefault(key.strip().lower(), value.strip())
    return fields


def from_budgets(text: str) -> Alert | None:
    fields = budget_fields(text)
    name = fields.get("budget name")
    if name is None:
        return None
    if name not in BUDGETS:
        return unrecognized("budgets")
    family, rehearsal = BUDGETS[name]
    extra = [("rehearsal", "yes")] if rehearsal else []
    if any(k.startswith("action ") for k in fields) or re.search(
        r"(?i)budget action|action (?:has been )?executed", text
    ):
        status = fields.get("action status", "executed")
        return Alert(
            "budget_action",
            f"{family}_action_executed",
            f"{name}'s action ran",
            None,
            [
                ("budget", name),
                ("action", fields.get("action type", "the budget's action")),
                ("status", status),
                *extra,
            ],
        )
    limit = money(fields.get("budgeted amount"))
    threshold = money(fields.get("alert threshold"))
    actual = money(fields.get("actual amount") or fields.get("forecasted amount"))
    if None in (limit, threshold, actual):
        return unrecognized("budgets")
    reached = float(threshold[1:]) >= float(limit[1:])  # type: ignore[index]
    kind = f"{family}_budget_{'reached' if reached else 'warn'}"
    return Alert(
        "budgets",
        kind,
        f"{name} at {actual}, past {threshold} of {limit}",
        None,
        [
            ("budget", name),
            ("threshold", threshold),
            ("actual", actual),
            ("limit", limit),
            *extra,
        ],  # type: ignore[list-item]
    )


def from_json(doc: object) -> Alert | None:
    if not isinstance(doc, dict):
        return None
    if "AlarmName" in doc and "NewStateValue" in doc:
        state = doc.get("NewStateValue")
        since = str(doc.get("StateChangeTime", ""))[:19]
        mine = ALARMS.get(str(doc.get("AlarmName")))
        if mine is not None:
            kind, what = mine
            if state != "ALARM":
                return unrecognized("alarm")
            return Alert("alarm", kind, f"{what}, since {since}")
        if doc.get("AlarmName") != PROBE_ALARM:
            return unrecognized("alarm")
        if state == "ALARM":
            return Alert(
                "alarm",
                "probe_failing",
                f"the probe has failed for 5 minutes, since {since}",
            )
        if state == "OK":
            return Alert(
                "alarm", "probe_recovered", f"the probe passes again, since {since}"
            )
        return unrecognized("alarm")
    if "anomalyId" in doc or ("impact" in doc and "anomalyStartDate" in doc):
        impact = doc.get("impact") if isinstance(doc.get("impact"), dict) else {}
        causes = (
            doc.get("rootCauses") if isinstance(doc.get("rootCauses"), list) else []
        )
        service = doc.get("dimensionalValue") or next(
            (
                c.get("service")
                for c in causes
                if isinstance(c, dict) and c.get("service")
            ),
            "an AWS service",
        )
        total = money(str(impact.get("totalImpact", ""))) or "an amount"
        since = str(doc.get("anomalyStartDate", ""))[:10]
        return Alert(
            "anomaly",
            "aws_anomaly",
            f"{service}, impact {total}, since {since}",
            None,
            [("service", str(service))],
        )
    if "detail-type" in doc and "source" in doc:
        detail = doc.get("detail") if isinstance(doc.get("detail"), dict) else {}
        kind = doc.get("detail-type")
        if kind == "ACM Certificate Approaching Expiration":
            name, days = (
                detail.get("CommonName", "a certificate"),
                detail.get("DaysToExpiry", "?"),
            )
            return Alert(
                "events",
                "cert_expiring",
                f"{name} expires in {days} days",
                None,
                [("domain", str(name))],
            )
        if kind == "EC2 Spot Instance Interruption Warning":
            instance = detail.get("instance-id", "an instance")
            return Alert(
                "events",
                "spot_interruption",
                f"AWS takes {instance} back in 2 minutes",
                None,
                [
                    ("instance", str(instance)),
                    ("action", str(detail.get("instance-action", "?"))),
                ],
            )
        return unrecognized("events")
    return None


def classify(message: str, decoded: bool = False) -> Alert:
    text = message or ""
    for reader in (from_ours, from_budgets):
        found = reader(text)
        if found is not None:
            return found
    try:
        doc = json.loads(text)
    except ValueError:
        doc = None
    # An EventBridge rule's input transformer, given a string template, publishes that string's JSON text: its quotes,
    # and its line breaks as \n (infra/prod/handover.tf's rules; group 5's review, I6). Read it once, as the text it
    # encodes; a string inside that string is no shape of ours.
    if isinstance(doc, str) and not decoded:
        return classify(doc, decoded=True)
    return from_json(doc) or unrecognized("unknown")


# ----------------------------------------------------------------------------------------------------------------------
# The message.


def runbook(alert: Alert) -> str | None:
    if alert.kind not in KINDS:
        return None
    return REASONS.get(alert.kind, {}).get(alert.reason or "", KINDS[alert.kind])


def clip(text: str, room: int) -> str:
    text = " ".join(text.split())
    return text if len(text) <= room else text[: room - 1] + "…"


def render(alert: Alert) -> str:
    head = f"{PREFIX} {alert.kind}{f' ({alert.reason})' if alert.reason else ''}: "
    lines = [head + clip(scrub(alert.summary), MAX_LINE - len(head))]
    for key, value in alert.facts[:MAX_FACTS]:
        lead = f"- {key}: "
        lines.append(lead + clip(scrub(value), MAX_LINE - len(lead)))
    page = runbook(alert)
    tail = f"Runbook: docs/runbooks/{page}" if page else None
    while (
        len("\n".join(lines + ([tail] if tail else []))) > MAX_TEXT and len(lines) > 1
    ):
        lines.pop()
    return "\n".join(lines + ([tail] if tail else []))


# ----------------------------------------------------------------------------------------------------------------------
# Telegram, and Parameter Store.


def _urlopen(
    request: urllib.request.Request, timeout: float
):  # the seam the tests replace
    return urllib.request.urlopen(request, timeout=timeout)


def http_post(url: str, body: bytes, timeout: float) -> int:
    """POST JSON; the status. A refusal's status comes back; a network failure raises OSError."""
    request = urllib.request.Request(
        url, data=body, method="POST", headers={"Content-Type": "application/json"}
    )
    try:
        with _urlopen(request, timeout) as response:
            return int(response.status)
    except urllib.error.HTTPError as exc:
        return int(exc.code)


def send(
    token: str,
    chat: str,
    text: str,
    post: Callable[[str, bytes, float], int],
    sleep: Callable[[float], object],
) -> int:
    """Send one message: 3 attempts, 2 s apart, on a network failure, a 5xx, or a 429. The attempts it took."""
    body = json.dumps(
        {"chat_id": chat, "text": text, "link_preview_options": {"is_disabled": True}}
    ).encode()
    url = TELEGRAM.format(token=token)
    why = "no attempt"
    for attempt in range(1, ATTEMPTS + 1):
        if attempt > 1:
            sleep(GAP_S)
        try:
            status = post(url, body, TIMEOUT_S)
        except OSError as exc:
            why = f"telegram unreachable ({exc.__class__.__name__})"
            continue
        except Exception as exc:  # noqa: BLE001 — any other failure's message may hold the token
            # Anything else, http.client's InvalidURL among them, may hold the URL, and the URL holds the token: only
            # the class's name goes on, and another attempt can't mend it (T038's review, I5).
            raise BridgeError(
                f"telegram's request failed ({exc.__class__.__name__})"
            ) from None
        if 200 <= status < 300:
            return attempt
        why = f"telegram answered {status}"
        if status != 429 and status < 500:
            raise BridgeError(why)
    raise BridgeError(f"{why}, after {ATTEMPTS} attempts")


TOKEN_SHAPE = re.compile(r"[0-9]{5,15}:[A-Za-z0-9_-]{30,50}")


def bot_token(value: object, name: str) -> str:
    """The parameter's value, stripped, held to a bot token's shape before any URL is built from it: a control
    character in it would make http.client raise with the URL, the token in it, in its message (T038's review, I5).
    A refusal names the parameter, never the value."""
    token = str(value).strip()
    if not TOKEN_SHAPE.fullmatch(token):
        raise BridgeError(
            f"parameter {name} isn't a bot token's shape: digits, a colon, and URL-safe characters"
        )
    return token


def parameter_names() -> tuple[str, str]:
    return (
        os.environ.get("H4_TELEGRAM_TOKEN_PARAMETER", TOKEN_PARAMETER),
        os.environ.get("H4_TELEGRAM_CHAT_PARAMETER", CHAT_PARAMETER),
    )


class SsmParameters:
    """Parameter Store, through the AWS SDK the Lambda's base image carries; this file imports it only here."""

    def __init__(self) -> None:
        import boto3

        self.client = boto3.client("ssm", region_name="us-east-1")

    def get(self, name: str) -> str:
        from botocore.exceptions import BotoCoreError, ClientError

        try:
            return self.client.get_parameter(Name=name, WithDecryption=True)[
                "Parameter"
            ]["Value"]
        except (ClientError, BotoCoreError, KeyError) as exc:
            raise BridgeError(
                f"parameter {name} can't be read ({exc.__class__.__name__})"
            ) from None


def log(**fields: object) -> None:
    print(json.dumps(fields, sort_keys=False))


def handler(
    event: object,
    context: object,
    parameters: object | None = None,
    post: Callable[[str, bytes, float], int] | None = None,
    sleep: Callable[[float], object] | None = None,
) -> dict:
    """h4-alert-bridge's entry (infra/account/lambdas.tf), for SNS's event."""
    records = (event or {}).get("Records") if isinstance(event, dict) else None
    notices = [
        r["Sns"].get("Message") or ""
        for r in records or []
        if isinstance(r, dict) and isinstance(r.get("Sns"), dict)
    ]
    if not notices:
        return {"sent": 0}
    store = parameters if parameters is not None else SsmParameters()
    token_name, chat_name = parameter_names()
    token = bot_token(store.get(token_name), token_name)  # type: ignore[attr-defined]
    chat = str(store.get(chat_name)).strip()  # type: ignore[attr-defined]
    sent = 0
    for notice in notices:
        alert = classify(notice)
        try:
            attempts = send(
                token, chat, render(alert), post or http_post, sleep or time.sleep
            )
        except BridgeError as exc:
            log(source=alert.source, kind=alert.kind, outcome="failed", why=str(exc))
            raise
        log(source=alert.source, kind=alert.kind, outcome="sent", attempts=attempts)
        sent += 1
    return {"sent": sent}
