# Spec 030, group D's judge (T-DJ01, T-DJ02): the implementer's notes

`impl-030dj`, night of 2026-11-17, branch `night/impl-030dj/impl-030dj` from `7cdc31d2` (`spec-030`'s tip). Plan §R-D1 and §9: `scripts/studio/line.py` and `scripts/studio/test_line.py` alone.

## The run command

The supervisor's brief names `python3 -I -B scripts/studio/test_line.py`. That file has no `__main__` block: run that way, it imports pytest, defines the cases, runs none, and exits 0. Spec 017's and 021's notes run it through pytest, so these notes do too, with `make test`'s own arguments (`PYTEST_ARGS`, Makefile:118) and the interpreter isolated:

```
python3 -I -B -m pytest -q -p no:cacheprovider --import-mode=importlib scripts/studio/test_line.py
```

Baseline at `7cdc31d2`, before any change: `134 passed in 21.09s`.

## T-DJ01, RED

The cases were appended after the file's last case, with their own helpers. The module docstring gained one bullet. No existing case or helper changed: `git diff 7cdc31d2 -- scripts/studio/test_line.py` adds lines and removes none. No earlier spec's test assertion changed.

The fixtures are PNGs the test writes itself. `pixel_png` runs `zlib.compress` over scanlines, and row y uses filter y % 5, so the decoder meets all five filters in every image. Each plate has alpha 0 on its outermost ring, a dark-metal inset band (`#2a3038`), and a flat centre face. The band would fail the primary label (`#14171c`) if the judge measured outside the centre. One centre pixel of `btn-primary-normal.png` is at alpha 64, and it would fail the label over black if the judge counted pixels under alpha 0.5. So the passing set pins both "inside the insets" and "alpha 0.5 or more". Nothing binary is committed.

| tasks.md T-DJ01 case | test | expected still-check lines (exactly) |
|---|---|---|
| an RGB PNG (no alpha) | `test_an_rgb_png_without_alpha_fails` | `alpha btn-primary-normal.png: …`, `ring btn-primary-normal.png: …` (with no alpha, the ring is opaque too) |
| an opaque pixel in the outermost ring | `test_an_opaque_pixel_on_the_outermost_ring_fails` | `ring panel-frame.png: …` naming `5,0` |
| a side over `texture_px` | `test_a_side_over_texture_px_fails` | `texture_px panel-frame.png: 40 by 40 (limit: the brief's, 32)` |
| a 16-bit PNG | `test_a_16_bit_png_fails` | `png btn-secondary-hover.png: bit depth 16 …` |
| a `ui-` folder without `slices.json` | `test_a_ui_folder_without_slices_json_fails` | `slices.json: absent …` |
| `slices.json` naming a file not in `files`, or missing one | `test_slices_json_naming_a_file_not_in_files_or_missing_one_fails[extra, missing]` | `slices.json files: btn-extra.png …`; `slices.json files: panel-frame.png absent …` |
| an inset of 0, or one crossing the image | `test_an_inset_of_zero_or_one_crossing_the_image_fails[zero, across-the-width, across-the-height, not-whole, a-side-missing]` | `slices.json btn-primary-normal.png: …` |
| two states of a variant ΔE76 < 15 apart | `test_two_states_of_a_variant_too_close_fail` | `states btn-primary-hover.png btn-primary-normal.png: delta E76 …` |
| a label at 4.4:1 over one centre pixel | `test_a_label_at_4_4_to_1_over_one_centre_pixel_fails` | `label btn-secondary-normal.png: #e6fbff …` naming `7,5` (the grey is the test's own, found by its own WCAG computation to round to 4.4:1) |
| a passing set | `test_a_still_set_passes` | none; exit 0, `line: pass; round 1` |

Cases beyond the list, each from the plan's words:

- `test_slices_json_listed_in_files_fails`. The plan says slices.json is "never listed in `files` (as `note.md`)".
- `test_slices_json_outside_its_shape_fails[a-string, no-labels, schema-2]`. These test the plan's shape `{"schema": 1, "files": …, "labels": …}`.
- `test_an_interlaced_png_fails`. This is a departure, recorded in plan.md §R-D1 by T-DJ02's commit: the judge decodes non-interlaced PNGs only, and an interlaced one is a finding, as another depth is.
- `test_a_still_set_outside_ui_needs_no_slices_json`. Only a `ui-` asset needs slices.json.
- `test_avatar_briefs_take_no_still_checks`. Only a `still` brief takes these checks. The existing avatar fixtures' `png()` has an IDAT that doesn't decode, so this also guards "line.py's other answers unchanged" (FR-022).

Each failing case asserts exit 1. It also asserts that the still checks' lines (those starting `texture_px `, `png `, `alpha `, `ring `, `slices.json`, `states `, `label `, `files`) are exactly the expected ones, each in `line.py`'s `<check>: <value> (limit: <limit>)` form.

Seen failing (19 failed, 137 passed: the 134 existing cases and the three cases that must pass before and after). Every failure is the same: line.py has no still checks yet, so it passes the set (`assert 0 == 1`). Here is the first failure in full, from `--tb=line`; the other 18 differ only in the scratch folder's name and the line number, 1877, or 1959 for `test_slices_json_listed_in_files_fails`:

```
$ python3 -I -B -m pytest -q -p no:cacheprovider --import-mode=importlib --tb=line scripts/studio/test_line.py; echo "exit $?"
........................................................................ [ 46%]
................................................................FFFFFFFF [ 92%]
FFFFFFFFFFF.                                                             [100%]
=================================== FAILURES ===================================
E   AssertionError: arrival-check: main's copy, at faf005ec506d, on a scratch copy under assets/ui/buttons/
      STANDIN {"who": "main", "repo": "/tmp/line-gtl_5vkm/scratch", "rels": ["assets/ui/buttons/btn-primary-hover.png", "assets/ui/buttons/btn-primary-normal.png", "assets/ui/buttons/btn-primary-pressed.png", "assets/ui/buttons/btn-secondary-hover.png", "assets/ui/buttons/btn-secondary-normal.png", "assets/ui/buttons/panel-frame.png", "assets/ui/buttons/records.json"], "exist": true, "caps": "{\"schema\": 1, \"per_asset\": {\"room\": {\"gzip_bytes\": 2500000, \"triangles\": 100000}, \"avatar\": {\"bytes\": 21000000, \"triangles\": 180000, \"texture_bytes\": 46000000}, \"animation\": {\"bytes\": 1000000}, \"still\": {\"bytes\": 300000}, \"preview\": {\"bytes\": 300000}}}", "disclosure": "# Data-flow disclosure\n"}
      arrival-check: 0 findings in 7 files
      line: pass; round 1

    assert 0 == 1
     +  where 0 = CompletedProcess(args=['/opt/tools/bin/python3', '-I', '-B', 'scrip...", "disclosure": "# Data-flow disclosure\\n"}\narrival-check: 0 findings in 7 files\nline: pass; round 1\n', stderr='').returncode
scripts/studio/test_line.py:1877: AssertionError: arrival-check: main's copy, at faf005ec506d, on a scratch copy under assets/ui/buttons/
[… 18 more blocks of the same shape …]
=========================== short test summary info ============================
FAILED scripts/studio/test_line.py::test_an_rgb_png_without_alpha_fails - Ass...
FAILED scripts/studio/test_line.py::test_an_opaque_pixel_on_the_outermost_ring_fails
FAILED scripts/studio/test_line.py::test_a_side_over_texture_px_fails - Asser...
FAILED scripts/studio/test_line.py::test_a_16_bit_png_fails - AssertionError:...
FAILED scripts/studio/test_line.py::test_an_interlaced_png_fails - AssertionE...
FAILED scripts/studio/test_line.py::test_a_ui_folder_without_slices_json_fails
FAILED scripts/studio/test_line.py::test_slices_json_listed_in_files_fails - ...
FAILED scripts/studio/test_line.py::test_slices_json_outside_its_shape_fails[a-string]
FAILED scripts/studio/test_line.py::test_slices_json_outside_its_shape_fails[no-labels]
FAILED scripts/studio/test_line.py::test_slices_json_outside_its_shape_fails[schema-2]
FAILED scripts/studio/test_line.py::test_slices_json_naming_a_file_not_in_files_or_missing_one_fails[extra]
FAILED scripts/studio/test_line.py::test_slices_json_naming_a_file_not_in_files_or_missing_one_fails[missing]
FAILED scripts/studio/test_line.py::test_an_inset_of_zero_or_one_crossing_the_image_fails[zero]
FAILED scripts/studio/test_line.py::test_an_inset_of_zero_or_one_crossing_the_image_fails[across-the-width]
FAILED scripts/studio/test_line.py::test_an_inset_of_zero_or_one_crossing_the_image_fails[across-the-height]
FAILED scripts/studio/test_line.py::test_an_inset_of_zero_or_one_crossing_the_image_fails[not-whole]
FAILED scripts/studio/test_line.py::test_an_inset_of_zero_or_one_crossing_the_image_fails[a-side-missing]
FAILED scripts/studio/test_line.py::test_two_states_of_a_variant_too_close_fail
FAILED scripts/studio/test_line.py::test_a_label_at_4_4_to_1_over_one_centre_pixel_fails
19 failed, 137 passed in 23.09s
exit 1
```

```
$ ruff check scripts/studio/test_line.py
All checks passed!
$ ruff format --check scripts/studio/test_line.py
1 file already formatted
```

## T-DJ02, GREEN

Commits on this branch, each GREEN one without a test file:

| Commit | What |
|---|---|
| `c170b1a4` | T-DJ01 RED: `test_line.py` and these notes |
| `32709d95` | T-DJ02 GREEN: `line.py`'s still checks; plan.md §R-D1's departure |
| `17816424` | T-DJ02 fix (found re-reading my own code, no test change): slices.json answers to the PNGs candidate.json *names*. A named PNG the folder lacks now has one finding, the files check's `files: X absent`, and not also `slices.json files: X (limit: only the PNGs candidate.json names)`. Checked with a scratch driver (below). |
| this one | the notes' last sections |

What `line.py` gained, all in a new section after `has_bone` and called once from `candidate_findings`, after the per-file loop that holds the bytes check (plan §R-D1). For a brief of kind `still` only (`if brief["kind"] == "still"`):

- **Per PNG among the candidate's files**: IHDR read (`png_header`). The order of the checks: `texture_px <name>: W by H (limit: the brief's, N)`; `alpha <name>: colour type T and no tRNS chunk (…)` where the colour type isn't 6 or 4 and no tRNS is present; `png <name>: bit depth D (limit: 8 bits a sample)`; `png <name>: interlaced (…)` (the departure). Over `texture_px`, at another depth, or interlaced, the pixels aren't read. Readable files are inflated by `zlib`, bounded to the size IHDR gives, and the five filters are undone (`unfilter`). Colour types 0, 2, 3, and 4 become RGBA through PLTE and tRNS (`png_pixels`). Then `ring <name>: N pixels above alpha 0, the first at x,y (…)`. A file that doesn't read is `png <name>: doesn't read (<why>) (limit: an 8-bit PNG)`, never a crash. At most 2048 × 2048 pixels are read from one file, whatever the brief says (`READ_PX`).
- **For an asset `ui-*`**: `files: slices.json (…)` if candidate.json lists it. Then `slices.json` itself, which is absent, doesn't parse, or is outside the shape `{"schema": 1, "files": …, "labels": …}`; a shape failure is reported alone. Then its `labels`, exactly the variants of the `btn-<variant>-<state>.png` files, each `#rrggbb`. Then its `files`, every PNG candidate.json names and no other. Then each inset: an object of exactly `top, right, bottom, left`, whole numbers ≥ 1, with `left + right < width` and `top + bottom < height`, one line per side that crosses the image.
- **States**: for every two `btn-` files of one variant whose insets hold and whose pixels read, the centres' alpha-weighted mean sRGB colour goes to CIELAB (D65), and a pair under ΔE76 15 is `states <a> <b>: delta E76 d (limit: at least 15 apart)`, the pair in name order. A centre with no alpha is a finding of its own.
- **Labels**: the variant's label against every centre pixel of alpha ≥ 128/255, composited in sRGB over white and over black, WCAG 2 relative luminance. The worst pixel, if under 4.5:1, is `label <name>: #rrggbb at r:1 over <ground> at x,y (limit: 4.5:1 …)`.
- Measures print floored, never rounded up past a limit: 4.499 prints 4.49, and ΔE 14.96 prints 14.9.
- The docstring's `candidate:` paragraph gained one sentence. Only the handoff folder, the brief, and main's policy (already read for the tools) are read, as R-3 needs. Nothing under `/srv/studio/` was opened tonight.

`git diff 7cdc31d2 -- scripts/studio/line.py scripts/studio/test_line.py` removes no line. Every existing case and every earlier answer of `line.py` is unchanged, and the avatar fixtures' undecodable `png()` still passes (`test_avatar_briefs_take_no_still_checks`).

### Checked beside the suite (a scratch driver in `/tmp`, untracked, reusing `test_line.py`'s helpers)

The suite drives colour types 6 and 2 only. The other decode paths were run directly, with these results:

```
grey+tRNS(10): [[(10, 10, 10, 0), (200, 200, 200, 255)], [(200, 200, 200, 255), (10, 10, 10, 0)]]
grey+alpha: [[(10, 10, 10, 0), (200, 200, 200, 255)], [(50, 50, 50, 128), (1, 1, 1, 2)]]
palette+tRNS: [[(1, 2, 3, 0), (40, 50, 60, 128)], [(70, 80, 90, 255), (40, 50, 60, 128)]]
rgb+tRNS(1,2,3): [[(1, 2, 3, 0), (4, 5, 6, 255)], [(1, 2, 3, 0), (1, 2, 4, 255)]]
rgba, every filter on a 37x23 gradient: equal
corrupt IDAT -> its pixel data doesn't inflate
filter 7 -> row 0 has filter 7, not 0 to 4
the avatar fixtures' png() -> its pixel data ends at 8 bytes, not 68
not a PNG -> no PNG signature
floored(4.499,2) = 4.49 ; lab(#ffffff) = [100.0, -0.0, 0.0]
```

The finding lines as printed, for the suite's cases:

```
--- pass: exit 0
    line: pass; round 1
--- rgb: exit 1
    alpha btn-primary-normal.png: colour type 2 and no tRNS chunk (limit: an alpha channel: colour type 6 or 4, or a tRNS chunk)
    ring btn-primary-normal.png: 52 pixels above alpha 0, the first at 0,0 (limit: alpha 0 on the outermost one-pixel ring)
    line: 2 findings; round 1 fails
--- ring: exit 1
    ring panel-frame.png: 1 pixel above alpha 0, the first at 5,0 (limit: alpha 0 on the outermost one-pixel ring)
    line: 1 finding; round 1 fails
--- texture: exit 1
    texture_px panel-frame.png: 40 by 40 (limit: the brief's, 32)
    line: 1 finding; round 1 fails
--- noslices: exit 1
    slices.json: absent (limit: a file beside the files, for a ui- asset)
    line: 1 finding; round 1 fails
--- inset: exit 1
    slices.json btn-primary-normal.png: left 8 + right 8 = 16, width 16 (limit: left + right under the width, top + bottom under the height)
    slices.json btn-primary-normal.png: top 3 + bottom 9 = 12, height 12 (limit: left + right under the width, top + bottom under the height)
    line: 2 findings; round 1 fails
--- near: exit 1
    states btn-primary-hover.png btn-primary-normal.png: delta E76 2.4 (limit: at least 15 apart)
    line: 1 finding; round 1 fails
grey 115 4.427242925384922
--- label: exit 1
    label btn-secondary-normal.png: #e6fbff at 4.42:1 over white at 7,5 (limit: 4.5:1 over every centre pixel of alpha 0.5 or more, over white and over black)
    line: 1 finding; round 1 fails
```

At the brief's real sizes (ten 192 × 96 buttons with 24 px insets, a 256 × 256 panel with 48 px insets, `texture_px` 512), the whole `candidate` run took 0.2 s. Its faces were arbitrary shifts of the brief's colours, not a set meant to pass, and the run found real near pairs and a dim disabled label. That shows the checks bite at full size; it says nothing about the studio's set. After the fix, a PNG listed but absent gives one line, `files: btn-primary-disabled.png absent (limit: every file candidate.json names, in the folder)`, and the arrival check is not run.

## Verification (T-DJ02's commands, the final tree)

These are the tests I added or changed and those covering the changed file. `scripts/studio/test_studio_prompt.py` reads `line.py`'s `ROUNDS`. `apps/web/test/room/dinosaur-compose.test.ts` names `has_bone` in comments only, and `has_bone` is unchanged. The whole `apps/web` suite and `make check` are T-INT's (the brief's rule 4).

```
$ python3 -I -B scripts/studio/test_line.py; echo "exit $?"
exit 0
$ python3 -I -B -m pytest -q -p no:cacheprovider --import-mode=importlib scripts/studio/test_line.py scripts/studio/test_studio_prompt.py; echo "exit $?"
........................................................................ [ 45%]
........................................................................ [ 91%]
..............                                                           [100%]
158 passed in 29.08s
exit 0
$ ruff check scripts/studio/line.py scripts/studio/test_line.py; echo "exit $?"
All checks passed!
exit 0
$ ruff format --check scripts/studio/line.py scripts/studio/test_line.py; echo "exit $?"
2 files already formatted
exit 0
```

(The first command is the brief's literal one. It runs no case: see "The run command" above.)

`make lint` on the final code (`17816424`; the commit after it changes only this file, under `specs/`, which Prettier ignores and ruff doesn't read):

```
$ make lint; echo "exit $?"
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
916 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
exit 0
```

The first `make lint` stopped at once with `node_modules is missing: run make setup`. The worktree had no `node_modules`, so I ran `make setup`'s first half, `npm ci --ignore-scripts` ("added 431 packages … in 36s"; npm's audit reports 14 advisories in the lockfile's packages, unchanged by this branch). I did not run its second half, `make git-hooks`, which installs into the shared clone's hooks folder: that is the Author's, once per clone. `node_modules/` is gitignored and leaves the worktree clean.

`make test` and `make evals` were not run: by the brief's rule 4 a group task runs its own tests and `make lint`, and the integration (T-INT) runs the one `make check`.

## Refusals, human-only paths, questions

- No refusal: no hook, bash-gate, or permission refusal this session. The post-edit hook printed `F821 Undefined name` for `zlib`, `math`, and `itertools` between my edits. That was a lint report on a half-made edit: the next two edits added the imports, and ruff passes. It wasn't a refusal.
- No human-only path was changed, and there is no patch for his hand from this group. `assets/policy/` isn't needed: the brief's set fits `still` (spec.md Q12).
- No merge-request note in `docs/merge-requests/` from this branch: plan §9 gives the stack's note (`2026-11-17-030-ui-skin.md`) to T-INT, which takes these notes.
- Save points: each step's work was committed as its own commit (RED, GREEN, the fix, these notes), not as separate empty `wip(impl-030dj): …` commits; nothing was ever left only in the working tree.
- Questions written to `/night/io/out/questions.md`: (1) keep an interlaced PNG a finding (recommended) or read Adam7; (2) the brief's `python3 -I -B scripts/studio/test_line.py` runs no case, and briefs should name the pytest command (recommended).

## Done, and not done

Done:

- T-DJ01: 22 cases (19 failing first, 3 guards), seen failing, pasted above; no existing case changed.
- T-DJ02: `line.py` judges a still set as plan §R-D1 says, with one departure recorded in plan.md (an interlaced PNG is a finding). All 156 cases of `test_line.py` and 2 of `test_studio_prompt.py` pass, ruff is clean on both files, and `make lint` exits 0.
- R-3 (`judge-ui-r1`) can judge round 1 from this branch's tip. Its checks read only the handoff folder, the brief, and main's policy.

Not done, and not this task's:

- R-1 to R-4: the brief in `/srv/studio/briefs/`, the studio's run, the judging and record, and his intake. I opened nothing under `/srv/studio/`.
- T-INT's merge, its `make check`, and the stack's note.
- Decode paths the suite doesn't drive: colour types 0, 3, and 4 and RGB with tRNS. They were checked by hand above but have no case in `test_line.py`. Adding one would be a test-file change after GREEN, so I left it for review to ask for. An interlaced PNG isn't read (the departure).
- Not checked by the judge, by plan and spec: the total of 96,000 bytes (T-DS's build holds it), the look (his), and that no image holds a glyph (his look review).

## Backlog and review notes

- **R-1** (the brief, `/srv/studio/briefs/ui-buttons/1.json`, its block in `specs/030-ui-skin/studio-round-1.md`; Q68): the brief's secondary "selected" target (L* 24, C* 35) is outside sRGB (at most C* ≈ 18 there), so a set made as close to it as sRGB allows fails the judge's ΔE 15 rule twice (normal/selected ≈ 5–7, hover/selected ≈ 14.6–14.9). The studio departed from that target (L 30, C 22.7) and measured 17.07 at its lowest.
- **R-2** (`scripts/studio/line.py`, the judge's still checks; Q69): the judge doesn't know the brief's eleven file names (they're only in the brief's prose), so a set missing a state passes its checks.
- **R-3** (nit, `scripts/studio/line.py:1167`): prints a finding's file name without `clean()`, so a name with a newline in `candidate.json` could print a forged line (the round still fails; the brief's names can't trigger it).
- **R-4** (nit, `scripts/studio/test_line.py`): no test case for colour types 0, 3, 4 or RGB with `tRNS`.

From `rv-030dj`'s review (not blocking), folded in by `verify-030dj`.
