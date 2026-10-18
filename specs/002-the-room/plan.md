# Implementation Plan: The Room — the Author's Work Area, Where the Twin Hands Visitors the Resume

**Branch**: `spec/002-the-room` (this plan; the work runs on stacked feature branches, [§13](#13-order-of-work-risks-and-proof)) | **Date**: 2026-10-18 | **Spec**: [spec.md](spec.md)

**Status**: Planned on 2026-10-18 under the Author's direction of 2026-10-17: "Let's relax some of the overnight rules so that you can continue with intent 002 and intent 003? I think you can create the tasks and implement them and we can always go back later and re-do a task or requirement if we highlight a needed change". The decisions spec 000's plan would have put to the Author are taken by recommendation, listed in [research.md](research.md#decided-by-recommendation-revisit-any-time), and any of them can be revisited.

**Input**: `specs/002-the-room/spec.md`, clarified on 2026-10-18 (Q1 A, Q2 A, Q3 B; its Clarifications). Spec 000 as merged on main at 58bd232. Spec 003 (studio assets) as specified on this branch's base. Spec 001 (cloud elevation) as a draft plan on its own branch.

**Companions**: [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md). Where this plan and a contract disagree on an interface detail, the contract is right and this plan is fixed.

**Conventions** (spec 000's):
- **The Author's terminal**: commands only the Author runs, outside Claude Code.
- **Agent-editable** files are changed by agents and reviewed by the Author. **Human-only** files change only by the Author's hand; agents deliver their changes as patches in `docs/merge-requests/`.
- **A stack** is one running copy of the topology: `prod` and `dev` on the 5090 host, `dev-cpu` on the agents' engine.
- **Implementable now** marks work whose dependencies all exist; **waits for** names the dependency that doesn't.

## Summary

Spec 002 builds the room in a new workspace, `apps/web`, served on each stack's loopback by a new `web` service behind the stack's `edge`. In the order the spec's answer 7 asks, the PDF comes first.

What it builds now, with no twin, no cloned voice, and no studio assets yet:
- **The resume:** one YAML source that cites the corpus sentence by sentence, checked by the build against the corpus's tags and "Do not claim" lists. It renders an interactive resume and a tagged, accessible PDF, published only when its hash is in a human-only approvals file.
- **The room:** the choice of path and avatar, a Three.js work area built from labeled placeholder geometry, the hand-off (at most 5 seconds, unskippable, reduced-motion aware), the resume one action away, a 2D mode, and an accessible DOM layer for every object.
- **Narration:** prepared scripts per item and path, cited and checked like the resume, shown as words at a speaking rate until the voice exists.
- **The floor:** every topic "not ready". Each object, the text box, and the talk button answer with the spec's fixed messages and call no model.
- **Use and cost:** usage events counted by a validated gateway route that stores nothing, and a "Room" dashboard row.

What waits: object conversations and free talk (User Story 4) on a spec of the twin's conversation core; push-to-talk (User Story 7) on that and a local recognizer; the voiced narration on the cloned voice (ADR 0011); the real assets on spec 003's intake; public serving on spec 001's edge. Each has its interface specified here, so it arrives without changing the room.

## Technical Context

**Language/Version**:
- TypeScript 6.0.3 on Node 24 LTS (spec 000's pins) for `apps/web` and the gateway's new route.
- Python 3.12, stdlib only, for the web image's build script (`deploy/scripts/web_image.py`), as spec 000's `gateway_image.py`.
- nginx configuration for `edge` and the `web` image. YAML for content.

**Primary Dependencies**:
- **Already pinned:** vite 8.3.3, vitest 5.0.3, typescript 6.0.3, the ESLint and Prettier set (spec 000).
- **Pinned by the first task, from the npm registry:** three, pdfkit, pdfjs-dist (tests only), jsdom (tests only), axe-core (tests only), yaml (already pinned for the gateway, 2.9.1, reused).
- **One vendored font,** open-licensed, embedded in the PDF and served by the site, pinned by SHA-256 in `apps/web/fonts/`.
- **Containers:** the `web` image, built per commit on spec 000's pinned `nginx-unprivileged` base.

**Storage**: none at run time. The visit's state lives in the page (FR-003). Usage events become counters (R-10). Content and approvals are files in the repository.

**Testing**:
- vitest with jsdom and axe-core for `apps/web`: the screens, keyboard order, live regions, and the axe rules.
- vitest for the content build: the citation check, the PDF's text and catalog, the manifest.
- The gateway's vitest suites for the events route.
- pytest for `web_image.py` and the edge's new listener (spec 000's `deploy/scripts/test_*.py` pattern).
- `make evals` for the narration's product eval cases.
- The Author's runs in [quickstart.md](quickstart.md): a keyboard visit, a screen-reader visit, the phone, frame rates.

**Target Platform**: evergreen browsers on desktop and phone, with WebGL 2 for the 3D mode and anything for the 2D mode. Each stack's `edge` on loopback (spec 000), and later spec 001's edge.

**Project Type**: a static web application, plus one gateway route and one compose service.

**Performance Goals**:
- **Load:** the choice screen usable within 3 s on 4G (SC-005); its JavaScript before the 3D chunk is kept under 150 KB compressed, and the 3D code loads behind the choice.
- **Narration** starts within 1 s of a selection (SC-006); it's local text, so the bound is the renderer's.
- **Frame rates:** 30 frames a second on the reference phone, 60 on the desktop (SC-004), through R-04's controller.

**Constraints**:
- No cookie, no browser storage, no third-party host (FR-003, FR-057); a content security policy of `'self'` on the `web` image's responses.
- No model call from anything this plan builds now.
- No number about the Author outside the corpus or a filled slot; no edit to `corpus/` (proposals only).
- Loopback ports only (spec 000).

**Scale/Scope**: one new workspace (about 30 modules), one compose service, one edge listener, one gateway route, one content source with its scripts, and a dashboard row.

## Constitution Check

*GATE: passed before research and re-checked after design ([below](#constitution-check-post-design)).*

| Principle or standard | What this plan does | Verdict |
|---|---|---|
| I. Data-local by default | Everything the room needs is static, from its own origin (FR-057), and works with the local tier off (FR-038). No device storage (FR-003). Usage events are counters with no visitor data (FR-054). Recognition, when it comes, is local only (FR-030, Q2). Degraded modes first: the floor is built before any conversation exists ([§11](#11-degraded-modes)) | PASS |
| II. Production-grade or not shipped | Tests per screen and per check, product eval cases for every narration script, a dashboard row, a cost estimate (zero at run time for what's built now) | PASS |
| III. Intent → spec → code | The accepted intent in the folder, the clarified spec, this plan, ADRs per decision ([§12](#12-documentation-and-adrs)) | PASS, with the Author's relaxed lifecycle of 2026-10-17 named in Status |
| IV. Least privilege | No permission widened. A new human-only file, `assets/policy/content-approvals.json`, arrives by patch before the first draft it governs, and the build reads it from `main`, so a branch can't approve itself. Studio files stay spec 003's intake | PASS |
| V. Cost | No model call in anything built now. When conversations come, gateway-only, local first, attributed per room feature (FR-032) | PASS |
| VI. Build in public | The resume source, the scripts, their citations, and their checks are public | PASS |
| VII. Say exactly what you owned | Every item and script cites the corpus; the ownership verbs are checked (FR-015) | PASS |
| VIII. Honest AI | The AI disclosure on every screen (FR-004); the twin says nothing until it exists; fixed messages are written in advance | PASS |
| Frontend standard: "browser-side speech processing where quality allows" | Recognition on the local tier, for the reason the spec states, with an ADR (Q2) | PASS, recorded reading |

Gate result: **PASS**.

## Project Structure

### Documentation (this feature)

```text
specs/002-the-room/
├── intent.md                # the accepted intent
├── spec.md                  # clarified 2026-10-18
├── plan.md                  # this file
├── research.md              # decisions, alternatives, those taken by recommendation
├── data-model.md            # the resume source, narration, approvals, the room manifest, events, the visit
├── quickstart.md            # the validation runs
├── contracts/
│   ├── resume-source.md     # the YAML source, the citation check, the builds, approvals
│   ├── room-scene.md        # the screens, the objects, the hand-off, the modes, the accessible layer
│   ├── narration.md         # scripts, checks, eval cases, display
│   ├── room-events.md       # the beacon, the gateway route, the counter, the panels
│   ├── room-conversation.md # the turn endpoint the twin will serve, and the fixed messages
│   └── web-serving.md       # the web image, the edge listener, H4_SITE_PORT, the CSP
├── checklists/requirements.md
└── tasks.md                 # /speckit-tasks
```

### Source Code (repository root)

```text
apps/web/                         [A] new workspace
  package.json, tsconfig.json, vite.config.ts, vitest.config.ts, index.html
  src/main.ts                     the screens' router (choice → room → resume), no storage
  src/choice/                     path and avatar choice (FR-001, FR-002)
  src/room/scene.ts, objects.ts   Three.js scene, placeholder geometry, raycasting to object IDs
  src/room/handoff.ts             the hand-off (FR-007, FR-008)
  src/room/quality.ts             R-04's controller and the 2D switch
  src/room/flat.ts                the 2D mode: the work area's still drawing with its object buttons (FR-042)
  src/room/a11y.ts                the accessible object list and live regions (FR-043–FR-045)
  src/resume/                     the interactive resume (FR-010, FR-011)
  src/narration/                  the word-by-word display (R-07)
  src/talk/                       the text box, the talk button, the fixed messages (R-14)
  src/events.ts                   usage events (FR-054)
  src/disclosure.ts               the AI and voice disclosures, the data-flow link (FR-004)
  content/resume.yaml             the resume source (drafts until approved)
  content/narration/*.md          one script per item and path
  content/messages.yaml           the fixed messages (FR-023, FR-039, FR-040, FR-041)
  build/policy.ts                 a checkout's prebuild: main's approvals and PDF header into the policy directory
  build/content.ts                parses the source, checks citations (C1–C9), renders the room's data
  build/pdf.ts                    the tagged PDF (R-06)
  build/manifest.ts               room-manifest.json and config/room-events.yaml: object IDs, item IDs, placeholders flag
  fonts/                          the vendored font and its license
  test/**                         unit, content, PDF, accessibility
  Dockerfile                      the web image (built outside compose, R-09)
services/gateway/                 [A] changed: POST /room/events (R-10), its validation and counter
deploy/compose.yaml               [A] changed: the web service; edge's x005 publication
deploy/edge/nginx.conf            [A] changed: listener 8087 (the site, the events location)
deploy/scripts/web_image.py       [A] new: builds h4reet-web<suffix> on every make up, with main's policy as a named context
deploy/env.example/*.env.example, deploy/env.agents/dev-cpu.vars   [A] changed: H4_SITE_PORT, H4_WEB_SUFFIX
config/room-events.yaml           [A] new, generated and checked: the events' kinds and IDs, read by the gateway
deploy/scripts/preflight.py       [A] changed: the sixth port
deploy/grafana/dashboards/h4-runtime.json   [A] changed: the "Room" row
evals/narration/cases/narration-*.yaml      [A] new: one per script, their own suite, fake adapter only
redteam/cases/room-*.yaml                   [A] new, with conversations (Phase 7): location probing and injection
assets/policy/content-approvals.json            [P] new, human-only: approved hashes (R-08)
assets/policy/resume-header.json                [P] new, human-only: the PDF's full name and contact (R-16)
.claude/hooks/protected-paths.sh, .claude/settings.json   [P] both files' protection
tools/gates/content_check.py, tools/gates/compose_policy.py   [P] the published-content check; SHARED_IMAGES gains web
tools/gates/gate                  [P] the image step builds the web image too (prod's variant), after the gateway's
deploy/agents-engine/authz.py, prove-limits.sh   [P] the agents' engine may publish dev-cpu's x005 (rules A21, E14)
corpus/proposals/resume-*.md      [A] the resume source and scripts, filed as proposals
docs/data-flow-disclosure.md      [A] rows V1 and V4 (local only until spec 001), and the room's notes
docs/adr/                         [A] the room's stack; approvals by hash; the recognition reading (with push-to-talk)
```

**Structure Decision**: one new workspace for everything the visitor sees (R-01); one gateway route rather than a service (R-10); one compose service to serve the build (R-09).

---

## 1. `apps/web` and the local serving (FR-059; R-01, R-02, R-09)

- **The workspace** joins the root `package.json`'s `workspaces` as `apps/*`. `npm run build --workspaces` builds it, and `make lint` and `make test` cover it with the existing tools.
- **The build** (`vite build`, then `build/content.ts` and `build/pdf.ts`) writes `apps/web/dist/`: `index.html`, hashed JavaScript chunks (the 3D code in its own chunk, loaded after the choice), `resume.pdf`, `room-manifest.json`, `room-data.json` (the resume and narration, approved or marked draft), and the font.
- **The `web` image:** `apps/web/Dockerfile` builds `dist/` on the build platform and copies it into spec 000's pinned `nginx-unprivileged`, read-only, listening on 8080. It sets the security headers itself: `Content-Security-Policy: default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`, `Referrer-Policy: no-referrer`, `Permissions-Policy: microphone=(), camera=(), geolocation=()` (the microphone opens with push-to-talk's group), and no cookie.
- **`deploy/scripts/web_image.py`** builds it outside compose, as `gateway_image.py` builds the gateway's (spec 000 plan §4, T184), with two differences ([contracts/web-serving.md §1](contracts/web-serving.md#1-the-web-image)):
  - **The tag carries the drafts flag:** `h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}`, where the suffix is empty on prod and `-drafts` on dev and dev-cpu, and `ROOM_DRAFTS=1` goes only into a `-drafts` build. It rebuilds on every `make up` (the layer cache keeps that to seconds) and never reuses a tag: a gateway image is the same code for every stack, but this image bakes in the drafts flag and `main`'s approvals, so a dev build must never run as prod's.
  - **The policy comes from the host:** it reads `main`'s approvals and PDF-header files with `git show` and hands them to the build as the named build context `policy`. The build stage never runs git, since a host stack builds from a `git archive` export without `.git`.
- **The stack's `edge`** gains listener 8087, published at `127.0.0.1:${H4_SITE_PORT}` (x005). Its `/` proxies to `web:8080`; its `/api/room/events` proxies to `gateway:8080/room/events` with `limit_req` (10 a second, burst 20, per stack) and a 512-byte body cap; anything else under `/api/` is 404 until the conversation exists.

- **What group 1 found** (2026-10-18, in the same commit as the code; the contract holds):
  - **The agents' engine refused x005.** Its admission plugin lets dev-cpu publish only 18300–18304 and row E15's 18999 (spec 000's contracts/agents-engine.md, A21), so dev-cpu's `edge` could not have started. Group 1's patch widens `PUBLISH_PORTS` in `deploy/agents-engine/authz.py` to 18305, with its tests, and adds x005 to `prove-limits.sh`'s row E14 and its port list; the Author reinstalls the plugin with the engine's setup. prod's and dev's x005, 18005 and 18105, stay refused on the engine, as their other ports are.
  - **The gate builds the web image too,** after the gateway's, as prod's variant (`ROOM_DRAFTS` empty), when the export has `apps/web/Dockerfile`, in the same patch.
  - **A default `policy` stage.** `apps/web/Dockerfile` declares `FROM scratch AS policy`, which `web_image.py`'s named context replaces. A build without the context, such as the gate's, gets an empty policy, so every content file is a draft, and Docker never tries to pull an image named `policy`.
  - **Preflight:** P3 lets prod's `H4_WEB_SUFFIX` be empty (its value), and P21 watches `apps/` for uncommitted changes, beside `services/`.

[contracts/web-serving.md](contracts/web-serving.md) has the ports, the headers, and preflight's new checks.

## 2. The resume: source, checks, and two renderings (User Story 1; FR-013 to FR-019; R-05, R-06)

- **The source:** `apps/web/content/resume.yaml`, per [contracts/resume-source.md](contracts/resume-source.md): a header, sections, and items. Each item carries its display text, its citations (corpus file and quoted span), and its slots.
- **The citation check** (`build/content.ts`, run by `npm run build` and by `make test`):
  - each quote is found in its cited file, inside one tagged sentence;
  - that sentence's tag is sufficient for its kind of claim;
  - the sentence isn't under a "Do not claim" heading;
  - every digit in the display text sits inside a `{{slot:…}}`, and every slot exists in `corpus/facts/`;
  - the display text holds no forbidden phrase: no "Do not claim" key phrase, no surname, and no private-denylist phrase (C9, the narration's N3 applied to the resume). The display text is the Author's wording, so the citations prove where it comes from, and C9 proves it doesn't say what the corpus forbids.
  It fails the build with the item's ID and the reason, never printing a private phrase.
- **The header** (FR-017):
  - **The interactive resume** shows what the conversation rule allows: no surname.
  - **The PDF** shows the full name and one contact channel, from two slots the Author fills in `assets/policy/resume-header.json`, a human-only file outside `corpus/`, read from `main` like the approvals. They can't be corpus facts: the corpus's denylist check fails any public corpus file that holds the surname, and the intake's ruling is that "The denylist keeps it out of the corpus" (spec.md's Assumptions).
  - While either slot is empty, the PDF's header is the interactive one.
- **Staleness** (FR-016): `apps/web/content/resume.lock.json`, committed, records the SHA-256 of every corpus file and facts file the resume and its scripts read. `make test` recomputes them and fails when the corpus has changed since the lock, naming the changed file; rebuilding the content rewrites the lock, and the changed content becomes a draft again until it's approved.
- **The PDF** (`build/pdf.ts`, R-06): tagged, `en-US`, the vendored font embedded, only `Title` and `Author` in its properties: no dates, no producer or creator, and no XMP metadata stream, so the same source and policy build the same bytes. Its test extracts the text with pdf.js and compares it with `room-data.json`'s, claim for claim.
- **The interactive resume** (`src/resume/`): an HTML list of sections and items, each item a button; it is reachable from the room's "Resume" control and from the choice screen's "Download the resume (PDF)" link, which works without entering the room (FR-018).
- **The first draft:** an agent drafts `resume.yaml` from the corpus's "Role at a glance" and topic sections, cited, and files it in `corpus/proposals/` for the Author. It ships as a draft until approved (§3).

## 3. Approvals (FR-012, FR-052; R-08)

- **`assets/policy/content-approvals.json`** (human-only, created by the Author's patch before the first draft is committed) lists the approved resume source's and each script's SHA-256, with the date. It sits beside spec 003's likeness approvals, `assets/policy/approvals.json`, and follows its rule: it's read from `main`, never from the branch being built, so a branch can't approve its own content ([contracts/resume-source.md §5](contracts/resume-source.md#5-approvals)). The same patch creates `assets/policy/resume-header.json`, the PDF's two header slots, empty.
- **Read on the host:** `web_image.py`, and the checkout's `build/policy.ts`, read both files with `git show main:` and hand them to the build as a policy directory. The image's build stage never runs git (§1).
- **The build** marks every unapproved file as a draft in `room-data.json`. The room shows drafts only when built with `ROOM_DRAFTS=1`, which `web_image.py` sets only for the `-drafts` images of dev and dev-cpu, never for prod's. Drafts show a "Draft, not approved" banner.
- **The gate's check** (human-only): `tools/gates/content_check.py`, a step in the Author's gate and in `make check`, recomputes each content file's digest and reads `main`'s approvals itself, then fails when `room-data.json` publishes anything `main` doesn't approve. `apps/web/build/approvals.ts` is agent-editable, so this check, not it, is the enforcement, as spec 003 enforces its intake from human-only gate code.
- **The release:** spec 001's `make release` must refuse a build with a draft or with `placeholders: true`. That's a line for spec 001's plan, recorded in the note.

## 4. The room (User Story 2, User Story 5; FR-001 to FR-009, FR-042 to FR-048; R-03, R-04, R-11, R-13)

[contracts/room-scene.md](contracts/room-scene.md) has the screens, the object IDs, and the timings. In outline:
- **The choice screen** (`src/choice/`) holds:
  - the path (two radio buttons) and the avatar (four, intent 000's placeholders: "a generic woman, a generic man, a generic dinosaur, a generic dog");
  - the AI disclosure, with its line about the cloned voice wherever the twin speaks aloud;
  - the data-flow disclosure link, and the PDF link.

  Nothing else plays until both choices are made (FR-001). The state lives in a module-level object, gone on reload (FR-002, FR-003).
- **The scene** (`src/room/scene.ts`): a fixed camera framing the desk, laptop, and screen; the snowboard on the left, the bicycle on the right; the window with its artwork above; the view of a fence and a tree. All are placeholder geometry with labels. The twin's figure stands at the desk, and the visitor's avatar stands in front. In portrait, the camera's field of view keeps everything on screen without scrolling (FR-047).
- **The objects** `snowboard`, `bicycle`, and `laptop` are each a mesh, a raycast target, and an HTML button in the accessible "In the room" list, with one handler per ID.
- **The hand-off** (R-13): at most 4.5 s, unskippable, announced in a live region, with a 1 s crossfade under reduced motion. Afterwards it offers "Read the resume now" or "Keep it for later", and keeps a "Resume" button in the room's toolbar from then on (FR-009).
- **Quality and the 2D mode** (R-04):
  - **Quality:** the controller steps down before the targets are missed, and switches to the 2D mode at spec 003's floor.
  - **The 2D mode** (`src/room/flat.ts`) is an inline SVG drawing of the same work area, with the same buttons at the objects' positions. The hand-off is a three-frame still sequence of the same length.
  - **The switch:** a visible "2D view" control switches at any time. A WebGL capability check before the 3D chunk loads decides the starting mode (spec 003 FR-023).
- **Context loss:** on `webglcontextlost`, the room tries one restore, else switches to the 2D mode with the visit's state kept.

## 5. Narration (User Story 3; FR-011, FR-012; R-07)

- **Scripts:** `apps/web/content/narration/<item-id>.<path>.md`, front matter with the citations, then the words. The build requires one per item per path (FR-016) and checks each as the resume's items are checked, plus the forbidden-claim list ([contracts/narration.md](contracts/narration.md) §2).
- **Eval cases:** the build writes `evals/narration/cases/narration-<item-id>-<path>.yaml`, one per script, in spec 000's case format (`fake_response` is the script itself; `expect` holds the citations' key phrases and the public "Do not claim" phrases, never a private-denylist phrase or the surname). They're their own suite, `narration`, which `make evals` runs on the fake adapter and `evals/run.py` refuses with any other, so a local or Bedrock run can't send them to `/hello` or charge prod's meter.
- **Display:** selecting an item starts the display within 1 s; words appear at 160 a minute in a region beside the item, with the whole text in a polite live region; selecting another item stops it (FR-011). A "Voice" toggle appears only when the build holds audio for the script (Phase 2).
- **Drafts:** an agent drafts the scripts from the cited corpus, for both paths, as proposals; they're drafts until approved (§3).

## 6. Usage events and the dashboard (User Story 6; FR-054, FR-056; R-10)

- **The browser** sends `{kind, id}` with `sendBeacon` for the kinds in [contracts/room-events.md](contracts/room-events.md): `object_selected`, `item_selected`, `resume_opened`, `resume_kept`, `pdf_downloaded`, `turn_sent`, `voice_pressed`, and `mode_2d`. There's no text, no path, no avatar, no visit ID, and no time: the server's clock gives the time.
- **The gateway's `POST /room/events`** validates the kind and the ID against `config/room-events.yaml`, a committed file the build generates from the same source as `room-manifest.json` and `make test` keeps current. The gateway reads it at start from its mounted `config/`; `apps/web/dist/` is gitignored, so it isn't in a host stack's export, and compose binds only `deploy/` and `config/`. It increments `h4.room.events{kind, id}` and answers 204. Anything else is 400, counted by kind of refusal, with no body logged. It has its own listener path, so spec 000's admission, meter, and model routing never see it.
- **The dashboard's "Room" row** shows:
  - **built now:** use per object and per item per day, PDF downloads, the 2D share, and turns sent;
  - **when conversations exist:** cost per room feature, latency, and degraded responses by cause (FR-056's other panels), from the gateway's existing `h4.cost.usd` and degraded-cause series, labeled by a `h4.room.feature` attribute the turn endpoint adds.

## 7. Conversations and push-to-talk (User Stories 4 and 7; FR-020 to FR-031, FR-033 to FR-037): interfaces now, behavior later

- **The interface:** `POST /api/room/turn`, request `{feature, path, turns[]}`, response the twin's text or a fixed message with its cause class ([contracts/room-conversation.md](contracts/room-conversation.md)). The room calls it only when the manifest marks a topic ready, which none is: the twin's spec (Q1) implements the endpoint behind spec 000's gateway, with `h4.room.feature` on its spans.
- **Built now:** the fixed messages, and the room's handling of them (R-14). The text box and the talk button exist, are accessible, and degrade as the spec's degraded table says.
- **Waits for the twin's spec:**
  - each topic's evals and red-team cases (FR-050);
  - the step configuration (FR-033, FR-034);
  - the per-turn limits (FR-037), which need the Author's change to `config/budgets.yaml`'s input cap ([data-model.md §6](data-model.md#6-the-conversation-turn-later)).
- **Waits for a local recognizer:** push-to-talk's capture, and the recognition route on the local tier (FR-026 to FR-031), with the ADR on intent 000's sentence (Q2). Recognition, like the twin's voice, goes through the gateway: the kill switch read first (FR-035), a local adapter only, and each call recorded with its provider, model, audio seconds (characters for the voice), latency, routing decision, estimated cost, and room feature (FR-032; [contracts/room-conversation.md §4–§5](contracts/room-conversation.md#4-push-to-talk-for-the-push-to-talk-group)).

## 8. Data flows (FR-057, FR-058)

The rows go into `docs/data-flow-disclosure.md` with the change that creates each flow:
- **V1 (with group 1):** the browser to the stack's `edge` for the room's static files and the PDF. Loopback only until spec 001, so the only visitor is the Author.
- **V4 (with group 6):** usage events, with exactly the fields they carry.
- **V2, V3, V5, and the change to F1:** with the groups that create them, which wait.

The disclosure's line "No visitor data flows in this spec" belongs to spec 000's section, and stays. This spec's rows sit in a new section for spec 002.

**The disclosure page** (FR-004's link target): `apps/web/build/disclosure.ts` renders `docs/data-flow-disclosure.md` into `dist/disclosure/index.html` at build, and a test checks that its rows equal the Markdown's. This is the page spec 001's draft plans in its §8.1, built here first; spec 001's plan then serves it rather than building it.

## 9. Telemetry (FR-055)

- **The events route** emits its own server span with no body, and the counter.
- **The `web` image's nginx** logs method, path, status, and duration only, as `edge` does.
- **The browser** emits nothing but usage events.

## 10. Tests and proofs

| What | Where | Proves |
|---|---|---|
| The citation check | `apps/web/test/content/*.test.ts`, with fixture corpora | a quote outside its file, a gap-tagged or role-scope sentence (by the tag that opens its span), a "Do not claim" sentence, a bare number, a missing slot, and display text with a forbidden phrase each fail; a clean source passes (FR-014) |
| The PDF | `apps/web/test/pdf.test.ts` | the text equals the interactive resume's, claim for claim; the catalog's tags, language, title display, and two property keys (FR-013, FR-019, SC-002) |
| Staleness | `apps/web/test/lock.test.ts` | a changed corpus file fails `make test`, naming it (FR-016) |
| Approvals | `apps/web/test/approvals.test.ts`; `tools/gates/test/test_content_check.py` (in the patch) | an unapproved file is a draft; a draft is hidden without `ROOM_DRAFTS=1`; the gate fails a build that publishes an unapproved file, whatever the build's own code says (FR-012) |
| The image's variants | `deploy/scripts/test_web_image.py` | prod's tag never carries drafts; dev's and dev-cpu's do; the policy comes in as a named context from `main`; the build stage runs no git |
| The screens | `apps/web/test/ui/*.test.ts` (jsdom, axe-core) | the choice gate, reload, the hand-off's length, its live-region text, no skip control, reduced motion, the 2D switch, keyboard order, 0 axe violations (FR-001–FR-009, FR-042–FR-045) |
| The fixed messages | `apps/web/test/ui/talk.test.ts` | each object, the text box, and the talk button answer as R-14 says, and no network request leaves but events (FR-023, FR-039, FR-040) |
| Events | `apps/web/test/events.test.ts`; `services/gateway/test/integration/room-events.test.ts` | the payload is `{kind, id}` alone; unknown kinds and IDs are 400; the counter moves; no body is logged (FR-054) |
| Serving | `deploy/scripts/test_web_image.py`, `test_edge_site.py` | the image's build; the listener's routes, headers, and limits; preflight's port and suffix (FR-059) |
| Narration | `make evals` with the generated `narration` suite; `apps/web/test/narration.test.ts` | one script per item and path; citations; forbidden phrases, none written into a committed case; display within 1 s (FR-011, FR-012) |

## 11. Degraded modes

The spec's Degraded-Mode Behavior table holds. What this plan adds:
- **Before the twin exists,** the conversation's column of that table is the room's normal state: the fixed messages.
- **The `web` service down:** the stack's `edge` returns its own static 503 page on x005, saying the room is unavailable; the rest of the stack is unaffected, and nothing waits on `web`.
- **The events route refusing:** the room ignores it; usage panels undercount, and the refusal counter shows why.

## 12. Documentation and ADRs

ADRs are written with the group that makes each decision real (R-15). Their numbers follow the other specs' allocations: 0023 is the pin-rule proposal, spec 001's draft holds 0024–0029, and spec 003's plan 0030–0032.

| ADR | Decision | Group |
|---|---|---|
| 0033 | The room's stack: `apps/web`, Vite, Three.js, no framework | 1 |
| 0034 | Content approvals by hash, in a human-only file read from `main`, beside spec 003's likeness approvals | 2 |
| 0035 | Recognition on the local tier: the reading of intent 000's sentence (Q2) | 8 (waits) |

`apps/web/README.md`, the dashboard row's description, and quickstart.md's runs come in their groups.

## 13. Order of work, risks, and proof

**Task groups.** Each is a feature branch stacked on the one before, merged by the Author in order.

| # | Branch | What | Ready | The Author's part |
|---|---|---|---|---|
| 1 | `feat/002-web` | the workspace, the `web` image, the edge listener, `H4_SITE_PORT`, preflight, disclosure row V1 and the disclosure page, the stack's ADR | now | `make init-env SYNC=1` for the new port key; `make up` and open x005 |
| 2 | `feat/002-approvals` | the approvals and PDF-header files, their protection, and the gate's published-content check (Patch); the build's draft marking | now | apply the patch |
| 3 | `feat/002-us1-resume` | the source format, the citation check, the lock, the PDF, the interactive resume, the first draft and its proposal | now | read the draft and the proposal; approve by hash when satisfied; fill `assets/policy/resume-header.json` on `main` if wanted |
| 4 | `feat/002-us2-room` | the choice, the scene with placeholders, the hand-off, the 2D mode, the quality controller, the accessible layer, the fixed messages | now | the keyboard and screen-reader visits (SC-003), the phone (FR-047) |
| 5 | `feat/002-us3-narration` | scripts for every item and path, their checks and eval cases, the display | now | approve the scripts by hash |
| 6 | `feat/002-us6-events` | the beacon, the gateway route, the edge location, the Room row, disclosure row V4 | now | read the row after a visit |
| 7 | `feat/002-us4-conversations` | the turn client, topics' readiness, the feature attribution | waits for the twin's spec | — |
| 8 | `feat/002-us7-push-to-talk` | capture, the recognizer route, the ADR on intent 000's sentence | waits for the twin's spec and a local recognizer | — |
| 9 | `feat/002-voice` | voiced narration and the twin's voice | waits for ADR 0011 and the cloned voice | — |
| 10 | `feat/002-public` | the studio's assets in place of placeholders, and public serving | waits for spec 003's intake and spec 001's edge | — |

**Risks:**

| Risk | Mitigation |
|---|---|
| PDFKit's tagging doesn't satisfy a PDF/UA checker | The build's catalog test, and the Author's check with a screen reader (quickstart §3); Chromium's tagged print is the documented fallback (R-06) |
| jsdom can't show what a real browser does (layout, focus visibility, WebGL) | The Author's keyboard, screen-reader, and phone runs; the quality controller is unit-tested with a simulated clock |
| The resume's wording drifts from the corpus | The citation check and the lock fail the build; approval is by hash, so a changed file is a draft again |
| A drafts build reaches prod, or approvals never reach it (the review's blocker) | The tag carries the drafts flag and is never reused; the policy is read from `main` on the host, never inside the build stage; the gate's human-only check fails a build that publishes an unapproved file |
| Spec 003 plans its own asset loader and 2D mode | One controller (R-04) and one 2D mode, extended here; the two plans name each other, and the note asks the Author to confirm the split |
| Spec 001's draft plans `apps/web` too | This spec creates it; the note records the change for spec 001's plan |

**Proof.** [quickstart.md](quickstart.md) runs each group. Each group's note carries `make check`'s whole output and a reviewer's passes.

## 14. Requirement coverage

| Requirement | Where | Group |
|---|---|---|
| FR-001–FR-004 | §4 | 4 |
| FR-005, FR-006 | §4 (placeholders now; studio outputs in group 10) | 4, 10 |
| FR-007–FR-009 | §4 | 4 |
| FR-010, FR-011 | §2, §5 | 3, 5 |
| FR-012 | §3, §5 | 2, 5 |
| FR-013–FR-019 | §2 | 3 |
| FR-020–FR-022, FR-024, FR-025 | §7 | 7 (waits) |
| FR-023 | §7, R-14 | 4 (the fixed message now) |
| FR-026–FR-031 | §7 | 8 (waits); FR-040's degraded floor in 4 |
| FR-032–FR-037 | §6, §7 | 6 (attribution's panels), 7 (waits: the step configuration, and the per-turn limits by the Author's patch) |
| FR-038 | §11 | 3–5 |
| FR-039–FR-041 | §7, R-14 | 4 (fixed messages); 9 (voice) |
| FR-042–FR-048 | §4 | 4 |
| FR-049, FR-050 | §7 | 7 (waits), with the room's red-team cases |
| FR-051–FR-053 | spec 003's intake | 10 |
| FR-054–FR-056 | §6, §9 | 6 |
| FR-057, FR-058 | §1, §8 | 1, 6 |
| FR-059 | §1 | 1 |
| SC-001 | quickstart §4 | 3–5 |
| SC-002 | §2, §10 | 3 |
| SC-003, SC-004 | quickstart §4 | 4 |
| SC-005, SC-006 | quickstart §4, §5 | 4, 5 |
| SC-007 | waits: the answer's start in 7 (T081), the transcript's in 8 (T082) | 7, 8 |
| SC-009, SC-011 | waits | 7, 8 |
| SC-008 | quickstart §8 (a moderated test, with the room complete) | 10 |
| SC-010 | §6 | 6 (counts now; cost when calls exist) |
| SC-012 | quickstart §4 | 4 |
| SC-013 | spec 003 | 10 |
| SC-014 | waits | 7 |

## Constitution Check (post-design)

Re-checked: no new violation.
- **Principle I is met by construction:** the room's floor is static and built first.
- **Principle IV gains a guarded path:** approvals by hash, human-only, read from `main` on the host, and enforced by the gate's human-only check rather than the build's agent-editable code.
- **The one reading on record:** recognition's location (Q2), with its ADR when push-to-talk is built.

Verdict: **PASS**.

## Complexity Tracking

| Deviation or risk | Why needed | Simpler alternative rejected because |
|---|---|---|
| The Author's relaxed lifecycle (2026-10-17): recommended answers instead of an interview | The Author's direction | Waiting would leave the room unplanned overnight; every decision is listed for revisiting |
| A sixth loopback port per stack | The room needs an origin of its own, apart from the API port's admission and limits | Serving the site on the API's port would mix static files into the gateway's listener and its limits |
| Placeholders in a built room | The studio's outputs don't exist yet | Waiting for them would delay everything that doesn't depend on them |
