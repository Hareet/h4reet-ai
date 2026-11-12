#!/usr/bin/env bash
# The night shift's red-team rows (spec 017, plan.md §9; rows.json beside this file), after an install.
#
#   bash <(git show "$sha:redteam/night-shift/run.sh")         # the rows marked rehearsal, as the install's R4
#   bash <(git show "$sha:redteam/night-shift/run.sh") --all   # every row
#
# It runs the installed copies only, ~/.local/share/h4reet-ai/night-shift/{rehearse.py,night.py,rows.json}, each
# after its SHA-256 matches installed.txt, as /usr/bin/python3 -I -B. Each row runs in its role's container, built
# by the installed runner's own code, and expects its refusal; the token-in-environment gap row is recorded with
# its bounds. It prints one line a row and never a row's output, only its size. Exit 0 when every row is refused
# (or is the bounded gap), 1 when any isn't, 2 when it can't run.
set -u
export LC_ALL=C

SHARE="$HOME/.local/share/h4reet-ai/night-shift"
INSTALLED="$SHARE/installed.txt"
PY=/usr/bin/python3
ALL=()
case "${1:-}" in
"") ;;
--all) ALL=(--all) ;;
*)
	echo "usage: run.sh [--all]" >&2
	exit 2
	;;
esac
for v in ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_USE_BEDROCK CLAUDE_CODE_USE_VERTEX CLAUDE_CODE_USE_FOUNDRY; do
	if [ -n "${!v+x}" ]; then
		echo "run: $v is set in this shell; unset it first (FR-041)" >&2
		exit 2
	fi
done
if [ ! -f "$INSTALLED" ]; then
	echo "run: nothing is installed (no $INSTALLED): run install.sh first" >&2
	exit 2
fi
sha="$(sed -n 's/^sha //p' "$INSTALLED" | head -n 1)"
for f in rehearse.py night.py rows.json; do
	want="$(awk -v p="$SHARE/$f" '$1 == "file" && $2 == p { print $3 }' "$INSTALLED")"
	if [ -z "$want" ] || [ ! -f "$SHARE/$f" ] || [ -L "$SHARE/$f" ] || [ "$(sha256sum -- "$SHARE/$f" | cut -d' ' -f1)" != "$want" ]; then
		echo "run: $SHARE/$f isn't the file installed.txt records; run install.sh again" >&2
		exit 2
	fi
done
"$PY" -I -B "$SHARE/rehearse.py" step R4 --sha "$sha" "${ALL[@]}"
