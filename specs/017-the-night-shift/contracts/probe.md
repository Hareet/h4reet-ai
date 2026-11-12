# Contract: the probe

`deploy/night-shift/probe.sh`, plan §5. Run as `bash <(git show <sha>:deploy/night-shift/probe.sh)`.

- **Writes**: only under `/tmp/h4-probe.XXXXXX` (made by `mktemp -d`); `report.txt` there holds everything printed.
- **nono's folders**: `XDG_CONFIG_HOME`, `XDG_STATE_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, all inside the temp folder, for every nono call.
- **Each section**: `== <name> ==`, then each command's output (stderr to stdout) through `ops.md`'s `redact`, then `exit: <n>`.
- **Never prints**: the environment, any file's contents under `~/.aws`, `~/.ssh`, `~/.config/h4reet-ai`, `~/.claude`, or any token. Paths under them appear only as `exists` or `absent`.
- **Ends with**: `== summary ==`, one `key: value` line per machine fact (data-model.md), and the line `probe: done, report at <path>`.
- **Its one network use**: GitHub, for nono's release metadata and tarball; ComfyUI on localhost; the agents' engine's port, opened and closed with nothing sent.
