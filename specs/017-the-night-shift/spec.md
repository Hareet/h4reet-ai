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

- Q: Where does the gate run from, since it refuses unless its checkout's HEAD is `refs/heads/main`, and agents can't commit while the Author's checkout sits on main? → A (provisional, recommended): **a dedicated gate checkout**, a linked worktree of main at `~/h4reet-ai/gate`, which his install script creates and no profile may write. His own checkout stays parked off main, and he merges from the gate checkout (FR-033).
- Q: How do workers sign in to Claude without holding the Author's own login? → A (provisional, recommended): **a token of their own**, made once by the Author with `claude setup-token`, kept by nono outside the repository, and passed to each worker as nono's environment credential. nono's proxy can't inject it on WSL2 without its `insecure_proxy` opt-in (research.md R-05). The settings patch hides the token's variable from every command the session runs. Each role gets its own Claude configuration folder, so no worker writes the Author's `~/.claude` (FR-036).
- Q: Where does the example copy live, and must the Author apply a patch before the first install? → A (provisional, recommended): **on the branch, at `deploy/night-shift/profiles/`**, a path that his protection patch makes human-only when it merges. The install reads it by `git show` at the reviewed SHA, so it doesn't wait for the merge. The alternative was an existing human-only path, arriving only as his patch, with the install run from his patched branch (FR-016).
- Q: Does an agent's plan take the state's lock? → A (provisional, recommended): **yes**: the plan-only role may write and delete only the state's `.tflock` objects, so an agent's plan never races his apply (FR-032).
- Q: May the studio agent read `/srv/studio/outputs`? → A (provisional, recommended): **no**. It holds the twin, a likeness. References reach the studio agent through the brief, copied from the repository's public `assets/` (FR-027).

## Terms

- **nono**: the kernel sandbox the Author chose (nono.sh). On Linux it uses Landlock, and its supervisor parent stays outside the sandbox to run the credential proxy, the audit log, and rollback snapshots.
- **Profile**: a nono policy file: the paths a session may read and write, the hosts and ports it may reach, and per-command policies.
- **Live profile**: the copy nono reads, in `~/.config/h4reet-ai/nono/`, outside the repository and readable by no agent.
- **Example copy**: the profiles in the repository, with each machine fact a placeholder, under a path that becomes human-only. The install fills the placeholders from the Author's machine to make the live copy.
- **The runner**: deterministic code outside every sandbox, installed by the Author's script from a reviewed commit, which starts the supervisor and each worker under its own profile.
- **Supervisor**: a Claude Code session under the supervisor profile that reads the queue, asks the runner to start workers, and writes the decision page.
- **Worker**: one Claude Code session per task, in one role, in its own worktree, under that role's profile.
- **Studio agent**: a worker in the studio role, which drives headless Blender and ComfyUI's local API.
- **Brief**, **candidate**, **round**: the studio line's request, its answer, and one request-and-answer pass.
- **Save point**: a commit on the worker's own branch before each step.
- **Decision page**: the morning's questions, each with a recommended answer, and the night's finished stacks.

## Scope

**In scope**:
- The intent, this spec, the plan with three ADRs, the tasks, and the analysis.
- The read-only probe script.
- The profiles and their command policies, the example copy and its check, and the plan-only IAM role in `infra/`.
- The runner, the supervisor's prompt, the queue, the locks, save points, the weekly resume, stopping waiting workers, and the decision page.
- The studio line's schemas and checks, its folders, the three-round rule, and the weights and nodes list.
- Red-team rows proving each refusal.
- The patches for the Author's hand, and the install-and-rehearse script with `--undo`.

**Out of scope** (later specs or the Author's own steps):
- Moving the bash gate's text rules into the profiles (design page step 6). The gate stays as it is; this spec only adds kernel refusals beneath it.
- The five workstreams' own specs (Room, Resume, Creatures, Corpus, Knowledge). The pilot is the Resume stream, after the rehearsal passes.
- Any runtime change. The site has no agents.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The Author installs and rehearses the night shift with one script (Priority: P1)

The Author runs one read-only probe, pastes its summary back, and later reads and runs one install-and-rehearse script from a reviewed commit. The script installs nono at a pinned checksum and the live profiles read-only. It wraps one test session, proves the nesting, runs `make check` and the red-team suite inside it, tries each forbidden read and write, verifies the audit log, lists the rollbacks, and prints one summary with nothing secret. `--undo` removes what it installed.

**Why this priority**: nothing else runs until nono is on his machine and proven, and no agent may install it ("Agent builds, you run one script").

**Independent Test**: on a machine without nono, run the probe (nothing changes on disk outside a temp folder), then the install script at a reviewed SHA, then `--undo`; the machine returns to its prior state.

**Acceptance Scenarios**:

1. **Given** a machine without nono, **When** the Author runs the probe, **Then** it prints the kernel and Landlock ABI, the GPU paths' presence, Blender's path and version, ComfyUI's port and whether it answers, Claude Code's version and config paths, the agents' engine relay's endpoint, nono's downloaded SHA-256 beside its published checksum, and nono's `--help` and `profile init` output, and it writes nothing outside its temp folder.
2. **Given** the reviewed commit's SHA, **When** the Author runs the install script with that SHA and HEAD has moved, **Then** it refuses before doing anything, naming the two SHAs.
3. **Given** a nono download whose SHA-256 differs from the pinned value, **When** the script runs, **Then** it refuses and installs nothing.
4. **Given** a successful install, **When** the script rehearses, **Then** every forbidden read and write returns a refusal, `make check` and the red-team suite pass inside the wrapped session, Claude Code's own sandbox starts nested inside nono's, `nono audit verify` passes, and `nono rollback list` shows the test session.
5. **Given** any failed step, **When** the script stops, **Then** it prints one line naming the step and the reason, and the summary to paste back.
6. **Given** an installed night shift, **When** the Author runs the script again at the same SHA, **Then** nothing changes; **When** he runs `--undo`, **Then** nono, the profiles, and the runner are removed, and nothing else.

---

### User Story 2 - Every agent session runs inside a profile the kernel enforces (Priority: P1)

The supervisor, each repo role, and the studio agent run under their own nono profile, each narrower than the profile that starts it. Each profile and command policy refuses what it must, in the kernel, beneath Claude Code's sandbox and the hooks, which stay.

**Why this priority**: the night shift exists to let agents do more without the Author, and that is safe only if the boundary holds when a text rule misses.

**Independent Test**: for each profile, a red-team row starts a sandboxed command under it and tries each forbidden path, host, and port, expecting a refusal; a row also proves each profile is a subset of its parent.

**Acceptance Scenarios**:

1. **Given** any profile, **When** a session under it reads `~/.aws`, `~/.ssh`, an env file, a Terraform state or plan file, `/srv/studio/photos`, `/srv/studio/key`, or `~/.config/h4reet-ai/nono/`, **Then** the kernel refuses.
2. **Given** the reviewer or red-teamer profile, **When** it writes anywhere in the repository, **Then** the kernel refuses.
3. **Given** a worker profile, **When** it writes outside its own worktree, its temp folder, and its branch's refs, **Then** the kernel refuses, `.git/hooks`, `.git/config`, and `refs/heads/main` included.
4. **Given** a child profile, **When** it is compared with its parent, **Then** every grant it holds is held by the parent.
5. **Given** the `docker` command policy, **When** it opens any TCP port but the agents' engine's, **Then** the kernel refuses; **and When** a session under the fallback layering reaches any host not on the allowlist, **Then** the runner's proxy refuses.

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
5. **Given** the studio profile, **When** the studio agent reads the repository, `/srv/studio/photos`, `/srv/studio/key`, or `/srv/studio/outputs`, or opens any TCP port but 443 and ComfyUI's, **Then** the kernel refuses; **and When** it reaches any host but Anthropic's API and ComfyUI on localhost, **Then** the layer FR-037 proves refuses.

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

**Independent Test**: while off, the gate command is refused; turned on, the gate runs on a test branch from the gate checkout and prints its merge line, and nothing merges.

**Acceptance Scenarios**:

1. **Given** the gate policy is off, **When** an agent asks for a gate, **Then** it is refused.
2. **Given** the gate policy is on, **When** the gate runner runs the gate, **Then** it runs main's gate from the gate checkout, under the gate lock, and the log and its merge line reach the decision page.
3. **Given** a gate run, **When** it ends, **Then** main has not moved.

---

### User Story 7 - The pilot: the Resume stream under the supervisor (Priority: P3)

Once the rehearsal passes, the Resume stream (improvement b, "re-do PDF resume with links from films") is the first queue. Every time it needed the Author, and why, is counted on the decision page and fixed in the profiles before the next stream.

**Why this priority**: it proves the night shift on a small stream with no assets.

**Independent Test**: the pilot's night ends with a decision page whose count of interruptions has a cause for each.

**Acceptance Scenarios**:

1. **Given** the rehearsal passed, **When** the Resume queue runs, **Then** the decision page counts each time the night needed the Author, with its cause.

### Edge Cases

- **The probe on a kernel without Landlock, or an older ABI**: it reports the ABI it finds, and the plan's per-port network rules turn into a named gap rather than a silent allow.
- **Claude Code's own sandbox won't start inside nono's**: the rehearsal stops at that step, and the summary says so; no worker runs until it passes or the Author chooses otherwise.
- **The Author's AWS session expires overnight**: plans fail closed, and the decision page says when the session ended.
- **ComfyUI isn't running**: the studio agent's first call fails; the task goes on the decision page; nothing starts ComfyUI.
- **The disk or memory preflight fails** before a GPU job: the job doesn't start, and the reason goes on the decision page.
- **WSL restarts mid-night**: worktrees under the Author's home survive; the runner resumes from save points when he starts it again.
- **A worker edits a file a profile protects** through a path the kernel allows: the hooks and Claude Code's sandbox still hold, and the red-team rows show which layer refused.
- **A brief or candidate fails its schema**: it is refused as a whole and counts as a failed round.
- **An example profile is pointed at as a live one**: the runner refuses any profile outside `~/.config/h4reet-ai/nono/` and any holding an unfilled placeholder.

## Requirements *(mandatory)*

### Functional Requirements

**The probe and the install (User Story 1)**

- **FR-001**: THE probe SHALL read only, write only inside a temp folder it creates, install nothing, and print: the kernel release and Landlock ABI; whether `/dev/dxg` and `/usr/lib/wsl/lib` exist; Blender's path and version; ComfyUI's port and whether it answers; Claude Code's version, its config paths, and the help lines for the flags the runner uses; the agents' engine relay's endpoint; and nono's pinned release's SHA-256 beside its published checksum, with the output of its `--help` and its `profile init` from the Claude Code base.
- **FR-002**: THE probe SHALL follow `.claude/agents/ops.md`'s pattern: `set -u`, a header per command, stderr to stdout, each exit code, and the redaction filter on every output; it SHALL print no environment, no file under `~/.aws`, `~/.ssh`, or `~/.config/h4reet-ai/`, and no token.
- **FR-003**: WHEN the install script starts, THE script SHALL refuse unless the repository's commit for the SHA it was given exists and every file it installs is read with `git show <sha>:<path>`; it SHALL read nothing from a working tree, run the system's interpreter with project configuration skipped, and run no code from the repository.
- **FR-004**: THE install script SHALL install nono at the pinned version into `~/.local/bin` only when the download's SHA-256 equals the value pinned in the reviewed commit, and refuse otherwise.
- **FR-005**: THE install script SHALL write the live profiles into `~/.config/h4reet-ai/nono/`, filling each placeholder from the Author's machine facts file, set them and their folder read-only, print each file's SHA-256, and print a diff against any profile it replaces.
- **FR-006**: THE install script SHALL rehearse in this order, stopping at the first failure with one line naming the step: wrap one test session; prove Claude Code's sandbox starts nested inside nono's; run `make check` and the red-team suite inside it; try each forbidden read and write and expect a refusal; run `nono audit verify`; show `nono rollback list`.
- **FR-007**: THE install script SHALL print one summary for the Author to paste back, holding step outcomes, versions, and SHA-256s, and nothing secret.
- **FR-008**: THE install script SHALL be idempotent, and its `--undo` SHALL remove exactly what it installed (nono, the live profiles, the runner, the studio's two new folders when empty) and nothing else.
- **FR-009**: THE install script SHALL arrive on a runbook artifact in lines of 45 characters or fewer, with a guard that checks the reviewed commit's SHA.

**The profiles (User Story 2)**

- **FR-010**: THE configuration SHALL define one profile each for the supervisor, the spec-writer, the implementer, the reviewer, the red-teamer, ops, the gate runner, and the studio agent. Each SHALL be written out whole from what nono's Claude Code base needs (the probe's `profile init`), not by `extends` from its parent, since nono's inheritance only appends (research.md R-03). A test SHALL prove each profile's every grant is held by its parent.
- **FR-011**: EVERY session profile (FR-010's eight) SHALL refuse reads of `~/.aws`, `~/.ssh`, env files, Terraform state and plan files, `/srv/studio/photos`, `/srv/studio/key`, and `~/.config/h4reet-ai/nono/`.
- **FR-012**: THE reviewer and red-teamer profiles SHALL write nothing in the repository; every worker profile SHALL write only its worktree, its temp folder, and its own branch's refs and objects, and never `.git/hooks`, `.git/config`, `.git/info`, or `refs/heads/main`.
- **FR-013**: EVERY profile's network SHALL be limited in the kernel to the TCP ports its role needs: 443 for every session, plus the agents' engine's 2376 for the roles that run containers, and, for the studio, ComfyUI's port. Landlock matches ports, not hosts, so the hosts (Anthropic's API, the toolchain's mirrors, `198.18.0.1:2376`, ComfyUI on localhost) SHALL be held by the layer FR-037 proves: Claude Code's own sandbox when nested, or else the outer namespace's own network namespace, whose only way out is the runner's allowlisting proxy. No layering SHALL leave an agent session's egress to non-allowlisted hosts unenforced (the constitution's "Prohibited without a human: … network egress to non-allowlisted domains from an agent session").
- **FR-039**: THE plan and gate requests SHALL each run in a request profile of their own (`plan.json`, `gate.json`), used only by the runner and never by a session. FR-011's denies don't bind them where their job needs a path (the saved plan and the root's values file; the engine certificate and the host's Docker socket), and nothing they read reaches a session but the redacted block or the gate's log.
- **FR-014**: THE configuration SHALL declare these command policies: `terraform validate` with its plugins and no credential; `docker` reaching only the agents' engine's port; `make check` with its own temp folder; `blender` with the GPU's paths and no network; and ComfyUI's port only. `terraform plan` SHALL run outside the session: the worker asks, and the runner runs it in a fresh export of the asked commit, under the plan profile, with the plan-only role's short-lived credentials as nono's environment credential, never a key in the session (research.md R-06). Where nono supports an endpoint policy on that route, it SHALL allow S3's reads and the `.tflock` writes only; the IAM role is the enforcement point.
- **FR-015**: THE `terraform plan` and gate command policies SHALL ship off, and SHALL turn on only in a later install from a commit on which the Author's CLAUDE.md and `.claude/**` patches have merged.
- **FR-016**: THE example copy of the profiles SHALL live in the repository at `deploy/night-shift/profiles/`, with every machine fact a placeholder, a path that the Author's protection patch makes human-only when it merges, and the install SHALL read it from the reviewed commit without waiting for that merge; THE runner SHALL refuse any profile outside `~/.config/h4reet-ai/nono/` and any profile holding an unfilled placeholder, so the example never becomes what runs.

**The supervisor and the runner (User Story 3)**

- **FR-017**: THE runner SHALL start the supervisor as `nono run --rollback --profile <supervisor> -- claude`, and each worker under its role's profile, in its own worktree under the Author's home, never under `/tmp`.
- **FR-018**: THE runner SHALL run at most ten workers at once.
- **FR-019**: THE runner SHALL hold one exclusive lock each for the matrix, the gate, and the GPU, and start a task that needs one only while holding it.
- **FR-020**: WHEN a step starts, THE worker SHALL first commit a save point on its own branch; WHEN a worker ends with uncommitted changes, THE runner SHALL record it on the decision page.
- **FR-021**: WHEN a session reports a usage limit with a reset time, THE runner SHALL stop the workers at their save points, wait once until the reset, and resume; it SHALL NOT poll on an hourly or other fixed interval.
- **FR-022**: WHEN a worker's worktree is clean and its session has written no output for the idle limit (15 minutes, a setting), THE runner SHALL stop it and record why.
- **FR-023**: THE supervisor SHALL keep a decision page per night: each question once, with a recommended answer and the task it blocks; each finished stack with its branch, tip, and note; each interruption with its cause.
- **FR-024**: THE queue SHALL be a file format the runner validates: each task's role, spec, base, branch, the locks it needs, and the tasks it waits on; a task naming an unknown role or lock is refused.
- **FR-025**: THE supervisor's role definition (`.claude/agents/supervisor.md`) SHALL arrive as a patch for the Author's hand.

**The studio line (User Story 4)**

- **FR-026**: THE repository SHALL hold a brief schema and a candidate schema, with the intake's checks as tests.
- **FR-027**: Repo agents SHALL write briefs only to `/srv/studio/briefs/`, and read candidates only from `/srv/studio/handoff/<asset>/<round>/`; THE studio agent SHALL read only the briefs and `/srv/studio/workflows`, and write only the handoff folder and its working folder; it SHALL NOT read `/srv/studio/outputs`, which holds the twin, so references reach it through the brief, copied from the repository's public `assets/`.
- **FR-028**: WHEN a candidate fails its checks for the third round, THE line SHALL write no further brief and SHALL put the asset on the decision page.
- **FR-029**: THE intake SHALL refuse any candidate whose record names a weight or custom node missing from the weights and nodes list, or one whose licence the list doesn't mark as shippable, and SHALL refuse every Qwen-Image-2.1 and FLUX [dev] output.
- **FR-030**: THE studio agent SHALL install no custom node and download no weight; a request for one SHALL go on the decision page.
- **FR-031**: A GPU job SHALL start only under the GPU lock and after the disk and memory preflight passes.

**Plan and gate (User Stories 5 and 6)**

- **FR-032**: `infra/` SHALL define a plan-only IAM role, assumable only from the Author's SSO identity, allowed read actions, and writes and deletes of the state's `.tflock` objects only, so an agent's plan never races his apply; its apply is the Author's.
- **FR-033**: THE gate runner SHALL run main's gate from the gate checkout, a linked worktree of main at `~/h4reet-ai/gate` that no profile may write, under the gate lock, and SHALL never merge. THE install SHALL create the gate checkout; the Author merges from it.

**Signing in**

- **FR-036**: EACH worker SHALL sign in to Claude with a token the Author made for the night shift, passed as nono's environment credential from a source outside the repository; THE settings patch SHALL hide that variable from every command a session runs; and EACH role SHALL use its own Claude configuration folder, so no worker writes the Author's `~/.claude`.

**The layers (research.md R-07, R-08)**

- **FR-037**: THE rehearsal SHALL first try Claude Code's own sandbox nested inside nono's. IF it starts, THEN that is the layering. IF it can't (Landlock refuses the mounts its sandbox makes), THEN the runner SHALL start each session inside an outer user, mount, and network namespace that masks the host's Docker socket and every never-readable path, and whose only network is a loopback bridge to the runner's allowlisting proxy, before nono starts; and run Claude Code with its own sandbox off, the hooks on. The rehearsal SHALL report which layering it proved, and prove the masks and the refusals under it.
- **FR-038**: Under either layering, THE host's Docker socket SHALL be unreachable from every session and command policy but the gate runner's gate command (red-team row), since nono can't mediate Unix sockets on WSL2.

**Red-team and review**

- **FR-034**: `redteam/` SHALL hold a row for each refusal of FR-011 to FR-016 and FR-027, in every spelling CLAUDE.md lists (`git -C`/`-c`, `bash -c`, subshells, quoting, config or API equivalents), with a gap row for any that gets through; rows that run in the Author's rehearsal SHALL be marked so.
- **FR-035**: EACH group of the build SHALL be reviewed by a reviewer agent that did not write it, and `make lint`, `make test`, and `make evals` SHALL pass before the branch is called done, with the output pasted.

### Key Entities

- **Profile template**: a role's profile with placeholders; its role, its parent, and its SHA-256.
- **Machine facts**: the values the probe reports and the Author confirms (paths, ports, versions, the plan profile's name), kept in his home, never in the repository.
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
  - **Deviation, named:** the gate's container phase uses the host's Docker engine, and its image step the Author's engine certificate. The gate runner's command policy grants those to main's gate alone, never to a session. ADR "agents run the gate".
- **The live profiles outside the repository (deviation, named).** The Development standard: "Claude Code as the agent harness, run under the project's committed permissions, hooks, and sandbox settings". Decision 4 keeps the live profiles outside. What holds: the example copy is committed and becomes human-only, and the live copy is the example filled with machine facts by the Author's script from a reviewed commit. ADR "nono as the build-time sandbox".
- **Where the brief's design meets nono on WSL2 (departures, named).** The research (research.md R-03 to R-08, from search extracts of nono's docs and issues, to be checked against the pinned binary by the probe):
  - The brief asked for "`terraform plan`: `aws_auth` on a plan-only profile, and an `endpoint_policy` with read actions only". nono has no per-command `aws_auth` yet (its issue #1987). Its `endpoint_policy` matches methods and paths, not AWS actions (#2274). And on WSL2, its credential proxy is off unless a profile opts into `insecure_proxy`. So the plan runs as FR-014 says, signed by the plan-only role's short-lived credentials, and the IAM role is the boundary.
  - The brief's "`docker`: the relay socket only": the relay is a TCP tunnel to the agents' engine at `198.18.0.1:2376` over mutual TLS (`deploy/agents-engine/docker-relay`), not a socket. Landlock grants port 2376 on every host.
  - The brief's "each narrower than its parent": proven by a test, not by `extends` (FR-010).
  - The nesting the brief calls "untested so far" is likely to fail: Landlock refuses `mount(2)` to a sandboxed process, and Claude Code's sandbox mounts. FR-037 gives the fallback, which the rehearsal proves.
- **Agent configuration outside `.claude/` (deviation, named).** The constitution: "Role definitions, hooks, skills, and `CLAUDE.md` are versioned in `.claude/` and count as production code: changes to them run the agent-configuration evals before merge". The workers' prompts, their Claude Code settings layers, and the studio's ComfyUI hook live in `deploy/night-shift/`, so the first install doesn't wait for a patch. What holds: P-1 makes the folder human-only, and P-10 adds it to the gate's agent-configuration trigger, so a change there runs the same evals. The role definitions themselves go in `.claude/agents/` (P-3). Question Q13.
- **Plan and gate off until his patches merge.** The brief: "the supervisor's workers get plan and gate powers only once his CLAUDE.md and `.claude/**` patches merge. Until then the profiles ship with those two command policies off, and you live by today's rules: no `make plan ROOT=`, no gate runs, no apply."
- **The hourly check-in is off.** Decision 3: "turn off the hourly rate limit check, we only have weekly rate limts now and not hourly ones". The runner waits once for a stated reset.
- **The studio line (ADR "the studio line").** Decision 5 and his studio words. The pipeline, ComfyUI's install, its workflows, its weights, and Blender's scripts stay outside the repository; only the outputs come in, through the intake.
- **No agent installs or runs nono.** "Agent builds, you run one script." This session builds inside today's sandbox and hands him the probe, then the install script.
- **The bash gate, the hooks, and Claude Code's sandbox stay.** nono is a layer beneath them, not a replacement. The design page's step 6 is a later spec.
- **Worktrees.** Workers' worktrees go under the Author's home, made by the runner outside the sandbox. This session's own worktrees are under `$TMPDIR`, because its sandbox writes only the checkout and `$TMPDIR` (`.claude/worktrees` is read-only to its shell); every step ends in a commit, so a WSL restart loses nothing.
- **WSL2.** Capability elevation doesn't work there, so every profile is complete up front.
- **Threat model.** Build time: agent mistakes and runaway spend (`docs/how-we-build/threat-model.md`, right-sized 2026-10-11).

## Expected Cost Impact

- **AWS**: the plan-only role is free; plans' read calls are free; the S3 lock's writes are fractions of a cent a month.
- **Model spend**: development time, on the Author's Claude plan, inside its weekly limits. Ten concurrent sessions spend the weekly allowance faster; the runner waits for the reset rather than buying more. No API key spend is added.
- **Electricity**: the GPU on studio nights.

## Degraded Modes

- **No nono, or a failed rehearsal**: agents run as today, under Claude Code's sandbox and the hooks.
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
| II. Production-Grade | Yes | Tests for every schema, check, profile rule, and runner behaviour; the rehearsal; a how-we-build page and runbook. |
| III. Intent → Spec → Code, Humans Merge | Yes | Intent, spec, plan, and ADRs first; the gate runner never merges; the Author merges. |
| IV. Least Privilege | Yes | Each role gets a kernel profile narrower than its parent. Deviations named above for decisions 1, 2, and 4, each with an ADR. |
| V. Cost | Yes | No new paid route; the plan role is free; the weekly limit is the dev-time budget. |
| VI. Build in Public | Yes | The example profiles, ADRs, and red-team rows are public; machine facts stay private. |
| VII. Own the Whole Product | No | No claim about the Author. |
| VIII. Honest AI | No | The twin is unchanged. |
| Security & Agent Governance | Yes | Roles, prohibitions, and review as above; `.claude/**` changes come as his patches. |

## Open questions for /speckit-clarify

Five were taken provisionally (Clarifications, Session 2026-11-12). Two are plan-level and go to plan.md's questions page: where the decision page lives, and whether the gate runner may pass `--prove`.
