#!/usr/bin/env bash
# PostToolUse(Edit|Write|MultiEdit): keep drift from accumulating. Fast, scoped to the changed file.
# Exit 2 surfaces the lint output to Claude (the edit already happened; this is feedback, not a block).
set -uo pipefail
# shellcheck source=_audit.sh
source "$(dirname "$0")/_audit.sh"
path="$(jq -r '.tool_input.file_path // .tool_input.path // empty')"
[ -z "$path" ] && exit 0
[ -f "$path" ] || exit 0
out="$(make -s fmt-file lint-file FILE="$path" 2>&1)"; rc=$?
if [ $rc -ne 0 ]; then
  audit WARN post-edit "lint failed :: ${path#"${CLAUDE_PROJECT_DIR:-$PWD}"/}"
  printf 'Lint/format problems in %s:\n%s\nFix them before reporting done.\n' "$path" "$out" >&2
  exit 2
fi
exit 0
