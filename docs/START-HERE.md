# Start here: running h4reet.ai in Claude Code on WSL2

Summary notes for the first sessions. Read `.specify/memory/constitution.md`, `CLAUDE.md`, and `docs/how-we-build/lifecycle.md` once by hand before letting an agent read them for you.

## 1. WSL2 prerequisites (once)

Work inside the Linux filesystem (here, `~/h4reet-ai/h4reet-ai`), never under `/mnt/c/` — exec bits, file watching, and Docker performance all break there.

- **Windows side**: current NVIDIA driver (the Windows driver provides GPU access to WSL2 — do not install a Linux GPU driver inside the distro); Docker Desktop with the WSL2 backend, or Docker Engine + `nvidia-container-toolkit` inside the distro. Verify: `docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu24.04 nvidia-smi` shows the RTX 5090.
- **`.wslconfig`** (`%UserProfile%\.wslconfig`): give WSL2 enough memory for model containers (e.g. `memory=48GB`, `swap=8GB`), then `wsl --shutdown`.
- **Distro packages**: `git`, `make`, `jq`, `shellcheck`, `bubblewrap`, `socat`, `unzip`, `build-essential`.
- **Toolchain**: Node 22 LTS (via `fnm` or `nvm`), Python 3.12 + `uv`, `gh` (GitHub CLI), AWS CLI v2 configured with IAM Identity Center (`aws configure sso`; no access keys), Terraform (spec 001; install now, use later).
- **Claude Code**: `npm install -g @anthropic-ai/claude-code`, then `claude` once to sign in with your subscription. Dev-time model spend is separate from the production budget by constitution — do not point Claude Code at the production Bedrock path.
- **Spec Kit**: `uv tool install specify-cli` (or `--from git+https://github.com/github/spec-kit.git@<tag>` to pin), then `specify check`.
- **Line endings**: `git config --global core.autocrlf input`. The repo ships `.gitattributes` with `* text=auto eol=lf`; hooks fail with CRLF.

## 2. Bootstrap commit (done, 2026-10-07)

The enforcement layer cannot gate its own creation, so the scaffold went in as one explicitly labeled bootstrap commit on `main`, followed by the constitution 1.0.1 amendment (ADR 0012). Everything after that goes through the gates.

What was done, locally, in `~/h4reet-ai/h4reet-ai`: `specify init` (Spec Kit 1.0.8 for Claude, Python scripts) combined with the scaffold, the hooks made executable, `.gitattributes` forcing LF, Spec Kit's git extension added (`specify extension add git`), and `.specify/feature.json` pointed at spec 000.

There is no remote. Development stays local until you publish (ADR 0013; section 6): agents work on feature branches and end each with a note in `docs/merge-requests/`, and you merge with `git switch main && git merge --no-ff <branch>` in your own terminal. Agents can't run it, and inside Claude Code the git hook that guards `main` may refuse it too, because Claude Code sets `CLAUDECODE=1` in the shells it starts. After a fresh clone, run `make git-hooks` once; `make check` fails until you do.

## 3. First Claude Code session

```bash
cd ~/h4reet-ai/h4reet-ai && claude
```

Paste `docs/KICKOFF-PROMPT.md`. Expected shape of the session: it reads the governance docs, verifies the environment (`specify check`, `docker`, `nvidia-smi`, `make check`), creates the `chore/repo-hygiene` branch, adds the repo-hygiene files (README linking every artifact, `LICENSE` MIT, `SECURITY.md`, `CONTRIBUTING.md`, `CODEOWNERS`, `.editorconfig`, `.gitignore`, `.github/dependabot.yml`), runs `/speckit-clarify` on `specs/000-local-foundations/spec.md`, and ends with a merge-request note. It cannot merge; you do.

Session 2: `/speckit-plan` in plan mode for spec 000 — it must name the compose services, the images, the gateway interface, the meter, the hooks' test harness, the CI workflows, and the ADRs 0001–0006, with cost impact and degraded modes. Iterate until an engineer who never saw the conversation could implement from `plan.md` alone. Then `/speckit-tasks`, `/speckit-analyze`, and only then `/speckit-implement`, one feature branch per task group, each merged by you.

Spec 001 is specified in full only after spec 000's success criteria pass on your machine.

## 4. Gotchas worth knowing in advance

- **Sandbox on Linux** depends on OS packages (`bubblewrap`, `socat`). `.claude/settings.json` sets `failIfUnavailable: true`, so Claude Code refuses to start until they're present — that is the intended behavior, not a bug. Check the sandboxing doc for the current dependency list.
- **`settings.json` keys**: the sandbox and credential blocks follow the playbook's managed-settings example; a few keys may be managed-only. If Claude Code warns about an unknown key, remove it and note the removal in the session 1 merge-request note. (The scaffold's `Write(...)` rules were removed on 2026-10-07: Claude Code consults only `Edit(...)` rules for writes. Run `claude doctor` after any settings change; it lists rejected entries.)
- **Local model server**: the RTX 5090 is Blackwell; use CUDA 12.8+ images and confirm the server build supports the architecture before choosing it in `/speckit-plan`. Model download on first `make up` can dominate the 10-minute budget — pre-pull in the plan.
- **Ports**: the stack should bind to `127.0.0.1` by default; WSL2 forwards localhost to Windows, which is convenient and also why nothing may bind `0.0.0.0` until spec 001's tunnel exists.
- **Bedrock adapter tests** use your SSO session (`aws sso login`) from your shell, never from inside the agent sandbox (credentials are denied there by design). Run them yourself or in CI via OIDC later.
- **Telegram**: create the bot with `@BotFather`, get your chat id, store the token in your shell profile or a local env file outside the repo (`deploy/env/*.env` is gitignored; `.env*` reads are denied to agents).
- **Hooks and humans**: hooks govern agents. You can still edit `.claude/**` in your editor — `CODEOWNERS` and the agent-config evals govern you once they exist (at publication and in spec 000); until then, your own review does.
- **Denylist**: `corpus/intake/private/denylist.txt` exists only on this machine and is gitignored. Keep a copy somewhere safe: a fresh clone won't have it, and without it `make corpus-check` skips the denylist rule silently.

## 5. Decision state

Settled: MIT; $5/day, $20/month with 70% warnings; a $2/day Bedrock fallback sub-budget inside the daily ceiling; Telegram + email (SMTP from a dedicated alerts mailbox); only a human reset restores service after a ceiling trips; Langfuse self-hosted in the stack; one AWS account; containers on VMs; Terraform with human apply; local-first routing; rig avatar; cloned voice; GTA V-inspired original art direction; engineer/non-engineer paths; compose first, Terraform second; local development until publication (ADR 0013); spec 000's GitHub-side requirements move to a separate publication spec; agents run containers on their own disposable engine, never the host's. The spec 000 decisions are recorded in its Clarifications section (2026-10-07).

Open: idle-infrastructure target (proposed ≤ $10/month) and edge rate-limiting mechanism, both for spec 001's `/speckit-clarify`; an intent for the publication spec.

Before Phase 1: the job/role/task corpus, and a final read of `intent/000-ai-twin-portfolio.md` → `Status: accepted`.

## 6. Going public (later, by you)

When spec 000's success criteria pass locally (as far as they can before publication) and you're ready for interviews (ADR 0013), run these in your own terminal; the hooks block them for agents:

1. Scan the whole history, not just the working tree, for secrets, amounts, and denylisted phrases. Spec 000 should add a `make publish-check` that does this. If it finds anything, clean it out of history before the first push; ADR 0013 allows that one rewrite.
2. Check GitHub's email privacy setting. With "Block command line pushes that expose my email" on, GitHub rejects commits authored with your personal address (GH007).
3. Publish:

   ```bash
   cd ~/h4reet-ai/h4reet-ai && git switch main
   make corpus-check                                     # with your local denylist in place
   gh repo create h4reet-ai --public --source . --push  # pushes main with its full history
   ```

4. On GitHub: branch protection on `main` (require PR, require the Author's review, require status checks, no force push, include admins). Add a `production` environment with required reviewers = you (used by spec 001's apply). Enable secret scanning, Dependabot, and private vulnerability reporting (`SECURITY.md` sends reporters there).
5. Leave local mode: replace the local-only lines in `CLAUDE.md` and `docs/KICKOFF-PROMPT.md`; relax the local-phase rules in `.claude/hooks/bash-gate.sh` and their matrix rows, so agents push feature branches again while `main` stays yours; move github.com and api.github.com from `sandbox.network.deniedDomains` back to `allowedDomains` in `.claude/settings.json`; and supersede ADR 0013 with an ADR for the switch. Only after protection is on, start the next Claude Code session. From then on, agents push feature branches and open PRs.
