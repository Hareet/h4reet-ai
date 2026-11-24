"""The container probe (spec 017, plan.md §5; contracts/probe.md §2; tasks.md T053), with a stub docker.

deploy/night-shift/container-probe.sh runs against stub_docker.py, which never starts a container: it answers the
probe's checks container with the rows a holding boundary prints (and keeps a copy of the checks script the probe
wrote, so each row's name can be found in it). The fake $HOME holds the night-shift token (made at run time) and a
planted ~/.aws/credentials. The probe must write only in its own folder, remove the containers and networks it made
on success and on failure, pass the token only by --env-file, print no planted secret, and end with every row of
contracts/probe.md §2.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import shutil
import subprocess
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
NIGHT = HERE.parent
PROBE = NIGHT / "container-probe.sh"
STUB = HERE / "stub_docker.py"
GIT = "/usr/bin/git"

BOUNDARY_ROWS = [
    "no-socket",
    "no-socket-run",
    "no-aws",
    "no-ssh",
    "no-h4config",
    "no-author-claude",
    "no-photos",
    "no-key",
    "egress-allowed",
    "egress-refused",
    "no-route",
    "no-default-route",
    "worktree-write",
    "commit",
    "hooks-ro",
    "config-ro",
    "hookspath",
    "settings-ro",
    "main-ro",
    "tags-ro",
    "alternates-ro",
    "commondir-ro",
]
PLAN_ROWS = ("signin", "no-api-credential")
FAILCLOSED = (
    "failclosed-managed-api-key",
    "failclosed-managed-auth-token",
    "failclosed-managedenv-api-key",
    "failclosed-managedenv-auth-token",
)
INFO_ROWS = ("dns", "engine-fwd", "claude-sandbox-in-container", "gpu", "auth-status")
CHECKS_ROWS = (
    *BOUNDARY_ROWS,
    *PLAN_ROWS,
    "dns",
    "engine-fwd",
    "claude-sandbox-in-container",
    "auth-status",
)


class Probe:
    def __init__(self, tmp: Path, scenario: dict | None = None) -> None:
        self.tmp = Path(os.path.realpath(tmp))
        self.home = self.tmp / "home"
        self.bin = self.tmp / "bin"
        self.repo = self.tmp / "repo"
        self.state = self.tmp / "stub-state.json"
        self.log = self.tmp / "stub-log.jsonl"
        self.scenario = scenario or {}
        self.token_value = "sk-ant-oat01-" + secrets.token_urlsafe(24)
        self.aws_secret = secrets.token_hex(20)
        for d in (
            self.bin,
            self.home / ".config/h4reet-ai/night-shift",
            self.home / ".aws",
            self.repo,
            self.tmp / "t",
        ):
            d.mkdir(parents=True)
        self.token = self.home / ".config/h4reet-ai/night-shift/claude.env"
        self.token.write_text(f"CLAUDE_CODE_OAUTH_TOKEN={self.token_value}\n")
        self.token.chmod(0o600)
        (self.home / ".aws/credentials").write_text(
            f"aws_secret_access_key = {self.aws_secret}\n"
        )
        env = {
            "GIT_CONFIG_GLOBAL": "/dev/null",
            "GIT_CONFIG_NOSYSTEM": "1",
            "PATH": "/usr/bin:/bin",
        }
        ident = ["-c", "user.name=t", "-c", "user.email=t@example.invalid"]
        subprocess.run(
            [GIT, "init", "-q", "-b", "main", str(self.repo)], env=env, check=True
        )
        (self.repo / "deploy/agents-engine").mkdir(parents=True)
        (self.repo / "deploy/agents-engine/egress-proxy.py").write_text("# stand-in\n")
        subprocess.run([GIT, "-C", str(self.repo), "add", "-A"], env=env, check=True)
        subprocess.run(
            [GIT, "-C", str(self.repo), *ident, "commit", "-q", "-m", "x"],
            env=env,
            check=True,
        )
        shutil.copy2(STUB, self.bin / "docker")
        (self.bin / "docker").chmod(0o755)

    def run(self) -> subprocess.CompletedProcess[str]:
        env = {
            "HOME": str(self.home),
            "PATH": f"{self.bin}:/usr/bin:/bin",
            "TMPDIR": str(self.tmp / "t"),
            "H4_REPO": str(self.repo),
            "STUB_STATE": str(self.state),
            "STUB_LOG": str(self.log),
            "STUB_SCENARIO": json.dumps(self.scenario),
            "STUB_PROBE_ROWS": ",".join((*BOUNDARY_ROWS, *PLAN_ROWS)),
        }
        r = subprocess.run(
            ["bash", str(PROBE)],
            env=env,
            cwd=self.tmp,
            capture_output=True,
            text=True,
            check=False,
            timeout=300,
        )
        self.output = r.stdout + r.stderr
        return r

    def calls(self) -> list[list[str]]:
        return (
            [json.loads(x)["argv"] for x in self.log.read_text().splitlines()]
            if self.log.exists()
            else []
        )

    def stub_state(self) -> dict:
        return json.loads(self.state.read_text())

    def folder(self) -> Path:
        found = [p for p in self.home.iterdir() if p.name.startswith("h4-cprobe.")]
        assert len(found) == 1, found
        return found[0]


def listing(root: Path) -> set[str]:
    return {str(p.relative_to(root)) for p in root.rglob("*")}


@pytest.fixture(scope="module")
def ok(tmp_path_factory) -> Probe:
    p = Probe(tmp_path_factory.mktemp("probe"))
    p.before = listing(p.home)
    p.result = p.run()
    return p


def test_the_probe_holds_and_ends_with_every_row(ok) -> None:
    assert ok.result.returncode == 0, ok.output[-3000:]
    s = ok.output.split("== summary ==")[-1]
    lines = s.strip().splitlines()
    assert lines[0] == "BOUNDARY: holds", lines[:3]
    assert lines[1].startswith("PLAN-ONLY: yes"), lines[:3]
    for row in (*BOUNDARY_ROWS, *PLAN_ROWS, *FAILCLOSED, *INFO_ROWS):
        assert re.search(
            rf"^{re.escape(row)} (ok|info|FAILED|UNTESTED)", s, re.MULTILINE
        ), row
    assert re.search(
        r"^probe: done, report at .*/h4-cprobe\.[^/]+/report\.txt$", s, re.MULTILINE
    )


def test_every_row_the_checks_script_prints_is_in_it(ok) -> None:
    checks = Path(str(ok.state) + ".checks.sh").read_text()
    for row in CHECKS_ROWS:
        assert re.search(rf"\b{re.escape(row)}\b", checks), row


def test_it_writes_only_in_its_own_folder(ok) -> None:
    after = listing(ok.home)
    folder = ok.folder().name
    new = {p for p in after - ok.before if not p.startswith(folder)}
    assert not new, new
    assert ok.before <= after
    kept = {p.name for p in ok.folder().iterdir()}
    assert "report.txt" in kept
    for gone in (
        "claude",
        "home",
        "repo",
        "night",
        "ctx-w",
        "ctx-e",
        "rows.txt",
        "checks.sh",
        "passwd",
        "group",
    ):
        assert gone not in kept, gone


def test_it_removes_its_containers_and_networks(ok) -> None:
    st = ok.stub_state()
    assert not [n for n in st["networks"] if n.startswith("h4-cprobe-")]
    assert not [n for n in st["containers"] if n.startswith("h4-cprobe-")]
    made = [c for c in ok.calls() if c[1:3] == ["network", "create"]]
    assert len(made) == 2 and any("--internal" in c for c in made)
    assert all("--label" in c for c in made)


def test_it_removes_a_container_whose_id_is_all_digits(tmp_path) -> None:
    # The gate's run of 2026-11-23 (stack/2026-11-23) replayed: its folder was h4-cprobe.cojyrk, which gave the egress
    # proxy, the stub's first detached container, the ID 504080177739, all digits (about one container in 280 gets
    # such an ID), and the cleanup's `docker rm -f 504080177739` left it. A mktemp ahead of /usr/bin's on the probe's
    # PATH names the folder; the probe runs as it ran there.
    p = Probe(tmp_path)
    shim = p.bin / "mktemp"
    shim.write_text(
        "#!/bin/bash\n"
        'if [ "$#" = 2 ] && [ "$1" = -d ] && [ "$2" = "$HOME/h4-cprobe.XXXXXX" ]; then\n'
        '\tmkdir -m 700 -- "$HOME/h4-cprobe.cojyrk" && echo "$HOME/h4-cprobe.cojyrk"\n'
        "else\n"
        '\texec /usr/bin/mktemp "$@"\n'
        "fi\n"
    )
    shim.chmod(0o755)
    # The case itself, as the stub makes an ID (stub_docker.py's run(): its name and its sequence number, 1 here).
    egress_id = hashlib.sha256(b"h4-cprobe-egress-cojyrk1").hexdigest()[:12]
    assert egress_id == "504080177739"
    r = p.run()
    assert r.returncode == 0, p.output[-3000:]
    assert p.folder().name == "h4-cprobe.cojyrk"
    made = [c for c in p.calls() if c[1:2] == ["run"] and "--name" in c and "-d" in c]
    assert "h4-cprobe-egress-cojyrk" in [c[c.index("--name") + 1] for c in made]
    # The case ran: the cleanup removed the egress proxy by that ID, not by another the stub might make one day.
    removed = [c for c in p.calls() if c[1:2] == ["rm"]]
    assert any(egress_id in c for c in removed), removed
    st = p.stub_state()
    assert not [n for n in st["containers"] if n.startswith("h4-cprobe-")]
    assert not [n for n in st["networks"] if n.startswith("h4-cprobe-")]


def test_the_token_reaches_containers_only_by_env_file(ok) -> None:
    runs = [c for c in ok.calls() if c[1:2] == ["run"]]
    with_token = [c for c in runs if "--env-file" in c]
    assert with_token
    for c in with_token:
        assert c[c.index("--env-file") + 1] == str(ok.token)
    for c in ok.calls():
        assert ok.token_value not in " ".join(c)
        assert not any(a.startswith("CLAUDE_CODE_OAUTH_TOKEN") for a in c)


def test_it_prints_no_planted_secret(ok) -> None:
    report = (ok.folder() / "report.txt").read_text()
    for text in (ok.output, report):
        assert ok.token_value not in text
        assert ok.aws_secret not in text


def test_the_fail_closed_runs_add_one_stand_in_each(ok) -> None:
    standin = [
        c
        for c in ok.calls()
        if c[1:2] == ["run"] and any(a.endswith("=probe-not-a-credential") for a in c)
    ]
    assert len(standin) == 4
    for c in standin:
        assert any(a.endswith(":/etc/claude-code/managed-settings.json:ro") for a in c)


def test_on_failure_it_still_removes_what_it_made(tmp_path) -> None:
    p = Probe(tmp_path, {"fwd_fail": True})
    before = listing(p.home)
    r = p.run()
    assert "engine forwarder: FAILED to start" in p.output
    assert (
        r.returncode == 0
    )  # the report is written either way; the summary isn't reached
    st = p.stub_state()
    made = [c for c in p.calls() if c[1:2] == ["run"] and "-d" in c]
    assert made  # the egress proxy was running
    assert not [n for n in st["containers"] if n.startswith("h4-cprobe-")]
    assert not [n for n in st["networks"] if n.startswith("h4-cprobe-")]
    new = {x for x in listing(p.home) - before if not x.startswith(p.folder().name)}
    assert not new
    assert p.token_value not in p.output and p.aws_secret not in p.output


def test_a_token_file_of_the_wrong_mode_stops_it_before_anything(tmp_path) -> None:
    p = Probe(tmp_path)
    p.token.chmod(0o644)
    r = p.run()
    assert r.returncode == 2 and "mode 600" in p.output
    assert not p.calls()
    assert not [x for x in p.home.iterdir() if x.name.startswith("h4-cprobe.")]
