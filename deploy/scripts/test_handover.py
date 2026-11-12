"""Tests for deploy/scripts/handover.py, h4-handover, the laptop's loop (spec 001 tasks.md T118, T123; FR-060, FR-063,
FR-064; contracts/handover.md §6 and §8; research.md R-31; disclosure row C6).

`make up ENV=prod` starts it in the Author's session and `make down ENV=prod` stops it. Its phases:

  waiting   every 5 s it reads the public status, marked as a probe; once it says `laptop`, it stops EC2 through the
            Author's h4-ec2-stop profile, and moves to serving;
  serving   every 60 s, if EC2 is `pending` or `running`, it stops it again and records why (`flap`);
  window    from the relay's first `laptop` to EC2's `stopped`: recorded in the stack's state folder, and posted as
            h4.handover.window_seconds through the stack's own collector;
  no session  a describe or a stop that fails alerts once, keeps serving, and retries each minute;
  and `make up` never fails for a failed stop: its start returns at once.

The status, EC2, the alert, the metric, and the clock are stubs; nothing here reaches AWS or the network.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


handover = _load("h4_handover", HERE / "handover.py")
EC2_ID = "i-0" + "ab" * 8


class Clock:
    def __init__(self) -> None:
        self.t = 1_000.0

    def __call__(self) -> float:
        return self.t

    def sleep(self, seconds: float) -> None:
        self.t += seconds


class Status:
    """The relay's serving host, in turn, the last repeated."""

    def __init__(self, *serving: str | None) -> None:
        self.answers = list(serving)
        self.calls = 0

    def __call__(self) -> str | None:
        self.calls += 1
        return self.answers.pop(0) if len(self.answers) > 1 else self.answers[0]


class Ec2:
    """EC2's state at each describe, in turn, the last repeated."""

    def __init__(self, *states: str) -> None:
        self.states = list(states)
        self.stops: list[list[str]] = []
        self.failing = False
        self.describes = 0

    def describe(self) -> list[tuple[str, str]]:
        self.describes += 1
        if self.failing:
            raise handover.Ec2Error("ExpiredToken")
        state = self.states.pop(0) if len(self.states) > 1 else self.states[0]
        return [(EC2_ID, state)]

    def stop(self, ids: list[str]) -> None:
        if self.failing:
            raise handover.Ec2Error("ExpiredToken")
        self.stops.append(list(ids))


class Sink:
    def __init__(self) -> None:
        self.alerts: list[str] = []
        self.windows: list[float] = []

    def alert(self, text: str) -> None:
        self.alerts.append(text)

    def window(self, seconds: float) -> None:
        self.windows.append(seconds)


def loop(tmp_path: Path, status: Status, ec2: Ec2) -> tuple[object, Clock, Sink]:
    clock, sink = Clock(), Sink()
    h = handover.Handover(
        status=status,
        ec2=ec2,
        alert=sink.alert,
        window=sink.window,
        state_dir=tmp_path,
        clock=clock,
        sleep=clock.sleep,
    )
    return h, clock, sink


def records(tmp_path: Path) -> list[dict]:
    path = tmp_path / "handover.jsonl"
    return (
        [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
        if path.is_file()
        else []
    )


def test_waiting_reads_the_status_every_5_s_until_it_says_laptop(
    tmp_path: Path,
) -> None:
    status = Status("ec2", "none", "laptop")
    h, clock, _ = loop(tmp_path, status, Ec2("stopped"))
    start = clock()
    h.wait_for_laptop()
    assert status.calls == 3 and clock() - start == pytest.approx(10.0)
    assert h.phase == "serving"


def test_on_laptop_it_stops_ec2_and_records_the_window_once_stopped(
    tmp_path: Path,
) -> None:
    ec2 = Ec2("running", "stopping", "stopping", "stopped")
    h, _, sink = loop(tmp_path, Status("laptop"), ec2)
    h.wait_for_laptop()
    assert ec2.stops == [[EC2_ID]]
    h.settle()
    assert sink.windows and 0 < sink.windows[0] <= 300
    (row,) = [r for r in records(tmp_path) if r["event"] == "window"]
    assert row["seconds"] == sink.windows[0] and row["reason"] == "takeover"


def test_with_ec2_already_stopped_the_window_is_zero_and_nothing_is_stopped(
    tmp_path: Path,
) -> None:
    ec2 = Ec2("stopped")
    h, _, sink = loop(tmp_path, Status("laptop"), ec2)
    h.wait_for_laptop()
    h.settle()
    assert ec2.stops == [] and sink.windows == [0.0]


def test_serving_stops_ec2_again_after_a_flap(tmp_path: Path) -> None:
    ec2 = Ec2("stopped", "stopped", "running", "stopped")
    h, clock, _ = loop(tmp_path, Status("laptop"), ec2)
    h.wait_for_laptop()
    h.settle()
    before = clock()
    h.serve_once()
    h.serve_once()
    assert clock() - before == pytest.approx(120.0)
    assert ec2.stops == [[EC2_ID]]
    assert [r["reason"] for r in records(tmp_path) if r["event"] == "stop"] == ["flap"]


def test_serving_stops_ec2_started_on_the_tunnel_ends_return_while_the_laptop_reconnected(
    tmp_path: Path,
) -> None:
    # contracts/handover.md §8: the start function's run on the tunnel end's return can start EC2 just before the
    # laptop serves again; the loop stops it within the window.
    ec2 = Ec2("stopped", "pending", "stopped")
    h, _, _ = loop(tmp_path, Status("laptop"), ec2)
    h.wait_for_laptop()
    h.settle()
    h.serve_once()
    assert ec2.stops == [[EC2_ID]]


def test_an_expired_session_alerts_once_and_keeps_serving(tmp_path: Path) -> None:
    ec2 = Ec2("stopped")
    h, _, sink = loop(tmp_path, Status("laptop"), ec2)
    h.wait_for_laptop()
    h.settle()
    ec2.failing = True
    for _ in range(5):
        h.serve_once()
    assert len(sink.alerts) == 1
    assert "handover_stop_failed" in sink.alerts[0] and "ExpiredToken" in sink.alerts[0]
    assert h.phase == "serving"
    # Once the session works again, a later failure alerts again.
    ec2.failing = False
    h.serve_once()
    ec2.failing = True
    h.serve_once()
    assert len(sink.alerts) == 2


def test_a_failed_first_stop_alerts_and_the_next_minute_retries_it(
    tmp_path: Path,
) -> None:
    ec2 = Ec2("running")
    ec2.failing = True
    h, _, sink = loop(tmp_path, Status("laptop"), ec2)
    h.wait_for_laptop()
    assert h.phase == "serving" and len(sink.alerts) == 1
    ec2.failing = False
    h.serve_once()
    assert ec2.stops == [[EC2_ID]]


def test_a_status_it_cant_read_is_waited_out_never_read_as_laptop(
    tmp_path: Path,
) -> None:
    status = Status(None, None, "laptop")
    ec2 = Ec2("running")
    h, _, _ = loop(tmp_path, status, ec2)
    h.wait_for_laptop()
    assert status.calls == 3 and ec2.stops == [[EC2_ID]]


def test_its_records_hold_no_address_or_instance_id(tmp_path: Path) -> None:
    ec2 = Ec2("running", "stopped")
    h, _, _ = loop(tmp_path, Status("laptop"), ec2)
    h.wait_for_laptop()
    h.settle()
    text = (tmp_path / "handover.jsonl").read_text(encoding="utf-8")
    assert EC2_ID not in text


def test_the_window_metric_is_otlp_json_with_no_address() -> None:
    payload = handover.window_payload(42.5, 1_700_000_000.0)
    (rm,) = payload["resourceMetrics"]
    resource = {
        a["key"]: a["value"]["stringValue"] for a in rm["resource"]["attributes"]
    }
    assert resource["service.name"] == "h4-handover"
    (metric,) = rm["scopeMetrics"][0]["metrics"]
    assert metric["name"] == "h4.handover.window_seconds"
    (point,) = metric["gauge"]["dataPoints"]
    assert point["asDouble"] == 42.5
    assert {a["key"] for a in point.get("attributes", [])} <= {"h4.host"}


def test_start_returns_at_once_and_never_fails_make_up(tmp_path: Path) -> None:
    # The start forks the loop and returns 0, whatever the loop will meet; a second start while one runs starts none.
    spawned: list[list[str]] = []

    def spawn(argv: list[str], log: Path) -> int:
        spawned.append(argv)
        return 4242

    assert handover.start(tmp_path, spawn=spawn, alive=lambda pid: False) == 0
    assert spawned and spawned[0][-1] == "run"
    assert (tmp_path / "handover.pid").read_text(encoding="utf-8").strip() == "4242"
    assert handover.start(tmp_path, spawn=spawn, alive=lambda pid: True) == 0
    assert len(spawned) == 1


def test_stop_ends_the_loop_it_started_and_forgets_it(tmp_path: Path) -> None:
    (tmp_path / "handover.pid").write_text("4242\n", encoding="utf-8")
    killed: list[int] = []
    assert handover.stop(tmp_path, kill=killed.append, alive=lambda pid: True) == 0
    assert killed == [4242] and not (tmp_path / "handover.pid").exists()
    # With none running, stop is quiet and succeeds.
    assert handover.stop(tmp_path, kill=killed.append, alive=lambda pid: False) == 0


def test_the_stop_goes_through_the_named_profile_alone(tmp_path: Path) -> None:
    argv = handover.aws_argv(
        "h4-ec2-stop", "ec2", "stop-instances", "--instance-ids", EC2_ID
    )
    assert argv[:3] == ["aws", "ec2", "stop-instances"]
    assert argv[argv.index("--profile") + 1] == "h4-ec2-stop"
    assert "--region" in argv and argv[argv.index("--region") + 1] == "us-east-1"


def test_the_status_read_is_marked_as_a_probe() -> None:
    request = handover.status_request("https://hareet.ai/api/status")
    assert request.get_header("X-h4-probe") == "1"
    assert request.get_method() == "GET"


MAKEFILE = (HERE.parents[1] / "Makefile").read_text(encoding="utf-8")


def recipe(target: str) -> str:
    return MAKEFILE.split(f"\n{target}:", 1)[1].split("\n\n", 1)[0]


def test_make_up_starts_the_loop_on_prod_alone_and_never_fails_for_it() -> None:
    up = recipe("up")
    assert "deploy/scripts/handover.py --state-dir" in up and " start" in up
    assert "$(filter prod,$(ENV))" in up
    down = recipe("down")
    assert "deploy/scripts/handover.py --state-dir" in down and " stop" in down
