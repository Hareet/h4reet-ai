"""Tests for T166's harness, deploy/scripts/measure_tunnel_end.py and deploy/measure/ (spec 001 tasks.md T166;
research.md R-33; plan.md §16, "T166's harness").

The harness runs the tunnel end's five services (tunnel-end, relay, snapshot-sink, the collector, and shared-state)
on the engine of whoever runs it, under an overlay outside the committed compose file, against a stub host, with the
relay's load at the gateway's global metered limit; and it prints a block for W1's note, with each service's peak and
the data volume's size, and the smallest arm64 type that fits by memory alone. What the tests hold:
  - the overlay never names the tunnel end's prod addresses or host paths, publishes nothing, and keeps its own
    project name;
  - the budgets stand-in, the only file with public-cap figures the relay reads in the run, is config/budgets.yaml
    with stand-in figures, says it is a measurement's, and no prod file or host's class can read it;
  - the type is named by R-33's rule, at its boundaries;
  - the run's stand-in secrets live in a temporary folder, never deploy/env or ~/.config, and are gone after; the
    measurement's containers and volumes are removed whatever happens; nothing it prints holds a stand-in secret.
A stub runner stands in for docker; nothing here starts a container.
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

REPO = Path(__file__).resolve().parents[2]
MEASURE = REPO / "deploy" / "measure"
OVERLAY = MEASURE / "tunnel-end.overlay.yaml"
STAND_IN = MEASURE / "budgets.measure.yaml"
FIVE = ("tunnel-end", "relay", "snapshot-sink", "tunnel-end-collector", "shared-state")
MIB = 1024 * 1024


def _te():
    # Imported inside each test, so a missing module fails each test on its own, never the file's collection.
    spec = importlib.util.spec_from_file_location(
        "h4_measure_tunnel_end", REPO / "deploy" / "scripts" / "measure_tunnel_end.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class _Tagged(yaml.SafeLoader):
    """Compose's !reset and !override tags, read as what they wrap."""


def _tag(loader: yaml.SafeLoader, suffix: str, node: yaml.Node) -> object:
    if isinstance(node, yaml.SequenceNode):
        value: object = loader.construct_sequence(node, deep=True)
    elif isinstance(node, yaml.MappingNode):
        value = loader.construct_mapping(node, deep=True)
    else:
        value = loader.construct_scalar(node)
    return {"__tag__": suffix, "value": value}


_Tagged.add_multi_constructor("!", _tag)


def overlay() -> dict:
    with OVERLAY.open(encoding="utf-8") as handle:
        return yaml.load(handle, Loader=_Tagged)


def strings(value: object) -> list[str]:
    if isinstance(value, dict):
        return [s for k, v in value.items() for s in (str(k), *strings(v))]
    if isinstance(value, list):
        return [s for v in value for s in strings(v)]
    return [str(value)]


RELAY_TARGET = "/app/config/budgets.yaml"
PROD_MARKS = (
    "10.42.",
    "/run/h4reet",
    "/srv/h4reet",
    "config/budgets.yaml",
    "deploy/env/",
    ".config/",
    "h4reet-prod",
    "18505",
)


# --- The overlay -----------------------------------------------------------------------------------------------------


def test_the_overlay_names_no_prod_address_path_or_project() -> None:
    # The relay's own path inside its image, /app/config/budgets.yaml, is where the stand-in goes, not the repository's
    # config/budgets.yaml, which no bind source may name.
    text = " ".join(strings(overlay())).replace(RELAY_TARGET, "")
    for mark in PROD_MARKS:
        assert mark not in text, mark


def test_the_overlay_unpublishes_every_port_of_the_five_and_publishes_none_of_its_own() -> (
    None
):
    services = overlay()["services"]
    for name in FIVE:
        assert services[name]["ports"] == {"__tag__": "reset", "value": []}, name
    for name, service in services.items():
        if name not in FIVE:
            assert "ports" not in service, name


def test_each_of_the_five_replaces_its_volumes_whole_and_binds_only_the_tree() -> None:
    services = overlay()["services"]
    for name in FIVE:
        volumes = services[name].get("volumes")
        if volumes is None:
            continue
        assert volumes["__tag__"] == "override", name
        for volume in volumes["value"]:
            if volume["type"] == "bind":
                assert str(volume["source"]).startswith("${H4_TREE:?"), (name, volume)
                assert volume.get("read_only") is True, (name, volume)


def test_the_relay_reads_the_stand_in_budgets_and_says_so() -> None:
    relay = overlay()["services"]["relay"]
    (bind,) = [
        v
        for v in relay["volumes"]["value"]
        if v["target"] == "/app/config/budgets.yaml"
    ]
    assert (
        bind["source"]
        == "${H4_TREE:?set by the harness}/deploy/measure/budgets.measure.yaml"
    )


def test_the_merged_project_has_no_prod_address_path_or_port(tmp_path: Path) -> None:
    compose = shutil.which("docker")
    if (
        compose is None
        or subprocess.run(
            [compose, "compose", "version"], capture_output=True, check=False
        ).returncode
        != 0
    ):
        pytest.skip("docker compose isn't on this machine")
    te = _te()
    env = tmp_path / "measure.vars"
    env.write_text(te.env_text(REPO, tmp_path, te.stand_ins()), encoding="utf-8")
    done = subprocess.run(
        [
            compose,
            "compose",
            *te.compose_files(REPO),
            "--env-file",
            str(env),
            "-p",
            te.PROJECT,
            "config",
            "--format",
            "json",
            *te.SERVICES,
        ],
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
        env={"PATH": os.environ.get("PATH", ""), "HOME": str(tmp_path)},
    )
    assert done.returncode == 0, done.stderr
    merged = json.loads(done.stdout)
    assert merged["name"] == "h4reet-measure-tunnel-end"
    for name, service in merged["services"].items():
        assert not service.get("ports"), name
        text = json.dumps(service).replace(RELAY_TARGET, "")
        for mark in ("10.42.", "/run/h4reet", "/srv/h4reet", "config/budgets.yaml"):
            assert mark not in text, (name, mark)


# --- The budgets stand-in ----------------------------------------------------------------------------------------------


# The relay's public figures (contracts/relay-http.md §3, step 3), which P-6 adds to config/budgets.yaml blank.
PUBLIC_KEYS = {
    "per_address": {"requests_per_minute", "burst", "requests_per_day"},
    "global": {"in_flight"},
}


def test_the_stand_in_is_config_budgets_with_stand_in_public_figures_alone() -> None:
    real = yaml.safe_load(
        (REPO / "config" / "budgets.yaml").read_text(encoding="utf-8")
    )
    stand_in = yaml.safe_load(STAND_IN.read_text(encoding="utf-8"))
    figures = stand_in["public"]
    # The rest is config/budgets.yaml's, whether or not P-6's blank public section is in the tree yet.
    assert {k: v for k, v in stand_in.items() if k != "public"} == {
        k: v for k, v in real.items() if k != "public"
    }
    assert {group: set(keys) for group, keys in figures.items()} == PUBLIC_KEYS
    for group, keys in figures.items():
        for key, value in keys.items():
            assert isinstance(value, int) and value > 0, (group, key)


def test_the_stand_in_says_it_is_a_measurements_not_the_authors() -> None:
    head = STAND_IN.read_text(encoding="utf-8").splitlines()[0]
    assert "MEASUREMENT ONLY" in head and "not the Author's" in head


def test_no_prod_file_or_hosts_class_can_read_the_stand_in() -> None:
    assert not STAND_IN.is_relative_to(REPO / "config")
    readers = [
        REPO / "deploy" / "compose.yaml",
        REPO / "deploy" / "scripts" / "deployer.py",
        REPO / "deploy" / "scripts" / "release.py",
        REPO / "deploy" / "scripts" / "preflight.py",
        REPO / "deploy" / "scripts" / "write_env.py",
        *(REPO / "deploy" / "env.example").glob("*"),
        *(REPO / "deploy" / "hosts").glob("*/*.example"),
        *(REPO / "services" / "relay" / "src").glob("*.ts"),
        *(REPO / "services" / "gateway" / "src").rglob("*.ts"),
    ]
    for path in readers:
        text = path.read_text(encoding="utf-8")
        assert "deploy/measure" not in text and "budgets.measure" not in text, path
    # The relay reads budgets from its image's config path, which prod's compose binds from config/ alone.
    relay = yaml.safe_load(
        (REPO / "deploy" / "compose.yaml").read_text(encoding="utf-8")
    )["services"]["relay"]
    (bind,) = [v for v in relay["volumes"] if v["target"] == "/app/config/budgets.yaml"]
    assert bind["source"].endswith("/config/budgets.yaml")


# --- The type, by R-33's rule ------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("total_mib", "named"),
    [
        # t4g.nano's 512 MiB less the OS's and Docker's holds nothing at 80%, so it is never named.
        (100.0, "t4g.micro"),
        (307.0, "t4g.micro"),
        (308.0, "t4g.small"),
        (1126.0, "t4g.small"),
        (1127.0, "t4g.medium"),
        (2764.0, "t4g.medium"),
        (2765.0, "t4g.large"),
        (3497.3, "t4g.large"),  # R-33's own T016 figure, which named an 8 GiB size
        (6041.0, "t4g.large"),
        (6042.0, "t4g.xlarge"),
        (13000.0, None),
    ],
)
def test_the_type_is_the_smallest_t4g_that_fits_by_r33s_rule(
    total_mib: float, named: str | None
) -> None:
    # R-33: the largest concurrent sample, beside the OS's and Docker's 512 MiB, within 80% of the type's memory.
    te = _te()
    assert te.OS_DOCKER_MIB == 512 and te.USABLE_SHARE == 0.8
    assert te.type_for(total_mib) == named


# --- The record and the block ------------------------------------------------------------------------------------------


def samples() -> list[dict[str, int]]:
    base = {
        "tunnel-end": 4,
        "relay": 60,
        "snapshot-sink": 20,
        "tunnel-end-collector": 70,
        "shared-state": 40,
    }
    return [
        {k: v * MIB for k, v in base.items()},
        {**{k: v * MIB for k, v in base.items()}, "shared-state": 90 * MIB},
        {**{k: v * MIB for k, v in base.items()}, "relay": 80 * MIB},
    ]


def test_the_record_holds_each_peak_the_largest_total_the_volume_and_the_type() -> None:
    te = _te()
    record = te.record_of(
        samples(),
        volume_bytes=48 * MIB,
        minutes=30,
        per_minute=60,
        started=1_800_000_000.0,
        ended=1_800_001_800.0,
    )
    assert record["h4_measure_tunnel_end"] == 1
    assert record["peak_mib"] == {
        "tunnel-end": 4.0,
        "relay": 80.0,
        "snapshot-sink": 20.0,
        "tunnel-end-collector": 70.0,
        "shared-state": 90.0,
    }
    assert record["largest_total_mib"] == 244.0
    assert record["data_volume_mib"] == 48.0
    assert record["type"] == "t4g.micro"
    assert (record["minutes"], record["per_minute"]) == (30, 60)
    lines = "\n".join(te.block(record))
    assert "T166" in lines and "t4g.micro" in lines and "30 minutes" in lines
    assert "60 a minute" in lines
    assert "$" not in lines  # no price: the prices are the Author's (T167)


def test_a_service_missing_from_every_sample_is_named_never_counted_zero() -> None:
    te = _te()
    partial = [{k: v for k, v in s.items() if k != "tunnel-end"} for s in samples()]
    record = te.record_of(
        partial, volume_bytes=None, minutes=5, per_minute=60, started=0.0, ended=300.0
    )
    assert record["missing"] == ["tunnel-end"] and record["type"] is None
    assert "tunnel-end" in "\n".join(te.block(record))


# --- The run's plumbing ------------------------------------------------------------------------------------------------


# deploy/compose.yaml's memory limits on the five, in MiB, as docker stats reports each container's: 528 MiB together.
LIMITS = {
    "tunnel-end": 32,
    "relay": 96,
    "snapshot-sink": 48,
    "tunnel-end-collector": 96,
    "shared-state": 256,
}
LOAD_LINE = json.dumps(
    {
        "h4_measure_load": 1,
        "hello": {"200": 300},
        "status": {"200": 60},
        "part": {"202": 5},
    }
)


class Runner:
    def __init__(
        self,
        fail_on: str | None = None,
        fail_times: int | None = None,
        events: list[str] | None = None,
        load_line: str = LOAD_LINE,
    ) -> None:
        self.calls: list[list[str]] = []
        self.stdins: list[str | None] = []
        self.timeouts: list[float] = []
        self.fail_on = fail_on
        self.fail_times = fail_times
        self.env_files: list[Path] = []
        self.events = events if events is not None else []
        self.load_line = load_line

    def __call__(
        self, argv: list[str], stdin: str | None = None, timeout: float = 120
    ) -> tuple[int, str, str]:
        self.calls.append(list(argv))
        self.stdins.append(stdin)
        self.timeouts.append(timeout)
        if "--env-file" in argv:
            path = Path(argv[argv.index("--env-file") + 1])
            self.env_files.append(path)
            assert path.is_file()
        joined = " ".join(argv)
        self.events.append(f"run {joined}")
        failing = self.fail_on is not None and self.fail_on in f" {joined} "
        if failing and (self.fail_times is None or self.fail_times > 0):
            if self.fail_times is not None:
                self.fail_times -= 1
            return 1, "", "failed"
        if " stats " in f" {joined} ":
            return (
                0,
                "\n".join(
                    json.dumps(
                        {
                            "Name": f"h4reet-measure-tunnel-end-{s}-1",
                            "MemUsage": f"10MiB / {LIMITS[s]}MiB",
                        }
                    )
                    for s in FIVE
                ),
                "",
            )
        if " du " in f" {joined} ":
            return 0, "49152\t/var/lib/postgresql/data\n", ""
        if argv[:2] == ["docker", "logs"]:
            return 0, f"starting\n{self.load_line}\n", ""
        if " ps " in f" {joined} ":
            return (
                0,
                "\n".join(
                    json.dumps(
                        {
                            "Name": f"h4reet-measure-tunnel-end-{s}-1",
                            "Service": s,
                            "State": "running",
                            "Image": "x",
                        }
                    )
                    for s in FIVE
                ),
                "",
            )
        return 0, "", ""


class Clock:
    def __init__(self) -> None:
        self.t = 1_800_000_000.0

    def __call__(self) -> float:
        return self.t

    def sleep(self, seconds: float) -> None:
        self.t += seconds


def context(te, runner: Runner, tmp_path: Path, minutes: int = 5, **extra):
    """A Context on a fake clock. The monotonic clock is passed only when the Context has one, so a test of an older
    harness reaches its own assertion rather than a TypeError."""
    clock = extra.pop("clock", None) or Clock()
    sleep = extra.pop("sleep", None) or clock.sleep
    said: list[str] = extra.pop("said", None) or []
    fields = te.Context.__dataclass_fields__
    kwargs = {
        "tree": REPO,
        "minutes": minutes,
        "run": runner,
        "clock": clock,
        "sleep": sleep,
        "say": said.append,
        "scratch_root": tmp_path,
    }
    if "monotonic" in fields:
        kwargs["monotonic"] = extra.pop("monotonic", clock)
    else:
        extra.pop("monotonic", None)
    if "hold_signals" in fields:
        kwargs["hold_signals"] = extra.pop("hold_signals", lambda: None)
    else:
        extra.pop("hold_signals", None)
    kwargs.update(extra)
    return te.Context(**kwargs), said


def run(te, runner: Runner, tmp_path: Path, minutes: int = 5, **extra):
    ctx, said = context(te, runner, tmp_path, minutes, **extra)
    return te.measure(ctx), said


def test_the_run_keeps_its_stand_in_secrets_in_a_temporary_folder_and_removes_them(
    tmp_path: Path,
) -> None:
    te = _te()
    runner = Runner()
    record, said = run(te, runner, tmp_path)
    assert runner.env_files
    for path in runner.env_files:
        assert path.is_relative_to(tmp_path)
        assert "deploy/env" not in str(path) and ".config" not in str(path)
        assert not path.exists()
    # The peaks (50 MiB together) fit t4g.micro; the five's limits (528 MiB) need t4g.small, and the larger stands
    # (the safety review's nit 5).
    assert record["type"] == "t4g.small"
    stand_in_values = set()
    for stdin in runner.stdins:
        if stdin:
            stand_in_values |= set(re.findall(r"'([A-Za-z0-9_-]{32,})'", stdin))
    text = "\n".join(said)
    for value in stand_in_values:
        assert value not in text


def test_the_run_takes_down_its_project_with_its_volumes_whatever_happens(
    tmp_path: Path,
) -> None:
    te = _te()
    for fail_on in (None, " up ", "stats"):
        runner = Runner(fail_on=fail_on)
        try:
            run(te, runner, tmp_path)
        except te.Stop:
            pass
        downs = [c for c in runner.calls if "down" in c]
        assert downs, fail_on
        assert "-v" in downs[-1] and te.PROJECT in downs[-1], fail_on


def test_the_run_names_its_five_services_and_the_stub_and_no_other(
    tmp_path: Path,
) -> None:
    te = _te()
    runner = Runner()
    run(te, runner, tmp_path)
    (up,) = [c for c in runner.calls if " up " in f" {' '.join(c)} "]
    # The word after --profile isn't a service: the profile and the service share the name `tunnel-end`.
    named = [
        a
        for i, a in enumerate(up)
        if a in (*FIVE, "measure-host") and not (i > 0 and up[i - 1] == "--profile")
    ]
    assert sorted(named) == sorted((*FIVE, "measure-host"))
    assert set(te.SERVICES) == {*FIVE, "measure-host"}


# --- The safety review's nits (the note's "T166's harness, and the final review") ----------------------------------------


def test_the_overlay_never_restarts_the_five_after_the_run() -> None:
    # Nit 1: the base's `restart: unless-stopped` would bring an interrupted measurement back at the engine's next start.
    services = overlay()["services"]
    for name in FIVE:
        assert services[name].get("restart") == "no", name


def test_cleanup_holds_the_signals_and_takes_the_project_down_even_when_saying_so_fails(
    tmp_path: Path,
) -> None:
    # Nit 1: a second Ctrl-C, a closed terminal's SIGHUP, or its EIO on print must not stop the down.
    te = _te()
    events: list[str] = []
    runner = Runner(events=events)

    def say(text: str) -> None:
        if "taking" in text:
            raise OSError(5, "Input/output error")

    try:
        run(
            te,
            runner,
            tmp_path,
            say=say,
            hold_signals=lambda: events.append("hold"),
        )
    except OSError:
        pass  # the harness as it was: the failed print ended the cleanup; the assertions below say so
    downs = [i for i, e in enumerate(events) if " down " in f"{e} "]
    assert downs, events
    assert "hold" in events and events.index("hold") < downs[-1]


def test_the_default_hold_ignores_sigint_sigterm_and_sighup() -> None:
    import signal

    te = _te()
    sigs = (signal.SIGINT, signal.SIGTERM, signal.SIGHUP)
    saved = {sig: signal.getsignal(sig) for sig in sigs}
    try:
        te.hold_signals()
        for sig in sigs:
            assert signal.getsignal(sig) is signal.SIG_IGN, sig
    finally:
        for sig, handler in saved.items():
            signal.signal(sig, handler)


@pytest.mark.parametrize("failing", [" ps ", " stats "])
def test_a_failed_sample_is_skipped_and_counted_not_fatal(
    tmp_path: Path, failing: str
) -> None:
    # Nit 2: one transient docker failure no longer throws the run away.
    te = _te()
    runner = Runner(fail_on=failing, fail_times=2)
    record, _said = run(te, runner, tmp_path)
    assert record["failed_samples"] == 2
    assert record["samples"] == 5 * 60 // te.INTERVAL_S - 2
    assert record["type"] is not None


def test_the_data_volume_is_read_from_the_projects_own_volume_alone(
    tmp_path: Path,
) -> None:
    # Nit 2: never `docker system df -v`, which sizes every volume on the engine, prod's among them.
    te = _te()
    runner = Runner()
    record, _said = run(te, runner, tmp_path)
    assert not [c for c in runner.calls if "system" in c and "df" in c]
    (du,) = [c for c in runner.calls if "du" in c]
    assert te.STORE_CONTAINER in du and "/var/lib/postgresql/data" in du
    assert record["data_volume_mib"] == 48.0


def test_a_failed_volume_read_is_said_and_the_peaks_kept(tmp_path: Path) -> None:
    te = _te()
    runner = Runner(fail_on=" du ")
    record, _said = run(te, runner, tmp_path)
    assert record["data_volume_mib"] is None
    assert record["peak_mib"] and record["type"] is not None
    assert "data volume after the run: not read" in "\n".join(te.block(record))


def test_the_load_is_given_its_grace_before_its_counts_are_read(tmp_path: Path) -> None:
    # Nit 3: a hello in flight at the deadline can hold the load's JSON line back.
    te = _te()
    runner = Runner()
    record, _said = run(te, runner, tmp_path)
    waits = [i for i, c in enumerate(runner.calls) if c[:2] == ["docker", "wait"]]
    logs = [i for i, c in enumerate(runner.calls) if c[:2] == ["docker", "logs"]]
    assert waits and logs and waits[0] < logs[0]
    assert te.LOAD_CONTAINER in runner.calls[waits[0]]
    assert runner.timeouts[waits[0]] >= te.GRACE_S
    assert record["load"]["hello"] == {"200": 300}


def test_missing_load_counts_are_said(tmp_path: Path) -> None:
    te = _te()
    runner = Runner(load_line="")
    record, _said = run(te, runner, tmp_path)
    assert "load counts not read" in "\n".join(te.block(record))


def test_the_sampling_window_is_kept_by_the_monotonic_clock(tmp_path: Path) -> None:
    # Nit 4: the wall clock steps back on this WSL host; the window must not grow with it.
    te = _te()

    class Wall:
        def __init__(self, mono: Clock) -> None:
            self.mono = mono
            self.calls = 0

        def __call__(self) -> float:
            self.calls += 1
            back = 3600.0 if self.calls > 3 else 0.0
            return self.mono.t - back

    mono = Clock()
    wall = Wall(mono)
    record, _said = run(
        te, Runner(), tmp_path, clock=wall, sleep=mono.sleep, monotonic=mono
    )
    assert record["samples"] == 5 * 60 // te.INTERVAL_S


def test_the_record_names_the_limits_and_the_larger_of_the_two_types() -> None:
    # Nit 5: the five's limits (528 MiB) with the OS's and Docker's 512 MiB need t4g.small, though the peaks fit
    # t4g.micro; the type the block recommends is the larger.
    te = _te()
    record = te.record_of(
        samples(),
        volume_bytes=48 * MIB,
        minutes=30,
        per_minute=60,
        started=1_800_000_000.0,
        ended=1_800_001_800.0,
        limits={k: v * MIB for k, v in LIMITS.items()},
    )
    assert record["limits_total_mib"] == 528.0
    assert record["type_by_peaks"] == "t4g.micro"
    assert record["type_by_limits"] == "t4g.small"
    assert record["type"] == "t4g.small"
    text = "\n".join(te.block(record))
    assert "528.0 MiB" in text and "t4g.small" in text and "t4g.micro" in text
    assert "h4-snapshot-sink.service" in text and "h4-shared-state-backup.timer" in text
    assert "not counted" in text


def test_the_larger_type_is_the_peaks_when_they_pass_the_limits() -> None:
    te = _te()
    big = [{k: 600 * MIB for k in FIVE}]
    record = te.record_of(
        big,
        volume_bytes=None,
        minutes=5,
        per_minute=60,
        started=0.0,
        ended=300.0,
        limits={k: v * MIB for k, v in LIMITS.items()},
    )
    assert record["type_by_peaks"] == "t4g.large"
    assert record["type"] == "t4g.large"


def test_the_run_reads_each_services_limit_from_docker_stats(tmp_path: Path) -> None:
    te = _te()
    record, _said = run(te, Runner(), tmp_path)
    assert record["limits_mib"] == {k: float(v) for k, v in LIMITS.items()}
    assert record["limits_total_mib"] == 528.0


def test_the_longest_run_stays_under_the_stand_in_daily_cap() -> None:
    # Nit 7: past about 133 minutes each of the load's addresses passes the stand-in's requests a day, and the relay
    # answers 429.
    te = _te()
    spec = importlib.util.spec_from_file_location(
        "h4_measure_load", MEASURE / "load_tunnel_end.py"
    )
    assert spec and spec.loader
    load = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(load)
    per_day = yaml.safe_load(STAND_IN.read_text(encoding="utf-8"))["public"][
        "per_address"
    ]["requests_per_day"]
    per_minute = te.metered_per_minute(REPO)
    assert te.MAX_MINUTES * per_minute < len(load.ADDRESSES) * per_day


# --- make measure-tunnel-end ------------------------------------------------------------------------------------------

needs_make = pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")


@needs_make
def test_make_measure_tunnel_end_runs_the_script_with_minutes_as_typed() -> None:
    done = subprocess.run(
        [
            "make",
            "--no-print-directory",
            "-C",
            str(REPO),
            "-n",
            "measure-tunnel-end",
            "MINUTES=45",
        ],
        env={
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "HOME": "/nonexistent",
            "LC_ALL": "C",
            "DOCKER_HOST": "tcp://198.18.0.1:2376",
        },
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    assert done.returncode == 0, done.stderr
    assert "deploy/scripts/measure_tunnel_end.py --minutes=" in done.stdout
    assert "AUTHOR_ONLY" not in done.stdout
