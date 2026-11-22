"""Spec 001 group 5, prod's network and the tunnel end (tasks.md T046; FR-051 to FR-055, FR-076; research.md R-04,
R-10, R-11, R-15; contracts/tunnel.md §1 and §6; contracts/handover.md §2; plan.md §4 and §16): infra/prod's HCL,
read with group 1's standard-library reader, tools/gates/infra_policy.py's, never with python-hcl2 or Terraform.

What the root must hold:
  - one VPC, a public subnet with a route to the internet gateway and a private one with none, in one zone;
  - the tunnel end: from spec 032, one launch template for each type on its list (no instance Terraform holds: it
    forgets the one it made, never destroying it, and reads the current one by its Name tag), each taking the two
    interfaces by ID, the private one at 10.42.1.10 as device 0 and the public one at 10.42.0.10, with the Elastic IP,
    as device 1, IMDSv2 with hop limit 1 (T13), spot, persistent, stopping on interruption (T11);
  - its security groups: 2222 from anywhere and 8087 from Route 53's health checkers on the public interface, 8080 from
    CloudFront's origin-facing list and from its VPC origins' own group on the private one, and nothing else in. The
    VPC origin connects from that group, CloudFront-VPCOrigins-Service-SG, read by name in prod's VPC at plan time;
    the deploy needed it, added by hand (fix F1, specs/001-cloud-elevation/fixes/f1.md). The read waits on nothing
    (no depends_on): a wait on the VPC origin closes a cycle, since the origin targets the tunnel end, whose primary
    interface holds the private group (fix F1's rework, R-1). The private group's name and description stay as
    applied, since a change to either replaces it;
  - no dependency cycle: the references and depends_on of every block, walked offline, never lead from a block back
    to itself, above all from the private group (Terraform's validate and plan refuse a cycle, and there is no
    Terraform in an agent's container);
  - its role, h4-prod-tunnel-end (R-15): ECR pulls from the project's repositories, its Parameter Store path, the
    release bucket's reads, sns:Publish on h4-alerts, by name-built ARNs only, and Session Manager's and Run Command's
    own actions inline, with no managed policy (group 5's review, I1: AmazonSSMManagedInstanceCore reads every
    parameter in the account);
  - the warning rule, h4-tunnel-end-spot-warning, in prod's own handover.tf, naming the tunnel end from this root, to
    h4-alerts as tunnel_end_interruption;
  - the return rule, h4-tunnel-end-running, beside it, the tunnel end entering running, to h4-alerts as tunnel_end_back
    (FR-076, "its return SHALL be alerted"; contracts/handover.md §2: its h4-alerts target in W1, its start-function
    target behind the switch in W2; group 5's review, "Missing");
  - both roots' handover.tf holding local.wired as a boolean literal, so no plan's value decides it; false in W1, and
    true from W2's P-W2, which a test T175 flipped holds (plan.md §16, "Why a switch"; group 5's review, I8);
  - neither root reading the other: nothing under infra/account names a prod instance or health check, or reads prod's
    state; nothing under infra/prod reads, by a data source or a remote state, what the account makes;
  - the tunnel end's types as local.tunnel_end_types in the unprotected tunnel-end.tf, first "t4g.small", T166's
    measured type (2026-11-13: "The type, the larger of the two (R-33's rule on the peaks and on the limits):
    t4g.small."), then Graviton types with its memory or more, each with a price ceiling no higher than the first
    type's on-demand price (spec 032 FR-001, FR-002); each template reads its own type, and no other file sets one;
  - a changed host file, or a new local.tunnel_end_generation (an OS update), replaces the tunnel end's templates in the
    plan: terraform_data.tunnel_end_host in tunnel-end.tf holds the user data's SHA-256 and the generation, and the
    templates are replace_triggered_by it, though they ignore their user data's and their image's drift (group 5's
    review, I3); the running tunnel end moves onto them by the Author's hand replace (spec 032 FR-010).

ec2-market.tf, iam.tf, and handover.tf (both roots') are protected, so they reach the branch only with the Author's
patch, P-I3 (docs/merge-requests/2026-11-13-feat-001-pi3-tunnel-end.patch). Until he applies it these tests read them
as the patch leaves them (infra/test/patches.py). Each fixture in fixtures/prod-tunnel-end/ is one defect, as the other
roots' fixtures are: its blocks replace the root's blocks of the same address (or join the file its "# into:" line
names), its "# drop:" lines remove a block, and its "# expect:" lines are the problems the checks must then report.
"""

from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
READER = REPO / "tools" / "gates" / "infra_policy.py"
PROD = REPO / "infra" / "prod"
ACCOUNT = REPO / "infra" / "account"
FIXTURES = HERE / "fixtures" / "prod-tunnel-end"
PINS = REPO / ".devcontainer" / "toolchain.vars"
FILES = (
    "versions.tf",
    "main.tf",
    "network.tf",
    "tunnel-end.tf",
    "ssm.tf",
    # Group 6's shared state (tasks.md T073), its data volume and its backups' bucket.
    "shared-state.tf",
    # Group 7's EC2 (tasks.md T084, T089; test_prod_ec2.py): its data volume, generation, and W1's stop; and the
    # protected killswitch.tf, its two budget actions (P-I4).
    "ec2.tf",
    "ec2-market.tf",
    "iam.tf",
    "handover.tf",
    "killswitch.tf",
    # Group 8's edge (tasks.md T104, T107; test_prod_cdn.py): the zone and the site's bucket, and the protected
    # edge.tf and edge-limits.tf, the certificate, the distribution, and CloudFront's policies (P-I5).
    "dns.tf",
    "site.tf",
    "edge.tf",
    "edge-limits.tf",
    # Group 9's failover (tasks.md T119, T124; test_handover.py): the health check and h4-laptop-away (P-I6).
    "failover.tf",
)
PROTECTED_FILES = (
    "ec2-market.tf",
    "iam.tf",
    "handover.tf",
    "killswitch.tf",
    "edge.tf",
    "edge-limits.tf",
    "failover.tf",
)
PLACEHOLDER = "measure-in-T166"
# T166's block, on the Author's engine (2026-11-13): "The type, the larger of the two (R-33's rule on the peaks and on
# the limits): t4g.small." The relay's and the collector's limits rise to 128M with it; the five's 592 MiB beside the
# OS's 512 still fit t4g.small by R-33's rule (deploy/scripts/test_measure_tunnel_end.py).
MEASURED_TYPE = "t4g.small"
PUBLIC_ADDRESS = "10.42.0.10"
PRIVATE_ADDRESS = "10.42.1.10"
TOPIC_ARN = (
    "arn:aws:sns:us-east-1:${data.aws_caller_identity.current.account_id}:h4-alerts"
)
# What prod may read with a data source: AWS's own facts, never a resource another root makes (plan.md §16).
PROD_DATA = {
    "aws_caller_identity",
    "aws_ami",
    "aws_ip_ranges",
    "aws_ec2_managed_prefix_list",
    "aws_iam_policy_document",
    # Group 8: CloudFront's own managed CachingDisabled, AWS's fact, read in edge-limits.tf.
    "aws_cloudfront_cache_policy",
    # Fix F1: CloudFront's VPC origins' own group, which CloudFront makes in prod's VPC once an origin exists, and no
    # root makes. check_reads takes this type for that group's name alone.
    "aws_security_group",
    # Spec 032 (FR-015): prod's own hosts, the instances h4-ec2-start launched from prod's templates, by their Name tags.
    "aws_instance",
}
# Spec 032 (FR-001, FR-002): AWS's on-demand list prices, Linux, us-east-1, in US dollars an hour, and each type's
# memory in GiB, as its research R-9 records them; the Author confirms the prices before his apply (SC-006).
ON_DEMAND = {
    "t4g.small": 0.0168,
    "t4g.medium": 0.0336,
    "t4g.large": 0.0672,
    "t4g.xlarge": 0.1344,
    "c7g.medium": 0.0363,
    "c6g.medium": 0.0340,
    "m7g.large": 0.0816,
    "m6g.large": 0.0770,
}
MEMORY_GIB = {
    "t4g.small": 2,
    "t4g.medium": 4,
    "t4g.large": 8,
    "t4g.xlarge": 16,
    "c7g.medium": 2,
    "c6g.medium": 2,
    "m7g.large": 8,
    "m6g.large": 8,
}
GRAVITON = re.compile(r"[a-z][0-9]+g[a-z]*\.[a-z0-9]+")
# The group a VPC origin connects from (fix F1), and the private group as applied: a change to its name or its
# description replaces it, and the interface that holds it with it.
VPC_ORIGINS_GROUP = "CloudFront-VPCOrigins-Service-SG"
PRIVATE_GROUP_NAME = "h4-tunnel-end-private"
PRIVATE_GROUP_DESCRIPTION = "The tunnel end private interface: 8080 from the CloudFront origin-facing addresses, 5432 and 2301 from EC2"
# The account's own rehearsal instance, and killswitch.tf's references to it, are the account's (tasks.md T046).
ACCOUNT_OWN_INSTANCE = "aws_instance.rehearsal"

if not READER.is_file():
    pytest.skip(
        "PLANNED (T010): the reader, tools/gates/infra_policy.py, arrives with the guard patch, P-1",
        allow_module_level=True,
    )


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


ip = _load("infra_policy_for_prod", READER)
patches = _load("infra_w1_patches_for_prod", HERE / "patches.py")


def root_texts(root: str = "prod", names: tuple[str, ...] = FILES) -> dict[str, str]:
    texts = {}
    for name in names:
        text = patches.patched_text(f"infra/{root}/{name}")
        if text is not None:
            texts[name] = text
    return texts


def account_texts() -> dict[str, str]:
    names = {p.name for p in ACCOUNT.glob("*.tf")} | {
        Path(rel).name
        for rel in patches.touched()
        if rel.startswith("infra/account/") and rel.endswith(".tf")
    }
    return root_texts("account", tuple(sorted(names)))


def parsed(texts: dict[str, str]) -> dict[str, list]:
    return {name: list(ip.parse_hcl(text)) for name, text in texts.items()}


# ----------------------------------------------------------------------------------------------------------------------
# Helpers over a root, as {file name: its blocks}.


def blocks(root: dict[str, list], kind: str | None = None) -> list:
    return [
        b
        for body in root.values()
        for b in body
        if isinstance(b, ip.Block) and (kind is None or b.type == kind)
    ]


def resource(root: dict[str, list], rtype: str, kind: str = "resource") -> list:
    return [b for b in blocks(root, kind) if b.labels[:1] == [rtype]]


def one(root: dict[str, list], rtype: str, name: str, kind: str = "resource"):
    found = [b for b in resource(root, rtype, kind) if b.labels[1:2] == [name]]
    return found[0] if len(found) == 1 else None


def where(root: dict[str, list], block) -> str | None:
    return next((n for n, body in root.items() if block in body), None)


def raw(block, name: str) -> str:
    attr = block.attr(name) if block is not None else None
    return "" if attr is None else re.sub(r"\s+", " ", attr.raw)


def lit(block, name: str):
    attr = block.attr(name) if block is not None else None
    return None if attr is None else ip.literal(attr)


def address(block) -> str:
    return ".".join(block.labels)


def locals_in(root: dict[str, list], file: str) -> dict[str, object]:
    out: dict[str, object] = {}
    for b in root.get(file, []):
        if isinstance(b, ip.Block) and b.type == "locals":
            for a in b.body:
                if isinstance(a, ip.Attribute):
                    out[a.name] = a
    return out


def as_list(value: object) -> list:
    return value if isinstance(value, list) else [value]


def statements(doc) -> list[dict]:
    out = []
    for st in doc.blocks("statement") if doc is not None else []:
        out.append(
            {
                "effect": lit(st, "effect") or "Allow",
                "actions": {
                    a for a in as_list(lit(st, "actions")) if isinstance(a, str)
                },
                "resources": raw(st, "resources"),
                "conditions": [
                    (lit(c, "test"), lit(c, "variable"), raw(c, "values"))
                    for c in st.blocks("condition")
                ],
                "principals": [
                    (lit(p, "type"), raw(p, "identifiers"))
                    for p in st.blocks("principals")
                ],
            }
        )
    return out


def document(root: dict[str, list], ref: str):
    # The whole reference, never one inside replace(), merge(), or jsonencode() (the second review, I-A).
    m = re.fullmatch(r"data\.aws_iam_policy_document\.(\w+)\.json", ref.strip())
    return one(root, "aws_iam_policy_document", m.group(1), "data") if m else None


# ----------------------------------------------------------------------------------------------------------------------
# The checks. Each takes the root and returns its problems, "<area>: <what>".


def check_versions(root: dict[str, list]) -> list[str]:
    pinned = ip.read_pins(PINS)
    tfs = blocks(root, "terraform")
    found = []
    if [lit(t, "required_version") for t in tfs if t.attr("required_version")] != [
        pinned.get("TERRAFORM_VERSION")
    ]:
        found.append("versions: required_version isn't the pin")
    backends = [b for t in tfs for b in t.blocks("backend")]
    if (
        len(backends) != 1
        or backends[0].labels != ["s3"]
        or lit(backends[0], "key") != "prod.tfstate"
        or lit(backends[0], "encrypt") is not True
        or lit(backends[0], "use_lockfile") is not True
        or backends[0].attr("bucket") is not None
    ):
        found.append(
            "versions: the state isn't prod.tfstate in the bucket, encrypted, with S3's lock file and the bucket "
            "from make plan"
        )
    providers = [p for p in blocks(root, "provider") if p.labels == ["aws"]]
    tags = (
        lit(providers[0].block("default_tags"), "tags")
        if len(providers) == 1 and providers[0].block("default_tags")
        else None
    )
    if (
        len(providers) != 1
        or lit(providers[0], "region") != "us-east-1"
        or tags != {"project": "h4reet-ai", "environment": "prod"}
    ):
        found.append(
            "provider: one aws provider in us-east-1, with default_tags project h4reet-ai and environment prod"
        )
    if blocks(root, "variable"):
        found.append(
            "variables: prod takes no variable (a new one needs its deny first)"
        )
    return found


def check_network(root: dict[str, list]) -> list[str]:
    found = []
    vpc = one(root, "aws_vpc", "prod")
    if vpc is None or lit(vpc, "cidr_block") != "10.42.0.0/16":
        found.append("network: aws_vpc.prod isn't 10.42.0.0/16")
    public, private = (
        one(root, "aws_subnet", "public"),
        one(root, "aws_subnet", "private"),
    )
    if (
        public is None
        or private is None
        or lit(public, "cidr_block") != "10.42.0.0/24"
        or lit(private, "cidr_block") != "10.42.1.0/24"
        or raw(public, "availability_zone") != raw(private, "availability_zone")
        or lit(public, "map_public_ip_on_launch") is True
        or lit(private, "map_public_ip_on_launch") is True
    ):
        found.append(
            "network: the public (10.42.0.0/24) and private (10.42.1.0/24) subnets aren't in one zone, or one "
            "assigns public addresses by itself"
        )
    to_igw = [
        t
        for t in resource(root, "aws_route_table")
        if any(
            "aws_internet_gateway." in raw(r, "gateway_id")
            and lit(r, "cidr_block") == "0.0.0.0/0"
            for r in t.blocks("route")
        )
    ] + [
        r
        for r in resource(root, "aws_route")
        if "aws_internet_gateway." in raw(r, "gateway_id")
    ]
    if len(resource(root, "aws_internet_gateway")) != 1 or len(to_igw) != 1:
        found.append("network: no single route to the one internet gateway")
    associations = {
        raw(a, "subnet_id"): raw(a, "route_table_id")
        for a in resource(root, "aws_route_table_association")
    }
    igw_table = (
        f"{address(to_igw[0])}.id"
        if to_igw and to_igw[0].labels[0] == "aws_route_table"
        else (raw(to_igw[0], "route_table_id") if to_igw else "")
    )
    if associations.get("aws_subnet.public.id") != igw_table:
        found.append("network: the public subnet doesn't route to the internet gateway")
    if associations.get("aws_subnet.private.id") in (None, igw_table):
        found.append(
            "network: the private subnet has a route out, or no table of its own"
        )
    return found


def templates(root: dict[str, list]):
    return one(root, "aws_launch_template", "tunnel_end")


def removed_from(root: dict[str, list], address_: str):
    """The removed block that forgets address_, if it keeps the object (destroy = false)."""
    for b in blocks(root, "removed"):
        lc = b.block("lifecycle")
        if (
            raw(b, "from") == address_
            and lc is not None
            and lit(lc, "destroy") is False
        ):
            return b
    return None


def check_instance(root: dict[str, list]) -> list[str]:
    found = []
    t = templates(root)
    if t is None:
        return ["tunnel end: aws_launch_template.tunnel_end is missing"]
    if where(root, t) != "ec2-market.tf":
        found.append("tunnel end: the templates live outside ec2-market.tf")
    if raw(t, "for_each") != "local.tunnel_end_templates":
        found.append(
            "tunnel end: the templates aren't one for each type on local.tunnel_end_types"
        )
    src = ip.Source("infra/prod/ec2-market.tf", "", ip.Body([t]))
    for f in ip.t11_spot(src) + ip.t13_imds(src):
        found.append(f"tunnel end: {f.message}")
    spot = t.block("instance_market_options")
    so = spot.block("spot_options") if spot is not None else None
    if so is None or raw(so, "max_price") != "each.value.max_price":
        found.append("tunnel end: a template doesn't carry its type's price ceiling")
    # B-6, option C (the Author's answer: "We aren't building option A, we went with Option C"): the private interface
    # is the instance's primary, device 0, so the instance sits in the private subnet, where AWS documents a VPC
    # origin's instance, and the origin reaches 10.42.1.10, where the relay listens; the public one, with the Elastic
    # IP, is its second, device 1. From spec 032 both by ID in each template, so every launch takes both.
    interfaces = sorted(
        (lit(n, "device_index"), raw(n, "network_interface_id"))
        for n in t.blocks("network_interfaces")
    )
    if not interfaces or interfaces[0] != (
        0,
        "aws_network_interface.tunnel_end_private.id",
    ):
        found.append(
            "tunnel end: its primary interface isn't the private one, device 0 (B-6, option C)"
        )
    if interfaces[1:] != [(1, "aws_network_interface.tunnel_end_public.id")]:
        found.append("tunnel end: the public interface isn't its second, device 1")
    for name, subnet, addr, group in (
        ("tunnel_end_public", "public", PUBLIC_ADDRESS, "tunnel_end_public"),
        ("tunnel_end_private", "private", PRIVATE_ADDRESS, "tunnel_end_private"),
    ):
        eni = one(root, "aws_network_interface", name)
        if (
            eni is None
            or raw(eni, "subnet_id") != f"aws_subnet.{subnet}.id"
            or lit(eni, "private_ips") != [addr]
            or raw(eni, "security_groups") != f"[aws_security_group.{group}.id]"
        ):
            found.append(
                f"tunnel end: {name} isn't {addr} in the {subnet} subnet with its own group"
            )
    eips = resource(root, "aws_eip")
    if (
        len(eips) != 1
        or raw(eips[0], "network_interface")
        != "aws_network_interface.tunnel_end_public.id"
        or lit(eips[0], "domain") != "vpc"
    ):
        found.append("tunnel end: its one Elastic IP isn't on the public interface")
    profile = t.block("iam_instance_profile")
    if (
        profile is None
        or raw(profile, "name") != "aws_iam_instance_profile.tunnel_end.name"
    ):
        found.append("tunnel end: it doesn't run as its instance profile")
    disks = [m.block("ebs") for m in t.blocks("block_device_mappings")]
    if (
        len(disks) != 1
        or disks[0] is None
        or lit(disks[0], "encrypted") is not True
        or lit(disks[0], "volume_type") != "gp3"
    ):
        found.append("tunnel end: its root volume isn't encrypted gp3")
    credits = [d for d in t.blocks("dynamic") if d.labels == ["credit_specification"]]
    if not (
        len(credits) == 1
        and re.sub(r"\s+", "", raw(credits[0], "for_each"))
        == 'startswith(each.key,"t")?["standard"]:[]'
    ):
        found.append("tunnel end: its CPU credits aren't standard (research.md R-04)")
    tagged = [d for d in t.blocks("dynamic") if d.labels == ["tag_specifications"]]
    content = tagged[0].block("content") if len(tagged) == 1 else None
    tags = lit(content, "tags") if content is not None else None
    if not (
        isinstance(tags, dict)
        and tags.get("Name") == "h4-prod-tunnel-end"
        and tags.get("project") == "h4reet-ai"
        and tags.get("component") == "tunnel-end"
        and '"instance"' in raw(tagged[0], "for_each")
        and '"volume"' in raw(tagged[0], "for_each")
    ):
        found.append(
            "tunnel end: what a template launches isn't tagged Name = h4-prod-tunnel-end with project and component"
        )
    if resource(root, "aws_instance"):
        found.append(
            "tunnel end: prod holds an instance; h4-ec2-start launches the hosts (spec 032)"
        )
    for gone in (
        "aws_instance.tunnel_end",
        "aws_network_interface_attachment.tunnel_end_public",
    ):
        if removed_from(root, gone) is None:
            found.append(
                f"tunnel end: {gone} isn't forgotten by a removed block that keeps it"
            )
    current = one(root, "aws_instance", "tunnel_end", kind="data")
    if current is None or "h4-prod-tunnel-end" not in raw(
        current.block("filter"), "values"
    ):
        found.append(
            "tunnel end: the root doesn't read the current tunnel end by its Name tag"
        )
    return found


def check_type(root: dict[str, list]) -> list[str]:
    found = []
    mine = locals_in(root, "tunnel-end.tf")
    listed = (
        ip.literal(mine["tunnel_end_types"]) if "tunnel_end_types" in mine else None
    )
    if not (
        isinstance(listed, list)
        and listed
        and all(isinstance(e, dict) and {"type", "max_price"} <= set(e) for e in listed)
    ):
        return [
            "type: tunnel-end.tf's local.tunnel_end_types isn't a list of types and ceilings"
        ]
    found += type_list_problems(listed, MEASURED_TYPE, "tunnel end")
    elsewhere = [
        name
        for name in root
        if name != "tunnel-end.tf"
        and {"tunnel_end_type", "tunnel_end_types"} & set(locals_in(root, name))
    ]
    if elsewhere:
        found.append(
            f"type: the tunnel end's types are set in {', '.join(elsewhere)} too"
        )
    t = templates(root)
    if t is None or raw(t, "instance_type") != "each.key":
        found.append("type: a tunnel end template doesn't read its own type")
    # EC2's are ec2.tf's (test_prod_ec2.py); nothing else sets a type.
    typed = [b for b in blocks(root, "resource") if b.attr("instance_type") is not None]
    if [
        address(b)
        for b in typed
        if address(b)
        not in ("aws_launch_template.tunnel_end", "aws_launch_template.ec2")
    ]:
        found.append("type: another resource sets an instance type")
    return found


def type_list_problems(listed: list, first: str, host: str) -> list[str]:
    """Spec 032 FR-001, FR-002: the first type first; Graviton types alone, each with the first's memory or more, each
    once; each ceiling a number no higher than the first type's on-demand price."""
    found = []
    types = [e["type"] for e in listed]
    if types[0] != first:
        found.append(f"type: the {host}'s first type isn't \"{first}\"")
    if len(set(types)) != len(types):
        found.append(f"type: a {host} type is listed twice")
    for kind in types:
        if not GRAVITON.fullmatch(str(kind)) or kind not in MEMORY_GIB:
            found.append(f"type: {kind} isn't a Graviton type this check knows")
        elif MEMORY_GIB[kind] < MEMORY_GIB.get(first, 0):
            found.append(f"type: {kind} has less memory than {first}")
    for e in listed:
        try:
            ceiling = float(e["max_price"])
        except (TypeError, ValueError):
            found.append(f"type: {e['type']}'s ceiling isn't a price")
            continue
        if not 0 < ceiling <= ON_DEMAND.get(first, 0):
            found.append(
                f"type: {e['type']}'s ceiling is above {first}'s on-demand price (spec 032 FR-002)"
            )
    return found


def check_host_replace(root: dict[str, list]) -> list[str]:
    """A changed host file, or a new generation, plans as the templates' replace (group 5's review, I3; spec 032)."""
    found = []
    held = one(root, "terraform_data", "tunnel_end_host")
    generation = locals_in(root, "tunnel-end.tf").get("tunnel_end_generation")
    if (
        held is None
        or where(root, held) != "tunnel-end.tf"
        or "sha256(local.tunnel_end_user_data)" not in raw(held, "input")
        or "local.tunnel_end_generation" not in raw(held, "input")
    ):
        found.append(
            "host: no terraform_data.tunnel_end_host in tunnel-end.tf holds the user data's SHA-256 and the generation"
        )
    if generation is None or not isinstance(ip.literal(generation), int):
        found.append("host: tunnel-end.tf's local.tunnel_end_generation isn't a number")
    t = templates(root)
    lifecycles = t.blocks("lifecycle") if t is not None else []
    if [raw(lc, "replace_triggered_by") for lc in lifecycles] != [
        "[terraform_data.tunnel_end_host]"
    ]:
        found.append(
            "host: a changed host file or a new generation doesn't replace the tunnel end"
        )
    if [raw(lc, "ignore_changes") for lc in lifecycles] != ["[image_id, user_data]"]:
        found.append(
            "host: the templates don't ignore their image's and their user data's drift"
        )
    metadata = t.block("metadata_options") if t is not None else None
    if metadata is not None and lit(metadata, "instance_metadata_tags") == "enabled":
        found.append(
            "host: the instance's tags are in its metadata, which nothing on it reads"
        )
    return found


def group_rules(root: dict[str, list], name: str) -> list[tuple[int | None, str]]:
    """A security group's ingress rules: (port, the source as written)."""
    g = one(root, "aws_security_group", name)
    out = []
    for ing in g.blocks("ingress") if g is not None else []:
        lo, hi = lit(ing, "from_port"), lit(ing, "to_port")
        port = lo if lo == hi else None
        for key in (
            "cidr_blocks",
            "ipv6_cidr_blocks",
            "prefix_list_ids",
            "security_groups",
        ):
            if ing.attr(key) is not None:
                out.append((port, f"{key}={raw(ing, key)}"))
    return out


def check_groups(root: dict[str, list]) -> list[str]:
    found = []
    public = group_rules(root, "tunnel_end_public")
    want_public = {
        (2222, 'cidr_blocks=["0.0.0.0/0"]'),
        (8087, "cidr_blocks=data.aws_ip_ranges.route53_health_checks.cidr_blocks"),
    }
    if set(public) != want_public or len(public) != 2:
        found.append(
            "groups: the public interface doesn't admit exactly 2222 from anywhere and 8087 from Route 53's checkers"
        )
    private = group_rules(root, "tunnel_end_private")
    # Group 6 (tasks.md T066): the shared state's 5432, from EC2's group alone; group 10 (tasks.md T137): the public
    # view's sink's 2301, for EC2's publisher, from EC2's group alone too. Fix F1: the VPC origin connects from its own
    # group, not from the origin-facing list's addresses, so 8080 admits that group too; the prefix list's rule stays
    # until the Author decides (specs/001-cloud-elevation/fixes/f1.md, Q-F1-1).
    if private != [
        (8080, "prefix_list_ids=[data.aws_ec2_managed_prefix_list.cloudfront.id]"),
        (
            8080,
            "security_groups=[data.aws_security_group.cloudfront_vpc_origins.id]",
        ),
        (5432, "security_groups=[aws_security_group.ec2.id]"),
        (2301, "security_groups=[aws_security_group.ec2.id]"),
    ]:
        found.append(
            "groups: the private interface doesn't admit exactly 8080 from CloudFront's origin-facing list and from "
            "its VPC origins' group, and 5432 and 2301 from EC2's group"
        )
    # The VPC origins' group, by its name in prod's VPC, in tunnel-end.tf, read at plan time: the group exists in
    # prod's VPC, since the VPC origin does. A depends_on would make the read wait on what it names; on the VPC origin
    # it closes a cycle through the private group (fix F1's rework, R-1: the origin targets the tunnel end, whose
    # primary interface holds the private group), so the read waits on nothing. A rebuild from nothing meets a group
    # not yet made: that order is fixes/f1.md's backlog, not this read's.
    origins = one(root, "aws_security_group", "cloudfront_vpc_origins", "data")
    if (
        origins is None
        or where(root, origins) != "tunnel-end.tf"
        or lit(origins, "name") != VPC_ORIGINS_GROUP
        or raw(origins, "vpc_id") != "aws_vpc.prod.id"
    ):
        found.append(
            f"groups: {VPC_ORIGINS_GROUP} isn't read by its name in prod's VPC, in tunnel-end.tf"
        )
    if origins is not None and origins.attr("depends_on") is not None:
        found.append(
            f"groups: the read of {VPC_ORIGINS_GROUP} waits on {raw(origins, 'depends_on')}, so it isn't made at "
            "plan time"
        )
    # A plan from a fresh clone shows the rule in place, never the group replaced: its name, description, and VPC as
    # applied (a change to any of them forces a new group, which its interface holds).
    group = one(root, "aws_security_group", "tunnel_end_private")
    if (
        group is None
        or lit(group, "name") != PRIVATE_GROUP_NAME
        or lit(group, "description") != PRIVATE_GROUP_DESCRIPTION
        or raw(group, "vpc_id") != "aws_vpc.prod.id"
    ):
        found.append(
            "groups: the private group's name, description, or VPC isn't the applied one, so the plan replaces it"
        )
    ranges = one(root, "aws_ip_ranges", "route53_health_checks", "data")
    if ranges is None or lit(ranges, "services") != ["route53_healthchecks"]:
        found.append("groups: Route 53's ranges aren't the health checkers'")
    cloudfront = one(root, "aws_ec2_managed_prefix_list", "cloudfront", "data")
    if cloudfront is None or lit(cloudfront, "name") != (
        "com.amazonaws.global.cloudfront.origin-facing"
    ):
        found.append("groups: the prefix list isn't CloudFront's origin-facing one")
    if [
        address(b)
        for b in resource(root, "aws_vpc_security_group_ingress_rule")
        + resource(root, "aws_security_group_rule")
    ]:
        found.append("groups: an ingress rule outside the groups' own blocks")
    return found


# The role's grants (research.md R-15; tasks.md T046), each by a name-built ARN.
ACCOUNT_ID = "${data.aws_caller_identity.current.account_id}"
ECR = f"arn:aws:ecr:us-east-1:{ACCOUNT_ID}:repository/h4reet/*"
PARAMETERS = (
    f'[ "arn:aws:ssm:us-east-1:{ACCOUNT_ID}:parameter/h4reet/tunnel-end/*", '
    f'"arn:aws:ssm:us-east-1:{ACCOUNT_ID}:parameter/h4reet/hosts/*", '
    # Group 6 (tasks.md T066): the two role passwords of /h4reet/ec2/ the shared state's roles target sets, by name.
    f'"arn:aws:ssm:us-east-1:{ACCOUNT_ID}:parameter/h4reet/ec2/DB_GATEWAY_PASSWORD", '
    f'"arn:aws:ssm:us-east-1:{ACCOUNT_ID}:parameter/h4reet/ec2/DB_GRAFANA_RO_PASSWORD", '
    # Group 9 (tasks.md T119; P-I6): the autostart switch, a String, for the dashboard.
    f'"arn:aws:ssm:us-east-1:{ACCOUNT_ID}:parameter/h4reet/prod/ec2-autostart", ]'
)
ROLE_GRANTS = {
    "ecr:GetAuthorizationToken": '["*"]',
    "ecr:BatchGetImage": f'["{ECR}"]',
    "ecr:GetDownloadUrlForLayer": f'["{ECR}"]',
    "ecr:BatchCheckLayerAvailability": f'["{ECR}"]',
    "ssm:GetParameter": PARAMETERS,
    "ssm:GetParameters": PARAMETERS,
    # Its SecureStrings, this account's keys alone, and only through Parameter Store (the condition, below).
    "kms:Decrypt": f'["arn:aws:kms:us-east-1:{ACCOUNT_ID}:key/*"]',
    "s3:GetObject": '[ "arn:aws:s3:::h4reet-ai-releases-*/releases/*", "arn:aws:s3:::h4reet-ai-releases-*/trees/*", '
    '"arn:aws:s3:::h4reet-ai-releases-*/tools/*", ]',
    "s3:ListBucket": '["arn:aws:s3:::h4reet-ai-releases-*"]',
    "sns:Publish": f'["{TOPIC_ARN}"]',
    # Group 6 (tasks.md T066): the hourly backup's put, under its one prefix; nothing reads or deletes there. Group 9
    # (tasks.md T119; contracts/public-view.md §2): and the public view's one key, which group 10's sink writes.
    "s3:PutObject": '[ "${aws_s3_bucket.shared_state_backups.arn}/dumps/*", '
    '"${aws_s3_bucket.site.arn}/site/status/latest.json", ]',
    # Group 9 (tasks.md T119; research.md R-15; plan.md §11): the sink's cloud reads for the dashboard. EC2's describe
    # calls and CloudWatch's GetMetricData take no narrower resource; the rest are by name, or prod's own check.
    "ec2:DescribeInstances": '["*"]',
    "ec2:DescribeSpotInstanceRequests": '["*"]',
    "cloudwatch:GetMetricData": '["*"]',
    "route53:GetHealthCheckStatus": '["arn:aws:route53:::healthcheck/${aws_route53_health_check.laptop.id}"]',
    "budgets:ViewBudget": f'["arn:aws:budgets::{ACCOUNT_ID}:budget/h4-server-month"]',
    "budgets:DescribeBudgetActionsForBudget": f'["arn:aws:budgets::{ACCOUNT_ID}:budget/h4-server-month"]',
    # T170 (the Author's answer to question 1b, "1b A"): the sink reads EC2's hours from the two schedules, by name,
    # so local.ec2_hours stays their one source.
    "scheduler:GetSchedule": f'[ "arn:aws:scheduler:us-east-1:{ACCOUNT_ID}:schedule/default/h4-ec2-hours-open", '
    f'"arn:aws:scheduler:us-east-1:{ACCOUNT_ID}:schedule/default/h4-ec2-hours-close", ]',
}
# Session Manager and Run Command, the one way in (FR-050), as AWS documents an instance profile's own policy for them
# without AmazonSSMManagedInstanceCore, whose ssm:GetParameter and ssm:GetParameters on "*" would read every parameter in
# the account, EC2's secrets and the Author's among them (group 5's review, I1). None of these actions takes a narrower
# resource in AWS's documented policy, and none reads a parameter, a secret, or an object.
SESSION_MANAGER = (
    "ssm:UpdateInstanceInformation",
    "ssmmessages:CreateControlChannel",
    "ssmmessages:CreateDataChannel",
    "ssmmessages:OpenControlChannel",
    "ssmmessages:OpenDataChannel",
    "ec2messages:AcknowledgeMessage",
    "ec2messages:DeleteMessage",
    "ec2messages:FailMessage",
    "ec2messages:GetEndpoint",
    "ec2messages:GetMessages",
    "ec2messages:SendReply",
)
ROLE_GRANTS.update({action: '["*"]' for action in SESSION_MANAGER})


# Every resource that gives a role a policy (group 5's fixes' review, 1).
ATTACHING = (
    "aws_iam_role_policy",
    "aws_iam_role_policy_attachment",
    "aws_iam_policy_attachment",
    "aws_iam_role_policies_exclusive",
    "aws_iam_role_policy_attachments_exclusive",
)


def check_role(root: dict[str, list]) -> list[str]:
    found = []
    roles = [
        r
        for r in resource(root, "aws_iam_role")
        if lit(r, "name") == "h4-prod-tunnel-end"
    ]
    if len(roles) != 1:
        return ["role: h4-prod-tunnel-end is missing"]
    role = roles[0]
    me = f"aws_iam_role.{role.labels[1]}"
    trust = statements(document(root, raw(role, "assume_role_policy")))
    if [(s["actions"], s["principals"]) for s in trust] != [
        ({"sts:AssumeRole"}, [("Service", '["ec2.amazonaws.com"]')])
    ]:
        found.append("role: it trusts something other than EC2 itself")
    profile = one(root, "aws_iam_instance_profile", "tunnel_end")
    if profile is None or raw(profile, "role") != f"{me}.name":
        found.append("role: the instance profile isn't the role's")
    # Fail closed (group 5's fixes' review, 1): every policy or attachment names its role by a reference to a role
    # this root makes, never by a literal name; every policy on this role is a data.aws_iam_policy_document this root
    # reads; no statement grants by exclusion; and the role holds no inline_policy block.
    for b in blocks(root, "resource"):
        if b.labels[0] not in ATTACHING:
            continue
        named = " ".join(raw(b, k) for k in ("role", "roles", "role_name")).strip()
        if not re.fullmatch(
            r"\[?\s*aws_iam_role\.[A-Za-z0-9_]+\.(id|name)\s*,?\s*\]?", named
        ):
            found.append(f"role: {address(b)} names its role other than by a reference")
    if role.blocks("inline_policy"):
        found.append("role: it holds an inline_policy block")
    # A module could attach a policy where this check can't see it (the second review, I-A).
    for m in blocks(root, "module"):
        found.append(
            f"role: module {'.'.join(m.labels)} could give the role a policy the check doesn't read"
        )
    granted: dict[str, str] = {}
    conditions: dict[str, list] = {}
    for p in resource(root, "aws_iam_role_policy"):
        if raw(p, "role") not in (f"{me}.id", f"{me}.name"):
            continue
        doc = document(root, raw(p, "policy"))
        if doc is None:
            found.append(
                f"role: {address(p)}'s policy isn't a data.aws_iam_policy_document this root reads"
            )
            continue
        # What the check can't read is a finding, never empty (the second review, I-A): a document built from other
        # documents, a dynamic statement, and an effect or an actions list that isn't a literal.
        for key in ("source_policy_documents", "override_policy_documents"):
            if doc.attr(key) is not None:
                found.append(
                    f"role: {address(doc)} takes {key}, which the check doesn't read"
                )
        if doc.blocks("dynamic"):
            found.append(
                f"role: {address(doc)} has a dynamic block, which the check doesn't read"
            )
        for st in doc.blocks("statement"):
            effect, actions = lit(st, "effect"), lit(st, "actions")
            if (st.attr("effect") is not None and effect not in ("Allow", "Deny")) or (
                st.attr("actions") is not None
                and not (
                    isinstance(actions, list)
                    and all(isinstance(a, str) for a in actions)
                )
            ):
                found.append(
                    f"role: {address(doc)} has a statement whose effect or actions aren't literals"
                )
            if any(
                st.attr(k) is not None
                for k in ("not_actions", "not_resources", "not_principals")
            ):
                found.append(
                    f"role: {address(doc)} grants by not_actions, not_resources, or not_principals"
                )
        for s in statements(doc):
            if s["effect"] != "Allow":
                continue
            for a in s["actions"]:
                if a in granted:
                    found.append(f"role: {a} is granted twice")
                granted[a] = s["resources"]
                conditions[a] = s["conditions"]
    if set(granted) != set(ROLE_GRANTS):
        found.append(
            f"role: its actions aren't R-15's: {sorted(set(granted) ^ set(ROLE_GRANTS))}"
        )
    for action, resources in ROLE_GRANTS.items():
        if action in granted and granted[action] != resources:
            found.append(f"role: {action} reaches {granted[action]}")
    if "kms:Decrypt" in granted and (
        "StringEquals",
        "kms:ViaService",
        '["ssm.us-east-1.amazonaws.com"]',
    ) not in conditions.get("kms:Decrypt", []):
        found.append("role: kms:Decrypt isn't only through Parameter Store")
    if "kms:Decrypt" in granted and (
        "StringLike",
        "kms:EncryptionContext:PARAMETER_ARN",
        granted.get("ssm:GetParameter", PARAMETERS),
    ) not in conditions.get("kms:Decrypt", []):
        found.append("role: kms:Decrypt isn't held to its own parameters")
    for action in ("s3:GetObject", "s3:ListBucket"):
        if action in granted and not any(
            v == "aws:ResourceAccount" for _, v, _ in conditions.get(action, [])
        ):
            found.append(f"role: {action} isn't held to this account's buckets")
    # Any managed policy on the role, by any of the three resources that attach one.
    managed = [
        address(a)
        for a in resource(root, "aws_iam_role_policy_attachment")
        + resource(root, "aws_iam_policy_attachment")
        + resource(root, "aws_iam_role_policy_attachments_exclusive")
        if me in raw(a, "role") or me in raw(a, "roles") or me in raw(a, "role_name")
    ]
    if managed or lit(role, "managed_policy_arns"):
        found.append(
            "role: a managed policy is attached, whose grants this root doesn't read (I1)"
        )
    wide = sorted(
        a
        for a, r in granted.items()
        if re.sub(r"[\s,]", "", r) == '["*"]'
        and re.match(r"(ssm|kms|s3|secretsmanager):", a)
        and a != "ssm:UpdateInstanceInformation"
    )
    if wide:
        found.append(f"role: {', '.join(wide)} on every resource")
    # The budget actions' execution roles are killswitch.tf's, beside their actions (tasks.md T180).
    for b in blocks(root, "resource"):
        if b.labels[0].startswith("aws_iam_") and where(root, b) not in (
            "iam.tf",
            "killswitch.tf",
        ):
            found.append(f"role: {address(b)} lives outside iam.tf and killswitch.tf")
    return found


def check_warning_rule(root: dict[str, list]) -> list[str]:
    found = []
    rules = [
        r
        for r in resource(root, "aws_cloudwatch_event_rule")
        if lit(r, "name") == "h4-tunnel-end-spot-warning"
    ]
    if len(rules) != 1:
        return ["warning: h4-tunnel-end-spot-warning is missing"]
    rule = rules[0]
    if where(root, rule) != "handover.tf":
        found.append("warning: the rule lives outside prod's handover.tf")
    pattern = raw(rule, "event_pattern")
    if not (
        '"aws.ec2"' in pattern
        and '"EC2 Spot Instance Interruption Warning"' in pattern
        and "data.aws_instance.tunnel_end.id" in pattern
    ):
        found.append(
            "warning: the rule doesn't match the tunnel end's own interruption warning, from this root"
        )
    if raw(rule, "count") or raw(rule, "for_each"):
        found.append(
            "warning: the rule waits behind a switch, though it needs no other root"
        )
    targets = [
        t
        for t in resource(root, "aws_cloudwatch_event_target")
        if raw(t, "rule") == f"aws_cloudwatch_event_rule.{rule.labels[1]}.name"
    ]
    if len(targets) != 1 or raw(targets[0], "arn") != f'"{TOPIC_ARN}"':
        found.append("warning: its one target isn't h4-alerts, by its name-built ARN")
    else:
        transformer = targets[0].block("input_transformer")
        template = raw(transformer, "input_template") if transformer else ""
        if "[hareet.ai aws] tunnel_end_interruption:" not in template:
            found.append(
                "warning: it doesn't publish tunnel_end_interruption in §2's format"
            )
        if transformer is not None and re.search(
            r"account|\$\.detail\.instance-id", raw(transformer, "input_paths")
        ):
            found.append(
                "warning: its message carries the account or the instance's ID"
            )
    return found


def check_return_rule(root: dict[str, list]) -> list[str]:
    """h4-tunnel-end-running: the tunnel end's return, to h4-alerts as tunnel_end_back, from W1 (FR-076)."""
    found = []
    rules = [
        r
        for r in resource(root, "aws_cloudwatch_event_rule")
        if lit(r, "name") == "h4-tunnel-end-running"
    ]
    if len(rules) != 1:
        return ["return: h4-tunnel-end-running is missing"]
    rule = rules[0]
    if where(root, rule) != "handover.tf":
        found.append("return: the rule lives outside prod's handover.tf")
    pattern = raw(rule, "event_pattern")
    if not (
        '"aws.ec2"' in pattern
        and '"EC2 Instance State-change Notification"' in pattern
        and re.search(r'state\s*=\s*\["running"\]', pattern)
        and "data.aws_instance.tunnel_end.id" in pattern
    ):
        found.append(
            "return: the rule doesn't match the tunnel end entering running, from this root"
        )
    if raw(rule, "count") or raw(rule, "for_each"):
        found.append(
            "return: the rule waits behind a switch, though its alert needs no other root"
        )
    targets = [
        t
        for t in resource(root, "aws_cloudwatch_event_target")
        if raw(t, "rule") == f"aws_cloudwatch_event_rule.{rule.labels[1]}.name"
        and raw(t, "arn") == f'"{TOPIC_ARN}"'
    ]
    if len(targets) != 1 or raw(targets[0], "count"):
        found.append(
            "return: no one target to h4-alerts, by its name-built ARN, outside the switch"
        )
    else:
        transformer = targets[0].block("input_transformer")
        template = raw(transformer, "input_template") if transformer else ""
        if "[hareet.ai aws] tunnel_end_back:" not in template:
            found.append("return: it doesn't publish tunnel_end_back in §2's format")
        if transformer is not None and re.search(
            r"account|\$\.detail\.instance-id|\$\.resources",
            raw(transformer, "input_paths"),
        ):
            found.append("return: its message carries the account or the instance's ID")
    return found


def wired(root: dict[str, list]) -> object:
    attr = locals_in(root, "handover.tf").get("wired")
    return None if attr is None else ip.literal(attr)


def check_switch(root: dict[str, list]) -> list[str]:
    # A literal either way: W1 held it false and W2's P-W2 sets it true (test_w2_holds_both_switches_on, below).
    if not isinstance(wired(root), bool):
        return [
            "switch: prod's handover.tf doesn't hold local.wired as a boolean literal"
        ]
    return []


def check_reads(root: dict[str, list]) -> list[str]:
    """Prod reads nothing another root makes: no remote state, and data sources of AWS's own facts only."""
    found = []
    for d in blocks(root, "data"):
        if d.labels[0] == "terraform_remote_state":
            found.append(f"reads: {address(d)} reads another root's state")
        elif d.labels[0] not in PROD_DATA:
            found.append(f"reads: {address(d)} reads what another root may make")
        elif d.labels[0] == "aws_security_group" and lit(d, "name") != (
            VPC_ORIGINS_GROUP
        ):
            found.append(
                f"reads: {address(d)} reads a security group other than CloudFront's VPC origins'"
            )
    return found


def check_files(root: dict[str, list]) -> list[str]:
    found = []
    for name, body in root.items():
        src = ip.Source(f"infra/prod/{name}", "", ip.Body(body))
        for f in ip.t5_where(src, set()):
            found.append(f"files: {f.message}")
    return found


def check_tags(root: dict[str, list]) -> list[str]:
    found = []
    for b in blocks(root, "resource"):
        if len(b.labels) != 2 or b.labels[0] not in ip.TAGGABLE:
            continue
        tags = lit(b, "tags")
        if not (isinstance(tags, dict) and tags.get("component")):
            found.append(f"tags: {address(b)} sets no component")
    return found


# The dependency graph, offline (fix F1's rework, R-1). Terraform orders a root's blocks by the references in their
# expressions and by depends_on, and refuses a cycle at validate and at plan ("Error: Cycle"); agents' containers have no
# Terraform, so this walk stands in for that part of validate. A node is a resource (type.name), a data source
# (data.type.name), a local (local.name), or a variable (var.name). A block's edges are every address it names in any
# attribute of its own or of a nested block (lifecycle's replace_triggered_by and conditions, dynamic blocks,
# depends_on), read from the tokens: a quoted string adds only what its ${ … } names, and a comment nothing.
PRIVATE_GROUP = "aws_security_group.tunnel_end_private"


def _interpolations(text: str) -> list[str]:
    """The expressions inside a template's ${ … } and %{ … }, never inside an escaped $${ or %%{."""
    out, j = [], 0
    while j < len(text) - 1:
        if text[j : j + 3] in ("$${", "%%{"):
            j += 3
        elif text[j] in "$%" and text[j + 1] == "{":
            end, _ = ip._template(text, j + 2, 0)
            out.append(text[j + 2 : end - 1])
            j = end
        else:
            j += 1
    return out


def _names(text: str, nodes: set[str]) -> set[str]:
    """The addresses an expression's text names, of those in nodes."""
    out: set[str] = set()
    toks = ip.tokenize(text)
    for i, t in enumerate(toks):
        if t.kind in ("STRING", "HEREDOC"):
            if t.value is ip.UNKNOWN:
                for inner in _interpolations(t.text):
                    out |= _names(inner, nodes)
            continue
        if t.kind != "IDENT" or (
            i and toks[i - 1].kind == "PUNCT" and toks[i - 1].text == "."
        ):
            continue
        parts = [t.text]
        k = i + 1
        while (
            len(parts) < 3
            and k + 1 < len(toks)
            and toks[k].kind == "PUNCT"
            and toks[k].text == "."
            and toks[k + 1].kind == "IDENT"
        ):
            parts.append(toks[k + 1].text)
            k += 2
        for n in (3, 2):
            name = ".".join(parts[:n])
            if len(parts) >= n and name in nodes:
                out.add(name)
                break
    return out


def _texts(body) -> list[str]:
    out = []
    for item in body:
        if isinstance(item, ip.Attribute):
            out.append(item.raw)
        elif isinstance(item, ip.Block):
            out.extend(_texts(item.body))
    return out


def graph(root: dict[str, list]) -> dict[str, set[str]]:
    """Each node's edges: the nodes it names, which Terraform makes or reads before it."""
    texts: dict[str, list[str]] = {}
    for b in blocks(root):
        if b.type == "resource" and len(b.labels) == 2:
            texts[".".join(b.labels)] = _texts(b.body)
        elif b.type == "data" and len(b.labels) == 2:
            texts["data." + ".".join(b.labels)] = _texts(b.body)
        elif b.type == "variable" and len(b.labels) == 1:
            texts["var." + b.labels[0]] = _texts(b.body)
        elif b.type == "locals":
            for a in b.body:
                if isinstance(a, ip.Attribute):
                    texts["local." + a.name] = [a.raw]
    nodes = set(texts)
    return {
        node: set().union(*(_names(t, nodes) for t in ts)) if ts else set()
        for node, ts in texts.items()
    }


def path_back(edges: dict[str, set[str]], start: str) -> list[str] | None:
    """The shortest path of edges from start back to start, or None."""
    seen, queue = {start}, [[start]]
    while queue:
        path = queue.pop(0)
        for nxt in sorted(edges.get(path[-1], ())):
            if nxt == start:
                return path + [start]
            if nxt not in seen:
                seen.add(nxt)
                queue.append(path + [nxt])
    return None


def check_cycles(root: dict[str, list]) -> list[str]:
    """Every cycle in the graph, once each, named from the private group when it is on it."""
    edges = graph(root)
    found, covered = [], set()
    for start in [PRIVATE_GROUP] + sorted(edges):
        if start in covered or start not in edges:
            continue
        path = path_back(edges, start)
        if path is not None:
            covered |= set(path)
            found.append(f"cycles: {start} leads back to itself: {' -> '.join(path)}")
    return found


CHECKS = (
    check_versions,
    check_network,
    check_instance,
    check_type,
    check_host_replace,
    check_groups,
    check_role,
    check_warning_rule,
    check_return_rule,
    check_switch,
    check_reads,
    check_files,
    check_tags,
    check_cycles,
)


def problems(root: dict[str, list]) -> list[str]:
    return [p for check in CHECKS for p in check(root)]


# The account's side of "neither reads the other" (plan.md §16).
def account_problems(root: dict[str, list]) -> list[str]:
    found = []
    if not isinstance(wired(root), bool):
        found.append(
            "switch: the account's handover.tf doesn't hold local.wired as a boolean literal"
        )
    for d in blocks(root, "data"):
        if d.labels[0] == "terraform_remote_state":
            found.append(
                f"reads: the account's {address(d)} reads another root's state"
            )
        if d.labels[0] in ("aws_instance", "aws_instances", "aws_route53_health_check"):
            found.append(
                f"reads: the account's {address(d)} reads prod's instance or health check"
            )
    for name, body in root.items():
        for b in body:
            if not isinstance(b, ip.Block):
                continue
            text = "\n".join(re.sub(r"\s+", " ", a.raw) for a in _attributes(b))
            for ref in re.findall(
                r"(?<![\w.])(aws_instance\.[A-Za-z0-9_]+|aws_route53_health_check\.[A-Za-z0-9_]+)",
                text,
            ):
                if ref != ACCOUNT_OWN_INSTANCE:
                    found.append(f"names: {name}'s {address(b)} names {ref}")
            if (
                b.type == "resource"
                and b.labels[0]
                in (
                    "aws_instance",
                    "aws_route53_health_check",
                )
                and f"{b.labels[0]}.{b.labels[1]}" != ACCOUNT_OWN_INSTANCE
            ):
                found.append(f"names: the account makes {address(b)}")
    return found


def _attributes(block) -> list:
    out = []
    for item in block.body:
        if isinstance(item, ip.Attribute):
            out.append(item)
        elif isinstance(item, ip.Block):
            out.extend(_attributes(item))
    return out


# ----------------------------------------------------------------------------------------------------------------------
# What a rule's h4-alerts target delivers (group 5's review, I6): EventBridge fills a string input_template's
# placeholders and publishes the template's JSON text, its quotes and its \n escapes and all, as the SNS message. The
# bridge, as P-I3 leaves it, must read that as the notice it encodes.


def delivered(target, values: dict[str, str]) -> str:
    """The SNS message EventBridge publishes for target's input transformer, with values for its input paths."""
    transformer = target.block("input_transformer")
    template = lit(transformer, "input_template")
    assert isinstance(template, str), "the template isn't a string literal"
    for name, value in values.items():
        template = template.replace(f"<{name}>", value)
    return template


def bridge(tmp_path: Path):
    """The alert bridge as the patches leave it, loaded from a copy in the test's own folder."""
    text = patches.patched_text("infra/lambdas/alert_bridge/bridge.py")
    assert text is not None
    path = tmp_path / "bridge_as_patched.py"
    path.write_text(text, encoding="utf-8")
    return _load("alert_bridge_as_patched", path)


def rule_target(root: dict[str, list], name: str):
    rules = [
        r for r in resource(root, "aws_cloudwatch_event_rule") if lit(r, "name") == name
    ]
    assert len(rules) == 1, name
    # The rule's h4-alerts target: group 9 gives h4-tunnel-end-running a second, the start function (test_handover.py).
    (target,) = [
        t
        for t in resource(root, "aws_cloudwatch_event_target")
        if raw(t, "rule") == f"aws_cloudwatch_event_rule.{rules[0].labels[1]}.name"
        and raw(t, "arn") == f'"{TOPIC_ARN}"'
    ]
    return target


def test_the_warnings_message_reaches_the_bridge_as_tunnel_end_interruption(
    tmp_path: Path,
) -> None:
    message = delivered(
        rule_target(parsed(root_texts()), "h4-tunnel-end-spot-warning"),
        {"action": "stop", "at": "2026-11-13T05:00:00Z"},
    )
    # EventBridge's own shape: a JSON string, quoted, its line breaks escaped.
    assert (
        message.startswith('"[hareet.ai aws] tunnel_end_interruption: ')
        and "\\n- action: stop" in message
    )
    alert = bridge(tmp_path).classify(message)
    assert (alert.kind, alert.facts) == (
        "tunnel_end_interruption",
        [("action", "stop"), ("at", "2026-11-13T05:00:00Z")],
    ), alert


def test_the_returns_message_reaches_the_bridge_as_tunnel_end_back(
    tmp_path: Path,
) -> None:
    message = delivered(
        rule_target(parsed(root_texts()), "h4-tunnel-end-running"),
        {"at": "2026-11-13T05:09:00Z"},
    )
    alert = bridge(tmp_path).classify(message)
    assert (alert.kind, alert.facts) == (
        "tunnel_end_back",
        [("at", "2026-11-13T05:09:00Z")],
    ), alert


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
    if block.type == "locals":
        first = next((a.name for a in block.body if isinstance(a, ip.Attribute)), "")
        return ("locals", first)
    return (block.type, *block.labels)


def mutated(root: dict[str, list], path: Path) -> tuple[dict[str, list], list[str]]:
    body, drops, into, expect = fixture(path)
    out = {name: list(b) for name, b in root.items()}
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


def test_the_root_holds_its_files_with_the_protected_three_from_p_i3_until_applied() -> (
    None
):
    texts = root_texts()
    assert sorted(texts) == sorted(FILES), sorted(set(FILES) - set(texts))
    for name in FILES:
        if name not in PROTECTED_FILES:
            assert (PROD / name).is_file(), name


def test_every_file_reads_as_hcl() -> None:
    for text in root_texts().values():
        ip.parse_hcl(text)


def test_the_pins_the_state_and_the_tags() -> None:
    assert check_versions(parsed(root_texts())) == []


def test_one_vpc_a_public_subnet_routed_out_and_a_private_one_not() -> None:
    assert check_network(parsed(root_texts())) == []


def test_the_tunnel_end_two_interfaces_its_address_imdsv2_and_spot_that_stops() -> None:
    assert check_instance(parsed(root_texts())) == []


def test_the_types_are_the_unprotected_list_each_template_reads_its_own() -> None:
    assert check_type(parsed(root_texts())) == []


def test_a_changed_host_file_or_generation_replaces_the_tunnel_end() -> None:
    assert check_host_replace(parsed(root_texts())) == []


def test_only_2222_from_anywhere_8087_from_route_53_and_8080_from_cloudfront() -> None:
    assert check_groups(parsed(root_texts())) == []


def test_the_role_holds_r_15s_grants_by_name_built_arns() -> None:
    assert check_role(parsed(root_texts())) == []


def test_the_warning_rule_is_prods_naming_its_own_instance_to_h4_alerts() -> None:
    assert check_warning_rule(parsed(root_texts())) == []


def test_the_return_rule_is_prods_naming_its_own_instance_to_h4_alerts() -> None:
    assert check_return_rule(parsed(root_texts())) == []


def test_both_roots_hold_the_switch_as_a_literal() -> None:
    assert check_switch(parsed(root_texts())) == []
    assert isinstance(wired(parsed(account_texts())), bool)


# W2 (plan.md §16, "Why a switch"; group 5's review, I8; tasks.md T175): W2's blocks are made after W1's applies, so
# P-W2 sets both switches on. W1 held this test as `test_w1_holds_both_switches_off`, `is False`; W2 flips it, test-
# first, and the tree reads P-W2 as the patch leaves it until the Author applies it (patches.py).
def test_w2_holds_both_switches_on() -> None:
    assert wired(parsed(root_texts())) is True
    assert wired(parsed(account_texts())) is True


def switched(root: dict[str, list], value: bool) -> dict[str, list]:
    """The root with handover.tf's local.wired set to value, and nothing else changed."""
    out = {
        name: [
            b
            for b in body
            if not (isinstance(b, ip.Block) and block_address(b) == ("locals", "wired"))
        ]
        for name, body in root.items()
    }
    out.setdefault("handover.tf", []).extend(
        ip.parse_hcl(f"locals {{\n  wired = {'true' if value else 'false'}\n}}\n")
    )
    return out


def switched_on(root: dict[str, list]) -> dict[str, list]:
    """The root as P-W2 leaves it (tasks.md T175): handover.tf's local.wired = true, and nothing else changed."""
    return switched(root, True)


def switched_off(root: dict[str, list]) -> dict[str, list]:
    """The root as W1 applied it: handover.tf's local.wired = false, and nothing else changed. With P-W2 in the tree,
    the "off" half of each "off and on" test reads it from here (W2's departure 2)."""
    return switched(root, False)


def test_the_checks_pass_with_both_switches_on_as_p_w2_sets_them() -> None:
    # Group 5's review, I8: T175's P-W2 sets both switches true, and T046's checks must pass on its patched copy.
    assert problems(switched_on(parsed(root_texts()))) == []
    assert account_problems(switched_on(parsed(account_texts()))) == []


def test_the_checks_pass_with_both_switches_off_as_w1_applied_them() -> None:
    # W2: the tree holds them on, so the "off" half reads them off by hand.
    assert problems(switched_off(parsed(root_texts()))) == []
    assert account_problems(switched_off(parsed(account_texts()))) == []


def test_neither_root_reads_the_other() -> None:
    assert check_reads(parsed(root_texts())) == []
    assert account_problems(parsed(account_texts())) == []


def test_the_protected_kinds_live_only_in_the_protected_files_and_everything_is_tagged() -> (
    None
):
    root = parsed(root_texts())
    assert check_files(root) == []
    assert check_tags(root) == []


def test_the_root_has_no_problem() -> None:
    assert problems(parsed(root_texts())) == []


# Fix F1's rework (R-1): the VPC origins' group's read waited on the VPC origin, which targets the tunnel end, whose
# primary interface holds the private group, whose 8080 names the read: Terraform refuses the root ("Error: Cycle").
def test_no_reference_path_leads_from_the_private_group_back_to_itself() -> None:
    root = parsed(root_texts())
    path = path_back(graph(root), PRIVATE_GROUP)
    assert path is None, " -> ".join(path)
    assert check_cycles(root) == []


def test_the_read_of_the_vpc_origins_group_waits_on_nothing_but_prods_vpc() -> None:
    edges = graph(parsed(root_texts()))
    read = "data.aws_security_group.cloudfront_vpc_origins"
    assert edges[read] == {"aws_vpc.prod"}
    assert "aws_cloudfront_vpc_origin.relay" not in edges[read]


def test_the_walk_reads_every_file_of_prods_root() -> None:
    assert {p.name for p in PROD.glob("*.tf")} <= set(FILES)


def test_the_walk_reads_each_other_edge_of_the_chain_the_review_named() -> None:
    # The four edges that stay, so the walk isn't blind to them: the private group's 8080 names the read; the private
    # interface holds the private group; the templates' primary interface is the private one; and, from spec 032, the
    # VPC origin targets the tunnel end this root reads by its tag.
    edges = graph(parsed(root_texts()))
    read = "data.aws_security_group.cloudfront_vpc_origins"
    assert read in edges[PRIVATE_GROUP]
    assert PRIVATE_GROUP in edges["aws_network_interface.tunnel_end_private"]
    assert (
        "aws_network_interface.tunnel_end_private"
        in edges["aws_launch_template.tunnel_end"]
    )
    assert "data.aws_instance.tunnel_end" in edges["aws_cloudfront_vpc_origin.relay"]


def test_the_walk_reads_references_and_depends_on_never_a_strings_words_or_a_comment() -> (
    None
):
    root = {
        "a.tf": list(
            ip.parse_hcl(
                'resource "aws_vpc" "a" {\n'
                "  # aws_vpc.b, in a comment\n"
                '  cidr_block = "aws_vpc.b is a string"\n'
                '  tags = { name = "$${aws_vpc.c.id}", other = "x-${local.d}" }\n'
                "  lifecycle {\n"
                "    replace_triggered_by = [terraform_data.e]\n"
                "  }\n"
                "  depends_on = [data.aws_ami.f]\n"
                "}\n"
                'resource "aws_vpc" "b" {\n  cidr_block = aws_vpc.a.cidr_block\n}\n'
                'resource "aws_vpc" "c" {\n  cidr_block = "10.0.0.0/16"\n}\n'
                'resource "terraform_data" "e" {\n  input = aws_vpc.a.id\n}\n'
                'data "aws_ami" "f" {\n  owners = [var.g]\n}\n'
                'variable "g" {\n  type = string\n}\n'
                "locals {\n  d = aws_vpc.c.id\n}\n"
            )
        )
    }
    edges = graph(root)
    assert edges["aws_vpc.a"] == {"local.d", "terraform_data.e", "data.aws_ami.f"}
    assert edges["data.aws_ami.f"] == {"var.g"}
    assert check_cycles(root) == [
        "cycles: aws_vpc.a leads back to itself: aws_vpc.a -> terraform_data.e -> aws_vpc.a"
    ]


def test_the_policy_reads_the_root_as_these_tests_do() -> None:
    srcs = []
    for name, text in root_texts().items():
        src = ip.Source(f"infra/prod/{name}", text, ip.parse_hcl(text))
        srcs.append(src)
        found = (
            ip.t8_text(src)
            + ip.t3_providers(src, ip.read_pins(PINS), root=True)
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
    assert [str(f) for f in ip.t6_buckets(srcs)] == []


def test_the_account_names_no_prod_instance_even_with_a_fixture_that_does() -> None:
    root = parsed(account_texts())
    assert account_problems(root) == []
    bad = list(
        ip.parse_hcl(
            'resource "aws_cloudwatch_event_rule" "x" {\n'
            "  event_pattern = jsonencode({ detail = { instance-id = [aws_instance.tunnel_end.id] } })\n"
            "}\n"
            'data "terraform_remote_state" "prod" {\n  backend = "s3"\n}\n'
        )
    )
    changed = {**root, "handover.tf": root.get("handover.tf", []) + bad}
    found = account_problems(changed)
    assert any("names aws_instance.tunnel_end" in f for f in found), found
    assert any("reads another root's state" in f for f in found), found


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
            if check(changed):
                caught.add(check.__name__)
    assert caught == {c.__name__ for c in CHECKS}
