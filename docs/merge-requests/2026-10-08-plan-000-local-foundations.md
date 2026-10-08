# plan/000-local-foundations (DRAFT: save point, not ready to merge)
Spec: specs/000-local-foundations/ · Intent: specs/000-local-foundations/intent.md · Written by: Claude Code (Opus 5.5), planning; four read-only reviewer agents · Date: 2026-10-08
Session: started from `~/h4reet-ai/h4reet-ai` · Repo hooks active: yes (`.claude/audit/hooks.log`, for example `2026-10-08T16:10:09Z bash ALLOW ls .claude/skills/ …`)
Authorized by: the session 2 prompt in `docs/KICKOFF-PROMPT.md`, and the Author's interview answers, word for word in research.md

**Status: draft.** The session hit its usage limit during the review step. This note records where the work stopped, so it can resume. The final note replaces it and is the branch's last commit.

## Done
- **The spec touch-ups**, plan.md, research.md, data-model.md, the eight contracts, and quickstart.md. Then the 13 ADRs (0001–0006 and 0016–0022) and tasks.md (fcb5e8d … 47db416).
- **`/speckit-analyze`** (e7d5ab5):
  - the credential denies, the FR-007 names, `content-scan.sh`, and the `pre-commit` hook move into the early patch (T045);
  - `make check` gains a PLANNED status;
  - M1–M5 and L1–L5 are fixed;
  - H1, L6, and L7 are left for the Author.
- **The Haiku 5.5 correction** (this commit). The interview option the Author chose called Haiku 5.5 "the cheapest Claude by list price". That wasn't verified: Haiku 5.5's price hadn't been published by 2026-10-08. The plan's cost figures now use Haiku 4.5's list price ($1 and $5 per million tokens). A correction note sits beside the verbatim row in research.md.
- **The review step.** Four read-only reviewers ran, one per slice. Three reported, and all three asked for changes. The fourth (alerts.md, telemetry.md, env-files.md, agents-engine.md) was still running at this save point. If its report is lost, run it again with the same slice.

## Review findings still to fix
Reviewer slices: **P** = plan, research, spec, and ADRs; **G** = data model and gateway contracts; **T** = tasks and quickstart. ✓ means verified against the text.

**Enforcement timing: a deny must land before the risk it guards** (a repeated mistake; see the CLAUDE.md line under For the Author):
1. ✓ The prices, budgets, and alerts files stay writable by shell until the closing patch, after real Bedrock spend starts (P-I3, G-1, T-11). Fix: move `denyWrite`, `Edit(config/prices*)`, and the protected-paths rule into T045. Also have validate-config refuse a zero price on a paid entry.
2. gitleaks reads an agent-writable `.gitleaks.toml`, `.gitleaksignore`, and `gitleaks:allow` (T-10). Fix: ship `.gitleaks.toml` in T045. Every gitleaks call then passes `--config` and an empty ignore file, with `--ignore-gitleaks-allow`, and the matrix gets a row per bypass.
3. A planted `GNUmakefile` could shadow every Make target the Author runs, including the sudo engine targets (P nit). Fix: T045 adds an OS-level `denyWrite` on `./GNUmakefile`, `./makefile`, and `./deploy/agents-engine`. The Author runs `deploy/agents-engine/engine.sh <cmd>` directly.
4. The ops grant `docker-relay *` is an unrestricted shell (T-12). Fix: the relay runs only `docker`, and the grant becomes `docker-relay docker *`. Add `sh -c` rows to the matrix.
5. The early patch must also update `tools/gates/roles.expected` (T-6) and the stale CLAUDE.md lines (T feedback; P-N3 is the line budget).

**Prod's config and images:**
6. ✓ Prod rereads `config/` and `deploy/` from the shared working tree on every restart, so it follows whatever branch is checked out (P-I4, G-1). The fix:
   - `make up` for prod and dev exports the started commit (`git archive`) into `${H4_STATE_DIR}/tree/<sha>`, builds the images from that export, and refuses uncommitted changes;
   - `make status` shows the SHA;
   - `REF=<sha>` gives a one-command rollback. Rehearse it, which meets step 6's rollback clause (P-I2).
7. `make up` never rebuilds the images, so stale ones certify code the branch doesn't contain (T-5). The export in item 6 fixes this for host stacks; dev-cpu gets `--build`.

**Task order and gate statuses** (tasks.md will be renumbered by script, so every T-reference across the docs is remapped):
8. P19 refuses prod before AWS is set up (T-1). Fix: apply it only once prod's route names a paid adapter.
9. Stage `routing.yaml` (T-2):
   - T020 has `local` only;
   - T073 adds `synthetic` and dev's fallback;
   - T102 adds `bedrock` with a placeholder;
   - T105 fills it in, adds prod's fallback, and appends a new price version (T nit).
10. T046 seeds and proves too early (T-3). Fix: T046 stops at setup and up. A new Author step (Heavy) after T057 runs `pin-images`, `pull`, and `seed` before T064.
11. No task runs `make tools` (T-4). Fix: an Author step before Phase 1's note, and T046 checks `gitleaks version`.
12. Three checks fail with no PLANNED mark (T-6):
    - `validate-config` before T022's patch;
    - the disclosure rows the policy requires (start the disclosure in Phase 2);
    - `roles.expected`.
13. The behavioral evals stay PENDING in Phases 5 and 7 (T-7). Fix:
    - T099 commits the history entry;
    - add a Phase 7 Author rerun;
    - cases that need the closing patch are PLANNED.
14. T117 lacks bash-gate rules for the read-only roles, keyed on `agent_type` (T-8).
15. Heavy markers are missing on T099, T119, and quickstart §3.3, §4.2, and §6.2. T099 must run after T097 (T-9).
16. No task creates the `image` target (T-16).
17. The early patch changes `.claude/**` before the behavioral evals exist (T-17). Fix: T046 runs the static tier, and the Assumptions name it as a deviation.

**Security:**
18. ✓ `python3 -I` still loads planted `__pycache__` bytecode (G-2). Fix: every Python launched in the Author's terminal runs as `python3 -I -X pycache_prefix=$(mktemp -d) <script path>`; `make evals` must not use `-m`. Correct operator-admin.md's claim.
19. The Author's own `make check` and `make test` run `node_modules` (T-13). Fix: the Author runs `tools/gates/gate`, in quickstart §6 and in T118.
20. The engine's masked tree misses `secrets/` and the `*.env` globs (P-I5). Fix: build the mask list from the sandbox's read denies; refuse to start while a denied path is unmasked; E7 checks every path on the list.
21. T089's "main can't move" row would really move `main` before the patch (T-14). Fix: use `test -w` on the ref, and skip any planned row that writes.
22. §0.7 creates the bot token before the early patch, and `getUpdates` puts it in a URL (T-15). Fix: gate §0.7 like §0.8, use `curl -K -`, and add it to T065.
23. Telegram's token can reach undici client spans (G nit). Fix: `ignoreRequestHook`, or strip `url.*`.
24. Failed admin logins write one row each, with no rate limit (G nit). Fix: aggregate per window, and store the route template.
25. Edge forwards the client's `traceparent` (G nit). Fix: clear it on x000.

**Data model:**
26. ✓ Rebuilding the meters ignores the values stated at `init` (G-3). Fix: the newest `init` record in a current period becomes a floor: its value, plus the journal records after it.
27. ✓ The in-memory slots leak on three exit paths (G-4). Fix: release them in a `finally`, and count `h4.cost.usd` only when this transaction inserted the ledger row.
28. ✓ A journal failure after commit can't update the append-only audit row (G nit). Fix: add a new audit action, `journal_failed`.
29. Dev's thresholds must equal prod's (G nit). Fix: add rule B8.

**Spec deviations to name in the Assumptions:**
30. ✓ The runtime identity is created by hand, outside Terraform. The spec says "No cloud resources are created" (P-I1). Mark the dedicated user as pending the Author's confirmation.
31. ✓ Step 6's rollback clause (P-I2). Item 6 meets it; if it doesn't land, name the clause.

**Found by me while waiting:**
32. `.devcontainer/toolchain.env` matches the existing `*.env` deny rules and the compose policy. Rename it to `toolchain.vars`.
33. FR-010: the subagent-report hook logs nothing for a clean check ("log the result"), and its pattern matches `settings.json`, so reviews of this repository are flagged. Fix: the closing patch checks `last_assistant_message` first and logs every result.

**Nits:**
- **P:**
  - N1: ADR 0017's `uv sync`;
  - N2: dev-cpu's ports in ADR 0002, R-27, and the quickstart;
  - N4: ADR 0019's cause;
  - N5: the §18 and §19 rows, and the SeaweedFS pin as a risk;
  - stale ADR text in 0004, 0006, 0016, 0017, and 0018;
  - the index wording for 0015;
  - the gitleaks rules in plan §2 against §11;
  - quickstart §1.1 requiring §0.6;
  - ADR 0019's 0.4 GB;
  - the interview's local-time date label;
  - answers 7 and 8's confirmations missing from the Clarifications;
  - §17 missing the devcontainer and `make tools` downloads.
- **T:**
  - [P] markers on shared files;
  - §1.5 expects Phase 4 panels;
  - the test token's length;
  - §6.1 overstates its guarantee.
- **G** and **T** each have more nits beyond REVIEW.md's cap of five.

## For the Author
- **Decide:**
  - SC-003's "100% blocked" against the contained gap rows (analysis H1 and L6);
  - the gateway's open egress, whose premise in R-31 is wrong (P-I6): accept it for spec 000, or add a CONNECT allowlist now;
  - whether Haiku 5.5 still stands;
  - the dedicated `h4reet-runtime` user;
  - session 1's Clarifications rewrite;
  - `intent/002-the-room.md`, uncommitted on purpose;
  - accepting the ADRs.
- **Proposed CLAUDE.md lines** (from the reviewers' feedback):
  - "Scheduling a deny after the risk it guards: a secret, a paid route, or a file prod reads gets its deny in the same patch that creates it, or an earlier one."
  - "Treating `python3 -I` as isolation: it still loads `__pycache__`."
- **Stale CLAUDE.md lines:** `services/relay` and the kill switch; the engine line once T046 lands; and the "until spec 000" note on `make check`.

## Verification
`make check` at e7d5ab5: exit 0 (164 matrix rows passed, 4 known gaps). It wasn't rerun for this save point, which changes only documents.
