# Quickstart: proving the night shift

1. **The probe** (the Author, now): run it at the runbook's SHA. Read it. Tell the session the report's path (`/tmp/h4-probe.*/report.txt`), or paste it. Expected: every section printed, `probe: done`, nothing written outside the temp folder.
2. **The build** (agents): `make lint`, `make test`, `make evals` on `feat/017-the-night-shift`, pasted in its note. Expected: the profile, lattice, runner, studio-line, and install tests pass.
3. **The install and rehearsal** (the Author): write `~/.config/h4reet-ai/night-shift.env` from the probe's summary. Then run the install at the reviewed SHA. Expected: `R1` to `R6` `ok`, and the layering named.
4. **The undo** (the Author, to prove it): run `install.sh <sha> --undo`, then the install again. Expected: the second install's summary matches the first.
5. **The pilot** (after 3): `night.py start` with the Resume stream's queue. Expected: a decision page in the morning whose interruptions each have a cause (SC-004).
