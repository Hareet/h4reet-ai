# fix/000-engine-gpu-user
Spec: specs/000-local-foundations/ (T065's first `make up ENV=prod`; task T179, and T174's plan line) · Intent: specs/000-local-foundations/intent.md · Written by: Claude Code (Opus 5.5); reviewed by a read-only reviewer agent (below) · Date: 2026-10-09
Session: started from `~/h4reet-ai/h4reet-ai`, the repository root · Repo hooks active: yes.
- **bash-gate refused one command of mine:** a shellcheck whose text named the engine script, read-only, T170's false positive. I didn't respell it. `make lint` shellchecks every tracked script, and the tests ran by directory.

Authorized by: T179 in tasks.md, an open task from T065's first prod start; and the Author's "I want you to keep going as far as you can and group all the pieces you need my attention for me to check in the morning" (2026-10-09). The patch changes `deploy/agents-engine/**`, which is human-only, so it comes as a patch for the Author to apply, as the bring-up's and the seed's did.

**Status: DRAFT until its review is recorded below.**

**Merge order:** stacked on `fix/000-us1-t149-findings`, which is stacked on `fix/000-us1-first-prod-run`, on `feat/000-us1-local-stack`. Merge those two into the us1 branch first; this one then fast-forwards, and the patch applies there.

## Runs in the Author's terminal

ADR 0017 puts this section first.

| What | How it runs | Check before you run it |
|---|---|---|
| **`docs/merge-requests/2026-10-09-fix-000-engine-gpu-user.patch`** (T179) | `git apply` on the us1 branch, then the engine's `setup` once | It adds `ensure_nvidia_cli_user` to `setup-host.sh`, which runs as root. The step reads `/dev/dxg`'s group and mode and runs `nvidia-container-cli --user=65534:<h4gpu's gid> info`, then `--user=0:<gid> info`, both read-only. Then it runs at most one `nvidia-ctk config --in-place --set nvidia-container-cli.user=…`. It also adds `status_gpu` to `engine.sh status`, which only reads. Read all of it: "The patch" below has every change. |

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
  - If NVML works as `nobody:h4gpu`, setup logs "the NVIDIA container CLI runs its driver step as nobody:h4gpu", and status shows "/dev/dxg root:h4gpu 660; the NVIDIA container CLI runs as nobody:h4gpu".
  - If it doesn't, the value stays your hand-set `root:h4gpu`, with no log line.
- Either way, the GPU check of quickstart §0.2 (`docker run --rm --gpus all nvidia/cuda:…@sha256:e778… nvidia-smi …`) still lists the RTX 5090. If it doesn't, `sudo nvidia-ctk config --in-place --set nvidia-container-cli.user=root:h4gpu` puts your working value back, and please tell me.

## What changed and why

- **The patch (T179):**
  - **`setup-host.sh`, `ensure_nvidia_cli_user`,** right after `ensure_gpu_group`.
    - It sets the least privileged user NVML works as: `nobody:h4gpu`, or else `root:h4gpu`.
    - It tries nobody only once `/dev/dxg` is `h4gpu 660`. Before the first boot after setup, the device is 0666, open to every user, so the try would prove nothing. In that case setup sets `root:h4gpu`, and a re-run lowers it.
    - A host with no `/dev/dxg`, or no toolkit, is left alone.
    - A GPU that answers neither user gets a WARNING line rather than a failed setup, because the agents' engine runs CPU-only and only the host's GPU stacks need the CLI.
    - A value already right is left alone; setup is idempotent, as before.
  - **`engine.sh status`, `status_gpu`:** after the units, `/dev/dxg`'s owner and mode, and the CLI's user, or "its default, unset".
  - **Tests:** eight for the setup step, covering nobody, root, nobody untried before H6's mode, already set, the wrong section, neither, no device, and the step's order. Four for the status line, and one that checks `cmd_status` prints it after the units.
- **On this branch:**
  - contracts/agents-engine.md H6, plan §10's GPU line, and quickstart §0.2 and §0.5 say what the CLI's user is and why. They used to say "Rootful Docker runs as root and keeps the GPU", which T065's first prod start disproved.
  - Plan §10's seeding line describes T174's transfer: every platform, a load, then a tag by the pinned digest. The seed's reviewer had found it still described the old one.
  - tasks.md: T179's patch is ready. Its box stays open until you apply it.

## Verification

- With the patch applied, in its own worktree (detached at edb4a0f, the T149 branch's commit, whose `deploy/agents-engine` this branch doesn't change):
  - `pytest deploy/agents-engine/test`: 404 passed.
  - `make lint`: passed. It shellchecks `setup-host.sh` and `engine.sh` with the rest.
- `git apply --check` of the patch on this branch: clean.
- Untested where it matters: on your host. The probes and `nvidia-ctk` are stand-ins in the tests, and the sandbox has no GPU. The first real run is yours, above.

## Review

(The reviewer's findings and their fixes go here.)

## The patch

Every change, as `git apply` takes it: `docs/merge-requests/2026-10-09-fix-000-engine-gpu-user.patch` (278 lines).
