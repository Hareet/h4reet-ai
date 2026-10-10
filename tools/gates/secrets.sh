#!/usr/bin/env bash
# make secrets (spec 000 FR-012, FR-041; plan §11; research.md R-35, R-36): gitleaks over the work tree's unstaged
# changes, its staged changes, and every commit since main ($(git merge-base main HEAD)..HEAD).
#
# Every call reads only the main working tree's .gitleaks.toml (--config), names a fresh empty directory from a
# checked mktemp -d as its ignore path, and passes --ignore-gitleaks-allow, so nothing an agent writes in the
# scanned tree, a .gitleaks.toml, a .gitleaksignore, or a gitleaks:allow comment, can switch a rule off. gitleaks
# still reads a .gitleaksignore at its scan source whatever the flags (R-36), so the scan refuses to start while one
# could hold an entry there: anything at all at a linked worktree's root, or, in the main tree, anything but the
# sandbox's empty placeholder, which the sandbox denies agents. An unchecked mktemp that fails gives an empty
# path, the fail-open shape of R-35, so each one is checked. Findings name the rule, the file, the line, and the
# commit, never the match; without gitleaks or the config, nothing is scanned and the target fails (closed).
#
# Exit 0 when every scan is clean, 1 when a scan found something, couldn't run, or was refused.
set -euo pipefail
export GIT_NO_REPLACE_OBJECTS=1 # git log reads each commit's own objects, never a replacement an agent planted

fail() {
	echo "secrets: $1" >&2
	exit 1
}

command -v gitleaks >/dev/null 2>&1 || fail "gitleaks isn't installed, so nothing was scanned (the Author runs make tools)"
top="$(git rev-parse --show-toplevel)" || fail "not inside a work tree"
top="$(cd -- "$top" && pwd -P)" || fail "can't resolve the work tree"
common="$(git rev-parse --path-format=absolute --git-common-dir)" || fail "no git directory"
main_tree="$(cd -- "$(dirname -- "$common")" && pwd -P)" || fail "can't resolve the main working tree"
config="$main_tree/.gitleaks.toml"
[ -f "$config" ] || fail "no .gitleaks.toml in the main working tree, $main_tree, so nothing was scanned"

# What sits at a .gitleaksignore path holds no entry: nothing, the empty file a killed session leaves behind, or the
# sandbox's /dev/null mask (device 1:3) while a session runs. A link, a FIFO, or content could hold entries.
holds_nothing() {
	if [ ! -e "$1" ] && [ ! -L "$1" ]; then return 0; fi
	if [ -L "$1" ]; then return 1; fi
	if [ -f "$1" ] && [ ! -s "$1" ]; then return 0; fi
	[ -c "$1" ] && [ "$(stat -c '%t:%T' -- "$1")" = "1:3" ]
}
# A linked worktree has no mask, and an agent working there could fill an empty file between this check and
# gitleaks' read, so anything there at all refuses.
if [ "$top" != "$main_tree" ] && { [ -e "$top/.gitleaksignore" ] || [ -L "$top/.gitleaksignore" ]; }; then
	fail "a .gitleaksignore in $top would switch findings off (research.md R-36); nothing was scanned"
fi
holds_nothing "$main_tree/.gitleaksignore" ||
	fail "a .gitleaksignore in $main_tree would switch findings off (research.md R-36); nothing was scanned"

base="$(git merge-base main HEAD 2>/dev/null)" ||
	fail "this clone has no merge base with main, so the branch's commits can't be scanned"
commits="$(git rev-list --count "$base..HEAD")"

# A fresh, empty directory, or the run stops (R-35): never an empty, relative, or reused path.
fresh_dir() {
	local dir
	dir="$(mktemp -d)" || fail "mktemp -d failed, so gitleaks has no empty directory to use; nothing was scanned"
	case "$dir" in
	/*) ;;
	*) fail "mktemp -d gave '$dir', not an absolute path; nothing was scanned" ;;
	esac
	{ [ -d "$dir" ] && [ ! -L "$dir" ] && [ -z "$(ls -A -- "$dir")" ]; } ||
		fail "mktemp -d gave '$dir', not a fresh empty directory; nothing was scanned"
	printf '%s\n' "$dir"
}
empty="$(fresh_dir)" || exit 1
reports="$(fresh_dir)" || {
	rmdir -- "$empty"
	exit 1
}
trap 'rmdir -- "$empty" 2>/dev/null || true; rm -rf -- "$reports"' EXIT

echo "secrets: gitleaks with $config, over $top"
failed=()
scan() {
	local label="$1" report="$reports/$2.json" rc=0
	shift 2
	echo "== gitleaks: $label"
	gitleaks git "$@" --no-banner --no-color --redact --config "$config" --gitleaks-ignore-path "$empty" \
		--ignore-gitleaks-allow --report-format json --report-path "$report" "$top" || rc=$?
	if [ "$rc" -eq 0 ]; then
		echo "-> PASS $label"
		return 0
	fi
	failed+=("$label")
	# The report names each finding's rule, file, line, and commit; its Secret and Match fields are redacted, and
	# the author's name and email aren't printed.
	local found=""
	if [ -s "$report" ] && command -v jq >/dev/null 2>&1; then
		found="$(jq -r '.[] | "  \(.RuleID) in \(.File):\(.StartLine)\(if (.Commit // "") != "" then " (commit \(.Commit[0:12]))" else "" end)"' \
			"$report" 2>/dev/null || true)"
	fi
	if [ -n "$found" ]; then
		echo "$found"
		echo "-> FAIL $label: gitleaks found something shaped like a secret; keep it out of the repository"
	else
		echo "-> FAIL $label: gitleaks exited $rc and listed no finding, so it couldn't scan"
	fi
}
scan "unstaged changes" unstaged --pre-commit
scan "staged changes" staged --pre-commit --staged
scan "$commits commits since main (${base:0:12}..HEAD)" range --log-opts="$base..HEAD"

if [ "${#failed[@]}" -gt 0 ]; then
	joined="$(printf '%s, ' "${failed[@]}")"
	echo "secrets: FAIL (${joined%, })"
	exit 1
fi
echo "secrets: PASS (unstaged changes, staged changes, $commits commits since main)"
