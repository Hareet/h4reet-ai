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
