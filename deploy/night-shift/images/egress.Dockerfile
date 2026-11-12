# The night shift's egress proxy image (spec 017, FR-013, plan.md §1; tasks.md T033): the agents' engine's own
# egress-proxy.py, the only way out of each internal network (egress, egress-studio, egress-plan), each with its
# own allowlist (deploy/night-shift/allowlist*.json, mounted read-only and named by H4_EGRESS_SETTINGS).
#
# install.sh builds it from a repository-shaped context: this file and the managed settings from
# `git show <sha>:<path>`, and egress-proxy.py from `git show refs/heads/main:deploy/agents-engine/egress-proxy.py`
# (pins.json's context_from_main), the human-only copy. PYTHON_IMAGE is python:3.12-slim@digest from pins.json.
# --chmod=0444: the container runs as the Author's uid, and COPY keeps a file's mode (the probe's first run).
ARG PYTHON_IMAGE

FROM ${PYTHON_IMAGE}
RUN mkdir -p /etc/claude-code /state
COPY --chmod=0444 deploy/night-shift/claude/managed-settings.json /etc/claude-code/managed-settings.json
COPY --chmod=0444 deploy/agents-engine/egress-proxy.py /egress-proxy.py

USER 65534:65534
CMD ["python3", "-I", "-B", "/egress-proxy.py"]
