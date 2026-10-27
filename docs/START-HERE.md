# Start here: running h4reet.ai in Claude Code on WSL2

Summary notes for the first sessions. Read `.specify/memory/constitution.md`, `CLAUDE.md`, and `docs/how-we-build/lifecycle.md` once by hand before letting an agent read them for you.

## 1. WSL2 prerequisites (once)

Work inside the Linux filesystem (here, `~/h4reet-ai/h4reet-ai`), never under `/mnt/c/` — exec bits, file watching, and Docker performance all break there.

- **Disk first**: about 50 GB free beyond today's use, on the Windows drive that holds WSL's `ext4.vhdx`. Check it with `df -h /mnt/c`, not `df /`, which measures the virtual disk rather than the drive under it. A full Windows drive crashed WSL, and every session in it, on 2026-10-08. Preflight checks both figures before every pull, and quickstart.md §0.1 says how to make room ([research.md R-32](../specs/000-local-foundations/research.md#r-32-host-disk-space-is-the-windows-drives)).
- **Windows side**: current NVIDIA driver (the Windows driver provides GPU access to WSL2 — do not install a Linux GPU driver inside the distro); Docker Desktop with the WSL2 backend, or Docker Engine + `nvidia-container-toolkit` inside the distro. Verify: `docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu24.04 nvidia-smi` shows the RTX 5090.
- **The NVIDIA runtime** (done on 2026-10-08): the toolkit must also be registered with Docker, or `--gpus all` fails with `could not select device driver "" with capabilities: [[gpu]]` ([research.md R-01](../specs/000-local-foundations/research.md#r-01-the-model-server-runs-on-the-rtx-5090-through-cuda-128-images)):

  ```bash
  sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker
  docker info --format '{{json .Runtimes}}'          # lists "nvidia"
  ```

  Preflight refuses to start a GPU stack, prod or dev, without it (P12).
- **`.wslconfig`** (`%UserProfile%\.wslconfig`): give WSL2 enough memory for model containers (e.g. `memory=48GB`, `swap=8GB`), then `wsl --shutdown`.
- **Distro packages**: `git`, `make`, `jq`, `shellcheck`, `bubblewrap`, `socat`, `unzip`, `build-essential`, `python3-yaml`.
- **Toolchain**: `nvm` with a Node LTS as your default, for Claude Code; Python 3.12 + `uv`; `ruff`; `gh` (GitHub CLI); AWS CLI v2 configured with IAM Identity Center (`aws configure sso`; no access keys); Terraform (spec 001; install now, use later). Then run `make tools` in your own terminal: it installs the pinned Node 24 through nvm, pytest, gitleaks, and the lint toolchain where agents can't write, and leaves your default Node alone. After it, `make toolchain-check` passes: every version matches `.devcontainer/toolchain.vars`, uv's and ruff's included, which you install at their pins yourself (quickstart.md §0.3). Don't make Node 24 your default (`nvm alias default`): Claude Code is installed under your default Node, and the Makefile finds the pinned one itself.
- **Claude Code**: `npm install -g @anthropic-ai/claude-code@<version>`, with the version `.devcontainer/toolchain.vars` pins (`make toolchain-check` fails on any other), then `claude` once to sign in with your subscription. Dev-time model spend is separate from the production budget by constitution — do not point Claude Code at the production Bedrock path.
- **Spec Kit**: `uv tool install specify-cli` (or `--from git+https://github.com/github/spec-kit.git@<tag>` to pin), then `specify check`.
- **Line endings**: `git config --global core.autocrlf input`. The repo ships `.gitattributes` with `* text=auto eol=lf`; hooks fail with CRLF.
- **The agents' engine** (Heavy: it ends with `wsl --shutdown`): agents run containers on their own rootless Docker engine, never on yours (ADR 0016). Set it up once, directly in your terminal and never through make, as yourself: it calls sudo itself.

  ```bash
  deploy/agents-engine/engine.sh setup      # the user h4agents, the firewall, /dev/dxg, the masked tree, the certificates
  # then, when it asks, in PowerShell: wsl --shutdown, and open a new WSL shell
  deploy/agents-engine/engine.sh up
  make engine-status     # reachable, rootless, the plugin h4-authz listed
  ```

  `wsl --shutdown` ends every WSL session, agents' included. Before the engine's first seed, move your Docker to the containerd image store (quickstart.md §0.4); the seed comes after the first pull (§0.9). When the engine misbehaves, the runbook is [`runbooks/agents-engine.md`](runbooks/agents-engine.md).

## 2. Bootstrap commit (done, 2026-10-07)

The enforcement layer cannot gate its own creation, so the scaffold went in as one explicitly labeled bootstrap commit on `main`, followed by the constitution 1.0.1 amendment (ADR 0012). Everything after that goes through the gates.

What was done, locally, in `~/h4reet-ai/h4reet-ai`: `specify init` (Spec Kit 1.0.8 for Claude, Python scripts) combined with the scaffold, the hooks made executable, `.gitattributes` forcing LF, Spec Kit's git extension added (`specify extension add git`), and `.specify/feature.json` pointed at spec 000.

There is no remote. Development stays local until you publish (ADR 0013; section 6): agents work on feature branches and end each with a note in `docs/merge-requests/`, and you merge each in your own terminal with the merge command the gate prints, after the steps in section 7. Agents can't run it, and inside Claude Code the git hook that guards `main` may refuse it too, because Claude Code sets `CLAUDECODE=1` in the shells it starts. After a fresh clone, run `make git-hooks` once; the agents' `make check` fails until you do.

## 3. First Claude Code session

```bash
cd ~/h4reet-ai/h4reet-ai && claude
```

Paste `docs/KICKOFF-PROMPT.md`. Expected shape of the session: it reads the governance docs, verifies the environment (`specify check`, `docker`, `nvidia-smi`, `make check`), creates the `chore/repo-hygiene` branch, adds the repo-hygiene files (README linking every artifact, `LICENSE` MIT, `SECURITY.md`, `CONTRIBUTING.md`, `CODEOWNERS`, `.editorconfig`, `.gitignore`, `.github/dependabot.yml`), runs `/speckit-clarify` on `specs/000-local-foundations/spec.md`, and ends with a merge-request note. It cannot merge; you do.

Session 2: `/speckit-plan` in plan mode for spec 000 — it must name the compose services, the images, the gateway interface, the meter, the hooks' test harness, the agents' own container engine (FR-039), the local gate (FR-041), and the ADRs 0001–0006, with cost impact and degraded modes. The CI workflows belong to the publication spec (ADR 0014). Iterate until an engineer who never saw the conversation could implement from `plan.md` alone. Then `/speckit-tasks`, `/speckit-analyze`, and only then `/speckit-implement`, one feature branch per task group, each merged by you.

Spec 001 is specified in full only after spec 000's success criteria pass on your machine.

## 4. Gotchas worth knowing in advance

- **Sandbox on Linux** depends on OS packages (`bubblewrap`, `socat`). `.claude/settings.json` sets `failIfUnavailable: true`, so Claude Code refuses to start until they're present — that is the intended behavior, not a bug. Check the sandboxing doc for the current dependency list.
- **`settings.json` keys**: the sandbox and credential blocks follow the playbook's managed-settings example; a few keys may be managed-only. If Claude Code warns about an unknown key, remove it and note the removal in the session 1 merge-request note. (The scaffold's `Write(...)` rules were removed on 2026-10-07: Claude Code consults only `Edit(...)` rules for writes. Run `claude doctor` after any settings change; it lists rejected entries.)
- **Glob denies are ignored on Linux.** In ADR 0006's words: "Bash can read `*.env` files outside `deploy/env`, because Linux ignores glob denies. Placement contains that." So the real env files live outside the repository, in `~/.config/h4reet-ai/env/`, which is denied by path, and the compose policy refuses a `*.env` file anywhere in the working tree (plan §11). Plan §13 lists the glob as a known gap.
- **`-p` silently ignores invalid settings** (plan §14): a headless `claude -p` session gives no warning about an entry it rejects. Run `claude doctor` after every settings change. For the same reason the behavioral agent-config evals fail a case that shows no hook events (plan §14).
- **User-level settings merge into the allowlist**: an allow rule in your own `~/.claude/settings.json` applies to this repository's sessions too, beside the project's. Keep it narrow. The behavioral evals and the canary start Claude Code with `--setting-sources project`, which reads only the project's settings (plan §13, §14).
- **Local model server**: llama.cpp's `llama-server`, one build for GPU and CPU (ADR 0019), on CUDA 12.8 images, which the RTX 5090 runs (research.md R-01). The models are about 19 GB: `make pull MODELS=all` fetches them, and every image, before the first `make up` (quickstart.md §0.9).
- **Ports**: the stack should bind to `127.0.0.1` by default; WSL2 forwards localhost to Windows, which is convenient and also why nothing may bind `0.0.0.0` until spec 001's tunnel exists.
- **Bedrock** runs as a dedicated runtime identity, never your own AWS session: `make aws-login` signs it in under `~/.config/h4reet-ai/aws-home` (quickstart.md §0.6), and the live contract run is `make contract-live ENV=prod ADAPTER=bedrock REASON="…"`, in your terminal. Agents can run neither: the sandbox holds no AWS credentials, and US5's patch refuses both targets.
- **Telegram**: only after the early patch is applied and `make init-env` has written the env file (quickstart.md §0.7–§0.8). Create the bot with `@BotFather`, paste its token into `TELEGRAM_BOT_TOKEN` in `~/.config/h4reet-ai/env/prod.env` in an editor, and read your chat ID as quickstart.md §0.7 shows, which keeps the token out of the browser, argv, and your shell history. Never put it in your shell profile: preflight refuses to start while your shell sets a variable an env template uses (P5).
- **Hooks and humans**: hooks govern agents. You can still edit `.claude/**` in your editor. The agent-config evals govern you instead: their static tier runs in `make evals`, and their behavioral tier when you run `make evals-agent-config REF=<branch>` from main's checkout (section 7). `CODEOWNERS` joins them at publication.
- **Denylist**: `corpus/intake/private/denylist.txt` exists only on this machine and is gitignored. Keep a copy somewhere safe: a fresh clone won't have it. Without it, `make corpus-check` says it skipped the denylist rule, and `make publish-check` can't certify: its summary line reads `publish-check: CANNOT CERTIFY (exit 3)`, and make itself exits 2, as it does for any recipe that fails.

## 5. Decision state

Settled: MIT; $5/day, $20/month with 70% warnings; a $2/day Bedrock fallback sub-budget inside the daily ceiling; Telegram + email (SMTP from a dedicated alerts mailbox); only a human reset restores service after a ceiling trips (local answers at once, metered calls once no meter is at its ceiling); Langfuse self-hosted in the stack; one AWS account; containers on VMs; Terraform with human apply; local-first routing; rig avatar; cloned voice; GTA V-inspired original art direction; engineer/non-engineer paths; compose first, Terraform second; local development until publication (ADR 0013); spec 000's GitHub-side requirements move to a separate publication spec; agents run containers on their own disposable engine, never the host's; an environment file may select an image, a profile, or a dev-only switch, and that counts as configuration; the fallback sub-budget renews only when a human approves; each stack has its own meter, only production spends, and development runs on a Claude Team plan. The spec 000 decisions are recorded in its Clarifications section (2026-10-07).

Open: idle-infrastructure target (proposed ≤ $10/month) and edge rate-limiting mechanism, both for spec 001's `/speckit-clarify`; an intent for the publication spec.

Before Phase 1: the job/role/task corpus, and a final read of `intent/000-ai-twin-portfolio.md` → `Status: accepted`.

## 6. Going public (later, by you)

When spec 000's success criteria pass locally and you're ready for interviews (ADR 0013), run these in your own terminal; the hooks block them for agents:

1. **`make publish-check`** (FR-042), in a full clone, with the denylist in place. It scans the whole history, not just the working tree, for secrets and denylisted phrases, and the corpus for amounts. make itself exits 2 whenever the script fails, so its summary line says how it ended. `publish-check: OK (exit 0)` is clean. `publish-check: FAIL (exit 1)` lists each finding by commit, path, line, and rule, never the phrase: clean it out of history before the first push; ADR 0013 allows that one rewrite. `publish-check: CANNOT CERTIFY (exit 3)` means it can't certify: inside the agent sandbox, in a shallow clone, with the wrong gitleaks, or with no denylist (quickstart.md §6.4). Record its summary line only.
2. Check GitHub's email privacy setting. With "Block command line pushes that expose my email" on, GitHub rejects commits authored with your personal address (GH007).
3. Publish:

   ```bash
   cd ~/h4reet-ai/h4reet-ai && git switch main
   make corpus-check                                     # with your local denylist in place
   gh repo create h4reet-ai --public --source . --push  # pushes main with its full history
   ```

4. On GitHub: branch protection on `main` (require PR, require the Author's review, require status checks, no force push, include admins). Add a `production` environment with required reviewers = you (used by spec 001's apply). Enable secret scanning, Dependabot, and private vulnerability reporting (`SECURITY.md` sends reporters there).
5. Leave local mode: replace the local-only lines in `CLAUDE.md`, `docs/KICKOFF-PROMPT.md`, `README.md`, `SECURITY.md`, and `CONTRIBUTING.md`; relax the local-phase rules in `.claude/hooks/bash-gate.sh` and their matrix rows, so agents push feature branches again while `main` stays yours; move github.com and api.github.com from `sandbox.network.deniedDomains` back to `allowedDomains` in `.claude/settings.json`; and supersede ADR 0013 with an ADR for the switch. Only after protection is on, start the next Claude Code session. From then on, agents push feature branches and open PRs.

## 7. Before you merge

Every branch ends with a note in `docs/merge-requests/`. Before you merge it, in your own terminal:

1. **Read the note's first section,** on what runs in your terminal. In ADR 0017's words: "Agent-editable and reviewed: the Makefile, `deploy/scripts/**`, `scripts/operator.py`, and `.devcontainer/**`. These run in the Author's terminal, so each merge-request note lists changes to them under its own heading, first, and the reviewer checks that heading first." `tools/gates/**` and `deploy/agents-engine/**` are human-only (ADR 0017), so they reach main only as your own patches. Once the patch that protects each has landed, plan §15's rule holds: "Their changes travel as patch files in `docs/merge-requests/`", which you review and apply yourself (step 4). The note also carries `make check`'s whole output from an agent session: the agents' run of every local gate (FR-041).
2. **Run the gate, never `make check` or `make test`:**

   ```bash
   tools/gates/gate <branch>
   ```

   Run it directly, from main's checkout, not through make, because a planted `GNUmakefile` would shadow the Makefile. It refuses unless that checkout is on `main` and clean, with nothing untracked where its code is, so that main's own code grades the branch. It exports the branch's commit with `git archive` and proves the export is that commit's tree. In the devcontainer image, it installs the workspace's packages in a copy of the export with `npm ci --ignore-scripts`, its one step with the network, then runs lint, `validate-config`, the tests, the evals, the red-team suite, and matrix stage H with `--network none`. Then, on the host, it checks the git hooks, the toolchain, and the compose policy, runs `corpus-check` with your denylist, and gitleaks over the branch's commits and over the exported tree, builds the images on the agents' engine, and reads the behavioral evals' history when the branch touches their triggers (plan §11). Matrix stage E waits, PENDING, when the branch touches `deploy/agents-engine/` or `.claude/settings.json`: run `tools/gates/gate --prove <branch>` with no agent session using the engine, because `deploy/agents-engine/engine.sh prove` resets and reseeds it. The step judges prove by how it exits. Once US3's prove patch, [`docs/merge-requests/2026-10-10-feat-000-us3-governance-prove.patch`](merge-requests/2026-10-10-feat-000-us3-governance-prove.patch), is applied, prove also writes a report headed with the commit and the engine's tree, and `make matrix` folds it as stage E when that tree is the checkout's.

   Never run `make check` in your own terminal. There it runs the working tree's `evals/run.py` and `evals/docs_links.py` (`make evals`), `redteam/run.py` (`make redteam-suite`), and `redteam/forbidden-actions.sh` (`make matrix`) on your host, outside any container, and agents write that code. Only its `lint`, `test`, and `validate-config` refuse there, as `make lint` and `make test` do on their own, because they would run the working tree's `node_modules` and test code, which agents installed and git doesn't show.

   If the devcontainer image won't build, `tools/gates/gate --host <branch>` skips the container phase, and every summary line says DEGRADED. In the gate's words: "Lint, tests, the scaffolds, and stage H then run nowhere: never on the host." (plan §19)

   When nothing fails or waits, the gate prints the merge command: merge with it, not with a command of your own. It merges the commit the gate checked, by SHA, with replace objects off, and puts the gate's summary line in the merge commit's message. Their shape, as the gate's `finish()` prints them:

   ```text
   gate: <SHA> (<branch>) by tools/gates/gate at <its own commit's first 12>: <n> PASS, <n> SKIP, <n> WARN, <n> PLANNED, <n> PENDING, <n> FAIL
   merge: git --no-replace-objects merge --no-ff -m 'Merge <branch> (<the SHA's first 12>)' -m '<that gate: line>' <SHA>
   ```

   If main has commits the branch doesn't, it says so: the merge would then write a tree the gate didn't check. For a stacked branch, the note names a simulated merge you can gate instead.
3. **The agent-config evals, when `make evals` shows PENDING:** it does whenever no history entry that this machine attests has this tree's trigger hash, a hash over `CLAUDE.md`, `REVIEW.md`, `.claude/**`, `evals/agent-config/**` (its history aside), and the Claude Code pin (plan §14). Of the attested entries for the hash, the newest decides, so a later failure shows FAIL even after an earlier pass. The history holds no entry until your first run's is committed, so until then every branch shows PENDING, whether or not it touched those. The gate's own `agent-config-evals` step waits, PENDING, only for a branch that touches one of them; for any other it is SKIP. Run them from main's checkout, clean, naming the branch:

   ```bash
   git switch main
   make evals-agent-config REF=<branch>
   ```

   main's tier runs against the branch, whose cases and thresholds it reads as data. Before any session starts, it shows the branch's diff under `.claude/`, `CLAUDE.md`, `REVIEW.md`, and every human-only path, and waits for you to type `yes`. Then 14 cases run three times each, with `claude -p` on the Team plan, each in a fresh clone of the branch with the git hooks installed (plan §14); a case that needs a patch the tree lacks, such as the closing patch's 4, prints PLANNED and doesn't run until it lands. The entry lands in `evals/agent-config/history/` in main's checkout, untracked, with its attestation under `~/.local/state/h4reet/evals/attested/`, which agent sessions can't write. The run ends by printing the commands that commit the entry on the branch from main's repository, with git's plumbing from the branch's tip, so a commit made meanwhile stops them. They never switch main's checkout to the branch, since the gate and live sessions' hooks would then run the branch's code. Paste them (SC-008), and run the gate again: it counts the entry because this machine attests it, and posts its cost and tokens to prod's collector for the dashboard's dev-time row. The branch that adds the tier can't run it before it merges, because main must have the tier first.
4. **After the merge, apply the branch's patch,** if its note has one: `git apply <patch>`, then `claude doctor` and `make git-hooks` (plan §15). Each patch lands before the risk it guards, so its note says when.

The agents' engine's commands are yours too, and they also run directly, never through make: `deploy/agents-engine/engine.sh` with `setup`, `up`, `down`, `seed`, `reset`, `destroy`, or `prove` ([contracts/agents-engine.md §8](../specs/000-local-foundations/contracts/agents-engine.md#8-commands)). Agents have `make engine-status` and `make engine-smoke`. When a gate fails or waits, the runbook is [`runbooks/local-gate.md`](runbooks/local-gate.md).
