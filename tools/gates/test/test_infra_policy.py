"""Tests for tools/gates/infra_policy.py: rules T1 to T13 on HCL, the reader, and the pass on a saved plan's JSON
(spec 001 contracts/infra-records.md §3; plan §2; tasks.md T004). Each rule has a passing baseline and failing cases.
Key- and token-shaped values are built at run time, never written as literals."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location(
    "infra_policy", REPO / "tools" / "gates" / "infra_policy.py"
)
assert SPEC and SPEC.loader
ip = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ip
SPEC.loader.exec_module(ip)

TF = "1.17.1"
AWS = "6.72.0"

VERSIONS = f"""
terraform {{
  required_version = "{TF}"
  required_providers {{
    aws = {{
      source  = "hashicorp/aws"
      version = "{AWS}"
    }}
  }}
}}
"""


def provider(environment: str) -> str:
    return f"""
provider "aws" {{
  region = "us-east-1"
  default_tags {{
    tags = {{
      project     = "h4reet-ai"
      environment = "{environment}"
    }}
  }}
}}
"""


LOCK = f"""# This file is maintained automatically by "terraform init".
provider "registry.terraform.io/hashicorp/aws" {{
  version     = "{AWS}"
  constraints = "{AWS}"
  hashes = [
    "h1:fixture",
  ]
}}
"""

BOOTSTRAP_MAIN = """
# The state bucket (R-03).
resource "aws_s3_bucket" "state" {
  bucket = "h4reet-state-${var.suffix}" // a template, so not a literal
  tags   = { component = "state" }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

variable "suffix" {
  type = string
}
"""

BOOTSTRAP_BUDGETS = """
resource "aws_budgets_budget" "model_month" {
  name         = "h4-model-month"
  budget_type  = "COST"
  limit_amount = "20"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  tags         = merge(local.tags, { component = "budgets" })
}

locals {
  tags = {}
}
"""

PROD_MARKET = """
resource "aws_launch_template" "tunnel_end" {
  name = "h4-tunnel-end"
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }
  instance_market_options {
    market_type = "spot"
    spot_options {
      instance_interruption_behavior = "stop"
      spot_instance_type             = "persistent"
    }
  }
  tags = { component = "tunnel-end" }
}
"""

PROD_NETWORK = """
data "aws_ip_ranges" "route53" {
  services = ["route53_healthchecks"]
}

data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_security_group" "tunnel_end_public" {
  name = "h4-tunnel-end-public"
  ingress {
    from_port   = 2222
    to_port     = 2222
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 8087
    to_port     = 8087
    protocol    = "tcp"
    cidr_blocks = data.aws_ip_ranges.route53.cidr_blocks
  }
  tags = { component = "tunnel-end" }
}

resource "aws_security_group" "tunnel_end_private" {
  name = "h4-tunnel-end-private"
  ingress {
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront.id]
  }
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.40.0.0/16"]
  }
  tags = { component = "tunnel-end" }
}
"""

PROD_RDS = """
resource "aws_db_instance" "shared" {
  identifier                  = "h4-shared-state"
  engine                      = "postgres"
  publicly_accessible         = false
  storage_encrypted           = true
  deletion_protection         = true
  manage_master_user_password = true
  tags                        = { component = "shared-state" }
}
"""


def write(root: Path, rel: str, text: str) -> Path:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


@pytest.fixture
def tree(tmp_path: Path) -> Path:
    write(
        tmp_path,
        ".devcontainer/toolchain.vars",
        f"TERRAFORM_VERSION={TF}\nTERRAFORM_AWS_PROVIDER_VERSION={AWS}\n",
    )
    for root, env in (
        ("bootstrap", "account"),
        ("account", "account"),
        ("prod", "prod"),
    ):
        write(tmp_path, f"infra/{root}/versions.tf", VERSIONS + provider(env))
        write(tmp_path, f"infra/{root}/.terraform.lock.hcl", LOCK)
    write(tmp_path, "infra/bootstrap/main.tf", BOOTSTRAP_MAIN)
    write(tmp_path, "infra/bootstrap/budgets.tf", BOOTSTRAP_BUDGETS)
    write(tmp_path, "infra/prod/ec2-market.tf", PROD_MARKET)
    write(tmp_path, "infra/prod/network.tf", PROD_NETWORK)
    write(tmp_path, "infra/prod/rds.tf", PROD_RDS)
    write(
        tmp_path,
        "infra/test/fixtures/anything/main.tf",
        'resource "null_resource" "x" {}\n',
    )
    return tmp_path


def rules(root: Path) -> list[str]:
    return sorted({f.rule for f in ip.check_repo(root)})


def only(root: Path, rule: str) -> list:
    found = ip.check_repo(root)
    assert found, "expected a finding"
    assert {f.rule for f in found} == {rule}, [str(f) for f in found]
    return found


def test_the_baseline_passes(tree: Path) -> None:
    assert ip.check_repo(tree) == []


def test_infra_test_is_never_checked(tree: Path) -> None:
    # The baseline holds a null_resource under infra/test/; it is a fixture, never a root.
    assert all(not f.path.startswith("infra/test/") for f in ip.check_repo(tree))


# --- the reader ------------------------------------------------------------------------------------------------------


def test_reader_blocks_attributes_literals_and_raw_text() -> None:
    body = ip.parse_hcl(
        'resource "aws_x" "y" {\n'
        '  a = "s"  # a comment\n'
        "  b = 3\n"
        "  c = [true, null, -1]\n"
        '  d = { k = "v", "q": 2 }\n'
        '  e = "${var.x}-z"\n'
        "  /* a block\n comment */\n"
        "  f = <<-EOT\n    text ${var.y} }\n    EOT\n"
        "  inner { g = 1 }\n"
        "}\n"
    )
    (block,) = body.blocks()
    assert block.type == "resource" and block.labels == ["aws_x", "y"]
    assert block.attr("a").value == "s"
    assert block.attr("b").value == 3
    assert block.attr("c").value == [True, None, -1]
    assert block.attr("d").value == {"k": "v", "q": 2}
    assert block.attr("e").value is ip.UNKNOWN and "var.x" in block.attr("e").raw
    assert block.attr("f").value is ip.UNKNOWN
    assert block.block("inner").attr("g").value == 1
    assert block.attr("g") is None


def test_reader_refuses_what_it_cannot_read() -> None:
    with pytest.raises(ip.HclError):
        ip.parse_hcl('resource "x" "y" {\n  a = "unterminated\n}\n')
    with pytest.raises(ip.HclError):
        ip.parse_hcl('resource "x" "y" {\n  a = 1\n')


def test_an_unreadable_file_is_a_finding(tree: Path) -> None:
    write(tree, "infra/prod/broken.tf", 'resource "aws_vpc" "v" {\n')
    assert rules(tree) == ["T0"]


def test_tf_json_is_read(tree: Path) -> None:
    write(
        tree,
        "infra/account/main.tf.json",
        json.dumps(
            {
                "resource": {
                    "aws_iam_role": {"r": {"name": "x", "tags": {"component": "c"}}}
                }
            }
        ),
    )
    assert rules(tree) == ["T5"]


# --- T1 to T4 --------------------------------------------------------------------------------------------------------


def test_t1_default_tags(tree: Path) -> None:
    write(
        tree,
        "infra/prod/versions.tf",
        VERSIONS + 'provider "aws" {\n  region = "us-east-1"\n}\n',
    )
    only(tree, "T1")


def test_t1_default_tags_need_both_keys(tree: Path) -> None:
    write(
        tree,
        "infra/prod/versions.tf",
        VERSIONS
        + 'provider "aws" {\n  default_tags {\n    tags = { project = "h4reet-ai" }\n  }\n}\n',
    )
    only(tree, "T1")


def test_t2_component(tree: Path) -> None:
    write(
        tree,
        "infra/prod/vpc.tf",
        'resource "aws_vpc" "main" {\n  cidr_block = "10.40.0.0/16"\n}\n',
    )
    only(tree, "T2")


def test_t3_exact_pins_and_only_aws(tree: Path) -> None:
    write(
        tree,
        "infra/prod/versions.tf",
        VERSIONS.replace(f'"{AWS}"', '"~> 6.0"') + provider("prod"),
    )
    only(tree, "T3")


def test_t3_required_version_matches_the_pin(tree: Path) -> None:
    write(
        tree,
        "infra/prod/versions.tf",
        VERSIONS.replace(f'"{TF}"', '"1.16.0"') + provider("prod"),
    )
    only(tree, "T3")


def test_t3_no_other_provider(tree: Path) -> None:
    write(tree, "infra/prod/extra.tf", 'provider "random" {}\n')
    only(tree, "T3")


@pytest.mark.parametrize(
    "text",
    [
        'resource "aws_vpc" "v" {\n  tags = { component = "n" }\n  provisioner "local-exec" {\n    command = "x"\n  }\n}\n',
        'data "external" "x" {\n  program = ["sh"]\n}\n',
        'data "http" "x" {\n  url = "https://example.com"\n}\n',
        'data "aws_lambda_invocation" "x" {\n  function_name = "f"\n  input = "{}"\n}\n',
        'resource "null_resource" "x" {}\n',
        'module "m" {\n  source = "terraform-aws-modules/vpc/aws"\n}\n',
        'module "m" {\n  source = "git::https://example.com/m.git"\n}\n',
    ],
)
def test_t4_nothing_that_runs_code(tree: Path, text: str) -> None:
    write(tree, "infra/prod/extra.tf", text)
    only(tree, "T4")


def test_t4_local_modules_are_allowed(tree: Path) -> None:
    write(
        tree,
        "infra/prod/extra.tf",
        'module "m" {\n  source = "../modules/tagged-bucket"\n}\n',
    )
    assert ip.check_repo(tree) == []


# --- T5 --------------------------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("rel", "text"),
    [
        (
            "infra/account/main.tf",
            'resource "aws_iam_role" "r" {\n  tags = { component = "c" }\n}\n',
        ),
        (
            "infra/account/main.tf",
            'resource "aws_ssoadmin_permission_set" "p" {\n  tags = { component = "c" }\n}\n',
        ),
        (
            "infra/bootstrap/main2.tf",
            'resource "aws_sns_topic" "t" {\n  tags = { component = "c" }\n}\n',
        ),
        (
            "infra/account/lambdas.tf",
            'resource "aws_cloudwatch_event_rule" "probe" {\n  tags = { component = "c" }\n}\n',
        ),
        (
            "infra/account/lambdas.tf",
            'resource "aws_scheduler_schedule" "audit" {\n  name = "x"\n}\n',
        ),
        (
            "infra/prod/edge.tf",
            'resource "aws_cloudfront_cache_policy" "p" {\n  name = "x"\n}\n',
        ),
        (
            "infra/prod/alerts.tf",
            'resource "aws_cloudfront_response_headers_policy" "p" {\n  name = "x"\n}\n',
        ),
        (
            "infra/prod/main.tf",
            'resource "aws_route53_health_check" "h" {\n  tags = { component = "c" }\n}\n',
        ),
        (
            "infra/prod/iam.tf",
            'resource "aws_route53_health_check" "h" {\n  tags = { component = "c" }\n}\n',
        ),
        (
            "infra/account/lambdas.tf",
            'resource "aws_lambda_function" "s" {\n  function_name = "h4-ec2-start"\n  tags = { component = "c" }\n}\n',
        ),
        (
            "infra/account/lambdas.tf",
            'module "guard" {\n  source = "../modules/lambda-image"\n  name = "h4-ec2-guard"\n}\n',
        ),
        (
            "infra/prod/ssm.tf",
            (
                'resource "aws_ssm_parameter" "a" {\n  name = "/h4reet/prod/ec2-autostart"\n  type = "String"\n'
                '  value = "on"\n  tags = { component = "c" }\n}\n'
            ),
        ),
        (
            "infra/prod/ec2.tf",
            PROD_MARKET.replace("tunnel_end", "ec2"),
        ),
    ],
)
def test_t5_protected_resources_only_in_their_files(
    tree: Path, rel: str, text: str
) -> None:
    write(tree, rel, text)
    only(tree, "T5")


def test_t5_the_protected_files_take_them(tree: Path) -> None:
    write(
        tree,
        "infra/account/iam.tf",
        'resource "aws_iam_role" "r" {\n  tags = { component = "c" }\n}\n',
    )
    write(
        tree,
        "infra/account/alerts.tf",
        'resource "aws_cloudwatch_event_rule" "probe" {\n  tags = { component = "c" }\n}\n',
    )
    write(
        tree,
        "infra/prod/edge-limits.tf",
        'resource "aws_cloudfront_cache_policy" "p" {\n  name = "x"\n}\n',
    )
    write(
        tree,
        "infra/prod/failover.tf",
        'resource "aws_route53_health_check" "h" {\n  tags = { component = "c" }\n}\n',
    )
    write(
        tree,
        "infra/account/handover.tf",
        'resource "aws_lambda_function" "s" {\n  function_name = "h4-ec2-start"\n  tags = { component = "c" }\n}\n',
    )
    write(
        tree,
        "infra/modules/lambda-image/IAM.tf",
        'resource "aws_iam_role" "r" {\n  tags = { component = "c" }\n}\n',
    )
    assert ip.check_repo(tree) == []


# --- T6 to T9 --------------------------------------------------------------------------------------------------------


def test_t6_a_bucket_without_its_public_access_block(tree: Path) -> None:
    write(
        tree,
        "infra/prod/site.tf",
        'resource "aws_s3_bucket" "site" {\n  tags = { component = "site" }\n}\n',
    )
    only(tree, "T6")


def test_t6_every_setting_on(tree: Path) -> None:
    write(
        tree,
        "infra/bootstrap/main.tf",
        BOOTSTRAP_MAIN.replace(
            "ignore_public_acls      = true", "ignore_public_acls = false"
        ),
    )
    only(tree, "T6")


def test_t6_no_public_principal_without_source_arn(tree: Path) -> None:
    write(
        tree,
        "infra/bootstrap/policy.tf",
        'resource "aws_s3_bucket_policy" "p" {\n  bucket = aws_s3_bucket.state.id\n'
        '  policy = jsonencode({ Statement = [{ Effect = "Allow", Principal = "*", Action = "s3:GetObject" }] })\n}\n',
    )
    only(tree, "T6")
    write(
        tree,
        "infra/bootstrap/policy.tf",
        'resource "aws_s3_bucket_policy" "p" {\n  bucket = aws_s3_bucket.state.id\n'
        '  policy = jsonencode({ Statement = [{ Effect = "Allow", Principal = { Service = "cloudfront.amazonaws.com" },'
        ' Condition = { StringEquals = { "aws:SourceArn" = var.distribution_arn } } }] })\n}\n',
    )
    assert ip.check_repo(tree) == []


@pytest.mark.parametrize(
    "text",
    [
        (
            'resource "aws_security_group" "web" {\n  ingress {\n    from_port = 22\n    to_port = 22\n'
            '    cidr_blocks = ["0.0.0.0/0"]\n  }\n  tags = { component = "c" }\n}\n'
        ),
        (
            'resource "aws_security_group" "web" {\n  ingress {\n    from_port = 443\n    to_port = 443\n'
            '    ipv6_cidr_blocks = ["::/0"]\n  }\n  tags = { component = "c" }\n}\n'
        ),
        (
            'resource "aws_security_group" "ec2" {\n  ingress {\n    from_port = 2222\n    to_port = 2222\n'
            '    cidr_blocks = ["0.0.0.0/0"]\n  }\n  tags = { component = "c" }\n}\n'
        ),
        (
            'resource "aws_security_group_rule" "r" {\n  type = "ingress"\n  from_port = 443\n  to_port = 443\n'
            "  cidr_blocks = data.aws_ip_ranges.route53.cidr_blocks\n}\n"
        ),
        (
            'resource "aws_vpc_security_group_ingress_rule" "r" {\n  from_port = 443\n  to_port = 443\n'
            '  prefix_list_id = data.aws_ec2_managed_prefix_list.cloudfront.id\n  tags = { component = "c" }\n}\n'
        ),
        (
            'resource "aws_vpc_security_group_ingress_rule" "r" {\n  from_port = 80\n  to_port = 80\n'
            '  cidr_ipv4 = "8.8.8.0/24"\n  tags = { component = "c" }\n}\n'
        ),
    ],
)
def test_t7_no_ingress_from_outside(tree: Path, text: str) -> None:
    write(tree, "infra/prod/extra.tf", text)
    only(tree, "T7")


def test_t8_no_account_id_email_or_key(tree: Path) -> None:
    write(tree, "infra/prod/extra.tf", "# owner " + "1234" * 3 + "\n")
    only(tree, "T8")
    write(
        tree,
        "infra/prod/extra.tf",
        'locals {\n  to = "someone' + "@" + 'example.com"\n}\n',
    )
    only(tree, "T8")
    key = "AKIA" + "Q" * 16
    write(tree, "infra/prod/extra.tf", f'locals {{\n  k = "{key}"\n}}\n')
    found = only(tree, "T8")
    assert all(key not in str(f) for f in found), "a finding never prints the value"


@pytest.mark.parametrize(
    "text",
    [
        (
            'resource "aws_ssm_parameter" "s" {\n  name = "/h4reet/ec2/x"\n  type = "SecureString"\n'
            '  value = "x"\n  tags = { component = "c" }\n}\n'
        ),
        'data "aws_ssm_parameter" "s" {\n  name = "/h4reet/ec2/x"\n}\n',
        'data "aws_secretsmanager_secret_version" "s" {\n  secret_id = "x"\n}\n',
        'resource "aws_secretsmanager_secret_version" "s" {\n  secret_id = "x"\n}\n',
        'ephemeral "aws_secretsmanager_secret_version" "s" {\n  secret_id = "x"\n}\n',
    ],
)
def test_t9_terraform_never_creates_or_reads_a_secret(tree: Path, text: str) -> None:
    write(tree, "infra/prod/extra.tf", text)
    only(tree, "T9")


# --- T10 to T13 ------------------------------------------------------------------------------------------------------


def test_t10_lockfile_present(tree: Path) -> None:
    (tree / "infra/account/.terraform.lock.hcl").unlink()
    only(tree, "T10")


def test_t10_lockfile_matches_the_pin(tree: Path) -> None:
    write(tree, "infra/account/.terraform.lock.hcl", LOCK.replace(AWS, "6.71.0"))
    only(tree, "T10")


@pytest.mark.parametrize(
    ("old", "new"),
    [
        ('market_type = "spot"', 'market_type = "capacity-block"'),
        (
            'instance_interruption_behavior = "stop"',
            'instance_interruption_behavior = "terminate"',
        ),
        (
            'spot_instance_type             = "persistent"',
            'spot_instance_type = "one-time"',
        ),
    ],
)
def test_t11_spot_persistent_stop(tree: Path, old: str, new: str) -> None:
    write(tree, "infra/prod/ec2-market.tf", PROD_MARKET.replace(old, new))
    only(tree, "T11")


def test_t11_market_options_present(tree: Path) -> None:
    text = (
        PROD_MARKET.split("  instance_market_options")[0]
        + '  tags = { component = "tunnel-end" }\n}\n'
    )
    write(tree, "infra/prod/ec2-market.tf", text)
    only(tree, "T11")


@pytest.mark.parametrize(
    ("old", "new"),
    [
        ("publicly_accessible         = false", "publicly_accessible = true"),
        ("storage_encrypted           = true", "storage_encrypted = false"),
        ("deletion_protection         = true", "deletion_protection = false"),
        ("manage_master_user_password = true", "password = var.db_password"),
    ],
)
def test_t12_rds(tree: Path, old: str, new: str) -> None:
    write(tree, "infra/prod/rds.tf", PROD_RDS.replace(old, new))
    only(tree, "T12")


@pytest.mark.parametrize(
    ("old", "new"),
    [
        ('http_tokens                 = "required"', 'http_tokens = "optional"'),
        ("http_put_response_hop_limit = 1", "http_put_response_hop_limit = 2"),
    ],
)
def test_t13_imdsv2_hop_limit_one(tree: Path, old: str, new: str) -> None:
    write(tree, "infra/prod/ec2-market.tf", PROD_MARKET.replace(old, new))
    only(tree, "T13")


# --- the saved plan's JSON -------------------------------------------------------------------------------------------


def plan(*resources: dict) -> dict:
    return {"planned_values": {"root_module": {"resources": list(resources)}}}


def res(kind: str, values: dict, mode: str = "managed") -> dict:
    return {
        "address": f"{kind}.x",
        "mode": mode,
        "type": kind,
        "name": "x",
        "values": values,
    }


GOOD_TAGS = {
    "tags_all": {"project": "h4reet-ai", "environment": "prod", "component": "c"}
}


def test_plan_json_clean() -> None:
    assert ip.check_plan_json(plan(res("aws_vpc", dict(GOOD_TAGS)))) == []


def test_plan_json_rules() -> None:
    found = ip.check_plan_json(
        plan(
            res(
                "aws_vpc", {"tags_all": {"project": "h4reet-ai", "environment": "prod"}}
            ),
            res("null_resource", {}),
            res("aws_ssm_parameter", {"type": "SecureString", **GOOD_TAGS}),
            res(
                "aws_security_group",
                {
                    "ingress": [
                        {"from_port": 22, "to_port": 22, "cidr_blocks": ["0.0.0.0/0"]}
                    ],
                    **GOOD_TAGS,
                },
            ),
            res(
                "aws_instance",
                {
                    "metadata_options": [
                        {"http_tokens": "optional", "http_put_response_hop_limit": 1}
                    ],
                    **GOOD_TAGS,
                },
            ),
            res(
                "aws_db_instance",
                {
                    "publicly_accessible": True,
                    "storage_encrypted": True,
                    "deletion_protection": True,
                    **GOOD_TAGS,
                },
            ),
        )
    )
    assert {f.rule for f in found} >= {"T2", "T4", "T7", "T9", "T12", "T13"}


# --- the command -----------------------------------------------------------------------------------------------------


def test_main_exit_codes(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert ip.main(["--root", str(tree)]) == 0
    write(tree, "infra/prod/vpc.tf", 'resource "aws_vpc" "main" {}\n')
    assert ip.main(["--root", str(tree)]) == 1
    out = capsys.readouterr().out
    assert "T2 infra/prod/vpc.tf:1" in out


def test_main_skips_without_infra(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert ip.main(["--root", str(tmp_path)]) == 0
    assert capsys.readouterr().out.startswith("SKIP: no infra/")


def test_main_plan_json(tmp_path: Path) -> None:
    f = tmp_path / "plan.json"
    f.write_text(json.dumps(plan(res("aws_vpc", dict(GOOD_TAGS)))), encoding="utf-8")
    assert ip.main(["--plan-json", str(f)]) == 0
    f.write_text(json.dumps(plan(res("null_resource", {}))), encoding="utf-8")
    assert ip.main(["--plan-json", str(f)]) == 1


# --- the review's I1 (T009): check blocks, provider prefixes, a module's reach, and a committed .terraform/ ----------


@pytest.mark.parametrize(
    ("text", "rule"),
    [
        ('check "c" {\n  data "external" "x" {\n    program = ["sh"]\n  }\n}\n', "T4"),
        (
            'check "c" {\n  data "http" "x" {\n    url = "https://example.com"\n  }\n}\n',
            "T4",
        ),
        (
            'check "c" {\n  data "aws_ssm_parameter" "s" {\n    name = "/h4reet/ec2/x"\n  }\n}\n',
            "T9",
        ),
        (
            'check "c" {\n  ephemeral "aws_secretsmanager_secret_version" "s" {\n    secret_id = "x"\n  }\n}\n',
            "T9",
        ),
    ],
)
def test_t4_and_t9_read_inside_check_blocks(tree: Path, text: str, rule: str) -> None:
    write(tree, "infra/prod/extra.tf", text)
    only(tree, rule)


@pytest.mark.parametrize(
    "text",
    [
        'resource "random_password" "p" {\n  length = 20\n}\n',
        'data "tls_certificate" "c" {\n  url = "https://example.com"\n}\n',
        'data "terraform_remote_state" "s" {\n  backend = "s3"\n}\n',
        'ephemeral "random_password" "p" {\n  length = 20\n}\n',
    ],
)
def test_t3_every_type_is_hashicorp_aws(tree: Path, text: str) -> None:
    write(tree, "infra/prod/extra.tf", text)
    only(tree, "T3")


def test_t3_terraform_data_is_built_in(tree: Path) -> None:
    write(
        tree,
        "infra/prod/extra.tf",
        'resource "terraform_data" "x" {\n  input = "y"\n}\n',
    )
    assert ip.check_repo(tree) == []


@pytest.mark.parametrize(
    "source", ["../../deploy", "../../../elsewhere", "./../../scripts", "/tmp/m"]
)
def test_t4_a_local_module_stays_inside_infra(tree: Path, source: str) -> None:
    write(tree, "infra/prod/extra.tf", f'module "m" {{\n  source = "{source}"\n}}\n')
    only(tree, "T4")


def test_t4_a_committed_terraform_folder_is_refused(tree: Path) -> None:
    write(
        tree,
        "infra/prod/.terraform/providers/registry.terraform.io/x.txt",
        "a planted provider\n",
    )
    found = only(tree, "T4")
    assert any(".terraform" in f.path for f in found)


# --- group 3's findings (2026-11-10): a list's objects across lines, and a Deny statement's wildcard ------------------


def test_reader_keeps_a_lists_objects_across_lines() -> None:
    body = ip.parse_hcl(
        'x = [\n  {\n    a = 1\n    b = "c"\n  },\n  {\n    d = [\n      "e",\n    ]\n  },\n]\n'
    )
    assert body.attr("x").value == [{"a": 1, "b": "c"}, {"d": ["e"]}]


LIST_SG = """
resource "aws_security_group" "{name}" {{
  ingress = [
    {{
      from_port   = {port}
      to_port     = {port}
      protocol    = "tcp"
      cidr_blocks = ["{cidr}"]
    }},
  ]
  tags = {{ component = "c" }}
}}
"""


def test_t7_reads_ingress_as_a_list_of_objects(tree: Path) -> None:
    write(
        tree,
        "infra/prod/extra.tf",
        LIST_SG.format(name="web", port=22, cidr="0.0.0.0/0"),
    )
    only(tree, "T7")


@pytest.mark.parametrize(
    ("name", "port", "cidr"),
    [("web", 22, "10.40.0.0/16"), ("tunnel_end_public", 2222, "0.0.0.0/0")],
)
def test_t7_list_of_objects_that_pass(
    tree: Path, name: str, port: int, cidr: str
) -> None:
    write(tree, "infra/prod/extra.tf", LIST_SG.format(name=name, port=port, cidr=cidr))
    assert ip.check_repo(tree) == []


TLS_DENY = """
resource "aws_s3_bucket_policy" "tls" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Statement = [
      {
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = "*"
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
}
"""


def test_t6_a_deny_with_a_wildcard_principal_passes(tree: Path) -> None:
    write(tree, "infra/bootstrap/policy.tf", TLS_DENY)
    assert ip.check_repo(tree) == []


def test_t6_an_allow_with_a_wildcard_principal_still_fails(tree: Path) -> None:
    write(tree, "infra/bootstrap/policy.tf", TLS_DENY.replace('"Deny"', '"Allow"'))
    only(tree, "T6")


DOC = """
data "aws_iam_policy_document" "tls" {
  statement {
    {effect}
    actions   = ["s3:*"]
    resources = ["*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
  }
}
"""


def test_t6_a_policy_documents_deny_passes_and_its_allow_fails(tree: Path) -> None:
    write(tree, "infra/bootstrap/policy.tf", DOC.replace("{effect}", 'effect = "Deny"'))
    assert ip.check_repo(tree) == []
    write(
        tree, "infra/bootstrap/policy.tf", DOC.replace("{effect}", "")
    )  # effect defaults to Allow
    only(tree, "T6")


def test_t6_a_heredoc_json_policy(tree: Path) -> None:
    doc = '{"Statement": [{"Effect": "EFFECT", "Principal": "*", "Action": "s3:GetObject", "Resource": "*"}]}'
    text = (
        'resource "aws_s3_bucket_policy" "p" {\n  bucket = aws_s3_bucket.state.id\n  policy = <<EOF\n'
        + doc
        + "\nEOF\n}\n"
    )
    write(tree, "infra/bootstrap/policy.tf", text.replace("EFFECT", "Deny"))
    assert ip.check_repo(tree) == []
    write(tree, "infra/bootstrap/policy.tf", text.replace("EFFECT", "Allow"))
    only(tree, "T6")
