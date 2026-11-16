# fix/029-after-merge: main's two red tests after the 029 merge

Spec: `specs/029-room-polish/` (FR-021, spec Q6), spec 002's resume lock (FR-014, FR-016) · Branch: `fix/029-after-merge`, from main `d3501c11` · Written by: the interactive session (Claude Opus 5.5), 2026-11-16 · Date: 2026-11-16

## Why

The Author's gate on `feat/029-room-polish` (`c94151f5`, at main `55c43483`) reported `test FAIL` with two failing cases, and the stack was merged as `d3501c11`. Both failures follow from the Author's own changes that day, not from a defect in the room:

1. `apps/web/test/content/source.test.ts`, "is locked to the corpus it was checked against": `corpus changed since the lock: corpus/08-hareet-ai.md`. The Author's Q15 commit (`f996131a`, Golden Q&A 15) changed that file after the resume's lock was written. The citation check, C1 to C9, still passes: every quote the resume takes from `08` is still in it.
2. `apps/web/test/room/piece-words.test.ts`, "main's approvals hold no entry for the dog sign's outline": the case held the dog sign back until the Author answered spec Q6. He approved it on main as C-0008 (`55c43483`), so the case's premise no longer holds.

## What changed

- `apps/web/content/resume.lock.json`: `npm run content:lock -w apps/web` rewrote the lock. One line changes, `corpus/08-hareet-ai.md`, from `0c38b8b4…5839` to `5dafcda1…5d7f`. The command also rewrote the 44 narration eval cases, which came out byte for byte the same. The command's own words: "content: C1–C9 and N1–N5 passed for the resume and 44 scripts (denylist missing)". The denylist is the Author's, and the gate's corpus step applies it.
- `apps/web/test/room/piece-words.test.ts`: the case "main's approvals hold no entry for the dog sign's outline" is removed, by the Author's choice (2026-11-16, asked in the session: "Remove the case"). It guarded only the time before his answer. The two cases beside it stay: they build with an empty policy, so a release build without the approval still shows the face plain, and a drafts build still marks it "Draft".

No source file changes. The test edit is a premise change the Author chose, not a fix to make a failing test pass.

## Checks

- `npx vitest run test/room/piece-words.test.ts test/content/source.test.ts --maxWorkers=2` (in `apps/web`): 2 files passed, 31 tests passed.
- `make -f Makefile lint`: exit 0.
- Not run here: the whole suite and `make check`. His gate runs them.

## For the Author

Gate `fix/029-after-merge` from main's checkout (`tools/gates/gate fix/029-after-merge`), then merge. Expect `image` to fail as before: the tunnel image can't reach Ubuntu's package servers from the agents' engine, a known exception.
