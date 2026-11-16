# Proposal: your words in `08-hareet-ai.md`'s Golden Q&A 15, the agents' share (spec 007 FR-014)

Proposed by: the night shift's implementer, prop-q15-029 (Claude Opus 5.5) · Date: 2026-11-16 · Branch: `night/prop-q15-029/prop-q15-029` · From: `specs/029-room-polish/probe-guard.md` §3 (a) (probe-guard2-029, `180e8758`)
Status: a proposal and a patch for your hand. Neither this file nor the patch changes anything in `corpus/` by itself. Your question: Q30 on the decision page (`docs/night-shift/2026-11-16.md` on `night/supervisor/2026-11-16`), recommended yes.

## Why

Golden Q&A 15 came from spec 022's proposal (`film-scripts-2026-11-14.md`), applied in your corpus commit `f411d8e1` ("022"). Its second sentence says who writes the code and who merges in a `[P]` clause, without your recorded words. Guard G8 (`agents_share`) replaces any answer that speaks about the agents' share without the span "AI agents in named roles do most of the typing, and only I merge" (`apps/web/build/twin-pack.ts:78`) with your Golden Q&A 4, as spec 007's FR-014 (`specs/007-twin-conversation/spec.md:199`) requires: "the agents' share and the privacy promise SHALL carry a verbatim span of the corpus line each rests on". So the twin can never give q15 as written, and five tests in `services/gateway` fail at `f411d8e1` (they pass at its parent `e904389a`): FR-049 and SC-002 hold every Golden answer to the guards. `corpus/README.md:31` says of the tag: "`[P]` Public artifact, with URL. Enough for facts about systems and organizations; never enough on its own for a claim about the Author's role." "Only a person merges" is a claim about your role.

Fixing it in the guard or the tests isn't right (`probe-guard.md` §3 (b) and (c)): loosening G8 lets a reworded agents' share through, which is what D41 (`specs/007-twin-conversation/plan.md:510`) was written against, and excepting q15 leaves a Golden answer the twin can't give.

## Your words, quoted

`corpus/08-hareet-ai.md:9` at `f411d8e1`, word for word:

```text
- `[A 2026-10-29]` In his words: "An AI twin of me, built in the open: local models first, a capped cloud fallback, a real-time cost meter, and a {{slot:site.kill_switch_daily}}-a-day kill switch. AI agents in named roles do most of the typing, and only I merge."
```

`corpus/08-hareet-ai.md:129` at `f411d8e1`, your Golden Q&A 4, word for word:

```text
4. *Who writes the code?* — AI agents in named roles do most of the typing, and only I merge. [A]
```

The proposed line carries the sentence "AI agents in named roles do most of the typing, and only I merge." as both lines have it, unchanged.

## The line

`corpus/08-hareet-ai.md:140` at `f411d8e1`, as it stands:

```text
15. *How is a change made?* — It starts as an intent, then a spec, a plan, and tasks, checked against each other before any code exists. An implementer agent writes it with tests, a reviewer agent that didn't write it checks it, a clean-room gate runs every check, and only a person merges. [P]
```

Proposed (`probe-guard.md` §3 (a), exactly):

```text
15. *How is a change made?* — It starts as an intent, then a spec, a plan, and tasks, checked against each other before any code exists. An implementer agent writes it with tests, a reviewer agent that didn't write it checks it, and a clean-room gate runs every check. AI agents in named roles do most of the typing, and only I merge. [P][A]
```

What changes: ", a clean-room gate runs every check, and only a person merges. [P]" becomes ", and a clean-room gate runs every check. AI agents in named roles do most of the typing, and only I merge. [P][A]". The first sentence and the three roles stay as 022 has them. The tag adds `[A]` for your sentence, as Q&A 6's `[?][A]` marks its two kinds. Nothing else in `08` changes. Q&A 4 stays G8's fixed line: `twin-pack.ts` picks the shortest Golden answer that holds the span.

After the edit, `npm run twin:pack -w apps/web` regenerates `config/twin/corpus.json`, `docs/corpus-size.json`, and the two cases `evals/product/cases/twin-08-hareet-ai-q15-engineer.yaml` and `-non-engineer.yaml`. The patch carries all five files (`docs/merge-requests/human-patches/029-q15.md`).

## The other wording

`probe-guard.md` §3 (a) names one alternative, in its words: "If you'd rather keep the sentence about the person who merges as it is, another wording also carries the span: keep "and only a person merges." and add your Q&A 4 sentence after it. That says the merge twice." Built that way, the line would read (this rendering is mine, from that description, with the same tags; it isn't in the patch):

```text
15. *How is a change made?* — It starts as an intent, then a spec, a plan, and tasks, checked against each other before any code exists. An implementer agent writes it with tests, a reviewer agent that didn't write it checks it, a clean-room gate runs every check, and only a person merges. AI agents in named roles do most of the typing, and only I merge. [P][A]
```

It passes G8 too, since the whole answer then holds the span, but the `[P]` claim about your role stays in it beside your words. The recommended line drops it.

## What it does not cover

The five `[P]` section lines 022 added to `08` that pair an agent word with "write" or "merge" without your span (`:27`, `:91`, `:92`, `:96`, `:97`; `probe-guard.md` §2.4) are the page's Q31, and stay a backlog item: no test reads them, and free talk, the only path that reads them, is `ready: false` (`config/twin-readiness.yaml:51`). Q31's recommended answer is a proposal for the 022 follow-up before free talk's `ready: true`. This proposal changes q15 only.

It doesn't re-mark any topic in `config/twin-readiness.yaml` (Q17): only your hand does that.

## What it does to the readiness hashes

None of the three ready topics' hashes moves. `08` is in no topic (`docs/corpus-size.json` gives it `"in_topics": []`), and the line is a Golden answer, not a "Do not claim" line, so it isn't in the rules every topic's hash covers. Measured on the patched export against `f411d8e1`'s `config/twin/corpus.json`, the topic hashes are identical: hobbies-and-travel `d574f1fa248e8f1814687338cf9c7d1008e1441a343ab29290ef5dd57b350507`, mission `c028c92d9303beebeae8b32bdd8213dd112a057ea238886638ae39cc22a568ad`, work-projects `6fdd269b9dd0b207511fa36113f95c596d3de86c659ce71bbaf0abbb8395aadc`. The patch doesn't touch `config/twin/prompt.md` or `config/twin/lines.yaml`, so `prompt_sha256` doesn't move either. Only the whole pack's hash changes, `c18b20c6dcd28ac786547fa1aad047ff58fc49a79f0045d4aa448fbe6af18c91` to `dd8872be9890f423c0deaa2dad1c3a9cd33febfdd759c1f0e2bcfc9b42e87b2a`, and that is free talk's (`free_talk: { ready: false }`). So Q17's re-marking doesn't have to wait for this patch. The order is in `docs/merge-requests/human-patches/029-q15.md`.

## The patch

`docs/merge-requests/2026-11-16-q15-agents-share.patch`, built from plain copies of `f411d8e1` and checked there; how, and its IDs, in `docs/merge-requests/human-patches/029-q15.md`.
