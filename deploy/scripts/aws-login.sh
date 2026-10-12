#!/usr/bin/env bash
# make aws-login: a new SSO session for prod's Bedrock identity (spec 000 FR-013; plan §4 and §5.2; research.md R-17;
# quickstart.md §0.6). The Author's terminal.
#
#   bash deploy/scripts/aws-login.sh
#
# It runs `aws sso login --profile h4reet-bedrock` with HOME set to ~/.config/h4reet-ai/aws-home, so the AWS CLI reads
# the runtime identity's config and writes its SSO token cache under ~/.config/h4reet-ai/aws-home/.aws: the directory
# prod's gateway mounts read-only as its own ~/.aws (H4_AWS_DIR, contracts/env-files.md §2). The session is the
# dedicated runtime user's and never the Author's own, because an SSO token can fetch credentials for every
# permission set its user holds (research.md R-17).
#
# Before the login it refuses, with exit 2:
#   - inside the agent sandbox: the session is the Author's, and agent sessions can't read ~/.config/h4reet-ai;
#   - any argument: the profile and the directory are fixed;
#   - no aws CLI on PATH;
#   - ~/.config/h4reet-ai/aws-home or its .aws missing, a symbolic link, another user's, or not mode 0700 (make init-env
#     ENV=prod creates both). A link would put the session, and the gateway's mount, wherever it points;
#   - .aws/config without a [profile h4reet-bedrock] section (quickstart.md §0.6, step 4, configures it once), or
#     with an SSO region other than us-east-1, the profile's sso_region or its sso-session's: the region decides which
#     portal and oidc hosts the login and prod's gateway reach, and docs/data-flow-disclosure.md lists us-east-1's (F2).
# The AWS CLI then runs without any AWS_* variable of the calling shell, so none can point it at another profile,
# config file, or credential (AWS_CONFIG_FILE could name the Author's own), and under umask 077, so what it creates is
# the Author's alone. A setting the login really needs, such as a CA bundle, goes in that config file.
#
# It prints what the AWS CLI prints, which the sign-in needs: a URL to open, and with a device code, the code. It never
# reads the token cache, so no token, refresh token, or client secret can reach its output. The gateway reads the new
# session from its mount, and make operator-status ENV=prod shows when it ends.
# Exit codes: 0 logged in; 1 aws sso login failed; 2 it couldn't run.
set -euo pipefail

profile=h4reet-bedrock
aws_home="$HOME/.config/h4reet-ai/aws-home"
aws_dir="$aws_home/.aws"

die() {
	echo "aws-login: $*" >&2
	exit 2
}

if [ "${SANDBOX_RUNTIME:-}" = 1 ]; then
	die "this is the Author's: it starts prod's Bedrock session in ~/.config/h4reet-ai, which agent sessions can't read"
fi
[ "$#" -eq 0 ] || die "it takes no arguments (usage: bash deploy/scripts/aws-login.sh, or make aws-login)"
command -v aws >/dev/null 2>&1 || die "there is no aws CLI on PATH: install the AWS CLI v2 (quickstart.md §0.6)"

# Each directory is a real one, yours, and 0700, as make init-env ENV=prod creates it. It's never created or changed
# here: a looser mode or another owner is for you to look at.
me="$(id -u)"
private_dir() {
	local path="$1" info
	if [ -L "$path" ]; then
		die "$path is a symbolic link: it must be the directory itself, so the session can't land anywhere else"
	fi
	[ -d "$path" ] || die "$path is missing: make init-env ENV=prod creates it"
	info="$(stat -c '%u %a' -- "$path")"
	[ "${info% *}" = "$me" ] || die "$path belongs to another user"
	[ "${info#* }" = 700 ] || die "$path is mode 0${info#* }; it must be 0700 (chmod 700 it yourself)"
}
private_dir "$aws_home"
private_dir "$aws_dir"
if [ ! -f "$aws_dir/config" ] || ! grep -Eq "^\[profile $profile\][[:space:]]*$" "$aws_dir/config"; then
	die "$aws_dir/config has no [profile $profile]. Configure it once (quickstart.md §0.6, step 4):" \
		"HOME=\"\$HOME/.config/h4reet-ai/aws-home\" aws configure sso --profile $profile"
fi
# ini_value <section> <key>: the key's value in that section of the config, or nothing. Bash alone, no other tool.
ini_value() {
	local want="[$1]" section="" line key value
	while IFS= read -r line || [ -n "$line" ]; do
		line="${line#"${line%%[![:space:]]*}"}"
		line="${line%"${line##*[![:space:]]}"}"
		case "$line" in
		\[*\]) section="$line" ;;
		*=*)
			[ "$section" = "$want" ] || continue
			key="${line%%=*}"
			key="${key%"${key##*[![:space:]]}"}"
			[ "$key" = "$2" ] || continue
			value="${line#*=}"
			printf '%s' "${value#"${value%%[![:space:]]*}"}"
			return 0
			;;
		esac
	done <"$aws_dir/config"
	return 0
}
session="$(ini_value "profile $profile" sso_session)"
if [ -n "$session" ]; then
	region="$(ini_value "sso-session $session" sso_region)"
else
	region="$(ini_value "profile $profile" sso_region)"
fi
[ "$region" = us-east-1 ] \
	|| die "the profile's SSO region is ${region:-not set}: it must be us-east-1, whose sign-in hosts docs/data-flow-disclosure.md lists (row F2)"

# The calling shell's AWS_* settings stay out of the login.
while IFS= read -r name; do
	case "$name" in AWS_*) unset "$name" ;; esac
done < <(compgen -e)
umask 077

echo "aws-login: signing in with the runtime identity's profile, $profile; the session goes to $aws_dir"
status=0
HOME="$aws_home" aws sso login --profile "$profile" || status=$?
if [ "$status" -ne 0 ]; then
	echo "aws-login: aws sso login failed (exit $status); see docs/runbooks/bedrock-credentials-expiring.md" >&2
	exit 1
fi
echo "aws-login: done. prod's gateway reads the new session from its read-only mount;" \
	"make operator-status ENV=prod shows when it ends"
