# docs/001-ec2-default

ADR 0043, "EC2 as prod's default host", which amends ADR 0001, and the constitution amendment it explains, as a patch
for the Author's hand. Documents only: no code, no configuration, no test.

## Status: ready for review, then your gate

The Author's decisions of 2026-11-09, quoted in the ADR's Context:

- EC2 is the default production host. There, the Anthropic API answers first, with Bedrock as the second paid route.
- The laptop stays local-first, for demos.
- One host serves at a time.
- The tunnel and failover answers.
- "spot instances, or only keep the server online for 8-12 hours a day".
- The server's budget sits outside the $5-a-day and $20-a-month model ceilings.

What spec 001 still decides is the ADR's "Open, for spec 001" list.

| File | Change |
|---|---|
| `docs/adr/0043-ec2-as-prods-default-host.md` | new, Status proposed |
| `docs/adr/0001-local-first-routing-with-capped-bedrock-fallback.md` | its Status line only: "Amended by ADR 0043 (2026-11-09)" |
| `docs/adr/README.md` | 0043's row; 0001's row notes the amendment |
| `docs/merge-requests/2026-11-09-constitution-1.1.0.patch` | the amendment, for your hand: Principle V's local-tier sentence, and the Cloud, Local tier and Model access standards; version 1.0.1 → 1.1.0 |

On the laptop, the amended Model access reads "local-first with one paid fallback, Bedrock or the Anthropic API". That
matches spec 010's switch and CLAUDE.md's Conventions. The ADR's Consequences give every change as old → new.

**MINOR or MAJOR.** The Governance section bumps MAJOR "for removing or redefining a principle". Principle V's rules
stay as they are: the meter is the enforcement point, and the kill switch and degradation are unchanged. Only its reason
for the local tier changes, from "so the cloud bill stays near zero" to "so the model spend stays near zero". So the
patch says 1.1.0. If you read that as redefining the principle, change the version line to 2.0.0 before you commit; the
rest of the patch stays the same.

**The patch dry-runs clean** against `refs/heads/main`'s `.specify/memory/constitution.md` (ada55c98), from a plain
copy (`git show`, `diff -u`). It was built that way, never by `git apply` or by a write into a worktree.

## Before your gate

`main` (ada55c98) fails three gate steps on its own:

- `lint`: Prettier on four of your history files;
- `test`: the room's chunk and dist tests after your readiness marks;
- `test`: the gateway's D43 timing test, from this laptop's drifting clock.

`fix/007-steady-clock-test`, stacked on `fix/009-avatars-ready`, fixes all three. Gate and merge that stack first. Then
the session merges `refs/heads/main` into this branch, and this note's gate follows.

## Runs in your terminal

Nothing paid. No `--prove`, no behavioral tier: this branch touches neither `deploy/agents-engine/` nor
`.claude/settings.json`, and none of `CLAUDE.md`, `REVIEW.md`, `.claude/`, or the Claude Code pin.

1. **The gate, from main's checkout:**

   ```bash
   cd ~/h4reet-ai/h4reet-ai
   git --no-replace-objects switch main
   b=docs/001-ec2-default
   log=~/gate-adr.log
   tools/gates/gate "$b" 2>&1 | tee "$log"
   ```

   Expect Ready, with `evals` WARN (the behavioral tier's advisory line). With any FAIL, don't merge, and tell the
   session.

2. **The guard.** It goes only if the gate printed its merge line, your checkout is on `main`, the branch is at the SHA
   the gate checked, and `main` has nothing that SHA lacks:

   ```bash
   s=$(grep '^gate: ' "$log" | tail -n 1)
   sha=$(printf '%s\n' "$s" | awk '{print $2}')
   n=$(grep -c '^merge: ' "$log")
   on=$(git symbolic-ref -q HEAD)
   tip=$(git rev-parse --verify "refs/heads/$b")
   mr=refs/heads/main
   want="$mr.$sha"
   ```

   Then, on its own lines:

   ```bash
   ok=no
   [ "$n" -gt 0 ] && ok=go
   [ "$on.$tip" = "$want" ] || ok=no
   anc=(merge-base --is-ancestor)
   git "${anc[@]}" "$mr" "$sha" || ok=no
   echo "guard: $ok"
   ```

3. **The merge, only after `guard: go`:**

   ```bash
   m="Merge $b (${sha:0:12})"
   o=(--no-replace-objects merge --no-ff)
   o+=(-m "$m" -m "$s")
   [ "$ok" = go ] && git "${o[@]}" "$sha"
   ```

4. **The amendment, your commit on main.** Read it from the merged file, check it, apply it:

   ```bash
   d=docs/merge-requests
   p=$d/2026-11-09-constitution-1.1.0.patch
   t=$HOME/constitution.patch
   git show "refs/heads/main:$p" > "$t"
   less "$t"
   patch -p1 --dry-run < "$t"
   patch -p1 < "$t"
   f=.specify/memory/constitution.md
   git add "$f"
   m="constitution 1.1.0: EC2 default host"
   git commit -m "$m"
   ```

   If you want ADR 0043 accepted, change its Status line from "proposed" to "accepted" in the same commit.

5. **Park off `main` again:**

   ```bash
   p=wip-park/11-9-2026
   git --no-replace-objects switch -C "$p"
   ```

## What comes after

Spec 001 is reworked around the ADR: its spec, then its clarify questions to you (the ADR's open list), then its plan.
The conflicts the ADR names go into that rework. Neither this branch nor the amendment changes them:

- intent 000's cost and "entire production stack" lines;
- spec 000's FR-031, one meter for each stack;
- spec 001's SC-002, SC-003 and Assumptions.

## Constitution check

- **Principle III:** the constitution changes only by your hand, so it ships as a patch.
- **Governance:** the amendment comes with an ADR that explains it, and the version bump follows the semantic-versioning
  rule. The MINOR-or-MAJOR choice is yours, above.
- **Principle IV:** "no inbound connections" holds, since the laptop dials out.
- **Principle V:** the meter stays the enforcement point.

## Review

Pending: a reviewer that didn't write these documents.
