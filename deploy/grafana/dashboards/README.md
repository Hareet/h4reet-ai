# Grafana dashboards

Grafana provisions every `.json` file in this folder, mounted read-only at `/etc/grafana/dashboards`, through the file provider in `deploy/grafana/provisioning/dashboards/h4.yaml` (`allowUiUpdates: false`, `disableDeletion: true`). The files are the source: change a panel here, in a commit, never in the UI.

The panels and their exact queries are in `specs/000-local-foundations/contracts/telemetry.md` §7.
