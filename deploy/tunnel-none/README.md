# deploy/tunnel-none

dev's and dev-cpu's `H4_TUNNEL_DIR`: an empty stand-in folder. Every env file names the variable, since the compose file's `tunnel` service binds it, but only prod's laptop runs that service, in its `tunnel` profile, with the Author's key and pinned host key in `~/.config/h4reet-ai/tunnel/client` (spec 001 contracts/env-cloud.md §2; contracts/tunnel.md §3). Preflight refuses the `tunnel` profile on dev and dev-cpu, so nothing ever reads this folder. It holds no key, and none belongs here.
