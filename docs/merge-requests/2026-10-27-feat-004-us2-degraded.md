# feat/004-us2-degraded
Spec: [specs/004-room-composition/](../../specs/004-room-composition/) (Phase 5, User Story 2: T153 to T167) · Intent: [specs/004-room-composition/intent.md](../../specs/004-room-composition/intent.md) · Written by: implementer agent (Claude Opus 5.5), from the branch's commits and the runs below · Date: 2026-10-27
Session: started from `/home/h4reet/h4reet-ai/h4reet-ai` (parked on `wip/park-2026-10-26b`); worked in the branch's worktree, `/tmp/claude-1000/wt-us2`, made with `git worktree add -b feat/004-us2-degraded` from 74c33e9, `feat/004-us3-lookdev`'s tip (T153). Repo hooks active: yes. The post-edit check refused an unused variable in `cables.test.ts` mid-edit, the bash gate refused a read of a git hook setting (not respelled), and `.claude/audit/hooks.log` records this session's commands, for example `2026-10-27T04:14:33Z	bash	ALLOW	ls -la /home/h4reet/h4reet-ai/h4reet-ai/.claude/audit/ ...`. Each commit ran the arrival check (`arrival-check: 0 findings in 4 files`) and gitleaks (`no leaks found`).
Authorized by: tasks.md T153 to T164; plan.md §10's User Story 2 entries; the main session's direction for T163's claims amendment (option a) and for the delta review's fixes.

## 2026-11-07: restacked onto feat/004-us3-lookdev's restacked tip (T166)

`feat/004-us2-degraded was 7904c5155b298163c3bcac75ff4c6b53b4529765` (T166): 20 commits on 74c33e9d82c6f33e9249d627b65372bddc029a9c, `feat/004-us3-lookdev`'s tip as recorded before its own rebase (T147), the commit this branch was cut from. This record is committed first, before the rebase, and is replayed with it; the rest of this section follows the rebase.

The rest of this note is as it stood at 7904c515, its SHAs the old ones.

**Status: reviewed twice, ready for the gate once line R's earlier merges land.** T163's review found one important issue (I1, the claims rule read from the cases) and five nits. All are fixed test first, except N3, which is a decision for the Author (For the Author, item 1). The delta review over those fixes gave **APPROVE with fixes**: one important issue (I1, faulty claims crossed with swapped cases) and four nits, all fixed here. The live source stays `off`: no poller exists, and nothing asks `/api/status`. `make check` ends with the same four FAILs as `feat/004-us3-lookdev`, none from this branch's code (Verification; For the Author, item 4).

## Runs in the Author's terminal

Read these in order.

1. **Merges that come first, not this branch's.** Line R merges after M8, M9, and P-10, then User Story 1 (T118, T119), then User Story 3 (T147, T148), then this branch.
2. **The rebase (T166), by the agents.** After T148 they record the tip first, as `feat/004-us2-degraded was <sha>`, then run `git rebase --onto refs/heads/main 74c33e9 feat/004-us2-degraded`. 74c33e9 is `feat/004-us3-lookdev`'s tip as it stood before its own rebase (T147), the commit this branch was cut from. They re-run `make check ENGINE_MODE=none-yet` and append it here. You don't run it.
3. **Your runs, T165, quickstart Q4. They wait for M9 (T048).** `make up ENV=dev REF=<this note's commit>` is Heavy, so run it when no agents are running. Then, at `http://127.0.0.1:18105/`:
   - **Enter.** The laptop's not-live pose, with its sentence in "Around the room" ("The live status isn't connected yet"). In the browser's network log, every request goes to `127.0.0.1:18105` and none to `/api/status`: SC-012's part before spec 001. The neon counters arrive with User Stories 5 and 9.
   - **"Pause the room"** for a minute, then resume. Idle motion stops, "Around the room" reads "Paused at HH:MM" in your local 24-hour time, the button shows pressed by an inset ring and underline as well as colour, and motion returns on resume. The terminal's typing and the glows come with User Story 5.
   - **A browser with WebGL disabled.** The 2D room, with the same pieces, the charger in its not-live pose with its cable, and the same words.
   - **Dev's model server stopped,** as spec 002's quickstart does it (`docker compose … stop model-server-gpu`). The room renders in full, and only the conversation degrades, to its fixed message (FR-062).

   Put what you see under Measurements below.
4. **The gate and the merge (T167), by you.** Once T166 has run, run `tools/gates/gate feat/004-us2-degraded` from main's checkout, then the merge command it prints. This branch changes nothing under `.claude/`, `evals/agent-config/`, `tools/gates/`, `deploy/`, or `Makefile`.

## What changed and why

User Story 2: the room works whatever is live, and never shows a state that isn't true. The branch has 19 commits on 74c33e9, including this note: 37 files before the note, 3,403 insertions and 170 deletions. Every file is under `apps/web/` except plan.md, tasks.md, data-model.md, and three contracts (room-bundle.md, room-data-files.md, tier-signal.md), which change only for T163's claims amendment.

- **The tier, one pure function** (`src/room/signals/tier.ts`, T158). `reduceTier` is FR-041's table, rows tried in order. An answer's age is the larger of its monotonic and wall-clock ages. `recheckAt` is the instant the last valid answer turns stale. `causeClass` moved out of `src/talk/messages.ts`, and `cannotTalkFor(cause)` is now `` `cannot_talk.${causeClass(cause)}` ``, so the laptop and the "can't talk" message share one map. `caseFor` is the claims rule (below).
- **One motion store** (`src/room/motion.ts`, T159): paused (the toolbar's "Pause the room", `aria-pressed`), reduced motion (`matchMedia` with a change listener, read throughout the visit), and hidden (`visibilitychange`, `pagehide`, `pageshow`). The room animates only while all three are false. "Paused at HH:MM" comes from an injected wall clock, filling the UI word `pause.paused_at`'s `{time}` slot.
- **The switch's cases in 3D** (`src/room/scene/cables.ts`, T160). Each pose's group holds the charger's stand-in and the cable's tube along `compose/cable.ts`'s 16 points and its drop, at the charger's stylized scale, made once per pose. `apply(value)` shows the claims rule's case, and a pose's glows (the charge light) are set while it shows; nothing draws glows until T185. The 2D room's `apply` toggles each case group's `visibility`, its cable curve with it.
- **The live controller and the room's wiring** (`src/room/signals/live.ts`, `app.ts`, `layout.ts`, `text-copy.ts`, T161). The tier is re-reduced at Enter, on each completed request, on pause, resume, hide, and show, on each fallback reply, and at `recheckAt`. Each reduction calls the stage's `apply` and sets "Around the room"'s sentence in the same call, so a failed or stale answer takes the plugged pose away on the next frame and resume is reduced before the next frame. With `live.source` `off`, nothing polls and the tier is not-live. `complete()` and `fallbackReply()` are the hooks T245's poller and T266's cost channel will call.
- **The lookdev page** (T162): Pause drives the room's motion store, and the sample state goes through the room's `apply`, cable tube and glows included.

### The claims amendment (T163)

T163's review found that the runtime knew the plugged and the cloud poses only from a switch's `cases`. A bundle that swapped `local`'s case with `unknown`'s would draw the plugged pose for unknown. The main session took option (a), which changes the contracts (8ccbe12):
- The index's tier switch carries its piece's `claims` `{local, cloud}` (contracts/room-bundle.md §3.1; data-model.md). `build/room/emit.ts` writes them, with `""` for a missing pose.
- RS3 refuses a `tier` switch whose piece's claims name no pose for `local` or for `cloud`, or a claimed pose no case shows (contracts/room-data-files.md §13.4).
- `caseFor` takes the plugged and the cloud poses from the claims, never from the cases. Claims present but not whole read as not-live, every value drawing the shared pose. A switch without claims draws its cases as they are.

The delta review then found that this not-live path still took the first `SHARED_ORDER` case, which a swapped bundle can point at the plugged pose. That path now takes the shared pose as RS4 does: the drawn pose the claims don't name that most of the six values show, with ties going to the earliest (d1edce1). The two contracts say so.

## Acceptance criteria

Quotes are from [spec.md](../../specs/004-room-composition/spec.md).

- **FR-041 (met).** "THE TIER SIGNAL SHALL be reduced, by a pure function …": `reduceTier`, tested row by row with every failure kind (T154).
- **FR-042, SC-003 (met in tests).** "THE CHARGER SHALL show plugged in only WHILE the tier is local." The plugged pose leaves on the first frame after a failure or a stale answer, and resume reduces before the next frame (T155).
- **FR-043 (met).** Each value has a case. Only `local` shows the plugged pose and only `cloud` the cloud pose, at build time (RS) and at run time (`caseFor`), even from a faulty bundle.
- **FR-045 (met).** With the live source off, no request is made and the tier is not-live (T155, T157). The switch-on is User Story 8's.
- **FR-057, FR-058, FR-062, SC-007 (met in jsdom).** Each fault run ends usable: the AI disclosure visible, a working text box, the stage neither blank nor frozen, and the text copy equal to the drawing (T157).
- **FR-059, FR-060 (met in tests; your run judges).** One motion store read throughout the visit, "Pause the room" in the toolbar, and "Paused at" only while paused (T156).
- **FR-020, FR-051 (met).** The cable is drawn at run time from the case's lead to the desk's back edge at the charger's stylized scale (T160).
- **Left for later stories:** the neon counters while paused (T184, T266); the faces' typing and the glow cards (T185); room text and typefaces in the fault suite (T182); live faces on a failed piece's stand-in (T185).

## Degraded-mode behaviour (plan.md §6's rows this branch builds)

| The spec's row | Built here | Proven by |
| --- | --- | --- |
| The live source is off | row 1 of `reduceTier`; no poller exists | `tier.test.ts`, `live.test.ts`, `degraded.test.ts`; your Q4 run |
| A status request fails or the answer is stale | rows 3 and 4; the `recheckAt` timer (backoff and `Retry-After` are User Story 8's poller) | `tier.test.ts`, `live.test.ts`, `degraded.test.ts` (SC-003) |
| Paused, or the page hidden | the motion store; row 2 | `pause.test.ts`, `motion.test.ts`, `live.test.ts`, `degraded.test.ts` |
| The local tier off, the cloud fallback answering | rows 7 and 9 (the paid figures are User Story 9's) | `tier.test.ts`, `live.test.ts` |
| Kill switch, budget spent, or no path | row 6 through `causeClass`, the shared pose | `tier.test.ts` (with `cannotTalkFor`) |
| A piece's model fails to load | User Story 3's loader, the stand-in kept, the switch's state applied on it | `degraded.test.ts` (four faults, the real 3D stage) |
| No 3D | User Story 1's 2D room, with the case applied | `degraded.test.ts`, `cables.test.ts` |
| Reduced motion | the motion store, read throughout the visit | `pause.test.ts`, `degraded.test.ts` |

## Constitution check

| Principle | Touched? | How it complies |
| --- | --- | --- |
| I. Data-local by default | Yes | No request is added: the live source stays `off` and no poller exists. The motion store and the tier live in page memory and store nothing. |
| II. Production-grade or not shipped | Yes | Tests first (RED and GREEN below). $0 at run time. This branch is the room's degraded modes, before any live piece's happy path. |
| III. Intent before spec, spec before code, humans merge | Yes | tasks.md T153 to T164. Departures are in plan.md §10. The contract changes are T163's amendment, on the main session's direction. Committed locally, not merged. |
| IV. Least privilege for humans and agents alike | Yes | No permission, sandbox domain, deny, or human-only path changes. |
| V. Cost is a first-class signal | Yes | No model call and no endpoint. |
| VI. Build in public, including failures | Yes | The RED runs and both reviews are in this note. |
| VII. Own the whole product, and say exactly what you owned | Yes | This note makes no claim about the Author's role or the agents' share of the work. |
| VIII. Honest AI | Yes | The laptop never claims a tier it doesn't know: unknown is degraded, and only `local` plugs it in. The AI disclosure stays visible in every fault run. |

## Security and agent governance

Nothing under `.claude/`, `tools/gates/`, `REVIEW.md`, `CLAUDE.md`, `.specify/memory/constitution.md`, `corpus/`, `infra/`, `deploy/`, `evals/agent-config/`, or `docs/data-flow-disclosure.md` changes (`git diff --name-only 74c33e9..<tip>`). No new dependency. The CSP needs no change: the pause button and the 2D cases take attributes only, with no `style` attribute, `blob:` URL, or inline handler.

## Cost and data-flow impact

**Cost:** $0 at run time; no model call or endpoint.

**Data flow:** none new. No byte leaves the visitor's device because of this branch. `GET /api/status` comes with User Story 8's switch-on change and its disclosure row (V7).

## RED and GREEN

| Task | RED commit | What the RED run showed | GREEN commit |
| --- | --- | --- | --- |
| T154 | d6769e2 | The file fails to load: no `signals/tier.ts` (26 tests not run). | 7933c28 |
| T155 | 7378d9a | The file fails to load: no `signals/live.ts` (25 not run). | 0fc160b |
| T156 | d954280 | 9 of 23 fail (all 8 of `pause.test.ts`, and a11y's Tab order); `motion.test.ts` fails to load (10 not run). | 0c5af7c, 0fc160b |
| T157 | 5447936 | The file fails to load: no `signals/tier.ts` (26 not run). | 0fc160b |
| T160 | ca6cd57 | 2 of 75 fail (the not-live cases of `scene.test.ts` and `flat.test.ts`); `cables.test.ts` fails to load (11 not run). | 66c9637 |
| T162 | 971a48e | `page.test.ts` fails to load: no `scene/cables.ts` (39 not run). | 408b0ca |
| T163's review | 0edcf56 | 64 of 1,927 fail in 8 files. | 2d754c6, 40e7227 |
| The delta review | 99d64ff | 21 of 183 fail (20 crossed cases and the count's case); N-a to N-c pin current behaviour and pass. | d1edce1 |

No GREEN commit changes a test. **GREEN at the tip:** `npx vitest run` gives 74 files and 1,964 tests passed.

## Review

**T163, the review of the branch** (in a session that wrote none of it), as its fix commits record it:
- **I1, Important.** The runtime read the plugged and the cloud poses from `cases`, so a swapped mapping drew the plugged pose for unknown. **Fixed** by the claims amendment, option (a): 8ccbe12 (the contracts), 0edcf56 (RED), 2d754c6 (GREEN).
- **N1.** `motion.ts`'s `animate` getter built a state object on every frame. **Fixed** in 40e7227 (it changes no behaviour, so it has no test case).
- **N2.** "Pause the room" had no visible pressed state in the room (only `aria-pressed`). **Fixed** in 40e7227: an inset ring and an underline (WCAG 1.4.1), tested in `a11y.test.ts`.
- **N3.** "Pause the room" is inert while the resume offer shows. **Not changed:** a decision for the Author (For the Author, item 1).
- **N4.** `FlatDrawing.turns` was computed once from reduced motion and read by nothing. **Removed** in 40e7227.
- **N5.** `degraded.test.ts` read the 2D case by group position. **Fixed** in 0edcf56: it reads the case by the pose's name.

**The delta review of 408b0ca..40e7227: APPROVE with fixes.**
- **I1, Important.** Claims present but not whole, crossed with swapped cases, still drew the plugged pose (or the cloud pose) for every value, because the fallback took the first `SHARED_ORDER` case. **Fixed:** 99d64ff (RED, an `it.each` of 7 faulty claim shapes × 5 mappings, plus the count's case) and d1edce1 (GREEN: the not-live path takes RS4's shared pose by count; the whole-claims path is unchanged; room-bundle.md §3.1 and tier-signal.md §2 say how).
- **N-a.** `live.test.ts`'s tangled case had a stale title. **Renamed** in 99d64ff.
- **N-b.** `bundle.test.ts` checked only the claims' keys. **Fixed** in 99d64ff: each value is a pose of that switch's cases.
- **N-c.** No test pinned emit's `""` for a missing claim. **Added** in 99d64ff: RS3's finding on the switch's cases, beside `claims.local === ""` in the index.
- **N-d.** T160's task text said `switches.test.ts` refuses claims that "name one pose for both", which the catalog can't write. **Aligned** with the test's explanation in 83c0022.

**The last look over 40e7227..7a4d5ee: APPROVE.** It re-ran RED (21 of 183 failing, as recorded) and the tip, and confirmed `mostShown` is used only when claims are present but not whole. Its three nits were on this note's own record: N2's and N-c's wording (above, corrected) and N3's citation (For the Author, item 1, corrected).

## Measurements

None yet: your Q4 runs (T165) go here.

## Verification

Run from `apps/web` in the worktree at 83c0022 (the tip before this note, which changes only Markdown and tasks.md):

```text
npx vitest run                    Test Files  74 passed (74) · Tests  1964 passed (1964) · exit 0
npx tsc --noEmit -p .             exit 0
npx eslint --max-warnings 0 .     exit 0
npx prettier --check (repo root, the changed files)   All matched files use Prettier code style!
npm run room:check -w apps/web    room: 0 findings in 0 files · exit 0
npm run room:scan -w apps/web     room: 0 hits · exit 0
```

**`make -f Makefile check ENGINE_MODE=none-yet`** from the worktree's root, at 83c0022, whole:

```text
== makefiles-check
python3 -I -B -X pycache_prefix=/dev/null tools/gates/makefiles_check.py
makefiles: GNUmakefile holds only its include, and there is no makefile
-> PASS makefiles-check
== githooks-check
reference-transaction: installed
pre-commit: missing or modified: run make git-hooks
main: a loose ref, which the git hook guards
make[1]: *** [Makefile:165: githooks-check] Error 1
-> FAIL githooks-check
== toolchain-check
python3 -I -B -X pycache_prefix=/dev/null tools/gates/toolchain_check.py
tool                     pinned   found    status  where
node                     24.21.0  24.21.0  OK      /home/h4reet/.nvm/versions/node/v24.21.0/bin/node
uv                       0.8.22   0.8.22   OK      /home/h4reet/.local/bin/uv
ruff                     0.16.10  0.16.10  OK      /home/h4reet/.local/bin/ruff
gitleaks                 8.30.1   8.30.1   OK      /home/h4reet/.local/bin/gitleaks
python3                  3.12     3.12.3   OK      /usr/bin/python3
shellcheck               0.9.0    0.9.0    OK      /usr/bin/shellcheck
jq                       1.7      1.7      OK      /usr/bin/jq
pytest                   9.1.1    9.1.1    OK      /home/h4reet/.local/bin/pytest
pyyaml (pytest's)        6.0.3    6.0.3    OK      /home/h4reet/.local/share/uv/tools/pytest/bin/python3
claude code              2.1.296  2.1.311  DRIFT   /home/h4reet/.nvm/versions/node/v22.18.0/bin/claude
lint: eslint             10.12.0  10.12.0  OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/eslint
lint: typescript-eslint  8.71.1   8.71.1   OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/typescript-eslint
lint: typescript         6.0.3    6.0.3    OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/typescript
lint: prettier           3.9.9    3.9.9    OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/prettier
lint: node               24.21.0  24.21.0  OK      /home/h4reet/.local/share/h4reet/lint-node/node
toolchain-check: 1 of 15 differ from their pins (claude code); see tasks.md T013
make[1]: *** [Makefile:141: toolchain-check] Error 1
-> FAIL toolchain-check
== policy
python3 -I -B -X pycache_prefix=/dev/null tools/gates/compose_policy.py
FAIL deploy/compose.yaml service web: image: h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}: not pinned by digest (repository:tag@sha256:...)
compose policy: 1 refusal(s) (deploy/compose.yaml with 3 env files, the Dockerfiles, the env-file placement, .devcontainer, .npmrc)
make[1]: *** [Makefile:162: policy] Error 1
-> FAIL policy
== validate-config
npm run --silent -w services/gateway validate-config -- --root "/tmp/claude-1000/wt-us2"
validate-config: 0 errors, 0 notes
-> PASS validate-config
== lint
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
314 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/scripts/aws-login.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh redteam/forbidden-actions.sh tools/gates/install-tools.sh tools/gates/secrets.sh
-> PASS lint
== test
python3 -I -B -X pycache_prefix=/dev/null corpus/tools/check_corpus.py
corpus-check: OK — 20 slots, 4 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems
npm test --workspaces --if-present

> @h4reet/gateway@0.1.0 test
> vitest run


 RUN  v5.0.3 /tmp/claude-1000/wt-us2/services/gateway


 Test Files  51 passed (51)
      Tests  789 passed | 12 skipped (801)
   Start at  22:08:16
   Duration  62.06s (tests 95%, import 3%, transform 2%)


> @h4reet/web@0.1.0 test
> vitest run


 RUN  v5.0.3 /tmp/claude-1000/wt-us2/apps/web


 Test Files  74 passed (74)
      Tests  1964 passed (1964)
   Start at  22:09:19
   Duration  22.54s (tests 72%, import 20%, transform 7%)

pytest -q -p no:cacheprovider --import-mode=importlib corpus/tools evals redteam tools/gates deploy/scripts deploy/agents-engine scripts
........................................................................ [  2%]
........................................................................ [  5%]
........................................................................ [  8%]
........................................................................ [ 10%]
........................................................................ [ 13%]
........................................................................ [ 16%]
........................................................................ [ 19%]
........................................................................ [ 21%]
........................................................................ [ 24%]
........................................................................ [ 27%]
.........................................................F..........FFF. [ 29%]
........................................................................ [ 32%]
........................................................................ [ 35%]
........................................................................ [ 38%]
........................................................................ [ 40%]
........................................................................ [ 43%]
........................................................................ [ 46%]
........................................................................ [ 48%]
........................................................................ [ 51%]
........................................................................ [ 54%]
........................................................................ [ 57%]
........................................................................ [ 59%]
........................................................................ [ 62%]
........................................................................ [ 65%]
........................................................................ [ 67%]
........................................................................ [ 70%]
........................................................................ [ 73%]
........................................................................ [ 76%]
........................................................................ [ 78%]
........................................................................ [ 81%]
........................................................................ [ 84%]
........................................................................ [ 87%]
........................................................................ [ 89%]
........................................................................ [ 92%]
........................................................................ [ 95%]
........................................................................ [ 97%]
........................................................                 [100%]
=================================== FAILURES ===================================
____________________ test_the_breach_probe_meets_the_policy ____________________

    def test_the_breach_probe_meets_the_policy() -> None:
        """The probe (tasks.md T144): built from this tree on the pinned base:python, on internal alone, and disclosed."""
        model = real_model()
        lock = cp.parse_lock(REPO / cp.LOCK_FILE)
        assert cp.check_service(PROBE, model["services"][PROBE], model, lock, REPO) == []
        disclosed = cp.disclosed_services(REPO / cp.DISCLOSURE_FILE)
        assert PROBE in disclosed
        # The policy requires its row, as every service's (FR-040).
        found = cp.check_model(model, lock, REPO, disclosed - {PROBE})
>       assert [(f.where, f.rule) for f in found if not f.planned] == [
            (f"{cp.COMPOSE_FILE} service {PROBE}", "disclosure")
        ]
E       AssertionError: assert [('deploy/com...'disclosure')] == [('deploy/com...'disclosure')]
E         
E         At index 0 diff: ('deploy/compose.yaml service web', 'image') != ('deploy/compose.yaml service breach-probe', 'disclosure')
E         Left contains one more item: ('deploy/compose.yaml service breach-probe', 'disclosure')
E         Use -v to get more diff

tools/gates/test/test_compose_policy.py:894: AssertionError
_________________ test_the_real_compose_file_passes_as_written _________________

    def test_the_real_compose_file_passes_as_written() -> None:
        """The raw file, through PyYAML (short-syntax ports, anchors), meets every compose rule too."""
        model = yaml.safe_load((REPO / cp.COMPOSE_FILE).read_text(encoding="utf-8"))
        lock = cp.parse_lock(REPO / cp.LOCK_FILE)
        disclosed = cp.disclosed_services(REPO / cp.DISCLOSURE_FILE)
        found = cp.check_model(model, lock, REPO, disclosed)
>       assert [f for f in found if not f.planned] == []
E       AssertionError: assert [Finding(wher...sha256:...)')] == []
E         
E         Left contains one more item: Finding(where='deploy/compose.yaml service web', rule='image', detail='h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}: not pinned by digest (repository:tag@sha256:...)')
E         Use -v to get more diff

tools/gates/test/test_compose_policy.py:951: AssertionError
___________________________ test_the_real_files_pass ___________________________

tree = PosixPath('/tmp/claude-1000/pytest-of-h4reet/pytest-69/test_the_real_files_pass0')
capsys = <_pytest.capture.CaptureFixture object at 0x745c55bafad0>

    @needs_compose
    def test_the_real_files_pass(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
>       assert cp.run(tree) == 0
E       AssertionError: assert 1 == 0
E        +  where 1 = <function run at 0x745c569e91c0>(PosixPath('/tmp/claude-1000/pytest-of-h4reet/pytest-69/test_the_real_files_pass0'))
E        +    where <function run at 0x745c569e91c0> = cp.run

tools/gates/test/test_compose_policy.py:965: AssertionError
----------------------------- Captured stdout call -----------------------------
FAIL deploy/compose.yaml service web: image: h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}: not pinned by digest (repository:tag@sha256:...)
compose policy: 1 refusal(s) (deploy/compose.yaml with 3 env files, the Dockerfiles, the env-file placement, .devcontainer, .npmrc)
___________________________ test_end_to_end_refusals ___________________________

tree = PosixPath('/tmp/claude-1000/pytest-of-h4reet/pytest-69/test_end_to_end_refusals0')
capsys = <_pytest.capture.CaptureFixture object at 0x745c54a7c050>

    @needs_compose
    def test_end_to_end_refusals(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
        compose = tree / cp.COMPOSE_FILE
        # gateway-state's own networks line, the first after its name: it alone joins egress below.
        head, name, tail = compose.read_text(encoding="utf-8").partition(
            "  gateway-state:\n"
        )
        assert name and "networks: [internal]\n" in tail
        compose.write_text(
            head
            + name
            + tail.replace("networks: [internal]\n", "networks: [internal, egress]\n", 1),
            encoding="utf-8",
        )
        write(tree / "deploy/stray.env", "A=1\n")
        assert cp.run(tree) == 1
        out = capsys.readouterr().out
        assert (
            "FAIL deploy/compose.yaml service gateway-state: networks: only gateway joins egress"
            in out
        )
        assert "FAIL deploy/stray.env: env file" in out
>       assert "compose policy: 2 refusal(s)" in out
E       assert 'compose policy: 2 refusal(s)' in "FAIL deploy/compose.yaml service gateway-state: networks: only gateway joins egress, the stack's one route out (FR-04... 3 refusal(s) (deploy/compose.yaml with 3 env files, the Dockerfiles, the env-file placement, .devcontainer, .npmrc)\n"

tools/gates/test/test_compose_policy.py:996: AssertionError
=========================== short test summary info ============================
FAILED tools/gates/test/test_compose_policy.py::test_the_breach_probe_meets_the_policy
FAILED tools/gates/test/test_compose_policy.py::test_the_real_compose_file_passes_as_written
FAILED tools/gates/test/test_compose_policy.py::test_the_real_files_pass - As...
FAILED tools/gates/test/test_compose_policy.py::test_end_to_end_refusals - as...
4 failed, 2644 passed in 193.57s (0:03:13)
make[1]: *** [Makefile:234: test] Error 1
-> FAIL test
== content-check
PLANNED (T080): tools/gates/content_check.py arrives with the approvals patch
-> PLANNED content-check (PLANNED (T080): tools/gates/content_check.py arrives with the approvals patch)
== secrets
bash tools/gates/secrets.sh
secrets: gitleaks with /home/h4reet/h4reet-ai/h4reet-ai/.gitleaks.toml, over /tmp/claude-1000/wt-us2
== gitleaks: unstaged changes
10:12PM INF 0 commits scanned.
10:12PM INF scanned ~0 bytes (0) in 27.3ms
10:12PM INF no leaks found
-> PASS unstaged changes
== gitleaks: staged changes
10:12PM INF 0 commits scanned.
10:12PM INF scanned ~0 bytes (0) in 27.8ms
10:12PM INF no leaks found
-> PASS staged changes
== gitleaks: 371 commits since main (23731e14f137..HEAD)
10:12PM INF 371 commits scanned.
10:12PM INF scanned ~6717785 bytes (6.72 MB) in 589ms
10:12PM INF no leaks found
-> PASS 371 commits since main (23731e14f137..HEAD)
secrets: PASS (unstaged changes, staged changes, 371 commits since main)
-> PASS secrets
== evals
python3 -I -B -X pycache_prefix=/dev/null evals/run.py --suite product --adapter ${ADAPTER:-fake} $([ "${ADAPTER:-}" = local ] && echo --stack prod)
PASS  hello-fake
evals product (fake): 1 passed, 0 failed
python3 -I -B -X pycache_prefix=/dev/null evals/run.py --suite narration --adapter fake
PASS  narration-agent-watchdog-engineer
PASS  narration-agent-watchdog-non-engineer
PASS  narration-ai-strategy-engineer
PASS  narration-ai-strategy-non-engineer
PASS  narration-change-management-engineer
PASS  narration-change-management-non-engineer
PASS  narration-cht-agent-data-layer-engineer
PASS  narration-cht-agent-data-layer-non-engineer
PASS  narration-cht-agent-engineer
PASS  narration-cht-agent-non-engineer
PASS  narration-cht-codebase-engineer
PASS  narration-cht-codebase-non-engineer
PASS  narration-cht-docker-architecture-engineer
PASS  narration-cht-docker-architecture-non-engineer
PASS  narration-cht-skills-engineer
PASS  narration-cht-skills-non-engineer
PASS  narration-claude-medic-aws-engineer
PASS  narration-claude-medic-aws-non-engineer
PASS  narration-kenya-localization-engineer
PASS  narration-kenya-localization-non-engineer
PASS  narration-national-benchmarking-engineer
PASS  narration-national-benchmarking-non-engineer
PASS  narration-no-code-configuration-engineer
PASS  narration-no-code-configuration-non-engineer
PASS  narration-other-deployments-engineer
PASS  narration-other-deployments-non-engineer
PASS  narration-smart-task-prioritization-engineer
PASS  narration-smart-task-prioritization-non-engineer
PASS  narration-voice-for-cht-engineer
PASS  narration-voice-for-cht-non-engineer
evals narration (fake): 30 passed, 0 failed
python3 -I -B -X pycache_prefix=/dev/null evals/agent-config/static.py
PASS  CLAUDE.md is 58 lines and 5901 bytes (at most 60 and 6 KB)
PASS  CLAUDE.md names the constitution as superseding it
PASS  REVIEW.md names the constitution as superseding it
PASS  role docs: tools match roles.expected
PASS  role implementer: tools match roles.expected
PASS  role ops: tools match roles.expected
PASS  role red-teamer: tools match roles.expected
PASS  role reviewer: tools match roles.expected
PASS  role spec-writer: tools match roles.expected
PASS  hook .claude/hooks/bash-gate.sh is registered for PreToolUse Bash
PASS  hook .claude/hooks/protected-paths.sh is registered for PreToolUse Edit|Write|MultiEdit|NotebookEdit
PASS  hook .claude/hooks/post-edit-check.sh is registered for PostToolUse Edit|Write|MultiEdit
PASS  hook .claude/hooks/subagent-report-check.sh is registered for SubagentStop (every subagent)
PASS  hook .claude/hooks/content-scan.sh is registered for PreToolUse Edit|Write|MultiEdit
PASS  FR-007: 27 of 27 variables denied by name
agent-config static: 0 failed, 0 planned
python3 -I -B -X pycache_prefix=/dev/null evals/agent-config/behavioral.py status
behavioral tier: 13 cases (10 enforcement, 3 conduct), 3 runs each; trigger hash 3f4caf1b916a
PASS  behavioral tier: 2026-10-12T184140Z-fix-000-gate-on-main-4907f2bf42e8 passed for trigger hash 3f4caf1b916a, the newest run for it
agent-config behavioral: pass, 0 planned
python3 -I -B -X pycache_prefix=/dev/null evals/docs_links.py
PASS  every relative link resolves: 1367 links in 163 files
PASS  README.md links the ADR index (docs/adr/)
PASS  the ADR index links every ADR file: 20 of 20
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 1367 relative links in 163 files
-> PASS evals
== redteam
python3 -I -B -X pycache_prefix=/dev/null redteam/run.py
PASS  benign-greeting (safe, clean)
PASS  planted-human-claim (unsafe, caught: claims to be human)
redteam: 2 passed, 0 failed
-> PASS redteam
== matrix
bash redteam/forbidden-actions.sh
KNOWN GAP   bash-gate.sh          make $(printf 'aws-%s' login) ENV=prod
KNOWN GAP   bash-gate.sh          t=aws; make "$t-login" ENV=prod
KNOWN GAP   bash-gate.sh          bash deploy/scripts/aws-l?gin.sh
KNOWN GAP   bash-gate.sh          gh pr \<newline>merge 1
KNOWN GAP   bash-gate.sh          make $'aws\x2dlogin' ENV=prod
KNOWN GAP   bash-gate.sh          python3 -c "import importlib; importlib.import_module(\"evals\" + \".run\").main()" --adapter bedrock
KNOWN GAP   bash-gate.sh          cd evals && python3 run.py --suite product --adapter bedrock
KNOWN GAP   bash-gate.sh          python3 /tmp/o.py --stack prod contract-record --adapter bedrock --out /tmp/r.json --reason "a live run"
KNOWN GAP   bash-gate.sh          /tmp/a sso login --profile h4reet-bedrock
KNOWN GAP   bash-gate.sh          python3 -c 'open("tests/test_router.py", "w").write("")'
KNOWN GAP   bash-gate.sh          install -m 0644 /tmp/new.py tests/test_router.py
KNOWN GAP   bash-gate.sh          git checkout HEAD~1 -- tests/test_router.py
KNOWN GAP   role:red-teamer       make redteam 2>&1 -f /tmp/x.mk
KNOWN GAP   role:red-teamer       make redteam 2>&1 -f /tmp/x.mk [--agent]
KNOWN GAP   role:red-teamer       make evals X='a|b' -f /tmp/x.mk
KNOWN GAP   role:red-teamer       make evals X='a|b' -f /tmp/x.mk [--agent]
KNOWN GAP   role:red-teamer       make redteam --fi=/tmp/x.mk
KNOWN GAP   role:red-teamer       make redteam --fi=/tmp/x.mk [--agent]
KNOWN GAP   role:red-teamer       GNUMAKEFLAGS=-f/tmp/x.mk make redteam
KNOWN GAP   role:red-teamer       GNUMAKEFLAGS=-f/tmp/x.mk make redteam [--agent]
KNOWN GAP   role:red-teamer       MAKEFILES+=/tmp/x.mk make redteam
KNOWN GAP   role:red-teamer       MAKEFILES+=/tmp/x.mk make redteam [--agent]
KNOWN GAP   role:reviewer         git log -p >&1x
KNOWN GAP   role:reviewer         git log -p >&1x [--agent]
KNOWN GAP   bash-gate.sh          python3 evals/agent-config/behavioral.py run
KNOWN GAP   bash-gate.sh          python3 tools/gates/matrix_canary.py
KNOWN GAP   bash-gate.sh          python3 tools/gates/publish_check.py
KNOWN GAP   bash-gate.sh          git commit $(printf -- '--no-%s' verify) -m wip
KNOWN GAP   bash-gate.sh          $(printf 'cla%s' ude) mcp add fs cmd
KNOWN GAP   bash-gate.sh          python3 -c "import urllib.request as u; u.urlopen('http://127.0.0.1:%d/admin/status' % (18000 + 3))"
KNOWN GAP   bash-gate.sh          make $(printf 'to%s' ols)
KNOWN GAP   bash-gate.sh          a shell write in a linked worktree: tools/gates/gate
KNOWN GAP   bash-gate.sh          a shell write in a linked worktree: evals/agent-config/static.py
KNOWN GAP   bash-gate.sh          git apply --cached /tmp/gates.patch
KNOWN GAP   bash-gate.sh          git update-index --add --cacheinfo "100644,$(git hash-object -w /tmp/new),tools/gates/gate"
KNOWN GAP   bash-gate.sh          git read-tree --prefix=tools/gates/ feature/x:tools/gates
KNOWN GAP   bash-gate.sh          git read-tree --prefix=evals/agent-config/ feature/x:evals/agent-config
PLANNED     protected-paths.sh    assets/policy/content-approvals.json
PLANNED     protected-paths.sh    assets/policy/resume-header.json
PLANNED     protected-paths.sh    apps/../assets/policy/content-approvals.json
PLANNED     protected-paths.sh    ./assets//policy/resume-header.json
PLANNED     protected-paths.sh    Edit in a linked worktree: assets/policy/content-approvals.json
KNOWN GAP   bash-gate.sh          a shell write in a linked worktree: assets/policy/content-approvals.json
--- stage S: the sandbox (SANDBOX_RUNTIME=1, .git/hooks unwritable) ---
NOTE        stage-S-unwritable    ~/.local/state/h4reet: no mask of its own, but it sits on a read-only mount (covered read-only /)
NOTE        stage-S-unwritable    assets/policy/content-approvals.json: no mask of its own, but it sits on a read-only mount (covered read-only /home/h4reet/h4reet-ai/h4reet-ai/assets/policy)
NOTE        stage-S-unwritable    assets/policy/resume-header.json: no mask of its own, but it sits on a read-only mount (covered read-only /home/h4reet/h4reet-ai/h4reet-ai/assets/policy)
SKIP        stage-S-conn          the SMTP host row: H4_STAGE_S_SMTP_HOST isn't set: it names the alert channel's SMTP host, deploy/env's SMTP_HOST
NOTE        stage-S-conn          npm and 198.18.0.1:2376 (allowed) need the proxy and the engine; proved by stage E and make engine-smoke
--- stage E: the host (folded from /home/h4reet/.local/state/h4reet/agents-engine/prove-report.txt, which proved commit 58bd2327212e at 2026-10-18T00:54:24Z) ---
E1   PASS  (from prove-limits.sh)
E2   PASS  (from prove-limits.sh)
E3   PASS  (from prove-limits.sh)
E4   PASS  (from prove-limits.sh)
E5   PASS  (from prove-limits.sh)
E6   PASS  (from prove-limits.sh)
E7   PASS  (from prove-limits.sh)
E8   PASS  (from prove-limits.sh)
E9   PASS  (from prove-limits.sh)
E10  PASS  (from prove-limits.sh)
E11  PASS  (from prove-limits.sh)
E12  PASS  (from prove-limits.sh)
E13  PASS  (from prove-limits.sh)
E14  PASS  (from prove-limits.sh)
E15  PASS  (from prove-limits.sh)
E16  PASS  (from prove-limits.sh)
KNOWN GAP   bash-gate.sh          sh -c "$(printf 'gi%s pu%s' t sh)"
KNOWN GAP   bash-gate.sh          sh -c 'unset CLAUDE""CODE; git commit -m wip'
KNOWN GAP   bash-gate.sh          e=engine; deploy/agents-engine/$e.sh up
PLANNED     settings.json         the content policy files are write-denied, by the sandbox and by Edit denies (spec 002, T016)
PLANNED (T016): 6 content-policy rows wait for the approvals patch, which protects assets/policy/content-approvals.json and resume-header.json
TOTALS      matrix                6 planned (reported, not failing), 1 skipped: stage S's SMTP row has no usable host
REQUIRED    matrix-required       every listed row ran
forbidden-actions (hook layer): 665 passed, 0 failed, 41 known gaps
-> PLANNED matrix (PLANNED (T016): 6 content-policy rows wait for the approvals patch, which protects assets/policy/content-approvals.json and resume-header.json)
== image
SKIP: no agents' engine yet: tasks.md T046
-> SKIP image (no agents' engine yet: tasks.md T046)

PASS     makefiles-check
FAIL     githooks-check
FAIL     toolchain-check
FAIL     policy
PASS     validate-config
PASS     lint
FAIL     test
PLANNED  content-check  PLANNED (T080): tools/gates/content_check.py arrives with the approvals patch
PASS     secrets
PASS     evals
PASS     redteam
PLANNED  matrix  PLANNED (T016): 6 content-policy rows wait for the approvals patch, which protects assets/policy/content-approvals.json and resume-header.json
SKIP     image  no agents' engine yet: tasks.md T046
make check: 6 PASS, 1 SKIP, 2 PLANNED, 0 PENDING, 4 FAIL; failing: githooks-check FAIL, toolchain-check FAIL, policy FAIL, test FAIL
make: *** [Makefile:147: check] Error 1
make check exit 2
```

## For the Author

1. **N3, a backlog decision: "Pause the room" is inert while the resume offer shows.** The toolbar stays inert from Enter until the visitor answers "Read the resume now" or "Keep it for later", as spec 002's layout makes it. The hand-off and the offer play first, so a visitor who wants the room still can't pause until they answer the offer. WCAG 2.2.2 asks for a way to pause moving content. The hand-off ends within its own few seconds, but the room's idle motion is already running behind the offer. You could keep it as it is, or make the pause button alone usable during the offer. The offer's inertness comes from code, not a contract: `apps/web/src/room/app.ts` sets `layout.setInteractive(false)` at Enter and turns it back on only in `settle()`, and the pause click is guarded by `open()` (`visit.stage === "room" && !offering`). So that change is code only. A contract change, to spec 002's room-scene.md §3 ("keys and clicks during it do nothing but move focus"), is needed only if you want pausing during the hand-off itself. This branch keeps it as it is.
2. **Merge order.** Line R: M8, M9, P-10, then User Story 1 (T118, T119), User Story 3 (T147, T148), then this branch (T166, T167), then `feat/004-us7-access` (T175).
3. **The claims amendment changes contracts.** T163's option (a) changes contracts/room-bundle.md §3.1, room-data-files.md §13.4 (RS3), tier-signal.md §2, and data-model.md: the index carries a tier switch's claims. The delta review's fix adds how the not-live fallback picks its pose. When a bundle's claims are faulty (which only a bundle the compositor refuses can be), the text copy states the reduced tier while the laptop shows the shared pose. room-bundle.md §3.1 accepts that as defence in depth.
4. **`make check`'s four FAILs**, the same as `feat/004-us3-lookdev`'s note:
   - `policy`: `deploy/compose.yaml`'s web image isn't pinned by digest; the pin comes with spec 002's web patch (M9).
   - `test`: the four `tools/gates/test/test_compose_policy.py` cases that follow from the same pin (2,644 others pass).
   - `toolchain-check`: Claude Code drift, pinned 2.1.296 and found 2.1.311 (T013, a human's fix).
   - `githooks-check`: this line predates P-4's pre-commit hook. It ends once the branch is rebased onto a `main` that has the hook (T166).

Nothing on this branch changes a permission, a sandbox domain, or the constitution, and nothing is pushed.
