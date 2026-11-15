# Notes: spec-028 (night of 2026-11-15, spec-writer, Opus 5.5)

Task `spec-028`, on `night/spec-028/spec-028` from `refs/heads/main` (`a36f98ec`). I wrote only `intent/028-room-after-review.md` (`Status: draft`) and `specs/028-room-after-review/` (spec, plan, tasks, analysis, these notes), and `/night/io/out/questions.md`. No code, no human-only path, no corpus file.

## What I did

1. **The intent**, from `intent/README.md`'s template: his review, his two answers, and his night order quoted word for word from the brief; the orders' description of his screenshot marked as theirs; my reading marked as mine.
2. **Read**: specs 004, 016, 018, 020, 021, 024, 025, 026 (their clarifications and the requirements this changes; 004 and 016 by the clauses on "Around the room", the twin's line, and the credits), spec 023 (the PDF), night 2's page on `night/supervisor/2026-11-14` (Q288 to Q296, Q292 and Q294 in full), `assets/policy/approvals.json` (the twin's, the dog's, and the greeting's entries), `corpus/04-hobbies-and-travel.md` and its facts file (read only). The code on `main`, one line: two read-only Explore agents mapped the layout (group A) and the behaviour (group B); I checked the parts the plan leans on myself (`compose/hud.ts`'s `splitBoxes`, `compose/frame.ts`, `compose/framing.ts`, `compose/stages.ts`, `scene.yaml`'s placements and `figures`, `ui-words.yaml`, `build/content.ts`'s `readFacts` and `fillSlots`, `build/twin-pack.ts`'s hash comment, `test/room/vocabulary.test.ts`'s pinned list, ADR 0055).
3. **The spec**, clarified with 19 questions, each the recommended answer taken under his rule 1, provisional.
4. **The probes**, read when they ended (I didn't wait for them): `probe-pdf-028` (04f1a8a8) and `probe-eat-028` (54e5f665). Both changed the spec:
   - `probe-eat-028` showed that the eating's model gate is **his own answer** to night 1's page Q247 ("Yes, one condition for all three: … only when the bundle carries the dinosaur's model …", recorded whole in `docs/merge-requests/2026-11-14-night-stack.md`, "I-1 (page Q247, the Author's answer of 2026-11-13)"). My first Q11 let the stand-in eat, which would have overturned his answer with a recommended one. I rewrote Q11 to keep his condition and gate the dinosaur's scene on it too: a cut-out dinosaur visit is as a woman's or man's until his intake of the model (human patch 021, P9). FR-018, FR-019, FR-025, FR-029, SC-005, plan §R-B1, §R-B6, T-B02, T-B06 follow (analysis F6).
   - `probe-pdf-028` found the candidate's four annotations each on one of the four small-caps claims under "hareet.ai", and `main` serving the old PDF without them. Q19, FR-031, T-B09: no code; his publishing step (human patch 023, P8) (analysis F7).
5. **The plan**, with "Approved provisionally by the Author's order of 2026-11-15" and his words at its top: group A's wall box and placement, group B's scene director, data, bubble, introduction slot; the shared files and who edits first (§6); the tests of earlier specs that the answers make false, named as departures (§R-B8).
6. **The tasks**, the same line and words at the top: group A (T-A01 to T-A09) for `impl-028a`, group B (T-B01 to T-B10) for `impl-028b`, both from this tip at once; T-DOC (docs role, ADR 0055's two cases); T-INT last, the one `make check`. Each task names its test files; T-B06 and T-B09 start by merging their probe's branch.
7. **The analysis**: coverage table and twelve findings; F1 to F5 fixed in the artifacts before it, F6 and F7 from the probes, F8 to F12 named.

## Group B's dog-visitor line against night 2's Q292 and Q294

His item 4b has the twin say to a dog visitor "i'll show her all the work i've been doing", which reads as the visitor being Arya. His approval of the dog's model (`A-20261114-dog`) says it is "a dog of the breed and not a likeness of the Author's dog", and Q292 (the likeness slot dropped) and Q294 ("That the dog in the room is a real dog: it is an AI-made likeness, not a photo or a recording.") were taken on that line. That's a conflict to put to him: spec Q16, recommended: keep the approval and Q292/Q294, reading the dog visitor as playing Arya; the line itself is his words in a null slot (Q15), never written by a worker.

## The questions (all in `/night/io/out/questions.md`, each with its recommendation)

Q1 the thumbnail is the portrait · Q2 the panel always open at the wall's length · Q3 the wall box is the shell's opening · Q4 the columns beside the walls, sizes, scale, fallbacks · Q5 the Enter cap's slot · Q6 the lines on the Credits page and kept in "Around the room" · Q7 "the phone layout" is the stacked layout · Q8 "selects the dog" is the avatar · Q9 the room's dog only in a dinosaur visit · Q10 the scene's start, replacing the run, eating after · Q11 his Q247 condition kept (matches `probe-eat-028`'s question) · Q12 the bubble and the wave · Q13 the path out of the open front · Q14 the conversation unchanged · Q15 the introduction from a null corpus slot · Q16 the Q292/Q294 conflict · Q17 the petting dormant · Q18 nothing more for a dog visitor · Q19 the PDF is his publishing (matches `probe-pdf-028`'s question).

## `make lint`

The worktree had no `node_modules`, so I ran `make setup`'s first line, `npm ci --ignore-scripts` (the lockfile's packages, no git hooks), then `make lint` on this branch with every file written:

```
$ make lint
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
853 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
$ echo $?
0
```

No test was run: this task writes no code and no test.

## Refusals

None. No hook, bash-gate, or permission refusal in this session.

## What's left

- The spec's review (another worker), then `impl-028a` and `impl-028b` from this tip, T-DOC, and T-INT, as tasks.md says.
- His answers to Q1 to Q19 on the morning page; an overturned one is reworked before he merges. Q11 and Q16 are the ones to read closely: Q11 keeps his own Q247 answer, and Q16 is the conflict between his item 4b and his dog approval's line.
- Numbers the tasks print and record: plan §R-A3's window table (T-A01) and §R-B4's leave points (T-B03).
- Risk R-1: RG7 may fail at a reference stage with the room framed between the columns; T-A05 asks on the page if so.
- His hand: the dog visitor's introduction slot (T-B08's proposal and patch), the PDF's publishing (P8), the dinosaur's model (P9), and his look (SC-008).
- The intent moves into `specs/028-room-after-review/intent.md` when he accepts it (`intent/README.md`, step 2).
