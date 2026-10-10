# fix/000-agents-make
Spec: specs/000-local-foundations/ (task T183, found in T064) · Intent: specs/000-local-foundations/intent.md · Written by: Claude Code (Opus 5.5) · Date: 2026-10-09
Session: started from `~/h4reet-ai/h4reet-ai`, the repository root · Repo hooks active: yes.

Authorized by: T183 in tasks.md, which asks for the Author's decision; and the Author's "I want you to keep going as far as you can and group all the pieces you need my attention for me to check in the morning" (2026-10-09). This branch only prepares the decision: the file it proposes is human-only, so it comes as a patch, and a no changes nothing.

**Merge order:** stacked on `fix/000-engine-gpu-user`, the top of the us1 stack. It fast-forwards after it.

## The problem

An agent session can't run plain `make` for dev-cpu:
- **In the main tree,** the sandbox's write-deny on `./GNUmakefile` and `./makefile` (T045, against a planted makefile) leaves a placeholder at each path, and no process can open it. GNU make opens `GNUmakefile` first: "make: GNUmakefile: Permission denied", then "No rule to make target 'GNUmakefile'. Stop."
- **In a worktree,** preflight's P20 refuses dev-cpu by design, because the engine mounts the main tree.

T064 ran by naming the file, with `make -f Makefile` and the relay's own call, which leaves both controls in force. Every future agent session would need the same, and CLAUDE.md's commands don't say so.

## The proposal: a `GNUmakefile` that only includes the Makefile

`docs/merge-requests/2026-10-09-fix-000-agents-make.patch` adds:

```make
include $(dir $(lastword $(MAKEFILE_LIST)))Makefile
```

with a comment saying why. The path then holds a real file, so there is no placeholder: make reads it in agent sessions and in your terminal alike, and runs the Makefile as before. The controls stay:
- **The sandbox's write-deny** keeps agents from writing the file. This part is my expectation of how the sandbox treats a denied path that exists; the first agent session after you apply it will confirm.
- **`protected-paths.sh`** still blocks an agent's edit of it, and the redteam matrix's `GNUmakefile` row still passes.
- `makefile` stays unwritable, and make never reaches it, since `GNUmakefile` comes first.

The patch also carries plan §2's layout lines, which say the file never exists, so the plan changes only if you apply it.

**Checked:** with the file beside a copy of the Makefile, `make help` printed the same 39 targets as `make -f Makefile help`, and `make -C <dir> help` worked from elsewhere.

## Runs in the Author's terminal

ADR 0017 puts this section first.

| What | How it runs | Check before you run it |
|---|---|---|
| **The patch** (T183), if you say yes | `git apply`, then every `make` you run | Every `make` reads the new file first, and it only includes the Makefile. |
| **The Makefile's `help`** (on this branch) | `make help` | `grep -h` instead of `grep`: one flag, so an included makefile doesn't put a file name before each line. A new test in `scripts/test_makefile.py` compares `help` direct and through an including file. It fails without the flag. |

**If yes,** after merging the stack below this branch:

```
git merge --ff-only fix/000-agents-make
git apply docs/merge-requests/2026-10-09-fix-000-agents-make.patch
git add GNUmakefile specs/000-local-foundations/plan.md
git commit -m "A GNUmakefile that only includes the Makefile (T183)"
make help
```

`make help` lists the same targets as before. Then tell me, and the next agent session confirms that plain `make` runs in the sandbox, and marks T183 done.

**If no:** merge the branch anyway; its only change is `help`'s `-h`, harmless either way. T183 stays open for the closing patch's other options: `-f Makefile` everywhere, or dropping the write-deny, which isn't recommended.

## Verification

- `pytest scripts/test_makefile.py`: 15 passed. The new test fails with `help`'s old `grep -E`.
- `git apply --check` of the patch: clean.
- `make check ENGINE_MODE=none-yet` on the branch, before its commit: 8 PASS, 2 SKIP (secrets, T091; the image gate, held back), and 1 FAIL, the known `toolchain-check` drift (Claude Code 2.1.296 against its pin of 2.1.295). pytest has 1356 passing, and the gateway 362.
