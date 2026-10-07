# Intent inbox

Every change starts here, in the originator's own words. An `intent.md` is a proto-spec: what is wanted, why, and under which constraints. It is not a design and not a task list.

**Lifecycle**

1. Copy the template below to `intent/NNN-short-name.md` (next free number) with `Status: draft`. Brainstorm it with Claude using the `intent-capture` skill; correct anything Claude misunderstood before committing.
2. The Author reviews. **Accept** → run `/speckit-specify` against it, which creates `specs/NNN-short-name/`; `git mv` the intent into that folder as `intent.md` so the intent/spec pair travels together. **Close** → set `Status: closed` with a one-line reason and leave it here. Survival rate is a metric we publish.
3. Intents can also be written by the loop itself: a breached control band or an incident produces an intent in this format for triage.

**Template**

```markdown
# Intent: <short title>
Author: <name or role>. Status: draft | accepted | closed (<reason>). Created: YYYY-MM-DD.

## Problem
What cannot be done today, who is affected, and how you know.

## Proposed outcome
What "better" looks like, in the user's terms. No implementation.

## Affected users and systems
Visitors, the Author, agents, CI, cloud, local tier, corpus, dashboards…

## Constraints
Budget, privacy, time, constitution principles this must honor.

## Expected cost impact
Cloud spend and dev-time model spend, order-of-magnitude. "None" is an acceptable answer if true.

## Data-flow impact
Does any new byte leave the visitor's device or the local tier? If yes, what and why.

## Open questions
Things the spec must answer or carry forward.
```
