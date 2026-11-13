"""Tests for the alert bridge, infra/lambdas/alert_bridge/bridge.py (spec 001 tasks.md T031; FR-022; contracts/aws-alerts.md
§1 and §2, and September's §2 at 00309c47; research.md R-23).

h4-alert-bridge is h4-alerts' Telegram half: SNS hands it each notice on the topic, and it sends one plain-text
message to the Telegram Bot API, in the contract's format, `[hareet.ai aws] <kind>: <facts>`, one line, then facts,
then the kind's runbook. What these hold it to:

  - every kind in contracts/aws-alerts.md §2 gives its message and names its runbook, read from the contract's table:
    those AWS's own services send (Budgets, Cost Anomaly Detection, CloudWatch's alarms, EventBridge's events), which
    the bridge recognizes by their shape, and those this project's functions and hosts publish already in the format,
    `ec2_stopped_server_budget`, `tunnel_end_interruption`, and `tunnel_end_back` among them;
  - a notice it doesn't know forwards no content, only that one came;
  - no secret, account ID, key ID, payload, or client identifier ever reaches Telegram or the log: the bridge sends the
    facts it picks, never a whole notice, and takes out what has their shapes;
  - it reads the bot's token and the chat ID from Parameter Store at each run, and logs neither;
  - sendMessage gets 5 s and 3 attempts, 2 s apart; a run whose message can't be sent raises, so Lambda retries it
    twice and then hands it to the function's failure destination (infra/account/lambdas.tf; test_account.py checks
    those settings).

The shapes of Budgets' and the budget actions' notices are as AWS's documentation and September's research give them,
to confirm against the real ones at the rehearsal (tasks.md T040). Test values are built at run time, never literals.
"""

from __future__ import annotations

import importlib.util
import io
import json
import re
import sys
import urllib.error
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
CONTRACT = REPO / "specs" / "001-cloud-elevation" / "contracts" / "aws-alerts.md"
spec = importlib.util.spec_from_file_location("h4_alert_bridge", HERE / "bridge.py")
assert spec is not None and spec.loader is not None
bridge = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = bridge
spec.loader.exec_module(bridge)

# Values of the shapes that must never get through, built at run time.
ACCOUNT = "".join(str(i % 10) for i in range(3, 15))
KEY_ID = "AKIA" + "Q" * 16
TOKEN = "".join(str(i % 10) for i in range(9)) + ":" + "Ab" * 17 + "c"
CHAT = "-100" + "".join(str(i % 10) for i in range(4, 14))
EMAIL = "alerts" + "@" + "example.org"
ADDRESS = "203.0.113.77"  # documentation ranges (RFC 5737, RFC 3849)
ADDRESS6 = "2001:db8:0:0:0:0:0:7"
PAYLOAD = "visitor-words-" + "".join(chr(107 + i) for i in range(6))
TOPIC = f"arn:aws:sns:us-east-1:{ACCOUNT}:h4-alerts"


def sns(message: str, subject: str | None = None) -> dict:
    return {
        "Records": [
            {
                "EventSource": "aws:sns",
                "Sns": {
                    "Type": "Notification",
                    "TopicArn": TOPIC,
                    "Subject": subject,
                    "Message": message,
                },
            }
        ]
    }


# ----------------------------------------------------------------------------------------------------------------------
# What AWS sends, by source.


def budget_notice(name: str, limit: str, threshold: str, actual: str) -> str:
    return (
        "AWS Budget Notification November 10, 2026\n"
        f"AWS Account {ACCOUNT}\n\n"
        "Dear AWS Customer,\n\n"
        f"You requested that we alert you when the ACTUAL Cost associated with your {name} budget is greater than "
        f"${threshold} for the current month. The ACTUAL Cost associated with this budget is ${actual}. You can find "
        "additional details below and by accessing the AWS Budgets dashboard [1].\n\n"
        f"Budget Name: {name}\n"
        "Budget Type: Cost\n"
        f"Budgeted Amount: ${limit}\n"
        "Alert Type: ACTUAL\n"
        f"Alert Threshold: > ${threshold}\n"
        f"ACTUAL Amount: ${actual}\n\n"
        "[1] https://console.aws.amazon.com/billing/home#/budgets\n"
    )


def action_notice(name: str) -> str:
    return (
        "AWS Budgets Action Notification\n"
        f"AWS Account {ACCOUNT}\n\n"
        f"Budget Name: {name}\n"
        "Action Type: APPLY_IAM_POLICY\n"
        "Action Status: EXECUTION_SUCCESS\n"
        f"Executed by: arn:aws:iam::{ACCOUNT}:role/h4-budget-action\n"
    )


def anomaly_notice() -> str:
    return json.dumps(
        {
            "accountId": ACCOUNT,
            "anomalyId": "a1b2c3d4",
            "anomalyStartDate": "2026-11-09T00:00:00Z",
            "anomalyEndDate": "2026-11-10T00:00:00Z",
            "dimensionalValue": "Amazon Bedrock",
            "monitorArn": f"arn:aws:ce::{ACCOUNT}:anomalymonitor/abc",
            "impact": {"maxImpact": 3.2, "totalImpact": 4.56},
            "rootCauses": [
                {
                    "service": "Amazon Bedrock",
                    "region": "us-east-1",
                    "linkedAccount": ACCOUNT,
                    "usageType": PAYLOAD,
                }
            ],
            "anomalyDetailsLink": f"https://console.aws.amazon.com/cost-management/home#/{ACCOUNT}",
        }
    )


def alarm_notice(state: str, name: str = "h4-probe-failing") -> str:
    return json.dumps(
        {
            "AlarmName": name,
            "AWSAccountId": ACCOUNT,
            "NewStateValue": state,
            "OldStateValue": "OK" if state == "ALARM" else "ALARM",
            "NewStateReason": f"Threshold Crossed: 5 datapoints from {ADDRESS}",
            "StateChangeTime": "2026-11-10T06:01:00.000+0000",
            "AlarmArn": f"arn:aws:cloudwatch:us-east-1:{ACCOUNT}:alarm:{name}",
        }
    )


def event_notice(detail_type: str, source: str, detail: dict) -> str:
    return json.dumps(
        {
            "version": "0",
            "detail-type": detail_type,
            "source": source,
            "account": ACCOUNT,
            "time": "2026-11-10T06:00:00Z",
            "region": "us-east-1",
            "resources": [f"arn:aws:ec2:us-east-1:{ACCOUNT}:instance/i-0abc"],
            "detail": detail,
        }
    )


def ours(kind: str, summary: str, *facts: str) -> str:
    """A notice this project's own code publishes: the audit, the handover's functions, the deployers, and the rules'
    input transformers write it already in the format."""
    return "\n".join([f"[hareet.ai aws] {kind}: {summary}", *facts])


# Each kind of §2, with a notice of its source's shape. Kinds whose reason is part of the line carry it after a space.
NOTICES: dict[str, str] = {
    "model_budget_warn": budget_notice("h4-model-month", "20.00", "14.00", "14.52"),
    "model_budget_reached": budget_notice("h4-model-day", "5.00", "5.00", "5.01"),
    "server_budget_warn": budget_notice("h4-server-month", "40.00", "28.00", "28.10"),
    "server_budget_reached": budget_notice(
        "h4-server-month", "40.00", "40.00", "40.20"
    ),
    "model_action_executed": action_notice("h4-model-month"),
    "server_action_executed": action_notice("h4-server-month"),
    "aws_anomaly": anomaly_notice(),
    "cert_expiring": event_notice(
        "ACM Certificate Approaching Expiration",
        "aws.acm",
        {"DaysToExpiry": 31, "CommonName": "hareet.ai"},
    ),
    "probe_failing": alarm_notice("ALARM"),
    "probe_recovered": alarm_notice("OK"),
    # W1's two alarms (tasks.md T159; infra/account/alerts.tf).
    "credential_audit_failed": alarm_notice("ALARM", "h4-credential-audit-errors"),
    "alert_bridge_failed": alarm_notice("ALARM", "h4-alert-bridge-failed"),
    "credential_finding": ours(
        "credential_finding",
        "2 findings",
        "- iam_user_access_key: h4reet-runtime",
        "- role_foreign_trust: some-role",
        "Runbook: docs/runbooks/credential-audit.md",
    ),
    "ec2_started": ours("ec2_started", "EC2 started", "- instance: i-0abc"),
    "ec2_start_refused paused": ours(
        "ec2_start_refused (paused)", "the autostart switch is off"
    ),
    "ec2_start_refused server_budget_stopped": ours(
        "ec2_start_refused (server_budget_stopped)", "the server action has run"
    ),
    "ec2_start_refused laptop_serving": ours(
        "ec2_start_refused (laptop_serving)", "the laptop serves"
    ),
    "ec2_start_refused start_failed": ours(
        "ec2_start_refused (start_failed)", "StartInstances failed"
    ),
    "ec2_start_refused tunnel_end_down": ours(
        "ec2_start_refused (tunnel_end_down)", "the tunnel end isn't running"
    ),
    "ec2_stopped_laptop_serving": ours(
        "ec2_stopped_laptop_serving", "EC2 stopped: the laptop serves"
    ),
    "ec2_stopped_paused": ours("ec2_stopped_paused", "EC2 stopped: autostart is off"),
    "ec2_stopped_server_budget": ours(
        "ec2_stopped_server_budget", "EC2 stopped: the server action has run"
    ),
    "ec2_stopped_by_author": ours("ec2_stopped_by_author", "EC2 stopped by hand"),
    "spot_interruption": event_notice(
        "EC2 Spot Instance Interruption Warning",
        "aws.ec2",
        {"instance-id": "i-0abc", "instance-action": "stop"},
    ),
    "deploy_rolled_back": ours(
        "deploy_rolled_back", "release 0123456789ab", "- host: ec2"
    ),
    "deploy_rollback_failed": ours(
        "deploy_rollback_failed", "release 0123456789ab", "- host: tunnel-end"
    ),
    "deploy_refused": ours("deploy_refused", "release 0123456789ab", "- host: ec2"),
    "tunnel_end_interruption": ours(
        "tunnel_end_interruption",
        "AWS takes the tunnel end back in 2 minutes",
        "- instance: i-0def",
    ),
    "tunnel_end_back": ours(
        "tunnel_end_back", "the tunnel end runs again", "- instance: i-0def"
    ),
}


def contract_kinds() -> dict[str, str]:
    """contracts/aws-alerts.md §2's table: each kind, with its reason where the row names one, and its runbook."""
    text = CONTRACT.read_text(encoding="utf-8")
    start = text.index("\n## 2. ")
    section = text[start : text.index("\n## 3. ", start)]
    found: dict[str, str] = {}
    for line in section.splitlines():
        if not line.startswith("| `"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        first, runbooks = cells[0], re.findall(r"`([a-z0-9-]+\.md)`", cells[-1])
        reasons = re.search(r"`([a-z0-9_]+)` \((.*)\)$", first)
        if "`ec2_start_refused (" in first:
            # The row whose kind and reason are one code span: `ec2_start_refused (tunnel_end_down)`.
            ((kind, reason),) = re.findall(r"`([a-z0-9_]+) \(([a-z_]+)\)`", first)
            found[f"{kind} {reason}"] = runbooks[0]
            continue
        kinds = re.findall(r"`([a-z0-9_]+)`", re.sub(r"\(.*\)", "", first))
        if reasons and reasons.group(1) == "ec2_start_refused":
            # `ec2_start_refused` (`paused`, meaning …; `server_budget_stopped`, …): its reasons, each its own message.
            listed = [
                r for r in re.findall(r"`([a-z_]+)`", reasons.group(2)) if r != "off"
            ]
            kinds = [k for k in kinds if k != "ec2_start_refused"]
            for r in listed:
                found[f"ec2_start_refused {r}"] = runbooks[0]
        for i, kind in enumerate(kinds):
            # "`handover.md`; `server-budget.md` for the last": the row's last kind has the second page.
            last = (
                len(runbooks) > 1
                and i == len(kinds) - 1
                and "for the last" in cells[-1]
            )
            found[kind] = runbooks[1] if last else runbooks[0]
    return found


class Telegram:
    """A stub of the Bot API's sendMessage: each call's URL and body, answered in turn from a list of outcomes."""

    def __init__(self, *outcomes: object) -> None:
        self.outcomes = list(outcomes) or [200]
        self.calls: list[tuple[str, dict, float]] = []

    def __call__(self, url: str, body: bytes, timeout: float) -> int:
        self.calls.append((url, json.loads(body), timeout))
        outcome = self.outcomes.pop(0) if len(self.outcomes) > 1 else self.outcomes[0]
        if isinstance(outcome, BaseException):
            raise outcome
        return int(outcome)  # type: ignore[call-overload]

    @property
    def texts(self) -> list[str]:
        return [body["text"] for _, body, _ in self.calls]


class Parameters:
    def __init__(self, token: str = TOKEN) -> None:
        self.reads: list[str] = []
        self.token = token

    def get(self, name: str) -> str:
        self.reads.append(name)
        return {
            bridge.TOKEN_PARAMETER: self.token,
            bridge.CHAT_PARAMETER: CHAT,
        }[name]


def deliver(message: str, subject: str | None = None, telegram: Telegram | None = None):
    telegram = telegram or Telegram()
    sleeps: list[float] = []
    result = bridge.handler(
        sns(message, subject),
        None,
        parameters=Parameters(),
        post=telegram,
        sleep=sleeps.append,
    )
    return result, telegram, sleeps


FORBIDDEN = (ACCOUNT, KEY_ID, TOKEN, CHAT, EMAIL, ADDRESS, ADDRESS6, PAYLOAD)


def clean(text: str) -> bool:
    return not any(value in text for value in FORBIDDEN) and not re.search(
        r"(?<![0-9])[0-9]{12}(?![0-9])", text
    )


# ----------------------------------------------------------------------------------------------------------------------
# Every kind gives its message.


def test_the_notices_cover_every_kind_the_contract_lists() -> None:
    listed = contract_kinds()
    assert len(listed) >= 25  # not vacuous: the table parses
    assert set(NOTICES) == set(listed), set(NOTICES) ^ set(listed)
    for key in (
        "ec2_stopped_server_budget",
        "tunnel_end_interruption",
        "tunnel_end_back",
    ):
        assert key in listed


@pytest.mark.parametrize("key", sorted(NOTICES))
def test_each_kind_gives_its_message_and_names_its_runbook(key: str) -> None:
    kind, _, reason = key.partition(" ")
    result, telegram, _ = deliver(NOTICES[key])
    assert result == {"sent": 1}
    (text,) = telegram.texts
    lines = text.splitlines()
    head = (
        f"[hareet.ai aws] {kind} ({reason}): "
        if reason
        else f"[hareet.ai aws] {kind}: "
    )
    assert lines[0].startswith(head), lines[0]
    assert len(lines[0]) > len(head)  # its facts follow the kind
    assert lines[-1] == f"Runbook: docs/runbooks/{contract_kinds()[key]}"
    assert sum(1 for line in lines if line.startswith("Runbook: ")) == 1
    assert len(text) <= bridge.MAX_TEXT
    assert clean(text), text


def test_a_budgets_message_carries_the_budget_its_threshold_and_amounts() -> None:
    _, telegram, _ = deliver(NOTICES["model_budget_warn"])
    (text,) = telegram.texts
    assert text.splitlines()[0] == (
        "[hareet.ai aws] model_budget_warn: h4-model-month at $14.52, past $14.00 of $20.00"
    )
    assert "- budget: h4-model-month" in text.splitlines()
    _, telegram, _ = deliver(NOTICES["server_budget_reached"])
    assert telegram.texts[0].startswith(
        "[hareet.ai aws] server_budget_reached: h4-server-month at $40.20, past $40.00 of $40.00"
    )


def test_the_rehearsals_budgets_and_actions_say_they_are_rehearsals() -> None:
    for name, kind in (
        ("h4-rehearsal-model", "model_budget_reached"),
        ("h4-rehearsal-server", "server_budget_reached"),
    ):
        _, telegram, _ = deliver(budget_notice(name, "0.01", "0.01", "0.42"))
        (text,) = telegram.texts
        assert text.startswith(f"[hareet.ai aws] {kind}: {name} at $0.42"), text
        assert "- rehearsal: yes" in text.splitlines()
    for name, kind in (
        ("h4-rehearsal-model", "model_action_executed"),
        ("h4-rehearsal-server", "server_action_executed"),
    ):
        _, telegram, _ = deliver(action_notice(name))
        (text,) = telegram.texts
        assert text.startswith(f"[hareet.ai aws] {kind}: "), text
        assert "- rehearsal: yes" in text.splitlines()


def test_a_budget_the_project_doesnt_have_is_unrecognized() -> None:
    _, telegram, _ = deliver(budget_notice("someone-elses", "1.00", "1.00", "2.00"))
    assert telegram.texts[0].startswith("[hareet.ai aws] unrecognized: ")


def test_the_anomaly_carries_its_service_impact_and_start_only() -> None:
    _, telegram, _ = deliver(NOTICES["aws_anomaly"])
    (text,) = telegram.texts
    assert text.splitlines()[0] == (
        "[hareet.ai aws] aws_anomaly: Amazon Bedrock, impact $4.56, since 2026-11-09"
    )
    assert "console.aws.amazon.com" not in text


def test_the_probes_alarm_reads_alarm_as_failing_and_ok_as_recovered() -> None:
    _, telegram, _ = deliver(alarm_notice("ALARM"))
    assert telegram.texts[0].startswith("[hareet.ai aws] probe_failing: ")
    _, telegram, _ = deliver(alarm_notice("OK"))
    assert telegram.texts[0].startswith("[hareet.ai aws] probe_recovered: ")
    _, telegram, _ = deliver(alarm_notice("INSUFFICIENT_DATA"))
    assert telegram.texts[0].startswith("[hareet.ai aws] unrecognized: ")


def test_w1s_alarms_read_alarm_as_their_kind_and_nothing_else() -> None:
    # tasks.md T159: neither alarm has an OK action, so an OK or an unknown alarm's notice carries nothing.
    _, telegram, _ = deliver(alarm_notice("ALARM", "h4-credential-audit-errors"))
    assert telegram.texts[0].splitlines()[0] == (
        "[hareet.ai aws] credential_audit_failed: the weekly credential audit raised, since 2026-11-10T06:01:00"
    )
    assert (
        telegram.texts[0].splitlines()[-1]
        == "Runbook: docs/runbooks/credential-audit.md"
    )
    _, telegram, _ = deliver(alarm_notice("ALARM", "h4-alert-bridge-failed"))
    assert telegram.texts[0].splitlines()[0] == (
        "[hareet.ai aws] alert_bridge_failed: a notice the bridge couldn't send is in its failure queue, "
        "since 2026-11-10T06:01:00"
    )
    assert (
        telegram.texts[0].splitlines()[-1] == "Runbook: docs/runbooks/alert-bridge.md"
    )
    for name in (
        "h4-credential-audit-errors",
        "h4-alert-bridge-failed",
        "h4-something-else",
    ):
        _, telegram, _ = deliver(alarm_notice("OK", name))
        assert telegram.texts[0].startswith("[hareet.ai aws] unrecognized: "), name
    _, telegram, _ = deliver(alarm_notice("ALARM", "h4-something-else"))
    assert telegram.texts[0].startswith("[hareet.ai aws] unrecognized: ")


# EventBridge's input transformer, given a string template, publishes that string's JSON text: its quotes, and each
# line break as the two characters \n (infra/prod/handover.tf's rules; group 5's review, I6).
EVENTBRIDGE_STRING = (
    '"[hareet.ai aws] tunnel_end_interruption: AWS will stop the tunnel end in two minutes'
    '\\n- action: stop\\n- at: 2026-11-13T05:00:00Z"'
)


def test_an_eventbridge_string_template_is_read_as_the_notice_it_encodes() -> None:
    assert json.loads(EVENTBRIDGE_STRING).count("\n") == 2
    _, telegram, _ = deliver(EVENTBRIDGE_STRING)
    (text,) = telegram.texts
    assert text.splitlines() == [
        "[hareet.ai aws] tunnel_end_interruption: AWS will stop the tunnel end in two minutes",
        "- action: stop",
        "- at: 2026-11-13T05:00:00Z",
        "Runbook: docs/runbooks/tunnel-end.md",
    ]
    # A JSON string is read once, as text: one of no known shape, or a string inside a string, is unrecognized.
    for message in (
        json.dumps("not a notice of ours"),
        json.dumps(EVENTBRIDGE_STRING),
        json.dumps("[hareet.ai aws] no_such_kind: x"),
    ):
        _, telegram, _ = deliver(message)
        assert telegram.texts[0].startswith("[hareet.ai aws] unrecognized: "), message


def test_a_notice_of_ours_passes_with_its_fact_lines_and_the_tables_runbook() -> None:
    _, telegram, _ = deliver(NOTICES["credential_finding"])
    (text,) = telegram.texts
    assert text.splitlines() == [
        "[hareet.ai aws] credential_finding: 2 findings",
        "- iam_user_access_key: h4reet-runtime",
        "- role_foreign_trust: some-role",
        "Runbook: docs/runbooks/credential-audit.md",
    ]


def test_a_reason_takes_its_own_runbook() -> None:
    _, telegram, _ = deliver(NOTICES["ec2_start_refused tunnel_end_down"])
    assert telegram.texts[0].splitlines()[-1] == "Runbook: docs/runbooks/tunnel-end.md"
    _, telegram, _ = deliver(NOTICES["ec2_start_refused paused"])
    assert telegram.texts[0].splitlines()[-1] == "Runbook: docs/runbooks/handover.md"


def test_a_kind_or_reason_of_ours_that_the_table_doesnt_list_is_unrecognized() -> None:
    for message in (
        ours("ec2_exploded", "something"),
        ours("ec2_start_refused (bored)", "something"),
        "[hareet.ai cloud] deploy_refused: the old prefix",
    ):
        _, telegram, _ = deliver(message)
        assert telegram.texts[0].startswith("[hareet.ai aws] unrecognized: "), message


# ----------------------------------------------------------------------------------------------------------------------
# What never gets through.


def test_a_notice_it_doesnt_know_forwards_nothing_of_its_content() -> None:
    for message in (
        f"something new from AWS about {PAYLOAD} in {ACCOUNT}",
        json.dumps({"shape": "unknown", "payload": PAYLOAD}),
        event_notice(
            "EC2 Instance State-change Notification", "aws.ec2", {"state": "running"}
        ),
        "",
    ):
        _, telegram, _ = deliver(message, subject=f"About {PAYLOAD}")
        (text,) = telegram.texts
        assert text.startswith("[hareet.ai aws] unrecognized: "), message
        assert PAYLOAD not in text and clean(text)
        assert (
            "Runbook: " not in text
        )  # no page: the alerts mailbox's copy is the record


def test_no_secret_account_key_address_or_payload_reaches_telegram_or_the_log(
    capsys: pytest.CaptureFixture[str],
) -> None:
    leaky = ours(
        "deploy_refused",
        f"release 0123456789ab on {ADDRESS} for {EMAIL}",
        f"- account: {ACCOUNT}",
        f"- key: {KEY_ID}",
        f"- token: {TOKEN}",
        f"- address: {ADDRESS6}",
        f"- role: arn:aws:iam::{ACCOUNT}:role/h4-prod-ec2",
        f"a free line that isn't a fact, holding {PAYLOAD}",
    )
    for message in [*NOTICES.values(), leaky]:
        _, telegram, _ = deliver(message)
        assert clean(telegram.texts[0]), telegram.texts[0]
    out = capsys.readouterr()
    assert clean(out.out + out.err)
    # The facts survive, their secret shapes taken out.
    _, telegram, _ = deliver(leaky)
    text = telegram.texts[0]
    assert "- account: <account>" in text.splitlines()
    assert "- role: arn:aws:iam::<account>:role/h4-prod-ec2" in text.splitlines()
    assert "<key>" in text and "<secret>" in text and "<address>" in text


def test_a_long_notice_is_cut_to_its_bounds() -> None:
    many = ours(
        "credential_finding",
        "99 findings",
        *[f"- check_{i}: {'x' * 300}" for i in range(99)],
    )
    _, telegram, _ = deliver(many)
    (text,) = telegram.texts
    lines = text.splitlines()
    assert len(text) <= bridge.MAX_TEXT
    assert all(len(line) <= bridge.MAX_LINE for line in lines)
    assert len(lines) <= bridge.MAX_FACTS + 2
    assert lines[-1] == "Runbook: docs/runbooks/credential-audit.md"


def test_the_log_holds_the_source_the_kind_and_the_outcome_only(
    capsys: pytest.CaptureFixture[str],
) -> None:
    deliver(NOTICES["model_budget_reached"])
    (line,) = capsys.readouterr().out.splitlines()
    logged = json.loads(line)
    assert logged == {
        "source": "budgets",
        "kind": "model_budget_reached",
        "outcome": "sent",
        "attempts": 1,
    }


# ----------------------------------------------------------------------------------------------------------------------
# The parameters, the request, the retries, and the failure path.


def test_it_reads_both_parameters_at_each_run_and_sends_plain_text() -> None:
    params = Parameters()
    telegram = Telegram()
    for _ in range(2):
        bridge.handler(
            sns(NOTICES["aws_anomaly"]),
            None,
            parameters=params,
            post=telegram,
            sleep=lambda s: None,
        )
    assert params.reads == [bridge.TOKEN_PARAMETER, bridge.CHAT_PARAMETER] * 2
    for url, body, timeout in telegram.calls:
        assert url == f"https://api.telegram.org/bot{TOKEN}/sendMessage"
        assert timeout == 5
        assert set(body) == {"chat_id", "text", "link_preview_options"}
        assert body["chat_id"] == CHAT
        assert body["link_preview_options"] == {"is_disabled": True}


def test_the_parameter_names_come_from_the_environment_or_their_defaults(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert bridge.TOKEN_PARAMETER == "/h4reet/alerts/TELEGRAM_BOT_TOKEN"
    assert bridge.CHAT_PARAMETER == "/h4reet/alerts/TELEGRAM_CHAT_ID"
    monkeypatch.setenv("H4_TELEGRAM_TOKEN_PARAMETER", "/h4reet/alerts/OTHER")
    assert bridge.parameter_names() == ("/h4reet/alerts/OTHER", bridge.CHAT_PARAMETER)


def test_it_retries_a_failed_send_three_attempts_two_seconds_apart() -> None:
    telegram = Telegram(urllib.error.URLError("unreachable"), 502, 200)
    result, telegram, sleeps = deliver(NOTICES["aws_anomaly"], telegram=telegram)
    assert result == {"sent": 1}
    assert len(telegram.calls) == 3
    assert sleeps == [2, 2]


def test_a_rate_limit_is_retried_too() -> None:
    result, telegram, sleeps = deliver(
        NOTICES["aws_anomaly"], telegram=Telegram(429, 200)
    )
    assert result == {"sent": 1} and len(telegram.calls) == 2 and sleeps == [2]


def test_after_three_failures_it_raises_for_lambdas_retries_and_failure_destination(
    capsys: pytest.CaptureFixture[str],
) -> None:
    for outcome in (TimeoutError("slow"), 500, urllib.error.URLError("dns")):
        telegram = Telegram(outcome)
        with pytest.raises(bridge.BridgeError) as raised:
            deliver(NOTICES["aws_anomaly"], telegram=telegram)
        assert len(telegram.calls) == 3
        assert TOKEN not in str(raised.value) and "api.telegram.org" not in str(
            raised.value
        )
    out = capsys.readouterr()
    assert '"outcome": "failed"' in out.out
    assert clean(out.out + out.err)


def test_a_refusal_that_retrying_cant_mend_is_not_retried() -> None:
    for status in (400, 401, 403, 404):
        telegram = Telegram(status)
        with pytest.raises(bridge.BridgeError):
            deliver(NOTICES["aws_anomaly"], telegram=telegram)
        assert len(telegram.calls) == 1, status


# T038's review, I5: a token with a control character in it makes http.client raise InvalidURL with the URL, which holds
# the token, in its message, and Lambda would log it and hand it to the failure queue. So the token is stripped and held
# to the bot token's shape before any URL is built, and nothing the post raises reaches the log but its class's name.


def run_with(token: str, post) -> tuple[pytest.ExceptionInfo | None, str]:
    raised = None
    try:
        bridge.handler(
            sns(NOTICES["aws_anomaly"]),
            None,
            parameters=Parameters(token),
            post=post,
            sleep=lambda s: None,
        )
    except bridge.BridgeError as exc:
        raised = exc
    return raised, str(raised)  # type: ignore[return-value]


def test_a_token_of_another_shape_is_refused_naming_only_its_parameter(
    capsys: pytest.CaptureFixture[str],
) -> None:
    for bad in (
        TOKEN[:5] + "\x00" + TOKEN[5:],
        TOKEN[:12] + "\r\n" + TOKEN[12:],
        TOKEN + " extra",
        TOKEN.replace(":", ""),
        "",
    ):
        telegram = Telegram()
        raised, message = run_with(bad, telegram)
        assert raised is not None, repr(bad)
        assert bridge.TOKEN_PARAMETER in message
        assert TOKEN[:9] not in message and "api.telegram.org" not in message
        assert telegram.calls == []
    out = capsys.readouterr()
    assert TOKEN[:9] not in out.out + out.err


def test_the_token_is_stripped_of_the_blanks_around_it() -> None:
    telegram = Telegram()
    raised, _ = run_with(f"  {TOKEN}\n", telegram)
    assert raised is None
    ((url, _, _),) = telegram.calls
    assert url == f"https://api.telegram.org/bot{TOKEN}/sendMessage"


def test_anything_else_the_post_raises_becomes_its_class_name_alone(
    capsys: pytest.CaptureFixture[str],
) -> None:
    import http.client

    for exc in (
        http.client.InvalidURL(f"URL can't contain control characters: bot{TOKEN}"),
        ValueError(f"https://api.telegram.org/bot{TOKEN}/sendMessage"),
        RuntimeError(TOKEN),
    ):
        calls: list[str] = []

        def post(
            url: str,
            body: bytes,
            timeout: float,
            exc: Exception = exc,
            calls: list[str] = calls,
        ) -> int:
            calls.append(url)
            raise exc

        raised, message = run_with(TOKEN, post)
        assert raised is not None and raised.__cause__ is None
        assert raised.__suppress_context__
        assert exc.__class__.__name__ in message
        assert TOKEN[:9] not in message and "api.telegram.org" not in message
        assert len(calls) == 1  # not retried: another attempt can't mend it
    out = capsys.readouterr()
    assert TOKEN[:9] not in out.out + out.err
    assert '"outcome": "failed"' in out.out


def test_missing_parameters_raise_without_naming_a_value() -> None:
    class Missing:
        def get(self, name: str) -> str:
            raise bridge.BridgeError(f"parameter {name} is missing")

    with pytest.raises(bridge.BridgeError) as raised:
        bridge.handler(
            sns(NOTICES["aws_anomaly"]),
            None,
            parameters=Missing(),
            post=Telegram(),
            sleep=lambda s: None,
        )
    assert "TELEGRAM_BOT_TOKEN" in str(raised.value)


def test_an_event_with_no_sns_record_sends_nothing() -> None:
    telegram = Telegram()
    params = Parameters()
    assert bridge.handler(
        {}, None, parameters=params, post=telegram, sleep=lambda s: None
    ) == {"sent": 0}
    assert bridge.handler(
        {"Records": []}, None, parameters=params, post=telegram, sleep=lambda s: None
    ) == {"sent": 0}
    assert telegram.calls == [] and params.reads == []


def test_the_real_post_sends_json_and_hides_the_url_in_its_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen = {}

    class Response(io.BytesIO):
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *exc: object) -> None:
            return None

    def opener(request, timeout):
        seen["url"], seen["data"], seen["timeout"] = (
            request.full_url,
            request.data,
            timeout,
        )
        seen["method"], seen["type"] = (
            request.get_method(),
            request.get_header("Content-type"),
        )
        return Response(b'{"ok": true}')

    monkeypatch.setattr(bridge, "_urlopen", opener)
    url = f"https://api.telegram.org/bot{TOKEN}/sendMessage"
    assert bridge.http_post(url, b'{"text": "x"}', 5) == 200
    assert (
        seen["method"] == "POST"
        and seen["type"] == "application/json"
        and seen["timeout"] == 5
    )

    def failing(request, timeout):
        raise urllib.error.HTTPError(request.full_url, 403, "Forbidden", {}, None)  # type: ignore[arg-type]

    monkeypatch.setattr(bridge, "_urlopen", failing)
    assert bridge.http_post(url, b"{}", 5) == 403
