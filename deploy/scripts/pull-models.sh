#!/usr/bin/env bash
# The stack's model, fetched and verified (spec 000 FR-014, FR-019; plan §3 and §4; contracts/env-files.md §3 and
# §10; ADR 0019). The Author's terminal on prod and dev; on the agents' engine it only verifies.
#
#   bash deploy/scripts/pull-models.sh --stack prod|dev|dev-cpu --env-file PATH [--all]
#
# make up runs it after preflight, for the stack's model: the deploy/models.lock entry whose file is the env file's
# MODEL_FILE and whose stacks include the stack. make pull runs it too, with --all for every entry (MODELS=all). It
# runs from the tree being started, the export of the commit on a host stack, so the lock it reads is that commit's.
#
# For each model, in the env file's H4_MODEL_DIR:
#   - prod and dev. A file with the lock's size and mode 0444 is present: its sha256 was checked when this script
#     downloaded it. One with the lock's size and another mode is checked against the sha256 now, then set to 0444.
#     A missing one is downloaded:
#       1. the disk preflight for the bytes still to come (preflight.py --disk-only: checks P13 and P14);
#       2. https://huggingface.co/<repo>/resolve/<revision>/<file>, with curl -fL -C -, into .<file>.part beside
#          it, which a later run resumes. No token: -q reads no .curlrc, curl reads no .netrc unless asked, and no
#          credential or header is sent; every hop, redirects included, is https;
#       3. the size and the sha256, against the lock; a download that doesn't match is removed, never kept;
#       4. mode 0444, then an atomic rename into place, in the same directory, so the file's own name never holds a
#          partial or unverified model.
#   - dev-cpu, the agents' engine, never downloads. It verifies the seeded model's size and sha256, and if the model
#     is missing or doesn't match, says to ask the Author to run deploy/agents-engine/engine.sh seed.
#
# The env file is read as data, three of its KEY=VALUE lines, and never sourced. Exit codes: 0 every model present
# and verified; 1 a download, a check, or the disk preflight failed; 2 usage.
set -euo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
root="$(dirname -- "$(dirname -- "$here")")"
lock="$root/deploy/models.lock"
# Every Python the Author's terminal runs: isolated, and blind to bytecode an agent could plant (plan §4, R-35).
py=(python3 -I -B -X pycache_prefix=/dev/null)
seed="ask the Author to run deploy/agents-engine/engine.sh seed"

usage() {
	echo "usage: pull-models.sh --stack prod|dev|dev-cpu --env-file PATH [--all]" >&2
	exit 2
}

stack="" env_file="" all=0
while [ "$#" -gt 0 ]; do
	case "$1" in
	--stack)
		[ "$#" -ge 2 ] || usage
		stack="$2"
		shift 2
		;;
	--env-file)
		[ "$#" -ge 2 ] || usage
		env_file="$2"
		shift 2
		;;
	--all)
		all=1
		shift
		;;
	*) usage ;;
	esac
done
case "$stack" in prod | dev | dev-cpu) ;; *) usage ;; esac
[ -n "$env_file" ] || usage
if [ "$stack" = dev-cpu ] && [ "$all" = 1 ]; then
	echo "pull-models.sh: the agents' engine holds only the stand-in the Author seeds; --all is make pull's, on the host" >&2
	exit 2
fi
if [ "$stack" != dev-cpu ] && [ "${SANDBOX_RUNTIME:-}" = 1 ]; then
	echo "pull-models.sh: $stack's models download in the Author's terminal; agent sessions run dev-cpu, whose model the Author seeds" >&2
	exit 2
fi
if [ ! -f "$env_file" ] || [ ! -r "$env_file" ]; then
	echo "pull-models.sh: $env_file can't be read" >&2
	exit 2
fi
if [ ! -f "$lock" ]; then
	echo "models: FAIL $lock is missing" >&2
	exit 1
fi

# A key's value, read from the env file as data (contracts/env-files.md §1.1): its first KEY= line, without the single
# quotes that may wrap it. Nothing in the file is ever run.
env_value() {
	local key="$1" line
	while IFS= read -r line || [ -n "$line" ]; do
		line="${line%$'\r'}"
		case "$line" in
		"$key="*)
			line="${line#"$key="}"
			case "$line" in \'*\') line="${line:1:${#line}-2}" ;; esac
			printf '%s' "$line"
			return 0
			;;
		esac
	done <"$env_file"
}

model_dir="$(env_value H4_MODEL_DIR)"
model_file="$(env_value MODEL_FILE)"
vhdx="$(env_value H4_VHDX_MOUNT)"
vhdx="${vhdx:-/mnt/c}"
case "$model_dir" in
/*) ;;
*)
	echo "models: FAIL H4_MODEL_DIR in $env_file isn't an absolute path" >&2
	exit 1
	;;
esac

# The lock, one model per line: id alias repo revision file sha256 bytes license vram stacks. Each field that reaches
# a path or a URL is held to its shape first, so no line can point the download or the rename anywhere else.
entries=()
number=0
while IFS= read -r line || [ -n "$line" ]; do
	number=$((number + 1))
	trimmed="${line#"${line%%[![:space:]]*}"}"
	case "$trimmed" in '' | \#*) continue ;; esac
	read -r _id _alias repo revision file sha size _license _vram stacks extra <<<"$trimmed"
	if [ -z "${stacks:-}" ] || [ -n "${extra:-}" ] ||
		! [[ "$repo" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*$ ]] ||
		! [[ "$revision" =~ ^[0-9a-f]{40}$ ]] ||
		! [[ "$file" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*\.gguf$ ]] ||
		! [[ "$sha" =~ ^[0-9a-f]{64}$ ]] ||
		! [[ "$size" =~ ^[1-9][0-9]*$ ]]; then
		echo "models: FAIL $lock line $number isn't id alias repo revision file sha256 bytes license vram stacks, with" \
			"an owner/name repo, a 40-hex revision, a plain .gguf file name, a 64-hex sha256, and a size in bytes" >&2
		exit 1
	fi
	if [ "$all" = 1 ] || { [ "$file" = "$model_file" ] && [[ ",$stacks," == *",$stack,"* ]]; }; then
		entries+=("$repo $revision $file $sha $size")
	fi
done <"$lock"
if [ "${#entries[@]}" -eq 0 ]; then
	if [ "$all" = 1 ]; then
		echo "models: FAIL $lock lists no model" >&2
	else
		echo "models: FAIL MODEL_FILE in $env_file names no $lock entry for $stack" >&2
	fi
	exit 1
fi

failures=0
fail() {
	echo "models: FAIL $1" >&2
	failures=$((failures + 1))
}
size_of() { stat -c %s -- "$1"; }
mode_of() { stat -c %a -- "$1"; }
sha_of() {
	local sum
	sum="$(sha256sum -- "$1")"
	printf '%s' "${sum%% *}"
}
gb() { awk -v b="$1" 'BEGIN { printf "%.1f GB", b / 1e9 }'; }

# dev-cpu: the model engine.sh seed copied, verified; never a download.
verify_seeded() {
	local file="$1" sha="$2" size="$3"
	local path="$model_dir/$file"
	if [ -L "$path" ] || [ ! -f "$path" ]; then
		fail "$path is missing: $seed"
		return 0
	fi
	if [ "$(size_of "$path")" != "$size" ]; then
		fail "$path is $(size_of "$path") bytes, not the lock's $size: $seed"
		return 0
	fi
	if [ "$(sha_of "$path")" != "$sha" ]; then
		fail "$path's sha256 isn't the lock's: $seed"
		return 0
	fi
	echo "models: $file: verified on the agents' engine (sha256 ${sha:0:12})"
}

# prod and dev: present, or downloaded and verified.
fetch() {
	local repo="$1" revision="$2" file="$3" sha="$4" size="$5"
	local path="$model_dir/$file" part="$model_dir/.$file.part"
	local have partial remaining got
	if [ -L "$path" ]; then
		fail "$path is a symbolic link, which the model server's read-only mount can't follow out of H4_MODEL_DIR: replace it with the file"
		return 0
	fi
	if [ -e "$path" ]; then
		if [ ! -f "$path" ]; then
			fail "$path isn't a regular file: move it aside, then run make pull again"
			return 0
		fi
		have="$(size_of "$path")"
		if [ "$have" != "$size" ]; then
			fail "$path is $have bytes, not the lock's $size: move it aside, then run make pull again"
			return 0
		fi
		if [ "$(mode_of "$path")" = 444 ]; then
			echo "models: $file: present (its sha256 was checked when it was downloaded)"
			return 0
		fi
		if [ "$(sha_of "$path")" != "$sha" ]; then
			fail "$path's sha256 isn't the lock's: move it aside, then run make pull again"
			return 0
		fi
		chmod 0444 -- "$path"
		echo "models: $file: present; its sha256 matches the lock, and it is now mode 0444"
		return 0
	fi
	mkdir -p -- "$model_dir"
	# A partial download is resumed. A link in its place is removed, never written through.
	if [ -L "$part" ]; then rm -f -- "$part"; fi
	partial=0
	if [ -f "$part" ]; then partial="$(size_of "$part")"; fi
	if [ "$partial" -gt "$size" ]; then
		rm -f -- "$part"
		partial=0
	fi
	remaining=$((size - partial))
	if [ "$remaining" -gt 0 ]; then
		echo "models: $file: $(gb "$remaining") to download from huggingface.co/$repo at revision ${revision:0:12}"
		if ! "${py[@]}" "$here/preflight.py" --disk-only --bytes "$remaining" --path "$model_dir" --vhdx-mount "$vhdx"; then
			fail "$file: the disk check refused the download (research.md R-32)"
			return 0
		fi
		if ! curl -q -fL -C - --proto '=https' --proto-redir '=https' -o "$part" \
			"https://huggingface.co/$repo/resolve/$revision/$file"; then
			fail "$file: the download failed; make pull resumes it from $part"
			return 0
		fi
	fi
	got="$(size_of "$part")"
	if [ "$got" != "$size" ]; then
		if [ "$got" -gt "$size" ]; then rm -f -- "$part"; fi
		fail "$file: the download is $got bytes, not the lock's $size"
		return 0
	fi
	if [ "$(sha_of "$part")" != "$sha" ]; then
		rm -f -- "$part"
		fail "$file: its sha256 isn't the lock's, so the download was removed; if it happens again, check the lock against the file's page"
		return 0
	fi
	chmod 0444 -- "$part"
	sync -- "$part"
	mv -f -T -- "$part" "$path"
	sync -- "$model_dir"
	echo "models: $file: downloaded, its sha256 matches the lock (${sha:0:12}), mode 0444"
}

for entry in "${entries[@]}"; do
	read -r repo revision file sha size <<<"$entry"
	if [ "$stack" = dev-cpu ]; then
		verify_seeded "$file" "$sha" "$size"
	else
		fetch "$repo" "$revision" "$file" "$sha" "$size"
	fi
done
if [ "$failures" -gt 0 ]; then
	echo "models: $failures of ${#entries[@]} failed" >&2
	exit 1
fi
echo "models: ${#entries[@]} of ${#entries[@]} present and verified"
