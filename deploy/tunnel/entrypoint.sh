#!/bin/bash
# The tunnel's two ends, in one image (spec 001 contracts/tunnel.md §2 and §3; research.md R-11; plan.md §11):
#   h4-tunnel server     the tunnel end's sshd, in the `tunnel-end` service
#   h4-tunnel client     the laptop's connection, in the `tunnel` service, reconnecting with backoff
#   h4-tunnel connected  ssh's LocalCommand, once the client's connection is up
# Each end reports h4.tunnel.up and h4.tunnel.reconnects every 15 seconds, labelled h4.tunnel.end, over OTLP/HTTP to
# the collector H4_OTLP_HTTP names. The logs pass through scrub, so no network address reaches them (row S17).
set -euo pipefail

BACKOFF=(1 2 5 10 30)
STATE=/run/tunnel
REPORT_EVERY=15

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

server() {
	local end=tunnel-end
	mkdir -p "$STATE"
	: >"$STATE/accepted"
	report tunnel-end "$end" &
	/usr/sbin/sshd -D -e -f /etc/ssh/h4/sshd_config 2>&1 | scrub | while IFS= read -r line; do
		printf '%s\n' "$line"
		case "$line" in
		*"Accepted publickey for tunnel"*) printf '.' >>"$STATE/accepted" ;;
		esac
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
