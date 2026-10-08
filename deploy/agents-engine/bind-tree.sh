#!/usr/bin/env bash
# The agents' engine read-only tree, models, and state binds (contracts/agents-engine.md §5, H8-H10).
#
# Invoked as root by h4agents-tree.service: `bind-tree.sh up` mounts, `bind-tree.sh down` unmounts.
# Idempotent, and fails closed. The config comes from the unit's EnvironmentFile
# (/etc/h4agents/engine.env), which setup-host.sh writes; engine.sh up has already created any masked
# directory that does not exist, so each mask applies.
#
# Human-only: the copy engine.sh setup installs at /usr/local/lib/h4agents/ is what runs.
set -euo pipefail

: "${H4_REPO:?H4_REPO must name the repository}"
tree="${H4_TREE_MOUNT:-/run/h4agents/tree}"
models_mount="${H4_MODELS_MOUNT:-/run/h4agents/models}"
models_src="${H4_MODELS_SRC:-/var/lib/h4agents/models}"
state="${H4_STATE:-/var/lib/h4agents/state}"
masks="${H4_MASKS:-/usr/local/lib/h4agents/tree-masks.txt}"
empty="/run/h4agents/empty"

is_mount() { /usr/bin/mountpoint -q -- "$1"; }

masked_paths() {
	if [ -f "$masks" ]; then grep -vE '^[[:space:]]*(#|$)' "$masks"; fi
}

bind_up() {
	mkdir -p -- "$tree" "$models_mount"
	: >"$empty" # an empty file to mask a .git that is a file (a linked worktree)

	# The working tree, read-only, with no symlink following.
	if ! is_mount "$tree"; then
		/usr/bin/mount --bind -- "$H4_REPO" "$tree"
		/usr/bin/mount -o remount,bind,ro,nosuid,nodev,nosymfollow -- "$tree"
	fi

	# An empty, read-only mask over every listed path.
	while IFS= read -r rel; do
		[ -n "$rel" ] || continue
		target="$tree/$rel"
		if [ -f "$target" ] && ! is_mount "$target"; then
			/usr/bin/mount --bind -- "$empty" "$target"
			/usr/bin/mount -o remount,bind,ro,nosuid,nodev -- "$target"
		elif [ -d "$target" ] && ! is_mount "$target"; then
			/usr/bin/mount -t tmpfs -o ro,nosuid,nodev,mode=0000 h4mask "$target"
		fi
	done < <(masked_paths)

	# The stand-in models, read-only.
	if [ -d "$models_src" ] && ! is_mount "$models_mount"; then
		/usr/bin/mount --bind -- "$models_src" "$models_mount"
		/usr/bin/mount -o remount,bind,ro,nosuid,nodev,nosymfollow -- "$models_mount"
	fi

	# The state root, bound onto itself, so a symlink a container writes cannot redirect a later bind.
	if [ -d "$state" ] && ! is_mount "$state"; then
		/usr/bin/mount --bind -- "$state" "$state"
		/usr/bin/mount -o remount,bind,nosuid,nodev,nosymfollow -- "$state"
	fi
}

bind_down() {
	# Masks sit on top of the tree, so they come off first.
	while IFS= read -r rel; do
		[ -n "$rel" ] || continue
		target="$tree/$rel"
		if is_mount "$target"; then /usr/bin/umount -- "$target" || true; fi
	done < <(masked_paths)
	for point in "$models_mount" "$tree" "$state"; do
		if is_mount "$point"; then /usr/bin/umount -- "$point" || true; fi
	done
}

case "${1:-}" in
up) bind_up ;;
down) bind_down ;;
*)
	echo "usage: bind-tree.sh up|down" >&2
	exit 2
	;;
esac
