# The night shift's worker image (spec 017, plan.md §1; tasks.md T033): the container of every repository role,
# the supervisor, spec-writer, implementer, reviewer, red-teamer, ops, and gate runner, and of the plan request.
#
# install.sh builds it from a repository-shaped context it writes with `git show <sha>:<path>` for each path that
# pins.json's images.worker.context lists. Its bases come only through these arguments, each image@digest:
#   TOOLCHAIN_IMAGE   the devcontainer, which the install builds first from .devcontainer/Dockerfile with
#                     WITH_CLAUDE=1 and CLAUDE_CODE_VERSION at the pin (pins.json's toolchain). Its own bases are
#                     pinned by digest there, so this image has the repository's whole toolchain at its versions.
#   DOCKER_CLI_IMAGE  the Docker CLI, with its compose and buildx plugins, for docker-relay's nesting path to the
#                     agents' engine: entrypoint.sh forwards 127.0.0.1:2376 to engine-fwd (plan.md §1).
# The install refuses to build while a digest in pins.json is null.
#
# Every image carries the managed settings (FR-041's second layer, proven by the container probe's third run,
# research R-18) and each role's settings layer, read-only. No token or key is ever baked in: the runner passes
# the night-shift token at run time with --env-file.
ARG TOOLCHAIN_IMAGE
ARG DOCKER_CLI_IMAGE

FROM ${DOCKER_CLI_IMAGE} AS dockercli

FROM ${TOOLCHAIN_IMAGE}
ARG CLAUDE_CODE_VERSION
ARG NIGHT_UID
ARG NIGHT_GID
USER root
# The runner mounts nothing at /etc, so the Author's uid gets its passwd entry here (home /night/home), unless the
# image has one already (the devcontainer's dev is 1000). The container probe mounted its own passwd instead.
RUN test -n "${NIGHT_UID}" && test -n "${NIGHT_GID}" && test "${NIGHT_UID}" != 0 \
 && { getent group "${NIGHT_GID}" >/dev/null || groupadd -g "${NIGHT_GID}" night; } \
 && { getent passwd "${NIGHT_UID}" >/dev/null || useradd -M -d /night/home -s /bin/bash -u "${NIGHT_UID}" -g "${NIGHT_GID}" night; }
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/ /usr/local/libexec/docker/cli-plugins/

# The toolchain installed Claude Code at the pin: refuse an image whose version differs (P-8 checks the pin).
RUN test -n "${CLAUDE_CODE_VERSION}" \
 && claude --version | grep -F -q -- "${CLAUDE_CODE_VERSION}" \
 && docker --version \
 && socat -V >/dev/null \
 && jq --version

RUN mkdir -p /night/home /night/claude /night/io /night/engine /etc/claude-code
COPY --chmod=0444 deploy/night-shift/claude/managed-settings.json /etc/claude-code/managed-settings.json
COPY --chmod=0444 deploy/night-shift/claude/supervisor.settings.json /night/settings-supervisor.json
COPY --chmod=0444 deploy/night-shift/claude/spec-writer.settings.json /night/settings-spec-writer.json
COPY --chmod=0444 deploy/night-shift/claude/implementer.settings.json /night/settings-implementer.json
COPY --chmod=0444 deploy/night-shift/claude/reviewer.settings.json /night/settings-reviewer.json
COPY --chmod=0444 deploy/night-shift/claude/red-teamer.settings.json /night/settings-red-teamer.json
COPY --chmod=0444 deploy/night-shift/claude/ops.settings.json /night/settings-ops.json
COPY --chmod=0444 deploy/night-shift/claude/gate-runner.settings.json /night/settings-gate-runner.json
COPY --chmod=0555 deploy/night-shift/images/entrypoint.sh /night/entrypoint.sh

# The runner sets --user to the Author's uid and gid, and gives the program: `claude …` for a session, `socat …` for
# engine-fwd. The entrypoint runs it unchanged (`exec "$@"`), after starting the engine roles' in-container forward.
USER dev
ENTRYPOINT ["/night/entrypoint.sh"]
