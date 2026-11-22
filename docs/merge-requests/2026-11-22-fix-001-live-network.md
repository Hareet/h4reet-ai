# fix/001-live-network

Spec: specs/001-cloud-elevation/ (bug-fixes F9 and F10, indexed in its `plan.md`) · Intent: none: two production bugs of 2026-11-18 · Written by: Claude Code (implementer, a subagent of the Author's session) · Date: 2026-11-22
Session: /home/h4reet/h4reet-ai/h4reet-ai, working in the worktree /tmp/claude-1000/wt-fix-001-live-network · Repo hooks active: yes (`.claude/audit/hooks.log`: `2026-11-22T16:14:12Z post-edit WARN lint failed :: …/deploy/hosts/test_shared_state.py`, fixed before commit; `2026-11-22T16:18:23Z bash BLOCK an Author-only make target (spec 001)`, a false match on runbook text in a heredoc; the edit went through the Edit tool, not a respelling)
Authorized by: the Author's session's brief of 2026-11-22: fix the two production bugs found on 2026-11-18 as spec 001's F9 and F10, test-first, for his review, gate, and merge

## What changed and why

**F9, a release never reconfigures the tunnel end's live private interface** ([`specs/001-cloud-elevation/fixes/f9.md`](../../specs/001-cloud-elevation/fixes/f9.md)). On 2026-11-18 release `20261118T001208Z-f1abe2454054`'s host step ran `networkctl reload` and `networkctl reconfigure ens5` (fix F2's way of loading its drop-in), networkd failed `ens5` ("Could not set DHCPv4 route: Nexthop has invalid gateway"), `ens5` lost `10.42.1.10`, nothing could publish on it, and the rollback failed too: the site was down until the Author set the address and the routes by hand. After a clean reboot networkd made the same drop-in perfectly. Now `shared_state.py prepare` never touches networkd: it checks `10.42.1.10` on `ens5` (waiting up to 30 s for a boot's lease), writes the drop-in for the next boot when it differs, makes table 105's default and rules 104/105 live with `ip`, as networkd made them after the reboot and only where missing, and checks the address again; a lost address or a failed command undoes the step's own changes, says so, and fails the step before compose runs, so the running release keeps serving. The runbook's T058 says the same, and no longer tells him to reconfigure `ens5`. Nothing else in the repository reloads or reconfigures networkd after the first boot (the user data's `runcmd`, once per instance, before anything binds); a test holds that.

**F10, the tunnel end lets go of a dead laptop session's forwards** ([`specs/001-cloud-elevation/fixes/f10.md`](../../specs/001-cloud-elevation/fixes/f10.md)). After the laptop froze, its restarted client was refused 2201 to 2203 for 15 minutes and more. The hypothesis (not verified against OpenSSH 9.6's source; f10.md gives the caveat): sshd's client-alive probe was starved by the relay's check through 2201 every second; what fits either way is that the session ended only when the kernel gave up retransmitting (`tcp_retries2` 15, about 924 s). Now the tunnel end's container retries a silent peer 8 times (about 100 s, its own network namespace only), and server mode ends the older sessions as soon as sshd logs its whole line `channel_setup_fwd_listener_tcpip: cannot listen to port: 2201` (or 2202, 2203), so the laptop's next try, 1 to 30 s later, takes the forwards.

Commits: `4ef79e2a` F9 RED, `72890316` F9 RED's correction (an order-sensitive assertion; f9.md says which), `9876c314` F9 GREEN, `4a41b0bf` F10 RED, `aec72793` F10 GREEN, `ba8f19a7` and `bd7e0765` the notes; then the review's rework: `f6963464` RED, `a89e8c88` GREEN, and this note's commit with the fix notes' updates.

**The review of `bd7e0765`, addressed:**

- **I1 (Important, Security):** the safety net matched the text anywhere in a line, so a stranger connecting to 2222 with the user name `cannot listen to port: 2201` could make it end the laptop's tunnel at will. It now matches only sshd's whole line, anchored at both ends with sshd's optional `\r`. Under `-e` that line has no `error: ` prefix (the night's journal shows it so, and OpenSSH names the level only in syslog), so the earlier tests' prefixed lines were wrong and are fixed. New cases that must not trigger: the stranger's `Invalid user …`, `Connection closed by invalid user … [preauth]`, and `kex_exchange_identification: … invalid protocol identifier "…"` lines, port 22010, and the line with anything before or after it; and, end to end, the stranger's three lines leave both sessions alive.
- **Nit 1:** an undo no longer deletes a drop-in that was missing before the step (a rollback to `f1abe245`'s step would have found it "changed" and run `networkctl`); it keeps it, since its text is this release's, and restores only a changed one. A test runs F2's rule after each kind of undo.
- **Nit 2:** f9.md's backlog F9-1 says `make_live` only adds.
- **Nit 3:** f10.md's cause is a hypothesis with the reviewer's caveat; the fix doesn't depend on it.

**A departure from F2, said:** F2's tests pinned `networkctl reload` and `networkctl reconfigure ens5`; those pins are the bug, and F9's RED commit replaces them in the same tests. Everything else they hold is kept. F2's backlog R-1 and R-2's other half close.

## Acceptance criteria

Spec 001 FR-019 and FR-060 (the shared state on the tunnel end, which the host step prepares), FR-052, FR-053, and FR-055 (the tunnel, its forwards, its reconnection), and the deployer's "a failed step is a failed start" (contracts/releases-deployer.md §3). No spec text changes: both are bugs against behavior the spec already requires.

## Constitution check

| Principle                                                          | Touched | How it complies                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Data-Local by Default                                           | No      | No byte leaves a device that didn't before; no new endpoint or flow, so no disclosure entry.                                                                                                                                                                          |
| II. Production-Grade or Not Shipped                                | Yes     | Tests first for both (RED, then GREEN); runbook entries for the symptom and the fix (T058); the safety net logs each takeover; no new endpoint, span, or panel is called for: these are host and tunnel fixes, observable through the deployer's record and the logs. |
| III. Intent Before Spec, Spec Before Code, Humans Merge            | Yes     | Bug-fixes against spec 001's existing requirements, as F1 to F8 were; fix notes indexed in its plan; nothing merged, pushed, or published; the Author gates and merges.                                                                                               |
| IV. Least Privilege                                                | Yes     | The tunnel's container gains no capability (the sysctl is its own namespace's, and signalling its own user's processes needs none); the host step's new commands are `ip`, as root, where it already ran `networkctl`.                                               |
| V. Cost Is a First-Class Signal                                    | No      | No new resource, call, or route: $0.                                                                                                                                                                                                                                  |
| VI. Build in Public, Including Failures                            | Yes     | Both fix notes record the outage, the evidence in the journal's words, and what isn't proven here.                                                                                                                                                                   |
| VII, VIII                                                          | No      | Nothing about the twin's words or claims.                                                                                                                                                                                                                             |
| Security & Agent Governance: human-only paths, plan-only infra     | Yes     | No human-only path edited, so no patch; nothing in `infra/`; no AWS, Terraform, release, or prod command run.                                                                                                                                                        |

## Review

A reviewer that wrote none of it, read-only, in two rounds.

**Round 1, `bd7e0765`: CHANGES REQUESTED.**

- I1 (Security): `holds_forward` matched the conflict text anywhere in a log line. sshd logs a stranger's username
  as sent, and 2222 is open to anywhere, so anyone could end the laptop's tunnel and admin sessions without a key.
- Nit 1: an undo removed a new drop-in, and the rollback to f1abe245 would then run networkctl.
- Nit 2: `make_live` only adds.
- Nit 3: f10.md's cause was unverified.

**Round 2, `c1a44039`: APPROVE.**

- The matcher now takes only sshd's whole line. Stranger-controlled lines don't match, and a prefixed line fails
  silent, not open.
- An undo keeps a new drop-in and restores a changed one.
- F9-1 now says `make_live` only adds, and the cause in f10.md is a hypothesis with F10-2 to settle it.
- RED: 14 failed. Tip: 686 passed, 9 skipped. ruff, shellcheck and prettier clean. The make check mktemp failure
  reproduces on main in this sandbox.
- Open for the Author: the drop-in pre-check, the rule and route readings after the release, and F10's live steps.

## Verification

Below, pasted from this worktree: the touched suites, `make -f Makefile lint`, and `make -f Makefile check ENGINE_MODE=none-yet`. No Docker, GPU, or network beyond loopback here: the tunnel's nine container checks skip ("the agents' engine isn't answering"), the new one among them.

The touched suites, at the tip:

```text
$ pytest deploy/hosts/ deploy/tunnel/ -q -p no:cacheprovider
160 passed, 9 skipped in 29.06s
$ pytest deploy/scripts/test_deployer.py deploy/scripts/test_compose_env.py deploy/scripts/test_preflight.py tools/gates/test/test_compose_policy.py -q -p no:cacheprovider
526 passed in 8.51s
```

The rework's RED and GREEN, whole, are in f9.md and f10.md ("The rework's runs").

`make -f Makefile lint`, whole (shellcheck's long file list cut at 400 characters):

```text
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
960 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limit …
exit 0
```

`make -f Makefile check ENGINE_MODE=none-yet`, rerun after the rework, its summary (the same as before it):

```text
PASS     githooks-check
PASS     toolchain-check
PASS     policy
PASS     validate-config
PASS     lint
FAIL     test
PASS     content-check
PASS     secrets
PASS     arrival
FAIL     infra-check
SKIP     infra-plan-note  no infra change
PASS     disclosure-check
WARN     evals  WARN (behavioral tier): no run for trigger hash 9d6bd993305f in evals/agent-config/history/; the Author runs make evals-agent-config REF=<branch> from main's checkout, and commits its 
PASS     redteam
PASS     matrix
SKIP     image  no agents' engine yet: tasks.md T046
make check: 12 PASS, 2 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 2 FAIL; failing: test FAIL, infra-check FAIL
make: *** [Makefile:168: check] Error 1
exit 2
```

Both failures are this sandbox's, not the branch's, and neither touches a file it changes:

- `test`: 7509 passed, 14 skipped, 1 failed (rerun at the rework's tip; 7498 before it), `scripts/infra/test_infra_targets.py::test_infra_check_runs_the_policy_then_waits_for_terraform`: `mktemp: failed to create file via template '/tmp/tmp.XXXXXXXXXX': Read-only file system` (the test's `make` runs without this session's `TMPDIR`, and `/tmp` is read-only here).
- `infra-check`: `infra-policy: PASS, 32 files`, then Terraform's AWS provider can't start in the sandbox ("Failed to read any lines from plugin's stdout"). No file under `infra/` changes.
- `evals` WARN: the behavioral tier has no run for this trigger hash; this branch touches nothing under `.claude/` or the agent configuration, so his gate skips that step.

His gate, from main's checkout, is the run that counts.

## Cost and data-flow impact

None. No AWS resource, model call, or data flow changes. The tunnel end's image is rebuilt by the release (its entrypoint changed), as any change under `deploy/tunnel/` does.

## For the Author

No patches for his hand: no human-only path is touched.

1. **His gate,** from main's checkout: `tools/gates/gate fix/001-live-network`, then the merge it prints. The F10 container check (`test_a_frozen_clients_forwards_go_to_its_next_connection`, with the tunnel's eight older container checks) skips without an engine; it runs only on his, with the tunnel image he builds there.
2. **Before the release,** on the tunnel end, the drop-in exists, so a rollback's step can only find it unchanged: `ls -l /etc/systemd/network/70-ens5.network.d/zz-h4-reply-route.conf` shows the file, 0644. If it's missing, stop and ask: a step that fails before it writes the drop-in (the address missing, say) would leave it missing, and the rollback's step, `f1abe245`'s, would then write it and run `networkctl`.
3. **One release.** Both fixes ride it: F9 in the tunnel end's host step, F10 in the tunnel end's image and its compose service. The drop-in's text is unchanged, so if this release must roll back, `f1abe245`'s host step finds nothing changed and runs no `networkctl`.
4. **On the tunnel end,** in his Systems Manager session, as root (f9.md, "The Author's morning steps", step 2): `ip -4 -o addr show dev ens5` has `inet 10.42.1.10/24`; `networkctl status ens5 --no-pager` reads `routable (configured)`; `ip -4 rule show` has 104 and 105, `proto static`; `ip -4 route show table 105` reads `default via 10.42.1.1 dev ens5 proto dhcp metric 512`; the deployer's last record reads `deployed`; `/api/status` answers. And `ip -4 -j rule show`, read once against the step's parsing: rule 104 shows `"src":"all"`, `"fwmark":"0x105"`, `"table":"105"`, and rule 105 `"src":"10.42.1.10"`, `"table":"105"`. Other field names or forms would make the step miss existing rules, try to add them, get `EEXIST`, undo, and roll back (safe, and said); send the output if they differ.
5. **F10's checks** (f10.md, "The Author's morning steps"): `tcp_retries2` reads 8 inside `h4reet-prod-tunnel-end-1` and is unchanged on the host; then on the laptop a `docker kill` and `docker start` of `h4reet-prod-tunnel-1`, which reconnects within about 30 s; then the night's case, the tunnel container's `h4reet-prod_egress` network disconnected for 45 s and connected again: the tunnel is back within about two minutes, with at most one `cannot listen` line followed by the safety net's line on the tunnel end, and no restart.

**Questions, each with the recommended answer taken:**

- **A missing address before the step fails the start** (as built), after a 30 s wait. Recommended: yes; Docker couldn't bind anyway, and the message names the runbook item. Other answer: skip the reply route's step and let compose fail.
- **The safety net ends every older session**, the admin-only client's included. Recommended: yes; the laptop's client holds one connection at a time, and the admin client reconnects by its own loop. Other answer: end only sessions that hold a forward, which needs `/proc/<pid>/fd`, which sshd's processes may not let its user read.
- **`tcp_retries2` 8** (about 100 s). Recommended: 8; 5 (about 13 s) would end a healthy tunnel on a short home-network outage. Other answer: leave the default and rely on the safety net alone.
