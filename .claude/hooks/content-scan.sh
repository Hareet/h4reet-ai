#!/usr/bin/env bash
# PreToolUse(Edit|Write|MultiEdit): gitleaks over the text an edit would add, before it lands (spec 000 FR-008 and
# FR-012; plan §11; research.md R-36). Exit 2 blocks the edit and returns the reason to Claude. Exit 0 allows.
# The text goes into a fresh directory under its own path relative to its work tree, so the config's path allowlist
# (dev-cpu.vars' public dummies) applies there and nowhere else. gitleaks runs in that directory with the main working
# tree's .gitleaks.toml, an empty ignore path, and --ignore-gitleaks-allow, so nothing an agent writes can switch a rule
# off. A .gitleaksignore can't be written through this hook at all. Findings name the rule and the line, never the
# match. Without gitleaks or the config, the hook blocks: it fails closed.
set -Eeuo pipefail
trap 'echo "Blocked: error in $(basename "$0"); failing closed." >&2; exit 2' ERR
# shellcheck source=_audit.sh
source "$(dirname "$0")/_audit.sh" || { echo "Blocked: $(basename "$0") cannot load _audit.sh; failing closed." >&2; exit 2; }
command -v jq >/dev/null 2>&1 || { echo "Blocked: .claude/hooks requires jq (install it); failing closed." >&2; exit 2; }
root="${CLAUDE_PROJECT_DIR:-$PWD}"
input="$(cat)"
path="$(jq -r '.tool_input.file_path // empty' <<<"$input")"

block() { audit BLOCK content "$1 :: ${path:-?}" || true; echo "Blocked by .claude/hooks/content-scan.sh — $1. Route: $2" >&2; exit 2; }

# An ignore list switches findings off wherever gitleaks finds one at a scan's source (research.md R-36).
[ "$(basename -- "${path:-x}")" = ".gitleaksignore" ] \
  && block "writing a .gitleaksignore, which would switch gitleaks findings off" "only the Author writes ignore entries, in .gitleaks.toml"

# The text the edit adds: Write's content, Edit's new_string, and every new_string of a MultiEdit.
text="$(jq -r '[.tool_input.content // empty, .tool_input.new_string // empty, ((.tool_input.edits // [])[] | .new_string // empty)] | join("\n")' <<<"$input")"
[ -z "$text" ] && { audit ALLOW content "${path:-?} (no text)" || true; exit 0; }

gitleaks_bin="$(command -v gitleaks || true)"
[ -n "$gitleaks_bin" ] || block "gitleaks isn't installed, so no edit can be checked for secrets" "the Author runs make tools"
# The main working tree's config, as the pre-commit hook takes it: a linked worktree's own .gitleaks.toml, which an
# agent working there could rewrite, never applies.
common="$(git -C "$root" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
[ -n "$common" ] || block "the project isn't in a git repository, so the main tree's .gitleaks.toml can't be found" "run Claude Code from the repository"
config="$(dirname -- "$common")/.gitleaks.toml"
[ -f "$config" ] || block "no .gitleaks.toml in the main working tree" "the early patch adds it (tasks.md T045)"

work="$(mktemp -d)" || block "mktemp failed" "free space on the temporary filesystem"
{ [ -n "$work" ] && [ -d "$work" ]; } || block "mktemp gave no directory" "free space on the temporary filesystem"
trap 'rm -rf -- "$work"' EXIT
mkdir -- "$work/scan" "$work/empty"

# The path relative to the edited file's own work tree (a linked worktree has its own), so the allowlist matches.
# A path outside any work tree is scanned under its base name.
dir="$(dirname -- "${path:-.}")"
while [ ! -d "$dir" ] && [ "$dir" != / ] && [ "$dir" != . ]; do dir="$(dirname -- "$dir")"; done
tree="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null || true)"
rel="${path#"${tree:-$root}"/}"
case "$rel" in
  "" | /* | .. | ../* | */../* | */..) rel="outside/$(basename -- "${path:-edit}")" ;;
esac
mkdir -p -- "$work/scan/$(dirname -- "$rel")"
printf '%s\n' "$text" >"$work/scan/$rel"

rc=0
(cd "$work/scan" && "$gitleaks_bin" dir . --no-banner --redact --config "$config" --gitleaks-ignore-path "$work/empty" \
  --ignore-gitleaks-allow --report-format json --report-path "$work/report.json" >/dev/null 2>&1) || rc=$?
case "$rc" in
  0) audit ALLOW content "$rel" || true; exit 0 ;;
  1)
    rules="$(jq -r '[.[] | "\(.RuleID) at line \(.StartLine)"] | unique | join(", ")' "$work/report.json" 2>/dev/null || true)"
    block "the text would add something shaped like a secret (${rules:-a gitleaks rule})" \
      "keep secrets out of the repository: use a placeholder, or build test values at run time"
    ;;
  *) block "gitleaks failed with exit $rc" "check it with make toolchain-check" ;;
esac
