# hareet.ai — the AI twin, built in the open
Priority: 7 (after Denver Local AI; his, confirmed 2026-11-06) · Status: draft for Hareet's read, with his Golden Q&A interview of 2026-11-06 · Last verified: 2026-11-06

Tags as defined in `01-ai-strategy-and-cht.md`. Drafted from his resume and his answers of 2026-10-28 and 2026-10-29; the numbers are in `facts/hareet-ai.yaml`. His Golden Q&A interview of 2026-11-06 is his statement to this project: he ran it in a separate chat, from this project's prompt, and pasted it into this project's session that day, so its lines carry `[A 2026-11-06]`. The document is filed as he pasted it in `intake/interview-2026-11-06-denver-local-ai-hareet-ai.md`, and he approved each Golden Q&A below. In Golden Q&A 3, "or the room doesn't know the live state yet" is this project's session's wording, which he approved in the session that day ("works fine"), since an unplugged laptop can also mean the room doesn't know the live state. His words are quoted exactly, with spelling fixed at his request. The sections from *The kill switch* to *What the corpus doesn't hold yet*, the Golden Q&A after the eighth, and the "Do not claim" lines after the first come from the scripts of the project's explainer films (`films/SCRIPTS.md`, `films/kill-switch-b2/script.txt`), each line with the repository file under it; `proposals/film-scripts-2026-11-14.md` traces each one.

## Role at a glance

- `[A 2026-10-29]` In his words: "Come talk to my AI twin about my work and my life. It's built in the open, so you can see how I build AI that is secure, cost-effective, and observable."
- `[A 2026-10-29]` In his words: "An AI twin of me, built in the open: local models first, a capped cloud fallback, a real-time cost meter, and a {{slot:site.kill_switch_daily}}-a-day kill switch. AI agents in named roles do most of the typing, and only I merge."
- `[A 2026-10-29]` On the hareet.ai version of his resume: local models first; a real-time cost meter; a {{slot:site.kill_switch_daily}}-a-day kill switch; every data flow disclosed.

## How it's built `[A 2026-11-06]`

- `[A 2026-11-06]` What he adds when a visitor asks how it's built, in his words: "And share the GitHub repo: https://github.com/hareet/h4reet-ai . We want to add that it had the perspective of production-grade Applied AI and SRE perspectives, with observability, cost, and security at top of mind throughout the development and production lifecycle."
- `[A 2026-11-06]` Which laptop the room shows, in his words: "the laptop in the room is my own, as in when it's plugged in, it will be running on my own laptop from my actual work desk which is seen in the room".
- `[A 2026-11-06]` What happens to what visitors say, in his words: "We disclose every data flow, their conversation is not saved and they can look at the GitHub repo for how all the code works. We come from a background of open source, public software."
- `[A 2026-11-06]` Asked whether his Langfuse setup keeps the conversation text, or only cost and usage, in his words: "Only costs and usage, and say we use Masking."

## The kill switch

- `[P]` Every question falls through the same layers, and the gateway reads the kill switch first; if it can't read it, it assumes the worst. — https://github.com/hareet/h4reet-ai/blob/main/services/gateway/src/core/gateway.ts
- `[P]` Local answers cost nothing. Paid ones are metered in the gateway's own database. — https://github.com/hareet/h4reet-ai/blob/main/docs/adr/0020-gateway-state-store-and-meter.md
- `[P]` Every answer the twin gives can cost money, so the site has a daily ceiling of {{slot:site.kill_switch_daily}}. Before spend reaches it, a warning goes out on Telegram and email; when spend reaches it, the site stops itself. — https://github.com/hareet/h4reet-ai/blob/main/config/budgets.yaml
- `[P]` One transaction sets the switch, opens an incident, and queues the alert. Every request after that gets one line, local answers included: "The twin can't talk right now. Today's budget for its answers is used." — https://github.com/hareet/h4reet-ai/blob/main/apps/web/content/messages.yaml
- `[P]` A new day doesn't bring it back. Only an operator reset does: a person, with a reason, in the audit log. — https://github.com/hareet/h4reet-ai/blob/main/.specify/memory/constitution.md
- `[P]` The breach test trips it on purpose. — https://github.com/hareet/h4reet-ai/blob/main/docs/merge-requests/2026-10-09-feat-000-us2-kill-switch.md
- `[P]` The agents that write the code are fenced in too: the one that writes never reviews, and none can touch the budgets or the switch, push, merge, or apply. — https://github.com/hareet/h4reet-ai/tree/main/.claude/agents

## The cost meter

- `[P]` Every answer the twin gives has a price, and a visitor can watch it: in the room, a neon sign shows what each call cost. It reads the gateway's own reply, not a dashboard. — https://github.com/hareet/h4reet-ai/blob/main/apps/web/src/room/faces/neon.ts
- `[P]` Every model call goes through the gateway, and every call carries the provider, the model, the tokens, and the cost. — https://github.com/hareet/h4reet-ai/blob/main/services/gateway/src/core/gateway.ts
- `[P]` Local answers cost nothing. The paid fallback is Claude Haiku. — https://github.com/hareet/h4reet-ai/blob/main/config/prices.yaml
- `[A 2026-11-10]` Why Haiku, in his words: "we chose haiku since our context base is small and manually evaluated haiku and sonnet."
- `[P]` Money is counted as a whole number, never a float, in the gateway's own database. — https://github.com/hareet/h4reet-ai/blob/main/docs/adr/0020-gateway-state-store-and-meter.md
- `[P]` Every call is also traced in Langfuse, which runs inside the stack, locked down: no route out, sign-up switched off, its own telemetry off, and no prompts or answers kept, unless sampling is switched on in development. — https://github.com/hareet/h4reet-ai/blob/main/deploy/compose.yaml
- `[P]` Grafana puts spend beside latency and errors: today, this month, and the fallback's own budget. — https://github.com/hareet/h4reet-ai/blob/main/deploy/grafana/dashboards/h4-runtime.json
- `[P]` The meter is the control: cloud billing alerts lag by hours, and this one decides in real time. — https://github.com/hareet/h4reet-ai/blob/main/.specify/memory/constitution.md

## Every data flow disclosed

- `[P]` Every byte that leaves the stack is written down before it can leave: the data-flow disclosure lists each flow, where it goes, what it carries, what it never carries, and how to switch it off. — https://github.com/hareet/h4reet-ai/blob/main/docs/data-flow-disclosure.md
- `[P]` The build enforces it: a service without a row is refused. — https://github.com/hareet/h4reet-ai/blob/main/tools/gates/compose_policy.py
- `[P]` When a visitor talks to the twin, what leaves their device is their typed words, the last few turns, and the address and browser every request carries; never audio, the avatar, a cookie, or any identifier of the visit or the visitor. In production, no one's words land in any log, trace, or store. — https://github.com/hareet/h4reet-ai/blob/main/docs/data-flow-disclosure.md
- `[P]` When the paid fallback answers, the visitor's words go to Anthropic; on the cloud server, the Anthropic API answers first. — https://github.com/hareet/h4reet-ai/blob/main/docs/data-flow-disclosure.md
- `[P]` The twin answers only from the corpus Hareet approves, and when that doesn't hold the answer, it says "I don't know yet." — https://github.com/hareet/h4reet-ai/blob/main/config/twin/prompt.md
- `[P]` Before any word leaves the gateway, code checks the answer against its sources: numbers, amounts, ownership, privacy. A failed check withholds the answer. — https://github.com/hareet/h4reet-ai/blob/main/services/gateway/src/twin/guards.ts

## Tested every time it changes

- `[P]` The twin is tested every time it changes, and every case comes from the corpus: golden questions name the facts an answer must carry, and gap questions have one right answer, that the twin doesn't know. — https://github.com/hareet/h4reet-ai/blob/main/apps/web/build/twin-pack.ts
- `[P]` Each question is asked twice: the way an engineer would ask it, and the way anyone else would. — https://github.com/hareet/h4reet-ai/blob/main/apps/web/build/twin-pack.ts
- `[P]` No model grades another. The checks are code: what an answer must contain, and what it must never claim. — https://github.com/hareet/h4reet-ai/blob/main/evals/run.py
- `[P]` In production, the same discipline runs on every answer: guards in the gateway check numbers, amounts, ownership, and privacy. A failed guard withholds the answer, and a guard that can't run fails closed. — https://github.com/hareet/h4reet-ai/blob/main/services/gateway/src/twin/guards.ts
- `[P]` Then the red team attacks: does the twin claim to be human, say where Hareet lives, or follow an instruction hidden in a question? — https://github.com/hareet/h4reet-ai/blob/main/redteam/run.py
- `[P]` Every miss becomes a fix: when the local model leaked its source tags, a filter was added, and when a check misread a correct refusal to a question asking whether the twin is Hareet, the guard was widened. — https://github.com/hareet/h4reet-ai/blob/main/specs/007-twin-conversation/plan.md
- `[P]` Readiness is locked to a hash: change the prompt or the corpus, and a topic closes until the evals pass again. — https://github.com/hareet/h4reet-ai/blob/main/config/twin-readiness.yaml

## Local models first

- `[P]` The laptop's production stack (`ENV=prod`, `COMPOSE_PROFILES=gpu`) runs on one laptop, with one command, and starts {{slot:site.prod_containers}}: the edge, the gateway, the site, the meter's database, the model server, and the tools that watch them, from metrics and logs to Grafana and Langfuse. The `tunnel` profile, once added, runs the tunnel beside them. — https://github.com/hareet/h4reet-ai/blob/main/deploy/compose.yaml
- `[P]` Its model server is llama.cpp, on the laptop's GPU. — https://github.com/hareet/h4reet-ai/blob/main/deploy/compose.yaml
- `[P]` On the laptop, every question tries the local model first. A local answer costs nothing, and nothing leaves the machine. — https://github.com/hareet/h4reet-ai/blob/main/config/routing.yaml
- `[P]` Only when it's down does the capped paid fallback answer. On the cloud server, which has no GPU, the Anthropic API answers first. — https://github.com/hareet/h4reet-ai/blob/main/config/routing.yaml
- `[P]` It is production, not a demo: every image is pinned by its digest, and one build at one commit makes the same image everywhere. — https://github.com/hareet/h4reet-ai/blob/main/deploy/images.lock
- Offline-first work before hareet.ai, at Medic, with Voice for CHT, and at Denver Local AI: see `05-mission.md`, `01-ai-strategy-and-cht.md`, and `07-denver-local-ai.md`.

## The stack, container by container

- `[P]` The laptop's production stack is grouped as the door, the brain, the model, the eyes, and the traces; for each container, the design says what it does, why it's there, and what happens when it fails. — https://github.com/hareet/h4reet-ai/blob/main/deploy/compose.yaml
- `[P]` The edge is the only door: nginx, unprivileged, listening only on the machine's own loopback address. If it fails, nothing can reach the stack, but the stack keeps running, and the meter keeps its state. — https://github.com/hareet/h4reet-ai/blob/main/deploy/edge/nginx.conf
- `[P]` Behind it, web serves the room. If web is down, the edge answers with its own page: "The room is unavailable right now." — https://github.com/hareet/h4reet-ai/blob/main/deploy/edge/nginx.conf
- `[P]` The gateway is the brain: routing, the meter, the kill switch, and every alert. If it fails, the edge answers that it's unavailable, nothing is spent, and alerts wait in the outbox until it's back. — https://github.com/hareet/h4reet-ai/blob/main/docs/runbooks/gateway-down.md
- `[P]` Gateway-state is the gateway's own database: the meter, the switch, the ledger, the audit log. If it can't be reached, every request fails closed at once, and one alert goes out if it stays unreachable. — https://github.com/hareet/h4reet-ai/blob/main/docs/runbooks/store-unreachable.md
- `[P]` The model server is llama.cpp, on the GPU, and nothing waits on it. If it's down, the gateway notices within a second and answers from the capped paid fallback; if that's down too, the answer is the degraded line, and an alert says so. — https://github.com/hareet/h4reet-ai/blob/main/docs/runbooks/model-server-down.md
- `[P]` Then the eyes: the OpenTelemetry collector strips prompts and answers out of the telemetry, then sends metrics to Prometheus, logs to Loki, and traces to Langfuse. If it fails, exports stop, a freshness panel shows how stale the data is, and enforcement never notices. — https://github.com/hareet/h4reet-ai/blob/main/deploy/otel/collector.yaml
- `[P]` Prometheus keeps the metrics, Loki the gateway's logs, and Grafana draws them on one read-only dashboard. — https://github.com/hareet/h4reet-ai/blob/main/deploy/grafana/dashboards/h4-runtime.json
- `[P]` The alerts that guard the budget are the gateway's job, on Telegram first, then email, and they never wait on a dashboard. — https://github.com/hareet/h4reet-ai/blob/main/config/alerts.yaml
- `[P]` Langfuse keeps the traces: its web app and a worker, its own Postgres, ClickHouse for the traces, Valkey for the queue, and SeaweedFS for storage. — https://github.com/hareet/h4reet-ai/blob/main/deploy/compose.yaml
- `[P]` If any of them fails, traces arrive late or are dropped after retries, and a panel counts the drops. The twin keeps answering. — https://github.com/hareet/h4reet-ai/blob/main/deploy/otel/collector.yaml
- `[P]` Every container runs with no new privileges, and only the edge listens. — https://github.com/hareet/h4reet-ai/blob/main/deploy/compose.yaml
- `[P]` Every alert names its runbook: what you see, what it means, what to do, how to check, how to undo, and what to record. — https://github.com/hareet/h4reet-ai/blob/main/docs/runbooks/README.md

## How a change is made

- `[P]` Every change to hareet.ai starts as a sentence and ends with a person's merge. — https://github.com/hareet/h4reet-ai/blob/main/.specify/memory/constitution.md
- `[P]` First, the intent: what's wanted, and why, in the words of whoever wants it. Hareet accepts it or closes it, and the survival rate is published. — https://github.com/hareet/h4reet-ai/blob/main/intent/README.md
- `[P]` A spec-writer agent turns it into a spec, with acceptance criteria a test can check; its questions go to Hareet, and his answers are kept word for word. — https://github.com/hareet/h4reet-ai/blob/main/.claude/agents/spec-writer.md
- `[P]` Then the plan: the files, the order, the risks, the cost, and what happens when it degrades. It's approved before any code exists. — https://github.com/hareet/h4reet-ai/blob/main/docs/how-we-build/lifecycle.md
- `[P]` Then the tasks, and a read-only check that the spec, the plan, and the tasks agree. — https://github.com/hareet/h4reet-ai/blob/main/docs/how-we-build/lifecycle.md
- `[P]` An implementer agent writes it on a feature branch, task by task, with tests, and every new feature brings its own telemetry, a dashboard panel, a cost estimate, its degraded behavior, and a disclosure row if a byte leaves a visitor's device. — https://github.com/hareet/h4reet-ai/blob/main/.claude/agents/implementer.md
- `[P]` A reviewer agent, read-only and never the one that wrote the change, checks it for bugs, security, compliance, and cost. Its findings inform the merge; they never replace it. — https://github.com/hareet/h4reet-ai/blob/main/REVIEW.md
- `[P]` Changing a feature works the same way: a newer spec names each clause it amends, and when the code departs from the plan, the plan is corrected in the same commit. — https://github.com/hareet/h4reet-ai/blob/main/CLAUDE.md
- `[P]` A bug starts as a failing test. During a fix, a hook stops the agent from editing tests: fix the code, not the test. — https://github.com/hareet/h4reet-ai/blob/main/.claude/hooks/protected-paths.sh
- `[P]` An incident gets a note, with the eval that would have caught it. When the kill switch trips, the gateway drafts that incident itself, from a template, with no model call. — https://github.com/hareet/h4reet-ai/blob/main/services/gateway/src/incidents/draft.ts
- `[P]` Before Hareet merges, a clean-room gate runs every check on an export of the branch, with the network cut off, so nothing an agent left behind can run. — https://github.com/hareet/h4reet-ai/blob/main/tools/gates/gate
- `[P]` The agents work in a sandbox, on their own container engine, behind hooks that refuse pushing, merging, applying infrastructure, editing budgets, or reading secrets. — https://github.com/hareet/h4reet-ai/blob/main/.claude/hooks/bash-gate.sh

## What the corpus doesn't hold yet

- `[?]` A daily summary of the stack's CPU metrics, with alerts based on them.
- `[?]` Deploys that only pull a released image, and roll back when the health checks fail.
- `[?]` How many forbidden actions the agents' hooks are tested against, and the latest tally.
- `[?]` The latest pass rates of the product evaluations and of the red team, on each route.
- `[?]` What an evaluation run costs.
- `[?]` How many product evaluation cases there are, how many topics they cover, and how they split between golden and gap.
- `[?]` How many red-team cases there are.
- `[?]` The breach test's latest results.

## Public artifacts

- hareet.ai, once spec 001 publishes it.
- `[A 2026-11-06]` The repository, https://github.com/hareet/h4reet-ai. It isn't public yet; in his words: "the repo will be public very soon. Just give the link and talk about it."

## Do not claim

- Any spend, traffic, or cost figure for the site that isn't in a filled slot.
- That this site keeps the conversations the paid fallback answers.
- That the evals are graded by a model.
- That the twin is a demo.
- That the meter's figures are the cloud provider's bill.
- That Hareet wrote the code alone.

## Golden Q&A

1. *What can I ask you about?* — Come talk to my AI twin about my work and my life. It's built in the open, so you can see how I build AI that is secure, cost-effective, and observable. [A]
2. *How is this built?* — An AI twin of me, built in the open: local models first, a capped cloud fallback, a real-time cost meter, and a daily kill switch. AI agents in named roles do most of the typing, and only I merge. It had the perspective of production-grade Applied AI and SRE perspectives, with observability, cost, and security at top of mind throughout the development and production lifecycle. Here's the GitHub repo: https://github.com/hareet/h4reet-ai [A]
3. *What features should I know about?* — The Langfuse cost-meter and how it shows observability. If the laptop is plugged in, that means we are using local models and everything is running on my laptop. Otherwise we have failed over to a cloud solution, or the room doesn't know the live state yet, and the kill switch to ensure we are cost monitoring and effective. Alongside how we make sure the AI twin is secure from common bad use cases, how we developed the twin in the open and to have best agentic security practices. [A]
4. *Who writes the code?* — AI agents in named roles do most of the typing, and only I merge. [A]
5. *What happens to what I say here?* — We disclose every data flow, your conversation is not saved and you can look at the GitHub repo for how all the code works. Langfuse keeps only costs and usage, and we use Masking. We come from a background of open source, public software. "this site saves none of it, and Anthropic may keep a turn it answered for up to 30 days, never for training" [A][A 2026-11-09]
6. *How much does it cost to run?* — I don't have spend figures in my corpus. This twin runs local models first, with a capped cloud fallback, a real-time cost meter, and a daily kill switch. [?][A]
7. *Why did you build an AI twin?* — To showcase and demonstrate innovative methods I can apply AI alongside my SRE background. I'm always using AI: everything I build is AI-assisted as if it's part of me. This twin should be a great addition to helping me find the right fit and team. [A]
8. *What can't you answer?* — I answer only from a written corpus that I approve. Anything not in it, I'll tell you I don't know yet. [A]
9. *How does the kill switch stop spending?* — The gateway reads the kill switch first, before any model is called. Before the daily ceiling, a warning goes out on Telegram and email; at the ceiling, one transaction sets the switch, opens an incident, and queues the alert, and every request after that gets one fixed line. A new day doesn't bring it back: only an operator reset does. [P]
10. *How does the cost meter work?* — Every model call goes through the gateway and carries the provider, the model, the tokens, and the cost. Local answers cost nothing. Spend is metered in the gateway's own database, a neon sign in the room shows what each call cost, and Grafana puts spend beside latency and errors. [P]
11. *What leaves my device when I talk to the twin?* — Your typed words, the last few turns, and the address and browser every request carries. Never audio, the avatar, a cookie, or any identifier of you or your visit. Every flow is written down in the data-flow disclosure before it can leave. [P]
12. *How do you know the twin isn't making things up?* — It's tested every time it changes, with cases drawn from the corpus and graded by code, never by another model. In production, guards in the gateway check numbers, amounts, ownership, and privacy, and a failed guard withholds the answer. [P]
13. *Does it run on local models?* — Local models first. On the laptop, every question tries llama.cpp on its GPU, and a local answer costs nothing; only when it's down does the capped paid fallback answer. On the cloud server, which has no GPU, the Anthropic API answers first. [P]
14. *What runs in the stack?* — On the laptop's production stack: the edge, the gateway, the site, the meter's database, the model server, the OpenTelemetry collector, Prometheus, Loki, Grafana, and Langfuse with its own databases. Only the edge listens. [P]
15. *How is a change made?* — It starts as an intent, then a spec, a plan, and tasks, checked against each other before any code exists. An implementer agent writes it with tests, a reviewer agent that didn't write it checks it, and a clean-room gate runs every check. AI agents in named roles do most of the typing, and only I merge. [P][A]
16. *What don't you know about how it's tested?* — I don't know yet how many evaluation cases there are, their latest pass rates, or what a run costs; those change with every run. [?]
17. *What isn't built yet?* — A daily summary of the CPU metrics and deploys that only pull aren't built yet, so I don't know more about them yet. [?]
