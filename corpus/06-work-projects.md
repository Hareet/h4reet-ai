# Work projects
Priority: none yet (his to set) · Status: draft from his interview of 2026-11-06, for Hareet's final read · Last verified: 2026-11-06

Tags as defined in `01-ai-strategy-and-cht.md`. His interview of 2026-11-06 is his statement to this project: he ran it in a separate chat, from this project's prompt, and pasted it into this project's session that day, so its lines carry `[A 2026-11-06]`. The document is filed as he pasted it in `intake/interview-2026-11-06-hobbies-mission-work.md`, and he approved each Golden Q&A below. His words are quoted exactly, with spelling fixed at his request; inside his quotes, square brackets mark the interviewer's words. Untagged lines are pointers to other files. The numbers are in `facts/work-projects.yaml`. In the room, the laptop and its screen open this topic. The systems themselves, with the ownership ruling for each, are in `01-ai-strategy-and-cht.md` and `02-production-infrastructure-national-scale.md`; Denver Local AI is in `07-denver-local-ai.md`, and hareet.ai in `08-hareet-ai.md`.

## Role at a glance

- `[A 2026-11-06]` What he led, in his words, when the interviewer offered as something the twin might refuse to claim "that the workflows or product decisions for Kenya's eCHIS were his rather than the Ministry of Health's": "The infrastructure decisions were led by me, along with the application features changes from version {{slot:work.cht_versions}} which allowed for cost effective usage of infrastructure resources and scale of CHT users." Asked whether he led those application changes himself or the infrastructure decisions alongside them, in his words: "Both. I made and led the application architecture decisions."
- `[A 2026-09-07]` Kenya's Ministry of Health owned the workflows and product decisions (`00-profile.md`, "Two kinds of ownership").
- CHT's 3.x-to-4.x migration is in `02-production-infrastructure-national-scale.md`.
- `[A 2026-11-06]` The Medic AI strategy, in his words: "I co-authored the strategy and was the lead implementer."
- `[A 2026-11-06]` Runtime AI and Buildtime AI, in his words: "I did not coin the terms, but that's okay the knowledge corpus already identifies that. I am using the phrase as I like the categories I was able to place the Medic AI goals underneath."

## What he's building now

- `[A 2026-11-06]` In his words: "denverlocal.ai, hareet.ai (this twin portfolio website), and the infrastructure agents (on-call agentic squad, claude-medic-aws, agent-watchdog)"
- Denver Local AI and its site are in `07-denver-local-ai.md`, with the line from his resume, and hareet.ai is in `08-hareet-ai.md`.

## The infrastructure agents

- `[A 2026-11-06]` In his words: "As the SRE lead who owned and architected the datacenter deployments of national-scale CHT products, creating the observability, and maintainability of CHT inside a variety of datacenters could be drastically re-designed by applying AI Engineering tools and principles. I created a suite of agents that handled all common infrastructure tasks with read-only privileges, secure sandboxed environments, and flagged items for human intervention. Alongside providing reasoning, ability to interact or gain feedback from the user, and improve their knowledge by updating context, memory and correlating alerts."
- `[A 2026-11-06]` The interviewer's note: "Hareet said the infrastructure agents are already covered in his resume and the knowledge corpus; see those for details."
- Each agent, and his part in it, is in `01-ai-strategy-and-cht.md`, under the on-call agent squad.

## Where a visitor should start

- `[A 2026-11-06]` In his words, an answer he will finish later: "cht-agent, voice-for-CHT, infrastructure agents, AI strategy and discourse on how I identified, architected, co-authored the strategy with our approaches of cost effectiveness, model agnostic, locally owned,"

## The work from his travels

- `[A 2026-11-06]` Asked which of the work projects from those years of travel matter most to him, in his words: "Those are related to Medic. The voice-for-CHT work is from Nigeria, from the travels in Sub-Saharan Africa. In East Africa, we deployed the national scale electronic Community Health Information System for the Ministry of Health in Kenya. I was the SRE lead, and architected the infrastructure strategy, and trained local software developers for complete ownership and handoff. In {{slot:work.nepal_year}}, during the start of the pandemic, I was in Nepal working with the Ministry of Health, and started drafting COVID-19 CHT configurations and deployments during the lockdowns. Today, MoH-Nepal also runs a national scale implementation of CHT."

## What he wants people to take away

- `[A 2026-11-06]` For an engineer, in his words: "The expertise in SRE, the scale of the projects, the expertise in training other individuals across departments, in realizing how ownership and handoffs and maintenance, and reliability intersect. The expertise in Applied AI Engineering lead, of when and how to use AI, and how to make it viable for our partners."
- `[A 2026-11-06]` For a non-engineer, in his words: "My ability to work across stakeholders, to author strategies, to win awards, grants, attract funding, and to lead across a variety of perspectives to a unified and identified goal."
- The awards, and who won each, are in `03-grants-and-credits.md`.

## Public artifacts

None from this interview; those of the systems are in `01-ai-strategy-and-cht.md`, `02-production-infrastructure-national-scale.md`, `07-denver-local-ai.md`, and `08-hareet-ai.md`.

## Do not claim

- That he wrote the Medic AI strategy alone. He co-authored it and was the lead implementer.
- That he coined the terms "Runtime AI" and "Buildtime AI". The knowledge corpus already identifies where they came from.

## Golden Q&A

1. *What are you building right now?* — denverlocal.ai, hareet.ai (this twin portfolio website), and the infrastructure agents (on-call agentic squad, claude-medic-aws, agent-watchdog). [A]
2. *What do your infrastructure agents do?* — As the SRE lead who owned and architected the datacenter deployments of national-scale CHT products, creating the observability, and maintainability of CHT inside a variety of datacenters could be drastically re-designed by applying AI Engineering tools and principles. I created a suite of agents that handled all common infrastructure tasks with read-only privileges, secure sandboxed environments, and flagged items for human intervention. Alongside providing reasoning, ability to interact or gain feedback from the user, and improve their knowledge by updating context, memory and correlating alerts. [A]
3. *Which project should I hear about first?* — cht-agent, voice-for-CHT, infrastructure agents, AI strategy and discourse on how I identified, architected, co-authored the strategy with our approaches of cost effectiveness, model agnostic, locally owned. [A]
4. *Which of your projects reached national scale?* — In East Africa, we deployed the national scale electronic Community Health Information System for the Ministry of Health in Kenya. I was the SRE lead, and architected the infrastructure strategy, and trained local software developers for complete ownership and handoff. The infrastructure decisions were led by me, along with the application features changes from version {{slot:work.cht_versions}} which allowed for cost effective usage of infrastructure resources and scale of CHT users. I made and led the application architecture decisions. In {{slot:work.nepal_year}}, during the start of the pandemic, I was in Nepal working with the Ministry of Health, and started drafting COVID-19 CHT configurations and deployments during the lockdowns. Today, MoH-Nepal also runs a national scale implementation of CHT. [A]
5. *Did you coin "Runtime AI" and "Buildtime AI"?* — I did not coin the terms. I am using the phrase as I like the categories I was able to place the Medic AI goals underneath. I co-authored the strategy and was the lead implementer. [A]
6. *What should an engineer take away from your work?* — The expertise in SRE, the scale of the projects, the expertise in training other individuals across departments, in realizing how ownership and handoffs and maintenance, and reliability intersect. The expertise in Applied AI Engineering lead, of when and how to use AI, and how to make it viable for our partners. [A]
7. *What should a non-engineer take away from your work?* — My ability to work across stakeholders, to author strategies, to win awards, grants, attract funding, and to lead across a variety of perspectives to a unified and identified goal. [A]
