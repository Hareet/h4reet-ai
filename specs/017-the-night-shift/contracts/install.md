# Contract: the install-and-rehearse script

`deploy/night-shift/install.sh <sha> [--undo]`, plan §6 (steps 0 to 11).

- **Reads**: only `git show <sha>:<path>` for every file it installs; `~/.config/h4reet-ai/night-shift.env` as data.
- **Runs**: `git` with `GIT_NO_REPLACE_OBJECTS=1 GIT_CONFIG_NOSYSTEM=1 -c core.hooksPath=/dev/null`; `/usr/bin/python3 -I -B` for the fill step; the installed `nono` and `claude`; nothing from a working tree.
- **Writes**:
  - `~/.local/bin/nono`;
  - `~/.config/h4reet-ai/nono/*.json`;
  - `~/.local/share/h4reet-ai/night-shift/**`;
  - `~/.local/state/h4reet-ai/night-shift/{locks,log}`;
  - `/srv/studio/{briefs,handoff,work}`, `~/h4reet-ai/night/`, and `~/h4reet-ai/gate`;
  - `installed.txt` (each path and its SHA-256), and `LAYERING` into the facts file.
- **Stops**: on the first failure, printing `install: FAILED at <step>: <reason>`, then the summary so far.
- **The summary** (between `== night-shift summary ==` and `== end ==`):
  - `sha`, `nono`, `claude`, `kernel`, `landlock`, `layering`;
  - each `profile <role> <sha256>`;
  - each `R1` to `R6` with `ok` or `FAILED <reason>`;
  - each R4 row's `id refused-by=<layer>`.

  Nothing secret.
- **`--undo`**: removes each path in `installed.txt` whose SHA-256 still matches, then the empty folders it made, then `~/.local/bin/nono` if it is the pin's. It prints what it left: the gate checkout (with the `git worktree remove` line), nono's state under `~/.local/state/nono`, and any file it didn't make.
- **Idempotent**: a second run at the same SHA prints `unchanged` for each step and the same summary.
