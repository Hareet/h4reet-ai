"""Group 7's fixes, reviewed (the review of a59d52a9..7c5f1259): what the release refuses now.

- I1: a public release needs a passing run of its commit on each host's two route adapters, the laptop's and EC2's,
  read from the export's config/routing.yaml; a route the export doesn't name refuses it;
- I2: the release runs only as main's own code: its own bytes and the Makefile's are refs/heads/main's blobs, or it
  refuses before anything is built; and every git command it runs has replace objects off;
- nit 1: the gate's line must report a pass: no failing step, no PENDING, no DEGRADED run.
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "test_release_for_fixes", HERE / "test_release.py"
)
assert SPEC and SPEC.loader
base = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = base
SPEC.loader.exec_module(base)
rl = base.rl


def test_a_public_release_needs_ec2s_own_runs_not_the_laptops_of_the_same_adapter(
    tmp_path: Path,
) -> None:
    r = base.Runner()
    laptop_only = base.history(
        tmp_path, {"laptop/local": 0, "laptop/anthropic": 0, "laptop/bedrock": 0}
    )
    assert base.run(tmp_path, r, public=True, folder=laptop_only) == 1
    assert r.builds() == []


def test_an_export_without_ec2s_route_refuses_a_public_release(tmp_path: Path) -> None:
    path, sha = base.plugin(tmp_path)
    code = rl.run(
        rl.Options(
            registry=base.REGISTRY,
            bucket=base.BUCKET,
            compose_plugin=path,
            compose_sha256=sha,
            public=True,
            local=tmp_path / "releases",
            redteam=base.history(tmp_path, dict.fromkeys(base.FOUR, 0)),
        ),
        base.Runner(),
        root=base.REPO,
        now=lambda: "20261113T010203Z",
        exported=base.exported,
        routing_of=lambda src: {
            "envs": {
                "prod": {
                    "hosts": {"laptop": {"primary": "local", "fallback": "anthropic"}}
                }
            }
        },
    )
    assert code == 1


# Group 8's review A, nit 2: GNU make reads GNUmakefile first, so it is one of main's files too.
@pytest.mark.parametrize(
    "path", ["deploy/scripts/release.py", "Makefile", "GNUmakefile"]
)
def test_the_release_refuses_unless_it_and_the_makefile_are_mains(
    tmp_path: Path, path: str, capsys
) -> None:
    r = base.Runner()
    r.blobs[path] = "0" * 40
    assert base.run(tmp_path, r) == 1
    assert r.builds() == [] and r.uploads == []
    assert "main's checkout" in capsys.readouterr().err


# Group 8's review B, I3: EC2's run is keyed by what its cases exercise, so a release whose export holds the same
# bytes counts an earlier release's run, and one that changes them needs its own.
ROUTING = {
    "envs": {
        "prod": {
            "hosts": {
                "laptop": {"primary": "local", "fallback": "anthropic"},
                "ec2": {"first": "anthropic", "second": "bedrock"},
            }
        }
    }
}


def records(tmp_path: Path, ec2_commit: str, exercised: str) -> Path:
    folder = tmp_path / "history"
    folder.mkdir()
    for name in base.FOUR:
        host, _, adapter = name.rpartition("/")
        record = {
            "adapter": adapter,
            "host": host,
            "cases": 48,
            "failed": 0,
            "unjudged": 0,
            "finished": "2027-01-01T00:00:00+00:00",
            "suite": "redteam",
            "commit": base.COMMIT if host == "laptop" else ec2_commit,
            "exercised": exercised,
        }
        (folder / f"{name.replace('/', '-')}.json").write_text(
            json.dumps(record), encoding="utf-8"
        )
    return folder


def test_an_ec2_run_of_an_earlier_release_counts_while_what_it_exercised_is_the_same(
    tmp_path: Path,
) -> None:
    folder = records(tmp_path, "e" * 40, "f" * 64)
    rl.check_redteam(folder, base.COMMIT, ROUTING, exercised="f" * 64)


def test_an_ec2_run_whose_exercised_files_changed_doesnt(tmp_path: Path) -> None:
    folder = records(tmp_path, "e" * 40, "f" * 64)
    with pytest.raises(rl.Refused, match="ec2/anthropic"):
        rl.check_redteam(folder, base.COMMIT, ROUTING, exercised="0" * 64)


def test_the_release_and_the_runner_hash_the_same_files_alike() -> None:
    rt = _load_runner()
    assert rl.exercised(base.REPO) == rt.exercised(base.REPO)
    assert rl.EXERCISED == rt.EXERCISED


def _load_runner():
    spec = importlib.util.spec_from_file_location(
        "redteam_run_for_release", base.REPO / "redteam" / "run.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_every_command_runs_with_replace_objects_off(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[dict] = []

    def fake(argv, **kwargs):
        seen.append(kwargs.get("env") or {})
        return subprocess.CompletedProcess(argv, 0, "", "")

    monkeypatch.setattr(rl.subprocess, "run", fake)
    rl.subprocess_runner(["git", "show", "-s", "HEAD"])
    rl.subprocess_runner(["docker", "buildx", "ls"], env={"PATH": "/usr/bin"})
    assert all(e.get("GIT_NO_REPLACE_OBJECTS") == "1" for e in seen) and len(seen) == 2


@pytest.mark.parametrize(
    "line",
    [
        "gate: {tip} (feat/x) by tools/gates/gate at {p}: 21 PASS, 4 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 1 FAIL; failing: test FAIL",
        "gate: {tip} (feat/x) by tools/gates/gate at {p}: 21 PASS, 0 PLANNED, 1 PENDING, 0 FAIL; failing: plan PENDING",
        "gate: {tip} (feat/x) by tools/gates/gate at {p}: 9 PASS, 0 FAIL; DEGRADED (--host): no container phase",
    ],
)
def test_a_gate_line_that_doesnt_report_a_pass_is_refused(
    tmp_path: Path, line: str
) -> None:
    r = base.Runner()
    text = line.format(tip=base.TIP, p=base.PARENT[:12])
    r.merge = f"{base.PARENT} {base.TIP}\nMerge feat/x ({base.TIP[:12]})\n\n{text}\n"
    assert base.run(tmp_path, r) == 1
    assert r.builds() == []


def test_the_gates_full_passing_line_is_accepted(tmp_path: Path) -> None:
    r = base.Runner()
    line = f"gate: {base.TIP} (feat/x) by tools/gates/gate at {base.PARENT[:12]}: 22 PASS, 4 SKIP, 1 WARN, 0 PLANNED, 0 PENDING, 0 FAIL"
    r.merge = f"{base.PARENT} {base.TIP}\nMerge feat/x ({base.TIP[:12]})\n\n{line}\n"
    assert base.run(tmp_path, r) == 0


def test_the_exercised_files_are_the_whole_gateway_but_its_tests(tmp_path: Path) -> None:
    # Group 8's fixes' review, nit 1: the gateway's Dockerfile, its migrations, and its build settings change what EC2
    # runs as surely as its source; its tests don't. So the key hashes services/gateway whole, less test/.
    gw = tmp_path / "services" / "gateway"
    for rel, text in {
        "src/a.ts": "a",
        "test/a.test.ts": "t",
        "Dockerfile": "FROM x",
        "migrations/0001.sql": "create",
        "tsconfig.build.json": "{}",
        "package.json": "{}",
    }.items():
        (gw / rel).parent.mkdir(parents=True, exist_ok=True)
        (gw / rel).write_text(text, encoding="utf-8")
    first = rl.exercised(tmp_path)
    (gw / "test" / "a.test.ts").write_text("t2", encoding="utf-8")
    assert rl.exercised(tmp_path) == first
    for rel in ("Dockerfile", "migrations/0001.sql", "tsconfig.build.json"):
        before = rl.exercised(tmp_path)
        (gw / rel).write_text("changed " + rel, encoding="utf-8")
        assert rl.exercised(tmp_path) != before, rel
    rt = _load_runner()
    assert rt.exercised(tmp_path) == rl.exercised(tmp_path)
