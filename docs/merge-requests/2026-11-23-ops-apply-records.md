# ops/apply-records-2026-11-23

Spec: specs/001-cloud-elevation/ (the recorded-apply rule, ADR 0008) · Written by: Claude Code (the Author's session) · Date: 2026-11-23
Session: /tmp/claude-1000/wt-apply-records (worktree of /home/h4reet/h4reet-ai/h4reet-ai) · Repo hooks active: yes
Authorized by: the Author's "fewer gates" practice (one gate for several branches whose files don't overlap)

## What changed and why

Five apply records, each written by `make infra-record` on its own `ops/apply-*` branch, merged here so one gate
brings them all to main before the repository is published. Each branch adds exactly one file under
`docs/infra/applies/`, and no two touch the same file:

| Branch | Record | Apply |
| --- | --- | --- |
| `ops/apply-prod-2026-11-18` (`a9266674`) | `docs/infra/applies/2026-11-18-prod.md` | prod at main `f1abe245`: the 8080 rule in code, the 5432 and 2301 rules from EC2 |
| `ops/apply-prod-2026-11-22` (`9c472e16`) | `docs/infra/applies/2026-11-22-prod.md` | prod at main `f2f63e7f`: spec 032's launch templates and parameters |
| `ops/apply-account-2026-11-22` (`58bcf7ed`) | `docs/infra/applies/2026-11-22-account.md` | the account at main `37e4a623`: spec 032's start function, schedules and images |
| `ops/apply-prod-2026-11-23` (`25869ac9`) | `docs/infra/applies/2026-11-23-prod.md` | prod at main `abbfc554`: the budget's stop action and the spot warning re-pointed to the live EC2 after the 11-22 replace |
| `ops/apply-account-2026-11-23` (`7f7a4097`) | `docs/infra/applies/2026-11-23-account.md` | the account at main `42019d3d`: fix/032-launch-policy's start function and credential audit images |

Nothing under `infra/` changes, so no plan block is needed.

## Constitution check

Recorded applies, as ADR 0008 requires; no secret or account ID in the repository. The records' AWS resource IDs are
redacted with the rest in the one history rewrite before publication.

## Review

None by an agent: five records written by `infra-record`, merged as they are.

## For the Author

Your gate on this branch (`pb=ops/apply-records-2026-11-23`), then the merge.
