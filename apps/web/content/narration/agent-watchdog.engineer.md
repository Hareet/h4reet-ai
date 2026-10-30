---
item: agent-watchdog
path: engineer
claims:
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "Built by Hareet and released to production"
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "Non-sensitive metrics and project API information were constructed to be available at particular endpoints"
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "agent-watchdog monitors all endpoints of URLs (projects) that Medic knows of"
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "There are many community deployments that Medic was not made aware of, and that is an optional service in agent-watchdog: they can either deploy it themselves, or they can notify Medic and set up a particular alert channel or email for the deliverable"
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "It reads metrics through Grafana, computes changes deterministically, and gives a bounded Claude Agent SDK session read-only tools to interpret them; every number, date, and link is verified in code before anything posts"
  - file: corpus/01-ai-strategy-and-cht.md
    quote: "It flags and never acts"
slots: []
---

agent-watchdog was built by Hareet and released to production. Non-sensitive metrics and project API information were constructed to be available at particular endpoints, and agent-watchdog monitors all endpoints of URLs (projects) that Medic knows of. There are many community deployments that Medic was not made aware of; for them, agent-watchdog is an optional service: they can either deploy it themselves, or notify Medic and set up a particular alert channel or email for the deliverable. It reads metrics through Grafana, computes changes deterministically, and gives a bounded Claude Agent SDK session read-only tools to interpret them; every number, date, and link is verified in code before anything posts. It flags and never acts.
