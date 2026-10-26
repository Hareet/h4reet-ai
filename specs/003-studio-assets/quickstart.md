# Quickstart: validating spec 003

Phase 1 output of `/speckit-plan`. The runs that prove each task group. Contracts: [arrival-check.md](contracts/arrival-check.md), [asset-record.md](contracts/asset-record.md), [gpu-window.md](contracts/gpu-window.md), [site-loading.md](contracts/site-loading.md), [asset-events.md](contracts/asset-events.md). Data: [data-model.md](data-model.md).

## Conventions

Spec 000's (its [quickstart.md](../000-local-foundations/quickstart.md#conventions)): **the Author's terminal**, **an agent session**, **Heavy**, and **the evidence**. Plus: no photo, workflow, unstripped output, or blinding key is ever copied into the repository or a note, and the evidence names files by their repository path and hash only.

## 1. Group 1: the guards (FR-003, FR-005)

1. **Choose and make the folders.** The four paths are published: they go into `.claude/settings.json` and `tools/gates/studio-folders.txt`, both committed, and the history is public from its first commit (ADR 0013). So use neutral folders, such as `/mnt/c/studio/photos`, `/mnt/c/studio/outputs`, `/mnt/c/studio/workflows`, and `/mnt/c/studio/key`, with no person, employer, account, or place in any name. Not a folder under `/mnt/c/Users/<account>/`: that would publish the account's name and add no protection, since spec 000 already denies `/mnt/c/Users`, and the matrix fails it. Make the four folders now, before applying the patch: a deny on a path with nothing behind it guards nothing, and the matrix fails it too.
2. **Fill the placeholders.** In `docs/merge-requests/<date>-feat-003-guards.patch`, replace `<STUDIO_PHOTOS>`, `<STUDIO_OUTPUTS>`, `<STUDIO_WORKFLOWS>`, and `<STUDIO_BLINDING_KEY>` with those folders, as absolute paths, everywhere each appears: twice in `.claude/settings.json`'s part and once in `tools/gates/studio-folders.txt`'s. The blinding key's is the folder that holds the key. In an editor, in the Author's terminal. The notes name the paths nowhere, but the two files do.
3. **Apply it** (`git apply`), then `claude doctor` and `make git-hooks`, as spec 000's patches.
4. **Expected, from an agent session's `make check`:** the new rows pass: a read of each studio folder is refused (stage S), and an Edit or write of each file in `assets/policy/` is refused (stage H). A row still naming a placeholder fails, naming it; so does a path under a Windows user's folder, and a folder that isn't there.
5. **Only then** does the studio stage anything on this machine for the evaluation: the photos of the room and of the Author, ComfyUI's outputs (`out/`), the blinded copies (`blind/`), and the blinding key (`key.csv`), all inside the folders this patch denies (FR-003). The evaluation note says so at its first step.

## 2. Group 2: the arrival check (FR-001, FR-002, FR-004, FR-006 to FR-020, FR-041; SC-001, SC-002, SC-003)

1. **Apply its patch,** as above.
2. **SC-001, from an agent session:** `make test` runs `tools/gates/test/test_arrival_check.py`. Expected: every rule refuses its fixture, naming its ID, and every passing fixture passes.
3. **Before each commit:** stage a PNG with a `tEXt` chunk under `assets/` in a scratch branch, and commit. Expected: the commit is refused with `M1`. Then stage a phone's HEIC photo, with its location, anywhere outside `assets/`. Expected: refused with `A1` (and `A4`).
4. **Over a branch:** commit a failing file, then a fix, on a scratch branch; `make check`. Expected: `arrival` fails, naming the first commit (FR-004). The same for a merge whose resolution brings in a failing file.
5. **SC-002:** `make publish-check`. Expected: no arrival finding in any commit.
6. **ADR 0010:** read the draft (`docs/adr/0010-…`, proposed). Accept it, or change it, before the studio builds its workflow; on acceptance, the Author's patch sets `caps.json`'s `adr_0010` to `accepted` with its caps.

## 3. Group 3: the comparison's images (FR-036; User Story 5)

After the evaluation's runs, in the Author's terminal:
1. Make each grid as the note says, then `make assets-scrub FILE=<grid>`, which rewrites it and adds the mark.
2. Add each grid's entry to the folder's `records.json` (its arm, and its models with their licenses), and add each license the grids name to `assets/policy/licenses.json` on `main`, with its three terms and its research-display reading (FR-036 as clarified). A license you read as `no` on research display keeps that arm's grids out; the note describes them in words.
3. Approve each T3 grid, and each T1 grid that needs it, in `assets/policy/approvals.json` on `main`. These are your own commits on `main`: the pre-commit hook's arrival check doesn't apply rule A9 to them.
4. **Expected:** `make arrival` passes; an arm-B or arm-D grid without its caption in the note fails `C1`; `make assets-credits` renders `docs/research/images/CREDITS.md`, and SC-003 holds for the folder.

## 4. Group 4: the GPU window (FR-035; SC-011)

Heavy: it stops prod's model server.
1. `make studio-window ENV=prod STATE=start REASON="studio: <job>"`. **Expected:** the dashboard's annotation starts; `make hello ENV=prod` answers `route: fallback` within the sub-budget, or degraded.
2. Run the studio job.
3. `make studio-window ENV=prod STATE=end REASON="studio: <job> done"`. **Expected:** prod back at the commit its run file names, hello answering `route: local` within 10 minutes of the job's end, and the window's fallback spend on its panel (SC-011).

## 5. Group 5: the site (waits for specs 001 and 002; SC-004 to SC-010, SC-012)

Once the site and the room exist, on the reference phone (research R-13) and a desktop:
- **SC-004, SC-005:** time the twin's still and full appearance, from a cold cache, on broadband and on the mobile profile.
- **SC-006:** the median frame rate over 60 seconds, and the first visit's bytes.
- **SC-007:** fault injection: block the twin's GLB, time it out, corrupt it, force the frame rate down, and switch to 2D by hand. Every run ends with the disclosure visible and a working text box.
- **SC-008:** the same loads with the local tier off.
- **SC-009:** the network log: zero third-party hosts, zero camera requests.
- **SC-010:** from any shown asset to its record in two clicks.
- **SC-012:** the measured monthly transfer cost on the dashboard, beside the estimate.

## 6. Group 6: the room (Phase 3; waits for spec 002)

The room's first assets through the same runs as group 3, with each approval's room confirmations (FR-037).
