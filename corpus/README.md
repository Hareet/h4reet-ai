# Corpus: the twin's only source of truth about the Author

The twin speaks about the Author's work only from these files (Constitution VIII). Anything not here, it doesn't know and says so. Anything under "Do not claim," it refuses to assert even when a visitor insists.

## Files

| Path | What it holds |
|---|---|
| `00-profile.md` | Who the twin represents; loads first |
| `01-ai-strategy-and-cht.md` | Priority 1: the AI strategy and every AI system, with ownership rulings |
| `02-production-infrastructure-national-scale.md` | Priorities 2–3: the SRE years, teams and localization, systems designed since |
| `03-grants-and-credits.md` | Priority 4: awards and credits, without amounts but one: the Anthropic credits', in a facts slot |
| `04-hobbies-and-travel.md` | No priority yet: snowboarding, biking, Arya, and travel, from his interview of 2026-11-06; the snowboard and the bicycle open it |
| `05-mission.md` | No priority yet: what he wants his work to do, Seva day to day, and when new technology is worth it, from the same interview; the chalkboard opens it |
| `06-work-projects.md` | No priority yet: what he's building now, the infrastructure agents, and the work from his travels, from the same interview; the laptop and its screen open it |
| `07-denver-local-ai.md` | Priority 6: Denver Local AI Solutions, the company he co-owns |
| `08-hareet-ai.md` | Priority 7: this project, hareet.ai, the AI twin built in the open |
| `facts/*.yaml` | Plug-in slots for numbers and held-back details |
| `intake/` | Public source material; `intake/private/` (gitignored) for anything not cleared |
| `proposals/` | Where agents propose corpus changes; a human applies them |
| `tools/check_corpus.py` | The deterministic gate, run by `make corpus-check`, `make test`, and CI |

Priority 5, Artificial Indian Games, has no file yet.

## Claim tags (every factual sentence carries one)

- `[A date]` The Author's statement in this project, with the date. Sufficient for the twin to say it as the Author's account.
- `[A-DOC <name>]` A document the Author authored or co-authored and supplied (the strategy, the Voice for CHT brief). `07`'s `[A-DOC site]` is the Denver Local AI site, which he wrote; `07` quotes the draft of it he supplied on 2026-10-28.
- `[A-CHAT]` A statement in another chat, filed in `intake/`. `[A-BIO]` the Author's own bio. `[A-NOTES]` attributed notes from a recording the Author supplied.
- `[A-JD]` / `[A-SRE-JD]` Role scope from a job description — describes the role, never a verified accomplishment.
- `[P]` Public artifact, with URL. Enough for facts about systems and organizations; never enough on its own for a claim about the Author's role.
- `[C]` Corroborated: an Author statement a public artifact supports. The strongest tag.
- `[?]` Gap. The twin treats the topic as unknown until it is resolved.

## Role precision (Constitution VII)

Every role claim carries an ownership verb: *built · designed · architected · configured · co-authored · co-owns · sourced (a partner) · sponsored · AI system architect · led · was part of a team that.* The rulings for each system sit at the top of `01`. "We" is always expanded to who.

## Public safety

This repository is public, so the corpus is public. Three rules; the check enforces the second and third.

1. Source material not cleared for publication lives in `intake/private/` and never leaves it. Corpus files paraphrase what is cleared and hold the rest in empty facts slots.
2. No currency amounts in corpus Markdown. Award amounts are not public-safe; a number that ever becomes public-safe goes through a facts slot with an explicit attestation.
3. A local `intake/private/denylist.txt`, one phrase per line, lists what must never appear publicly; the check fails if any public corpus file contains one, without printing the phrase. It exists only on the Author's machine, so run `make corpus-check` before committing (and add it to pre-commit when Phase 0 creates the config).

Removing something from a file does not remove it from git history. If a non-public detail was ever committed, rewrite history before pushing.

## Plug-in numbers (`facts/`)

Each slot has an `id`, a `label`, a `value` (null until known), a `tag` (A or C), a `source`, `public_safe`, and a `phrasing` containing `{value}`. To fill a slot, set `value`, `tag`, `source`, and `public_safe: true` — nothing else changes. Corpus text references slots as `{{slot:<id>}}`, which renders the phrasing when filled and nothing when empty, or `{{slot:<id> | else: <text>}}`, which renders the fallback when empty. The twin never estimates an empty slot. The check fails on a value without attestation, and on a reference to a slot that doesn't exist.

## Who edits the corpus

Humans. Agents may read it and propose changes in `proposals/`; the protected-paths hook blocks direct edits, and CODEOWNERS routes corpus PRs to the Author. It is the same pattern agent-watchdog uses: learning arrives as a proposal, never as a change.

## Per-file structure

```
# <Topic>
Priority: n · Status · Last verified
## Role at a glance         — what a non-engineer can repeat; ownership verbs explicit
## Topic sections           — tagged claims; the engineer's depth
## Public artifacts         — URLs the twin may cite
## Do not claim             — inflation and privacy risks specific to this topic
## Golden Q&A               — visitor questions with the exact answer the twin should give
```

## Two audience modes

Each topic carries a non-engineer layer (role at a glance, plain answers) and an engineer layer (architecture, trade-offs). The facts are identical; the depth differs.

## Corpus → evals

Every tagged claim is a candidate golden Q&A; every "do not claim" line, across all files, is a refusal test; every `[?]` and empty slot is an "I don't know that yet" test; and every number the twin says must appear in a corpus file or a filled slot. `evals/product/` is generated from these files, so a corpus change runs the product evals.

## Phase 1 minimum — status (2026-09-27)

1. `01` author-verified — pending the Author's final read (one optional answer left in `INTAKE.md`).
2. Role at a glance for the other topics — done for `02` and `03`; Artificial Indian Games has no file yet.
3. Consolidated "do not claim" — the per-file lists; the eval generator takes their union.
4. Thirty golden Q&A — 31 as of 2026-09-27.

## Provenance rule for the Author's other chats

Content from conversations elsewhere enters only via `INTAKE.md` and `intake/`, tagged with its source. The twin never cites a chat; it cites this corpus.
