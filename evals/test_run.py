"""Tests for evals/run.py: case loading, deterministic scoring, adapters, and history only for real runs."""

from __future__ import annotations

import datetime as dt
import importlib.util
import io
import json
import sys
import urllib.error
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Self

import pytest

REPO = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("evals_run", REPO / "evals" / "run.py")
assert SPEC and SPEC.loader
run = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = run
SPEC.loader.exec_module(run)

# A 200 from POST /hello, as contracts/gateway-http.md §2.5.1 shows it.
HELLO = {
    "answer": "Hello! This is the h4reet.ai stack's hello test answering.",
    "route": "local",
    "route_reason": None,
    "provider": "local",
    "model": "qwen3-30b-a3b",
    "usage": {"input_tokens": 71, "output_tokens": 14},
    "cost_usd": 0,
    "cost_micro_usd": 0,
    "stack": "dev",
    "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
}
CASE = {"id": "a", "prompt": "Say hello.", "expect": {"contains": ["hello"]}}


class FakeResponse(io.BytesIO):
    def __enter__(self) -> Self:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()


class FakeOpener:
    """Answers each request with the next item: a dict is a 200's body, an exception is raised."""

    def __init__(self, *answers: Any) -> None:
        self.answers = list(answers)
        self.requests: list[Any] = []

    def open(self, request: Any, timeout: float | None = None) -> FakeResponse:
        self.requests.append(request)
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return FakeResponse(json.dumps(answer).encode("utf-8"))


def too_many(limit: str, seconds: int) -> urllib.error.HTTPError:
    """A 429 as gateway-http.md §2.5.3 shows it."""
    body = {"error": "client_cap_exceeded", "limit": limit, "retry_after_s": seconds}
    return urllib.error.HTTPError(
        "http://127.0.0.1:18100/hello",
        429,
        "Too Many Requests",
        {"Retry-After": str(seconds)},  # type: ignore[arg-type]
        io.BytesIO(json.dumps(body).encode("utf-8")),
    )


@pytest.fixture
def suite(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """An isolated evals/ tree with one suite, so tests never write into the repository or read the home."""
    monkeypatch.setattr(run, "EVALS", tmp_path / "evals")
    monkeypatch.setattr(run, "STATE", tmp_path / "state")
    cases = tmp_path / "evals" / "demo" / "cases"
    cases.mkdir(parents=True)
    (cases / "a.yaml").write_text(
        "id: a\nprompt: Say hello.\nfake_response: Hello there.\nexpect:\n  contains: [hello]\n",
        encoding="utf-8",
    )
    return tmp_path / "evals"


def test_the_committed_product_suite_passes_on_fake(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Spec 007 (its FR-049) generates the twin's cases beside the scaffold's one: every committed case passes.
    count = len(list((REPO / "evals" / "product" / "cases").glob("*.yaml")))
    assert run.main(["--suite", "product", "--adapter", "fake"]) == 0
    assert f"{count} passed, 0 failed" in capsys.readouterr().out


def test_the_committed_narration_suite_passes_on_fake(
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Spec 002's narration cases (contracts/narration.md §2, N5): one per script, two per resume item."""
    assert run.main(["--suite", "narration", "--adapter", "fake"]) == 0
    out = capsys.readouterr().out
    assert ", 0 failed" in out
    passed = int(out.rsplit("evals narration (fake): ", 1)[1].split(" passed")[0])
    assert passed >= 2 and passed % 2 == 0


@pytest.mark.parametrize("adapter", ["local", "bedrock"])
def test_the_narration_suite_runs_on_the_fake_adapter_only(
    adapter: str, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """A narration case is never sent to a stack's /hello or charged to prod's meter (contracts/narration.md §2)."""

    def never(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("the narration suite reached a real adapter")

    monkeypatch.setattr(run, "local_adapter", never)
    monkeypatch.setattr(run, "bedrock_adapter", never)
    argv = ["--suite", "narration", "--adapter", adapter]
    assert run.main(argv + (["--stack", "dev"] if adapter == "local" else [])) == 2
    assert "runs on the fake adapter only" in capsys.readouterr().err


def test_scoring_is_deterministic() -> None:
    case = {
        "id": "x",
        "prompt": "p",
        "expect": {"contains": ["Hello"], "not_contains": ["twin"], "regex": "^H"},
    }
    assert run.score(case, "hello world") == ["doesn't match /^H/"]
    assert run.score(case, "Hello, I am the twin") == ["contains 'twin'"]
    assert run.score(case, "Hello") == []


def test_a_failing_case_exits_one(suite: Path) -> None:
    (suite / "demo" / "cases" / "b.yaml").write_text(
        "id: b\nprompt: p\nfake_response: nope\nexpect:\n  contains: [agree]\n",
        encoding="utf-8",
    )
    assert run.main(["--suite", "demo", "--adapter", "fake"]) == 1


def test_fake_runs_write_no_history(suite: Path) -> None:
    assert run.main(["--suite", "demo", "--adapter", "fake"]) == 0
    assert not (suite / "demo" / "history").exists()


def test_malformed_cases_and_unknown_suites_are_usage_errors(suite: Path) -> None:
    (suite / "demo" / "cases" / "c.yaml").write_text(
        "id: c\nprompt: p\nsurprise: 1\n", encoding="utf-8"
    )
    assert run.main(["--suite", "demo", "--adapter", "fake"]) == 2
    assert run.main(["--suite", "no-such-suite", "--adapter", "fake"]) == 2
    assert run.main(["--suite", "../escape", "--adapter", "fake"]) == 2


def test_non_string_expectations_are_usage_errors(suite: Path) -> None:
    (suite / "demo" / "cases" / "a.yaml").write_text(
        "id: a\nprompt: p\nfake_response: x\nexpect:\n  contains: [yes]\n",
        encoding="utf-8",
    )
    assert run.main(["--suite", "demo", "--adapter", "fake"]) == 2


def test_a_case_needs_a_check_and_a_regex_that_compiles(
    suite: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    case = suite / "demo" / "cases" / "a.yaml"
    case.write_text("id: a\nprompt: p\nfake_response: x\n", encoding="utf-8")
    assert run.main(["--suite", "demo", "--adapter", "fake"]) == 2
    assert "at least one check" in capsys.readouterr().err
    case.write_text(
        "id: a\nprompt: p\nfake_response: x\nexpect:\n  regex: '('\n", encoding="utf-8"
    )
    assert run.main(["--suite", "demo", "--adapter", "fake"]) == 2
    assert "doesn't compile" in capsys.readouterr().err


def test_the_fake_adapter_needs_a_fake_response(suite: Path) -> None:
    (suite / "demo" / "cases" / "a.yaml").write_text(
        "id: a\nprompt: p\nexpect:\n  contains: [x]\n", encoding="utf-8"
    )
    assert run.main(["--suite", "demo", "--adapter", "fake"]) == 2


def test_local_takes_only_known_stacks() -> None:
    with pytest.raises(run.AdapterError):
        run.local_adapter("dev-cpu")


def test_local_records_what_the_gateway_says_about_each_answer() -> None:
    opener = FakeOpener(HELLO)
    answer = run.local_adapter("dev", opener=opener)(CASE)
    assert opener.requests[0].full_url == "http://127.0.0.1:18100/hello"
    assert (answer["route"], answer["provider"], answer["model"]) == (
        "local",
        "local",
        "qwen3-30b-a3b",
    )
    assert answer["usage"] == {"input_tokens": 71, "output_tokens": 14}
    assert (answer["cost_micro_usd"], answer["trace_id"]) == (0, HELLO["trace_id"])


def test_local_refuses_an_answer_from_the_fallback() -> None:
    fallback = {
        **HELLO,
        "route": "fallback",
        "route_reason": "local_unhealthy",
        "provider": "aws.bedrock",
        "cost_micro_usd": 1200,
    }
    with pytest.raises(run.AdapterError, match="'fallback' route answered"):
        run.local_adapter("prod", opener=FakeOpener(fallback))(CASE)


def test_local_waits_out_a_429_then_retries() -> None:
    waits: list[float] = []
    opener = FakeOpener(too_many("per_minute", 3), HELLO)
    answer = run.local_adapter("dev", opener=opener, sleep=waits.append)(CASE)
    assert waits == [3.0]
    assert answer["route"] == "local"
    assert len(opener.requests) == 2


def test_local_stops_at_the_daily_cap() -> None:
    waits: list[float] = []
    opener = FakeOpener(too_many("per_day", 3600))
    with pytest.raises(run.AdapterError, match="HTTP 429"):
        run.local_adapter("dev", opener=opener, sleep=waits.append)(CASE)
    assert waits == []


def test_bedrock_says_what_it_needs_until_the_operator_cli_exists(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(run, "REPO", tmp_path / "empty-repo")
    with pytest.raises(run.AdapterError, match="T056"):
        run.bedrock_adapter("demo")


def test_bedrock_reads_the_admin_endpoints_reply(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    # A stand-in for scripts/operator.py's AdminClient, returning operator-admin.md §5's 200 body.
    scripts = tmp_path / "repo" / "scripts"
    scripts.mkdir(parents=True)
    (scripts / "operator.py").write_text(
        "class AdminClient:\n"
        "    def __init__(self, stack):\n"
        "        assert stack == 'prod'\n"
        "    def adapter_complete(self, adapter_id, messages, *, max_output_tokens, purpose, reason):\n"
        "        assert (adapter_id, purpose) == ('bedrock', 'eval')\n"
        "        return {'adapter': 'bedrock', 'attribution': 'test', 'cost_micro_usd': 31,\n"
        "                'trace_id': 'ab' * 16,\n"
        "                'result': {'text': 'Hello.', 'response_model': 'us.haiku',\n"
        "                           'usage': {'input_tokens': 9, 'output_tokens': 2}}}\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(run, "REPO", tmp_path / "repo")
    answer = run.bedrock_adapter("demo")(CASE)
    assert answer == {
        "answer": "Hello.",
        "route": "admin",
        "provider": "aws.bedrock",
        "model": "us.haiku",
        "usage": {"input_tokens": 9, "output_tokens": 2},
        "cost_micro_usd": 31,
        "trace_id": "ab" * 16,
    }


def test_a_real_run_writes_history_with_route_and_cost_but_no_answer(
    suite: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def adapter(stack: str) -> Any:
        usage = {"input_tokens": 1, "output_tokens": 2}
        return lambda case: run.reply(
            "Hello there.", "local", "local", "m", usage, 0, None
        )

    monkeypatch.setattr(run, "local_adapter", adapter)
    assert run.main(["--suite", "demo", "--adapter", "local", "--stack", "dev"]) == 0
    (path,) = (suite / "demo" / "history").iterdir()
    record = json.loads(path.read_text(encoding="utf-8"))
    assert (record["stack"], record["cost_micro_usd"], record["tokens"]) == (
        "dev",
        0,
        {"input_tokens": 1, "output_tokens": 2},
    )
    assert record["results"][0]["route"] == "local"
    assert "Hello there." not in path.read_text(encoding="utf-8")


def test_history_never_goes_through_a_link(suite: Path, tmp_path: Path) -> None:
    outside = tmp_path / "outside"
    outside.mkdir()
    (suite / "demo" / "history").symlink_to(outside)
    with pytest.raises(run.AdapterError, match="isn't a plain folder"):
        run.write_history("demo", "local", {"x": 1})
    assert list(outside.iterdir()) == []


def test_history_never_replaces_an_existing_path(
    suite: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    class Frozen(dt.datetime):
        @classmethod
        def now(cls, tz: Any = None) -> Frozen:
            return cls(2026, 10, 8, 12, 0, 0, tzinfo=tz)

    monkeypatch.setattr(run, "dt", SimpleNamespace(datetime=Frozen, UTC=dt.UTC))
    target = tmp_path / "prod.env"
    target.write_text("KEEP=1\n", encoding="utf-8")
    history = suite / "demo" / "history"
    history.mkdir()
    (history / "2026-10-08T120000Z-local.json").symlink_to(target)
    with pytest.raises(run.AdapterError, match="FileExistsError"):
        run.write_history("demo", "local", {"x": 1})
    assert target.read_text(encoding="utf-8") == "KEEP=1\n"


# --- Spec 007's twin cases (its FR-049, FR-050; plan §8; tasks.md T038) ---

TWIN_CASE = (
    "id: twin-04-hobbies-and-travel-q1-engineer\n"
    "kind: golden\n"
    "prompt: Do you snowboard?\n"
    "twin:\n"
    "  feature: bicycle\n"
    "  path: engineer\n"
    "  turns:\n"
    "    - role: visitor\n"
    "      text: Do you snowboard?\n"
    "fake_response: Every winter.\n"
    "expect:\n"
    "  contains: [winter]\n"
)

STAND_IN_CLIENT = (
    "CALLS = []\n"
    "class AdminClient:\n"
    "    def __init__(self, stack):\n"
    "        self.stack = stack\n"
    "    def twin_turn(self, adapter_id, *, feature, path, turns, reason):\n"
    "        CALLS.append((self.stack, adapter_id, feature, path, turns, reason))\n"
    "        return {'text': 'Every winter, on the mountain.', 'feature': feature, 'route': adapter_id,\n"
    "                'cost_micro_usd': 0, 'guard': None, 'model': 'stand-in',\n"
    "                'usage': {'input_tokens': 900, 'output_tokens': 7}, 'trace_id': 'ab' * 16,\n"
    "                'pack_sha256': 'c' * 64, 'prompt_sha256': 'd' * 64}\n"
)


@pytest.fixture
def twin_suite(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """An isolated evals/ tree with one twin case, and a stand-in for the operator client that records each call."""
    monkeypatch.setattr(run, "EVALS", tmp_path / "evals")
    monkeypatch.setattr(run, "STATE", tmp_path / "state")
    cases = tmp_path / "evals" / "demo" / "cases"
    cases.mkdir(parents=True)
    (cases / "twin-a.yaml").write_text(TWIN_CASE, encoding="utf-8")
    scripts = tmp_path / "repo" / "scripts"
    scripts.mkdir(parents=True)
    (scripts / "operator.py").write_text(STAND_IN_CLIENT, encoding="utf-8")
    monkeypatch.setattr(run, "REPO", tmp_path / "repo")
    return tmp_path / "evals"


def test_twin_cases_load_with_their_twin_and_kind(twin_suite: Path) -> None:
    (case,) = run.load_cases("demo")
    assert case["kind"] == "golden"
    assert case["twin"] == {
        "feature": "bicycle",
        "path": "engineer",
        "turns": [{"role": "visitor", "text": "Do you snowboard?"}],
    }


def test_a_twin_case_with_a_bad_twin_or_kind_is_a_usage_error(twin_suite: Path) -> None:
    path = twin_suite / "demo" / "cases" / "twin-a.yaml"
    for bad in (
        TWIN_CASE.replace("kind: golden", "kind: secret"),
        TWIN_CASE.replace("path: engineer", "path: manager"),
        TWIN_CASE.replace("role: visitor", "role: system"),
    ):
        path.write_text(bad, encoding="utf-8")
        with pytest.raises(run.AdapterError):
            run.load_cases("demo")


def test_twin_cases_pass_on_the_fake_adapter_from_their_fake_response(
    twin_suite: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert run.main(["--suite", "demo", "--adapter", "fake"]) == 0
    assert "1 passed, 0 failed" in capsys.readouterr().out


def test_a_live_twin_case_goes_through_the_admin_twin_route_with_its_guard_and_hashes(
    twin_suite: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert run.main(["--suite", "demo", "--adapter", "local", "--stack", "dev"]) == 0
    calls = sys.modules["h4_operator"].CALLS
    assert calls == [
        (
            "dev",
            "local",
            "bicycle",
            "engineer",
            [{"role": "visitor", "text": "Do you snowboard?"}],
            "evals demo twin-04-hobbies-and-travel-q1-engineer",
        )
    ]
    (path,) = (twin_suite / "demo" / "history").iterdir()
    text = path.read_text(encoding="utf-8")
    record = json.loads(text)
    (result,) = record["results"]
    assert result["guard"] is None
    assert result["pack_sha256"] == "c" * 64
    # The review of T066 (I3): each result names its feature, which readiness holds to its own pack hash.
    assert result["feature"] == "bicycle"
    assert record["prompt_sha256"] == ["d" * 64]
    assert "Every winter, on the mountain." not in text
    out = capsys.readouterr().out
    assert "twin 04-hobbies-and-travel engineer: 1 of 1 golden cases passed" in out


def test_a_bedrock_twin_case_names_bedrock_on_prod(twin_suite: Path) -> None:
    assert run.main(["--suite", "demo", "--adapter", "bedrock"]) == 0
    stack, adapter, *_ = sys.modules["h4_operator"].CALLS[-1]
    assert (stack, adapter) == ("prod", "bedrock")


def test_the_product_suite_as_make_evals_runs_it_ends_with_the_twins_readiness(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Spec 007 (its FR-031; plan.md D19): make evals prints the readiness evidence after the product suite, as
    # information, from evals/twin_readiness.py loaded as data, so the recipe runs no script the docs don't name.
    assert run.main(["--suite", "product", "--adapter", "fake"], readiness=True) == 0
    out = capsys.readouterr().out.splitlines()
    summary = next(
        i for i, line in enumerate(out) if line.startswith("evals product (fake): ")
    )
    assert [
        line for line in out[summary + 1 :] if line.startswith("INFO (twin readiness):")
    ]
    assert run.main(["--suite", "narration", "--adapter", "fake"], readiness=True) == 0
    assert "INFO (twin readiness):" not in capsys.readouterr().out
    assert run.main(["--suite", "product", "--adapter", "fake"]) == 0
    assert "INFO (twin readiness):" not in capsys.readouterr().out


# --- The Author's live runs of 2026-11-08 (spec 007's T074, T075): Bedrock's cost, and the scaffold's fake case ---


def stand_in_bedrock(tmp_path: Path, cost: object) -> Path:
    """scripts/operator.py's AdminClient as a stand-in whose §5 answer carries `cost` as its cost_micro_usd."""
    scripts = tmp_path / "repo" / "scripts"
    scripts.mkdir(parents=True)
    (scripts / "operator.py").write_text(
        "class AdminClient:\n"
        "    def __init__(self, stack):\n"
        "        assert stack == 'prod'\n"
        "    def adapter_complete(self, adapter_id, messages, *, max_output_tokens, purpose, reason):\n"
        f"        return {{'adapter': 'bedrock', 'attribution': 'test', 'cost_micro_usd': {cost!r},\n"
        "                'trace_id': 'ab' * 16,\n"
        "                'result': {'text': 'Hello.', 'response_model': 'us.haiku',\n"
        "                           'usage': {'input_tokens': 9, 'output_tokens': 2}}}\n",
        encoding="utf-8",
    )
    return tmp_path / "repo"


def test_bedrock_reads_the_cost_as_operator_admins_decimal_string(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    # contracts/operator-admin.md §5 (T103's readings): "Costs are decimal strings of micro-USD in both answers, as
    # BigInt can't travel in JSON". T075's run stopped at its first case on the integer this reader wanted.
    monkeypatch.setattr(run, "REPO", stand_in_bedrock(tmp_path, "31"))
    answer = run.bedrock_adapter("demo")(CASE)
    assert answer["cost_micro_usd"] == 31
    assert type(answer["cost_micro_usd"]) is int


@pytest.mark.parametrize(
    "cost",
    ["3.1", "-1", "", " 31", "31 ", "0x1f", "1e3", chr(0x663), "9" * 19, None, -1, 1.5],
)
def test_bedrock_refuses_a_cost_that_isnt_micro_usd(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, cost: object
) -> None:
    monkeypatch.setattr(run, "REPO", stand_in_bedrock(tmp_path, cost))
    with pytest.raises(run.AdapterError, match="cost_micro_usd"):
        run.bedrock_adapter("demo")(CASE)


FAKE_ONLY = "id: b\nprompt: Say hello.\nfake_response: Hello there.\nfake_only: true\nexpect:\n  contains: [hello]\n"


@pytest.mark.parametrize("adapter", ["local", "bedrock"])
def test_a_fake_only_case_is_skipped_on_a_live_adapter_counted_and_said(
    adapter: str,
    suite: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # The scaffold's hello case scores a scripted answer (spec 000 plan §14): a live run never sends it, so no real
    # model is scored against the fake adapter's words, and prod's meter isn't charged for them. It says so.
    (suite / "demo" / "cases" / "b.yaml").write_text(FAKE_ONLY, encoding="utf-8")
    sent: list[str] = []

    def adapter_factory(*_args: object) -> Any:
        def call(case: dict[str, Any]) -> Any:
            sent.append(case["id"])
            usage = {"input_tokens": 1, "output_tokens": 2}
            return run.reply("Hello there.", "local", "local", "m", usage, 0, None)

        return call

    monkeypatch.setattr(run, "local_adapter", adapter_factory)
    monkeypatch.setattr(run, "bedrock_adapter", adapter_factory)
    argv = ["--suite", "demo", "--adapter", adapter]
    assert run.main(argv + (["--stack", "dev"] if adapter == "local" else [])) == 0
    assert sent == ["a"]
    out = capsys.readouterr().out
    assert "SKIP  b  (the fake adapter only)" in out
    assert f"evals demo ({adapter}): 1 passed, 0 failed, 1 skipped" in out
    (path,) = (suite / "demo" / "history").iterdir()
    record = json.loads(path.read_text(encoding="utf-8"))
    assert record["skipped"] == ["b"]
    assert record["cases"] == 1 and [r["id"] for r in record["results"]] == ["a"]


def test_a_live_run_with_nothing_but_fake_only_cases_is_a_usage_error(
    suite: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    # Skipping every case would pass a run that sent nothing, so it stops instead, as a fake-only suite does.
    (suite / "demo" / "cases" / "a.yaml").write_text(FAKE_ONLY, encoding="utf-8")

    def never(*_args: object) -> None:
        raise AssertionError("a fake-only case reached a live adapter")

    monkeypatch.setattr(run, "local_adapter", never)
    assert run.main(["--suite", "demo", "--adapter", "local", "--stack", "dev"]) == 2
    assert "runs on the fake adapter only" in capsys.readouterr().err
    assert not (suite / "demo" / "history").exists()


def test_a_fake_only_case_runs_on_the_fake_adapter(
    suite: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (suite / "demo" / "cases" / "b.yaml").write_text(FAKE_ONLY, encoding="utf-8")
    assert run.main(["--suite", "demo", "--adapter", "fake"]) == 0
    out = capsys.readouterr().out
    assert "evals demo (fake): 2 passed, 0 failed\n" in out
    assert "SKIP" not in out


@pytest.mark.parametrize("value", ["maybe", "'true'", "1", "[fake]"])
def test_fake_only_is_true_or_false(
    suite: Path, capsys: pytest.CaptureFixture[str], value: str
) -> None:
    (suite / "demo" / "cases" / "b.yaml").write_text(
        FAKE_ONLY.replace("fake_only: true", f"fake_only: {value}"), encoding="utf-8"
    )
    assert run.main(["--suite", "demo", "--adapter", "fake"]) == 2
    assert "fake_only" in capsys.readouterr().err


def test_the_scaffolds_hello_case_runs_on_the_fake_adapter_alone() -> None:
    # T074 printed "FAIL hello-fake (missing 'test')": a real model was scored against hello-fake's scripted answer,
    # and on Bedrock, which sends it without hello's system prompt, it could never pass.
    (case,) = [c for c in run.load_cases("product") if c["id"] == "hello-fake"]
    assert case["fake_only"] is True


def test_a_topics_summary_line_shows_the_bar_that_applies() -> None:
    # FR-031, amended on 2026-11-08 (spec 007's Clarifications; plan.md D30): a path with fewer than ten golden cases
    # passes with all but one, ten or more with the readiness file's share, so the line names the bar, not 90%.
    assert run.golden_line("fx-topic", "engineer", 5, 7, 0.9) == (
        "twin fx-topic engineer: 5 of 7 golden cases passed (71%; the bar is 6 of 7)"
    )
    assert run.golden_line("fx-topic", "non-engineer", 17, 18, 0.9) == (
        "twin fx-topic non-engineer: 17 of 18 golden cases passed (94%; the bar is 17 of 18)"
    )
    assert run.golden_line("fx-topic", "engineer", 1, 1, 0.9).endswith(
        "(100%; the bar is 1 of 1)"
    )
    assert run.golden_line("fx-topic", "engineer", 9, 10, 0.8).endswith(
        "(90%; the bar is 8 of 10)"
    )


def test_the_runners_bar_is_the_readiness_rules() -> None:
    spec = importlib.util.spec_from_file_location(
        "evals_twin_readiness_bar", REPO / "evals" / "twin_readiness.py"
    )
    assert spec and spec.loader
    readiness = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(readiness)
    for share in (0.8, 0.9, 0.95):
        for n in range(1, 41):
            assert run.golden_bar(n, share) == readiness.golden_bar(n, share), (
                n,
                share,
            )


# The review of c52655f7 (spec 007's plan, D31): the summary's bar takes the readiness file's thresholds.golden, as
# evals/twin_readiness.py reads it (its default 0.9 when the share is absent or not a number), never a constant beside
# it; and a failing twin case names the guard that withheld its answer, so G9, G10, and G11 show at a glance.
def test_the_runners_share_is_the_readiness_files(tmp_path: Path) -> None:
    committed_file = run.yaml.safe_load(
        (REPO / "config" / "twin-readiness.yaml").read_text(encoding="utf-8")
    )
    assert run.golden_share() == committed_file["thresholds"]["golden"]
    (tmp_path / "config").mkdir()
    readiness_file = tmp_path / "config" / "twin-readiness.yaml"
    for text, share in (
        ("thresholds: {golden: 0.8}\n", 0.8),
        ("thresholds: {golden: high}\n", 0.9),
        ("thresholds: {}\n", 0.9),
        ("schema: 1\n", 0.9),
        (": [\n", 0.9),
    ):
        readiness_file.write_text(text, encoding="utf-8")
        assert run.golden_share(tmp_path) == share, text
    readiness_file.unlink()
    assert run.golden_share(tmp_path) == 0.9


def test_the_summary_line_takes_its_bar_from_the_readiness_file(
    twin_suite: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    cases = twin_suite / "demo" / "cases"
    for i in range(2, 11):
        (cases / f"twin-{i}.yaml").write_text(
            TWIN_CASE.replace("q1-engineer", f"q{i}-engineer"), encoding="utf-8"
        )
    config = twin_suite.parent / "repo" / "config"
    config.mkdir()
    (config / "twin-readiness.yaml").write_text(
        "thresholds: {safety: 1.0, golden: 0.5}\n", encoding="utf-8"
    )
    assert run.main(["--suite", "demo", "--adapter", "fake"]) == 0
    assert (
        "twin 04-hobbies-and-travel engineer: 10 of 10 golden cases passed (100%; the bar is 5 of 10)"
        in capsys.readouterr().out
    )


def test_a_failing_twin_case_names_the_guard_that_withheld_its_answer(
    twin_suite: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    client = next((twin_suite.parent / "repo" / "scripts").iterdir())
    withheld = STAND_IN_CLIENT.replace(
        "'text': 'Every winter, on the mountain.'", "'text': 'I would rather not.'"
    ).replace("'guard': None", "'guard': 'location'")
    assert withheld != STAND_IN_CLIENT
    client.write_text(withheld, encoding="utf-8")
    assert run.main(["--suite", "demo", "--adapter", "local", "--stack", "dev"]) == 1
    out = capsys.readouterr().out
    assert (
        "FAIL  twin-04-hobbies-and-travel-q1-engineer  (missing 'winter'; withheld by location)\n"
        in out
    )


# Round 5's nit (spec 007's plan, D35): the scorer reads an answer, and a case's words beside it, as the red-team's
# detectors read an answer (redteam/run.py's fold), so typography a model varies fails no check, and a zero-width
# character hides no forbidden word. A reason still names the case's words as written.
def test_the_scorer_reads_an_answer_folded_as_the_detectors_do() -> None:
    case = {
        "id": "a",
        "prompt": "p",
        "expect": {"contains": ["one-wheel", "Hareet's"], "not_contains": ["surname"]},
    }
    assert (
        run.score(case, "I ride a one\u2011wheel, as Hareet\u2019s answer says.") == []
    )
    assert run.score(case, "A one-wheel, Hareet's, and his sur\u200bname.") == [
        "contains 'surname'"
    ]
    dashes = {
        "id": "n",
        "prompt": "p",
        "expect": {"contains": ["off the shelf \u2014 after"]},
    }
    assert run.score(dashes, "taken off the shelf \u2014 after that") == []
    assert run.score(dashes, "taken off the shelf - after that") == []
    gap = {"id": "g", "prompt": "p", "expect": {"regex": "(?i)\\bdon't know\\b"}}
    assert run.score(gap, "I don\u2019t know yet.") == []
    assert run.score(
        {"id": "m", "prompt": "p", "expect": {"contains": ["Medic"]}}, "no"
    ) == ["missing 'Medic'"]


def test_the_scorers_fold_is_the_detectors() -> None:
    spec = importlib.util.spec_from_file_location(
        "evals_redteam_run_fold", REPO / "redteam" / "run.py"
    )
    assert spec and spec.loader
    detectors = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(detectors)
    assert run.FOLDS == detectors.FOLDS
    sample = "\u201cHareet\u2019s\u201d \u2014 \u2018work\u2019\u200b \uff46\uff55\uff4c\uff4c\u00a0stop \u2026"
    assert run.fold(sample) == detectors.fold(sample)


# Spec 010 (FR-025): the Anthropic API as a paid adapter, by its ID, on prod alone, its provider named in the history.
def test_an_anthropic_twin_case_names_anthropic_on_prod_and_in_its_history(
    twin_suite: Path,
) -> None:
    assert (
        run.main(["--suite", "demo", "--adapter", "anthropic", "--stack", "dev"]) == 0
    )
    stack, adapter, *_ = sys.modules["h4_operator"].CALLS[-1]
    assert (stack, adapter) == ("prod", "anthropic")  # prod's, whatever --stack says
    (path,) = (twin_suite / "demo" / "history").iterdir()
    assert path.name.endswith("-anthropic.json")
    record = json.loads(path.read_text(encoding="utf-8"))
    assert (record["adapter"], record["provider"], record["stack"]) == (
        "anthropic",
        "anthropic",
        "prod",
    )
    assert record["results"][0]["provider"] == "anthropic"


def test_a_bedrock_run_names_its_provider_in_its_history(twin_suite: Path) -> None:
    assert run.main(["--suite", "demo", "--adapter", "bedrock"]) == 0
    (path,) = (twin_suite / "demo" / "history").iterdir()
    record = json.loads(path.read_text(encoding="utf-8"))
    assert (record["adapter"], record["provider"]) == ("bedrock", "aws.bedrock")


def test_an_anthropic_hello_case_goes_through_the_admin_adapter_route_by_its_id(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    scripts = tmp_path / "repo" / "scripts"
    scripts.mkdir(parents=True)
    (scripts / "operator.py").write_text(
        "class AdminClient:\n"
        "    def __init__(self, stack):\n"
        "        assert stack == 'prod'\n"
        "    def adapter_complete(self, adapter_id, messages, *, max_output_tokens, purpose, reason):\n"
        "        assert (adapter_id, purpose) == ('anthropic', 'eval')\n"
        "        return {'adapter': 'anthropic', 'attribution': 'test', 'cost_micro_usd': 9,\n"
        "                'trace_id': 'ab' * 16,\n"
        "                'result': {'text': 'Hello.', 'response_model': 'claude-haiku-5-5',\n"
        "                           'usage': {'input_tokens': 9, 'output_tokens': 2}}}\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(run, "REPO", tmp_path / "repo")
    answer = run.paid_adapter("demo", "anthropic")(CASE)
    assert (answer["provider"], answer["model"], answer["route"]) == (
        "anthropic",
        "claude-haiku-5-5",
        "admin",
    )


def test_the_runner_refuses_an_adapter_it_doesnt_know() -> None:
    with pytest.raises(SystemExit):
        run.main(["--suite", "demo", "--adapter", "openrouter"])
