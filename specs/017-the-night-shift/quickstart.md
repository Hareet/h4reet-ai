# Quickstart: proving the night shift

1. **The nono probe** (done, 2026-11-12): the nesting fails, and nono can't hold the socket or the hosts on WSL2 (research R-14). The Author chose containers.
2. **The container probe** (the Author, now): make the night-shift token (`claude setup-token`, into `~/.config/h4reet-ai/night-shift/claude.env`), turn extra usage off in his account, and run the probe at the runbook's SHA. Expected: `BOUNDARY: holds` and `PLAN-ONLY: yes`, its containers and networks removed. Then tell the session the report's path.
3. **The build** (agents): `make lint`, `make test`, `make evals` on `feat/017-the-night-shift`, pasted in its note. Expected: the spec, lattice, runner, studio-line, install, and probe tests pass.
4. **The install and rehearsal** (the Author): write `~/.config/h4reet-ai/night-shift/facts.env`, then run the install at the reviewed SHA. Expected: R1 to R4 `ok`.
5. **The undo** (the Author, to prove it): `install.sh <sha> --undo`, then the install again. Expected: the second install's summary matches the first.
6. **The pilot** (after 4): `night.py start` with the Resume stream's queue, starting at two or three workers (Q14). Expected: a decision page in the morning whose interruptions each have a cause (SC-004), and his account's usage page showing Claude Code usage on the plan and no API charges.
