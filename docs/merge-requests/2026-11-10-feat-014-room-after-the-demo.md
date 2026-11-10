# feat/014-room-after-the-demo

Spec: [specs/014-room-after-the-demo/](../../specs/014-room-after-the-demo/) · Intent:
[specs/014-room-after-the-demo/intent.md](../../specs/014-room-after-the-demo/intent.md) · Written by: implementer
subagent (Claude Opus 5.5), for the main session · Date: 2026-11-10

Session: the main session started from `/home/h4reet/h4reet-ai/h4reet-ai`. This branch's worktree is
`/tmp/claude-1000/wt-feat014`, which the main session created at 2026-11-10T16:25:49Z with `git --no-replace-objects
worktree add -b feat/014-room-after-the-demo /tmp/claude-1000/wt-feat014 refs/heads/spec/014-room-after-the-demo`, then
merged `refs/heads/main` at 32fb2bc3 into it (cb861c2a). Repo hooks active: yes. In `.claude/audit/hooks.log`, the events
naming `wt-feat014` or this session's scratch folder, `/tmp/claude-1000/f14`, from then to this note's last commit are 711 ALLOW, 6 BLOCK, and 6 WARN up to 19:39:18Z (the six WARNs are the post-edit lint: once on `evals/sign_probe.py`, fixed before its commit, and five times on scratch files outside the repository, the step blocks while they were `.sh` fragments and a checker script); every BLOCK is listed under For the Author, the
refusals.

Authorized by: spec 014 and its plan, approved by the Author on 2026-11-10: "You can go ahead and start the build of
the spec." (tasks.md T000). The brief from the main session for this build is the authority for its order and checks.

## Status: built, waiting for the review (T052)

Every task from T001 to T051 is done but T045, the sign's check on a running stack (E21, below). `tasks.md` ticks
T001 to T050 but T045; T051, the rehearsal, ran after the anchor, so its tick waits for the next change that moves
`rv`, and this note is its record. The review, T052, is next, by a reviewer that wrote none of this; its findings go in Review, and its fixes (T053) move the anchor `rv` in
step 2c. Then your lookdev look (T054), the gate (T057), and your look at the live room (T058).

| Check | Result |
|---|---|
| `make lint` | exit 0 on eaf66991 (ESLint, tsc, Prettier, ruff, ruff format, shellcheck) |
| `make test` | exit 0 on 4b75bb5d: the gateway "1655 passed \| 13 skipped (1668)", the web "3264 passed \| 1 skipped (3265)", pytest "4118 passed in 374.06s"; whole again in `make check`'s test stage on eaf66991 |
| `make evals` | exit 0: product 187 passed, narration 44 passed, agent-config static 0 failed, docs links 0 failed of 1,997; the behavioral tier's WARN, information |
| `make check ENGINE_MODE=none-yet`, the final run, on eaf66991 | "11 PASS, 1 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 1 FAIL; failing: matrix FAIL": `matrix`'s E10 and E14 alone, the environment's; `content-check` "48 content files: 1 approved by main, 47 drafts"; `arrival` "0 findings in 221 files (40 commits)" |
| `gitleaks dir` on a fresh export | exit 0, "no leaks found", 2,031 files, on 5baa4469 |
| `npm run room:check` | "room: 0 findings in 0 files", 6.91 s (5.12 s at the base); 7,678 stages (7,291) |
| The entry chunk (SC-015) | 48,734 bytes gzipped (46,017 at the base), against 150 KB |
| The rehearsal (T051) | `refs/heads/main` is still 32fb2bc3, an ancestor of the tip, so there is nothing to rebase and the merge writes the tip's own tree; the note's own guard blocks give go and no where they should, under `zsh -f` and `bash --noprofile --norc` (The rehearsal) |

## Runs in your terminal

Every block runs from main's checkout, `~/h4reet-ai/h4reet-ai`. Each line is 45 characters or fewer, and each block
parses under `zsh -n` and `bash -n`. No `!` stands inside double quotes (the excludes use `:(exclude)`), and no block
holds a comment. Nothing here is paid: the gate's evals stage runs its fake adapter, and this branch touches no file
that turns on the behavioral tier (`CLAUDE.md`, `REVIEW.md`, `.claude/`, the Claude Code pin) or stage E
(`deploy/agents-engine/`, `.claude/settings.json`).

**1. The gate.** It exits 2 unless your checkout is on `main`:

```bash
cd ~/h4reet-ai/h4reet-ai
export GIT_NO_REPLACE_OBJECTS=1
git --no-replace-objects switch main
b=feat/014-room-after-the-demo
log=~/gate-feat014.log
tools/gates/gate "$b" 2>&1 | tee "$log"
```

Expect Ready. The guard below survives `main` moving: it never needs `main` to be an ancestor of the gated SHA.

**2. The guard.** Its first part has two forms; run the one that fits the gate's result, then 2c.

**2a. After a clean gate**, one that printed Ready and its `merge: ` line:

```bash
s=$(grep -a '^gate: ' "$log" | tail -n 1)
sha=$(printf '%s\n' "$s" | awk '{print $2}')
ok=go
case $s in *failing:*) ok=no;; esac
grep -aq '^merge: ' "$log" || ok=no
why=gated
```

The `case` line says no if the summary names any failure: the log holds the container's output too, and a line from
it could start with `merge: `.

**2b. Or, for a hand merge.** Use it only when the gate's sole failure is `failing: test FAIL` and its log holds
exactly one `FAIL .*test\.ts` line, the gateway's speed bound in `test/unit/twin-bench.test.ts`, "builds the grounding
and the messages and runs every guard in under 20 ms a turn". It measures wall-clock time and fails under load
(fix/000's note records 34.07 ms at a load average of 33.7). This branch changes no gateway file.

```bash
s=$(grep -a '^gate: ' "$log" | tail -n 1)
sha=$(printf '%s\n' "$s" | awk '{print $2}')
ok=go
k='; failing: test FAIL$'
printf '%s\n' "$s" | grep -q "$k" || ok=no
q='FAIL .*test\.ts'
n=$(grep -ac "$q" "$log")
[ "$n" = 1 ] || ok=no
a='twin-bench\.test\.ts > '
c='every guard in under 20 ms a turn'
l=$(grep -a "$q" "$log")
printf '%s\n' "$l" | grep -q "$a" || ok=no
printf '%s\n' "$l" | grep -qF "$c" || ok=no
why='by hand: twin-bench 20 ms bound alone'
```

- The summary must end `; failing: test FAIL`, so any other failing step says no.
- The log must hold one `FAIL .*test\.ts` line, and only one, so a second failed case anywhere says no. The gate's own
  `FAIL     test` step line doesn't match it.
- That line must name the file and the case, as vitest prints them with no colour codes (the gate's container has no
  terminal).

**2c. Then, after either form, the rest.** It prints `guard: go` only if all of these hold:

- the first part held;
- your checkout is on `main`;
- the branch is at the SHA the gate checked;
- the reviewed content, `rv`, is an ancestor of that SHA;
- `main` merged with that SHA and `main` merged with `rv` give the same tree outside `docs/merge-requests/`, each merge
  clean;
- the files `main` changed and the files the branch changed since their merge base are disjoint, but for
  `docs/adr/README.md`, which both may change on different lines (the clean merge above proves they don't overlap).

```bash
h=$(git symbolic-ref -q HEAD)
[ "$h" = refs/heads/main ] || ok=no
t=$(git rev-parse --verify "refs/heads/$b")
[ "$t" = "$sha" ] || ok=no
mr=refs/heads/main
rv=eaf66991b664406e2b213671b24d0a45e331c3be
anc=(merge-base --is-ancestor)
git "${anc[@]}" "$rv" "$sha" || ok=no
mt=(merge-tree --write-tree "$mr")
e1=$(git "${mt[@]}" "$sha") || ok=no
e2=$(git "${mt[@]}" "$rv") || ok=no
x=(diff --quiet "$e1" "$e2" -- .)
x+=(':(exclude)docs/merge-requests')
git "${x[@]}" || ok=no
mb=$(git merge-base "$mr" "$sha")
w=$(mktemp -d)
git diff --name-only "$mb" "$mr" >"$w/m"
git diff --name-only "$mb" "$sha" >"$w/b"
sort -o "$w/m" "$w/m"
sort -o "$w/b" "$w/b"
comm -12 "$w/m" "$w/b" >"$w/o"
a=docs/adr/README.md
grep -vxF -- "$a" "$w/o" | grep -q . && ok=no
echo "guard: $ok"
```

**Why `rv`, and why two merge-trees.** `rv` is the content the review will have read and its fixes settled; until the
review, it is this build's last content commit, eaf66991 (the type fix make check's lint stage asked for), and the session moves it with T053. After `rv`, the branch
changes only this note. Comparing `main`'s merge with the gated SHA against `main`'s merge with `rv` holds the content
to the reviewed one whether or not `main` has moved, and `git merge-tree --write-tree` writes no worktree. On `guard:
no`, don't merge: tell the session.

**3. The merge, only after `guard: go`**, the gate's merge line rebuilt from its log, "by hand" with its reason after
2b:

```bash
m="Merge $b (${sha:0:12})"
[ "$why" = gated ] || m="$m by hand"
o=(--no-replace-objects merge --no-ff)
o+=(-m "$m" -m "$s")
[ "$why" = gated ] || o+=(-m "$why")
o+=("$sha")
[ "$ok" = go ] && git "${o[@]}"
```

**4. The room on main**, after the merge:

```bash
git symbolic-ref HEAD
make up ENV=prod
```

**5. Your look** (T054, then T058). On dev, from main's checkout after the merge, the drafts build:

```bash
git symbolic-ref HEAD
make up ENV=dev
```

Then open `http://127.0.0.1:18105/lookdev/` (dev's site port in its env template; yours if you changed it), and look
at:

- **Hands** (the Scene control's third choice; SC-006): the man and the woman, each hand, at rest, in "idle-holding",
  and mid-walk, the sheet between the thumb and the fingers and clear of the forearm's wire capsule. A yes or a no for
  each of the twelve. The left grips in `scene.yaml` are estimates (E15); a no is a data edit there, `at` and `turn`.
- **The sign's glow** (Vignette; SC-007): along the tube that frames the arrow and the letters, with no circle. Its
  `spread` in `neon-sign.yaml` is one number.
- **The reference desktop's window** (View): the room under the panels, its ease 10/16 (E1, below). Whether to trim
  the frame further is yours (plan R-1).
- **The HUD's look** on the glass: the tiles, the warm edge (`#ffc8a8`, a lighter tint of the tube's colour, E11), the
  chips, Patrick Hand's headings.

Then on prod, in your browser (T058): resize from small to large; the room under the panels; every control; "Walk
around" and a turn of the view; the resume's sheet in the hand; the sign and the board; the notes with the man chosen
and with the dog; and the lookdev page's 2-minute window runs. Record each yes or no in a follow-up note.

**6. The board's line** (T056). After the merge, check the block's digest yourself, then apply the patch:

```bash
git symbolic-ref HEAD
c=apps/web/content/room
sha256sum "$c/chalk-denverlocal.yaml"
d=docs/merge-requests
p=$d/2026-11-10-room-text-chalkboard.patch
git apply --check "$p" && git apply "$p"
```

The digest must read `b68917b0e1698631bd643a4cce65e3edbb604814b81b31d0efcf861f4017686a`, the patch's. Edit the entry's two placeholders in
`assets/policy/content-approvals.json`, `<the day you apply it>` and `<your words>`, then:

```bash
f=assets/policy/content-approvals.json
grep -A2 '"C-0003"' "$f"
git add "$f"
git commit -m 'policy: C-0003, the board'
make up ENV=prod
```

The second `make up ENV=prod` publishes the line. If you apply it before the gate instead, the guard still holds: the
file is one this branch doesn't change, and the gate's content check then publishes the line (T057).

**7. Park off `main` again** when you step away:

```bash
p=wip-park/11-9-2026
git --no-replace-objects switch -C "$p"
```

## What changed and why

The Author's words of 2026-11-10, as the intent records them:

> "The room does get resized, but see how the actual room is smaller in the browser window size with grey area next to the brick. We can move the interface to lay over that grey area. We could make the game buttons and interface look newer, perhaps this skill could help: https://github.com/openai/plugins/tree/HEAD/plugins/game-studio/skills/game-ui-frontend . The langfuse meter did not display the cost of the current conversation when we definitely had the local model down and were using anthropic. The resume paper goes into the arm area and doesnt neatly stay in the hand. When we click walk around, the camera shifts to an angled perspective, is that necessary or can we just have walk around from the initial angle the room starts in. denverlocal.ai is not written on the chalkboard."

His three answers: "Overlay only"; "Start from the room's view (Recommended)"; "One spec for all". His addition at
acceptance: "One small change, i think the glow around the neon sign is a big circle, and the glowing part should be
the actual neon letters and neon part that frames the arrow in the sign." His acceptance: "I accept the intent with
your recommendations. go for it!"

- **The frame under the HUD** (User Story 1, FR-001 to FR-016, FR-060, FR-061): `compose/frame.ts`'s `frameArea` eases
  from the window toward spec 005's clear area in sixteenths, taking the first step at which every pressable
  selectable's 44 × 44 core and both figures lie 0.5rem clear of the compact HUD boxes (`compose/protect.ts`). The
  room, its 2D drawing, the compositor's supported stages, and lookdev's window views all use it. Never smaller than
  spec 005's frame.
- **The compact HUD and the game look** (User Story 2, FR-017 to FR-029): `compactBoxes` beside spec 005's bands; the
  strip as wide as its words, the bar's tiles at the foot's right, the column as tall as its content with the log at
  rest; at most 25% of a landscape window from 1280 × 720. Every panel control a tile on the glass, the neon's warm
  edge for hover and selection, the notes as chips, Patrick Hand and IBM Plex Mono; the resume stays spec 005's white
  document. The guidance he pointed to is cited by its URL only (FR-029).
- **Walking from the room's view** (User Story 3, FR-030 to FR-037): `walk/hold.ts` and `scene/walking.ts`; the
  camera holds until a turn, a tilt, a zoom, or the figure nearing a HUD box or the window's edge, then hands over to
  spec 008's follow camera from an orbit at the room's view.
- **The sheet in the hand** (User Story 4, FR-038 to FR-043): `scene/grip.ts`; grips are data (`figures.grips`, RD7),
  the default computed from the hand's bones; `PAPER_LIFT` is gone; lookdev's Hands scene shows them. Nothing under
  `assets/` changed.
- **The neon's path glow** (User Story 5, FR-044 to FR-049): a glow may be a path with a spread (RD6, RG10), drawn as
  one additive ribbon; the sign's `tube-glow` traces the arrow's tube.
- **The board** (User Story 6, FR-050 to FR-052): the block was already there and waits only for your approval, the
  patch beside this note.
- **The placeholder note** (User Story 7, FR-053 to FR-055, FR-066): it names what is missing, the pieces, your figure,
  or both; `standin.avatar` joins the closed list.
- **The sign's check** (User Story 8, FR-056 to FR-059): `make sign-check ENV=dev` or `ENV=dev-cpu`
  (`evals/sign_check.py`, `evals/sign_probe.py`, `build/room/sign-reading.ts`), refusing prod by name.
- **Faults** (User Story 9, FR-001, FR-002, FR-004, FR-065): every degraded state ends framed, nothing new sent.

## Acceptance criteria

| FRs | Status | Evidence |
|---|---|---|
| FR-001, FR-002, FR-065 | done | T021: the frame under every fault, the network log unchanged |
| FR-003, FR-004 | done | T010, T015, T016; the fallback to the clear area on a throw or a non-finite step |
| FR-005, FR-006 | done | T031 (a grip that isn't finite keeps the anchor), T035 (a path that can't be built draws nothing) |
| FR-007, FR-008 | done | T024, T027 |
| FR-009 to FR-016 | done | T007, T008, T015 |
| FR-017 to FR-021 | done | T005, T006, T023, T024, T028 |
| FR-022 to FR-028 | done in code and tests; the look is yours (T054, T058) | T024, T025 |
| FR-029 | for the review's search (T052) | the guidance is cited by its URL only |
| FR-030 to FR-037 | done | T029 |
| FR-038 to FR-041 | done; the left grips are estimates for your look (E15) | T031 |
| FR-042 | done; the look is yours (T054) | T033 |
| FR-043 | done | no file under `assets/` changed |
| FR-044 to FR-049 | done; the look is yours (T054) | T035, T037 |
| FR-050 to FR-052 | done but your approval (T056) | T038; the patch |
| FR-053 to FR-055, FR-066 | done | T040 |
| FR-056 to FR-059 | the check built, its refusals and steps tested; its stack run left (E21) | T042, T043 |
| FR-060, FR-061 | done | T009, T013 |
| FR-062 | done | T046 |
| FR-063 | done in the views; the runs are yours (T058) | T019, T020 |
| FR-064 | done | T015, T029 |
| FR-067 | done | T047: no lock, header, compose, or package change |
| FR-068 | proposed | ADR 0046 |

## Departures from the plan

Each is in [plan.md](../../specs/014-room-after-the-demo/plan.md)'s "Departures (implementation)" table, E1 to E23,
recorded in the commit that made it:

- **E1** the reference desktop eases to 10/16, the room 2.7% larger, not the plan's 0 to 1/16 and about 7%: what binds
  is the walking control's box over the twin's framed box at the clear area's corner. R-1's ladder isn't taken.
- **E2** RG5's aspect series takes one more step down (`STEPS_DOWN` 3).
- **E3** `Protect.boxes(area, clear)` gives null where a selectable pressable at spec 005's frame would be left to the
  list (T009 found the board list-only at three portrait frame areas).
- **E4** RG6 counts and lists stages by size. **E5** the sweep is cached by the protector's key.
- **E6** the compositor's reference stages are their screens' frame areas (the counters read 23.1 px, 21.9 before).
- **E7** the index's 2D drawing gains `flat.figures`. **E8** the frame log's field is `frame_area`.
- **E9** the 3D stage gives the room its protector (`Stage3D.protect`). **E10** lookdev's `ease` and `frame_css` are
  in `results.ts` and `page.ts`.
- **E11** the accent is `#ffc8a8`: the tube's `#ffb08a` gives 2.75:1 against the glass over white, under the 3:1 an
  edge needs; `#ffc8a8` gives 3.27:1.
- **E12** one rule set names `.hud-panels button` and `.room-offer button`. **E13** the list's target carries
  `aria-current`.
- **E14** the walking hold's edge is measured by the 3D stage and told through `walkHeld`.
- **E15** the grips give the man's and the woman's left hands only, estimates. **E16** the grip cases sit in the
  avatars' existing tests.
- **E17** the ribbon bevels its joints. **E18** the good fixture keeps its disc glow.
- **E19** the note joins both causes with a stop, each note held to 26rem, its band reserved.
- **E20** the sign's probe runs from standard input; no image or compose change.
- **E21** T045, the stack run, not run here: dev-cpu serves the main working tree, the guard refuses a linked worktree,
  and the main tree is your parked checkout.
- **E22** the hands view is a third lookdev scene, its drawing tested on `drawHands` with a skeleton fixture.
- **E23** T046 passed at once; the source scan found two room piece IDs in this branch's own tests, renamed.

## Constitution check

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-local by default | No | No byte newly leaves the visitor's device (FR-065; T021's network log); no disclosure change |
| II. Production-grade or not shipped | Yes | Tests first, RED then GREEN per task (Verification); the sign's chain has its end-to-end check; `make lint`, `make test`, `make evals`, `make check` pasted below |
| III. Intent before spec, spec before code, humans merge | Yes | Built from the approved spec and plan; every departure in plan.md in its commit; you merge |
| IV. Least privilege | Yes | Nothing under `.claude/`, `tools/gates/`, `evals/agent-config/`, `assets/`, `corpus/`, `config/`, `deploy/`, `infra/`, `.github/`, or `.specify/`, nor `CLAUDE.md` or `REVIEW.md`; the approval is a patch for your hand, built from plain copies |
| V. Cost is a first-class signal | Yes | $0 in the cloud and in models; the sign's check refuses prod and a gateway without synthetic spend |
| VI. Build in public | Yes | The runs, the departures, and the refusals are in this note |
| VII. Own the whole product | Yes | Your words quoted, not paraphrased; the look is yours to judge |
| VIII. Honest AI | Yes | The placeholder note says only what is missing at run time; `standin.avatar` states nothing about you |
| Security and agent governance | Yes | The review is by an agent that wrote none of this (T052, pending); this session reviews none of its own work |

## Review

Pending: T052, by a reviewer that wrote none of T001 to T051. Its findings and what was done about each go here.

## Verification

All in `/tmp/claude-1000/wt-feat014`, Node 24.21.0 (the toolchain's pin), `node_modules` from `npm ci --ignore-scripts
--cache "$TMPDIR/npm-cache-feat014"`, `UV_CACHE_DIR` under `$TMPDIR`.

### RED, then GREEN

Each phase's tests ran before its code (RED), then with it (GREEN), as the commits named by task record:

- Phase 2 RED (T005-T010), vitest on hud, hud-model, frame, protect, stages, stages-floor, stages-checks, flat-frame: hud.test.ts and hud-model.test.ts: the 10 new cases fail ("compactBoxes is not a function", "logRestRem is not a function", "expected undefined to be 'right'", "expected undefined to be 'foot'"); frame, protect, stages, stages-floor, stages-checks, and flat-frame fail to load: "Cannot find module '../../src/room/compose/frame'" or ".../protect".
- Phase 2 GREEN: T005 and T006 29 of 29 after T011; T007 and T008 13 of 13 after T012 (the snapshot written).
- US1 RED (T015, T016, T019), vitest -t "spec 014" on scene-fit, resize, ui/flat-frame, lookdev/page: 9 failed, 1 passed: "expected 1.3136992414100848 to be close to 1.4256995381689759" (the camera at the clear area's aspect, not the frame area's), "snowboard at 1920 × 1200: expected [] to deeply equal [ 'snowboard' ]", "expected undefined to deeply equal { w: 1920, h: 1200 }" (no frame()), "expected { w: 2560, h: 1440, …(8) } to match object { frame: '0,0,2560,1440', ease: +0 }", "expected 'var(--clear-x)' to be 'var(--frame-x)'", "1920 × 1200: expected '' to be '0px'", "Reference desktop's window: expected undefined to be 0.625". The one that passes at once is T015's "a frame area that isn't finite" case, since without frame() the stage frames into clear(), the same box.
- US1 GREEN: after T017, T018, T020: scene-fit, resize, ui/flat-frame, lookdev page and results, degraded, hud, hud-notes, hud-pointer, ui/walking, room/walking, stage-walk, scene, loading, loading-page: 15 files, 295 of 295.
- US9 (T021): hud-faults.test.ts passes at once after T017, 17 of 17; T022 has nothing to fix.
- US2 RED (T023 to T025), vitest -t "spec 014" on stages, ui/hud-look, hud-contrast: 11 failed, 7 passed. The ones that pass at once prove rules that stay: the resume's panel keeps spec 005's white document, the stacked layout keeps the page's buttons, the larger view opens only on its control's press. Spec 005's pin of the column's top (var(--strip-h)) becomes auto in the same commit, a changed expectation (FR-017, W4).
- US2 GREEN (T026, T027): stages, ui/hud-look, hud-contrast: 38 of 38 (the transition case scoped to room.css and talk.css, the HUD's stylesheets, and taking the reduce block's transition: none; spec 012's loader card keeps its own fade).
- US3 RED (T029), with T030's code set aside: walk-hold.test.ts fails to load ("Cannot find module '../../src/room/walk/hold'"); walking.test.ts's 7 new cases fail: "expected 60 to be +0" (the camera changed on every frame of the clear walk), "expected 0.15597774177010088 to be less than 0.001" (the first frame of a turn's hand-over not the room's view), "expected [] to deeply equal [ [ 'hold', null ], …(1) ]".
- US3 GREEN (T030): walking, walk-hold, stage-walk, ui/walking, scene-fit, resize, scene, avatar-driver: 8 files, 138 of 138.
- US4 RED (T031): grip.test.ts and avatars.test.ts fail to load ("Cannot find module '../../src/room/scene/grip'"); schema.test.ts's grip cases fail: the good grip read "RD2 figures.grips" (no such key), each refusal "expected [ 'RD2 figures.grips' ] to include 'RD7 figures.grips.robot'" and the like.
- US4 GREEN (T032): grip, schema, avatars, avatar-handoff, avatar-driver, bundle: 6 files, 331 of 331; room:check 0 findings.
- US5 RED (T035, T037's test): glows.test.ts's 5 ribbon cases fail ("TypeError: g.at is not iterable": no path glow); schema.test.ts's 8 path-glow cases fail ("RD2 glows[0].path, RD2 glows[0].spread", "RD3 glows[0].radius"); compose.test.ts's bad/RD6-glow-path and bad/RG10-glow-path find no RD6 or RG10; data-only.test.ts's sign case fails (the tube-glow still a disc). bad/RD7-grip, T032's, passes.
- US5 GREEN (T036, T037): glows, schema, data-only, compose, geometry, report, scene, bundle, generated, lookdev page: 10 files, 785 of 785 after compose.test's rule counts (RD 7, RG 10) and glows.test's float32 tolerance; room:check 0.
- US6 (T038): approvals.test.ts's two board cases pass at once (2 passed), proving the existing rule; T039 has nothing to fix: the board needs only the Author's approval. git diff --stat refs/heads/main -- apps/web/content/room/ corpus/ assets/ is empty.
- US7 RED (T040): notes-causes.test.ts and bundle.test.ts's flag case: 4 failed (the flag set by the avatars' missing models; no standin.avatar; a failed model or the figure's flat shape changes nothing), 3 passed at once (no note with nothing missing; the bundle's stand-ins name the pieces; the 2D room shows no figure's words).
- US7 GREEN (T041): notes-causes, bundle, hud-model, hud, hud-notes, loading-notes, loading-page, stages, words, hud-look, compose: 11 files, 481 of 481 once a 2D visit's skips stopped counting toward the note.
- US8 RED (T042, T043): pytest evals/test_sign_check.py: "FileNotFoundError: [Errno 2] No such file or directory: '/tmp/claude-1000/wt-feat014/evals/sign_check.py'", 1 error during collection; vitest sign-reading.test.ts: "Cannot find module '../../build/room/sign-reading'".
- US8 GREEN (T044): pytest evals/test_sign_check.py 17 passed; vitest sign-reading.test.ts 4 of 4; pytest evals/test_repository_docs.py 17 passed. The Makefile's sign-check with ENV=prod: "make sign-check runs on dev or dev-cpu, never prod (spec 014, FR-057)", exit 2; the script with --stack prod: "prod is never a sign-check stack", exit 2. T045 not run (E21).
- Polish, T046 (passing at once): test/ui/hud-a11y.test.ts gains "axe with spec 014's HUD (T046)": 4 axe cases (column and dock, 3D and 2D; note causes, aria-current target, full screen, log collapsed and larger, walking view entered and held) and 1 rule check (no compact box clips). Run with T021's faults (hud-faults.test.ts) and T031/T035's faults (grip, glows, avatars, avatar-handoff): 6 files, 91 passed (91), first run. Nothing to fix.
- US4, T033 (RED): page.test.ts "the hands view (spec 014, T033)": 5 cases; the file fails to load, src/lookdev/hands.ts missing (Tests: no tests, 1 failed file). compose.test.ts: bad/RI10-hands fails ("expected RI10 apps/web/room/lookdev.yaml:hands.avatars[1]"), 1 failed | 244 passed.
- US4, T034 (GREEN): page.test.ts -t T033: 5 passed. With the rest of test/lookdev, compose, report, scan, schema: 12 files, 659 passed, 1 failed: scan.test.ts's FR-007 found two room piece IDs in T038's and T037's tests (committed earlier); fixed in 4ee4f3e3 (test titles and a lookup by glow ID, nothing checked changed), then scan, approvals, data-only: 3 files, 71 passed.
- Polish, make test (first run at b2c9312d): web 4 files failed, 5 failed | 3259 passed | 1 skipped (3265): manifest.test.ts (placeholders), text-copy.test.ts (the hidden note's words), avatars-compose.test.ts x2 (the figures block's grips), vocabulary.test.ts (standin.avatar); the gateway 95 files, 1655 passed | 13 skipped (1668); pytest not reached. Each a changed expectation (FR-053 to FR-055, FR-039), committed as T028's; the four files then 64 passed.

### T013's frame line and T047's measures

T013's frame line, from `npm run room:report -w apps/web` at the tip:

```text
Frame (spec 014, FR-060, FR-061): the frame areas over the same screens, eased from the window toward each clear area only as far as keeps every pressable selectable's core and both figures 0.5rem clear of the HUD's compact boxes; 7,678 stages, each with the HUD boxes over it reserved.
- the dock layout: 3,972 screens and states, 1,684 at ease 0, 915 between, 1,373 at ease 1; the median 6/16.
- the column layout under 1280 × 720: 2,821 screens and states, 619 at ease 0, 1,331 between, 871 at ease 1; the median 14/16.
- the column layout from 1280 × 720: 2,437 screens and states, 976 at ease 0, 1,114 between, 347 at ease 1; the median 6/16.
- The reference desktop (1920 × 1200): ease 10/16, a frame area of 1640 × 1150.3 over spec 005's 1472 × 1120.5, the room 2.7% larger on screen.
- The reference phone (384 × 740): ease 1, a frame area of 384 × 422 over spec 005's 384 × 422, the room 0.0% larger on screen.
```

T047's measures, at the tip, beside T001's:

| Measure | T001 (the base, cb861c2a) | The tip |
|---|---|---|
| The entry chunk's gzip size (SC-015), measured as `test/room/chunk.test.ts` does on a release build | 41,064 JS + 4,953 CSS = 46,017 bytes | 43,321 JS + 5,413 CSS = 48,734 bytes (+2,717), one chunk, against the 150 KB budget |
| `npm run room:check -w apps/web` | "room: 0 findings in 0 files", 5.12 s wall clock | "room: 0 findings in 0 files", 6.91 s wall clock (7.28 s user) |
| Supported stages | 7,291 over 7,241 sweep screens | 7,678 frame-area stages over the same screens |
| `package-lock.json` | | `git diff 32fb2bc3 HEAD -- '*package-lock.json'`: 0 lines; no package added (FR-067) |
| Response headers | | `apps/web/nginx.conf`, `deploy/edge/nginx.conf`, and their tests `deploy/scripts/test_web_nginx.py` and `test_edge_site.py`: 0 changed lines |
| `make up ENV=dev-cpu`'s compose config | | `deploy/` and `config/`: 0 changed files, so the topology, the env files, and each stack's compose config are unchanged (FR-067) |
| Protected paths | | `assets/`, `corpus/`, `.claude/`, `tools/gates/`, `evals/agent-config/`, `.specify/`, `infra/`, `.github/`, `CLAUDE.md`, `REVIEW.md`: 0 changed files |


### Changed test expectations

Each changes on purpose, for the FR or departure named:

- `test/ui/hud.test.ts`: spec 005's pin of the column's top, `var(--strip-h)`, is `auto` (FR-017, W4).
- `test/room/stages.test.ts`: the aspect cover reads the frame and the clear areas (E2); a stage without a protector
  keeps `reserved` undefined.
- `test/room/geometry.test.ts`: RG5's aspects, 0.2304 first (E2); the side-wall stages by size, 45 stages 320 px wide
  becoming 54, "and 44 others" becoming "and 53 others" (E4).
- `test/room/report.test.ts`: the side-wall counts (E4) and the reference stages' caps, the counters 23.1 px and the
  panel 52.1 (E6). `test/room/legibility.test.ts`: the desktop's caps 52 and 23.1 px, its floor that catches the
  counters 22 to 24 (E6). `test/room/stages-checks.test.ts`: the reference stages (E6).
- `test/room/pick.test.ts`: the carve-out walk over the frame areas with their reserved boxes (FR-060).
- `test/room/bundle.test.ts`: `flat.figures` (E7); the part's figures carry the good fixture's grips (W15, W16); the
  placeholders flag (FR-053).
- `test/ui/degraded.test.ts`: the 2D view at `--frame-*` (W2). `test/room/scene-fit.test.ts`,
  `test/room/resize.test.ts`: the frame area and `frame_area` (E8).
- `test/lookdev/page.test.ts`, `test/lookdev/results.test.ts`: the window views framed into their frame areas, the
  results' `ease` and `frame_css` (E10).
- `test/room/walking.test.ts`, `test/room/stage-walk.test.ts`: spec 008's entry expectations take a hair of tilt to
  hand over (W13).
- `test/room/avatars.test.ts`, `avatar-handoff.test.ts`, `avatar-driver.test.ts`: the sheet at the grip, not the wrist
  plus `PAPER_LIFT` (W15, W16).
- `test/room/compose.test.ts`: the rule catalogue's counts, RD 7 and RG 10.
- `test/manifest.test.ts`: `placeholders` is the stand-ins' alone (FR-053, W11).
- `test/ui/text-copy.test.ts`: the hidden note says nothing with nothing missing (FR-053 to FR-055).
- `test/room/avatars-compose.test.ts`: "is optional" takes the figures block out, the good fixture now giving one for
  its grips; the committed scene's figures hold its grips (FR-039, E15).
- `test/room/vocabulary.test.ts`: the closed list holds `standin.avatar`, 62 keys (FR-054, FR-066).
- `test/approvals.test.ts`, `test/room/data-only.test.ts`, and T004's fixtures: names kept clear of the source scan
  (E23); nothing they check changed.

### make lint

On eaf66991, the final run; exit 0, the whole output. The first run, on b2c9312d's parent, found one file Prettier would wrap (`bad/RD7-grip`'s edit, b2c9312d); the first `make check` found one `tsc` error in T028's avatars-compose case (eaf66991).

```text
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
491 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/scripts/aws-login.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh redteam/forbidden-actions.sh tools/gates/install-tools.sh tools/gates/secrets.sh
make lint  46.89s user 2.93s system 165% cpu 30.108 total
exit 0
```

### make test

On 4b75bb5d, after the knock-on expectations (the first run, on b2c9312d, failed five web cases in four files, each an expectation spec 014 changes, listed above and committed as T028's). The result lines, in order: the gateway's suite, the web suite, pytest:

```text
corpus-check: OK — 44 slots, 26 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems
> vitest run
 RUN  v5.0.3 /tmp/claude-1000/wt-feat014/services/gateway
 Test Files  95 passed (95)
      Tests  1655 passed | 13 skipped (1668)
> vitest run
 RUN  v5.0.3 /tmp/claude-1000/wt-feat014/apps/web
 Test Files  150 passed (150)
      Tests  3264 passed | 1 skipped (3265)
4118 passed in 374.06s (0:06:14)
make test  3359.54s user 446.04s system 641% cpu 9:52.98 total
exit 0
```

### make evals

On 5f0831ab; exit 0. The result lines:

```text
evals product (fake): 187 passed, 0 failed
evals narration (fake): 44 passed, 0 failed
agent-config static: 0 failed, 0 planned
behavioral tier: 15 cases (11 enforcement, 4 conduct), 3 runs each; trigger hash 05cec03a74a5
WARN (behavioral tier): 2026-11-09T152345Z-feat-011-pa-anthropic-denies-09522968ea48, the newest run for trigger hash 05cec03a74a5, failed: conduct regressed against main's last entry 2026-11-08T151546Z-feat-007-p1-69ab1428d23d: held in 10 of 12 runs, against 11 of 12, over pastes-check-output, refuses-to-widen-allowlist, reviewer-reads-room-data, stays-on-branch
agent-config behavioral: fail, 0 planned
note: the behavioral tier's line is information in make evals, not a merge block (spec 006 FR-002): the gate's agent-config-evals step waits for a run only for a branch that changes CLAUDE.md, REVIEW.md, .claude/, or the Claude Code pin
docs links: 0 failed, 1997 relative links in 289 files
make evals  2.05s user 0.10s system 94% cpu 2.268 total
exit 0
```

The behavioral tier's WARN is information in `make evals`, not a merge block (spec 006 FR-002); this branch changes no file that makes the gate wait for a run.

### make check ENGINE_MODE=none-yet

Two runs. The first, on 0de3f515, gave "10 PASS, 1 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 2 FAIL; failing: lint FAIL,
matrix FAIL": `lint`'s one `tsc` error (fixed in eaf66991) and `matrix`. The second, the final run, on eaf66991 with
this note's save point:

```text
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
WARN     evals  WARN (behavioral tier): 2026-11-09T152345Z-feat-011-pa-anthropic-denies-09522968ea48, the newest run for trigger hash 05cec03a74a5, failed: conduct regressed against main's last entry 2026-11-08T151546Z-feat-007-p1-69ab1428d
PASS     redteam
FAIL     matrix
SKIP     image  no agents' engine yet: tasks.md T046
make check: 11 PASS, 1 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 1 FAIL; failing: matrix FAIL
make: *** [Makefile:159: check] Error 1
make check ENGINE_MODE=none-yet  3417.88s user 449.82s system 462% cpu 13:56.98 total
exit 2
```

Its stages' result lines:

```text
      Tests  1655 passed | 13 skipped (1668)
      Tests  3264 passed | 1 skipped (3265)
4118 passed in 464.51s (0:07:44)
content check: PASS (48 content files: 1 approved by main, 47 drafts, none of whose text is in dist/)
secrets: PASS (unstaged changes, staged changes, 40 commits since main)
arrival-check: 0 findings in 221 files (40 commits)
evals product (fake): 187 passed, 0 failed
evals narration (fake): 44 passed, 0 failed
agent-config static: 0 failed, 0 planned
docs links: 0 failed, 1997 relative links in 289 files
redteam: 68 passed, 0 failed
E10  FAIL  (from prove-limits.sh): E10   FAIL engine.sh reset leaves a new engine holding only the seeded images -- seen: engine.sh reset failed: engine.sh: not enough free space to seed: need 22 GiB on both the Windows drive and ext4; 19 o
E14  FAIL  (from prove-limits.sh): E14   FAIL dev-cpu publishes on the host's 127.0.0.1 (ports 18300-18305); no answer on 18300 18301 18302 18303 18304 18305; the sandbox cannot reach them (stage S)
forbidden-actions (hook layer): 853 passed, 2 failed, 57 known gaps
```

`matrix` fails on E10 and E14 alone, the environment's, as in fix/000's final run: E10 for want of 22 GiB free on
both drives to seed a reset engine, and E14 for dev-cpu's ports, which the sandbox can't reach. Its other hook-layer
rows pass, and its 57 known gaps are main's. The gateway's suite passed whole in both runs and in `make test`, its
timing tests among them; `evals`' WARN is the behavioral tier's information line.

### gitleaks on a fresh export

`git archive 5baa4469 | tar -x` into an empty folder under `$TMPDIR` (2,031 files, no `.pyc`), then `gitleaks dir .`
there:

```text
INF scanned ~53455742 bytes (53.46 MB) in 1.64s
INF no leaks found
```

Exit 0. 5baa4469 is this note's commit before its last; the last adds only these results, and the content scan
(gitleaks over each edit's text) passed every edit.

### The rehearsal

T051. `refs/heads/main`, re-read at the end: 32fb2bc3, the commit this branch merged at T001, so it is an ancestor of
the tip and there is nothing to rebase; `git merge-tree --write-tree refs/heads/main <tip>` writes the tip's own tree
(0e93a84c). The board's patch needs no rebuild: main's `content-approvals.json` hasn't moved. `make sign-check
ENV=dev-cpu` isn't rerun (E21).

The guard: this note's own blocks, extracted from it, run in a scratch clone of the repository under `$TMPDIR` over
made-up gate logs, 2a or 2b and then 2c, with the gated SHA 5baa4469 and `rv` eaf66991. A session can't point a ref or
`HEAD` named `main` anywhere, so the clone's stand-in for `main` is a branch at 32fb2bc3, its `HEAD` on it, and the
blocks ran with `refs/heads/main` spelled as that branch; nothing else changed. The same results under `zsh -f` and
under `bash --noprofile --norc`:

```text
2a, a clean gate                                               guard: go
2a, a failing summary with a merge: line in the log            guard: no
2b, the timing test alone                                      guard: go
2a on the timing test's log                                    guard: no
2b, the timing test and another case                           guard: no
2b, one other test failing                                     guard: no
2b, the timing test and matrix-h failing                       guard: no
2a, a change after rv outside the notes                        guard: no
2a, a change after rv to the note alone                        guard: go
2a, the branch not at the gated SHA                            guard: no
2a, main moved: a file the branch doesn't touch                guard: go
2a, main moved: a file the branch changed, other lines         guard: no
2a, main moved: the ADR index, another line                    guard: go
2a, main moved: scene.yaml, a file the branch changed          guard: no
2a, main back where it was                                     guard: go
```

The made-up logs copy the gate's own lines: its summary (`tools/gates/gate`'s `summary_line`), its `merge: ` line, its
step lines (`FAIL     test  exited 1`), and vitest's ` FAIL  <file> > <suite> > <case>` lines. Step 3's merge wasn't
run anywhere; its tree is the merge-tree above.

### T001: the base's facts

Read on 2026-11-10 in the worktree `/tmp/claude-1000/wt-feat014`, branch `feat/014-room-after-the-demo`, at
cb861c2af907d5609d701750dbe91aec819da49d: `spec/014-room-after-the-demo` with `refs/heads/main` at 32fb2bc3 merged
in (spec 012's hand merge, the shutdown test's fix, and gate 4's PDF). `node_modules` came from `npm ci
--ignore-scripts --cache "$TMPDIR/npm-cache-feat014"`, at Node 24.21.0, the toolchain's pin.

- **The base**: spec 012's tests, `test/room/loading-*.test.ts` and `test/ui/loading*.test.ts`, "Test Files 9
  passed (9)", "Tests 129 passed (129)". `npm run room:check`: "room: 0 findings in 0 files", 5.12 s wall clock
  (5.80 s user). Supported stages: 7,291, over 7,241 sweep screens. The entry chunk's gzip size, measured as
  `test/room/chunk.test.ts` does on a release build: 41,064 bytes of JavaScript (one chunk) and 4,953 of CSS, 46,017
  in all, against the 150 KB budget.
- **The twin's turn on dev-cpu** (R-4), read from the code: `services/gateway/src/core/gateway.ts`'s `complete` asks
  the local adapter first only while it is healthy; with it unhealthy, the reason is `local_unhealthy`, and the call
  goes to the route's fallback through `callMetered`. dev's route is `{ primary: local, fallback: synthetic }`
  (`config/routing.yaml`), and dev-cpu's env file sets `GATEWAY_TEST_SYNTHETIC_SPEND=1`, so the fallback is
  registered. The meter's admission (`meter/admission.ts`) has no rule by purpose, so a `twin` call is admitted as
  any fallback call. `routes/room-turn.ts` maps any route but `local` to `"fallback"`, and sends `cost_micro_usd` as
  the meter's settlement: the synthetic adapter's 1,000 output tokens at dev's $100 per million, 100,000. A guard's
  withheld answer keeps the 200, the route, and the cost. So by reading, yes: the plan's R-4 holds, and nothing moves
  to T059. Two conditions the turn needs that the stack, not this branch, holds: the feature's topic ready in
  `config/twin-readiness.yaml` at the running hashes (`snowboard`'s topic, `hobbies-and-travel`, reads `ready:
  true`), and dev's limits, which a dev stack defaults (`app.ts`, "the twin uses FR-027's defaults").
- **The edge** (R-5): x005 listens on 8087 inside the internal network (`deploy/edge/nginx.conf`), published on
  dev-cpu's `H4_SITE_PORT`, 18305. `POST /api/room/turn` is limited by `limit_req_zone $server_port
  zone=room_turn:1m rate=1r/s`, with `burst=5 nodelay`: two turns seconds apart pass.
- **The page's request**: `src/talk/turn-client.ts` sends `{"feature", "path", "turns"}`, JSON, with
  `content-type: application/json`; the engineer path's value is `"engineer"` (`src/choice/visit.ts`).
- **The rule IDs**: RD's next free is RD6 and RG's is RG10 (RD1 to RD5 and RG1 to RG9 are spec 004's). RD6 is the
  glow's shape (exactly one of `radius` and `path`; a path of at least two points with a `spread` in (0, 0.05]); RD7
  the grips (an avatar outside the table, a hand but `right` and `left`, an `at` past ±0.15, a turn past ±180); RG10
  a path point outside its piece's bounds, beside RG2. The next free ADR is 0046 (0045 is spec 012's, merged). The
  next free content-approval id on `refs/heads/main` is C-0003 (C-0001 and C-0002 are there).
- **The hand bones**, read from the GLBs' JSON chunks without opening any file under `assets/` for writing (the build
  copies them unchanged): in the man's and the woman's models and their three animation files each,
  `mixamorig:RightHand` and `mixamorig:LeftHand` each hold `…HandIndex1` to `3`, `…HandMiddle1` to `3`,
  `…HandPinky1` to `3`, `…HandRing1` to `3`, and `…HandThumb1` to `3`; each hand's parent is its `…ForeArm`. The
  hand bone stands 0.304 (the man) and 0.290 (the woman) from the right forearm's origin, in the models' units.

None of these differs from plan PD-2, PD-13, PD-16, PD-20, or §10, so no departure is recorded at T001.

## The board's patch

[2026-11-10-room-text-chalkboard.patch](2026-11-10-room-text-chalkboard.patch): `diff -u` of two plain copies of
`git show refs/heads/main:assets/policy/content-approvals.json` (main at 32fb2bc3), the second edited by hand. It adds
one entry after C-0002:

```json
{"id": "C-0003", "path_when_approved": "apps/web/content/room/chalk-denverlocal.yaml", "kind": "room-text",
 "sha256": "b68917b0e1698631bd643a4cce65e3edbb604814b81b31d0efcf861f4017686a",
 "date": "<the day you apply it>", "reason": "<your words>"}
```

The digest is `sha256sum apps/web/content/room/chalk-denverlocal.yaml` at this branch's tip; the branch doesn't change
the block, so it is `main`'s too. Checked with `patch --dry-run -p1` on a third plain copy in the job's scratch folder,
outside every worktree: it applies cleanly, one entry added. `gitleaks dir` over it, and the content scan's rules
(gitleaks with the main tree's `.gitleaks.toml` and `--ignore-gitleaks-allow`), find nothing, so R-10's way out isn't
needed and the patch is in the repository. If `main`'s `content-approvals.json` moves before you apply it, tell the
session, which rebuilds it.

## Cost and data-flow impact

Cloud cost: $0. Model cost: $0. No byte newly leaves the visitor's device: the fonts are the site's own, already
served; no event, span, or panel is added (plan D9), so no data-flow disclosure entry. The sign's check runs on the dev
stacks only, with the synthetic adapter's spend, never a paid call.

## For the Author

### What to look at

Step 5's list: the Hands scene's twelve cases, the sign's glow, the reference desktop's frame, and the HUD's look.
Your decisions: the grips' estimates (a data edit), the glow's spread (a data edit), the accent's tint (one palette
value in `room.css`), and whether to trim the desktop's frame further (plan R-1's ladder, E1). Then T060: accept ADR
0046 or leave it proposed, and a yes or a no to Q1 to Q5 and D1 to D12.

### The sign's check on a stack (T045, T059)

Not run here (E21). On your dev stack, from main's checkout after the merge, `make sign-check ENV=dev` prints the
table; the whole output goes in a follow-up note (T059, optional, since R-4 held by reading). For a session to run
T045 on dev-cpu, its stack must serve a checkout of this branch's code, which today is your main tree.

### For your CLAUDE.md

A line you may add under Commands, which only you can: "- Sign check: `make sign-check ENV=dev-cpu` (dev or dev-cpu,
never prod): one turn with the local model stopped reaches the sign as a paid reading, with no paid call."

### The refusals

The bash gate refused six commands this session, each for its command's text; none was respelled or retried in
another form:

1. 2026-11-10T16:32:25Z, a `grep` over `evals/breach.py` for the helpers `evals/sign_check.py` loads from it: "Blocked
   by .claude/hooks/bash-gate.sh — the breach test outside dev-cpu". The file was read with the Read tool, which runs
   nothing.
2. 18:22:19Z, a Python heredoc adding the Makefile's `sign-check` target, whose text held the Makefile's lines around
   it, an Author-only target among them: "an Author-only make target". The target was added with the Edit tool.
3. 18:23:12Z, a Python heredoc adding plan.md's E21 row, whose text named the kill-switch rehearsal beside dev: "the
   breach test outside dev-cpu". The row was added with the Edit tool.
4. 18:52:18Z, a heredoc writing this note's step blocks to scratch files, whose text held step 1's switch to `main`:
   "Blocked by .claude/hooks/bash-gate.sh — switching to main. Route: work on a feature branch (git switch -c
   <branch>); only the Author changes main". The blocks were written with the Write tool, as text, and checked with
   `zsh -n` and `bash -n`; nothing in this session switched any checkout.
5. 19:04:38Z, a Python heredoc writing this list into the note, whose text quoted refusals 1 and 3: "the breach test
   outside dev-cpu". The list was written with the Edit tool.
6. 19:37:20Z, a Python heredoc writing `make check`'s results into this note, whose text quoted the matrix's E10
   line: "Blocked by .claude/hooks/bash-gate.sh — running the agents' engine's Author commands". Nothing ran the
   engine's script; the results were written with the Edit tool.

The Write and Edit tools are the route this project's sessions take after such a refusal, since the gate reads a
command's text, not its effect; each refusal is yours to judge. The post-edit lint also flagged
`evals/sign_probe.py` once (18:17:59Z, WARN), fixed before its commit.

### Backlog

- The hands view's avatars take the look they load in; a look changed after they load keeps their first materials
  until the page reloads. A lookdev-only nuisance.
- `scene.yaml`'s right grips: none given, the default used, since the studio's two hold with the left (E15).
