# Contract: loading the assets in the browser

**Waits for spec 001's site (its task group 6) and spec 002's room.** Spec 003's FR-021 to FR-034; plan §7; research R-10, R-11, R-13. Nothing here is built until both exist; the waiting task group re-reads them first.

## 1. The manifest

`assets.json`, built by the site's release from the records, served with the site:

| Field | Meaning |
|---|---|
| `files[].id` | the record's file name, without its extension |
| `files[].url` | `/a/<stem>.<first 16 hex of sha256>.<ext>`: a changed file gets a new name (FR-029) |
| `files[].sha256` | for the browser's integrity check (`integrity` on the fetch) |
| `files[].bytes` | its size, for the bytes counted in events |
| `files[].kind` | as the record |
| `files[].fallback` | the still (for the twin) or the preview (for a visitor avatar) |
| `twin.line` | the approved disclosure line (research R-11) |

Every URL is on the site's own origin (FR-030). The manifest itself is served with a short cache; the files with a year's, since their names change with their content.

## 2. The order

1. **Capability check,** before any 3D download: WebGL2, and the floor ADR 0010 sets (device memory, GPU tier). Below it: the 2D mode, and no 3D file is fetched (FR-023).
2. **The twin's still image and the disclosure line,** at once (SC-004: the twin visible within 2 seconds).
3. **The selection screen:** the four previews only (FR-028).
4. **On a choice:** the twin's GLB and the chosen avatar's GLB, in parallel; each replaces its still or preview when ready.
5. **Animations,** after their model. A model whose animations fail stays in a neutral pose, and the failure is an event.

## 3. Failures and the modes

| Event | The site does | Spec |
|---|---|---|
| The twin's GLB fails (blocked, timeout of 10 s, integrity, decode) | retry once; on a second failure, the still image in its place within 2 seconds, the line, chat working; mode stays `full` for the rest | FR-021 |
| The visitor avatar's GLB fails | its preview, or nothing | FR-022 |
| Frame rate below 24 fps for 5 s | `full` → `reduced` (lighter textures, one animation at a time); again → `2d` | FR-024 |
| The visitor's 2D control | `2d` at once, from any mode | FR-024 |
| The local tier off, or the kill switch degraded | nothing changes for the assets; only the conversation degrades | FR-025 |

In every mode, the twin, or its still, and the disclosure line are on screen, and the text box works (FR-026, FR-032). The mode's states are in [data-model.md §7.1](../data-model.md#71-the-display-modes-states).

## 4. The credits link

Each shown asset has a "credits" link to `/credits/#<id>`, the site's rendering of `assets/CREDITS.md` (FR-033): two clicks from any page.

## 5. Measurements

On the reference phone and the mobile profile (research R-13), from a cold cache:
- the time until the twin is visible, still or 3D (SC-004), and fully shown (SC-005);
- the median frame rate over 60 seconds (SC-006);
- the bytes of a first visit (SC-006);
- fault injection for each row of §3 (SC-007), and the network log (SC-009).
