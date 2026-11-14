# Notes: spec-026 (2026-11-14)

The spec-writer's task for item f, on `night/spec-026/spec-026`, from `refs/heads/main` (3c0e4cd0). No code. Files: `intent/026-twin-pets-dog.md` (draft), `specs/026-twin-pets-dog/` (spec, plan, tasks, analysis, these notes), `docs/merge-requests/human-patches/026.md`. Stopped after the analysis, as the task asks.

## What was done

- **Intent**: his item quoted with his words being the letter and title only; the orders file's two sentences attributed to it, not to him; "do gand" read as "dog and", marked as a reading.
- **Spec**: Q1 to Q8 taken as recommended (the petting starts from the dog-intro; a code reach stands in until a studio `petting` clip passes his look; the dog walks to a pet spot by spec 025's movement; a "Dog" piece on the desk sign, plus the dog figure in 3D; the room dog's name an open slot; a three-part corpus proposal; one patch so the topic closes once; the visitor's dog never petted). Assumed interfaces A016, A019, A020, A025 named.
- **Found while reading**: (1) the corpus already holds his dog, Arya, in his words, with her age slot filled, so the open slot is which dog the room's dog is, not the dog's name; (2) any change to hobbies-and-travel, its corpus or a new piece on it, changes its pack hash and closes the topic until his evaluation (`config/twin-readiness.yaml`; `services/gateway/src/twin/pack.ts`), so all of it is one patch; (3) the twin stands near the shell's right wall (spec 016's T082, RA8), so the pet spot is chosen on the walkable floor and the reach uses the arm on the dog's side; (4) a placeholder Golden answer would be turned into evaluation cases by `twin:pack`, so Golden Q&A 9 enters the patch only with his answer from the page.
- **Plan**: R-01 to R-14; files expected to touch in §5, for the implementer, who merges this branch first after spec 025's code.
- **Tasks**: T001 to T023, each naming its small tests; T021 runs the one `make check` only if the supervisor names it.
- **Analysis**: A1 to A12; coverage complete; A4 found and fixed in this pass.
- **Questions**: nine on `/night/io/out/questions.md` (Q1 to Q8, and his Golden Q&A 9 answer), each with a recommended answer.

## Small runs (rule 4)

Tests that read files this task changes (`evals/docs_links.py` checks every link in `specs/**`; `evals/test_repository_docs.py` reads `intent/`):

```
$ python3 -m pytest -q evals/test_docs_links.py evals/test_repository_docs.py
.............................................................            [100%]
61 passed in 1.37s
```

```
$ make lint
node_modules is missing: run make setup
make: *** [Makefile:227: lint] Error 1
```

The lint can't run in this container (no `node_modules`); this task changed no code, only Markdown.

## Interruptions

None: no hook or bash-gate refusal was hit.

## For the supervisor

- Spec 025's Q2 says "the dinosaur eating pieces of the room is item i, spec 026's"; this spec, 026, is item f. A text fix for spec 025's next rework; nothing here depends on it.
- Spec 025's director, as planned, has no `goTo` and exposes no head point; this spec's A025 assumes both and its R-06 adds `visiting` to `chase.ts` if 025 hasn't. A rework of 025 could add them instead.

## What's left

Everything after the analysis: implementation T001 to T020 on the line after spec 025 (this branch merged first), the review T022, and the Author's T023 (the nine answers, his look, the studio round's intake and approval, the corpus patch once spec 020's approval is on main, his evaluation and readiness marks, the merge).
