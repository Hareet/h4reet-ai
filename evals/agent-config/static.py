#!/usr/bin/env python3
"""The static tier of the agent-configuration evals (spec 000 FR-002, FR-006, FR-007, FR-011; plan §14).

Run through PY_HOST, `python3 -I -B -X pycache_prefix=/dev/null evals/agent-config/static.py` (`make evals`). Standard library only. It checks the governance
files as data, and never runs them:
  - CLAUDE.md has at most 60 lines and 6 KB (FR-006);
  - CLAUDE.md and REVIEW.md name the constitution as superseding them (FR-002);
  - each .claude/agents/<role>.md has a tools: line in its frontmatter, equal to tools/gates/roles.expected (FR-006);
  - the hooks are registered in .claude/settings.json;
  - every FR-007 variable is denied by name in the sandbox's credentials.envVars.

A check whose enforcement a patch hasn't applied yet prints PLANNED, naming the task that writes the patch, and
doesn't fail (plan §11). Once the enforcement is there, its PLANNED entry is stale and fails, so the entries are
removed as the patch lands (tasks.md T046), and a later regression can't hide behind one.
Exit codes: 0 every check passed or is planned, 1 a check failed.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CLAUDE_MD_MAX_LINES = 60
CLAUDE_MD_MAX_BYTES = 6 * 1024
SUPERSEDES = "`.specify/memory/constitution.md` supersedes"

# The hooks .claude/settings.json must register: (event, matcher, script).
HOOKS = [
    ("PreToolUse", "Bash", ".claude/hooks/bash-gate.sh"),
    (
        "PreToolUse",
        "Edit|Write|MultiEdit|NotebookEdit",
        ".claude/hooks/protected-paths.sh",
    ),
    ("PostToolUse", "Edit|Write|MultiEdit", ".claude/hooks/post-edit-check.sh"),
    ("SubagentStop", "", ".claude/hooks/subagent-report-check.sh"),
    ("PreToolUse", "Edit|Write|MultiEdit", ".claude/hooks/content-scan.sh"),
]

# Every secret variable spec 000 introduces, as contracts/env-files.md §8 lists them (FR-007).
FR007_VARIABLES = [
    "H4_OPERATOR_TOKEN",
    "TELEGRAM_BOT_TOKEN",
    "SMTP_PASSWORD",
    "SMTP_USER",
    "GATEWAY_DB_PASSWORD",
    "GATEWAY_GRAFANA_RO_PASSWORD",
    "LANGFUSE_SECRET_KEY",
    "LANGFUSE_PUBLIC_KEY",
    "LANGFUSE_SALT",
    "LANGFUSE_ENCRYPTION_KEY",
    "LANGFUSE_NEXTAUTH_SECRET",
    "LANGFUSE_DB_PASSWORD",
    "LANGFUSE_INIT_USER_PASSWORD",
    "CLICKHOUSE_PASSWORD",
    "VALKEY_PASSWORD",
    "SEAWEEDFS_S3_SECRET_KEY",
    "GF_SECURITY_ADMIN_PASSWORD",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_PROFILE",
    "AWS_CONFIG_FILE",
    "AWS_SHARED_CREDENTIALS_FILE",
    "AWS_WEB_IDENTITY_TOKEN_FILE",
    "AWS_ROLE_ARN",
    "AWS_CONTAINER_CREDENTIALS_FULL_URI",
    "AWS_CONTAINER_AUTHORIZATION_TOKEN",
    # Spec 010 (FR-030, FR-032; contracts/env-files.md §8): the Anthropic API key, under prod's name. The name its
    # SDK reads on its own, ANTHROPIC_API_KEY, is denied by name too, but it isn't on this list: the canary and the
    # behavioral tier put a fake value for every name here into a Claude Code session, and that name would sign the
    # session in with the fake. Both strip it instead (STRIPPED), and the matrix checks its deny on a row of its own.
    "GATEWAY_ANTHROPIC_API_KEY",
]

# The FR-007 variables the settings denied before spec 000; the early patch (T045) denies the rest.
DENIED_BEFORE_SPEC_000 = {
    "TELEGRAM_BOT_TOKEN",
    "LANGFUSE_SECRET_KEY",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
}

# Enforcement a patch hasn't applied yet: the item, and the task that writes the patch (tasks.md). The early patch
# (T045) added the content-scan hook and every FR-007 deny, and deleted its entries here. A new entry names the task
# whose patch adds the enforcement; left behind once it lands, it fails as stale.
PLANNED: dict[str, str] = {}


class Report:
    def __init__(self) -> None:
        self.failed = 0
        self.planned: dict[str, list[str]] = {}

    def ok(self, what: str) -> None:
        print(f"PASS  {what}")

    def fail(self, what: str) -> None:
        self.failed += 1
        print(f"FAIL  {what}")

    def info(self, what: str) -> None:
        print(f"      {what}")

    def present(self, item: str, what: str | None = None) -> None:
        """Enforcement that is there. A PLANNED entry for it is stale, and fails until it's deleted."""
        if item in PLANNED:
            self.fail(
                f"stale PLANNED mark: {item} is enforced now, so delete its PLANNED entry (tasks.md T046)"
            )
        elif what:
            self.ok(what)

    def missing(self, item: str, what: str) -> None:
        """Enforcement that isn't there: PLANNED if a patch is due to add it, otherwise a failure."""
        task = PLANNED.get(item)
        if task:
            self.planned.setdefault(task, []).append(item)
        else:
            self.fail(what)


def check_claude_md(report: Report, repo: Path) -> None:
    data = (repo / "CLAUDE.md").read_bytes()
    lines = data.decode("utf-8").count("\n")
    if lines <= CLAUDE_MD_MAX_LINES and len(data) <= CLAUDE_MD_MAX_BYTES:
        report.ok(
            f"CLAUDE.md is {lines} lines and {len(data)} bytes (at most {CLAUDE_MD_MAX_LINES} and 6 KB)"
        )
    else:
        report.fail(
            f"CLAUDE.md is {lines} lines and {len(data)} bytes; the limits are {CLAUDE_MD_MAX_LINES} and 6 KB"
        )


def check_supersedes(report: Report, repo: Path) -> None:
    for name in ("CLAUDE.md", "REVIEW.md"):
        if SUPERSEDES in (repo / name).read_text(encoding="utf-8"):
            report.ok(f"{name} names the constitution as superseding it")
        else:
            report.fail(f"{name} must say: {SUPERSEDES} this file")


def read_roles(path: Path) -> dict[str, str]:
    roles = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#"):
            role, _, tools = line.partition(":")
            roles[role.strip()] = tools.strip()
    return roles


def frontmatter_tools(text: str) -> str:
    """The tools: value in the frontmatter, the --- block that opens the file; "" when there is none.

    Claude Code reads a role's tools only from there. A tools: line anywhere else in the file grants nothing, and a
    role without one gets every tool.
    """
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return ""
    for line in lines[1:]:
        if line.strip() == "---":
            return ""
        found = re.match(r"tools:\s*(.*)$", line)
        if found:
            return found.group(1).strip()
    return ""


def check_roles(report: Report, repo: Path) -> None:
    expected = read_roles(repo / "tools" / "gates" / "roles.expected")
    found = {
        agent.stem: frontmatter_tools(agent.read_text(encoding="utf-8"))
        for agent in sorted((repo / ".claude" / "agents").glob("*.md"))
    }
    for role in sorted(set(expected) | set(found)):
        if role in found and not found[role]:
            report.fail(
                f"role {role}: no tools: line in .claude/agents/{role}.md's frontmatter, so it would get every tool"
            )
        elif role in expected and not expected[role]:
            report.fail(
                f"role {role}: tools/gates/roles.expected lists no tools for it"
            )
        elif role not in found:
            report.fail(
                f"role {role}: in roles.expected but no .claude/agents/{role}.md"
            )
        elif role not in expected:
            report.fail(
                f"role {role}: .claude/agents/{role}.md has no line in tools/gates/roles.expected"
            )
        elif found[role] != expected[role]:
            report.fail(
                f"role {role}: tools are {found[role]!r}; roles.expected says {expected[role]!r}"
            )
        else:
            report.ok(f"role {role}: tools match roles.expected")


def registered_hooks(settings: dict) -> set[tuple[str, str, str]]:
    found = set()
    for event, groups in (settings.get("hooks") or {}).items():
        for group in groups or []:
            for hook in group.get("hooks") or []:
                command = str(hook.get("command", "")).replace(
                    "${CLAUDE_PROJECT_DIR}/", ""
                )
                found.add((event, group.get("matcher", ""), command))
    return found


def check_hooks(report: Report, settings: dict) -> None:
    found = registered_hooks(settings)
    for event, matcher, script in HOOKS:
        if (event, matcher, script) in found:
            report.present(
                f"hook {script}",
                f"hook {script} is registered for {event} {matcher or '(every subagent)'}",
            )
        else:
            report.missing(
                f"hook {script}",
                f"hook {script} isn't registered for {event} {matcher!r}",
            )


def check_fr007(report: Report, settings: dict) -> None:
    credentials = (settings.get("sandbox") or {}).get("credentials") or {}
    denied = {
        e.get("name")
        for e in credentials.get("envVars") or []
        if e.get("mode") == "deny"
    }
    present = [name for name in FR007_VARIABLES if name in denied]
    for name in FR007_VARIABLES:
        if name in denied:
            report.present(f"variable {name}")
        else:
            report.missing(
                f"variable {name}",
                f"FR-007: {name} isn't denied by name in credentials.envVars",
            )
    count = f"FR-007: {len(present)} of {len(FR007_VARIABLES)} variables denied by name"
    if len(present) == len(FR007_VARIABLES):
        report.ok(count)
    else:
        report.info(count)


def main(repo: Path = REPO) -> int:
    report = Report()
    check_claude_md(report, repo)
    check_supersedes(report, repo)
    check_roles(report, repo)
    settings = json.loads(
        (repo / ".claude" / "settings.json").read_text(encoding="utf-8")
    )
    check_hooks(report, settings)
    check_fr007(report, settings)
    for task, items in sorted(report.planned.items()):
        variables = [
            i.removeprefix("variable ") for i in items if i.startswith("variable ")
        ]
        others = [i for i in items if not i.startswith("variable ")]
        parts = ([f"{len(variables)} FR-007 variables"] if variables else []) + others
        print(f"PLANNED ({task}): {', '.join(parts)} wait for the patch")
        if variables:
            print(f"  waiting: {' '.join(variables)}")
    print(
        f"agent-config static: {report.failed} failed, {sum(map(len, report.planned.values()))} planned"
    )
    return 1 if report.failed else 0


if __name__ == "__main__":
    sys.exit(main())
