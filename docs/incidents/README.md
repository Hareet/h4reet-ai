# Incident notes

One file per incident: `YYYY-MM-DD-short-name.md`. Sections: What happened · Timeline · Detection (which band, which tier) · Impact · Root cause · Fix · The eval that would have caught it · Follow-up intent.

## Notes

- [2026-11-18-tunnel-end-network.md](2026-11-18-tunnel-end-network.md): a release reconfigured the tunnel end's live network, and a dead laptop session held the tunnel's ports (F9, F10, F11).
- [2026-11-18-ec2-capacity.md](2026-11-18-ec2-capacity.md): EC2 couldn't start, with no spot capacity for its one type (spec 032).
- [2026-11-22-first-real-replace.md](2026-11-22-first-real-replace.md): the first real replace terminated EC2 and timed out (`fix/032-launch-policy`).
