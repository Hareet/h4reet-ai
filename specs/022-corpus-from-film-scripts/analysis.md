# Analysis: spec 022, across spec.md, plan.md, tasks.md

Read-only check, 2026-11-14, by the spec-writer. Constitution check: VII (no ownership beyond `01`'s and `08`'s rulings: FR-002, plan §2 rules), VIII (corpus-only twin; unbuilt and stale claims kept out: FR-007, Q4), III (a human merges: FR-001, Assumptions), VI (the proposal and the left-out table are public). No deviation to name.

## Coverage

Every FR (001 to 013) and SC (001 to 004) maps to a task and a small test (tasks.md, Coverage). Each task names its test files and `make lint`; the full `make check` is T012 only (rule 4). The approval line and the Author's words are at the top of `plan.md` and `tasks.md`.

## Findings

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| A1 | Medium | T009 needs node and `node_modules` in the export to regenerate the pack, the lock, and the cases; agents' sandboxes may not run them (CLAUDE.md: agents' pytest and node_modules are the Author's host's). | T009 already allows the fallback: patch the corpus files only, and the note lists the regeneration commands as the Author's first step. The reviewer must say which path was taken. |
| A2 | Medium | Q2: the scripts' per-script approval by the Author isn't recorded in what was read (only the films' language, 2026-11-10). The build proceeds on his applying the patch being the approval. | Kept as Q2 with the left-out table for striking lines. |
| A3 | Low | Q6's Haiku quote is "this session, 2026-11-10": not in any filed intake. The tag `[A 2026-11-10]` needs it to be his. | Marked "to confirm" (FR-010, T006); on the morning page as Q6. |
| A4 | Low | `apps/web/content/resume.lock.json` is also moved by the resume item's stack (the lock pins `08`). | Plan §6 and T010 name the overlap; the later merge regenerates the lock. |
| A5 | Low | T012's "this task or the stack's last, whichever is later" is loose. | One task runs it, at the stack's end; the supervisor names it. No change to this spec. |
| A6 | Low | Q1's other reading (third-party screenplays) would change the whole deliverable; FR-012 and the quoting table cover only the rule, not the work. | If he picks it, the spec is reworked before merge (the order's rule 1). |
| A7 | Info | "Seven films" in Q1: five folders plus `SCRIPTS.md` §5 and §6 (`stack`, `lifecycle`), which have folders and scripts too. Consistent with `films/README.md`'s table, which lists five and not `stack` and `lifecycle`. | The checker reads `SCRIPTS.md` sections, so the count is not a test input. |

No needs-clarification marker is left in the requirements. No finding blocks the build.
