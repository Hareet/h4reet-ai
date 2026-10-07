# Start here: running h4reet.ai in Claude Code on WSL2

Summary notes for the first sessions. Read `.specify/memory/constitution.md`, `CLAUDE.md`, and `docs/how-we-build/lifecycle.md` once by hand before letting an agent read them for you.

## 1. WSL2 prerequisites (once)

Work inside the Linux filesystem (`~/src/h4reet-ai`), never under `/mnt/c/` — exec bits, file watching, and Docker performance all break there.

- **Windows side**: current NVIDIA driver (the Windows driver provides GPU access to WSL2 — do not install a Linux GPU driver inside the distro); Docker Desktop with the WSL2 backend, or Docker Engine + `nvidia-container-toolkit` inside the distro. Verify: `docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu24.04 nvidia-smi` shows the RTX 5090.
- **`.wslconfig`** (`%UserProfile%\.wslconfig`): give WSL2 enough memory for model containers (e.g. `memory=48GB`, `swap=8GB`), then `wsl --shutdown`.
- **Distro packages**: `git`, `make`, `jq`, `shellcheck`, `bubblewrap`, `socat`, `unzip`, `build-essential`.
- **Toolchain**: Node 22 LTS (via `fnm` or `nvm`), Python 3.12 + `uv`, `gh` (GitHub CLI), AWS CLI v2 configured with IAM Identity Center (`aws configure sso`; no access keys), Terraform (spec 001; install now, use later).
- **Claude Code**: `npm install -g @anthropic-ai/claude-code`, then `claude` once to sign in with your subscription. Dev-time model spend is separate from the production budget by constitution — do not point Claude Code at the production Bedrock path.
- **Spec Kit**: `uv tool install specify-cli` (or `--from git+https://github.com/github/spec-kit.git@<tag>` to pin), then `specify check`.
- **Line endings**: `git config --global core.autocrlf input`. The repo ships `.gitattributes` with `* text=auto eol=lf`; hooks fail with CRLF.

## 2. Bootstrap commit (by you, not an agent)

The enforcement layer cannot gate its own creation, so the scaffold is one explicitly labeled bootstrap commit. Everything after it goes through the gates.

```bash
gh repo create h4reet-ai --public --clone && cd h4reet-ai
specify init --here --force --non-interactive --integration claude
unzip -o ~/h4reet-ai-scaffold.zip && cp -a h4reet-ai/. . && rm -rf h4reet-ai
chmod +x .claude/hooks/*.sh
printf '* text=auto eol=lf\n*.sh text eol=lf\n' > .gitattributes
git add -A && git commit -m "bootstrap: constitution, intents, spec 000/001, clay plays (pre-gate commit)"
git push -u origin main
```

Then, on GitHub: branch protection on `main` (require PR, require the Author's review, require status checks once they exist, no force push, include admins). Add a `production` environment with required reviewers = you (used by spec 001's apply). Enable secret scanning and Dependabot. Only after protection is on, start Claude Code.

## 3. First Claude Code session

```bash
cd ~/src/h4reet-ai && claude
```

Paste `docs/KICKOFF-PROMPT.md`. Expected shape of the session: it reads the governance docs, verifies the environment (`specify check`, `docker`, `nvidia-smi`, `gh auth status`, `aws sts get-caller-identity`), creates a branch, adds the repo-hygiene files (README linking every artifact, `LICENSE` MIT, `SECURITY.md`, `CONTRIBUTING.md`, `CODEOWNERS`, `.editorconfig`, `.gitignore`, `.github/dependabot.yml`), runs `/speckit-clarify` on `specs/000-local-foundations/spec.md`, and opens PR #1. It cannot merge; you do.

Session 2: `/speckit-plan` in plan mode for spec 000 — it must name the compose services, the images, the gateway interface, the meter, the hooks' test harness, the CI workflows, and the ADRs 0001–0006, with cost impact and degraded modes. Iterate until an engineer who never saw the conversation could implement from `plan.md` alone. Then `/speckit-tasks`, `/speckit-analyze`, and only then `/speckit-implement`, one PR per task group.

Spec 001 is specified in full only after spec 000's success criteria pass on your machine.

## 4. Gotchas worth knowing in advance

- **Sandbox on Linux** depends on OS packages (`bubblewrap`, `socat`). `.claude/settings.json` sets `failIfUnavailable: true`, so Claude Code refuses to start until they're present — that is the intended behavior, not a bug. Check the sandboxing doc for the current dependency list.
- **`settings.json` keys**: the sandbox and credential blocks follow the playbook's managed-settings example; a few keys may be managed-only. If Claude Code warns about an unknown key, remove it and note the removal in PR #1.
- **Local model server**: the RTX 5090 is Blackwell; use CUDA 12.8+ images and confirm the server build supports the architecture before choosing it in `/speckit-plan`. Model download on first `make up` can dominate the 10-minute budget — pre-pull in the plan.
- **Ports**: the stack should bind to `127.0.0.1` by default; WSL2 forwards localhost to Windows, which is convenient and also why nothing may bind `0.0.0.0` until spec 001's tunnel exists.
- **Bedrock adapter tests** use your SSO session (`aws sso login`) from your shell, never from inside the agent sandbox (credentials are denied there by design). Run them yourself or in CI via OIDC later.
- **Telegram**: create the bot with `@BotFather`, get your chat id, store the token in your shell profile or a local env file outside the repo (`deploy/env/*.env` is gitignored; `.env*` reads are denied to agents).
- **Hooks and humans**: hooks govern agents. You can still edit `.claude/**` in your editor — `CODEOWNERS` and the agent-config evals govern you.

## 5. Decision state

Settled: MIT; $5/day, $20/month with 70% warnings; Telegram + email; Langfuse self-hosted in the stack; one AWS account; containers on VMs; Terraform with human apply; local-first routing; rig avatar; cloned voice; GTA V-inspired original art direction; engineer/non-engineer paths; compose first, Terraform second.

Open (resolve in `/speckit-clarify`): Bedrock fallback sub-budget (proposed $2/day); idle-infrastructure target (proposed ≤ $10/month, spec 001); edge rate-limiting mechanism (spec 001).

Before Phase 1: the job/role/task corpus, and a final read of `intent/000-ai-twin-portfolio.md` → `Status: accepted`.
