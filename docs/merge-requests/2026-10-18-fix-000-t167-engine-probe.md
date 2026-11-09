# fix/000-t167-engine-probe
Spec: specs/000-local-foundations/ (T167, T166; FR-041) · Intent: specs/000-local-foundations/intent.md · Written by: Claude Code (Opus 5.5), an implementer subagent · Date: 2026-10-18
Session: worked in `/tmp/claude-1000/wt-t167`, launched from `~/h4reet-ai/h4reet-ai` · Repo hooks active: yes (`2026-10-18T01:08:32Z bash BLOCK running the agents' engine's Author commands`: the guard matched the engine script's name inside T167's commit message, in a heredoc. The message went in by file, written with the Write tool, and nothing was respelled)
Authorized by: tasks.md T167 and T166, against plan §11 and contracts/agents-engine.md §8.

**Status: reviewed, APPROVE; ready for your gate and merge.** Branched from 58bd232, main's tip. Four commits: b564be9 (T167), 5bdd38c (T166), 625c77c (this note), and the review's two wording fixes. Your part: the gate and the merge.

## Runs in the Author's terminal

Nothing. There is no patch, and the branch touches no human-only path.

## What changed and why

1. **T167: the image gate's wait for the agents' engine is bounded** (`Makefile`).
   - In the relay's mode (the sandbox, with the relay and the agents' certificate), `make image` and `make build` first run one `docker version` through the relay under `timeout --kill-after=5 15` (`ENGINE_PROBE_SECONDS`). A timeout fails the step with "the agents' engine didn't answer within 15 s; ask the Author: deploy/agents-engine/engine.sh up". Any other non-zero exit fails it the same way, naming the exit status, with docker's or the relay's own error above it.
   - Why: the relay has no timeout. While RootlessKit's forward took connections and never answered (T046, 2026-10-09), `make check` waited at `image` with no end. T158 fixed that forward, but nothing bounded the wait if it, or anything behind it, hangs again.
   - `timeout` signals its whole process group, so the relay's socat and the docker client stop with it, and the relay's exit trap still runs. I checked that with a relay-like script under TERM and INT: the work directory, where the relay keeps the proxy's credentials, was removed, and nothing was left running.
   - `build` probes after the workspaces' build, just before it relays, so a session with the engine down still gets the TypeScript build's result.
   - `none-yet` and `no-cli` SKIP as before, and ask nothing. The direct mode (already relayed, or `DOCKER_HOST=tcp://198.18.0.1:2376`) is unchanged: inside the relay, the outer run has already asked.
   - Plan §11's image row says so, in the same commit, and so does contracts/agents-engine.md §9's "engine is down" row.
2. **T166: §8's bring-up paragraph is folded into the command table** (contracts/agents-engine.md).
   - The paragraph "Setup and up, after T046's bring-up (2026-10-09)" amended the `setup` and `up` rows. Its five points are now in those rows, in its own words, and the paragraph is gone. `feat/000-us1-local-stack`, which changed the `up` row, has merged.
   - `setup`: "the Author, never under `sudo`" replaces "the Author, with sudo"; the refusal under sudo and why (`SUDO_USER`); writing into `h4agents`' home only as `h4agents` (H13); and the `wsl --shutdown` asked for only while one is needed, with the marker, and `down` then `up` otherwise.
   - `up`: both user managers reloaded before their units start; TLS waited for up to a minute, each try stopped after 5 s, then the two journals.
   - Two small repairs: the `up` row lacked "starts" before `h4agents`' user services, and T179's extra `setup` now comes "after the shutdown", as §5 says, since "before that `up`" could also have read as the `up` of the no-shutdown path.

## Acceptance criteria

- **FR-041:** `make check` runs the image build. With this, the gate ends, PASS, FAIL, or SKIP, whatever the forward does (T167).
- **T166:** none. It consolidates the contract (contracts/agents-engine.md §8, partial).

## Constitution check

| Principle | Touched? | How it complies |
|---|---|---|
| I. Data-local | no | No new byte leaves. The probe is one `docker version` to the agents' engine through the existing opening, ahead of a build that already went there. |
| II. Production-grade | yes | Tests first (four, six cases), with the RED run below. The plan and the contract's degraded-mode row are updated. A make target, not an endpoint, so no span or panel. |
| III. Intent → spec → code | yes | tasks.md T167 and T166. Plan §11 changed in the same commit as the code. |
| IV. Least privilege | no widening | No permission, allowlist, or credential changes. The probe uses the relay and certificate agents already have, and the branch touches no human-only path. |
| V. Cost | no | No model calls. |
| VI. Build in public | yes | The RED run and the hook's refusal are recorded here. |
| VII. Whole product | no | Developer tooling. |
| VIII. Honest AI | no | – |

## Review

One pass by the reviewer agent, which didn't write the change, against REVIEW.md, the spec, the plan, tasks T166 and T167, the engine's contract, and the constitution: **APPROVE, no blockers.** It ran the six new cases at 625c77c: all passed, and the hanging case failed `make image` in 2.01 s against its 2 s bound. Reading the tests against the old Makefile confirms "4 failed, 2 passed". Its checks:
- **Cleanup on a timeout holds.** `timeout` signals the relay's whole process group; the relay sets its EXIT trap before it writes `proxy-auth`, and the trap runs on SIGTERM. Exit codes 124 and 137 fail with "didn't answer", any other non-zero fails naming its code, and nothing counts as a pass (`Makefile:72-77`).
- **The modes are right.** The probe is only in the relay branches; none-yet and no-cli SKIP without asking; the direct mode is unchanged.
- **The tests** use stand-ins and only add tests. The stand-in relay's background `sleep` holds make's stderr, so the 2.01 s result also shows the kill reaching the relay's children.
- **T166 keeps all five points**, mostly word for word, and no human-only path changed.

Two of its nits are fixed in a fourth commit, by the integrating session:
- "only while one is needed" had come to follow `up` in the `setup` row, so it read as limiting the `up`; the source put it on the `wsl --shutdown`, and the row now does too.
- "within 15 s" in the contract's degraded-mode row and plan §11: the `--kill-after` path can take 20 s, and both now say so. (The make message's "didn't answer within 15 s" is true on either path, so it stays.)

Its other two nits, and its backlog, are below.

**Backlog from the review:**
- `ENGINE_PROBE_SECONDS=0` on the command line turns the bound off (GNU `timeout` reads 0 as no limit). It affects only the agent that passes it.
- No automated test checks that the relay's work directory is gone after a timeout: the stand-in has none, and the TERM/INT check above was by hand.
- The pasted `make check` ran with `ENGINE_MODE=none-yet`, so `image` was skipped; relay mode has run for real only as the bare probe. The next `make check` without that override should paste its `image` line.
- Still unbounded: the relayed `up` and `down` targets, `breach-test`, a build that hangs after a probe that answered, and the gate's own image step (human-only; "For the Author" item 2).
- The probe tries once and doesn't retry.

## Verification

- **RED first:** the new tests against the unchanged Makefile gave 4 failed and 2 passed. The two passes are the SKIP cases, which hold the existing behavior. The hanging engine held `make image` until the test's own 60 s cap (`subprocess.TimeoutExpired`), and the refusing engine got as far as a `buildx build`.
- **GREEN:** `scripts/test_makefile.py`, 37 passed. The hanging case fails `make image` in 2.01 s at a 2 s bound.
- **The real path, once, with no build:** `timeout --kill-after=5 15 deploy/agents-engine/docker-relay docker version` answered `server 28.3.3` in under a second, exit 0.
- **`make check ENGINE_MODE=none-yet`**, on 5bdd38c, below, whole: 10 PASS, 1 SKIP, 1 FAIL. `image` SKIPs because `ENGINE_MODE=none-yet` was passed. The FAIL is `toolchain-check`: the host's Claude Code is 2.1.301 against the pin 2.1.296 in `.devcontainer/toolchain.vars`. The branch doesn't touch that file, and main has the same pin. `make lint`, `make test`, and `make evals` run inside it as the `lint`, `test`, and `evals` gates.

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
make[1]: *** [Makefile:152: toolchain-check] Error 1
-> FAIL toolchain-check
== policy
python3 -I -B -X pycache_prefix=/dev/null tools/gates/compose_policy.py
compose policy: PASS (deploy/compose.yaml with 3 env files, the Dockerfiles, the env-file placement, .devcontainer, .npmrc)
-> PASS policy
== validate-config
npm run --silent -w services/gateway validate-config -- --root "/tmp/claude-1000/wt-t167"
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
190 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/scripts/aws-login.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh redteam/forbidden-actions.sh tools/gates/install-tools.sh tools/gates/secrets.sh
-> PASS lint
== test
python3 -I -B -X pycache_prefix=/dev/null corpus/tools/check_corpus.py
corpus-check: OK — 20 slots, 4 filled, denylist missing or hidden from this session, so rule 4 was skipped, 0 problems
npm test --workspaces --if-present

> @h4reet/gateway@0.1.0 test
> vitest run


 RUN  v5.0.3 /tmp/claude-1000/wt-t167/services/gateway


 Test Files  49 passed (49)
      Tests  747 passed | 12 skipped (759)
   Start at  19:10:29
   Duration  62.02s (tests 94%, import 3%, transform 3%)

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
........................................................................ [ 32%]
........................................................................ [ 35%]
........................................................................ [ 38%]
........................................................................ [ 40%]
........................................................................ [ 43%]
........................................................................ [ 46%]
........................................................................ [ 49%]
........................................................................ [ 52%]
........................................................................ [ 55%]
........................................................................ [ 58%]
........................................................................ [ 61%]
........................................................................ [ 64%]
........................................................................ [ 67%]
........................................................................ [ 70%]
........................................................................ [ 73%]
........................................................................ [ 76%]
........................................................................ [ 78%]
........................................................................ [ 81%]
........................................................................ [ 84%]
........................................................................ [ 87%]
........................................................................ [ 90%]
........................................................................ [ 93%]
........................................................................ [ 96%]
........................................................................ [ 99%]
...............                                                          [100%]
2463 passed in 162.55s (0:02:42)
-> PASS test
== secrets
bash tools/gates/secrets.sh
secrets: gitleaks with /home/h4reet/h4reet-ai/h4reet-ai/.gitleaks.toml, over /tmp/claude-1000/wt-t167
== gitleaks: unstaged changes
7:14PM INF 0 commits scanned.
7:14PM INF scanned ~0 bytes (0) in 31.9ms
7:14PM INF no leaks found
-> PASS unstaged changes
== gitleaks: staged changes
7:14PM INF 0 commits scanned.
7:14PM INF scanned ~0 bytes (0) in 32ms
7:14PM INF no leaks found
-> PASS staged changes
== gitleaks: 2 commits since main (58bd2327212e..HEAD)
7:14PM INF 2 commits scanned.
7:14PM INF scanned ~13315 bytes (13.31 KB) in 40.8ms
7:14PM INF no leaks found
-> PASS 2 commits since main (58bd2327212e..HEAD)
secrets: PASS (unstaged changes, staged changes, 2 commits since main)
-> PASS secrets
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
PASS  every relative link resolves: 813 links in 82 files
PASS  README.md links the ADR index (docs/adr/)
PASS  the ADR index links every ADR file: 17 of 17
PASS  User Story 6's five decisions have their ADRs: 0001 (local-first routing), 0002 (one compose topology), 0003 (local-compose-first delivery), 0004 (Langfuse and Grafana), 0005 (Telegram alerting)
docs links: 0 failed, 813 relative links in 82 files
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
--- stage S: the sandbox (SANDBOX_RUNTIME=1, .git/hooks unwritable) ---
NOTE        stage-S-unwritable    ~/.local/state/h4reet: no mask of its own, but it sits on a read-only mount (covered read-only /)
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
TOTALS      matrix                0 planned (reported, not failing), 1 skipped: stage S's SMTP row has no usable host
REQUIRED    matrix-required       every listed row ran
forbidden-actions (hook layer): 658 passed, 0 failed, 40 known gaps
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
PASS     evals
PASS     redteam
PASS     matrix
SKIP     image  no agents' engine yet: tasks.md T046
make check: 10 PASS, 1 SKIP, 0 PLANNED, 0 PENDING, 1 FAIL; failing: toolchain-check FAIL
make: *** [Makefile:158: check] Error 1
```

## Cost and data-flow impact

None. There are no model calls and no new flows. The probe is one `docker version` to the agents' engine through the existing opening, ahead of a build that already went there. The disclosure needs no entry.

## For the Author

1. **The toolchain FAIL isn't this branch's.** Claude Code on the host is 2.1.301, and `.devcontainer/toolchain.vars` pins 2.1.296 (T013). Every branch's `make check` fails on it until the pin moves or the CLI goes back.
2. **The gate's own image step has no bound either.** `tools/gates/gate` talks to `198.18.0.1:2376` directly, so a forward that takes connections and never answers would hold the gate at `image` the same way. That file is human-only. If you want it bounded, say so, and a patch can follow.
3. **The probe makes one try.** If the engine is still starting, the step fails rather than waits. `engine.sh up` itself waits up to a minute for TLS, so by the time it returns the engine answers.
4. **To merge:** a reviewer's pass, then from main's checkout `tools/gates/gate fix/000-t167-engine-probe`, then the merge command it prints.
