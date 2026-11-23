# h4reet.ai

An AI twin of the Author: an animated character, always disclosed as an AI, that visitors talk to by text or voice about the Author's real work. It is for hiring managers and engineering leads deciding whether to talk to the Author, and for engineers curious how it is made. It is also a worked example of how a small team ships production AI systems with agents in 2026, published with its full history, mistakes included.

> **Status: live at [hareet.ai](https://hareet.ai) since 2026-11-17.** As of 2026-11-23, visitors enter the 3D room, choose an avatar, and talk with the twin by text about the topics the Author has marked ready; voice and open conversation aren't ready yet. EC2, on spot, serves in its scheduled hours (07:00 to 19:00 Mountain time, [ADR 0048](docs/adr/0048-ec2-on-12-hours-a-day.md)) through the tunnel end, with the Anthropic API answering first; the Author's laptop serves local-first when he runs it, for demos. When neither can serve, the twin rests and the site still loads. The release of 2026-11-22 added the resume in the visitor's hand (spec 033), spot with interchangeable instance types (spec 032), and the tunnel end's fixes (spec 001's F9 and F10). Development is still local until the Author publishes ([ADR 0013](docs/adr/0013-local-until-publication.md)), and the history is published from its first commit. [The specs](#specs) say what each built and what is open, each [merge-request note](docs/merge-requests/) what ran and where, [the security posture](docs/security-posture.md) the known gaps, and [the incident notes](docs/incidents/) what went wrong.

> **About the first commits.** An enforcement layer can't gate its own creation, so the scaffold went onto `main` as one labeled bootstrap commit (`bootstrap: …`), followed directly by the constitution 1.0.1 amendment ([ADR 0012](docs/adr/0012-constitution-1-0-1-spec-kit-lifecycle.md)). Every change since then arrives on a feature branch that the Author reviews and merges; `git log --first-parent main` shows the sequence. The first of those branches ran in a session that the repository's own hooks didn't cover, and [its merge-request note](docs/merge-requests/2026-10-07-chore-gate-fixes-and-local-workflow.md) says so.

## What this is

- **The product** (Phases 1–3; live in part since 2026-11-17, as the status above says). A visitor will pick a pre-generated avatar (no biometric data, such as faces or voiceprints, is collected), join the twin in a shared 3D room, and choose the engineer's or the non-engineer's version of the conversation. The twin will speak only from a curated corpus about the Author's work, and say so when it doesn't know.
- **The engineering** (specs 000 and 001, built and live). Production-grade and local-first: the whole production stack runs as containers on the Author's RTX 5090 machine and calls local models, with a capped paid fallback. Its default host is one AWS VM, by the amendment of ADR 0044: there the Anthropic API answers first, and the laptop serves when the Author runs it. A real-time cost meter and a kill switch degrade the service before the budget breaks: $5 a day, $20 a month. Every flow of data that leaves the machine is listed, with what it carries and why, in the [data-flow disclosure](docs/data-flow-disclosure.md).
- **The process** (in force now). Changes go from intent to spec to plan to code to review. AI agents in named roles do most of the typing, and only the Author merges. Hooks and a sandbox enforce what the agents may do, and each stage commits its artifact, so the repository is its own audit trail; when a change skips a stage, its merge-request note says so and why.

## Films

Short narrated explainers of what the resume claims, each made from the system's own material: its config, its test output, its alerts, its disclosure, in the Author's words where the Author's words exist. Each film is written as code in [`films/`](films/), with its script, its captions, and a list of where every word and number on screen comes from. The narration is a synthetic voice (Kokoro), and where a spec wasn't built yet when its film was made, such as spec 001's outbound tunnel, the film shows the system as that spec described it. Each film's page plays it once the Author adds the player after publication, and offers the full-size MP4 from the repository's release `films-v1`.

[![A $5-a-day kill switch, the film](films/kill-switch-b2/media/kill-switch.gif)](films/kill-switch-b2/)

| Film | What it shows | Script · sources |
|---|---|---|
| [**A $5-a-day kill switch**](films/kill-switch-b2/) | The meter climbing on the breach test's synthetic calls, the warning at $3.50, and the trip at $5.00 that refuses every request, local answers too, until a person resets it with a reason in the audit log; the breach test's 52 assertions; the walls around the stack; and the agents that built it, each in one role, fenced in by the gates. | [script](films/kill-switch-b2/script.txt) · [sources](films/kill-switch-b2/materials.md) |
| [**A real-time cost meter**](films/cost-meter/) | Cost as a first-class signal (the constitution's principle V): the room's sign showing what each call cost, from the gateway's own reply; provider, model, tokens, and cost on every call; money in whole micro-dollars; Langfuse inside the stack, locked down; spend beside latency and errors in Grafana; and why the app's own meter, not the cloud bill, is the control. | [script](films/cost-meter/script.txt) · [sources](films/cost-meter/materials.md) |
| [**Every data flow disclosed**](films/data-flows/) | The [data-flow disclosure](docs/data-flow-disclosure.md) and the build check that refuses a service without a row; what leaves a visitor's device and what never does; what reaches Anthropic when the paid fallback answers; then what the twin says back: only from the corpus, "I don't know yet" otherwise, checked by code before it leaves. | [script](films/data-flows/script.txt) · [sources](films/data-flows/materials.md) |
| [**Tested every time it changes**](films/evals/) | The evals: golden and gap cases drawn from the [corpus](corpus/README.md), asked two ways; grading by code, never by another model; the gateway's guards; the red team on every route; the real pass rates; misses that became fixes; readiness locked to a hash. | [script](films/evals/script.txt) · [sources](films/evals/materials.md) |
| [**Local models first**](films/local-first/) | The whole production stack on one machine with one command; llama.cpp on the GPU, tried first at no cost with nothing leaving the machine; the capped paid fallback, and the cloud host where the Anthropic API answers first ([ADR 0044](docs/adr/0044-ec2-as-prods-default-host.md)); the offline-first discipline of the Author's work at Medic; and Denver Local AI's private AI for small Denver teams, with sensitive files kept on hardware they own. | [script](films/local-first/script.txt) · [sources](films/local-first/materials.md) |
| [**The stack, container by container**](films/stack/) | All fifteen containers of the production stack: what each does, why it is there, what happens when it fails, what alerts on it, and how it is observed; the edge as the only door, the gateway as the only road out, and the runbook every alert names. | [script](films/stack/script.txt) · [sources](films/stack/materials.md) |
| [**How it's built**](films/lifecycle/) | The development lifecycle: intent, spec, plan, tasks, the agents in their roles, review by an agent that didn't write the change, bugs and incidents, the clean-room gate, the sandbox and its hooks, and pull-only deploys as spec 001 describes them. | [script](films/lifecycle/script.txt) · [sources](films/lifecycle/materials.md) |

## How to read this repo

The twin will ask each visitor which version they want, and this repository offers the same two paths. The facts are the same; the depth differs.

### Not an engineer? About ten minutes

1. [**The idea**](intent/000-ai-twin-portfolio.md), in the Author's own words: what the twin is for, and why it is built this way.
2. [**The constitution**](.specify/memory/constitution.md): eight principles. Principles VII and VIII say what the twin may say about the Author, and what it never will.
3. [**Why foundations come first**](specs/000-local-foundations/intent.md): spending limits and safety rails before any feature.
4. [**The kill switch, tripped on purpose**](docs/recordings/): spec 000's breach test, recorded in the terminal, as the spend crosses the ceiling, the stack's hello endpoint switches to its degraded response, and the real Telegram and email alerts arrive (SC-002). The recording is the Author's run (tasks.md T085); until it lands, the folder says so. Public dashboards follow in spec 001.
5. [**What leaves the machine**](docs/data-flow-disclosure.md): every flow, what it carries, and why, from a visitor's browser too.
6. [**The merge requests**](docs/merge-requests/): each change, who approved it, and what the review found, including what went wrong.

### An engineer? Start with the gates

1. [**The constitution**](.specify/memory/constitution.md), then [**how we build**](docs/how-we-build/lifecycle.md): the artifact chain, the gates, and the layers that enforce each rule (skill, hook, sandbox, and what sits outside the session).
2. **The enforcement layer**: [`CLAUDE.md`](CLAUDE.md), [`REVIEW.md`](REVIEW.md), and [`.claude/`](.claude/), which holds the agent roles, `settings.json` (permissions and sandbox), and the hooks. [`redteam/forbidden-actions.sh`](redteam/forbidden-actions.sh) tests the hooks, the git hook, and the settings, and lists the gaps it knows about.
3. [**Spec 000**](specs/000-local-foundations/spec.md): the local production stack, cost control, and agent governance, as testable acceptance criteria. Its [plan](specs/000-local-foundations/plan.md) and contracts give every interface, [tasks.md](specs/000-local-foundations/tasks.md) every task and what each one found, and [quickstart.md](specs/000-local-foundations/quickstart.md) the runs that prove each user story.
4. [**The ADRs**](docs/adr/): each decision and the alternatives turned down. Then [**the security posture**](docs/security-posture.md): the AWS Well-Architected review's scorecard, what is by decision, the known gaps, and what was fixed before publication; and [**the incident notes**](docs/incidents/).
5. [**The runbooks**](docs/runbooks/): what the operator does for each alert and degraded answer, and for the agents' engine and the local gate. With them, [the data-flow disclosure](docs/data-flow-disclosure.md): every flow that leaves the local tier.
6. [**The merge requests**](docs/merge-requests/): review findings and what was done about each.
7. [**The corpus rules**](corpus/README.md): how claims about the Author are tagged, attested, and turned into evals.
8. **Run the gates yourself**, in the devcontainer: the [quickstart](#quickstart-the-devcontainer) below. [`docs/START-HERE.md`](docs/START-HERE.md) has the Author's full setup, the stack's host included.

## Quickstart: the devcontainer

The devcontainer ([`.devcontainer/`](.devcontainer/)) holds every pinned tool, the versions the agents' sessions and the Author's gate use too. SC-007 sets its target: "A newcomer reaches a running devcontainer with passing tests in under 30 minutes." The Author times it at tasks.md T099, on a fresh clone with an empty build cache (quickstart.md §6.2). It needs Docker, and `npx` or VS Code to open it; nothing of the Author's: no Claude login, agents' engine, GPU, or denylist (plan §9).

```bash
git clone <repository URL> h4reet-ai && cd h4reet-ai
npx @devcontainers/cli@0.89.0 up --workspace-folder .               # builds the image; make setup runs when it starts
npx @devcontainers/cli@0.89.0 exec --workspace-folder . make test
npx @devcontainers/cli@0.89.0 exec --workspace-folder . make check
```

Or open the folder in VS Code and reopen it in the container. `make check` runs every local gate and prints PASS, FAIL, SKIP, PENDING, or PLANNED for each, then a summary; the gates that need a docker CLI print SKIP, with the reason. Outside the devcontainer and the agent sandbox, `make lint` and `make test` refuse to run, because they execute `node_modules` and test code from the working tree; each merge-request note carries their output instead. The stack itself (`make up`) needs the Author's host, which [`docs/START-HERE.md`](docs/START-HERE.md) and [quickstart.md](specs/000-local-foundations/quickstart.md) set up.

## The artifact chain

| Stage | Artifact | Where |
|---|---|---|
| Plan | `intent.md`, in the originator's words | [`intent/`](intent/) |
| Design | `spec.md`, with its clarifications | [`specs/`](specs/) |
| Build | `plan.md`, `tasks.md`, the diff and its tests | `specs/NNN-*/` and a feature branch |
| Test | test output, eval and red-team results | the merge-request note; `evals/` and `redteam/` |
| Deploy | the `REVIEW.md` passes by an agent that didn't write the change, then the Author's merge | a note in [`docs/merge-requests/`](docs/merge-requests/) until publication, then the pull request |
| Maintain | incident notes, then the next intent | [`docs/incidents/`](docs/incidents/) |

Each stage ends by committing the artifact the next stage reads, and decisions along the way become ADRs in [`docs/adr/`](docs/adr/). The full table, with who produces each artifact and the gate that ends each stage, is in [`docs/how-we-build/lifecycle.md`](docs/how-we-build/lifecycle.md).

## Specs

Each spec's state on 2026-11-23, from `main`'s merges, its `tasks.md`, and its merge-request notes. "Live" means it is in the site the release of 2026-11-22 serves. Some of the Author's steps in the older specs' `tasks.md` are done but not yet ticked.

| Spec | Scope | Status |
|---|---|---|
| [000: local foundations](specs/000-local-foundations/spec.md) | Governance, agents, and the whole production stack in compose on the local tier, metered and kill-switched | Built and merged, 2026-10-07 to 2026-11-10. Open: the Author's recorded breach test (T085), the newcomer's timing (T099), the runs that close the spec (T119), and four smaller tasks ([tasks](specs/000-local-foundations/tasks.md)) |
| [001: cloud elevation](specs/001-cloud-elevation/spec.md) | The same stack in one AWS account with Terraform, EC2 as prod's default host | Built and live since 2026-11-17: merged in groups from 2026-11-11, with fixes F1 to F10 through 2026-11-22; F11 is in the stack that goes to `main` before publication. Open: the handover's rehearsals (T133), the close-out (T142 to T146), and the first month's cost reading (T147) |
| [002: the room](specs/002-the-room/spec.md) | The Author's work area in 3D, where the twin hands visitors the resume | Built in part and live, merged 2026-10-23 to 2026-11-10. Waits: voice, the visitor's and the twin's (T072 to T077); the conversation moved to spec 007 |
| [003: studio assets](specs/003-studio-assets/spec.md) | The studio's outputs brought into the repository safely: the arrival check, the guards, the GPU window | Built in part, merged 2026-10-23 to 2026-11-06; tooling, not part of the site. Waits: the site's loader for studio assets and the phases after it |
| [004: room composition](specs/004-room-composition/spec.md) | The work area's pieces composed from data: a catalog, placements, and behaviors | Built in part and live, merged 2026-10-23 to 2026-11-08. Open: switching on the room's live state, the measured close-out, and the curved monitor |
| [005: full-window room](specs/005-full-window-room/spec.md) | The room fills the browser window under a translucent HUD, with full screen | Built and live, merged 2026-11-10. Open: the Author's live look |
| [006: behavioral tier](specs/006-behavioral-tier/spec.md) | The agent-configuration evals as evidence the Author reads, off the merge path | Interim only: the advisory tier, merged 2026-11-07; tooling. The rest isn't planned yet |
| [007: the twin's conversation](specs/007-twin-conversation/spec.md) | A piece or a question, answered from the corpus, with checks in code before an answer leaves | Built and live, merged 2026-11-07 to 2026-11-16. Three topics are marked ready; open conversation isn't yet ([twin-readiness.yaml](config/twin-readiness.yaml)). Open: the Author's live eval and red-team runs |
| [008: visitor movement](specs/008-visitor-movement/spec.md) | Walking the room, and highlighting what a visitor can use | Built in part and live, merged 2026-11-07 to 2026-11-08. Open: walking by touch, and the later phases |
| [009: room avatars](specs/009-room-avatars/spec.md) | The visitor's chosen avatar, and a stand-in for the twin | Built in part and live, merged 2026-11-08 to 2026-11-09; spec 016 replaced the stand-in. Not built: the phone and lookdev phase, and the close-out |
| [010: the Anthropic API](specs/010-anthropic-provider/spec.md) | The Anthropic API as a second paid adapter, and live runs on either | Built and live, merged 2026-11-09: EC2's gateway answers through it first. Open: the Author's live runs on it |
| [011: alerts designed to be read](specs/011-alert-message-design/spec.md) | An HTML email and an organized Telegram message for each alert | Built, merged 2026-11-09; for the operator. Open: samples from prod |
| [012: loading screen](specs/012-loading-screen/spec.md) | A game-style progress bar while the room loads, with hints | Built and live, merged 2026-11-10. Open: the Author's live checklist |
| [014: the room after the demo](specs/014-room-after-the-demo/spec.md) | Framing under the HUD, a newer look, walking, glow, and the chalkboard | Built and live, merged 2026-11-10. Open: the Author's lookdev |
| [016: the twin's own avatar](specs/016-the-twins-own-avatar/spec.md) | The twin's own 3D avatar, replacing the stand-in | Built and live, merged 2026-11-10 to 2026-11-11. Open: the lookdev page's controls for the twin |
| [017: the night shift](specs/017-the-night-shift/spec.md) | Agents working overnight in containers, under a supervisor | Built in part, merged 2026-11-13 to 2026-11-14; tooling. Its planning and gate parts stay off until three of the Author's patches |
| [018: a better HUD](specs/018-better-hud-and-load-screen/spec.md) | The HUD redone from the Author's examples, and a load screen to match | Built and live, merged 2026-11-15; spec 028 replaced parts of it |
| [019: walking legs](specs/019-avatar-walking-legs/spec.md) | Avatars whose legs walk | Built and live, merged 2026-11-15 |
| [020: the dog](specs/020-dog-modeled-and-brought-in/spec.md) | A dog, modeled in the studio and brought into the room | Built and live, merged 2026-11-14 to 2026-11-15 |
| [021: the dinosaur](specs/021-dinosaur-modeled-and-brought-in/spec.md) | A dinosaur, modeled and brought in | Built and live, merged 2026-11-15 |
| [022: corpus from the film scripts](specs/022-corpus-from-film-scripts/spec.md) | Corpus additions from the films' scripts, as a patch for the Author | Merged 2026-11-15 to 2026-11-16, with his patch applied. Open: his confirmation of the answers |
| [023: resume links to the films](specs/023-resume-pdf-with-film-links/spec.md) | The resume's claims linking to their films | Built and live, merged 2026-11-15; amended 2026-11-23 for the films' move to the release `films-v1` |
| [024: the dinosaur eats](specs/024-dino-eats-room-assets/spec.md) | The dinosaur eats chunks of the room's pieces | Built and live, merged 2026-11-15; since spec 028, only after the twin and the dog leave |
| [025: the run from the dinosaur](specs/025-twin-and-dog-run-from-dino/spec.md) | The twin and the dog run from the dinosaur | Merged 2026-11-15, then superseded: spec 028 replaced the run, and its code isn't wired in |
| [026: the twin pets the dog](specs/026-twin-pets-dog/spec.md) | Petting, and the dog's introduction in the conversation | Built and live, merged 2026-11-15 to 2026-11-16 |
| [027: corpus retrieval](specs/027-corpus-retrieval-adr/spec.md) | When the twin's file context stops being enough: a decision, not code | Its ADR, 0054, is proposed; its figures and its review are open |
| [028: the room after review](specs/028-room-after-review/spec.md) | Layout, words, and the dinosaur's scene, after the Author's review | Built and live, merged 2026-11-16 |
| [029: room polish](specs/029-room-polish/spec.md) | Polish after the Author's review of the 028 line | Built and live, merged 2026-11-16 |
| [030: the interface's skin](specs/030-ui-skin/spec.md) | One button component whose skin is data, and panels without blur | Built and live, merged 2026-11-17 |
| 031: CI on GitHub | CI on hosted runners and what spec 000 moved to publication ([carryover](specs/000-local-foundations/publication-carryover.md); [ADR 0014](docs/adr/0014-github-side-requirements-to-a-publication-spec.md)) | Built and reviewed on its own branch, `feat/031-ci`, with four patches for the Author; not merged |
| [032: spot flexibility](specs/032-spot-flexibility/spec.md) | Spot with interchangeable instance types for both cloud hosts | Built and live, merged and applied 2026-11-22; EC2 has run `m7g.large` since. The fix for its first real replace, `fix/032-launch-policy`, is in the stack that goes to `main` before publication |
| [033: the resume in hand](specs/033-resume-in-hand/spec.md) | The resume as a paper in the visitor's hand, which opens it | Built and live, merged 2026-11-22 |
| [034: Langfuse dashboards](specs/034-langfuse-dashboards/spec.md) | Langfuse's dashboards as files, and a command that installs them | Built and reviewed; in the stack that goes to `main` before publication. For the operator |

The films have no spec: intent 015 made them as media, not product code, and their [merge-request note](docs/merge-requests/2026-11-11-feat-015-explainer-films.md) says why.

## Links

- [Constitution](.specify/memory/constitution.md): supersedes everything else in the repository
- [Intent inbox](intent/) · [Specs](specs/) · [ADRs](docs/adr/) · [Merge requests](docs/merge-requests/) · [Incidents](docs/incidents/)
- [How we build](docs/how-we-build/lifecycle.md) · [Start here](docs/START-HERE.md): the Author's setup and session notes
- [Data-flow disclosure](docs/data-flow-disclosure.md) · [Runbooks](docs/runbooks/) · [Recordings](docs/recordings/) · [Research notes](docs/research/)
- [Contributing](CONTRIBUTING.md): we accept intents, not pull requests, from outside
- [Security policy](SECURITY.md): how to report a vulnerability · [Security posture and known gaps](docs/security-posture.md)
- Licenses: the [MIT license](LICENSE) for the code. The studio's assets in [`assets/`](assets/README.md), and the images published under `docs/research/images/`, are all rights reserved, with viewing and linking welcome: each directory's `LICENSE.md` says so ([ADR 0030](docs/adr/0030-media-license-and-ai-mark.md)). Third-party work in the repository, such as GitHub Spec Kit (MIT), keeps its own license: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
