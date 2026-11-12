# Contract: the probes

## 1. The nono probe (done)

`deploy/night-shift/probe.sh`, kept as the record. It ran three times on 2026-11-12, and research R-14 holds what it found. The night shift no longer uses nono.

## 2. The container probe

`deploy/night-shift/container-probe.sh`, plan §5. Run as `bash <(git show <sha>:deploy/night-shift/container-probe.sh)` after the runbook's guard. It needs the night-shift token in `~/.config/h4reet-ai/night-shift/claude.env` (0600, one line).

- **Writes**: one folder, `~/h4-cprobe.XXXXXX`, with its build contexts, a scratch repository, and `report.txt`; two images, `h4-night-probe-worker` and `h4-night-probe-egress`; one internal network and one outer network for the egress container. At its end, on success or failure, it removes its containers and networks, and names the images it leaves.
- **Never prints**: the token, any environment, or any file's contents under `~/.aws`, `~/.ssh`, `~/.config/h4reet-ai`, or `~/.claude`. The token reaches containers only through `--env-file`.
- **Each step**: `== <name> ==`, then its output (stderr to stdout) through `ops.md`'s `redact` (`sed -u`), then `exit: <n>`.
- **Its rows**, each recorded `ok`, `FAILED`, or `info`:
  - `signin`: `claude -p` answers in the worker container with only the token;
  - `failclosed`: with `forceLoginMethod: "claudeai"` and `ANTHROPIC_API_KEY=probe-not-a-key`, Claude Code refuses to start;
  - `egress-allowed`: `api.anthropic.com:443` through the proxy;
  - `egress-refused`: `example.com:443` through the proxy;
  - `no-route`: a direct `1.1.1.1:443`;
  - `no-socket`, `no-aws`, `no-ssh`, and `no-h4config`, inside the container;
  - `worktree-write` and `commit`, in the scratch repository;
  - `hooks-ro`, `config-ro`, `settings-ro`, and `hookspath`: writes to masked paths, and `git config core.hooksPath`, refused;
  - `engine-fwd`: a TCP connect to `198.18.0.1:2376` through the forwarder (`info` if the engine is down);
  - `claude-sandbox-in-container`: `printenv SANDBOX_RUNTIME` under `failIfUnavailable` (`info`);
  - `gpu`: `nvidia-smi`'s name and memory in a `--gpus all` container (`info`).
- **Ends with** `== summary ==`, whose first line is `BOUNDARY: holds`, `BOUNDARY: FAILED <rows>` (stop, his Q8), or `BOUNDARY: UNTESTED <why>`. Its second line is `PLAN-ONLY: yes` or `PLAN-ONLY: FAILED <row>`. Then each row, and `probe: done, report at <path>`.
