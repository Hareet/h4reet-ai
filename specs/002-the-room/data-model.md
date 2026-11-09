# Data Model: The Room (spec 002)

Phase 1 output of `/speckit-plan`. Nothing here is stored at run time on the server: the room's data is files built from the repository, the visit lives in the page, and usage events become counters. The contracts give the formats in full; this file names each entity, its fields, its rules, and its states.

## 1. Where things live

| Entity | Where | Who writes it |
|---|---|---|
| The resume source | `apps/web/content/resume.yaml` | agents draft; the Author approves by hash |
| A narration script | `apps/web/content/narration/<item-id>.<path>.md` | agents draft; the Author approves by hash |
| The fixed messages | `apps/web/content/messages.yaml` | agents, reviewed |
| The approvals | `assets/policy/content-approvals.json` (human-only, read from `main`) | the Author |
| The PDF's header | `assets/policy/resume-header.json` (human-only, read from `main`; outside `corpus/`, never read by the twin) | the Author |
| The lock | `apps/web/content/resume.lock.json` | the build |
| The room's data | `apps/web/dist/room-data.json` | the build |
| The room's manifest | `apps/web/dist/room-manifest.json` | the build |
| The events' kinds and IDs | `config/room-events.yaml` (committed, generated, checked) | the build; the gateway reads it |
| The PDF | `apps/web/dist/resume.pdf` | the build |
| The visit | the page's memory | the browser |
| A usage event | in flight only; then the counter `h4.room.events` | the browser, then the gateway |
| Proposals for the Author | `corpus/proposals/` | agents |

## 2. The resume source

**`resume.yaml`** ([contracts/resume-source.md](contracts/resume-source.md) §1):

| Field | Type | Rules |
|---|---|---|
| `version` | integer | `1` |
| `header.room` | object | `{name, lines[]}`. `name` is what the conversation rule allows (no surname); each line is display text with citations, like an item's |
| (the PDF's header) | – | not in this file: `full_name` and `contact` come from `main`'s `assets/policy/resume-header.json` (§4). While either is `null`, the PDF uses `header.room` (FR-017) |
| `sections[]` | list | `{id, title, items[]}`; `id` matches `^[a-z][a-z0-9-]{1,40}$`, unique |
| `items[]` | list | see Item |

**Item:**

| Field | Type | Rules |
|---|---|---|
| `id` | string | `^[a-z][a-z0-9-]{1,40}$`, unique across the source; it's the item's ID in events, scripts, and the manifest |
| `text` | string | display text, at most 400 characters. Any digit must sit inside a `{{slot:<id>}}` (FR-014). No "we" without its expansion (the corpus's rule) |
| `claims[]` | list, at least one | each `{file, quote}`. `file` is one of the corpus's topic files, `corpus/NN-<topic>.md` (no `intake/`, `proposals/`, or `facts/`, and not `README.md` or `INTAKE.md`); `quote` is at least 12 characters, found verbatim in one sentence of that file |
| `slots[]` | list | the slot IDs `text` uses; each must exist in `corpus/facts/*.yaml` |
| `verb` | string, optional | for a role claim, one of the corpus's ownership verbs (built, designed, co-authored, sourced, sponsored, AI system architect, led, was part of a team that), "architected", the ruling `02` gives the CHT 4.0 architecture, or "configured", the Author's verb for technical software ("Yes, configured for technical software is a verb", 2026-10-30); the check requires it to appear in `text` and in a cited sentence (FR-015) |

**A citation is sufficient** when the cited sentence's own tag, the one that opens its span on the line, is one of `[A …]`, `[A-DOC …]`, `[A-BIO]`, `[A-CHAT]`, `[A-NOTES]`, or `[C]`. A sentence tagged only `[P]`, `[A-JD]`, or `[A-SRE-JD]` is sufficient for a fact about a system or organization, never for a claim with `verb`. A `[?]` sentence is never sufficient. No sentence under a "Do not claim" heading is citable.

**The display text** also passes the forbidden-phrase check (C9): no "Do not claim" key phrase, no surname, and no private-denylist phrase, in any item's `text` or the room's header.

## 3. A narration script

**`content/narration/<item-id>.<path>.md`**, where `<path>` is `engineer` or `non-engineer`:

| Part | Rules |
|---|---|
| Front matter: `item` | the item's ID; must exist in the source |
| Front matter: `path` | `engineer` or `non-engineer`, matching the file name |
| Front matter: `claims[]` | as an item's |
| Front matter: `slots[]` | as an item's |
| (its verb) | none of its own: the item's `verb` sets C4's bar for both its scripts' citations, and the words needn't say it; every ownership or act verb they do say is one a cited sentence says as an act, and no ruling annotation is cited or read out (N1) |
| Body | plain text after a blank line, at most 900 characters as written (about 45 seconds at 160 words a minute), in the twin's first person about the Author in the third person, as the corpus's Golden Q&A does; any digit inside a slot |

**Required:** one script for every item on each path (FR-016). **The forbidden-claim check** fails a script that contains any phrase from the forbidden list ([contracts/narration.md](contracts/narration.md) §2), which the build assembles from each corpus file's "Do not claim" section, the surname rule, and the private denylist when it can read it. Private phrases are never written into a committed file.

## 4. Approvals

**`assets/policy/content-approvals.json`** (human-only, beside spec 003's `approvals.json`, read from `main`):

| Field | Type | Rules |
|---|---|---|
| `schema` | integer | `1` |
| `approvals[]` | list | `{id, path_when_approved, kind, sha256, date, reason}`: `id` matches `^C-\d{4}$`; `kind` is `resume` or `narration`; `sha256` is the file's bytes' digest; `date` is `YYYY-MM-DD` |

A content file is **approved** when an entry's `sha256` equals its current digest, in the copy of the file on `main`. Otherwise it's a **draft**.

**`assets/policy/resume-header.json`** (human-only, read from `main`):

| Field | Type | Rules |
|---|---|---|
| `schema` | integer | `1` |
| `full_name` | string or `null` | the PDF's name line; `null` until the Author fills it |
| `contact` | string or `null` | the one contact channel the Author chooses |

**How both files reach the build:** on the host, by `GIT_NO_REPLACE_OBJECTS=1 git cat-file blob refs/heads/main:<path>`, never a bare `main`, which a tag of that name would answer (`web_image.py` for the image, `build/policy.ts` for a checkout's build), into a policy directory the build reads; the image's build stage reads it as the named build context `policy` and never runs git. A file missing on `main` counts as absent: every content file a draft, and the room's header on the PDF.

**States of a content file:** `draft` → (the Author adds its hash on `main`) → `approved` → (any edit) → `draft`. An image built before the approval keeps the draft until the next `make up` rebuilds it.

## 5. The built data

**`room-data.json`:**

| Field | Rules |
|---|---|
| `built_from` | the commit, `resume.lock.json`'s digest, and the policy files' digest (the approvals and the PDF header, as read from `main`) |
| `published` | `{path, sha256}` for each content file the build published, and `draft: true` on a draft a drafts build shows; the gate's content check holds each to the tree's digest and `main`'s approvals, and scans `dist/` for any unapproved file's text whatever this says |
| `drafts` | the paths of draft files, empty for a release |
| `resume_state` | what the build published from the resume's source: `approved`; `draft`, a drafts build's, under the banner; `withheld`, a draft in a build without drafts, so no header and no items; or `absent` |
| `header` | the room's header, `{name, lines[]}` with slots filled, and its `source` file and that file's `sha256`; `null` when withheld |
| `sections[].items[]` | `{id, text}` with slots filled (empty slots render their fallback or nothing), with its `source` file and that file's `sha256`, and `narration: {engineer, non-engineer}`, each `{words, approved, source, sha256}` with its slots filled, or `null` where a build without drafts left a draft out (Phase 5); no sections when withheld, so no narration |
| `resume_pdf` | the Author's designed PDF when the build serves it as `resume.pdf`: `{source, sha256}`, with `draft: true` when a drafts build serves it unapproved; `null` when the PDF is the render ([contracts/resume-source.md §7](contracts/resume-source.md#7-the-authors-designed-pdf); spec.md's amendment of 2026-11-09). Never in `published`, which holds content files only |
| `messages` | not written: the fixed messages (§7) are bundled into the page at build instead, so showing one makes no request (plan §4, group 4) |

**`room-manifest.json`:**

| Field | Rules |
|---|---|
| `objects[]` | `{id, topic, ready}`. The IDs are `snowboard`, `bicycle`, and `laptop`; `ready` is false until the twin's spec marks a topic ready (FR-023) |
| `free_talk` | `{ready}`: false until the twin's spec marks free talk ready ([contracts/room-conversation.md §1](contracts/room-conversation.md#1-readiness)) |
| `items[]` | every resume item's ID |
| `avatars[]` | `woman`, `man`, `dinosaur`, and `dog` (intent 000's four placeholders), until spec 003's avatars replace them |
| `placeholders` | `true` while any placeholder geometry or avatar is in use |
| `event_kinds[]` | the kinds §8 lists |

**`resume.lock.json`:** `{files: {<corpus path>: <sha256>}}`, for every corpus and facts file the source and scripts cite.

**`config/room-events.yaml`:** `{schema: 1, kinds[], objects[], items[]}`, the event kinds (§8), the object IDs, and the resume's item IDs, generated by the build from the same source as the manifest and committed, so the gateway can read it from its mounted `config/` ([contracts/room-events.md §3](contracts/room-events.md#3-the-gateways-route)). `make test` fails when it's stale.

## 6. The conversation turn (later)

For the twin's spec to implement; the room's side is built now ([contracts/room-conversation.md](contracts/room-conversation.md)):

| Field | Rules |
|---|---|
| `feature` | `snowboard`, `bicycle`, `laptop`, or `free_talk` (the room features of the spec's Key Entities that start a turn) |
| `path` | `engineer` or `non-engineer` |
| `turns[]` | `{role: visitor or twin, text}`, the conversation so far, the newest last, within the per-turn limits the twin's spec sets in `config/budgets.yaml` (the Author's file) |

## 7. The fixed messages

**`content/messages.yaml`:** `{id, text}` entries, written in advance (FR-039):

| ID | When |
|---|---|
| `topic_not_ready` | an object whose topic isn't ready (FR-023) |
| `cannot_talk.resting` | no route; the local tier is off |
| `cannot_talk.budget` | no route; the day's budget is used |
| `cannot_talk.unavailable` | no route; any other cause, and the room's state while no conversation exists |
| `voice_unavailable` | the talk button when recognition can't answer, or doesn't exist (FR-040) |
| `voice_output_unavailable` | the twin's voice can't be produced (FR-041) |
| `didnt_catch` | an empty transcript (FR-028) |
| `utterance_limit` | 30 seconds reached (FR-029) |

Each `cannot_talk` message ends by pointing to the resume and the PDF.

## 8. A usage event

| Field | Type | Rules |
|---|---|---|
| `kind` | string | one of `object_selected`, `item_selected`, `resume_opened`, `resume_kept`, `pdf_downloaded`, `turn_sent`, `voice_pressed`, `mode_2d` |
| `id` | string, optional | for `object_selected`, an object ID; for `item_selected`, an item ID; for the others, absent |

**Nothing else.** No text, audio, path, avatar, client address, visit ID, or time: the gateway's clock times it (FR-054). It becomes one increment of `h4.room.events{kind, id}`, labelled `id="-"` when absent.

## 9. The visit (in the page)

| Field | Rules |
|---|---|
| `path` | set once at the choice; never changed (FR-002) |
| `avatar` | set once at the choice |
| `stage` | `choosing` → `handoff` → `room` |
| `resumeKept` | set when the hand-off ends with "later" |
| `mode` | `3d`, `reduced`, or `2d` (R-04) |
| `quality` | the controller's level, 0 to 3 |
| `turns[]` | the conversation so far, empty until conversations exist |

Held in one module-level object. Never written to cookies, `localStorage`, `sessionStorage`, IndexedDB, or the URL. A reload starts at `choosing` (FR-002, FR-003).

**State transitions:** `choosing` (path and avatar both chosen, then confirm) → `handoff` (at most 5 s, no skip) → `room`. A reload from any stage goes back to `choosing`. `mode` moves from `3d` to `reduced` to `2d` under the controller, or straight to `2d` by the visitor's control or a lost context; it never moves back up during a visit.
