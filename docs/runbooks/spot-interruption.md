# Runbook: EC2's spot interruption

EC2 is a persistent spot request that stops on an interruption ([spec 001 research.md R-30](../../specs/001-cloud-elevation/research.md#r-30-spot-with-interruption-behavior-stop-and-the-guard-new)). AWS warns two minutes before it stops it, and `h4-ec2-spot-warning` (`infra/prod/handover.tf`) sends the warning to `h4-alerts`. When capacity returns, AWS starts EC2 again, and the guard checks it. This page covers `spot_interruption`. The tunnel end's own warning, `tunnel_end_interruption`, is [tunnel-end.md](tunnel-end.md)'s.

## Symptoms

- **Telegram and the mailbox:** `[hareet.ai aws] spot_interruption: AWS will stop EC2 in two minutes`, with `- action: stop` and `- at:` the warning's time.
- **Two minutes later:** the dashboard's EC2 state reads `stopped`, its interruptions panel counts one, and, with the laptop off, the relay serves `none`.

## Impact

- **With the laptop off,** visitors get `no_host_serving` and the room's resting message until EC2 serves again; the static site still loads (spec FR-066). Nothing is lost: the stop keeps EC2's volumes, its data volume among them.
- **With the laptop on,** none: the laptop serves.
- **When capacity returns,** AWS starts EC2, and the guard stops it again if it shouldn't run: outside its hours (`ec2_stopped_outside_hours`, [ec2.md](ec2.md)), the switch `off`, the server action, or the laptop serving ([handover.md](handover.md)).

## Act

In your terminal, with your SSO session (`pf` your administrator profile).

1. **Nothing, at first:** the request is persistent, so AWS starts EC2 again when it can. `make ec2-status PROFILE=$pf` shows the instance's state and its spot request's (`State` `disabled` while AWS holds it, then `active`).
2. **If visitors need a host now,** start the laptop's prod: `make up ENV=prod`. The relay serves it within seconds of its third passing check.
3. **If capacity stays short for hours,** EC2 waits. A move to another zone is a reviewed change of `local.zone` in `infra/prod/main.tf`, as the tunnel end's runbook describes, and it replaces both instances.

## Verify

- The spot request reads `active` and EC2 `running` again (`make ec2-status PROFILE=$pf`), or the guard's alert says why it stopped it.
- The dashboard's relay panel shows the serving host back on `ec2` or `laptop`.

## Undo

Nothing to undo: AWS's stop and start change no configuration (FR-072).

## Record

For T133's rehearsals (SC-018), and any interruption visitors met: the warning's time, the stop's, the restart's, and the minutes with no host serving, in the next merge-request note or an incident note in `docs/incidents/`. Never an instance's ID or an address.
