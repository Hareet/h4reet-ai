# R-3 `judge-ui-r1`: the judge of round 1 of `ui-buttons`

Spec 030, group D, task R-3 (tasks.md as reworked at `2dd4213f`; plan §R-D2, §R-D3; [studio-round-1.md](studio-round-1.md)). Night of 2026-11-17 (night 5), implementer role. Branch `night/judge-ui-r1/judge-ui-r1`, from `impl-030dj`'s tip `c77eb4ce` (T-DJ02, approved by `rv-030dj` with no blocking finding). I wrote none of the round or the judge.

**Round 1 passes.** `line.py candidate` printed no finding, dry or recorded; the record is in studio-round-1.md, his intake in [`docs/merge-requests/human-patches/030.md`](../../docs/merge-requests/human-patches/030.md).

## 1. The inputs

Read in place, never copied for judging. The brief's SHA-256 is R-1's, so the round was judged.

```
$ ls -la /srv/studio/briefs/ui-buttons/ /srv/studio/handoff/ui-buttons/1/
/srv/studio/briefs/ui-buttons/:
total 20
drwxr-xr-x 2 dev dev 4096 Nov 17 03:36 .
drwxr-xr-x 5 dev dev 4096 Nov 17 03:36 ..
-rw-r--r-- 1 dev dev 9685 Nov 17 03:36 1.json

/srv/studio/handoff/ui-buttons/1/:
total 160
drwxr-xr-x 2 dev dev  4096 Nov 17 03:57 .
drwxr-xr-x 3 dev dev  4096 Nov 17 03:56 ..
-rw-r--r-- 1 dev dev   327 Nov 17 03:55 LICENSE.md
-rw-r--r-- 1 dev dev  3517 Nov 17 03:55 btn-primary-disabled.png
-rw-r--r-- 1 dev dev  3761 Nov 17 03:55 btn-primary-hover.png
-rw-r--r-- 1 dev dev  3641 Nov 17 03:55 btn-primary-normal.png
-rw-r--r-- 1 dev dev  3621 Nov 17 03:55 btn-primary-pressed.png
-rw-r--r-- 1 dev dev  4224 Nov 17 03:55 btn-primary-selected.png
-rw-r--r-- 1 dev dev  3344 Nov 17 03:55 btn-secondary-disabled.png
-rw-r--r-- 1 dev dev  3797 Nov 17 03:55 btn-secondary-hover.png
-rw-r--r-- 1 dev dev  3883 Nov 17 03:55 btn-secondary-normal.png
-rw-r--r-- 1 dev dev  3601 Nov 17 03:55 btn-secondary-pressed.png
-rw-r--r-- 1 dev dev  4174 Nov 17 03:55 btn-secondary-selected.png
-rw-r--r-- 1 dev dev   681 Nov 17 03:55 candidate.json
-rw-r--r-- 1 dev dev 15684 Nov 17 03:57 note.md
-rw-r--r-- 1 dev dev  6614 Nov 17 03:55 panel-frame.png
-rw-r--r-- 1 dev dev 32520 Nov 17 03:55 records.json
-rw-r--r-- 1 dev dev 33334 Nov 17 03:55 sheet.png
-rw-r--r-- 1 dev dev  1350 Nov 17 03:55 slices.json
$ sha256sum /srv/studio/briefs/ui-buttons/1.json /srv/studio/handoff/ui-buttons/1/*
98eb47ddbcf7ac6193e3fafa6420b33f6f3bb3d8e8e3ff1e1ceabc169f1c4267  /srv/studio/briefs/ui-buttons/1.json
f7118869586e0928e06f39b689cdbdd0817fb0fc5540d37e0ca7d1cc2cfa9159  /srv/studio/handoff/ui-buttons/1/LICENSE.md
fe4da5713f32ea8b0f08719161d94b74eea224c8e661e1ba2c0dbcc51fc2d626  /srv/studio/handoff/ui-buttons/1/btn-primary-disabled.png
ce93cdc64bf4dcdb6dd63b325afe25b5bd32e72601aa817610eea7395ff6c43f  /srv/studio/handoff/ui-buttons/1/btn-primary-hover.png
17b6faa32027e312d59d546c8764e1de519a74a708138238eee3373c683147c3  /srv/studio/handoff/ui-buttons/1/btn-primary-normal.png
0e831b953301bad2c5244ee27f2c0221db3281d42ecbf2606780abae5f5c9da5  /srv/studio/handoff/ui-buttons/1/btn-primary-pressed.png
5062c8adb92a204943c291baabdd5637a102bdb4bb294fc599ce695bbaf89cc9  /srv/studio/handoff/ui-buttons/1/btn-primary-selected.png
30fd1dcfd3fe9bab75280a8058c31395bb798dce944163bfe592aa36d8929d90  /srv/studio/handoff/ui-buttons/1/btn-secondary-disabled.png
30c1e35db047f465fdbcdeae35650023c7c6d18c7f6afb7471e4dc043ca041bf  /srv/studio/handoff/ui-buttons/1/btn-secondary-hover.png
1d98c57c0782e0af6c4949b4e0a6e08688dc2279b94600acb623610292f48fdd  /srv/studio/handoff/ui-buttons/1/btn-secondary-normal.png
1b5af9a30d13ec8c7eee02690198b4da63dc4bc36b7bf76628e9b54f32efd5c1  /srv/studio/handoff/ui-buttons/1/btn-secondary-pressed.png
08e54a06ef44eaf56b254a9dfeded13ae8752fbc5b672628a58cc34f47199dff  /srv/studio/handoff/ui-buttons/1/btn-secondary-selected.png
d1eababdc04afd4574df00d2e09fb5e859cb3afce5c9f6bae0d57b0add993a68  /srv/studio/handoff/ui-buttons/1/candidate.json
7cbdd03338d2f5637259f47713bfbb973e4999970d67a6b620aa99b124a8cab3  /srv/studio/handoff/ui-buttons/1/note.md
dbf6bd7caf6b6f43a6de90238c165646a52d69255961f8fd00ff73b52cfef34d  /srv/studio/handoff/ui-buttons/1/panel-frame.png
ebbdd2877d85ddbca8262e54e83d559da06940539cac77f4160d7720289525af  /srv/studio/handoff/ui-buttons/1/records.json
0099974f73e52ee55e0ba707daf8dc48ff1c69f370f98ae6d12229c9bd885349  /srv/studio/handoff/ui-buttons/1/sheet.png
a7dcbaf09b29f43d5502330a4858e01166256deaa638d09198a91831856af872  /srv/studio/handoff/ui-buttons/1/slices.json
```

**The eleven names, by hand** (Q69; `rv-030dj`'s R-3). The expected list is the brief's prose: `btn-{primary,secondary}-{normal,hover,pressed,disabled,selected}.png` and `panel-frame.png`. A Python check (`-I -B`, reading only the folder) compared it with `candidate.json`'s `files`, `slices.json`'s `files` keys, and the folder's PNGs other than `sheet.png`, and printed every name by `repr`:

```
expected 11
candidate.files 11 equal to expected: True dups: False
slices.files 11 equal to expected: True dups: False
folder PNGs (less sheet.png) 11 equal to expected: True dups: False
names with a control or non-ASCII character: []
every listed file a regular file, no link: True
["'LICENSE.md'", "'btn-primary-disabled.png'", "'btn-primary-hover.png'", "'btn-primary-normal.png'", "'btn-primary-pressed.png'", "'btn-primary-selected.png'", "'btn-secondary-disabled.png'", "'btn-secondary-hover.png'", "'btn-secondary-normal.png'", "'btn-secondary-pressed.png'", "'btn-secondary-selected.png'", "'candidate.json'", "'note.md'", "'panel-frame.png'", "'records.json'", "'sheet.png'", "'slices.json'"]
```

`candidate.json` names the brief's three tools at the brief's versions and `records.json` as its record. `note.md`, `sheet.png`, `slices.json`, `records.json`, and `LICENSE.md` sit beside the files and aren't in `files`, as the brief asks.

## 2. The dry run

```
$ python3 -I -B scripts/studio/line.py candidate /srv/studio/handoff/ui-buttons/1 --brief /srv/studio/briefs/ui-buttons/1.json; echo "exit $?"
arrival-check: main's copy, at f6baef8ce027, on a scratch copy under assets/ui/buttons/
file                                          bytes     gzip      vertices  triangles  texture
assets/ui/buttons/btn-primary-disabled.png    3517      3466      -         -          -
assets/ui/buttons/btn-primary-hover.png       3761      3712      -         -          -
assets/ui/buttons/btn-primary-normal.png      3641      3587      -         -          -
assets/ui/buttons/btn-primary-pressed.png     3621      3571      -         -          -
assets/ui/buttons/btn-primary-selected.png    4224      4184      -         -          -
assets/ui/buttons/btn-secondary-disabled.png  3344      3284      -         -          -
assets/ui/buttons/btn-secondary-hover.png     3797      3747      -         -          -
assets/ui/buttons/btn-secondary-normal.png    3883      3823      -         -          -
assets/ui/buttons/btn-secondary-pressed.png   3601      3544      -         -          -
assets/ui/buttons/btn-secondary-selected.png  4174      4131      -         -          -
assets/ui/buttons/panel-frame.png             6614      6485      -         -          -
arrival-check: 0 findings in 13 files
line: pass; round 1
exit 0
```

The output is whole: the arrival check's table and summary, then `line:`'s verdict and the exit code.

**The sorting.** There is no finding to sort: none is the candidate's, none the brief's, and none `line.py`'s. So nothing stopped the record (step 3's condition).

**The checks ran.** A pass prints no line for the still set's checks, so I read their path. `candidate_findings` calls `still_findings` for `kind: still` (`scripts/studio/line.py:1600`), and it makes the `ui-` checks for an asset named `ui-…` (`:1272`). Then I printed their measures with `line.py`'s own functions (`png_header`, `png_pixels`, `centre`, `centre_mean`, `lab`, `luminance`, `LABEL_ALPHA` 128, `LABEL_RATIO` 4.5), reading only the folder:

```
btn-primary-disabled.png     192x96 type 6 depth 8 interlace 0 ring max alpha 0 centre alpha min 255 max 255
   centre L*a*b* 60.12 0.36 10.24  C* 10.24  label #14171c lowest 5.69:1
btn-primary-hover.png        192x96 type 6 depth 8 interlace 0 ring max alpha 0 centre alpha min 255 max 255
   centre L*a*b* 91.93 1.68 27.67  C* 27.73  label #14171c lowest 14.64:1
btn-primary-normal.png       192x96 type 6 depth 8 interlace 0 ring max alpha 0 centre alpha min 255 max 255
   centre L*a*b* 79.93 4.48 74.90  C* 75.03  label #14171c lowest 10.53:1
btn-primary-pressed.png      192x96 type 6 depth 8 interlace 0 ring max alpha 0 centre alpha min 255 max 255
   centre L*a*b* 62.03 3.68 66.43  C* 66.53  label #14171c lowest 6.06:1
btn-primary-selected.png     192x96 type 6 depth 8 interlace 0 ring max alpha 0 centre alpha min 255 max 255
   centre L*a*b* 88.03 1.29 54.50  C* 54.51  label #14171c lowest 13.19:1
btn-secondary-disabled.png   192x96 type 6 depth 8 interlace 0 ring max alpha 0 centre alpha min 255 max 255
   centre L*a*b* 27.97 -0.00 0.00  C* 0.00  label #e6fbff lowest 9.38:1
btn-secondary-hover.png      192x96 type 6 depth 8 interlace 0 ring max alpha 0 centre alpha min 255 max 255
   centre L*a*b* 38.14 -9.39 -11.53  C* 14.86  label #e6fbff lowest 6.46:1
btn-secondary-normal.png     192x96 type 6 depth 8 interlace 0 ring max alpha 0 centre alpha min 255 max 255
   centre L*a*b* 20.09 -8.97 -12.20  C* 15.14  label #e6fbff lowest 12.24:1
btn-secondary-pressed.png    192x96 type 6 depth 8 interlace 0 ring max alpha 0 centre alpha min 255 max 255
   centre L*a*b* 2.99 -2.54 -3.75  C* 4.53  label #e6fbff lowest 18.39:1
btn-secondary-selected.png   192x96 type 6 depth 8 interlace 0 ring max alpha 0 centre alpha min 255 max 255
   centre L*a*b* 30.02 -22.47 -3.15  C* 22.69  label #e6fbff lowest 8.72:1
panel-frame.png              256x256 type 6 depth 8 interlace 0 ring max alpha 0 centre alpha min 76 max 76
primary lowest pairs ΔE76: normal/pressed 19.82, normal/selected 22.18, hover/selected 27.11
secondary lowest pairs ΔE76: disabled/normal 17.07, hover/selected 17.53, disabled/hover 18.01
LABEL_ALPHA 128 LABEL_RATIO 4.5
```

Every limit holds, each with a margin:

- Sides ≤ 512.
- 8-bit RGBA (colour type 6), not interlaced.
- Every ring pixel at alpha 0.
- Insets whole and inside each image.
- Every two states of a variant at least ΔE 15 apart; the lowest pair is 17.07.
- Every label at least 4.5:1; the lowest is 5.69:1.

The panel frame's centre is alpha 76 (0.298), the brief's "about 0.3"; it carries no label, so no contrast check applies to it. The bytes: the largest file is 6,614 of the brief's 48,000, and all eleven together are 44,177 of the 96,000 inlined budget that T-DS's build holds (FR-020).

**What the judge makes of the studio's departures** (the page's Q55 to Q57, Q59). The brief's state values are aims ("Aim at these centre values"). Its checks are ΔE ≥ 15 between states and 4.5:1 for labels, and every departure meets both. So none is a finding. The look is his (R-4).

- **Q55**, the secondary selected face: measured L\* 30.02, C\* 22.69, hue 188° (atan2(−3.15, −22.47)). The studio's note gives L 30, C 22.7, h 188, and the brief's aim was L 24, C 35. Its pairs are 17.53 to hover and 18.4 or more to the rest, and its label is 8.72:1. One correction to the page: Q55's recommended answer calls 17.53 "lowest pair ΔE", but the set's lowest pair is 17.07, secondary disabled/normal. 17.53 is the lowest pair that involves the substituted face. This is asked in questions.md.
- **Q56**: primary hover C\* 27.73 (aim 62), primary selected C\* 54.51 (aim 95), secondary pressed C\* 4.53 (aim 15). Each matches the studio's figures, and each passes ΔE and contrast.
- **Q57**: the studio's script added the one `iTXt` XMP mark, as the brief asks. Main's arrival check admits it (rules M: 0 findings, here and in his intake's `--staged` run). It's a question about the studio's skill, not the round.
- **Q59**: the round meets both readings of `bytes`: 6,614 per file, and 44,177 for the set.
- **Q68** (a `states` line sorted as the brief's): it doesn't arise, since no `states` line was printed. Round 2's brief isn't drafted, because the round passed.

## 3. The record, once

The dry output was whole and no finding was `line.py`'s. Before the run, `--record` was read (`line.py:1760-1807`): it writes only `<briefs>/ui-buttons/1.result.json` (through a `.tmp` beside it and `os.replace`), and refuses a round that already has a result. `1.result.json` didn't exist.

```
$ python3 -I -B scripts/studio/line.py candidate /srv/studio/handoff/ui-buttons/1 --brief /srv/studio/briefs/ui-buttons/1.json --record; echo "exit $?"
arrival-check: main's copy, at f6baef8ce027, on a scratch copy under assets/ui/buttons/
file                                          bytes     gzip      vertices  triangles  texture
assets/ui/buttons/btn-primary-disabled.png    3517      3466      -         -          -
assets/ui/buttons/btn-primary-hover.png       3761      3712      -         -          -
assets/ui/buttons/btn-primary-normal.png      3641      3587      -         -          -
assets/ui/buttons/btn-primary-pressed.png     3621      3571      -         -          -
assets/ui/buttons/btn-primary-selected.png    4224      4184      -         -          -
assets/ui/buttons/btn-secondary-disabled.png  3344      3284      -         -          -
assets/ui/buttons/btn-secondary-hover.png     3797      3747      -         -          -
assets/ui/buttons/btn-secondary-normal.png    3883      3823      -         -          -
assets/ui/buttons/btn-secondary-pressed.png   3601      3544      -         -          -
assets/ui/buttons/btn-secondary-selected.png  4174      4131      -         -          -
assets/ui/buttons/panel-frame.png             6614      6485      -         -          -
arrival-check: 0 findings in 13 files
line: pass; round 1
exit 0
$ ls -la /srv/studio/briefs/ui-buttons/
total 24
drwxr-xr-x 2 dev dev 4096 Nov 17 04:14 .
drwxr-xr-x 5 dev dev 4096 Nov 17 03:36 ..
-rw-r--r-- 1 dev dev 9685 Nov 17 03:36 1.json
-rw-r--r-- 1 dev dev   95 Nov 17 04:14 1.result.json
$ sha256sum /srv/studio/briefs/ui-buttons/1.result.json
703278d72786a8788d763ee9745b726606c24760513146f648f6c8175bf531a3  /srv/studio/briefs/ui-buttons/1.result.json
$ cat /srv/studio/briefs/ui-buttons/1.result.json
{
  "schema": 1,
  "asset": "ui-buttons",
  "round": 1,
  "result": "pass",
  "findings": []
}
$ diff dry.txt record.txt && echo "dry and recorded outputs identical"
dry and recorded outputs identical
```

I wrote nothing else under `/srv/studio/`. The judge's own scratch copy is `line.py`'s, in a `mkdtemp` it removes.

## 4. The record in studio-round-1.md

- **The file first.** My base (`c77eb4ce`) holds studio-round-1.md as it was at `7cdc31d2`. `2dd4213f` (the rework, on `night/rework-spec-030/rework-spec-030`) isn't an ancestor of my base. So the file still had `*(R-1)*` and the reviewed plan's intake path. In commit `c82491c5`, I brought in the rework's three hunks by Edit: the status line, R-4's row, and R-1's record. `diff <(git show 2dd4213f:specs/030-ui-skin/studio-round-1.md) specs/030-ui-skin/studio-round-1.md` was then empty. R-3's record sits beside R-1's, and a later merge of the rework meets the same lines.
- **The record** (`1ef50167`, `record(030): …`): only the four `*(R-3)*` placeholders were replaced, with:
  - both outputs;
  - the result's SHA-256 and its text;
  - the eleven files' SHA-256s, from `records.json` and from the bytes;
  - `slices.json`, pasted.

  Checked after writing: the pasted `slices.json` less its indent equals the file's bytes; each of the eleven table rows names the file's hash from the bytes, twice; no `*(R-3)*` is left.
- **The hashes** (all eleven agree; `records.json`'s `directory` is `assets/ui/buttons`, its license `all-rights-reserved-2026`, its source `{"type": "design", "id": "D-0006"}`, every entry made `2026-11-17`, none with `approval`, and one `workflow_sha256`, `79f57ef071ab7bf2774f294d6915bd6d2acc1490cd1fd15d907da715e8c21e56`):

| File | `records.json` = the bytes |
|---|---|
| `btn-primary-disabled.png` | `fe4da5713f32ea8b0f08719161d94b74eea224c8e661e1ba2c0dbcc51fc2d626` |
| `btn-primary-hover.png` | `ce93cdc64bf4dcdb6dd63b325afe25b5bd32e72601aa817610eea7395ff6c43f` |
| `btn-primary-normal.png` | `17b6faa32027e312d59d546c8764e1de519a74a708138238eee3373c683147c3` |
| `btn-primary-pressed.png` | `0e831b953301bad2c5244ee27f2c0221db3281d42ecbf2606780abae5f5c9da5` |
| `btn-primary-selected.png` | `5062c8adb92a204943c291baabdd5637a102bdb4bb294fc599ce695bbaf89cc9` |
| `btn-secondary-disabled.png` | `30fd1dcfd3fe9bab75280a8058c31395bb798dce944163bfe592aa36d8929d90` |
| `btn-secondary-hover.png` | `30c1e35db047f465fdbcdeae35650023c7c6d18c7f6afb7471e4dc043ca041bf` |
| `btn-secondary-normal.png` | `1d98c57c0782e0af6c4949b4e0a6e08688dc2279b94600acb623610292f48fdd` |
| `btn-secondary-pressed.png` | `1b5af9a30d13ec8c7eee02690198b4da63dc4bc36b7bf76628e9b54f32efd5c1` |
| `btn-secondary-selected.png` | `08e54a06ef44eaf56b254a9dfeded13ae8752fbc5b672628a58cc34f47199dff` |
| `panel-frame.png` | `dbf6bd7caf6b6f43a6de90238c165646a52d69255961f8fd00ff73b52cfef34d` |

## 5. The pass: his intake

[`docs/merge-requests/human-patches/030.md`](../../docs/merge-requests/human-patches/030.md) (SHA-256 `e62e85d326156c4dc91fd79d0aa006e214fad670f716457851a368c0005a8cbc` as first committed) is on 021's route: one table, with row 1 his copy steps and the text patch, and rows 2 to 4 none. It is his to apply, and never applied by an agent.

- **The text patch.** `docs/merge-requests/2026-11-17-030-ui-buttons-intake.patch` is 48,666 bytes, SHA-256 `3751674787f85d3a1c56c3053a5815151f674da210486a376466a1ad8ad6a1ae`. It changes `assets/CREDITS.md` (one section added) and adds `assets/ui/buttons/records.json` and `assets/ui/buttons/LICENSE.md`. It was built from plain copies of `f6baef8c` by `git archive`, with `credits.py` run in the copy, then `git diff --no-index --full-index`.
- **Found while building it.** The handoff's `records.json` isn't in `credits.py`'s canonical form. Each step has `models_checked` and `workflow_sha256` before `service`, as the brief's RECORD FORMAT listed them; `credits.py`'s `STEP_ORDER` puts `service` first. `credits.py` rewrote it to the same JSON value: the handoff's is `ebbdd287…525af`, the intake's `37bafe8c…a6dc4`. The patch carries the rewrite. It isn't a judge finding, since `line.py` doesn't run `credits.py --check`, and it's asked in questions.md.
- **The Write tool and the two blank lines.** The Write tool doesn't keep a line that holds only one space. So the committed patch has two empty lines where the built one had the patch format's blank context lines, a single space each (48,666 bytes against the scratch 48,668, SHA-256 `f0d15084…6c11de`). I didn't respell around it. I checked the committed bytes themselves on a fresh export.
- **The checks:**
  - On a fresh `git archive f6baef8c` export: `patch -p1 --dry-run` exit 0, then `patch -p1` exit 0. No `.rej` or `.orig`, and the three files equal the plain copies byte for byte. This was done for both the scratch and the committed patch.
  - On another fresh export, made a scratch repository with `f6baef8c`'s tree committed on `main`: the patch, the eleven PNGs copied in, and `git add -A`. Then `credits.py --check` printed "credits: OK: the renderings and the records' form" (exit 0), and main's `arrival_check.py --staged` printed "arrival-check: 0 findings in 14 files" (exit 0, no WARN).
  - The full outputs are in 030.md.
- **Not done here: T-DS05's data edit.** It isn't this task's, since T-DS isn't built. For it: the eleven hashes above, and every button's insets 24 on each side and the frame's 48. In `metal-image`'s `slice: [t, r, b, l]`, that's `[24, 24, 24, 24]` and `[48, 48, 48, 48]`. The labels are `#14171c` and `#e6fbff`.

### Plan

My branch's `plan.md` still names the reviewed plan's intake file, `docs/merge-requests/2026-11-17-030-ui-buttons-intake.md`. The rework's plan (§R-D3 at `2dd4213f`, rework N-5) names `docs/merge-requests/human-patches/030.md`, and this task follows the rework, as the supervisor ordered. I didn't edit `plan.md` here: the rework's branch carries that change, and a second copy of it would only meet it at merge. The text patch's file name (`2026-11-17-030-ui-buttons-intake.patch`) follows 028's P1, a `.patch` in `docs/merge-requests/` named by `human-patches/NNN.md`. No other departure.

## 6. Lint

`make lint` first stopped: "node_modules is missing: run make setup". As `impl-030dj` did on this branch, I ran `make setup`'s first half, `npm ci --ignore-scripts` (exit 0). I didn't run `make git-hooks`, which writes the shared clone's hooks: that's his. `node_modules/` is gitignored.

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
917 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
exit 0
```

I didn't run `make test` and `make evals`, for three reasons:

- The supervisor's step 6 names `make lint`.
- tasks.md gives the one `make check` to T-INT.
- This branch changes no code: one spec document, two notes, and one patch for his hand.

## Refusals, incidents, human-only paths

- **Bash-gate refusal 1.** A scratch-repository commit with `--no-verify`, made while checking his intake on an export under `/tmp/judge-ui-r1/`, was refused with "skipping git's hooks". Nothing in that command ran. Route: an ordinary commit, with the hooks running. I didn't route around it with `commit-tree` plumbing, which would only respell the same skip.
- **Bash-gate refusal 2.** A read-only `git config --global --get core.hooksPath` was refused with "redirecting git hooks or config". I dropped it as not needed. Both refusals are on the page (questions.md).
- **Disk full.** My scratch exports under `/tmp/judge-ui-r1/` filled `/tmp`, a 2 GB tmpfs: four full `git archive` trees and a scratch repository. A fifth export failed part-way. I deleted only those directories, which this session made with `mktemp`, and kept the three plain-copy text files and the scratch patch (their hashes unchanged, re-checked). The export check was then repeated on one new export, deleted after. Nothing outside `/tmp/judge-ui-r1/` was touched.
- **Human-only paths.** None was written. `assets/**` and its intake are his patch. `tools/gates/arrival_check.py` and `scripts/assets/credits.py` were run only from scratch exports of `f6baef8c`, never edited.
- **Requests and the studio.** No request file was written. No ComfyUI, GPU, or network was used, except `npm ci` from the lockfile.

## Questions written to `/night/io/out/questions.md`

1. Should later still briefs give the step key order `credits.py` writes, and should `line.py candidate` run main's `credits.py --check`? (Recommended: yes to both; a backlog item.)
2. Should Q55's "lowest pair ΔE 17.53" be corrected to the set's 17.07 (disabled/normal), with 17.53 as the selected face's lowest (hover/selected)? (Recommended: yes.)
3. Should either bash-gate rule change after the two refusals above? (Recommended: no.)

## Done, and not done

Done:

- R-3's steps 1 to 6, as the supervisor ordered:
  - the inputs, hashed, and the eleven names checked by hand;
  - the dry run, whole, with no finding to sort and the still checks' measures printed;
  - `--record` once: round 1 **passes**, and `1.result.json` has SHA-256 `703278d7…f531a3`;
  - the record in studio-round-1.md;
  - his intake note and its text patch, checked with `patch -p1` on fresh exports, `credits.py --check`, and `arrival_check.py --staged`;
  - `make lint` exit 0.

Not done, and not this task's:

- **His look** (R-4): the files and `sheet.png`, with Q55, Q56, and Q58 open on the page.
- **His intake**: `human-patches/030.md`, after the stack's merge.
- **T-DS05**: the record's hashes and insets into `content/ui-skins.yaml`'s `metal-image`, once T-DS exists.
- **The rework's merge** (`2dd4213f`) with this branch: studio-round-1.md's three rework hunks are already equal.
- **T-INT's `make check`** and the stack's merge-request note.
- **Round 2**: not needed. Its brief isn't drafted, since round 1 passed.
