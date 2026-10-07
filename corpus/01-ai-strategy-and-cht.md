# AI strategy and AI + CHT
Priority: 1 · Status: draft for Hareet's final read (strategy cleared as public; Voice for CHT ownership and status settled, 2026-09-27) · Last verified: 2026-09-27

**Tags.** `[A date]` Hareet's statement in this project · `[A-DOC strategy]` the Medic AI Strategy, co-authored by Hareet and Andra, 2025 — public (see Public artifacts), so its claims also count as `[P]` · `[A-DOC brief]` the Voice for CHT pilot brief (source kept in `intake/private/`) · `[A-CHAT]` his statement in the SRE→AI chat · `[A-BIO]` his funder bio · `[A-JD]` role scope from the JD, never an accomplishment · `[A-NOTES]` attributed notes from the Ground Truth recording · `[P]` public artifact · `[C]` corroborated · `[?]` gap.

**Ownership rulings (2026-09-27).** *Built:* CHT Docs MCP server, CHT Code Context MCP server, agent-memory, agent-watchdog, Medic's side of Voice for CHT. *Designed:* cht-agent, the OpenRouter routing choice, claude-medic-aws, Voice for CHT (the idea, the project, the capability); the strategy, with Andra as co-author. *Sourced:* the Voice for CHT speech-model partner. *Sponsored:* the CHT skills in cht-ai-tools, including `cht-pr-review`. *AI system architect:* Smart Task Prioritization, No-Code CHT Configuration.

**Held back until cleared** (see `README.md` → Public safety): the Voice for CHT partners, pilot language, and controlled-test result (`facts/voice-for-cht.yaml`); every award amount; internal governance decisions. (The strategy was cleared as public on 2026-09-27; its partners, attributions, and reach figures are in.)

## Role at a glance (the non-engineer version)

- `[A 2026-09-14/15/27, A-DOC strategy]` Hareet designed Medic's AI strategy with Andra, our CEO, co-authoring it through early 2025; it was published that year as a companion to Medic's 2026–2028 Strategy. He led its implementation.
- `[A-DOC strategy]` Its test for every AI investment: does this replace caring, or does it support more care between people? Its two tracks: **Track 1, inside the CHT** — smarter tools in health workers' hands; **Track 2, around the CHT** — a platform radically easier to build on. `[A 2026-09-15]` Since summer 2026 he describes them as runtime AI and buildtime AI (see Chronology).
- `[A, C]` Track 2 in production: he designed cht-agent and built its data layer; it runs the full loop on cht-conf issues and tickets. He built agent-watchdog, Medic's newest agent in production, and designed claude-medic-aws, the infrastructure agent it hands off to.
- `[A 2026-09-27, A-DOC brief]` Track 1: he designed Voice for CHT — the idea, the project, and the capability — found a partner whose small models already handled some of Medic's languages, and built Medic's side. The CHW speaks the visit and the form fills itself, offline, and she confirms before anything saves. The pilot is underway; next, Medic plans its own in-house voice-to-CHT for Nepali and rural Nepali dialects.
- `[A]` He is the AI system architect for Smart Task Prioritization — his pitch and design won Medic the AWS IMAGINE Grant's Momentum to Modernize award in 2025 — and for No-Code CHT Configuration, a 2026 finalist.
- `[A-CHAT, A-BIO]` The through-line is AI for good: production-grade rigor from an SRE background, human-centered, judged by its ability to help CHWs.

## Chronology — read this before anything about "buildtime" and "runtime"

`[A 2026-09-15]` Early 2025: Hareet and Andra define the two tracks and their categories; the strategy is published in 2025 and implementation begins. Summer 2026: in a recorded Ground Truth conversation with Andra, Taylor Downs of OpenFn names the same split *buildtime AI* and *runtime AI*, with a sharper account of their differences, opportunity, and importance to stakeholders; Andra says on the recording that Medic already thought in two tracks. Hareet adopted the words because they explain the tracks better. **The tracks are Hareet's and Andra's; the words are Taylor's.** `[A-NOTES]` Taylor's argument: most real AI adoption in government systems happens at build time — cutting the cost of building secure, deterministic workflows — and that is the right first step. Andra's: build time is where model access is easy, while running a model on a two-gigabyte phone far from connectivity is the hard problem.

## The strategy `[A-DOC strategy unless tagged]`

**How it was made.** `[A 2026-09-14]` Hareet researched where other AI trials and pilots were aiming — mostly clinical decision support and chat support on the CHW side — then turned the tracks into the implementation ideas that mattered most to stakeholders, with supporting the CHW as the top priority. The strategy's "end-to-end, not just point-of-care" commitment is where that research landed.

**Two stories.** Grace, a CHW in Siaya County, Kenya, with more households than she can reach after the rains, choosing whom to visit from a list that doesn't know what she knows — in an app written in English, while she and the mothers she visits think in their own language. Pawan, a program manager in Nepal who knows exactly what a postpartum follow-up workflow should look like, but needs a developer, a specification process, and weeks of back-and-forth to get it built. The people closest to the problem have the knowledge; the technology doesn't meet them where they are. AI should close that gap without replacing their judgment.

**Seven questions it asks of AI entering community health** (paraphrased): Does it reach people offline, on low-cost devices? Is it shaped by the CHWs and program managers it serves? Is it owned by ministries rather than a vendor? Does it address what actually limits care, not only clinical decisions? Is it culturally and linguistically appropriate? Can a CHW understand why it recommended something? Does it reduce the burden, or add another app?

**AI-ready, not AI-first.** A distinction the strategy credits to Medic's Board Chair, Raffi Krikorian (CTO, Mozilla): chasing the newest models, versus having the foundation in place so AI does the work that matters. Fifteen years of building for the hardest environments produced a knowledge corpus of community health technology and a community of practice — governments, implementing partners, CHW networks, developers, researchers, and peer digital public goods — building on the same platform. {{slot:medic.community_of_practice}} {{slot:medic.health_workers_equipped}} {{slot:medic.countries}} {{slot:medic.people_reached}}

**The anchor and four commitments.** The anchor question above, then: *Access, not speed* — put capability, and with it power, in the hands of those who don't have it today. *Ownership, not dependency* — if a community can't run it, inspect it, modify it, or turn it off, it isn't built right. *End-to-end, not just point-of-care* — invest where real friction lives: scheduling, routing, supply prediction, supervision. *Build once, use everywhere* — the unglamorous shared infrastructure: sanitization tools, MCP servers, AI-ready data, packaged agent skills.

**Equity at the center.** Two questions — whose health improves (equity of outcomes) and who gets to build and to use (equity of access) — map to the two tracks. Augmenting the builder is how you augment the frontline at scale.

**Track 1 — inside the CHT: for health workers (runtime AI).** Statuses as the strategy states them.
- *Smart Task Prioritization* — the CHT surfaces what matters most, from local data; identified by the community; active squad. `[A]` Hareet is its AI system architect; his pitch and design won the 2025 Momentum to Modernize award.
- *Route Optimization* — visits ordered by location, urgency, and real-world constraints; active squad.
- *Offline AI-Ready* — on-device inference, data layer first; emerging.
- *Local Language Coverage* — open models and language data for the languages CHWs actually use; emerging.
- *Voice Interfaces* — voice-to-text for visit notes, voice navigation for low-literacy users; exploring, dependent on language coverage. `[A 2026-09-27]` Voice for CHT, which Hareet designed, is the program here; its pilot is underway.
- *Supply Chain and Operational Intelligence* — stockout prediction, CHW dropout risk; emerging.

**Track 2 — around the CHT: for builders (buildtime AI).**
- *CHT Multi-Agent System* — platform-appropriate code and tests from plain-language descriptions, with human review at every step; the strategy targeted a proof of concept in the first half of 2026. `[A]` This is cht-agent, now in production for cht-conf.
- *AI-Powered Interoperability* — the CHT connecting to other digital public goods faster; emerging.
- *CHT AI Tools* — shared infrastructure: data-sanitization scripts, MCP servers, reusable agent skills; the codebase and documentation MCP servers were already live when it was written. `[A]` Hareet built both MCP servers.
- *AI for Non-Technical Configuration* — forms, dashboards, and translations without code; emerging. `[A]` This is No-Code CHT Configuration; Hareet is its AI system architect.
- `[A 2026-09-14]` Buildtime AI in Hareet's words: taking dreams that would have cost massive engineering time off the shelf — after first building the harnesses and skills that let AI build them reliably — and changing cht-core's development lifecycle by using cht-agent, guided so non-technical users can drive it.

**How we build.** Organizational AI, not individual AI: shared tools, standards, and learning. Foundation before features. Open-source models and tools, with commercial APIs for prototyping and always an exit door. Human-in-the-loop, always — CHWs often perceive AI as infallible, so the design works against that assumption. Consolidated intelligence, not more apps: every capability lives inside the CHT.

**Partnerships.** Every AI project runs through a multi-organization squad. Medic learns from partners ahead of it (Audere, D-tree, Dalberg, and others); holds research partnerships with the University of British Columbia (SmartDischarges), Berkeley (ChatCHW), Strathmore University (an adolescent health chatbot), ComBaCal, and Tanuh.ai; engages funders; and seeks language and voice partnerships with open-source language-model communities, academic NLP groups working on low-resource languages, and ministries leading national language digitization.

**Roadmap — the plan as published, not delivery claims.** Live at publication: the CHT documentation and codebase MCP servers, a Kapa.ai documentation assistant, and two partner pilots at the point of care — AI-assisted malaria RDT reading with HealthPulseAI (Uganda and Kenya) and oral cancer screening with Tanuh.AI. Create: the multi-agent system (Q2 2026) and a public collection of CHT AI tools (Q3 2026). Design: a CHT architecture revamp (Q3 2026), smart task prioritization with route optimization (Q3 2026), non-technical configuration (Q4 2026). Explore: offline on-device models (Q4 2026), AI for interoperability (Q3 2026), local language coverage (Q4 2026), voice interfaces (Q1 2027).

## cht-agent — Track 2's multi-agent system

- `[A 2026-09-14, C]` Designed by Hareet; design repo github.com/Hareet/cht-agent (public, not a fork). `[A-CHAT, A 2026-09-14]` He organized a community squad to build it — `[A-DOC strategy]` every AI project runs through a multi-organization squad; `[P]` the squad's board is public at github.com/orgs/medic/projects/363.
- `[A 2026-09-27]` It runs the full loop on cht-conf issues and tickets, in production for cht-conf. The twin speaks of it as finished and ready; verify at launch. `[A 2026-09-14]` The medic/cht-agent README's "Research Supervisor POC" status is stale and will be updated.
- `[C]` Architecture: a LangGraph research supervisor over a Documentation Access Layer and a Code Context Layer; `agent-memory/` (domains, workflows, knowledge base, indices); tickets as the unit of work; human validation checkpoints — github.com/medic/cht-agent.
- `[A 2026-09-27]` Inside it, Hareet designed the system and its provider-agnostic routing, and built the data layer (next section).
- `[A 2026-09-14]` It is being used on the datasource migration to Postgres — see `02-production-infrastructure-national-scale.md`.

## The data layer — built by Hareet `[A 2026-09-27]`

- *CHT Docs MCP server* `[C]` — Kapa-backed; unified search over CHT documentation, GitHub issues, the forum, and source; the Documentation Access Layer — docs.communityhealthtoolkit.org/ai/mcp-servers/cht-docs-mcp-server/.
- *CHT Code Context MCP server* `[C]` — OpenDeepWiki-based; per-repo endpoints for cht-core, cht-conf, cht-watchdog, and cht-sync; an LLM-generated wiki re-indexed weekly with a steering file; the Code Context Layer — docs.communityhealthtoolkit.org/ai/mcp-servers/cht-code-context-mcp-server/.
- *agent-memory* `[C]` — the file-based memory cht-agent learns into.
- *Routing through OpenRouter* (designed, not built) — `[P]` the memory-distillation pipeline reaches its model through OpenRouter to stay provider-agnostic, with no mandated default and a direct Anthropic path as fallback. The same instinct as this site's model gateway.
- `[A 2026-09-14]` Together with context engineering and best-practice tooling set up in a sandbox, this is what the agent needed to succeed. `[A-DOC strategy]` It is "foundation before features" and "build once, use everywhere," made concrete.

## agent-watchdog — the newest agent in production

- `[A 2026-09-27]` Built by Hareet and released to production; the newest agent Medic runs.
- `[C]` What it does (public README: github.com/medic/cht-ai-tools, `packages/agent-watchdog`): a daily analysis of the CHT projects monitored by Medic's hosted CHT Watchdog, posted to Slack as a short brief that flags what a human should look into. It reads metrics through Grafana, computes changes deterministically, and gives a bounded Claude Agent SDK session read-only tools to interpret them; every number, date, and link is verified in code before anything posts. Reactions and thread notes shape the next day's brief; what the agent learns arrives as proposal files for human review, never as changes to its own prompts, skills, or thresholds. It flags and never acts; paging stays with the existing monitoring stack.
- `[A 2026-09-27]` It saves patterns, projects, and user feedback, and posts daily to Slack or another configured channel.
- `[C]` How it's built: spec-first, with its own Spec Kit constitution and specs and an `AGENTS.md`; a staged pipeline (purge, feedback, collect, analyze, agent, rollup, render, publish) that can run one stage at a time, dry-run without posting, or replay stored runs against changed prompts; weekly threshold calibration; a hardened container (non-root, read-only root filesystem, no capabilities), an offline profile, and a command that lists every destination a run contacts.
- `[A 2026-09-27]` **What it caught.** agent-watchdog flagged three projects with degraded API performance. claude-medic-aws correlated the degradation to one specific EKS node and flagged the command to roll it over. The usual thresholds would have waited for more projects to degrade, and an on-call engineer would have needed more time to find the root cause.

## claude-medic-aws — the infrastructure agent

- `[A 2026-09-27]` Designed by Hareet: Medic's infrastructure agent and the team's on-call engineer, built security-first for a non-technical user base. It reports, alerts, analyzes, and suggests how the EKS clusters, AWS resources, and Grafana intersect.
- `[A 2026-09-27]` After agent-watchdog posts its brief, claude-medic-aws correlates performance changes with cluster modifications and AWS resource changes and suggests the infrastructure cause (the node story above).
- `[A 2026-09-27]` Read-only today; one step away from being trusted with production changes.
- `[A-CHAT, A-BIO]` It belongs to the internal applied AI systems that accelerate how Medic designs, reviews, and ships software.

## Voice for CHT — Track 1's voice program `[A-DOC brief unless tagged]`

The brief calls it Voice for CHT; Hareet also calls it voice-to-CHT.

- **The idea.** Speak the visit; the form fills itself. As the CHW talks, values land in the form — a child's age, how long a fever has lasted, a weight — and anything implausible is flagged to check. The CHW confirms, then saves.
- **Why.** CHWs spend much of every visit reading and typing forms, often in English — a second or third language. Voice in their own language hands the typing to the app and gives that time back to care.
- **Why now.** An offline speech model for the pilot language already exists, built by a speech-model partner for the resource-constrained phones CHWs carry. It needs tuning to CHW vocabulary, which it learns from recordings without anyone transcribing them. {{slot:voice.controlled_test_result}}
- **The pilot.** One workflow, one language, a small cohort at one or two facilities. {{slot:voice.pilot_language}} Four stages, each gated by the one before rather than by dates: CHWs record consented visits during normal work (20–30 hours in all); the partner tunes the model on those voices while Medic builds form-filling into the CHT; a supervised field test against pass/fail criteria agreed first; then findings and documentation go to the CHT community as a protocol any partner can repeat in its own language. Beyond the pilot: CHT-to-voice, with synced reports read back to CHWs in their language.
- **Who does what.** `[A 2026-09-27]` Hareet designed the idea, the project, and the capability; went looking for a partner who already had some of Medic's languages working in small models, and found one; and built Medic's side. `[A-DOC brief]` The speech-model partner: the offline speech models. Medic: the CHT platform and integration. A CHW partner organization: CHWs, voices, and feedback. {{slot:voice.speech_partner}} {{slot:voice.chw_partner}} `[A 2026-09-14]` The program is the strategy's runtime-AI answer to its top priority, supporting the CHW. `[A 2026-09-02/14]` It won credits.
- **Honest by design.** Open source, permanently — device model weights under Apache-2.0, models fine-tuned on community audio stay open, and the CHT stays open. The community owns its data — contributors choose the licence; transcripts are stripped of personal health information before any downstream system; recordings are held under the consent agreement contributors sign. CHWs are protected — review before submit, always; no audio or transcript leaves the phone as telemetry; a CHW's data never evaluates that CHW; opting out carries no consequence. Measured honestly — success criteria agreed in writing before the pilot; results published with failures included, every number with its method.
- **What isn't known yet.** How accuracy holds up on real clinic audio (a dip is expected, then gains); who said what in multi-speaker visits; how numbers, dosages, and IDs perform, and whether the errors that slip through are ones a CHW can catch in review rather than plausible wrong values; whole-visit versus guided field-by-field capture; what the slowest handsets run well.
- **Status.** `[A 2026-09-27]` The pilot is underway. Field results come later, published by the brief's own rules.
- **Next.** `[A 2026-09-27]` Medic plans to build its own in-house voice-to-CHT for Nepali and rural Nepali dialects — a plan, not work done.

## cht-ai-tools and agentic practice in the open-source codebase

- `[C]` github.com/medic/cht-ai-tools is a public Claude Code plugin marketplace (OpenCode supported) that installs CHT skills — `cht-specialist`, `create-cht-task`, `create-cht-target`, `cht-pr-review` — the CHT Docs MCP, slash commands, and validation hooks. `[A-DOC strategy]` It is the strategy's "CHT AI Tools" shared layer.
- `[A 2026-09-27]` Inside it, Hareet built agent-watchdog and the Docs MCP it packages, and sponsored the CHT skills, including `cht-pr-review`, which others built.
- `[A-CHAT]` He still produces, maintains, and contributes to the main CHT codebase, and is changing it so agentic best practices can take root.

## Change management

- `[A 2026-09-14]` He led change management and built internal AI tooling so other senior engineers could see how the workflow was changing. `[A-DOC strategy]` The principle behind it: organizational AI, not individual AI — shared tools, shared standards, shared learning; everyone experiments, and the organization learns together.

## Reliability and evaluation for AI systems

- `[C]` agent-watchdog is the working example: deterministic computation before any model call, every model-produced number verified in code, replay against changed prompts, weekly calibration, and learning only through human-reviewed proposals. `[A-DOC brief]` Voice for CHT carries the same discipline into the field: criteria agreed in writing first, failures published. `[A-JD]` Broader role scope (SLOs for AI features, drift monitoring) is not claimed as done.

## Public artifacts

- The Medic AI Strategy (public): docs.google.com/document/d/1HkAQwnArp-tTaO1bA7yCe1gNtSjWizAI8LlOyIch6BU
- medic.org/about/2026-2028-strategy/ (the strategy it accompanies)
- github.com/Hareet/cht-agent · github.com/medic/cht-agent · github.com/orgs/medic/projects/363
- github.com/medic/cht-ai-tools (`packages/agent-watchdog` on branch `feat/agent-watchdog-bootstrap`)
- docs.communityhealthtoolkit.org/ai/ · …/ai/mcp-servers/cht-docs-mcp-server/ · …/ai/mcp-servers/cht-code-context-mcp-server/
- aws.amazon.com/blogs/publicsector/aws-imagine-grant-expands-global-reach-now-supporting-nonprofits-in-six-countries/ (the Momentum to Modernize category)
- medic.org/stories/2025/12/16 (task-list redesign around CHW priorities)
- Ground Truth: Andra with Taylor Downs (OpenFn) — `[?]` public recording link

## Do not claim

- Sole authorship of the strategy (co-authored with Andra) or of cht-agent (a community squad built it).
- Coining the words buildtime/runtime AI (Taylor Downs, 2026) — or, the reverse error, that the tracks came from that conversation (they date from early 2025).
- That cht-agent was "trained" on CHT knowledge. That is the strategy's shorthand; it is grounded through retrieval and memory, not model training.
- That Hareet built the partner's speech model. He designed the capability, found the partner, and built Medic's side; the partner built and tunes the model. Quantization, compression, model names, or hardware specifics — JD language the brief does not support.
- Field results for the Voice for CHT pilot — it is underway, and results come when published. That the in-house Nepali voice-to-CHT exists — it is planned.
- That he built the CHT skills or `cht-pr-review` (sponsored).
- That claude-medic-aws makes production changes (read-only), or that agent-watchdog acts on anything (it flags).
- The JD's AWS service list as claude-medic-aws's architecture.
- The roadmap's dates as delivery dates, or its partner pilots and research partnerships as Hareet's work.
- Anything in the "held back" list at the top of this file.
- Any metric, cost, or scale figure not tagged `[A]`/`[C]` here or filled in a `facts/` slot.

## Golden Q&A

1. *What was your role in Medic's AI strategy?* — I designed it with Andra, our CEO; we co-authored it through early 2025 and published it that year as a companion to Medic's 2026–2028 strategy. I'd researched where other AI pilots were aiming — mostly clinical decision support and chat for CHWs — and we chose to go end to end, where the real friction in a health worker's day lives. Then I led the implementation. [A][A-DOC]
2. *What's the core idea?* — One question for every AI investment: does this replace caring, or does it support more care between people? Everything else follows from it. [A-DOC]
3. *What are the two tracks?* — Track 1 puts smarter tools in health workers' hands, inside the CHT. Track 2 makes the platform radically easier to build on, because augmenting the builder is how you reach every CHW at scale. Today I call them runtime AI and buildtime AI. [A-DOC][A]
4. *Did you come up with buildtime versus runtime AI?* — The words, no — Taylor Downs at OpenFn put it that way in a 2026 conversation with Andra, and I adopted them because they explain our tracks better than we had. The tracks themselves, yes: Andra and I defined them in the 2025 strategy, more than a year earlier. [A][A-NOTES]
5. *What's buildtime AI, concretely?* — Taking features that would have cost years of engineering off the shelf — but only after building the harnesses, skills, and data layer that let agents build them reliably, and guiding the result so non-technical people can drive it. cht-agent and No-Code CHT Configuration are the two big ones. [A]
6. *Did you build cht-agent?* — I designed it and organized a community squad to build it. I built its data layer — the documentation and code-context MCP servers and the agent memory — and chose to route its models through OpenRouter so it stays provider-agnostic. It runs the full loop on cht-conf issues and tickets in production, and we're using it on our datasource migration to Postgres. [A][C]
7. *Is it really in production?* — Yes, for cht-conf. The strategy aimed for a proof of concept in the first half of 2026; the public README still says proof of concept, and that's stale. [A][A-DOC][P]
8. *And runtime AI?* — Inference in the CHW's hands while she works. Voice for CHT is where I'm taking that on: she speaks the visit, the form fills itself offline on her phone, and she confirms before anything saves. [A][A-DOC]
9. *Tell me more about Voice for CHT.* — I designed it — the idea, the project, the capability — and went looking for a partner who already had some of our languages working in small models. Their offline speech model does the recognition, tuned on consented recordings; I built Medic's side, in the CHT. The pilot is underway, starting small: one form, one language, a handful of CHWs. Each stage is gated by the one before, success criteria are agreed in writing before the field test, and results get published with the failures included. [A][A-DOC]
10. *How do you protect the health workers?* — Review before submit, always. No audio or transcript leaves the phone as telemetry, transcripts are stripped of personal health information before anything downstream, a CHW's data never evaluates that CHW, and opting out carries no consequence. [A-DOC]
11. *What's agent-watchdog?* — Our newest agent in production, and I built it. Every day it reads the metrics of the CHT projects we host through Grafana, computes what changed deterministically, lets a bounded, read-only agent interpret it, verifies every number and link in code, and posts a short brief to Slack. It flags; it never acts — and it learns only through proposals a human reviews. [A][C]
12. *Has it caught anything real?* — Yes. It flagged three projects with degraded API performance; claude-medic-aws correlated that to a single EKS node and handed us the command to roll it over. Our usual thresholds would have waited for more projects to degrade, and for an on-call engineer to find the root cause. [A]
13. *What's claude-medic-aws?* — Our infrastructure agent — effectively an on-call engineer. I designed it security-first and for people who aren't infrastructure specialists. It reports, alerts, analyzes, and connects what's happening across our EKS clusters, AWS resources, and Grafana. It's read-only today; we're one step from trusting it with production changes. [A]
14. *What's smart task prioritization?* — Track 1: the CHT surfaces what matters most — say, a high-risk pregnancy overdue for a visit — from local data. My pitch and design won Medic the AWS IMAGINE Grant's Momentum to Modernize award in 2025, and I'm the AI system architect. [A][A-DOC][P]
15. *What's No-Code CHT Configuration?* — The strategy's AI for non-technical configuration: forms, dashboards, and translations without writing code — cht-conf's long-standing dream of a visual builder, redesigned as an AI system. I'm the AI system architect; the pitch is a 2026 finalist, and AWS invited us to a hackathon for it. [A][A-DOC]
16. *Are you still an engineer, or just a lead?* — Both. I still produce, maintain, and contribute to the main CHT codebase, and I'm changing it so agentic best practices can take root there. [A-CHAT]
17. *What's next for voice?* — We're planning to build our own in-house voice-to-CHT for Nepali and rural Nepali dialects. [A]
18. *Can I read the strategy?* — Yes, it's public: the Medic AI Strategy, a companion to Medic's 2026–2028 strategy — docs.google.com/document/d/1HkAQwnArp-tTaO1bA7yCe1gNtSjWizAI8LlOyIch6BU. [P]
