#!/usr/bin/env python3
"""The gate's infra-plan-note step (spec 001 contracts/infra-records.md §2; September's §3 at 00309c47; research.md
R-13; FR-005, FR-010). Human-only, from the guard patch P-1.

    python3 -I -B -X pycache_prefix=/dev/null tools/gates/infra_plan_note.py [--repo DIR] [--base REV] [--head REV]

It reads git and the branch's merge-request notes, never Terraform, so it runs in an agent session, in make check,
and in the Author's gate alike:

1. When it applies: when `git diff --name-only BASE..HEAD` touches nothing under infra/, or only infra/test/ and
   files at infra/'s top (its README), it prints "SKIP: …" and exits 0. BASE is `git merge-base refs/heads/main HEAD`
   unless given; main is read by its full ref, never bare.
2. Which roots: each of bootstrap, account, and prod whose folder the range touches; every root when it touches
   infra/modules/ or infra/policy/; and account when it touches infra/lambdas/, whose functions that root deploys.
3. The blocks: the notes under docs/merge-requests/ that the range adds or changes, read as HEAD has them (a block
   left uncommitted doesn't count), must hold, for each such root, exactly one block whose tree is
   `git rev-parse HEAD:infra`. A block reads:

       <!-- h4-plan root=<root> tree=<40 hex> sha256=<64 hex> terraform=<x.y.z> made=<UTC, ISO 8601> -->
       ```terraform-plan
       <the redacted plan text>
       ```
       <!-- /h4-plan -->

4. Each such block's text must pass infra_redact.py's check: no 12-digit run, no email address, no secret pattern.
   A finding names the note and its line, never the value.
5. Otherwise it prints "PASS: …", naming the roots and the tree.

Exit codes: 0 PASS or SKIP; 1 FAIL; 2 it couldn't run (not a repository, a revision that doesn't resolve).
"""

from __future__ import annotations

import argparse
import importlib.util
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOTS = ("bootstrap", "account", "prod")
NOTES = "docs/merge-requests/"
BLOCK = re.compile(
    r"<!-- h4-plan (?P<attrs>[^>\n]*?) -->\n```terraform-plan\n(?P<text>.*?)\n?```\n<!-- /h4-plan -->",
    re.DOTALL,
)
FIELDS = {
    "root": re.compile(r"bootstrap|account|prod"),
    "tree": re.compile(r"[0-9a-f]{40}"),
    "sha256": re.compile(r"[0-9a-f]{64}"),
    "terraform": re.compile(r"\d+\.\d+\.\d+"),
    "made": re.compile(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ"),
}


def _redact_module():
    spec = importlib.util.spec_from_file_location(
        "infra_redact", HERE / "infra_redact.py"
    )
    if spec is None or spec.loader is None:
        raise ImportError("infra_redact.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@dataclass
class Result:
    status: str
    lines: list[str] = field(default_factory=list)


@dataclass
class PlanBlock:
    note: str
    line: int
    attrs: dict[str, str]
    text: str
    text_line: int


class GitError(RuntimeError):
    pass


def git(repo: Path, *args: str) -> str:
    out = subprocess.run(
        ["git", "--no-replace-objects", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        check=False,
        stdin=subprocess.DEVNULL,
    )
    if out.returncode != 0:
        raise GitError(f"git {args[0]} failed")
    return out.stdout


def exists(repo: Path, head: str, path: str) -> bool:
    try:
        git(repo, "cat-file", "-e", f"{head}:{path}")
    except GitError:
        return False
    return True


def roots_for(paths: list[str]) -> set[str]:
    roots: set[str] = set()
    for path in paths:
        parts = path.split("/")
        if parts[0] != "infra" or len(parts) < 3:
            continue
        top = parts[1]
        if top in ROOTS:
            roots.add(top)
        elif top in ("modules", "policy"):
            roots.update(ROOTS)
        elif top == "lambdas":
            roots.add("account")
    return roots


def blocks_in(note: str, text: str) -> list[PlanBlock]:
    found = []
    for m in BLOCK.finditer(text):
        attrs = dict(kv.split("=", 1) for kv in m.group("attrs").split() if "=" in kv)
        line = text.count("\n", 0, m.start()) + 1
        found.append(PlanBlock(note, line, attrs, m.group("text"), line + 2))
    return found


def check(repo: Path, base: str, head: str) -> Result:
    changed = [
        p for p in git(repo, "diff", "--name-only", f"{base}..{head}").splitlines() if p
    ]
    infra = [p for p in changed if p.startswith("infra/")]
    if not infra:
        return Result("SKIP", ["SKIP: no infra change"])
    # A root needs its block only once its folder exists at the branch's tip: infra/lambdas/ belongs to the account
    # root, which arrives with spec 001's group 4 (group 3's finding, 2026-11-10).
    roots = {r for r in roots_for(infra) if exists(repo, head, f"infra/{r}")}
    if not roots:
        return Result(
            "SKIP",
            [
                "SKIP: no root's files changed (only infra/test/ or files at infra/'s top)"
            ],
        )
    tree = git(repo, "rev-parse", f"{head}:infra").strip()
    notes = [p for p in changed if p.startswith(NOTES) and p.endswith(".md")]
    blocks: list[PlanBlock] = []
    for note in notes:
        try:
            text = git(repo, "show", f"{head}:{note}")
        except GitError:
            continue  # a note the range deletes
        blocks += blocks_in(note, text)
    redact = _redact_module()
    problems = []
    for b in blocks:
        bad = [
            k
            for k, pattern in FIELDS.items()
            if not pattern.fullmatch(b.attrs.get(k, ""))
        ]
        if bad:
            problems.append(
                f"FAIL: {b.note}:{b.line}: the block's {', '.join(bad)} {'is' if len(bad) == 1 else 'are'} missing or malformed"
            )
    for root in sorted(roots):
        mine = [
            b
            for b in blocks
            if b.attrs.get("root") == root and b.attrs.get("tree") == tree
        ]
        if not mine:
            problems.append(
                f"FAIL: plan for {root} missing or made from an older infra tree; run make plan ROOT={root} in your "
                f"terminal and paste the block (infra/'s tree is {tree})"
            )
        elif len(mine) > 1:
            where = ", ".join(f"{b.note}:{b.line}" for b in mine)
            problems.append(
                f"FAIL: plan for {root}: exactly one block per root and tree, found {len(mine)} ({where})"
            )
        for b in mine:
            for number, kind in redact.check(b.text):
                problems.append(
                    f"FAIL: {b.note}:{b.text_line + number - 1}: {kind} in the plan block for {root}"
                )
    if problems:
        return Result("FAIL", problems)
    return Result(
        "PASS",
        [f"PASS: plan blocks for {', '.join(sorted(roots))} at infra/'s tree {tree}"],
    )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="infra_plan_note.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument(
        "--base",
        help="the range's start (default: git merge-base refs/heads/main HEAD)",
    )
    parser.add_argument("--head", default="HEAD")
    args = parser.parse_args(argv)
    try:
        base = (
            args.base
            or git(args.repo, "merge-base", "refs/heads/main", args.head).strip()
        )
        result = check(args.repo, base, args.head)
    except (GitError, ImportError, OSError) as exc:
        print(f"infra-plan-note: can't run: {exc}", file=sys.stderr)
        return 2
    for line in result.lines:
        print(line)
    return 1 if result.status == "FAIL" else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
