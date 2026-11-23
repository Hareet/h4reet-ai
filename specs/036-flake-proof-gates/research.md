# Research: Flake-Proof Gates

Spec 036. Each finding names how it was established. Runs were in the agent sandbox on 2026-11-23, from `main`'s
`42019d3d`, with the repository's own pins: vitest 5.0.3 (`package-lock.json`), pytest 9.1.1
(`.devcontainer/requirements-tools.txt`), npm 10.9.3.

## R-1: What vitest 5.0.3 prints, and where

**Observed** in a scratch project with two workspaces, each `"test": "vitest run"`, run as `make test` runs them,
`npm test --workspaces --if-present`, stdout not a terminal:

- Each workspace's run opens with ` RUN  v5.0.3 <the workspace's folder, absolute>`. In the gate's container that is
  `/work/<folder>`.
- A failing test appears in a `⎯⎯⎯⎯⎯⎯⎯ Failed Tests N ⎯⎯⎯⎯⎯⎯⎯` section as
  ` FAIL  <file, relative to the workspace> > <suite> > … > <test>`, once each.
- The summary: ` Test Files  1 failed | 1 passed (2)`, `      Tests  3 failed | 2 passed (5)`, and, when vitest caught
  errors outside a test, `     Errors  1 error`.
- A `beforeAll` that throws, or a file that doesn't import, is a `⎯⎯ Failed Suites N ⎯⎯` section
  (` FAIL  test/hook.test.ts > with a hook`, ` FAIL  test/broken.test.ts [ test/broken.test.ts ]`), counted under
  Test Files but not under Tests (`Test Files 2 failed | 1 passed`, `Tests 2 passed | 1 skipped`). An error thrown
  after a test is `⎯⎯ Unhandled Errors ⎯⎯`, with `Errors 1 error`. None of these is a test that can be rerun alone.
- npm runs every workspace even when one fails (`npm error Lifecycle script \`test\` failed …`, then the next
  workspace's `> @s/b@0.1.0 test`), and exits 1.
- **The streams**: RUN, the per-file lines, and the summary go to stdout; the Failed Tests section, with its FAIL
  lines, goes to stderr (run with the two redirected apart). docker forwards a container's stdout and stderr
  separately, so in the gate's merged output a FAIL line's place among the RUN lines isn't certain. The gate
  therefore puts a FAIL line in a workspace by its file (the one failing workspace whose folder holds it), and
  segments only the stdout lines (RUN, the summary) by order.
- **`-t`** matches a test's full name joined with ` > `, without the file: `-t '^dispatcher forms > stays under its
  bound \(ms\)$'` ran that test and skipped the rest (`Tests 1 failed | 3 skipped (4)`); the same name joined with
  spaces matched nothing (`Tests 4 skipped (4)`, exit 0, so a rerun's counts must be checked, never its exit alone).
  A name with ` > ` inside a suite's own name (`nested > with arrow`) still matches, since the FAIL line's text after
  `<file> > ` is the name `-t` reads.
- **npm passes the filter through intact**: `npm test -w services/a -- test/deep/forms.test.ts -t '^(?:…|…)$'` ran
  `vitest run test/deep/forms.test.ts -t ^(?:…)$`, and a name holding `( ) [ ] { } $ ^ * + ? .`, each escaped with a
  backslash, matched exactly (`Tests 2 failed | 2 skipped (4)`).

## R-2: What pytest 9.1.1 prints with `-q`

**Observed** with the Makefile's own `PYTEST_ARGS` (`-q -p no:cacheprovider --import-mode=importlib`):

```text
=========================== short test summary info ============================
FAILED deploy/night-shift/tests/test_probe.py::test_it_removes_its_containers_and_networks
FAILED deploy/night-shift/tests/test_probe.py::test_param[a - b] - AssertionE...
FAILED deploy/night-shift/tests/test_probe.py::test_param[c[d]] - AssertionEr...
ERROR tools/gates/test/test_more.py::test_errors - RuntimeError: setup broke
3 failed, 3 passed, 1 error in 0.02s
```

- The node id is never cut; the message after ` - ` is cut to the terminal's width, or left out. A parametrized id
  may hold ` - ` and brackets, so the gate reads the id's brackets by their nesting and takes the `]` that closes
  them, followed by the line's end or ` - `.
- The summary line has no `=` padding under `-q`. pytest writes everything to stdout, in order.
- A fixture's error is an `ERROR` line and an `error` count, never a `FAILED` line.
- There is no `conftest.py`, `pytest.ini`, `pyproject.toml`, `setup.cfg`, or `tox.ini` in the tree, so a rerun of
  node ids from `/work` reads no configuration the first run didn't.

## R-3: The fast path's set, derived

The intent's rule: start from `docs/merge-requests/`, `docs/infra/applies/` and `docs/incidents/`, and add a path
only when no test, build, eval, or red-team case reads it. What runs in the skipped steps: `make test` (pytest over
`PYTEST_DIRS`, vitest in `services/gateway`, `services/relay`, `apps/web`), `make evals` (`evals/run.py`'s two
suites, `evals/agent-config/static.py`, `evals/behavioral_line.py`, `evals/docs_links.py`), `make redteam-suite`
(`redteam/run.py`), `make matrix` (`redteam/forbidden-actions.sh`), and the image step (the gateway's, the room's,
and the compose images' Dockerfiles).

**Searches** (`git grep` at `42019d3d`, outside `docs/`, `specs/`, `intent/`):

1. `merge-requests|infra/applies|docs/incidents|incidents/` in code, and the split spellings
   (`"merge-requests"`, `"applies"`, `"incidents"`, `"human-patches"`) that path joins use.
2. Walkers: `rglob`, `os.walk`, `glob(`, `iterdir`, `readdirSync`, `globSync`, `ls-files`, near a docs path.
3. Every `COPY`/`ADD` in the Dockerfiles the image step builds, and `.dockerignore`.

**Readers found**, by folder:

| Path | Read by | In a skipped step? |
|---|---|---|
| `docs/merge-requests/*.patch` (P-I1 to P-I7, P-W2, P-I5b, P-6, the 13-11 P-6 public cap) | `infra/test/patches.py`, `infra/test/test_account.py`, `test_bootstrap.py`, `test_handover.py`, `infra/lambdas/test_images.py`, `evals/test_breach.py` | yes, `make test` |
| `docs/merge-requests/human-patches/*` (the 032 patches, `023.md`) | `infra/test/patches.py`; `apps/web/test/content/film-links.test.ts` | yes, `make test` |
| `docs/merge-requests/2026-11-14-night-stack.md` | `apps/web/test/content/film-links.test.ts` (`STACK_NOTE`) | yes, `make test` |
| `docs/merge-requests/README.md` | `evals/test_repository_docs.py` | yes, `make test` |
| `docs/merge-requests/2026-10-26-fix-002-patches-on-003.resolve.py` | `scripts/test_m9_resolve.py` | yes, `make test` |
| every `*.md` under `docs/` | `evals/docs_links.py` (`ROOTS = ("docs", "specs")`, `rglob("*.md")`) | yes, `make evals` |
| notes with plan blocks | `tools/gates/infra_plan_note.py` | no: the gate's host step `infra-plan-note` |
| `docs/infra/applies/*` | `scripts/infra/infra_record.py` writes them (the Author's `make infra-record`); its tests use their own tree | no reader in a skipped step |
| `docs/incidents/*` | `scripts/infra/ec2_ops.py restore --incident` (the Author's `make server-budget-restore`); its tests use their own tree; `films/lifecycle/index.html` cites `docs/incidents/README.md:3` | no reader in a skipped step |

Not readers: `scripts/corpus/film_claims.py` lists `docs/merge-requests` in `UNREAD`, the trees it never reads as a
cited source; `services/gateway/test/integration/incidents.test.ts` reads the gateway's own state folder; the
red team's `exercised()` walks `EXERCISED` (`services/gateway`, `config`, `corpus`, …), no docs; the matrix names
merge-request patches in comments only; no Dockerfile copies the three folders (the web image copies
`docs/data-flow-disclosure.md` alone), and the compose builds' contexts are `deploy/tunnel`, `deploy/snapshot`,
`services/relay`, `evals/standins`, and `evals/Dockerfile.probe`'s four scripts.

**The set, then**:

- A Markdown file directly in one of the three folders: `docs/merge-requests/<name>.md`,
  `docs/infra/applies/<name>.md`, `docs/incidents/<name>.md`. Patches, scripts, and the subfolders
  (`human-patches/`, `proposed/`) are out: tests read them.
- Not `README.md`: `docs/merge-requests/README.md` is read by name, and a README's name can't be told from another's.
- Not a file whose name, without `.md`, any file of the tree outside the prose names. This is the table's by-name
  readers, checked at each gate on the branch's own tree, so a test that later reads a note by name (the project's
  pattern: tests read a human patch's note until it lands) takes it out without a change to the gate. The prose is
  `specs/`, `intent/`, and the Markdown under `docs/`, which no skipped step runs; everything else counts, code and
  data alike, since a test can follow a citation from data (`film-links.test.ts` reads the films' citations).
- And `evals/docs_links.py`, the one reader of every note in a skipped step, still runs: the `links` step, in the
  container, as `make evals` runs it. A branch whose tree lacks it gets no fast path.

**Measured**: the files the name check reads, at `42019d3d`: 2,874 files outside the prose, 376 MB, nearly all of it
films, models, and audio, which hold a NUL byte in their first 8 KiB and are skipped; `grep -c` over all of them took
3 s. `2026-11-14-night-stack` is named by 53 tracked files, `apps/web/test/content/film-links.test.ts` among them,
so that note stays out.

The steps that still run read docs paths too, and need nothing from the set: `infra-plan-note` (the range's notes),
`credits` (`docs/research/images/CREDITS.md`), `disclosure` and the content build (`docs/data-flow-disclosure.md`,
`docs/studio/`), `lint` (Prettier and ruff over Markdown), gitleaks, and the arrival check.

## R-4: Why `make test` changes

Before this spec, `make test`'s recipe ran `npm test --workspaces` then pytest as two lines, so make stopped at the
first: when a workspace failed (two of the intent's three failures), pytest never ran. A retry of the failing vitest
tests alone could then pass a step whose pytest suite never ran. So the recipe runs both parts whatever each exits,
prints `test-part: <part> exited N` after each, and fails if either failed. The gate retries only when it sees both
lines, so it never infers that a part ran. Spec 031's branch rewrites the same recipe for CI's shards (`H4_TEST_SHARD`)
and adds the same `NPM_WS_SH` helper, with the same definition, so its rebase keeps both.
