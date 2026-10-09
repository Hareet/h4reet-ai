# Grafana dashboards

Grafana provisions every `.json` file in this folder, mounted read-only at `/etc/grafana/dashboards`, through the file provider in `deploy/grafana/provisioning/dashboards/h4.yaml` (`allowUiUpdates: false`, `disableDeletion: true`). The files are the source: change a panel here, in a commit, never in the UI.

The panels and their exact queries are in `specs/000-local-foundations/contracts/telemetry.md` §7, and `deploy/scripts/test_dashboard.py` reads them from there: each section of §7 is in `h4-runtime.json` whole or not at all, with the contract's queries exactly. Open the dashboard at `http://localhost:<x002>/d/h4-runtime`.
