#!/usr/bin/env bash
# The agents' engine host setup (spec 000, FR-039; contracts/agents-engine.md §5, H1-H14).
#
# Run once by the Author with sudo, through `deploy/agents-engine/engine.sh setup`, followed by one
# `wsl --shutdown`. Idempotent: every step checks before it changes, and reissues a client certificate
# only when it is missing or within 30 days of expiry. It fails closed on any error.
#
# NEVER run from an agent session: it needs sudo, and a user that does not exist yet. Human-only (the
# FR-039 boundary); the copies it installs under /usr/local/lib/h4agents and /etc/systemd are what run,
# never the working tree's files (H13).
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
	echo "setup-host.sh must run as root (through sudo)" >&2
	exit 1
fi
author="${SUDO_USER:-}"
if [ -z "$author" ] || [ "$author" = "root" ]; then
	echo "run through sudo as the Author, not as root directly (SUDO_USER is unset)" >&2
	exit 1
fi

# The repository path is fixed here, at setup time, from this script's own location.
here="$(cd -- "$(dirname -- "$0")" && pwd)"
repo="$(cd -- "$here/../.." && pwd)"
author_home="$(getent passwd "$author" | cut -d: -f6)"
if [ -z "$author_home" ] || [ ! -d "$author_home" ]; then
	echo "cannot resolve the Author's home for '$author'" >&2
	exit 1
fi

user="h4agents"
gpu_group="h4gpu"
lib="/usr/local/lib/h4agents"
etc="/etc/h4agents"
pki="$etc/pki"
env_file="$etc/engine.env"
models_src="/var/lib/h4agents/models"
state="/var/lib/h4agents/state"
log_dir="/var/log/h4agents"
agent_cert_dir="$author_home/.config/h4reet/agents-engine/docker"
author_cert_dir="$author_home/.config/h4reet-ai/agents-engine/docker"
cert_days=397

log() { printf '== %s\n' "$*"; }

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
ensure_subids() {
	if ! grep -q "^${user}:" /etc/subuid; then
		log "assigning $user a subordinate uid range"
		usermod --add-subuids 1065536-1131071 "$user"
	fi
	if ! grep -q "^${user}:" /etc/subgid; then
		log "assigning $user a subordinate gid range"
		usermod --add-subgids 1065536-1131071 "$user"
	fi
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
	fi
}

# --- directories ---------------------------------------------------------------------------------
ensure_dirs() {
	install -d -o root -g root -m 0755 "$lib" "$etc" "$models_src"
	install -d -o root -g "$user" -m 0750 "$pki" "$log_dir"
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
setup_rootless_docker() {
	local uid runtime
	uid="$(id -u "$user")"
	runtime="/run/user/$uid"
	owned_dirs "$user" "/var/lib/h4agents/home/.config" "/var/lib/h4agents/home/.config/systemd"
	install -d -o "$user" -g "$user" -m 0700 \
		"/var/lib/h4agents/home/.config/docker" \
		"/var/lib/h4agents/home/.config/systemd/user" \
		"/var/lib/h4agents/home/.config/systemd/user/docker.service.d"
	install -o "$user" -g "$user" -m 0644 "$here/daemon.json" \
		"/var/lib/h4agents/home/.config/docker/daemon.json"
	install -o "$user" -g "$user" -m 0644 "$here/systemd/h4-authz.service" \
		"/var/lib/h4agents/home/.config/systemd/user/h4-authz.service"
	install -o "$user" -g "$user" -m 0644 "$here/systemd/docker.service.d/override.conf" \
		"/var/lib/h4agents/home/.config/systemd/user/docker.service.d/override.conf"
	# Install the rootless daemon as h4agents' user service (idempotent).
	if [ ! -e "/var/lib/h4agents/home/.config/systemd/user/docker.service" ]; then
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
	# The Author's certificate: private to the Author.
	issue_client "h4agents-author" "$author_cert_dir" "$author" 0700 0600
}

main() {
	ensure_user
	ensure_subids
	ensure_linger
	ensure_gpu_group
	ensure_dirs
	install_files
	write_env_file
	ensure_pki
	setup_rootless_docker
	install_author_units
	enable_system_units
	ensure_wsl_conf
	cat <<EOF

Host setup complete. Next, in PowerShell:
    wsl --shutdown
Then open a new WSL shell and run:
    deploy/agents-engine/engine.sh up
The shutdown is needed for /etc/wsl.conf's automount change to take effect, and it ends every WSL
session, agents' included.
EOF
}

main "$@"
