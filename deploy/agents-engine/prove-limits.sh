#!/usr/bin/env bash
# The FR-039 limits and their proofs (spec 000; contracts/agents-engine.md §7, matrix stage E).
#
# Run from the host by `deploy/agents-engine/engine.sh prove` (the Author; Heavy: row E10 resets and
# reseeds the engine, and E14 needs dev-cpu up). One probe per row, E1-E16, each PASS or FAIL, with the
# plugin-log and egress-log excerpts and the firewall's drop counter. Its report goes into the
# merge-request note. Non-zero on any FAIL.
#
# API probes use the agents' client certificate, so they test exactly what a session can do; host-side
# probes use `sudo -u h4agents`. The sandbox's half of the opening is matrix stage S, run in a session.
# A row passes only on what it saw: a probe that can't run fails its row, and the detail says why. Every
# container, volume, link, and file a probe creates is removed when the probe ends, and again at exit.
#
# NEVER run from an agent session. Human-only (the FR-039 boundary).
set -uo pipefail # not -e: one failing probe must not hide the rest

here="$(cd -- "$(dirname -- "$0")" && pwd)"
repo="$(cd -- "$here/../.." && pwd)"
env_file="/etc/h4agents/engine.env"
lib="/usr/local/lib/h4agents" # the installed, root-owned copies that run
# Non-secret paths, from the file setup-host.sh wrote, with the defaults engine.sh uses on a fresh host.
H4_REPO="$repo"
H4_STATE="/var/lib/h4agents/state"
H4_MASKS="$lib/tree-masks.txt"
H4_AUTHZ_LOG="/var/log/h4agents/authz.jsonl"
H4_EGRESS_SETTINGS="$repo/.claude/settings.json"
H4_EGRESS_LOG="$HOME/.local/state/h4reet/agents-engine/egress.jsonl"
if [ -r "$env_file" ]; then
	# shellcheck disable=SC1090
	. "$env_file"
fi
repo="$H4_REPO" # the tree the engine binds, which setup-host.sh fixed

# The agents' client certificate (files 0444 in a 0555 directory, so the Author can read it). Every API probe
# uses it, as a session's client does (DOCKER_CONFIG, §2.3), so the probes test exactly what a session can do.
# No row needs the Author's own certificate (~/.config/h4reet-ai/agents-engine/docker): both identities are
# held to the same admission rules (§2.1). Only engine.sh uses it, which rows E7 (up) and E10 (reset) run.
agent_cert_dir="$HOME/.config/h4reet/agents-engine/docker"
engine_addr="tcp://198.18.0.1:2376"
proxy="http://198.18.0.1:3128"
egress_list="$HOME/.local/state/h4reet/agents-engine/egress-list.json" # the list the running proxy serves (§4)
data_root="/var/lib/h4agents/home/.local/share/docker"                 # the daemon's, as engine.sh reset deletes it
stack_ports=(18000 18001 18002 18003 18004 18100 18101 18102 18103 18104) # prod's and dev's published ports
# The probe image: the seeded python base, pinned by digest, so it resolves on the engine with no registry.
probe_image="${H4_PROBE_IMAGE:-}"
if [ -z "$probe_image" ]; then
	probe_image="$(awk '$1 == "base:python" && $4 ~ /^sha256:[0-9a-f]+$/ && length($4) == 71 {
		print $2 ":" $3 "@" $4; exit }' "$repo/deploy/images.lock" 2>/dev/null)"
fi
probe_image="${probe_image:-public.ecr.aws/docker/library/python:3.12.15-slim-trixie}"

pass=0
fail=0
work=""         # this run's temp directory (mktemp -d), removed at exit
planted=()      # files and links planted in the working tree, removed at exit
planted_h4=()   # links planted in the state root as h4agents, removed at exit
tree_masks=()   # the installed mask list (row E7)
refused_rule="" # the rule of the last refusal admission_refused saw
open_error=""   # the error of the last open h4agents_opens tried

record() { # record <id> <PASS|FAIL> <detail>
	if [ "$2" = PASS ]; then pass=$((pass + 1)); else fail=$((fail + 1)); fi
	printf '%-5s %-4s %s\n' "$1" "$2" "$3"
}
verdict() { if [ "$1" = true ]; then echo PASS; else echo FAIL; fi; }

# detail <ok> <claim> <facts> <seen> [<notes>]: the row's claim; then what proved it on a pass, or what was seen
# on a failure; then any notes, such as a stack that wasn't running to be probed.
detail() {
	local text="$2"
	if [ "$1" = true ]; then
		[ -z "$3" ] || text+=" -- ${3#; }"
	else
		text+=" -- seen: ${4#; }"
	fi
	[ -z "${5:-}" ] || text+=" (${5#; })"
	printf '%s' "$text"
}

# The engine, as a session's client reaches it (§2.3): the agents' DOCKER_CONFIG, TLS verified, this run's own
# BUILDX_CONFIG (the config directory is read-only), and none of the Author's own Docker or proxy settings.
engine_docker() {
	env -u DOCKER_CERT_PATH -u DOCKER_CONTEXT -u HTTPS_PROXY -u https_proxy -u HTTP_PROXY -u http_proxy \
		-u ALL_PROXY -u all_proxy -u NO_PROXY -u no_proxy \
		DOCKER_HOST="$engine_addr" DOCKER_TLS_VERIFY=1 DOCKER_CONFIG="$agent_cert_dir" BUILDX_CONFIG="$work/buildx" \
		docker "$@"
}
# The host's own rootful daemon, whatever the environment names.
host_docker() {
	env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
		docker -H unix:///var/run/docker.sock "$@"
}
as_h4agents() { sudo -u h4agents "$@"; }

# refusal_rule <output>: the rule the admission plugin named, or nothing. The daemon wraps the plugin's own
# message: "authorization denied by plugin h4-authz: refused by h4-authz (A1)".
refusal_rule() {
	grep -oE 'refused by h4-authz \([A-Za-z0-9_]+\)' <<<"$1" | head -n1 | sed -E 's/.*\((.*)\)/\1/'
}

# True when an engine command is refused by one of the admission plugin's rules: not merely any error, and not
# the plugin being down, whose errors name no rule (E12). Leaves the rule in refused_rule.
admission_refused() {
	local out
	refused_rule=""
	if out="$(engine_docker "$@" 2>&1)"; then return 1; fi
	refused_rule="$(refusal_rule "$out")"
	[ -n "$refused_rule" ]
}

# last_error <output>: the line that says what went wrong, shortened for a detail.
last_error() {
	local line
	line="$(grep -m1 -iE 'error|denied|refused|not allowed|failed|cannot|permission' <<<"$1")"
	[ -n "$line" ] || line="$(tail -n1 <<<"$1")"
	printf '%s' "${line:0:200}"
}
# outcome <status> <output>: what a command that should have been refused did instead.
outcome() { if [ "$1" -eq 0 ]; then echo "it ran"; else last_error "$2"; fi; }

# ------------------------------------------------------------------------------------------------
in_h4_subuids() { # in_h4_subuids <uid>: is it inside one of h4agents' subordinate uid ranges (/etc/subuid, H2)?
	awk -F: -v u="$1" -v n="$(id -u h4agents 2>/dev/null)" '
		($1 == "h4agents" || (n != "" && $1 == n)) && u + 0 >= $2 + 0 && u + 0 < $2 + $3 { found = 1 }
		END { exit !found }' /etc/subuid 2>/dev/null
}

e1_privileged() {
	local ok=true seen="" facts="" h4uid author_uid name=h4-prove-e1 out pid child role p cmd uids u bad
	# The container's root forks a child that drops to uid 1000; both sleep while the host looks at them.
	local script='import os, time
if os.fork() == 0:
    os.setgid(1000)
    os.setuid(1000)
    time.sleep(120)
    os._exit(0)
time.sleep(120)'
	h4uid="$(id -u h4agents 2>/dev/null)"
	author_uid="$(id -u)"
	if engine_docker info --format '{{json .SecurityOptions}}' 2>/dev/null | grep -q 'name=rootless'; then
		facts+="; the engine reports rootless"
	else
		ok=false
		seen+="; the engine doesn't report rootless"
	fi
	if pgrep -u h4agents -x dockerd >/dev/null 2>&1; then
		facts+="; its dockerd runs as h4agents"
	else
		ok=false
		seen+="; no dockerd runs as h4agents"
	fi
	if admission_refused run --rm --privileged "$probe_image" true; then
		facts+="; --privileged refused ($refused_rule)"
	else
		ok=false
		seen+="; --privileged wasn't refused by the plugin"
	fi
	if out="$(host_docker ps -a --format '{{.Names}} {{.Label "com.docker.compose.project"}}' 2>&1)"; then
		if grep -q 'h4reet-dev-cpu' <<<"$out"; then
			ok=false
			seen+="; a dev-cpu container on the host's daemon"
		else
			facts+="; no engine container on the host's daemon"
		fi
	else
		ok=false
		seen+="; the host's Docker didn't answer: $(last_error "$out")"
	fi
	# A container's processes, by owner on the host: its root runs as h4agents itself, and its uid 1000 as one of
	# h4agents' subordinate IDs (H2). Neither may be root or the Author. A process is the container's only if its
	# command line is this probe's script, whatever PID namespace or cgroup layout the daemon uses.
	engine_docker rm -f "$name" >/dev/null 2>&1
	if out="$(engine_docker run -d --name "$name" "$probe_image" python3 -I -c "$script" 2>&1)"; then
		sleep 2
		pid="$(engine_docker inspect --format '{{.State.Pid}}' "$name" 2>/dev/null)"
		child=""
		case "$pid" in
		'' | 0 | *[!0-9]*) pid="" ;;
		*) child="$(pgrep -P "$pid" 2>/dev/null | head -n1)" ;;
		esac
		for role in root "uid 1000"; do
			if [ "$role" = root ]; then p="$pid"; else p="$child"; fi
			cmd=""
			[ -z "$p" ] || cmd="$(tr '\0' ' ' 2>/dev/null <"/proc/$p/cmdline")"
			if [[ "$cmd" != *"os.setuid(1000)"* ]]; then
				ok=false
				seen+="; the container's $role has no process on the host's list"
				continue
			fi
			uids="$(awk '/^Uid:/ { print $2, $3, $4, $5 }' "/proc/$p/status" 2>/dev/null)"
			bad=""
			for u in $uids; do
				if [ "$u" = 0 ] || [ "$u" = "$author_uid" ]; then
					bad="$u"
				elif [ "$role" = root ] && [ "$u" != "$h4uid" ]; then
					bad="$u"
				elif [ "$role" != root ] && ! in_h4_subuids "$u"; then
					bad="$u"
				fi
			done
			if [ -z "$uids" ] || [ -n "$bad" ]; then
				ok=false
				seen+="; the container's $role ran on the host as uid ${bad:-unknown}"
			elif [ "$role" = root ]; then
				facts+="; a container's root ran as h4agents (uid ${uids%% *})"
			else
				facts+="; its uid 1000 as subordinate uid ${uids%% *}"
			fi
		done
	else
		ok=false
		seen+="; the probe container didn't start: $(last_error "$out")"
	fi
	engine_docker rm -f "$name" >/dev/null 2>&1
	record E1 "$(verdict $ok)" "$(detail "$ok" "the engine runs rootless, as h4agents' IDs, and refuses --privileged" "$facts" "$seen")"
}

e2_host_engine() {
	local ok=true
	as_h4agents test -r /var/run/docker.sock && ok=false
	admission_refused run --rm -v /var/run/docker.sock:/s "$probe_image" true || ok=false
	id -nG h4agents | tr ' ' '\n' | grep -qx docker && ok=false
	record E2 "$(verdict $ok)" "h4agents cannot open docker.sock; a bind of it is refused; not in the docker group"
}

# h4agents_opens <path> <read|write>: true when h4agents can open the path so; leaves the error in open_error.
h4agents_opens() {
	# shellcheck disable=SC2016 # $1 is the inner shell's: the path, passed as an argument, never as script text
	if [ "$2" = read ]; then
		open_error="$(as_h4agents sh -c ': <"$1"' sh "$1" 2>&1)"
	else
		open_error="$(as_h4agents sh -c ': >>"$1"' sh "$1" 2>&1)"
	fi
}

e3_gpu() {
	local ok=true seen="" facts="" notes="" out devs dev mode found=0
	if admission_refused run --rm --gpus all "$probe_image" true; then
		facts+="; --gpus all refused ($refused_rule)"
	else
		ok=false
		seen+="; --gpus all wasn't refused by the plugin"
	fi
	if admission_refused run --rm --device /dev/dxg "$probe_image" true; then
		facts+="; --device /dev/dxg refused ($refused_rule)"
	else
		ok=false
		seen+="; --device /dev/dxg wasn't refused by the plugin"
	fi
	if admission_refused run --rm --device-cgroup-rule 'c 10:200 rwm' "$probe_image" true; then
		facts+="; --device-cgroup-rule refused ($refused_rule)"
	else
		ok=false
		seen+="; --device-cgroup-rule wasn't refused by the plugin"
	fi
	# Inside a plain container, no GPU device: /dev/null in the listing is the control that the container ran.
	if out="$(engine_docker run --rm "$probe_image" ls -A /dev 2>&1)" && grep -qx null <<<"$out"; then
		devs="$(grep -E '^(dxg|nvidia)' <<<"$out" | paste -sd ' ' -)"
		if [ -n "$devs" ]; then
			ok=false
			seen+="; inside a plain container: $devs"
		else
			facts+="; no dxg or nvidia* device inside a plain container"
		fi
	else
		ok=false
		seen+="; the plain container didn't run: $(last_error "$out")"
	fi
	# On the host, h4agents opens no GPU device, for reading or for writing (H6).
	for dev in /dev/dxg /dev/nvidia*; do
		[ -e "$dev" ] || continue
		found=$((found + 1))
		for mode in read write; do
			if h4agents_opens "$dev" "$mode"; then
				ok=false
				seen+="; h4agents opened $dev for $mode"
			elif [[ "$open_error" != *"Permission denied"* ]]; then
				ok=false
				seen+="; h4agents opening $dev for $mode: ${open_error:-no error}"
			fi
		done
	done
	if [ "$found" -gt 0 ]; then
		facts+="; h4agents gets EACCES opening the host's $found GPU device(s)"
	else
		notes+="; the host has no /dev/dxg or /dev/nvidia* for h4agents to open"
	fi
	record E3 "$(verdict $ok)" "$(detail "$ok" "no GPU device reaches a container or h4agents" "$facts" "$seen" "$notes")"
}

# The IPv4 gateways of the host daemon's bridge networks.
host_bridge_gateways() {
	local -a nets=()
	mapfile -t nets < <(host_docker network ls -q --filter driver=bridge 2>/dev/null)
	[ "${#nets[@]}" -gt 0 ] || return 0
	host_docker network inspect --format '{{range .IPAM.Config}}{{println .Gateway}}{{end}}' "${nets[@]}" 2>/dev/null |
		grep -E '^[0-9]+(\.[0-9]+){3}$' | sort -u
}

# host_stack_targets <compose project>: address:port for each running container of the stack, at each of its
# addresses, on each port it exposes or publishes and on the stacks' own service ports.
host_stack_targets() {
	local ips ports ip port
	local -a ids=()
	mapfile -t ids < <(host_docker ps -q --filter "label=com.docker.compose.project=$1" 2>/dev/null)
	[ "${#ids[@]}" -gt 0 ] || return 0
	# shellcheck disable=SC2016 # Go template variables, not the shell's
	host_docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}|{{range $p, $v := .Config.ExposedPorts}}{{$p}} {{end}}{{range $p, $v := .NetworkSettings.Ports}}{{$p}} {{end}}' \
		"${ids[@]}" 2>/dev/null |
		while IFS='|' read -r ips ports; do
			for ip in $ips; do
				for port in $ports 8080/tcp 8081/tcp 8082/tcp 8083/tcp 8084/tcp 8090/tcp 5432/tcp; do
					case "$port" in */tcp) echo "$ip:${port%/tcp}" ;; esac
				done
			done
		done | sort -u
}

# The IPv4 subnets of the engine's own networks, comma-separated: an address inside one never leaves the engine.
engine_subnets() {
	local -a nets=()
	mapfile -t nets < <(engine_docker network ls -q 2>/dev/null)
	[ "${#nets[@]}" -gt 0 ] || return 0
	engine_docker network inspect --format '{{range .IPAM.Config}}{{println .Subnet}}{{end}}' "${nets[@]}" 2>/dev/null |
		grep -E '^[0-9]+(\.[0-9]+){3}/[0-9]+$' | paste -sd, -
}

e4_host_stacks() {
	local ok=true seen="" facts="" notes="" stack p a before after out rc nets reached outside shadowed probed
	local -a targets=() addrs=() gws=() stack_targets=()
	# From a probe container, every address of the host's stacks. Each connection leaves through slirp4netns as
	# h4agents: 10.0.2.2 is the host's loopback, closed by --disable-host-loopback (H5); the WSL address, the
	# bridges' gateways, and the stacks' containers meet the firewall (H4). An address inside one of the engine's
	# own networks never leaves the engine, so it isn't one of the host's: the probe sets it aside and counts it.
	# It prints "<reached> <left the engine> <set aside> <probed> reached: <targets>", and exits 3 if one answered.
	local script='import ipaddress, socket, sys
from concurrent.futures import ThreadPoolExecutor

nets = [ipaddress.ip_network(n, strict=False) for n in sys.argv[1].split(",") if n]


def inside_engine(target):
    try:
        address = ipaddress.ip_address(target.rpartition(":")[0])
    except ValueError:
        return False
    return any(address in net for net in nets)


def reaches(target):
    host, _, port = target.rpartition(":")
    sock = socket.socket()
    sock.settimeout(2)
    try:
        sock.connect((host, int(port)))
        return True
    except OSError:
        return False
    finally:
        sock.close()


targets = [t for t in sys.argv[2:] if not inside_engine(t)]
shadowed = len(sys.argv) - 2 - len(targets)
outside = sum(1 for t in targets if not t.startswith("10.0.2."))
with ThreadPoolExecutor(32) as pool:
    reached = [t for t, hit in zip(targets, pool.map(reaches, targets)) if hit]
print(len(reached), outside, shadowed, len(targets), "reached:", " ".join(reached[:10]))
sys.exit(3 if reached else 0)'
	for p in "${stack_ports[@]}"; do targets+=("10.0.2.2:$p"); done
	mapfile -t addrs < <(ip -4 -o addr show dev eth0 2>/dev/null | awk '{ split($4, a, "/"); print a[1] }')
	if [ "${#addrs[@]}" -gt 0 ]; then
		for a in "${addrs[@]}"; do
			for p in "${stack_ports[@]}"; do targets+=("$a:$p"); done
		done
		facts+="; the WSL address ${addrs[*]}"
	else
		ok=false
		seen+="; no IPv4 address on eth0, so the WSL address wasn't probed"
	fi
	mapfile -t gws < <(host_bridge_gateways)
	if [ "${#gws[@]}" -gt 0 ]; then
		for a in "${gws[@]}"; do
			for p in "${stack_ports[@]}"; do targets+=("$a:$p"); done
		done
		facts+="; ${#gws[@]} bridge gateways of the host's Docker"
	else
		ok=false
		seen+="; the host's Docker named no bridge gateway"
	fi
	for stack in prod dev; do
		mapfile -t stack_targets < <(host_stack_targets "h4reet-$stack")
		if [ "${#stack_targets[@]}" -gt 0 ]; then
			targets+=("${stack_targets[@]}")
			facts+="; $stack's containers (${#stack_targets[@]} address:port pairs)"
		else
			notes+="; $stack isn't running, so its containers weren't probed"
		fi
	done
	mapfile -t targets < <(printf '%s\n' "${targets[@]}" | sort -u)
	nets="$(engine_subnets)"
	before="$(nft_drop_count)"
	out="$(engine_docker run --rm "$probe_image" python3 -I -c "$script" "$nets" "${targets[@]}" 2>&1)"
	rc=$?
	after="$(nft_drop_count)"
	case "$rc" in
	0 | 3)
		read -r reached outside shadowed probed _ <<<"$(tail -n1 <<<"$out")"
		if [ "$rc" = 3 ]; then
			ok=false
			seen+="; a container reached ${reached:-some} of them: ${out##*reached: }"
		else
			facts+="; from a container, $probed probed and none reached"
			[ "${shadowed:-0}" = 0 ] || notes+="; $shadowed lie inside the engine's own networks, so they weren't probed"
		fi
		;;
	*)
		ok=false
		seen+="; the probe container didn't run: $(last_error "$out")"
		;;
	esac
	if [ -z "$before" ] || [ -z "$after" ]; then
		ok=false
		seen+="; the firewall's drop counter can't be read"
	elif [ "${outside:-0}" -gt 0 ]; then
		if [ "$after" -gt "$before" ]; then
			facts+="; the firewall's drop counter grew by $((after - before))"
		else
			ok=false
			seen+="; $outside probes left the engine, but the drop counter stayed at $before"
		fi
	elif [ "$rc" = 0 ]; then
		notes+="; every host address lies inside the engine's own networks, so no probe reached the firewall"
	fi
	record E4 "$(verdict $ok)" "$(detail "$ok" "no container reaches the host's stacks" "$facts" "$seen" "$notes")"
}

# link_refusal <status> <output>: how a bind through a planted link was refused, or nothing.
link_refusal() {
	local rule
	[ "$1" -ne 0 ] || return 0
	rule="$(refusal_rule "$2")"
	if [ -n "$rule" ]; then
		echo "the plugin ($rule)"
	elif grep -qiE 'too many levels of symbolic links|ELOOP' <<<"$2"; then
		echo ELOOP
	fi
}

e5_author_files() {
	local ok=true seen="" facts="" src out rc who link err d refused=0 profiles=0
	# (E5c) mount(2) for a tmpfs and for a bind; without CAP_SYS_ADMIN each gives EPERM. Exits 3 if one mounted.
	local mount_script='import ctypes, errno, sys
libc = ctypes.CDLL(None, use_errno=True)
libc.mount.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_ulong, ctypes.c_void_p]
seen = []
for source, fstype, flags in ((b"none", b"tmpfs", 0), (b"/", None, 4096)):
    if libc.mount(source, b"/mnt", fstype, flags, None) == 0:
        seen.append("mounted")
    else:
        number = ctypes.get_errno()
        seen.append(errno.errorcode.get(number, str(number)))
print("tmpfs: %s, bind: %s" % tuple(seen))
sys.exit(0 if all(s in ("EPERM", "EACCES") for s in seen) else 3)'
	# The probe's own mount table: past the root, the virtual filesystems, and the three files the daemon binds
	# itself, its only host mounts must be the tree and the models, both read-only. Exits 3 if not.
	local mounts_script='import sys
virtual = {"overlay", "proc", "sysfs", "tmpfs", "devpts", "mqueue", "cgroup", "cgroup2", "devtmpfs", "securityfs",
           "debugfs", "tracefs", "bpf", "pstore", "hugetlbfs", "fusectl", "configfs", "nsfs", "binfmt_misc", "autofs"}
daemon_files = {"/etc/resolv.conf", "/etc/hostname", "/etc/hosts"}
binds, other = {}, []
for line in open("/proc/self/mountinfo"):
    left, _, right = line.partition(" - ")
    fields = left.split()
    point, fstype = fields[4].replace("\\040", " "), right.split()[0]
    if point == "/" or point in daemon_files or fstype in virtual:
        continue
    if point in ("/tree", "/models"):
        binds[point] = "ro" if "ro" in fields[5].split(",") else "rw"
    else:
        other.append("%s (%s)" % (point, fstype))
tree, models = binds.get("/tree", "absent"), binds.get("/models", "absent")
print("tree %s, models %s%s" % (tree, models, "; also " + ", ".join(other) if other else ""))
sys.exit(0 if tree == models == "ro" and not other else 3)'
	for src in /home/h4reet "$HOME/.config/h4reet-ai" /run/WSL /run/dbus /mnt/c / /etc; do
		if admission_refused run --rm -v "$src:/x:ro" "$probe_image" true; then
			refused=$((refused + 1))
		else
			ok=false
			seen+="; -v $src wasn't refused by the plugin"
		fi
	done
	if admission_refused run --rm --mount "type=bind,src=/home/h4reet,dst=/x" "$probe_image" true; then
		refused=$((refused + 1))
	else
		ok=false
		seen+="; --mount of /home/h4reet wasn't refused by the plugin"
	fi
	# A local volume that binds a host path is a bind in disguise.
	if admission_refused volume create --driver local -o type=none -o o=bind -o device=/home/h4reet h4probe; then
		refused=$((refused + 1))
	else
		ok=false
		seen+="; a local volume binding /home/h4reet wasn't refused by the plugin"
	fi
	engine_docker volume rm h4probe >/dev/null 2>&1
	# A read-write bind of the read-only tree is refused.
	if admission_refused run --rm -v /run/h4agents/tree:/x:rw "$probe_image" true; then
		refused=$((refused + 1))
	else
		ok=false
		seen+="; a read-write bind of the tree wasn't refused by the plugin"
	fi
	facts+="; all $refused binds of the Author's files refused"
	# (E5c) A bind through a symlink to /etc, planted in the tree and in the state root. The plugin resolves a
	# source's real path and refuses one that leaves its root (A14); behind it, the roots are mounted nosymfollow,
	# so the kernel refuses to follow the link (ELOOP). Either refusal passes, and the detail names which.
	# -T: never inside a directory that happens to have the name; nothing that exists is ever replaced.
	link="$repo/.h4-prove-e5c"
	if ln -sT /etc "$link" 2>/dev/null; then
		planted+=("$link")
		out="$(engine_docker run --rm -v /run/h4agents/tree/.h4-prove-e5c:/x:ro "$probe_image" ls /x 2>&1)"
		rc=$?
		rm -f -- "$link"
		who="$(link_refusal "$rc" "$out")"
		if [ -n "$who" ]; then
			facts+="; (E5c) a bind through a link in the tree refused by $who"
		else
			ok=false
			seen+="; (E5c) a bind through a link in the tree: $(outcome "$rc" "$out")"
		fi
	else
		ok=false
		seen+="; (E5c) couldn't plant a link at $link"
	fi
	link="$H4_STATE/.h4-prove-e5c"
	if as_h4agents ln -sT /etc "$link" 2>/dev/null; then
		planted_h4+=("$link")
		out="$(engine_docker run --rm -v "$link:/x" "$probe_image" ls /x 2>&1)"
		rc=$?
		as_h4agents rm -f -- "$link"
		who="$(link_refusal "$rc" "$out")"
		if [ -n "$who" ]; then
			facts+="; one in the state root by $who"
		else
			ok=false
			seen+="; (E5c) a bind through a link in the state root: $(outcome "$rc" "$out")"
		fi
	else
		ok=false
		seen+="; (E5c) couldn't plant a link at $link as h4agents"
	fi
	out="$(engine_docker run --rm "$probe_image" python3 -I -c "$mount_script" 2>&1)"
	rc=$?
	case "$rc" in
	0) facts+="; a mount inside a container refused ($(tail -n1 <<<"$out"))" ;;
	3)
		ok=false
		seen+="; (E5c) a mount inside a container: $(tail -n1 <<<"$out")"
		;;
	*)
		ok=false
		seen+="; (E5c) the mount probe didn't run: $(last_error "$out")"
		;;
	esac
	# (E5d) h4agents can list neither /mnt/c/Users nor any profile in it (H7), where the Author can.
	if ls /mnt/c/Users >/dev/null 2>&1; then
		for d in /mnt/c/Users /mnt/c/Users/*/; do
			[ -d "$d" ] || continue
			profiles=$((profiles + 1))
			if err="$(as_h4agents ls -- "$d" 2>&1 >/dev/null)"; then
				ok=false
				seen+="; (E5d) h4agents listed $d"
			elif [[ "$err" != *"Permission denied"* ]]; then
				ok=false
				seen+="; (E5d) h4agents listing $d: ${err:-no error}"
			fi
		done
		facts+="; (E5d) h4agents gets EACCES listing /mnt/c/Users and the $((profiles - 1)) profiles in it"
	else
		ok=false
		seen+="; (E5d) the Author can't list /mnt/c/Users, so the probe proves nothing"
	fi
	out="$(engine_docker run --rm -v /run/h4agents/tree:/tree:ro -v /run/h4agents/models:/models:ro \
		"$probe_image" python3 -I -c "$mounts_script" 2>&1)"
	rc=$?
	case "$rc" in
	0) facts+="; the probe's only host mounts are the tree and the models, both read-only" ;;
	3)
		ok=false
		seen+="; the probe's host mounts: $(tail -n1 <<<"$out")"
		;;
	*)
		ok=false
		seen+="; the mount-table probe didn't run: $(last_error "$out")"
		;;
	esac
	record E5 "$(verdict $ok)" "$(detail "$ok" "no container reaches the Author's files" "$facts" "$seen")"
}

e6_readonly_tree() {
	local ok=true
	engine_docker run --rm -v /run/h4agents/tree:/tree:ro "$probe_image" \
		sh -c 'touch /tree/__probe 2>/dev/null' >/dev/null 2>&1 && ok=false
	engine_docker run --rm -v /run/h4agents/tree:/tree:ro "$probe_image" \
		sh -c 'mount -o remount,rw /tree 2>/dev/null' >/dev/null 2>&1 && ok=false
	record E6 "$(verdict $ok)" "a write to the tree gives EROFS; remount,rw is refused"
}

# deny_tree_rel <fs|rule> <entry>: the tree-relative path a sandbox read deny names, or nothing when it names a
# path outside the tree, or a glob (the env-file probe covers .env* and *.env). The two layers spell paths
# differently: in sandbox.filesystem a leading / is absolute; in a Read() rule it is the project's root, and //
# is absolute (Claude Code's permission syntax). A trailing /** names the directory itself.
deny_tree_rel() {
	local layer="$1" path="$2"
	# shellcheck disable=SC2088 # a literal ~/ is what this matches
	case "$path" in
	"~/"*) path="$HOME/${path#"~/"}" ;;
	//*) path="/${path#//}" ;;
	/*) if [ "$layer" = rule ]; then path="$repo/${path#/}"; fi ;;
	*) path="$repo/${path#./}" ;;
	esac
	path="${path%"/**"}"
	path="${path%/}"
	case "$path" in *'*'* | *'?'* | *'['*) return 0 ;; esac
	case "$path" in
	"$repo") echo . ;;
	"$repo"/*) echo "${path#"$repo"/}" ;;
	esac
}

# mask_covers <tree-relative path>: is it a masked path, or inside one?
mask_covers() {
	local mask
	for mask in "${tree_masks[@]}"; do
		[ "$1" = "$mask" ] && return 0
		case "$1" in "$mask"/*) return 0 ;; esac
	done
	return 1
}

e7_hidden_paths() {
	local ok=true seen="" facts="" denies layer entry rel out rc mask planted_file n=0
	local -a existing=()
	# Inside a container with the tree bound: each listed path that exists must be a mount in the container's own
	# table, read-only, and empty. A listing alone can't tell: a mask is mode 0000, and the directory under it is
	# the Author's 0700, so a container can list neither. Then no env file but a template may be visible anywhere
	# in the tree; the tree's own copy of the list is the control that the walk saw the tree at all. Exits 3 on any
	# finding.
	local script='import fnmatch, os, stat, sys
masks = sys.argv[1:]
mounts = {}
for line in open("/proc/self/mountinfo"):
    left, _, right = line.partition(" - ")
    fields = left.split()
    mounts[fields[4].replace("\\040", " ")] = (right.split()[0], fields[5].split(","))
issues = []
for rel in masks:
    path = "/tree/" + rel
    if path not in mounts:
        issues.append(rel + " is not masked")
        continue
    fstype, options = mounts[path]
    if "ro" not in options:
        issues.append(rel + " is writable")
    try:
        info = os.lstat(path)
        if stat.S_ISDIR(info.st_mode):
            if fstype != "tmpfs":
                issues.append(rel + " is " + fstype + ", not a tmpfs mask")
            elif os.listdir(path):
                issues.append(rel + " is not empty")
        elif info.st_size:
            issues.append(rel + " is not empty")
    except PermissionError:
        pass  # the mask is mode 0000 to a container: nothing to list
env, walked = [], 0
for root, _, files in os.walk("/tree"):
    for name in files:
        walked += 1
        template = fnmatch.fnmatchcase(name, "*.env.example")
        if not template and (fnmatch.fnmatchcase(name, "*.env") or fnmatch.fnmatchcase(name, ".env.*")):
            path = os.path.join(root, name)
            try:
                if stat.S_ISREG(os.lstat(path).st_mode):
                    env.append(path[len("/tree/"):])
            except OSError:
                pass
if not os.path.isfile("/tree/deploy/agents-engine/tree-masks.txt"):
    issues.append("the tree is not visible")
if env:
    issues.append("env files visible: " + ", ".join(sorted(env)[:5]))
print("%d masks, %d files walked%s" % (len(masks), walked, "; " + "; ".join(issues) if issues else ""))
sys.exit(3 if issues else 0)'
	# The installed list is the one bind-tree.sh mounts; engine.sh up refuses while it differs from the tree's.
	if ! cmp -s "$here/tree-masks.txt" "$H4_MASKS"; then
		ok=false
		seen+="; the installed $H4_MASKS isn't the tree's tree-masks.txt (engine.sh setup installs it)"
	fi
	mapfile -t tree_masks < <(grep -vE '^[[:space:]]*(#|$)' "$H4_MASKS" 2>/dev/null)
	if [ "${#tree_masks[@]}" -eq 0 ]; then
		ok=false
		seen+="; no mask in $H4_MASKS"
	fi
	# On the host: every read deny of the sandbox that names a path inside the tree is masked (H8), from both
	# layers of .claude/settings.json.
	if denies="$(jq -r '((.sandbox.filesystem.denyRead // [])[] | strings | "fs\t" + .),
		((.permissions.deny // [])[] | strings | select(startswith("Read(") and endswith(")")) | "rule\t" + .[5:-1])' \
		"$H4_EGRESS_SETTINGS" 2>/dev/null)"; then
		while IFS=$'\t' read -r layer entry; do
			[ -n "$entry" ] || continue
			rel="$(deny_tree_rel "$layer" "$entry")"
			[ -n "$rel" ] || continue
			n=$((n + 1))
			if ! mask_covers "$rel"; then
				ok=false
				seen+="; the sandbox read-denies $rel, which no mask covers"
			fi
		done <<<"$denies"
		facts+="; the sandbox's $n read denies inside the tree are all masked"
	else
		ok=false
		seen+="; the sandbox's read denies can't be read from $H4_EGRESS_SETTINGS"
	fi
	for mask in "${tree_masks[@]}"; do
		if [ -e "$repo/$mask" ] || [ -L "$repo/$mask" ]; then existing+=("$mask"); fi
	done
	out="$(engine_docker run --rm -v /run/h4agents/tree:/tree:ro "$probe_image" python3 -I -c "$script" "${existing[@]}" 2>&1)"
	rc=$?
	case "$rc" in
	0) facts+="; inside a container, $(tail -n1 <<<"$out"): every mask read-only and empty, no env file" ;;
	3)
		ok=false
		seen+="; inside a container: $(tail -n1 <<<"$out")"
		;;
	*)
		ok=false
		seen+="; the probe container didn't run: $(last_error "$out")"
		;;
	esac
	# engine.sh up refuses while an env file sits outside a mask, and names it. Never over an existing file.
	planted_file="$repo/__h4-prove-e7.env"
	if (set -C && : >"$planted_file") 2>/dev/null; then
		planted+=("$planted_file")
		out="$("$here/engine.sh" up 2>&1)"
		rc=$?
		rm -f -- "$planted_file"
		if [ "$rc" -eq 0 ]; then
			ok=false
			seen+="; engine.sh up ran with ${planted_file##*/} planted"
		elif grep -qF "${planted_file##*/}" <<<"$out"; then
			facts+="; engine.sh up refused, naming ${planted_file##*/}"
		else
			ok=false
			seen+="; engine.sh up refused without naming ${planted_file##*/}: $(last_error "$out")"
		fi
	else
		ok=false
		seen+="; couldn't plant $planted_file"
	fi
	record E7 "$(verdict $ok)" "$(detail "$ok" "a container sees the tree without the paths the sandbox denies" "$facts" "$seen")"
}

# proxied <url>: "<the proxy's answer to CONNECT> <the origin's HTTP status>" for a request through the engine's
# proxy as h4agents, whom the firewall lets reach the proxy and nothing else (H4). 000 means no answer.
proxied() {
	local out
	out="$(as_h4agents curl -q -s -o /dev/null --max-time 15 --noproxy '' -p -x "$proxy" \
		-w '%{http_connect} %{http_code}' "$1" 2>/dev/null)" || true
	printf '%s\n' "${out:-000 000}"
}

# egress_log_lines: how many lines the proxy's log holds, so a probe reads only the lines it caused.
egress_log_lines() {
	if [ -r "$H4_EGRESS_LOG" ]; then wc -l <"$H4_EGRESS_LOG" | tr -d ' '; else echo 0; fi
}

# egress_logged <since> <host> <port>: "<decision>:<reason>" from the proxy's last line for host:port after line
# <since>, waiting up to 5 s: a tunnel is logged when it closes, and a refusal just after its answer.
egress_logged() {
	local logged="" _
	for _ in 1 2 3 4 5 6 7 8 9 10; do
		# shellcheck disable=SC2016 # jq's variables, not the shell's
		logged="$(tail -n +"$(($1 + 1))" "$H4_EGRESS_LOG" 2>/dev/null |
			jq -rR --arg h "$2" --argjson p "$3" 'fromjson? | select(.host == $h and .port == $p) | "\(.decision):\(.reason)"' \
				2>/dev/null | tail -n1)"
		[ -z "$logged" ] || break
		sleep 0.5
	done
	printf '%s' "$logged"
}

# build_refusal <status> <output>: who refused a build that asked for host networking, or nothing.
build_refusal() {
	local rule
	[ "$1" -ne 0 ] || return 0
	rule="$(refusal_rule "$2")"
	if [ -n "$rule" ]; then
		echo "the plugin ($rule)"
	elif grep -qiE 'not allowed by build daemon configuration|network\.host is not allowed' <<<"$2"; then
		echo "the daemon's entitlements"
	fi
}

# drop_built <iidfile>: remove the image a build that should have been refused left behind.
drop_built() {
	local id
	id="$(cat -- "$1" 2>/dev/null)"
	[ -z "$id" ] || engine_docker image rm -f "$id" >/dev/null 2>&1
	rm -f -- "$1"
}

e8_egress() {
	local ok=true seen="" facts="" since conn code reason host dest out rc who running current expected lrc=0
	# Without the proxy: TCP to 1.1.1.1:443, and a DNS query through the engine's resolver. Exits 3 if either
	# answered.
	local script='import socket, sys, threading
seen, broke = [], False
sock = socket.socket()
sock.settimeout(3)
try:
    sock.connect(("1.1.1.1", 443))
    seen.append("1.1.1.1:443 connected")
    broke = True
except OSError as error:
    seen.append("1.1.1.1:443 " + type(error).__name__)
finally:
    sock.close()
answer = {}


def lookup():
    try:
        answer["address"] = socket.getaddrinfo("example.com", 443)[0][4][0]
    except OSError as error:
        answer["error"] = type(error).__name__


thread = threading.Thread(target=lookup, daemon=True)
thread.start()
thread.join(15)
if "address" in answer:
    seen.append("example.com resolved to " + answer["address"])
    broke = True
else:
    seen.append("example.com " + answer.get("error", "unanswered in 15 s"))
print(", ".join(seen))
sys.exit(3 if broke else 0)'
	since="$(egress_log_lines)"
	# Through the proxy, as h4agents. npm is the control: allowed, end to end.
	read -r conn code <<<"$(proxied https://registry.npmjs.org/)"
	if [ "$conn" = 200 ] && [ "$code" = 200 ]; then
		facts+="; npm 200 through the proxy"
	else
		ok=false
		seen+="; npm through the proxy: CONNECT $conn, HTTP $code"
	fi
	# Unlisted hosts: refused (403) and logged, as not_on_list, or denied_domain for a host the settings deny.
	for host in example.com github.com api.anthropic.com; do
		read -r conn code <<<"$(proxied "https://$host/")"
		reason="$(egress_logged "$since" "$host" 443)"
		if [ "$conn" != 403 ]; then
			ok=false
			seen+="; CONNECT $host:443 answered $conn"
		elif [ "$reason" != refused:not_on_list ] && [ "$reason" != refused:denied_domain ]; then
			ok=false
			seen+="; CONNECT $host:443 logged ${reason:-nothing}"
		fi
	done
	# IP destinations, the opening and the instance-metadata address among them: refused as IP literals, and
	# logged so (§4). -p sends a CONNECT for the http:// ones too.
	for dest in 198.18.0.1:2376 10.0.0.1:443 169.254.169.254:80; do
		read -r conn code <<<"$(proxied "http://$dest/")"
		reason="$(egress_logged "$since" "${dest%:*}" "${dest##*:}")"
		if [ "$conn" != 403 ]; then
			ok=false
			seen+="; CONNECT $dest answered $conn"
		elif [ "$reason" != refused:ip_literal ]; then
			ok=false
			seen+="; CONNECT $dest logged ${reason:-nothing}, not refused:ip_literal"
		fi
	done
	facts+="; example.com, github.com, api.anthropic.com, and CONNECTs to 198.18.0.1:2376, 10.0.0.1:443, and"
	facts+=" 169.254.169.254:80 refused (403) and logged (ip_literal for the IPs)"
	# Without the proxy, from a container: no route out, and no DNS answer.
	out="$(engine_docker run --rm "$probe_image" python3 -I -c "$script" 2>&1)"
	rc=$?
	case "$rc" in
	0) facts+="; without it, from a container: $(tail -n1 <<<"$out")" ;;
	3)
		ok=false
		seen+="; without the proxy, from a container: $(tail -n1 <<<"$out")"
		;;
	*)
		ok=false
		seen+="; the no-route probe didn't run: $(last_error "$out")"
		;;
	esac
	# (E8c) Builds that ask for host networking. BuildKit carries the request inside its stream, which the plugin
	# can't read, so the daemon's entitlements refuse it (daemon.json grants no network-host); the classic
	# builder's POST /build carries networkmode=host, which the plugin refuses (A30). Either refusal passes, and the
	# detail names which. An image a build left behind is removed.
	mkdir -p -- "$work/e8c"
	printf 'FROM %s\nRUN --network=host true\n' "$probe_image" >"$work/e8c/Dockerfile"
	out="$(engine_docker buildx build --allow network.host --progress plain --iidfile "$work/e8c.iid" "$work/e8c" 2>&1)"
	rc=$?
	drop_built "$work/e8c.iid"
	who="$(build_refusal "$rc" "$out")"
	if [ -n "$who" ]; then
		facts+="; (E8c) a BuildKit RUN --network=host refused by $who"
	else
		ok=false
		seen+="; (E8c) a BuildKit RUN --network=host: $(outcome "$rc" "$out")"
	fi
	printf 'FROM %s\nRUN true\n' "$probe_image" >"$work/e8c/Dockerfile"
	out="$(DOCKER_BUILDKIT=0 engine_docker build --network host --iidfile "$work/e8c.iid" "$work/e8c" 2>&1)"
	rc=$?
	drop_built "$work/e8c.iid"
	who="$(build_refusal "$rc" "$out")"
	if [ -n "$who" ]; then
		facts+="; the classic docker build --network host by $who"
	else
		ok=false
		seen+="; (E8c) the classic docker build --network host: $(outcome "$rc" "$out")"
	fi
	# (E8d) The list the running proxy wrote when it started, against the proxy's own reading of the settings now,
	# and that against allowedDomains' hostnames, IP literals and host:port entries (the opening) dropped (§4).
	# The timeout bounds an installed copy older than --list, which would start serving instead of answering.
	running="$(jq -ce 'select((.digest | type) == "string" and (.hosts | type) == "array")' "$egress_list" 2>/dev/null)" ||
		running=""
	current="$(timeout 10 python3 -I -B -X pycache_prefix=/dev/null "$lib/egress-proxy.py" --list "$H4_EGRESS_SETTINGS" \
		2>/dev/null)" || lrc=$?
	expected="$(jq -c '[(.sandbox.network.allowedDomains // [])[] | strings | gsub("^\\s+|\\s+$"; "")
		| select(length > 0 and (test(":") | not) and (ltrimstr("*.") | test("^[0-9]+(\\.[0-9]+){3}$") | not))
		| ascii_downcase] | unique' "$H4_EGRESS_SETTINGS" 2>/dev/null)" || expected=""
	# shellcheck disable=SC2016 # jq's variables, not the shell's
	if [ -z "$running" ]; then
		ok=false
		seen+="; (E8d) no list from the running proxy in $egress_list"
	elif [ "$lrc" -ne 0 ] || [ -z "$current" ]; then
		ok=false
		seen+="; (E8d) egress-proxy.py --list exited $lrc"
	elif ! jq -en --argjson r "$running" --argjson c "$current" '$r.digest == $c.digest and $r.hosts == $c.hosts' \
		>/dev/null 2>&1; then
		ok=false
		seen+="; (E8d) the running proxy's list isn't the settings' (engine.sh up restarts it)"
	elif ! jq -en --argjson c "$current" --argjson e "${expected:-null}" \
		'$e != null and ($e | length) > 0 and ($c.hosts | unique) == $e' >/dev/null 2>&1; then
		ok=false
		seen+="; (E8d) the proxy's list isn't allowedDomains' hostnames"
	else
		facts+="; (E8d) the running proxy's list is the settings' ($(jq -r '.hosts | length' <<<"$current") hosts)"
	fi
	record E8 "$(verdict $ok)" "$(detail "$ok" "the engine's egress is the sandbox's allowlist, through the proxy only" "$facts" "$seen")"
}

# tls_ping <ca file> [curl options...]: "<HTTP status> <curl's exit> <the TLS alert>" for GET /_ping at the
# engine's address, the server verified with the given CA. HTTP status 000 means no HTTP answer at all.
tls_ping() {
	local ca="$1" code rc=0 alert
	shift
	code="$(curl -q -sS -o /dev/null --noproxy '*' --http1.1 --max-time 10 --cacert "$ca" "$@" -w '%{http_code}' \
		https://198.18.0.1:2376/_ping 2>"$work/tls.err")" || rc=$?
	alert="$(grep -oE 'alert [a-z ]*[a-z]' "$work/tls.err" 2>/dev/null | head -n1)"
	printf '%s %s %s\n' "${code:-000}" "$rc" "${alert:-no TLS alert}"
}

# foreign_client_cert <directory>: a throwaway CA the engine doesn't know, and a client certificate it signed with
# the agents' own common name, so only the signature differs. The directory is inside this run's work
# directory, which is removed at exit.
foreign_client_cert() {
	mkdir -p -- "$1" &&
		openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 1 \
			-subj "/CN=h4-prove-foreign-ca" -keyout "$1/ca-key.pem" -out "$1/ca.pem" >/dev/null 2>&1 &&
		openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
			-subj "/CN=h4agents-sandbox" -keyout "$1/key.pem" -out "$1/req.pem" >/dev/null 2>&1 &&
		printf 'extendedKeyUsage=clientAuth\n' >"$1/ext" &&
		openssl x509 -req -in "$1/req.pem" -CA "$1/ca.pem" -CAkey "$1/ca-key.pem" -set_serial 1 -days 1 \
			-extfile "$1/ext" -out "$1/cert.pem" >/dev/null 2>&1
}

e9_opening() {
	local ok=true seen="" facts="" notes="" h4uid author_uid listeners line addr port pid comm uid cmd wild
	local ca code rc alert n2376=0 n3128=0
	local -a pids=()
	h4uid="$(id -u h4agents 2>/dev/null)"
	author_uid="$(id -u)"
	# The listeners on 198.18.0.1, with their processes and owners, as root so ss can name every process (H3).
	if listeners="$(sudo ss -ltnpH 2>/dev/null)"; then
		while IFS= read -r line; do
			addr="$(awk '{ print $4 }' <<<"$line")"
			port="${addr##*:}"
			mapfile -t pids < <(grep -oE 'pid=[0-9]+' <<<"$line" | cut -d= -f2 | sort -u)
			if [ "${#pids[@]}" -eq 0 ]; then
				ok=false
				seen+="; $addr has no process ss can name"
				continue
			fi
			for pid in "${pids[@]}"; do
				comm="$(ps -o comm= -p "$pid" 2>/dev/null)"
				uid="$(ps -o uid= -p "$pid" 2>/dev/null | tr -d ' ')"
				cmd="$(tr '\0' ' ' 2>/dev/null <"/proc/$pid/cmdline")"
				case "$port" in
				2376)
					if [ "$comm" = rootlesskit ] && [ -n "$h4uid" ] && [ "$uid" = "$h4uid" ]; then
						n2376=$((n2376 + 1))
					else
						ok=false
						seen+="; $comm (uid $uid) serves $addr, not RootlessKit as h4agents"
					fi
					;;
				3128)
					if [[ "$cmd" == *"$lib/egress-proxy.py"* ]] && [ "$uid" = "$author_uid" ]; then
						n3128=$((n3128 + 1))
					else
						ok=false
						seen+="; $comm (uid $uid) serves $addr, not the proxy as the Author"
					fi
					;;
				*)
					ok=false
					seen+="; $comm (uid $uid) also listens on $addr"
					;;
				esac
			done
		done < <(awk '$4 ~ /^(198\.18\.0\.1|\[::ffff:198\.18\.0\.1\])(%[^:]*)?:[0-9]+$/' <<<"$listeners")
		if [ "$n2376" -eq 0 ]; then
			ok=false
			seen+="; nothing listens on 198.18.0.1:2376"
		fi
		if [ "$n3128" -eq 0 ]; then
			ok=false
			seen+="; nothing listens on 198.18.0.1:3128"
		fi
		wild="$(awk '$4 ~ /^(0\.0\.0\.0|\*|\[::\])(%[^:]*)?:(2376|3128)$/ { print $4 }' <<<"$listeners" | paste -sd ' ' -)"
		if [ -n "$wild" ]; then
			ok=false
			seen+="; a wildcard listener holds the engine's ports: $wild"
		fi
		facts+="; on 198.18.0.1, only RootlessKit as h4agents on 2376 and the proxy as the Author on 3128"
		# A wildcard listener on another port answers at 198.18.0.1 too, but only from the host: neither the
		# opening (2376 only, stage S) nor the firewall (3128 only, H4) reaches its port. A note, not a failure.
		wild="$(awk '$4 ~ /^(0\.0\.0\.0|\*|\[::\])(%[^:]*)?:[0-9]+$/ { n = split($4, a, ":"); print a[n] }' \
			<<<"$listeners" | sort -un | paste -sd ' ' -)"
		[ -z "$wild" ] || notes+="; wildcard listeners on ports $wild also answer at 198.18.0.1, from the host only"
	else
		ok=false
		seen+="; ss couldn't list the listeners"
	fi
	# The TLS layer, the server verified with the engine's CA, judged by a real GET /_ping: TLS 1.3 reports a
	# missing client certificate after the handshake, so the handshake's exit status alone would prove nothing.
	# The agents' certificate is the control; without its 200, the refusals would prove nothing either.
	ca="$work/engine-ca.pem"
	# The PKI directory is 0750 root:h4agents, so only the read needs root; the copy is written as the Author, into
	# this run's own work directory, which is what the redirect outside sudo does.
	# shellcheck disable=SC2024
	if sudo cat /etc/h4agents/pki/ca.pem >"$ca" 2>/dev/null && [ -s "$ca" ]; then
		if ! cmp -s "$ca" "$agent_cert_dir/ca.pem"; then
			ok=false
			seen+="; the agents' ca.pem isn't the engine's CA"
		fi
		read -r code rc alert <<<"$(tls_ping "$ca" --cert "$agent_cert_dir/cert.pem" --key "$agent_cert_dir/key.pem")"
		if [ "$code" = 200 ]; then
			facts+="; with the agents' certificate, /_ping answers 200"
		else
			ok=false
			seen+="; with the agents' certificate, HTTP $code (curl exit $rc, $alert)"
		fi
		read -r code rc alert <<<"$(tls_ping "$ca")"
		case "$code:$rc" in
		000:35 | 000:52 | 000:56) facts+="; with no certificate, refused before any HTTP answer ($alert)" ;;
		*)
			ok=false
			seen+="; with no client certificate, HTTP $code (curl exit $rc)"
			;;
		esac
		if foreign_client_cert "$work/foreign"; then
			read -r code rc alert <<<"$(tls_ping "$ca" --cert "$work/foreign/cert.pem" --key "$work/foreign/key.pem")"
			case "$code:$rc" in
			000:35 | 000:52 | 000:56) facts+="; with another CA's, refused the same way ($alert)" ;;
			*)
				ok=false
				seen+="; with another CA's certificate, HTTP $code (curl exit $rc)"
				;;
			esac
		else
			ok=false
			seen+="; openssl couldn't make another CA's certificate"
		fi
	else
		ok=false
		seen+="; the engine's CA, /etc/h4agents/pki/ca.pem, can't be read"
	fi
	notes+="; the session's half is stage S"
	record E9 "$(verdict $ok)" "$(detail "$ok" "198.18.0.1 serves only the engine, behind mutual TLS, and the proxy" "$facts" "$seen" "$notes")"
}

# seed_refs: the images engine.sh seed loads, listed as it lists them: every pinned images.lock entry but the
# GPU-only ones, as repository:tag@digest (§6.2).
seed_refs() {
	awk '!/^#/ && NF >= 4 && $4 ~ /^sha256:[0-9a-f]+$/ && length($4) == 71 && $1 != "model-server-gpu" && $1 != "probe:cuda" {
		print $2 ":" $3 "@" $4
	}' "$repo/deploy/images.lock" 2>/dev/null | sort -u
}

e10_disposable() {
	local ok=true seen="" facts="" before after out rc vols ctrs left root owned ref missing=0
	local -a refs=()
	before="$(engine_docker info --format '{{.ID}}' 2>/dev/null)"
	if [ -z "$before" ]; then
		ok=false
		seen+="; the engine didn't answer before the reset"
	fi
	out="$("$here/engine.sh" reset 2>&1)"
	rc=$?
	if [ "$rc" -ne 0 ]; then
		ok=false
		seen+="; engine.sh reset failed: $(last_error "$out")"
	fi
	after="$(engine_docker info --format '{{.ID}}' 2>/dev/null)"
	if [ -z "$after" ]; then
		ok=false
		seen+="; the engine didn't answer after the reset"
	elif [ "$after" = "$before" ]; then
		ok=false
		seen+="; the engine's ID didn't change"
	else
		facts+="; a new engine ID"
	fi
	if vols="$(engine_docker volume ls -q 2>/dev/null)" && ctrs="$(engine_docker ps -aq 2>/dev/null)"; then
		if [ -n "$vols" ] || [ -n "$ctrs" ]; then
			ok=false
			seen+="; $(grep -c . <<<"$vols") volume(s) and $(grep -c . <<<"$ctrs") container(s) survived"
		else
			facts+="; no volume or container"
		fi
	else
		ok=false
		seen+="; the engine's volumes and containers can't be listed"
	fi
	if sudo test -d "$H4_STATE"; then
		left="$(sudo find "$H4_STATE" -mindepth 1 -print -quit 2>/dev/null)"
		if [ -n "$left" ]; then
			ok=false
			seen+="; the state root still holds ${left#"$H4_STATE"/}"
		else
			facts+="; an empty state root"
		fi
	else
		ok=false
		seen+="; no state root at $H4_STATE"
	fi
	# No file of the Author's uid under the daemon's data root: nothing the Author needs lives there.
	root="$(engine_docker info --format '{{.DockerRootDir}}' 2>/dev/null)"
	root="${root:-$data_root}"
	if sudo test -d "$root"; then
		owned="$(sudo find "$root" -xdev -uid "$(id -u)" -print -quit 2>/dev/null)"
		if [ -n "$owned" ]; then
			ok=false
			seen+="; the Author owns ${owned#"$root"/} under the data root"
		else
			facts+="; no file of the Author's under $root"
		fi
	else
		ok=false
		seen+="; no data root at $root"
	fi
	# Every image the seed loads is back: engine.sh reset seeds again as its last step.
	mapfile -t refs < <(seed_refs)
	for ref in "${refs[@]}"; do
		engine_docker image inspect "$ref" >/dev/null 2>&1 || missing=$((missing + 1))
	done
	if [ "${#refs[@]}" -eq 0 ]; then
		ok=false
		seen+="; images.lock pins no image to check"
	elif [ "$missing" -gt 0 ]; then
		ok=false
		seen+="; $missing of the ${#refs[@]} seeded images are missing"
	else
		facts+="; all ${#refs[@]} seeded images back"
	fi
	record E10 "$(verdict $ok)" "$(detail "$ok" "engine.sh reset leaves a new engine holding only the seeded images" "$facts" "$seen")"
}

# newest_file <directory> <name pattern>...: the newest regular file below it whose name matches a pattern.
newest_file() {
	local dir="$1" pattern
	local -a match=()
	shift
	for pattern in "$@"; do match+=(-o -name "$pattern"); done
	find "$dir" -type f \( "${match[@]:1}" \) -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -n1 | cut -d' ' -f2-
}

e11_home() {
	local ok=true seen="" facts="" err file shown
	if err="$(as_h4agents ls -- "$HOME" 2>&1 >/dev/null)"; then
		ok=false
		seen+="; h4agents listed $HOME"
	elif [[ "$err" == *"Permission denied"* ]]; then
		facts+="; listing $HOME: EACCES"
	else
		ok=false
		seen+="; h4agents listing $HOME: ${err:-no error}"
	fi
	# A file inside ~/.config/h4reet-ai, the newest token or env file, else any file there. Reading the directory
	# itself fails whatever its permissions, so it would prove nothing. Only a first byte is read, and it is
	# discarded, never captured: only the error is kept.
	file="$(newest_file "$HOME/.config/h4reet-ai" '*.token' '*.env')"
	[ -n "$file" ] || file="$(newest_file "$HOME/.config/h4reet-ai" '*')"
	# shellcheck disable=SC2088 # a path for the detail, never expanded
	shown="~${file#"$HOME"}"
	if [ -z "$file" ]; then
		ok=false
		seen+="; there is no file under ~/.config/h4reet-ai to read"
	elif err="$(as_h4agents head -c 1 -- "$file" 2>&1 >/dev/null)"; then
		ok=false
		seen+="; h4agents read $shown"
	elif [[ "$err" == *"Permission denied"* ]]; then
		facts+="; reading $shown: EACCES"
	else
		ok=false
		seen+="; h4agents reading $shown: ${err:-no error}"
	fi
	record E11 "$(verdict $ok)" "$(detail "$ok" "h4agents can't read the Author's home" "$facts" "$seen")"
}

e12_fail_closed() {
	local ok=true uid
	uid="$(id -u h4agents)"
	sudo -u h4agents XDG_RUNTIME_DIR="/run/user/$uid" systemctl --user stop h4-authz.service >/dev/null 2>&1
	engine_docker ps >/dev/null 2>&1 && ok=false # refused while the plugin is down
	sudo -u h4agents XDG_RUNTIME_DIR="/run/user/$uid" systemctl --user start h4-authz.service >/dev/null 2>&1
	sleep 2
	engine_docker ps >/dev/null 2>&1 || ok=false # allowed again
	record E12 "$(verdict $ok)" "the daemon refuses every request while h4-authz is down, and resumes when it returns"
}

e13_slice() {
	local ok=true uid show
	uid="$(id -u h4agents)"
	show="$(systemctl show "user-${uid}.slice" -p MemoryMax -p CPUQuotaPerSecUSec -p TasksMax 2>/dev/null)"
	echo "$show" | grep -q 'MemoryMax=17179869184' || ok=false # 16 GiB
	echo "$show" | grep -q 'TasksMax=4096' || ok=false
	echo "$show" | grep -q 'CPUQuotaPerSecUSec=4s' || ok=false # 400%
	record E13 "$(verdict $ok)" "the slice caps h4agents at 16G memory, 400% CPU, and 4096 tasks"
}

e14_ports() {
	local ok=true port silent=""
	# With dev-cpu up, every port answers on the host's loopback: RootlessKit publishes them there for the
	# Author's browser (contracts/agents-engine.md §7). Any HTTP answer counts, whatever its status; a refused
	# or timed-out connection fails the row. The sandbox half (refused there) is row E9's stage S.
	for port in 18300 18301 18302 18303 18304; do
		if ! curl -s -o /dev/null --max-time 3 "http://127.0.0.1:$port/" 2>/dev/null; then
			ok=false
			silent="$silent $port"
		fi
	done
	record E14 "$(verdict $ok)" "dev-cpu publishes on the host's 127.0.0.1 (ports 18300-18304)${silent:+; no answer on$silent}; the sandbox cannot reach them (stage S)"
}

e15_published_ports() {
	local ok=true
	# Without an address, Docker publishes on every interface, and RootlessKit would listen on the WSL VM's own
	# interfaces (A21, H3). The loopback is how dev-cpu publishes for the Author's browser (E14).
	admission_refused run --rm -p 18999:80 "$probe_image" true || ok=false
	admission_refused run --rm -P --expose 80 "$probe_image" true || ok=false
	admission_refused run --rm -p 0.0.0.0:18999:80 "$probe_image" true || ok=false
	engine_docker run --rm -p 127.0.0.1:18999:80 "$probe_image" true >/dev/null 2>&1 || ok=false
	record E15 "$(verdict $ok)" "-p with no address, -P, and 0.0.0.0 are refused (A21); 127.0.0.1 runs"
}

e16_raw_bodies() {
	local ok=true body code name=h4-prove-e16
	# The docker CLI spells every key exactly; a raw client need not. The daemon matches keys case-insensitively
	# and merges repeated ones, so each of these is a privileged container to it unless the plugin refuses (§3.2).
	# They go out with the agents' certificate, as a session would send them.
	for body in \
		"{\"Image\":\"$probe_image\",\"hostconfig\":{\"privileged\":true}}" \
		"{\"Image\":\"$probe_image\",\"HostConfig\":{},\"hostConfig\":{\"Privileged\":true}}" \
		"{\"Image\":\"$probe_image\",\"Privileged\":true}"; do
		code="$(curl -q -s --noproxy "*" -o /dev/null -w '%{http_code}' --max-time 10 \
			--cacert "$agent_cert_dir/ca.pem" --cert "$agent_cert_dir/cert.pem" --key "$agent_cert_dir/key.pem" \
			-H 'Content-Type: application/json' --data-binary "$body" \
			"https://198.18.0.1:2376/containers/create?name=$name" 2>/dev/null)"
		[ "$code" = 403 ] || ok=false
		engine_docker rm -f "$name" >/dev/null 2>&1 || true # only if one was created, which fails the row
	done
	record E16 "$(verdict $ok)" "raw create bodies with folded, repeated, or top-level host keys are refused (403)"
}

nft_drop_count() {
	sudo nft list counter inet h4agents h4agents_dropped 2>/dev/null | grep -oE 'packets [0-9]+' | grep -oE '[0-9]+' | head -n1
}

excerpts() {
	echo
	echo "== the plugin's last refusals (${H4_AUTHZ_LOG})"
	[ -r "$H4_AUTHZ_LOG" ] && grep '"decision":"refuse"' "$H4_AUTHZ_LOG" | tail -n 10 || echo "  (none)"
	echo "== the egress proxy's last decisions (${H4_EGRESS_LOG})"
	[ -r "$H4_EGRESS_LOG" ] && tail -n 10 "$H4_EGRESS_LOG" || echo "  (none)"
	echo "== the firewall's drop counter"
	echo "  h4agents_dropped packets: $(nft_drop_count)"
}

# Before any probe: the tools, the agents' certificate, sudo, and this run's work directory.
preflight() {
	local tool file missing=""
	for tool in docker curl jq openssl ss ip python3 sudo pgrep; do
		command -v "$tool" >/dev/null 2>&1 || missing+=" $tool"
	done
	for file in ca.pem cert.pem key.pem; do
		[ -r "$agent_cert_dir/$file" ] || missing+=" $agent_cert_dir/$file"
	done
	if [ -n "$missing" ]; then
		echo "prove-limits.sh: missing:$missing (deploy/agents-engine/engine.sh setup issues the certificate)" >&2
		exit 2
	fi
	if ! sudo -v; then
		echo "prove-limits.sh: the host-side probes need sudo" >&2
		exit 2
	fi
	if ! work="$(mktemp -d "${TMPDIR:-/tmp}/h4-prove.XXXXXX")" || [ ! -d "$work" ]; then
		echo "prove-limits.sh: couldn't make a work directory" >&2
		exit 2
	fi
	mkdir -p -- "$work/buildx"
}

# At exit, however the run ends: what the probes planted, their containers and volume, and the work directory.
cleanup() {
	local path
	for path in "${planted[@]}"; do rm -f -- "$path"; done
	for path in "${planted_h4[@]}"; do as_h4agents rm -f -- "$path" >/dev/null 2>&1; done
	if [ -n "$work" ]; then
		engine_docker rm -f h4-prove-e1 h4-prove-e16 >/dev/null 2>&1
		engine_docker volume rm h4probe >/dev/null 2>&1
		rm -rf -- "$work"
	fi
}

main() {
	if [ "${SANDBOX_RUNTIME:-}" = 1 ]; then
		echo "prove-limits.sh is the Author's, run on the host by deploy/agents-engine/engine.sh prove" >&2
		exit 2
	fi
	trap cleanup EXIT
	trap 'exit 130' INT TERM
	preflight
	echo "FR-039 limits, matrix stage E (contracts/agents-engine.md §7)"
	echo "probe image: $probe_image"
	echo "ROW   RES  DETAIL"
	e1_privileged
	e2_host_engine
	e3_gpu
	e4_host_stacks
	e5_author_files
	e6_readonly_tree
	e7_hidden_paths
	e8_egress
	e9_opening
	e11_home
	e12_fail_closed
	e13_slice
	e14_ports
	e15_published_ports
	e16_raw_bodies
	e10_disposable # last: it resets and reseeds the engine (Heavy)
	excerpts
	echo
	echo "stage E: $pass passed, $fail failed"
	[ "$fail" -eq 0 ]
}

main "$@"
