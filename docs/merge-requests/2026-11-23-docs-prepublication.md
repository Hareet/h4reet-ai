# docs/prepublication

Spec: none: the pre-publication documents (the README, the third-party notices, the security posture page, the incident notes, and the Well-Architected review's corrections); one spec amended, 023's FR-012, test-first · Intent: none · Written by: Claude Code (docs role, a subagent of the Author's session; a read-only Explore subagent gathered the specs' states, spot-checked here) · Date: 2026-11-23
Session: /home/h4reet/h4reet-ai/h4reet-ai, working in the worktree /tmp/claude-1000/wt-docs-prepub (branch `docs/prepublication` from `stack/2026-11-22b` at 408594d2: main 37e4a623 with `fix/032-launch-policy`, `feat/034-langfuse-dashboards` and `fix/001-f11-log-trigger`). While it was built, `main` moved to abbfc554: the stack merged, with P-032-launch-policy (e009ebeb) and the fix's plans (7d67fa4a). This branch shares no file with those two commits and merges onto `main` cleanly (`git merge-tree --write-tree refs/heads/main HEAD`); its gate's `infra-plan-note` reads from the merge base, 408594d2, where this branch changes nothing under `infra/` · Repo hooks active: yes (`.claude/audit/hooks.log`, four refusals, none respelled: `2026-11-23T01:17:11Z bash BLOCK an Author-only make target (spec 001)`, a read-only grep whose pattern named the cloud rollback target, so the file was read with the Read tool; `01:47:23Z` the same, an edit in a heredoc whose text named the Author's stop target, made with the Edit tool instead; `01:48:20Z bash BLOCK an Author-only make target`, a copy of this note's draft whose text named the gate's own targets, written with the Write tool instead; and `02:03:32Z bash BLOCK changing main (HEAD is main)`, a commit while main's checkout was on `main`, made at 03:05Z once it was parked again. Each commit ran gitleaks, "no leaks found", and the arrival check, "0 findings")
Authorized by: the Author's session's brief of 2026-11-22: build the pre-publication docs branch (the README's status and spec table, the Spec Kit notice, the security posture page from the Well-Architected synthesis, the incident notes, the review's six corrections, and this note); and its addition the same evening: the films' MP4s leave git for the release `films-v1`, so the landing pages and the README's Films section change with them

## What changed and why

1. **[README.md](../../README.md).** The status block, last touched on 2026-11-12 ("Phase 0, spec 000 in progress. No visitor-facing product yet."), now says the site is live at hareet.ai since 2026-11-17, what a visitor can do (enter the room, choose an avatar, talk with the twin by text on the topics marked ready; voice and open conversation not ready), how it serves (EC2 on spot in its scheduled hours through the tunnel end, the Anthropic API first; the laptop local-first for demos), and what the 2026-11-22 release added. The spec table lists all 32 specs and spec 031 by their real state, from `main`'s merges, each `tasks.md`, and the merge-request notes: 031 on its own branch, not merged; 034, F11 and `fix/032-launch-policy` merged with the stack on 2026-11-22 (the rows were written before that merge and brought up to it). It links [the security posture page](../security-posture.md), the incident notes, SECURITY.md, and the third-party notices. Two lines the status overtook ("The product (Phases 1–3, not built yet)", "The engineering (spec 000, being built)") and the disclosure's old "No visitor data flows in this spec." quote are corrected. Public URLs say hareet.ai.
2. **[THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).** GitHub Spec Kit 1.0.8 (`.specify/**`, 49 files, and `.claude/skills/speckit-*/SKILL.md`, 15) with its MIT text, copied from the `specify-cli` 1.0.8 package installed on this machine from `https://github.com/github/spec-kit`, tag `v1.0.8` (commit 0cc9a6a1; `dist-info/licenses/LICENSE`, SHA-256 2510b446…eb534f7): "Copyright GitHub, Inc.". `.specify/` is a human-only path (CODEOWNERS), so the notice sits at the root. The other vendored items the sanitization audit called compliant are listed with where their licenses sit, each checked here: the fonts (IBM Plex, Patrick Hand, Literata, Overpass; OFL 1.1, 64 files), GSAP 3.14.2 (its standard "no charge" license, not MIT), huashu-motion 0.4.0's `om.js` (MIT; byte for byte its `runtime/om.js`), and Kokoro (Apache-2.0 per `kokoro-onnx` 0.6.1's metadata; the model isn't in the repository, only its output).
3. **[docs/security-posture.md](../security-posture.md), "Security posture and known gaps".** From `/tmp/claude-1000/waf/synthesis.json`: what was reviewed and how (five reader agents through the 11-16-2026 edition's 1,135 pages, one synthesis, 2026-11-22; the repository at main 37e4a623, not the AWS account); the scorecard by pillar (261 practices: 74 meet, 144 partial, 28 gap, 15 not applicable); what is by decision, with the Author's words from ADR 0057 verbatim; the nine decisions D01 to D09, each with its recommended option and "decision pending"; the start-now batch R01 to R08 and the other 27 items, each with a Status (`open`, or `in flight: <branch>`: R01 `fix/032-launch-policy`, R07 this branch, R10 `feat/031-ci`); the two findings fixed before publication; the six corrections; and how to report a vulnerability. Framework text is quoted only in short phrases with PDF pages (1071, 587). Gaps are stated without operational detail: no host addresses or ports beyond the design, no list of missing detections, nothing about the other work's identities in the shared account.
4. **[docs/incidents/](../incidents/),** three notes in the folder's template (What happened, Timeline, Detection, Impact, Root cause with contributing factors, Fix, The eval that would have caught it, Follow-up intent), blameless, each with what detected it, the time to recover, the fixes with their branches, and open questions:
   - [2026-11-18-tunnel-end-network.md](../incidents/2026-11-18-tunnel-end-network.md): release `20261118T001208Z-f1abe2454054` reconfigured the live `ens5` (00:24:36Z, `rollback_failed`, serving again 00:44:29Z after the hand recovery); networkd removed the hand rules at 00:58:14Z and the store alert stood until 03:03Z; the dead laptop session held the forwards until 03:19Z. F9, F10, F11.
   - [2026-11-18-ec2-capacity.md](../incidents/2026-11-18-ec2-capacity.md): `InsufficientInstanceCapacity` for `t4g.large` in `us-east-1a` at 14:01:01Z and 14:15:27Z and by hand at about 17:40Z, which became intent and spec 032. Who stopped EC2 near 01:00Z is said to be unknown, with the evidence's expiry.
   - [2026-11-22-first-real-replace.md](../incidents/2026-11-22-first-real-replace.md): the dry runs refused for all eight types after the account's apply, then the first real replace at 128 MB (lock 21:58:12Z, the cancel that terminated EC2 at 22:07:23Z, killed at 900 s, the CLI's retry answering `busy`), recovered with 1,024 MB and one waiting invoke, EC2 back on `m7g.large` at 22:33Z.

   Sources: the merge notes of `fix/001-live-network`, `feat/032-spot-flexibility`, `fix/032-launch-policy` and `fix/001-f11-log-trigger`; f9.md, f10.md, f11.md; ADR 0057; the apply records on `ops/apply-prod-2026-11-18`, `ops/apply-prod-2026-11-22` and `ops/apply-account-2026-11-22`; and the runbook's "Done so far". What the record doesn't hold stays marked as such (who stopped EC2; when the laptop came up on 11-18; whether the deployer's and the probe's alerts reached Telegram; whether EC2 ran between 11-18 and 11-22). No instance, volume, group, interface, request, or zone ID, and no address: the scan below. `docs/incidents/README.md` gains a list of the three notes.
5. **The review's corrections,** each checked on this tree first (the posture page's table holds all six):
   - [spec 032's cost estimate](../../specs/032-spot-flexibility/spec.md#cost-estimate-constitution-principle-v): "about $7" struck for $9.45 a month at `us-east-1a`, the Author-confirmed figure (spec 001 research R-05, "yes t167 confirmed"); EC2 has run `m7g.large` since 2026-11-22.
   - [ADR 0057](../adr/0057-spot-with-interchangeable-types.md) and its index row: accepted, 2026-11-22. Its condition was met that day: merged (6f792d2e, with d9d893dd "032's two patches", onto main at f2f63e7f), prod's apply (19:49Z to 19:50Z) and the account's (21:41Z to 21:43Z) recorded on their `ops/apply-*-2026-11-22` branches.
   - ADR 0057's open question: no trail, so the evidence of the 01:00Z stop (event history, and the guard's log group at 90 days, `infra/account/handover.tf`) expires about 2027-02-16 unless exported.
   - [server-budget.md](../runbooks/server-budget.md): T030's step 3 (activating the tags) isn't in the record, so the filter may count nothing until confirmed; "RDS" dropped from the usual lines (R-20 replaced it).
   - [the deployer's contract, §4](../../specs/001-cloud-elevation/contracts/releases-deployer.md#4-rollback-and-holds-fr-047-fr-049): the cloud rollback target struck as not built; the laptop's way back is rollback.md's; FR-047's "one command away" is open for the cloud hosts (R29).
   - **Not written: `probe-failing.md` and `certificate.md`.** The alert code says what `probe_failing` means (h4-probe's two checks, 200 within 5 s and a `serving` field, failing five minutes running, a missed run counting as a failure) but not what to do for each failing check, and no runbook covers the edge or the site's bucket. For `cert_expiring`, the bridge maps ACM's "Certificate Approaching Expiration" event, but no EventBridge rule in `infra/` routes `aws.acm` events to `h4-alerts` (the September contract had one), so the alert can't arrive today, and the code says nothing of what to do. Both stay open (R06).
6. **The films' MP4s leave git** (the addition to the brief). Spec 023's FR-012, its scenario 2 and edge case, plan §1 and §3 case 2, and tasks T014 and T015 are amended, the old text struck beside the new. `film-links.test.ts` case 2 now requires each linked film's landing page to carry "Download the film" to `https://github.com/hareet/h4reet-ai/releases/download/films-v1/<file>` and no link to an MP4 in the tree, and no longer requires the MP4 tracked: RED, then GREEN. The seven landing pages (`films/{cost-meter,data-flows,evals,kill-switch-b2,lifecycle,local-first,stack}/README.md`): "Watch the film" and the stale "arrives with the media commit" line give way to "The film plays on this page once the Author adds it, after the repository is published", the player's place `<!-- player: the Author pastes the uploaded video's URL here -->`, and "Download the film (MP4, <size> MB)" with the sizes measured from the blobs (cost-meter 27.9, data-flows 25.2, kill-switch 24.6, local-first 21.6, evals 26.0, lifecycle 47.5, stack 56.3). The six stale "Switched on in the media commit" comments go; the kill switch's GIF stays and no longer links the MP4. The README's GIF and each Films row point at the landing page. `films/README.md` records where the films live; `films/RESUME-LINKS-PLAN.md` gets a dated note; [ADR 0050](../adr/0050-films-media-in-git.md) gets an amendment (still proposed) and its index row. No folder or file renamed.
7. **[SECURITY.md](../../SECURITY.md)** gains "Known gaps", which links the posture page, and drops "once spec 000 lands".

Commits: `f463af7c` notices · `eb30565a` incidents · `d93a9076` posture page · `25bd4216` corrections · `823847ea` 023 RED · `eb405a59` 023 GREEN · `44c79c41` ADR 0050 · `ad3e91aa` README · `febd1624` SECURITY.md · `d56334a7` the wording pass · then the stack's merge brought into the README, the posture page and two incident notes, and this note.

## Acceptance criteria

None for the documents: process and publication work. Spec 023's FR-012 as amended 2026-11-23 (scenario 2 of its US3; tasks T014, T015), held by `film-links.test.ts` case 2. Spec 001's FR-047 is named open for the cloud hosts, not changed.

## Constitution check

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-Local by Default | No | No byte leaves a visitor's device that didn't before. The films live on GitHub (the release and its pages), which the site neither serves nor embeds, so no disclosure row changes |
| II. Production-Grade or Not Shipped | Yes | The incident notes give each outage's detection, recovery, fix, and the eval that would have caught it; the runbook and contract corrections make the operator's pages match the code; spec 023's change is test-first |
| III. Intent Before Spec, Spec Before Code, Humans Merge | Yes | The only code is spec 023's test, changed with the spec, the plan and the tasks in the same commit, from the Author's decision as relayed; nothing merged, pushed, or published |
| IV. Least Privilege for Humans and Agents Alike | No | No permission, role, policy, or setting touched |
| V. Cost Is a First-Class Signal | Yes | Spec 032's figure corrected to the Author's $9.45; the posture page carries the review's cost items; no spend |
| VI. Build in Public, Including Failures | Yes | Three incident notes; the known gaps stated; each correction keeps the wrong text struck beside the right |
| VII. Own the Whole Product — and Say Exactly What You Owned | Yes | No new fact or number about the Author; his words are quoted verbatim (ADR 0057's); the review's readers are named as agents |
| VIII. Honest AI | No | Nothing about the twin's words, corpus, or guardrails |
| Security & Agent Governance | Yes | Incident notes for the production incidents; no human-only path edited (`.claude/**`, CLAUDE.md, REVIEW.md, the constitution, `corpus/`, `tools/gates/**`, `.specify/`, `redteam/forbidden-actions.sh` untouched); no AWS, Terraform, release, or prod command run; no account ID, address, resource ID, or secret written |

## Review

## Verification

Run in this worktree: no Docker, no GPU, loopback alone; `node_modules` from `npm ci --cache $TMPDIR/npm-cache`. `make check` ran on the branch at `febd1624` plus the wording pass and this note, which change Markdown alone (`docs/`, `THIRD_PARTY_NOTICES.md`); the fast checks ran again on the final tree.

**The doc checks:**

```text
$ python3 -I -B -X pycache_prefix=/dev/null evals/docs_links.py
PASS  every relative link resolves: 2897 links in 593 files
PASS  README.md links the ADR index (docs/adr/)
PASS  the ADR index links every ADR file: 55 of 55
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 2897 relative links in 593 files
$ UV_CACHE_DIR=$TMPDIR/uv uv run --offline --frozen pytest -q -p no:cacheprovider --tb=line evals/test_runbooks.py evals/test_docs_links.py evals/test_repository_docs.py
117 passed in 2.03s
```

**Spec 023's case 2,** `vitest run test/content/film-links.test.ts` in `apps/web`. RED at `823847ea`, the landing pages as they were:

```text
 FAIL  test/content/film-links.test.ts > spec 023: the film link table > 2. each film's README.md is tracked, offers the film from the release films-v1, and links no MP4 in the tree (FR-012)
AssertionError: films/local-first/README.md: expected undefined to be 'https://github.com/hareet/h4reet-ai/r…' // Object.is equality
      Tests  1 failed | 7 passed | 5 skipped (13)
```

GREEN at `eb405a59`, which holds no test file:

```text
 Test Files  1 passed (1)
      Tests  8 passed | 5 skipped (13)
```

The same five cases skip before and after: the tree's state cases (spec 023 FR-013).

**The scan for identifiers**, a scratch script over the 28 files this branch adds or changes, for instance, volume, security-group, interface, subnet, image, VPC, spot-request, launch-template, and hosted-zone IDs, 12-digit numbers, key IDs, UUID-shaped keys, IPv4 addresses, and token shapes: its only matches are five private addresses of the two hosts, on lines of spec 032's spec and ADR 0057 that this branch doesn't touch (no line of its diff holds one). gitleaks ran on each commit: "no leaks found".

**`make -f Makefile lint`**, whole (shellcheck's file list cut at 400 characters):

```text
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
992 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limit …
exit 0
```

Run again on the final tree, with this note: exit 0, Prettier and ruff clean, `993 files already formatted`.

**`make -f Makefile check ENGINE_MODE=none-yet`**, its summary:

```text
PASS     makefiles-check
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
FAIL     infra-plan-note
PASS     disclosure-check
WARN     evals  WARN (behavioral tier): no run for trigger hash 9d6bd993305f in evals/agent-config/history/; the Author runs make evals-agent-config REF=<branch> from main's checkout, and commits its entry on the branch with the commands it prints
PASS     redteam
PASS     matrix
SKIP     image  no agents' engine yet: tasks.md T046
make check: 12 PASS, 1 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 3 FAIL; failing: test FAIL, infra-check FAIL, infra-plan-note FAIL
make: *** [Makefile:168: check] Error 1
exit 2
```

Each failure, read:

- **`test`:** the corpus check OK; the gateway `1757 passed | 13 skipped`; the relay `90 passed`; the web workspace `Test Files  16 failed | 273 passed (289)`, `Tests  16 failed | 5015 passed | 6 skipped (5037)`, in 835 s. Fifteen of the sixteen are `Error: Test timed out in 60000ms`, and the sixteenth is `test/room/twin-2d.test.ts`, the test spec 023's tasks call flaky under load; all are in files this branch doesn't touch, and `film-links.test.ts` passed. Run again alone, one file at a time (`vitest run --no-file-parallelism` with the sixteen files): `Test Files  16 passed (16)`, `Tests  201 passed (201)`; `twin-2d` passed alone three times. The stage stopped before its pytest part, which then ran alone, as `make test` runs it (`PYTEST_ARGS`, `PYTEST_DIRS`): `1 failed, 7707 passed, 13 skipped in 977.25s`. The one is `scripts/infra/test_infra_targets.py::test_infra_check_runs_the_policy_then_waits_for_terraform`, `mktemp: failed to create file via template '/tmp/tmp.XXXXXXXXXX': Read-only file system`: the sandbox's read-only `/tmp`, which fails it on `main` too, as the stack's own notes record.
- **`infra-check`:** `infra-policy: PASS, 32 files`, then Terraform's AWS provider can't start in the sandbox ("Failed to load plugin schemas"), as on `main` here.
- **`infra-plan-note`:** "plan for account missing or made from an older infra tree": the stack's. `fix/032-launch-policy` changes six files under `infra/`, and its note's step 3 asks for the account's plan block. This branch changes nothing under `infra/` (`git diff --stat 408594d2 HEAD -- infra` is empty).
- **`evals` WARN:** no behavioral run for trigger hash 9d6bd993305f; this branch touches nothing under `.claude/` and not `CLAUDE.md`.

**The merge onto `main`'s tip, rehearsed** (abbfc554, after the stack's merge): `git merge-tree --write-tree refs/heads/main HEAD` gives tree 36f9cc8d with no conflict, differing from `main` in this branch's 28 files alone; on a `git archive` export of that tree, `evals/docs_links.py` reads `docs links: 0 failed, 2897 relative links in 593 files`, and the three docs suites `117 passed`.

His gate, from main's checkout, is the run that counts.

## Cost and data-flow impact

None. No AWS resource, model call, or data flow changes. The release `films-v1` and the uploaded web encodes are GitHub's storage, outside the budgets, and visitors of hareet.ai never fetch them.

## For the Author

1. **Spec Kit's copyright line** is confirmed from a local copy, not marked for you: "Copyright GitHub, Inc.", from `specify-cli` 1.0.8's license file as installed from `github/spec-kit` tag `v1.0.8`. github.com is blocked here; compare it with the repository's `LICENSE` on GitHub if you want a second source.
2. **Each Status on the posture page, before the push.** The backlog's R01 (`fix/032-launch-policy`), R07 (this branch) and R10 (`feat/031-ci`) say `in flight`; the rest say `open`; D01 to D09 say "decision pending"; the two findings fixed before publication say `in flight`. Set each to what is true on the day you push.
3. **F11 live before the push.** The posture page and f10.md/f11.md describe F10's log trigger; once the repository is public, so is the trigger. The release after the stack's merge must carry F11's tunnel image to the tunnel end first (F11's note, steps 2 to 4).
4. **ADR 0057 marked accepted** from the merge and the two apply records: confirm, or tell the session to put "proposed" back.
5. **The apply records the docs cite** (ADR 0057's status, the incident notes) sit on `ops/apply-prod-2026-11-18`, `ops/apply-prod-2026-11-22` and `ops/apply-account-2026-11-22`, and the push leaves `ops/apply-*` out. The runbook's closing branch with those records brings them to `main`; until it merges, a reader of the public repository can't follow those citations.
6. **The incident notes,** for accuracy against what you saw: what isn't in the record is marked so (when your laptop came up on 11-18; whether the deployer's and the probe's alerts reached Telegram). The 11-18 01:00Z evidence expires about 2027-02-16: the runbook's CT block reads CloudTrail's event history; exporting that window and the guard's logs is R08's first step.
7. **The two runbooks left open** (R06), and one finding for a spec 001 fix: no EventBridge rule routes ACM's expiry event to `h4-alerts`, so `cert_expiring` can't arrive. The rule belongs in a protected file (the alerts or the bootstrap root), so it comes to you as a patch.
8. **The films, after this merge:** (a) the one history rewrite removes `films/*/media/*.mp4`, seven files, and keeps `films/kill-switch-b2/media/kill-switch.gif`; (b) the release `films-v1` on `hareet/h4reet-ai` holds the seven MP4s under exactly these names: `cost-meter.mp4`, `data-flows.mp4`, `evals.mp4`, `kill-switch.mp4`, `lifecycle.mp4`, `local-first.mp4`, `stack.mp4` (the landing pages' links and case 2 name them so); (c) after the push, each web encode's URL goes at its page's `<!-- player: … -->` line; (d) check each upload as A11 and ADR 0032 would, since no gate sees the release or the uploads (ADR 0050's amendment); (e) A11 still admits an MP4 in `films/<name>/media/`: narrow it in a gate patch if you want git to refuse one. `films/resume-links.json` keeps `media` as is; its file name is the release asset's.
9. **R07's template change** (contributing factors, a timeline line, three severities with each one's first hour) and the warning check it proposes are yours to decide; the notes follow the current template, with contributing factors under Root cause.
10. **ADR 0050's amendment** records your decision as your session relayed it; if your own words exist, they belong in it verbatim.
