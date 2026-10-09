#!/usr/bin/env bash
# The agents' engine control (spec 000, FR-039; contracts/agents-engine.md §8).
#
# The Author runs this DIRECTLY, never through make (a planted GNUmakefile would otherwise sit between
# the Author's sudo and this human-only code). bash-gate blocks every subcommand but `smoke` and
# `status` for agents; this script also refuses an Author subcommand inside the sandbox, fail-closed.
#
# NEVER run setup/up/down/reset/destroy/seed/prove from an agent session: they need sudo, Docker,
# systemd, or a user that does not exist yet. Human-only (the FR-039 boundary).
set -euo pipefail

# BASH_SOURCE, not $0: the same path when run, and still this file's when the tests source it.
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd -- "$here/../.." && pwd)"
env_file="/etc/h4agents/engine.env"
lib="/usr/local/lib/h4agents" # the installed, root-owned copies that run

# Non-secret paths, from the file setup-host.sh wrote, with defaults for a fresh host.
H4_REPO="$repo"
H4_STATE="/var/lib/h4agents/state"
H4_MODELS_SRC="/var/lib/h4agents/models"
H4_AUTHZ_LOG="/var/log/h4agents/authz.jsonl"
H4_EGRESS_SETTINGS="$repo/.claude/settings.json"
if [ -r "$env_file" ]; then
	# shellcheck disable=SC1090
	. "$env_file"
fi
repo="$H4_REPO" # the path setup-host.sh fixed, if the env file set it

author_cert_dir="$HOME/.config/h4reet-ai/agents-engine/docker"
agent_cert_dir="$HOME/.config/h4reet/agents-engine/docker"
# Where the running proxy records the list it serves (egress-proxy.py, §8).
egress_list_file="${H4_EGRESS_LIST_FILE:-$HOME/.local/state/h4reet/agents-engine/egress-list.json}"
# The installed proxy runs as its unit runs it: the system interpreter, isolated, no bytecode written.
py_host=(/usr/bin/python3 -I -B -X pycache_prefix=/dev/null)
engine_addr="tcp://198.18.0.1:2376"
images_lock="$repo/deploy/images.lock"
models_lock="$repo/deploy/models.lock"
devcpu_vars="$repo/deploy/env.agents/dev-cpu.vars"
system_units="h4agents-net.service h4agents-nft.service h4agents-dxg.service h4agents-tree.service"

die() {
	echo "engine.sh: $*" >&2
	exit 1
}

in_sandbox() { [ "${SANDBOX_RUNTIME:-}" = 1 ]; }

h4_uid() { id -u h4agents 2>/dev/null || true; }

# A docker client against the engine. The Author reaches 198.18.0.1 with their own certificate; inside
# a session the relay has already set DOCKER_HOST, so the ambient values (the agents' certificate) are
# used as they stand.
engine_docker() {
	if [ -n "${DOCKER_HOST:-}" ]; then
		docker "$@"
	else
		DOCKER_HOST="$engine_addr" DOCKER_TLS_VERIFY=1 DOCKER_CERT_PATH="$author_cert_dir" docker "$@"
	fi
}

# Run a systemctl --user command as h4agents (its services run under lingering).
as_h4agents_systemctl() {
	local uid
	uid="$(h4_uid)"
	[ -n "$uid" ] || die "the user h4agents does not exist; run: sudo $0 setup"
	sudo -u h4agents XDG_RUNTIME_DIR="/run/user/$uid" systemctl --user "$@"
}

# ------------------------------------------------------------------------------------------------
# setup
# ------------------------------------------------------------------------------------------------
cmd_setup() {
	exec sudo "$here/setup-host.sh"
}

# ------------------------------------------------------------------------------------------------
# up: the masks check (H8), the units, the services, the state chown, then wait for TLS
# ------------------------------------------------------------------------------------------------
check_tree_masks() {
	local masks_file="$here/tree-masks.txt" settings="$H4_EGRESS_SETTINGS"
	[ -f "$masks_file" ] || die "missing $masks_file"
	# bind-tree.sh mounts the installed list. While it differs from this one, a mask added here would pass the
	# checks below and never be mounted.
	cmp -s "$masks_file" "$lib/tree-masks.txt" ||
		die "the installed $lib/tree-masks.txt differs from $masks_file; run: $0 setup"
	local -a masks=()
	mapfile -t masks < <(grep -vE '^[[:space:]]*(#|$)' "$masks_file")

	covered() { # is a repo-relative path inside, or equal to, a masked path?
		local path="$1" mask
		for mask in "${masks[@]}"; do
			[ "$path" = "$mask" ] && return 0
			case "$path" in "$mask"/*) return 0 ;; esac
			case "$mask" in "$path"/*) return 0 ;; esac
		done
		return 1
	}

	# 1. Every sandbox read-deny that points inside the tree must be covered by a mask.
	if [ -r "$settings" ] && command -v jq >/dev/null 2>&1; then
		local denies rel
		denies="$(jq -r '
			((.sandbox.filesystem.denyRead // [])[])
			, ((.permissions.deny // [])[] | select(startswith("Read(")) | ltrimstr("Read(") | rtrimstr(")"))
			| select(type=="string")' "$settings")"
		while IFS= read -r deny; do
			[ -n "$deny" ] || continue
			case "$deny" in
			*'*'* | '~'* | /*) continue ;; # globs, home, and absolute paths are not tree-relative
			esac
			rel="${deny#./}"
			if ! covered "$rel"; then
				die "the sandbox read-denies '$rel' inside the tree, but tree-masks.txt does not mask it; add it"
			fi
		done <<<"$denies"
	fi

	# 2. Create any masked directory that does not exist yet, as empty 0700.
	local mask
	for mask in "${masks[@]}"; do
		if [ ! -e "$repo/$mask" ]; then
			install -d -m 0700 "$repo/$mask"
		fi
	done

	# 3. Refuse while a file matching a denied glob sits outside a mask.
	local found
	found="$(find "$repo" \( -name '*.env' -o -name '.env' -o -name '.env.*' \) \
		-not -name '*.env.example' -type f 2>/dev/null || true)"
	while IFS= read -r path; do
		[ -n "$path" ] || continue
		rel="${path#"$repo"/}"
		if ! covered "$rel"; then
			die "an env file sits outside a masked path: $rel (move it to ~/.config/h4reet-ai/env/)"
		fi
	done <<<"$found"
}

cmd_up() {
	check_tree_masks
	echo "== starting the engine's system units"
	# shellcheck disable=SC2086
	sudo systemctl start $system_units
	# A reload mounts the mask of any directory check_tree_masks just created, and unmounts nothing.
	sudo systemctl reload h4agents-tree.service
	"$lib/bind-tree.sh" check || die "the tree's masks are not all mounted; see: sudo systemctl status h4agents-tree.service"
	echo "== starting h4agents' admission plugin and daemon"
	as_h4agents_systemctl start h4-authz.service
	# At boot, lingering starts the daemon on its own; its start check refuses until the tree is masked, and
	# three refusals in a minute hit the start limit, which a plain start would not clear.
	as_h4agents_systemctl reset-failed docker.service 2>/dev/null || true
	as_h4agents_systemctl start docker.service
	echo "== restarting the Author's egress proxy"
	# Restart, not start: the proxy's list is fixed until it restarts (§4), so up serves the settings as they
	# are now, and the proxy records that list for status.
	systemctl --user restart h4-egress-proxy.service
	wait_for_tls
	chown_state
	echo "== engine up"
	engine_docker info --format 'id={{.ID}} rootless={{.SecurityOptions}} plugins={{.Plugins.Authorization}}' || true
}

wait_for_tls() {
	local _
	for _ in $(seq 1 60); do
		if engine_docker version >/dev/null 2>&1; then
			return 0
		fi
		sleep 1
	done
	die "the engine did not answer TLS on 198.18.0.1:2376; check: sudo systemctl status $system_units"
}

chown_state() {
	# Set the state directory's ownership through the rootless namespace, so the gateway's node user
	# (uid 1000) can write it. Best effort: it needs a seeded base image.
	local base="${H4_STATE_CHOWN_IMAGE:-public.ecr.aws/docker/library/node:24.21.0-trixie-slim}"
	if [ -d "$H4_STATE/dev-cpu" ] || install -d "$H4_STATE/dev-cpu" 2>/dev/null; then
		# The compose file binds ${H4_STATE_DIR}/gateway with the long syntax, which never creates a missing source.
		engine_docker run --rm -v "$H4_STATE/dev-cpu:/s" "$base" sh -c 'mkdir -p /s/gateway && chown -R 1000:1000 /s' 2>/dev/null ||
			echo "note: could not prepare the state dir yet (seed first); dev-cpu's first run will retry"
	fi
}

# ------------------------------------------------------------------------------------------------
# down
# ------------------------------------------------------------------------------------------------
cmd_down() {
	echo "== stopping the daemon, the plugin, and the proxy (data stays)"
	systemctl --user stop h4-egress-proxy.service 2>/dev/null || true
	as_h4agents_systemctl stop docker.service 2>/dev/null || true
	as_h4agents_systemctl stop h4-authz.service 2>/dev/null || true
}

# ------------------------------------------------------------------------------------------------
# reset: down, wipe the data root and the state contents, up, seed
# ------------------------------------------------------------------------------------------------
cmd_reset() {
	cmd_down
	echo "== deleting the daemon data root and the state contents"
	sudo rm -rf -- "/var/lib/h4agents/home/.local/share/docker"
	sudo find "$H4_STATE" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + 2>/dev/null || true
	cmd_up
	cmd_seed
}

# ------------------------------------------------------------------------------------------------
# destroy: remove everything but the user, its id range, and H6/H7
# ------------------------------------------------------------------------------------------------
cmd_destroy() {
	cmd_down
	echo "== removing the units, the firewall, the interface, the binds, and all engine data"
	sudo systemctl stop h4agents-tree.service 2>/dev/null || true
	sudo /usr/local/lib/h4agents/bind-tree.sh down 2>/dev/null || true
	# shellcheck disable=SC2086
	sudo systemctl disable --now $system_units 2>/dev/null || true
	sudo nft delete table inet h4agents 2>/dev/null || true
	sudo ip link del h4agents0 2>/dev/null || true
	local unit
	for unit in $system_units; do
		sudo rm -f -- "/etc/systemd/system/$unit"
	done
	sudo systemctl daemon-reload
	sudo rm -rf -- "/var/lib/h4agents/home/.local/share/docker" "$H4_STATE" "$H4_MODELS_SRC" /etc/h4agents/pki
	rm -rf -- "$agent_cert_dir" "$author_cert_dir"
	echo "== kept: the user h4agents and its id range, /dev/dxg (H6), and /etc/wsl.conf (H7)"
}

# ------------------------------------------------------------------------------------------------
# seed: §6.2. Its own disk check; no agent-editable code is called.
# ------------------------------------------------------------------------------------------------
disk_check_bytes() {
	# Fail closed unless both the Windows drive and ext4 hold `required` bytes.
	local required="$1" vhdx avail_win avail_ext4
	vhdx="/mnt/c"
	[ -r "$devcpu_vars" ] && vhdx="$(sed -n 's/^H4_VHDX_MOUNT=//p' "$devcpu_vars" | head -n1)"
	vhdx="${vhdx:-/mnt/c}"
	avail_win="$(df -B1 --output=avail "$vhdx" 2>/dev/null | tail -n1 | tr -dc '0-9')"
	avail_ext4="$(df -B1 --output=avail / 2>/dev/null | tail -n1 | tr -dc '0-9')"
	if [ -z "$avail_win" ]; then
		die "cannot read free space on the Windows drive $vhdx (fail closed)"
	fi
	local gib=$((1024 * 1024 * 1024))
	echo "== disk: need $((required / gib)) GiB; Windows $vhdx has $((avail_win / gib)) GiB; ext4 / has $((avail_ext4 / gib)) GiB"
	if [ "$avail_win" -lt "$required" ] || [ "$avail_ext4" -lt "$required" ]; then
		die "not enough free space to seed: need $((required / gib)) GiB on both the Windows drive and ext4"
	fi
}

seed_image_refs() {
	# images.lock's columns (T035): name, repository, tag, digest, registry, pinned date. Every pinned image but
	# the GPU-only ones, which the engine never runs, as repository:tag@digest.
	awk '!/^#/ && NF >= 4 && $4 ~ /^sha256:[0-9a-f]+$/ && length($4) == 71 && $1 != "model-server-gpu" && $1 != "probe:cuda" {
		print $2 ":" $3 "@" $4
	}' "$images_lock" | sort -u
}

seed_unpinned() {
	# The entries the engine would run that have no digest yet ("-" until make pin-images resolves them).
	awk '!/^#/ && NF >= 4 && !($4 ~ /^sha256:[0-9a-f]+$/ && length($4) == 71) && $1 != "model-server-gpu" && $1 != "probe:cuda" {
		print $1
	}' "$images_lock"
}

cmd_seed() {
	[ -f "$images_lock" ] || die "missing $images_lock (tasks.md T035); run it on the foundations branch first"
	local -a refs=()
	mapfile -t refs < <(seed_image_refs)
	[ "${#refs[@]}" -gt 0 ] || die "no seedable image references found in $images_lock (fail closed)"
	local unpinned
	unpinned="$(seed_unpinned | paste -sd ' ' -)"
	[ -z "$unpinned" ] || echo "note: not seeded, no digest yet: $unpinned (run make pin-images on the host, then seed again)"

	# Pull any missing image on the host, then size the set for the disk check.
	local ref total=0 size
	for ref in "${refs[@]}"; do
		if ! docker image inspect "$ref" >/dev/null 2>&1; then
			echo "== pulling $ref on the host"
			docker pull "$ref" >/dev/null
		fi
		size="$(docker image inspect --format '{{.Size}}' "$ref" 2>/dev/null || echo 0)"
		total=$((total + size))
	done
	disk_check_bytes $((total + 20 * 1024 * 1024 * 1024))

	# Move each image to the engine by digest: save on the host, load over the TLS endpoint.
	local fails=0
	printf '%-60s %-20s %s\n' "IMAGE" "DIGEST" "RESULT"
	for ref in "${refs[@]}"; do
		if engine_docker image inspect "${ref%@*}@${ref#*@}" >/dev/null 2>&1; then
			printf '%-60s %-20s %s\n' "${ref%@*}" "${ref##*@sha256:}" "present"
			continue
		fi
		if docker save --platform linux/amd64 "$ref" | engine_docker load >/dev/null 2>&1 &&
			engine_docker image inspect "$ref" >/dev/null 2>&1; then
			printf '%-60s %-20s %s\n' "${ref%@*}" "${ref##*@sha256:}" "seeded"
		else
			printf '%-60s %-20s %s\n' "${ref%@*}" "${ref##*@sha256:}" "FAILED"
			fails=$((fails + 1))
		fi
	done

	seed_model
	[ "$fails" -eq 0 ] || die "$fails image(s) failed to seed"
	echo "== seed complete"
}

seed_model() {
	[ -f "$models_lock" ] || die "missing $models_lock (tasks.md T063)"
	# The stand-in model only; the prod model is never copied. Its file, size, and sha256 come from the
	# dev-class entry in models.lock. The host cache path is H4_MODEL_DIR of the dev stack.
	local model_file model_sha src cache
	model_file="$(sed -n 's/^MODEL_FILE=//p' "$devcpu_vars" 2>/dev/null | head -n1)"
	[ -n "$model_file" ] || die "cannot read MODEL_FILE from $devcpu_vars"
	cache="${H4_MODEL_DIR:-$HOME/.local/share/h4reet/models}"
	src="$cache/$model_file"
	[ -f "$src" ] || die "the stand-in model is not in the host cache: $src (run make pull MODELS=all)"
	# The file name is matched as text, not as a pattern: its dots aren't wildcards.
	model_sha="$(awk -v f="$model_file" 'index($0, f) {print}' "$models_lock" | grep -oE '[0-9a-f]{64}' | head -n1)"
	[ -n "$model_sha" ] || die "$model_file has no sha256 in $models_lock, so it can't be verified (fail closed)"
	echo "$model_sha  $src" | sha256sum -c - >/dev/null 2>&1 ||
		die "the stand-in model's sha256 does not match $models_lock (fail closed)"
	echo "== copying the stand-in model into $H4_MODELS_SRC"
	local tmp="$H4_MODELS_SRC/.$model_file.tmp.$$"
	sudo install -d -o root -g root -m 0755 "$H4_MODELS_SRC"
	sudo cp -f "$src" "$tmp"
	sudo sync "$tmp"
	sudo mv -f "$tmp" "$H4_MODELS_SRC/$model_file"
	sudo chown root:root "$H4_MODELS_SRC/$model_file"
	sudo chmod 0444 "$H4_MODELS_SRC/$model_file"
}

# ------------------------------------------------------------------------------------------------
# status: read-only; both the Author and agents may run it
# ------------------------------------------------------------------------------------------------
cmd_status() {
	if ! engine_docker version >/dev/null 2>&1; then
		echo "engine: unreachable (ask the Author: deploy/agents-engine/engine.sh up)"
		return 1
	fi
	echo "engine: reachable"
	engine_docker info --format 'id={{.ID}} rootless={{.SecurityOptions}} plugins={{.Plugins.Authorization}}'
	echo "-- images present (against images.lock)"
	if [ -f "$images_lock" ]; then
		local ref
		while IFS= read -r ref; do
			if engine_docker image inspect "$ref" >/dev/null 2>&1; then
				echo "  present ${ref%@*}"
			else
				echo "  MISSING ${ref%@*}"
			fi
		done < <(seed_image_refs)
	else
		echo "  (no images.lock yet: tasks.md T035)"
	fi
	engine_docker system df || true
	if ! in_sandbox; then
		echo "-- system units"
		# shellcheck disable=SC2086
		systemctl is-active $system_units h4-egress-proxy.service 2>/dev/null || true
		status_list_hashes
		echo "-- the plugin's last 20 refusals"
		if [ -r "$H4_AUTHZ_LOG" ]; then
			grep '"decision":"refuse"' "$H4_AUTHZ_LOG" | tail -n 20 || true
		fi
	fi
}

# The digest in a list record, {"digest": "<sha256 hex>", "hosts": [...]}, the line egress-proxy.py prints
# for --list and records when it starts serving (§8); nothing when the input holds none.
list_record_digest() {
	sed -n 's/^{"digest": *"\([0-9a-f]\{64\}\)".*/\1/p' | head -n1
}

status_list_hashes() {
	# The list the proxy serves against the settings' list as it is now (§4, §8). Both digests come from the
	# installed proxy's own code: the running proxy recorded its own when it started, and --list gives the
	# settings'. Nothing here computes one.
	echo "-- the egress proxy's list: the digest in use, and the settings' now"
	local record="" running="" listing="" current="" rc=0 active=yes
	if [ -f "$egress_list_file" ] && [ ! -L "$egress_list_file" ]; then
		record="$(head -c 65536 -- "$egress_list_file" 2>/dev/null || true)"
		running="$(printf '%s\n' "$record" | list_record_digest)"
	fi
	systemctl --user is-active --quiet h4-egress-proxy.service 2>/dev/null || active=no

	if [ "$active" = no ]; then
		echo "  running:  none: h4-egress-proxy.service is not active (start it: $0 up)"
	elif [ -z "$running" ]; then
		echo "  running:  unknown: no record at $egress_list_file (restart the proxy: systemctl --user restart h4-egress-proxy.service)"
	elif printf '%s\n' "$record" | grep -q '"hosts": *\[\]'; then
		echo "  running:  $running (no list: it refuses every request)"
	else
		echo "  running:  $running"
	fi

	if [ ! -f "$lib/egress-proxy.py" ]; then
		echo "  settings: unknown: $lib/egress-proxy.py is not installed (run: $0 setup)"
	else
		listing="$("${py_host[@]}" "$lib/egress-proxy.py" --list "$H4_EGRESS_SETTINGS" 2>/dev/null)" || rc=$?
		current="$(printf '%s\n' "$listing" | list_record_digest)"
		if [ -z "$current" ] || { [ "$rc" -ne 0 ] && [ "$rc" -ne 3 ]; }; then
			echo "  settings: unknown: egress-proxy.py --list failed on $H4_EGRESS_SETTINGS (exit $rc)"
			current=""
		elif [ "$rc" -eq 3 ]; then
			echo "  settings: $current (no list in $H4_EGRESS_SETTINGS: a proxy started now would refuse every request)"
		else
			echo "  settings: $current"
		fi
	fi

	if [ "$active" = yes ] && [ -n "$running" ] && [ -n "$current" ]; then
		if [ "$running" = "$current" ]; then
			echo "  the same: the proxy serves the settings' list"
		else
			echo "  they differ: the settings changed after the proxy started. Restart the proxy: systemctl --user restart h4-egress-proxy.service, or $0 up"
		fi
	fi
}

# ------------------------------------------------------------------------------------------------
# prove: prove-limits.sh (Author; Heavy)
# ------------------------------------------------------------------------------------------------
cmd_prove() {
	exec "$here/prove-limits.sh"
}

# ------------------------------------------------------------------------------------------------
# smoke: the engine's positive half (US3-9), an agent session through the relay
# ------------------------------------------------------------------------------------------------
cmd_smoke() {
	( cd "$repo" && make up ENV=dev-cpu && make breach-test ENV=dev-cpu && make down ENV=dev-cpu )
}

usage() {
	cat >&2 <<'EOF'
usage: deploy/agents-engine/engine.sh <subcommand>
  setup    host setup (sudo; then wsl --shutdown)        [Author]
  up       start the engine                              [Author]
  down     stop the daemon, plugin, and proxy            [Author]
  reset    wipe and re-seed the engine                   [Author; Heavy]
  destroy  remove everything but the user and H6/H7      [Author]
  seed     move images and the stand-in model in         [Author; Heavy]
  status   reachability, id, images, df                  [anyone]
  prove    the FR-039 matrix, rows E1-E16                [Author; Heavy]
  smoke    make up/breach-test/down ENV=dev-cpu          [agent, through the relay]
EOF
}

main() {
	local sub="${1:-}"
	case "$sub" in
	status | smoke) ;;
	setup | up | down | reset | destroy | seed | prove)
		if in_sandbox; then
			die "'$sub' is the Author's; only 'status' and 'smoke' run in a session (contracts/agents-engine.md §8)"
		fi
		;;
	"" | -h | --help | help)
		usage
		exit 2
		;;
	*)
		echo "engine.sh: unknown subcommand '$sub'" >&2
		usage
		exit 2
		;;
	esac
	shift || true
	"cmd_$sub" "$@"
}

# Run as a command; sourced, it only defines the functions above, which the tests call
# (test/test_engine_sh.py).
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
	main "$@"
fi
