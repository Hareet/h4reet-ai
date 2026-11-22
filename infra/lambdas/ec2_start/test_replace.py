"""Tests for h4-ec2-start's replace path and the tunnel end's check (spec 032 FR-005 to FR-014, FR-018; plan.md §3).

AWS is a small stateful fake here: instances by ID with their type, state, tags, and spot request; the launch
templates the two list parameters name; which types have no capacity; the two volumes; the VPC origin; the lock. The
fake refuses a launch while another live instance carries the same Name, so a test that would run two hosts fails.
test_start.py keeps the checks 1 to 5 and the plain start; this file covers what spec 032 adds.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


start = _load("h4_ec2_start_for_replace", HERE / "start.py")

HOURS = "America/Denver 07:00-19:00"
ACCOUNT = "1" * 4 + "2" * 4 + "3" * 4
TOPIC = f"arn:aws:sns:us-east-1:{ACCOUNT}:h4-alerts"
# A Wednesday in November, 10:00 in Denver: inside the hours.
INSIDE = datetime(2026, 11, 18, 17, 0, tzinfo=timezone.utc)
OUTSIDE = datetime(2026, 11, 19, 4, 0, tzinfo=timezone.utc)
EC2_TYPES = ["t4g.large", "m7g.large", "m6g.large", "t4g.xlarge"]
TUNNEL_TYPES = ["t4g.small", "c7g.medium", "c6g.medium", "t4g.medium"]
OLD_EC2 = "i-0" + "ab" * 8
OLD_TUNNEL = "i-0" + "cd" * 8
ORIGIN_ID = "vo_relay_1"


def template_id(t: str) -> str:
    return "lt-" + t.replace(".", "-")


class Context:
    invoked_function_arn = f"arn:aws:lambda:us-east-1:{ACCOUNT}:function:h4-ec2-start"


class Clock:
    def __init__(self, at: datetime) -> None:
        self.at = at
        self.slept = 0.0

    def now(self) -> datetime:
        return self.at

    def sleep(self, seconds: float) -> None:
        self.slept += seconds
        self.at += timedelta(seconds=seconds)


class Cloud:
    """The AWS the function sees, as state."""

    def __init__(self, clock: Clock) -> None:
        self.clock = clock
        self.calls: list[tuple[str, str, dict]] = []
        self.short: set[str] = set()
        self.refuse: dict[str, start.AwsError] = {}
        self.params: dict[str, str] = {
            "/h4reet/prod/ec2-autostart": "on",
            "/h4reet/prod/ec2-instance-id": OLD_EC2,
            "/h4reet/prod/ec2-launch-templates": json.dumps(
                [{"type": t, "template": template_id(t)} for t in EC2_TYPES]
            ),
            "/h4reet/prod/tunnel-end-launch-templates": json.dumps(
                [{"type": t, "template": template_id(t)} for t in TUNNEL_TYPES]
            ),
            "/h4reet/prod/relay-vpc-origin-id": ORIGIN_ID,
        }
        self.templates = {template_id(t): t for t in EC2_TYPES + TUNNEL_TYPES}
        self.instances: dict[str, dict] = {}
        self.requests: dict[str, dict] = {}
        self.add(
            OLD_EC2, "h4-prod-ec2", "t4g.large", "stopped", "instance-stopped-by-user"
        )
        self.add(OLD_TUNNEL, "h4-prod-tunnel-end", "t4g.small", "running", "fulfilled")
        self.volumes = {
            "vol-ec2": {"Name": "h4-ec2-data", "on": OLD_EC2},
            "vol-ss": {"Name": "h4-shared-state", "on": OLD_TUNNEL},
        }
        self.alarm = "ALARM"
        self.budget = "STANDBY"
        self.origin_arn = self.arn(OLD_TUNNEL)
        self.count = 0

    @staticmethod
    def arn(instance: str) -> str:
        return f"arn:aws:ec2:us-east-1:{ACCOUNT}:instance/{instance}"

    def add(
        self,
        iid: str,
        name: str,
        kind: str,
        state: str,
        code: str,
        updated: datetime | None = None,
        template: str | None = None,
    ) -> None:
        request = "sir-" + iid[-6:]
        tags = [{"Key": "Name", "Value": name}]
        if template:
            tags.append({"Key": "aws:ec2launchtemplate:id", "Value": template})
        self.instances[iid] = {
            "InstanceId": iid,
            "InstanceType": kind,
            "State": {"Name": state},
            "Tags": tags,
            "SpotInstanceRequestId": request,
        }
        self.requests[request] = {
            "SpotInstanceRequestId": request,
            "State": "active",
            "Status": {"Code": code, "UpdateTime": updated or self.clock.now()},
        }

    def live(self, name: str) -> list[dict]:
        return [
            i
            for i in self.instances.values()
            if i["State"]["Name"] not in ("terminated", "shutting-down")
            and {"Key": "Name", "Value": name} in i["Tags"]
        ]

    # ------------------------------------------------------------------------------------------------------------------

    def call(self, service: str, op: str, **p: object) -> dict:
        self.calls.append((service, op, dict(p)))
        if op in self.refuse:
            raise self.refuse.pop(op)
        handler = getattr(self, f"{service}_{op}", None)
        if handler is None:
            raise start.AwsError("AccessDenied")
        return handler(**p)

    def ssm_GetParameter(self, Name: str) -> dict:
        if Name not in self.params:
            raise start.AwsError("ParameterNotFound")
        return {"Parameter": {"Value": self.params[Name]}}

    def ssm_PutParameter(
        self, Name: str, Value: str, Type: str, Overwrite: bool
    ) -> dict:
        assert Type == "String"
        if Name in self.params and not Overwrite:
            raise start.AwsError("ParameterAlreadyExists")
        self.params[Name] = Value
        return {"Version": 1}

    def ssm_DeleteParameter(self, Name: str) -> dict:
        self.params.pop(Name, None)
        return {}

    def budgets_DescribeBudgetActionsForBudget(self, **_: object) -> dict:
        return {"Actions": [{"ActionType": "RUN_SSM_DOCUMENTS", "Status": self.budget}]}

    def cloudwatch_DescribeAlarms(self, **_: object) -> dict:
        return {
            "MetricAlarms": [{"AlarmName": "h4-laptop-away", "StateValue": self.alarm}]
        }

    def sns_Publish(self, **_: object) -> dict:
        return {"MessageId": "m"}

    def ec2_DescribeInstances(self, InstanceIds=None, Filters=None) -> dict:
        if InstanceIds:
            found = [self.instances[i] for i in InstanceIds if i in self.instances]
            if not found:
                raise start.AwsError("InvalidInstanceID.NotFound")
        else:
            name = Filters[0]["Values"][0]  # type: ignore[index]
            found = [
                i
                for i in self.instances.values()
                if {"Key": "Name", "Value": name} in i["Tags"]
            ]
        out = []
        for i in found:
            # A pending instance runs, and a terminating one is gone, at the next look.
            out.append(json.loads(json.dumps(i)))
            if i["State"]["Name"] == "pending":
                i["State"]["Name"] = "running"
            elif i["State"]["Name"] == "shutting-down":
                i["State"]["Name"] = "terminated"
        return {"Reservations": [{"Instances": out}]}

    def ec2_DescribeSpotInstanceRequests(self, SpotInstanceRequestIds) -> dict:
        return {
            "SpotInstanceRequests": [self.requests[r] for r in SpotInstanceRequestIds]
        }

    def ec2_StartInstances(self, InstanceIds) -> dict:
        (iid,) = InstanceIds
        kind = self.instances[iid]["InstanceType"]
        if kind in self.short:
            raise start.AwsError("InsufficientInstanceCapacity")
        self.instances[iid]["State"]["Name"] = "pending"
        return {
            "StartingInstances": [
                {"InstanceId": iid, "CurrentState": {"Name": "pending"}}
            ]
        }

    def ec2_CancelSpotInstanceRequests(self, SpotInstanceRequestIds) -> dict:
        for r in SpotInstanceRequestIds:
            self.requests[r]["State"] = "cancelled"
        return {}

    def ec2_TerminateInstances(self, InstanceIds) -> dict:
        for iid in InstanceIds:
            request = self.instances[iid]["SpotInstanceRequestId"]
            assert self.requests[request]["State"] == "cancelled", (
                "terminated before its request was cancelled"
            )
            self.instances[iid]["State"]["Name"] = "shutting-down"
            for v in self.volumes.values():
                if v["on"] == iid:
                    v["on"] = None
        return {}

    def ec2_RunInstances(self, LaunchTemplate, MinCount, MaxCount) -> dict:
        assert (MinCount, MaxCount) == (1, 1)
        assert LaunchTemplate["Version"] == "$Default"
        kind = self.templates[LaunchTemplate["LaunchTemplateId"]]
        name = "h4-prod-tunnel-end" if kind in TUNNEL_TYPES else "h4-prod-ec2"
        assert not self.live(name), f"a second {name} would run"
        if kind in self.short:
            raise start.AwsError("InsufficientInstanceCapacity")
        self.count += 1
        iid = f"i-0new{self.count:012d}"
        self.add(
            iid,
            name,
            kind,
            "pending",
            "fulfilled",
            template=LaunchTemplate["LaunchTemplateId"],
        )
        return {"Instances": [{"InstanceId": iid, "InstanceType": kind}]}

    def ec2_DescribeVolumes(self, Filters) -> dict:
        name = Filters[0]["Values"][0]
        return {
            "Volumes": [
                {
                    "VolumeId": vid,
                    "State": "in-use" if v["on"] else "available",
                    "Attachments": [{"InstanceId": v["on"]}] if v["on"] else [],
                }
                for vid, v in self.volumes.items()
                if v["Name"] == name
            ]
        }

    def ec2_AttachVolume(self, Device: str, InstanceId: str, VolumeId: str) -> dict:
        assert Device == "/dev/sdf"
        assert self.volumes[VolumeId]["on"] is None, "attached while still on another"
        self.volumes[VolumeId]["on"] = InstanceId
        return {"State": "attaching"}

    def cloudfront_GetVpcOrigin(self, Id: str) -> dict:
        assert Id == ORIGIN_ID
        return {
            "ETag": "E1",
            "VpcOrigin": {
                "Id": Id,
                "VpcOriginEndpointConfig": {
                    "Name": "h4-relay",
                    "Arn": self.origin_arn,
                    "HTTPPort": 8080,
                    "HTTPSPort": 443,
                    "OriginProtocolPolicy": "http-only",
                },
            },
        }

    def cloudfront_UpdateVpcOrigin(
        self, Id: str, IfMatch: str, VpcOriginEndpointConfig: dict
    ) -> dict:
        assert (Id, IfMatch) == (ORIGIN_ID, "E1")
        assert VpcOriginEndpointConfig["Name"] == "h4-relay"
        self.origin_arn = VpcOriginEndpointConfig["Arn"]
        return {}

    # ------------------------------------------------------------------------------------------------------------------

    def ops(self, op: str) -> list[dict]:
        return [p for _, o, p in self.calls if o == op]

    def alerts(self) -> list[str]:
        return [p["Message"] for p in self.ops("Publish")]


@pytest.fixture(autouse=True)
def environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("H4_EC2_HOURS", HOURS)
    monkeypatch.setenv("H4_ALERTS_TOPIC_ARN", TOPIC)


def cloud(at: datetime = INSIDE) -> Cloud:
    return Cloud(Clock(at))


def run(event: object, c: Cloud) -> dict:
    return start.handler(event, Context(), aws=c, now=c.clock.now, sleep=c.clock.sleep)


def facts(alert: str) -> dict[str, str]:
    return dict(
        line[2:].split(": ", 1)
        for line in alert.splitlines()[1:]
        if line.startswith("- ")
    )


def emf(capsys: pytest.CaptureFixture[str]) -> list[dict]:
    return [
        d
        for d in (json.loads(x) for x in capsys.readouterr().out.splitlines())
        if "_aws" in d
    ]


ALARM = {
    "source": "aws.cloudwatch",
    "detail-type": "CloudWatch Alarm State Change",
    "detail": {"alarmName": "h4-laptop-away", "state": {"value": "ALARM"}},
}
CHECK = {"from": "tunnel_end_check"}


def ec2_now(c: Cloud) -> dict:
    (one,) = c.live("h4-prod-ec2")
    return one


# ----------------------------------------------------------------------------------------------------------------------
# EC2: FR-005 to FR-008


def test_a_plain_start_names_the_type(capsys: pytest.CaptureFixture[str]) -> None:
    c = cloud()
    assert run(ALARM, c)["outcome"] == "started"
    assert not c.ops("TerminateInstances") and not c.ops("RunInstances")
    (alert,) = c.alerts()
    assert facts(alert)["type"] == "t4g.large"


def test_a_capacity_refusal_replaces_ec2_with_the_next_type_in_order(
    capsys: pytest.CaptureFixture[str],
) -> None:
    c = cloud()
    c.short = {"t4g.large"}
    result = run(ALARM, c)
    assert result["outcome"] == "started", result
    new = ec2_now(c)
    assert new["InstanceType"] == "m7g.large"
    assert c.params["/h4reet/prod/ec2-instance-id"] == new["InstanceId"]
    assert c.volumes["vol-ec2"]["on"] == new["InstanceId"]
    assert c.instances[OLD_EC2]["State"]["Name"] == "terminated"
    order = [
        o
        for _, o, _ in c.calls
        if o
        in (
            "CancelSpotInstanceRequests",
            "TerminateInstances",
            "RunInstances",
            "AttachVolume",
        )
    ]
    assert order == [
        "CancelSpotInstanceRequests",
        "TerminateInstances",
        "RunInstances",
        "AttachVolume",
    ]
    (alert,) = c.alerts()
    assert alert.startswith("[hareet.ai aws] ec2_started: ")
    f = facts(alert)
    assert f["type"] == "m7g.large"
    assert f["replaced"] == "t4g.large InsufficientInstanceCapacity"
    assert "next prod plan" in f["repoint"]
    assert OLD_EC2 not in alert and new["InstanceId"] not in alert
    assert "/h4reet/prod/host-lock" not in c.params, "the lock is released"
    (line,) = emf(capsys)
    assert line["Outcome"] == "started"


def test_each_refused_type_is_tried_once_in_order_and_named() -> None:
    c = cloud()
    c.short = {"t4g.large", "m7g.large"}
    run(ALARM, c)
    launched = [
        c.templates[p["LaunchTemplate"]["LaunchTemplateId"]]
        for p in c.ops("RunInstances")
    ]
    assert launched == ["m7g.large", "m6g.large"]
    f = facts(c.alerts()[0])
    assert (f["type"], f["tried"]) == (
        "m6g.large",
        "m7g.large InsufficientInstanceCapacity",
    )


def test_no_listed_type_refuses_no_capacity_with_every_code(
    capsys: pytest.CaptureFixture[str],
) -> None:
    c = cloud()
    c.short = set(EC2_TYPES)
    result = run({"from": "hours_open"}, c)
    assert (result["outcome"], result["reason"]) == ("refused", "start_failed")
    assert c.live("h4-prod-ec2") == []
    (alert,) = c.alerts()  # alerted at the scheduled open too
    assert alert.startswith("[hareet.ai aws] ec2_start_refused (start_failed): ")
    f = facts(alert)
    assert f["code"] == "no_capacity"
    assert f["tried"] == ", ".join(
        f"{t} InsufficientInstanceCapacity" for t in EC2_TYPES[1:]
    )
    assert "/h4reet/prod/host-lock" not in c.params
    (line,) = emf(capsys)
    assert line["Outcome"] == "no_capacity"


def test_another_launch_code_stops_the_list() -> None:
    c = cloud()
    c.short = {"t4g.large"}
    c.refuse["RunInstances"] = start.AwsError("UnauthorizedOperation")
    result = run(ALARM, c)
    assert result["reason"] == "start_failed"
    assert len(c.ops("RunInstances")) == 1
    f = facts(c.alerts()[0])
    assert f["code"] == "UnauthorizedOperation"


def test_a_missing_instance_is_launched_from_the_top_without_a_stop() -> None:
    c = cloud()
    del c.instances[OLD_EC2]
    c.volumes["vol-ec2"]["on"] = None
    assert run(ALARM, c)["outcome"] == "started"
    assert not c.ops("TerminateInstances") and not c.ops("CancelSpotInstanceRequests")
    assert ec2_now(c)["InstanceType"] == "t4g.large"


def test_an_instance_aws_stopped_for_capacity_is_replaced_without_a_start() -> None:
    c = cloud()
    c.requests["sir-" + OLD_EC2[-6:]]["Status"]["Code"] = "instance-stopped-no-capacity"
    assert run(ALARM, c)["outcome"] == "started"
    assert not c.ops("StartInstances")
    assert ec2_now(c)["InstanceType"] == "m7g.large"


def test_an_instance_of_an_earlier_generation_is_replaced_from_the_top() -> None:
    c = cloud()
    c.instances[OLD_EC2]["Tags"].append(
        {"Key": "aws:ec2launchtemplate:id", "Value": "lt-gone"}
    )
    assert run(ALARM, c)["outcome"] == "started"
    assert not c.ops("StartInstances")
    assert ec2_now(c)["InstanceType"] == "t4g.large"


def test_a_current_template_instance_just_starts() -> None:
    c = cloud()
    c.instances[OLD_EC2]["Tags"].append(
        {"Key": "aws:ec2launchtemplate:id", "Value": template_id("m7g.large")}
    )
    c.instances[OLD_EC2]["InstanceType"] = "m7g.large"
    assert run(ALARM, c)["outcome"] == "started"
    assert c.ops("StartInstances") and not c.ops("RunInstances")


# ----------------------------------------------------------------------------------------------------------------------
# The lock: FR-011, FR-012


def test_a_live_lock_refuses_busy_and_touches_nothing(
    capsys: pytest.CaptureFixture[str],
) -> None:
    c = cloud()
    c.short = {"t4g.large"}
    c.params["/h4reet/prod/host-lock"] = f"{int(INSIDE.timestamp()) - 60} hours_open"
    result = run(ALARM, c)
    assert result["reason"] == "start_failed"
    assert not c.ops("TerminateInstances") and not c.ops("RunInstances")
    assert facts(c.alerts()[0])["code"] == "busy"
    assert c.params["/h4reet/prod/host-lock"].endswith("hours_open"), (
        "another run's lock stays"
    )
    (line,) = emf(capsys)
    assert line["Outcome"] == "busy"


def test_a_lock_older_than_twenty_minutes_is_taken_over() -> None:
    c = cloud()
    c.short = {"t4g.large"}
    c.params["/h4reet/prod/host-lock"] = f"{int(INSIDE.timestamp()) - 1201} hours_open"
    assert run(ALARM, c)["outcome"] == "started"
    assert "/h4reet/prod/host-lock" not in c.params


def test_a_refused_cancel_terminates_nothing() -> None:
    c = cloud()
    c.short = {"t4g.large"}
    c.refuse["CancelSpotInstanceRequests"] = start.AwsError("UnauthorizedOperation")
    result = run(ALARM, c)
    assert result["reason"] == "start_failed"
    assert not c.ops("TerminateInstances") and not c.ops("RunInstances")
    assert c.instances[OLD_EC2]["State"]["Name"] == "stopped"
    assert "/h4reet/prod/host-lock" not in c.params


# ----------------------------------------------------------------------------------------------------------------------
# The hand replace: FR-009


def test_a_hand_replace_of_ec2_skips_the_types_named() -> None:
    c = cloud()
    result = run({"manual": True, "replace": "ec2", "skip": ["t4g.large"]}, c)
    assert result["outcome"] == "started"
    assert not c.ops("StartInstances")
    assert ec2_now(c)["InstanceType"] == "m7g.large"


def test_a_hand_replace_of_ec2_runs_its_checks_first() -> None:
    c = cloud(OUTSIDE)
    result = run({"manual": True, "replace": "ec2"}, c)
    assert result["reason"] == "outside_hours"
    assert not c.ops("TerminateInstances")


@pytest.mark.parametrize(
    "event",
    [
        {"manual": True, "replace": "laptop"},
        {"manual": True, "replace": "ec2", "skip": "t4g.large"},
        {"manual": True, "replace": "ec2", "skip": ["t4g.large; rm"]},
    ],
)
def test_an_unreadable_hand_replace_is_an_unknown_trigger(event: dict) -> None:
    c = cloud()
    result = run(event, c)
    assert result["reason"] == "start_failed"
    assert facts(c.alerts()[0])["code"] == "unknown_trigger"
    assert not c.ops("TerminateInstances")


# ----------------------------------------------------------------------------------------------------------------------
# The tunnel end's check: FR-013, FR-014


def stop_tunnel(c: Cloud, code: str, ago_s: int) -> None:
    c.instances[OLD_TUNNEL]["State"]["Name"] = "stopped"
    c.requests["sir-" + OLD_TUNNEL[-6:]]["Status"] = {
        "Code": code,
        "UpdateTime": INSIDE - timedelta(seconds=ago_s),
    }


@pytest.mark.parametrize(
    "setup",
    [
        lambda c: None,  # running
        lambda c: stop_tunnel(c, "instance-stopped-by-user", 3600),
        lambda c: stop_tunnel(c, "instance-stopped-no-capacity", 540),
    ],
)
def test_the_check_leaves_a_running_a_hand_stopped_or_a_young_stop_alone(
    setup, capsys: pytest.CaptureFixture[str]
) -> None:
    c = cloud()
    setup(c)
    run(CHECK, c)
    assert not c.ops("TerminateInstances") and not c.ops("RunInstances")
    assert not c.alerts()
    out = capsys.readouterr().out.splitlines()
    assert len(out) == 1 and "_aws" not in json.loads(out[0]), (
        "one plain line, no metric"
    )


def test_a_capacity_stop_of_ten_minutes_replaces_the_tunnel_end_then_starts_ec2(
    capsys: pytest.CaptureFixture[str],
) -> None:
    c = cloud()
    stop_tunnel(c, "instance-stopped-no-capacity", 600)
    run(CHECK, c)
    (tunnel,) = c.live("h4-prod-tunnel-end")
    assert tunnel["InstanceType"] == "c7g.medium"
    assert c.volumes["vol-ss"]["on"] == tunnel["InstanceId"]
    assert c.origin_arn == Cloud.arn(tunnel["InstanceId"])
    back, ec2 = c.alerts()
    assert back.startswith("[hareet.ai aws] tunnel_end_back: ")
    f = facts(back)
    assert (f["trigger"], f["type"], f["origin"]) == (
        "tunnel_end_check",
        "c7g.medium",
        "re-pointed",
    )
    assert f["replaced"] == "t4g.small instance-stopped-no-capacity"
    assert ACCOUNT not in back and tunnel["InstanceId"] not in back
    assert ec2.startswith("[hareet.ai aws] ec2_started: ")
    assert facts(ec2)["trigger"] == "tunnel_end_back"
    lines = emf(capsys)
    assert [(x["Outcome"], x["Trigger"]) for x in lines] == [
        ("tunnel_end_replaced", "tunnel_end_check"),
        ("started", "tunnel_end_back"),
    ]


def test_no_tunnel_end_is_launched_from_the_top() -> None:
    c = cloud()
    del c.instances[OLD_TUNNEL]
    c.volumes["vol-ss"]["on"] = None
    run(CHECK, c)
    (tunnel,) = c.live("h4-prod-tunnel-end")
    assert tunnel["InstanceType"] == "t4g.small"
    assert not c.ops("TerminateInstances")


def test_a_refused_re_point_is_alerted_and_the_replace_stands() -> None:
    c = cloud()
    stop_tunnel(c, "instance-stopped-no-capacity", 900)
    c.refuse["UpdateVpcOrigin"] = start.AwsError("IllegalUpdate")
    run(CHECK, c)
    assert c.live("h4-prod-tunnel-end")[0]["InstanceType"] == "c7g.medium"
    assert facts(c.alerts()[0])["origin"] == "IllegalUpdate"


def test_an_origin_that_already_names_the_new_instance_isnt_updated() -> None:
    c = cloud()
    stop_tunnel(c, "instance-stopped-no-capacity", 900)
    # The fake's first new instance's ID, which the origin already names.
    c.origin_arn = Cloud.arn(f"i-0new{1:012d}")
    run(CHECK, c)
    assert not c.ops("UpdateVpcOrigin")
    assert facts(c.alerts()[0])["origin"] == "unchanged"


def test_a_tunnel_end_no_type_can_replace_is_tunnel_end_down_and_ec2_isnt_tried() -> (
    None
):
    c = cloud()
    stop_tunnel(c, "instance-stopped-no-capacity", 900)
    c.short = set(TUNNEL_TYPES)
    run(CHECK, c)
    (alert,) = c.alerts()
    assert alert.startswith("[hareet.ai aws] ec2_start_refused (tunnel_end_down): ")
    f = facts(alert)
    assert f["tunnel_end"] == "not replaced"
    assert f["code"] == "no_capacity"
    assert not c.ops("StartInstances")


def test_the_checks_busy_isnt_alerted() -> None:
    c = cloud()
    stop_tunnel(c, "instance-stopped-no-capacity", 900)
    c.params["/h4reet/prod/host-lock"] = f"{int(INSIDE.timestamp())} manual"
    run(CHECK, c)
    assert not c.alerts()
    assert not c.ops("TerminateInstances")


def test_a_hand_replace_of_the_tunnel_end_needs_no_check_and_skips_by_hand() -> None:
    c = cloud(OUTSIDE)
    run(
        {"manual": True, "replace": "tunnel_end", "skip": ["t4g.small", "c7g.medium"]},
        c,
    )
    (tunnel,) = c.live("h4-prod-tunnel-end")
    assert tunnel["InstanceType"] == "c6g.medium"
    # EC2's start after it runs its checks: outside the hours, refused.
    assert facts(c.alerts()[1])["trigger"] == "tunnel_end_back"
    assert c.alerts()[1].startswith(
        "[hareet.ai aws] ec2_start_refused (outside_hours): "
    )


def test_the_waits_poll_and_end() -> None:
    c = cloud()
    c.short = {"t4g.large"}
    run(ALARM, c)
    assert 0 < c.clock.slept <= 2 * start.WAIT_S


def test_a_wait_that_never_ends_refuses_and_releases_the_lock() -> None:
    c = cloud()
    c.short = {"t4g.large"}
    original = c.ec2_TerminateInstances

    def stuck(InstanceIds):
        original(InstanceIds)
        for i in InstanceIds:
            c.instances[i]["State"]["Name"] = "stopping"  # never terminated

    c.ec2_TerminateInstances = stuck  # type: ignore[method-assign]
    result = run(ALARM, c)
    assert result["reason"] == "start_failed"
    assert facts(c.alerts()[0])["code"] == "wait_timeout"
    assert not c.ops("RunInstances")
    assert "/h4reet/prod/host-lock" not in c.params
