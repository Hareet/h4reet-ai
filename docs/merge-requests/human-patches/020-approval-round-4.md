# 020: your approval of the dog's round 4 (for the Author's hand)

Spec: specs/020-dog-modeled-and-brought-in/ (FR-002, FR-007; plan.md §2's approval entry) · Written by: implementer (judge-dog-r4) · Date: 2026-11-14
Branch: `night/judge-dog-r4/judge-dog-r4`. Built from a `git archive` export of `refs/heads/main` at `3c0e4cd0`. The judge's output and the checks are in `specs/020-dog-modeled-and-brought-in/studio-round-4.md`, under "Judged dry (judge-dog-r4)".

## Status: applied by you on main as `b6985ad2` (2026-11-14, about 23:06Z)

Your words: "Let's approve the round4 dog". You applied this patch as written: `b6985ad2`, "policy(020): approve the dog, round 4". Its 48 added lines are this diff's. record-dog-r4 then recorded round 4 as a pass (`/srv/studio/briefs/dog/4.result.json`). The runs are in `specs/020-dog-modeled-and-brought-in/studio-round-4.md`, under "Round 4 recorded (record-dog-r4)". Round 3 stays recorded, unused. The text below is as it was written before you applied it.

Apply it only after you've looked at the renders and want this dog:

- `/srv/studio/handoff/dog/4/front.png`
- `/srv/studio/handoff/dog/4/side.png`
- the concept the mesh came from, if you want it: `/srv/studio/handoff/dog/4/concept.png`

The studio's note, `/srv/studio/handoff/dog/4/note.md`, compares the renders with the photo marking by marking. It also lists four things for your look that aren't markings: a jagged ruff behind the right ear, a small white spot on the right of the neck, a flat tail, and the head turned slightly to the dog's left.

Nothing is recorded yet. After these entries are on main, a later task judges round 4 again with `--record`. *(Done: record-dog-r4 recorded round 4 as a pass, after `b6985ad2`.)*

## Why

Your words, rule 13 (2026-11-14, about 21:00Z):

> "Let's go with the approval of the SHA and use the actual image /srv/studio/workflows/inbox/duck-toller.jpg"

On the photo: "Not my dog", and "I own it / it's free to use".

Main's arrival check holds any file whose record names a photo source until an approval names the file's SHA-256. The check is `tools/gates/arrival_check.py:2968-2970` (`held`, from `source.get("type") == "photo"`) and `:2987-3001` (P1). Round 4's dry judge on main gives that P1 on each GLB, and nothing else.

## What it adds

Three entries to `assets/policy/approvals.json`, one for each file the record holds, in main's shape. The twin's seven entries are the model: an avatar has a disclosure line, and its clips have `null`.

| id | file, when approved | kind | SHA-256 |
|---|---|---|---|
| `A-20261114-dog` | `assets/visitors/dog/dog.glb` | avatar | `d31c085cfa6dc92449f3ada3873417c829acd8e4989a3ae54c2bacc524842078` |
| `A-20261114-dog-idle` | `assets/visitors/dog/dog-idle.glb` | animation | `1bd5ee9454ed654700dbbec6279ec54861419d8ae47ffc61d243aa8107e9ff25` |
| `A-20261114-dog-walk` | `assets/visitors/dog/dog-walk.glb` | animation | `f35b742a6b8070faddf9f184fc1ac94d4560e1d4c501e2bee9a2c1ad3e53e306` |

- **The SHA-256s:** I computed them with `hashlib` from `/srv/studio/handoff/dog/4/`. They match the studio's note and the record.
- **The paths:** `assets/visitors/dog/` is the record's `directory`, which is where spec 020's intake puts the files.
- **The IDs:** the ones the record carries in each entry's `approval`. Main's check needs them to match (`:3002-3008`).
- **The date:** today, 2026-11-14.
- **The reason:** your words above, as written in rule 13.

### A departure for you to confirm: `likeness_accepted` reads `true`

Rule 13 says:

> `likeness_accepted`: "not_applicable", since it is not his dog

Main's check doesn't accept that for the dog. It accepts `"not_applicable"` for `likeness_accepted` only on a room file whose record says `likeness: false` (`tools/gates/arrival_check.py:2955-2964`, spec 004's Amendment C5). The dog's files go under `assets/visitors/dog/`, not `assets/room/`, and their record's `kind` is `avatar` or `animation`. So these entries read `true`, like the other four confirmations (the page's Q268).

I ran both versions against a scratch copy of main with the patch applied (studio-round-4.md):

- with `true`: `line: pass; round 4`, exit 0;
- with rule 13's `"not_applicable"`: P1 on each GLB, "the approval naming this file's hash has a confirmation that isn't true", exit 1.

The record itself still says `likeness: false`, and the disclosure line below says it isn't your dog. `true` here means only what the confirmation means in main's check: you've looked at the figure and accept it. To overturn this, you would need a change to the arrival check (its C5 widened to visitor files whose record says `likeness: false`), and that's a patch to `tools/gates/**`.

### The disclosure line: a draft for you to rewrite

Spec 020's FR-002 bundles a model from a photo only where its approval has a non-empty `disclosure_line`, and FR-007 shows that line in the room while the model shows. So `dog.glb`'s entry needs one. The spec's earlier draft (spec.md Q3) called it "a likeness of the Author's dog", which round 4 isn't. This entry's draft:

> The dog is an AI-made, stylized Nova Scotia Duck Tolling Retriever, a dog of the breed and not a likeness of the Author's dog, shown by his choice.

The clips have `null`, like the twin's clips. Main's arrival check doesn't read the line for a visitor's file: its P3 is only for `assets/twin/` (`:3025-3039`). So rewriting it doesn't change the judge.

### No entry for the photo itself

Your order approves "the SHA". Main's check doesn't look up the photo's hash anywhere:

- approvals are matched only by the arriving file's own hash (`matches = [a for a in policy.approvals if a.get("sha256") == actual]`, `:2987`);
- a source is only `{type, id}`, an opaque ID (`:2287-2307`), and the record's is `{"type": "photo", "id": "PH-0002"}`.

So this patch adds no entry for the photo. For the record, the photo the studio used is the one your order names. Its SHA-256 is `3761dd8d58250a297c86d6dada22f6225f2fc3a4fe533f20d3cf143f9acf1df6`, 338,299 bytes, as the studio's note reports (`/srv/studio/handoff/dog/4/note.md`, "The photo", Q269). This container can't read the inbox to check it, so if you want to check it yourself, run one `sha256sum` on that file.

## Order

1. Look at `front.png` and `side.png`.
2. Apply this patch on main and commit it.
3. Tell the page the entries are on main. A task then judges round 4 with `--record` and brings `assets/visitors/dog/` in.

## Apply

From the repository's root, on main (one line each):

```bash
B=night/judge-dog-r4/judge-dog-r4
F=docs/merge-requests/human-patches/020-approval-round-4.md
git show "refs/heads/$B:$F" > /tmp/020-approval-round-4.md
patch -p1 --dry-run < /tmp/020-approval-round-4.md
patch -p1 < /tmp/020-approval-round-4.md
```

`patch` skips this prose and reads only the diff below. The diff alone, as a file, has SHA-256 `e613935888da4e8717331d1cbd3a43227a8812c975aa999e02edbce8e1e47f6b`.

## The diff

```diff
--- a/assets/policy/approvals.json
+++ b/assets/policy/approvals.json
@@ -574,6 +574,54 @@
       },
       "disclosure_line": null,
       "reason": "typical lean when talking to someone"
+    },
+    {
+      "id": "A-20261114-dog",
+      "sha256": "d31c085cfa6dc92449f3ada3873417c829acd8e4989a3ae54c2bacc524842078",
+      "path_when_approved": "assets/visitors/dog/dog.glb",
+      "kind": "avatar",
+      "date": "2026-11-14",
+      "confirms": {
+        "likeness_accepted": true,
+        "nothing_locates": true,
+        "no_screen_logo_text_or_art": true,
+        "recreation_not_photo": true,
+        "record_complete": true
+      },
+      "disclosure_line": "The dog is an AI-made, stylized Nova Scotia Duck Tolling Retriever, a dog of the breed and not a likeness of the Author's dog, shown by his choice.",
+      "reason": "Let's go with the approval of the SHA and use the actual image /srv/studio/workflows/inbox/duck-toller.jpg"
+    },
+    {
+      "id": "A-20261114-dog-idle",
+      "sha256": "1bd5ee9454ed654700dbbec6279ec54861419d8ae47ffc61d243aa8107e9ff25",
+      "path_when_approved": "assets/visitors/dog/dog-idle.glb",
+      "kind": "animation",
+      "date": "2026-11-14",
+      "confirms": {
+        "likeness_accepted": true,
+        "nothing_locates": true,
+        "no_screen_logo_text_or_art": true,
+        "recreation_not_photo": true,
+        "record_complete": true
+      },
+      "disclosure_line": null,
+      "reason": "Let's go with the approval of the SHA and use the actual image /srv/studio/workflows/inbox/duck-toller.jpg"
+    },
+    {
+      "id": "A-20261114-dog-walk",
+      "sha256": "f35b742a6b8070faddf9f184fc1ac94d4560e1d4c501e2bee9a2c1ad3e53e306",
+      "path_when_approved": "assets/visitors/dog/dog-walk.glb",
+      "kind": "animation",
+      "date": "2026-11-14",
+      "confirms": {
+        "likeness_accepted": true,
+        "nothing_locates": true,
+        "no_screen_logo_text_or_art": true,
+        "recreation_not_photo": true,
+        "record_complete": true
+      },
+      "disclosure_line": null,
+      "reason": "Let's go with the approval of the SHA and use the actual image /srv/studio/workflows/inbox/duck-toller.jpg"
     }
   ]
 }
```
