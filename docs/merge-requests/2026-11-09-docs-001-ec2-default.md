# docs/001-ec2-default
Spec: specs/001-cloud-elevation/ (its intent: specs/001-cloud-elevation/intent.md; the reworked spec is on `spec/001-cloud-elevation` at 4e211e57) · Written by: docs role, a Claude session drafting from the main session's brief · Date: 2026-11-09
Session: /tmp/claude-1000/wt-adr001, a worktree of main at ada55c98 · Repo hooks active: no, not checked by the drafting session; the coordinator records this at commit
Authorized by: the Author's direction of 2026-11-09, quoted in ADR 0044: his four workflow quotes; his answers on Principle I, the version, EC2's spend, relay selection, the tunnel's end, and the two added wording changes; and his approval of five points on the workflow.

## What changed and why

Documents only: no code, no configuration, no test. The Author decided where prod runs. This branch records that decision as ADR 0044 and gives the constitution change as a patch for his hand.

| File | Change |
|---|---|
| `docs/adr/0044-ec2-as-prods-default-host.md` | new, Status proposed. Renumbered from 0043, which `feat/005-full-window-room` already holds. Its spec numbers now follow the reworked spec at 4e211e57, and a mapping from the 2026-09-07 outline sits under Consequences. |
| `docs/adr/0001-local-first-routing-with-capped-bedrock-fallback.md` | its Status line only: "Amended by ADR 0044 (2026-11-09)" |
| `docs/adr/README.md` | 0044's row; 0001's row notes the amendment |
| `docs/merge-requests/2026-11-09-constitution-1.1.0.patch` | the amendment, for the Author's hand, built from `docs/merge-requests/constitution-proposed.md.txt`. Principle V's reason; the Cloud, Local tier, and Model access standards; Observability's Langfuse clause; the version line 1.0.1 → 1.1.0 |
| `docs/how-we-build/lifecycle.md` | one sentence on the default host, "by the amendment of ADR 0044", true before and after the Author's commit |
| `README.md` | one sentence in "The engineering", with the same wording |

What the Author decided, in short: EC2 is the default production host, with the Anthropic API answering first and Bedrock second, and it runs without the local model server. The laptop serves when he runs it. One host serves at a time. The relay at the tunnel's end picks the host, so Route 53 no longer moves DNS between hosts. The tunnel's end is a spot instance. The model ceilings are $5 a day and $20 a month. The server has its own budget, and its figure is not set. The five workflow points, with his reply, are in ADR 0044's Decision, verbatim.

## Acceptance criteria

none: process change. This branch records decisions for spec 001's rework. It satisfies no FR or SC. Its own checks are these:

- ADR 0044 quotes the Author's words, and his answers, verbatim. Every number in it is in the repository or in his words, or is labelled as the session's estimate or as an option's own October figure.
- ADR 0044 is numbered 0044 everywhere: the file, the index row, ADR 0001's status line, the constitution copy, and this note.
- ADR 0044's spec numbers match the reworked spec at 4e211e57. Where a number changed from the 2026-09-07 outline, the mapping under Consequences says so.
- ADR 0001 changes its Status line only.
- The patch applies cleanly to main's `.specify/memory/constitution.md` (dry run, below). No agent edits the constitution.
- Every change to the constitution is shown as old → new in ADR 0044's Consequences, and the patch matches that list.

## Constitution check

| Principle or rule | Touched? | How this branch complies |
|---|---|---|
| I. Data-Local by Default | the EC2-first order is a question for "The system MUST prefer on-device or self-hosted inference where it meets the quality bar." | Principle I stays as written. The Author's answer, "Record the reason (Recommended)", is recorded in ADR 0044: EC2 has no GPU within the server budget, a CPU model run there would not meet the twin's quality bar, and the laptop's GPU model does, so the API meets the bar on EC2 and the laptop stays self-hosted-first. On the laptop, "a production tier, not a demo" applies: when the laptop serves, it serves production. |
| III. Intent Before Spec, Humans Merge | yes | The constitution changes only by the Author's hand, so it ships as a patch. No agent edits it. |
| IV. Least Privilege | yes | "no inbound connections" holds, since the laptop dials out. The IAM for the Lambda and the start function is a human act and stays open (ADR 0044, open item 6). |
| V. Cost Is a First-Class Signal | yes, its reason changes | The meter and the kill switch are the enforcement point, unchanged. The reason for the local tier changes from "the cloud bill" to "the model spend". The model ceilings count model calls only, and the server's budget is separate. |
| Governance, version | yes | The Author's answer is 1.1.0, MINOR: "Principle V's rules stay (the meter, the kill switch, degrading). Only its reason changes. This follows general semantic versioning rather than the rule's text." The rule says "MAJOR for removing or redefining a principle". The reviewer read the changed Principle V sentence as a redefinition, and so as MAJOR. The Author chose 1.1.0, so the patch keeps 1.1.0. |
| Technology Standards: Cloud, Local tier, Model access, Observability | yes | Amended by the patch, as ADR 0044 lists old → new. Cloud takes Bedrock off the always-on list: Bedrock is called from the serving host. Observability places Langfuse in the stack on whichever host serves. |

CLAUDE.md line 24 also describes routing, and it is the Author's hand. See "For the Author" below.

## Review

Pending: a reviewer that didn't write these documents. The first review returned "not ready", and the revision after it answered each finding. The Author's answers of 2026-11-09 since then (relay selection, the tunnel's end, the two wording changes) are in this revision, and the reviewer runs again on it.

## Verification

Commands run in this revision: reads of the files named above, and file-level checks: a rebuild of the patched constitution in a scratch copy from main's `ada55c98` file and the committed patch, and a line-by-line check that every amended sentence in the copy appears in ADR 0044. No `make` target was run: documentation only, and the Author's gate runs them.

Patch dry run, by the coordinator: the patch was rebuilt with `diff -u` from `refs/heads/main`'s
`.specify/memory/constitution.md` (ada55c98) and the revised copy (three hunks: Principle V; the Cloud, Local tier and
Model access standards; Observability; and the version line), and dry-run against a plain copy of main's file:

```text
checking file .specify/memory/constitution.md
```

The gate, from main's checkout (run in the Author's terminal):

```bash
cd ~/h4reet-ai/h4reet-ai
git --no-replace-objects switch main
b=docs/001-ec2-default
log=~/gate-adr.log
tools/gates/gate "$b" 2>&1 | tee "$log"
```

Expect Ready, with `evals` WARN (the behavioral tier's advisory line). With any FAIL, don't merge, and tell the session.

The guard. It goes only if the gate printed its merge line, your checkout is on `main`, the branch is at the SHA the gate checked, and `main` has nothing that SHA lacks:

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

The merge, only after `guard: go`:

```bash
m="Merge $b (${sha:0:12})"
o=(--no-replace-objects merge --no-ff)
o+=(-m "$m" -m "$s")
[ "$ok" = go ] && git "${o[@]}" "$sha"
```

The amendment dry run. It stops there:

```bash
d=docs/merge-requests
p=$d/2026-11-09-constitution-1.1.0.patch
t=$HOME/constitution.patch
git show "refs/heads/main:$p" > "$t"
less "$t"
patch -p1 --dry-run < "$t"
```

If it printed no error, apply it. This is your commit on main, with the CLAUDE.md line from "For the Author" below in the same commit:

```bash
patch -p1 < "$t"
f=.specify/memory/constitution.md
g=CLAUDE.md
git add "$f" "$g"
m="constitution 1.1.0: EC2 default host"
git commit -m "$m"
```

Optional: accept ADR 0044. Skip this block if you want it proposed:

```bash
a=docs/adr/0044-ec2-as-prods-default-host.md
s='s/^Status: proposed,/Status: accepted,/'
sed -i "$s" "$a"
git add "$a"
git commit -m "adr 0044: accepted"
```

Park off `main` again:

```bash
p=wip-park/11-9-2026
git --no-replace-objects switch -C "$p"
```

## Cost and data-flow impact

Cost: no change to the model ceilings ($5 a day, $20 a month), and the EC2 routes sit inside them and the adapter caps, as the Author answered. The server's cost is unset: its instance type and budget figure are the Author's, and this note gives no price. The session's own estimate, 8 GB and about $50 a month if always on, is labelled as an estimate in ADR 0044, point 5. The tunnel's end is a spot instance; the one price in the record is October's figure, inside the Author's option text in ADR 0044, decision 11.

Data-flow: this branch changes no runtime code, so no byte path changes here. But the decisions add flows that need rows in `docs/data-flow-disclosure.md`, which this branch does not edit:

- EC2's Anthropic-first route. Rows S2, V2, F1 and F3 name prod's route as one host, and need the EC2 route before EC2 serves visitors. ADR 0041's preconditions (the Author's price, cap, key, and row F3's words) apply before EC2 sends a call.
- The relay at the tunnel's end, which carries visitors' requests to whichever host serves (decision 10): a new row.
- The shared budget and kill-switch state in the cloud: a new row, since it carries spend and state off the local tier.
- The outbound tunnel: a new row, since it carries the local tier's traffic.

## For the Author

Decisions needed before you merge:

1. Whether to accept ADR 0044 now. The optional block under "Verification" does it; skip it to keep it proposed.
2. The version: 1.1.0, MINOR, as chosen on 2026-11-09. The rule's text reads MAJOR for a redefined principle. Your answer stands, and the patch keeps 1.1.0.
3. Relay selection (decision 10) changes the DNS design you approved on the same day. Spec 001 at 4e211e57 still describes DNS failover (FR-054, FR-063 to FR-065). Its wording changes with your OK, which the spec's next commit needs.
4. Whether to apply the patch now. Nothing in the repository's runtime uses it yet: the gateway still refuses an API-first primary (R1 in `specs/000-local-foundations/contracts/config-files.md`, enforced at `services/gateway/src/config/validate.ts:328-329`), and it selects routes by `H4_ENV`, with both hosts on prod.

Proposed replacement for CLAUDE.md line 24, your hand, in the same commit as the amendment. It describes the target; the code and config do not do this yet (spec 001):

> - Routing is configuration (`config/routing.yaml`), per host. On the laptop: local-first, then the one paid fallback prod's route names (Bedrock or the Anthropic API) within its $2-a-day sub-budget, then degraded. On EC2: the Anthropic API first, then Bedrock, within the $5-a-day and $20-a-month ceilings and the adapter caps, then degraded (ADR 0044). Check kill-switch state at request start; unknown state = degraded.

Anything wrong in the governance files: the constitution's Technology Standards still say "Infrastructure exclusively via Terraform", and a run-time Route 53 change or Lambda is not Terraform unless the spec makes it so (spec 001 FR-001, FR-072). Principle IV holds as written under the outbound tunnel.

## Before your gate

`main` (ada55c98) fails three gate steps on its own:

- `lint`: Prettier on four of your history files;
- `test`: the room's chunk and dist tests after your readiness marks;
- `test`: the gateway's D43 timing test, from this laptop's drifting clock.

`fix/007-steady-clock-test`, stacked on `fix/009-avatars-ready`, fixes all three. Gate and merge that stack first. Then the session merges `refs/heads/main` into this branch, and this note's gate follows.

## What comes after

Spec 001 is reworked around ADR 0044, and the reworked spec sits on `spec/001-cloud-elevation` at 4e211e57. The conflicts ADR 0044 names are settled there under the spec's own numbers (its mapping, under Consequences). Neither this branch nor the amendment changes them:

- intent 000's cost and "entire production stack" lines;
- intent 001's cost line;
- spec 000's FR-031, one meter for each stack;
- spec 001's DNS-failover wording (FR-054, FR-063 to FR-065), which relay selection replaces once the Author OKs it;
- config R1 and the `H4_ENV` route selection.
