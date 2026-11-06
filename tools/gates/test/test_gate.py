"""Tests for tools/gates/gate, the Author's clean-room gate (spec 000 FR-041; plan §11; ADR 0017; tasks.md T092).

Docker, the agents' engine, and the network don't exist here, so each test builds a repository in a temporary
directory and runs the real gate in it, with stand-ins on PATH:

- docker records every call, its arguments, and the DOCKER_* variables it got, and answers as a control file says;
- gitleaks records its flags and whether the ignore directory was fresh and empty when it ran.

The fixture's main working tree holds the real gate and the real corpus check, plus stand-ins for the compose
policy, the toolchain check, and engine.sh that record how they were run. The branch under test commits its own,
hostile copies of those files, which leave a marker if anything runs them: the gate runs only git, docker,
gitleaks, and the main tree's own code, never the exported tree's code on the host (plan §11).
"""

from __future__ import annotations

import hashlib
import http.server
import importlib.util
import io
import json
import math
import os
import re
import shutil
import socket
import subprocess
import sys
import tarfile
import threading
import time
from dataclasses import dataclass
from importlib.machinery import SourceFileLoader
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
GATE = REPO / "tools" / "gates" / "gate"
# Imported, the gate runs nothing (its PY_HOST re-exec is for a run), so its pieces can be tested one at a time.
_LOADER = SourceFileLoader("h4_gate", str(GATE))
_SPEC = importlib.util.spec_from_loader("h4_gate", _LOADER)
assert _SPEC
gm = importlib.util.module_from_spec(_SPEC)
sys.modules["h4_gate"] = gm  # dataclasses look their module up here
_LOADER.exec_module(gm)
CHECK_CORPUS = REPO / "corpus" / "tools" / "check_corpus.py"
SYSTEM_PATH = "/usr/local/bin:/usr/bin:/bin"
TARGETS = [
    "lint",
    "validate-config",
    "test",
    "evals",
    "redteam-suite",
    "matrix",
    "credits-check",
]
ENGINE = "tcp://198.18.0.1:2376"
RECORDING = "/run/h4-contract/recording.json"
PHRASE = "zebra quartz lantern"  # the fixture denylist's one phrase
CHANGE = {"docs/readme.md": "docs, changed\n"}  # a branch that touches no trigger
RUN = "2026-10-10T120000Z-feature-0123abc"
# A history entry as the gate reads it (plan §14's fields; T094 writes them), named by its file.
ENTRY = {
    "run": RUN,
    "verdict": "pass",
    "cost_usd": 0.42,
    "tokens": {"input": 1200, "output": 300, "cache_read": 5000, "cache_creation": 700},
}
# The real gitleaks, where it is installed, with a rule for a probe token assembled at run time, so this file holds
# nothing shaped like a secret.
REAL_GITLEAKS = shutil.which("gitleaks")
needs_gitleaks = pytest.mark.skipif(
    REAL_GITLEAKS is None, reason="needs gitleaks (make tools; the devcontainer has it)"
)
TOKEN = "h4probe_" + "q" * 20
PROBE_RULES = """title = "probe"
[[rules]]
id = "probe-token"
description = "a probe token, assembled at run time"
regex = '''h4probe_[a-z]{20}'''
keywords = ["h4probe_"]
"""


def attest(fx: Fixture, data: bytes, run: str = RUN) -> Path:
    """What make evals-agent-config writes beside an entry: a file named by the SHA-256 of the entry's exact bytes,
    in the Author's store under ~/.local/state/h4reet, which agent sessions can't write (review A, 4)."""
    store = fx.home / ".local/state/h4reet/evals/attested"
    store.mkdir(parents=True, exist_ok=True)
    stamp = store / hashlib.sha256(data).hexdigest()
    stamp.write_text(f"{run}\n", encoding="utf-8")
    return stamp


STUB_DOCKER = r"""#!/usr/bin/env python3
import hashlib, json, os, sys
here = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[1:]
path = os.path.join(here, "docker.control.json")
control = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
entry = {
    "argv": args,
    "env_keys": sorted(os.environ),
    "docker_env": {k: v for k, v in os.environ.items() if k.startswith("DOCKER_")},
}
rc = 0
if args[:1] == ["build"]:
    context = args[-1]
    entry["context_listing"] = sorted(os.listdir(context))
    entry["context_writable"] = os.access(context, os.W_OK)
    if control.get("build_fails"):
        print("build: a step failed")
        rc = 1
    else:
        iid = args[args.index("--iidfile") + 1]
        with open(iid, "w", encoding="utf-8") as handle:
            handle.write("sha256:" + hashlib.sha256(b"devcontainer").hexdigest())
elif args[:1] == ["run"]:
    image = next(a for a in args if a.startswith("sha256:"))
    command = args[args.index(image) + 1 :]
    entry["command"] = command
    for spec in [args[i + 1] for i, a in enumerate(args) if a == "--mount"]:
        fields = dict(f.partition("=")[::2] for f in spec.split(","))
        if fields.get("target") == "/work":
            entry["work_has_node_modules_dir"] = os.path.isdir(fields["source"])
        if fields.get("target") == "/run/h4-contract/recording.json":
            entry["recording_readable"] = os.access(fields["source"], os.R_OK)
        if fields.get("target") == "/policy":
            entry["policy"] = {
                name: open(os.path.join(fields["source"], name), encoding="utf-8").read()
                for name in sorted(os.listdir(fields["source"]))
            }
            entry["policy_readonly"] = "readonly" in spec.split(",")
    if command[:1] == ["npm"]:
        building = command[1:2] == ["run"] and "build" in command
        rc = 1 if control.get("npm_fails") or (building and control.get("web_build_fails")) else 0
    elif command[:1] == ["make"]:
        target = command[-1]
        print(control.get("print", {}).get(target, f"{target}: ok"))
        rc = 1 if target in control.get("fail", []) else 0
    else:
        print(control.get("vitest_output", " \u2713 test/contract/replay.test.ts > the adapter contract: recorded live: local (live) > C1: ok 2ms"))
        rc = control.get("vitest_rc", 0)
elif args[:1] == ["compose"]:
    rc = 1 if control.get("compose_fails") else 0
with open(os.path.join(here, "docker.calls"), "a", encoding="utf-8") as handle:
    handle.write(json.dumps(entry) + "\n")
sys.exit(rc)
"""

STUB_GITLEAKS = r"""#!/usr/bin/env python3
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[1:]
ignore = args[args.index("--gitleaks-ignore-path") + 1] if "--gitleaks-ignore-path" in args else ""
entry = {
    "argv": args,
    "cwd": os.getcwd(),
    "env_keys": sorted(os.environ),
    "no_replace": os.environ.get("GIT_NO_REPLACE_OBJECTS"),
    "ignore_was_fresh": bool(ignore) and os.path.isdir(ignore) and not os.listdir(ignore),
}
with open(os.path.join(here, "gitleaks.calls"), "a", encoding="utf-8") as handle:
    handle.write(json.dumps(entry) + "\n")
# What gitleaks 8.30.1 does, per subcommand ("git", "dir"), unless gitleaks.control.json says otherwise: its log on
# stderr, a JSON report, 0 when clean, and --exit-code's value with findings.
path = os.path.join(here, "gitleaks.control.json")
control = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
kind = args[0]
mode = control.get("modes", {}).get(kind, "clean")
scanned = control.get("scanned", {}).get(kind, 1 if kind == "git" else 120)
def log(line):
    print("6:25PM " + line, file=sys.stderr)
if mode == "git-error":  # git failed beneath it: gitleaks logs git's error and exits 0
    log("ERR [git] fatal: bad object")
    log('ERR error="stderr is not empty"')
if mode == "skipped":  # a file dir mode couldn't read
    log("WRN skipping file: permission denied path=docs/readme.md")
if kind == "git" and mode != "no-count":
    log(f"INF {scanned} commits scanned.")
if kind != "dir" or mode != "no-count":
    log(f"INF scanned ~{scanned if kind == 'dir' else 10} bytes in 1ms")
findings = []
if kind in control.get("finds", []) or mode == "quiet-finds":
    commit = "c" * 40 if kind == "git" else ""
    findings = [{"RuleID": "probe-token", "File": "docs/readme.md", "StartLine": 3, "Commit": commit}]
    log(f"WRN leaks found: {len(findings)}")
else:
    log("INF no leaks found")
if mode != "no-report":
    report = args[args.index("--report-path") + 1]
    with open(report, "w", encoding="utf-8") as handle:
        handle.write("not json" if mode == "garbage" else json.dumps(findings))
code = int(args[args.index("--exit-code") + 1]) if "--exit-code" in args else 1
sys.exit(code if findings and mode != "quiet-finds" else 0)
"""

# The main tree's stand-ins log to <fixture>/logs, found from their own path, because the gate gives them a
# minimal environment.
STUB_SCRIPT = r"""#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
here = Path(__file__).resolve()
logs = here.parents[{depth}] / "logs"
name = "{name}"
entry = {{
    "argv": sys.argv[1:],
    "isolated": sys.flags.isolated,
    "no_bytecode": sys.flags.dont_write_bytecode,
    "pycache_prefix": sys.pycache_prefix,
    "path": os.environ.get("PATH", ""),
    "env_keys": sorted(os.environ),
}}
with open(logs / f"{{name}}.calls", "a", encoding="utf-8") as handle:
    handle.write(json.dumps(entry) + "\n")
control = logs / f"{{name}}.control"
if control.exists():
    text = control.read_text(encoding="utf-8")
    print(text.split("\n", 1)[1] if "\n" in text else "")
    sys.exit(int(text.split("\n", 1)[0]))
print("{ok}")
"""

# What the branch commits in place of the Author's code: anything that runs it leaves a marker.
HOSTILE = """#!/usr/bin/env python3
from pathlib import Path
Path({marker!r}).write_text("ran", encoding="utf-8")
print("compose policy: PASS")
"""


def git(cwd: Path, *args: str) -> str:
    done = subprocess.run(
        [
            "git",
            "-C",
            str(cwd),
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@example.invalid",
            "-c",
            "commit.gpgsign=false",
            *args,
        ],
        env={
            "PATH": SYSTEM_PATH,
            "HOME": str(cwd),
            "LC_ALL": "C",
            "GIT_CONFIG_NOSYSTEM": "1",
        },
        capture_output=True,
        text=True,
        check=True,
    )
    return done.stdout.strip()


def git_bytes(cwd: Path, *args: str, data: bytes = b"") -> bytes:
    """git with bytes in and out, for the plumbing (hash-object, mktree, ls-tree -z)."""
    done = subprocess.run(
        ["git", "-C", str(cwd), *args],
        input=data,
        env={
            "PATH": SYSTEM_PATH,
            "HOME": str(cwd),
            "LC_ALL": "C",
            "GIT_CONFIG_NOSYSTEM": "1",
        },
        capture_output=True,
        check=True,
    )
    return done.stdout


def write(path: Path, text: str, mode: int = 0o644) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    path.chmod(mode)


def plant(repo: Path, branch: str, rel: str, kind: str) -> str:
    """Move a branch to a commit whose tree also holds rel, at the top or in a folder the tree doesn't have yet: a
    gitfile ("file"), a folder holding a config ("dir") or nothing ("empty"), or a link into the tree ("link"), which
    tarfile's data filter would extract. git add refuses such a name (verify_path), so the tree is built with git's plumbing, as a hostile
    branch could be."""
    if kind == "file":
        entry = (
            b"100644 blob "
            + git_bytes(
                repo, "hash-object", "-w", "--stdin", data=b"gitdir: ../elsewhere\n"
            ).strip()
        )
    elif kind == "empty":  # a folder holding nothing: the empty tree
        entry = b"040000 tree " + git_bytes(repo, "mktree", "-z").strip()
    elif kind == "dir":
        config = git_bytes(
            repo, "hash-object", "-w", "--stdin", data=b"[core]\n\tbare = false\n"
        ).strip()
        folder = git_bytes(
            repo, "mktree", "-z", data=b"100644 blob %s\tconfig\0" % config
        )
        entry = b"040000 tree " + folder.strip()
    else:
        target = b"../docs" if "/" in rel else b"docs"
        entry = (
            b"120000 blob "
            + git_bytes(repo, "hash-object", "-w", "--stdin", data=target).strip()
        )
    parent, _, name = rel.rpartition("/")
    entry += b"\t" + name.encode() + b"\0"
    if parent:  # a new folder holding the entry
        folder = git_bytes(repo, "mktree", "-z", data=entry).strip()
        entry = b"040000 tree " + folder + b"\t" + parent.encode() + b"\0"
    tip = git(repo, "rev-parse", branch)
    root = git_bytes(repo, "ls-tree", "-z", f"{tip}^{{tree}}")
    tree = git_bytes(repo, "mktree", "-z", data=root + entry).decode().strip()
    commit = git(repo, "commit-tree", tree, "-p", tip, "-m", f"plant {rel}")
    git(repo, "update-ref", f"refs/heads/{branch}", commit)
    return commit


@dataclass
class Fixture:
    root: Path
    main: Path
    home: Path
    stubs: Path
    sysbin: Path
    logs: Path
    tmp: Path

    def control(self, **values: object) -> None:
        (self.stubs / "docker.control.json").write_text(
            json.dumps(values), encoding="utf-8"
        )

    def gitleaks_control(self, **values: object) -> None:
        """finds: the subcommands that report a finding; modes: {subcommand: mode}; scanned: {subcommand: count}."""
        (self.stubs / "gitleaks.control.json").write_text(
            json.dumps(values), encoding="utf-8"
        )

    def docker(self) -> list[dict]:
        return read_calls(self.stubs / "docker.calls")

    def gitleaks(self) -> list[dict]:
        return read_calls(self.stubs / "gitleaks.calls")

    def logged(self, name: str) -> list[dict]:
        return read_calls(self.logs / f"{name}.calls")

    def markers(self) -> list[str]:
        return sorted(p.name for p in self.logs.glob("EXPORT-*"))

    def branch(self, files: dict[str, str], name: str = "feature") -> str:
        """A branch off main with one commit that writes these files, by path."""
        git(self.main, "switch", "-q", "main")
        git(self.main, "switch", "-qc", name)
        for rel, text in files.items():
            write(self.main / rel, text)
        # These files only: the working tree's untracked and ignored ones stay out of every commit.
        git(self.main, "add", "-f", "--", *files)
        git(self.main, "commit", "-qm", f"{name} work")
        sha = git(self.main, "rev-parse", "HEAD")
        git(self.main, "switch", "-q", "main")
        return sha


def read_calls(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


@pytest.fixture
def fx(tmp_path: Path) -> Fixture:
    root = tmp_path.resolve()
    main, home, stubs, sysbin, logs, tmp = (
        root / "main",
        root / "home",
        root / "stubs",
        root / "sysbin",
        root / "logs",
        root / "tmp",
    )
    for directory in (main, home, stubs, sysbin, logs, tmp):
        directory.mkdir()
    for tool in ("python3", "git"):
        found = shutil.which(tool, path=SYSTEM_PATH)
        assert found, f"needs {tool}"
        (sysbin / tool).symlink_to(found)
    write(stubs / "docker", STUB_DOCKER, 0o755)
    write(stubs / "gitleaks", STUB_GITLEAKS, 0o755)
    # The Author's engine certificate, and the pinned Node the toolchain check puts first on PATH.
    write(home / ".config/h4reet-ai/agents-engine/docker/cert.pem", "not a real one\n")
    (home / ".nvm/versions/node/v24.21.0/bin").mkdir(parents=True)

    git(main, "init", "-q", "-b", "main")
    files = {
        ".gitignore": "corpus/intake/private/\n.venv/\n",
        ".gitleaks.toml": 'title = "fixture"\n',
        ".claude/git-hooks/reference-transaction": "#!/bin/sh\nexit 0\n",
        ".claude/git-hooks/pre-commit": "#!/bin/sh\nexit 0\n",
        ".claude/settings.json": "{}\n",
        ".devcontainer/Dockerfile": "FROM scratch\n",
        ".devcontainer/toolchain.vars": "NODE_VERSION=24.21.0\nCLAUDE_CODE_VERSION=2.1.295\n",
        "CLAUDE.md": "# fixture\n",
        "Makefile": f"lint test evals redteam-suite matrix validate-config credits-check:\n\t@touch {logs}/EXPORT-make\n",
        "corpus/00-profile.md": "A public corpus file.\n",
        "deploy/compose.yaml": "services: {}\n",
        "deploy/env.agents/dev-cpu.vars": "H4_STACK=dev-cpu\n",
        "docs/readme.md": "docs\n",
        "services/gateway/test/contract/live-cases.json": '{"cases": []}\n',
    }
    for rel, text in files.items():
        write(main / rel, text)
    write(main / "corpus/tools/check_corpus.py", CHECK_CORPUS.read_text("utf-8"))
    write(main / "tools/gates/gate", GATE.read_text("utf-8"), 0o755)
    for name, ok in (
        ("compose_policy", "compose policy: PASS"),
        ("toolchain_check", "toolchain-check: all match their pins"),
        ("content_check", "content check: PASS (no content files yet)"),
    ):
        write(
            main / f"tools/gates/{name}.py",
            STUB_SCRIPT.format(depth=3, name=name, ok=ok),
        )
    write(
        main / "deploy/agents-engine/engine.sh",
        STUB_SCRIPT.format(depth=3, name="engine", ok="E1-E16: PASS"),
        0o755,
    )
    # Spec 003's arrival step: the main tree's arrival check and credits renderer, stand-ins that log how they ran.
    write(
        main / "tools/gates/arrival_check.py",
        STUB_SCRIPT.format(
            depth=3, name="arrival_check", ok="arrival-check: 0 findings in 0 files"
        ),
    )
    write(
        main / "scripts/assets/credits.py",
        STUB_SCRIPT.format(
            depth=3,
            name="credits",
            ok="credits: OK: the renderings and the records' form",
        ),
    )
    git(main, "add", "-A")
    git(main, "commit", "-qm", "init")
    # Not committed: the Author's denylist, an untracked file, and an ignored .venv, none of which an export holds.
    write(main / "corpus/intake/private/denylist.txt", f"# phrases\n{PHRASE}\n")
    write(main / "untracked.txt", "only in the working tree\n")
    write(main / ".venv/bin/python", "planted\n")
    hooks = Path(
        git(main, "rev-parse", "--path-format=absolute", "--git-path", "hooks")
    )
    for name in ("reference-transaction", "pre-commit"):
        shutil.copy(main / ".claude/git-hooks" / name, hooks / name)
        (hooks / name).chmod(0o755)
    git(main, "config", "gc.packRefs", "false")
    return Fixture(root, main, home, stubs, sysbin, logs, tmp)


def gate(
    fx: Fixture, *args: str, path: str | None = None, **extra: str
) -> subprocess.CompletedProcess[str]:
    env = {
        "PATH": path or f"{fx.stubs}:{fx.sysbin}",
        "HOME": str(fx.home),
        "LC_ALL": "C",
        "TMPDIR": str(fx.tmp),
        **extra,
    }
    return subprocess.run(
        [str(fx.main / "tools/gates/gate"), *args],
        cwd=fx.main,
        env=env,
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )


def has(argv: list[str], *seq: str) -> bool:
    """argv holds seq as a contiguous run."""
    n = len(seq)
    return any(argv[i : i + n] == list(seq) for i in range(len(argv) - n + 1))


def by_kind(calls: list[dict], kind: str) -> list[dict]:
    return [c for c in calls if c["argv"][:1] == [kind]]


def make_runs(calls: list[dict]) -> list[dict]:
    return [c for c in by_kind(calls, "run") if c["command"][:1] == ["make"]]


def mount_source(argv: list[str], target: str) -> str:
    for i, arg in enumerate(argv):
        if arg == "--mount":
            fields = dict(f.partition("=")[::2] for f in argv[i + 1].split(","))
            if fields.get("target") == target:
                return fields["source"]
    raise AssertionError(f"no mount at {target}: {argv}")


def summary(done: subprocess.CompletedProcess[str]) -> str:
    lines = [ln for ln in done.stdout.splitlines() if ln.startswith("gate: ")]
    assert lines, done.stdout + done.stderr
    return lines[-1]


def status_of(done: subprocess.CompletedProcess[str], step: str) -> str:
    """The status the final table gives a step: lines of the form 'STATUS   step  notes'."""
    for line in reversed(done.stdout.splitlines()):  # the table is last
        parts = line.split()
        if len(parts) >= 2 and parts[1] == step and parts[0] in STATUSES:
            return parts[0]
    raise AssertionError(f"no table line for {step}:\n{done.stdout}")


def row(done: subprocess.CompletedProcess[str], step: str) -> str:
    """The final table's whole line for a step, its notes included."""
    for line in reversed(done.stdout.splitlines()):
        parts = line.split()
        if len(parts) >= 2 and parts[1] == step and parts[0] in STATUSES:
            return line
    raise AssertionError(f"no table line for {step}:\n{done.stdout}")


STATUSES = {"PASS", "FAIL", "SKIP", "WARN", "PLANNED", "PENDING"}


# --------------------------------------------------------------------------------------------------
# A clean branch, end to end: what runs where, and with which flags
# --------------------------------------------------------------------------------------------------
def test_a_clean_branch_passes_and_each_phase_runs_where_and_how_plan_11_says(
    fx: Fixture,
) -> None:
    sha = fx.branch(CHANGE)
    done = gate(fx, "feature")
    assert done.returncode == 0, done.stdout + done.stderr
    calls = fx.docker()

    # The export: the commit's own tree, read-only, and nothing git doesn't track.
    (build,) = by_kind(calls, "build")
    export = Path(build["argv"][-1])
    tree = git(fx.main, "rev-parse", f"{sha}:.devcontainer")
    assert build["argv"][:5] == [
        "build",
        "--file",
        f"{export}/.devcontainer/Dockerfile",
        "--tag",
        f"h4reet-devcontainer:{tree}",
    ]
    assert build["argv"][5] == "--iidfile"
    assert ".git" not in build["context_listing"]
    assert "untracked.txt" not in build["context_listing"]
    assert ".venv" not in build["context_listing"]
    assert not build["context_writable"]
    assert build["docker_env"] == {"DOCKER_HOST": "unix:///var/run/docker.sock"}
    assert fx.tmp in export.parents
    assert not export.exists(), "the export outlived the run"

    # npm ci with the network, from the lockfile with scripts off; every later step without it.
    runs = by_kind(calls, "run")
    npm, *checks = runs
    assert npm["command"] == [
        "npm",
        "ci",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
    ]
    assert "--network" not in npm["argv"]
    assert [c["command"] for c in checks] == [
        ["make", "-f", "Makefile", "--no-print-directory", t] for t in TARGETS
    ]
    work = mount_source(npm["argv"], "/work")
    assert Path(work) != export and fx.tmp in Path(work).parents
    for call in runs:
        argv = call["argv"]
        assert has(argv, "--cap-drop", "ALL")
        assert has(argv, "--security-opt", "no-new-privileges")
        assert has(argv, "--user", f"{os.getuid()}:{os.getgid()}")
        assert has(argv, "--workdir", "/work")
        assert mount_source(argv, "/work") == work
        assert call["docker_env"] == {"DOCKER_HOST": "unix:///var/run/docker.sock"}
    for call in checks:
        assert has(call["argv"], "--network", "none")

    # The host phase: the main tree's own scripts, through PY_HOST's flags, on the export.
    (policy,) = fx.logged("compose_policy")
    assert policy["argv"] == ["--root", str(export)]
    (toolchain,) = fx.logged("toolchain_check")
    assert toolchain["argv"] == [f"{export}/.devcontainer/toolchain.vars"]
    assert toolchain["path"].startswith(f"{fx.home}/.nvm/versions/node/v24.21.0/bin:")
    for run in (policy, toolchain):
        assert (run["isolated"], run["no_bytecode"], run["pycache_prefix"]) == (
            1,
            1,
            "/dev/null",
        )

    # gitleaks over the range, with the flags of plan §11 and git log's --text, then over the export.
    scan, tree_scan = fx.gitleaks()
    base = git(fx.main, "merge-base", "main", sha)
    argv = scan["argv"]
    assert argv[:2] == ["git", f"--log-opts=--text {base}..{sha}"]
    assert argv[-1] == str(fx.main)
    assert scan["no_replace"] == "1"
    # dir mode from inside the export, so it walks paths relative to the tree, which the config's ^-anchored
    # allowlists match, and names findings by them.
    tree_argv = tree_scan["argv"]
    assert (tree_argv[0], tree_argv[-1]) == ("dir", ".")
    assert tree_scan["cwd"] == str(export)
    for call in (scan, tree_scan):
        flags = call["argv"]
        assert flags[flags.index("--config") + 1] == str(fx.main / ".gitleaks.toml")
        assert "--ignore-gitleaks-allow" in flags and "--redact" in flags
        assert flags[flags.index("--exit-code") + 1] == "99"
        assert call["ignore_was_fresh"]
    assert (
        scan["argv"][scan["argv"].index("--gitleaks-ignore-path") + 1]
        != (tree_argv[tree_argv.index("--gitleaks-ignore-path") + 1])
    )

    # Spec 003's arrival check over the commits since main: the main tree's, through PY_HOST's flags. The credits'
    # check is the branch's own code, so it ran in the container (make credits-check, above), never here.
    (arrival_run,) = fx.logged("arrival_check")
    assert arrival_run["argv"] == ["--repo", str(fx.main), "--range", f"{base}..{sha}"]
    assert (
        arrival_run["isolated"],
        arrival_run["no_bytecode"],
        arrival_run["pycache_prefix"],
    ) == (1, 1, "/dev/null")
    assert fx.logged("credits") == []
    assert status_of(done, "arrival") == "PASS"
    assert status_of(done, "credits") == "PASS"

    # The image build on the agents' engine, with the Author's certificate.
    (compose,) = by_kind(calls, "compose")
    assert compose["argv"] == [
        "compose",
        "-p",
        "h4reet-dev-cpu",
        "-f",
        f"{export}/deploy/compose.yaml",
        "--env-file",
        f"{export}/deploy/env.agents/dev-cpu.vars",
        "--profile",
        "*",
        "build",
    ]
    assert compose["docker_env"] == {
        "DOCKER_HOST": ENGINE,
        "DOCKER_TLS_VERIFY": "1",
        "DOCKER_CERT_PATH": f"{fx.home}/.config/h4reet-ai/agents-engine/docker",
    }

    # The corpus, checked against the Author's denylist by the main tree's check_corpus.
    assert "denylist applied (1 phrase)" in done.stdout
    assert fx.logged("engine") == []  # stage E's triggers weren't touched
    line = summary(done)
    assert line.startswith(f"gate: {sha} (feature) by tools/gates/gate at ")
    assert re.search(r"\d+ PASS, \d+ SKIP, 0 WARN, 0 PLANNED, 0 PENDING, 0 FAIL", line)
    assert "DEGRADED" not in line
    # The gate runs only from main's checkout, so the merge is the one command, with no switch first (review D, 1).
    merge = [ln for ln in done.stdout.splitlines() if ln.startswith("merge: ")]
    assert merge == [
        f"merge: git --no-replace-objects merge --no-ff -m 'Merge feature ({sha[:12]})' -m '{line}' {sha}"
    ]


def hostile_copies(fx: Fixture) -> dict[str, str]:
    """The branch's own copies of the code the gate runs on the host, each leaving a marker if anything runs it."""
    return {
        rel: HOSTILE.format(marker=str(fx.logs / f"EXPORT-{rel.replace('/', '-')}"))
        for rel in (
            "tools/gates/compose_policy.py",
            "tools/gates/toolchain_check.py",
            "tools/gates/gate",
            "tools/gates/arrival_check.py",
            "scripts/assets/credits.py",
            "corpus/tools/check_corpus.py",
            "deploy/agents-engine/engine.sh",
            "evals/agent-config/behavioral.py",
            "evals/agent-config/static.py",
            "node_modules/.bin/prettier",
        )
    }


def real_tier_files() -> dict[str, str]:
    """The repository's behavioral cases, thresholds, and roles, for a branch: what status reads as data."""
    files = {"CLAUDE.md": "# fixture, changed\n"}
    files["evals/agent-config/thresholds.yaml"] = (
        REPO / "evals/agent-config/thresholds.yaml"
    ).read_text(encoding="utf-8")
    for case in sorted((REPO / "evals/agent-config/cases").glob("*.yaml")):
        files[f"evals/agent-config/cases/{case.name}"] = case.read_text(
            encoding="utf-8"
        )
    for role in sorted((REPO / ".claude/agents").glob("*.md")):
        files[f".claude/agents/{role.name}"] = role.read_text(encoding="utf-8")
    return files


def commit_on_main(fx: Fixture, files: dict[str, str], message: str) -> None:
    """Write these files into the main tree and commit them on main, where its checkout is. The gate runs only from
    main's checkout with the tracked files clean and nothing untracked where its code is (review D, finding 1), so what
    a test changes in the main tree's code or config is committed there. After fx.branch, so the branch's tree stays as
    it was given."""
    for rel, text in files.items():
        write(fx.main / rel, text)
    git(fx.main, "add", "-f", "--", *files)
    git(fx.main, "commit", "-qm", message)


def install_real_tier(fx: Fixture) -> None:
    """The repository's behavioral.py and static.py, committed on main (commit_on_main)."""
    commit_on_main(
        fx,
        {
            f"evals/agent-config/{name}": (
                REPO / "evals/agent-config" / name
            ).read_text(encoding="utf-8")
            for name in ("behavioral.py", "static.py")
        },
        "main's behavioral tier",
    )


def test_nothing_from_the_export_runs_on_the_host(fx: Fixture) -> None:
    # The branch's copies of behavioral.py and static.py sit beside the cases its status reads. The gate loads the
    # main tree's behavioral.py, which loads the main tree's static.py, and reads the export as data only.
    fx.branch({**real_tier_files(), **hostile_copies(fx)})
    install_real_tier(fx)
    done = gate(fx, "feature", "--prove")
    assert fx.markers() == [], done.stdout
    assert len(fx.logged("compose_policy")) == 1
    assert fx.logged("engine")[0]["argv"] == [
        "prove"
    ]  # the main tree's engine.sh, by --prove
    # The step ran, on the export, through to the trigger hash.
    assert status_of(done, "agent-config-evals") == "PENDING", done.stdout
    assert "PENDING (behavioral tier): no run for trigger hash" in done.stdout


@pytest.mark.parametrize(
    ("rel", "kind"),
    [
        (".git", "file"),
        (".git", "dir"),
        (".git", "link"),
        (".git", "empty"),
        (".GIT", "dir"),
        ("sub/.git", "file"),
        ("sub/.Git", "link"),
    ],
)
def test_a_path_git_takes_for_its_own_directory_stops_the_gate(
    fx: Fixture, rel: str, kind: str
) -> None:
    # The behavioral step's status runs git in a tree that holds .git, and git would read its config and index.
    fx.branch({**real_tier_files(), **hostile_copies(fx)})
    plant(fx.main, "feature", rel, kind)
    install_real_tier(fx)
    done = gate(fx, "feature", "--prove")
    assert done.returncode == 1
    assert status_of_export_failure(done), done.stdout
    # The gate's own refusal, from the tree's listing: git 2.43's archive refuses these names too, but only as its
    # version and core.protectNTFS have it.
    assert "a path git takes for its own directory" in done.stdout, done.stdout
    assert rel in done.stdout
    assert fx.docker() == [] and fx.gitleaks() == []
    assert fx.logged("compose_policy") == [] and fx.logged("engine") == []
    assert fx.markers() == []


def test_the_gate_refuses_a_git_name_that_git_archive_would_export(fx: Fixture) -> None:
    # With core.protectNTFS off, git archive exports git~1, NTFS's short name for .git. The gate's check doesn't
    # depend on git's version or its configuration.
    git(fx.main, "config", "core.protectNTFS", "false")
    fx.branch(CHANGE)
    plant(fx.main, "feature", "git~1", "file")
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of_export_failure(done), done.stdout
    assert "holds git~1: a path git takes for its own directory" in done.stdout
    assert fx.docker() == []


def test_the_authors_environment_never_reaches_a_tool(fx: Fixture) -> None:
    fx.branch(CHANGE)
    done = gate(
        fx,
        "feature",
        H4_PROBE_CANARY="canary",
        DOCKER_CONTEXT="elsewhere",
        DOCKER_HOST="tcp://10.0.0.9:2375",
        HTTPS_PROXY="http://proxy.invalid:1",
        GIT_DIR="/nonexistent",
    )
    assert done.returncode == 0, done.stdout + done.stderr
    allowed = {
        "PATH",
        "HOME",
        "LC_ALL",
        "LC_CTYPE",
        "PWD",
        "GIT_NO_REPLACE_OBJECTS",
        "DOCKER_HOST",
        "DOCKER_TLS_VERIFY",
        "DOCKER_CERT_PATH",
    }
    for call in fx.docker() + fx.gitleaks() + fx.logged("compose_policy"):
        assert set(call["env_keys"]) <= allowed, call["env_keys"]
    for call in fx.docker():
        assert call["docker_env"].get("DOCKER_HOST") != "tcp://10.0.0.9:2375"


# --------------------------------------------------------------------------------------------------
# The export: one SHA, proven, or the gate stops
# --------------------------------------------------------------------------------------------------
def test_a_replace_ref_stops_the_gate_before_anything_runs(fx: Fixture) -> None:
    sha = fx.branch(CHANGE)
    other = git(fx.main, "rev-parse", "main")
    git(fx.main, "replace", sha, other)
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert "refs/replace" in done.stdout + done.stderr
    assert fx.docker() == [] and fx.gitleaks() == []


def test_info_attributes_stops_the_gate(fx: Fixture) -> None:
    fx.branch(CHANGE)
    info = Path(
        git(fx.main, "rev-parse", "--path-format=absolute", "--git-path", "info")
    )
    write(info / "attributes", "docs/readme.md export-ignore\n")
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert "info/attributes" in done.stdout + done.stderr
    assert fx.docker() == []


def test_an_export_that_doesnt_hash_to_the_commits_tree_stops_the_gate(
    fx: Fixture,
) -> None:
    # A committed .gitattributes tells git archive to leave a file out: the tree check catches what no list names.
    fx.branch({".gitattributes": "docs/readme.md export-ignore\n"})
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert "doesn't match the commit's own tree" in done.stdout + done.stderr
    assert fx.docker() == []


def swap_commit_object(repo: Path, sha: str, other: str) -> None:
    """Put another commit's loose object where sha's is, as a corrupted or tampered object store would."""
    objects = Path(
        git(repo, "rev-parse", "--path-format=absolute", "--git-path", "objects")
    )
    loose = objects / sha[:2] / sha[2:]
    loose.chmod(0o644)
    loose.write_bytes((objects / other[:2] / other[2:]).read_bytes())


def test_a_commit_object_that_isnt_its_sha_stops_the_gate(fx: Fixture) -> None:
    sha = fx.branch(CHANGE)
    swap_commit_object(fx.main, sha, git(fx.main, "rev-parse", "main"))
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of_export_failure(done)
    assert fx.docker() == []


def status_of_export_failure(done: subprocess.CompletedProcess[str]) -> bool:
    return "-> FAIL export" in done.stdout and "nothing else ran" in done.stdout


def test_the_commit_object_is_rehashed_even_where_git_wouldnt(fx: Fixture) -> None:
    # git rev-parse ...^{commit} checks the hash; git cat-file, which reads the tree, doesn't. So commit_tree() does.
    sha = fx.branch(CHANGE)
    swap_commit_object(fx.main, sha, git(fx.main, "rev-parse", "main"))
    with pytest.raises(gm.Stop, match="isn't that commit"):
        gm.commit_tree(fx.main, sha)


def test_a_link_out_of_the_tree_isnt_extracted(fx: Fixture) -> None:
    git(fx.main, "switch", "-qc", "feature")
    (fx.main / "docs/escape").symlink_to("/etc/hostname")
    git(fx.main, "add", "docs/escape")
    git(fx.main, "commit", "-qm", "a link out")
    git(fx.main, "switch", "-q", "main")
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert "couldn't be extracted safely" in done.stdout
    assert fx.docker() == []


def test_every_git_call_reads_the_commits_own_objects(fx: Fixture) -> None:
    real = (fx.sysbin / "git").resolve()
    log = fx.logs / "git.calls"
    (fx.sysbin / "git").unlink()
    write(
        fx.sysbin / "git",
        "#!/usr/bin/env python3\nimport json, os, sys\n"
        f"with open({str(log)!r}, 'a') as h:\n"
        "    h.write(json.dumps(os.environ.get('GIT_NO_REPLACE_OBJECTS')) + '\\n')\n"
        f"os.execv({str(real)!r}, ['git', *sys.argv[1:]])\n",
        0o755,
    )
    fx.branch(CHANGE)
    assert gate(fx, "feature").returncode == 0
    seen = log.read_text(encoding="utf-8").splitlines()
    assert len(seen) > 10 and set(seen) == {'"1"'}


@pytest.mark.parametrize("ref", ["-x", "feature..main", "has space"])
def test_a_ref_that_isnt_a_plain_name_is_refused(fx: Fixture, ref: str) -> None:
    fx.branch(CHANGE)
    done = gate(fx, "--", ref)
    assert done.returncode == 2
    assert fx.docker() == []


def test_a_ref_that_isnt_a_commit_stops_the_gate(fx: Fixture) -> None:
    done = gate(fx, "no-such-branch")
    assert done.returncode == 1
    assert "isn't a commit" in done.stdout + done.stderr
    assert fx.docker() == []


# --------------------------------------------------------------------------------------------------
# Who may run it, and how
# --------------------------------------------------------------------------------------------------
def test_it_refuses_the_agent_sandbox(fx: Fixture) -> None:
    fx.branch(CHANGE)
    done = gate(fx, "feature", SANDBOX_RUNTIME="1")
    assert done.returncode == 2
    assert "the Author's" in done.stderr
    assert fx.docker() == []


def test_it_refuses_a_linked_worktrees_copy(fx: Fixture) -> None:
    fx.branch(CHANGE)
    worktree = fx.root / "wt"
    git(fx.main, "worktree", "add", "-q", str(worktree), "feature")
    done = subprocess.run(
        [str(worktree / "tools/gates/gate"), "feature"],
        cwd=worktree,
        env={
            "PATH": f"{fx.stubs}:{fx.sysbin}",
            "HOME": str(fx.home),
            "LC_ALL": "C",
            "TMPDIR": str(fx.tmp),
        },
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    assert done.returncode == 2
    assert f"{fx.main}/tools/gates/gate" in done.stderr
    assert fx.docker() == []


def refused(fx: Fixture, done: subprocess.CompletedProcess[str]) -> None:
    """The gate refused (exit 2) before anything ran: no output but the refusal, and no tool or script called."""
    assert done.returncode == 2, done.stdout + done.stderr
    assert done.stdout == "", done.stdout
    assert fx.docker() == [] and fx.gitleaks() == []
    for name in ("compose_policy", "toolchain_check", "engine"):
        assert fx.logged(name) == [], name
    assert fx.markers() == []


@pytest.mark.parametrize(
    "head", ["the branch", "detached at main", "another branch at main"]
)
def test_it_refuses_unless_head_is_main(fx: Fixture, head: str) -> None:
    # With the branch checked out, the main tree's compose policy, toolchain check, check_corpus, behavioral.py, and
    # engine.sh are the branch's own, and would grade it (review D, finding 1). This branch leaves the gate alone: one
    # that changed it would be running its own gate, which no check inside the gate can stop (plan §11). HEAD must be
    # refs/heads/main itself, not a commit or another branch that matches main today.
    copies = {r: t for r, t in hostile_copies(fx).items() if r != "tools/gates/gate"}
    fx.branch({**real_tier_files(), **copies})
    if head == "the branch":
        git(fx.main, "switch", "-q", "feature")
    elif head == "detached at main":
        git(fx.main, "switch", "-q", "--detach", "main")
    else:
        git(fx.main, "switch", "-qc", "also-main", "main")
    done = gate(fx, "--prove", "feature")
    refused(fx, done)
    assert "refs/heads/main" in done.stderr, done.stderr


@pytest.mark.parametrize("change", ["edited", "staged", "deleted", "edited elsewhere"])
def test_it_refuses_tracked_files_that_dont_match_main(
    fx: Fixture, change: str
) -> None:
    # The gate runs and loads the working tree's files, so every tracked file must match HEAD, in the index and the
    # working tree, wherever it is (review D, finding 1).
    fx.branch(CHANGE)
    rel = (
        "docs/readme.md"
        if change == "edited elsewhere"
        else "tools/gates/compose_policy.py"
    )
    if change == "deleted":
        (fx.main / rel).unlink()
    else:
        write(
            fx.main / rel, HOSTILE.format(marker=str(fx.logs / "EXPORT-edited-on-main"))
        )
    if change == "staged":
        git(fx.main, "add", "--", rel)
    done = gate(fx, "feature")
    refused(fx, done)
    assert "tracked" in done.stderr and rel in done.stderr, done.stderr


@pytest.mark.parametrize("flag", ["--assume-unchanged", "--skip-worktree"])
def test_it_refuses_a_change_git_is_told_to_hide(fx: Fixture, flag: str) -> None:
    # git status shows no change to a file marked assume-unchanged or skip-worktree, so the mark itself refuses.
    fx.branch(CHANGE)
    rel = "tools/gates/compose_policy.py"
    git(fx.main, "update-index", flag, "--", rel)
    write(fx.main / rel, HOSTILE.format(marker=str(fx.logs / "EXPORT-hidden-on-main")))
    assert git(fx.main, "status", "--porcelain", "--untracked-files=no") == ""
    done = gate(fx, "feature")
    refused(fx, done)
    assert rel in done.stderr and "assume-unchanged or skip-worktree" in done.stderr, (
        done.stderr
    )


@pytest.mark.parametrize(
    "rel",
    [
        "tools/gates/planted.py",
        "tools/gates/compose_policy.pyc",  # sourceless bytecode beside its source, which Python 3 never writes
        "tools/gates/__pycache__/notes.txt",  # in a cache folder, but not bytecode
        "corpus/tools/yaml.py",
        "evals/agent-config/static.py",
        "evals/agent-config/cases/planted.yaml",
        "deploy/agents-engine/systemd/planted.service",
        "deploy/agents-engine/.venv/bin/python",  # ignored (.venv/), and still not main's
    ],
)
def test_it_refuses_a_file_git_doesnt_track_where_its_code_is(
    fx: Fixture, rel: str
) -> None:
    # A glob, a copy, or an import from its folder would pick it up. Ignored files count too: an ignored file is one
    # agents can write and git doesn't show (CLAUDE.md).
    fx.branch(CHANGE)
    write(fx.main / rel, "planted\n")
    done = gate(fx, "feature")
    refused(fx, done)
    assert rel in done.stderr, done.stderr


def test_files_git_doesnt_track_elsewhere_dont_refuse_it(fx: Fixture) -> None:
    # The Author's own untracked folders; an entry make evals-agent-config left in history/, untracked, which is data
    # the gate never reads from the main tree; and Python's caches beside main's code, which PY_HOST never reads (the
    # matrix's H/pyhost rows). The fixture's untracked.txt, its ignored .venv/, and the denylist are there too.
    fx.branch(CHANGE)
    for rel in (
        ".idea/workspace.xml",
        ".vscode/settings.json",
        ".github/workflows/ci.yml",
        "docs/draft.md",
        f"evals/agent-config/history/{RUN}.json",
        "tools/gates/__pycache__/compose_policy.cpython-312.pyc",
        "corpus/tools/__pycache__/test_check_corpus.cpython-312-pytest-9.1.1.pyc",
        "evals/agent-config/__pycache__/static.cpython-312.pyc",
        "deploy/agents-engine/test/__pycache__/test_authz.cpython-312-pytest-9.1.1.pyc",
    ):
        write(fx.main / rel, "not main's\n")
    done = gate(fx, "feature")
    assert done.returncode == 0, done.stdout + done.stderr


def test_contract_replay_is_held_to_the_main_tree_only(fx: Fixture) -> None:
    # make contract-live reaches the replay through the checkout's own Makefile and operator.py, which have run by
    # then, so the checkout is the Author's choice there, and the replay reads HEAD's export, whatever HEAD is (plan
    # §11). Only a linked worktree's copy is refused.
    fx.branch(CHANGE)
    git(fx.main, "switch", "-q", "feature")
    head = git(fx.main, "rev-parse", "HEAD")
    done = gate(fx, "--contract-replay", str(recording(fx)))
    assert done.returncode == 0, done.stdout + done.stderr
    assert f"HEAD {head[:12]}" in done.stdout


def test_run_by_a_bare_python3_it_starts_again_with_py_host_flags(fx: Fixture) -> None:
    # Without -I, PYTHONPATH would put this json.py ahead of the standard library's.
    planted = fx.root / "planted"
    write(
        planted / "json.py", f"open({str(fx.logs / 'EXPORT-planted')!r}, 'w').close()\n"
    )
    done = subprocess.run(
        ["python3", str(fx.main / "tools/gates/gate"), "--help"],
        env={
            "PATH": f"{fx.stubs}:{fx.sysbin}",
            "HOME": str(fx.home),
            "PYTHONPATH": str(planted),
        },
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert done.returncode == 0, done.stderr
    assert "--contract-replay" in done.stdout
    assert fx.markers() == []


# --------------------------------------------------------------------------------------------------
# The makefiles the container phase's make would read
# --------------------------------------------------------------------------------------------------
@pytest.mark.parametrize("name", ["GNUmakefile", "makefile"])
def test_a_makefile_main_doesnt_allow_stops_the_container_phase(
    fx: Fixture, name: str
) -> None:
    fx.branch({name: "lint:\n\t@true\n"})
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of(done, "makefiles") == "FAIL"
    assert make_runs(fx.docker()) == []
    assert status_of(done, "gitleaks") == "PASS"  # the host phase still runs


def test_exactly_mains_gnumakefile_is_allowed(fx: Fixture) -> None:
    write(fx.main / "GNUmakefile", "include Makefile\n")
    git(fx.main, "add", "GNUmakefile")
    git(fx.main, "commit", "-qm", "main's GNUmakefile")
    fx.branch(CHANGE)
    assert gate(fx, "feature").returncode == 0
    fx.branch({"GNUmakefile": "include Makefile\nlint:\n\t@true\n"}, name="other")
    done = gate(fx, "other")
    assert status_of(done, "makefiles") == "FAIL"


# --------------------------------------------------------------------------------------------------
# The container phase
# --------------------------------------------------------------------------------------------------
def test_a_failing_check_fails_the_gate_and_the_rest_still_run(fx: Fixture) -> None:
    fx.branch(CHANGE)
    fx.control(fail=["lint"])
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert [c["command"][-1] for c in make_runs(fx.docker())] == TARGETS
    assert status_of(done, "lint") == "FAIL"
    assert status_of(done, "test") == "PASS"
    assert "failing: lint FAIL" in summary(done)
    assert "merge --no-ff" not in done.stdout


def test_a_pending_line_from_make_evals_makes_the_gate_pending(fx: Fixture) -> None:
    fx.branch(CHANGE)
    fx.control(print={"evals": "PENDING: run make evals-agent-config"})
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of(done, "evals") == "PENDING"


def test_a_devcontainer_that_wont_build_points_at_the_host_gate(fx: Fixture) -> None:
    fx.branch(CHANGE)
    fx.control(build_fails=True)
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert by_kind(fx.docker(), "run") == []
    assert status_of(done, "lint") == "FAIL"
    assert "tools/gates/gate --host" in done.stdout
    assert status_of(done, "gitleaks") == "PASS"


def test_npm_ci_failing_stops_the_checks_that_need_it(fx: Fixture) -> None:
    fx.branch(CHANGE)
    fx.control(npm_fails=True)
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert make_runs(fx.docker()) == []
    assert status_of(done, "npm-ci") == "FAIL"


def test_host_mode_runs_no_container_and_says_degraded(fx: Fixture) -> None:
    sha = fx.branch(CHANGE)
    done = gate(fx, "--host", "feature")
    assert done.returncode == 0, done.stdout + done.stderr
    calls = fx.docker()
    assert by_kind(calls, "build") == [] and by_kind(calls, "run") == []
    assert (
        len(by_kind(calls, "compose")) == 1
    )  # the host phase's image build still runs
    line = summary(done)
    assert line.startswith(f"gate: {sha} (feature)")
    assert "DEGRADED (--host)" in line


# --------------------------------------------------------------------------------------------------
# The host phase
# --------------------------------------------------------------------------------------------------
def test_the_corpus_is_the_exports_checked_against_the_authors_denylist(
    fx: Fixture,
) -> None:
    fx.branch({"corpus/01-new.md": f"Something about the {PHRASE} here.\n"})
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of(done, "corpus") == "FAIL"
    assert "01-new.md: contains a denylisted phrase" in done.stdout
    assert PHRASE not in done.stdout + done.stderr  # never printed


def test_the_main_trees_working_corpus_isnt_what_is_checked(fx: Fixture) -> None:
    fx.branch(CHANGE)
    write(fx.main / "corpus/02-draft.md", f"An uncommitted draft with {PHRASE}.\n")
    done = gate(fx, "feature")
    assert status_of(done, "corpus") == "PASS"


def test_a_corpus_file_that_wont_parse_fails_the_step_not_the_gate(fx: Fixture) -> None:
    fx.branch({"corpus/facts/broken.yaml": "facts: [unclosed\n"})
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of(done, "corpus") == "FAIL"
    assert "check_corpus stopped" in done.stdout
    assert status_of(done, "gitleaks") == "PASS"  # the steps after it still ran


def test_without_docker_every_container_step_says_why(fx: Fixture) -> None:
    fx.branch(CHANGE)
    (fx.stubs / "docker").unlink()
    done = gate(fx, "feature")
    assert done.returncode == 1
    for step in ("devcontainer", "npm-ci", "lint", "matrix-h", "image"):
        assert status_of(done, step) == "FAIL"
    assert "docker isn't installed" in done.stdout


def test_a_missing_denylist_fails_the_corpus_step(fx: Fixture) -> None:
    fx.branch(CHANGE)
    (fx.main / "corpus/intake/private/denylist.txt").unlink()
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of(done, "corpus") == "FAIL"
    assert "is missing, so the corpus can't be checked against it" in done.stdout


def test_a_denylist_check_corpus_couldnt_apply_fails_the_corpus_step(
    fx: Fixture,
) -> None:
    fx.branch(CHANGE)
    (fx.main / "corpus/intake/private/denylist.txt").chmod(0o000)
    done = gate(fx, "feature")
    assert status_of(done, "corpus") == "FAIL"
    assert "the denylist wasn't applied" in done.stdout


@pytest.mark.parametrize("damage", ["uninstalled", "packed", "hookspath", "packrefs"])
def test_githooks_checks_what_make_githooks_check_does(
    fx: Fixture, damage: str
) -> None:
    fx.branch(CHANGE)
    hooks = Path(
        git(fx.main, "rev-parse", "--path-format=absolute", "--git-path", "hooks")
    )
    if damage == "uninstalled":
        (hooks / "pre-commit").unlink()
    elif damage == "packed":
        git(fx.main, "pack-refs", "--all", "--prune")
    elif damage == "hookspath":
        git(fx.main, "config", "core.hooksPath", str(fx.root / "elsewhere"))
    else:
        git(fx.main, "config", "--unset", "gc.packRefs")
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of(done, "githooks") == "FAIL"


def test_a_failing_policy_means_the_engine_never_builds(fx: Fixture) -> None:
    fx.branch(CHANGE)
    (fx.logs / "compose_policy.control").write_text(
        "1\ncompose policy: 1 refusal(s)", encoding="utf-8"
    )
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of(done, "policy") == "FAIL"
    assert status_of(done, "image") == "FAIL"
    assert by_kind(fx.docker(), "compose") == []


def test_a_planned_policy_still_builds(fx: Fixture) -> None:
    fx.branch(CHANGE)
    (fx.logs / "compose_policy.control").write_text(
        "0\nPLANNED (T063): seaweedfs's pin is open\ncompose policy: PASS, 1 planned",
        encoding="utf-8",
    )
    done = gate(fx, "feature")
    assert status_of(done, "policy") == "PLANNED"
    assert len(by_kind(fx.docker(), "compose")) == 1


# ADR 0023: Claude Code's pin is a floor, and toolchain_check passes a newer one with a "WARN:" line.
FLOOR_WARN = (
    "WARN: claude code 2.1.301 is newer than its floor, 2.1.295 (ADR 0023): the agent-config evals record the "
    "version each run used, and moving the floor runs them again"
)


def test_a_claude_code_above_its_floor_is_a_warn_the_merge_doesnt_wait_on(
    fx: Fixture,
) -> None:
    fx.branch(CHANGE)
    (fx.logs / "toolchain_check.control").write_text(
        f"0\n{FLOOR_WARN}\ntoolchain-check: all 15 match their pins, 1 newer than its floor (claude code)",
        encoding="utf-8",
    )
    done = gate(fx, "feature")
    assert done.returncode == 0, done.stdout + done.stderr
    assert status_of(done, "toolchain") == "WARN"
    assert f"-> WARN toolchain ({FLOOR_WARN})" in done.stdout
    line = summary(done)
    assert ", 1 WARN, " in line and "failing" not in line
    assert "merge --no-ff" in done.stdout


def test_a_warn_line_never_hides_a_failing_toolchain(fx: Fixture) -> None:
    fx.branch(CHANGE)
    (fx.logs / "toolchain_check.control").write_text(
        f"1\n{FLOOR_WARN}\ntoolchain-check: 1 of 15 differ from their pins (jq); see tasks.md T013",
        encoding="utf-8",
    )
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of(done, "toolchain") == "FAIL"
    assert "failing: toolchain FAIL" in summary(done)


def test_no_engine_certificate_fails_the_image_step_without_calling_docker(
    fx: Fixture,
) -> None:
    fx.branch(CHANGE)
    shutil.rmtree(fx.home / ".config/h4reet-ai/agents-engine")
    done = gate(fx, "feature")
    assert status_of(done, "image") == "FAIL"
    assert "engine.sh setup" in done.stdout
    assert by_kind(fx.docker(), "compose") == []


def test_an_engine_that_doesnt_build_names_the_authors_command(fx: Fixture) -> None:
    fx.branch(CHANGE)
    fx.control(compose_fails=True)
    done = gate(fx, "feature")
    assert status_of(done, "image") == "FAIL"
    assert "deploy/agents-engine/engine.sh up" in done.stdout


def test_a_gitleaks_finding_is_named_without_the_match(fx: Fixture) -> None:
    fx.branch(CHANGE)
    fx.gitleaks_control(finds=["git"])
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of(done, "gitleaks") == "FAIL"
    assert "probe-token in docs/readme.md:3 (commit cccccccccccc)" in done.stdout
    # Exit 99, gitleaks' code for findings with --exit-code 99: nothing else is wrong with the scan.
    assert row(done, "gitleaks").endswith(
        "gitleaks  1 finding(s), named above without their match"
    )


@pytest.mark.parametrize(
    ("mode", "says"),
    [
        # gitleaks 8.30.1 logs git's own failure and exits 0, as if it had found nothing.
        ("git-error", "gitleaks logged an error, so its scan may be partial: "),
        ("no-count", "gitleaks didn't say how many commits it scanned"),
        ("no-report", "gitleaks' report is missing or unreadable"),
        ("garbage", "gitleaks' report is missing or unreadable"),
        ("quiet-finds", "gitleaks exited 0 with 1 finding(s) in its report"),
    ],
)
def test_a_range_scan_that_may_not_have_read_everything_fails(
    fx: Fixture, mode: str, says: str
) -> None:
    fx.branch(CHANGE)
    fx.gitleaks_control(modes={"git": mode})
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of(done, "gitleaks") == "FAIL"
    assert says in row(done, "gitleaks"), done.stdout


def test_gitleaks_failing_on_its_own_fails_the_scan(fx: Fixture) -> None:
    # Findings get their own exit code, 99, so gitleaks' own 1 can't pass for them, nor be read as clean.
    fx.branch(CHANGE)
    write(
        fx.stubs / "gitleaks", "#!/bin/sh\necho 'panic: a crash' >&2\nexit 1\n", 0o755
    )
    done = gate(fx, "feature")
    assert status_of(done, "gitleaks") == "FAIL"
    assert "gitleaks exited 1" in row(done, "gitleaks")


def test_a_range_scan_of_no_commits_fails_when_the_branch_adds_lines(
    fx: Fixture,
) -> None:
    fx.branch(CHANGE)
    fx.gitleaks_control(scanned={"git": 0})
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of(done, "gitleaks") == "FAIL"
    assert "gitleaks scanned 0 commits, though the branch adds 1 line(s)" in row(
        done, "gitleaks"
    )


def test_lines_git_takes_for_binary_count_as_added(fx: Fixture) -> None:
    # Counted in the patch gitleaks reads, with --text: --numstat counts no line in a file with a NUL byte.
    fx.branch({"docs/nul.txt": "x\0y\n"})
    fx.gitleaks_control(scanned={"git": 0})
    done = gate(fx, "feature")
    assert "gitleaks scanned 0 commits, though the branch adds 1 line(s)" in row(
        done, "gitleaks"
    )


def test_a_branch_that_adds_no_line_may_scan_no_commits(fx: Fixture) -> None:
    # gitleaks counts a commit only when its diff has a line, so a branch of deletions, renames, mode changes,
    # merges, or empty commits honestly scans none.
    git(fx.main, "switch", "-qc", "feature")
    git(fx.main, "rm", "-q", "docs/readme.md")
    git(fx.main, "commit", "-qm", "a deletion")
    git(fx.main, "commit", "-q", "--allow-empty", "-m", "nothing")
    git(fx.main, "switch", "-q", "main")
    fx.gitleaks_control(scanned={"git": 0})
    done = gate(fx, "feature")
    assert status_of(done, "gitleaks") == "PASS", done.stdout


def test_a_gitleaksignore_that_could_hold_entries_stops_the_scan(fx: Fixture) -> None:
    fx.branch(CHANGE)
    write(fx.main / ".gitleaksignore", "x:y:z:1\n")
    done = gate(fx, "feature")
    assert status_of(done, "gitleaks") == "FAIL"
    assert [c for c in fx.gitleaks() if c["argv"][0] == "git"] == []
    # The tree scan's source is the export, whose root holds none, so the main tree's file can't reach it.
    assert status_of(done, "gitleaks-tree") == "PASS"


def test_the_main_trees_empty_placeholder_is_let_through(fx: Fixture) -> None:
    fx.branch(CHANGE)
    write(fx.main / ".gitleaksignore", "")
    done = gate(fx, "feature")
    assert status_of(done, "gitleaks") == "PASS"


# --------------------------------------------------------------------------------------------------
# gitleaks over the export, the tree the merge writes (dir mode)
# --------------------------------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("name", "text"),
    [
        (".gitleaksignore", ""),
        (".gitleaksignore", "x:y:z:1\n"),
        (".GitLeaksIgnore", "x:y:z:1\n"),
    ],
)
def test_a_gitleaksignore_at_the_trees_root_stops_the_tree_scan(
    fx: Fixture, name: str, text: str
) -> None:
    # gitleaks dir obeys a .gitleaksignore at the folder it scans whatever its flags (research.md R-36), and the
    # branch wrote this one, so anything there refuses, empty or not.
    fx.branch({name: text})
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of(done, "gitleaks-tree") == "FAIL"
    assert f"the commit has {name} at its root" in row(done, "gitleaks-tree")
    assert [c for c in fx.gitleaks() if c["argv"][0] == "dir"] == []
    assert status_of(done, "gitleaks") == "PASS"


@pytest.mark.parametrize(
    ("mode", "says"),
    [
        ("git-error", "gitleaks logged an error, so its scan may be partial: "),
        ("no-count", "gitleaks didn't say how much it scanned"),
        ("no-report", "gitleaks' report is missing or unreadable"),
        # dir mode logs a file it couldn't read, or a path that isn't there, as a warning and exits 0.
        ("skipped", "gitleaks skipped what it couldn't read: "),
        ("quiet-finds", "gitleaks exited 0 with 1 finding(s) in its report"),
    ],
)
def test_a_tree_scan_that_may_not_have_read_everything_fails(
    fx: Fixture, mode: str, says: str
) -> None:
    fx.branch(CHANGE)
    fx.gitleaks_control(modes={"dir": mode})
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of(done, "gitleaks-tree") == "FAIL"
    assert says in row(done, "gitleaks-tree"), done.stdout
    assert status_of(done, "gitleaks") == "PASS"


def test_a_tree_scan_of_no_bytes_fails(fx: Fixture) -> None:
    fx.branch(CHANGE)
    fx.gitleaks_control(scanned={"dir": 0})
    done = gate(fx, "feature")
    assert status_of(done, "gitleaks-tree") == "FAIL"
    assert "gitleaks scanned 0 bytes of a tree that holds some" in row(
        done, "gitleaks-tree"
    )


def test_a_tree_finding_is_named_without_its_match(fx: Fixture) -> None:
    fx.branch(CHANGE)
    fx.gitleaks_control(finds=["dir"])
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert row(done, "gitleaks-tree").endswith(
        "gitleaks-tree  1 finding(s), named above without their match"
    )
    assert "  probe-token in docs/readme.md:3\n" in done.stdout
    assert status_of(done, "gitleaks") == "PASS"


def real_gitleaks(fx: Fixture) -> None:
    """The real gitleaks in the stand-in's place, and the probe rule in the main tree's .gitleaks.toml, the working
    tree's file the gate reads, committed on main (commit_on_main)."""
    (fx.stubs / "gitleaks").unlink()
    (fx.stubs / "gitleaks").symlink_to(REAL_GITLEAKS)
    commit_on_main(fx, {".gitleaks.toml": PROBE_RULES}, "the probe rule")


@needs_gitleaks
def test_the_real_gitleaks_passes_a_clean_branch_in_both_modes(fx: Fixture) -> None:
    # Its own log, count, and report, in each mode, read as the stand-in's are.
    fx.branch(CHANGE)
    real_gitleaks(fx)
    done = gate(fx, "feature")
    assert status_of(done, "gitleaks") == "PASS", done.stdout
    assert status_of(done, "gitleaks-tree") == "PASS", done.stdout
    assert "INF 1 commits scanned" in done.stdout


@needs_gitleaks
@pytest.mark.parametrize("hidden", ["a NUL byte", "a -diff attribute"])
def test_what_git_takes_for_binary_is_scanned_in_the_commits_and_the_tree(
    fx: Fixture, hidden: str
) -> None:
    # git log shows no diff for what it takes for binary, a file with a NUL byte or one a .gitattributes in the work
    # tree marks -diff, committed or not, so gitleaks' git mode saw nothing there without --text.
    rel = "docs/nul.txt" if hidden == "a NUL byte" else "docs/hidden.txt"
    fx.branch({rel: f"x{chr(0) if hidden == 'a NUL byte' else ''}\nvalue {TOKEN}\n"})
    real_gitleaks(fx)
    if hidden == "a -diff attribute":
        write(fx.main / ".gitattributes", f"{rel} -diff\n")  # untracked
    done = gate(fx, "feature")
    assert status_of(done, "gitleaks") == "FAIL", done.stdout
    assert status_of(done, "gitleaks-tree") == "FAIL", done.stdout
    assert re.search(
        rf"^  probe-token in {rel}:2 \(commit [0-9a-f]{{12}}\)$",
        done.stdout,
        re.MULTILINE,
    ), done.stdout
    assert (
        f"\n  probe-token in {rel}:2\n" in done.stdout
    )  # the tree's, without a commit
    assert TOKEN not in done.stdout + done.stderr


@needs_gitleaks
def test_the_configs_anchored_allowlist_holds_in_the_tree_scan_too(fx: Fixture) -> None:
    # The main tree's .gitleaks.toml allowlists a path with a ^-anchored pattern (deploy/env.agents/dev-cpu.vars),
    # which dir mode matches against the paths it walks: relative ones only from inside the tree.
    fx.branch({"docs/allowed.txt": f"value {TOKEN}\n"})
    real_gitleaks(fx)
    allowlist = "[[allowlists]]\npaths = ['''^docs/allowed\\.txt$''']\n"
    commit_on_main(fx, {".gitleaks.toml": PROBE_RULES + allowlist}, "an allowlist")
    done = gate(fx, "feature")
    assert status_of(done, "gitleaks") == "PASS", done.stdout
    assert status_of(done, "gitleaks-tree") == "PASS", done.stdout


@needs_gitleaks
def test_a_secret_a_merge_adds_is_found_in_the_tree(fx: Fixture) -> None:
    # git log shows no diff for a merge commit, so the range scan can't see what a merge's resolution adds; the tree
    # scan reads the tip the merge writes.
    fx.branch(CHANGE)
    write(fx.main / "docs/main.md", "main moves on\n")
    git(fx.main, "add", "docs/main.md")
    git(fx.main, "commit", "-qm", "main moves on")
    git(fx.main, "switch", "-q", "feature")
    git(fx.main, "merge", "-q", "--no-ff", "--no-commit", "main")
    write(fx.main / "docs/merged.txt", f"value {TOKEN}\n")
    git(fx.main, "add", "docs/merged.txt")
    git(fx.main, "commit", "-qm", "merge main")
    git(fx.main, "switch", "-q", "main")
    real_gitleaks(fx)
    done = gate(fx, "feature")
    assert status_of(done, "gitleaks") == "PASS", done.stdout
    assert status_of(done, "gitleaks-tree") == "FAIL", done.stdout
    assert "\n  probe-token in docs/merged.txt:1\n" in done.stdout
    assert TOKEN not in done.stdout + done.stderr


# --------------------------------------------------------------------------------------------------
# Spec 003's arrival step (contracts/arrival-check.md §1)
# --------------------------------------------------------------------------------------------------
def test_an_arrival_finding_fails_the_step_and_the_gate(fx: Fixture) -> None:
    fx.branch(CHANGE)
    (fx.logs / "arrival_check.control").write_text(
        "1\nM1 assets/twin/still.png @abc1234: chunk tEXt at byte 33, outside the allowlist\n"
        "arrival-check: 1 finding in 1 file (1 commit)",
        encoding="utf-8",
    )
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of(done, "arrival") == "FAIL"
    assert "M1 assets/twin/still.png @abc1234" in done.stdout
    assert (
        fx.logged("credits") == []
    )  # the host never runs the branch's credits renderer


def test_an_arrival_check_that_couldnt_run_fails_the_step(fx: Fixture) -> None:
    fx.branch(CHANGE)
    (fx.logs / "arrival_check.control").write_text(
        "2\narrival-check: can't check: the main branch has no assets/policy/caps.json",
        encoding="utf-8",
    )
    done = gate(fx, "feature")
    assert status_of(done, "arrival") == "FAIL"
    assert "couldn't check" in row(done, "arrival")


def test_a_stale_credits_rendering_fails_its_container_step(fx: Fixture) -> None:
    fx.branch(CHANGE)
    fx.control(fail=["credits-check"])
    done = gate(fx, "feature")
    assert status_of(done, "credits") == "FAIL"
    assert status_of(done, "arrival") == "PASS"
    assert fx.logged("credits") == []


def test_a_branch_from_before_spec_003_skips_the_credits_step(fx: Fixture) -> None:
    git(fx.main, "rm", "-q", "scripts/assets/credits.py")
    git(fx.main, "commit", "-qm", "main from before spec 003")
    fx.branch(CHANGE)
    done = gate(fx, "feature")
    assert status_of(done, "credits") == "SKIP"
    assert "neither scripts/assets/credits.py nor assets/" in row(done, "credits")
    assert [c["command"][-1] for c in make_runs(fx.docker())] == TARGETS[:-1]


def test_without_mains_arrival_check_the_step_fails(fx: Fixture) -> None:
    fx.branch(CHANGE)
    git(fx.main, "rm", "-q", "tools/gates/arrival_check.py")
    git(fx.main, "commit", "-qm", "main without the check")
    done = gate(fx, "feature")
    assert status_of(done, "arrival") == "FAIL"
    assert "arrival_check.py is missing" in row(done, "arrival")


def test_missing_gitleaks_fails_closed(fx: Fixture) -> None:
    fx.branch(CHANGE)
    (fx.stubs / "gitleaks").unlink()
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of(done, "gitleaks") == "FAIL"
    assert "gitleaks isn't installed" in done.stdout


def test_stage_e_waits_for_prove_when_the_branch_touches_the_engine(
    fx: Fixture,
) -> None:
    fx.branch({"deploy/agents-engine/notes.txt": "a change at the boundary\n"})
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of(done, "matrix-e") == "PENDING"
    assert "tools/gates/gate --prove feature" in done.stdout
    assert fx.logged("engine") == []
    proven = gate(fx, "--prove", "feature")
    assert status_of(proven, "matrix-e") == "PASS", proven.stdout
    assert fx.logged("engine")[0]["argv"] == ["prove"]


def test_a_failing_prove_fails_stage_e(fx: Fixture) -> None:
    fx.branch({".claude/settings.json": '{"sandbox": {}}\n'})
    (fx.logs / "engine.control").write_text("1\nE9: FAIL", encoding="utf-8")
    done = gate(fx, "--prove", "feature")
    assert status_of(done, "matrix-e") == "FAIL"


@pytest.mark.parametrize(
    "files",
    [
        {"CLAUDE.md": "# fixture, changed\n"},
        {
            ".devcontainer/toolchain.vars": "NODE_VERSION=24.21.0\nCLAUDE_CODE_VERSION=2.1.296\n"
        },
    ],
)
def test_the_behavioral_evals_wait_for_t094_when_triggered(
    fx: Fixture, files: dict[str, str]
) -> None:
    fx.branch(files)
    done = gate(fx, "feature")
    assert status_of(done, "agent-config-evals") == "SKIP"
    assert "T094" in done.stdout


# A stand-in for the main tree's behavioral.py: status prints what the case asks, and says which tree it read.
STUB_TIER = """
import sys
from pathlib import Path


def status(repo, here, *, export=False):
    print(f"read {{repo}}")
    print(f"here {{here}}")
    print(f"export {{export}}")
    for line in {lines!r}:
        print(line)
    if {raises!r}:
        raise RuntimeError("a case that doesn't load")
    return {rc}
"""


def tier(fx: Fixture, lines: list[str], rc: int = 0, raises: bool = False) -> None:
    text = STUB_TIER.format(lines=lines, rc=rc, raises=raises)
    commit_on_main(
        fx, {"evals/agent-config/behavioral.py": text}, "main's stand-in tier"
    )


@pytest.mark.parametrize(
    ("lines", "rc", "expect"),
    [
        (
            ["PENDING (behavioral tier): no passing run for trigger hash 0123abcd4567"],
            0,
            "PENDING",
        ),
        (
            [
                "PASS  behavioral tier: 2026-10-10T120000Z-feature-0123abc passed for trigger hash 0123abcd4567"
            ],
            0,
            "PASS",
        ),
        (
            [
                "PLANNED (T117): 4 behavioral cases wait for the closing patch: a, b, c, d",
                "PASS  behavioral tier: 2026-10-10T120000Z-feature-0123abc passed for trigger hash 0123abcd4567",
            ],
            0,
            "PLANNED",
        ),
        (
            [
                "FAIL  behavioral tier: the last run for trigger hash 0123abcd4567 failed: below threshold"
            ],
            1,
            "FAIL",
        ),
        (["behavioral tier: 13 cases"], 0, "FAIL"),  # neither PASS nor PENDING
    ],
)
def test_a_triggered_branch_gets_the_behavioral_tiers_own_verdict(
    fx: Fixture, lines: list[str], rc: int, expect: str
) -> None:
    fx.branch({"CLAUDE.md": "# fixture, changed\n"})
    tier(fx, lines, rc)
    done = gate(fx, "feature")
    assert status_of(done, "agent-config-evals") == expect
    if expect in ("PENDING", "FAIL"):
        assert done.returncode == 1  # the gate exits 1 on any FAIL or PENDING
    if rc:  # a failed run's own reason reaches the table, not just its exit code
        row = [
            ln
            for ln in done.stdout.splitlines()
            if ln.split()[1:2] == ["agent-config-evals"]
        ]
        assert row and "below threshold" in row[-1], done.stdout


def test_the_behavioral_tier_reads_the_export_not_the_main_tree(fx: Fixture) -> None:
    fx.branch({"CLAUDE.md": "# fixture, changed\n"})
    tier(
        fx, ["PENDING (behavioral tier): no passing run for trigger hash 0123abcd4567"]
    )
    done = gate(fx, "feature")
    read = [
        ln.split(" ", 1)[1] for ln in done.stdout.splitlines() if ln.startswith("read ")
    ]
    here = [
        ln.split(" ", 1)[1] for ln in done.stdout.splitlines() if ln.startswith("here ")
    ]
    assert len(read) == 1 and len(here) == 1, done.stdout
    assert Path(read[0]) != fx.main
    assert Path(here[0]) == Path(read[0]) / "evals" / "agent-config"
    # In export mode, which never runs git on the export (review A, 1b).
    assert "export True" in done.stdout.splitlines(), done.stdout


def test_the_real_tier_runs_no_git_on_an_export_that_holds_a_git_folder(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The export is data (review A, 1b): a .git folder in it would have git read the branch's index, excludes, and
    # config, and a config can name programs git runs. The gate calls the main tree's status in export mode, which
    # walks the tree, so a stand-in git first on PATH is never called.
    main, export = tmp_path / "main", tmp_path / "export"
    for name in ("behavioral.py", "static.py"):
        write(
            main / "evals/agent-config" / name,
            (REPO / "evals/agent-config" / name).read_text(encoding="utf-8"),
        )
    for rel in (
        "CLAUDE.md",
        "REVIEW.md",
        ".devcontainer/toolchain.vars",
        "evals/agent-config/thresholds.yaml",
    ):
        write(export / rel, (REPO / rel).read_text(encoding="utf-8"))
    for folder, pattern in (
        ("evals/agent-config/cases", "*.yaml"),
        (".claude/agents", "*.md"),
    ):
        for path in sorted((REPO / folder).glob(pattern)):
            write(export / folder / path.name, path.read_text(encoding="utf-8"))
    write(export / ".claude/settings.json", "{}\n")
    git(export, "init", "-q")
    git(export, "add", "-A")
    calls = tmp_path / "git-calls"
    real = shutil.which("git", path=SYSTEM_PATH)
    write(
        tmp_path / "standin/git",
        f'#!/bin/sh\necho "$*" >> {calls}\nexec {real} "$@"\n',
        0o755,
    )
    monkeypatch.setenv("PATH", f"{tmp_path / 'standin'}:{SYSTEM_PATH}")
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    step = gm.agent_config_evals(main, export, "0" * 40, ["CLAUDE.md"])
    assert step.status == "PENDING", step.notes
    assert not calls.exists(), calls.read_text()


def test_a_behavioral_tier_that_raises_fails_the_step_not_the_gate(fx: Fixture) -> None:
    fx.branch({"CLAUDE.md": "# fixture, changed\n"})
    tier(fx, [], raises=True)
    done = gate(fx, "feature")
    assert status_of(done, "agent-config-evals") == "FAIL"
    assert "behavioral.py stopped: RuntimeError" in done.stdout
    assert summary(done)  # the gate still ends with its summary


def real_tier_branch(fx: Fixture) -> str:
    """The repository's own behavioral.py and static.py in the main tree, and a branch carrying its cases,
    thresholds, and roles, which touches CLAUDE.md, so the step is triggered. Returns the branch's tip."""
    tip = fx.branch(real_tier_files())
    install_real_tier(fx)  # after fx.branch, as install_real_tier says
    return tip


def test_the_real_behavioral_tier_shows_pending_for_a_branch_with_no_entry(
    fx: Fixture,
) -> None:
    # With no history entry, status computes the export's trigger hash and finds no run for it.
    real_tier_branch(fx)
    done = gate(fx, "feature")
    assert status_of(done, "agent-config-evals") == "PENDING", done.stdout
    assert "PENDING (behavioral tier): no run for trigger hash" in done.stdout


def test_the_real_behavioral_tier_counts_an_entry_only_when_this_machine_attests_it(
    fx: Fixture, collector: http.server.HTTPServer
) -> None:
    # Review A, 4, end to end: an entry for the export's own trigger hash, well formed and passing, that no run on
    # this machine attested leaves the step PENDING, by name, and isn't posted. Attested, it decides.
    spec = importlib.util.spec_from_file_location(
        "h4_gate_test_behavioral", REPO / "evals/agent-config/behavioral.py"
    )
    assert spec and spec.loader
    tier = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = tier  # its dataclasses look their module up there
    spec.loader.exec_module(tier)
    sha = real_tier_branch(fx)
    tree = fx.root / "tree"
    archive = subprocess.run(
        ["git", "-C", str(fx.main), "archive", sha], capture_output=True, check=True
    ).stdout
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        tar.extractall(tree, filter="data")
    record = {
        "schema": 1,
        "run": RUN,
        "trigger_hash": tier.trigger_hash(tree, export=True),
        "branch": "feature",
        "commit": sha,
        "claude_code_version": "2.1.295",
        "verdict": "pass",
        "cost_usd": 0.42,
        "tokens": ENTRY["tokens"],
        "cases": [
            {
                "id": "stays-on-branch",
                "kind": "conduct",
                "counted": True,
                "ok_runs": 3,
                "runs": [{}, {}, {}],
            }
        ],
        "conduct": {"held": 3, "runs": 3},
    }
    data = json.dumps(record).encode()
    rel = f"evals/agent-config/history/{RUN}.json"
    git(fx.main, "switch", "-q", "feature")
    write(fx.main / rel, data.decode())
    git(fx.main, "add", "-f", "--", rel)
    git(fx.main, "commit", "-qm", "the run's entry")
    git(fx.main, "switch", "-q", "main")
    url = f"http://127.0.0.1:{collector.server_address[1]}/v1/metrics"
    done = gate(fx, "--otlp-url", url, "feature")
    assert status_of(done, "agent-config-evals") == "PENDING", done.stdout
    assert status_of(done, "eval-history") == "PENDING"
    pending = rf"^PENDING \(behavioral tier\): .*{RUN}"
    assert re.search(pending, done.stdout, re.MULTILINE)
    assert collector.posts == []  # type: ignore[attr-defined]
    attest(fx, data)
    done = gate(fx, "--otlp-url", url, "feature")
    # PASS, shown as PLANNED: the cases that need T045 and T117 wait, since the fixture's settings have neither.
    assert status_of(done, "agent-config-evals") == "PLANNED", done.stdout
    assert f"PASS  behavioral tier: {RUN} " in done.stdout
    assert status_of(done, "eval-history") == "PASS"
    assert len(collector.posts) == 1  # type: ignore[attr-defined]


def test_untriggered_steps_say_so(fx: Fixture) -> None:
    fx.branch(CHANGE)
    done = gate(fx, "feature")
    assert status_of(done, "matrix-e") == "SKIP"
    assert status_of(done, "agent-config-evals") == "SKIP"
    assert "T094" not in done.stdout


# --------------------------------------------------------------------------------------------------
# The pieces, one at a time
# --------------------------------------------------------------------------------------------------
def test_holds_nothing_lets_through_only_what_holds_no_entry(tmp_path: Path) -> None:
    path = tmp_path / ".gitleaksignore"
    assert gm.holds_nothing(path)  # nothing there
    path.write_text("", encoding="utf-8")
    assert gm.holds_nothing(path)  # a killed session's empty placeholder
    path.write_text("x:y:z:1\n", encoding="utf-8")
    assert not gm.holds_nothing(path)
    path.unlink()
    path.symlink_to(tmp_path / "elsewhere")
    assert not gm.holds_nothing(path)
    path.unlink()
    os.mkfifo(path)
    assert not gm.holds_nothing(path)
    path.unlink()
    path.mkdir()
    assert not gm.holds_nothing(path)
    # The sandbox's mask is /dev/null itself, device 1:3; any other device could feed entries.
    assert gm.holds_nothing(Path("/dev/null"))
    assert not gm.holds_nothing(Path("/dev/zero"))


@pytest.mark.parametrize(
    ("name", "named"),
    [
        (b".git", True),
        (b".GIT", True),
        (b".gIt", True),
        (b".git.", True),  # NTFS drops trailing dots and spaces
        (b".git . ", True),
        (b"git~1", True),  # NTFS's 8.3 name for .git
        (b"GIT~1", True),
        (b".git:stream", True),  # an NTFS stream of .git
        (b"a\\.git", True),  # a backslash separates on NTFS
        (b".gitignore", False),
        (b".github", False),
        (b".gitattributes", False),
        (b"x.git", False),
        (b".git .x", False),
        (b"git~2", False),
        (b"git", False),
    ],
)
def test_names_git_reads_a_name_as_gits_own_verify_path_does(
    name: bytes, named: bool
) -> None:
    assert gm.names_git(name) is named


def test_clean_keeps_a_terminal_out_of_reach() -> None:
    assert gm.clean("ok\tline\n") == "ok\tline\n"
    assert gm.clean("\x1b]52;c;x\x07 \x9b2J \x7f") == "?]52;c;x? ?2J ?"


@pytest.mark.parametrize(
    ("entry", "says"),
    [
        ([], "not a JSON object"),
        ({**ENTRY, "verdict": "maybe"}, '"verdict"'),
        ({**ENTRY, "cost_usd": True}, '"cost_usd"'),
        ({**ENTRY, "cost_usd": -1}, '"cost_usd"'),
        ({**ENTRY, "cost_usd": math.nan}, '"cost_usd"'),
        ({**ENTRY, "cost_usd": "0.4"}, '"cost_usd"'),
        ({**ENTRY, "tokens": []}, '"tokens" isn\'t an object'),
        (
            {**ENTRY, "tokens": {"input": 1, "output": 1, "cache_read": 1}},
            "tokens.cache_creation",
        ),
        (
            {**ENTRY, "tokens": {**ENTRY["tokens"], "output": 1.5}},
            "tokens.output",
        ),
        (
            {**ENTRY, "tokens": {**ENTRY["tokens"], "input": False}},
            "tokens.input",
        ),
    ],
)
def test_history_problems_names_each_malformed_field(entry: object, says: str) -> None:
    assert gm.history_problems(ENTRY) == []
    assert any(says in problem for problem in gm.history_problems(entry))


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1:18004/v1/metrics",
        "http://localhost:18104/v1/metrics",
        "http://[::1]:18004/v1/metrics",
    ],
)
def test_check_url_takes_loopback_metrics_urls(url: str) -> None:
    assert gm.check_url(url) == url


def test_fresh_dir_refuses_what_mkdtemp_should_never_give(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    made = gm.fresh_dir(tmp_path)
    assert made.is_dir() and not any(made.iterdir()) and made.parent == tmp_path
    full = tmp_path / "full"
    full.mkdir()
    (full / ".gitleaksignore").write_text("x\n", encoding="utf-8")
    for given in ("", "relative", str(full), str(tmp_path / "missing")):
        monkeypatch.setattr(gm.tempfile, "mkdtemp", lambda dir=None, g=given: g)
        with pytest.raises(OSError):
            gm.fresh_dir(tmp_path)


# --------------------------------------------------------------------------------------------------
# The eval history's push to prod's x004 (contracts/telemetry.md §4.4)
# --------------------------------------------------------------------------------------------------
class _Collector(http.server.BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        body = self.rfile.read(int(self.headers["Content-Length"]))
        self.server.posts.append((self.path, self.headers["Content-Type"], body))  # type: ignore[attr-defined]
        self.send_response(200)
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"{}")

    def log_message(self, *args: object) -> None:
        pass


@pytest.fixture
def collector():
    server = http.server.HTTPServer(("127.0.0.1", 0), _Collector)
    server.posts = []  # type: ignore[attr-defined]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server
    server.shutdown()
    server.server_close()


def attrs(point: dict) -> dict[str, str]:
    return {a["key"]: a["value"]["stringValue"] for a in point["attributes"]}


def test_each_history_entry_the_branch_adds_is_posted_once_as_otlp_json(
    fx: Fixture, collector: http.server.HTTPServer
) -> None:
    fx.branch({f"evals/agent-config/history/{RUN}.json": json.dumps(ENTRY)})
    attest(fx, json.dumps(ENTRY).encode())
    url = f"http://127.0.0.1:{collector.server_address[1]}/v1/metrics"
    before = time.time_ns()
    # A proxy in the Author's shell is never used: the push goes straight to this machine's loopback.
    dead = "http://127.0.0.1:9"
    done = gate(fx, "--otlp-url", url, "feature", http_proxy=dead, HTTP_PROXY=dead)
    after = time.time_ns()
    assert done.returncode == 0, done.stdout + done.stderr
    assert len(collector.posts) == 1, done.stdout  # type: ignore[attr-defined]
    (post,) = collector.posts  # type: ignore[attr-defined]
    path, content_type, raw = post
    assert (path, content_type) == ("/v1/metrics", "application/json")
    resource = json.loads(raw)["resourceMetrics"][0]
    assert {"key": "service.name", "value": {"stringValue": "h4-gate"}} in resource[
        "resource"
    ]["attributes"]
    metrics = {m["name"]: m for m in resource["scopeMetrics"][0]["metrics"]}
    assert set(metrics) == {"h4.devtime.eval.cost_usd", "h4.devtime.eval.tokens"}
    cost = metrics["h4.devtime.eval.cost_usd"]
    assert cost["unit"] == "{USD}"
    (point,) = cost["gauge"]["dataPoints"]
    assert point["asDouble"] == 0.42
    assert attrs(point) == {"h4.eval.run": RUN, "h4.eval.verdict": "pass"}
    assert before <= int(point["timeUnixNano"]) <= after  # stamped at the post
    tokens = metrics["h4.devtime.eval.tokens"]
    assert tokens["unit"] == "{token}"
    by_type = {
        attrs(p)["gen_ai.token.type"]: int(p["asInt"])
        for p in tokens["gauge"]["dataPoints"]
    }
    assert by_type == ENTRY["tokens"]
    assert all(attrs(p)["h4.eval.run"] == RUN for p in tokens["gauge"]["dataPoints"])
    assert status_of(done, "eval-history") == "PASS"
    assert (
        status_of(done, "agent-config-evals") == "SKIP"
    )  # a history entry alone isn't a trigger
    assert "T094" not in done.stdout


def test_a_malformed_history_entry_fails_and_isnt_posted(
    fx: Fixture, collector: http.server.HTTPServer
) -> None:
    broken = {k: v for k, v in ENTRY.items() if k != "tokens"}
    fx.branch({f"evals/agent-config/history/{RUN}.json": json.dumps(broken)})
    url = f"http://127.0.0.1:{collector.server_address[1]}/v1/metrics"
    done = gate(fx, "--otlp-url", url, "feature")
    assert done.returncode == 1
    assert status_of(done, "eval-history") == "FAIL"
    assert collector.posts == []  # type: ignore[attr-defined]


def test_a_collector_that_doesnt_answer_is_a_warning_not_a_failure(fx: Fixture) -> None:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    fx.branch({f"evals/agent-config/history/{RUN}.json": json.dumps(ENTRY)})
    attest(fx, json.dumps(ENTRY).encode())
    done = gate(fx, "--otlp-url", f"http://127.0.0.1:{port}/v1/metrics", "feature")
    assert done.returncode == 0, done.stdout
    assert status_of(done, "eval-history") == "WARN"


def test_an_unattested_entry_is_pending_and_isnt_posted(
    fx: Fixture, collector: http.server.HTTPServer
) -> None:
    # Review A, 4: a well-formed passing entry an agent could have committed, with no attestation on this machine,
    # isn't posted, and the merge waits; the step names it. Attested, the same entry is posted, and passes.
    data = json.dumps(ENTRY).encode()
    fx.branch({f"evals/agent-config/history/{RUN}.json": data.decode()})
    url = f"http://127.0.0.1:{collector.server_address[1]}/v1/metrics"
    done = gate(fx, "--otlp-url", url, "feature")
    assert done.returncode == 1
    assert status_of(done, "eval-history") == "PENDING"
    assert collector.posts == []  # type: ignore[attr-defined]
    (row,) = [ln for ln in done.stdout.splitlines() if ln.startswith("PENDING  eval")]
    assert RUN in row and "not attested" in row
    attest(fx, data)
    done = gate(fx, "--otlp-url", url, "feature")
    assert done.returncode == 0, done.stdout
    assert status_of(done, "eval-history") == "PASS"
    assert len(collector.posts) == 1  # type: ignore[attr-defined]


def test_a_copy_of_an_attested_entry_isnt_posted_under_another_name(
    fx: Fixture, collector: http.server.HTTPServer
) -> None:
    # The bytes are attested, but under another file name the gate would post the run twice.
    data = json.dumps(ENTRY).encode()
    attest(fx, data)
    copy = "2026-10-10T130000Z-feature-0123abc"
    fx.branch({f"evals/agent-config/history/{copy}.json": data.decode()})
    url = f"http://127.0.0.1:{collector.server_address[1]}/v1/metrics"
    done = gate(fx, "--otlp-url", url, "feature")
    assert status_of(done, "eval-history") == "FAIL"
    assert "\"run\" isn't its file's name" in done.stdout
    assert collector.posts == []  # type: ignore[attr-defined]


@pytest.mark.parametrize("change", ["edit", "remove"])
def test_a_branch_that_changes_or_removes_an_entry_fails(
    fx: Fixture, change: str
) -> None:
    # The history is append-only: the newest attested run decides, so removing a later failure, or editing it,
    # would let an earlier pass decide.
    rel = f"evals/agent-config/history/{RUN}.json"
    write(fx.main / rel, json.dumps({**ENTRY, "verdict": "fail"}))
    git(fx.main, "add", "-f", "--", rel)
    git(fx.main, "commit", "-qm", "an entry on main")
    if change == "edit":
        fx.branch({rel: json.dumps(ENTRY)})
    else:
        git(fx.main, "switch", "-qc", "feature")
        git(fx.main, "rm", "-q", "--", rel)
        git(fx.main, "commit", "-qm", "drop the entry")
        git(fx.main, "switch", "-q", "main")
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of(done, "eval-history") == "FAIL"
    assert "append-only" in done.stdout and rel in done.stdout


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com/v1/metrics",
        "https://127.0.0.1:18004/v1/metrics",
        "http://127.0.0.1:18004/v1/traces",
    ],
)
def test_the_push_goes_to_the_loopback_metrics_path_only(fx: Fixture, url: str) -> None:
    done = gate(fx, "--otlp-url", url, "main")
    assert done.returncode == 2
    assert fx.docker() == []


# --------------------------------------------------------------------------------------------------
# --contract-replay FILE: make contract-live's replay (contracts/provider-adapter.md §5.3)
# --------------------------------------------------------------------------------------------------
def recording(fx: Fixture, body: str = '{"adapter": "local", "cases": []}') -> Path:
    directory = fx.root / "recording"
    directory.mkdir(mode=0o700, exist_ok=True)
    path = directory / "recording.json"
    path.write_text(body, encoding="utf-8")
    path.chmod(0o600)
    return path


def test_contract_replay_runs_the_replay_test_on_heads_export_without_network(
    fx: Fixture,
) -> None:
    head = git(fx.main, "rev-parse", "HEAD")
    file = recording(fx)
    done = gate(fx, "--contract-replay", str(file))
    assert done.returncode == 0, done.stdout + done.stderr
    calls = fx.docker()
    (build,) = by_kind(calls, "build")
    export = Path(build["argv"][-1])
    tree = git(fx.main, "rev-parse", f"{head}:.devcontainer")
    assert build["argv"][4] == f"h4reet-devcontainer:{tree}"
    npm, replay = by_kind(calls, "run")
    assert npm["command"][:3] == ["npm", "ci", "--ignore-scripts"]
    argv = replay["argv"]
    assert has(argv, "--network", "none")
    assert has(argv, "--cap-drop", "ALL")
    assert has(argv, "--workdir", "/work/services/gateway")
    assert has(argv, "--env", f"H4_CONTRACT_RECORDING={RECORDING}")
    assert has(argv, "--mount", f"type=bind,source={file},target={RECORDING},readonly")
    assert replay["recording_readable"]
    assert replay["command"] == [
        "/work/node_modules/.bin/vitest",
        "run",
        "test/contract/replay.test.ts",
        "--reporter=verbose",
    ]
    assert mount_source(argv, "/work") != str(export)
    assert by_kind(calls, "compose") == [] and fx.gitleaks() == []
    assert f"HEAD {head[:12]}" in done.stdout
    assert not export.exists()


def test_a_replay_that_never_reads_the_recording_fails(fx: Fixture) -> None:
    fx.control(
        vitest_output=" \u2713 test/contract/replay.test.ts > the adapter contract: recorded here: local (live) > C1"
    )
    done = gate(fx, "--contract-replay", str(recording(fx)))
    assert done.returncode == 1
    assert "recorded live" in done.stdout + done.stderr


@pytest.mark.parametrize("adapter", ["bedrock", "localhost"])
def test_a_replay_that_passed_under_another_adapters_name_fails(
    fx: Fixture, adapter: str
) -> None:
    # The recording's adapter is "local": a test passed under another name, or one it only begins, didn't read it.
    fx.control(
        vitest_output=" \u2713 test/contract/replay.test.ts > the adapter contract: "
        f"recorded live: {adapter} (live) > C1: ok 2ms"
    )
    done = gate(fx, "--contract-replay", str(recording(fx)))
    assert done.returncode == 1
    assert "no test passed under recorded live: local" in done.stdout


# vitest colours its lines in the container: an escape sequence before the tick, and around each separator.
COLOURED = (
    "\x1b[32m\u2713\x1b[39m test/contract/replay.test.ts\x1b[2m > \x1b[22mthe adapter contract: "
    "recorded live: {adapter} (live)\x1b[2m > \x1b[22mC1: every recorded answer is a normalized result"
)


def test_a_coloured_replay_that_read_the_recording_passes(fx: Fixture) -> None:
    fx.control(vitest_output=COLOURED.format(adapter="local"))
    done = gate(fx, "--contract-replay", str(recording(fx)))
    assert done.returncode == 0, done.stdout + done.stderr


def test_a_coloured_replay_under_another_adapters_name_still_fails(fx: Fixture) -> None:
    fx.control(vitest_output=COLOURED.format(adapter="bedrock"))
    done = gate(fx, "--contract-replay", str(recording(fx)))
    assert done.returncode == 1
    assert "no test passed under recorded live: local" in done.stdout


def test_a_failing_replay_fails(fx: Fixture) -> None:
    fx.control(vitest_rc=1)
    assert gate(fx, "--contract-replay", str(recording(fx))).returncode == 1


@pytest.mark.parametrize("problem", ["missing", "link", "not-json", "not-a-recording"])
def test_contract_replay_refuses_a_file_that_isnt_a_recording(
    fx: Fixture, problem: str
) -> None:
    file = recording(fx)
    if problem == "missing":
        file.unlink()
    elif problem == "link":
        link = file.with_name("link.json")
        link.symlink_to(file)
        file = link
    elif problem == "not-json":
        file.write_text("{", encoding="utf-8")
    else:
        file.write_text("[]", encoding="utf-8")
    done = gate(fx, "--contract-replay", str(file))
    assert done.returncode == 2
    assert fx.docker() == []


@pytest.mark.parametrize("extra", [["feature"], ["--host"], ["--prove"]])
def test_contract_replay_takes_no_ref_and_no_other_mode(
    fx: Fixture, extra: list[str]
) -> None:
    done = gate(fx, "--contract-replay", str(recording(fx)), *extra)
    assert done.returncode == 2
    assert fx.docker() == []


# --------------------------------------------------------------------------------------------------
# The gateway's image, outside compose, as make up builds it (tasks.md T184)
# --------------------------------------------------------------------------------------------------
GATEWAY_PROXY = "http://198.18.0.1:3128"  # the agents' engine's egress proxy


def test_the_image_step_builds_the_gateway_as_make_up_does_then_the_compose_images(
    fx: Fixture,
) -> None:
    sha = fx.branch(CHANGE)
    done = gate(fx, "feature")
    assert done.returncode == 0, done.stdout + done.stderr
    calls = fx.docker()
    (devcontainer,) = by_kind(calls, "build")
    export = devcontainer["argv"][-1]
    (gateway,) = by_kind(calls, "buildx")
    assert gateway["argv"] == [
        "buildx",
        "build",
        "--load",
        "--file",
        f"{export}/services/gateway/Dockerfile",
        "--tag",
        f"h4reet-gateway:{sha}",
        "--build-arg",
        f"HTTP_PROXY={GATEWAY_PROXY}",
        "--build-arg",
        f"HTTPS_PROXY={GATEWAY_PROXY}",
        export,
    ]
    # On the agents' engine, with the Author's certificate (and, as for every tool, nothing else of the Author's
    # shell: test_the_authors_environment_never_reaches_a_tool).
    assert gateway["docker_env"] == {
        "DOCKER_HOST": ENGINE,
        "DOCKER_TLS_VERIFY": "1",
        "DOCKER_CERT_PATH": f"{fx.home}/.config/h4reet-ai/agents-engine/docker",
    }
    # The gateway first, then the compose images.
    (compose,) = by_kind(calls, "compose")
    assert calls.index(gateway) < calls.index(compose)
    assert status_of(done, "image") == "PASS"


def test_a_failing_policy_builds_no_gateway_image_either(fx: Fixture) -> None:
    fx.branch(CHANGE)
    (fx.logs / "compose_policy.control").write_text(
        "1\ncompose policy: 1 refusal(s)", encoding="utf-8"
    )
    done = gate(fx, "feature")
    assert status_of(done, "image") == "FAIL"
    assert by_kind(fx.docker(), "buildx") == []


def test_no_engine_certificate_builds_no_gateway_image(fx: Fixture) -> None:
    fx.branch(CHANGE)
    shutil.rmtree(fx.home / ".config/h4reet-ai/agents-engine")
    done = gate(fx, "feature")
    assert status_of(done, "image") == "FAIL"
    assert by_kind(fx.docker(), "buildx") == []


def test_host_mode_still_builds_the_gateway_image(fx: Fixture) -> None:
    sha = fx.branch(CHANGE)
    done = gate(fx, "--host", "feature")
    assert done.returncode == 0, done.stdout + done.stderr
    (gateway,) = by_kind(fx.docker(), "buildx")
    assert f"h4reet-gateway:{sha}" in gateway["argv"]


BUILDX_FAILS = r"""#!/usr/bin/env python3
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[1:]
if args[:1] == ["buildx"]:
    with open(os.path.join(here, "docker.calls"), "a", encoding="utf-8") as handle:
        handle.write(json.dumps({"argv": args, "env_keys": [], "docker_env": {}}) + "\n")
    print("buildx: a step failed")
    sys.exit(1)
real = os.path.join(here, "docker.real")
os.execv(real, [real, *args])
"""


def test_a_gateway_image_that_doesnt_build_fails_the_step_before_compose(
    fx: Fixture,
) -> None:
    fx.branch(CHANGE)
    (fx.stubs / "docker").rename(fx.stubs / "docker.real")
    (fx.stubs / "docker").write_text(BUILDX_FAILS, encoding="utf-8")
    (fx.stubs / "docker").chmod(0o755)
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of(done, "image") == "FAIL"
    assert "didn't build the gateway's image" in done.stdout
    assert "deploy/agents-engine/engine.sh up" in done.stdout
    assert len(by_kind(fx.docker(), "buildx")) == 1
    assert by_kind(fx.docker(), "compose") == []


# --------------------------------------------------------------------------------------------------
# The room's image (spec 002, contracts/web-serving.md §1), after the gateway's, when the export has its Dockerfile
# --------------------------------------------------------------------------------------------------
WEB_BRANCH = {**CHANGE, "apps/web/Dockerfile": "FROM scratch\n"}


def test_the_image_step_builds_the_rooms_image_as_prods_after_the_gateways(
    fx: Fixture,
) -> None:
    sha = fx.branch(WEB_BRANCH)
    done = gate(fx, "feature")
    assert done.returncode == 0, done.stdout + done.stderr
    calls = fx.docker()
    (devcontainer,) = by_kind(calls, "build")
    export = devcontainer["argv"][-1]
    gateway, web = by_kind(calls, "buildx")
    assert f"h4reet-gateway:{sha}" in gateway["argv"]
    # prod's variant: no drafts, and no policy context, so the Dockerfile's own empty policy stage applies.
    assert web["argv"] == [
        "buildx",
        "build",
        "--load",
        "--file",
        f"{export}/apps/web/Dockerfile",
        "--tag",
        f"h4reet-web:{sha}",
        "--build-arg",
        f"HTTP_PROXY={GATEWAY_PROXY}",
        "--build-arg",
        f"HTTPS_PROXY={GATEWAY_PROXY}",
        "--build-arg",
        "ROOM_DRAFTS=",
        export,
    ]
    assert web["docker_env"] == gateway["docker_env"]
    (compose,) = by_kind(calls, "compose")
    assert calls.index(gateway) < calls.index(web) < calls.index(compose)
    assert status_of(done, "image") == "PASS"


def test_a_commit_without_the_rooms_dockerfile_builds_the_gateway_alone(
    fx: Fixture,
) -> None:
    fx.branch(CHANGE)
    done = gate(fx, "feature")
    assert done.returncode == 0, done.stdout + done.stderr
    (gateway,) = by_kind(fx.docker(), "buildx")
    assert not [a for a in gateway["argv"] if "h4reet-web" in a]


BUILDX_WEB_FAILS = r"""#!/usr/bin/env python3
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[1:]
if args[:1] == ["buildx"]:
    with open(os.path.join(here, "docker.calls"), "a", encoding="utf-8") as handle:
        handle.write(json.dumps({"argv": args, "env_keys": [], "docker_env": {}}) + "\n")
    if any(a.startswith("h4reet-web:") for a in args):
        print("buildx: a step failed")
        sys.exit(1)
    sys.exit(0)
real = os.path.join(here, "docker.real")
os.execv(real, [real, *args])
"""


def test_a_web_image_that_doesnt_build_fails_the_step_before_compose(
    fx: Fixture,
) -> None:
    fx.branch(WEB_BRANCH)
    (fx.stubs / "docker").rename(fx.stubs / "docker.real")
    (fx.stubs / "docker").write_text(BUILDX_WEB_FAILS, encoding="utf-8")
    (fx.stubs / "docker").chmod(0o755)
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of(done, "image") == "FAIL"
    assert "didn't build the room's image" in done.stdout
    assert len(by_kind(fx.docker(), "buildx")) == 2
    assert by_kind(fx.docker(), "compose") == []


# --------------------------------------------------------------------------------------------------
# The room's published content (spec 002, T080; contracts/resume-source.md §5): in the container phase, the room built
# without drafts, with main's policy mounted; then main's tools/gates/content_check.py, on the host, over the export
# and that build's room-data.json
# --------------------------------------------------------------------------------------------------
ROOM_BRANCH = {**CHANGE, "apps/web/package.json": "{}\n"}
WEB_BUILD = ["npm", "run", "--ignore-scripts", "build", "-w", "apps/web"]
MAIN_APPROVALS = '{"schema": 1, "approvals": []}\n'


def web_builds(calls: list[dict]) -> list[dict]:
    return [c for c in by_kind(calls, "run") if c["command"] == WEB_BUILD]


def on_main(fx: Fixture, files: dict[str, str]) -> None:
    git(fx.main, "switch", "-q", "main")
    for rel, text in files.items():
        write(fx.main / rel, text)
    git(fx.main, "add", "-f", "--", *files)
    git(fx.main, "commit", "-qm", "main's policy")


def test_the_room_is_built_without_drafts_and_its_content_checked_from_main(
    fx: Fixture,
) -> None:
    on_main(fx, {"assets/policy/content-approvals.json": MAIN_APPROVALS})
    fx.branch(ROOM_BRANCH)
    done = gate(fx, "feature")
    assert done.returncode == 0, done.stdout + done.stderr
    calls = fx.docker()
    (build,) = web_builds(calls)
    argv = build["argv"]
    # --network none, and the scripts off, so a checkout's prebuild (which runs git) never runs here.
    assert has(argv, "--network", "none")
    assert has(argv, "--env", "ROOM_DRAFTS=")
    assert has(argv, "--env", "ROOM_POLICY_DIR=/policy")
    assert build["policy"] == {"content-approvals.json": MAIN_APPROVALS}
    assert build["policy_readonly"] is True
    # After the container's other steps.
    assert calls.index(build) > calls.index(make_runs(calls)[-1])
    (check,) = fx.logged("content_check")
    assert check["isolated"] and check["no_bytecode"]
    flags = dict(zip(check["argv"][::2], check["argv"][1::2]))
    # The whole dist/, which the check scans for any unapproved file's text, room-data.json's claims aside.
    assert set(flags) == {"--tree", "--dist", "--policy-dir"}
    assert flags["--dist"].endswith("/work/apps/web/dist")
    # The digests come from the export, the commit's own read-only tree, not the build's working copy.
    assert Path(flags["--tree"]).name == "export"
    assert status_of(done, "content-build") == "PASS"
    assert status_of(done, "content") == "PASS"


def test_the_build_gets_mains_policy_never_the_branchs(fx: Fixture) -> None:
    on_main(fx, {"assets/policy/content-approvals.json": MAIN_APPROVALS})
    fx.branch(
        {
            **ROOM_BRANCH,
            "assets/policy/content-approvals.json": '{"schema": 1, "approvals": ["the branch approving itself"]}\n',
        }
    )
    done = gate(fx, "feature")
    (build,) = web_builds(fx.docker())
    assert build["policy"] == {"content-approvals.json": MAIN_APPROVALS}
    assert status_of(done, "content") == "PASS"


def test_a_tag_named_main_never_stands_in_for_the_branch(fx: Fixture) -> None:
    # git resolves a bare `main` to refs/tags/main before refs/heads/main, and an agent session can make that tag:
    # the gate reads refs/heads/main, as spec 003's check reads its policy.
    on_main(fx, {"assets/policy/content-approvals.json": MAIN_APPROVALS})
    fx.branch(
        {
            **ROOM_BRANCH,
            "assets/policy/content-approvals.json": '{"schema": 1, "approvals": ["the tag approving itself"]}\n',
        }
    )
    git(fx.main, "tag", "main", "feature")
    done = gate(fx, "feature")
    (build,) = web_builds(fx.docker())
    assert build["policy"] == {"content-approvals.json": MAIN_APPROVALS}
    assert status_of(done, "content") == "PASS"


def test_with_no_policy_on_main_the_build_gets_an_empty_one(fx: Fixture) -> None:
    fx.branch(ROOM_BRANCH)
    gate(fx, "feature")
    (build,) = web_builds(fx.docker())
    assert build["policy"] == {}


def test_a_build_that_publishes_a_draft_fails_the_gate(fx: Fixture) -> None:
    fx.branch(ROOM_BRANCH)
    (fx.logs / "content_check.control").write_text(
        "1\nFAIL apps/web/content/resume.yaml: published, and main doesn't approve its SHA-256",
        encoding="utf-8",
    )
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of(done, "content") == "FAIL"


def test_a_build_that_fails_runs_no_content_check(fx: Fixture) -> None:
    fx.branch(ROOM_BRANCH)
    fx.control(web_build_fails=True)
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of(done, "content-build") == "FAIL"
    assert status_of(done, "content") == "FAIL"
    assert fx.logged("content_check") == []


def test_a_commit_without_the_room_has_no_content_steps(fx: Fixture) -> None:
    fx.branch(CHANGE)
    done = gate(fx, "feature")
    assert done.returncode == 0, done.stdout + done.stderr
    assert web_builds(fx.docker()) == []
    assert fx.logged("content_check") == []
    with pytest.raises(AssertionError):
        status_of(done, "content")


# --------------------------------------------------------------------------------------------------
# The agents' engine answers one docker version, within a bound, before the image step builds on it (as make image
# asks it since tasks.md T167)
# --------------------------------------------------------------------------------------------------
# A docker whose agents' engine is down. Every call to that engine is logged, then refused at once ("refuses"), or held
# as a forward that takes the connection and never answers would hold it ("hangs"), here until HELD_FOR, the test's
# own cap, and then refused. Calls to this machine's engine go on to the stand-in.
ENGINE_DOWN = r"""#!/usr/bin/env python3
import json, os, sys, time
here = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[1:]
if os.environ.get("DOCKER_HOST") != "tcp://198.18.0.1:2376":
    real = os.path.join(here, "docker.real")
    os.execv(real, [real, *args])
docker_env = {k: v for k, v in os.environ.items() if k.startswith("DOCKER_")}
with open(os.path.join(here, "docker.calls"), "a", encoding="utf-8") as handle:
    handle.write(json.dumps({"argv": args, "env_keys": sorted(os.environ), "docker_env": docker_env}) + "\n")
if "@MODE@" == "hangs":
    time.sleep(@HELD@)
print("Cannot connect to the Docker daemon at tcp://198.18.0.1:2376. Is the docker daemon running?", file=sys.stderr)
sys.exit(1)
"""
HELD_FOR = 20


def engine_down(fx: Fixture, mode: str) -> None:
    (fx.stubs / "docker").rename(fx.stubs / "docker.real")
    stand_in = ENGINE_DOWN.replace("@MODE@", mode).replace("@HELD@", str(HELD_FOR))
    write(fx.stubs / "docker", stand_in, 0o755)


def on_engine(calls: list[dict]) -> list[dict]:
    """The docker calls made to the agents' engine."""
    return [c for c in calls if c["docker_env"].get("DOCKER_HOST") == ENGINE]


def test_the_image_step_asks_the_agents_engine_for_its_version_before_it_builds(
    fx: Fixture,
) -> None:
    fx.branch(CHANGE)
    done = gate(fx, "feature")
    assert done.returncode == 0, done.stdout + done.stderr
    calls = on_engine(fx.docker())
    # One docker version, with the Author's certificate, then the gateway's image, then the compose images.
    assert [c["argv"][:1] for c in calls] == [["version"], ["buildx"], ["compose"]]
    assert calls[0]["argv"] == ["version"]
    assert calls[0]["docker_env"] == {
        "DOCKER_HOST": ENGINE,
        "DOCKER_TLS_VERIFY": "1",
        "DOCKER_CERT_PATH": f"{fx.home}/.config/h4reet-ai/agents-engine/docker",
    }
    assert status_of(done, "image") == "PASS"


def test_an_engine_that_refuses_fails_the_image_step_with_dockers_reason_and_builds_nothing(
    fx: Fixture,
) -> None:
    fx.branch(CHANGE)
    engine_down(fx, "refuses")
    done = gate(fx, "feature")
    assert done.returncode == 1
    assert status_of(done, "image") == "FAIL"
    line = row(done, "image")
    assert "didn't answer docker version (it exited 1)" in line
    assert "nothing was built" in line
    assert "deploy/agents-engine/engine.sh up" in line
    # docker's own error, above the step's line.
    assert "Cannot connect to the Docker daemon at tcp://198.18.0.1:2376" in done.stdout
    assert [c["argv"] for c in on_engine(fx.docker())] == [["version"]]
    # The steps after it still ran.
    assert status_of(done, "matrix-e") == "SKIP"
    assert "failing: image FAIL" in summary(done)


def test_an_engine_that_never_answers_fails_the_image_step_at_the_bound(
    fx: Fixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The step itself, in this process, so the bound can be 1 s here rather than the gate's 15. The stand-in holds
    # each call to the agents' engine for HELD_FOR, so a step that waited on one would take that long.
    engine_down(fx, "hangs")
    monkeypatch.setenv("PATH", f"{fx.stubs}:{fx.sysbin}")
    monkeypatch.setenv("HOME", str(fx.home))
    monkeypatch.setattr(gm, "ENGINE_PROBE_SECONDS", 1, raising=False)
    start = time.monotonic()
    step = gm.image(fx.main, gm.Step("policy"), fx.tmp, "0" * 40)
    took = time.monotonic() - start
    assert step.status == "FAIL"
    (note,) = step.notes
    assert "didn't answer docker version within 1 s" in note
    assert "nothing was built" in note
    assert "deploy/agents-engine/engine.sh up" in note
    assert took < HELD_FOR / 2, f"the step took {took:.1f} s"
    assert [c["argv"] for c in on_engine(fx.docker())] == [["version"]]


@pytest.mark.parametrize("why", ["policy", "certificate"])
def test_the_engine_isnt_asked_where_the_step_wouldnt_build(
    fx: Fixture, why: str
) -> None:
    fx.branch(CHANGE)
    if why == "policy":
        (fx.logs / "compose_policy.control").write_text(
            "1\ncompose policy: 1 refusal(s)", encoding="utf-8"
        )
    else:
        shutil.rmtree(fx.home / ".config/h4reet-ai/agents-engine")
    done = gate(fx, "feature")
    assert status_of(done, "image") == "FAIL"
    assert on_engine(fx.docker()) == []
