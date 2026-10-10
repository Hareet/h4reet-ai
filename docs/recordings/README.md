# Recordings

Terminal recordings of the runs that prove spec 000's success criteria. Each is an asciinema cast with a GIF made from it, scanned with gitleaks before it is committed (plan §16; quickstart.md §2.2).

| Recording | What it shows | Status |
|---|---|---|
| The breach test with real delivery (SC-002) | `make breach-test ENV=dev DELIVERY=real`, in the Author's terminal: dev's synthetic spend crosses the warning and the ceiling, the kill switch trips with no human action, the Telegram and email alerts arrive, and the operator's reset brings local answers back. SC-002 reads: "In the recorded breach test, run in the Author's terminal, `degraded` is active within 60 seconds of the ceiling and the Telegram alert arrives within 5 minutes, with no human action." | Not recorded yet: the Author's run, tasks.md T085 |

Until T085, this page is all the folder holds. The run's steps and their figures are in [plan §8](../../specs/000-local-foundations/plan.md#8-the-breach-test), and how it is recorded and checked before the commit in [quickstart.md §2.2](../../specs/000-local-foundations/quickstart.md#22-the-recorded-run-with-real-delivery-sc-002). Only the cast and the GIF are committed; the camera recording of the phone is the Author's to keep or publish.
