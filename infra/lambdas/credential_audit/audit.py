#!/usr/bin/env python3
"""The credential audit (spec 001 FR-008, FR-013, SC-004; contracts/infra-records.md §4, and September's §7 at
00309c47; data-model.md §6.6 at 00309c47; tasks.md T025). No identity may hold a long-lived credential, and the
handful this spec makes stay as narrow as Terraform writes them.

    python3 -I -B -X pycache_prefix=/dev/null infra/lambdas/credential_audit/audit.py --terminal [--profile NAME]

Two ways in, one core:
  - in the Author's terminal, by make infra-audit and before every apply by make infra-verify: the AWS CLI with his SSO
    profile (passed by --profile, so none of the shell's AWS_* reaches it); it prints the result and exits 0 clean,
    1 with findings, 2 when it can't run. The sandbox refuses it: agent sessions hold no AWS session.
  - as the Lambda function h4-credential-audit, from group 4 on, weekly (tasks.md T034): handler(), with the AWS SDK
    the runtime's base image carries; it logs the result as one line of JSON, stores it at
    s3://$H4_AUDIT_BUCKET/audits/credential/<date>.json, and publishes any finding to $H4_ALERTS_TOPIC_ARN. The
    function runs on python3.14, arm64 (research.md R-02); this file holds to 3.12's syntax, the tests' interpreter.
The core is the standard library alone.

The findings, each naming a user, role, permission set, or provider by name, never a key's ID or the account's ID:
  iam_user_present                 an IAM user exists at all: a user is how a console password, a service-specific
                                   credential (Bedrock's long-term API keys among them), an SSH public key, or a signing
                                   certificate lives, each long-lived, and humans use SSO (FR-008; User Story 1's
                                   scenario 5). SES's SMTP credentials are an IAM user's access keys, so they count
  iam_user_access_key              an IAM user holds an access key, active or not
  root_access_key                  the root user holds one
  role_foreign_trust               a role's trust allows a principal outside the account, its services, and its
                                   Identity Center's SAML provider
  oidc_provider_present            an OIDC provider exists, before publication (FR-008: no CI identity)
  laptop_identity_not_terraform    h4-laptop-bedrock, or the laptop's Bedrock permission set, isn't Terraform's (its
                                   project tag), from group 4's cutover: once the role exists or LAPTOP_PERMISSION_SET
                                   names the set; before it, spec 000's hand-made set stands, and nothing is asked
  laptop_permission_set_too_broad  that set holds anything but sts:AssumeRole on h4-laptop-bedrock
  handover_policy_too_broad        h4-ec2-start-fn's, h4-ec2-guard-fn's, or the h4-ec2-stop permission set's policies
                                   let an EC2 action reach anything but the instance tagged h4-prod-ec2 (group 9)
  allowlist_entry_refused          a line of the allowlist names a kind outside the four below, or isn't "<kind>
                                   <name>"; named by its line number, never its text

The account is shared with the Author's other work (spec 001 Assumptions, "One account, shared with the Author's other
work"; ADR 0047; his answers of 2026-11-11, "Share it, scope the checks" and "Allow it too"). His allowlist names
identities by finding kind and name, one "<kind> <name>" a line, # for comments, and stays out of the repository (his
answer of 2026-11-12, "Keep them out of the repo"): in his terminal, ~/.config/h4reet-ai/infra/iam-allow.txt, which
agent sessions can't read; in the function, the Parameter Store SecureString its environment's
H4_AUDIT_ALLOW_PARAMETER names. A finding it names moves to the result's "allowed" list, shown but not failing. Only
iam_user_present, iam_user_access_key, oidc_provider_present, and role_foreign_trust can be allowed, and never for this
project's own names (h4-…, or an Identity Center role, AWSReservedSSO_…): the root's keys, the laptop's identity, and
the handover's policies stay strict. No list, or no parameter, means no allowlist.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote

REGION = "us-east-1"
PROJECT = "h4reet-ai"
LAPTOP_ROLE = "h4-laptop-bedrock"
# The name of spec 000's permission set, which group 4 imports into Terraform and narrows (tasks.md T034): iam.tf's
# local.laptop_permission_set. Named here from T040b's cutover (2026-11-12: the laptop's profile chains to
# h4-laptop-bedrock and the hand-made policy is detached), so the audit holds the set to the one policy. Read at each
# run, not at import.
LAPTOP_PERMISSION_SET: str | None = "h4reet-ai-cloud"
_THE_MODULES = object()
TAGGED_INSTANCE = "h4-prod-ec2"
HANDOVER_ROLES = {
    # Spec 032 (FR-016; ADR 0057): the start function also replaces a short host from its launch templates.
    "h4-ec2-start-fn": {
        "ec2:startinstances",
        "ec2:runinstances",
        "ec2:createtags",
        "ec2:terminateinstances",
        "ec2:cancelspotinstancerequests",
        "ec2:attachvolume",
    },
    "h4-ec2-guard-fn": {"ec2:stopinstances"},
}
HANDOVER_SETS = {"h4-ec2-stop": {"ec2:stopinstances"}}
DESCRIBE = {
    "ec2:describeinstances",
    "ec2:describeinstancestatus",
    "ec2:describespotinstancerequests",
    "ec2:describevolumes",
}
HOSTS = frozenset({TAGGED_INSTANCE, "h4-prod-tunnel-end"})
HOST_VOLUMES = frozenset({"h4-ec2-data", "h4-shared-state"})
_STRING = ("StringEquals", "ForAllValues:StringEquals")
_NAME = r"(?:aws|ec2):ResourceTag/Name"
# Each EC2 action an identity of the handover may hold, and the conditions any one of which holds it: (operators, the
# key's pattern, the values the condition may name; None for a launch template's ARN). A condition naming a value
# outside its set holds nothing.
HOLDS: dict[str, tuple[tuple[tuple[str, ...], str, frozenset[str] | None], ...]] = {
    "ec2:startinstances": ((_STRING, _NAME, frozenset({TAGGED_INSTANCE})),),
    "ec2:stopinstances": ((_STRING, _NAME, frozenset({TAGGED_INSTANCE})),),
    "ec2:terminateinstances": ((_STRING, _NAME, HOSTS),),
    "ec2:cancelspotinstancerequests": ((_STRING, _NAME, HOSTS),),
    "ec2:attachvolume": ((_STRING, _NAME, HOSTS | HOST_VOLUMES),),
    "ec2:createtags": ((_STRING, r"ec2:CreateAction", frozenset({"RunInstances"})),),
}
LAUNCH_TEMPLATE = re.compile(r"arn:aws:ec2:[a-z0-9-]+:[^:*]+:launch-template/[^:]*")
# The rework after the reviews of 52308132 (Important 1): RunInstances is held statement by statement to the kinds of
# resource it names, each kind needing all of its conditions, so a request can't override the template's type, market,
# or image. The listed types are prod's two lists (infra/prod/ec2.tf, tunnel-end.tf), which the account's iam.tf
# repeats and infra/test/test_handover.py holds alike.
LISTED_TYPES = frozenset(
    {
        "t4g.large",
        "m7g.large",
        "m6g.large",
        "t4g.xlarge",
        "t4g.small",
        "c7g.medium",
        "c6g.medium",
        "t4g.medium",
    }
)
_TEMPLATE_PART = (("Bool",), r"ec2:IsLaunchTemplateResource", frozenset({"true"}))
# Amended 2026-11-22 (fix/032-launch-policy; ADR 0057's amendment), to the policy that passed every dry run on AWS: the
# instance needs its type and market, not its Name; the image alone needs IsLaunchTemplateResource, which keeps every
# launch on a template (one without a template is refused on its image). The volume and the spot request need no
# condition (AWS supplies no ec2:LaunchTemplate for a spot request), nor do the subnet, the group, and the interfaces
# (the group of the interfaces a template attaches isn't "from the template"); they are this one-project account's.
RUN_KINDS: dict[str, tuple[tuple[tuple[str, ...], str, frozenset[str] | None], ...]] = {
    "launch-template": (
        (
            _STRING,
            r"(?:aws|ec2):ResourceTag/component",
            frozenset({"ec2", "tunnel-end"}),
        ),
    ),
    "instance": (
        (_STRING, r"ec2:InstanceType", LISTED_TYPES),
        (_STRING, r"ec2:InstanceMarketType", frozenset({"spot"})),
    ),
    "image": (_TEMPLATE_PART,),
    "volume": (),
    "spot-instances-request": (),
    "subnet": (),
    "security-group": (),
    "network-interface": (),
}
EC2_ARN = re.compile(r"arn:aws:ec2:[a-z0-9-]*:[^:]*:([a-z-]+)/.+")
RUNBOOK = "docs/runbooks/credential-audit.md"
# The Author's allowlist (ADR 0047), out of the repository: his file in the terminal, a parameter in the function.
ALLOW_PARAMETER_ENV = "H4_AUDIT_ALLOW_PARAMETER"
# This project's own names, which no line may allow: Terraform's h4-… identities and Identity Center's roles.
OWN_PREFIXES = ("h4-", "AWSReservedSSO_")
ALLOWABLE = frozenset(
    {
        "iam_user_present",
        "iam_user_access_key",
        "oidc_provider_present",
        "role_foreign_trust",
    }
)


@dataclass(frozen=True)
class Allowlist:
    pairs: frozenset[tuple[str, str]]
    refused: tuple[int, ...]


def parse_allow(text: str) -> Allowlist:
    """Each "<kind> <name>" line of an allowable kind; any other line that isn't blank or a comment is refused."""
    pairs: set[tuple[str, str]] = set()
    refused: list[int] = []
    for number, line in enumerate(text.splitlines(), 1):
        words = line.split("#", 1)[0].split()
        if not words:
            continue
        if (
            len(words) == 2
            and words[0] in ALLOWABLE
            and not words[1].startswith(OWN_PREFIXES)
        ):
            pairs.add((words[0], words[1]))
        else:
            refused.append(number)
    return Allowlist(frozenset(pairs), tuple(refused))


def terminal_allow() -> Path:
    """The Author's file, under the home the audit runs with (infra-verify passes his)."""
    return Path.home() / ".config" / "h4reet-ai" / "infra" / "iam-allow.txt"


def lambda_allow(aws) -> Allowlist:
    """The function's: the SecureString its environment names; none named, or none there, is no allowlist."""
    name = os.environ.get(ALLOW_PARAMETER_ENV, "")
    if not name:
        return parse_allow("")
    try:
        value = aws.call("ssm", "GetParameter", Name=name, WithDecryption=True)
    except NotFound:
        return parse_allow("")
    return parse_allow(str((value.get("Parameter") or {}).get("Value") or ""))


def load_allow(path: Path) -> Allowlist:
    return parse_allow(path.read_text(encoding="utf-8") if path.is_file() else "")


NOT_FOUND = {
    "NoSuchEntity",
    "ResourceNotFoundException",
    "NotFound",
    "NoSuchEntityException",
    # Parameter Store's, for the function's allowlist (ADR 0047): a missing one is no allowlist, not a failed run.
    "ParameterNotFound",
}


class NotFound(LookupError):
    """The resource a Get call names doesn't exist."""


class AwsError(RuntimeError):
    """A call failed for any other reason. Its message names the call, never the account or a credential."""


# ----------------------------------------------------------------------------------------------------------------------
# Reading policies.


def document(value: object) -> dict:
    """A policy document as IAM may return it: an object, a JSON string, or URL-encoded JSON (IAM's raw form)."""
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        text = value if value.lstrip().startswith("{") else unquote(value)
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    return {}


def statements(doc: dict) -> list[dict]:
    found = doc.get("Statement") or []
    return [
        s
        for s in (found if isinstance(found, list) else [found])
        if isinstance(s, dict)
    ]


def as_list(value: object) -> list:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def allows(statement: dict) -> bool:
    return statement.get("Effect", "Allow") == "Allow"


def tagged_project(tags: list[dict]) -> bool:
    found = {t.get("Key"): t.get("Value") for t in tags or []}
    return (
        found.get("project") == PROJECT
        and "component" in found
        and "environment" in found
    )


# ----------------------------------------------------------------------------------------------------------------------
# The checks.


def foreign(kind: str, value: object, account: str) -> bool:
    if not isinstance(value, str):
        return True
    if kind == "Service":
        return not re.fullmatch(r"[a-z0-9.-]+\.amazonaws\.com", value)
    if kind == "AWS":
        if value == "*":
            return True
        if re.fullmatch(r"\d{12}", value):
            return value != account
        m = re.match(r"arn:aws:(?:iam|sts)::(\d{12}):", value)
        return m is None or m.group(1) != account
    if kind == "Federated":
        m = re.fullmatch(
            r"arn:aws:iam::(\d{12}):saml-provider/AWSSSO_[A-Za-z0-9_]+", value
        )
        return m is None or m.group(1) != account
    return True


def trusts_outside(doc: dict, account: str) -> bool:
    for s in statements(doc):
        if not allows(s):
            continue
        principal = s.get("Principal")
        if principal == "*" or not isinstance(principal, dict) or "NotPrincipal" in s:
            return True
        for kind, values in principal.items():
            if any(foreign(kind, v, account) for v in as_list(values)):
                return True
    return False


def role_policies(aws, name: str) -> list[dict] | None:
    """Every policy document on the role, inline and attached, or None when one can't be read (which fails closed)."""
    docs = []
    for policy_name in (
        aws.call("iam", "ListRolePolicies", RoleName=name).get("PolicyNames") or []
    ):
        got = aws.call("iam", "GetRolePolicy", RoleName=name, PolicyName=policy_name)
        docs.append(document(got.get("PolicyDocument")))
    for attached in (
        aws.call("iam", "ListAttachedRolePolicies", RoleName=name).get(
            "AttachedPolicies"
        )
        or []
    ):
        doc = managed_document(aws, str(attached.get("PolicyArn")))
        if doc is None:
            return None
        docs.append(doc)
    return docs


def managed_document(aws, arn: str) -> dict | None:
    try:
        version = aws.call("iam", "GetPolicy", PolicyArn=arn)["Policy"][
            "DefaultVersionId"
        ]
        got = aws.call("iam", "GetPolicyVersion", PolicyArn=arn, VersionId=version)
    except NotFound:
        return None
    return document(got["PolicyVersion"].get("Document"))


def handover_too_broad(docs: list[dict] | None, allowed: set[str]) -> bool:
    """Any EC2 action but describe, and the identity's own actions unless each statement's condition holds it (HOLDS)."""
    if docs is None:
        return True
    for doc in docs:
        for s in statements(doc):
            if not allows(s):
                continue
            if "NotAction" in s or "NotResource" in s:
                return True
            for action in (str(a).lower() for a in as_list(s.get("Action"))):
                if action != "*" and not action.startswith("ec2:"):
                    continue
                if action in DESCRIBE:
                    continue
                if action == "ec2:runinstances" and action in allowed:
                    if not run_holds(s):
                        return True
                    continue
                if action not in allowed or not holds(action, s.get("Condition")):
                    return True
    return False


def run_holds(statement: dict) -> bool:
    """A RunInstances statement names only kinds RUN_KINDS knows, never *, and its condition holds every requirement of
    every kind it names."""
    kinds = set()
    for resource in as_list(statement.get("Resource")):
        m = EC2_ARN.fullmatch(str(resource))
        if m is None or m.group(1) not in RUN_KINDS:
            return False
        kinds.add(m.group(1))
    condition = statement.get("Condition")
    return bool(kinds) and all(
        meets(condition, need) for kind in kinds for need in RUN_KINDS[kind]
    )


def meets(
    condition: object, need: tuple[tuple[str, ...], str, frozenset[str] | None]
) -> bool:
    """One requirement: a key of the pattern, under one of the operators, naming only allowed values."""
    operators, pattern, allowed = need
    if not isinstance(condition, dict):
        return False
    for operator, pairs in condition.items():
        if operator not in operators or not isinstance(pairs, dict):
            continue
        for key, values in pairs.items():
            named = [
                str(v).lower() if allowed is not None and operator == "Bool" else v
                for v in as_list(values)
            ]
            if not re.fullmatch(pattern, key) or not named:
                continue
            if allowed is None:
                if all(
                    isinstance(v, str) and LAUNCH_TEMPLATE.fullmatch(v) for v in named
                ):
                    return True
            elif set(named) <= allowed:
                return True
    return False


def holds(action: str, condition: object) -> bool:
    """The statement's condition names only what HOLDS lets this action reach."""
    if not isinstance(condition, dict):
        return False
    for operator, pairs in condition.items():
        if not isinstance(pairs, dict):
            continue
        for key, values in pairs.items():
            named = as_list(values)
            for operators, pattern, allowed in HOLDS.get(action, ()):
                if (
                    operator not in operators
                    or not re.fullmatch(pattern, key)
                    or not named
                ):
                    continue
                if allowed is None:
                    if all(
                        isinstance(v, str) and LAUNCH_TEMPLATE.fullmatch(v)
                        for v in named
                    ):
                        return True
                elif set(named) <= allowed:
                    return True
    return False


def names_tagged_instance(condition: object) -> bool:
    """The condition names h4-prod-ec2 alone (kept for the readers of spec 001's rule)."""
    return holds("ec2:startinstances", condition)


class PermissionSets:
    """Identity Center's permission sets by name, read once; empty when the account has no instance."""

    def __init__(self, aws) -> None:
        self.aws = aws
        instances = aws.call("sso-admin", "ListInstances").get("Instances") or []
        self.instance = instances[0]["InstanceArn"] if instances else None
        self.by_name: dict[str, str] = {}
        if self.instance:
            for arn in (
                aws.call(
                    "sso-admin", "ListPermissionSets", InstanceArn=self.instance
                ).get("PermissionSets")
                or []
            ):
                got = aws.call(
                    "sso-admin",
                    "DescribePermissionSet",
                    InstanceArn=self.instance,
                    PermissionSetArn=arn,
                )
                self.by_name[got["PermissionSet"]["Name"]] = arn

    def tags(self, arn: str) -> list[dict]:
        return (
            self.aws.call(
                "sso-admin",
                "ListTagsForResource",
                InstanceArn=self.instance,
                ResourceArn=arn,
            ).get("Tags")
            or []
        )

    def inline(self, arn: str) -> dict:
        got = self.aws.call(
            "sso-admin",
            "GetInlinePolicyForPermissionSet",
            InstanceArn=self.instance,
            PermissionSetArn=arn,
        )
        return document(got.get("InlinePolicy"))

    def managed(self, arn: str) -> list[str]:
        got = self.aws.call(
            "sso-admin",
            "ListManagedPoliciesInPermissionSet",
            InstanceArn=self.instance,
            PermissionSetArn=arn,
        )
        return [str(p.get("Arn")) for p in got.get("AttachedManagedPolicies") or []]

    def customer(self, arn: str) -> list[dict]:
        got = self.aws.call(
            "sso-admin",
            "ListCustomerManagedPolicyReferencesInPermissionSet",
            InstanceArn=self.instance,
            PermissionSetArn=arn,
        )
        return list(got.get("CustomerManagedPolicyReferences") or [])


def laptop_findings(
    aws, sets: PermissionSets, roles: set[str], account: str, set_name: str | None
) -> list[dict]:
    found = []
    role_exists = LAPTOP_ROLE in roles
    if not role_exists and set_name is None:
        return found  # before group 4's cutover
    if role_exists:
        tags = (
            aws.call("iam", "GetRole", RoleName=LAPTOP_ROLE)["Role"].get("Tags") or []
        )
        if not tagged_project(tags):
            found.append(
                {"check": "laptop_identity_not_terraform", "resource": LAPTOP_ROLE}
            )
    else:
        found.append(
            {"check": "laptop_identity_not_terraform", "resource": LAPTOP_ROLE}
        )
    if set_name is None:
        return found
    arn = sets.by_name.get(set_name)
    if arn is None:
        found.append({"check": "laptop_identity_not_terraform", "resource": set_name})
        return found
    if not tagged_project(sets.tags(arn)):
        found.append({"check": "laptop_identity_not_terraform", "resource": set_name})
    role_arn = f"arn:aws:iam::{account}:role/{LAPTOP_ROLE}"
    narrow = not sets.managed(arn) and not sets.customer(arn)
    for s in statements(sets.inline(arn)):
        if not allows(s):
            continue
        if (
            "NotAction" in s
            or "NotResource" in s
            or [str(a) for a in as_list(s.get("Action"))] != ["sts:AssumeRole"]
            or as_list(s.get("Resource")) != [role_arn]
        ):
            narrow = False
    if not narrow:
        found.append({"check": "laptop_permission_set_too_broad", "resource": set_name})
    return found


def run_audit(
    aws,
    source: str,
    laptop_permission_set: str | None | object = _THE_MODULES,
    allow: Allowlist | None = None,
) -> dict:
    if laptop_permission_set is _THE_MODULES:
        laptop_permission_set = LAPTOP_PERMISSION_SET
    account = str(aws.call("sts", "GetCallerIdentity")["Account"])
    found: list[dict] = []
    for user in aws.call("iam", "ListUsers").get("Users") or []:
        # Any IAM user: a user is how a console password, a service-specific credential, an SSH key, or a signing
        # certificate lives, and humans use SSO (FR-008; User Story 1's scenario 5). Its access keys get their own.
        found.append({"check": "iam_user_present", "resource": user["UserName"]})
        keys = (
            aws.call("iam", "ListAccessKeys", UserName=user["UserName"]).get(
                "AccessKeyMetadata"
            )
            or []
        )
        if keys:
            found.append({"check": "iam_user_access_key", "resource": user["UserName"]})
    summary = aws.call("iam", "GetAccountSummary").get("SummaryMap") or {}
    if summary.get("AccountAccessKeysPresent", 0) != 0:
        found.append({"check": "root_access_key", "resource": "root"})
    roles = aws.call("iam", "ListRoles").get("Roles") or []
    for role in roles:
        if trusts_outside(document(role.get("AssumeRolePolicyDocument")), account):
            found.append({"check": "role_foreign_trust", "resource": role["RoleName"]})
    for provider in (
        aws.call("iam", "ListOpenIDConnectProviders").get("OpenIDConnectProviderList")
        or []
    ):
        found.append(
            {
                "check": "oidc_provider_present",
                "resource": str(provider.get("Arn")).split(":oidc-provider/", 1)[-1],
            }
        )
    names = {r["RoleName"] for r in roles}
    sets = PermissionSets(aws)
    found += laptop_findings(aws, sets, names, account, laptop_permission_set)
    for name, allowed in sorted(HANDOVER_ROLES.items()):
        if name in names and handover_too_broad(role_policies(aws, name), allowed):
            found.append({"check": "handover_policy_too_broad", "resource": name})
    for name, allowed in sorted(HANDOVER_SETS.items()):
        arn = sets.by_name.get(name)
        if arn is None:
            continue
        docs: list[dict] | None = [sets.inline(arn)]
        for managed_arn in sets.managed(arn):
            doc = managed_document(aws, managed_arn)
            docs = None if doc is None or docs is None else [*docs, doc]
        for ref in sets.customer(arn):
            path = ref.get("Path") or "/"
            doc = managed_document(
                aws, f"arn:aws:iam::{account}:policy{path}{ref.get('Name')}"
            )
            docs = None if doc is None or docs is None else [*docs, doc]
        if handover_too_broad(docs, allowed):
            found.append({"check": "handover_policy_too_broad", "resource": name})
    allow = allow or parse_allow("")
    found += [
        {"check": "allowlist_entry_refused", "resource": f"line {n}"}
        for n in allow.refused
    ]
    unique = sorted({(f["check"], f["resource"]) for f in found})
    findings = [
        {"check": check, "resource": resource}
        for check, resource in unique
        if (check, resource) not in allow.pairs
    ]
    allowed = [
        {"check": check, "resource": resource}
        for check, resource in unique
        if (check, resource) in allow.pairs
    ]
    return {
        "schema": 1,
        "run_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": source,
        "clean": not findings,
        "findings": findings,
        "allowed": allowed,
    }


def alert_text(result: dict) -> str:
    n = len(result["findings"])
    lines = [f"[hareet.ai aws] credential_finding: {n} finding{'s' if n != 1 else ''}"]
    lines += [f"- {f['check']}: {f['resource']}" for f in result["findings"]]
    lines.append(f"Runbook: {RUNBOOK}")
    return "\n".join(lines)


# ----------------------------------------------------------------------------------------------------------------------
# The two ways to AWS.


def snake(name: str) -> str:
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])", "_", name).lower()


def kebab(name: str) -> str:
    return snake(name).replace("_", "-")


def cli_argv(aws: str, service: str, op: str, params: dict, profile: str) -> list[str]:
    args = [aws, service, kebab(op)]
    for key, value in params.items():
        args += [f"--{kebab(key)}", str(value)]
    return [
        *args,
        "--profile",
        profile,
        "--region",
        REGION,
        "--output",
        "json",
        "--no-cli-pager",
    ]


class CliAws:
    """The AWS CLI, in the Author's terminal: it paginates by itself, and decodes IAM's documents."""

    def __init__(self, profile: str) -> None:
        self.profile = profile
        self.env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": os.path.expanduser("~"),
        }

    def call(self, service: str, op: str, **params: object) -> dict:
        done = subprocess.run(
            cli_argv("aws", service, op, params, self.profile),
            capture_output=True,
            text=True,
            env=self.env,
            check=False,
            stdin=subprocess.DEVNULL,
            timeout=120,
        )
        if done.returncode != 0:
            code = re.search(r"\(([A-Za-z]+)\)", done.stderr)
            if code and code.group(1) in NOT_FOUND:
                raise NotFound(f"{service} {kebab(op)}")
            raise AwsError(f"aws {service} {kebab(op)} exited {done.returncode}")
        return json.loads(done.stdout or "{}")


class BotoAws:
    """The Lambda runtime's AWS SDK, which its base image carries; this file imports it only here."""

    def __init__(self) -> None:
        # The Lambda's runtime holds it; the terminal and the tests never load it.
        import boto3

        self.session = boto3.session.Session(region_name=REGION)
        self.clients: dict[str, object] = {}

    def call(self, service: str, op: str, **params: object) -> dict:
        from botocore.exceptions import ClientError

        client = self.clients.setdefault(
            service, self.session.client(service, region_name=REGION)
        )
        name = snake(op)
        try:
            if client.can_paginate(name):  # type: ignore[attr-defined]
                return client.get_paginator(name).paginate(**params).build_full_result()  # type: ignore[attr-defined]
            return getattr(client, name)(**params)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in NOT_FOUND:
                raise NotFound(f"{service}.{op}") from None
            raise AwsError(f"{service}.{op}: {code}") from None


def handler(event: object, context: object, aws=None) -> dict:
    """h4-credential-audit's entry (group 4 deploys it, tasks.md T034)."""
    aws = aws or BotoAws()
    result = run_audit(aws, source="lambda", allow=lambda_allow(aws))
    print(json.dumps(result, sort_keys=True))
    bucket = os.environ.get("H4_AUDIT_BUCKET")
    if bucket:
        aws.call(
            "s3",
            "PutObject",
            Bucket=bucket,
            Key=f"audits/credential/{result['run_at'][:10]}.json",
            Body=json.dumps(result, sort_keys=True).encode(),
            ContentType="application/json",
        )
    topic = os.environ.get("H4_ALERTS_TOPIC_ARN")
    if topic and result["findings"]:
        aws.call(
            "sns",
            "Publish",
            TopicArn=topic,
            Subject="[hareet.ai aws] credential_finding",
            Message=alert_text(result),
        )
    return result


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="audit.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument(
        "--terminal",
        action="store_true",
        required=True,
        help="run in the Author's terminal",
    )
    parser.add_argument("--profile")
    args = parser.parse_args(argv)
    if os.environ.get("SANDBOX_RUNTIME") == "1":
        print(
            "credential-audit: this is the Author's: it reads the account's IAM with his SSO session",
            file=sys.stderr,
        )
        return 2
    profile = args.profile or os.environ.get("AWS_PROFILE", "")
    if not re.fullmatch(r"[A-Za-z0-9._-]+", profile):
        print(
            "credential-audit: name your SSO profile: PROFILE=h4reet-…", file=sys.stderr
        )
        return 2
    try:
        result = run_audit(
            CliAws(profile), source="terminal", allow=load_allow(terminal_allow())
        )
    except (
        NotFound,
        AwsError,
        OSError,
        ValueError,
        KeyError,
        subprocess.TimeoutExpired,
    ) as exc:
        print(f"credential-audit: can't run: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, sort_keys=True))
    return 1 if result["findings"] else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
