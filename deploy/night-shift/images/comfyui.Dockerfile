# The night shift's ComfyUI image (spec 017, FR-040, plan.md §7; tasks.md T034), started only by the runner, on a
# studio task's request and under its GPU lock (contracts/runner.md §5).
#
# It holds no ComfyUI and no weights: comfyui.json mounts the Author's install and his venv (~/flux-env)
# read-only at their own paths, so no node, weight, or package can arrive (FR-030). The venv's python is a link to
# /usr/bin/python3.12, which is why the base is Ubuntu 24.04, the Author's distribution: its python3.12 is the one
# the venv was made with. ComfyUI writes only its output folder (/srv/studio/outputs) and its temp, input, and user
# folders, which comfyui.json gives it.
#
# install.sh builds it from a repository-shaped context it writes with `git show <sha>:<path>` for each path that
# pins.json's images.comfyui.context lists. UBUNTU_IMAGE is ubuntu:24.04@digest from pins.json, the same image
# .devcontainer/Dockerfile pins.
ARG UBUNTU_IMAGE=public.ecr.aws/docker/library/ubuntu:24.04@sha256:534baea6a22c03a63003dbc8dbe78fe34bc0d7e595d9a9dc9834884ff530eb55

FROM ${UBUNTU_IMAGE}
ARG NIGHT_UID
ARG NIGHT_GID
# The runner mounts nothing at /etc, so the Author's uid gets its passwd entry here (home /night/home), unless the
# image has one already (ubuntu is 1000).
RUN test -n "${NIGHT_UID}" && test -n "${NIGHT_GID}" && test "${NIGHT_UID}" != 0 \
 && { getent group "${NIGHT_GID}" >/dev/null || groupadd -g "${NIGHT_GID}" night; } \
 && { getent passwd "${NIGHT_UID}" >/dev/null || useradd -M -d /night/home -s /bin/bash -u "${NIGHT_UID}" -g "${NIGHT_GID}" night; }
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ca-certificates git python3.12 python3.12-venv libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/* \
 && /usr/bin/python3.12 --version

RUN mkdir -p /night/home /comfyui/user /comfyui/temp /etc/claude-code
COPY --chmod=0444 deploy/night-shift/claude/managed-settings.json /etc/claude-code/managed-settings.json

# The runner sets --user to the Author's uid and gid, and gives the program (the venv's python, main.py, its flags).
USER ubuntu
