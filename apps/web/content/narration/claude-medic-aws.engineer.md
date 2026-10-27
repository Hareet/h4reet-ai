---
item: claude-medic-aws
path: engineer
claims:
  - file: corpus/00-profile.md
    quote: "and designed claude-medic-aws, the infrastructure agent"
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "Designed by Hareet: Medic's infrastructure agent and the team's on-call engineer, built security-first for a non-technical user base"
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "It reports, alerts, analyzes, and suggests how the EKS clusters, AWS resources, and Grafana intersect"
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "After agent-watchdog posts its brief, claude-medic-aws correlates performance changes with cluster modifications and AWS resource changes and suggests the infrastructure cause"
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "agent-watchdog flagged three projects with degraded API performance"
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "claude-medic-aws correlated the degradation to one specific EKS node and flagged the command to roll it over"
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "Read-only today; one step away from being trusted with production changes"
slots: []
---

Hareet designed claude-medic-aws, Medic's infrastructure agent and the team's on-call engineer, security-first for a non-technical user base. It reports, alerts, analyzes, and suggests how the EKS clusters, AWS resources, and Grafana intersect. After agent-watchdog posts its brief, claude-medic-aws correlates performance changes with cluster modifications and AWS resource changes and suggests the infrastructure cause. When agent-watchdog flagged projects with degraded API performance, claude-medic-aws correlated the degradation to a specific EKS node and flagged the command to roll it over. It is read-only today; one step away from being trusted with production changes.
