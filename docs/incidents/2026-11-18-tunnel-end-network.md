# 2026-11-18: a release reconfigured the tunnel end's live network, and a dead laptop session held the tunnel's ports

Date: 2026-11-18, UTC (the evening of 2026-11-17, Mountain time) · Tier: the cloud, the tunnel end · Status: fixed by F9 and F10, released 2026-11-22; F10's second part removed by F11, which goes live before publication · Written 2026-11-23 by Claude Code (a general-purpose agent in the Author's session) from the records linked below, blameless

Sources: [f9.md](../../specs/001-cloud-elevation/fixes/f9.md), [f10.md](../../specs/001-cloud-elevation/fixes/f10.md), the merge notes of `fix/001-live-network` and `fix/001-f11-log-trigger`, and the apply record on `ops/apply-prod-2026-11-18`. What is marked "(runbook)" comes from the Author's session runbook of 2026-11-18, not from a repository record: the times 00:44:29Z, 03:03Z and 03:19Z, the restart of the release before, the store alert, the freeze during the laptop's prod shutdown, and the line on the shared state's data.

## What happened

At 00:24Z a new release took the site's API down. On the tunnel end, the release's host step (fix F2's, which installs a reply route) ran `networkctl reload` and `networkctl reconfigure ens5` on the running host. networkd couldn't bring `ens5`, the tunnel end's private interface, back up, and the interface lost its address. The shared state (the Postgres database that holds the meter and the kill switch), the relay, and the sink bind to that address, so none of them started, and the deployer's return to the release before failed the same way (`rollback_failed`). Every dynamic request answered `no_host_serving` until the Author set the address, EC2's route, and the reply rules by hand, and the deployer restarted the release before: serving again from 00:44:29Z (runbook).

At 00:58:14Z networkd retried the interface on its own and removed the rules set by hand, and EC2's gateway lost the shared state until the rules were put back at 03:03Z (runbook).

Then the laptop's Windows froze while its prod stack was being taken down (runbook) and was hard-restarted. From about 03:10Z the laptop's tunnel client reconnected every 30 s; each time the tunnel end accepted its key and refused it the three forwarded ports, 2201 to 2203, which the old session still held, as it did for 15 minutes and more (f10.md), until the Author restarted the tunnel end's SSH server container at 03:19Z (runbook).

At 14:15Z the tunnel end rebooted cleanly on the same release, and networkd made the same configuration from the same file without an error. The host step's configuration was right; making it live on a running host was not.

## Timeline

All times UTC, 2026-11-18.

| Time | Event |
| --- | --- |
| before 00:24 | Prod's apply, recorded on `ops/apply-prod-2026-11-18`; then release `20261118T001208Z-f1abe2454054` |
| 00:24:36 | On the tunnel end the release's host step reloads networkd and reconfigures `ens5`. networkd: "Could not set DHCPv4 route: Nexthop has invalid gateway. Network is unreachable", then `ens5: Failed`. The address is gone; the shared state, the relay, and the sink don't start; the return to the release before fails (`rollback_failed`); `/api/status` answers 503 with `no_host_serving` |
| 00:39 and 00:42 | The same failure, with the step's file moved out |
| 00:44:29 (runbook) | After the Author sets the address, EC2's route, and the reply rules by hand, and moves the step's file aside, the deployer restarts the release before: 200, `"serving":"ec2"` |
| 00:58:14 | networkd retries `ens5` by itself ("Failed to configure address: Numerical result out of range") and removes the rules set by hand. EC2's gateway loses the shared state (the store alert, runbook) |
| near 01:00 | EC2 is stopped by an API call. Who made it is not established ([2026-11-18-ec2-capacity.md](2026-11-18-ec2-capacity.md)) |
| 03:03 (runbook) | The rules are put back |
| about 03:10 to 03:20 | After the laptop's freeze and hard restart, its tunnel client reconnects every 30 s; the tunnel end accepts its key and refuses ports 2201 to 2203, still held by the old session (f10.md) |
| 03:19 (runbook) | The Author restarts the tunnel end's SSH server container, and the laptop's tunnel takes its ports |
| 14:15 | The tunnel end reboots cleanly on the same release: networkd configures `ens5`, its routing table, and both rules from the same file |
| 2026-11-22 | F9 and F10 (`fix/001-live-network`) reviewed, merged, and released; F11 (`fix/001-f11-log-trigger`) found and built |

## Detection

- **Band:** none. The budget is the only control band built so far ([lifecycle.md](../how-we-build/lifecycle.md#the-first-control-band-the-budget)); availability has none.
- **Tier:** the cloud tier, the tunnel end; then the laptop's tunnel.
- **What showed it:** during the release, the tunnel end's deployer record (`rollback_failed`) and `/api/status` (503, `no_host_serving`); at 00:58:14Z, the store alert from EC2's gateway; after the freeze, the laptop's tunnel log and the tunnel end's SSH server log, which refused the three ports as already in use. Whether the deployer's `deploy_rollback_failed` and the probe's `probe_failing` alerts reached Telegram isn't in the record.

## Impact

- **00:24:36Z to 00:44:29Z (runbook), about 20 minutes:** the tunnel end's stack was down. As its runbook says of that state, "every dynamic request answers `no_host_serving`, the room shows its resting message, and the site itself still loads from the edge" ([tunnel-end.md](../runbooks/tunnel-end.md)).
- **00:58:14Z to 03:03Z (runbook), about two hours:** EC2's gateway couldn't reach the shared state, and its runbook's impact for that is "every request fails closed, local answers included" ([store-unreachable.md](../runbooks/store-unreachable.md)). EC2 itself was stopped near 01:00Z, for a cause not established; the record doesn't say which host, if any, served each request in this window.
- **About 03:10Z to 03:19Z (runbook):** the laptop couldn't serve, because its tunnel couldn't take its ports.
- **Nothing lost:** "The shared state's data, a host folder, was never at risk." (runbook). No spend beyond the usual.

## Root cause

**The outage (F9).** The host step made a networking change live on a running host with `networkctl reconfigure ens5`, which drops and remakes everything networkd holds on the link, the address included. On this host the remaking failed and left the interface without an IPv4 address. The step returned success either way, so compose started and every service bound to the address failed; the rollback ran the previous release's host step, which found nothing to change, and failed the same way. Why a live reconfigure fails where a boot succeeds isn't established ([f9.md](../../specs/001-cloud-elevation/fixes/f9.md), backlog F9-3); the fix doesn't depend on it.

**The held ports (F10).** When the laptop vanished without closing its connection, the tunnel end's SSH session that held the three forwarded ports lived on until the kernel gave up retransmitting (`tcp_retries2` 15, about 924 s). Why the SSH server's client-alive check didn't end it sooner is a hypothesis, not verified ([f10.md](../../specs/001-cloud-elevation/fixes/f10.md), backlog F10-2).

### Contributing factors

- **Tests that pinned the bug.** F2's tests asserted the two `networkctl` commands, so the test suite held the step to the behavior that failed (f9.md, "Changed, not kept").
- **Prod was the first real host.** No pre-production cloud environment exists; the step met a live networkd for the first time on the production tunnel end (the Well-Architected review's R23).
- **A rollback that can't undo a host change.** The deployer's rollback reruns the previous release's host step and compose on the same host, so it can't recover from a host-level failure the new step caused.
- **A hand fix the system removed.** The rules set by hand were foreign to networkd's configuration, and networkd removes foreign rules when it configures a link again (its defaults, `ManageForeignRoutingPolicyRules=` and `ManageForeignRoutes=`), so the first recovery undid itself at 00:58:14Z.
- **One tunnel end, by decision.** While its stack is down, no host can serve, the laptop included ([ADR 0057](../adr/0057-spot-with-interchangeable-types.md); spec 032, "The downtime that remains").
- **A check every second through the dead session's port.** The relay checks the laptop through port 2201 every second, which may have kept the SSH server's client-alive probe from running (f10.md's hypothesis).

## Fix

- **F9** ([f9.md](../../specs/001-cloud-elevation/fixes/f9.md); branch `fix/001-live-network`, merged and released 2026-11-22). The host step never runs `networkctl` or restarts networkd. It writes its file for the next boot, makes the route and the rules live with `ip` only where they are missing, and checks the address before (waiting up to 30 s for a boot's lease) and after. If the address is lost or a command fails, it undoes its own changes and fails before compose runs, so the running release keeps serving. The runbook's step for missing replies no longer says to reconfigure `ens5`.
- **F10** (same branch). The tunnel end's container gives up on a silent peer after 8 retries instead of 15, so a dead session lets go of its ports 102 to 204 s after the first unanswered packet, instead of about 924 s ([f11.md](../../specs/001-cloud-elevation/fixes/f11.md)).
- **F11** ([f11.md](../../specs/001-cloud-elevation/fixes/f11.md); branch `fix/001-f11-log-trigger`, merged into `main` on 2026-11-22, live with the next release). F10 also added a net that ended older sessions when the SSH server logged a refused port. The pre-publication code review's bug reviewer found, and a validator confirmed, that unauthenticated input could produce that log line, so F11 removed the net before publication; the tunnel end now decides nothing from that log ([security-posture.md](../security-posture.md#fixed-before-publication)). The runbook's case for ports a dead session holds is a restart of the tunnel end's SSH server container, as on the night.

## The eval that would have caught it

- **F9:** `deploy/hosts/test_reply_route.py` now models the host as `ip` reports it, with `networkctl reconfigure ens5` losing the address as it did that night, and `test_nothing_after_the_first_boot_reloads_or_reconfigures_networkd` holds that nothing reconfigures networkd after the first boot. Before F9, the tests pinned the commands that caused the outage.
- **F10:** `deploy/tunnel/test_tunnel.py::test_a_dead_peer_with_data_outstanding_ends_in_under_two_minutes` holds the kernel's bound on the tunnel end's container.
- **Neither class is caught before prod** until a release runs on a real host first: the review's R23 (an ephemeral rehearsal cell) and R29 (releases staged by host class, with a rollback for the cloud hosts), both open.

## Follow-up intent

None written yet. F9, F10, and F11 were bug fixes against spec 001's existing requirements. The candidates for an intent are in the [security posture page's backlog](../security-posture.md#the-ranked-backlog): R23, R29, R11 (a ledger of hand fixes and a weekly drift check), and R04 (an alarm when no host serves inside the hours).

## Open questions

- Who or what stopped EC2 near 01:00Z: not established ([2026-11-18-ec2-capacity.md](2026-11-18-ec2-capacity.md)).
- Why networkd's live reconfigure failed where the boot succeeded (f9.md, F9-3).
- Why the SSH server's client-alive check didn't end the dead session (f10.md, F10-2).
- Why the laptop's Windows froze while its prod stack was being taken down (runbook).
