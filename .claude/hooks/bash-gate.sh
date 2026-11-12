#!/usr/bin/env bash
# PreToolUse(Bash): deterministic gate behind the constitution's prohibitions.
# Exit 2 blocks the command and returns stderr to Claude. Exit 0 allows.
# Belt and braces: permissions.deny in settings.json catches the obvious forms;
# this catches variants (chained commands, aliases, scripts) and writes the audit record.
set -Eeuo pipefail
# Fail closed: in Claude Code only exit 2 blocks, so a missing dependency or an unexpected
# error must become exit 2 — otherwise the gate silently disappears. -E carries the trap into
# functions and command substitutions, and the trap is set before anything else can fail.
trap 'echo "Blocked: error in $(basename "$0"); failing closed." >&2; exit 2' ERR
# shellcheck source=_audit.sh
source "$(dirname "$0")/_audit.sh" || { echo "Blocked: $(basename "$0") cannot load _audit.sh; failing closed." >&2; exit 2; }
command -v jq >/dev/null 2>&1 || { echo "Blocked: .claude/hooks requires jq (install it); failing closed." >&2; exit 2; }
input="$(cat)"
cmd="$(jq -r '.tool_input.command // empty' <<<"$input")"
[ -z "$cmd" ] && exit 0
root="${CLAUDE_PROJECT_DIR:-$PWD}"
# The calling subagent, from the hook input: its role's name in .claude/agents/, and its ID. Both are empty in the main
# session (the closing patch, plan §15).
agent_type="$(jq -r '.agent_type // empty' <<<"$input")"
agent_id="$(jq -r '.agent_id // empty' <<<"$input")"

# A git alias can stand in for any subcommand: git co main, with alias.co=checkout, switches to main. So each alias the
# command calls, from git config --get-regexp as git itself would read it, adds a line to what the rules read: the
# command with the alias's name replaced by its value, and a shell alias's value (!…) as the shell command it runs.
# Builtins are skipped, since git runs a builtin before an alias of the same name (the closing patch, plan §13).
alias_call="\\bgit[\"']?([[:space:]]+(-[Cc][[:space:]]+[^[:space:]]+|-[^[:space:]]+))*[[:space:]]+[\"']?"
builtins="$(git --list-cmds=builtins 2>/dev/null || true)"
expanded=""
while IFS= read -r -d '' entry; do
  name="${entry%%$'\n'*}"
  name="${name#alias.}"
  value="${entry#*$'\n'}"
  [ "$value" != "$entry" ] || continue # an alias with no value runs nothing
  [[ "$name" =~ ^[A-Za-z][A-Za-z0-9-]*$ ]] || continue
  grep -qixF -- "$name" <<<"$builtins" && continue
  grep -Eiq "${alias_call}${name}([^[:alnum:]_-]|\$)" <<<"$cmd" || continue
  value="${value#!}"
  value="${value//\\/\\\\}"
  value="${value//&/\\&}"
  value="${value//\//\\/}"
  value="${value//$'\n'/\\n}"
  expanded+=$'\n'"$(sed -E "s/(^|[^[:alnum:]_-])${name}([^[:alnum:]_-]|\$)/\1${value}\2/gI" <<<"$cmd")"
done < <(git -C "$root" config -z --get-regexp '^alias\.' 2>/dev/null || true)
cmd+="$expanded"

# The block still happens when the audit record cannot be written.
block() { audit BLOCK bash "$1 :: $cmd" || true; echo "Blocked by .claude/hooks/bash-gate.sh — $1. Route: $2" >&2; exit 2; }
# Every rule reads the command through a pipe or a here-string. Under pipefail, a rule's grep that matches early, with
# more than a pipe buffer still to come, leaves the writer a SIGPIPE, the rule false, and the command allowed; so a
# command that long is refused outright (US5's review).
if [ "$(printf '%s' "$cmd" | wc -c)" -gt 60000 ]; then
  block "a command over 60,000 bytes" "split it, or write long content with the Write tool"
fi

# Infrastructure mutation is a human action in the protected CI environment.
echo "$cmd" | grep -Eq '(^|[;&| ])terraform +(apply|destroy|import|state +(rm|mv|push))' \
  && block "terraform mutation" "commit the change on your feature branch; apply runs in the protected environment after the Author approves"
# No agent path to main, ever.
echo "$cmd" | grep -Eq 'git +push[^;&|]*(--force|-f\b|\+refs|origin +main|origin +HEAD:main)' \
  && block "push to main or force-push" "commit on your feature branch; the Author merges"
echo "$cmd" | grep -Eq '(^|[;&| ])gh +pr +merge' && block "PR merge" "only the Author merges"

# Local until publication (ADR 0013): agents never push, never create or change a remote or a
# repository, and never move main; the Author merges feature branches locally. A git subcommand
# matches after git's global options (git -C dir, git -c k=v, --no-pager), with or without quotes,
# and inside any wrapper, such as a subshell or bash -c, but `git stash push` is not `git push`.
git_cmd="\\bgit[\"']?([[:space:]]+(-[Cc][[:space:]]+[^[:space:]]+|-[^[:space:]]+))*[[:space:]]+[\"']?"
main_ref="[\"']?(refs/heads/)?main[\"']?([^[:alnum:]_./-]|\$)"
local_route="development stays local until the Author publishes (ADR 0013)"
main_route="work on a feature branch (git switch -c <branch>); only the Author changes main"
echo "$cmd" | grep -Eq "${git_cmd}push\b" && block "git push" "$local_route"
echo "$cmd" | grep -Eq "${git_cmd}(remote[[:space:]]+(add|set-url)\b|config\b[^;&|]*[[:space:]]remote\.)" \
  && block "creating or changing a remote" "$local_route"
echo "$cmd" | grep -Eq '\bgh([[:space:]]+-[^[:space:]]+)*[[:space:]]+repo[[:space:]]+(create|fork)\b|\bgh\b[^;&|]*[[:space:]]api\b[^;&|]*\b(user|orgs/[^/[:space:]]+)/repos\b' \
  && block "creating a GitHub repository" "$local_route"
echo "$cmd" | grep -Eq "${git_cmd}(switch|checkout)[[:space:]]+(-[^[:space:]]+[[:space:]]+)*${main_ref}" \
  && block "switching to main" "$main_route"
echo "$cmd" | grep -Eq "${git_cmd}(update-ref\b[^;&|]*[[:space:]]|fetch\b[^;&|]*:)${main_ref}" \
  && block "moving main" "$main_route"
if echo "$cmd" | grep -Eq "${git_cmd}branch\b[^;&|]*[[:space:]](-[a-zA-Z]*[fdDmMcC]|--force|--delete|--move|--copy)\b" \
  && echo "$cmd" | grep -Eq "(^|[^[:alnum:]_./-])${main_ref}"; then
  block "moving or deleting main" "$main_route"
fi
echo "$cmd" | grep -Eq "${git_cmd}symbolic-ref\b[^;&|]*[[:space:]]${main_ref}" \
  && block "pointing HEAD at main" "$main_route"
echo "$cmd" | grep -Eq "${git_cmd}rebase([[:space:]]+-[^[:space:]]+)*[[:space:]]+[^-[:space:]][^[:space:]]*[[:space:]]+${main_ref}" \
  && block "rebasing main" "$main_route"
echo "$cmd" | grep -Eq "${git_cmd}worktree[[:space:]]+add([[:space:]]+-[^bB[:space:]][^[:space:]]*)*[[:space:]]+[^-[:space:]][^[:space:]]*[[:space:]]+${main_ref}" \
  && block "checking out main in a worktree" "$main_route"
echo "$cmd" | grep -Eq "${git_cmd}(filter-branch|filter-repo)\b" \
  && block "rewriting history" "only the Author rewrites history (ADR 0013 allows one pre-publication cleanup)"
# An alias can stand in for any subcommand, so agents don't define them.
echo "$cmd" | grep -Eq '\bgit\b[^;&|]*(-c[[:space:]]*|[[:space:]]config\b[^;&|]*[[:space:]])alias\.' \
  && block "defining a git alias" "$local_route"
echo "$cmd" | grep -Eq '\bgh\b[^;&|]*[[:space:]]api\b.*createRepository' \
  && block "creating a GitHub repository" "$local_route"
# Git internals change through git, never by writing the files directly. The backtick in the
# pattern is a literal (a command started inside backticks), not an expansion. .git/main is a ref git reads for a bare
# main before refs/heads/main (fix/000-main-ref).
# shellcheck disable=SC2016
echo "$cmd" | grep -Eq '(>|(^|[;&|(`[:space:]])(tee|cp|mv|ln|install|truncate|rm|sed[[:space:]]+-i)[[:space:]])[^;&|]*\.git/(config|HEAD|refs/|hooks/|packed-refs|info/|main([^[:alnum:]_.-]|$))' \
  && block "writing git internals" "$main_route"
# The git hook that guards main (.claude/git-hooks/reference-transaction) keys on CLAUDECODE and runs
# from .git/hooks, so agents may not unset or clear that variable or point git at other hooks or config.
echo "$cmd" | grep -Eq 'CLAUDECODE|(^|[^[:alnum:]_])env[[:space:]]+(-[a-zA-Z]*i|--ignore-environment)\b|\bexec[[:space:]]+-[a-zA-Z]*c' \
  && block "changing the environment the git hook relies on" "$main_route"
echo "$cmd" | grep -Eiq 'core\.hookspath|GIT_CONFIG_(COUNT|KEY_|VALUE_|PARAMETERS|GLOBAL|SYSTEM|NOSYSTEM)' \
  && block "redirecting git hooks or config" "$main_route"
head="$(git -C "$root" symbolic-ref --short -q HEAD 2>/dev/null || true)"
if [ "$head" = "main" ] && echo "$cmd" | grep -Eq "${git_cmd}(commit|merge|cherry-pick|revert|rebase|am|pull|reset|update-ref)\b"; then
  block "changing main (HEAD is main)" "$main_route"
fi
previous="$(git -C "$root" rev-parse --symbolic-full-name '@{-1}' 2>/dev/null || true)"
if [ "$previous" = "refs/heads/main" ] && echo "$cmd" | grep -Eq "${git_cmd}(switch|checkout)[[:space:]]+-([[:space:]]|\$)"; then
  block "switching back to main" "$main_route"
fi

# Cloud control surfaces the agent may not touch.
echo "$cmd" | grep -Eq '(^|[;&| ])aws +(iam|budgets|ce|wafv2|waf|cloudfront +update|ssm +put-parameter[^;&|]*kill-switch)' \
  && block "IAM/budget/edge/kill-switch mutation" "write an ADR and a spec; the Author applies"
# The agents' engine (FR-039; contracts/agents-engine.md §8). The Author runs deploy/agents-engine/engine.sh
# directly, with sudo for setup; agents run only its read-only status and the smoke run, as `make engine-status` and
# `make engine-smoke`. Any other run is refused: by path or bare name, after a wrapper (sudo, env, bash -c, xargs,
# find -exec, and the like), and at the start of any chained or nested command, with quotes or backslashes inside the
# name. Between the start and the name it skips assignments (VAR=value, even first, or empty), options with one
# argument each (nice -n 5, watch -n 1; never a quoted one, so bash -c "cat engine.sh" stays a read), bare durations
# (timeout 5), and a dot-source anywhere (. engine.sh).
# Naming the file as an argument (cat, git diff, shellcheck) still works. A variable or a glob standing in for the
# name is a known gap: without sudo, and outside h4agents' user manager, such a run can't change the engine.
engine_route="the Author runs deploy/agents-engine/engine.sh directly (contracts/agents-engine.md §8); agents use make engine-status or make engine-smoke"
# Quotes, backslashes, and $ (as in $'…' and $"…") may sit inside a name; US5's enforcement patch added the $.
eq="[\"'\\\\\$]*"
engine_name="e${eq}n${eq}g${eq}i${eq}n${eq}e${eq}\\.${eq}s${eq}h\\b"
engine_start="(^|[;&|(\`{]|\\\$\\(|\\b(then|do|else|exec|sudo|doas|env|nohup|time|command|builtin|xargs|timeout|nice|ionice|stdbuf|setsid|watch|bash|sh|zsh|dash|ksh|source)\\b|-exec(dir)?\\b|(^|[[:space:];&|(\`{])\\.[[:space:]])"
engine_skip="[[:space:]]*-[^[:space:]]*([[:space:]]+[^-[:space:]\"'][^[:space:]]*)?|[[:space:]]+[0-9][0-9.]*[smhd]?|[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*"
engine_run="${engine_start}(${engine_skip})*[[:space:]]*[\"']?([^[:space:];&|]*/)?${engine_name}"
# One simple command whose first word only reads, with no separator, substitution, redirection, or second line, passes:
# cat, grep, rg, head, tail, wc, diff, shellcheck, ls, stat, file, sed -n with line addresses and p alone, and git's
# diff, log, show, grep, and blame. None of them runs a file it names (tasks.md T170: the false positive on grep -c sudo
# pushed a session to respell around the gate).
engine_reads=0
if [[ "$cmd" != *$'\n'* ]] && grep -Eq '^[[:space:]]*((cat|grep|egrep|fgrep|rg|head|tail|wc|diff|shellcheck|ls|stat|file)[[:space:]]|sed[[:space:]]+-n[[:space:]]+["'"'"']?[0-9]+(,[0-9$]+)?p["'"'"']?[[:space:]]|git[[:space:]]+(diff|log|show|grep|blame)[[:space:]])[^;&|`$<>()]*$' <<<"$cmd"; then
  engine_reads=1
fi
if [ "$engine_reads" = 0 ] && echo "$cmd" | grep -Eq "$engine_run" \
  && ! echo "$cmd" | grep -Eq '^[[:space:]]*(\./)?deploy/agents-engine/engine\.sh[[:space:]]+(status|smoke)[[:space:]]*$'; then
  block "running the agents' engine's Author commands" "$engine_route"
fi
# The Author's own targets and commands (spec 000 plan §13; tasks.md T103, T104): make contract-live calls a live
# adapter, Bedrock's paid, with an operator token; make aws-login starts prod's Bedrock session; and the Bedrock evals
# call Bedrock through prod's paid endpoint. A paid route gets its deny with it (CLAUDE.md). Spec 010's paid route,
# the Anthropic API, gets the same rules with anthropic (its FR-024, FR-032): make evals or make check, and
# evals/run.py, its module, or an import of it, naming it. make contract-live is refused by name whatever its
# adapter, and make redteam-live by its own SANDBOX_RUNTIME check and the operator token the sandbox can't read.
# - A make target is two matches in one command: make (gmake, a path to either, or tools/gates/run_checks, which runs
#   make, by path or as a module), and the target's name after any character a name or a path can't hold, so after an
#   option or an assignment (.DEFAULT_GOAL=, --eval=), a quote, a brace, a parameter's default (${t:-…}), or a separator
#   inside a quoted value. The evals need bedrock or anthropic too, through make evals or make check, whose evals
#   gate runs it.
# - operator.py with contract-record, and evals/run.py, its module, or an import of it with bedrock or anthropic, are
#   the same two matches, so they hold through runpy, or a copy made in the same command.
# - aws-login.sh matches where it runs, by the engine rule's starts and skips, and wherever a shell is started in the
#   same command (| bash, bash <, sh -c "$(cat …)", eval), so git add, git diff, cat, and shellcheck naming it work.
# - The AWS CLI matches as aws anywhere, with sso and login, configure and sso, or sso-oidc.
# Quotes, backslashes, and $ inside a name don't hide it (eq), nor does a backslash-newline. A name built at
# run time or held in a variable, a glob, an ANSI-C escape, a computed import, or a copy run in a command of its own
# does (the matrix's gap rows); the targets' own SANDBOX_RUNTIME refusals and the token and session the sandbox can't
# read still stop those. The match is on the command's text, so a command that only names them is refused too: a
# make target and make (git log --grep='make contract-live'), bedrock or anthropic and make evals or make check (not
# anthropic-messages or @anthropic-ai/sdk, where - is a name's character: spec 010's plan, R-11), contract-record and
# operator.py, aws-login.sh and a shell started in the same command, or aws with sso login or configure sso (a grep of
# T105's steps). Read with the Read and Grep tools, and commit with a message file.
author_route="the Author runs it (spec 000 plan §13); ask the Author"
# These rules read the command three ways: as written; with each backslash-newline joined (make contract-\<newline>live);
# and as bash reads it, each comment ended at its newline first, backslash or not, and then the lines joined. The
# rules above read it as written only, since joining alone would put the line after a comment's backslash onto the
# comment, where they'd miss it.
continued=$'\\\n'
joined="${cmd//"$continued"/}"
uncommented="$(printf '%s\n' "$cmd" | sed -E 's/(^|[[:space:];&|()])#.*$/\1/')"
uncommented="${uncommented//"$continued"/}"
has() { grep -Eq "$1" <<<"$cmd" || grep -Eq "$1" <<<"$joined" || grep -Eq "$1" <<<"$uncommented"; }
# A name, with quotes, backslashes, or $ allowed between its characters, as an extended regular expression.
spelled() {
  local s="" c i
  for ((i = 0; i < ${#1}; i++)); do
    c="${1:i:1}"
    if [ "$c" = . ]; then c='\.'; fi
    s+="${c}${eq}"
  done
  printf '%s' "${s%"$eq"}"
}
# Before and after a name: a character a name can't hold, or a parameter's default (${v:-name}); for a make target,
# not a path's / either, but a leading ./, which make strips from a goal (make ./aws-login runs aws-login).
nb="(^|[^[:alnum:]_.-]|\{[A-Za-z_][A-Za-z0-9_]*:?[-=+?])"
ne="([^[:alnum:]_.-]|\$)"
tb="(^|[^[:alnum:]_./-]|\{[A-Za-z_][A-Za-z0-9_]*:?[-=+?])(\.${eq}(/${eq})+)*"
te="([^[:alnum:]_./-]|\$)"
bedrock_word="${nb}$(spelled bedrock)${ne}"
anthropic_word="${nb}$(spelled anthropic)${ne}"
make_word="${nb}(g${eq})?$(spelled make)${ne}|${nb}$(spelled run_checks)(${eq}$(spelled .py))?${ne}|$(spelled tools.gates.run_checks)${ne}"
if has "$make_word"; then
  if has "${tb}($(spelled contract-live)|$(spelled aws-login))${te}"; then
    block "an Author-only make target" "make contract-live and make aws-login: $author_route"
  fi
  if has "${tb}($(spelled evals)|$(spelled check))${te}" && has "$bedrock_word"; then
    block "the Bedrock evals" "make evals or make check with ADAPTER=bedrock: $author_route"
  fi
  if has "${tb}($(spelled evals)|$(spelled check))${te}" && has "$anthropic_word"; then
    block "the Anthropic evals" "make evals or make check with ADAPTER=anthropic: $author_route"
  fi
fi
if has "${nb}$(spelled operator.py)${ne}" && has "${nb}$(spelled contract-record)${ne}"; then
  block "operator.py's contract-record" "$author_route"
fi
evals_run="${nb}($(spelled evals/run.py)|$(spelled evals.run))${ne}|$(spelled from)[[:space:]]+$(spelled evals)[[:space:]]+$(spelled import)${ne}"
if has "$evals_run" && has "$bedrock_word"; then
  block "the Bedrock evals" "evals/run.py --adapter bedrock: $author_route"
fi
if has "$evals_run" && has "$anthropic_word"; then
  block "the Anthropic evals" "evals/run.py --adapter anthropic: $author_route"
fi
# Spec 001's P-1 adds aws-sso-profile.sh, make aws-login PROFILE=…'s script, the Author's own SSO session.
aws_login="${nb}($(spelled aws-login.sh)|$(spelled aws-sso-profile.sh))${ne}"
shell_start="(^|[[:space:];&|(\`{]|\\\$\()(bash|sh|zsh|dash|ksh|source|eval|\.)([[:space:]]|\$)"
if has "${engine_start}(${engine_skip})*[[:space:]]*[\"']?([^[:space:];&|]*/)?($(spelled aws-login.sh)|$(spelled aws-sso-profile.sh))${ne}" \
  || { has "$aws_login" && has "$shell_start"; }; then
  block "aws-login.sh" "$author_route"
fi
if has "${nb}$(spelled aws)${ne}" \
  && { has "${nb}$(spelled sso-oidc)${ne}" \
    || { has "${nb}$(spelled sso)${ne}" \
      && has "${nb}($(spelled login)|$(spelled configure))${ne}"; }; }; then
  block "the AWS CLI's SSO sign-in" "$author_route"
fi
# The closing patch (spec 000 plan §13, §15; tasks.md T117).
# - A stack is dev-cpu only when the command names it and no other: each ENV, for make, and each --stack, or an
#   abbreviation argparse accepts, for evals/breach.py and scripts/operator.py, is dev-cpu, in every reading. ENV is prod
#   when the command gives none, and both scripts need --stack, so a command naming none is refused too.
# - The breach test inits, resets, and renews the stack it runs on, which outside the agents' own engine takes "a
#   pre-execution hook with a reason and an audit record" (FR-008); make's and breach.py's own SANDBOX_RUNTIME checks are
#   one unset away. The operator targets and CLI change or read the stack's state through its admin listener, whose
#   ports for prod and dev, 18003 and 18103, are refused by name wherever they appear. make studio-window is one of
#   them (spec 003's contracts/gpu-window.md §2): it records a window on that listener and stops or restarts the
#   stack's model server.
# - The Author's other targets: make publish-check, make tools, make matrix-canary, and make evals-agent-config.
# - git's --no-verify (and the prefixes git accepts), and git commit -n, skip the pre-commit scan.
# - claude mcp add gives sessions a new tool server.
# - terraform's global options (-chdir=infra) sit between terraform and its subcommand.
# The engine's script read by a shell started in the same command (piped into a shell, a shell's -c over its text, a
# shell reading it from stdin), unless the command only reads it (T170).
if [ "$engine_reads" = 0 ] && has "${nb}${engine_name}" && has "$shell_start"; then
  block "running the agents' engine's Author commands" "$engine_route"
fi
dev_cpu_route="agent sessions run it on dev-cpu only, with ENV=dev-cpu or --stack dev-cpu and no other stack (FR-008); the Author runs prod and dev"
# only_dev_cpu <option, as a regular expression>: the option appears, and every time with the value dev-cpu.
only_dev_cpu() {
  local opt="$1" reading v seen
  for reading in "$cmd" "$joined" "$uncommented"; do
    seen=0
    while IFS= read -r v; do
      seen=1
      v="$(sed -E "s/^${opt}([[:space:]]*[:+?!]*=[[:space:]]*|[[:space:]]+)?//" <<<"$v" | tr -d "\"'\\\\\$")"
      [ "$v" = dev-cpu ] || return 1
    done < <(grep -oE "${opt}(([[:space:]]*[:+?!]*=[[:space:]]*|[[:space:]]+)[^[:space:];&|()<>]*)?" <<<"$reading" || true)
    [ "$seen" = 1 ] || return 1
  done
}
env_opt="(^|[^[:alnum:]_.-])$(spelled ENV)"
stack_opt="(^|[^[:alnum:]_.-])--${eq}s(${eq}t(${eq}a(${eq}c(${eq}k)?)?)?)?"
python_word="${nb}((g${eq})?$(spelled python)[0-9.]*|$(spelled pypy)[0-9.]*|$(spelled uv)|$(spelled uvx)|$(spelled pipx)|$(spelled runpy))${ne}"
runs_script() { # runs_script <name>: run by an interpreter, or from where a command starts, as aws-login.sh is
  has "$python_word" && has "${nb}$1${ne}" && return 0
  has "${engine_start}(${engine_skip})*[[:space:]]*[\"']?([^[:space:];&|]*/)?$1${ne}"
}
if has "$make_word" && has "${tb}$(spelled breach-test)${te}" && ! only_dev_cpu "$env_opt"; then
  block "the breach test outside dev-cpu" "make breach-test: $dev_cpu_route"
fi
breach_script="($(spelled breach.py)|$(spelled evals.breach)|$(spelled evals)[[:space:]]+$(spelled import)[[:space:]]+$(spelled breach))"
if runs_script "$breach_script" && ! only_dev_cpu "$stack_opt"; then
  block "the breach test outside dev-cpu" "evals/breach.py: $dev_cpu_route"
fi
if has "$make_word" && has "${tb}($(spelled operator-)[[:alnum:]_\"'\\\$-]*|$(spelled studio-window))${te}" \
  && ! only_dev_cpu "$env_opt"; then
  block "an operator target outside dev-cpu" "make operator-* and make studio-window: $dev_cpu_route"
fi
operator_script="($(spelled operator.py)|$(spelled scripts.operator)|$(spelled scripts)[[:space:]]+$(spelled import)[[:space:]]+$(spelled operator))"
if runs_script "$operator_script" && ! only_dev_cpu "$stack_opt"; then
  block "the operator CLI outside dev-cpu" "scripts/operator.py: $dev_cpu_route"
fi
if has "(^|[^0-9])($(spelled 18003)|$(spelled 18103))([^0-9]|\$)"; then
  block "prod's or dev's admin listener" "its ports, 18003 and 18103, are the Author's (FR-008); agent sessions reach dev-cpu's, 18303, through make operator-* ENV=dev-cpu"
fi
if has "$make_word" && has "${tb}($(spelled publish-check)|$(spelled tools)|$(spelled matrix-canary)|$(spelled evals-agent-config))${te}"; then
  block "an Author-only make target" "make publish-check, make tools, make matrix-canary, and make evals-agent-config: $author_route"
fi
git_word="${nb}$(spelled git)${ne}"
no_verify="${nb}$(spelled --no-veri)(${eq}f(${eq}y)?)?(${eq}=|${ne})"
if has "$git_word" && { has "$no_verify" \
  || has "${git_word}([^;&|]*[[:space:]])?$(spelled commit)([^[:alnum:]_.-][^;&|]*)?[[:space:]][\"'\\]*-[[:alpha:]\"'\\]*n"; }; then
  block "skipping git's hooks" "commit without --no-verify or -n; the pre-commit scan runs on every commit (FR-008)"
fi
# A ref a bare main names beside refs/heads/main (fix/000-main-ref). git reads main as main (a file at the top of .git),
# refs/main, and refs/tags/main before refs/heads/main, so a tag named main would answer for main:<path>, git diff
# main...<branch>, and git merge-base main wherever they're written bare. The reference-transaction git hook refuses
# them inside Claude Code; these rules name the spellings: git tag whose tag name is main (after the options that create
# one: -a, -f, -s, -e, and -m, -F, -u with their values; never -l, -d, -v, or --contains, which only read or delete),
# and update-ref, symbolic-ref, or a fetch refspec's destination naming refs/main, refs/tags/main, refs/remotes/main, or
# refs/remotes/main/HEAD. Quotes, backslashes, and $ inside the name don't hide it; a name held in a variable or built
# at run time, update-ref --stdin, and fast-import do (the matrix's gap rows), and the git hook and the gate's check
# hold those.
q="[\"'\\\\]*"
shell_word="(\"[^\"]*\"|'[^']*'|[^[:space:];&|\"']+)+"
tag_value="(-[afse]*[mFu]|--(message|file|local-user|cleanup|trailer))(=|[[:space:]]+)${shell_word}|-[afse]*[mFu][^[:space:]]+"
tag_flag="-[afse]+|--(force|annotate|sign|no-sign|edit|no-edit|create-reflog|no-create-reflog)?"
if has "${git_cmd}tag${q}([[:space:]]+${q}(${tag_value}|${tag_flag})${q})*[[:space:]]+${q}$(spelled main)${q}([^[:alnum:]_./-]|\$)"; then
  block "a tag named main" "$main_route; name the tag anything else"
fi
main_shadow="${q}($(spelled refs/main)|$(spelled refs/tags/main)|$(spelled refs/remotes/main)(${eq}/${eq}$(spelled HEAD))?)${q}([^[:alnum:]_./-]|\$)"
# A fetch refspec's destination is read as git reads it: git puts refs/ before one starting tags/ or remotes/, and a glob
# at refs/* or refs/remotes/* (or remotes/*) lands a source branch feature/main at refs/main or refs/remotes/main. The
# refspec may follow fetch, or sit in a remote's fetch setting (git -c remote.<name>.fetch=…, git config). A glob at
# refs/tags/* stays allowed, since it is how tags are fetched: a gap row.
fetch_dst="(${main_shadow}|${q}($(spelled refs/)${eq})?($(spelled tags/main)|$(spelled remotes/main)(${eq}/${eq}$(spelled HEAD))?)${q}([^[:alnum:]_./-]|\$)|${q}($(spelled refs/)${eq}($(spelled remotes/)${eq})?|$(spelled remotes/)${eq})\*)"
if has "${git_cmd}(update-ref|symbolic-ref)\b[^;&|]*[[:space:]]${main_shadow}" \
  || has "${git_cmd}fetch\b[^;&|]*:${fetch_dst}" \
  || has "$(spelled remote)${eq}\.[^[:space:]=]*\.${eq}$(spelled fetch)${q}(=|[[:space:]]+)[^;&|[:space:]]*:${fetch_dst}"; then
  block "a ref a bare main names" "$main_route; name the ref anything else"
fi
# claude, or npx's claude-code, where a command starts, then mcp and add in the same command: naming the three in a
# grep, a commit message, or a comment isn't running it (the closing patch's review).
claude_run="${engine_start}(${engine_skip})*[[:space:]]*([\"']?([^[:space:];&|]*/)?($(spelled npx)|$(spelled bunx)|$(spelled pnpx))(${engine_skip})*[[:space:]]+)?[\"']?([^[:space:];&|]*/)?$(spelled claude)(${eq}-$(spelled code))?[\"']*"
if has "${claude_run}([[:space:]][^;&|]*)?[[:space:]][\"']*$(spelled mcp)[\"']*[[:space:]]+([^;&|]*[[:space:]])?[\"']*$(spelled add)(${eq}-(${eq}json|$(spelled from-claude-desktop)))?${ne}"; then
  block "adding an MCP server" "MCP servers change only by the Author's hand (.mcp.json is human-only)"
fi
tf_sub="($(spelled apply)|$(spelled destroy)|$(spelled import)|$(spelled state)[[:space:]]+[\"']*($(spelled rm)|$(spelled mv)|$(spelled push)))"
# A global option, or a word a variable fills ($FLAGS, ${F}, $(…)), may sit between terraform and its subcommand.
if has "${nb}$(spelled terraform)([[:space:]]+[\"']*[-\$][^[:space:]]*)*[[:space:]]+[\"']*${tf_sub}${ne}"; then
  block "terraform mutation" "commit the change on your feature branch; apply runs in the protected environment after the Author approves"
fi
# Spec 001's guard patch, P-1 (its plan §2; research.md R-16, R-32; FR-006, FR-011, FR-012). Terraform's state-changing
# commands in every spelling R-16 names: terraform, and tofu and terragrunt as drop-ins, by name or by a path to the
# binary, wherever they sit (a wrapper such as command, exec, env, nice, timeout, or xargs; bash -c or sh -c; a
# subshell), with any words between the name and the subcommand inside one simple command (-chdir=…, a quoted value, a
# variable), so a subcommand counts after a space or a quote, never after = or a path's / (plan -out=apply.tfplan, fmt
# infra/test). Quotes, backslashes, and $ inside a name don't hide it. The subcommands: apply and destroy (and
# terragrunt's apply-all and destroy-all), import, refresh, taint, untaint, force-unlock, test (it creates real
# infrastructure), state rm, mv, push, or replace-provider, workspace new or delete, and init with -migrate-state,
# -force-copy, or -reconfigure. fmt, validate, init -backend=false, and plan stay allowed: the offline checks.
# TF_CLI_ARGS and TF_CLI_ARGS_<command> add flags or a plan file to any command, so the name is refused wherever it
# appears, and any terraform-family command is refused while one is set in the session's own environment. A name held
# in a variable, a shell function or alias, or a copy of the binary under another name gets through (the matrix's gap
# rows); agent sessions hold no AWS credential and the sandbox reaches no AWS endpoint, so those still change nothing.
# The name ends at a character no name holds, but never a separator, so the match stays inside one simple command.
tf_bin="${nb}($(spelled terraform)|$(spelled tofu)|$(spelled terragrunt))([^[:alnum:]_.;&|-]|\$)"
tf_mut="(($(spelled apply)|$(spelled destroy))(${eq}-${eq}$(spelled all))?|$(spelled import)|$(spelled refresh)|$(spelled taint)|$(spelled untaint)|$(spelled force-unlock)|$(spelled test)|$(spelled state)[\"']*[[:space:]]+[\"']*([^[:space:]]*\\{[A-Za-z_][A-Za-z0-9_]*:?[-=+?])?($(spelled rm)|$(spelled mv)|$(spelled push)|$(spelled replace-provider))|$(spelled workspace)[\"']*[[:space:]]+[\"']*([^[:space:]]*\\{[A-Za-z_][A-Za-z0-9_]*:?[-=+?])?($(spelled new)|$(spelled delete)))"
tf_route="agent sessions run terraform fmt, validate, and init -backend=false only (make infra-check); the Author plans and applies in his terminal (spec 001 FR-006; research.md R-16)"
# Before the subcommand, a space, a quote, the } that ends an expansion (${IFS}apply), or a parameter's default's
# opening (${v:-apply}), the form nb and tb already take for names and make targets (the review's B6).
tf_pre="([^;&|]*([[:space:]\"'}]|\{[A-Za-z_][A-Za-z0-9_]*:?[-=+?]))?"
if has "${tf_bin}${tf_pre}${tf_mut}([\"'}]|${ne})"; then
  block "a Terraform state-changing command" "$tf_route"
fi
if has "${tf_bin}${tf_pre}$(spelled init)([\"'}]|${ne})[^;&|]*-${eq}-?${eq}($(spelled migrate-state)|$(spelled force-copy)|$(spelled reconfigure))"; then
  block "terraform init that moves or rewrites state" "$tf_route"
fi
if has "$(spelled TF_CLI_ARGS)"; then
  block "TF_CLI_ARGS" "it adds flags or a plan file to every terraform command; $tf_route"
fi
for tf_var in "${!TF_CLI_ARGS@}"; do
  if has "$tf_bin"; then block "a terraform command while $tf_var is set" "unset it in the shell that starts Claude Code; $tf_route"; fi
done
# The Author-only targets (research.md R-16, R-32; contracts/infra-records.md §1): make plan with a ROOT (the real plan,
# with his SSO session; make plan alone is the offline checks), infra-verify, infra-record, infra-mirror, infra-audit,
# secrets-check, release, rollback, the ec2-* commands, cloud-session, shared-state-roles, server-budget-restore,
# tunnel-keys, and tunnel-revoke, by make's two matches above. make aws-login, already refused, takes a named profile
# now; operator-* with ENV=shared is refused by the dev-cpu rule below. Their API equivalents too: the AWS CLI writing or
# deleting a /h4reet/ parameter (the secrets and the autostart switch, R-26; FR-012) or invoking h4-ec2-start or
# h4-ec2-guard (make ec2-start's function).
p1_route="the Author runs it in his terminal (spec 001 research.md R-32); ask the Author"
p1_targets="$(spelled infra-verify)|$(spelled infra-record)|$(spelled infra-mirror)|$(spelled infra-audit)|$(spelled secrets-check)|$(spelled release)|$(spelled rollback)|$(spelled ec2-)[[:alnum:]_\"'\\\$-]*|$(spelled cloud-session)|$(spelled shared-state-roles)|$(spelled server-budget-restore)|$(spelled tunnel-keys)|$(spelled tunnel-revoke)"
if has "$make_word" && has "${tb}(${p1_targets})${te}"; then
  block "an Author-only make target (spec 001)" "$p1_route"
fi
if has "$make_word" && has "${tb}$(spelled plan)${te}" && # Quotes in or around the name count as part of it (make plan "ROOT"=prod), as only_dev_cpu reads ENV.
has "(^|[^[:alnum:]_.-])${eq}$(spelled ROOT)${eq}[[:space:]]*[:+?!]*${eq}="; then
  block "make plan with a ROOT, the real plan" "make plan alone runs the offline checks; $p1_route"
fi
if has "${nb}$(spelled aws)${ne}" && { { has "${nb}($(spelled put-parameter)|$(spelled delete-parameter)|$(spelled delete-parameters))${ne}" \
  && has "$(spelled /h4reet/)"; } || { has "${nb}$(spelled invoke)" && has "$(spelled h4-ec2-)"; }; }; then
  block "the AWS CLI on a /h4reet/ parameter or the handover's functions" "$p1_route"
fi
# EC2's start, stop, and terminate through the AWS CLI, and SSM's AWS-StopEC2Instance and AWS-StartEC2Instance: the API
# equivalents of make ec2-start and make ec2-stop (the review's nit 5).
if has "${nb}$(spelled aws)${ne}" && has "${nb}($(spelled start-instances)|$(spelled stop-instances)|$(spelled reboot-instances)|$(spelled terminate-instances)|$(spelled AWS-StopEC2Instance)|$(spelled AWS-StartEC2Instance))${ne}"; then
  block "the AWS CLI starting, stopping, or terminating an instance" "$p1_route"
fi
# The read-only roles (plan §13's role table): the reviewer's git diff and git log, and the red-teamer's make redteam
# and make evals, may not write a file, run another makefile, or call a live adapter. Their grants are prefixes, so the
# refusals are here: git's --output, a redirection to a file (2>&1, >&2, and >/dev/null aren't), tee, make's own
# options that read another makefile or directory (-f with anything but the repository's Makefile, -C, -E, -I, and
# MAKEFILES or MAKEFLAGS), and an ADAPTER= but fake. They hold for the reviewer and the red-teamer (plan §15), and for a
# subagent with an agent_id but no agent_type, which fails closed; other types, the built-in agents among them, keep the
# rules every session has (the closing patch's review: refusing them broke ordinary work).
ro_role=0
case "$agent_type" in
  reviewer | red-teamer) ro_role=1 ;;
  "") [ -z "$agent_id" ] || ro_role=1 ;;
esac
if [ "$ro_role" = 1 ]; then
  role_route="${agent_type:-a subagent with no agent_type} is read-only in the shell (.claude/agents/ defines the roles; implementer writes code); report what you found instead"
  if has "${nb}$(spelled --output)(${eq}=|${ne})"; then block "a read-only role writing a file" "git's --output: $role_route"; fi
  for reading in "$cmd" "$joined" "$uncommented"; do
    if sed -E -e 's/[0-9]*>&[0-9-]+//g' -e 's#(&|[0-9]*)>>?[[:space:]]*/dev/null([[:space:];&|)]|$)#\2#g' <<<"$reading" | grep -q '>'; then
      block "a read-only role writing a file" "a redirection: $role_route"
    fi
  done
  if has "${nb}$(spelled tee)${ne}"; then block "a read-only role writing a file" "tee: $role_route"; fi
  # make's options count within make's own command, from the word make to the end of that simple command, so a grep -C3
  # that names make isn't one. -f is allowed for the repository's Makefile, the spelling the main tree needs (T183).
  make_opts="(^|[[:space:]])[\"']*(-[[:alnum:]]*[fCEI]|--${eq}(f${eq}i${eq}l${eq}e|m${eq}a${eq}k${eq}e${eq}f${eq}i${eq}l${eq}e|d${eq}i${eq}r${eq}e${eq}c${eq}t${eq}o${eq}r${eq}y|e${eq}v${eq}a${eq}l|i${eq}n${eq}c${eq}l${eq}u${eq}d${eq}e))"
  for reading in "$cmd" "$joined" "$uncommented"; do
    while IFS= read -r seg; do
      seg="$(sed -E "s#(^|[[:space:]])(-f|--file|--makefile)(=|[[:space:]]+)(\./)?Makefile([[:space:]]|\$)# #g" <<<"$seg")"
      if grep -Eq "$make_opts" <<<"$seg"; then
        block "a read-only role running another makefile" "make -f (but the Makefile), -C, -E, or -I: $role_route"
      fi
    done < <(grep -oE "(${make_word})[^;&|]*" <<<"$reading" || true)
  done
  if has "(^|[^[:alnum:]_])($(spelled MAKEFILES)|$(spelled MAKEFLAGS))${eq}="; then
    block "a read-only role running another makefile" "MAKEFILES or MAKEFLAGS: $role_route"
  fi
  adapter_opt="(^|[^[:alnum:]_.-])$(spelled ADAPTER)"
  # Only an assignment sets it (make's ADAPTER=x, or the environment's): naming ADAPTER in a search isn't one.
  if has "${adapter_opt}[[:space:]]*[:+?!]*="; then
    while IFS= read -r v; do
      v="$(sed -E "s/^.*$(spelled ADAPTER)[[:space:]]*[:+?!]*=[[:space:]]*//" <<<"$v" | tr -d "\"'\\\\\$")"
      [ "$v" = fake ] || block "a read-only role calling a live adapter" "ADAPTER=$v: only ADAPTER=fake; $role_route"
    done < <(for reading in "$cmd" "$joined" "$uncommented"; do grep -oE "${adapter_opt}[[:space:]]*[:+?!]*=[[:space:]]*[^[:space:];&|()<>]*" <<<"$reading" || true; done)
  fi
fi
# Destructive filesystem operations outside the workspace.
# The pattern matches a literal "$HOME" in the command text, so the single quotes are intended.
# shellcheck disable=SC2016
echo "$cmd" | grep -Eq '(^|[;&| ])rm +-[a-zA-Z]*r[a-zA-Z]* +(/|~|\$HOME|\.\.)' \
  && block "recursive delete outside workspace" "delete only inside the repo"
# Arbitrary egress. The sandbox enforces the domain allowlist at the OS level; this adds the audit trail.
echo "$cmd" | grep -Eq '(^|[;&| ])(curl|wget|nc|ncat|ssh|scp) ' \
  && block "network egress tool" "package installs go through the toolchain; fetching docs is a human step"
# Fix tasks: the check on the code may not be weakened. Mirrors protected-paths.sh: any path with
# "test" in it, *.spec.*, evals/, and redteam/, written by rm, mv, cp, tee, sed -i, truncate, or ">".
# The write must be a command of its own, so `docker compose run --rm … pytest` still runs.
# The backtick in the pattern is a literal (a command started inside backticks), not an expansion.
# shellcheck disable=SC2016
if [ "${FIX_TASK:-0}" = "1" ] \
  && echo "$cmd" | grep -Eq '((^|[;&|(`[:space:]])(rm|mv|cp|tee|truncate)[[:space:]]|(^|[;&|(`[:space:]])sed[[:space:]]+-i|>)[^;&|]*(test|\.spec\.|evals/|redteam/)'; then
  block "test-file modification during a fix task" "fix the code, not the test"
fi

audit ALLOW bash "$cmd"
exit 0
