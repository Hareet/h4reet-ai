# Runbook: the night shift

The night shift runs agent sessions while you sleep: a supervisor, and up to ten workers, each in its own container and worktree. This page is what you do: the token, the facts file, the push, the install, the nights, and the second install that turns on the plan and the gate. The design is in [how-we-build/night-shift.md](../how-we-build/night-shift.md), and the decisions are in [ADR 0050](../adr/0050-containers-around-every-agent-session.md), [ADR 0051](../adr/0051-agents-plan-and-run-the-gate.md), and [ADR 0052](../adr/0052-the-studio-line.md).

**Who runs what.** Every command on this page is yours, typed in your own terminal. The sessions can't do them: they can't read your token or your facts file, and they have no route to the Docker socket. Each command line is short on purpose, so paste one line at a time. Variables such as `NS` or `SHA` are set on their own lines, and a new terminal needs them set again.

## Symptoms

| What you see | Go to |
|---|---|
| `check: refused:` or `check: can't run:` | [11](#11-a-failed-preflight) |
| A limit in the page's Interruptions, or a next reset in `status` | [9](#9-a-usage-limit) |
| A worker's cause "stopped: waited with nothing to do" | [10](#10-an-idle-stop) |
| The install stops with `install: FAILED at` | [4](#4-install-and-rehearse) |
| The page says a token expired, or was refused | [1](#1-the-night-shift-token) |
| A plan or gate says "off: waiting for P-2, P-3, P-6" | [12](#12-the-second-install-plan-and-gate-on) |

## Impact

Nothing here changes the site: the night shift is build-time only, and no visitor ever reaches it. A failed step stops the night, and work waits at the last save point until you start it again. The night's containers and networks are named `h4-night-*`, and `night.py stop` touches only those.

## Act

### Before the first night

### 1. The night-shift token

The token is one line, `CLAUDE_CODE_OAUTH_TOKEN=…`, in `~/.config/h4reet-ai/night-shift/claude.env`, at mode 0600. It comes from `claude setup-token`, lasts about a year (research R-16), draws on your Claude plan and never on API credits, and can be revoked on its own, so your own sign-in is untouched (R-05). The runner reads its mode and shape, and never prints its value.

**Make it.** Set the umask first, so any file this shell makes is private. Then run the setup command and copy the token it prints. It prints once.

```text
umask 077
mkdir -p ~/.config/h4reet-ai/night-shift
claude setup-token
```

Now read the token without echoing it, and paste it when the prompt waits. Nothing shows on screen. Then write the file.

```text
read -s TOK
F=~/.config/h4reet-ai/night-shift/claude.env
echo "CLAUDE_CODE_OAUTH_TOKEN=$TOK" > "$F"
chmod 600 "$F"
unset TOK
```

Check the mode, and the line count, which must be 1.

```text
stat -c %a "$F"
wc -l < "$F"
```

Expected: `600`, then `1`. The value never appears in the output, and the command line itself holds no secret, so your shell history is clean. If the token is still in your terminal's scrollback, clear it there.

**Renew it.** A token lasts about a year. Make a new one before the old one expires, with the steps above; the file is overwritten. Then revoke the old token (below) and run `check` (section 6). A night whose token expires while it runs stops, and the page says so.

**Revoke it.** Do this at Anthropic first, then remove the local copy.

1. Revoke the night-shift token in your Claude account. The repository doesn't say which page lists tokens, and the session couldn't confirm it, so find the page in your account yourself, and confirm the revoke works. Your own sign-in is separate.
2. Remove the local copy. The night then refuses to start, which is the intended result.

```text
F=~/.config/h4reet-ai/night-shift/claude.env
rm "$F"
```

Deleting the local file doesn't revoke anything. The token stays valid until step 1 is done.

### 2. The facts file

The facts file is `~/.config/h4reet-ai/night-shift/facts.env`. It holds your machine's facts, and it never enters the repository. The install reads it as data and never runs it, so write each line as `KEY=value`, with absolute paths written out in full, since `~` isn't expanded. No quotes are needed, and each key appears once.

| Key | What it is |
|---|---|
| `REPO` | your checkout of the repository, on main |
| `NIGHT_ROOT` | the folder for the night's worktrees, under your home |
| `UID`, `GID` | your user and group IDs |
| `CLAUDE_VERSION` | the Claude Code version the images pin |
| `BLENDER_DIR` | your Blender install |
| `COMFYUI_DIR`, `COMFYUI_VENV` | your ComfyUI install and its Python environment |
| `COMFYUI_PORT` | the port ComfyUI listens on |
| `ENGINE_CERTS` | the agents' engine's client folder, the one the relay uses |
| `NIGHT_PLAN`, `NIGHT_GATE` | `off` until the second install (section 12) |
| `PLAN_AWS_PROFILE` | the plan role's AWS profile name; only from the second install |

Most values come from the container probe's report, whose path its last line prints. Your IDs come from these two commands.

```text
id -u
id -g
```

Create the file, then open it in your editor.

```text
mkdir -p ~/.config/h4reet-ai/night-shift
G=~/.config/h4reet-ai/night-shift/facts.env
${EDITOR:-vi} "$G"
```

The file is valid when every key is present, every path is absolute, `NIGHT_PLAN` and `NIGHT_GATE` each read `off` or `on`, and no `{{` is left. `check` (section 6) reports a bad file as "can't run", exit 2, and names what it found.

### 3. Push to GitHub before the first night

The Author's decision, of 2026-11-12 (Q17): "Let's accept the risk, and I will push up to github manually before we start these night shift agents". The repository has no remote, and the night's writing sessions can write its object store (ADR 0050). Your push gives the history a copy outside this machine. The session can't do it: its sandbox denies github.com. The push, and any publication it amounts to under ADR 0013, are yours.

First, run the repository's own check before any first push (FR-042). It exits 0 when clean, 1 on findings, and 3 when it can't certify. Fix anything it names before going on.

```text
cd ~/h4reet-ai/h4reet-ai
make publish-check
```

Create the repository on GitHub, in your account, and copy its URL. Then add it as `origin`. Check that no remote exists first.

```text
git remote -v
GH=<your repository URL>
git remote add origin $GH
```

Push `main` by its full ref, since a tag named `main` would otherwise be ambiguous.

```text
B=refs/heads/main
git push -u origin $B
```

Pushing `main` copies every commit reachable from it. The other local branches aren't copied, and some may hold parked work. To copy them too, run `git push -u origin --all` yourself, after you've read `git branch` and decided.

Verify that the remote's `main` is the one you have.

```text
git ls-remote origin $B
git rev-parse $B
```

The two SHAs match.

### 4. Install and rehearse

The install is one script, from one reviewed commit: "Agent builds, you run one script". It builds the night's images from that commit, installs the live specs and the runner read-only, makes the networks, and rehearses (R1 to R4). The rehearsal starts a test session in a worker container, signed in on the plan, then proves an API key stops it, runs `make check` and the red-team suite inside it, and tries each forbidden read, write, and connection.

Before you start, check four things.

- The facts file is valid (section 2), and the token file is at mode 600 with one line (section 1).
- Your studio's outputs folder is empty. The install refuses while it holds anything, and it prints only the count, never the names. Move the current files out first (Q5).
- The merge-request note for `feat/017-the-night-shift` names the reviewed SHA.
- The branch's tip is that SHA. The guard below checks it.

```text
ls -A /srv/studio/outputs | wc -l
```

Expected: `0`. Now set the SHA, and check the branch's tip against it.

```text
cd ~/h4reet-ai/h4reet-ai
SHA=<the reviewed 40-character SHA>
BR=refs/heads/feat/017-the-night-shift
TIP=$(git rev-parse $BR)
[ $TIP = $SHA ] && echo same || echo MOVED
```

If it prints `MOVED`, stop. The branch has moved since the note was written, so ask the session which SHA to use. Otherwise, run the install. It reads every file from that commit with `git show`, so your working tree doesn't matter.

```text
IN=deploy/night-shift/install.sh
bash <(git show "$SHA:$IN") "$SHA"
```

It ends with a summary between `== night-shift summary ==` and `== end ==`. The summary holds each step's outcome, the image IDs, each spec's SHA-256, and R1 to R4 as `ok` or `FAILED`. It holds nothing secret, by design. Paste the summary back to the session.

Step 0 checks disk and memory before anything builds: 15 GB free on the system disk and on the Windows drive, and 8 GB of free memory. If a step fails, the install prints one line, `install: FAILED at <step>: <reason>`, and stops. Paste that line back with the summary so far. A second run at the same SHA is safe to make: each step compares before it writes, and prints `unchanged` for each step already done.

### 5. Undo

`--undo` removes exactly what the install added: the live specs, the runner, the networks, the images it built, and the studio folders it made, when they're empty. It keeps your token and your facts file, and it names what it left.

```text
bash <(git show "$SHA:$IN") "$SHA" --undo
```

To prove that undo leaves nothing behind, install again at the same SHA afterwards. In the second summary, the `sha`, `spec`, and `allowlist` lines should match the first's; the `image` and `network` IDs change, since both are made again.

```text
bash <(git show "$SHA:$IN") "$SHA"
```

### Each night

### 6. Start, stop, status, check

The runner is installed at `~/.local/share/h4reet-ai/night-shift/night.py`. Run it from that folder, with `/usr/bin/python3 -I -B` so no project configuration is loaded.

```text
NS=~/.local/share/h4reet-ai/night-shift
cd $NS
/usr/bin/python3 -I -B night.py check
```

`check` runs the preflight and nothing else. Exit 0 prints `check: ok`. Exit 1 prints `check: refused:` and one line naming the failing check. Exit 2 prints `check: can't run:` and why. It never prints the token.

Start the night from the same folder. `start` runs in the foreground of the terminal you start it in, and it doesn't detach, so keep that terminal open. Its first line is `start: the night of` and the date. Ctrl-C is a stop, the same as `stop` below.

```text
/usr/bin/python3 -I -B night.py start
```

In a second terminal, set `NS` again, then check the night's state. It prints each task's state, the locks' holders, and the next reset if the night is waiting on one.

```text
/usr/bin/python3 -I -B night.py status
```

To stop the night, use `stop`. It stops every night container, first with SIGTERM and then, after 60 seconds, with SIGKILL. A running gate is stopped too. Unfinished tasks stay queued, and any plan credentials are removed. Starting again resumes from the save points.

```text
/usr/bin/python3 -I -B night.py stop
```

After a WSL restart, the worktrees survive. Run `check`, then `start`.

**The queue.** The supervisor reads `queue.json` in its own worktree, which is `~/h4reet-ai/night/<date>/supervisor/`. The runner validates the file each time it changes, and a refused file keeps the last good one. Each refusal is one line on the page, naming the field. The queue's shape is in the data model (`specs/017-the-night-shift/data-model.md`). The contracts don't say how the first queue file gets into the supervisor's worktree. That's an open question for the first night, and the session should answer it before you start.

### 7. Reading the decision page

The morning's page is `docs/night-shift/<date>.md`, on the branch `night/supervisor/<date>`. The supervisor commits it at each save point, so you can read it while the night runs. Set the date and the paths, then show the page.

```text
cd ~/h4reet-ai/h4reet-ai
D=<the night's date, YYYY-MM-DD>
B=night/supervisor/$D
P=docs/night-shift/$D.md
git show $B:$P
```

The page has five sections, in this order.

- **Questions.** Each question appears once, with the task it blocks, a recommended answer, and the alternatives. The recommended answers are the session's. You confirm or overturn them.
- **Stacks.** Each finished stack, with its branch, its tip, its note, and its gate. The gate column holds the gate's log and its merge line, when the gate ran.
- **Interruptions.** Each time the night needed you, with its cause. Count them. A cause that repeats is a fix for the next night.
- **Requests.** New weights or custom nodes, with the reason, and any studio task past its third round. Those are yours to decide (FR-030).
- **The runner.** The runner's own lines: limits, resets, idle stops, and refusals.

To answer a question, tell the session in its next prompt. The contracts don't define a separate answer file yet. To merge a stack, read its note, then merge as `docs/merge-requests/README.md` says, with the gate's merge line. The night never merges. A gate runs only while your checkout is on main and clean, so keep it that way on any night with a gate queued. Otherwise the gate request is answered with that reason, and it goes on the page.

### 8. Digests

The install records a digest for each thing it installs: each file's SHA-256 and each image's ID, in `installed.txt` in the runner's folder. The lines read `file <path> <sha256>`, `image <ref> <id>`, and `network <name> <id>`. Each start checks every live spec's SHA-256 and every image's ID against that file. A mismatch refuses the start, with one line that names it.

```text
cd ~/.local/share/h4reet-ai/night-shift
cat installed.txt
```

Never edit a live spec, the runner, or a prompt in place. A mismatch means the files differ from what the reviewed commit made. Re-run the install at the reviewed SHA (section 4). The install prints a diff against any spec it replaces (FR-005). Then `check` should pass. The install's summary prints the same digests, so you can compare them with the note's.

### When the night stops

### 9. A usage limit

A weekly usage limit is normal. What you see is a limit in the page's Interruptions, and `status` showing the next reset. The runner does the work. It stops every container at its last save point, waits once until the reset plus five minutes, then resumes the unfinished tasks from their branches, the supervisor first. There is no hourly check.

Your part is to keep extra usage off in your Claude account, so a limit never becomes API billing. The runner never accepts extra usage.

The night can stop instead of waiting. The page's last lines say why: the reset time couldn't be read, or it's already past, or it's more than eight days ahead, or a second limit came within ten minutes of resuming. It also stops when three sessions fail within 120 seconds, which usually means a limit the runner didn't recognise. In each case, read the last page lines and `status`, then start again after the reset.

```text
/usr/bin/python3 -I -B night.py start
```

If the cause was an unrecognised limit, tell the session the exact wording from the page. The matcher is one named pattern in the runner, and the first real limit confirms it.

### 10. An idle stop

A worker that has been silent for 15 minutes, with a clean worktree and no pending request, is stopped, and the page records "stopped: waited with nothing to do". That's not a failure. If the task needed you, its question is on the page. Otherwise, the runner restarts the supervisor when a worker ends, and the night carries on.

A worker whose worktree is dirty isn't stopped by this rule, even when it goes quiet. If the page shows nothing moving for a long time, stop the night. There is no per-task stop in the contracts, so `stop` ends every session, and the tasks stay queued for `start`.

```text
/usr/bin/python3 -I -B night.py stop
```

### 11. A failed preflight

Run `check` first. It names one failing check, in one line, and never prints the token. Each check and its fix:

| Check | What it means | What to do |
|---|---|---|
| A spec's SHA-256 or an image's ID | The files differ from the install's record | Re-run the install at the reviewed SHA (section 4). Never edit a live file. |
| A spec with the example marker, or outside the live folder | An example file was pointed at as live | Re-run the install. |
| The token file | Not mode 600, or not exactly one line | Make the token again (section 1). |
| An API-billing variable in the runner's environment | Your shell exports a key or a cloud switch | Open a fresh terminal, or unset it (below), then `start` again. |
| A network missing, or not internal | The install's networks are wrong | Re-run the install. |
| The facts file (exit 2) | A key is missing, a path isn't absolute, or a placeholder is left | Fix `facts.env` (section 2). |
| Disk or memory | Under 15 GB free on the system disk or the Windows drive, or under 8 GB free memory | Free space, or wait. Every task checks again before it starts; one that's short waits and says why on the page. |
| A stray `commondir`, `main`, or `refs/…/main` in the repository's `.git` | Something could shadow main | Don't delete anything in `.git` by hand. Tell the session first. |
| A second runner | Another `start` holds the runner's lock | Wait for it, or find the other terminal. |

The API-billing check. Unset each name that `check` reports, one line at a time.

```text
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN
unset CLAUDE_CODE_USE_BEDROCK
unset CLAUDE_CODE_USE_VERTEX
unset CLAUDE_CODE_USE_FOUNDRY
```

### Plan and gate: off until the patches merge

Until the Author's patches P-2, P-3, and P-6 merge, both the plan request and the gate request answer "off: waiting for P-2, P-3, P-6". Then the plan and gate are off, and today's rules hold: agents ask you for a plan, and you run the gate. Turn them on only when the patches are on main, and the account role is applied (ADR 0051).

### 12. The second install: plan and gate on

1. Check that main holds the three patches, and that you're on main with a clean checkout.

   ```text
   cd ~/h4reet-ai/h4reet-ai
   git branch --show-current
   git status --short
   ```

2. Apply the plan role yourself. On main, `make infra-verify ROOT=account` prints the one apply command, and you run that command. Then record the outcome as spec 001's runbooks do, with `make infra-record ROOT=account OUTCOME=ok`, which writes its record on a new `ops/apply-*` branch. The session doesn't apply anything (Principle III).

   ```text
   make infra-verify ROOT=account
   ```

3. Renew your AWS SSO session, so the plan role can be assumed. A plan fails closed when the session has ended, and the page says when it ended. Set the profile name, then log in.

   ```text
   P=<the plan role's AWS profile name>
   aws sso login --profile $P
   ```

4. Edit the facts file: `NIGHT_PLAN=on`, `NIGHT_GATE=on`, and `PLAN_AWS_PROFILE=` with the name from step 3, on its own line. Then `check`.

   ```text
   G=~/.config/h4reet-ai/night-shift/facts.env
   ${EDITOR:-vi} "$G"
   ```

5. Run the guard and the install at the new reviewed SHA, which is the commit that holds the patches. Set the branch and the script path again, since this may be a new terminal, then the SHA.

   ```text
   BR=refs/heads/feat/017-the-night-shift
   IN=deploy/night-shift/install.sh
   SHA=<the new reviewed 40-character SHA>
   TIP=$(git rev-parse $BR)
   [ $TIP = $SHA ] && echo same || echo MOVED
   bash <(git show "$SHA:$IN") "$SHA"
   ```

The install adds two rehearsal rows. R5 plans the bootstrap root, and expects "No changes". R6 runs a gate on a test branch, and expects its merge line, with main unmoved. If either fails, the summary says which, and the plan or gate stays off until the cause is fixed. To turn both back off, set `NIGHT_PLAN` and `NIGHT_GATE` to `off` in the facts file, then run `check`. The runner reads the facts file at each start.

## Verify

- After the install, its summary reads `ok` for R1 to R4, and `== end ==` closes it.
- Before each night, `check` passes.
- Each morning, the decision page lists every interruption with its cause. Your Claude account's usage page shows the night on your plan, with no API charges.

```text
NS=~/.local/share/h4reet-ai/night-shift
python3 -I -B $NS/night.py check
```

## Undo

- **Stop a night**: `night.py stop`. It stops only the `h4-night-*` containers, and the work waits at its save points.
- **Remove the install**: run the install script with `--undo` at the same reviewed SHA, guarded as in [4](#4-install-and-rehearse). It removes only what its `installed.txt` lists: the live files, the networks and images it made. It names what it leaves, which is your token file and facts file.
- **Revoke the night-shift token**: in your Claude account's settings. Your own sign-in is unaffected.

```text
NS=~/.local/share/h4reet-ai/night-shift
python3 -I -B $NS/night.py stop
```

## Record

Keep the following in the night's note, which the session writes with you.

- The install summary, pasted whole. It holds no secret by design.
- Each refusal line from `check`, and each `install: FAILED at` line.
- Each limit stop, with its reset time and how long the night waited.
- The decision page's path for each night, and its interruption count.

Never record the token, the facts file's values, or any file under `~/.aws`, `~/.ssh`, or `~/.config/h4reet-ai/`.
