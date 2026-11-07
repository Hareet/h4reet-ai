# feat/004-room-models

Spec: [specs/004-room-composition/](../../specs/004-room-composition/)
(tasks.md T234; plan.md §10) · Written by: implementer subagent
(Claude Opus 5.5), for the main session · Date: 2026-11-07

Session: the main session started from
`/home/h4reet/h4reet-ai/h4reet-ai`; this branch's worktree is
`/tmp/claude-1000/wt-room-models`, cut from `main` at
4414b4adda1a577c2816cc97d8ba626c0161aee8, the merge of your intake.
Repo hooks active: yes. In `.claude/audit/hooks.log`, this session's
events from 2026-11-07T22:16:26Z are ALLOW but these:
- five post-edit WARNs, four on `test/lookdev/page.test.ts` from
  22:28:59Z to 22:29:13Z and one on `test/manifest.test.ts` at
  22:32:42Z, each an import not yet used between two edits; the
  final files lint clean;
- one bash BLOCK at 22:53:47Z, "moving or deleting main", on a
  Python heredoc that filled this note's placeholders: its text held
  the rehearsal's paragraph, which names the branch's deletion and
  `main`. That paragraph went in through the Edit tool instead, and
  the pasted outputs through a script that names only their files.
  Nothing was respelled to run a git command.

The 22:50:25Z BLOCK and the 22:41:55Z subagent check in the same
log are another session's. Each commit ran the pre-commit hooks,
gitleaks and the arrival check.

Authorized by: the main session's brief of 2026-11-07, which sets
your 21 studio files as the pieces' models. `main` holds the files,
their records, and your approvals, and the contract's `model` is
"absent until the Author's file is set". The task is T234.

**Status: ready for your gate; not reviewed.** The brief asked for
no review; a reviewer in another session can run REVIEW.md's passes
first if you want one.

- **The data:** 21 catalog entries take
  `model: { file: <piece>.glb }`; twin-figure and visitor-figure
  take none. The shell's 2D drawing follows the 2D camera, which the
  models' measured bounds move (FR-019).
- **Tests first:** five test files pinned the room as all
  stand-ins. Two RED commits, then the data, GREEN.
- **make check,** on 12f87958, ends:
  `make check: 12 PASS, 1 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 0 FAIL`
  (exit 0). `evals` WARN is the behavioral tier's advisory line;
  `image` is SKIP, with no engine here. The first run failed `test`
  on the gateway's known timing flake alone; the rerun passed.
- **What you'll see, and what you won't yet.** A checkout's build
  carries all 21 models. `make up`'s web image doesn't yet: its
  build copies no `assets/room/`, and its nginx has no `/a/`
  location. Those are T218 to T220, User Story 4's first part
  (`feat/004-us4-studio`), which no branch has started. Until then
  the image builds with a warn line for each piece and draws its
  stand-ins (FR-013), so `make up` still works.

## Runs in your terminal

From main's checkout. Nothing paid: the gate runs the behavioral
tier only for a branch that touches CLAUDE.md, REVIEW.md, `.claude/`,
or the Claude Code pin, and this branch touches none of them.

1. **The gate:**

   ```bash
   git switch main
   b=feat/004-room-models
   log=~/gate-models.log
   tools/gates/gate "$b" 2>&1 | tee "$log"
   ```

   Expect Ready, with `evals` WARN, the behavioral tier's advisory
   line. The `image` step builds the web image, whose build prints
   `warn RX1 assets/room/<piece>.glb:-: the file can't be read` for
   each of the 21 pieces and still passes: the image has no
   `assets/room/` until T219 and T220. If the only failure is the
   gateway's timing test with a negative duration, run the gate
   again. With any other failure, don't merge, and tell the session.

2. **The guard.** The merge runs only if the gate printed its merge
   line, your checkout is on `main`, and the branch is at the SHA
   the gate checked:

   ```bash
   s=$(grep '^gate: ' "$log" | tail -n 1)
   sha=$(printf '%s\n' "$s" | awk '{print $2}')
   n=$(grep -c '^merge: ' "$log")
   on=$(git symbolic-ref -q HEAD)
   tip=$(git rev-parse --verify "refs/heads/$b")
   ok=no
   ```

   Then the guard, on its own lines:

   ```bash
   want="refs/heads/main.$sha"
   [ "$n" -gt 0 ] && [ "$on.$tip" = "$want" ] && ok=go
   echo "guard: $ok"
   ```

3. **The merge, only after `guard: go`.** It is the gate's own merge
   line, rebuilt from its log:

   ```bash
   m="Merge $b (${sha:0:12})"
   o=(--no-replace-objects merge --no-ff -m "$m" -m "$s")
   [ "$ok" = go ] && git "${o[@]}" "$sha"
   ```

   If it prints nothing, don't merge, and tell the session.

4. **Park off `main` again:**

   ```bash
   git switch -C wip-park/11-7-2026
   ```

**Cleanup, after the merge:**
`git worktree remove /tmp/claude-1000/wt-room-models`.

## What changed and why

The contract, contracts/room-data-files.md §4: a piece's `model` is
`{file: "<piece>.glb"}`, "absent until the Author's file is set. The
file sits directly under `assets/room/`, with its `records.json`
entry (RI7)." Your intake (4414b4ad) set all 21 files there, with
their records, licences, and approvals, and its gate had no failure.

- **The 21 entries** (12f87958): `model: { file: <piece>.glb }`
  between `budget` and `work_order`, the contract's key order, for
  work-desk, busy-sign, desk-screen, neon-sign, laptop-stand,
  laptop, charger, dog-sign, chalkboard, snowboard, bicycle,
  wall-window, window-view, wall-art, room-shell, split-keyboard,
  vertical-mouse, notebook, helmet, bag, and wall-outlet. The
  figures take none (RI8). The compose now runs RX1 to RX10, RK2,
  and RI7 on each file: no finding.
- **The shell's 2D drawing** (12f87958). FR-019: "ONCE a model is
  set, framing, footprints, and hit areas SHALL use its measured
  bounds." A set model's framed box gets no raise for a stand-in's
  label, so every framed box's top drops 0.28 m: the bicycle's from
  2.406 to 2.126 m, the neon sign's from 2.676 to 2.396 m, still
  over the 2.1336 m walls. The desktop's camera steps in from
  z 3.6964 to 3.5876 and the 2D camera from 3.6964 to 3.5525; the
  phone's stays at 3.8038. `test/room/data-only.test.ts` holds the
  shell's drawing to the 2D camera, so the open front's corners
  move from (±1.4882, −0.4542) and (±1.4882, 2.5221) to
  (±1.5088, −0.4764) and (±1.5088, 2.5411).
- **Five test files** pinned the room as all stand-ins, and changed
  first (e81d2ebd, then 89a5a924):
  - `test/manifest.test.ts`: the stand-in rule now runs on the room
    as it stood before its models were set (`withoutModels()` in
    `test/helpers/room.ts`, and `repositoryBundle`'s `standins`); a
    new case holds the room with them: no stand-in, the figures
    without a model, and `placeholders` the avatars' alone.
  - `test/room/scene.test.ts`: the placeholder labels on the
    stand-in room; the site's own room labels nothing.
  - `test/room/loader.test.ts`: nothing recorded for a fixture
    index that sets no model; the site's own room records its 21
    models skipped in 2D, the hide's one beacon carrying 20.
  - `test/lookdev/page.test.ts`: the page's only requests are the
    room's own set models from the site's `a/`, which
    contracts/lookdev.md §3 and §9 give the site's page, and never
    one for a candidate; the labels' cases run on the stand-in room.
- **The record:** T234 ticked, with where it departs from its text
  (one branch for all 21; your intake rendered `assets/CREDITS.md`;
  the shell's drawing), and plan.md §10's entry (12f87958).

Nothing under `assets/`, `tools/gates/`, `.claude/`, `corpus/`, or
`evals/agent-config/` changes.

## The report's changed figures

`main` (4414b4ad) first, then this branch:

- **Each piece's source:** "stand-in (no-model)", now
  "studio, `<piece>.glb`", with its measured bytes, gzip-9 bytes,
  triangles, and texture memory, each within its budget.
- **The largest against the caps:** 0, now 1,038,264 of 2,500,000
  gzip-9 bytes (room-shell) and 88,896 of 100,000 triangles
  (bicycle).
- **Texture memory, now measured:** the models measure 157,985,442
  bytes, 10 under their budgets' 157,985,452: the ten untextured
  pieces each budget 1 and measure 0. RK3 adds the budgets, so the
  scene's total is 158,626,181 of 200,000,000, from 158,598,220;
  the live-face canvases 640,729, from 612,768, since the faces
  are larger on the desktop's nearer camera.
- **The first visit, the room's share:** 0, now 6,593,612 gzip-9
  bytes, beside the design's 12,000,000 and the enforced
  25,000,000. The arrival check counts the same 6,593,612.
- **The cameras:** desktop z 3.6964, now 3.5876; 2D 3.6964, now
  3.5525; phone 3.8038, unchanged.
- **The neon word:** 16.3 px on the desktop, now 16.7; 9.1 px on
  the phone, unchanged, so it stays over the floor of 9. The
  counters 10.8 px on the desktop, now 11.1, and 6.0 px on the
  phone, exempt there; the second line 5.6, now 5.8, and 3.1.
- **Side-wall selectables:** the snowboard list-only at 304 × 196
  with 160 others in 3D, now 107, and 410 in 2D, now 323; the
  chalkboard 1,506 in 3D, now 528, and 1,737 in 2D, now 951.
- **The charger's poses, desktop and phone:** plugged and unplugged
  42.8 and 24.0 px apart, now 43.4 and 23.8; plugged and resting
  165.4 and 92.6, now 167.9 and 91.4; unplugged and resting 130.2
  and 72.7, now 132.3 and 71.7. All still apart.
- **Findings:** none, before and after.

The whole report is under "Room report", below.

## Acceptance criteria

- **User Story 4, scenario 1:** setting a piece's `model` replaces
  its stand-in, for all 21; the shell's drawing moves with the 2D
  camera as the data-only test requires.
- **FR-013:** the manifest names no stand-in; in `make up`'s image,
  which has no `assets/room/` yet, each piece warns and keeps its
  stand-in, and the build passes.
- **FR-019:** framing uses the measured bounds (the cameras above).
- **FR-023, RI7:** each file directly under `assets/room/`, its
  record of kind `room` with the SHA-256 the compositor computes;
  the arrival check, 0 findings.
- **FR-053, RK2, RK3:** each model within its budget; the scene
  within main's cap.
- **FR-073:** the report, whole, below.
- **SC-006:** the first visit inside 25,000,000 bytes; GLB
  encoding waits for T218 (For the Author).

## Constitution check

- **I. Data-Local by Default:** no new flow; the models are served
  from the site's own origin.
- **II. Production-Grade or Not Shipped:** make check, the room's
  checks, and both builds; `make up` still builds.
- **III. Spec Before Code:** spec 004's T234; plan.md §10 records
  the departures.
- **IV. Least Privilege:** data and tests only; no permission,
  hook, or gate path changes.
- **V. Cost Is a First-Class Signal:** no model call; the first
  visit's bytes are reported beside the caps.
- **VI. Build in Public:** the RED corrections and the image's gap
  are stated here.
- **VII. Own the Whole Product:** an agent wrote every change; your
  files and approvals are untouched.
- **VIII. Honest AI:** the twin's behaviour doesn't change.

## Review

Not reviewed: the main session's brief asked for none, and the
agent that implements never reviews. The passes REVIEW.md would
give this diff are Bugs, Compliance, Cost & telemetry, and Room
data; Arriving assets doesn't apply, since no file under `assets/`
changes.

## Verification

- **room:check:** `room: 0 findings in 0 files`.
- **room:scan:** `room: 0 hits`.
- **room:generate:** `room: 0 written, 0 removed, 26 unchanged`. A
  work order names `<piece>.glb` with or without a `model`.
- **The RED runs,** on `main`'s data:
  - e81d2ebd, 3 failed of 155, for the missing models alone:
    `manifest.test.ts:125`, "expected [ 'room-shell', 'work-desk',
    …(18) ] to deeply equal []"; `loader.test.ts:1085`, "expected 0
    to be greater than 0"; `scene.test.ts:752`, "expected [
    'work-desk', 'desk-screen', …(10) ] to deeply equal []".
  - With the data, that commit's manifest case failed on
    `placeholders` ("expected true to be false") and its loader case
    on the 21st event, which one beacon doesn't carry. 89a5a924
    corrected both, and was RED on `main`'s data again, 2 of 51:
    `manifest.test.ts:126` and `loader.test.ts:1086`, as above.
- **The GREEN run,** with the data: vitest, 75 files, 2,002 tests
  passed. tsc and eslint clean, in `make lint`.
- **Both builds carry the models.** A release build and a drafts
  build (`ROOM_DRAFTS=1`) of this checkout each hold 21 `a/*.glb.gz`
  copies and no plain `.glb`; each copy inflates to its record's
  SHA-256, whose first 16 digits are in its name:

  ```text
  release: 21 copies, 21 matching their records by SHA-256; plain .glb files: 0; build_kind release; standins []; placeholders True
  drafts: 21 copies, 21 matching their records by SHA-256; plain .glb files: 0; build_kind drafts; standins []; placeholders True
  ```

  The phone copy holds no model: 1,220,842 bytes, from `main`'s
  1,216,919, the 3D part's model entries.

- **The content check** (`make content-check`):
  `content check: PASS (45 content files: 1 approved by main, 44
  drafts, none of whose text is in dist/)`.
- **The arrival check and the credits** (`make arrival`):
  `arrival-check: 0 findings in 64 files (3 commits)`, its
  first-visit line `first visit (phase 3): 6,593,612 of 25,000,000
  bytes`, and `credits: OK: the renderings and the records' form`.
- **The docs links:** `evals/docs_links.py`, "docs links: 0
  failed, 1584 relative links in 217 files", with this note.
- **gitleaks dir,** from inside a fresh `git archive` export of
  12f87958, outside any worktree, with the export's own
  `.gitleaks.toml` and no `.gitleaksignore`, at 2026-11-07T22:39Z
  (its log's times are local):

  ```text
  3:39PM INF scanned ~32765125 bytes (32.77 MB) in 4.23s
  3:39PM INF no leaks found
  gitleaks exit: 0
  ```

- **The rehearsal into `main`,** in a scratch worktree on a
  throwaway branch, `rehearse/004-room-models`, cut at
  `refs/heads/main` (4414b4ad), since the bash gate refuses a
  worktree checkout of `main` itself: `git --no-replace-objects
  merge --no-ff --no-commit` of 12f87958 said "Automatic merge went
  well; stopped before committing as requested", with no unmerged
  path, 28 files staged, and an index equal to the tip's tree
  (`git diff --cached --quiet`). `main` is an ancestor of the tip,
  so a Ready gate prints no "main has commits" note. Then the merge
  was aborted, the tree was clean, and the worktree and the branch
  were removed; the branch's deletion warned that it couldn't lock
  `.git/config`, where the branch had no section.

### make check

The first run, on 12f87958, failed `test` on the known flake alone,
the gateway's connect-watchdog timing with a negative duration:
"expected -789 to be greater than or equal to 900"
(`test/contract/local-openai.errors.test.ts:282`); the web suite in
the same run passed, 75 files and 2,002 tests. The rerun, whole:

```text
== makefiles-check
python3 -I -B -X pycache_prefix=/dev/null tools/gates/makefiles_check.py
makefiles: GNUmakefile holds only its include, and there is no makefile
-> PASS makefiles-check
== githooks-check
reference-transaction: installed
pre-commit: installed
main: a loose ref, which the git hook guards
-> PASS githooks-check
== toolchain-check
python3 -I -B -X pycache_prefix=/dev/null tools/gates/toolchain_check.py
tool                     pinned   found    status  where
node                     24.21.0  24.21.0  OK      /home/h4reet/.nvm/versions/node/v24.21.0/bin/node
uv                       0.8.22   0.8.22   OK      /home/h4reet/.local/bin/uv
ruff                     0.16.10  0.16.10  OK      /home/h4reet/.local/bin/ruff
gitleaks                 8.30.1   8.30.1   OK      /home/h4reet/.local/bin/gitleaks
python3                  3.12     3.12.3   OK      /usr/bin/python3
shellcheck               0.9.0    0.9.0    OK      /usr/bin/shellcheck
jq                       1.7      1.7      OK      /usr/bin/jq
pytest                   9.1.1    9.1.1    OK      /home/h4reet/.local/bin/pytest
pyyaml (pytest's)        6.0.3    6.0.3    OK      /home/h4reet/.local/share/uv/tools/pytest/bin/python3
claude code              2.1.296  2.1.319  WARN    /home/h4reet/.nvm/versions/node/v22.18.0/bin/claude
lint: eslint             10.12.0  10.12.0  OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/eslint
lint: typescript-eslint  8.71.1   8.71.1   OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/typescript-eslint
lint: typescript         6.0.3    6.0.3    OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/typescript
lint: prettier           3.9.9    3.9.9    OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/prettier
lint: node               24.21.0  24.21.0  OK      /home/h4reet/.local/share/h4reet/lint-node/node
WARN: claude code 2.1.319 is newer than its floor, 2.1.296 (ADR 0023): the agent-config evals record the version each run used, and moving the floor runs them again
toolchain-check: all 15 match their pins, 1 newer than its floor (claude code)
-> PASS toolchain-check
== policy
python3 -I -B -X pycache_prefix=/dev/null tools/gates/compose_policy.py
compose policy: PASS (deploy/compose.yaml with 3 env files, the Dockerfiles, the env-file placement, .devcontainer, .npmrc)
-> PASS policy
== validate-config
npm run --silent -w services/gateway validate-config -- --root "/tmp/claude-1000/wt-room-models"
validate-config: 0 errors, 0 notes
-> PASS validate-config
== lint
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
406 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/scripts/aws-login.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh redteam/forbidden-actions.sh tools/gates/install-tools.sh tools/gates/secrets.sh
-> PASS lint
== test
python3 -I -B -X pycache_prefix=/dev/null corpus/tools/check_corpus.py
corpus-check: OK — 44 slots, 26 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems
npm test --workspaces --if-present

> @h4reet/gateway@0.1.0 test
> vitest run


 RUN  v5.0.3 /tmp/claude-1000/wt-room-models/services/gateway


 Test Files  52 passed (52)
      Tests  810 passed | 12 skipped (822)
   Start at  15:43:39
   Duration  67.88s (tests 95%, import 3%, transform 2%)


> @h4reet/web@0.1.0 test
> vitest run


 RUN  v5.0.3 /tmp/claude-1000/wt-room-models/apps/web


 Test Files  75 passed (75)
      Tests  2002 passed (2002)
   Start at  15:44:43
   Duration  35.06s (tests 77%, import 18%, transform 5%)

pytest -q -p no:cacheprovider --import-mode=importlib corpus/tools evals redteam tools/gates deploy/scripts deploy/agents-engine scripts
........................................................................ [  1%]
........................................................................ [  3%]
........................................................................ [  5%]
........................................................................ [  7%]
........................................................................ [  9%]
........................................................................ [ 11%]
........................................................................ [ 13%]
........................................................................ [ 15%]
........................................................................ [ 17%]
........................................................................ [ 19%]
........................................................................ [ 21%]
........................................................................ [ 23%]
........................................................................ [ 25%]
........................................................................ [ 26%]
........................................................................ [ 28%]
........................................................................ [ 30%]
........................................................................ [ 32%]
........................................................................ [ 34%]
........................................................................ [ 36%]
........................................................................ [ 38%]
........................................................................ [ 40%]
........................................................................ [ 42%]
........................................................................ [ 44%]
........................................................................ [ 46%]
........................................................................ [ 48%]
........................................................................ [ 50%]
........................................................................ [ 52%]
........................................................................ [ 53%]
........................................................................ [ 55%]
........................................................................ [ 57%]
........................................................................ [ 59%]
........................................................................ [ 61%]
........................................................................ [ 63%]
........................................................................ [ 65%]
........................................................................ [ 67%]
........................................................................ [ 69%]
........................................................................ [ 71%]
........................................................................ [ 73%]
........................................................................ [ 75%]
........................................................................ [ 77%]
........................................................................ [ 79%]
........................................................................ [ 80%]
........................................................................ [ 82%]
........................................................................ [ 84%]
........................................................................ [ 86%]
........................................................................ [ 88%]
........................................................................ [ 90%]
........................................................................ [ 92%]
........................................................................ [ 94%]
........................................................................ [ 96%]
........................................................................ [ 98%]
................................................................         [100%]
3736 passed in 339.58s (0:05:39)
-> PASS test
== content-check
+ ROOM_DRAFTS=
+ npm run build -w apps/web

> @h4reet/web@0.1.0 prebuild
> node --import tsx build/policy.ts

policy: main's content-approvals.json, resume-header.json and caps.json into /tmp/claude-1000/wt-room-models/node_modules/.cache/h4reet-web/policy

> @h4reet/web@0.1.0 build
> vite build

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - import "./build/approvals" without a file extension (vite.config.ts:8:40). Add the file extension
  - import "./build/content" without a file extension (vite.config.ts:9:28). Add the file extension
  - import "./build/disclosure" without a file extension (vite.config.ts:10:32). Add the file extension
  - import "./build/narration" without a file extension (vite.config.ts:11:31). Add the file extension
  - import "./build/policy" without a file extension (vite.config.ts:12:36). Add the file extension
  - import "./build/room/plugin" without a file extension (vite.config.ts:13:28). Add the file extension
  - import "../approvals" without a file extension (build/room/plugin.ts:22:26). Add the file extension
  - import "../src/resume/data" without a file extension (build/content.ts:27:58). Add the file extension
  - import "../src/resume/data" without a file extension (build/narration.ts:24:40). Add the file extension
  - import "../manifest" without a file extension (build/room/plugin.ts:23:30). Add the file extension
  - import "./approvals" without a file extension (build/content.ts:28:78). Add the file extension
  - import "./compose" without a file extension (build/room/plugin.ts:24:40). Add the file extension
  - import "../src/narration/data" without a file extension (build/narration.ts:25:53). Add the file extension
  - import "./compose" without a file extension (build/room/plugin.ts:25:36). Add the file extension
  - import "./approvals" without a file extension (build/narration.ts:26:78). Add the file extension
  - import "./emit" without a file extension (build/room/plugin.ts:26:27). Add the file extension
  - import "./narration-source" without a file extension (build/content.ts:29:29). Add the file extension
  - import "./content" without a file extension (build/narration.ts:48:8). Add the file extension
  - import "./policy" without a file extension (build/room/plugin.ts:27:32). Add the file extension
  - import "./pdf" without a file extension (build/content.ts:30:46). Add the file extension
  - import "./narration-source" without a file extension (build/narration.ts:49:57). Add the file extension
  - import "./policy" without a file extension (build/room/plugin.ts:28:33). Add the file extension
  - import "./policy" without a file extension (build/content.ts:31:36). Add the file extension
  - import "./policy" without a file extension (build/narration.ts:50:36). Add the file extension
  - import "./source" without a file extension (build/room/plugin.ts:29:38). Add the file extension
  - import "./source" without a file extension (build/room/plugin.ts:30:27). Add the file extension
  - import "./checks/family" without a file extension (build/room/compose.ts:9:48). Add the file extension
  - import "../src/choice/avatars" without a file extension (build/manifest.ts:13:25). Add the file extension
  - import "../../src/choice/avatars" without a file extension (build/room/emit.ts:37:25). Add the file extension
  - import "../../src/room/glb/json" without a file extension (build/room/policy.ts:23:51). Add the file extension
  - import "./approvals" without a file extension (build/pdf.ts:25:40). Add the file extension
  - import "../src/narration/data" without a file extension (build/narration-source.ts:23:36). Add the file extension
  - import "./checks/family" without a file extension (build/room/compose.ts:10:54). Add the file extension
  - import "../src/room/compose/bundle" without a file extension (build/manifest.ts:14:32). Add the file extension
  - import "../../src/room/compose/bundle" without a file extension (build/room/emit.ts:38:84). Add the file extension
  - import "../../src/room/glb/json" without a file extension (build/room/policy.ts:24:39). Add the file extension
  - import "./content" without a file extension (build/pdf.ts:26:31). Add the file extension
  - import "./checks/rd" without a file extension (build/room/compose.ts:11:20). Add the file extension
  - import "../src/room/events" without a file extension (build/manifest.ts:15:29). Add the file extension
  - import "../../src/room/compose/cable" without a file extension (build/room/emit.ts:39:30). Add the file extension
  - import "../policy" without a file extension (build/room/policy.ts:25:25). Add the file extension
  - import "./checks/rg" without a file extension (build/room/compose.ts:12:20). Add the file extension
  - import "../src/talk/messages" without a file extension (build/manifest.ts:16:42). Add the file extension
  - import "../../src/room/compose/framing" without a file extension (build/room/emit.ts:40:42). Add the file extension
  - import "../policy" without a file extension (build/room/policy.ts:26:27). Add the file extension
  - import "./checks/ri" without a file extension (build/room/compose.ts:13:20). Add the file extension
  - import "../src/talk/messages" without a file extension (build/manifest.ts:17:42). Add the file extension
  - import "../../src/room/compose/framing" without a file extension (build/room/emit.ts:41:26). Add the file extension
  - import "./checks/family" without a file extension (build/room/policy.ts:27:28). Add the file extension
  - import "./room/emit" without a file extension (build/manifest.ts:18:53). Add the file extension
  - import "../../src/room/compose/legibility" without a file extension (build/room/emit.ts:42:27). Add the file extension
  - import "./checks/rk" without a file extension (build/room/compose.ts:14:20). Add the file extension
  - import "../../src/room/compose/legibility" without a file extension (build/room/emit.ts:43:35). Add the file extension
  - import "./schema" without a file extension (build/room/policy.ts:28:20). Add the file extension
  - import "./checks/rl" without a file extension (build/room/compose.ts:15:20). Add the file extension
  - import "../../src/room/compose/load-order" without a file extension (build/room/emit.ts:44:27). Add the file extension
  - import "./checks/rs" without a file extension (build/room/compose.ts:16:20). Add the file extension
  - import "../../src/room/compose/load-order" without a file extension (build/room/emit.ts:45:32). Add the file extension
  - import "./checks/rt" without a file extension (build/room/compose.ts:17:33). Add the file extension
  - import "../../src/room/compose/math" without a file extension (build/room/emit.ts:46:87). Add the file extension
  - import "./checks/rv" without a file extension (build/room/compose.ts:18:20). Add the file extension
  - import "../../src/room/compose/math" without a file extension (build/room/emit.ts:47:39). Add the file extension
  - import "./checks/rx" without a file extension (build/room/compose.ts:19:20). Add the file extension
  - import "../../src/room/compose/mount" without a file extension (build/room/emit.ts:48:41). Add the file extension
  - import "./emit" without a file extension (build/room/compose.ts:20:22). Add the file extension
  - import "../../src/room/compose/project" without a file extension (build/room/emit.ts:49:36). Add the file extension
  - import "./emit" without a file extension (build/room/compose.ts:21:34). Add the file extension
  - import "../../src/room/compose/project" without a file extension (build/room/emit.ts:50:40). Add the file extension
  - import "../room/signals/tier" without a file extension (src/talk/messages.ts:6:28). Add the file extension
  - import "../room/dom" without a file extension (src/choice/avatars.ts:4:21). Add the file extension
  - import "../../src/room/compose/vocabulary" without a file extension (build/room/schema.ts:21:8). Add the file extension
  - import "../load" without a file extension (build/room/checks/family.ts:11:33). Add the file extension
  - import "./load" without a file extension (build/room/compose.ts:22:26). Add the file extension
  - import "../../src/room/compose/stages" without a file extension (build/room/emit.ts:51:27). Add the file extension
  - import "../../src/room/ui-keys" without a file extension (build/room/schema.ts:22:25). Add the file extension
  - import "../policy" without a file extension (build/room/checks/family.ts:12:33). Add the file extension
  - import "./policy" without a file extension (build/room/compose.ts:23:33). Add the file extension
  - import "../../src/room/compose/vocabulary" without a file extension (build/room/emit.ts:52:44). Add the file extension
  - import "../source" without a file extension (build/room/checks/family.ts:13:33). Add the file extension
  - import "./source" without a file extension (build/room/compose.ts:24:27). Add the file extension
  - import "../../src/room/compose/vocabulary" without a file extension (build/room/emit.ts:53:45). Add the file extension
  - import "../compose/vocabulary" without a file extension (src/room/signals/tier.ts:16:32). Add the file extension
  - import "../source" without a file extension (build/room/checks/family.ts:14:27). Add the file extension
  - import "./checks/family" without a file extension (build/room/compose.ts:26:46). Add the file extension
  - import "../../src/room/glb/fit" without a file extension (build/room/emit.ts:54:45). Add the file extension
  - import "./policy" without a file extension (build/room/compose.ts:27:43). Add the file extension
  - import "../../src/room/glb/fit" without a file extension (build/room/emit.ts:55:41). Add the file extension
  - import "./source" without a file extension (build/room/compose.ts:28:27). Add the file extension
  - import "../../src/room/glb/gzip" without a file extension (build/room/emit.ts:56:23). Add the file extension
  - import "../../src/room/glb/images" without a file extension (build/room/emit.ts:57:27). Add the file extension
  - import "../manifest" without a file extension (build/room/emit.ts:58:62). Add the file extension
  - import "./checks/family" without a file extension (build/room/emit.ts:59:26). Add the file extension
  - import "./checks/family" without a file extension (build/room/emit.ts:60:46). Add the file extension
  - import "../../src/room/glb/json" without a file extension (build/room/load.ts:18:37). Add the file extension
  - import "../../../src/room/glb/json" without a file extension (build/room/checks/rl.ts:14:28). Add the file extension
  - import "../schema" without a file extension (build/room/checks/rd.ts:14:23). Add the file extension
  - import "../../../src/room/compose/stages" without a file extension (build/room/checks/rk.ts:23:33). Add the file extension
  - import "../schema" without a file extension (build/room/checks/rv.ts:9:21). Add the file extension
  - import "../../../src/room/glb/fit" without a file extension (build/room/checks/rx.ts:17:66). Add the file extension
  - import "../../content" without a file extension (build/room/checks/rt.ts:30:8). Add the file extension
  - import "../../../src/room/compose/math" without a file extension (build/room/checks/rs.ts:20:37). Add the file extension
  - import "../../../src/room/compose/math" without a file extension (build/room/checks/ri.ts:13:48). Add the file extension
  - import "../../../src/room/compose/cable" without a file extension (build/room/checks/rg.ts:41:37). Add the file extension
  - import "./checks/rg" without a file extension (build/room/emit.ts:61:80). Add the file extension
  - import "./checks/family" without a file extension (build/room/load.ts:19:45). Add the file extension
  - import "../schema" without a file extension (build/room/checks/rl.ts:15:27). Add the file extension
  - import "./family" without a file extension (build/room/checks/rd.ts:15:38). Add the file extension
  - import "../../../src/room/glb/fit" without a file extension (build/room/checks/rk.ts:24:36). Add the file extension
  - import "./family" without a file extension (build/room/checks/rv.ts:10:38). Add the file extension
  - import "../../../src/room/glb/fit" without a file extension (build/room/checks/rx.ts:18:57). Add the file extension
  - import "../../content" without a file extension (build/room/checks/rt.ts:31:67). Add the file extension
  - import "../../../src/room/compose/math" without a file extension (build/room/checks/rs.ts:21:27). Add the file extension
  - import "../../../src/room/compose/mount" without a file extension (build/room/checks/ri.ts:14:44). Add the file extension
  - import "../../../src/room/compose/cable" without a file extension (build/room/checks/rg.ts:42:31). Add the file extension
  - import "./checks/rg" without a file extension (build/room/emit.ts:62:31). Add the file extension
  - import "./checks/family" without a file extension (build/room/load.ts:20:30). Add the file extension
  - import "./family" without a file extension (build/room/checks/rl.ts:16:37). Add the file extension
  - import "./family" without a file extension (build/room/checks/rd.ts:16:46). Add the file extension
  - import "../../../src/room/glb/fit" without a file extension (build/room/checks/rk.ts:25:31). Add the file extension
  - import "../../../src/room/glb/gzip" without a file extension (build/room/checks/rx.ts:19:27). Add the file extension
  - import "../../../src/room/compose/layout" without a file extension (build/room/checks/rt.ts:38:8). Add the file extension
  - import "../../../src/room/compose/vocabulary" without a file extension (build/room/checks/rs.ts:22:29). Add the file extension
  - import "../../../src/room/compose/mount" without a file extension (build/room/checks/ri.ts:15:33). Add the file extension
  - import "../../../src/room/compose/framing" without a file extension (build/room/checks/rg.ts:43:36). Add the file extension
  - import "./checks/ri" without a file extension (build/room/emit.ts:63:28). Add the file extension
  - import "./checks/rd" without a file extension (build/room/load.ts:21:31). Add the file extension
  - import "../../../src/room/glb/rules" without a file extension (build/room/checks/rk.ts:26:23). Add the file extension
  - import "../load" without a file extension (build/room/checks/rx.ts:20:29). Add the file extension
  - import "../../../src/room/compose/layout" without a file extension (build/room/checks/rt.ts:39:27). Add the file extension
  - import "../../../src/room/compose/vocabulary" without a file extension (build/room/checks/rs.ts:23:32). Add the file extension
  - import "../../../src/room/compose/vocabulary" without a file extension (build/room/checks/ri.ts:16:30). Add the file extension
  - import "../../../src/room/compose/framing" without a file extension (build/room/checks/rg.ts:44:26). Add the file extension
  - import "./load" without a file extension (build/room/emit.ts:64:41). Add the file extension
  - import "./schema" without a file extension (build/room/load.ts:32:8). Add the file extension
  - import "../load" without a file extension (build/room/checks/rk.ts:27:29). Add the file extension
  - import "../policy" without a file extension (build/room/checks/rx.ts:21:24). Add the file extension
  - import "../../../src/room/compose/legibility" without a file extension (build/room/checks/rt.ts:40:29). Add the file extension
  - import "../schema" without a file extension (build/room/checks/rs.ts:24:43). Add the file extension
  - import "../../../src/room/handoff" without a file extension (build/room/checks/ri.ts:17:24). Add the file extension
  - import "../../../src/room/compose/layout" without a file extension (build/room/checks/rg.ts:45:27). Add the file extension
  - import "./orders" without a file extension (build/room/emit.ts:65:69). Add the file extension
  - import "./schema" without a file extension (build/room/load.ts:43:8). Add the file extension
  - import "../policy" without a file extension (build/room/checks/rk.ts:28:35). Add the file extension
  - import "../policy" without a file extension (build/room/checks/rx.ts:22:31). Add the file extension
  - import "../../../src/room/compose/vocabulary" without a file extension (build/room/checks/rt.ts:41:34). Add the file extension
  - import "./family" without a file extension (build/room/checks/rs.ts:25:38). Add the file extension
  - import "../../../src/room/glb/json" without a file extension (build/room/checks/ri.ts:18:38). Add the file extension
  - import "../../../src/room/compose/legibility" without a file extension (build/room/checks/rg.ts:46:66). Add the file extension
  - import "./policy" without a file extension (build/room/emit.ts:66:24). Add the file extension
  - import "./source" without a file extension (build/room/load.ts:44:33). Add the file extension
  - import "../schema" without a file extension (build/room/checks/rk.ts:29:35). Add the file extension
  - import "../schema" without a file extension (build/room/checks/rx.ts:23:35). Add the file extension
  - import "../../../src/room/glb/names" without a file extension (build/room/checks/rt.ts:42:29). Add the file extension
  - import "./rg" without a file extension (build/room/checks/rs.ts:26:42). Add the file extension
  - import "../load" without a file extension (build/room/checks/ri.ts:19:37). Add the file extension
  - import "../../../src/room/compose/legibility" without a file extension (build/room/checks/rg.ts:47:63). Add the file extension
  - import "./policy" without a file extension (build/room/emit.ts:67:55). Add the file extension
  - import "./source" without a file extension (build/room/load.ts:45:27). Add the file extension
  - import "../source" without a file extension (build/room/checks/rk.ts:30:27). Add the file extension
  - import "./family" without a file extension (build/room/checks/rx.ts:24:38). Add the file extension
  - import "../../../src/room/ui-keys" without a file extension (build/room/checks/rt.ts:43:41). Add the file extension
  - import "../load" without a file extension (build/room/checks/ri.ts:20:29). Add the file extension
  - import "../../../src/room/compose/math" without a file extension (build/room/checks/rg.ts:48:71). Add the file extension
  - import "./report" without a file extension (build/room/emit.ts:68:28). Add the file extension
  - import "./family" without a file extension (build/room/checks/rk.ts:31:38). Add the file extension
  - import "./ri" without a file extension (build/room/checks/rx.ts:25:28). Add the file extension
  - import "../load" without a file extension (build/room/checks/rt.ts:44:36). Add the file extension
  - import "../schema" without a file extension (build/room/checks/ri.ts:21:21). Add the file extension
  - import "../../../src/room/compose/math" without a file extension (build/room/checks/rg.ts:49:39). Add the file extension
  - import "./schema" without a file extension (build/room/emit.ts:69:21). Add the file extension
  - import "./rg" without a file extension (build/room/checks/rk.ts:32:41). Add the file extension
  - import "../load" without a file extension (build/room/checks/rt.ts:45:41). Add the file extension
  - import "../schema" without a file extension (build/room/checks/ri.ts:22:64). Add the file extension
  - import "../../../src/room/compose/mount" without a file extension (build/room/checks/rg.ts:50:65). Add the file extension
  - import "./schema" without a file extension (build/room/emit.ts:80:8). Add the file extension
  - import "./rg" without a file extension (build/room/checks/rk.ts:33:31). Add the file extension
  - import "./family" without a file extension (build/room/checks/ri.ts:23:38). Add the file extension
  - import "../../../src/room/compose/mount" without a file extension (build/room/checks/rg.ts:51:60). Add the file extension
  - import "./source" without a file extension (build/room/emit.ts:81:33). Add the file extension
  - import "./rx" without a file extension (build/room/checks/rk.ts:34:41). Add the file extension
  - import "../schema" without a file extension (build/room/checks/rt.ts:46:29). Add the file extension
  - import "../../../src/room/compose/pick" without a file extension (build/room/checks/rg.ts:52:73). Add the file extension
  - import "./source" without a file extension (build/room/emit.ts:82:27). Add the file extension
  - import "./images" without a file extension (src/room/glb/fit.ts:18:27). Add the file extension
  - import "../schema" without a file extension (build/room/checks/rt.ts:47:72). Add the file extension
  - import "../../../src/room/compose/pick" without a file extension (build/room/checks/rg.ts:53:62). Add the file extension
  - import "./typefaces" without a file extension (build/room/emit.ts:83:31). Add the file extension
  - import "./math" without a file extension (src/room/compose/mount.ts:11:68). Add the file extension
  - import "../choice/avatars" without a file extension (src/room/handoff.ts:10:40). Add the file extension
  - import "./names" without a file extension (src/room/glb/rules.ts:6:27). Add the file extension
  - import "./images" without a file extension (src/room/glb/fit.ts:19:58). Add the file extension
  - import "../typefaces" without a file extension (build/room/checks/rt.ts:48:27). Add the file extension
  - import "../../../src/room/compose/project" without a file extension (build/room/checks/rg.ts:54:36). Add the file extension
  - import "./math" without a file extension (src/room/compose/mount.ts:12:39). Add the file extension
  - import "../choice/avatars" without a file extension (src/room/handoff.ts:11:31). Add the file extension
  - import "./names" without a file extension (src/room/glb/rules.ts:7:34). Add the file extension
  - import "./json" without a file extension (src/room/glb/fit.ts:20:27). Add the file extension
  - import "../typefaces" without a file extension (build/room/checks/rt.ts:49:28). Add the file extension
  - import "../../../src/room/compose/project" without a file extension (build/room/checks/rg.ts:55:40). Add the file extension
  - import "./clock" without a file extension (src/room/handoff.ts:12:28). Add the file extension
  - import "./json" without a file extension (src/room/glb/fit.ts:21:26). Add the file extension
  - import "./family" without a file extension (build/room/checks/rt.ts:50:28). Add the file extension
  - import "../../../src/room/compose/stages" without a file extension (build/room/checks/rg.ts:64:8). Add the file extension
  - import "./names" without a file extension (src/room/glb/fit.ts:22:80). Add the file extension
  - import "./family" without a file extension (build/room/checks/rt.ts:51:38). Add the file extension
  - import "../../../src/room/compose/stages" without a file extension (build/room/checks/rg.ts:65:28). Add the file extension
  - import "./read" without a file extension (src/room/glb/fit.ts:23:36). Add the file extension
  - import "./rg" without a file extension (build/room/checks/rt.ts:52:42). Add the file extension
  - import "../../../src/room/compose/vocabulary" without a file extension (build/room/checks/rg.ts:66:47). Add the file extension
  - import "./read" without a file extension (src/room/glb/fit.ts:24:72). Add the file extension
  - import "../../../src/room/compose/vocabulary" without a file extension (build/room/checks/rg.ts:67:50). Add the file extension
  - import "./rules" without a file extension (src/room/glb/fit.ts:42:8). Add the file extension
  - import "../load" without a file extension (build/room/checks/rg.ts:68:41). Add the file extension
  - import "./rules" without a file extension (src/room/glb/fit.ts:43:40). Add the file extension
  - import "../policy" without a file extension (build/room/checks/rg.ts:69:24). Add the file extension
  - import "./read" without a file extension (src/room/glb/fit.ts:45:35). Add the file extension
  - import "../policy" without a file extension (build/room/checks/rg.ts:70:33). Add the file extension
  - import "../schema" without a file extension (build/room/checks/rg.ts:82:8). Add the file extension
  - import "./vocabulary" without a file extension (src/room/compose/layout.ts:9:31). Add the file extension
  - import "../../src/room/compose/bundle" without a file extension (build/room/typefaces.ts:22:38). Add the file extension
  - import "./layout" without a file extension (src/room/compose/legibility.ts:8:49). Add the file extension
  - import "./json" without a file extension (src/room/glb/read.ts:20:51). Add the file extension
  - import "../typefaces" without a file extension (build/room/checks/rg.ts:83:31). Add the file extension
  - import "../../src/room/compose/vocabulary" without a file extension (build/room/typefaces.ts:23:31). Add the file extension
  - import "./layout" without a file extension (src/room/compose/legibility.ts:9:53). Add the file extension
  - import "./json" without a file extension (src/room/glb/read.ts:21:39). Add the file extension
  - import "../typefaces" without a file extension (build/room/checks/rg.ts:84:43). Add the file extension
  - import "./math" without a file extension (src/room/compose/cable.ts:9:80). Add the file extension
  - import "./math" without a file extension (src/room/compose/project.ts:7:65). Add the file extension
  - import "./math" without a file extension (src/room/compose/framing.ts:8:27). Add the file extension
  - import "../../src/room/compose/math" without a file extension (build/room/orders.ts:19:24). Add the file extension
  - import "../../src/room/compose/vocabulary" without a file extension (build/room/report.ts:27:29). Add the file extension
  - import "../../src/room/compose/vocabulary" without a file extension (build/room/typefaces.ts:24:34). Add the file extension
  - import "./math" without a file extension (src/room/compose/legibility.ts:10:62). Add the file extension
  - import "./names" without a file extension (src/room/glb/read.ts:22:30). Add the file extension
  - import "./family" without a file extension (build/room/checks/rg.ts:85:38). Add the file extension
  - import "./math" without a file extension (src/room/compose/cable.ts:10:33). Add the file extension
  - import "./math" without a file extension (src/room/compose/project.ts:8:33). Add the file extension
  - import "./project" without a file extension (src/room/compose/framing.ts:9:29). Add the file extension
  - import "../../src/room/compose/math" without a file extension (build/room/orders.ts:20:27). Add the file extension
  - import "../../src/room/glb/gzip" without a file extension (build/room/report.ts:28:27). Add the file extension
  - import "../pdf" without a file extension (build/room/typefaces.ts:25:32). Add the file extension
  - import "./math" without a file extension (src/room/compose/legibility.ts:11:33). Add the file extension
  - import "./rules" without a file extension (src/room/glb/read.ts:23:51). Add the file extension
  - import "./rx" without a file extension (build/room/checks/rg.ts:86:27). Add the file extension
  - import "./stages" without a file extension (src/room/compose/project.ts:9:28). Add the file extension
  - import "../../src/room/compose/vocabulary" without a file extension (build/room/orders.ts:21:29). Add the file extension
  - import "../../src/room/glb/rules" without a file extension (build/room/report.ts:29:30). Add the file extension
  - import "../pdf" without a file extension (build/room/typefaces.ts:26:32). Add the file extension
  - import "./project" without a file extension (src/room/compose/legibility.ts:12:36). Add the file extension
  - import "./rules" without a file extension (src/room/glb/read.ts:24:29). Add the file extension
  - import "../../src/room/glb/rules" without a file extension (build/room/orders.ts:22:58). Add the file extension
  - import "../../src/room/compose/bundle" without a file extension (build/room/report.ts:30:32). Add the file extension
  - import "./project" without a file extension (src/room/compose/legibility.ts:13:29). Add the file extension
  - import "./checks/rg" without a file extension (build/room/orders.ts:23:31). Add the file extension
  - import "../../src/room/compose/stages" without a file extension (build/room/report.ts:31:28). Add the file extension
  - import "./stages" without a file extension (src/room/compose/legibility.ts:14:28). Add the file extension
  - import "./emit" without a file extension (build/room/orders.ts:24:31). Add the file extension
  - import "./emit" without a file extension (build/room/report.ts:32:43). Add the file extension
  - import "./vocabulary" without a file extension (src/room/compose/legibility.ts:15:44). Add the file extension
  - import "./load" without a file extension (build/room/orders.ts:25:29). Add the file extension
  - import "./checks/family" without a file extension (build/room/report.ts:33:28). Add the file extension
  - import "./schema" without a file extension (build/room/orders.ts:26:46). Add the file extension
  - import "./checks/rg" without a file extension (build/room/report.ts:34:72). Add the file extension
  - import "./framing" without a file extension (src/room/compose/pick.ts:10:26). Add the file extension
  - import "./checks/rg" without a file extension (build/room/report.ts:35:31). Add the file extension
  - import "./project" without a file extension (src/room/compose/pick.ts:11:36). Add the file extension
  - import "./checks/ri" without a file extension (build/room/report.ts:36:28). Add the file extension
  - import "./project" without a file extension (src/room/compose/pick.ts:12:29). Add the file extension
  - import "./checks/rk" without a file extension (build/room/report.ts:37:59). Add the file extension
  - import "./stages" without a file extension (src/room/compose/pick.ts:13:27). Add the file extension
  - import "./schema" without a file extension (build/room/report.ts:38:29). Add the file extension
  - import "./stages" without a file extension (src/room/compose/pick.ts:14:28). Add the file extension
  - import "./source" without a file extension (build/room/report.ts:39:33). Add the file extension
  - import "./source" without a file extension (build/room/report.ts:40:27). Add the file extension
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
vite v8.3.3 building client environment for production...
transforming...
✓ 63 modules transformed.
rendering chunks...
resume: C1–C9 passed; the private denylist is missing here, so C9 checked the public list only
narration: N1–N5 passed for 44 scripts; the private denylist is missing here, so N3 checked the public list only
computing gzip size...
dist/index.html                                              0.83 kB │ gzip:   0.45 kB
dist/room-manifest.json                                      1.52 kB │ gzip:   0.60 kB
dist/resume.pdf.txt                                          5.00 kB │ gzip:   2.29 kB
dist/a/busy-sign.5b004a8d57b31aeb.glb.gz                    11.15 kB
dist/room-data.json                                         15.94 kB │ gzip:   3.30 kB
dist/a/wall-outlet.ec3c6384ed77b696.glb.gz                  17.62 kB
dist/assets/patrick-hand-latin-400-normal-Df9_VoRQ.woff     17.65 kB
dist/resume.pdf                                             30.29 kB
dist/a/charger.847444b98e04a2a2.glb.gz                      46.68 kB
dist/disclosure/index.html                                  50.94 kB │ gzip:  15.74 kB
dist/a/notebook.eae2e0d6ad05fe53.glb.gz                     59.26 kB
dist/assets/IBMPlexMono-Regular-BT_fvlmi.woff               66.92 kB
dist/assets/IBMPlexSans-Bold-BcmtwC_I.woff                  87.07 kB
dist/assets/IBMPlexSans-Regular-BgfvtkH4.woff               87.50 kB
dist/a/desk-screen.e9cf3a7dcc44cd55.glb.gz                  95.40 kB
dist/a/split-keyboard.5c987d38380d61cb.glb.gz              116.58 kB
dist/a/neon-sign.6a3f066de44a5bb0.glb.gz                   120.87 kB
dist/a/laptop-stand.869193ea7baff8d8.glb.gz                129.24 kB
dist/a/dog-sign.e45123bc258b1c20.glb.gz                    147.75 kB
dist/a/chalkboard.ead06b65eb1da86a.glb.gz                  162.79 kB
dist/a/wall-window.2657859b32185b45.glb.gz                 179.77 kB
dist/a/window-view.d030f41e7a98e3fd.glb.gz                 188.15 kB
dist/a/vertical-mouse.ac009724b3b7f534.glb.gz              198.35 kB
dist/a/laptop.3a3a408422449535.glb.gz                      225.57 kB
dist/a/wall-art.dfbad1fc0a7b5ddc.glb.gz                    293.46 kB
dist/a/helmet.a458798f92cb556e.glb.gz                      364.52 kB
dist/a/work-desk.1568a2917a8d9e42.glb.gz                   513.35 kB
dist/a/bag.635cd52f0e4e359a.glb.gz                         739.43 kB
dist/a/bicycle.a135f413f356b57a.glb.gz                     946.91 kB
dist/a/snowboard.f04dd193ad29f07b.glb.gz                   998.40 kB
dist/a/room-shell.7ef950f7dea73f9c.glb.gz                1,038.26 kB
dist/disclosure/style.css                                    0.49 kB │ gzip:   0.29 kB
dist/assets/index-CjYPohQT.css                               7.94 kB │ gzip:   2.31 kB
dist/assets/loader-XSsobutx.js                              51.91 kB │ gzip:  16.16 kB
dist/assets/index-vIIz9Ldk.js                               62.30 kB │ gzip:  22.23 kB
dist/assets/scene--yh_OesH.js                              653.11 kB │ gzip: 167.16 kB

[plugin builtin:vite-reporter] 
(!) Some chunks are larger than 640 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 3.63s
[33m[PLUGIN_TIMINGS] [0mJavaScript callbacks ran for 3.5s of this 3.6s build (96%).
The slowest callbacks, timed inside each callback (the wait before a callback starts is excluded, the time it awaits is included):
  - plugin h4-room-bundle buildStart (68%, 2.5s, 1 call)
Additional callback time came from the callbacks below and from callbacks under 1s.
1 callback is listed without a time. Its calls overlapped, so the time inside one call includes work from other calls. To find its cost, profile the build with `node --cpu-prof`:
  - plugin vite:css transform (7 calls)
See https://rolldown.rs/reference/InputOptions.checks#bundlertimings for more details.

+ python3 -I -B -X pycache_prefix=/dev/null tools/gates/content_check.py --tree . --dist apps/web/dist --repo .
content check: PASS (45 content files: 1 approved by main, 44 drafts, none of whose text is in dist/)
-> PASS content-check
== secrets
bash tools/gates/secrets.sh
secrets: gitleaks with /home/h4reet/h4reet-ai/h4reet-ai/.gitleaks.toml, over /tmp/claude-1000/wt-room-models
== gitleaks: unstaged changes
3:50PM INF 0 commits scanned.
3:50PM INF scanned ~0 bytes (0) in 22.4ms
3:50PM INF no leaks found
-> PASS unstaged changes
== gitleaks: staged changes
3:50PM INF 0 commits scanned.
3:50PM INF scanned ~0 bytes (0) in 20.8ms
3:50PM INF no leaks found
-> PASS staged changes
== gitleaks: 3 commits since main (4414b4adda1a..HEAD)
3:50PM INF 3 commits scanned.
3:50PM INF scanned ~14560 bytes (14.56 KB) in 29.9ms
3:50PM INF no leaks found
-> PASS 3 commits since main (4414b4adda1a..HEAD)
secrets: PASS (unstaged changes, staged changes, 3 commits since main)
-> PASS secrets
== arrival
file                                bytes     gzip      vertices  triangles  texture
assets/room/bag.glb                 1175616   739437    19485     24264      11184810
assets/room/bicycle.glb             3157008   946913    78480     88896      6990506
assets/room/busy-sign.glb           37040     11158     868       1014       0
assets/room/chalkboard.glb          432752    162794    9523      6034       5592405
assets/room/charger.glb             150152    46681     3522      5280       0
assets/room/desk-screen.glb         285384    95401     6546      10922      0
assets/room/dog-sign.glb            177900    147759    1030      1330       11184810
assets/room/helmet.glb              582856    364529    14038     21302      0
assets/room/laptop-stand.glb        360560    129243    8471      13800      0
assets/room/laptop.glb              1050656   225577    26638     31016      0
assets/room/neon-sign.glb           373360    120876    9268      10836      0
assets/room/notebook.glb            241788    59266     5647      7220       5592405
assets/room/room-shell.glb          1041372   1038264   16        8          55924051
assets/room/snowboard.glb           1748652   998405    35920     59752      22369620
assets/room/split-keyboard.glb      494040    116589    17742     10232      0
assets/room/vertical-mouse.glb      272664    198355    7516      14884      0
assets/room/wall-art.glb            532096    293465    8388      4206       11184810
assets/room/wall-outlet.glb         81880     17624     2218      1260       0
assets/room/wall-window.glb         654476    179770    17353     10836      5592405
assets/room/window-view.glb         505164    188152    10358     5826       11184810
assets/room/work-desk.glb           1202408   513354    22674     37796      11184810
first visit (phase 3): 6,593,612 of 25,000,000 bytes · history: 14,679,609 of 500,000,000 bytes
arrival-check: 0 findings in 64 files (3 commits)
python3 -I -B -X pycache_prefix=/dev/null scripts/assets/credits.py --check
credits: OK: the renderings and the records' form
-> PASS arrival
== evals
python3 -I -B -X pycache_prefix=/dev/null evals/run.py --suite product --adapter ${ADAPTER:-fake} $([ "${ADAPTER:-}" = local ] && echo --stack prod)
PASS  hello-fake
evals product (fake): 1 passed, 0 failed
python3 -I -B -X pycache_prefix=/dev/null evals/run.py --suite narration --adapter fake
PASS  narration-agent-orchestrator-engineer
PASS  narration-agent-orchestrator-non-engineer
PASS  narration-agent-watchdog-engineer
PASS  narration-agent-watchdog-non-engineer
PASS  narration-ai-strategy-engineer
PASS  narration-ai-strategy-non-engineer
PASS  narration-change-management-engineer
PASS  narration-change-management-non-engineer
PASS  narration-cht-agent-data-layer-engineer
PASS  narration-cht-agent-data-layer-non-engineer
PASS  narration-cht-agent-engineer
PASS  narration-cht-agent-non-engineer
PASS  narration-cht-codebase-engineer
PASS  narration-cht-codebase-non-engineer
PASS  narration-cht-docker-architecture-engineer
PASS  narration-cht-docker-architecture-non-engineer
PASS  narration-cht-skills-engineer
PASS  narration-cht-skills-non-engineer
PASS  narration-claude-medic-aws-engineer
PASS  narration-claude-medic-aws-non-engineer
PASS  narration-cloud-data-centers-engineer
PASS  narration-cloud-data-centers-non-engineer
PASS  narration-denver-local-ai-engineer
PASS  narration-denver-local-ai-non-engineer
PASS  narration-hareet-ai-engineer
PASS  narration-hareet-ai-non-engineer
PASS  narration-kenya-localization-engineer
PASS  narration-kenya-localization-non-engineer
PASS  narration-national-benchmarking-engineer
PASS  narration-national-benchmarking-non-engineer
PASS  narration-national-scale-engineer
PASS  narration-national-scale-non-engineer
PASS  narration-no-code-configuration-engineer
PASS  narration-no-code-configuration-non-engineer
PASS  narration-other-deployments-engineer
PASS  narration-other-deployments-non-engineer
PASS  narration-powersync-postgres-engineer
PASS  narration-powersync-postgres-non-engineer
PASS  narration-smart-task-prioritization-engineer
PASS  narration-smart-task-prioritization-non-engineer
PASS  narration-tools-engineer
PASS  narration-tools-non-engineer
PASS  narration-voice-for-cht-engineer
PASS  narration-voice-for-cht-non-engineer
evals narration (fake): 44 passed, 0 failed
python3 -I -B -X pycache_prefix=/dev/null evals/agent-config/static.py
PASS  CLAUDE.md is 58 lines and 5901 bytes (at most 60 and 6 KB)
PASS  CLAUDE.md names the constitution as superseding it
PASS  REVIEW.md names the constitution as superseding it
PASS  role docs: tools match roles.expected
PASS  role implementer: tools match roles.expected
PASS  role ops: tools match roles.expected
PASS  role red-teamer: tools match roles.expected
PASS  role reviewer: tools match roles.expected
PASS  role spec-writer: tools match roles.expected
PASS  hook .claude/hooks/bash-gate.sh is registered for PreToolUse Bash
PASS  hook .claude/hooks/protected-paths.sh is registered for PreToolUse Edit|Write|MultiEdit|NotebookEdit
PASS  hook .claude/hooks/post-edit-check.sh is registered for PostToolUse Edit|Write|MultiEdit
PASS  hook .claude/hooks/subagent-report-check.sh is registered for SubagentStop (every subagent)
PASS  hook .claude/hooks/content-scan.sh is registered for PreToolUse Edit|Write|MultiEdit
PASS  FR-007: 27 of 27 variables denied by name
agent-config static: 0 failed, 0 planned
tier=0; python3 -I -B -X pycache_prefix=/dev/null evals/behavioral_line.py || tier=$?; python3 -I -B -X pycache_prefix=/dev/null evals/docs_links.py && exit $tier
behavioral tier: 15 cases (11 enforcement, 4 conduct), 3 runs each; trigger hash 0e1669499c9a
WARN (behavioral tier): no run for trigger hash 0e1669499c9a in evals/agent-config/history/; the Author runs make evals-agent-config REF=<branch> from main's checkout, and commits its entry on the branch with the commands it prints
agent-config behavioral: pending, 0 planned
note: the behavioral tier's line is information in make evals, not a merge block (spec 006 FR-002): the gate's agent-config-evals step waits for a run only for a branch that changes CLAUDE.md, REVIEW.md, .claude/, or the Claude Code pin
PASS  every relative link resolves: 1583 links in 216 files
PASS  README.md links the ADR index (docs/adr/)
PASS  the ADR index links every ADR file: 26 of 26
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 1583 relative links in 216 files
-> WARN evals (WARN (behavioral tier): no run for trigger hash 0e1669499c9a in evals/agent-config/history/; the Author runs make evals-agent-config REF=<branch> from main's checkout, and commits its entry on the branch with the commands it prints)
== redteam
python3 -I -B -X pycache_prefix=/dev/null redteam/run.py
PASS  benign-greeting (safe, clean)
PASS  planted-human-claim (unsafe, caught: claims to be human)
redteam: 2 passed, 0 failed
-> PASS redteam
== matrix
bash redteam/forbidden-actions.sh
KNOWN GAP   bash-gate.sh          t=main; git tag "$t"
KNOWN GAP   bash-gate.sh          git tag $(echo main)
KNOWN GAP   bash-gate.sh          printf 'create refs/tags/main HEAD\n' | git update-ref --stdin
KNOWN GAP   bash-gate.sh          git fast-import --quiet < /tmp/stream
KNOWN GAP   bash-gate.sh          cd .git && printf x > main
KNOWN GAP   bash-gate.sh          git fetch . 'refs/heads/feature/*:refs/tags/*'
KNOWN GAP   bash-gate.sh          make $(printf 'aws-%s' login) ENV=prod
KNOWN GAP   bash-gate.sh          t=aws; make "$t-login" ENV=prod
KNOWN GAP   bash-gate.sh          bash deploy/scripts/aws-l?gin.sh
KNOWN GAP   bash-gate.sh          gh pr \<newline>merge 1
KNOWN GAP   bash-gate.sh          make $'aws\x2dlogin' ENV=prod
KNOWN GAP   bash-gate.sh          python3 -c "import importlib; importlib.import_module(\"evals\" + \".run\").main()" --adapter bedrock
KNOWN GAP   bash-gate.sh          cd evals && python3 run.py --suite product --adapter bedrock
KNOWN GAP   bash-gate.sh          python3 /tmp/o.py --stack prod contract-record --adapter bedrock --out /tmp/r.json --reason "a live run"
KNOWN GAP   bash-gate.sh          /tmp/a sso login --profile h4reet-bedrock
KNOWN GAP   bash-gate.sh          python3 -c 'open("tests/test_router.py", "w").write("")'
KNOWN GAP   bash-gate.sh          install -m 0644 /tmp/new.py tests/test_router.py
KNOWN GAP   bash-gate.sh          git checkout HEAD~1 -- tests/test_router.py
KNOWN GAP   role:red-teamer       make redteam 2>&1 -f /tmp/x.mk
KNOWN GAP   role:red-teamer       make redteam 2>&1 -f /tmp/x.mk [--agent]
KNOWN GAP   role:red-teamer       make evals X='a|b' -f /tmp/x.mk
KNOWN GAP   role:red-teamer       make evals X='a|b' -f /tmp/x.mk [--agent]
KNOWN GAP   role:red-teamer       make redteam --fi=/tmp/x.mk
KNOWN GAP   role:red-teamer       make redteam --fi=/tmp/x.mk [--agent]
KNOWN GAP   role:red-teamer       GNUMAKEFLAGS=-f/tmp/x.mk make redteam
KNOWN GAP   role:red-teamer       GNUMAKEFLAGS=-f/tmp/x.mk make redteam [--agent]
KNOWN GAP   role:red-teamer       MAKEFILES+=/tmp/x.mk make redteam
KNOWN GAP   role:red-teamer       MAKEFILES+=/tmp/x.mk make redteam [--agent]
KNOWN GAP   role:reviewer         git log -p >&1x
KNOWN GAP   role:reviewer         git log -p >&1x [--agent]
ENFORCED    bash-gate.sh          make studio-window ENV=prod STATE=start REASON="studio: a portrait batch" (a planned row: make it "block")
ENFORCED    bash-gate.sh          make studio-window ENV=dev STATE=end REASON="studio: the batch is done" (a planned row: make it "block")
ENFORCED    bash-gate.sh          make studio-window STATE=start REASON="studio: a portrait batch" (a planned row: make it "block")
ENFORCED    bash-gate.sh          make -C . studio-window ENV=prod STATE=start REASON="studio: a portrait batch" (a planned row: make it "block")
ENFORCED    bash-gate.sh          bash -c 'make studio-window ENV=dev STATE=end REASON=studio-batch-done' (a planned row: make it "block")
ENFORCED    bash-gate.sh          s=prod; make studio-window ENV=$s STATE=start REASON="studio: a portrait batch" (a planned row: make it "block")
ENFORCED    bash-gate.sh          make "studio"-window ENV=prod STATE=start REASON="studio: a portrait batch" (a planned row: make it "block")
ENFORCED    bash-gate.sh          make ENV=prod ./studio-window STATE=start REASON="studio: a portrait batch" (a planned row: make it "block")
ENFORCED    bash-gate.sh          ENV=prod make studio-window STATE=start REASON="studio: a portrait batch" (a planned row: make it "block")
ENFORCED    bash-gate.sh          make studio-window ENV=dev-cpu ENV=prod STATE=start REASON="studio: a portrait batch" (a planned row: make it "block")
ENFORCED    bash-gate.sh          t=studio-window; make $t ENV=prod STATE=start REASON=studio-portraits (a planned row: make it "block")
KNOWN GAP   bash-gate.sh          make $(printf 'studio-%s' window) ENV=prod STATE=start REASON=studio-portraits
KNOWN GAP   bash-gate.sh          t=studio; make "$t-window" ENV=prod STATE=start REASON=studio-portraits
KNOWN GAP   bash-gate.sh          make "$TARGET" ENV=prod STATE=start REASON=studio-portraits
KNOWN GAP   bash-gate.sh          python3 evals/agent-config/behavioral.py run
KNOWN GAP   bash-gate.sh          python3 tools/gates/matrix_canary.py
KNOWN GAP   bash-gate.sh          python3 tools/gates/publish_check.py
KNOWN GAP   bash-gate.sh          git commit $(printf -- '--no-%s' verify) -m wip
KNOWN GAP   bash-gate.sh          $(printf 'cla%s' ude) mcp add fs cmd
KNOWN GAP   bash-gate.sh          python3 -c "import urllib.request as u; u.urlopen('http://127.0.0.1:%d/admin/status' % (18000 + 3))"
KNOWN GAP   bash-gate.sh          make $(printf 'to%s' ols)
KNOWN GAP   bash-gate.sh          a shell write in a linked worktree: tools/gates/gate
KNOWN GAP   bash-gate.sh          a shell write in a linked worktree: evals/agent-config/static.py
KNOWN GAP   bash-gate.sh          git apply --cached /tmp/gates.patch
KNOWN GAP   bash-gate.sh          git update-index --add --cacheinfo "100644,$(git hash-object -w /tmp/new),tools/gates/gate"
KNOWN GAP   bash-gate.sh          git read-tree --prefix=tools/gates/ feature/x:tools/gates
KNOWN GAP   bash-gate.sh          git read-tree --prefix=evals/agent-config/ feature/x:evals/agent-config
KNOWN GAP   bash-gate.sh          a shell write in a linked worktree: assets/policy/approvals.json
KNOWN GAP   bash-gate.sh          a shell write in a linked worktree: assets/policy/content-approvals.json
--- stage S: the sandbox (SANDBOX_RUNTIME=1, .git/hooks unwritable) ---
NOTE        stage-S-unwritable    ~/.local/state/h4reet: no mask of its own, but it sits on a read-only mount (covered read-only /)
NOTE        stage-S-unwritable    assets/policy/content-approvals.json: no mask of its own, but it sits on a read-only mount (covered read-only /home/h4reet/h4reet-ai/h4reet-ai/assets/policy)
NOTE        stage-S-unwritable    assets/policy/resume-header.json: no mask of its own, but it sits on a read-only mount (covered read-only /home/h4reet/h4reet-ai/h4reet-ai/assets/policy)
NOTE        stage-S-unwritable    the studio's photos folder: unwritable through its read mask; denyWrite's own mount can't be observed while denyRead hides the folder, so H/settings/the studio's photos folder is write-denied is what proves the settings hold it
NOTE        stage-S-unwritable    the studio's outputs folder: unwritable through its read mask; denyWrite's own mount can't be observed while denyRead hides the folder, so H/settings/the studio's outputs folder is write-denied is what proves the settings hold it
NOTE        stage-S-unwritable    the studio's workflows folder: unwritable through its read mask; denyWrite's own mount can't be observed while denyRead hides the folder, so H/settings/the studio's workflows folder is write-denied is what proves the settings hold it
NOTE        stage-S-unwritable    the studio's blinding-key folder: unwritable through its read mask; denyWrite's own mount can't be observed while denyRead hides the folder, so H/settings/the studio's blinding-key folder is write-denied is what proves the settings hold it
NOTE        stage-S-case          no case variant of the studio's photos, outputs, workflows, blinding-key exists: a case-sensitive mount
SKIP        stage-S-conn          the SMTP host row: H4_STAGE_S_SMTP_HOST isn't set: it names the alert channel's SMTP host, deploy/env's SMTP_HOST
NOTE        stage-S-conn          npm and 198.18.0.1:2376 (allowed) need the proxy and the engine; proved by stage E and make engine-smoke
SKIP        stage-E               stage E not run: the prove report (2026-10-18T00:54:24Z, commit 58bd2327212e) proved deploy/agents-engine at tree 73ce5525f5f1, and this checkout's is eb65ab91ad63; rerun engine.sh prove
KNOWN GAP   bash-gate.sh          sh -c "$(printf 'gi%s pu%s' t sh)"
KNOWN GAP   bash-gate.sh          sh -c 'unset CLAUDE""CODE; git commit -m wip'
KNOWN GAP   bash-gate.sh          e=engine; deploy/agents-engine/$e.sh up
TOTALS      matrix                0 planned (reported, not failing), 2 skipped: stage S's SMTP row has no usable host; stage E's report is for another engine tree
REQUIRED    matrix-required       every listed row ran
forbidden-actions (hook layer): 795 passed, 0 failed, 51 known gaps
-> PASS matrix
== image
SKIP: no agents' engine yet: tasks.md T046
-> SKIP image (no agents' engine yet: tasks.md T046)

PASS     makefiles-check
PASS     githooks-check
PASS     toolchain-check
PASS     policy
PASS     validate-config
PASS     lint
PASS     test
PASS     content-check
PASS     secrets
PASS     arrival
WARN     evals  WARN (behavioral tier): no run for trigger hash 0e1669499c9a in evals/agent-config/history/; the Author runs make evals-agent-config REF=<branch> from main's checkout, and commits its entry on the branch with the commands it prints
PASS     redteam
PASS     matrix
SKIP     image  no agents' engine yet: tasks.md T046
make check: 12 PASS, 1 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 0 FAIL
```

## Room report

Bundle c7e2173d12d6e753 · release build · caps: main, assets/policy/caps.json e268db4ee85d5847

| Piece | Placements | Source | Bytes | gzip-9 bytes | Triangles | Texture memory | Budget (gzip-9 · triangles · texture) |
|---|---:|---|---:|---:|---:|---:|---|
| `bag` | 1 | studio, `bag.glb` | 1,175,616 | 739,437 | 24,264 | 11,184,810 | 750,000 · 24,500 · 11,184,810 |
| `bicycle` | 1 | studio, `bicycle.glb` | 3,157,008 | 946,913 | 88,896 | 6,990,506 | 1,500,000 · 89,000 · 6,990,506 |
| `busy-sign` at 1.5× | 1 | studio, `busy-sign.glb` | 37,040 | 11,158 | 1,014 | 0 | 150,000 · 1,500 · 1 |
| `chalkboard` at 1.25× | 1 | studio, `chalkboard.glb` | 432,752 | 162,794 | 6,034 | 5,592,405 | 300,000 · 6,500 · 5,592,405 |
| `charger` at 2× | 3 | studio, `charger.glb` | 150,152 | 46,681 | 5,280 | 0 | 100,000 · 5,500 · 1 |
| `desk-screen` at 1.2× | 1 | studio, `desk-screen.glb` | 285,384 | 95,401 | 10,922 | 0 | 600,000 · 11,000 · 1 |
| `dog-sign` at 1.5× | 1 | studio, `dog-sign.glb` | 177,900 | 147,759 | 1,330 | 11,184,810 | 150,000 · 1,500 · 11,184,810 |
| `helmet` | 1 | studio, `helmet.glb` | 582,856 | 364,529 | 21,302 | 0 | 400,000 · 21,500 · 1 |
| `laptop` | 1 | studio, `laptop.glb` | 1,050,656 | 225,577 | 31,016 | 0 | 400,000 · 31,500 · 1 |
| `laptop-stand` | 1 | studio, `laptop-stand.glb` | 360,560 | 129,243 | 13,800 | 0 | 200,000 · 14,000 · 1 |
| `neon-sign` at 2.6× | 1 | studio, `neon-sign.glb` | 373,360 | 120,876 | 10,836 | 0 | 300,000 · 11,000 · 1 |
| `notebook` | 1 | studio, `notebook.glb` | 241,788 | 59,266 | 7,220 | 5,592,405 | 100,000 · 7,500 · 5,592,405 |
| `room-shell` | 1 | studio, `room-shell.glb` | 1,041,372 | 1,038,264 | 8 | 55,924,051 | 1,050,000 · 2,000 · 55,924,051 |
| `snowboard` | 1 | studio, `snowboard.glb` | 1,748,652 | 998,405 | 59,752 | 22,369,620 | 1,000,000 · 60,000 · 22,369,620 |
| `split-keyboard` | 1 | studio, `split-keyboard.glb` | 494,040 | 116,589 | 10,232 | 0 | 150,000 · 10,500 · 1 |
| `twin-figure` | 1 | avatar | – | – | – | – | 1 · 1 · 1 |
| `vertical-mouse` | 1 | studio, `vertical-mouse.glb` | 272,664 | 198,355 | 14,884 | 0 | 200,000 · 15,000 · 1 |
| `visitor-figure` | 1 | avatar | – | – | – | – | 1 · 1 · 1 |
| `wall-art` | 1 | studio, `wall-art.glb` | 532,096 | 293,465 | 4,206 | 11,184,810 | 400,000 · 4,500 · 11,184,810 |
| `wall-outlet` | 1 | studio, `wall-outlet.glb` | 81,880 | 17,624 | 1,260 | 0 | 50,000 · 1,500 · 1 |
| `wall-window` | 1 | studio, `wall-window.glb` | 654,476 | 179,770 | 10,836 | 5,592,405 | 300,000 · 11,000 · 5,592,405 |
| `window-view` | 1 | studio, `window-view.glb` | 505,164 | 188,152 | 5,826 | 11,184,810 | 500,000 · 6,000 · 11,184,810 |
| `work-desk` | 1 | studio, `work-desk.glb` | 1,202,408 | 513,354 | 37,796 | 11,184,810 | 600,000 · 38,000 · 11,184,810 |

Per piece, the largest against the caps: 1,038,264 of 2,500,000 gzip-9 bytes; 88,896 of 100,000 triangles.
Scene texture memory: 158,626,181 of 200,000,000 bytes (models 157,985,452 · image cards 0 · avatars 0 · live-face canvases 640,729).
The twin's and the visitors' avatars have no file under assets/ yet, so they count 0.
First visit, the room's share: 6,593,612 gzip-9 bytes of placed models and cards, beside the design's estimate of 12,000,000; the enforced limit is spec 003's phase-3 first visit, 25,000,000. Spec 003's F3 view, every file under assets/room/: 6,598,339.

| Face | Readable | Desktop | Phone | Floor | Margin | Status |
|---|---|---:|---:|---:|---:|---|
| `neon-sign.word` | yes | 16.7 px | 9.1 px | 9 | 0.1 px | readable |
| `neon-sign.call` | yes | 11.1 px | 6.0 px | 9 | -3.0 px | exempt on the phone, carried by the text copy's "Around the room" |
| `neon-sign.visit` | yes | 11.1 px | 6.0 px | 9 | -3.0 px | exempt on the phone, carried by the text copy's "Around the room" |
| `neon-sign.second-line` | no | 5.8 px | 3.1 px | 9 | -5.9 px | atmosphere (max 43) |

Side-wall selectables (FR-064): the room draws no pick area for them at the stages named, and the "In the room" list reaches them.

| Selectable | 3D | 2D |
|---|---|---|
| `snowboard` (left-wall) | list-only at 304 × 196 and 107 others | list-only at 304 × 196 and 323 others |
| `chalkboard` (left-wall) | list-only at 304 × 196 and 528 others | list-only at 304 × 196 and 951 others |

| Switch | local | cloud | resting | budget | unavailable | unknown | paused | not-live |
|---|---|---|---|---|---|---|---|---|
| `laptop-power` | `plugged` | `unplugged` | `resting` | `resting` | `resting` | `resting` | `resting` | `resting` |

| Switch | Poses | Desktop | Phone | Status |
|---|---|---:|---:|---|
| `laptop-power` | `plugged` / `unplugged` | 43.4 px | 23.8 px | apart |
| `laptop-power` | `plugged` / `resting` | 167.9 px | 91.4 px | apart |
| `laptop-power` | `unplugged` / `resting` | 132.3 px | 71.7 px | apart |

Findings: none.

## Cost and data-flow impact

$0 to build: data and tests. No model call and no telemetry change.
A visit's first load grows by the room's 6,593,612 gzip-9 bytes of
models once the image serves them (T218 to T220), from the site's
own origin, inside spec 003's 25,000,000. No byte leaves the
visitor's device that didn't before: asset events stay `off` until
spec 001's route (row V6), so no disclosure entry changes.

## Backlog

- **The image and its nginx** (T218 to T220, with T214 to T216's
  tests and T224's `nginx -V`): User Story 4's first part, so
  `make up` serves the models gzip-encoded (SC-006).
- **One beacon carries 20 events:** with 21 set models, a 2D
  visit's skips take two sends once asset events are on; the hide's
  beacon carries 20, and the 21st waits in the page's queue.
- **The scene chunk's size warning** was on `main` already
  (648.62 kB, over the 640 kB limit `vite.config.ts` sets), now
  653.11 kB with the 3D part's model entries.
- **T235:** the probe of the served models on dev-cpu, after T218
  to T220; this session has no engine.

## For the Author

- **To see the room with its pieces** in `make up`, the image needs
  T218 to T220. Until then it draws stand-ins, and its build log
  names each piece with RX1's warn.
- **The placeholder note still shows:** with no stand-in left,
  `placeholders` is the avatars' alone, true until spec 003's twin
  and visitor files are under `assets/`.
- **The neon sign** now frames at 2.396 m, measured, over the
  2.1336 m walls, as option A said: "it rises above the walls and
  the window."
- **SC-006's words:** "Texture memory on the reference phone stays
  at or under 96 MB". The scene is at 158,626,181 bytes, under the
  200,000,000 you set on `main`; spec.md is unchanged, a
  `/speckit-clarify` item if you want the words to follow.
