# Runbook: the agents' engine

The agents' engine is the disposable, CPU-only Docker engine that agent sessions run containers on: rootless Docker under the user `h4agents`, reached through one sandbox opening, `198.18.0.1:2376`, with mutual TLS, an admission plugin (`h4-authz`), a firewall, and an egress proxy. dev-cpu runs there, and so do the image gate and the agents' breach test. This page covers the engine down or unreachable, its plugin or proxy down, its images or stand-in model missing, a stale egress list, and a reset. Spec 000: FR-039; plan §10 and §19; [contracts/agents-engine.md](../../specs/000-local-foundations/contracts/agents-engine.md), §8's commands and [§9's degraded modes](../../specs/000-local-foundations/contracts/agents-engine.md#9-degraded-modes-and-residual-risk); [ADR 0016](../adr/0016-agents-engine-rootless-docker.md).

Everything under `deploy/agents-engine/` is human-only, and its commands are yours: `deploy/agents-engine/engine.sh <subcommand>`, run directly in your terminal, never through make. A recipe in the agent-editable Makefile, or a planted `GNUmakefile`, would otherwise sit between your sudo and the human-only code ([contracts/agents-engine.md §8](../../specs/000-local-foundations/contracts/agents-engine.md#8-commands)). Agents have two targets, `make engine-status` and `make engine-smoke`. When a session needs one of your commands, it asks you, in CLAUDE.md's words "batched into one script that returns everything a diagnosis needs and nothing secret (`.claude/agents/ops.md` shows how)".

## Symptoms

- In an agent session, a container command fails with one of:
  - the relay's "the engine's opening isn't reachable; ask the Author: deploy/agents-engine/engine.sh up";
  - `make engine-status`'s "engine: unreachable (ask the Author: deploy/agents-engine/engine.sh up)";
  - `make check`'s image gate, FAIL: "image: the agents' engine didn't build the images; if it's down, ask the Author: deploy/agents-engine/engine.sh up", or the same from `make build`.
- `make up ENV=dev-cpu` stops at preflight on a missing stand-in model: "ask the Author to run deploy/agents-engine/engine.sh seed" (P18). Preflight doesn't look for images: P17 checks only that each is pinned as `deploy/images.lock` pins it. An image the engine lacks fails later, when compose pulls it, or a build needs it as a base, through the egress proxy, which can't serve an image from any registry ([contracts/agents-engine.md §4](../../specs/000-local-foundations/contracts/agents-engine.md#4-egress-the-proxy)). `make up` fails there, and its status lists each service that didn't start.
- `make engine-status` reaches the engine but lists images as `MISSING` against `deploy/images.lock`.
- Every Docker request is refused: the admission plugin is down, and the daemon fails closed (row E12).
- Pulls, and the `npm ci` steps of builds, fail while seeded images still run: the egress proxy is down, or it found no list it could read and refuses everything (`no_list`).
- In your terminal, `engine.sh status` says the proxy's list digest and the settings' differ: `.claude/settings.json`'s `allowedDomains` changed after the proxy started.
- After a WSL restart, `engine.sh up` fails and shows a unit's status: the dummy interface `h4agents0` is gone.

## Impact

- Agent sessions can't run containers: no dev-cpu stack, no image gate, no `make engine-smoke`, and no `make breach-test ENV=dev-cpu`. Once the engine exists, `make check` fails its image gate while the engine is down (plan §11), so a branch's note can't show the gate passing.
- Nothing of yours stops. The engine is separate from your Docker, so prod and dev keep running, and it holds nothing you need: a reset or a rebuild loses only its own images, containers, and volumes (FR-039's "disposable").
- Each failure here fails closed: with the plugin down the daemon refuses every request, and with the proxy down, or its list unreadable, nothing leaves the engine ([contracts/agents-engine.md §9](../../specs/000-local-foundations/contracts/agents-engine.md#9-degraded-modes-and-residual-risk)).

## Act

In your own terminal. The Heavy steps (seed, reset, prove) run with no agent session using the engine, after the disk check (quickstart.md §0.1).

1. **Look first.** Read-only, so either of you may run it: `make engine-status`, or `deploy/agents-engine/engine.sh status`. In your terminal it adds the system units' states, the proxy's list digest beside the settings', and the plugin's last 20 refusals.
2. **Down or unreachable:**

   ```bash
   deploy/agents-engine/engine.sh up
   ```

   It checks the tree's masks, starts the system units (the address, the firewall, `/dev/dxg`, the tree and models binds), the plugin and the daemon as `h4agents`, and restarts your egress proxy, so it serves the settings' list as it is now. Then it waits for TLS on `198.18.0.1:2376`. It may ask for sudo.
   - **It refuses, naming a path:** a file matching `.env*` or `*.env` sits outside a masked path, or the sandbox read-denies a path in the tree that `deploy/agents-engine/tree-masks.txt` lacks, or the installed mask list differs from the tree's ([contracts/agents-engine.md §5](../../specs/000-local-foundations/contracts/agents-engine.md#5-host-side-controls), H8). Move the env file out of the tree (real ones live in `~/.config/h4reet-ai/env/`), or extend the mask list by your own hand and install it with `deploy/agents-engine/engine.sh setup`. Never remove a mask to get past it.
   - **It fails with a unit's status, after a WSL restart:** read it with `sudo systemctl status h4agents-net.service`, then run `deploy/agents-engine/engine.sh up` again.
   - **TLS never answers:** it stops after a minute and names what to check.
3. **Images, or the stand-in model, missing** (Heavy: it pulls on the host, loads into the engine, and copies the stand-in model):

   ```bash
   deploy/agents-engine/engine.sh seed
   ```

   It needs the host's Docker on the containerd image store (quickstart.md §0.4). It checks the disk before it writes, and refuses, naming both figures, when the Windows drive or ext4 is short ([§6.2](../../specs/000-local-foundations/contracts/agents-engine.md#62-enginesh-seed)).
4. **A stale egress list:** `systemctl --user restart h4-egress-proxy.service`, or `deploy/agents-engine/engine.sh up`. The proxy reads `allowedDomains` only when it starts.
5. **Broken beyond that** (Heavy):

   ```bash
   deploy/agents-engine/engine.sh reset
   ```

   It stops the daemon, deletes its data root, every volume, and the state directory's contents, starts it again, and seeds it: about a minute, plus the seed. The certificates, the models share, and the plugin's log survive.
6. **A client certificate near its expiry, or a reviewed change under `deploy/agents-engine/`:** `deploy/agents-engine/engine.sh setup`, which is idempotent. It reissues a certificate with fewer than 30 days left, and installs the copies the engine runs, so a change takes effect only then. Run it as yourself: it calls sudo itself. If it asks for `wsl --shutdown`, that ends every WSL session, agents' included.

## Verify

- `make engine-status` shows `engine: reachable`, rootless, the plugin `h4-authz`, and every image `present`.
- An agent session's `make engine-smoke` passes: `make up ENV=dev-cpu` comes up healthy, `make breach-test ENV=dev-cpu` passes, and `make down ENV=dev-cpu` stops it (US3-9's positive half, quickstart.md §3.4).
- After a change to the engine's definition: `deploy/agents-engine/engine.sh prove` (Heavy) passes rows E1 to E16 ([contracts/agents-engine.md §7](../../specs/000-local-foundations/contracts/agents-engine.md#7-the-fr-039-limits-and-their-proofs); quickstart.md §3.3). Once US3's prove patch, [`docs/merge-requests/2026-10-10-feat-000-us3-governance-prove.patch`](../merge-requests/2026-10-10-feat-000-us3-governance-prove.patch), is applied, it also writes `~/.local/state/h4reet/agents-engine/prove-report.txt`, headed with the commit and the engine's tree, which `make matrix` folds as stage E only when that tree is the checkout's.

## Undo

- `deploy/agents-engine/engine.sh down` stops the daemon, the plugin, and the proxy. The data stays.
- A reset can't be undone, by design: the engine holds nothing worth keeping, and `deploy/agents-engine/engine.sh seed` brings back every pinned image.
- `deploy/agents-engine/engine.sh destroy` removes everything but the user, its ID range, and the two host settings that protect your files whether or not an engine exists (H6 and H7). `deploy/agents-engine/engine.sh setup` builds it again.

## Record

In the merge-request note of the branch that needed it: the symptom, the commands you ran and their exit codes, `make engine-status`'s summary before and after (reachable or not, images present or missing), and for a seed or a reset its table and duration. After `engine.sh prove`, its table and the log excerpts it prints. Never a certificate, a key, or more of the plugin's or the proxy's log than a result needs.
