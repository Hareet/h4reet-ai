# fix/000-engine-gpu-user
Spec: specs/000-local-foundations/ (T065's first `make up ENV=prod`; task T179, and T174's plan line) · Intent: specs/000-local-foundations/intent.md · Written by: Claude Code (Opus 5.5); reviewed by a read-only reviewer agent, whose findings are applied (below) · Date: 2026-10-09
Session: started from `~/h4reet-ai/h4reet-ai`, the repository root · Repo hooks active: yes.
- **bash-gate refused three of my commands,** whose text named the engine script: a read-only shellcheck, an edit script, and a commit message written inline. That is T170's false positive. I didn't respell any of them: `make lint` shellchecks every tracked script, the tests ran by directory, edits went through the Edit tool, and the commit message through a file.

Authorized by: T179 in tasks.md, an open task from T065's first prod start; and the Author's "I want you to keep going as far as you can and group all the pieces you need my attention for me to check in the morning" (2026-10-09). The patch changes `deploy/agents-engine/**`, which is human-only, so it comes as a patch for the Author to apply, as the bring-up's and the seed's did.

**Merge order:** stacked on `fix/000-us1-t149-findings`, which is stacked on `fix/000-us1-first-prod-run`, on `feat/000-us1-local-stack`. Merge those two into the us1 branch first; this one then fast-forwards, and the patch applies there.

## Runs in the Author's terminal

ADR 0017 puts this section first.

| What | How it runs | Check before you run it |
|---|---|---|
| **`docs/merge-requests/2026-10-09-fix-000-engine-gpu-user.patch`** (T179) | `git apply` on the us1 branch, then the engine's `setup` once | It adds `ensure_nvidia_cli_user` to `setup-host.sh`, which runs as root. The step reads `/dev/dxg`'s group and mode and the config's `user` line. It runs `nvidia-container-cli --user=nobody:h4gpu info`, then `--user=root:h4gpu info`, both read-only, naming each user as the config would. Then it runs at most one `nvidia-ctk config --config-file … --in-place --set nvidia-container-cli.user=…`. `next_steps` gains one possible line, and `engine.sh status` gains `status_gpu`, which only reads. Read all of it: "The patch" below has every change. |

**Your steps,** after merging the two branches below this one:

```
git merge --ff-only fix/000-engine-gpu-user
git apply docs/merge-requests/2026-10-09-fix-000-engine-gpu-user.patch
git add -u deploy/agents-engine
git commit -m "Apply the GPU-user patch (T179)"
deploy/agents-engine/engine.sh setup
deploy/agents-engine/engine.sh status
```

**Expected:**
- Your `/dev/dxg` already has H6's mode, so setup tries nobody.
  - If NVML answers `nobody:h4gpu`, setup logs "the NVIDIA container CLI runs its driver step as nobody:h4gpu", and status's first lines show "/dev/dxg root:h4gpu 660; the NVIDIA container CLI runs as nobody:h4gpu".
  - If it doesn't, your hand-set `root:h4gpu` stays, with no log line.
- Either way, setup's last lines ask for no second run.
- Then quickstart §0.2's GPU check (`docker run --rm --gpus all nvidia/cuda:…@sha256:e778… nvidia-smi …`) should still list the RTX 5090.

**Optional, read-only, before or after:** `sudo nvidia-container-cli --debug=/dev/stdout --user=nobody:h4gpu info | grep -i user` names the user and group the CLI resolves, which should be `65534:` and h4gpu's ID.

**If GPU containers fail after it,** put your working value back: `sudo nvidia-ctk config --in-place --set nvidia-container-cli.user=root:h4gpu`. Then don't run setup again until I've changed the patch, and please tell me. The CLI's `info` would still answer as nobody, so a setup run would set nobody again.

## What changed and why

- **The patch (T179):**
  - **`setup-host.sh`, `ensure_nvidia_cli_user`,** right after `ensure_gpu_group`. It sets the least privileged user NVML answers: `nobody:h4gpu`, or else `root:h4gpu`. Each try names the user as the config will.
    - **Nobody only with H6's mode.** It tries nobody only while `/dev/dxg` is `h4gpu 660`. Before the first boot after setup the device is 0666, open to every user, and a try would prove nothing. So setup then sets `root:h4gpu`, and its last lines ask for one more run after the shutdown.
    - **Never raised again.** A boot without H6's mode keeps a `nobody:h4gpu` an earlier boot proved, with a warning naming `h4agents-dxg.service`, which ignores a failed chgrp or chmod. It never raises it to root (the review's S1).
    - **Left alone** on a host with no `/dev/dxg`, no config file, no CLI, or no `nvidia-ctk`.
    - **A GPU nobody reaches** gets a warning rather than a failed setup: the agents' engine runs CPU-only, and only the host's GPU stacks need the CLI. The warning says only what was tried.
    - **Idempotent:** a value already right is left alone, silently.
  - **`setup-host.sh`, `next_steps`:** the extra setup line, when the step chose root only for want of H6's mode.
  - **`engine.sh status`, `status_gpu`:** first, `/dev/dxg`'s owner and mode and the CLI's user, or "its default, unset". It prints even with the agents' engine down, since it is about the host's rootful engine.
  - **Tests (21 new):**
    - **Fakes that behave like the real tools:** `/dev/dxg` is a real file whose group and mode the real `stat` reads. `nvidia-container-cli` answers only `--user=<user:group> info`. `nvidia-ctk` takes only the flags its help lists and writes the config, so a next run reads what the last one wrote.
    - **The cases:** nobody; root; root before H6's mode with the second run asked; no second run with H6's mode; a proved nobody kept on a bad boot; root already set and silent; the wrong section; neither user; root unreachable before H6's mode; no device, config, CLI, or `nvidia-ctk`; the three runs of a fresh host (0666 sets root, then 0660 sets nobody, then nothing changes); the step's order. For status: the line's four forms, its place first, and printing with the engine down.
- **On this branch:**
  - contracts/agents-engine.md H6, §5, and §8's setup and status rows, plan §10, and quickstart §0.2 and §0.5 say what the CLI's user is and why, and that setup asks for its second run. They used to say "Rootful Docker runs as root and keeps the GPU", which T065's first prod start disproved, and "once".
  - Plan §10's seeding line describes the seed as it is. It covers the images the engine lacks, not the GPU-only ones, after a disk check, and pulls only what the host lacks. Then the T174 transfer: every platform, a load, and a tag by the pinned digest.
  - tasks.md: T179's patch is ready. Its box stays open until you apply it.

## Verification

- With the patch applied, in its own worktree (on this branch's commit; this branch doesn't change `deploy/agents-engine` itself):
  - `pytest deploy/agents-engine/test`: 412 passed.
  - `make lint`: exit 0. It shellchecks `setup-host.sh` and `engine.sh` with the rest.
- `git apply --check` of the patch on this branch: clean.
- Untested where it matters: on your host. The sandbox has no GPU, and the tools are fakes in the tests, now ones that check their arguments and change state. The first real run is yours, above.

## Review

One read-only reviewer, at f182541: no blocking finding. It judged the patch safe to apply as it stood, but asked for S1 and S2 first, to save a second apply.
- **S1 (least privilege):** a boot without H6's mode could raise a proved nobody to root, and a fresh host never lowered root to nobody, since nothing asked for the second run. Now the nobody stays, with a warning, and setup asks for the second run itself. §5, §8, and plan §10 say so.
- **S2 (the note):**
  - The recovery line now warns that a setup run would set nobody again.
  - Each try names the user as the config does (`nobody:h4gpu`, not `65534:<gid>`).
  - The reviewer's read-only check is above.
- **S3 (tests):** the fakes answered whatever they were asked. They are rewritten, the missing branches and the three-run sequence are tested, and `getent` is gone from the code.
- **Nits:**
  - `getent` under pipefail is gone.
  - The GPU line prints with the engine down.
  - The sentence that didn't parse, in H6 and plan §10, is rewritten, and §8's status row names the line.
  - Plan §10's pull description is fixed.
  - The warning no longer says nobody was tried when it wasn't.

The reviewer proposed a line for CLAUDE.md, the second reviewer to ask for one on fakes (after T178's and T181's). It's yours to add:

> - Writing a stand-in that answers whatever it's asked: a fake checks the real tool's arguments, prints its format from one real run, and changes state as it does.

## The patch

Every change, as `git apply` takes it: `docs/merge-requests/2026-10-09-fix-000-engine-gpu-user.patch` (486 lines).
