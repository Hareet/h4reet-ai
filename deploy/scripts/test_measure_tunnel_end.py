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
    text = " ".join(strings(overlay()))
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
        text = json.dumps(service)
        for mark in ("10.42.", "/run/h4reet", "/srv/h4reet", "config/budgets.yaml"):
            assert mark not in text, (name, mark)


# --- The budgets stand-in ----------------------------------------------------------------------------------------------


def test_the_stand_in_is_config_budgets_with_stand_in_public_figures_alone() -> None:
    real = yaml.safe_load(
        (REPO / "config" / "budgets.yaml").read_text(encoding="utf-8")
    )
    stand_in = yaml.safe_load(STAND_IN.read_text(encoding="utf-8"))
    figures = stand_in["public"]
    assert {k: v for k, v in stand_in.items() if k != "public"} == {
        k: v for k, v in real.items() if k != "public"
    }
    for group in ("per_address", "global"):
        assert set(figures[group]) == set(real["public"][group]), group
        for key, value in figures[group].items():
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


class Runner:
    def __init__(self, fail_on: str | None = None) -> None:
        self.calls: list[list[str]] = []
        self.stdins: list[str | None] = []
        self.fail_on = fail_on
        self.env_files: list[Path] = []

    def __call__(
        self, argv: list[str], stdin: str | None = None, timeout: float = 120
    ) -> tuple[int, str, str]:
        self.calls.append(list(argv))
        self.stdins.append(stdin)
        if "--env-file" in argv:
            path = Path(argv[argv.index("--env-file") + 1])
            self.env_files.append(path)
            assert path.is_file()
        joined = " ".join(argv)
        if self.fail_on and self.fail_on in joined:
            return 1, "", "failed"
        if " stats " in f" {joined} ":
            return (
                0,
                "\n".join(
                    json.dumps(
                        {
                            "Name": f"h4reet-measure-tunnel-end-{s}-1",
                            "MemUsage": "10MiB / 1GiB",
                        }
                    )
                    for s in FIVE
                ),
                "",
            )
        if "system df" in joined:
            return (
                0,
                json.dumps(
                    {
                        "Volumes": [
                            {
                                "Name": "h4reet-measure-tunnel-end_measure-shared-state-data",
                                "Size": "48MB",
                            }
                        ]
                    }
                ),
                "",
            )
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


def run(te, runner: Runner, tmp_path: Path, minutes: int = 5):
    clock = Clock()
    said: list[str] = []
    ctx = te.Context(
        tree=REPO,
        minutes=minutes,
        run=runner,
        clock=clock,
        sleep=clock.sleep,
        say=said.append,
        scratch_root=tmp_path,
    )
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
    assert record["type"] == "t4g.micro"
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
    named = [a for a in up if a in (*FIVE, "measure-host")]
    assert sorted(named) == sorted((*FIVE, "measure-host"))
    assert set(te.SERVICES) == {*FIVE, "measure-host"}


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
