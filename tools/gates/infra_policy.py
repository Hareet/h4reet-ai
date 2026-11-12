#!/usr/bin/env python3
"""The infrastructure policy (spec 001 contracts/infra-records.md §3; plan §2; research.md R-14; FR-002, FR-004,
FR-009 to FR-012, FR-069, FR-076). Human-only, from the guard patch P-1.

    python3 -I -B -X pycache_prefix=/dev/null tools/gates/infra_policy.py [--root DIR]
    python3 -I -B -X pycache_prefix=/dev/null tools/gates/infra_policy.py --plan-json FILE [--root-name NAME]

The first form reads every .tf and .tf.json file under DIR/infra (the repository by default), but infra/test/ and any
.terraform/ folder, as data: it never runs Terraform, and it reads HCL with its own standard-library reader, which
refuses (T0) what it can't read rather than guess. make infra-check runs it, and the Author's make plan runs it on the
root's HCL before terraform init, since init and plan run agent-written configuration with his administrator session.
The second form reads `terraform show -json <saved plan>` and repeats the rules a plan's values can show, which also
covers what a module computes; --root-name prod turns on T11 there.

Each finding prints as "<rule> <path>:<line> <what>", never a value it found. The rules:

    T0   every file reads as HCL (or JSON, for .tf.json)
    T1   every root's provider "aws" sets default_tags with project and environment
    T2   every resource of a taggable type sets tags with component (infra/policy/taggable.txt replaces the list)
    T3   every resource, data, and ephemeral type is hashicorp/aws's (aws_…; terraform_data, built in, aside);
         required_version and every required_providers entry pin one exact version, the ones
         .devcontainer/toolchain.vars names (TERRAFORM_VERSION, TERRAFORM_AWS_PROVIDER_VERSION); only hashicorp/aws
    T4   nothing that runs code: no provisioner, no data source external, http, or aws_lambda_invocation, no
         null_resource, a module only from a local path inside infra/, and no .terraform/ folder in the tree;
         data and ephemeral blocks are read inside check blocks too, for T4 and T9
    T5   these appear only in the protected files (iam*, budgets*, alerts*, killswitch*, handover*, failover*,
         ec2-market*, edge-limits*, by file name in any case, .tf or .tf.json): IAM and Identity Center, budgets and
         budget actions, cost anomaly, SNS, CloudWatch alarms, EventBridge rules, targets, schedules, and API
         destinations, and Lambda permissions; and in exactly one kind: CloudFront's cache, origin-request, and
         response-headers policies (edge-limits*), the Route 53 health check (failover*), h4-ec2-start and h4-ec2-guard
         and their permissions and the parameter /h4reet/prod/ec2-autostart (handover*), and anything with
         instance_market_options, or a spot request or fleet (ec2-market*)
    T6   every S3 bucket has a public access block with all four settings on, and no bucket policy or policy
         document grants a wildcard principal without an aws:SourceArn condition
    T7   no ingress from outside the account's ranges, but 2222 from anywhere on the tunnel end's group, 8087 from
         Route 53's health-checker ranges (data aws_ip_ranges), and 8080 from CloudFront's origin-facing prefix list
    T8   no literal 12-digit run, email address, or key-shaped string in any file
    T9   Terraform never creates or reads a secret: no SecureString parameter, no Secrets Manager secret version,
         and no data or ephemeral source that reads a parameter or a secret
    T10  each root has .terraform.lock.hcl, holding hashicorp/aws alone, at the pinned version
    T11  under infra/prod, every instance and launch template is spot, persistent, stopping on interruption
    T12  RDS: not public, encrypted, deletion-protected, its master password managed by RDS, and no password argument
    T13  IMDSv2 required, with hop limit 1, on every instance and launch template

Exit codes: 0 clean (or SKIP when there is no infra/ yet); 1 findings; 2 it couldn't run.
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import posixpath
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ROOTS = ("bootstrap", "account", "prod")
PROTECTED = (
    "iam",
    "budgets",
    "alerts",
    "killswitch",
    "handover",
    "failover",
    "ec2-market",
    "edge-limits",
)
AWS_SOURCES = {"hashicorp/aws", "registry.terraform.io/hashicorp/aws"}
LOCK_AWS = "registry.terraform.io/hashicorp/aws"
EXACT = re.compile(r"=?\s*(\d+\.\d+\.\d+)")

# T2: types that take tags, unless infra/policy/taggable.txt replaces the list.
TAGGABLE = frozenset(
    [
        "aws_acm_certificate",
        "aws_budgets_budget",
        "aws_ce_anomaly_monitor",
        "aws_ce_anomaly_subscription",
        "aws_cloudfront_distribution",
        "aws_cloudfront_vpc_origin",
        "aws_cloudwatch_event_rule",
        "aws_cloudwatch_log_group",
        "aws_cloudwatch_metric_alarm",
        "aws_db_instance",
        "aws_db_parameter_group",
        "aws_db_subnet_group",
        "aws_ebs_volume",
        "aws_ecr_repository",
        "aws_eip",
        "aws_iam_policy",
        "aws_iam_role",
        "aws_instance",
        "aws_internet_gateway",
        "aws_kms_key",
        "aws_lambda_function",
        "aws_launch_template",
        "aws_nat_gateway",
        "aws_network_interface",
        "aws_rds_cluster",
        "aws_route53_health_check",
        "aws_route53_zone",
        "aws_route_table",
        "aws_s3_bucket",
        "aws_secretsmanager_secret",
        "aws_security_group",
        "aws_sns_topic",
        "aws_spot_instance_request",
        "aws_ssm_parameter",
        "aws_subnet",
        "aws_vpc",
        "aws_vpc_endpoint",
    ]
)
# T5
PROTECTED_PREFIXES = (
    "aws_iam_",
    "aws_budgets_",
    "aws_ce_",
    "aws_sns_",
    "aws_ssoadmin_",
    "aws_identitystore_",
)
PROTECTED_TYPES = frozenset(
    [
        "aws_cloudwatch_metric_alarm",
        "aws_cloudwatch_composite_alarm",
        "aws_cloudwatch_event_rule",
        "aws_cloudwatch_event_target",
        "aws_cloudwatch_event_bus",
        "aws_cloudwatch_event_api_destination",
        "aws_cloudwatch_event_connection",
        "aws_scheduler_schedule",
        "aws_scheduler_schedule_group",
        "aws_lambda_permission",
    ]
)
EDGE_LIMITS = frozenset(
    {
        "aws_cloudfront_cache_policy",
        "aws_cloudfront_origin_request_policy",
        "aws_cloudfront_response_headers_policy",
    }
)
HANDOVER_FUNCTIONS = frozenset({"h4-ec2-start", "h4-ec2-guard"})
AUTOSTART = "/h4reet/prod/ec2-autostart"
SPOT_TYPES = frozenset(
    {"aws_spot_instance_request", "aws_spot_fleet_request", "aws_ec2_fleet"}
)
INSTANCES = frozenset({"aws_instance", "aws_launch_template"})
# T4, T9
CODE_DATA = frozenset({"external", "http", "aws_lambda_invocation"})
SECRET_SOURCES = frozenset(
    {
        "aws_ssm_parameter",
        "aws_ssm_parameters_by_path",
        "aws_secretsmanager_secret_version",
        "aws_secretsmanager_random_password",
    }
)
RDS = frozenset({"aws_db_instance", "aws_rds_cluster"})
PASSWORDS = ("password", "master_password", "password_wo", "master_password_wo")
PRIVATE_NETS = tuple(
    ipaddress.ip_network(n)
    for n in (
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "100.64.0.0/10",
        "fc00::/7",
    )
)
# T8: what the text may never hold. The finding names the kind, never the match.
LITERALS = (
    (
        "a 12-digit run, an account ID's shape",
        re.compile(r"(?<![0-9])[0-9]{12}(?![0-9])"),
    ),
    (
        "an email address",
        re.compile(
            r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}"
        ),
    ),
    ("an AWS access key ID", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("a private key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("an operator token", re.compile(r"h4op_[A-Za-z0-9_-]{8,}")),
    ("an Anthropic key", re.compile(r"sk-ant-[A-Za-z0-9_-]{8,}")),
    ("a Telegram bot token", re.compile(r"\b[0-9]{8,10}:[A-Za-z0-9_-]{35}\b")),
)
WILDCARD_PRINCIPAL = re.compile(
    r"""["']?Principal["']?\s*[=:]\s*["']\*["']|["']?AWS["']?\s*[=:]\s*["']\*["']|identifiers\s*=\s*\[\s*["']\*["']\s*\]"""
)


# ----------------------------------------------------------------------------------------------------------------------
# The reader: HCL's native syntax, as structure. Blocks and attributes are read exactly; an expression keeps its source
# text, and its value when it is a literal (a string without a template, a number, a bool, null, or a list or object
# of those); anything else is UNKNOWN. What doesn't read is an HclError, never a guess.


class _Unknown:
    def __repr__(self) -> str:
        return "UNKNOWN"


UNKNOWN = _Unknown()


class HclError(ValueError):
    def __init__(self, message: str, line: int) -> None:
        super().__init__(f"line {line}: {message}")
        self.line = line


@dataclass
class Tok:
    kind: str  # NL, IDENT, NUMBER, STRING, HEREDOC, PUNCT
    text: str
    line: int
    start: int
    end: int
    value: object = None


@dataclass
class Attribute:
    name: str
    raw: str
    value: object
    line: int


@dataclass
class Block:
    type: str
    labels: list[str]
    body: Body
    line: int

    def attr(self, name: str) -> Attribute | None:
        return self.body.attr(name)

    def block(self, name: str) -> Block | None:
        return self.body.block(name)

    def blocks(self, name: str | None = None) -> list[Block]:
        return self.body.blocks(name)


class Body(list):
    def attr(self, name: str) -> Attribute | None:
        return next(
            (i for i in self if isinstance(i, Attribute) and i.name == name), None
        )

    def block(self, name: str) -> Block | None:
        return next(iter(self.blocks(name)), None)

    def blocks(self, name: str | None = None) -> list[Block]:
        return [
            i for i in self if isinstance(i, Block) and (name is None or i.type == name)
        ]


PUNCT2 = ("==", "!=", "<=", ">=", "&&", "||", "=>", "...")
PUNCT1 = "{}[]()=,:.?!+-*/%<>"
ESCAPES = {"n": "\n", "r": "\r", "t": "\t", '"': '"', "\\": "\\"}


def _string(src: str, i: int, line: int) -> tuple[int, int, bool, str | None]:
    """Scan a quoted string starting at src[i] == '"'. Returns (end, line, has_template, value)."""
    j, out, template = i + 1, [], False
    while True:
        if j >= len(src):
            raise HclError("an unterminated string", line)
        c = src[j]
        if c == '"':
            return j + 1, line, template, None if template else "".join(out)
        if c == "\n":
            raise HclError("a newline inside a quoted string", line)
        if c == "\\":
            nxt = src[j + 1 : j + 2]
            if nxt in ESCAPES:
                out.append(ESCAPES[nxt])
                j += 2
                continue
            if nxt in ("u", "U"):
                width = 4 if nxt == "u" else 8
                digits = src[j + 2 : j + 2 + width]
                if not re.fullmatch(rf"[0-9A-Fa-f]{{{width}}}", digits):
                    raise HclError("a bad unicode escape", line)
                out.append(chr(int(digits, 16)))
                j += 2 + width
                continue
            raise HclError("a bad escape in a string", line)
        if c in "$%" and src[j + 1 : j + 2] == "{":
            if src[j - 1 : j] == c and j - 1 > i:  # $${ and %%{ are literal
                out[-1:] = [c + "{"]
                j += 2
                continue
            template = True
            j, line = _template(src, j + 2, line)
            continue
        out.append(c)
        j += 1


def _template(src: str, j: int, line: int) -> tuple[int, int]:
    """Skip a ${ … } or %{ … } interpolation, whose expression may hold strings and braces. Returns the index after it."""
    depth = 1
    while depth:
        if j >= len(src):
            raise HclError("an unterminated template", line)
        c = src[j]
        if c == '"':
            j, line, _, _ = _string(src, j, line)
            continue
        if c == "\n":
            line += 1
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        j += 1
    return j, line


HEREDOC = re.compile(r"<<(-?)([A-Za-z_][A-Za-z0-9_-]*)[ \t]*\r?\n")


def tokenize(src: str) -> list[Tok]:
    toks: list[Tok] = []
    i, line = 0, 1
    while i < len(src):
        c = src[i]
        if c == "\n":
            toks.append(Tok("NL", "\n", line, i, i + 1))
            i += 1
            line += 1
        elif c in " \t\r":
            i += 1
        elif c == "#" or src.startswith("//", i):
            while i < len(src) and src[i] != "\n":
                i += 1
        elif src.startswith("/*", i):
            end = src.find("*/", i + 2)
            if end < 0:
                raise HclError("an unterminated comment", line)
            line += src.count("\n", i, end)
            i = end + 2
        elif c == '"':
            start, first = i, line
            i, line, template, value = _string(src, i, line)
            toks.append(
                Tok(
                    "STRING",
                    src[start:i],
                    first,
                    start,
                    i,
                    UNKNOWN if template else value,
                )
            )
        elif src.startswith("<<", i):
            m = HEREDOC.match(src, i)
            if not m:
                raise HclError("a heredoc without its marker", line)
            marker, start, first = m.group(2), i, line
            j, line = m.end(), line + 1
            lines = []
            while True:
                if j >= len(src):
                    raise HclError(f"a heredoc without its closing {marker}", first)
                nl = src.find("\n", j)
                text = src[j:] if nl < 0 else src[j:nl]
                if text.strip() == marker:
                    j = len(src) if nl < 0 else nl
                    break
                lines.append(text)
                j = len(src) if nl < 0 else nl + 1
                line += 1
            body = "\n".join(lines)
            if m.group(1):
                indent = min(
                    (len(x) - len(x.lstrip()) for x in lines if x.strip()), default=0
                )
                body = "\n".join(x[indent:] for x in lines)
            value = UNKNOWN if re.search(r"(?<![$%])[$%]\{", body) else body + "\n"
            toks.append(Tok("HEREDOC", src[start:j], first, start, j, value))
            i = j
        elif c.isdigit():
            m = re.compile(r"[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?").match(src, i)
            assert m
            text = m.group(0)
            value = float(text) if any(x in text for x in ".eE") else int(text)
            toks.append(Tok("NUMBER", text, line, i, m.end(), value))
            i = m.end()
        elif c.isalpha() or c == "_":
            m = re.compile(r"[A-Za-z_][A-Za-z0-9_-]*").match(src, i)
            assert m
            toks.append(Tok("IDENT", m.group(0), line, i, m.end()))
            i = m.end()
        else:
            two = next((p for p in PUNCT2 if src.startswith(p, i)), None)
            if two:
                toks.append(Tok("PUNCT", two, line, i, i + len(two)))
                i += len(two)
            elif c in PUNCT1:
                toks.append(Tok("PUNCT", c, line, i, i + 1))
                i += 1
            else:
                raise HclError(f"a character HCL doesn't use ({c!r})", line)
    return toks


OPEN, CLOSE = "([{", ")]}"


def _is(tok: Tok | None, text: str) -> bool:
    return tok is not None and tok.kind == "PUNCT" and tok.text == text


def _matching(toks: list[Tok], i: int) -> int:
    """The index of the bracket that closes toks[i]."""
    depth = 0
    for j in range(i, len(toks)):
        t = toks[j]
        if t.kind == "PUNCT" and t.text in OPEN:
            depth += 1
        elif t.kind == "PUNCT" and t.text in CLOSE:
            depth -= 1
            if depth == 0:
                return j
    raise HclError("an unclosed bracket", toks[i].line)


def _split(toks: list[Tok], newlines: bool) -> list[list[Tok]]:
    """Split the inside of a list or object at depth-0 commas (and newlines, for an object)."""
    parts, cur, depth = [], [], 0
    for t in toks:
        if t.kind == "PUNCT" and t.text in OPEN:
            depth += 1
        elif t.kind == "PUNCT" and t.text in CLOSE:
            depth -= 1
        if depth == 0 and (_is(t, ",") or (newlines and t.kind == "NL")):
            if cur:
                parts.append(cur)
            cur = []
            continue
        if t.kind != "NL" or depth:
            cur.append(t)
    if cur:
        parts.append(cur)
    # Each part keeps the newlines inside its brackets: an object in a list separates its entries by them.
    return parts


def evaluate(toks: list[Tok]) -> object:
    core = [t for t in toks if t.kind != "NL"]
    if not core:
        return UNKNOWN
    # Newlines inside an object separate its entries, so the brackets' cases keep them; the scalar cases don't.
    first = next(k for k, t in enumerate(toks) if t.kind != "NL")
    last = max(k for k, t in enumerate(toks) if t.kind != "NL")
    full = toks[first : last + 1]
    if len(core) == 1:
        t = core[0]
        if t.kind in ("STRING", "HEREDOC", "NUMBER"):
            return t.value
        if t.kind == "IDENT" and t.text in ("true", "false", "null"):
            return {"true": True, "false": False, "null": None}[t.text]
        return UNKNOWN
    if len(core) == 2 and _is(core[0], "-") and core[1].kind == "NUMBER":
        return -core[1].value  # type: ignore[operator]
    toks = full
    if _is(toks[0], "[") and _matching(toks, 0) == len(toks) - 1:
        inner = toks[1:-1]
        if any(
            t.kind == "IDENT" and t.text == "for"
            for t in [x for x in inner if x.kind != "NL"][:1]
        ):
            return UNKNOWN
        return [evaluate(p) for p in _split(inner, newlines=False)]
    if _is(toks[0], "{") and _matching(toks, 0) == len(toks) - 1:
        inner = toks[1:-1]
        if any(
            t.kind == "IDENT" and t.text == "for"
            for t in [x for x in inner if x.kind != "NL"][:1]
        ):
            return UNKNOWN
        out: dict[str, object] = {}
        for part in _split(inner, newlines=True):
            sep = next(
                (k for k, t in enumerate(part) if _is(t, "=") or _is(t, ":")), None
            )
            if sep != 1:
                return UNKNOWN
            key = part[0]
            if key.kind == "IDENT":
                name = key.text
            elif key.kind == "STRING" and isinstance(key.value, str):
                name = key.value
            else:
                return UNKNOWN
            out[name] = evaluate(part[2:])
        return out
    return UNKNOWN


def _expression(toks: list[Tok], i: int) -> int:
    """The index where the expression starting at toks[i] ends: a depth-0 newline, or the body's closing brace."""
    depth = 0
    while i < len(toks):
        t = toks[i]
        if t.kind == "PUNCT" and t.text in OPEN:
            depth += 1
        elif t.kind == "PUNCT" and t.text in CLOSE:
            if depth == 0:
                return i
            depth -= 1
        elif t.kind == "NL" and depth == 0:
            return i
        i += 1
    if depth:
        raise HclError("an unclosed bracket", toks[-1].line)
    return i


def _body(src: str, toks: list[Tok], i: int, closing: bool) -> tuple[Body, int]:
    body = Body()
    while True:
        while i < len(toks) and toks[i].kind == "NL":
            i += 1
        if i >= len(toks):
            if closing:
                raise HclError(
                    "a block without its closing brace", toks[-1].line if toks else 1
                )
            return body, i
        t = toks[i]
        if _is(t, "}"):
            if not closing:
                raise HclError("a closing brace without its block", t.line)
            return body, i + 1
        if t.kind != "IDENT":
            raise HclError(
                f"expected an attribute or a block, found {t.text!r}", t.line
            )
        i += 1
        if i < len(toks) and _is(toks[i], "="):
            end = _expression(toks, i + 1)
            part = toks[i + 1 : end]
            if not [x for x in part if x.kind != "NL"]:
                raise HclError(f"{t.text} = with no value", t.line)
            raw = src[part[0].start : part[-1].end]
            body.append(Attribute(t.text, raw, evaluate(part), t.line))
            i = end
            continue
        labels: list[str] = []
        while i < len(toks) and toks[i].kind in ("STRING", "IDENT"):
            label = toks[i]
            if label.kind == "STRING" and not isinstance(label.value, str):
                raise HclError("a block label with a template", label.line)
            labels.append(label.value if label.kind == "STRING" else label.text)  # type: ignore[arg-type]
            i += 1
        if i >= len(toks) or not _is(toks[i], "{"):
            raise HclError(f"{t.text}: expected = or a block's opening brace", t.line)
        inner, i = _body(src, toks, i + 1, closing=True)
        body.append(Block(t.text, labels, inner, t.line))
        if i < len(toks) and not (toks[i].kind == "NL" or _is(toks[i], "}")):
            raise HclError(
                "something after a block's closing brace on its line", toks[i].line
            )


def parse_hcl(src: str) -> Body:
    toks = tokenize(src)
    body, _ = _body(src, toks, 0, closing=False)
    return body


def _json_value(value: object) -> object:
    if isinstance(value, str):
        return UNKNOWN if re.search(r"(?<![$%])[$%]\{", value) else value
    if isinstance(value, list):
        return [_json_value(v) for v in value]
    if isinstance(value, dict):
        return {k: _json_value(v) for k, v in value.items()}
    return value


def _json_body(attrs: object) -> Body:
    """A .tf.json object as a body: each key an attribute, and an object or a list of objects also a nested block."""
    body = Body()
    if not isinstance(attrs, dict):
        return body
    for key, value in attrs.items():
        body.append(Attribute(key, json.dumps(value), _json_value(value), 1))
        for item in value if isinstance(value, list) else [value]:
            if isinstance(item, dict):
                body.append(Block(key, [], _json_body(item), 1))
    return body


def parse_json(src: str) -> Body:
    try:
        doc = json.loads(src)
    except ValueError as exc:
        raise HclError(
            f"not JSON ({exc.msg})", exc.lineno if hasattr(exc, "lineno") else 1
        ) from None
    body = Body()
    if not isinstance(doc, dict):
        raise HclError("a .tf.json file must hold an object", 1)
    for kind, content in doc.items():
        items = content if isinstance(content, list) else [content]
        for item in items:
            if not isinstance(item, dict):
                continue
            if kind in ("resource", "data", "ephemeral"):
                for rtype, named in item.items():
                    for name, attrs in (named or {}).items():
                        for a in attrs if isinstance(attrs, list) else [attrs]:
                            body.append(Block(kind, [rtype, name], _json_body(a), 1))
            elif kind in ("provider", "module", "variable", "output"):
                for name, attrs in item.items():
                    for a in attrs if isinstance(attrs, list) else [attrs]:
                        body.append(Block(kind, [name], _json_body(a), 1))
            else:
                body.append(Block(kind, [], _json_body(item), 1))
    return body


# ----------------------------------------------------------------------------------------------------------------------
# The rules.


@dataclass
class Finding:
    rule: str
    path: str
    line: int
    message: str

    def __str__(self) -> str:
        return f"{self.rule} {self.path}:{self.line} {self.message}"


@dataclass
class Source:
    rel: str
    text: str
    body: Body = field(default_factory=Body)

    @property
    def dir(self) -> str:
        return self.rel.rsplit("/", 1)[0]

    @property
    def kind(self) -> str | None:
        """The protected kind its file name gives, or None."""
        name = self.rel.rsplit("/", 1)[-1].lower()
        name = name[: -len(".json")] if name.endswith(".tf.json") else name
        if not name.endswith(".tf"):
            return None
        return next((p for p in PROTECTED if name.startswith(p)), None)


def read_pins(path: Path) -> dict[str, str]:
    pins: dict[str, str] = {}
    if path.is_file():
        for raw in path.read_text(encoding="utf-8").splitlines():
            key, sep, value = raw.strip().partition("=")
            if sep and not key.startswith("#"):
                pins[key.strip()] = value.strip()
    return pins


def sources(repo: Path) -> list[Path]:
    infra = repo / "infra"
    found = []
    for path in sorted(infra.rglob("*")):
        rel = path.relative_to(repo).as_posix()
        if (
            not path.is_file()
            or rel.startswith("infra/test/")
            or "/.terraform/" in f"/{rel}"
        ):
            continue
        if path.name.endswith(".tf") or path.name.endswith(".tf.json"):
            found.append(path)
    return found


def resources(body: Body, mode: str = "resource") -> list[Block]:
    """The body's blocks of that mode, with the ones nested in check blocks, where Terraform reads scoped data."""
    found = [b for b in body.blocks(mode) if len(b.labels) == 2]
    for check in body.blocks("check"):
        found += [b for b in check.blocks(mode) if len(b.labels) == 2]
    return found


def nested(block: Block, name: str) -> Block | None:
    return block.block(name)


def entries(block: Block, name: str) -> list[Block]:
    """A nested block's instances, or, written as an attribute holding a list of objects (ingress = [{…}]),
    each object as a block whose attributes carry the attribute's own source text."""
    found = list(block.blocks(name))
    attr = block.attr(name)
    if found or attr is None or not isinstance(attr.value, list):
        return found
    for item in attr.value:
        if isinstance(item, dict):
            body = Body(Attribute(k, attr.raw, v, attr.line) for k, v in item.items())
            found.append(Block(name, [], body, attr.line))
    return found


def literal(attr: Attribute | None) -> object:
    return UNKNOWN if attr is None else attr.value


def is_private(cidr: str) -> bool:
    try:
        net = ipaddress.ip_network(cidr, strict=False)
    except ValueError:
        return False
    return any(net.version == p.version and net.subnet_of(p) for p in PRIVATE_NETS)  # type: ignore[arg-type]


def t2_tags(src: Source, block: Block, taggable: frozenset[str]) -> list[Finding]:
    if block.labels[0] not in taggable:
        return []
    tags = block.attr("tags")
    ok = tags is not None and (
        (isinstance(tags.value, dict) and "component" in tags.value)
        or (tags.value is UNKNOWN and re.search(r"\bcomponent\b", tags.raw) is not None)
    )
    if ok:
        return []
    return [
        Finding(
            "T2",
            src.rel,
            block.line,
            f"{'.'.join(block.labels)} sets no tags with component",
        )
    ]


def t3_providers(src: Source, pins: dict[str, str], root: bool) -> list[Finding]:
    found = []
    for p in src.body.blocks("provider"):
        if p.labels[:1] != ["aws"]:
            found.append(
                Finding(
                    "T3",
                    src.rel,
                    p.line,
                    f'provider "{(p.labels or ["?"])[0]}": only hashicorp/aws is allowed',
                )
            )
    for mode in ("resource", "data", "ephemeral"):
        for b in resources(src.body, mode):
            rtype = b.labels[0]
            if rtype.startswith("aws_") or (
                mode == "resource" and rtype == "terraform_data"
            ):
                continue
            if (mode == "resource" and rtype == "null_resource") or (
                mode == "data" and rtype in CODE_DATA
            ):
                continue  # T4 refuses these
            found.append(
                Finding(
                    "T3",
                    src.rel,
                    b.line,
                    f'{mode} "{rtype}": only hashicorp/aws types are allowed',
                )
            )
    for tf in src.body.blocks("terraform"):
        rv = tf.attr("required_version")
        if rv is not None:
            found += _exact(
                src,
                rv,
                "required_version",
                pins.get("TERRAFORM_VERSION"),
                "TERRAFORM_VERSION",
            )
        for rp in tf.blocks("required_providers"):
            for entry in rp.body:
                if not isinstance(entry, Attribute):
                    continue
                spec = entry.value
                if (
                    entry.name != "aws"
                    or not isinstance(spec, dict)
                    or spec.get("source") not in AWS_SOURCES
                ):
                    found.append(
                        Finding(
                            "T3",
                            src.rel,
                            entry.line,
                            f"required_providers.{entry.name}: only hashicorp/aws is allowed",
                        )
                    )
                    continue
                version = Attribute(
                    "version",
                    str(spec.get("version")),
                    spec.get("version", UNKNOWN),
                    entry.line,
                )
                found += _exact(
                    src,
                    version,
                    "the aws provider's version",
                    pins.get("TERRAFORM_AWS_PROVIDER_VERSION"),
                    "TERRAFORM_AWS_PROVIDER_VERSION",
                )
    return found


def _exact(
    src: Source, attr: Attribute, what: str, pin: str | None, key: str
) -> list[Finding]:
    m = EXACT.fullmatch(attr.value) if isinstance(attr.value, str) else None
    if not m:
        return [
            Finding("T3", src.rel, attr.line, f"{what} pins no single exact version")
        ]
    if pin and m.group(1) != pin:
        return [
            Finding(
                "T3",
                src.rel,
                attr.line,
                f"{what} differs from .devcontainer/toolchain.vars's {key}",
            )
        ]
    return []


def t4_code(src: Source) -> list[Finding]:
    found = []

    def walk(body: Body, where: str) -> None:
        for b in body.blocks():
            if b.type == "provisioner":
                found.append(
                    Finding("T4", src.rel, b.line, f"{where}: a provisioner runs code")
                )
            walk(b.body, where)

    for b in src.body.blocks():
        where = ".".join([b.type, *b.labels])
        walk(b.body, where)
    for d in resources(src.body, "data"):
        if d.labels[0] in CODE_DATA:
            found.append(
                Finding(
                    "T4",
                    src.rel,
                    d.line,
                    f'data "{d.labels[0]}" runs code at plan time',
                )
            )
    for r in resources(src.body):
        if r.labels[0] == "null_resource":
            found.append(Finding("T4", src.rel, r.line, "null_resource is refused"))
    for m in src.body.blocks("module"):
        source = literal(m.attr("source"))
        if not (isinstance(source, str) and source.startswith(("./", "../"))):
            found.append(
                Finding(
                    "T4",
                    src.rel,
                    m.line,
                    f"module {'.'.join(m.labels)}: its source must be a local path",
                )
            )
        elif not posixpath.normpath(f"{src.dir}/{source}").startswith("infra/"):
            found.append(
                Finding(
                    "T4",
                    src.rel,
                    m.line,
                    f"module {'.'.join(m.labels)}: its source must stay inside infra/",
                )
            )
    return found


def handover_addresses(srcs: list[Source]) -> set[str]:
    out = set()
    for s in srcs:
        for r in resources(s.body):
            if (
                r.labels[0] == "aws_lambda_function"
                and literal(r.attr("function_name")) in HANDOVER_FUNCTIONS
            ):
                out.add(".".join(r.labels))
    return out


def t5_where(src: Source, handover: set[str]) -> list[Finding]:
    found = []
    kind = src.kind

    def need(line: int, what: str, want: str | None) -> None:
        if want is None and kind is None:
            found.append(
                Finding(
                    "T5",
                    src.rel,
                    line,
                    f"{what} lives only in a protected file ({', '.join(p + '*.tf' for p in PROTECTED)})",
                )
            )
        elif want is not None and kind != want:
            found.append(
                Finding("T5", src.rel, line, f"{what} lives only in {want}*.tf")
            )

    for r in resources(src.body):
        rtype, address = r.labels[0], ".".join(r.labels)
        if rtype in EDGE_LIMITS:
            need(r.line, address, "edge-limits")
        elif rtype == "aws_route53_health_check":
            need(r.line, address, "failover")
        elif (
            (
                rtype == "aws_lambda_function"
                and literal(r.attr("function_name")) in HANDOVER_FUNCTIONS
            )
            or rtype == "aws_lambda_permission"
            and any(
                re.search(
                    rf"\b{re.escape(a)}\b",
                    (r.attr("function_name") or Attribute("", "", None, 0)).raw,
                )
                for a in handover
            )
            or (
                rtype == "aws_lambda_permission"
                and literal(r.attr("function_name")) in HANDOVER_FUNCTIONS
            )
            or rtype == "aws_ssm_parameter"
            and literal(r.attr("name")) == AUTOSTART
        ):
            need(r.line, address, "handover")
        elif r.block("instance_market_options") is not None or rtype in SPOT_TYPES:
            need(r.line, address, "ec2-market")
        elif rtype.startswith(PROTECTED_PREFIXES) or rtype in PROTECTED_TYPES:
            need(r.line, address, None)
    for m in src.body.blocks("module"):
        names = {literal(m.attr(a)) for a in ("function_name", "name")}
        if names & HANDOVER_FUNCTIONS:
            need(m.line, f"module.{'.'.join(m.labels)}", "handover")
    return found


def t6_buckets(srcs: list[Source]) -> list[Finding]:
    found = []
    by_dir: dict[str, list[Source]] = {}
    for s in srcs:
        by_dir.setdefault(s.dir, []).append(s)
    settings = (
        "block_public_acls",
        "block_public_policy",
        "ignore_public_acls",
        "restrict_public_buckets",
    )
    for group in by_dir.values():
        covered: set[str] = set()
        for s in group:
            for r in resources(s.body):
                if r.labels[0] != "aws_s3_bucket_public_access_block":
                    continue
                if any(literal(r.attr(k)) is not True for k in settings):
                    found.append(
                        Finding(
                            "T6",
                            s.rel,
                            r.line,
                            f"{'.'.join(r.labels)}: all four settings must be true",
                        )
                    )
                    continue
                m = re.search(
                    r"aws_s3_bucket\.([A-Za-z0-9_-]+)\.",
                    (r.attr("bucket") or Attribute("", "", None, 0)).raw,
                )
                if m:
                    covered.add(m.group(1))
        for s in group:
            for r in resources(s.body):
                if r.labels[0] == "aws_s3_bucket" and r.labels[1] not in covered:
                    found.append(
                        Finding(
                            "T6",
                            s.rel,
                            r.line,
                            f"aws_s3_bucket.{r.labels[1]} has no public access block with all four settings on",
                        )
                    )
    for s in srcs:
        for r in resources(s.body) + resources(s.body, "data"):
            if r.labels[0] not in ("aws_s3_bucket_policy", "aws_iam_policy_document"):
                continue
            text = s.text[_offset(s.text, r.line) :]
            text = text[: _block_end(text)]
            if _grants_public(r, text):
                found.append(
                    Finding(
                        "T6",
                        s.rel,
                        r.line,
                        f"{'.'.join(r.labels)}: a wildcard principal without an aws:SourceArn condition",
                    )
                )
    return found


def _policy_doc(attr: Attribute | None) -> dict | None:
    """A policy's document when it is a literal: JSON in a string or a heredoc, or jsonencode({…}) of literals."""
    if attr is None:
        return None
    if isinstance(attr.value, str):
        try:
            doc = json.loads(attr.value)
        except ValueError:
            return None
        return doc if isinstance(doc, dict) else None
    try:
        toks = tokenize(attr.raw)
    except HclError:
        return None
    if (
        len(toks) >= 3
        and toks[0].kind == "IDENT"
        and toks[0].text == "jsonencode"
        and _is(toks[1], "(")
    ):
        doc = evaluate(toks[2 : _matching(toks, 1)])
        return doc if isinstance(doc, dict) else None
    return None


def _wild(principal: object) -> bool:
    if principal == "*":
        return True
    if isinstance(principal, dict):
        return any(
            v == "*" or (isinstance(v, list) and "*" in v) for v in principal.values()
        )
    return False


def _statements_public(doc: dict) -> bool | None:
    """True when an Allow statement (the default) grants a wildcard principal without an aws:SourceArn
    condition; a Deny grants nothing. None when the statements aren't literal."""
    statements = doc.get("Statement")
    if isinstance(statements, dict):
        statements = [statements]
    if not isinstance(statements, list):
        return None
    for st in statements:
        if not isinstance(st, dict):
            return None
        if st.get("Effect", "Allow") == "Deny":
            continue
        if _wild(st.get("Principal")) and "aws:SourceArn" not in json.dumps(
            st.get("Condition", {}), default=str
        ):
            return True
    return False


def _grants_public(r: Block, text: str) -> bool:
    if r.labels[0] == "aws_iam_policy_document":
        for st in r.blocks("statement"):
            if literal(st.attr("effect")) == "Deny":
                continue  # an absent or computed effect counts as Allow, the default
            ids = [
                literal(p.attr("identifiers"))
                for p in r.blocks("principals") + st.blocks("principals")
            ]
            wild = any(isinstance(i, list) and "*" in i for i in ids)
            if wild and not any(
                literal(c.attr("variable")) == "aws:SourceArn"
                for c in st.blocks("condition")
            ):
                return True
        return False
    doc = _policy_doc(r.attr("policy"))
    verdict = _statements_public(doc) if doc is not None else None
    if verdict is not None:
        return verdict
    if (
        "data.aws_iam_policy_document."
        in (r.attr("policy") or Attribute("", "", None, 0)).raw
    ):
        return False  # the document is checked as its own block
    return bool(WILDCARD_PRINCIPAL.search(text)) and "aws:SourceArn" not in text


def _offset(text: str, line: int) -> int:
    pos = 0
    for _ in range(line - 1):
        pos = text.index("\n", pos) + 1
    return pos


def _block_end(text: str) -> int:
    """The end of the block whose header starts the text: its first brace's match, ignoring strings' contents roughly."""
    depth, i = 0, text.find("{")
    if i < 0:
        return len(text)
    while i < len(text):
        c = text[i]
        if c == '"':
            j = i + 1
            while j < len(text) and text[j] != '"':
                j += 2 if text[j] == "\\" else 1
            i = j
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return len(text)


def _rules(src: Source) -> list[tuple[int, str, Block, object, object, bool]]:
    """Every ingress rule: (line, what, block, from_port, to_port, on the tunnel end's group)."""
    out = []
    for r in resources(src.body):
        rtype, address = r.labels[0], ".".join(r.labels)
        if rtype == "aws_security_group":
            for ing in entries(r, "ingress"):
                out.append(
                    (
                        ing.line,
                        address,
                        ing,
                        literal(ing.attr("from_port")),
                        literal(ing.attr("to_port")),
                        "tunnel_end" in r.labels[1],
                    )
                )
        elif (
            rtype == "aws_security_group_rule" and literal(r.attr("type")) == "ingress"
        ) or rtype == "aws_vpc_security_group_ingress_rule":
            group = (r.attr("security_group_id") or Attribute("", "", None, 0)).raw
            out.append(
                (
                    r.line,
                    address,
                    r,
                    literal(r.attr("from_port")),
                    literal(r.attr("to_port")),
                    "tunnel_end" in group,
                )
            )
    return out


def t7_ingress(src: Source) -> list[Finding]:
    found = []
    for line, what, b, lo, hi, tunnel_end in _rules(src):
        port = lo if lo == hi and isinstance(lo, int) else None
        for name in ("cidr_blocks", "ipv6_cidr_blocks", "cidr_ipv4", "cidr_ipv6"):
            attr = b.attr(name)
            if attr is None:
                continue
            values = attr.value if isinstance(attr.value, list) else [attr.value]
            public = [v for v in values if isinstance(v, str) and not is_private(v)]
            ranges = "aws_ip_ranges" in attr.raw and any(v is UNKNOWN for v in values)
            if public and not (port == 2222 and tunnel_end):
                found.append(
                    Finding(
                        "T7",
                        src.rel,
                        line,
                        f"{what}: ingress from an outside range ({name}) on a port T7 doesn't allow",
                    )
                )
            if ranges and port != 8087:
                found.append(
                    Finding(
                        "T7",
                        src.rel,
                        line,
                        f"{what}: Route 53's ranges are allowed on 8087 alone",
                    )
                )
        for name in ("prefix_list_ids", "prefix_list_id"):
            attr = b.attr(name)
            if attr is not None and not (port == 8080 and "cloudfront" in attr.raw):
                found.append(
                    Finding(
                        "T7",
                        src.rel,
                        line,
                        f"{what}: a prefix list is allowed only for CloudFront's origin-facing list, on 8080",
                    )
                )
    return found


def t8_text(src: Source) -> list[Finding]:
    found = []
    for number, line in enumerate(src.text.splitlines(), 1):
        for what, pattern in LITERALS:
            if pattern.search(line):
                found.append(Finding("T8", src.rel, number, f"{what} in the text"))
    return found


def t9_secrets(src: Source) -> list[Finding]:
    found = []
    for r in resources(src.body):
        address = ".".join(r.labels)
        if r.labels[0] == "aws_ssm_parameter":
            kind = literal(r.attr("type"))
            if kind == "SecureString" or not isinstance(kind, str):
                found.append(
                    Finding(
                        "T9",
                        src.rel,
                        r.line,
                        f"{address}: only String or StringList, as a literal; secrets are the Author's, outside Terraform",
                    )
                )
        elif r.labels[0] == "aws_secretsmanager_secret_version":
            found.append(
                Finding(
                    "T9",
                    src.rel,
                    r.line,
                    f"{address}: Terraform never writes a secret's value",
                )
            )
    for mode in ("data", "ephemeral"):
        for d in resources(src.body, mode):
            if d.labels[0] in SECRET_SOURCES:
                found.append(
                    Finding(
                        "T9",
                        src.rel,
                        d.line,
                        f'{mode} "{d.labels[0]}": Terraform never reads a secret',
                    )
                )
    return found


def _market(block: Block) -> list[str]:
    problems = []
    imo = block.block("instance_market_options")
    if imo is None:
        return ["no instance_market_options"]
    if literal(imo.attr("market_type")) != "spot":
        problems.append('market_type isn\'t "spot"')
    so = imo.block("spot_options")
    if so is None or literal(so.attr("instance_interruption_behavior")) != "stop":
        problems.append('instance_interruption_behavior isn\'t "stop"')
    if so is None or literal(so.attr("spot_instance_type")) != "persistent":
        problems.append('spot_instance_type isn\'t "persistent"')
    return problems


def t11_spot(src: Source) -> list[Finding]:
    if not src.rel.startswith("infra/prod/"):
        return []
    found = []
    for r in resources(src.body):
        rtype, address = r.labels[0], ".".join(r.labels)
        if rtype in INSTANCES:
            if (
                rtype == "aws_instance"
                and r.block("launch_template") is not None
                and r.block("instance_market_options") is None
            ):
                continue
            for p in _market(r):
                found.append(Finding("T11", src.rel, r.line, f"{address}: {p}"))
        elif rtype == "aws_spot_instance_request":
            if (
                literal(r.attr("spot_type")) != "persistent"
                or literal(r.attr("instance_interruption_behavior")) != "stop"
            ):
                found.append(
                    Finding(
                        "T11",
                        src.rel,
                        r.line,
                        f"{address}: a persistent spot request that stops on interruption",
                    )
                )
    return found


def t12_rds(src: Source) -> list[Finding]:
    found = []
    want = {
        "publicly_accessible": False,
        "storage_encrypted": True,
        "deletion_protection": True,
        "manage_master_user_password": True,
    }
    for r in resources(src.body):
        if r.labels[0] not in RDS:
            continue
        address = ".".join(r.labels)
        for key, value in want.items():
            if key == "publicly_accessible" and r.labels[0] == "aws_rds_cluster":
                continue
            if literal(r.attr(key)) is not value:
                found.append(
                    Finding(
                        "T12",
                        src.rel,
                        r.line,
                        f"{address}: {key} must be {str(value).lower()}",
                    )
                )
        for key in PASSWORDS:
            if r.attr(key) is not None:
                found.append(
                    Finding(
                        "T12",
                        src.rel,
                        r.line,
                        f"{address}: no {key} argument; RDS manages the master password",
                    )
                )
    return found


def t13_imds(src: Source) -> list[Finding]:
    found = []
    for r in resources(src.body):
        if r.labels[0] not in INSTANCES:
            continue
        mo = r.block("metadata_options")
        if (
            mo is None
            and r.labels[0] == "aws_instance"
            and r.block("launch_template") is not None
        ):
            continue
        address = ".".join(r.labels)
        if mo is None or literal(mo.attr("http_tokens")) != "required":
            found.append(
                Finding(
                    "T13",
                    src.rel,
                    r.line,
                    f'{address}: metadata_options.http_tokens must be "required"',
                )
            )
        if mo is None or literal(mo.attr("http_put_response_hop_limit")) != 1:
            found.append(
                Finding(
                    "T13",
                    src.rel,
                    r.line,
                    f"{address}: metadata_options.http_put_response_hop_limit must be 1",
                )
            )
    return found


def check_roots(repo: Path, srcs: list[Source], pins: dict[str, str]) -> list[Finding]:
    found = []
    for name in ROOTS:
        root = repo / "infra" / name
        if not root.is_dir():
            continue
        rel = f"infra/{name}"
        files = [s for s in srcs if s.dir == rel]
        providers = [
            p
            for s in files
            for p in s.body.blocks("provider")
            if p.labels[:1] == ["aws"]
        ]
        if not providers:
            found.append(
                Finding(
                    "T1", rel, 0, 'the root has no provider "aws" with default_tags'
                )
            )
        for s in files:
            for p in s.body.blocks("provider"):
                if p.labels[:1] != ["aws"]:
                    continue
                dt = p.block("default_tags")
                tags = literal(dt.attr("tags")) if dt else UNKNOWN
                if not (
                    isinstance(tags, dict) and {"project", "environment"} <= tags.keys()
                ):
                    found.append(
                        Finding(
                            "T1",
                            s.rel,
                            p.line,
                            'provider "aws": default_tags must set project and environment',
                        )
                    )
        tfs = [b for s in files for b in s.body.blocks("terraform")]
        if not any(b.attr("required_version") for b in tfs):
            found.append(Finding("T3", rel, 0, "the root sets no required_version"))
        if not any(b.blocks("required_providers") for b in tfs):
            found.append(Finding("T3", rel, 0, "the root sets no required_providers"))
        lock = root / ".terraform.lock.hcl"
        pin = pins.get("TERRAFORM_AWS_PROVIDER_VERSION")
        if not pin:
            found.append(
                Finding(
                    "T10",
                    ".devcontainer/toolchain.vars",
                    0,
                    "no TERRAFORM_AWS_PROVIDER_VERSION pin",
                )
            )
        if not lock.is_file():
            found.append(Finding("T10", rel, 0, "no .terraform.lock.hcl"))
            continue
        try:
            body = parse_hcl(lock.read_text(encoding="utf-8"))
        except (HclError, OSError, UnicodeDecodeError) as exc:
            found.append(
                Finding(
                    "T0",
                    f"{rel}/.terraform.lock.hcl",
                    getattr(exc, "line", 0),
                    "doesn't read as HCL",
                )
            )
            continue
        seen = False
        for p in body.blocks("provider"):
            if p.labels[:1] != [LOCK_AWS]:
                found.append(
                    Finding(
                        "T10",
                        f"{rel}/.terraform.lock.hcl",
                        p.line,
                        "a provider other than hashicorp/aws",
                    )
                )
                continue
            seen = True
            if pin and literal(p.attr("version")) != pin:
                found.append(
                    Finding(
                        "T10",
                        f"{rel}/.terraform.lock.hcl",
                        p.line,
                        "hashicorp/aws differs from the pin in .devcontainer/toolchain.vars",
                    )
                )
        if not seen:
            found.append(
                Finding(
                    "T10", f"{rel}/.terraform.lock.hcl", 0, "holds no hashicorp/aws"
                )
            )
    return found


def load(repo: Path) -> tuple[list[Source], list[Finding]]:
    srcs, found = [], []
    for folder in sorted((repo / "infra").rglob(".terraform")):
        if folder.is_dir():
            rel = folder.relative_to(repo).as_posix()
            note = "a .terraform/ folder: downloaded providers and modules are never committed or read"
            found.append(Finding("T4", rel, 0, note))
    for path in sources(repo):
        rel = path.relative_to(repo).as_posix()
        try:
            text = path.read_text(encoding="utf-8")
            body = (
                parse_json(text) if path.name.endswith(".tf.json") else parse_hcl(text)
            )
        except (HclError, UnicodeDecodeError) as exc:
            found.append(
                Finding(
                    "T0",
                    rel,
                    getattr(exc, "line", 0),
                    "doesn't read as HCL; fix the syntax (the reader refuses rather than guesses)",
                )
            )
            continue
        srcs.append(Source(rel, text, body))
    return srcs, found


def taggable(repo: Path) -> frozenset[str]:
    listed = repo / "infra" / "policy" / "taggable.txt"
    if listed.is_file():
        return frozenset(
            x.strip()
            for x in listed.read_text(encoding="utf-8").splitlines()
            if x.strip() and not x.startswith("#")
        )
    return TAGGABLE


def check_repo(repo: Path) -> list[Finding]:
    if not (repo / "infra").is_dir():
        return []
    pins = read_pins(repo / ".devcontainer" / "toolchain.vars")
    srcs, found = load(repo)
    tags = taggable(repo)
    handover = handover_addresses(srcs)
    for s in srcs:
        found += t8_text(s)
        found += t3_providers(s, pins, root=s.dir in {f"infra/{r}" for r in ROOTS})
        found += t4_code(s)
        found += t5_where(s, handover)
        found += t7_ingress(s)
        found += t9_secrets(s)
        found += t11_spot(s)
        found += t12_rds(s)
        found += t13_imds(s)
        for r in resources(s.body):
            found += t2_tags(s, r, tags)
    found += t6_buckets(srcs)
    found += check_roots(repo, srcs, pins)
    return sorted(found, key=lambda f: (f.path, f.line, f.rule, f.message))


# ----------------------------------------------------------------------------------------------------------------------
# A saved plan's JSON (`terraform show -json <plan>`): the rules its values can show.


def _walk_module(module: dict) -> list[dict]:
    out = list(module.get("resources") or [])
    for child in module.get("child_modules") or []:
        out += _walk_module(child)
    return out


def _first(value: object) -> dict:
    if isinstance(value, list) and value and isinstance(value[0], dict):
        return value[0]
    return value if isinstance(value, dict) else {}


def check_plan_json(plan: dict, root_name: str | None = None) -> list[Finding]:
    found: list[Finding] = []
    planned = _walk_module((plan.get("planned_values") or {}).get("root_module") or {})
    prior = _walk_module(
        ((plan.get("prior_state") or {}).get("values") or {}).get("root_module") or {}
    )
    ranges = {
        c
        for r in planned + prior
        if r.get("type") == "aws_ip_ranges"
        for c in (r.get("values") or {}).get("cidr_blocks") or []
    }
    changes = [
        {
            "address": c.get("address"),
            "mode": c.get("mode"),
            "type": c.get("type"),
            "values": {},
        }
        for c in plan.get("resource_changes") or []
    ]
    seen: set[tuple[str, str]] = set()
    for r in planned + changes:
        address, mode, rtype = (
            str(r.get("address")),
            r.get("mode", "managed"),
            str(r.get("type")),
        )
        values = r.get("values") or {}
        key = (address, mode)
        first = key not in seen
        seen.add(key)

        def add(rule: str, what: str, address: str = address) -> None:
            found.append(Finding(rule, "plan", 0, f"{address}: {what}"))

        if first and (
            (mode == "managed" and rtype == "null_resource")
            or (mode == "data" and rtype in CODE_DATA)
        ):
            add("T4", "runs code")
        if first and (
            mode == "data"
            and rtype in SECRET_SOURCES
            or mode == "managed"
            and rtype == "aws_secretsmanager_secret_version"
        ):
            add("T9", "reads or writes a secret")
        if not values:
            continue
        if mode == "managed" and "tags_all" in values:
            tags = values.get("tags_all") or {}
            missing = [
                k for k in ("project", "environment", "component") if k not in tags
            ]
            if missing:
                add("T2", f"tags_all lacks {', '.join(missing)}")
        if rtype == "aws_ssm_parameter" and values.get("type") == "SecureString":
            add("T9", "a SecureString parameter")
        rules = []
        if rtype == "aws_security_group":
            rules = list(values.get("ingress") or [])
        elif rtype == "aws_security_group_rule" and values.get("type") == "ingress":
            rules = [values]
        elif rtype == "aws_vpc_security_group_ingress_rule":
            rules = [
                {
                    **values,
                    "cidr_blocks": [values.get("cidr_ipv4")]
                    if values.get("cidr_ipv4")
                    else [],
                    "ipv6_cidr_blocks": [values.get("cidr_ipv6")]
                    if values.get("cidr_ipv6")
                    else [],
                }
            ]
        for rule in rules:
            port = (
                rule.get("from_port")
                if rule.get("from_port") == rule.get("to_port")
                else None
            )
            cidrs = [
                c
                for c in (rule.get("cidr_blocks") or [])
                + (rule.get("ipv6_cidr_blocks") or [])
                if c
            ]
            public = [c for c in cidrs if not is_private(c)]
            if public and not (
                port == 2222 or (port == 8087 and set(public) <= ranges)
            ):
                add("T7", "ingress from an outside range on a port T7 doesn't allow")
        if rtype in INSTANCES:
            mo = _first(values.get("metadata_options"))
            if (
                mo.get("http_tokens") != "required"
                or mo.get("http_put_response_hop_limit") != 1
            ):
                add("T13", "IMDSv2 required, with hop limit 1")
            if root_name == "prod":
                imo = _first(values.get("instance_market_options"))
                so = _first(imo.get("spot_options"))
                if (
                    imo.get("market_type") != "spot"
                    or so.get("instance_interruption_behavior") != "stop"
                    or so.get("spot_instance_type") != "persistent"
                ):
                    add("T11", "spot, persistent, stopping on interruption")
        if rtype in RDS:
            want = {
                "publicly_accessible": False,
                "storage_encrypted": True,
                "deletion_protection": True,
                "manage_master_user_password": True,
            }
            for k, v in want.items():
                if (
                    not (k == "publicly_accessible" and rtype == "aws_rds_cluster")
                    and values.get(k) is not v
                ):
                    add("T12", f"{k} must be {str(v).lower()}")
    return sorted(found, key=lambda f: (f.message, f.rule))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="infra_policy.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument(
        "--root", type=Path, default=REPO, help="the repository (or an export of it)"
    )
    parser.add_argument(
        "--plan-json", type=Path, help="terraform show -json of a saved plan"
    )
    parser.add_argument(
        "--root-name",
        choices=ROOTS,
        help="which root the plan is of (prod turns on T11)",
    )
    args = parser.parse_args(argv)
    if args.plan_json:
        try:
            plan = json.loads(args.plan_json.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            print(
                f"infra-policy: can't read the plan's JSON: {exc.__class__.__name__}",
                file=sys.stderr,
            )
            return 2
        found = check_plan_json(plan, args.root_name)
        for f in found:
            print(f)
        print(
            f"infra-policy: {len(found)} finding{'s' if len(found) != 1 else ''} in the plan"
            if found
            else "infra-policy: PASS, the plan"
        )
        return 1 if found else 0
    root = args.root.resolve()
    if not (root / "infra").is_dir():
        print("SKIP: no infra/ yet (spec 001's group 3 writes the first file)")
        return 0
    try:
        found = check_repo(root)
    except OSError as exc:
        print(
            f"infra-policy: can't read the tree: {exc.__class__.__name__}",
            file=sys.stderr,
        )
        return 2
    for f in found:
        print(f)
    files = len(sources(root))
    if found:
        print(
            f"infra-policy: {len(found)} finding{'s' if len(found) != 1 else ''} in {files} files"
        )
        return 1
    print(f"infra-policy: PASS, {files} files")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
