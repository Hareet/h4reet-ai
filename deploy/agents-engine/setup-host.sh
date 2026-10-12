#!/usr/bin/env bash
# The agents' engine host setup (spec 000, FR-039; contracts/agents-engine.md §5, H1-H14).
#
# Run by the Author as themselves through `deploy/agents-engine/engine.sh setup`, which calls sudo: under a
# second sudo, SUDO_USER would be root. The first run is followed by one `wsl --shutdown`; a re-run says
# whether it needs one. Idempotent: every step checks before it changes, and reissues a client certificate
# only when it is missing or within 30 days of expiry. It fails closed on any error.
#
# NEVER run from an agent session: it needs sudo, and a user that does not exist yet. Human-only (the
# FR-039 boundary); the copies it installs under /usr/local/lib/h4agents and /etc/systemd are what run,
# never the working tree's files (H13).
set -euo pipefail

# The repository path is fixed here, at setup time, from this script's own location. BASH_SOURCE, not $0:
# the same path when run, and still this file's when the tests source it.
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd -- "$here/../.." && pwd)"

user="h4agents"
gpu_group="h4gpu"
lib="/usr/local/lib/h4agents"
etc="/etc/h4agents"
pki="$etc/pki"
env_file="$etc/engine.env"
models_src="/var/lib/h4agents/models"
state="/var/lib/h4agents/state"
log_dir="/var/log/h4agents"
subuid_file="/etc/subuid"
subgid_file="/etc/subgid"
cert_days=397

# The Author, their home, and their two certificate directories: resolve_author sets them, first thing.
author=""
author_home=""
agent_cert_dir=""
author_cert_dir=""
h4_home="/var/lib/h4agents/home"
# What only a wsl --shutdown applies, still waiting for one: ensure_gpu_group and ensure_wsl_conf note it, with the
# boot's ID, so a re-run before the shutdown still asks for it, and the first run after one doesn't.
restart_marker="$etc/wsl-restart-pending"
boot_id_file="/proc/sys/kernel/random/boot_id"

log() { printf '== %s\n' "$*"; }

die() {
	echo "setup-host.sh: $*" >&2
	exit 1
}

# --- root, through sudo, as the Author ---------------------------------------------------------
resolve_author() {
	if [ "$(id -u)" -ne 0 ]; then
		echo "setup-host.sh must run as root (through sudo)" >&2
		exit 1
	fi
	author="${SUDO_USER:-}"
	if [ -z "$author" ] || [ "$author" = "root" ]; then
		# Unset when root runs this directly; root under `sudo engine.sh setup`, whose own sudo is the second.
		echo "SUDO_USER is ${author:-unset}, so the Author is unknown: run deploy/agents-engine/engine.sh setup as yourself, without sudo (it calls sudo itself)" >&2
		exit 1
	fi
	author_home="$(getent passwd "$author" | cut -d: -f6)"
	if [ -z "$author_home" ] || [ ! -d "$author_home" ]; then
		echo "cannot resolve the Author's home for '$author'" >&2
		exit 1
	fi
	agent_cert_dir="$author_home/.config/h4reet/agents-engine/docker"
	author_cert_dir="$author_home/.config/h4reet-ai/agents-engine/docker"
}

# --- H1: the user h4agents ----------------------------------------------------------------------
ensure_user() {
	if ! id -u "$user" >/dev/null 2>&1; then
		log "creating the user $user"
		useradd --system --home-dir /var/lib/h4agents/home --create-home \
			--shell /usr/sbin/nologin "$user"
	fi
	chmod 0700 /var/lib/h4agents/home
	# It must never be in docker, h4gpu, or sudo.
	for forbidden in docker "$gpu_group" sudo; do
		if id -nG "$user" | tr ' ' '\n' | grep -qx "$forbidden"; then
			log "removing $user from $forbidden"
			gpasswd -d "$user" "$forbidden" || true
		fi
	done
}

# --- H2: its own subordinate id range -----------------------------------------------------------
# subid_clash <file> <user> <uid> <start> <count>: the first entry of a subordinate-ID file (/etc/subuid's
# or /etc/subgid's name:start:count lines) that belongs to anyone but <user>, by name or by uid, and holds
# an ID from <start> to <start>+<count>-1. Prints it as file:line: entry and returns 1; returns 0 when
# there is none, or no file. A line it can't read is printed too: refusing beats assigning a range that
# might overlap what the line meant. Blank lines and # comments are skipped.
subid_clash() {
	local file="$1" owner="$2" owner_uid="$3" start="$4" count="$5"
	[ -e "$file" ] || return 0
	awk -F: -v owner="$owner" -v owner_uid="$owner_uid" -v start="$start" -v count="$count" '
		BEGIN { last = start + count - 1; clash = 0 }
		/^[[:space:]]*(#|$)/ { next }
		NF != 3 || $1 == "" || $2 !~ /^[0-9]+$/ || $3 !~ /^[0-9]+$/ {
			printf "%s:%d: %s (unreadable)\n", FILENAME, FNR, $0
			clash = 1
			exit
		}
		$1 == owner || (owner_uid != "" && $1 == owner_uid) { next }
		$3 > 0 && $2 + 0 <= last && $2 + $3 - 1 >= start + 0 {
			printf "%s:%d: %s\n", FILENAME, FNR, $0
			clash = 1
			exit
		}
		END { exit clash }' "$file"
}

# subid_ranges <file> <user> <uid>: the ranges <user> already holds there, by name or uid, as "start count".
subid_ranges() {
	local file="$1" owner="$2" owner_uid="$3"
	[ -e "$file" ] || return 0
	awk -F: -v owner="$owner" -v owner_uid="$owner_uid" '
		NF == 3 && ($1 == owner || (owner_uid != "" && $1 == owner_uid)) { print $2, $3 }' "$file"
}

# h4agents gets 1065536-1131071 in /etc/subuid and in /etc/subgid, where it holds no range yet. Whatever it
# holds there, before or after, must overlap no one else's range (H2): so container IDs never map into the
# Author's, or anyone's. Both files are checked before either changes, so a clash in one leaves both as
# they were. An entry of h4agents' own with this range is the idempotent case.
ensure_subids() {
	local start=1065536 count=65536 uid file held clash first size
	local range="$start-$((start + count - 1))"
	local -a assign=()
	uid="$(id -u "$user")"
	for file in "$subuid_file" "$subgid_file"; do
		held="$(subid_ranges "$file" "$user" "$uid")"
		if [ -z "$held" ]; then
			clash="$(subid_clash "$file" "$user" "$uid" "$start" "$count")" ||
				die "the subordinate range $range for $user overlaps an entry in $file that isn't $user's: $clash. Free that range, or choose another for $user here (contracts/agents-engine.md §5 H2)"
			assign+=("$file")
			continue
		fi
		while read -r first size; do
			clash="$(subid_clash "$file" "$user" "$uid" "$first" "$size")" ||
				die "$user's subordinate range $first-$((first + size - 1)) in $file overlaps an entry that isn't $user's: $clash (contracts/agents-engine.md §5 H2)"
		done <<<"$held"
	done
	for file in "${assign[@]}"; do
		if [ "$file" = "$subuid_file" ]; then
			log "assigning $user the subordinate uid range $range"
			usermod --add-subuids "$range" "$user"
		else
			log "assigning $user the subordinate gid range $range"
			usermod --add-subgids "$range" "$user"
		fi
	done
}

# --- H1: lingering, for h4agents and the Author -------------------------------------------------
ensure_linger() {
	log "enabling lingering for $user and $author"
	loginctl enable-linger "$user"
	loginctl enable-linger "$author"
}

# --- H6: the GPU group ---------------------------------------------------------------------------
ensure_gpu_group() {
	if ! getent group "$gpu_group" >/dev/null; then
		log "creating group $gpu_group"
		groupadd "$gpu_group"
	fi
	if ! id -nG "$author" | tr ' ' '\n' | grep -qx "$gpu_group"; then
		log "adding $author to $gpu_group"
		usermod --append --groups "$gpu_group" "$author"
		note_restart "$author's membership of $gpu_group"
	fi
}

# --- H6: the NVIDIA hook's CLI, as a user /dev/dxg admits --------------------------------------
# h4agents-dxg.service gives /dev/dxg to root:h4gpu, mode 0660, and the NVIDIA container hook's CLI runs its driver
# step as an unprivileged user unless its config names one. That user isn't in h4gpu, so every GPU container of the
# rootful engine failed: "nvidia-container-cli: initialization error: nvml error: not supported" (T065, 2026-10-09).
# This sets the least privileged user NVML works as: nobody in h4gpu, or root in h4gpu (tasks.md T179). nobody is
# tried only while the device has H6's mode. Before the first boot after setup it is 0666, open to every user, and
# the try would prove nothing: setup sets root, and next_steps asks for one more run after the shutdown. A boot
# whose H6 mode failed (h4agents-dxg.service ignores a failed chgrp or chmod) keeps a nobody a good boot proved,
# rather than raising it to root. Each try names the user exactly as the config will.
nvidia_config="/etc/nvidia-container-runtime/config.toml"
dxg="/dev/dxg"
nvidia_cli_retry="" # set when root was chosen only for want of H6's mode; next_steps reads it

# The user = line under [nvidia-container-cli], without its quotes, or nothing.
nvidia_cli_user() {
	awk '/^\[/ { cli = ($0 == "[nvidia-container-cli]") }
		cli && /^[[:space:]]*user[[:space:]]*=/ { sub(/^[^=]*=[[:space:]]*/, ""); gsub(/"/, ""); print; exit }' \
		"$nvidia_config" 2>/dev/null || true
}

# nvidia_cli_reaches <user:group>: whether NVML answers the CLI's info as that user, named as the config names it.
nvidia_cli_reaches() {
	nvidia-container-cli --user="$1" info >/dev/null 2>&1
}

ensure_nvidia_cli_user() {
	if [ ! -e "$dxg" ] || [ ! -f "$nvidia_config" ] ||
		! command -v nvidia-container-cli >/dev/null || ! command -v nvidia-ctk >/dev/null; then
		log "no GPU or no NVIDIA container toolkit here: the CLI's user is left alone"
		return 0
	fi
	local nobody="nobody:$gpu_group" root="root:$gpu_group" have want
	have="$(nvidia_cli_user)"
	# The agents' engine runs CPU-only, so a GPU nobody reaches warns rather than stopping its setup.
	if [ "$(stat -c '%G %a' -- "$dxg" 2>/dev/null)" = "$gpu_group 660" ]; then
		if nvidia_cli_reaches "$nobody"; then
			want="$nobody"
		elif nvidia_cli_reaches "$root"; then
			want="$root"
		else
			log "WARNING: nvidia-container-cli reaches the GPU neither as $nobody nor as $root;" \
				"the CLI's user is left alone (contracts/agents-engine.md H6)"
			return 0
		fi
	elif [ "$have" = "$nobody" ]; then
		log "WARNING: $dxg isn't root:$gpu_group 0660 this boot, so $nobody can't be tried; the CLI keeps it." \
			"See h4agents-dxg.service (H6)"
		return 0
	elif nvidia_cli_reaches "$root"; then
		want="$root"
		nvidia_cli_retry=1
	else
		log "WARNING: nvidia-container-cli doesn't reach the GPU as $root, and $nobody waits for $dxg's H6 mode;" \
			"the CLI's user is left alone (contracts/agents-engine.md H6)"
		return 0
	fi
	if [ "$have" = "$want" ]; then
		return 0
	fi
	log "the NVIDIA container CLI runs its driver step as $want"
	nvidia-ctk config --config-file "$nvidia_config" --in-place --set "nvidia-container-cli.user=$want"
}

# --- directories ---------------------------------------------------------------------------------
ensure_dirs() {
	install -d -o root -g root -m 0755 "$lib" "$etc" "$models_src"
	install -d -o root -g "$user" -m 0750 "$pki"
	# The plugin runs as h4agents and writes and rotates its decision log here (§3.5), so h4agents owns it. Under
	# root, the plugin's writes failed, and it drops a record it can't write rather than block (T046, 2026-10-09).
	install -d -o "$user" -g "$user" -m 0750 "$log_dir"
	install -d -o "$user" -g "$user" -m 0700 "$state"
}

# --- H13: installed, root-owned copies -----------------------------------------------------------
install_files() {
	log "installing the engine's code and units as root-owned copies"
	install -o root -g root -m 0644 "$here/authz.py" "$lib/authz.py"
	install -o root -g root -m 0644 "$here/egress-proxy.py" "$lib/egress-proxy.py"
	install -o root -g root -m 0755 "$here/bind-tree.sh" "$lib/bind-tree.sh"
	install -o root -g root -m 0644 "$here/tree-masks.txt" "$lib/tree-masks.txt"
	install -o root -g root -m 0644 "$here/nftables/h4agents.nft" "$lib/h4agents.nft"
	install -o root -g root -m 0644 "$here/daemon.json" "$lib/daemon.json"
	for unit in h4agents-net h4agents-nft h4agents-dxg h4agents-tree; do
		install -o root -g root -m 0644 "$here/systemd/$unit.service" \
			"/etc/systemd/system/$unit.service"
	done
	# The slice cap, at h4agents' own uid path (H12).
	local uid slice_dir
	uid="$(id -u "$user")"
	slice_dir="/etc/systemd/system/user-${uid}.slice.d"
	install -d -m 0755 "$slice_dir"
	install -o root -g root -m 0644 "$here/systemd/user-slice.conf" "$slice_dir/h4agents.conf"
	systemctl daemon-reload
}

# --- the non-secret environment file both the units and the proxy read --------------------------
write_env_file() {
	log "writing $env_file"
	umask 022
	cat >"$env_file" <<EOF
# The agents' engine paths (contracts/agents-engine.md §5). Written by setup-host.sh; no secrets.
H4_REPO=$repo
H4_TREE_MOUNT=/run/h4agents/tree
H4_MODELS_MOUNT=/run/h4agents/models
H4_MODELS_SRC=$models_src
H4_STATE=$state
H4_MASKS=$lib/tree-masks.txt
H4_AUTHZ_LOG=$log_dir/authz.jsonl
H4_EGRESS_SETTINGS=$repo/.claude/settings.json
H4_EGRESS_HOST=198.18.0.1
H4_EGRESS_PORT=3128
H4_EGRESS_LOG=$author_home/.local/state/h4reet/agents-engine/egress.jsonl
H4_EGRESS_LIST_FILE=$author_home/.local/state/h4reet/agents-engine/egress-list.json
EOF
	chmod 0644 "$env_file"
}

# install -d makes missing parents as root, mode 0755, which the owner can't later write. So each missing
# directory is made as its owner, mode 0700, parents first; one that exists is left as it is.
owned_dirs() {
	local owner="$1" d
	shift
	for d in "$@"; do
		[ -d "$d" ] || install -d -o "$owner" -g "$owner" -m 0700 "$d"
	done
}

# --- H14, H5: rootless docker for h4agents -------------------------------------------------------
# h4agents owns every directory in its home, so a process running as h4agents can make any of them a link. Root
# following one would chown or write wherever it led, /usr/local/lib/h4agents included, and the copies root runs
# would be h4agents' to change (H13; the review of T046's bring-up, 2026-10-09). So setup writes there only as
# h4agents: a link then reaches only what h4agents could write already. Each file goes through a copy h4agents
# can read, since the repository sits under the Author's home.
as_h4agents() { runuser -u "$user" -- "$@"; }

# h4agents_copy <mode> <source> <destination>: the file, installed there by h4agents.
h4agents_copy() {
	local tmp
	tmp="$(mktemp)"
	cp -- "$2" "$tmp"
	chmod 0644 "$tmp"
	as_h4agents install -T -m "$1" "$tmp" "$3" # -T: a directory there fails, not fills
	rm -f -- "$tmp"
}

# ensure_plugin_spec <home> <runtime dir>: the spec files through which dockerd finds the admission plugin (§3.1).
# A rootless daemon doesn't find the socket in the runtime directory where authz.py makes it, and refuses to start:
# "plugin h4-authz not found" (T046, 2026-10-09). Each file names the socket by path. Moby documents the rootless
# spec directories as $XDG_CONFIG_HOME/docker/plugins, then $HOME/.local/lib/docker/plugins. What T046 saw:
# - with a correct copy in ~/.config/docker/plugins alone, dockerd 28.3.3 refused to start;
# - with one in each directory, it started.
# The second directory is what dockerd read, in our reading; why it skipped the first isn't known, and the daemon's
# XDG_CONFIG_HOME wasn't checked. Both directories get the spec, so neither goes stale whichever a later dockerd
# reads. Each is left alone when it already holds exactly that, as h4agents' regular file, mode 0644. h4agents
# compares them, so a FIFO there holds setup up for 5 s at most.
ensure_plugin_spec() {
	local dir spec tmp
	tmp="$(mktemp)"
	printf 'unix://%s/docker/plugins/h4-authz.sock\n' "$2" >"$tmp"
	chmod 0644 "$tmp"
	for dir in "$1/.config/docker/plugins" "$1/.local/lib/docker/plugins"; do
		spec="$dir/h4-authz.spec"
		if [ -L "$spec" ] || [ "$(stat -c '%a %U %F' -- "$spec" 2>/dev/null)" != "644 $user regular file" ] ||
			! as_h4agents timeout 5 cmp -s -- "$tmp" "$spec"; then
			log "writing $spec: $(cat -- "$tmp")"
			as_h4agents install -T -m 0644 "$tmp" "$spec"
		fi
	done
	rm -f -- "$tmp"
}

setup_rootless_docker() {
	local uid runtime
	uid="$(id -u "$user")"
	runtime="/run/user/$uid"
	as_h4agents install -d -m 0700 "$h4_home/.config/docker/plugins" "$h4_home/.local/lib/docker/plugins" \
		"$h4_home/.config/systemd/user/docker.service.d"
	h4agents_copy 0644 "$here/daemon.json" "$h4_home/.config/docker/daemon.json"
	ensure_plugin_spec "$h4_home" "$runtime"
	h4agents_copy 0644 "$here/systemd/h4-authz.service" "$h4_home/.config/systemd/user/h4-authz.service"
	h4agents_copy 0644 "$here/systemd/docker.service.d/override.conf" \
		"$h4_home/.config/systemd/user/docker.service.d/override.conf"
	# Install the rootless daemon as h4agents' user service (idempotent).
	if [ ! -e "$h4_home/.config/systemd/user/docker.service" ]; then
		log "installing rootless docker for $user"
		runuser -u "$user" -- env XDG_RUNTIME_DIR="$runtime" PATH="/usr/bin:/usr/sbin:/bin:/sbin" \
			dockerd-rootless-setuptool.sh install --skip-iptables || {
			echo "rootless docker install needs the $user user manager; engine.sh up retries it" >&2
		}
	fi
}

# --- the Author's egress proxy as their own user service ----------------------------------------
install_author_units() {
	local author_unit="$author_home/.config/systemd/user"
	owned_dirs "$author" "$author_home/.config" "$author_home/.config/systemd"
	install -d -o "$author" -g "$author" -m 0700 "$author_unit"
	install -o "$author" -g "$author" -m 0644 "$here/systemd/h4-egress-proxy.service" \
		"$author_unit/h4-egress-proxy.service"
}

# --- H4: the firewall ruleset is installed above; the service is enabled below ------------------
enable_system_units() {
	log "enabling the engine's system units"
	systemctl enable h4agents-net.service h4agents-nft.service h4agents-dxg.service h4agents-tree.service
}

# --- H7: Windows files closed to every other user -----------------------------------------------
ensure_wsl_conf() {
	local conf="/etc/wsl.conf"
	if grep -qs 'umask=077' "$conf" && grep -qs 'fmask=077' "$conf"; then
		return 0
	fi
	log "setting /etc/wsl.conf automount umask=077,fmask=077 (needs one wsl --shutdown)"
	note_restart "/etc/wsl.conf's automount change"
	if [ ! -f "$conf" ]; then
		cat >"$conf" <<'EOF'
[automount]
options = "metadata,umask=077,fmask=077"
EOF
		return 0
	fi
	# Keep the file's other settings; replace or add the automount options line.
	if grep -q '^\[automount\]' "$conf"; then
		if grep -q '^options' "$conf"; then
			sed -i 's#^options.*#options = "metadata,umask=077,fmask=077"#' "$conf"
		else
			sed -i '/^\[automount\]/a options = "metadata,umask=077,fmask=077"' "$conf"
		fi
	else
		printf '\n[automount]\noptions = "metadata,umask=077,fmask=077"\n' >>"$conf"
	fi
}

# --- the PKI (never committed; generated here) --------------------------------------------------
issue_ca() {
	if [ -f "$pki/ca.pem" ] && [ -f "$pki/ca-key.pem" ] &&
		openssl x509 -checkend $((30 * 86400)) -noout -in "$pki/ca.pem" >/dev/null 2>&1; then
		return 0
	fi
	log "issuing the engine CA"
	umask 077
	openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out "$pki/ca-key.pem"
	openssl req -x509 -new -nodes -key "$pki/ca-key.pem" -sha256 -days 3650 \
		-subj "/CN=h4agents-engine-ca" -out "$pki/ca.pem"
}

issue_server() {
	if [ -f "$pki/server-cert.pem" ] && [ -f "$pki/server-key.pem" ] &&
		openssl x509 -checkend $((30 * 86400)) -noout -in "$pki/server-cert.pem" >/dev/null 2>&1; then
		return 0
	fi
	log "issuing the engine server certificate (SANs 198.18.0.1, 127.0.0.1)"
	umask 077
	local csr ext
	csr="$(mktemp)"
	ext="$(mktemp)"
	printf 'subjectAltName=IP:198.18.0.1,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n' >"$ext"
	openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out "$pki/server-key.pem"
	openssl req -new -key "$pki/server-key.pem" -subj "/CN=h4agents-engine" -out "$csr"
	openssl x509 -req -in "$csr" -CA "$pki/ca.pem" -CAkey "$pki/ca-key.pem" -CAcreateserial \
		-days "$cert_days" -sha256 -extfile "$ext" -out "$pki/server-cert.pem"
	rm -f -- "$csr" "$ext"
}

# issue_client <common-name> <destination directory> <owner> <dir mode> <file mode>
issue_client() {
	local cn="$1" dest="$2" owner="$3" dir_mode="$4" file_mode="$5"
	install -d -o "$owner" -g "$owner" -m "$dir_mode" "$dest"
	if [ -f "$dest/cert.pem" ] &&
		openssl x509 -checkend $((30 * 86400)) -noout -in "$dest/cert.pem" >/dev/null 2>&1; then
		return 0
	fi
	log "issuing the client certificate $cn into $dest"
	umask 077
	local csr ext
	csr="$(mktemp)"
	ext="$(mktemp)"
	printf 'extendedKeyUsage=clientAuth\n' >"$ext"
	openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out "$dest/key.pem"
	openssl req -new -key "$dest/key.pem" -subj "/CN=$cn" -out "$csr"
	openssl x509 -req -in "$csr" -CA "$pki/ca.pem" -CAkey "$pki/ca-key.pem" -CAcreateserial \
		-days "$cert_days" -sha256 -extfile "$ext" -out "$dest/cert.pem"
	cp -f "$pki/ca.pem" "$dest/ca.pem"
	rm -f -- "$csr" "$ext"
	chown -R "$owner:$owner" "$dest"
	chmod "$dir_mode" "$dest"
	chmod "$file_mode" "$dest/ca.pem" "$dest/cert.pem" "$dest/key.pem"
}

set_pki_modes() {
	chown root:root "$pki/ca-key.pem" "$pki/ca.pem" "$pki/server-cert.pem"
	chown "root:$user" "$pki/server-key.pem"
	chmod 0600 "$pki/ca-key.pem"
	chmod 0644 "$pki/ca.pem" "$pki/server-cert.pem"
	chmod 0640 "$pki/server-key.pem"
}

ensure_pki() {
	issue_ca
	issue_server
	set_pki_modes
	# The parents as the Author (owned_dirs). ~/.config/h4reet-ai holds the env files and the tokens too, so it
	# is held to 0700 whether or not it existed (contracts/env-files.md §8).
	owned_dirs "$author" "$author_home/.config" "$author_home/.config/h4reet" "$(dirname -- "$agent_cert_dir")"
	install -d -o "$author" -g "$author" -m 0700 "$author_home/.config/h4reet-ai"
	[ -d "$(dirname -- "$author_cert_dir")" ] ||
		install -d -o "$author" -g "$author" -m 0700 "$(dirname -- "$author_cert_dir")"
	# The agents' certificate: readable, not writable, outside the sandbox's write roots.
	issue_client "h4agents-sandbox" "$agent_cert_dir" "$author" 0555 0444
	ensure_agent_docker_config
	# The Author's certificate: private to the Author.
	issue_client "h4agents-author" "$author_cert_dir" "$author" 0700 0600
}

# --- the agents' DOCKER_CONFIG: config.json is {} (contracts/agents-engine.md §2.3) -----------------
# No credentials, and no `proxies` entry, which the CLI would put into every container's environment.
# Owned by the Author, 0444, in the 0555 directory issue_client made, whose modes it leaves as they are;
# a session can read it and not write it. install replaces a link at the name rather than writing
# through it. Unchanged when it is already exactly that.
ensure_agent_docker_config() {
	local config="$agent_cert_dir/config.json" tmp
	if [ -f "$config" ] && [ ! -L "$config" ] && [ "$(cat -- "$config")" = "{}" ] &&
		[ "$(stat -c '%a %U %G' -- "$config")" = "444 $author $author" ]; then
		return 0
	fi
	log "writing $config: {}, mode 0444"
	tmp="$(mktemp)"
	printf '{}\n' >"$tmp"
	install -T -o "$author" -g "$author" -m 0444 "$tmp" "$config" # -T: a directory there fails, not fills
	rm -f -- "$tmp"
}

main() {
	resolve_author
	ensure_user
	ensure_subids
	ensure_linger
	ensure_gpu_group
	ensure_nvidia_cli_user
	ensure_dirs
	install_files
	write_env_file
	ensure_pki
	setup_rootless_docker
	install_author_units
	enable_system_units
	ensure_wsl_conf
	next_steps
}

# note_restart <reason>: a change only a wsl --shutdown applies, recorded at once in the marker, under this boot's
# ID, so a run that fails later still leaves it. A marker from an earlier boot is spent, and starts over.
note_restart() {
	local boot
	boot="$(cat -- "$boot_id_file")"
	install -d -o root -g root -m 0755 "${restart_marker%/*}"
	if [ ! -f "$restart_marker" ] || [ "$(head -n 1 -- "$restart_marker")" != "$boot" ]; then
		printf '%s\n' "$boot" >"$restart_marker"
	fi
	awk -v reason="$1" 'NR > 1 && $0 == reason { held = 1 } END { exit !held }' "$restart_marker" ||
		printf '%s\n' "$1" >>"$restart_marker"
}

# pending_restart: what still waits for a wsl --shutdown this boot, joined, or nothing. A marker from an earlier
# boot is spent: the shutdown came, and the marker goes.
pending_restart() {
	[ -f "$restart_marker" ] || return 0
	if [ "$(head -n 1 -- "$restart_marker")" != "$(cat -- "$boot_id_file")" ]; then
		rm -f -- "$restart_marker"
		return 0
	fi
	awk 'NR > 1 { printf "%s%s", (NR > 2 ? ", and " : ""), $0; n++ } END { if (n) print "" }' "$restart_marker"
}

# The run's last words: the wsl --shutdown while a change that needs one still waits for it, whichever run made
# the change, and otherwise the restart of h4agents' plugin and daemon, which up alone wouldn't give a daemon
# already running. When the NVIDIA CLI got root only for want of H6's mode, one more setup run comes first (T179).
next_steps() {
	local why again=""
	why="$(pending_restart)"
	if [ -n "$nvidia_cli_retry" ]; then
		again="    deploy/agents-engine/engine.sh setup   (once more: with /dev/dxg in H6's mode, it tries nobody:$gpu_group)
"
	fi
	if [ -n "$why" ]; then
		cat <<EOF

Host setup complete. Next, in PowerShell:
    wsl --shutdown
Then open a new WSL shell and run:
${again}    deploy/agents-engine/engine.sh up
The shutdown is needed for $why to take effect, and it ends every WSL
session, agents' included.
EOF
	else
		cat <<EOF

Host setup complete. No wsl --shutdown is needed: nothing waits for one. To run h4agents' plugin and daemon
from what it installed:
    deploy/agents-engine/engine.sh down
    deploy/agents-engine/engine.sh up
EOF
		if [ -n "$nvidia_cli_retry" ]; then
			cat <<EOF
/dev/dxg isn't root:$gpu_group 0660 this boot, so the NVIDIA container CLI runs as root:$gpu_group. Check
h4agents-dxg.service, then run setup once more: it tries nobody:$gpu_group with the device in H6's mode.
EOF
		fi
	fi
}

# Run as a command; sourced, it only defines the functions above, which the tests call
# (test/test_setup_host_sh.py). Run, its first step is resolve_author's root check.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
	main "$@"
fi
