"""Tests for evals/sc017_ec2_routes.py, SC-017's harness (spec 001 tasks.md T085, T090; FR-067, FR-068; SC-017;
contracts/env-cloud.md §4), against stand-ins for both paid APIs.

SC-017: on EC2's stack, with both paid APIs healthy, 100% of answered turns come from the Anthropic adapter; with it
failing, 100% of admitted turns come from Bedrock; `fallback_day` is unchanged in both; and every answered turn
carries provider, model, tokens, and cost, as its span and its ledger row do.

The stand-in gateway here routes as EC2's route does, first then second, each metered, from the routing file the
harness reads: the fixture with EC2's line until the Author's line is in config/routing.yaml (ADR 0041). The
gateway's own order is its vitest suite's (services/gateway/test/unit/routes-per-host.test.ts); this proves the
harness reads a run as SC-017 counts it, and refuses one that misses.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
SPEC = importlib.util.spec_from_file_location("sc017", HERE / "sc017_ec2_routes.py")
assert SPEC and SPEC.loader
sc = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = sc
SPEC.loader.exec_module(sc)

FIXTURE = HERE / "fixtures" / "routing" / "schema2-ec2-first-anthropic.yaml"


class StandIn:
    """A paid API: healthy, or failing as the Anthropic API's outage would."""

    def __init__(self, provider: str, model: str, cost: int) -> None:
        self.provider, self.model, self.cost = provider, model, cost
        self.failing = False
        self.calls = 0

    def answer(self) -> dict | None:
        self.calls += 1
        if self.failing:
            return None
        return {
            "provider": self.provider,
            "model": self.model,
            "usage": {"input_tokens": 71, "output_tokens": 14},
            "cost_micro_usd": self.cost,
        }


class Gateway:
    """EC2's route as the gateway takes it: the first paid adapter, then the second, each metered, never the
    fallback's sub-budget."""

    def __init__(self, route: dict[str, str], adapters: dict[str, StandIn]) -> None:
        self.order = [route["first"], route["second"]]
        self.adapters = adapters
        self.fallback_day = 300_000
        self.day = 0
        self.day_ceiling = 1_000_000
        self.ledger: list[dict] = []
        self.spans: list[dict] = []

    def hello(self, i: int) -> dict:
        for role, name in zip(("first", "second"), self.order):
            got = self.adapters[name].answer()
            if got is not None:
                row = {
                    **got,
                    "route": role,
                    "attribution": "metered",
                    "host": "ec2",
                    "request_id": f"r{i}",
                }
                self.ledger.append(row)
                self.day += got["cost_micro_usd"]
                self.spans.append({"gen_ai.provider.name": got["provider"], **row})
                return {"status": 200, **row}
        return {"status": 503, "error": "degraded", "cause": "fallback_unavailable"}

    def status(self) -> dict:
        # GET /admin/status's own shape (services/gateway/src/routes/admin.ts, meterReport): the meters under `meters`.
        # The stand-in had `fallback_day` at the top, where the gateway puts nothing (group 7's review A, I-G).
        return {
            "meters": {
                "day": {
                    "spent_micro_usd": self.day,
                    "ceiling_micro_usd": self.day_ceiling,
                },
                "month": {
                    "spent_micro_usd": self.day,
                    "ceiling_micro_usd": 20_000_000,
                },
                "fallback_day": {"spent_micro_usd": self.fallback_day},
            }
        }


def world(route_file: Path = FIXTURE) -> tuple[Gateway, StandIn, StandIn]:
    route = sc.ec2_route(route_file)
    anthropic = StandIn("anthropic", "claude-haiku-5-5", 120)
    bedrock = StandIn("aws.bedrock", "us.anthropic.claude-haiku-5-5", 120)
    return (
        Gateway(route, {"anthropic": anthropic, "bedrock": bedrock}),
        anthropic,
        bedrock,
    )


def test_ec2s_route_is_read_from_the_routing_file() -> None:
    assert sc.ec2_route(FIXTURE) == {"first": "anthropic", "second": "bedrock"}
    # The fixture stands in until the Author's line is in config/routing.yaml (ADR 0041; tasks.md T095).
    assert sc.routing_file(REPO) in (REPO / "config" / "routing.yaml", FIXTURE)


def test_with_both_healthy_every_answered_turn_is_the_anthropic_adapters() -> None:
    gateway, anthropic, _ = world()
    report = sc.run(
        gateway, turns=100, fail_first=lambda: setattr(anthropic, "failing", True)
    )
    assert report["healthy"]["answered"] == 100
    assert report["healthy"]["by_provider"] == {"anthropic": 100}
    assert sc.score(report) == []


def test_with_the_anthropic_api_failing_every_admitted_turn_is_bedrocks() -> None:
    gateway, anthropic, bedrock = world()
    report = sc.run(
        gateway, turns=100, fail_first=lambda: setattr(anthropic, "failing", True)
    )
    assert report["failing"]["admitted"] == 100
    assert report["failing"]["by_provider"] == {"aws.bedrock": 100}
    assert bedrock.calls == 100


def test_fallback_day_is_unchanged_and_every_turn_carries_its_cost() -> None:
    gateway, anthropic, _ = world()
    report = sc.run(
        gateway, turns=100, fail_first=lambda: setattr(anthropic, "failing", True)
    )
    assert report["fallback_day"] == (300_000, 300_000, 300_000)
    for turn in report["turns"]:
        assert sc.attributes_missing(turn) == []
    assert all(row["attribution"] == "metered" for row in gateway.ledger)
    assert len(gateway.spans) == len(gateway.ledger) == 200


@pytest.mark.parametrize(
    "defect", ["bedrock-first", "sub-budget", "no-cost", "not-failed-over"]
)
def test_the_score_refuses_a_run_that_misses(defect: str) -> None:
    gateway, anthropic, _ = world()
    if defect == "bedrock-first":
        gateway.order = ["bedrock", "anthropic"]
    if defect == "not-failed-over":
        gateway.order = ["anthropic"]
    hello = gateway.hello

    def spending(i: int) -> dict:
        got = hello(i)
        if defect == "sub-budget":
            gateway.fallback_day += 100
        if defect == "no-cost" and got.get("status") == 200:
            got = {k: v for k, v in got.items() if k != "cost_micro_usd"}
        return got

    gateway.hello = spending  # type: ignore[method-assign]
    report = sc.run(
        gateway, turns=10, fail_first=lambda: setattr(anthropic, "failing", True)
    )
    assert sc.score(report), defect


def test_the_live_run_is_the_authors() -> None:
    # Its paid calls are his, from his terminal (tasks.md T097; quickstart §7, step 4).
    assert sc.main(["--base", "http://127.0.0.1:1"], env={"SANDBOX_RUNTIME": "1"}) == 2


# ----------------------------------------------------------------------------------------------------------------------
# Group 7's review A, I-G: the score counts every admitted turn, a throttled one against the run; the ceilings from the
# status; and a failing phase that works on EC2, whose gateway reads the env file only when it is created.


def test_a_throttled_turn_leaves_the_run_short_and_fails_it() -> None:
    gateway, anthropic, _ = world()
    hello = gateway.hello

    def throttled(i: int) -> dict:
        return {"status": 429, "error": "client_cap_exceeded"} if i % 100 else hello(i)

    gateway.hello = throttled  # type: ignore[method-assign]
    report = sc.run(
        gateway, turns=100, fail_first=lambda: setattr(anthropic, "failing", True)
    )
    assert report["healthy"]["admitted"] == 1
    assert [f for f in sc.score(report) if "throttled" in f]


def test_an_admitted_turn_that_isnt_answered_fails_the_run() -> None:
    gateway, anthropic, _ = world()
    hello = gateway.hello

    def once_degraded(i: int) -> dict:
        if i == 150:
            return {"status": 503, "error": "degraded", "cause": "fallback_unavailable"}
        return hello(i)

    gateway.hello = once_degraded  # type: ignore[method-assign]
    report = sc.run(
        gateway, turns=100, fail_first=lambda: setattr(anthropic, "failing", True)
    )
    assert report["failing"]["admitted"] == 100 and report["failing"]["answered"] == 99
    assert [f for f in sc.score(report) if "failing" in f]


def test_a_crossed_ceiling_fails_the_run() -> None:
    gateway, anthropic, _ = world()
    gateway.day_ceiling = 1_000
    report = sc.run(
        gateway, turns=100, fail_first=lambda: setattr(anthropic, "failing", True)
    )
    assert [f for f in sc.score(report) if "ceiling" in f]


def test_the_turns_are_paced_under_the_per_client_cap() -> None:
    # config/budgets.yaml's per_client: 20 a minute, a burst of 5; 200 turns at once would be throttled.
    gateway, anthropic, _ = world()
    slept: list[float] = []
    sc.run(
        gateway,
        turns=10,
        fail_first=lambda: setattr(anthropic, "failing", True),
        sleep=slept.append,
    )
    assert len(slept) == 20 and all(s >= 60 / 20 for s in slept)


def ec2_state(tmp_path: Path) -> tuple[Path, Path, Path, Path]:
    state = tmp_path / "deploy"
    commit = "c" * 40
    tree = state / "trees" / commit
    (tree / "deploy").mkdir(parents=True)
    (tree / "deploy" / "compose.yaml").write_text("services: {}\n", encoding="utf-8")
    release_env = state / "releases" / "r1.env"
    release_env.parent.mkdir(parents=True)
    release_env.write_text("H4_RELEASE=r1\n", encoding="utf-8")
    (state / "current.json").write_text(
        f'{{"release": "r1", "commit": "{commit}"}}', encoding="utf-8"
    )
    env_file = tmp_path / "ec2.env"
    env_file.write_text(
        "H4_HOST=ec2\nGATEWAY_ANTHROPIC_API_KEY=the-real-one\nSMTP_PORT=465\n",
        encoding="utf-8",
    )
    env_file.chmod(0o600)
    return state, tree, release_env, env_file


def test_the_failing_phase_refuses_the_key_and_recreates_the_gateway_then_restores(
    tmp_path: Path,
) -> None:
    state, tree, release_env, env_file = ec2_state(tmp_path)
    ran: list[tuple[list[str], dict]] = []

    def runner(argv: list[str], **kwargs: object) -> int:
        ran.append((list(argv), dict(kwargs)))
        return 0

    key = sc.Ec2Key(env_file, state, runner)
    key.refuse()
    # The deployer holds while the run does, so its minute's check never brings the real key back mid-phase.
    assert (state / "hold").is_file()
    copy = key.refused_env
    assert copy.stat().st_mode & 0o777 == 0o600
    lines = copy.read_text(encoding="utf-8").splitlines()
    assert "GATEWAY_ANTHROPIC_API_KEY=the-real-one" not in lines
    assert [ln for ln in lines if ln.startswith("GATEWAY_ANTHROPIC_API_KEY=")] == [
        f"GATEWAY_ANTHROPIC_API_KEY={sc.REFUSED_KEY}"
    ]
    assert "H4_HOST=ec2" in lines and "SMTP_PORT=465" in lines
    assert "the-real-one" in env_file.read_text(encoding="utf-8")
    up = [
        "docker",
        "compose",
        "-f",
        str(tree / "deploy" / "compose.yaml"),
        "--env-file",
        str(copy),
        "--env-file",
        str(release_env),
        "up",
        "-d",
        "--no-deps",
        "--force-recreate",
        "--wait",
        "gateway",
    ]
    assert ran[0][0] == up
    assert ran[0][1]["env"]["H4_TREE"] == str(tree)
    key.restore()
    back = list(up)
    back[back.index(str(copy))] = str(env_file)
    assert ran[1][0] == back
    assert not copy.exists() and not (state / "hold").exists()


def test_a_hold_the_author_made_stays_after_the_run(tmp_path: Path) -> None:
    state, _, _, env_file = ec2_state(tmp_path)
    (state / "hold").write_text("the Author\n", encoding="utf-8")
    key = sc.Ec2Key(env_file, state, lambda argv, **k: 0)
    key.refuse()
    key.restore()
    assert (state / "hold").read_text() == "the Author\n"


def test_a_failed_recreate_stops_the_run(tmp_path: Path) -> None:
    state, _, _, env_file = ec2_state(tmp_path)
    key = sc.Ec2Key(env_file, state, lambda argv, **k: 1)
    with pytest.raises(RuntimeError):
        key.refuse()
