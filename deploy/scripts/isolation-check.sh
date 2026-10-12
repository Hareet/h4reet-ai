#!/usr/bin/env bash
# make isolation-check: prod and dev, up together on one host, can't reach each other (spec 000 FR-020, US1-4; plan
# §1 and §4; quickstart.md §1.7). The Author's terminal, with both stacks up on the host's engine.
#
#   bash deploy/scripts/isolation-check.sh
#
# In each direction, dev to prod and prod to dev, a throwaway container on each of the source stack's networks
# (internal, edge, egress) runs deploy/scripts/isolation_probe.py, which asserts that:
#   - none of the other stack's names (services, containers, aliases) resolves to one of its addresses;
#   - none of the other stack's container addresses accepts a TCP connection on a port its service listens on;
#   - none of the other stack's published ports accepts one through the host: on the network's gateway address and
#     on host-gateway (they listen on the host's 127.0.0.1 alone);
#   - and, as a control, the source stack's own containers on that network resolve and accept, so the refusals mean
#     isolation, not a probe that can reach nothing.
# Then, on the host, through the same probe: no named volume and no writable bind belongs to both stacks. The only
# sources they share are read-only in both: the model cache.
#
# The container runs the pinned base:python image of deploy/images.lock, which make pull fetches; nothing is pulled
# here (--pull never). It has no mounts, no capabilities, a read-only root, and runs as nobody. Its stdin carries only
# the facts gathered below: names, addresses, and ports, never a container's environment, which holds secrets.
# Exit codes: 0 isolated; 1 a check failed; 2 it couldn't run.
set -euo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
root="$(dirname -- "$(dirname -- "$here")")"
probe="$here/isolation_probe.py"
# Python in the Author's terminal: isolated, and blind to bytecode an agent could plant (plan §4, research.md R-35).
py=(python3 -I -B -X pycache_prefix=/dev/null)
stacks=(prod dev)

die() {
	echo "isolation-check: $*" >&2
	exit 2
}

if [ "${SANDBOX_RUNTIME:-}" = 1 ]; then
	die "this is the Author's: it inspects prod and dev on the host's engine, which agent sessions can't reach"
fi
command -v docker >/dev/null 2>&1 || die "there is no docker CLI here"
docker version --format '{{.Server.Version}}' >/dev/null 2>&1 || die "Docker isn't reachable"
[ -f "$probe" ] || die "$probe is missing"

image="$(awk '$1 == "base:python" && $4 ~ /^sha256:[0-9a-f]+$/ && length($4) == 71 { print $2 ":" $3 "@" $4 }' \
	"$root/deploy/images.lock")"
[ -n "$image" ] || die "deploy/images.lock pins no base:python image"
docker image inspect "$image" >/dev/null 2>&1 || die "$image isn't on this host: make pull fetches it"

containers() { docker ps -q --filter "label=com.docker.compose.project=h4reet-$1"; }
networks() { docker network ls --filter "label=com.docker.compose.project=h4reet-$1" --format '{{.Name}}' | sort; }
for stack in "${stacks[@]}"; do
	[ -n "$(containers "$stack")" ] || die "h4reet-$stack isn't running: bring both stacks up first (make up ENV=$stack)"
done

work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
facts="$work/facts" mounts="$work/mounts"
: >"$facts"
: >"$mounts"
for stack in "${stacks[@]}"; do
	mapfile -t ids < <(containers "$stack")
	docker inspect --format "container"$'\t'"$stack"$'\t''{{index .Config.Labels "com.docker.compose.service"}}'$'\t''{{.Name}}'$'\t''{{json .NetworkSettings.Networks}}'$'\t''{{json .Config.ExposedPorts}}' \
		"${ids[@]}" >>"$facts"
	docker inspect --format '{{range $port, $bindings := .NetworkSettings.Ports}}{{range $bindings}}{{.HostPort}}{{"\n"}}{{end}}{{end}}' \
		"${ids[@]}" | awk -v stack="$stack" 'NF { print "published\t" stack "\t" $1 }' | sort -u >>"$facts"
	docker inspect --format $'{{range .Mounts}}{{.Type}}\t{{if eq .Type "volume"}}{{.Name}}{{else}}{{.Source}}{{end}}\t{{.RW}}\n{{end}}' \
		"${ids[@]}" | awk -v stack="$stack" 'NF { print stack "\t" $0 }' >>"$mounts"
done

failures=0 broken=0
record() {
	case "$1" in
	0) ;;
	1) failures=$((failures + 1)) ;;
	*)
		broken=$((broken + 1))
		echo "isolation-check: $2 couldn't run (exit $1)" >&2
		;;
	esac
}

source_code="$(cat -- "$probe")"
for pair in "dev prod" "prod dev"; do
	read -r from to <<<"$pair"
	mapfile -t nets < <(networks "$from")
	[ "${#nets[@]}" -gt 0 ] || die "h4reet-$from has no networks"
	for net in "${nets[@]}"; do
		gateways="$(docker network inspect --format '{{range .IPAM.Config}}{{.Gateway}} {{end}}' "$net")"
		set +e
		{
			cat -- "$facts"
			for gateway in $gateways; do printf 'host\t%s\n' "$gateway"; done
			printf 'host\thost.docker.internal\n'
		} | docker run --rm -i --pull never --network "$net" --add-host host.docker.internal:host-gateway \
			--read-only --cap-drop ALL --security-opt no-new-privileges:true --user 65534:65534 \
			--memory 128m --cpus 0.5 --pids-limit 256 --label h4reet.isolation-check=1 \
			"$image" python3 -I -B -c "$source_code" network "$from" "$to" "$net"
		status=$?
		set -e
		record "$status" "the probe on $net"
	done
done

set +e
"${py[@]}" "$probe" mounts "${stacks[@]}" <"$mounts"
status=$?
set -e
record "$status" "the mount check"

if [ "$broken" -gt 0 ]; then
	echo "isolation-check: $broken check(s) couldn't run, so isolation isn't proven" >&2
	exit 2
fi
if [ "$failures" -gt 0 ]; then
	echo "isolation-check: FAIL: $failures check(s) found a way between prod and dev (FR-020)"
	exit 1
fi
echo "isolation-check: PASS: neither stack reaches the other's names, addresses, ports, or volumes (FR-020)"
