# Security policy

h4reet.ai is developed locally until the Author publishes it ([ADR 0013](docs/adr/0013-local-until-publication.md)). Until then there is no public repository and no reporting channel; this policy takes effect at publication.

## Reporting a vulnerability

Report it privately through GitHub's private vulnerability reporting: the repository's **Security** tab, then **Report a vulnerability**. That opens a draft security advisory that only you and the Author can see. Please don't open a public issue, discussion, or pull request about a vulnerability.

Include what you found, how to reproduce it, the impact you expect, and the commit or URL you tested. This is a one-person project, so responses are best-effort, and there is no bug bounty.

## In scope

- **The twin's guardrails** (constitution, Principle VIII): making it present itself as the Author rather than as an AI representation, impersonate anyone, disparage anyone, leak anything outside its corpus, or say something about the Author that the corpus doesn't support.
- **Cost controls** (Principle V): any way to spend money outside the budget model, such as getting around the real-time meter, the per-client request cap, the Bedrock fallback sub-budget, or the kill switch.
- **Data flows** (Principle I): any byte that leaves a visitor's device without an entry in the public data-flow disclosure.
- **The agent enforcement layer** (Principle IV): any way for an agent session to do what `.claude/settings.json`, the hooks, or the sandbox forbid, such as changing or pushing to `main`, applying infrastructure, reading credentials, or editing the governance files. [`redteam/forbidden-actions.sh`](redteam/forbidden-actions.sh) lists the gaps already known as `KNOWN GAP` rows; a working route past the remaining layers is still worth reporting.
- **Secrets and supply chain**: a secret anywhere in the repository or its history, or a dependency, container image, or CI action that can be subverted.

Out of scope: denial of service by volume, social engineering, and vulnerabilities in third-party services (report those to the service).

## What happens next

When a report shows a budget breach, a blocked-action anomaly, or a guardrail bypass in production, an incident note goes into [`docs/incidents/`](docs/incidents/) within seven days, together with an eval that would have caught it (constitution, Security & Agent Governance). Incidents and evaluation regressions stay visible in the history (Principle VI).

## Testing safely

Where you can, test against your own copy of the stack rather than the live site: once spec 000 lands, `make up` runs the whole production topology on one machine, and a CPU-only configuration needs no GPU. On the live site, stay within normal use. When the budget runs out, the kill switch degrades the site for every visitor, by design.
