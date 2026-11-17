# Spec 030, group DS, the build's part: `impl-030dsb`'s notes

Night 5 (2026-11-17). Implementer `impl-030dsb`, branch `night/impl-030dsb/impl-030dsb`, from `rework2-spec-030`'s tip
`8e83e7fc916a1a4c6506d5ac57a841bdfc47b1ca`. I wrote none of spec 030 or its reviews. The documents are that tip's:
`spec.md` FR-027 and SC-007, `plan.md` §1, §R-D4, and §9's DS row, `tasks.md` T-DS01 (c) and T-DS02.

## The departure: T-DS split in two

The plan gives all of T-DS to `impl-030ds`, from B's tip. The supervisor's queue splits it: this branch builds the
build's part, which touches none of B's files, ahead of B's rework:

- T-DS01 (c): `deploy/scripts/test_web_image.py`, `scripts/test_makefile.py`'s `WEB_BUILD`, `deploy/scripts/test_release.py`'s
  `web_contexts` cases;
- T-DS02's `deploy/scripts/web_image.py`, `deploy/scripts/release.py` (`web_contexts()` alone), and `apps/web/Dockerfile`.

The rest of the DS row (T-DS01 (a) and (b), T-DS02's `build/ui-skins-image.ts`, `build/ui-skins.ts`'s image case and
`src/ui/button-image.css`, T-DS03 to T-DS05) stays `impl-030ds`'s, from B's tip. The GREEN commit adds one "As built"
line to `plan.md` §9, directly under the table (a line between the table's rows would end the table, so the DS row
itself is unchanged); nothing else in `plan.md` or `tasks.md` changed.

## Commits

| Commit | What |
|---|---|
| `4ab408e4` | save point, RED |
| `014f3286` | RED: the three test files (T-DS01 (c)) |
| `a22ca515` | save point, GREEN |
| `a1106361` | GREEN: `web_image.py`, `release.py`, `apps/web/Dockerfile`, `plan.md` §9's As built line; no test file |
| `58cd74fc` | save point, checks |
| `df67b260` | save point, these notes |
| this one | these notes |

## What I built

**RED** (`014f3286`), on the `visitor-assets` cases' pattern:

- `deploy/scripts/test_web_image.py`: `FakeDocker` knows `ui-assets` (fourth, in the script's order) and records
  `ui_assets`; `build_argv` gains `ui` after `twin`. New cases: the tree's own `assets/ui` handed over as `ui-assets`,
  alone and after `twin-assets` (`test_the_button_images_come_from_the_export_it_builds_after_the_twin`); a link in its
  place, `assets/` a link, a file, or absent names no context and prints "has no assets/ui directory of its own, so the
  buttons build on their CSS skin" (4 parametrized cases); the `ui-assets` stage empty and right after `twin-assets`;
  the build stage copies it to `/src/assets/ui/` before the site's `RUN … build -w apps/web` and no other stage reads
  it; `ASSET_CONTEXTS` is the four pairs in the Dockerfile's stage order; `main`'s contexts are `ASSET_CONTEXTS`' in
  order (with every folder present, then with a stand-in list monkeypatched in, so `main` is proved to read the list
  rather than its own copy). The existing pin of the build stage's `COPY --from=… assets/` lines
  (`test_the_builds_have_the_trees_caps_and_no_other_policy_file`) gains `UI_ASSETS_COPY`.
- `scripts/test_makefile.py`: `WEB_BUILD` gains `(?:--build-context ui-assets=<ROOT>/assets/ui )?` after
  `twin-assets`, and a helper `web_build(line)` asserts beside it that the segment is present exactly when
  `<ROOT>/assets/ui` is the tree's own directory (neither it nor `assets/` a link); the three asserts that used
  `WEB_BUILD.fullmatch` now call `web_build`.
- `deploy/scripts/test_release.py`: `src` a scratch tree with a copy of the tree's own `deploy/scripts/web_image.py`;
  `rl.web_contexts("web", src)` names `ui-assets=<src>/assets/ui` with its `--build-context`, right after
  `twin-assets`' pair when both are there; absent, a link, a file, or `assets/` a link: no `ui-assets` pair (4
  parametrized cases); every pair of the copy's `ASSET_CONTEXTS` whose folder the tree holds is named, in order, after
  `ROOM_DRAFTS=` and the policy; `web_contexts("api", src) == []`. A helper removes each call's policy folder.

**GREEN** (`a1106361`):

- `deploy/scripts/web_image.py`: `UI_ASSETS = "assets/ui"`, `UI_ASSETS_CONTEXT = "ui-assets"`, `ASSET_CONTEXTS` (the
  four pairs, in the Dockerfile's stage order), and `WITHOUT`, each folder's "so …" clause, which keeps each folder's
  "has no … directory of its own" line word for word. `main` builds its `--build-context` pairs and lines from
  `ASSET_CONTEXTS` in one loop, in place of the three blocks. The docstring's paragraph on the named contexts gains the
  sentence on `ui-assets` and one on `ASSET_CONTEXTS`; two of its lines over the width are rewrapped (no words changed
  but the new ones).
- `deploy/scripts/release.py`: `web_contexts()` loops over `wi.ASSET_CONTEXTS` in place of its own tuple (−5 +1 lines);
  nothing else in the file.
- `apps/web/Dockerfile`: `FROM scratch AS ui-assets` after the `twin-assets` stage, with its comment, and
  `COPY --from=ui-assets / /src/assets/ui/` in the build stage after the twin's copy, before the `RUN`. `.dockerignore`
  already lets `assets/ui` in (its `assets` lines are `assets/policy` and the two `!assets/policy/…` exceptions).

Nothing under `apps/web/src/` or `apps/web/build/`, nothing under `assets/**`, and no change to the `Makefile`.

## Which RED cases couldn't fail before the code

Named so no one reads them as seen failing:

- The four `test_release.py` "no `ui-assets` pair" cases: before the code, `web_contexts` names no `ui-assets` at all,
  so they pass at RED and guard the negative after GREEN. Their positive siblings failed.
- The `ui_absent` and other negative `test_web_image.py` cases did fail at RED, on the missing line.
- `scripts/test_makefile.py`'s `web_build`: the tree at `8e83e7fc` has no `assets/ui`, so `make`'s line has no segment
  and the pin passes before and after GREEN, as the plan wants ("so the pin holds before his intake and after"). It
  will exercise the segment only once his intake lands `assets/ui/`; I can't create that folder (`assets/**` is his).

## Pastes

### RED: the three files, the Makefile's `PYTEST` and `PYTEST_ARGS`, at `014f3286`

`PYTEST` resolves to `pytest` here (`/opt/tools/bin/pytest`); `PYTEST_ARGS` is `-q -p no:cacheprovider
--import-mode=importlib` (`Makefile:117-118`), with `--tb=line` added for a shorter paste.

```
$ pytest -q -p no:cacheprovider --import-mode=importlib --tb=line deploy/scripts/test_web_image.py scripts/test_makefile.py deploy/scripts/test_release.py
......................................................................F. [ 38%]
....................FFFFFFFFF........................................... [ 76%]
..............................F....F........                             [100%]
=================================== FAILURES ===================================
E   AssertionError: assert ['COPY --from...assets/twin/'] == ['COPY --from...c/assets/ui/']
      
      Right contains one more item: 'COPY --from=ui-assets / /src/assets/ui/'
      Use -v to get more diff
/home/h4reet/h4reet-ai/night/2026-11-17/impl-030dsb/deploy/scripts/test_web_image.py:1226: AssertionError: assert ['COPY --from...assets/twin/'] == ['COPY --from...c/assets/ui/']
E   AssertionError: assert ('buildx', 'b... '--tag', ...) == ('buildx', 'b... '--tag', ...)
      
      At index 15 diff: '--label' != '--build-context'
      Right contains 2 more items, first extra item: 'org.h4reet.web.policy=80a8986e15878665bfe3ebbf3ac91a2596eadb14e80399e6795e0b63c6f9e931'
      Use -v to get more diff
----------------------------- Captured stdout call -----------------------------
web image: /tmp/pytest-of-dev/pytest-1/test_the_button_images_come_fr0/state/tree/0123456789abcdef0123456789abcdef01234567 has no assets/room directory of its own, so every piece builds as its stand-in
web image: /tmp/pytest-of-dev/pytest-1/test_the_button_images_come_fr0/state/tree/0123456789abcdef0123456789abcdef01234567 has no assets/visitors directory of its own, so both figures build as their fallbacks
web image: /tmp/pytest-of-dev/pytest-1/test_the_button_images_come_fr0/state/tree/0123456789abcdef0123456789abcdef01234567 has no assets/twin directory of its own, so the twin's figure shows its stand-in
web image: building h4reet-web:0123456789abcdef0123456789abcdef01234567 from /tmp/pytest-of-dev/pytest-1/test_the_button_images_come_fr0/state/tree/0123456789abcdef0123456789abcdef01234567
web image: h4reet-web:0123456789abcdef0123456789abcdef01234567, built
/home/h4reet/h4reet-ai/night/2026-11-17/impl-030dsb/deploy/scripts/test_web_image.py:1753: AssertionError: assert ('buildx', 'b... '--tag', ...) == ('buildx', 'b... '--tag', ...)
E   assert 'has no assets/ui directory of its own, so the buttons build on their CSS skin' in 'web image: /tmp/pytest-of-dev/pytest-1/test_assets_ui_that_isnt_the_t0/state/tree/0123456789abcdef0123456789abcdef012...tree/0123456789abcdef0123456789abcdef01234567\nweb image: h4reet-web:0123456789abcdef0123456789abcdef01234567, built\n'
     +  where 'web image: /tmp/pytest-of-dev/pytest-1/test_assets_ui_that_isnt_the_t0/state/tree/0123456789abcdef0123456789abcdef012...tree/0123456789abcdef0123456789abcdef01234567\nweb image: h4reet-web:0123456789abcdef0123456789abcdef01234567, built\n' = CaptureResult(out="web image: /tmp/pytest-of-dev/pytest-1/test_assets_ui_that_isnt_the_t0/state/tree/0123456789abcdef0...456789abcdef0123456789abcdef01234567\nweb image: h4reet-web:0123456789abcdef0123456789abcdef01234567, built\n", err='').out
     +    where CaptureResult(out="web image: /tmp/pytest-of-dev/pytest-1/test_assets_ui_that_isnt_the_t0/state/tree/0123456789abcdef0...456789abcdef0123456789abcdef01234567\nweb image: h4reet-web:0123456789abcdef0123456789abcdef01234567, built\n", err='') = readouterr()
     +      where readouterr = <_pytest.capture.CaptureFixture object at 0x714c87230a70>.readouterr
/home/h4reet/h4reet-ai/night/2026-11-17/impl-030dsb/deploy/scripts/test_web_image.py:1809: assert 'has no assets/ui directory of its own, so the buttons build on their CSS skin' in 'web image: /tmp/pytest-of-dev/pytest-1/test_assets_ui_that_isnt_the_t0/state/tree/0123456789abcdef0123456789abcdef012...tree/0123456789abcdef0123456789abcdef01234567\nweb image: h4reet-web:0123456789abcdef0123456789abcdef01234567, built\n'
E   assert 'has no assets/ui directory of its own, so the buttons build on their CSS skin' in 'web image: /tmp/pytest-of-dev/pytest-1/test_assets_ui_that_isnt_the_t1/state/tree/0123456789abcdef0123456789abcdef012...tree/0123456789abcdef0123456789abcdef01234567\nweb image: h4reet-web:0123456789abcdef0123456789abcdef01234567, built\n'
     +  where 'web image: /tmp/pytest-of-dev/pytest-1/test_assets_ui_that_isnt_the_t1/state/tree/0123456789abcdef0123456789abcdef012...tree/0123456789abcdef0123456789abcdef01234567\nweb image: h4reet-web:0123456789abcdef0123456789abcdef01234567, built\n' = CaptureResult(out="web image: /tmp/pytest-of-dev/pytest-1/test_assets_ui_that_isnt_the_t1/state/tree/0123456789abcdef0...456789abcdef0123456789abcdef01234567\nweb image: h4reet-web:0123456789abcdef0123456789abcdef01234567, built\n", err='').out
     +    where CaptureResult(out="web image: /tmp/pytest-of-dev/pytest-1/test_assets_ui_that_isnt_the_t1/state/tree/0123456789abcdef0...456789abcdef0123456789abcdef01234567\nweb image: h4reet-web:0123456789abcdef0123456789abcdef01234567, built\n", err='') = readouterr()
     +      where readouterr = <_pytest.capture.CaptureFixture object at 0x714c87232150>.readouterr
/home/h4reet/h4reet-ai/night/2026-11-17/impl-030dsb/deploy/scripts/test_web_image.py:1809: assert 'has no assets/ui directory of its own, so the buttons build on their CSS skin' in 'web image: /tmp/pytest-of-dev/pytest-1/test_assets_ui_that_isnt_the_t1/state/tree/0123456789abcdef0123456789abcdef012...tree/0123456789abcdef0123456789abcdef01234567\nweb image: h4reet-web:0123456789abcdef0123456789abcdef01234567, built\n'
E   assert 'has no assets/ui directory of its own, so the buttons build on their CSS skin' in 'web image: /tmp/pytest-of-dev/pytest-1/test_assets_ui_that_isnt_the_t2/state/tree/0123456789abcdef0123456789abcdef012...tree/0123456789abcdef0123456789abcdef01234567\nweb image: h4reet-web:0123456789abcdef0123456789abcdef01234567, built\n'
     +  where 'web image: /tmp/pytest-of-dev/pytest-1/test_assets_ui_that_isnt_the_t2/state/tree/0123456789abcdef0123456789abcdef012...tree/0123456789abcdef0123456789abcdef01234567\nweb image: h4reet-web:0123456789abcdef0123456789abcdef01234567, built\n' = CaptureResult(out="web image: /tmp/pytest-of-dev/pytest-1/test_assets_ui_that_isnt_the_t2/state/tree/0123456789abcdef0...456789abcdef0123456789abcdef01234567\nweb image: h4reet-web:0123456789abcdef0123456789abcdef01234567, built\n", err='').out
     +    where CaptureResult(out="web image: /tmp/pytest-of-dev/pytest-1/test_assets_ui_that_isnt_the_t2/state/tree/0123456789abcdef0...456789abcdef0123456789abcdef01234567\nweb image: h4reet-web:0123456789abcdef0123456789abcdef01234567, built\n", err='') = readouterr()
     +      where readouterr = <_pytest.capture.CaptureFixture object at 0x714c87dcc050>.readouterr
/home/h4reet/h4reet-ai/night/2026-11-17/impl-030dsb/deploy/scripts/test_web_image.py:1809: assert 'has no assets/ui directory of its own, so the buttons build on their CSS skin' in 'web image: /tmp/pytest-of-dev/pytest-1/test_assets_ui_that_isnt_the_t2/state/tree/0123456789abcdef0123456789abcdef012...tree/0123456789abcdef0123456789abcdef01234567\nweb image: h4reet-web:0123456789abcdef0123456789abcdef01234567, built\n'
E   assert 'has no assets/ui directory of its own, so the buttons build on their CSS skin' in 'web image: /tmp/pytest-of-dev/pytest-1/test_assets_ui_that_isnt_the_t3/state/tree/0123456789abcdef0123456789abcdef012...tree/0123456789abcdef0123456789abcdef01234567\nweb image: h4reet-web:0123456789abcdef0123456789abcdef01234567, built\n'
     +  where 'web image: /tmp/pytest-of-dev/pytest-1/test_assets_ui_that_isnt_the_t3/state/tree/0123456789abcdef0123456789abcdef012...tree/0123456789abcdef0123456789abcdef01234567\nweb image: h4reet-web:0123456789abcdef0123456789abcdef01234567, built\n' = CaptureResult(out="web image: /tmp/pytest-of-dev/pytest-1/test_assets_ui_that_isnt_the_t3/state/tree/0123456789abcdef0...456789abcdef0123456789abcdef01234567\nweb image: h4reet-web:0123456789abcdef0123456789abcdef01234567, built\n", err='').out
     +    where CaptureResult(out="web image: /tmp/pytest-of-dev/pytest-1/test_assets_ui_that_isnt_the_t3/state/tree/0123456789abcdef0...456789abcdef0123456789abcdef01234567\nweb image: h4reet-web:0123456789abcdef0123456789abcdef01234567, built\n", err='') = readouterr()
     +      where readouterr = <_pytest.capture.CaptureFixture object at 0x714c87232c30>.readouterr
/home/h4reet/h4reet-ai/night/2026-11-17/impl-030dsb/deploy/scripts/test_web_image.py:1809: assert 'has no assets/ui directory of its own, so the buttons build on their CSS skin' in 'web image: /tmp/pytest-of-dev/pytest-1/test_assets_ui_that_isnt_the_t3/state/tree/0123456789abcdef0123456789abcdef012...tree/0123456789abcdef0123456789abcdef01234567\nweb image: h4reet-web:0123456789abcdef0123456789abcdef01234567, built\n'
E   ValueError: 'ui-assets' is not in list
/home/h4reet/h4reet-ai/night/2026-11-17/impl-030dsb/deploy/scripts/test_web_image.py:1817: ValueError: 'ui-assets' is not in list
E   AssertionError: assert 'COPY --from=ui-assets / /src/assets/ui/' in ['COPY --from=room-assets / /src/assets/room/', 'COPY --from=visitor-assets / /src/assets/visitors/', 'COPY --from=twi...run --ignore-scripts build -w apps/web  && printf \'ok\\n\' > apps/web/dist/healthz  && rm -f apps/web/dist/*.pdf.txt']
/home/h4reet/h4reet-ai/night/2026-11-17/impl-030dsb/deploy/scripts/test_web_image.py:1832: AssertionError: assert 'COPY --from=ui-assets / /src/assets/ui/' in ['COPY --from=room-assets / /src/assets/room/', 'COPY --from=visitor-assets / /src/assets/visitors/', 'COPY --from=twi...run --ignore-scripts build -w apps/web  && printf \'ok\\n\' > apps/web/dist/healthz  && rm -f apps/web/dist/*.pdf.txt']
E   AttributeError: module 'web_image' has no attribute 'ASSET_CONTEXTS'
/home/h4reet/h4reet-ai/night/2026-11-17/impl-030dsb/deploy/scripts/test_web_image.py:1848: AttributeError: module 'web_image' has no attribute 'ASSET_CONTEXTS'
E   AttributeError: module 'web_image' has no attribute 'ASSET_CONTEXTS'
/home/h4reet/h4reet-ai/night/2026-11-17/impl-030dsb/deploy/scripts/test_web_image.py:1865: AttributeError: module 'web_image' has no attribute 'ASSET_CONTEXTS'
E   AssertionError: assert 'ui-assets=/tmp/pytest-of-dev/pytest-1/test_the_releases_web_build_na0/src/assets/ui' in ['policy=/tmp/h4-web-policy-zv2gmyjp']
     +  where ['policy=/tmp/h4-web-policy-zv2gmyjp'] = pairs_of(['--build-arg', 'ROOM_DRAFTS=', '--build-context', 'policy=/tmp/h4-web-policy-zv2gmyjp'])
/home/h4reet/h4reet-ai/night/2026-11-17/impl-030dsb/deploy/scripts/test_release.py:438: AssertionError: assert 'ui-assets=/tmp/pytest-of-dev/pytest-1/test_the_releases_web_build_na0/src/assets/ui' in ['policy=/tmp/h4-web-policy-zv2gmyjp']
E   AttributeError: module 'web_image_for_test' has no attribute 'ASSET_CONTEXTS'
/home/h4reet/h4reet-ai/night/2026-11-17/impl-030dsb/deploy/scripts/test_release.py:484: AttributeError: module 'web_image_for_test' has no attribute 'ASSET_CONTEXTS'
=========================== short test summary info ============================
FAILED deploy/scripts/test_web_image.py::test_the_builds_have_the_trees_caps_and_no_other_policy_file
FAILED deploy/scripts/test_web_image.py::test_the_button_images_come_from_the_export_it_builds_after_the_twin
FAILED deploy/scripts/test_web_image.py::test_assets_ui_that_isnt_the_trees_own_directory_names_no_context[ui_a_link]
FAILED deploy/scripts/test_web_image.py::test_assets_ui_that_isnt_the_trees_own_directory_names_no_context[ui_under_a_linked_assets]
FAILED deploy/scripts/test_web_image.py::test_assets_ui_that_isnt_the_trees_own_directory_names_no_context[ui_a_file]
FAILED deploy/scripts/test_web_image.py::test_assets_ui_that_isnt_the_trees_own_directory_names_no_context[ui_absent]
FAILED deploy/scripts/test_web_image.py::test_the_ui_assets_stage_is_empty_and_after_the_twin_assets_stage
FAILED deploy/scripts/test_web_image.py::test_the_build_stage_copies_the_button_images_before_it_builds_and_nothing_else_reads_them
FAILED deploy/scripts/test_web_image.py::test_the_asset_contexts_are_one_list_in_the_dockerfiles_stage_order
FAILED deploy/scripts/test_web_image.py::test_mains_contexts_are_the_asset_contexts_in_order
FAILED deploy/scripts/test_release.py::test_the_releases_web_build_names_assets_ui_after_the_twin
FAILED deploy/scripts/test_release.py::test_the_releases_contexts_are_every_pair_of_the_scripts_list
12 failed, 176 passed in 5.48s
```

### GREEN: the three files, at `a1106361`

```
$ pytest -q -p no:cacheprovider --import-mode=importlib deploy/scripts/test_web_image.py scripts/test_makefile.py deploy/scripts/test_release.py
........................................................................ [ 38%]
........................................................................ [ 76%]
............................................                             [100%]
188 passed in 5.13s
```

### The test files that load `web_image.py` or `release.py`

Found with `git grep -l -E "web_image\.py|release\.py|\"web_image\"|\"release\"" -- 'test_*.py' '*/test_*.py' '*_test.py'`
(17 files mention either), then narrowed to those that load or read the scripts: `test_web_image.py` and
`test_release.py` load them; `test_release_fixes.py` and `test_release_site.py` load `test_release.py` (so
`release.py`); `test_measure_tunnel_end.py:222` reads `release.py`; `test_makefile.py` runs `make`, which runs
`web_image.py`. The rest name them in comments or as data (`"release"` keys in JSON).

```
$ pytest -q -p no:cacheprovider --import-mode=importlib deploy/scripts/test_web_image.py scripts/test_makefile.py deploy/scripts/test_release.py deploy/scripts/test_release_fixes.py deploy/scripts/test_release_site.py deploy/scripts/test_measure_tunnel_end.py
........................................................................ [ 28%]
........................................................................ [ 56%]
........................................................................ [ 84%]
.......................................                                  [100%]
255 passed in 8.05s
```

### `make lint`, at `a1106361`

`node_modules` was missing in this fresh worktree ("node_modules is missing: run make setup", exit 1), so I ran
`make setup` first (`npm ci --ignore-scripts`, exit 0; its git-hooks step said ".git/hooks isn't writable here (the
agent sandbox); the Author runs make git-hooks"). `node_modules` is ignored, so the worktree stays clean.

```
$ make lint
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
915 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
exit 0
```

### F's line: the merge onto F's tip `ab6e64e6`

The repository took the merge-tree's objects, so no scratch object folder was needed.

```
$ git cat-file -t ab6e64e6 && git log --oneline -1 ab6e64e6 && git merge-base ab6e64e6 HEAD | cut -c1-12; git merge-tree --write-tree ab6e64e6 HEAD; echo "exit $?"
commit
ab6e64e6 docs(001): merge-f-4's record: F8 merged into F's line (b189d835); the suites on the result, F8's two known failures, the four patches green on an export
b6b4d84790ae
7ca3bdbfd71f72ec5e27408b655e1681880d87dc
exit 0
```

No conflict. Both lines change `release.py` and `test_release.py`, in different hunks:

```
$ git diff --stat b6b4d84790ae ab6e64e6 -- deploy/scripts/release.py deploy/scripts/test_release.py deploy/scripts/web_image.py deploy/scripts/test_web_image.py apps/web/Dockerfile scripts/test_makefile.py specs/030-ui-skin/plan.md
 deploy/scripts/release.py      | 48 ++++++++++++++++++++++++++++--------------
 deploy/scripts/test_release.py |  7 ++++--
 2 files changed, 37 insertions(+), 18 deletions(-)
$ git diff --stat b6b4d84790ae HEAD -- deploy/scripts/release.py deploy/scripts/test_release.py
 deploy/scripts/release.py      |  6 +--
 deploy/scripts/test_release.py | 95 ++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 96 insertions(+), 5 deletions(-)
```

The merged tree, exported with `git archive` into a fresh `mktemp -d` folder, and its release tests run there:

```
$ D=$(mktemp -d /tmp/impl-030dsb-merged.XXXXXX) && git --no-replace-objects archive 7ca3bdbf | tar -x -C "$D" && echo "$D" && grep -n "for folder_name, context in" "$D/deploy/scripts/release.py" && cd "$D" && pytest -q -p no:cacheprovider --import-mode=importlib deploy/scripts/test_release.py deploy/scripts/test_web_image.py deploy/scripts/test_release_fixes.py deploy/scripts/test_release_site.py 2>&1 | tail -15
/tmp/impl-030dsb-merged.43TIdI
831:    for folder_name, context in wi.ASSET_CONTEXTS:
........................................................................ [ 44%]
........................................................................ [ 88%]
..................                                                       [100%]
162 passed in 3.23s
```

## Refusals

- **The bash gate**, once: the compound command
  `git commit -q --allow-empty -m "wip(impl-030dsb): checks, the loaders' tests and make lint" ; git grep -l -E "web_image\.py|release\.py|\"web_image\"|\"release\"" -- 'test_*.py' '*/test_*.py' '*_test.py'`
  was refused: "Blocked by .claude/hooks/bash-gate.sh — an Author-only make target (spec 001)". Neither half runs a make
  target; I believe the gate matched "make lint" inside the commit message together with "release" in the grep's
  pattern. I didn't respell it: I ran the two as the separate commands they were, unchanged, and both ran
  (`58cd74fc`, and the grep above). The question is on the page (`/night/io/out/questions.md`).
- **The bash gate**, a second time, rightly: `rm -rf /tmp/impl-030dsb-merged.43TIdI` (the merged export above, mine)
  was refused as "recursive delete outside workspace. Route: delete only inside the repo". I left the folder where it is;
  it holds only the `git archive` of the merged tree and is no part of the branch.
- **The bash gate**, a third time, the same false match as the first: `git add … && git commit -q -m "<this commit's
  message>" && git log …` (the message names "make lint" and "release.py"). Under his rule 5 (a false match on text
  I'm writing: write it with the Write tool), I wrote the message to `/tmp/impl-030dsb-msg.txt` with the Write tool and
  committed with `git commit -F`.
- The post-edit hook flagged unused or undefined names between edits (`images`, `UI_ASSETS_COPY`, `shutil`,
  `Callable`, `models`/`avatars`/`twin`); each was the state between two edits of one change, gone with the next edit,
  and `make lint` passes.

## What's done and what isn't

Done:

- T-DS01 (c), every case the tip lists, RED seen failing (12) and committed before the code.
- T-DS02's build part: `web_image.py` (`UI_ASSETS`, its context, `ASSET_CONTEXTS` read by `main`, the docstring's
  sentence), `release.py` (`web_contexts()` over `wi.ASSET_CONTEXTS`, nothing else), the Dockerfile's `ui-assets`
  stage and copy; no test file in that commit.
- The As built line in `plan.md` §9.
- The checks above: the three files, the three that load them, `make lint`; F's line merges clean and its release
  tests pass on the merged export.

Not done, and not this branch's:

- T-DS01 (a) and (b), T-DS02's `build/ui-skins-image.ts`, `build/ui-skins.ts`'s image case, `src/ui/button-image.css`,
  T-DS03 to T-DS05: `impl-030ds`'s, from B's tip after B's rework.
- The image's actual build (`make image`, the Dockerfile's stages run on an engine): not run here. The image stage
  fails in the workers' containers (Q46, Q48); it is left to his gate, which will build the empty `ui-assets` stage.
- `make test`, `make evals`, and the full `make check`: per his rule 4, this task runs only the tests it adds or
  changes and those covering its files, plus `make lint`; T-INT runs the one full `make check`. So there is no
  `docs/merge-requests/` note from this branch; T-INT's `docs/merge-requests/2026-11-17-030-ui-skin.md` is the one.
- The `WEB_BUILD` segment proved with a real `assets/ui`: waits for his intake (R-D3).
