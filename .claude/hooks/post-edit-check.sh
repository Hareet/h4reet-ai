#!/usr/bin/env bash
# PostToolUse(Edit|Write|MultiEdit): keep drift from accumulating. Fast, scoped to the changed file.
# Exit 2 surfaces the lint output to Claude (the edit already happened; this is feedback, not a block).
# Hooks run outside the sandbox, so this one never runs project-controlled code: not the Makefile
# (an agent can edit it), not npx (it prefers the project's node_modules), and not the project's
# JavaScript configs. It calls ruff and shellcheck directly, which read only data from the project.
# TypeScript, JavaScript, JSON, YAML, and Markdown go through the human-only toolchain `make tools`
# installs in ~/.local/share/h4reet/lint-node, with its own configs and its own Node (plan §9; the
# closing patch, tasks.md T117). Prettier reads .prettierignore and .gitignore, data only, at the root
# of the worktree holding the file, so it skips what `make fmt` skips. The file name comes after "--".
set -uo pipefail
# shellcheck source=_audit.sh
source "$(dirname "$0")/_audit.sh"
path="$(jq -r '.tool_input.file_path // .tool_input.path // empty')"
[ -z "$path" ] && exit 0
[ -f "$path" ] || exit 0
root="${CLAUDE_PROJECT_DIR:-$PWD}"
lint="$HOME/.local/share/h4reet/lint-node"
case "$path" in
  *.py) out="$({ ruff format --quiet -- "$path" && ruff check --quiet -- "$path"; } 2>&1)"; rc=$? ;;
  *.sh) out="$(shellcheck -- "$path" 2>&1)"; rc=$? ;;
  *.ts | *.tsx | *.mts | *.cts | *.js | *.mjs | *.cjs | *.json | *.yaml | *.yml | *.md)
    if [ ! -x "$lint/node" ]; then
      audit WARN post-edit "lint toolchain missing :: ${path#"$root"/}"
      echo "post-edit-check: ~/.local/share/h4reet/lint-node has no Node yet (the Author runs make tools), so $path went unlinted; run make lint." >&2
      exit 0
    fi
    # The worktree of this repository that holds the file, from git's own list; the project if none does.
    top="$root"
    best=""
    while IFS= read -r -d '' t; do
      case "$t" in "worktree "/*) t="${t#worktree }" ;; *) continue ;; esac
      case "$path" in "$t"/*) [ "${#t}" -le "${#best}" ] || best="$t" ;; esac
    done < <(git -C "$root" worktree list --porcelain -z 2>/dev/null || true)
    [ -z "$best" ] || top="$best"
    prettier() {
      (cd -- "$top" && "$lint/node" "$lint/node_modules/prettier/bin/prettier.cjs" --config "$lint/prettier.config.json" \
        --no-editorconfig --ignore-path .prettierignore --ignore-path .gitignore --log-level warn --write -- "$path")
    }
    eslint() {
      (cd -- "$top" && "$lint/node" "$lint/node_modules/eslint/bin/eslint.js" --config "$lint/eslint.config.mjs" \
        --no-warn-ignored -- "$path")
    }
    case "$path" in
      *.json | *.yaml | *.yml | *.md) out="$(prettier 2>&1)"; rc=$? ;;
      *) out="$({ prettier && eslint; } 2>&1)"; rc=$? ;;
    esac
    ;;
  *) exit 0 ;;
esac
if [ "$rc" -ne 0 ]; then
  audit WARN post-edit "lint failed :: ${path#"$root"/}"
  printf 'Lint/format problems in %s:\n%s\nFix them before reporting done.\n' "$path" "$out" >&2
  exit 2
fi
exit 0
