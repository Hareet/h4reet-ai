#!/usr/bin/env bash
# PostToolUse(Edit|Write|MultiEdit): keep drift from accumulating. Fast, scoped to the changed file.
# Exit 2 surfaces the lint output to Claude (the edit already happened; this is feedback, not a block).
# Hooks run outside the sandbox, so this one never runs project-controlled code: not the Makefile
# (an agent can edit it), not npx (it prefers the project's node_modules), and not formatters that
# load JavaScript config files. It calls ruff and shellcheck directly, which read only data from the
# project, and passes the file name after "--". JS, TS, JSON, and Markdown are formatted and linted by
# `make fmt` and `make lint`, which agents run inside the sandbox.
set -uo pipefail
# shellcheck source=_audit.sh
source "$(dirname "$0")/_audit.sh"
path="$(jq -r '.tool_input.file_path // .tool_input.path // empty')"
[ -z "$path" ] && exit 0
[ -f "$path" ] || exit 0
root="${CLAUDE_PROJECT_DIR:-$PWD}"
case "$path" in
  *.py) out="$({ ruff format --quiet -- "$path" && ruff check --quiet -- "$path"; } 2>&1)"; rc=$? ;;
  *.sh) out="$(shellcheck -- "$path" 2>&1)"; rc=$? ;;
  *) exit 0 ;;
esac
if [ "$rc" -ne 0 ]; then
  audit WARN post-edit "lint failed :: ${path#"$root"/}"
  printf 'Lint/format problems in %s:\n%s\nFix them before reporting done.\n' "$path" "$out" >&2
  exit 2
fi
exit 0
