#!/usr/bin/env bash
# make tools, in the Author's own terminal: install the pinned host tools where agents can't write
# (spec 000, plan §9, tasks.md T009 and T013). Pins come from .devcontainer/toolchain.vars.
#   1. Node, through nvm, without changing the default Node your shells and Claude Code use.
#   2. pytest with PyYAML, as a uv tool (~/.local/bin/pytest).
#   3. gitleaks, copied out of its digest-pinned image into ~/.local/bin.
#   4. The post-edit hook's lint toolchain, and the Node it runs on, into ~/.local/share/h4reet/lint-node.
# Then run `make toolchain-check`.
set -euo pipefail

if [ "${SANDBOX_RUNTIME:-}" = 1 ]; then
  echo "make tools installs into your home directory: run it in your own terminal, not in an agent session" >&2
  exit 2
fi

repo="$(cd "$(dirname "$0")/../.." && pwd)"
pin() {
  local value
  value="$(sed -n "s/^$1=//p" "$repo/.devcontainer/toolchain.vars")"
  [ -n "$value" ] || { echo "no $1 in .devcontainer/toolchain.vars" >&2; exit 1; }
  printf '%s' "$value"
}
node_v="$(pin NODE_VERSION)"
pytest_v="$(pin PYTEST_VERSION)"
pyyaml_v="$(pin PYYAML_VERSION)"
gitleaks_v="$(pin GITLEAKS_VERSION)"
# The digest is plan §2's pin for this tag (research.md R-02).
gitleaks_image="ghcr.io/gitleaks/gitleaks:v${gitleaks_v}@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f"

echo "== 1. Node $node_v, through nvm"
nvm_dir="${NVM_DIR:-$HOME/.nvm}"
node_bin="$nvm_dir/versions/node/v$node_v/bin"
if [ -x "$node_bin/node" ]; then
  echo "already installed: $node_bin/node"
elif [ -s "$nvm_dir/nvm.sh" ]; then
  # nvm is a shell function, loaded here for this script only. With a default alias already set, as yours is,
  # `nvm install` leaves it alone, so new shells keep their Node and the Claude Code installed under it.
  set +u
  # shellcheck source=/dev/null
  . "$nvm_dir/nvm.sh" --no-use
  nvm install "$node_v" --no-progress
  set -u
else
  echo "nvm isn't installed in $nvm_dir. Install Node $node_v another way, so that $node_bin/node exists, and rerun." >&2
  exit 1
fi
"$node_bin/node" --version

echo "== 2. pytest $pytest_v with PyYAML $pyyaml_v, as a uv tool"
# The interpreter is pinned and configuration files are skipped, so nothing git doesn't show steers the install.
# pytest's own dependencies take the versions in the devcontainer's requirements file (FR-014). uv doesn't check
# that file's hashes on this path; the devcontainer's pip install does.
uv tool install --no-config --python "$(command -v python3)" --force "pytest==$pytest_v" --with "pyyaml==$pyyaml_v" \
  --constraints "$repo/.devcontainer/requirements-tools.txt"

echo "== 3. gitleaks $gitleaks_v, from its pinned image"
command -v docker >/dev/null || { echo "gitleaks comes out of its pinned image, so this step needs Docker" >&2; exit 1; }
mkdir -p "$HOME/.local/bin"
docker pull --quiet "$gitleaks_image" >/dev/null
cid="$(docker create "$gitleaks_image")"
trap 'docker rm -f "$cid" >/dev/null 2>&1 || true' EXIT
docker cp "$cid:/usr/bin/gitleaks" "$HOME/.local/bin/gitleaks.new"
chmod 0755 "$HOME/.local/bin/gitleaks.new"
mv -f "$HOME/.local/bin/gitleaks.new" "$HOME/.local/bin/gitleaks"
"$HOME/.local/bin/gitleaks" version

echo "== 4. the lint toolchain, into ~/.local/share/h4reet/lint-node"
lint="$HOME/.local/share/h4reet/lint-node"
mkdir -p "$lint"
for f in package.json package-lock.json eslint.config.mjs prettier.config.json; do
  install -m 0644 "$repo/tools/gates/lint-node/$f" "$lint/$f"
done
(cd "$lint" && PATH="$node_bin:$PATH" npm ci --ignore-scripts --no-audit --no-fund)
# The post-edit hook runs this Node, outside the sandbox, by this name: the pinned one, never the one first on PATH.
ln -sfn "$node_bin/node" "$lint/node"

echo "make tools: done. Next: make toolchain-check"
