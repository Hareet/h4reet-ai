# feat/015-explainer-films
Spec: none: the films are media, not product code (intent 015; the deviation is named below) · Intent: `intent/015-explainer-films.md` (draft, for the Author to accept) · Written by: the session, with build agents per film; reviewed by the `reviewer` agent · Date: 2026-11-11
Session: `/home/h4reet/h4reet-ai/h4reet-ai`, working in the worktree `/tmp/claude-1000/wt-films` · Repo hooks active: yes (`.claude/audit/hooks.log`, e.g. `2026-11-11T07:34:02Z bash ALLOW …`; the bash gate refused the session's commits while the main checkout was on `main`, and the pre-commit arrival check refused a merge of `main` into this branch, rule A9, which the session aborted)
Authorized by: the Author's direction of 2026-11-10 (quoted in intent 015) and each approval in this session: the scripts (`films/SCRIPTS.md`), the look ("I like that flow, let's do that for the others"), `films/` for the media ("we'll keep it in films"), and "prepare those merge requests with detailed steps".

**Status: not ready to merge until the steps in "For the Author" are done**: two films re-voiced for three corrected lines, the media gate patch applied on `main`, and the media commit on this branch.

## What changed and why

- **Seven explainer films** in `films/`, one folder each, made as code with the huashu-motion skill (HTML + GSAP compositions, rendered to MP4 by the Author's own Chrome and FFmpeg): a $5-a-day kill switch (`kill-switch-b2`), a real-time cost meter, every data flow disclosed, the evals, local models first, the stack container by container, and how it's built. Each has `script.txt` (the narration the Author approved), `captions.srt`, `treatment.md`, `materials.md` (every on-screen string and number with its source), a landing page `README.md`, and its narration `assets/voice.wav` (a synthetic voice, Kokoro `af_heart`, respaced onto the picture by `tools/respace.py`). Three earlier cuts of the kill-switch film stay for the record (`kill-switch`, `-b`, `-mix`).
- **`films/SCRIPTS.md`** (every script with a source under each line), **`films/BRIEF.md`** (the build brief the film agents worked from), **`films/RESUME-LINKS-PLAN.md`** (the resume's claims linking to the films after publication).
- **README.md**: a Films section, with the kill switch's GIF as the showcase (commented out until the media commit) and all seven films listed with what each covers.
- **`intent/015-explainer-films.md`** (revised to the seven films) and **`intent/017-daily-cpu-summary.md`** (draft, the Author's words: the daily CPU summary the stack film now mentions).
- **Lint**: ESLint skips `films/*/vendor/**` (GSAP and huashu-motion's `om.js`, as shipped), and Prettier skips `films/`, beside `docs/` and `intent/`. `films/.gitignore` keeps renders, the studio's history, logs, and raw voice takes out of git.
- **`docs/merge-requests/2026-11-11-films-media-gate.patch`**: the human-only patch for `main` (below).

## Acceptance criteria

none: no spec. Against intent 015's outcome and constraints: the seven films exist and render (QA below); every on-screen string and number traces to `materials.md`; no secret, token, private path, or long hash on screen; fonts and runtimes are vendored and nothing is fetched at render. Not yet met until the steps below: the MP4s in git (needs the gate patch), and the three corrected narration lines in the evals and stack films' audio.

## Constitution check

| Principle | Touched | How it complies |
|---|---|---|
| I. Data-Local by Default | lightly | No new flow from the site: the films live in the repository, watched on GitHub, which the site doesn't call (intent 015, Data-flow impact). |
| II. Production-Grade or Not Shipped | no | Not product code: nothing in the site or the stack builds, serves, or runs `films/`. |
| III. Intent Before Spec, Spec Before Code, Humans Merge | yes: **deviation** | The intent stands; the spec and plan stages are waived for media (the Author's direction; named here and in intent 015's open questions). The Author accepts the intent and merges. |
| IV. Least Privilege | yes | Agents built, one reviewed (not the builder); the gate change is a human-only patch built from plain copies, never written into `tools/gates/`. |
| V. Cost Is a First-Class Signal | lightly | No model spend at runtime. Repository size: see Cost below. |
| VI. Build in Public, Including Failures | yes | The films show real pass rates (146/155/156 of 186), known gaps (52), and the misses that became fixes. |
| VII. Say Exactly What You Owned | yes | Scripts about the Author's work quote the corpus and the Author; the review's three ownership and truth findings are fixed or queued below. |
| VIII. Honest AI | yes | The narration is disclosed as a synthetic voice in the README and on each film's page. |

## Review

The `reviewer` agent (read-only; it wrote nothing here) reviewed the branch at `1fb69b55` against REVIEW.md, intent 015, and the constitution. Security and secrets: nothing found (gitleaks over every commit, no long hashes, no operator ids, no remote fetches). Findings and what was done:

| Finding | Done |
|---|---|
| **Blocking**: no spec; intent 015 still a draft and listing five films | Intent revised to the seven films and the plan; the spec waiver named as a deviation (above). **The Author accepts or edits the intent.** |
| "Every live run passed 48 of 48" (evals): two untracked Bedrock runs in the Author's checkout failed | Script: "The latest run on each route passed forty-eight of forty-eight." **Needs the evals film re-voiced.** The Author decides whether to commit the untracked runs. |
| Cost figures vs corpus/08's "Do not claim: Any spend, traffic, or cost figure for the site that isn't in a filled slot" | **The Author's call**: the films show one evaluation run's measured cost ($0.21 for 186 cases) and its per-case average; that's the eval harness's record, not the site's traffic or spend. Keep, relabel, or drop. |
| Denver Local AI as "the same offline-first discipline" | Fixed in README and the film's page: the resume's words, "private AI for small Denver teams, with sensitive files kept on hardware they own". The narration's "the same idea serves small Denver teams" stays unless the Author wants it re-voiced. |
| The stack film's daily CPU summary is unbuilt and unspecified | The Author asked for it; intent 017 drafted in the Author's words; "per container" (not the Author's words) removed. |
| `om.js` (MIT) vendored without its notice | `vendor/HUASHU-MOTION-LICENSE.txt` beside each of the ten copies. |
| `npx huashu-motion` in the render steps resolves an ignored, agent-writable `node_modules/.bin` | `films/README.md` now gives the pinned absolute path, run from the repository's root. |
| "Bedrock stumbled on 'are you Hareet?'" (evals) vs D37's "a correct refusal" | Script: "When a check misread a correct refusal to 'are you Hareet?', the guard was widened." **Needs the re-voice.** |
| "If it can't be reached for sixty seconds, every request fails closed" (stack) | Script: "fails closed at once, and after sixty seconds, one alert goes out" (ADR 0020:39). **Needs the stack film re-voiced.** |
| ~104 MB of WAV history | Raw takes untracked; the tip carries 46.5 MB of narration, history 99.6 MB. **Squash or not: the Author's call** (below). |
| Nits: pronouns, stale lines, links to media not yet there, the lint scope, session paths in BRIEF.md | All fixed. |

Also found while preparing: the films' "345 forbidden actions" didn't hold up (`matrix-required.txt` lists 286 row IDs); the kill switch and lifecycle films now show the matrix's recorded run, "802 passed, 0 failed, 52 known gaps" (`docs/merge-requests/2026-11-08-fix-007-live-runs.md:2679`).

## Verification

- `make lint` on the branch: ESLint, tsc, Prettier, ruff, ruff format, shellcheck all pass (after the lint scope above).
- `make check ENGINE_MODE=none-yet` on this branch merged into `main` at `0d2e3247` (a scratch worktree, `sim/015-on-main`, at the branch's `d9293efc`): `make check: 10 PASS, 1 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 2 FAIL; failing: test FAIL, matrix FAIL`. Neither failure touches this branch: `test` is one timeout in `apps/web/test/lookdev/candidate.test.ts` (64 s against 60 s while other jobs ran); `matrix` is E10 (the engine reset needs 22 GiB free) and E14 (the sandbox can't reach dev-cpu's ports): `forbidden-actions (hook layer): 853 passed, 2 failed, 57 known gaps`. WARN: the behavioral tier's inherited regression line. PASS includes lint, secrets, content-check, arrival, policy, redteam, and evals (whose link check covers the new README).
- `evals/docs_links.py` at the tip: `docs links: 0 failed, 1914 relative links in 272 files`.
- The pre-commit arrival check passed every commit on the branch (`arrival-check: 0 findings`).
- Every film: the jsdom probe (no errors; every shot on its cut) and `om qa` on its latest render (no single-frame pops; remaining still stretches are planned stops, reading holds, and end cards). Loudness −16.1 to −16.6 LUFS.
- The gate patch: built from `git show refs/heads/main:` copies; its tests run on scratch copies only: main's 236 pass; patched 276 pass (40 new); the new tests against main's unpatched check: 32 fail, 8 pass (the 8 pin today's behaviour). `git apply --check` against an export of `main` at `0d2e3247`: all six files apply. The patched check admits every real render and the GIF, and main's check refuses them (A1).
- `make check ENGINE_MODE=none-yet` on `feat/015-films-media-squashed` at 8bc0788c (its tree is the media branch's, on `main` 5f8790b2), 2026-11-12: `make check: 13 PASS, 2 SKIP, 0 WARN, 0 PLANNED, 0 PENDING, 2 FAIL; failing: test FAIL, infra-check FAIL`. Both failures are the session's sandbox, not this branch, which changes nothing under `infra/`, `scripts/`, `tools/`, `deploy/`, `services/`, `apps/`, `config/`, or the Makefile: `test` is `1 failed, 4842 passed, 1 skipped`, the one being `scripts/infra/test_infra_targets.py::test_infra_check_runs_the_policy_then_waits_for_terraform` ("mktemp: failed to create file via template '/tmp/tmp.XXXXXXXXXX': Read-only file system"); `infra-check` is Terraform's AWS provider failing its plugin handshake ("Failed to read any lines from plugin's stdout"), a socket the sandbox refuses. PASS includes lint, arrival, secrets, content-check, disclosure-check, evals (`docs links: 0 failed, 2213 relative links in 343 files`), redteam (`68 passed, 0 failed`) and matrix (`forbidden-actions (hook layer): 1015 passed, 0 failed, 65 known gaps`).
- The gate patch, rebuilt on 2026-11-12 against `main` at `4785107e`: `main` had taken ADR 0047 (spec 001's shared account) and `feat/001-w1` holds 0048 and 0049, so the films' ADR is 0050; the code hunks are unchanged apart from that number. `git apply --check` against an export of `main` at `4785107e`: all six files apply. On that export with the patch's files laid over it: the arrival, gate, publish-check, run-checks, docs-links and room-order suites, 689 passed; `evals/docs_links.py`: "the ADR index links every ADR file: 45 of 45", 0 failed of 2193 links.

## Cost and data-flow impact

- **Model spend**: none at runtime. Dev-time: this session and its agents.
- **Repository size**: the seven final MP4s are 229,001,068 bytes, and the GIF 7,038,051 (about 236 MB with the media commit); the narration WAVs are 48.9 MB. The squash keeps only the final tree, so the branch's superseded takes never reach `main`. History keeps every version from here on, so commit only final cuts.
- **Data flow**: none from the site. Readers watch on GitHub; the resume's links go there after publication.

## For the Author

The Author's answers, 2026-11-12: "Accept intent 15. Agree to spec waiver. MIT. Keep cost figures. Squash. I dont want to revoice."

1. Intent 015: accepted (its status line quotes the Author). Intent 017 (draft) is still the Author's to accept or close.
2. The spec waiver for media (constitution III), named here as a deviation: agreed.
3. The renders' licence (ADR 0050): MIT, with the code; the README's licence line is unchanged.
4. The cost figures: kept, against corpus/08's do-not-claim line, as the Author's decision.
5. History: squashed. The gated branch is `feat/015-films-media-squashed`: one commit on `main` holding the media branch's final tree, so the ~53 MB of superseded narration takes never reach `main`.
6. No re-voice: local-first's "serves small Denver teams" stays as recorded. Whether the evals film becomes a fifth resume claim is still open.

What happened on 2026-11-12, and the steps left (the runbook artifact has them as short paste lines):
1. Done: the gate patch on `main` (5f8790b2; rebuilt against 4785107e, its ADR renumbered 0050). Evals and stack re-voiced; a session merged stack's Kokoro splits, respaced both, and re-timed evals' shots (438b4d59). Five films rendered and passed `om qa`; the kill switch's GIF is made.
2. Changed: A9 refuses merging `main` into this branch (main's `assets/policy` change), so the media go on `feat/015-films-media`: `main` at 5f8790b2 with this branch merged in (clean). The pre-commit arrival check runs from the main checkout's working tree, so the checkout is parked on a branch at 5f8790b2 (`wip-park/11-12-a11`) for A11 to apply.
3. The Author renders evals and stack again (`om sound`, `om render`; not `om voice`). Their first renders, made before the respace, are out of sync and aren't used.
4. The media commit on `feat/015-films-media`: all seven MP4s and the GIF, the README's showcase, and each page's "Watch the film" link.
5. The squash: `feat/015-films-media-squashed`, a new branch off `main` whose one commit restores the media branch's tree, committed through the hooks.
6. `tools/gates/gate feat/015-films-media-squashed` from main's checkout, then the merge it prints.
7. After publication: `films/RESUME-LINKS-PLAN.md`.

## Backlog

- The untracked red-team and eval history in the main checkout (`redteam/history/*`, `evals/product/history/*`): commit or discard (Principle VI).
- Intent 017's daily CPU summary, before anyone watches the stack film after publication.
- A film for each future claim reuses `films/BRIEF.md`.
