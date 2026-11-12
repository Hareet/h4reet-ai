#!/usr/bin/env python3
"""The disclosure's completeness check (spec 001 plan §8.3; FR-040; the constitution's Principle I). Human-only, from
the guard patch P-1.

    python3 -I -B -X pycache_prefix=/dev/null tools/gates/disclosure_check.py [--root DIR]

Every outward kind of thing the tree adds needs its row in docs/data-flow-disclosure.md, a table line that starts
with a row ID (S1, C14, …), and the row names it in backticks:
  - a compose service on the egress network (deploy/compose.yaml): the service, in the row's "From → To" cell before
    the arrow (compose_policy.py already requires a row for every service; this one requires that row to be the
    service's own);
  - an sshd permit (deploy/**/sshd_config*): each PermitOpen target as host:port, and each PermitListen as host:port
    or its port alone; PermitOpen any is refused outright;
  - an egress-proxy host (deploy/hosts/<host>/egress-allowlist.txt, one host a line): the host, or host:port;
  - a CloudFront origin (aws_cloudfront_distribution's origin blocks under infra/): its origin_id, a literal;
  - an EventBridge rule that calls out (aws_cloudwatch_event_api_destination): its name, or its endpoint's host;
  - a security-group rule open to an outside range (a literal CIDR outside 10/8, 172.16/12, 192.168/16, 100.64/10,
    and fc00::/7, ingress or egress): its port, or from-to for a range.
infra/test/ is never read: its fixtures are never planned. It reads files as data and runs nothing. Exit codes: 0 PASS;
1 a finding, naming the thing and where it is; 2 it couldn't run (no disclosure, a file it can't read).
"""

from __future__ import annotations

import argparse
import importlib.util
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
DISCLOSURE = "docs/data-flow-disclosure.md"
COMPOSE = "deploy/compose.yaml"
ROW = re.compile(r"^\|\s*[A-Z][0-9]+\s*\|")
TICKED = re.compile(r"`([^`]+)`")


def _policy():
    spec = importlib.util.spec_from_file_location(
        "infra_policy", HERE / "infra_policy.py"
    )
    if spec is None or spec.loader is None:
        raise ImportError("infra_policy.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules.setdefault(spec.name, module)
    spec.loader.exec_module(module)
    return module


@dataclass
class Finding:
    kind: str
    where: str
    message: str

    def __str__(self) -> str:
        return f"{self.where}: {self.kind}: {self.message} has no row in {DISCLOSURE}"


@dataclass
class Rows:
    names: set[str]
    senders: set[str]

    @classmethod
    def read(cls, path: Path) -> Rows:
        names, senders = set(), set()
        for line in path.read_text(encoding="utf-8").splitlines():
            if not ROW.match(line):
                continue
            names.update(TICKED.findall(line))
            cells = line.split("|")
            if len(cells) > 2:
                senders.update(TICKED.findall(cells[2].split("→", 1)[0]))
        return cls(names, senders)


def compose_egress(path: Path) -> list[tuple[str, int]]:
    """The services on the egress network, read from the file's own layout: services at two spaces, their keys at
    four, a networks key as a flow list, a block list, or a mapping."""
    hits: list[tuple[str, int]] = []
    in_services, service, in_networks = False, None, False
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        text = raw.split(" #", 1)[0].rstrip()
        if not text.strip() or text.lstrip().startswith("#"):
            continue
        indent = len(text) - len(text.lstrip(" "))
        s = text.strip()
        if indent == 0:
            in_services, service, in_networks = s == "services:", None, False
            continue
        if not in_services:
            continue
        if indent == 2 and s.endswith(":"):
            service, in_networks = (s[:-1].strip("\"'"), number), False
            continue
        if service and indent == 4:
            in_networks = s.startswith("networks:")
            rest = s[len("networks:") :].strip() if in_networks else ""
            if rest.startswith("["):
                if "egress" in [
                    x.strip().strip("\"'") for x in rest.strip("[]").split(",")
                ]:
                    hits.append(service)
                in_networks = False
            continue
        if service and in_networks and indent == 6:
            item = s[2:] if s.startswith("- ") else s.split(":", 1)[0]
            if item.strip().strip("\"'") == "egress":
                hits.append(service)
    return list(dict.fromkeys(hits))


def is_outside(cidr: str) -> bool:
    import ipaddress

    private = (
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "100.64.0.0/10",
        "fc00::/7",
    )
    try:
        net = ipaddress.ip_network(cidr, strict=False)
    except ValueError:
        return False
    return not any(
        net.version == p.version and net.subnet_of(p)
        for p in map(ipaddress.ip_network, private)
    )  # type: ignore[arg-type]


def check(root: Path) -> list[Finding]:
    rows = Rows.read(root / DISCLOSURE)
    found: list[Finding] = []
    compose = root / COMPOSE
    if compose.is_file():
        for name, line in compose_egress(compose):
            if name not in rows.senders:
                found.append(
                    Finding(
                        "compose service on egress", f"{COMPOSE}:{line}", f"`{name}`"
                    )
                )
    for path in (
        sorted((root / "deploy").rglob("sshd_config*"))
        if (root / "deploy").is_dir()
        else []
    ):
        rel = path.relative_to(root).as_posix()
        for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            words = raw.split("#", 1)[0].split()
            if len(words) < 2 or words[0].lower() not in ("permitopen", "permitlisten"):
                continue
            for target in words[1:]:
                if target.lower() == "none":
                    continue
                port = target.rsplit(":", 1)[-1]
                listen = words[0].lower() == "permitlisten"
                if target.lower() == "any" or (
                    target not in rows.names and not (listen and port in rows.names)
                ):
                    found.append(
                        Finding(
                            "sshd permit", f"{rel}:{number}", f"{words[0]} {target}"
                        )
                    )
    hosts = root / "deploy" / "hosts"
    for path in sorted(hosts.glob("*/egress-allowlist.txt")) if hosts.is_dir() else []:
        rel = path.relative_to(root).as_posix()
        for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            host = raw.split("#", 1)[0].strip()
            if (
                host
                and host not in rows.names
                and host.rsplit(":", 1)[0] not in rows.names
            ):
                found.append(
                    Finding("egress-proxy host", f"{rel}:{number}", f"`{host}`")
                )
    if (root / "infra").is_dir():
        found += infra_findings(root, rows)
    return found


def infra_findings(root: Path, rows: Rows) -> list[Finding]:
    ip = _policy()
    srcs, unreadable = ip.load(root)
    found = [
        Finding(
            "unreadable Terraform", f"{f.path}:{f.line}", "a file the reader refuses"
        )
        for f in unreadable
    ]
    for s in srcs:
        for r in ip.resources(s.body):
            rtype = r.labels[0]
            if rtype == "aws_cloudfront_distribution":
                for origin in r.blocks("origin"):
                    oid = ip.literal(origin.attr("origin_id"))
                    if not isinstance(oid, str) or oid not in rows.names:
                        found.append(
                            Finding(
                                "CloudFront origin",
                                f"{s.rel}:{origin.line}",
                                f"origin `{oid if isinstance(oid, str) else '(not a literal)'}`",
                            )
                        )
            elif rtype == "aws_cloudwatch_event_api_destination":
                name = ip.literal(r.attr("name"))
                endpoint = ip.literal(r.attr("invocation_endpoint"))
                host = (
                    urlsplit(endpoint).hostname if isinstance(endpoint, str) else None
                )
                if not ({name, host} & rows.names):
                    found.append(
                        Finding(
                            "EventBridge API destination",
                            f"{s.rel}:{r.line}",
                            f"`{name}`",
                        )
                    )
            for line, lo, hi, cidrs in _open_rules(ip, r):
                outside = [c for c in cidrs if isinstance(c, str) and is_outside(c)]
                port = str(lo) if lo == hi else f"{lo}-{hi}"
                if outside and port not in rows.names:
                    found.append(
                        Finding(
                            "security-group rule open to an outside range",
                            f"{s.rel}:{line}",
                            f"port `{port}` from {', '.join(outside)}",
                        )
                    )
    return found


def _open_rules(ip, r) -> list[tuple[int, object, object, list]]:
    rtype = r.labels[0]
    out = []
    keys = ("cidr_blocks", "ipv6_cidr_blocks", "cidr_ipv4", "cidr_ipv6")

    def cidrs(b) -> list:
        values: list = []
        for k in keys:
            v = ip.literal(b.attr(k))
            values += v if isinstance(v, list) else [v]
        return values

    if rtype == "aws_security_group":
        for b in ip.entries(r, "ingress") + ip.entries(r, "egress"):
            out.append(
                (
                    b.line,
                    ip.literal(b.attr("from_port")),
                    ip.literal(b.attr("to_port")),
                    cidrs(b),
                )
            )
    elif rtype in (
        "aws_security_group_rule",
        "aws_vpc_security_group_ingress_rule",
        "aws_vpc_security_group_egress_rule",
    ):
        out.append(
            (
                r.line,
                ip.literal(r.attr("from_port")),
                ip.literal(r.attr("to_port")),
                cidrs(r),
            )
        )
    return out


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="disclosure_check.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument("--root", type=Path, default=REPO)
    args = parser.parse_args(argv)
    root = args.root.resolve()
    if not (root / DISCLOSURE).is_file():
        print(f"disclosure-check: {DISCLOSURE} is missing", file=sys.stderr)
        return 2
    try:
        found = check(root)
    except (OSError, UnicodeDecodeError, ImportError) as exc:
        print(
            f"disclosure-check: can't read the tree: {exc.__class__.__name__}",
            file=sys.stderr,
        )
        return 2
    for f in found:
        print(f)
    if found:
        print(
            f"disclosure-check: {len(found)} outward thing{'s' if len(found) != 1 else ''} without a row"
        )
        return 1
    print("disclosure-check: PASS, every outward thing the tree holds has its row")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
