# Review instructions

Applied by the `reviewer` agent on every PR (headless in CI via the Claude Code GitHub Action, and on request with `@claude review`). The reviewer never wrote the change and has no write access. Findings inform the human approval required by branch protection; they never replace it. Until publication (ADR 0013) there are no PRs: the reviewer runs on every feature branch before the Author merges, reviewing `git diff main...<branch>`, and its findings go in the branch's merge-request note. `.specify/memory/constitution.md` supersedes this file.

## Passes

Run four passes and tag each finding with its pass:

- **Bugs**: logic errors, broken edge cases, subtle regressions, unhandled failure of the local tier or a provider.
- **Security**: injection paths (visitor input, retrieved documents, subagent output), authentication gaps, secrets or payloads in logs or traces, new network egress, changes to `.claude/**`, IAM, budgets, edge caps, or the kill switch.
- **Compliance**: the change matches `specs/NNN-*/spec.md` and `plan.md`, cites the acceptance criteria it satisfies, and honors the constitution principles it touches. A diff without a linked spec is a blocking finding.
- **Cost & telemetry**: every new model call goes through the gateway with provider, model, tokens, and cost attributes; the spec's cost estimate is stated; degraded-mode behavior exists; a dashboard panel or alert changed if runtime behavior changed; the data-flow disclosure is updated if any byte newly leaves the visitor's device or the local tier.

## What Important means here

Reserve **Important** for findings that would break behavior, leak data, spend money outside the budget model, weaken an enforcement point, or breach a constitution principle. Style and naming are **Nits**.

## Cap the nits

Report at most five nits per review; summarize the rest as a count.

## Feed back

When a finding is the second occurrence of the same mistake, propose the one-line addition to `CLAUDE.md` under "Things Claude gets wrong" in the review. Flag when a change has made `CLAUDE.md` or `docs/how-we-build/` stale.

## Do not report

Generated files, lockfiles, anything CI already enforces (formatting, lint, secret scanning, dependency vulnerabilities).
