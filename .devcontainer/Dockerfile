# The devcontainer: the one toolchain for newcomers, the Author's gate, and CI after publication
# (spec 000 FR-005, plan §9, ADR 0018). Agent sessions run on the host with the same versions.
# Every base is pinned by digest. The ARG versions below must equal .devcontainer/toolchain.vars, which
# tools/gates/test/test_toolchain_check.py checks; `make toolchain-check` inside the container checks the result.
# Built from the repository root: .devcontainer/devcontainer.json sets the context to "..".

ARG NODE_VERSION=24.21.0
ARG UV_VERSION=0.8.22
ARG RUFF_VERSION=0.16.10
ARG GITLEAKS_VERSION=8.30.1

# Node comes out of the official image, which installs nodejs.org's release tarball after checking it against the
# release's signed SHASUMS256. Its digest pins that binary (plan §9).
FROM public.ecr.aws/docker/library/node:${NODE_VERSION}-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66 AS node
FROM ghcr.io/astral-sh/uv:${UV_VERSION}@sha256:9874eb7afe5ca16c363fe80b294fe700e460df29a55532bbfea234a0f12eddb1 AS uv
FROM ghcr.io/astral-sh/ruff:${RUFF_VERSION}@sha256:e1675e92fe4d38ce10ab6cabaf4ab20f209b84433b789cfd1b683c028aa391e2 AS ruff
FROM ghcr.io/gitleaks/gitleaks:v${GITLEAKS_VERSION}@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f AS gitleaks

FROM public.ecr.aws/docker/library/ubuntu:24.04@sha256:534baea6a22c03a63003dbc8dbe78fe34bc0d7e595d9a9dc9834884ff530eb55

# Off by default: agent sessions run on the host (ADR 0018), and Terraform's pin arrives with spec 001.
ARG WITH_CLAUDE=0
ARG WITH_TERRAFORM=0
ARG CLAUDE_CODE_VERSION=2.1.295

# The host's distribution, so apt gives the versions the host has: shellcheck, jq, Python 3.12, git, make.
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ca-certificates git make bubblewrap socat shellcheck jq python3 python3-yaml python3-venv \
 && rm -rf /var/lib/apt/lists/*

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
COPY --from=uv /uv /uvx /usr/local/bin/
COPY --from=ruff /ruff /usr/local/bin/ruff
COPY --from=gitleaks /usr/bin/gitleaks /usr/local/bin/gitleaks

# pytest and PyYAML, from hashes only.
COPY .devcontainer/requirements-tools.txt /tmp/requirements-tools.txt
RUN python3 -m venv /opt/tools \
 && /opt/tools/bin/pip install --no-cache-dir --require-hashes -r /tmp/requirements-tools.txt \
 && rm /tmp/requirements-tools.txt

# The post-edit hook's lint toolchain, as make tools installs it on the host.
COPY tools/gates/lint-node/package.json tools/gates/lint-node/package-lock.json tools/gates/lint-node/eslint.config.mjs tools/gates/lint-node/prettier.config.json /opt/h4reet/lint-node/
RUN cd /opt/h4reet/lint-node && npm ci --ignore-scripts --no-audit --no-fund

RUN if [ "$WITH_CLAUDE" = 1 ]; then npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}"; fi
RUN if [ "$WITH_TERRAFORM" = 1 ]; then echo "Terraform's pin arrives with spec 001; build with WITH_TERRAFORM=0" >&2; exit 1; fi

# The image's ubuntu user is replaced by dev, with the same uid and no sudo.
RUN userdel --remove ubuntu \
 && useradd --create-home --uid 1000 --shell /bin/bash dev

ENV PATH=/opt/tools/bin:$PATH \
    H4_DEVCONTAINER=1 \
    H4_LINT_NODE=/opt/h4reet/lint-node
USER dev
