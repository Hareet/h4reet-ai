# Runbook: the handover

One host serves at a time: the laptop while you run its prod, else EC2, inside its hours ([spec 001 contracts/handover.md](../../specs/001-cloud-elevation/contracts/handover.md); [ADR 0048](../adr/0048-ec2-on-12-hours-a-day.md), proposed). Route 53's check reads the laptop's health block through the tunnel end; its alarm, `h4-laptop-away`, wakes EC2 through `h4-ec2-start`; `h4-ec2-guard` stops EC2 when it runs and shouldn't; and your laptop's loop, `h4-handover`, stops EC2 once the relay serves the laptop. This page covers the start function's alerts, `ec2_started` and `ec2_start_refused` with its reasons, the guard's `ec2_stopped_laptop_serving` and `ec2_stopped_paused`, your own `ec2_stopped_by_author`, the loop's failed stop, the autostart switch, and the hours' open and close. The guard's other stops are [ec2.md](ec2.md)'s and [server-budget.md](server-budget.md)'s; `ec2_start_refused` (`tunnel_end_down`) is [tunnel-end.md](tunnel-end.md)'s.

## Symptoms

- **Telegram and the mailbox,** from W2 (the functions are W2's):
  - `[hareet.ai aws] ec2_started: EC2 started`, with `- trigger: alarm`, `manual`, or `tunnel_end_back`: the laptop went, you started it, or the tunnel end came back. At the hours' open (`hours_open`) a start is recorded and not alerted (provisional: the regrouping note's question 3, option A);
  - `[hareet.ai aws] ec2_start_refused (<reason>): EC2 not started`, the reason one of:
    - `paused`: the autostart switch is `off`;
    - `outside_hours`: outside 07:00 to 19:00 Mountain time (provisionally `America/Denver`, question 1a); for your own start too (provisionally, question 2);
    - `server_budget_stopped`: the server action has run and isn't reversed;
    - `laptop_serving`: by hand, on the tunnel end's return, or at the open, while `h4-laptop-away` reads `OK`;
    - `start_failed`: AWS refused the start, with `- code:` its code, `InsufficientInstanceCapacity` among them; or `untagged`, the instance `/h4reet/prod/ec2-instance-id` names doesn't carry `h4-prod-ec2`; or `unknown_trigger`;
    - with `- unread: <code>` when the step couldn't read what it checks, and refused for it: a failed read always alerts;
  - `[hareet.ai aws] ec2_stopped_laptop_serving` or `ec2_stopped_paused`: the guard stopped EC2 when it entered `running`; its `ec2_stopped_server_budget` is [server-budget.md](server-budget.md)'s;
  - `[hareet.ai aws] ec2_stopped_by_author: EC2 stopped by hand`: your stop target.
- **The loop, on the laptop:** `[hareet.ai aws] handover_stop_failed: the laptop's loop couldn't stop EC2…`, with `- step:` (`describe` or `stop`) and `- code:` (AWS's, or `timeout`), on both channels through `h4-alerts`, published with your h4-ec2-stop profile; the same line in `~/.local/state/h4reet/prod/handover.log`, and an `alert` line in `handover.jsonl` beside it. An expired session can't publish either, so then the log alone has it, and `make up ENV=prod` said so on its terminal when it started the loop.
- **The dashboard's Hosts row:** EC2's starts and refusals and the guard's stops, by outcome; the autostart switch; the health check; the handover window; the hours, with each scheduled start and stop.

## Impact

- **A refusal** leaves EC2 stopped. With the laptop off, visitors get `no_host_serving` and the room's resting message; the static site still loads (spec FR-066). Outside the hours, that is EC2 stopped on purpose (SC-001's exception).
- **`laptop_serving`** is the design working: the laptop serves.
- **The loop's failed stop:** the laptop keeps serving, and EC2 runs beside it until a stop works; its hours count against the server budget.
- **`start_failed` at the open,** no spot capacity: one attempt, as every start is. EC2 stays stopped until the next trigger: AWS's start under the persistent request once capacity returns (to confirm in T133's rehearsal), the laptop's next departure, or your start.

## Act

In your terminal, with your SSO session (`pf` your administrator profile, `sp` your h4-ec2-stop profile).

1. **Read the state:** `make ec2-status PROFILE=$pf` shows EC2's state and its spot request's, the autostart switch, the server action, the hours and whether it is inside them, and the relay's serving host.
2. **By reason:**
   - `paused`: set the switch on if EC2 should start automatically: `make ec2-autostart STATE=on PROFILE=$pf`, which also starts EC2 once, through the same checks. Each change of the switch is a line in `~/.local/state/h4reet/ec2-actions.jsonl`.
   - `outside_hours`: nothing to do; the open starts it at 07:00. A showing outside the hours runs on the laptop (provisionally, question 2). The hours change only by your patch to `local.ec2_hours` in `infra/account/handover.tf`, the one source the schedules and both functions read (ADR 0048).
   - `server_budget_stopped`: [server-budget.md](server-budget.md).
   - `start_failed`: with `InsufficientInstanceCapacity`, wait, or start it later with `make ec2-start PROFILE=$pf`; with `untagged`, [ec2.md](ec2.md)'s step after a replace; with an `unread` code, the function's role or the parameter changed outside Terraform, and the next account plan shows it.
   - the loop's `handover_stop_failed`: `make aws-login PROFILE=$sp`, then nothing else: the loop retries each minute. To stop EC2 now, `make ec2-stop PROFILE=$sp`.
3. **To start EC2 by hand,** inside the hours: `make ec2-start PROFILE=$pf`, which invokes the start function with `manual: true` and prints its outcome. In W1, before the functions exist, the EC2 console's Start, inside the hours ([ec2.md](ec2.md)).
4. **To stop it:** `make ec2-stop PROFILE=$sp`. It works from W1, since its permission set is on the tag.

## Verify

- `make ec2-status PROFILE=$pf` shows what you expect: `running` with the laptop off inside the hours and the switch `on`; `stopped` otherwise. While the relay sends visitors elsewhere, the loop leaves EC2 running: `handover.jsonl` has a `released` line, and the loop stops EC2 again only once the relay serves the laptop.
- After a takeover, `handover.jsonl` has a `window` line under 300 seconds (FR-063), and the dashboard's handover window shows it.

## Undo

- The switch: `make ec2-autostart STATE=off PROFILE=$pf` puts it back. It never changes Terraform: the parameter's value is ignored by plans (FR-072).
- A start you made: `make ec2-stop PROFILE=$sp`.

## Record

In the next merge-request note, or an incident note in `docs/incidents/` if visitors met `no_host_serving` longer than the handover's gap: the alert's first line, its trigger and reason, and what you changed. Never an instance's ID, the account's ID, or an address.
