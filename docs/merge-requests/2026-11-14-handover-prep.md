# handover-prep: the hand-over section, drafted (rule 12)

Branch `night/handover-prep/handover-prep`, from the line's tip `ce3f6305` (`night/merge-2/merge-2`), off the line, documents only. Written by: implementer (handover-prep, Opus 5.5) · Date: 2026-11-15 · Spec: 018-better-hud-and-load-screen (the stack's first item; the section covers the whole stack)

## What changed

One section appended at the end of `docs/merge-requests/2026-11-14-night-stack.md`: `## For the repo agent and the Author`, in rule 12's order:

1. the stack's name and tip (`feat/018-hud-to-dino-stack`; the tip left for the integration task);
2. the merge order and the gate: the 017 studio-prompt patch on main first, main merged into the stack by his hand (Q286), the "no usage event" ADR, D-V2's two test patches on the stack, then `tools/gates/gate <branch>` from main's checkout, his to run;
3. every patch for his hand, one row each (P1 to P11): file, item, what it changes, SHA-256, order, open question;
4. per item, what ships as a stand-in or as code, with the code path that reads the studio asset later;
5. per item, its backlog: a pointer to its heading, with only what the page adds;
6. "Next: studio assets" (S1 to S8): the man's and woman's `walk` clips, the dog's `run` clip, the twin's walk and run, the dinosaur's and dog's models taken in, and Q288's round 5 of the dog;

and "Questions this section raised" (HP-1 to HP-5). No code, test, spec, scene, asset, or human-only path changed, and nothing was merged.

## What I read

- `docs/merge-requests/2026-11-14-night-stack.md` at `ce3f6305`, every item's section by its headings: What changed, Acceptance criteria, the reviews, For the Author, the backlogs, What waits, and each verification's summary, merge-1, and merge-2. I didn't read every pasted test log line by line. Of the long run pastes (verify-024's runs, merge-2's runs) I read the summaries and verdicts.
- `docs/merge-requests/2026-11-14-rounds4-020.md`, whole but the pasted runs.
- Every file in `docs/merge-requests/human-patches/` (017's, 018 to 025, 027) and the four in `proposed/` (their file headers, and `git apply --check` and `--check -R` against `ce3f6305`, nothing applied).
- The page, `refs/heads/night/supervisor/2026-11-14:docs/night-shift/2026-11-14.md` at `3613ee3f`: its Questions (Q254 to Q297) and Stacks, and the copied reviews of rv-intake-020 and rv-impl-025. Night 1's, `refs/heads/night/supervisor/2026-11-13:docs/night-shift/2026-11-13.md` at `50fcb941`: Q164 (D-V2), Q165, Q149, Q152, Q161, Q231, Q247, Q248, Q249.
- Off the line, with `git show`: `night/patch-claude-md/patch-claude-md:docs/merge-requests/human-patches/stack-claude-md-lines.md` (`40c10cef`; Q276, Q277); `night/intake-020/intake-020` (`eee66786`), its diff against `ce3f6305` and item 3's added sections; `night/notes2-020/notes2-020` (`864b9d5e`), its diff stat and `apps/web/test/room/dog-intake.test.ts`.
- The line's code, to name the paths that read each asset: `apps/web/src/choice/avatars.ts`, `build/room/avatars.ts`, `src/room/scene/avatars.ts`, `twin-states.ts`, `chase.ts`, `chase-figures.ts`, `src/room/scene.ts`, `build/room/checks/rg.ts` (lines cited in the section).

## What I left for the integration task

- Section 1: the stack's tip; the held intake's line "(the integration task fills this from your answer to Q288)".
- Section 2: the result of its one try at `git merge refs/heads/main` (Q286); item 9's `human-patches/026.md` for any `tools/gates/**` change.
- Section 3: P7's SHA-256 ("rebuilt by patch3-026 (Q297); SHA-256 filled by the integration task").
- Sections 4 and 5: item 9's rows, from item 9's verify.
- Section 6: S7 from your answer to Q288.
- The answers to HP-1 to HP-5, if the page has them by then.

## Questions

Five, in `/night/io/out/questions.md`, each with its recommended answer (the section's "Questions this section raised" lists them as HP-1 to HP-5):
- HP-1: the twin's `walk` and `run` clips have no reader in the code (`TWIN_CLIP_ROLES`).
- HP-2: the one "no usage event" ADR (Q149, Q152, Q161) isn't drafted on the line.
- HP-3: P11 ends Q249's line with no full stop; the review's words end "instead.".
- HP-4: rv-rework2-024's CLAUDE.md line isn't in P11 and has no page question.
- HP-5: `human-patches/020.md` items 1 and 2: done, open, or moot after round 4.

## Runs (rule 4)

The setup target ran first (no `node_modules`), exit 0; its git-hooks step said the hooks folder "isn't writable here (the agent sandbox); the Author runs make git-hooks".

The tests covering the changed documents, from the repository's root:

```
$ python3 -I -m pytest -q -p no:cacheprovider --import-mode=importlib evals/test_docs_links.py evals/test_repository_docs.py
.............................................................            [100%]
61 passed in 1.07s
```

The lint target, whole output, run after the section was complete and before this note:

```
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
826 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
lint exit 0
```

Again, with this note's first draft in the tree: the lint target, exit 0, its lines filtered with `grep -E "Prettier|All checks|formatted|warning|error"` (the whole run's other lines as above); and the docs tests' last line:

```
lint exit 0
node_modules/.bin/eslint --max-warnings 0 .
All matched files use Prettier code style!
All checks passed!
827 files already formatted
61 passed in 0.98s
```

No full suite: rule 4 gives the stack's one `make check` to one task at the end.

Human-only paths, assets, code, and specs, at `71252bc8` (the section complete, before this note):

```
$ git diff --stat ce3f6305 HEAD -- .claude tools/gates corpus assets CLAUDE.md REVIEW.md .specify/memory/constitution.md evals/agent-config redteam/forbidden-actions.sh deploy/night-shift apps services specs
$ echo $?
0
$ git diff --stat ce3f6305 HEAD
 docs/merge-requests/2026-11-14-night-stack.md | 104 ++++++++++++++++++++++++++
 1 file changed, 104 insertions(+)
```

The first prints nothing. This note is the branch's only other file.

## Interruptions

None. No hook, bash-gate, permission, or filesystem refusal. Nothing was respelled. Every commit printed gitleaks' "no leaks found" and an `arrival-check: 0 findings` line.
