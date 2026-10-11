# Threat model and the review stopping rule

**Status: draft for the Author** (2026-10-11), written after the Author chose to right-size hardening: "Right-size now". It scopes how deep reviews go. It changes no principle: the constitution's Principle IV and its Security & Agent Governance section still hold. The Author edits this page, and REVIEW.md can point at it.

## What we defend against

1. **An agent's mistake:** a push, a merge, or `main` moved; `terraform apply` or `destroy`; an edit to a governance file (`.claude/**`, `CLAUDE.md`, `REVIEW.md`, the constitution, CI workflows, budget, alert, or kill-switch configuration); a test edited during a fix task; an MCP server added.
2. **A secret leaving:** a credential in the repository, in agent context, or in a trace; an agent reading the env files, the operator tokens, or the AWS session.
3. **Runaway spend:** a model call outside the gateway, a paid route past its budget, or a kill switch reset by anyone but the Author.
4. **Injected instructions:** instruction-shaped text in a subagent's report, a web page, a retrieved document, and, once there are visitors, their input.
5. **The supply chain's basics:** secret scanning, pinned images, and lockfiles.

The enforcement points for these are the sandbox (reads, writes, network), the hooks, the git hooks, the kill switch and meters, and the Author's own review of what runs in their terminal ([ADR 0017](../adr/0017-clean-room-gate-and-human-only-gate-paths.md)'s list, first in every merge-request note).

## What we don't defend against yet

These are recorded as known gaps, in the matrix's gap rows or a note's backlog, and not fixed in a new round:
- **A deliberately adversarial agent** building artifacts to get code into the Author's terminal through tooling the Author runs. Examples: git metadata planted in a scratch clone, NTFS spellings of `.git`, terminal escape bytes in a tool's output, a symbolic link that feeds a reader something else.
- **Linked worktrees' copies** of governance files: the hooks and the sandbox protect the main working tree.
- **A compromised host, Claude Code itself, or a dependency** that is malicious rather than vulnerable.

## The stopping rule

- **One review pass per branch**, against REVIEW.md and this page.
- **A blocker** is a realistic path to a harm in the first list under normal use: an agent's mistake, or an agent following injected text. It's fixed before the merge.
- **Everything else** goes to the note's backlog, in the reviewer's words, for the Author to schedule or drop: a should-fix item, a nit, or a vector from the second list.
- **A fix gets a narrow check of that fix**, not a fresh adversarial review.
- **A doc that misstates the code** is fixed when it's found, because that's cheap and isn't hardening.

## When to revisit

- **Before publication,** when outside contributors and public pull requests arrive: reread the second list, and let CI and branch protection take over what they can.
- **After an incident:** its intent decides what moves from the second list to the first.
