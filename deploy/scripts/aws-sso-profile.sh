#!/usr/bin/env bash
# make aws-login PROFILE=<name>: the Author's own SSO session for a named profile in his ~/.aws (spec 001 tasks.md T008;
# research.md R-32), such as the administrator profile his make plan ROOT=… and his applies use. The Author's terminal.
#
#   bash deploy/scripts/aws-sso-profile.sh h4reet-admin
#
# It is the session the plan's credentials section names, "the Author's administrator session in his terminal", and
# never prod's runtime identity's: that one lives in ~/.config/h4reet-ai/aws-home, which prod's gateway mounts, and
# make aws-login without PROFILE starts it (deploy/scripts/aws-login.sh).
#
# Before the login it refuses, with exit 2:
#   - inside the agent sandbox: the session is the Author's;
#   - anything but one argument, a profile name of the form h4reet-<letters, digits, dashes>;
#   - h4reet-bedrock, the runtime identity's profile, whose session belongs in aws-home;
#   - no aws CLI on PATH;
#   - ~/.aws/config without the profile's section, or with an SSO region other than us-east-1 (the profile's
#     sso_region, or its sso-session's): the region decides which sign-in hosts the login reaches.
# The AWS CLI then runs without any AWS_* variable of the calling shell, so none can point it at another profile, config
# file, or credential, and under umask 077. It prints what the CLI prints, which the sign-in needs, and never reads the
# token cache. Exit codes: 0 logged in; 1 aws sso login failed; 2 it couldn't run.
set -euo pipefail

die() {
	echo "aws-sso-profile: $*" >&2
	exit 2
}

if [ "${SANDBOX_RUNTIME:-}" = 1 ]; then
	die "this is the Author's: it starts his own SSO session, which agent sessions never hold"
fi
[ "$#" -eq 1 ] || die "it takes one profile name (usage: make aws-login PROFILE=h4reet-<name>)"
profile="$1"
[[ "$profile" =~ ^h4reet-[a-z0-9][a-z0-9-]*$ ]] || die "the profile's name must be h4reet-<letters, digits, dashes>"
[ "$profile" != h4reet-bedrock ] \
	|| die "h4reet-bedrock is prod's runtime identity, whose session lives in aws-home: run make aws-login without PROFILE"
command -v aws >/dev/null 2>&1 || die "there is no aws CLI on PATH: install the AWS CLI v2"

config="$HOME/.aws/config"
if [ ! -f "$config" ] || ! grep -Eq "^\[profile $profile\][[:space:]]*$" "$config"; then
	die "$config has no [profile $profile]: configure it once with aws configure sso --profile $profile"
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
	done <"$config"
	return 0
}
session="$(ini_value "profile $profile" sso_session)"
if [ -n "$session" ]; then
	region="$(ini_value "sso-session $session" sso_region)"
else
	region="$(ini_value "profile $profile" sso_region)"
fi
[ "$region" = us-east-1 ] || die "the profile's SSO region is ${region:-not set}: it must be us-east-1"

# The calling shell's AWS_* settings stay out of the login.
while IFS= read -r name; do
	case "$name" in AWS_*) unset "$name" ;; esac
done < <(compgen -e)
umask 077

echo "aws-sso-profile: signing in with your profile, $profile"
status=0
aws sso login --profile "$profile" || status=$?
if [ "$status" -ne 0 ]; then
	echo "aws-sso-profile: aws sso login failed (exit $status)" >&2
	exit 1
fi
echo "aws-sso-profile: done; commands that name --profile $profile use the new session until it ends"
