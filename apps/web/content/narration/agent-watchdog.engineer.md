---
item: agent-watchdog
path: engineer
claims:
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "Built by Hareet and released to production; the newest agent Medic runs"
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "a daily analysis of the CHT projects"
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "It reads metrics through Grafana, computes changes deterministically, and gives a bounded Claude Agent SDK session read-only tools to interpret them; every number, date, and link is verified in code before anything posts"
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "what the agent learns arrives as proposal files for human review, never as changes to its own prompts, skills, or thresholds"
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "It flags and never acts"
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "How it's built: spec-first"
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "dry-run without posting, or replay stored runs against changed prompts"
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "a hardened container (non-root, read-only root filesystem, no capabilities)"
slots: []
---

Hareet built agent-watchdog and released it to production; it is the newest agent Medic runs. It makes a daily analysis of the CHT projects Medic's hosted CHT Watchdog monitors: it reads metrics through Grafana, computes changes deterministically, and gives a bounded Claude Agent SDK session read-only tools to interpret them; every number, date, and link is verified in code before anything posts. What the agent learns arrives as proposal files for human review, never as changes to its own prompts, skills, or thresholds. It flags and never acts. It is built spec-first, as a staged pipeline that can dry-run without posting or replay stored runs against changed prompts, in a hardened container.
