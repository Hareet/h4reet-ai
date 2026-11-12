# The night shift's studio image (spec 017, plan.md §1 and §7; tasks.md T034): Claude Code and headless Blender,
# for the studio agent's container on h4-night-studio, with --gpus all under the GPU lock.
#
# install.sh builds it from a repository-shaped context it writes with `git show <sha>:<path>` for each path that
# pins.json's images.studio.context lists. Its arguments come from pins.json:
#   NODE_IMAGE        node:22-bookworm-slim@digest (the container probe's worker base)
#   CLAUDE_CODE_VERSION  the pin the worker image has
#   BLENDER_URL, BLENDER_SHA256  Blender 5.2.3 LTS and the checksum Blender publishes, as the Author's
#                     oc-studio-agent.sh pins it; the build stops if the download doesn't match.
# Blender's runtime libraries are oc-studio-agent.sh's: -b needs no display, but the binary still links X11 and GL.
ARG NODE_IMAGE

FROM ${NODE_IMAGE} AS blender
ARG BLENDER_URL
ARG BLENDER_SHA256
RUN apt-get update \
 && apt-get install -y --no-install-recommends xz-utils \
 && rm -rf /var/lib/apt/lists/*
ADD ${BLENDER_URL} /tmp/blender.tar.xz
RUN printf '%s\n' "${BLENDER_SHA256}" | grep -E -q -x '[0-9a-f]{64}' \
 && echo "${BLENDER_SHA256}  /tmp/blender.tar.xz" | sha256sum -c --quiet - \
 && mkdir /opt/blender \
 && tar -xJf /tmp/blender.tar.xz -C /opt/blender --strip-components=1 \
 && rm /tmp/blender.tar.xz

FROM ${NODE_IMAGE}
ARG CLAUDE_CODE_VERSION
ARG NIGHT_UID
ARG NIGHT_GID
# The runner mounts nothing at /etc, so the Author's uid gets its passwd entry here (home /night/home), unless the
# image has one already (node is 1000).
RUN test -n "${NIGHT_UID}" && test -n "${NIGHT_GID}" && test "${NIGHT_UID}" != 0 \
 && { getent group "${NIGHT_GID}" >/dev/null || groupadd -g "${NIGHT_GID}" night; } \
 && { getent passwd "${NIGHT_UID}" >/dev/null || useradd -M -d /night/home -s /bin/bash -u "${NIGHT_UID}" -g "${NIGHT_GID}" night; }
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates python3 jq \
      libx11-6 libxi6 libxxf86vm1 libxfixes3 libxrender1 libxkbcommon0 libsm6 libice6 libgl1 libegl1 libglu1-mesa \
 && rm -rf /var/lib/apt/lists/*
RUN test -n "${CLAUDE_CODE_VERSION}" \
 && npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
 && claude --version | grep -F -q -- "${CLAUDE_CODE_VERSION}"
COPY --from=blender /opt/blender /opt/blender
RUN ln -s /opt/blender/blender /usr/local/bin/blender \
 && blender -b --factory-startup --python-expr "import bpy; print('blender', bpy.app.version_string)"

RUN mkdir -p /night/home /night/claude /night/io /etc/claude-code
COPY --chmod=0444 deploy/night-shift/claude/managed-settings.json /etc/claude-code/managed-settings.json
COPY --chmod=0444 deploy/night-shift/claude/studio.settings.json /night/settings-studio.json

# The runner sets --user to the Author's uid and gid, and gives the program.
USER node
