"""Tests for deploy/scripts/pull-models.sh: a fake curl and a fake disk preflight, fixture models, and the real script.

The script runs from a fixture tree, so the preflight.py beside it is the fake one, and curl is found first on PATH.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import stat
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "deploy" / "scripts" / "pull-models.sh"
REVISION = "0123456789abcdef0123456789abcdef01234567"

# The fake curl: it logs its arguments, then writes the fixture file the URL names into the -o path, resuming from
# the size already there, as -C - does. FAKE_CURL_CORRUPT writes other bytes of the same length; FAKE_CURL_STOP
# stops after that many bytes and exits 18, as an interrupted transfer does.
FAKE_CURL = """#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
with open(os.environ["FAKE_CURL_LOG"], "a", encoding="utf-8") as log:
    log.write(json.dumps(args) + "\\n")
out = args[args.index("-o") + 1]
name = args[-1].rsplit("/", 1)[-1]
with open(os.path.join(os.environ["FAKE_CURL_DIR"], name), "rb") as source:
    body = source.read()
if os.environ.get("FAKE_CURL_CORRUPT"):
    body = bytes(len(body))
start = os.path.getsize(out) if os.path.exists(out) and "-C" in args else 0
stop = int(os.environ.get("FAKE_CURL_STOP", len(body)))
with open(out, "ab" if start else "wb") as target:
    target.write(body[start:stop])
sys.exit(18 if stop < len(body) else 0)
"""

# The fake disk preflight, in the tree's own deploy/scripts: it logs its arguments and answers FAKE_PREFLIGHT_EXIT.
FAKE_PREFLIGHT = """import json, os, sys
with open(os.environ["FAKE_PREFLIGHT_LOG"], "a", encoding="utf-8") as log:
    log.write(json.dumps(sys.argv[1:]) + "\\n")
print("PASS P13 the fake disk check")
sys.exit(int(os.environ.get("FAKE_PREFLIGHT_EXIT", "0")))
"""


class Stage:
    """A tree with the real script, a fake preflight beside it, a fake curl on PATH, and two fixture models."""

    def __init__(self, tmp_path: Path) -> None:
        self.tmp = tmp_path
        self.root = tmp_path / "tree"
        scripts = self.root / "deploy" / "scripts"
        scripts.mkdir(parents=True)
        shutil.copy2(SCRIPT, scripts / "pull-models.sh")
        (scripts / "preflight.py").write_text(FAKE_PREFLIGHT, encoding="utf-8")
        self.bin = tmp_path / "bin"
        self.bin.mkdir()
        curl = self.bin / "curl"
        curl.write_text(FAKE_CURL, encoding="utf-8")
        curl.chmod(0o755)
        self.downloads = tmp_path / "hub"
        self.downloads.mkdir()
        self.models = tmp_path / "models"
        self.bodies = {
            "big-model-q4.gguf": b"GGUF" + bytes(range(256)) * 64,
            "small-model-q4.gguf": b"GGUF" + b"stand-in" * 300,
        }
        lines = ["# id alias repo revision file sha256 bytes license vram stacks"]
        for name, body in self.bodies.items():
            (self.downloads / name).write_bytes(body)
            stacks = "prod" if name.startswith("big") else "dev,dev-cpu"
            lines.append(
                f"{name[:-5]} {name[:-8]} org/{name[:-5]}-GGUF {REVISION} {name} "
                f"{hashlib.sha256(body).hexdigest()} {len(body)} Apache-2.0 1GiB {stacks}"
            )
        self.lock = self.root / "deploy" / "models.lock"
        self.lock.write_text("\n".join(lines) + "\n", encoding="utf-8")
        self.env_file = tmp_path / "stack.env"
        self.set_env("small-model-q4.gguf")
        self.curl_log = tmp_path / "curl.log"
        self.preflight_log = tmp_path / "preflight.log"
        self.environ = {
            "PATH": f"{self.bin}:/usr/bin:/bin",
            "HOME": str(tmp_path),
            "FAKE_CURL_LOG": str(self.curl_log),
            "FAKE_CURL_DIR": str(self.downloads),
            "FAKE_PREFLIGHT_LOG": str(self.preflight_log),
        }

    def set_env(self, model_file: str, model_dir: str | None = None) -> None:
        self.env_file.write_text(
            "# a fixture env file\n"
            f"H4_MODEL_DIR={model_dir or self.models}\n"
            f"MODEL_FILE={model_file}\n"
            "H4_VHDX_MOUNT=/mnt/c\n",
            encoding="utf-8",
        )

    def run(self, *args: str, **environ: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["bash", str(self.root / "deploy/scripts/pull-models.sh"), *args],
            capture_output=True,
            text=True,
            env={**self.environ, **environ},
            check=False,
            timeout=60,
        )

    def pull(
        self, stack: str = "dev", *more: str, **environ: str
    ) -> subprocess.CompletedProcess:
        return self.run(
            "--stack", stack, "--env-file", str(self.env_file), *more, **environ
        )

    def calls(self, log: Path) -> list[list[str]]:
        if not log.exists():
            return []
        return [
            json.loads(line) for line in log.read_text(encoding="utf-8").splitlines()
        ]

    def place(self, name: str, body: bytes | None = None, mode: int = 0o444) -> Path:
        self.models.mkdir(exist_ok=True)
        path = self.models / name
        path.unlink(missing_ok=True)  # it may be a read-only model already
        path.write_bytes(self.bodies[name] if body is None else body)
        path.chmod(mode)
        return path


@pytest.fixture
def stage(tmp_path: Path) -> Stage:
    return Stage(tmp_path)


def mode(path: Path) -> int:
    return stat.S_IMODE(path.stat().st_mode)


def test_a_missing_model_is_downloaded_verified_and_renamed_into_place(
    stage: Stage,
) -> None:
    done = stage.pull()
    assert done.returncode == 0, done.stderr
    final = stage.models / "small-model-q4.gguf"
    assert (
        final.read_bytes() == stage.bodies["small-model-q4.gguf"]
        and mode(final) == 0o444
    )
    assert sorted(p.name for p in stage.models.iterdir()) == [
        "small-model-q4.gguf"
    ]  # no .part left
    (args,) = stage.calls(stage.curl_log)
    # curl reads no .curlrc (-q, first), resumes (-C -), fails on HTTP errors, and stays on https through redirects.
    assert args[0] == "-q"
    assert "-fL" in args and args[args.index("-C") + 1] == "-"
    assert args[args.index("--proto") + 1] == "=https"
    assert args[args.index("--proto-redir") + 1] == "=https"
    assert args[args.index("-o") + 1] == str(stage.models / ".small-model-q4.gguf.part")
    assert (
        args[-1]
        == f"https://huggingface.co/org/small-model-q4-GGUF/resolve/{REVISION}/small-model-q4.gguf"
    )
    # No token, no credential, no header, no netrc.
    for flag in (
        "-H",
        "--header",
        "-u",
        "--user",
        "-n",
        "--netrc",
        "--netrc-file",
        "--oauth2-bearer",
        "-K",
    ):
        assert flag not in args, flag
    assert not [a for a in args if "authorization" in a.lower() or "token" in a.lower()]
    # The disk check ran first, for the bytes to come, on the env file's Windows drive.
    (check,) = stage.calls(stage.preflight_log)
    size = str(len(stage.bodies["small-model-q4.gguf"]))
    assert check == [
        "--disk-only",
        "--bytes",
        size,
        "--path",
        str(stage.models),
        "--vhdx-mount",
        "/mnt/c",
    ]
    assert "models: 1 of 1 present and verified" in done.stdout


def test_a_present_model_is_never_fetched_again(stage: Stage) -> None:
    stage.place("small-model-q4.gguf")
    done = stage.pull()
    assert done.returncode == 0 and "present" in done.stdout
    assert stage.calls(stage.curl_log) == [] and stage.calls(stage.preflight_log) == []


def test_a_present_model_with_another_mode_is_verified_before_it_is_made_read_only(
    stage: Stage,
) -> None:
    path = stage.place("small-model-q4.gguf", mode=0o644)
    done = stage.pull()
    assert done.returncode == 0 and mode(path) == 0o444
    assert "its sha256 matches the lock" in done.stdout
    other = bytes(len(stage.bodies["small-model-q4.gguf"]))
    path.chmod(0o644)
    path.write_bytes(other)
    done = stage.pull()
    assert (
        done.returncode == 1 and "sha256 isn't the lock's: move it aside" in done.stderr
    )
    assert (
        path.read_bytes() == other and mode(path) == 0o644
    )  # left as it was, for the Author
    assert stage.calls(stage.curl_log) == []


def test_a_file_of_another_size_is_refused_and_left_alone(stage: Stage) -> None:
    path = stage.place("small-model-q4.gguf", body=b"short")
    done = stage.pull()
    assert done.returncode == 1 and "5 bytes, not the lock's" in done.stderr
    assert path.read_bytes() == b"short" and stage.calls(stage.curl_log) == []


def test_a_link_in_the_cache_is_refused(stage: Stage, tmp_path: Path) -> None:
    real = tmp_path / "elsewhere.gguf"
    real.write_bytes(stage.bodies["small-model-q4.gguf"])
    stage.models.mkdir()
    (stage.models / "small-model-q4.gguf").symlink_to(real)
    done = stage.pull()
    assert done.returncode == 1 and "a symbolic link" in done.stderr
    assert stage.calls(stage.curl_log) == []


def test_a_download_that_doesnt_match_the_lock_is_removed(stage: Stage) -> None:
    done = stage.pull(FAKE_CURL_CORRUPT="1")
    assert (
        done.returncode == 1
        and "sha256 isn't the lock's, so the download was removed" in done.stderr
    )
    assert list(stage.models.iterdir()) == []  # neither the file nor its .part


def test_an_interrupted_download_keeps_its_part_and_the_next_run_resumes_it(
    stage: Stage,
) -> None:
    body = stage.bodies["small-model-q4.gguf"]
    done = stage.pull(FAKE_CURL_STOP="1000")
    assert done.returncode == 1 and "make pull resumes it" in done.stderr
    part = stage.models / ".small-model-q4.gguf.part"
    assert (
        part.read_bytes() == body[:1000]
        and not (stage.models / "small-model-q4.gguf").exists()
    )
    done = stage.pull()
    assert done.returncode == 0, done.stderr
    assert (
        stage.models / "small-model-q4.gguf"
    ).read_bytes() == body and not part.exists()
    # The second disk check counted only the bytes still to come.
    assert stage.calls(stage.preflight_log)[-1][2] == str(len(body) - 1000)


def test_the_disk_check_comes_before_any_download(stage: Stage) -> None:
    done = stage.pull(FAKE_PREFLIGHT_EXIT="1")
    assert done.returncode == 1 and "the disk check refused the download" in done.stderr
    assert stage.calls(stage.curl_log) == []


def test_all_fetches_every_entry_of_the_lock(stage: Stage) -> None:
    done = stage.pull("prod", "--all")
    assert done.returncode == 0, done.stderr
    assert sorted(p.name for p in stage.models.iterdir()) == [
        "big-model-q4.gguf",
        "small-model-q4.gguf",
    ]
    assert len(stage.calls(stage.curl_log)) == 2


def test_without_all_only_the_stacks_own_model(stage: Stage) -> None:
    stage.set_env("big-model-q4.gguf")
    assert stage.pull("dev").returncode == 1  # the big model's stacks are prod only
    assert stage.pull("prod").returncode == 0
    assert [p.name for p in stage.models.iterdir()] == ["big-model-q4.gguf"]


def test_the_agents_engine_only_verifies(stage: Stage) -> None:
    done = stage.pull("dev-cpu")
    assert (
        done.returncode == 1
        and "ask the Author to run deploy/agents-engine/engine.sh seed" in done.stderr
    )
    stage.place("small-model-q4.gguf")
    done = stage.pull("dev-cpu")
    assert done.returncode == 0 and "verified on the agents' engine" in done.stdout
    stage.place(
        "small-model-q4.gguf", body=bytes(len(stage.bodies["small-model-q4.gguf"]))
    )
    done = stage.pull("dev-cpu")
    assert (
        done.returncode == 1
        and "sha256 isn't the lock's: ask the Author" in done.stderr
    )
    assert stage.calls(stage.curl_log) == [] and stage.calls(stage.preflight_log) == []


def test_the_env_file_is_read_as_data(stage: Stage) -> None:
    marker = stage.tmp / "ran"
    stage.env_file.write_text(
        f"H4_MODEL_DIR='{stage.models}'\n"
        "MODEL_FILE=small-model-q4.gguf\n"
        f"H4_VHDX_MOUNT=$(touch {marker})\n"
        f"`touch {marker}`\n",
        encoding="utf-8",
    )
    done = stage.pull()
    assert done.returncode == 0, done.stderr
    assert not marker.exists()
    assert (
        stage.models / "small-model-q4.gguf"
    ).is_file()  # the single quotes came off H4_MODEL_DIR


@pytest.mark.parametrize(
    "line",
    [
        f"x a org/x {REVISION} ../escape.gguf {'1' * 64} 10 MIT 1GiB dev",
        f"x a org/x/y {REVISION} x.gguf {'1' * 64} 10 MIT 1GiB dev",
        f"x a org/x {REVISION[:12]} x.gguf {'1' * 64} 10 MIT 1GiB dev",
        f"x a org/x {REVISION} x.gguf {'1' * 63} 10 MIT 1GiB dev",
        f"x a org/x {REVISION} x.bin {'1' * 64} 10 MIT 1GiB dev",
        f"x a org/x {REVISION} x.gguf {'1' * 64} ten MIT 1GiB dev",
        f"x a org/x {REVISION} x.gguf {'1' * 64} 10 MIT 1GiB dev extra",
        f"x a ?org=x {REVISION} x.gguf {'1' * 64} 10 MIT 1GiB dev",
    ],
)
def test_a_lock_line_out_of_shape_stops_everything(stage: Stage, line: str) -> None:
    with stage.lock.open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")
    done = stage.pull()
    assert done.returncode == 1 and "isn't id alias repo revision" in done.stderr
    assert stage.calls(stage.curl_log) == []


def test_a_model_file_the_lock_doesnt_name(stage: Stage) -> None:
    stage.set_env("other.gguf")
    done = stage.pull()
    assert done.returncode == 1 and "names no" in done.stderr


@pytest.mark.parametrize(
    "args",
    [
        [],
        ["--stack", "staging", "--env-file", "x"],
        ["--stack", "dev"],
        ["--stack", "dev", "--env-file"],
        ["--stack", "dev-cpu", "--env-file", "x", "--all"],
        ["--stack", "dev", "--env-file", "/nonexistent/stack.env"],
        ["--stack", "dev", "--env-file", "x", "--verbose"],
    ],
)
def test_usage(stage: Stage, args: list[str]) -> None:
    assert stage.run(*args).returncode == 2


def test_inside_the_sandbox_only_the_engine_stack_runs(stage: Stage) -> None:
    done = stage.pull("dev", SANDBOX_RUNTIME="1")
    assert done.returncode == 2 and "Author's terminal" in done.stderr
    stage.place("small-model-q4.gguf")
    assert stage.pull("dev-cpu", SANDBOX_RUNTIME="1").returncode == 0


def test_the_committed_script_is_executable_by_bash_and_names_its_own_flags() -> None:
    text = SCRIPT.read_text(encoding="utf-8")
    assert text.startswith("#!/usr/bin/env bash\n") and "set -euo pipefail" in text
    assert "source " not in text and "eval " not in text  # the env file is never run
    assert os.access(SCRIPT, os.R_OK)
