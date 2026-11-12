#!/bin/sh
# edge's entrypoint (spec 001 contracts/tunnel.md §4; tasks.md T048): writes the hosts' blocks' token maps, then runs
# nginx. nginx reads no environment, so the relay block's and the telemetry block's tokens reach it as two maps in a
# file on edge's tmpfs, which nginx.conf includes: each map matches "Bearer <token>" and nothing else, and with no token
# nothing matches, so the block answers 401 to everyone (dev and dev-cpu, and prod before the Author's tunnel-keys).
# A token outside its shape stops edge, naming the key and never the value. The tokens leave the environment before
# nginx starts.
set -eu

out="${H4_EDGE_TOKENS_FILE:-/tmp/h4-blocks/tokens.conf}"

# A token's shape: 32 to 128 of A-Z, a-z, 0-9, _ and -, what the tunnel-keys target makes; nothing nginx would parse.
valid() {
	case "$1" in
	*[!A-Za-z0-9_-]*) return 1 ;;
	esac
	[ "${#1}" -ge 32 ] && [ "${#1}" -le 128 ]
}

refuse() {
	echo "edge: $1 isn't a token's shape: 32 to 128 letters, digits, _ or -" >&2
	exit 78
}
if [ -n "${RELAY_TOKEN_SELF:-}" ] && ! valid "$RELAY_TOKEN_SELF"; then refuse RELAY_TOKEN_SELF; fi
if [ -n "${TELEMETRY_BLOCK_TOKEN:-}" ] && ! valid "$TELEMETRY_BLOCK_TOKEN"; then refuse TELEMETRY_BLOCK_TOKEN; fi

# nginx's own variables, written literally into its file.
# shellcheck disable=SC2016
block_map() {
	printf 'map $http_authorization %s {\n  default 0;\n' "$1"
	if [ -n "$2" ]; then
		printf '  "Bearer %s" 1;\n' "$2"
	fi
	printf '}\n'
}

umask 077
mkdir -p "$(dirname "$out")"
# shellcheck disable=SC2016
{
	block_map '$h4_relay_authorized' "${RELAY_TOKEN_SELF:-}"
	block_map '$h4_telemetry_authorized' "${TELEMETRY_BLOCK_TOKEN:-}"
} >"$out.tmp"
mv "$out.tmp" "$out"

unset RELAY_TOKEN_SELF TELEMETRY_BLOCK_TOKEN
exec "$@"
