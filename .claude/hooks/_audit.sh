#!/usr/bin/env bash
# Shared helper: append one audit line. Sourced by the other hooks.
# Log lives outside git (.claude/audit/ is gitignored); CI uploads it as an artifact.
audit() {
  local decision="$1" event="$2" detail="$3"
  local dir="${CLAUDE_PROJECT_DIR:-.}/.claude/audit"
  mkdir -p "$dir"
  printf '%s\t%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$event" "$decision" "$detail" >> "$dir/hooks.log"
}
