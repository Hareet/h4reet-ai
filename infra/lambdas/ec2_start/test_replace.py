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


class TwoHosts(BaseException):
    """A second live instance of a host: a BaseException, so the handler's catch-all can't swallow it."""


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
        # Types whose dry run IAM refuses; instances that never leave pending or shutting-down.
        self.dry_refused: set[str] = set()
        self.stuck: set[str] = set()
        # RunInstances' client tokens, each with the instance its first launch made: a launch sent again with the
        # same token answers that instance, as EC2 does (fix/032-launch-policy).
        self.tokens: dict[str, str] = {}

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
            if i["State"]["Name"] != "terminated"
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
            # A pending instance runs, and a terminating one is gone, at the next look; only then are its volume and
            # its address free, as on AWS.
            out.append(json.loads(json.dumps(i)))
            if i["InstanceId"] in self.stuck:
                continue
            if i["State"]["Name"] == "pending":
                i["State"]["Name"] = "running"
            elif i["State"]["Name"] == "shutting-down":
                i["State"]["Name"] = "terminated"
                for v in self.volumes.values():
                    if v["on"] == i["InstanceId"]:
                        v["on"] = None
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
        return {}

    def ec2_RunInstances(
        self, LaunchTemplate, MinCount, MaxCount, DryRun=False, ClientToken=None
    ) -> dict:
        assert (MinCount, MaxCount) == (1, 1)
        assert LaunchTemplate["Version"] == "$Default"
        kind = self.templates[LaunchTemplate["LaunchTemplateId"]]
        if DryRun:
            raise start.AwsError(
                "UnauthorizedOperation"
                if kind in self.dry_refused
                else "DryRunOperation"
            )
        if ClientToken is not None and ClientToken in self.tokens:
            again = self.instances[self.tokens[ClientToken]]
            return {
                "Instances": [{"InstanceId": again["InstanceId"], "InstanceType": kind}]
            }
        name = "h4-prod-tunnel-end" if kind in TUNNEL_TYPES else "h4-prod-ec2"
        if self.live(name):
            raise TwoHosts(f"a second {name} would run")
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
        if ClientToken is not None:
            self.tokens[ClientToken] = iid
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
        if self.volumes[VolumeId]["on"] is not None:
            raise TwoHosts("attached while still on another")
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
        "DryRun" if p.get("DryRun") else o
        for _, o, p in c.calls
        if o
        in (
            "CancelSpotInstanceRequests",
            "TerminateInstances",
            "RunInstances",
            "AttachVolume",
        )
    ]
    # Spec 032's rework: every candidate's dry run before anything is cancelled or terminated.
    assert order == [
        "DryRun",
        "DryRun",
        "DryRun",
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
        if not p.get("DryRun")
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
    real = c.ec2_RunInstances

    # Changed on fix/032-launch-policy: a launch carries its client token too, which this passes on.
    def launch(LaunchTemplate, MinCount, MaxCount, DryRun=False, **more):
        if not DryRun:
            raise start.AwsError("UnauthorizedOperation")
        return real(LaunchTemplate, MinCount, MaxCount, DryRun, **more)

    c.ec2_RunInstances = launch  # type: ignore[method-assign]
    result = run(ALARM, c)
    assert result["reason"] == "start_failed"
    assert len([p for p in c.ops("RunInstances") if not p.get("DryRun")]) == 1
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


def test_a_stopped_instance_of_an_earlier_generation_is_replaced_from_the_top() -> None:
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


# fix/032-launch-policy: the Author's ec2_ops.py tells a busy refusal from a failed start by the result's code, since
# busy sends no alert to say why.
def test_a_refusal_returns_its_code_to_the_hand_start() -> None:
    c = cloud()
    c.params["/h4reet/prod/host-lock"] = f"{int(INSIDE.timestamp()) - 60} hours_open"
    result = run({"manual": True, "replace": "ec2", "skip": []}, c)
    assert (result["reason"], result["code"]) == ("start_failed", "busy")
    c = cloud()
    c.short = set(EC2_TYPES)
    assert run(ALARM, c)["code"] == "no_capacity"
    assert "code" not in run(ALARM, cloud())


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
    assert not c.ops("TerminateInstances")
    assert all(p.get("DryRun") for p in c.ops("RunInstances"))
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
    assert not c.ops("UpdateVpcOrigin") and not c.ops("AttachVolume")
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
    assert not [p for p in c.ops("RunInstances") if not p.get("DryRun")]
    assert "/h4reet/prod/host-lock" not in c.params


# ----------------------------------------------------------------------------------------------------------------------
# The rework after the reviews of 52308132: a replace that fails part-way is repaired by the next trigger; nothing is
# terminated before a dry run proves each launch; the waits end inside the function's time; generations move only a
# stopped EC2.


def test_a_refused_id_write_is_repaired_by_the_next_trigger_without_a_second_launch() -> (
    None
):
    c = cloud()
    c.short = {"t4g.large"}
    c.refuse["PutParameter"] = start.AwsError("ThrottlingException")  # the lock's write
    real = c.ssm_PutParameter
    failed = []

    def put(Name, Value, Type, Overwrite):
        if Name == "/h4reet/prod/ec2-instance-id" and not failed:
            failed.append(Name)
            raise start.AwsError("ThrottlingException")
        return real(Name=Name, Value=Value, Type=Type, Overwrite=Overwrite)

    c.refuse.clear()
    c.ssm_PutParameter = put  # type: ignore[method-assign]
    first = run(ALARM, c)
    assert first["reason"] == "start_failed"
    assert facts(c.alerts()[-1])["step"] == "parameter"
    (orphan,) = c.live("h4-prod-ec2")
    c.short = set()
    second = run(ALARM, c)
    assert second["outcome"] == "started", second
    assert c.live("h4-prod-ec2") == [orphan], "adopted, never launched again"
    assert c.params["/h4reet/prod/ec2-instance-id"] == orphan["InstanceId"]
    assert c.volumes["vol-ec2"]["on"] == orphan["InstanceId"]
    assert len([p for p in c.ops("RunInstances") if not p.get("DryRun")]) == 1


def test_a_refused_attach_is_repaired_before_the_next_start() -> None:
    c = cloud()
    c.short = {"t4g.large"}
    c.refuse["AttachVolume"] = start.AwsError("IncorrectState")
    first = run(ALARM, c)
    assert first["reason"] == "start_failed"
    assert facts(c.alerts()[-1])["step"] == "attach"
    new = ec2_now(c)
    assert c.volumes["vol-ec2"]["on"] is None
    new["State"]["Name"] = "stopped"  # the guard's close
    second = run({"from": "hours_open"}, c)
    assert second["outcome"] == "started"
    assert c.volumes["vol-ec2"]["on"] == new["InstanceId"]
    starts = [i for i, (_, o, _) in enumerate(c.calls) if o == "StartInstances"]
    attach = [i for i, (_, o, _) in enumerate(c.calls) if o == "AttachVolume"]
    assert attach[-1] < starts[-1], "attached before the start"


def test_a_launch_that_never_runs_is_repaired_by_the_next_trigger() -> None:
    c = cloud()
    c.short = {"t4g.large"}
    c.stuck.add(f"i-0new{1:012d}")
    first = run(ALARM, c)
    assert first["reason"] == "start_failed"
    f = facts(c.alerts()[-1])
    assert (f["code"], f["step"]) == ("wait_timeout", "run")
    new = ec2_now(c)
    assert c.params["/h4reet/prod/ec2-instance-id"] == new["InstanceId"]
    c.stuck.clear()
    new["State"]["Name"] = "stopped"  # the guard stopped it mid-replace
    assert run(ALARM, c)["outcome"] == "started"
    assert c.volumes["vol-ec2"]["on"] == new["InstanceId"]
    assert len([p for p in c.ops("RunInstances") if not p.get("DryRun")]) == 1


def test_two_tagged_instances_and_a_gone_named_one_launch_nothing() -> None:
    c = cloud()
    del c.instances[OLD_EC2]
    c.volumes["vol-ec2"]["on"] = None
    c.add(
        "i-0" + "11" * 8,
        "h4-prod-ec2",
        "t4g.large",
        "stopped",
        "instance-stopped-by-user",
    )
    c.add(
        "i-0" + "22" * 8,
        "h4-prod-ec2",
        "m7g.large",
        "stopped",
        "instance-stopped-by-user",
    )
    result = run(ALARM, c)
    assert result["reason"] == "start_failed"
    assert facts(c.alerts()[0])["code"] == "two_instances"
    assert not c.ops("RunInstances") and not c.ops("StartInstances")


def test_a_refused_dry_run_terminates_nothing() -> None:
    c = cloud()
    c.short = {"t4g.large"}
    c.dry_refused = set(EC2_TYPES)
    result = run(ALARM, c)
    assert result["reason"] == "start_failed"
    f = facts(c.alerts()[0])
    assert (f["code"], f["step"]) == ("UnauthorizedOperation", "dry_run")
    assert not c.ops("CancelSpotInstanceRequests") and not c.ops("TerminateInstances")
    assert c.instances[OLD_EC2]["State"]["Name"] == "stopped"
    assert "/h4reet/prod/host-lock" not in c.params


def test_a_type_whose_dry_run_is_refused_is_passed_over() -> None:
    c = cloud()
    c.short = {"t4g.large"}
    c.dry_refused = {"m7g.large"}
    run(ALARM, c)
    assert ec2_now(c)["InstanceType"] == "m6g.large"
    assert "m7g.large dry_run:UnauthorizedOperation" in facts(c.alerts()[0])["tried"]


def test_a_hand_dry_run_launches_nothing_and_reports_each_type() -> None:
    c = cloud(OUTSIDE)
    c.dry_refused = {"t4g.xlarge"}
    result = run({"manual": True, "replace": "ec2", "dry_run": True}, c)
    assert result["dry_run"] == {
        "t4g.large": "DryRunOperation",
        "m7g.large": "DryRunOperation",
        "m6g.large": "DryRunOperation",
        "t4g.xlarge": "UnauthorizedOperation",
    }
    assert result["outcome"] == "refused"
    assert not c.ops("TerminateInstances") and not c.alerts()
    assert all(p.get("DryRun") for p in c.ops("RunInstances"))


# fix/032-launch-policy: on 2026-11-22 every dry run was refused UnauthorizedOperation, and CloudTrail cut AWS's encoded
# message at 1,024 characters, so it couldn't be decoded. The function now logs AWS's whole message for that code, so
# the next refusal decodes in one step (aws sts decode-authorization-message); never in an alert or the result.
ENCODED = "AbC-" + "x" * 2000
REFUSAL = (
    "You are not authorized to perform this operation. User: arn:aws:sts::"
    f"{ACCOUNT}:assumed-role/h4-ec2-start-fn/h4-ec2-start is not authorized to perform: "
    "ec2:RunInstances on resource: arn:aws:ec2:us-east-1:"
    f"{ACCOUNT}:spot-instances-request/* because no identity-based policy allows the "
    f"ec2:RunInstances action. Encoded authorization failure message: {ENCODED}"
)


def refusals(out: str) -> list[dict]:
    return [d for d in (json.loads(x) for x in out.splitlines()) if "message" in d]


def refuse_with_the_message(c: Cloud, kinds: set[str], dry: bool) -> None:
    real = c.ec2_RunInstances

    def launch(LaunchTemplate, MinCount, MaxCount, DryRun=False, **more):
        kind = c.templates[LaunchTemplate["LaunchTemplateId"]]
        if kind in kinds and DryRun is dry:
            raise start.AwsError("UnauthorizedOperation", REFUSAL)
        return real(LaunchTemplate, MinCount, MaxCount, DryRun, **more)

    c.ec2_RunInstances = launch  # type: ignore[method-assign]


def test_a_refused_dry_run_logs_aws_whole_message_and_alerts_its_code_alone(
    capsys: pytest.CaptureFixture[str],
) -> None:
    c = cloud()
    c.short = {"t4g.large"}
    refuse_with_the_message(c, set(EC2_TYPES), dry=True)
    result = run(ALARM, c)
    assert result["reason"] == "start_failed"
    out = capsys.readouterr().out
    logged = refusals(out)
    assert {d["type"] for d in logged} == set(EC2_TYPES) - {"t4g.large"}
    for d in logged:
        assert d["function"] == "h4-ec2-start"
        assert (d["op"], d["dry_run"], d["code"]) == (
            "RunInstances",
            True,
            "UnauthorizedOperation",
        )
        assert d["message"] == REFUSAL  # whole, never cut
        assert d["encoded"] == ENCODED  # what decode-authorization-message takes
    (alert,) = c.alerts()
    assert facts(alert)["code"] == "UnauthorizedOperation"
    assert ENCODED not in alert and "not authorized" not in alert
    assert ENCODED not in json.dumps(result)
    for line in out.splitlines():
        if "_aws" in json.loads(line):
            assert ENCODED not in line


def test_a_hand_dry_run_logs_the_message_and_returns_codes_alone(
    capsys: pytest.CaptureFixture[str],
) -> None:
    c = cloud(OUTSIDE)
    refuse_with_the_message(c, {"m7g.large"}, dry=True)
    result = run({"manual": True, "replace": "ec2", "dry_run": True}, c)
    assert result["dry_run"]["m7g.large"] == "UnauthorizedOperation"
    assert ENCODED not in json.dumps(result)
    (logged,) = refusals(capsys.readouterr().out)
    assert (logged["type"], logged["encoded"]) == ("m7g.large", ENCODED)
    assert not c.alerts()


def test_a_refused_launch_logs_the_message_too(
    capsys: pytest.CaptureFixture[str],
) -> None:
    c = cloud()
    c.short = {"t4g.large"}
    refuse_with_the_message(c, {"m7g.large"}, dry=False)
    assert run(ALARM, c)["reason"] == "start_failed"
    (logged,) = refusals(capsys.readouterr().out)
    assert (logged["type"], logged["dry_run"], logged["message"]) == (
        "m7g.large",
        False,
        REFUSAL,
    )
    assert ENCODED not in c.alerts()[0]


def test_another_code_keeps_no_message(capsys: pytest.CaptureFixture[str]) -> None:
    c = cloud()
    c.short = set(EC2_TYPES)
    run(ALARM, c)
    assert refusals(capsys.readouterr().out) == []


class _ClientError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(code)
        self.response = {"Error": {"Code": code, "Message": message}}


def _boto(monkeypatch: pytest.MonkeyPatch, error: Exception) -> list[dict]:
    """The runtime's SDK, as far as BotoAws reaches it: a session whose EC2 client raises `error`. Returns each client's
    arguments as BotoAws made it, its config's as a dict."""
    import types

    made: list[dict] = []

    class Config:
        def __init__(self, **kwargs: object) -> None:
            self.kwargs = kwargs

    class Client:
        def run_instances(self, **_: object) -> dict:
            raise error

    class Session:
        def __init__(self, region_name: str) -> None:
            pass

        def client(
            self, service: str, region_name: str, config: Config | None = None
        ) -> Client:
            made.append(
                {
                    "service": service,
                    "config": config.kwargs if config is not None else None,
                }
            )
            return Client()

    boto3 = types.ModuleType("boto3")
    boto3.session = types.SimpleNamespace(Session=Session)  # type: ignore[attr-defined]
    exceptions = types.ModuleType("botocore.exceptions")
    exceptions.ClientError = _ClientError  # type: ignore[attr-defined]
    exceptions.BotoCoreError = type("BotoCoreError", (Exception,), {})  # type: ignore[attr-defined]
    config = types.ModuleType("botocore.config")
    config.Config = Config  # type: ignore[attr-defined]
    botocore = types.ModuleType("botocore")
    botocore.exceptions = exceptions  # type: ignore[attr-defined]
    botocore.config = config  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "boto3", boto3)
    monkeypatch.setitem(sys.modules, "botocore", botocore)
    monkeypatch.setitem(sys.modules, "botocore.exceptions", exceptions)
    monkeypatch.setitem(sys.modules, "botocore.config", config)
    return made


# fix/032-launch-policy, from the first real replace on AWS (2026-11-22): boto's defaults (60 s to connect and to read,
# and several retries) let a stalled call eat minutes outside the waits' caps, and the function died at its 900 s limit
# between the cancel and the terminate. Every client gets short timeouts and few attempts.
def test_the_sdk_wrapper_uses_short_timeouts_and_few_attempts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    made = _boto(monkeypatch, _ClientError("DryRunOperation", "ok"))
    with pytest.raises(start.AwsError):
        start.BotoAws().call("ec2", "RunInstances", DryRun=True)
    (client,) = made
    assert client["config"] == {
        "connect_timeout": 5,
        "read_timeout": 20,
        "retries": {"max_attempts": 3, "mode": "standard"},
    }
    # One call's worst case at one attempt fits the budget the function keeps for it.
    assert start.CALL_S >= 5 + 20


# The same review: BotoAws built a new client, loading the service's model again, at every call (setdefault evaluates
# its default first), which at 128 MB cost seconds a call. One client a service.
def test_the_sdk_wrapper_makes_one_client_a_service(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    made = _boto(monkeypatch, _ClientError("DryRunOperation", "ok"))
    aws = start.BotoAws()
    for _ in range(3):
        with pytest.raises(start.AwsError):
            aws.call("ec2", "RunInstances", DryRun=True)
    assert [m["service"] for m in made] == ["ec2"]


def test_the_sdk_wrapper_keeps_an_unauthorized_operations_message(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _boto(monkeypatch, _ClientError("UnauthorizedOperation", REFUSAL))
    with pytest.raises(start.AwsError) as raised:
        start.BotoAws().call("ec2", "RunInstances", DryRun=True)
    assert (raised.value.code, raised.value.message) == (
        "UnauthorizedOperation",
        REFUSAL,
    )
    assert str(raised.value) == "UnauthorizedOperation"  # the code alone, as before


def test_the_sdk_wrapper_keeps_no_other_codes_message(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _boto(monkeypatch, _ClientError("InsufficientInstanceCapacity", "in us-east-1a"))
    with pytest.raises(start.AwsError) as raised:
        start.BotoAws().call("ec2", "RunInstances")
    assert (raised.value.code, raised.value.message) == (
        "InsufficientInstanceCapacity",
        None,
    )


def test_a_running_instance_of_an_earlier_generation_isnt_replaced() -> None:
    c = cloud()
    c.instances[OLD_EC2]["Tags"].append(
        {"Key": "aws:ec2launchtemplate:id", "Value": "lt-gone"}
    )
    c.instances[OLD_EC2]["State"]["Name"] = "running"
    assert run(ALARM, c)["outcome"] == "started"
    assert not c.ops("TerminateInstances")


def test_unsupported_on_a_start_refuses_and_terminates_nothing() -> None:
    c = cloud()
    c.refuse["StartInstances"] = start.AwsError("Unsupported")
    assert run(ALARM, c)["reason"] == "start_failed"
    assert c.instances[OLD_EC2]["State"]["Name"] == "stopped"


class Short(Context):
    """Lambda's context with 200 s left: the waits must end by then, less the margin, never by Lambda's kill."""

    def get_remaining_time_in_millis(self) -> int:
        return 200_000


def test_the_waits_end_inside_the_functions_time() -> None:
    c = cloud()
    c.short = {"t4g.large"}
    original = c.ec2_TerminateInstances

    def stuck(InstanceIds):
        original(InstanceIds)
        c.stuck.update(InstanceIds)

    c.ec2_TerminateInstances = stuck  # type: ignore[method-assign]
    result = start.handler(ALARM, Short(), aws=c, now=c.clock.now, sleep=c.clock.sleep)
    assert result["reason"] == "start_failed"
    assert facts(c.alerts()[0])["code"] == "wait_timeout"
    assert c.clock.slept <= 200 - start.MARGIN_S


# fix/032-launch-policy, from the first real replace on AWS (2026-11-22): the dry runs took up to 40 s each, a call
# stalled for minutes, and the function was killed at 900 s after cancelling EC2's request (which terminated it) and
# before the terminate, the launch, or the attach. A step starts only when the run's time left can cover it.
def slow(c: Cloud, dry_s: float = 0, launch_left_s: float | None = None) -> None:
    """Each dry run takes dry_s; the real launch leaves launch_left_s of the run's time (840 s from INSIDE)."""
    real = c.ec2_RunInstances

    def launch(LaunchTemplate, MinCount, MaxCount, DryRun=False, **more):
        try:
            return real(LaunchTemplate, MinCount, MaxCount, DryRun, **more)
        finally:
            if DryRun:
                c.clock.at += timedelta(seconds=dry_s)
            elif launch_left_s is not None:
                c.clock.at = INSIDE + timedelta(seconds=start.BUDGET_S - launch_left_s)

    c.ec2_RunInstances = launch  # type: ignore[method-assign]


def test_too_little_time_after_the_dry_runs_cancels_nothing() -> None:
    c = cloud()
    c.short = {"t4g.large"}
    slow(c, dry_s=200)  # three dry runs: 600 s of 840
    result = run(ALARM, c)
    assert result["reason"] == "start_failed"
    f = facts(c.alerts()[0])
    assert (f["code"], f["step"]) == ("wait_timeout", "cancel")
    assert not c.ops("CancelSpotInstanceRequests") and not c.ops("TerminateInstances")
    assert c.instances[OLD_EC2]["State"]["Name"] == "stopped"
    assert c.params["/h4reet/prod/ec2-instance-id"] == OLD_EC2
    assert "/h4reet/prod/host-lock" not in c.params


def test_a_dry_run_the_time_left_cant_cover_isnt_sent() -> None:
    c = cloud()
    c.short = {"t4g.large"}
    slow(c, dry_s=420)
    run(ALARM, c)
    assert len([p for p in c.ops("RunInstances") if p.get("DryRun")]) == 2
    assert facts(c.alerts()[0])["code"] == "wait_timeout"
    assert not c.ops("TerminateInstances")


def test_after_a_launch_with_too_little_time_only_the_id_is_written() -> None:
    c = cloud()
    c.short = {"t4g.large"}
    slow(c, launch_left_s=10)
    result = run(ALARM, c)
    assert result["reason"] == "start_failed"
    f = facts(c.alerts()[0])
    assert (f["code"], f["step"]) == ("wait_timeout", "run")
    (new,) = c.live("h4-prod-ec2")
    # The new ID is written, so the next trigger finds it and attaches its volume (the repair).
    assert c.params["/h4reet/prod/ec2-instance-id"] == new["InstanceId"]
    launched = max(
        i
        for i, (_, o, p) in enumerate(c.calls)
        if o == "RunInstances" and not p.get("DryRun")
    )
    after = [o for _, o, _ in c.calls[launched + 1 :]]
    assert "DescribeInstances" not in after and "AttachVolume" not in after
    assert "/h4reet/prod/host-lock" not in c.params


# fix/032-launch-policy: with retries on and a 20 s read timeout, a launch that succeeded at EC2 but whose answer was
# lost is sent again. Without a client token the second would launch another instance, which EC2's fixed address or the
# tunnel end's interfaces refuse (InvalidIPAddress.InUse), and the run would refuse while the first ran unrecorded.
# With one, EC2 answers the same instance. The token is the same for one replace attempt, of its host and type, and at
# most 64 ASCII characters; a dry run carries none.
class Resent:
    """AWS whose answer to the first real launch is lost, so the launch is sent again as it was (the SDK's retry)."""

    def __init__(self, c: Cloud) -> None:
        self.c = c
        self.lost = False

    def call(self, service: str, op: str, **p: object) -> dict:
        if op == "RunInstances" and not p.get("DryRun") and not self.lost:
            self.lost = True
            self.c.call(service, op, **p)  # it ran at EC2; its answer never came back
        return self.c.call(service, op, **p)


@pytest.mark.parametrize(
    ("event", "host", "name", "short"),
    [
        (ALARM, "ec2", "h4-prod-ec2", {"t4g.large"}),
        (
            {"manual": True, "replace": "tunnel_end", "skip": []},
            "tunnel_end",
            "h4-prod-tunnel-end",
            set(),
        ),
    ],
)
def test_a_launch_sent_again_after_a_lost_answer_is_the_same_instance(
    event: dict, host: str, name: str, short: set[str]
) -> None:
    c = cloud()
    c.short = short
    result = start.handler(
        event, Context(), aws=Resent(c), now=c.clock.now, sleep=c.clock.sleep
    )
    assert result["outcome"] == "started", result
    (one,) = c.live(name)
    launches = [p for p in c.ops("RunInstances") if not p.get("DryRun")]
    assert len(launches) == 2
    tokens = {p.get("ClientToken") for p in launches}
    (token,) = tokens
    assert isinstance(token, str) and 0 < len(token) <= 64 and token.isascii()
    assert host in token and one["InstanceType"] in token
    assert c.count == 1  # one instance launched, answered twice
    if host == "ec2":
        assert c.params["/h4reet/prod/ec2-instance-id"] == one["InstanceId"]


def test_each_launch_of_a_replace_has_its_own_types_token_and_a_dry_run_none() -> None:
    c = cloud()
    c.short = {"t4g.large", "m7g.large"}
    assert run(ALARM, c)["outcome"] == "started"
    dry = [p for p in c.ops("RunInstances") if p.get("DryRun")]
    assert dry and all("ClientToken" not in p for p in dry)
    launches = [p for p in c.ops("RunInstances") if not p.get("DryRun")]
    tokens = [p["ClientToken"] for p in launches]
    # m7g.large was short, then m6g.large launched: one token each, from the same replace.
    assert len(launches) == 2 and len(set(tokens)) == 2
    assert "m7g.large" in tokens[0] and "m6g.large" in tokens[1]
    assert tokens[0].rsplit("-", 1)[1] == tokens[1].rsplit("-", 1)[1]
    # A later replace gets another token for the same type.
    c2 = cloud(INSIDE + timedelta(minutes=30))
    c2.short = {"t4g.large", "m7g.large"}
    run(ALARM, c2)
    later = [p["ClientToken"] for p in c2.ops("RunInstances") if not p.get("DryRun")]
    assert later[0] != tokens[0]


def test_a_tunnel_end_left_without_its_volume_and_origin_is_repaired_by_the_next_check() -> (
    None
):
    c = cloud()
    stop_tunnel(c, "instance-stopped-no-capacity", 900)
    c.refuse["AttachVolume"] = start.AwsError("IncorrectState")
    run(CHECK, c)
    (tunnel,) = c.live("h4-prod-tunnel-end")
    assert c.volumes["vol-ss"]["on"] is None and c.origin_arn != Cloud.arn(
        tunnel["InstanceId"]
    )
    assert c.alerts()[0].startswith(
        "[hareet.ai aws] ec2_start_refused (tunnel_end_down): "
    )
    assert facts(c.alerts()[0])["step"] == "attach"
    before = len(c.alerts())
    run(CHECK, c)
    assert c.volumes["vol-ss"]["on"] == tunnel["InstanceId"]
    assert c.origin_arn == Cloud.arn(tunnel["InstanceId"])
    repaired = c.alerts()[before]
    assert repaired.startswith("[hareet.ai aws] tunnel_end_back: ")
    assert facts(repaired)["repaired"] == "volume, origin"


def test_a_tunnel_end_replace_after_the_server_action_still_runs() -> None:
    # The server action stops EC2 alone (spec 001 FR-023): the tunnel end keeps every host's path, so its check replaces
    # it whatever the server budget says; EC2's start after it refuses as always.
    c = cloud()
    c.budget = "EXECUTION_SUCCESS"
    stop_tunnel(c, "instance-stopped-no-capacity", 900)
    run(CHECK, c)
    assert c.live("h4-prod-tunnel-end")[0]["InstanceType"] == "c7g.medium"
    assert c.alerts()[1].startswith(
        "[hareet.ai aws] ec2_start_refused (server_budget_stopped): "
    )
