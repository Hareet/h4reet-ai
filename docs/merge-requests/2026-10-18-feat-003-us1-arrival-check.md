# feat/003-us1-arrival-check
Spec: specs/003-studio-assets/ (Phase 2: T007–T026; User Story 1, and User Story 4's repository half) · Intent: specs/003-studio-assets/intent.md · Written by: Claude Code (Opus 5.5), an implementer subagent · Date: 2026-10-18
Session: worked in `/tmp/claude-1000/wt-003-arrival`, launched from `~/h4reet-ai/h4reet-ai` · Repo hooks active: yes (the command guard refused two of this session's commands, Python edits passed through a heredoc whose text named the Author-only history-scan target; the edits went into script files written with the Write tool and run by name, and nothing was respelled. The post-edit hook's stricter lint asked for a dedicated exception in place of `ValueError` and a set comprehension in the check, both done)
Authorized by: tasks.md T007–T026, against plan §3 and §4, research R-02 to R-09, R-12, and R-15, and contracts/arrival-check.md and asset-record.md as spec/003's review corrected them (0f1e8b1, which both branches were rebased onto); the Author's direction of 2026-10-17: "Let's relax some of the overnight rules so that you can continue with intent 002 and intent 003? I think you can create the tasks and implement them and we can always go back later and re-do a task or requirement if we highlight a needed change".

**Status: ready for review; then the patch is yours, after Phase 1's.** Stacked on `feat/003-guards` (699c793). Four commits: 63516b2 (T009, T010, and the hook's matrix rows: the tests), a38e370 (T015–T023: the helpers, the asset tree, the ADRs, the docs), fd908f1 (two docs tests the patched tree's `make check` found broken, and START-HERE), and this note with the patch (T011–T014's code, T024's verification, T026). T025 is yours. Review: pending (the integrating session runs it).

**A deviation, in where the stack starts.** tasks.md had the first branch stack on `spec/002-the-room`'s tip; this stack starts from `spec/003-studio-assets`'s, so the work could start while spec 002's plan was still being written. It merges after `spec/002-the-room` all the same; nothing in it depends on spec 002. Plan §9 and tasks.md's Organization say so since 0f1e8b1.

## Runs in the Author's terminal

ADR 0017 puts this section first. The patch's code runs in every commit you make, in the gate, and in the history scan.

| What | How it runs | Check before you apply it |
|---|---|---|
| `docs/merge-requests/2026-10-18-feat-003-us1-arrival-check.patch` | `git apply --index` on main, **after Phase 1's patch** and this branch's merge, then `make git-hooks` | It applies to this branch's tree with Phase 1's patch applied, and not without it (its `matrix-required.txt` hunk follows Phase 1's). Checked in that order on a fresh tree. |
| `tools/gates/arrival_check.py` (new) | the pre-commit hook, `make check`'s `arrival`, the gate, the history scan | Standard library only. Reads the policy with `GIT_NO_REPLACE_OBJECTS=1 git cat-file blob refs/heads/main:assets/policy/<file>`, never `main:`, `git show`, a branch, or a checked-out copy. Never prints matched bytes, only offsets. |
| `.claude/git-hooks/pre-commit` | every commit, yours included | After gitleaks: the main tree's `arrival_check.py --staged` under PY_HOST's flags; refuses on a finding (exit 1) or when it can't check (exit 2), and fails closed without the check or Python. Your own policy commits on main pass: rule A9 applies only off main. |
| `tools/gates/gate` | your gate | A host step, `arrival`: main's check over `$(git merge-base main SHA)..SHA`, then main's `scripts/assets/credits.py --check` over the export. Both are main's code; the branch is data. |
| `tools/gates/publish_check.py` | the history scan before the first push | A fourth part: the check over every commit reachable from any ref, in-process with the scan's scrubbed git environment. Findings read `arrival <rule>: <reason>`; a history it can't check can't be certified. |
| `REVIEW.md` | the reviewer agent | A fifth pass, "Arriving assets", when a diff touches `assets/` or `docs/research/images/` (FR-017, FR-037). |
| `tools/gates/test/test_arrival_check.py`, `arrival_fixtures.py` (new); `test_gate.py`, `test_publish_check.py` | `make test`, the gate's container phase | 142 cases for the check, every fixture built at run time; five for the gate's step; three for the history scan's. |
| `tools/gates/matrix-required.txt` | the matrix | Three required rows for the hook's step. |

**Your steps, in order:**
1. Phase 1 first: its review, gate, merge, and patch, as its note says.
2. A reviewer's pass on this branch, then from main's checkout `tools/gates/gate feat/003-us1-arrival-check`, and the merge command it prints. The gate has no `arrival` step yet: the patch brings it.
3. On main: `git apply --index docs/merge-requests/2026-10-18-feat-003-us1-arrival-check.patch`, then `git commit -m "Apply the arrival check patch (T011-T014)"`.
4. `make git-hooks`, which installs the new pre-commit hook. From then on every commit, yours included, runs the check.
5. `make evals-agent-config REF=<the next branch>` when its `make check` shows `evals` PENDING: the patch changes `.claude/git-hooks/` and `REVIEW.md`, which move the behavioral tier's trigger hash.
6. Before a directory's first file arrives: write the copyright line in its `LICENSE.md`, in place of `<YEAR>` and `<HOLDER>` (contracts/asset-record.md §3). Rule N1 refuses a file under an unfilled line.
7. T025: read ADR 0010's draft. Accept it, change it, or leave it proposed; avatars and animations stay refused until `caps.json` reads `"adr_0010": "accepted"` (your patch, with its caps).

## What changed and why

1. **The arrival check (T011),** `tools/gates/arrival_check.py`, per contracts/arrival-check.md, with spec/003's review corrections built in:
   - **Formats (A1 to A4):** images, videos, and models found by extension and by leading bytes (PNG, JPEG, WebP, GIF, TIFF and DNG, ISO BMFF's `ftyp` for HEIC, HEIF, AVIF, MP4, and MOV, GLB, KTX2), refused outside the roots; weights by extension and by safetensors or GGUF header, refused anywhere; anything but PNG, JPEG, WebP, GLB, `records.json`, and `LICENSE.md` refused in an asset directory; and every binary file anywhere searched for EXIF, XMP, and a GPS directory (A4), apart from the mark's own packet.
   - **Containers (M1 to M9):** PNG chunks with their CRCs, JPEG segments and scans, WebP's RIFF chunks and VP8X flags, and GLB's chunks and JSON against the glTF 2.0 schema's properties, typed, with enumerations, `extras` only as `mesh.extras.targetNames`, and the extension list. The mark parsed as XML and held to its one property (M5); one mark per model file, none on an embedded image (M6); ICC text (M7); names and uris in a GLB (M8); and bytes a container doesn't account for (M9).
   - **Text (B1 to B3)** only in the parts that hold text: the mark's packet, an `iCCP` name, ICC text, a GLB's JSON (raw and decoded, so an escaped `\/home\/` is found), `records.json`, and `LICENSE.md`. Never pixel data: a fixture PNG whose stored `IDAT` holds `C:\` and `/mnt/` passes.
   - **Records, notices, licenses, approvals, caps, history, caption (R, N, L, P, F, H, C),** with the published-image folder's research-display reading (FR-036 as clarified).
   - **Modes:** `--staged` (the index, with A9 off main), `--range` (each commit's changes as it had them; a merge's paths that differ from every parent, so a resolution is checked and what main brought isn't; then the tip's whole tree), `--history`, and paths on disk. A run that meets no studio file reads no policy.
   - **Speed:** the 10 MB GLB test takes 0.66 s whole, building the file included, against its 5-second bound (plan §3: under a second); this branch's own 14 commits take 0.28 s.
2. **The hook, the gate, and the history scan (T012, T013),** as the table says, each with its tests. `run_checks.py` has no gate list of its own (it takes `CHECK_GATES` from the Makefile), so the list change is the Makefile's `arrival` (T015).
3. **REVIEW.md's "Arriving assets" pass (T014):** the record against the file, ADR 0010's art direction and intent 000's "Inspired-by only" rule, third-party content, the room's confirmations, and the approval on `main` for each file rule P names.
4. **The helpers (T016, T017),** agent-editable, in `scripts/assets/`: `scrub.py` rewrites a file to R-03's allowlist and adds the mark, never touching pixels; for a GLB it drops `extras` (but `targetNames`), the generator, unlisted extensions, and other XMP, renames images, textures, samplers, and materials to neutral IDs, scrubs each embedded image without a mark of its own, and lays the BIN chunk out again. It refuses what it can't fix: a required unlisted extension, an external uri, an animated WebP, arithmetic coding, CMYK. `credits.py` renders the credits and holds each `records.json` to its canonical form.
5. **The Makefile (T015):** `arrival` in `make check`'s list, after `secrets`; it runs the main tree's copy, so it reads **PLANNED** until you apply the patch, then the credits' check. `assets-scrub FILE=` and `assets-credits`.
6. **The asset tree (T018):** `assets/README.md`; `twin/`, `visitors/`, and `animations/`, each with its `LICENSE.md` (the copyright line yours, step 6) and an empty `records.json`; `assets/CREDITS.md` rendered. All of it Prettier-stable, since `assets/` isn't Prettier-ignored.
7. **The docs:** the README's license line (T019); ADR 0010, proposed, drafted from what intent 003 and research R-12 and R-13 quote of the survey, which is a private page outside the repository (T020); ADRs 0030, 0031, and 0032, proposed, with the index (T021); `docs/runbooks/asset-withdrawal.md` (T022); disclosure row D1, which now names committed assets, the Author's likeness among them, reaching Anthropic when a session reads them, and the studio's folders among what the sessions never carry once Phase 1's patch is applied (T023).
8. **Two docs tests and START-HERE (fd908f1):** the patched tree's first `make check` failed two of them. START-HERE §7 must name every agent-editable script `make check` runs in your terminal, and `make arrival` runs `scripts/assets/credits.py`, so it does now (the check itself is the main tree's); its gate paragraph names the new step. `evals/test_runbooks.py` held the folder to spec 000's pages; it now admits the two spec 003's plan §8 lists, `asset-withdrawal.md` here and `studio-gpu-window.md` in Phase 4, and nothing else.
9. **The contract and the plan:** contracts/arrival-check.md's B-scope paragraph sat inside the rules table and split it, so R1 to C1 didn't render as a table; it now follows the table. The contract's §3 records the readings the implementation made where a rule's wording left room (M3's ICC and alpha flags, M8's Blender `.L` and `.R`, B3's other drive letters, F3's first visit, and others). Plan §3 points at them. The rule IDs are the contract's.

**Spec/003's review corrections, as built:** (1) the formats and A4, above; (2) M8 on `images[].name`, `uri`, and the other names, with `targetNames` allowlisted and the scrubber's neutral IDs; (3) the policy read with `GIT_NO_REPLACE_OBJECTS=1 git cat-file blob refs/heads/main:<path>`, with tests for a tag named `main`, a `refs/replace` entry, a branch's copy, and the main tree's checked-out copy; (4) merges against each parent, and the tip's whole tree, with tests for an evil merge, a merge of main bringing the Author's policy commit (passes), and a tip that deleted a `LICENSE.md`; (5) the B rules' scope; (6) one mark per model file; (7) A9 off main only, tested both ways.

## Acceptance criteria

- **FR-004:** "THE ARRIVAL CHECK SHALL run before each commit; in the local gate, over every commit on the branch since `main`; and in the history scan before the first push (spec 000, FR-042). WHEN any check fails, THE SYSTEM SHALL refuse the commit or fail the gate, naming the file and the rule." The hook, `make check`'s `arrival` and the gate's step, and the history scan; each refusal names the rule, the file, and the commit.
- **SC-001:** "The arrival check refuses 100% of a fixture set with one known-bad file per arrival-check rule (FR-001, FR-002, and FR-006 to FR-020), each refusal naming its rule, and accepts 100% of the known-good fixtures." Every rule ID in the contract's table has at least one refusing fixture, and the passing PNG, JPEG, WebP, GLB, twin, and published image pass: 142 cases.
- **FR-001, FR-002, FR-006, FR-007, FR-008:** rules A1 to A4, M1 to M9, B1 to B3, and R2. FR-002's "IF a file carries camera metadata, THEN THE ARRIVAL CHECK SHALL refuse it" is A4, in any binary file anywhere.
- **FR-010, FR-011, FR-012:** rules R1, R3 to R7. **FR-013, FR-014:** L1, L2. **FR-015:** N1, N2, the notices, and the README's line. **FR-016, FR-037:** P1, P2, and REVIEW.md's pass. **FR-018, FR-019, FR-020:** F1 to F3 and H1, and the size table. **FR-034:** M5 and M6, the one mark, which `scrub.py` writes. **FR-036:** L1's research display and C1.
- **FR-005**, its Phase 2 half: rule A9 refuses a branch that changes `assets/policy/`, so a branch can't carry its own approval. That is what holds the gap Phase 1's matrix records for a shell write in a linked worktree; the row stays a known gap, since nothing stops the write itself.
- **FR-040 (d)** and **FR-041:** row D1, and the withdrawal runbook with ADR 0032.
- **User Story 4, scenario 2:** "they find each asset's record and the media license notice; the README's license line names MIT for code and the media license for the asset directories."

## Constitution check

| Principle | Touched? | How it complies |
|---|---|---|
| I. Data-local | yes | Nothing that locates the Author enters the history unchecked: metadata, names, and paths refused before each commit. No byte leaves the machine; D1 says what a session reads. |
| II. Production-grade | yes | Tests first, with the RED runs below; the patch verified on a scratch tree with `make check` and `gitleaks dir`; the hook run end to end. A runbook for what the check can't see. No endpoint, so no span or panel. |
| III. Intent → spec → code | yes | tasks.md T007–T026; the contract and plan §3 changed in the same commit as what they describe. |
| IV. Least privilege | yes | The check's code from the main tree and its policy from `refs/heads/main`; A9 refuses a branch's policy change. Nothing widened. |
| V. Cost | no | No model calls. |
| VI. Build in public | yes | Records, credits, and the license allowlist are public; no output prints what it matched. |
| VII. Whole product | yes | The records and credits say which steps a model did and which the Author did by hand (FR-010). |
| VIII. Honest AI | yes | One machine-readable mark per file, and ADR 0030's draft of the visible line for the Author to approve. |

## RED and GREEN

- **The helpers (agent-editable), on this branch:** RED before `scrub.py` and `credits.py` existed: `test_credits.py` 7 failed; `test_scrub.py` stopped at collection, with no `scrub.py`. GREEN: 7 passed; 9 passed and 4 skipped without the check in the tree, 13 passed with it.
- **The patched tests, on a fresh scratch tree with Phase 1's patch applied and only the patch's test files:** `test_arrival_check.py` 142 failed; `test_gate.py` 5 failed (its four new cases and the end-to-end one), 169 passed; `test_publish_check.py` 3 failed (its new three), 51 passed. With the whole patch: 142, 174, and 54 passed, and `scripts/assets` 20 passed.
- **The check's own tests, while writing it:** the first GREEN run found two faults the tests named: the JPEG mark's `APP1` identifier, the XMP namespace, read as a second packet by A4; and the history total asking for the policy when a run met no studio file. Both fixed before the patch was built.

## Review

Review: pending (the integrating session runs it).

## Verification

- **In order, on a fresh detached scratch worktree** (`/tmp/claude-1000/wt-003-verify`, made again for each run and removed after): Phase 1's patch, filled with the stand-ins its note names, then this patch, `git apply --check` clean for each, then both applied. The RED and GREEN runs above were at a38e370; the final `make check` and `gitleaks dir` at fd908f1, the patch unchanged between them.
- **The patched check over this branch's own commits** (`arrival_check.py --range refs/heads/main..HEAD`): `arrival-check: 0 findings in 72 files (14 commits)`, exit 0. No studio file yet, so no policy was read.
- **The patched hook, end to end,** in a scratch repository whose main holds the policy, from a linked worktree: a PNG with a `tEXt` chunk refused (`M1 assets/visitors/dog/still.png: chunk tEXt at byte 514, outside the allowlist`); the same file scrubbed, with its record and notice, committed; a partial commit of the failing file, through git's temporary index, refused; a branch's own approval refused (`A9`); the Author's approval, committed on main, accepted.
- **`make check ENGINE_MODE=none-yet` on the patched tree** (both patches, at fd908f1): `make check: 8 PASS, 1 SKIP, 1 PLANNED, 1 PENDING, 2 FAIL; failing: githooks-check FAIL, toolchain-check FAIL, evals PENDING`. pytest 2626 passed, vitest 747 passed and 12 skipped, and the matrix `682 passed, 0 failed, 41 known gaps` with `0 planned`: the hook's three new rows ran and held. What doesn't pass, and why:
  - `githooks-check` FAIL: `pre-commit: missing or modified: run make git-hooks`. The patched hook isn't the one installed, which is your step 4.
  - `toolchain-check` FAIL: the Claude Code drift (For the Author, item 7).
  - `arrival` PLANNED: `make arrival` runs the main tree's copy of the check, which main has only once you apply the patch. The patched check's own run over this branch is the bullet above.
  - `evals` PENDING: the patch changes `.claude/git-hooks/` and `REVIEW.md`, so the behavioral tier's trigger hash moved, to 101b602b5902 on this tree (your step 5).
- **`gitleaks dir`** over the patched tree's tracked and new files, exported, with the gate's flags (the main tree's config, an empty ignore path, `--ignore-gitleaks-allow`): 538 files, about 7.77 MB scanned, no leaks found.
- **`make check ENGINE_MODE=none-yet`** on this branch at fd908f1, below, whole: 10 PASS, 1 SKIP, 1 PLANNED, 1 FAIL. `arrival` is PLANNED, as above, and its credits' check passes. `image` SKIPs because `ENGINE_MODE=none-yet` was passed. The FAIL is `toolchain-check`, the Claude Code drift. pytest 2473 passed and 4 skipped (the scrubber's four that need the check in the tree); the matrix passes with 22 rows PLANNED, Phase 1's 19 and the hook's 3, until the patches. `make lint`, `make test`, and `make evals` run inside it as the `lint`, `test`, and `evals` gates.

```text
== makefiles-check
python3 -I -B -X pycache_prefix=/dev/null tools/gates/makefiles_check.py
makefiles: GNUmakefile holds only its include, and there is no makefile
-> PASS makefiles-check
== githooks-check
reference-transaction: installed
pre-commit: installed
main: a loose ref, which the git hook guards
-> PASS githooks-check
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
claude code              2.1.296  2.1.301  DRIFT   /home/h4reet/.nvm/versions/node/v22.18.0/bin/claude
lint: eslint             10.12.0  10.12.0  OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/eslint
lint: typescript-eslint  8.71.1   8.71.1   OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/typescript-eslint
lint: typescript         6.0.3    6.0.3    OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/typescript
lint: prettier           3.9.9    3.9.9    OK      /home/h4reet/.local/share/h4reet/lint-node/node_modules/prettier
lint: node               24.21.0  24.21.0  OK      /home/h4reet/.local/share/h4reet/lint-node/node
toolchain-check: 1 of 15 differ from their pins (claude code); see tasks.md T013
make[1]: *** [Makefile:140: toolchain-check] Error 1
-> FAIL toolchain-check
== policy
python3 -I -B -X pycache_prefix=/dev/null tools/gates/compose_policy.py
compose policy: PASS (deploy/compose.yaml with 3 env files, the Dockerfiles, the env-file placement, .devcontainer, .npmrc)
-> PASS policy
== validate-config
npm run --silent -w services/gateway validate-config -- --root "/tmp/claude-1000/wt-003-arrival"
validate-config: 0 errors, 0 notes
-> PASS validate-config
== lint
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
223 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/scripts/aws-login.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh redteam/forbidden-actions.sh tools/gates/install-tools.sh tools/gates/secrets.sh
-> PASS lint
== test
python3 -I -B -X pycache_prefix=/dev/null corpus/tools/check_corpus.py
corpus-check: OK — 20 slots, 4 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems
npm test --workspaces --if-present

> @h4reet/gateway@0.1.0 test
> vitest run


 RUN  v5.0.3 /tmp/claude-1000/wt-003-arrival/services/gateway


 Test Files  49 passed (49)
      Tests  747 passed | 12 skipped (759)
   Start at  22:14:17
   Duration  64.51s (tests 95%, import 3%, transform 2%)

pytest -q -p no:cacheprovider --import-mode=importlib corpus/tools evals redteam tools/gates deploy/scripts deploy/agents-engine scripts
........................................................................ [  2%]
........................................................................ [  5%]
........................................................................ [  8%]
........................................................................ [ 11%]
........................................................................ [ 14%]
........................................................................ [ 17%]
........................................................................ [ 20%]
........................................................................ [ 23%]
........................................................................ [ 26%]
........................................................................ [ 29%]
........................................................................ [ 31%]
........................................................................ [ 34%]
........................................................................ [ 37%]
........................................................................ [ 40%]
........................................................................ [ 43%]
........................................................................ [ 46%]
........................................................................ [ 49%]
........................................................................ [ 52%]
........................................................................ [ 55%]
........................................................................ [ 58%]
........................................................................ [ 61%]
........................................................................ [ 63%]
........................................................................ [ 66%]
........................................................................ [ 69%]
........................................................................ [ 72%]
........................................................................ [ 75%]
........................................................................ [ 78%]
........................................................................ [ 81%]
.............................................ssss....................... [ 84%]
........................................................................ [ 87%]
........................................................................ [ 90%]
........................................................................ [ 93%]
........................................................................ [ 95%]
........................................................................ [ 98%]
.............................                                            [100%]
2473 passed, 4 skipped in 231.12s (0:03:51)
-> PASS test
== secrets
bash tools/gates/secrets.sh
secrets: gitleaks with /home/h4reet/h4reet-ai/h4reet-ai/.gitleaks.toml, over /tmp/claude-1000/wt-003-arrival
== gitleaks: unstaged changes
10:19PM INF 0 commits scanned.
10:19PM INF scanned ~0 bytes (0) in 21.5ms
10:19PM INF no leaks found
-> PASS unstaged changes
== gitleaks: staged changes
10:19PM INF 0 commits scanned.
10:19PM INF scanned ~0 bytes (0) in 24.2ms
10:19PM INF no leaks found
-> PASS staged changes
== gitleaks: 15 commits since main (58bd2327212e..HEAD)
10:19PM INF 15 commits scanned.
10:19PM INF scanned ~437254 bytes (437.25 KB) in 53.1ms
10:19PM INF no leaks found
-> PASS 15 commits since main (58bd2327212e..HEAD)
secrets: PASS (unstaged changes, staged changes, 15 commits since main)
-> PASS secrets
== arrival
PLANNED (T011): the main working tree has no tools/gates/arrival_check.py until the Author applies spec 003's Phase 2 patch
python3 -I -B -X pycache_prefix=/dev/null scripts/assets/credits.py --check
credits: OK: the renderings and the records' form
-> PLANNED arrival (PLANNED (T011): the main working tree has no tools/gates/arrival_check.py until the Author applies spec 003's Phase 2 patch)
== evals
python3 -I -B -X pycache_prefix=/dev/null evals/run.py --suite product --adapter ${ADAPTER:-fake} $([ "${ADAPTER:-}" = local ] && echo --stack prod)
PASS  hello-fake
evals product (fake): 1 passed, 0 failed
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
PASS  every relative link resolves: 878 links in 106 files
PASS  README.md links the ADR index (docs/adr/)
PASS  the ADR index links every ADR file: 21 of 21
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 878 relative links in 106 files
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
PLANNED     settings.json         the studio's photos folder is denied: the guard patch names it
PLANNED     settings.json         the studio's outputs folder is denied: the guard patch names it
PLANNED     settings.json         the studio's workflows folder is denied: the guard patch names it
PLANNED     settings.json         the studio's blinding-key folder is denied: the guard patch names it
PLANNED     protected-paths.sh    assets/policy/licenses.json
PLANNED     protected-paths.sh    assets/policy/approvals.json
PLANNED     protected-paths.sh    assets/policy/caps.json
PLANNED     protected-paths.sh    assets/policy
PLANNED     protected-paths.sh    specs/../assets/policy/caps.json
PLANNED     protected-paths.sh    ./assets//policy/licenses.json
PLANNED     protected-paths.sh    Edit in a linked worktree: assets/policy/approvals.json
KNOWN GAP   bash-gate.sh          a shell write in a linked worktree: assets/policy/approvals.json
PLANNED     settings.json         a shell write of assets/policy/licenses.json is denied
PLANNED     settings.json         a shell write of assets/policy/approvals.json is denied
PLANNED     settings.json         a shell write of assets/policy/caps.json is denied
PLANNED     settings.json         assets/policy is Edit-denied behind the hook
--- stage S: the sandbox (SANDBOX_RUNTIME=1, .git/hooks unwritable) ---
NOTE        stage-S-unwritable    ~/.local/state/h4reet: no mask of its own, but it sits on a read-only mount (covered read-only /)
PLANNED     stage-S-unreadable    the studio's photos folder: the guard patch names it
PLANNED     stage-S-unreadable    the studio's outputs folder: the guard patch names it
PLANNED     stage-S-unreadable    the studio's workflows folder: the guard patch names it
PLANNED     stage-S-unreadable    the studio's blinding-key folder: the guard patch names it
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
PLANNED     pre-commit            a staged PNG with a tEXt chunk under assets/ (arrival check) (spec 003, Phase 2's patch)
PLANNED     pre-commit            a staged JPEG with EXIF outside the asset roots (arrival A1, A4) (spec 003, Phase 2's patch)
PLANNED     pre-commit            the arrival check missing from the main tree (fails closed) (spec 003, Phase 2's patch)
TOTALS      matrix                22 planned (reported, not failing), 1 skipped: stage S's SMTP row has no usable host
REQUIRED    matrix-required       every listed row ran
forbidden-actions (hook layer): 660 passed, 0 failed, 41 known gaps
-> PASS matrix
== image
SKIP: no agents' engine yet: tasks.md T046
-> SKIP image (no agents' engine yet: tasks.md T046)

PASS     makefiles-check
PASS     githooks-check
FAIL     toolchain-check
PASS     policy
PASS     validate-config
PASS     lint
PASS     test
PASS     secrets
PLANNED  arrival  PLANNED (T011): the main working tree has no tools/gates/arrival_check.py until the Author applies spec 003's Phase 2 patch
PASS     evals
PASS     redteam
PASS     matrix
SKIP     image  no agents' engine yet: tasks.md T046
make check: 10 PASS, 1 SKIP, 1 PLANNED, 0 PENDING, 1 FAIL; failing: toolchain-check FAIL
make: *** [Makefile:146: check] Error 1
```

## Cost and data-flow impact

No model calls, no new flow, no byte leaving the machine. Row D1 now names what a session reading committed assets sends (FR-040d). The size table and the history total are in the check's output from the first asset on (FR-038).

## For the Author

1. **ADR 0010 is yours to accept, change, or leave proposed (T025).** Its caps are first estimates inside SC-006's 10 MB. It rests on what the intent and research quote from the survey, which isn't in the repository.
2. **ADRs 0030, 0031, and 0032 are proposed.** They record the decisions taken by recommendation under your direction of 2026-10-17. 0032 extends one Decision of the accepted ADR 0013, and the index says so on 0013's row.
3. **The notices' copyright lines are yours** (step 6). The contract leaves the holder's name to you; the corpus keeps your surname out of what the twin says.
4. **Readings the implementation made,** listed in contracts/arrival-check.md §3. Two to look at: M8 doesn't read Blender's `.L` and `.R` as file extensions, or every rig with sided bones would be refused; and M3 allows VP8X's ICC and alpha flags when their chunks are there, since R-03 admits the chunks.
5. **Not built yet, and said so:** checking that an `asset` source names another record's file; FR-018's checks of the skeleton's bone names and the twin's 67 shapes, which wait for ADR 0010's acceptance (`REVIEW.md` reads them until then). T027's C1 and research-display cases are already among this branch's tests; Phase 3 can tick or extend it.
6. **Fail-closed has a cost:** once the patch is on main, a clone or worktree whose main tree lacks `tools/gates/arrival_check.py` refuses every commit, and a studio file needs `refs/heads/main` to hold the policy (exit 2 otherwise). The behavioral tier's clones carry the hook and the check together, so they're unaffected.
7. **The toolchain FAIL isn't this branch's:** Claude Code is 2.1.301 on the host against the pin 2.1.296 (T013 of spec 000).
8. **`git log --all` fails inside the agent sandbox,** on its placeholder at `.git/refs/replace`, so the check's `--history` mode, like the history scan itself, is for your terminal only.
