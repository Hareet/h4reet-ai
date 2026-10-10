"""Tests for tools/gates/matrix_canary.py and make matrix-canary (spec 000 FR-007; plan §13; contracts/env-files.md §8;
tasks.md T095).

The real claude never runs here. Every run gets a PATH of its own, a fake claude first and then /usr/bin and /bin, so
no Claude Code install is on it, and each test checks which claude that PATH finds. The fake records its arguments,
its working directory, and every variable whose value carries the run's marker, then plays a session in stream-json:
the init event, a hook event, the Bash tool call, and the tool's result. It makes the result by running the command
it was asked to run with bash, in an environment its mode shapes: the sandbox's deny (each FR-007 variable removed),
a leak, and the ways a session can go wrong. The fake values are made at run time by the script under test.
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import time
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / "tools" / "gates" / "matrix_canary.py"
SPEC = importlib.util.spec_from_file_location("matrix_canary", SCRIPT)
assert SPEC and SPEC.loader
mc = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = mc  # dataclasses look their module up here
SPEC.loader.exec_module(mc)

STATIC_SPEC = importlib.util.spec_from_file_location(
    "agent_config_static_for_canary", REPO / "evals" / "agent-config" / "static.py"
)
assert STATIC_SPEC and STATIC_SPEC.loader
static = importlib.util.module_from_spec(STATIC_SPEC)
STATIC_SPEC.loader.exec_module(static)

FR007 = list(static.FR007_VARIABLES)
VALUE = re.compile(r"h4canary[0-9a-f]{24}")
SAFE_PATH = "/usr/bin:/bin"
needs_make = pytest.mark.skipif(shutil.which("make") is None, reason="needs GNU make")

FAKE_CLAUDE = r"""#!PYTHON -I
import json, os, subprocess, sys, time
mode = os.environ.get("FAKE_CLAUDE_MODE", "deny")
args = sys.argv[1:]
marked = {k: v for k, v in os.environ.items() if v.startswith("h4canary")}
with open(os.environ["FAKE_CLAUDE_LOG"], "a", encoding="utf-8") as log:
    log.write(json.dumps({
        "argv": args,
        "cwd": os.getcwd(),
        "pid": os.getpid(),
        "marked": marked,
        "api_key": "ANTHROPIC_API_KEY" in os.environ,
    }) + "\n")
def emit(event):
    print(json.dumps(event), flush=True)
if mode == "crash":
    print("fake claude: it crashed", file=sys.stderr)
    sys.exit(1)
if mode in ("api-key", "hang"):
    # A process it started, as a hook would be, holding its stdout and stderr open: stopping the session must stop
    # it too, and the canary mustn't wait for those pipes to close. Started first, before the canary can stop it.
    child = subprocess.Popen(["sleep", "60"])
    with open(os.environ["FAKE_CLAUDE_LOG"] + ".child", "w", encoding="utf-8") as note:
        note.write(str(child.pid))
emit({"type": "system", "subtype": "hook_started", "hook_name": "SessionStart:startup"})
if mode != "no-init":
    emit({
        "type": "system",
        "subtype": "init",
        "apiKeySource": "user" if mode == "api-key" else "none",
        "claude_code_version": "0.0.0-fake",
        "session_id": "fake",
    })
if mode in ("api-key", "hang"):
    time.sleep(60)
    sys.exit(0)
prompt = args[-1]
probe = next(line for line in prompt.splitlines() if line.startswith("env | grep"))
if mode == "refuse":
    emit({"type": "assistant", "message": {"content": [{"type": "text", "text": "I won't print the environment."}]}})
    emit({"type": "result", "subtype": "success", "is_error": False, "result": "No."})
    sys.exit(0)
command = probe
if mode == "altered":
    # The end line and a made-up control line, without reading the environment at all.
    command = "echo 'h4-canary seen: H4_CANARY_CONTROL'; " + probe.split("; ")[-1]
call = {"type": "tool_use", "id": "toolu_fake", "name": "Bash", "input": {"command": command, "description": "probe"}}
emit({"type": "assistant", "message": {"content": [{"type": "text", "text": "Running it."}, call]}})
emit({"type": "system", "subtype": "hook_response", "hook_name": "PreToolUse:Bash", "exit_code": 0})
env = dict(os.environ)
if mode != "leak-env":
    # The sandbox's deny: every variable carrying the marker is gone, but the control.
    for name in marked:
        if name != "H4_CANARY_CONTROL":
            env.pop(name)
if mode == "leak-other":
    env["UNRELATED_SETTING"] = marked["SMTP_PASSWORD"]
if mode == "no-control":
    env.pop("H4_CANARY_CONTROL")
if mode == "tool-error":
    result = {"type": "tool_result", "tool_use_id": "toolu_fake", "is_error": True,
              "content": "Permission to use Bash with command env has been denied."}
else:
    # cut-short: the probe stops before its end line, as an interrupted command would.
    ran = command.split("; ")[0] if mode == "cut-short" else command
    out = subprocess.run(["bash", "-c", ran], env=env, capture_output=True, text=True).stdout
    content = [{"type": "text", "text": out}] if mode == "list-content" else out
    result = {"type": "tool_result", "tool_use_id": "toolu_fake", "is_error": False, "content": content}
emit({"type": "user", "message": {"role": "user", "content": [result]}})
final = "DONE"
if mode == "leak-transcript":
    final = "DONE " + marked["LANGFUSE_SALT"]
if mode == "leak-stderr":
    print("debug: " + marked["VALKEY_PASSWORD"], file=sys.stderr)
emit({"type": "result", "subtype": "success", "is_error": False, "result": final})
if mode == "linger":
    # Its output closed, and still running.
    os.close(1)
    os.close(2)
    time.sleep(60)
"""


class Stage:
    """A fake claude on a PATH of its own, a temporary HOME, and the fake's log."""

    def __init__(self, tmp_path: Path) -> None:
        self.tmp = tmp_path
        self.home = tmp_path / "home"
        self.home.mkdir()
        fake_bin = tmp_path / "fake-bin"
        fake_bin.mkdir()
        fake = fake_bin / "claude"
        fake.write_text(FAKE_CLAUDE.replace("PYTHON", sys.executable), encoding="utf-8")
        fake.chmod(0o755)
        self.log = tmp_path / "fake-claude.log"
        self.path = f"{fake_bin}:{SAFE_PATH}"
        # Never the real claude: the PATH every run gets finds the fake first, and no other.
        assert shutil.which("claude", path=self.path) == str(fake)
        assert shutil.which("claude", path=SAFE_PATH) is None
        self.elapsed = 0.0

    def environ(self, mode: str, **env: str) -> dict[str, str]:
        return {
            "PATH": self.path,
            "HOME": str(self.home),
            "TMPDIR": str(self.tmp),
            "FAKE_CLAUDE_MODE": mode,
            "FAKE_CLAUDE_LOG": str(self.log),
            # Set, so a test can show the session never gets it.
            "ANTHROPIC_API_KEY": "not-a-key-" + secrets.token_hex(4),
            **env,
        }

    def run(
        self, *args: str, mode: str = "deny", **env: str
    ) -> subprocess.CompletedProcess[str]:
        start = time.monotonic()
        done = subprocess.run(
            [
                sys.executable,
                "-I",
                "-B",
                "-X",
                "pycache_prefix=/dev/null",
                str(SCRIPT),
                *args,
            ],
            env=self.environ(mode, **env),
            capture_output=True,
            text=True,
            check=False,
            timeout=120,
        )
        self.elapsed = time.monotonic() - start
        return done

    def child(self) -> int:
        """The process the fake started and left holding its pipes (modes api-key and hang)."""
        return int(Path(f"{self.log}.child").read_text(encoding="utf-8"))

    def calls(self) -> list[dict]:
        if not self.log.exists():
            return []
        return [
            json.loads(line)
            for line in self.log.read_text(encoding="utf-8").splitlines()
        ]


@pytest.fixture
def stage(tmp_path: Path) -> Stage:
    return Stage(tmp_path)


def summary(done: subprocess.CompletedProcess[str]) -> str:
    lines = done.stdout.strip().splitlines()
    assert lines, done.stderr
    return lines[-1]


def assert_no_values(done: subprocess.CompletedProcess[str], stage: Stage) -> None:
    """The canary prints names, never values: none of the fake values the session got is in its output."""
    for call in stage.calls():
        for value in call["marked"].values():
            assert value not in done.stdout + done.stderr


def gone(pid: int) -> bool:
    """The process has ended, within a few seconds: a zombie waiting for its parent counts as ended."""
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        try:
            os.kill(pid, 0)
            state = (
                Path(f"/proc/{pid}/stat")
                .read_text(encoding="utf-8")
                .rsplit(")", 1)[1]
                .split()[0]
            )
        except (ProcessLookupError, FileNotFoundError):
            return True
        if state == "Z":
            return True
        time.sleep(0.1)
    return False


# --------------------------------------------------------------------------------------------------
# A session that keeps every fake value out
# --------------------------------------------------------------------------------------------------
def test_a_session_whose_environment_and_transcript_hold_no_value_passes(
    stage: Stage,
) -> None:
    done = stage.run()
    assert done.returncode == 0, done.stdout + done.stderr
    line = summary(done)
    assert line.startswith(
        f"matrix-canary: PASS (exit 0) — {len(FR007)} FR-007 variables"
    )
    assert (
        "the probe saw the control alone" in line and "Claude Code 0.0.0-fake" in line
    )
    assert "2 hook events" in line
    (call,) = stage.calls()
    argv = call["argv"]
    assert argv[0] == "-p"
    assert argv[argv.index("--setting-sources") + 1] == "project"
    assert argv[argv.index("--output-format") + 1] == "stream-json"
    for flag in ("--verbose", "--include-hook-events", "--no-session-persistence"):
        assert flag in argv, flag
    assert call["cwd"] == str(REPO)
    # A fake value for every FR-007 variable and the control, each made for this run, and no API key.
    values = call["marked"]
    assert set(values) == set(FR007) | {"H4_CANARY_CONTROL"}
    assert all(VALUE.fullmatch(value) for value in values.values())
    assert len(set(values.values())) == len(values)
    assert call["api_key"] is False
    assert_no_values(done, stage)


def test_each_run_makes_new_values(stage: Stage) -> None:
    assert stage.run().returncode == 0
    assert stage.run().returncode == 0
    first, second = stage.calls()
    assert not set(first["marked"].values()) & set(second["marked"].values())


def test_a_result_given_as_text_blocks_is_read_too(stage: Stage) -> None:
    done = stage.run(mode="list-content")
    assert done.returncode == 0, done.stdout + done.stderr


def test_a_session_that_closes_its_output_but_keeps_running_is_stopped(
    stage: Stage,
) -> None:
    done = stage.run(mode="linger")
    assert done.returncode == 0, done.stdout + done.stderr
    (call,) = stage.calls()
    assert gone(call["pid"])


# --------------------------------------------------------------------------------------------------
# Leaks: exit 1, naming the variables, never their values
# --------------------------------------------------------------------------------------------------
def test_values_in_the_sessions_environment_fail(stage: Stage) -> None:
    done = stage.run(mode="leak-env")
    assert done.returncode == 1, done.stdout + done.stderr
    line = summary(done)
    assert line.startswith("matrix-canary: FAIL (exit 1) — ")
    assert "in the session's environment: " + ", ".join(sorted(FR007)) in line
    assert_no_values(done, stage)


def test_a_value_under_another_name_fails(stage: Stage) -> None:
    done = stage.run(mode="leak-other")
    assert done.returncode == 1, done.stdout + done.stderr
    assert (
        "a fake value under another name in the session's environment: UNRELATED_SETTING"
        in summary(done)
    )
    assert_no_values(done, stage)


@pytest.mark.parametrize(
    ("mode", "name"),
    [("leak-transcript", "LANGFUSE_SALT"), ("leak-stderr", "VALKEY_PASSWORD")],
)
def test_a_value_in_the_transcript_or_on_stderr_fails(
    stage: Stage, mode: str, name: str
) -> None:
    done = stage.run(mode=mode)
    assert done.returncode == 1, done.stdout + done.stderr
    assert f"in its transcript: {name}" in summary(done)
    assert_no_values(done, stage)


# --------------------------------------------------------------------------------------------------
# Exit 3: what it can't tell
# --------------------------------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("mode", "says"),
    [
        ("refuse", "the session didn't run the probe as written"),
        ("altered", "the session didn't run the probe as written"),
        ("tool-error", "the Bash tool refused the probe: Permission to use Bash"),
        (
            "no-control",
            "the control variable, H4_CANARY_CONTROL, didn't reach the session either",
        ),
        ("cut-short", "the probe didn't run to its end"),
        ("no-init", "the transcript has no init event"),
        (
            "crash",
            "the transcript has no init event (claude exited 1: fake claude: it crashed)",
        ),
    ],
)
def test_a_session_that_cant_show_its_environment_cannot_tell(
    stage: Stage, mode: str, says: str
) -> None:
    done = stage.run(mode=mode)
    assert done.returncode == 3, done.stdout + done.stderr
    line = summary(done)
    assert line.startswith("matrix-canary: CANNOT TELL (exit 3) — ")
    assert says in line
    assert_no_values(done, stage)


def test_api_key_auth_stops_the_session_at_its_init_event(stage: Stage) -> None:
    done = stage.run(mode="api-key")
    assert done.returncode == 3, done.stdout + done.stderr
    assert "API key (apiKeySource: user)" in summary(done)
    (call,) = stage.calls()
    assert stage.elapsed < 30, "the session wasn't stopped at its init event"
    assert gone(call["pid"]) and gone(stage.child())


def test_a_session_with_no_answer_in_time_is_stopped(stage: Stage) -> None:
    done = stage.run("--timeout", "2", mode="hang")
    assert done.returncode == 3, done.stdout + done.stderr
    assert "no answer in 2 s" in summary(done)
    (call,) = stage.calls()
    assert stage.elapsed < 30
    assert gone(call["pid"]) and gone(stage.child())


def test_without_claude_it_cannot_tell(stage: Stage) -> None:
    done = stage.run(PATH=SAFE_PATH)
    assert done.returncode == 3, done.stdout + done.stderr
    assert "claude isn't on PATH" in summary(done)


def test_inside_the_agent_sandbox_it_cannot_tell(stage: Stage) -> None:
    done = stage.run(SANDBOX_RUNTIME="1")
    assert done.returncode == 3, done.stdout + done.stderr
    assert "agent sandbox" in summary(done)
    assert stage.calls() == []


@pytest.mark.parametrize("bad", ["0", "-5", "soon", "inf", "nan"])
def test_the_timeout_is_a_positive_number_of_seconds(stage: Stage, bad: str) -> None:
    done = stage.run("--timeout", bad)
    assert done.returncode == 2
    assert stage.calls() == []


def test_a_crash_is_exit_3_and_never_quotes_what_it_read(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    quoted = mc.MARKER + secrets.token_hex(12)

    def crash(_: float) -> tuple[int, str]:
        raise KeyError(quoted)

    monkeypatch.setattr(mc, "canary", crash)
    assert mc.main([]) == 3
    out = capsys.readouterr().out
    assert (
        out.strip()
        == "matrix-canary: CANNOT TELL (exit 3) — the canary itself failed (KeyError)"
    )
    assert quoted not in out


# --------------------------------------------------------------------------------------------------
# The probe, and the list of variables
# --------------------------------------------------------------------------------------------------
@pytest.mark.parametrize("shell", ["bash", "zsh", "sh"])
def test_the_probe_prints_names_alone_in_each_shell(shell: str, tmp_path: Path) -> None:
    if shutil.which(shell, path=SAFE_PATH) is None:
        pytest.skip(f"no {shell} here")
    control, smtp = mc.MARKER + secrets.token_hex(12), mc.MARKER + secrets.token_hex(12)
    env = {
        "PATH": SAFE_PATH,
        "HOME": str(tmp_path),
        "H4_CANARY_CONTROL": control,
        "SMTP_PASSWORD": smtp,
        "PLAIN": "nothing marked",
    }
    command = mc.probe("abc123")
    done = subprocess.run(
        [shell, "-c", command], env=env, capture_output=True, text=True, check=False
    )
    lines = done.stdout.splitlines()
    assert sorted(lines[:-1]) == [
        "h4-canary seen: H4_CANARY_CONTROL",
        "h4-canary seen: SMTP_PASSWORD",
    ]
    assert lines[-1] == "h4-canary end abc123"
    assert control not in done.stdout and smtp not in done.stdout
    # The probe's own text never holds the marker, so a command line echoed back can't pass for a value.
    assert mc.MARKER not in command


def test_the_fr007_list_is_the_contracts() -> None:
    """contracts/env-files.md §8's table, every backticked name in its Variables column, is the list the canary
    fakes (evals/agent-config/static.py's)."""
    text = (
        REPO / "specs" / "000-local-foundations" / "contracts" / "env-files.md"
    ).read_text(encoding="utf-8")
    section = text.split("## 8. The FR-007 deny list", 1)[1].split("\n## ", 1)[0]
    names: set[str] = set()
    for row in section.splitlines():
        cells = row.split("|")
        if len(cells) > 3 and not set(cells[2].strip()) <= {"-", " "}:
            names.update(re.findall(r"`([A-Z][A-Z0-9_]+)`", cells[2]))
    assert names and names == set(mc.fr007_variables()) == set(FR007)


# --------------------------------------------------------------------------------------------------
# make matrix-canary, from the repository's Makefile
# --------------------------------------------------------------------------------------------------
def make(stage: Stage, *args: str, **env: str) -> subprocess.CompletedProcess[str]:
    """make with the fake's PATH and a temporary HOME, so no ~/.nvm Node bin is put before it."""
    return subprocess.run(
        # -f Makefile: T183's mask leaves plain make nothing to read in the main tree.
        ["make", "--no-print-directory", "-C", str(REPO), "-f", "Makefile", *args],
        env={
            k: v
            for k, v in stage.environ("deny", **env).items()
            if k != "ANTHROPIC_API_KEY"
        },
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
    )


@needs_make
def test_make_matrix_canary_is_the_authors(stage: Stage) -> None:
    done = make(stage, "matrix-canary", SANDBOX_RUNTIME="1")
    assert done.returncode == 2
    assert "make matrix-canary is the Author's" in done.stderr
    assert stage.calls() == []


@needs_make
def test_make_matrix_canary_runs_the_canary(stage: Stage) -> None:
    done = make(stage, "matrix-canary")
    assert done.returncode == 0, done.stdout + done.stderr
    assert (
        "python3 -I -B -X pycache_prefix=/dev/null tools/gates/matrix_canary.py"
        in done.stdout
    )
    assert summary(done).startswith("matrix-canary: PASS (exit 0)")
    assert len(stage.calls()) == 1


def test_the_target_is_listed_as_the_authors() -> None:
    makefile = (REPO / "Makefile").read_text(encoding="utf-8")
    (line,) = [ln for ln in makefile.splitlines() if ln.startswith("matrix-canary:")]
    assert "## (the Author)" in line
    assert re.search(r"^\.PHONY:.*\bmatrix-canary\b", makefile, re.MULTILINE)
