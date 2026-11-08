# The room's data

This folder describes the room as data, so moving, adding, regrouping, retargeting, rewording, or removing a piece changes no source file (spec 004, FR-001 to FR-006). The compositor in `apps/web/build/room/` reads it strictly and composes it into the bundle the 3D room, the 2D room, and the lists draw from. A new kind of behaviour, such as a new stand-in shape, renderer, signal, or look method, is code, made through the lifecycle (FR-005); so are the hand-off and its paper (FR-008).

| File | Holds | Contract |
|---|---|---|
| `catalog/<piece>.yaml` | one piece each, its stem the piece's ID: its size, stylized scale, origin and bounds, anchors, live faces, glows, claims, stand-in, 2D drawing, budget, model, and work order | contracts/room-data-files.md §4 |
| `scene.yaml` | the placements, the switches, the selectables, the hand-off, the live configuration, the survey, and the retired IDs | §5 |
| `topics.yaml` | the topics the selectables open | §6 |
| `ui-words.yaml` | every UI word: the code's closed list, and the `label.<name>` words the scene references | §9 |
| `looks/<look>.yaml` | the looks; `scene.yaml`'s `look` names the chosen one | §10 |
| `fixtures/<fixture>.yaml`, `lookdev.yaml` | samples and the lookdev page's views, for drafts builds and tests only | §11, §12 |

Room text, the words the room draws on a face, sits in `apps/web/content/room/` and is approved by its hash (§7, §8). This README is prose: the compositor never reads it.

## The commands

From the repository's root:

| Command | Does |
|---|---|
| `npm run room:generate -w apps/web` | writes the generated files from the data: `config/room-events.yaml`, `config/room-topics.yaml`, and `docs/studio/`'s work orders and photo guide, removing a work order whose piece is gone. It writes nothing while the data has a finding a lenient build doesn't tolerate. `npm run manifest -w apps/web` is its alias |
| `npm run room:check -w apps/web` | composes in strict mode, prints every finding, and fails on any, or on a generated file that is stale, missing, or orphaned. `make test` holds the same rules |
| `npm run room:report -w apps/web` | prints the room's report: each piece's bytes, triangles, and texture memory against its budget and the caps, the faces' legibility, its Side-wall section (each side-wall selectable the room leaves to the "In the room" list, its wall, and the stages where, in 3D and in 2D), the switches' poses, and the findings. A merge-request note whose branch changes the room's data or models pastes it whole |
| `npm run room:scan -w apps/web` | the source scan: no ID the data defines may stand in the code (FR-007) |
| `npm run room:fit -w apps/web -- <glb> --piece <id>` | the fit check of one model file in the tree against one catalog entry |

Every change ends the same way: run `npm run room:generate -w apps/web`, then `npm run room:check -w apps/web`, and commit the data with the generated files it changed. Nothing under `apps/web/src/`, `apps/web/build/`, or `apps/web/test/` changes.

## The rules every change meets

- **YAML, read strictly.** One document, `version: 1`, UTF-8 with LF line ends, no anchor, alias, merge key, or tag, and no key the schema doesn't define (RD). Prettier formats every YAML file here (`make fmt`).
- **IDs.** `^[a-z][a-z0-9-]{1,40}$`, unique within their namespace (pieces, placements, selectables, topics), never a word of the closed vocabulary in `apps/web/src/room/compose/vocabulary.ts`, and never an ID `retired[]` lists for that namespace (RI). The prefix `fx-` belongs to the tests' fixtures.
- **Geometry.** Metres and degrees, +Y up, the front facing +Z. The mounts form one tree rooted at the shell (RG1); every framed box stays in view at spec 002's six aspects (RG5); each selectable keeps an exclusive core of at least 44 × 44 CSS pixels at every supported stage, in 3D and in 2D (RG6), except a side-wall selectable, every member mounted directly on the shell's `left-wall` or `right-wall` anchor, which is list-only wherever its core can't fit; `room:report`'s Side-wall section lists where; each readable face stays at or above the legibility floor on both reference stages (RG7), except a face whose regions are all bound to the turn-cost signal, the neon sign's counter faces, which may fall under it on the reference phone alone, since "Around the room" carries their figures, and the report marks them exempt there.
- **Words.** Every string passes spec 002's C9, so no "Do not claim" phrase of the corpus, nothing the surname rule refuses, and no private-denylist phrase appears (RT2); no UI word holds a digit outside a slot (RT3); a closed-list UI word keeps exactly its slots (RT12).
- **Budgets.** A piece's budget stays at or under `main`'s caps, or FR-053's starting figures while `main` has none (RK1). Agents never raise a cap.
- **Unmeasured figures.** A size, an anchor, or a mount not measured yet carries `estimated: true`, so its work order and the photo guide ask for the measurement (FR-002, FR-026).

A finding prints as `<rule> <file>:<path>: <reason>` (contracts/room-data-files.md §14), and the rule's family says where to look: RD shape, RI identity, RG geometry, RS switches, RT words, RV drawings, RX the model's fit, RK budgets, RL the live configuration, and RW, spec 008's, the highlight.

## Move a piece

Change its placement's `mount` in `scene.yaml`: `on`, the placement it mounts on; `anchor`, one of that placement's piece's anchors; `offset`, in metres in the anchor's frame; and `turn`. Everything mounted on the placement moves with it, in 3D and in 2D. Mark the mount `estimated: true` until its position is measured. A move can change what the camera frames, or bring one selectable's core onto another's, so RG5 to RG7 decide whether it stands.

On a side wall, mount the piece directly on the shell's `left-wall` or `right-wall` anchor. Each turns a quarter about Y, so its `offset` reads along the wall: on the left wall +x points toward the back wall, and on the right wall toward the open front; y is the height above the floor; z is the distance out from the wall. A piece hung there flat, its mount turned about z alone if at all (not about x or y) and out from the wall by no more than its own depth, is on the wall; RG6 then counts its selectable as a side-wall selectable if every member hangs so, and leaves it to the "In the room" list at any stage where its core can't fit, rather than refusing the scene. The anchor itself must stand on the shell's bounds' left or right edge, within 1 mm, at that quarter turn. The photo guide asks for a side-wall piece's origin from the back wall, above the floor, and out from the wall, as it is measured.

## Add a piece

1. **A catalog entry,** `catalog/<piece>.yaml`, its stem the new ID: `name`, the work order's and the report's, 1 to 60 characters; `size`; `stylized_scale`, 1 to 4, which lookdev sets for a readable prop; `origin`, the point on the dimension sheet and the expected bounds that hold it; the `anchors` others mount on; any `live_faces` and `glows`; `standin`, at least one shape of the closed grammar, inside the bounds; `drawing`, `{from: standin}` or primitives; `budget`; and `work_order` (`method`, `shots`, `measurements`, `studio_notes`), which the reviewer reads as room text: it locates nothing, names no third party's marks, and asks the studio for no photo, fetch, or upload (FR-014). Leave `model` out until the Author's file is set.
2. **A placement** in `scene.yaml`'s `placements`, mounted on another, with `frame: true` where the camera should keep it in view, and `label: label.<name>` for its stand-in's label, its word in `ui-words.yaml`. A label word no placement, face, or switch references is refused (RI11).
3. **A selectable,** to make it selectable, in `selectables`: `id`, permanent, since it is the usage event's ID and the conversation's feature; `name`, the list's button, 1 to 40 characters; `members`, framed placements, each in one selectable at most; and `action`, `{talk: {topic, lead}}` or `{resume: {}}`, the `lead` optional, one line of at most 120 characters, published only in `config/room-topics.yaml`. The order of `selectables` is the list's, the Tab order's, and the loading order's. A room holds 64 selectables at most.
4. **A topic,** if the selectable opens a new one, in `topics.yaml`: `id`; `phrase`, 1 to 60 characters, which fills the fixed message "can't talk about {topic} yet"; `words_from`, the Author's words the topic came from, each quote verbatim in an intent file (RT9); and `corpus`, paths of the form `corpus/NN-<topic>.md`. The corpus files are the Author's to write; until the twin's spec marks the topic ready, selecting the piece shows the fixed message and calls no model.
5. **Generate.** The piece gets its work order, the selectable its ID in `config/room-events.yaml`, which the gateway accepts from its next start, and the topic its mapping in `config/room-topics.yaml`. Until its model arrives, the piece shows its labelled stand-in.

## Remove a piece

Delete its placements, its catalog entry if no other placement uses it, its label words, and its selectable. Add each removed ID to `scene.yaml`'s `retired[]`, with the `kinds` it had (`piece`, `placement`, `selectable`, `topic`), the date as `YYYY-MM-DD`, and a one-line `reason`. RI3 refuses any later piece, placement, selectable, or topic that takes a retired ID, so `retired[]` only grows. The selectable's ID leaves `config/room-events.yaml` at the next generate, and its dashboard series keeps its history; `room:generate` removes the piece's work order.

## Regroup pieces

Change a selectable's `members`. Its pick area is the union of its members' boxes with an exclusive core centred on it (RG6), so regrouping pieces that stand side by side usually needs a move too, until each core is clear of the others' members and areas.

A selectable whose members all hang on the side walls, as "Move a piece" says, is a side-wall selectable: list-only wherever its core can't fit, picked wherever it can. Of two such selectables whose cores overlap only each other's core, the first in `selectables` keeps its pick area and the list reaches the other. A selectable with members on a side wall and elsewhere isn't side-wall, so RG6 holds it to the full rule; another selectable's core over a side-wall member is refused at any stage.

## Retarget a selectable

Change a selectable's `action.talk.topic`, and its `lead` if it has one. Its ID, its usage event, and its dashboard series stay the same.

## Reword

Words are data. A selectable's `name`, a topic's `phrase`, and a UI word in `ui-words.yaml` change in place. Room text in `apps/web/content/room/` is approved by its hash, so a reworded block is a draft, shown only in drafts builds, until the Author approves the new hash. The word checks, RT2 to RT8, hold every reword; the grids a face's words fill are fixed, so a longer word can overflow its region (RT8).

## Change the highlight

The border a targeted piece shows (spec 008, FR-015 to FR-017) is look data: each look's `highlight` gives a `band`, the colour next to the piece's outline, and an `edge`, the dark frame outside it, each a palette name of that look or `#rrggbb`, with their widths in CSS pixels, `band_px` 2 to 8 and `edge_px` 1 to 4. A look that leaves `highlight` out, or any of its keys, takes the spec's defaults: a band of `#ffd23f`, 3 px wide, and an edge 1.5 px wide in the look's ink, its `outlines.color`. RI4 holds both colours to the look's own palette, and RW2 refuses a look whose band and edge both give under 3:1 against any colour of its palette, so one of the two always reads on the room's light surfaces and on its dark ones. `room:report`'s Highlight section gives each look's lowest contrast and the colour it is lowest against. The highlight is drawn in every look and at every quality level, and lookdev's Highlight control shows it on any piece, so the Author judges a change there.

## Add a switch case

A switch in `scene.yaml`'s `switches` places one piece in a pose for each value of the tier: `cases` maps a tier value to a pose. When the piece declares `claims`, every tier value needs its case and there is no `default` (RS1 to RS5). When it claims nothing, a `default` pose covers the values `cases` leaves out, so a case for a value the signal already has is a data edit.
