#!/usr/bin/env bash
# PreToolUse(Edit|Write|MultiEdit|NotebookEdit): agents may not modify the enforcement layer, the constitution,
# the review policy, git internals, cost/edge/kill-switch configuration, or test files during a fix task.
set -Eeuo pipefail
# Fail closed: in Claude Code only exit 2 blocks, so a missing dependency or an unexpected
# error must become exit 2 — otherwise the gate silently disappears. -E carries the trap into
# functions and command substitutions, and the trap is set before anything else can fail.
trap 'echo "Blocked: error in $(basename "$0"); failing closed." >&2; exit 2' ERR
# shellcheck source=_audit.sh
source "$(dirname "$0")/_audit.sh" || { echo "Blocked: $(basename "$0") cannot load _audit.sh; failing closed." >&2; exit 2; }
command -v jq >/dev/null 2>&1 || { echo "Blocked: .claude/hooks requires jq (install it); failing closed." >&2; exit 2; }
path="$(jq -r '.tool_input.file_path // .tool_input.notebook_path // .tool_input.path // empty')"
[ -z "$path" ] && exit 0
root="${CLAUDE_PROJECT_DIR:-$PWD}"

# The block still happens when the audit record cannot be written.
block() { audit BLOCK edit "$1 :: $path" || true; echo "Blocked by .claude/hooks/protected-paths.sh — $1. These files change only through a human-authored change (agent-config evals run on it)." >&2; exit 2; }

# Edit and Write take absolute paths. A relative or ~ path would resolve against a working
# directory this hook cannot see.
case "$path" in
  /*) ;;
  *) block "relative or ~ path; use an absolute file_path" ;;
esac
# The harness and the kernel may resolve a path differently: lexically (".." and "." removed,
# symlinks kept, as Node's path.resolve does) or physically (symlinks followed). Both resolutions
# are checked, and either one landing on a protected path blocks the edit. Needs GNU realpath; if it
# is missing or fails, the ERR trap fails closed.
lexical="$(realpath -m -s -- "$path")"
case "$lexical" in
  /proc | /proc/*) block "path under /proc" ;; # /proc/*/cwd and /proc/*/root can point anywhere
esac
lexical_rel="$(realpath -m -s --relative-to="$root" -- "$path")"
physical_rel="$(realpath -m --relative-to="$root" -- "$path")"
# A hard link is a second name for the same file, which neither resolution can see. -L follows a
# symlink to the file it names.
links=1
if [ -f "$path" ]; then links="$(stat -L -c %h -- "$path")"; fi
[ "$links" -gt 1 ] && block "hard-linked file"

check() {
  case "$1" in
    corpus/proposals/*) ;; # agents propose corpus changes here; a human applies them
    .claude/* | CLAUDE.md | REVIEW.md | .specify/memory/constitution.md) block "protected governance path" ;;
    .git | .git/*) block "git internals (refs, config, and hooks change through git, and main only by the Author)" ;;
    infra/*budget* | infra/*alert* | infra/*iam* | infra/*edge* | infra/*waf* | config/budgets* | config/alert* | config/kill-switch*) block "cost/alert/edge/kill-switch configuration" ;;
    corpus/*) block "the corpus (claims about the Author are human-authored; write a proposal under corpus/proposals/)" ;;
    .github/workflows/*) block "CI workflow (a gate must not be edited by what it gates)" ;;
    config/prices*) block "the price table (human-only, versioned, append-only; spec 000 FR-008)" ;;
    GNUmakefile | makefile) block "a makefile that make would run instead of the Makefile" ;;
    deploy/agents-engine | deploy/agents-engine/*) block "the agents' engine (the FR-039 boundary; parts of it run with sudo)" ;;
    .gitleaks* | */.gitleaksignore) block "the secret scanner's rules or an ignore list (research.md R-36)" ;;
    tools/gates | tools/gates/* | evals/agent-config | evals/agent-config/*) block "the local gates or the agent-config evals (the gate runs in the Author's terminal, and the evals decide what merges; plan §15's governance patch)" ;;
    deploy/env/* | *.env) block "environment file (it holds secrets and selects what a stack runs; spec 000 FR-007)" ;;
  esac
  if [ "${FIX_TASK:-0}" = "1" ]; then
    case "$1" in
      *test* | *spec.ts | *spec.tsx | evals/* | redteam/*) block "test or eval file during a fix task" ;;
    esac
  fi
}
check "$lexical_rel"
check "$physical_rel"

audit ALLOW edit "$physical_rel"
exit 0
