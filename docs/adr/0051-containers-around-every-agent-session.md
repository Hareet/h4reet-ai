# ADR 0051: Containers around every agent session, after nono on WSL2

Status: proposed, 2026-11-12 · Spec: 017 (FR-010 to FR-016, FR-036 to FR-038, FR-041; spec.md Clarifications of 2026-11-12, Assumptions "The brief's nono, replaced by containers" and "The live container specs outside the repository", and Edge Cases "Claude Code's own sandbox won't start inside the container"; plan.md §1, §2, §11, §13) · **Reverses ADR 0015's "never the host's" for the night's session containers, and amends ADR 0018's "under the full sandbox" for those containers.** The spec does not name either ADR; this one does. Accepted when the Author merges `feat/017-the-night-shift`, which is also his acceptance of both amendments.

## Context

**In plain terms.** The night shift lets Claude Code sessions work unattended. A supervisor session reads a queue, and up to ten worker sessions each take one task in their own git worktree of the Author's repository. Those sessions run commands, so the limits on what they can read, write, and reach must hold when a text rule misses.

Until now those limits came from four places: the hooks, the bash gate, the project's permission rules, and Claude Code's own sandbox, which wraps each Bash command (research R-08). They are sound for a session someone watches. For an unattended one, the spec asks for a boundary that holds when a text rule misses (spec 017, User Story 2).

**The walls agents hit today.** The same walls also stop legitimate work, which is why the night shift needs more reach, not less. An agent can't run `terraform plan` or the clean-room gate itself, and asks the Author instead (CLAUDE.md, the Infra line and the Verifying line). An agent's container work goes through the agents' engine's relay, and the Author runs anything on his GPU or his host's stacks. This session's own sandbox blocks the Docker socket and denies github.com (plan.md, Constraints; research.md, opening note). The night shift has to move some of those walls for the agents and keep the rest exactly where they are.

**The brief's design, and what the probes found.** The Author's brief asked for nono (nono.sh), a kernel sandbox, around every session: Claude Code's sandbox nested inside it, nono's own grants for each role, and a plan-only profile. Before anything was built, the Author asked that the nesting be tested first and that the session stop if it failed:

> "If nesting fails, let's stop quickly and let me know as we need another approach, i believe this is referring to nono and claude sandbox nested inside that, Let's test that out first before iterating on the whole workflow."

The nesting failed. The brief's other two walls didn't hold on this machine either: the Docker socket connected from inside nono, and host filtering on WSL2 needs an insecure opt-in that the probe didn't test (the evaluation below). The Author then chose containers:

> "Yes, let's re-plan around containers and ensure setup-token can work with the Subscription Ultra Plan and doesnt require API credits"

**Reading (the session's):** the walls move from nono's kernel rules to the container's mount namespace, network, and capability set. Each session signs in with a token that draws on the Author's plan, and fails closed on any API-billing credential. nono is not installed and the night shift doesn't use it. Its evaluation stays here, and in research R-01 to R-14.

## Decision

1. **A container per session, started by the runner.** There are eight role specs (supervisor, spec-writer, implementer, reviewer, red-teamer, ops, gate-runner, studio), plus two runner-only specs, one for a `terraform plan` run and one for ComfyUI (plan §2). Every container runs as the Author's user, with all capabilities dropped, `no-new-privileges`, a read-only root with a temporary `tmpfs`, and memory, CPU, and process limits. A child spec may hold no mount, network, or capability its lattice parent lacks, and a test proves it (FR-010; contracts/containers.md §9).

2. **One process outside every container: the runner (`night.py`).** Only the runner uses the host's Docker socket, and no container mounts it (FR-038). A session never starts a container. It writes a request file in its own io folder, and the runner answers in a file beside it (contracts/runner.md §5).

3. **The narrow `.git` mount (FR-012).** A worktree mounts read-write. The repository's `.git` mounts read-only, with read-write only the parts one task needs: `.git/objects`, the task's own worktree admin folder, and its own branch's refs and logs. Read-only binds sit over `objects/info` (the alternates) and over the worktree's `commondir`, so a session can't steer git through either. Read-only binds also sit over every path that main's settings deny writing, which the runner reads from `refs/heads/main` at each start. Hooks, config, `HEAD`, the index, `refs/heads/main`, and the tags stay read-only under the read-only `.git`. Reviewer and red-teamer containers mount the worktree and `.git` read-only, so they have no write path into the repository (the red-teamer has a temporary `tmpfs` of its own).

   No session container mounts `~/.aws`, `~/.ssh`, `~/.config/h4reet-ai/`, `~/.config/gh`, `~/.git-credentials`, `~/.docker`, the Author's `~/.claude` and `~/.claude.json`, `/srv/studio/photos`, `/srv/studio/key`, the Docker socket, or the main checkout's working tree (contracts/containers.md §3). Of the session containers, only the studio's mounts `/srv/studio/outputs`. The runner-only ComfyUI container also mounts it, as its output folder (plan §2). FR-011 names the studio alone, so this is a small gap between the spec and the plan, recorded here.

4. **Internal networks, and the proxy as the only way out.** Each session's network is a Docker network made internal, with no route out. The night's egress proxy is the agents' engine's own `egress-proxy.py`, run in a container with the night's allowlist (main's `allowedDomains` plus Anthropic's API). It is a session's only way to a host. The agents' engine is reached only through `engine-fwd`, a forwarder to that one opening, and only by the three roles that run containers (implementer, red-teamer, ops). ComfyUI is reachable only on the studio's own internal network. The networks are `h4-night`, `h4-night-engine`, `h4-night-studio`, and `h4-night-plan`. The egress containers also join one ordinary network, `h4-night-out`, so the proxy can reach the outside.

5. **Sign-in on the Author's plan, never on API credits.** Each session signs in with a token from `claude setup-token`, which the Author makes once for the night shift (FR-036). The token file sits outside the repository, at mode 0600. The runner passes it to a container only as an env file at start. Each role has its own Claude folder, so no session reads or writes the Author's `~/.claude` (FR-036). The runner starts no container whose environment holds `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, or `CLAUDE_CODE_USE_FOUNDRY`. No session runs with `--bare`, which ignores the token (FR-041).

6. **Managed settings, the second layer.** Every image carries `/etc/claude-code/managed-settings.json`, read-only, holding exactly this (FR-041):

   ```json
   {"forceLoginMethod": "claudeai", "env": {"ANTHROPIC_API_KEY": "", "ANTHROPIC_AUTH_TOKEN": ""}}
   ```

   The probe's third run showed Claude Code answering on the night-shift token with a stand-in key and a stand-in auth token each set, and using neither (research R-18). A `--settings` layer didn't hold on the second run, and `forceLoginMethod` alone was ambiguous on the third, so the blanked variables carry the weight, and a test checks that every image carries exactly this file.

7. **Claude Code's own sandbox stays off inside a container.** It can't start there: its bubblewrap run fails, and the probe's third run said so (R-18). If the container probe ever shows it starting, it stays on as a second layer (FR-037). The hooks, the permission rules, and the bash gate stay in every session.

8. **Live specs outside the repository, an example inside.** The live container specs live in `~/.config/h4reet-ai/night-shift/containers/`, filled from the Author's facts file by the install and made read-only. The example copy, with each machine fact a placeholder, lives at `deploy/night-shift/containers/`. The Author's protection patch P-1 makes that path human-only when it merges. The runner refuses any spec outside the live folder, any spec with the example marker, and any spec with a leftover placeholder (FR-016). The Author's words: "Live copy stays outside, and we can have an example copy inside under a human-only path".

9. **The install reads only from a reviewed commit.** The install and the probes read each file with `git show <sha>:<path>` and run no code from a working tree (FR-003). The one repository code that runs outside a container is the runner, which the install puts in place from that same reviewed commit.

### The nono evaluation (the record)

The nono probe ran three times on the Author's machine, on 2026-11-12. Research R-14 records the second and third runs in detail. The first run's output is not in the research, and this ADR doesn't reconstruct it. Each finding below is the probe's result, cited to R-14, unless the row says otherwise.

| What the brief relied on | What the probe showed | Where |
|---|---|---|
| Claude Code's sandbox runs nested inside nono's. | No. Bubblewrap inside nono failed with "setting up uid map: Permission denied", while the same command starts outside nono. Claude Code inside nono never reached its sandbox; that run's verdict line was a probe bug, and the bubblewrap row answers the question. **Reading (the session's, not tested):** nono's Landlock rules refuse `mount(2)` to a process under them, and bubblewrap mounts, so the failure would recur on any kernel. | R-14, third run |
| nono mediates Unix sockets on WSL2. | No. The host's Docker socket connected from inside nono. Mediation needs a seccomp user-notification feature that returns EBUSY on WSL2 (a search extract; the probe's connect is the evidence). | R-08; R-14, third run |
| nono filters hosts on WSL2. | Not tested. nono's WSL2 page says its proxy modes are blocked by default and need an opt-in marked as insecure. | R-05, R-07 |
| A profile with explicit grants reads only those paths. | No. With explicit read grants only, `~/.aws/config` was readable, because nono's base added 55 system and group paths. | R-14, third run |
| The Claude Code pack can serve as a profile base without side effects. | No. `nono pull` of the pack installed a plugin into the Author's real `~/.claude`: it enabled the plugin in `settings.json`, merged two index files, wrote marketplace files, and linked a cache into the probe's folder. The Author removed it with `nono remove`. The third run's probe refuses to start while the plugin's files remain. | R-14, second run |

The container probe is the evidence that replaced it. It ran three times (R-18). The first run's egress proxy couldn't open its script, and the probe printed "running" without checking; that was fixed before the second run. The second run held every boundary row. The third run held every row of the second again, and its managed-settings variant answered on the night-shift token: **BOUNDARY holds, PLAN-ONLY yes.**

## Alternatives considered

- **nono with its insecure proxy mode on WSL2.** It would give host filtering. Rejected: nono names that mode insecure, the agent's other traffic could leave by a direct path (R-05), and the socket stays unmediated (R-08).
- **nono alone, with explicit grants.** Rejected by the third run: the Docker socket connected and `~/.aws/config` was readable (above).
- **Bubblewrap outside nono (the design's candidate A).** An outer user, mount, and network namespace, with an allowlisting proxy inside it. Rejected on the Author's machine. An unprivileged network namespace couldn't bring its loopback up ("RTNETLINK answers: Operation not permitted"), so a proxy inside it can't be reached from the sessions. The outer mask, a bind mount meant to hide the Docker socket, failed too (R-14, the facts list).
- **Claude Code's sandbox alone.** It is today's baseline, and it stays on wherever it starts (above). Rejected as the boundary: by the research's reading it wraps Bash commands (R-08), so a session's other tools and its hooks answer to permission rules alone. That reading is the session's and is not tested here.
- **Anthropic's reference devcontainer firewall, inside each session.** It needs `NET_ADMIN` and `NET_RAW` in the session's own container (plan.md §Complexity Tracking). Rejected: a session holding those can change its own network rules.
- **Sessions on the agents' engine, the rootless one.** Rejected for sessions: it runs as the agents' own user, which can't write the Author's worktrees and has no GPU (R-15). It keeps the containers `make check` runs.

## Consequences

- **This reverses ADR 0015 for the night's session containers.** ADR 0015, accepted by the Author on 2026-10-07, says agent sessions run containers "on their own disposable engine, never the host's". The night's session containers run on the host's own engine, the Author's, not the agents' engine. What makes that acceptable, as the design holds it: no session holds the socket. Only the runner, outside every session, uses it (FR-038). The rows that prove this are the probe's `no-socket` rows and the rehearsal's (R1 to R4, and the red-team rows that try the socket from `python3`, `socat`, and `docker -H`). ADR 0015's reason for refusing sessions the socket, "root-equivalent access past every sandbox file and credential deny", still stands for sessions. The Author's merge is his acceptance.
- **This amends ADR 0018 for those containers.** ADR 0018 decides that agent sessions run "under the full sandbox". Inside a night container Claude Code's own sandbox is off, and the container is the boundary; the hooks and the bash gate stay. Sessions outside the night shift are unchanged. ADR 0016's rootless engine is the same departure as ADR 0015's, and it is named here too.
- **Named gap: a session's own commands can read its token.** In a container, any command a session runs can print its environment, which holds `CLAUDE_CODE_OAUTH_TOKEN`. The bounds (plan.md §13): it is the night shift's own token, revocable without touching the Author's own sign-in (R-05); it signs in only on the plan; it carries no AWS or repository power; and the container's only way out is the allowlist, so it reaches only Anthropic's API. A gap row in the red-team suite records it (tasks.md T050). If Claude Code's sandbox ever starts inside a container, the planned denied-variable list (P-1) hides the token from its commands too.
- **Named gap: `.git/objects` is writable for writing sessions.** A session's mistake could delete or corrupt existing objects in a repository that has no remote (ADR 0013). The session recommended a per-task object store. The Author answered: "Let's accept the risk, and I will push up to github manually before we start these night shift agents". So the object store stays read-write as built, and his push before the first night is the copy outside this machine. The push, and any publication it amounts to under ADR 0013, are his.
- **Claude Code's own sandbox doesn't start in a container.** The session's understanding is that Docker's default seccomp profile refuses the new user namespaces bubblewrap needs (R-15). The probe's outcome confirms it (R-18). The container is the boundary either way. The matrix's stage S checks the sandbox's masks from inside, and some of its rows may need P-5.
- **The second layer was observed, not documented.** The managed settings' behavior is what the probe saw (R-18). The night shift does not rely on `forceLoginMethod` alone.
- **Cost.** No paid route is added. Sessions draw on the Author's plan, and extra usage stays off in his account, which is his step (plan.md §5). Ten workers spend the weekly allowance faster, and the runner waits for the reset rather than buying more (FR-021, FR-041).
- **Terms, open.** Whether ten unattended sessions at once fit the consumer terms is not settled by the session's reading of the docs. The plan's recommended answer, which the Author approved, is that he confirms the terms himself or asks Anthropic (plan.md Q14).
- **Degraded mode.** With no containers, or a failed rehearsal, agents run as they do today, under Claude Code's sandbox and the hooks (spec 017, Degraded Modes). If a boundary row fails in the probe or the rehearsal, everything stops and the session tells the Author (his Q8 answer).
- **Named deviation: the Development standard.** The constitution says Claude Code runs "under the project's committed permissions, hooks, and sandbox settings". Inside night containers the sandbox is off. The live specs also stay outside the repository (decision 4). Both are named in spec 017's Assumptions, and here.
- **The example copy is agent-editable until P-1 merges.** Until then, `deploy/night-shift/` is editable by agents. What keeps the example from running is the runner's refusal and the install's reads from `git show`, not the path's protection. A change to the example is reviewed like any other code.
- **Not yet proven on the Author's machine.** The install (task G4) isn't built yet. The rehearsal, R1 to R4, is the proof of this boundary. Until it passes, this ADR is a design the probes support, not a finished boundary.

## Links

- Spec: [017 spec](../../specs/017-the-night-shift/spec.md) (Clarifications, Assumptions) · Plan: [plan.md](../../specs/017-the-night-shift/plan.md) §1, §2, §11, §13 · Tasks: [tasks.md](../../specs/017-the-night-shift/tasks.md)
- Research: [R-01 to R-18](../../specs/017-the-night-shift/research.md); the nono evaluation is [R-14](../../specs/017-the-night-shift/research.md#r-14-the-probe), the container runs are [R-18](../../specs/017-the-night-shift/research.md#r-18-the-container-probes-runs-2026-11-12)
- Contracts: [containers](../../specs/017-the-night-shift/contracts/containers.md), [runner](../../specs/017-the-night-shift/contracts/runner.md), [probe](../../specs/017-the-night-shift/contracts/probe.md), [install](../../specs/017-the-night-shift/contracts/install.md)
- Reverses or amends: [ADR 0015](0015-agents-run-containers-on-their-own-engine.md) (for the night's session containers), [ADR 0016](0016-agents-engine-rootless-docker.md), [ADR 0018](0018-agent-sessions-on-wsl.md) (its first decision, for those containers)
- Related: [ADR 0013](0013-local-until-publication.md), [ADR 0017](0017-clean-room-gate-and-human-only-gate-paths.md), [ADR 0052](0052-agents-plan-and-run-the-gate.md), [ADR 0053](0053-the-studio-line.md)
- Merge-request note: `docs/merge-requests/`, written at the build's last group (G6); not yet written.
