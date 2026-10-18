---
item: agent-watchdog
path: non-engineer
claims:
  - file: corpus/00-profile.md
    quote: "He built agent-watchdog, Medic's newest agent in production"
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "a daily analysis of the CHT projects monitored by Medic's hosted CHT Watchdog, posted to Slack as a short brief that flags what a human should look into"
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "It flags and never acts"
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "agent-watchdog flagged three projects with degraded API performance"
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "claude-medic-aws correlated the degradation to one specific EKS node"
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "The usual thresholds would have waited for more projects to degrade"
slots: []
---

Hareet built agent-watchdog, Medic's newest agent in production. It makes a daily analysis of the CHT projects monitored by Medic's hosted CHT Watchdog, posted to Slack as a short brief that flags what a human should look into. It flags and never acts. It has caught something real: it flagged projects with degraded API performance, and claude-medic-aws correlated the degradation to a specific EKS node. The usual thresholds would have waited for more projects to degrade.
