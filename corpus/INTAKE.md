# Corpus intake

Two things feed the corpus: the export of the earlier conversation "Transitioning SRE role to applied AI engineering" (and its artifacts), and answers to the gaps below that no conversation is likely to contain. Everything arriving here is tagged `[A <date>]` when it enters a corpus file; the twin cites the corpus, never a chat.

## Part 1 — Export prompt (paste into the original chat, then upload the result here)

```
I'm building a corpus that an AI twin of me will use as its only source of truth about my work. Produce a structured export of this conversation and every artifact or file you created in it, as one Markdown document, following these rules exactly:

1. Facts only, no narrative. One claim per bullet. For each claim, name my ownership mode from this list: led / designed / built / co-built with <who> / was part of a team that / supported. Expand every "we" into who.
2. Tag each bullet [A] if it came from something I said, [P] if it came from a public artifact (include the URL), [C] if both.
3. Organize under these headings, in this order: AI strategy (categories, how it was meant to be implemented into existing CHT systems) · cht-agent hierarchical multi-agent system (design, the community squad, what shipped, what stayed POC) · Data annotation and organization (CHT Docs MCP, code-context wiki indexing, agent memory, context engineering, sandboxed tooling) · voice-to-CHT pilot (what it did, hardware, models, offline design, credits won) · Change management and internal AI tooling · claude-medic-aws · no-code CHT configuration · eCHIS-KE production work · Team localization · Grants and credits · Anything else.
4. Under each heading add: "Numbers I stated" (dates, counts, costs, durations — only ones I actually gave), "Artifacts" (each file or document created in this chat: filename, one-line purpose, and its full content in a fenced block or, if longer than two pages, a faithful summary plus its key sections verbatim), and "Do not claim" (anything I said I did not own or that was owned by the MoH, Medic leadership, or the community).
5. End with "Open questions" — anything a hiring manager would ask that this conversation does not answer.
6. Do not embellish, infer seniority, or add adjectives. If unsure whether I said something, put it under Open questions.
```

Save the output as `corpus/intake/sre-to-applied-ai-export.md` and upload any artifact files alongside it under `corpus/intake/artifacts/`.

## Part 2 — What's left (2026-09-27, second pass)

Resolved: Voice for CHT ownership (you designed the idea, the project, and the capability, found the partner, and built Medic's side), the pilot underway, and the in-house Nepali plan; the strategy cleared as public, so its partners, attributions, and reach figures are in; national deployments generalized to `facts/national-projects.yaml`, with Uganda, Mali, and Zanzibar. Resolved 2026-10-07: the Ground Truth recording is not public, so the corpus uses the notes without a link; the title Applied AI Engineering Lead is confirmed.

### The one open item that still holds content back
- May the twin name the Voice for CHT partners and the pilot language, and quote the controlled-test result? If yes, fill `facts/voice-for-cht.yaml`.

### Whenever you're ready
- Fill `facts/national-projects.yaml`: Kenya's numbers, and one line each — what you did, and when — for Uganda, Mali, and Zanzibar.
- ~~Create `intake/private/denylist.txt`~~ Created 2026-10-07, local only. Fill in the private values in your own editor, and keep a copy outside the repository.
- Voice for CHT credits and any Anthropic credits: program and year.
- The 2026 finalist program's name, if you want it named.
- Which stages "the full loop" covers for cht-agent (for engineer mode).
- Is the PowerSync-to-Postgres work part of the strategy's CHT architecture revamp?
- A public-safe example of the change-management work: a talk, a workshop, adoption of cht-ai-tools.
- A public reference for the Mali deployment, if one exists.
- Artificial Indian Games (no topic file yet): status; rickshaw-walla in two sentences; which cultures and stories it centers.
- ~~Surname, or confirm the twin never gives one.~~ Resolved 2026-10-07: the twin never gives or confirms it in conversation; it may appear in git history and on GitHub.

### For the Phase 1 spec, not the corpus
- The twin's grammatical person: golden answers use first person when a visitor addresses the twin ("I designed…") and third person when they ask about Hareet. Choose one rule in the persona spec — first person with persistent disclosure, or third person throughout — because it shapes how Principle VIII's disclosure works.
- Surname guardrail (2026-10-07): the twin never gives or confirms Hareet's surname, although git history and GitHub show it. The denylist keeps it out of the corpus; the Phase 1 red-team suite needs a case that tries to extract or confirm it.
