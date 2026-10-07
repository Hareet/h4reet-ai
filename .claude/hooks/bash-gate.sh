#!/usr/bin/env bash
# PreToolUse(Bash): deterministic gate behind the constitution's prohibitions.
# Exit 2 blocks the command and returns stderr to Claude. Exit 0 allows.
# Belt and braces: permissions.deny in settings.json catches the obvious forms;
# this catches variants (chained commands, aliases, scripts) and writes the audit record.
set -euo pipefail
# shellcheck source=_audit.sh
source "$(dirname "$0")/_audit.sh"
# Fail closed: in Claude Code only exit 2 blocks, so a missing dependency or an unexpected
# error must become exit 2 — otherwise the gate silently disappears.
command -v jq >/dev/null 2>&1 || { echo "Blocked: .claude/hooks requires jq (install it); failing closed." >&2; exit 2; }
trap 'echo "Blocked: error in $(basename "$0"); failing closed." >&2; exit 2' ERR
cmd="$(jq -r '.tool_input.command // empty')"
[ -z "$cmd" ] && exit 0

block() { audit BLOCK bash "$1 :: $cmd"; echo "Blocked by .claude/hooks/bash-gate.sh — $1. Route: $2" >&2; exit 2; }

# Infrastructure mutation is a human action in the protected CI environment.
echo "$cmd" | grep -Eq '(^|[;&| ])terraform +(apply|destroy|import|state +(rm|mv|push))' \
  && block "terraform mutation" "commit the change on your feature branch; apply runs in the protected environment after the Author approves"
# No agent path to main, ever.
echo "$cmd" | grep -Eq 'git +push[^;&|]*(--force|-f\b|\+refs|origin +main|origin +HEAD:main)' \
  && block "push to main or force-push" "commit on your feature branch; the Author merges"
echo "$cmd" | grep -Eq '(^|[;&| ])gh +pr +merge' && block "PR merge" "only the Author merges"
# Local until publication (ADR 0013): only the Author creates a remote or a GitHub repository.
echo "$cmd" | grep -Eq '(^|[;&| ])(gh +repo +(create|fork)|git +remote +(add|set-url))' \
  && block "creating a remote or a GitHub repository" "development stays local until the Author publishes (ADR 0013)"
# Cloud control surfaces the agent may not touch.
echo "$cmd" | grep -Eq '(^|[;&| ])aws +(iam|budgets|ce|wafv2|waf|cloudfront +update|ssm +put-parameter[^;&|]*kill-switch)' \
  && block "IAM/budget/edge/kill-switch mutation" "write an ADR and a spec; the Author applies"
# Destructive filesystem operations outside the workspace.
# The pattern matches a literal "$HOME" in the command text, so the single quotes are intended.
# shellcheck disable=SC2016
echo "$cmd" | grep -Eq '(^|[;&| ])rm +-[a-zA-Z]*r[a-zA-Z]* +(/|~|\$HOME|\.\.)' \
  && block "recursive delete outside workspace" "delete only inside the repo"
# Arbitrary egress. The sandbox enforces the domain allowlist at the OS level; this adds the audit trail.
echo "$cmd" | grep -Eq '(^|[;&| ])(curl|wget|nc|ncat|ssh|scp) ' \
  && block "network egress tool" "package installs go through the toolchain; fetching docs is a human step"
# Fix tasks: the check on the code may not be weakened.
if [ "${FIX_TASK:-0}" = "1" ] && echo "$cmd" | grep -Eq '(rm|mv|sed +-i|truncate|>).*(test|spec)\.(ts|tsx|py|js)'; then
  block "test-file modification during a fix task" "fix the code, not the test"
fi

audit ALLOW bash "$cmd"
exit 0
