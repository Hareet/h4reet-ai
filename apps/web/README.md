# apps/web: the room

The static site visitors see: the choice screen, the 3D work area, the interactive resume and its PDF, and the data-flow disclosure page. Spec 002 (`specs/002-the-room/`) builds it; [ADR 0033](../../docs/adr/0033-the-rooms-stack-apps-web-vite-threejs.md) records the stack: Vite, TypeScript, and Three.js, with no UI framework.

## The workspace

- `index.html` and `src/`: the pages and their code. `src/main.ts` is the entry. Phase 1 serves the first screen as static HTML: the AI disclosure, the PDF link, and the data-flow disclosure link. The script replaces it with the choice screen and the room.
- `src/resume/`: the interactive resume (Phase 3), a panel of the header and each item as a button, with "Download (PDF)". In the room it opens inside the resume's panel, through `src/room/resume-port.ts`'s adapter, which loads `room-data.json` once (again after a failure) and passes `room:item-selected` on as the usage event `item_selected`; "Close" or Escape closes it, focus back on "Resume".
- `src/narration/`: the narration display (Phase 5). In the room, `src/room/resume-port.ts`'s adapter passes it each `room:item-selected`, with the visitor's chosen path: the item's script shows beside it, the first word at once, then 160 words a minute, with the whole script in the panel's polite live region, a line saying the AI twin narrates, and a "Draft" label on a draft. Another selection, or closing the resume, stops it.
- The room (Phase 4): `src/choice/` (the path, the avatar, the visit), `src/room/` (`app.ts` the screens, `scene.ts` the Three.js chunk loaded only after the WebGL 2 check, `handoff.ts`, `quality.ts` and `flat.ts` the modes, `a11y.ts` the "In the room" list), and `src/talk/` (the text box, the talk button, and the fixed messages). Every piece of the scene is labeled placeholder geometry until spec 003's assets arrive. `content/messages.yaml` holds the fixed messages, and `build/manifest.ts` bundles them into the page and writes `dist/room-manifest.json` and `config/room-events.yaml`.
- The twin's conversation (spec 007, `specs/007-twin-conversation/`): `src/talk/turn-client.ts` sends a turn, `{feature, path, turns}`, to the site's own `/api/room/turn` with no cookie and no cache, stops it after 35 seconds or when the visitor presses Stop or Escape, and keeps the newest turns that fit the history limits; `src/talk/talk.ts` shows the conversation as plain text under "You" and "AI twin", a polite waiting status outside the log, the box's limit and a counter from 80% of it, and one of the fixed messages wherever the twin can't answer (a degraded cause's class, a refused or unreadable turn, a stopped one, a topic not ready). A ready piece's selection opens its topic; typed text with no conversation open starts free talk when the manifest marks it ready. The build reads `config/twin-readiness.yaml` (the Author's; absent, nothing is ready) and `config/budgets.yaml`'s `limits.twin` through `build/room/readiness.ts`. Nothing a visitor types is stored, sent anywhere else, or put in a URL.
- `src/events.ts`: the usage events (Phase 6), one `navigator.sendBeacon` per event to the site's own `/api/room/events`, its body `{kind}` or `{kind, id}` alone. A refused beacon is dropped, never retried or stored (contracts/room-events.md §1).
- `build/`: what the build runs besides Vite. `build/disclosure.ts` renders `docs/data-flow-disclosure.md` into `dist/disclosure/index.html`, so the page the site links is the file the repository reviews. `build/content.ts` checks the resume's source against the corpus and writes its part of `room-data.json`; `build/pdf.ts` renders `resume.pdf` from the same items (contracts/resume-source.md). `build/resume-pdf.ts` checks the Author's designed PDF, `content/resume-author.pdf`, which takes the render's place when `main` approves it, and `build/download-name.ts` names the PDF's download from `main`'s `resume-header.json` (contracts/resume-source.md §7). `build/narration.ts` checks the narration scripts (N1–N5, with the resume's own C1–C9), puts each published script under its item in `room-data.json`, and writes the scripts' eval cases; `build/narration-source.ts` reads the scripts' files (contracts/narration.md).
- `test/`: vitest. Tests that need a document make their own with jsdom; `axe-core` checks the built pages.
- `content/`: `resume.yaml`, the resume's one source, every item citing the corpus, `narration/<item-id>.<path>.md`, one script per item for each path, `engineer` and `non-engineer`, each citing the corpus like the resume's items; and `resume.lock.json`, the SHA-256 of each corpus and facts file the source and its scripts read. Drafted by agents and published only when the Author approves them by hash.
- `fonts/`: three families under the OFL, pinned by `fonts.lock` (schema 2), each with its uses: IBM Plex Sans, Regular and Bold, which the site's CSS serves and the PDF embeds, the PDF's one family; and IBM Plex Mono and Patrick Hand at weight 400, for the room's live faces, which the CSS declares too. `npm run fonts:lock` writes the lock from the families' npm tarballs ([its README](fonts/README.md)).
- `Dockerfile` and `nginx.conf`: the `web` image, nginx with the built site and its headers baked in. The Dockerfile also has the drafts-only `lookdev-phone` target, which builds the lookdev page's phone copy and no image (below).
- `src/lookdev/`, `vite.phone.config.ts`, and `build/single-file.ts`: the lookdev page, drafts only, and its phone copy (spec 004; below).

Every dependency is a development dependency, pinned exactly in the root `package-lock.json`. The browser gets Vite's bundle, and the image holds only `dist/`.

## Commands

From the repository root, in an agent session or the devcontainer:

| What | Command |
|---|---|
| Build `dist/` | `npm run build -w apps/web` |
| Tests | `npm test -w apps/web` (and `make test`, which runs every workspace's) |
| Typecheck and lint | `make lint` (tsc runs per workspace, `apps/web` included) |
| The resume's and the scripts' checks, the lock, and the eval cases | `npm run content:check -w apps/web` (C1–C9 and N1–N5, then whether the lock and `evals/narration/cases/` are current) |
| Rewrite the lock and the eval cases after a change | `npm run content:lock -w apps/web`, which refuses while a check fails |
| The narration's eval cases | `make evals`, which runs the `narration` suite on the fake adapter only |
| Build the lookdev page's phone copy in a working tree | `ROOM_DRAFTS=1 npm run build:lookdev-phone -w apps/web`, which refuses without `ROOM_DRAFTS=1` and writes the gitignored `apps/web/dist-phone/lookdev.html`; this copy is for checks and never goes to the phone (below) |
| Rewrite the room's generated files (`config/room-events.yaml`, `config/room-topics.yaml`, and `docs/studio/`'s work orders and photo guide) after the room's data or the resume's items change | `npm run room:generate -w apps/web`, or its alias `npm run manifest -w apps/web` (`make test` fails while one is stale; [room/README.md](room/README.md)) |
| Rebuild the twin's grounding pack, `config/twin/corpus.json`, and its product cases, `evals/product/cases/twin-*.yaml`, after a corpus change | `npm run twin:pack -w apps/web` (spec 007; `make test` fails while either is stale, naming the corpus file whose sections moved, and when a topic no longer fits `limits.twin.max_input_chars`) |
| Vendor a font, or rewrite `fonts/fonts.lock` | `npm run fonts:lock -w apps/web -- [--copy] <tarball>...`, one `npm pack` tarball per family ([fonts/README.md](fonts/README.md)) |

The build writes `apps/web/dist/`: `index.html`, hashed files under `assets/` (the fonts among them), `disclosure/`, `room-data.json`, and `resume.pdf`. Every URL in it is relative, and nothing loads from another host (FR-057). The citation check and the narration's checks run on every build and fail it on any problem, naming the item or the script; a stale lock only warns there, and fails `make test`, so a corpus edit on `main` never stops `make up`.

## The image and the stacks

`deploy/scripts/web_image.py` builds the image outside compose on every `make up`, after the gateway's (contracts/web-serving.md §1):
- **Its tag carries the drafts flag:** `h4reet-web:<ref>` on prod, which never holds drafts, and `h4reet-web:<ref>-drafts` on dev and dev-cpu, built with `ROOM_DRAFTS=1`. The env file's `H4_WEB_SUFFIX` says which, and preflight holds it to the stack.
- **Main's content policy comes from the host:** it reads `assets/policy/content-approvals.json`, `assets/policy/resume-header.json`, and, for the room's caps, `assets/policy/caps.json` (spec 004) from `main` with `git cat-file blob refs/heads/main:<path>` (the branch's full ref: a bare `main` would read a tag of that name first), and hands them to the build as the named build context `policy`. The build stage never runs git; without the approvals every content file is a draft. A policy context without caps.json takes the tree's own `assets/policy/caps.json`, which the Dockerfile copies and spec 003's rule A9 holds to `main`'s; on dev-cpu that copy is the working tree, so the guarantee rests on `main` keeping caps.json. A commit without caps.json fails at the Dockerfile's copy: it fails closed (spec 004, T328). The image's label `org.h4reet.web.policy` digests the three files.

On dev-cpu, `make web-image` builds the working tree on the agents' engine; `make build` and `make image` include it.

## Drafts and approvals

A content file (the resume's source, a narration script) is published only when its SHA-256 is in `assets/policy/content-approvals.json` on `main`, a human-only file ([ADR 0034](../../docs/adr/0034-content-approvals-by-hash-read-from-main.md)). Until then it's a draft: prod's image leaves it out, and the `-drafts` images of dev and dev-cpu show it under a "Draft, not approved" banner. The PDF's full header comes from `assets/policy/resume-header.json` on `main`, when the Author fills both slots.

- **Where the build reads them:** the directory `ROOM_POLICY_DIR` names. In the image, that's the named context `policy`, which `web_image.py` filled from `main`. In a checkout, `npm run build -w apps/web` first runs its prebuild, `build/policy.ts`, which reads `main`'s two files by `refs/heads/main`, with `git cat-file blob`, into `node_modules/.cache/h4reet-web/policy/`. It never reads the branch's copies. With no `main`, or no files on it, every content file is a draft.
- **What it writes:** `dist/room-data.json` names the policy and the lock it was built with (`built_from.policy`, the digest `web_image.py` labels the image with, and `built_from.lock`), each content file it published with its digest (`published`), and every draft (`drafts`). Its `resume_state` says what it published: `approved`, the header and items, each with its source file and that file's SHA-256; `draft`, the same under the banner, in a drafts build; or `withheld`, no header and no items, and a PDF that says only "Draft, not approved". Each published item carries its scripts, `narration: {engineer, non-engineer}`, each `{words, approved, source, sha256}`, or `null` where a build without drafts left a draft out; while the resume is withheld, no script is published. Beside the PDF, `resume.pdf.txt` holds the PDF's text as pdf.js reads it, so the gate's scan of `dist/` covers the PDF too; the image never serves it. `resume_pdf` names the Author's designed PDF, `{source, sha256}`, with `draft: true` when a drafts build serves it unapproved, when the build serves it in the render's place, or is `null`.
- **What enforces it:** `build/approvals.ts` is the build's convenience. The enforcement is `tools/gates/content_check.py`, human-only, which `make check` (`make content-check`) and the Author's gate run after a build without drafts. It reads `main`'s approvals itself, holds each `published` entry to them, and scans every file in `dist/` for any unapproved file's text, whatever `room-data.json` says.

## The visitor's walking legs

Spec 019. The man and the woman have no `walk` clip, so the visitor's avatar gets a code gait: `src/room/scene/gait.ts` lays six leg-bone rotations (hip, knee, ankle, each side) over the playing idle clip, after the mixer advances, and gives the clip's own rotations back the moment the gait stops. Its phase follows the distance walked, never time, so the steps keep pace with the distance at any speed; its amplitude eases in and out over `EASE_S`. The hips bone lowers by the standing leg's lift (`standingLift`, from the same frame's angles and each leg's thigh and shin as `findLegRig` measures them), so the standing foot stays within 2 cm of the floor; the hips bone's rotation and every bone above it stay the clip's, so the holding hand keeps its grip. A foot's slide along the floor isn't zero: it is tuned at the look pass.

- **Tune it** at the look pass, one line each, in `gait.ts`: `HIP_MAX`, `KNEE_MAX`, `ANKLE_GAIN` (radians), `CYCLE_PER_HEIGHT` (stride length, 0.7 of the body's height), `EASE_S`. The bone axis and sign are fixed by `test/room/gait-rig.test.ts`, which reads the real GLBs.
- **A studio `walk` clip wins.** Where one is loaded the gait stays off and the clip plays at `clamp(speed / walking.speed_mps, 0.5, 1.5)`.
- **Off** under reduced motion, paused or hidden, and at quality level 1 or more; a model without the six leg bones or the hips bone slides and logs one `gait` entry (`state: unavailable`).
- **Small tests:** `vitest run test/room/gait.test.ts test/room/gait-rig.test.ts test/room/avatar-gait.test.ts`.
- **Lookdev** has no walking pose: its hands page drives its own mixer, not the room's controller, so the gait is judged in the room.

## Lookdev, drafts only

The page where the Author settles the room's look and judges each studio file's fit at the framing visitors get, before approving its hash (spec 004, `specs/004-room-composition/contracts/lookdev.md`). Drafts builds alone have it: `lookdev/index.html` is a Vite input only with `ROOM_DRAFTS=1`, the fixtures and the lookdev data fail a release build that reaches them, and the phone copy is written outside `dist/`, so prod's image never holds any of it.

- **On dev's drafts image.** In the Author's terminal, `make up ENV=dev REF=<commit>` builds dev's `-drafts` image, and the page is at `http://127.0.0.1:18105/lookdev/`, in the Author's browser on the same host. A model picked with a piece's "Load a candidate…" stays in the page's memory: the page shows its SHA-256, its mark, and its fit findings, and never sends, stores, or keeps the file. A reload forgets it. Approve only a hash the page showed.
- **The phone copy.** One self-contained file, `lookdev.html`, which the reference phone opens from its own files with no network: one classic inline script and one style, under a meta policy that admits only those two, by their SHA-256, and refuses every request (`connect-src 'none'`). It holds the page's code and data and no model: each model comes through its piece's picker. Its first panel is the probe. Its views are the site's page's, Reference desktop and Reference phone (`stages.ts`'s stages, the phone's as last measured, on whatever device opens the copy) and Desk close-up, and one more, This device, the copy's first: the stage of the device that opened it, from the probe. On the reference phone, This device is the view that re-measures the phone's stage, the reference phone view of `contracts/lookdev.md` §7.3 step 7; in a desktop browser, Reference phone is FR-069's option B. If the probe stops ("This browser can't run the vignette from a local file."), delete the copy: lookdev runs on the desktop at the phone's stage size and pixel ratio instead (FR-069's option B).
- **The Author's copy** comes from the Dockerfile's drafts-only `lookdev-phone` target, built in the Author's terminal from main's checkout, from the commit the merge-request note names, into a new, empty folder outside the repository:

  ```bash
  git --no-replace-objects archive <the note's full commit SHA> \
    | docker build -f apps/web/Dockerfile --target lookdev-phone \
        --output type=local,dest=<a new, empty folder outside the repository> -
  ```

  The folder holds one file, `lookdev.html`, whose SHA-256 must be the one the note records; a mismatch ends the session. The build names no policy context, so nothing in the copy is approved, and it judges candidates against the commit's own `assets/policy/caps.json`, which the Dockerfile's install stage copies and spec 003's rule A9 keeps equal to `main`'s at the commit's base; the command needs no policy context for the caps (`specs/004-room-composition/plan.md` §10, tasks.md T328), and a commit with no `caps.json` stops at that copy. An agent's `apps/web/dist-phone/` never goes to the phone.
- **On the phone,** the nine steps of `specs/004-room-composition/contracts/lookdev.md` §7.3, from "Before" to "Delete", as written there. Its step 3: "**Copy, don't connect.** Over a USB cable, as a file transfer with USB debugging off, into one new folder on the phone: `lookdev.html` and the session's model files (the scrubbed candidates, and any set models the run needs). Nothing else; never a photo."
- **Keep the page in sight for a whole run.** A hidden page draws no frames, so a run stops early, with no results, when the page is hidden: the screen times out or locks, or another app, tab, or window comes in front. Before a run, set the phone's screen timeout longer than the run (over 10 minutes for the soak), and keep the desktop's window uncovered.
- **No image holds the copy.** `.dockerignore` drops `**/dist-phone`, the runtime stage copies only `dist/`, no stage copies from the `lookdev-phone` target, and `web_image.py` names no target, so its images end at the runtime stage.

## The local URL per stack

Each stack's `edge` publishes the site on its own loopback port, x005 (`H4_SITE_PORT`):

| Stack | URL |
|---|---|
| prod | `http://127.0.0.1:18005/` |
| dev | `http://127.0.0.1:18105/` |
| dev-cpu | `http://127.0.0.1:18305/`, from the Author's terminal (the sandbox can't reach the engine's published ports) |

`/api/room/events` on the same port goes to the gateway's usage-event route (Phase 6); any other `/api/` path is 404 until the conversation exists. While `web` is down, `edge` answers with its own page: "The room is unavailable right now."

The first screen's PDF link works without the room or any script (FR-018). While the resume is a draft, prod's PDF says only "Draft, not approved".
