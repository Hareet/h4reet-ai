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
