# Data Model: Studio Assets (spec 003)

Phase 1 output of `/speckit-plan`. Every file below is JSON, read with Python's standard library. Hashes are lowercase hexadecimal SHA-256. Dates are ISO 8601, UTC. A field marked **required** refuses the file when it is missing; an unknown field refuses it too, so the schema can't be extended by accident.

## 1. Where each piece lives

| Entity (spec's Key Entities) | File | Written by |
|---|---|---|
| Asset, published image | under `assets/<family>/` or `docs/research/images/<note>/` | the Author, or an agent from the Author's exports |
| Record, step, model entry, source | `records.json` in the same directory (§2) | the same |
| License allowlist entry | `assets/policy/licenses.json` (§3) | the Author only |
| Likeness approval | `assets/policy/approvals.json` (§4) | the Author only |
| Caps | `assets/policy/caps.json` (§5) | the Author only |
| The arrival check's result | standard output, and its exit code (§6) | the check |
| Display mode, asset event | in the browser, and the relay's metrics (§7) | the site; waits for spec 001 |
| GPU window | the gateway's audit log and gauge (§8) | the operator command |

## 2. `records.json`

```json
{
  "schema": 1,
  "directory": "assets/twin",
  "license": "all-rights-reserved-2026",
  "entries": [ { "…": "one per file in the directory, apart from records.json and LICENSE.md" } ]
}
```

**An entry** ([contracts/asset-record.md](contracts/asset-record.md) has every field's rule):

| Field | Type | Rule |
|---|---|---|
| `file` | string, required | a file name in this directory, no path separator |
| `sha256` | string, required | the file's hash; refused on mismatch (FR-010) |
| `kind` | enum, required | `avatar`, `animation`, `room`, `still`, `preview`, `published-image` |
| `made` | date, required | when the file was made |
| `source` | object, required | `{ "type": "photo" \| "prompt" \| "asset", "id": "<opaque id>" }`; an asset source names a `file` in some record. Never a file name, path, or location (FR-011) |
| `likeness` | boolean, required | true when the file shows the Author or derives from the Author's photos |
| `steps` | array, required, at least one | §2.1 |
| `media_license` | string, required | equals the directory's `license` |
| `approval` | string | required when `likeness` is true, the source is a photo, or the kind is `room`; the approval's ID in `approvals.json` (FR-016) |
| `arm` | string | published images of the evaluation note only: `A`, `B`, `C`, or `D` |
| `note` | string | published images only: the note's path, for rule C |

### 2.1 A step

| Field | Type | Rule |
|---|---|---|
| `name` | string, required | what the step did, in a few words |
| `by` | enum, required | `model` or `hand` (FR-010: which steps a model did and which the Author did by hand) |
| `models` | array | required when `by` is `model`: §2.2, every model the step loaded, auxiliary ones included |
| `tools` | array | `{ "name", "version", "license", "license_version" }`, each tool used by hand |
| `service` | object | a hosted service the step used: `{ "name", "license", "license_version", "disclosure_row" }`; the row must exist in `docs/data-flow-disclosure.md` (FR-040c) |
| `models_checked` | date | required when `by` is `model`: when the step's models were last checked against newer releases; refused if missing or after `made` (FR-012) |
| `workflow_sha256` | string | the studio's workflow, by hash only (FR-001) |

### 2.2 A model entry

| Field | Type | Rule |
|---|---|---|
| `name` | string, required | |
| `repository` | string, required | where it's published, a URL or `org/name` |
| `revision` | string, required | a commit, a version, or a release date |
| `role` | enum, required | `primary` or `auxiliary` |
| `license` | string, required | the license's ID in `licenses.json` |
| `license_version` | string, required | the version or date that was used; the allowlist judges that version |
| `commercial_license` | string | the studio's commercial license reference, which FR-014 requires for an evaluation-only model |

## 3. `licenses.json`

```json
{ "schema": 1, "licenses": [ { "id": "apache-2.0", "name": "Apache License", "version": "2.0", "url": "…",
  "display_on_site_that_promotes_the_studio": "yes", "everywhere": "yes", "public_distribution": "yes",
  "research_display": "yes", "evaluation_only": false, "read_by_the_author": "2026-10-18" } ] }
```

- **In an asset directory,** a license is **allowed** when FR-013's three terms read `yes` and `evaluation_only` is false. An `evaluation_only` license is allowed there only with a model entry's `commercial_license` (FR-014).
- **In a published-image folder,** a license is allowed when `research_display` reads `yes`: the Author's reading of whether the license lets its outputs be shown publicly as evaluation results, not used in the site (FR-036, as the spec's Clarifications settle it on 2026-10-18). FR-013's three terms and FR-014 don't apply there.
- An ID not in the file is **unknown**, and refused (FR-013). It starts empty.

## 4. `approvals.json`

```json
{ "schema": 1, "approvals": [ { "id": "A-0001", "sha256": "…", "path_when_approved": "assets/twin/…",
  "kind": "avatar", "date": "…", "confirms": { "likeness_accepted": true, "nothing_locates": true,
  "no_screen_logo_text_or_art": true, "recreation_not_photo": true, "record_complete": true },
  "room": null, "disclosure_line": null, "reason": "…" } ] }
```

- Every `confirms` field must be `true` for the approval to count (FR-016).
- **`room`**, for a room file: `{ "window_view_recreated": true, "screens_plain_glow": true, "artwork_original_or_absent": true }` (FR-037).
- **`disclosure_line`**, on the twin's first approval: the visible line's text the Author approved (R-11). Until an approval carries one, the twin's files are refused.
- An approval names one hash. A re-exported file needs a new one.

## 5. `caps.json`

```json
{ "schema": 1, "adr_0010": "not-accepted", "per_asset": {}, "first_visit_bytes": { "phase2": 10000000, "phase3": 25000000 },
  "history_bytes": 500000000 }
```

While `adr_0010` isn't `accepted`, every avatar and animation is refused (FR-018). ADR 0010 fills `per_asset` with its caps (bytes, triangles, texture memory, by kind).

## 6. The arrival check's result

**Exit code:** 0 when nothing was refused, 1 on any finding, 2 when it can't check (a file that needs the policy while `refs/heads/main` has none, an unreadable git range), so a check that couldn't run never passes.

**A finding:** `{ "rule": "M3", "path": "assets/twin/idle.glb", "commit": "abc123…" | null, "reason": "…" }`, printed as one line. The size table follows, per file: `bytes`, `gzip_bytes`, and for GLB `vertices`, `triangles`, `texture_bytes`; then the first-visit totals and the history total.

## 7. In the browser (waits for spec 001)

- **Display mode:** `full`, `reduced`, or `2d`; changes on a failed load, the frame rate, the capability check, or the visitor's control ([contracts/site-loading.md](contracts/site-loading.md)).
- **Asset event:** `{ "asset": "<record file id>", "outcome": "loaded" | "retried" | "failed" | "skipped", "ms_bucket": "<250" | "<1000" | "<3000" | "<10000" | ">=10000", "bytes": 0, "mode": "full" | "reduced" | "2d" }`, with no identifier ([contracts/asset-events.md](contracts/asset-events.md)).

### 7.1 The display mode's states

```text
start ── capability check fails ──────────────────────────────► 2d
  │
  └─► full ── twin fails twice, or fps < 24 for 5 s ─► reduced ── fps < 24 for 5 s ─► 2d
        │                                                    │
        └──────────────── the visitor's 2D control ──────────┴──────────────────────► 2d
```

There is no way back to `full` in the same visit, so a phone on the edge doesn't oscillate.

## 8. The GPU window

- **Audit row** (spec 000's `audit_log`): `action = studio_window`, the reason, the time; the state in `detail.state` (`start` or `end`), and the window in `before` and `after` (`{"window": "closed"}`, `{"window": "open", "since": …}`); an end's `detail` adds `opened`, `fallback_micro`, and `fallback_calls`. Migration `0003_studio_window` adds the action to the table's CHECKs.
- **State:** the newest `studio_window` audit row says whether a window is open; with none, it is closed. No column holds it.
- **Gauge:** `h4_studio_window`, 1 while a window is open, 0 otherwise, with no attribute: the stack is every series' `deployment_environment_name`.
- **Span:** the server span spec 000's contracts/telemetry.md gives "`POST /hello` and the admin routes", with `http.route` `/admin/studio-window`, `h4.outcome`, and `h4.studio_window.state`, never the reason's text.
- **View:** `gateway.v_studio_windows`, one row per window, with its fallback spend from the ledger, which `grafana_ro` reads for the dashboard's panel.
- **States:** closed → open (`start`) → closed (`end`). A second `start` while open is refused with 409 `already_open`, and an `end` while closed with 409 `not_open`.

(Updated by tasks.md T034 on `feat/003-us6-gpu-window`: the audit row's state is in `detail`, since `audit_log` has no state column; the gauge has no `stack` label, as no gateway series has one; and the state and the view are new. contracts/gpu-window.md has the whole interface.)
