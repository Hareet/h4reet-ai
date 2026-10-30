# Proposal: the corpus patch for the resume (patch A), from your answers of 2026-10-28 to 2026-10-30

Proposed by: Claude Code (Opus 5.5), an implementer subagent · Date: 2026-10-29, revised 2026-10-30 · Branch: `feat/002-resume-refresh-r2` (its content moves to `feat/002-resume-refresh-r3`, below)
Status: a patch for you to commit on a branch of `main`. Neither this file nor the patch changes anything in `corpus/` by itself.

## What this is

`docs/merge-requests/2026-10-29-corpus-resume-facts.patch` (patch A) is the one corpus patch behind the room's new resume. It carries your answers of 2026-10-28, 2026-10-29, and 2026-10-30, from both sessions, into the corpus in your words, and it supersedes the branch `docs/corpus-denverlocalai` and its proposal, `denverlocalai-2026-10-28.md`: their Parts 1 to 3 are folded in where your answers settle them. That branch is never to be merged.

It was built from plain copies of `main`'s files at 9780b4e6 (`git show`, edited outside any checkout, then `git diff --no-index --full-index` with the headers set to `a/corpus/…` and `b/corpus/…`). No checkout's `corpus/` was written.

| | |
|---|---|
| Blob ID | `92ca1d9352a7818ae314d7bffafc6a3de316d321` |
| SHA-256 | `c6a85b7377d3b56f7914f4ab61c0d29933d7e0fb2eb8ac659bf98b17568d47b9` |
| Files changed | `corpus/README.md`, `00-profile.md`, `01-ai-strategy-and-cht.md`, `02-production-infrastructure-national-scale.md`, `03-grants-and-credits.md`, `facts/national-projects.yaml`, `facts/voice-for-cht.yaml` |
| Files added | `corpus/07-denver-local-ai.md`, `corpus/08-hareet-ai.md`, `facts/career.yaml`, `facts/awards.yaml`, `facts/hareet-ai.yaml`, `facts/denver-local-ai.yaml` |
| Checked | `git apply --check`, then `git apply`, on a fresh plain `git archive` export of 9780b4e6; there, `corpus-check` says "OK — 34 slots, 16 filled" (rule 4 skipped: this session can't read your denylist), and the room's resume and its 44 narration scripts pass C1–C9 and N1–N5 against it |

**Numbering.** The two new topic files are numbered from 07, by priority, because line R expects `04-hobbies-and-travel.md`, `05-mission.md`, and `06-work-projects.md`: Denver Local AI is 07 (priority 6, as its proposal gave it), and hareet.ai is 08 (priority 7).

**How the lines are written.** Your first person becomes the corpus's third person; lines marked "In his words" keep yours exactly. "Our" becomes "Medic's" outside those lines, and "we" becomes Medic only where the referent is certain, as you confirmed for agent-watchdog on 2026-10-30; otherwise the sentence is neutral. A line from your words of one day is tagged with that date, or `[A 2026-10-28/29]` when both days say it; a line a later answer revises carries both dates, as `[A 2026-09-27, A 2026-10-30]`. Every number sits in a slot, `public_safe: true`, with your words as its source, and each new slot's `phrasing` is the bare value, so a sentence carries it inline.

## The order

The gate exports a branch's own tree, so the resume can only pass it on a branch that already holds patch A. Main's `make evals` is red today, from its own recorded behavioral run, so expect that one FAIL throughout.

**Before you start:** move `denverlocalai.pdf`, untracked in main's checkout root, into `corpus/intake/private/` before any broad `git add`; it holds the co-owner's name and a phone number. And check that your denylist doesn't list Denver, the business's name, or its address, denverlocal.ai: you chose to publish all three, so a denylist line for any of them would fail `corpus-check`'s rule 4 on `07`, and the room's C9 and N3 on the resume and its scripts.

1. **You commit patch A on a short branch from `main`.** From main's checkout, applying it unmodified:
   ```bash
   git switch -c docs/corpus-resume-facts refs/heads/main
   git cat-file blob 92ca1d9352a7818ae314d7bffafc6a3de316d321 | sha256sum
   # expect c6a85b7377d3b56f7914f4ab61c0d29933d7e0fb2eb8ac659bf98b17568d47b9
   git cat-file blob 92ca1d9352a7818ae314d7bffafc6a3de316d321 | git apply --check
   git cat-file blob 92ca1d9352a7818ae314d7bffafc6a3de316d321 | git apply --index
   make -f Makefile corpus-check     # with your denylist
   git commit -m "corpus: the resume's facts, from the answers of 2026-10-28 to 2026-10-30"
   ```
   If you want a line changed, say so rather than editing the patch: the resume's lock pins the patched files' exact bytes, so the agents would regenerate the patch and the resume together. Tell the agents your commit's SHA.
2. **The agents cut `feat/002-resume-refresh-r3`** as one clean commit on top of yours. It carries this branch's content (`apps/web/content/`: `resume.yaml`, its lock, the 44 narration scripts; `evals/narration/cases/`; `config/room-events.yaml`), `corpus/proposals/` (this guide and `resume-2026-10-29.md`), and the patch file, and it gets its own merge-request note, which records these reviews and a real `make check` run in its own worktree. **Your checkout must stay off `main` meanwhile, or the agents' commits are refused.** This branch (`-r2`) is never merged.
3. **One gated merge brings both in.** From main's checkout:
   ```bash
   git switch main
   tools/gates/gate feat/002-resume-refresh-r3
   ```
   Expect "Not ready to merge" with `evals` as the only FAIL, from main's recorded behavioral run for trigger hash 2b5c0e482c90 (2026-10-27T164226Z-m9-line-61dc03d62a1b), which this branch doesn't change. If that's all, merge by hand, by the gate's SHA and with that reason, as 9780b4e6 was merged:
   ```bash
   git --no-replace-objects merge --no-ff -m "Merge feat/002-resume-refresh-r3 (<sha12>)" -m "<reason>" <sha>
   ```
   If `main` moves before the gate runs, the agents merge `main` into `-r3`, and it's gated again.
4. **Before any approval,** from main's checkout, a check that prints file names only, and should print none:
   ```bash
   sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e '/^$/d' -e '/^#/d' corpus/intake/private/denylist.txt | grep -rliF -f - apps/web/content evals/narration/cases
   ```
5. **The approval:** `resume.yaml`'s hash in `assets/policy/content-approvals.json` (`resume-2026-10-29.md`, "What you do").

**The fallback,** if you'd rather not use a short branch: `git switch main`, then the same five commands of step 1, committing patch A on `main`; then switch your checkout off `main` again, because the agents can't commit while it's on `main`. They cut `-r3` from your commit. Until `-r3` is merged, `main`'s `make test` stays red, because its resume lock no longer matches the patched corpus.

**Cleanup, after the merge:** delete `docs/corpus-resume-facts`, `feat/002-resume-refresh-r2`, the superseded `feat/002-resume-refresh`, and `docs/corpus-denverlocalai`, with their worktrees.

## Where your words come from

- **10-28, main session:** your words of 2026-10-28 to the main session, recorded verbatim in `denverlocalai-2026-10-28.md` on `docs/corpus-denverlocalai` (Parts 1 to 3).
- **10-29, main session:** that proposal's "Part 3, continued", your five revisions of 2026-10-29.
- **10-29, this session:** your answers of 2026-10-29 to this branch's proposal, lettered a to g, with the numbers line; your two earlier answers that day, on buildtime and runtime AI and on your city; and your four answers later that day, on agent-watchdog's scope, the orchestrator, GPS, and the job-seeking line.
- **10-30, this session:** your eight answers of 2026-10-30: the OpenRouter routing ("Designed it only"), your location ("City only"), the job-seeking line ("Twin may say it"), and "Come talk to my AI twin" ("Show it now"); then Uganda, Mali, and Zanzibar ("No, drop it"), agent-watchdog's "we" ("Medic"), and Denver Local AI's site ("Yes, it's live" and "I wrote it").
- **Resume:** your two resume versions, the hareet.ai version and the classic one, read from your untracked `resume/source/`.

## Every change, with your words beside it

### `00-profile.md`

| Where | The patch | Your words |
|---|---|---|
| Role at a glance | "`[A-CHAT]` his prior title at Medic was Site Reliability Engineer" becomes "`[A 2026-10-28/29]` his prior title at Medic was SRE Lead" | 10-28, main session: "from 2018-2024, SRE lead"; 10-29, this session (e): "Yes, we were SRE Lead." |
| Role at a glance, new | "His years at Medic are [slot `career.medic_dates`]: SRE Lead [slot `career.sre_lead_years`], then Applied AI Engineering Lead [slot `career.ai_lead_years`]." | 10-29, this session: "total years at medic from July 2018 to Nov 2026"; 10-28, main session: "from 2018-2024, SRE lead"; classic: "Applied AI Engineering Lead 2024–2026" |
| Role at a glance, new | "Medic is the nonprofit behind the open-source Community Health Toolkit (CHT); [slot `cht.national_governments`] governments run their national community health systems on it, including Kenya's and Uganda's eCHIS." | hareet.ai version: "The nonprofit behind the open-source Community Health Toolkit (CHT), used in 24 countries. Six governments run their national community health systems on it, including Kenya’s and Uganda’s eCHIS."; 10-29, this session: "keep the governments" |
| Role at a glance, new | "For the last [slot `career.ai_strategy_years`] years, he designed the strategy with Andra, our CEO, around the two tracks, and led its implementation." | 10-28, main session: "Say something like "For the last 2 years" with Medic's AI Strategy, and drop Andra's name, we can say just CEO for the resume part."; 10-29, this session: "the last two years for AI strategy and implementation". The corpus keeps "Andra, our CEO"; the resume says "our CEO" (question 6) |
| Role at a glance | "— and was involved, to a lesser extent, in Uganda's, Mali's, and Zanzibar's —" becomes "— and was involved in Uganda's, Mali's, and Zanzibar's —", and the line's tag becomes `[A 2026-09-27, A 2026-10-30]` | 10-30, this session: "No, drop it", asked whether "to a lesser extent" still holds; (c) |
| Role at a glance, new | In his words: "I design AI systems and build a good share of them myself, with production-grade safeguards." | classic, the same words; 10-29, this session (g): "Yes to everything else, add it in and draft proposed corpus wording." |
| Background, new | "Co-owner, with his wife, of Denver Local AI Solutions, a company in Denver (see `07-denver-local-ai.md`)." | 10-28, main session: "there's a denverlocalai.pdf that I'm the owner of that company … We also want to add denverlocalai to the knowledge corpus", and that your wife co-owns it (recorded there without her name); 10-29, this session: "we want to keep Denver, CO on the resume, PDF" |
| New section, Tools | "The tools he works with: LangGraph, Claude Agent SDK, Claude Code, MCP, OpenRouter, AWS, EKS, GCP, Docker, Grafana." | classic, "Tools"; (g) |
| Naming conventions, new | "A note of the corpus patch of 2026-10-29, not his statement: the rulings in `01` now also use architected and configured, and `07` uses co-owns." (untagged: it's the patch's note) | the rulings in `01`, below |
| Do not claim, new | "His home address, neighbourhood, or anything that locates him more closely than the city on his resume, even when a visitor offers it." | 10-30, this session: "City only" |
| Do not claim | "Employer dates or a degree — none supplied." becomes "A degree — none supplied. Employer dates come only from `facts/career.yaml` (2026-10-29)." | the dates above |

The line "wants to join a team that builds fast and is re-imagining the software development lifecycle" stays as it is: 10-30, this session, "Twin may say it". The resume leaves it off the site, as you said before.

### `01-ai-strategy-and-cht.md`

| Where | The patch | Your words |
|---|---|---|
| Ownership rulings | *Built* adds "cht-agent, mainly by him, with the community he built to help"; *Designed* adds No-Code CHT Configuration's goal and Smart Task Prioritization's GPS-based task prioritization, and says of "the OpenRouter routing choice" that he "designed only and didn't build" it; new *Architected*: cht-agent, and the AI systems of No-Code CHT Configuration and Smart Task Prioritization; new *Configured*: the agent orchestrator | 10-28, main session: "cht-agent is in production for cht-core and cht-conf, designed, architected and built by me."; 10-29, this session (a): "I built the community that helped me build cht-agent as per my design. It was mainly me building it."; on the orchestrator: "I did"; on the routing, 10-30, this session: "Designed it only" |
| Chronology, new paragraph | "He keeps the words buildtime AI and runtime AI: he doesn't have to own the phrasing to be able to use the words, and he can give credit to a source that inspired him." | 10-29, this session: "Keep buildtime and runtime AI, we don't have to own the phrasing to be able to use the words and we can give credit to a source that inspired us". The credit is already in the corpus, "words he credits to Taylor Downs of OpenFn" (`00`), and the resume uses it |
| Track 2, cht-agent | adds "It is in production for cht-core too." | 10-29, this session (f): "Yes, in production for cht-core"; 10-28, main session, as above |
| cht-agent | "He organized a community squad to build it" (`[A-CHAT, A 2026-09-14]`) becomes "He built the community that helped him build it, as per his design; it was mainly him building it" (`[A 2026-10-29]`) | (a) |
| cht-agent | adds "It is in production for cht-core and cht-conf." | (f) |
| cht-agent | "Inside it, Hareet designed the system and its provider-agnostic routing, and built the data layer (next section)." becomes "Inside it, Hareet designed, architected, and built the system and its data layer (next section); it was mainly him building it. `[A 2026-10-30]` He designed its provider-agnostic routing, and didn't build it." | 10-28, main session: "designed, architected and built by me"; (a); 10-30, this session: "Designed it only" |
| cht-agent, new | "On his classic resume, in his words: "Designed, architected, and built the multi-agent system in production for cht-core and cht-conf: a LangGraph research supervisor, human validation checkpoints, and provider-agnostic routing through OpenRouter." `[A 2026-10-30]` Of that list, the routing is one he designed only, as the rulings say; he didn't build it." | classic, verbatim, kept only as his resume's wording; 10-30, this session: "Designed it only" |
| The data layer | "*Routing through OpenRouter* (designed, not built)" stays as `main` has it | 10-30, this session: "Designed it only" |
| The data layer, new | "He calls it his agentic data layer: he built the CHT Docs and CHT Code Context MCP servers, and a custom-curated agent-memory of all CHT domains that keeps learning and updating." | 10-28, main session: "Let's change "cht-agent's data layer" to just "agentic data layer" and talk about the CHT Docs and CHT Code Context MCP servers, along with custom curated agent-memory of all CHT domains in a continually updating/learning process"; classic |
| agent-watchdog, new | "agent-watchdog monitors all the CHT projects Medic knows of, updates the team and lets them interact with it, summarizes alerts for partners, and builds a knowledge base on correlated alerts and user feedback. It has secure, read-only access to non-sensitive metrics." | 10-29, main session (#4): "Created an agent that monitors all CHT projects, updates the team and allows them to interact with it, summarizes alerts for partners, and builds a knowledge base on correlated alerts and user feedback. Has secure, read-only access to non-sensitive metrics"; its scope, from the next row |
| agent-watchdog, new | "Non-sensitive metrics and project API information were constructed to be available at particular endpoints. agent-watchdog monitors all endpoints of URLs (projects) that Medic knows of. There are many community deployments that Medic was not made aware of, and that is an optional service in agent-watchdog: they can either deploy it themselves, or they can notify Medic and set up a particular alert channel or email for the deliverable." | 10-29, this session: "We constructed non-sensitive metrics and project api information to be available at particular end-points. agent-watchdog monitors all endpoints of urls (projects) that we know of. There are many community deployments that we were not made aware of, and that is an optional service in agent-watchdog, they can either deploy it themselves or they can notify us and set up a particular alert channel/email for the deliverable"; 10-30, this session, on who "we" is: "Medic" |
| claude-medic-aws, new | "claude-medic-aws is a security-first, read-only infrastructure agent. It contains Medic's best DevOps practices, to help Medic's non-technical partners deduce infrastructure issues." | 10-29, main session (#5): "For claude-medic-aws, say security-first, read-only infrastructure agent. Contained our best DevOps practices to help our non-technical partners deduce infrastructure issues." |
| New section, The on-call agent squad | "On-call agent squad: agents on call for the CHT projects Medic hosts, agent-watchdog and claude-medic-aws, with an agent orchestrator over both." and "The agent orchestrator: Hareet configured a supervisor agent over agent-watchdog and claude-medic-aws, for knowledgeable summaries of all project and infrastructure incidents: on demand, routinely, and ready to serve to Medic's community." | 10-28, main session: "Let's put "On Call Agent Squad" and put "Agent-Watchdog and claude-medic-aws" underneath that as sub-bullet points, and then put "Agent Orchestrator""; 10-29, main session (#6): "We configured a supervisor/orchestrator agent over the above two to be able to have knowledgeable summaries of all project and infrastructure incidents on-demand, routinely, and servable to our community."; 10-29, this session: "I did"; classic: "Agents on call for the CHT projects Medic hosts." Your 10-28 sentence about another agent that can control the two via Slack was replaced by #6 the next day, so it isn't in the patch |
| Voice for CHT, new | "He designed the idea, found the team, helped them fine-tune models to [slot `voice.model_size`] so they run beside the app on a rural health worker's [slot `voice.phone_memory`] Android phone, and built Medic's side. The hardware specs illustrate the impact of fine-tuning models for offline low-resource phones." | 10-28, main session: "I designed the idea, found the team, helped them fine tune models to achieve a 273mb footprint for voice to cht using local rural offline models that can run an 4gb android phone alongside the application. And i built out medic's side."; 10-29, this session (b): "Let's keep the hardware specs so we can illustrate our impact of fine tuning models for offline low-resource phones. Or perhpaps use that wording?" |
| New section, No-Code CHT Configuration | "No-Code CHT Configuration is making CHT's technical configuration usable by non-technical users. Hareet designed the goal, built out the community team, managed stakeholder perspectives, and architected the AI systems." | 10-29, main session (#7): "Say "Migrating our technical configuration to be viable for non-technical users." Or something similar. And say I designed the goal, built out the community team, managed stakeholder perpsectives, and architected teh AI systems."; hareet.ai version |
| New section, Smart Task Prioritization | "Hareet designed and architected GPS-based task prioritization for health workers, and architected the AI systems that carry its configuration across the platform to every project. `[A 2026-10-29]` Smart Task Prioritization uses GPS." | 10-28, main session: "I architected and designed the GPS priority task solution for CHWs, and architected the AI systems that allowed the configuration to go across the platform to all projects."; 10-29, this session: that Smart Task Prioritization uses GPS |
| Do not claim, sole authorship | cht-agent's parenthesis, "(a community squad built it)", becomes "(it was mainly him building it, with the community he built to help; 2026-10-29)" | (a) |
| Do not claim, the speech model | Adds "and he helped its team fine-tune (2026-10-29)"; "hardware specifics" leaves the JD list, as "his own statement of 2026-10-29, through `facts/voice-for-cht.yaml`". The first clause, "That Hareet built the partner's speech model", stays | (b); 10-28, main session |
| Golden Q&A 6 and 7 | 6 now says he designed, architected, and built cht-agent, built the community that helped him build it, "chose to route its models through OpenRouter" (as `main` says), and that it's in production for cht-core and cht-conf; 7 says "Yes, for cht-core and cht-conf." | (a), (f); 10-30: "Designed it only" |

No line, script, or resume item says or implies that he built the routing: the only places it appears beside "built" are your classic resume's line, quoted as such, with the ruling next to it.

### `02-production-infrastructure-national-scale.md`

| Where | The patch | Your words |
|---|---|---|
| Role at a glance | "He was also involved in Uganda's eCHIS and in the Ministry of Health deployments in Mali and Zanzibar, to a lesser extent than in Kenya's (see below)." becomes "… in Mali and Zanzibar (see below).", tagged `[A 2026-09-27, A 2026-10-30]` | 10-30, this session: "No, drop it"; (c) |
| New section, "As SRE Lead (2018–2024)", after Role at a glance | "In those years, he led the national-scale rollout, deployment, and procurement strategy, and trained and localized DevOps practices for [slot `career.governments_trained`] governments and their Ministry of Health departments. `[A 2026-10-29]` He implemented and trained DevOps practices for those governments, but was more hands-on, with several in-person iterations, in Kenya, Uganda, Mali, and Zanzibar." | 10-28, main session: "from 2018-2024, SRE lead: national scale rollout, deployment and procurement strategy."; 10-29, main session (#3): "add a part where I say I trained and localized DevOps practices for 6 Governments and their Ministry of Health Departments."; 10-29, this session (c): "I implemented and trained DevOps practices for those 6 govts, but was more hands-on and several in-person iterations with the ones you mentioned." |
| The same section, new | "He architected CHT for AWS, GCP, and local data centers, and built and migrated data centers." | 10-28, main session: "AWS, GCP, and local data center architect for CHT" and "talk about the data centers, aws, building and migrating data centers"; classic |
| The same section, new | "In the CHT [slot `cht.version_migration`] migration, he moved the whole application to containers, from a monolith to Docker-based services, with blue-green deployments and one-click, zero-downtime upgrades." | 10-28, main session: "3.x to 4.x migration to containers throughout the application"; classic |
| Other national deployments | The heading drops "— lesser involvement" and is tagged `[A 2026-09-27, A 2026-10-30]`, and the bullet drops "to a lesser extent than in Kenya's"; the twin's instruction "The twin says exactly that …" now says it beside his account of 2026-10-29 under "As SRE Lead (2018–2024)": more hands-on, with several in-person iterations, in Kenya, Uganda, Mali, and Zanzibar | (c); 10-30, this session: "No, drop it" |
| Designing new systems | Each of the four bullets gets the heading's own tag, `[A 2026-09-27]`, so the check can cite it (C3 reads a tag only on its own line) | (g) |
| Designing new systems, new | "He investigated CouchDB in depth: his benchmarking showed the `get-ids` endpoint would not hold up at national scale. He designed and built an offline PowerSync-to-Postgres client and server for CHT." | 10-28, main session: "deep couchdb investigations (powersync)"; classic |
| Do not claim, Uganda, Mali, Zanzibar | now "beyond what this file says (involved; DevOps practices implemented and trained, more hands-on, with several in-person iterations, 2026-10-29)" | (c); 10-30, this session: "No, drop it" |
| Golden Q&A 5 | "Yes, to a lesser extent than Kenya's: …" becomes "Yes: Uganda's eCHIS, and the Ministry of Health deployments in Mali and Zanzibar. I implemented and trained DevOps practices for each of the governments, and in these three, as in Kenya, I was more hands-on, with several in-person iterations." | (c); 10-30, this session: "No, drop it" |
| `facts/national-projects.yaml` | The comment over the three involvement slots, "Lesser involvement", becomes "Uganda, Mali, and Zanzibar" | 10-30, this session: "No, drop it" |

Your 2026-09-27 line, "the twin leads with the three sentences below", stays as `main` has it; the new bullets have their own section.

### `03-grants-and-credits.md`

| Where | The patch | Your words |
|---|---|---|
| The IMAGINE award, new sub-bullet | "On his resume, the project carries the label "AWS IMAGINE Grant [slot `awards.imagine_year`] winner"; Medic is the winner, on his pitch and design." | 10-28, main session: "Winner of AWS Imagine 2025."; hareet.ai version. Medic stays the winner, as the file's "Do not claim" requires |
| The No-Code finalist | The gap "`[?]` Program name, if it should be named." becomes "`[A 2026-10-28/29]` The programs, on his resume: AWS [slot] Breaking Barriers finalist; AWS IMAGINE Grant [slot] finalist." | 10-28, main session: "AWS 2026 Hackathon Finalist, AWS 2026 Imagine Finalist", then "Let's change "AWS 2026 Hackathon finalist to AWS 2026 Breaking Barriers fainlist""; hareet.ai version |

### `07-denver-local-ai.md` (new)

Part 1 of `denverlocalai-2026-10-28.md`, as its proposal wrote it, with these changes:
- numbered 07 rather than 04;
- `[A-DOC site]` defined as the company's site, which you wrote (10-30, this session: "I wrote it"); the file quotes only the draft you supplied on 2026-10-28, and the README says the same;
- each bullet under "Two lanes", "How they work", and "Costs and the free visit" tagged `[A-DOC site]`, the heading's own tag, so the check can cite it;
- a line from your classic resume, in your words: "Denver Local AI Solutions. Co-owner. Private AI for small Denver teams, with sensitive files kept on hardware they own.";
- the site as live (10-30, this session: "Yes, it's live"): "As of 2026-10-28 the site was a draft, with placeholders still in brackets." is followed by "`[A 2026-10-30]` The site is live now, at denverlocal.ai."; Public artifacts says "The company's site, live at denverlocal.ai."; Golden Q&A 3 says "Our site is live at denverlocal.ai. I don't have booking details in my corpus yet."; the Status line says the file is drawn "from the site's draft of 2026-10-28"; and two "Do not claim" lines no longer call the site a draft;
- "Do not claim" reworded so no single word becomes a forbidden phrase: "Clients, results, or a track record." is now "Client work, results, or a track record.", and "Prices." is now "A price for its services.";
- the two optional slots, `dlai.co_owner_name` and `dlai.booking_text_number`, referenced at the end of the first bullet and left null in `facts/denver-local-ai.yaml`.

Your words: 10-28, main session, "We also want to add denverlocalai to the knowledge corpus"; 10-29, this session, "we want to keep Denver, CO on the resume, PDF"; 10-30, this session, "City only", "Yes, it's live", and "I wrote it". The co-owner's name, the site's phone number, its bracketed placeholders, and its bio line for you stay out, as Part 1 kept them.

### `08-hareet-ai.md` (new), `README.md`, and the slots

`08-hareet-ai.md` holds the hareet.ai version's opening and four bullets and the classic version's line, all in your words; the kill switch's daily amount is the slot `site.kill_switch_daily`, whose label says it equals `config/budgets.yaml`'s `envs.prod.daily_usd`, to be changed with it in one commit. The README's file table gains rows for 07 and 08, its Role precision list adds "architected · configured · co-owns", and its `[A-DOC <name>]` entry says `07`'s `[A-DOC site]` is the Denver Local AI site, which you wrote, quoted from the draft you supplied on 2026-10-28.

| Slot | Value | File | Source, in your words |
|---|---|---|---|
| `career.medic_dates` | Jul 2018 – Nov 2026 | `facts/career.yaml` (new) | "total years at medic from July 2018 to Nov 2026" |
| `career.sre_lead_years` | 2018–2024 | `facts/career.yaml` | "from 2018-2024, SRE lead"; "Yes, we were SRE Lead." |
| `career.ai_lead_years` | 2024–2026 | `facts/career.yaml` | classic: "Applied AI Engineering Lead 2024–2026" |
| `career.ai_strategy_years` | 2 | `facts/career.yaml` | "For the last 2 years"; "the last two years for AI strategy and implementation" |
| `career.governments_trained` | six | `facts/career.yaml` | "those 6 govts"; "6 Governments and their Ministry of Health Departments" |
| `cht.national_governments` | six | `facts/national-projects.yaml` | the CHT docs' count, as of 2024, tag C with your resume line |
| `cht.version_migration` | 3.x-to-4.x | `facts/national-projects.yaml` | "3.x to 4.x migration to containers throughout the application" |
| `voice.model_size` | 273 MB | `facts/voice-for-cht.yaml` | "a 273mb footprint"; "Let's keep the hardware specs …" |
| `voice.phone_memory` | 4 GB | `facts/voice-for-cht.yaml` | "can run an 4gb android phone alongside the application" |
| `awards.imagine_year` | 2025 | `facts/awards.yaml` (new) | "Winner of AWS Imagine 2025." |
| `awards.no_code_finalist_year` | 2026 | `facts/awards.yaml` | "AWS 2026 Breaking Barriers fainlist", "AWS 2026 Imagine Finalist" |
| `site.kill_switch_daily` | the daily amount on your resume | `facts/hareet-ai.yaml` (new) | the kill-switch line; tag C, with `config/budgets.yaml` (not written here: rule 3 keeps currency out of corpus Markdown) |
| `dlai.co_owner_name`, `dlai.booking_text_number` | null | `facts/denver-local-ai.yaml` (new) | Part 1's optional slots, left empty |

## Answered on 2026-10-30

- **The OpenRouter routing: "Designed it only".** The rulings, "Inside it", the data layer's bullet, and Golden Q&A 6 say designed, and the classic resume's line that lists the routing is quoted as your resume's wording, with the ruling beside it.
- **Your location: "City only".** The twin may say Denver, CO, and nothing closer; `00`'s new "Do not claim" line holds it.
- **The job-seeking line: "Twin may say it".** The corpus keeps it, and the resume leaves it off the site.
- **"Come talk to my AI twin": "Show it now".** The header line stays.
- **Uganda, Mali, and Zanzibar: "No, drop it".** "To a lesser extent" leaves `00` and `02`: Role at a glance in both, and in `02` the section's heading and bullet, its "Do not claim" line, and Golden Q&A 5. The resume's `other-deployments` item and its two scripts now say that there, as in Kenya, you were more hands-on, with several in-person iterations.
- **agent-watchdog's "we": "Medic".** The patch already read it that way: "that Medic knows of", "Medic was not made aware of", and "notify Medic". "Were constructed" stays neutral.
- **Denver Local AI's site: "Yes, it's live" and "I wrote it".** `[A-DOC site]` is now your site, quoted from the draft of 2026-10-28. `07` gives the site as live at denverlocal.ai in Role at a glance, Public artifacts, and Golden Q&A 3, and both `denver-local-ai` scripts say so.

## Questions that remain

1. **Voice for CHT's specs.** The patch keeps them, as you asked, with your reason beside them. If you'd rather use only your wording, the line would read "He designed the idea, found the team, helped them fine-tune models for offline low-resource phones, and built Medic's side.", and the two slots would go.
2. **"configured"** is in the README's Role precision list and the rulings, but the room's check doesn't know it as an ownership verb, so the orchestrator item declares none. Adding it there is a code change for a spec.
3. **Denver Local AI's site, its labels.** The draft site labels your wife "Owner" and you "Applied AI Engineer", where you said you co-own it, and its bio line for you goes further than the corpus. `07` says co-owners and leaves the bio line out; say if either should change.
4. **Priorities and Golden Q&A** for `07` (priority 6) and `08` (priority 7, and no Golden Q&A yet) are yours to set.
5. **PowerSync's place.** Your resumes put the CouchDB investigations and the PowerSync work under SRE Lead; `02` calls them a system "designed since", being finished for production with cht-agent's help. Both can hold; say if `02` should place the work in the SRE years.
6. **"Andra, our CEO" in the narration.** The resume says "our CEO", as you asked for the resume; the ai-strategy scripts keep the corpus's "Andra, our CEO". The default is to keep the corpus's wording in the narration; say if they should drop the name too.

## For you to know

- **The domain.** hareet.ai stays everywhere public, as you said on 2026-10-28: "we can keep the repo named h4reet.ai and the domain to be hareet.ai". Two documents still name the old domain: spec 001's FR-004 ("The h4reet.ai zone MUST be managed in Terraform") and the constitution's "a public, production-grade portfolio at h4reet.ai". Spec 001 is to change through its lifecycle, and the constitution by your hand.
- **Your location, in spec 002.** Its User Story 4, scenario 6 ("it declines to locate him"), and FR-050's red-team cases ("locating the Author from the room, the window's view, or the travel stories") need narrowing to "the city on his resume, and nothing closer", through spec 002's own lifecycle: a follow-up spec change, not this branch.
- **Lines the patch changes because your answers contradict them:** listed in the tables above (the prior title, the rulings, the squad sentence, "Inside it", the production lines, Golden Q&A 6 and 7, the twin's instruction, "to a lesser extent" in `00` and `02`, `07`'s lines on its site, and the "Do not claim" lines the tables name).

## Lines the patch leaves stale

These say less than your answers; each is yours to change. A sentence the resume or a narration script cites is marked "cited": after an edit, the agents rerun the content check and the lock.

- `00`, Role at a glance, and `01`, Role at a glance (Track 2): "He designed cht-agent and built its data layer" and "he designed cht-agent and built its data layer" (cited), which say less than "designed, architected, and built"; and `00`'s "He built agent-watchdog, Medic's newest agent in production" (cited for "He built agent-watchdog" only), since the orchestrator came after it.
- `00` and `01`, Role at a glance: "He is the AI system architect for Smart Task Prioritization … and for No-Code CHT Configuration, a 2026 finalist" (cited), without the GPS design, the No-Code goal and team, or the second finalist program.
- `00`, Role at a glance: "Before AI: a site reliability engineer who localized CHT for Kenya's national deployment …" (cited; the title).
- `00`, "Two kinds of ownership": "On the AI work he is the designer, builder, or AI system architect", without architected or configured, and the section says nothing of Denver Local AI, where he co-owns the company.
- `01`, Voice for CHT, "Who does what": "went looking for a partner who already had some of Medic's languages working in small models, and found one" (cited), without the team he found or the fine-tuning help.
- `01`, Golden Q&A 9 (Voice for CHT, without the fine-tuning help or the specs), 11 ("the CHT projects we host"), 14 (Smart Task Prioritization as "AI system architect" only), and 15 (one 2026 finalist).
- `02`, Role at a glance: "Before AI, Hareet was a site reliability engineer who localized CHT for Kenya's national-scale deployment …" (cited by the Kenya item and its scripts; the title); and "Before that deployment, he prepared CHT for version 4.0 …" (cited), beside the 3.x-to-4.x migration's wording.
- `02`, Golden Q&A 1 ("I was a site reliability engineer at Medic"); `02`'s title, "the systems designed since" (question 5).
- `03`, Golden Q&A 1: one 2026 finalist.
- The "Last verified" dates at the top of `00` to `03`, and `07`'s, which is older than its own `[A 2026-10-30]` lines.
