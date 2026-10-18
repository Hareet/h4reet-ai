# Research: The Room (spec 002)

Phase 0 output of `/speckit-plan`, written on 2026-10-18 under the Author's direction of 2026-10-17: "Let's relax some of the overnight rules so that you can continue with intent 002 and intent 003? I think you can create the tasks and implement them and we can always go back later and re-do a task or requirement if we highlight a needed change". One entry per decision the plan rests on: the decision, why, and what else was weighed. Where spec 000's plan would have interviewed the Author, the recommended option is taken and listed in [Decided by recommendation, revisit any time](#decided-by-recommendation-revisit-any-time).

**No `NEEDS CLARIFICATION` remains** in the plan's Technical Context. What stays open is measured in a named task (the PDF's accessibility check, the frame rates on the reference devices) or waits on a dependency the spec names (the twin's conversation core, the cloned voice, the recognizer, spec 001's edge, spec 003's assets).

## Decided by recommendation, revisit any time

| # | Decision | Taken | Entry |
|---|---|---|---|
| 1 | Where the room's code lives | `apps/web`, a new npm workspace; spec 001's draft plan builds its placeholder site on it instead of creating one | R-01 |
| 2 | The build and the 3D library | Vite (already pinned, 8.3.3), TypeScript, and Three.js, with no UI framework | R-02, R-03 |
| 3 | The resume's source, and who approves it | a YAML source in `apps/web/content/`, drafted by agents from the corpus, published only when its hash is in a human-only approvals file | R-05, R-08 |
| 4 | How the PDF is made | PDFKit in the build, a tagged PDF from the same source, a vendored open font | R-06 |
| 5 | How the room is served before spec 001 | a `web` service (nginx with the built site baked in) behind the stack's `edge` on a sixth loopback port | R-09 |
| 6 | Usage events | a validated gateway route that only counts, so no event is stored | R-10 |
| 7 | Placeholders | code-generated geometry and intent 000's four placeholder avatars as flat shapes; a build flag refuses a public release while any is in use | R-11 |
| 8 | What the room does while the twin doesn't exist | every topic "not ready": each object, the text box, and the talk button answer with the spec's fixed messages and call no model | R-14 |
| 9 | Where the PDF's full name and contact live | a human-only file outside `corpus/`, `assets/policy/resume-header.json`, read from `main`, never read by the twin (the review's finding: the corpus keeps the surname out) | R-16 |

---

## R-01: `apps/web`, a new workspace, created by this spec

**Decision.** The room is `apps/web`, an npm workspace beside `services/*` (the root `package.json`'s `workspaces` gains `"apps/*"`), with the same TypeScript, ESLint, Prettier, and vitest setup as the gateway (spec 000 plan §9). Its build output, `apps/web/dist/`, is a static site: HTML, JavaScript, CSS, fonts, and the resume's PDF.

**Rationale.** CLAUDE.md's Architecture names `apps/web` as "static site + 3D room (Three.js), served from the edge". Spec 001's plan is a draft, not implemented; it planned a placeholder `apps/web` in its task group 6. This spec builds `apps/web` first, so spec 001's site work becomes the public serving of what exists, plus its own pages (the disclosure, the status view). The note records that dependency so spec 001's plan is revised when it's approved.

**Alternatives.** A separate workspace per spec (`apps/room`, `apps/site`): two static builds on one origin, two copies of the same accessibility and font setup.

## R-02: Vite and TypeScript, no UI framework

**Decision.** Vite 8.3.3 (already in the lockfile, from spec 000's toolchain) builds `apps/web`. Plain TypeScript and DOM APIs for the interface: a handful of screens (the choice, the room, the resume, the conversation panel), each a module.

**Rationale.** The room's interface is small, and its accessibility rests on plain HTML elements (buttons, lists, live regions), which need no framework. Fewer dependencies is fewer pins, smaller downloads (SC-005's 3-second choice screen on 4G), and less to review.

**Alternatives.** React or Svelte: comfortable for larger interfaces, a dependency and a runtime for a small one. React Three Fiber: couples the scene to React.

## R-03: Three.js for the scene, with the DOM as the accessible layer

**Decision.** Three.js renders the work area into a `<canvas>` marked `aria-hidden`. Every object the visitor can select also exists as an HTML button in an "Objects in the room" list, focusable in a fixed order, which is what keyboards and screen readers use (FR-043–FR-045). A pointer on the canvas raycasts to the same object IDs and calls the same handlers, so the two paths can't drift. The exact Three.js version is pinned by the first task from the npm registry.

**Rationale.** CLAUDE.md names Three.js. A canvas has no accessible structure of its own, so the accessible equivalent is the DOM's, as FR-045 asks ("the 3D scene's objects reachable through their accessible equivalents").

**Alternatives.** Babylon.js: larger, with its own accessibility helpers, but CLAUDE.md names Three.js. A scene built from HTML and CSS 3D transforms: accessible by construction, but can't hold avatars and their animations.

## R-04: One quality controller for both specs' frame rules

**Decision.** The room's renderer measures frame times continuously. When the median frame rate over 5 seconds falls below the device class's target (30 on phones, 60 on desktops; FR-048), it steps down one quality level: pixel ratio, then shadows, then texture size, then simultaneous animations. At the lowest level, when it still can't hold spec 003's floor of 24 frames a second for 5 seconds (spec 003 FR-024), it switches to the 2D mode. A visible control chooses the 2D mode at any time.

**Rationale.** Spec 002's FR-048 sets the targets, and spec 003's FR-024 sets the floor and the step to 2D. One controller satisfies both. The 2D mode is spec 003's (the twin's still image, the disclosure, and chat), extended by this spec with the work area's still image and its selectable objects (FR-042).

## R-05: The resume's source: YAML items that cite the corpus

**Decision.** `apps/web/content/resume.yaml` holds the resume as a list of sections and items. Each item has:
- an `id`;
- its display text, in the words the Author approves;
- `claims`: one or more citations, each a corpus file and a quoted span of a tagged sentence in it;
- `slots`: the facts slots its text uses, written as `{{slot:<id>}}`, as the corpus itself does.

The build checks every citation against the corpus: the quote must be in the cited file, in a sentence whose tag is sufficient (`[A …]`, `[A-DOC …]`, `[A-BIO]`, `[A-CHAT]`, `[A-NOTES]`, `[C]`; not `[?]`, and not `[A-JD]`/`[A-SRE-JD]` or `[P]` alone for a claim about the Author's role), and not under a "Do not claim" heading. Every number in an item's text must come from a slot (FR-014). A slot that's empty renders its declared fallback or nothing, never an estimate.

Agents draft the source from the corpus and file a copy in `corpus/proposals/` (the corpus's own rule: "Agents may read it and propose changes in `proposals/`"). It is published only when its hash is approved (R-08).

**Rationale.** FR-013 asks for one source for both renderings; FR-014 for claims the corpus states with a sufficient tag; W3 for "it will match the corpus and facts". Citations make the match checkable by a deterministic gate, the way `corpus/tools/check_corpus.py` checks slots. The display text is the Author's choice of words; the citations prove it says nothing the corpus doesn't.

**Alternatives.** Generating the resume's text from the corpus by a model at build time: unreviewable wording, and a model call in the build. Writing the resume into `corpus/` itself: agents can't edit the corpus, and the resume is a rendering, not a source of truth.

## R-06: The PDF: PDFKit, tagged, from the same source

**Decision.** The build renders `resume.pdf` with PDFKit (pinned by the first task from the npm registry), from the same parsed source as the interactive resume:
- `tagged: true`, a structure tree in reading order (the document, headings, paragraphs, lists), `lang: en-US`, and `displayTitle: true`;
- a vendored open-licensed font, embedded, chosen for legibility (its file and license in `apps/web/fonts/`, pinned by SHA-256);
- the document properties hold only `Title` and `Author` (the name the PDF's header shows, FR-019): no `CreationDate` or `ModDate`, no `Producer` or `Creator`, and no XMP metadata stream (so no `xmp:CreatorTool` or `pdf:Producer`). Nothing dates the file or names its toolchain, and the same source and policy build the same bytes. PDFKit sets a producer, a creator, and a creation date by default, so the build overrides each, and the test asserts their absence.

The build's test extracts the PDF's text with pdf.js (a dev dependency, pinned) and compares it with the interactive resume's, claim for claim (SC-002). It also checks the catalog: `MarkInfo/Marked`, a `StructTreeRoot`, `Lang`, `DisplayDocTitle`, and the `Info` dictionary's keys.

**Rationale.** FR-019 asks for real, selectable text, a title, a language, and a tagged reading order, with nothing identifying in the properties. PDFKit builds tagged PDFs in plain JavaScript, so the build and its tests run anywhere vitest runs, including the agents' engine, with no browser.

**Alternatives.**
- Printing the interactive resume to PDF with headless Chromium, which tags PDFs: the same HTML, so the same words by construction, but a browser in every build and every test run, about 1.5 GB of pinned image on the agents' engine.
- Typst: a good typesetter with growing accessibility support, but a second toolchain.
- pdf-lib: no tagged-PDF support.

## R-07: Narration: prepared scripts, shown as text until the voice exists

**Decision.** `apps/web/content/narration/<item-id>.<path>.md`, one script per resume item per path (`engineer`, `non-engineer`). Each script:
- carries the same kind of citations as the resume's items (R-05), checked the same way;
- passes the narration checks: the citation check, the forbidden-claim check (each corpus file's "Do not claim" items, the surname rule, the private denylist when the build can read it, and the ownership verbs of `01`'s rulings), and the eval cases generated for it in a suite of their own, `evals/narration/cases/narration-*.yaml`, run by `make evals` on the fake adapter only. The committed cases hold only public phrases; the private denylist is checked at build time and never written to a file;
- is published only when its hash is approved (R-08).

The room shows the script's words as they would be spoken: word by word, at a speaking rate, starting within 1 second of the selection (FR-011), with the full text in a live region for screen readers. When the cloned voice exists (Phase 2, ADR 0011), the build adds one audio file per script, and the words follow the audio's timing.

**Rationale.** The spec's Assumptions take prepared narration (FR-012): it keeps the guided resume working with the local tier off, costs nothing at run time, and can be approved line by line. Until the twin's own evals exist (Phase 1), the narration checks are the deterministic ones this spec can own, plus product eval cases in spec 000's scaffold format.

**Alternatives.** Narration generated live on each click: metered, degraded with the twin, and not approvable in advance.

## R-08: Approvals: a human-only file of hashes, read from `main`

**Decision.** `assets/policy/content-approvals.json`, beside spec 003's `approvals.json` in its human-only policy directory, lists the SHA-256 of each approved resume source and narration script, with the date. A patch the Author applies protects it before the first draft is committed. Like spec 003's approvals, it's read from `main` (`git show main:<path>`), never from the branch being built, so a branch can't approve its own content. The build marks unapproved content as a draft: the room shows it only on dev stacks, with a "draft" banner, and `make release` (spec 001) refuses a release that contains a draft.
- **Read on the host, not in the build stage.** `web_image.py` runs `git show main:` on the host and hands the file to the image's build as a named build context; a checkout's build gets it from `build/policy.ts` the same way. A host stack's build context is a `git archive` export, and `.dockerignore` drops `.git`, so the same command inside the build stage would find no `main` and mark every file a draft (the review's first blocker).
- **Enforced by the gate, not the build.** `apps/web/build/approvals.ts` is agent-editable, so a branch could change how it decides. `tools/gates/content_check.py`, human-only, runs in the Author's gate and in `make check` after a build without drafts: it reads `main`'s approvals itself, recomputes each content file's digest, and fails when `room-data.json` publishes a file `main` doesn't approve. Spec 003 enforces its intake from human-only gate code the same way.

**Rationale.** FR-012 and FR-052 need the Author's recorded approval; agents mustn't be able to give it. A hash list in a human-only file is the smallest mechanism that does that, and the build can check it deterministically. Spec 003's plan does the same for likeness approvals (its FR-005, FR-016), in `assets/policy/approvals.json`, read from `main` (spec 003 plan §2–§3). This spec follows its pattern with a sibling file of its own shape, since a content approval confirms different things from a likeness approval.

**Alternatives.** The Author's commits as the approval (a commit by the Author touching the file): fragile to detect, and agents' commits carry the same name in this repository. A signature: no key infrastructure exists, and the Author's terminal already holds the only write access the approvals need.

## R-09: Serving the room on the local tier

**Decision.**
- **A `web` service** in `deploy/compose.yaml`: spec 000's pinned `nginx-unprivileged` image with `apps/web/dist/` baked in, built outside compose as T184 builds the gateway (`deploy/scripts/web_image.py`, `pull_policy: never`), but tagged per variant, `h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}` (empty for prod, `-drafts` for dev and dev-cpu), and rebuilt on every `make up` rather than reused. T184's reuse rests on prod and dev at one commit running the same code; this image also bakes in the drafts flag and `main`'s approvals, so reusing it would let a dev build with drafts run as prod's, or keep an approval from reaching prod (the review's first blocker). The layer cache keeps an unchanged rebuild to seconds.
- **The stack's `edge`** gains a sixth listener, internal port 8087, published on the stack's `127.0.0.1` at **x005** (`H4_SITE_PORT`: 18005 for prod, 18105 for dev, 18305 for dev-cpu). Port 8087 avoids 8085 and 8086, which spec 001's draft gives the tunnel's blocks.
  - `/` proxies to `web:8080`.
  - `/api/room/events` proxies to the gateway's new events route (R-10), with nginx's `limit_req` and a 512-byte body cap.
- **The cloud** (spec 001) serves the same `dist/` from its bucket, so the files the Author tests locally are the files visitors get.

**Rationale.** FR-059: the room runs on the local tier with the stack's one command. A built image keeps the run-time tree read-only and makes the served files part of the commit's build, as the gateway's are. Loopback only, as spec 000's rule for every port.

**Alternatives.** Mounting `dist/` from the working tree into `edge`: the served site would drift from the commit the stack runs. Vite's dev server in a container: a development tool in production.

## R-10: Usage events: counted, never stored

**Decision.** The browser sends each usage event with `navigator.sendBeacon` to `/api/room/events`, a JSON body of `{kind, id}` only. The gateway's `POST /room/events`:
- accepts only kinds from a fixed list and IDs from `config/room-events.yaml`, which the build generates from the same source as the room's manifest, commits, and keeps current through `make test`. The gateway reads it at start from its mounted `config/`. Reading `apps/web/dist/` instead wouldn't work: it's gitignored, so it isn't in a host stack's export, and compose binds only `deploy/` and `config/` into the gateway;
- increments `h4.room.events{kind, id}`, a counter;
- answers 204, and stores nothing else, logs no body, and makes no model call.

The metric's sample time is the event's time. Grafana's room panels read the counter (FR-056).

**Rationale.** FR-054: an event carries "only the event's kind, the object's or item's identifier where there is one, and the time". A counter keeps exactly that and nothing more, with bounded cardinality, since IDs come from the manifest. The gateway already holds the stack's telemetry setup and its edge-facing listener.

**Alternatives.** A new events service: one more container for one route. Browser OpenTelemetry: a large SDK, and a payload shape this spec would have to police.

## R-11: Placeholders until the studio's assets arrive

**Decision.** The work area's furniture and objects are code-generated geometry (boxes, planes, simple shapes), labeled as placeholders on screen. Intent 000's four placeholder visitor avatars are flat shapes with names. The twin's avatar is a simple standing figure with an idle sway. The build's manifest records `placeholders: true` while any is in use, and spec 001's `make release` refuses a public release with it. Spec 003's arrival check governs every real asset that replaces one.

**Rationale.** The spec's Assumptions: "the room may be built and tested with placeholder geometry and intent 000's placeholder avatars; it is deployed to visitors only with the studio's outputs". Code-generated placeholders need no asset files, so they bring nothing through spec 003's intake.

## R-12: Accessibility proof

**Decision.**
- **Unit and integration tests** in vitest with jsdom (pinned by the first task) and axe-core (pinned): every screen's DOM has 0 axe violations at WCAG 2.2 AA's rules axe implements; keyboard order; focus visibility (a computed-style check); the live regions.
- **The Author's runs** for what jsdom can't show: a keyboard-only visit and a screen-reader visit (SC-003), the 320-pixel portrait run (FR-047), and frame rates on the reference devices (SC-004).
- **Reference devices** (the spec's default): a mid-range phone released in 2023 or later, a laptop with integrated graphics from 2022 or later, and a 4G profile of about 9 Mbps down and 150 ms round trip, emulated in the browser's developer tools for SC-005.

## R-13: The hand-off

**Decision.** A scripted animation of at most 4.5 seconds: the twin turns, lifts a paper, and the paper travels to the visitor's avatar. A text line, "The twin hands you a paper: the Author's resume.", goes to a polite live region at its start. With `prefers-reduced-motion`, a 1-second crossfade replaces the motion. In the 2D mode, it's a three-frame still sequence of the same length. No control skips it (FR-007); it never exceeds 5 seconds (FR-008).

## R-14: The room before the twin exists

**Decision.** With no spec for the twin's conversation core yet (Q1's answer), every topic is "not ready". So, under the spec's own requirements:
- selecting an object answers with FR-023's fixed message, and calls no model;
- the text box sends nothing to any model, and shows FR-039's fixed message for the "service is unavailable" class;
- the talk button, on press, says voice isn't available yet and moves focus to the text box, without asking for the microphone (FR-040); FR-027 asks for the microphone only when a press can lead to recognition.

The conversation's interface (`POST /api/room/turn`, its request and its fixed answers) is specified in contracts/room-conversation.md, so the twin's spec can implement it without changing the room.

**Rationale.** These are the spec's degraded behaviors, so the room ships complete on its floor, and User Stories 4 and 7 add only what their dependencies bring.

## R-15: ADRs

**Decision.** Written with the task group that makes each decision real. ADR 0034 (approvals) also records R-16's header file and the gate's content check. The ADR index is shared: 0023 is the pin-rule proposal, spec 001's draft holds 0024–0029, and spec 003's plan 0030–0032, so this spec's start at 0033.
- **0033**, the room's stack: `apps/web`, Vite, Three.js, no framework (R-01 to R-03), with the first group.
- **0034**, content approvals by hash, read from `main`, beside spec 003's likeness approvals (R-08), with the approvals group.
- **0035**, recognition on the local tier: the reading of intent 000's sentence (Q2's answer), with the push-to-talk group.

## R-16: The PDF's full name and contact, outside the corpus

**Decision.** The PDF's two header values (Q3's answer: the full name and one contact channel) live in `assets/policy/resume-header.json`, a human-only file beside the approvals, created empty by the approvals patch, filled by the Author, read from `main` on the host like the approvals, and never read by the twin. While either is `null`, the PDF carries the room's header (FR-017).

**Rationale.** FR-017 says "each from a filled facts slot", and the first plan proposed them as corpus facts slots. But the corpus keeps the surname out of every file the twin reads: `corpus/tools/check_corpus.py`'s rule 4 ("If intake/private/denylist.txt exists (gitignored, local only), none of its phrases may appear") fails a public corpus file that holds it, and the intake's ruling is that "The denylist keeps it out of the corpus". A slot in `corpus/facts/` would either fail that check or put the surname where the twin can read it. A human-only file outside `corpus/` keeps both: the Author's PDF header, and a corpus without the surname. The spec's Assumptions record this reading of FR-017's "facts slot".

**Alternatives.** A corpus facts slot: it collides with the denylist (above). A value in the Author's env file: the build reads no env file, and a release must build the same bytes from the repository.

## Rejected for now, revisit later

- **Live narration** (R-07): one line to reverse if the Author prefers it.
- **A per-path dashboard split:** usage events carry no path (FR-054); splitting would add the path to events and a disclosure change.
- **Browser speech recognition:** Q2's answer (A).
