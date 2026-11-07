# apps/web: the room

The static site visitors see: the choice screen, the 3D work area, the interactive resume and its PDF, and the data-flow disclosure page. Spec 002 (`specs/002-the-room/`) builds it; [ADR 0033](../../docs/adr/0033-the-rooms-stack-apps-web-vite-threejs.md) records the stack: Vite, TypeScript, and Three.js, with no UI framework.

## The workspace

- `index.html` and `src/`: the pages and their code. `src/main.ts` is the entry. Phase 1 serves the first screen as static HTML: the AI disclosure, the PDF link, and the data-flow disclosure link. The script replaces it with the choice screen and the room.
- `src/resume/`: the interactive resume (Phase 3), a panel of the header and each item as a button, with "Download (PDF)". In the room it opens inside the resume's panel, through `src/room/resume-port.ts`'s adapter, which loads `room-data.json` once (again after a failure) and passes `room:item-selected` on as the usage event `item_selected`; "Close" or Escape closes it, focus back on "Resume".
- `src/narration/`: the narration display (Phase 5). In the room, `src/room/resume-port.ts`'s adapter passes it each `room:item-selected`, with the visitor's chosen path: the item's script shows beside it, the first word at once, then 160 words a minute, with the whole script in the panel's polite live region, a line saying the AI twin narrates, and a "Draft" label on a draft. Another selection, or closing the resume, stops it.
- The room (Phase 4): `src/choice/` (the path, the avatar, the visit), `src/room/` (`app.ts` the screens, `scene.ts` the Three.js chunk loaded only after the WebGL 2 check, `handoff.ts`, `quality.ts` and `flat.ts` the modes, `a11y.ts` the "In the room" list), and `src/talk/` (the text box, the talk button, and the fixed messages). Every piece of the scene is labeled placeholder geometry until spec 003's assets arrive. `content/messages.yaml` holds the fixed messages, and `build/manifest.ts` bundles them into the page and writes `dist/room-manifest.json` and `config/room-events.yaml`.
- `src/events.ts`: the usage events (Phase 6), one `navigator.sendBeacon` per event to the site's own `/api/room/events`, its body `{kind}` or `{kind, id}` alone. A refused beacon is dropped, never retried or stored (contracts/room-events.md §1).
- `build/`: what the build runs besides Vite. `build/disclosure.ts` renders `docs/data-flow-disclosure.md` into `dist/disclosure/index.html`, so the page the site links is the file the repository reviews. `build/content.ts` checks the resume's source against the corpus and writes its part of `room-data.json`; `build/pdf.ts` renders `resume.pdf` from the same items (contracts/resume-source.md). `build/narration.ts` checks the narration scripts (N1–N5, with the resume's own C1–C9), puts each published script under its item in `room-data.json`, and writes the scripts' eval cases; `build/narration-source.ts` reads the scripts' files (contracts/narration.md).
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
| Vendor a font, or rewrite `fonts/fonts.lock` | `npm run fonts:lock -w apps/web -- [--copy] <tarball>...`, one `npm pack` tarball per family ([fonts/README.md](fonts/README.md)) |

The build writes `apps/web/dist/`: `index.html`, hashed files under `assets/` (the fonts among them), `disclosure/`, `room-data.json`, and `resume.pdf`. Every URL in it is relative, and nothing loads from another host (FR-057). The citation check and the narration's checks run on every build and fail it on any problem, naming the item or the script; a stale lock only warns there, and fails `make test`, so a corpus edit on `main` never stops `make up`.

## The image and the stacks

`deploy/scripts/web_image.py` builds the image outside compose on every `make up`, after the gateway's (contracts/web-serving.md §1):
- **Its tag carries the drafts flag:** `h4reet-web:<ref>` on prod, which never holds drafts, and `h4reet-web:<ref>-drafts` on dev and dev-cpu, built with `ROOM_DRAFTS=1`. The env file's `H4_WEB_SUFFIX` says which, and preflight holds it to the stack.
- **Main's content policy comes from the host:** it reads `assets/policy/content-approvals.json`, `assets/policy/resume-header.json`, and, for the room's caps, `assets/policy/caps.json` (spec 004) from `main` with `git cat-file blob refs/heads/main:<path>` (the branch's full ref: a bare `main` would read a tag of that name first), and hands them to the build as the named build context `policy`. The build stage never runs git; without the approvals every content file is a draft, and without the caps the room takes FR-053's starting figures. The image's label `org.h4reet.web.policy` digests the three files.

On dev-cpu, `make web-image` builds the working tree on the agents' engine; `make build` and `make image` include it.

## Drafts and approvals

A content file (the resume's source, a narration script) is published only when its SHA-256 is in `assets/policy/content-approvals.json` on `main`, a human-only file ([ADR 0034](../../docs/adr/0034-content-approvals-by-hash-read-from-main.md)). Until then it's a draft: prod's image leaves it out, and the `-drafts` images of dev and dev-cpu show it under a "Draft, not approved" banner. The PDF's full header comes from `assets/policy/resume-header.json` on `main`, when the Author fills both slots.

- **Where the build reads them:** the directory `ROOM_POLICY_DIR` names. In the image, that's the named context `policy`, which `web_image.py` filled from `main`. In a checkout, `npm run build -w apps/web` first runs its prebuild, `build/policy.ts`, which reads `main`'s two files by `refs/heads/main`, with `git cat-file blob`, into `node_modules/.cache/h4reet-web/policy/`. It never reads the branch's copies. With no `main`, or no files on it, every content file is a draft.
- **What it writes:** `dist/room-data.json` names the policy and the lock it was built with (`built_from.policy`, the digest `web_image.py` labels the image with, and `built_from.lock`), each content file it published with its digest (`published`), and every draft (`drafts`). Its `resume_state` says what it published: `approved`, the header and items, each with its source file and that file's SHA-256; `draft`, the same under the banner, in a drafts build; or `withheld`, no header and no items, and a PDF that says only "Draft, not approved". Each published item carries its scripts, `narration: {engineer, non-engineer}`, each `{words, approved, source, sha256}`, or `null` where a build without drafts left a draft out; while the resume is withheld, no script is published. Beside the PDF, `resume.pdf.txt` holds the PDF's text as pdf.js reads it, so the gate's scan of `dist/` covers the PDF too; the image never serves it.
- **What enforces it:** `build/approvals.ts` is the build's convenience. The enforcement is `tools/gates/content_check.py`, human-only, which `make check` (`make content-check`) and the Author's gate run after a build without drafts. It reads `main`'s approvals itself, holds each `published` entry to them, and scans every file in `dist/` for any unapproved file's text, whatever `room-data.json` says.

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

  The folder holds one file, `lookdev.html`, whose SHA-256 must be the one the note records; a mismatch ends the session. The build names no policy context, so the copy judges candidates against the room's starting figures (FR-053), as the compositor does while `main` has no `assets/policy/caps.json`; once caps land on `main`, the copy must be rebuilt with `main`'s policy as the named build context `policy`, as `deploy/scripts/web_image.py` passes it (`specs/004-room-composition/plan.md` §10). An agent's `apps/web/dist-phone/` never goes to the phone.
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
