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

# A docker client against the engine. Inside a session the relay has already set DOCKER_HOST and the agents'
# certificate, so the ambient values are used as they stand. In the Author's terminal it is always 198.18.0.1
# with the Author's certificate, whatever the shell's DOCKER_HOST, DOCKER_CONTEXT, or proxy settings name: an
# ambient DOCKER_HOST could name the host's rootful daemon (T145's review).
engine_docker() {
	if in_sandbox; then
		docker "$@"
	else
		env -u DOCKER_CONTEXT -u HTTPS_PROXY -u https_proxy -u HTTP_PROXY -u http_proxy \
			-u ALL_PROXY -u all_proxy -u NO_PROXY -u no_proxy \
			DOCKER_HOST="$engine_addr" DOCKER_TLS_VERIFY=1 DOCKER_CERT_PATH="$author_cert_dir" docker "$@"
	fi
}

# The host's own rootful daemon, for seed's checks, pulls, and saves, whatever the shell's DOCKER_HOST or
# DOCKER_CONTEXT names, as prove-limits.sh's host_docker is (T145's review, round 2).
host_docker() {
	(
		unset DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
		export DOCKER_HOST=unix:///var/run/docker.sock
		docker "$@"
	)
}

# Run a systemctl --user command as h4agents (its services run under lingering).
as_h4agents_systemctl() {
	local uid
	uid="$(h4_uid)"
	[ -n "$uid" ] || die "the user h4agents does not exist; run: $0 setup"
	sudo -u h4agents XDG_RUNTIME_DIR="/run/user/$uid" systemctl --user "$@"
}

# ------------------------------------------------------------------------------------------------
# setup
# ------------------------------------------------------------------------------------------------
cmd_setup() {
	# setup-host.sh takes the Author from SUDO_USER, which this sudo sets: run under sudo already, it would be root.
	[ "$(id -u)" -ne 0 ] || die "run setup as yourself, without sudo: it calls sudo itself"
	exec sudo "$here/setup-host.sh"
}

# ------------------------------------------------------------------------------------------------
# up: the masks check (H8), the units, the services, the state chown, then wait for TLS
# ------------------------------------------------------------------------------------------------

# read_deny_path <rule|sandbox> <entry> <tree> <home>: the path inside the tree that one sandbox read deny
# names, relative to the tree, or nothing when it names none. Claude Code's syntax, for a Read(...) rule
# and for a sandbox.filesystem.denyRead entry:
#   ./x and x   the project's, in both;
#   /x          the project's in a rule, but absolute in denyRead;
#   //x         absolute in both; ~/x the home directory's in both.
# An absolute or home path counts only inside the tree. A trailing /** or /* goes, so a deny on a
# directory's contents names the directory; any other glob character stays, for the caller to judge. The
# tree itself, and paths above or beside it, are not paths inside it.
read_deny_path() {
	local kind="$1" entry="$2" tree="$3" home="$4" path
	case "$entry" in
	//*) path="/${entry#//}" ;;
	\~) path="$home" ;; # a literal tilde: the deny's own, never the shell's
	\~/*) path="$home/${entry#\~/}" ;;
	/*) if [ "$kind" = rule ]; then path="${entry#/}"; else path="$entry"; fi ;;
	*) path="$entry" ;;
	esac
	while [[ $path == *//* ]]; do path="${path//\/\//\/}"; done
	if [[ $path == /* ]]; then
		case "$path" in
		"$tree"/*) path="${path#"$tree"/}" ;;
		*) return 0 ;; # outside the tree, or the tree itself
		esac
	fi
	while :; do
		case "$path" in
		./*) path="${path#./}" ;;
		*/\*\*) path="${path%/\*\*}" ;;
		*/\*) path="${path%/\*}" ;;
		*/) path="${path%/}" ;;
		*) break ;;
		esac
	done
	case "$path" in
	"" | . | \* | \*\* | .. | ../*) return 0 ;; # the tree itself, or outside it
	esac
	printf '%s\n' "$path"
}

# Is a deny pattern one of the env-file globs step 3 of check_tree_masks holds: a name of .env*, .env.*, or
# *.env, in any directory?
env_file_glob() {
	case "${1##*/}" in
	'.env*' | '.env.*' | '*.env') return 0 ;;
	esac
	return 1
}

# The leading part of a pattern that holds no glob character. Every path the pattern matches is under it.
glob_base() {
	local -a parts=()
	local part base=""
	IFS=/ read -r -a parts <<<"$1"
	for part in "${parts[@]}"; do
		case "$part" in *[*?[]*) break ;; esac
		base="${base:+$base/}$part"
	done
	printf '%s\n' "$base"
}

# mask_holds <path> <mask>...: is the tree-relative path a masked path, or inside one? A path that holds a
# mask isn't held by it: the rest of what the path names stays visible.
mask_holds() {
	local path="$1" mask
	shift
	for mask in "$@"; do
		[ "$path" = "$mask" ] && return 0
		case "$path" in "$mask"/*) return 0 ;; esac
	done
	return 1
}

check_tree_masks() {
	local masks_file="$here/tree-masks.txt" settings="$H4_EGRESS_SETTINGS"
	[ -f "$masks_file" ] || die "missing $masks_file"
	# bind-tree.sh mounts the installed list. While it differs from this one, a mask added here would pass the
	# checks below and never be mounted.
	cmp -s "$masks_file" "$lib/tree-masks.txt" ||
		die "the installed $lib/tree-masks.txt differs from $masks_file; run: $0 setup"
	local -a masks=()
	mapfile -t masks < <(grep -vE '^[[:space:]]*(#|$)' "$masks_file")

	# 1. Every sandbox read deny that names a path inside the tree must be masked: the denyRead entries and the
	#    Read(...) rules, each read in its own syntax. Settings it can't read fail closed: an unread deny is an
	#    unchecked one.
	command -v jq >/dev/null 2>&1 || die "jq is missing, so the sandbox's read denies can't be checked (fail closed)"
	local denies kind deny rel base
	denies="$(jq -r '
		((.sandbox.filesystem.denyRead // [])[] | select(type == "string") | "sandbox\t" + .),
		((.permissions.deny // [])[] | select(type == "string" and startswith("Read(") and endswith(")"))
			| "rule\t" + (ltrimstr("Read(") | .[:-1]))' "$settings" 2>/dev/null)" ||
		die "cannot read the sandbox's read denies in $settings (fail closed)"
	while IFS=$'\t' read -r kind deny; do
		[ -n "$deny" ] || continue
		rel="$(read_deny_path "$kind" "$deny" "$repo" "$HOME")"
		[ -n "$rel" ] || continue # outside the tree
		case "$rel" in
		*[*?[]*)
			# A pattern. The env-file globs are step 3's; any other must lie wholly under a mask.
			env_file_glob "$rel" && continue
			base="$(glob_base "$rel")"
			if [ -n "$base" ] && mask_holds "$base" "${masks[@]}"; then
				continue
			fi
			die "the sandbox read-denies the pattern '$deny' inside the tree, and no path in tree-masks.txt holds all it matches; mask its directory"
			;;
		esac
		mask_holds "$rel" "${masks[@]}" ||
			die "the sandbox read-denies '$rel' inside the tree, but tree-masks.txt does not mask it; add it"
	done <<<"$denies"

	# 2. Create any masked directory that does not exist yet, as empty 0700.
	local mask
	for mask in "${masks[@]}"; do
		if [ ! -e "$repo/$mask" ]; then
			install -d -m 0700 "$repo/$mask"
		fi
	done

	# 3. Refuse while a file matching a denied glob (.env*, *.env; not a *.env.example template) sits outside a
	#    mask.
	local found
	found="$(find "$repo" \( -name '*.env' -o -name '.env*' \) -not -name '*.env.example' -type f 2>/dev/null || true)"
	while IFS= read -r path; do
		[ -n "$path" ] || continue
		rel="${path#"$repo"/}"
		if ! mask_holds "$rel" "${masks[@]}"; then
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
	# Load the units as setup last installed them: a start otherwise runs the copies the manager read at boot.
	as_h4agents_systemctl daemon-reload
	as_h4agents_systemctl start h4-authz.service
	# At boot, lingering starts the daemon on its own; its start check refuses until the tree is masked, and
	# three refusals in a minute hit the start limit, which a plain start would not clear.
	as_h4agents_systemctl reset-failed docker.service 2>/dev/null || true
	as_h4agents_systemctl start docker.service
	echo "== restarting the Author's egress proxy"
	# Restart, not start: the proxy's list is fixed until it restarts (§4), so up serves the settings as they
	# are now, and the proxy records that list for status. The reload first, so it runs the unit setup installed.
	systemctl --user daemon-reload
	systemctl --user restart h4-egress-proxy.service
	wait_for_tls
	chown_state up
	echo "== engine up"
	engine_docker info --format 'id={{.ID}} rootless={{.SecurityOptions}} plugins={{.Plugins.Authorization}}' || true
}

# Up to a minute, one try at a time, each stopped after 5 s. A forward that accepts the connection and never
# reaches the daemon holds docker version until the far side gives up, and one unbounded try held up here for
# minutes, silently (T046, 2026-10-09). The tests shorten both through tls_wait and tls_try.
wait_for_tls() {
	local wait="${tls_wait:-60}" try="${tls_try:-5}" deadline pid _
	# Whole seconds only, checked before any arithmetic: bash evaluates a name in $(( )), and a[$(cmd)] runs cmd.
	case "$wait$try" in *[!0-9]*) die "tls_wait and tls_try take whole seconds" ;; esac
	deadline=$((SECONDS + wait))
	while [ "$SECONDS" -lt "$deadline" ]; do
		engine_docker version >/dev/null 2>&1 &
		pid=$!
		for _ in $(seq 1 "$try"); do
			sleep 1
			kill -0 "$pid" 2>/dev/null || break
		done
		if kill -0 "$pid" 2>/dev/null; then
			pkill -P "$pid" 2>/dev/null || true # the docker client, when the try runs it as a child
			kill "$pid" 2>/dev/null || true
			wait "$pid" 2>/dev/null || true
		elif wait "$pid"; then
			return 0
		fi
	done
	die "the engine did not answer TLS on 198.18.0.1:2376 within $wait s. See h4agents' journal: sudo journalctl _UID=$(h4_uid) -n 40; and the firewall's drops: sudo journalctl -k -g h4agents-drop -n 5"
}

# The base:node image by digest, from images.lock, as repository:tag@sha256:…: exactly one base:node line, each
# field in its shape, or nothing and a non-zero exit. Agents can write images.lock on a branch, and this runs
# the working tree's copy, so a field that docker run would read as an option never reaches it (T145's review).
pinned_base_node() {
	awk '
		$1 == "base:node" { n++; repo = $2; tag = $3; digest = $4 }
		END {
			if (n != 1) exit 1
			if (repo !~ "^[a-z0-9][a-z0-9._/-]*$") exit 1
			if (tag !~ "^[A-Za-z0-9_][A-Za-z0-9._-]*$" || length(tag) > 128) exit 1
			if (digest !~ "^sha256:[0-9a-f]+$" || length(digest) != 71) exit 1
			print repo ":" tag "@" digest
		}
	' "$images_lock" 2>/dev/null
}

# chown_state <up|seed>: dev-cpu's state directory, made and owned through the engine alone. The state root is
# h4agents' and 0700, so the Author can't see into it. In the container, root is h4agents and uid 1000 is the
# gateway's node user, so the chown gives the journal its writer (plan §10). compose binds ${H4_STATE_DIR}/gateway
# with the long syntax, which never creates a missing source. It needs the pinned base:node image, which only
# seed brings in (--pull never), so at up a failure is a note, and at seed it is fatal.
chown_state() {
	local when="$1" base out why
	base="$(pinned_base_node)" || base=""
	if [ -z "$base" ]; then
		[ "$when" = up ] ||
			die "$images_lock has no single base:node line pinned by digest, so dev-cpu's state directory can't be made (fail closed)"
		echo "note: no pinned base:node in $images_lock, so dev-cpu's state directory waits for: $0 seed"
		return 0
	fi
	if out="$(engine_docker run --rm --pull never -v "$H4_STATE:/s" "$base" \
		sh -c 'mkdir -p /s/dev-cpu/gateway && chown -R 1000:1000 /s/dev-cpu' 2>&1)"; then
		echo "== dev-cpu's state directory: $H4_STATE/dev-cpu/gateway, owned by the gateway's user"
		return 0
	fi
	# The error's last line, printable characters only.
	why="$(printf '%s\n' "$out" | tail -n 1 | LC_ALL=C tr -cd '\040-\176' | cut -c1-300)"
	[ "$when" = up ] || die "could not make dev-cpu's state directory: $why"
	echo "note: dev-cpu's state directory waits for: $0 seed ($why)"
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
	# An empty figure would make the comparison below an error, which `if` reads as enough space.
	[ -n "$avail_ext4" ] || die "cannot read free space on ext4 / (fail closed)"
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

# Does the host's Docker use the containerd image store (§6.1)? Only then does docker save keep an image's
# index digest, which the engine resolves its image@sha256 pins by, offline.
host_uses_containerd_store() {
	local status
	status="$(host_docker info --format '{{json .DriverStatus}}' 2>/dev/null)" || return 1
	case "$status" in *io.containerd.snapshotter.v1*) return 0 ;; esac
	return 1
}

# The host-side size of an image the host holds, in bytes; refuses rather than guess.
host_image_size() {
	local size
	size="$(host_docker image inspect --format '{{.Size}}' "$1" 2>/dev/null)" || size=""
	[[ $size =~ ^[0-9]+$ ]] || die "cannot read the host-side size of $1 (fail closed)"
	printf '%s\n' "$size"
}

cmd_seed() {
	[ -f "$images_lock" ] || die "missing $images_lock (tasks.md T035); run it on the foundations branch first"
	host_uses_containerd_store ||
		die "the host's Docker isn't on the containerd image store: docker info --format '{{json .DriverStatus}}' names no io.containerd.snapshotter.v1, so docker save would drop the digests the engine's pins resolve by. Move it first (contracts/agents-engine.md §6.1), then seed again"
	engine_docker version >/dev/null 2>&1 ||
		die "the engine doesn't answer on 198.18.0.1:2376, so what it lacks can't be known; run: $0 up"
	local -a refs=()
	mapfile -t refs < <(seed_image_refs)
	[ "${#refs[@]}" -gt 0 ] || die "no seedable image references found in $images_lock (fail closed)"
	local unpinned
	unpinned="$(seed_unpinned | paste -sd ' ' -)"
	[ -z "$unpinned" ] || echo "note: not seeded, no digest yet: $unpinned (run make pin-images on the host, then seed again)"

	# The images still to seed are the ones the engine lacks; of those, the host may need to pull some first.
	local -a todo=() pull=()
	local ref size known=0 gib=$((1024 * 1024 * 1024))
	for ref in "${refs[@]}"; do
		engine_docker image inspect "$ref" >/dev/null 2>&1 && continue
		todo+=("$ref")
		if host_docker image inspect "$ref" >/dev/null 2>&1; then
			size="$(host_image_size "$ref")" || exit 1
			known=$((known + size))
		else
			pull+=("$ref")
		fi
	done

	# The disk check comes before any pull (§6.2, P13's rule): the host-side size of every image still to seed,
	# 12 GB for those the host must pull first, whose size it can't know yet, and the 20 GB margin.
	local first_pull=0
	[ "${#pull[@]}" -eq 0 ] || first_pull=$((12 * gib))
	disk_check_bytes $((known + first_pull + 20 * gib))
	if [ "${#pull[@]}" -gt 0 ]; then
		for ref in "${pull[@]}"; do
			echo "== pulling $ref on the host"
			host_docker pull "$ref" >/dev/null || die "could not pull $ref on the host"
		done
		# Again before any load, with the pulled images' real sizes, against the space the pulls left.
		known=0
		for ref in "${todo[@]}"; do
			size="$(host_image_size "$ref")" || exit 1
			known=$((known + size))
		done
		disk_check_bytes $((known + 20 * gib))
	fi

	# Move each image to the engine by digest: save on the host, load over the TLS endpoint.
	local fails=0
	printf '%-60s %-20s %s\n' "IMAGE" "DIGEST" "RESULT"
	for ref in "${refs[@]}"; do
		if engine_docker image inspect "${ref%@*}@${ref#*@}" >/dev/null 2>&1; then
			printf '%-60s %-20s %s\n' "${ref%@*}" "${ref##*@sha256:}" "present"
			continue
		fi
		if host_docker save --platform linux/amd64 "$ref" | engine_docker load >/dev/null 2>&1 &&
			engine_docker image inspect "$ref" >/dev/null 2>&1; then
			printf '%-60s %-20s %s\n' "${ref%@*}" "${ref##*@sha256:}" "seeded"
		else
			printf '%-60s %-20s %s\n' "${ref%@*}" "${ref##*@sha256:}" "FAILED"
			fails=$((fails + 1))
		fi
	done

	seed_model
	[ "$fails" -eq 0 ] || die "$fails image(s) failed to seed"
	chown_state seed
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
		echo "-- the engine's system units, and the Author's proxy"
		status_units
		status_list_hashes
		echo "-- the plugin's last 20 refusals"
		status_refusals
	fi
}

# Each unit by name, with its state, or "unknown" when systemctl can't say (no user bus, say). The proxy is the
# Author's user unit: asked of the system manager, as status once asked it, it always read "inactive", even while
# it served (2026-10-09).
status_units() {
	local unit state
	for unit in $system_units; do
		state="$(systemctl is-active "$unit" 2>/dev/null)" || true
		printf '  %-26s %s\n' "$unit" "${state:-unknown}"
	done
	state="$(systemctl --user is-active h4-egress-proxy.service 2>/dev/null)" || true
	printf '  %-26s %s\n' h4-egress-proxy.service "${state:-unknown}"
}

# The plugin's last 20 refusals, read as h4agents and never as root: h4agents owns the log's directory, so a link
# there could lead anywhere. sudo -n, so status never asks for a password. It says why when it reads nothing,
# where it once printed nothing at all (§3.5).
status_refusals() {
	local refusals
	if ! sudo -n -u h4agents true 2>/dev/null; then
		echo "  (not read: sudo would ask for a password. Run: sudo -u h4agents tail -n 20 $H4_AUTHZ_LOG)"
	elif refusals="$(sudo -n -u h4agents grep -- '"decision":"refuse"' "$H4_AUTHZ_LOG" 2>/dev/null)"; then
		tail -n 20 <<<"$refusals"
	elif sudo -n -u h4agents test -f "$H4_AUTHZ_LOG"; then
		echo "  (none)"
	else
		echo "  (no log yet at $H4_AUTHZ_LOG)"
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
  setup    host setup, as yourself (it asks for sudo)    [Author]
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
