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
                self.spans.append({"gen_ai.provider.name": got["provider"], **row})
                return {"status": 200, **row}
        return {"status": 503, "error": "degraded", "cause": "fallback_unavailable"}

    def status(self) -> dict:
        return {"fallback_day": {"spent_micro_usd": self.fallback_day}}


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
