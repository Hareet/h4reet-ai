"""The Makefile's command-line variables (T056's review, rounds 1 and 2).

make expands a command-line variable's value when it builds a recipe's environment, so "$5" vanishes and
"$(shell ...)" runs in the Author's make. The Makefile rebinds each name in LITERAL_VARS to the text typed. These
tests hold every variable a recipe reads from its shell, and every NAME= a target's help offers, to that list, or to
the short list of names that only ever come from the environment, so the next variable can't be missed.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
MAKEFILE = ROOT / "Makefile"
TEXT = MAKEFILE.read_text(encoding="utf-8")

# Read by recipes from the environment the Author's shell or the sandbox sets, never offered on the command line.
ENVIRONMENT_ONLY = {
    "CI",
    "DOCKER_HOST",
    "H4_DEVCONTAINER",
    "HOME",
    "SANDBOX_RUNTIME",
    "TMPDIR",
    "XDG_CACHE_HOME",
}


def literal_vars() -> set[str]:
    match = re.search(r"^LITERAL_VARS := (.+)$", TEXT, re.MULTILINE)
    assert match, "the Makefile names LITERAL_VARS"
    return set(match.group(1).split())


def recipe_reads() -> set[str]:
    """What recipes read from their shell's environment: $$NAME and $${NAME...} on every line that isn't a comment, so
    the macros recipes expand count too (REF_ARG, CONTAINED, OPERATOR_AGENTS), and the name each OPERATOR_VALUE or
    OPERATOR_FLAG call passes, which those macros read as $$$(1) (round 3's review)."""
    names: set[str] = set()
    for line in TEXT.splitlines():
        if line.lstrip().startswith("#"):
            continue
        names.update(re.findall(r"\$\$\{?([A-Z][A-Z0-9_]*)", line))
        names.update(
            re.findall(r"\$\(call OPERATOR_(?:VALUE|FLAG),([A-Z][A-Z0-9_]*)", line)
        )
    return names


def help_offers() -> set[str]:
    """NAME= in a target's ## help text: what `make help` tells the Author to type."""
    names: set[str] = set()
    for line in TEXT.splitlines():
        if re.match(r"^[a-z][a-z0-9-]*:", line) and "## " in line:
            names.update(re.findall(r"\b([A-Z][A-Z0-9_]*)=", line.split("## ", 1)[1]))
    return names


def test_every_variable_a_recipe_reads_is_literal_or_environment_only() -> None:
    missing = recipe_reads() - literal_vars() - ENVIRONMENT_ONLY
    assert not missing, (
        f"add to LITERAL_VARS, or to ENVIRONMENT_ONLY with a reason: {sorted(missing)}"
    )


def test_every_variable_the_help_offers_is_literal() -> None:
    missing = help_offers() - literal_vars()
    assert not missing, f"add to LITERAL_VARS: {sorted(missing)}"


def test_the_lists_find_what_they_should() -> None:
    # Not vacuous: the scans see the variables the targets are known to read.
    assert {"REASON", "MESSAGE", "ADAPTER", "SANDBOX_RUNTIME"} <= recipe_reads()
    # A macro's own line, and the names the operator macros take as arguments.
    assert {"REF", "H4_DEVCONTAINER", "DAY_USD", "RENEW"} <= recipe_reads()
    assert {"REASON", "MESSAGE", "ADAPTER", "TAIL"} <= help_offers()
    assert not ENVIRONMENT_ONLY & literal_vars()


@pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")
def test_a_command_line_adapter_reaches_the_recipe_as_typed(tmp_path: Path) -> None:
    # ADAPTER's value was make code before it joined LITERAL_VARS: make ran $(shell ...) while exporting it.
    marker = tmp_path / "ran"
    value = f"fake$(shell touch {marker})"
    done = subprocess.run(
        ["make", "--no-print-directory", "-C", str(ROOT), "evals", f"ADAPTER={value}"],
        env={
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "HOME": str(tmp_path),
            "LC_ALL": "C",
        },
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    assert not marker.exists(), "make ran the value as make code"
    assert done.returncode == 2
    assert "ADAPTER must be fake, local, or bedrock" in done.stderr


# --------------------------------------------------------------------------------------------------
# make image builds the working tree's images on the agents' engine only (round 3's review)
# --------------------------------------------------------------------------------------------------
FAKE_DOCKER = '#!/bin/sh\nprintf \'%s\\n\' "$*" >>"$DOCKER_CALLS"\n'


def _make(
    target: str, tmp_path: Path, **env: str
) -> tuple[subprocess.CompletedProcess[str], list[str]]:
    """make <target> from the repository, with a stand-in docker on PATH that records its arguments only."""
    bindir = tmp_path / "bin"
    bindir.mkdir(exist_ok=True)
    fake = bindir / "docker"
    fake.write_text(FAKE_DOCKER, encoding="utf-8")
    fake.chmod(0o755)
    calls = tmp_path / "calls.log"
    calls.write_text("", encoding="utf-8")
    done = subprocess.run(
        ["make", "--no-print-directory", "-C", str(ROOT), target],
        env={
            "PATH": f"{bindir}:/usr/local/bin:/usr/bin:/bin",
            "HOME": str(tmp_path),
            "LC_ALL": "C",
            "DOCKER_CALLS": str(calls),
            **env,
        },
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    return done, calls.read_text(encoding="utf-8").splitlines()


@pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")
@pytest.mark.parametrize(
    "env",
    [
        {},  # the Author's terminal, the host's engine
        {"DOCKER_HOST": "unix:///var/run/docker.sock"},
        {
            "DOCKER_HOST": "tcp://127.0.0.1:2376"
        },  # the relay's address, outside the sandbox
        {"DOCKER_HOST": "tcp://198.18.0.1:2377"},
    ],
)
@pytest.mark.parametrize("target", ["image", "compose-images"])
def test_the_working_trees_images_never_build_on_another_engine(
    tmp_path: Path, target: str, env: dict[str, str]
) -> None:
    done, calls = _make(target, tmp_path, **env)
    assert done.returncode == 2, done.stderr
    assert "agents' engine" in done.stderr
    assert not [c for c in calls if " build" in c]


@pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")
@pytest.mark.parametrize(
    "env",
    [
        {"DOCKER_HOST": "tcp://198.18.0.1:2376"},  # the Author's gate (T092)
        {
            "DOCKER_HOST": "tcp://127.0.0.1:2376",
            "SANDBOX_RUNTIME": "1",
        },  # inside the relay
    ],
)
def test_the_agents_engine_builds_them(tmp_path: Path, env: dict[str, str]) -> None:
    done, calls = _make("compose-images", tmp_path, **env)
    assert done.returncode == 0, done.stderr
    expected = (
        "compose -p h4reet-dev-cpu -f deploy/compose.yaml --env-file deploy/env.agents/dev-cpu.vars "
        "--profile * build"
    )
    assert calls == [expected]


# --------------------------------------------------------------------------------------------------
# A GNUmakefile that only includes the Makefile (tasks.md T183), and makefiles make never remakes
# --------------------------------------------------------------------------------------------------
INCLUDE_LINE = "include $(dir $(lastword $(MAKEFILE_LIST)))Makefile"  # T183's patch's GNUmakefile, word for word
GUARD = "$(MAKEFILE_LIST): ;\n.SUFFIXES:\n"
PLANTED = "help:\n\t@touch PWNED\n"
MAKE_ENV = {"PATH": "/usr/local/bin:/usr/bin:/bin", "LC_ALL": "C"}


def test_help_lists_the_targets_through_an_including_makefile(tmp_path: Path) -> None:
    # make then reads two files, and help must still print bare target names, not grep's "file:" before each line.
    make = shutil.which("make")
    if make is None:
        pytest.skip("no make on this host")
    shutil.copyfile(MAKEFILE, tmp_path / "Makefile")
    (tmp_path / "GNUmakefile").write_text(INCLUDE_LINE + "\n", encoding="utf-8")

    def help_from(*args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [make, "-s", "-C", str(tmp_path), *args, "help"],
            env={**MAKE_ENV, "HOME": str(tmp_path)},
            capture_output=True,
            text=True,
            check=False,
            timeout=60,
        )

    direct, included = help_from("-f", "Makefile"), help_from()
    assert direct.returncode == 0, direct.stderr
    assert included.returncode == 0, included.stderr
    assert "  help " in direct.stdout
    assert included.stdout == direct.stdout


LAYOUTS = [
    "alone",
    "through GNUmakefile",
    "-f Makefile",
    "-f ./Makefile",
    "-f by absolute path",
    "included by path",
]


def _plant_and_run(
    root: Path, makefile_text: str, layout: str
) -> tuple[list[str], bool, subprocess.CompletedProcess[str]]:
    """Lay out a Makefile with makefile_text, plant <name>.sh beside each makefile make reads, newer than it, and run
    make help. Returns the makefiles that changed, whether the planted recipe ran, and make's run."""
    make = shutil.which("make")
    assert make is not None
    (root / "Makefile").write_text(makefile_text, encoding="utf-8")
    makefiles, cwd, args = [root / "Makefile"], root, ["help"]
    if layout == "through GNUmakefile":
        makefiles.append(root / "GNUmakefile")
        makefiles[-1].write_text(INCLUDE_LINE + "\n", encoding="utf-8")
    elif layout in ("-f Makefile", "-f ./Makefile"):
        args = ["-f", layout.split()[1], "help"]
    elif layout == "-f by absolute path":
        cwd = root / "elsewhere"
        cwd.mkdir()
        args = ["-f", str(root / "Makefile"), "help"]
    elif layout == "included by path":
        cwd = root / "outer"
        cwd.mkdir()
        makefiles.append(cwd / "GNUmakefile")
        makefiles[-1].write_text(f"include {root / 'Makefile'}\n", encoding="utf-8")
    before = {}
    for makefile in makefiles:
        makefile.with_name(makefile.name + ".sh").write_text(PLANTED, encoding="utf-8")
        # 2000-01-01: older than the planted file, so make would remake it
        os.utime(makefile, (946684800, 946684800))
        before[makefile] = makefile.read_bytes()
    done = subprocess.run(
        [make, "-s", *args],
        cwd=cwd,
        env={**MAKE_ENV, "HOME": str(root)},
        capture_output=True,
        text=True,
        check=False,
        timeout=60,
    )
    changed = [
        str(m.relative_to(root)) for m in makefiles if m.read_bytes() != before[m]
    ]
    return changed, (root / "PWNED").exists() or (cwd / "PWNED").exists(), done


@pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")
@pytest.mark.parametrize("layout", LAYOUTS)
def test_make_never_remakes_a_makefile_from_a_planted_file(
    tmp_path: Path, layout: str
) -> None:
    # T183's review, S1: make's built-in .sh rule copies a planted Makefile.sh over the Makefile, and make runs it.
    assert GUARD in TEXT, "the Makefile's empty rule and empty .SUFFIXES are gone"
    assert TEXT.endswith(GUARD), (
        "the guard must stay last, after every makefile is read"
    )
    (tmp_path / "unguarded").mkdir()
    (tmp_path / "guarded").mkdir()
    # Not vacuous: without the two lines, the same plant takes over this make.
    changed, ran, _ = _plant_and_run(
        tmp_path / "unguarded", TEXT.replace(GUARD, ""), layout
    )
    if not (changed and ran):
        pytest.skip(
            "this make remakes no makefile from a planted .sh, so the plant proves nothing here"
        )
    changed, ran, done = _plant_and_run(tmp_path / "guarded", TEXT, layout)
    assert not changed, f"make remade {changed} from a planted file"
    assert not ran, "make ran the planted recipe"
    # And the guard leaves make working: it ran the Makefile's own help.
    assert done.returncode == 0, done.stderr
    assert "  help " in done.stdout


# --------------------------------------------------------------------------------------------------
# The gateway's one image per commit (tasks.md T184): make up builds it outside compose, and make build and make
# image build the working tree's on the agents' engine only, as compose-images builds compose's
# --------------------------------------------------------------------------------------------------
ENGINE_PROXY = "http://198.18.0.1:3128"  # dev-cpu.vars' H4_BUILD_PROXY
GATEWAY_BUILD = (
    f"buildx build --load --file {ROOT}/services/gateway/Dockerfile --tag h4reet-gateway:working-tree "
    f"--build-arg HTTP_PROXY={ENGINE_PROXY} --build-arg HTTPS_PROXY={ENGINE_PROXY} {ROOT}"
)
COMPOSE_BUILD = (
    "compose -p h4reet-dev-cpu -f deploy/compose.yaml --env-file deploy/env.agents/dev-cpu.vars "
    "--profile * build"
)
# deploy/scripts/gateway_image.py hands docker only Docker's own variables, so this stand-in records beside itself
# rather than at $DOCKER_CALLS.
FAKE_DOCKER_HERE = '#!/bin/sh\nprintf \'%s\\n\' "$*" >>"$(dirname "$0")/../calls.log"\n'


def _make_here(
    target: str, tmp_path: Path, **env: str
) -> tuple[subprocess.CompletedProcess[str], list[str]]:
    """_make, with the stand-in docker that records beside itself."""
    bindir = tmp_path / "bin"
    bindir.mkdir(exist_ok=True)
    fake = bindir / "docker"
    fake.write_text(FAKE_DOCKER_HERE, encoding="utf-8")
    fake.chmod(0o755)
    calls = tmp_path / "calls.log"
    calls.write_text("", encoding="utf-8")
    done = subprocess.run(
        ["make", "--no-print-directory", "-C", str(ROOT), target],
        env={
            "PATH": f"{bindir}:/usr/local/bin:/usr/bin:/bin",
            "HOME": str(tmp_path),
            "LC_ALL": "C",
            **env,
        },
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    return done, calls.read_text(encoding="utf-8").splitlines()


@pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")
@pytest.mark.parametrize(
    "env",
    [
        {},  # the Author's terminal, the host's engine
        {"DOCKER_HOST": "unix:///var/run/docker.sock"},
        {
            "DOCKER_HOST": "tcp://127.0.0.1:2376"
        },  # the relay's address, outside the sandbox
        {"DOCKER_HOST": "tcp://198.18.0.1:2377"},
    ],
)
def test_the_working_trees_gateway_image_never_builds_on_another_engine(
    tmp_path: Path, env: dict[str, str]
) -> None:
    done, calls = _make_here("gateway-image", tmp_path, **env)
    assert done.returncode == 2, done.stderr
    assert "agents' engine" in done.stderr
    assert not [c for c in calls if " build" in c]


@pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")
@pytest.mark.parametrize(
    "env",
    [
        {"DOCKER_HOST": "tcp://198.18.0.1:2376"},  # the Author's gate (T092)
        {
            "DOCKER_HOST": "tcp://127.0.0.1:2376",
            "SANDBOX_RUNTIME": "1",
        },  # inside the relay
    ],
)
def test_the_agents_engine_builds_the_gateway_image_outside_compose(
    tmp_path: Path, env: dict[str, str]
) -> None:
    done, calls = _make_here("gateway-image", tmp_path, **env)
    assert done.returncode == 0, done.stderr
    assert calls == [GATEWAY_BUILD]


@pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")
def test_the_image_gate_builds_the_gateway_then_compose_images(tmp_path: Path) -> None:
    # make image and make build: every image the tree builds, the gateway's first.
    done, calls = _make_here("image", tmp_path, DOCKER_HOST="tcp://198.18.0.1:2376")
    assert done.returncode == 0, done.stderr
    assert calls == [GATEWAY_BUILD, COMPOSE_BUILD]


def _dry_run_up(tmp_path: Path, stack: str) -> list[str]:
    """make -n up ENV=<stack>: the commands up would run, in order, none of them run."""
    done = subprocess.run(
        ["make", "--no-print-directory", "-n", "-C", str(ROOT), "up", f"ENV={stack}"],
        env={
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "HOME": str(tmp_path),
            "LC_ALL": "C",
        },
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    assert done.returncode == 0, done.stderr
    return done.stdout.splitlines()


@pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")
@pytest.mark.parametrize("stack", ["prod", "dev", "dev-cpu"])
def test_make_up_builds_the_gateway_image_after_preflight_and_before_compose(
    tmp_path: Path, stack: str
) -> None:
    lines = _dry_run_up(tmp_path, stack)

    def first(text: str) -> int:
        return next(i for i, line in enumerate(lines) if text in line)

    build = first("deploy/scripts/gateway_image.py")
    assert first("deploy/scripts/preflight.py") < build < first(" up -d ")
    # From the tree being started (the export on a host stack), with the run file that names its commit.
    line = lines[build]
    assert f"--stack {stack} " in line
    assert ("--run-file " in line) == (stack != "dev-cpu")
    # A commit from before T184, which a rollback can run, has no script: its compose file builds the gateway.
    assert "has no deploy/scripts/gateway_image.py" in line
