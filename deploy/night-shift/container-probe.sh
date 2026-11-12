#!/usr/bin/env bash
# The night shift's container probe (spec 017: FR-037, FR-041; plan.md §5; contracts/probe.md §2). Second version,
# after its review (research R-17).
#
# Before the night shift is built, it answers two questions on your machine:
#   BOUNDARY: does a locked-down container hold what the night shift needs it to hold?
#   PLAN-ONLY: does Claude Code in it sign in on your plan with the setup-token token, and refuse to start when an
#              API key or auth token is present, so nothing can bill API credits? The proof is the egress proxy's
#              own log: the proxy is the container's only way out, so a turn that never reached api.anthropic.com
#              never used the key.
#
# What it does, all on your host's Docker engine:
#   - makes one folder, $HOME/h4-cprobe.XXXXXX. When it ends it keeps report.txt (redacted), the build logs, and the
#     egress log (host names only), and deletes the rest, the container's Claude folder included;
#   - builds two small images, h4-night-probe-worker (Node 22, git, python3, socat, bubblewrap, and Claude Code at
#     the version you run) and h4-night-probe-egress (python:3.12-slim with main's own egress-proxy.py);
#   - makes two networks named for this run, one internal (no route out) and one ordinary, for the egress proxy
#     and the engine forwarder;
#   - runs the checks in locked-down worker containers, then removes the containers and networks this run made, on
#     success, failure, or Ctrl-C. It names the two images it leaves, and the line that removes them.
# Four short `claude -p` turns run through the night-shift token; two of them are expected to refuse to start. The
# token reaches containers only through `--env-file`, from ~/.config/h4reet-ai/night-shift/claude.env. This shell
# never reads its value, and it's never printed. Before running this:
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
run_id="$(basename "$t" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-\n' '-')"
NET_IN="h4-cprobe-in-${run_id#h4-cprobe-}"
NET_OUT="h4-cprobe-out-${run_id#h4-cprobe-}"
EGRESS="h4-cprobe-egress-${run_id#h4-cprobe-}"
FWD="h4-cprobe-fwd-${run_id#h4-cprobe-}"
LABEL="h4-cprobe=$run_id"
report="$t/report.txt"
mkdir -p -- "$t/ctx-w" "$t/ctx-e" "$t/state" "$t/claude" "$t/home" "$t/night"
chmod 700 "$t/claude" "$t/home"
# The host-side git for the scratch repository reads none of your git configuration (plan §6's rule).
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_NO_REPLACE_OBJECTS=1

redact() { sed -u -E 's#(://[^/@[:space:]]*:)[^@[:space:]]+@#\1<redacted>@#g; s#bot[0-9]+:[A-Za-z0-9_-]+#bot<redacted>#g; s#((token|password|passwd|secret|api_?key)[^:=[:space:]]*[[:space:]]*[:=][[:space:]]*).*#\1<redacted>#I; s#(authorization[^:=[:space:]]{0,2}[[:space:]]*[:=][[:space:]]*).*#\1<redacted>#I; s#sk-ant-[A-Za-z0-9_-]+#sk-ant-<redacted>#g'; }
h() { printf '\n== %s ==\n' "$*"; }

# Cleanup removes only what this run made: containers carrying this run's label, and the two networks named for it.
# Then it deletes everything in the folder but the report, the build logs, and the egress log.
cleanup() {
	docker ps -aq --filter "label=$LABEL" | xargs -r docker rm -f >/dev/null 2>&1
	docker network rm "$NET_IN" "$NET_OUT" >/dev/null 2>&1
	case "${t:?}" in "$HOME"/h4-cprobe.*) ;; *) return 0 ;; esac
	rm -rf -- "${t:?}/claude" "${t:?}/home" "${t:?}/repo" "${t:?}/night" "${t:?}/ctx-w" "${t:?}/ctx-e" "${t:?}/rows.txt" "${t:?}/checks.sh" "${t:?}/passwd" "${t:?}/group"
	return 0
}

main() {
	local rows="$t/rows.txt"
	: >"$rows"
	row() { printf 'row: %s %s %s\n' "$1" "$2" "${3:-}" | tee -a "$rows"; }

	h "probe"
	echo "probe: spec 017, the container probe (second version), Claude Code $CLAUDE_VERSION, folder $t, run $run_id"
	date -u '+utc: %Y-%m-%dT%H:%M:%SZ'
	echo "token file: present, mode 600, one line"

	h "1. docker"
	docker version --format 'server {{.Server.Version}}, client {{.Client.Version}}' 2>&1
	docker info --format 'runtimes: {{range $k, $v := .Runtimes}}{{$k}} {{end}}' 2>&1
	echo "exit: $?"

	h "2. the images (build logs kept in $t)"
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
	if ! git -C "$REPO" show refs/heads/main:deploy/agents-engine/egress-proxy.py >"$t/ctx-e/egress-proxy.py" 2>/dev/null || [ ! -s "$t/ctx-e/egress-proxy.py" ]; then
		echo "egress proxy: couldn't read deploy/agents-engine/egress-proxy.py from $REPO's refs/heads/main"
		return 1
	fi
	# The probe's umask is 077, and COPY keeps a file's mode: --chmod makes the script readable by the container's user
	# (the second run's egress proxy couldn't open it).
	chmod 644 "$t/ctx-e/egress-proxy.py"
	printf 'FROM python:3.12-slim\nCOPY --chmod=0444 egress-proxy.py /egress-proxy.py\n' >"$t/ctx-e/Dockerfile"
	if docker build -q -t "$IMG_E" "$t/ctx-e" >"$t/build-egress.log" 2>&1; then
		echo "egress image: built, egress-proxy.py sha256 $(sha256sum "$t/ctx-e/egress-proxy.py" | cut -c1-12)…"
	else
		echo "egress image: FAILED to build"
		tail -n 8 "$t/build-egress.log"
		return 1
	fi
	echo "exit: 0"

	h "3. the networks, the egress proxy (api.anthropic.com only), and the engine forwarder"
	if ! { docker network create --internal --label "$LABEL" "$NET_IN" >/dev/null && docker network create --label "$LABEL" "$NET_OUT" >/dev/null; }; then
		echo "networks: FAILED"
		return 1
	fi
	echo "$NET_IN internal: $(docker network inspect -f '{{.Internal}}' "$NET_IN")"
	printf '%s\n' '{"sandbox": {"network": {"allowedDomains": ["api.anthropic.com"]}}}' >"$t/state/allow.json"
	local lock=(--init --user "$(id -u):$(id -g)" --cap-drop ALL --security-opt no-new-privileges --read-only --tmpfs "/tmp:rw,nosuid,size=512m" --label "$LABEL")
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
	# Both must be running and answering on the internal network before any check, or every row after this proves
	# nothing (the second run's egress proxy had exited, unnoticed).
	local tries ready=no
	for tries in 1 2 3 4 5 6 7 8 9 10; do
		if [ "$(docker inspect -f '{{.State.Running}}' "$EGRESS" 2>/dev/null)" = true ] &&
			[ "$(docker inspect -f '{{.State.Running}}' "$FWD" 2>/dev/null)" = true ] &&
			docker run --rm "${lock[@]}" --network "$NET_IN" "$IMG_W" python3 -I -c 'import socket; socket.create_connection(("egress", 3128), timeout=3)' >/dev/null 2>&1; then
			ready=yes
			break
		fi
		sleep 1
	done
	docker logs "$EGRESS" 2>&1 | tail -n 3
	if [ "$ready" != yes ]; then
		echo "egress proxy or engine forwarder: NOT answering after $tries tries; stopping here (nothing after this would prove anything)"
		echo "egress running: $(docker inspect -f '{{.State.Running}} {{.State.ExitCode}}' "$EGRESS" 2>&1)"
		echo "forwarder running: $(docker inspect -f '{{.State.Running}} {{.State.ExitCode}}' "$FWD" 2>&1)"
		return 1
	fi
	echo "egress proxy: answering on egress:3128 inside $NET_IN; engine forwarder: running"
	echo "exit: 0"

	h "4. a scratch repository and its worktree, as the night's are"
	local repo="$t/repo" wt="$t/night/probe" git
	git init -q -b main "$repo" && mkdir -p "$repo/.claude" && printf '{}\n' >"$repo/.claude/settings.json"
	git -C "$repo" add .claude/settings.json && git -C "$repo" -c user.name=probe -c user.email=probe@example.invalid -c commit.gpgsign=false commit -q -m "probe: base"
	git -C "$repo" worktree add -q -b night/probe/x "$wt" main
	git="$repo/.git"
	mkdir -p "$git/hooks" "$git/info" "$git/refs/tags" "$git/objects/info"
	: >"$git/packed-refs"
	local m
	for m in "$git/hooks" "$git/config" "$git/info" "$git/packed-refs" "$git/refs/heads/main" "$git/refs/tags" "$git/objects/info" "$git/worktrees/probe/commondir" "$wt/.claude"; do
		[ -e "$m" ] || {
			echo "mask source missing: $m"
			return 1
		}
	done
	echo "repo: $repo, worktree: $wt, every mask source present"
	echo "exit: 0"

	printf '%s\n' '{"forceLoginMethod": "claudeai", "sandbox": {"enabled": false}}' >"$t/settings.json"
	printf '%s\n' '{"forceLoginMethod": "claudeai", "sandbox": {"enabled": true, "failIfUnavailable": true, "allowUnsandboxedCommands": false}}' >"$t/settings-sandbox.json"
	printf 'root:x:0:0::/root:/bin/sh\nnight:x:%s:%s::/night/home:/bin/bash\n' "$(id -u)" "$(id -g)" >"$t/passwd"
	printf 'root:x:0:\nnight:x:%s:\n' "$(id -g)" >"$t/group"
	chmod 644 "$t/passwd" "$t/group" "$t/settings.json" "$t/settings-sandbox.json"
	cat >"$t/checks.sh" <<'CHECKS'
#!/bin/bash
# Runs inside the worker container. One "row: <name> <ok|FAILED|info> <detail>" line per check.
set -u
H="$1" GIT="$2" WT="$3"
r() { printf 'row: %s %s %s\n' "$1" "$2" "${3:-}"; }
absent() { if [ -e "$2" ] || [ -L "$2" ]; then r "$1" FAILED "$2 exists"; else r "$1" ok; fi; }
refused() {
	local n="$1" out; shift
	if out="$("$@" 2>&1)"; then r "$n" FAILED "it was allowed"; else r "$n" ok "$(printf '%s' "$out" | head -n 1 | cut -c1-90)"; fi
}

absent no-socket /var/run/docker.sock
absent no-socket-run /run/docker.sock
absent no-aws "$H/.aws"
absent no-ssh "$H/.ssh"
absent no-h4config "$H/.config/h4reet-ai"
absent no-author-claude "$H/.claude"
absent no-photos /srv/studio/photos
absent no-key /srv/studio/key

viaproxy='import sys, urllib.request
try:
    urllib.request.urlopen(sys.argv[1], timeout=15); print("reached")
except urllib.error.HTTPError as e:
    print("reached (HTTP %d)" % e.code)
except Exception as e:
    print("refused:", type(e).__name__, str(e)[:100])'
a="$(python3 -I -c "$viaproxy" https://api.anthropic.com/ 2>&1 | tail -n 1)"
case "$a" in reached*) r egress-allowed ok "api.anthropic.com $a" ;; *) r egress-allowed FAILED "api.anthropic.com $a" ;; esac
b="$(python3 -I -c "$viaproxy" https://example.com/ 2>&1 | tail -n 1)"
case "$b" in *403*) r egress-refused ok "example.com $b" ;; *) r egress-refused FAILED "example.com, not the proxy's 403: $b" ;; esac
c="$(python3 -I -c 'import errno, socket
try:
    socket.create_connection(("1.1.1.1", 443), timeout=5); print("connected")
except OSError as e:
    print("unreachable" if e.errno in (errno.ENETUNREACH, errno.EHOSTUNREACH) else "other", e.errno, e)' 2>&1 | tail -n 1)"
case "$c" in unreachable*) r no-route ok "1.1.1.1:443 $c" ;; *) r no-route FAILED "1.1.1.1:443 $c" ;; esac
dr="$(awk '$2 == "00000000" {print "default route"}' /proc/net/route | head -n 1)"
if [ -z "$dr" ]; then r no-default-route ok; else r no-default-route FAILED "$dr"; fi
dn="$(python3 -I -c 'import socket
try:
    print("resolves", socket.getaddrinfo("example.com", 443)[0][4][0])
except OSError as e:
    print("does not resolve:", e)' 2>&1 | tail -n 1)"
r dns info "example.com $dn (a name that resolves still has no route)"
d="$(python3 -I -c 'import socket
try:
    socket.create_connection(("engine-fwd", 2376), timeout=5); print("connected")
except OSError as e:
    print("no:", e)' 2>&1 | tail -n 1)"
r engine-fwd info "198.18.0.1:2376 through engine-fwd: $d"

cd "$WT" || exit 1
if echo probe >"$WT/probe.txt" && git add probe.txt && git -c user.name=probe -c user.email=probe@example.invalid -c commit.gpgsign=false commit -q -m "probe: a worker's commit"; then
	r worktree-write ok
	r commit ok "$(git rev-parse --short HEAD)"
else
	r commit FAILED
fi
refused hooks-ro touch "$GIT/hooks/probe"
refused config-ro sh -c "echo >>'$GIT/config'"
refused hookspath git config core.hooksPath /tmp
refused settings-ro sh -c "echo >>'$WT/.claude/settings.json'"
refused main-ro git update-ref refs/heads/main HEAD
refused tags-ro git tag main
refused alternates-ro sh -c "echo /tmp >'$GIT/objects/info/alternates'"
refused commondir-ro sh -c "echo .. >'$GIT/worktrees/probe/commondir'"

e="$(timeout 120 claude -p 'Reply with exactly the word ok and nothing else.' --settings /night/settings.json --max-turns 2 2>&1)"
es=$?
case "$(printf '%s\n' "$e" | sed '/^[[:space:]]*$/d' | tail -n 1 | tr -d '[:space:].' | tr '[:upper:]' '[:lower:]')" in
	ok) r signin ok "claude -p answered on the token" ;;
	*) r signin FAILED "exit $es: $(printf '%s' "$e" | tail -n 3 | tr '\n' ' ' | cut -c1-160)" ;;
esac
st="$(timeout 60 claude auth status 2>&1 | grep -v '@' | grep -iE 'method|subscription|plan|type|login|token|account' | head -n 5 | tr '\n' ' ')"
r auth-status info "${st:-no such command, or nothing matched}"
g="$(timeout 120 claude -p 'Run this exact Bash command, then reply with only its output and nothing else: printenv SANDBOX_RUNTIME' --settings /night/settings-sandbox.json --allowedTools 'Bash(printenv SANDBOX_RUNTIME)' --max-turns 4 2>&1 | sed '/^[[:space:]]*$/d' | tail -n 1)"
case "$(printf '%s' "$g" | tr -d '[:space:]')" in
	1) r claude-sandbox-in-container info "starts: Claude Code's own sandbox set SANDBOX_RUNTIME=1, so it can stay on as a second layer" ;;
	*) r claude-sandbox-in-container info "doesn't start ($(printf '%s' "$g" | cut -c1-90)): the container is the boundary" ;;
esac
CHECKS
	chmod 755 "$t/checks.sh"

	# The worker container, without its command. SANDBOX_RUNTIME isn't set here, so that a 1 from printenv can only
	# come from Claude Code's own sandbox (the review's S1).
	local w=(docker run --rm "${lock[@]}" --memory 2g --cpus 2 --pids-limit 512 --network "$NET_IN"
		--env-file "$TOKEN_FILE"
		-e HTTPS_PROXY=http://egress:3128 -e https_proxy=http://egress:3128 -e NO_PROXY=engine-fwd -e no_proxy=engine-fwd
		-e HOME=/night/home -e CLAUDE_CONFIG_DIR=/night/claude
		-e DISABLE_AUTOUPDATER=1 -e DISABLE_TELEMETRY=1 -e DISABLE_ERROR_REPORTING=1 -e CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
		-v "$t/claude:/night/claude:rw" -v "$t/home:/night/home:rw"
		-v "$t/passwd:/etc/passwd:ro" -v "$t/group:/etc/group:ro"
		-v "$wt:$wt:rw" -v "$git:$git:rw")
	for m in "$git/hooks" "$git/config" "$git/info" "$git/packed-refs" "$git/refs/heads/main" "$git/refs/tags" "$git/objects/info" "$git/worktrees/probe/commondir" "$wt/.claude"; do
		w+=(-v "$m:$m:ro")
	done
	w+=(-v "$t/checks.sh:/night/checks.sh:ro" -v "$t/settings.json:/night/settings.json:ro" -v "$t/settings-sandbox.json:/night/settings-sandbox.json:ro" -w "$wt")

	h "5. the checks, in a locked-down worker container"
	"${w[@]}" "$IMG_W" /night/checks.sh "$HOME" "$git" "$wt" 2>&1 | redact | tee -a "$rows"
	echo "exit: ${PIPESTATUS[0]}"

	h "6. fail closed, with stand-in credentials"
	# The proof is the egress log: the container's only way out is the proxy, so a turn that adds no api.anthropic.com
	# line to it never reached the API, and the stand-in credential was never used (the review's B1). That proof only
	# holds when the proxy demonstrably works and the token demonstrably signs in, so both rows must be ok first; a
	# turn that fails for want of a network would otherwise read as a refusal (the second run).
	local v before after out rc
	if ! grep -q '^row: egress-allowed ok' "$rows" || ! grep -q '^row: signin ok' "$rows"; then
		row failclosed-api-key UNTESTED "needs egress-allowed and signin to be ok first"
		row failclosed-auth-token UNTESTED "needs egress-allowed and signin to be ok first"
	fi
	for v in ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN; do
		if ! { grep -q '^row: egress-allowed ok' "$rows" && grep -q '^row: signin ok' "$rows"; }; then break; fi
		before="$(grep -c 'api.anthropic.com' "$t/state/egress.jsonl" 2>/dev/null || true)"
		out="$("${w[@]}" -e "$v=probe-not-a-credential" "$IMG_W" timeout 120 claude -p 'Reply with exactly the word ok and nothing else.' --settings /night/settings.json --max-turns 2 2>&1)"
		rc=$?
		sleep 1
		after="$(grep -c 'api.anthropic.com' "$t/state/egress.jsonl" 2>/dev/null || true)"
		local name="failclosed-${v#ANTHROPIC_}"
		name="$(printf '%s' "$name" | tr '[:upper:]_' '[:lower:]-')"
		if [ "${after:-0}" != "${before:-0}" ]; then
			row "$name" FAILED "with $v set, it reached api.anthropic.com ($before → $after proxy lines), exit $rc: $(printf '%s' "$out" | redact | tr '\n' ' ' | cut -c1-120)"
		elif [ "$rc" -eq 124 ]; then
			row "$name" FAILED "it hung until the 120 s timeout instead of refusing"
		elif [ "$rc" -ne 0 ]; then
			row "$name" ok "refused to start, no API call (exit $rc): $(printf '%s' "$out" | redact | tr '\n' ' ' | cut -c1-120)"
		else
			row "$name" FAILED "it exited 0 with $v set"
		fi
	done

	h "7. what the egress proxy saw (host names and decisions only)"
	if [ -f "$t/state/egress.jsonl" ]; then
		/usr/bin/python3 -I -c 'import json, sys
seen = {}
for line in open(sys.argv[1]):
    try:
        d = json.loads(line)
    except ValueError:
        continue
    k = (str(d.get("host")), str(d.get("decision", d.get("allowed"))), str(d.get("reason") or ""))
    seen[k] = seen.get(k, 0) + 1
for (host, dec, why), n in sorted(seen.items()):
    print(f"{host} {dec} {why} x{n}")' "$t/state/egress.jsonl"
	else
		echo "no egress log"
	fi
	echo "exit: $?"

	h "8. the GPU, for the studio's containers (name and memory only)"
	local gpu
	gpu="$(docker run --rm "${lock[@]}" --gpus all "$IMG_W" nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>&1 | tail -n 1)"
	echo "exit: $?"
	row gpu info "$gpu"

	h "summary"
	local need="no-socket no-socket-run no-aws no-ssh no-h4config no-author-claude no-photos no-key egress-allowed egress-refused no-route no-default-route worktree-write commit hooks-ro config-ro hookspath settings-ro main-ro tags-ro alternates-ro commondir-ro"
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
	local p bad=""
	for p in signin failclosed-api-key failclosed-auth-token; do
		grep -q "^row: $p ok" "$rows" || bad="$bad $p"
	done
	if [ -z "$bad" ]; then
		echo "PLAN-ONLY: yes (signed in with the token; an API key and an auth token each made it refuse to start, with no API call)"
	else
		echo "PLAN-ONLY: FAILED or missing:$bad"
	fi
	grep '^row: ' "$rows" | cut -c6- | cut -c1-200
	echo "images left: $IMG_W $IMG_E (remove with: docker image rm $IMG_W $IMG_E)"
	echo "next: check your Claude account's usage page shows this Claude Code use on your plan, and no API charges"
	echo "probe: done, report at $report"
}

trap cleanup EXIT
main 2>&1 | redact | tee "$report"
