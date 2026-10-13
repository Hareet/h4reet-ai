# fix/000-live-case-temperature
Spec: specs/000-local-foundations/ (T107, SC-006: the live contract run) · Intent: specs/000-local-foundations/intent.md · Written by: Claude Code (Opus 5.5), the integrating session · Date: 2026-10-13
Session: worked in `/tmp/claude-1000/wt-temp1`, launched from `~/h4reet-ai/h4reet-ai` · Repo hooks active: yes (the command guard refused one `cp` that read from the worktree's `tools/gates/`, taking the path for the main tree's; the patch was built from `git show` output instead, and nothing was respelled)
Authorized by: the Author's choice on 2026-10-13, option 2 ("let's go with option 2 since it will be the quickest"), and the Author's first live contract run, whose replay the gate failed.

**Status: ready for your review.** Branched from 92ae734, main's tip. Your part: commit, apply the gate patch and commit it, run the gate, and merge (the steps below).

## Runs in the Author's terminal

ADR 0017 puts this section first.

| What | How it runs | Check before you apply it |
|---|---|---|
| `docs/merge-requests/2026-10-13-fix-000-live-case-temperature-gate.patch` | `git apply --index` on this branch | `tools/gates/gate`'s `--contract-replay`: the vitest output is matched with the terminal's escape sequences (CSI) taken out first. The rule is unchanged: a test that passed under `recorded live: <the recording's adapter> (`. Two new tests in `tools/gates/test/test_gate.py`: coloured output under the recording's adapter passes, and coloured output under another adapter's name still fails. |

## What changed and why

1. **The live suite's temperature case sends 1.** Claude Haiku 5.5 refuses any temperature but its default, 1, with a 400, so `temperature-zero` would have failed SC-006's Bedrock run.
   - By your decision it's `temperature-one`, in `live-cases.json`, the two name lists that pin the cases (`replay.test.ts`, `test_operator_record.py`), and contracts/provider-adapter.md §5.4.
   - The stub suite's C9 still sends 0 to both adapters, so temperature 0's pass-through keeps a test.
   - plan §5.2 records the decision, and that a model taking no temperature at all (the Opus line, Fable) would need the adapter to drop it instead.
2. **The gate's replay check ignored a coloured pass** (the patch). Your first `make contract-live ENV=prod ADAPTER=local` passed all 15 replay tests, C1–C8 under `recorded live: local (live)` included. The gate then failed it with "no test passed under recorded live: local". It counts a line only when it starts with `✓`, and vitest prints a colour code before the tick in the container. The gate's tests had only uncoloured output. This was the first live replay.

## Verification

- `make test` on the branch, before the patch: 747 passed in vitest (12 skipped), 2,446 passed in pytest.
- With the patch, on a scratch copy: `tools/gates/test/test_gate.py`, 170 passed; ruff clean.
- With the patch's tests and the unpatched gate: the coloured pass fails, as it should, and the other-adapter case still fails.
- The changed test files lint, format, and type-check clean.

## For the Author

1. In `/tmp/claude-1000/wt-temp1`, the branch's worktree: `git status --short` lists five changed files and two new ones, this note and the patch. `git add` those seven, then `git commit -F /tmp/claude-1000/msg-temp1.txt`.
2. Apply the patch there: `git apply --index docs/merge-requests/2026-10-13-fix-000-live-case-temperature-gate.patch`, then `git commit -m "Apply the gate's coloured-replay patch (T107)"`.
3. From main's checkout: `tools/gates/gate fix/000-live-case-temperature`, then the merge command it prints.
4. SC-006 (§6.1), from main's checkout once merged: `make contract-live ENV=prod ADAPTER=local REASON="…"` again, then `ADAPTER=bedrock`, each followed by `make operator-status ENV=prod`. The Bedrock run is about 10 calls, under $0.05, charged to prod's meters as `test`.
