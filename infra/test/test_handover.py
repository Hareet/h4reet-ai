"""Spec 001 group 9, the handover (tasks.md T119, T124; FR-012, FR-054, FR-063 to FR-065, FR-069 to FR-072;
contracts/handover.md §1 to §5 and §7; contracts/aws-alerts.md §2; research.md R-15, R-29, R-30; plan.md §16, "Four
gates", "Why a switch", and "No root holds another root's instance or health-check ID"; ADR 0048 and ADR 0049,
proposed), read with group 1's standard-library HCL reader, never with Terraform.

What prod must hold, in protected files (P-I6):
  - failover.tf: the health check, HTTP on the tunnel end's Elastic IP, 8087, /health, threshold 3; and h4-laptop-away,
    its alarm, Minimum of HealthCheckStatus below 1 over one minute, missing data breaching. Neither switched;
  - handover.tf: h4-ec2-spot-warning to h4-alerts as spot_interruption, and h4-ec2-running, each naming EC2 from this
    root, neither switched; h4-ec2-running's one target, h4-ec2-guard by its name-built ARN, and h4-tunnel-end-running's
    second, h4-ec2-start `from: tunnel_end_back`, each behind prod's local.wired;
  - iam.tf: the tunnel end's dashboard reads and its one-key write (test_prod_network.py's check_role holds them).

What the account must hold (P-I6):
  - handover.tf: local.ec2_hours, the hours' one source (provisional: question 1a, recommended option A, America/Denver,
    07:00 to 19:00, until the Author's answer); the autostart switch, made "off", its value ignored; the two functions'
    log groups; and behind the account's local.wired, the two functions with H4_EC2_HOURS from the local, their retries
    off, their three permissions, h4-laptop-away-rule matching the alarm by its name, and the hours' two schedules in
    the local's zone;
  - iam.tf: h4-ec2-start-fn, h4-ec2-guard-fn, and h4-ec2-hours, each holding exactly its grants, and the Author's
    h4-ec2-stop permission set, on the tag;
  - main.tf and registry.tf: the two functions' digests, empty until W2, and their repositories (test_account.py).

From spec 032 (its FR-015, FR-016; ADR 0057) prod's rules name EC2 by the instance this root reads by its tag
(data.aws_instance.ec2), since h4-ec2-start may replace it with another type; h4-ec2-start-fn may also launch a host
from its tagged launch templates, retire the old one, attach its volume, write EC2's ID and the lock, and point the
relay's VPC origin at a new tunnel end, each action held to its condition; and the account holds a third schedule,
h4-tunnel-end-check, every 5 minutes.

Nothing under infra/account names a prod instance or health check, or reads prod's state. Every check passes with the
switches off, as W1 holds them, and on, as P-W2 sets them. What a check can't read as a literal is a finding, never
empty. Each fixture in fixtures/handover/ is one defect, in the root its `# root:` line names.
"""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
FIXTURES = HERE / "fixtures" / "handover"


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


if not (REPO / "tools" / "gates" / "infra_policy.py").is_file():
    pytest.skip("PLANNED (T010): the reader arrives with P-1", allow_module_level=True)

net = _load("prod_network_for_handover", HERE / "test_prod_network.py")
ip = net.ip
lit, raw, one, resource, blocks, address, where = (
    net.lit,
    net.raw,
    net.one,
    net.resource,
    net.blocks,
    net.address,
    net.where,
)

ACCOUNT_ID = "${data.aws_caller_identity.current.account_id}"
TOPIC_ARN = f"arn:aws:sns:us-east-1:{ACCOUNT_ID}:h4-alerts"
WIRED = "local.wired ? 1 : 0"
# Provisional: question 1a, recommended option A, until the Author's answer. Option B is "Etc/GMT+7". A different
# answer changes this line and local.ec2_hours's zone in P-I6, and nothing else here.
PROVISIONAL_ZONE = "America/Denver"
ZONES = {"America/Denver", "Etc/GMT+7"}
HOURS_VALUE = (
    '"${local.ec2_hours.zone} ${local.ec2_hours.open}-${local.ec2_hours.close}"'
)


def function_arn(name: str) -> str:
    return f"arn:aws:lambda:us-east-1:{ACCOUNT_ID}:function:{name}"


def rule_arn(name: str) -> str:
    return f"arn:aws:events:us-east-1:{ACCOUNT_ID}:rule/{name}"


def parameter_arn(path: str) -> str:
    return f"arn:aws:ssm:us-east-1:{ACCOUNT_ID}:parameter{path}"


ALARM_ARN = f"arn:aws:cloudwatch:us-east-1:{ACCOUNT_ID}:alarm:h4-laptop-away"
BUDGET_ARN = f"arn:aws:budgets::{ACCOUNT_ID}:budget/h4-server-month"
INSTANCES = f"arn:aws:ec2:us-east-1:{ACCOUNT_ID}:instance/*"
TAGGED = [("StringEquals", "ec2:ResourceTag/Name", '["h4-prod-ec2"]')]
SWITCHES = (
    f'[ "{parameter_arn("/h4reet/prod/ec2-autostart")}", '
    f'"{parameter_arn("/h4reet/prod/ec2-instance-id")}", ]'
)


def prod() -> dict[str, list]:
    return net.parsed(net.root_texts())


def account() -> dict[str, list]:
    return net.parsed(net.account_texts())


def named(root: dict[str, list], rtype: str, name: str, key: str = "name") -> list:
    return [b for b in resource(root, rtype) if lit(b, key) == name]


def targets_of(root: dict[str, list], rule) -> list:
    me = f"aws_cloudwatch_event_rule.{rule.labels[1]}"
    return [
        t
        for t in resource(root, "aws_cloudwatch_event_target")
        if raw(t, "rule") in (f"{me}.name", f"{me}[0].name")
    ]


def unswitched(block) -> bool:
    return block.attr("count") is None and block.attr("for_each") is None


def switched(block) -> bool:
    return raw(block, "count") == WIRED and block.attr("for_each") is None


def pattern(block) -> str:
    return raw(block, "event_pattern")


# ----------------------------------------------------------------------------------------------------------------------
# Prod's checks.


def check_health_check(root: dict[str, list]) -> list[str]:
    checks = resource(root, "aws_route53_health_check")
    if len(checks) != 1:
        return ["health check: prod doesn't hold exactly one Route 53 health check"]
    hc = checks[0]
    found = []
    if where(root, hc) != "failover.tf":
        found.append("health check: it lives outside failover.tf")
    want = {
        "type": "HTTP",
        "port": 8087,
        "resource_path": "/health",
        "failure_threshold": 3,
        "request_interval": 30,
    }
    if any(lit(hc, k) != v for k, v in want.items()):
        found.append(
            "health check: it isn't HTTP on 8087's /health, every 30 s, threshold 3"
        )
    if raw(hc, "ip_address") != "aws_eip.tunnel_end.public_ip":
        found.append("health check: it doesn't probe the tunnel end's Elastic IP")
    if not unswitched(hc):
        found.append(
            "health check: it waits behind a switch, though it needs no other root"
        )
    return found


def check_laptop_alarm(root: dict[str, list]) -> list[str]:
    alarms = named(root, "aws_cloudwatch_metric_alarm", "h4-laptop-away", "alarm_name")
    if len(alarms) != 1:
        return ["alarm: h4-laptop-away is missing"]
    a = alarms[0]
    found = []
    if where(root, a) != "failover.tf":
        found.append("alarm: it lives outside failover.tf, beside its check")
    want = {
        "namespace": "AWS/Route53",
        "metric_name": "HealthCheckStatus",
        "statistic": "Minimum",
        "period": 60,
        "evaluation_periods": 1,
        "threshold": 1,
        "comparison_operator": "LessThanThreshold",
        "treat_missing_data": "breaching",
    }
    if any(lit(a, k) != v for k, v in want.items()):
        found.append(
            "alarm: it isn't the minimum of HealthCheckStatus below 1 over a minute, missing data breaching"
        )
    checks = resource(root, "aws_route53_health_check")
    dims = raw(a, "dimensions")
    if len(checks) != 1 or (
        f"HealthCheckId = aws_route53_health_check.{checks[0].labels[1]}.id" not in dims
    ):
        found.append("alarm: its dimension isn't the health check's ID, from this root")
    if not unswitched(a):
        found.append("alarm: it waits behind a switch, though it needs no other root")
    return found


def check_ec2_warning(root: dict[str, list]) -> list[str]:
    rules = named(root, "aws_cloudwatch_event_rule", "h4-ec2-spot-warning")
    if len(rules) != 1:
        return ["ec2 warning: h4-ec2-spot-warning is missing"]
    rule = rules[0]
    found = []
    if where(root, rule) != "handover.tf":
        found.append("ec2 warning: the rule lives outside prod's handover.tf")
    p = pattern(rule)
    if not (
        '"aws.ec2"' in p
        and '"EC2 Spot Instance Interruption Warning"' in p
        and re.search(r"instance-id\s*=\s*\[data\.aws_instance\.ec2\.id\]", p)
    ):
        found.append(
            "ec2 warning: the rule doesn't match EC2's own warning, from this root"
        )
    if not unswitched(rule):
        found.append(
            "ec2 warning: the rule waits behind a switch, though it needs no other root"
        )
    targets = targets_of(root, rule)
    if len(targets) != 1 or raw(targets[0], "arn") != f'"{TOPIC_ARN}"':
        return [
            *found,
            "ec2 warning: its one target isn't h4-alerts, by its name-built ARN",
        ]
    transformer = targets[0].block("input_transformer")
    template = raw(transformer, "input_template") if transformer else ""
    if "[hareet.ai aws] spot_interruption:" not in template:
        found.append("ec2 warning: it doesn't publish spot_interruption in §2's format")
    if transformer is None or re.search(
        r"account|\$\.detail\.instance-id|\$\.resources",
        raw(transformer, "input_paths"),
    ):
        found.append(
            "ec2 warning: its message may carry the account or the instance's ID"
        )
    return found


def check_ec2_running(root: dict[str, list]) -> list[str]:
    rules = named(root, "aws_cloudwatch_event_rule", "h4-ec2-running")
    if len(rules) != 1:
        return ["ec2 running: h4-ec2-running is missing"]
    rule = rules[0]
    found = []
    if where(root, rule) != "handover.tf":
        found.append("ec2 running: the rule lives outside prod's handover.tf")
    p = pattern(rule)
    # Spec 032's rework: every instance entering running, so a replaced EC2 that AWS restarts is guarded before the
    # next prod apply; the guard acts on the instance tagged h4-prod-ec2 alone (infra/lambdas/ec2_guard/guard.py).
    if not (
        '"EC2 Instance State-change Notification"' in p
        and re.search(r'state\s*=\s*\["running"\]', p)
        and "instance-id" not in p
    ):
        found.append(
            "ec2 running: the rule doesn't match every instance entering running, which the guard sorts by tag"
        )
    if not unswitched(rule):
        found.append("ec2 running: the rule itself waits behind a switch")
    targets = targets_of(root, rule)
    if (
        len(targets) != 1
        or raw(targets[0], "arn") != f'"{function_arn("h4-ec2-guard")}"'
        or not switched(targets[0])
    ):
        found.append(
            "ec2 running: its one target isn't h4-ec2-guard, by its name-built ARN, behind the switch"
        )
    return found


def check_return_start(root: dict[str, list]) -> list[str]:
    rules = named(root, "aws_cloudwatch_event_rule", "h4-tunnel-end-running")
    if len(rules) != 1:
        return ["return: h4-tunnel-end-running is missing"]
    starts = [
        t
        for t in targets_of(root, rules[0])
        if raw(t, "arn") == f'"{function_arn("h4-ec2-start")}"'
    ]
    if (
        len(starts) != 1
        or not switched(starts[0])
        or re.sub(r"\s+", "", raw(starts[0], "input"))
        != 'jsonencode({from="tunnel_end_back"})'
    ):
        return [
            "return: no one h4-ec2-start target, `from: tunnel_end_back`, behind the switch"
        ]
    return []


PROD_CHECKS = (
    check_health_check,
    check_laptop_alarm,
    check_ec2_warning,
    check_ec2_running,
    check_return_start,
)


def prod_problems(root: dict[str, list]) -> list[str]:
    return [p for check in PROD_CHECKS for p in check(root)]


# ----------------------------------------------------------------------------------------------------------------------
# The account's checks.


def hours_local(root: dict[str, list]):
    homes = [
        (name, a)
        for name, body in root.items()
        for b in body
        if isinstance(b, ip.Block) and b.type == "locals"
        for a in b.body
        if isinstance(a, ip.Attribute) and a.name == "ec2_hours"
    ]
    return homes


def check_hours(root: dict[str, list]) -> list[str]:
    homes = hours_local(root)
    if [name for name, _ in homes] != ["handover.tf"]:
        return ["hours: local.ec2_hours isn't handover.tf's alone"]
    hours = ip.literal(homes[0][1])
    if not isinstance(hours, dict) or set(hours) != {"zone", "open", "close"}:
        return ["hours: local.ec2_hours isn't a literal zone, open, and close"]
    found = []
    if hours["zone"] not in ZONES:
        found.append("hours: its zone isn't one of question 1a's two")
    if (hours["open"], hours["close"]) != ("07:00", "19:00"):
        found.append("hours: they aren't the Author's 07:00 to 19:00")
    # Nothing else holds a copy: no other literal names the zone, in either root's files but this one's local.
    for name, body in root.items():
        for b in body:
            if not isinstance(b, ip.Block) or b.type == "locals":
                continue
            text = "\n".join(re.sub(r"\s+", " ", a.raw) for a in net._attributes(b))
            if any(z in text for z in ZONES):
                found.append(f"hours: {name}'s {address(b)} holds a copy of the zone")
    return found


def function_checks(
    root: dict[str, list], key: str, name: str, role_name: str
) -> list[str]:
    fns = named(root, "aws_lambda_function", name, "function_name")
    if len(fns) != 1 or fns[0].labels[1] != key:
        return [f"functions: {name} isn't aws_lambda_function.{key}"]
    fn = fns[0]
    found = []
    if where(root, fn) != "handover.tf":
        found.append(f"functions: {name} lives outside handover.tf")
    if not switched(fn):
        found.append(f"functions: {name} isn't behind the account's switch")
    if (
        lit(fn, "architectures") != ["arm64"]
        or lit(fn, "package_type") != "Image"
        or f'aws_ecr_repository.lambda["{name}"].repository_url'
        not in raw(fn, "image_uri")
        or f"@${{local.lambda_images.{key}}}" not in raw(fn, "image_uri")
    ):
        found.append(
            f"functions: {name} isn't its image on arm64, from its repository, by its digest"
        )
    life = fn.block("lifecycle")
    pre = life.block("precondition") if life else None
    if pre is None or re.sub(r"\s+", " ", raw(pre, "condition")) != (
        f'local.lambda_images.{key} != ""'
    ):
        found.append(f"functions: {name} may be made without its digest")
    roles = [
        r
        for r in resource(root, "aws_iam_role")
        if raw(fn, "role") == f"aws_iam_role.{r.labels[1]}.arn"
    ]
    if (
        len(roles) != 1
        or lit(roles[0], "name") != role_name
        or where(root, roles[0]) != "iam.tf"
    ):
        found.append(f"functions: {name}'s role isn't iam.tf's {role_name}")
    env = fn.block("environment")
    variables = env.attr("variables") if env else None
    text = re.sub(r"\s+", " ", variables.raw) if variables else ""
    if f"H4_EC2_HOURS = {HOURS_VALUE}" not in text and (
        "H4_EC2_HOURS = local.ec2_hours_value" not in text
        or not _hours_value_is_the_local(root)
    ):
        found.append(f"functions: {name}'s H4_EC2_HOURS isn't local.ec2_hours")
    if "H4_ALERTS_TOPIC_ARN = data.aws_sns_topic.alerts.arn" not in text:
        found.append(f"functions: {name} doesn't alert on h4-alerts")
    configs = [
        c
        for c in resource(root, "aws_lambda_function_event_invoke_config")
        if raw(c, "function_name") == f"aws_lambda_function.{key}[0].function_name"
    ]
    if (
        len(configs) != 1
        or lit(configs[0], "maximum_retry_attempts") != 0
        or not switched(configs[0])
    ):
        found.append(f"functions: Lambda may retry {name}, a second attempt")
    logs = [
        g
        for g in resource(root, "aws_cloudwatch_log_group")
        if lit(g, "name") == f"/aws/lambda/{name}"
    ]
    log = fn.block("logging_config")
    if (
        len(logs) != 1
        or log is None
        or raw(log, "log_group")
        != (f"aws_cloudwatch_log_group.{logs[0].labels[1]}.name")
    ):
        found.append(f"functions: {name} doesn't log to its own group")
    return found


def _hours_value_is_the_local(root: dict[str, list]) -> bool:
    for body in root.values():
        for b in body:
            if isinstance(b, ip.Block) and b.type == "locals":
                for a in b.body:
                    if isinstance(a, ip.Attribute) and a.name == "ec2_hours_value":
                        return re.sub(r"\s+", " ", a.raw) == HOURS_VALUE
    return False


def check_functions(root: dict[str, list]) -> list[str]:
    return function_checks(
        root, "ec2_start", "h4-ec2-start", "h4-ec2-start-fn"
    ) + function_checks(root, "ec2_guard", "h4-ec2-guard", "h4-ec2-guard-fn")


PERMISSIONS = {
    # function key: the source ARNs that may invoke it, as their raw text.
    "ec2_start": {
        "aws_cloudwatch_event_rule.laptop_away[0].arn",
        f'"{rule_arn("h4-tunnel-end-running")}"',
    },
    "ec2_guard": {f'"{rule_arn("h4-ec2-running")}"'},
}


def check_permissions(root: dict[str, list]) -> list[str]:
    found = []
    seen: dict[str, set[str]] = {k: set() for k in PERMISSIONS}
    for p in resource(root, "aws_lambda_permission"):
        fn = raw(p, "function_name")
        m = re.fullmatch(
            r"aws_lambda_function\.(ec2_start|ec2_guard)\[0\]\.function_name", fn
        )
        if not m:
            if "h4-ec2-" in fn:
                found.append(
                    f"permissions: {address(p)} names its function other than by reference"
                )
            continue
        if where(root, p) != "handover.tf" or not switched(p):
            found.append(
                f"permissions: {address(p)} isn't handover.tf's, behind the switch"
            )
        if (
            lit(p, "principal") != "events.amazonaws.com"
            or lit(p, "action") != "lambda:InvokeFunction"
        ):
            found.append(
                f"permissions: {address(p)} lets something but EventBridge invoke"
            )
        seen[m.group(1)].add(raw(p, "source_arn"))
    for key, want in PERMISSIONS.items():
        if seen[key] != want:
            found.append(
                f"permissions: {key}'s invokers aren't its rules alone: {sorted(seen[key] ^ want)}"
            )
    return found


def check_autostart(root: dict[str, list]) -> list[str]:
    ps = named(root, "aws_ssm_parameter", "/h4reet/prod/ec2-autostart")
    if len(ps) != 1:
        return ["autostart: /h4reet/prod/ec2-autostart is missing"]
    p = ps[0]
    found = []
    if where(root, p) != "handover.tf" or not unswitched(p):
        found.append("autostart: the switch isn't handover.tf's, made in W1")
    if lit(p, "type") != "String" or lit(p, "value") != "off":
        found.append("autostart: it isn't a String made off")
    life = p.block("lifecycle")
    if life is None or re.sub(r"\s+", "", raw(life, "ignore_changes")) != "[value]":
        found.append("autostart: a plan would show the Author's value as drift")
    return found


def check_laptop_away_rule(root: dict[str, list]) -> list[str]:
    rules = named(root, "aws_cloudwatch_event_rule", "h4-laptop-away-rule")
    if len(rules) != 1:
        return ["laptop rule: h4-laptop-away-rule is missing"]
    rule = rules[0]
    found = []
    if where(root, rule) != "handover.tf" or not switched(rule):
        found.append("laptop rule: it isn't handover.tf's, behind the switch")
    p = re.sub(r"\s+", " ", pattern(rule))
    if not (
        '"CloudWatch Alarm State Change"' in p
        and re.search(r'alarmName = \["h4-laptop-away"\]', p)
        and re.search(r'value = \["ALARM"\]', p)
    ):
        found.append(
            "laptop rule: it doesn't match h4-laptop-away into ALARM, by its name"
        )
    targets = targets_of(root, rule)
    if (
        len(targets) != 1
        or raw(targets[0], "arn") != "aws_lambda_function.ec2_start[0].arn"
        or not switched(targets[0])
    ):
        found.append(
            "laptop rule: its one target isn't h4-ec2-start, behind the switch"
        )
    return found


SCHEDULES = {
    "h4-ec2-hours-open": ("ec2_start", "hours_open", "open"),
    "h4-ec2-hours-close": ("ec2_guard", "hours_close", "close"),
}
# Spec 032 (FR-013): the tunnel end's check, every 5 minutes, in no zone, through the hours' role, made disabled
# (local.tunnel_end_check_state) until the Author's dry run proves the role; and, from its rework, the guard's budget
# check, every 5 minutes, enabled.
CHECK_SCHEDULE = "h4-tunnel-end-check"
BUDGET_SCHEDULE = "h4-ec2-budget-check"
CHECKS = {
    CHECK_SCHEDULE: ("ec2_start", "tunnel_end_check", "local.tunnel_end_check_state"),
    BUDGET_SCHEDULE: ("ec2_guard", "budget_check", None),
}


def check_schedules(root: dict[str, list]) -> list[str]:
    found = []
    every = resource(root, "aws_scheduler_schedule")
    if sorted(lit(s, "name") or "?" for s in every) != sorted([*SCHEDULES, *CHECKS]):
        return [
            "schedules: the hours' two schedules and the two 5-minute checks aren't the account's only ones"
        ]
    for name in CHECKS:
        found += check_tunnel_end_check(
            root, next(s for s in every if lit(s, "name") == name)
        )
    schedules = [s for s in every if lit(s, "name") in SCHEDULES]
    roles = [
        r for r in resource(root, "aws_iam_role") if lit(r, "name") == "h4-ec2-hours"
    ]
    hours_role = f"aws_iam_role.{roles[0].labels[1]}.arn" if len(roles) == 1 else "?"
    for s in schedules:
        name = lit(s, "name")
        fn, source, edge = SCHEDULES[name]
        if where(root, s) != "handover.tf" or not switched(s):
            found.append(f"schedules: {name} isn't handover.tf's, behind the switch")
        if raw(s, "schedule_expression_timezone") != "local.ec2_hours.zone":
            found.append(f"schedules: {name}'s zone isn't local.ec2_hours's")
        expression = raw(s, "schedule_expression")
        if expression not in (f"local.ec2_hours_{edge}_cron",) or not _cron_reads(
            root, edge
        ):
            found.append(f"schedules: {name}'s time isn't local.ec2_hours.{edge}")
        window = s.block("flexible_time_window")
        if window is None or lit(window, "mode") != "OFF":
            found.append(f"schedules: {name} may run late, in a flexible window")
        target = s.block("target")
        retry = target.block("retry_policy") if target else None
        if (
            target is None
            or raw(target, "arn") != f"aws_lambda_function.{fn}[0].arn"
            or raw(target, "role_arn") != hours_role
            or re.sub(r"\s+", "", raw(target, "input"))
            != f'jsonencode({{from="{source}"}})'
            or retry is None
            or lit(retry, "maximum_retry_attempts") != 0
        ):
            found.append(
                f"schedules: {name} doesn't invoke its function once, `from: {source}`, through h4-ec2-hours"
            )
    return found


def check_tunnel_end_check(root: dict[str, list], s) -> list[str]:
    """One of the two 5-minute checks (CHECKS): its function, its trigger, and its state."""
    fn, source, gate = CHECKS[lit(s, "name")]
    roles = [
        r for r in resource(root, "aws_iam_role") if lit(r, "name") == "h4-ec2-hours"
    ]
    hours_role = f"aws_iam_role.{roles[0].labels[1]}.arn" if len(roles) == 1 else "?"
    found = []
    name = lit(s, "name")
    if where(root, s) != "handover.tf" or not switched(s):
        found.append(f"schedules: {name} isn't handover.tf's, behind the switch")
    if lit(s, "schedule_expression") != "rate(5 minutes)":
        found.append(f"schedules: {name} doesn't run every 5 minutes")
    if (raw(s, "state") or None) != gate:
        found.append(
            f"schedules: {name}'s state isn't {gate or 'the default, enabled'}"
        )
    if gate is not None:
        value = next(
            (
                ip.literal(a)
                for body in root.values()
                for b in body
                if isinstance(b, ip.Block) and b.type == "locals"
                for a in b.body
                if isinstance(a, ip.Attribute) and a.name == gate.split(".", 1)[1]
            ),
            None,
        )
        if value not in ("DISABLED", "ENABLED"):
            found.append(f"schedules: {gate} isn't DISABLED or ENABLED")
    window = s.block("flexible_time_window")
    target = s.block("target")
    retry = target.block("retry_policy") if target else None
    if (
        window is None
        or lit(window, "mode") != "OFF"
        or target is None
        or raw(target, "arn") != f"aws_lambda_function.{fn}[0].arn"
        or raw(target, "role_arn") != hours_role
        or re.sub(r"\s+", "", raw(target, "input"))
        != f'jsonencode({{from="{source}"}})'
        or retry is None
        or lit(retry, "maximum_retry_attempts") != 0
    ):
        found.append(
            f"schedules: {name} doesn't invoke its function once, `from: {source}`, through h4-ec2-hours"
        )
    return found


def _cron_reads(root: dict[str, list], edge: str) -> bool:
    want = (
        f'"cron(${{tonumber(split(":", local.ec2_hours.{edge})[1])}} '
        f'${{tonumber(split(":", local.ec2_hours.{edge})[0])}} * * ? *)"'
    )
    for body in root.values():
        for b in body:
            if isinstance(b, ip.Block) and b.type == "locals":
                for a in b.body:
                    if (
                        isinstance(a, ip.Attribute)
                        and a.name == f"ec2_hours_{edge}_cron"
                    ):
                        return re.sub(r"\s+", " ", a.raw) == want
    return False


# Spec 032's grants for h4-ec2-start-fn (FR-016): each with its condition. RunInstances alone takes three statements,
# one for each kind of resource a launch from a template touches, so its want is a list of them, in their order.
EC2_ARN = f"arn:aws:ec2:us-east-1:{ACCOUNT_ID}"
HOSTS = '["h4-prod-ec2", "h4-prod-tunnel-end"]'
START_READS = (
    f'[ "{parameter_arn("/h4reet/prod/ec2-autostart")}", '
    f'"{parameter_arn("/h4reet/prod/ec2-instance-id")}", '
    f'"{parameter_arn("/h4reet/prod/ec2-launch-templates")}", '
    f'"{parameter_arn("/h4reet/prod/tunnel-end-launch-templates")}", '
    f'"{parameter_arn("/h4reet/prod/relay-vpc-origin-id")}", '
    f'"{parameter_arn("/h4reet/prod/host-lock")}", ]'
)
START_WRITES = (
    f'[ "{parameter_arn("/h4reet/prod/ec2-instance-id")}", '
    f'"{parameter_arn("/h4reet/prod/host-lock")}", ]'
)
LAUNCH = [
    (
        f'["{EC2_ARN}:launch-template/*"]',
        [("StringEquals", "aws:ResourceTag/component", '["ec2", "tunnel-end"]')],
    ),
    # The rework (Important 1 of the reviews of 52308132): the instance only of a listed type, on spot; what the
    # template supplies only from it.
    (
        f'["{EC2_ARN}:instance/*"]',
        [
            ("StringEquals", "aws:RequestTag/Name", HOSTS),
            ("StringEquals", "ec2:InstanceType", "local.launch_types"),
            ("StringEquals", "ec2:InstanceMarketType", '["spot"]'),
        ],
    ),
    (
        f'[ "{EC2_ARN}:volume/*", "{EC2_ARN}:spot-instances-request/*", ]',
        [("ArnLike", "ec2:LaunchTemplate", f'["{EC2_ARN}:launch-template/*"]')],
    ),
    (
        (
            f'[ "{EC2_ARN}:network-interface/*", "{EC2_ARN}:subnet/*", "{EC2_ARN}:security-group/*", '
            '"arn:aws:ec2:us-east-1::image/*", ]'
        ),
        [
            ("ArnLike", "ec2:LaunchTemplate", f'["{EC2_ARN}:launch-template/*"]'),
            ("Bool", "ec2:IsLaunchTemplateResource", '["true"]'),
        ],
    ),
]
RETIRE = (
    f'[ "{EC2_ARN}:instance/*", "{EC2_ARN}:spot-instances-request/*", ]',
    [("StringEquals", "ec2:ResourceTag/Name", HOSTS)],
)

# Each role's grants: action → (resources, conditions), exactly; or a list of them, one for each statement.
LOG = "{}:*"
ROLE_GRANTS = {
    "h4-ec2-start-fn": {
        "logs:CreateLogStream": ('["${aws_cloudwatch_log_group.ec2_start.arn}:*"]', []),
        "logs:PutLogEvents": ('["${aws_cloudwatch_log_group.ec2_start.arn}:*"]', []),
        "ssm:GetParameter": (START_READS, []),
        "ssm:PutParameter": (START_WRITES, []),
        "ssm:DeleteParameter": (
            f'["{parameter_arn("/h4reet/prod/host-lock")}"]',
            [],
        ),
        "budgets:DescribeBudgetActionsForBudget": (f'["{BUDGET_ARN}"]', []),
        "ec2:DescribeInstances": ('["*"]', []),
        "ec2:DescribeSpotInstanceRequests": ('["*"]', []),
        "ec2:DescribeVolumes": ('["*"]', []),
        "cloudwatch:DescribeAlarms": (f'["{ALARM_ARN}"]', []),
        "ec2:StartInstances": (f'["{INSTANCES}"]', TAGGED),
        "ec2:RunInstances": LAUNCH,
        "ec2:CreateTags": (
            f'["{EC2_ARN}:*/*"]',
            [("StringEquals", "ec2:CreateAction", '["RunInstances"]')],
        ),
        "ec2:TerminateInstances": RETIRE,
        "ec2:CancelSpotInstanceRequests": RETIRE,
        "ec2:AttachVolume": (
            f'[ "{EC2_ARN}:instance/*", "{EC2_ARN}:volume/*", ]',
            [
                (
                    "StringEquals",
                    "ec2:ResourceTag/Name",
                    '["h4-prod-ec2", "h4-prod-tunnel-end", "h4-ec2-data", "h4-shared-state"]',
                )
            ],
        ),
        "iam:PassRole": (
            f'[ "arn:aws:iam::{ACCOUNT_ID}:role/h4-prod-ec2", "arn:aws:iam::{ACCOUNT_ID}:role/h4-prod-tunnel-end", ]',
            [("StringEquals", "iam:PassedToService", '["ec2.amazonaws.com"]')],
        ),
        "cloudfront:GetVpcOrigin": (
            f'["arn:aws:cloudfront::{ACCOUNT_ID}:vpcorigin/*"]',
            [],
        ),
        "cloudfront:UpdateVpcOrigin": (
            f'["arn:aws:cloudfront::{ACCOUNT_ID}:vpcorigin/*"]',
            [],
        ),
        "sns:Publish": ("[data.aws_sns_topic.alerts.arn]", []),
    },
    "h4-ec2-guard-fn": {
        "logs:CreateLogStream": ('["${aws_cloudwatch_log_group.ec2_guard.arn}:*"]', []),
        "logs:PutLogEvents": ('["${aws_cloudwatch_log_group.ec2_guard.arn}:*"]', []),
        "ssm:GetParameter": (SWITCHES, []),
        "budgets:DescribeBudgetActionsForBudget": (f'["{BUDGET_ARN}"]', []),
        "ec2:DescribeInstances": ('["*"]', []),
        "cloudwatch:DescribeAlarms": (f'["{ALARM_ARN}"]', []),
        "ec2:StopInstances": (f'["{INSTANCES}"]', TAGGED),
        "sns:Publish": ("[data.aws_sns_topic.alerts.arn]", []),
    },
    "h4-ec2-hours": {
        "lambda:InvokeFunction": (
            f'[ "{function_arn("h4-ec2-start")}", "{function_arn("h4-ec2-guard")}", ]',
            [],
        ),
    },
}
TRUSTS = {
    "h4-ec2-start-fn": ("Service", '["lambda.amazonaws.com"]'),
    "h4-ec2-guard-fn": ("Service", '["lambda.amazonaws.com"]'),
    "h4-ec2-hours": ("Service", '["scheduler.amazonaws.com"]'),
}


def multi(who: str, action: str) -> bool:
    """An action the role's want lists statement by statement (spec 032's RunInstances)."""
    return isinstance(ROLE_GRANTS.get(who, {}).get(action), list)


def document_grants(root: dict[str, list], doc, who: str) -> tuple[dict, list[str]]:
    """A policy document's allowed actions, each with its resources and conditions; what can't be read is a finding."""
    found = []
    granted: dict[str, tuple[str, list]] = {}
    if doc is None:
        return granted, [
            f"roles: {who}'s policy isn't a data.aws_iam_policy_document this root reads"
        ]
    for key in ("source_policy_documents", "override_policy_documents"):
        if doc.attr(key) is not None:
            found.append(
                f"roles: {who}'s document takes {key}, which the check doesn't read"
            )
    if doc.blocks("dynamic"):
        found.append(
            f"roles: {who}'s document has a dynamic block, which the check doesn't read"
        )
    for st in doc.blocks("statement"):
        effect, actions = lit(st, "effect"), lit(st, "actions")
        if effect not in ("Allow", "Deny") or not (
            isinstance(actions, list) and all(isinstance(a, str) for a in actions)
        ):
            found.append(
                f"roles: {who} has a statement whose effect or actions aren't literals"
            )
        if any(
            st.attr(k) is not None
            for k in ("not_actions", "not_resources", "not_principals")
        ):
            found.append(
                f"roles: {who} grants by not_actions, not_resources, or not_principals"
            )
    for s in net.statements(doc):
        if s["effect"] != "Allow":
            continue
        for a in s["actions"]:
            if multi(who, a):
                granted.setdefault(a, []).append((s["resources"], s["conditions"]))  # type: ignore[union-attr]
                continue
            if a in granted:
                found.append(f"roles: {who} is granted {a} twice")
            granted[a] = (s["resources"], s["conditions"])
    return granted, found


def check_roles(root: dict[str, list]) -> list[str]:
    found = []
    for name, want in ROLE_GRANTS.items():
        roles = [r for r in resource(root, "aws_iam_role") if lit(r, "name") == name]
        if len(roles) != 1:
            found.append(f"roles: {name} is missing")
            continue
        role = roles[0]
        me = f"aws_iam_role.{role.labels[1]}"
        if where(root, role) != "iam.tf" or not unswitched(role):
            found.append(f"roles: {name} isn't iam.tf's, made in W1")
        trust = net.statements(net.document(root, raw(role, "assume_role_policy")))
        if [(s["actions"], s["principals"]) for s in trust] != [
            ({"sts:AssumeRole"}, [TRUSTS[name]])
        ] or not any(
            v == "aws:SourceAccount" for s in trust for _, v, _ in s["conditions"]
        ):
            found.append(
                f"roles: {name} trusts more than its service, for this account"
            )
        if role.blocks("inline_policy") or lit(role, "managed_policy_arns"):
            found.append(f"roles: {name} holds a policy the check doesn't read")
        attached = [
            b
            for b in blocks(root, "resource")
            if b.labels[0] in net.ATTACHING
            and me in " ".join(raw(b, k) for k in ("role", "roles", "role_name"))
        ]
        granted: dict[str, tuple[str, list]] = {}
        for b in attached:
            if b.labels[0] != "aws_iam_role_policy":
                found.append(
                    f"roles: {name} has {address(b)}, whose grants the check doesn't read"
                )
                continue
            got, problems = document_grants(
                root, net.document(root, raw(b, "policy")), name
            )
            found += problems
            for a in set(got) & set(granted):
                found.append(f"roles: {name} is granted {a} twice")
            granted.update(got)
        if set(granted) != set(want):
            found.append(
                f"roles: {name}'s actions aren't its own: {sorted(set(granted) ^ set(want))}"
            )
        for action, grant in want.items():
            if action in granted and granted[action] != grant:
                found.append(f"roles: {name}'s {action} reaches {granted[action]}")
        if any(a.startswith("route53:") for a in granted):
            found.append(f"roles: {name} reads a Route 53 health check")
    return found


STOP_SET = {
    "ec2:StopInstances": (f'["{INSTANCES}"]', TAGGED),
    "ec2:DescribeInstances": ('["*"]', []),
    "sns:Publish": ("[data.aws_sns_topic.alerts.arn]", []),
}


def check_stop_set(root: dict[str, list]) -> list[str]:
    sets = named(root, "aws_ssoadmin_permission_set", "h4-ec2-stop")
    if len(sets) != 1:
        return ["stop set: h4-ec2-stop is missing"]
    ps = sets[0]
    me = f"aws_ssoadmin_permission_set.{ps.labels[1]}"
    found = []
    if where(root, ps) != "iam.tf" or not unswitched(ps):
        found.append("stop set: it isn't iam.tf's, made in W1")
    attached = [
        b
        for b in blocks(root, "resource")
        if b.labels[0].startswith("aws_ssoadmin_")
        and me in raw(b, "permission_set_arn")
    ]
    if [b.labels[0] for b in attached] != ["aws_ssoadmin_permission_set_inline_policy"]:
        found.append("stop set: it holds more than its one inline policy")
        return found
    got, problems = document_grants(
        root, net.document(root, raw(attached[0], "inline_policy")), "h4-ec2-stop"
    )
    found += [p.replace("roles: ", "stop set: ") for p in problems]
    if got != STOP_SET:
        found.append(
            f"stop set: it doesn't hold the stop of the tagged instance alone: {sorted(set(got) ^ set(STOP_SET))}"
        )
    return found


def check_account_switch(root: dict[str, list]) -> list[str]:
    """What waits for W2's digests waits behind the switch; the roles, the set, the switch, the logs are W1's."""
    found = []
    for rtype in (
        "aws_lambda_function",
        "aws_lambda_permission",
        "aws_lambda_function_event_invoke_config",
        "aws_scheduler_schedule",
    ):
        for b in resource(root, rtype):
            text = " ".join(re.sub(r"\s+", " ", a.raw) for a in net._attributes(b))
            if (
                "h4-ec2-" in text or "ec2_start" in text or "ec2_guard" in text
            ) and not switched(b):
                found.append(
                    f"switch: {address(b)} doesn't wait behind the account's switch"
                )
    for b in resource(root, "aws_cloudwatch_event_rule") + resource(
        root, "aws_cloudwatch_event_target"
    ):
        if b.labels[1] == "laptop_away" and not switched(b):
            found.append(
                f"switch: {address(b)} doesn't wait behind the account's switch"
            )
    return found


ACCOUNT_CHECKS = (
    check_hours,
    check_functions,
    check_permissions,
    check_autostart,
    check_laptop_away_rule,
    check_schedules,
    check_roles,
    check_stop_set,
    check_account_switch,
)


def account_problems(root: dict[str, list]) -> list[str]:
    return [p for check in ACCOUNT_CHECKS for p in check(root)] + net.account_problems(
        root
    )


# ----------------------------------------------------------------------------------------------------------------------
# The tests.


def test_prod_holds_failover_tf_from_p_i6_until_applied() -> None:
    assert "failover.tf" in net.root_texts()


def test_the_health_check_probes_the_laptop_through_the_tunnel_end() -> None:
    assert check_health_check(prod()) == []


def test_h4_laptop_away_is_its_alarm_beside_it_missing_data_breaching() -> None:
    assert check_laptop_alarm(prod()) == []


def test_ec2s_warning_rule_is_prods_to_h4_alerts_from_w1() -> None:
    assert check_ec2_warning(prod()) == []


def test_ec2_running_goes_to_the_guard_behind_the_switch() -> None:
    assert check_ec2_running(prod()) == []


def test_the_tunnel_ends_return_invokes_the_start_function_behind_the_switch() -> None:
    assert check_return_start(prod()) == []


def test_the_hours_are_one_local_in_the_account_and_nothing_holds_a_copy() -> None:
    root = account()
    assert check_hours(root) == []
    ((_, attr),) = hours_local(root)
    # Provisional: question 1a, recommended option A, until the Author's answer.
    assert ip.literal(attr)["zone"] == PROVISIONAL_ZONE
    # Nor does prod hold a copy.
    for name, text in net.root_texts().items():
        assert not any(z in text for z in ZONES), name


def test_the_zone_the_local_names_is_one_the_functions_carry() -> None:
    start = _load(
        "h4_ec2_start_for_infra", REPO / "infra" / "lambdas" / "ec2_start" / "start.py"
    )
    ((_, attr),) = hours_local(account())
    hours = ip.literal(attr)
    parsed = start.parse_hours(f"{hours['zone']} {hours['open']}-{hours['close']}")
    assert parsed.zone == hours["zone"]
    assert set(start.ZONES) == ZONES


def test_the_two_functions_run_their_images_with_the_hours_and_no_retry() -> None:
    assert check_functions(account()) == []


def test_only_their_three_rules_may_invoke_them() -> None:
    assert check_permissions(account()) == []


def test_the_autostart_switch_is_made_off_and_its_value_is_the_authors() -> None:
    assert check_autostart(account()) == []


def test_h4_laptop_away_rule_matches_the_alarm_by_its_name() -> None:
    assert check_laptop_away_rule(account()) == []


def test_the_hours_two_schedules_invoke_the_functions_in_the_locals_zone() -> None:
    assert check_schedules(account()) == []


def test_each_role_holds_its_grants_by_name_and_reads_no_health_check() -> None:
    assert check_roles(account()) == []


def test_the_authors_stop_set_is_the_tagged_instance_alone() -> None:
    assert check_stop_set(account()) == []


def test_what_needs_w2s_digests_waits_behind_the_switch() -> None:
    assert check_account_switch(account()) == []


def test_the_account_names_no_prod_id_and_reads_no_prod_state() -> None:
    assert net.account_problems(account()) == []


def test_every_check_passes_with_both_switches_off_and_on() -> None:
    for root in (net.switched_off(prod()), net.switched_on(prod())):
        assert prod_problems(root) == []
        assert net.problems(root) == []
    for root in (net.switched_off(account()), net.switched_on(account())):
        assert account_problems(root) == []


def test_the_protected_kinds_live_only_in_the_protected_files() -> None:
    for name, text in {**{f"prod/{k}": v for k, v in net.root_texts().items()}}.items():
        src = ip.Source(f"infra/{name}", text, ip.parse_hcl(text))
        assert [str(f) for f in ip.t5_where(src, set())] == [], name
    texts = net.account_texts()
    srcs = [
        ip.Source(f"infra/account/{k}", v, ip.parse_hcl(v)) for k, v in texts.items()
    ]
    handover = ip.handover_addresses(srcs)
    assert handover == {
        "aws_lambda_function.ec2_start",
        "aws_lambda_function.ec2_guard",
    }
    for src in srcs:
        found = ip.t5_where(src, handover) + [
            f for r in ip.resources(src.body) for f in ip.t2_tags(src, r, ip.TAGGABLE)
        ]
        assert [str(f) for f in found] == [], src.rel


# The credential audit's own reading of the handover's identities (infra/lambdas/credential_audit/audit.py's
# HANDOVER_ROLES and HANDOVER_SETS): each grant, as IAM will hold it, passes.
def as_policy(root: dict[str, list], doc) -> dict:
    out = []
    for st in doc.blocks("statement"):
        conditions: dict[str, dict[str, list]] = {}
        for c in st.blocks("condition"):
            values = lit(c, "values")
            if raw(c, "values") == "local.launch_types":
                values = sorted(LISTED_TYPES)
            elif not (
                isinstance(values, list) and all(isinstance(v, str) for v in values)
            ):
                # Spec 032's ArnLike on the launch templates' ARN names the account by interpolation, which IAM holds
                # as the account's ID: read it with a stand-in ID, built here so no 12-digit run is in the file.
                values = [
                    v.replace(ACCOUNT_ID, "1" * 4 + "2" * 4 + "3" * 4)
                    for v in re.findall(r'"([^"]*)"', raw(c, "values"))
                ]
            conditions.setdefault(lit(c, "test"), {})[lit(c, "variable")] = values
        # The resources as IAM holds them, the account's ID by the same stand-in: the audit reads RunInstances' kinds.
        resources = [
            v.replace(ACCOUNT_ID, "1" * 4 + "2" * 4 + "3" * 4)
            for v in re.findall(r'"([^"]*)"', raw(st, "resources"))
        ] or ["*"]
        out.append(
            {
                "Effect": lit(st, "effect") or "Allow",
                "Action": lit(st, "actions"),
                "Resource": resources,
                **({"Condition": conditions} if conditions else {}),
            }
        )
    return {"Statement": out}


# The listed types, prod's two lists (infra/prod/ec2.tf, tunnel-end.tf), which the account's local.launch_types and
# the credential audit's LISTED_TYPES repeat: the three must agree (spec 032's rework).
LISTED_TYPES = {
    "t4g.large",
    "m7g.large",
    "m6g.large",
    "t4g.xlarge",
    "t4g.small",
    "c7g.medium",
    "c6g.medium",
    "t4g.medium",
}


def test_the_listed_types_agree_in_prod_the_account_and_the_audit() -> None:
    audit = _load(
        "credential_audit_for_types",
        REPO / "infra" / "lambdas" / "credential_audit" / "audit.py",
    )
    p = prod()
    listed = {
        e["type"]
        for name, file in (
            ("ec2_types", "ec2.tf"),
            ("tunnel_end_types", "tunnel-end.tf"),
        )
        for e in ip.literal(net.locals_in(p, file)[name])
    }
    account_types = None
    for body in account().values():
        for b in body:
            if isinstance(b, ip.Block) and b.type == "locals":
                for a in b.body:
                    if isinstance(a, ip.Attribute) and a.name == "launch_types":
                        account_types = set(ip.literal(a) or [])
    assert listed == LISTED_TYPES == set(audit.LISTED_TYPES) == account_types


def test_the_credential_audit_finds_none_of_them_too_broad() -> None:
    audit = _load(
        "credential_audit_for_handover",
        REPO / "infra" / "lambdas" / "credential_audit" / "audit.py",
    )
    root = account()
    for name, allowed in audit.HANDOVER_ROLES.items():
        (role,) = [r for r in resource(root, "aws_iam_role") if lit(r, "name") == name]
        (policy,) = [
            p
            for p in resource(root, "aws_iam_role_policy")
            if raw(p, "role") == f"aws_iam_role.{role.labels[1]}.id"
        ]
        doc = as_policy(root, net.document(root, raw(policy, "policy")))
        assert audit.handover_too_broad([doc], allowed) is False, name
    (ps,) = named(root, "aws_ssoadmin_permission_set", "h4-ec2-stop")
    (inline,) = [
        p
        for p in resource(root, "aws_ssoadmin_permission_set_inline_policy")
        if f"aws_ssoadmin_permission_set.{ps.labels[1]}" in raw(p, "permission_set_arn")
    ]
    doc = as_policy(root, net.document(root, raw(inline, "inline_policy")))
    assert audit.handover_too_broad([doc], audit.HANDOVER_SETS["h4-ec2-stop"]) is False


# What the bridge, as the patches leave it, reads of each new message (contracts/aws-alerts.md §2).
def test_ec2s_warning_reaches_the_bridge_as_spot_interruption(tmp_path: Path) -> None:
    message = net.delivered(
        net.rule_target(prod(), "h4-ec2-spot-warning"),
        {"action": "stop", "at": "2026-11-13T05:00:00Z"},
    )
    alert = net.bridge(tmp_path).classify(message)
    assert (alert.kind, alert.facts) == (
        "spot_interruption",
        [("action", "stop"), ("at", "2026-11-13T05:00:00Z")],
    ), alert


@pytest.mark.parametrize(
    ("folder", "module", "event", "kind", "reason"),
    [
        ("ec2_start", "start", {"manual": True}, "ec2_start_refused", "outside_hours"),
        ("ec2_guard", "guard", {"from": "elsewhere"}, "ec2_guard_failed", None),
    ],
)
def test_the_functions_new_messages_reach_the_bridge_as_their_kinds(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    folder: str,
    module: str,
    event: dict,
    kind: str,
    reason: str | None,
) -> None:
    fn = _load(
        f"h4_{module}_for_bridge", REPO / "infra" / "lambdas" / folder / f"{module}.py"
    )
    from datetime import datetime, timezone

    sent: list[str] = []

    class Aws:
        def call(self, service: str, op: str, **params: object) -> dict:
            if op == "Publish":
                sent.append(str(params["Message"]))
                return {}
            if op == "GetParameter" and params["Name"] == "/h4reet/prod/ec2-autostart":
                return {"Parameter": {"Value": "on"}}
            raise fn.AwsError("AccessDenied")

    class Context:
        invoked_function_arn = "arn:aws:lambda:us-east-1:" + "1" * 12 + ":function:x"

    monkeypatch.setenv("H4_EC2_HOURS", "America/Denver 07:00-19:00")
    fn.handler(
        event,
        Context(),
        aws=Aws(),
        now=lambda: datetime(2026, 11, 19, 4, tzinfo=timezone.utc),
    )
    (message,) = sent
    alert = net.bridge(tmp_path).classify(message)
    assert (alert.kind, alert.reason) == (kind, reason), alert


# ----------------------------------------------------------------------------------------------------------------------
# The fixtures: one defect each, in its root.


def fixture_root(path: Path) -> str:
    m = re.search(
        r"^# root: (prod|account)$", path.read_text(encoding="utf-8"), re.MULTILINE
    )
    assert m, f"{path.name} names no root"
    return m.group(1)


FIXTURE_FILES = sorted(FIXTURES.glob("*.tf"))


@pytest.mark.parametrize("path", FIXTURE_FILES, ids=[p.stem for p in FIXTURE_FILES])
def test_each_fixture_is_found_as_its_defect(path: Path) -> None:
    which = fixture_root(path)
    root, problems = (
        (prod(), prod_problems) if which == "prod" else (account(), account_problems)
    )
    assert problems(root) == [], "the root itself must be clean first"
    changed, expect = net.mutated(root, path)
    assert expect, f"{path.name} names no problem it expects"
    found = problems(changed)
    for want in expect:
        assert any(want in f for f in found), (want, found)
    assert len(found) == len(expect), found


def test_every_check_has_a_fixture_that_fails_it() -> None:
    caught = set()
    for path in FIXTURE_FILES:
        which = fixture_root(path)
        root, checks = (
            (prod(), PROD_CHECKS) if which == "prod" else (account(), ACCOUNT_CHECKS)
        )
        changed, _ = net.mutated(root, path)
        for check in checks:
            if check(changed):
                caught.add(check.__name__)
    assert caught == {c.__name__ for c in PROD_CHECKS + ACCOUNT_CHECKS}


def test_the_patch_is_json_free_of_ids() -> None:
    # The patch carries no account ID, instance ID, or health-check ID literal: every one is a reference or a
    # name-built ARN (rule T8 reads the files; this reads the patch).
    text = (
        REPO / "docs" / "merge-requests" / "2026-11-13-feat-001-pi6-handover.patch"
    ).read_text(encoding="utf-8")
    assert not re.search(r"(?<![0-9])[0-9]{12}(?![0-9])", text)
    assert not re.search(r"\bi-0[0-9a-f]{8,}\b", text)
    json.dumps(text)  # it reads as text


def test_the_health_checks_id_is_a_string_parameter_the_tunnel_end_reads() -> None:
    # The sink's read of the check's status (T121, T126) needs its ID, prod's own: a String in the tunnel end's path,
    # which its role reads already, made from the check in the same root, so a replace updates it.
    root = prod()
    found = named(root, "aws_ssm_parameter", "/h4reet/tunnel-end/HEALTH_CHECK_ID")
    assert len(found) == 1 and where(root, found[0]) == "ssm.tf"
    assert lit(found[0], "type") == "String"
    assert raw(found[0], "value") == "aws_route53_health_check.laptop.id"
