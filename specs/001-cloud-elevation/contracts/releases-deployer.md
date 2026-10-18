# Contract: releases, the deployers, and rollback

Spec 001 (FR-039, FR-046 to FR-049, FR-055) · Plan: [§7](../plan.md#7-releases-and-the-deployers) · Research: [R-17](../research.md#r-17-releases-from-the-authors-terminal-deployers-that-pull-to-ask-question-7), [R-04](../research.md#r-04-the-cloud-vm-graviton-spot-the-smallest-size-that-holds-the-thin-services-fr-021)

A release is a commit on `main` with its images pinned by digest (spec Key Entities). The Author's terminal makes releases before publication (FR-046). A deployer on each host pulls the newest release and starts only what changed. Nothing pushes to either host.

## 1. `release.json`

Written once per release, never edited. Its schema is in [data-model.md §6.1](../data-model.md#61-releasejson).

```json
{
  "schema": 1,
  "commit": "58bd2327212e90407c16b4699050bf6d8ed29bc4",
  "made_at": "2026-11-02T14:31:07Z",
  "made_by": "author",
  "gate": { "summary": "18 PASS, 0 FAIL, 1 SKIP", "at": "2026-11-02T14:20:44Z" },
  "redteam_hello": { "commit": "58bd2327212e90407c16b4699050bf6d8ed29bc4", "result": "pass", "at": "2026-11-02T14:25:10Z" },
  "images": {
    "gateway": { "repository": "h4reet/gateway", "index_digest": "sha256:…", "platforms": ["linux/amd64", "linux/arm64"] },
    "relay": { "repository": "h4reet/relay", "index_digest": "sha256:…", "platforms": ["linux/amd64", "linux/arm64"] },
    "postgres": { "repository": "h4reet/upstream/postgres", "index_digest": "sha256:…", "upstream": "public.ecr.aws/docker/library/postgres:17.11-alpine3.24" }
  },
  "site": { "tree": "<git tree hash of apps/web at the commit>", "files": 12 },
  "previous": "c25a9f1…"
}
```

- **`images`** lists every service image either stack runs. The project's own images are built for both platforms. Each upstream image keeps its upstream index digest, which `deploy/images.lock` pins (FR-048).
- **`redteam_hello`** is required once a release makes hello reachable from the internet, which is from group 6 on: the release's commit must have a passing red-team record for hello (FR-039: "THE SYSTEM SHALL refuse the release if any case fails"). Before that, the field is null.
- **`previous`** is the release this one replaces, so a rollback needs no search.

## 2. `make release`

The Author's terminal only (the bash gate refuses it to agents), on a clean checkout of `main` at the commit to release. In order, stopping at the first failure:

1. **Refuses** unless:
   - HEAD is `main`, the tree is clean, and HEAD is the merge the gate approved, by the gate's summary line in the merge commit's message;
   - from group 6 on, `redteam/history/` has a passing hello run for this commit.
2. **Builds** `gateway`, `relay`, `tunnel`, and `snapshot` once each, with `docker buildx build --platform linux/amd64,linux/arm64 --push`, to `<account registry>/h4reet/<service>:<commit>`. The Node images compile on the build platform and copy the result into the target stage. `tunnel`'s package install runs under QEMU's arm64 emulation, which the Author installs once (quickstart §4.1).
3. **Copies** every upstream image in `deploy/images.lock` to `<account registry>/h4reet/upstream/<name>`, by digest, with `docker buildx imagetools create`, which keeps the index digest. It refuses if a copied digest differs from the lock's.
4. **Checks the local engine** holds each image at the same index digest, pulling it from the registry with the Author's session if it doesn't, so the local deployer never needs AWS (R-17).
5. **Writes the site:** builds `apps/web/dist/`, syncs it to the site bucket's `site/` (excluding `status/latest.json`), copies it to `releases/<commit>/`, and invalidates `/*` ([edge.md §4](edge.md#4-releases-of-the-site-and-the-public-views-path)).
6. **Writes the records:**
   - the commit's tree as `trees/<commit>.tar` (`git archive`), for the VM, which has no checkout;
   - `release.json` to `s3://<release bucket>/releases/<commit>.json`, then `releases/latest.json`, a copy, last;
   - both records to `~/.local/state/h4reet/releases/`, the local tier's source.

   The release bucket admits writes only from the Author's administrator role, and reads from the VM's instance role.
7. **Prints** the record, and the deployers' expected pick-up time (one minute).

It records nothing secret, and prints no registry host with the account in it: the account part is shown as `<account>` (FR-010).

**The registry's lifecycle rule** keeps the last 5 images of each repository, and every image a release in the last 90 days names.

## 3. The deployer

`deploy/scripts/deployer.py`, stdlib, run through `PY_HOST`:

| Host | Runs as | Started by | Its source | Its stack |
|---|---|---|---|---|
| the cloud VM | root (the VM is single-purpose), with `HTTPS_PROXY` set to the egress proxy | `h4-deployer.timer`, every 60 s | `s3://<release bucket>/releases/latest.json`, read with the instance role | `cloud` |
| the local tier | the Author, in the Author's systemd user session | `h4-deployer.timer` (user unit), every 60 s, installed by `make deployer-install` | `~/.local/state/h4reet/releases/latest.json` | `prod` |

**Each run** holds a lock file, so one runs at a time, and:
1. **Reads** the stack's run file (spec 000's, at `${H4_STATE_DIR}/run.env`). If `H4_STARTED_BY=author` and `H4_DEPLOYER_HOLD=1`, it stops: the Author started this stack by hand (FR-049), and the dashboard shows the commit and who started it.
2. **Reads** the newest release record. If its commit is the running one, it stops. If the record doesn't parse, or its `schema` isn't known, it alerts once and stops.
3. **Verifies**, for each image: `docker buildx imagetools inspect` (the VM pulls from the registry; the local tier checks its own store) must give the record's index digest. A mismatch stops the run and alerts: nothing starts on an image the record doesn't name.
4. **Exports** the release's commit, as spec 000's `make up` does (`export_tree.py`: `git archive`, the tree hash checked against the commit). On the VM, the commit's tree comes from the release bucket's `trees/<commit>.tar`, which `make release` uploads; the VM has no git checkout. Then it writes the run file with `H4_REF`, `H4_REF_PREVIOUS`, `H4_RELEASE`, and `H4_STARTED_BY=deployer`.
5. **Works out what changed:** `docker compose config --hash` for each service, against the running containers' `com.docker.compose.config-hash` labels.
6. **Starts** only those services: `docker compose up -d --no-deps --wait --wait-timeout 300 <services>`, with the stack's env file and run file. Nothing else restarts (FR-047).
7. **Waits for health:** every service healthy, the gateway's `/health/live` answering, and on cloud the relay's `/health/live` too.
8. **On a failure in step 6 or 7,** it returns to the previous release (§4) and alerts.
9. **Records** the deployment (§5).

**Alerts.** On the VM, the deployer publishes to the `h4-alerts` topic with the instance role, which may publish to that one topic. The bridge carries it to Telegram, and SNS to email ([aws-alerts.md §2](aws-alerts.md#2-the-alerts-and-their-messages)). On the local tier, the deployer sends to Telegram and email itself, with the channel values it reads from the prod env file as data, as `make up` reads it, in spec 000's alert format with the prefix `[h4reet.ai prod]`.

## 4. Rollback (FR-047)

| Trigger | What happens |
|---|---|
| A failed health check after a deploy | The deployer reads `previous` from the failed release's record, then runs §3's steps 3 to 7 for it, with the reason `rollback: health`. If that fails too, it stops, leaves the stack as it is, and alerts `deploy_rollback_failed`. |
| The Author: `make rollback ENV=cloud` | Through the operator's session ([env-cloud.md §7](env-cloud.md#7-the-vms-host-credentials-the-operator-session-the-egress-proxy)), it runs `aws ssm send-command` to make the VM's deployer roll back once, with the reason `rollback: author`, and sets `H4_DEPLOYER_HOLD=1` until `make deployer-resume ENV=cloud`. |
| The Author: `make rollback ENV=prod` | The same on the local tier; or spec 000's `make up ENV=prod REF=<previous>`, which also sets the hold |
| A migration in the way | The gateway refuses a store whose schema is newer than its code (spec 000's exit 78, `schema_newer_than_code`), so the health check fails and the rollback stops with `deploy_rollback_failed`. The runbook says what to do. |

**The site's rollback** is separate, by the Author: `make site-rollback`, which runs [edge.md §4](edge.md#4-releases-of-the-site-and-the-public-views-path)'s sync from the previous release's copy.

## 5. The deployment record

One JSON line per run that acted, appended to `${H4_STATE_DIR}/deployments.jsonl` and logged as the event `deploy.event`. The cloud collector sends it home through the tunnel; locally the stack's collector takes it. It also becomes the metric `h4.deploy.events` (`h4.host`, `h4.outcome`) and the info gauge `h4.release.info` (`h4.commit`, `h4.started_by`). The fields are in [data-model.md §6.2](../data-model.md#62-the-deployment-record).

```json
{"ts":"2026-11-02T14:32:10Z","host":"cloud","stack":"cloud","release":"58bd2327212e","previous":"c25a9f1a0b3d","started_by":"deployer","services":["relay","gateway"],"outcome":"deployed","reason":null,"duration_s":41}
```

`outcome` is one of `deployed`, `rolled_back`, `rollback_failed`, `refused`, or `held`. `held` is logged once per hold, not every minute.
