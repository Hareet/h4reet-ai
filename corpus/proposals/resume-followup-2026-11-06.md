# Proposal: the resume's follow-up (patch D), from your answers of 2026-10-30 and 2026-11-06

Proposed by: Claude Code (Opus 5.5), the main session · Date: 2026-11-06 · Branch: `docs/corpus-resume-followup`
Status: a patch for you to commit on a short branch, `docs/corpus-patch-d`, at this branch's tip. The session then cuts the content branch, `feat/002-resume-followup`, on your commit, and you merge that by hand, by the merge-request notes' steps. Neither this file nor the patch changes anything in `corpus/` by itself.

## What this is

`docs/merge-requests/2026-11-06-corpus-resume-followup.patch` (patch D) carries your answers of 2026-10-30, which no committed file recorded, into the corpus in your words. With them come your two answers of 2026-11-06 on where the credits sit. The content branch on your commit carries the rest: "configured" as an ownership verb in the content check and spec 002's data model, and the two resume items your answers change.

It was built from plain copies of `main`'s files at df2dcf45 (`git cat-file`, edited outside any checkout, then `git diff --no-index --full-index`, with the new file's header set to `a/…` and `b/…`). No checkout's `corpus/` was written.

| | |
|---|---|
| Blob ID | `0c20cdee2459cb59004f576de7f54e7ffa9f61f5` |
| Files changed | `corpus/00-profile.md`, `02-production-infrastructure-national-scale.md`, `03-grants-and-credits.md`, `07-denver-local-ai.md`, `README.md` |
| File added | `corpus/facts/credits.yaml` |
| Checked | On a fresh plain export of `main`'s tip, df2dcf45: `git apply --check`, then `git apply`, both clean, and the six files match the plain copies byte for byte. `corpus-check`: "OK — 44 slots, 26 filled" (rule 4 skipped: this session can't read your denylist). Its SHA-256 is in the merge-request note |

**Why the lock isn't in it.** Patches B and C carried the regenerated lock and eval cases, so `main` stayed green after your one commit. Patch D comes with a content branch anyway, because the resume's text and the check's code change. So, as with patch A, the lock goes in the content branch. With patch D alone, `make test` reports the lock stale for `00`, `02`, `03`, and `07`. Nothing merges until the content branch brings both. The 44 narration eval cases don't change: no "Do not claim" key phrase moves.

## Your words

| When | Your words |
|---|---|
| 2026-10-30, your answers in the main session, given again in your message of 2026-11-06 | The label: "(co-owner, Applied AI Engineer)". The verb: "Yes, configured for technical software is a verb". PowerSync: "Identified the endpoint, performance benchmarked it, showcased an alternate powersync offline-online solution, garnered [slot `credits.anthropic_amount`] usage credits from Anthropic to create custom sync-layer and pilot with a partner" (the amount as you said it is the slot's value). The item: "The resume's PowerSync item stays as it is." The amount: "public for the resume and the twin" |
| 2026-11-06, this session | Asked whether these are the Anthropic credits `03` has listed since your answer of 2026-09-14: "The same credits". Asked who received them: "Medic, on my application". Asked how to merge: "Merge by hand, no gate" |
| 2026-11-06, your message | "Patch B left 00-profile.md's "Background and values" without a pointer to 04 to 06. Add it here." |

The main session's own record of your 2026-10-30 sitting has the same PowerSync and "configured" words, so those lines carry `[A 2026-10-30]`. Your answers of 2026-11-06 carry `[A 2026-11-06]`.

## Every change, with your words beside it

### `00-profile.md`

| Where | The patch | Your words |
|---|---|---|
| The header | Adds "Untagged lines are pointers to other files, or a corpus patch's own note, marked as such.", as `04` to `08` say of theirs | — (the pointer below is the file's second untagged line) |
| Background and values, new last line | "His hobbies and travel are in `04-hobbies-and-travel.md`, his mission in `05-mission.md`, and his work projects in `06-work-projects.md`, from his interview of 2026-11-06." | "Add it here." Patch B's proposal listed the missing pointer as stale |

### `02-production-infrastructure-national-scale.md`

| Where | The patch | Your words |
|---|---|---|
| Designing new systems, new last line | "`[A 2026-10-30]` His account of the PowerSync work, in his words: "Identified the endpoint, performance benchmarked it, showcased an alternate powersync offline-online solution, garnered [slot `credits.anthropic_amount`] usage credits from Anthropic to create custom sync-layer and pilot with a partner". `[A 2026-11-06]` Medic received the credits, on his application (see `03-grants-and-credits.md`)." | Your account, verbatim, with the amount in the slot; "Medic, on my application" |

Your answer ended without a full stop, so the line's full stop sits outside the quote, as patch C did. "powersync" and "sync-layer" stay as you wrote them.

### `03-grants-and-credits.md`

| Where | The patch | Your words |
|---|---|---|
| The header | After "`[A 2026-09-27]` No amounts anywhere in the corpus: they are not public-safe.", adds "`[A 2026-10-30]` The exception here is the Anthropic credits' amount, which he made public for the resume and the twin; it renders from `facts/credits.yaml`." | "public for the resume and the twin" |
| Anthropic credits | "`[A 2026-09-14]` `[?]` Program, year, purpose." becomes "`[A 2026-09-14]` `[A 2026-11-06]` Medic received them, on his application, and they are the credits in his account of the PowerSync work (`02-production-infrastructure-national-scale.md`). `[A 2026-10-30]` In his words, from that account: "garnered [slot `credits.anthropic_amount`] usage credits from Anthropic to create custom sync-layer and pilot with a partner". `[?]` Program and year." | "The same credits"; "Medic, on my application"; your account |
| Do not claim | "Any amount, for any award — including a category's published maximum, which would imply the amount." gains "The exception is the Anthropic credits' amount, public at his choice (2026-10-30), from its facts slot." | "public for the resume and the twin" |

"That Hareet won anything personally; Medic won on his pitch and design." stays as it is: your answer gives the credits to Medic.

### `07-denver-local-ai.md`

| Where | The patch | Your words |
|---|---|---|
| Role at a glance, after your resume's line | "`[A 2026-10-30]` His resume label for the company, in his words: "(co-owner, Applied AI Engineer)"." | "The Denver Local AI resume label: "(co-owner, Applied AI Engineer)"." |

### `facts/credits.yaml` (new) and `README.md`

| Slot | Value | Source, in your words |
|---|---|---|
| `credits.anthropic_amount` | the amount in your PowerSync account, as you said it | "garnered … usage credits from Anthropic to create custom sync-layer and pilot with a partner", "public for the resume and the twin" (2026-10-30); "Medic, on my application" and "The same credits" (2026-11-06) |

It's tagged A, `public_safe: true`, and its phrasing is the bare value, so your quotes render exactly as you said them. The slot sits in a new file rather than `facts/awards.yaml`, whose header says "No amounts, ever". The README's row for `03` changes from "awards and credits, without amounts" to "awards and credits, without amounts but one: the Anthropic credits', in a facts slot".

## The resume, on the content branch

| Item | The change | Its citations |
|---|---|---|
| `denver-local-ai` | "Denver Local AI Solutions (co-owner): …" becomes "Denver Local AI Solutions (co-owner, Applied AI Engineer): private AI for small Denver teams, with sensitive files kept on hardware they own." | Adds `07`'s new line, "co-owner, Applied AI Engineer"; the other two stay |
| `agent-orchestrator` | Declares the verb "configured"; its text already said it | `01`'s "Hareet configured a supervisor agent over agent-watchdog and claude-medic-aws, …", as before |
| `powersync-postgres` | None, as you said | — |

"configured" joins the check's ownership verbs, `OWNERSHIP_VERBS` in `apps/web/build/content.ts`, and the `verb` field's list in spec 002's `data-model.md` §2, with your words. `plan.md` records it beside "architected". A new test fails without it and passes with it. The lock changes only the hashes of `00`, `02`, `03`, and `07`. The 44 narration scripts and their eval cases don't change, nor does `config/room-events.yaml`.

## Readings for your eye

Each is the session's reading, beside your words, which stay as they are.

1. **"garnered" beside "Medic received them".** Your account's verbs stay as you said them: identified, performance benchmarked, showcased, garnered. With your answer, `02` and `03` say beside them that Medic received the credits, on your application. So the twin says the credits are Medic's, as `03` already says Medic won the AWS awards on your pitch and design.
2. **What the credits are for.** "to create custom sync-layer and pilot with a partner" says what the credits fund. The corpus doesn't say whether that sync layer is built yet or the pilot has started, so the twin says only what the line says. `02`'s rulings stay as they are for the system it describes: "He designed and built an offline PowerSync-to-Postgres client and server for CHT."
3. **The amount rules.** `03`'s header and its "Do not claim" each name the credits' amount as the one exception, so the twin may say it while every other amount stays refused. The bullet's first clause is unchanged, so its forbidden phrase, "any amount", and the eval cases stay as they are. `00`'s "Award amounts" stays too: the credits aren't an award.
4. **The label.** It answers patch A's guide question 3: the site labels you "Applied AI Engineer" and your wife "Owner", where you said you co-own the company. `07` now holds your label beside the site's. Its "Do not claim" line against owning the company alone stands, and the site's bio line stays out.
5. **"configured"** goes where you said: spec 002's data model and the check's code, not the corpus. The README's Role precision list already has it, and `01`'s rulings already say "*Configured:* the agent orchestrator".

## Questions that remain

- **The credits' program and year:** `03` keeps `[?]` for both.
- **PowerSync's place** (patch A's guide question 5): your resumes put the PowerSync work under SRE Lead, and `02` calls it a system "designed since". Your account doesn't place it in time, so both stay.
- **A Golden Q&A for the credits:** `03`'s Golden Q&A 1 ("What have you won?") doesn't name them, and none answers how much they were. A Golden Q&A is yours to write; until then the twin answers from the bullet.
- **The Denver Local AI scripts:** both narration scripts still say "Hareet co-owns Denver Local AI Solutions with his wife" without the label. Say if they should add that he's its Applied AI Engineer.
- **Still open from patches B and C:** the priorities of `04` to `06`, the answer you'll finish later, and the denverlocal.ai paragraph.

## For you to know

- **Your denylist.** `corpus-check`'s rule 4 runs only on your machine, and the note's first step runs your denylist over this branch's committed files before you apply anything. The patch names Anthropic, PowerSync, Medic, and Denver Local AI Solutions, which the corpus already names. A denylist line for any of them fails rule 4.
- **The room.** The resume's text changes on the content branch, and stays a draft until you approve its hash. The topics stay unready, so nothing else the room shows changes.

## Lines the patch leaves stale

- The "Last verified" dates of `00`, `02`, and `03`.
- `03`'s Golden Q&A 1, without the Anthropic credits.
- `07`'s "Do not claim" line on prices ends "the corpus holds no amounts": the credits' amount is in `facts/` now, as the kill switch's daily figure has been since patch A. The line's point, that the corpus has no price, still holds.
- `00`'s Naming conventions still calls "architected and configured" a note of the 2026-10-29 patch, not your statement.
- `INTAKE.md`'s open item "Voice for CHT credits and any Anthropic credits: program and year.": the Anthropic credits' purpose is known now; program and year aren't.
- The README's "Phase 1 minimum — status (2026-09-27)" counts, as patches B and C left them.
