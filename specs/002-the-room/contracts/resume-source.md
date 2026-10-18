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
| C1 | `file` is one of the corpus's topic files, `corpus/NN-<topic>.md` at its top level: not under `intake/`, `proposals/`, or `facts/`, and not `README.md` or `INTAKE.md` | `not a corpus file` |
| C2 | `quote` is at least 12 characters and appears verbatim, after whitespace is collapsed, inside one sentence of `file` | `quote not found` |
| C3 | The quote lies inside one tagged span: the text from a backticked claim tag (the tags the corpus README lists) to the next tag or the line's end. The corpus writes each tag before the sentence it covers, and one line can hold several tagged sentences | `untagged sentence` |
| C4 | The span's own tag, the one that opens it, never another tag on the same line, is sufficient for the citation's use ([data-model.md §2](../data-model.md#2-the-resume-source)): `[?]` never; `[P]`, `[A-JD]`, or `[A-SRE-JD]` alone never for an item with `verb` | `tag not sufficient` |
| C5 | The sentence isn't under a heading whose text is "Do not claim" | `do-not-claim section` |
| C6 | Every digit in `text` is inside a `{{slot:…}}` | `bare number` |
| C7 | Every `{{slot:<id>}}` and every `slots[]` entry exists in `corpus/facts/*.yaml` | `unknown slot` |
| C8 | When `verb` is set, it appears in `text`; and every ownership verb `text` uses, `verb` included, appears as a verb in at least one cited sentence, so a noun phrase the corpus uses ("his pitch and design") never becomes a second ownership claim ("designed"). The corpus's other act verbs (`content.ts`'s `ACT_VERBS`: "released", "organized", "found", and the rest) are held the same way. And a verb the text says as an act, in the active or in a passive whose "by" names the agent, is one a cited sentence says as an act: an agentless passive, such as a verb coordinated after a "by" passive ("Built by Hareet and released to production"), never becomes the Author's act (narration's review, 2026-10-18) | `ownership verb not cited`; `passive made active` |
| C9 | No item's `text` and no line of `header.room` contains a phrase from the forbidden list: every corpus file's "Do not claim" key phrases, the surname rule, and the private denylist's phrases when the build can read it ([narration.md §2](narration.md#2-checks), N3). The display text is the Author's wording, so C1–C8 prove it cites the corpus, and C9 proves it doesn't say what the corpus forbids | `forbidden phrase (from <file:line>)`, never the phrase itself when its source is the private denylist |

**Slots** render as the fact's `phrasing` with `{value}` filled when the fact has a value and `public_safe: true`, else as the citation's declared fallback (`fallback:` on the slot reference, or the corpus's own `{{slot:<id> | else: <text>}}`) or nothing. Never an estimate (the corpus's rule). A fallback's digits count for C6.

**Readings** (plan §2, "What group 3 found"): C3 reads a tag only on the line it covers, so a heading's tag covers no bullet below it, and only a real tag counts: an `A` tag's date is digits and an `A-DOC` tag names its document in words, so the README's examples `[A date]` and `[A-DOC <name>]` are text. C9's "Do not claim" key phrases are each bullet's text up to its first clause break, without a leading "That" or its subject, then each alternative it joins with "or", a leading verb carried to an alternative that has none ("built the CHT skills or `cht-pr-review`" gives "built the cht skills" and "built cht-pr-review"), compared lowercase. The surname rule is each word of `main`'s `full_name` after the first (§5), matched as a whole word, and reported as `forbidden phrase (from the surname rule)`.

## 3. The lock

`apps/web/content/resume.lock.json` holds `{files: {<corpus path>: <sha256>}}` for every file any citation names, and every facts file a slot reads. The check recomputes the digests, and fails with `corpus changed since the lock: <path>` when one differs. `npm run content:lock -w apps/web` rewrites it after a rebuild (FR-016), and refuses while C1–C9 fail. `make test` fails on a stale lock; the build only warns, so a corpus edit on `main` never stops `make up`.

## 4. The renderings

**The interactive resume's data** goes in `room-data.json`: the header's `room` part, then each section's items with their slots filled, each marked `approved` or draft (§5).

**The PDF**, `resume.pdf`, comes from the same parsed items in the same order, with the same filled text:

| Property | Value |
|---|---|
| Header | the full name and the contact channel from `main`'s `assets/policy/resume-header.json` (§5) when both are filled, then the `room` header's lines; else the `room` header (FR-017) |
| Structure | tagged: a `Document` with `H1` (the name), `H2` per section, `L`/`LI` per item, in reading order |
| Language | `en-US`, on the catalog |
| Title | "Resume", with `DisplayDocTitle` true |
| Font | the vendored font, embedded and subset; no other font |
| `Info` keys | `Title` and `Author` only. No `CreationDate`, `ModDate`, `Producer`, `Creator`, `Subject`, or `Keywords`, so nothing in the file dates or names its toolchain, and the same source and policy build the same bytes. No XMP metadata stream either, so no `xmp:CreatorTool` and no `pdf:Producer` |
| Links | none but the site's own URL, when spec 001 gives it one |

**Equality** (SC-002): the PDF's extracted text, with whitespace collapsed, holds each item's filled text exactly once, in order, and nothing that isn't in the source except the section titles and the header.

**The PDF's text**, `resume.pdf.txt` beside it: the text pdf.js extracts, one line, a line broken after a hyphen rejoined. The embedded font stores glyph codes, so this is what the gate's scan of `dist/` reads to cover the PDF (§5). It is the gate's, never the visitor's: with the full header filled it would hold the name and contact as crawlable plain text, so the `web` image's runtime stage never gets it, and its nginx answers 404 for any `*.pdf.txt`.

**A withheld draft** (§5) builds a PDF whose only text is "Draft, not approved", with `Title` alone in `Info`, and a `room-data.json` with no header and no items.

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

**The gate's own check** (human-only, so a branch's build code can't approve itself): `tools/gates/content_check.py`, in the Author's gate and in `make check`, after a build with `ROOM_DRAFTS` unset. It reads `main`'s approvals file itself, by the branch's full ref (`refs/heads/main`, never a bare `main`, which a tag of that name would answer), recomputes each content file's SHA-256 from the tree, and trusts none of the build's bookkeeping. It fails when an entry of `room-data.json`'s `published` names a file that isn't content, carries a digest other than the file's, or one `main` doesn't approve; and, whatever `room-data.json` says, when any text of a file `main` doesn't approve appears in a file under `dist/`: the resume's displayed values and a script's body, cut at slots and sentence ends into fragments of at least 24 characters, a fragment an approved file also shows not counting. A PDF built with an embedded font holds its text as glyph codes, which the scan can't read; the PDF is held by `published` and by its own test, which extracts its text (Phase 3). `apps/web/build/approvals.ts` stays the build's convenience; this check is the enforcement.

**How the Author approves:** in the Author's terminal, `sha256sum apps/web/content/resume.yaml`, then an entry in `assets/policy/content-approvals.json`, committed on `main`.

## 6. Proposals

The draft source is filed for the Author in `corpus/proposals/resume-<date>.md`, with a pointer to the draft and any facts slots its items need, unfilled. The PDF's header isn't proposed there: the Author fills `assets/policy/resume-header.json` directly (§5). Agents never write `corpus/` outside `proposals/`.
