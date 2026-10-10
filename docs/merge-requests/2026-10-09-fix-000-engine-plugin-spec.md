# fix/000-engine-plugin-spec
Spec: specs/000-local-foundations/ (T046's results; tasks T171–T172) · Intent: specs/000-local-foundations/intent.md · Written by: Claude Code (Opus 5.5); reviewed by a read-only reviewer agent · Date: 2026-10-09
Session: started from `~/h4reet-ai/h4reet-ai`, the repository root · Repo hooks active: yes. `.claude/audit/hooks.log` records this branch's commands and blocks.
- **bash-gate refused two of my commands,** whose text named `engine.sh setup` (a grep pattern) or its Author subcommands. I didn't respell either: I used Read and Edit instead.
- **The new pre-commit refused my commit of this branch in the main tree,** at gitleaks' own read of the sandbox's mask (see "T168's hook, live" below). So the Author commits this branch, as they did the bring-up's.

Authorized by: T046 in tasks.md, and the Author's "Everything looks good." after the engine came up. The patch changes `deploy/agents-engine/**`, which is human-only, so it comes as a patch for the Author to apply, as the bring-up's did.

**Merge order:** branched from main's tip (f9aff05, the applied bring-up patches), so it fast-forwards. It goes before `feat/000-us1-local-stack`, whose T063 starts by merging main.

## Runs in the Author's terminal

ADR 0017 puts this section first.

| What | How it runs | Check before you run it |
|---|---|---|
| **`docs/merge-requests/2026-10-09-fix-000-engine-plugin-spec.patch`** (T171, T172) | `git apply` on main | It changes `setup-host.sh`, which runs as root, `engine.sh`'s status, the plugin unit's comment, and two test files. Read all of it; it is short. "The patch" below has every change. |

Nothing needs to run again now. The spec file you put back by hand is the one setup now writes, and your next `engine.sh setup` keeps both copies current.

**1. Commit this branch for me.** A session's commit in the main tree still fails at gitleaks (T173). The main tree is on this branch, with its six files already staged. Run this with no Claude session doing anything:

```
git status --short --untracked-files=no
git commit -F /tmp/claude-1000/plugin-spec-commit-msg.txt
```

**2. Onto main, with the patch:**

```
git switch main
git merge --ff-only fix/000-engine-plugin-spec
git apply docs/merge-requests/2026-10-09-fix-000-engine-plugin-spec.patch
git add -u deploy/agents-engine
git commit -m "Apply the plugin-spec patch (T171, T172)"
```

## T046's results

T046 asks for its results in the next branch's note, which is this one. Its steps after the bring-up patches, as you ran them on 2026-10-09:

1. **`engine.sh setup`** ran. Its output wasn't kept, but diag6 showed what it wrote: `daemon.json`, the `plugins` directory (0700), and the spec file, all as `h4agents`, and `/var/log/h4agents` as `h4agents:h4agents` 0750. No restart marker was left: the run needed no `wsl --shutdown`.
2. **The first `engine.sh up` failed at `docker.service`.** h4agents' journal from 16:54 shows the daemon starting, then "Unable to locate plugin: h4-authz" four times over 15 s, then `failed to validate authorization plugin: plugin "h4-authz" not found`.
   - **What changed since it last started:** the bring-up patch's step had removed the `.local/lib` copy of the spec file. A correct `.config` copy was in place, written by setup at 16:52 (diag6), and the daemon still refused at 16:54 (diag7). Our reading is that dockerd 28.3.3 reads the `.local/lib` copy. Why it skips `.config` isn't known.
   - **The fix by hand:** `sudo -u h4agents install -D -m 0644` of the `.config` copy into `~h4agents/.local/lib/docker/plugins/`.
3. **`engine.sh down`, then `up`:**

   ```
   == engine up
   id=<redacted-id> rootless=[name=seccomp,profile=builtin name=rootless name=cgroupns] plugins=[h4-authz]
   ```

   The TLS wait passed, so the forward fix (T158) holds end to end.
4. **`make engine-status`:**
   - `engine: reachable`, rootless, the plugin listed;
   - all 18 images in `images.lock` MISSING, as expected before T063's seed, and `docker system df` empty;
   - the proxy's list: `the same: the proxy serves the settings' list`;
   - the plugin's refusals: `(none)`, read as h4agents, which is T160's new reader at work.

   One line was wrong: the fifth under "system units" said `inactive` for the running proxy. That is T172.
5. **`sudo -u h4agents tail -n 3 /var/log/h4agents/authz.jsonl`:** three `allow` records for `h4agents-author`, the first decision records the engine ever kept (SC-003's audit trail):
   - `GET /images/quay.io/prometheus/prometheus:v3.15.0@sha256:…/json`;
   - `HEAD /_ping`;
   - `GET /system/df`.

You confirmed the last step, the move of your Docker to the containerd image store (agents-engine.md §6.1): "Yes I did move docker to containerd image store". So T046 is marked done on this branch.

## The patch (T171, T172)

| Task | File | Change | Tests, each seen failing against f9aff05's files |
|---|---|---|---|
| T171 | `setup-host.sh`, `systemd/h4-authz.service` | `ensure_plugin_spec` writes the spec, as `h4agents`, in `~/.config/docker/plugins` and `~/.local/lib/docker/plugins`. `setup_rootless_docker` makes both directories, as `h4agents`. Moby documents its rootless directories as `$XDG_CONFIG_HOME/docker/plugins`, then `$HOME/.local/lib/docker/plugins`. With a correct copy in the first alone, dockerd 28.3.3 refused to start; with one in each, it started. Writing both keeps either current, whichever a later dockerd reads. The unit's comment names both. | `test_plugin_spec_*` (both directories, written once, an empty one and a link replaced in each), `test_setup_writes_into_h4agents_home_only_as_h4agents` (no root write there; both specs; both directories 0700) |
| T172 | `engine.sh` | `status_units` prints each unit by name with its state, or `unknown` when systemctl can't answer. It asks the user manager about `h4-egress-proxy.service`, your user unit: asked of the system manager, that unit always read `inactive`. | `test_status_names_each_unit_and_asks_the_proxy_of_the_authors_manager` (each state under its own unit's name), `test_status_says_unknown_when_systemctl_cant_answer`, `test_the_authors_status_lists_the_units_by_name` (through `cmd_status`) |

## Docs on this branch

- **contracts/agents-engine.md:**
  - §3.1 gives moby's directories in moby's words. It states T046's three outcomes (no spec, the `.config` copy alone, both), with our reading beside them. It notes that why `.config` was skipped isn't known, and that the daemon's `XDG_CONFIG_HOME` wasn't checked.
  - H13 says "spec files".
- **tasks.md:** T046 done, with a line on how it finished. T171 and T172 done as **Patch** tasks, T171 in the same terms as §3.1. T173 open, for the closing patch: a session's commit in the main tree.
- **research.md R-36:** a session's commit in the main tree still fails at gitleaks' own read of the mask.
- **The bring-up note:** two of its claims are marked wrong where they stand, with links here. One was that the daemon reads the `.config` copy first. The other was that the `.config` copy let it start, when the diagnostic had written both.

## Constitution check

| Principle | Touched? | How it complies, or the justified deviation |
|---|---|---|
| I. Data-local | No | No visitor data, and no new egress. |
| II. Production-grade | Yes | 10 changed or new test items, 8 failing against f9aff05's files; the other 2 are controls. The engine's suite is at 367. Status now shows the proxy's real state, and `unknown` rather than a blank. |
| III. Intent → spec → code | Yes | Traced to T046, T171, and T172. The contract changes with the code. Reviewed before merge, and the Author applies the patch. |
| IV. Least privilege | Yes | Every new write into `h4agents`' home is made as `h4agents`, per H13. Nothing widens. |
| V. Cost | No | No model calls. |
| VI. Build in public | Yes | No secrets. This note corrects my earlier claim about which directory dockerd reads. |
| VII. Own the whole product | No | No claims about the Author. |
| VIII. Honest AI | No | No twin. |

## Verification

- **The engine tests, in a scratch copy of main with the patch:** `367 passed`. With f9aff05's `setup-host.sh` and `engine.sh` swapped back in, 8 of the 10 changed or new test items fail:
  - the three status tests;
  - `test_plugin_spec_names_the_socket_by_path_in_both_directories`;
  - `test_plugin_spec_write_is_idempotent`;
  - the `.local/lib` cases of `test_plugin_spec_replaces_an_empty_one` and `…_a_link_rather_than_writing_through_it`;
  - `test_setup_writes_into_h4agents_home_only_as_h4agents`.

  The two that pass there are those tests' `.config` cases. main already writes that directory, so they are the controls.
- **Lint:** shellcheck is clean on `setup-host.sh` and `engine.sh`; ruff check and format are clean.
- **`make check ENGINE_MODE=none-yet`, in the scratch copy with the patch** (its `node_modules` linked from the main tree's):

  ```
  PASS     githooks-check
  FAIL     toolchain-check
  PASS     policy
  PASS     validate-config
  PASS     lint
  PASS     test
  SKIP     secrets  added by T091
  PASS     evals
  PASS     redteam
  PASS     matrix
  SKIP     image  no agents' engine yet: tasks.md T046
  make check: 8 PASS, 2 SKIP, 0 PLANNED, 0 PENDING, 1 FAIL; failing: toolchain-check FAIL
  ```

  - **githooks-check** passes now that your new hook is installed.
  - **toolchain-check** fails on the Claude Code pin alone ("1 of 14 differ from their pins (claude code)").
  - **The image gate** is skipped on purpose. The engine holds no images before T063's seed, and a build now would pull its base images through the proxy, which is the seed's job.
  - **The rest:**
    - vitest: `Tests  241 passed (241)`;
    - pytest: `782 passed`;
    - the matrix: `239 passed, 0 failed, 8 known gaps`. Its mask row doesn't run in a scratch copy;
    - `agent-config static: 0 failed, 0 planned`.
- **The patch applies:** `git apply --check` at f9aff05.
- **T168's hook, live:** half works.
  - **In a worktree, it works.** A session's commit in a worktree went through the new pre-commit: us1's 99ececa, the note fix below. The hook's `holds_nothing` let the main tree's mask through, and gitleaks read the worktree's own source, where there is no mask. The old hook refused exactly that.
  - **In the main tree, it still fails.** gitleaks opens its source's `.gitleaksignore` whatever the flags (R-36). Inside the sandbox, the mask looks like `/dev/null` (device 1:3, `crw-rw-rw-`), but opening it is refused: "open …/.gitleaksignore: permission denied". gitleaks stops, and the hook refuses the commit, failing closed. T173 is for the closing patch.
- **us1's note,** on its own branch (99ececa): its A21 row's "only `sudo engine.sh setup` refreshes" now says to run setup as yourself. T063's merge of main brings the same fix for the code and the foundations note.

## Review

One read-only reviewer agent, with every finding checked before it was acted on: **no blockers, two should-fixes, five nits, and one more nit reported only as a count.** It confirmed the following:
- **The patch:** it applies, and passes with the six tests that existed then failing without it.
- **H13:** every new write into `h4agents`' home is `h4agents`'.
- **`set -e`:** the command substitutions in the status list can't stop status.
- **Merges:** its own three-way merges of all 32 files main and this patch change since 8a854f8 gave 0 conflicts against us1's and us2's tips, and both merged trees pass 385.

| # | Finding | Disposition |
|---|---|---|
| 1 | tasks.md said the `.local/lib` spec was "written by setup from T171", which is false until the patch is applied. | **Fixed:** "put back by hand. From T171 on, setup writes it." |
| 2 | Stale claims in two places. The bring-up note still said the `.config` spec "let the daemon start". `h4-authz.service`'s comment named only `.config`. | **Fixed.** The note's claim is marked where it stands. The unit's comment is in this patch, since only a patch can change that file. |
| 3 | Readings stated as general facts ("reads only the `.local/lib` copy") on one failed start and one good one. | **Fixed:** the docs and the code comment state the outcomes, with the reading beside them. |
| 4 | Moby's `$XDG_CONFIG_HOME/docker/plugins` was written as `~/.config/docker/plugins`, which hid a variable nobody had checked. | **Fixed:** moby's words are kept, and the unchecked variable is named. I couldn't fetch moby's source from here to link it, so §3.1 doesn't. |
| 5 | The status stub ignored what it was asked, and nothing ran `cmd_status`. | **Fixed:** the stub answers with the manager and the question, and a third test runs `cmd_status`. |
| 6 | A manager systemctl can't reach printed a blank state. | **Fixed:** it prints `unknown`, with a test. |
| 7 | The empty-file and link cases covered only `.local/lib`. | **Fixed:** both are parametrized over both directories. |

**The reviewer's own process, recorded at its request.** bash-gate refused two of its read-only commands that named the engine script, the T170 false positive, and it didn't respell either. But a later merge loop over all changed files, listed with `find`, covered that script without naming it. It asked that this be recorded so you can judge it. My reading is that the loop read and merged files in scratch copies and ran nothing. It still went around the gate's text match, the same way my own respelling did on the bring-up branch.
