# How we build: the night shift

The night shift is how agents keep working while the Author sleeps. A supervisor session reads a queue and starts up to ten worker sessions. Each worker takes one task, in its own git worktree, inside its own container. Anything that needs a human becomes a question on one decision page in the morning, with a recommended answer. The Author merges. The night never does.

This page explains how it works and why each piece is where it is. The decisions are in [ADR 0050](../adr/0050-containers-around-every-agent-session.md), [ADR 0051](../adr/0051-agents-plan-and-run-the-gate.md), and [ADR 0052](../adr/0052-the-studio-line.md). The spec is [017](../../specs/017-the-night-shift/spec.md), the plan is [plan.md](../../specs/017-the-night-shift/plan.md), and the research, with each probe's runs, is [research.md](../../specs/017-the-night-shift/research.md). The Author's operations are in the [night-shift runbook](../runbooks/night-shift.md).

**Status.** The Author approved the plan on 2026-11-12 ("Approve, all recommended"), after the container probe passed. The build is on `feat/017-the-night-shift`. The install, and the Author's rehearsal of it, come after the build's review and his run. The night shift has no runtime: the site has no agents, no visitor's byte moves, and no data-flow disclosure entry is needed (spec 017, Data-Flow Disclosure).

## The short version

- **One wall per concern.** A session can't read the Author's secrets, reach the Docker socket, write the main branch, or connect anywhere but an allowlisting proxy, because those things don't exist inside its container. That is a mount, network, and capability statement, not a prompt.
- **One process holds the keys.** A small runner, outside every container, is the only thing that starts containers or uses the Docker socket. Sessions ask it for things in files.
- **Agents do more, the Author decides.** Agents may ask for a `terraform plan` through a read-only role, and for a gate run from his checkout of main. They can't apply, merge, or change the gate's code. Both wait until the Author's patches merge.
- **Nothing is lost at a limit.** Every step begins with a commit on the worker's own branch. A weekly usage limit stops work at a save point, and the runner waits once, to a stated reset time, then resumes. There is no hourly poll.
- **The morning is one page.** Each question appears once, with a recommended answer and the task it blocks. Each finished stack shows its branch, tip, note, and gate.

## The layers

```text
the Author's terminal
└─ runner (night.py): the only process outside every container,
   the only user of the host's Docker socket
   ├─ h4-night (internal: no route out)
   │   ├─ egress           the agents' engine's egress proxy, with the night's allowlist
   │   ├─ engine-fwd       forwards to the agents' engine's one opening, for three roles only
   │   ├─ supervisor       reads the queue, asks for workers, writes the page
   │   └─ workers, at most ten: spec-writer, implementer, reviewer, red-teamer, ops, gate-runner
   │        each: its worktree, its own branch's git objects, its Claude folder, its io folder
   ├─ h4-night-studio (internal)
   │   ├─ egress-studio    Anthropic's API only
   │   ├─ studio           Claude Code and headless Blender, on the GPU
   │   └─ comfyui          started by the studio's request, on the GPU, his install read-only
   └─ h4-night-plan (internal), only while a plan runs
       └─ plan             the commit's infra_plan.py, with one-hour read credentials
```

Each container's spec is one JSON file. A child's spec may hold no mount, network, device, or capability its parent lacks. The "parent" is a policy relation: a ceiling, computed as the union of the specs, sits above the roles. The supervisor and ops sit directly under the ceiling. The implementer sits under ops, the spec-writer and red-teamer under the implementer, and the reviewer under the spec-writer. The gate-runner and the studio stand alone under the ceiling. A test checks every edge (FR-010).

### What each wall stops, and what it doesn't

| Wall | What it stops | What it doesn't stop |
|---|---|---|
| Mounts | Reading `~/.aws`, `~/.ssh`, the gateway's keys, the Author's `~/.claude`, the studio's likeness folder and key, and the Docker socket. Writing `.git/hooks`, `.git/config`, `refs/heads/main`, or any path main's settings deny. | Writing the worktree's own files, and writing the task's own git objects, which is the accepted risk in ADR 0050. |
| Network | Any connection that isn't through the proxy. The proxy refuses hosts not on the night's allowlist, and IP literals. | Anything the allowlist permits, which today is Anthropic's API and the toolchain's mirrors. |
| Capabilities | Privilege inside the container: all capabilities dropped, no new privileges, a read-only root with a temporary folder. | Mistakes inside the worktree. |
| Sign-in | API billing: no session has a billing credential to find, and Claude Code is set to refuse one (managed settings). | A session printing its own token. This is a named gap (ADR 0050). |
| Hooks, permissions, bash gate | Everything they stopped before. | Nothing is removed; these stay in every session. |

Claude Code's own sandbox is off inside a night container, because it can't start there (research R-18). The container is the boundary. Where the sandbox does start, it stays on as a second layer.

## A session's life

1. **Queue.** The Author queues tasks in `queue.json`, in the supervisor's worktree. The runner validates the file on each change: each task's role, spec, base, branch, locks, and dependencies. A refused file keeps the last good one and puts one line on the page, naming the field (contracts/queue.md).

2. **Preflight and start.** `night.py start` checks, before anything runs: each live spec's SHA-256 against the install's record; each image's ID; the token file's mode and shape; that the runner's own environment holds no API-billing variable; that the networks exist and are internal; the facts file; that the repository holds no ref that could shadow main; disk and memory. Only then does it start the egress proxy, the engine forwarder, and the supervisor.

3. **A worker starts.** The runner makes the task's worktree under the Author's home, on `night/<task>/<slug>`, outside any container. It then runs `docker run` with the role's spec, which the tests check line by line. The mounts are the task's own: the worktree read-write; `.git` read-only, with read-write only the task's objects, its worktree admin folder, and its branch's refs and logs; read-only masks over the paths main's settings deny. The worker starts `claude -p` with its role's settings layer.

4. **Save points.** Before each step, the worker commits `wip(<task>): <step>` on its own branch. The runner never commits for a session. If a session ends with uncommitted changes, the runner records that on the page.

5. **Requests.** A session can't start anything. To ask for a plan, a gate run, or ComfyUI, it writes a small JSON file to its out folder. The runner answers in its in folder. A request holds only the keys its kind allows; any other key refuses it. The plan and gate answers are "off: waiting for P-2, P-3, P-6" until the Author's patches merge (ADR 0051).

6. **Ending.** A worker ends when its stream reports a result or its container exits. Two other endings stop it: an idle stop, when its stream has been silent for 15 minutes with a clean worktree, no pending request, and only idle processes left; and a limit stop, below. The runner records either.

7. **Naming a stack.** When the supervisor marks a task done in `queue.json` and gives it a branch name such as `feat/NNN-…`, the runner names that branch at the task's tip, outside any container.

8. **The page.** The supervisor commits `docs/night-shift/<date>.md` on `night/supervisor/<date>` at each save point. The runner appends its own lines under "The runner" and nothing else. The page has five sections: questions, stacks, interruptions, requests, and the runner's lines (contracts/decision-page.md).

9. **Morning.** The Author reads the page, answers the questions, and merges the stacks himself, with the merge command in the merge-request note. The gate runner prints each gate's merge line; it doesn't run it.

## Locks

Three exclusive locks are `flock(2)` files in the runner's state folder, which no session can write:

- **matrix**: held by any task whose queue entry declares it, so two such tasks never overlap (FR-019). The spec leaves which tasks declare it to the queue's author.
- **gate**: one gate run at a time. A gate request takes it unless its own task already holds it, and a second request is answered "the gate lock is held".
- **gpu**: ComfyUI and Blender jobs. Before a GPU task starts, the runner reruns the disk and memory check, and a failure leaves the task queued with the reason on the page (FR-031). ComfyUI is stopped when its task ends.

A task that needs a lock starts only while it holds the lock. At most ten workers run at once, or fewer when the Author's facts file sets `NIGHT_WORKERS` (his Q14 answer was 4), and their starts are staggered by ten seconds (FR-018; contracts/runner.md §3). The night's work comes from his `orders.md`, which the runner gives the supervisor word for word (FR-036). The two-holders-never-overlap property is SC-005.

## The weekly-limit wait

The Author's decision 3, in his words:

> "Let's do 10 agents, and turn off the hourly rate limit check, we only have weekly rate limts now and not hourly ones"

So there is no poll. The mechanism:

1. The runner recognises Claude Code's own limit message. The message's text isn't documented, so the matcher is one named pattern (`LIMIT_TEXT`), and it counts only Claude Code's own result or synthetic events, never a tool's output or the model's words. The first real limit confirms the text.
2. It reads the reset time from the message.
3. It stops every container at its last save point.
4. It sleeps once, until the reset plus five minutes. That sleep is the runner's only timer.
5. It requeues the running tasks from their branches' tips, the supervisor first.

It doesn't wait when it can't read a usable time. A reset that's already past, or more than eight days ahead, stops the night and says so on the page. So does a second limit within ten minutes of resuming. Three sessions failing within 120 seconds also stops the night, since that usually means a limit the matcher missed, and the queue shouldn't be burned through.

Extra usage is never accepted. The headless runs can't accept it, and the Author keeps extra usage off in his account (plan.md §5).

## Sign-in

Each session signs in with a token from `claude setup-token`, which the Author makes once for the night shift. The token draws on his Claude plan, not on API credits. Three things make that hold:

- **No billing credential is in any container.** The runner sets each container's whole environment, and refuses to start one holding an API key, an auth token, or a cloud-provider switch.
- **Managed settings in every image** set `forceLoginMethod` to `claudeai` and blank the two key variables. The probe showed that a session with a stand-in key answered on the night-shift token and used neither.
- **No session runs with `--bare`**, which would ignore the token.

The token is the one secret a session can read. A command a session runs can print its environment. The bounds are that the token is revocable on its own, signs in only on the plan, carries no AWS or repository power, and can reach only the allowlist's hosts (plan.md §13; ADR 0050).

## What stays the Author's

Agents build all of this and can't do the following. The runbook has the steps.

- **Merges.** Every merge, including the night's stacks. The night never merges, and a passed gate prints a line for him to run.
- **Applies.** Every `terraform apply`, and the apply of the plan role's IAM. The plan role can read and lock state, and nothing else.
- **The token and the sign-in.** Making, renewing, and revoking the night-shift token, and his own sign-in. Turning extra usage off.
- **The facts file.** It holds his paths, his user IDs, and his plan's profile name. It never enters the repository.
- **Installs.** The install is one script that he runs, from a reviewed commit: "Agent builds, you run one script". The first install also needs `/srv/studio/outputs` emptied by him.
- **The first push.** The repository has no remote, and the Author pushes it to GitHub himself before the first night. The push may amount to publication under ADR 0013, and that decision is his (Q17).
- **Studio installs and approvals.** New weights and new custom nodes, his look approval of each asset, and his photos and key.
- **Protected paths.** Changes to `.claude/**`, `CLAUDE.md`, `REVIEW.md`, and the constitution come only as his patches (P-1 to P-10), including `deploy/night-shift/` once P-1 merges.
- **Answers.** Every question on the page. The recommended answers are the session's, and he confirms or overturns them.

## Open questions and what we can't yet prove

- **The limit message's text.** Unconfirmed. The first real limit confirms the matcher; until then, three quick failures stop the night rather than burn the queue.
- **Consumer terms.** Whether ten unattended sessions at once fit Anthropic's consumer terms isn't settled. The approved answer is that the Author confirms the terms himself, or asks Anthropic, and the first pilot runs two or three workers (plan.md Q14).
- **The plan role's reach.** Whether AWS's managed read-only policy covers every data source the roots read is unconfirmed (R-06). The first plan under the role says so.
- **ComfyUI's `--birefnet`.** Unconfirmed as a core flag. The first studio task checks that ComfyUI accepts it at launch (Q15).
- **Answering the page.** The contracts don't define how an answer to a question reaches the next session. Until they do, the Author answers in the session's next prompt.
- **The first queue file.** The contracts say where `queue.json` lives, in the supervisor's worktree, and not how the first one gets there. That is for the first night's runbook.
- **Two reversals the spec doesn't name.** ADR 0015 and ADR 0018 are amended for the night's containers (ADR 0050). Spec 017's Assumptions should name them too; that's a spec change for the Author's review.

## Testing

The night shift's tests run without a Docker engine, and the Author's probe and rehearsal are its integration tests.

- **Specs and lattice.** Every spec's mounts, networks, devices, and capabilities are checked against its parent. Every never-mounted path, and each of its ancestors, is checked against each spec. The masks are computed from main's settings, so they follow main.
- **Runner.** Each role's `docker run` line is built and checked against the contract, with a stub `docker`. Queue validation, scheduling, locks, the limit's sleep, the idle stop, the preflight, requests, and the page are each tested on a fake clock.
- **Studio line.** Brief and candidate cases, the round rule, and the arrival check's step, on fixture GLBs built in the test.
- **Install and probes.** Run against stub `docker`, `git`, and `claude` binaries with a fake home. A planted secret must not appear in any output.
- **Red-team rows.** Each refusal in FR-011 to FR-016 and FR-027 has a row for each spelling in CLAUDE.md's list, including symlinks and hard links, and the rehearsal runs the rows marked for it.

The check that matters most is the rehearsal on the Author's machine: a session signs in on the plan, an API key makes it refuse to start, and every forbidden read, write, and connection is refused.

## Where to read next

- [Spec 017](../../specs/017-the-night-shift/spec.md): the requirements, the Author's words, and the Assumptions, with each deviation named.
- [Plan](../../specs/017-the-night-shift/plan.md): the layers, the lattice, the runner, the probe, the install steps, and the patches.
- [Research](../../specs/017-the-night-shift/research.md): the nono evaluation (R-01 to R-14) and the container runs (R-18).
- [Contracts](../../specs/017-the-night-shift/contracts/): the containers, the runner, the probes, the install, the queue, the decision page, and the studio line.
- ADRs [0050](../adr/0050-containers-around-every-agent-session.md), [0051](../adr/0051-agents-plan-and-run-the-gate.md), [0052](../adr/0052-the-studio-line.md).
- The lifecycle this follows is [lifecycle.md](lifecycle.md). The threat model it was sized against is [threat-model.md](threat-model.md).
