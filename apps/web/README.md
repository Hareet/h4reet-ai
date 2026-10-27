# apps/web: the room

The static site visitors see: the choice screen, the 3D work area, the interactive resume and its PDF, and the data-flow disclosure page. Spec 002 (`specs/002-the-room/`) builds it; [ADR 0033](../../docs/adr/0033-the-rooms-stack-apps-web-vite-threejs.md) records the stack: Vite, TypeScript, and Three.js, with no UI framework.

## The workspace

- `index.html` and `src/`: the pages and their code. `src/main.ts` is the entry. Phase 1 serves the first screen as static HTML: the AI disclosure, the PDF link, and the data-flow disclosure link. The choice screen and the room arrive in later phases (`specs/002-the-room/tasks.md`).
- `build/`: what the build runs besides Vite. `build/disclosure.ts` renders `docs/data-flow-disclosure.md` into `dist/disclosure/index.html`, so the page the site links is the file the repository reviews.
- `test/`: vitest. Tests that need a document make their own with jsdom; `axe-core` checks the built pages.
- `content/` (Phase 3 on): the resume's source and the narration scripts, drafted by agents and published only when the Author approves them by hash.
- `Dockerfile` and `nginx.conf`: the `web` image, nginx with the built site and its headers baked in.

Every dependency is a development dependency, pinned exactly in the root `package-lock.json`. The browser gets Vite's bundle, and the image holds only `dist/`.

## Commands

From the repository root, in an agent session or the devcontainer:

| What | Command |
|---|---|
| Build `dist/` | `npm run build -w apps/web` |
| Tests | `npm test -w apps/web` (and `make test`, which runs every workspace's) |
| Typecheck and lint | `make lint` (tsc runs per workspace, `apps/web` included) |

The build writes `apps/web/dist/`: `index.html`, hashed files under `assets/`, and `disclosure/`. Every URL in it is relative, and nothing loads from another host (FR-057).

## The image and the stacks

`deploy/scripts/web_image.py` builds the image outside compose on every `make up`, after the gateway's (contracts/web-serving.md §1):
- **Its tag carries the drafts flag:** `h4reet-web:<ref>` on prod, which never holds drafts, and `h4reet-web:<ref>-drafts` on dev and dev-cpu, built with `ROOM_DRAFTS=1`. The env file's `H4_WEB_SUFFIX` says which, and preflight holds it to the stack.
- **Main's content policy comes from the host:** it reads `assets/policy/content-approvals.json` and `assets/policy/resume-header.json` from `main` with `git cat-file blob refs/heads/main:<path>` (the branch's full ref: a bare `main` would read a tag of that name first), and hands them to the build as the named build context `policy`. The build stage never runs git, and a file `main` lacks leaves every content file a draft.

On dev-cpu, `make web-image` builds the working tree on the agents' engine; `make build` and `make image` include it.

## Drafts and approvals

A content file (the resume's source, a narration script) is published only when its SHA-256 is in `assets/policy/content-approvals.json` on `main`, a human-only file ([ADR 0034](../../docs/adr/0034-content-approvals-by-hash-read-from-main.md)). Until then it's a draft: prod's image leaves it out, and the `-drafts` images of dev and dev-cpu show it under a "Draft, not approved" banner. The PDF's full header comes from `assets/policy/resume-header.json` on `main`, when the Author fills both slots.

- **Where the build reads them:** the directory `ROOM_POLICY_DIR` names. In the image, that's the named context `policy`, which `web_image.py` filled from `main`. In a checkout, `npm run build -w apps/web` first runs its prebuild, `build/policy.ts`, which reads `main`'s two files by `refs/heads/main`, with `git cat-file blob`, into `node_modules/.cache/h4reet-web/policy/`. It never reads the branch's copies. With no `main`, or no files on it, every content file is a draft.
- **What it writes:** `dist/room-data.json` names the policy it was built with (`built_from.policy`, the digest `web_image.py` labels the image with), each content file it published with its digest (`published`), and every draft (`drafts`).
- **What enforces it:** `build/approvals.ts` is the build's convenience. The enforcement is `tools/gates/content_check.py`, human-only, which `make check` (`make content-check`) and the Author's gate run after a build without drafts. It reads `main`'s approvals itself, holds each `published` entry to them, and scans every file in `dist/` for any unapproved file's text, whatever `room-data.json` says.

## The local URL per stack

Each stack's `edge` publishes the site on its own loopback port, x005 (`H4_SITE_PORT`):

| Stack | URL |
|---|---|
| prod | `http://127.0.0.1:18005/` |
| dev | `http://127.0.0.1:18105/` |
| dev-cpu | `http://127.0.0.1:18305/`, from the Author's terminal (the sandbox can't reach the engine's published ports) |

`/api/room/events` on the same port goes to the gateway's usage-event route (Phase 6); any other `/api/` path is 404 until the conversation exists. While `web` is down, `edge` answers with its own page: "The room is unavailable right now."

Until Phase 3 builds `resume.pdf`, the first screen's PDF link answers 404.
