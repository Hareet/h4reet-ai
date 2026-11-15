# Films

Explainer films for the resume's claims (intent 015), made with the huashu-motion skill. Each folder is one film as code (`index.html`, HTML + GSAP) with its `script.txt` (the narration), `captions.srt`, `treatment.md` (the shots and why), and `materials.md` (where every string and number on screen comes from). Nothing here is built or served by the site.

All of them share one language, the Author's choice of 2026-11-10 (`kill-switch-b2`): the resume's claims line opens each film; kinetic type cuts on the narration's words; the stack is drawn as a flat circuit with calls running along its wires; the resume's twin section closes it. Narration is a draft voice (Kokoro `af_heart`) the Author may record over. The scripts, with a source under every line, are in `SCRIPTS.md`; the build brief is `BRIEF.md`.

## The films

| Folder | Film | What it covers |
|---|---|---|
| `kill-switch-b2/` | **A $5-a-day kill switch** | The meter climbing on the breach test's $0.10 calls; the warning at $3.50; the trip at $5.00 that stops every request, local ones too; why a new day doesn't reset it and only an operator does; the breach test's 52 of 52; the walls (no inbound ports, one outbound tunnel, the gateway's one road out); the agents that built it and the gates that fence them in. |
| `cost-meter/` | **A real-time cost meter** | The room's neon sign showing what a call cost, to the millionth of a dollar, from the gateway's own reply; the four things every model call carries (provider, model, tokens, cost); local at $0 and Claude Haiku's price per million tokens; why Haiku, in the Author's words; money counted in whole micro-dollars in the gateway's own database; Langfuse running inside the stack and how it's locked down; Grafana putting spend beside latency and errors; why the meter is the control, not the cloud bill; a full 186-case evaluation run for about 21 cents. |
| `data-flows/` | **Every data flow disclosed** | The data-flow disclosure: every flow that leaves the stack, what it carries and never carries, and how to switch it off; the build refusing a service without a row; what leaves a visitor's device in a conversation and what never does; what reaches Anthropic when the paid fallback answers, in the Author's words; then what the twin says back: only from what the Author wrote, "I don't know yet" when it isn't there, and code that checks each answer before it leaves. |
| `evals/` | **Tested every time it changes** | How the twin is kept from making things up: golden and gap cases drawn from the corpus, each asked the way an engineer would and the way anyone else would (186 cases, nine topics); grading by code, never by another model; the guards in the gateway that withhold an answer or fail closed; the red team's 68 cases and 48 of 48 on every route; the honest pass rates; misses that became fixes; readiness locked to a hash. A fifth claim the resume may add. |
| `local-first/` | **Local models first** | The whole production stack on one laptop with one command; its fifteen containers; llama.cpp running Qwen3 on the laptop's GPU; every question trying the local model first, at $0, with nothing leaving the machine; the capped paid fallback, and the EC2 server where the Anthropic API answers first; production, not a demo; the offline-first discipline of the Author's work at Medic (Voice for CHT, offline on a 4 GB phone); and denverlocal.ai, private AI for small Denver teams with sensitive files kept on hardware they own. |

Comparisons kept for the record (not for the resume): `kill-switch/` (direction C, the stack in section, in depth), `kill-switch-b/` (direction B, kinetic type and hard cuts), `kill-switch-mix/` (C's world with a front-facing camera; the Author found it didn't fit).


## Rendering

The Author renders in the Author's own terminal, from a film's folder (Chrome can't start inside the agents' sandbox):

```
OM=~/.npm/_npx/44b1559a42bed6a3/node_modules/huashu-motion/cli/om.js
node $OM sound films/<name>      # after a new voice take, or a film's first render
node $OM render films/<name>
```

Run it from the repository's root with that absolute path (huashu-motion 0.4.0, as installed on the Author's machine), never `npx huashu-motion` from inside a film's folder: `npx` would prefer a `node_modules/.bin` the repository ignores and an agent could write.

Renders land in each film's `out/` (git-ignored). Before the resume links to a film, its hosting needs a decision: from hareet.ai's own origin (no new data flow) or a third-party player (a new row in `docs/data-flow-disclosure.md` first).
