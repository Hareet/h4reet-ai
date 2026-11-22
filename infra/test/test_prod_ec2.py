"""Spec 001 group 7, EC2 (tasks.md T084, T180; FR-013, FR-023, FR-043, FR-044, FR-050, FR-069; research.md R-04,
R-15, R-22, R-30; plan.md §5.1 and §16, "Why a switch", "No root holds another root's instance or health-check ID",
and "Group 7, as built"): infra/prod's EC2, read with group 1's standard-library HCL reader, never with Terraform.

What the root must hold:
  - EC2's launch templates, from spec 032 (its FR-001 to FR-004, FR-010, FR-015; ADR 0057), in the protected
    ec2-market.tf, one for each type on `local.ec2_types`: spot, persistent, stopping on interruption (T11), at its
    type's price ceiling; IMDSv2 with hop limit 1 (T13), its tags in its metadata, which write_env.py and preflight read
    (research.md R-28); standard credits for a burstable type; its one interface, made in the public subnet at
    10.42.0.20 with an address AWS assigns at each start; its role's profile; an encrypted gp3 root volume; what it
    launches tagged Name = h4-prod-ec2 with project and component (T154); replaced when terraform_data.ec2_generation
    changes (T097). No instance is Terraform's: the one it made is forgotten by a removed block that keeps it, and the
    current one is read by its Name tag;
  - ec2.tf: EC2's types, first R-04's t4g.large, then Graviton types with its memory or more, each with a price ceiling
    no higher than t4g.large's on-demand price; the generation's terraform_data, from `local.ec2_generation` and the
    user data's SHA-256; the data volume, a resource of its own, kept across a replace, tagged (T154), which
    h4-ec2-start attaches at /dev/sdf (its attachment forgotten, never destroyed);
  - EC2's security group: the relay block's 8085 and the collector's 4318 from the tunnel end's two fixed addresses
    alone; out, HTTPS through the egress proxy and the VPC;
  - its two ordinary roles (R-15), in iam.tf: h4-prod-ec2, the instance's, and h4-prod-gateway, which only h4-prod-ec2
    may assume and which holds Bedrock on the one inference profile alone;
  - /h4reet/prod/ec2-instance-id, a String holding EC2's ID, in handover.tf, made from the instance read by tag, its
    value the start function's after (ignored drift);
  - killswitch.tf: the server action, AWS-StopEC2Instance on EC2's ID from this root (read by tag), whose execution role
    may run only that document and its reverse on the instance tagged h4-prod-ec2; and EC2's model action, a second action on h4-model-month by its
    name, attaching h4-deny-paid-models to h4-prod-gateway alone, with its own execution role (T180). The account's
    model action gains no target.

ec2-market.tf, iam.tf, handover.tf, and killswitch.tf are protected, so they reach the branch only with the Author's
patch P-I4 (docs/merge-requests/2026-11-13-feat-001-pi4-ec2.patch), on top of P-I3 and P-I7. Until he applies it these
tests read them as the patches leave them (infra/test/patches.py). Each fixture in fixtures/prod-ec2/ is one defect,
read as test_prod_network.py's fixtures are.
"""

from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
FIXTURES = HERE / "fixtures" / "prod-ec2"


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


if not (REPO / "tools" / "gates" / "infra_policy.py").is_file():
    pytest.skip("PLANNED (T010): the reader arrives with P-1", allow_module_level=True)

net = _load("prod_network_for_ec2", HERE / "test_prod_network.py")
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
ADDRESS = "10.42.0.20"
TUNNEL_END = '["10.42.0.10/32", "10.42.1.10/32"]'
TOPIC_ARN = f"arn:aws:sns:us-east-1:{ACCOUNT_ID}:h4-alerts"
DENY_ARN = f"arn:aws:iam::{ACCOUNT_ID}:policy/h4-deny-paid-models"
PROFILE = f"arn:aws:bedrock:us-east-1:{ACCOUNT_ID}:inference-profile/us.anthropic.claude-haiku-5-5"
ECR = f"arn:aws:ecr:us-east-1:{ACCOUNT_ID}:repository/h4reet/*"
PARAMETERS = (
    f'[ "arn:aws:ssm:us-east-1:{ACCOUNT_ID}:parameter/h4reet/ec2/*", '
    f'"arn:aws:ssm:us-east-1:{ACCOUNT_ID}:parameter/h4reet/hosts/*", ]'
)
EC2_GRANTS = {
    "ecr:GetAuthorizationToken": '["*"]',
    "ecr:BatchGetImage": f'["{ECR}"]',
    "ecr:GetDownloadUrlForLayer": f'["{ECR}"]',
    "ecr:BatchCheckLayerAvailability": f'["{ECR}"]',
    "ssm:GetParameter": PARAMETERS,
    "ssm:GetParameters": PARAMETERS,
    "kms:Decrypt": f'["arn:aws:kms:us-east-1:{ACCOUNT_ID}:key/*"]',
    "s3:GetObject": '[ "arn:aws:s3:::h4reet-ai-releases-*/releases/*", "arn:aws:s3:::h4reet-ai-releases-*/trees/*", '
    '"arn:aws:s3:::h4reet-ai-releases-*/tools/*", ]',
    "s3:ListBucket": '["arn:aws:s3:::h4reet-ai-releases-*"]',
    "sns:Publish": f'["{TOPIC_ARN}"]',
    # The credential timer's assume of the gateway's role, the one way EC2's gateway reaches Bedrock (R-15).
    "sts:AssumeRole": "[aws_iam_role.gateway.arn]",
}
EC2_GRANTS.update({action: '["*"]' for action in net.SESSION_MANAGER})
GATEWAY_GRANTS = {
    "bedrock:InvokeModel": None,
    "bedrock:InvokeModelWithResponseStream": None,
}


def root() -> dict[str, list]:
    return net.parsed(net.root_texts())


def ec2(r: dict[str, list]):
    return one(r, "aws_launch_template", "ec2")


def check_instance(r: dict[str, list]) -> list[str]:
    t = ec2(r)
    if t is None:
        return ["ec2: aws_launch_template.ec2 is missing"]
    found = []
    if where(r, t) != "ec2-market.tf":
        found.append("ec2: the templates live outside ec2-market.tf")
    if raw(t, "for_each") != "local.ec2_templates":
        found.append("ec2: the templates aren't one for each type on local.ec2_types")
    src = ip.Source("infra/prod/ec2-market.tf", "", ip.Body([t]))
    for f in ip.t11_spot(src) + ip.t13_imds(src):
        found.append(f"ec2: {f.message}")
    spot = t.block("instance_market_options")
    so = spot.block("spot_options") if spot is not None else None
    if so is None or raw(so, "max_price") != "each.value.max_price":
        found.append("ec2: a template doesn't carry its type's price ceiling")
    credits = [d for d in t.blocks("dynamic") if d.labels == ["credit_specification"]]
    if not (
        len(credits) == 1
        and re.sub(r"\s+", "", raw(credits[0], "for_each"))
        == 'startswith(each.key,"t")?["standard"]:[]'
    ):
        found.append("ec2: its CPU credits aren't standard (research.md R-04)")
    metadata = t.block("metadata_options")
    if metadata is None or lit(metadata, "instance_metadata_tags") != "enabled":
        found.append(
            "ec2: its tags aren't in its metadata, which write_env.py and preflight read (R-28)"
        )
    interfaces = t.blocks("network_interfaces")
    n = interfaces[0] if len(interfaces) == 1 else None
    if (
        n is None
        or lit(n, "device_index") != 0
        or raw(n, "subnet_id") != "aws_subnet.public.id"
        or lit(n, "private_ip_address") != ADDRESS
        or lit(n, "associate_public_ip_address") is not True
        or raw(n, "security_groups") != "[aws_security_group.ec2.id]"
        or n.attr("network_interface_id") is not None
    ):
        found.append(
            f"ec2: its one interface isn't {ADDRESS} in the public subnet, with an assigned address and EC2's group"
        )
    if [address(e) for e in resource(r, "aws_eip") if "ec2" in raw(e, "instance")]:
        found.append("ec2: it has a second interface or a fixed address")
    profile = t.block("iam_instance_profile")
    if profile is None or raw(profile, "name") != "aws_iam_instance_profile.ec2.name":
        found.append("ec2: it doesn't run as its instance profile")
    mappings = t.blocks("block_device_mappings")
    disk = mappings[0].block("ebs") if mappings else None
    if (
        disk is None
        or lit(mappings[0], "device_name") != "/dev/xvda"
        or lit(disk, "encrypted") is not True
        or lit(disk, "volume_type") != "gp3"
    ):
        found.append("ec2: its root volume isn't encrypted gp3")
    if len(mappings) > 1:
        found.append(
            "ec2: its data volume is the instance's, so a replace would take it"
        )
    tagged = [d for d in t.blocks("dynamic") if d.labels == ["tag_specifications"]]
    content = tagged[0].block("content") if len(tagged) == 1 else None
    tags = lit(content, "tags") if content is not None else None
    if not (
        isinstance(tags, dict)
        and tags.get("Name") == "h4-prod-ec2"
        and tags.get("project") == "h4reet-ai"
        and tags.get("component") == "ec2"
        and all(
            f'"{kind}"' in raw(tagged[0], "for_each")
            for kind in (
                "instance",
                "volume",
                "network-interface",
                "spot-instances-request",
            )
        )
    ):
        found.append(
            "ec2: what a template launches isn't tagged Name = h4-prod-ec2 with project and component (T154)"
        )
    if raw(t, "instance_type") != "each.key":
        found.append("ec2: a template doesn't read its own type")
    lc = t.block("lifecycle")
    if (
        lc is None
        or raw(lc, "replace_triggered_by") != "[terraform_data.ec2_generation]"
    ):
        found.append(
            "ec2: a new generation or a changed host file doesn't replace it (T097)"
        )
    if lc is None or raw(lc, "ignore_changes") != "[image_id, user_data]":
        found.append(
            "ec2: it doesn't ignore its image's and its user data's drift, so a plan could restart it"
        )
    if net.removed_from(r, "aws_instance.ec2") is None:
        found.append(
            "ec2: aws_instance.ec2 isn't forgotten by a removed block that keeps it"
        )
    current = one(r, "aws_instance", "ec2", kind="data")
    if (
        current is None
        or where(r, current) != "ec2.tf"
        or "h4-prod-ec2" not in raw(current.block("filter"), "values")
    ):
        found.append(
            "ec2: the root doesn't read the current EC2 instance by its Name tag"
        )
    return found


def check_generation(r: dict[str, list]) -> list[str]:
    found = []
    mine = net.locals_in(r, "ec2.tf")
    held = one(r, "terraform_data", "ec2_generation")
    if (
        held is None
        or where(r, held) != "ec2.tf"
        or "local.ec2_generation" not in raw(held, "input")
        or "sha256(local.ec2_user_data)" not in raw(held, "input")
    ):
        found.append(
            "generation: no terraform_data.ec2_generation in ec2.tf holds local.ec2_generation and the user data's SHA-256"
        )
    generation = mine.get("ec2_generation")
    # W1 held 1; W2's T175 set 2, so W2's block showed EC2 replaced, and SC-005 was checked after W2's apply (T097).
    if generation is None or ip.literal(generation) != 2:
        found.append("generation: ec2.tf's local.ec2_generation isn't W2's 2")
    listed = ip.literal(mine["ec2_types"]) if "ec2_types" in mine else None
    if not (
        isinstance(listed, list)
        and listed
        and all(isinstance(e, dict) and {"type", "max_price"} <= set(e) for e in listed)
    ):
        found.append(
            "type: ec2.tf's local.ec2_types isn't a list of types and ceilings"
        )
    else:
        found += net.type_list_problems(listed, "t4g.large", "EC2")
    elsewhere = [
        n
        for n in r
        if n != "ec2.tf"
        and {"ec2_type", "ec2_types", "ec2_generation"} & set(net.locals_in(r, n))
    ]
    if elsewhere:
        found.append(f"type: EC2's locals are set in {', '.join(elsewhere)} too")
    return found


def check_volume(r: dict[str, list]) -> list[str]:
    v = one(r, "aws_ebs_volume", "ec2_data")
    if v is None:
        return ["volume: aws_ebs_volume.ec2_data is missing"]
    found = []
    if where(r, v) != "ec2.tf":
        found.append("volume: it lives outside ec2.tf")
    if (
        lit(v, "encrypted") is not True
        or lit(v, "type") != "gp3"
        or raw(v, "availability_zone") != "local.zone"
    ):
        found.append("volume: it isn't encrypted gp3 in EC2's zone")
    tags = lit(v, "tags")
    if not (
        isinstance(tags, dict)
        and tags.get("component") == "ec2"
        and tags.get("Name") == "h4-ec2-data"
    ):
        found.append(
            "volume: it isn't tagged Name = h4-ec2-data, by which h4-ec2-start finds it, and component = ec2 (T154)"
        )
    if resource(r, "aws_volume_attachment"):
        found.append(
            "volume: Terraform attaches a volume, which h4-ec2-start does for each instance it launches (spec 032)"
        )
    if net.removed_from(r, "aws_volume_attachment.ec2_data") is None:
        found.append(
            "volume: its attachment isn't forgotten by a removed block that keeps it, so the plan would detach it"
        )
    return found


def check_stopped(r: dict[str, list]) -> list[str]:
    # W1's stop, aws_ec2_instance_state.ec2_w1, went with W2's switch; from spec 032 no plan holds an instance's state,
    # which would fight the start function and the guard (FR-072).
    if resource(r, "aws_ec2_instance_state"):
        return [
            "stopped: a plan holds an instance's state, which would fight the start function and the guard"
        ]
    return []


def check_group(r: dict[str, list]) -> list[str]:
    found = []
    rules = net.group_rules(r, "ec2")
    if sorted(rules) != sorted(
        [(8085, f"cidr_blocks={TUNNEL_END}"), (4318, f"cidr_blocks={TUNNEL_END}")]
    ):
        found.append(
            "group: EC2 doesn't admit exactly 8085 and 4318 from the tunnel end's two addresses"
        )
    g = one(r, "aws_security_group", "ec2")
    out = sorted(
        (lit(e, "from_port"), lit(e, "protocol"), raw(e, "cidr_blocks"))
        for e in (g.blocks("egress") if g is not None else [])
    )
    if out != sorted(
        [
            (443, "tcp", '["0.0.0.0/0"]'),
            (465, "tcp", '["0.0.0.0/0"]'),
            (0, "-1", "[aws_vpc.prod.cidr_block]"),
        ]
    ):
        found.append(
            "group: EC2's way out isn't 443 and SMTP's 465, through its proxies, and the VPC"
        )
    return found


def documents_of(
    r: dict[str, list], role: str, once: bool = True
) -> tuple[list[str], dict[str, str], dict[str, list]]:
    """A role's grants, failing closed as test_prod_network.check_role does: (problems, action → resources, action →
    conditions)."""
    found: list[str] = []
    granted: dict[str, str] = {}
    conditions: dict[str, list] = {}
    me = f"aws_iam_role.{role}"
    for p in resource(r, "aws_iam_role_policy"):
        if raw(p, "role") not in (f"{me}.id", f"{me}.name"):
            continue
        doc = net.document(r, raw(p, "policy"))
        if doc is None:
            found.append(
                f"{role}: {address(p)}'s policy isn't a data.aws_iam_policy_document this root reads"
            )
            continue
        for key in ("source_policy_documents", "override_policy_documents"):
            if doc.attr(key) is not None:
                found.append(
                    f"{role}: {address(doc)} takes {key}, which the check doesn't read"
                )
        if doc.blocks("dynamic"):
            found.append(
                f"{role}: {address(doc)} has a dynamic block, which the check doesn't read"
            )
        for st in doc.blocks("statement"):
            actions = lit(st, "actions")
            if (
                st.attr("effect") is not None
                and lit(st, "effect") not in ("Allow", "Deny")
            ) or (
                st.attr("actions") is not None
                and not (
                    isinstance(actions, list)
                    and all(isinstance(a, str) for a in actions)
                )
            ):
                found.append(
                    f"{role}: {address(doc)} has a statement whose effect or actions aren't literals"
                )
            if any(
                st.attr(k) is not None
                for k in ("not_actions", "not_resources", "not_principals")
            ):
                found.append(f"{role}: {address(doc)} grants by exclusion")
        for s in net.statements(doc):
            if s["effect"] != "Allow":
                continue
            for a in s["actions"]:
                if a in granted and once:
                    found.append(f"{role}: {a} is granted twice")
                granted[a] = s["resources"]
                conditions[a] = s["conditions"]
    managed = [
        address(a)
        for a in resource(r, "aws_iam_role_policy_attachment")
        + resource(r, "aws_iam_policy_attachment")
        + resource(r, "aws_iam_role_policy_attachments_exclusive")
        if me in raw(a, "role") or me in raw(a, "roles") or me in raw(a, "role_name")
    ]
    role_block = one(r, "aws_iam_role", role)
    if managed or (role_block is not None and lit(role_block, "managed_policy_arns")):
        found.append(
            f"{role}: a managed policy is attached, whose grants this root doesn't read"
        )
    if role_block is not None and role_block.blocks("inline_policy"):
        found.append(f"{role}: it holds an inline_policy block")
    return found, granted, conditions


def check_ec2_role(r: dict[str, list]) -> list[str]:
    role = one(r, "aws_iam_role", "ec2")
    if role is None or lit(role, "name") != "h4-prod-ec2":
        return ["h4-prod-ec2: aws_iam_role.ec2 is missing"]
    found = []
    if where(r, role) != "iam.tf":
        found.append("h4-prod-ec2: it lives outside iam.tf")
    trust = net.statements(net.document(r, raw(role, "assume_role_policy")))
    if [(s["actions"], s["principals"]) for s in trust] != [
        ({"sts:AssumeRole"}, [("Service", '["ec2.amazonaws.com"]')])
    ]:
        found.append("h4-prod-ec2: it trusts something other than EC2 itself")
    if lit(role, "path") not in (None, "/"):
        found.append("h4-prod-ec2: it isn't an ordinary role at /")
    profile = one(r, "aws_iam_instance_profile", "ec2")
    if profile is None or raw(profile, "role") != "aws_iam_role.ec2.name":
        found.append("h4-prod-ec2: the instance profile isn't the role's")
    problems, granted, conditions = documents_of(r, "ec2")
    found += problems
    if set(granted) != set(EC2_GRANTS):
        found.append(
            f"h4-prod-ec2: its actions aren't R-15's: {sorted(set(granted) ^ set(EC2_GRANTS))}"
        )
    for action, resources in EC2_GRANTS.items():
        if action in granted and granted[action] != resources:
            found.append(f"h4-prod-ec2: {action} reaches {granted[action]}")
    if "kms:Decrypt" in granted and not (
        ("StringEquals", "kms:ViaService", '["ssm.us-east-1.amazonaws.com"]')
        in conditions["kms:Decrypt"]
        and ("StringLike", "kms:EncryptionContext:PARAMETER_ARN", PARAMETERS)
        in conditions["kms:Decrypt"]
    ):
        found.append(
            "h4-prod-ec2: kms:Decrypt isn't held to Parameter Store and its own parameters"
        )
    for action in ("s3:GetObject", "s3:ListBucket"):
        if action in granted and not any(
            v == "aws:ResourceAccount" for _, v, _ in conditions.get(action, [])
        ):
            found.append(f"h4-prod-ec2: {action} isn't held to this account's buckets")
    return found


def check_gateway_role(r: dict[str, list]) -> list[str]:
    role = one(r, "aws_iam_role", "gateway")
    if role is None or lit(role, "name") != "h4-prod-gateway":
        return ["h4-prod-gateway: aws_iam_role.gateway is missing"]
    found = []
    if where(r, role) != "iam.tf":
        found.append("h4-prod-gateway: it lives outside iam.tf")
    if lit(role, "path") not in (None, "/"):
        found.append(
            "h4-prod-gateway: it isn't an ordinary role at /, which the model action's deny reaches"
        )
    trust = net.statements(net.document(r, raw(role, "assume_role_policy")))
    if [(s["actions"], s["principals"], s["conditions"]) for s in trust] != [
        ({"sts:AssumeRole"}, [("AWS", "[aws_iam_role.ec2.arn]")], [])
    ]:
        found.append("h4-prod-gateway: something other than h4-prod-ec2 may assume it")
    # Bedrock's two actions in two statements: the profile, and its models through it.
    problems, granted, _ = documents_of(r, "gateway", once=False)
    found += problems
    if set(granted) != set(GATEWAY_GRANTS):
        found.append(
            f"h4-prod-gateway: its actions aren't Bedrock's two: {sorted(set(granted) ^ set(GATEWAY_GRANTS))}"
        )
    profile_statements = [
        s
        for p in resource(r, "aws_iam_role_policy")
        if raw(p, "role") in ("aws_iam_role.gateway.id", "aws_iam_role.gateway.name")
        for s in net.statements(net.document(r, raw(p, "policy")))
    ]
    reached = sorted(s["resources"] for s in profile_statements)
    want = sorted(
        [
            f'["{PROFILE}"]',
            '["arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-5-5*"]',
        ]
    )
    if reached != want:
        found.append(
            "h4-prod-gateway: Bedrock isn't the one inference profile and its models"
        )
    through = [
        s
        for s in profile_statements
        if "foundation-model" in s["resources"]
        and ("StringLike", "bedrock:InferenceProfileArn", f'["{PROFILE}"]')
        not in s["conditions"]
    ]
    if through:
        found.append(
            "h4-prod-gateway: its models are reachable other than through the profile"
        )
    return found


def execution_role(r: dict[str, list], action) -> tuple[str | None, list[str]]:
    m = re.fullmatch(
        r"aws_iam_role\.(\w+)\.arn", raw(action, "execution_role_arn").strip()
    )
    if not m:
        return None, [
            f"actions: {address(action)}'s execution role isn't a role this root makes"
        ]
    role = one(r, "aws_iam_role", m.group(1))
    found = []
    trust = (
        net.statements(net.document(r, raw(role, "assume_role_policy")))
        if role is not None
        else []
    )
    if [(s["actions"], s["principals"], s["conditions"]) for s in trust] != [
        (
            {"sts:AssumeRole"},
            [("Service", '["budgets.amazonaws.com"]')],
            [
                (
                    "StringEquals",
                    "aws:SourceAccount",
                    "[data.aws_caller_identity.current.account_id]",
                )
            ],
        )
    ]:
        found.append(
            f"actions: {m.group(1)} trusts something other than AWS Budgets for this account"
        )
    if role is not None and where(r, role) != "killswitch.tf":
        found.append(f"actions: {m.group(1)} lives outside killswitch.tf")
    return m.group(1), found


def budget_action(r: dict[str, list], budget: str, kind: str):
    return [
        a
        for a in resource(r, "aws_budgets_budget_action")
        if lit(a, "budget_name") == budget and lit(a, "action_type") == kind
    ]


def check_action_shape(r: dict[str, list], a) -> list[str]:
    found = []
    if where(r, a) != "killswitch.tf":
        found.append(f"actions: {address(a)} lives outside killswitch.tf")
    threshold = a.block("action_threshold")
    if (
        lit(a, "approval_model") != "AUTOMATIC"
        or lit(a, "notification_type") != "ACTUAL"
        or threshold is None
        or lit(threshold, "action_threshold_type") != "PERCENTAGE"
        or lit(threshold, "action_threshold_value") != 100
    ):
        found.append(f"actions: {address(a)} isn't automatic at 100% of actual")
    subscribers = [
        (lit(s, "subscription_type"), raw(s, "address")) for s in a.blocks("subscriber")
    ]
    if subscribers != [("SNS", f'"{TOPIC_ARN}"')]:
        found.append(
            f"actions: {address(a)} doesn't tell h4-alerts, by its name-built ARN"
        )
    tags = lit(a, "tags")
    if not (isinstance(tags, dict) and tags.get("component") == "kill-switch"):
        found.append(f"actions: {address(a)} isn't tagged component = kill-switch")
    if raw(a, "count") or raw(a, "for_each"):
        found.append(
            f"actions: {address(a)} waits behind a switch, though it needs no other root"
        )
    return found


def check_server_action(r: dict[str, list]) -> list[str]:
    actions = budget_action(r, "h4-server-month", "RUN_SSM_DOCUMENTS")
    if len(actions) != 1:
        return ["server action: no one RUN_SSM_DOCUMENTS action on h4-server-month"]
    a = actions[0]
    found = check_action_shape(r, a)
    d = a.block("definition")
    ssm = d.block("ssm_action_definition") if d is not None else None
    if (
        ssm is None
        or lit(ssm, "action_sub_type") != "STOP_EC2_INSTANCES"
        or raw(ssm, "instance_ids") != "[data.aws_instance.ec2.id]"
        or lit(ssm, "region") != "us-east-1"
    ):
        found.append(
            "server action: it doesn't stop EC2, by the ID this root reads by its tag"
        )
    name, problems = execution_role(r, a)
    found += problems
    if name is None:
        return found
    _, granted, conditions = documents_of(r, name)
    want = {
        "ssm:StartAutomationExecution": "[ "
        '"arn:aws:ssm:us-east-1:*:automation-definition/AWS-StopEC2Instance:*", '
        '"arn:aws:ssm:us-east-1:*:automation-definition/AWS-StartEC2Instance:*", ]',
        "ec2:StartInstances": f'["arn:aws:ec2:us-east-1:{ACCOUNT_ID}:instance/*"]',
        "ec2:StopInstances": f'["arn:aws:ec2:us-east-1:{ACCOUNT_ID}:instance/*"]',
        "ec2:DescribeInstances": '["*"]',
        "ec2:DescribeInstanceStatus": '["*"]',
    }
    if granted != want:
        found.append(
            f"server action: its role may do more than that document on EC2: {sorted(set(granted) ^ set(want))}"
        )
    for act in ("ec2:StartInstances", "ec2:StopInstances"):
        if act in granted and (
            "ForAnyValue:StringEquals",
            "aws:CalledVia",
            '["ssm.amazonaws.com"]',
        ) not in conditions.get(act, []):
            found.append(f"server action: {act} isn't held to Systems Manager's calls")
        # Spec 032: EC2 by its tag, since a replace gives it another ARN.
        if act in granted and (
            "StringEquals",
            "ec2:ResourceTag/Name",
            '["h4-prod-ec2"]',
        ) not in conditions.get(act, []):
            found.append(
                f"server action: {act} isn't held to the instance tagged h4-prod-ec2"
            )
    return found


def check_model_action(r: dict[str, list]) -> list[str]:
    actions = budget_action(r, "h4-model-month", "APPLY_IAM_POLICY")
    if len(actions) != 1:
        return [
            "model action: no one APPLY_IAM_POLICY action on h4-model-month in prod"
        ]
    a = actions[0]
    found = check_action_shape(r, a)
    d = a.block("definition")
    iam = d.block("iam_action_definition") if d is not None else None
    if (
        iam is None
        or raw(iam, "policy_arn") != f'"{DENY_ARN}"'
        or raw(iam, "roles") != "[aws_iam_role.gateway.name]"
        or iam.attr("groups") is not None
        or iam.attr("users") is not None
    ):
        found.append(
            "model action: it doesn't attach h4-deny-paid-models, by its name, to h4-prod-gateway alone"
        )
    name, problems = execution_role(r, a)
    found += problems
    if name is None:
        return found
    _, granted, conditions = documents_of(r, name)
    if granted != {
        "iam:AttachRolePolicy": "[aws_iam_role.gateway.arn]",
        "iam:DetachRolePolicy": "[aws_iam_role.gateway.arn]",
    } or ("ArnEquals", "iam:PolicyARN", f'["{DENY_ARN}"]') not in conditions.get(
        "iam:AttachRolePolicy", []
    ):
        found.append(
            "model action: its role may do more than attach and detach that policy on h4-prod-gateway"
        )
    return found


def check_instance_id(r: dict[str, list]) -> list[str]:
    found = [
        p
        for p in resource(r, "aws_ssm_parameter")
        if lit(p, "name") == "/h4reet/prod/ec2-instance-id"
    ]
    if len(found) != 1:
        return ["id: no one /h4reet/prod/ec2-instance-id parameter"]
    p = found[0]
    out = []
    lc = p.block("lifecycle")
    if (
        where(r, p) != "handover.tf"
        or lit(p, "type") != "String"
        or raw(p, "value") != "data.aws_instance.ec2.id"
    ):
        out.append(
            "id: /h4reet/prod/ec2-instance-id isn't handover.tf's String of EC2's ID"
        )
    if lc is None or raw(lc, "ignore_changes") != "[value]":
        out.append(
            "id: a plan would undo the ID h4-ec2-start writes after a replace (spec 032 FR-015)"
        )
    tags = lit(p, "tags")
    if not (isinstance(tags, dict) and tags.get("component")):
        out.append("id: the parameter sets no component")
    return out


CHECKS = (
    check_instance,
    check_generation,
    check_volume,
    check_stopped,
    check_group,
    check_ec2_role,
    check_gateway_role,
    check_server_action,
    check_model_action,
    check_instance_id,
)


def problems(r: dict[str, list]) -> list[str]:
    return [p for check in CHECKS for p in check(r)]


FIXTURE_FILES = sorted(FIXTURES.glob("*.tf"))


def test_ec2_is_spot_that_stops_imdsv2_one_interface_and_its_tagged_root() -> None:
    assert check_instance(root()) == []


def test_the_generation_and_the_type_are_ec2_tfs() -> None:
    assert check_generation(root()) == []


def test_the_data_volume_is_its_own_resource_tagged_and_attached() -> None:
    assert check_volume(root()) == []


def test_no_plan_holds_ec2s_state() -> None:
    assert check_stopped(root()) == []


def test_ec2_admits_the_tunnel_end_alone() -> None:
    assert check_group(root()) == []


def test_its_two_ordinary_roles() -> None:
    r = root()
    assert check_ec2_role(r) == []
    assert check_gateway_role(r) == []


def test_the_server_action_stops_ec2_from_this_root() -> None:
    assert check_server_action(root()) == []


def test_ec2s_model_action_is_prods_on_h4_prod_gateway_alone() -> None:
    assert check_model_action(root()) == []


def test_the_instance_id_parameter() -> None:
    assert check_instance_id(root()) == []


def test_the_root_has_no_problem_and_the_network_checks_still_pass() -> None:
    r = root()
    assert problems(r) == []
    assert net.problems(r) == []


def test_the_checks_pass_with_the_switch_on_as_p_w2_sets_it() -> None:
    assert problems(net.switched_on(root())) == []


def test_the_checks_pass_with_the_switch_off_as_w1_applied_it() -> None:
    assert problems(net.switched_off(root())) == []


def test_the_accounts_model_action_gains_no_target() -> None:
    account = net.parsed(net.account_texts())
    (action,) = [
        a
        for a in resource(account, "aws_budgets_budget_action")
        if lit(a, "budget_name") == "h4-model-month"
    ]
    iam = action.block("definition").block("iam_action_definition")
    assert raw(iam, "roles") == "[aws_iam_role.laptop_bedrock.name]"


@pytest.mark.parametrize("path", FIXTURE_FILES, ids=[p.stem for p in FIXTURE_FILES])
def test_each_fixture_is_found_as_its_defect(path: Path) -> None:
    r = root()
    assert problems(r) == [], "the root itself must be clean first"
    changed, expect = net.mutated(r, path)
    assert expect, f"{path.name} names no problem it expects"
    found = problems(changed)
    for want in expect:
        assert any(want in f for f in found), (want, found)
    assert len(found) == len(expect), found


def test_every_check_has_a_fixture_that_fails_it() -> None:
    r = root()
    caught = set()
    for path in FIXTURE_FILES:
        changed, _ = net.mutated(r, path)
        for check in CHECKS:
            if check(changed):
                caught.add(check.__name__)
    assert caught == {c.__name__ for c in CHECKS}
