#!/usr/bin/env python3
"""make infra-record ROOT=<root> OUTCOME=ok|failed [EXIT_STATUS=n] [PROFILE=…]: the apply's record, after the Author's
apply on main (spec 001 contracts/infra-records.md §2, and September's §6 at 00309c47; data-model.md §6.5; research.md
R-13; tasks.md T024; FR-007, FR-010). His terminal alone: the sandbox, and the bash gate (P-1), refuse it to agents.

    python3 -I -B -X pycache_prefix=/dev/null scripts/infra/infra_record.py --root ROOT --outcome ok|failed
        [--exit-status N] [--profile NAME] [--now 2026-11-11T09:30:00Z]

It reads the plan make infra-verify verified (its stamp, beside the saved plan, of HEAD:infra's tree), and writes
docs/infra/applies/<YYYY-MM-DD>[-n]-<root>.md:
  - the commit applied, the plan's SHA-256 and tree and the note holding its block, who applied it, when (from
    infra-verify's pass to this run), the outcome, Terraform's version;
  - the resources changed, from `terraform show -json` of the saved plan: addresses and actions alone, never a value;
  - with OUTCOME=failed, Terraform's exit status (EXIT_STATUS, required then), and which of the plan's addresses the
    state now holds, from `terraform show -json` of the state (PROFILE, for a root whose state is in the bucket).
The text passes tools/gates/infra_redact.py first (account IDs and addresses out; a secret pattern refuses). Then it
commits the record on a new branch, ops/apply-<root>-<date>[-n], whose parent is refs/heads/main, without touching the
checkout: git's plumbing, with an index of its own. The Author gates and merges that branch as any other.
Exit codes: 0 recorded; 1 terraform couldn't read the plan or the state; 2 it couldn't run; 3 the redaction refused.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import sys
import tempfile
from pathlib import Path

PROG = "infra-record"
ZERO = "0" * 40
ACTIONS = {
    ("create",): "create",
    ("update",): "update",
    ("delete",): "delete",
    ("delete", "create"): "replace",
    ("create", "delete"): "replace",
    ("forget",): "forget",
}


def _common():
    spec = importlib.util.spec_from_file_location(
        "infra_common", Path(__file__).resolve().with_name("infra_common.py")
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


c = _common()


def changes(plan_json: dict) -> list[tuple[str, str]]:
    """The managed resources the plan changes or imports, as (address, action); reads and no-ops left out."""
    out = []
    for rc in plan_json.get("resource_changes") or []:
        if rc.get("mode", "managed") != "managed":
            continue
        change = rc.get("change") or {}
        actions = tuple(change.get("actions") or ())
        action = ACTIONS.get(actions)
        if change.get("importing"):
            action = "import" if action is None else f"import, {action}"
        if action is not None:
            out.append((str(rc.get("address")), action))
    return sorted(out)


def held(state_json: dict) -> set[str]:
    def walk(module: dict) -> list[str]:
        found = [str(r.get("address")) for r in module.get("resources") or []]
        for child in module.get("child_modules") or []:
            found += walk(child)
        return found

    return set(walk(((state_json.get("values") or {}).get("root_module")) or {}))


def record_text(
    root: str,
    date: str,
    stamp: dict,
    now: str,
    outcome: str,
    terraform: str,
    rows,
    kept,
) -> str:
    lines = [
        f"# Apply: {root}, {date}",
        "",
        "| Field | Value |",
        "|---|---|",
        f"| Root | {root} |",
        f"| Commit | {stamp['commit']} (main) |",
        f"| Plan | sha256 {stamp['sha256']}, tree {stamp['tree']} (the block in {stamp['note']}) |",
        "| Applied by | the Author, from the Author's terminal |",
        f"| Started, finished | {stamp['verified_at']}, {now} |",
        f"| Outcome | {outcome} |",
        f"| Terraform | {terraform} |",
        "",
        "Started is when make infra-verify passed, just before the apply; finished, when make infra-record ran.",
        "",
        "## Resources changed",
        "",
        "| Address | Action |",
        "|---|---|",
        *[f"| {address} | {action} |" for address, action in rows],
    ]
    if not rows:
        lines.append("| (none) | no change |")
    if kept is not None:
        lines += [
            "",
            "## What the state holds of the plan",
            "",
            "Of the addresses the plan named, the ones the state holds after the failed apply.",
            "",
            "| Address |",
            "|---|",
            *[f"| {address} |" for address in sorted(kept)],
        ]
        if not kept:
            lines.append("| (none) |")
    return "\n".join(lines) + "\n"


def free_name(repo: Path, root: str, date: str) -> tuple[str, str]:
    n = 1
    while True:
        suffix = "" if n == 1 else f"-{n}"
        rel = f"docs/infra/applies/{date}{suffix}-{root}.md"
        branch = f"ops/apply-{root}-{date}{suffix}"
        taken_path = c.git(
            repo, "ls-tree", "--name-only", "refs/heads/main", "--", rel
        ).strip()
        taken_branch = c.git(
            repo, "for-each-ref", "--format=%(refname)", f"refs/heads/{branch}"
        ).strip()
        if not taken_path and not taken_branch:
            return rel, branch
        n += 1


def commit_record(repo: Path, rel: str, branch: str, text: str, message: str) -> str:
    """A commit on refs/heads/main with the record added, on a new branch; the checkout and its index stay as they are."""
    main = c.git(repo, "rev-parse", "--verify", "refs/heads/main^{commit}").strip()
    blob = c.git(repo, "hash-object", "-w", "--stdin", stdin=text).strip()
    with tempfile.TemporaryDirectory(prefix="infra-record-") as tmp:
        env = {**os.environ, "GIT_INDEX_FILE": str(Path(tmp) / "index")}
        c.git(repo, "read-tree", main, env=env)
        c.git(
            repo,
            "update-index",
            "--add",
            "--cacheinfo",
            f"100644,{blob},{rel}",
            env=env,
        )
        tree = c.git(repo, "write-tree", env=env).strip()
    commit = c.git(repo, "commit-tree", tree, "-p", main, "-m", message).strip()
    c.git(repo, "update-ref", f"refs/heads/{branch}", commit, ZERO)
    return commit


def run(
    root: str, outcome: str, exit_status: str | None, profile: str | None, now: str
) -> int:
    repo, home = c.REPO, Path.home()
    try:
        redact = c.load_gate(repo, "infra_redact")
    except FileNotFoundError as exc:
        c.say(PROG, f"PLANNED (T010): {exc} arrives with the guard patch, P-1")
        return 2
    head = (
        c.git(repo, "symbolic-ref", "-q", "HEAD").strip()
        if (repo / ".git").exists()
        else ""
    )
    if head != "refs/heads/main":
        c.say(PROG, "can't run: the checkout isn't on main, where the apply ran")
        return 2
    tree = c.git(repo, "rev-parse", "HEAD:infra").strip()
    plan = c.plan_path(home, root, tree)
    stamp_file = c.stamp_path(plan)
    if not plan.is_file() or not stamp_file.is_file():
        c.say(
            PROG,
            f"can't run: no verified plan for {root} at this tree; make infra-verify ROOT={root} comes first",
        )
        return 2
    stamp = json.loads(stamp_file.read_text(encoding="utf-8"))
    if (
        stamp.get("sha256") != c.sha256_file(plan)
        or stamp.get("tree") != tree
        or stamp.get("root") != root
    ):
        c.say(
            PROG, "can't run: the saved plan isn't the one make infra-verify verified"
        )
        return 2
    env = c.terraform_env(home, root, AWS_PROFILE=profile)
    shown = c.terraform(repo, root, ["show", "-json", str(plan)], env)
    if shown.returncode != 0:
        c.say(
            PROG,
            f"terraform show couldn't read the saved plan (exit {shown.returncode})",
        )
        return 1
    plan_json = json.loads(shown.stdout)
    rows = changes(plan_json)
    kept = None
    if outcome == "failed":
        state = c.terraform(repo, root, ["show", "-json"], env)
        if state.returncode != 0:
            c.say(
                PROG,
                f"terraform show couldn't read the state (exit {state.returncode})",
            )
            return 1
        kept = held(json.loads(state.stdout or "{}")) & {address for address, _ in rows}
        outcome = f"failed: terraform exited {exit_status}"
    # Only the addresses come from the plan, so only they pass the redaction: the record's own hashes are hex, and a
    # 64-character one holds an exact 12-digit run often enough that redacting the whole text would garble it.
    try:
        rows = [(redact.redact(address), action) for address, action in rows]
        kept = None if kept is None else {redact.redact(address) for address in kept}
    except redact.Refused as exc:
        c.say(
            PROG,
            f"refused, no record written: {exc}; the plan's addresses hold a secret pattern",
        )
        return 3
    date = now[:10]
    rel, branch = free_name(repo, root, date)
    text = record_text(
        root,
        date,
        stamp,
        now,
        outcome,
        str(plan_json.get("terraform_version") or "?"),
        rows,
        kept,
    )
    commit = commit_record(
        repo, rel, branch, text, f"ops: apply {root} at {stamp['commit'][:12]}"
    )
    print(f"infra-record: {rel}, on {branch} ({commit[:12]}), from main")
    print(f"next: tools/gates/gate {branch}, then the merge line it prints")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="infra_record.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument("--root", required=True)
    parser.add_argument("--outcome", required=True)
    parser.add_argument("--exit-status")
    parser.add_argument("--profile")
    parser.add_argument(
        "--now", help="the finish time, UTC (for a record written late, and for tests)"
    )
    args = parser.parse_args(argv)
    if c.in_sandbox():
        c.say(
            PROG,
            "this is the Author's: it records his apply and commits it on a branch of his",
        )
        return 2
    if args.root not in c.ROOTS:
        c.say(PROG, f"ROOT must be one of {', '.join(c.ROOTS)}")
        return 2
    if args.outcome not in ("ok", "failed"):
        c.say(PROG, "OUTCOME must be ok or failed")
        return 2
    if args.outcome == "failed" and not (args.exit_status or "").isdigit():
        c.say(PROG, "OUTCOME=failed needs EXIT_STATUS=<terraform's exit status>")
        return 2
    now = args.now or c.utc_now()
    if not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", now):
        c.say(PROG, "--now takes a UTC time, 2026-11-11T09:30:00Z")
        return 2
    try:
        return run(args.root, args.outcome, args.exit_status, args.profile, now)
    except (c.GitError, c.Refusal, OSError, ValueError) as exc:
        c.say(PROG, f"can't run: {getattr(exc, 'reason', exc.__class__.__name__)}")
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
