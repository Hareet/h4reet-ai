#!/usr/bin/env bash
# PostToolUse(Edit|Write|MultiEdit): keep drift from accumulating. Fast, scoped to the changed file.
# Exit 2 surfaces the lint output to Claude (the edit already happened; this is feedback, not a block).
set -uo pipefail
# shellcheck source=_audit.sh
source "$(dirname "$0")/_audit.sh"
path="$(jq -r '.tool_input.file_path // .tool_input.path // empty')"
[ -z "$path" ] && exit 0
[ -f "$path" ] || exit 0
root="${CLAUDE_PROJECT_DIR:-$PWD}"
# Hooks run outside the sandbox, so the file name must reach make and the formatters only as data:
# through the environment (a make command-line FILE=... would expand $(...) inside it) and quoted
# as "$$FILE" in the recipes. A name carrying shell or make syntax is not linted at all.
case "$path" in
  *'$'* | *'`'* | *$'\n'*)
    audit WARN post-edit "not linted: file name contains \$, a backtick, or a newline" || true
    echo "Not linted: the file name contains \$, a backtick, or a newline. Rename the file." >&2
    exit 2
    ;;
esac
out="$(FILE="$path" make -s -C "$root" fmt-file lint-file 2>&1)"
rc=$?
if [ $rc -ne 0 ]; then
  audit WARN post-edit "lint failed :: ${path#"$root"/}"
  printf 'Lint/format problems in %s:\n%s\nFix them before reporting done.\n' "$path" "$out" >&2
  exit 2
fi
exit 0
