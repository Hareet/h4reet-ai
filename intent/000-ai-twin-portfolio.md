# Intent: an interactive AI twin as my resume, built in public
Author: the Author (product owner and engineer). Status: draft — answers of 2026-09-07 incorporated; Author does a final read, then sets `accepted`. Created: 2026-09-05.

## Problem
A resume and a list of projects cannot show how I think: production-first about systems that have to run at national scale, and founder-first about defining a market and building everything it needs. Hiring managers and engineering leads at AI-forward companies see claims about "production-grade AI" from everyone. Nothing I have today lets them experience the work, or watch how I build, before deciding whether to talk to me.

## Proposed outcome
A visitor lands on h4reet.ai and meets an animated AI twin of me — disclosed as AI, speaking in my cloned voice (my choice, and a disclosure item) — that they can talk to by text or voice about my real work. The visitor picks one of four pre-generated avatars and joins my twin in a shared 3D room whose art direction is inspired by GTA V: stylized illustrative realism, saturated light, cinematic framing. Inspired-by only — no Rockstar assets, logos, typefaces, or character likenesses; everything is original.

Early on, the twin asks whether the visitor wants the engineer's version or the non-engineer's version, and both are ready. Non-engineers get a digestible summary with imagery and dashboards. Engineers get the technical analysis: how cost alerting is set up, how the AI evaluations work, how the harness tooling was built, how the development environment is secured and sandboxed, and why. Both paths steer toward the same conclusion — senior-level judgment in designing technical systems and products.

The work is told accurately. At Medic I was part of a human-centered software team building CHT for community health workers; Kenya's Ministry of Health designed the workflows they cared about. My role in eCHIS-KE was the production side of a national deployment: organizing all the stakeholders around infrastructure, accurately measuring the cost of running systems at the scale they were expected to reach, procuring hardware, localizing a DevOps team, migrating data centers, and moving CHT forward — alongside designing, writing, and implementing Medic's AI strategy in 2025 (the multi-agent work, voice-to-CHT, no-code CHT configuration, claude-medic-aws). A "job and role / task corpus" I will provide later is the twin's only source for this; it says so when it does not know.

Artificial Indian Games is the founder story: a "coming soon" page for rickshaw-walla covering the market thesis, the design, the agentic software philosophy, and the asset pipeline — evidence that I can define a market and build, in a startup world, with technical foresight.

The way the site is built is as much the point as the site. The repo, the intents, the specs, the eval history, and the live dashboards are public and readable as a best-practices example of September 2026 AI-native development.

Success: interviews with the right kinds of companies, then offers. Interest in the studio is welcome but secondary.

## Affected users and systems
Visitors (hiring managers, engineering leads, curious engineers); me, as operator; the agents that build most of the code; GitHub CI; one AWS account; my RTX 5090 machine as a production tier; the job/role/task corpus; public dashboards.

## Constraints
- $5/day and $20/month cloud ceiling. Local models on my own hardware are how the cloud bill stays near zero, and that is part of the story, not a workaround.
- No visitor biometrics. Pre-generated avatars only.
- The twin is always disclosed as AI, speaks only from the corpus, refuses bad-faith requests, and never inflates my role. Guardrails and evals are public.
- Everything containerized; the entire production stack runs on my local machine calling local models. First phase is the compose stack; Terraform in AWS elevates it afterward.
- Public from the first commit. The process is part of the product.
- The offline-first, human-centered ethos from CHT work carries into the design and is explained on the site.

## Expected cost impact
Cloud: near-zero idle (static site, edge, thin relay, alerting), Bedrock only as capped fallback. Dev-time model spend: Claude Code and agent evals, tracked separately.

## Data-flow impact
Visitor text and audio leave the browser only when the twin's brain or speech cannot run in the browser; each such flow is disclosed on the site with its reason. The engineer/non-engineer choice is a session preference, not stored. Nothing is retained beyond the session without explicit consent.

## Decisions since 2026-09-07
- Avatars: placeholders for now — a generic woman, a generic man, a generic dinosaur, a generic dog — to be replaced with final characters later.
- Audience mode: the twin asks by voice early in the conversation; a visible toggle then appears and persists, so the choice is reversible without asking again.
- Corpus priority: AI strategy and AI + CHT first; then production-grade SRE work at national scale; then teams, localization, and new systems; then grants and credits; then the studio. See `corpus/README.md` for the claims policy and the proposed Phase 1 minimum.

## Open questions
- How does the GTA V-inspired direction translate to the four placeholder avatars and the room without borrowing anything from the source?
- Phase 1 minimum corpus: confirm the proposal in `corpus/README.md`, and complete `corpus/INTAKE.md`.
