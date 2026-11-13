#!/usr/bin/env bash
# The night shift's install-and-rehearse script (spec 017: FR-003 to FR-016, FR-037, FR-041; plan.md §6;
# contracts/install.md). The Author's one command, after the runbook's guard on the reviewed SHA:
#
#   bash <(git show "$sha:deploy/night-shift/install.sh") "$sha"          # install, then rehearse
#   bash <(git show "$sha:deploy/night-shift/install.sh") "$sha" --branch feat/017-the-night-shift
#                                       # the same, refusing first, naming both SHAs, if that branch's tip isn't $sha
#   bash <(git show "$sha:deploy/night-shift/install.sh") "$sha" --undo   # remove what installed.txt lists
#
# Steps, stopping at the first failure with `install: FAILED at <step>: <reason>`, then the summary so far:
#   0 preflight   its own git and python; the SHA resolves; the facts file (checked by the runner's own read_facts)
#                 and the token file (mode and shape, never its value); no API-billing variable; no night running;
#                 on the first install, /srv/studio/outputs empty (the count is printed, never a name)
#   1 images      every base pulled by its pinned digest (a null digest refuses, naming the line that reads it), the
#                 devcontainer toolchain, then h4-night-{worker,studio,comfyui,egress}:<sha12>, each from a fresh
#                 context written with git show, --pull=false, the Author's uid and gid as build arguments
#   2 files       the specs (build.py --check, then --fill), allowlists, settings layers, comfyui-params.json, the
#                 runner, its prompts, rehearse.py, and the rows: files 0444, folders 0555
#   3 networks    h4-night, h4-night-engine, h4-night-studio, h4-night-plan (internal) and h4-night-out; the
#                 folders; then installed.txt, which the runner's preflight reads
#   4-7 R1-R4     the rehearsal (rehearse.py, from the installed copy): a session answers on the plan's token (R1);
#                 stand-in API credentials are refused or neutralized, proven by the egress log (R2); make check in
#                 the container (R3); the red-team rows (R4)
#   8 summary     sha, claude, docker, every image ID and spec SHA-256, R1 to R4; nothing secret
#
# What it reads: only `git show <sha>:<path>` (and main's egress-proxy.py from refs/heads/main), never a working
# tree; the facts file as data, never sourced. Its git runs with no replace objects, no system or global config, and
# no hooks. Its python is /usr/bin/python3 -I -B, on files it wrote from the commit into a fresh temp folder.
# It is idempotent: a second run at the same SHA prints `unchanged` for each step and the same summary.
# H4_NIGHT_STUDIO moves /srv/studio, for the tests only.
set -u
umask 022
export LC_ALL=C

SHA="${1:-}"
MODE="${2:-install}"
BRANCH=""
BRANCH_GIVEN=""
if [ "$MODE" = --branch ]; then
	BRANCH="${3:-}"
	BRANCH_GIVEN=1
	MODE=install
fi
LABEL="h4-night=install"
PY=/usr/bin/python3
CONFIG="$HOME/.config/h4reet-ai/night-shift"
SHARE="$HOME/.local/share/h4reet-ai/night-shift"
STATE="$HOME/.local/state/h4reet-ai/night-shift"
FACTS="$CONFIG/facts.env"
TOKEN="$CONFIG/claude.env"
INSTALLED="$SHARE/installed.txt"
REHEARSED="$STATE/rehearsal.txt"
LOGS="$STATE/install"
STUDIO="${H4_NIGHT_STUDIO:-/srv/studio}"
SESSION_ROLES="supervisor spec-writer implementer reviewer red-teamer ops gate-runner studio"
INTERNAL_NETS="h4-night h4-night-engine h4-night-studio h4-night-plan"
OUT_NET=h4-night-out

# No git variable of the caller's steers this script's git.
while IFS= read -r v; do
	case "$v" in GIT_*) unset "$v" ;; esac
done < <(compgen -e)
export GIT_NO_REPLACE_OBJECTS=1 GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_TERMINAL_PROMPT=0

redact() { sed -u -E 's#(://[^/@[:space:]]*:)[^@[:space:]]+@#\1<redacted>@#g; s#bot[0-9]+:[A-Za-z0-9_-]+#bot<redacted>#g; s#((token|password|passwd|secret|api_?key)[^:=[:space:]]*[[:space:]]*[:=][[:space:]]*).*#\1<redacted>#I; s#(authorization[^:=[:space:]]{0,2}[[:space:]]*[:=][[:space:]]*).*#\1<redacted>#I; s#sk-ant-[A-Za-z0-9_-]+#sk-ant-<redacted>#g'; }

STEP="0 preflight"
SUMMARY=()
CHANGED=0
STEP_CHANGED=0
t=""
REPO=""
declare -A OLD_FILES=() OLD_IMAGES=() OLD_NETS=() OLD_MADE_NETS=() HISTORY=() NEW_FILES=() IMG_ID=() NET_ID=() MADE_NETS=() OURS=()
OLD_SHA=""
SCRATCH=("$STATE/rehearsal" "$LOGS" "$REHEARSED")

summary() {
	echo
	echo "== night-shift summary =="
	local line
	for line in "${SUMMARY[@]}"; do echo "$line"; done
	echo "== end =="
}
fail() {
	echo "install: FAILED at $STEP: $*"
	summary
	exit 1
}
step_done() { echo "step $STEP: $*"; }
changed() { CHANGED=1; STEP_CHANGED=1; }

g() { git -c core.hooksPath=/dev/null -c core.fsmonitor=false --git-dir="$REPO/.git" "$@"; }
gshow() { GIT_COMMON_DIR="$REPO/.git" g show "$SHA:$1"; }
put() { # put <path in the commit> <destination>
	if ! { mkdir -p -- "$(dirname -- "$2")" && gshow "$1" >"$2"; }; then fail "can't read $1 from $SHA"; fi
}
sha_of() { sha256sum -- "$1" | cut -d' ' -f1; }

# A folder the install makes is recorded, so --undo removes it again when it's empty. Ancestors too.
mkd() { # mkd <path> <mode>
	local p="$1" mode="$2" up=() d
	d="$p"
	while [ ! -e "$d" ] && [ "$d" != / ]; do
		up=("$d" "${up[@]}")
		d="$(dirname -- "$d")"
	done
	for d in "${up[@]}"; do
		mkdir -- "$d" || fail "can't make $d (make it yours first: sudo install -d -o $(id -un) $d)"
		chmod 0755 -- "$d"
		OURS["$d"]=1
		changed
	done
	if [ ! -d "$p" ] || [ -L "$p" ]; then fail "$p isn't a folder"; fi
	[ -n "${OURS[$p]:-}" ] && chmod "$mode" -- "$p"
	return 0
}
writable() { [ -n "${OURS[$1]:-}" ] && chmod u+w -- "$1"; return 0; }

read_installed() {
	[ -f "$INSTALLED" ] || return 0
	local kind name value
	while IFS=' ' read -r kind name value; do
		case "$kind" in
		sha) OLD_SHA="$name" ;;
		file) OLD_FILES["$name"]="$value" ;;
		image) OLD_IMAGES["$name"]="$value" ;;
		network) OLD_NETS["$name"]="$value" ;;
		made-network) OLD_MADE_NETS["$name"]="$value" ;;
		image-history) HISTORY["$name"]="$value" ;;
		dir) OURS["$name"]=1 ;;
		esac
	done <"$INSTALLED"
}

night_running() {
	local running lock="$STATE/runner.lock"
	running="$(docker ps --filter 'name=^h4-night' --format '{{.Names}}' 2>/dev/null | head -n 3 | tr '\n' ' ')"
	[ -z "$running" ] || fail "night containers are running ($running): run night.py stop first"
	if [ -e "$lock" ] && ! flock -n -E 75 "$lock" true 2>/dev/null; then
		fail "a night.py start holds the runner's lock: run night.py stop first"
	fi
}

# ---------------------------------------------------------------------------------------------------------------
preflight() {
	STEP="0 preflight"
	[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || fail "give the reviewed commit as its full 40-hex SHA (usage: install.sh <sha> [--undo])"
	case "$MODE" in install | --undo) ;; *) fail "usage: install.sh <sha> [--undo | --branch <name>]" ;; esac
	local v
	for v in ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_USE_BEDROCK CLAUDE_CODE_USE_VERTEX CLAUDE_CODE_USE_FOUNDRY; do
		[ -z "${!v+x}" ] || fail "$v is set in this shell; unset it (the night shift never bills API credits, FR-041)"
	done
	command -v docker >/dev/null || fail "docker isn't on PATH"
	command -v git >/dev/null || fail "git isn't on PATH"
	[ -x "$PY" ] || fail "$PY is missing"
	if [ ! -f "$FACTS" ] || [ -L "$FACTS" ]; then fail "no facts file at $FACTS (data-model.md lists its keys)"; fi
	if [ ! -f "$TOKEN" ] || [ -L "$TOKEN" ]; then fail "no token file at $TOKEN: make it with claude setup-token (the runbook)"; fi
	[ "$(stat -c '%a' -- "$TOKEN")" = 600 ] || fail "$TOKEN must be mode 600 (chmod 600 it)"
	[ "$(stat -c '%u' -- "$TOKEN")" = "$(id -u)" ] || fail "$TOKEN must be yours"
	# Its shape, without its value entering this shell: the line count, and how many lines match.
	if [ "$(awk 'END {print NR}' "$TOKEN")" != 1 ] || [ "$(grep -c -E '^CLAUDE_CODE_OAUTH_TOKEN=[A-Za-z0-9._~+/=-]+$' "$TOKEN")" != 1 ]; then
		fail "$TOKEN must hold exactly one line, CLAUDE_CODE_OAUTH_TOKEN=<the token>"
	fi
	REPO="$(sed -n 's/^REPO=//p' "$FACTS" | tail -n 1)"
	if [[ "$REPO" != /* ]] || [ ! -d "$REPO/.git" ] || [ -L "$REPO/.git" ]; then fail "the facts file's REPO isn't a repository's folder"; fi
	local resolved
	resolved="$(GIT_COMMON_DIR="$REPO/.git" g rev-parse --verify --quiet "$SHA^{commit}" 2>/dev/null)"
	[ "$resolved" = "$SHA" ] || fail "$SHA doesn't resolve to a commit in $REPO"
	if [ -n "$BRANCH_GIVEN" ]; then
		[[ "$BRANCH" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]] || fail "--branch needs a branch name"
		local tip
		tip="$(GIT_COMMON_DIR="$REPO/.git" g rev-parse --verify --quiet "refs/heads/$BRANCH^{commit}" 2>/dev/null)"
		[ -n "$tip" ] || fail "the branch $BRANCH doesn't exist in $REPO"
		[ "$tip" = "$SHA" ] || fail "the branch $BRANCH's tip has moved: it is $tip, not the reviewed $SHA; get the new tip reviewed first"
	fi
	TAG="${SHA:0:12}"
	t="$(mktemp -d "${TMPDIR:-/tmp}/h4-night-install.XXXXXX")" || fail "can't make a temp folder"
	chmod 700 -- "$t"
	trap 'rm -rf -- "$t"' EXIT
	put deploy/night-shift/rehearse.py "$t/tool/rehearse.py"
	put deploy/night-shift/runner/night.py "$t/tool/night.py"
	put deploy/night-shift/images/pins.json "$t/tool/pins.json"
	local out key value
	out="$("$PY" -I -B "$t/tool/rehearse.py" facts --night "$t/tool/night.py" --facts "$FACTS" --pins "$t/tool/pins.json" 2>&1)" ||
		fail "$(printf '%s\n' "$out" | tail -n 1)"
	while IFS=' ' read -r v key value; do
		[ "$v" = fact ] || continue
		case "$key" in
		NIGHT_ROOT) NIGHT_ROOT="$value" ;;
		NIGHT_PLAN) NIGHT_PLAN="$value" ;;
		NIGHT_GATE) NIGHT_GATE="$value" ;;
		esac
	done <<<"$out"
	night_running
	read_installed
	if [ ! -f "$INSTALLED" ] && [ -d "$STUDIO/outputs" ]; then
		local n
		n="$(find "$STUDIO/outputs" -mindepth 1 ! -type d -printf x 2>/dev/null | wc -c)" || fail "can't read $STUDIO/outputs"
		[ "$n" = 0 ] || fail "$STUDIO/outputs holds $n files; empty it before the first install (his Q5)"
	fi
	SUMMARY+=("sha $SHA" "night_plan ${NIGHT_PLAN:-off}" "night_gate ${NIGHT_GATE:-off}")
	step_done "ok (checks only)"
}

# ---------------------------------------------------------------------------------------------------------------
images() {
	STEP="1 images"
	local out kind name a b c
	out="$("$PY" -I -B "$t/tool/rehearse.py" pins --pins "$t/tool/pins.json" --facts "$FACTS" --tag "$TAG" 2>&1)" ||
		fail "$(printf '%s\n' "$out" | tail -n 1)"
	local -a bases=() builds=() nulls=()
	declare -A DF=() CTX=() MAINCTX=() ARGS=()
	while IFS=' ' read -r kind name a b c; do
		case "$kind" in
		claude) CLAUDE="$name" ;;
		base) bases+=("$name $a $b $c") ;;
		build) builds+=("$name") DF["$name"]="$a" ;;
		ctx) CTX["$name"]="${CTX[$name]:-} $a" ;;
		main) MAINCTX["$name"]="${MAINCTX[$name]:-} $a" ;;
		arg) ARGS["$name"]="${ARGS[$name]:-} $a=$b" ;;
		esac
	done <<<"$out"
	SUMMARY+=("claude ${CLAUDE:-unknown}" "docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo unknown)")
	local entry key image tag digest
	for entry in "${bases[@]}"; do
		read -r key image tag digest <<<"$entry"
		[ "$digest" = null ] && nulls+=("$image:$tag")
	done
	if [ "${#nulls[@]}" -gt 0 ]; then
		echo "pins.json has no digest for ${#nulls[@]} bases. Pull each, read its digest with the line below, and put it in"
		echo "deploy/night-shift/images/pins.json (a reviewed commit), then run the install at that commit:"
		for image in "${nulls[@]}"; do
			echo "  docker pull $image && docker image inspect --format '{{index .RepoDigests 0}}' $image"
		done
		fail "a base's digest is null in pins.json (${nulls[*]})"
	fi
	# Every base first, so a digest that differs installs nothing.
	for entry in "${bases[@]}"; do
		read -r key image tag digest <<<"$entry"
		if ! docker image inspect "$image@$digest" >/dev/null 2>&1; then
			docker pull -q "$image@$digest" >>"$t/pull.log" 2>&1 || { tail -n 4 "$t/pull.log" | redact; fail "couldn't pull $key by its pinned digest"; }
		fi
		case " $(docker image inspect --format '{{join .RepoDigests " "}}' "$image@$digest" 2>/dev/null) " in
		*"@$digest "*) ;;
		*) fail "base $key's digest differs from its pin" ;;
		esac
	done
	local built=() ref ctx p want have bargs arg
	mkd "$STATE" 0700
	mkd "$LOGS" 0700
	for name in "${builds[@]}"; do
		ref="h4-night-$name:$TAG"
		want="${OLD_IMAGES[$ref]:-}"
		have="$(docker image inspect --format '{{.Id}}' "$ref" 2>/dev/null || true)"
		if [ -n "$want" ] && [ "$have" = "$want" ]; then
			IMG_ID["$name"]="$have"
			continue
		fi
		ctx="$t/ctx-$name"
		for p in ${CTX[$name]:-}; do put "$p" "$ctx/$p"; done
		for p in ${MAINCTX[$name]:-}; do
			mkdir -p -- "$(dirname -- "$ctx/$p")"
			GIT_COMMON_DIR="$REPO/.git" g show "refs/heads/main:$p" >"$ctx/$p" || fail "can't read $p from refs/heads/main"
		done
		bargs=()
		for arg in ${ARGS[$name]:-}; do bargs+=(--build-arg "$arg"); done
		echo "building $ref (its log: $LOGS/build-$name.log)"
		if ! docker build --pull=false -q --label "$LABEL" -f "$ctx/${DF[$name]}" -t "$ref" "${bargs[@]}" "$ctx" >"$LOGS/build-$name.log" 2>&1; then
			tail -n 8 "$LOGS/build-$name.log" | redact
			fail "the $name image didn't build (its log: $LOGS/build-$name.log)"
		fi
		IMG_ID["$name"]="$(docker image inspect --format '{{.Id}}' "$ref" 2>/dev/null)"
		[[ "${IMG_ID[$name]}" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "the $name image has no ID after its build"
		built+=("$name")
		changed
	done
	for name in "${builds[@]}"; do SUMMARY+=("image $name ${IMG_ID[$name]}"); done
	if [ "${#built[@]}" -eq 0 ]; then step_done unchanged; else step_done "built ${built[*]}"; fi
}

# ---------------------------------------------------------------------------------------------------------------
install_file() { # install_file <source> <destination>
	local src="$1" dest="$2" d want
	d="$(dirname -- "$dest")"
	want="$(sha_of "$src")"
	NEW_FILES["$dest"]="$want"
	if [ -f "$dest" ] && [ ! -L "$dest" ] && [ "$(sha_of "$dest")" = "$want" ] && [ "$(stat -c '%a' -- "$dest")" = 444 ]; then
		return 0
	fi
	if [ -e "$dest" ] || [ -L "$dest" ]; then
		[ -n "${OLD_FILES[$dest]:-}" ] || fail "$dest exists, and the install didn't make it: move it away first"
	fi
	if [ -f "$dest" ] && [ ! -L "$dest" ] && [[ "$dest" == "$CONFIG"/* ]]; then
		echo "replacing $dest (FR-005):"
		diff -u --label "$dest (installed)" --label "$dest ($TAG)" -- "$dest" "$src"
	fi
	writable "$d"
	if ! { rm -f -- "$dest" && cp -- "$src" "$dest" && chmod 0444 -- "$dest"; }; then fail "can't write $dest"; fi
	FILES_WRITTEN=$((FILES_WRITTEN + 1))
	changed
}

files() {
	STEP="2 files"
	FILES_WRITTEN=0
	local fill="$t/fill" n p role out
	# The night allowlist follows main's settings, never the commit's copy (S7; build.py's own default).
	if ! GIT_COMMON_DIR="$REPO/.git" g cat-file blob refs/heads/main:.claude/settings.json >"$t/settings.json"; then
		fail "can't read refs/heads/main:.claude/settings.json in $REPO"
	fi
	while IFS= read -r p; do put "$p" "$fill/$p"; done < <(GIT_COMMON_DIR="$REPO/.git" g ls-tree --name-only "$SHA" deploy/night-shift/containers/)
	for n in allowlist allowlist-studio allowlist-plan; do put "deploy/night-shift/$n.json" "$fill/deploy/night-shift/$n.json"; done
	out="$("$PY" -I -B "$fill/deploy/night-shift/containers/build.py" --check --settings "$t/settings.json" 2>&1)" ||
		fail "the commit's specs aren't what fragments.json makes: $(printf '%s' "$out" | tr '\n' ' ')"
	out="$("$PY" -I -B "$fill/deploy/night-shift/containers/build.py" --settings "$t/settings.json" --fill "$t/live" --facts "$FACTS" --home "$HOME" --tag "$TAG" 2>&1)" ||
		fail "$(printf '%s\n' "$out" | tail -n 1)"
	if grep -R -l -F '{{' "$t/live" >/dev/null 2>&1; then fail "a placeholder is left in a filled spec"; fi

	mkd "$CONFIG/containers" 0755
	mkd "$CONFIG/claude" 0755
	mkd "$SHARE" 0755
	mkd "$SHARE/prompts" 0755
	mkd "$SHARE/claude" 0755
	writable "$CONFIG/containers"
	writable "$CONFIG/claude"
	writable "$SHARE"
	writable "$SHARE/prompts"
	writable "$SHARE/claude"
	for p in "$t/live/containers/"*.json; do install_file "$p" "$CONFIG/containers/$(basename -- "$p")"; done
	for n in allowlist allowlist-studio allowlist-plan; do install_file "$fill/deploy/night-shift/$n.json" "$CONFIG/$n.json"; done
	put deploy/night-shift/comfyui-params.json "$t/stage/comfyui-params.json"
	install_file "$t/stage/comfyui-params.json" "$CONFIG/comfyui-params.json"
	while IFS= read -r p; do
		put "$p" "$t/stage/$p"
		install_file "$t/stage/$p" "$CONFIG/claude/$(basename -- "$p")"
	done < <(GIT_COMMON_DIR="$REPO/.git" g ls-tree --name-only "$SHA" deploy/night-shift/claude/)
	while IFS= read -r p; do
		put "$p" "$t/stage/$p"
		install_file "$t/stage/$p" "$SHARE/prompts/$(basename -- "$p")"
	done < <(GIT_COMMON_DIR="$REPO/.git" g ls-tree --name-only "$SHA" deploy/night-shift/runner/prompts/)
	install_file "$t/tool/night.py" "$SHARE/night.py"
	install_file "$t/tool/rehearse.py" "$SHARE/rehearse.py"
	put redteam/night-shift/rows.json "$t/stage/rows.json"
	install_file "$t/stage/rows.json" "$SHARE/rows.json"
	# Each role's Claude folder, the sessions' own: written by them, so 0700, never recorded as files.
	for role in $SESSION_ROLES; do mkd "$SHARE/claude/$role" 0700; done
	# The runner writes refs/heads/main's .gitleaks.toml here for the tasks' secrets gate (T090 round 2).
	mkd "$SHARE/gate" 0700
	# A file the last install made that this commit doesn't have: removed while it's still as installed.
	for p in "${!OLD_FILES[@]}"; do
		[ -n "${NEW_FILES[$p]:-}" ] && continue
		if [ -f "$p" ] && [ ! -L "$p" ] && [ "$(sha_of "$p")" = "${OLD_FILES[$p]}" ]; then
			writable "$(dirname -- "$p")"
			rm -f -- "$p" && echo "removed $p (not in $SHA)" && changed
		fi
	done
	for p in "$CONFIG/containers" "$CONFIG/claude" "$SHARE/prompts" "$SHARE/claude"; do
		[ -n "${OURS[$p]:-}" ] && chmod 0555 -- "$p"
	done
	for p in "$CONFIG"/containers/*.json; do SUMMARY+=("spec $(basename -- "$p" .json) $(sha_of "$p")"); done
	for n in allowlist allowlist-studio allowlist-plan; do SUMMARY+=("allowlist $n $(sha_of "$CONFIG/$n.json")"); done
	if [ "$FILES_WRITTEN" -eq 0 ]; then step_done unchanged; else step_done "$FILES_WRITTEN files written"; fi
}

# ---------------------------------------------------------------------------------------------------------------
ensure_net() { # ensure_net <name> internal|normal
	local n="$1" want="$2" got id
	got="$(docker network inspect --format '{{.Internal}} {{.Id}}' "$n" 2>/dev/null)"
	local made=""
	if [ -z "$got" ]; then
		made=1
		if [ "$want" = internal ]; then
			docker network create --internal --label "$LABEL" "$n" >/dev/null 2>&1 || fail "can't make the network $n"
		else
			docker network create --label "$LABEL" "$n" >/dev/null 2>&1 || fail "can't make the network $n"
		fi
		got="$(docker network inspect --format '{{.Internal}} {{.Id}}' "$n" 2>/dev/null)"
		changed
		NETS_MADE=$((NETS_MADE + 1))
	fi
	read -r got id <<<"$got"
	if [ "$want" = internal ] && [ "$got" != true ]; then fail "the network $n exists and isn't internal: remove it (docker network rm $n)"; fi
	if [ "$want" = normal ] && [ "$got" = true ]; then fail "the network $n exists and is internal: remove it (docker network rm $n)"; fi
	NET_ID["$n"]="$id"
	# Only a network this install (or an earlier one, with this ID) made is ever removed by --undo.
	if [ -n "$made" ] || [ "${OLD_MADE_NETS[$n]:-}" = "$id" ]; then MADE_NETS["$n"]="$id"; fi
}

networks() {
	STEP="3 networks"
	NETS_MADE=0
	local n p tmp
	STEP_CHANGED=0
	for n in $INTERNAL_NETS; do ensure_net "$n" internal; done
	ensure_net "$OUT_NET" normal
	mkd "$STATE" 0700
	mkd "$STATE/locks" 0700
	mkd "$STUDIO/briefs" 0755
	mkd "$STUDIO/handoff" 0755
	mkd "$STUDIO/outputs" 0755
	mkd "$NIGHT_ROOT" 0755
	mkd "$NIGHT_ROOT/.comfyui" 0700
	mkd "$NIGHT_ROOT/.comfyui/user" 0700
	tmp="$t/installed.txt"
	{
		echo "# The night shift's install (spec 017, contracts/install.md). The runner's preflight reads it; --undo removes what it lists."
		echo "sha $SHA"
		for p in "${!NEW_FILES[@]}"; do echo "file $p ${NEW_FILES[$p]}"; done | sort
		for n in "${!IMG_ID[@]}"; do echo "image h4-night-$n:$TAG ${IMG_ID[$n]}"; done | sort
		for n in "${!NET_ID[@]}"; do echo "network $n ${NET_ID[$n]}"; done | sort
		for n in "${!MADE_NETS[@]}"; do echo "made-network $n ${MADE_NETS[$n]}"; done | sort
		# Every image an install here ever tagged, so --undo removes the earlier SHAs' too.
		{
			for ref in "${!HISTORY[@]}"; do echo "image-history $ref ${HISTORY[$ref]}"; done
			for ref in "${!OLD_IMAGES[@]}"; do
				[[ "$ref" == *":$TAG" ]] || echo "image-history $ref ${OLD_IMAGES[$ref]}"
			done
		} | sort -u
		for p in "${!OURS[@]}"; do echo "dir $p"; done | sort
		for p in "${SCRATCH[@]}"; do echo "scratch $p"; done
	} >"$tmp"
	if [ -f "$INSTALLED" ] && cmp -s -- "$tmp" "$INSTALLED"; then
		:
	else
		writable "$SHARE"
		if ! { rm -f -- "$INSTALLED" && cp -- "$tmp" "$INSTALLED" && chmod 0444 -- "$INSTALLED"; }; then fail "can't write $INSTALLED"; fi
		changed
	fi
	[ -n "${OURS[$SHARE]:-}" ] && chmod 0555 -- "$SHARE"
	for n in $INTERNAL_NETS $OUT_NET; do SUMMARY+=("network $n ${NET_ID[$n]}"); done
	if [ "$STEP_CHANGED" = 0 ]; then step_done unchanged; else step_done "$NETS_MADE networks made; folders and installed.txt written"; fi
}

# ---------------------------------------------------------------------------------------------------------------
rehearse() {
	local n=4 r out rc line rows=()
	if [ "$CHANGED" = 0 ] && [ -f "$REHEARSED" ] && [ "$(head -n 1 "$REHEARSED")" = "sha $SHA" ] && grep -q '^R4 ok' "$REHEARSED"; then
		for r in R1 R2 R3 R4; do
			STEP="$n $r"
			step_done "unchanged"
			n=$((n + 1))
		done
		while IFS= read -r line; do
			case "$line" in R[1-4]\ * | row\ *) SUMMARY+=("$line") ;; esac
		done <"$REHEARSED"
		return 0
	fi
	rm -f -- "$REHEARSED"
	local record=("sha $SHA")
	for r in R1 R2 R3 R4; do
		STEP="$n $r"
		echo "running $r"
		[ "$(sha_of "$SHARE/rehearse.py")" = "${NEW_FILES[$SHARE/rehearse.py]}" ] || fail "$SHARE/rehearse.py isn't the file this install wrote"
		out="$("$PY" -I -B "$SHARE/rehearse.py" step "$r" --sha "$SHA" 2>&1)"
		rc=$?
		rows=()
		while IFS= read -r line; do
			case "$line" in row\ *) rows+=("$line") ;; esac
		done <<<"$out"
		line="$(printf '%s\n' "$out" | grep -E "^$r (ok|FAILED)" | tail -n 1)"
		[ -n "$line" ] || line="$r FAILED it printed no result: $(printf '%s\n' "$out" | tail -n 1)"
		SUMMARY+=("$line" "${rows[@]}")
		record+=("$line" "${rows[@]}")
		printf '%s\n' "$out" | grep -v -E '^row .* refused-by=' | grep -v -E "^$r (ok|FAILED)" | redact
		if [ "$rc" -ne 0 ] || [[ "$line" != "$r ok"* ]]; then
			fail "${line#"$r FAILED "}"
		fi
		step_done ok
		n=$((n + 1))
	done
	(umask 077 && printf '%s\n' "${record[@]}" >"$REHEARSED")
}

# ---------------------------------------------------------------------------------------------------------------
# --undo needs only installed.txt: no facts file, token, or repository.
undo() {
	STEP="undo"
	[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || fail "give the installed commit as its full 40-hex SHA (usage: install.sh <sha> --undo)"
	command -v docker >/dev/null || fail "docker isn't on PATH"
	[ -f "$INSTALLED" ] || fail "nothing to undo: there's no $INSTALLED"
	night_running
	read_installed
	[ "$OLD_SHA" = "$SHA" ] || fail "installed.txt is for ${OLD_SHA:-no SHA}, not $SHA: give that SHA"
	local p ref n got left=() dirs=()
	for p in "${!OURS[@]}"; do [ -d "$p" ] && [ ! -L "$p" ] && chmod u+w -- "$p"; done
	for p in "${!OLD_FILES[@]}"; do
		if [ -f "$p" ] && [ ! -L "$p" ] && [ "$(sha_of "$p")" = "${OLD_FILES[$p]}" ]; then
			rm -f -- "$p"
		elif [ -e "$p" ] || [ -L "$p" ]; then
			left+=("$p (changed since the install)")
		fi
	done
	declare -A ALL_IMAGES=()
	for ref in "${!HISTORY[@]}"; do ALL_IMAGES["$ref"]="${HISTORY[$ref]}"; done
	for ref in "${!OLD_IMAGES[@]}"; do ALL_IMAGES["$ref"]="${OLD_IMAGES[$ref]}"; done
	for ref in "${!ALL_IMAGES[@]}"; do
		got="$(docker image inspect --format '{{.Id}} {{index .Config.Labels "h4-night"}}' "$ref" 2>/dev/null || true)"
		if [ "$got" = "${ALL_IMAGES[$ref]} install" ]; then
			docker image rm "$ref" >/dev/null 2>&1 || left+=("image $ref (in use)")
		elif [ -n "$got" ]; then
			left+=("image $ref (retagged or not the install's since)")
		fi
	done
	for n in "${!OLD_NETS[@]}"; do
		got="$(docker network inspect --format '{{.Id}} {{index .Labels "h4-night"}}' "$n" 2>/dev/null || true)"
		[ -n "$got" ] || continue
		if [ -n "${OLD_MADE_NETS[$n]:-}" ] && [ "$got" = "${OLD_MADE_NETS[$n]} install" ]; then
			docker network rm "$n" >/dev/null 2>&1 || left+=("network $n (in use)")
		else
			left+=("network $n (the install didn't make it)")
		fi
	done
	while IFS=' ' read -r n p; do
		[ "$n" = scratch ] || continue
		case "$p" in "$STATE"/*) rm -rf -- "$p" ;; esac
	done <"$INSTALLED"
	[ -d "$SHARE" ] && chmod u+w -- "$SHARE"
	rm -f -- "$INSTALLED"
	# The runner's copy of main's committed .gitleaks.toml, a regular file only: nothing of his is kept there.
	[ -f "$SHARE/gate/gitleaks.toml" ] && [ ! -L "$SHARE/gate/gitleaks.toml" ] && rm -f -- "$SHARE/gate/gitleaks.toml"
	mapfile -t dirs < <(for p in "${!OURS[@]}"; do printf '%s\n' "$p"; done | awk '{ print length($0) " " $0 }' | sort -rn | cut -d' ' -f2-)
	for p in "${dirs[@]}"; do
		[ -d "$p" ] || continue
		rmdir -- "$p" 2>/dev/null || left+=("$p (not empty)")
	done
	echo "undo: removed what installed.txt listed for $SHA"
	echo "undo: left $TOKEN (yours)"
	echo "undo: left $FACTS (yours)"
	for p in "${left[@]}"; do echo "undo: left $p"; done
	return 0
}

main() {
	if [ "$MODE" = --undo ]; then
		undo
		return 0
	fi
	preflight
	images
	files
	networks
	rehearse
	summary
	echo "install: done"
}

main 2>&1 | redact
exit "${PIPESTATUS[0]}"
