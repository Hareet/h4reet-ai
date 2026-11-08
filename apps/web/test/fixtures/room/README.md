# The compositor's fixtures

Synthetic room data for `test/room/compose.test.ts`, `test/room/schema.test.ts`, and the tests that build on them (spec 004, T065; contracts/room-data-files.md §13 to §15). Every ID starts with `fx-`, the prefix the committed data may never use, so no literal in a test can be a real ID. `test/helpers/room-fixtures.ts` loads all of it; nothing here is read by the build.

## `good/`: the known-good set

Rooted like the repository: `good/apps/web/room/scene.yaml` is the tree's `apps/web/room/scene.yaml`. It holds every kind of data file (catalog pieces with stand-ins and drawings, the scene, topics, UI words, a look, a fixture, `lookdev.yaml`, a room-text block of each drawn renderer but the desktop session, an outline) and the intent their quotes come from. The loader adds the repository's own `apps/web/fonts/`, which the typeface rules read. `compose()` accepts it with no finding in strict and lenient mode, with and without drafts.

The scene's placements are, by index: 0 `fx-shell`, 1 `fx-desk`, 2 `fx-monitor`, 3 `fx-neon`, 4 `fx-laptop`, 5 `fx-board`, 6 `fx-sign`, 7 `fx-twin`, 8 `fx-visitor`. The known-bad cases name them so; a change to that order changes them too.

## `side-wall/`: the side-wall overlay

FR-064's carve-out's known-good overlay (T292; contracts/room-data-files.md §13.3), rooted like the repository: its two files replace the known-good set's (`test/helpers/room-fixtures.ts`'s `sideWallTree()`), and it composes with no finding under main's caps with a 5 px legibility floor (`sideWallPolicy()`), since the frame it widens makes the known-good set's faces smaller. The shell gains its `left-wall` and `right-wall` anchors, each a quarter turn about Y and each on its bounds' min or max x, the bounds' left edge brought in to the left wall (RG6's side-wall test, `checks/rg.ts`'s `sideWallFrame`); `fx-board` moves right; a sign far left, `fx-edge`, sets the frame's left edge, so the framing is width-bound at every aspect up to the 2D drawing's 1.6; and two signs, `fx-upper` and `fx-lower`, hang flat on `left-wall`, unturned on their mounts, one over the other, each a selectable of its own. Their gap scales with the stage's width alone, so their cores overlap at the 31 supported stages 304 px wide (27 before T171's narrow-portrait rules) and in 2D at 0.95, and nowhere else, each over the other's core alone: there `listOnly`'s release pass keeps the upper sign's tap, the first in scene order, and the lower sign is list-only, and RG6, as T302's answer has it, refuses no side-wall selectable for a missing core at any stage. Its placements add 9 `fx-edge`, 10 `fx-upper`, and 11 `fx-lower`, and its selectables 2 `fx-upper` and 3 `fx-lower`. `bad/RG6-side-wall/` adds a sign of its own, `fx-probe`, on the floor in front of the lower sign, so RG6 refuses its core over a side-wall selectable's member.

## `counters/`: the counters overlay

FR-052's exemption's known-good overlay (T293; contracts/room-data-files.md §13.3), rooted like the repository: its two files replace the known-good set's (`countersTree()`), and it composes with no finding. The neon panel `fx-neon` becomes two readable faces side by side: `panel`, bound to the UI word alone, and `counters`, bound to the two turn-cost regions alone. Under the floor of 9 px, the counter face falls under it on the reference phone alone, where RG7 exempts it, and meets it on the reference desktop; the word face meets it on both.

## `bad/<RULE>/`: one known-bad case each

A case's folder is named by its rule, alone or with a suffix (`bad/RI4/`, `bad/RI4-label/`). It holds `expect.yaml`, and optionally `files/`, rooted like the repository, whose files replace or join the known-good set's. Adding a case is adding a folder: no test or helper changes.

```yaml
rule: RI4 # the rule it is refused with
file: apps/web/room/scene.yaml # the finding's file
path: placements[2].mount.anchor # and its path, as the finding prints it
why: a mount on an anchor its parent's piece lacks # optional
mode: strict # optional: strict (the default) or lenient
drafts: true # optional: true (the default) or false
edits: # optional, applied in order to a YAML or JSON file, by keys and indices
  - { file: apps/web/room/scene.yaml, at: [placements, 2, mount, anchor], set: fx-nowhere }
  # also: delete: true (a key or a list item), push: <value> (onto the list at `at`), rename: <key> (a map's key, kept in place)
copy: { <from>: <to> } # optional: a file of the set, copied
move: { <from>: <to> } # optional: a file of the set, moved
remove: [<path>] # optional: files or folders taken out
raw: { <path>: "<bytes>" } # optional: a file written byte for byte, each character one byte, so YAML's \xNN escapes write any byte
generate: { <path>: glb:desk } # optional: a file made when the test runs (glb:desk, glb:sign, glb:<rxVariants id>, records; spec 009's glb:avatar, glb:avatar-handless, glb:avatar-idle, glb:avatar-idle-holding, glb:avatar-take, glb:avatar-still, visitor-records)
caps: { schema: 1, per_asset: { room: {} } } # optional: main's caps.json, as a value written as JSON, or as text
full_name: <name> # optional: main's resume-header.json full name, for the surname rule
```

They apply in this order: `copy`, `move`, `remove`, `files/`, `raw`, `generate` (the GLBs, then `records`, which records every model and card under `assets/room/` with the kind `room` and its SHA-256, and spec 009's `visitor-records`, which records every GLB of its own folder under `assets/visitors/`, the model named for the folder with the kind `avatar` and every other file `animation`), then `edits`, which may change a generated JSON file too. Spec 003's rule A1 refuses a committed model outside `assets/`, so a case's models are made when the test runs, by `test/helpers/glb.ts`. A case composes with no policy at all (`policy.ts`'s `noPolicy()`: FR-053's starting figures, nothing approved, no name) unless it gives `caps` or `full_name`; then the policy is the one a policy directory holding those files would give.

The test holds each case to a finding with its rule, file, and path; other findings may come with it, such as a reference to a file the case broke. Every rule of contracts/room-data-files.md §13 but RG8, which only reports, needs at least one case: `compose.test.ts`'s coverage test fails until each has one.
