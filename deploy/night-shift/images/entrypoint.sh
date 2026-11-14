#!/bin/sh
# The worker image's entrypoint (spec 017, plan.md §1). Under --init, it runs the container's command.
#
# For the roles that run containers on the agents' engine (implementer, ops, red-teamer), the spec sets
# NIGHT_ENGINE_FWD=engine-fwd:2376 and DOCKER_HOST=tcp://127.0.0.1:2376. docker-relay then takes its nesting path
# (a relay already answers at the endpoint), so this forwards 127.0.0.1:2376 to the engine forwarder, the only way
# to the engine: the egress proxy refuses 198.18.0.0/15 by design. The engine's mutual TLS, its admission plugin,
# its egress proxy, and its firewall still govern what runs there.
set -eu

if [ -n "${NIGHT_ENGINE_FWD:-}" ]; then
	case "$NIGHT_ENGINE_FWD" in
	engine-fwd:2376) ;;
	*)
		echo "entrypoint: NIGHT_ENGINE_FWD must be engine-fwd:2376, not '$NIGHT_ENGINE_FWD'" >&2
		exit 2
		;;
	esac
	socat "TCP-LISTEN:2376,bind=127.0.0.1,fork,reuseaddr" "TCP:$NIGHT_ENGINE_FWD" &
fi

exec "$@"
