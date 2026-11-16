# Notes: spec-029 (spec-writer, night 4, 2026-11-16)

Branch `night/spec-029/spec-029`, from `f411d8e1`. Documents only: `intent/029-room-polish.md` (draft), and in `specs/029-room-polish/` the spec, its clarifications (Q1 to Q15, each recommended answer taken under his rule 1), the plan, the tasks, the analysis, and these notes. No code, test, corpus, or human-only path was changed.

## What was done, in order (each a save point)

1. `070becf2`: the intent, his two messages and his answer quoted word for word, the screenshot's description marked as the orders'.
2. `17d94ba8`: the spec, groups A to D, Q1 to Q13.
3. `e50cdfa3`: reworked to `probe-words-029`'s (`84f3d45a`) and `probe-pick-029`'s (`928916b7`) notes. The changes:
   - the room-text route and approval by hash;
   - RT13 and the dog sign's wait for his answer;
   - spec 024's set-aside face;
   - the sourced card drafts, with no narration claim;
   - Q14 and Q15.
4. `e8c4e5f3`: "Selected" made `aria-hidden`.
5. `4bdcf5f5`: the plan.
6. `2032549a`, `ec5db244`: the spec and the plan reworked to B0's note (`probe-chat-029`, `0c641530`). The faults:
   - his regenerated pack closed every topic (readiness, his alone);
   - the split panel's `> *` rule took the log's row (code);
   - "SERVING Unknown" is `live.source: off`.

   Also added: FR-014a (the readiness section of the room report).
7. `4eed8d35`: the tasks.
8. The analysis (AN-1 to AN-9) and its fixes; these notes.

## Questions

Questions are in `/night/io/out/questions.md`, 8 of them. Where a probe asks the same question, it isn't asked twice; the file's header names those: spec Q3, Q5, Q6, Q11, Q12, Q14, Q15, Q4's free-talk part, and Q13's dinosaur line.

## Refusals

One. The bash gate refused a `python3 -I` heredoc that rewrote plan §6. Its text contained a proposed `make` target name for the later real-browser test, and the hook said:

> Blocked by .claude/hooks/bash-gate.sh — an Author-only make target (spec 001). Route: the Author runs it in his terminal (spec 001 research.md R-32); ask the Author

I didn't respell it. I made the same document edit with the editor tool, which runs no shell, and reworded the plan to "one new target in the Makefile for it", naming none.

## Checks run

- `make setup` (exit 0; "git hooks: … isn't writable here (the agent sandbox); the Author runs make git-hooks").
- `node_modules/.bin/prettier --check specs/029-room-polish intent/029-room-polish.md`: "All matched files use Prettier code style!".
- `make lint`, exit 0, with the analysis committed (shellcheck's file list cut):

  ```
  node_modules/.bin/eslint --max-warnings 0 .
  for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
  node_modules/.bin/prettier --check .
  Checking formatting...
  All matched files use Prettier code style!
  ruff check .
  All checks passed!
  ruff format --check --no-cache --extend-exclude corpus .
  877 files already formatted
  exit 0
  ```
- No `make test` or `make evals`: no code changed. The one full `make check` is T-INT's.

## What's left

- **The four implementers**: T-A, T-B, T-C, and T-D, from this branch's tip, beside each other.
- **T-INT**: the merges, the approvals patch, the stack's note, and the one `make check`.
- **The reviews**: a reviewer's read of these documents (the analysis isn't one).
- **His hand**:
  - the answers on the page;
  - the readiness re-mark (B0's Q-B0-1);
  - the approvals patch;
  - accepting the intent, and moving it into the spec folder with the outlines' `intent_ref`;
  - his look.
