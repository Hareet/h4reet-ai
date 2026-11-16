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

(next step)
