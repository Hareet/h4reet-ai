# docs/000-claude-pin-rule
Spec: specs/000-local-foundations/ (T013; FR-005, FR-011, SC-008) · Intent: specs/000-local-foundations/intent.md · Written by: Claude Code (Opus 5.5), a subagent of the integrating session · Date: 2026-10-18
Session: worked in `/tmp/claude-1000/wt-pin`, launched from `~/h4reet-ai/h4reet-ai` · Repo hooks active: yes. `.claude/audit/hooks.log` holds 82 bash and 22 edit ALLOWs from this session and no refusals, for example `2026-10-18T01:23:46Z bash ALLOW cd /tmp/claude-1000/wt-pin && grep -n -E "^FAIL|FAILED|failed|Error|ERROR" /tmp/claude-1000/check-pin.out ...`. The post-edit hook also reformatted a Markdown table in a scratch copy of the history README, and that edit was redone by script.
Authorized by: the Author's direction of 2026-10-17, relayed by the integrating session: the Author doesn't want to pin the global Claude Code install that their other projects share, and asked to "change the pin demand later".

**Status: a proposal, for your decision.** This branch was cut from 58bd232, main's tip. It proposes [ADR 0023](../adr/0023-claude-code-pin-is-a-floor.md): Claude Code's pin becomes a floor. **Accepting it takes two commits on main: the patch first, then this branch's merge. Rejecting it means neither.** Patches usually go on main after the merge; this one has to go first. The gate runs main's own `toolchain_check.py`, which fails every branch on your Claude Code 2.1.301, this one included. While that step fails, the gate prints no merge command (step 2 below).

## Runs in the Author's terminal

ADR 0017 puts this section first.

| What | How it runs | Check before you apply it |
|---|---|---|
| `docs/merge-requests/2026-10-18-docs-000-claude-pin-rule.patch`, as committed in c25a9f10aabc37aca6e66523ff4890c6ec603cff | `git apply --index` on main, from main's checkout, before you gate this branch. The commands are under For the Author, step 2. `git apply --stat` first: it should list exactly seven files, under `tools/gates/` and `evals/agent-config/`. | **`tools/gates/toolchain_check.py`:** `FLOORS` holds `CLAUDE_CODE_VERSION` and nothing else. `newer()` compares release numbers, so 2.1.301 is newer than 2.1.296 and 2.1.30 isn't. A newer Claude Code is a `WARN` row plus a line starting `WARN:`, and the check exits 0. An older one is DRIFT. **`tools/gates/gate`:** the `toolchain` step becomes WARN when the check passed and printed a `WARN:` line. A non-zero exit still fails it. **`evals/agent-config/behavioral.py`:** in `run`, `at_least()` replaces the exact-pin test. A passing status line names the Claude Code version that run used, printed only when it's digits and dots. The trigger hash is unchanged. **`evals/agent-config/history/README.md`:** the two version keys. **Tests:** four new in `test_toolchain_check.py` and two in `test_gate.py`. `test_behavioral.py` gets three new tests, and a fourth, `test_run_refuses_a_claude_code_below_the_floor`, replaces `test_run_refuses_a_claude_code_off_the_pin`. |

## The decision

| | Rule | Cost per Claude Code update | What it catches |
|---|---|---|---|
| **A, recommended** | The pin is a floor. A newer host is a WARN, and the evals record the version they ran. | None | An older Claude Code. A newer one shows in each gate summary and each evals entry, but the evals don't re-run for it. |
| **B** | As A, plus a gate step that waits (PENDING) while the host is newer than the newest attested evals run. | One evals run before the next merge, about $5 and 20 to 45 minutes. At the rate seen so far (four versions on the host in nine days), that's about one a week. | An update that changes the permission rules or the hook calls, found at the next merge. Sessions run on the new version from the moment it installs, so B finds the change; it doesn't prevent it. |
| **C** | The exact pin, which you keep in step with the host. | A pin commit and an evals run per update, or the global `DISABLE_AUTOUPDATER` you declined. Until the pin follows the host, every gate fails. | Everything, while the install is held. |

**Why A:**

- It's the change you asked for, and an update costs nothing.
- Each evals entry already names the Claude Code that ran, and the gate's summary line, which goes into each merge commit, counts the WARN.
- The layer most exposed to a binary change, the sandbox, is still re-tested in every agent session (stage S of `make check`).

What A gives up: a Claude Code update that changes the permission rules or the hook calls goes unnoticed until the next evals run, which comes with the next branch that touches the triggers or moves the floor. B closes that gap for about one evals run a week, and it's a small step on top of A if you want it later. ADR 0023 also covers a fourth option and why it lost: a project-only Claude Code, pinned exactly.

## What changed and why

- **The problem:**
  - `toolchain_check.py` marks any Claude Code other than `CLAUDE_CODE_VERSION=2.1.296` DRIFT, and the gate's `toolchain` step fails with it.
  - `DISABLE_AUTOUPDATER` reaches only sessions started here, so Claude Code updated itself from your other projects to 2.1.301.
  - So every gate run fails, whatever the branch.
- **On the branch, for you to review:**
  - [ADR 0023](../adr/0023-claude-code-pin-is-a-floor.md) (proposed), and its row in the [ADR index](../adr/README.md);
  - plan §9 and §14, quickstart §0.3, and a note under T013, each describing the rule as proposed;
  - spec 000's Assumptions, which name the constitution's Development standard ("a devcontainer defines the single toolchain used by humans, agents, and CI") as the deviation A would be, for the agent harness alone.
- **The patch:** the code, on human-only paths (above).
- **Not changed:** `.devcontainer/toolchain.vars` and the Dockerfile. The pin stays 2.1.296 and becomes the floor. Moving it would change the evals' trigger hash, so the branch doesn't touch it.

## Acceptance criteria

None: a proposed process change. T013's check (FR-005) and the agent-config evals (FR-011, SC-008) stay, with Claude Code's pin read as a floor.

## Constitution check

| Principle | Touched? | How it complies, or the justified deviation |
|---|---|---|
| I. Data-local | No | No data flow changes. |
| II. Production-grade | Yes | Tests come with the code, and each new behavior test fails without it (Verification). Degraded mode is unchanged: a missing or older Claude Code still fails `make check` and the gate. |
| III. Intent → spec → code | Yes | An ADR for your decision, with the plan, quickstart, tasks, and spec Assumptions updated in the same branch. Nothing merges or applies without you. |
| IV. Least privilege | Yes | Human-only paths change only through the patch. `.claude/**` is untouched. The trade-off is the one A gives up: an update's effect on permission rules and hook calls is checked at the next evals run, not at the update. |
| V. Cost | Yes | $0 cloud. One evals run after the patch (Cost, below). |
| VI. Build in public | No | No secrets; gitleaks found nothing on either commit. |
| VII. Own the whole product | No | No claims about the Author. |
| VIII. Honest AI | No | No twin change. |
| Technology Standards: Development | Yes | **Proposed deviation:** for Claude Code alone, the devcontainer would define the minimum version, not the exact one. Spec 000's Assumptions and ADR 0023 name it. |

## Review

None yet. No reviewer agent has run `REVIEW.md` on this branch. The integrating session can start one before you decide.

## Verification

- **The patch, in a detached scratch worktree of this branch** (`git worktree add --detach`, then `git apply --index`, then the commands below; the worktree was removed afterwards):
  - `pytest` on `tools/gates/test/test_toolchain_check.py`, `tools/gates/test/test_gate.py`, `evals/agent-config/test_behavioral.py`, `test_static.py`, `evals/test_docs_links.py`, and `evals/test_repository_docs.py`: 498 passed. The one failure was docs-links not yet finding this note, which is committed last.
  - `ruff check .`: all checks passed. `ruff format --check --extend-exclude corpus .`: 191 files already formatted, and `tools/gates/gate` too. No shell script changed.
  - The patched check on this host: `claude code  2.1.296  2.1.301  WARN`, then `WARN: claude code 2.1.301 is newer than its floor, 2.1.296 (ADR 0023): ...` and `toolchain-check: all 15 match their pins, 1 newer than its floor (claude code)`, exit 0.
  - The patched `behavioral.py status`: PENDING for trigger hash 93d6b2afc027, since the patch changes `evals/agent-config/`. Without the patch: PASS for 3f4caf1b916a, from the run of 2026-10-12.
- **The new tests against the unpatched code**, with the code files reverted and the tests kept: 8 of the 10 fail.
  - `test_newer_compares_release_numbers` and `test_at_least_takes_the_pin_its_series_and_later_releases` fail on the missing function.
  - `test_claude_codes_pin_is_a_floor` fails on DRIFT where WARN was expected, and `test_main_passes_a_newer_claude_code_with_a_warn_line` on exit 1 where 0 was expected.
  - `test_a_claude_code_above_its_floor_is_a_warn_the_merge_doesnt_wait_on` fails on PASS where WARN was expected.
  - `test_run_refuses_a_claude_code_below_the_floor` fails because the old message lacks "a floor". `test_run_takes_a_claude_code_above_the_floor_and_records_it` fails on the exact-pin refusal (exit 2).
  - `test_status_names_the_claude_code_the_deciding_run_used` fails because the PASS line names no version.
  - The other two are guards that pass on both sides by design. `test_only_claude_codes_pin_is_a_floor` checks that the floor doesn't spread to other tools. `test_a_warn_line_never_hides_a_failing_toolchain` checks that a WARN line can't mask a failure.
- **`make check ENGINE_MODE=none-yet`** on the branch as committed, without the patch:

  ```text
  claude code              2.1.296  2.1.301  DRIFT   /home/h4reet/.nvm/versions/node/v22.18.0/bin/claude
  toolchain-check: 1 of 15 differ from their pins (claude code); see tasks.md T013
        Tests  747 passed | 12 skipped (759)
  2457 passed in 159.17s (0:02:39)
  agent-config behavioral: pass, 0 planned
  docs links: 0 failed, 833 relative links in 84 files
  forbidden-actions (hook layer): 658 passed, 0 failed, 40 known gaps

  PASS     makefiles-check
  PASS     githooks-check
  FAIL     toolchain-check
  PASS     policy
  PASS     validate-config
  PASS     lint
  PASS     test
  PASS     secrets
  PASS     evals
  PASS     redteam
  PASS     matrix
  SKIP     image  no agents' engine yet: tasks.md T046
  make check: 10 PASS, 1 SKIP, 0 PLANNED, 0 PENDING, 1 FAIL; failing: toolchain-check FAIL
  ```

  The only failure is the one expected without the patch: Claude Code 2.1.301 against its pin of 2.1.296. `evals` passes because the branch changes nothing in the trigger hash. The first run, made before this note existed, also failed `test` and `evals`, on docs-links: the ADR links to this note.

## Cost and data-flow impact

- $0 cloud. No production model calls.
- **Dev-time:** the patch changes `evals/agent-config/behavioral.py` and its tests, which are in the trigger hash. So once it's on main, `make evals` shows PENDING on main and on every branch from it, until one evals run passes. That's about $5 notional and 20 to 45 minutes on the Team plan (FR-037). After that, a Claude Code update by itself costs nothing.
- No data-flow disclosure entry: nothing new leaves the device.

## For the Author

1. **Decide.** Read [ADR 0023](../adr/0023-claude-code-pin-is-a-floor.md). To reject it, or to choose B or C, don't apply or merge anything: tell a session which, and this branch is redone.
2. **To accept, apply the patch on main first,** from main's checkout, reading it from the commit by SHA so later changes in the agent's worktree can't reach it:

   ```bash
   git --no-replace-objects cat-file blob c25a9f10aabc37aca6e66523ff4890c6ec603cff:docs/merge-requests/2026-10-18-docs-000-claude-pin-rule.patch | git apply --stat
   git --no-replace-objects cat-file blob c25a9f10aabc37aca6e66523ff4890c6ec603cff:docs/merge-requests/2026-10-18-docs-000-claude-pin-rule.patch | git apply --index
   git commit -m "Apply the Claude Code floor patch (ADR 0023)"
   ```

   This order isn't the usual one, for this reason:
   - The gate runs main's `tools/gates/toolchain_check.py`, which fails this branch and every other on Claude Code 2.1.301.
   - While that step fails, the gate prints no merge command.
   - Until main has the patch, `make evals-agent-config` refuses 2.1.301 too.
3. **Gate this branch:** `tools/gates/gate docs/000-claude-pin-rule`, then the merge command it prints. Expected:
   - `toolchain` is WARN, naming Claude Code 2.1.301 above its floor of 2.1.296;
   - `agent-config-evals` is SKIP, since the branch touches none of its triggers;
   - the summary counts one WARN.

   The gate will also say that main has a commit the branch doesn't: that's the patch. The merged tree, 58bd232 plus this branch plus the patch, is the tree the scratch worktree verified, plus this note.
4. **The evals run for main's new trigger hash.** From main's checkout:
   1. `git branch evals/000-claude-floor main`
   2. `make evals-agent-config REF=evals/000-claude-floor`
   3. Paste the commands it prints.
   4. `tools/gates/gate evals/000-claude-floor`, then the merge.

   Or let the next agent branch from main carry the run. Until one passes, `make evals` is PENDING everywhere.
5. **ADR 0023's status** says "proposed". Once you've accepted it, change it to "accepted, 2026-10-18" in the ADR and in the index, or ask a session to.
6. **Something to know:** ADR 0018's file and the ADR index still mark it "proposed". ADR 0023 replaces one Decision point and one Consequence of it either way.
