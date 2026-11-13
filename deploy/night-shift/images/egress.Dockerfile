# The night shift's egress proxy image (spec 017, FR-013, plan.md §1; tasks.md T033): the agents' engine's own
# egress-proxy.py, the only way out of each internal network (egress, egress-studio, egress-plan), each with its
# own allowlist (deploy/night-shift/allowlist*.json, mounted read-only and named by H4_EGRESS_SETTINGS).
#
# install.sh builds it from a repository-shaped context: this file and the managed settings from
# `git show <sha>:<path>`, and egress-proxy.py from `git show refs/heads/main:deploy/agents-engine/egress-proxy.py`
# (pins.json's context_from_main), the human-only copy. PYTHON_IMAGE is the lock's base:python, python:3.12.15-slim-trixie@digest, from pins.json.
# --chmod=0444: the container runs as the Author's uid, and COPY keeps a file's mode (the probe's first run).
ARG PYTHON_IMAGE=public.ecr.aws/docker/library/python:3.12.15-slim-trixie@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1

FROM ${PYTHON_IMAGE}
RUN mkdir -p /etc/claude-code /state
COPY --chmod=0444 deploy/night-shift/claude/managed-settings.json /etc/claude-code/managed-settings.json
COPY --chmod=0444 deploy/agents-engine/egress-proxy.py /egress-proxy.py

USER 65534:65534
CMD ["python3", "-I", "-B", "/egress-proxy.py"]
