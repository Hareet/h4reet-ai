# Contract: `records.json`

One per asset or published-image directory. The fields are in [data-model.md §2](../data-model.md#2-recordsjson); this contract fixes the rules the arrival check applies (its rules R1 to R7, [arrival-check.md §3](arrival-check.md#3-the-rules)).

## 1. Shape

- **Top level:** `schema` (the integer 1), `directory` (the directory's path from the repository's root, which must equal where the file sits), `license` (the media license's ID, `all-rights-reserved-2026`), and `entries`.
- **Order:** entries sorted by `file`, keys in the order data-model.md lists them, two-space indentation, a trailing newline. `scripts/assets/credits.py --check` refuses any other formatting, so a diff of a record shows only what changed.
- **No other key,** at any level (R4).

## 2. Values

| Value | Allowed |
|---|---|
| IDs (`source.id`, `approval`) | `[A-Za-z0-9-]{3,40}`: opaque, so a photo's file name can't pass for one (R5) |
| Dates | `YYYY-MM-DD`, never a time (R5) |
| Names and repositories | text without a path separator other than a URL's or `org/name`'s, and no file extension from the A2 list |
| `revision` | a commit hash, a version, or a date |
| `license` IDs | as in `assets/policy/licenses.json` |

## 3. The media license

`license` and each entry's `media_license` are `all-rights-reserved-2026`, the clarified license (spec FR-015). The directory's `LICENSE.md` reads:

```text
Copyright (c) <YEAR> <HOLDER>. All rights reserved.

The files in this directory are not covered by this repository's MIT license. You are welcome to view them and to link to them. Any other use needs the copyright holder's written permission.

Each file's provenance is in records.json, and in CREDITS.md at the root of its tree.
```

**The copyright line is the Author's to fill.** The notices are committed with `<YEAR>` and `<HOLDER>` as placeholders, and the Author writes the holder's name and the year in each directory's `LICENSE.md` before its first file arrives: a name the Author chooses, such as the site's name or the studio's. The Author's surname goes in only if the Author decides it should, since the corpus keeps it out of what the twin says ("Surname: the twin never gives or confirms it in conversation") and the site is public. Rule N1 refuses a file in a directory whose notice still holds a placeholder, so the line can't be forgotten; an empty directory's notice may keep its placeholders.

## 4. The credits

`scripts/assets/credits.py` renders `assets/CREDITS.md` and `docs/research/images/CREDITS.md`: one section per file, with its kind, its source type (never its ID's meaning), each step (by a model or by hand), each model with its repository, revision, and license, each hand tool, any hosted service, and the media license. `--check` exits 1 when the committed rendering differs, and the arrival step runs it.

## 5. An example entry

```json
{
  "file": "dog.glb",
  "sha256": "<64 hex characters>",
  "kind": "avatar",
  "made": "2026-11-02",
  "source": { "type": "prompt", "id": "P-0007" },
  "likeness": false,
  "steps": [
    { "name": "concept image", "by": "model", "models": [ { "name": "<model>", "repository": "<org/name>",
      "revision": "<commit>", "role": "primary", "license": "<id>", "license_version": "<version>" } ],
      "models_checked": "2026-11-01" },
    { "name": "retopology and rig", "by": "hand", "tools": [ { "name": "Blender", "version": "<version>",
      "license": "gpl-3.0-or-later", "license_version": "3" } ] }
  ],
  "media_license": "all-rights-reserved-2026"
}
```
