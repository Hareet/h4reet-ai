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


# ----------------------------------------------------------------------------------------------------------------------
# Group 9's review A (I1 to I4).


@pytest.mark.parametrize("elsewhere", ["ec2", "none", None])
def test_serving_leaves_ec2_running_once_the_relay_sends_elsewhere(
    tmp_path: Path, elsewhere: str | None
) -> None:
    # I1, FR-064: the loop stops EC2 only WHILE the relay sends to the laptop. A laptop whose tunnel, edge, or gateway
    # fails stays up, the relay moves to EC2 or to none, and the start function starts EC2: the loop must leave it.
    ec2 = Ec2("stopped", "stopped", "running")
    h, _, _ = loop(tmp_path, Status("laptop", elsewhere), ec2)
    h.wait_for_laptop()
    h.settle()
    h.serve_once()
    assert ec2.stops == []
    assert h.phase == "waiting"
    (row,) = [r for r in records(tmp_path) if r["event"] == "released"]
    assert row["serving"] == (elsewhere or "unread")


def test_back_in_waiting_it_stops_ec2_again_once_the_relay_serves_the_laptop(
    tmp_path: Path,
) -> None:
    ec2 = Ec2("stopped", "stopped", "running")
    h, _, _ = loop(tmp_path, Status("laptop", "none", "laptop"), ec2)
    h.wait_for_laptop()
    h.settle()
    h.serve_once()
    assert h.phase == "waiting" and ec2.stops == []
    h.wait_for_laptop()
    assert ec2.stops == [[EC2_ID]] and h.phase == "serving"


class StopLoop(BaseException):
    """Ends run()'s endless loop in a test; a BaseException, so the loop's own catch-all never takes it."""


@pytest.mark.parametrize(
    "raised",
    [
        lambda: handover.subprocess.TimeoutExpired(["aws"], 60),
        lambda: FileNotFoundError(2, "No such file or directory", "aws"),
    ],
)
def test_a_hung_or_missing_cli_is_an_ec2_error(
    monkeypatch: pytest.MonkeyPatch, raised
) -> None:
    # I2: subprocess.run's timeout, and a missing aws binary, are the describe's failure, never a raise out of it.
    def run(*args: object, **kwargs: object) -> object:
        raise raised()

    monkeypatch.setattr(handover.subprocess, "run", run)
    with pytest.raises(handover.Ec2Error):
        handover.CliEc2("h4-ec2-stop").describe()


def test_an_answer_that_isnt_json_is_an_ec2_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class Done:
        returncode = 0
        stdout = "not json"
        stderr = ""

    monkeypatch.setattr(handover.subprocess, "run", lambda *a, **k: Done())
    with pytest.raises(handover.Ec2Error):
        handover.CliEc2("h4-ec2-stop").describe()


def test_an_unexpected_error_in_a_round_is_recorded_and_the_loop_goes_on(
    tmp_path: Path,
) -> None:
    # I2: one round's unexpected error is a record, and the loop keeps running, never a traceback and a dead loop.
    class Flaky(Ec2):
        def describe(self) -> list[tuple[str, str]]:
            if self.describes == 1:
                self.describes += 1
                raise RuntimeError("boom")
            return super().describe()

    ec2 = Flaky("stopped")
    h, clock, _ = loop(tmp_path, Status("laptop"), ec2)
    sleeps = 0

    def sleep(seconds: float) -> None:
        nonlocal sleeps
        sleeps += 1
        clock.t += seconds
        if sleeps > 6:
            raise StopLoop

    h.sleep = sleep
    with pytest.raises(StopLoop):
        h.run()
    assert [r["kind"] for r in records(tmp_path) if r["event"] == "error"] == [
        "RuntimeError"
    ]
    assert ec2.describes > 2


class Runner:
    """subprocess.run's stand-in for the CLI: each call's argv, and an answer by its first words."""

    def __init__(self, fail: tuple[str, ...] = ()) -> None:
        self.calls: list[list[str]] = []
        self.fail = fail

    def __call__(self, argv: list[str], **kwargs: object) -> object:
        self.calls.append(list(argv))

        class Done:
            returncode = 0
            stdout = "{}"
            stderr = ""

        done = Done()
        if tuple(argv[1:3]) == self.fail:
            done.returncode, done.stderr = 255, "An error occurred (ExpiredToken)"
        elif argv[1:3] == ["sts", "get-caller-identity"]:
            done.stdout = json.dumps({"Account": "1" * 4 + "2" * 4 + "3" * 4})
        return done


def test_a_failed_stop_is_published_to_h4_alerts_through_the_stop_profile(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # I3, FR-064: the failed stop alerts on both channels through h4-alerts, with the stop profile's sns:Publish, as
    # make ec2-stop's alert does; the loop's log keeps its line too.
    run = Runner()
    text = handover.stop_failed_message("stop", "ExpiredToken")
    handover.notify("h4-ec2-stop", text, run=run)
    publish = [c for c in run.calls if c[1:3] == ["sns", "publish"]]
    (argv,) = publish
    assert argv[argv.index("--profile") + 1] == "h4-ec2-stop"
    topic = argv[argv.index("--topic-arn") + 1]
    assert topic.startswith("arn:aws:sns:us-east-1:") and topic.endswith(":h4-alerts")
    message = argv[argv.index("--message") + 1]
    lines = message.splitlines()
    assert lines[0].startswith("[hareet.ai aws] handover_stop_failed: ")
    assert "- step: stop" in lines and "- code: ExpiredToken" in lines
    assert "handover_stop_failed" in capsys.readouterr().err


def test_an_alert_that_cant_be_published_stays_in_the_log(
    capsys: pytest.CaptureFixture[str],
) -> None:
    run = Runner(fail=("sts", "get-caller-identity"))
    handover.notify(
        "h4-ec2-stop", handover.stop_failed_message("describe", "x"), run=run
    )
    err = capsys.readouterr().err
    assert "handover_stop_failed" in err and "not published" in err


def test_start_warns_on_make_ups_terminal_when_the_stop_profiles_session_is_gone(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # I3, FR-064's "say why": an expired session is said at make up, which still exits 0.
    def spawn(argv: list[str], log: Path) -> int:
        return 4242

    assert (
        handover.start(
            tmp_path, spawn=spawn, alive=lambda pid: False, session=lambda: False
        )
        == 0
    )
    err = capsys.readouterr().err
    assert "h4-ec2-stop" in err and "aws-login" in err
    (tmp_path / "handover.pid").unlink()
    assert (
        handover.start(
            tmp_path, spawn=spawn, alive=lambda pid: False, session=lambda: True
        )
        == 0
    )
    assert "aws-login" not in capsys.readouterr().err


def test_start_passes_the_env_files_otlp_port_to_the_loop(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # I4: the prod env file reaches compose alone, so the port goes to the loop as an argument.
    env = tmp_path / "prod.env"
    env.write_text("H4_STACK=prod\nH4_OTLP_PORT=18004\n", encoding="utf-8")
    spawned: list[list[str]] = []

    def spawn(argv: list[str], log: Path) -> int:
        spawned.append(argv)
        return 4242

    state = tmp_path / "state"
    handover.start(
        state, spawn=spawn, alive=lambda pid: False, session=lambda: True, env_file=env
    )
    (argv,) = spawned
    assert argv[argv.index("--otlp-port") + 1] == "18004"
    # With no port in the file, the loop starts without one, and make up's terminal says so.
    env.write_text("H4_STACK=prod\n", encoding="utf-8")
    (state / "handover.pid").unlink()
    handover.start(
        state, spawn=spawn, alive=lambda pid: False, session=lambda: True, env_file=env
    )
    assert "--otlp-port" not in spawned[1]
    assert "H4_OTLP_PORT" in capsys.readouterr().err


def test_the_window_posts_to_the_port_it_is_given(
    capsys: pytest.CaptureFixture[str],
) -> None:
    sent: list[str] = []

    def opener(request, timeout: float) -> None:
        sent.append(request.full_url)

    handover.post_window(12.5, "18004", open_url=opener)
    assert sent == ["http://127.0.0.1:18004/v1/metrics"]
    handover.post_window(12.5, None, open_url=opener)
    assert len(sent) == 1
    assert "no OTLP port" in capsys.readouterr().err


def test_make_up_gives_the_loop_its_env_file() -> None:
    up = recipe("up")
    assert "start --env-file $(ENVFILE)" in up
