#!/usr/bin/env bash
# PreToolUse(Bash): deterministic gate behind the constitution's prohibitions.
# Exit 2 blocks the command and returns stderr to Claude. Exit 0 allows.
# Belt and braces: permissions.deny in settings.json catches the obvious forms;
# this catches variants (chained commands, aliases, scripts) and writes the audit record.
set -Eeuo pipefail
# Fail closed: in Claude Code only exit 2 blocks, so a missing dependency or an unexpected
# error must become exit 2 — otherwise the gate silently disappears. -E carries the trap into
# functions and command substitutions, and the trap is set before anything else can fail.
trap 'echo "Blocked: error in $(basename "$0"); failing closed." >&2; exit 2' ERR
# shellcheck source=_audit.sh
source "$(dirname "$0")/_audit.sh" || { echo "Blocked: $(basename "$0") cannot load _audit.sh; failing closed." >&2; exit 2; }
command -v jq >/dev/null 2>&1 || { echo "Blocked: .claude/hooks requires jq (install it); failing closed." >&2; exit 2; }
cmd="$(jq -r '.tool_input.command // empty')"
[ -z "$cmd" ] && exit 0
root="${CLAUDE_PROJECT_DIR:-$PWD}"

# The block still happens when the audit record cannot be written.
block() { audit BLOCK bash "$1 :: $cmd" || true; echo "Blocked by .claude/hooks/bash-gate.sh — $1. Route: $2" >&2; exit 2; }

# Infrastructure mutation is a human action in the protected CI environment.
echo "$cmd" | grep -Eq '(^|[;&| ])terraform +(apply|destroy|import|state +(rm|mv|push))' \
  && block "terraform mutation" "commit the change on your feature branch; apply runs in the protected environment after the Author approves"
# No agent path to main, ever.
echo "$cmd" | grep -Eq 'git +push[^;&|]*(--force|-f\b|\+refs|origin +main|origin +HEAD:main)' \
  && block "push to main or force-push" "commit on your feature branch; the Author merges"
echo "$cmd" | grep -Eq '(^|[;&| ])gh +pr +merge' && block "PR merge" "only the Author merges"

# Local until publication (ADR 0013): agents never push, never create or change a remote or a
# repository, and never move main; the Author merges feature branches locally. A git subcommand
# matches after git's global options (git -C dir, git -c k=v, --no-pager), with or without quotes,
# and inside any wrapper, such as a subshell or bash -c, but `git stash push` is not `git push`.
git_cmd="\\bgit[\"']?([[:space:]]+(-[Cc][[:space:]]+[^[:space:]]+|-[^[:space:]]+))*[[:space:]]+[\"']?"
main_ref="[\"']?(refs/heads/)?main[\"']?([^[:alnum:]_./-]|\$)"
local_route="development stays local until the Author publishes (ADR 0013)"
main_route="work on a feature branch (git switch -c <branch>); only the Author changes main"
echo "$cmd" | grep -Eq "${git_cmd}push\b" && block "git push" "$local_route"
echo "$cmd" | grep -Eq "${git_cmd}(remote[[:space:]]+(add|set-url)\b|config\b[^;&|]*[[:space:]]remote\.)" \
  && block "creating or changing a remote" "$local_route"
echo "$cmd" | grep -Eq '\bgh([[:space:]]+-[^[:space:]]+)*[[:space:]]+repo[[:space:]]+(create|fork)\b|\bgh\b[^;&|]*[[:space:]]api\b[^;&|]*\b(user|orgs/[^/[:space:]]+)/repos\b' \
  && block "creating a GitHub repository" "$local_route"
echo "$cmd" | grep -Eq "${git_cmd}(switch|checkout)[[:space:]]+(-[^[:space:]]+[[:space:]]+)*${main_ref}" \
  && block "switching to main" "$main_route"
echo "$cmd" | grep -Eq "${git_cmd}(update-ref\b[^;&|]*[[:space:]]|fetch\b[^;&|]*:)${main_ref}" \
  && block "moving main" "$main_route"
if echo "$cmd" | grep -Eq "${git_cmd}branch\b[^;&|]*[[:space:]](-[a-zA-Z]*[fdDmMcC]|--force|--delete|--move|--copy)\b" \
  && echo "$cmd" | grep -Eq "(^|[^[:alnum:]_./-])${main_ref}"; then
  block "moving or deleting main" "$main_route"
fi
echo "$cmd" | grep -Eq "${git_cmd}symbolic-ref\b[^;&|]*[[:space:]]${main_ref}" \
  && block "pointing HEAD at main" "$main_route"
echo "$cmd" | grep -Eq "${git_cmd}rebase([[:space:]]+-[^[:space:]]+)*[[:space:]]+[^-[:space:]][^[:space:]]*[[:space:]]+${main_ref}" \
  && block "rebasing main" "$main_route"
echo "$cmd" | grep -Eq "${git_cmd}worktree[[:space:]]+add([[:space:]]+-[^bB[:space:]][^[:space:]]*)*[[:space:]]+[^-[:space:]][^[:space:]]*[[:space:]]+${main_ref}" \
  && block "checking out main in a worktree" "$main_route"
echo "$cmd" | grep -Eq "${git_cmd}(filter-branch|filter-repo)\b" \
  && block "rewriting history" "only the Author rewrites history (ADR 0013 allows one pre-publication cleanup)"
# An alias can stand in for any subcommand, so agents don't define them.
echo "$cmd" | grep -Eq '\bgit\b[^;&|]*(-c[[:space:]]*|[[:space:]]config\b[^;&|]*[[:space:]])alias\.' \
  && block "defining a git alias" "$local_route"
echo "$cmd" | grep -Eq '\bgh\b[^;&|]*[[:space:]]api\b.*createRepository' \
  && block "creating a GitHub repository" "$local_route"
# Git internals change through git, never by writing the files directly. The backtick in the
# pattern is a literal (a command started inside backticks), not an expansion.
# shellcheck disable=SC2016
echo "$cmd" | grep -Eq '(>|(^|[;&|(`[:space:]])(tee|cp|mv|ln|install|truncate|rm|sed[[:space:]]+-i)[[:space:]])[^;&|]*\.git/(config|HEAD|refs/|hooks/|packed-refs|info/)' \
  && block "writing git internals" "$main_route"
head="$(git -C "$root" symbolic-ref --short -q HEAD 2>/dev/null || true)"
if [ "$head" = "main" ] && echo "$cmd" | grep -Eq "${git_cmd}(commit|merge|cherry-pick|revert|rebase|am|pull|reset|update-ref)\b"; then
  block "changing main (HEAD is main)" "$main_route"
fi
previous="$(git -C "$root" rev-parse --symbolic-full-name '@{-1}' 2>/dev/null || true)"
if [ "$previous" = "refs/heads/main" ] && echo "$cmd" | grep -Eq "${git_cmd}(switch|checkout)[[:space:]]+-([[:space:]]|\$)"; then
  block "switching back to main" "$main_route"
fi

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
# Fix tasks: the check on the code may not be weakened. Mirrors protected-paths.sh: any path with
# "test" in it, *.spec.*, evals/, and redteam/, written by rm, mv, cp, tee, sed -i, truncate, or ">".
# The write must be a command of its own, so `docker compose run --rm … pytest` still runs.
# The backtick in the pattern is a literal (a command started inside backticks), not an expansion.
# shellcheck disable=SC2016
if [ "${FIX_TASK:-0}" = "1" ] \
  && echo "$cmd" | grep -Eq '((^|[;&|(`[:space:]])(rm|mv|cp|tee|truncate)[[:space:]]|(^|[;&|(`[:space:]])sed[[:space:]]+-i|>)[^;&|]*(test|\.spec\.|evals/|redteam/)'; then
  block "test-file modification during a fix task" "fix the code, not the test"
fi

audit ALLOW bash "$cmd"
exit 0
