"""Spec 001 group 4, the account root (tasks.md T033; FR-012, FR-013, FR-022 to FR-026, FR-061; research.md R-02,
R-15, R-22 to R-24; contracts/aws-alerts.md §1, §4, §5): infra/account's HCL, read with group 1's standard-library
reader, tools/gates/infra_policy.py's (the guard patch P-1), never with python-hcl2 or Terraform.

What the root must hold:
  - the laptop's Bedrock permission set, imported, allowing only sts:AssumeRole on h4-laptop-bedrock;
  - h4-laptop-bedrock, an ordinary IAM role: bedrock:InvokeModel* on the one inference profile only, trusting only the
    permission set's role;
  - the model action's settings, h4-deny-paid-models, and its targets: ordinary roles only, never a role under the path
    Identity Center gives the roles it makes for permission sets (/aws-reserved/sso.amazonaws.com/);
  - its execution role, which may attach and detach only that policy on those roles;
  - while rehearsal = true, the two $0.01 budgets with their actions; h4-rehearsal-target, an ordinary role of the
    same shape as h4-laptop-bedrock that no one assumes; and h4-rehearsal-instance, which the server rehearsal stops;
  - the probe's and the credential audit's EventBridge schedules only in alerts.tf, the probe's disabled, and no
    EventBridge rule in lambdas.tf (rule T5);
  - the three functions on arm64, from their images by digest, the bridge's retries and failure destination, and its
    subscription to h4-alerts; the registry and the release bucket;
  - the tags, and the protected kinds in the protected files only.

iam.tf, killswitch.tf, and alerts.tf are protected (FR-012), so they reach the branch only with the Author's patch,
P-I2 (docs/merge-requests/2026-11-10-feat-001-pi2-account.patch). Until he applies it, these tests read those three
from the patch, as the new files it creates; once he has, from the tree. Each fixture in fixtures/account/ is one
defect: its blocks replace the root's blocks of the same address (or join the file its "# into:" line names), its
"# drop:" lines remove a block, and its "# expect:" lines are the problems the checks must then report, and only those.
"""

from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

import pytest
import yaml

REPO = Path(__file__).resolve().parents[2]
READER = REPO / "tools" / "gates" / "infra_policy.py"
ROOT = REPO / "infra" / "account"
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "account"
PI2 = REPO / "docs" / "merge-requests" / "2026-11-10-feat-001-pi2-account.patch"
PINS = REPO / ".devcontainer" / "toolchain.vars"
ROUTING = REPO / "config" / "routing.yaml"
FILES = (
    "versions.tf",
    "variables.tf",
    "main.tf",
    "lambdas.tf",
    "registry.tf",
    "outputs.tf",
    "iam.tf",
    "killswitch.tf",
    "alerts.tf",
)
PROTECTED_FILES = ("iam.tf", "killswitch.tf", "alerts.tf")
# The one variable, the Bedrock service names group 3's budgets read too; the guard patch denies the TF_VAR_ names to
# agent sessions (contracts/env-cloud.md §5), so a new variable needs its deny first (FR-011).
VARIABLES = {"bedrock_service_names"}
PROTECTED_PREFIXES = (
    "aws_iam_",
    "aws_budgets_",
    "aws_ce_",
    "aws_sns_",
    "aws_ssoadmin_",
    "aws_identitystore_",
)
PROTECTED_TYPES = {
    "aws_cloudwatch_metric_alarm",
    "aws_cloudwatch_event_rule",
    "aws_cloudwatch_event_target",
    "aws_scheduler_schedule",
    "aws_lambda_permission",
}
EVENTS = (
    "aws_cloudwatch_event_rule",
    "aws_cloudwatch_event_target",
    "aws_scheduler_schedule",
)
INVOKE = {"bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"}
TOPIC = "data.aws_sns_topic.alerts.arn"
SSO_PATH = "aws-reserved/sso.amazonaws.com/"
# The permission set's own role and no other (T038's review, I4): Identity Center names it AWSReservedSSO_<set>_<16
# characters>, under its path, with a Region's segment in some accounts. Each `?` is one character, and the role's name
# follows a `/`, so a set named <set>_<more> can't match.
# The set's name and the 16, as the Author read them on 2026-11-11 (group 4's fact a): the set is "h4reet-ai-cloud", and
# its role's name holds 16 characters after AWSReservedSSO_h4reet-ai-cloud_. The suffix itself stays out of the tree.
LAPTOP_PERMISSION_SET = "h4reet-ai-cloud"
ROLE_SUFFIX_LENGTH = 16
_ROLE = "AWSReservedSSO_${local.laptop_permission_set}_" + "?" * ROLE_SUFFIX_LENGTH
_ARN = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/aws-reserved/sso.amazonaws.com/"
SSO_TRUST = [f"{_ARN}{_ROLE}", f"{_ARN}*/{_ROLE}"]


# The rehearsal (T038's review, I1): local.rehearsal is true only on its own change, beside this marker, which names
# that change's note, whose line says so.
REHEARSAL_MARKER = ROOT / "rehearsal-on.txt"
REHEARSAL_LINE = "<!-- h4-rehearsal: on -->"
_TREE = object()
# The server rehearsal's documents: the stop, and the start that reverses it (nit 1), AWS's own, in this Region.
SSM_DOCUMENTS = [
    "arn:aws:ssm:us-east-1:*:automation-definition/AWS-StopEC2Instance:*",
    "arn:aws:ssm:us-east-1:*:automation-definition/AWS-StartEC2Instance:*",
]


def quoted(text: str) -> list[str]:
    """The quoted strings of a list's source text, in order."""
    return re.findall(r'"([^"]*)"', text)


FUNCTIONS = {
    "alert_bridge": "h4-alert-bridge",
    "probe": "h4-probe",
    "credential_audit": "h4-credential-audit",
}

if not READER.is_file():
    pytest.skip(
        "PLANNED (T010): the reader, tools/gates/infra_policy.py, arrives with the guard patch, P-1",
        allow_module_level=True,
    )


def _reader():
    spec = importlib.util.spec_from_file_location("infra_policy_for_account", READER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


ip = _reader()


# ----------------------------------------------------------------------------------------------------------------------
# Reading the root: the tree's files, and P-I2's new files while the tree lacks them.


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
            assert m, f"P-I2's hunk for {rel} isn't a new file's"
            j += 1
            for _ in range(int(m.group(1) or 1)):
                assert lines[j].startswith("+"), (
                    f"P-I2's hunk for {rel} holds a line that isn't added"
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
    patch = PI2.read_text(encoding="utf-8") if PI2.is_file() else ""
    for name in FILES:
        path = ROOT / name
        if path.is_file():
            texts[name] = path.read_text(encoding="utf-8")
        elif name in PROTECTED_FILES:
            text = from_patch(patch, f"infra/account/{name}")
            if text is not None:
                texts[name] = text
    return texts


def parsed(texts: dict[str, str]) -> dict[str, list]:
    return {name: list(ip.parse_hcl(text)) for name, text in texts.items()}


def pins() -> dict[str, str]:
    return ip.read_pins(PINS)


# ----------------------------------------------------------------------------------------------------------------------
# Helpers over the root, as {file name: its blocks}.


def blocks(root: dict[str, list], kind: str | None = None) -> list:
    return [
        b
        for body in root.values()
        for b in body
        if isinstance(b, ip.Block) and (kind is None or b.type == kind)
    ]


def resource(root: dict[str, list], rtype: str, kind: str = "resource") -> list:
    return [b for b in blocks(root, kind) if b.labels[:1] == [rtype]]


def named(root: dict[str, list], rtype: str, name: str, attr: str = "name") -> list:
    return [b for b in resource(root, rtype) if ip.literal(b.attr(attr)) == name]


def where(root: dict[str, list], block) -> str | None:
    return next((n for n, body in root.items() if block in body), None)


def raw(block, name: str) -> str:
    attr = block.attr(name) if block is not None else None
    return "" if attr is None else re.sub(r"\s+", " ", attr.raw)


def refs(text: str, target: str) -> bool:
    return re.search(rf"(?<![\w.]){re.escape(target)}(?![\w])", text) is not None


def as_list(value: object) -> list:
    return value if isinstance(value, list) else [value]


def address(block) -> str:
    return ".".join(block.labels)


def locals_of(root: dict[str, list]) -> dict[str, object]:
    out: dict[str, object] = {}
    for b in blocks(root, "locals"):
        for a in b.body:
            if isinstance(a, ip.Attribute):
                out[a.name] = a.value
    return out


def document(root: dict[str, list], ref: str):
    """The aws_iam_policy_document a reference (data.aws_iam_policy_document.<name>.json) names, or None."""
    m = re.search(
        r"data\.aws_iam_policy_document\.([A-Za-z0-9_-]+)(?:\[0\])?\.json", ref
    )
    if not m:
        return None
    found = [
        b
        for b in resource(root, "aws_iam_policy_document", "data")
        if b.labels[1] == m.group(1)
    ]
    return found[0] if found else None


def statements(doc) -> list[dict]:
    """Each statement as {effect, actions, resources (raw), principals [(type, raw)], conditions [(test, var, raw)]}."""
    out = []
    for st in doc.blocks("statement") if doc is not None else []:
        out.append(
            {
                "effect": ip.literal(st.attr("effect"))
                if st.attr("effect")
                else "Allow",
                "actions": set(as_list(ip.literal(st.attr("actions")))),
                "resources": raw(st, "resources"),
                "principals": [
                    (ip.literal(p.attr("type")), raw(p, "identifiers"))
                    for p in st.blocks("principals")
                ],
                "conditions": [
                    (
                        ip.literal(c.attr("test")),
                        ip.literal(c.attr("variable")),
                        raw(c, "values"),
                    )
                    for c in st.blocks("condition")
                ],
                "not": bool(
                    st.attr("not_actions")
                    or st.attr("not_resources")
                    or st.blocks("not_principals")
                ),
            }
        )
    return out


def role(root: dict[str, list], name: str):
    found = named(root, "aws_iam_role", name)
    return found[0] if found else None


def role_ref(block) -> str:
    return f"aws_iam_role.{block.labels[1]}"


def inline_policies(root: dict[str, list], role_block) -> list:
    me = role_ref(role_block)
    return [
        p
        for p in resource(root, "aws_iam_role_policy")
        if refs(raw(p, "role"), f"{me}.id")
        or refs(raw(p, "role"), f"{me}.name")
        or refs(raw(p, "role"), f"{me}[0].id")
        or refs(raw(p, "role"), f"{me}[0].name")
    ]


def attachments(root: dict[str, list], role_block) -> list:
    me = role_ref(role_block)
    return [
        a
        for a in resource(root, "aws_iam_role_policy_attachment")
        if me in raw(a, "role")
    ]


def allowed(root: dict[str, list], role_block) -> list[dict]:
    """The Allow statements of a role's inline policies."""
    return [
        s
        for p in inline_policies(root, role_block)
        for s in statements(document(root, raw(p, "policy")))
        if s["effect"] == "Allow"
    ]


def ordinary(role_block) -> bool:
    """An ordinary role: at the path /, written or left to its default; never under Identity Center's path."""
    path = role_block.attr("path")
    return path is None or ip.literal(path) == "/"


def counted_by_rehearsal(block) -> bool:
    return raw(block, "count") == "local.rehearsal ? 1 : 0"


# ----------------------------------------------------------------------------------------------------------------------
# The checks. Each takes the root and returns its problems, "<area>: <what>".


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
    backends = [b for t in tfs for b in t.blocks("backend")]
    s3 = [b for b in backends if b.labels == ["s3"]]
    if len(backends) != 1 or len(s3) != 1:
        found.append("versions: the state isn't in the bucket's s3 backend")
    else:
        b = s3[0]
        settings = {
            k: ip.literal(b.attr(k))
            for k in ("key", "region", "encrypt", "use_lockfile", "bucket")
        }
        if (
            settings
            != {
                "key": "account.tfstate",
                "region": "us-east-1",
                "encrypt": True,
                "use_lockfile": True,
                "bucket": ip.UNKNOWN,
            }
            or b.attr("bucket") is not None
        ):
            found.append(
                "versions: the backend isn't key account.tfstate in us-east-1, encrypted, with S3's lock file and the "
                "bucket from make plan"
            )
    return found


def check_provider(root: dict[str, list]) -> list[str]:
    providers = [p for p in blocks(root, "provider") if p.labels == ["aws"]]
    if len(providers) != 1:
        return ['provider: one provider "aws", not more']
    p = providers[0]
    found = []
    if ip.literal(p.attr("region")) != "us-east-1":
        found.append("provider: the region isn't us-east-1 (research.md R-01)")
    dt = p.block("default_tags")
    tags = ip.literal(dt.attr("tags")) if dt else None
    if tags != {"project": "h4reet-ai", "environment": "account"}:
        found.append(
            "provider: default_tags aren't project h4reet-ai and environment account"
        )
    return found


def check_variables(root: dict[str, list]) -> list[str]:
    found = []
    variables = {b.labels[0]: b for b in blocks(root, "variable")}
    if set(variables) != VARIABLES:
        found.append(
            f"variables: the root's variables aren't {sorted(VARIABLES)} (a new one needs its deny first)"
        )
    v = variables.get("bedrock_service_names")
    if v is not None and (
        raw(v, "type") != "list(string)"
        or v.attr("default") is not None
        or not v.blocks("validation")
    ):
        found.append(
            "variables: bedrock_service_names isn't a list of strings, without a default, validated"
        )
    return found


def check_permission_set(root: dict[str, list]) -> list[str]:
    found = []
    sets = resource(root, "aws_ssoadmin_permission_set")
    if len(sets) != 1:
        return [
            "permission set: the root doesn't hold the laptop's Bedrock permission set alone"
        ]
    ps = sets[0]
    me = f"aws_ssoadmin_permission_set.{ps.labels[1]}"
    if raw(ps, "name") != "local.laptop_permission_set":
        found.append("permission set: its name isn't local.laptop_permission_set")
    # The name decides which set the protected file imports, overwrites, and provisions, so it is the protected
    # file's own (T038's review, I4).
    homes = [
        where(root, b)
        for b in blocks(root, "locals")
        if any(
            isinstance(a, ip.Attribute) and a.name == "laptop_permission_set"
            for a in b.body
        )
    ]
    if homes != ["iam.tf"]:
        found.append("permission set: its name isn't a local of iam.tf alone")
    life = ps.block("lifecycle")
    if life is None or ip.literal(life.attr("prevent_destroy")) is not True:
        found.append("permission set: a plan may destroy it (prevent_destroy)")
    imports = [b for b in blocks(root, "import") if raw(b, "to") == me]
    if len(imports) != 1:
        found.append("permission set: it isn't imported (an import block to it)")
    for kind in (
        "aws_ssoadmin_managed_policy_attachment",
        "aws_ssoadmin_customer_managed_policy_attachment",
        "aws_ssoadmin_permissions_boundary_attachment",
    ):
        if resource(root, kind):
            found.append(f"permission set: it holds {kind}, not only sts:AssumeRole")
    inline = [
        p
        for p in resource(root, "aws_ssoadmin_permission_set_inline_policy")
        if me in raw(p, "permission_set_arn")
    ]
    if len(inline) != 1:
        found.append("permission set: it has no inline policy of its own")
        return found
    sts = statements(document(root, raw(inline[0], "inline_policy")))
    laptop = role(root, "h4-laptop-bedrock")
    target = f"{role_ref(laptop)}.arn" if laptop is not None else "?"
    if not sts or any(
        s["effect"] != "Allow"
        or s["not"]
        or s["actions"] != {"sts:AssumeRole"}
        or not refs(s["resources"], target)
        or s["resources"].count(",") > 0
        for s in sts
    ):
        found.append(
            "permission set: its policy allows more than sts:AssumeRole on h4-laptop-bedrock"
        )
    return found


def bedrock_policy_ok(root: dict[str, list], role_block) -> bool:
    sts = allowed(root, role_block)
    if not sts or attachments(root, role_block):
        return False
    profile = "inference-profile/${local.inference_profile}"
    for s in sts:
        if s["not"] or not s["actions"] <= INVOKE:
            return False
        if profile in s["resources"]:
            continue
        if "foundation-model/" in s["resources"] and any(
            v == "bedrock:InferenceProfileArn" and profile in vals
            for _, v, vals in s["conditions"]
        ):
            continue
        return False
    return any(profile in s["resources"] for s in sts)


def check_laptop_role(root: dict[str, list]) -> list[str]:
    laptop = role(root, "h4-laptop-bedrock")
    if laptop is None:
        return ["laptop role: h4-laptop-bedrock isn't in the root"]
    found = []
    if not ordinary(laptop):
        found.append(
            "laptop role: h4-laptop-bedrock isn't an ordinary role, at the path /"
        )
    trust = statements(document(root, raw(laptop, "assume_role_policy")))
    ok = (
        len(trust) == 1
        and trust[0]["actions"] == {"sts:AssumeRole"}
        and trust[0]["effect"] == "Allow"
    )
    if ok:
        (t,) = trust
        ok = t["principals"] == [
            (
                "AWS",
                '["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]',
            )
        ] and [(test, var, quoted(vals)) for test, var, vals in t["conditions"]] == [
            ("ArnLike", "aws:PrincipalArn", SSO_TRUST)
        ]
    if not ok:
        found.append(
            "laptop role: its trust admits more than the permission set's role"
        )
    if not bedrock_policy_ok(root, laptop):
        found.append(
            "laptop role: it holds more than bedrock:InvokeModel* on the one inference profile"
        )
    profile = locals_of(root).get("inference_profile")
    routing = yaml.safe_load(ROUTING.read_text(encoding="utf-8"))["adapters"][
        "bedrock"
    ]["model"]
    if profile != routing:
        found.append(
            "laptop role: local.inference_profile isn't config/routing.yaml's Bedrock model"
        )
    return found


def check_deny_policy(root: dict[str, list]) -> list[str]:
    deny = named(root, "aws_iam_policy", "h4-deny-paid-models")
    if len(deny) != 1:
        return ["deny policy: h4-deny-paid-models isn't in the root"]
    sts = statements(document(root, raw(deny[0], "policy")))
    if not (
        len(sts) == 1
        and sts[0]["effect"] == "Deny"
        and sts[0]["actions"] == INVOKE
        and sts[0]["resources"] == '["*"]'
        and not sts[0]["conditions"]
    ):
        found = [
            "deny policy: h4-deny-paid-models doesn't deny bedrock:InvokeModel* on every resource"
        ]
        return found
    return []


def _action_role_ok(root: dict[str, list], action, roles: list) -> bool:
    """The action's execution role: trusted by budgets.amazonaws.com alone, and allowed only to attach and detach the
    deny policy on the action's own roles."""
    m = re.fullmatch(
        r"aws_iam_role\.([A-Za-z0-9_-]+)(\[0\])?\.arn",
        raw(action, "execution_role_arn"),
    )
    exec_role = next(
        (r for r in resource(root, "aws_iam_role") if m and r.labels[1] == m.group(1)),
        None,
    )
    if exec_role is None:
        return False
    trust = statements(document(root, raw(exec_role, "assume_role_policy")))
    if not (
        len(trust) == 1
        and trust[0]["principals"] == [("Service", '["budgets.amazonaws.com"]')]
        and trust[0]["actions"] == {"sts:AssumeRole"}
    ):
        return False
    sts = allowed(root, exec_role)
    deny = next(iter(named(root, "aws_iam_policy", "h4-deny-paid-models")), None)
    if deny is None or not sts:
        return False
    targets = {f"{role_ref(r)}.arn" for r in roles}
    for s in sts:
        listed = {
            ref.replace("[0]", "")
            for ref in re.findall(
                r"aws_iam_role\.[A-Za-z0-9_-]+(?:\[0\])?\.arn", s["resources"]
            )
        }
        others = re.sub(
            r"aws_iam_role\.[A-Za-z0-9_-]+(?:\[0\])?\.arn|[\[\], ]", "", s["resources"]
        )
        if (
            s["not"]
            or s["actions"] != {"iam:AttachRolePolicy", "iam:DetachRolePolicy"}
            or listed != targets
            or others
            or not any(
                v == "iam:PolicyARN" and f"aws_iam_policy.{deny.labels[1]}.arn" in vals
                for _, v, vals in s["conditions"]
            )
        ):
            return False
    return True


def _iam_action(root: dict[str, list], action, label: str) -> list[str]:
    found = []
    settings = {
        "action_type": "APPLY_IAM_POLICY",
        "approval_model": "AUTOMATIC",
        "notification_type": "ACTUAL",
    }
    if any(ip.literal(action.attr(k)) != v for k, v in settings.items()):
        found.append(f"{label}: it isn't an automatic APPLY_IAM_POLICY on actual cost")
    th = action.block("action_threshold")
    if th is None or (
        ip.literal(th.attr("action_threshold_type")),
        ip.literal(th.attr("action_threshold_value")),
    ) != ("PERCENTAGE", 100):
        found.append(f"{label}: it doesn't act at 100% of the budget")
    d = action.block("definition")
    iam = d.block("iam_action_definition") if d else None
    deny = next(iter(named(root, "aws_iam_policy", "h4-deny-paid-models")), None)
    if (
        iam is None
        or deny is None
        or raw(iam, "policy_arn") != f"aws_iam_policy.{deny.labels[1]}.arn"
    ):
        found.append(f"{label}: it doesn't apply h4-deny-paid-models")
        return found
    names = re.findall(
        r"aws_iam_role\.([A-Za-z0-9_-]+)(?:\[0\])?\.name", raw(iam, "roles")
    )
    roles = [r for r in resource(root, "aws_iam_role") if r.labels[1] in names]
    extra = re.sub(
        r"aws_iam_role\.[A-Za-z0-9_-]+(\[0\])?\.name|[\[\], ]", "", raw(iam, "roles")
    )
    if (
        not roles
        or len(roles) != len(names)
        or extra
        or not all(ordinary(r) for r in roles)
    ):
        found.append(
            f"{label}: its targets aren't ordinary roles of this root (never Identity Center's)"
        )
        return found
    subs = action.blocks("subscriber")
    if not any(
        raw(s, "address") == TOPIC and ip.literal(s.attr("subscription_type")) == "SNS"
        for s in subs
    ):
        found.append(f"{label}: it doesn't notify h4-alerts")
    if not _action_role_ok(root, action, roles):
        found.append(
            f"{label}: its execution role may do more than attach and detach that policy on those roles"
        )
    return found


def check_model_action(root: dict[str, list]) -> list[str]:
    actions = [
        a
        for a in resource(root, "aws_budgets_budget_action")
        if ip.literal(a.attr("budget_name")) == "h4-model-month"
    ]
    if len(actions) != 1:
        return ["model action: h4-model-month has no action, or more than one"]
    found = _iam_action(root, actions[0], "model action")
    laptop = role(root, "h4-laptop-bedrock")
    if laptop is not None and f"{role_ref(laptop)}.name" not in raw(
        actions[0].block("definition").block("iam_action_definition")
        if actions[0].block("definition")
        else None,
        "roles",
    ):
        found.append("model action: it doesn't target h4-laptop-bedrock")
    return found


def _budget(root: dict[str, list], name: str):
    found = named(root, "aws_budgets_budget", name)
    return found[0] if found else None


def _cent_budget(root: dict[str, list], b, label: str) -> list[str]:
    found = []
    settings = {
        "budget_type": "COST",
        "limit_amount": "0.01",
        "limit_unit": "USD",
        "time_unit": "MONTHLY",
    }
    if any(ip.literal(b.attr(k)) != v for k, v in settings.items()):
        found.append(f"{label}: it isn't a $0.01 monthly cost budget")
    notes = b.blocks("notification")
    if not any(
        ip.literal(n.attr("threshold")) == 100
        and ip.literal(n.attr("threshold_type")) == "PERCENTAGE"
        and ip.literal(n.attr("notification_type")) == "ACTUAL"
        and refs(raw(n, "subscriber_sns_topic_arns"), TOPIC)
        for n in notes
    ):
        found.append(f"{label}: it doesn't notify h4-alerts at 100% of actual")
    return found


def rehearsal_marker() -> str | None:
    return (
        REHEARSAL_MARKER.read_text(encoding="utf-8")
        if REHEARSAL_MARKER.is_file()
        else None
    )


def marker_note(marker: str | None, repo: Path) -> bool:
    """The marker names a note under docs/merge-requests/, which exists and says it is the rehearsal's."""
    names = [
        ln.split(":", 1)[1].strip()
        for ln in (marker or "").splitlines()
        if ln.startswith("note:")
    ]
    if len(names) != 1 or not re.fullmatch(
        r"docs/merge-requests/[0-9A-Za-z._-]+\.md", names[0]
    ):
        return False
    note = repo / names[0]
    return note.is_file() and REHEARSAL_LINE in note.read_text(encoding="utf-8")


def check_rehearsal(
    root: dict[str, list], marker: object = _TREE, repo: Path = REPO
) -> list[str]:
    """The rehearsal's shape whichever way local.rehearsal is set (T038's review, I1). It is true only on the
    rehearsal's own change: with infra/account/rehearsal-on.txt beside it, naming that change's note, which says so;
    and the marker goes when it is false again."""
    found = []
    text = rehearsal_marker() if marker is _TREE else marker
    on = locals_of(root).get("rehearsal")
    if on is True and not marker_note(text, repo):  # type: ignore[arg-type]
        found.append(
            "rehearsal: local.rehearsal is true without its marker, infra/account/rehearsal-on.txt, naming a note "
            "that says it is the rehearsal"
        )
    elif on is False and text is not None:
        found.append(
            "rehearsal: infra/account/rehearsal-on.txt stands while local.rehearsal is false"
        )
    elif on not in (True, False):
        found.append("rehearsal: local.rehearsal isn't true or false")
    every = [
        b
        for b in blocks(root, "resource") + blocks(root, "data")
        if len(b.labels) == 2 and "rehearsal" in b.labels[1]
    ]
    if any(not counted_by_rehearsal(b) for b in every):
        found.append(
            "rehearsal: a rehearsal resource doesn't exist only while local.rehearsal is true"
        )
    model = _budget(root, "h4-rehearsal-model")
    server = _budget(root, "h4-rehearsal-server")
    if model is None or server is None:
        return [*found, "rehearsal: the two $0.01 budgets aren't in the root"]
    found += _cent_budget(root, model, "rehearsal model budget")
    found += _cent_budget(root, server, "rehearsal server budget")
    filters = model.blocks("cost_filter")
    if not (
        len(filters) == 1
        and ip.literal(filters[0].attr("name")) == "Service"
        and raw(filters[0], "values") == "var.bedrock_service_names"
    ):
        found.append(
            "rehearsal model budget: it doesn't read Bedrock's cost by var.bedrock_service_names"
        )
    ct = model.block("cost_types")
    if ct is None or ip.literal(ct.attr("include_credit")) is not False:
        found.append(
            "rehearsal model budget: it counts cost net of credits, unlike h4-model-month (include_credit = false)"
        )
    # As h4-server-month: hashicorp/aws 6.72.0 refuses filter_expression without metrics (the T027 plan, 2026-11-11).
    if re.sub(r"\s", "", raw(server, "metrics")) != '["UnblendedCost"]':
        found.append(
            'rehearsal server budget: metrics isn\'t ["UnblendedCost"], which filter_expression needs'
        )
    # h4-server-month's filter (spec.md Assumptions, "One account, shared with the Author's other work"; ADR 0047), so
    # tripping the rehearsal proves the real budget's filter reads this project's spend.
    fe = server.block("filter_expression")
    terms = fe.blocks("and") if fe is not None else []
    excluded = [t.block("not") for t in terms if t.block("not") is not None]
    dims = excluded[0].block("dimensions") if len(excluded) == 1 else None
    tags = [t.block("tags") for t in terms if t.block("tags") is not None]
    tag = tags[0] if len(tags) == 1 else None
    if (
        fe is None
        or len(fe.body) != 2
        or len(terms) != 2
        or any(len(t.body) != 1 for t in terms)
        or dims is None
        or len(excluded[0].body) != 1
        or len(dims.body) != 2
        or ip.literal(dims.attr("key")) != "SERVICE"
        or raw(dims, "values") != "var.bedrock_service_names"
        or tag is None
        or len(tag.body) != 2
        or ip.literal(tag.attr("key")) != "project"
        or re.sub(r"\s", "", raw(tag, "values")) != '["h4reet-ai"]'
    ):
        found.append(
            "rehearsal server budget: it doesn't read every cost of this project but var.bedrock_service_names'"
        )
    actions = resource(root, "aws_budgets_budget_action")
    model_action = [
        a
        for a in actions
        if f"aws_budgets_budget.{model.labels[1]}[0].name" in raw(a, "budget_name")
    ]
    server_action = [
        a
        for a in actions
        if f"aws_budgets_budget.{server.labels[1]}[0].name" in raw(a, "budget_name")
    ]
    target = role(root, "h4-rehearsal-target")
    if len(model_action) != 1 or target is None:
        found.append(
            "rehearsal: the model rehearsal's action, or h4-rehearsal-target, isn't in the root"
        )
    else:
        found += _iam_action(root, model_action[0], "rehearsal model action")
        defn = model_action[0].block("definition")
        if f"{role_ref(target)}[0].name" not in raw(
            defn.block("iam_action_definition") if defn else None, "roles"
        ):
            found.append(
                "rehearsal model action: it doesn't target h4-rehearsal-target"
            )
        laptop = role(root, "h4-laptop-bedrock")
        same = laptop is not None and [
            raw(p, "policy") for p in inline_policies(root, target)
        ] == [raw(p, "policy") for p in inline_policies(root, laptop)]
        if not same or attachments(root, target):
            found.append(
                "rehearsal target: it isn't of the same shape as h4-laptop-bedrock"
            )
        trust = statements(document(root, raw(target, "assume_role_policy")))
        root_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        if not (
            len(trust) == 1
            and trust[0]["principals"] == [("AWS", f'["{root_arn}"]')]
            and any(
                t == "ArnEquals"
                and v == "aws:PrincipalArn"
                and vals == f'["{root_arn}"]'
                for t, v, vals in trust[0]["conditions"]
            )
        ):
            found.append(
                "rehearsal target: someone could assume it (only the account's root user, who holds no key)"
            )
    instances = [
        i
        for i in resource(root, "aws_instance")
        if (ip.literal(i.attr("tags")) or {}).get("Name") == "h4-rehearsal-instance"
    ]
    if len(server_action) != 1 or len(instances) != 1:
        found.append(
            "rehearsal: the server rehearsal's action, or h4-rehearsal-instance, isn't in the root"
        )
        return found
    inst, act = instances[0], server_action[0]
    mo = inst.block("metadata_options")
    if not (
        ip.literal(inst.attr("instance_type")) == "t4g.nano"
        and ip.literal(inst.attr("associate_public_ip_address")) is False
        and mo is not None
        and ip.literal(mo.attr("http_tokens")) == "required"
        and ip.literal(mo.attr("http_put_response_hop_limit")) == 1
    ):
        found.append(
            "rehearsal instance: it isn't a t4g.nano with no public address and IMDSv2 at hop limit 1"
        )
    settings = {
        "action_type": "RUN_SSM_DOCUMENTS",
        "approval_model": "AUTOMATIC",
        "notification_type": "ACTUAL",
    }
    ssm = (
        act.block("definition").block("ssm_action_definition")
        if act.block("definition")
        else None
    )
    th = act.block("action_threshold")
    me = f"aws_instance.{inst.labels[1]}[0].id"
    if (
        any(ip.literal(act.attr(k)) != v for k, v in settings.items())
        or ssm is None
        or ip.literal(ssm.attr("action_sub_type")) != "STOP_EC2_INSTANCES"
        or ip.literal(ssm.attr("region")) != "us-east-1"
        or raw(ssm, "instance_ids") != f"[{me}]"
        or th is None
        or ip.literal(th.attr("action_threshold_value")) != 100
        or not any(raw(s, "address") == TOPIC for s in act.blocks("subscriber"))
    ):
        found.append(
            "rehearsal server action: it doesn't stop h4-rehearsal-instance, automatically, at 100%"
        )
    m = re.fullmatch(
        r"aws_iam_role\.([A-Za-z0-9_-]+)\[0\]\.arn", raw(act, "execution_role_arn")
    )
    exec_role = next(
        (r for r in resource(root, "aws_iam_role") if m and r.labels[1] == m.group(1)),
        None,
    )
    ok = exec_role is not None
    if ok:
        trust = statements(document(root, raw(exec_role, "assume_role_policy")))
        ok = len(trust) == 1 and trust[0]["principals"] == [
            ("Service", '["budgets.amazonaws.com"]')
        ]
        arn = f"aws_instance.{inst.labels[1]}[0].arn"
        # As AWS's managed AWSBudgetsActions_RolePolicyForResourceAdministrationWithSSM shapes it, narrowed to the one
        # instance (nit 1): the stop document and its reverse, the start; EC2's start and stop on that instance only
        # as Systems Manager calls them; and EC2's Describe calls, which take no narrower resource.
        seen = set()
        for s in allowed(root, exec_role):
            if s["actions"] == {"ssm:StartAutomationExecution"}:
                seen.add("ssm")
                ok &= sorted(quoted(s["resources"])) == sorted(SSM_DOCUMENTS)
            elif s["actions"] == {"ec2:StartInstances", "ec2:StopInstances"}:
                seen.add("ec2")
                ok &= s["resources"] == f"[{arn}]" and [
                    (t, v, quoted(vals)) for t, v, vals in s["conditions"]
                ] == [
                    ("ForAnyValue:StringEquals", "aws:CalledVia", ["ssm.amazonaws.com"])
                ]
            elif s["actions"] <= {
                "ec2:DescribeInstances",
                "ec2:DescribeInstanceStatus",
            }:
                ok &= s["resources"] == '["*"]'
            else:
                ok = False
        ok &= seen == {"ssm", "ec2"}
    if not ok:
        found.append(
            "rehearsal server action: its execution role may do more than run AWS-StopEC2Instance and its reverse "
            "on it"
        )
    return found


def check_schedules(root: dict[str, list]) -> list[str]:
    found = []
    for b in [x for t in EVENTS for x in resource(root, t)]:
        if where(root, b) != "alerts.tf":
            found.append(f"schedules: {address(b)} lives outside alerts.tf")
    rules = {
        ip.literal(r.attr("name")): r
        for r in resource(root, "aws_cloudwatch_event_rule")
    }
    probe, audit = (
        rules.get("h4-probe-every-minute"),
        rules.get("h4-credential-audit-weekly"),
    )
    if (
        probe is None
        or ip.literal(probe.attr("schedule_expression")) != "rate(1 minute)"
        or ip.literal(probe.attr("state")) != "DISABLED"
    ):
        found.append(
            "schedules: the probe's isn't once a minute, written disabled (group 8's P-I5 enables it)"
        )
    if (
        audit is None
        or not str(ip.literal(audit.attr("schedule_expression"))).startswith("cron(")
        or ip.literal(audit.attr("state")) != "ENABLED"
    ):
        found.append(
            "schedules: the credential audit's weekly schedule isn't there and enabled"
        )
    for rule, fn in ((probe, "probe"), (audit, "credential_audit")):
        if rule is None:
            continue
        targets = [
            t
            for t in resource(root, "aws_cloudwatch_event_target")
            if f"aws_cloudwatch_event_rule.{rule.labels[1]}.name" in raw(t, "rule")
        ]
        perms = [
            p
            for p in resource(root, "aws_lambda_permission")
            if ip.literal(p.attr("principal")) == "events.amazonaws.com"
            and f"aws_cloudwatch_event_rule.{rule.labels[1]}.arn"
            in raw(p, "source_arn")
        ]
        if (
            len(targets) != 1
            or f"aws_lambda_function.{fn}[0].arn" not in raw(targets[0], "arn")
            or len(perms) != 1
        ):
            found.append(
                f"schedules: {ip.literal(rule.attr('name'))} doesn't invoke {FUNCTIONS[fn]} alone"
            )
    return found


def check_functions(root: dict[str, list]) -> list[str]:
    found = []
    images = locals_of(root).get("lambda_images")
    if not isinstance(images, dict) or set(images) != set(FUNCTIONS):
        found.append(
            "functions: local.lambda_images doesn't name the three functions' digests"
        )
    for key, name in FUNCTIONS.items():
        fns = named(root, "aws_lambda_function", name, "function_name")
        if len(fns) != 1 or fns[0].labels[1] != key:
            found.append(f"functions: {name} isn't aws_lambda_function.{key}")
            continue
        fn = fns[0]
        if where(root, fn) != "lambdas.tf":
            found.append(f"functions: {name} lives outside lambdas.tf")
        if (
            ip.literal(fn.attr("architectures")) != ["arm64"]
            or ip.literal(fn.attr("package_type")) != "Image"
            or f"@${{local.lambda_images.{key}}}" not in raw(fn, "image_uri")
            or raw(fn, "count") != f'local.lambda_images.{key} == "" ? 0 : 1'
        ):
            found.append(
                f"functions: {name} isn't its image on arm64, by its digest, made once the digest is set"
            )
        m = re.fullmatch(r"aws_iam_role\.([A-Za-z0-9_-]+)\.arn", raw(fn, "role"))
        if not m or not any(
            r.labels[1] == m.group(1) and where(root, r) == "iam.tf"
            for r in resource(root, "aws_iam_role")
        ):
            found.append(f"functions: {name}'s role isn't one of iam.tf's")
    configs = {
        re.sub(r"\[0\].*", "", raw(c, "function_name")).removeprefix(
            "aws_lambda_function."
        ): c
        for c in resource(root, "aws_lambda_function_event_invoke_config")
    }
    bridge = configs.get("alert_bridge")
    dest = (
        bridge.block("destination_config").block("on_failure")
        if bridge and bridge.block("destination_config")
        else None
    )
    if (
        bridge is None
        or ip.literal(bridge.attr("maximum_retry_attempts")) != 2
        or dest is None
        or not re.fullmatch(
            r"aws_sqs_queue\.[A-Za-z0-9_]+\.arn", raw(dest, "destination")
        )
    ):
        found.append(
            "functions: the bridge isn't retried twice, then sent to its failure queue"
        )
    elif not any(
        s["actions"] == {"sqs:SendMessage"}
        and raw(dest, "destination") in s["resources"]
        for r in resource(root, "aws_iam_role")
        if raw(
            next(
                iter(
                    named(
                        root, "aws_lambda_function", "h4-alert-bridge", "function_name"
                    )
                ),
                None,
            ),
            "role",
        )
        == f"{role_ref(r)}.arn"
        for s in allowed(root, r)
    ):
        found.append("functions: the bridge's role may not send to its failure queue")
    probe = configs.get("probe")
    if probe is None or ip.literal(probe.attr("maximum_retry_attempts")) != 0:
        found.append("functions: the probe is retried (its next minute is the retry)")
    return found


def check_bridge_subscription(root: dict[str, list]) -> list[str]:
    subs = [
        s
        for s in resource(root, "aws_sns_topic_subscription")
        if ip.literal(s.attr("protocol")) == "lambda"
    ]
    perms = [
        p
        for p in resource(root, "aws_lambda_permission")
        if ip.literal(p.attr("principal")) == "sns.amazonaws.com"
    ]
    if not (
        len(subs) == 1
        and raw(subs[0], "topic_arn") == TOPIC
        and raw(subs[0], "endpoint") == "aws_lambda_function.alert_bridge[0].arn"
        and len(perms) == 1
        and raw(perms[0], "source_arn") == TOPIC
        and "aws_lambda_function.alert_bridge[0]" in raw(perms[0], "function_name")
    ):
        return [
            "bridge: it isn't subscribed to h4-alerts, invoked by SNS for that topic alone"
        ]
    return []


def check_registry(root: dict[str, list]) -> list[str]:
    found = []
    repos = resource(root, "aws_ecr_repository")
    if not repos or any(
        ip.literal(r.attr("image_tag_mutability")) != "IMMUTABLE"
        or not r.block("image_scanning_configuration")
        or ip.literal(r.block("image_scanning_configuration").attr("scan_on_push"))
        is not True
        for r in repos
    ):
        found.append(
            "registry: a repository's tags can move, or it isn't scanned on push"
        )
    names = set(as_list(locals_of(root).get("lambda_repositories")))
    if names != set(FUNCTIONS.values()):
        found.append(
            "registry: the three functions' repositories aren't local.lambda_repositories"
        )
    buckets = resource(root, "aws_s3_bucket")
    releases = [
        b
        for b in buckets
        if ip.literal(b.attr("bucket_prefix")) == "h4reet-ai-releases-"
    ]
    if len(releases) != 1:
        return [*found, "registry: the release bucket isn't in the root"]
    me = releases[0].labels[1]

    def of(rtype: str) -> list:
        return [
            r
            for r in resource(root, rtype)
            if refs(raw(r, "bucket"), f"aws_s3_bucket.{me}.id")
        ]

    pab = of("aws_s3_bucket_public_access_block")
    keys = (
        "block_public_acls",
        "block_public_policy",
        "ignore_public_acls",
        "restrict_public_buckets",
    )
    if len(pab) != 1 or any(ip.literal(pab[0].attr(k)) is not True for k in keys):
        found.append(
            "registry: the release bucket's public access isn't blocked, all four"
        )
    versioning = of("aws_s3_bucket_versioning")
    vc = versioning[0].block("versioning_configuration") if versioning else None
    if vc is None or ip.literal(vc.attr("status")) != "Enabled":
        found.append("registry: the release bucket isn't versioned")
    if len(of("aws_s3_bucket_server_side_encryption_configuration")) != 1:
        found.append("registry: the release bucket isn't encrypted")
    policies = of("aws_s3_bucket_policy")
    sts = statements(document(root, raw(policies[0], "policy"))) if policies else []
    if (
        not sts
        or any(s["effect"] != "Deny" for s in sts)
        or not any(
            v == "aws:SecureTransport" for s in sts for _, v, _ in s["conditions"]
        )
    ):
        found.append(
            "registry: the release bucket isn't TLS-only, or its policy grants something"
        )
    return found


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
            found.append(f"tags: {address(b)} sets no component")
    return found


def check_files(root: dict[str, list]) -> list[str]:
    """IAM, Identity Center, budgets, SNS, EventBridge, alarms, and Lambda permissions live only in the protected
    files, as rule T5 reads them: resources, not data sources."""
    found = []
    for name, body in root.items():
        if name in PROTECTED_FILES:
            continue
        for b in body:
            if (
                isinstance(b, ip.Block)
                and b.type == "resource"
                and len(b.labels) == 2
                and (
                    b.labels[0].startswith(PROTECTED_PREFIXES)
                    or b.labels[0] in PROTECTED_TYPES
                )
            ):
                found.append(
                    f"files: {address(b)} lives outside iam.tf, killswitch.tf, and alerts.tf"
                )
    return found


# The Author's allowlist, out of the repository (spec 001 Assumptions, "One account, shared with the Author's other
# work"; ADR 0047): h4-credential-audit reads it from his SecureString, which its environment names, and its role may
# read that one parameter and no other.
ALLOW_PARAMETER = "/h4reet/audit/IAM_ALLOW"


def check_audit_allowlist(root: dict[str, list]) -> list[str]:
    found = []
    roles = named(root, "aws_iam_role", "h4-credential-audit-fn")
    reads = (
        [s for s in allowed(root, roles[0]) if "ssm:GetParameter" in s["actions"]]
        if len(roles) == 1
        else []
    )
    if not (
        len(reads) == 1
        and reads[0]["actions"] == {"ssm:GetParameter"}
        and [r.rsplit(":parameter", 1)[-1] for r in quoted(reads[0]["resources"])]
        == [ALLOW_PARAMETER]
    ):
        found.append(
            "credential audit: its role doesn't read exactly the Author's allowlist parameter"
        )
    fns = named(root, "aws_lambda_function", "h4-credential-audit", "function_name")
    env = fns[0].block("environment") if len(fns) == 1 else None
    if env is None or not re.search(
        rf'H4_AUDIT_ALLOW_PARAMETER\s*=\s*"{re.escape(ALLOW_PARAMETER)}"',
        raw(env, "variables"),
    ):
        found.append(
            "credential audit: its environment doesn't name the Author's allowlist parameter"
        )
    return found


CHECKS = (
    check_versions,
    check_provider,
    check_variables,
    check_permission_set,
    check_laptop_role,
    check_deny_policy,
    check_model_action,
    check_rehearsal,
    check_schedules,
    check_functions,
    check_audit_allowlist,
    check_bridge_subscription,
    check_registry,
    check_tags,
    check_files,
)


def problems(
    root: dict[str, list],
    pinned: dict[str, str] | None = None,
    marker: object = _TREE,
    repo: Path = REPO,
) -> list[str]:
    pinned = pins() if pinned is None else pinned
    found: list[str] = []
    for check in CHECKS:
        if check is check_versions:
            found += check(root, pinned)
        elif check is check_rehearsal:
            found += check(root, marker, repo)
        else:
            found += check(root)  # type: ignore[call-arg]
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


def block_address(block) -> tuple[str, ...]:
    """A block's address; a locals block's is its first name's, since main.tf and iam.tf each hold one."""
    if block.type == "locals":
        first = next((a.name for a in block.body if isinstance(a, ip.Attribute)), "")
        return ("locals", first)
    return (block.type, *block.labels)


def mutated(root: dict[str, list], path: Path) -> tuple[dict[str, list], list[str]]:
    body, drops, into, expect = fixture(path)
    out = {name: list(blocks_) for name, blocks_ in root.items()}
    replaced = {block_address(b) for b in body if isinstance(b, ip.Block)} | set(drops)
    origin: dict[tuple[str, ...], str] = {}
    for name, blocks_ in out.items():
        for b in blocks_:
            if isinstance(b, ip.Block) and block_address(b) in replaced:
                origin[block_address(b)] = name
        out[name] = [
            b
            for b in blocks_
            if not (isinstance(b, ip.Block) and block_address(b) in replaced)
        ]
    for b in body:
        target = into or origin.get(block_address(b), "main.tf")
        out.setdefault(target, []).append(b)
    return out, expect


FIXTURE_FILES = sorted(FIXTURES.glob("*.tf"))


# ----------------------------------------------------------------------------------------------------------------------
# The tests.


def test_the_root_holds_its_nine_files_with_the_protected_three_from_p_i2_until_applied() -> (
    None
):
    texts = root_texts()
    assert sorted(texts) == sorted(FILES), sorted(set(FILES) - set(texts))
    for name in PROTECTED_FILES:
        if not (ROOT / name).is_file():
            assert (
                from_patch(PI2.read_text(encoding="utf-8"), f"infra/account/{name}")
                is not None
            )


def test_every_file_reads_as_hcl() -> None:
    for name, text in root_texts().items():
        ip.parse_hcl(
            text
        )  # raises HclError, the policy's T0, on anything it can't read
        assert name.endswith(".tf")


def test_terraform_and_the_provider_are_pinned_and_the_state_is_in_the_bucket() -> None:
    assert check_versions(parsed(root_texts()), pins()) == []


def test_default_tags_name_the_project_and_the_account_environment() -> None:
    assert check_provider(parsed(root_texts())) == []


def test_the_one_variable_is_bedrocks_service_names() -> None:
    assert check_variables(parsed(root_texts())) == []


def test_the_laptops_permission_set_is_imported_and_holds_only_the_assume_role() -> (
    None
):
    assert check_permission_set(parsed(root_texts())) == []


def test_the_permission_sets_name_is_the_one_the_author_read() -> None:
    # Group 4's fact a (the merge-request note, For the Author, 2): no longer null, so make plan ROOT=account reaches
    # the set's lookup; and the trust's pattern holds that set's role's 16 characters.
    root = parsed(root_texts())
    assert locals_of(root).get("laptop_permission_set") == LAPTOP_PERMISSION_SET
    assert ROLE_SUFFIX_LENGTH == 16 and _ROLE.endswith("_" + "?" * 16)


def test_h4_laptop_bedrock_is_an_ordinary_role_on_the_one_profile_trusting_the_set_alone() -> (
    None
):
    assert check_laptop_role(parsed(root_texts())) == []


def test_h4_deny_paid_models_denies_bedrocks_invocations() -> None:
    assert check_deny_policy(parsed(root_texts())) == []


def test_the_model_action_attaches_the_deny_to_ordinary_roles_with_a_role_that_may_do_only_that() -> (
    None
):
    assert check_model_action(parsed(root_texts())) == []


def test_the_rehearsals_exist_only_while_rehearsal_is_true_against_targets_of_the_same_shape() -> (
    None
):
    assert check_rehearsal(parsed(root_texts())) == []


# T038's review, I1: the rehearsal's own change sets local.rehearsal true, with the marker naming its note, and must
# pass the gate; nothing else may, and the rest of the checks hold it just the same.
ON = FIXTURES / "rehearsal-on-in-the-tree.tf"


def rehearsal_on(tmp_path: Path, line: str = REHEARSAL_LINE) -> tuple[dict, str]:
    """The root with local.rehearsal true, and a marker naming a note under tmp_path's docs/merge-requests/."""
    root, _ = mutated(parsed(root_texts()), ON)
    note = tmp_path / "docs" / "merge-requests" / "2026-11-11-ops-001-rehearsal-on.md"
    note.parent.mkdir(parents=True)
    note.write_text(f"# ops/001-rehearsal-on\n{line}\nThe rehearsal (tasks.md T040).\n")
    return root, "note: docs/merge-requests/2026-11-11-ops-001-rehearsal-on.md\n"


def test_the_rehearsals_own_change_passes_with_its_marker(tmp_path: Path) -> None:
    root, marker = rehearsal_on(tmp_path)
    assert locals_of(root)["rehearsal"] is True
    assert problems(root, marker=marker, repo=tmp_path) == []


def test_true_needs_the_marker_and_a_note_that_says_so(tmp_path: Path) -> None:
    root, marker = rehearsal_on(tmp_path, line="<!-- something else -->")
    want = "rehearsal: local.rehearsal is true without its marker"
    for m in (
        None,
        marker,
        "note: docs/merge-requests/no-such-note.md\n",
        "note: ../elsewhere.md\n",
        "",
    ):
        found = problems(root, marker=m, repo=tmp_path)
        assert len(found) == 1 and found[0].startswith(want), (m, found)


def test_the_marker_goes_when_the_rehearsal_ends(tmp_path: Path) -> None:
    _, marker = rehearsal_on(tmp_path)
    found = problems(parsed(root_texts()), marker=marker, repo=tmp_path)
    assert found == [
        "rehearsal: infra/account/rehearsal-on.txt stands while local.rehearsal is false"
    ]


def test_the_tree_holds_no_marker_while_its_rehearsal_is_false() -> None:
    assert locals_of(parsed(root_texts()))["rehearsal"] is False
    assert rehearsal_marker() is None


@pytest.mark.parametrize(
    "path",
    [p for p in FIXTURE_FILES if p.stem.startswith("rehearsal-") and p != ON],
    ids=lambda p: p.stem,
)
def test_the_rehearsals_own_change_is_held_as_strictly(
    path: Path, tmp_path: Path
) -> None:
    # Each rehearsal defect is still found with local.rehearsal true and its marker in place.
    root, marker = rehearsal_on(tmp_path)
    changed, expect = mutated(root, path)
    found = problems(changed, marker=marker, repo=tmp_path)
    for want in expect:
        assert any(want in f for f in found), (want, found)
    assert len(found) == len(expect), found


def test_the_schedules_live_in_alerts_tf_and_the_probes_is_disabled() -> None:
    assert check_schedules(parsed(root_texts())) == []


def test_the_functions_run_their_images_on_arm64_and_the_bridge_retries_then_fails_to_its_queue() -> (
    None
):
    assert check_functions(parsed(root_texts())) == []


def test_the_bridge_is_h4_alerts_subscriber() -> None:
    assert check_bridge_subscription(parsed(root_texts())) == []


def test_the_registry_is_immutable_and_scanned_and_the_release_bucket_private_and_tls_only() -> (
    None
):
    assert check_registry(parsed(root_texts())) == []


def test_every_taggable_resource_names_its_component() -> None:
    assert check_tags(parsed(root_texts())) == []


def test_the_protected_kinds_live_only_in_the_protected_files() -> None:
    assert check_files(parsed(root_texts())) == []


def test_the_root_has_no_problem() -> None:
    assert problems(parsed(root_texts())) == []


def test_the_policy_reads_the_root_as_these_tests_do() -> None:
    # The policy's own T-rules on the root's files, as data, without the lockfile (T10), the Author's from his mirror.
    for name, text in root_texts().items():
        src = ip.Source(f"infra/account/{name}", text, ip.parse_hcl(text))
        found = (
            ip.t8_text(src)
            + ip.t3_providers(src, pins(), root=True)
            + ip.t4_code(src)
            + ip.t5_where(src, set())
            + ip.t7_ingress(src)
            + ip.t9_secrets(src)
            + ip.t11_spot(src)
            + ip.t13_imds(src)
            + [
                f
                for r in ip.resources(src.body)
                for f in ip.t2_tags(src, r, ip.TAGGABLE)
            ]
        )
        assert [str(f) for f in found] == [], name
    srcs = [
        ip.Source(f"infra/account/{n}", t, ip.parse_hcl(t))
        for n, t in root_texts().items()
    ]
    assert [str(f) for f in ip.t6_buckets(srcs)] == []


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
        "--- /dev/null\n+++ b/infra/account/x.tf\n@@ -0,0 +1,2 @@\n+one\n+two\n"
        "--- a/y\n+++ b/y\n@@ -1 +1 @@\n-a\n+b\n"
    )
    assert from_patch(patch, "infra/account/x.tf") == "one\ntwo\n"
    assert from_patch(patch, "y") is None
    assert from_patch(patch, "infra/account/z.tf") is None


def test_the_audit_reads_the_authors_allowlist_parameter_and_no_other() -> None:
    assert check_audit_allowlist(parsed(root_texts())) == []
