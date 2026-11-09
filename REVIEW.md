# Review instructions

Applied by the `reviewer` agent on every PR (headless in CI via the Claude Code GitHub Action, and on request with `@claude review`). The reviewer never wrote the change and has no write access. Findings inform the human approval required by branch protection; they never replace it. Until publication (ADR 0013) there are no PRs: the reviewer runs on every feature branch before the Author merges, reviewing `git diff main...<branch>`, and its findings go in the branch's merge-request note. `.specify/memory/constitution.md` supersedes this file.

## Passes

Run four passes, a fifth when the diff adds or changes a file under `assets/` or `docs/research/images/`, and a sixth when it touches the room's data, and tag each finding with its pass:

- **Bugs**: logic errors, broken edge cases, subtle regressions, unhandled failure of the local tier or a provider.
- **Security**: injection paths (visitor input, retrieved documents, subagent output), authentication gaps, secrets or payloads in logs or traces, new network egress, changes to `.claude/**`, IAM, budgets, edge caps, or the kill switch.
- **Compliance**: the change matches `specs/NNN-*/spec.md` and `plan.md`, cites the acceptance criteria it satisfies, and honors the constitution principles it touches. A diff without a linked spec is a blocking finding.
- **Cost & telemetry**: every new model call goes through the gateway with provider, model, tokens, and cost attributes; the spec's cost estimate is stated; degraded-mode behavior exists; a dashboard panel or alert changed if runtime behavior changed; the data-flow disclosure is updated if any byte newly leaves the visitor's device or the local tier.
- **Arriving assets** (spec 003, FR-017 and FR-037): the arrival check has passed every machine rule; this pass reads what it can't. Open each added or changed file beside its `records.json` entry:
  - the record matches the file: its kind, its source's type, and every step, model, and hand tool. An auxiliary model the file shows signs of, such as a face model or an upscaler, missing from its step is Important;
  - the file follows ADR 0010's art direction and intent 000's rule, "Inspired-by only — no Rockstar assets, logos, typefaces, or character likenesses; everything is original", and a visitor avatar resembles no real person;
  - no third-party content remains: no logo, trademark, readable text, screen content, or someone else's art. For a room file, the window's view is the studio's recreation, and a screen is a plain live face of one colour, on which the room draws (Amendment C4); a room confirmation reads `not_applicable` only where it doesn't apply to the file, as a window view doesn't to a desk, and `likeness` is true only when the file shows the Author (Amendment C5);
  - for each file the check's rule P names (a likeness, a photo source, a room file, or any file under `assets/twin/`), the Author's approval of its hash is already on `main`, in `assets/policy/approvals.json`. A branch never carries its own approval.

  Anything in a file that could locate the Author, such as a reflection, a sign, an address, or a view that identifies the place, is Important, whatever the approval says.
- **Room data** (spec 004, FR-014 and FR-035): read every changed file of the room's data and of the studio's documents as a visitor and the studio would. That is the catalog under `apps/web/room/catalog/`, studio notes and work-order fields included; the scene, topics, UI words, looks, and fixtures under `apps/web/room/`; the room text and outlines under `apps/web/content/room/`; and `docs/studio/`, meaning the work orders, the photo guide, and the handoff. Each:
  - locates nothing: no address, street, neighbourhood, landmark, view that identifies the place, or anything else that could place the Author;
  - names no third party's marks: no brand, logo, trademark, or someone else's art. Product names appear only as plain text, where spec 004 allows them: "Claude Code" and "Claude" on the monitor (FR-031), and the neon sign's "Langfuse" with its second line (FR-046, FR-049);
  - reads true under spec 002's C9, C6, and C8: no forbidden phrase, no bare figure about the Author outside a slot, and no act the corpus doesn't give the Author;
  - claims nothing about the Author's role or the agents' share of the work beyond the corpus and the Author's recorded words (FR-035);
  - for an outline, names a tool whose license is on main's `assets/policy/licenses.json`, reading `yes` on spec 003's three terms (FR-032);
  - for a work order, a studio note, or the handoff, which the studio's session acts on, asks it for nothing spec 004's FR-024 and the studio session's disclosure row exclude: no photo, or crop, mask, or cutout of one; no file outside the studio's folders; no fetch; and no upload (FR-014).

  Anything that could locate the Author, or that asks the studio's session for what FR-024 excludes, is Important, whatever an approval says.

## What Important means here

Reserve **Important** for findings that would break behavior, leak data, spend money outside the budget model, weaken an enforcement point, or breach a constitution principle. Style and naming are **Nits**.

## Cap the nits

Report at most five nits per review; summarize the rest as a count.

## Feed back

When a finding is the second occurrence of the same mistake, propose the one-line addition to `CLAUDE.md` under "Things Claude gets wrong" in the review. Flag when a change has made `CLAUDE.md` or `docs/how-we-build/` stale.

## Do not report

Generated files, except the work orders and the photo guide under `docs/studio/`, which the Room data pass reads (spec 004, FR-014); lockfiles; anything CI already enforces (formatting, lint, secret scanning, dependency vulnerabilities).
