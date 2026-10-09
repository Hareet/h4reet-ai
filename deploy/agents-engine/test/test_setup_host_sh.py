"""Tests for deploy/agents-engine/setup-host.sh (spec 000, FR-039; contracts/agents-engine.md §2.3, §5).

setup-host.sh runs as root, through sudo, and changes the host; the sandbox has neither. Sourced, it
defines its functions and runs nothing, so these tests call the ones that can run as the user running
the tests: the Author, here, is that user. Shell functions stand in for `usermod`, `id`, and `log`. The
environment each bash gets is minimal on purpose: the sandbox's own variables never reach it.
"""

from __future__ import annotations

import getpass
import grp
import os
import shlex
import shutil
import stat
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SETUP = REPO / "deploy" / "agents-engine" / "setup-host.sh"
BASH = shutil.which("bash") or "/bin/bash"


def setup_host(script: str, home: Path) -> subprocess.CompletedProcess[str]:
    """Source setup-host.sh in bash as this user, then run `script` in the same shell."""
    env = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": str(home), "LC_ALL": "C"}
    env["TMPDIR"] = os.environ.get(
        "TMPDIR", "/tmp"
    )  # mktemp's directory; the sandbox's /tmp is read-only
    return subprocess.run(
        [BASH, "-c", 'source "$1" || exit 99\n' + script, "setup-test", str(SETUP)],
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


def q(path: Path | str) -> str:
    return shlex.quote(str(path))


ME = getpass.getuser()


# --------------------------------------------------------------------------------------------------
# Sourced, it runs nothing: not even its root check
# --------------------------------------------------------------------------------------------------
def test_sourced_it_defines_functions_and_runs_nothing(tmp_path: Path) -> None:
    done = setup_host("type ensure_subids >/dev/null && echo defined", tmp_path)
    assert done.returncode == 0, done.stderr
    assert "defined" in done.stdout
    assert "must run as root" not in done.stderr


def test_run_it_still_refuses_without_root(tmp_path: Path) -> None:
    if os.geteuid() == 0:
        return  # the check this proves is the one for everyone else
    env = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": str(tmp_path)}
    done = subprocess.run(
        [BASH, str(SETUP)],
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert done.returncode == 1
    assert "must run as root" in done.stderr


# --------------------------------------------------------------------------------------------------
# The agents' DOCKER_CONFIG holds config.json, {} (§2.3, tasks.md T135)
# --------------------------------------------------------------------------------------------------
def _docker_config(
    tmp_path: Path,
    *,
    before: str | None = None,
    link_to: str | None = None,
):
    """ensure_agent_docker_config into a temporary agents' directory, twice. `before` is a config.json
    already there, with the right mode and owner; `link_to` puts a link there instead, to a file of
    the Author's, mode 0444, holding that text."""
    directory = tmp_path / "docker"
    directory.mkdir()
    config = directory / "config.json"
    victim = tmp_path / "victim"
    if link_to is not None:
        victim.write_text(link_to, encoding="utf-8")
        victim.chmod(0o444)
        config.symlink_to(victim)
    elif before is not None:
        config.write_text(before, encoding="utf-8")
        config.chmod(0o444)  # only its content is wrong
    script = f"""
author={q(ME)}
agent_cert_dir={q(directory)}
log() {{ printf 'log: %s\\n' "$*"; }}
ensure_agent_docker_config
echo FIRST-DONE
ensure_agent_docker_config
echo SECOND-DONE
"""
    done = setup_host(script, tmp_path)
    return done, config, victim


def test_docker_config_is_an_empty_object_0444_owned_by_the_author(
    tmp_path: Path,
) -> None:
    done, config, _ = _docker_config(tmp_path)
    assert "SECOND-DONE" in done.stdout, done.stderr
    assert config.read_text(encoding="utf-8").strip() == "{}"
    info = config.stat()
    assert stat.S_IMODE(info.st_mode) == 0o444
    assert info.st_uid == os.getuid()
    assert grp.getgrgid(info.st_gid).gr_name == ME


def test_docker_config_write_is_idempotent(tmp_path: Path) -> None:
    done, _, _ = _docker_config(tmp_path)
    first, second = done.stdout.split("FIRST-DONE")
    assert "config.json" in first  # the first run writes it and says so
    assert "log:" not in second  # the second finds it right and changes nothing


def test_docker_config_replaces_credentials_or_proxies(tmp_path: Path) -> None:
    before = '{"auths": {"ghcr.io": {"auth": "eA=="}}, "proxies": {"default": {}}}'
    done, config, _ = _docker_config(tmp_path, before=before)
    assert "SECOND-DONE" in done.stdout, done.stderr
    assert config.read_text(encoding="utf-8").strip() == "{}"


def test_docker_config_replaces_a_link_rather_than_writing_through_it(
    tmp_path: Path,
) -> None:
    done, config, victim = _docker_config(tmp_path, link_to="the Author's file\n")
    assert "SECOND-DONE" in done.stdout, done.stderr
    assert victim.read_text(encoding="utf-8") == "the Author's file\n"
    assert not config.is_symlink()
    assert config.read_text(encoding="utf-8").strip() == "{}"


def test_docker_config_replaces_a_link_even_to_a_file_that_looks_right(
    tmp_path: Path,
) -> None:
    # A link that leads to {} is still a link: what it leads to can change after setup looks.
    done, config, _ = _docker_config(tmp_path, link_to="{}\n")
    assert "SECOND-DONE" in done.stdout, done.stderr
    assert not config.is_symlink()
    assert stat.S_IMODE(config.lstat().st_mode) == 0o444
