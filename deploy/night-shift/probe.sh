#!/usr/bin/env bash
# The night shift's probe (spec 017: FR-001, FR-002, FR-037; plan.md §5; contracts/probe.md). Third version.
#
# It writes only inside one folder it makes, $HOME/h4-probe.XXXXXX, which it names at the end, and installs nothing.
# It works from inside that folder, so no project config in your checkout is read. Every nono call keeps nono's own
# folders (XDG_CONFIG_HOME, XDG_STATE_HOME, XDG_DATA_HOME, XDG_CACHE_HOME) in that folder. The folder sits under your
# home, not /tmp, because nono's built-in system group grants /tmp and nono refuses to grant a folder that holds its
# own state (the second run's section 15 failed that way). It never pulls a nono pack: `nono pull nolabs-ai/claude`
# installs a Claude Code plugin into ~/.claude, which the second run did. It refuses to start while that plugin's
# files are still there. The report shows a fingerprint of ~/.claude/settings.json, ~/.claude.json, and
# ~/.claude/plugins before and after. Everything it prints is also kept in report.txt in that folder.
#
# Run it from your terminal, after the runbook's guard on the commit:
#   bash <(git show "$sha:deploy/night-shift/probe.sh")
#
# Sections 15 and 16 are the nesting test the Author asked for first (plan Q8): does Claude Code's own sandbox start
# inside nono's? Section 16 runs two one-turn `claude -p` sessions on your own login, one outside nono and one
# inside it. Each asks for one sandboxed command, `printenv SANDBOX_RUNTIME`. Claude Code writes its usual session
# files in ~/.claude for them. The summary's first line is the verdict: works, FAILED (Claude Code ran inside nono
# and its sandbox didn't start), UNTESTED (nono didn't start Claude Code, with nono's reason), or UNCLEAR (the
# control outside nono failed). To skip both sections, export H4_PROBE_NEST=0 first instead of editing this file.
#
# It follows .claude/agents/ops.md's pattern: set -u (one failure doesn't hide the rest), a header per section, stderr
# to stdout, each exit code, and ops.md's redaction filter over all of it. It never prints the environment, a token,
# a process's command line, or a file's contents under ~/.aws, ~/.ssh, ~/.config/h4reet-ai, or ~/.claude: paths there
# appear only as "exists" or "absent", or as a SHA-256.
#
# Its network use: GitHub, for nono's release metadata and tarball; Anthropic's API, for section 16's two turns; the
# agents' engine's port, opened and closed with nothing sent. ComfyUI is looked for on disk, never started.
set -u
umask 077
export LC_ALL=C CHECKPOINT_DISABLE=1

NONO_VERSION=0.81.0
NONO_TARBALL="nono-v$NONO_VERSION-x86_64-unknown-linux-gnu.tar.gz"
NONO_REPO=nolabs-ai/nono
NEST="${H4_PROBE_NEST:-1}"
PY=/usr/bin/python3

# The second run's plugin, which `nono remove` takes out (the runbook's step before this one).
for p in "$HOME/.claude/plugins/cache/nolabs-ai" "$HOME/.claude/plugins/marketplaces/nolabs-ai"; do
	if [ -e "$p" ] || [ -L "$p" ]; then
		echo "probe: $p is still there. Remove the nono plugin first (the runbook's step 1), then run this again." >&2
		exit 2
	fi
done
if grep -q 'nono@nolabs-ai' "$HOME/.claude/settings.json" 2>/dev/null; then
	echo "probe: ~/.claude/settings.json still enables nono@nolabs-ai. Remove the nono plugin first (the runbook's step 1)." >&2
	exit 2
fi

t="$(mktemp -d "$HOME/h4-probe.XXXXXX")" || {
	echo "probe: can't make its folder" >&2
	exit 2
}
report="$t/report.txt"
export XDG_CONFIG_HOME="$t/xdg/config" XDG_STATE_HOME="$t/xdg/state" XDG_DATA_HOME="$t/xdg/data" XDG_CACHE_HOME="$t/xdg/cache"
mkdir -p -- "$XDG_CONFIG_HOME" "$XDG_STATE_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$t/dl" "$t/nono" "$t/work"
export GIT_NO_REPLACE_OBJECTS=1 GIT_CONFIG_NOSYSTEM=1
cd -- "$t/work" || exit 2

# ops.md's filter, with -u so each line prints as it arrives.
redact() { sed -u -E 's#(://[^/@[:space:]]*:)[^@[:space:]]+@#\1<redacted>@#g; s#bot[0-9]+:[A-Za-z0-9_-]+#bot<redacted>#g; s#((token|password|passwd|secret|api_?key)[^:=[:space:]]*[[:space:]]*[:=][[:space:]]*).*#\1<redacted>#I; s#(authorization[^:=[:space:]]{0,2}[[:space:]]*[:=][[:space:]]*).*#\1<redacted>#I'; }

h() { printf '\n== %s ==\n' "$*"; }
run() {
	"$@" 2>&1
	printf 'exit: %s\n' "$?"
}
there() { if [ -e "$1" ] || [ -L "$1" ]; then echo "$1: exists"; else echo "$1: absent"; fi; }
fetch() { curl -fsSL --proto '=https' --max-time "$1" -o "$2" "$3"; }
# The last non-empty line of a reply, without spaces: "1" when the sandboxed command ran.
last_word() { printf '%s\n' "$1" | sed '/^[[:space:]]*$/d' | tail -n 1 | tr -d '[:space:]'; }
# The first line of nono's own refusal, if it refused to start.
nono_refusal() { printf '%s\n' "$1" | grep -m 1 -E 'nono: |\[y/N\]|Sandbox initialization failed' || true; }
# A fingerprint of the places nono or a pack could write by default, outside this folder.
fingerprint() {
	local p
	for p in "$HOME/.claude/settings.json" "$HOME/.claude.json" "$HOME/.claude/plugins/known_marketplaces.json" "$HOME/.claude/plugins/installed_plugins.json"; do
		if [ -f "$p" ]; then echo "$p: sha256 $(sha256sum -- "$p" | awk '{print $1}')"; else echo "$p: absent"; fi
	done
	echo "$HOME/.claude/plugins/marketplaces: $(find "$HOME/.claude/plugins/marketplaces" -mindepth 1 -maxdepth 1 -printf '%f ' 2>/dev/null)"
	echo "$HOME/.claude/plugins/cache: $(find "$HOME/.claude/plugins/cache" -mindepth 1 -maxdepth 1 -printf '%f ' 2>/dev/null)"
	for p in "$HOME/.claude/hooks" "$HOME/.nono" "$HOME/.config/nono" "$HOME/.local/state/nono" "$HOME/.local/share/nono" "$HOME/.cache/nono"; do
		there "$p"
	done
}
PYSOCK='import socket, sys
s = socket.socket(socket.AF_UNIX)
try:
    s.connect(sys.argv[1]); print("socket: CONNECTED")
except OSError as e:
    print("socket: refused, errno", e.errno)'
# bubblewrap as Claude Code's sandbox needs it: new user, PID, and network namespaces, a read-only root, /dev, /proc.
BWRAP=(bwrap --unshare-user --unshare-pid --unshare-net --die-with-parent --ro-bind / / --dev /dev --proc /proc -- /bin/true)

main() {
	local s_landlock=unknown s_blender=absent s_blender_dir=absent s_blender_v=absent
	local s_claude=absent s_claude_v=absent s_engine=no s_sock=absent s_sock_out=untested s_bwrap_out=untested
	local s_nono_sha=none s_nono_digest=none s_nono_match=no s_nono_v=none s_nono_ctl=untested s_nest=untested
	local s_sock_in=untested s_aws=untested s_comfy_dirs=none n=""
	local s_cc_out=untested s_cc_in=untested s_cc_why="" s_verdict="UNTESTED: sections 15 and 16 didn't run"

	h "probe"
	echo "probe: spec 017, third version, nono v$NONO_VERSION, folder $t, nesting: $([ "$NEST" = 0 ] && echo skipped || echo on)"
	date -u '+utc: %Y-%m-%dT%H:%M:%SZ'
	echo "-- fingerprint before:"
	fingerprint

	h "1. host"
	run uname -srm
	if grep -qi microsoft /proc/version 2>/dev/null; then echo "wsl: yes"; else echo "wsl: no"; fi
	run sh -c '. /etc/os-release && echo "$PRETTY_NAME"'
	run nproc
	run free -g
	run df -h / /mnt/c

	h "2. landlock"
	s_landlock="$("$PY" -I -c '
import ctypes
libc = ctypes.CDLL(None, use_errno=True)
libc.syscall.restype = ctypes.c_long
r = libc.syscall(ctypes.c_long(444), None, ctypes.c_size_t(0), ctypes.c_uint32(1))
print(r if r >= 0 else "unavailable(errno %d)" % ctypes.get_errno())
' 2>&1)"
	echo "landlock_abi: $s_landlock"

	h "3. bubblewrap outside nono (the control for section 15)"
	run bwrap --version
	run "${BWRAP[@]}"
	if "${BWRAP[@]}" >/dev/null 2>&1; then s_bwrap_out=starts; else s_bwrap_out=refused; fi

	h "4. blender"
	local b
	b="$(command -v blender || true)"
	[ -z "$b" ] && [ -x "$HOME/blender-5.2.3-linux-x64/blender" ] && b="$HOME/blender-5.2.3-linux-x64/blender"
	if [ -n "$b" ]; then
		s_blender="$(readlink -f -- "$b")"
		s_blender_dir="$(dirname -- "$s_blender")"
		s_blender_v="$("$b" --version 2>/dev/null | head -n 1)"
	fi
	echo "blender: $s_blender ($s_blender_v)"

	h "5. comfyui on disk (looked for, never started)"
	local d
	while IFS= read -r d; do
		[ -n "$d" ] || continue
		s_comfy_dirs="$d"
		echo "install: $d"
		for p in "$d/venv/bin/python" "$d/.venv/bin/python" "$d/../venv/bin/python" "$d/../python_embeded/python"; do
			[ -x "$p" ] && echo "python: $(readlink -f -- "$p") ($("$p" --version 2>&1))"
		done
		echo "launch scripts beside it (names only): $(find "$d" "$d/.." -maxdepth 1 -type f \( -name '*.sh' -o -name '*.bat' -o -name '*.service' \) -printf '%f ' 2>/dev/null)"
		echo "custom nodes (names only): $(find "$d/custom_nodes" -mindepth 1 -maxdepth 1 -type d -printf '%f ' 2>/dev/null)"
		echo "model folders: $(find "$d/models" -mindepth 1 -maxdepth 1 -printf '%f ' 2>/dev/null)"
		echo "models path is a link: $([ -L "$d/models" ] && readlink -f -- "$d/models" || echo no)"
		[ -f "$d/extra_model_paths.yaml" ] && echo "extra_model_paths.yaml: exists"
		echo "user folder: $([ -d "$d/user" ] && echo exists || echo absent); output folder: $(readlink -f -- "$d/output" 2>/dev/null)"
	done < <(find "$HOME" /srv /opt -maxdepth 4 -type f -name main.py -path '*omfy*' -printf '%h\n' 2>/dev/null | while read -r x; do [ -d "$x/comfy" ] && echo "$x"; done | sort -u)
	[ "$s_comfy_dirs" = none ] && echo "no ComfyUI install found under ~, /srv, or /opt (to depth 4): tell the session where it is"
	echo "listening on 8188 or 8000 now: $(ss -ltnH 2>/dev/null | awk '{print $4}' | grep -E ':(8188|8000)$' | tr '\n' ' ')"

	h "6. claude code"
	local c
	c="$(command -v claude || true)"
	if [ -n "$c" ]; then
		s_claude="$(readlink -f -- "$c")"
		s_claude_v="$(claude --version 2>/dev/null | head -n 1)"
	fi
	echo "claude: $s_claude ($s_claude_v)"
	echo "node: $(command -v node) $(node --version 2>/dev/null)"

	h "7. the host's Docker socket, outside nono (the control for section 15)"
	for p in /var/run/docker.sock /run/docker.sock; do
		if [ -S "$p" ] && [ "$s_sock" = absent ]; then s_sock="$p"; fi
	done
	if [ "$s_sock" != absent ]; then
		s_sock_out="$("$PY" -I -c "$PYSOCK" "$s_sock" 2>&1)"
		echo "$s_sock_out"
	fi
	if timeout 3 bash -c 'exec 3<>/dev/tcp/198.18.0.1/2376' 2>/dev/null; then s_engine=yes; fi
	echo "engine 198.18.0.1:2376 answers: $s_engine"

	h "8. nono's release (v$NONO_VERSION)"
	local api="https://api.github.com/repos/$NONO_REPO/releases/tags/v$NONO_VERSION" url=""
	if fetch 30 "$t/release.json" "$api"; then
		"$PY" -I - "$t/release.json" "$t/url.txt" "$NONO_TARBALL" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
want = sys.argv[3]
pick = next((a for a in d.get("assets", []) if a.get("name") == want), None)
print(f"tag: {d.get('tag_name')} published: {d.get('published_at')} immutable: {d.get('immutable')}")
if pick:
    open(sys.argv[2], "w").write(pick["browser_download_url"] + "\n" + (pick.get("digest") or "") + "\n")
    print(f"picked: {pick['name']} digest={pick.get('digest')}")
else:
    print(f"picked: none ({want} isn't among the assets)")
PY
		rm -f -- "$t/release.json"
	else
		echo "release metadata: unavailable"
	fi
	if [ -s "$t/url.txt" ]; then
		url="$(sed -n 1p "$t/url.txt")"
		s_nono_digest="$(sed -n 2p "$t/url.txt")"
		if fetch 180 "$t/dl/$NONO_TARBALL" "$url"; then
			s_nono_sha="$(sha256sum "$t/dl/$NONO_TARBALL" | awk '{print $1}')"
			if [ "sha256:$s_nono_sha" = "$s_nono_digest" ]; then s_nono_match=yes; fi
			echo "sha256: $s_nono_sha, match: $s_nono_match"
			"$PY" -I -c 'import sys, tarfile; tarfile.open(sys.argv[1]).extractall(sys.argv[2], filter="data")' "$t/dl/$NONO_TARBALL" "$t/nono" 2>&1
			n="$(find "$t/nono" -type f -name nono | head -n 1)"
			[ -n "$n" ] && chmod u+x -- "$n"
			s_nono_v="$("$n" --version 2>&1 | head -n 1)"
			echo "binary: $n ($s_nono_v)"
		else
			echo "download: failed"
		fi
	fi

	if [ -n "$n" ] && [ "$NEST" != 0 ]; then
		h "15. inside nono, explicit read-only grants (no pack)"
		local g=(run --no-rollback --allow-cwd --read /usr --read /etc --read /lib --read /proc)
		[ -d /lib64 ] && g+=(--read /lib64)
		[ -d /bin ] && [ ! -L /bin ] && g+=(--read /bin)
		echo "-- a) the control: /bin/true inside nono"
		run "$n" "${g[@]}" -- /bin/true </dev/null
		if "$n" "${g[@]}" -- /bin/true </dev/null >/dev/null 2>&1; then s_nono_ctl=runs; else s_nono_ctl=refused; fi
		echo "-- b) bubblewrap inside nono (compare section 3):"
		run "$n" "${g[@]}" -- "${BWRAP[@]}" </dev/null
		if "$n" "${g[@]}" -- "${BWRAP[@]}" </dev/null >/dev/null 2>&1; then s_nest=starts; else s_nest=refused; fi
		if [ "$s_sock" != absent ]; then
			echo "-- c) the host's Docker socket inside nono (compare section 7):"
			s_sock_in="$("$n" "${g[@]}" -- "$PY" -I -c "$PYSOCK" "$s_sock" </dev/null 2>&1 | tail -n 1)"
			echo "$s_sock_in"
		fi
		echo "-- d) reading ~/.aws/config inside nono (exit code only):"
		if [ -e "$HOME/.aws/config" ]; then
			"$n" "${g[@]}" -- /usr/bin/test -r "$HOME/.aws/config" </dev/null >/dev/null 2>&1
			local rc=$?
			echo "inside nono: exit $rc (0 means readable; compare the control in a)"
			if [ "$rc" = 0 ]; then s_aws=READABLE; else s_aws=refused; fi
		else
			s_aws=absent
		fi

		if [ "$s_claude" != absent ]; then
			h "16. Claude Code nested inside nono (your login's turns; Claude Code writes its usual session files)"
			# The Claude Code pack's own profile, inline, without the pack: its built-in groups and grants, minus
			# the session hook that runs from the pack's folder and the reads of nono's package and profile folders.
			cat >"$t/claude-test.json" <<'JSON'
{
  "extends": "default",
  "meta": { "name": "h4-claude-test", "version": "1.0.0", "description": "probe only: the claude pack's grants, inline" },
  "groups": { "include": [
    { "name": "claude_code_linux", "when": "linux" },
    { "name": "claude_cache_linux", "when": "linux" },
    "node_runtime", "rust_runtime", "python_runtime",
    { "name": "linux_sysfs_read", "when": "linux" },
    "nix_runtime", "git_config", "unlink_protection"
  ] },
  "security": { "signal_mode": "isolated", "capability_elevation": false },
  "filesystem": {
    "allow": [ "$HOME/.claude", "$HOME/.local/state/claude/locks", "$HOME/.cache/claude" ],
    "read": [ "$HOME/.nvm" ],
    "allow_file": [ "$HOME/.claude.json", "$HOME/.claude.json.lock", "$HOME/.claude.lock" ],
    "unix_socket_dir_bind": [ { "path": "$XDG_RUNTIME_DIR/cc-socks", "when": "linux" } ]
  },
  "network": { "block": false },
  "workdir": { "access": "readwrite" },
  "environment": { "set_vars": { "CLAUDE_CODE_TMPDIR": "$HOME/.claude/tmp", "TMPDIR": "$HOME/.claude/tmp/claude-$UID" } },
  "rollback": { "exclude_patterns": [], "exclude_globs": [] }
}
JSON
			echo "-- the test profile, validated:"
			run "$n" profile validate "$t/claude-test.json"
			local cs="$t/nest-settings.json" q out
			printf '%s\n' '{"sandbox":{"enabled":true,"failIfUnavailable":true,"allowUnsandboxedCommands":false}}' >"$cs"
			q='Run this exact Bash command, then reply with only its output and nothing else: printenv SANDBOX_RUNTIME'
			local ca=(-p "$q" --settings "$cs" --allowedTools "Bash(printenv SANDBOX_RUNTIME)" --output-format text --max-turns 4)
			echo "-- a) outside nono (the control; its sandboxed command prints 1):"
			out="$(timeout 180 "$s_claude" "${ca[@]}" </dev/null 2>&1 | tail -n 6)"
			echo "$out"
			s_cc_out="$(last_word "$out")"
			echo "-- b) inside nono, under the test profile:"
			out="$(timeout 240 "$n" run --profile "$t/claude-test.json" --no-rollback --allow-cwd -- "$s_claude" "${ca[@]}" </dev/null 2>&1 | tail -n 12)"
			echo "$out"
			s_cc_in="$(last_word "$out")"
			s_cc_why="$(nono_refusal "$out")"
		fi
	fi

	if [ "$s_cc_out" != 1 ]; then
		s_verdict="UNCLEAR: Claude Code's sandboxed command didn't run even outside nono; tell the session"
	elif [ "$s_cc_in" = 1 ]; then
		s_verdict="works: Claude Code's sandbox starts nested inside nono's"
	elif [ -n "$s_cc_why" ] || [ "$s_cc_in" = untested ]; then
		[ -n "$s_cc_why" ] || s_cc_why="section 16 did not run"
		s_verdict="UNTESTED: nono didn't start Claude Code ($s_cc_why); tell the session"
	else
		s_verdict="FAILED: Claude Code ran inside nono and its sandbox didn't start (reply: $s_cc_in). Stop here and tell the session"
	fi

	h "fingerprint after"
	fingerprint

	h "summary"
	echo "NESTING: $s_verdict"
	echo "bwrap_outside_nono: $s_bwrap_out"
	echo "nono_control: $s_nono_ctl"
	echo "bwrap_inside_nono: $s_nest"
	echo "claude_sandbox_outside_nono: $s_cc_out"
	echo "claude_sandbox_inside_nono: $s_cc_in"
	echo "socket_outside_nono: $s_sock_out"
	echo "socket_inside_nono: $s_sock_in"
	echo "aws_inside_nono: $s_aws"
	echo "kernel: $(uname -r)"
	echo "landlock_abi: $s_landlock"
	echo "blender: $s_blender"
	echo "blender_dir: $s_blender_dir"
	echo "blender_version: $s_blender_v"
	echo "comfyui_install: $s_comfy_dirs"
	echo "claude: $s_claude"
	echo "claude_version: $s_claude_v"
	echo "engine_answers: $s_engine"
	echo "docker_socket: $s_sock"
	echo "nono_version: $s_nono_v"
	echo "nono_sha256: $s_nono_sha"
	echo "nono_match: $s_nono_match"
	echo "probe: done, report at $report"
}

main 2>&1 | redact | tee "$report"
