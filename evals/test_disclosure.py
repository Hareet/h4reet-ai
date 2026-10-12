"""docs/data-flow-disclosure.md against the code whose flows it lists (spec 000 FR-040; plan §17; tasks.md T083, T106,
T110).

The compose policy already requires a row for every service (tools/gates/compose_policy.py). These hold rows to what
the code does: the breach probe's row names exactly the services evals/breach_probe.py calls, and the alerts' rows
name the Telegram Bot API and the alerts mailbox, which the gateway's egress row points at. Bedrock's two rows keep
plan §17's words, name the region config/routing.yaml must use, and name the SSO token's refresh while prod runs.
Every flow plan §17 lists has its row (T110); the rows T110 adds keep the plan's words too, and say what their code
does; the file closes with FR-040's sentence; and SECURITY.md links it. From US6's review, the Claude Code row lists
Claude Code's own default reporting and the two variables that stop it, and the devcontainer row names the gate's own
npm ci, read from the gate.
"""

from __future__ import annotations

import importlib.util
import re
import sys
import urllib.parse
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[1]
TEXT = (REPO / "docs" / "data-flow-disclosure.md").read_text(encoding="utf-8")
SERVICES = set(
    yaml.safe_load((REPO / "deploy" / "compose.yaml").read_text(encoding="utf-8"))[
        "services"
    ]
)
SPEC = importlib.util.spec_from_file_location(
    "h4_breach_probe_disclosed", REPO / "evals" / "breach_probe.py"
)
assert SPEC and SPEC.loader
probe = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = probe
SPEC.loader.exec_module(probe)


def rows() -> dict[str, list[str]]:
    """Each table row by its ID: its cells, the From → To first."""
    found = {}
    for line in TEXT.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if (
            line.startswith("| ")
            and len(cells) == 9
            and re.fullmatch(r"[A-Z]\d+", cells[0])
        ):
            found[cells[0]] = cells[1:]
    return found


def named(cell: str) -> set[str]:
    return set(re.findall(r"`([a-z0-9][a-z0-9-]*)`", cell))


def called_hosts() -> set[str]:
    """Every host a URL in breach_probe.py's source names, constant or not, and those its module constants hold."""
    source = (REPO / "evals" / "breach_probe.py").read_text(encoding="utf-8")
    urls = set(re.findall(r"""https?://[^\s"'/{}]+""", source))
    urls |= {v for v in vars(probe).values() if isinstance(v, str) and "://" in v}
    return {urllib.parse.urlsplit(url).hostname or "" for url in urls}


def test_the_probe_row_names_exactly_the_services_the_probe_calls() -> None:
    called = called_hosts()
    # The hosts of its service constants are among them: the scan misses none of the ones it calls.
    assert {
        urllib.parse.urlsplit(url).hostname
        for url in (probe.GATEWAY, probe.PROMETHEUS, probe.LANGFUSE, probe.MAILPIT)
    } <= called
    assert (
        called <= SERVICES
    )  # every host the probe calls is one of the stack's own services
    from_to = rows()["S11"][0]
    assert named(from_to) & SERVICES == called | {"breach-probe"}


def test_the_alert_channels_have_their_rows() -> None:
    found = rows()
    telegram = [
        r
        for r in found.values()
        if named(r[0].split("→", 1)[0]) == {"gateway"} and "`api.telegram.org`" in r[0]
    ]
    email = [
        r
        for r in found.values()
        if named(r[0].split("→", 1)[0]) == {"gateway"} and "`SMTP_HOST`" in r[0]
    ]
    assert len(telegram) == 1 and len(email) == 1
    for row in (*telegram, *email):
        assert "FR-032" in row[-1] and "FR-040" in row[-1]
    # The gateway's egress row points at them, by ID.
    ids = [i for i, r in found.items() if r in (*telegram, *email)]
    assert all(i in found["S2"][1] for i in ids), found["S2"][1]


SPEC_DIR = REPO / "specs" / "000-local-foundations"
PLAN = (SPEC_DIR / "plan.md").read_text(encoding="utf-8")


def plan_row(flow: str) -> list[str]:
    """plan §17's row for a flow: its cells after the flow's name (destination, carries, when, control)."""
    start = PLAN.index("\n## 17. ")
    for line in PLAN[start : PLAN.index("\n## 18. ", start)].splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if cells and cells[0] == flow:
            return cells[1:]
    raise AssertionError(f"plan §17 has no row {flow!r}")


def test_bedrock_and_its_credentials_have_their_rows() -> None:
    # plan §17's two AWS rows (tasks.md T106). A row is a privacy promise, so the plan's own words are in it, each
    # cell's beside the reading the row adds (CLAUDE.md): the destination in From → To, When in Trigger, Carries in
    # Carries, and the control in How to switch it off.
    found = rows()
    for row_id, flow in (
        ("F1", "Bedrock fallback"),
        ("F2", "AWS SSO credential exchange"),
    ):
        destination, carries, when, control = plan_row(flow)
        from_to, trigger, carried, _never, _why, _default, off, fr = found[row_id]
        assert destination in from_to, row_id
        assert when in trigger, row_id
        assert carries in carried, row_id
        assert control in off, row_id
        assert "FR-040" in fr and "FR-022" in fr, row_id
    assert named(found["F1"][0].split("→", 1)[0]) == {"gateway"}
    assert "`bedrock-runtime.us-east-1.amazonaws.com`" in found["F1"][0]
    assert "FR-013" in found["F2"][-1]


def test_the_sso_row_names_the_refresh_until_the_author_decides() -> None:
    # plan §5.2's correction (2026-10-10): the SDK refreshes the SSO token in memory in its last 5 minutes, through
    # oidc.us-east-1.amazonaws.com, while prod runs. T102 keeps that default until the Author decides, so the row
    # names the host both at login and while running, and says the decision could narrow it to login only.
    from_to = rows()["F2"][0]
    assert "`oidc.us-east-1.amazonaws.com`" in from_to
    assert "at login, and while running" in from_to
    assert "T102" in from_to and "login only" in from_to
    assert "last 5 minutes" in from_to


def test_bedrocks_region_is_the_one_routing_must_name() -> None:
    # contracts/config-files.md §1.1: `region` must be "the region the data-flow disclosure lists" (rule R7), so the
    # contract's region, and any bedrock-converse adapter's in config/routing.yaml, is the host F1 names.
    config_files = (SPEC_DIR / "contracts" / "config-files.md").read_text(
        encoding="utf-8"
    )
    (region,) = re.findall(
        r"\| `region` \| string \| `([a-z0-9-]+)`, the region the data-flow disclosure lists",
        config_files,
    )
    routing = yaml.safe_load(
        (REPO / "config" / "routing.yaml").read_text(encoding="utf-8")
    )
    regions = {region} | {
        adapter["region"]
        for adapter in routing["adapters"].values()
        if adapter.get("type") == "bedrock-converse"
    }
    assert regions == {"us-east-1"}
    assert f"`bedrock-runtime.{region}.amazonaws.com`" in rows()["F1"][0]


def test_the_gateways_egress_row_points_at_the_aws_rows() -> None:
    trigger = rows()["S2"][1]
    assert "F1" in trigger and "F2" in trigger
    assert "get their rows with the code that calls them" not in trigger


def test_the_stand_ins_rows_point_at_the_probes() -> None:
    for row_id in ("S12", "S13"):
        assert "(S11)" in rows()[row_id][1]


def test_the_telegram_row_carries_what_an_operator_actions_alert_does() -> None:
    # contracts/alerts.md §3: "The headline names the action and the actor's fingerprint, never the reason". The row
    # that lists what leaves names it too (round 1's review).
    alerts = (
        REPO / "specs" / "000-local-foundations" / "contracts" / "alerts.md"
    ).read_text(encoding="utf-8")
    assert "operator #<8 hex>" in alerts
    carries = rows()["A1"][2]
    assert "`operator #<8 hex>`" in carries and "fingerprint" in carries


def test_the_telegram_row_says_what_puts_dev_back_on_the_stand_ins() -> None:
    # "success or not" doesn't hold for a run killed outright: the row says which ends put dev back, and what does
    # when the run can't (round 1's review).
    off = rows()["A1"][6]  # how to switch it off
    assert "success or not" not in off
    assert "SIGKILL" in off and "`make up ENV=dev`" in off


# plan §17's flows, each with the row that discloses it (tasks.md T110). A flow the plan adds fails here until it has
# its row, and a row's ID can't vanish from the file.
PLAN_FLOWS = {
    "Bedrock fallback": "F1",
    "AWS SSO credential exchange": "F2",
    "Telegram alerts": "A1",
    "Email alerts": "A2",
    "Image pulls": "P1",
    "Image builds": "P2",
    "Model downloads": "P3",
    "Third-party phone-homes": "H1",
    "Development time: Claude Code": "D1",
    "Development time: the engine's proxied pulls": "E1",
    "The Author's browser": "B1",
    "The devcontainer build": "D2",
    "`make tools`": "D3",
}
# The rows T110 adds, which carry the plan's words in their cells as F1 and F2 do.
T110_ROWS = {
    "D1": "Development time: Claude Code",
    "D2": "The devcontainer build",
    "D3": "`make tools`",
}


def plan_flows() -> list[str]:
    """The Flow cell of every row of plan §17's table."""
    start = PLAN.index("\n## 17. ")
    flows = []
    for line in PLAN[start : PLAN.index("\n## 18. ", start)].splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if (
            line.startswith("| ")
            and len(cells) == 5
            and cells[0] != "Flow"
            and not cells[0].startswith("---")
        ):
            flows.append(cells[0])
    return flows


def test_every_flow_plan_17_lists_has_its_row() -> None:
    flows = plan_flows()
    assert len(flows) >= 13  # not vacuous: the table parses
    assert sorted(flows) == sorted(PLAN_FLOWS)
    found = rows()
    assert [PLAN_FLOWS[f] for f in flows if PLAN_FLOWS[f] not in found] == []


def test_the_rows_t110_adds_keep_plan_17s_words() -> None:
    # As for F1 and F2: a row is a privacy promise, so the plan's own words are in it, each cell's beside the reading
    # the row adds (CLAUDE.md): the destination in From → To, When in Trigger, Carries in Carries, and the control in
    # How to switch it off.
    found = rows()
    for row_id, flow in T110_ROWS.items():
        destination, carries, when, control = plan_row(flow)
        from_to, trigger, carried, never, why, default, off, fr = found[row_id]
        assert destination in from_to, row_id
        assert when in trigger, row_id
        assert carries in carried, row_id
        assert control in off, row_id
        assert "FR-040" in fr, row_id
        assert all((never, why, default)), row_id


def test_the_claude_code_row_names_what_keeps_secrets_out_of_a_session() -> None:
    # The plan's control is "the sandbox, the deny lists": the row says what they keep out, by the requirement and the
    # contract that list it, and that the stack itself never calls Anthropic.
    from_to, _trigger, _carried, never, _why, default, _off, fr = rows()["D1"]
    assert "FR-007" in never and "contracts/env-files.md §8" in never
    assert "FR-037" in fr and "FR-007" in fr
    assert "Claude Code" in from_to
    assert "never" in default.lower()


def test_the_claude_code_row_lists_its_default_reporting_and_its_switch() -> None:
    # FR-040 covers "any telemetry or update checks that third-party services send by default, which the plan
    # switches off or lists". Claude Code's own operational metrics and error reports are such a flow until the
    # closing patch sets the two variables that stop them. D1 lists the flow, names both variables and the patch,
    # and leaves no open question, and plan §17's row names both too (US6's review, finding 4).
    spec = (SPEC_DIR / "spec.md").read_text(encoding="utf-8")
    assert (
        "telemetry or update checks that third-party services send by default" in spec
    )
    row = rows()["D1"]
    from_to, _trigger, _carried, _never, _why, _default, off, _fr = row
    _destination, plan_carries, _when, plan_control = plan_row(
        "Development time: Claude Code"
    )
    for variable in ("`DISABLE_TELEMETRY`", "`DISABLE_ERROR_REPORTING`"):
        for name, cell in (
            ("From → To", from_to),
            ("How to switch it off", off),
            ("plan §17's control", plan_control),
        ):
            assert variable in cell, (variable, name)
    for name, cell in (("From → To", from_to), ("plan §17's carries", plan_carries)):
        assert "operational metrics and error reports" in cell, name
    assert "T117" in from_to and "`env`" in from_to
    assert "to confirm for the pinned version" in from_to
    assert not any("open question" in cell for cell in row)


def test_the_devcontainer_row_names_every_registry_its_build_reaches() -> None:
    # .devcontainer/Dockerfile's bases come from the registries its FROM lines name, and devcontainer.json runs
    # make setup (npm ci) when it opens: the row names each.
    dockerfile = (REPO / ".devcontainer" / "Dockerfile").read_text(encoding="utf-8")
    registries = set(
        re.findall(r"^FROM ([a-z0-9.-]+\.[a-z]+)/", dockerfile, re.MULTILINE)
    )
    assert registries == {"public.ecr.aws", "ghcr.io"}
    from_to = rows()["D2"][0]
    assert all(f"`{r}`" in from_to for r in registries), registries
    assert (
        "`pkg-containers.githubusercontent.com`" in from_to
    )  # ghcr.io's blobs, as P1 says
    devcontainer = (REPO / ".devcontainer" / "devcontainer.json").read_text(
        encoding="utf-8"
    )
    assert '"postCreateCommand": "make setup"' in devcontainer
    assert "`make setup`" in from_to and "`npm ci --ignore-scripts`" in from_to


def test_the_devcontainer_row_names_the_gates_own_npm_ci() -> None:
    # The gate's container phase runs npm ci in the devcontainer image, with the network, on every run but --host's
    # (tools/gates/gate's prepare). D2 names the command as the gate runs it, read from the gate, and the registry it
    # reaches (US6's review).
    gate = (REPO / "tools" / "gates" / "gate").read_text(encoding="utf-8")
    (argv,) = re.findall(r'\["npm", "ci", ([^\]]*)\]', gate)
    flags = re.findall(r'"(--[a-z-]+)"', argv)
    assert "--ignore-scripts" in flags
    from_to, trigger, _carried, never, _why, _default, _off, _fr = rows()["D2"]
    assert f"`npm ci {' '.join(flags)}`" in from_to
    assert "`registry.npmjs.org`" in from_to and "`--host`" in from_to
    assert "npm ci" in trigger and "the gate's" in never


def test_the_make_tools_row_says_what_install_tools_does() -> None:
    # tools/gates/install-tools.sh: Node through nvm, pytest through uv without the requirements file's hashes, the
    # gitleaks image from ghcr.io, and the lint toolchain with npm's audit and funding checks off.
    script = (REPO / "tools" / "gates" / "install-tools.sh").read_text(encoding="utf-8")
    assert "nvm install" in script and "uv tool install --no-config" in script
    comments = " ".join(
        line.strip().removeprefix("#").strip()
        for line in script.splitlines()
        if line.strip().startswith("#")
    )
    assert "uv doesn't check that file's hashes on this path" in comments
    assert "ghcr.io/gitleaks/gitleaks" in script and "--no-audit --no-fund" in script
    from_to, _trigger, _carried, never, _why, _default, off, _fr = rows()["D3"]
    assert "`tools/gates/install-tools.sh`" in from_to
    assert "`pkg-containers.githubusercontent.com`" in from_to
    assert "`--no-audit --no-fund`" in never
    assert "without checking its hashes" in off


def test_the_disclosure_closes_with_fr_040s_sentence() -> None:
    spec = (SPEC_DIR / "spec.md").read_text(encoding="utf-8")
    assert "No visitor data flows in this spec." in spec
    assert TEXT.rstrip().splitlines()[-1] == "No visitor data flows in this spec."
    assert "aren't here yet" not in TEXT  # the intro no longer waits for rows


def test_security_md_links_the_disclosure() -> None:
    security = (REPO / "SECURITY.md").read_text(encoding="utf-8")
    assert "](docs/data-flow-disclosure.md)" in security
