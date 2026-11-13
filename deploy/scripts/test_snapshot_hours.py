"""T170 (spec 001; the Author's answer to W1's question 1b, "W1 answers: 1a A, 1b A, …", 2026-11-12, and to where the
hours show, "Only /status/ (Recommended)"): the public view carries EC2's hours in their zone. The relay's status
answer doesn't, a named deviation from 1b's wording (plan.md §16; spec.md Assumptions).

`local.ec2_hours` in infra/account/handover.tf stays their one source: the sink's cloud part reads the two schedules it
sets, `scheduler:GetSchedule` on h4-ec2-hours-open and h4-ec2-hours-close, and the document carries `ec2_hours`, the
open's and the close's times and the schedules' zone. No copy sits in the release's configuration. A failed read, or
two schedules that disagree on their zone, is an error, and the document's `ec2_hours` is null, never a guess. The
tunnel end's role gains that one read, by the two schedules' name-built ARNs; its proxy, the scheduler's endpoint, with
its disclosure row.
"""

from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
HOURS = {"open": "07:00", "close": "19:00", "zone": "America/Denver"}


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _sink():
    return _load("h4_snapshot_sink_for_hours", HERE / "snapshot_sink.py")


def _tests():
    return _load("h4_snapshot_tests_for_hours", HERE / "test_snapshot.py")


class Schedules:
    def __init__(self, sink, schedules: dict | None = None, fail: bool = False) -> None:
        self.sink = sink
        self.fail = fail
        self.calls: list[tuple[str, str, dict]] = []
        self.schedules = schedules or {
            "h4-ec2-hours-open": ("cron(0 7 * * ? *)", "America/Denver"),
            "h4-ec2-hours-close": ("cron(0 19 * * ? *)", "America/Denver"),
        }

    def call(self, service: str, op: str, **params: object) -> dict:
        self.calls.append((service, op, dict(params)))
        if (service, op) == ("scheduler", "GetSchedule"):
            if self.fail or params.get("Name") not in self.schedules:
                raise self.sink.AwsError("AccessDenied")
            expression, zone = self.schedules[str(params["Name"])]
            return {
                "Name": params["Name"],
                "ScheduleExpression": expression,
                "ScheduleExpressionTimezone": zone,
                "State": "ENABLED",
            }
        raise self.sink.AwsError("AccessDenied")


def test_the_hours_are_read_from_the_two_schedules_by_name() -> None:
    sink = _sink()
    assert sink.HOURS_SCHEDULES == ("h4-ec2-hours-open", "h4-ec2-hours-close")
    aws, out = Schedules(sink), sink.Reads()
    sink.read_hours(aws, out)
    assert out.hours == HOURS
    assert "hours" not in out.errors
    assert {(s, o, p.get("Name")) for s, o, p in aws.calls} == {
        ("scheduler", "GetSchedule", "h4-ec2-hours-open"),
        ("scheduler", "GetSchedule", "h4-ec2-hours-close"),
    }


@pytest.mark.parametrize(
    "schedules",
    [
        None,  # the read fails
        {
            "h4-ec2-hours-open": ("cron(0 7 * * ? *)", "America/Denver"),
            "h4-ec2-hours-close": ("cron(0 19 * * ? *)", "Etc/GMT+7"),
        },
        {
            "h4-ec2-hours-open": ("rate(1 hour)", "America/Denver"),
            "h4-ec2-hours-close": ("cron(0 19 * * ? *)", "America/Denver"),
        },
    ],
    ids=["failed", "zones-disagree", "not-a-daily-time"],
)
def test_an_unreadable_or_inconsistent_pair_is_an_error_never_a_guess(
    schedules: dict | None,
) -> None:
    sink = _sink()
    aws = Schedules(sink, schedules, fail=schedules is None)
    out = sink.Reads()
    sink.read_hours(aws, out)
    assert out.hours is None
    assert "hours" in out.errors


def test_the_document_carries_the_hours_and_the_check_holds_their_shape(
    tmp_path: Path,
) -> None:
    t = _tests()
    clock = [t.NOW]
    w = t.writer(tmp_path, t.NONE_SERVES, None, clock)
    w.cloud.aws = type(
        "Both",
        (),
        {
            "call": lambda self, service, op, **p: (
                Schedules(t.sink).call(service, op, **p)
                if service == "scheduler"
                else t.Aws().call(service, op, **p)
            )
        },
    )()
    doc = w.document()
    assert doc["ec2_hours"] == HOURS
    assert t.sink.validate_document(doc) is None
    for bad in (
        {"open": "7am", "close": "19:00", "zone": "America/Denver"},
        {"open": "07:00", "close": "19:00", "zone": "<b>"},
        {"open": "07:00", "close": "19:00"},
    ):
        assert t.sink.validate_document({**doc, "ec2_hours": bad}) is not None, bad
    assert t.sink.validate_document({**doc, "ec2_hours": None}) is None


def test_the_tunnel_ends_proxy_reaches_the_scheduler_and_the_disclosure_names_it() -> (
    None
):
    allow = (
        REPO / "deploy" / "hosts" / "tunnel-end" / "egress-allowlist.txt"
    ).read_text(encoding="utf-8")
    assert "scheduler.us-east-1.amazonaws.com" in {
        line.strip() for line in allow.splitlines() if not line.startswith("#")
    }
    disclosure = (REPO / "docs" / "data-flow-disclosure.md").read_text(encoding="utf-8")
    assert re.search(
        r"^\|\s*[A-Z][0-9]+\s*\|.*`scheduler\.us-east-1\.amazonaws\.com`",
        disclosure,
        re.MULTILINE,
    )
