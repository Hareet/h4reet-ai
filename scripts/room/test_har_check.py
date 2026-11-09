"""Tests for scripts/room/har_check.py (spec 004 T243; SC-004, SC-012; research.md R-70; contracts/tier-signal.md §9).

The checker reads a HAR file the Author exports from the browser, the drafts build's frame log (the console's
h4FrameLog()), and the time of the relay's path change, and prints counts and verdicts. From the HAR it reads only
each request's URL, method, start time, and status, never a header, cookie, query value, or body. These tests build
fixture HAR files and frame logs in a temporary folder, planting a canary in every part of the HAR the checker must not
print, and check:
- 0 requests to any host but the page's own origin;
- 0 status requests before Enter, between a pause and its resume, or between a hide and its show;
- no two status requests closer together than the poll interval;
- the first frame off the plugged pose within 40 seconds of the relay's path change;
- 0 frames of the plugged pose while paused or hidden;
and that the checker is standard library only, runs under `python3 -I`, and exits 0 on a pass, 1 on a failure, and 2 on
input it can't read, echoing none of it.
"""

from __future__ import annotations

import ast
import copy
import importlib.util
import json
import subprocess
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, ClassVar

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "scripts" / "room" / "har_check.py"
SPEC = importlib.util.spec_from_file_location("h4_har_check", SCRIPT)
assert SPEC and SPEC.loader
har_check = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = har_check
SPEC.loader.exec_module(har_check)

ORIGIN = "http://127.0.0.1:18106"
CANARY = "CANARY-do-not-print"
# The visit's wall clock at its start: the frame log's wall 0.
W0 = datetime(2026, 10, 27, 9, 0, 0, tzinfo=UTC)
POLL = 30_000


def iso(ms: float) -> str:
    """A HAR startedDateTime, ms after W0, as Chrome writes it."""
    return (
        (W0 + timedelta(milliseconds=ms))
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def har_entry(
    url: str, at_ms: float, status: int = 200, method: str = "GET"
) -> dict[str, Any]:
    """One HAR entry with a canary in each part the checker must not print."""
    return {
        "pageref": "page_1",
        "startedDateTime": iso(at_ms),
        "time": 12.5,
        "request": {
            "method": method,
            "url": url,
            "httpVersion": "HTTP/1.1",
            "headers": [
                {"name": "Cookie", "value": f"session={CANARY}"},
                {"name": "User-Agent", "value": CANARY},
            ],
            "queryString": [{"name": "q", "value": CANARY}],
            "cookies": [{"name": "session", "value": CANARY}],
            "headersSize": -1,
            "bodySize": 0,
            "postData": {"mimeType": "text/plain", "text": CANARY},
        },
        "response": {
            "status": status,
            "statusText": CANARY,
            "httpVersion": "HTTP/1.1",
            "headers": [{"name": "Set-Cookie", "value": f"session={CANARY}"}],
            "cookies": [{"name": "session", "value": CANARY}],
            "content": {
                "size": 10,
                "mimeType": "application/json",
                "text": json.dumps({"secret": CANARY}),
            },
            "redirectURL": "",
            "headersSize": -1,
            "bodySize": 10,
        },
        "cache": {},
        "timings": {"send": 0, "wait": 10, "receive": 2.5},
    }


def har(entries: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "log": {
            "version": "1.2",
            "creator": {"name": "WebInspector", "version": "537.36"},
            "pages": [
                {"id": "page_1", "title": f"{ORIGIN}/", "startedDateTime": iso(0)}
            ],
            "entries": entries,
        }
    }


class Visit:
    """A visit as the drafts build would log it, and the HAR the browser would export for it.

    Times are ms on the room's Clock, which starts with the wall clock at W0 (`wall = W0 + t`); `frame` counts the 3D
    frames drawn, one every 16 ms from the stage's start at `t = stage_at`.
    """

    def __init__(self, poll_ms: int = POLL, mode: str = "3d") -> None:
        self.poll_ms = poll_ms
        self.mode = mode
        self.stage_at = 0
        self.entries: list[dict[str, Any]] = []
        self.requests: list[dict[str, Any]] = []
        self.dropped = 0

    def frame_at(self, t: float) -> int:
        return (
            0
            if self.mode == "2d" or t < self.stage_at
            else int((t - self.stage_at) // 16)
        )

    def log(self, event: str, t: float, **fields: Any) -> None:
        self.entries.append(
            {
                "t": t,
                "wall": W0.timestamp() * 1000 + t,
                "frame": self.frame_at(t),
                "event": event,
                **fields,
            }
        )

    def enter(self, t: float = 0) -> None:
        self.log("enter", t, source="site", poll_ms=self.poll_ms)

    def request(
        self, t: float, outcome: str = "ok", status: int | None = 200, har: bool = True
    ) -> None:
        self.log("request", t)
        if har:
            self.requests.append(har_entry(f"{ORIGIN}/api/status", t, status or 0))
        self.log(
            "result",
            t + 40,
            outcome=outcome,
            **({} if status is None else {"status": status}),
        )

    def case(self, t: float, plugged: bool, applied: float | None = None) -> None:
        """A new case: in 3D, first drawn on the first frame after it was applied (logged at that frame's time)."""
        pose = "plugged" if plugged else "resting"
        if self.mode == "2d":
            self.log("case", t, switch="charger", pose=pose, plugged=plugged, mode="2d")
            return
        frame = self.frame_at(t) + 1
        at = self.stage_at + frame * 16
        self.entries.append(
            {
                "t": at,
                "wall": W0.timestamp() * 1000 + at,
                "frame": frame,
                "event": "case",
                "switch": "charger",
                "pose": pose,
                "plugged": plugged,
                "mode": "3d",
            }
        )

    def file(self) -> dict[str, Any]:
        self.entries.sort(key=lambda e: e["t"])
        return {
            "kind": "h4-frame-log",
            "version": 1,
            "origin": ORIGIN,
            "limit": 10_000,
            "dropped": self.dropped,
            "entries": self.entries,
        }

    def har(self, extra: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        page = [
            har_entry(f"{ORIGIN}/", -500),
            har_entry(f"{ORIGIN}/assets/index-abc.js", -400),
        ]
        return har(page + self.requests + (extra or []))


def good_visit(mode: str = "3d") -> Visit:
    """Enter at 0; local from the first answer; a poll every 30 s; paused from 100 s to 700 s; hidden from 760 s to
    1,360 s; the path change at 1,400 s, and the next answer at 1,410 s unplugging the charger."""
    v = Visit(mode=mode)
    v.enter(0)
    v.case(0, plugged=False)
    v.request(0)
    v.case(40, plugged=True)
    for t in (30_000, 60_000, 90_000):
        v.request(t)
    v.log("pause", 100_000)
    v.case(100_000, plugged=False)
    v.log("result", 100_500, outcome="ok", status=200)
    v.log("resume", 700_000)
    v.case(700_000, plugged=True)
    v.request(700_000)
    v.request(730_000)
    v.log("hide", 760_000)
    v.case(760_000, plugged=False)
    v.log("show", 1_360_000)
    v.case(1_360_000, plugged=True)
    v.request(1_360_000)
    v.request(1_390_000)
    v.request(1_420_000, outcome="ok", status=200)
    v.case(1_420_040, plugged=False)
    return v


PATH_CHANGE = iso(1_400_000)


def write(
    tmp: Path, v: Visit, extra: list[dict[str, Any]] | None = None, log: Any = None
) -> list[str]:
    har_path = tmp / "visit.har"
    log_path = tmp / "frame-log.json"
    har_path.write_text(json.dumps(v.har(extra)), encoding="utf-8")
    log_path.write_text(json.dumps(v.file() if log is None else log), encoding="utf-8")
    return [str(har_path), str(log_path)]


def run(
    tmp: Path,
    v: Visit,
    change: str = PATH_CHANGE,
    extra: list[dict[str, Any]] | None = None,
    log: Any = None,
):
    """main() over the visit's files: its exit code and what it printed, stdout and stderr together."""
    argv = [*write(tmp, v, extra, log), change]
    out: list[str] = []
    code = har_check.main(argv, out=out.append, err=out.append)
    return code, "\n".join(out)


def verdict(text: str, name: str) -> str:
    """The verdict line for a check: it starts with PASS or FAIL and names the check."""
    lines = [line for line in text.splitlines() if f" {name}:" in line]
    assert len(lines) == 1, f"one line for {name} in:\n{text}"
    return lines[0]


# ---------------------------------------------------------------------------------------------------------------------
# A good visit
# ---------------------------------------------------------------------------------------------------------------------
@pytest.mark.parametrize("mode", ["3d", "2d"])
def test_a_good_visit_passes_every_check_and_prints_only_counts_and_verdicts(
    tmp_path: Path, mode: str
) -> None:
    code, text = run(tmp_path, good_visit(mode))
    assert code == 0, text
    for name in (
        "third-party",
        "before-enter",
        "paused",
        "hidden",
        "interval",
        "failover",
        "plugged-paused",
        "plugged-hidden",
    ):
        assert verdict(text, name).startswith("PASS"), text
    assert text.splitlines()[-1] == "har_check: PASS"
    assert CANARY not in text
    for word in (
        "Cookie",
        "session",
        "secret",
        "?q=",
        "assets/index",
        "127.0.0.1",
        "User-Agent",
    ):
        assert word not in text


def test_the_summary_counts_the_requests_and_the_status_requests(
    tmp_path: Path,
) -> None:
    v = good_visit()
    _, text = run(tmp_path, v)
    status = len(v.requests)
    assert f"{status + 2} requests in the HAR, {status} of them status requests" in text
    assert (
        "failover: the first frame off the plugged pose came 20.0 s after the path change (limit 40 s)"
        in text
    )


def test_the_frame_log_may_be_the_json_string_the_console_copies(
    tmp_path: Path,
) -> None:
    v = good_visit()
    code, text = run(tmp_path, v, log=json.dumps(v.file()))
    assert code == 0, text


# ---------------------------------------------------------------------------------------------------------------------
# SC-012: other origins, and status requests at the wrong time
# ---------------------------------------------------------------------------------------------------------------------
@pytest.mark.parametrize(
    "url",
    [
        "https://cdn.example.com/three.js",
        "http://127.0.0.1:18105/api/status",
        "https://127.0.0.1:18106/",
        "ws://127.0.0.1:9999/socket",
        "http://localhost:18106/",
    ],
)
def test_a_request_to_another_origin_fails(tmp_path: Path, url: str) -> None:
    code, text = run(tmp_path, good_visit(), extra=[har_entry(url, 50_000)])
    assert code == 1
    assert (
        verdict(text, "third-party") == "FAIL  third-party: 1 request to another origin"
    )
    assert "example" not in text and "localhost" not in text and "9999" not in text
    assert text.splitlines()[-1] == "har_check: FAIL"


def test_a_data_url_reaches_no_host(tmp_path: Path) -> None:
    _, text = run(
        tmp_path, good_visit(), extra=[har_entry("data:image/png;base64,AAAA", 50_000)]
    )
    assert verdict(text, "third-party").startswith("PASS"), text


def test_a_status_request_before_enter_fails(tmp_path: Path) -> None:
    v = good_visit()
    v.requests.append(har_entry(f"{ORIGIN}/api/status", -200))
    code, text = run(tmp_path, v)
    assert code == 1
    assert verdict(text, "before-enter").startswith(
        "FAIL  before-enter: 1 status request before Enter"
    )


@pytest.mark.parametrize(("at", "name"), [(400_000, "paused"), (1_000_000, "hidden")])
def test_a_status_request_while_paused_or_hidden_fails(
    tmp_path: Path, at: int, name: str
) -> None:
    v = good_visit()
    v.requests.append(har_entry(f"{ORIGIN}/api/status", at))
    code, text = run(tmp_path, v)
    assert code == 1
    assert verdict(text, name).startswith(f"FAIL  {name}: 1 status request")


@pytest.mark.parametrize(("at", "name"), [(400_000, "paused"), (1_000_000, "hidden")])
def test_a_status_request_the_frame_log_records_while_paused_or_hidden_fails(
    tmp_path: Path, at: int, name: str
) -> None:
    v = good_visit()
    v.request(at, har=False)
    code, text = run(tmp_path, v)
    assert code == 1
    assert verdict(text, name).startswith("FAIL")
    assert ", 1 in the frame log" in verdict(text, name)


def test_a_request_at_the_resume_or_the_show_itself_passes(tmp_path: Path) -> None:
    _, text = run(tmp_path, good_visit())
    assert verdict(text, "paused").startswith("PASS")
    assert verdict(text, "hidden").startswith("PASS")


def test_a_pause_never_resumed_runs_to_the_end(tmp_path: Path) -> None:
    v = good_visit()
    v.log("pause", 1_500_000)
    v.requests.append(har_entry(f"{ORIGIN}/api/status", 1_600_000))
    _, text = run(tmp_path, v)
    assert verdict(text, "paused").startswith("FAIL")


def test_two_status_requests_closer_than_the_poll_interval_fail(tmp_path: Path) -> None:
    v = good_visit()
    v.requests.append(har_entry(f"{ORIGIN}/api/status", 59_000))
    code, text = run(tmp_path, v)
    assert code == 1
    assert verdict(text, "interval").startswith(
        "FAIL  interval: 2 pairs of status requests closer than 30 s"
    )


def test_two_status_requests_the_frame_log_records_closer_than_the_interval_fail(
    tmp_path: Path,
) -> None:
    v = good_visit()
    v.request(45_000, har=False)
    code, text = run(tmp_path, v)
    assert code == 1
    assert ", 2 in the frame log" in verdict(text, "interval")


def test_the_interval_is_the_frame_logs_poll_ms(tmp_path: Path) -> None:
    v = good_visit()
    v.poll_ms = 45_000
    v.entries = [
        e if e["event"] != "enter" else {**e, "poll_ms": 45_000} for e in v.entries
    ]
    _, text = run(tmp_path, v)
    assert verdict(text, "interval").startswith("FAIL  interval:")
    assert "closer than 45 s" in verdict(text, "interval")


def test_the_har_interval_allows_the_clock_slack_and_no_more(tmp_path: Path) -> None:
    """The HAR's start times and the page's clock aren't one clock: a start may read up to SLACK_MS early."""
    assert har_check.SLACK_MS == 50
    for gap, ok in ((30_000 - 50, True), (30_000 - 51, False)):
        v = good_visit()
        v.requests = [r for r in v.requests if r["startedDateTime"] != iso(30_000)]
        v.requests.append(har_entry(f"{ORIGIN}/api/status", gap))
        _, text = run(tmp_path, v)
        assert verdict(text, "interval").startswith("PASS" if ok else "FAIL"), (
            gap,
            text,
        )


def test_only_a_get_of_api_status_on_the_origin_is_a_status_request(
    tmp_path: Path,
) -> None:
    v = good_visit()
    extra = [
        har_entry(f"{ORIGIN}/api/status", 400_000, method="HEAD"),
        har_entry(f"{ORIGIN}/api/statuses", 400_000),
        har_entry(f"{ORIGIN}/room-data.json", 400_000),
    ]
    code, text = run(tmp_path, v, extra=extra)
    assert code == 0, text


# ---------------------------------------------------------------------------------------------------------------------
# SC-004: the failover, and the plugged pose while paused or hidden
# ---------------------------------------------------------------------------------------------------------------------
def test_the_failover_fails_past_40_seconds(tmp_path: Path) -> None:
    code, text = run(tmp_path, good_visit(), change=iso(1_420_040 - 40_100))
    assert code == 1
    assert verdict(text, "failover").startswith(
        "FAIL  failover: the first frame off the plugged pose came 40.1 s"
    )


def test_the_failover_passes_at_40_seconds(tmp_path: Path) -> None:
    v = good_visit()
    off = next(e for e in reversed(v.file()["entries"]) if e["event"] == "case")
    _, text = run(tmp_path, v, change=iso(off["t"] - 40_000))
    assert verdict(text, "failover").startswith("PASS"), text


def test_the_failover_fails_when_the_plugged_pose_wasnt_showing_at_the_change(
    tmp_path: Path,
) -> None:
    code, text = run(tmp_path, good_visit(), change=iso(800_000))
    assert code == 1
    assert (
        verdict(text, "failover")
        == "FAIL  failover: the plugged pose wasn't showing at the path change"
    )


def test_the_failover_fails_when_the_plugged_pose_never_leaves(tmp_path: Path) -> None:
    v = good_visit()
    v.entries.pop()
    code, text = run(tmp_path, v)
    assert code == 1
    assert (
        verdict(text, "failover")
        == "FAIL  failover: the plugged pose never left after the path change"
    )


def test_plugged_frames_while_paused_fail_with_their_count(tmp_path: Path) -> None:
    v = good_visit()
    # The shared case drawn 10 frames late: 10 plugged frames while paused.
    for e in v.entries:
        if e["event"] == "case" and e["t"] > 100_000 and e["t"] < 100_100:
            e["frame"] += 10
            e["t"] += 160
    code, text = run(tmp_path, v)
    assert code == 1
    assert (
        verdict(text, "plugged-paused")
        == "FAIL  plugged-paused: 10 frames of the plugged pose while paused"
    )


def test_a_plugged_2d_case_while_hidden_fails(tmp_path: Path) -> None:
    v = good_visit("2d")
    v.case(900_000, plugged=True)
    v.case(901_000, plugged=False)
    code, text = run(tmp_path, v)
    assert code == 1
    assert verdict(text, "plugged-hidden").startswith("FAIL  plugged-hidden: 1 ")


# ---------------------------------------------------------------------------------------------------------------------
# What it reads, and what it runs on
# ---------------------------------------------------------------------------------------------------------------------
class Tracking(dict):
    """A dict that records every key read from it."""

    reads: ClassVar[set[str]] = set()

    def __getitem__(self, key: str) -> Any:
        Tracking.reads.add(key)
        return super().__getitem__(key)

    def get(self, key: str, default: Any = None) -> Any:
        Tracking.reads.add(key)
        return super().get(key, default)

    def __contains__(self, key: object) -> bool:
        Tracking.reads.add(str(key))
        return super().__contains__(key)

    def keys(self):
        raise AssertionError("the checker lists an entry's keys")

    def items(self):
        raise AssertionError("the checker lists an entry's items")

    def values(self):
        raise AssertionError("the checker lists an entry's values")

    def __iter__(self):
        raise AssertionError("the checker iterates an entry")


def test_it_reads_only_the_url_the_method_the_start_and_the_status_of_each_request() -> (
    None
):
    Tracking.reads = set()
    data = json.loads(json.dumps(good_visit().har()), object_hook=Tracking)
    requests = har_check.read_har(data)
    assert len(requests) == len(good_visit().har()["log"]["entries"])
    assert Tracking.reads <= {
        "log",
        "entries",
        "request",
        "url",
        "method",
        "startedDateTime",
        "response",
        "status",
    }
    assert {"url", "method", "startedDateTime", "status"} <= Tracking.reads


def test_it_is_standard_library_only_and_opens_no_connection() -> None:
    tree = ast.parse(SCRIPT.read_text(encoding="utf-8"))
    imported: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported |= {alias.name for alias in node.names}
        elif isinstance(node, ast.ImportFrom):
            assert node.level == 0, "no relative import"
            imported.add(node.module or "")
    tops = {name.split(".")[0] for name in imported}
    assert tops <= set(sys.stdlib_module_names), tops - set(sys.stdlib_module_names)
    forbidden = {
        "socket",
        "http",
        "ssl",
        "subprocess",
        "urllib.request",
        "ftplib",
        "smtplib",
        "importlib",
        "ctypes",
    }
    assert not (imported & forbidden), imported & forbidden
    calls = {
        n.func.id
        for n in ast.walk(tree)
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
    }
    assert not (calls & {"eval", "exec", "compile", "__import__"})


def test_it_runs_as_the_author_runs_it_python3_dash_I(tmp_path: Path) -> None:
    argv = [*write(tmp_path, good_visit()), PATH_CHANGE]
    done = subprocess.run(
        [sys.executable, "-I", str(SCRIPT), *argv],
        capture_output=True,
        text=True,
        timeout=60,
        cwd=tmp_path,
        check=False,
    )
    assert done.returncode == 0, done.stdout + done.stderr
    assert done.stdout.splitlines()[-1] == "har_check: PASS"
    assert CANARY not in done.stdout + done.stderr


@pytest.mark.parametrize(
    ("har_text", "log", "change", "says"),
    [
        (f"not json {CANARY}", None, PATH_CHANGE, "the HAR isn't JSON"),
        (
            json.dumps({"log": {"entries": "nope", "x": CANARY}}),
            None,
            PATH_CHANGE,
            "the HAR has no list of entries",
        ),
        (
            json.dumps({"log": {"entries": [{"request": {"url": CANARY}}]}}),
            None,
            PATH_CHANGE,
            "a HAR entry lacks",
        ),
        (
            None,
            {"kind": "something-else", "x": CANARY},
            PATH_CHANGE,
            "isn't an h4-frame-log",
        ),
        (
            None,
            {
                **good_visit().file(),
                "entries": [{"t": 0, "wall": 0, "frame": 0, "event": "tier"}],
            },
            PATH_CHANGE,
            "has no Enter",
        ),
        (
            None,
            None,
            "2026-10-27T09:23:20",
            "the path change's time needs its UTC offset",
        ),
        (None, None, f"yesterday {CANARY}", "the path change's time isn't ISO 8601"),
        # The review of T248, I-1: a URL urlsplit refuses, whose error would hold its host, and nesting past the parser's
        # recursion limit, each a traceback and exit 1 before.
        (
            json.dumps(har([har_entry(f"http://[{CANARY}]/", 0)])),
            None,
            PATH_CHANGE,
            "a HAR entry's URL isn't a URL",
        ),
        (
            json.dumps(har([har_entry("http://127.0.0.1:99999/", 0)])),
            None,
            PATH_CHANGE,
            "a HAR entry's URL isn't a URL",
        ),
        ("[" * 200_000 + "]" * 200_000, None, PATH_CHANGE, "the HAR isn't JSON"),
        (None, "[" * 200_000 + "]" * 200_000, PATH_CHANGE, "the frame log isn't JSON"),
        (
            None,
            {**good_visit().file(), "origin": f"http://[{CANARY}]"},
            PATH_CHANGE,
            "the frame log's origin isn't a URL",
        ),
        # Nit 1: t and wall finite, and dropped a count.
        (None, "NAN_T", PATH_CHANGE, "a frame log entry lacks its t, wall, or frame"),
        (
            None,
            "INF_WALL",
            PATH_CHANGE,
            "a frame log entry lacks its t, wall, or frame",
        ),
        (
            None,
            {**good_visit().file(), "dropped": -1},
            PATH_CHANGE,
            "the frame log's dropped isn't a count",
        ),
        (
            None,
            {**good_visit().file(), "dropped": True},
            PATH_CHANGE,
            "the frame log's dropped isn't a count",
        ),
    ],
    ids=lambda value: value[:40] if isinstance(value, str) else type(value).__name__,
)
def test_input_it_cant_read_exits_2_and_echoes_none_of_it(
    tmp_path: Path, har_text: str | None, log: Any, change: str, says: str
) -> None:
    if log in ("NAN_T", "INF_WALL"):
        file = good_visit().file()
        file["entries"][3] = {
            **file["entries"][3],
            **({"t": float("nan")} if log == "NAN_T" else {"wall": float("inf")}),
        }
        log = file
    paths = write(tmp_path, good_visit(), log=log)
    if isinstance(log, str) and log.startswith("["):
        Path(paths[1]).write_text(log, encoding="utf-8")
    if har_text is not None:
        Path(paths[0]).write_text(har_text, encoding="utf-8")
    out: list[str] = []
    code = har_check.main([*paths, change], out=out.append, err=out.append)
    text = "\n".join(out)
    assert code == 2, text
    assert says in text
    assert CANARY not in text


def test_a_frame_log_that_dropped_entries_says_so_and_fails(tmp_path: Path) -> None:
    v = good_visit()
    v.dropped = 3
    code, text = run(tmp_path, v)
    assert code == 1
    assert (
        "FAIL  frame-log: it dropped 3 entries, so it may not hold the whole visit"
        in text
    )


def test_a_missing_file_exits_2(tmp_path: Path) -> None:
    out: list[str] = []
    code = har_check.main(
        [str(tmp_path / "none.har"), str(tmp_path / "none.json"), PATH_CHANGE],
        out=out.append,
        err=out.append,
    )
    assert code == 2
    assert "can't read" in "\n".join(out)


def test_the_fixture_has_canaries_everywhere_it_should(tmp_path: Path) -> None:
    """A check of the fixture itself: every part the checker mustn't print holds the canary."""
    entry = copy.deepcopy(har_entry(f"{ORIGIN}/api/status", 0))
    text = json.dumps(entry)
    assert text.count(CANARY) >= 8


# ---------------------------------------------------------------------------------------------------------------------
# The review of T248
# ---------------------------------------------------------------------------------------------------------------------
def test_a_2d_case_its_pauses_reduction_logs_a_tick_later_replaces_at_the_pause(
    tmp_path: Path,
) -> None:
    """I-2: live.ts logs the pause, then reduces, and the 2D case reads the Clock again, so with performance.now() it
    can land a fraction of a millisecond after the pause; it is still the pause's own case."""
    v = Visit(mode="2d")
    v.enter(0)
    v.request(0)
    v.case(40, plugged=True)
    for opening, closing, start, end in (
        ("pause", "resume", 100_000, 700_000),
        ("hide", "show", 760_000, 1_360_000),
    ):
        v.log(opening, start)
        v.log("tier", start, tier="paused", row=2)
        v.case(start + 0.1, plugged=False)
        v.log(closing, end)
        v.log("tier", end, tier="local", row=8)
        v.case(end + 0.1, plugged=True)
        v.request(end)
    v.request(1_390_000)
    v.request(1_420_000)
    v.case(1_420_040, plugged=False)
    code, text = run(tmp_path, v)
    assert verdict(text, "plugged-paused").startswith("PASS"), text
    assert verdict(text, "plugged-hidden").startswith("PASS"), text
    assert code == 0, text


def test_a_2d_case_later_than_its_pauses_reduction_still_counts(tmp_path: Path) -> None:
    """I-2's reading is the log's order, not a window: a plugged 2D case that isn't the pause's reduction's still
    counts."""
    v = good_visit("2d")
    v.log("request", 400_000)
    v.case(400_000.1, plugged=True)
    v.case(400_000.2, plugged=False)
    _, text = run(tmp_path, v)
    assert verdict(text, "plugged-paused").startswith("FAIL  plugged-paused: 1 "), text


def run_with(tmp: Path, v: Visit, change: str, *more: str) -> tuple[int, str]:
    out: list[str] = []
    code = har_check.main(
        [*write(tmp, v), change, *more], out=out.append, err=out.append
    )
    return code, "\n".join(out)


def test_the_relay_offset_moves_the_path_change_onto_the_browsers_clock(
    tmp_path: Path,
) -> None:
    """I-3 (b): with the relay's clock 30 s ahead of the browser's, its log line reads 30 s late."""
    late = iso(1_400_000 + 30_000)
    code, text = run_with(tmp_path, good_visit(), late)
    assert code == 1
    assert verdict(text, "failover").startswith("FAIL"), text
    code, text = run_with(tmp_path, good_visit(), late, "--relay-offset-ms", "30000")
    assert code == 0, text
    assert "came 20.0 s after the path change" in verdict(text, "failover")
    assert "relay offset 30000 ms" in text
    early = iso(1_400_000 - 5_000)
    code, text = run_with(tmp_path, good_visit(), early, "--relay-offset-ms", "-5000")
    assert code == 0, text
    assert "came 20.0 s after the path change" in verdict(text, "failover")


def test_the_docstring_says_how_to_compare_the_clocks_and_which_python() -> None:
    doc = har_check.__doc__ or ""
    assert "date -u +%FT%T.%3NZ" in doc
    assert "new Date().toISOString()" in doc
    assert "--relay-offset-ms" in doc
    assert "Python 3.11" in doc
    assert "caseFor" in doc


@pytest.mark.parametrize(
    "url",
    ["chrome-extension://abcdefghij/content.js", "moz-extension://1234-5678/x.js"],
)
def test_an_extensions_request_is_counted_apart_from_other_origins(
    tmp_path: Path, url: str
) -> None:
    """Nit 3: a browser extension's request isn't the page's, and isn't a host it reached."""
    code, text = run(tmp_path, good_visit(), extra=[har_entry(url, 50_000)])
    assert code == 0, text
    assert verdict(text, "third-party").startswith("PASS")
    assert (
        verdict(text, "extensions")
        == "NOTE  extensions: 1 request from a browser extension, not counted above"
    )
    assert "abcdefghij" not in text and "1234-5678" not in text
