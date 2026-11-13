# Scripts for the films (for the Author's review)

Same language as `kill-switch-b2`: the claims line opens, B's kinetic shots cut on words, the flat circuit with calls flowing, the end card. Each paragraph below is one sentence group the voice reads; the source of every claim is under it. The Author's own words are quoted, never paraphrased. No pronoun for the Author: "Hareet". Numbers are spelled out for the voice; the screen shows them as figures.

What to check: anything about Hareet's work (marked **about you**), and anything that reads as a promise.

---

## 1. A real-time cost meter (`films/cost-meter`)

1. Every answer the twin gives has a price, and you can watch it.
2. In the room, a neon sign shows what each call cost, to the millionth of a dollar. It reads the gateway's own reply, not a dashboard.
   - The sign: `apps/web/src/room/faces/neon.ts`, `signals/turn-cost.ts` (six decimals, `$0.000000`); its labels "this call" / "this visit" are spec 014's; "The counters aren't Langfuse's numbers" (`specs/004-room-composition/intent.md:170`).
3. Every model call goes through the gateway, and every call carries four things: the provider, the model, the tokens, and the cost.
   - `CLAUDE.md` conventions; constitution V (`.specify/memory/constitution.md:23`); span attributes in `services/gateway/src/core/gateway.ts:167-210`.
4. Local answers cost nothing. The paid fallback is Claude Haiku: ten cents per million tokens in, fifty cents out.
   - `config/prices.yaml:65-74` (version 2026-11-09.1); `local` is 0/0.
5. Why Haiku? In Hareet's words: "we chose haiku since our context base is small and manually evaluated haiku and sonnet."
   - **about you**: your words in this session, 2026-11-10. The repo records no comparison, so the film quotes you and adds nothing.
6. Money is counted in whole micro-dollars, never a float, in the gateway's own database.
   - ADR 0020 (`docs/adr/0020-gateway-state-store-and-meter.md:20`).
7. Every call is also traced in Langfuse, which runs inside the stack.
   - `deploy/compose.yaml:508-681`; ADR 0004.
8. And it's locked down: no route out, sign-up switched off, its own telemetry off, and no prompts or answers kept, unless sampling is switched on in development.
   - `internal` network (no route out), `AUTH_DISABLE_SIGNUP`, `TELEMETRY_ENABLED: "false"` (`deploy/compose.yaml`); payload stripping (`deploy/otel/collector.yaml:60-68`); "payload sampling is dev only" (`services/gateway/src/config/validate-env.ts:89-93`).
9. Grafana puts spend beside latency and errors: today, this month, and the fallback's own budget.
   - Constitution V; `deploy/grafana/dashboards/h4-runtime.json` ("Spend today", "Spend month-to-date", "Fallback sub-budget remaining").
10. Why measure all of it? Because the meter is the control. Cloud billing alerts lag by hours; this one decides in real time.
    - Constitution: "The application's own real-time meter is the enforcement point — cloud billing alerts lag by hours and are the safety net, not the control."
11. A full evaluation run, a hundred and eighty-six cases on Haiku, cost about twenty-one cents.
    - `evals/product/history/2026-11-10T063144Z-anthropic.json`: 209,331 µUSD.
12. A real-time cost meter. Built in the open, at hareet dot A I.

## 2. Every data flow disclosed (`films/data-flows`)

1. Every byte that leaves this stack is written down before it can leave.
2. The data-flow disclosure lists each flow: where it goes, what it carries, what it never carries, and how to switch it off.
   - `docs/data-flow-disclosure.md` (its columns).
3. And the build enforces it: a service without a row is refused.
   - "`make policy` (`tools/gates/compose_policy.py`) refuses a service whose name no row's **From** gives".
4. When you talk to the twin, what leaves your device? Your typed words, the last few turns, and the address and browser every request carries.
   - Row V2, Carries.
5. Never audio, the avatar, a cookie, or any identifier of the visit or the visitor. And in production, no one's words land in any log, trace, or store.
   - Row V2, Never carries.
6. When the paid fallback answers, your words go to Anthropic. In Hareet's words: this site saves none of it, and Anthropic may keep a turn it answered for up to thirty days, never for training.
   - Row F3, the Author's wording of 2026-11-09 (on screen as written: "up to 30 days").
7. Then, what the twin says back. It answers only from what Hareet wrote, and when that doesn't hold the answer, it says: "I don't know yet."
   - `corpus/README.md:3`; `config/twin/prompt.md:9`.
8. Before any word leaves the gateway, code checks the answer against its sources: numbers, amounts, ownership, privacy. A failed check withholds the answer.
   - `services/gateway/src/twin/guards.ts:1-2`; spec 007 FR-021.
9. And every change is tested: a hundred and eighty-six cases drawn from the corpus, graded by code, never by another model.
   - `evals/run.py:21`; `evals/product/cases`.
10. Every data flow disclosed. Built in the open, at hareet dot A I.

## 3. The evals (`films/evals`)

1. How do you know an AI twin isn't making things up? You test it, every time it changes.
2. Every case comes from the corpus. Golden questions name the facts an answer must carry. Gap questions have one right answer: "I don't know."
   - 138 golden, 48 gap (`evals/product/cases`, generated by `npm run twin:pack`).
3. Each question is asked twice, the way an engineer would ask it and the way anyone else would: a hundred and eighty-six cases, across nine topics.
   - 93 engineer, 93 non-engineer; nine topic files.
4. No model grades another. The checks are code: what an answer must contain, and what it must never claim.
   - `evals/run.py:21` ("Scoring is deterministic: no model judges another."); `contains` / `not_contains`.
5. In production, the same discipline runs on every answer. Guards in the gateway check numbers, amounts, ownership, and privacy. A failed guard withholds the answer; a guard that can't run fails closed.
   - `services/gateway/src/twin/guards.ts`; spec 007 FR-021.
6. Then the red team attacks: sixty-eight cases. Does it claim to be human? Does it say where Hareet lives? Does it follow an instruction hidden in a question? The latest run on each route passed forty-eight of forty-eight: the local model, Bedrock, and Anthropic.
   - Review of 2026-11-11: "every live run" was too strong (two untracked Bedrock runs in the Author's checkout failed); the latest committed run on each route passed 48/48. `redteam/cases` (68); detectors in `redteam/run.py:267-299` ("claims to be human", "locates the Author", "follows an injected instruction"); `redteam/history` (48/48 each).
7. The latest product runs: the local model passed a hundred and forty-six of a hundred and eighty-six; Bedrock, a hundred and fifty-five; Anthropic, a hundred and fifty-six.
   - `evals/product/history` (2026-11-09 local and Bedrock, 2026-11-10 Anthropic).
8. Every miss becomes a fix. When the local model leaked its source tags, a filter was added. When a check misread a correct refusal to "are you Hareet?", the guard was widened.
   - Plan 007 decisions D40 and D37 (`specs/007-twin-conversation/plan.md:506, 509`); D37: Bedrock's run "failed `twin-are-you-hareet` on a correct refusal" the detector misread.
9. And readiness is locked to a hash: change the prompt or the corpus, and a topic closes until the evals pass again.
   - Spec 007 SC-009; readiness commits `e324771e`, `d0fac811`.
10. Tested every time it changes. Built in the open, at hareet dot A I.

## 4. Local models first (`films/local-first`)

1. The whole production stack runs on one laptop, with one command.
   - Constitution: "the entire production topology MUST be runnable on it, calling local models, with one command."
2. Make up starts fifteen containers: the edge, the gateway, the site, the meter's database, the model server, and the tools that watch them, from metrics and logs to Grafana and Langfuse.
   - `deploy/compose.yaml`: prod's fifteen (edge, gateway, web, gateway-state, model-server-gpu, otel-collector, prometheus, loki, grafana, langfuse-web, langfuse-worker, langfuse-db, clickhouse, valkey, seaweedfs), every name on screen; the dev receivers and the breach probe aren't prod's.
3. The model server is llama dot cpp on the laptop's GPU, running Qwen3, thirty billion parameters, in twenty-one of the card's twenty-four gigabytes.
   - ADR 0019 ("21,229 MiB used of 24,463 MiB"); `deploy/models.lock` (Qwen3-30B-A3B-Instruct-2507, Q4_K_M).
4. Every question tries it first. A local answer costs nothing, and nothing leaves the machine.
   - `config/routing.yaml`; ADR 0001; disclosure row S4 ("nothing leaves the local tier").
5. Only when it's down does the capped paid fallback answer. On the cloud server, which has no GPU, the Anthropic API answers first.
   - ADR 0001 (order); ADR 0044 (EC2: "the Anthropic API answers first").
6. This is production, not a demo: every image pinned by its digest, and one build at one commit, the same image everywhere.
   - `deploy/images.lock:24-27`; `deploy/scripts/gateway_image.py:14`.
7. Offline-first isn't new for Hareet. At Medic, the community health workers using the Community Health Toolkit had older Android phones, and mostly no network.
   - **about you**: `corpus/05-mission.md:23` (the Author's words).
8. So Hareet designed Voice for CHT: the health worker speaks the visit, and the form fills itself, offline. Hareet helped the team fine-tune its models to two hundred seventy-three megabytes, to run beside the app on a four-gigabyte phone. No audio or transcript leaves the phone as telemetry.
   - **about you**: `corpus/01-ai-strategy-and-cht.md:15, 108-111`; `corpus/facts/voice-for-cht.yaml` (273 MB, 4 GB, the Author's, 2026-10-28/29).
9. At denverlocal dot A I, the same idea serves small Denver teams: private AI, with sensitive files kept on hardware they own.
   - **about you**: `corpus/07-denver-local-ai.md:9` (resume words).
10. Local models first. Built in the open, at hareet dot A I.

---

## 5. The stack, container by container (`films/stack`)

About 2½ minutes. Grouped as the stack is: the door, the brain, the model, the eyes, the traces. Research: compose comments, ADRs 0004/0005/0019/0020/0021/0022, `specs/000-local-foundations/plan.md` §19 (the failure table), `docs/runbooks/`, `config/alerts.yaml`, `deploy/grafana/dashboards/h4-runtime.json`.

1. Fifteen containers run hareet.ai in production. Here's what each one does, why it's there, and what happens when it fails.
   - prod's fifteen (`deploy/compose.yaml`, `COMPOSE_PROFILES=gpu`).
2. The edge is the only door: nginx, unprivileged, listening on six ports, all on the machine's own loopback address. If it fails, nothing can reach the stack, but the stack keeps running, and the meter keeps its state.
   - `compose.yaml:76-92`; `deploy/edge/nginx.conf:4-10`; plan §19 and ADR 0021 ("Nothing is reachable from the host. The stack keeps running, and the meter keeps state").
3. Behind it, web serves the room. If web is down, the edge answers with its own page: "The room is unavailable right now."
   - `compose.yaml:209-214`; `deploy/edge/nginx.conf:344`.
4. The gateway is the brain: routing, the meter, the kill switch, and every alert. It's the only container with a road out. If it fails, the edge answers "unavailable", nothing is spent, and alerts wait in the outbox until it's back.
   - `compose.yaml:112-122`; `nginx.conf:103-112` (`api_unavailable`); `docs/runbooks/gateway-down.md` ("Nothing answers, and nothing is spent").
5. Gateway-state is the gateway's own database: the meter, the switch, the ledger, the audit log. If it can't be reached, every request fails closed at once, and after sixty seconds, one alert goes out.
   - `compose.yaml:234-235`; ADR 0020:39 (fail closed at once; one deduplicated alert after 60 s); `config/alerts.yaml:15`; `docs/runbooks/store-unreachable.md`.
6. The model server is llama dot cpp, on the GPU. Nothing waits on it. If it's down, the gateway notices within a second and answers from the capped paid fallback; if that's down too, the answer is the degraded line, and an alert says so.
   - `compose.yaml:262-267`; `config/routing.yaml:23` (probe every 1000 ms); ADR 0001; `docs/runbooks/model-server-down.md`; alert `fallback_unavailable`.
7. Then the eyes. The OpenTelemetry collector strips prompts and answers out of the telemetry, then sends metrics to Prometheus, logs to Loki, and traces to Langfuse. If it fails, exports stop, a freshness panel shows how stale the data is, and enforcement never notices.
   - `compose.yaml:364-367`; `deploy/otel/collector.yaml`; plan §19 ("Telemetry exports fail. The freshness panel shows how stale the data is. Enforcement is unaffected").
8. Prometheus keeps thirty days of metrics, Loki thirty days of the gateway's logs, and Grafana draws them on one read-only dashboard.
   - `compose.yaml:391-405, 441-467`; `deploy/loki/loki.yaml:37` (720 h).
9. The alerts that guard the budget are the gateway's job, on Telegram first, then email, and they never wait on a dashboard. And every day, a summary reports the CPU metrics, with alerts based on them too.
   - ADR 0004, ADR 0005; `config/alerts.yaml`. The daily CPU summary and its alerts: the Author, 2026-11-10, in this session: "We will get a daily summary on cpu metrics and alerts based off those too. That will be set up by the time someone is viewing this video, so should add it now." Not in the repository yet; the film shows it as the Author describes it.
10. Langfuse keeps the traces, and it takes six containers: its web app and a worker, its own Postgres, ClickHouse for the traces, Valkey for the queue, and SeaweedFS for storage.
    - `compose.yaml:504-681`; ADR 0004, ADR 0022.
11. If any of them fails, traces arrive late, or are dropped after ten minutes of retries, and a panel counts the drops. The twin keeps answering.
    - `collector.yaml:209-225` ("holds about 10 minutes"); plan §19; panels "Export failures", "Dropped at the queue".
12. Every container runs with no new privileges, on a network with no route out. Only the edge listens, and only the gateway leaves. And every alert names its runbook: what you see, what it means, what to do, how to check, how to undo, and what to record.
    - `compose.yaml:8-9, 20-30, 814-823`; `docs/runbooks/README.md` (Symptoms · Impact · Act · Verify · Undo · Record).
13. Fifteen containers, one command. Built in the open, at hareet dot A I.

## 6. How it's built (`films/lifecycle`)

About 2½ minutes. Research: `CLAUDE.md`, the constitution, `docs/how-we-build/lifecycle.md`, `intent/README.md`, `.claude/agents/*.md`, `REVIEW.md`, `docs/incidents/README.md`, `services/gateway/src/incidents/draft.ts`, `tools/gates/gate`, ADRs 0006/0012/0013/0015/0016/0017/0034, spec 001 (approved 2026-11-10, on its branches) for deploy.

1. Every change to hareet.ai starts as a sentence, and ends with a person's merge.
   - Constitution III ("only a human merges to `main`").
2. First, the intent: what's wanted, and why, in the words of whoever wants it. The Author accepts it or closes it, and the survival rate is published.
   - `intent/README.md:3-8` ("Survival rate is a metric we publish").
3. A spec-writer agent turns it into a spec, with acceptance criteria a test can check. Its questions go to the Author, and the answers are kept word for word.
   - `.claude/agents/spec-writer.md`; each spec's Clarifications.
4. Then the plan: the files, the order, the risks, the cost, and what happens when it degrades. It's approved before any code exists.
   - `docs/how-we-build/lifecycle.md`; ADR 0006.
5. Then the tasks, and a read-only check that the spec, the plan, and the tasks agree.
   - `/speckit-tasks`, `/speckit-analyze` (ADR 0012).
6. An implementer agent builds it on a feature branch, task by task, with tests. And every new feature brings its own telemetry, a dashboard panel, a cost estimate, its degraded behavior, and a disclosure row if a byte leaves your device.
   - `.claude/agents/implementer.md`; `CLAUDE.md:26`; constitution ("A feature without a graph is not done").
7. A reviewer agent, read-only, and never the one that wrote it, checks the change for bugs, security, compliance, and cost. Its findings inform the merge; they never replace it.
   - `.claude/agents/reviewer.md`; `REVIEW.md`; constitution line 43.
8. Changing a feature works the same way. A newer spec names each clause it amends, and when the code departs from the plan, the plan is corrected in the same commit.
   - e.g. spec 009's "Amendments" table; each plan's "Departures" (`CLAUDE.md:8`).
9. A bug starts as a failing test. During a fix, a hook stops the agent from editing tests: fix the code, not the test.
   - `CLAUDE.md:44`; `.claude/hooks/protected-paths.sh:65-67`.
10. An incident gets a note within seven days, with the eval that would have caught it. When the kill switch trips, the gateway drafts that incident itself, from a template, with no model call.
    - Constitution line 47; `docs/incidents/README.md:3`; `services/gateway/src/incidents/draft.ts:1-12` ("a breach is the worst moment to spend").
11. Before the Author merges, a clean-room gate runs every check on an export of the branch, with the network cut off, so nothing an agent left behind can run.
    - `tools/gates/gate`; ADR 0017.
12. The agents work in a sandbox, on their own container engine, behind hooks that refuse pushing, merging, applying infrastructure, editing budgets, or reading secrets. Hundreds of forbidden actions are tested on every run.
    - `.claude/hooks/bash-gate.sh`, `protected-paths.sh`; ADR 0015/0016; `redteam/forbidden-actions.sh`; its recorded run of 2026-11-08: "forbidden-actions (hook layer): 802 passed, 0 failed, 52 known gaps" (`docs/merge-requests/2026-11-08-fix-007-live-runs.md:2679`). The earlier "345" didn't hold up: `matrix-required.txt` lists 286 row IDs, and the block-row count depends on the rule.
13. Deploys only pull: the same images, by digest, from a release made from main, and rolled back if the health checks fail.
    - Spec 001 (approved 2026-11-10, on `feat/001-*`): FR-046, FR-047, FR-048. Not built on main yet; the film shows it as specced.
14. The agents type. The Author decides. Built in the open, at hareet dot A I.
