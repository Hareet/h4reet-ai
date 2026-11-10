# infra/: spec 001's Terraform, one AWS account

Everything spec 001 puts in the cloud is defined here, in Terraform, in one account in us-east-1 ([spec 001](../specs/001-cloud-elevation/spec.md), FR-001 to FR-013; [plan §1](../specs/001-cloud-elevation/plan.md#1-infrastructure-the-roots-the-state-and-the-records)). Agents write it and plan nothing against AWS; the Author plans and applies it from his own terminal, with a short-lived SSO session, and only a plan that a merged note holds.

## The roots

| Root        | Holds                                                                                                                                                                                                                         | Applied               |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `bootstrap` | Terraform's state bucket; the model-spend budgets `h4-model-month` ($20) and `h4-model-day` ($5), on the service names his Cost Explorer shows for Bedrock (`TF_VAR_bedrock_service_names`); the server budget `h4-server-month` (his figure); the anomaly monitor; the `h4-alerts` topic and its email subscription | first, alone (group 3) |
| `account`   | the budgets' two actions and their rehearsals, the Lambda functions, the registry, the release bucket                                                                                                                        | group 4 on            |
| `prod`      | the network, the tunnel end, RDS, EC2, the zone, the edge                                                                                                                                                                     | group 5 on            |

`lambdas/<name>/` holds each function's code and tests, stdlib Python on `python3.14`, arm64; `test/` holds the roots' tests and their fixtures, which Terraform never plans. `parameters.txt` lists the Parameter Store names the hosts expect, which `make secrets-check` reads.

## Protected files

These change only by the Author's hand, as patches beside a group's note (FR-012; [contracts/infra-records.md §3](../specs/001-cloud-elevation/contracts/infra-records.md)): `iam*.tf`, `budgets*.tf`, `alerts*.tf`, `killswitch*.tf`, `handover*.tf`, `failover*.tf`, `ec2-market*.tf`, `edge-limits*.tf`, in any root, and `policy/`. The policy (`tools/gates/infra_policy.py`) keeps the resource types they hold inside them (rule T5). The bootstrap's are P-I1's, `docs/merge-requests/2026-11-10-feat-001-pi1-bootstrap.patch`; the account's, with the alert bridge's folder, which spec 000's protected names (`infra/*alert*`) also hold, are P-I2's, `docs/merge-requests/2026-11-10-feat-001-pi2-account.patch`.

## The account root

`account/` (group 4) holds the safety net's second half, and what the hosts will pull:

- **The laptop's Bedrock identity** (`iam.tf`): spec 000's permission set, imported by its name (`iam.tf`'s own `local.laptop_permission_set`, which the Author reads from Identity Center), kept from destroy, and narrowed to `sts:AssumeRole` on `h4-laptop-bedrock`, an ordinary role at `/` that holds `bedrock:InvokeModel*` on the one inference profile.
- **The model action** (`killswitch.tf`): at 100% of `h4-model-month`, `h4-deny-paid-models` attaches to `h4-laptop-bedrock`, by a role that may do only that. While `local.rehearsal` is true, two $0.01 budgets rehearse both actions, against `h4-rehearsal-target` and `h4-rehearsal-instance` (`main.tf`). It is true only on the rehearsal's own change, beside `rehearsal-on.txt`, a line `note: docs/merge-requests/<that change's note>.md`, whose `<!-- h4-rehearsal: on -->` line says it is the rehearsal; the change that ends it removes the marker.
- **The functions** (`lambdas.tf`, their roles in `iam.tf`, what invokes them in `alerts.tf`): `h4-alert-bridge`, `h4-probe`, and `h4-credential-audit`, container images on arm64 from their repositories, each made once `local.lambda_images` names its digest.
- **The registry and the release bucket** (`registry.tf`).

Its one variable, `bedrock_service_names`, comes from `~/.config/h4reet-ai/infra/account.env`, as `TF_VAR_bedrock_service_names=["…"]`, the names Bedrock's spend shows under in Cost Explorer. Its state is in the bucket from the first apply, under `account.tfstate`.

## Who runs what

| Command                                                         | Who                       | Does                                                                                                                                       |
| --------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `make infra-check`, `make plan`                                 | anyone                    | the policy on the HCL, `terraform fmt`, and each root's `init` and `validate` against the Author's provider mirror alone                   |
| `make infra-mirror`                                             | the Author                | seeds that mirror at `.devcontainer/toolchain.vars`'s pins                                                                                 |
| `make plan ROOT=<root> PROFILE=<profile>`                       | the Author                | the policy and `terraform fmt -check` before `init`; `init` against the mirror; `plan -out`, never over a saved plan of the same tree; the policy on the plan's JSON; prints the redacted block for the note |
| `make infra-verify ROOT=<root> PROFILE=<profile>`               | the Author, on `main`     | refuses unless the saved plan is the merged note's, byte for byte, the audit is clean, and the state is unlocked; prints the one apply command |
| that command, `terraform … apply <saved plan>`                  | the Author                | the apply; there is no `make apply`                                                                                                        |
| `make infra-record ROOT=<root> OUTCOME=ok\|failed [EXIT_STATUS=n]` | the Author, on `main`     | writes `docs/infra/applies/<date>-<root>.md` on a new `ops/apply-*` branch, addresses and actions alone                                    |
| `make infra-audit PROFILE=<profile>`                            | the Author                | the credential audit: no IAM user at all, no root key, no outside trust, no OIDC provider, the laptop's identity and the handover's narrow |
| `make secrets-check PROFILE=<profile>`                          | the Author                | which Parameter Store names exist, by name and type, never a value                                                                         |

Each of the Author's targets refuses inside the agent sandbox, and the bash gate refuses it to agent sessions too (P-1). Terraform runs with its data folder at `~/.config/h4reet-ai/infra/data/<root>`, never `.terraform/` in the tree, where an agent could plant a provider his terminal would run; the saved plans, the local state, and each root's `TF_VAR_` values sit beside it under `~/.config/h4reet-ai/infra/`, denied to agents.

## The lockfile

Each root commits `.terraform.lock.hcl`, holding `hashicorp/aws` alone at the pin (rule T10). It is made from the Author's mirror, in his terminal, never from the registry and never by an agent, since no agent session holds Terraform or the mirror:

```text
m=~/.local/share/h4reet/terraform-providers
terraform -chdir=infra/bootstrap \
  providers lock -fs-mirror="$m" \
  -platform=linux_amd64
```

The bootstrap's lockfile is his step on `feat/001-us1-bootstrap`, before its plan block (the branch's note, "For the Author"), and the account's on `feat/001-us2-safety-net`, the same way with `-chdir=infra/account`.

## The state

The bootstrap's state starts local, at `~/.config/h4reet-ai/infra/state/bootstrap.tfstate`, since the bucket that will hold it doesn't exist before the first apply. Once he has applied it, the state moves into the bucket with `terraform init -migrate-state`, his alone (FR-003, FR-006), after `versions.tf`'s backend changes from `local` to `s3` on a branch of its own; every later root starts in the bucket, one key per root, with S3's own lock file.
