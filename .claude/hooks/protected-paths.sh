#!/usr/bin/env bash
# PreToolUse(Edit|Write|MultiEdit): agents may not modify the enforcement layer, the constitution,
# the review policy, cost/edge/kill-switch configuration, or test files during a fix task.
set -euo pipefail
# shellcheck source=_audit.sh
source "$(dirname "$0")/_audit.sh"
# Fail closed: in Claude Code only exit 2 blocks, so a missing dependency or an unexpected
# error must become exit 2 — otherwise the gate silently disappears.
command -v jq >/dev/null 2>&1 || { echo "Blocked: .claude/hooks requires jq (install it); failing closed." >&2; exit 2; }
trap 'echo "Blocked: error in $(basename "$0"); failing closed." >&2; exit 2' ERR
path="$(jq -r '.tool_input.file_path // .tool_input.path // empty')"
[ -z "$path" ] && exit 0
root="${CLAUDE_PROJECT_DIR:-$PWD}"
# Match on the canonical path relative to the project. Resolving "..", ".", repeated slashes, and
# symlinks means specs/../.claude/settings.json, ./CLAUDE.md, or a symlink into .claude/ cannot slip
# past the patterns below. Needs GNU realpath; if it is missing or fails, the ERR trap fails closed.
case "$path" in /*) ;; *) path="$root/$path" ;; esac
rel="$(realpath -m --relative-to="$root" -- "$path")"

block() { audit BLOCK edit "$1 :: $rel"; echo "Blocked by .claude/hooks/protected-paths.sh — $1. These files change only through a human-authored change (agent-config evals run on it)." >&2; exit 2; }

case "$rel" in
  corpus/proposals/*) ;;  # agents propose corpus changes here; a human applies them
  .claude/*|CLAUDE.md|REVIEW.md|.specify/memory/constitution.md) block "protected governance path" ;;
  infra/*budget*|infra/*alert*|infra/*iam*|infra/*edge*|infra/*waf*|config/budgets*|config/kill-switch*) block "cost/edge/kill-switch configuration" ;;
  corpus/*) block "the corpus (claims about the Author are human-authored; write a proposal under corpus/proposals/)" ;;
  .github/workflows/*) block "CI workflow (a gate must not be edited by what it gates)" ;;
esac

if [ "${FIX_TASK:-0}" = "1" ]; then
  case "$rel" in
    *test*|*spec.ts|*spec.tsx|evals/*|redteam/*) block "test or eval file during a fix task" ;;
  esac
fi

audit ALLOW edit "$rel"
exit 0
