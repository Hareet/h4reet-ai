#!/usr/bin/env bash
# The log filter from .claude/agents/ops.md, verbatim (spec 000, plan §4: make logs and status.py pipe through it).
# It masks the usual shapes of URL credentials, Telegram bot tokens, and Authorization headers (in JSON too), and
# everything after a token, password, secret, or api_key key to the end of the line, so values with spaces don't
# leak. It is a second layer, not a guarantee: read the output before pasting it anywhere.
#
#   docker compose ... logs 2>&1 | deploy/scripts/redact.sh
#
# deploy/scripts/test_redact.py keeps the function below equal to ops.md's, character for character.
set -euo pipefail

redact() { sed -E 's#(://[^/@[:space:]]*:)[^@[:space:]]+@#\1<redacted>@#g; s#bot[0-9]+:[A-Za-z0-9_-]+#bot<redacted>#g; s#((token|password|passwd|secret|api_?key)[^:=[:space:]]*[[:space:]]*[:=][[:space:]]*).*#\1<redacted>#I; s#(authorization[^:=[:space:]]{0,2}[[:space:]]*[:=][[:space:]]*).*#\1<redacted>#I'; }

redact
