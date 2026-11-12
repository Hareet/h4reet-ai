# Contract: releases, the three deployers, and rollback

Spec 001, re-planned 2026-11-09. Replaces the September contract (`contracts/releases-deployer.md` at 00309c47), whose `release.json`, deployer loop, hold, and record it carries, for three hosts instead of two. Spec FR-046 to FR-049. Research: R-17.

## 1. `release.json`

As September §1: the commit, each service's image index digest, the platforms, the time, and who built it. One new field:
- `hosts`, the classes each service runs on: `laptop`, `ec2`, `tunnel-end` (contracts/env-cloud.md §3).

The deployer of each host checks only its own services' digests.

## 2. `make release` (the Author's terminal; refused to agents)

On a clean `main`:
1. **Gates:** checks the commit passed the gate. If the release makes hello or the twin's turns reachable, it checks that the red-team record for that commit passed on all four adapters (spec FR-039).
2. **Builds** the project's images once: `linux/amd64`, and `linux/arm64` for any service that runs on a Graviton host (research.md R-04, R-33).
3. **Pushes** them to ECR, tagged with the commit, and copies every upstream image the cloud hosts run into ECR by index digest.
4. **Writes** `release.json` to the release bucket and to `~/.local/state/h4reet/releases/`.
5. **Syncs** the site's build (contracts/edge.md §5).

Releases refuse a site build that holds drafts or placeholders (spec 002's rule).

## 3. The deployers

| Host | Runs | Source | Pulls from |
|---|---|---|---|
| EC2 | at each boot before the stack starts, then every minute | the release bucket | ECR, with the instance role |
| The tunnel end | every minute | the release bucket | ECR, with the instance role |
| The laptop | every minute, in the Author's session | `~/.local/state/h4reet/releases/` | the Author's engine, which built the images; checked by index digest. The laptop holds no registry credential |

Each run, as September §3:
1. verify the digests;
2. export the commit's tree;
3. `docker compose up -d --wait` on the changed services only;
4. on a failed health check, return to the previous release and alert;
5. record the deployment.

**The deployer from the release** (plan.md §16; the Author's answer of 2026-11-13, "From the release (Recommended)"): a cloud host's user data carries a small first step, `deploy/scripts/deploy_first_step.py`, not the deployer. Each run, the first step runs the deployer of the release the host last started, from that release's tree; before any has started it fetches the newest release's tree as the deployer does, held to `release.json`'s SHA-256, and runs its deployer, which verifies the whole release again. No release yet, or the bucket out of reach, runs and alerts nothing until the next run. A tree that isn't the release's is `deploy_refused` (reason `tree`), and a deployer that doesn't run (any exit but 0, or 75, its exit for a run that refused or rolled back and alerted) is `deploy_refused` (reason `deployer`), each once per release; then the previous release's deployer runs, so the host still takes the next. The deployer's own guarantees stand: the boot's cached images, the hold, preflight's phases, `refused.json`, and the registry out of reach. EC2's user data takes the same step (group 7).

**EC2's boot run:** EC2's stack doesn't start until its deployer has checked the bucket. If the bucket can't be reached, it starts its last release and alerts (FR-046).

## 4. Rollback and holds (FR-047, FR-049)

- `make rollback ENV=ec2|tunnel-end|prod` sets that host's deployer to the previous release: EC2's and the tunnel end's through a Systems Manager command, the laptop's directly.
- A hand-started stack (`make up ENV=… REF=…`) writes `started_by=author`. The deployer leaves it alone until `make deployer-resume`.
- **The tunnel end's hold** (group 5's fixes' review, 3): a file, `hold`, in its deployer's state folder, which the Author makes in a Systems Manager session; while it stands the deployer starts, restarts, and deploys nothing, at boot or on its timer, and the key's revocation still restarts the sshd (`docs/runbooks/tunnel-end.md`, "Stopping the stack on purpose").
- **Across migration 0007** a rollback fails closed: spec 000's gateway refuses a store whose schema is newer than its code.

## 5. The deployment record

As September §5, with `host` added. It goes to a JSON line in each host's state directory, and to a log event that the dashboard's release panel shows per host.
