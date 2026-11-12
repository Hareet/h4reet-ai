"""docs/data-flow-disclosure.md against the code whose flows it lists (spec 000 FR-040; plan §17; tasks.md T083, T106,
T110).

The compose policy already requires a row for every service (tools/gates/compose_policy.py). These hold rows to what
the code does: the breach probe's row names exactly the services evals/breach_probe.py and spec 001's measurement load,
which runs in the probe, call; and the alerts' rows name the Telegram Bot API and the alerts mailbox, which the
gateway's egress row points at. Bedrock's two rows keep
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


def rows(text: str = TEXT) -> dict[str, list[str]]:
    """Each table row by its ID: its cells, the From → To first."""
    found = {}
    for line in text.splitlines():
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
    """Every host a URL in breach_probe.py's source names, constant or not, and those its module constants hold; and,
    since the probe's image holds it too, the hosts spec 001's measurement load calls (deploy/scripts/measure_load.py)."""
    source = (REPO / "evals" / "breach_probe.py").read_text(encoding="utf-8")
    source += (REPO / "deploy" / "scripts" / "measure_load.py").read_text(
        encoding="utf-8"
    )
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
    # contract that list it, and that the stack never calls Anthropic as a session: since spec 010, its only calls to
    # Anthropic are F3's, prod's gateway with its own key.
    from_to, _trigger, _carried, never, _why, default, _off, fr = rows()["D1"]
    assert "FR-007" in never and "contracts/env-files.md §8" in never
    assert "FR-037" in fr and "FR-007" in fr
    assert "Claude Code" in from_to
    assert "never" in default.lower()
    assert "F3" in default and "calls no Anthropic endpoint" not in default


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


def test_spec_000s_part_closes_with_fr_040s_sentence() -> None:
    # Spec 000's part ends with it, and stays so: a later spec's flows go in a section of their own after it
    # (specs/002-the-room/plan.md §8), so the sentence speaks for spec 000's rows alone.
    spec = (SPEC_DIR / "spec.md").read_text(encoding="utf-8")
    assert "No visitor data flows in this spec." in spec
    spec_000, *later = TEXT.split("\n## ")
    assert spec_000.rstrip().splitlines()[-1] == "No visitor data flows in this spec."
    assert [section.splitlines()[0] for section in later] == [
        "Spec 002: the room",
        "Spec 010: the Anthropic API",  # spec 010, FR-038 (its plan, D12)
        "Spec 001: the cloud",  # spec 001, FR-040 (its plan §8.3; tasks.md T026)
    ]
    assert "aren't here yet" not in TEXT  # the intro no longer waits for rows


def test_the_rooms_rows_are_in_its_own_section_with_the_specs_words() -> None:
    # specs/002-the-room/spec.md's Data-Flow Disclosure Entries give V1's Carries, Never carries, and Why; the
    # web service has its row, as every service does (tools/gates/compose_policy.py's disclosure rule). Spec 009's
    # Amendment M6 added the avatar files to V1's Carries, after spec 002's words; spec 016's Amendment M17 (its
    # FR-053) puts its own avatar files in their place, and adds to V1's Trigger and Why, in its own words (changed
    # with T073, specs/016-the-twins-own-avatar/plan.md R-18).
    room = TEXT.split("\n## Spec 002: the room\n", 1)[1]
    assert "| S14 | `web` →" in room and "| V1 |" in room
    spec = (REPO / "specs" / "002-the-room" / "spec.md").read_text(encoding="utf-8")
    (entry,) = [ln for ln in spec.splitlines() if ln.startswith("| V1 |")]
    _, _, carries, never, why = [c.strip() for c in entry.strip().strip("|").split("|")]
    amended = (REPO / "specs" / "016-the-twins-own-avatar" / "spec.md").read_text(
        encoding="utf-8"
    )
    (m17,) = [
        ln for ln in amended.splitlines() if ln.startswith("| V1, amended (M17) |")
    ]
    cells = [c.strip() for c in m17.strip().strip("|").split("|")]
    trigger = re.fullmatch(r"as before, (and following .*)", cells[2])
    files = re.fullmatch(r"as before, with (the avatar files now: .*)", cells[3])
    reason = re.fullmatch(
        r"as before: the room's static assets and pages; (.*)", cells[5]
    )
    assert trigger and files and reason, (
        "spec 016's M17 doesn't read as this test reads it"
    )
    _from_to, row_trigger, row_carries, row_never, row_why, *_ = rows()["V1"]
    assert (row_carries, row_never, row_why) == (
        f"{carries}, and {files.group(1)}",
        never,
        f"{why}; {reason.group(1)}",
    )
    assert row_trigger.endswith(f", {trigger.group(1)}")
    assert named(rows()["S14"][0].split("→", 1)[0]) == {"web"}


# Spec 001 group 7 (its tasks.md T092; its spec.md, "Data-Flow Disclosure Entries"): EC2's parts of S2, F1, F3, A1,
# A2, D1, V2, and C7, each added after the earlier specs' words, which stay as they were; and F3's adopted words,
# untouched. before_group_7 gives the rows as they read before it, which the earlier specs' checks hold to their words.
GROUP_7_ADDS = {
    (
        "S2",
        0,
    ): "On EC2 (spec 001), the same, through the instance's egress allowlist (spec 001, FR-051), which admits only the destinations listed in their own rows: every TLS connection the gateway opens goes to EC2's gateway proxy, which admits only the names row C18 lists.",
    (
        "S2",
        1,
    ): "On EC2: F3 first, then F1. On prod, on either host: the shared state, C2.",
    (
        "S2",
        6,
    ): "On EC2, stop EC2. The laptop's `egress` network still has no destination allowlist, the Author's open decision.",
    (
        "A1",
        0,
    ): "(spec 001) and EC2's `gateway`, while EC2 serves, through EC2's gateway proxy (C18).",
    (
        "A2",
        0,
    ): "(spec 001) and EC2's `gateway`, while EC2 serves, on 465 with implicit TLS alone, through EC2's gateway proxy, which admits the env file's `SMTP_HOST` there and nothing else (C18).",
    (
        "F1",
        1,
    ): "On EC2 (spec 001), as its second route, when the Anthropic API can't answer, inside the $5 daily and $20 monthly ceilings, with no sub-budget, attributed `metered`. EC2's credentials come from its instance role, not F2's session: its credential timer assumes `h4-prod-gateway`, the one role EC2's gateway calls Bedrock as, which EC2's model action can revoke (spec 001, FR-023), and the call leaves through EC2's gateway proxy (C18).",
    (
        "V2",
        4,
    ): "On EC2, prod's default host, there is no local model: every turn goes to the Anthropic API first (F3), and to Bedrock (F1) when it can't answer. In the Author's words: \"On the ec2 server, anthropic api will answer first.\" (2026-11-09; spec 001)",
    ("V2", 5): "On EC2, every turn the meter admits is a paid call.",
    ("V2", 6): "Stop EC2 and set its autostart switch off (spec 001, FR-065).",
    (
        "F3",
        1,
    ): "On EC2 (spec 001): every `POST /hello` and room turn that the kill switch and admission let through, inside the ceilings and the adapter's monthly cap, with no local model before it and no sub-budget; and the health check, once a minute while EC2 runs.",
    (
        "F3",
        5,
    ): "On EC2 (spec 001): on, once its route names the Anthropic API first, the Author's line in `config/routing.yaml`, which waits on his price, his cap, his key, and his words in this row (spec 010, FR-002 and FR-039; spec 001, FR-068).",
    (
        "F3",
        6,
    ): "On EC2, change its route, or stop EC2. On EC2 the meter's bound is the $5 daily and $20 monthly ceilings and the adapter's cap; $2 of fallback a day stays the laptop's.",
    (
        "C7",
        0,
    ): "On EC2 (group 7): its deployer reads the release bucket at each boot, before its stack starts, and each minute; pulls its images from ECR by digest, each upstream one as the account's copy; reads its secrets from Parameter Store at boot (`write_env.py`); assumes `h4-prod-gateway` through STS for its gateway; and is reached by the Author through Systems Manager alone; each through its egress proxy (C18). The laptop's release record stays in the Author's own release directory, `~/.local/state/h4reet/releases/`, and nothing leaves it.",
    (
        "C7",
        2,
    ): "On EC2, the instance role's signed requests, and the gateway role's short-lived credentials back.",
}
GROUP_7_CHANGES = {
    ("S2", 2): (
        "what A1, A2, F1, F2, and F3 say",
        "what A1, A2, C2, F1, F2, and F3 say (F2 on the laptop only)",
    ),
    ("D1", 5): (
        (
            "the stack's only calls to Anthropic are F3's, prod's gateway with its own key, while prod's route names "
            "the Anthropic API (spec 010)"
        ),
        (
            "the stack's only calls to Anthropic are F3's, prod's gateway with its own key: on EC2 always, and on the "
            "laptop while its route names the Anthropic API (spec 010; spec 001)"
        ),
    ),
}


def before_group_7(found: dict[str, list[str]]) -> dict[str, list[str]]:
    out = {rid: list(cells) for rid, cells in found.items()}
    for (rid, i), text in GROUP_7_ADDS.items():
        assert out[rid][i].endswith(f" {text}"), (rid, i)
        out[rid][i] = out[rid][i][: -len(text) - 1]
    for (rid, i), (old, new) in GROUP_7_CHANGES.items():
        assert new in out[rid][i], (rid, i)
        out[rid][i] = out[rid][i].replace(new, old, 1)
    return out


def test_group_7s_ec2_parts_stand_beside_the_earlier_words_and_f3s_adopted_words_are_untouched() -> (
    None
):
    found = rows()
    before = before_group_7(found)
    assert found["F3"][0] == before["F3"][0]
    assert all("EC2" in text for text in GROUP_7_ADDS.values())
    # The spec's own sentences for V2, which its entries give word for word.
    assert found["V2"][5].endswith(
        "On EC2, every turn the meter admits is a paid call."
    )
    assert found["V2"][6].endswith(
        "Stop EC2 and set its autostart switch off (spec 001, FR-065)."
    )


def spec_007_entry(row_id: str) -> list[str]:
    """specs/007-twin-conversation/spec.md's Data-Flow Disclosure Entries row: its eight cells."""
    spec = (REPO / "specs" / "007-twin-conversation" / "spec.md").read_text(
        encoding="utf-8"
    )
    (entry,) = [ln for ln in spec.splitlines() if ln.startswith(f"| {row_id} (")]
    return [c.strip() for c in entry.strip().strip("|").split("|")]


def test_the_twins_turn_has_row_v2_in_spec_007s_words() -> None:
    # Spec 007 (FR-047; spec 002 FR-058; spec 004's RL4): the turn's row, in the room's section, with the spec's own
    # From → To, Trigger, Carries, Never carries, Why, Default, and How to switch it off, written with the change that
    # serves the route. Its Carries names the turn's estimated cost and its route, which RL4 reads before it lets the
    # scene's live.turn be site.
    room = TEXT.split("\n## Spec 002: the room\n", 1)[1]
    assert "| V2 |" in room
    entry = spec_007_entry("V2")
    row = before_group_7(rows())["V2"]
    # Spec 010's Amendment 7-5: its Why is spec 007's words, then spec 010's sentence; the other cells unchanged.
    assert row[:4] == entry[1:5] and row[5:7] == entry[6:8]
    assert row[4] == f"{entry[5]}. {v2_sentence()}"
    assert "estimated cost" in row[2] and "route" in row[2]
    assert "Rows V2, V3, and V5" not in room
    assert "Rows V3 and V5 come with the work that creates each flow." in room


def test_row_f1_adds_spec_007s_turn_to_its_own_words() -> None:
    # Spec 007 (FR-048): F1 keeps its words and adds the room turn and the Author's evaluation calls, in spec 007's.
    entry = spec_007_entry("F1")
    f1 = rows()["F1"]
    added = {
        1: entry[2].removeprefix("as before, and: "),
        2: entry[3].removeprefix("as before, and for a room turn: "),
        3: entry[4].removeprefix("as before (anything that names who asked); and "),
        4: entry[5].removeprefix("as before, and "),
        6: entry[7].removeprefix("as before; and "),
    }
    for column, words in added.items():
        assert words in f1[column], column
    assert "spec 007 FR-048" in f1[-1]


def test_security_md_links_the_disclosure() -> None:
    security = (REPO / "SECURITY.md").read_text(encoding="utf-8")
    assert "](docs/data-flow-disclosure.md)" in security


# Spec 001 (FR-040; its plan §8.3): its rows go in a section of their own, each in the commit that creates its flow.
# Group 3 (tasks.md T026, in T023's commit) adds C8's email half, AWS's budgets and anomaly monitor to the alerts
# mailbox through SNS's email subscription on h4-alerts, and C9, the Author's terminal to AWS's APIs. Group 4 (T036, in
# T034's commit) adds C8's Telegram half, through the alert bridge, C10, the Author's releases to the account's
# registry and release bucket, and C11, the uptime probe; and F2's change, the laptop's sts:AssumeRole on
# h4-laptop-bedrock.
SPEC_001 = REPO / "specs" / "001-cloud-elevation" / "spec.md"


def spec_001_entry(row_id: str) -> list[str]:
    """The row of specs/001-cloud-elevation/spec.md's "New rows" table: its eight cells, the ID first."""
    new_rows = SPEC_001.read_text(encoding="utf-8").split("\n### New rows\n", 1)[1]
    (entry,) = [ln for ln in new_rows.splitlines() if ln.startswith(f"| {row_id} |")]
    return [c.strip() for c in entry.strip().strip("|").split("|")]


def test_spec_001s_rows_are_in_its_own_section_in_the_specs_words() -> None:
    section = TEXT.split("\n## Spec 001: the cloud\n", 1)[1]
    assert "| C8 |" in section and "| C9 |" in section
    c8, c9 = rows()["C8"], rows()["C9"]
    entry_c8, entry_c9 = spec_001_entry("C8"), spec_001_entry("C9")
    # C9 is the spec's row, word for word, with its FR.
    assert c9[:7] == entry_c9[1:8]
    # C8, both halves since group 4: the spec's From → To, then each path named after it, and its other cells word for
    # word.
    assert (
        entry_c8[1]
        == "AWS's budgets and anomaly monitor → Telegram and the alerts mailbox"
    )
    assert c8[0].startswith(f"{entry_c8[1]}: ")
    assert "`h4-alerts`" in c8[0]
    assert c8[1:7] == entry_c8[2:8]
    assert "spec 001 FR-022" in c8[7] and "spec 001 FR-001" in c9[7]


def test_c8s_telegram_half_names_the_bridge_and_the_bot_api() -> None:
    c8 = rows()["C8"]
    for name in ("h4-alerts", "h4-alert-bridge", "api.telegram.org"):
        assert f"`{name}`" in c8[0], name
    assert "`infra/bootstrap/alerts.tf`" in c8[0]
    assert "`infra/lambdas/alert_bridge/`" in c8[0]
    # What this section adds beside the spec's cells: the bridge's parameters, and the other kinds it forwards.
    section = TEXT.split("\n## Spec 001: the cloud\n", 1)[1]
    assert "`/h4reet/alerts/TELEGRAM_BOT_TOKEN`" in section
    assert "contracts/aws-alerts.md §2" in section


def test_c10_and_c11_keep_the_specs_words() -> None:
    section = TEXT.split("\n## Spec 001: the cloud\n", 1)[1]
    for row_id, where in (
        ("C10", "`infra/account/registry.tf`"),
        ("C11", "`infra/lambdas/probe/`"),
    ):
        assert f"| {row_id} |" in section, row_id
        row, entry = rows()[row_id], spec_001_entry(row_id)
        assert row[0].startswith(f"{entry[1]}: "), row_id
        assert where in row[0], row_id
        assert row[1:7] == entry[2:8], row_id
        assert "spec 001" in row[7], row_id
    # The probe's two requests, and its mark, as infra/lambdas/probe/probe.py makes them.
    c11 = rows()["C11"][0]
    for text in (
        "`GET https://hareet.ai/`",
        "`GET https://hareet.ai/api/status`",
        "`X-H4-Probe: 1`",
    ):
        assert text in c11, text
    # Its schedule is written disabled until group 8 (contracts/aws-alerts.md §5): said beside the spec's "on".
    assert "disabled until group 8" in section


def f2_change() -> str:
    """spec.md's Changed rows: F2's sentence, as it gives it in quotes after "Add: "."""
    changed = SPEC_001.read_text(encoding="utf-8").split("\n### Changed rows\n", 1)[1]
    (line,) = [ln for ln in changed.splitlines() if ln.startswith("| F2 |")]
    cell = [c.strip() for c in line.strip().strip("|").split("|")][2]
    return cell.removeprefix('Add: "').removesuffix('"')


def test_f2_carries_spec_001s_change_in_its_words() -> None:
    sentence = f2_change()
    assert sentence.startswith("The permission set now allows only `sts:AssumeRole`")
    f2 = rows()["F2"]
    assert sentence in f2[0] and sentence in f2[2]
    assert "spec 001 FR-013" in f2[7] and "FR-023" in f2[7]


# Spec 010 (FR-038, FR-039, SC-010; its plan §10, D12): the Anthropic API's row, F3, in a section of its own in the
# spec's words, with S2, D1, and V2 changed as its entries give them; and the placeholder gate, which fails make test
# while prod's route names an anthropic-messages adapter and F3 still holds the marked placeholder for the Author's
# words about what Anthropic keeps.
SPEC_010 = REPO / "specs" / "010-anthropic-provider" / "spec.md"
PLACEHOLDER = "<the Author's words"


def spec_010_entry(row_id: str) -> list[str]:
    """specs/010-anthropic-provider/spec.md's Data-Flow Disclosure Entries row: its eight cells."""
    lines = SPEC_010.read_text(encoding="utf-8").splitlines()
    (entry,) = [ln for ln in lines if ln.startswith(f"| {row_id} (")]
    return [c.strip() for c in entry.strip().strip("|").split("|")]


def v2_sentence() -> str:
    """Spec 010's sentence for V2's Why, from its entry: "as before, and: on prod, …" as "On prod, … (spec 010)"."""
    added = spec_010_entry("V2")[5].removeprefix("as before, and: ")
    return f"{added[0].upper()}{added[1:]} (spec 010)"


def test_the_anthropic_apis_row_is_in_its_own_section_in_the_specs_words() -> None:
    section = TEXT.split("\n## Spec 010: the Anthropic API\n", 1)[1]
    spec = SPEC_010.read_text(encoding="utf-8")
    lead = re.search(r'The new section\'s lead, for the disclosure: "([^"]+)"', spec)
    assert lead, "spec 010's entries don't read as this test reads them"
    assert lead.group(1) in section
    assert "| F3 |" in section
    # The entry's row, the From → To's placeholder aside: F3 holds it, or the Author's words in its place.
    assert f3_departures(TEXT) == []
    assert named(rows()["F3"][0].split("→", 1)[0]) == {"gateway"}


def test_f3s_host_is_the_adapters_own_constant() -> None:
    source = (
        REPO / "services" / "gateway" / "src" / "adapters" / "anthropic-messages.ts"
    ).read_text(encoding="utf-8")
    origin = re.search(r'export const ANTHROPIC_ORIGIN = "https://([^"/]+)"', source)
    assert origin, "the adapter's origin constant isn't where this test reads it"
    assert f"`{origin.group(1)}`" in rows()["F3"][0]


def test_s2_d1_and_v2_change_as_spec_010s_entries_give_them() -> None:
    found = before_group_7(rows())
    s2 = spec_010_entry("S2")
    assert s2[2].removeprefix("as before, and: ") in found["S2"][1]
    assert found["S2"][2] == "what A1, A2, F1, F2, and F3 say"
    d1 = spec_010_entry("D1")
    replacement = re.search(r'becomes "([^"]+)"', d1[6])
    assert replacement, "spec 010's D1 entry doesn't read as this test reads it"
    assert replacement.group(1) in found["D1"][5]
    assert found["V2"][4].endswith(v2_sentence())


def anthropic_routes(routing: dict) -> list[str]:
    """Every place a prod route names an anthropic-messages adapter: schema 1's envs.prod.fallback, and each host
    route's first, second, and fallback in schema 2 (spec 001, tasks.md T069; FR-068)."""
    adapters = routing.get("adapters") or {}
    prod = (routing.get("envs") or {}).get("prod") or {}
    routes = {"envs.prod": prod}
    for host, route in (prod.get("hosts") or {}).items():
        routes[f"envs.prod.hosts.{host}"] = route or {}
    found = []
    for where, route in routes.items():
        for role in ("first", "second", "fallback"):
            adapter = adapters.get(route.get(role)) or {}
            if adapter.get("type") == "anthropic-messages":
                found.append(f"{where}.{role}")
    return found


def placeholder_gate(routing_text: str, disclosure_text: str) -> list[str]:
    """What stops the Anthropic API's route (FR-039): F3's placeholder, while any prod route names
    anthropic-messages."""
    routes = anthropic_routes(yaml.safe_load(routing_text) or {})
    if not routes:
        return []
    (f3,) = [ln for ln in disclosure_text.splitlines() if ln.startswith("| F3 |")]
    from_to = [c.strip() for c in f3.strip().strip("|").split("|")][1]
    if PLACEHOLDER in from_to:
        return [
            (
                f"config/routing.yaml names the Anthropic API at {', '.join(routes)} while F3 holds the placeholder "
                "for the Author's words about what Anthropic keeps (spec 010, FR-039)"
            )
        ]
    return []


def test_the_route_waits_for_the_authors_words_in_f3() -> None:
    # The committed files: while F3 holds the placeholder, prod's route can't name the Anthropic API.
    routing = (REPO / "config" / "routing.yaml").read_text(encoding="utf-8")
    assert placeholder_gate(routing, TEXT) == []


def test_the_placeholder_gate_fails_a_switch_made_before_the_authors_words() -> None:
    # F3 as it reads before T059 is built from spec 010's entry, so this holds whatever the committed F3 says: the
    # committed row keeps the placeholder only until the Author's words replace it (FR-039).
    routing = yaml.safe_load(
        (REPO / "config" / "routing.yaml").read_text(encoding="utf-8")
    )
    assert routing["adapters"]["anthropic"]["type"] == "anthropic-messages"
    before = before_the_authors_words(TEXT)
    assert PLACEHOLDER in rows(before)["F3"][0]
    routing["envs"]["prod"]["fallback"] = "anthropic"
    switched = yaml.safe_dump(routing)
    assert placeholder_gate(switched, before) != []
    assert placeholder_gate(switched, with_the_authors_words(before)) == []


def f3_line(text: str) -> str:
    (line,) = [ln for ln in text.splitlines() if ln.startswith("| F3 |")]
    return line


def before_the_authors_words(text: str) -> str:
    """The disclosure as it reads before T059: F3's From → To as spec 010's entry gives it, the placeholder in place."""
    line = f3_line(text)
    return text.replace(
        line, line.replace(rows(text)["F3"][0], spec_010_entry("F3")[1], 1), 1
    )


def with_the_authors_words(text: str) -> str:
    """The disclosure as T059 leaves it: words of the Author's in place of F3's placeholder, the rest as it was."""
    line = f3_line(text)
    start = line.index(PLACEHOLDER)
    end = line.index(">", start) + 1
    worded = (
        line[:start]
        + "his words, read from Anthropic's commercial terms on a given day"
        + line[end:]
    )
    return text.replace(line, worded, 1)


def f3_departures(text: str) -> list[str]:
    """Where F3 departs from spec 010's entry (FR-038), the placeholder aside: the entry keeps it, and F3 holds it or,
    once T059 writes them, the Author's words in its place (FR-039, SC-010). Nothing else in the row may differ."""
    entry = spec_010_entry("F3")
    row = before_group_7(rows(text))["F3"]
    found = []
    start = entry[1].index(PLACEHOLDER)
    before, after = entry[1][:start], entry[1][entry[1].index(">", start) + 1 :]
    words = row[0][len(before) : len(row[0]) - len(after)]
    if not (
        row[0].startswith(before)
        and row[0].endswith(after)
        and len(row[0]) > len(before) + len(after)
        and words.strip()
    ):
        found.append(
            "F3's From → To isn't spec 010's entry with the placeholder, or words in its place"
        )
    if row[1:7] != entry[2:8]:
        found.append("F3's other cells aren't spec 010's entry")
    if row[7] != (
        "spec 010 FR-038, FR-039; spec 000 FR-021, FR-022, FR-023, FR-030, FR-031, FR-040"
    ):
        found.append("F3's requirements cell isn't spec 010's")
    return found


def test_every_f3_check_passes_once_the_authors_words_replace_the_placeholder() -> None:
    # SC-010's second half: T059's commit, his words in F3 and prod's route on the Anthropic API, passes every F3
    # check, and so does a later switch back to Bedrock that keeps his words (the merge note's "To go back to Bedrock").
    worded = with_the_authors_words(before_the_authors_words(TEXT))
    assert PLACEHOLDER not in rows(worded)["F3"][0]
    assert f3_departures(worded) == []
    routing = yaml.safe_load(
        (REPO / "config" / "routing.yaml").read_text(encoding="utf-8")
    )
    for fallback in ("anthropic", "bedrock"):
        routing["envs"]["prod"]["fallback"] = fallback
        assert placeholder_gate(yaml.safe_dump(routing), worded) == [], fallback


# Spec 011 (FR-051; its plan §12.3): rows A1, A2, S12, and S13 gain the spec's words, each entry cell's addition
# after the row's own words, and `spec 011 FR-051` in their FR cells; no row is added. The existing tests on A1 (the
# fingerprint in its Carries, the SIGKILL in its switch), the alert rows' FRs, and S12's and S13's pointers to S11
# stand above.
SPEC_011 = REPO / "specs" / "011-alert-message-design" / "spec.md"
# The words an entry cell opens with before its addition, longest first.
JOINS = (
    "as before, and (spec 011): ",
    "as before, and: ",
    "as before; and ",
    "as before, and ",
    "as before; ",
)


def spec_011_entry(row_id: str) -> list[str]:
    """specs/011-alert-message-design/spec.md's Data-Flow Disclosure Entries row: its eight cells."""
    lines = SPEC_011.read_text(encoding="utf-8").splitlines()
    (entry,) = [ln for ln in lines if ln.startswith(f"| {row_id} (")]
    return [c.strip() for c in entry.strip().strip("|").split("|")]


def spec_011_addition(row_id: str, column: int) -> str | None:
    """An entry cell's addition, its "as before" and joining words stripped; "as A1" is A1's; None for "as before"."""
    cell = spec_011_entry(row_id)[column]
    if cell == "as before":
        return None
    if cell == "as A1":
        return spec_011_addition("A1", column)
    for join in JOINS:
        if cell.startswith(join):
            return cell.removeprefix(join)
    raise AssertionError(
        f"spec 011's {row_id} entry, column {column}, doesn't read as this test reads it: {cell}"
    )


def test_the_alert_rows_add_spec_011s_words() -> None:
    found = rows()
    checked = 0
    for row_id in ("A1", "A2", "S12", "S13"):
        for column in range(1, 8):
            words = spec_011_addition(row_id, column)
            if words is None:
                continue
            assert words in found[row_id][column - 1], (row_id, column, words)
            checked += 1
        assert "spec 011 FR-051" in found[row_id][-1], row_id
    # A1's trigger, carries, never carries, why, and switch; A2's five; S12's and S13's trigger and carries.
    assert checked == 14
    # No row is added: spec 011's entries change four rows that exist.
    assert {"A1", "A2", "S12", "S13"} <= set(found)


# Spec 001 (tasks.md T062; FR-068; spec 010 FR-039): the gate over every host route of schema 2, and schema 1's
# envs.prod.fallback as before. Each fixture in evals/fixtures/routing/ names the Anthropic API in one place, but the
# last, which names it nowhere.
ROUTING_FIXTURES = REPO / "evals" / "fixtures" / "routing"
NAMES_ANTHROPIC = (
    "schema1-fallback-anthropic.yaml",
    "schema2-laptop-fallback-anthropic.yaml",
    "schema2-ec2-first-anthropic.yaml",
    "schema2-ec2-second-anthropic.yaml",
)


def test_the_placeholder_gate_reads_every_host_route() -> None:
    before = before_the_authors_words(TEXT)
    worded = with_the_authors_words(before)
    for name in NAMES_ANTHROPIC:
        text = (ROUTING_FIXTURES / name).read_text(encoding="utf-8")
        assert placeholder_gate(text, before) != [], name
        assert placeholder_gate(text, worded) == [], name
    clear = (ROUTING_FIXTURES / "schema2-no-anthropic.yaml").read_text(encoding="utf-8")
    assert placeholder_gate(clear, before) == []
    assert placeholder_gate(clear, worded) == []


def test_the_placeholder_gate_names_the_route_it_found() -> None:
    before = before_the_authors_words(TEXT)
    text = (ROUTING_FIXTURES / "schema2-ec2-second-anthropic.yaml").read_text(
        encoding="utf-8"
    )
    (found,) = placeholder_gate(text, before)
    assert "envs.prod.hosts.ec2.second" in found
