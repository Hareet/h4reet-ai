#!/usr/bin/env bash
# PreToolUse(Edit|Write|MultiEdit|NotebookEdit): agents may not modify the enforcement layer, the constitution,
# the review policy, git internals, cost/edge/kill-switch configuration, the asset policy, the studio's folders (its
# photos, outputs, workflows, and blinding key), or test files during a fix task.
set -Eeuo pipefail
# Fail closed: in Claude Code only exit 2 blocks, so a missing dependency or an unexpected
# error must become exit 2 — otherwise the gate silently disappears. -E carries the trap into
# functions and command substitutions, and the trap is set before anything else can fail.
trap 'echo "Blocked: error in $(basename "$0"); failing closed." >&2; exit 2' ERR
# shellcheck source=_audit.sh
source "$(dirname "$0")/_audit.sh" || { echo "Blocked: $(basename "$0") cannot load _audit.sh; failing closed." >&2; exit 2; }
command -v jq >/dev/null 2>&1 || { echo "Blocked: .claude/hooks requires jq (install it); failing closed." >&2; exit 2; }
input="$(cat)"
path="$(jq -r '.tool_input.file_path // .tool_input.notebook_path // .tool_input.path // empty' <<<"$input")"
[ -z "$path" ] && exit 0
root="${CLAUDE_PROJECT_DIR:-$PWD}"
# The calling subagent, from the hook input; both are empty in the main session (the closing patch, plan §15).
agent_type="$(jq -r '.agent_type // empty' <<<"$input")"
agent_id="$(jq -r '.agent_id // empty' <<<"$input")"

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
    assets/policy/content-approvals.json | assets/policy/resume-header.json) block "the room's content approvals or the PDF's header, which only the Author changes, on main (spec 002, contracts/resume-source.md §5)" ;;
    GNUmakefile | makefile) block "a makefile that make would run instead of the Makefile" ;;
    deploy/agents-engine | deploy/agents-engine/*) block "the agents' engine (the FR-039 boundary; parts of it run with sudo)" ;;
    .gitleaks* | */.gitleaksignore) block "the secret scanner's rules or an ignore list (research.md R-36)" ;;
    .mcp.json | */.mcp.json) block "MCP server configuration (it gives every session new tools)" ;;
    tools/gates | tools/gates/* | evals/agent-config | evals/agent-config/*) block "the local gates or the agent-config evals (the gate runs in the Author's terminal, and the evals decide what merges; plan §15's governance patch)" ;;
    deploy/env/* | *.env) block "environment file (it holds secrets and selects what a stack runs; spec 000 FR-007)" ;;
    assets/policy | assets/policy/*) block "the asset policy: the license allowlist, the likeness approvals, and the caps, which only the Author changes (spec 003 FR-005)" ;;
  esac
  if [ "${FIX_TASK:-0}" = "1" ]; then
    case "$1" in
      *test* | *spec.ts | *spec.tsx | evals/* | redteam/*) block "test or eval file during a fix task" ;;
    esac
  fi
}
check "$lexical_rel"
check "$physical_rel"
# A linked worktree of this repository holds its own copy of every path above, which a session can commit and the Author
# can merge or start a session in. So a path inside one, by either resolution, is also checked relative to its root:
# the worktree git lists for this repository whose root is the longest prefix of the path.
tree_rel() {
  local best="" t
  while IFS= read -r -d '' t; do
    case "$t" in "worktree "/*) t="${t#worktree }" ;; *) continue ;; esac
    case "$1" in "$t" | "$t"/*) [ "${#t}" -le "${#best}" ] || best="$t" ;; esac
  done < <(git -C "$root" worktree list --porcelain -z 2>/dev/null || true)
  [ -z "$best" ] || realpath -m -s --relative-to="$best" -- "$1"
}
lexical_tree="$(tree_rel "$lexical")"
physical_tree="$(tree_rel "$(realpath -m -- "$path")")"
[ -z "$lexical_tree" ] || check "$lexical_tree"
[ -z "$physical_tree" ] || check "$physical_tree"
# The studio's folders (spec 003 FR-003; spec 004 FR-025, Amendment C3): no Edit or Write lands in one. The folders
# come from tools/gates/studio-folders.txt under the project, by name; a missing or unreadable list, or a name without
# an absolute path, blocks every edit, as any other error here does. An edit is refused when either resolution of its
# path, the lexical one or the physical one, is a folder or lies under it, each folder taken as the list writes it and
# resolved both ways, both sides case-folded, so a case variant is refused on any mount. No message names a folder or
# the path; the audit log records the attempt, as it records every block.
studio_list="$root/tools/gates/studio-folders.txt"
studio_closed="the studio's folder list, tools/gates/studio-folders.txt, is missing, unreadable, or without an absolute path for photos, outputs, workflows, or blinding-key, so every edit is refused until it is whole (spec 004 FR-025)"
{ [ -f "$studio_list" ] && [ -r "$studio_list" ]; } || block "$studio_closed"
# studio_field <name>: the path on the list's line for the name, trimmed, without a trailing slash; empty when none
studio_field() {
  local line rest
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line#"${line%%[![:space:]]*}"}"
    case "$line" in "$1"[[:space:]]*) ;; *) continue ;; esac
    rest="${line#"$1"}"
    rest="${rest#"${rest%%[![:space:]]*}"}"
    rest="${rest%"${rest##*[![:space:]]}"}"
    while [ "$rest" != "${rest%/}" ]; do rest="${rest%/}"; done
    printf '%s' "$rest"
    return 0
  done <"$studio_list"
  return 0
}
physical="$(realpath -m -- "$path")"
for studio_name in photos outputs workflows blinding-key; do
  studio_dir="$(studio_field "$studio_name")"
  case "$studio_dir" in /?*) ;; *) block "$studio_closed" ;; esac
  for studio_form in "$studio_dir" "$(realpath -m -s -- "$studio_dir")" "$(realpath -m -- "$studio_dir")"; do
    studio_form="${studio_form,,}"
    for edit_form in "${lexical,,}" "${physical,,}"; do
      case "$edit_form" in "$studio_form" | "$studio_form"/*) block "a studio folder (spec 003 FR-003; spec 004 FR-025, Amendment C3)" ;; esac
    done
  done
done
# Each role writes only where plan §13's role table says, from the hook input's agent_type: the path relative to the
# worktree holding it, or to the project. implementer writes code anywhere the checks above allow; reviewer and
# red-teamer write nothing; ops writes infrastructure, runbooks, and the intents its findings become (the constitution's
# closing the loop); a type .claude/agents/ doesn't define, a built-in agent among them, has no role scope, so only the
# checks above apply to it; and a subagent with an agent_id but no agent_type writes nothing.
scope() {
  case "$agent_type" in
    implementer) ;;
    spec-writer) case "$1" in specs/* | intent/*) ;; *) block "outside the spec-writer's write scope, specs/ and intent/" ;; esac ;;
    docs) case "$1" in docs/* | README.md) ;; *) block "outside the docs role's write scope, docs/ and README.md" ;; esac ;;
    ops) case "$1" in infra/* | deploy/* | docs/runbooks/* | intent/*) ;; *) block "outside the ops role's write scope, infra/, deploy/, docs/runbooks/, and intent/" ;; esac ;;
    reviewer | red-teamer) block "a write by the $agent_type role, which is read-only" ;;
    *) ;;
  esac
}
if [ -n "$agent_type" ]; then
  scope "${lexical_tree:-$lexical_rel}"
  scope "${physical_tree:-$physical_rel}"
elif [ -n "$agent_id" ]; then
  block "a write by a subagent with an agent_id but no agent_type"
fi

audit ALLOW edit "$physical_rel"
exit 0
