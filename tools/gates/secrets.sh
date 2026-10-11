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
# gitleaks exits 1 on its own errors and 0 when git fails beneath it, which it only logs, so a scan passes only when
# its log holds no line at a level but TRC, DBG, INF, or WRN, it exits 0, and its report is an empty list. Findings
# get their own exit code, 99 (--exit-code), and a report that lists them. The range scan must also say how many
# commits it scanned: more than none whenever the branch adds a line, since gitleaks counts only commits whose diff
# has one.
#
# The range scan passes --text to git log, which otherwise shows gitleaks no diff for what git takes for binary: a
# file with a NUL byte, or one a -diff attribute marks in any .gitattributes in the work tree, even an untracked or
# ignored one. The --pre-commit scans can't: gitleaks runs its own git diff, with no options of ours, so they still
# miss what git takes for binary in the changes, a gap plan §11 records. The commits are scanned once committed.
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
# A linked worktree has no mask, so nothing there is the sandbox's placeholder: anything at all refuses. That can't
# stop an agent working there from creating one between this check and gitleaks' read, and nothing here can; the
# Author's gate scans from the main tree, where the sandbox denies agents the path, and from the export it made.
if [ "$top" != "$main_tree" ] && { [ -e "$top/.gitleaksignore" ] || [ -L "$top/.gitleaksignore" ]; }; then
	fail "a .gitleaksignore in $top would switch findings off (research.md R-36); nothing was scanned"
fi
holds_nothing "$main_tree/.gitleaksignore" ||
	fail "a .gitleaksignore in $main_tree would switch findings off (research.md R-36); nothing was scanned"

base="$(git merge-base main HEAD 2>/dev/null)" ||
	fail "this clone has no merge base with main, so the branch's commits can't be scanned"
commits="$(git rev-list --count "$base..HEAD")"
# The lines the branch adds, counted in the patch gitleaks reads (git log -p --text): the range scan must have seen
# some of them. --numstat counts no line in what git takes for binary, even with --text.
added="$(git log -p -U0 --text --no-textconv --no-ext-diff --no-color --format= "$base..HEAD" | LC_ALL=C tr -d '\000' |
	LC_ALL=C awk '/^diff --git /{ hunk = 0; next } /^@@ /{ hunk = 1; next } hunk && /^\+/{ n++ } END { print n + 0 }')" ||
	fail "git log couldn't count the lines the branch adds, so nothing was scanned"

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

# Text from gitleaks or the repository, without the control characters that could drive a terminal.
printable() { LC_ALL=C tr -d '\000-\010\013-\037\177'; }

echo "secrets: gitleaks with $config, over $top"
failed=()
# scan LABEL NAME ADDED GITLEAKS-FLAGS...: ADDED is the range's added lines, or "" for a scan that counts no commits.
scan() {
	local label="$1" want="$3" report="$reports/$2.json" log="$reports/$2.log" rc=0
	shift 3
	echo "== gitleaks: $label"
	gitleaks git "$@" --no-banner --no-color --redact --config "$config" --gitleaks-ignore-path "$empty" \
		--ignore-gitleaks-allow --report-format json --report-path "$report" --exit-code 99 "$top" \
		>"$log" 2>&1 || rc=$?
	printable <"$log"
	local problems=() found="" line scanned
	line="$(LC_ALL=C grep -Ev '^[^ ]+ (TRC|DBG|INF|WRN) |^[[:space:]]*$' -- "$log" | head -n 1 | printable)" || true
	[ -z "$line" ] || problems+=("gitleaks logged an error, so its scan may be partial: ${line:0:200}")
	case "$rc" in
	0 | 99) ;;
	*) problems+=("gitleaks exited $rc") ;;
	esac
	if [ ! -f "$report" ] || [ ! -r "$report" ]; then
		problems+=("gitleaks wrote no readable report, so its scan can't be trusted")
	elif [ "$rc" -eq 0 ]; then
		[ "$(LC_ALL=C tr -d '[:space:]' <"$report")" = "[]" ] ||
			problems+=("gitleaks exited 0, and its report isn't an empty list")
	elif [ "$rc" -eq 99 ]; then
		# The report names each finding's rule, file, line, and commit; its Secret and Match fields are redacted,
		# and the author's name and email aren't printed.
		if ! command -v jq >/dev/null 2>&1; then
			problems+=("gitleaks found something shaped like a secret, and jq is missing, so it can't be named here (make tools installs jq)")
		else
			found="$(jq -r '.[] | "  \(.RuleID) in \(.File):\(.StartLine)\(if (.Commit // "") != "" then " (commit \(.Commit[0:12]))" else "" end)"' \
				"$report" 2>/dev/null | printable)" || found=""
			[ -n "$found" ] || problems+=("gitleaks exited 99, and its report lists no finding it can read")
		fi
	fi
	if [ -n "$want" ]; then
		scanned="$(LC_ALL=C sed -n 's/^[^ ]* INF \([0-9][0-9]*\) commits scanned.*/\1/p' -- "$log" | head -n 1)" || scanned=""
		if [ -z "$scanned" ]; then
			problems+=("gitleaks didn't say how many commits it scanned")
		elif [ "$scanned" -eq 0 ] && [ "$want" -gt 0 ]; then
			problems+=("gitleaks scanned 0 commits, though the branch adds $want line(s)")
		fi
	fi
	if [ -n "$found" ]; then
		echo "$found"
		problems=("gitleaks found something shaped like a secret; keep it out of the repository" ${problems[@]+"${problems[@]}"})
	fi
	if [ "${#problems[@]}" -eq 0 ]; then
		echo "-> PASS $label"
		return 0
	fi
	failed+=("$label")
	local joined
	joined="$(printf '%s; ' "${problems[@]}")"
	echo "-> FAIL $label: ${joined%; }"
}
scan "unstaged changes" unstaged "" --pre-commit
scan "staged changes" staged "" --pre-commit --staged
scan "$commits commits since main (${base:0:12}..HEAD)" range "$added" --log-opts="--text $base..HEAD"

if [ "${#failed[@]}" -gt 0 ]; then
	joined="$(printf '%s, ' "${failed[@]}")"
	echo "secrets: FAIL (${joined%, })"
	exit 1
fi
echo "secrets: PASS (unstaged changes, staged changes, $commits commits since main)"
