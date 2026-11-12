#!/usr/bin/env bash
# The night shift's container probe (spec 017: FR-037, FR-041; plan.md §5; contracts/probe.md §2).
#
# Before the night shift is built, it answers two questions on your machine:
#   BOUNDARY: does a locked-down container hold what the night shift needs it to hold?
#   PLAN-ONLY: does Claude Code in it sign in on your plan with the setup-token token, and refuse to start when an
#              API key is present, so nothing can bill API credits?
#
# What it does, all on your host's Docker engine:
#   - makes one folder, $HOME/h4-cprobe.XXXXXX, holding everything it writes, and report.txt;
#   - builds two small images, h4-night-probe-worker (Node 22, git, python3, socat, bubblewrap, and Claude Code at
#     the version you run) and h4-night-probe-egress (python:3.12-slim with main's own egress-proxy.py);
#   - makes two networks: one internal (no route out), one ordinary, for the egress proxy and the engine forwarder;
#   - runs the checks in a worker container, then removes its containers and networks, on success or failure, and
#     names the two images it leaves (and the line that removes them).
# Two short `claude -p` turns run on your plan, through the night-shift token. The token reaches the container only
# through `--env-file`, from ~/.config/h4reet-ai/night-shift/claude.env, and is never printed. Before running this:
#   1. make the token: `claude setup-token`, then put it in that file (the runbook's lines, with `read -s`);
#   2. in your Claude account, turn extra usage off.
#
# Run it after the runbook's guard on the commit:
#   bash <(git show "$sha:deploy/night-shift/container-probe.sh")
#
# It follows .claude/agents/ops.md's pattern: set -u, a header per step, stderr to stdout, exit codes, and ops.md's
# redaction filter over everything (with -u, so lines print as they arrive). It prints no environment, no token, and
# no file's contents under ~/.aws, ~/.ssh, ~/.config/h4reet-ai, or ~/.claude.
set -u
umask 077
export LC_ALL=C

CLAUDE_VERSION="${H4_CLAUDE_VERSION:-2.1.322}"
REPO="${H4_REPO:-$HOME/h4reet-ai/h4reet-ai}"
TOKEN_FILE="$HOME/.config/h4reet-ai/night-shift/claude.env"
NET_IN=h4-cprobe-in
NET_OUT=h4-cprobe-out
EGRESS=h4-cprobe-egress
FWD=h4-cprobe-fwd
IMG_W=h4-night-probe-worker
IMG_E=h4-night-probe-egress

# The token file: present, 0600, one line of the right shape. Its value is never read into this shell.
if [ ! -f "$TOKEN_FILE" ]; then
	echo "probe: no $TOKEN_FILE yet. Make the night-shift token first (the runbook's step 1)." >&2
	exit 2
fi
if [ "$(stat -c '%a' "$TOKEN_FILE")" != 600 ]; then
	echo "probe: $TOKEN_FILE must be mode 600 (chmod 600 it)." >&2
	exit 2
fi
if [ "$(wc -l <"$TOKEN_FILE")" -ne 1 ] || ! grep -q '^CLAUDE_CODE_OAUTH_TOKEN=.' "$TOKEN_FILE"; then
	echo "probe: $TOKEN_FILE must hold exactly one line, CLAUDE_CODE_OAUTH_TOKEN=<the token>." >&2
	exit 2
fi
for v in ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_USE_BEDROCK CLAUDE_CODE_USE_VERTEX CLAUDE_CODE_USE_FOUNDRY; do
	if [ -n "${!v:-}" ]; then
		echo "probe: $v is set in this shell; unset it first (the night shift must never bill API credits)." >&2
		exit 2
	fi
done
command -v docker >/dev/null || {
	echo "probe: docker isn't on PATH." >&2
	exit 2
}

t="$(mktemp -d "$HOME/h4-cprobe.XXXXXX")" || exit 2
report="$t/report.txt"
mkdir -p -- "$t/ctx-w" "$t/ctx-e" "$t/state" "$t/claude" "$t/home" "$t/night"
chmod 700 "$t/claude" "$t/home"

redact() { sed -u -E 's#(://[^/@[:space:]]*:)[^@[:space:]]+@#\1<redacted>@#g; s#bot[0-9]+:[A-Za-z0-9_-]+#bot<redacted>#g; s#((token|password|passwd|secret|api_?key)[^:=[:space:]]*[[:space:]]*[:=][[:space:]]*).*#\1<redacted>#I; s#(authorization[^:=[:space:]]{0,2}[[:space:]]*[:=][[:space:]]*).*#\1<redacted>#I; s#sk-ant-[A-Za-z0-9_-]+#sk-ant-<redacted>#g'; }
h() { printf '\n== %s ==\n' "$*"; }
run() {
	"$@" 2>&1
	printf 'exit: %s\n' "$?"
}

cleanup() {
	docker rm -f "$EGRESS" "$FWD" >/dev/null 2>&1
	docker ps -aq --filter "label=h4-cprobe=$(basename "$t")" | xargs -r docker rm -f >/dev/null 2>&1
	docker network rm "$NET_IN" "$NET_OUT" >/dev/null 2>&1
	return 0
}

main() {
	local rows="$t/rows.txt"
	: >"$rows"

	h "probe"
	echo "probe: spec 017, the container probe, Claude Code $CLAUDE_VERSION, folder $t"
	date -u '+utc: %Y-%m-%dT%H:%M:%SZ'
	echo "token file: present, mode 600, one line"

	h "1. docker"
	docker version --format 'server {{.Server.Version}}, client {{.Client.Version}}' 2>&1
	docker info --format 'runtimes: {{range $k, $v := .Runtimes}}{{$k}} {{end}}' 2>&1
	for n in "$NET_IN" "$NET_OUT"; do
		if docker network inspect "$n" >/dev/null 2>&1; then
			echo "probe: a network named $n already exists; remove it (docker network rm $n) and run again."
			return 1
		fi
	done

	h "2. the images (build logs in $t)"
	cat >"$t/ctx-w/Dockerfile" <<EOF
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates python3 jq socat bubblewrap \\
 && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code@$CLAUDE_VERSION && claude --version
EOF
	if docker build -q -t "$IMG_W" "$t/ctx-w" >"$t/build-worker.log" 2>&1; then
		echo "worker image: built ($(docker image inspect -f '{{.Id}}' "$IMG_W" | cut -c1-19))"
	else
		echo "worker image: FAILED to build"
		tail -n 8 "$t/build-worker.log"
		return 1
	fi
	if ! git -C "$REPO" --no-replace-objects show refs/heads/main:deploy/agents-engine/egress-proxy.py >"$t/ctx-e/egress-proxy.py" 2>/dev/null || [ ! -s "$t/ctx-e/egress-proxy.py" ]; then
		echo "egress proxy: couldn't read deploy/agents-engine/egress-proxy.py from $REPO's refs/heads/main"
		return 1
	fi
	printf 'FROM python:3.12-slim\nCOPY egress-proxy.py /egress-proxy.py\n' >"$t/ctx-e/Dockerfile"
	if docker build -q -t "$IMG_E" "$t/ctx-e" >"$t/build-egress.log" 2>&1; then
		echo "egress image: built, egress-proxy.py sha256 $(sha256sum "$t/ctx-e/egress-proxy.py" | cut -c1-12)…"
	else
		echo "egress image: FAILED to build"
		tail -n 8 "$t/build-egress.log"
		return 1
	fi

	h "3. the networks, the egress proxy (api.anthropic.com only), and the engine forwarder"
	if ! { docker network create --internal "$NET_IN" >/dev/null && docker network create "$NET_OUT" >/dev/null; }; then
		echo "networks: FAILED"
		return 1
	fi
	echo "internal: $(docker network inspect -f '{{.Internal}}' "$NET_IN")"
	printf '%s\n' '{"sandbox": {"network": {"allowedDomains": ["api.anthropic.com"]}}}' >"$t/state/allow.json"
	local lock=(--user "$(id -u):$(id -g)" --cap-drop ALL --security-opt no-new-privileges --read-only --tmpfs "/tmp:rw,nosuid,size=512m" --label "h4-cprobe=$(basename "$t")")
	if ! { docker run -d --name "$EGRESS" "${lock[@]}" --network "$NET_OUT" \
		-v "$t/state:/state:rw" -e H4_EGRESS_SETTINGS=/state/allow.json -e H4_EGRESS_HOST=0.0.0.0 -e H4_EGRESS_PORT=3128 \
		-e H4_EGRESS_LOG=/state/egress.jsonl -e H4_EGRESS_LIST_FILE=/state/list.json \
		"$IMG_E" python3 -I -B /egress-proxy.py >/dev/null && docker network connect --alias egress "$NET_IN" "$EGRESS"; }; then
		echo "egress proxy: FAILED to start"
		return 1
	fi
	if ! { docker run -d --name "$FWD" "${lock[@]}" --network "$NET_OUT" "$IMG_W" \
		socat "TCP-LISTEN:2376,fork,reuseaddr" TCP:198.18.0.1:2376 >/dev/null && docker network connect --alias engine-fwd "$NET_IN" "$FWD"; }; then
		echo "engine forwarder: FAILED to start"
		return 1
	fi
	sleep 2
	docker logs "$EGRESS" 2>&1 | tail -n 3
	echo "egress and engine-fwd: running"

	h "4. a scratch repository and its worktree, as the night's are"
	local repo="$t/repo" wt="$t/night/probe" git
	git init -q -b main "$repo" && mkdir -p "$repo/.claude" && printf '{}\n' >"$repo/.claude/settings.json"
	git -C "$repo" add .claude/settings.json && git -C "$repo" -c user.name=probe -c user.email=probe@example.invalid commit -q -m "probe: base"
	git -C "$repo" worktree add -q -b night/probe/x "$wt" main
	git="$repo/.git"
	: >"$git/packed-refs"
	echo "repo: $repo, worktree: $wt"

	h "5. the checks, in a locked-down worker container"
	printf '%s\n' '{"forceLoginMethod": "claudeai", "sandbox": {"enabled": false}}' >"$t/settings.json"
	printf '%s\n' '{"forceLoginMethod": "claudeai", "sandbox": {"enabled": true, "failIfUnavailable": true, "allowUnsandboxedCommands": false}}' >"$t/settings-sandbox.json"
	cat >"$t/checks.sh" <<'CHECKS'
#!/bin/bash
# Runs inside the worker container. One "row: <name> <ok|FAILED|info> <detail>" line per check.
set -u
H="$1" GIT="$2" WT="$3"
r() { printf 'row: %s %s %s\n' "$1" "$2" "${3:-}"; }
py() { python3 -I -c "$1" 2>&1 | tail -n 1; }
absent() { if [ -e "$2" ] || [ -L "$2" ]; then r "$1" FAILED "$2 exists"; else r "$1" ok; fi; }
refused() { local n="$1"; shift; if "$@" >/dev/null 2>&1; then r "$n" FAILED "it was allowed"; else r "$n" ok; fi; }

absent no-socket /var/run/docker.sock
absent no-socket-run /run/docker.sock
absent no-aws "$H/.aws"
absent no-ssh "$H/.ssh"
absent no-h4config "$H/.config/h4reet-ai"
absent no-author-claude "$H/.claude.json"

viaproxy='import os, sys, urllib.request
u = sys.argv[1]
try:
    urllib.request.urlopen(u, timeout=15); print("reached")
except urllib.error.HTTPError as e:
    print("reached (HTTP %d)" % e.code)
except Exception as e:
    print("refused:", type(e).__name__, str(e)[:80])'
a="$(python3 -I -c "$viaproxy" https://api.anthropic.com/ 2>&1 | tail -n 1)"
case "$a" in reached*) r egress-allowed ok "api.anthropic.com $a" ;; *) r egress-allowed FAILED "api.anthropic.com $a" ;; esac
b="$(python3 -I -c "$viaproxy" https://example.com/ 2>&1 | tail -n 1)"
case "$b" in reached*) r egress-refused FAILED "example.com $b" ;; *) r egress-refused ok "example.com $b" ;; esac
c="$(py 'import socket
try:
    socket.create_connection(("1.1.1.1", 443), timeout=5); print("connected")
except OSError as e:
    print("no route:", e)')"
case "$c" in connected*) r no-route FAILED "1.1.1.1:443 $c" ;; *) r no-route ok "1.1.1.1:443 $c" ;; esac
d="$(py 'import socket
try:
    socket.create_connection(("engine-fwd", 2376), timeout=5); print("connected")
except OSError as e:
    print("no:", e)')"
r engine-fwd info "198.18.0.1:2376 through engine-fwd: $d"

cd "$WT" || exit 1
if echo probe >"$WT/probe.txt" && git add probe.txt && git -c user.name=probe -c user.email=probe@example.invalid commit -q -m "probe: a worker's commit"; then
	r worktree-write ok; r commit ok "$(git rev-parse --short HEAD)"
else
	r commit FAILED
fi
refused hooks-ro touch "$GIT/hooks/probe"
refused config-ro sh -c "echo >>'$GIT/config'"
refused hookspath git config core.hooksPath /tmp
refused settings-ro sh -c "echo >>'$WT/.claude/settings.json'"
refused main-ro git update-ref refs/heads/main HEAD

e="$(timeout 120 claude -p 'Reply with exactly the word ok and nothing else.' --settings /night/settings.json --max-turns 2 2>&1 | tail -n 3)"
case "$(printf '%s\n' "$e" | sed '/^[[:space:]]*$/d' | tail -n 1 | tr -d '[:space:].' | tr '[:upper:]' '[:lower:]')" in
	ok) r signin ok "claude -p answered on the token" ;;
	*) r signin FAILED "$(printf '%s' "$e" | tr '\n' ' ' | cut -c1-160)" ;;
esac
f="$(ANTHROPIC_API_KEY=probe-not-a-key timeout 120 claude -p 'Reply with exactly the word ok and nothing else.' --settings /night/settings.json --max-turns 2 2>&1)"
fs=$?
if printf '%s' "$f" | grep -qiE 'invalid x-api-key|401|authentication_error'; then
	r failclosed FAILED "it tried the API key: $(printf '%s' "$f" | tr '\n' ' ' | cut -c1-140)"
elif [ "$fs" -ne 0 ] && ! printf '%s' "$f" | tr -d '[:space:]' | grep -qx 'ok'; then
	r failclosed ok "refused to start: $(printf '%s' "$f" | tr '\n' ' ' | cut -c1-140)"
else
	r failclosed FAILED "it answered with an API key present"
fi
st="$(timeout 60 claude auth status 2>&1 | grep -viE '@' | grep -iE 'method|subscription|plan|type|login|token|account' | head -n 5 | tr '\n' ' ')"
r auth-status info "${st:-no such command, or nothing matched}"
g="$(timeout 120 claude -p 'Run this exact Bash command, then reply with only its output and nothing else: printenv SANDBOX_RUNTIME' --settings /night/settings-sandbox.json --allowedTools 'Bash(printenv SANDBOX_RUNTIME)' --max-turns 4 2>&1 | sed '/^[[:space:]]*$/d' | tail -n 1)"
case "$(printf '%s' "$g" | tr -d '[:space:]')" in
	1) r claude-sandbox-in-container info "starts: Claude Code's own sandbox can stay on as a second layer" ;;
	*) r claude-sandbox-in-container info "doesn't start ($g): the container is the boundary" ;;
esac
CHECKS
	chmod 755 "$t/checks.sh"
	# A passwd and group entry for your user ID inside the container: Node and git look the running user up.
	printf 'root:x:0:0::/root:/bin/sh\nnight:x:%s:%s::/night/home:/bin/bash\n' "$(id -u)" "$(id -g)" >"$t/passwd"
	printf 'root:x:0:\nnight:x:%s:\n' "$(id -g)" >"$t/group"
	chmod 644 "$t/passwd" "$t/group"
	local w=(docker run --rm "${lock[@]}" --memory 2g --cpus 2 --pids-limit 512 --network "$NET_IN"
		--env-file "$TOKEN_FILE"
		-e HTTPS_PROXY=http://egress:3128 -e https_proxy=http://egress:3128 -e NO_PROXY=engine-fwd -e no_proxy=engine-fwd
		-e SANDBOX_RUNTIME=1 -e HOME=/night/home -e CLAUDE_CONFIG_DIR=/night/claude
		-e DISABLE_AUTOUPDATER=1 -e DISABLE_TELEMETRY=1 -e DISABLE_ERROR_REPORTING=1 -e CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
		-v "$t/claude:/night/claude:rw" -v "$t/home:/night/home:rw"
		-v "$t/passwd:/etc/passwd:ro" -v "$t/group:/etc/group:ro"
		-v "$wt:$wt:rw" -v "$git:$git:rw"
		-v "$git/hooks:$git/hooks:ro" -v "$git/config:$git/config:ro" -v "$git/info:$git/info:ro"
		-v "$git/packed-refs:$git/packed-refs:ro" -v "$git/refs/heads/main:$git/refs/heads/main:ro"
		-v "$wt/.claude:$wt/.claude:ro"
		-v "$t/checks.sh:/night/checks.sh:ro" -v "$t/settings.json:/night/settings.json:ro" -v "$t/settings-sandbox.json:/night/settings-sandbox.json:ro"
		-w "$wt" "$IMG_W" /night/checks.sh "$HOME" "$git" "$wt")
	"${w[@]}" 2>&1 | tee -a "$rows"
	echo "exit: ${PIPESTATUS[0]}"

	h "6. what the egress proxy refused (host names only)"
	if [ -f "$t/state/egress.jsonl" ]; then
		/usr/bin/python3 -I -c 'import json, sys
seen = {}
for line in open(sys.argv[1]):
    try:
        d = json.loads(line)
    except ValueError:
        continue
    k = (d.get("host"), d.get("decision") or d.get("verdict") or d.get("allowed"), d.get("reason"))
    seen[k] = seen.get(k, 0) + 1
for (host, dec, why), n in sorted(seen.items(), key=str):
    print(f"{host} {dec} {why or \"\"} x{n}")' "$t/state/egress.jsonl"
	else
		echo "no egress log"
	fi

	h "7. the GPU, for the studio's containers (name and memory only)"
	run docker run --rm "${lock[@]}" --gpus all "$IMG_W" nvidia-smi --query-gpu=name,memory.total --format=csv,noheader

	h "summary"
	local need="no-socket no-socket-run no-aws no-ssh no-h4config no-author-claude egress-allowed egress-refused no-route worktree-write commit hooks-ro config-ro hookspath settings-ro main-ro"
	local failed="" missing="" n
	for n in $need; do
		if ! grep -q "^row: $n " "$rows"; then
			missing="$missing $n"
		elif ! grep -q "^row: $n ok" "$rows"; then failed="$failed $n"; fi
	done
	if [ -n "$failed" ]; then
		echo "BOUNDARY: FAILED$failed. Stop here and tell the session."
	elif [ -n "$missing" ]; then
		echo "BOUNDARY: UNTESTED (no result for$missing); tell the session"
	else
		echo "BOUNDARY: holds"
	fi
	if grep -q '^row: signin ok' "$rows" && grep -q '^row: failclosed ok' "$rows"; then
		echo "PLAN-ONLY: yes (signed in with the token; an API key made it refuse to start)"
	else
		echo "PLAN-ONLY: FAILED ($(grep -E '^row: (signin|failclosed) ' "$rows" | grep -v ' ok' | cut -d' ' -f2 | tr '\n' ' '))"
	fi
	grep '^row: ' "$rows" | cut -c6- | cut -c1-170
	echo "images left: $IMG_W $IMG_E (remove with: docker image rm $IMG_W $IMG_E)"
	echo "next: check your Claude account's usage page shows this Claude Code use on your plan, and no API charges"
	echo "probe: done, report at $report"
}

trap cleanup EXIT
main 2>&1 | redact | tee "$report"
