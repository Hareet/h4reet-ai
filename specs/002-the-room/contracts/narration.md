# Contract: narration scripts, their checks, and their display

Spec: FR-011, FR-012, FR-014, FR-015, FR-016, SC-006, SC-009. Plan: §5. Research: R-07, R-08. Data: [data-model.md](../data-model.md) §3.

## 1. The script file

`apps/web/content/narration/<item-id>.<path>.md`:

```markdown
---
item: <item-id>
path: engineer            # or non-engineer
claims:
  - file: corpus/<file>.md
    quote: "<a span of one tagged sentence>"
slots: []
---
<the words, at most 900 characters>
```

**The two paths.** The engineer path's script goes into the topic sections' depth; the non-engineer path's stays at "Role at a glance" depth, with the same facts (the spec's User Story 3, scenario 3).

## 2. Checks

Run by the workspace's `build` and `test` scripts:
- **N1, citations:** the resume source's C1–C8 ([resume-source.md §2](resume-source.md#2-the-citation-check)) apply to each script's citations and body, with its item's `verb` from `resume.yaml` setting C4's bar: a script tells its item's story, so its citations need a tag sufficient for a role claim. The front matter has no `verb` of its own, and the words needn't say the item's: they keep the cited sentences' own grammar for the Author's acts. So every ownership verb, and every act verb the corpus uses ("released", "organized", "found", and the rest in `content.ts`'s `ACT_VERBS`), that the words say is one a cited sentence says (C8), and one the words say as the Author's act is one a cited sentence says as an act, in the active or with a "by" naming the agent, never only in an agentless passive (`passive made active`). A ruling annotation (`Ownership: *led*.`) rules which verb to use and isn't a sentence: a script neither cites one (`quotes a ruling annotation, not a sentence`) nor reads one out (`reads out a ruling annotation`). Its C9 is N3 below.
- **N2, completeness:** every item in `resume.yaml` has both scripts; no script names an item that doesn't exist (FR-016).
- **N3, forbidden phrases:** the build assembles the forbidden list from every corpus file's "Do not claim" section (each bullet's key phrase), the surname rule (no surname in any script), and the private denylist's phrases when the build can read it. A script that contains a listed phrase fails, with its file and the phrase's source line, never the phrase if the source is the private denylist. The resume's items and header get the same check, as C9 ([resume-source.md §2](resume-source.md#2-the-citation-check)).
- **N4, length:** at most 900 characters of words, as the file writes them (whitespace collapsed, slot references included), so filling a slot never fails a build.
- **N5, eval cases:** for each script, `npm run content:lock -w apps/web` writes `evals/narration/cases/narration-<item-id>-<path>.yaml` in spec 000's case format, and `make test` fails while one is stale, missing, or left from a script that's gone:
  - `prompt` names the item and the path;
  - `fake_response` is the words with their slots filled, as the room shows them;
  - `expect.contains` holds one key phrase per citation: the longest run of whole words its quote and the words share, compared lowercase, as the words write it. It must hold at least 12 characters, so a citation the words don't use fails the check;
  - `expect.not_contains` holds the public "Do not claim" phrases only. **No private-denylist phrase, and not the surname, is ever written into a committed file:** N3 checks those at build time and reports them by source line alone.

  **Their own suite, `narration`, run on the fake adapter only.** `make evals` runs `evals/run.py --suite narration --adapter fake`, and `run.py` refuses `--suite narration` with any other adapter. Kept out of the `product` suite, they can't be sent to a stack's `/hello` by a local run, or charged to prod's meter by a Bedrock run. When the twin exists, its spec adds model-judged cases for the same scripts, in a suite of its own.

## 3. Approval

As the resume source ([resume-source.md §5](resume-source.md#5-approvals)): a script is approved when `assets/policy/content-approvals.json` lists its current SHA-256. An unapproved script isn't published, and neither is a script whose item isn't: while the resume is withheld, no script is, and `room-data.json`'s `published` doesn't list it.

**In `room-data.json`** ([data-model.md §5](../data-model.md#5-the-built-data)): each published item carries `narration: {engineer, non-engineer}`, each `{words, approved, source, sha256}`, or `null` where a build without drafts left a draft out. `approved` is false only for a draft a drafts build shows.

## 4. Display

| Step | Rule |
|---|---|
| Start | within 1 s of the item's selection; the measure is from the click event to the first word painted (SC-006) |
| Pace | 160 words a minute, word by word, into the narration region beside the item |
| Assistive technology | the whole script goes to the panel's polite live region at the start; the word-by-word copy beside the item is hidden from assistive technology, so the script is read once |
| The AI | the region opens with a line saying the AI twin narrates the words, and the page's AI disclosure stays in view, never covered or scrolled away, while the words show (FR-004) |
| Path | the visitor's chosen path, from the room's visit through its resume adapter's context |
| Another selection | stops the current one at once and starts the new one (FR-011); selecting the same item starts it over, and closing the resume stops it |
| Draft | with `ROOM_DRAFTS=1`, a draft plays with a "Draft" label; without it, the item shows no narration |
| Voice (later) | when the build holds `narration/<item>.<path>.<hash>.ogg` (Phase 2, ADR 0011), the words follow the audio's word timings, and a "Voice" toggle mutes it while keeping the words (FR-025) |
