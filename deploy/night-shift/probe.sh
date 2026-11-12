#!/usr/bin/env bash
# The night shift's probe (spec 017: FR-001, FR-002; plan.md §5; contracts/probe.md).
#
# Read-only. It writes only inside one temp folder, /tmp/h4-probe.XXXXXX, which it names at the end, and installs
# nothing. It works from inside that folder, so no project config in your checkout is read. Every nono call keeps
# nono's folders (XDG_CONFIG_HOME, XDG_STATE_HOME, XDG_DATA_HOME, XDG_CACHE_HOME) in that temp folder too, and the
# report shows a before-and-after fingerprint of ~/.claude/settings.json and of nono's default folders, so any write
# elsewhere would be visible. Everything it prints is also kept there, in report.txt, so the session can read it by
# path once you have read it. Raw API answers are deleted once parsed.
#
# Run it from your terminal, after the runbook's guard on the commit:
#   bash <(git show "$sha:deploy/night-shift/probe.sh")
# Sections 15 and 16 are the nesting test the Author asked for first (plan Q8): does Claude Code's own sandbox start
# inside nono's? Section 16 runs three one-turn `claude -p` sessions on your own login (outside nono, then inside it
# twice), each asking for one sandboxed command, `printenv SANDBOX_RUNTIME`; Claude Code writes its usual session
# files in ~/.claude for them, which the fingerprint shows. The summary's first line is the verdict. To skip both
# sections, export H4_PROBE_NEST=0 first instead of editing this file, so what runs is still the reviewed text.
#
# It follows .claude/agents/ops.md's pattern: set -u (one failure doesn't hide the rest), a header per section, stderr
# to stdout, each exit code, and ops.md's redaction filter over all of it. It never prints the environment, a token,
# a process's command line, or a file under ~/.aws, ~/.ssh, ~/.config/h4reet-ai, or ~/.claude: paths there appear
# only as "exists" or "absent", or as a SHA-256.
#
# Its network use: GitHub, for nono's release metadata and tarball; whatever hosts `nono pull nolabs-ai/claude` uses
# for the Claude Code pack (nono's registry; section 14 prints any failure); ComfyUI on 127.0.0.1; the agents'
# engine's port, opened and closed with nothing sent. Terraform's update check is off (CHECKPOINT_DISABLE=1).
set -u
umask 077
export LC_ALL=C CHECKPOINT_DISABLE=1

NONO_VERSION=0.81.0
NONO_TARBALL="nono-v$NONO_VERSION-x86_64-unknown-linux-gnu.tar.gz"
NONO_REPO=nolabs-ai/nono
REPO="${H4_REPO:-$HOME/h4reet-ai/h4reet-ai}"
NEST="${H4_PROBE_NEST:-1}"
PY=/usr/bin/python3

t="$(mktemp -d /tmp/h4-probe.XXXXXX)" || {
	echo "probe: can't make a temp folder" >&2
	exit 2
}
report="$t/report.txt"
export XDG_CONFIG_HOME="$t/xdg/config" XDG_STATE_HOME="$t/xdg/state" XDG_DATA_HOME="$t/xdg/data" XDG_CACHE_HOME="$t/xdg/cache"
mkdir -p -- "$XDG_CONFIG_HOME" "$XDG_STATE_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$t/dl" "$t/nono" "$t/work"
export GIT_NO_REPLACE_OBJECTS=1 GIT_CONFIG_NOSYSTEM=1
cd -- "$t/work" || exit 2

# ops.md's filter, verbatim.
redact() { sed -E 's#(://[^/@[:space:]]*:)[^@[:space:]]+@#\1<redacted>@#g; s#bot[0-9]+:[A-Za-z0-9_-]+#bot<redacted>#g; s#((token|password|passwd|secret|api_?key)[^:=[:space:]]*[[:space:]]*[:=][[:space:]]*).*#\1<redacted>#I; s#(authorization[^:=[:space:]]{0,2}[[:space:]]*[:=][[:space:]]*).*#\1<redacted>#I'; }

h() { printf '\n== %s ==\n' "$*"; }
run() {
	"$@" 2>&1
	printf 'exit: %s\n' "$?"
}
there() { if [ -e "$1" ] || [ -L "$1" ]; then echo "$1: exists"; else echo "$1: absent"; fi; }
# The last non-empty line of a reply, without spaces: "1" when the sandboxed command ran.
last_word() { printf '%s\n' "$1" | sed '/^[[:space:]]*$/d' | tail -n 1 | tr -d '[:space:]'; }
fetch() { curl -fsSL --proto '=https' --max-time "$1" -o "$2" "$3"; }
# A fingerprint of the places nono or the Claude Code pack might write by default, outside the temp folder.
fingerprint() {
	local p
	for p in "$HOME/.claude/settings.json" "$HOME/.claude.json"; do
		if [ -f "$p" ]; then echo "$p: sha256 $(sha256sum -- "$p" | awk '{print $1}')"; else echo "$p: absent"; fi
	done
	for p in "$HOME/.claude/hooks" "$HOME/.nono" "$HOME/.config/nono" "$HOME/.local/state/nono" "$HOME/.local/share/nono" "$HOME/.cache/nono"; do
		if [ -e "$p" ]; then echo "$p: exists, $(find "$p" 2>/dev/null | wc -l) entries, newest $(find "$p" -printf '%T@\n' 2>/dev/null | sort -n | tail -n 1)"; else echo "$p: absent"; fi
	done
}
# The socket check: connects, sends nothing.
PYSOCK='import socket, sys
s = socket.socket(socket.AF_UNIX)
try:
    s.connect(sys.argv[1]); print("socket: CONNECTED")
except OSError as e:
    print("socket: refused, errno", e.errno)'
# bubblewrap as Claude Code's sandbox needs it: new user, PID, and network namespaces, a read-only root, /dev, /proc.
BWRAP=(bwrap --unshare-user --unshare-pid --unshare-net --die-with-parent --ro-bind / / --dev /dev --proc /proc -- /bin/true)

main() {
	local s_landlock=unknown s_blender=absent s_blender_dir=absent s_blender_v=absent s_comfy=none s_comfy_status="no answer on 8188 or 8000"
	local s_claude=absent s_claude_v=absent s_engine=no s_sock=absent s_sock_out=untested s_bwrap_out=untested s_netns=untested
	local s_nono_sha=none s_nono_digest=none s_nono_match=no s_nono_v=none s_nono_ctl=untested s_nest=untested
	local s_sock_in=untested s_mask=untested s_aws=untested n=""
	local s_cc_out=untested s_cc_in=untested s_cc_in2=untested s_verdict="UNTESTED: section 16 didn't run"

	h "probe"
	echo "probe: spec 017, nono v$NONO_VERSION, temp folder $t, nesting section: $([ "$NEST" = 0 ] && echo skipped || echo on)"
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
	run cat /sys/kernel/security/lsm
	echo
	s_landlock="$("$PY" -I -c '
import ctypes
libc = ctypes.CDLL(None, use_errno=True)
libc.syscall.restype = ctypes.c_long
r = libc.syscall(ctypes.c_long(444), None, ctypes.c_size_t(0), ctypes.c_uint32(1))
print(r if r >= 0 else "unavailable(errno %d)" % ctypes.get_errno())
' 2>&1)"
	echo "landlock_abi: $s_landlock"

	h "3. namespaces and bubblewrap, outside nono (the controls for section 15)"
	local f
	for f in /proc/sys/user/max_user_namespaces /proc/sys/kernel/unprivileged_userns_clone /proc/sys/kernel/apparmor_restrict_unprivileged_userns; do
		if [ -r "$f" ]; then echo "$f: $(cat "$f")"; else echo "$f: absent"; fi
	done
	run unshare --version
	echo "-- an unprivileged user and mount namespace:"
	run unshare --user --map-current-user --mount /bin/true
	echo "-- an unprivileged network namespace with loopback up (the fallback's bridge needs it):"
	run unshare --user --map-current-user --net -- /bin/sh -c 'ip link set lo up && ip -brief address show lo'
	if unshare --user --map-current-user --net -- /bin/sh -c 'ip link set lo up' >/dev/null 2>&1; then s_netns=works; else s_netns=fails; fi
	run bwrap --version
	ls -l "$(command -v bwrap 2>/dev/null || echo /usr/bin/bwrap)" 2>&1
	echo "-- bubblewrap as Claude Code's sandbox uses it, outside nono:"
	run "${BWRAP[@]}"
	if "${BWRAP[@]}" >/dev/null 2>&1; then s_bwrap_out=starts; else s_bwrap_out=refused; fi
	echo "socat: $(command -v socat || echo absent)"
	echo "ip: $(command -v ip || echo absent)"

	h "4. gpu"
	run ls -ld /dev/dxg /usr/lib/wsl/lib
	find /usr/lib/wsl/lib -maxdepth 1 -printf '%f\n' 2>&1 | sort | head -40
	run nvidia-smi --query-gpu=name,memory.total,memory.used,driver_version --format=csv

	h "5. blender"
	local b c
	b="$(command -v blender || true)"
	for c in "$b" /opt/blender*/blender /usr/local/blender*/blender "$HOME"/.local/bin/blender "$HOME"/blender*/blender /snap/bin/blender; do
		[ -n "$c" ] && [ -x "$c" ] && echo "candidate: $(readlink -f -- "$c")"
	done
	if [ -n "$b" ]; then
		s_blender="$(readlink -f -- "$b")"
		s_blender_dir="$(dirname -- "$s_blender")"
		s_blender_v="$("$b" --version 2>/dev/null | head -n 1)"
		echo "blender: $s_blender"
		echo "blender_dir: $s_blender_dir"
		echo "version: $s_blender_v"
	else
		echo "blender: not on PATH (name a candidate above in the facts file)"
	fi

	h "6. comfyui"
	echo "-- listening TCP ports:"
	ss -ltnH 2>&1 | awk '{print $4}' | sort -u
	local p
	for p in ${COMFYUI_PORT:-} 8188 8000; do
		if curl -fsS --max-time 5 -o "$t/comfy-stats.json" "http://127.0.0.1:$p/system_stats" 2>/dev/null; then
			s_comfy="$p"
			s_comfy_status="answers"
			echo "port $p: answers"
			break
		fi
		echo "port $p: no answer"
	done
	if [ "$s_comfy" != none ]; then
		"$PY" -I - "$t/comfy-stats.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
s = d.get("system", {})
for k in ("comfyui_version", "python_version", "pytorch_version", "os"):
    print(f"{k}: {s.get(k)}")
for dev in d.get("devices", []):
    print(f"device: {dev.get('name')} type={dev.get('type')} vram_total={dev.get('vram_total')}")
PY
		if curl -fsS --max-time 20 -o "$t/comfy-objects.json" "http://127.0.0.1:$s_comfy/object_info"; then
			"$PY" -I - "$t/comfy-objects.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
mods = sorted({str(v.get("python_module", "?")) for v in d.values() if isinstance(v, dict)})
print(f"nodes: {len(d)}")
for m in mods:
    print(f"module: {m}")
PY
		fi
		if curl -fsS --max-time 10 -o "$t/comfy-models.json" "http://127.0.0.1:$s_comfy/models"; then
			local folder
			for folder in $("$PY" -I -c 'import json,sys; print("\n".join(json.load(open(sys.argv[1]))))' "$t/comfy-models.json"); do
				case "$folder" in *[!A-Za-z0-9_.-]*) continue ;; esac
				if curl -fsS --max-time 10 -o "$t/comfy-m.json" "http://127.0.0.1:$s_comfy/models/$folder"; then
					"$PY" -I -c 'import json,sys; [print(f"model {sys.argv[2]}: {x}") for x in json.load(open(sys.argv[1]))]' "$t/comfy-m.json" "$folder"
				fi
			done
		fi
		rm -f -- "$t"/comfy-*.json
	fi
	echo "-- how it runs (process IDs and names only):"
	systemctl --user list-units --all --no-pager --plain 2>/dev/null | awk '{print $1, $3, $4}' | grep -i comfy || echo "no user unit named comfy"
	if pgrep -f -i comfyui >/dev/null 2>&1; then
		pgrep -f -i comfyui | while read -r pid; do echo "process: $pid $(cat "/proc/$pid/comm" 2>/dev/null)"; done
	else
		echo "no process named comfyui"
	fi

	h "7. claude code"
	c="$(command -v claude || true)"
	if [ -n "$c" ]; then
		s_claude="$(readlink -f -- "$c")"
		s_claude_v="$(claude --version 2>/dev/null | head -n 1)"
	fi
	echo "claude: $c"
	echo "resolved: $s_claude"
	echo "version: $s_claude_v"
	for p in "$HOME/.claude" "$HOME/.claude.json" "$HOME/.claude/.credentials.json" "$HOME/.claude/settings.json" "$HOME/.local/share/claude" "$HOME/.config/claude"; do there "$p"; done
	if [ -n "${CLAUDE_CONFIG_DIR:-}" ]; then echo "CLAUDE_CONFIG_DIR: set"; else echo "CLAUDE_CONFIG_DIR: unset"; fi
	echo "-- the flags the runner uses, from claude --help:"
	claude --help 2>&1 | grep -E -- '(-p, |--print|--settings|--permission-mode|--output-format|--append-system-prompt|--add-dir|--max-turns|--agent|setup-token|--strict-mcp|--mcp-config)' || echo "(none matched)"

	h "8. the agents' engine"
	git -C "$REPO" show refs/heads/main:deploy/agents-engine/docker-relay 2>&1 | grep -nE 'endpoint=|2376|198\.18' | head -5
	if timeout 3 bash -c 'exec 3<>/dev/tcp/198.18.0.1/2376' 2>/dev/null; then s_engine=yes; fi
	echo "engine 198.18.0.1:2376 answers: $s_engine"
	there "$HOME/.config/h4reet/agents-engine/docker"
	for p in /var/run/docker.sock /run/docker.sock; do
		if [ -S "$p" ]; then
			[ "$s_sock" = absent ] && s_sock="$p"
			ls -lL -- "$p" 2>&1
		else
			echo "$p: absent"
		fi
	done
	run id -nG
	if [ "$s_sock" != absent ]; then
		echo "-- the host's Docker socket, outside nono (the control for section 15):"
		s_sock_out="$("$PY" -I -c "$PYSOCK" "$s_sock" 2>&1)"
		echo "$s_sock_out"
	fi

	h "9. git and the repository"
	run git --version
	echo "repo: $REPO"
	echo "main: $(git -C "$REPO" rev-parse --verify -q refs/heads/main || echo unresolved)"
	echo "a tag named main: $(git -C "$REPO" rev-parse --verify -q refs/tags/main >/dev/null && echo YES || echo no)"
	echo "checkout on: $(git -C "$REPO" symbolic-ref -q --short HEAD || echo detached)"
	echo "worktrees: $(git -C "$REPO" worktree list 2>/dev/null | wc -l)"
	for p in "$HOME/h4reet-ai/gate" "$HOME/h4reet-ai/night" /srv/studio/briefs /srv/studio/handoff /srv/studio/work; do there "$p"; done
	run ls -ld /srv/studio

	h "10. aws"
	run aws --version
	echo "-- profile names (names only):"
	aws configure list-profiles 2>&1

	h "11. toolchain"
	run "$PY" --version
	echo "python3 on PATH: $(command -v python3)"
	terraform version 2>&1 | head -n 1
	run gitleaks version
	case ":$PATH:" in *":$HOME/.local/bin:"*) echo "\$HOME/.local/bin on PATH: yes" ;; *) echo "\$HOME/.local/bin on PATH: no" ;; esac
	echo "nono already installed: $(command -v nono || echo no)"

	h "12. nono's release (v$NONO_VERSION)"
	local api="https://api.github.com/repos/$NONO_REPO/releases/tags/v$NONO_VERSION" url=""
	if fetch 30 "$t/release.json" "$api"; then
		"$PY" -I - "$t/release.json" "$t/url.txt" "$NONO_TARBALL" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
want = sys.argv[3]
print(f"tag: {d.get('tag_name')} published: {d.get('published_at')} immutable: {d.get('immutable')} prerelease: {d.get('prerelease')}")
pick = None
for a in d.get("assets", []):
    print(f"asset: {a.get('name')} size={a.get('size')} digest={a.get('digest')}")
    if a.get("name") == want:
        pick = a
if pick:
    open(sys.argv[2], "w").write(pick["browser_download_url"] + "\n" + (pick.get("digest") or "") + "\n")
    print(f"picked: {pick['name']}")
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
			echo "downloaded: $NONO_TARBALL"
			echo "sha256 (ours):    $s_nono_sha"
			echo "digest (GitHub):  $s_nono_digest"
			if [ "sha256:$s_nono_sha" = "$s_nono_digest" ]; then s_nono_match=yes; fi
			echo "match: $s_nono_match"
			local sums
			for sums in SHA256SUMS SHA256SUMS.txt "$NONO_TARBALL.sha256"; do
				if fetch 30 "$t/dl/$sums" "${url%/*}/$sums" 2>/dev/null; then
					echo "-- $sums:"
					grep -F -- "$NONO_TARBALL" "$t/dl/$sums" || cat -- "$t/dl/$sums"
				fi
			done
			# Extract with Python's data filter: no absolute paths, no links out, no device files.
			"$PY" -I -c 'import sys, tarfile; tarfile.open(sys.argv[1]).extractall(sys.argv[2], filter="data")' "$t/dl/$NONO_TARBALL" "$t/nono" 2>&1
			n="$(find "$t/nono" -type f -name nono | head -n 1)"
			[ -n "$n" ] && chmod u+x -- "$n"
			echo "binary: ${n:-not found in the tarball}"
		else
			echo "download: failed"
		fi
	fi

	if [ -n "$n" ]; then
		h "13. nono's commands"
		s_nono_v="$("$n" --version 2>&1 | head -n 1)"
		echo "version: $s_nono_v"
		run "$n" --help
		run "$n" setup --check-only
		local sub
		for sub in run profile audit rollback why; do
			echo "-- $sub --help:"
			run "$n" "$sub" --help
		done

		h "14. nono's Claude Code pack and profile init (writes only to the temp folder's nono folders)"
		run "$n" pull nolabs-ai/claude
		echo "-- profile show nolabs-ai/claude --json:"
		run "$n" profile show nolabs-ai/claude --json
		echo "-- profile init:"
		run "$n" profile init night-probe --extends nolabs-ai/claude --full --output "$t/init.json"
		[ -s "$t/init.json" ] && cat -- "$t/init.json"
		echo "-- profile validate on it:"
		run "$n" profile validate "$t/init.json"
		"$n" profile schema >"$t/schema.json" 2>&1
		echo "profile schema: exit $?, $(wc -c <"$t/schema.json") bytes, kept in $t/schema.json"
		"$n" profile guide >"$t/guide.txt" 2>&1
		echo "profile guide: exit $?, $(wc -c <"$t/guide.txt") bytes, kept in $t/guide.txt"

		if [ "$NEST" != 0 ]; then
			h "15. inside nono (no pack: explicit read-only grants, the temp folder writable)"
			local g=(run --no-rollback --read /usr --read /etc --read /lib --read /proc --allow "$t/work")
			[ -d /lib64 ] && g+=(--read /lib64)
			[ -d /bin ] && [ ! -L /bin ] && g+=(--read /bin)
			echo "-- a) the control: /bin/true inside nono"
			run "$n" "${g[@]}" -- /bin/true
			if "$n" "${g[@]}" -- /bin/true >/dev/null 2>&1; then s_nono_ctl=runs; else s_nono_ctl=refused; fi
			echo "-- b) bubblewrap inside nono (the nesting; compare section 3's control):"
			run "$n" "${g[@]}" -- "${BWRAP[@]}"
			if "$n" "${g[@]}" -- "${BWRAP[@]}" >/dev/null 2>&1; then s_nest=starts; else s_nest=refused; fi
			if [ "$s_sock" != absent ]; then
				echo "-- c) the host's Docker socket inside nono (compare section 8's control):"
				s_sock_in="$("$n" "${g[@]}" -- "$PY" -I -c "$PYSOCK" "$s_sock" 2>&1 | tail -n 1)"
				echo "$s_sock_in"
				echo "-- d) the outer namespace's mask, then the same connection inside nono:"
				# The inner shell reads "$1" and "$@" from the arguments after the script, so the single quotes are intended.
				# shellcheck disable=SC2016
				s_mask="$(unshare --user --map-current-user --mount -- /bin/bash -c 'mount --bind /dev/null "$1" && shift && exec "$@"' unshare-mask "$s_sock" "$n" "${g[@]}" -- "$PY" -I -c "$PYSOCK" "$s_sock" 2>&1 | tail -n 1)"
				echo "$s_mask"
			fi
			echo "-- e) reading ~/.aws/config inside nono (exit code only):"
			if [ -e "$HOME/.aws/config" ]; then
				"$n" "${g[@]}" -- /usr/bin/test -r "$HOME/.aws/config" >/dev/null 2>&1
				local rc=$?
				echo "inside nono: exit $rc (0 means readable)"
				if [ "$rc" = 0 ]; then s_aws=READABLE; else s_aws=refused; fi
			else
				s_aws=absent
				echo "\$HOME/.aws/config: absent, nothing to test"
			fi

			if [ "$s_claude" != absent ]; then
				h "16. Claude Code nested inside nono (your login's turns; Claude Code writes its usual session files in ~/.claude)"
				local cs="$t/nest-settings.json" q out
				printf '%s\n' '{"sandbox":{"enabled":true,"failIfUnavailable":true,"allowUnsandboxedCommands":false}}' >"$cs"
				printf '%s\n' '{"extends":"nolabs-ai/claude","meta":{"name":"h4-nest-probe"},"network":{"network_profile":null}}' >"$t/nest-profile.json"
				q='Run this exact Bash command, then reply with only its output and nothing else: printenv SANDBOX_RUNTIME'
				local ca=(-p "$q" --settings "$cs" --allowedTools "Bash(printenv SANDBOX_RUNTIME)" --output-format text --max-turns 4)
				echo "-- a) outside nono (the control; its sandboxed command prints 1):"
				out="$(timeout 180 "$s_claude" "${ca[@]}" 2>&1 | tail -n 6)"
				echo "$out"
				s_cc_out="$(last_word "$out")"
				echo "-- b) inside nono, under the Claude Code pack:"
				out="$(timeout 180 "$n" run --profile nolabs-ai/claude --no-rollback -- "$s_claude" "${ca[@]}" 2>&1 | tail -n 8)"
				echo "$out"
				s_cc_in="$(last_word "$out")"
				echo "-- c) inside nono, the pack without its network profile (WSL2 refuses nono's proxy mode by default):"
				out="$(timeout 180 "$n" run --profile "$t/nest-profile.json" --no-rollback -- "$s_claude" "${ca[@]}" 2>&1 | tail -n 8)"
				echo "$out"
				s_cc_in2="$(last_word "$out")"
			fi
		fi
	fi

	# The verdict the Author asked for first (plan Q8): stop if the nesting fails.
	if [ "$s_cc_out" != 1 ]; then
		s_verdict="UNCLEAR: Claude Code's sandboxed command didn't run even outside nono; tell the session"
	elif [ "$s_cc_in" = 1 ] || [ "$s_cc_in2" = 1 ]; then
		s_verdict="works: Claude Code's sandbox starts nested inside nono's"
	else
		s_verdict="FAILED: Claude Code's sandbox doesn't start inside nono's. Stop here and tell the session; the build waits for another approach"
	fi

	h "fingerprint after"
	fingerprint

	h "summary"
	echo "NESTING: $s_verdict"
	echo "kernel: $(uname -r)"
	echo "landlock_abi: $s_landlock"
	echo "dxg: $([ -e /dev/dxg ] && echo yes || echo no)"
	echo "wsl_lib: $([ -d /usr/lib/wsl/lib ] && echo yes || echo no)"
	echo "blender: $s_blender"
	echo "blender_dir: $s_blender_dir"
	echo "blender_version: $s_blender_v"
	echo "comfyui_port: $s_comfy"
	echo "comfyui_status: $s_comfy_status"
	echo "claude: $s_claude"
	echo "claude_version: $s_claude_v"
	echo "engine_answers: $s_engine"
	echo "docker_socket: $s_sock"
	echo "repo: $REPO"
	echo "netns_loopback: $s_netns"
	echo "bwrap_outside_nono: $s_bwrap_out"
	echo "socket_outside_nono: $s_sock_out"
	echo "nono_version: $s_nono_v"
	echo "nono_sha256: $s_nono_sha"
	echo "nono_digest: $s_nono_digest"
	echo "nono_match: $s_nono_match"
	echo "nono_control: $s_nono_ctl"
	echo "bwrap_inside_nono: $s_nest"
	echo "socket_inside_nono: $s_sock_in"
	echo "socket_with_outer_mask: $s_mask"
	echo "aws_inside_nono: $s_aws"
	echo "claude_sandbox_outside_nono: $s_cc_out"
	echo "claude_sandbox_inside_nono_pack: $s_cc_in"
	echo "claude_sandbox_inside_nono_no_proxy: $s_cc_in2"
	echo "probe: done, report at $report"
}

main 2>&1 | redact | tee "$report"
