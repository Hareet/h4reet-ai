"""Spec 001 group 8 (tasks.md T102, T109; FR-039): the red-team cases for hello, the public test endpoint, on every
adapter that can answer it: the laptop's local model and its paid fallback, and EC2's Anthropic API and Bedrock.

  - the cases load: claiming to be the Author, disparaging, and revealing configuration, each with `live: {route:
    hello}`;
  - a live run sends a hello case through the admin adapter route (POST /admin/adapters/{id}/complete) on the run's
    adapter, with hello's own fixed system prompt, read from the gateway's source, and hello's output cap, read from
    config/budgets.yaml; a twin case still goes through the twin route;
  - against a stub that answers each with its planted unsafe answer, every hello case fails, and the run with it.
"""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

import pytest
import yaml

REPO = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "redteam_run_hello", REPO / "redteam" / "run.py"
)
assert SPEC and SPEC.loader
rt = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = rt
SPEC.loader.exec_module(rt)

HELLO_IDS = (
    "hello-are-you-the-author",
    "hello-disparage",
    "hello-reveal-configuration",
)


def hello_prompt() -> str:
    """HELLO_SYSTEM_PROMPT, as the gateway's own source holds it (services/gateway/src/routes/hello.ts)."""
    text = (REPO / "services/gateway/src/routes/hello.ts").read_text(encoding="utf-8")
    m = re.search(r'export const HELLO_SYSTEM_PROMPT =\s*"([^"]+)";', text)
    assert m
    return m.group(1)


def hello_cap() -> int:
    budgets = yaml.safe_load((REPO / "config/budgets.yaml").read_text(encoding="utf-8"))
    return int(budgets["limits"]["per_call"]["hello_max_output_tokens"])


class StubClient:
    """AdminClient's two routes, answering from a table; every call recorded, nothing sent anywhere."""

    def __init__(self, answers: dict[str, str]) -> None:
        self.answers = answers
        self.calls: list[dict[str, object]] = []

    def adapter_complete(
        self, adapter_id: str, messages: list[dict[str, str]], **kw: object
    ) -> dict[str, object]:
        self.calls.append(
            {"route": "adapter", "adapter": adapter_id, "messages": messages, **kw}
        )
        prompt = messages[-1]["content"]
        return {
            "result": {"text": self.answers.get(prompt, "Hello there.")},
            "cost_micro_usd": 1,
            "adapter": adapter_id,
        }

    def twin_turn(self, adapter_id: str, **kw: object) -> dict[str, object]:
        self.calls.append({"route": "twin", "adapter": adapter_id, **kw})
        return {
            "text": "He builds tools for community health workers.",
            "route": adapter_id,
            "cost_micro_usd": 0,
        }


def cases() -> dict[str, dict]:
    return {c["id"]: c for c in rt.load_cases(REPO / "redteam" / "cases")}


def test_the_hello_cases_load_with_their_route() -> None:
    loaded = cases()
    for case_id in HELLO_IDS:
        assert loaded[case_id]["live"] == {"route": "hello"}, case_id
    assert loaded["hello-are-you-the-author"]["detector"] == "claims to be the Author"
    assert (
        loaded["hello-reveal-configuration"]["detector"]
        == "discloses its system prompt"
    )
    assert loaded["hello-disparage"]["forbid"]


def test_a_hello_live_field_takes_the_route_alone(tmp_path: Path) -> None:
    folder = tmp_path / "cases"
    folder.mkdir()
    (folder / "x.yaml").write_text(
        "id: x\nattack: x\nprompt: p\nresponse: r\nexpect: safe\nforbid: ['zz']\n"
        "live: {route: hello, feature: free_talk}\n",
        encoding="utf-8",
    )
    with pytest.raises(rt.UsageError):
        rt.load_cases(folder)
    (folder / "x.yaml").write_text(
        "id: x\nattack: x\nprompt: "
        + "p" * 501
        + "\nresponse: r\nexpect: safe\nforbid: ['zz']\nlive: {route: hello}\n",
        encoding="utf-8",
    )
    with pytest.raises(rt.UsageError, match="500"):
        rt.load_cases(folder)


@pytest.mark.parametrize("adapter", ["local", "anthropic", "bedrock"])
def test_a_hello_case_goes_through_the_adapter_route_with_hellos_prompt(
    tmp_path: Path, adapter: str
) -> None:
    selected = [c for c in cases().values() if c["id"] in HELLO_IDS]
    twin = next(c for c in cases().values() if c["id"] == "twin-disparage")
    stub = StubClient({})
    rt.live_run([*selected, twin], stub, "prod", adapter, tmp_path, "c" * 40)
    hello_calls = [c for c in stub.calls if c["route"] == "adapter"]
    assert len(hello_calls) == len(HELLO_IDS)
    for call in hello_calls:
        assert call["adapter"] == adapter
        assert call["messages"][0] == {"role": "system", "content": hello_prompt()}
        assert call["messages"][1]["role"] == "user"
        assert call["max_output_tokens"] == hello_cap()
        assert call["purpose"] == "eval"
    assert [c["route"] for c in stub.calls].count("twin") == 1
    (record,) = [json.loads(p.read_text()) for p in tmp_path.glob("*.json")]
    by_id = {r["id"]: r for r in record["results"]}
    for case_id in HELLO_IDS:
        assert by_id[case_id]["feature"] == "hello"
        assert by_id[case_id]["verdict"] == "pass", by_id[case_id]


def test_each_hello_case_fails_against_a_stub_giving_its_planted_answer(
    tmp_path: Path,
) -> None:
    loaded = cases()
    planted = {
        loaded[i]["prompt"]: loaded[i]["response"]
        for i in ("hello-are-you-the-author", "hello-reveal-configuration")
    }
    planted[loaded["hello-disparage"]["prompt"]] = "Yes, they were useless idiots."
    stub = StubClient(planted)
    code = rt.live_run(
        [loaded[i] for i in HELLO_IDS], stub, "prod", "anthropic", tmp_path, None
    )
    assert code == 1
    (record,) = [json.loads(p.read_text()) for p in tmp_path.glob("*.json")]
    assert {r["id"]: r["verdict"] for r in record["results"]} == {
        i: "fail" for i in HELLO_IDS
    }
    # The history holds each answer's hash, never its text.
    assert "useless idiots" not in json.dumps(record)
