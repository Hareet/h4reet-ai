# Contract: the install-and-rehearse script

`deploy/night-shift/install.sh <sha> [--undo]`, plan §6 (steps 0 to 8). Its Python half is `deploy/night-shift/rehearse.py` (G4's addition: the facts check, the pins, and the rehearsal), and its fill step is `build.py --fill`.

- **Reads**: only `git show <sha>:<path>` for every file it installs or builds from, and `git show refs/heads/main:deploy/agents-engine/egress-proxy.py` for the egress image (pins.json's `context_from_main`); `~/.config/h4reet-ai/night-shift/facts.env` as data (never sourced); the token file only to check its mode, owner, and shape, never its value. It never reads a working tree.
- **Runs**:
  - `git` with `GIT_NO_REPLACE_OBJECTS=1 GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null`, `-c core.hooksPath=/dev/null -c core.fsmonitor=false`, `--git-dir=<REPO>/.git` and `GIT_COMMON_DIR` set, every caller's `GIT_*` variable dropped;
  - `/usr/bin/python3 -I -B`, on files it wrote from the commit into a fresh temp folder: `rehearse.py facts` (the runner's own `read_facts`, plus the uid, gid, `NIGHT_ROOT` under the home, and `CLAUDE_VERSION` equal to pins.json's), `rehearse.py pins`, and `build.py --check` then `build.py --fill`;
  - `docker` to pull bases by digest, build, and make networks;
  - the built images, only in containers, by the image IDs `installed.txt` records;
  - the rehearsal from the installed copy (`~/.local/share/h4reet-ai/night-shift/rehearse.py`, after its SHA-256 matches), which loads the installed runner (`night.py`, after its SHA-256 matches `installed.txt`) and builds every session line with the runner's own code.

  Nothing runs from a working tree.
- **Writes**:
  - the images `h4-night-{toolchain,worker,studio,comfyui,egress}:<sha12>` (the toolchain is the devcontainer, built first, `FROM` the worker);
  - the networks `h4-night`, `h4-night-engine`, `h4-night-studio`, `h4-night-plan` (internal) and `h4-night-out`, labelled `h4-night=install`;
  - `~/.config/h4reet-ai/night-shift/{containers,claude}/` (folders 0555), `allowlist.json`, `allowlist-studio.json`, `allowlist-plan.json`, `comfyui-params.json` (files 0444). The token file and the facts file in that folder are his, and the install never writes them;
  - `~/.local/share/h4reet-ai/night-shift/` (0555): `night.py`, `rehearse.py`, `rows.json`, `prompts/` (0555), `installed.txt` (files 0444), and `claude/<role>/` for each session role (0700: each role's Claude folder, the sessions' own, never recorded as files);
  - `~/.local/state/h4reet-ai/night-shift/` (0700) with `locks/` (0700); the runner makes its own `log`. The install's own scratch is there too: `install/` (the build logs), `rehearsal/` (the rehearsal's runner log, egress logs, and R3's make check log), and `rehearsal.txt` (the last rehearsal's result lines, for an unchanged second run);
  - `/srv/studio/{briefs,handoff}` (0755), `/srv/studio/outputs` only if it's absent, `~/h4reet-ai/night/` (`NIGHT_ROOT`, 0755), and `NIGHT_ROOT/.comfyui/user` (0700);
  - `installed.txt`: `sha <sha>`, then `file <path> <sha256>`, `image <ref> <id>`, `network <name> <id>`, `dir <path>` (each folder the install made, ancestors included), and `scratch <path>` lines. The runner reads the first three kinds and ignores the rest.

  A file at an install path that the install didn't make (no `file` line from the last install) stops it: it never overwrites one of his. A file the last install made that this commit doesn't have is removed while its SHA-256 still matches.
- **Refuses before writing anything** (step 0): a SHA that isn't 40 hex or doesn't resolve; an API-billing variable in its shell; a missing facts or token file; a token file not 0600, not his, or not exactly one `CLAUDE_CODE_OAUTH_TOKEN=` line; a facts file `read_facts` refuses; running night containers; and, on the first install (no `installed.txt`), a `/srv/studio/outputs` that holds any file, printing the count, never a name (his Q5). Step 1 then refuses a null digest in pins.json, printing for each such base the `docker pull <image>:<tag> && docker image inspect --format '{{index .RepoDigests 0}}' <image>:<tag>` line that reads it, and a base whose `RepoDigests` don't hold its pin, before any build.
- **Stops**: on the first failure, printing `install: FAILED at <step>: <reason>`, then the summary so far. The steps are `0 preflight`, `1 images`, `2 files`, `3 networks`, `4 R1`, `5 R2`, `6 R3`, `7 R4`, and `undo`.
- **The rehearsal** (rehearse.py's `step R1|R2|R3|R4`). Each step starts the runner's egress helpers and engine-fwd (`start_network_helpers`), with their logs in `rehearsal/`, and stops them at its end. Its sessions run on scratch worktrees `NIGHT_ROOT/rehearsal/rehearse-<role>` on `night/rehearse-<role>/<sha12>`, made by the runner's `ensure_worktree` and removed, with their branches, io folders, and empty ref folders, at the step's end.
  - **R1**: an implementer session (`claude -p`, `--max-turns 2`) answers `ok` on the night-shift token.
  - **R2**: the same line with `ANTHROPIC_API_KEY=probe-not-a-credential`, then `ANTHROPIC_AUTH_TOKEN=…`: the runner's last look (`final_line_refusal`) must refuse it, and the container, run anyway, must either answer `ok` on the token (the managed settings blanked the stand-in) or exit non-zero within its timeout with no new `api.anthropic.com` line in the egress log during that turn (research R-18).
  - **R3**: `make setup && make check` in the implementer's container (make check holds the red-team suite and the matrix). It passes when every gate is PASS, SKIP, WARN, or PLANNED, or is one of the known items, each named on the R3 line: `toolchain-check` (the images' Claude Code pin, until P-8), `image` (it builds the compose images on the agents' engine through engine-fwd, so it needs the engine up: the one gate that does), the matrix when its only FAIL rows are stage S's (Claude Code's sandbox masks, absent in a container: P-5), and any PENDING gate (the Author's run). The full log is `rehearsal/r3-make-check.log`.
  - **R4**: the rows of `rows.json` marked `rehearsal` (contracts below, plan §9), plus one row for each read-only mask the runner computed for the ops task. A container row runs as `bash -c <command>` in its role's container and must exit non-zero with stderr matching its `expect`; a row whose host path is absent is skipped (it would prove nothing). A row that got through is FAILED with the size of its output, never the output; a file it created is removed. The gap row records the token in a session's environment as open (bounded) or closed. Every row is run before R4 fails, naming them.
- **The summary** (between `== night-shift summary ==` and `== end ==`):
  - `sha`, `night_plan`, `night_gate`, `claude`, `docker`;
  - each `image <name> <id>`, each `spec <role> <sha256>`, each `network <name> <id>`;
  - each of R1 to R4 with `ok <detail>` or `FAILED <reason>`;
  - each R4 row's `row <id> refused-by=<layer>` (or `skipped`, `gap`, `FAILED`).

  Nothing secret: the whole output passes through ops.md's redaction filter, and no line holds the token, an environment, or a row's output.
- **Idempotent**: each step compares before writing. A second run at the same SHA prints `unchanged` for steps 1 to 7 and the same summary, and builds, pulls, and runs nothing: the rehearsal's lines come from `rehearsal.txt` while nothing changed and the last rehearsal at that SHA passed. A failed rehearsal runs again.
- **`--undo`** needs only `installed.txt` and the same SHA. It removes each `file` whose SHA-256 still matches, each `image` whose ID still matches, each `network`, each `scratch` path under the state folder, `installed.txt`, then each `dir` that's empty, deepest first. It prints what it left: the token file and the facts file (his), and any file that changed, image retagged or in use, network in use, or folder not empty.
- **For the tests only**: `H4_NIGHT_STUDIO` moves `/srv/studio`.
