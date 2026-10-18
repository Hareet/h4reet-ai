# Data Model: The Room (spec 002)

Phase 1 output of `/speckit-plan`. Nothing here is stored at run time on the server: the room's data is files built from the repository, the visit lives in the page, and usage events become counters. The contracts give the formats in full; this file names each entity, its fields, its rules, and its states.

## 1. Where things live

| Entity | Where | Who writes it |
|---|---|---|
| The resume source | `apps/web/content/resume.yaml` | agents draft; the Author approves by hash |
| A narration script | `apps/web/content/narration/<item-id>.<path>.md` | agents draft; the Author approves by hash |
| The fixed messages | `apps/web/content/messages.yaml` | agents, reviewed |
| The approvals | `approvals/content.yaml` (human-only) | the Author |
| The lock | `apps/web/content/resume.lock.json` | the build |
| The room's data | `apps/web/dist/room-data.json` | the build |
| The room's manifest | `apps/web/dist/room-manifest.json` | the build |
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
| `header.pdf` | object | `{name_slot, contact_slot}`: two facts slot IDs. While either slot is empty, the PDF uses `header.room` (FR-017) |
| `sections[]` | list | `{id, title, items[]}`; `id` matches `^[a-z][a-z0-9-]{1,40}$`, unique |
| `items[]` | list | see Item |

**Item:**

| Field | Type | Rules |
|---|---|---|
| `id` | string | `^[a-z][a-z0-9-]{1,40}$`, unique across the source; it's the item's ID in events, scripts, and the manifest |
| `text` | string | display text, at most 400 characters. Any digit must sit inside a `{{slot:<id>}}` (FR-014). No "we" without its expansion (the corpus's rule) |
| `claims[]` | list, at least one | each `{file, quote}`. `file` is a path under `corpus/` (no `intake/`, `proposals/`, or `facts/`); `quote` is at least 12 characters, found verbatim in one sentence of that file |
| `slots[]` | list | the slot IDs `text` uses; each must exist in `corpus/facts/*.yaml` |
| `verb` | string, optional | for a role claim, one of the corpus's ownership verbs (built, designed, co-authored, sourced, sponsored, AI system architect, led, was part of a team that); the check requires it to appear in `text` and in a cited sentence (FR-015) |

**A citation is sufficient** when the cited sentence's tag is one of `[A …]`, `[A-DOC …]`, `[A-BIO]`, `[A-CHAT]`, `[A-NOTES]`, or `[C]`. A sentence tagged only `[P]`, `[A-JD]`, or `[A-SRE-JD]` is sufficient for a fact about a system or organization, never for a claim with `verb`. A `[?]` sentence is never sufficient. No sentence under a "Do not claim" heading is citable.

## 3. A narration script

**`content/narration/<item-id>.<path>.md`**, where `<path>` is `engineer` or `non-engineer`:

| Part | Rules |
|---|---|
| Front matter: `item` | the item's ID; must exist in the source |
| Front matter: `path` | `engineer` or `non-engineer`, matching the file name |
| Front matter: `claims[]` | as an item's |
| Front matter: `slots[]` | as an item's |
| Body | plain text, at most 900 characters (about 45 seconds at 160 words a minute), in the twin's first person about the Author in the third person, as the corpus's Golden Q&A does; any digit inside a slot |

**Required:** one script for every item on each path (FR-016). **The forbidden-claim check** fails a script that contains any phrase from the forbidden list ([contracts/narration.md](contracts/narration.md) §2), which the build assembles from each corpus file's "Do not claim" section and the surname rule.

## 4. Approvals

**`approvals/content.yaml`** (human-only):

| Field | Type | Rules |
|---|---|---|
| `version` | integer | `1` |
| `content[]` | list | `{path, sha256, approved}`: a content file's path, the SHA-256 of its bytes, and the date (`YYYY-MM-DD`) |
| `assets[]` | list | spec 003's section, the same shape, for likeness and room files |

A content file is **approved** when an entry with its path has its current SHA-256. Otherwise it's a **draft**.

**States of a content file:** `draft` → (the Author adds its hash) → `approved` → (any edit) → `draft`.

## 5. The built data

**`room-data.json`:**

| Field | Rules |
|---|---|
| `built_from` | the commit, and `resume.lock.json`'s digest |
| `drafts` | the paths of draft files, empty for a release |
| `header` | the room's header |
| `sections[].items[]` | `{id, text}` with slots filled (empty slots render their fallback or nothing), and per path `{words, approved}` |
| `messages` | the fixed messages (§7) |

**`room-manifest.json`:**

| Field | Rules |
|---|---|
| `objects[]` | `{id, topic, ready}`. The IDs are `snowboard`, `bicycle`, and `laptop`; `ready` is false until the twin's spec marks a topic ready (FR-023) |
| `items[]` | every resume item's ID |
| `avatars[]` | `woman`, `man`, `dinosaur`, and `dog` (intent 000's four placeholders), until spec 003's avatars replace them |
| `placeholders` | `true` while any placeholder geometry or avatar is in use |
| `event_kinds[]` | the kinds §8 lists |

**`resume.lock.json`:** `{files: {<corpus path>: <sha256>}}`, for every corpus and facts file the source and scripts cite.

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
