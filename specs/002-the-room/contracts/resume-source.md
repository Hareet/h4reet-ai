# Contract: the resume source, its checks, and its two renderings

The resume's one source, how the build checks it against the corpus, and what it renders: the interactive resume's data and the PDF. Spec: FR-012 to FR-019, SC-002. Plan: §2, §3. Data: [data-model.md](../data-model.md) §2, §4, §5.

## 1. The source file

`apps/web/content/resume.yaml`, UTF-8, YAML 1.2 parsed with the `yaml` package's core schema (no custom tags, no anchors pointing across sections):

```yaml
version: 1
header:
  room:
    name: <what the conversation rule allows: no surname>
    lines:
      - text: <a line, for example the current role>
        claims: [{file: corpus/00-profile.md, quote: "<a span of a tagged sentence>"}]
  pdf:
    name_slot: profile.full_name      # proposed in corpus/proposals/ for the Author's facts
    contact_slot: profile.contact
sections:
  - id: <section-id>
    title: <title>
    items:
      - id: <item-id>
        text: "<display text; any digit inside {{slot:<id>}}>"
        verb: <ownership verb, for a role claim>
        claims:
          - file: corpus/<file>.md
            quote: "<a span of one tagged sentence>"
        slots: [<slot id>]
```

No content about the Author goes in this contract's examples: placeholders in angle brackets only.

## 2. The citation check

`apps/web/build/content.ts`, run by the workspace's `build` and `test` scripts. For each citation, in order, failing at the first problem with `<item-id>: <reason>`:

| # | Rule | Fails with |
|---|---|---|
| C1 | `file` is under `corpus/`, a Markdown file, and not under `intake/`, `proposals/`, or `facts/` | `not a corpus file` |
| C2 | `quote` is at least 12 characters and appears verbatim, after whitespace is collapsed, inside one sentence of `file` | `quote not found` |
| C3 | That sentence's line carries a claim tag (the backticked tags the corpus README lists) | `untagged sentence` |
| C4 | The tag is sufficient for the citation's use ([data-model.md §2](../data-model.md#2-the-resume-source)): `[?]` never; `[P]`, `[A-JD]`, or `[A-SRE-JD]` alone never for an item with `verb` | `tag not sufficient` |
| C5 | The sentence isn't under a heading whose text is "Do not claim" | `do-not-claim section` |
| C6 | Every digit in `text` is inside a `{{slot:…}}` | `bare number` |
| C7 | Every `{{slot:<id>}}` and every `slots[]` entry exists in `corpus/facts/*.yaml` | `unknown slot` |
| C8 | When `verb` is set, it appears in `text` and in at least one cited sentence | `ownership verb not cited` |

**Slots** render as the fact's `phrasing` with `{value}` filled when the fact has a value and `public_safe: true`, else as the citation's declared fallback (`fallback:` on the slot reference) or nothing. Never an estimate (the corpus's rule).

## 3. The lock

`apps/web/content/resume.lock.json` holds `{files: {<corpus path>: <sha256>}}` for every file any citation names. The check recomputes the digests, and fails with `corpus changed since the lock: <path>` when one differs. `npm run content:lock -w apps/web` rewrites it after a rebuild (FR-016).

## 4. The renderings

**The interactive resume's data** goes in `room-data.json`: the header's `room` part, then each section's items with their slots filled, each marked `approved` or draft (§5).

**The PDF**, `resume.pdf`, comes from the same parsed items in the same order, with the same filled text:

| Property | Value |
|---|---|
| Header | the `pdf` header when both slots have values, else the `room` header (FR-017) |
| Structure | tagged: a `Document` with `H1` (the name), `H2` per section, `L`/`LI` per item, in reading order |
| Language | `en-US`, on the catalog |
| Title | "Resume", with `DisplayDocTitle` true |
| Font | the vendored font, embedded and subset; no other font |
| `Info` keys | `Title` and `Author` only; `Producer` and `Creator` are absent or empty; `CreationDate` and `ModDate` are the source's approval date at 00:00 UTC (or the commit's date for a draft) |
| Links | none but the site's own URL, when spec 001 gives it one |

**Equality** (SC-002): the PDF's extracted text, with whitespace collapsed, holds each item's filled text exactly once, in order, and nothing that isn't in the source except the section titles and the header.

## 5. Approvals

`approvals/content.yaml` is human-only. The Author's patch creates it, and protects it in `.claude/hooks/protected-paths.sh` and `.claude/settings.json`, before the first draft is committed:

```yaml
version: 1
content:
  - path: apps/web/content/resume.yaml
    sha256: <64 hex>
    approved: <YYYY-MM-DD>
assets: []   # spec 003's section
```

**Drafts and approval:** the build reads the file and marks each content file approved or a draft. With `ROOM_DRAFTS` unset, drafts are left out of `room-data.json` and the PDF: an item with a draft script shows its text without narration, and a draft source builds a PDF and resume that say "Draft, not approved" and no more. With `ROOM_DRAFTS=1`, which the `web` image's build sets on dev and dev-cpu only, drafts show with a banner.

**How the Author approves:** `sha256sum apps/web/content/resume.yaml`, then a line in `approvals/content.yaml`, in the Author's terminal.

## 6. Proposals

The draft source, and the two header slots it proposes, are filed for the Author in `corpus/proposals/resume-<date>.md`: the slot definitions in `facts/` YAML, unfilled, plus a pointer to the draft. Agents never write `corpus/` outside `proposals/`.
