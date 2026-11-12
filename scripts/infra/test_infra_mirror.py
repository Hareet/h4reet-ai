"""Tests for scripts/infra/infra_mirror.py, make infra-mirror (spec 001 tasks.md T008, T011; research.md R-14): it
seeds the provider mirror at .devcontainer/toolchain.vars's pins, with a fake terraform, in a temporary home. It is the
Author's: the sandbox refuses it, and so does the bash gate (P-1)."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "scripts" / "infra" / "infra_mirror.py"
FAKE = f"""#!{sys.executable} -I
import json, os, sys
from pathlib import Path
args = sys.argv[1:]
fake = json.loads(Path(__file__).with_name("fake.json").read_text(encoding="utf-8"))
with open(fake["log"], "a", encoding="utf-8") as log:
    chdir = next((a.split("=", 1)[1] for a in args if a.startswith("-chdir=")), None)
    versions = Path(chdir, "versions.tf").read_text(encoding="utf-8") if chdir else None
    log.write(json.dumps({{"argv": args, "env": sorted(os.environ), "checkpoint": os.environ.get("CHECKPOINT_DISABLE"),
                          "versions_tf": versions}}) + "\\n")
if args[:1] == ["version"]:
    print("Terraform v" + fake.get("tf", "1.17.1"))
    print("on linux_amd64")
    sys.exit(0)
if "providers" in args and "mirror" in args:
    folder = Path(args[-1], "registry.terraform.io", "hashicorp", "aws")
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "index.json").write_text("{{}}", encoding="utf-8")
    (folder / (fake.get("writes", "6.72.0") + ".json")).write_text("{{}}", encoding="utf-8")
    sys.exit(int(fake.get("exit", 0)))
sys.exit(9)
"""


@pytest.fixture
def stage(tmp_path: Path) -> dict:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "terraform").write_text(FAKE, encoding="utf-8")
    (bin_dir / "terraform").chmod(0o755)
    pins = tmp_path / "toolchain.vars"
    pins.write_text(
        "NODE_VERSION=24.21.0\nTERRAFORM_VERSION=1.17.1\nTERRAFORM_AWS_PROVIDER_VERSION=6.72.0\n",
        encoding="utf-8",
    )
    return {
        "bin": bin_dir,
        "pins": pins,
        "mirror": tmp_path / "mirror",
        "log": tmp_path / "calls.jsonl",
        "home": tmp_path,
    }


def run(stage: dict, *extra: str, **env: str) -> subprocess.CompletedProcess[str]:
    # The script hands terraform a clean environment, so the fake reads its controls from a file beside it; the
    # FAKE_* names given here go there, and everything else into the script's own environment.
    fake = {"log": str(stage["log"])}
    for key in [k for k in env if k.startswith("FAKE_")]:
        fake[key[len("FAKE_") :].lower()] = env.pop(key)
    (stage["bin"] / "fake.json").write_text(json.dumps(fake), encoding="utf-8")
    base = {"PATH": str(stage["bin"]), "HOME": str(stage["home"])}
    argv = [
        sys.executable,
        "-I",
        "-B",
        str(SCRIPT),
        "--vars",
        str(stage["pins"]),
        "--mirror",
        str(stage["mirror"]),
        *extra,
    ]
    return subprocess.run(
        argv, capture_output=True, text=True, env={**base, **env}, check=False
    )


def calls(stage: dict) -> list[dict]:
    log = stage["log"]
    return (
        [json.loads(x) for x in log.read_text(encoding="utf-8").splitlines()]
        if log.exists()
        else []
    )


def test_it_mirrors_the_pinned_provider(stage: dict) -> None:
    done = run(
        stage,
        TF_CLI_ARGS="-x",
        TF_CLI_ARGS_init="-y",
        AWS_PROFILE="p",
        TF_VAR_alert_email="x",
    )
    assert done.returncode == 0, done.stderr
    version, mirror = calls(stage)
    assert version["argv"] == ["version"]
    assert mirror["argv"][1:4] == ["providers", "mirror", "-platform=linux_amd64"]
    assert mirror["argv"][0].startswith("-chdir=") and mirror["argv"][-1] == str(
        stage["mirror"]
    )
    tf = mirror["versions_tf"]
    assert (
        'required_version = "1.17.1"' in tf
        and 'version = "6.72.0"' in tf
        and 'source  = "hashicorp/aws"' in tf
    )
    for call in (version, mirror):
        assert call["checkpoint"] == "1"
        assert not [k for k in call["env"] if k.startswith(("TF_", "AWS_"))]
    assert "hashicorp/aws 6.72.0" in done.stdout


def test_more_platforms_on_request(stage: dict) -> None:
    assert (
        run(stage, "--platform", "linux_amd64", "--platform", "linux_arm64").returncode
        == 0
    )
    mirror = calls(stage)[-1]
    assert [a for a in mirror["argv"] if a.startswith("-platform=")] == [
        "-platform=linux_amd64",
        "-platform=linux_arm64",
    ]


def test_it_is_the_authors(stage: dict) -> None:
    done = run(stage, SANDBOX_RUNTIME="1")
    assert done.returncode == 2 and "the Author's" in done.stderr
    assert calls(stage) == []


def test_terraform_must_be_the_pinned_release(stage: dict) -> None:
    done = run(stage, FAKE_TF="1.16.0")
    assert done.returncode == 2 and "1.16.0" in done.stderr and "1.17.1" in done.stderr
    assert len(calls(stage)) == 1  # the version check only


def test_the_pins_must_be_there(stage: dict) -> None:
    stage["pins"].write_text("NODE_VERSION=24.21.0\n", encoding="utf-8")
    assert run(stage).returncode == 2
    assert calls(stage) == []


def test_terraform_must_be_installed(stage: dict) -> None:
    (stage["bin"] / "terraform").unlink()
    assert run(stage).returncode == 2


def test_a_mirror_without_the_pin_fails(stage: dict) -> None:
    done = run(stage, FAKE_WRITES="6.71.0")
    assert done.returncode == 1 and "6.72.0" in done.stderr


def test_a_failed_mirror_fails(stage: dict) -> None:
    assert run(stage, FAKE_EXIT="1").returncode == 1


def test_make_infra_mirror_runs_it() -> None:
    makefile = (REPO / "Makefile").read_text(encoding="utf-8")
    (line,) = [ln for ln in makefile.splitlines() if ln.startswith("infra-mirror:")]
    assert "## (the Author)" in line
    assert "$(PY_HOST) scripts/infra/infra_mirror.py" in makefile
