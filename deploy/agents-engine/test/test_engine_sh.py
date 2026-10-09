"""Tests for deploy/agents-engine/engine.sh (spec 000, FR-039; contracts/agents-engine.md §5, §6, §8).

engine.sh runs as the Author, with sudo, Docker, and systemd, none of which the sandbox has. Sourced, it
defines its functions and runs nothing, so these tests call them in bash, with shell functions standing
in for the commands they would run (`docker`, `systemctl`, `df`). Nothing here reaches the host's
Docker, systemd, or network. The environment each bash gets is minimal on purpose: the sandbox's own
variables, its proxy's credentials among them, never reach it or a failure's report.
"""

from __future__ import annotations

import importlib.util
import json
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
ENGINE = REPO / "deploy" / "agents-engine" / "engine.sh"
PROXY = REPO / "deploy" / "agents-engine" / "egress-proxy.py"
BASH = shutil.which("bash") or "/bin/bash"

SPEC = importlib.util.spec_from_file_location("egress_proxy_for_engine", PROXY)
assert SPEC and SPEC.loader
ep = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ep
SPEC.loader.exec_module(ep)


def engine(script: str, home: Path, **env: str) -> subprocess.CompletedProcess[str]:
    """Source engine.sh in bash, then run `script` in the same shell."""
    base = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": str(home), "LC_ALL": "C"}
    return subprocess.run(
        [BASH, "-c", 'source "$1" || exit 99\n' + script, "engine-test", str(ENGINE)],
        env={**base, **env},
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


def q(path: Path | str) -> str:
    return shlex.quote(str(path))


# --------------------------------------------------------------------------------------------------
# Sourced, it runs nothing; run, it runs main
# --------------------------------------------------------------------------------------------------
def test_sourced_it_defines_functions_and_runs_nothing(tmp_path: Path) -> None:
    done = engine(
        'echo "here=$here"; type status_list_hashes >/dev/null && echo defined',
        tmp_path,
    )
    assert done.returncode == 0, done.stderr
    assert f"here={ENGINE.parent}" in done.stdout
    assert "defined" in done.stdout
    assert "usage" not in done.stderr


def test_run_it_still_runs_main_and_refuses_the_authors_subcommands_in_a_session(
    tmp_path: Path,
) -> None:
    base = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": str(tmp_path)}
    usage = subprocess.run(
        [BASH, str(ENGINE)],
        env=base,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert usage.returncode == 2
    assert "usage: deploy/agents-engine/engine.sh" in usage.stderr
    refused = subprocess.run(
        [BASH, str(ENGINE), "up"],
        env={**base, "SANDBOX_RUNTIME": "1"},
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert refused.returncode == 1
    assert "'up' is the Author's" in refused.stderr


# --------------------------------------------------------------------------------------------------
# status: the proxy's list in use against the settings' (§4, §8, tasks.md T131)
# --------------------------------------------------------------------------------------------------
def _settings_file(path: Path, allowed: list[str] | None) -> Path:
    data = (
        {} if allowed is None else {"sandbox": {"network": {"allowedDomains": allowed}}}
    )
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def _status(
    tmp_path: Path,
    settings: list[str] | None,
    recorded: list[str] | None | str,
    active: bool = True,
    installed: bool = True,
) -> subprocess.CompletedProcess[str]:
    """Run status_list_hashes with the installed proxy in a temporary lib. `recorded` is the list the
    running proxy recorded at its start, "absent" for no record, or "link" for a record behind a link."""
    lib = tmp_path / "lib"
    lib.mkdir(exist_ok=True)
    if installed:
        shutil.copy(PROXY, lib / "egress-proxy.py")
    current = _settings_file(tmp_path / "settings.json", settings)
    record = tmp_path / "state" / "egress-list.json"
    record.parent.mkdir(exist_ok=True)
    if recorded == "link":
        real = tmp_path / "real-record.json"
        real.write_text(
            ep.list_json(ep.Settings.load(current)) + "\n", encoding="utf-8"
        )
        record.symlink_to(real)
    elif recorded != "absent":
        started = _settings_file(tmp_path / "started.json", recorded)
        ep.write_list_file(record, ep.Settings.load(started))
    script = f"""
lib={q(lib)}
H4_EGRESS_SETTINGS={q(current)}
egress_list_file={q(record)}
systemctl() {{ return {0 if active else 3}; }}
status_list_hashes
"""
    return engine(script, tmp_path)


def _digest(allowed: list[str] | None) -> str:
    settings = ep.Settings(allowed=allowed or [], ok=bool(allowed))
    return settings.digest()


def test_status_says_the_same_when_the_proxy_serves_the_settings_list(
    tmp_path: Path,
) -> None:
    done = _status(tmp_path, ["pypi.org", "ghcr.io"], ["ghcr.io", "pypi.org"])
    assert done.returncode == 0, done.stderr
    digest = _digest(["pypi.org", "ghcr.io"])
    assert f"running:  {digest}" in done.stdout
    assert f"settings: {digest}" in done.stdout
    assert "the same" in done.stdout
    assert "differ" not in done.stdout


def test_status_says_plainly_to_restart_when_the_lists_differ(tmp_path: Path) -> None:
    done = _status(tmp_path, ["pypi.org", "ghcr.io"], ["pypi.org"])
    assert done.returncode == 0, done.stderr
    assert f"running:  {_digest(['pypi.org'])}" in done.stdout
    assert f"settings: {_digest(['pypi.org', 'ghcr.io'])}" in done.stdout
    assert "they differ" in done.stdout
    assert "Restart the proxy" in done.stdout
    assert "the same" not in done.stdout


def test_status_without_a_record_compares_nothing(tmp_path: Path) -> None:
    done = _status(tmp_path, ["pypi.org"], "absent")
    assert "running:  unknown: no record" in done.stdout
    assert "the same" not in done.stdout
    assert "differ" not in done.stdout


def test_status_does_not_read_a_record_behind_a_link(tmp_path: Path) -> None:
    # The proxy never writes a link, so one at the record's name was put there by something else.
    done = _status(tmp_path, ["pypi.org"], "link")
    assert "running:  unknown: no record" in done.stdout
    assert "the same" not in done.stdout


def test_status_with_the_proxy_stopped_says_so(tmp_path: Path) -> None:
    done = _status(tmp_path, ["pypi.org"], ["pypi.org"], active=False)
    assert "running:  none: h4-egress-proxy.service is not active" in done.stdout
    assert "the same" not in done.stdout


def test_status_names_a_settings_file_with_no_list(tmp_path: Path) -> None:
    done = _status(tmp_path, None, ["pypi.org"])
    assert f"settings: {_digest(None)} (no list in" in done.stdout
    assert "they differ" in done.stdout


def test_status_names_a_running_proxy_with_no_list(tmp_path: Path) -> None:
    done = _status(tmp_path, ["pypi.org"], None)
    assert (
        f"running:  {_digest(None)} (no list: it refuses every request)" in done.stdout
    )
    assert "they differ" in done.stdout


def test_status_without_the_installed_proxy_says_so(tmp_path: Path) -> None:
    done = _status(tmp_path, ["pypi.org"], ["pypi.org"], installed=False)
    assert "settings: unknown:" in done.stdout
    assert "is not installed" in done.stdout
    assert "the same" not in done.stdout
