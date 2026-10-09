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
#
# NEVER run from an agent session. Human-only (the FR-039 boundary).
set -uo pipefail # not -e: one failing probe must not hide the rest

here="$(cd -- "$(dirname -- "$0")" && pwd)"
repo="$(cd -- "$here/../.." && pwd)"
env_file="/etc/h4agents/engine.env"
H4_STATE="/var/lib/h4agents/state"
H4_AUTHZ_LOG="/var/log/h4agents/authz.jsonl"
H4_EGRESS_LOG="$HOME/.local/state/h4reet/agents-engine/egress.jsonl"
if [ -r "$env_file" ]; then
	# shellcheck disable=SC1090
	. "$env_file"
fi

author_cert_dir="$HOME/.config/h4reet-ai/agents-engine/docker"
engine_addr="tcp://198.18.0.1:2376"
probe_image="${H4_PROBE_IMAGE:-public.ecr.aws/docker/library/python:3.12.15-slim-trixie}"
proxy="http://198.18.0.1:3128"

pass=0
fail=0

record() { # record <id> <PASS|FAIL> <detail>
	if [ "$2" = PASS ]; then pass=$((pass + 1)); else fail=$((fail + 1)); fi
	printf '%-5s %-4s %s\n' "$1" "$2" "$3"
}
verdict() { if [ "$1" = true ]; then echo PASS; else echo FAIL; fi; }

engine_docker() {
	DOCKER_HOST="$engine_addr" DOCKER_TLS_VERIFY=1 DOCKER_CERT_PATH="$author_cert_dir" docker "$@"
}
as_h4agents() { sudo -u h4agents "$@"; }

# True when an engine command is refused by the admission plugin (not merely any error).
admission_refused() {
	local out
	if out="$(engine_docker "$@" 2>&1)"; then return 1; fi
	printf '%s' "$out" | grep -qiE 'authorization denied|h4-authz|plugin'
}

# ------------------------------------------------------------------------------------------------
e1_privileged() {
	local ok=true
	engine_docker info --format '{{.SecurityOptions}}' 2>/dev/null | grep -q rootless || ok=false
	admission_refused run --rm --privileged "$probe_image" true || ok=false
	docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q 'h4reet-dev-cpu' && ok=false
	pgrep -u h4agents dockerd >/dev/null 2>&1 || ok=false
	record E1 "$(verdict $ok)" "engine rootless as h4agents; --privileged refused; no engine container on the host"
}

e2_host_engine() {
	local ok=true
	as_h4agents test -r /var/run/docker.sock && ok=false
	admission_refused run --rm -v /var/run/docker.sock:/s "$probe_image" true || ok=false
	id -nG h4agents | tr ' ' '\n' | grep -qx docker && ok=false
	record E2 "$(verdict $ok)" "h4agents cannot open docker.sock; a bind of it is refused; not in the docker group"
}

e3_gpu() {
	local ok=true
	admission_refused run --rm --gpus all "$probe_image" true || ok=false
	admission_refused run --rm --device /dev/dxg "$probe_image" true || ok=false
	admission_refused run --rm --device-cgroup-rule 'c 10:200 rwm' "$probe_image" true || ok=false
	engine_docker run --rm "$probe_image" ls /dev/dxg >/dev/null 2>&1 && ok=false
	as_h4agents test -r /dev/dxg && ok=false
	record E3 "$(verdict $ok)" "--gpus, --device /dev/dxg, and cgroup rules refused; no /dev/dxg inside; h4agents EACCES"
}

e4_host_stacks() {
	local ok=true before after
	before="$(nft_drop_count)"
	# From a probe container: every host stack port on the slirp gateway must be unreachable.
	local script='import socket,sys
hosts=["10.0.2.2"]
ports=list(range(18000,18005))+list(range(18100,18105))
bad=0
for h in hosts:
  for p in ports:
    s=socket.socket(); s.settimeout(1)
    try:
      s.connect((h,p)); bad+=1
    except OSError:
      pass
    finally:
      s.close()
sys.exit(1 if bad else 0)'
	engine_docker run --rm "$probe_image" python3 -c "$script" >/dev/null 2>&1 || ok=false
	after="$(nft_drop_count)"
	[ "${after:-0}" -gt "${before:-0}" ] || ok=false
	record E4 "$(verdict $ok)" "the host's stack ports are unreachable from a container; the firewall counter grew"
}

e5_author_files() {
	local ok=true
	local src
	for src in /home/h4reet "$HOME/.config/h4reet-ai" /run/WSL /run/dbus /mnt/c / /etc; do
		admission_refused run --rm -v "$src:/x:ro" "$probe_image" true || ok=false
	done
	admission_refused run --rm --mount "type=bind,src=/home/h4reet,dst=/x" "$probe_image" true || ok=false
	# A local volume that binds a host path is a bind in disguise.
	admission_refused volume create --driver local -o type=none -o o=bind -o device=/home/h4reet h4probe || ok=false
	engine_docker volume rm h4probe >/dev/null 2>&1 || true
	# A read-write bind of the read-only tree is refused.
	admission_refused run --rm -v /run/h4agents/tree:/x:rw "$probe_image" true || ok=false
	# E5d: h4agents cannot list the Windows user's files.
	as_h4agents ls /mnt/c/Users >/dev/null 2>&1 && ok=false
	record E5 "$(verdict $ok)" "binds of the Author's files refused; rw tree refused; h4agents EACCES on /mnt/c"
}

e6_readonly_tree() {
	local ok=true
	engine_docker run --rm -v /run/h4agents/tree:/tree:ro "$probe_image" \
		sh -c 'touch /tree/__probe 2>/dev/null' >/dev/null 2>&1 && ok=false
	engine_docker run --rm -v /run/h4agents/tree:/tree:ro "$probe_image" \
		sh -c 'mount -o remount,rw /tree 2>/dev/null' >/dev/null 2>&1 && ok=false
	record E6 "$(verdict $ok)" "a write to the tree gives EROFS; remount,rw is refused"
}

e7_hidden_paths() {
	local ok=true rel
	# Inside a container, every masked path is empty.
	while IFS= read -r rel; do
		[ -n "$rel" ] || continue
		local n
		n="$(engine_docker run --rm -v /run/h4agents/tree:/tree:ro "$probe_image" \
			sh -c "ls -A /tree/$rel 2>/dev/null | wc -l" 2>/dev/null || echo 0)"
		[ "${n:-0}" -eq 0 ] || ok=false
	done < <(grep -vE '^[[:space:]]*(#|$)' "$here/tree-masks.txt")
	# No env file is visible in the tree.
	engine_docker run --rm -v /run/h4agents/tree:/tree:ro "$probe_image" \
		sh -c 'find /tree -name "*.env" -not -name "*.env.example" | head -n1' 2>/dev/null | grep -q . && ok=false
	# engine.sh up refuses while a planted env file sits outside a mask.
	local planted="$repo/__probe.env"
	: >"$planted" 2>/dev/null || true
	"$here/engine.sh" up >/dev/null 2>&1 && ok=false
	rm -f -- "$planted"
	record E7 "$(verdict $ok)" "masked paths empty; no env file visible; engine.sh up refuses a planted env file"
}

e8_egress() {
	local ok=true code
	code="$(as_h4agents env HTTPS_PROXY="$proxy" curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
		https://registry.npmjs.org/ 2>/dev/null || echo 000)"
	[ "$code" = 200 ] || ok=false
	local host
	for host in https://example.com https://github.com https://api.anthropic.com; do
		code="$(as_h4agents env HTTPS_PROXY="$proxy" curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
			"$host" 2>/dev/null || echo 000)"
		[ "$code" = 403 ] || ok=false # the proxy refuses an unlisted host
	done
	# Without the proxy there is no route and no DNS.
	as_h4agents timeout 4 python3 -c 'import socket; socket.create_connection(("1.1.1.1",443),3)' >/dev/null 2>&1 && ok=false
	as_h4agents timeout 4 python3 -c 'import socket; socket.gethostbyname("example.com")' >/dev/null 2>&1 && ok=false
	# A build that asks for host networking is refused (the daemon's entitlements, A30).
	admission_refused build --network host - <<<'FROM scratch' || ok=false
	record E8 "$(verdict $ok)" "npm 200; unlisted hosts 403; no route and no DNS without the proxy; host-network build refused"
}

e9_opening() {
	local ok=true
	# A TLS handshake with no client certificate fails.
	echo | openssl s_client -connect 198.18.0.1:2376 -verify_return_error >/dev/null 2>&1 && ok=false
	# Only RootlessKit (2376) and the proxy (3128) listen on the engine's address.
	ss -ltnH 2>/dev/null | grep -q '198.18.0.1:2376' || ok=false
	ss -ltnH 2>/dev/null | grep -q '198.18.0.1:3128' || ok=false
	record E9 "$(verdict $ok)" "2376 and 3128 listen on 198.18.0.1; a certless TLS handshake fails"
}

e10_disposable() {
	local ok=true before after
	before="$(engine_docker info --format '{{.ID}}' 2>/dev/null || true)"
	"$here/engine.sh" reset >/dev/null 2>&1 || ok=false
	after="$(engine_docker info --format '{{.ID}}' 2>/dev/null || true)"
	[ -n "$after" ] && [ "$before" != "$after" ] || ok=false
	[ "$(engine_docker volume ls -q 2>/dev/null | wc -l)" -eq 0 ] || ok=false
	[ "$(engine_docker ps -aq 2>/dev/null | wc -l)" -eq 0 ] || ok=false
	[ -z "$(sudo find "$H4_STATE" -mindepth 1 2>/dev/null)" ] || ok=false
	record E10 "$(verdict $ok)" "reset changes the engine ID; no volume, container, or state survives"
}

e11_home() {
	local ok=true
	as_h4agents ls /home/h4reet >/dev/null 2>&1 && ok=false
	as_h4agents cat "$HOME/.config/h4reet-ai" >/dev/null 2>&1 && ok=false
	record E11 "$(verdict $ok)" "h4agents cannot list the Author's home or read ~/.config/h4reet-ai"
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
	for body in \
		"{\"Image\":\"$probe_image\",\"hostconfig\":{\"privileged\":true}}" \
		"{\"Image\":\"$probe_image\",\"HostConfig\":{},\"hostConfig\":{\"Privileged\":true}}" \
		"{\"Image\":\"$probe_image\",\"Privileged\":true}"; do
		code="$(curl -s --noproxy "*" -o /dev/null -w '%{http_code}' --max-time 10 \
			--cacert "$author_cert_dir/ca.pem" --cert "$author_cert_dir/cert.pem" --key "$author_cert_dir/key.pem" \
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

main() {
	echo "FR-039 limits, matrix stage E (contracts/agents-engine.md §7)"
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
