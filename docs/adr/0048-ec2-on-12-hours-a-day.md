# ADR 0048: EC2 on 12 hours a day, 7am to 7pm Mountain time: two schedules that invoke the start function and the guard, and the hours as a check in both

Status: proposed, 2026-11-12 · Spec: 001 (FR-021, FR-065, FR-069, FR-071, SC-001; spec.md Assumptions, "EC2 on 12 hours a day" and "From W1 to W2"; Clarifications, Session 2026-11-12; plan.md §16, "EC2 on 12 hours a day"; research.md R-04, R-05, R-15, R-29, R-30; tasks.md T116, T117, T119, T124, T168, T169) · Extends [ADR 0027](0027-ec2-on-spot-the-start-function-and-the-guard.md)'s decision 1, as amended on 2026-11-11, which stands otherwise · Accepted when the Author merges W1 (tasks.md T172), after his answers to the regrouping note's questions 1a, 2, and 3

## Context

The session priced the month at about $49 with EC2 on spot around the clock (research.md R-05). Asked for the server budget's figure, the Author answered, verbatim:

> "$45, with 12 h a day"

Told that the twin then rests for the other 12 hours unless the laptop serves, and that fixed hours can be learned, he confirmed:

> "Keep 12 h a day, $45"

That reverses question 15's "Spot, around the clock (Recommended)", and FR-069's rule that the schedule stays in reserve until a measured month passes the budget. FR-069 requires that the schedule "arrive only by the Author's patch, with an ADR". This is that ADR.

Asked which 12 hours, he answered on 2026-11-12, verbatim:

> "12 hours, from 7am to 7pm Mountain Standard Time"

Question 15's recommendation gave a reason against a schedule: "it keeps one way of starting and stopping EC2, so a schedule never fights the start function". This decision keeps that property. The schedule only invokes the two functions that already start and stop EC2.

## Decision

1. **The hours: 07:00 to 19:00,** in the zone the Author's answer to question 1a names:
   - `America/Denver`, the local clock with daylight saving: 7am to 7pm all year (recommended). In UTC, 14:00 to 02:00 in winter, and 13:00 to 01:00 in summer.
   - `Etc/GMT+7`, a fixed UTC−7 all year (the IANA name's sign is inverted): 14:00 to 02:00 UTC, which by the summer clock is 8am to 8pm.

   They're one local, `local.ec2_hours`, in the protected `infra/account/handover.tf`. It feeds both schedules and both functions' environment, so the hours change only by his patch. Nothing else holds a copy: if the site states the hours (question 1b), it reads them from the schedules (tasks.md T170).
2. **Two schedules** (EventBridge Scheduler, `schedule_expression_timezone` set to that zone, in `infra/account/handover.tf`):
   - `h4-ec2-hours-open`, at 07:00, invokes `h4-ec2-start` with `{"from": "hours_open"}`;
   - `h4-ec2-hours-close`, at 19:00, invokes `h4-ec2-guard` with `{"from": "hours_close"}`.

   Their role, in `iam.tf`, may invoke those two functions and nothing else. Neither schedule calls EC2's API.
3. **The start function refuses outside the hours,** with `outside_hours`, on every automatic trigger: the alarm's change, the tunnel end's return, and the open schedule. For the Author's own `make ec2-start` and `make ec2-autostart STATE=on`, the refusal is provisional. It stands until his answer to question 2, which may let a hand start run outside the hours. Its checks, in order:
   1. `paused`, while the autostart switch is `off`;
   2. `outside_hours` (for a hand start, provisionally, as above);
   3. `server_budget_stopped`;
   4. `tunnel_end_down`;
   5. `laptop_serving`, when invoked by hand, `from: tunnel_end_back`, or `from: hours_open`, read from the alarm `h4-laptop-away` by its name-built ARN (research.md R-15, amended);
   6. the start of the instance `/h4reet/prod/ec2-instance-id` names, or `start_failed` with AWS's code.
4. **The guard stops EC2 outside the hours,** `ec2_stopped_outside_hours`:
   - on `h4-ec2-running`, as after AWS's restart once spot capacity returns;
   - at `hours_close`, if EC2 runs. If it is already stopped, the guard writes its log line and nothing else.

   Its other three stops stand: the laptop serving, the switch `off`, and the server action. So does its stop of a tagged instance the parameter doesn't name (contracts/handover.md §4, amended).
5. **The autostart switch and the server action keep precedence,** inside the hours too. The schedules never write the switch, and nothing writes configuration at run time, so a plan after a scheduled start or stop shows no change (FR-072).
6. **Spot stays.** EC2 is the same persistent spot request, stopping on interruption (R-04, R-30). The hours bound when it may run.
7. **Where it arrives:**
   - the schedules, their role, and `local.ec2_hours` are in protected files, so they come in the Author's P-I6 (FR-069; tasks.md T124);
   - the functions' checks are agent code, test-first (tasks.md T116, T117);
   - all of it is switched on in W2 with the functions' digests (plan.md §16, "Four gates").

## Alternatives considered

- **Schedules that call EC2's API directly** (Scheduler's universal target, `ec2:startInstances` and `ec2:stopInstances`): fewer parts. Not chosen. It's a second way to start EC2, one that skips the autostart switch, the server action, the tunnel end's check, and the laptop's: the fight question 15's recommendation named.
- **A schedule that writes a parameter the functions read,** `in` or `out` of the hours: no time zone in the functions. Not chosen. A run-time configuration write goes against FR-072.
- **An Auto Scaling group's scheduled actions, or AWS's Instance Scheduler:** not chosen. Each needs an Auto Scaling group, or a solution's own stack, for one instance.
- **The hours in a parameter the Author writes, out of the repository:** not chosen. The schedules' expressions are Terraform's either way, so the hours are in the repository, as question 15's option B said: "The hours sit in a public repository".

## Consequences

- **Named deviation** (spec.md Assumptions, "EC2 on 12 hours a day"): it reverses question 15's answer and FR-069's reserve.
- **From W1 to W2** (spec.md Assumptions, "From W1 to W2"): the schedules arrive with the functions, in W2. Until then, W1's apply makes EC2 stopped, and it starts only by the Author's hand, inside the hours, for W1's checks.
- **Outside the hours, with the laptop off,** every dynamic request gets `no_host_serving`, the room shows `cannot_talk.resting`, and the public view says no host serves. SC-001's exception, "EC2 stopped on purpose", covers it.
- **The spec changes by name** (tasks.md T169), once questions 1a, 2, and 3 are answered:
  - FR-065: the start function's refusals gain the hours;
  - FR-069: what starts and stops EC2 gains the two schedules, which act only through the functions;
  - FR-070's reading: the functions read the alarm and the instance's parameter by name;
  - FR-071: the guard's stops gain "outside its hours";
  - Degraded Modes: a row for EC2 outside its hours.
- **Alerts:** under FR-065 as written, each scheduled start and stop alerts on both channels, about two alerts a day. Question 3 asks whether routine ones should.
- **A start that fails at the window's start** (for example, no spot capacity, `start_failed`) is one attempt, as every start is. EC2 stays stopped until the next trigger, AWS's start under the persistent request once capacity returns (to confirm), or the Author's `make ec2-start`.
- **Cost:** research.md R-05's 12-hour lines, `t4g.large` on spot at about $8.70 to $13.00 a month, with its address charged only while it runs, from trackers, to confirm in tasks.md T167. The two schedules and about 60 invocations a month are inside Scheduler's and Lambda's free tiers (to confirm).
- **Public:** the hours and their zone are in Terraform, so they're public with the repository at publication. Whether the site states them is question 1b. A published zone, and hours stated on the site, both point to the Author's time zone; that is his to weigh.
- **To confirm:**
  - in the plan, that Scheduler takes the chosen zone's name;
  - in the functions' tests, that their base carries the time-zone database `America/Denver` needs (`Etc/GMT+7`, a fixed offset, needs none);
  - in the rehearsal, that `StartInstances` starts a stopped persistent spot instance, and that AWS doesn't start it again on its own after the guard's stop (research.md R-30).

## Links

- Spec: [001](../../specs/001-cloud-elevation/spec.md) (Assumptions; Clarifications, Session 2026-11-12) · Plan: [§16](../../specs/001-cloud-elevation/plan.md#16-order-of-work-risks-and-proof) · Contract: [handover.md](../../specs/001-cloud-elevation/contracts/handover.md) · Note: [2026-11-13-spec-001-w1-regroup.md](../merge-requests/2026-11-13-spec-001-w1-regroup.md)
- Related: [ADR 0027](0027-ec2-on-spot-the-start-function-and-the-guard.md) (decision 1 extended), [ADR 0044](0044-ec2-as-prods-default-host.md) (accepted), [ADR 0047](0047-one-account-shared-with-other-work.md), [ADR 0049](0049-what-names-an-instance-lives-in-its-root.md) (proposed).
