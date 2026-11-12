"""Spec 001 group 6, the shared state's Terraform (tasks.md T066, rewritten for W1; FR-019; contracts/shared-state.md
§1; plan.md §16, "The shared state on the tunnel end"): infra/prod/shared-state.tf, and the tunnel end role's grants
in prod's protected iam.tf (the Author's patch P-I7), read with group 1's standard-library HCL reader, never with
Terraform.

What the root must hold:
  - no RDS: no aws_db_* or aws_rds_* resource (rule T12 stays for any later one);
  - the data volume: encrypted gp3, in the tunnel end's zone, prevent_destroy, tagged, of T166's size, attached to the
    tunnel end as /dev/sdf;
  - 5432 on the tunnel end's private interface from EC2's security group alone (test_prod_network.py's group check),
    and EC2's group itself, which group 7 gives its other rules;
  - the backups' bucket: versioned, encrypted, public access blocked, TLS only, its dumps expiring after 7 days (the
    regrouping note's question 4, option A), tagged;
  - the tunnel end's role: s3:PutObject on the bucket's one prefix, and nothing that reads, lists, or deletes there;
  - the shared state's Parameter Store names, read by the tunnel end's role: its own path, and the two role passwords
    of /h4reet/ec2/ by name; no SecureString or secret in Terraform (rule T9).

Each fixture in fixtures/prod-shared-state/ is one defect, as test_prod_network.py's are, and these checks find it.
"""

from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
FIXTURES = HERE / "fixtures" / "prod-shared-state"
BUCKET = "h4reet-ai-shared-state-${data.aws_caller_identity.current.account_id}"
PREFIX = "dumps/"
KEPT_DAYS = 7


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


if not (REPO / "tools" / "gates" / "infra_policy.py").is_file():
    pytest.skip("PLANNED (T010): the reader arrives with P-1", allow_module_level=True)

net = _load("prod_network_for_shared_state", HERE / "test_prod_network.py")
ip = net.ip
lit, raw, one, resource, blocks, address = (
    net.lit,
    net.raw,
    net.one,
    net.resource,
    net.blocks,
    net.address,
)


def root() -> dict[str, list]:
    return net.parsed(net.root_texts())


def check_no_rds(r: dict[str, list]) -> list[str]:
    return [
        f"rds: {address(b)} is RDS, which W1 replaced"
        for b in blocks(r, "resource")
        if b.labels[0].startswith(("aws_db_", "aws_rds_"))
    ]


def lifecycle_prevents_destroy(block) -> bool:
    lc = block.block("lifecycle") if block is not None else None
    return lc is not None and lit(lc, "prevent_destroy") is True


def check_volume(r: dict[str, list]) -> list[str]:
    v = one(r, "aws_ebs_volume", "shared_state")
    if v is None:
        return ["volume: aws_ebs_volume.shared_state is missing"]
    found = []
    if lit(v, "encrypted") is not True or lit(v, "type") != "gp3":
        found.append("volume: it isn't encrypted gp3")
    if raw(v, "availability_zone") != "local.zone":
        found.append("volume: it isn't in the tunnel end's zone, local.zone")
    if raw(v, "size") != "local.shared_state_volume_gib":
        found.append("volume: its size isn't local.shared_state_volume_gib, T166's")
    size = net.locals_in(r, "shared-state.tf").get("shared_state_volume_gib")
    if size is None or not isinstance(ip.literal(size), int) or ip.literal(size) < 1:
        found.append(
            "volume: local.shared_state_volume_gib isn't a whole number of GiB"
        )
    if not lifecycle_prevents_destroy(v):
        found.append("volume: it lacks prevent_destroy, so a plan could replace it")
    tags = lit(v, "tags")
    if not (isinstance(tags, dict) and tags.get("component") == "shared-state"):
        found.append("volume: it isn't tagged component = shared-state")
    # The shared state's volume's attachments, and anything attached to the tunnel end: EC2's data volume is its own
    # (group 7, test_prod_ec2.py).
    attachments = [
        a
        for a in resource(r, "aws_volume_attachment")
        if "shared_state" in raw(a, "volume_id")
        or raw(a, "instance_id") == "aws_instance.tunnel_end.id"
    ]
    if [
        (lit(a, "device_name"), raw(a, "instance_id"), raw(a, "volume_id"))
        for a in attachments
    ] != [("/dev/sdf", "aws_instance.tunnel_end.id", "aws_ebs_volume.shared_state.id")]:
        found.append("volume: it isn't attached to the tunnel end alone, as /dev/sdf")
    return found


def bucket_ref(block) -> str:
    return raw(block, "bucket")


def by_bucket(r: dict[str, list], rtype: str) -> list:
    return [
        b
        for b in resource(r, rtype)
        if bucket_ref(b) == "aws_s3_bucket.shared_state_backups.id"
    ]


def check_bucket(r: dict[str, list]) -> list[str]:
    b = one(r, "aws_s3_bucket", "shared_state_backups")
    if b is None:
        return ["backups: aws_s3_bucket.shared_state_backups is missing"]
    found = []
    if raw(b, "bucket") != f'"{BUCKET}"':
        found.append(f"backups: the bucket isn't named {BUCKET}")
    tags = lit(b, "tags")
    if not (isinstance(tags, dict) and tags.get("component") == "shared-state"):
        found.append("backups: the bucket isn't tagged component = shared-state")
    versioning = by_bucket(r, "aws_s3_bucket_versioning")
    if [lit(v.block("versioning_configuration"), "status") for v in versioning] != [
        "Enabled"
    ]:
        found.append("backups: the bucket isn't versioned")
    sse = by_bucket(r, "aws_s3_bucket_server_side_encryption_configuration")
    algorithms = [
        lit(rule.block("apply_server_side_encryption_by_default"), "sse_algorithm")
        for s in sse
        for rule in s.blocks("rule")
        if rule.block("apply_server_side_encryption_by_default") is not None
    ]
    if algorithms not in (["AES256"], ["aws:kms"]):
        found.append("backups: the bucket isn't encrypted by default")
    blocks_ = by_bucket(r, "aws_s3_bucket_public_access_block")
    settings = (
        "block_public_acls",
        "block_public_policy",
        "ignore_public_acls",
        "restrict_public_buckets",
    )
    if len(blocks_) != 1 or any(lit(blocks_[0], k) is not True for k in settings):
        found.append("backups: public access isn't blocked, all four settings on")
    lifecycle = by_bucket(r, "aws_s3_bucket_lifecycle_configuration")
    rules = [rule for lc in lifecycle for rule in lc.blocks("rule")]
    kept = [
        (
            lit(rule, "status"),
            lit(rule.block("filter"), "prefix") if rule.block("filter") else None,
            lit(rule.block("expiration"), "days") if rule.block("expiration") else None,
            lit(rule.block("noncurrent_version_expiration"), "noncurrent_days")
            if rule.block("noncurrent_version_expiration")
            else None,
        )
        for rule in rules
    ]
    if kept != [("Enabled", PREFIX, KEPT_DAYS, KEPT_DAYS)]:
        found.append(
            f"backups: the dumps aren't kept {KEPT_DAYS} days, then expired with their old versions"
        )
    policies = by_bucket(r, "aws_s3_bucket_policy")
    doc = net.document(r, raw(policies[0], "policy")) if len(policies) == 1 else None
    denies_plain = any(
        s["effect"] == "Deny"
        and ("Bool", "aws:SecureTransport", '["false"]') in s["conditions"]
        for s in net.statements(doc)
    )
    if not denies_plain:
        found.append(
            "backups: the bucket's policy doesn't refuse a request without TLS"
        )
    return found


def tunnel_end_grants(r: dict[str, list]) -> list[dict]:
    out = []
    for p in resource(r, "aws_iam_role_policy"):
        if raw(p, "role") in (
            "aws_iam_role.tunnel_end.id",
            "aws_iam_role.tunnel_end.name",
        ):
            out.extend(net.statements(net.document(r, raw(p, "policy"))))
    return out


def check_put_only(r: dict[str, list]) -> list[str]:
    found = []
    touching = [
        s
        for s in tunnel_end_grants(r)
        if "shared_state_backups" in s["resources"]
        or "h4reet-ai-shared-state" in s["resources"]
    ]
    # Group 9 (tasks.md T119; P-I6): the same put statement also holds the public view's one key, since a role's
    # check takes each action once (test_prod_network.py, check_role). The backups' part stays dumps/* alone.
    if [
        (
            s["effect"],
            s["actions"],
            re.findall(r'"([^"]*shared_state_backups[^"]*)"', s["resources"]),
        )
        for s in touching
    ] != [
        (
            "Allow",
            {"s3:PutObject"},
            ["${aws_s3_bucket.shared_state_backups.arn}/dumps/*"],
        )
    ]:
        found.append("backups: the tunnel end's role does more than put under dumps/")
    for s in tunnel_end_grants(r):
        if s["resources"] in ('["*"]', '"*"') and {
            a for a in s["actions"] if a.startswith("s3:")
        }:
            found.append("backups: the tunnel end's role reaches every bucket")
    return found


ACCOUNT_ID = "${data.aws_caller_identity.current.account_id}"
READS = {
    f"arn:aws:ssm:us-east-1:{ACCOUNT_ID}:parameter/h4reet/tunnel-end/*",
    f"arn:aws:ssm:us-east-1:{ACCOUNT_ID}:parameter/h4reet/hosts/*",
    f"arn:aws:ssm:us-east-1:{ACCOUNT_ID}:parameter/h4reet/ec2/DB_GATEWAY_PASSWORD",
    f"arn:aws:ssm:us-east-1:{ACCOUNT_ID}:parameter/h4reet/ec2/DB_GRAFANA_RO_PASSWORD",
    # Group 9 (tasks.md T119; P-I6): the autostart switch, a String, which the dashboard shows.
    f"arn:aws:ssm:us-east-1:{ACCOUNT_ID}:parameter/h4reet/prod/ec2-autostart",
}


def check_parameters(r: dict[str, list]) -> list[str]:
    found = []
    reads = [
        s
        for s in tunnel_end_grants(r)
        if s["actions"] & {"ssm:GetParameter", "ssm:GetParameters"}
    ]
    named = {
        m for s in reads for m in re.findall(r'"(arn:aws:ssm:[^"]+)"', s["resources"])
    }
    if named != READS:
        found.append(
            f"parameters: the tunnel end's role reads {sorted(named ^ READS)} beyond the shared state's names"
        )
    for b in blocks(r, "resource"):
        if b.labels[0] == "aws_ssm_parameter" and lit(b, "type") != "String":
            found.append(f"parameters: {address(b)} isn't a String (rule T9)")
        if b.labels[0].startswith("aws_secretsmanager_"):
            found.append(f"parameters: {address(b)} is a secret in Terraform")
    return found


def check_ec2_group(r: dict[str, list]) -> list[str]:
    g = one(r, "aws_security_group", "ec2")
    if g is None or lit(g, "name") != "h4-ec2" or raw(g, "vpc_id") != "aws_vpc.prod.id":
        return ["groups: EC2's security group, h4-ec2, isn't in prod's VPC"]
    # Group 7 gives it its rules (test_prod_ec2.py): the tunnel end's 8085 and 4318 alone, never 5432 or anything else.
    tunnel_end = 'cidr_blocks=["10.42.0.10/32", "10.42.1.10/32"]'
    if set(net.group_rules(r, "ec2")) - {(8085, tunnel_end), (4318, tunnel_end)}:
        return [
            "groups: EC2's group admits something beyond the tunnel end's 8085 and 4318"
        ]
    return []


CHECKS = (
    check_no_rds,
    check_volume,
    check_bucket,
    check_put_only,
    check_parameters,
    check_ec2_group,
)


def problems(r: dict[str, list]) -> list[str]:
    return [p for check in CHECKS for p in check(r)]


FIXTURE_FILES = sorted(FIXTURES.glob("*.tf"))


def test_shared_state_tf_is_unprotected_and_reads_as_hcl() -> None:
    assert (REPO / "infra" / "prod" / "shared-state.tf").is_file()
    assert "shared-state.tf" not in net.PROTECTED_FILES


def test_no_rds() -> None:
    assert check_no_rds(root()) == []


def test_the_data_volume() -> None:
    assert check_volume(root()) == []


def test_the_backups_bucket() -> None:
    assert check_bucket(root()) == []


def test_the_tunnel_end_only_puts_backups() -> None:
    assert check_put_only(root()) == []


def test_the_shared_states_parameters_and_no_secret_in_terraform() -> None:
    assert check_parameters(root()) == []


def test_ec2s_group_exists_for_5432s_rule() -> None:
    assert check_ec2_group(root()) == []


def test_the_whole_root_still_passes_group_5s_checks() -> None:
    assert net.problems(root()) == []


@pytest.mark.parametrize("path", FIXTURE_FILES, ids=[p.stem for p in FIXTURE_FILES])
def test_each_fixture_is_found_as_its_defect(path: Path) -> None:
    clean = root()
    assert problems(clean) == [], "the root itself must be clean first"
    changed, expect = net.mutated(clean, path)
    assert expect, f"{path.name} names no problem it expects"
    found = problems(changed)
    for want in expect:
        assert any(want in f for f in found), (want, found)
    assert len(found) == len(expect), found


def test_every_check_has_a_fixture_that_fails_it() -> None:
    clean = root()
    caught = set()
    for path in FIXTURE_FILES:
        changed, _ = net.mutated(clean, path)
        for check in CHECKS:
            if check(changed):
                caught.add(check.__name__)
    assert caught == {c.__name__ for c in CHECKS}
