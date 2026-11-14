# ADR 0053: The studio line: two folders, no network path between the repo and the studio

Status: proposed, 2026-11-12 · Spec: 017 (FR-026 to FR-031, FR-040; User Story 4; spec.md "The Author's words" (decision 5), Clarifications (Q5, Q15, the ComfyUI words), Assumptions "The studio line"; plan.md §7, §11, §13) · Accepted when the Author merges `feat/017-the-night-shift`. The weights and nodes list (P-7) is his patch, and the Author's look approval of each asset is his step.

## Context

**The Author's decision.** The design page of the night shift proposed a studio line. The Author's answer:

> "Your recommendation is fine here"

The recommendation, as the spec records it from the design page: the studio line decides everything up to intake, which is Blender, ComfyUI, and three revision rounds. New weights, new custom nodes, his look approval of each asset, and his photos stay his. The spec's summary is the session's own, and the Author's words are the answer above.

**The studio, in his words.** The studio's situation, as the Author described it:

> "the studio agent is running claude and having me manually use comfyui and run the pipelines, but since the twin is done and we are now just left with the asset creation with no likeness, we can let claude control blender and the pipeline"

And the aim:

> "i want the repo agents to be able to talk to the studio agents and complete the asset pipeline along with the code"

**Reading (the session's):** the likeness work is finished, so the remaining assets can be made without his photos, and the studio agent can drive Blender and the pipeline. His photos never come into an agent's reach.

**The standing rule, from 2026-10-12.** The studio pipeline stays outside the repository. The spec records it as "the studio pipeline stays outside the repository", and the Author's own words are:

> "Only the outputs should come in"

**The Author's answers on the folders and on ComfyUI.** On the studio's working folder:

> "i will remove all current files in outputs elsewhere, so the studio agent can read inside the directory and iterate on the creation of the remaining assets"

On ComfyUI's start, after the probe's second run:

> "comfyui wasn't started, that needs to be launched and sometimes with parameters, so that should be done by the agents"

On the launch parameters:

> "--birefnet" and sometimes it was run with that parameter off, depending on the asset output that was needed.

**Reading (the session's):** the studio agent reads and writes its own working folder, and the folder is empty when the first install runs. The agent launches ComfyUI itself, with the parameters a task needs. The one flag he named is an allowlisted parameter, on or off per task.

## Decision

1. **Two folders, and the intake between them.**
   - `/srv/studio/briefs/<asset>/<round>.json`: repo roles write a brief, and the studio reads it.
   - `/srv/studio/handoff/<asset>/<round>/`: the studio writes a candidate and its record, and repo roles read it.
   - `/srv/studio/outputs/`: the studio's own working folder, readable and writable by the studio only.

   The install makes the first two. The studio's working folder is his, emptied before the first install (Q5), and the install refuses while it holds any file. It prints the count, never the names (FR-027).

2. **No network path between the two sides.** Repo roles run on the night's internal network; the studio runs on its own, with the studio's egress proxy allowing Anthropic's API alone (`allowlist-studio.json`). The two networks share nothing, so the only path from one side to the other is the folders, and every crossing is checked at the intake. ComfyUI listens only on the studio's own network: inside its container it listens on all interfaces, because the studio reaches it there, and it has no outbound route, so no node or manager can download (FR-040).

3. **Schemas and checks, with the intake as one command.** The repository holds the brief and candidate schemas, and `scripts/studio/line.py` checks them with the standard library. A candidate is checked for triangles, bytes, bone and animation names, texture size read from its image header, its tools, and its record. Then main's `tools/gates/arrival_check.py` runs on a scratch copy of the candidate. Any finding fails the round (contracts/studio-line.md). Limits come from main's `caps.json`, and the tools list from main's `studio-tools.json`, both read from `refs/heads/main` only, never a working tree (G3's review).

4. **Three rounds, counted from the studio's side.** The rounds used are the higher of the highest handoff folder and the highest recorded result. Only the studio writes handoff folders, so a repo agent that deletes a result or a brief resets nothing. A recorded pass counts only while its round's handoff folder exists and the candidate checks clean again. After three failed rounds the line writes no brief, and the asset goes on the decision page with its three findings lists (FR-028, SC-006).
   *Amended 2026-11-14:* four rounds, not three, for every asset (`line.py`'s `ROUNDS`), because of the Author's words, 2026-11-14, about 21:00Z: "Let's go with the approval of the SHA and use the actual image /srv/studio/workflows/inbox/duck-toller.jpg". A round may also follow a recorded pass, with no findings, while that pass re-checks clean; if it fails, the Author decides between them, with the pass named (spec 017's plan §7, the departure of 2026-11-14).

5. **The weights and nodes list is human-only, and it is the only source of "what may ship".** `assets/policy/studio-tools.json` (P-7, his patch) lists each weight and node with its version, its licence, and `outputs_ship`. Qwen-Image-2.1 and FLUX [dev] are listed with `outputs_ship: false`, and the intake refuses any record that names either, even if the list says otherwise (FR-029). They stay evaluate-only, as the spec's Assumptions record from intent 003. The studio installs no node and downloads no weight. A request for one goes on the decision page (FR-030).

6. **ComfyUI is launched by the studio agent, from his install, read-only.** The studio agent starts and stops ComfyUI through the runner (FR-040). Its command is the runner's: the listen address, the port, and the output, temp, and user folders are fixed by the runner. The task's own parameters come from an allowlist seeded from his launch lines, which currently holds `--birefnet`, on or off per task (Q15). A parameter off the list is refused and goes on the page. ComfyUI's install, its custom nodes, and its models are mounted read-only, so a weight or a node can't arrive. Its uploads go to a temporary folder. ComfyUI runs only under the GPU lock, and the runner stops it when the task ends. Blender runs headless in the studio's own container, under the same lock (FR-031).

7. **The disk and memory check runs before any GPU job.** A job that fails the check stays queued, and the reason goes on the page (FR-031).

8. **The Author's look approval comes last.** A passing candidate comes in through the intake on a branch, with its record. The intake is the last automatic step. Look approval of each asset is his, as decision 5 recorded.

## Alternatives considered

- **The studio pipeline inside the repository.** Rejected by the standing rule of 2026-10-12, "Only the outputs should come in".
- **A network path between repo agents and the studio, for a direct API.** Rejected by the design: the two sides share no network, and the folders are the only crossing (decision 2).
- **The Author as the courier, as today.** Rejected by decision 5 and by his own words about the present arrangement: "having me manually use comfyui and run the pipelines".
- **The Author starts ComfyUI by hand.** Rejected: "that should be done by the agents".
- **Shipping Qwen-Image-2.1 or FLUX [dev] outputs.** Rejected. Both stay evaluate-only (the spec's Assumptions, from intent 003), and the intake refuses them by name.
- **Letting the studio agent install a node or download a weight.** Rejected by decision 5 ("new weights, new custom nodes ... stay his") and FR-030.
- **A round counter kept in the briefs folder.** Rejected: repo agents can write there, so a counter kept there resets by deletion. The count comes from the studio's handoff folders (decision 4).
- **Letting the studio read the likeness photos or the key.** Rejected: the photos and key stay his, and no agent reads them (FR-011).

## Consequences

- **The two sides see only what crosses.** Repo agents can't read `/srv/studio/outputs`. The studio can't read the repository. A candidate reaches the repo only through a handoff folder, and only past the intake's checks.
- **The likeness stays out of the agents' reach.** No agent container mounts `/srv/studio/photos` or `/srv/studio/key`. The studio's working folder holds only the remaining assets, and the first install refuses while it holds anything, so an old file can't slip in.
- **Custom nodes that write into their own folders may fail.** The install is read-only. A node that needs a writable folder gets a named one, decided from the first studio run, never the whole install (plan.md §13).
- **The `--birefnet` flag is unconfirmed as a ComfyUI core flag.** The session's understanding is that it isn't one (Q15). The first studio task checks that ComfyUI accepts it at launch, and the allowlist can drop it.
- **The studio's cost is local.** The GPU and the electricity on studio nights. The studio's egress allows Anthropic's API only, so the studio adds no paid route beyond the Author's plan (spec 017, Expected Cost Impact).
- **Degraded mode.** If ComfyUI or the GPU is unavailable, studio tasks go on the decision page, and repo tasks continue (spec 017, Degraded Modes).
- **Principles.** Principles I and VIII are untouched: no visitor's byte moves and the twin's answers don't change. Principle VI asks that the process be readable. The pipeline stays outside the repository by the Author's standing rule, so the public record is the schemas, the checks, the list, the round rule, and these ADRs. That is a tension the Author chose, recorded here, not a deviation from a MUST.
- **Named deviation: agent configuration outside `.claude/`.** The studio's settings layer and its ComfyUI hook live in `deploy/night-shift/`, so the first install doesn't wait for a patch. The constitution puts role definitions and hooks in `.claude/`. Spec 017 names this as a deviation (Q13). P-10 adds the folder to the gate's agent-configuration trigger, so a change there runs the same evals.
- **Named deviation: the studio role isn't in the constitution's roles list** until P-9, which the Author decides (Q10).

## Links

- Spec: [017 spec](../../specs/017-the-night-shift/spec.md) (The Author's words, Clarifications Q5 and Q15, Assumptions "The studio line") · Plan: [plan.md](../../specs/017-the-night-shift/plan.md) §7, §11, §13 · Research: [R-11](../../specs/017-the-night-shift/research.md#r-11-the-studio-line)
- Contracts: [studio-line](../../specs/017-the-night-shift/contracts/studio-line.md), [runner §5, ComfyUI](../../specs/017-the-night-shift/contracts/runner.md)
- Related: [ADR 0030](0030-media-license-and-ai-mark.md) (the media license and the AI-likeness mark), [ADR 0031](0031-assets-in-plain-git.md) (assets in plain git, the intake's destination), [ADR 0034](0034-content-approvals-by-hash-read-from-main.md) (approvals read from main), [ADR 0051](0051-containers-around-every-agent-session.md), [ADR 0052](0052-agents-plan-and-run-the-gate.md)
- Merge-request note: `docs/merge-requests/`, written at the build's last group (G6); not yet written.
