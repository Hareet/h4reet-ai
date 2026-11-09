# Contract: the lookdev page and its phone copy

Where the Author settles the look and judges each studio file's fit at the framing visitors get, before approving a hash. Spec: FR-066 to FR-070, with FR-023, FR-049, FR-052, and FR-055; User Story 3, scenarios 1 to 5; SC-005, SC-006, SC-010. Q1 (the spec's Clarifications). Amendments: A5, B11. Plan: [plan.md](../plan.md). Research: [research.md](../research.md) (the phone copy, the probe, the five layers). Data: [data-model.md](../data-model.md) (fixtures, looks, and `apps/web/room/lookdev.yaml`). The fit check it runs: [plain-model-fit.md](plain-model-fit.md). The bundle it reads: [room-bundle.md](room-bundle.md).

The intent: "Lookdev settles the look on a small vignette, at the room's real framing, on a reference phone." Q1, answered 2026-10-22: "A (recommended)", which read: "Copy, don't connect, as FR-069 says". The spec's reading: "no listener, forward, USB debugging, ADR, or deviation."

The spec's Terms: "A drafts build: spec 002's `-drafts` images of dev and dev-cpu, and the self-contained drafts build of the vignette that FR-069 copies to the reference phone; a release build: any other."

## 1. Where it lives (FR-066, B11)

- **The page** is `apps/web/lookdev/index.html`, a Vite input only when `draftsOn(process.env)` (`apps/web/build/approvals.ts`, on `feat/002-us6-events`: `ROOM_DRAFTS=1`). It exists in the `-drafts` images of dev and dev-cpu, at `/lookdev/`, and in no other image: `deploy/scripts/web_image.py` (on `feat/002-us6-events`) never builds prod's tag with drafts.
- **The Author opens it on dev:** `http://127.0.0.1:18105/lookdev/`, through the stack's edge on the host's loopback, as disclosure row S1 has it: "requests from the Author's own terminal or browser, on the same host". Agent sessions can't reach the engine's published ports; they test the page in jsdom and in builds (§11).
- **Its marker.** The page's HTML carries `<meta name="h4-lookdev" content="drafts-only">`, which the release build's test searches for (§8).
- **The phone copy** (§7) is a second, self-contained drafts build of the same page, never served by any image.

## 2. What it runs (FR-067, FR-070)

- **The production runtime,** not a stand-in for it: the 3D part's interpreter, the live-face renderers, the signals, the motion store, and the real quality controller with its holds (FR-055), on one canvas.
- **Two scenes.** The room, which is the drafts build's own bundle; and the vignette: only the placements `apps/web/room/lookdev.yaml` lists under `vignette.show`, at their world positions and at the production framing ([data-model.md](../data-model.md), the lookdev vignette). FR-070's vignette: "the desk, the monitor and its terminal, the neon sign's glow, the laptop's cable states, one sign, a corner of the chalkboard, and a bicycle wheel, on stand-ins plus the studio's desk and one sign, made with flat colours and no baked shading."
- **Signals from fixtures only.** The tier and the turn costs come from the sample state the Author picks: the page never starts the status poller and never sends a turn, and every figure a fixture feeds reads "Sample" (FR-049).
- **Events stay on the page.** Usage events and asset events go to the page's own log panel, never to a beacon or a request.
- **Models on the site's page** load as the room loads them: the bundle's model URLs are relative to the site's root, so from `/lookdev/` they resolve against `../`, the same origin ([serving.md](serving.md) §1).
- **Its inputs.** `virtual:room-scene` (the 3D part, [room-bundle.md](room-bundle.md)); `virtual:room-fixtures` (the fixtures); and `virtual:room-lookdev`: `lookdev.yaml`'s two lists (`vignette.show` and `close_up.frame`), every look in `apps/web/room/looks/`, and each piece's fit inputs (the catalog's expected bounds and live faces at the stylized scale, the piece's budget, whether it is a small prop, and the caps the compose read), the same values the compositor judges the repository's models against ([plain-model-fit.md](plain-model-fit.md) §11). The last two modules resolve only in drafts builds (§8).

## 3. The controls and the views (FR-067)

| Control | Values | What it does |
|---|---|---|
| View | reference desktop, reference phone, desk close-up | below |
| Scene | room, vignette | the whole room, or only the vignette's placements |
| Look | each look in `apps/web/room/looks/` | the look method, palette, lights, outlines, and glow tones, at run time |
| Sample state | each fixture | the laptop's switch case, the neon sign's figures, badged "Sample" |
| Quality | automatic, or pinned at 0, 1, 2, or 3 | automatic runs the real controller; pinned holds one level for a measurement |
| Pause | on or off | FR-060's pause: typing, glow motion, and idle motion stop |
| Load a candidate… | one file picker per piece that takes a model (every piece but the figures') | §4 |
| Load every piece | – | the scripted load: every model the page holds goes back to its stand-in, then loads again through the room's loader, in its load order and under its holds: on the site's page a set model from `/a/`, and in the phone copy every model from memory (SC-005) |
| Run 2 minutes, Run 10 minutes | – | SC-005's visit and soak, the scripted load at the start; then the results (§6) |

**The views:**
- **Reference desktop.** The reference desktop's stage, about 686 × 640 CSS pixels at a pixel ratio of 1 (`stages.ts`), at the production framing: spec 002's FR-047 camera, `framing(aspect, boxes)` over the scene's framed set. On a screen with another pixel ratio, the renderer still draws at 1, as the reference desktop does.
- **Reference phone.** In the phone copy, the phone's own stage: the room's layout at the phone's viewport, by the `stages` module's formulas (pinned by a test to `apps/web/src/room/room.css`, on `feat/002-us6-events`), at the phone's pixel ratio; the results record both (§6), which is how lookdev re-measures the reference phone's stage, about 368 × 420. On the desktop, the last measured phone stage and pixel ratio from `stages.ts`: FR-069's option B, should the phone fail its probe.
- **Desk close-up.** The placements `lookdev.yaml` lists under `close_up.frame` (the desk and what stands on it), framed by the same `framing` over their boxes: a secondary view, for detail. Its readouts are labelled "close-up" and judge nothing; the intent: "Legibility is judged at the room's real framing, not at a close-up."

## 4. Candidates, in memory only (FR-067, FR-068, FR-023)

- **Reading.** A picked file is read with `File.arrayBuffer()` and held as a `Uint8Array`, and nothing else is done with the file.
- **What the page computes from it,** in the page: its SHA-256 (`src/lookdev/sha256.ts`, pure JavaScript, since the phone copy may not be a secure context for `crypto.subtle`); its bytes and its gzip-9 bytes (pako at level 9, as [plain-model-fit.md](plain-model-fit.md) §7 measures it); its fit findings, from the compositor's own fit check (`src/room/glb/`) against its piece's fit inputs; its triangles and texture memory; and its mark's class, `model`, `composite`, or `hand`, or "not scrubbed" (FR-068).
- **Showing it.** If RX1 and RX2 pass, the file swaps in for its piece through the room's own parse path (the GLTFLoader plugin the room uses), whatever its other findings, so the Author sees a misfit at the framing; its findings stay listed beside it. "Clear" brings back the stand-in or the set model.
- **Never:** a request, a storage write (a cookie, `localStorage`, `sessionStorage`, IndexedDB, or the Cache API), an object URL, a download, or a copy into the repository. FR-067: "Its file picker SHALL load a candidate model into memory only, never into the repository". A reload forgets every candidate.
- **No file name.** A candidate's findings read `<rule> candidate:<path>: <reason>`, listed under its piece. The name the picker reveals appears nowhere on the page or in the results.
- **What the Author approves** (FR-023, FR-068): only a hash the page showed, of a scrubbed file with no finding. The intent: "I approve a model's hash only after viewing the scrubbed file." The approval is the Author's own commit on `main`, made after checking, in the Author's terminal, that the file's SHA-256 is the one the page showed.

## 5. The readouts (FR-067; SC-005, SC-006, SC-010)

| Readout | How it is computed | Spec |
|---|---|---|
| Fit findings, mark, SHA-256, bytes, gzip-9 bytes | §4 | FR-067, FR-068 |
| Frame time, p50 and p95 | over the intervals between `requestAnimationFrame` timestamps during the run, by nearest rank | FR-067 |
| Median frame rate | 1000 ÷ the median interval, in milliseconds: the measure the quality controller steps on | FR-067, SC-005 |
| Share of frames over 33 ms | the intervals longer than 33.0 ms, over all of them. `requestAnimationFrame` timestamps fall on the display's refresh, so on a 60 Hz display a frame that misses one refresh measures 33.3 ms and counts as over | FR-067, SC-005 |
| Settled quality level | in automatic mode, the controller's level at the run's end; the run also counts its step-downs, in all and while any hold is held or any piece is loading | FR-067, FR-055, SC-005 |
| Draw calls, triangles | `renderer.info` for each frame; the largest over the run | FR-067 |
| Texture memory | the room's texture ledger, by FR-053's formula (width × height × 4 × 4/3 per texture): models, image cards, figures, and live-face canvases; the largest over the run | FR-067, SC-006 |
| Smallest glyph height | the cap height in CSS pixels of each readable face at the current view, from the shared `legibility` module with the typefaces' metrics the index carries ([room-bundle.md](room-bundle.md) §3.1); the smallest, and its face | FR-067, FR-052, SC-010 |

## 6. The results

At a run's end, the page shows its readouts as text and as one JSON block in a read-only text area, for the Author to put in the merge-request note. Shape (every value here is a placeholder, not a measurement):

```json
{
  "schema": 1,
  "build": "drafts",
  "bundle": "<the bundle's digest>",
  "probe": {
    "webgl2": true, "max_texture_size": 0, "device_memory": null, "create_image_bitmap": true,
    "secure_context": false, "viewport": [0, 0], "dpr": 0
  },
  "scene": "room",
  "view": "phone",
  "stage_css": [0, 0],
  "dpr": 0,
  "look": "<look>",
  "sample": "<fixture>",
  "quality": { "mode": "auto", "settled": 0, "step_downs": 0, "step_downs_while_loading": 0 },
  "duration_s": 120,
  "scripted_load": true,
  "frames": { "count": 0, "p50_ms": 0, "p95_ms": 0, "median_fps": 0, "over_33ms_share": 0 },
  "draw_calls": 0,
  "triangles": 0,
  "texture_bytes": 0,
  "smallest_cap_css": { "face": "<placement>.<role>", "px": 0 },
  "candidates": [
    {
      "piece": "<piece>", "sha256": "<64 hexadecimal digits>", "bytes": 0, "gzip_bytes": 0,
      "scrubbed": true, "mark": "model", "findings": ["<rule> candidate:<path>: <reason>"]
    }
  ]
}
```

| Field | Values |
|---|---|
| `build` | `drafts`, always: no other build has the page |
| `bundle` | the digest both parts of the bundle carry, which names what was composed |
| `probe` | §7.2's fields in the phone copy; `null` on the site's page |
| `scene` | `room` or `vignette` |
| `view`, `stage_css`, `dpr` | `desktop`, `phone`, or `close-up`; the stage drawn, in CSS pixels, and the pixel ratio drawn at, which in the phone copy re-measure the reference phone's stage |
| `look`, `sample` | the look's and the fixture's IDs |
| `quality` | `mode`, `"auto"` or the pinned level, 0 to 3; `settled`, the level at the run's end; `step_downs`, in all, and `step_downs_while_loading`, while any hold is held or any piece loads |
| `duration_s`, `scripted_load` | 120 for SC-005's visit, 600 for its soak; whether the run began with the scripted load. A run stopped early produces no results |
| `frames` | milliseconds to 0.1, the frame rate to 0.1, the share to 0.001 |
| `draw_calls`, `triangles`, `texture_bytes` | the largest over the run (§5) |
| `smallest_cap_css` | the smallest cap height at the current view, and its face |
| `candidates[]` | one per piece holding a picked file: `scrubbed`, false for "not scrubbed"; `mark`, `model`, `composite`, `hand`, or `null` when not scrubbed; `findings` as §4 writes them |

The results never hold a file name, a path, a user agent or another device identifier beyond the viewport and the pixel ratio, a time of day, or free text. The note records the date, and the device the Author used: ADR 0010 (`docs/adr/0010-real-time-avatar-rig-and-art-direction.md`, proposed, on the `feat/003-*` branches) names "a Samsung Galaxy A54 or the closest the Author has, recorded by model in each measurement".

## 7. The phone copy (FR-069, Q1)

FR-069: "WHEN the Author measures the look on the reference phone, THE LOOKDEV RUN SHALL open no path into the host by default: the phone runs a self-contained drafts build of the vignette, copied to it with the scrubbed candidates while its backup and sync stay paused (FR-026), opened with no network, the candidates loaded through its file picker, and all of it deleted after the session."

### 7.1 The build

- **`npm run build:lookdev-phone -w apps/web`** refuses to run unless `ROOM_DRAFTS=1`.
- **`apps/web/vite.phone.config.ts`:** Vite's library mode, in IIFE format, as one chunk, with dynamic imports inlined and every asset inlined (the typefaces as `data:` fonts), from the entry `apps/web/src/lookdev/phone.ts`. Chromium refuses module scripts and `fetch` from a local file, hence one classic script and no request.
- **`apps/web/build/single-file.ts`** writes the gitignored `apps/web/dist-phone/lookdev.html`: the CSS in one `<style>`, the IIFE in one classic `<script>` with every `</script` inside it escaped, and, in the head before any style or script, the policy:

  ```html
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-…'; style-src 'sha256-…'; font-src data:; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">
  ```

  Each `'sha256-…'` is the hash of the one element it admits. `connect-src 'none'` refuses every `fetch`, request, beacon, and socket, so the page has no network even if the phone does.
- **What it holds:** both scenes, the fixtures, the draft room text, the probe, and the code; no model. Every model, a candidate or one already set on `main`, comes through its pickers.
- **Reproducible.** The same commit gives the same bytes, and a test checks that two builds are byte-identical. The merge-request note of each branch that changes the copy records the commit and the SHA-256 of the copy the `lookdev-phone` target builds from that commit's `git archive` export (below; [quickstart.md](../quickstart.md), Q5), never of the working tree's `dist-phone/`, which stays for the tests.
- **The Author's build.** `apps/web/Dockerfile` gains a drafts-only `lookdev-phone` target. It sits before the runtime stage, so the default target stays the runtime image (`web_image.py` passes no `--target`). A stage on the build stage's install runs `build:lookdev-phone` with `ROOM_DRAFTS=1`, then a `FROM scratch` stage holds only `lookdev.html`, which `--output type=local` exports. No runtime stage copies from it, so no image holds the copy (§8, layer 5).

### 7.2 The probe

The copy's first panel, run before anything else. The site's page has none, and its results carry `probe: null`.

| Field | Read from |
|---|---|
| `webgl2` | a WebGL 2 context made with `failIfMajorPerformanceCaveat`, then released |
| `max_texture_size` | that context's `MAX_TEXTURE_SIZE` |
| `device_memory` | `navigator.deviceMemory`, or null where the browser doesn't give it |
| `create_image_bitmap` | `createImageBitmap` decoding a small PNG the page builds in memory, from a `Blob`: the GLB images' path, which makes no URL |
| `secure_context` | `isSecureContext`, recorded only: nothing in the copy depends on it |
| `viewport`, `dpr` | the viewport in CSS pixels, and `devicePixelRatio` |

The panel also shows the room's stage at that viewport, from the `stages` module, and whether the phone is above ADR 0010's capability floor, as the room's loader reads it ("WebGL2; where the browser reports it, `navigator.deviceMemory` of at least 4; and a maximum texture size of at least 4096"): below it the room loads no model, so a run there measures stand-ins only, and the panel says so.

**The verdict.** With `webgl2` and `create_image_bitmap` true, the copy runs. Otherwise it says so and stops: "This browser can't run the vignette from a local file." Lookdev then runs on the desktop at the phone's stage size and pixel ratio, FR-069's option B, and the note records that departure from the intent's order for the Author. The first build of the copy may hold the probe alone, so the Author can run it before the rest of the page exists ([quickstart.md](../quickstart.md)).

### 7.3 On the phone

1. **Before.** Camera-roll backup, gallery sync, and file sync are paused, as they stay from the shoot until cleanup (FR-026), and location is off. If cleanup came first, pause them again before step 3.
2. **Build the copy from committed content.** In the Author's terminal, from main's checkout, run `git --no-replace-objects archive <the note's full commit SHA> | docker build -f apps/web/Dockerfile --target lookdev-phone --output type=local,dest=<a new, empty folder outside the repository> -`. Its `lookdev.html` must have the SHA-256 the note records; a mismatch ends the session. An agent's `apps/web/dist-phone/` never goes to the phone.
3. **Copy, don't connect.** Over a USB cable, as a file transfer with USB debugging off, into one new folder on the phone: `lookdev.html` and the session's model files (the scrubbed candidates, and any set models the run needs). Nothing else; never a photo.
4. **Disconnect.** Unplug the cable and turn on airplane mode, with Wi-Fi and mobile data off.
5. **Open** `lookdev.html` from the phone's file manager in its browser. If the probe stops it, go to option B (§7.2).
6. **Load** each model file through its piece's picker, and read its SHA-256, mark, and findings.
7. **Run.** The reference phone view, the look, and the sample state; "Run 2 minutes" for SC-005's visit and "Run 10 minutes" for its soak, each with the scripted load; read the results.
8. **Record.** Put the results in the merge-request note, from the screen, or as a text file brought back over the same cable and then deleted with the rest.
9. **Delete** the page, the model files, and any results file, from the folder and from the phone's trash. Only then turn airplane mode off.

## 8. Out of every release build: five layers (FR-066, B11, A5)

FR-066: "THE LOOKDEV PAGE AND THE FIXTURES SHALL be built only into drafts builds, never into prod's image."
1. **The input.** `apps/web/lookdev/index.html` is a Vite input only when `draftsOn(process.env)`, so a release build has no lookdev entry and its `dist/` no `lookdev/`.
2. **The modules.** `virtual:room-fixtures`, `virtual:room-lookdev`, and the draft room text resolve only in drafts builds. In a release build, `resolveId` throws "fixtures and lookdev are drafts-only (FR-066)", so an import that reaches them fails the build rather than shipping them.
3. **The manifest.** `room-manifest.json`'s `build_kind` records `release` or `drafts` (Amendment B7; [data-model.md](../data-model.md), [room-bundle.md](room-bundle.md)), which spec 001's release reads.
4. **The tests,** in `make test`: a release build has no `lookdev/`, no file carrying the page's marker, no fixture's ID, no draft room text, and a manifest that says `release`; a drafts build has the page, and its entry chunk's static graph never reaches `src/lookdev/**`, the fit check, or pako.
5. **The phone copy's place.** It is written to the gitignored `apps/web/dist-phone/`, outside `dist/`, and only with `ROOM_DRAFTS=1`. `.dockerignore` drops `**/dist-phone`, and the runtime stage copies only `dist/`, so no image ever holds it ([serving.md](serving.md) §3). The Author's copy comes from the drafts-only `lookdev-phone` target as one exported file (§7.1), and no runtime stage copies from that target.

**The release step's own refusal** stands on top: spec 001's release refuses a bundle that holds fixtures, the lookdev page, or draft text, and builds `dist/` inside the pinned web build stage with no credentials mounted (Amendment A5), as spec 002's `web-serving.md` §5 already has it refuse drafts and stand-ins.

## 9. What the page never does

- Open a listener, a port forward, or USB debugging: Q1 took option A, so there is no deviation from Principle IV or spec 001's FR-052 (the spec's Deviations, "Not taken: Q1's option C").
- Reach another origin; and in the phone copy, reach any network at all.
- Poll the status, send a turn, or send a usage or asset event.
- Store anything on the device, or put a candidate anywhere but in memory.
- Reach a release build (§8).

So it needs no data-flow disclosure row: the site's page makes only same-origin requests on the host (row S1), and the phone copy makes none. The copy reaches the phone over the Author's own cable, between the Author's own devices.

## 10. After a run (FR-070; User Story 3, scenario 5)

- **The look** the Author chooses, on the runs that show the whole vignette on the reference phone and on the desktop (FR-070: an earlier run is preliminary, and compares looks without choosing one), becomes data: the look's file in `apps/web/room/looks/` and the scene's `look`. ADR 0010 records it (`docs/adr/0010-real-time-avatar-rig-and-art-direction.md`, on the `feat/003-*` branches; ADR 0037 amends it instead if ADR 0010 is accepted first), and `npm run room:generate` regenerates the work orders, whose freshness check fails `make test` until they are (FR-014). All of it lands before the remaining pieces are modeled (FR-070).
- **The phone's stage and pixel ratio** the run recorded replace the estimates in `stages.ts`, with its test, in a later commit.
- **The results,** and the copy's commit and SHA-256, go into the merge-request note; each approved hash goes into the Author's commit on `main` (§4).

## 11. Proof

| Test | Proves | Spec |
|---|---|---|
| `apps/web/test/lookdev/builds.test.ts` | §8's layers 1, 2, and 4, on a release build and a drafts build | FR-066, B11, User Story 3 scenario 4 |
| `apps/web/test/lookdev/candidate.test.ts` | a generated GLB through §4's path: findings and measures equal the compositor's for the same bytes and piece; "not scrubbed" for an unmarked file; the SHA-256 equals Node's; 0 calls to `fetch`, `XMLHttpRequest`, `sendBeacon`, or `URL.createObjectURL`, and 0 storage writes; no file name in the output | FR-067, FR-068, User Story 3 scenario 2 |
| `apps/web/test/lookdev/metrics.test.ts` | §5's definitions, from scripted frame intervals on the room's `FakeClock`: p50 and p95, the median frame rate, the share over 33 ms, the step-down counts, and the largest draw calls, triangles, and texture memory | FR-067, SC-005 |
| `apps/web/test/lookdev/sha256.test.ts` | the in-page hash equals Node's on generated inputs, from 0 bytes to a few megabytes | FR-068 |
| `apps/web/test/lookdev/results.test.ts` | §6's shape: every field, of its type, and nothing else | FR-067 |
| `deploy/scripts/test_web_image.py`, extended | §7.1's target: `lookdev-phone` sits before the runtime stage, which stays the last and the default; its last stage is `FROM scratch` holding only `lookdev.html`; no other stage copies from it | FR-066, FR-069, §8 layer 5 |
| `apps/web/test/lookdev/phone.test.ts` | §7.1: the build refuses without `ROOM_DRAFTS=1`; one `<style>` and one classic inline `<script>`, with no `type="module"`, no `src`, and no `</script` inside it; the policy exactly, each hash matching its element; no URL to any host in any attribute; two builds byte-identical; opened in jsdom from a `file:` URL, 0 network calls, and the probe stops at option B's message, since jsdom has no WebGL 2 | FR-069, §8 layer 5 |
| The Author's runs, in the order the quickstart gives ([quickstart.md](../quickstart.md)) | on dev's drafts image: User Story 3 scenarios 1 and 5, and the fit of the studio's desk and one sign; on the reference phone: the probe, then, with the room scene at the production framing and every studio piece the scene holds, SC-005 (a median of at least 30 frames a second, at least 95% of frames within 33 ms, over the 2-minute visit and the 10-minute soak, and 0 step-downs from the scripted load), SC-006's texture memory at or under 96 MB, and SC-010's judgment of the look at the production framing on both reference stages | User Story 3 scenarios 1, 3, and 5; SC-005, SC-006, SC-010 |

## 12. Principles, cost, and the degraded mode

- **Principles touched.** I: no visitor sees the page, it adds no flow (§9), and no photo is ever part of a session (§7.3). IV: copy, don't connect; nothing listens or forwards, so Q1's answer needs no ADR and no deviation; and the page is drafts-only, kept out of every release build in five layers (§8). III: the look the Author chooses here is recorded in ADR 0010 before the remaining pieces are modeled (§10). VII: the page shows each candidate's mark beside its hash, so the Author approves what the record will say (§4). II: the page is where SC-005, SC-006's phone figure, and SC-010 are measured.
- **Cost.** $0: no cloud, no model call, the Author's time and devices. The page's bytes never reach the public site.
- **The degraded mode.** A phone that can't run the copy from a local file stops at the probe, and lookdev falls back to option B on the desktop (§7.2). A candidate that fails RX1 or RX2 isn't swapped in, and its findings say why. Below ADR 0010's floor the room loads no model, and the panel says the run measures stand-ins only. A typeface that never arrives draws with the fallback after 2 seconds, as in the room (FR-061).
