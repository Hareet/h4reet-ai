# Contributing

h4reet.ai is built by one person, the Author, working with role-scoped AI agents, and the way it is built is part of what it shows. Every change follows the same chain of committed artifacts, so the history explains itself.

## From outside: we accept intents, not pull requests

If you have an idea, have found a bug, or think the twin has something about the Author wrong, write it up as an intent: the problem, the outcome you want, who and what it affects, constraints, cost and data-flow impact, and open questions. The template is in [`intent/README.md`](intent/README.md). Once the repository is published, open an issue with the intent as its body. The Author commits it to `intent/`, then accepts it into a spec or closes it with a reason.

We don't merge pull requests from outside, because a change here is more than a diff: it needs an accepted intent, a spec, a plan, tests, a review by an agent that didn't write it, and the Author's merge. The corpus about the Author is written by the Author, so corrections to it arrive as intents too. Security issues go through [`SECURITY.md`](SECURITY.md), never a public issue.

## The lifecycle in ten lines

1. **Capture**: an intent in `intent/NNN-name.md`, in the originator's words; the Author accepts or closes it.
2. **Specify**: `/speckit-specify` turns an accepted intent into `specs/NNN-name/spec.md` with testable acceptance criteria; the intent moves into that folder.
3. **Clarify**: `/speckit-clarify` asks the spec's open questions and records the answers in it.
4. **Plan**: `/speckit-plan`, in plan mode, names the files, order, risks, proof, cost impact, and degraded mode; `plan.md` is approved before code exists.
5. **Tasks**: `/speckit-tasks` turns the plan into ordered tasks, and `/speckit-analyze` checks that spec, plan, and tasks agree.
6. **Implement**: the `implementer` agent works on a feature branch, tests with or before code, and updates `plan.md` in the same commit when the diff departs from it.
7. **Converge**: `/speckit-converge` compares the code with the spec and appends any unbuilt work to `tasks.md`.
8. **Verify**: the session runs the gates and pastes their output: `make check` today; `make lint`, `make test`, and `make evals` once spec 000 adds them.
9. **Review**: the `reviewer` agent, which didn't write the change, runs the four passes in [`REVIEW.md`](REVIEW.md).
10. **Merge and record**: only the Author merges to `main`; decisions become ADRs, incidents get a note within seven days, and what was learned becomes the next intent.

The full version, with every gate and enforcement layer, is [`docs/how-we-build/lifecycle.md`](docs/how-we-build/lifecycle.md). The [constitution](.specify/memory/constitution.md) governs all of it, and the agents' working rules are in [`CLAUDE.md`](CLAUDE.md).

## Until publication: local feature branches

There is no remote yet ([ADR 0013](docs/adr/0013-local-until-publication.md)), so the pull request has a local stand-in:

1. An agent creates a feature branch, commits there, and never merges or pushes.
2. The branch's last commit adds a note to [`docs/merge-requests/`](docs/merge-requests/README.md): what changed, the spec it satisfies, the constitution check, the review findings and what was done about them, and the verification output.
3. The Author runs `make check`, reviews the note and the diff, and merges in their own terminal with `git merge --no-ff <branch>`. The hooks and a git hook keep `main` the Author's.

After publication, agents push feature branches and open pull requests, which replace the notes, and CI runs the same gates.
