"""T166's harness, after the Author's first run on his engine (spec 001 tasks.md T166; plan.md §16, "T166's harness").

His run stopped with "measure-tunnel-end: stopped: docker compose -f failed (exit 1): time=... level=warning
msg="The \\"VALKEY_PASSWORD\\" variable is not set. Defaulting to a blank string."; no record": the harness printed the
first line of the failed call's stderr, compose's harmless interpolation warning (compose reads the whole file, and
VALKEY_PASSWORD is the Langfuse stack's, none of the tunnel end's five), and lost the real error. His diagnosis run
found three more:
  - a failed docker call reports the last lines of its stderr (up to 20), without compose's "variable is not set"
    warnings, and writes the whole stderr to a file under his home, ~/t166-error.log, since the harness removes its
    temporary folder; neither ever holds a stand-in value of the run's env file;
  - measure-keys ran `chown 10001:10001` before `chmod`, and root without CAP_FOWNER can't chmod a file it no longer
    owns: the chmods come first;
  - the take-down left the tunnel-end profile's five running: `compose down` without that profile skips them. Every
    compose call names the profiles of every service the run starts.
measure-keys isn't in SERVICES, and the sampling keeps the five alone (`_sample` filters by FIVE), so the record is the
five's either way.
"""

from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _t():
    return _load("h4_measure_tests_for_dry_run", HERE / "test_measure_tunnel_end.py")


WARNING = (
    'time="2026-11-12T22:01:02-07:00" level=warning msg="The \\"VALKEY_PASSWORD\\" variable is not set. '
    'Defaulting to a blank string."'
)
KEYS = (
    "RELAY_TOKEN_LAPTOP",
    "RELAY_TOKEN_EC2",
    "DB_RELAY_RO_PASSWORD",
    "DB_RELAY_RW_PASSWORD",
    "SNAPSHOT_SINK_TOKEN",
    "TELEMETRY_BLOCK_TOKEN",
    "MEASURE_SUPERUSER_PASSWORD",
)
# Made at run time, each its own, so no literal shaped like a secret sits in the file.
STAND_INS = {key: f"standin{n}" + chr(ord("k") + n) * 20 for n, key in enumerate(KEYS)}


def failing_up(t, stderr: str):
    class Failing(t.Runner):
        def __call__(self, argv, stdin=None, timeout=120):
            code, out, err = super().__call__(argv, stdin, timeout)
            if " up " in f" {' '.join(argv)} ":
                return 1, "", stderr
            return code, out, err

    return Failing()


def stopped(te, t, tmp_path: Path, stderr: str, monkeypatch):
    monkeypatch.setattr(te, "stand_ins", lambda: dict(STAND_INS))
    runner = failing_up(t, stderr)
    log = tmp_path / "home" / "t166-error.log"
    ctx, said = t.context(te, runner, tmp_path, error_log=log)
    try:
        te.measure(ctx)
    except te.Stop as stop:
        return str(stop), said, log, runner
    raise AssertionError("the run didn't stop on the failed up")


def test_a_failed_call_reports_its_last_lines_without_composes_unset_variable_warnings(
    tmp_path: Path, monkeypatch
) -> None:
    t = _t()
    te = t._te()
    lines = [WARNING] + [f"step-{n:02d}" for n in range(1, 26)] + [WARNING]
    lines.append("Error response from daemon: the real failure")
    message, _said, _log, _runner = stopped(
        te, t, tmp_path, "\n".join(lines) + "\n", monkeypatch
    )
    assert "the real failure" in message
    assert "variable is not set" not in message
    # Up to 20 lines, the last ones: step-07 to step-25 and the error.
    assert "step-07" in message and "step-25" in message
    assert "step-06" not in message and "step-01" not in message


def test_a_failed_call_writes_its_whole_stderr_to_the_error_log_and_names_it(
    tmp_path: Path, monkeypatch
) -> None:
    t = _t()
    te = t._te()
    stderr = f"{WARNING}\nError response from daemon: the real failure\n"
    message, said, log, _runner = stopped(te, t, tmp_path, stderr, monkeypatch)
    assert log.is_file()
    text = log.read_text(encoding="utf-8")
    assert "the real failure" in text and "variable is not set" in text
    assert str(log) in message or any(str(log) in line for line in said)
    # The default is under the home folder, never the run's temporary folder, which the run removes.
    field = te.Context.__dataclass_fields__["error_log"]
    default = (
        field.default_factory() if callable(field.default_factory) else field.default
    )
    assert Path(default) == Path.home() / "t166-error.log"


def test_a_failed_call_never_prints_or_writes_a_stand_in_value(
    tmp_path: Path, monkeypatch
) -> None:
    t = _t()
    te = t._te()
    leaked = "\n".join(
        [WARNING]
        + [f"service relay: RELAY_TOKEN_LAPTOP={STAND_INS['RELAY_TOKEN_LAPTOP']}"]
        + [f"invalid interpolation: {value}" for value in STAND_INS.values()]
        + ["Error response from daemon: the real failure"]
    )
    message, said, log, _runner = stopped(te, t, tmp_path, leaked + "\n", monkeypatch)
    written = log.read_text(encoding="utf-8") if log.is_file() else ""
    assert written, "the error log wasn't written"
    for value in STAND_INS.values():
        assert value not in message
        assert all(value not in line for line in said)
        assert value not in written
    assert "the real failure" in message


def profiles_of(services: set[str]) -> set[str]:
    compose = yaml.safe_load(
        (REPO / "deploy" / "compose.yaml").read_text(encoding="utf-8")
    )
    overlay = _t().overlay()
    found: set[str] = set()
    for name in services:
        for source in (compose.get("services", {}), overlay.get("services", {})):
            entry = source.get(name) or {}
            found |= set(entry.get("profiles") or [])
    return found


def profiles_named(call: list[str]) -> set[str]:
    return {call[i + 1] for i, word in enumerate(call[:-1]) if word == "--profile"}


def test_every_compose_call_names_the_profiles_of_every_service_it_runs(
    tmp_path: Path,
) -> None:
    t = _t()
    te = t._te()
    wanted = profiles_of(set(te.SERVICES) | {"measure-keys", te.LOAD_SERVICE})
    assert "tunnel-end" in wanted
    for fail_on in (None, " up ", "stats"):
        runner = t.Runner(fail_on=fail_on)
        try:
            t.run(te, runner, tmp_path)
        except te.Stop:
            pass
        composes = [c for c in runner.calls if c[:2] == ["docker", "compose"]]
        assert composes, fail_on
        for call in composes:
            assert wanted <= profiles_named(call), (fail_on, call)
        downs = [c for c in composes if "down" in c]
        assert downs and "-v" in downs[-1], fail_on


def test_the_take_down_covers_every_service_in_services(tmp_path: Path) -> None:
    t = _t()
    te = t._te()
    runner = t.Runner()
    t.run(te, runner, tmp_path)
    down = [c for c in runner.calls if c[:2] == ["docker", "compose"] and "down" in c][
        -1
    ]
    for service in te.SERVICES:
        assert profiles_of({service}) <= profiles_named(down), service


def test_measure_keys_sets_the_modes_before_it_hands_the_files_over() -> None:
    keys = _t().overlay()["services"]["measure-keys"]
    command = (
        " ".join(keys["command"])
        if isinstance(keys["command"], list)
        else keys["command"]
    )
    chown = command.index("chown")
    for target in (
        "chmod 0400 /k/ssh_host_ed25519_key",
        "chmod 0444 /k/authorized_keys",
    ):
        assert target in command, target
        assert command.index(target) < chown, target
    assert keys["cap_add"] == ["CHOWN"] and keys["cap_drop"] == ["ALL"]


def test_the_sampling_keeps_the_five_whatever_else_the_run_starts() -> None:
    te = _t()._te()
    source = (REPO / "deploy" / "scripts" / "measure_tunnel_end.py").read_text(
        encoding="utf-8"
    )
    assert "measure-keys" not in te.SERVICES
    assert re.search(r"if service in FIVE", source)
