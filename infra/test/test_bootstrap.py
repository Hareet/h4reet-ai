"""Spec 001 group 3, the bootstrap root (tasks.md T020; FR-001 to FR-003, FR-022; research.md R-02, R-03, R-22;
contracts/aws-alerts.md §1 and §3): infra/bootstrap's HCL, read with group 1's standard-library reader,
tools/gates/infra_policy.py's (the guard patch P-1; plan.md Technical Context), never with python-hcl2 or Terraform.

What the root must hold:
  - the state bucket: versioned, encrypted, public access blocked, TLS-only for every principal, kept from destroy;
  - h4-model-month at $20 and h4-model-day at $5, on Bedrock's cost, with notifications at 70% and 100% of actual,
    on usage, not net of credits;
  - h4-server-month at var.server_budget_usd, on every cost tagged project = h4reet-ai but Bedrock's (ADR 0047), at 70% and 100%;
  - Bedrock's cost as the service names the Author reads in his Cost Explorer, var.bedrock_service_names, a list
    with no default (T028's review, B3: Claude on Bedrock may show under its own Marketplace name);
  - the anomaly monitor, with its immediate $1 subscription;
  - h4-alerts, with its email subscription from a sensitive variable, and a policy that lets only Budgets and Cost
    Anomaly Detection publish, for this account;
  - the tags: project and environment from default_tags, and component on every taggable resource.

budgets.tf and alerts.tf are protected (FR-012), so they reach the branch only with the Author's patch, P-I1
(docs/merge-requests/2026-11-10-feat-001-pi1-bootstrap.patch). Until he applies it, these tests read those two files
from the patch, as the new files it creates; once he has, from the tree. Each fixture in fixtures/bootstrap/ is one
defect: its blocks replace the root's blocks of the same address (or join the file its "# into:" line names), its
"# drop:" lines remove a block, and its "# expect:" lines are the problems the checks must then report, and only those.
"""

from __future__ import annotations

import importlib.util
import re
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
READER = REPO / "tools" / "gates" / "infra_policy.py"
ROOT = REPO / "infra" / "bootstrap"
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "bootstrap"
PI1 = REPO / "docs" / "merge-requests" / "2026-11-10-feat-001-pi1-bootstrap.patch"
PINS = REPO / ".devcontainer" / "toolchain.vars"
FILES = (
    "versions.tf",
    "variables.tf",
    "main.tf",
    "outputs.tf",
    "budgets.tf",
    "alerts.tf",
)
PROTECTED_FILES = ("budgets.tf", "alerts.tf")
# The names the guard patch denies to agents by name (contracts/env-cloud.md §5; contracts/infra-records.md §1); a
# new variable needs its deny there (FR-011). bedrock_service_names, from T028's review (B3), waits for its deny in P-1.
VARIABLES = {
    "alert_email",
    "state_bucket_suffix",
    "server_budget_usd",
    "bedrock_service_names",
}
PROTECTED_KINDS = ("aws_budgets_", "aws_ce_", "aws_sns_", "aws_iam_")
BEDROCK = "var.bedrock_service_names"
TOPIC = "aws_sns_topic.alerts.arn"

if not READER.is_file():
    pytest.skip(
        "PLANNED (T010): the reader, tools/gates/infra_policy.py, arrives with the guard patch, P-1",
        allow_module_level=True,
    )


def _reader():
    spec = importlib.util.spec_from_file_location("infra_policy_for_bootstrap", READER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


ip = _reader()


# ----------------------------------------------------------------------------------------------------------------------
# Reading the root: the tree's files, and P-I1's new files while the tree lacks them.


def from_patch(patch: str, rel: str) -> str | None:
    """The text a unified diff gives a new file, `--- /dev/null` then `+++ b/<rel>`, or None if it holds none."""
    lines = patch.splitlines(keepends=True)
    for i, line in enumerate(lines):
        if (
            line.rstrip("\n") != f"+++ b/{rel}"
            or i == 0
            or lines[i - 1].rstrip("\n") != "--- /dev/null"
        ):
            continue
        out: list[str] = []
        j = i + 1
        while j < len(lines) and lines[j].startswith("@@ "):
            m = re.match(r"@@ -0,0 \+1(?:,(\d+))? @@", lines[j])
            assert m, f"P-I1's hunk for {rel} isn't a new file's"
            j += 1
            for _ in range(int(m.group(1) or 1)):
                assert lines[j].startswith("+"), (
                    f"P-I1's hunk for {rel} holds a line that isn't added"
                )
                out.append(lines[j][1:])
                j += 1
            if j < len(lines) and lines[j].startswith("\\ No newline"):
                out[-1] = out[-1].rstrip("\n")
                j += 1
        return "".join(out)
    return None


def root_texts() -> dict[str, str]:
    texts = {}
    patch = PI1.read_text(encoding="utf-8") if PI1.is_file() else ""
    for name in FILES:
        path = ROOT / name
        if path.is_file():
            texts[name] = path.read_text(encoding="utf-8")
        elif name in PROTECTED_FILES:
            text = from_patch(patch, f"infra/bootstrap/{name}")
            if text is not None:
                texts[name] = text
    return texts


def parsed(texts: dict[str, str]) -> dict[str, list]:
    return {name: list(ip.parse_hcl(text)) for name, text in texts.items()}


def pins() -> dict[str, str]:
    return ip.read_pins(PINS)


# ----------------------------------------------------------------------------------------------------------------------
# The checks. Each takes the root as {file name: its blocks} and returns its problems, "<area>: <what>".


def blocks(root: dict[str, list], kind: str | None = None) -> list:
    return [
        b
        for body in root.values()
        for b in body
        if isinstance(b, ip.Block) and (kind is None or b.type == kind)
    ]


def resource(
    root: dict[str, list], rtype: str, name: str | None = None, kind: str = "resource"
) -> list:
    return [
        b
        for b in blocks(root, kind)
        if b.labels[:1] == [rtype] and (name is None or b.labels[1:] == [name])
    ]


def by_name(root: dict[str, list], rtype: str, name: str) -> list:
    return [b for b in resource(root, rtype) if ip.literal(b.attr("name")) == name]


def raw(block, name: str) -> str:
    attr = block.attr(name)
    return "" if attr is None else attr.raw


def refers(block, name: str, target: str) -> bool:
    return (
        re.search(rf"(?<![\w.]){re.escape(target)}(?![\w])", raw(block, name))
        is not None
    )


def as_list(value: object) -> list:
    return value if isinstance(value, list) else [value]


def check_versions(root: dict[str, list], pinned: dict[str, str]) -> list[str]:
    found = []
    tfs = blocks(root, "terraform")
    versions = [
        ip.literal(t.attr("required_version"))
        for t in tfs
        if t.attr("required_version")
    ]
    if versions != [pinned.get("TERRAFORM_VERSION")]:
        found.append(
            f"versions: required_version isn't {pinned.get('TERRAFORM_VERSION')}"
        )
    aws = [
        ip.literal(e)
        for t in tfs
        for rp in t.blocks("required_providers")
        for e in rp.body
        if isinstance(e, ip.Attribute) and e.name == "aws"
    ]
    want = {
        "source": "hashicorp/aws",
        "version": pinned.get("TERRAFORM_AWS_PROVIDER_VERSION"),
    }
    if aws != [want]:
        found.append(f"versions: the aws provider isn't pinned to {want['version']}")
    backends = [b.labels for t in tfs for b in t.blocks("backend")]
    if backends != [["local"]]:
        found.append(
            "versions: the state doesn't start local (its move to the bucket is tasks.md T030's)"
        )
    return found


def check_provider(root: dict[str, list]) -> list[str]:
    providers = [p for p in blocks(root, "provider") if p.labels == ["aws"]]
    if len(providers) != 1:
        return ['tags: the root needs exactly one provider "aws"']
    p = providers[0]
    found = []
    if ip.literal(p.attr("region")) != "us-east-1":
        found.append("provider: region isn't us-east-1 (research.md R-01)")
    dt = p.block("default_tags")
    tags = ip.literal(dt.attr("tags")) if dt is not None else ip.UNKNOWN
    tags = tags if isinstance(tags, dict) else {}
    for key, value in (("project", "h4reet-ai"), ("environment", "account")):
        if tags.get(key) != value:
            found.append(f"tags: default_tags lacks {key} = {value}")
    return found


def check_variables(root: dict[str, list]) -> list[str]:
    found = []
    declared = {b.labels[0]: b for b in blocks(root, "variable") if b.labels}
    for name in sorted(set(declared) - VARIABLES):
        found.append(f"variables: {name} isn't one the guard patch denies (FR-011)")
    for name in sorted(VARIABLES - set(declared)):
        found.append(f"variables: {name} is missing")
    email = declared.get("alert_email")
    if email is not None and ip.literal(email.attr("sensitive")) is not True:
        found.append("variables: alert_email isn't sensitive (FR-010)")
    budget = declared.get("server_budget_usd")
    if budget is not None and raw(budget, "type") != "number":
        found.append("variables: server_budget_usd isn't a number")
    names = declared.get("bedrock_service_names")
    checked = [
        v
        for v in (names.blocks("validation") if names is not None else [])
        if "length(var.bedrock_service_names) > 0" in raw(v, "condition")
    ]
    if names is not None and (raw(names, "type") != "list(string)" or not checked):
        found.append(
            "variables: bedrock_service_names isn't a list(string) validated non-empty"
        )
    for name, block in sorted(declared.items()):
        if block.attr("default") is not None and name in VARIABLES:
            found.append(
                f"variables: {name} has a default; the Author supplies it at run time"
            )
    return found


def check_state_bucket(root: dict[str, list]) -> list[str]:
    buckets = resource(root, "aws_s3_bucket", "state")
    if len(buckets) != 1:
        return ["state bucket: aws_s3_bucket.state is missing"]
    found = []
    bucket = buckets[0]
    if not raw(bucket, "bucket").startswith('"h4reet-ai-tfstate-') or not refers(
        bucket, "bucket", "var.state_bucket_suffix"
    ):
        found.append(
            "state bucket: its name isn't h4reet-ai-tfstate-<var.state_bucket_suffix>"
        )
    life = bucket.block("lifecycle")
    if life is None or ip.literal(life.attr("prevent_destroy")) is not True:
        found.append("state bucket: prevent_destroy isn't set")
    target = "aws_s3_bucket.state.id"

    def of(rtype: str) -> list:
        return [b for b in resource(root, rtype) if refers(b, "bucket", target)]

    versioning = of("aws_s3_bucket_versioning")
    vc = (
        versioning[0].block("versioning_configuration")
        if len(versioning) == 1
        else None
    )
    if vc is None or ip.literal(vc.attr("status")) != "Enabled":
        found.append("state bucket: versioning isn't Enabled")
    sse = of("aws_s3_bucket_server_side_encryption_configuration")
    algorithms = [
        ip.literal(d.attr("sse_algorithm"))
        for s in sse
        for rule in s.blocks("rule")
        for d in rule.blocks("apply_server_side_encryption_by_default")
    ]
    if not algorithms or any(a not in ("AES256", "aws:kms") for a in algorithms):
        found.append("state bucket: no default encryption")
    pab = of("aws_s3_bucket_public_access_block")
    settings = (
        "block_public_acls",
        "block_public_policy",
        "ignore_public_acls",
        "restrict_public_buckets",
    )
    if len(pab) != 1 or any(ip.literal(pab[0].attr(k)) is not True for k in settings):
        found.append("state bucket: public access isn't blocked on all four settings")
    tls = False
    for p in of("aws_s3_bucket_policy"):
        m = re.fullmatch(
            r"data\.aws_iam_policy_document\.([\w-]+)\.json", raw(p, "policy")
        )
        docs = (
            resource(root, "aws_iam_policy_document", m.group(1), kind="data")
            if m
            else []
        )
        statements = docs[0].blocks("statement") if len(docs) == 1 else []
        for s in statements:
            # aws_iam_policy_document's effect is Allow when the statement doesn't set it.
            effect = ip.literal(s.attr("effect")) if s.attr("effect") else "Allow"
            if effect != "Deny":
                found.append(
                    "state bucket: its policy grants something; it only denies"
                )
                continue
            secure = [
                c
                for c in s.blocks("condition")
                if ip.literal(c.attr("test")) == "Bool"
                and ip.literal(c.attr("variable")) == "aws:SecureTransport"
                and ip.literal(c.attr("values")) == ["false"]
            ]
            resources = raw(s, "resources")
            principals = [
                (ip.literal(x.attr("type")), ip.literal(x.attr("identifiers")))
                for x in s.blocks("principals")
            ]
            if (
                secure
                and ip.literal(s.attr("actions")) == ["s3:*"]
                and "aws_s3_bucket.state.arn" in resources
                and "/*" in resources
            ):
                tls = True
                # Every principal: T028's review, nit 2 (P-1's T6 now passes a Deny with "*").
                if principals != [("AWS", ["*"])]:
                    found.append(
                        'state bucket: the TLS deny isn\'t for every principal ("*")'
                    )
    if not tls:
        found.append("state bucket: no TLS-only deny on the bucket and its objects")
    return found


def _notifications(block) -> list[str]:
    found = []
    name = ip.literal(block.attr("name"))
    notes = block.blocks("notification")
    thresholds = sorted(ip.literal(n.attr("threshold")) for n in notes)  # type: ignore[type-var]
    if thresholds != [70, 100]:
        found.append(f"{name}: notifications aren't at 70% and 100%")
    for n in notes:
        if ip.literal(n.attr("notification_type")) != "ACTUAL":
            found.append(f"{name}: a notification that isn't on ACTUAL cost")
        if ip.literal(n.attr("threshold_type")) != "PERCENTAGE" or ip.literal(
            n.attr("comparison_operator")
        ) != ("GREATER_THAN"):
            found.append(f"{name}: a notification that isn't GREATER_THAN a PERCENTAGE")
        if (
            n.attr("subscriber_email_addresses") is not None
            or raw(n, "subscriber_sns_topic_arns") != f"[{TOPIC}]"
        ):
            found.append(
                f"{name}: a notification goes somewhere other than h4-alerts alone"
            )
    return found


def _budget(root: dict[str, list], name: str) -> list:
    return by_name(root, "aws_budgets_budget", name)


def check_model_budgets(root: dict[str, list]) -> list[str]:
    found = []
    for name, amount, unit in (
        ("h4-model-month", "20", "MONTHLY"),
        ("h4-model-day", "5", "DAILY"),
    ):
        found_here = _budget(root, name)
        if len(found_here) != 1:
            found.append(f"{name}: missing")
            continue
        b = found_here[0]
        if (
            ip.literal(b.attr("limit_amount")) != amount
            or ip.literal(b.attr("limit_unit")) != "USD"
        ):
            found.append(f"{name}: limit_amount isn't {amount} USD")
        if (
            ip.literal(b.attr("time_unit")) != unit
            or ip.literal(b.attr("budget_type")) != "COST"
        ):
            found.append(f"{name}: isn't a {unit} COST budget")
        filters = [
            (ip.literal(f.attr("name")), raw(f, "values"))
            for f in b.blocks("cost_filter")
        ]
        if (
            filters != [("Service", BEDROCK)]
            or b.block("filter_expression") is not None
        ):
            found.append(
                f"{name}: not filtered to the service names the Author gives, {BEDROCK}"
            )
        # Usage, not net of credits: a credit would hide the spend from the safety net (T028's review, nit 4).
        costs = b.blocks("cost_types")
        if len(costs) != 1 or ip.literal(costs[0].attr("include_credit")) is not False:
            found.append(f"{name}: counts credits against the spend")
        found += _notifications(b)
    return found


def check_server_budget(root: dict[str, list]) -> list[str]:
    found_here = _budget(root, "h4-server-month")
    if len(found_here) != 1:
        return ["h4-server-month: missing"]
    b = found_here[0]
    found = []
    if (
        not refers(b, "limit_amount", "var.server_budget_usd")
        or ip.literal(b.attr("limit_unit")) != "USD"
    ):
        found.append(
            "h4-server-month: limit_amount isn't var.server_budget_usd, in USD"
        )
    if (
        ip.literal(b.attr("time_unit")) != "MONTHLY"
        or ip.literal(b.attr("budget_type")) != "COST"
    ):
        found.append("h4-server-month: isn't a MONTHLY COST budget")
    # hashicorp/aws 6.72.0 refuses filter_expression without metrics ("all of `filter_expression,metrics` must be
    # specified", the Author's T027 plan, 2026-11-11). Unblended cost: the account has no credits (his answer).
    if re.sub(r"\s", "", raw(b, "metrics")) != '["UnblendedCost"]':
        found.append(
            'h4-server-month: metrics isn\'t ["UnblendedCost"], which filter_expression needs'
        )
    # The shared account (spec.md Assumptions, "One account, shared with the Author's other work"; ADR 0047): every
    # cost tagged project = h4reet-ai but Bedrock's, so the Author's other work never trips the server action. Two
    # `and` terms: not Bedrock's services, and the project's tag, as default_tags writes it.
    fe = b.block("filter_expression")
    terms = fe.blocks("and") if fe is not None else []
    excluded = [t.block("not") for t in terms if t.block("not") is not None]
    dims = excluded[0].block("dimensions") if len(excluded) == 1 else None
    tags = [t.block("tags") for t in terms if t.block("tags") is not None]
    tag = tags[0] if len(tags) == 1 else None
    if (
        b.blocks("cost_filter")
        or fe is None
        or len(fe.body) != 2
        or len(terms) != 2
        or any(len(t.body) != 1 for t in terms)
        or dims is None
        or len(excluded[0].body) != 1
        or len(dims.body) != 2
        or ip.literal(dims.attr("key")) != "SERVICE"
        or raw(dims, "values") != BEDROCK
        or tag is None
        or len(tag.body) != 2
        or ip.literal(tag.attr("key")) != "project"
        or re.sub(r"\s", "", raw(tag, "values")) != '["h4reet-ai"]'
    ):
        found.append(
            "h4-server-month: doesn't count every cost of this project but Bedrock's"
        )
    found += _notifications(b)
    return found


def check_anomaly(root: dict[str, list]) -> list[str]:
    found = []
    monitors = resource(root, "aws_ce_anomaly_monitor")
    if len(monitors) != 1:
        return ["anomaly monitor: exactly one is needed"]
    m = monitors[0]
    if (
        ip.literal(m.attr("monitor_type")) != "DIMENSIONAL"
        or ip.literal(m.attr("monitor_dimension")) != "SERVICE"
    ):
        found.append("anomaly monitor: isn't the account's DIMENSIONAL SERVICE monitor")
    subs = resource(root, "aws_ce_anomaly_subscription")
    if len(subs) != 1:
        return found + ["anomaly subscription: exactly one is needed"]
    s = subs[0]
    if ip.literal(s.attr("frequency")) != "IMMEDIATE":
        found.append("anomaly subscription: frequency isn't IMMEDIATE")
    if not refers(s, "monitor_arn_list", f"aws_ce_anomaly_monitor.{m.labels[1]}.arn"):
        found.append("anomaly subscription: doesn't watch the monitor")
    subscribers = s.blocks("subscriber")
    if [(ip.literal(x.attr("type")), raw(x, "address")) for x in subscribers] != [
        ("SNS", TOPIC)
    ]:
        found.append("anomaly subscription: its subscriber isn't h4-alerts alone")
    te = s.block("threshold_expression")
    dim = te.block("dimension") if te is not None else None
    if (
        dim is None
        or ip.literal(dim.attr("key")) != "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
        or ip.literal(dim.attr("match_options")) != ["GREATER_THAN_OR_EQUAL"]
        or ip.literal(dim.attr("values")) != ["1"]
    ):
        found.append("anomaly subscription: threshold isn't an impact of $1 or more")
    return found


def check_topic(root: dict[str, list]) -> list[str]:
    topics = resource(root, "aws_sns_topic", "alerts")
    if len(topics) != 1 or ip.literal(topics[0].attr("name")) != "h4-alerts":
        return ["h4-alerts: aws_sns_topic.alerts named h4-alerts is missing"]
    found = []
    subs = resource(root, "aws_sns_topic_subscription")
    email = [s for s in subs if ip.literal(s.attr("protocol")) == "email"]
    if len(email) != 1 or len(subs) != 1:
        found.append(
            "h4-alerts: needs exactly one subscription, the email one (Telegram's comes with group 4)"
        )
    for s in email:
        if raw(s, "endpoint") != "var.alert_email":
            found.append(
                "h4-alerts: the email subscription's endpoint isn't var.alert_email"
            )
        if raw(s, "topic_arn") != TOPIC:
            found.append("h4-alerts: the email subscription isn't on h4-alerts")
    policies = resource(root, "aws_sns_topic_policy", "alerts")
    if (
        len(policies) != 1
        or raw(policies[0], "policy") != "data.aws_iam_policy_document.alerts.json"
    ):
        return found + [
            "h4-alerts: its policy isn't data.aws_iam_policy_document.alerts"
        ]
    docs = resource(root, "aws_iam_policy_document", "alerts", kind="data")
    statements = docs[0].blocks("statement") if len(docs) == 1 else []
    publishers = set()
    for st in statements:
        principals = [
            (
                ip.literal(p.attr("type")),
                tuple(as_list(ip.literal(p.attr("identifiers")))),
            )
            for p in st.blocks("principals")
        ]
        conditions = {ip.literal(c.attr("variable")) for c in st.blocks("condition")}
        if (
            ip.literal(st.attr("actions")) != ["sns:Publish"]
            or raw(st, "resources") != f"[{TOPIC}]"
            or len(principals) != 1
            or principals[0][0] != "Service"
            or "aws:SourceAccount" not in conditions
            or (
                st.attr("effect") is not None
                and ip.literal(st.attr("effect")) != "Allow"
            )
        ):
            found.append(
                "h4-alerts: its policy lets a principal other than Budgets and Cost Anomaly Detection publish, "
                "or not for this account alone"
            )
            continue
        publishers.update(principals[0][1])
    if publishers != {"budgets.amazonaws.com", "costalerts.amazonaws.com"}:
        found.append(
            "h4-alerts: its policy lets a principal other than Budgets and Cost Anomaly Detection publish, "
            "or not for this account alone"
        )
    return sorted(set(found), key=found.index)


def check_tags(root: dict[str, list]) -> list[str]:
    found = []
    for b in blocks(root, "resource"):
        if len(b.labels) != 2 or b.labels[0] not in ip.TAGGABLE:
            continue
        tags = ip.literal(b.attr("tags"))
        if not (
            isinstance(tags, dict)
            and isinstance(tags.get("component"), str)
            and tags["component"]
        ):
            found.append(f"tags: {'.'.join(b.labels)} sets no component")
    return found


def check_files(root: dict[str, list]) -> list[str]:
    """Budgets, cost anomaly, SNS, and IAM resources live only in the protected files (FR-012), as rule T5 reads
    them: resources, not data sources, so main.tf's policy document for the state bucket may stay beside it."""
    found = []
    for name, body in root.items():
        if name in PROTECTED_FILES:
            continue
        for b in body:
            if (
                isinstance(b, ip.Block)
                and b.type == "resource"
                and len(b.labels) == 2
                and b.labels[0].startswith(PROTECTED_KINDS)
            ):
                found.append(
                    f"files: {'.'.join(b.labels)} lives outside budgets.tf and alerts.tf"
                )
    return found


CHECKS = (
    check_versions,
    check_provider,
    check_variables,
    check_state_bucket,
    check_model_budgets,
    check_server_budget,
    check_anomaly,
    check_topic,
    check_tags,
    check_files,
)


def problems(root: dict[str, list], pinned: dict[str, str] | None = None) -> list[str]:
    pinned = pins() if pinned is None else pinned
    found: list[str] = []
    for check in CHECKS:
        found += check(root, pinned) if check is check_versions else check(root)  # type: ignore[call-arg]
    return found


# ----------------------------------------------------------------------------------------------------------------------
# The fixtures: one defect each.


def fixture(path: Path) -> tuple[list, list[tuple[str, ...]], str | None, list[str]]:
    text = path.read_text(encoding="utf-8")
    expect = [
        m.group(1).strip() for m in re.finditer(r"^# expect: (.+)$", text, re.MULTILINE)
    ]
    drops = [
        tuple(m.group(1).split())
        for m in re.finditer(r"^# drop: (.+)$", text, re.MULTILINE)
    ]
    into = next(
        (
            m.group(1).strip()
            for m in re.finditer(r"^# into: (.+)$", text, re.MULTILINE)
        ),
        None,
    )
    return list(ip.parse_hcl(text)), drops, into, expect


def address(block) -> tuple[str, ...]:
    return (block.type, *block.labels)


def mutated(root: dict[str, list], path: Path) -> tuple[dict[str, list], list[str]]:
    body, drops, into, expect = fixture(path)
    out = {name: list(blocks_) for name, blocks_ in root.items()}
    replaced = {address(b) for b in body if isinstance(b, ip.Block)} | set(drops)
    origin: dict[tuple[str, ...], str] = {}
    for name, blocks_ in out.items():
        for b in blocks_:
            if isinstance(b, ip.Block) and address(b) in replaced:
                origin[address(b)] = name
        out[name] = [
            b
            for b in blocks_
            if not (isinstance(b, ip.Block) and address(b) in replaced)
        ]
    for b in body:
        target = into or origin.get(address(b), "main.tf")
        out.setdefault(target, []).append(b)
    return out, expect


FIXTURE_FILES = sorted(FIXTURES.glob("*.tf"))


# ----------------------------------------------------------------------------------------------------------------------
# The tests.


def test_the_root_holds_its_six_files_with_the_protected_two_from_p_i1_until_applied() -> (
    None
):
    texts = root_texts()
    assert sorted(texts) == sorted(FILES), sorted(set(FILES) - set(texts))
    for name in PROTECTED_FILES:
        if not (ROOT / name).is_file():
            assert (
                from_patch(PI1.read_text(encoding="utf-8"), f"infra/bootstrap/{name}")
                is not None
            )


def test_every_file_reads_as_hcl() -> None:
    for name, text in root_texts().items():
        ip.parse_hcl(
            text
        )  # raises HclError, the policy's T0, on anything it can't read
        assert name.endswith(".tf")


def test_terraform_and_the_provider_are_pinned_and_the_state_starts_local() -> None:
    assert check_versions(parsed(root_texts()), pins()) == []


def test_default_tags_name_the_project_and_the_account_environment() -> None:
    assert check_provider(parsed(root_texts())) == []


def test_the_variables_are_the_ones_the_deny_list_names_and_the_email_is_sensitive() -> (
    None
):
    assert check_variables(parsed(root_texts())) == []


def test_the_state_bucket_is_versioned_encrypted_private_and_tls_only() -> None:
    assert check_state_bucket(parsed(root_texts())) == []


def test_the_model_budgets_are_20_a_month_and_5_a_day_on_bedrocks_cost() -> None:
    assert check_model_budgets(parsed(root_texts())) == []


def test_the_server_budget_is_the_authors_figure_on_every_cost_but_bedrocks() -> None:
    assert check_server_budget(parsed(root_texts())) == []


def test_the_anomaly_monitor_alerts_at_once_on_a_dollar() -> None:
    assert check_anomaly(parsed(root_texts())) == []


def test_h4_alerts_mails_the_sensitive_address_and_only_budgets_and_anomalies_publish() -> (
    None
):
    assert check_topic(parsed(root_texts())) == []


def test_every_taggable_resource_names_its_component() -> None:
    assert check_tags(parsed(root_texts())) == []


def test_the_protected_kinds_live_only_in_the_protected_files() -> None:
    assert check_files(parsed(root_texts())) == []


def test_the_root_has_no_problem() -> None:
    assert problems(parsed(root_texts())) == []


def policy_on_a_copy(
    tmp_path: Path, lockfile: bool
) -> subprocess.CompletedProcess[str]:
    """P-1's policy, by its CLI as make infra-check runs it, on a copy of the root (P-I1's files included)."""
    root = tmp_path / "copy" / "infra" / "bootstrap"
    root.mkdir(parents=True)
    for name, text in root_texts().items():
        (root / name).write_text(text, encoding="utf-8")
    (tmp_path / "copy" / ".devcontainer").mkdir()
    (tmp_path / "copy" / ".devcontainer" / "toolchain.vars").write_bytes(
        PINS.read_bytes()
    )
    if lockfile:
        # A stand-in for the Author's lockfile: the pinned version, which is what rule T10 reads.
        pin = pins()["TERRAFORM_AWS_PROVIDER_VERSION"]
        (root / ".terraform.lock.hcl").write_text(
            f'provider "registry.terraform.io/hashicorp/aws" {{\n  version     = "{pin}"\n  constraints = "{pin}"\n}}\n',
            encoding="utf-8",
        )
    return subprocess.run(
        [
            sys.executable,
            "-I",
            "-B",
            "-X",
            "pycache_prefix=/dev/null",
            str(READER),
            "--root",
            str(tmp_path / "copy"),
        ],
        capture_output=True,
        text=True,
        check=False,
        timeout=60,
    )


def test_the_policy_passes_the_root_but_for_the_authors_lockfile(
    tmp_path: Path,
) -> None:
    # T028's review, nit 5: the policy's CLI on a copy, not its functions. The one finding without a lockfile is T10's,
    # the Author's step from his mirror (tasks.md T023); with a stand-in, it passes.
    done = policy_on_a_copy(tmp_path, lockfile=False)
    assert done.returncode == 1, done.stdout + done.stderr
    assert done.stdout.splitlines()[0] == "T10 infra/bootstrap:0 no .terraform.lock.hcl"
    assert done.stdout.splitlines()[1:] == ["infra-policy: 1 finding in 6 files"]
    done = policy_on_a_copy(tmp_path / "with-lock", lockfile=True)
    assert done.returncode == 0, done.stdout + done.stderr
    assert done.stdout.strip() == "infra-policy: PASS, 6 files"


@pytest.mark.parametrize("path", FIXTURE_FILES, ids=[p.stem for p in FIXTURE_FILES])
def test_each_fixture_is_found_as_its_defect(path: Path) -> None:
    root = parsed(root_texts())
    assert problems(root) == [], "the root itself must be clean first"
    changed, expect = mutated(root, path)
    assert expect, f"{path.name} names no problem it expects"
    found = problems(changed)
    for want in expect:
        assert any(want in f for f in found), (want, found)
    assert len(found) == len(expect), found


def test_every_check_has_a_fixture_that_fails_it() -> None:
    root = parsed(root_texts())
    caught = set()
    for path in FIXTURE_FILES:
        changed, _ = mutated(root, path)
        for check in CHECKS:
            got = check(changed, pins()) if check is check_versions else check(changed)  # type: ignore[call-arg]
            if got:
                caught.add(check.__name__)
    assert caught == {c.__name__ for c in CHECKS}


def test_the_patch_reader_takes_a_new_files_lines_only() -> None:
    patch = (
        "a preamble line\n"
        "--- /dev/null\n+++ b/infra/bootstrap/x.tf\n@@ -0,0 +1,2 @@\n+one\n+two\n"
        "--- a/y\n+++ b/y\n@@ -1 +1 @@\n-a\n+b\n"
    )
    assert from_patch(patch, "infra/bootstrap/x.tf") == "one\ntwo\n"
    assert from_patch(patch, "y") is None
    assert from_patch(patch, "infra/bootstrap/z.tf") is None
