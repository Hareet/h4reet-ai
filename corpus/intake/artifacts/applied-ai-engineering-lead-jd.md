<!-- Source: artifact from the chat "Transitioning SRE role to Applied AI Engineer", drafted with Claude at Hareet's direction. Pasted into the h4reet.ai project 2026-09-14. Describes the ROLE's scope; not a record of verified accomplishments. -->

# Applied AI Engineering Lead

## Role Summary

The Applied AI Engineering Lead bridges the gap between AI research and Medic's production systems. Rather than training foundation models from scratch, this role puts existing models to work — consuming frontier AI as a service and optimizing open models for offline, on-device use — designing, building, scaling, and evaluating the agentic workflows and AI capabilities that make the Community Health Toolkit (CHT) and the teams behind it more capable. The role owns the full arc from high-level ambition ("configuring a CHT application should require no code") to reliable, secure, human-centered AI systems running in production.

This role anchors Medic's commitment to **AI for good**: every AI investment is designed with a human-centered focus and judged by its ability to help community health workers deliver better care, faster.

## Responsibilities

### AI Strategy & Technical Leadership

* Define and evolve the Medic & AI strategy in partnership with leadership, funders, partners, and the CHT community, aligning all stakeholders around a shared, achievable roadmap
* Translate high-level product ambitions — such as no-code CHT configuration — into concrete architectures, milestones, and delivery plans, and guide teams through implementation
* Organize and lead cross-functional teams delivering AI initiatives from proof of concept to production, as demonstrated by the cht-agent multi-agent system
* Own model, framework, and build-vs-buy decisions (foundation model APIs, orchestration frameworks, MCP integrations), balancing capability, cost, security, and long-term sustainability
* Champion a human-centered AI standard across the organization: AI augments community health workers and the people who support them, with humans in the loop for consequential decisions

### Applied AI Systems Development

* Design, build, and operate production-grade agentic workflows on foundation-model APIs (Anthropic, Amazon Bedrock) — consuming AI as a service rather than training models
* Deliver multi-agent systems end to end: architecture, orchestration, tool use, context and memory management, and human validation checkpoints (cht-agent, from PoC through production)
* Build internal applied AI systems that remove operational toil and accelerate engineering and program workflows (claude-medic-aws)
* Develop retrieval and knowledge-corpus pipelines that ground model outputs in CHT documentation, clinical guidelines, and expert-built configurations
* Engineer prompts, context, and structured outputs for reliability, and continuously optimize latency and token spend across AI features
* Research, evaluate, and optimize offline models for on-device use — applying quantization and model compression so speech and small language models run within the latency and memory budgets of low-resource smartphones — powering capabilities like Voice to CHT for health workers in low- and no-connectivity settings
* Produce, maintain, and contribute to the main CHT open-source codebase, evolving it so agentic best practices can take root: agent-ready documentation and repository standards, automated review harnesses, and AI-assisted contribution workflows

### AI Reliability, Evaluation & Operational Excellence

* Establish evaluation frameworks and benchmarks that gate what ships — measuring model output against expert-built baselines and catching known AI failure modes before they reach users
* Apply SRE discipline to AI systems: observability and tracing for agent behavior, monitoring for drift and regression, and SLOs for AI-powered features
* Design guardrails and security controls that protect community health data and prevent unsafe or out-of-scope agent actions
* Build automated deployment pipelines and infrastructure-as-code for AI services on AWS (Bedrock, API Gateway, Lambda, S3, SQS)
* Conduct post-incident and failure-mode reviews for AI systems and share learnings openly across the organization and community

### Community Capacity Building & Responsible AI

* Develop technical documentation, troubleshooting guides, and reference implementations that enable the CHT community to build responsibly with AI
* Lead workshops, office hours, and design reviews on applied AI topics, and mentor contributors on agentic development practices
* Oversee AI-related community contributions through thorough code and design reviews
* Establish and document responsible-AI operating procedures: human-in-the-loop validation, transparency about AI involvement, and equity considerations for low-connectivity, low-resource settings
* Contribute learnings, tooling, and standards back to the open-source ecosystem, positioning Medic as a reference implementation for human-centered AI in global health
