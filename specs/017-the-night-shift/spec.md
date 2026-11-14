# Feature Specification: The night shift

**Feature Branch**: `spec/017-the-night-shift`

**Created**: 2026-11-12

**Status**: Draft

**Input**: `intent/017-the-night-shift.md` (draft, in the main checkout, uncommitted for the Author), the design page "The Night Shift" v4 (https://claude.ai/code/artifact/8928f6c0-c234-4931-a888-ebe31593a104), and the hand-off brief (https://claude.ai/code/artifact/5cc45a80-7337-4f72-8950-0af552729cad).

## The Author's words

These are settled. They are quoted as he gave them; the session's reading is beside each, never in its place.

- Decision 1: "Yes, let agents run terraform plan"
- Decision 2: "Let agents run tools/gates/gate"
- Decision 3: "Let's do 10 agents, and turn off the hourly rate limit check, we only have weekly rate limts now and not hourly ones"
- Decision 4: "Live copy stays outside, and we can have an example copy inside under a human-only path"
- Decision 5: "Your recommendation is fine here". The recommendation he accepted (the design page): the studio line decides everything up to intake (Blender, ComfyUI, and three revision rounds); new weights, new custom nodes, his look approval of each asset, and his photos stay his.
- On the studio: "the studio agent is running claude and having me manually use comfyui and run the pipelines, but since the twin is done and we are now just left with the asset creation with no likeness, we can let claude control blender and the pipeline"
- And: "i want the repo agents to be able to talk to the studio agents and complete the asset pipeline along with the code"
- On who installs: "Agent builds, you run one script"
- Standing rule (2026-10-12): the studio pipeline stays outside the repository; "Only the outputs should come in".

The design page dates decisions 1 to 5 2026-11-13; this session's clock reads 2026-11-12.

## Clarifications

### Session 2026-11-12

Questions this spec raised beyond his answers are on one page with a recommended answer each (plan.md §"Questions for the Author"). Under the brief ("batch any other question onto one page with a recommended answer"), the spec and plan take each recommended answer provisionally. **None of the answers below is his.** Each is the session's recommendation, which he confirms or overturns when he approves `plan.md`.

- Q: Where does the gate run from, since it refuses unless its checkout's HEAD is `refs/heads/main`? → A, **the Author's** (plan Q1, 2026-11-12): "It can use my checkout of main". Reading: the gate runs from his own checkout (`~/h4reet-ai/h4reet-ai`) while it is on main. No profile may write it. No separate gate checkout is made. Workers commit in their own worktrees, whose HEAD isn't main, so the bash gate's "HEAD is main" rule, which keys on the session's own project folder, doesn't stop them (FR-033).
- Q: How do workers sign in to Claude without holding the Author's own login? → A (provisional, recommended): **a token of their own**, made once by the Author with `claude setup-token`, kept by nono outside the repository, and passed to each worker as nono's environment credential. nono's proxy can't inject it on WSL2 without its `insecure_proxy` opt-in (research.md R-05). The settings patch hides the token's variable from every command the session runs. Each role gets its own Claude configuration folder, so no worker writes the Author's `~/.claude` (FR-036).
- Q: Where does the example copy live, and must the Author apply a patch before the first install? → A (provisional, recommended): **on the branch, at `deploy/night-shift/containers/`** (it was `profiles/` before the container answer), a path that his protection patch makes human-only when it merges. The install reads it by `git show` at the reviewed SHA, so it doesn't wait for the merge. The alternative was an existing human-only path, arriving only as his patch, with the install run from his patched branch (FR-016).
- Q: Does an agent's plan take the state's lock? → A (provisional, recommended): **yes**: the plan-only role may write and delete only the state's `.tflock` objects, so an agent's plan never races his apply (FR-032).
- Q: May the studio agent read `/srv/studio/outputs`? → A, **the Author's** (plan Q5, 2026-11-12): "i will remove all current files in outputs elsewhere, so the studio agent can read inside the directory and iterate on the creation of the remaining assets". Reading: once he has moved the current files out, the studio agent reads and writes `/srv/studio/outputs` as its working folder for the remaining assets. The first install refuses while the folder holds anything. Repo agents still can't read it (FR-027).
- After the probe's third run (the nesting fails; research R-14), asked whether to rebuild the sandbox inside nono or use containers, **the Author's words** (2026-11-12): "Yes, let's re-plan around containers and ensure setup-token can work with the Subscription Ultra Plan and doesnt require API credits". Reading: each session (supervisor, workers, studio) runs in its own container, started by the runner on his host's engine. nono is not installed; its evaluation stays in research R-01 to R-14 and in ADR 0051. Every session signs in with a `claude setup-token` token, which draws on his plan, and fails closed on any API-billing credential (FR-036, FR-041).
- Q17: writing sessions mount `.git/objects` read-write (FR-012), so a session's mistake could delete or corrupt existing objects in the Author's repository, which has no remote (ADR 0013). The session recommended a per-task object store, fetched into the repository by the runner with git's checks. → A, **the Author's** (2026-11-12): "Let's accept the risk, and I will push up to github manually before we start these night shift agents". Reading: `.git/objects` stays read-write for writing sessions, as built. Before the first night runs, the Author pushes the repository to GitHub himself, so its history has a copy outside this machine. The pilot's runbook carries that as his step, ahead of `night.py start`. The push, and any publication it amounts to under ADR 0013, are his.
- **The plan's approval** (2026-11-12, after the container probe passed): the Author chose "Approve, all recommended". So Q3, Q4, Q6, Q7, Q10, Q13, Q14, and Q16 take plan.md's recommended answers, and the build starts (T000). His own answers stand for Q1, Q2, Q5, Q8, and Q15.
- On ComfyUI, **the Author's words** (2026-11-12, after the probe's second run): "comfyui wasn't started, that needs to be launched and sometimes with parameters, so that should be done by the agents". Reading: the studio agent starts and stops ComfyUI itself, with the launch parameters a task needs, through a command policy (FR-040), under the GPU lock. Installing weights or custom nodes stays his (decision 5).
- Q: If Claude Code's sandbox won't start nested inside nono's, should the rehearsal continue with a fallback or stop? → A, **the Author's** (plan Q8, 2026-11-12): "If nesting fails, let's stop quickly and let me know as we need another approach, i believe this is referring to nono and claude sandbox nested inside that, Let's test that out first before iterating on the whole workflow." Reading: the nesting is tested first, by the probe, before anything else is built. If it fails, everything stops and the session tells him; no fallback layering is built unless he chooses one then (FR-037).

### Session 2026-11-13

- Q18, the night's commit identity → A, **the Author's**: "let's use "night-<role>@night-shift.h4reet-ai" as the commit author". Every role's `GIT_AUTHOR_EMAIL` and `GIT_COMMITTER_EMAIL` is `night-<role>@night-shift.h4reet-ai`.
- Q14, how many workers → A, **the Author's**: "Let's run 4". `NIGHT_WORKERS=4` in his facts file. The runner reads the cap from there, never from the queue, because agents write the queue. It defaults to 10 and takes 1 to 10.
- The night's work, **the Author's words**: "Okay, we want the night-shift, in order of importance, from the"improvements, in your words" section: a) "better HUD with examples provided, and load screen", c) "avatar walking leg animations", d) "dog modeled and brought in", e) "dinosaur modeled and brought in", g) "hareet-ai corpus from film scripts", "b) "re-do PDF resume with links from films", i) "dino being able to eat chunks of assets like desk, busy sign, laptop, chalkboard", h) "twin and dog running from dino" .... I will give you the examples of the HUD and placement of the interface layout, and provide you photos of my dog to model and it's okay that we use the likeness of my dog." Reading: the pilot is this list, in this order, not the Resume stream alone. The list reaches the supervisor through `orders.md`, beside his facts file, which no session can write. This answers the runbook's open question of how the first queue gets in. Items f and j stay parked.
- Q19 (telemetry) and Q20 (the 15 GB floor) keep their recommended answers, provisionally, until he says otherwise.

## Terms

- **nono**: the kernel sandbox the Author first chose (nono.sh). The probe showed that Claude Code's sandbox can't start inside it, and that on WSL2 it can't block Unix sockets or filter hosts (research R-14). It isn't installed; the night shift uses containers (the Author's answer of 2026-11-12).
- **Container spec** (formerly "profile"): a role's container: its image, its mounts (each read-only or read-write), its network, its environment, its capabilities, and its limits.
- **Live spec**: the copy the runner reads, in `~/.config/h4reet-ai/night-shift/`, outside the repository and readable by no session.
- **Example copy**: the container specs in the repository, with each machine fact a placeholder, under a path that becomes human-only. The install fills the placeholders from the Author's machine to make the live copy.
- **The runner**: deterministic code outside every container, installed by the Author's script from a reviewed commit. It alone uses the host's Docker socket, to start the supervisor and each worker in its role's container.
- **The egress proxy**: the agents' engine's own `egress-proxy.py`, run in a container on the night's internal network with the night's allowlist; a session's only way out.
- **Supervisor**: a Claude Code session in the supervisor's container that reads the queue, asks the runner to start workers, and writes the decision page.
- **Worker**: one Claude Code session per task, in one role, in its own worktree, in that role's container.
- **Studio agent**: a worker in the studio role, which drives headless Blender and ComfyUI's local API.
- **Brief**, **candidate**, **round**: the studio line's request, its answer, and one request-and-answer pass.
- **Save point**: a commit on the worker's own branch before each step.
- **Decision page**: the morning's questions, each with a recommended answer, and the night's finished stacks.

## Scope

**In scope**:
- The intent, this spec, the plan with three ADRs, the tasks, and the analysis.
- The probe scripts (the nono probe, done, and the container probe).
- The container specs and their images, the internal networks, the egress proxy's night allowlist, the engine forwarder, the example copy and its check, and the plan-only IAM role in `infra/`.
- The runner, the supervisor's prompt, the queue, the locks, save points, the weekly resume, stopping waiting workers, and the decision page.
- The studio line's schemas and checks, its folders, the three-round rule, and the weights and nodes list.
- Red-team rows proving each refusal.
- The patches for the Author's hand, and the install-and-rehearse script with `--undo`.

**Out of scope** (later specs or the Author's own steps):
- Moving the bash gate's text rules into the container specs (design page step 6). The gate stays as it is; this spec only adds the container boundary beneath it.
- The five workstreams' own specs (Room, Resume, Creatures, Corpus, Knowledge). The pilot is the Author's ordered list of 2026-11-13 (Clarifications), after the rehearsal passed.
- Any runtime change. The site has no agents.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The Author installs and rehearses the night shift with one script (Priority: P1)

The Author runs the container probe, then later reads and runs one install-and-rehearse script from a reviewed commit. The script builds the night shift's images from that commit, installs the live container specs and the runner read-only, and makes the internal networks. It starts one test session in a worker container, runs `make check` and the red-team suite inside it, and tries each forbidden read, write, and connection, expecting a refusal. It confirms the session drew on his plan and that an API key makes it refuse to start, then prints one summary with nothing secret. `--undo` removes what it installed.

**Why this priority**: nothing else runs until the container boundary is proven on his machine, and no agent may install it ("Agent builds, you run one script").

**Independent Test**: on a machine without the night shift, run the container probe (it leaves only its images), then the install script at a reviewed SHA, then `--undo`; the machine returns to its prior state, but for the images it names.

**Acceptance Scenarios**:

1. **Given** the night-shift token in its file, **When** the Author runs the container probe, **Then** it reports each row of FR-037 and FR-041, removes its containers and networks, and names the images it leaves.
2. **Given** the reviewed commit's SHA, **When** the Author runs the install script with that SHA and `--branch <name>`, and that branch's tip has moved, **Then** it refuses before doing anything, naming the two SHAs (G4's review, S9: `install.sh <sha> --branch <name>`).
3. **Given** a base image whose digest differs from the pinned one, **When** the script builds, **Then** it refuses and installs nothing.
4. **Given** a successful install, **When** the script rehearses, **Then** every forbidden read, write, and connection is refused; `make check` and the red-team suite pass inside the worker container; and the session signs in on his plan, while a stand-in API key or auth token in its environment is refused by the runner and, run anyway, is refused or neutralized by Claude Code (it refuses to start, or answers on the night-shift token with the stand-in unused), with no API call in an egress log the same step proved records calls.
5. **Given** any failed step, **When** the script stops, **Then** it prints one line naming the step and the reason, and the summary to paste back.
6. **Given** an installed night shift, **When** the Author runs the script again at the same SHA, **Then** nothing changes; **When** he runs `--undo`, **Then** the specs, the runner, the networks, and the images it built are removed, and nothing else.

---

### User Story 2 - Every agent session runs inside its role's container (Priority: P1)

The supervisor, each repo role, and the studio agent run in their own container, each holding no more than its lattice parent. The container refuses what it must: by what it mounts, read-only or not at all; by its network; and by the capabilities it drops. It sits beneath the hooks and the bash gate, which stay.

**Why this priority**: the night shift exists to let agents do more without the Author, and that is safe only if the boundary holds when a text rule misses.

**Independent Test**: for each role, a red-team row starts its container and tries each forbidden path, host, and socket, expecting a refusal; a test proves each spec is a subset of its parent.

**Acceptance Scenarios**:

1. **Given** any role's container, **When** its session reads `~/.aws`, `~/.ssh`, an env file, a Terraform state or plan file, `/srv/studio/photos`, `/srv/studio/key`, or `~/.config/h4reet-ai/`, **Then** the path doesn't exist in it.
2. **Given** the reviewer or red-teamer container, **When** its session writes anywhere in the repository, **Then** the write is refused (a read-only mount).
3. **Given** a worker's container, **When** its session writes outside its worktree, its temp folder, and its branch's refs and objects, **Then** the write is refused, `.git/hooks`, `.git/config`, `refs/heads/main`, and the settings' human-only paths included.
4. **Given** a child spec, **When** it is compared with its parent, **Then** every mount, network, and capability it holds is held by the parent.
5. **Given** any container, **When** its session connects anywhere but through the egress proxy (or, for the roles that run containers, the engine forwarder), **Then** there is no route; **and When** it asks the proxy for a host not on the night's allowlist, **Then** the proxy refuses.

---

### User Story 3 - The supervisor runs the night and leaves one page (Priority: P1)

The Author queues tasks and starts the supervisor. Through the night, the supervisor starts up to ten workers, each in its own worktree under the Author's home. It takes one lock each for the matrix, the gate, and the GPU, and a save point is committed before each step. At a weekly usage limit it stops at a save point and resumes after the reset, with no hourly poll. A worker that only waits is stopped. In the morning, one decision page lists each question with a recommended answer, and each finished stack with its note.

**Why this priority**: this is what keeps the Author out of the night: "so that only decisions and merges reach him".

**Independent Test**: on a queue of stub tasks with a stub worker, the runner starts at most ten at once, holds each lock exclusively, commits a save point before each step, sleeps once until a stated reset time, stops an idle worker, and writes the decision page.

**Acceptance Scenarios**:

1. **Given** fifteen queued tasks, **When** the runner starts workers, **Then** at most ten run at once.
2. **Given** two tasks that each need the GPU, **When** both are ready, **Then** one runs, and the other starts only after the first releases the lock.
3. **Given** a worker that reports a weekly usage limit with a reset time, **When** the runner sees it, **Then** it stops every worker at its last save point, waits once until the reset, and resumes from the save points, with no check in between.
4. **Given** a worker whose worktree is clean and whose session has written nothing for the idle limit, **When** the limit passes, **Then** the runner stops it and records why on the decision page.
5. **Given** a night with questions, **When** the night ends, **Then** the decision page lists each question once, with a recommended answer and the task it blocks.

---

### User Story 4 - Repo agents and the studio agent finish an asset together (Priority: P2)

A repo agent writes a brief. The studio agent drives headless Blender and ComfyUI's local API and writes a candidate to the handoff folder. The repo agent runs the intake's checks on a copy, and sends the exact failures back as the next round. After three rounds without a pass, the asset goes on the decision page. A passing candidate comes in through the intake on a branch, with its record, for the Author's look approval.

**Why this priority**: the Creatures stream depends on it ("i want the repo agents to be able to talk to the studio agents and complete the asset pipeline along with the code"), but the pilot (Resume) does not.

**Independent Test**: with fixture briefs and candidates (no GPU), the schema and intake checks accept a good candidate and refuse each kind of bad one, and the round counter puts the fourth round on the decision page.

**Acceptance Scenarios**:

1. **Given** a brief, **When** it is written, **Then** it validates against the brief schema: the asset's ID, the spec it serves, the round, the intake contract's limits, and the licence rules.
2. **Given** a candidate whose record names Qwen-Image-2.1 or FLUX [dev], or any weight or node not on the list with a licence, **When** the intake checks it, **Then** it is refused, naming it.
3. **Given** a candidate over any limit in its brief, **When** the intake checks it, **Then** it is refused with each exceeded limit and its value.
4. **Given** a third failed round, **When** the repo agent would write a fourth brief, **Then** it writes no brief, and the asset goes on the decision page.
5. **Given** the studio's container, **When** the studio agent reads the repository, `/srv/studio/photos`, or `/srv/studio/key`, **Then** the path doesn't exist in it; **and When** it reaches any host but Anthropic's API (through the egress proxy) and ComfyUI (on the studio's own internal network), **Then** there is no route, or the proxy refuses.

---

### User Story 5 - Agents plan infrastructure through a plan-only role (Priority: P2)

Under decision 1, an ops worker runs `terraform plan` through a command policy that signs its AWS calls with a plan-only role outside the sandbox. The session never holds a key, and the role can read but not change the account. This ships off, and turns on only when the Author's patches merge.

**Why this priority**: it removes the slowest wait, the plan blocks, but spec 001's W1 can proceed under today's rules without it.

**Independent Test**: the role's policy, tested offline, allows read actions and the state's lock only; the command policy, tested in the rehearsal while off, refuses; turned on in a later rehearsal, a plan of an unchanged root reads "No changes".

**Acceptance Scenarios**:

1. **Given** the plan policy is off, **When** an agent asks for a plan, **Then** it is refused, as today.
2. **Given** the plan policy is on, **When** an agent asks for a plan, **Then** the plan runs signed by the plan-only role, its block is redacted as today's plan's is, and no credential enters the session.
3. **Given** the plan-only role, **When** any mutating AWS action is attempted with it, **Then** AWS refuses it.

---

### User Story 6 - Agents run the gate (Priority: P2)

Under decision 2, a gate-runner worker runs `tools/gates/gate <branch>` from a checkout of main that no agent can write, under the gate lock, and hands the Author the passed log. It never merges. This ships off, and turns on only when the Author's patches merge.

**Why this priority**: it turns a failed gate on a known flake into a rerun instead of a new script for the Author, but merging still needs him.

**Independent Test**: while off, the gate command is refused; turned on, the gate runs on a test branch from the Author's checkout of main and prints its merge line, and nothing merges.

**Acceptance Scenarios**:

1. **Given** the gate policy is off, **When** an agent asks for a gate, **Then** it is refused.
2. **Given** the gate policy is on, **When** the gate runner runs the gate, **Then** it runs main's gate from the Author's checkout while it is on main, under the gate lock, and the log and its merge line reach the decision page.
3. **Given** a gate run, **When** it ends, **Then** main has not moved.

---

### User Story 7 - The pilot: the Author's ordered list under the supervisor (Priority: P3)

Once the rehearsal passes, the first queue is the Author's ordered list of 2026-11-13 (Clarifications), which he gives the night in his `orders.md`. Four workers run it, his Q14 answer. Every time the night needed the Author, and why, is counted on the decision page and fixed in the profiles before the next night. (It was the Resume stream alone until his list of 2026-11-13.)

**Why this priority**: it proves the night shift on his real list. Each item's first night drafts its intent, spec, and plan for his approval, so no asset ships before he has approved it.

**Independent Test**: the pilot's night ends with a decision page whose count of interruptions has a cause for each.

**Acceptance Scenarios**:

1. **Given** the rehearsal passed and his `orders.md` holds his list, **When** the night runs, **Then** the queue follows his order, each item's brief quotes his words, and the decision page counts each time the night needed the Author, with its cause.

### Edge Cases

- **Claude Code's own sandbox won't start inside the container**: it stays off there, and the container is the boundary, with the hooks on (FR-037). If it does start, it stays on as a second layer.
- **A container boundary row fails** in the container probe or the rehearsal: everything stops, and the session tells the Author (his Q8 answer).
- **An API-billing credential reaches a container's environment**: the runner refuses the line before that; inside, the managed settings blank the API variables, so Claude Code answers on the night-shift token or refuses to start (`forceLoginMethod`), never using the credential (FR-041).
- **The plan's weekly limit is reached**: the night stops at save points and resumes after the reset; extra usage is never accepted (FR-041).
- **The night-shift token expires or is revoked**: every session fails to sign in; the runner stops the night and writes it on the decision page.
- **The Author's AWS session expires overnight**: plans fail closed, and the decision page says when the session ended.
- **ComfyUI isn't running**: the studio agent asks the runner to start it (FR-040); if it fails to start, the task goes on the decision page.
- **The disk or memory preflight fails** before a task (any task, GPU or not): the task stays queued, and the reason goes on the decision page.
- **WSL restarts mid-night**: worktrees under the Author's home survive; the runner resumes from save points when he starts it again.
- **A worker edits a file its container leaves writable but the hooks protect**: the hooks still refuse, and the red-team rows show which layer refused.
- **A brief or candidate fails its schema**: it is refused as a whole and counts as a failed round.
- **An example spec is pointed at as a live one**: the runner refuses any spec outside `~/.config/h4reet-ai/night-shift/` and any holding an unfilled placeholder.

## Requirements *(mandatory)*

### Functional Requirements

**The probes and the install (User Story 1)**

- **FR-001**: THE nono probe (done; research R-14) printed the machine's facts. THE container probe SHALL test FR-037's and FR-041's rows on the Author's machine. It SHALL write only inside one folder it makes, remove its containers and networks when it ends, and name the images it leaves.
- **FR-002**: EACH probe SHALL follow `.claude/agents/ops.md`'s pattern: `set -u`, a header per step, stderr to stdout, each exit code, and the redaction filter on every output; it SHALL print no environment, no file under `~/.aws`, `~/.ssh`, or `~/.config/h4reet-ai/`, and no token.
- **FR-003**: WHEN the install script starts, THE script SHALL refuse unless the repository's commit for the SHA it was given exists and every file it installs or builds from is read with `git show <sha>:<path>`; it SHALL read nothing from a working tree, run the system's interpreter with project configuration skipped, and run no code from the repository outside a container.
- **FR-004**: THE install script SHALL build the night shift's images from the reviewed commit's files, on base images pinned by digest, and refuse when a pulled base's digest differs from its pin.
- **FR-005**: THE install script SHALL write the live container specs and the egress allowlist into `~/.config/h4reet-ai/night-shift/`, filling each placeholder from the Author's machine facts file, set them and their folder read-only, print each file's SHA-256, and print a diff against any spec it replaces.
- **FR-006**: THE install script SHALL rehearse in this order, stopping at the first failure with one line naming the step:
  - start one test session in a worker container, signed in on the plan;
  - prove a stand-in API key, then a stand-in auth token, in its environment is refused by the runner's last look, and, run anyway, is refused or neutralized by Claude Code (it refuses to start, or answers on the night-shift token with the stand-in unused), with no API call in an egress log that a signed-in turn first proved records calls;
  - run `make check` and the red-team suite inside it;
  - try each forbidden read, write, and connection, and expect a refusal.
- **FR-007**: THE install script SHALL print one summary for the Author to paste back, holding step outcomes, versions, image digests, and SHA-256s, and nothing secret.
- **FR-008**: THE install script SHALL be idempotent, and its `--undo` SHALL remove exactly what it installed (the live specs, the runner, the networks, the images it built, the studio's new folders when empty) and nothing else.
- **FR-009**: THE install script SHALL arrive on a runbook artifact in lines of 45 characters or fewer, with a guard that checks the reviewed commit's SHA.

**The containers (User Story 2)**

- **FR-010**: THE configuration SHALL define one container spec each for the supervisor, the spec-writer, the implementer, the reviewer, the red-teamer, ops, the gate runner, and the studio agent. A test SHALL prove each spec's every mount, network, and capability is held by its lattice parent's (plan §2).
- **FR-011**: NO session container SHALL mount `~/.aws`, `~/.ssh`, `~/.config/h4reet-ai/`, `~/.config/gh`, `~/.git-credentials`, `~/.docker/config.json`, the Author's `~/.claude` or `~/.claude.json`, any env, state, or plan file, `/srv/studio/photos`, or `/srv/studio/key`. Only the studio's container, and ComfyUI's runner-only container that the studio's requests start (FR-040), SHALL mount `/srv/studio/outputs` (his Q5).
- **FR-012**: THE reviewer and red-teamer containers SHALL mount the repository read-only. Every other worker's container SHALL mount read-write only its worktree, its temp folder, its own branch's refs and logs, and `.git/objects`. It SHALL mount `.git/hooks`, `.git/config`, `.git/info`, `.git/packed-refs`, `refs/heads/main`, and every path the repository's settings deny writing (read from `refs/heads/main`) read-only over them.
- **FR-013**: EVERY session container's network SHALL be an internal Docker network with no route out. The hosts (Anthropic's API, the toolchain's mirrors) SHALL be reached only through the night shift's egress proxy (the agents' engine's own `egress-proxy.py`, with the night's allowlist). The agents' engine SHALL be reached only through the engine forwarder, by the roles that run containers. ComfyUI SHALL be reached only on the studio's own internal network. No layering SHALL leave an agent session's egress to non-allowlisted hosts unenforced (the constitution's "Prohibited without a human: … network egress to non-allowlisted domains from an agent session").
- **FR-014**: EVERY session container SHALL run as the Author's user, under `--init`, with every capability dropped, `no-new-privileges`, a read-only root file system with a temp `tmpfs`, and memory, CPU, and process limits (plan §2). The GPU containers (the studio's and ComfyUI's) are the exception to the read-only root, because the NVIDIA runtime's hook writes into the container at start (the container probe's third run; contracts/containers.md §7). THE runner SHALL start a container only while the memory limits of every running night container, plus the new one, fit the host's memory less an 8 GB reserve; otherwise the task stays queued (G2's review). Containers run only through the runner's requests:
  - `terraform plan`: the worker asks, and the runner runs it in the plan container on a detached worktree of the asked commit, with the plan-only role's short-lived credentials passed in for that run alone (research R-06);
  - ComfyUI's launch (FR-040), the same way;
  - Blender: in the studio's own container, with the GPU.
- **FR-015**: THE `terraform plan` and gate requests SHALL ship off, and SHALL turn on only in a later install from a commit on which the Author's CLAUDE.md and `.claude/**` patches have merged.
- **FR-016**: THE example copy of the container specs SHALL live in the repository at `deploy/night-shift/containers/`, with every machine fact a placeholder. The Author's protection patch makes that path human-only when it merges, and the install SHALL read it from the reviewed commit without waiting for that merge. THE runner SHALL refuse any spec outside `~/.config/h4reet-ai/night-shift/` and any spec holding an unfilled placeholder, so the example never becomes what runs.
- **FR-039**: THE plan request's container SHALL be used only by the runner and never by a session; it alone mounts the root's values file, the saved plans' folder, and the provider mirror. THE gate request SHALL run the gate on the host, from the Author's checkout, as he runs it today. Nothing either reads reaches a session but the redacted block or the gate's log.

**The supervisor and the runner (User Story 3)**

- **FR-017**: THE runner SHALL start the supervisor and each worker in its role's container, with its worktree under the Author's home, never under `/tmp`.
- **FR-018**: THE runner SHALL run at most ten workers at once, and at most `NIGHT_WORKERS` (1 to 10, default 10) when the Author's facts file sets it. Only his facts file sets it, never the queue, which agents write (his Q14 answer, 2026-11-13: "Let's run 4").
- **FR-019**: THE runner SHALL hold one exclusive lock each for the matrix, the gate, and the GPU, and start a task that needs one only while holding it.
- **FR-020**: WHEN a step starts, THE worker SHALL first commit a save point on its own branch; WHEN a worker ends with uncommitted changes, THE runner SHALL record it on the decision page.
- **FR-021**: WHEN a session reports a usage limit with a reset time, THE runner SHALL stop the workers at their save points, wait once until the reset, and resume; it SHALL NOT poll on an hourly or other fixed interval.
- **FR-022**: WHEN a worker's worktree is clean and its session has written no output for the idle limit (15 minutes, a setting), THE runner SHALL stop it and record why.
- **FR-023**: THE supervisor SHALL keep a decision page per night: each question once, with a recommended answer and the task it blocks; each finished stack with its branch, tip, and note; each interruption with its cause.
- **FR-024**: THE queue SHALL be a file format the runner validates: each task's role, spec, base, branch, the locks it needs, and the tasks it waits on; a task naming an unknown role or lock is refused.
- **FR-025**: THE supervisor's role definition (`.claude/agents/supervisor.md`) SHALL arrive as a patch for the Author's hand.

**The studio line (User Story 4)**

- **FR-026**: THE repository SHALL hold a brief schema and a candidate schema, with the intake's checks as tests.
- **FR-027**: Repo agents SHALL write briefs only to `/srv/studio/briefs/`, and read candidates only from `/srv/studio/handoff/<asset>/<round>/`; THE studio agent SHALL read only the briefs, `/srv/studio/workflows`, and `/srv/studio/outputs`, and write only the handoff folder and `/srv/studio/outputs`, its working folder; repo agents SHALL NOT read `/srv/studio/outputs`. THE first install SHALL refuse while `/srv/studio/outputs` holds any file, since the Author moves its current files out first.
- **FR-028**: WHEN a candidate fails its checks for the third round, THE line SHALL write no further brief and SHALL put the asset on the decision page.
- **FR-029**: THE intake SHALL refuse any candidate whose record names a weight or custom node missing from the weights and nodes list, or one whose licence the list doesn't mark as shippable, and SHALL refuse every Qwen-Image-2.1 and FLUX [dev] output.
- **FR-030**: THE studio agent SHALL install no custom node and download no weight; a request for one SHALL go on the decision page.
- **FR-031**: A GPU job SHALL start only under the GPU lock, and every task only after the disk and memory preflight passes (every task since 2026-11-12, after the first install: a night that starts above the floor mustn't run C: down to zero).
- **FR-040**: THE studio agent SHALL launch and stop ComfyUI itself ("that should be done by the agents"), through a command policy that:
  - reads ComfyUI's install, its custom nodes, and its models, and writes none of them, so no weight or node can arrive (FR-030);
  - writes only ComfyUI's output folder (set to `/srv/studio/outputs`), its temp folder, and its user folder;
  - listens at its port only on the studio's own internal network (`h4-night-studio`, no route out). Inside its container that means `--listen 0.0.0.0`, since `127.0.0.1` there would be unreachable from the studio's container. There's no outbound connection, so neither ComfyUI-Manager nor a node can download. (Amended 2026-11-12 from "only on `127.0.0.1`", written before the container answer; G1's review);
  - has the GPU's paths.

  The launch parameters come from an allowlist in the studio's settings, seeded from the Author's own launch lines. A parameter outside it is refused and goes on the decision page. ComfyUI runs only while its task holds the GPU lock, and the runner stops it when the task ends.

**Plan and gate (User Stories 5 and 6)**

- **FR-032**: `infra/` SHALL define a plan-only IAM role, assumable only from the Author's SSO identity, allowed read actions, and writes and deletes of the state's `.tflock` objects only, so an agent's plan never races his apply; its apply is the Author's.
- **FR-033**: THE gate runner SHALL run main's gate from the Author's own checkout while its HEAD is `refs/heads/main` ("It can use my checkout of main"), under the gate lock, and SHALL never merge; no container mounts that checkout for writing. WHEN his checkout isn't on main or isn't clean, THE gate request SHALL be answered with that reason and go on the decision page.

**Signing in**

- **FR-036**: EACH session SHALL sign in to Claude with a token the Author made with `claude setup-token` for the night shift. It SHALL be passed to the container as `CLAUDE_CODE_OAUTH_TOKEN` from a file in `~/.config/h4reet-ai/night-shift/`, which no session can read, and never baked into an image or written into the repository. EACH role SHALL use its own Claude configuration folder, so no session reads or writes the Author's `~/.claude`.
- **FR-041**: THE night shift SHALL draw only on the Author's subscription and never on API credits ("doesnt require API credits"):
  - **the enforcement point**: no API-billing credential SHALL exist anywhere a night container can see. The runner sets each container's whole environment itself, and the never-mounted list covers every place a key lives on the Author's machine (`~/.config/h4reet-ai/env/` holds the gateway's Anthropic key). The container probe's `no-api-credential` row checks it. A session would need a real key to bill, and has none to find;
  - **the second layer**: each image's managed settings (`/etc/claude-code/managed-settings.json`, read-only, from the reviewed commit) SHALL hold `{"forceLoginMethod": "claudeai", "env": {"ANTHROPIC_API_KEY": "", "ANTHROPIC_AUTH_TOKEN": ""}}`. The container probe's third run proved it: with a stand-in key, then a stand-in auth token, Claude Code answered on the night-shift token and never used either. A `--settings` layer didn't hold (the second run), and `forceLoginMethod` alone in managed settings refused to start, but only after two API calls (research R-18). A test SHALL check that every image carries exactly this file;
  - THE runner SHALL start no container whose environment holds any of `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, or `CLAUDE_CODE_USE_FOUNDRY`;
  - no session SHALL run with `--bare`, which ignores the token;
  - the two refusals are Claude Code's and the runner's. THE container probe and the rehearsal SHALL prove Claude Code's, for an `ANTHROPIC_API_KEY` and for an `ANTHROPIC_AUTH_TOKEN`: it refuses to start with no API call in the egress log, or it answers on the night-shift token with the stand-in unused (the managed settings blank it; research R-18). The egress log counts only after a signed-in turn in the same run has added a line to it. THE runner's tests and the rehearsal SHALL prove the runner's, and its preflight SHALL check them on every start;
  - WHEN a session reports the plan's limit, THE runner SHALL wait for the reset and never accept extra usage. The Author turns extra usage off in his account (plan, his step).

**The layers (research.md R-07, R-08)**

- **FR-037**: THE container SHALL be each session's outer boundary. Before anything else is built, a container probe SHALL test on the Author's machine:
  - a session signs in with the night-shift token, and an API key or auth token present is refused or neutralized (it refuses to start, or answers on the token with the stand-in unused), with no API call in the egress log;
  - its only way out is the allowlisting proxy;
  - it sees no Docker socket and none of the never-readable paths;
  - it can write its worktree and commit, but not `.git/hooks`, `.git/config`, or the human-only paths;
  - it reaches the agents' engine only through the engine forwarder.

  IF Claude Code's own sandbox starts inside the container, THEN it SHALL stay on as a second layer. IF any of the boundary rows fails, THEN the work SHALL stop and the session SHALL tell the Author (his Q8 answer, carried to containers).
- **FR-038**: THE host's Docker socket SHALL be mounted into no container. Only the runner, outside every container, uses it to start containers and the gate (red-team row).

**Red-team and review**

- **FR-034**: `redteam/` SHALL hold a row for each refusal of FR-011 to FR-016 and FR-027, in every spelling CLAUDE.md lists (`git -C`/`-c`, `bash -c`, subshells, quoting, config or API equivalents), with a gap row for any that gets through; rows that run in the Author's rehearsal SHALL be marked so.
- **FR-036**: THE runner SHALL give the supervisor, on every start, the Author's `orders.md` (beside his facts file) word for word, closed by an end marker, and give it to no other role. It SHALL refuse the start when the file is a link, isn't a plain file, isn't UTF-8, holds a NUL, or is over 32 KB. The supervisor SHALL quote each item's words in its tasks' briefs.
- **FR-035**: EACH group of the build SHALL be reviewed by a reviewer agent that did not write it, and `make lint`, `make test`, and `make evals` SHALL pass before the branch is called done, with the output pasted.

### Key Entities

- **Container spec template**: a role's container spec with placeholders: its image, mounts, network, environment, capabilities, limits, its lattice parent, and its SHA-256.
- **Machine facts**: the values the probe reports and the Author confirms (paths, ports, versions, the plan role's AWS profile name), kept in his home, never in the repository.
- **Queue task**: role, spec, base, branch, locks, dependencies, state.
- **Lock**: matrix, gate, or GPU; its holder and since when.
- **Save point**: a commit on the task's branch, named for its step.
- **Brief**: asset ID, spec, round, limits, licence rules, references.
- **Candidate**: the `.glb`, its renders, and its record (models, versions, licences, sources).
- **Weights and nodes list**: each weight or node, its version, its licence, and whether its outputs may ship.
- **Decision page**: the night's questions, stacks, and interruptions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The Author's part of setup is two runs: the probe, then the install-and-rehearse script, with no step outside them.
- **SC-002**: Every forbidden read and write in FR-011 and FR-012 is refused in the rehearsal, 100% of rows.
- **SC-003**: `--undo` leaves no file the install added.
- **SC-004**: On the pilot night, the Author is needed only for decisions and merges, and every other interruption is counted with its cause.
- **SC-005**: No more than ten workers ever run at once, and no two holders of the same lock ever overlap.
- **SC-006**: No asset reaches intake after a third failed round without the Author's decision.

## Assumptions

- **The night drafts an item's intent, spec, and plan before he accepts the intent (deviation, named).** The constitution: "An accepted intent becomes a specification"; `intent/README.md`: correct anything misunderstood "before committing". From his ordered list (2026-11-13), one spec-writer task drafts the item's intent (`Status: draft`, his words quoted), then its spec and plan, on its own night branch, and stops. One question on the decision page asks him to accept the intent and approve the spec and plan together. Nothing reaches main without his merge, and if he corrects the intent, the spec and plan follow it before any tasks or code. The reason: his list is already in his words and in his order, and one approval per item saves him a night per step.

- **Decision 1 reverses today's rules (deviation, named).** CLAUDE.md: "Infra: `make plan` only. There is no `make apply` on purpose — apply is a human action: the Author's, in his terminal, until publication". Spec 001's research.md R-32 and the bash gate's rule "make plan with a ROOT, the real plan" make the real plan the Author's ("the Author runs it in his terminal"). Decision 1, "Yes, let agents run terraform plan", reverses that for the plan, never the apply. Constitution clauses it touches:
  - Principle IV, "Cloud access is short-lived and identity-based (OIDC for CI, SSO for humans)": an agent's command gets cloud access, through a role assumed from his SSO identity. Short-lived and identity-based hold; the actor is neither CI nor a human. **Deviation, named**, with ADR "agents plan through a plan-only role".
  - Principle IV, "No secrets exist in the repository, in agent context, or in traces": complies; the proxy signs outside the sandbox.
  - Security & Agent Governance, "Ops may `plan` and never `apply`": complies, and is what this enables.
  - "Prohibited without a human: … changing IAM": complies; the role is his apply.
  - "network egress to non-allowlisted domains from an agent session": complies; AWS's hosts are allowlisted by his own install, for the plan's command alone.
- **Decision 2 reverses today's rules (deviation, named).** CLAUDE.md: "Before merging, the Author runs `tools/gates/gate <branch>` from main's checkout". `docs/merge-requests/README.md` and ADR 0017 say the same. Decision 2, "Let agents run tools/gates/gate", reverses who runs it. Constitution clauses it touches:
  - Principle III, "only a human merges to `main`": complies; the gate prints the merge line and never merges.
  - Principle IV, "Agents act up to the production gate and never past it": complies; the clean-room gate is before the merge.
  - Principle IV, "the agent that implements a change MUST NOT be the agent that reviews it": complies; the gate runner wrote nothing.
  - **Deviation, named:** the gate's container phase uses the host's Docker engine, and its image step the Author's engine certificate. The runner runs main's gate on the host, from his checkout, as he runs it today; no session's container gets either. ADR "agents run the gate".
- **The live container specs outside the repository (deviation, named).** The Development standard: "Claude Code as the agent harness, run under the project's committed permissions, hooks, and sandbox settings". Decision 4, "Live copy stays outside, and we can have an example copy inside under a human-only path", carried from nono's profiles to the container specs, keeps the live specs outside. What holds: the example copy is committed and becomes human-only, and the live copy is the example filled with machine facts by the Author's script from a reviewed commit. The project's permissions and hooks still load in every session. ADR 0051.
- **The brief's nono, replaced by containers (departure, named, the Author's answer of 2026-11-12).** The brief asked for nono around every session. The probes showed three things (research R-14). Claude Code's sandbox can't start inside nono's. On WSL2, nono can't block Unix sockets, so the host's Docker socket stayed reachable. And it can't filter hosts without its insecure proxy mode. The Author chose containers. What the brief's nono design said, and why it didn't fit, stays as the record (research R-03 to R-08, from search extracts of nono's docs and issues, checked by the probes):
  - The brief asked for "`terraform plan`: `aws_auth` on a plan-only profile, and an `endpoint_policy` with read actions only". nono has no per-command `aws_auth` yet (its issue #1987). Its `endpoint_policy` matches methods and paths, not AWS actions (#2274). And on WSL2, its credential proxy is off unless a profile opts into `insecure_proxy`. So the plan runs as FR-014 says, signed by the plan-only role's short-lived credentials, and the IAM role is the boundary.
  - The brief's "`docker`: the relay socket only": the relay is a TCP tunnel to the agents' engine at `198.18.0.1:2376` over mutual TLS (`deploy/agents-engine/docker-relay`), not a socket. In the containers, it runs through the engine forwarder.
  - The brief's "each narrower than its parent": proven by a test over the container specs (FR-010).
  - The nesting the brief calls "untested so far" failed: Landlock refuses `mount(2)` to a sandboxed process, and Claude Code's sandbox mounts (research R-14).
- **Agent configuration outside `.claude/` (deviation, named).** The constitution: "Role definitions, hooks, skills, and `CLAUDE.md` are versioned in `.claude/` and count as production code: changes to them run the agent-configuration evals before merge". The workers' prompts, their Claude Code settings layers, and the studio's ComfyUI hook live in `deploy/night-shift/`, so the first install doesn't wait for a patch. What holds: P-1 makes the folder human-only, and P-10 adds it to the gate's agent-configuration trigger, so a change there runs the same evals. The role definitions themselves go in `.claude/agents/` (P-3). Question Q13.
- **ADR 0015 and ADR 0018, in part (deviations, named).**
  - ADR 0015, "Agent sessions run containers on their own disposable engine, never the host's". The night shift's sessions themselves run as containers on the Author's host engine. Only the runner starts them, from images it built from a reviewed commit, and no session holds the host's socket (FR-038). The containers a session starts (`make check`'s, `make up ENV=dev-cpu`'s) stay on the agents' engine through `engine-fwd`, as ADR 0015 says.
  - ADR 0018, "Agent sessions run on WSL under the full sandbox". Night sessions run in containers, where Claude Code's own sandbox can't start (research R-18); the container is their boundary, and the hooks and the bash gate stay. Daytime sessions in his checkout are unchanged.
  - ADR 0051 records both, and the Author's merge accepts them.
- **Plan and gate off until his patches merge.** The brief: "the supervisor's workers get plan and gate powers only once his CLAUDE.md and `.claude/**` patches merge. Until then the profiles ship with those two command policies off, and you live by today's rules: no `make plan ROOT=`, no gate runs, no apply."
- **The hourly check-in is off.** Decision 3: "turn off the hourly rate limit check, we only have weekly rate limts now and not hourly ones". The runner waits once for a stated reset.
- **The studio line (ADR "the studio line").** Decision 5 and his studio words. The pipeline, ComfyUI's install, its workflows, its weights, and Blender's scripts stay outside the repository; only the outputs come in, through the intake.
- **No agent installs anything or starts a container on his engine.** "Agent builds, you run one script." This session builds inside today's sandbox and hands him the container probe, then the install script.
- **The bash gate and the hooks stay in every session.** The container is the boundary beneath them. Claude Code's own sandbox stays on inside a container if the container probe shows it can start there. The design page's step 6 is a later spec.
- **Worktrees.** Workers' worktrees go under the Author's home, made by the runner outside the sandbox. This session's own worktrees are under `$TMPDIR`, because its sandbox writes only the checkout and `$TMPDIR` (`.claude/worktrees` is read-only to its shell); every step ends in a commit, so a WSL restart loses nothing.
- **Signing in on the plan (the Author: "ensure setup-token can work with the Subscription Ultra Plan and doesnt require API credits").** `claude setup-token` makes a one-year OAuth token, which draws on the plan's limits; Ultra is eligible (research R-16). Usage policy: the docs call OAuth tokens intended for ordinary Claude Code use and point people building products to API keys. The night shift is the Author's own Claude Code use on his own project. Whether ten unattended sessions at once fit the consumer terms is a question for the Author, which the session couldn't confirm from the docs (Q14).
- **Threat model.** Build time: agent mistakes and runaway spend (`docs/how-we-build/threat-model.md`, right-sized 2026-10-11).

## Expected Cost Impact

- **AWS**: the plan-only role is free; plans' read calls are free; the S3 lock's writes are fractions of a cent a month.
- **Model spend**: development time, on the Author's Claude plan, inside its weekly limits. Ten concurrent sessions spend the weekly allowance faster; the runner waits for the reset rather than buying more. No API key spend is added.
- **Electricity**: the GPU on studio nights.

## Degraded Modes

- **No containers yet, or a failed rehearsal**: agents run as today, under Claude Code's sandbox and the hooks.
- **The runner stops or WSL restarts**: work stops at the last save point; the Author's next start resumes.
- **The weekly limit**: the night stops at save points and resumes after the reset.
- **The plan or gate policy off, or the AWS session expired**: today's rules; plans and gates go on the decision page for the Author.
- **ComfyUI or the GPU unavailable**: studio tasks go on the decision page; repo tasks continue.

## Data-Flow Disclosure Entries

None. No byte leaves a visitor's device, and nothing here runs at runtime. On the build side, the plan's command reaches AWS's read APIs; this is recorded in the ADR, not the visitor disclosure.

## Constitution Check

| Principle | Touches | How it complies |
|---|---|---|
| I. Data-Local | No | No runtime change. |
| II. Production-Grade | Yes | Tests for every schema, check, container spec, and runner behaviour; the rehearsal; a how-we-build page and runbook. |
| III. Intent → Spec → Code, Humans Merge | Yes | Intent, spec, plan, and ADRs first; the gate runner never merges; the Author merges. |
| IV. Least Privilege | Yes | Each role gets a container no wider than its lattice parent, and every session signs in on the plan, failing closed on API keys. Deviations named above for decisions 1, 2, and 4, each with an ADR. |
| V. Cost | Yes | No new paid route; the plan role is free; the weekly limit is the dev-time budget. |
| VI. Build in Public | Yes | The example container specs, the nono evaluation, ADRs, and red-team rows are public; machine facts stay private. |
| VII. Own the Whole Product | No | No claim about the Author. |
| VIII. Honest AI | No | The twin is unchanged. |
| Security & Agent Governance | Yes | Roles, prohibitions, and review as above; `.claude/**` changes come as his patches. |

## Open questions for /speckit-clarify

Five were taken provisionally (Clarifications, Session 2026-11-12). Two are plan-level and go to plan.md's questions page: where the decision page lives, and whether the gate runner may pass `--prove`.
