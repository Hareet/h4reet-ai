# Probe: the dinosaur after his intake (spec 028, item 2)

**Task**: probe-dino-028 (implementer, notes only, night of 2026-11-15) · **Branch**: `night/probe-dino-028/probe-dino-028`
· **Code, tests, assets changed**: none. This file is the only one the branch adds.

```
$ git log -1 --format='%H %s' refs/heads/main
a556a93320f391a3217a230d7df1cec1ccc11451 Merge intake/dino-resume (4f6eb88397cf)
```

## His words

His review of 2026-11-15, item 2, word for word:

> 2) The dinosaur doesn't load the model, or do any of the eating of assets.

His answer to the page's Q3 (his orders' rule 14), word for word: "q3) keep it as waiting for model intake p9".

His merge, word for word (`git log -1 --format=%B a556a933`):

> Merge intake/dino-resume (4f6eb88397cf)
>
> gate: 4f6eb88397cf35a1c1743b7c172d92ac900569fe (intake/dino-resume) by tools/gates/gate at b4b474f14630: 19 PASS, 3 SKIP, 2 WARN, 0 PLANNED, 0 PENDING, 3 FAIL; failing: test FAIL, studio-settings FAIL, image FAIL

The merge before it, word for word (`git log -1 --format=%B a36f98ec`):

> Merge feat/018-hud-to-dino-stack-p (ad07ef9253a2) by hand
>
> exceptions: studio-settings, image (tunnel)

The gated commit's tree is main's: `4f6eb883^{tree}` and `a556a933^{tree}` are both `d9a42c9a…`. Every run below is on
that tree.

## Answers, short

1. **Yes, the room now loads the dinosaur's model.** The bundle reads `assets/visitors/dinosaur/**` straight from the
   tree when the site builds. No generate, pack, or bundle step needs to run with its output committed. Every step I
   ran left every committed file unchanged; only `dist/` changed, and git ignores it.
2. **The "Eat" path is open with the model, and every eat and dinosaur test file passes except one test.** That test,
   `eat-model.test.ts:215`, asserts that the repository has *no* dinosaur model, which his intake made false. No browser
   test exists for the eating, so nothing here proves the real GLB loads in a browser.
3. **"test FAIL" is new and caused by the intake.** Two tests rely on the room having no dinosaur model:
   `eat-model.test.ts:215` and `data-only.test.ts:548`. Nothing in the room's code is wrong. **"studio-settings FAIL"
   and "image FAIL" are not new.** The merge before also took both as exceptions ("exceptions: studio-settings, image
   (tunnel)"). Each depends on his machine, not on the commit: the first checks his host's Claude Code settings, the
   second needs the agents' engine. I can't reproduce either one here (below).
4. **On main, FR-032 holds for the eating** ("his intake of the model fixes it with no code change"). **Q11's condition
   now holds too** (the model is bundled), but the scene isn't on main: it is in the 028 line. On main, a dinosaur
   visit with the model plays spec 025's run. The 028 line has one new test with the same stale premise
   (`dino-cutout-visit.test.ts:48` on `night/int-028/int-028`).

## 1. Does the room load the dinosaur's model?

All paths are under `apps/web/` unless named otherwise. Line numbers are on `a556a933`.

The trace:

1. `src/room/scene.ts:40` imports the 3D part from `virtual:room-scene`. `build/room/plugin.ts:41` (`ROOM_SCENE`) makes
   that module from `compose()` over the file-system tree at `buildStart`. Its header (`plugin.ts:20–22`) says, in its
   words: "The plugin writes nothing else, anywhere: the committed generated files are `room:generate`'s alone".
2. `build/room/avatars.ts` `readAvatars` walks `assets/visitors/<id>` (`VISITORS_DIR`, `avatars.ts:42`) for each avatar.
   It applies RA1 to RA4 and RA9 to RA12 under main's caps. `bundledFiles` (`avatars.ts:471`) gives the model and its
   clips where the model passes. `emit.ts:1548` `avatarsPart` writes `avatars.<id>`, and skips an avatar without a
   bundled model (`emit.ts:1553`). `plugin.ts:132` `generateBundle` emits each bundled avatar file under `dist/a/`.
3. `scene.ts:304`: `bundled(id)` is `Object.hasOwn(part.avatars, id)`. `scene.ts:306`: `wantsAvatars` holds for the
   chosen avatar's model. `scene.ts:472`:
   `const eats = options.avatar === EATER && bundled(EATER) && part.placements.some((p) => p.edible !== null);`
   `EATER` is `"dinosaur"` (`src/room/eat/available.ts:27`).
4. `src/room/scene/loader.ts:265` `figureEntries` lists the chosen avatar's files where `part.avatars[chosen]` exists
   (`loader.ts:278`, `:289–291`). `scene/avatars.ts`'s controllers then show the model in the visitor's figure.
5. `figureModel` (`scene.ts:506`) is `figures?.shows("visitor") ?? false`, which is `scene/avatars.ts:1038`'s
   `figures[figure].shown`. It turns true once the loaded model shows, and stays false while the cut-out fallback
   shows.
6. How the images get the files. `make up` builds the web image with `deploy/scripts/web_image.py`. It hands over
   `<tree>/assets/visitors` as the named context `visitor-assets` (`web_image.py:95–96`, `:324–329`), and the
   Dockerfile copies it to `/src/assets/visitors/` (`apps/web/Dockerfile:24–27`, the `COPY --from=visitor-assets`
   line). It reads main's policy. The gate's image step names no `visitor-assets` context
   (`tools/gates/gate:1564–1670`), so its web image builds both figures as their fallbacks, with or without the
   dinosaur.

**Proved by running.** I exported main to a new empty directory (`mktemp -d`), as the brief says, without `films/`. I
installed with `npm ci --ignore-scripts`, hashed every file outside `node_modules/` (3,191 files), and ran each step
from the export's root. After each step I hashed again. The script lives in a separate `mktemp -d`.

```
$ df -h /tmp
Filesystem      Size  Used Avail Use% Mounted on
tmpfs           2.0G     0  2.0G   0% /tmp
$ cat /sys/fs/cgroup/cpu.max
400000 100000
$ git archive refs/heads/main -- . ':(exclude)films' | tar -x -C /tmp/tmp.UGDi7rADVg
$ (cd /tmp/tmp.UGDi7rADVg && npm ci --ignore-scripts)        # exit 0, 40.6 s

=== npm run --ignore-scripts room:generate -w apps/web
room: 0 written, 0 removed, 26 unchanged
=== exit 0
=== npm run --ignore-scripts twin:pack -w apps/web
twin:pack: wrote config/twin/corpus.json: 131 sections, 3 topics; 186 cases
corpus:size: T1 band: the topic hobbies-and-travel is within 266 characters of T1 (20,916 of the room's 21,182; ADR 0054)
corpus:size: T1 band: the topic mission is within 137 characters of T1 (21,045 of the room's 21,182; ADR 0054)
corpus:size: wrote docs/corpus-size.json: stage 0; mission 21,045 of 21,182
=== exit 0
=== npm run --ignore-scripts content:lock -w apps/web
content: C1–C9 and N1–N5 passed for the resume and 44 scripts (denylist missing); wrote apps/web/content/resume.lock.json and 44 eval cases in evals/narration/cases
=== exit 0
=== npm run --ignore-scripts content:check -w apps/web
content: C1–C9 and N1–N5 passed for the resume and 44 scripts (denylist missing); the lock and the eval cases are current
=== exit 0
=== npm run --ignore-scripts room:check -w apps/web
room: 0 findings in 0 files
=== exit 0
=== npm run --ignore-scripts room:report -w apps/web
| `assets/visitors/dinosaur/dinosaur.glb` | model | 2,248,336 | 1,236,931 | 27,997 | 5,592,405 | 5,592,405 | yes |
| `assets/visitors/dinosaur/dinosaur-idle.glb` | idle | 47,908 | 22,309 | 0 | 0 | 0 | yes |
| `assets/visitors/dinosaur/dinosaur-take.glb` | take | 35,904 | 10,963 | 0 | 0 | 0 | yes |
| `assets/visitors/dinosaur/dinosaur-walk.glb` | walk | 37,716 | 14,707 | 0 | 0 | 0 | yes |
Scale its reader's bounds imply for `dinosaur`: 1.000× for the visitor's 1.2 m.
A 3D dinosaur visit (spec 024, Q150): the "Eat" tile's box, 8rem × 2.75rem beside the walking control, reserved for the whole visit; 7,671 stages over the same screens, checked by RG6 and RG7 and not emitted; …
Findings: none.
=== exit 0
=== npm run --ignore-scripts build -w apps/web      # the gate's WEB_BUILD; the room's model bundle is this build
dist/a/dinosaur.1aa8075bf5cc9ebf.glb.gz, dist/a/dinosaur-idle.dc2f84a64f03ee2e.glb.gz,
dist/a/dinosaur-take.3bca518b1706f58e.glb.gz, dist/a/dinosaur-walk.d895b608773e0ad3.glb.gz (among 43 under dist/a/)
✓ built in 25.98s
=== exit 0
```

What changed, hash list against hash list:

| After | Files changed, added, or removed |
|---|---|
| `room:generate` | none |
| `twin:pack` | none (it rewrote `config/twin/corpus.json` and `docs/corpus-size.json` byte for byte) |
| `content:lock` | none (the same for `resume.lock.json` and the 44 eval cases) |
| `content:check` | none |
| `room:check` | none |
| `room:report` | none |
| `build` | 66 added, 0 changed, 0 removed: every one under `apps/web/dist/` (43 under `dist/a/`), which `.gitignore:20` (`dist/`) ignores |

The built 3D chunk carries the dinosaur. `dist/assets/scene-D2M9EKF5.js` holds
``avatars:{dinosaur:{model:{url:`a/dinosaur.1aa8075bf5cc9ebf.glb`,sha256:`1aa8075b…cf62fae8`,bytes:1236931,…},clips:{idle:…``,
so `bundled(EATER)` is true for this build.

The model has what the eating reads. Its glTF node names include the rig's bones and `Jaw`
(`src/room/eat/mouth.ts:14` `findJaw`), so the bite flies to the real mouth, not the estimate: 27 nodes, 1 skin, among
them `Head`, `Hips`, `Jaw`, `Neck`, `Spine`, `Tail1`–`Tail5`. I read these with a standard-library script, `python3 -I`,
from a separate `mktemp -d`.

**Caveat.** This build ran outside a container and without the `prebuild` script (`--ignore-scripts`, as the gate's
`WEB_BUILD` does). It used the export's own copy of main's policy, because the export has no `.git` and no
`ROOM_POLICY_DIR`. `make up ENV=prod` builds in the web image with main's policy from `web_image.py`. The two read the
same files on this tree, but I didn't build the image (no container tonight).

## 2. Does spec 024's walking-view "Eat" show and work with the model?

With the model bundled, nothing on main blocks the path that `probe-eat-028` traced on `a36f98ec`. That probe's step 3
was the only gate that was shut, and it is now open: `scene.ts:472`'s `eats` is true for a 3D dinosaur visit. Its
step 8, `available.ts:33`'s `figureModel`, holds once the figure shows the model. No line of that trace changed between
`a36f98ec` and `a556a933`, because main's two commits since touch no code:

```
$ git diff --stat a36f98ec refs/heads/main | tail -1
 10 files changed, 727 insertions(+), 1 deletion(-)      # assets/**, the two PDFs, assets/policy/content-approvals.json
```

The eat and dinosaur test files, run alone on the export (`apps/web/`, `maxWorkers` 4 from `cpu.max`):

```
$ ../../node_modules/.bin/vitest run --maxWorkers=4 test/room/eat-*.test.ts test/ui/eat-*.test.ts test/room/dinosaur-*.test.ts test/room/data-only.test.ts
  files: test/room/data-only.test.ts test/room/dinosaur-compose.test.ts test/room/eat-3d.test.ts
  test/room/eat-available.test.ts test/room/eat-box.test.ts test/room/eat-checks.test.ts test/room/eat-chunker.test.ts
  test/room/eat-data.test.ts test/room/eat-meal.test.ts test/room/eat-model.test.ts test/room/eat-mouth.test.ts
  test/room/eat-pause.test.ts test/room/eat-scene.test.ts test/ui/eat-button.test.ts test/ui/eat-degraded.test.ts
  test/ui/eat-fall.test.ts test/ui/eat-hidden.test.ts test/ui/eat-input.test.ts test/ui/eat-key-repeat.test.ts
  test/ui/eat-place.test.ts test/ui/eat-reduced.test.ts
 ❯ test/room/eat-model.test.ts (7 tests | 1 failed) 4949ms
 ❯ test/room/data-only.test.ts (31 tests | 1 failed) 361332ms
 ❯ expectDataOnly test/room/data-only.test.ts:149:58
 ❯ test/room/data-only.test.ts:548:5
 ❯ test/room/eat-model.test.ts:215:53
 Test Files  2 failed | 19 passed (21)
      Tests  2 failed | 254 passed (256)
exit 1
```

- `eat-model.test.ts`'s "reserves the Eat box and gives the eating with the model" passes. It runs over the repository's
  part with spec 021's test dinosaur (`helpers/room-dinosaur.ts`) put in: `stage.protect.eat` is true and `stage.eat` is
  defined. `eat-scene.test.ts` (bites over the fixture dinosaur and the real busy sign) passes. So do
  `eat-available`, `eat-3d`, and the `test/ui/eat-*` files (the tile, key B, and the degraded, reduced, and hidden
  states).
- The one eat failure is about the premise, not the eating: `eat-model.test.ts:213–215`, "reserves no Eat box and gives
  no eating to a dinosaur visit whose bundle has no dinosaur's model", takes `repositoryBundle().scene` as that bundle
  and asserts `expect(Object.hasOwn(part.avatars, "dinosaur")).toBe(false)`. Since his intake, the repository's bundle
  has the dinosaur (`expected true to be false`).
- `data-only.test.ts:548` is section 3's second failure.
- **Not proved here.** By rule (spec 009's FR-043, quoted at `eat-model.test.ts:10`), the eat tests use the fixture
  dinosaur, never the asset. The repo has no browser test (no Playwright and no e2e file in `git ls-files`), and
  tonight allows no `make up` and no container. So no run here shows the Author's GLB parsing in a browser,
  `figureModel` turning true, and the tile appearing. What I can show: the asset passes every compose rule (room:check:
  0 findings; report: bundled "yes"), it ships in the built chunk, and its rig has `Jaw`.

## 3. His gate's three failures

What each step runs, from `tools/gates/gate` (read only; I didn't run the gate or any checker under `tools/gates/`):

| Step | What it runs | Where |
|---|---|---|
| `test` | `make test` in the container phase: `corpus-check`, every workspace's `npm test`, then `pytest` over `PYTEST_DIRS` | `gate:203` (`CONTAINER_TARGETS`), `Makefile:253–256` |
| `studio-settings` | When the range adds or changes a file under `assets/` outside `assets/policy/`: main's `tools/gates/studio_settings_check.py`, no option, on the host. It reads the Claude Code settings the studio's session loads **on his machine**: managed (`/etc/claude-code/…` and Windows' managed files), user (`~/.claude` or `$CLAUDE_CONFIG_DIR`), and the studio workspace's `.claude/settings*.json` and `.mcp.json` under `/srv/studio/workflows`, plus `/etc/hosts`. Exit 1 means findings; exit 2 means it couldn't check. Both FAIL. | `gate:75–79`, `gate:1394`, `gate:1424–1470`; `studio_settings_check.py:1–60`, `:126–137` |
| `image` | On the agents' engine (`198.18.0.1:2376`, his client certificate): refuse unless the policy step passed; `docker version` within 15 s; the gateway's image; the web image without drafts and without the `visitor-assets` context; then `docker compose … build` for dev-cpu | `gate:90–97`, `gate:1564–1670` |

**test: fails here too, and the intake causes it.** I ran the whole `apps/web` vitest suite once on the export:

```
$ cd /tmp/tmp.UGDi7rADVg/apps/web && ../../node_modules/.bin/vitest run --maxWorkers=4
 FAIL  test/content/film-links.test.ts > … > 1. the table's four entries are well-formed, and each URL is repo/tree/main/films/<film>
 FAIL  test/content/film-links.test.ts > … > 2. each film's README.md and media are tracked, …
 FAIL  test/content/film-links.test.ts > … > 6. every link the table makes passes PDF5's allowlist; …
 FAIL  test/content/film-links.test.ts > … > 0. the tree is in the "before" or the "published" state (FR-013)
 FAIL  test/room/data-only.test.ts > the proof set, each change a data edit (FR-006, SC-001) > an addition: a catalog entry, a placement, a selectable, and a topic become a labelled, selectable stand-in
AssertionError: expected [ Array(1) ] to deeply equal []
+   "RG6 apps/web/room/scene.yaml:selectables[4]: its exclusive core lies under a panel's box, the walking control's box, or the \"Eat\" tile's box in 3D at 320 × 250 and 334 others for a 3D dinosaur visit",
 FAIL  test/room/eat-model.test.ts > the 3D stage (scene.ts's eats) > reserves no Eat box and gives no eating to a dinosaur visit whose bundle has no dinosaur's model
AssertionError: expected true to be false // Object.is equality
 ❯ test/room/eat-model.test.ts:215:53
 Test Files  3 failed | 239 passed (242)
      Tests  6 failed | 4382 passed | 7 skipped (4395)
   Duration  1810.68s (tests 71%, import 28%)
vitest exit 1
```

- **`film-links.test.ts`'s four failures come from my export, not the tree.** The brief's export leaves out `films/`,
  and the test reads `films/resume-links.json` ("films/resume-links.json is missing"). The gate exports the whole
  commit (`gate:736`). After I added main's `films/` to the same export
  (`git archive refs/heads/main -- films | tar -x`), the file passes:
  ```
  $ ../../node_modules/.bin/vitest run --maxWorkers=4 test/content/film-links.test.ts
   Test Files  1 passed (1)
        Tests  8 passed | 5 skipped (13)
  film-links exit 0
  ```
  The table's `pdf_sha256` is `5de0e7ee…ff21fb`, the hash of the resume `main` now serves, so the tree is in the
  "published" state.
- **`eat-model.test.ts:215`** fails as section 2 describes: its premise was "the repository has no dinosaur model".
- **`data-only.test.ts:548`.** The test adds a selectable at the spot `freeSpot()` (`data-only.test.ts:359–398`)
  ranks clearest over its `views()`. With the dinosaur bundled, the compositor now checks every 3D dinosaur visit's
  reserved "Eat" box (`build/room/checks/rg.ts:767` `dinosaurVisit`, `:777`, spec 024's Q150; page Q247's "one
  condition for all three"). The spot it picks lies under that box at 335 stages, so RG6 refuses it. The refusal is
  correct; the test's spot search doesn't know the Eat box. It wasn't seen before because the repository never carried
  the model.
- Neither failure is the `twin-2d.test.ts` flake (it passed in this run).
- **pytest.** Main's commits since `a36f98ec` touch no Python file (the `git diff --stat` above: `assets/**`, two PDFs,
  one policy JSON), so the brief's rule names no Python folder to run, and I ran none. The gate's `test` also runs the
  other workspaces' tests, `corpus-check`, and `pytest` over every `PYTEST_DIRS`. I didn't run those. None of their
  inputs changed since `a36f98ec`, whose hand merge doesn't name `test` among its exceptions.

**studio-settings: not reproducible here; it depends on his machine and predates the intake.** The step ran because
the range adds `assets/visitors/dinosaur/**` and changes `assets/CREDITS.md`. The check reads no file of the range; it
reads the settings on the machine that runs it. So the commit can't make it pass or fail, only make it run. `a36f98ec`
lists it as an exception ("exceptions: studio-settings, image (tunnel)"), and `2ec26428` (2026-11-11, the twin's avatar
intake) failed it too. Running it in my container would check my container's settings, not his, and its docstring says
"The Author runs it directly from main's checkout, in the Author's own terminal", so I didn't run it. Its pin isn't the
cause: its `CLAUDE_CODE` is `2.1.296` (`studio_settings_check.py:126`), which matches
`.devcontainer/toolchain.vars:15` `CLAUDE_CODE_VERSION=2.1.296`, so SS8's floor rule doesn't trip on the pin. What it
needs: his own run's lines. The check prints only scope names, folder names, and hashes (its §5), so they are safe to
paste. See the question below.

**image: not reproducible here; it is the engine, as at the merge before.** The policy step isn't in his failing list,
so `image` got past `gate:1570`'s refusal. It then failed at one of: the engine probe, the gateway's build, the web
image's build, or the compose build. The web image can't be what the intake broke: the gate names no `visitor-assets`
context, so the dinosaur never enters that build (`Dockerfile:24–27`). Without drafts and with main's caps, a more
demanding build than the gate's (it carries the dinosaur) passes here (`build`, exit 0, above). `a36f98ec` says
"image (tunnel)", and `086fea12` and `9d35ac9b` (2026-11-13) failed `image` too. From here, now:

```
$ make engine-status
engine: unreachable (ask the Author: deploy/agents-engine/engine.sh up)
make: *** [Makefile:176: engine-status] Error 1
engine-status exit 2
```

That is my sandbox's route through the relay at 01:30, not his host's at his gate. It is consistent with "tunnel",
but it doesn't prove his failure's line. What it needs: his gate log's lines above `image`'s FAIL (question below).

## 4. What a spec 028 task would change, and FR-032 and Q11 on main

I built none of it. Each item changes a test file because the test's premise (no dinosaur model in the repository)
stopped being true. The code is right. That conflicts with "If a test fails, fix the code, not the test", so it is a
question for him (below), not a task I took.

| # | File (line on its branch) | Change | Why |
|---|---|---|---|
| T-a | `apps/web/test/room/eat-model.test.ts:213–225` (main) | Build the "no model" part on purpose (the repository's part with `avatars.dinosaur` taken out) instead of asserting the repository lacks it. Keep the assertions on `stage.protect.eat` and `stage.eat`. | The case still matters (a cut-out dinosaur visit; spec 024's US3 AS2), but the repository no longer stands in for it. |
| T-b | `apps/web/test/room/data-only.test.ts:359–398` (main), `freeSpot()` | Rank and accept spots over the 3D dinosaur visit's views as well, with the "Eat" box reserved, as RG6 judges them, whenever `carriesModel(…, "dinosaur")` holds. Or compose the proof set over a tree without `assets/visitors/dinosaur/`. I recommend the first: it keeps the proof against the room the visitor gets. | RG6 is right to refuse a selectable under the Eat box; the search is what's stale. |
| T-c | `apps/web/test/room/dino-cutout-visit.test.ts:47–48` (`night/int-028/int-028`) | As T-a: build the no-model part explicitly. | It asserts `repositoryBundle().scene.avatars.dinosaur` is undefined and will fail as soon as the 028 line takes `a556a933`. |
| T-d | The 028 line itself | Merge `a556a933` into it before its integration task's one `make check`. Its base is `a36f98ec`. | Without that, its `make check` can't see the intake, and T-a to T-c stay hidden until his gate. |

I checked the other tests that assert `avatars.dinosaur` is undefined: `dinosaur-compose.test.ts:122, :195, :219, :321`
(main) and `dog-figure.test.ts:242` (`int-028`). They compose their own folders or trees, not the repository's, and the
first file passes above.

**FR-032 on main.** The spec says the eating task SHALL quote `probe-eat-028`'s finding, that "his intake of the model
fixes it with no code change". On main, that holds as far as code and tests can show. The intake opened
`scene.ts:472`'s gate with no code change, the asset composes and ships, and every eating test over a bundled
dinosaur passes. The one step not shown is the GLB showing in a real browser (section 2).

**Q11 on main.** Q11's condition, his answer's ("keep it as waiting for model intake p9"), is "the dinosaur's model
shown". It is now met on main in a build: the bundle carries the model. **The scene isn't on main:** spec 028's scene
(FR-019 to FR-024) is in the 028 line, unmerged. On main today, a 3D dinosaur visit with the model gets spec 025's run
(the twin and the room's dog run; `scene.ts:731–790`, "no run starts unless the visitor is the dinosaur") and spec
024's eating. That is exactly what spec 028's FR-028 replaces once the line merges. So what he will see after his P9,
before the 028 line merges, is the run, not the wave-scream-bicycle scene he described.

## What waits for his hand from item 2

- The intake itself is done (`60fe462e`, merged at `a556a933`). Nothing more from P9.
- `studio-settings` and `image`: his own lines, below.
- T-a to T-d: his answer to the question below. One of them (T-c) sits on the 028 line he hasn't merged yet.

## Questions (also in `/night/io/out/questions.md`)

### Q: May a spec 028 task change the three tests whose premise was "the repository has no dinosaur model" (eat-model.test.ts:215, data-only.test.ts's freeSpot, and the 028 line's dino-cutout-visit.test.ts:48), since your intake made that premise false and the code is right?

Blocks: probe-dino-028's follow-up (T-a to T-d) · Recommended: yes. One spec 028 task, not a fix task, after the 028
line merges `a556a933`. It builds each no-model part on purpose and gives `freeSpot` the dinosaur visit's Eat box. It
names the change in spec 028's Assumptions as a deviation from "fix the code, not the test", and a reviewer who didn't
write it reviews it. · Others: you change the three tests by hand; keep `test FAIL` as a merge exception until spec 028
merges.

### Q: Would you paste, from your terminal, the lines your gate printed for studio-settings and image on 4f6eb883 (or rerun only the studio check and the engine status, below), so the page can say why each failed?

Blocks: nothing tonight (both are exceptions from the merge before) · Recommended: run this from main's checkout and
paste its output. The check prints scope names, folder names, and hashes only; `engine.sh status` prints no secret.

```
python3 -I -B -X pycache_prefix=/dev/null tools/gates/studio_settings_check.py; echo "studio-settings exit $?"
deploy/agents-engine/engine.sh status; echo "engine status exit $?"
```

· Others: keep both as standing exceptions ("studio-settings, image (tunnel)") and don't diagnose them; paste the
gate's own log lines instead of rerunning.

## Refusals

None. No hook or bash-gate refused a command in this task.

## Verifying

The brief limits runs to the files above and `make lint`. This task changes no code and no test, so no test file covers
a changed file. `make lint` ran in this worktree after `npm ci --ignore-scripts` (exit 0), with this note in the tree:

```
$ make lint
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
850 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- … (one line per script; no finding)
make lint exit 0
```

The exports stay in `/tmp/tmp.UGDi7rADVg` (main without `films/`, then with it) and the logs in
`/tmp/tmp.QSpT2SY5zV/out/`. Per the brief, nothing in `/tmp` was deleted.
