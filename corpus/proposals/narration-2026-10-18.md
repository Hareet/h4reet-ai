# Proposal: the narration's first drafts (spec 002, T054)

Proposed by: Claude Code (Opus 5.5), an implementer subagent · Date: 2026-10-18 · Branch: `feat/002-us3-narration`
Status: drafts for the Author. Nothing in `corpus/` changes.

## What this is

The first drafts of the room's narration: one script for each of the resume's fifteen items on each path, thirty files in `apps/web/content/narration/<item-id>.<path>.md` (contracts/narration.md §1). They aren't corpus changes: a script is a rendering of the corpus, like the resume, and every sentence in it rests on a corpus sentence it cites. The build checks each script against the corpus (N1 to N4, contracts/narration.md §2), with the resume's own citation check (C1 to C8, the item's ownership verb setting the bar for the citations) and its forbidden list (C9), and writes one eval case per script in `evals/narration/cases/` (N5), which `make evals` runs on the fake adapter.

The scripts stay drafts until you approve them. Until then, a build without drafts publishes none of their words, and dev's drafts build shows each under a "Draft" label. A script also needs its item published: while the resume itself is a draft, a build without drafts shows no narration at all.

## What you do

1. Read the scripts below: each script's words, then the corpus words each citation quotes, with the tag that opens the quote's span. The words are an agent's wording, for you to keep or rewrite in the script's file; the quotes are the corpus's own.
2. Rewrite any script as you like. `npm run content:check -w apps/web` tells you if a citation no longer holds, and `npm run content:lock -w apps/web` rewrites the eval cases after a change (make test fails until it has).
3. When you're satisfied with a script, in your terminal: `sha256sum apps/web/content/narration/<item-id>.<path>.md`, then an entry in `assets/policy/content-approvals.json` (`kind: narration`), committed on `main` (contracts/resume-source.md §5). Any later edit to the file makes it a draft again.
4. Run `make corpus-check`, which applies your private denylist to this proposal, whose text repeats every script's words.

## How the drafts read

These are readings for you to decide on; none of them is a corpus change this proposal makes.

- **The voice.** The twin narrates in its own voice about you in the third person ("Hareet designed...", "He localized..."), as data-model.md §3 asks. Andra is "Andra, our CEO", the corpus's naming convention, as the resume writes it.
- **The two depths.** The non-engineer script stays at the "Role at a glance" depth; the engineer script goes into the topic sections.
- **Your acts, in the cited sentences' own grammar** (the review of 2026-10-18). A script says an ownership verb where a cited sentence says it as your act ("designed cht-agent", "built agent-watchdog", "sponsored the CHT skills, including cht-pr-review, which others built", "AI system architect", with "his pitch and design" kept a noun phrase). A passive stays passive: "agent-watchdog was built by Hareet and released to production" says who built it, not who released it. Your words are quoted whole: "Buildtime AI in Hareet's words: ..." is the corpus's sentence, start to end. The check now holds these rules (C8's act verbs and `passive made active`).
- **No ruling annotation read out.** `Ownership: *led*`, `Ownership: *built*`, and `Ownership: *architected*` rule which verb to use; they aren't sentences, and a script neither cites nor says them. For Kenya that leaves "localized", the sentence's own verb: no sentence in the corpus says "led" of that work, so the scripts don't, while the resume's item, "Led the localization...", rests on the ruling. If you want the narration to say "led", a sentence in `02` that says it would let it.
- **claude-medic-aws** is "designed ... security-first for a non-technical user base", as the resume words it. The corpus's "built security-first" isn't said with you as its subject, since its ruling for you is designed.
- **The other national deployments** say exactly what `02` tells the twin to say, "involved ... to a lesser extent than in Kenya's", with the slots and nothing beside them; Zanzibar's app, public context, is left out so it can't read as a part.
- **No numbers.** The check admits a digit only through a filled slot, and these drafts also leave out the counts the corpus spells in words: agent-watchdog "flagged projects with degraded API performance" (the corpus says three), and claude-medic-aws traced it to "a specific EKS node" (one). The years, CHT's version number, and the strategy's "Track 1" and "Track 2" are left out for the same reason; "two tracks" stays, as in the resume.
- **Thin engineer scripts.** Smart Task Prioritization, No-Code CHT Configuration, CHT's Docker architecture, the benchmarking, Kenya, and the other deployments have little more on the engineer path than on the other. Their depth in the corpus sits under headings that carry the tag, not on each bullet: the strategy's tracks and categories (`01`, "The strategy"), the Voice for CHT pilot's design (`01`, "Voice for CHT"), and the PowerSync-to-Postgres backend (`02`, "Designing new systems"). The check reads a tag only on the line it covers, as the resume's proposal explains, so a tag on each bullet line would let these scripts go deeper.
- **"Before Kenya's national-scale deployment"** in `cht-docker-architecture.engineer.md` reads `02`'s "Before that deployment", which follows the Kenya sentence.
- **In the room,** each visitor reads the scripts for the path they chose, under a line saying the AI twin narrates them. The engineer scripts can also be read here and in their eval cases.

## The scripts

The verb in parentheses is the item's ownership verb. It sets the bar for its scripts' citations (C4), and a script says it where a cited sentence says it as your act (C8).

### AI strategy

#### ai-strategy (designed)

**Non-engineer** (`ai-strategy.non-engineer.md`):

> Hareet designed Medic's AI strategy with Andra, our CEO, around two tracks: AI inside the CHT for health workers, and AI around the CHT for the people who build on it. He led its implementation. Its test for every AI investment: does this replace caring, or does it support more care between people?

- `00-profile.md`, `[A, A-DOC strategy]`: "He designed Medic's AI strategy with Andra, our CEO"
- `00-profile.md`, `[A, A-DOC strategy]`: "around two tracks: AI inside the CHT for health workers, and AI around the CHT for the people who build on it"
- `00-profile.md`, `[A, A-DOC strategy]`: "He led its implementation"
- `01-ai-strategy-and-cht.md`, `[A-DOC strategy]`: "Its test for every AI investment: does this replace caring, or does it support more care between people?"

**Engineer** (`ai-strategy.engineer.md`):

> Hareet designed Medic's AI strategy with Andra, our CEO, and led its implementation. He researched where other AI trials and pilots were aiming, mostly clinical decision support and chat support on the CHW side, then turned the tracks into the implementation ideas that mattered most to stakeholders, with supporting the CHW as the top priority. One track puts smarter tools in health workers' hands, inside the CHT; the other makes a platform radically easier to build on, around it. He calls the tracks runtime AI and buildtime AI, words he credits to Taylor Downs of OpenFn. The tracks are Hareet's and Andra's; the words are Taylor's.

- `00-profile.md`, `[A, A-DOC strategy]`: "He designed Medic's AI strategy with Andra, our CEO"
- `00-profile.md`, `[A, A-DOC strategy]`: "He led its implementation"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-14]`: "Hareet researched where other AI trials and pilots were aiming — mostly clinical decision support and chat support on the CHW side — then turned the tracks into the implementation ideas that mattered most to stakeholders, with supporting the CHW as the top priority"
- `01-ai-strategy-and-cht.md`, `[A-DOC strategy]`: "smarter tools in health workers' hands"
- `01-ai-strategy-and-cht.md`, `[A-DOC strategy]`: "a platform radically easier to build on"
- `00-profile.md`, `[A 2026-09-15]`: "he calls the tracks runtime AI and buildtime AI, words he credits to Taylor Downs of OpenFn"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-15]`: "The tracks are Hareet's and Andra's; the words are Taylor's"

### AI systems

#### cht-agent (designed)

**Non-engineer** (`cht-agent.non-engineer.md`):

> Hareet designed cht-agent and built its data layer; it runs the full loop on cht-conf issues and tickets in production. He organized a community squad to build it, and it works with human validation checkpoints.

- `00-profile.md`, `[A, C]`: "He designed cht-agent and built its data layer; it runs the full loop on cht-conf issues and tickets in production"
- `01-ai-strategy-and-cht.md`, `[A-CHAT, A 2026-09-14]`: "He organized a community squad to build it"
- `01-ai-strategy-and-cht.md`, `[C]`: "tickets as the unit of work; human validation checkpoints"

**Engineer** (`cht-agent.engineer.md`):

> Hareet designed cht-agent and organized a community squad to build it. Inside it, he designed the system and its provider-agnostic routing, and built the data layer. Its architecture is a LangGraph research supervisor over a Documentation Access Layer and a Code Context Layer, with agent-memory, tickets as the unit of work, and human validation checkpoints. It runs the full loop on cht-conf issues and tickets, in production for cht-conf, and it is being used on the datasource migration to Postgres.

- `00-profile.md`, `[A, C]`: "He designed cht-agent and built its data layer"
- `01-ai-strategy-and-cht.md`, `[A-CHAT, A 2026-09-14]`: "He organized a community squad to build it"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-27]`: "Inside it, Hareet designed the system and its provider-agnostic routing, and built the data layer"
- `01-ai-strategy-and-cht.md`, `[C]`: "a LangGraph research supervisor over a Documentation Access Layer and a Code Context Layer; `agent-memory/` (domains, workflows, knowledge base, indices); tickets as the unit of work; human validation checkpoints"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-27]`: "It runs the full loop on cht-conf issues and tickets, in production for cht-conf"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-14]`: "It is being used on the datasource migration to Postgres"

#### cht-agent-data-layer (built)

**Non-engineer** (`cht-agent-data-layer.non-engineer.md`):

> Inside cht-agent, Hareet designed the system and built the data layer: both MCP servers, and agent-memory, the file-based memory cht-agent learns into. Together with context engineering and best-practice tooling set up in a sandbox, this is what the agent needed to succeed.

- `01-ai-strategy-and-cht.md`, `[A 2026-09-27]`: "Inside it, Hareet designed the system and its provider-agnostic routing, and built the data layer"
- `01-ai-strategy-and-cht.md`, `[A]`: "Hareet built both MCP servers"
- `01-ai-strategy-and-cht.md`, `[C]`: "the file-based memory cht-agent learns into"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-14]`: "Together with context engineering and best-practice tooling set up in a sandbox, this is what the agent needed to succeed"

**Engineer** (`cht-agent-data-layer.engineer.md`):

> Inside cht-agent, Hareet designed the system and built the data layer. He built both MCP servers. The documentation server is Kapa-backed: unified search over CHT documentation, GitHub issues, the forum, and source, as the Documentation Access Layer. The code-context server is OpenDeepWiki-based, with per-repo endpoints for cht-core, cht-conf, cht-watchdog, and cht-sync, and an LLM-generated wiki re-indexed weekly with a steering file, as the Code Context Layer. The data layer also holds agent-memory, the file-based memory cht-agent learns into. Together with context engineering and best-practice tooling set up in a sandbox, this is what the agent needed to succeed.

- `01-ai-strategy-and-cht.md`, `[A 2026-09-27]`: "Inside it, Hareet designed the system and its provider-agnostic routing, and built the data layer"
- `01-ai-strategy-and-cht.md`, `[A]`: "Hareet built both MCP servers"
- `01-ai-strategy-and-cht.md`, `[C]`: "Kapa-backed; unified search over CHT documentation, GitHub issues, the forum, and source; the Documentation Access Layer"
- `01-ai-strategy-and-cht.md`, `[C]`: "OpenDeepWiki-based; per-repo endpoints for cht-core, cht-conf, cht-watchdog, and cht-sync; an LLM-generated wiki re-indexed weekly with a steering file; the Code Context Layer"
- `01-ai-strategy-and-cht.md`, `[C]`: "the file-based memory cht-agent learns into"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-14]`: "Together with context engineering and best-practice tooling set up in a sandbox, this is what the agent needed to succeed"

#### agent-watchdog (built)

**Non-engineer** (`agent-watchdog.non-engineer.md`):

> Hareet built agent-watchdog, Medic's newest agent in production. It makes a daily analysis of the CHT projects monitored by Medic's hosted CHT Watchdog, posted to Slack as a short brief that flags what a human should look into. It flags and never acts. It has caught something real: it flagged projects with degraded API performance, and claude-medic-aws correlated the degradation to a specific EKS node. The usual thresholds would have waited for more projects to degrade.

- `00-profile.md`, `[A, C]`: "He built agent-watchdog, Medic's newest agent in production"
- `01-ai-strategy-and-cht.md`, `[C]`: "a daily analysis of the CHT projects monitored by Medic's hosted CHT Watchdog, posted to Slack as a short brief that flags what a human should look into"
- `01-ai-strategy-and-cht.md`, `[C]`: "It flags and never acts"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-27]`: "agent-watchdog flagged three projects with degraded API performance"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-27]`: "claude-medic-aws correlated the degradation to one specific EKS node"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-27]`: "The usual thresholds would have waited for more projects to degrade"

**Engineer** (`agent-watchdog.engineer.md`):

> agent-watchdog was built by Hareet and released to production; it is the newest agent Medic runs. It makes a daily analysis of the CHT projects Medic's hosted CHT Watchdog monitors: it reads metrics through Grafana, computes changes deterministically, and gives a bounded Claude Agent SDK session read-only tools to interpret them; every number, date, and link is verified in code before anything posts. What the agent learns arrives as proposal files for human review, never as changes to its own prompts, skills, or thresholds. It flags and never acts. It is built spec-first, as a staged pipeline that can dry-run without posting or replay stored runs against changed prompts, in a hardened container.

- `01-ai-strategy-and-cht.md`, `[A 2026-09-27]`: "Built by Hareet and released to production; the newest agent Medic runs"
- `01-ai-strategy-and-cht.md`, `[C]`: "a daily analysis of the CHT projects"
- `01-ai-strategy-and-cht.md`, `[C]`: "It reads metrics through Grafana, computes changes deterministically, and gives a bounded Claude Agent SDK session read-only tools to interpret them; every number, date, and link is verified in code before anything posts"
- `01-ai-strategy-and-cht.md`, `[C]`: "what the agent learns arrives as proposal files for human review, never as changes to its own prompts, skills, or thresholds"
- `01-ai-strategy-and-cht.md`, `[C]`: "It flags and never acts"
- `01-ai-strategy-and-cht.md`, `[C]`: "How it's built: spec-first"
- `01-ai-strategy-and-cht.md`, `[C]`: "dry-run without posting, or replay stored runs against changed prompts"
- `01-ai-strategy-and-cht.md`, `[C]`: "a hardened container (non-root, read-only root filesystem, no capabilities)"

#### claude-medic-aws (designed)

**Non-engineer** (`claude-medic-aws.non-engineer.md`):

> Hareet designed claude-medic-aws, Medic's infrastructure agent and the team's on-call engineer, security-first for a non-technical user base. It reports, alerts, analyzes, and suggests how the EKS clusters, AWS resources, and Grafana intersect. It is read-only today; one step away from being trusted with production changes.

- `00-profile.md`, `[A, C]`: "and designed claude-medic-aws, the infrastructure agent"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-27]`: "Designed by Hareet: Medic's infrastructure agent and the team's on-call engineer, built security-first for a non-technical user base"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-27]`: "It reports, alerts, analyzes, and suggests how the EKS clusters, AWS resources, and Grafana intersect"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-27]`: "Read-only today; one step away from being trusted with production changes"

**Engineer** (`claude-medic-aws.engineer.md`):

> Hareet designed claude-medic-aws, Medic's infrastructure agent and the team's on-call engineer, security-first for a non-technical user base. It reports, alerts, analyzes, and suggests how the EKS clusters, AWS resources, and Grafana intersect. After agent-watchdog posts its brief, claude-medic-aws correlates performance changes with cluster modifications and AWS resource changes and suggests the infrastructure cause. When agent-watchdog flagged projects with degraded API performance, claude-medic-aws correlated the degradation to a specific EKS node and flagged the command to roll it over. It is read-only today; one step away from being trusted with production changes.

- `00-profile.md`, `[A, C]`: "and designed claude-medic-aws, the infrastructure agent"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-27]`: "Designed by Hareet: Medic's infrastructure agent and the team's on-call engineer, built security-first for a non-technical user base"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-27]`: "It reports, alerts, analyzes, and suggests how the EKS clusters, AWS resources, and Grafana intersect"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-27]`: "After agent-watchdog posts its brief, claude-medic-aws correlates performance changes with cluster modifications and AWS resource changes and suggests the infrastructure cause"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-27]`: "agent-watchdog flagged three projects with degraded API performance"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-27]`: "claude-medic-aws correlated the degradation to one specific EKS node and flagged the command to roll it over"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-27]`: "Read-only today; one step away from being trusted with production changes"

#### voice-for-cht (designed)

**Non-engineer** (`voice-for-cht.non-engineer.md`):

> Hareet designed Voice for CHT: the idea, the project, and the capability. The CHW speaks the visit and the form fills itself, offline, and she confirms before anything saves. He found a partner whose small models already handled some of Medic's languages, and built Medic's side. The pilot is underway.

- `00-profile.md`, `[A, C]`: "He designed Voice for CHT — the idea, the project, and the capability"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-27, A-DOC brief]`: "The CHW speaks the visit and the form fills itself, offline, and she confirms before anything saves"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-27, A-DOC brief]`: "found a partner whose small models already handled some of Medic's languages, and built Medic's side"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-27, A-DOC brief]`: "The pilot is underway"

**Engineer** (`voice-for-cht.engineer.md`):

> Hareet designed Voice for CHT, the idea, the project, and the capability, as the strategy's runtime-AI answer to its top priority, supporting the CHW. The CHW speaks the visit and the form fills itself, offline, and she confirms before anything saves. He went looking for a partner who already had some of Medic's languages working in small models, found one, and built Medic's side. The roles: the speech-model partner, the offline speech models; Medic, the CHT platform and integration; a CHW partner organization, CHWs, voices, and feedback. The pilot is underway, and field results come later, published by the brief's own rules. Next, Medic plans to build its own in-house voice-to-CHT for Nepali and rural Nepali dialects: a plan, not work done.

- `01-ai-strategy-and-cht.md`, `[A 2026-09-27]`: "Hareet designed the idea, the project, and the capability"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-14]`: "The program is the strategy's runtime-AI answer to its top priority, supporting the CHW"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-27, A-DOC brief]`: "The CHW speaks the visit and the form fills itself, offline, and she confirms before anything saves"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-27]`: "went looking for a partner who already had some of Medic's languages working in small models, and found one; and built Medic's side"
- `01-ai-strategy-and-cht.md`, `[A-DOC brief]`: "The speech-model partner: the offline speech models"
- `01-ai-strategy-and-cht.md`, `[A-DOC brief]`: "Medic: the CHT platform and integration"
- `01-ai-strategy-and-cht.md`, `[A-DOC brief]`: "A CHW partner organization: CHWs, voices, and feedback"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-27]`: "Field results come later, published by the brief's own rules"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-27]`: "Medic plans to build its own in-house voice-to-CHT for Nepali and rural Nepali dialects — a plan, not work done"

#### smart-task-prioritization (AI system architect)

**Non-engineer** (`smart-task-prioritization.non-engineer.md`):

> Hareet is the AI system architect for Smart Task Prioritization. His pitch and design won Medic the AWS IMAGINE Grant's Momentum to Modernize award: the award is Medic's, won on his pitch and design.

- `00-profile.md`, `[A]`: "He is the AI system architect for Smart Task Prioritization — his pitch and design won Medic the AWS IMAGINE Grant's Momentum to Modernize award"
- `03-grants-and-credits.md`, `[A 2026-09-14/27]`: "Won by Medic on Hareet's pitch and design for AI smart task prioritization"

**Engineer** (`smart-task-prioritization.engineer.md`):

> Hareet is the AI system architect for Smart Task Prioritization. The AWS IMAGINE Grant's Momentum to Modernize award was won by Medic on Hareet's pitch and design for AI smart task prioritization; he is the project's AI system architect.

- `00-profile.md`, `[A]`: "He is the AI system architect for Smart Task Prioritization"
- `03-grants-and-credits.md`, `[A 2026-09-14/27]`: "Won by Medic on Hareet's pitch and design for AI smart task prioritization; he is the project's AI system architect"
- `00-profile.md`, `[A]`: "his pitch and design won Medic the AWS IMAGINE Grant's Momentum to Modernize award"

#### no-code-configuration (AI system architect)

**Non-engineer** (`no-code-configuration.non-engineer.md`):

> Hareet is the AI system architect for No-Code CHT Configuration, a finalist. AWS invited the team to a hackathon for the project, and the pitch won funding in the earlier rounds.

- `01-ai-strategy-and-cht.md`, `[A]`: "This is No-Code CHT Configuration; Hareet is its AI system architect"
- `00-profile.md`, `[A]`: "and for No-Code CHT Configuration, a 2026 finalist"
- `03-grants-and-credits.md`, `[A 2026-09-27]`: "AWS invited the team to a hackathon for the project, and the pitch won funding in the earlier rounds"

**Engineer** (`no-code-configuration.engineer.md`):

> This is No-Code CHT Configuration, and Hareet is its AI system architect. The pitch won funding in the earlier rounds, and AWS invited the team to a hackathon for the project, which is a finalist.

- `01-ai-strategy-and-cht.md`, `[A]`: "This is No-Code CHT Configuration; Hareet is its AI system architect"
- `03-grants-and-credits.md`, `[A 2026-09-27]`: "AWS invited the team to a hackathon for the project, and the pitch won funding in the earlier rounds"
- `00-profile.md`, `[A]`: "and for No-Code CHT Configuration, a 2026 finalist"

### Engineering practice

#### change-management (led)

**Non-engineer** (`change-management.non-engineer.md`):

> Hareet led change management at Medic and built internal AI tooling, so other senior engineers could see how the workflow was changing. The principle behind it: organizational AI, not individual AI.

- `01-ai-strategy-and-cht.md`, `[A 2026-09-14]`: "He led change management and built internal AI tooling so other senior engineers could see how the workflow was changing"
- `01-ai-strategy-and-cht.md`, `[A-DOC strategy]`: "The principle behind it: organizational AI, not individual AI"

**Engineer** (`change-management.engineer.md`):

> Hareet led change management and built internal AI tooling so other senior engineers could see how the workflow was changing. The principle behind it: organizational AI, not individual AI, with shared tools, shared standards, and shared learning; everyone experiments, and the organization learns together. Buildtime AI in Hareet's words: taking dreams that would have cost massive engineering time off the shelf — after first building the harnesses and skills that let AI build them reliably — and changing cht-core's development lifecycle by using cht-agent, guided so non-technical users can drive it.

- `01-ai-strategy-and-cht.md`, `[A 2026-09-14]`: "He led change management and built internal AI tooling so other senior engineers could see how the workflow was changing"
- `01-ai-strategy-and-cht.md`, `[A-DOC strategy]`: "The principle behind it: organizational AI, not individual AI — shared tools, shared standards, shared learning; everyone experiments, and the organization learns together"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-14]`: "Buildtime AI in Hareet's words: taking dreams that would have cost massive engineering time off the shelf — after first building the harnesses and skills that let AI build them reliably — and changing cht-core's development lifecycle by using cht-agent, guided so non-technical users can drive it"

#### cht-skills (sponsored)

**Non-engineer** (`cht-skills.non-engineer.md`):

> Hareet sponsored the CHT skills in cht-ai-tools, Medic's public Claude Code plugin marketplace, including cht-pr-review, which others built. It installs CHT skills, the CHT Docs MCP, slash commands, and validation hooks, and it is the strategy's shared layer of CHT AI tools.

- `01-ai-strategy-and-cht.md`, `[A 2026-09-27]`: "and sponsored the CHT skills, including `cht-pr-review`, which others built"
- `01-ai-strategy-and-cht.md`, `[C]`: "github.com/medic/cht-ai-tools is a public Claude Code plugin marketplace"
- `01-ai-strategy-and-cht.md`, `[C]`: "the CHT Docs MCP, slash commands, and validation hooks"
- `01-ai-strategy-and-cht.md`, `[A-DOC strategy]`: "It is the strategy's "CHT AI Tools" shared layer"

**Engineer** (`cht-skills.engineer.md`):

> Hareet sponsored the CHT skills in cht-ai-tools, Medic's public Claude Code plugin marketplace, with OpenCode supported: among them cht-specialist, create-cht-task, create-cht-target, and cht-pr-review, which others built. It installs those skills, the CHT Docs MCP, slash commands, and validation hooks; it is the strategy's shared layer of CHT AI tools. Inside it, Hareet built agent-watchdog and the Docs MCP it packages.

- `01-ai-strategy-and-cht.md`, `[A 2026-09-27]`: "Inside it, Hareet built agent-watchdog and the Docs MCP it packages, and sponsored the CHT skills, including `cht-pr-review`, which others built"
- `01-ai-strategy-and-cht.md`, `[C]`: "is a public Claude Code plugin marketplace (OpenCode supported) that installs CHT skills — `cht-specialist`, `create-cht-task`, `create-cht-target`, `cht-pr-review` — the CHT Docs MCP, slash commands, and validation hooks"
- `01-ai-strategy-and-cht.md`, `[A-DOC strategy]`: "It is the strategy's "CHT AI Tools" shared layer"

#### cht-codebase (no verb)

**Non-engineer** (`cht-codebase.non-engineer.md`):

> Hareet still produces, maintains, and contributes to the main CHT codebase, and is changing it so agentic best practices can take root.

- `01-ai-strategy-and-cht.md`, `[A-CHAT]`: "He still produces, maintains, and contributes to the main CHT codebase, and is changing it so agentic best practices can take root"

**Engineer** (`cht-codebase.engineer.md`):

> Hareet still produces, maintains, and contributes to the main CHT codebase, and is changing it so agentic best practices can take root. Buildtime AI in Hareet's words: taking dreams that would have cost massive engineering time off the shelf — after first building the harnesses and skills that let AI build them reliably — and changing cht-core's development lifecycle by using cht-agent, guided so non-technical users can drive it. cht-agent is being used on the datasource migration to Postgres.

- `01-ai-strategy-and-cht.md`, `[A-CHAT]`: "He still produces, maintains, and contributes to the main CHT codebase, and is changing it so agentic best practices can take root"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-14]`: "Buildtime AI in Hareet's words: taking dreams that would have cost massive engineering time off the shelf — after first building the harnesses and skills that let AI build them reliably — and changing cht-core's development lifecycle by using cht-agent, guided so non-technical users can drive it"
- `01-ai-strategy-and-cht.md`, `[A 2026-09-14]`: "It is being used on the datasource migration to Postgres"

### Before AI: production infrastructure at national scale

#### kenya-localization (led)

**Non-engineer** (`kenya-localization.non-engineer.md`):

> Before AI, Hareet was a site reliability engineer. He localized CHT for Kenya's national deployment by training the Ministry of Health in DevOps practices.{{slot:echis_ke.moh_engineers_trained}} He was part of a human-centered software team; Kenya's Ministry of Health owned the workflows and product decisions.

- `02-production-infrastructure-national-scale.md`, `[A 2026-09-27]`: "Before AI, Hareet was a site reliability engineer who localized CHT for Kenya's national-scale deployment"
- `00-profile.md`, `[A 2026-09-27]`: "a site reliability engineer who localized CHT for Kenya's national deployment by training the Ministry of Health in DevOps practices"
- `00-profile.md`, `[A 2026-09-07]`: "Medic: part of a human-centered software team building CHT for CHWs; Kenya's Ministry of Health owned the workflows and product decisions"
- Slots, unfilled today: `echis_ke.moh_engineers_trained`

**Engineer** (`kenya-localization.engineer.md`):

> Before AI, Hareet was a site reliability engineer who localized CHT for Kenya's national-scale deployment by building capacity: training the Ministry of Health in DevOps practices.{{slot:echis_ke.moh_engineers_trained}} {{slot:echis_ke.deployment_start}} Throughout, he was part of a human-centered software team; the Ministry owned the workflows and product decisions.

- `02-production-infrastructure-national-scale.md`, `[A 2026-09-27]`: "Before AI, Hareet was a site reliability engineer who localized CHT for Kenya's national-scale deployment by building capacity — training the Ministry of Health in DevOps practices"
- `02-production-infrastructure-national-scale.md`, `[A 2026-09-03/07]`: "Throughout, he was part of a human-centered software team; the Ministry owned the workflows and product decisions"
- Slots, unfilled today: `echis_ke.moh_engineers_trained`, `echis_ke.deployment_start`

#### cht-docker-architecture (architected)

**Non-engineer** (`cht-docker-architecture.non-engineer.md`):

> Hareet architected CHT's move from a monolith to Docker-based services, with blue-green deployments and one-click, zero-downtime upgrades. That work prepared CHT for ease of deployment. {{slot:cht4.release}}

- `02-production-infrastructure-national-scale.md`, `[A 2026-09-27, C]`: "he architected the move from a monolith to Docker-based services, with blue-green deployments and one-click, zero-downtime upgrades"
- `02-production-infrastructure-national-scale.md`, `[A 2026-09-27, C]`: "he prepared CHT for version 4.0 and ease of deployment"
- Slots, unfilled today: `cht4.release`

**Engineer** (`cht-docker-architecture.engineer.md`):

> Before Kenya's national-scale deployment, Hareet prepared CHT for ease of deployment: he architected the move from a monolith to Docker-based services, with blue-green deployments and one-click, zero-downtime upgrades. {{slot:cht4.release}}

- `02-production-infrastructure-national-scale.md`, `[A 2026-09-27, C]`: "Before that deployment, he prepared CHT for version 4.0 and ease of deployment: he architected the move from a monolith to Docker-based services, with blue-green deployments and one-click, zero-downtime upgrades"
- Slots, unfilled today: `cht4.release`

#### national-benchmarking (built)

**Non-engineer** (`national-benchmarking.non-engineer.md`):

> Hareet built the benchmarking behind the national hardware procurement for the Ministry's national-scale deployment.

- `00-profile.md`, `[A 2026-09-27]`: "and built the benchmarking behind the national hardware procurement"
- `02-production-infrastructure-national-scale.md`, `[A 2026-09-27]`: "the infrastructure to analyze and procure hardware for the Ministry's national-scale deployment"

**Engineer** (`national-benchmarking.engineer.md`):

> Hareet built the application's performance measurement, database benchmarking, and the infrastructure to analyze and procure hardware for the Ministry's national-scale deployment. That was the benchmarking behind the national hardware procurement.

- `02-production-infrastructure-national-scale.md`, `[A 2026-09-27]`: "he built the application's performance measurement — database benchmarking — and the infrastructure to analyze and procure hardware for the Ministry's national-scale deployment"
- `00-profile.md`, `[A 2026-09-27]`: "and built the benchmarking behind the national hardware procurement"

#### other-deployments (no verb)

**Non-engineer** (`other-deployments.non-engineer.md`):

> Hareet was also involved in Uganda's eCHIS and in the Ministry of Health deployments in Mali and Zanzibar, to a lesser extent than in Kenya's.{{slot:echis_ug.involvement}}{{slot:moh_mali.involvement}}{{slot:moh_zanzibar.involvement}}

- `02-production-infrastructure-national-scale.md`, `[A 2026-09-27]`: "He was also involved in Uganda's eCHIS and in the Ministry of Health deployments in Mali and Zanzibar, to a lesser extent than in Kenya's"
- Slots, unfilled today: `echis_ug.involvement`, `moh_mali.involvement`, `moh_zanzibar.involvement`

**Engineer** (`other-deployments.engineer.md`):

> Hareet was also involved in Uganda's eCHIS and in the Ministry of Health deployments in Mali and Zanzibar, to a lesser extent than in Kenya's.{{slot:echis_ug.involvement}}{{slot:moh_mali.involvement}}{{slot:moh_zanzibar.involvement}} Throughout, he was part of a human-centered software team.

- `02-production-infrastructure-national-scale.md`, `[A 2026-09-27]`: "He was also involved in Uganda's eCHIS and in the Ministry of Health deployments in Mali and Zanzibar, to a lesser extent than in Kenya's"
- `02-production-infrastructure-national-scale.md`, `[A 2026-09-03/07]`: "Throughout, he was part of a human-centered software team"
- Slots, unfilled today: `echis_ug.involvement`, `moh_mali.involvement`, `moh_zanzibar.involvement`

## Facts slots

The drafts use six slots that already exist in `facts/national-projects.yaml`, all unfilled, so today they render nothing: `echis_ke.moh_engineers_trained`, `echis_ke.deployment_start`, `cht4.release`, `echis_ug.involvement`, `moh_mali.involvement`, and `moh_zanzibar.involvement`. When you fill one as public-safe, its phrasing appears in the script, and the lock and the eval cases ask for a rewrite. No new slot is proposed here: the resume's proposal (`resume-2026-10-18.md`) lists the three years the drafts would need.

## What the drafts leave out, and why

- **Everything under "Held back until cleared"** in `01`: the Voice for CHT partners, the pilot language, and the controlled-test result. The scripts say "a partner" and "the pilot".
- **Award amounts, credits, and anything you won personally**: Medic won the Momentum to Modernize award "on Hareet's pitch and design", and the scripts say so in those words.
- **Field results for the Voice for CHT pilot**, which come later; and the in-house Nepali voice-to-CHT, which is "a plan, not work done".
- **The Ground Truth recording**: the scripts credit the buildtime and runtime words to Taylor Downs of OpenFn, and say the tracks are yours and Andra's.
- **Your background and values** (`00`, "Background and values"): no resume item narrates them yet.
- **Artificial Indian Games**: no topic file yet.
