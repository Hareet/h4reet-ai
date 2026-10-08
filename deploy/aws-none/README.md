# deploy/aws-none

The AWS configuration directory of every stack but prod (spec 000, plan §5.2). dev and dev-cpu mount this
directory read-only as the gateway's `/home/node/.aws`, so their gateways find no AWS profile and no SSO
session, and no Bedrock call is possible outside prod, even by mistake (FR-031).

It holds this README and nothing else. Preflight refuses to start dev or dev-cpu if anything else appears here
(contracts/env-files.md §2, check P7). Never put credentials here: prod's live in
`~/.config/h4reet-ai/aws-home/.aws`, outside the repository.
