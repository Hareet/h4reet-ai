# Contract: the probes

## 1. The nono probe (done)

`deploy/night-shift/probe.sh`, kept as the record. It ran three times on 2026-11-12, and research R-14 holds what it found. The night shift no longer uses nono.

## 2. The container probe

`deploy/night-shift/container-probe.sh`, plan §5. Run as `bash <(git show <sha>:deploy/night-shift/container-probe.sh)` after the runbook's guard. It needs the night-shift token in `~/.config/h4reet-ai/night-shift/claude.env` (0600, one line).

- **Writes**:
  - one folder, `~/h4-cprobe.XXXXXX`;
  - two images, `h4-night-probe-worker` and `h4-night-probe-egress`;
  - two networks named for the run, one internal and one ordinary, for the egress proxy and the engine forwarder;
  - containers labelled for the run.

  At its end, on success, failure, or Ctrl-C, it removes only the containers and networks it made. It deletes everything in the folder but `report.txt` (redacted), the build logs, and the egress log (host names only); the container's Claude folder goes too. It names the images it leaves.
- **Never prints**: the token, any environment, or any file's contents under `~/.aws`, `~/.ssh`, `~/.config/h4reet-ai`, or `~/.claude`. The token reaches containers only through `--env-file`.
- **Each step**: `== <name> ==`, then its output (stderr to stdout) through `ops.md`'s `redact` (`sed -u`), then `exit: <n>`.
- **Its rows**, each recorded `ok`, `FAILED`, or `info`:
  - `signin`: `claude -p` answers in the worker container with only the token;
  - `failclosed-api-key` and `failclosed-auth-token`: with `forceLoginMethod: "claudeai"` and a stand-in `ANTHROPIC_API_KEY` (then `ANTHROPIC_AUTH_TOKEN`), Claude Code exits non-zero within its timeout **and the egress proxy's log gains no `api.anthropic.com` line during that turn**. The proxy is the only way out, so the second condition proves the stand-in never reached the API (the review's B1);
  - `egress-allowed`: `api.anthropic.com:443` through the proxy;
  - `egress-refused`: `example.com:443` through the proxy;
  - `no-route`: a direct `1.1.1.1:443` fails with `ENETUNREACH` or `EHOSTUNREACH`;
  - `no-default-route`: `/proc/net/route` has no default route;
  - `dns` (`info`): whether an outside name resolves, since a resolved name still has no route;
  - `no-socket`, `no-socket-run`, `no-aws`, `no-ssh`, `no-h4config`, `no-author-claude`, `no-photos`, and `no-key`, inside the container;
  - `worktree-write` and `commit`, in the scratch repository;
  - `hooks-ro`, `config-ro`, `settings-ro`, `main-ro`, `tags-ro` (a tag named main), `alternates-ro`, `commondir-ro`, and `hookspath`: writes to masked paths, and setting git's hooks path, refused, each with the first line of its error;
  - `engine-fwd`: a TCP connect to `198.18.0.1:2376` through the forwarder (`info` if the engine is down);
  - `claude-sandbox-in-container`: `printenv SANDBOX_RUNTIME` under `failIfUnavailable` (`info`). The probe's container doesn't set `SANDBOX_RUNTIME`, so a `1` can only come from Claude Code's own sandbox;
  - `gpu`: `nvidia-smi`'s name and memory in a `--gpus all` container (`info`).
- **Ends with** `== summary ==`, whose first line is `BOUNDARY: holds`, `BOUNDARY: FAILED <rows>` (stop, his Q8), or `BOUNDARY: UNTESTED <why>`. Its second line is `PLAN-ONLY: yes` or `PLAN-ONLY: FAILED <row>`. Then each row, and `probe: done, report at <path>`.
