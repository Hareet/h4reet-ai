# Contract: the probe

`deploy/night-shift/probe.sh`, plan §5. Run as `bash <(git show <sha>:deploy/night-shift/probe.sh)`.

- **Writes**: only under `/tmp/h4-probe.XXXXXX` (made by `mktemp -d`); `report.txt` there holds everything printed.
- **nono's folders**: `XDG_CONFIG_HOME`, `XDG_STATE_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, all inside the temp folder, for every nono call.
- **Each section**: `== <name> ==`, then each command's output (stderr to stdout) through `ops.md`'s `redact`, then `exit: <n>`.
- **Never prints**: the environment, any file's contents under `~/.aws`, `~/.ssh`, `~/.config/h4reet-ai`, `~/.claude`, or any token. Paths under them appear only as `exists` or `absent`.
- **Works from**: inside the temp folder (`cd` first), so no project config in the Author's checkout is read.
- **Fingerprints**: `~/.claude/settings.json`, `~/.claude.json`, `~/.claude/hooks`, and nono's default folders (`~/.nono`, `~/.config/nono`, `~/.local/state/nono`, `~/.local/share/nono`, `~/.cache/nono`), before and after.
- **Never prints a process's command line**: process IDs and names only.
- **Section 15** (inside nono) is skipped with `H4_PROBE_NEST=0`, never by editing the file; it runs with explicit read-only grants, never the Claude Code pack, and has controls outside nono (sections 3 and 8) and inside (`/bin/true`).
- **Section 16** (the same switch) runs three one-turn `claude -p` sessions on the Author's own login: outside nono (the control), inside nono under the Claude Code pack, and inside nono with the pack's network profile off. Each asks for one sandboxed command, `printenv SANDBOX_RUNTIME`, under `--settings` with `failIfUnavailable`. Claude Code writes its usual session files in `~/.claude`, which the fingerprint shows. This is the probe's one exception to "writes only in the temp folder".
- **Ends with**: `== summary ==`, whose first line is `NESTING: works`, `NESTING: FAILED … Stop here`, or `NESTING: UNCLEAR …` (the Author's Q8), then these keys, and the line `probe: done, report at <path>`: `kernel`, `landlock_abi`, `dxg`, `wsl_lib`, `blender`, `blender_dir`, `blender_version`, `comfyui_port`, `comfyui_status`, `claude`, `claude_version`, `engine_answers`, `docker_socket`, `repo`, `netns_loopback`, `bwrap_outside_nono`, `socket_outside_nono`, `nono_version`, `nono_sha256`, `nono_digest`, `nono_match`, `nono_control`, `bwrap_inside_nono`, `socket_inside_nono`, `socket_with_outer_mask`, `aws_inside_nono`, `claude_sandbox_outside_nono`, `claude_sandbox_inside_nono_pack`, `claude_sandbox_inside_nono_no_proxy`.
- **Its network use**: GitHub, for nono's release metadata and tarball; the hosts `nono pull` uses for the Claude Code pack (nono's registry); ComfyUI on localhost; the agents' engine's port, opened and closed with nothing sent. Terraform's update check is off.
