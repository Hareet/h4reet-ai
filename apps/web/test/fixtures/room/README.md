# The compositor's fixtures

Synthetic room data for `test/room/compose.test.ts`, `test/room/schema.test.ts`, and the tests that build on them (spec 004, T065; contracts/room-data-files.md §13 to §15). Every ID starts with `fx-`, the prefix the committed data may never use, so no literal in a test can be a real ID. `test/helpers/room-fixtures.ts` loads all of it; nothing here is read by the build.

## `good/`: the known-good set

Rooted like the repository: `good/apps/web/room/scene.yaml` is the tree's `apps/web/room/scene.yaml`. It holds every kind of data file (catalog pieces with stand-ins and drawings, the scene, topics, UI words, a look, a fixture, `lookdev.yaml`, a room-text block of each drawn renderer but the desktop session, an outline) and the intent their quotes come from. The loader adds the repository's own `apps/web/fonts/`, which the typeface rules read. `compose()` accepts it with no finding in strict and lenient mode, with and without drafts.

The scene's placements are, by index: 0 `fx-shell`, 1 `fx-desk`, 2 `fx-monitor`, 3 `fx-neon`, 4 `fx-laptop`, 5 `fx-board`, 6 `fx-sign`, 7 `fx-twin`, 8 `fx-visitor`. The known-bad cases name them so; a change to that order changes them too.

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
generate: { <path>: glb:desk } # optional: a file made when the test runs (glb:desk, glb:sign, glb:<rxVariants id>, records)
```

They apply in this order: `copy`, `move`, `remove`, `files/`, `raw`, `generate` (the GLBs, then `records`, which records every model and card under `assets/room/` with the kind `room` and its SHA-256), then `edits`, which may change a generated JSON file too. Spec 003's rule A1 refuses a committed model outside `assets/`, so a case's models are made when the test runs, by `test/helpers/glb.ts`.

The test holds each case to a finding with its rule, file, and path; other findings may come with it, such as a reference to a file the case broke. Every rule of contracts/room-data-files.md §13 but RG8, which only reports, needs at least one case: `compose.test.ts`'s coverage test fails until each has one.
