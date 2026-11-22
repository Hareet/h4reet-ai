#!/bin/bash
# The tunnel's two ends, in one image (spec 001 contracts/tunnel.md §2 and §3; research.md R-11; plan.md §11):
#   h4-tunnel server     the tunnel end's sshd, in the `tunnel-end` service
#   h4-tunnel client     the laptop's connection, in the `tunnel` service, reconnecting with backoff
#   h4-tunnel connected  ssh's LocalCommand, once the client's connection is up
# Each end reports h4.tunnel.up and h4.tunnel.reconnects every 15 seconds, labelled h4.tunnel.end, over OTLP/HTTP to
# the collector H4_OTLP_HTTP names. The logs pass through scrub, so no network address reaches them (row S17).
#
# Every mode runs as the image's `tunnel` user, 10001. The laptop's `tunnel` service alone starts as root (spec 001
# fixes/f4.md): its client key and pinned host key are the Author's, in H4_TUNNEL_DIR, which preflight's P22 holds to
# 0700 and his, so 10001 can't open it ("Host key verification failed", W2's deploy). As root, `client` and `admin`
# copy the two files into the tunnel user's own tmpfs, where ssh_config reads them, then exec themselves as that user
# through setpriv, which leaves no capability; every other mode refuses root.
set -euo pipefail

BACKOFF=(1 2 5 10 30)
STATE=/run/tunnel
REPORT_EVERY=15
# The Author's folder, bound read-only, and ssh's copy of its two files, on a tmpfs of 10001's, 0700.
SOURCE=/run/tunnel-source
KEYS=/run/tunnel-client
KEY_FILES=(id_ed25519 known_hosts)
DROP=(setpriv --reuid=10001 --regid=10001 --clear-groups --inh-caps=-all --)

scrub() {
	sed -u -E \
		-e 's/[0-9]{1,3}(\.[0-9]{1,3}){3}/<address>/g' \
		-e 's/\[?([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}\]?/<address>/g' \
		-e 's/ port [0-9]+/ port <port>/g'
}

count() {
	local file="$STATE/$1"
	[ -f "$file" ] && wc -c <"$file" | tr -d ' ' || echo 0
}

post() {
	local endpoint="${H4_OTLP_HTTP:-}" hostport host port body
	[ -n "$endpoint" ] || return 0
	hostport="${endpoint#http://}"
	host="${hostport%%:*}"
	port="${hostport##*:}"
	body="$1"
	exec 9<>"/dev/tcp/$host/$port" 2>/dev/null || return 0
	printf 'POST /v1/metrics HTTP/1.1\r\nHost: %s\r\nContent-Type: application/json\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s' \
		"$hostport" "${#body}" "$body" >&9 || true
	timeout 5 cat <&9 >/dev/null 2>&1 || true
	exec 9>&-
}

metrics() {
	local service="$1" end="$2" up="$3" reconnects="$4" started="$5" now attributes label="h4.tunnel.end"
	now="$(date +%s%N)"
	attributes="{\"key\":\"$label\",\"value\":{\"stringValue\":\"$end\"}}"
	printf '{"resourceMetrics":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"%s"}}]},' "$service"
	printf '"scopeMetrics":[{"scope":{"name":"h4.tunnel"},"metrics":['
	printf '{"name":"%s","gauge":{"dataPoints":[{"asInt":"%d","timeUnixNano":"%s","attributes":[%s]}]}},' \
		"h4.tunnel.up" "$up" "$now" "$attributes"
	printf '{"name":"%s","sum":{"aggregationTemporality":2,"isMonotonic":true,"dataPoints":[{"asInt":"%d","startTimeUnixNano":"%s","timeUnixNano":"%s","attributes":[%s]}]}}' \
		"h4.tunnel.reconnects" "$reconnects" "$started" "$now" "$attributes"
	printf ']}]}]}'
}

# The tunnel end is up while its three reverse forwards listen.
listening() {
	local port hex
	for port in 2201 2202 2203; do
		printf -v hex '%04X' "$port"
		grep -qE "^ *[0-9]+: [0-9A-F]{8}:${hex} [0-9A-F]{8}:[0-9A-F]{4} 0A " /proc/net/tcp || return 1
	done
}

report() {
	local service="$1" end="$2" started up
	started="$(date +%s%N)"
	while sleep "$REPORT_EVERY"; do
		if [ "$end" = laptop ]; then
			[ -f "$STATE/connected" ] && up=1 || up=0
			post "$(metrics "$service" "$end" "$up" "$(count reconnects)" "$started")"
		else
			listening && up=1 || up=0
			# Each accepted login after the first is a reconnection.
			local accepted
			accepted="$(count accepted)"
			post "$(metrics "$service" "$end" "$up" "$((accepted > 0 ? accepted - 1 : 0))" "$started")"
		fi
	done
}

# Fix F10 (specs/001-cloud-elevation/fixes/f10.md): a dead laptop's session kept 2201 to 2203 for 15 minutes and more.
# sshd's client-alive probe runs only when its poll times out, and the relay's check through 2201 every second woke it
# each time; the session ended only when the kernel gave up on its connection. When a new session can't listen on one
# of the three, every session the listening sshd started more than GRACE seconds before (its LoginGraceTime, so past
# its setup) is ended: the laptop's client holds one connection at a time, so a new one means the old one is gone, and
# its next try, 1 to 30 s later, takes the forwards.
PROC=/proc
GRACE=10
SIGNALLED=""

# sshd's line when a session asks for a forward another session holds: PermitListen's three ports. The whole line, and
# nothing else: 2222 is open to anywhere, and sshd logs a stranger's user name and identification as sent, so the text
# inside another line ("Invalid user cannot listen to port: 2201 ...") must never end anyone's session. Under -e an
# error-level line has no "error: " prefix; sshd's trailing \r is allowed, and sshd escapes any control character in
# what it logs, so a stranger can't start a line of their own.
holds_forward() {
	case "${1%$'\r'}" in
	"channel_setup_fwd_listener_tcpip: cannot listen to port: 220"[123]) return 0 ;;
	esac
	return 1
}

# One process's pid, parent, start (clock ticks since boot), and command, from its stat file, into STAT_PID, STAT_PPID,
# STAT_START, and STAT_COMM; the command, in parentheses, may hold spaces and parentheses, so the fields are read after
# its last ") ".
stat_of() {
	local line rest
	local -a f
	IFS= read -r line 2>/dev/null <"$1" || return 1
	rest="${line##*) }"
	read -r -a f <<<"$rest"
	[[ "${f[1]:-}" =~ ^[0-9]+$ && "${f[19]:-}" =~ ^[0-9]+$ ]] || return 1
	STAT_PID="${line%% *}"
	STAT_PPID="${f[1]}"
	STAT_START="${f[19]}"
	STAT_COMM="${line#*(}"
	STAT_COMM="${STAT_COMM%) *}"
}

# The listening sshd: the oldest sshd whose parent is $1, this script.
daemon_pid() {
	local stat best="" earliest=""
	for stat in "$PROC"/[0-9]*/stat; do
		stat_of "$stat" || continue
		if [ "$STAT_COMM" = sshd ] && [ "$STAT_PPID" = "$1" ] && { [ -z "$earliest" ] || [ "$STAT_START" -lt "$earliest" ]; }; then
			best="$STAT_PID"
			earliest="$STAT_START"
		fi
	done
	[ -n "$best" ] && echo "$best"
}

# The sessions the daemon $1 started before tick $2, each with its own processes, one pid a line.
stale_sessions() {
	local stat pid child i=0
	local -A parent=() started=()
	local -a ended=()
	for stat in "$PROC"/[0-9]*/stat; do
		stat_of "$stat" || continue
		parent[$STAT_PID]="$STAT_PPID"
		started[$STAT_PID]="$STAT_START"
	done
	for pid in "${!parent[@]}"; do
		if [ "${parent[$pid]}" = "$1" ] && [ "${started[$pid]}" -lt "$2" ]; then ended+=("$pid"); fi
	done
	while [ "$i" -lt "${#ended[@]}" ]; do
		for child in "${!parent[@]}"; do
			if [ "${parent[$child]}" = "${ended[$i]}" ]; then ended+=("$child"); fi
		done
		i=$((i + 1))
	done
	if [ "${#ended[@]}" -gt 0 ]; then printf '%s\n' "${ended[@]}"; fi
}

# Ends the older sessions, each process once, and says so.
end_older_sessions() {
	local daemon ticks uptime now pid
	local -a ended=()
	daemon="$(daemon_pid "$$")" || return 0
	ticks="$(getconf CLK_TCK 2>/dev/null || echo 100)"
	read -r uptime _ 2>/dev/null <"$PROC/uptime" || return 0
	# /proc/uptime has two decimals: hundredths of a second, then ticks.
	now=$((10#${uptime/./} * ticks / 100))
	for pid in $(stale_sessions "$daemon" "$((now - GRACE * ticks))"); do
		case " $SIGNALLED " in *" $pid "*) continue ;; esac
		SIGNALLED="$SIGNALLED $pid"
		if kill -TERM "$pid" 2>/dev/null; then ended+=("$pid"); fi
	done
	if [ "${#ended[@]}" -gt 0 ]; then
		echo "tunnel-end: a new session couldn't listen on its forwards; ended the older session holding them (processes ${ended[*]}), so the client's next try takes them" >&2
	fi
}

server() {
	local end=tunnel-end
	mkdir -p "$STATE"
	: >"$STATE/accepted"
	report tunnel-end "$end" &
	/usr/sbin/sshd -D -e -f /etc/ssh/h4/sshd_config 2>&1 | scrub | while IFS= read -r line; do
		printf '%s\n' "$line"
		case "$line" in
		*"Accepted publickey for tunnel"*)
			printf '.' >>"$STATE/accepted"
			SIGNALLED=""
			;;
		esac
		if holds_forward "$line"; then end_older_sessions; fi
	done
	echo "tunnel-end: sshd stopped" >&2
	exit 1
}

client() {
	local end=laptop attempt=0 started lasted delay config="${1:-/etc/ssh/h4/ssh_config}"
	if [ -z "${TUNNEL_END_ADDRESS:-}" ]; then
		echo "tunnel: TUNNEL_END_ADDRESS is empty; the Author's tunnel-keys target writes it (docs/runbooks/laptop.md)" >&2
		exit 78
	fi
	mkdir -p "$STATE"
	: >"$STATE/reconnects"
	report tunnel "$end" &
	while true; do
		rm -f "$STATE/connected"
		started="$(date +%s)"
		/usr/bin/ssh -F "$config" "$TUNNEL_END_ADDRESS" 2>&1 | scrub || true
		rm -f "$STATE/connected"
		lasted=$(($(date +%s) - started))
		if [ "$lasted" -ge 60 ]; then attempt=0; fi
		delay="${BACKOFF[$attempt]}"
		if [ "$attempt" -lt $((${#BACKOFF[@]} - 1)) ]; then attempt=$((attempt + 1)); fi
		echo "tunnel: the connection ended after ${lasted} s; trying again in ${delay} s" >&2
		sleep "$delay"
		printf '.' >>"$STATE/reconnects"
	done
}

# As root, with DAC_OVERRIDE to open the Author's folder: each file is opened here, by the redirection, and written by
# the tunnel user into its own tmpfs, 0600. Root writes nothing, and changes nothing in the folder.
stage() {
	local name
	for name in "${KEY_FILES[@]}"; do
		if [ ! -f "$SOURCE/$name" ]; then
			echo "tunnel: $name isn't in H4_TUNNEL_DIR; the Author's make tunnel-keys makes it (docs/runbooks/laptop.md)" >&2
			exit 78
		fi
	done
	for name in "${KEY_FILES[@]}"; do
		# The single quotes are the inner shell's script; $1 is its argument.
		# shellcheck disable=SC2016
		"${DROP[@]}" /bin/sh -c 'umask 077 && cat >"$1"' sh "$KEYS/$name" <"$SOURCE/$name"
	done
}

if [ "$(id -u)" = 0 ]; then
	case "${1:-}" in
	client | admin)
		stage
		exec "${DROP[@]}" "$0" "$1"
		;;
	*)
		echo "h4-tunnel: ${1:-(no mode)} doesn't run as root; only the laptop's client and admin start as root, to copy the key, and run as tunnel" >&2
		exit 77
		;;
	esac
fi

case "${1:-}" in
server) server ;;
client) client /etc/ssh/h4/ssh_config ;;
# Spec 001's admin-only stack (contracts/shared-state.md §7): the shared state's forward alone.
admin) client /etc/ssh/h4/ssh_config_admin ;;
connected) mkdir -p "$STATE" && date +%s >"$STATE/connected" ;;
*)
	echo "usage: h4-tunnel server|client|admin" >&2
	exit 64
	;;
esac
