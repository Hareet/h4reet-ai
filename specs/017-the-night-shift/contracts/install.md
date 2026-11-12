# Contract: the install-and-rehearse script

`deploy/night-shift/install.sh <sha> [--undo]`, plan §6 (steps 0 to 8).

- **Reads**: only `git show <sha>:<path>` for every file it installs or builds from; `~/.config/h4reet-ai/night-shift/facts.env` as data (never sourced); the token file only to check its mode and shape, never its value.
- **Runs**:
  - `git` with `GIT_NO_REPLACE_OBJECTS=1 GIT_CONFIG_NOSYSTEM=1 -c core.hooksPath=/dev/null`;
  - `/usr/bin/python3 -I -B` for the fill step;
  - `docker` to pull bases by digest, build, and make networks;
  - the built images, only in containers.

  Nothing runs from a working tree.
- **Writes**:
  - the images `h4-night-{worker,studio,comfyui,egress}:<sha12>`;
  - the networks `h4-night`, `h4-night-engine`, `h4-night-studio`, `h4-night-plan` (internal) and `h4-night-out`;
  - `~/.config/h4reet-ai/night-shift/{containers,claude}/` and `allowlist.json` (files 0444, folders 0555);
  - `~/.local/share/h4reet-ai/night-shift/**` and `~/.local/state/h4reet-ai/night-shift/{locks,log}`;
  - `/srv/studio/{briefs,handoff}` and `~/h4reet-ai/night/`;
  - `installed.txt` (each path, image, and network, with its SHA-256 or ID).

  It refuses on the first install while `/srv/studio/outputs` holds a file (his Q5), printing the count, never a name.
- **Stops**: on the first failure, printing `install: FAILED at <step>: <reason>`, then the summary so far.
- **The summary** (between `== night-shift summary ==` and `== end ==`):
  - `sha`, `claude`, `docker`;
  - each `image <name> <id>` and each `spec <role> <sha256>`;
  - each of R1 to R4 with `ok` or `FAILED <reason>`;
  - each R4 row's `id refused-by=<layer>`.

  Nothing secret.
- **`--undo`**: removes each path in `installed.txt` whose SHA-256 still matches, the networks, and the images it tagged, then the empty folders it made. It prints what it left: the token file and the facts file (his), and any file it didn't make.
- **Idempotent**: a second run at the same SHA prints `unchanged` for each step and the same summary.
