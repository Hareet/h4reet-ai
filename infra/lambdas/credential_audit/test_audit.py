"""Tests for the credential audit, infra/lambdas/credential_audit/audit.py (spec 001 tasks.md T022; FR-008, FR-013,
SC-004; contracts/infra-records.md §4, and September's §7 at 00309c47; data-model.md §6.6 at 00309c47). Its findings:

  - iam_user_present: an IAM user exists at all, since a user is how a console password, a service-specific
    credential (Bedrock's long-term API keys among them), an SSH public key, or a signing certificate lives, each
    long-lived (FR-008; User Story 1's scenario 5; T028's review, I4);
  - iam_user_access_key: an IAM user holds an access key, active or not;
  - root_access_key: the root user holds one;
  - role_foreign_trust: a role trusts a principal outside the account, its services, and its Identity Center;
  - oidc_provider_present: an OIDC provider exists before publication;
  - laptop_identity_not_terraform: the laptop's Bedrock permission set, or h4-laptop-bedrock, isn't Terraform's (its
    tags), from group 4's cutover on: before it, neither exists in that form, and nothing is asked of them;
  - laptop_permission_set_too_broad: that permission set holds anything but sts:AssumeRole on h4-laptop-bedrock;
  - handover_policy_too_broad: h4-ec2-start-fn's, h4-ec2-guard-fn's, or the h4-ec2-stop permission set's policies
    let an EC2 action reach anything but the instance tagged h4-prod-ec2, from group 9 on.

Nothing it prints, logs, publishes, or stores names a key's ID or the account's ID. The tests drive it with a stub AWS
that answers each call from data, as the Lambda's boto3 and the terminal's AWS CLI would."""

from __future__ import annotations

import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("credential_audit", HERE / "audit.py")
assert spec is not None and spec.loader is not None
audit = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = audit
spec.loader.exec_module(audit)

ACCOUNT = "7" * 12
OTHER = "8" * 12
KEY_ID = "AKIA" + "T" * 16
SSO_ROLE = f"arn:aws:iam::{ACCOUNT}:role/aws-reserved/sso.amazonaws.com/AWSReservedSSO_H4Bedrock_0123456789abcdef"
SAML = f"arn:aws:iam::{ACCOUNT}:saml-provider/AWSSSO_0123456789abcdef_DO_NOT_DELETE"
INSTANCE_ARN = "arn:aws:sso:::instance/ssoins-0123456789abcdef"
TERRAFORM_TAGS = [
    {"Key": "project", "Value": "h4reet-ai"},
    {"Key": "environment", "Value": "account"},
    {"Key": "component", "Value": "laptop-bedrock"},
]


def trust(*statements: dict) -> dict:
    return {"Version": "2012-10-17", "Statement": list(statements)}


def allow(principal: object, action: str = "sts:AssumeRole", **extra: object) -> dict:
    return {"Effect": "Allow", "Principal": principal, "Action": action, **extra}


def policy(*statements: dict) -> dict:
    return {"Version": "2012-10-17", "Statement": list(statements)}


class StubAws:
    """An account, as data: users and their keys, the account summary, roles with their trust, tags, and policies,
    OIDC providers, and Identity Center's permission sets. Calls it doesn't know fail the test."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict]] = []
        self.users: dict[str, list[str]] = {}
        self.root_keys = 0
        self.roles: dict[str, dict] = {
            "AWSServiceRoleForSupport": {
                "trust": trust(allow({"Service": "support.amazonaws.com"})),
                "path": "/aws-service-role/support.amazonaws.com/",
            },
        }
        self.oidc: list[str] = []
        self.sso_instances = [INSTANCE_ARN]
        self.permission_sets: dict[str, dict] = {}
        self.managed: dict[str, dict] = {}
        self.published: list[dict] = []
        self.stored: list[dict] = []

    def role(
        self,
        name: str,
        trust_doc: dict,
        tags=None,
        inline=None,
        attached=None,
        path: str = "/",
    ) -> None:
        self.roles[name] = {
            "trust": trust_doc,
            "tags": tags or [],
            "inline": inline or {},
            "attached": attached or [],
            "path": path,
        }

    def permission_set(
        self, name: str, tags=None, inline=None, managed=None, customer=None
    ) -> None:
        arn = f"{INSTANCE_ARN.replace('instance/', 'permissionSet/')}/ps-{len(self.permission_sets):016x}"
        self.permission_sets[arn] = {
            "name": name,
            "tags": tags or [],
            "inline": inline,
            "managed": managed or [],
            "customer": customer or [],
        }

    def call(self, service: str, op: str, **params: object) -> dict:
        self.calls.append((service, op, params))
        key = f"{service}.{op}"
        if key == "sts.GetCallerIdentity":
            return {
                "Account": ACCOUNT,
                "Arn": f"arn:aws:sts::{ACCOUNT}:assumed-role/x/y",
                "UserId": "AROAX:y",
            }
        if key == "iam.ListUsers":
            return {
                "Users": [
                    {"UserName": u, "Arn": f"arn:aws:iam::{ACCOUNT}:user/{u}"}
                    for u in self.users
                ]
            }
        if key == "iam.ListAccessKeys":
            keys = self.users[str(params["UserName"])]
            return {
                "AccessKeyMetadata": [
                    {
                        "UserName": params["UserName"],
                        "AccessKeyId": k,
                        "Status": "Inactive",
                    }
                    for k in keys
                ]
            }
        if key == "iam.GetAccountSummary":
            return {
                "SummaryMap": {
                    "AccountAccessKeysPresent": self.root_keys,
                    "Users": len(self.users),
                }
            }
        if key == "iam.ListRoles":
            return {
                "Roles": [
                    {
                        "RoleName": n,
                        "Path": r.get("path", "/"),
                        "Arn": f"arn:aws:iam::{ACCOUNT}:role{r.get('path', '/')}{n}",
                        "AssumeRolePolicyDocument": r["trust"],
                    }
                    for n, r in self.roles.items()
                ]
            }
        if key == "iam.GetRole":
            r = self.roles.get(str(params["RoleName"]))
            if r is None:
                raise audit.NotFound(key)
            return {
                "Role": {
                    "RoleName": params["RoleName"],
                    "Arn": f"arn:aws:iam::{ACCOUNT}:role/{params['RoleName']}",
                    "Tags": r["tags"],
                }
            }
        if key == "iam.ListRolePolicies":
            return {
                "PolicyNames": sorted(self.roles[str(params["RoleName"])]["inline"])
            }
        if key == "iam.GetRolePolicy":
            doc = self.roles[str(params["RoleName"])]["inline"][params["PolicyName"]]
            return {
                "RoleName": params["RoleName"],
                "PolicyName": params["PolicyName"],
                "PolicyDocument": doc,
            }
        if key == "iam.ListAttachedRolePolicies":
            arns = self.roles[str(params["RoleName"])]["attached"]
            return {
                "AttachedPolicies": [
                    {"PolicyArn": a, "PolicyName": a.rsplit("/", 1)[-1]} for a in arns
                ]
            }
        if key == "iam.GetPolicy":
            if params["PolicyArn"] not in self.managed:
                raise audit.NotFound(key)
            return {"Policy": {"Arn": params["PolicyArn"], "DefaultVersionId": "v1"}}
        if key == "iam.GetPolicyVersion":
            return {
                "PolicyVersion": {
                    "Document": self.managed[str(params["PolicyArn"])],
                    "VersionId": "v1",
                }
            }
        if key == "iam.ListOpenIDConnectProviders":
            return {
                "OpenIDConnectProviderList": [
                    {"Arn": f"arn:aws:iam::{ACCOUNT}:oidc-provider/{h}"}
                    for h in self.oidc
                ]
            }
        if key == "sso-admin.ListInstances":
            return {
                "Instances": [
                    {"InstanceArn": a, "IdentityStoreId": "d-0123"}
                    for a in self.sso_instances
                ]
            }
        if key == "sso-admin.ListPermissionSets":
            return {"PermissionSets": list(self.permission_sets)}
        if key == "sso-admin.DescribePermissionSet":
            ps = self.permission_sets[str(params["PermissionSetArn"])]
            return {
                "PermissionSet": {
                    "Name": ps["name"],
                    "PermissionSetArn": params["PermissionSetArn"],
                }
            }
        if key == "sso-admin.ListTagsForResource":
            return {"Tags": self.permission_sets[str(params["ResourceArn"])]["tags"]}
        if key == "sso-admin.GetInlinePolicyForPermissionSet":
            inline = self.permission_sets[str(params["PermissionSetArn"])]["inline"]
            return {"InlinePolicy": json.dumps(inline) if inline else ""}
        if key == "sso-admin.ListManagedPoliciesInPermissionSet":
            arns = self.permission_sets[str(params["PermissionSetArn"])]["managed"]
            return {
                "AttachedManagedPolicies": [
                    {"Arn": a, "Name": a.rsplit("/", 1)[-1]} for a in arns
                ]
            }
        if key == "sso-admin.ListCustomerManagedPolicyReferencesInPermissionSet":
            refs = self.permission_sets[str(params["PermissionSetArn"])]["customer"]
            return {
                "CustomerManagedPolicyReferences": [
                    {"Name": n, "Path": "/"} for n in refs
                ]
            }
        if key == "sns.Publish":
            self.published.append(params)
            return {"MessageId": "m"}
        if key == "s3.PutObject":
            self.stored.append(params)
            return {}
        raise AssertionError(f"the stub doesn't know {key}")


@pytest.fixture
def aws() -> StubAws:
    return StubAws()


def findings(aws: StubAws, **config: object) -> list[tuple[str, str]]:
    result = audit.run_audit(aws, source="terminal", **config)
    return [(f["check"], f["resource"]) for f in result["findings"]]


def laptop_role(aws: StubAws, tags=TERRAFORM_TAGS) -> None:
    aws.role(
        "h4-laptop-bedrock",
        trust(allow({"AWS": SSO_ROLE})),
        tags=tags,
        inline={
            "bedrock": policy(
                {"Effect": "Allow", "Action": "bedrock:InvokeModel", "Resource": "*"}
            )
        },
    )


ASSUME_ONLY = policy(
    {
        "Effect": "Allow",
        "Action": "sts:AssumeRole",
        "Resource": f"arn:aws:iam::{ACCOUNT}:role/h4-laptop-bedrock",
    }
)


def test_a_clean_account(aws: StubAws) -> None:
    aws.role("h4-something", trust(allow({"Service": "lambda.amazonaws.com"})))
    aws.role(
        "AWSReservedSSO_Admin_0123",
        trust(allow({"Federated": SAML}, "sts:AssumeRoleWithSAML")),
    )
    aws.role("h4-own", trust(allow({"AWS": f"arn:aws:iam::{ACCOUNT}:root"})))
    result = audit.run_audit(aws, source="terminal")
    assert result["clean"] is True and result["findings"] == []
    assert result["schema"] == 1 and result["source"] == "terminal"
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", result["run_at"])


def test_a_users_access_key_names_the_user_never_the_key(aws: StubAws) -> None:
    aws.users = {"h4reet-runtime": [KEY_ID], "keyless": []}
    result = audit.run_audit(aws, source="terminal")
    assert [(f["check"], f["resource"]) for f in result["findings"]] == [
        ("iam_user_access_key", "h4reet-runtime"),
        ("iam_user_present", "h4reet-runtime"),
        ("iam_user_present", "keyless"),
    ]
    assert KEY_ID not in json.dumps(result)


@pytest.mark.parametrize(
    "holds",
    [
        "a console password",
        "a service-specific credential, Bedrock's long-term API key among them",
        "an SSH public key",
        "a signing certificate",
        "nothing at all",
    ],
)
def test_any_iam_user_is_a_finding_whatever_it_holds(aws: StubAws, holds: str) -> None:
    # A user without an access key still holds, or can hold, a long-lived credential of another kind; the audit names
    # the user, whatever it holds, and never reads the credential (T028's review, I4).
    aws.users = {"someone": []}
    assert findings(aws) == [("iam_user_present", "someone")], holds
    assert not [
        c
        for c in aws.calls
        if c[1].startswith(
            ("ListSSH", "ListServiceSpecific", "ListSigning", "GetLogin")
        )
    ]


def test_root_keys(aws: StubAws) -> None:
    aws.root_keys = 1
    assert findings(aws) == [("root_access_key", "root")]


@pytest.mark.parametrize(
    ("principal", "foreign"),
    [
        ({"AWS": f"arn:aws:iam::{OTHER}:root"}, True),
        ({"AWS": OTHER}, True),
        ({"AWS": "*"}, True),
        ("*", True),
        ({"Federated": "token.actions.githubusercontent.com"}, True),
        (
            {"Federated": f"arn:aws:iam::{OTHER}:saml-provider/AWSSSO_x_DO_NOT_DELETE"},
            True,
        ),
        ({"Federated": f"arn:aws:iam::{ACCOUNT}:saml-provider/SomeOtherIdP"}, True),
        ({"CanonicalUser": "abc"}, True),
        ({"Service": "example.com"}, True),
        (
            {"AWS": [f"arn:aws:iam::{ACCOUNT}:root", f"arn:aws:iam::{OTHER}:role/x"]},
            True,
        ),
        ({"AWS": f"arn:aws:iam::{ACCOUNT}:root"}, False),
        ({"AWS": ACCOUNT}, False),
        ({"AWS": SSO_ROLE}, False),
        ({"Service": ["lambda.amazonaws.com", "events.amazonaws.com"]}, False),
        ({"Federated": SAML}, False),
    ],
)
def test_a_roles_trust(aws: StubAws, principal: object, foreign: bool) -> None:
    aws.role("h4-under-test", trust(allow(principal)))
    want = [("role_foreign_trust", "h4-under-test")] if foreign else []
    assert findings(aws) == want


def test_a_deny_in_a_trust_policy_isnt_trust(aws: StubAws) -> None:
    aws.role(
        "h4-under-test",
        trust(
            {
                "Effect": "Deny",
                "Principal": {"AWS": f"arn:aws:iam::{OTHER}:root"},
                "Action": "sts:AssumeRole",
            }
        ),
    )
    assert findings(aws) == []


def test_a_trust_document_as_iam_sends_it_url_encoded(aws: StubAws) -> None:
    from urllib.parse import quote

    aws.role(
        "h4-under-test",
        quote(json.dumps(trust(allow({"AWS": f"arn:aws:iam::{OTHER}:root"})))),
    )  # type: ignore[arg-type]
    assert findings(aws) == [("role_foreign_trust", "h4-under-test")]


def test_an_oidc_provider_names_its_host_never_the_account(aws: StubAws) -> None:
    aws.oidc = ["token.actions.githubusercontent.com"]
    result = audit.run_audit(aws, source="terminal")
    assert [(f["check"], f["resource"]) for f in result["findings"]] == [
        ("oidc_provider_present", "token.actions.githubusercontent.com")
    ]
    assert ACCOUNT not in json.dumps(result)


def test_before_group_4_the_laptop_identity_isnt_asked_for(aws: StubAws) -> None:
    # Spec 000's hand-made permission set exists, untagged and holding Bedrock itself, and h4-laptop-bedrock doesn't.
    aws.permission_set(
        "H4Bedrock",
        inline=policy(
            {"Effect": "Allow", "Action": "bedrock:InvokeModel", "Resource": "*"}
        ),
    )
    assert audit.LAPTOP_PERMISSION_SET is None
    assert findings(aws) == []


def test_the_laptop_role_once_it_exists_must_be_terraforms(aws: StubAws) -> None:
    laptop_role(aws, tags=[])
    assert findings(aws) == [("laptop_identity_not_terraform", "h4-laptop-bedrock")]


def test_the_laptop_identity_once_named_and_terraforms(aws: StubAws) -> None:
    laptop_role(aws)
    aws.permission_set("H4Bedrock", tags=TERRAFORM_TAGS, inline=ASSUME_ONLY)
    assert findings(aws, laptop_permission_set="H4Bedrock") == []


@pytest.mark.parametrize(
    ("setup", "want"),
    [
        ("untagged set", [("laptop_identity_not_terraform", "H4Bedrock")]),
        ("missing set", [("laptop_identity_not_terraform", "H4Bedrock")]),
        ("missing role", [("laptop_identity_not_terraform", "h4-laptop-bedrock")]),
        ("bedrock in the set", [("laptop_permission_set_too_broad", "H4Bedrock")]),
        ("assume any role", [("laptop_permission_set_too_broad", "H4Bedrock")]),
        ("a managed policy", [("laptop_permission_set_too_broad", "H4Bedrock")]),
        ("a customer policy", [("laptop_permission_set_too_broad", "H4Bedrock")]),
        ("not-action", [("laptop_permission_set_too_broad", "H4Bedrock")]),
    ],
)
def test_the_laptop_identity_after_the_cutover(
    aws: StubAws, setup: str, want: list
) -> None:
    if setup != "missing role":
        laptop_role(aws)
    inline = ASSUME_ONLY
    tags = TERRAFORM_TAGS
    managed, customer = [], []
    if setup == "untagged set":
        tags = []
    elif setup == "bedrock in the set":
        inline = policy(
            ASSUME_ONLY["Statement"][0],
            {"Effect": "Allow", "Action": "bedrock:InvokeModel", "Resource": "*"},
        )
    elif setup == "assume any role":
        inline = policy(
            {"Effect": "Allow", "Action": "sts:AssumeRole", "Resource": "*"}
        )
    elif setup == "a managed policy":
        managed = ["arn:aws:iam::aws:policy/AmazonBedrockFullAccess"]
    elif setup == "a customer policy":
        customer = ["h4reet-ai-cloud"]
    elif setup == "not-action":
        inline = policy({"Effect": "Allow", "NotAction": "iam:*", "Resource": "*"})
    if setup != "missing set":
        aws.permission_set(
            "H4Bedrock", tags=tags, inline=inline, managed=managed, customer=customer
        )
    assert findings(aws, laptop_permission_set="H4Bedrock") == want


TAGGED = {"StringEquals": {"aws:ResourceTag/Name": "h4-prod-ec2"}}


@pytest.mark.parametrize(
    ("statement", "too_broad"),
    [
        (
            {
                "Effect": "Allow",
                "Action": "ec2:StartInstances",
                "Resource": "arn:aws:ec2:us-east-1:*:instance/*",
                "Condition": TAGGED,
            },
            False,
        ),
        (
            {"Effect": "Allow", "Action": "ec2:DescribeInstances", "Resource": "*"},
            False,
        ),
        ({"Effect": "Allow", "Action": "sns:Publish", "Resource": "*"}, False),
        ({"Effect": "Allow", "Action": "ec2:StartInstances", "Resource": "*"}, True),
        (
            {
                "Effect": "Allow",
                "Action": "ec2:StartInstances",
                "Resource": "*",
                "Condition": {"StringEquals": {"aws:ResourceTag/Name": "other"}},
            },
            True,
        ),
        (
            {
                "Effect": "Allow",
                "Action": "ec2:StopInstances",
                "Resource": "*",
                "Condition": TAGGED,
            },
            True,
        ),
        (
            {
                "Effect": "Allow",
                "Action": "ec2:TerminateInstances",
                "Resource": "*",
                "Condition": TAGGED,
            },
            True,
        ),
        (
            {
                "Effect": "Allow",
                "Action": "ec2:*",
                "Resource": "*",
                "Condition": TAGGED,
            },
            True,
        ),
        (
            {
                "Effect": "Allow",
                "Action": "ec2:Start*",
                "Resource": "*",
                "Condition": TAGGED,
            },
            True,
        ),
        ({"Effect": "Allow", "Action": "*", "Resource": "*"}, True),
        ({"Effect": "Allow", "NotAction": "iam:*", "Resource": "*"}, True),
        (
            {
                "Effect": "Allow",
                "Action": "ec2:StartInstances",
                "NotResource": "x",
                "Condition": TAGGED,
            },
            True,
        ),
        ({"Effect": "Deny", "Action": "ec2:*", "Resource": "*"}, False),
    ],
)
def test_the_start_functions_policy_names_only_the_tagged_instance(
    aws: StubAws, statement: dict, too_broad: bool
) -> None:
    aws.role(
        "h4-ec2-start-fn",
        trust(allow({"Service": "lambda.amazonaws.com"})),
        inline={"start": policy(statement)},
    )
    want = [("handover_policy_too_broad", "h4-ec2-start-fn")] if too_broad else []
    assert findings(aws) == want


def test_the_guard_and_the_stop_permission_set_and_an_attached_policy(
    aws: StubAws,
) -> None:
    arn = f"arn:aws:iam::{ACCOUNT}:policy/h4-guard"
    aws.managed[arn] = policy(
        {"Effect": "Allow", "Action": "ec2:StopInstances", "Resource": "*"}
    )
    aws.role(
        "h4-ec2-guard-fn",
        trust(allow({"Service": "lambda.amazonaws.com"})),
        attached=[arn],
    )
    aws.permission_set(
        "h4-ec2-stop",
        inline=policy(
            {
                "Effect": "Allow",
                "Action": ["ec2:StopInstances", "ec2:StartInstances"],
                "Resource": "*",
                "Condition": TAGGED,
            }
        ),
    )
    assert findings(aws) == [
        ("handover_policy_too_broad", "h4-ec2-guard-fn"),
        ("handover_policy_too_broad", "h4-ec2-stop"),
    ]


def test_without_identity_center_the_permission_set_checks_find_nothing_to_read(
    aws: StubAws,
) -> None:
    aws.sso_instances = []
    assert findings(aws) == []


def test_the_result_never_holds_an_account_id_or_a_key_id(aws: StubAws) -> None:
    aws.users = {"someone": [KEY_ID]}
    aws.root_keys = 2
    aws.oidc = ["token.actions.githubusercontent.com"]
    aws.role("h4-x", trust(allow({"AWS": f"arn:aws:iam::{OTHER}:root"})))
    laptop_role(aws, tags=[])
    text = json.dumps(audit.run_audit(aws, source="lambda"))
    assert not re.search(r"(?<!\d)\d{12}(?!\d)", text) and "AKIA" not in text
    assert json.loads(text)["clean"] is False


def test_the_lambda_publishes_a_finding_and_stores_the_result(
    aws: StubAws, monkeypatch
) -> None:
    aws.users = {"someone": [KEY_ID]}
    monkeypatch.setenv(
        "H4_ALERTS_TOPIC_ARN", "arn:aws:sns:us-east-1:" + ACCOUNT + ":h4-alerts"
    )
    monkeypatch.setenv("H4_AUDIT_BUCKET", "h4-releases")
    result = audit.handler({}, None, aws=aws)
    assert result["clean"] is False
    (msg,) = aws.published
    assert msg["Message"].startswith("[hareet.ai aws] credential_finding: 2 findings")
    assert (
        "iam_user_access_key: someone" in msg["Message"]
        and "iam_user_present: someone" in msg["Message"]
        and "docs/runbooks/credential-audit.md" in msg["Message"]
    )
    assert KEY_ID not in msg["Message"] and ACCOUNT not in msg["Message"]
    (stored,) = aws.stored
    assert stored["Bucket"] == "h4-releases" and re.fullmatch(
        r"audits/credential/\d{4}-\d\d-\d\d\.json", stored["Key"]
    )
    assert json.loads(stored["Body"]) == result


def test_the_lambda_stays_quiet_when_clean_and_unconfigured(
    aws: StubAws, monkeypatch
) -> None:
    monkeypatch.delenv("H4_ALERTS_TOPIC_ARN", raising=False)
    monkeypatch.delenv("H4_AUDIT_BUCKET", raising=False)
    assert audit.handler({}, None, aws=aws)["clean"] is True
    assert aws.published == [] and aws.stored == []


def test_the_lambda_logs_one_line_of_json(aws: StubAws, monkeypatch, capsys) -> None:
    monkeypatch.delenv("H4_ALERTS_TOPIC_ARN", raising=False)
    monkeypatch.delenv("H4_AUDIT_BUCKET", raising=False)
    audit.handler({}, None, aws=aws)
    (line,) = capsys.readouterr().out.splitlines()
    assert json.loads(line)["source"] == "lambda"


@pytest.mark.parametrize(
    ("service", "op", "params", "argv"),
    [
        ("iam", "ListUsers", {}, ["iam", "list-users"]),
        (
            "iam",
            "ListAccessKeys",
            {"UserName": "u"},
            ["iam", "list-access-keys", "--user-name", "u"],
        ),
        (
            "iam",
            "ListOpenIDConnectProviders",
            {},
            ["iam", "list-open-id-connect-providers"],
        ),
        (
            "sso-admin",
            "GetInlinePolicyForPermissionSet",
            {"InstanceArn": "i", "PermissionSetArn": "p"},
            [
                "sso-admin",
                "get-inline-policy-for-permission-set",
                "--instance-arn",
                "i",
                "--permission-set-arn",
                "p",
            ],
        ),
    ],
)
def test_the_terminals_aws_cli_calls(
    service: str, op: str, params: dict, argv: list[str]
) -> None:
    got = audit.cli_argv("aws", service, op, params, "h4reet-admin")
    assert got == [
        "aws",
        *argv,
        "--profile",
        "h4reet-admin",
        "--region",
        "us-east-1",
        "--output",
        "json",
        "--no-cli-pager",
    ]


FAKE_AWS = f"""#!{sys.executable} -I
import json, sys
from pathlib import Path
args = [a for a in sys.argv[1:] if not a.startswith("--")]
answers = json.loads(Path(__file__).with_name("answers.json").read_text(encoding="utf-8"))
key = " ".join(args[:2])
if key not in answers:
    sys.stderr.write("An error occurred (NoSuchEntity) when calling it\\n")
    sys.exit(254)
print(json.dumps(answers[key]))
"""


def terminal(
    tmp_path: Path, answers: dict, *extra: str, **env: str
) -> subprocess.CompletedProcess[str]:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(exist_ok=True)
    (bin_dir / "aws").write_text(FAKE_AWS, encoding="utf-8")
    (bin_dir / "aws").chmod(0o755)
    (bin_dir / "answers.json").write_text(json.dumps(answers), encoding="utf-8")
    return subprocess.run(
        [sys.executable, "-I", "-B", str(HERE / "audit.py"), "--terminal", *extra],
        capture_output=True,
        text=True,
        env={"PATH": f"{bin_dir}:/usr/bin:/bin", "HOME": str(tmp_path), **env},
        check=False,
        timeout=60,
    )


CLEAN = {
    "sts get-caller-identity": {"Account": ACCOUNT},
    "iam list-users": {"Users": []},
    "iam get-account-summary": {"SummaryMap": {"AccountAccessKeysPresent": 0}},
    "iam list-roles": {"Roles": []},
    "iam list-open-id-connect-providers": {"OpenIDConnectProviderList": []},
    "sso-admin list-instances": {"Instances": []},
}


def test_the_terminal_run_prints_the_result_and_exits_by_it(tmp_path: Path) -> None:
    done = terminal(tmp_path, CLEAN, "--profile", "h4reet-admin")
    assert done.returncode == 0, done.stderr
    assert json.loads(done.stdout)["source"] == "terminal"
    dirty = {
        **CLEAN,
        "iam get-account-summary": {"SummaryMap": {"AccountAccessKeysPresent": 1}},
    }
    done = terminal(tmp_path, dirty, "--profile", "h4reet-admin")
    assert done.returncode == 1 and json.loads(done.stdout)["findings"] == [
        {"check": "root_access_key", "resource": "root"}
    ]


@pytest.mark.parametrize("case", ["sandbox", "no profile", "aws fails"])
def test_the_terminal_run_cant_run(tmp_path: Path, case: str) -> None:
    answers = {
        k: v
        for k, v in CLEAN.items()
        if not (case == "aws fails" and k == "iam list-users")
    }
    extra = () if case == "no profile" else ("--profile", "h4reet-admin")
    env = {"SANDBOX_RUNTIME": "1"} if case == "sandbox" else {}
    done = terminal(tmp_path, answers, *extra, **env)
    assert done.returncode == 2 and done.stdout == ""
