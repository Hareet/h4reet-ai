# probe-guard-029: the agents_share guard and Golden 08-hareet-ai#q15

`probe-guard2-029` continues `probe-guard-029`. That session stopped at `deeeffb5` ("reproduced (base 5 failed, parent 341 passed); cause next") with this file still a skeleton. `git log -p f411d8e1..HEAD` shows its only content was the title and "(work in progress)". Its second save point is an empty commit, so its runs aren't recorded anywhere. Step 1 was run again here.

Notes only. This branch commits this one file. It changes no code, test, corpus, proposal, or human-only path.

## 1. Reproduce

### Refusal: `git worktree add` under `/tmp`

The brief asks for a `git worktree` under `/tmp` for each commit. The sandbox refused both. The refusal came from the filesystem, not a hook or the bash gate:

```
$ git worktree add --detach /tmp/pg2-base f411d8e1
fatal: could not create directory of '/home/h4reet/h4reet-ai/h4reet-ai/.git/worktrees/pg2-base': Read-only file system
$ git worktree add --detach /tmp/pg2-parent e904389a
fatal: could not create directory of '/home/h4reet/h4reet-ai/h4reet-ai/.git/worktrees/pg2-parent': Read-only file system
```

I didn't retry that command another way. I used a different route: a `git archive` export of each commit into its own `mktemp -d` under `/tmp`. Each export has the commit's tracked bytes, nothing else, and no `node_modules`.

```
$ B=$(mktemp -d /tmp/pg2-base.XXXX); P=$(mktemp -d /tmp/pg2-parent.XXXX)
$ git archive f411d8e1 | tar -x -C "$B"; git archive e904389a | tar -x -C "$P"
/tmp/pg2-base.3SpP /tmp/pg2-parent.M6e3
```

`f411d8e1` has one parent, `e904389a` (`git rev-parse f411d8e1^1` → `e904389a3052ec2d53d182f71563bb67f9288a7d`). `f411d8e1^2` doesn't exist.

### `make setup` in each export

`npm ci --ignore-scripts` finished in both exports. The second step, `git-hooks`, then failed in both, because an export isn't a git repository. That has no effect on the tests: `node_modules/.bin/vitest` is present in both, so `npx --no-install` resolves vitest locally and never reaches the registry.

```
== /tmp/pg2-base.3SpP
npm notice To update run: npm install -g npm@12.2.2
npm notice
fatal: not a git repository (or any parent up to mount point /)
Stopping at filesystem boundary (GIT_DISCOVERY_ACROSS_FILESYSTEM not set).
make[1]: *** [Makefile:205: git-hooks] Error 128
make: *** [Makefile:156: setup] Error 2
exit 2
== /tmp/pg2-parent.M6e3
Run `npm audit` for details.
fatal: not a git repository (or any parent up to mount point /)
Stopping at filesystem boundary (GIT_DISCOVERY_ACROSS_FILESYSTEM not set).
make[1]: *** [Makefile:205: git-hooks] Error 128
make: *** [Makefile:156: setup] Error 2
exit 2
$ ls /tmp/pg2-base.3SpP/node_modules/.bin/vitest /tmp/pg2-parent.M6e3/node_modules/.bin/vitest
/tmp/pg2-base.3SpP/node_modules/.bin/vitest
/tmp/pg2-parent.M6e3/node_modules/.bin/vitest
```

### The three files, alone

From `services/gateway/` in each export:

```
npx --no-install vitest run --maxWorkers=2 test/unit/twin-guards-golden.test.ts test/unit/twin-guards.test.ts test/unit/twin-guards-sentences.test.ts
```

**Parent `e904389a`** (the 028 stack with main merged, before his corpus commit): **exit 0, 341 passed.**

```
 RUN  v5.0.3 /tmp/pg2-parent.M6e3/services/gateway

 Test Files  3 passed (3)
      Tests  341 passed (341)
   Start at  05:18:44
   Duration  4.30s (tests 87%, import 8%, transform 5%)
```

**Base `f411d8e1`** ("corpus: 022, 026 r4, 028 P1, regenerated"): **exit 1, 5 failed, 383 passed (388).** The 47 extra tests come from that commit's regenerated cases. ANSI colour codes are stripped below. Nothing else is changed.

```
 RUN  v5.0.3 /tmp/pg2-base.3SpP/services/gateway

 ❯ test/unit/twin-guards.test.ts (48 tests | 1 failed) 2227ms
   ❯ G10 location, on a place question alone (D31), and G11 surname (D29) (6)
     × never fires on a generated case's answer with its own question, and a place question's approved answer has no place word 1964ms
 ❯ test/unit/twin-guards-golden.test.ts (80 tests | 1 failed) 459ms
   ❯ the guards pass every Golden Q&A answer against its own grounding (FR-049, SC-002) (80)
     × passes 08-hareet-ai#q15 7ms
 ❯ test/unit/twin-guards-sentences.test.ts (260 tests | 3 failed) 4999ms
   ❯ every generated case's approved answer, and reworded variants of each, pass untouched (D37 to D41) (226)
     × passes twin-08-hareet-ai-q15-engineer as written, and its reworded variants 6ms
     × passes twin-08-hareet-ai-q15-non-engineer as written, and its reworded variants 4ms
     × delivers every Golden answer a model copied with its claim tags as the answer alone 624ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/unit/twin-guards-golden.test.ts > the guards pass every Golden Q&A answer against its own grounding (FR-049, SC-002) > passes 08-hareet-ai#q15
AssertionError: 08-hareet-ai#q15 (free_talk): It starts as an intent, then a spec, a plan, and tasks, checked against each other before any code exists. An implementer agent writes it with tests, a reviewer agent that didn't write it checks it, a clean-room gate runs every check, and only a person merges.: expected { kind: 'withheld', …(2) } to deeply equal { kind: 'pass', …(1) }

- Expected
+ Received

  {
-   "kind": "pass",
-   "text": "It starts as an intent, then a spec, a plan, and tasks, checked against each other before any code exists. An implementer agent writes it with tests, a reviewer agent that didn't write it checks it, a clean-room gate runs every check, and only a person merges.",
+   "guard": "agents_share",
+   "kind": "withheld",
+   "text": "AI agents in named roles do most of the typing, and only I merge.",
  }

 ❯ test/unit/twin-guards-golden.test.ts:51:62

 FAIL  test/unit/twin-guards-sentences.test.ts > … > passes twin-08-hareet-ai-q15-engineer as written, and its reworded variants
 FAIL  test/unit/twin-guards-sentences.test.ts > … > passes twin-08-hareet-ai-q15-non-engineer as written, and its reworded variants
AssertionError: expected { kind: 'withheld', …(2) } to deeply equal { kind: 'pass', …(1) }
  (same Expected / Received as above)
 ❯ test/unit/twin-guards-sentences.test.ts:679:41

 FAIL  test/unit/twin-guards-sentences.test.ts > … > delivers every Golden answer a model copied with its claim tags as the answer alone
AssertionError: twin-08-hareet-ai-q15-engineer: expected { kind: 'withheld', …(2) } to deeply equal { kind: 'pass', …(2) }
-   "kind": "pass",
-   "redacted": [
-     "claim_tags",
-   ],
-   "text": "It starts as an intent, … and only a person merges.",
+   "guard": "agents_share",
+   "kind": "withheld",
+   "text": "AI agents in named roles do most of the typing, and only I merge.",
 ❯ test/unit/twin-guards-sentences.test.ts:696:71

 FAIL  test/unit/twin-guards.test.ts > G10 location, on a place question alone (D31), and G11 surname (D29) > never fires on a generated case's answer with its own question, and a place question's approved answer has no place word
AssertionError: twin-08-hareet-ai-q15-engineer.yaml: expected { kind: 'withheld', …(2) } to match object { kind: 'pass' }
-   "kind": "pass",
+   "kind": "withheld",
 ❯ test/unit/twin-guards.test.ts:541:46

 Test Files  3 failed (3)
      Tests  5 failed | 383 passed (388)
   Start at  05:18:38
   Duration  5.56s (tests 90%, import 6%, transform 4%)
```

(The `…` lines shorten repeated test-path prefixes and a repeated answer. The answer's full text appears in full in the first failure above.)

**Result: the files pass at the parent and fail at the base, so his corpus commit `f411d8e1` is the cause.** No bisect was needed: `f411d8e1` is the only commit between the two.

## 2. The cause

### 2.1 What Golden `08-hareet-ai#q15` says at each commit

**Parent `e904389a`:** there is no q15. `08-hareet-ai.md`'s Golden Q&A has 8 items (lines 28 to 37), and the pack has no copy of the words:

```
$ git show e904389a:corpus/08-hareet-ai.md | awk '/^## Golden Q&A/{g=1} g && /^[0-9]+\./{n++} END{print "parent golden items:", n}'
parent golden items: 8
$ git show e904389a:config/twin/corpus.json | grep -c "An implementer agent writes it"
0
```

**Base `f411d8e1`:** `corpus/08-hareet-ai.md:140`, word for word:

> 15. *How is a change made?* — It starts as an intent, then a spec, a plan, and tasks, checked against each other before any code exists. An implementer agent writes it with tests, a reviewer agent that didn't write it checks it, a clean-room gate runs every check, and only a person merges. [P]

The tests read it from the pack, `config/twin/corpus.json`: the answer is at `:2229` and the section line at `:2239`. The golden test builds its turn from that pack (`services/gateway/test/unit/twin-guards-golden.test.ts:37-51`). The two generated cases, `evals/product/cases/twin-08-hareet-ai-q15-engineer.yaml` and `-non-engineer.yaml`, carry the same text as their `fake_response`. The other two test files read those cases.

**Where the words come from.** `git log -S "An implementer agent writes it with tests"` finds them first in `03da34c0` ("wip(impl-022): T004, T005 the table and the new text for 08"). From there they went into `corpus/proposals/film-scripts-2026-11-14.md:143` and `docs/merge-requests/2026-11-14-corpus-film-scripts.patch`. So q15 is spec 022's proposal, which he applied as "022" in `f411d8e1`. It isn't from 026 r4 or 028 P1. Its tag is `[P]`. `corpus/README.md:31` defines that tag: "`[P]` Public artifact, with URL. Enough for facts about systems and organizations; never enough on its own for a claim about the Author's role." Spec 022's artifacts check the amount and currency guards against the new text (`specs/022-corpus-from-film-scripts/plan.md:55-56`, `analysis.md:21`), but never G8. `grep -rn "G8\|agents_share\|agents' share" specs/022-corpus-from-film-scripts/` finds no G8 check.

The fixed line it gets instead is Golden Q&A 4, `corpus/08-hareet-ai.md:129`, word for word:

> 4. *Who writes the code?* — AI agents in named roles do most of the typing, and only I merge. [A]

Its `[A 2026-10-29]` source is at `corpus/08-hareet-ai.md:9`. In his words: "… AI agents in named roles do most of the typing, and only I merge." The pack's `quotes.agents_share` is identical at both commits (`config/twin/corpus.json:16-19`):

```
{
 "answer": "AI agents in named roles do most of the typing, and only I merge.",
 "file": "corpus/08-hareet-ai.md",
 "spans": [
  "AI agents in named roles do most of the typing, and only I merge"
 ]
}
```

### 2.2 The `agents_share` guard's rule

**Spec:** spec 007, `specs/007-twin-conversation/spec.md:199`, FR-014, word for word:

> WHEN the twin states the Author's role (an ownership claim about a system or an organization), the agents' share of the work, or a privacy promise, IT SHALL keep the corpus's words (CLAUDE.md, "Paraphrasing a source"): a system's ownership verb SHALL be one `01-ai-strategy-and-cht.md`'s rulings give it, and the agents' share and the privacy promise SHALL carry a verbatim span of the corpus line each rests on. Guard G7 SHALL withhold an answer that pairs a ruled system with an ownership verb its ruling doesn't give. Guard G8 SHALL replace an answer that speaks about what happens to a visitor's words without a verbatim span of `08-hareet-ai.md`'s promise with that file's Golden Q&A 5, and one that speaks about the agents' share without the corpus's span with its Golden Q&A 4, each verbatim.

FR-021 (`spec.md:212`) puts G8 among the guards that replace the answer whole ("for G8 with the corpus's own answer that FR-014 names"). The plan's guard table, `specs/007-twin-conversation/plan.md:245`, says: "a sentence speaks about agents writing, building, or merging without the span "AI agents in named roles do most of the typing, and only I merge": the answer becomes `08`'s Golden Q&A 4, verbatim (whole, as FR-014 says; D41 removed only the sentence until the review of bc25bee2)". D41 (`plan.md:510`) records why a reworded agents' share is replaced whole: "a sentence's removal left "Hareet wrote most of the code himself", which the corpus contradicts".

Two rules hold every Golden answer to the guards: FR-049 (`spec.md:262`, "every Golden Q&A answer SHALL pass the twin's guards against its own grounding") and SC-002 (`spec.md:290`, "passes 100% of the Golden Q&A answers against their own grounding").

**Code:** `services/gateway/src/twin/guards.ts`:

- `:875`: `const AGENTS = /\b(?:ai agents?|agents?|claude(?: code)?|llms?)\b/i;`
- `:876`: `const SHARE = /\b(?:typ(?:e|es|ed|ing)|writ(?:e|es|ing)|wrote|written|merg(?:e|es|ed|ing)|commit(?:s|ted|ting)?)\b/i;`
- `:878-881`: `holdsSpan` checks whether the answer, collapsed and lower-cased, contains a span.
- `:888-891`: `agentsReplaces`. If the answer holds a span, it passes. Otherwise it fails if **any sentence** matches both `AGENTS` and `SHARE`.
- `:1041`: in `failing`, after every other check and after privacy, the whole answer is read: `if (agentsReplaces(seen.plain, views.plain)) return "agents_share";`.
- `:1028`: the outcome is `{ kind: "withheld", guard, text: ctx.quotes.agents_share.answer }`.

**The pack:** `apps/web/build/twin-pack.ts:78` sets the span: `export const AGENTS_SHARE_SPANS = ["AI agents in named roles do most of the typing, and only I merge"] as const;`. `:538-550` builds the fixed line as the shortest Golden answer in `08` that holds that span, which is Q&A 4.

A side note on the plan and the code: plan §5's table says "writing, building, or merging", but `SHARE` has no "build" form. It does have "type" and "commit". That gap isn't the cause here.

### 2.3 Why the new words trip it

q15's second sentence is: "An implementer agent writes it with tests, a reviewer agent that didn't write it checks it, a clean-room gate runs every check, and only a person merges."

- `AGENTS` matches "agent" (twice).
- `SHARE` matches "writes", "write", and "merges".
- The answer doesn't hold the span "AI agents in named roles do most of the typing, and only I merge" anywhere, so `holdsSpan` (`:889`) returns false.

So `agentsReplaces` is true, and the whole answer becomes Q&A 4's line. The guard is doing what FR-014 tells it to: the sentence states the agents' share of the work ("An implementer agent writes it", "only a person merges") in words other than his recorded ones, and its tag is `[P]`, which `corpus/README.md:31` calls "never enough on its own for a claim about the Author's role". "Only a person merges" is a claim about the Author's role, and his own `[A]` words for it are "only I merge".

### 2.4 Other `08` lines with the same pattern (no test fails on them)

The same rule, run as a check over `corpus/08-hareet-ai.md` at the base, finds five more lines from the 022 text. Each is a `[P]` section line with an agent word and a write/merge word, and none holds the span. The script copies `AGENTS` and `SHARE` from `guards.ts:875-876` and splits sentences more simply than `sentencesOf` does:

```
27: - `[P]` The agents that write the code are fenced in too: the one that writes never reviews, and none can touch the budgets or the switch, push, merge, or apply.
91: - `[P]` An implementer agent writes it on a feature branch, task by task, with tests, and every new feature brings its own telemetry, a dashboard panel, a cost estimate, its degraded behavior, and a disclosure row if a b…
92: - `[P]` A reviewer agent, read-only and never the one that wrote the change, checks it for bugs, security, compliance, and cost.
96: - `[P]` Before Hareet merges, a clean-room gate runs every check on an export of the branch, with the network cut off, so nothing an agent left behind can run.
97: - `[P]` The agents work in a sandbox, on their own container engine, behind hooks that refuse pushing, merging, applying infrastructure, editing budgets, or reading secrets.
140: An implementer agent writes it with tests, a reviewer agent that didn't write it checks it, a clean-room gate runs every check, and only a person merges.
```

These are grounding, not Golden answers, so no test reads them. In free talk, though, a model that repeats one of them gets Q&A 4's line instead. Free talk is closed for now: `config/twin-readiness.yaml:51` has `free_talk: { ready: false }`. So no visitor sees either `08`'s new text or this replacement yet. Spec 022's plan says the same (`specs/022-corpus-from-film-scripts/plan.md:94`).

### 2.5 Whether `make evals` and `make redteam` see it

Neither does. I ran both on the base export (`/tmp/pg2-base.3SpP`, after the `make setup` in §1):

```
$ make evals            → exit 0
PASS  twin-08-hareet-ai-q15-engineer
PASS  twin-08-hareet-ai-q15-non-engineer
evals product (fake): 225 passed, 0 failed
evals narration (fake): 44 passed, 0 failed
agent-config static: 0 failed, 0 planned
WARN (behavioral tier): no run for trigger hash e061ea4d7978 in evals/agent-config/history/; …
docs links: 0 failed, 2528 relative links in 483 files
```

`make evals` passes because the fake adapter answers with the case's `fake_response` and never runs the gateway's guards (`evals/run.py:308-311`; each generated case's header says "On the fake adapter it passes by construction; the Author's live runs score real answers"). A **live** product run through the admin twin route does go through the guards. That run is the Author's (`ADAPTER=local|bedrock|anthropic`). On such a run, a model that gives q15's words gets Q&A 4's line instead. The case's `contains: ["clean-room"]` would then fail, and the result would name the guard ("withheld by agents_share", `evals/run.py:652-656`).

```
$ make redteam          → exit 2
redteam: 71 passed, 0 failed
…
forbidden-actions (hook layer): 992 passed, 36 failed, 68 known gaps
make: *** [Makefile:356: matrix] Error 1
```

The red-team suite (`redteam/run.py`) passes. Its detectors are Python, and none of its cases uses q15. The `matrix` exit has nothing to do with this probe. Every FAIL row is a `stage-S` sandbox row, which can't hold in a `git archive` export under a writable `/tmp`: 31 `stage-S-unwritable` (for example "evals/agent-config has no mask: open writable /tmp"), 4 `stage-S-unreadable` (the studio folders aren't mounted), and 1 `stage-S-refused` (an AF_UNIX socket). The matrix needs a real worktree in the sandbox. Probe-words-029's notes don't record a matrix run in the worktree either.
