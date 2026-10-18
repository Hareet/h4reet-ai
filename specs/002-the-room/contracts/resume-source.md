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
  # The PDF's header (the full name and one contact channel) isn't in this file: it comes from
  # assets/policy/resume-header.json on main (§5), outside corpus/, filled by the Author.
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
| C3 | The quote lies inside one tagged span: the text from a backticked claim tag (the tags the corpus README lists) to the next tag or the line's end. The corpus writes each tag before the sentence it covers, and one line can hold several tagged sentences | `untagged sentence` |
| C4 | The span's own tag, the one that opens it, never another tag on the same line, is sufficient for the citation's use ([data-model.md §2](../data-model.md#2-the-resume-source)): `[?]` never; `[P]`, `[A-JD]`, or `[A-SRE-JD]` alone never for an item with `verb` | `tag not sufficient` |
| C5 | The sentence isn't under a heading whose text is "Do not claim" | `do-not-claim section` |
| C6 | Every digit in `text` is inside a `{{slot:…}}` | `bare number` |
| C7 | Every `{{slot:<id>}}` and every `slots[]` entry exists in `corpus/facts/*.yaml` | `unknown slot` |
| C8 | When `verb` is set, it appears in `text` and in at least one cited sentence | `ownership verb not cited` |
| C9 | No item's `text` and no line of `header.room` contains a phrase from the forbidden list: every corpus file's "Do not claim" key phrases, the surname rule, and the private denylist's phrases when the build can read it ([narration.md §2](narration.md#2-checks), N3). The display text is the Author's wording, so C1–C8 prove it cites the corpus, and C9 proves it doesn't say what the corpus forbids | `forbidden phrase (from <file:line>)`, never the phrase itself when its source is the private denylist |

**Slots** render as the fact's `phrasing` with `{value}` filled when the fact has a value and `public_safe: true`, else as the citation's declared fallback (`fallback:` on the slot reference) or nothing. Never an estimate (the corpus's rule).

## 3. The lock

`apps/web/content/resume.lock.json` holds `{files: {<corpus path>: <sha256>}}` for every file any citation names. The check recomputes the digests, and fails with `corpus changed since the lock: <path>` when one differs. `npm run content:lock -w apps/web` rewrites it after a rebuild (FR-016).

## 4. The renderings

**The interactive resume's data** goes in `room-data.json`: the header's `room` part, then each section's items with their slots filled, each marked `approved` or draft (§5).

**The PDF**, `resume.pdf`, comes from the same parsed items in the same order, with the same filled text:

| Property | Value |
|---|---|
| Header | the full name and the contact channel from `main`'s `assets/policy/resume-header.json` (§5) when both are filled, else the `room` header (FR-017) |
| Structure | tagged: a `Document` with `H1` (the name), `H2` per section, `L`/`LI` per item, in reading order |
| Language | `en-US`, on the catalog |
| Title | "Resume", with `DisplayDocTitle` true |
| Font | the vendored font, embedded and subset; no other font |
| `Info` keys | `Title` and `Author` only. No `CreationDate`, `ModDate`, `Producer`, `Creator`, `Subject`, or `Keywords`, so nothing in the file dates or names its toolchain, and the same source and policy build the same bytes. No XMP metadata stream either, so no `xmp:CreatorTool` and no `pdf:Producer` |
| Links | none but the site's own URL, when spec 001 gives it one |

**Equality** (SC-002): the PDF's extracted text, with whitespace collapsed, holds each item's filled text exactly once, in order, and nothing that isn't in the source except the section titles and the header.

## 5. Approvals

`assets/policy/content-approvals.json` is human-only, beside spec 003's `approvals.json`. The Author's patch creates it and `resume-header.json` (below), and protects both in `.claude/hooks/protected-paths.sh` and `.claude/settings.json`, before the first draft is committed:

```json
{
  "schema": 1,
  "approvals": [
    {"id": "C-0001", "path_when_approved": "apps/web/content/resume.yaml", "kind": "resume",
     "sha256": "<64 hex>", "date": "<YYYY-MM-DD>", "reason": "<the Author's words>"}
  ]
}
```

`kind` is `resume` or `narration`. A file is approved when an entry's `sha256` equals its current digest, whatever its path now.

**The PDF's header** comes from a second human-only file in the same directory, `assets/policy/resume-header.json`, which the Author fills and the twin never reads:

```json
{"schema": 1, "full_name": null, "contact": null}
```

Each value is a string or `null`. While either is `null`, the PDF gets the room's header (FR-017). It sits outside `corpus/` because the corpus keeps the surname out of every file the twin reads (spec.md's Assumptions; `corpus/tools/check_corpus.py`'s rule 4 and `corpus/INTAKE.md`).

**Read from `main`, on the host, never by the build stage:** the build reads both files from a policy directory, never from the branch it builds, and never runs git itself.
- **The `web` image:** `web_image.py` fills the directory from `main` on the host with `GIT_NO_REPLACE_OBJECTS=1 git cat-file blob refs/heads/main:<path>` (the branch's full ref, since a bare `main` resolves to a tag of that name first, and an agent session can make one) and hands it to the build as the named build context `policy` ([web-serving.md §1](web-serving.md#1-the-web-image)). A host stack's build context is a `git archive` export with no `.git`, so reading `main` inside the build stage would find nothing and make every file a draft.
- **An agent session's or `make check`'s build** (`npm run build -w apps/web`, in a checkout): the workspace's `prebuild` step, `build/policy.ts`, fills the same directory from `main` the same way.
- **No `main`, or no file on it:** every content file counts as a draft, and the PDF gets the room's header.

So an approval is in effect only once the Author's commit to it is on `main`, as spec 003's check reads its policy.

**Drafts and approval:** the build marks each content file approved or a draft. With `ROOM_DRAFTS` unset, drafts are left out of `room-data.json` and the PDF: an item with a draft script shows its text without narration, and a draft source builds a PDF and resume that say "Draft, not approved" and no more. With `ROOM_DRAFTS=1`, which `web_image.py` sets only for the `-drafts` images of dev and dev-cpu, drafts show with a banner.

**The gate's own check** (human-only, so a branch's build code can't approve itself): `tools/gates/content_check.py`, in the Author's gate and in `make check`, after a build with `ROOM_DRAFTS` unset. It reads `main`'s approvals file itself, recomputes each content file's SHA-256 from the tree, and fails when `room-data.json` publishes any file whose digest `main` doesn't approve, or doesn't list a draft in its `drafts`. `apps/web/build/approvals.ts` stays the build's convenience; this check is the enforcement.

**How the Author approves:** in the Author's terminal, `sha256sum apps/web/content/resume.yaml`, then an entry in `assets/policy/content-approvals.json`, committed on `main`.

## 6. Proposals

The draft source is filed for the Author in `corpus/proposals/resume-<date>.md`, with a pointer to the draft and any facts slots its items need, unfilled. The PDF's header isn't proposed there: the Author fills `assets/policy/resume-header.json` directly (§5). Agents never write `corpus/` outside `proposals/`.
