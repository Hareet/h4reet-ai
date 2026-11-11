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
import time
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


def test_the_samples_kind_comes_from_the_command_line_only() -> None:
    # Spec 011 (its plan §7.5): the alert samples' target offers KIND=, passes it to the CLI as --kind, and takes it
    # from the command line alone, as every operator value is.
    assert "KIND" in help_offers()
    assert "KIND" in recipe_reads()
    assert "KIND" in literal_vars()


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
    assert "ADAPTER must be fake, local, bedrock, or anthropic" in done.stderr


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
# The committed GNUmakefile's include (tasks.md T183).
INCLUDE_LINE = (ROOT / "GNUmakefile").read_text(encoding="utf-8").splitlines()[-1]
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
# The room's image (spec 002, contracts/web-serving.md §1): dev-cpu's holds the drafts, so its tag says so, and
# main's policy files come in as the named context `policy`, from a fresh temporary directory, whose digest is a label.
# The working tree's models, under assets/room/ since the room's intake, come in as the named context `room-assets`
# (spec 004, T220; its contracts/serving.md §3), its visitor avatars' folder, assets/visitors/, as
# `visitor-assets` (spec 009, FR-023; its Amendment M19), and the twin's folder, assets/twin/, as `twin-assets`
# (spec 016, its plan's R-03; changed with T013, its R-18).
WEB_BUILD = re.compile(
    re.escape(
        f"buildx build --load --file {ROOT}/apps/web/Dockerfile --tag h4reet-web:working-tree-drafts "
        f"--build-arg HTTP_PROXY={ENGINE_PROXY} --build-arg HTTPS_PROXY={ENGINE_PROXY} --build-arg ROOM_DRAFTS=1 "
        "--build-context policy="
    )
    + r"/\S+ "
    + re.escape(f"--build-context room-assets={ROOT}/assets/room ")
    + re.escape(f"--build-context visitor-assets={ROOT}/assets/visitors ")
    + re.escape(f"--build-context twin-assets={ROOT}/assets/twin ")
    + r"--label org\.h4reet\.web\.policy=[0-9a-f]{64} "
    + re.escape(str(ROOT))
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
    # make image and make build: every image the tree builds, the gateway's first, then the room's (spec 002).
    done, calls = _make_here("image", tmp_path, DOCKER_HOST="tcp://198.18.0.1:2376")
    assert done.returncode == 0, done.stderr
    assert len(calls) == 3 and calls[0] == GATEWAY_BUILD and calls[2] == COMPOSE_BUILD
    assert WEB_BUILD.fullmatch(calls[1]), calls[1]


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


# --------------------------------------------------------------------------------------------------
# make image and make build ask the agents' engine for an answer, within a bound, before they build on it (tasks.md
# T167). The relay has no timeout, and while RootlessKit's forward took connections and never answered (T046), make
# check waited at image with no end.
# --------------------------------------------------------------------------------------------------
# The relay's stand-in, as contracts/agents-engine.md §2.2 has it: socat in the background (here a sleep that holds
# make's stderr, so a probe that stopped only the relay would leave make's output open), then the command with the
# relay's DOCKER_HOST. It records each command beside itself.
FAKE_RELAY = (
    "#!/usr/bin/env bash\n"
    'printf \'%s\\n\' "$*" >>"$(dirname "$0")/../relay.log"\n'
    "sleep 300 &\n"
    "socat=$!\n"
    "trap 'kill \"$socat\" 2>/dev/null || true' EXIT\n"
    "status=0\n"
    'DOCKER_HOST=tcp://127.0.0.1:2376 DOCKER_TLS_VERIFY=1 "$@" || status=$?\n'
    'exit "$status"\n'
)
# The engine behind the forward, for every call: it answers, it refuses at once, or it takes the connection and
# never answers (the T046 forward).
ENGINE = {
    "answers": "exit 0",
    "refuses": "echo 'error during connect: EOF' >&2; exit 1",
    "hangs": "exec sleep 300",
}
PROBE_SECONDS = 2


def _make_through_relay(
    target: str, tmp_path: Path, engine: str, *args: str
) -> tuple[subprocess.CompletedProcess[str], list[str], list[str], float]:
    """make <target> in the sandbox with an agents' engine: the relay's stand-in, the agents' certificate, and a
    stand-in docker that records beside itself, then behaves as `engine` says. Returns make's run, the relay's
    commands, docker's, and the seconds make took."""
    bindir = tmp_path / "bin"
    bindir.mkdir(exist_ok=True)
    docker = bindir / "docker"
    docker.write_text(FAKE_DOCKER_HERE + ENGINE[engine] + "\n", encoding="utf-8")
    relay = bindir / "docker-relay"
    relay.write_text(FAKE_RELAY, encoding="utf-8")
    for stub in (docker, relay):
        stub.chmod(0o755)
    cert = tmp_path / ".config" / "h4reet" / "agents-engine" / "docker" / "cert.pem"
    cert.parent.mkdir(parents=True, exist_ok=True)
    cert.write_text("", encoding="utf-8")
    for log in ("calls.log", "relay.log"):
        (tmp_path / log).write_text("", encoding="utf-8")
    start = time.monotonic()
    done = subprocess.run(
        [
            "make",
            "--no-print-directory",
            "-C",
            str(ROOT),
            target,
            f"RELAY={relay}",
            f"ENGINE_PROBE_SECONDS={PROBE_SECONDS}",
            *args,
        ],
        env={
            "PATH": f"{bindir}:/usr/local/bin:/usr/bin:/bin",
            "HOME": str(tmp_path),
            "LC_ALL": "C",
            "SANDBOX_RUNTIME": "1",
        },
        capture_output=True,
        text=True,
        # Well past the bound: without one, a hanging engine holds make here until this stops it.
        timeout=60,
        check=False,
    )
    elapsed = time.monotonic() - start
    return (
        done,
        (tmp_path / "relay.log").read_text(encoding="utf-8").splitlines(),
        (tmp_path / "calls.log").read_text(encoding="utf-8").splitlines(),
        elapsed,
    )


RELAYED_BUILD = (
    "make --no-print-directory gateway-image web-image compose-images ENV=dev-cpu"
)


@pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")
def test_the_image_gate_asks_the_engine_through_the_relay_before_it_builds(
    tmp_path: Path,
) -> None:
    done, relayed, calls, _ = _make_through_relay("image", tmp_path, "answers")
    assert done.returncode == 0, done.stderr
    assert relayed == ["docker version", RELAYED_BUILD]
    assert calls[:2] == ["version", GATEWAY_BUILD] and calls[3:] == [COMPOSE_BUILD]
    assert len(calls) == 4 and WEB_BUILD.fullmatch(calls[2]), calls


@pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")
@pytest.mark.parametrize("engine", ["refuses", "hangs"])
def test_the_image_gate_fails_within_the_bound_when_the_engine_does_not_answer(
    tmp_path: Path, engine: str
) -> None:
    done, relayed, calls, elapsed = _make_through_relay("image", tmp_path, engine)
    # make exits 2 when a recipe fails.
    assert done.returncode == 2, done.stderr
    # The bound, timeout's grace after it, and room for a loaded machine; far short of a hang.
    assert elapsed < PROBE_SECONDS + 5 + 15
    assert "image: the agents' engine didn't answer" in done.stderr
    assert "ask the Author: deploy/agents-engine/engine.sh up" in done.stderr
    if engine == "hangs":
        assert f"within {PROBE_SECONDS} s" in done.stderr
    # Nothing was built: the probe was the only call.
    assert relayed == ["docker version"]
    assert calls == ["version"]


@pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")
def test_make_build_asks_the_engine_after_the_workspaces_and_before_it_builds_on_it(
    tmp_path: Path,
) -> None:
    # make -n: the workspaces' build would run npm, so this reads the commands build would run, none of them run.
    done, relayed, calls, _ = _make_through_relay("build", tmp_path, "answers", "-n")
    assert done.returncode == 0, done.stderr
    assert relayed == [] and calls == []
    lines = done.stdout.splitlines()

    def first(text: str) -> int:
        return next(i for i, line in enumerate(lines) if text in line)

    probe = first("docker version")
    assert f"timeout --kill-after=5 {PROBE_SECONDS} " in lines[probe]
    assert first("npm run build") < probe < first(RELAYED_BUILD)
    assert "build: the agents' engine didn't answer" in lines[probe]


@pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")
@pytest.mark.parametrize("mode", ["none-yet", "no-cli"])
def test_the_image_gate_skips_without_asking_while_there_is_no_engine_to_ask(
    tmp_path: Path, mode: str
) -> None:
    done, relayed, calls, _ = _make_through_relay(
        "image", tmp_path, "hangs", f"ENGINE_MODE={mode}"
    )
    assert done.returncode == 0, done.stderr
    assert done.stdout.startswith("SKIP: ")
    assert relayed == [] and calls == []


# --------------------------------------------------------------------------------------------------
# The room (spec 002, T005, T008; contracts/web-serving.md §1): a workspace make lint and make test cover, and an
# image make up builds after the gateway's, as deploy/scripts/web_image.py does, outside compose
# --------------------------------------------------------------------------------------------------
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
def test_the_working_trees_web_image_never_builds_on_another_engine(
    tmp_path: Path, env: dict[str, str]
) -> None:
    done, calls = _make_here("web-image", tmp_path, **env)
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
def test_the_agents_engine_builds_the_web_image_with_drafts(
    tmp_path: Path, env: dict[str, str]
) -> None:
    done, calls = _make_here("web-image", tmp_path, **env)
    assert done.returncode == 0, done.stderr
    assert len(calls) == 1 and WEB_BUILD.fullmatch(calls[0]), calls


@pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")
@pytest.mark.parametrize("stack", ["prod", "dev", "dev-cpu"])
def test_make_up_builds_the_web_image_after_the_gateways_and_before_compose(
    tmp_path: Path, stack: str
) -> None:
    lines = _dry_run_up(tmp_path, stack)

    def first(text: str) -> int:
        return next(i for i, line in enumerate(lines) if text in line)

    build = first("deploy/scripts/web_image.py")
    assert first("deploy/scripts/gateway_image.py") < build < first(" up -d ")
    line = lines[build]
    assert f"--stack {stack} " in line
    assert ("--run-file " in line) == (stack != "dev-cpu")
    # main's policy is read from the working tree, as preflight's --repo names it, whatever tree is being started.
    assert f"--repo {ROOT}" in line
    # A commit from before spec 002, which a rollback can run, has neither the script nor a web service.
    assert "has no deploy/scripts/web_image.py" in line


@pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")
def test_lint_typechecks_the_room_as_a_workspace(tmp_path: Path) -> None:
    # make test and make build run npm's --workspaces, which finds apps/web through the root package.json; tsc runs
    # per workspace directory, which the Makefile lists itself, so the room's typecheck can't be skipped silently.
    done = subprocess.run(
        ["make", "--no-print-directory", "-n", "-C", str(ROOT), "lint"],
        env={
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "HOME": str(tmp_path),
            "LC_ALL": "C",
            "SANDBOX_RUNTIME": "1",
        },
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    assert done.returncode == 0, done.stderr
    assert "for ws in services/gateway apps/web;" in done.stdout


# --------------------------------------------------------------------------------------------------
# The published-content check (spec 002, T080; contracts/resume-source.md §5): make check builds the room without
# drafts, then runs tools/gates/content_check.py, human-only, which reads main's approvals itself. Until the approvals
# patch adds that script, the gate says PLANNED, as the runner reads it.
# --------------------------------------------------------------------------------------------------
def test_make_check_runs_the_content_check_right_after_the_tests() -> None:
    text = MAKEFILE.read_text(encoding="utf-8")
    (line,) = re.findall(r"^CHECK_GATES := (.*)$", text, re.MULTILINE)
    gates = line.split()
    assert gates.index("content-check") == gates.index("test") + 1
    assert re.search(r"^\.PHONY:.*\bcontent-check\b", text, re.MULTILINE | re.DOTALL)


@pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")
def test_the_content_check_builds_without_drafts_then_runs_mains_check(
    tmp_path: Path,
) -> None:
    done = subprocess.run(
        ["make", "--no-print-directory", "-n", "-C", str(ROOT), "content-check"],
        env={
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "HOME": str(tmp_path),
            "LC_ALL": "C",
            "SANDBOX_RUNTIME": "1",
            "ROOM_DRAFTS": "1",  # an agent's shell with drafts on: the gate's build still has none
        },
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    assert done.returncode == 0, done.stderr
    recipe = done.stdout
    assert (
        'echo "PLANNED (T080): tools/gates/content_check.py arrives with the approvals patch"'
        in recipe
    )
    build = recipe.index("ROOM_DRAFTS= npm run build -w apps/web")
    check = recipe.index(
        "tools/gates/content_check.py --tree . --dist apps/web/dist --repo ."
    )
    assert build < check
    assert (
        "python3 -I -B -X pycache_prefix=/dev/null tools/gates/content_check.py"
        in recipe
    )


# --------------------------------------------------------------------------------------------------
# make assets-scrub passes RECORD on, taken from the command line as FILE is (spec 004, Amendment C1; tasks.md T034)
# --------------------------------------------------------------------------------------------------
def _dry_run_scrub(tmp_path: Path, *args: str, **env: str) -> list[str]:
    done = subprocess.run(
        ["make", "--no-print-directory", "-n", "-C", str(ROOT), "assets-scrub", *args],
        env={
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "HOME": str(tmp_path),
            "LC_ALL": "C",
            **env,
        },
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert done.returncode == 0, done.stderr
    return [line for line in done.stdout.splitlines() if "scrub.py" in line]


@pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")
def test_assets_scrub_passes_record_on_from_the_command_line(tmp_path: Path) -> None:
    (line,) = _dry_run_scrub(tmp_path, "FILE=desk.glb", "RECORD=records.json")
    assert line.endswith('scripts/assets/scrub.py --record "$RECORD" -- "$FILE"')
    (line,) = _dry_run_scrub(tmp_path, "FILE=desk.glb")
    assert line.endswith('scripts/assets/scrub.py -- "$FILE"')
    # From the environment, RECORD is ignored, as FILE is.
    (line,) = _dry_run_scrub(tmp_path, "FILE=desk.glb", RECORD="records.json")
    assert line.endswith('scripts/assets/scrub.py -- "$FILE"')
    assert "RECORD" in literal_vars()


# --------------------------------------------------------------------------------------------------
# Spec 010 (FR-024): the live runs take ADAPTER=anthropic as they take ADAPTER=bedrock. A stand-in PY_HOST, `echo`,
# prints each runner's command line instead of running it, so nothing reaches a stack or a model.
# --------------------------------------------------------------------------------------------------
def _live(
    target: str, tmp_path: Path, *args: str, sandbox: bool = False
) -> subprocess.CompletedProcess[str]:
    env = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": str(tmp_path), "LC_ALL": "C"}
    if sandbox:
        env["SANDBOX_RUNTIME"] = "1"
    return subprocess.run(
        [
            "make",
            "--no-print-directory",
            "-C",
            str(ROOT),
            target,
            *args,
            "PY_HOST=echo RUNNER",
        ],
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )


@pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")
def test_the_evals_target_hands_anthropic_to_the_runner_outside_the_sandbox(
    tmp_path: Path,
) -> None:
    done = _live("evals", tmp_path, "ADAPTER=anthropic", "ENV=dev")
    assert done.returncode == 0, done.stderr
    runner = [
        ln
        for ln in done.stdout.splitlines()
        if ln.startswith("RUNNER ") and "--suite product" in ln
    ]
    # The paid adapter's cases go to prod whatever ENV says: the runner gets no --stack for it.
    assert runner == ["RUNNER evals/run.py --suite product --adapter anthropic"]


@pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")
def test_the_evals_target_refuses_anthropic_in_the_sandbox_and_an_unknown_adapter_anywhere(
    tmp_path: Path,
) -> None:
    inside = _live("evals", tmp_path, "ADAPTER=anthropic", sandbox=True)
    assert inside.returncode == 2
    assert "ADAPTER=anthropic runs in the Author's terminal" in inside.stderr
    assert "RUNNER" not in inside.stdout
    other = _live("evals", tmp_path, "ADAPTER=openrouter")
    assert other.returncode == 2
    assert "ADAPTER must be fake, local, bedrock, or anthropic" in other.stderr


@pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")
def test_the_redteam_live_target_takes_a_paid_adapter_on_prod_alone(
    tmp_path: Path,
) -> None:
    done = _live("redteam-live", tmp_path, "ADAPTER=anthropic", "ENV=prod")
    assert done.returncode == 0, done.stderr
    assert (
        "RUNNER redteam/live.py --live --stack prod --adapter anthropic" in done.stdout
    )
    for adapter in ("anthropic", "bedrock"):
        off = _live("redteam-live", tmp_path, f"ADAPTER={adapter}", "ENV=dev")
        assert off.returncode == 2, adapter
        assert "a paid adapter is prod's, so ENV=prod" in off.stderr
        assert "RUNNER" not in off.stdout
    assert _live("redteam-live", tmp_path, "ADAPTER=local", "ENV=dev").returncode == 0
    other = _live("redteam-live", tmp_path, "ADAPTER=fake", "ENV=prod")
    assert other.returncode == 2
    assert "ADAPTER must be local, bedrock, or anthropic" in other.stderr
    inside = _live(
        "redteam-live", tmp_path, "ADAPTER=anthropic", "ENV=prod", sandbox=True
    )
    assert inside.returncode == 2 and "RUNNER" not in inside.stdout
