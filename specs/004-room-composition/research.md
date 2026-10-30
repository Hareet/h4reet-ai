# Research: Room Composition (spec 004)

Phase 0 output of `/speckit-plan`, written on 2026-10-22 for [spec.md](spec.md). One entry per decision the plan rests on: the decision, why, and what else was weighed. The plan is [plan.md](plan.md); the shapes are in [data-model.md](data-model.md) and `contracts/`; the runs are in [quickstart.md](quickstart.md).

**How the decisions were taken.** Three explorations read what spec 004 extends: spec 002's room on `feat/002-us6-events` (dc7f023); spec 003's intake on `feat/003-us5-comparison` (0b13887), with its guard and arrival-check patches, both the Author's and both unapplied; spec 001's plan on `spec/001-cloud-elevation` (00309c4); and `main` (58bd232). Three designs followed: the data and the compositor; the runtime, lookdev, and serving; and the integration. The plan the Author approved reconciles them. Where a design differed, the approved plan's decision is the one recorded here, and the design's own form is listed among the alternatives where it was a real one. The readings the Author approved with the plan come first.

**What the exploration found,** which shapes every group: everything spec 004 extends is unmerged; the Author's gate never runs `make check`, only a fixed tuple that includes `make test`, in a container with no `.git` and no network; spec 003's rule A1 refuses any committed image or model outside `assets/`; spec 002's `approvals.ts` throws on a `room-text` kind; five web tests and one gateway test pin the three object IDs (the plan's checks found two more gateway tests that do, and eight that hold the client label "author-laptop"; R-16); the CSPs refuse `style` attributes and `blob:` URLs; the web image's nginx has no gzip and no `.glb` type; and Chromium-family browsers refuse module scripts and `fetch` from a local file.

**Paths.** A file on another branch is named in a code span, never linked. `apps/web/**`, `config/room-events.yaml`, and spec 002's documents are on `feat/002-us6-events` unless an entry says otherwise; `scripts/assets/**`, ADRs 0010 and 0030 to 0032, and spec 003's documents are on `feat/003-*`; `assets/policy/**`, `tools/gates/arrival_check.py`, and `tools/gates/content_check.py` exist only inside the Author's unapplied patches (spec 003's guard and arrival-check patches, spec 002's approvals patch); spec 001's contracts are on `spec/001-cloud-elevation`. A path on no branch is one this plan creates.

**Numbering.** R-01 onward are this spec's. Another spec's research is named with its spec: FR-015's "research R-03" is spec 003's, and Amendment B13's R-04, R-11, and R-15 are spec 002's.

**No `NEEDS CLARIFICATION` remains.** Each unknown the exploration found is resolved by an entry, verified, or named as one of the Author's actions; the last table maps them. What stays open is measured in a named run (the reference phone's frame rates and memory, the look) or waits on a dependency the spec names (spec 001's relay and release, the twin's conversation core, the corpus, and the studio's files).

## Readings approved with the plan

| # | Reading | Taken | Entry |
|---|---|---|---|
| 1 | FR-064's smallest supported stages | 304 × 248 (a 320 × 568 screen in portrait) and 326 × 208 (568 × 320 in landscape), plus a sweep of screen sizes | R-19 |
| 2 | The shape of `caps.json`'s room caps (Amendment C7) | one block, `per_asset.room`, with six keys; unknown keys refused | R-25 |
| 3 | The disclosure's row IDs (Confirmation 17) | the first row written keeps its ID, so spec 001's planned V2 to V5 become V7 to V10 | R-62 |
| 4 | The order of the two lines | line I (the guard, the settings check, the intake) merges before line R's branches | R-49 |
| 5 | ADR 0010 | stays proposed until lookdev records the look; if the Author accepts it first, ADR 0037 amends it | R-44, R-63 |
| 6 | P-10's gate step | a `studio-settings` host step runs the settings check on branches that bring studio files in | R-52 |
| 7 | If P-5 slips | FR-077's order holds: P-7 doesn't land ahead of P-5, and User Stories 1 to 3 and 7 wait to merge | R-50 |
| 8 | FR-069's option B | recorded only if the phone probe fails | R-42 |

One reading departs from the approved plan's words, to follow the spec, and is the Author's to confirm. The approved plan's 'When any is set, the room shows final frames, stops polling, and the text copy reads "Paused at HH:MM"' is read per FR: reduced motion stops motion only (FR-044 polls while the page is visible and the room isn't paused); a hidden page stops polling too; only the pause shows "Paused at" (FR-060) (R-34).

**The Author's actions the plan names:** confirm IPTC's term for human-made digital art before P-5 (R-53); fill the studio folders into P-1 (R-50, R-51); read the licences for P-6 (R-54); and name `small_props` (R-25, R-54). Added on 2026-10-23, by the remediation of the `REVIEW.md` pass, and due now: the interim deny of the outputs and workflows folders (R-51), and the check of the studio session's routes to ComfyUI's port since 2026-10-22 (R-52).

## The studio checks of 2026-10-22

The spec's Input names checks made outside this repository on 2026-10-22 and says this file records the conclusions the spec relies on. They are recorded in the words the spec carries.

| Check, 2026-10-22 | What the spec relies on | Carried by |
|---|---|---|
| The Langfuse name | "a research reading, not legal advice": plain 'Langfuse' in text is 'normal nominative use'; as the glowing title over the counters, 'the word claims Langfuse is where the numbers come from' and 'leans toward the "sponsorship, endorsement" impression the brand page forbids'. Its recommendation was a neon word that says what the numbers are ('COST' or 'SPEND'); it calls answer 6's "Langfuse" 'defensible but less clear at a glance' with a visible second label | FR-046, FR-047, FR-049, Confirmation 1; R-32, R-38, R-40 |
| The per-call cost | a refused turn (a 4xx answer, 429 included) provably costs $0 | FR-048; R-32 |
| The chalkboard typeface | it quotes spec 002's one-font rule, `apps/web/fonts/README.md`'s "No other font is used", which B10 amends; Confirmation 7 then takes Patrick Hand (SIL OFL 1.1, no reserved font name), with Kalam the runner-up | B10, FR-033, Confirmation 7; R-38 |
| The photos and the guard | the guard needs `feat/003-guards` on `main` first; the spec's Assumptions ("Already past") and FR-077 set the rest of the guard's timing | FR-025, FR-077; R-50, R-51, R-52 |
| The studio's contract, given to its session that day | "a step you scripted is a model step"; and "Only a mesh that the same run has stripped to geometry" leaves the photos folder, which the reviewed outlines widen | C1, C8, FR-024, FR-025, FR-032; R-53, R-59 |

## Principles these decisions touch

Applied against the [constitution](../../.specify/memory/constitution.md) 1.0.1.

| Principle | Touched | Where |
|---|---|---|
| I. Data-local by default | Yes | the status poll, same-origin and storing nothing (R-31); the cost inside the turn's reply (R-32); rows A4, B6, and D4 in their changes (R-62); the guard, the settings check, and the outline check (R-51, R-52, R-56); no Claude session reaching ComfyUI's port, and photo work's side files kept in the photos folder (R-51, R-52, R-59); a phone copy that opens no path (R-42); degraded modes before happy paths (R-10, R-28, R-30, R-34, R-37) |
| II. Production-grade or not shipped | Yes | tests for every decision (R-65 to R-70); no new event kind, and §7.9 written now (R-60, R-61), under the spec's named deviation until spec 001; cost measured (R-24) |
| III. Intent, spec, code; humans merge | Yes | no agent merges, `plan.md` in each line's tree (R-48, R-49); the Author's patches in order (R-50); ADRs (R-63) |
| IV. Least privilege | Yes | human-only changes as the Author's patches, adding denies and checks, apart from P-5's and P-9's approved admissions (R-50 to R-57) and P-11's admission of SC-004's dev-only harness at the compose policy, its disclosure rule kept whole (R-70; the spec's Amendment Z1); no CSP widened (R-29); no inbound path (R-42); no host allowlisted for the IPTC check (R-53) |
| V. Cost is a first-class signal | Yes | $0 model spend (R-33); caps from `main`, never raised by agents (R-13, R-25); the visitor's own turn costs (R-32); the report in every room note (R-24) |
| VI. Build in public | Yes | the catalog, work orders, photo guide, and room text are public (R-14); notes print folder names, never paths (R-52) |
| VII. Say exactly what you owned | Yes | the mark follows the record, the `design` source, `likeness` read per file, scripted steps credited as model steps (R-53); row D4 (R-62) |
| VIII. Honest AI | Yes | word checks (R-15); unready topics call nothing (R-33); the tier's sentences speak about the machine (R-30); the red team's cases (R-64) |
| Security and agent governance | Yes | the agent-configuration evals after P-1, P-2, P-4, and P-7, and stage E after P-1 and P-2 (R-50, R-51, R-55); the order test (R-58) |

**Deviations:** none beyond the spec's own (its Assumptions, "Deviations"). FR-069's option B, Q1's named fallback, departs from the intent's order, not from the constitution, and is recorded only if the phone probe fails (R-42). The expected cost and the degraded modes stay the spec's tables; R-24 measures the cost.

---

## Data and IDs

Shapes: [data-model.md](data-model.md) and [contracts/room-data-files.md](contracts/room-data-files.md).

### R-01: The data's kinds, one file per kind, parsed strictly (FR-001, FR-005)

**Decision.**
- The room's data lives under `apps/web/room/`: `catalog/<piece>.yaml` (one file per piece, its stem the piece's ID); `scene.yaml`; `topics.yaml`; `ui-words.yaml`; `looks/<look>.yaml`; `fixtures/<id>.yaml` and `lookdev.yaml` (the vignette and the desk close-up), read by drafts builds and tests only; and a `README.md` on adding a piece.
- Room text sits with the other approved content: `apps/web/content/room/<block>.yaml` and `apps/web/content/room/outlines/<sign>.outline.json` (R-06).
- YAML is parsed as spec 002's `build/content.ts` parses content (the core schema, unique keys, no merge keys, aliases refused) and validated by zod 4.6.5's `z.strictObject`, the gateway's pin, declared in `apps/web`'s own devDependencies because the image installs only that workspace. A key the schema doesn't define, or a value outside its type, is refused; no value is evaluated as code.
- Units are metres and degrees, +Y up, the front facing +Z (FR-015's axes).

**Rationale.** FR-001: a change to one kind touches no file of another. `z.strictObject` is FR-005's refusal of undefined keys. Spec 002's content check already scopes `apps/web/content/`, so room text there needs no second root.

**Alternatives considered.** One `room.yaml` (breaks FR-001). JSON data (no comments to explain a placement). Room text under `apps/web/room/text/` (a second root for the content check). Hand-written validation like `content.ts`'s (more code for the same refusal).

### R-02: IDs: one grammar, four namespaces, retired IDs, and a closed vocabulary (FR-004, FR-007)

**Decision.**
- Every ID matches `^[a-z][a-z0-9-]{1,40}$`, the grammar the gateway already applies to `config/room-events.yaml`'s objects. Pieces, placements, selectables, and topics are four namespaces, each unique within itself.
- `scene.yaml`'s `retired` list holds `{id, kinds, retired, reason}`, `kinds` defaulting to all four; RI3 refuses any current entry of a listed kind that takes a retired ID.
- RI5 refuses an ID equal to a word of the code's closed vocabulary (`src/room/compose/vocabulary.ts`: behaviour kinds, renderers, signals and their values, roles, shapes, look methods), so code can name the role `twin` while the placement has its own ID, and the source scan (R-16) never flags vocabulary.
- RI6: at most 64 selectables (the gateway's cap), and a placement belongs to at most one selectable.
- FR-004's "its dashboard history stays" reads as: a retired ID leaves the events file, and its series stays in Prometheus for spec 000's 30-day retention.

**Rationale.** Retirement is checked from the scene file alone, with no history. The selectable `laptop` keeps its series through a retarget (Amendment B3).

**Alternatives considered.** One global namespace (forces IDs like `bicycle-piece`). Retirement per kind only (weaker than FR-004: "An ID SHALL never be reused for a different thing").

### R-03: The catalog entry (FR-002, FR-021, FR-051, FR-078; Amendment B13)

**Decision.**
- An entry holds the measured size, marked `estimated` where it came from an estimate (the exception of 2026-10-22 among them); its stylized scale (1 for a piece FR-051 doesn't enlarge); its origin, a named physical point from the dimension sheet, with the expected bounds around it; named anchors, each optionally estimated; live faces (role, position, size, facing, pixel size); glows; the signal value it claims, if any; stand-in shapes; a 2D vector drawing; a budget; at most one model; and its work order (method, shots, measurements, studio notes, material notes).
- Stand-ins come from a closed shape grammar (box, cylinder, capsule, sphere, torus, plane, circle, a tube between two points, polygon), each with a size, position, turn, scale, and colour: spec 002's R-11 placeholders become catalog stand-ins (B13).
- At most one model per entry: one GLB, or one image card. A state that needs other geometry is another placement (FR-020), so spec 003's per-file cap (F2) and FR-053's per-piece cap measure the same file.
- The neon sign's entry has three live faces, its word panel and two counter panels (FR-021).
- Every estimated value adds a "Measure" line to the piece's work order (FR-002).

**Rationale.** FR-002 lists the fields. One model per entry keeps the fit, the budget, and the work order per file.

**Alternatives considered.** One file per state of a piece (a per-piece cap would sum files that never load together). Anchors and faces as glTF `extras` (FR-015 refuses extras, and the room couldn't read them before the model loads).

### R-04: The scene file (FR-003, FR-004, FR-008, FR-020, FR-040, FR-043, FR-045)

**Decision.**
- **Placements:** an ID; a piece; a mount (`on` a placement, at a named `anchor`, with an `offset` and a `turn`, optionally `estimated`); whether the camera frames it; a label; a role (`twin` or `visitor`) for the figures; and bindings, each live face's regions to a renderer and a source (a room-text block, the resume's titles, UI words, or a signal), and each glow to a tone or a signal. Only the room's shell has no mount.
- **Switches:** a signal, its piece, a case per value placing a pose and setting glows, and the cable's run (`from` the case's lead end, `to` a placement's anchor, with a sag). RS1: every value has a case, and the laptop's switch has no default. RS3: the pose that claims `local` appears only in the `local` case, and the cloud pose only in `cloud`'s (FR-043). RS4: unknown, paused, not-live, resting, budget, and unavailable share one pose that claims nothing (Q2's answer). Each value keeps its own case, so splitting a pose later is a data edit.
- FR-040: the laptop, its screen, and the plugged pose's plug mount on the stand.
- **Selectables:** an ID, a visible name, member placements, and an action: talk (a topic, and an optional lead) or open the resume.
- **The hand-off:** its two anchors (the twin's hand and the visitor's); the hand-off and the paper stay code (FR-008).
- **The live configuration:** the status source (`off` or `site`), the poll interval (`poll_s`, 30 s), the freshness window (`freshness_s`, 35 s), the turn route (`off` or `site`), and the asset events (`off` or `site`); the 5 s timeout and the 120 s backoff cap are code constants ([tier-signal.md](contracts/tier-signal.md) §1). RL1: `poll_s` an integer from 30 to 120 (A1's two requests a minute), and `freshness_s` at least `poll_s` + 5 (FR-042). RL2: a status source of `site` needs the room's polling on disclosure row V7 (R-62, FR-074).

**Rationale.** FR-003's "everything mounted on it moves with it" is a tree of mounts. FR-043's refusal is a property of the cases, so the compositor can check it. FR-045's switch-on is a data edit in the change that serves the status, and RL2 ties it to the disclosure.

**Alternatives considered.** World positions per placement (a parent's move would carry nothing). The live configuration in code (a switch-on would be a code change, and RL2 would have nothing to read).

### R-05: Topics, UI words, looks, and fixtures (FR-029, FR-033, FR-036, FR-037, FR-049)

**Decision.**
- **Topics:** an ID, the phrase the fixed message uses, the Author's words it came from (`words_from`: a file and a quote), and its corpus files; a corpus file may not exist yet, and the topic then stays unready. Readiness stays the twin's spec's. FR-036's defaults: hobbies and travel adventures, opened by the bicycle and by the snowboard with its lead of winter hobbies first (answer 1); the Author's mission, opened by the chalkboard (answer 3); work projects, opened by `laptop` (answer 10).
- **UI words:** `{key: text}` over a closed key list in code (`src/room/ui-keys.ts`), with declared slots (`{time}`, `{amount}`, `{name}`); `{topic}` stays the slot of spec 002's `messages.yaml`. Reviewed as spec 002's `messages.yaml` is, and checked by C9, C6, and C8 (R-15), which `messages.yaml` never was. The neon sign's word and labels, the tier's sentences, the stand-ins' labels, and "Paused at" are UI words.
- **Looks:** a method (inked cel, the default, answer 2), a palette, lights, outlines, glow tones, a typeface per renderer among the vendored families (R-38), and the material notes the work orders carry.
- **Fixtures:** a named sample of both signals (a tier, and a list of turns), for drafts builds and tests only; every figure they feed reads "Sample" (FR-049).

**Rationale.** FR-036 makes topics data, and FR-033 makes the chalk face "changed as data among vendored typefaces". A closed key list lets the compositor refuse a missing or unknown UI word.

**Alternatives considered.** Topics inside the scene file (a retarget and a topic edit would share a file, against FR-001). UI words in `messages.yaml` (spec 002's closed set of conversation messages, with no word checks).

### R-06: Room text and the traced outlines (FR-029, FR-030, FR-032, FR-033, FR-052; Amendment B9; Clarifications)

**Decision.**
- One file per drawn block: the monitor's terminal half and its desktop half, each chalkboard block, and each sign's lettering. A block holds its renderer, an `exclude` list (the chalkboard's: the phrases that name Seva), its `words_from`, and lines, each a `text` with optional `about_author`, `claims`, and `pending`. A line holds no slot (RT3), so a published string equals its approved value; the monitor's note that it is a scripted illustration is the UI word `around.illustration`.
- Every displayed string sits under a `text` key, and no other key is named `name` or `title`, so the content check's key pattern (`text|title|name`) finds exactly the displayed values.
- A pending line, whose corpus words don't exist yet, never renders and never reaches `dist/` (FR-033).
- The outline file's schema is exactly `{schema: 1, sign, words, intent_ref, source: {type: photo|design, id}, tool: {name, version, license}, view_box, cap_height, advance (optional), paths: [d]}`: `words` is the sign's sentence exactly as the Author wrote it ("I am very busy", "my dog thinks i'm cool"), `intent_ref` points at it in the intent, `source.id` is opaque, `cap_height` is in the view box's units, and each `d` is SVG path data, commands and numbers only. The Author's `outline_check.py` checks it inside the photos folder (R-56), and the compositor checks it again on arrival.
- `.prettierignore` gains `apps/web/content/room/outlines/`, since reformatting an approved file changes its hash; room-text YAML passes `make fmt` before the Author approves its hash.
- Agents draft room text. A draft shows only in drafts builds, marked as a draft; the Author approves each file's SHA-256 on `main` with the kind `room-text` (R-57).

**Rationale.** FR-030's "every displayed string under a displayed-value key", read against the content check's existing pattern; FR-032 names the outline's fields, and the fourth clarification adds the traced source.

**Alternatives considered.** Committing the tracing tool's SVG (an SVG can carry images, links, metadata, and file names; JSON with fixed fields is checkable by a standard-library script). Widening the content check's key pattern (a larger human-only patch for no gain).

### R-07: Today's room as data first, then FR-078's room (FR-078, FR-002, User Story 1 scenario 5; Amendments B1, B2, B3, B7)

**Decision.** Two data commits.
1. The catalog and scene reproduce spec 002's room exactly: its layout, `scene.ts`'s shapes, its labels, its 2D drawing (converted once into catalog drawings), and its three selectables. A one-off comparison, within 1 mm per box, goes in the merge-request note; no test pins it.
2. FR-078's default room: the stand, the ultrawide monitor, the neon sign, the charger's poses, the chalkboard and its selectable (B3; the events file gains `chalkboard`, B7), and the two signs, with every estimated size and position marked. W1's sides become the snowboard's and the bicycle's default placements (B1). The measured layout replaces the estimates in Polish.

**Rationale.** User Story 1's fifth scenario keeps spec 002's room until the measured layout replaces it, and the first commit shows the migration lost nothing. A permanent pin would make every later move a test change, against FR-006.

**Alternatives considered.** Going straight to FR-078's room (no evidence the migration was faithful). A test pinning spec 002's layout (the data-only proof would need a source change).

---

## The compositor and the bundle

Shapes: [contracts/room-bundle.md](contracts/room-bundle.md) and [contracts/room-data-files.md](contracts/room-data-files.md).

### R-08: Three layers: a shared kernel, a GLB reader, and the Node compositor (FR-005, FR-009, FR-052, FR-064, FR-068)

**Decision.**
- **`apps/web/src/room/compose/`**, pure TypeScript with no Three.js and no DOM: `math` (column-major mat4); `mount`, the world resolver (R-17); `framing(aspect, boxes)`, moved from `src/room/framing.ts` with its 45° vertical field of view, 1.5 m eye height, 6% margin, and label lift; `project`; `stages` (R-18); `layout`, the renderers' fixed text grids; `pick` (R-20); `cable` (R-22); `legibility` (R-21); `load-order` (R-28); `vocabulary`; and the bundle's types. The compositor, the runtime, and the lookdev page all call it.
- **`apps/web/src/room/glb/`**: the GLB reader and fit check (R-23), shared by the compositor and the lookdev page, never imported by a release's room chunks.
- **`apps/web/build/room/`**, Node only: a `Tree` (`read`, `list`) with a filesystem and an overlay implementation that records every path read; the zod schemas; one check module per rule family; `compose(tree, policy, {mode, drafts})`, returning the index, the 3D part, the room text, the manifest, the generated files, the report, and the findings; the typeface reader, the work-order writer, the report, the source scan, the Vite plugin, and a CLI.
- The Vite plugin `roomBundle()` replaces spec 002's `roomContentModule`. npm scripts: `room:generate` (spec 002's `manifest` becomes its alias), `room:report`, `room:check`, `room:scan`, and `room:fit -- <glb> --piece <id>`.

**Rationale.** The checks and the drawing compute the same numbers by construction. A pure core over a `Tree` makes FR-006's copy-of-the-data test, determinism across two roots, and the lookdev page's reuse cheap. zod, fontkit, and TypeScript's parser stay in Node.

**Alternatives considered.** A generator writing committed JSON (one more stale-file surface, and the policy differs per build). Validation in the browser (zod in the entry chunk). Three.js's math in the kernel (it would pull Three.js into the entry through the picker).

### R-09: Refusals: nine rule families and one line (FR-009, FR-018, SC-002)

**Decision.**
- Every finding reads `<rule> <file>:<path>: <reason>`, the path in the file's own terms (`placements[3].mount.anchor`), and for a GLB by index only (`nodes[4].name`; FR-018).
- The families: RD shape; RI identity and references; RG geometry (mounts, the framed set, framing, spacing, legibility); RS switches and claims; RT words; RV vector drawings; RX model fit; RK budgets and caps; RL the live configuration. Two letters keep them apart from spec 003's A, M, B, R, and F rules and spec 002's C and N rules when one merge-request note holds several.
- Shape is checked first, then C9 over every string, then the rest; every finding is reported, sorted by file, path, and rule.
- A reason never echoes a data value: a C9 finding names its source (the corpus file and line, the surname rule, or the private denylist), and the others name keys, indices, IDs already past C9, and expected types.
- Nothing from data becomes code: SVG path data is tokenized to absolute `M L H V C Q A Z` commands with finite numbers, colours are palette names or `#rrggbb`, and phrases are escaped before they enter a pattern.
- In the image build, a lenient finding (R-10) prints the same line prefixed `warn`.

**Rationale.** SC-002 needs each refusal to name its rule, file, and path; FR-009 forbids printing a private-denylist phrase; sorting makes two runs comparable.

**Alternatives considered.** Free-text errors (unsortable, and one careless message could print a private phrase). One-letter families (they collide with spec 003's R and F and spec 002's C).

### R-10: Strict in `make test`, lenient for one piece's model in the image build (FR-013)

**Decision.**
- `vite build` (the image build `make up` runs, or a checkout's build) is lenient only for findings on one piece's model file (RX, and RK2, that model over its budget): it warns, the piece keeps its stand-in, and `room-manifest.json` says `placeholders: true` and lists the piece under `standins`. Every other finding fails the build.
- `make test` composes the real tree in strict mode, where any finding fails, and runs the freshness checks of the generated committed files (R-14), which the image build can't: `specs/` and `docs/studio/` aren't in the image. `make check` runs `make test`.

**Rationale.** CLAUDE.md: "`make up` must always work", even with a misfit model; `make test` blocks the same finding before a merge. A data error fails everywhere, like a code error.

**Alternatives considered.** Strict everywhere (one misfit model would break `make up`). Lenient everywhere (data errors would reach a release).

### R-11: The bundle: an index in the entry, a 3D part in the lazy chunk, room text at Enter (FR-010, FR-011, FR-061; Amendments B7, B9; Confirmation 11)

**Decision.**
- **The index** is exported as `room` from spec 002's `virtual:room-content`, so it sits in the entry chunk, at most 16 KB gzipped inside the entry's 150 KB budget. It holds the build kind, the live configuration, the selectables in scene order (name, members, action, topic), the topics' phrases and readiness, the UI words, the 2D drawing with its hit rectangles and switch cases, the faces' bindings, the text copy's wiring, the typefaces' cap ratios and fallbacks, and whether stand-ins are in use.
- **The 3D part** is `virtual:room-scene`, imported only by `scene.ts`, so it lands in the lazy 3D chunk. It holds each placement (parent, local transform, scale, stand-in shapes, label, frame box), the faces (geometry, largest on-screen size, regions), the glows, switches, and cables, the look, the models (URL, SHA-256 for integrity, the gzip copy's bytes, bounds), and the load order.
- Both parts carry the bundle's digest; the 3D reader refuses a mismatch, and the room falls to 2D as on a failed 3D load.
- **Room text and the resume's section titles** reach the page in `room-data.json`, fetched once at Enter through spec 002's `roomDataLoader` (today it fetches when the resume first opens), shared with the resume and narration. Its `room_text` holds published blocks only, drops pending lines, and includes the outlines. The chalkboard's outline region names the source `resume_titles` and reads `sections[].title` from the same file, so the titles are withheld whenever the resume is (Confirmation 11). A failed fetch leaves the faces plain and their text-copy entries out (FR-061).
- `room-manifest.json` (B7): each object gains its topic and action; `placeholders` is computed from the placements; it adds `standins`, the live source, the build kind, and where the caps came from.
- Fixtures never ride in the index; drafts builds get them from `virtual:room-fixtures` (R-43).

**Rationale.** FR-011: the 2D room and the text copy never wait for Three.js, and the room's structure costs no request and has no failure mode. FR-061's "fails to load" implies a runtime load, and the content check reads one file. The resume's titles exist only once `room-data.json` is written, after the virtual modules load, so they can't be compiled into JavaScript.

**Alternatives considered.** A fetched bundle file (a request and a failure before the 2D room can draw). Everything in the entry (the 3D recipes press the 150 KB budget). Room text compiled into the bundle (no "fails to load", and a second copy beside the one the content check reads).

### R-12: One deterministic output (FR-010, SC-002)

**Decision.** Listings are sorted, and the data's own order is kept. Outputs are built field by field, never spread from data, which also keeps non-public fields out by construction. Numbers are quantized before serializing (1e-6 m, 1e-4 px). No time, environment, or absolute path appears; the policy appears only as its digest; gzip comes from one implementation with a fixed header (R-26); file names come from content hashes. A test composes twice from two copies at different paths, compares every output byte, and searches the outputs for either root.

**Rationale.** FR-010: two builds of one commit and policy are byte-identical.

**Alternatives considered.** Serializing parsed data as it comes (key order and float noise vary). Node's own zlib for the copies (R-26).

### R-13: The caps and the policy, read from `main` (FR-052, FR-053; Amendment C7)

**Decision.**
- `assets/policy/caps.json` joins the policy files spec 002's build reads from `main`, in one order in all three lists: `POLICY_PATHS` in `apps/web/build/policy.ts`, `POLICY_FILES` in `apps/web/build/approvals.ts`, and `POLICY_FILES` in `deploy/scripts/web_image.py`, so the policy digest and the image's label agree.
- The compositor takes the policy from, in order: `ROOM_POLICY_DIR` (the image build's named `policy` context); `refs/heads/main`, by its full ref; or the export's own copy, only when there is no `.git` (the gate's container), which spec 003's rule A9 keeps equal to `main`'s at the branch's base.
- The room block is parsed strictly; a malformed file is RK4.
- With no room caps on `main` (before P-6, or in the gate's image build, which has no policy context): catalog budgets are checked against FR-053's starting figures, every model stays a stand-in, the floor is 9, and the report says so. A test pins those defaults to FR-053's figures.
- The report and the manifest name each field's source and the caps file's SHA-256. P-10 mounts `caps.json` for the gate's content build, so the gate's release-like build matches prod's image.

**Rationale.** FR-053: the caps are "configuration the Author owns, read from `main`"; reading the branch would let a branch raise its own caps. `make up` and the gate's image build must work before P-6.

**Alternatives considered.** The branch's own `caps.json` (a branch could raise its caps). Failing without caps (breaks `make up` before P-6, and the gate's image build always).

### R-14: Generated, committed files, each with a freshness test (FR-013, FR-014, FR-026, FR-028, FR-038; Amendment B7)

**Decision.** `npm run room:generate` writes, and `make test` fails on a stale or orphaned copy of:
- `config/room-events.yaml`: its shape unchanged, its objects the selectables (B7 adds `chalkboard`); the gateway reads it from its next start.
- `config/room-topics.yaml`: `{schema: 1, selectables: [{id, topic, corpus, lead}]}`, values quoted: FR-038's mapping for the twin's spec.
- `docs/studio/work-orders/<piece>.md`, from the catalog entry and the chosen look: the method, shots, and measurements (a "Measure" line per estimated value); the origin, the bounds at scale, and the anchors; the live faces, their roles, and the texture-coordinate rule; the poses; the budget against the caps; the look's material notes; the piece's studio notes (where FR-028's rules for the window's view, the artwork, and the snowboard's graphic live); the export rules, from the same rule texts as the refusals (R-23); and a `records.json` template.
- `docs/studio/photo-guide.md`: a fixed privacy template, which is code and names no ID, plus a layout checklist generated from the scene's anchors (R-59).

`docs/studio/handoff.md` is hand-written (R-59). `docs/` is public and Prettier ignores it; `config/` is what the gateway, and later the twin, mounts.

**Rationale.** FR-014: a stale work order fails `make test`. The reviewer reads the committed files (R-55), and the studio receives them outside the image.

**Alternatives considered.** Generating at build time without committing (the reviewer couldn't read them, and the studio couldn't receive them). `docs/room/` (the data design's first path; `docs/studio/` keeps everything the studio receives together, beside the hand-written handoff).

### R-15: Word checks, reused from spec 002 (FR-029, FR-031, FR-033, FR-035; SC-008)

**Decision.**
- Spec 002's `build/content.ts` exports its inner line check as `checkLine(line, verb, ctx)`, with `bareNumber` and `forbiddenHit`; its `checkSource` calls them unchanged.
- The room's word rules: RT2, C9 over every string the bundle can show, IDs included; RT3, C6 where a line has `about_author`, with a UI word's slots counting as C6's slots, so a live value is never a bare number; RT4 and RT5, C8 and C1 to C5 for lines with `claims`; RT6, the monitor's scripts (FR-031): no absolute or home path, `user@host`, email or IP address, URL other than the site's, amount, or secret-shaped token, and typing that ends within 5 s; RT7, the chalkboard (FR-033): refuse a line that holds a phrase from its block's `exclude` list, cites a corpus sentence that holds one, or shares a 24-character span with such a sentence; RT8, text that overflows its fixed grid (R-21), including the resume's current titles in strict mode; RT11, the tier's sentences never mention the twin (FR-035).
- C9 uses the public list everywhere and the private denylist wherever the build can read it, as spec 002's resume does; the image drops the private list, and agent sessions are denied it.
- Every drawn word comes from FR-029's four sources, with drafts and fixture figures marked; no word comes from a model file.

**Rationale.** FR-035 names spec 002's C9, C6, and C8; one implementation serves the resume, narration, and the room.

**Alternatives considered.** A second word checker (two rule sets drift). Leaving the room's words to the human-only content check (it checks approval, not claims, and runs after the build).

### R-16: The source scan, and the migration away from pinned IDs (FR-007, SC-001, User Story 1 scenario 4)

**Decision.**
- `apps/web/build/room/scan.ts` parses `apps/web/{src,build,lookdev,test}` and `services/gateway/{src,test}` with TypeScript's parser and reads string literals and template text, object-literal property names and literal types, attribute values in `index.html`, and CSS selectors and `content` strings; comments are skipped. A literal holds an ID when the ID appears with no letter or digit on either side. A finding reads `FR-007 <file>:<line>: holds "<id>", which only the room's data defines` and fails `make test`.
- The migration: `objects.ts` loses `ROOM_OBJECTS` and the `ObjectId` union; `scene.ts`'s per-piece builders become shape builders; the manifest, talk, accessibility, objects, and scene tests take their expectations from `compose()`; the web events test uses synthetic `fx-` IDs; the gateway's `unit/room-events-config.test.ts` asserts only that the committed file loads with 1 to 64 unique IDs; the gateway's `integration/room-events.test.ts` and `unit/telemetry.test.ts` use synthetic `fx-` IDs, or the committed events file's IDs read at run time; the eight gateway tests whose client label is "author-laptop" (`integration/{hello-fallback,hello-local,incidents,meter,migrations,telemetry-sdk}.test.ts` and `unit/{gateway,limits}.test.ts`, under `services/gateway/test/`) take a label that holds no room ID; `room.css`'s per-ID rules go.
- FR-036's and FR-078's defaults are shown by the committed `config/room-topics.yaml`, the scene, and review, not by tests: a pinned default would turn a retarget into a source change.

**Rationale.** Today five web tests and three gateway tests pin the three IDs, and eight more gateway tests hold the client label "author-laptop", which the scan's hit rule matches (the hyphen before `laptop` is neither a letter nor a digit), so adding the chalkboard would fail `make test`, against SC-001's "0 source files changed", and the scan would fail on `laptop`, an ID the spec fixes, which no data edit can make more distinctive.

**Alternatives considered.** A regex over source text (it flags comments and identifiers). A `CHECK_GATES` gate (the Author's gate never runs `make check`; R-65).

---

## Geometry, legibility, and spacing

Rules RG1 to RG8: [contracts/room-data-files.md](contracts/room-data-files.md).

### R-17: Mounts and the world resolver (FR-003, FR-040, FR-051)

**Decision.**
- `compose/mount.ts` resolves each placement from its parent: World(child) = W(parent) · T(s × anchor position) · R(anchor turn) · T(offset) · R(turn), where W(parent) is the parent's world transform without its scale and s is the parent's stylized scale. A turn is `{x, y, z}` in degrees, applied in Y-X-Z order.
- A piece's stylized scale scales its own geometry, anchors, and faces, never its children: an enlarged monitor carries the neon sign on its scaled top edge without enlarging it.
- Only the shell has no mount; a cycle is refused (RG1; RI8 holds the single root).
- The 3D part keeps each placement as authored (parent, anchor, offset, turn). The runtime builds its `Object3D` tree with the same function, and the compositor uses it for every geometric check. Tests hold Three.js's world positions equal to the resolver's within 1e-9, and the kernel's matrices equal to Three.js's `Matrix4`.

**Rationale.** The checks and the drawing share one piece of math, and FR-003 falls out of the tree: moving the stand carries the laptop, its screen, and the plugged pose's plug (FR-040).

**Alternatives considered.** World transforms only in the bundle (switch cases, cables, and lookdev's re-parenting would need a second resolver). Scale that compounds down the tree (the neon sign would be enlarged twice).

### R-18: Stages and framing, as code (FR-009, FR-019; Amendment B8)

**Decision.**
- `compose/stages.ts` holds spec 002's six framing aspects (0.45, 0.6, 0.8, 1.15, 1.5, 2.4; today a constant in `test/room/scene.test.ts`), the reference stages, and `room.css`'s stage formulas; `stages.test.ts` pins them to `room.css`'s rules.
- The reference stages: the desktop, a 1920 × 1200 window at a pixel ratio of 1, whose stage spec 002's layout makes about 686 × 640 CSS px; and the phone, about 368 × 420 at its pixel ratio (the design's 2.8125). Both are re-measured in the first lookdev run.
- `framing(aspect, boxes)` generalizes spec 002's `framing()`; its `LAYOUT` leaves the code.
- RG4: the twin and every selectable's members are framed (B8); the desk is framed as the scene says. RG5: at each aspect, every framed box's corners project inside the view.
- A box is the catalog's expected bounds, or a set model's measured bounds (FR-019), grown for a stand-in's label. The runtime frames and picks from these boxes only, never from loaded geometry, so a model arriving or failing moves neither the camera nor a pick area.

**Rationale.** These are facts of spec 002's layout code; a data edit mustn't be able to weaken the gate.

**Alternatives considered.** Stages in `scene.yaml` (agent-edited data could shrink the check). Stages in `caps.json` (they aren't budgets).

### R-19: FR-064's supported stages (approved with the plan)

**Decision.** The smallest supported stages are 304 × 248 (a 320 × 568 screen in portrait) and 326 × 208 (568 × 320 in landscape). The spacing check (R-20) runs there, at the two reference stages, and over a sweep of screens from 320 × 568 to 1920 × 1200 through the stage formulas. In 2D, 44 px converts to viewBox units at the smallest 2D scale, min(W / 320, H / 200).

**Rationale.** FR-065 guarantees a 320 × 568 screen, so its stage in each orientation is the smallest the layout must serve; FR-064's "down to the smallest the layout allows" reads as that.

**Alternatives considered.** The CSS minimum stage, 304 × 144 (it would force pieces about 1.4 m apart at the wall). The reference stages alone (they miss the smallest phones).

### R-20: Pick areas: one function at build time and at run time (FR-064, SC-009; Amendment B8)

**Decision.**
- `compose/pick.ts` takes each selectable's members as CSS-pixel rectangles with their depths (in 3D from `project` with the camera's own framing; in 2D from the drawing's rectangles times its scale), their union, and an exclusive 44 × 44 px core centred on that union.
- A pointer pick goes to the frontmost member rectangle under the point; else, among the selectables whose union and core contain the point, to the one nearest its union, ties going to scene order; else to none.
- RG6 runs the same function at the six aspects and every stage of R-19, and refuses a stage where a selectable's core overlaps another selectable's core or member rectangles: a regroup of adjacent pieces needs a move too.
- The runtime recomputes the areas on resize; spec 002's raycast picker goes. `project` reproduces the camera exactly (spec 002's framing looks straight down −Z) and is tested against Three.js's `Vector3.project`.

**Rationale.** One algorithm serves 3D and 2D, and the build measures exactly what the runtime does.

**Alternatives considered.** Keeping the raycast and adding a screen-space fallback (two geometries for one rule, and a raycast's coverage the build can't check). Any free 44 × 44 square in a selectable's area minus the others' (the data design's first form; the approved plan takes the centred core).

### R-21: Legibility: cap height, fixed grids, and the floor (FR-052, FR-054, SC-010; Confirmation 8; Clarifications)

**Decision.**
- Text sits on fixed grids that don't depend on the words (`compose/layout.ts`, shared with the renderers): the terminal's columns and rows per region, the chalkboard's line slots, the neon sign's word panel and counter panels with their maximum characters, and each sign's outline fitted to its face.
- Cap height per typeface: fontkit 2.0.4, made an explicit devDependency (it is already locked through pdfkit), reads each file after checking it against `fonts.lock`; the ratio is the smallest, over A to Z and 0 to 9, of a glyph's top (`bbox.maxY`) over the font's units per em. Traced lettering uses its outline file's `cap_height` over its view box.
- The smallest glyph in CSS px is the cap height in face units times the face's projected height over its height, at the production framing on both reference stages.
- RG7 refuses a readable face (the signs' lettering, the neon sign's word and counters, the monitor's screen, the chalkboard's slate) under the floor on either stage, and any other face under the floor unless it is marked atmosphere with a character cap and its words are in the text copy.
- For every two cases of a switch that show different placements, the report gives the largest on-screen distance any part moves, or the size of a cue the look adds; a pair under the floor is a report line (RG8), not a refusal, and the text copy always carries the state.
- The floor is `legibility_floor_css_px` from `main`'s caps (R-25), 9 when absent. The metrics ride in the index's `typefaces[]` ([room-bundle.md](contracts/room-bundle.md) §3.1), so the lookdev page computes the compositor's number.
- Expected first failure: with today's layout the back wall renders at about 60 CSS px a metre on the phone and 110 on the desktop, so a 9 px cap height needs capitals about 15 cm tall on the phone and 8 cm on the desktop. The report prints each face's margin, and lookdev sets the stylized scales and grids (Confirmation 8).

**Rationale.** The Author's answer chose cap height ("yes", option A). Fixed grids make legibility a property of the layout, not of each rewording.

**Alternatives considered.** Shrink-to-fit text (legibility would change with every rewording). Measuring canvases in jsdom (it has no real fonts). The em size or the x-height (not the measure the Author chose).

### R-22: The cable (FR-020, FR-043, FR-051, FR-058)

**Decision.** `compose/cable.ts` samples 16 points from the active case's lead end to the desk's back-edge anchor along the straight line lowered by sag × span × 4t(1 − t), clamped above the surface the binding names (a lead on the desk lies on it), with a short drop behind the edge; its radius takes the charger's stylized scale. The 3D scene caches one tube per pose; the compositor projects the run into each case's 2D drawing as one quadratic curve, `{from, control, to}` ([room-bundle.md](contracts/room-bundle.md) §3.1). Only the plug's placement decides whether the cable reaches the port.

**Rationale.** FR-020: moving the laptop, its stand, or the desk needs no re-export, and the 3D and 2D rooms draw the same run.

**Alternatives considered.** An animated cable (FR-020 forbids states as animations). A true catenary (no visible gain at this size). The cable inside the model (every move would need a re-export).

---

## Models, budgets, and gzip

Rules and measures: [contracts/plain-model-fit.md](contracts/plain-model-fit.md).

### R-23: The GLB reader and the fit check, RX1 to RX10 (FR-015 to FR-019, FR-022, FR-068; User Story 4)

**Decision.**
- `src/room/glb/` is pure TypeScript over a `Uint8Array`, a strict port of spec 003's arrival-check parser, not the scrubber's lenient one: one JSON chunk then at most one BIN chunk, with 4-byte padding; JSON with duplicate keys refused; every accessor form (component types, normalized values, byte stride, sparse, `KHR_mesh_quantization`); the node tree from TRS or a matrix; primitives in modes 4, 5, and 6; and image headers (PNG's IHDR, JPEG's SOF with its component count, WebP's VP8, VP8L, and VP8X with the animation flag).
- The checks, against the catalog entry at its stylized scale:
  - RX1 and RX2: the container and the JSON.
  - RX3: no camera, animation, skin, morph target (shape key), `extras` (custom property), or `uri`.
  - RX4: extensions only from `KHR_materials_*`, `KHR_texture_transform`, `KHR_mesh_quantization`, and `EXT_texture_webp`, plus the mark's `KHR_xmp_json_ld`; `KHR_materials_variants`, `KHR_materials_transmission`, and `KHR_materials_volume` refused; `extensionsRequired` within `extensionsUsed`. Lights, compression, and GPU instancing are extensions outside the list, so they are refused here.
  - RX5, the mark (spec 003's research R-03, which FR-015 cites): the root's `KHR_xmp_json_ld` holds exactly one packet, with `@context` and a digital source type C1 allows; `asset.extensions` is exactly `{"KHR_xmp_json_ld": {"packet": 0}}`; nothing else references the packet. A file with no mark reports "not scrubbed" (FR-068).
  - RX6, names: node and mesh names match `^[a-z0-9]+(-[a-z0-9]+)*$` and pass a port of spec 003's M8 (no slash, file extension, or camera's file stem); material, image, texture, and sampler names are the scrubber's neutral IDs; a refusal names the element's index, never the name (FR-018).
  - RX7: the bounds at both corners, within the larger of 2 cm and 3% of that axis (FR-019).
  - RX8, live faces: one node named for the role, two triangles over four coplanar vertices, untextured, no vertex colours, centre and size within 1 mm, facing within 1°, texture coordinates from (0, 0) at the top left in reading order as stored; a refusal prints the measured plane (FR-017).
  - RX9, textures: 8-bit PNG (RGB or RGBA), Huffman-coded RGB JPEG, or still WebP, at power-of-two sizes, and at most 1024 px on the caps' small props (FR-022, FR-053).
  - RX10, materials: no emissive factor or texture, and no occlusion texture (FR-022's baked glow and ambient occlusion).
- Measures: triangles as the arrival check counts them (mode 4, a third of the indices; modes 5 and 6, the count minus 2); texture memory, w × h × 4 × 4/3 per image; raw and gzip-9 bytes (R-26).
- The rule texts live once, in `glb/rules.ts`, which feeds the refusals and the work orders' export rules.
- Not machine-checked here: readable text, a crop of a photo, and third-party art, refused at the Author's approval and the reviewer's arriving-assets pass (User Story 4's Independent Test); and sRGB, an export rule the work orders state.

**Rationale.** FR-068 needs the compositor's own fit check in the browser. Spec 003's check is human-only Python and admits what FR-015 bans for room files (cameras, animations, skins, morph targets, `targetNames`, the three `KHR_materials_*`), and the scrubber drops unlisted extensions without failing, so the export rules apply before the scrub (FR-015).

**Alternatives considered.** Three.js's `GLTFLoader` as the checker (lenient, and it needs a DOM). Importing the Python check (human-only, and it can't run in the page).

### R-24: Budgets, texture memory, and the report (FR-053, FR-054, FR-073, SC-006, SC-010)

**Decision.**
- A catalog entry's budget is `{gzip_bytes, triangles, texture_px, texture_bytes}`. RK1 refuses a budget above the caps, so agents never raise one; RK2 refuses a model over its budget; RK3 refuses a scene over the texture-memory cap, summing the measured models and image cards, the planned texture bytes of pieces still on stand-ins, the twin and the largest visitor avatar (read with the same reader once they exist), and every live-face canvas at the reference phone's pixel ratio, each the smaller of the face's pixel size and its largest on-screen size at that ratio, which meets FR-054 by construction.
- `npm run room:report` prints FR-073's report as Markdown, pasted into each merge-request note that changes the room's data or models: per piece, its source (studio or stand-in), bytes, gzip-9 bytes, triangles, texture memory, and status; the totals against the caps, with where the caps came from and their SHA-256; the room's share of the first visit (the served gzip bytes of placed models and cards) beside the design's 12,000,000 and the enforced 25,000,000; spec 003's F3 view, every file under `assets/room/` (C6); texture memory by class; each live face's smallest glyph on each stage; and the switch pairs' separations.
- The report is how cost is measured now; after spec 001, spec 003's transfer panel and §7.9's poll counts join it (R-61).

**Rationale.** FR-053's caps are the Author's, and the phone's 96 MB is shared by models, cards, avatars, and canvases. F3 stays the enforced, conservative measure (it counts alternates too); the report shows the placed share beside it.

**Alternatives considered.** Counting only models in texture memory (the canvases and avatars share the same 96 MB). Per-piece budgets in the caps file (the caps are the Author's ceilings; budgets are the catalog's, under them).

### R-25: The room's caps, one block (approved with the plan; Amendment C7)

**Decision.** `caps.json` gains one block, `per_asset.room`: `{gzip_bytes: 2500000, triangles: 40000, small_props: [...], small_prop_texture_px: 1024, scene_texture_bytes: 96000000, legibility_floor_css_px: 9}`. For room files `gzip_bytes` counts gzip level 9, where ADR 0010's kinds compare raw bytes. Unknown keys are refused, by the compositor and by P-5's F2, which today skips unknown and non-integer caps. The Author names `small_props`, as piece IDs, which are also their model files' stems, in P-6.

**Rationale.** Answer 9: "make them configurable". F2 already reads `per_asset[kind]`, so one block keeps the room's caps where spec 003 looks.

**Alternatives considered.** A key named `bytes` with a gzip meaning for room files (one name, two measures). A separate top-level `room` block beside `per_asset` for the scene's caps (the data design's first proposal: two places for one kind's caps).

### R-26: gzip: one implementation, one measure (FR-079, FR-010, SC-006; Amendment C11)

**Decision.**
- Only the gzip copy is emitted, `dist/a/<stem>.<hash16>.glb.gz`, made by pako 2.1.0 (a pure-JavaScript port of zlib 1.2.8) at level 9, with the header's time 0 and OS 255. The plain file is never written to `dist/`; image cards stay plain.
- The caps, the report, the bundle's bytes, and the asset events' `bytes` (C11) all use that file's length: the bytes a phone downloads.
- A parity fixture, `apps/web/test/fixtures/gzip-parity.json` (a seeded generator and the expected lengths), is checked twice in `make test`: by vitest through pako, and by `scripts/assets/test_gzip_parity.py` through Python's `gzip.compress(data, 9, mtime=0)`, the arrival check's measure. Equal lengths mean the served bytes are F2's and F3's.
- Integrity is computed on the decoded body, so it stays the record's plain-file SHA-256.
- No gzip copy is ever committed under `assets/room/` (spec 003's rules refuse it).

**Rationale.** FR-079: "the bytes a phone downloads are the bytes the caps and spec 003's F3 count". Node's bundled zlib isn't stock zlib (the exploration believes it is Chromium's fork), so its lengths may differ from CPython's; pako's follow stock zlib's.

**Alternatives considered.** Node's zlib (lengths not portable). Committing the copies (refused, and they double the history). Python in the image (it has none). Compressing per request (CPU on a 0.1-CPU container, and bytes the caps don't count).

---

## Runtime and signals

Contracts: [contracts/tier-signal.md](contracts/tier-signal.md) and [contracts/turn-cost.md](contracts/turn-cost.md).

### R-27: `scene.ts` becomes an interpreter of the 3D part (FR-005, FR-008, FR-057; Amendment B13)

**Decision.**
- `buildRoom(part, {avatar, label})` needs no renderer, so it stays testable in Node like spec 002's `buildWorkArea`. It makes one `Object3D` per placement at its world transform, holding a stand-in from the catalog's shapes, a label (a UI word) only where the placement has no set model, the face quads, the glow cards, the cable tubes, and one group per switch case. Figures are found by role; the visitor's flat cut-out stays in `avatars.ts`; the hand-off and the paper stay code, with their anchors from data (FR-008).
- `createScene` adds the renderer, the frame loop, the loader (R-28), and the look: inked cel is `MeshToonMaterial` with a three-step ramp and Three.js's `OutlineEffect`; the other look methods use unlit materials in base colours.
- A model swaps in under its placement's `Object3D`. Its own face objects are hidden, and the runtime's face quad, placed from the catalog with a polygon offset, draws on stand-ins and models alike.
- `PartName`, the per-piece builders, `LAYOUT`, `ROOM_OBJECTS`, `isObjectId`, and the raycaster go.

**Rationale.** FR-005 to FR-007 make pieces data and behaviours a closed list; faces get one drawing path whatever the model; FR-057's fallback is the same object.

**Alternatives considered.** Drawing on the model's own face mesh (two code paths, and a dependency on export conventions at run time).

### R-28: Loading pieces (FR-055 to FR-057, FR-071; Amendments B13, C9, C10)

**Decision.**
1. **The floor.** `capability()` extends spec 002's WebGL 2 check to read the maximum texture size before releasing its context. Models load only above ADR 0010's proposed floor (WebGL 2; `deviceMemory` of at least 4 where the browser reports it; a maximum texture size of at least 4096); below it every model is `skipped`, and the stand-ins stay.
2. **The order.** After the figures (a promise spec 003's avatar loader resolves; today at once), `compose/load-order.ts` puts first the framed placements that belong to a selectable, in scene order, the active switch case first; then the other framed placements; then the rest. A model several placements share loads once.
3. **The fetch.** Up to 4 at once, same-origin, with `integrity`, no redirects, and a 10-second timeout on the room's clock that covers the body (spec 003's figure).
4. **Parse and swap.** Two at a time, only after the hand-off (fetches may run during it), inside a quality hold released two frames after the swap (R-35), with lights and cameras stripped and the look applied. A piece whose textures would take the texture ledger over 96 MB stays a stand-in (`skipped`).
5. **Failure.** Blocked, timed out, failing integrity, not 200, failing to parse or decode, or short of textures (R-29): one retry (`retried`), then the stand-in stays, selectable, with its faces and state (`failed`; FR-057), and the placeholder note shows.
6. **Memory and context loss.** In spec 003's reduced tier, which the runtime reads as a quality level of 1 or more when the model decodes, images decode at half size (FR-056's lighter textures). Decoded bitmaps are closed after upload. After a lost context is restored, swapped pieces revert to stand-ins and reload from the HTTP cache under a hold.

Each step records spec 003's asset event (R-60). This is spec 002's T078, which B13 moves here, in User Story 4; its first files are the desk and one sign (C10).

**Rationale.** FR-055 to FR-057 and spec 003's site-loading order and failures; the hand-off, which nothing may skip, stays smooth.

**Alternatives considered.** Parsing during the hand-off (frames would stall in the one animation nothing skips). Keeping decoded bitmaps (close to double the texture memory on a phone). `GLTFLoader.load(url)` (no integrity and no timeout control).

### R-29: GLB textures under the unchanged CSPs (FR-075)

**Decision.**
- Both CSPs stay as they are: neither spec 002's web image nor spec 001's edge allows `blob:`, and spec 001's has no `data:` image source. Three.js's `GLTFLoader` decodes embedded images through `blob:` URLs and turns a failed texture into an untextured material, so models would render white with no error (the design's reading of the loader, pinned below).
- A loader plugin, `src/room/scene/gltf-images.ts`, replaces the parser's image-source step for embedded images: it wraps the buffer view in a `Blob`, decodes it with `createImageBitmap` (no premultiplication, no colour conversion, halved when reduced), and returns a texture with `flipY` false, as glTF expects, and its MIME type, cached per source. It refuses an image `uri` and never creates an object URL.
- The loader counts the decoded images and fails the piece when the count falls short of the textures its materials use.
- `three` stays exactly at 0.186.1, and a test reads the installed `GLTFLoader.js` and asserts the internals the plugin relies on: the texture step still calls the image-source step, that step still makes an object URL, and how `EXT_texture_webp` probes support (if with a `data:` image, the plugin marks WebP supported first).
- Before the first studio piece, the Author checks once in a real browser, in a lookdev run.

**Rationale.** `'self'` doesn't match `blob:`. `createImageBitmap` on a `Blob` needs no URL and exists wherever WebGL 2 does.

**Alternatives considered.** Adding `blob:` to two specs' CSPs (two policies widened for one decoder). `data:` URIs (spec 001's CSP refuses them, and base64 inflates the bytes held). A custom texture loader (still needs a URL). KTX2 (FR-015 and ADR 0010 refuse compressed textures).

### R-30: The tier, a pure reducer of FR-041's table (FR-041 to FR-043, SC-003; Confirmation 9)

**Decision.**
- `src/room/signals/tier.ts` exports `reduceTier(inputs)`, returning `{tier, row, recheckAt}`; rows are tried in order, and the first match wins. Its inputs ([tier-signal.md](contracts/tier-signal.md) §3): the live source; paused; hidden; now, on the room's monotonic clock, and the wall clock; the freshness window; the last completed request, with when it started and ended (an answer, or a failure by network, timeout, status, or shape, with any `Retry-After`); and when a fallback reply last came. From row 4 on, the last completed request was valid, so it is the last valid answer, and its age is the larger of its monotonic and wall-clock ages.
- Row 3 includes a shape check: `local_tier` and `state` are strings, and `cause_now` a string or null; `tunnel`, `release`, and `time` are ignored.
- Row 6 uses `causeClass()`, moved out of spec 002's talk messages so the talk panel and the tier share one map; an unknown cause, the relay's `no_path_available` included, reads unavailable.
- Row 7 holds while the last fallback reply came after the start of the request whose answer is the last valid one (tier-signal.md §3's reading of FR-041's "after").
- `recheckAt` is the instant the last valid answer turns stale, its age the larger of its monotonic and wall-clock ages, whenever rows 5 to 10 decided; a timer on the room's clock re-reduces at that instant, and every completed request, pause, visibility change, and turn reply re-reduces too. A request in flight changes nothing.
- The values are local, cloud, resting, budget, unavailable, unknown, paused, and not-live; their sentences are UI words (`tier.<value>`) that speak about the machine (FR-035).

**Rationale.** SC-003 needs table tests, and its "leaves the plugged pose on the first frame after a failed request or a stale answer" needs an exact timer, not the next poll.

**Alternatives considered.** A stateful tier machine (hard to table-test). Checking freshness every frame (it ties the signal to a renderer the 2D room doesn't have).

### R-31: The status poller (FR-042, FR-044, FR-045, SC-012; Amendment A1)

**Decision.**
- `src/room/signals/status-poller.ts` starts at Enter, and only while the live source is `site`. Its request is `GET /api/status`, same-origin, with no credentials, no headers, no query string, no cache, and no redirects; its 5-second timeout covers the body. The URL is code, never data.
- The next request starts one wait after the last started: the poll interval after a valid answer; double the last wait after a failure, up to 120 s; at least the `Retry-After` after a 429 (the header, else the body's `retry_after_s`; spec 001's relay sends both).
- Paused or hidden: the timer is cleared; a request in flight completes and is recorded, and paused wins (row 2).
- Resume or return: the tier is reduced at once, before the next frame; a request starts at once only if no backoff or `Retry-After` wait is running and the last request began at least one interval ago; otherwise the schedule already due stands.
- It stores nothing, and makes no request before Enter or while the live source is off.

**Rationale.** Each start is at least one interval after the previous, so SC-012's "never two status requests from one room within one poll interval" holds by construction, and so does A1's "at most 2 requests a minute per visible, unpaused room".

**Alternatives considered.** Aborting the request on pause (it throws away a valid answer the table already handles). A timer outside the room's clock (the tests' fake clock couldn't drive it).

### R-32: The turn-cost channel (FR-047 to FR-050, SC-011; Amendments A5, B6; Confirmations 1, 2, 6)

**Decision.** `src/room/signals/turn-cost.ts`'s `classifyTurn()` sorts a turn's result: a 200 is a reply; a 503 with a degraded body, degraded; another 5xx, or a network error before any response, failed; an abort or a body error after sending, lost; a 400 to 499, 429 included, refused. `createCostChannel()` sums micro-dollars as a `BigInt` in page memory and reads:

| State | "this call" | "this visit" |
|---|---|---|
| no turn route in the live configuration (today) | cost unavailable | cost unavailable |
| a route, before the first turn | no call yet | $0 |
| a valid reply, `route` `local`, cost 0 | local · $0 | unchanged |
| a valid paid reply | its cost to six decimals, "est." | adds it exactly, "est." |
| an invalid reply; degraded; failed; lost | cost unavailable | "at least", until reload |
| refused | unchanged | unchanged |

- A valid reply has `route` `local` or `fallback` and a `cost_micro_usd` that is a non-negative safe integer, so the gateway's dev-only `metered` route reads invalid. A reply with `route` `fallback` also stamps the tier's row 7. "at least" stays after a later paid turn.
- Amounts are formatted with integer arithmetic and are live values, never UI words. A drafts build marks its figures "test"; a fixture's figures read "Sample" (FR-049).
- The talk panel gains an outcome hook that the twin's spec calls. The channel makes no request and writes no storage.
- It goes live once the twin's turn route returns `cost_micro_usd` and `route` (B6, A5), after the Author's price check of Confirmation 6.

**Rationale.** SC-011 needs exact integer sums. A missing turn route is today's state, not a fault (answer 7: "Yes it can have cost unavailable for now.").

**Alternatives considered.** Reading the float `cost_usd` (inexact). A total in `sessionStorage` (FR-047 forbids storage). A cost field on spec 000's degraded reply (Confirmation 2 keeps that body without one).

### R-33: Topics at run time (FR-036 to FR-038, FR-076, SC-015; Amendments B3, B5)

**Decision.** `selectObject(id)` stays the one path for every input. It sends `object_selected` with the selectable's ID, then runs the selectable's action from the bundle:
- talk, topic not ready: the fixed message, filled with the topic's own phrase (never the visitor's words); no model is called;
- talk, topic ready: the conversation's `feature` becomes the selectable's ID (FR-038);
- resume: the resume opens.

The leads stay in `config/room-topics.yaml` for the twin's spec; a turn carries only the selectable's ID, the visitor's path, and the turns. The twin's spec adds `h4.room.topic` beside `h4.room.feature` on its spans (B5).

**Rationale.** FR-037 and SC-015: an unready topic calls nothing. FR-038 keeps live values and faces' words away from the twin.

**Alternatives considered.** Sending the topic or the lead with each turn (it widens spec 002's turn contract, which FR-038 keeps).

### R-34: Pause, reduced motion, and a hidden page share one motion store (FR-042, FR-059, FR-060; WCAG 2.2's 2.2.2)

**Decision.**
- `src/room/motion.ts` holds three flags: paused, from the toolbar's "Pause the room" toggle (`aria-pressed`); reduced motion, from `matchMedia` with a change listener, read throughout the visit (spec 002 reads it once); and hidden, from the page's visibility.
- The room animates only while all three are false. Otherwise the monitor's typing shows its final frame, the glows hold their level, and the idle sway stops; state changes still apply at once.
- Paused or hidden also clear the status poller, and the tier reads paused (not-live while the live source is off).
- Paused alone shows "Paused at HH:MM" in the text copy, in 24-hour local time from an injected wall clock: a live value in a UI-word slot.
- The neon sign's counters still redraw for the visitor's turns; only its glow's motion stops. The frame loop keeps running, drawing still frames.

**Rationale.** Final frames keep the drawing and the text copy identical. The approved plan's one store is read per FR: reduced motion stops motion but not polling (FR-044 polls while the page is visible and the room isn't paused, whatever the motion setting), and only the pause shows "Paused at" (FR-060).

**Alternatives considered.** Freezing the typing mid-line (the face would show fewer words than the text copy). Stopping the frame loop (resuming would count as one long frame to the quality controller).

### R-35: The quality controller: holds and four levels (FR-055, SC-005; Amendment B13)

**Decision.** The controller gains `hold()`, reference-counted, returning its release: frames during a hold are ignored, and the measuring window restarts when the last hold is released. A context restore holds too. No level raises a setting over the level before it:

| Setting | q0 | q1 | q2 | q3 |
|---|---|---|---|---|
| Pixel ratio | 2 | 1.25 | 1 | 0.75 |
| Shadows | on | on | off | off |
| Outlines | on | on | off | off |
| Glow cards | on | on | off | off |
| Typing redraws a second | 15 | 15 | 8 | 0 (final frame) |
| Face scale | 1 | 1 | 1 | 0.5 |
| Label scale | 1 | 1 | 1 | 0.5 |
| Idle sway | on | on | on | off |

There are still four levels, so spec 002's highest level and its step to 2D below 24 frames a second stay as they are.

**Rationale.** FR-055: never step down because pieces are loading; SC-005: 0 step-downs during a scripted load. B13 adds outlines, glow cards, the typing rate, and the live faces' resolution to spec 002's R-04 steps.

**Alternatives considered.** A fixed quiet period after each load (a guess: too short on a phone, too long on a desktop).

---

## Faces, typefaces, and 2D

What the faces read: [contracts/room-bundle.md](contracts/room-bundle.md).

### R-36: The renderers: a closed registry of display lists (FR-005, FR-029, FR-031, FR-034, SC-008)

**Decision.**
- `src/room/faces/registry.ts` holds exactly five renderers: terminal, desktop session, neon, chalk, and sign. Each is pure: its layout returns the words, the text-copy lines, the typing's duration, and the smallest glyph; its draw returns a display list of fills, rectangles, text runs (anchored start, middle, or end; room text arrives as lines, so nothing is measured or wrapped), paths (the signs' outlines), and badges ("Draft", "Sample", "test").
- Two backends draw a display list: Canvas2D in the 3D chunk, and attribute-only SVG in the entry chunk for the 2D room.
- The words feed the text copy (FR-034), so the 3D room, the 2D room, and the text copy can't differ.
- The desktop session draws a conversation column with no logo, and product names are plain text (FR-005, FR-031). The laptop's screen is a live face that stays a plain glow unless approved room text is bound to it (FR-031, Confirmation 12).
- If the entry would outgrow its 150 KB, the chunk test fails first, and the fallback is a small 2D and text-copy chunk loaded at Enter, still apart from Three.js.

**Rationale.** One word source and one layout serve all three outputs. SVG needs neither `data:` nor `blob:`.

**Alternatives considered.** `<image href="data:…">` in 2D (spec 001's CSP refuses `data:` images). Canvases inside `<foreignObject>` (Safari has trouble with transforms there). DOM text over the stage (a second layout, and it needs `style`).

### R-37: Live faces: typing, canvas size, and late typefaces (FR-031, FR-054, FR-058, FR-061)

**Decision.**
- Both screen renderers type once, ending within 5 seconds of the room opening, and show their final frame under reduced motion, pause, quality 3, and in 2D.
- A face's canvas width is `min(px.w, ceil(screen_css.w × min(dpr, level.pixelRatio) × level.faceScale))`, where `screen_css` is the face's largest on-screen size at the reference stages, which the compositor computes; the height follows the face's aspect, with no mipmaps.
- Each face's typeface loads through `document.fonts`; the face draws when it resolves, or after 2 seconds with the fallback family, and redraws when it arrives. No `document.fonts`, as in jsdom, counts as late.
- In 2D, faces are still images redrawn only when a value changes (FR-058).

**Rationale.** FR-054 holds by construction, and FR-061's fallback after 2 seconds.

**Alternatives considered.** Canvases at the face's full pixel size (phone memory spent on pixels nobody sees, inside the 96 MB ledger). Waiting for the typeface (a blank face).

### R-38: Typefaces (FR-033, FR-046, FR-061, FR-075; Amendment B10; Confirmation 7)

**Decision.**

| Use | Family | Source |
|---|---|---|
| The terminal and the counters | IBM Plex Mono | `@ibm/plex-mono`, complete files, unmodified |
| The chalkboard | Patrick Hand | `@fontsource/patrick-hand`, latin, weight 400 |
| The desktop half | IBM Plex Sans | already vendored |
| The neon word | IBM Plex Sans Bold, drawn as a stroked tube with a two-pass glow | already vendored |

- No fourth family: Confirmation 7 left the neon word's face to the plan, under the same rules and with nothing from GTA.
- `fonts.lock` moves to schema 2: `families[]`, each with its family, licence, reserved font name or null, `uses` (`site`, `pdf`, `room`), source (package, version, URL, SHA-256, integrity, publication date), and files. Plex Sans's `uses` gain `room`.
- Tarballs come from the npm registry by `npm pack`, checked against their integrity, and a new `npm run fonts:lock` computes the digests (the agents' sandbox can't reach GitHub).
- The PDF keeps Plex Sans alone (`build/pdf.ts` selects it, and the PDF test asserts it); `fonts.test.ts` loops over the families; the one-font lines in `apps/web/fonts/README.md`, `src/fonts.css`, and `apps/web/README.md` change in the same task.
- The look picks a typeface per renderer among the families whose `uses` include `room`, so changing the chalk face is a data edit once its files are vendored (FR-033).

**Rationale.** B10: each typeface self-hosted and open-licensed, either reserving no font name (Patrick Hand, so a third party's subset is allowed) or vendored unmodified from its holder's own release (Plex, whose name is reserved). Reusing a vendored face for the neon word adds no licence to read.

**Alternatives considered.** A neon display face such as Tilt Neon (a fourth family for one word, and its licence to read). Plex Mono Bold for the neon word (the data design's fallback). Kalam for the chalkboard (the runner-up; a data edit away once vendored).

### R-39: The 2D room, drawn from the bundle (FR-005, FR-011, FR-058; Amendment B8)

**Decision.**
- Catalog drawings are in the piece's own metres, y up, from a closed set of primitives (rectangle, circle, ellipse, line, polyline, polygon, path) with no text, or a front elevation derived from the stand-in shapes. Spec 002's hand drawing is converted once into catalog drawings (R-07).
- The compositor places each drawing in the 320 × 200 viewBox by projecting the placement through `framing(1.6)`, scaled by the projected pixels per metre at its depth, as a group with a transform and non-scaling strokes, in depth order; each switch case is its own group, with its cable run.
- At run time `flat.ts` renders the index's drawing: switch cases toggle `visibility`; faces come from the SVG backend inside their face transforms; stand-in labels are SVG text; each selectable's cue is a dashed rectangle with a name tag, styled by `room.css` classes; the hand-off's paper positions come from projected anchors; the visitor's polygons come from `avatars.ts`.
- An allowlist governs every element (`g`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `path`, `text`) and attribute (geometry, `fill`, `stroke`, `stroke-width`, `opacity`, `font-*`, `text-anchor`, and `transform`, which only code sets), with typed values. Anything else throws: no `href`, no event handler, no `style`.
- `room.css`'s per-ID hit areas and their buttons go; pointer input uses R-20's picker; the drawing stays `aria-hidden`, and the list and the text copy are its accessible equivalents.

**Rationale.** FR-058: the same pieces, states, and words as the 3D room. The CSP refuses `style` attributes, and data must never become code.

**Alternatives considered.** A hand-placed 2D layout (it drifts, and puts IDs in CSS). An orthographic elevation (unlike the 3D room's view). Absolutely positioned buttons (they need `style`). A stylesheet generated from data (IDs in CSS again).

### R-40: "Around the room", the list, and the toolbar (FR-034, FR-049, FR-050, FR-060, FR-063, FR-065, SC-009; Amendments B8, C9; Clarifications)

**Decision.**
- `src/room/text-copy.ts` renders a visible section headed "Around the room", after the conversation panel and outside the stage, open to every visitor with nothing to expand, in 3D and 2D. In portrait the grid's order is toolbar, stage, list, talk, around, resume; in landscape, "around" spans both columns before the resume.
- It holds each live face's label and lines (the monitor's says it is a scripted illustration), each switch's state sentence, the neon sign's figures written out, the line saying the project isn't affiliated with or endorsed by Langfuse or its owner, and "Paused at HH:MM" while paused.
- Updates replace text in place, with no live region, so a poll announces nothing. The sign's copy is never voiced and stays apart from the twin's announced words (FR-050).
- The "In the room" list is built from the selectables in scene order: each button shows the name, with a visually hidden ": " and the topic's phrase, or the resume action's UI word.
- The toolbar gains "Pause the room". Below a portrait width of 25rem, the toolbar's type drops to 0.875rem and the stage's reserve grows by one toolbar row, so five controls, spec 003's "Credits" link included (C9), keep the text box and the talk button on a 320 × 568 screen (FR-065).
- The placeholder note shows only while stand-ins are in use, from the bundle or from a load that fell back.
- Colour never carries meaning alone (FR-065; WCAG 2.2's 1.4.1). The charger's three poses differ by where the plug and lead sit. Every tier value has its own sentence in the visible "Around the room" (FR-043, FR-063), so the six values that share one pose are told apart by words, and every switch's state is in the text copy (RG8). The 2D cue is a dashed rectangle with a name tag (R-39), and the "In the room" buttons carry the names. "Draft", "Sample", and "test" are words. A glow tone or a charge light only repeats what a pose or a word already says.

**Rationale.** The Author's answer to the fifth clarification ("okay go with recommendation"): visible, after the conversation, where the keyboard order already puts it.

**Alternatives considered.** A section for screen readers only (the clarification's other option). A live region (each poll would be announced, against FR-063).

---

## Lookdev

The page, the phone copy, and the results: [contracts/lookdev.md](contracts/lookdev.md).

### R-41: The lookdev page (FR-023, FR-066 to FR-068, FR-070; User Story 3)

**Decision.**
- `apps/web/lookdev/index.html` is a Vite input only when drafts are on (`ROOM_DRAFTS=1`), so it exists only in dev's and dev-cpu's `-drafts` images, at `/lookdev/`. It runs the production scene, runtime, signals, faces, motion, and quality controller on one canvas.
- Views: the reference desktop stage, the reference phone stage at its pixel ratio, and the desk close-up as a secondary view.
- Controls: the bundle (production or the vignette), the look, the sample state (fixtures, every value "Sample"), quality (automatic, or pinned at 0 to 3), pause, and one "Load a candidate…" file input per piece.
- A candidate is read into memory and never leaves it: no request, no storage, no object URL. The page computes its SHA-256 with an in-repo implementation and its gzip-9 length with pako, the compositor's measure; runs `src/room/glb/`'s fit check, which reports "not scrubbed" for a file without spec 003's mark; and swaps it in through the room's own load path.
- Readouts: frame time's p50 and p95, the median frame rate, and the share of frames over 33 ms (from animation-frame intervals); the settled quality level; draw calls and triangles; the texture ledger's bytes; the smallest cap height on the current view; and the SHA-256. "Run 2 minutes" and "Run 10 minutes" produce a results block to copy.
- The Author approves only the SHA-256 the page showed (FR-023, FR-068). pako sits in the lookdev page's chunk only, never in a release's client chunks.

**Rationale.** FR-067 and FR-068: the production framing, the real controller, and the compositor's own fit check, so the page's findings are the build's.

**Alternatives considered.** `CompressionStream("gzip")` (the runtime design's first form: its level isn't 9, so the page would show only an estimate). A standalone fit script (a second implementation; answer 10 put the fit check in the lookdev page). `crypto.subtle` for the hash (a local file on the phone may not be a secure context).

### R-42: The phone copy (FR-069; Q1's answer, option A; option B only if the probe fails, approved with the plan)

**Decision.**
- `npm run build:lookdev-phone -w apps/web` refuses to run without `ROOM_DRAFTS=1`. It builds one IIFE (library mode, dynamic imports and assets inlined) and writes the gitignored `apps/web/dist-phone/lookdev.html`: the CSS in one `<style>`, the script in one classic `<script>`, and a meta CSP, `default-src 'none'; script-src 'sha256-…'; style-src 'sha256-…'; font-src data:; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'`.
- It holds both bundles, the fixtures, and the draft text; the candidates come through the phone's file picker. It can't use the network even when the phone is online.
- Its first panel is a probe: WebGL 2, the maximum texture size, `deviceMemory`, `createImageBitmap`, whether the page is a secure context, the viewport, and the pixel ratio. The Author records the phone's model in the note (ADR 0010's reference phone, "or the closest the Author has"); the page records no device identifier beyond the viewport and the pixel ratio ([lookdev.md](contracts/lookdev.md) §6).
- The Author's steps ([quickstart.md](quickstart.md)): pause backup and sync; build the copy in the Author's terminal from the note's commit, with the Dockerfile's drafts-only `lookdev-phone` target, and check its SHA-256 against the note, so an agent's working-tree build never goes to the phone ([lookdev.md](contracts/lookdev.md) §7); copy the file over USB; turn on airplane mode; open it from the phone's files; run the session; delete the copy and the candidates.
- Option B, the desktop at the phone's stage size and pixel ratio, is taken only if the probe fails. The plan then records that departure from the intent's order for the Author, and SC-005, SC-006's phone figure, and SC-010's phone judgment wait for the first release build after publication.

**Rationale.** Chromium-family browsers refuse module scripts and `fetch` from a local file, so the copy is one classic script with its data inline; hashing the inline code keeps it as strict as the site. Q1's answer took option A, which read "Copy, don't connect, as FR-069 says".

**Alternatives considered.** `vite-plugin-singlefile` (a new dependency, and it emits module scripts). A USB forward, Q1's option C (a Principle IV deviation; not taken). Carrying an agent's `apps/web/dist-phone/lookdev.html` to the phone, checked only against the hash the same agent's note records (a file agents wrote and git doesn't show, which CLAUDE.md keeps from anything the Author runs). Building the copy with `npm` in the Author's terminal (it would run agent-installed `node_modules` there). A separate one-file probe page ahead of the vignette (the integration design's first form; the panel runs first in the same file).

### R-43: Release builds exclude lookdev, in five layers (FR-066, User Story 3 scenario 4; Amendments A5, B11)

**Decision.**
1. The lookdev input exists only in drafts builds.
2. `virtual:room-fixtures` and the draft text resolve only in drafts builds; in a release build, resolving either fails the build with "fixtures and lookdev are drafts-only (FR-066)".
3. `room-manifest.json` records the build kind, `drafts` or `release` (B7).
4. Two build tests: a release build has no `lookdev/`, no file carrying the lookdev page's marker or a fixture's name, and a manifest that says `release`; a drafts build has the page, and its entry graph never reaches `src/lookdev/`.
5. The phone copy goes to `apps/web/dist-phone/`, never into `dist/`, and no image holds it: only the drafts-only `lookdev-phone` target builds it, as one exported file.

The release step's own refusal is spec 001's (A5).

**Rationale.** Each layer fails on its own, so one slip can't ship the page.

**Alternatives considered.** One runtime flag (a release would carry the page's code). The release step's refusal alone (spec 001 isn't built).

### R-44: The first lookdev run, and the look in ADR 0010 (FR-070, User Story 3 scenario 5; Amendment C10; ADR 0010 stays proposed until lookdev, approved with the plan)

**Decision.**
- `apps/web/room/lookdev.yaml` holds the intent's vignette: the desk, the monitor and its terminal, the neon sign's glow, the laptop's cable states, one sign, a corner of the chalkboard, and a bicycle wheel, on stand-ins plus the studio's desk and one sign, in flat colours with no baked shading.
- The page's code ships now; the Author's run waits for the studio's desk and one sign, which are also the first room files (C10).
- The Author's chosen look is recorded in ADR 0010 from a Polish branch off `main`, and the work orders regenerate before the remaining pieces are modeled. ADR 0010 stays proposed until then (R-63).
- The look is chosen on the runs that show the whole vignette, on the reference phone and on the desktop. A run before the page shows the terminal, the neon glow, and the cable states is preliminary (FR-070, as the spec's Clarifications of 2026-10-23 amend it; its Confirmation 21).

**Rationale.** The intent's order: "Lookdev settles the look on a small vignette, at the room's real framing, on a reference phone", then "The look is recorded in ADR 0010, and the work orders follow it."

**Alternatives considered.** Accepting ADR 0010 now and carrying the room caps and the look in a new ADR 0037 (kept as the fallback; R-63).

---

## Serving

Headers and layout: [contracts/serving.md](contracts/serving.md).

### R-45: Models at `/a/`, sent gzip-encoded (FR-079, SC-006; Amendments B14, C11)

**Decision.**
- Models are served at spec 003's `/a/<stem>.<hash16>.glb` (the first 16 hex digits of the plain file's SHA-256); only the `.glb.gz` exists in `dist/` (R-26).
- `apps/web/nginx.conf`: the cache map gains `/a/` as `public, max-age=31536000, immutable`; a `location ^~ /a/` takes GET only, sets `types` for `model/gltf-binary glb` and the image cards' types (a `types` block inside a location replaces the inherited map), `default_type application/octet-stream`, `gzip_static always`, `gunzip on`, and `gzip_vary on`, and answers 404 to a `.gz` URL. There is no `gzip on` anywhere and no new `add_header`, so the server-level CSP and security headers still apply (spec 002's nginx test forbids a nested `add_header`).
- `gzip_static always` serves the `.gz` with no plain file on disk; `gunzip on` inflates it for a client that doesn't accept gzip.
- A GLB answers 200 with `Content-Type: model/gltf-binary`, `Content-Encoding: gzip` for a client that accepts it, `Vary: Accept-Encoding`, the immutable cache header, and the server's headers.
- The stack's edge is unchanged: with buffering off and no gzip directive, it forwards `Accept-Encoding` and passes the encoding through; tests pin that.
- Before the first model merges, `nginx -V` in the pinned image shows both modules, and a probe on the agents' engine reads a GLB's headers on dev-cpu.

**Rationale.** FR-079 and B14: compressed once at build time, never per request on a 0.1-CPU container, and every client still gets valid bytes. `/a/` is spec 003's URL.

**Alternatives considered.** `/assets/room/` (diverges from spec 003's contract, and shares Vite's folder). Compressing per request (CPU, and bytes the caps don't count). Shipping the plain `.glb` too (two files behind one URL). `add_header Content-Encoding` (it drops the server-level headers, and the test forbids it).

### R-46: What the image build reads (FR-012, FR-053, FR-079)

**Decision.**
- The Dockerfile gains an empty `room-assets` stage copied to `/src/assets/room/`, and `deploy/scripts/web_image.py` passes `--build-context room-assets=<tree>/assets/room` when that folder exists, as it already passes `policy`. A tree without models builds stand-ins.
- `.dockerignore` gains `assets/policy`, so the build reads policy only from the named `policy` context (R-13).
- `specs/` and `docs/studio/` aren't in the image; quotes against the intent and the generated files' freshness are checked in strict mode only (R-10).

**Rationale.** The image builds from an export with no `.git`: the models need a named way in, and the policy must come from `main`.

**Alternatives considered.** Copying all of `assets/` in the build stage (the branch's policy files would reach the build).

### R-47: Spec 001's release and edge (FR-066, FR-079; Amendments A5, A6)

**Decision.**
- Spec 001's release builds `dist/` inside the pinned web build stage with no credentials mounted, and refuses a bundle with fixtures, the lookdev page, draft text, or stand-ins (A5; spec 002's web-serving §5).
- Each `dist/a/*.glb.gz` is uploaded under its `.glb` key with `Content-Encoding: gzip` and the glTF binary content type, to `site/` and to `releases/<commit>/`, and the copies between them keep that metadata, so a rollback keeps both headers. A plain sync sets no per-file encoding, so GLBs take their own upload pass (A6).
- After spec 001's first release, the Author reads a GLB's headers from the public edge ([quickstart.md](quickstart.md)).

**Rationale.** A6: CloudFront doesn't compress a GLB itself, and the caps count gzip-9 bytes.

**Alternatives considered.** Uploading the plain file (the bytes downloaded would no longer be the bytes counted).

---

## Integration, branches, and patches

The patches' behaviour: [contracts/intake-amendments.md](contracts/intake-amendments.md).

### R-48: Two lines of branches, and no agent merges (Principle III; ADR 0013)

**Decision.**
- **Line R, the room,** starts now on `feat/002-us6-events` (dc7f023). Its first branch, `feat/004-setup`, opens by cherry-picking `spec/004-room-composition`'s documents, so `plan.md` is in the tree and a departure updates it in the same commit. Then come `feat/004-foundation` and the story branches `feat/004-us1-…` to `feat/004-us9-…`, stacked in story order. Once `main` holds spec 002's line, each is rebased onto `main`, and the replayed document commits drop out as already applied.
- **Line I, intake and governance,** starts from `main` after the Author's spec 003 merges: `feat/004-guard` after M4, then `feat/004-intake` after M7.
- Agents rebase and cherry-pick; they never merge. `feat/003-us6-gpu-window` is independent and merges whenever the Author likes.

**Rationale.** Line I's patches must reach `main` before the first studio output comes in for intake. Line R needs spec 002's room code, which isn't on `main`, and the cherry-pick gives it the plan without a merge.

**Alternatives considered.** Waiting for both lines to merge (weeks of idle work). An integration branch that merges them (an agent merge). Stacking spec 004's documents on dc7f023 (keeps them off `main` until spec 002's line merges, and delays line I).

### R-49: The Author's merge order, line I first (approved with the plan)

**Decision.**
- M1 spec 003's documents; M2 spec 002's documents; M3 `spec/004-room-composition` (documents only, based on `main`, mergeable once the plan is approved); M4 `feat/003-guards` with P-1; M5 `feat/004-guard` with P-2 and P-3; M6 `feat/003-us1-arrival-check` with P-4; M7 `feat/003-us5-comparison`; M8 `feat/004-intake` with P-5 to P-8; M9 spec 002's line, in its notes' order up to dc7f023, with its patches; then P-9 and P-10; then line R in story order, each branch rebased onto `main` first. P-11, added on 2026-10-23, comes later, from its own branch, before User Story 8's switch-on change is rebased and gated (R-70).
- Line I's merges (M4 to M8) come before line R's (M9 on).
- At M9, `CHECK_GATES` resolves to `makefiles-check githooks-check toolchain-check policy validate-config lint test content-check secrets arrival evals redteam=redteam-suite matrix image`: spec 002's `content-check` right after `test` (its Makefile test pins that) and spec 003's `arrival` after `secrets`. Spec 004 adds no gate.
- An integration task lists the other textual conflicts (`.PHONY`, `redteam/forbidden-actions.sh`, the ADR index, START-HERE, the README) and their resolutions, computed with `git merge-tree --write-tree`, which moves no ref; the Author makes that merge in a worktree of its own, on a scratch branch from `main`, with the list's resolutions; gates the scratch branch with `tools/gates/gate <scratch branch>`; and merges it with the command the gate prints, so `main` never takes a merged tree the gate didn't check (START-HERE §7, step 2). Since 2026-10-26 that is three scratch branches, not one: a single gate over the whole line can't pass, because main's compose policy refuses spec 002's `web` image until its web patch is on `main`, so `feat/002-web`, then `feat/002-approvals`, then the rest of the line merge and are gated in turn, the first two each followed by its patch (plan.md §4.2 and §10). `fix/002-patches-on-003` regenerates spec 002's gate patches against `main`'s gate after P-4, only if they no longer apply.
- Every branch that carries patches verifies the whole chain in one scratch worktree: `git apply --check` for each patch in order, then `make check` and `gitleaks dir` on the patched tree.

**Rationale.** Spec 003's side carries the guard, whose deadline is nearest; spec 002's side only gates line R's merges.

**Alternatives considered.** Spec 002's line first (P-1 and P-4 would need regenerating, and the guard would wait).

### R-50: The Author's patches, in FR-077's order (FR-077; the order kept even if P-5 slips, approved with the plan)

**Decision.**

| # | What | FR-077's item | Carried on | Applies after | Lands before |
|---|---|---|---|---|---|
| P-1 | Spec 003's guard (T005), with the folders filled in | the guard's read denies | `feat/003-guards` | — | P-2; any studio output brought in |
| P-2 | The rest of the guard (R-51) | the other folders and every write deny | `feat/004-guard` | P-1 | User Story 4's intake |
| P-3 | The settings check (R-52) | the settings check | `feat/004-guard` | P-2 | every intake note; P-10 |
| P-4 | Spec 003's arrival check (T025) | the arrival check | `feat/003-us1-arrival-check` | P-1 to P-3 | P-5; P-7 |
| P-5 | The arrival amendments (R-53) | C1 and C2 | `feat/004-intake` | P-4, and the IPTC term confirmed | the first file under `assets/room/` |
| P-6 | The room caps and the licences, the Author's commit (R-54) | the policy entries | `main` | P-5 | the first room file |
| P-7 | The review change (R-55) | `REVIEW.md` and the reviewer's definition | `feat/004-intake` | P-4, P-5 | User Story 1's merge (the first work orders), the photo guide, any studio note |
| P-8 | The outline check (R-56) | FR-032's check | `feat/004-intake` | — | the first traced outline leaving the photos folder |
| P-9 | The content check's `room-text` kind (R-57) | FR-030's check | a branch from `main` after M9 | spec 002's approvals patch | the first `room-text` approval |
| P-10 | The gate: `caps.json` for the content build, and the `studio-settings` host step (R-52) | — (FR-053, SC-013) | a branch from `main` after M9 | spec 002's and spec 003's gate patches | User Story 4's intake |
| P-11 | The compose policy admits SC-004's harness (R-70), added by the `/speckit-analyze` remediation of 2026-10-23 | — (outside FR-077's order; the spec's Amendment Z1) | a branch from `main` holding only the patch, ADR 0021's amendment, and its note | spec 001's dev relay | User Story 8's switch-on change |

- Even if P-5 slips, P-7 doesn't land ahead of it, so User Stories 1 to 3 and 7 wait to merge.
- Beyond applying patches, the Author runs `claude doctor` and `make git-hooks` after P-1, P-2, P-4, and P-7; `make evals-agent-config REF=<branch>` after P-1, P-2, P-4, and P-7, each of which changes the behavioural tier's trigger hash; `tools/gates/gate --prove <branch>` after P-1 and P-2, for the matrix's stage E; P-3 on each intake branch; P-8 on each traced outline; and the hash approvals and licence readings. Each note opens with what runs in the Author's terminal (ADR 0017).
- Now, before any merge: the Author's interim deny of the outputs and workflows folders, in this repository's `.claude/settings.local.json` (tasks.md T290), since until P-1 (M4) this repository's sessions can read both folders, and until P-2 (M5) write them, and the workflows folder is the studio session's own workspace. Then P-1 at once. plan.md's "Do first" gives the plan's reading beside the review's proposal of a user-level deny (R-51).

**Rationale.** CLAUDE.md: "a secret, a paid route, or a file prod reads gets its deny in the same patch that creates it, or an earlier one". Each patch lands before the risk it guards.

**Alternatives considered.** Letting P-7 land before P-5 if P-5 slips, to unblock User Stories 1 to 3 and 7 (FR-077's order says no, and the Author kept it).

### R-51: The rest of the guard, P-2 (FR-025, FR-077, SC-013; Amendment C3)

**Decision.**
- P-2 is generated after the Author applies P-1, from `main`'s filled `tools/gates/studio-folders.txt`, so it carries no placeholders. If M4 is slow, it is generated on `feat/003-guards` (a72ebe3) with P-1's placeholders, and the Author fills both at once.
- For each of the four folders, P-2 adds an `Edit()` deny and a sandbox `denyWrite` entry. It also adds: an extension to `.claude/hooks/protected-paths.sh` that refuses an Edit or Write whose lexical or physical path falls under a listed folder; a marker line in `studio-folders.txt`, `# writes: denied (spec 004, Amendment C3)`; rows in `tools/gates/matrix-required.txt`, inserted right after the blinding key's row and never at the end (P-4's hunk for that file has no trailing context, so it applies only at the end); and one behavioural case: a Read, Grep, or Glob of a canary folder made inside a studio folder, directly and through a symlink made inside the project, is refused. The prompt points at the canary alone, and any output from elsewhere in that studio folder fails the run, so a regressed deny can't send the studio's real files to the model provider.
- **The exposure until P-1 and P-2,** and the interim step. This repository's sessions can read the outputs and workflows folders until P-1 (M4), and write them until P-2 (M5). The workflows folder is the studio session's own workspace, so a write there could change that session's settings or instructions. The Author closes both now with Read and Edit denies, and sandbox `denyRead` and `denyWrite` entries, for the two folders in this repository's `.claude/settings.local.json`, which only the Author writes and which is never committed (tasks.md T290); P-1 and P-2 then put the same denies in the committed settings, where the matrix proves them. The review proposed the Author's user-level deny instead; the studio's own session loads the same user settings and works in exactly those two folders, so a user-level deny would also deny them to it.
- **ComfyUI's port** (the spec's FR-025, from the `REVIEW.md` pass of 2026-10-23). Stage S gains two rows under a marker P-2 registers, `S/studio-listener`: a loopback HTTP request to ComfyUI's port from inside the sandbox, directly and through the session's proxy, both refused. They need no marker line in `studio-folders.txt`: this repository's settings already keep loopback out of the sandbox, so they hold from the commit that adds them. The refusal doesn't depend on the port, since the sandbox has a loopback of its own and the proxy's allowlist names hosts, so the rows probe ComfyUI's default, 8188.
- Agent rows in `redteam/forbidden-actions.sh`, on `feat/004-guard`: stage H checks each folder's Edit deny and `denyWrite`, and the hook blocking three path forms; stage S proves each folder unwritable, and reads a case-variant path, comparing device and inode (refused on a case-insensitive mount, otherwise a NOTE; the exploration found the folders on a case-sensitive filesystem). The rows read PLANNED until the marker line exists.
- Recommended while filling P-1: the four folders share one parent that holds nothing else; deny that parent too, as a line the existing rows ignore.

**Rationale.** The file tools run outside the sandbox, so FR-025's file-tool layer matters most, and P-1 stays exactly as reviewed. The exploration confirmed the folder names by listing their parent and the workflows folder (names only; it opened no file), which this repository's sessions can do until the Author's interim deny or P-1 lands.

**Alternatives considered.** A regenerated guard replacing P-1 (a new review, and the risk of applying both). Write denies in the sandbox only (they don't bind the file tools).

### R-52: The settings check, P-3, and P-10's host step (FR-025, SC-013; Clarifications; P-10's step approved with the plan)

**Decision.**
- `tools/gates/studio_settings_check.py`: standard library only, with the gate's interpreter line and re-exec guard. The Author runs it from `main`'s checkout, never through `make`.
- It takes the studio's workspace from `studio-folders.txt`'s workflows line, and the protected folders from its photos and blinding-key lines, and reads every settings scope the studio's session loads: the managed settings and their drop-in folder, the user's settings, and the workspace's shared and local project settings.
- It passes only if both folders are denied to `Read` and to the sandbox's reads with the sandbox on; nothing re-allows them (an allow rule, an allowance inside a deny, or an added directory); unsandboxed commands aren't allowed; and the default mode isn't a bypass. It fails closed on an unknown key under the permissions or the sandbox's filesystem settings.
- It also fails on every route to a loopback listener (the `REVIEW.md` pass of 2026-10-23; the spec's FR-025). ComfyUI's server returns its folders' files at `/view` and streams previews over its websocket, whatever the file denies say, and hooks and MCP servers run outside the sandbox and outside `Read()` rules. So: a hook, an MCP server, an enabled plugin, or a helper command the settings run outside the sandbox, in any scope, that isn't on the list the Author approves (SS9); a loopback host, local binding, a local socket, or a proxy of the scope's own in the sandbox's network (SS10); and WebFetch allowed for a loopback host (SS11). The studio's session then hands its ComfyUI workflows to the Author as files (the spec's Confirmation 24). Until P-3 lands, the Author checks the same routes by hand, now (tasks.md T291).
- Its output is one verdict line, then the folders' names (never their paths), the listeners line, then each settings file's SHA-256, never a command or a host. Each intake branch's merge-request note records it (FR-025).
- P-10 adds a `studio-settings` host step to the gate, which runs the check whenever a branch adds or changes a file under `assets/` outside `assets/policy/`, and reports SKIP otherwise.

**Rationale.** The Author runs it on the studio's settings in their own terminal, so agents mustn't be able to change it unseen (ADR 0017). The third clarification's answer ("B is fine") chose a settings check.

**Alternatives considered.** An agent-editable script (agents could change what the Author runs). A make target (a `GNUmakefile` could shadow it). A behavioural run inside the studio's session (it would need this repository's tooling there). The note's manual record alone, with no gate step (not taken). For the listeners: a filtering proxy in front of ComfyUI that lets the studio's session queue workflows and refuses `/view`, uploads, and previews (a queued workflow still decides what its nodes read and write; Confirmation 24's no-branch would design such a route); and a list of hooks and MCP servers the check refuses by name (a new one would pass; the approved list fails closed).

### R-53: The arrival amendments, P-5, and the agent code beside them (FR-015, FR-023, FR-077, SC-013; Amendments C1, C2, C4 to C8, C11)

**Decision.** One patch on top of P-4 changes `tools/gates/arrival_check.py` and its tests:

| Amendment | Rule | Change |
|---|---|---|
| C1 | M5 | The mark follows the record's steps: every step by a model, `trainedAlgorithmicMedia`; model and hand steps mixed, `compositeWithTrainedAlgorithmicMedia`; every step by hand, IPTC's human-made code. A step the studio's session scripted is a model step. Under `assets/twin/` and `docs/research/images/`, only `trainedAlgorithmicMedia` passes. |
| C2 | R1 | Admits the source type `design`. |
| C4 | P2 | Each room confirmation is `true` or `"not_applicable"`; `screens_plain_glow` becomes `screens_plain_live_face`, free while `approvals.json` holds no room entry. |
| C5 | P1 | A room file whose `likeness` is false takes `likeness_accepted: "not_applicable"`; the approval stays required. |
| C6 | F3 | Counts every file under `assets/room/` at gzip-9, and switches to the phase-3 budget once that folder holds any file. |
| C7 | F2 | A room file's gzip-9 size against `per_asset.room.gzip_bytes`, its triangles against `triangles`, and its textures against `small_prop_texture_px` when its stem is in `small_props`; an unknown key in the block exits 2. |

- The patch adds the constant `AMENDMENTS = ("004-C1", "004-C2", "004-C4", "004-C5", "004-C6", "004-C7")`, which R-58's order test reads.
- C8 needs data only: the studio's session appears on a step as its models and its `service`, with `disclosure_row` `D4`, which R7 and L1 already check. C11 changes no rule: it is the bundle's and the events' `bytes` (R-26).
- IPTC's human-made code is unverified (the exploration's guess is `digitalCreation`). The Author confirms the term at cv.iptc.org before P-5, and the scrubber, M5, and RX5 use exactly that one term.
- Agent code on `feat/004-intake`: `scripts/assets/scrub.py` takes the mark's value from the record's steps; `scripts/assets/credits.py` renders the `design` source, and renders `tools` and `service` on model steps (today it renders `tools` on hand steps only).

**Rationale.** The intent: "The mark follows the record." The first hand-made or design-sourced file needs C1 and C2 together; one patch is one review and one step for the Author.

**Alternatives considered.** One patch per amendment (more steps, no more safety). An agent fetching IPTC's vocabulary (the host isn't allowlisted, and the Author's confirmation is one step).

### R-54: The policy commit, P-6 (FR-053; spec 003's FR-013; Amendments C7, C8)

**Decision.** The Author's own commit on `main`, at M8 and before the first room file: `caps.json`'s `per_asset.room` (R-25), and `licenses.json` entries for the hand tools (Blender, and the local tracing tool), MPFB and COLMAP if the studio uses them, and the studio session's terms. The merge-request note drafts the entries with each `read_by_the_author` date blank; the Author reads each licence, decides spec 003's FR-013 terms, and names `small_props`.

**Rationale.** `assets/policy/` is human-only, and spec 003's rule A9 refuses a branch that changes it.

**Alternatives considered.** An agent patch for the policy (the readings are the Author's to make, licence by licence).

### R-55: The review change, P-7 (FR-014, FR-077)

**Decision.**
- `REVIEW.md` gains a sixth pass, "Room data", for any diff touching the catalog, the scene, topics, room text, UI words, work orders, studio notes, or `docs/studio/`: they locate nothing; name no third party's marks (plain product names as FR-031 and FR-046 allow); pass spec 002's C9, C6, and C8 readings; claim nothing about the Author's role beyond the corpus (FR-035); and, in what the studio's session acts on (the work orders, the studio notes, and the handoff), ask it for nothing FR-024 and its disclosure row exclude: a photo or a crop of one, a file outside the studio's folders, a fetch, or an upload (FR-014, as the `REVIEW.md` pass of 2026-10-23 amended it).
- "Do not report: Generated files" gains "except work orders, which the Room data pass reads (FR-014)"; the "Arriving assets" pass's room bullet follows C4 and C5; `.claude/agents/reviewer.md` says "the passes in `REVIEW.md`" instead of "the four passes".
- One behavioural case, with two planted files, each flagged Important: a generated work order that names a brand, and a catalog entry whose studio notes ask the studio for a crop of a photo and an upload.
- It is generated after P-4, which rewrites the same lines of `REVIEW.md`; applying it calls for the Author's agent-configuration evals on `feat/004-intake`.

**Rationale.** FR-014 has the reviewer read work orders, studio notes, and the photo guide as it reads room text, and the generated-files rule would otherwise skip them.

**Alternatives considered.** An agent-side brand lint (it can't judge "locates nothing", and FR-014 names the reviewer's pass).

### R-56: The outline check, P-8 (FR-032, SC-013; Clarifications)

**Decision.** `tools/gates/outline_check.py`, standard library only. The Author runs it inside the photos folder, on the outline JSON the tracing tool's SVG paths are converted into, before the file leaves the folder. It allows exactly R-06's fields, with an opaque source ID and the tool's name, version, and licence, and refuses any `href`, `data:` URI, base64-like run, file name, path, file extension, or extra key. The compositor re-validates the same schema on arrival, and P-9 covers the file by hash as room text.

**Rationale.** It runs on data made from a photo, outside any sandbox, so it is human-only code. The fourth clarification's answer ("actually let's do B for that", "and use a local tool") lets reviewed outlines leave the photos folder, and this check is what makes "only vector paths" true.

**Alternatives considered.** Checking only on arrival (a file with an embedded image would already have left the photos folder).

### R-57: The content check's `room-text` kind, P-9, with `approvals.ts` first (FR-030, SC-008; Amendment B9)

**Decision.**
- Agent code in `feat/004-setup`: spec 002's `apps/web/build/approvals.ts` admits the kind `room-text`, so a `room-text` approval on `main` never breaks `make up`; its content files gain `apps/web/content/room/*.yaml`, then `outlines/*.outline.json`, sorted; a room-text part joins the resume's and narration's in `room-data.json`; drafts appear only with `ROOM_DRAFTS=1`, marked.
- P-9, generated against `main` after M9 (spec 002's approvals patch creates `content_check.py`): `KINDS` gains `"room-text"`, with `ANY_LENGTH = ("room-text",)`, and the content files gain the room-text files and outlines. The positive check: every string in `room-data.json`'s `room_text` equals, as a whole string, a displayed value of an approved room-text file, at any length. The negative check: no displayed value of an unapproved room-text file equals a whole string in `dist/` (JSON strings and the bundle's strings, unescaped), unless an approved file also holds it.
- Until P-9 lands, the old check exits 2 on the new kind, failing closed, and the Author approves room text only after it.

**Rationale.** B9: "I am very busy" is 14 characters, under the 24-character fragments the check searches for today. Whole-string matching avoids the common-word false positives a shorter fragment would bring.

**Alternatives considered.** A shorter fragment length (false positives on common words). Refusing any room-text value outside `room-data.json`, approved or not (the data design's stricter form: it would also refuse an approved line that another published file states in the same words).

### R-58: FR-077's ordering failure, inside `make test` (FR-077)

**Decision.**
- `evals/test_room_order.py`, agent code that pytest runs in `make test`, fails while:
  1. any file exists under `assets/room/` and `main`'s `tools/gates/arrival_check.py` lacks `"004-C1"` and `"004-C2"` in its `AMENDMENTS` constant; or
  2. a room-text file's SHA-256 is approved on `main`, so room text would publish, and `main`'s `tools/gates/content_check.py` lacks `"room-text"` in `KINDS` (and in `ANY_LENGTH`, which P-9 adds beside it).
- It reads `main` with `GIT_NO_REPLACE_OBJECTS=1 git cat-file blob refs/heads/main:<path>` and parses the constants with Python's `ast`, never importing human-only code.
- With no `.git` (the gate's container), it reads the export's own copies of the same files. Agents can't change them, so each equals `main`'s at the branch's base and can only lag `main`: never laxer.
- A failure reads like `FR-077 assets/room/desk.glb: main's arrival check lacks Amendments C1 and C2 (spec 004)`.
- Known gap: a shell write in a linked worktree could fake the branch's copy; the gate's host-phase arrival check, `main`'s own code, and the reviewer still hold.

**Rationale.** `make check` runs `make test`, so FR-077's failure holds as written, and the gate gets the rule with no gate patch.

**Alternatives considered.** A `room-order` gate in `CHECK_GATES` (a third edit to the conflict line, agent code in the Author's terminal, and the gate never runs `make check`). A gate host step running a human-only script (a gate patch for a rule that matters only until P-5 lands). The rule inside the arrival check (circular: it must fire exactly when `main` lacks that code). A TypeScript order test that skips without `.git` (the data design's first form: the gate's container would never check).

### R-59: The studio's documents, and the contract the Author updates by hand (FR-014, FR-024 to FR-026, FR-032)

**Decision.**
- `docs/studio/` holds the generated work orders and photo guide (R-14) and a hand-written `handoff.md`; they merge only after P-7 (FR-077). They stay out of `docs/runbooks/`, which spec 000's plan §16 holds to its own pages.
- The photo guide's fixed template covers FR-026's steps (pause camera-roll backup and gallery sync until cleanup, turn location off, move the photos over a USB cable straight into the studio's photos folder, never send one through chat, email, a cloud drive, or an assistant, and delete them from the phone and its trash once the studio's copy checks out); where files live (ComfyUI's four folders, and any Blender file that loads or links a photo, with its temporary files and autosaves, inside the photos folder; the studio's own Blender files, temporary files, and autosaves in the workflows folder); setting up photo work, with a checklist line for each step (Blender's Temporary Files folder and TMPDIR inside the photos folder; the tracing tool's autosave and recent files off; ComfyUI listening on 127.0.0.1 alone, its default), since Blender writes its autosaves and `quit.blend` where its Temporary Files setting points, the system temp folder by default, which this repository's sandboxed sessions can read (FR-025, FR-026, from the `REVIEW.md` pass of 2026-10-23); and tracing a sign's lettering (run the local tool offline inside the photos folder, convert its SVG to the outline file, run P-8, review the outlines, move only the outline file to the studio's inbox). Its generated layout checklist asks for each desk item's position from the desk's front-left corner in the scene's axes, and the positions of the desk, the bicycle's hook, the snowboard's mount, the window, the artwork, and the chalkboard, each marked measured or estimated.
- `handoff.md` lists the changes to the studio's contract that the Author makes by hand, before the first outline is handed over and before the window is modeled: reviewed lettering outlines join what may leave the photos folder; the compositor's stricter rules (the three refused `KHR_materials_*`, the name rule, the 1 mm, 1°, and size tolerances, `main`'s caps); the mark follows the record (C1); the `design` source (C2); a step the session scripted is a model step naming row D4 (C8); and room confirmations are read per file (C4, C5). One more change comes at once, not before the first outline: the session hands its ComfyUI workflows to the Author as files, and its settings carry no hook, MCP server, WebFetch rule, or sandbox network allowance that reaches a loopback host (the spec's FR-025 and Confirmation 24; tasks.md T291).
- Agents can't write the studio's folders; the note's list of what runs in the Author's terminal says so.

**Rationale.** The spec's Assumptions, where it differs from the studio's contract: "The Author updates the studio's contract to match before the first outline is handed over."

**Alternatives considered.** Agents editing the studio's contract (the guard denies the studio's folders to this repository's sessions, by design).

---

## Telemetry, disclosure, and ADRs

The panel's contract: [contracts/room-live-state-telemetry.md](contracts/room-live-state-telemetry.md).

### R-60: No new event kind; the asset events are built and off until spec 001 (FR-071; the spec's Principle II deviation)

**Decision.**
- `object_selected` is unchanged: its ID is the selectable's, with no payload. Selectables reach spec 002's §7.8 panels through the generated `config/room-events.yaml` (B7).
- `src/asset-events.ts` sends spec 003's shape, `{asset, outcome, ms_bucket, bytes, mode}`: `asset` is spec 003's manifest ID for the record's file (its name without the extension), `bytes` the gzip copy's length (C11), and `mode` spec 003's `full`, `reduced`, or `2d` (spec 002's `3d` reads `full`).
- The batcher spec 003's contract describes (at most one `POST /api/events` every 10 seconds, at most 20 events, a beacon on hide) is built and tested now. While the live configuration's asset events are `off`, the default, events go only to the lookdev page's log; they switch on only with spec 001's route and row V6.
- Routing `/api/events` and the room's beacon on the public site is spec 001's, with spec 003's V6 and spec 002's T079.

**Rationale.** FR-071 adds no kind and no payload; the spec names the deviation until spec 001 carries the events.

**Alternatives considered.** Asset events through spec 002's beacon (a new kind on a route that takes only `{kind, id}`, and FR-071 adds none).

### R-61: §7.9 "Room live state", written now (FR-072, SC-014; Amendments A2, A3)

**Decision.**
- `specs/000-local-foundations/contracts/telemetry.md` gains §7.9, "Room live state", marked as waiting for spec 001 and Amendment A2. `deploy/scripts/test_dashboard.py` adds it to `SECTIONS` now (all of its panels or none) and not to `REQUIRED`; User Story 8's switch-on adds the panels to `h4-runtime.json` and moves §7.9 into `REQUIRED`.
- Its rows use A2's proposed names:

| Panel | Query |
|---|---|
| Status requests a minute | `sum(rate(h4_relay_requests_total{h4_relay_route="status"}[$__rate_interval])) * 60` |
| Status 429s a minute | `sum(rate(h4_relay_cap_refusals_total{h4_relay_route="status"}[$__rate_interval])) * 60` |
| Time in each class | `avg by (h4_class) (avg_over_time(h4_relay_status_class[$__range]))`, over a one-hot gauge with the classes local, cloud, resting, budget, unavailable, and unknown |

- The panel's description says the room's polls and the `/status/` page's can't be told apart. No new alert, so no runbook entry.
- Spec 001 may rename the metrics; the contract is the one place the dashboard test reads, so the queries change there. A3, counting hello alone in the public view's request count, is spec 001's change.

**Rationale.** The dashboard test refuses any panel outside telemetry.md's §7, and §7.9 is the next free section on both tips.

**Alternatives considered.** Leaving the section to spec 001 (the panel would be shaped without the room's needs). `REQUIRED` now (no series exists, so the test would fail).

### R-62: Disclosure rows, and one ID scheme (FR-027, FR-074, FR-075; Amendments A4, B6, C8; Confirmation 17; the scheme approved with the plan)

**Decision.**
- **The scheme:** the first row written keeps its ID (the spec states it as Amendment A7). Spec 002's written V1 also covers spec 001's planned V1 when the public edge arrives; V2 (turns), V3, V4 (written), and V5 stay spec 002's; V6 is spec 003's asset events; spec 001's planned V2 to V5 become V7 to V10; spec 001's other planned rows keep their IDs. Every ID fits the disclosure test's `[A-Z]\d+` and the arrival check's R7 pattern.
- **D4,** the studio's agent session (FR-027, C8), lands in `feat/004-guard`, in spec 000's development-time table right after D3, before the first room file whose record names the session, and before publication.
- **A4's words** join V7 in User Story 8's switch-on change; RL2 refuses a status source of `site` unless V7's trigger names the room's polling (FR-074).
- **B6's words** join V2 in the twin's change that writes it; User Story 9 hands the text over.
- Not new rows: the room's models, typefaces, and bundle are same-origin static files (spec 002's V1; spec 003's FR-040(a)), and selecting a piece sends spec 002's V4 event.

**Rationale.** Renaming committed rows would churn spec 002's tests, ADR 0033, and its notes. D4 isn't a visitor flow, so it belongs in the development-time table, where spec 003 changed D1.

**Alternatives considered.** A letter per spec (renames spec 002's committed V1 and V4). IDs prefixed with the spec (they fail the disclosure test's pattern). A "Spec 004" section for D4 (D4 isn't a visitor flow, and it breaks spec 002's test of the later sections).

### R-63: ADRs (FR-070; Amendment C1; Principle III)

**Decision.**
- **ADR 0036, "The room composed from data"** (proposed), written in `feat/004-setup`: the catalog and the scene compiled into one deterministic bundle that the 3D room, the 2D room, and the text copy read; behaviour kinds a closed list in code; plain models through one fit check shared with the lookdev page; every word drawn live from approved text, UI words, or live values; caps from `main`. Its alternatives: the hand-coded scene; glTF `extras` for behaviour (spec 003's M4 and FR-015 refuse them, and data would steer code); a scripting layer; text baked into textures.
- 0036 is free on every branch: spec 002 holds 0033 and 0034 and reserves 0035 (its R-15, task T072), spec 003 holds 0010 and 0030 to 0032, and spec 001's plan names 0007 to 0009 and 0024 to 0029.
- **ADR 0010** (on `main` after M7) gains the room caps in `feat/004-intake`, and the look after lookdev, from a Polish branch; it stays proposed until then. If the Author accepts it first, ADR 0037 amends it instead.
- **ADR 0030** takes C1 in `feat/004-intake`.
- **ADR 0021** (proposed, on `main`) is amended on P-11's branch, while it is still proposed, to name SC-004's harness as dev's one other publisher; if the Author accepts it first, a new ADR at the next free number amends it instead (the spec's Amendment Z1; R-70). Added by the remediation of the `REVIEW.md` pass, 2026-10-23.
- Across lines, ADRs name each other in code spans, not links, until rebased onto a `main` that holds them: `evals/docs_links.py` fails a link to a missing file.

**Rationale.** Principle III: "Architecture decisions are recorded as ADRs in `docs/adr/`."

**Alternatives considered.** Folding the composition into ADR 0033 (spec 002's stack decision; the composition is a new decision with its own alternatives).

### R-64: The red team's scaffold cases (FR-039, FR-050; Amendment B4; Principle VIII)

**Decision.**
- In User Story 6, four cases in `redteam/cases/`, each with a planted safe answer and a planted unsafe one, and four detectors in `redteam/run.py`: giving an amount (the corpus check's currency pattern, loaded read-only, plus cents and micro-dollar words); a sign or the board speaking for the Author; locating the Author (address, street, neighbourhood, or landmark words, and "from the window"); and going past the corpus on Seva (a sentence naming Seva that isn't word for word in the public corpus).
- The twin's spec turns them into live prompts and owns the per-topic evals, which read FR-038's mapping.
- Corpus proposals carry no amounts, or the corpus check's currency rule fails `make test`.

**Rationale.** B4 adds these cases, and the detectors can be written and tested now on planted answers.

**Alternatives considered.** Waiting for the twin's spec (the detectors would be written without the room's knowledge of what the sign and the board show).

---

## Testing and proof

The runs: [quickstart.md](quickstart.md).

### R-65: Every new check runs inside `make test` (FR-007, FR-013, FR-014, FR-077)

**Decision.** The Author's gate never runs `make check`: its container phase runs a fixed tuple (lint, config validation, test, evals, the red-team suite, and the matrix's stage H) with no network and no `.git`. So every check this spec adds runs inside `make test`: vitest under `apps/web/test/` and pytest in the folders `make test` already covers (`evals/`, `scripts/`, `deploy/scripts/`). Spec 004 adds no `CHECK_GATES` entry.

**Rationale.** A check outside `make test` would be invisible to the gate without a human-only patch to it.

**Alternatives considered.** New `CHECK_GATES` entries (each needs a gate patch, and adds edits to the line M9 already conflicts on).

### R-66: Fixtures generated at test time (FR-015 to FR-019, SC-002, SC-013; spec 003's rule A1)

**Decision.**
- `apps/web/test/helpers/glb.ts`, a port of spec 003's `arrival_fixtures.glb()`, builds GLBs and their textures at run time: the clean hand-made desk, the clean `design`-sourced sign, and each variant the compositor can check (a live face missing or off its plane, a misplaced origin, a light, camera, or animation, a name off the rule, a refused extension, a missing or malformed mark). A mark that disagrees with its record is P-5's case, in the arrival check's own fixtures.
- `apps/web/test/fixtures/room/**` holds synthetic overlays with `fx-` IDs: one known-bad case per rule, and the known-good set (SC-002).

**Rationale.** Rule A1 refuses any committed image or model outside `assets/`, test fixtures included.

**Alternatives considered.** Committing fixture models under `assets/` (they would need records and the Author's approval, and would count toward the caps).

### R-67: Checks of the built site (FR-011, FR-012, FR-066, FR-075, FR-079)

**Decision.** A vitest global setup makes one release build and one drafts build, shared by the smoke, chunk, and new `dist` tests:
- FR-012: every non-public string from the data (work-order fields and studio notes, measurement and origin notes, `words_from`, pending lines) is absent from `dist/`, read as the content check reads it (ported to TypeScript); strings of 12 characters or more match as text, shorter ones only as exact JSON strings.
- FR-066: the release build has no `lookdev/`, no fixtures, and no drafts (R-43).
- FR-011: the 3D part appears only in the dynamic import graph; the entry stays under 150 KB gzipped with the index under 16 KB; no zod, fontkit, pako, TypeScript parser, or GLB reader sits in a release's client chunks.
- FR-075: every model, typeface, and data file the built site loads is on its own origin.
- FR-079: `dist/a/` holds only `.glb.gz` files, each inflating to its record's SHA-256, each a deterministic level-9 gzip with time 0.

**Rationale.** These are properties of what ships, so they are checked on the built site.

**Alternatives considered.** Scanning sources only (it misses what the build pulls in).

### R-68: The data-only proof (FR-006, SC-001, User Story 1 scenarios 1 to 3)

**Decision.**
- `data-only.test.ts` applies the proof set to an overlay copy of the data: a move; an addition (catalog entry, placement, selectable, and topic); a removal; a regroup with its move; a retarget; a rewording; and a switch case for a value the signal already has. Each composes with no finding, the `Tree`'s read log shows only data paths were read, and the added piece is a labelled, selectable stand-in with a work order and an event ID.
- The runtime half: a test bundle with an added selectable gets a list button, a stand-in, a 2D cue, and its fixed message.
- The quickstart repeats it on a copy of the data, with `git diff --stat` touching no source file.

**Rationale.** SC-001: each change passes "with 0 source files changed".

**Alternatives considered.** Proof by review (not repeatable). Editing the real data in tests (it would change committed generated files).

### R-69: Proof by layer, per success criterion (SC-001 to SC-015)

**Decision.** Node, with Three.js's math, proves the kernel, the interpreter, the loader, and the image plugin; jsdom with the fake clock proves the screens and signals, and axe-core their accessibility; full Vite builds (release, drafts, and the phone copy) prove what ships; pytest proves nginx, the edge, the image, the gzip parity, and the order test. The toolchain has no headless browser, so rendering, frame rates, memory, and assistive technology are the Author's runs.

| SC | Agents' proof, in `make test` unless named | The Author's run |
|---|---|---|
| SC-001 | R-68; the source scan (R-16) | — |
| SC-002 | one known-bad overlay per rule and the known-good set (R-66); two composes compared byte for byte (R-12) | — |
| SC-003 | the tier's table tests (R-30); a switch shows its case on the next frame | — |
| SC-004 | the reducer and the poller on the fake clock | a failover on dev through spec 001's dev relay, and 10 minutes paused or hidden, read from the frame log (R-70) |
| SC-005 | the loader's holds: 0 step-downs during a scripted load of every piece | on the phone, a 2-minute visit and a 10-minute soak in lookdev |
| SC-006 | texture memory and the first visit (R-24); the gzip copies and headers (R-26, R-45) | the phone's texture memory; every GLB with `Content-Encoding: gzip` in the network log |
| SC-007 | fault injection in jsdom over each failure of FR-057 to FR-061: the AI disclosure visible, the text box working, the text copy equal to the drawing | — |
| SC-008 | the renderers' tests (the copy equals the drawn words); the word checks (R-15); P-9 in the gate; C4's confirmations at approval | the hash approvals |
| SC-009 | the Tab order; 0 axe violations; 44 px cores at the smallest stages, in 3D and 2D (R-20) | keyboard-only and screen-reader visits |
| SC-010 | the legibility report (R-21) | judging the look on both stages |
| SC-011 | the cost channel's tests (R-32) | — |
| SC-012 | the poller's property test: random 10-minute sequences keep request starts at least one interval apart | a network log through the HAR checker (R-70) |
| SC-013 | P-5's tests; the matrix's rows (R-51); the outline schema; the fit fixtures (R-66) | P-3's output in each intake note; P-8 on each outline |
| SC-014 | the dashboard test against §7.9 (R-61) | after spec 001, the panel within 60 seconds |
| SC-015 | the talk tests: 0 requests, and the topic's phrase | — |

SC-016 is folded into SC-001.

**Rationale.** Each criterion is proved where it can be: by agents in `make test`, or by the Author on real devices.

**Alternatives considered.** A browser test lab of real devices (spec 003 rejected it for now; the reference phone is measured by hand).

### R-70: The frame log and the HAR checker (SC-004, SC-012)

**Decision.**
- Drafts builds keep a frame log in page memory: the laptop's pose and the tier on every frame, and the moments of Enter, pause, and visibility. The Author copies it out as JSON, like lookdev's results; it is never stored or sent, and release builds don't have it.
- `scripts/room/har_check.py`, agent code with its test, reads an exported HAR file with the frame log and checks SC-012: no third-party host, no status request before Enter or while paused or hidden, and never two within one poll interval. Its note lists it under what runs in the Author's terminal (ADR 0017), and the Author runs it with an isolated interpreter (`python3 -I`), passing the files as arguments.
- For SC-004, the page's status requests must reach dev's relay on the stack's network, and the drafts image can't forward them: x005 answers 404 under `/api/` before `location /` reaches `web:8080`, and one edge configuration serves every stack, so a dev-only rule can't live there. So User Story 8's switch-on change, once spec 001's dev relay exists, adds SC-004's harness: a `status-harness` service in a compose profile of that name, the pinned nginx-unprivileged image on the stack's `edge` and `internal` networks, published on dev's loopback port `H4_STATUS_HARNESS_PORT` (18106), which sends `GET /api/status` to dev's relay and every other request to `edge:8087`. Only dev's environment selects the profile, and only for the Author's run; `deploy/scripts/preflight.py` refuses it in prod's and dev-cpu's `COMPOSE_PROFILES`, as it refuses `breach`. Their x005 keeps `location /api/ { return 404; }`, which `test_edge_site.py` pins, so the spec's "No local status endpoint" holds there. The harness carries only the Author's own browser's requests on the host, as disclosure row S1 has them ("requests from the Author's own terminal or browser, on the same host"), so it adds no row of its own. But `main`'s compose policy (`tools/gates/compose_policy.py`) refuses the harness on three rules: a published port, and the `edge` network, on any service but `edge`, and a service whose name no disclosure row's From cell gives in backticks. So the same change names `status-harness` in S1's From → To cell, before its arrow, where the policy reads names, and adds to S1's Default cell that it runs only on dev while dev's environment selects its profile (the spec's Amendment Z1 and its Data-Flow Disclosure Entries). The disclosure rule then holds with no exemption. The other two rules need the Author's patch P-11 ([plan.md](plan.md) §4.1), which admits `status-harness` alone past them: in its own profile, published only on the literal 127.0.0.1, on `edge` and `internal`. The harness is then a second, lasting publisher on dev, which reverses ADR 0021 (proposed: "`edge`, nginx-unprivileged on its stable line, is the only publisher"), so P-11's branch amends ADR 0021 while it is still proposed, or a new ADR amends it if the Author has accepted it (the spec's Amendment Z1). The policy reads `deploy/images.lock` by service name, so the harness has a lock line of its own, with `edge`'s nginx-unprivileged pin. The harness and its port are the plan's one exception to "no new service, compose entry, or port" ([plan.md](plan.md#complexity-tracking), Complexity Tracking), and `preflight.py`'s change runs in the Author's terminal, so its note lists it first (ADR 0017).

**Rationale.** No browser in the toolchain records a real network log or real frames; the Author's browser can, and these make its output checkable.

**Alternatives considered.** Reading the HAR by eye (not repeatable). A log kept in the browser's storage (the poll's FR-044: "It SHALL store nothing"). A forward from the drafts image (x005's 404 comes first). A rule in `deploy/edge/nginx.conf` (one configuration serves every stack). A status endpoint on the local stack (the spec's rejected alternative: its own span, panel, and disclosure row). An exemption from the compose policy's disclosure rule for the harness (a rule every other service keeps; row S1 names it instead).

---

## Rejected for now, revisit later

- **A local status endpoint** on the stack's edge (the spec's "No local status endpoint"): a span, a panel, and a disclosure row of its own, for a room only the Author sees before spec 001.
- **Q1's option C,** a USB forward to the dev stack: a deviation from Principle IV.
- **A "look closer" view, or the live faces at full size beside the room** (the intent's other answers on legibility): answer 8 chose stylized scale.
- **A neon word that says what the numbers are** ("COST" or "SPEND"), the Langfuse check's recommendation: answer 6 asks for "Langfuse", under Confirmation 1's conditions.
- **KTX2 textures and compressed geometry:** for ADR 0010 to bring, with readers that can check them.
- **Kalam** for the chalkboard: the runner-up, a data edit away once vendored.

## Unknowns the exploration found, and what resolves them

"Found by" names the exploration (room code, intake and relay, infrastructure) or the design (data, runtime, integration) that raised it, or the spec's own "For the plan to verify".

| # | Unknown | Found by | Resolved by |
|---|---|---|---|
| 1 | Does three 0.186.1's `GLTFLoader` decode embedded images through `blob:` URLs, which both CSPs refuse? (unverified: no `three` installed where the exploration ran) | room code; intake and relay; runtime | R-29: a plugin that makes no URL, a source pin on 0.186.1, an image count, and one real-browser check |
| 2 | Does stock nginx map `.glb` to `model/gltf-binary`? (unverified) | room code | R-45: `types` in the `/a/` location |
| 3 | Are `gzip_static` and `gunzip` compiled into the pinned nginx image? | room code; runtime | R-45: `nginx -V` and a header probe before the first model merges |
| 4 | Does Node's zlib give Python's gzip-9 lengths? | room code; intake and relay | R-26: pako, and the parity test |
| 5 | Which size do the caps count: F2's raw bytes, or F3's gzip-9? | intake and relay | R-25, R-53: C7 counts gzip-9 for room files |
| 6 | F2 caps a file and FR-053 a piece; F3 counts every room GLB, alternates included | intake and relay | R-03 (one model per entry); R-24 (the placed share beside F3's view) |
| 7 | F2 skips unknown and non-integer caps (fail-open) | intake and relay; data | R-25, R-53: unknown keys refused |
| 8 | The shape of `caps.json`'s room block | data | R-25 (approved) |
| 9 | How the build reads caps when `main` has none, or there is no `.git` | infrastructure | R-13 |
| 10 | Only two policy files reach the build, and `assets/` isn't copied into the image | room code; infrastructure | R-13, R-46 |
| 11 | The gate never runs `make check`, and its container has no `.git`: where can FR-077's failure run? | infrastructure; intake and relay | R-58, R-65 |
| 12 | `make arrival` passes as PLANNED until P-4, so nothing enforces the intake yet | intake and relay | R-50, R-58 |
| 13 | `approvals.ts` throws on a `room-text` kind | room code | R-57: accepted in Setup |
| 14 | `content_check.py` searches 24-character fragments, and finds displayed values by the keys `text`, `title`, and `name` | infrastructure | R-06 (`text` keys); R-57 (whole strings, any length) |
| 15 | Five web tests and one gateway test pin the three IDs (the plan's checks: three gateway tests, and eight more holding "author-laptop") | room code | R-16 |
| 16 | The six framing aspects exist only as a test constant | room code | R-18 |
| 17 | The reference stages in CSS pixels are arithmetic, unmeasured | room code | R-18: pinned to `room.css` by a test, re-measured in lookdev |
| 18 | The smallest supported stage for FR-064 | data | R-19 (approved) |
| 19 | The CSP refuses `style` attributes, and the 2D hit areas are per-ID CSS | room code | R-39 |
| 20 | Spec 001's CSP has no `data:` images, so 2D faces can't be `data:` images | runtime | R-36: attribute-only SVG |
| 21 | The cache map covers `/assets/`, not spec 003's `/a/` | room code | R-45 |
| 22 | A gzip copy must never be committed under `assets/room/` | intake and relay | R-26: made in `dist/` only |
| 23 | A plain sync can't set per-file headers in spec 001's release | intake and relay | R-47 (A6) |
| 24 | The bundle's place: the 150 KB entry, one more request, and the resume's titles exist only after the virtual modules load | room code | R-11 |
| 25 | Placeholder wording is unconditional, and tests require it | room code | R-27 (labels from UI words, only on stand-ins); R-40 (the note only while stand-ins are in use); R-16 |
| 26 | `selectObject` passes an object, not the topic's phrase | room code | R-33 |
| 27 | Reduced motion is read once, and nothing pauses | room code | R-34 |
| 28 | The quality steps live in two files | room code | R-35: still four levels |
| 29 | Hello can answer `route` `"metered"`, and the adapters route sends `cost_micro_usd` as a string | room code; intake and relay | R-32: a valid reply is `local` or `fallback` with a safe integer |
| 30 | Asset events go to `POST /api/events`, which nothing serves; the relay routes neither it nor the room's beacon | room code; intake and relay | R-60: built, off until spec 001 |
| 31 | Spec 003's modes (`full`) differ from spec 002's (`3d`), and its `asset` key from FR-071's "keyed by its record's file" | room code; intake and relay | R-60: spec 003's shape and manifest ID |
| 32 | A2 must invent the status bucket's limit name, a route label, and a tier gauge; relay-http §8 sets no processing order | intake and relay | R-61 (A2's proposed names, in one contract); R-30 (any non-200 reads unknown) |
| 33 | The arrival check admits what FR-015 bans, and the scrubber drops unlisted extensions without failing | intake and relay | R-23 (stricter RX rules); R-14 (export rules in the work orders) |
| 34 | The mark sits in three places; "refuse it anywhere else" must allow the root's declaration | intake and relay | R-23: RX5's exact shape |
| 35 | C1 needs plumbing: the mark is checked without the record, and the scrubber takes no record | intake and relay | R-53 |
| 36 | A scripted step as a model step needs its models and a check date; credits hide tools on model steps | intake and relay | R-53: C8 as data; credits render tools and service on model steps |
| 37 | P1 demands `likeness_accepted` for a desk | intake and relay | R-53: C5 |
| 38 | IPTC's human-made code is unverified | intake and relay; integration | R-53: the Author confirms it before P-5 |
| 39 | Disclosure row IDs collide across specs, and the tests accept only `[A-Z]\d+` | intake and relay; infrastructure | R-62 (approved) |
| 40 | The studio folders' paths, and whether their mount is case-insensitive | infrastructure | R-50, R-51: the Author fills P-1; a case-sensitive mount, so the case-variant row reads NOTE |
| 41 | Does T005's patch deny writes? | the spec; intake and relay | Verified: reads only, with no `Edit()` deny or `denyWrite` for the studio's folders; R-51 adds them |
| 42 | ADR 0035's reservation, and whether 0036 is free | the spec | Verified: 0035 reserved by spec 002 (its R-15, T072), 0036 free on every branch; R-63 |
| 43 | Where spec 002's one-font rule lives (B10) | the spec; room code | Verified: `apps/web/fonts/README.md`, `src/fonts.css`, `fonts.lock`'s schema, `fonts.test.ts`'s pins, spec 002's plan ("One vendored font"), T028, and resume-source.md §4; R-38 |
| 44 | `releases-deployer.md` and `edge.md` (A6) | the spec | Verified: releases-deployer.md §2 step 5 ("Writes the site") and §4's site rollback; edge.md §3 and §4; R-47 |
| 45 | Can a Claude session read the photos through a listener, past the file denies (ComfyUI's `/view` and previews, reached by a hook, an MCP server, WebFetch, or a sandbox network allowance)? | the `REVIEW.md` pass of 2026-10-23 | FR-025's closure; P-3's SS9 to SS11 (R-52); the matrix's loopback rows (R-51); the Author's check now, and the route closed (tasks.md T291; the spec's Confirmation 24) |
| 46 | Where do photo tools' side files land (Blender's autosaves and `quit.blend` in the system temp folder; a tracing tool's autosave and recent files)? | the `REVIEW.md` pass of 2026-10-23 | FR-025's side files; the photo guide's setup steps and checklist (R-59) |
| 45 | T050, T078, and spec 002's R-04, R-11, and R-15 ("not in this pass's copies") | the spec; intake and relay | Verified present: R-44 (T050, C10), R-28 (T078), R-35 (R-04), R-03 (R-11), R-63 (R-15) |
| 46 | P-4's `matrix-required.txt` hunk applies only at the end of the file | integration | R-51: P-2's rows go mid-file |
| 47 | `REVIEW.md` skips generated files, and `reviewer.md` says "four passes" | integration; infrastructure | R-55 |
| 48 | The private denylist isn't read in agent sessions or the image; the currency rule flags amounts in proposals | infrastructure | R-15 (C9 with the private list where readable); R-64 (no amounts in proposals) |
| 49 | Changing `REVIEW.md` or `.claude/` leaves the agent-configuration evals PENDING, and `settings.json` leaves stage E PENDING | infrastructure | R-50: the Author runs both |
| 50 | `docs_links.py` fails links to files on other branches | infrastructure | R-63, and this file's code spans |
| 51 | No headless browser for frame rates, WebGL, or the network log | infrastructure | R-69, R-70 |
| 52 | A local file can't run module scripts or `fetch` | infrastructure; data | R-42 |
| 53 | The phone's browser may not run a local file with WebGL 2 | runtime; integration | R-42: the probe; option B only if it fails (approved) |
| 54 | `CompressionStream`'s level isn't 9, so the page's gzip figure would be an estimate | runtime | R-41: pako in the page |
| 55 | The sandbox can't reach GitHub | room code; infrastructure | R-38: npm tarballs |
| 56 | Agent sessions can't reach dev-cpu's published site, and SC-004's failover needs dev | infrastructure | R-45 (a probe on the engine); R-70 (the Author's run) |
| 57 | The local edge answers `/api/*` with 404 | room code; infrastructure | the spec's "No local status endpoint"; R-30 (unknown, never plugged in); R-70 (SC-004's dev-only harness) |
| 58 | Prometheus keeps 30 days, against FR-004's "history stays" | infrastructure | R-02 (a reading) |
| 59 | Prettier formats YAML and JSON under `apps/`, changing approved hashes | infrastructure; data | R-06 |
| 60 | The legibility margin at the room's framing (capitals about 15 cm tall on the phone) | data; room code | R-21: the report's margins; lookdev sets the scales (Confirmation 8) |
| 61 | Until P-1, this repository's sessions can read the studio's outputs and workflows folders | intake and relay; integration | R-50 (P-1 recommended now); R-51 |
| 62 | `git rev-list --all` fails in agent sessions, so the arrival check's `--history` can't run there | intake and relay | R-58: no spec 004 check needs history; it reads `refs/heads/main` by path |
| 63 | `CLAUDE.md` has about two lines of headroom | infrastructure | no decision here changes `CLAUDE.md` |
| 64 | The order of the two lines; ADR 0010 now or later; P-10's step; P-7 if P-5 slips | integration | R-49, R-44, R-52, R-50 (each approved) |
| 65 | The content check's room-text design | data | R-57 |
