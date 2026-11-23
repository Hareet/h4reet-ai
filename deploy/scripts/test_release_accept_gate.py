"""Spec 036: the release reads a flaky test's gate line as the pass it is, and takes a failing one only by the Author's
recorded exception (FR-009 to FR-012).

- A passing line may end with `; flaky: <tests>`, the tests the gate's one retry passed (tools/gates/gate): the release
  takes it, and never reads a test's name as a step's status. A `failing:` segment still refuses it.
- `--accept-gate <SHA> --reason <text>` releases past a line that doesn't report a pass, only for refs/heads/main's
  own commit, written in full, a merge that carries the gate's line, not a DEGRADED one, with a reason. Without it,
  the release refuses, as before.
- release.json carries the merge's gate line, and the exception's merge and reason when it was used.
- make release passes ACCEPT_GATE= and REASON= from the command line alone.
"""

from __future__ import annotations

import importlib.util
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
SPEC = importlib.util.spec_from_file_location(
    "test_release_for_accept_gate", HERE / "test_release.py"
)
assert SPEC and SPEC.loader
base = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = base
SPEC.loader.exec_module(base)
rl = base.rl

HEAD = f"gate: {base.TIP} (feat/x) by tools/gates/gate at {base.PARENT[:12]}"
PASSING = f"{HEAD}: 22 PASS, 4 SKIP, 0 WARN, 0 PLANNED, 0 PENDING, 0 FAIL"
FAILING = (
    f"{HEAD}: 25 PASS, 4 SKIP, 0 WARN, 0 PLANNED, 0 PENDING, 1 FAIL; failing: test FAIL"
)
DEGRADED = (
    f"{HEAD}: 9 PASS, 0 SKIP, 0 WARN, 0 PLANNED, 0 PENDING, 1 FAIL; failing: image FAIL; DEGRADED (--host): no "
    "container phase, so lint, tests, the scaffolds, and stage H didn't run"
)
REASON = "dispatcher-forms.test.ts's wall-clock bound, fixed by fix/036-flaky-tests"


def merge(line: str) -> str:
    return f"{base.PARENT} {base.TIP}\nMerge feat/x ({base.TIP[:12]})\n\n{line}\n"


def release(
    tmp_path: Path,
    r: base.Runner,
    accept_gate: str | None = None,
    reason: str | None = None,
) -> int:
    path, sha = base.plugin(tmp_path)
    return rl.run(
        rl.Options(
            registry=base.REGISTRY,
            bucket=base.BUCKET,
            compose_plugin=path,
            compose_sha256=sha,
            public=False,
            local=tmp_path / "releases",
            redteam=base.history(tmp_path, {}),
            accept_gate=accept_gate,
            reason=reason,
        ),
        r,
        root=base.REPO,
        now=lambda: "20261123T010203Z",
        exported=base.exported,
        routing_of=lambda src: base.ROUTING,
    )


def record(tmp_path: Path) -> dict:
    return json.loads(
        (tmp_path / "releases" / "latest-release.json").read_text(encoding="utf-8")
    )


# --------------------------------------------------------------------------------------------------
# A passing line with the gate's flaky tests (FR-009)
# --------------------------------------------------------------------------------------------------
@pytest.mark.parametrize(
    "flaky",
    [
        "dispatcher-forms.test.ts > dispatcher forms > stays under its bound",
        "dispatcher-forms.test.ts > the bound, twin-2d.test.ts > twin 2d > draws the png, and 2 more",
        # A test's name is never a step's status, whatever it says.
        "test_gate.py::test_host_mode_says_DEGRADED",
        "status.test.ts > a PENDING line, then 1 FAIL",
    ],
)
def test_a_passing_line_with_the_gates_flaky_tests_is_released(
    tmp_path: Path, flaky: str
) -> None:
    r = base.Runner()
    r.merge = merge(f"{PASSING}; flaky: {flaky}")
    assert release(tmp_path, r) == 0
    assert record(tmp_path)["gate"] == {"line": f"{PASSING}; flaky: {flaky}"}


@pytest.mark.parametrize(
    "line",
    [
        f"{FAILING}; flaky: twin-2d.test.ts > twin 2d > draws the png",
        f"{HEAD}: 25 PASS, 4 SKIP, 0 WARN, 0 PLANNED, 1 PENDING, 0 FAIL; failing: matrix-e PENDING; flaky: x.test.ts > y",
        (
            f"{HEAD}: 25 PASS, 0 SKIP, 0 WARN, 0 PLANNED, 0 PENDING, 0 FAIL; flaky: x.test.ts > y; DEGRADED "
            "(--host): no container phase"
        ),
    ],
    ids=["failing", "pending", "degraded"],
)
def test_a_failing_waiting_or_degraded_line_is_refused_beside_flaky_tests(
    tmp_path: Path, line: str
) -> None:
    r = base.Runner()
    r.merge = merge(line)
    assert release(tmp_path, r) == 1
    assert r.builds() == []


def test_a_passing_release_records_its_gate_line(tmp_path: Path) -> None:
    r = base.Runner()
    r.merge = merge(PASSING)
    assert release(tmp_path, r) == 0
    assert record(tmp_path)["gate"] == {"line": PASSING}
    # The record that goes to the bucket is the same file.
    assert any(u.endswith("/release.json") for u in r.uploads)


# --------------------------------------------------------------------------------------------------
# The Author's recorded exception (FR-010, FR-011)
# --------------------------------------------------------------------------------------------------
def test_a_failing_line_is_refused_without_the_exception(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    r = base.Runner()
    r.merge = merge(FAILING)
    assert release(tmp_path, r) == 1
    assert r.builds() == []
    assert "--accept-gate" in capsys.readouterr().err


def test_the_exception_releases_mains_tip_past_its_failing_line_and_records_both(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    r = base.Runner()
    r.merge = merge(FAILING)
    assert release(tmp_path, r, accept_gate=base.COMMIT, reason=REASON) == 0
    assert record(tmp_path)["gate"] == {
        "line": FAILING,
        "accepted": {"merge": base.COMMIT, "reason": REASON},
    }
    err = capsys.readouterr().err
    assert "doesn't report a pass" in err
    assert FAILING in err and REASON in err


def test_the_exception_is_for_mains_tip_alone(tmp_path: Path) -> None:
    r = base.Runner()
    r.merge = merge(FAILING)
    assert release(tmp_path, r, accept_gate="a" * 40, reason=REASON) == 1
    assert r.builds() == []
    assert not (tmp_path / "releases").exists()


@pytest.mark.parametrize("reason", [None, "", "   ", "a flake\x1b[2J"])
def test_the_exception_needs_a_reason(tmp_path: Path, reason: str | None) -> None:
    r = base.Runner()
    r.merge = merge(FAILING)
    assert release(tmp_path, r, accept_gate=base.COMMIT, reason=reason) == 1
    assert r.builds() == []


def test_the_exception_never_takes_a_degraded_line(tmp_path: Path) -> None:
    r = base.Runner()
    r.merge = merge(DEGRADED)
    assert release(tmp_path, r, accept_gate=base.COMMIT, reason=REASON) == 1
    assert r.builds() == []


@pytest.mark.parametrize(
    "message",
    [
        # A merge whose message has no gate line: its branch was never gated.
        f"{base.PARENT} {base.TIP}\nMerge feat/x ({base.TIP[:12]})\n",
        # The Author's own commit on main, not a merge.
        f"{base.PARENT}\nA commit on main\n\n{FAILING}\n",
    ],
    ids=["no-gate-line", "not-a-merge"],
)
def test_the_exception_never_takes_what_the_gate_didnt_run_on(
    tmp_path: Path, message: str
) -> None:
    r = base.Runner()
    r.merge = message
    assert release(tmp_path, r, accept_gate=base.COMMIT, reason=REASON) == 1
    assert r.builds() == []


def test_a_passing_line_needs_no_exception_and_records_none(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    r = base.Runner()
    r.merge = merge(PASSING)
    assert release(tmp_path, r, accept_gate=base.COMMIT, reason=REASON) == 0
    assert record(tmp_path)["gate"] == {"line": PASSING}
    assert "isn't needed" in capsys.readouterr().out


# --------------------------------------------------------------------------------------------------
# The flags and the make target (FR-010, FR-012)
# --------------------------------------------------------------------------------------------------
ARGS = [
    "--registry",
    base.REGISTRY,
    "--bucket",
    base.BUCKET,
    "--compose-plugin",
    "/dev/null",
    "--compose-sha256",
    "0" * 64,
]


@pytest.mark.parametrize(
    "extra",
    [
        ["--accept-gate", "c" * 40],
        ["--reason", REASON],
        ["--accept-gate", "c" * 12, "--reason", REASON],
        ["--accept-gate", "C" * 40, "--reason", REASON],
    ],
    ids=["no-reason", "no-sha", "short-sha", "not-hex"],
)
def test_the_flags_come_together_and_the_sha_in_full(
    monkeypatch: pytest.MonkeyPatch, extra: list[str]
) -> None:
    monkeypatch.delenv("SANDBOX_RUNTIME", raising=False)
    monkeypatch.setattr(rl, "run", lambda *a, **k: pytest.fail("ran"))
    with pytest.raises(SystemExit) as stopped:
        rl.main([*ARGS, *extra])
    assert stopped.value.code == 2


def test_the_flags_reach_the_release(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SANDBOX_RUNTIME", raising=False)
    seen: list[rl.Options] = []
    monkeypatch.setattr(rl, "run", lambda opts, *a, **k: seen.append(opts) or 0)
    assert rl.main([*ARGS, "--accept-gate", "c" * 40, "--reason", REASON]) == 0
    assert (seen[0].accept_gate, seen[0].reason) == ("c" * 40, REASON)
    assert rl.main(ARGS) == 0
    assert (seen[1].accept_gate, seen[1].reason) == (None, None)


def dry_run_release(tmp_path: Path, *values: str) -> str:
    done = subprocess.run(
        [
            "make",
            "--no-print-directory",
            "-n",
            "-C",
            str(REPO),
            "release",
            "REGISTRY=1",
            "BUCKET=2",
            "COMPOSE_PLUGIN=3",
            "COMPOSE_SHA256=4",
            *values,
        ],
        env={
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "HOME": str(tmp_path),
            "LC_ALL": "C",
            # From the environment, never the command line: the recipe must not read it.
            "REASON": "from the shell",
        },
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    assert done.returncode == 0, done.stderr
    (line,) = [ln for ln in done.stdout.splitlines() if "release.py" in ln]
    return line


@pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")
def test_make_release_passes_the_exception_from_the_command_line_alone(
    tmp_path: Path,
) -> None:
    line = dry_run_release(tmp_path, "ACCEPT_GATE=" + "c" * 40, "REASON=a known flake")
    assert line.endswith(' --accept-gate "$ACCEPT_GATE" --reason "$REASON"')
    # Without REASON on the command line, the reason is empty, and the release refuses it.
    line = dry_run_release(tmp_path, "ACCEPT_GATE=" + "c" * 40)
    assert line.endswith(' --accept-gate "$ACCEPT_GATE" --reason ""')
    assert "--accept-gate" not in dry_run_release(tmp_path)
