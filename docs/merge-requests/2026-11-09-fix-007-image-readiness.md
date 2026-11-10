# fix/007-image-readiness

Spec: [specs/007-twin-conversation/](../../specs/007-twin-conversation/), its
[plan.md](../../specs/007-twin-conversation/plan.md)'s D44 · Intent: none · Written by: implementer subagent (Claude
Opus 5.5), for the main session · Date: 2026-11-09

Session: the main session started from `/home/h4reet/h4reet-ai/h4reet-ai`. This branch's worktree is
`/tmp/claude-1000/wt-imgready`, cut at `fix/007-steady-clock-test`'s tip, 40624d2d (gate 1; Status). Repo hooks
active: yes. In `.claude/audit/hooks.log`, every event of this session's in `wt-imgready` from the worktree's `git
worktree add -b fix/007-image-readiness` at 2026-11-10T01:04:34Z on was ALLOW, among them step 1's `git
--no-replace-objects merge --no-edit refs/heads/main` at 04:42:28Z, but one post-edit WARN at 01:11:59Z: the lint of
the new test between two edits (a helper not yet used), clean after the next edit. The three BLOCKs in the same
worktree, at 01:48:00Z ("redirecting git hooks or config", a `git config --show-origin` read), 01:48:35Z, and 01:51:44Z
("a read-only role writing a file"), are a read-only role's, the review's by their time, not this session's.

Authorized by: spec 007's FR-030 ("THE GATEWAY and THE ROOM'S BUILD SHALL read the same file under the same rule") and
FR-037 ("THE ROOM'S BUILD SHALL write each selectable's `ready` and `free_talk.ready` into `room-manifest.json` from
`config/twin-readiness.yaml` under FR-030's rule"), which this branch makes hold in the web image; and the main
session's brief, which named the suspected bug and asked for it confirmed, then fixed test-first. No decision of yours
was relayed to this session.

## Status: ready for its gate, on b0fa1d73, with step 1 done

Gate 1 (`fix/007-steady-clock-test`, 40624d2d; its note,
[2026-11-09-fix-007-steady-clock-test.md](2026-11-09-fix-007-steady-clock-test.md)) is on `main` by your hand merge,
f76ead54. Step 1 is done: this session merged `refs/heads/main` (f76ead54) into the branch, b0fa1d73, "Merge branch
'refs/heads/main' into fix/007-image-readiness". `main`'s tree was gate 1's own, so the merge's tree, f2f65d4f, is the
reviewed tip's, 76c5b44f's, exactly. The branch's own `REVIEW.md` pass, over 5a28f4dc, says "Verdict: ready. Nothing
blocks it." (Review); the commits after it are the note's and that merge. The checks below are on b0fa1d73, before this
note's update; **gate it now, from step 2.**

| Check, on b0fa1d73 | Result |
|---|---|
| Against `refs/heads/main` (f76ead54) | an ancestor of the tip, as are acde8b8b (the fix), 76c5b44f (the reviewed tip), and 40624d2d (gate 1); the diff from `main` is exactly this branch's four files, as step 3's guard checks |
| `make lint` | exit 0 |
| `make test` | exit 0: the gateway "95 passed (95)", "1652 passed \| 13 skipped (1665)"; the web "109 passed (109)", "2704 passed (2704)"; pytest "4099 passed in 407.86s (0:06:47)" |
| `make evals` | exit 0: product 187 passed, narration 44 passed, agent-config static 0 failed, docs links 0 failed of 1,834; the behavioral tier's advisory WARN |
| `make check ENGINE_MODE=none-yet` | "11 PASS, 1 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 1 FAIL; failing: matrix FAIL": `matrix` E10 and E14 alone, the environment's, as in gate 1's note; `arrival` "0 findings in 52 files (6 commits)", no warnings now that the intake is on `main` |
| `gitleaks dir` on the tip's tree | no leaks |

And before `main`'s merge, unchanged by it:

| Check | Result |
|---|---|
| The bug, in the image built as the gate builds it, from 40624d2d | confirmed: the index's three topics `ready:!1`, each talk object's `"ready": false`; the same export's tree read by the same code: all three ready |
| RED (1bb042eb), then GREEN (acde8b8b) | `image-inputs.test.ts`: "3 failed \| 2 passed (5)", then "5 passed (5)" |
| The image built from acde8b8b | the three topics `ready:!0`, the four talk objects `"ready": true`, free talk `false`; nginx's root the same eight entries, and neither hash in any of its files |
| `make lint`, `make test`, `make evals`, `make check`, on ea82cff9 | the same results as on b0fa1d73 but arrival's eight warnings (fix/009's intake, then in the range) and pytest's time (Verification) |

## Runs in your terminal

Gate 1 is merged (f76ead54), and step 1 is done (b0fa1d73), so start at step 2. Nothing paid, and no `--prove` or
behavioral tier: this branch touches neither `deploy/agents-engine/` nor `.claude/settings.json` (stage E), nor
`CLAUDE.md`, `REVIEW.md`, `.claude/`, `evals/agent-config/`, or the Claude Code pin (the agent-config evals). Against
`main` it changes four files: `apps/web/Dockerfile`, `apps/web/test/room/image-inputs.test.ts`,
`specs/007-twin-conversation/plan.md`, and this note. Each line below is short, for your terminal's wrap. If `main`
moves before the gate, step 3's guard says `no`: tell the session, which merges `main` again.

1. **`main` into this branch, after gate 1's merge. Done:** this session's merge, b0fa1d73, of `refs/heads/main` at
   f76ead54, through the worktree's own `git --no-replace-objects merge --no-edit refs/heads/main`, which the hooks
   and the classifier allowed. Kept as the record, the lines it gave for your hand, had the session's merge been
   refused; first the check that gate 1 is on `main`:

   ```bash
   cd /tmp/claude-1000/wt-imgready
   mr=refs/heads/main
   g1=40624d2df9222a463780cbc7ead015ff5ce74dc8
   anc=(merge-base --is-ancestor)
   git "${anc[@]}" "$g1" "$mr" && echo g1-in
   ```

   Then, only after `g1-in`:

   ```bash
   mg=(--no-replace-objects merge --no-edit)
   git "${mg[@]}" "$mr"
   ```

2. **The gate, from main's checkout:**

   ```bash
   cd ~/h4reet-ai/h4reet-ai
   git --no-replace-objects switch main
   b=fix/007-image-readiness
   log=~/gate-imgready.log
   tools/gates/gate "$b" 2>&1 | tee "$log"
   ```

   Expect Ready, with `evals` WARN (the behavioral tier's advisory line). The `image` step builds `h4reet-web:<SHA>`
   with the two new `COPY config/…` lines in its install stage. With any FAIL, don't merge, and tell the session.

3. **The guard.** It goes only if the gate printed its merge line, your checkout is on `main`, the branch is at the SHA
   the gate checked, `main` has nothing that SHA lacks, the SHA holds the fix (acde8b8b), and against `main` it changes
   exactly this branch's four files:

   ```bash
   s=$(grep '^gate: ' "$log" | tail -n 1)
   sha=$(printf '%s\n' "$s" | awk '{print $2}')
   n=$(grep -c '^merge: ' "$log")
   on=$(git symbolic-ref -q HEAD)
   tip=$(git rev-parse --verify "refs/heads/$b")
   mr=refs/heads/main
   want="$mr.$sha"
   ```

   Then, on its own lines:

   ```bash
   ok=no
   [ "$n" -gt 0 ] && ok=go
   [ "$on.$tip" = "$want" ] || ok=no
   anc=(merge-base --is-ancestor)
   git "${anc[@]}" "$mr" "$sha" || ok=no
   fx=acde8b8b685359fe901ff8f42ea44f8a2b143bb8
   git "${anc[@]}" "$fx" "$sha" || ok=no
   ```

   And the four files:

   ```bash
   nf=2026-11-09-fix-007-image-readiness.md
   w=(apps/web/Dockerfile)
   w+=(apps/web/test/room/image-inputs.test.ts)
   w+=(specs/007-twin-conversation/plan.md)
   w+=("docs/merge-requests/$nf")
   x=(diff --name-only "$mr" "$sha")
   a=$(git "${x[@]}" | sort)
   e=$(printf '%s\n' "${w[@]}" | sort)
   [ "$a" = "$e" ] || ok=no
   echo "guard: $ok"
   ```

4. **The merge, only after `guard: go`,** the gate's merge line rebuilt from its log:

   ```bash
   m="Merge $b (${sha:0:12})"
   o=(--no-replace-objects merge --no-ff)
   o+=(-m "$m" -m "$s")
   [ "$ok" = go ] && git "${o[@]}" "$sha"
   ```

5. **The stack,** from main's checkout; prod's web image is built from the commit's export, now with the five files:

   ```bash
   make up ENV=prod
   ```

6. **The check, in the browser** at the site's local address: Enter, then select a piece whose topic your file marks
   ready, the chalkboard (mission), the laptop (work projects), or the snowboard or the bicycle (hobbies and travel).
   The panel should say "The twin is answering." and then show an answer under "AI twin", where before this branch it
   gave the topic's fixed message and sent nothing. Typing with no piece selected still sends nothing: free talk isn't
   ready in your file. Gate 1's step 5, the T046 demo (fix/009's step 5), goes in the same visit, on the same stack
   (For the Author, 1). Your verdict to the session, for a follow-up note.

7. **Park off `main` again,** only if the park branch has nothing `main` lacks (it has nothing today). It defines
   its own `anc`, so it works in a fresh shell:

   ```bash
   p=wip-park/11-9-2026
   anc=(merge-base --is-ancestor)
   sw=(--no-replace-objects switch -C "$p")
   git "${anc[@]}" "$p" HEAD && git "${sw[@]}"
   ```

## What changed and why

**The bug.** The room's build composes the room with `readiness: twinReadiness(tree)` and `talkLimits(tree)`, the tree
being the repository's root (`apps/web/build/room/plugin.ts`'s `buildStart`; `vite.config.ts`'s `roomBundle({ root:
here("../..") })`, `/src` in the image). `apps/web/build/room/readiness.ts` reads five files from it:
`config/twin-readiness.yaml`, `config/twin/corpus.json`, `config/twin/prompt.md`, `config/twin/lines.yaml`, and
`config/budgets.yaml`. A missing one makes nothing ready, and the build goes on (FR-030: "WHILE the file is missing or
invalid, nothing SHALL be ready"). `apps/web/Dockerfile`'s install stage copied no `config/`, and nothing in
`deploy/compose.yaml`, `nginx.conf`, or `deploy/scripts/web_image.py` brings readiness in at run time. So prod's web
image marked every topic not ready, and a visitor's selection of a piece gave its fixed message and sent nothing
(FR-032), while every build in a checkout, `make test`'s among them, saw your file and the three ready topics.

**The fix** (acde8b8b): the install stage copies those five files to their tree paths, before either of apps/web's
builds runs (`build`, and the lookdev phone copy's `build:lookdev-phone`, which builds on the same install stage), and
no other part of `config/`:

```dockerfile
COPY config/twin-readiness.yaml config/budgets.yaml config/
COPY config/twin/corpus.json config/twin/prompt.md config/twin/lines.yaml config/twin/
```

with a comment citing FR-030 and FR-037 and plan.md's D44. The runtime stage still copies only `dist/` from the build
stage (`COPY --from=build /src/apps/web/dist /usr/share/nginx/html`; beside it only its own `nginx.conf`, from the
context), held there by `deploy/scripts/test_web_image.py`'s
`test_only_the_build_stage_reads_the_models`), so none of the five files reaches nginx's root.

**The test** (1bb042eb, RED; `apps/web/test/room/image-inputs.test.ts`, beside the room's other build tests): it takes
the list from `readiness.ts`'s own constants (`READINESS_PATH`, `PACK_FILE`, `PROMPT_FILE`, `LINES_FILE`,
`BUDGETS_FILE`), not a second list, and

- holds the tree's reads to exactly those: `twinReadiness` and `talkLimits` over the repository's tree log exactly the
  five paths, so a new read that bypasses the constants fails it;
- reads the Dockerfile's stages (comments dropped, continuations joined, as the Python tests read them), finds each RUN
  of an apps/web build, walks the stages it stands on, and checks that a COPY from the context before that RUN puts
  each file at its tree path under the RUN's working directory, the room's root there; a sanity case checks the reader
  on the build's existing inputs (`docs/data-flow-disclosure.md` into a folder, `assets/policy/caps.json` to its own
  path, `apps/web/vite.config.ts` through a folder copy) and on a file it doesn't copy (`deploy/compose.yaml`);
- holds the context's copies from `config/`, in any stage, to exactly those five.

**`talkLimits` too.** `config/budgets.yaml`'s `limits.twin` (600, 8, 4,000) equals FR-027's defaults today, so the image
built without it showed the same limits (`twin:{limits:{turnMaxChars:600,historyMaxTurns:8,historyMaxChars:4e3}}` both
before and after); with the copy, a change of yours to `limits.twin` now reaches the image's text box as it reaches the
route.

**Anything else the room's build reads from `config/`:** nothing. Over the export of 40624d2d, the whole of `buildStart`
(`compose` in release and in drafts mode, with `twinReadiness` and `talkLimits`) reads these five `config/` paths and
no other (Verification). `config/room-events.yaml` and `config/room-topics.yaml` are `room:generate`'s outputs, which
the build never reads; `twin-pack.ts`'s reads are its CLI's, not the build's.

**Spec 007's plan.md** gets D44's row, §6's sentence on the tree the build reads (now naming the image's install
stage), and the Dockerfile and the test in Project Structure.

## Acceptance criteria

| ID | How this branch meets it |
|---|---|
| Spec 007 FR-030 | the gateway and the room's build now read the same file under the same rule in the image too: the image's index has the three topics your file marks ready, and free talk not ready, as the gateway reads it |
| Spec 007 FR-037 | the image's `room-manifest.json` has each talk object's `ready` from `config/twin-readiness.yaml` (four `true`, `free_talk.ready` `false`), where it had all `false` |
| Spec 007 FR-027 | the room's build in the image reads the per-turn limits from `config/budgets.yaml`'s `limits.twin`, as the route does, not FR-027's defaults by the file's absence |
| Spec 007 FR-032 | with a ready topic in the index, a visitor's selection of its piece starts a conversation in prod's room; your browser check (step 6) |

## Constitution check

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local by default | No | No flow added; the turn's flow is V2's, already disclosed |
| II. Production-grade or not shipped | Yes | Confirmed in the built image, RED then GREEN, and re-confirmed in the image built from the fix; `make lint`, `make test`, `make evals`, and `make check` below |
| III. Intent before spec, spec before code, humans merge | Yes | Under spec 007's FR-030 and FR-037; plan.md's D44 in the same commit as the fix; you merge |
| IV. Least privilege | No | This session wrote nothing under `.claude/`, `tools/gates/`, `evals/agent-config/`, `assets/`, `corpus/`, `config/`, or `.specify/`, nor `CLAUDE.md` or `REVIEW.md`; the image build ran on the agents' engine through its relay, as `make image` does |
| V. Cost is a first-class signal | Yes | $0 here; prod's room can now send turns, at spec 007's estimate (Cost) |
| VI. Build in public | Yes | The image's readings, before and after, are in this note |
| VII. Own the whole product | Yes | The image is the product; the check now holds the image to the checkout |
| VIII. Honest AI | No | Nothing the twin says changes |
| Security and agent governance | Yes | This session reviews none of its own work (Review) |

## Review

A reviewer agent's `REVIEW.md` pass over this branch's own diff, `40624d2d..5a28f4dc`, from a session that wrote none
of it, as the main session relayed it to this session. It read only this branch's four files, the Dockerfile, the
test, plan.md, and this note: gate 1 and fix/009 under it have their own reviews ("ready", in their notes). This session
wrote this branch and reviews none of it. The review's full text wasn't relayed; the nits below are in the relay's
words where quoted, and summarized where not.

- **Verdict:** "Verdict: ready. Nothing blocks it." Five nits, a wording point, and a line for your `CLAUDE.md`. As the
  main session asked, this commit changes this note alone, and the Dockerfile and the test stay as reviewed.
- **N1:** the Acceptance criteria claimed FR-041, but nothing in the diff touches the text box. **Done:** the row is
  FR-027 alone, the limits from `config/budgets.yaml`'s `limits.twin`.
- **N2:** the test's first case checks only `readiness.ts`'s reads, not `buildStart`'s; holding `compose` over
  `fileTree(REPO_ROOT)` to `INPUTS` would close it. **Backlog:** a test change, for a later branch.
- **N3:** step 7 used `anc`, which only step 3 defines, so in a fresh shell the park silently didn't happen.
  **Done:** step 7 defines `anc` itself, each line still at most 45 characters.
- **N4:** For the Author's item 1 dropped gate 1's step 5, the T046 demo in the browser. **Done:** item 1 names it
  beside this note's step 6, and step 6 points to it.
- **N5:** the Dockerfile reader's regex misses differently spelled builds and a `RUN --mount=type=bind,source=config`.
  **Backlog.**
- **Wording:** "copies only dist/" should read "only dist/ from the build stage", since the runtime stage also copies
  `nginx.conf`. **Done** in this note; **Backlog** for the test's header and the Dockerfile's comment, for a later
  change.
- **Feed-back:** a `CLAUDE.md` line, for your hand only, in For the Author (item 5); the second time this has come up,
  after T328's caps.

Step 3's guard holds the gate to this branch's fix and its four files, so this note-only commit changes nothing it
checks.

## Verification

All in `/tmp/claude-1000/wt-imgready`, with the pinned Node, after `npm ci --cache "$TMPDIR/npm-cache-imgready"`. The
image builds ran on the agents' engine through `deploy/agents-engine/docker-relay`, each from a `git --no-replace-objects
archive` export outside the worktree, with the gate's own arguments (`docker buildx build --load --file
<export>/apps/web/Dockerfile --build-arg HTTP_PROXY=… --build-arg HTTPS_PROXY=… --build-arg ROOM_DRAFTS= <export>`, no
named contexts: the Dockerfile's empty policy, room-assets, and visitor-assets stages), tagged
`h4reet-web:imgready-before` and `h4reet-web:imgready-after`. Both images, both exports, and their logs were deleted by
name after. `make lint`, `make test`, `make evals`, and `make check` ran twice: on b0fa1d73, step 1's merge of `main`
(first below), and before it on ea82cff9 (the fix and this note's draft), whose next two commits changed this note
alone. Each ran alone, with no other heavy run beside it.

### On b0fa1d73, after step 1's merge of main

#### The merge, and the branch against main

`refs/heads/main` was f76ead54, "Merge fix/007-steady-clock-test (40624d2df922) by hand", its parents ada55c98 and
40624d2d, and its tree gate 1's own (`git diff --stat 40624d2d f76ead54` empty). In the worktree, `git
--no-replace-objects merge --no-edit refs/heads/main`: "Merge made by the 'ort' strategy.", exit 0, b0fa1d73. Then:

```text
HEAD^{tree}      f2f65d4f746e16adda2730d14249b54bea836d8b
76c5b44f^{tree}  f2f65d4f746e16adda2730d14249b54bea836d8b
ancestor: refs/heads/main
ancestor: acde8b8b685359fe901ff8f42ea44f8a2b143bb8
ancestor: 76c5b44f
ancestor: 40624d2d
--- diff vs main:
apps/web/Dockerfile
apps/web/test/room/image-inputs.test.ts
docs/merge-requests/2026-11-09-fix-007-image-readiness.md
specs/007-twin-conversation/plan.md
four files: exactly
```

The last line is step 3's comparison, the sorted `git diff --name-only refs/heads/main HEAD` against the four names.

#### make lint

On b0fa1d73, exit 0:

```text
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
461 files already formatted
```

followed by shellcheck over the repository's scripts, with no finding.

#### make test

On b0fa1d73, exit 0, all three suites:

```text
corpus-check: OK — 44 slots, 26 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems
 Test Files  95 passed (95)
      Tests  1652 passed | 13 skipped (1665)
 Test Files  109 passed (109)
      Tests  2704 passed (2704)
4099 passed in 407.86s (0:06:47)
```

#### make evals

On b0fa1d73, exit 0:

```text
evals product (fake): 187 passed, 0 failed
INFO (twin readiness): hobbies-and-travel: ready, its evidence at the running hashes
INFO (twin readiness): mission: ready, its evidence at the running hashes
INFO (twin readiness): work-projects: ready, its evidence at the running hashes
evals narration (fake): 44 passed, 0 failed
agent-config static: 0 failed, 0 planned
behavioral tier: 15 cases (11 enforcement, 4 conduct), 3 runs each; trigger hash 05cec03a74a5
WARN (behavioral tier): 2026-11-09T152345Z-feat-011-pa-anthropic-denies-09522968ea48, the newest run for trigger hash 05cec03a74a5, failed: conduct regressed against main's last entry 2026-11-08T151546Z-feat-007-p1-69ab1428d23d: held in 10 of 12 runs, against 11 of 12, over pastes-check-output, refuses-to-widen-allowlist, reviewer-reads-room-data, stays-on-branch
agent-config behavioral: fail, 0 planned
note: the behavioral tier's line is information in make evals, not a merge block (spec 006 FR-002): the gate's agent-config-evals step waits for a run only for a branch that changes CLAUDE.md, REVIEW.md, .claude/, or the Claude Code pin
docs links: 0 failed, 1834 relative links in 262 files
```

#### make check ENGINE_MODE=none-yet

On b0fa1d73, exit 2, `matrix` alone failing, on E10 and E14, as in gate 1's note:

```text
secrets: PASS (unstaged changes, staged changes, 6 commits since main)
first visit (phase 3): 9,841,044 of 25,000,000 bytes · history: 25,459,087 of 500,000,000 bytes
arrival-check: 0 findings in 52 files (6 commits)
redteam: 68 passed, 0 failed
E10  FAIL  (from prove-limits.sh): E10   FAIL engine.sh reset leaves a new engine holding only the seeded images -- seen: engine.sh reset failed: engine.sh: not enough free space to seed: need 22 GiB on both the Windows drive and ext4; 19 of the 19 seeded images are missing
E14  FAIL  (from prove-limits.sh): E14   FAIL dev-cpu publishes on the host's 127.0.0.1 (ports 18300-18305); no answer on 18300 18301 18302 18303 18304 18305; the sandbox cannot reach them (stage S)
forbidden-actions (hook layer): 853 passed, 2 failed, 57 known gaps

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
WARN     evals  WARN (behavioral tier): 2026-11-09T152345Z-feat-011-pa-anthropic-denies-09522968ea48, the newest run for trigger hash 05cec03a74a5, failed: conduct regressed against main's last entry 2026-11-08T151546Z-feat-007-p1-69ab1428d23d: held in 10 of 12 runs, against 11 of 12, over pastes-check-output, refuses-to-widen-a
PASS     redteam
FAIL     matrix
SKIP     image  no agents' engine yet: tasks.md T046
make check: 11 PASS, 1 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 1 FAIL; failing: matrix FAIL
```

Its `test` step: the gateway "95 passed (95)", "1652 passed | 13 skipped (1665)"; the web "109 passed (109)", "2704
passed (2704)"; pytest "4099 passed in 395.04s (0:06:35)". `arrival` has no warnings now: fix/009's intake is on
`main`, out of the range. `image` is SKIP under `ENGINE_MODE=none-yet`; the gate's image step builds it.

#### gitleaks

`gitleaks dir` over the tip's tree, a `git --no-replace-objects archive` export of b0fa1d73 with this note's update,
all but this paragraph, copied in, with the gate's flags (`--redact`, `--config` main's `.gitleaks.toml` shown into a
scratch file, a fresh empty `--gitleaks-ignore-path`, `--ignore-gitleaks-allow`, `--report-format json`, `--exit-code
99`), from inside the export, with no `.gitleaksignore` at its root; its JSON report `[]`:

```text
10:06PM INF scanned ~50812421 bytes (50.81 MB) in 2.08s
10:06PM INF no leaks found
exit 0
```

The export and its scratch folder (`$TMPDIR/imgready-gl-export3`, `$TMPDIR/imgready-gl3`) were deleted by name after.

### Before main's merge (ea82cff9 and earlier)

The records from before step 1, as they were, on the commits each names.

#### The bug, in the image built from 40624d2d

The entry chunk's index, `grep -o "topics:\[[^]]*\]" assets/index-*.js` in `/usr/share/nginx/html`:

```text
topics:[{id:`hobbies-and-travel`,phrase:`hobbies and travel adventures`,ready:!1},{id:`mission`,phrase:`the Author's mission`,ready:!1},{id:`work-projects`,phrase:`work projects`,ready:!1}]
twin:{limits:{turnMaxChars:600,historyMaxTurns:8,historyMaxChars:4e3}}
```

`room-manifest.json`'s talk objects and free talk:

```text
snowboard   hobbies-and-travel  "ready": false
bicycle     hobbies-and-travel  "ready": false
laptop      work-projects       "ready": false
chalkboard  mission             "ready": false
free_talk                       "ready": false
```

The same code over the same export's tree, as `buildStart` reads it (`twinReadiness` and `talkLimits` over
`fileTree(<export>)`, from a scratch script outside the worktree):

```text
topics {"hobbies-and-travel":true,"mission":true,"work-projects":true} free_talk false
limits {"turnMaxChars":600,"historyMaxTurns":8,"historyMaxChars":4000}
config reads ["config/twin/corpus.json","config/twin/prompt.md","config/twin/lines.yaml","config/twin-readiness.yaml","config/budgets.yaml"]
```

And the whole `buildStart` (`compose` over that tree with `noPolicy()`, in release and then in drafts mode, with the
readiness and the limits), its tree log's `config/` paths, the same in both:

```text
config reads ["config/twin/corpus.json","config/twin/prompt.md","config/twin/lines.yaml","config/twin-readiness.yaml","config/budgets.yaml"]
```

#### RED, then GREEN

RED, 1bb042eb, `npx vitest run test/room/image-inputs.test.ts` in `apps/web`:

```text
     × copies each file to its tree path under /src before `npm run build` runs
     × copies each file to its tree path under /src before `npm run build:lookdev-phone` runs
     × copies from config/ those five files by name, and no other part of it, into any stage
+ [
+   "config/twin-readiness.yaml",
+   "config/twin/corpus.json",
+   "config/twin/prompt.md",
+   "config/twin/lines.yaml",
+   "config/budgets.yaml",
+ ]
 Test Files  1 failed (1)
      Tests  3 failed | 2 passed (5)
```

The two that passed: the tree's reads are exactly the five constants, and the reader finds both builds and the build's
existing inputs. GREEN, acde8b8b:

```text
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

`deploy/scripts/test_web_image.py` and `test_web_nginx.py`, which read the same Dockerfile (among them: every context
file it copies is in the context, and the runtime stage copies only `dist/` from the build stage), on acde8b8b: "99 passed in 6.90s".

#### The image built from acde8b8b

The build's log, its install stage:

```text
#15 [install  9/13] COPY config/twin-readiness.yaml config/budgets.yaml config/
#16 [install 10/13] COPY config/twin/corpus.json config/twin/prompt.md config/twin/lines.yaml config/twin/
```

In `/usr/share/nginx/html`:

```text
topics:[{id:`hobbies-and-travel`,phrase:`hobbies and travel adventures`,ready:!0},{id:`mission`,phrase:`the Author's mission`,ready:!0},{id:`work-projects`,phrase:`work projects`,ready:!0}]
twin:{limits:{turnMaxChars:600,historyMaxTurns:8,historyMaxChars:4e3}}
```

```text
snowboard   hobbies-and-travel  "ready": true
bicycle     hobbies-and-travel  "ready": true
laptop      work-projects       "ready": true
chalkboard  mission             "ready": true
free_talk                       "ready": false
```

nginx's root lists the same eight entries as before (`50x.html`, `assets`, `disclosure`, `healthz`, `index.html`,
`resume.pdf`, `room-data.json`, `room-manifest.json`); no `*.yaml`, `corpus.json`, or `prompt.md` anywhere under it;
and a fixed-string search of every file under it for the pack's hash and the prompt's (their first 16 hex digits each)
found neither. The one file naming `twin-readiness` is the disclosure page, from `docs/data-flow-disclosure.md`'s own
words, the same in the image before the fix.

#### make lint

On ea82cff9, exit 0:

```text
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
461 files already formatted
```

followed by shellcheck over the repository's scripts, with no finding.

#### make test

On ea82cff9, exit 0, all three suites:

```text
corpus-check: OK — 44 slots, 26 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems
 Test Files  95 passed (95)
      Tests  1652 passed | 13 skipped (1665)
 Test Files  109 passed (109)
      Tests  2704 passed (2704)
4099 passed in 389.64s (0:06:29)
```

The web's one more file and five more cases, against gate 1's "108 passed (108)" and "2699 passed (2699)", are
`image-inputs.test.ts`.

#### make evals

On ea82cff9, exit 0:

```text
evals product (fake): 187 passed, 0 failed
INFO (twin readiness): hobbies-and-travel: ready, its evidence at the running hashes
INFO (twin readiness): mission: ready, its evidence at the running hashes
INFO (twin readiness): work-projects: ready, its evidence at the running hashes
evals narration (fake): 44 passed, 0 failed
agent-config static: 0 failed, 0 planned
behavioral tier: 15 cases (11 enforcement, 4 conduct), 3 runs each; trigger hash 05cec03a74a5
WARN (behavioral tier): 2026-11-09T152345Z-feat-011-pa-anthropic-denies-09522968ea48, the newest run for trigger hash 05cec03a74a5, failed: conduct regressed against main's last entry 2026-11-08T151546Z-feat-007-p1-69ab1428d23d: held in 10 of 12 runs, against 11 of 12, over pastes-check-output, refuses-to-widen-allowlist, reviewer-reads-room-data, stays-on-branch
agent-config behavioral: fail, 0 planned
note: the behavioral tier's line is information in make evals, not a merge block (spec 006 FR-002): the gate's agent-config-evals step waits for a run only for a branch that changes CLAUDE.md, REVIEW.md, .claude/, or the Claude Code pin
docs links: 0 failed, 1833 relative links in 262 files
```

#### make check ENGINE_MODE=none-yet

On ea82cff9, exit 2, `matrix` alone failing, on E10 and E14, as in gate 1's note:

```text
secrets: PASS (unstaged changes, staged changes, 25 commits since main)
first visit (phase 3): 9,841,044 of 25,000,000 bytes · history: 25,459,087 of 500,000,000 bytes
arrival-check: 0 findings in 81 files (25 commits), 8 warnings
redteam: 68 passed, 0 failed
E10  FAIL  (from prove-limits.sh): E10   FAIL engine.sh reset leaves a new engine holding only the seeded images -- seen: engine.sh reset failed: engine.sh: not enough free space to seed: need 22 GiB on both the Windows drive and ext4; 19 of the 19 seeded images are missing
E14  FAIL  (from prove-limits.sh): E14   FAIL dev-cpu publishes on the host's 127.0.0.1 (ports 18300-18305); no answer on 18300 18301 18302 18303 18304 18305; the sandbox cannot reach them (stage S)
forbidden-actions (hook layer): 853 passed, 2 failed, 57 known gaps

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
WARN     evals  WARN (behavioral tier): 2026-11-09T152345Z-feat-011-pa-anthropic-denies-09522968ea48, the newest run for trigger hash 05cec03a74a5, failed: conduct regressed against main's last entry 2026-11-08T151546Z-feat-007-p1-69ab1428d23d: held in 10 of 12 runs, against 11 of 12, over pastes-check-output, refuses-to-widen-a
PASS     redteam
FAIL     matrix
SKIP     image  no agents' engine yet: tasks.md T046
make check: 11 PASS, 1 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 1 FAIL; failing: matrix FAIL
```

Its `test` step: the gateway "95 passed (95)", "1652 passed | 13 skipped (1665)"; the web "109 passed (109)", "2704
passed (2704)"; pytest "4099 passed in 460.44s (0:07:40)". The eight arrival warnings are fix/009's intake's
`WARN assets/visitors/…` lines, in the range since `main`, as gate 1's note expects. `image` is SKIP under
`ENGINE_MODE=none-yet`; the image builds above ran on the engine.

#### Against refs/heads/main, and gitleaks

`refs/heads/main` is ada55c98, an ancestor of the tip, as are 40624d2d (gate 1) and acde8b8b (the fix), so a
`--no-ff` merge today writes the tip's own tree. Against 40624d2d the branch changes the four files above. Nothing in
it touches `tools/gates/`, `.claude/`, `evals/agent-config/`, `assets/`, `corpus/`, `config/`, `.specify/`,
`deploy/agents-engine/`, `CLAUDE.md`, or `REVIEW.md`. After gate 1's merge and step 1, the rehearsal is the gate's.

`gitleaks dir` over the tip's tree, a `git --no-replace-objects archive` export of ea82cff9 with this note's text, all
but this paragraph, copied in, with the gate's flags (`--redact`, `--config` main's `.gitleaks.toml` shown into a scratch file, a fresh
empty `--gitleaks-ignore-path`, `--ignore-gitleaks-allow`, `--report-format json`, `--exit-code 99`), from inside the
export, with no `.gitleaksignore` at its root; its JSON report `[]`:

```text
6:44PM INF scanned ~50801238 bytes (50.80 MB) in 1.51s
6:44PM INF no leaks found
exit 0
```

The export and its scratch folder (`$TMPDIR/imgready-gl-export`, `$TMPDIR/imgready-gl`) were deleted by name after.

## Cost and data-flow impact

- **Model spend here: $0.** No model call; this session's work is on the Claude Team plan.
- **In prod, after the merge,** the room's three ready topics start conversations, so visitors' turns reach the gateway
  as spec 007 planned: $0 a local turn, about $0.0007 to $0.00095 a fallback turn ([plan.md §15](../../specs/007-twin-conversation/plan.md#15-expected-cost-and-how-its-measured)),
  within the paid route's sub-budget and caps. This branch adds no cost of its own.
- **The visitor's bytes:** the entry chunk's three `ready:!1` become `ready:!0`, the same length; no file is added to
  nginx's root (its listing is the same eight entries before and after).
- **Data flow: none new.** The turn's request is V2 in `docs/data-flow-disclosure.md`, already there; no new row.

## Backlog

- **The gate's image step proves the image builds, not what its room shows.** Reading the built image's
  `room-manifest.json` and comparing its `ready` flags with a checkout build's would have caught this; `make test`'s
  builds run in a checkout and couldn't. `tools/gates/` is yours; a suggestion, not a blocker.
- **`build/twin-pack.ts` names three of the same paths again** (`PACK_PATH`, `PROMPT_PATH`, `BUDGETS_PATH`) beside
  `readiness.ts`'s. The test takes `readiness.ts`'s, which are what the room's build reads; one set of names would be
  tidier. Not this branch.
- **The test's Dockerfile reader** takes COPY and ADD sources as plain paths: no wildcard and no `--parents`. None of
  the Dockerfile's copies uses either today, and either would read in the safe direction: the test fails, not passes.
- **The test's first case checks `readiness.ts`'s reads, not `buildStart`'s** (Review, N2): it holds `twinReadiness`
  and `talkLimits` over the tree to `INPUTS`. Holding `compose` over `fileTree(REPO_ROOT)` to the same list as well
  would catch a `config/` read the compositor gains. A test change, for a later branch.
- **The reader's build regex** (Review, N5) finds `npm run [--ignore-scripts] build[:name] -w apps/web`; a build spelled
  otherwise (another flag order, `--workspace`, `npx vite build`) would go unchecked, and so would a `RUN
  --mount=type=bind,source=config`, which reads `config/` without a COPY. A test change, for a later branch.
- **"copies only dist/"** (Review, wording): the test's header and the Dockerfile's new comment say the runtime stage
  copies only `dist/`; it copies only `dist/` from the build stage, and its own `nginx.conf` from the context. A
  wording change to both, for a later change; this note says it as it is.
- **The worktree's automatic `git gc` failed** at the GREEN commit: "fatal: bad object refs/replace", "fatal: failed to
  run repack", leaving `.git/worktrees/wt-imgready/gc.log`, so automatic cleanup stops there until the file is removed.
  The commit itself landed; this session writes nothing under `.git/`. It goes with the worktree's removal.

## For the Author

1. **The order:** gate 1 is merged (f76ead54) and this note's step 1 is done (b0fa1d73), so this note's steps 2 to 7
   are next. Gate 1's step 4 (`make up ENV=prod`) and step 6 (the park) are this note's 5 and 7; **gate 1's step 5,
   the T046 demo in the browser** (fix/009's step 5: the woman at the door, the hand-off
   ending in her left hand, a talk with the twin, the stand-in line, and "2D view"), goes beside this note's step 6, in
   the same visit to the site.
2. **What changes in prod:** the three topics your `config/twin-readiness.yaml` marks ready open in prod's room, so
   visitors' turns reach the gateway: local first, then the paid fallback within its sub-budget and caps (Cost). That
   is your file's say, not this branch's; free talk stays closed, as your file has it.
3. **The gate's image step** could read what the image's room shows (Backlog), by your hand.
4. **After the merge,** the cleanup: `git worktree remove /tmp/claude-1000/wt-imgready`.
5. **For your CLAUDE.md,** by your hand only (the review's feed-back line; the second time this has come up, after
   T328's caps, then D44's readiness), under "Things Claude gets wrong":

   ```text
   - Adding a build-time read of a tree file without copying it into apps/web/Dockerfile's install stage: a checkout's build sees it, the image's silently falls back (T328's caps, D44's readiness).
   ```
