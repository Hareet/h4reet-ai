# Contract: releases, the three deployers, and rollback

Spec 001, re-planned 2026-11-09. Replaces the September contract (`contracts/releases-deployer.md` at 00309c47), whose `release.json`, deployer loop, hold, and record it carries, for three hosts instead of two. Spec FR-046 to FR-049. Research: R-17.

## 1. `release.json`

As September §1: the commit, each service's image index digest, the platforms, the time, and who built it. One new field:
- `hosts`, the classes each service runs on: `laptop`, `ec2`, `tunnel-end` (contracts/env-cloud.md §3).

The deployer of each host checks only its own services' digests. **Group 7:** an upstream image's copy also carries its `tag`, and EC2's deployer refuses a copy whose tag and digest aren't its lock line's in the release's tree (`deploy_refused`, reason `pin`), so both hosts run one digest (FR-048).

**The tree's key** (the deployer's review, nit 2): `tree.key` is `trees/<commit>.tar.gz`, the release's own commit, and nothing else; the first step and the deployer each refuse any other (`deploy_refused`, reason `tree`). `tree.sha256` is the SHA-256 of that object.

## 2. `make release` (the Author's terminal; refused to agents)

On a clean `main`:
1. **Gates:** checks the commit passed the gate. If the release makes hello or the twin's turns reachable, it checks that the red-team record for that commit passed on all four adapters (spec FR-039).
2. **Builds** the project's images once: `linux/amd64`, and `linux/arm64` for any service that runs on a Graviton host (research.md R-04, R-33).
3. **Pushes** them to ECR, tagged with the release id (`<time>-<the commit's first 12>`, release.json's `release`), so a rerun of a commit whose run pushed then refused never meets a tag that run left in the immutable registry; and copies every upstream image the cloud hosts run into ECR by index digest, taking a copy whose tag already names the lock's digest as it is. A tag at another digest still refuses (fix F6, `fixes/f6.md`; it was tagged with the commit until then).
4. **Writes** `release.json` to the release bucket and to `~/.local/state/h4reet/releases/`.
5. **Syncs** the site's build (contracts/edge.md §5).

Releases refuse a site build that holds drafts or placeholders (spec 002's rule).

**As built in group 7, after its review A** (`deploy/scripts/release.py`; plan.md §16, "Group 7, after review A"):
- **What is released:** refs/heads/main's commit, from a fresh `git archive` export of it, so the checkout's HEAD and its untracked files don't matter (I-D). Every build, the tree, and the site's check read the export.
- **Step 1, the gate:** the commit must be a merge whose message carries the gate's line for the tip it merged, `gate: <second parent> (<branch>) by tools/gates/gate at …`, which the Author's hand guard writes into each merge (I-H). A commit of the Author's own on main, or a merge without that line, is refused. The release reads the line's presence; the merge is the Author's word on what the gate said.
- **Step 1, the red team:** with `PUBLIC=1`, a passing run of that very commit on each of `local`, `bedrock`, and `anthropic`, matched by the run's record's `commit` field (redteam/run.py writes the stack's running commit, its run file's `H4_REF`), read from `REDTEAM=` (default `redteam/history`, outside the export). FR-039's four adapters are three names: the laptop's paid fallback is one of EC2's two.
- **The site's check:** the web image built from the export with `--load`, never pushed; its `/usr/share/nginx/html` copied out (`docker create`, `docker cp`); main's `tools/gates/content_check.py`, from the export, on that copy. The site builds inside the image (`npm ci --ignore-scripts`), so nothing of a checkout's `node_modules` runs in the Author's terminal (I-E).
- **Step 5, the site's sync, is group 8's** (contracts/edge.md §5), with the edge it syncs to. **As built in group 8:** with `SITE_BUCKET=` (`h4reet-ai-site-<the account's ID>`, from W2's apply on), the release puts the site it checked under `releases/<commit>/`, each file with the web image's own Cache-Control (hashed assets and `a/` a year, immutable; everything else no-cache), each GLB's gzip copy under its name without `.gz` with Content-Encoding gzip, and never the PDF's text file; then syncs that copy to `site/`, deleting what the release lacks but `status/`, the public view's (from W2, its `status/latest.json` alone); then, with `DISTRIBUTION=`, invalidates once. All of it comes before `release.json` and the pointer, so a failed sync leaves the pointer on the release before. Without a site bucket nothing is synced, and the release says so. **From W2** (group 8's review B, nit 1; plan.md §16, "W2, as built", item 3): `site/` takes the assets first, never deleting, then the rest, whose `--delete` spares the snapshot sink's `status/latest.json`, `assets/`, and `a/` (W2's review, I1: sparing the whole of `status/` kept the build's own `status/` page out of `site/`); a failed invalidation is a warning that prints its recovery, `aws cloudfront create-invalidation --distribution-id <ID> --paths '/*'`, and the release goes on to its pointer, since `site/` already holds it; then the assets and content-addressed files the release lacks are retired, each kept a day from the release that first lacked it by the ledger `releases/retired.json` in the site's bucket, and deleted after. A failed listing, an unreadable ledger, or a failed delete deletes nothing it can't account for, and is a warning (`docs/runbooks/deploy.md`, Act 4).
- **After group 7's fixes' review** (plan.md §16, "Group 7's fixes, reviewed"): the release runs only as main's own code, its own bytes and the Makefile's refs/heads/main's blobs, so it is run from main's checkout, on main (I2); every git command it runs has replace objects off; the gate's line must report a pass, no failing step, none PENDING, and no `--host` run (nit 1); and with `PUBLIC=1` it needs a passing run of the commit on each host's two route adapters, from the export's `config/routing.yaml`, each record naming its host: the laptop's from its live red-team target, EC2's from `redteam/live.py --host ec2` in the Author's session on EC2, with the commit from the deployer's `current.json` (I1).
- **After group 8's review B (I3): EC2's run keyed by what it exercised.** EC2 runs a release only once it is released, so a gate that needed EC2's run of the very commit would need that commit on EC2, and so already released, before it could be released public. So EC2's record carries `exercised`, the SHA-256 of what the cases exercise: the gateway whole but its tests (`services/gateway` less `test/`, so its Dockerfile, migrations, and build settings count; corrected after the review of group 8's fixes, nit 1), the root `package.json` and `tsconfig.base.json` its image copies (the fixes' review, nit 5), the lockfile, `config/`, the corpus, `redteam/cases`, and `redteam/run.py` (`EXERCISED` in `redteam/run.py` and in `deploy/scripts/release.py`, which a test holds alike). With `PUBLIC=1` the release counts EC2's run of any commit whose `exercised` equals its export's, and the laptop's of the very commit, as before. A release that changes those bytes needs EC2's run of it first: a release without `PUBLIC=1`, while the laptop serves, so EC2 runs it and the relay keeps visitors on the laptop; then the red-team runs on EC2 (`redteam/live.py --host ec2`); then the same commit with `PUBLIC=1`. Nothing enforces "while the laptop serves": no deployer reads `release.json`'s `public`, so if the laptop drops while that release is out, EC2's candidate serves visitors before its red-team run; option B, a staged run under the deployer's hold, has no such gap. Recommended to the Author, and built; his question B-3 in W1's note.
- **Exits:** 0 released; 1 refused, nothing pushed past the step that refused; 2 couldn't run (a command missing, or a timeout).

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

**The first step's arguments and exits** (the deployer's review, nit 3):

```text
python3 -I -B deploy_first_step.py --host tunnel-end|ec2 [--state DIR] [--boot | --restart SERVICE]
```

It runs under an exclusive lock on `<state>/.lock`, so the boot's run and the timer's never overlap; a restart takes no lock, since it touches no tree's folder, so the key's revocation never waits for a deploy (group 7's review A, I-A). It passes `--boot` or `--restart` on to the deployer, with `--env-file` (the host's, `/run/h4reet/<host>.env`) and `--state`.

| Exit | Run | Means |
|---|---|---|
| 0 | the boot's or the timer's | the deployer ran: it deployed, kept what runs, or refused or rolled back and alerted (its own 75); or there's no release yet, or the bucket is out of the network's reach |
| 1 | the boot's or the timer's | nothing ran that should have: no env file; before any release has started here, the bucket refuses (`deploy_refused`, reason `bucket`, once per boot; once one has, the running release's deployer alerts it and exits 75, so 0 here, group 7's review A, nit 5); a tree that isn't the release's (reason `tree`); or the release's deployer, and the previous release's, didn't run (reason `deployer`) |
| the deployer's own | a restart | passed through as it is, with no fallback: a failed restart fails its unit and the Systems Manager command that started it |

**The deployer's exits:** 0 for a run that changed nothing or deployed; 75 for a check or a boot that refused or rolled back and alerted; 1 for a restart that failed; anything else is a deployer that didn't run.

**The retry rule** (the deployer's review, 1 and 2). Each attempt is recorded in `deployments.jsonl` and marked in `attempts.json`, whether or not SNS takes its alert; the alert memory, `refused.json`, only deduplicates, and an alert SNS refused waits in `pending.json` for a later run. A refusal is tried again once a newer release comes; a failed start (`rolled_back`, `rollback_failed`) after a backoff that doubles from two minutes to an hour. At boot every attempt is tried again, and a host running nothing tries each run, recording an identical repeat once (group 7's review A, nit 2). A run restarts what runs before it sends any alert SNS refused earlier; a held run sends those too. The manual retry is `docs/runbooks/deploy.md`'s.

**EC2's boot run:** EC2's stack doesn't start until its deployer has checked the bucket. If the bucket can't be reached, it starts its last release and alerts (FR-046). **As built in group 7:** at boot the deployer asks the bucket before anything starts; a new release starts as any new release does; the running one starts from its cached images; and with the bucket out of reach, or refusing, the last release starts from its cached images and `deploy_refused` is alerted once per boot, reason `unreachable` or `bucket`. EC2's images: each copy by `H4_IMAGE_<SERVICE>` in the release's env file, and the gateway's and the room's pulled by the release's digest and tagged `h4reet-gateway:<commit>` and `h4reet-web:<commit>` for its `H4_REF`. Its host step, `deploy/hosts/ec2/ec2_host.py prepare`, installs the gateway's proxy and the gateway's Bedrock credential timer from the release's tree before compose pulls anything.

## 4. Rollback and holds (FR-047, FR-049)

- ~~`make rollback ENV=ec2|tunnel-end|prod` sets that host's deployer to the previous release: EC2's and the tunnel end's through a Systems Manager command, the laptop's directly.~~ **Not built** (corrected 2026-11-23, from the Well-Architected review's corrections): the Makefile has no such target. The laptop's prod stack goes back as `docs/runbooks/rollback.md` gives it (`make up ENV=prod REF=<previous sha>`). A cloud host goes back to the release before only through its deployer, when a new release fails its start (`deploy_rolled_back`, §3); otherwise the way forward is a new release. FR-047's "one command away for the Author" is open for EC2 and the tunnel end (the review's item R29).
- A hand-started stack (`make up ENV=… REF=…`) writes `started_by=author`. The deployer leaves it alone until `make deployer-resume`.
- **The tunnel end's hold** (group 5's fixes' review, 3): a file, `hold`, in its deployer's state folder, which the Author makes in a Systems Manager session; while it stands the deployer starts, restarts, and deploys nothing, at boot or on its timer, and the key's revocation still restarts the sshd (`docs/runbooks/tunnel-end.md`, "Stopping the stack on purpose").
- **Across migration 0007** a rollback fails closed: spec 000's gateway refuses a store whose schema is newer than its code.

## 5. The deployment record

As September §5, with `host` added. It goes to a JSON line in each host's state directory, and to a log event that the dashboard's release panel shows per host.

## 6. The dashboard's Hosts row: the release (group 7)

(new in group 7; tasks.md T091; FR-049, FR-060.) `deploy/grafana/dashboards/h4-runtime.json`'s "Hosts" row, below group 6's panels (contracts/shared-state.md §10):

| Panel | Type | Query |
|---|---|---|
| The release on each host (FR-049) | table | `max by (h4_host, h4_release, h4_commit, h4_started_by) (last_over_time(h4_release_info[5m]))` |
| Deployments (FR-046) | time series | `sum by (h4_host, outcome) (increase(h4_deploy_events_total[1h]))` |

- **`h4_release_info`** is `h4.release.info`, a gauge of 1 each cloud host's deployer pushes on each run, labelled `h4.host`, `h4.release`, `h4.commit` (its first 12 hex), and `h4.started_by` (`deployer`), never an address, an account, or a digest. The table reads the last five minutes alone, so a release the host no longer runs leaves it within minutes (group 7's review A, nit 6).
- **`h4_deploy_events_total`** is `h4.deploy.events`, a counter the deployer adds 1 to for each attempt it records, labelled `h4.host` and `outcome` (`deployed`, `refused`, `rolled_back`, `rollback_failed`). **After group 7's review A (I-F):** it is cumulative, not a delta, which the collector's metrics pipeline passes on unconverted and Prometheus drops: the deployer keeps each outcome's count and its start in its state folder (`events.json`), and sends all four counts on every run, a held one included, so each series has a sample a minute; with nothing running, an identical repeat is tried each run but counted, and recorded, once (nit 2). Prometheus's `created-timestamp-zero-ingestion` takes the start as the series' zero, to confirm on EC2's first run.
- Both reach the host's collector as OTLP/HTTP's JSON from the host itself: EC2's through `ec2-relay-block`'s 4318, the tunnel end's at its collector's address on the stack's egress bridge. The laptop's line waits for its deployer (plan.md §16, "Group 7, as built", 11): meanwhile a hand-started stack's commit and who started it are its run file's, which the laptop's status shows.
