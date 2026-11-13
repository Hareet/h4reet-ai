"""What Terraform's own validation refuses, which the HCL reader's checks didn't see (spec 001 W1; the Author's first
real `make plan ROOT=prod`, 2026-11-13, at 5589492c with the thirteen patches applied).

Read on the patched tree, every root's files as W1's patches leave them (infra/test/patches.py):
  - no for-expression binds a Terraform built-in name as its key or value variable. `for path, f in …` shadowed the
    built-in `path`, so `path.module` in its body read the string key: "Can't access attributes on a primitive-typed
    value (string)" at ec2.tf:41 and tunnel-end.tf:56;
  - every security group's description, and each ingress and egress block's, and every separate rule's, keeps to
    AWS's characters: "doesn't comply with restrictions ("^[0-9A-Za-z_ .:/()#,@\\[\\]+=&;{}!$*-]*$")", which has no
    apostrophe ("EC2's collector, for the tunnel end's collector", network.tf:88).
"""

from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
ROOTS = ("bootstrap", "account", "prod")
BUILT_INS = frozenset(
    {"path", "count", "each", "self", "var", "local", "module", "data", "terraform"}
)
AWS_DESCRIPTION = re.compile(r"[0-9A-Za-z_ .:/()#,@\[\]+=&;{}!$*-]*")
RULE_TYPES = (
    "aws_security_group_rule",
    "aws_vpc_security_group_ingress_rule",
    "aws_vpc_security_group_egress_rule",
)
FOR = re.compile(
    r"[\[{]\s*for\s+([A-Za-z_][A-Za-z0-9_-]*)\s*(?:,\s*([A-Za-z_][A-Za-z0-9_-]*)\s*)?in\s"
)


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


patches = _load("infra_w1_patches_for_tf_validation", HERE / "patches.py")
ip = _load(
    "infra_policy_for_tf_validation", REPO / "tools" / "gates" / "infra_policy.py"
)


def patched_roots() -> dict[str, str]:
    """Every .tf file of the three roots, by its path, as the tree and W1's patches leave it."""
    names: set[str] = set()
    for root in ROOTS:
        names |= {
            f"infra/{root}/{p.name}" for p in (REPO / "infra" / root).glob("*.tf")
        }
    names |= {
        rel
        for rel in patches.touched()
        if rel.endswith(".tf") and rel.split("/")[:2] in (["infra", r] for r in ROOTS)
    }
    out = {}
    for rel in sorted(names):
        text = patches.patched_text(rel)
        if text is not None:
            out[rel] = text
    return out


def code_of(text: str) -> str:
    """The text without its comments and its strings' contents, so a word in either is never read as code."""
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.DOTALL)
    text = re.sub(r'"(?:[^"\\\n]|\\.)*"', '""', text)
    return "\n".join(re.sub(r"(#|//).*$", "", line) for line in text.splitlines())


def test_the_patched_tree_holds_every_root_and_the_patches_files() -> None:
    texts = patched_roots()
    for rel in (
        "infra/prod/ec2.tf",
        "infra/prod/tunnel-end.tf",
        "infra/prod/network.tf",
        "infra/prod/ec2-market.tf",
        "infra/prod/iam.tf",
        "infra/account/handover.tf",
        "infra/bootstrap/alerts.tf",
    ):
        assert rel in texts, rel


def test_no_for_expression_binds_a_built_in_name() -> None:
    found = []
    for rel, text in patched_roots().items():
        for m in FOR.finditer(code_of(text)):
            for name in m.groups():
                if name in BUILT_INS:
                    line = code_of(text)[: m.start()].count("\n") + 1
                    found.append(
                        f"{rel}:{line}: `for {name}` shadows the built-in `{name}`"
                    )
    assert found == [], found


def test_the_check_finds_the_shape_that_failed() -> None:
    bad = 'x = { for path, f in local.files : path => file("${path.module}/${f}") }\n'
    good = 'x = { for p, f in local.files : p => file("${path.module}/${f}") }\n'
    names = lambda text: [
        n for m in FOR.finditer(code_of(text)) for n in m.groups() if n
    ]
    assert "path" in names(bad)
    assert "path" not in names(good)
    assert names("# for path, f in nothing\n") == []


def descriptions(texts: dict[str, str]) -> list[tuple[str, str, str]]:
    """Each (file, where, description) of a security group, its ingress and egress blocks, and the separate rules."""
    out = []
    for rel, text in texts.items():
        for b in ip.parse_hcl(text).blocks("resource"):
            kind = b.labels[0]
            if kind == "aws_security_group":
                owners = [(".".join(b.labels), b)] + [
                    (f"{'.'.join(b.labels)}.{inner.type}[{n}]", inner)
                    for inner_type in ("ingress", "egress")
                    for n, inner in enumerate(b.blocks(inner_type))
                ]
            elif kind in RULE_TYPES:
                owners = [(".".join(b.labels), b)]
            else:
                continue
            for where, owner in owners:
                attr = owner.attr("description")
                if attr is not None:
                    out.append((rel, where, ip.literal(attr)))
    return out


def test_every_security_group_description_keeps_to_aws_characters() -> None:
    found = [
        f"{rel}: {where}: {value!r}"
        for rel, where, value in descriptions(patched_roots())
        if not isinstance(value, str) or not AWS_DESCRIPTION.fullmatch(value)
    ]
    assert found == [], found


def test_the_description_check_reads_the_groups_their_blocks_and_the_rules() -> None:
    text = """
resource "aws_security_group" "g" {
  description = "A group's"
  ingress {
    description = "In, fine"
  }
  egress {
    description = "Out's"
  }
}
resource "aws_vpc_security_group_ingress_rule" "r" {
  description = "Rule's"
}
"""
    got = {where: value for _, where, value in descriptions({"x.tf": text})}
    assert got == {
        "aws_security_group.g": "A group's",
        "aws_security_group.g.ingress[0]": "In, fine",
        "aws_security_group.g.egress[0]": "Out's",
        "aws_vpc_security_group_ingress_rule.r": "Rule's",
    }
    assert not AWS_DESCRIPTION.fullmatch("A group's")
    assert AWS_DESCRIPTION.fullmatch(
        "EC2 interface: 8085 and 4318 from the tunnel end alone"
    )
