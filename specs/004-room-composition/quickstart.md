# Quickstart: validating spec 004

Phase 1 output of `/speckit-plan`: the runs that prove each phase and each success criterion, with the agents' checks kept apart from the Author's runs. This guide holds the commands and what to expect. The contracts hold the rules, so a step points at its contract rather than repeating it.

- **Contracts:** [room-data-files.md](contracts/room-data-files.md), [room-bundle.md](contracts/room-bundle.md), [plain-model-fit.md](contracts/plain-model-fit.md), [serving.md](contracts/serving.md), [tier-signal.md](contracts/tier-signal.md), [turn-cost.md](contracts/turn-cost.md), [lookdev.md](contracts/lookdev.md), [intake-amendments.md](contracts/intake-amendments.md), [room-live-state-telemetry.md](contracts/room-live-state-telemetry.md).
- **Data:** [data-model.md](data-model.md).
- **Plan:** [plan.md](plan.md).
- **Decisions:** [research.md](research.md).

## Q0. Conventions

**Inherited.** [Spec 000's conventions](../000-local-foundations/quickstart.md#conventions) hold: **the Author's terminal**, **an agent session**, **Heavy**, and **the evidence**. Spec 003 adds one: no photo, workflow, unstripped output, or blinding key is ever copied into the repository or a note. Spec 004 adds four more:
- **No agent command names a studio path.** The studio folders are named by their lines in `tools/gates/studio-folders.txt`: `photos`, `outputs`, `workflows`, and `blinding-key`. The evidence names files by repository path and SHA-256, never by a studio path or a photo's name.
- **The agents' checks** run in an agent session, in the branch's worktree, set up as `make setup` sets one up. Their output goes into the note whole. They are:
  - `make check ENGINE_MODE=none-yet`, every local gate;
  - `make test`, which runs vitest for `apps/web` and the gateway, and pytest over its folders, so `evals/test_room_order.py` and the human-only checks' own tests run inside it;
  - `npm test -w apps/web`;
  - the compositor's scripts, `npm run room:<script> -w apps/web`;
  - the builds;
  - `make matrix`, which runs stage H, and stage S inside the sandbox;
  - `make redteam`.
- **The Author's runs** happen in the Author's terminal, on the Author's devices, or on dev. They are:
  - the interim deny and the ComfyUI check, now (Q1);
  - the photo guide's photo-work setup and checklist, before each photo-work session;
  - applying patches;
  - the gate;
  - the behavioural evals;
  - the human-only checks P-3 and P-8;
  - approvals by hash on `main`;
  - lookdev;
  - the failover;
  - the network log;
  - assistive technology.

  Never `make check` or `make test` in the Author's terminal ([START-HERE §7](../../docs/START-HERE.md#7-before-you-merge)).
- **The order** is the merge order of [intake-amendments.md §14](contracts/intake-amendments.md#14-the-merge-order):
  - Q1 and Q2 follow the Author's merges M4 to M8;
  - Q3 to Q5 and Q7 to Q9 run on line R's branches now, with Q6's serving checks; Q6's intake waits for P-5, P-6, P-10, and the look;
  - Q10 and Q11 go live after spec 001 and the twin's conversation;
  - Q12 runs at every merge that changes the room.

| Q | Proves | Agents' checks | The Author's runs | When |
|---|---|---|---|---|
| Q1 | the guard, the settings check, and ComfyUI's port; SC-013 | the matrix's rows | the interim deny and the ComfyUI check, now; P-1 to P-3; the evals; the settings check | now; M4, M5 |
| Q2 | the intake amendments; FR-077 | the human-only checks' tests; the order test | P-4 to P-8; the IPTC term; P-6's readings | M6 to M8 |
| Q3 | User Story 1; SC-001, SC-002 | yes | a look at dev | now |
| Q4 | User Story 2; SC-003, SC-007 | yes | WebGL off, pause, the network log | now |
| Q5 | User Story 3; SC-005, SC-006, SC-010 | the builds | lookdev on the desktop and the phone, the probe first | code now; runs with the studio's desk and one sign |
| Q6 | User Story 4; SC-006, SC-013 | `make check`, the report, the probe | scrub, record, approve, the settings check, headers | after P-5, P-6, P-10, and the look |
| Q7 | User Story 5; SC-008, SC-010, SC-013 | yes | the screen's description; P-8; room-text approvals | drafts now (the monitor's after the description); ships after P-9 |
| Q8 | User Story 6; SC-015 | yes | — | now |
| Q9 | User Story 7; SC-009 | yes | keyboard, screen reader, pointer, 320 × 568, grayscale | now |
| Q10 | User Story 8; SC-004, SC-012, SC-014 | the poller now | the failover through SC-004's harness, the network log, the panel | after spec 001 |
| Q11 | User Story 9; SC-011 | yes | the price check; a paid turn on dev | live after the twin's core |
| Q12 | every merge that changes the room; FR-073, Amendment A6 | the report | the gate; headers after release | each such merge |

## Q1. The guard and the settings check (M4, M5; P-1 to P-3; FR-025, FR-027, FR-077; SC-013)

**Prerequisites:** none for the runs now; for the rest, M1 to M3 merged, and the four studio folders made on the Author's machine. **Where:** the Author's terminal, then an agent session started after the patches.

**The Author's runs, now, before any merge** (tasks.md T290, T291; [intake-amendments.md §17](contracts/intake-amendments.md#17-what-the-author-does-besides-applying-patches)):
- **The interim deny:** the outputs and workflows folders denied, reads and writes, in both layers, in this repository's `.claude/settings.local.json`, after `git check-ignore -v .claude/settings.local.json` shows git ignores it; then `claude doctor`, and new agent sessions started in the main checkout.
- **The ComfyUI check:** could the studio's session reach ComfyUI's port at any time since 2026-10-22? If it could, close the route, hand ComfyUI's workflows over as files from then on (the spec's Confirmation 24), and record when and by which route, by folder and scope names, for `feat/004-guard`'s note.

**The Author's runs, at M4 and M5:**
1. **P-1, after M4.** Fill and apply spec 003's guard patch as its quickstart §1 says (`specs/003-studio-assets/quickstart.md`, on `feat/003-guards`). Then `claude doctor` and `make git-hooks`, then the behavioural tier, as step 4 runs it, when the next gate shows it PENDING.
2. **P-2 and P-3, after M5.** Gate and merge `feat/004-guard`. Then, from main's checkout:

   ```bash
   git apply docs/merge-requests/<date>-feat-004-guard.patch
   git apply docs/merge-requests/<date>-feat-004-settings-check.patch
   claude doctor
   make git-hooks
   ```

   Start new agent sessions, since settings load when a session starts.
3. **The settings check,** from main's checkout:

   ```bash
   tools/gates/studio_settings_check.py
   ```

   **Expected:** exit 0. The first line reads `studio-settings: PASS: …`, followed by the two folders, the `listeners` line (no hook, MCP server, or helper command beyond the approved list; no plugin; no loopback host, local binding, local socket, or proxy of its own in the sandbox's network; no WebFetch for a loopback host), and the settings files, by name and SHA-256, with no path ([intake-amendments.md §5](contracts/intake-amendments.md#5-p-3-the-studio-settings-check)). A FAIL names its rule; fix the studio's settings, never the check.
4. **The behavioural tier.** P-2 changed its trigger hash, so the next gate shows it PENDING. Run `make evals-agent-config REF=<that branch>` from main's checkout (START-HERE §7, step 3). **Expected:** `reads-studio-folder` passes, with no canary printed and nothing from outside the canary folder.
5. **Stage E, once** (Heavy, with no agent session using the engine): `tools/gates/gate --prove <the first branch gated after P-2>`. **Expected:** stage E passes.

**Agents' checks:**
1. **After `feat/004-guard` merges, before its patches are applied:** `make matrix`. **Expected:** the new rows read PLANNED, since the marker isn't there yet, apart from stage S's two rows for ComfyUI's port, which pass already.
2. **After the patches (step 2):** `make matrix`. **Expected:**
   - stage H: each folder is denied reads (spec 003's rows) and writes; the hook blocks an Edit in each folder, and through a `..` path, a symlink, and a case variant;
   - stage S: each folder is unreadable and unwritable; the case-variant row is a NOTE when the mount is case-sensitive; a request to ComfyUI's port is refused, directly and through the session's proxy (a NOTE when the sandbox names no proxy);
   - 0 failed, and none of these rows PLANNED.
3. `make check ENGINE_MODE=none-yet`. **Expected:** it passes, with row D4 in [docs/data-flow-disclosure.md](../../docs/data-flow-disclosure.md) ([intake-amendments.md §15](contracts/intake-amendments.md#15-disclosure-rows-and-their-ids)).

**Record:** the settings check's lines, the matrix's summary and its studio rows (SC-013's matrix part), the evals' verdict, and stage E's table.

## Q2. The intake amendments (M6 to M8; P-4 to P-8; FR-014, FR-023, FR-032, FR-053, FR-077; Amendments C1, C2, C4 to C8)

**Prerequisites:** Q1. **Where:** the Author's terminal; then an agent session, in a fresh worktree of main's tip, and in a scratch worktree of `feat/004-setup`, which carries the order test.

**The Author's runs:**
1. **The IPTC term,** before P-5 is generated: confirm it, and tell the agents ([intake-amendments.md §17](contracts/intake-amendments.md#17-what-the-author-does-besides-applying-patches)).
2. **M6 and M7.** Gate and merge `feat/003-us1-arrival-check`; apply its patch, P-4; then `claude doctor` and `make git-hooks`, since P-4 changes the pre-commit hook, then the behavioural tier, as step 4 runs it, when the next gate shows it PENDING (P-4 also changes `REVIEW.md`). Then gate and merge `feat/003-us5-comparison`.
3. **M8.** Gate and merge `feat/004-intake`, then:
   1. apply P-5;
   2. make the P-6 commit on `main`: name the `small_props`, and read each license, filling in its terms and the date read ([intake-amendments.md §8](contracts/intake-amendments.md#8-p-6-the-caps-and-the-licenses-the-authors-commit));
   3. apply P-7 and P-8;
   4. run `claude doctor` and `make git-hooks`.
4. **The behavioural tier,** on the next gate, as in Q1. **Expected:** `reviewer-reads-room-data` passes, with the work order's brand and the catalog entry's request for a crop of a photo and an upload each flagged Important.

**Agents' checks:**
1. **The order test, before M8.** In the scratch worktree of `feat/004-setup`, make an empty file under `assets/room/`, then run `make test`. **Expected:** it fails with `FR-077 assets/room/<file>: main's arrival check lacks Amendments C1 and C2 (spec 004)`, since the test reads main's constants, not the branch's ([intake-amendments.md §13](contracts/intake-amendments.md#13-the-agent-code-beside-the-patches)). Remove the file.
2. **After M8,** in main's worktree, `make test`. **Expected:**
   - `tools/gates/test/test_arrival_check.py` refuses each amended rule's bad case, and passes the model-made, composite, hand-made, design-sourced, and not-applicable cases;
   - `test_outline_check.py` and `test_studio_settings_check.py` pass;
   - the scrubber's parity test now runs against main's arrival check, and passes for all three marks;
   - the credits render a `design` source, and a scripted step's tools and service.
3. **The order test, after M8,** in the scratch worktree of `feat/004-setup` again, with the same empty file. **Expected:** the order test passes. Remove the file.
4. `make check ENGINE_MODE=none-yet` in main's worktree. **Expected:** it passes, `arrival` included, with no room file yet.

## Q3. User Story 1: the room as data (FR-001 to FR-014, FR-078; SC-001, SC-002)

**Prerequisites:** line R's foundation and User Story 1 branches. **Where:** an agent session; the Author on dev.

**Agents' checks:**
1. `make check ENGINE_MODE=none-yet`. **Expected:** it passes. Inside `make test`:
   - **the compositor's fixture set:** each known-bad case is refused, naming its rule, file, and path, and the known-good set is accepted (SC-002; [room-data-files.md](contracts/room-data-files.md));
   - **the data-only proof set,** run on a copy of the data: the tree's read log shows only data paths (SC-001, FR-006);
   - **the built-site scan** (FR-012);
   - **freshness** of every generated, committed file, among them `config/room-events.yaml`, `config/room-topics.yaml`, and `docs/studio/` (FR-013, FR-014, FR-038);
   - **strict and lenient:** a misfit model warns in the lenient build, keeps its stand-in, and the manifest lists it; the strict run fails on the same finding (FR-013; [plain-model-fit.md](contracts/plain-model-fit.md) §10).
2. Run the compositor's two checks:

   ```bash
   npm run room:check -w apps/web
   npm run room:scan -w apps/web
   ```

   **Expected:** no finding, and the scan finds 0 data-only IDs in the room's code (FR-007).
3. **The proof set by hand** (SC-001, User Story 1 scenarios 1 to 3), on a scratch branch:
   - move one placement, by its mount's offset in `apps/web/room/scene.yaml`;
   - add a catalog entry, a placement, a selectable, and a topic;
   - retarget one selectable to another topic;
   - then run `npm run room:generate -w apps/web` and `make check ENGINE_MODE=none-yet`.

   **Expected:**
   - the check passes, and `git diff --stat` lists only data and generated files;
   - the new piece is a labelled, selectable stand-in, with a work order under `docs/studio/work-orders/` and its ID in `config/room-events.yaml`;
   - the retargeted selectable keeps its ID and its event.

   SC-016 is folded into SC-001.
4. **The scan, planted** (User Story 1 scenario 4): put one ID that only the data defines into a string literal under `apps/web/src/`, then run `make test`. **Expected:** it fails, naming the file and the ID. Revert.
5. **Determinism** (FR-010, SC-002): run `npm run build -w apps/web` in two clean copies of the commit, at different paths. **Expected:** the same file names under `dist/assets/` and `dist/a/`, and byte-identical `room-manifest.json` and `room-data.json` ([room-bundle.md](contracts/room-bundle.md)).
6. **Today's room as data,** on the first data commit: the note's one-off comparison shows every box within 1 mm of spec 002's.
7. **`make up ENV=dev-cpu`,** on the agents' engine. **Expected:** the web image builds whether or not `main` has room caps, every piece is a stand-in, and `room-manifest.json`'s `standins` gives each one's reason ([data-model.md](data-model.md) §10.4). Then `make down ENV=dev-cpu`.

**The Author's runs** (dev, `http://127.0.0.1:18105/`, after `make up ENV=dev`, which is Heavy):
1. **Expected, until FR-078's layout lands:** the room looks and behaves as spec 002's did (User Story 1 scenario 5).
2. **Expected, after it:** the room is the Author's cube, as FR-078 lays it out (the spec's Clarifications, 2026-10-23 and 2026-10-26): seen straight into its open front; the desk and what stands on it as the Author's work area has them, the laptop at the desk's right side; the window around the neon sign; the chalkboard high and the snowboard low on the left wall; the bicycle on the right wall, next to the laptop; the twin by the laptop; and the visitor central, nearer the open front and a little left, with the monitor, the sign, and the laptop in view. Each estimated size and position is marked in the data, and its work order asks for the measurement (FR-002, FR-078).
3. **Tap areas, after it** (FR-064, SC-009): on the desktop, click the snowboard, the chalkboard, and the bicycle. **Expected:** each opens its topic's message. Then, in the browser's device mode at 568 × 320 and at 320 × 960: **Expected:** a board the branch's report lists as list-only there selects nothing when tapped and is chosen from "In the room"; every other piece is tapped as on the desktop.

## Q4. User Story 2: the room tells no lie, and never stops (FR-041 to FR-045, FR-057 to FR-062; SC-003, SC-007)

**Prerequisites:** User Story 2's branch. **Where:** an agent session; the Author on dev.

**Agents' checks:** `make test`. **Expected:**
- **The tier's table tests** cover every row of FR-041's table, each failure, and a stale answer of each kind. The charger shows plugged in only while the tier is local, and leaves the plugged pose on the first frame after a failed request or a stale answer (SC-003; [tier-signal.md](contracts/tier-signal.md) §9).
- **With the live source off,** no status request is made, the laptop shows its not-live pose, and the text copy says so (User Story 2 scenario 1).
- **Paused or hidden,** the tier reads paused (not-live while the live source is off) and the charger is never plugged in. While the room is paused, the text copy says `Paused at <time>`; a hidden page shows no such line (FR-060). On resume or return, the tier is reduced again before the next frame (scenario 3).
- **Fault injection in jsdom** runs over each failure of FR-057 to FR-061: a model blocked, timed out, failing its integrity check, or failing to decode; no WebGL; room text failing; a typeface that never arrives; reduced motion switched on mid-visit. Every run ends usable, with the AI disclosure visible, a working text box, and the text copy equal to the drawing; 0 end blank or frozen (SC-007).

**The Author's runs** (dev, `http://127.0.0.1:18105/`):
1. **Enter.** **Expected:**
   - the laptop's not-live pose, with its sentence in "Around the room";
   - both of the neon sign's counters reading "cost unavailable" (FR-048);
   - in the browser's network log, every request going to `127.0.0.1:18105`, and no `/api/status` request. That is the part of SC-012 that holds before spec 001.
2. **"Pause the room"** for a minute, then resume. **Expected:** the monitor's typing, the glows, and idle motion stop; "Around the room" reads "Paused at HH:MM"; and motion returns on resume (FR-060).
3. **A browser with WebGL disabled.** **Expected:** the 2D room, with the same pieces, states, and words (User Story 2 scenario 5).
4. **Stop dev's model server,** as spec 002's quickstart does (`docker compose … stop model-server-gpu`). **Expected:** the room renders in full, and only the conversation degrades, to its fixed message (scenario 6, FR-062).

## Q5. User Story 3: lookdev, on the desktop and the phone (FR-066 to FR-070, FR-023, FR-052; SC-005, SC-006, SC-010)

**Prerequisites:**
- User Story 3's branch, whose code exists now.
- For the Author's runs with models: the studio's desk and one sign, each scrubbed (FR-070), and the phone's camera-roll backup and gallery sync still paused (FR-026).

**Where:** an agent session; the Author's desktop browser on dev; the reference phone.

**Agents' checks:**
1. Build both kinds:

   ```bash
   npm run build -w apps/web
   ROOM_DRAFTS=1 npm run build -w apps/web
   ```

   **Expected:** the release build has no `dist/lookdev/`, no fixture, and no draft text, and its manifest's build kind is `release`; the drafts build has `dist/lookdev/index.html` (FR-066, Amendment B11; [lookdev.md](contracts/lookdev.md) §8).
2. Build the phone copy:

   ```bash
   ROOM_DRAFTS=1 npm run build:lookdev-phone -w apps/web
   ```

   **Expected:** one gitignored file, `apps/web/dist-phone/lookdev.html`; without `ROOM_DRAFTS=1`, the script refuses. This working-tree copy stays for the tests and never goes in the note. The commit and SHA-256 the note records come from a build with the target the Author builds ([lookdev.md](contracts/lookdev.md) §7.1), from a `git archive` export of the branch's commit, on the agents' engine with the proxy build arguments `web_image.py` passes there:

   ```bash
   git --no-replace-objects archive <the branch's full commit SHA> \
     | docker build -f apps/web/Dockerfile --target lookdev-phone \
         --output type=local,dest=<a new, empty folder> <web_image.py's proxy build arguments> -
   ```

   **Expected:** the folder holds one file, `lookdev.html`. Put the commit and that file's SHA-256 in the note.
3. `make test`. **Expected** ([lookdev.md](contracts/lookdev.md) §11):
   - the page's fit check is the compositor's own code, with the same findings for the same bytes, and "not scrubbed" for a file without spec 003's mark (FR-068);
   - the page's SHA-256 and gzip-9 figures equal Node's for the same bytes;
   - the phone copy opens in jsdom from a `file:` URL, with classic inline scripts only, and makes 0 network calls.

**The Author's runs:**
1. **The probe, first** (FR-069; the Author's answer to Q1 was option A: "Copy, don't connect, as FR-069 says"). As soon as User Story 3's first phone copy exists (it may hold the probe alone), follow [lookdev.md](contracts/lookdev.md) §7.3's steps 1 to 5 with no model files. **Expected:** the probe's verdict. If it stops ("This browser can't run the vignette from a local file."):
   - delete the copy;
   - lookdev runs on the desktop at the phone's stage size and pixel ratio, FR-069's option B;
   - the note records that departure from the intent's order for the Author.
2. **The desktop,** on dev's drafts image at `http://127.0.0.1:18105/lookdev/`. **Expected:**
   - the production framing on both reference stages, with the desk close-up as a secondary view (User Story 3 scenario 1);
   - each candidate, picked from disk, stays in memory, and shows its SHA-256 and fit findings, or "not scrubbed" (scenario 2).

   A run before the page shows the monitor's terminal, the neon sign's glow, and the laptop's cable states is preliminary: the looks are compared, not chosen. The whole-vignette desktop run uses a drafts image of a commit that holds User Story 2's cable states and User Story 5's faces (FR-070).
3. **The phone,** with the candidates: [lookdev.md](contracts/lookdev.md) §7.3, all nine steps, building the copy from the note's commit as lookdev.md §7.3, step 2 says, and checking its SHA-256 against the note. The phone stays offline whatever the page's own policy says, and its file picker gives the page only the files the Author picks.
   - **Expected, on a preliminary run** (FR-070: a run before the page shows the monitor's terminal, the neon sign's glow, and the laptop's cable states): the vignette as far as the branch draws it, with the studio's desk and one sign. The page shows the median frame rate, the share of frames over 33 ms, the settled quality level, draw calls, and texture memory (scenario 3). The looks are compared, not chosen.
   - **Expected, on the whole-vignette run** (FR-070), with the copy built from a commit that holds User Story 2's cable states and User Story 5's faces: the whole vignette (the desk, the monitor and its terminal, the neon sign's glow, the laptop's cable states, one sign, a corner of the chalkboard, and a bicycle wheel), with the studio's desk and one sign, and the same readouts. With the desktop's whole-vignette run, this is where the look is chosen.
   - **Expected, once every studio piece the scene holds is set** (the Polish run):
     - a median of at least 30 frames a second, with at least 95% of frames within 33 ms, over the 2-minute visit and the 10-minute soak;
     - 0 quality step-downs during the scripted load of every piece (SC-005);
     - texture memory at or under 96 MB (SC-006).
   - **Also record:** the phone's model, as ADR 0010 asks, and the probe's viewport and pixel ratio, which replace the estimated reference phone stage (about 368 × 420) in a later commit ([lookdev.md](contracts/lookdev.md) §10).
4. **Judge the look** on the whole-vignette runs, on the desktop and on the phone, at the production framing on both reference stages, and read the smallest cap height against the floor (SC-010; FR-070).
5. **The results:** the JSON block ([lookdev.md](contracts/lookdev.md) §6) goes into the note. It holds no file name, path, or device identifier beyond the viewport and pixel ratio.
6. **Approve** only the SHA-256 the page showed (FR-023, FR-068), at the intake (Q6).
7. **The look** (FR-070, User Story 3 scenario 5):
   - the chosen look goes into ADR 0010, on `feat/004-look` from `main` once line R has merged through `feat/004-us3-lookdev` (tasks.md T149; plan.md §10), or into ADR 0037 if ADR 0010 is accepted first;
   - the agents then run `npm run room:generate -w apps/web`, so the work orders regenerate before the remaining pieces are modeled.

## Q6. User Story 4: the first room files, through the intake (FR-015 to FR-028, FR-073, FR-079; SC-006, SC-013; Amendments C1 to C11)

**Prerequisites:**
- On `main`: P-5, P-6, P-7, P-8, and P-10.
- `docs/studio/` merged.
- The look recorded in ADR 0010.
- The studio's contract updated by hand, as `docs/studio/handoff.md` lists.

The first room files are the desk and one sign (Amendment C10). **Where:** the Author's terminal and `main`; then an agent session; then the Author on dev.

**The Author's runs:**
1. **Scrub** each file with its record's steps: `make assets-scrub FILE=<file> RECORD=<records.json>` ([intake-amendments.md §13](contracts/intake-amendments.md#13-the-agent-code-beside-the-patches)). A step the studio's session scripted is a model step, naming the session as its service with row D4 (Amendments C1, C8).
2. **Lookdev** (Q5): load the scrubbed file, and read its SHA-256 and fit findings.
3. **Bring the file in** on the intake branch: the file in `assets/room/`, with its `records.json` entry and the directory's `LICENSE.md`. The pre-commit hook runs the arrival check on the staged files.
4. **Approve on `main`,** in `assets/policy/approvals.json`:
   - the SHA-256 the page showed;
   - the five `confirms`, where `likeness_accepted` may read `"not_applicable"` for a file that doesn't show the Author (Amendment C5);
   - the room confirmations, each `true`, or `"not_applicable"` where it doesn't apply (Amendment C4).
5. **The settings check,** from main's checkout: `tools/gates/studio_settings_check.py`. Paste its lines into the intake branch's note (FR-025, SC-013).
6. **The gate** on the intake branch. **Expected:** `arrival`, `studio-settings`, and `content` all PASS. A passing `arrival` means four things for each room file (SC-013):
   - its mark is the one its record calls for (C1);
   - a design-sourced record says `design` (C2);
   - it carries no camera metadata;
   - its approval on `main` confirms a recreation, not a photo.
7. **Headers, once, before the first model merges.** On dev:

   ```bash
   curl -sI -H 'Accept-Encoding: gzip' http://127.0.0.1:18105/a/<stem>.<hash16>.glb
   ```

   **Expected:** `Content-Encoding: gzip`, `Content-Type: model/gltf-binary`, and `Cache-Control: public, max-age=31536000, immutable`, as [serving.md](contracts/serving.md) §2.2 lists them. Also, `nginx -V` in the pinned image lists the gzip_static and gunzip modules (serving.md §8).
8. **The network log** of a visit to the room on dev, from the desktop browser. **Expected:** every GLB response carries `Content-Encoding: gzip` (SC-006).

**Agents' checks:**
1. `make check ENGINE_MODE=none-yet` on the intake branch. **Expected:**
   - `arrival` passes;
   - the compositor's strict run has no RX or RK finding, and each model replaces its stand-in with no other edit (User Story 4 scenario 1);
   - the order test passes.
2. `npm run room:report -w apps/web`. **Expected:** FR-073's report ([data-model.md](data-model.md) §10.9), which goes in the note. It holds:
   - each piece's source, bytes, gzip bytes, triangles, and texture memory;
   - the totals against the caps, with the caps' source and SHA-256;
   - the room's share of the first visit, beside 12,000,000 bytes and spec 003's 25,000,000-byte limit;
   - each live face's smallest glyph, with the counter faces marked exempt on the phone where they fall under the floor there (FR-052);
   - the side-wall selectables list-only at FR-064's smallest stages, or "none".
3. **The fit check's variants** in `make test`: a live face missing or off its plane, a misplaced origin, a light, camera, or animation, a name off the rule, a refused extension, and a mark that disagrees with its record. **Expected:** each refused, naming its rule (User Story 4 scenario 2; [plain-model-fit.md](contracts/plain-model-fit.md) §12; [intake-amendments.md](contracts/intake-amendments.md) §7).
4. **Serving** in `make test`. **Expected:** `dist/a/` holds only `.glb.gz` copies; each inflates to its record's SHA-256, equals a deterministic level-9 gzip, and has its length as the bundle's `bytes` (FR-079, C11; [serving.md](contracts/serving.md) §8).
5. **The in-network probe on dev-cpu,** on the agents' engine, after `make up ENV=dev-cpu`: the probe [serving.md](contracts/serving.md) §8 describes. **Expected:** §2.2's headers, header by header; and the `.gz` URL answers 404.
6. **SC-013's matrix rows** from Q1 still pass.

## Q7. User Story 5: every readable word drawn live (FR-029 to FR-035, FR-061; SC-008, SC-010, SC-013)

**Prerequisites:** User Story 5's branch, with drafts now; the monitor's drafts wait for the Author's typed description of the photographed screen (answer 5). Shipping waits for three things:
- P-9 and `feat/004-setup` on `main`;
- the Author's approvals;
- the signs' outlines.

**Where:** an agent session; the Author's terminal, the photos folder, and `main`.

**Agents' checks:**
1. `make test`. **Expected:**
   - every renderer's text copy equals its drawn words (FR-034, SC-008);
   - a draft shows only in a drafts build, marked as a draft;
   - a release build leaves the draft's face plain, with its words nowhere in `dist/` (User Story 5 scenario 2);
   - a pending chalkboard line doesn't render (scenario 3);
   - no line naming Seva reaches the board (scenario 4);
   - the monitor's scripts carry no path, host or user name, email or IP address, URL other than the site's, amount, or secret (FR-031).
2. `npm run room:report -w apps/web`. **Expected:** SC-010's machine half:
   - every readable face is at or above the floor on both reference stages, the neon sign's word face among them, except a counter face on the reference phone, which the report marks exempt on the phone, its figures in "Around the room", and which is at or above the floor on the reference desktop (FR-052);
   - every other face is above the floor, or marked atmosphere with its words in the text copy;
   - every two cases of a switch are apart by at least the floor.
3. **After P-9,** `make check ENGINE_MODE=none-yet`. **Expected:**
   - `content-check` passes, counting the room-text files;
   - `tools/gates/test/test_content_check.py` fails an unapproved 14-character string in a bundle (User Story 5 scenario 5; [intake-amendments.md §11](contracts/intake-amendments.md#11-p-9-the-content-checks-room-text-kind)).

**The Author's runs:**
1. **The screen's description** (FR-031, answer 5), before the monitor's drafts, and before the whole-vignette lookdev runs that settle the look (FR-070) if its terminal is to show words: type a description of the photographed screen. It is recorded verbatim, in the Author's words, in an intent file, which both monitor blocks cite in `words_from` ([room-data-files.md](contracts/room-data-files.md) §7). **Expected:** the agents' strict build finds each quote verbatim (RT9), and the drafts follow it.
2. **A sign traced from its photo** (FR-032, SC-013). With the photo guide's photo-work checklist ticked (TMPDIR inside the photos folder; the tracing tool's autosave and recent files off; FR-025), inside the photos folder, offline:
   1. trace the lettering with the local tool;
   2. run `<main's checkout>/tools/gates/outline_check.py --from-svg …` with the fields [intake-amendments.md §10](contracts/intake-amendments.md#10-p-8-the-outline-check) lists.

   **Expected:** `outline-check: PASS: <sign>.outline.json, <n> paths, sha256 <hex>`. Then review the outlines by eye, and only then move the outline file, alone, to the studio's inbox. The note records the PASS line, never a photo's name or a path.
3. **Read the drafts** in dev's drafts image, each marked "Draft".
4. **Approve,** only once P-9 and `feat/004-setup` are both on `main`:
   1. run `sha256sum` on each room-text file and outline;
   2. add an entry of kind `room-text` to `assets/policy/content-approvals.json`;
   3. commit it on `main`.
5. **The gate** on the branch that ships them: the branch that brought the outlines in and bound them, which is User Story 5's branch if they came in before it merged, else a branch from `main`, once the reviewer has read the outlines and their binding as the "Room data" pass reads room text. **Expected:** `content` passes, and after the next `make up` the faces draw the approved words (User Story 5 scenario 1).

## Q8. User Story 6: selecting a piece opens its topic (FR-036 to FR-039, FR-076; SC-015)

**Prerequisites:** User Story 6's branch. **Where:** an agent session.

**Agents' checks:**
1. `make test`. **Expected:**
   - selecting each selectable whose topic isn't ready shows the fixed message with that topic's phrase, and makes 0 model calls and no request but its usage event (SC-015, User Story 6 scenario 4);
   - "Laptop and screen" holds the laptop, its stand, and the monitor (scenario 3);
   - `config/room-topics.yaml` is fresh;
   - a turn carries only the selectable's ID, the path, and the turns (FR-038).
2. `make redteam`. **Expected:** Amendment B4's four scaffold cases pass, each detector refusing its planted unsafe answer and passing its safe one:
   - an amount;
   - a sign or the board speaking for the Author;
   - locating the Author from the window;
   - Seva beyond the corpus.

   The twin's spec makes them live prompts (FR-039; scenarios 1, 2, and 5).

**The Author:** nothing runs before the twin's conversation core and the corpus exist; after that, the twin's spec's evals.

## Q9. User Story 7: every visitor reaches every piece (FR-063 to FR-065; SC-009)

**Prerequisites:** User Story 7's branch. **Where:** an agent session; the Author on dev.

**Agents' checks:** `make test`. **Expected:**
- axe reports 0 WCAG 2.2 AA violations;
- the Tab order runs: the toolbar, with "Pause the room" carrying `aria-pressed`; the "In the room" list; the conversation; then "Around the room";
- every hit area the room draws is at least 44 × 44 CSS pixels at 304 × 248, at the 568 × 320 screen's landscape stage (326 × 208 in R-19, 304 × 208 by `compose/stages.ts`), and across the sweep of screen sizes, in 3D and 2D, each selectable with its exclusive pick area (FR-064);
- at FR-064's smallest stages (304 × 208, 304 × 640, and the 2D drawing at its smallest scale), a side-wall selectable that can't keep its exclusive pick area draws none, a pick on its members selects nothing, and its "In the room" button selects it; at every other stage it has its pick area (FR-064, SC-009);
- the 320 × 568 layout keeps the twin, the desk, every selectable's pieces, the text box, and the talk button on screen, with five toolbar controls, "Credits" among them (FR-065);
- no meaning rests on colour alone: each tier value has its own sentence in "Around the room", each badge is a word, and each 2D cue has a name tag (FR-065; [research.md](research.md) R-40).

**The Author's runs** (dev; SC-009). Record the counts and any blocker:
1. **Keyboard only.** **Expected:** you reach every selectable, "Pause the room", "Credits", and "Around the room", with visible focus.
2. **A screen reader** (NVDA on Windows, or VoiceOver). **Expected:**
   - the "In the room" buttons, each with its name and topic;
   - "Around the room", with each face's words, the laptop's state, and the sign's figures in words;
   - nothing announced while the room sits (User Story 7 scenario 2).
3. **A pointer only,** in 3D and in 2D. **Expected:** "Around the room" is open after the conversation panel and outside the stage, with nothing to expand, and shows the laptop's sentence (scenario 5).
4. **320 × 568,** on a phone or in the browser's device mode. **Expected:** the twin, the desk, every selectable's pieces, the text box, and the talk button are on screen without scrolling (scenario 4).
5. **Grayscale** (FR-065; WCAG 2.2's 1.4.1): with the browser's or the system's grayscale filter, on dev's drafts image, in 3D and in 2D, through each of its sample states. **Expected:** every tier state, selection cue, and badge is still told apart without colour, by pose, shape, or words ([research.md](research.md) R-40).

## Q10. User Story 8: the laptop's tier, live (FR-041 to FR-045, FR-072, FR-074; SC-004, SC-012, SC-014)

**Prerequisites:**
- now: the poller, with the live source off;
- for the switch-on: spec 001 serving `GET /api/status` on the room's origin, with Amendments A1 to A3;
- for SC-004's harness: P-11 applied on `main`, which admits `status-harness` at the compose policy ([intake-amendments.md](contracts/intake-amendments.md) §18; the spec's Amendment Z1).

**Where:** an agent session now; the Author on dev after spec 001, with dev brought up (Heavy).

**Agents' checks:**
1. **Now,** `make test`. **Expected:** the poller's tests under a fake clock, as [tier-signal.md](contracts/tier-signal.md) §9 lists them:
   - the cadence, the timeout, the backoff, and `Retry-After`;
   - the resume rule, and nothing stored;
   - no request before Enter, while paused, or while hidden;
   - over random sequences of events, no two requests within one poll interval.

   That is FR-044, and the automated half of SC-012.
2. **In the switch-on change,** `make test` again. **Expected:**
   - the compositor's RL2 refuses the live source `site` without Amendment A4's words on row V7 (FR-074; [intake-amendments.md §15](contracts/intake-amendments.md#15-disclosure-rows-and-their-ids));
   - §7.9's panels join the dashboard test's required set ([room-live-state-telemetry.md](contracts/room-live-state-telemetry.md) §6);
   - with P-11 on `main`, `tools/gates/test/test_compose_policy.py`'s real-file test passes over `deploy/compose.yaml` with the harness, whose name row S1's From → To cell gives before its arrow (Amendment Z1).

**The Author's runs** (after spec 001, on dev's drafts image, opened through SC-004's harness at `http://127.0.0.1:18106/`, which forwards the page's status requests to dev's relay on the stack's network and every other request to the stack's site, `edge:8087` ([research.md](research.md) R-70)):

**First, the harness.** Select the `status-harness` profile in dev's env file's `COMPOSE_PROFILES`, with `H4_STATUS_HARNESS_PORT=18106`, and `make up ENV=dev` (Heavy). **Expected:** preflight passes on dev, and `http://127.0.0.1:18106/` shows the room, while the site's own port, `http://127.0.0.1:18105/`, still answers 404 under `/api/`. After the run, take the profile out again and `make up ENV=dev`. Prod's and dev-cpu's preflight refuse the profile.

1. **The failover** (SC-004). Enter the room. Once the charger shows plugged in, turn the relay's local path unhealthy as spec 001's quickstart does, and keep the time of the relay's path-change log line. **Expected:** the charger leaves the plugged pose within 40 seconds.
2. **Pause, then hide** (SC-004). Press "Pause the room" for 10 minutes, then resume. Then hide the page, behind another tab, for 10 minutes, then return. **Expected:** 0 frames with the plugged pose while paused or hidden, and the tier reduced again before the next frame on each return.
3. **The logs.** Copy the drafts build's frame log (the console's `h4FrameLog()`, [tier-signal.md](contracts/tier-signal.md) §6), and export the browser's network log of the whole visit as a HAR file. The HAR stays on the Author's machine.
4. **The network log** (SC-012). From main's checkout, run `python3 -I scripts/room/har_check.py` with the HAR, the frame log, and the path change's time ([tier-signal.md](contracts/tier-signal.md) §9). **Expected:**
   - 0 third-party hosts;
   - 0 status requests before Enter, while paused, or while hidden;
   - no two status requests within one poll interval;
   - the first frame off the plugged pose within 40 seconds of the path change;
   - 0 plugged frames while paused or hidden.

   The note records the checker's summary. The checker is agent code that runs in the Author's terminal, so its branch's note lists it first (ADR 0017).
5. **The panel** (SC-014). **Expected:** the dashboard's "Room live state" row shows status requests a minute, their 429s, and the time in each class, each within 60 seconds of the relay's change ([room-live-state-telemetry.md](contracts/room-live-state-telemetry.md)).

## Q11. User Story 9: the neon sign's counters (FR-046 to FR-050; SC-011)

**Prerequisites:** User Story 9's branch, reading "cost unavailable" now. The counters go live after the twin's turn route (Amendments B6, A5) and Confirmation 6. **Where:** an agent session; the Author on dev.

**Agents' checks:** `make test`. **Expected,** as [turn-cost.md](contracts/turn-cost.md) §10 lists the proof, over stubbed replies (local, paid, degraded, failed, lost, refused, and a 200 with an invalid cost or route):
- each reading follows FR-048;
- "this visit" equals the exact integer sum of the valid costs;
- "at least" persists after a later paid turn;
- the sign makes 0 requests and 0 storage writes;
- with no turn route configured, both counters read "cost unavailable" (SC-011).

**The Author's runs:**
1. **Now,** on dev. **Expected:** both counters read "cost unavailable" (answer 7: "Yes it can have cost unavailable for now.").
2. **After the twin's conversation core,** before the sign shows paid figures to public visitors: check `config/prices.yaml`'s Claude Haiku 5.5 row against Bedrock's current US cross-region price, and append a new version if it differs (Confirmation 6).
3. **A paid turn on dev.** **Expected:**
   - its figure is marked "est." and "test" (FR-049);
   - a reload returns "no call yet" and "$0";
   - the browser's storage panel shows nothing the sign wrote;
   - asked what a turn cost, the twin states no amount (User Story 9 scenario 6).

## Q12. Every merge that changes the room (FR-073; SC-006; Amendment A6)

**Agents' checks:** paste two outputs into the branch's note:
- `npm run room:report -w apps/web`, FR-073's report;
- `make check ENGINE_MODE=none-yet`, whole.

**The Author's runs:**
1. **The gate** on the branch, then the merge it prints.
2. **After spec 001's release,** and after any site rollback:

   ```bash
   curl -sI -H 'Accept-Encoding: gzip' https://<the site>/a/<stem>.<hash16>.glb
   ```

   **Expected:** `content-encoding: gzip` and `content-type: model/gltf-binary` from the public edge (A6; [serving.md](contracts/serving.md) §5).
3. **After publication,** a visit to the room on the reference phone. **Expected:** in its network log, every GLB response carries `Content-Encoding: gzip` (SC-006).
