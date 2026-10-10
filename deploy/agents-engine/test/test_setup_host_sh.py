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

import pytest

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


# --------------------------------------------------------------------------------------------------
# H2: h4agents' subordinate range overlaps no one else's (§5 H2, tasks.md T138)
# --------------------------------------------------------------------------------------------------
FIRST, LAST = 1065536, 1131071  # the range setup-host.sh assigns: 65,536 IDs
H4_UID = "999"  # the stand-in uid of h4agents


def _clash(tmp_path: Path, lines: list[str] | None) -> tuple[int, str]:
    """subid_clash on a file of these lines (None: no file) for h4agents' range."""
    path = tmp_path / "subuid"
    if lines is not None:
        path.write_text("".join(f"{line}\n" for line in lines), encoding="utf-8")
    script = f"""
if out="$(subid_clash {q(path)} h4agents {H4_UID} {FIRST} {LAST - FIRST + 1})"; then
	echo "rc=0 [$out]"
else
	echo "rc=$? [$out]"
fi
"""
    done = setup_host(script, tmp_path)
    assert done.returncode == 0, done.stderr
    rc, _, out = done.stdout.strip().partition(" ")
    return int(rc.removeprefix("rc=")), out[1:-1]


@pytest.mark.parametrize(
    "lines",
    [
        ["h4reet:100000:65536"],  # the Author's own range, far below
        [
            "h4reet:100000:65536",
            f"other:1000000:{FIRST - 1000000}",
        ],  # ends one below the first
        [f"other:{LAST + 1}:65536"],  # starts one above the last
        [f"h4agents:{FIRST}:65536"],  # h4agents' own entry, the same range: idempotent
        [f"{H4_UID}:{FIRST}:65536"],  # the same, by uid
        ["other:1100000:0"],  # an empty range holds no IDs, even one that starts inside
        ["", "# a comment", "h4reet:100000:65536"],
        None,  # no file yet
    ],
)
def test_subid_ranges_that_do_not_clash(
    tmp_path: Path, lines: list[str] | None
) -> None:
    assert _clash(tmp_path, lines) == (0, "")


@pytest.mark.parametrize(
    ("lines", "named"),
    [
        (["other:1100000:65536"], "subuid:1: other:1100000:65536"),
        ([f"other:{LAST}:1"], f"subuid:1: other:{LAST}:1"),  # its last ID
        (
            [f"other:{FIRST - 65535}:65536"],
            f"subuid:1: other:{FIRST - 65535}:65536",
        ),  # its first
        (["other:1000000:200000"], "subuid:1: other:1000000:200000"),  # around it
        ([f"other:{FIRST + 1}:10"], f"subuid:1: other:{FIRST + 1}:10"),  # inside it
        (
            [f"1000:{FIRST}:65536"],
            f"subuid:1: 1000:{FIRST}:65536",
        ),  # someone else, by uid
        (["h4reet:100000:65536", "x:1100000:5"], "subuid:2: x:1100000:5"),
    ],
)
def test_subid_ranges_that_clash_are_named(
    tmp_path: Path, lines: list[str], named: str
) -> None:
    rc, out = _clash(tmp_path, lines)
    assert rc == 1
    assert out.endswith(named)


@pytest.mark.parametrize("line", ["garbage", "other:abc:65536", "other:1:2:3"])
def test_a_subid_line_it_cannot_read_is_refused(tmp_path: Path, line: str) -> None:
    # Refusing beats assigning a range that might overlap what the line meant.
    rc, out = _clash(tmp_path, ["h4reet:100000:65536", line])
    assert rc == 1
    assert "subuid:2:" in out and "unreadable" in out


def _ensure_subids(
    tmp_path: Path, subuid: list[str], subgid: list[str]
) -> tuple[subprocess.CompletedProcess[str], list[str]]:
    uid_file, gid_file, calls = (tmp_path / n for n in ("subuid", "subgid", "calls"))
    uid_file.write_text("".join(f"{line}\n" for line in subuid), encoding="utf-8")
    gid_file.write_text("".join(f"{line}\n" for line in subgid), encoding="utf-8")
    calls.write_text("", encoding="utf-8")
    script = f"""
subuid_file={q(uid_file)}
subgid_file={q(gid_file)}
id() {{ if [ "$*" = "-u h4agents" ]; then echo {H4_UID}; else command id "$@"; fi; }}
usermod() {{ printf 'usermod %s\\n' "$*" >>{q(calls)}; }}
log() {{ :; }}
ensure_subids
echo SUBIDS-OK
"""
    done = setup_host(script, tmp_path)
    return done, calls.read_text(encoding="utf-8").splitlines()


AUTHOR = ["h4reet:100000:65536"]


def test_ensure_subids_assigns_the_range_where_it_is_free(tmp_path: Path) -> None:
    done, calls = _ensure_subids(tmp_path, AUTHOR, AUTHOR)
    assert "SUBIDS-OK" in done.stdout, done.stderr
    assert calls == [
        f"usermod --add-subuids {FIRST}-{LAST} h4agents",
        f"usermod --add-subgids {FIRST}-{LAST} h4agents",
    ]


def test_ensure_subids_leaves_h4agents_own_range_as_it_is(tmp_path: Path) -> None:
    held = [*AUTHOR, f"h4agents:{FIRST}:65536"]
    done, calls = _ensure_subids(tmp_path, held, [*AUTHOR, f"{H4_UID}:{FIRST}:65536"])
    assert "SUBIDS-OK" in done.stdout, done.stderr
    assert calls == []


def test_ensure_subids_refuses_a_clash_and_changes_neither_file(tmp_path: Path) -> None:
    # The clash is in subgid only; subuid is checked too, but nothing is assigned until both pass.
    done, calls = _ensure_subids(tmp_path, AUTHOR, [*AUTHOR, "other:1100000:65536"])
    assert done.returncode != 0
    assert "SUBIDS-OK" not in done.stdout
    assert "other:1100000:65536" in done.stderr
    assert str(tmp_path / "subgid") in done.stderr
    assert calls == []


def test_ensure_subids_refuses_a_range_of_h4agents_that_overlaps_another(
    tmp_path: Path,
) -> None:
    # An earlier, different range of h4agents' that reaches into the Author's is refused too (H2).
    done, calls = _ensure_subids(tmp_path, [*AUTHOR, "h4agents:150000:65536"], AUTHOR)
    assert done.returncode != 0
    assert "h4reet:100000:65536" in done.stderr
    assert calls == []


# --------------------------------------------------------------------------------------------------
# T046's bring-up on 2026-10-09: who runs it, the plugin's spec file, the decision log's directory, and
# the run's last words
# --------------------------------------------------------------------------------------------------
def _resolve_author(
    tmp_path: Path, sudo_user: str | None
) -> subprocess.CompletedProcess[str]:
    """resolve_author past its root check, with SUDO_USER as given (None: unset)."""
    sudo = (
        "unset SUDO_USER" if sudo_user is None else f"export SUDO_USER={q(sudo_user)}"
    )
    script = f"""
id() {{ if [ "$*" = "-u" ]; then echo 0; else command id "$@"; fi; }}
{sudo}
resolve_author
echo "RESOLVED $author_cert_dir"
"""
    return setup_host(script, tmp_path)


@pytest.mark.parametrize(("sudo_user", "named"), [(None, "unset"), ("root", "root")])
def test_without_the_author_in_sudo_user_it_says_to_run_setup_without_sudo(
    tmp_path: Path, sudo_user: str | None, named: str
) -> None:
    # root is what `sudo engine.sh setup` gives it, engine.sh's own sudo being the second.
    done = _resolve_author(tmp_path, sudo_user)
    assert done.returncode == 1
    assert "RESOLVED" not in done.stdout
    assert f"SUDO_USER is {named}" in done.stderr
    assert "engine.sh setup as yourself, without sudo" in done.stderr


def test_the_author_comes_from_sudo_user(tmp_path: Path) -> None:
    done = _resolve_author(tmp_path, ME)
    assert done.returncode == 0, done.stderr
    assert done.stdout.strip().endswith("/.config/h4reet-ai/agents-engine/docker")


SOCKET = "unix:///run/user/999/docker/plugins/h4-authz.sock"


# runuser, standing in: the command runs as this user, who stands in for h4agents. `command` skips the shell
# functions that stand in for root's own commands, so a test can tell the two apart.
AS_H4AGENTS = 'runuser() { shift 2; [ "$1" = -- ] && shift; command "$@"; }'


# The two rootless spec directories setup writes, in moby's order. With a correct copy in the first alone,
# dockerd 28.3.3 refused to start; with one in each, it started (T046).
SPEC_DIRS = (Path(".config/docker/plugins"), Path(".local/lib/docker/plugins"))


def _plugin_spec(
    tmp_path: Path,
    *,
    before: str | None = None,
    link: bool = False,
    planted: int = 1,
):
    """ensure_plugin_spec into a temporary h4agents home, twice, this user standing in for h4agents. Both
    plugins directories are there, as setup_rootless_docker makes them. `before` is a spec already in
    SPEC_DIRS[planted], mode 0644; `link` puts a link there instead, to a file of its own."""
    home = tmp_path / "home"
    specs = [home / directory / "h4-authz.spec" for directory in SPEC_DIRS]
    for spec in specs:
        spec.parent.mkdir(parents=True)
    victim = tmp_path / "victim"
    target = specs[planted]
    if link:
        victim.write_text("unix:///elsewhere.sock\n", encoding="utf-8")
        target.symlink_to(victim)
    elif before is not None:
        target.write_text(before, encoding="utf-8")
        target.chmod(0o644)
    script = f"""
user={q(ME)}
{AS_H4AGENTS}
log() {{ printf 'log: %s\\n' "$*"; }}
ensure_plugin_spec {q(home)} /run/user/999
echo FIRST-DONE
ensure_plugin_spec {q(home)} /run/user/999
echo SECOND-DONE
"""
    done = setup_host(script, tmp_path)
    return done, specs, victim


def test_plugin_spec_names_the_socket_by_path_in_both_directories(
    tmp_path: Path,
) -> None:
    # With only the first, as setup wrote it at first, dockerd 28.3.3 refused to start again (2026-10-09).
    done, specs, _ = _plugin_spec(tmp_path)
    assert "SECOND-DONE" in done.stdout, done.stderr
    for spec in specs:
        assert spec.read_text(encoding="utf-8") == SOCKET + "\n"
        info = spec.stat()
        assert stat.S_IMODE(info.st_mode) == 0o644
        assert info.st_uid == os.getuid()


def test_plugin_spec_write_is_idempotent(tmp_path: Path) -> None:
    done, _, _ = _plugin_spec(tmp_path)
    first, second = done.stdout.split("FIRST-DONE")
    assert first.count("h4-authz.spec") == 2  # the first run writes both and says so
    assert "log:" not in second  # the second finds them right and changes nothing


@pytest.mark.parametrize("planted", range(len(SPEC_DIRS)))
def test_plugin_spec_replaces_an_empty_one(tmp_path: Path, planted: int) -> None:
    # An empty spec, as a wrapped command left on 2026-10-09, reads as "legacy plugin: Unknown protocol".
    done, specs, _ = _plugin_spec(tmp_path, before="", planted=planted)
    assert "SECOND-DONE" in done.stdout, done.stderr
    assert specs[planted].read_text(encoding="utf-8") == SOCKET + "\n"


@pytest.mark.parametrize("planted", range(len(SPEC_DIRS)))
def test_plugin_spec_replaces_a_link_rather_than_writing_through_it(
    tmp_path: Path, planted: int
) -> None:
    done, specs, victim = _plugin_spec(tmp_path, link=True, planted=planted)
    assert "SECOND-DONE" in done.stdout, done.stderr
    assert victim.read_text(encoding="utf-8") == "unix:///elsewhere.sock\n"
    assert not specs[planted].is_symlink()
    assert specs[planted].read_text(encoding="utf-8") == SOCKET + "\n"


def test_h4agents_owns_the_decision_logs_directory(tmp_path: Path) -> None:
    # The plugin writes and rotates its log there as h4agents; under root its writes failed (§3.5).
    calls = tmp_path / "calls"
    script = f"""
install() {{ printf 'install %s\\n' "$*" >>{q(calls)}; }}
ensure_dirs
echo DIRS-OK
"""
    done = setup_host(script, tmp_path)
    assert "DIRS-OK" in done.stdout, done.stderr
    lines = calls.read_text(encoding="utf-8").splitlines()
    assert "install -d -o h4agents -g h4agents -m 0750 /var/log/h4agents" in lines
    assert [line for line in lines if "/var/log/h4agents" in line] == [
        "install -d -o h4agents -g h4agents -m 0750 /var/log/h4agents"
    ]


def test_setup_writes_into_h4agents_home_only_as_h4agents(tmp_path: Path) -> None:
    # h4agents can make any directory in its home a link; root following one could chown or write anywhere,
    # /usr/local/lib/h4agents included (H13; the review of T046's bring-up, 2026-10-09).
    home = tmp_path / "home"
    unit_dir = home / ".config" / "systemd" / "user"
    unit_dir.mkdir(parents=True)
    (unit_dir / "docker.service").write_text(
        "", encoding="utf-8"
    )  # the rootless install is done
    calls = tmp_path / "calls"
    script = f"""
user={q(ME)}
h4_home={q(home)}
id() {{ if [ "$*" = "-u {ME}" ]; then echo 999; else command id "$@"; fi; }}
runuser() {{ shift 2; [ "$1" = -- ] && shift; printf 'as-h4agents %s\\n' "$*" >>{q(calls)}; command "$@"; }}
install() {{ printf 'as-root install %s\\n' "$*" >>{q(calls)}; command install "$@"; }}
log() {{ :; }}
setup_rootless_docker
echo DONE
"""
    done = setup_host(script, tmp_path)
    assert "DONE" in done.stdout, done.stderr
    lines = calls.read_text(encoding="utf-8").splitlines()
    assert [line for line in lines if line.startswith("as-root")] == []
    here = SETUP.parent
    docker = home / ".config" / "docker"
    assert (docker / "daemon.json").read_bytes() == (here / "daemon.json").read_bytes()
    for directory in SPEC_DIRS:
        spec = home / directory / "h4-authz.spec"
        assert spec.read_text(encoding="utf-8") == SOCKET + "\n"
        assert stat.S_IMODE(spec.parent.stat().st_mode) == 0o700
    assert (unit_dir / "h4-authz.service").read_bytes() == (
        here / "systemd" / "h4-authz.service"
    ).read_bytes()
    override = unit_dir / "docker.service.d" / "override.conf"
    assert (
        override.read_bytes()
        == (here / "systemd" / "docker.service.d" / "override.conf").read_bytes()
    )
    assert stat.S_IMODE((docker / "plugins").stat().st_mode) == 0o700


def test_the_api_publish_names_its_child_address() -> None:
    # Without one, RootlessKit dialed 198.18.0.1 inside its namespace, and the firewall dropped it (T046).
    conf = SETUP.parent / "systemd" / "docker.service.d" / "override.conf"
    flags = [
        line
        for line in conf.read_text(encoding="utf-8").splitlines()
        if line.startswith('Environment="DOCKERD_ROOTLESS_ROOTLESSKIT_FLAGS=')
    ]
    publish = "--publish 198.18.0.1:2376:127.0.0.1:2376/tcp"
    assert flags == [f'Environment="DOCKERD_ROOTLESS_ROOTLESSKIT_FLAGS={publish}"']


def _restart(
    tmp_path: Path, steps: str, *, boot: str = "boot-a"
) -> subprocess.CompletedProcess[str]:
    """Run `steps` with the restart marker and the boot's ID in a temporary directory."""
    (tmp_path / "boot_id").write_text(boot + "\n", encoding="utf-8")
    script = f"""
restart_marker={q(tmp_path / "etc" / "wsl-restart-pending")}
boot_id_file={q(tmp_path / "boot_id")}
install() {{ command install -d -m 0755 "${{@: -1}}"; }}
{steps}
"""
    return setup_host(script, tmp_path)


def test_a_change_that_needs_a_shutdown_is_asked_for_until_one_comes(
    tmp_path: Path,
) -> None:
    # The first run notes it; a re-run before the shutdown asks for it too, though it changed nothing itself.
    noted = _restart(tmp_path, 'note_restart "the Author\'s membership of h4gpu"')
    assert noted.returncode == 0, noted.stderr
    again = _restart(tmp_path, "next_steps")
    assert "    wsl --shutdown\n" in again.stdout
    assert "needed for the Author's membership of h4gpu to take effect" in again.stdout
    after = _restart(
        tmp_path, "next_steps", boot="boot-b"
    )  # a new boot: the shutdown came
    assert "    wsl --shutdown\n" not in after.stdout
    assert "No wsl --shutdown is needed" in after.stdout
    assert "    deploy/agents-engine/engine.sh down\n" in after.stdout
    assert not (tmp_path / "etc" / "wsl-restart-pending").exists()


def test_the_reasons_are_each_named_once(tmp_path: Path) -> None:
    steps = """
note_restart "the Author's membership of h4gpu"
note_restart "/etc/wsl.conf's automount change"
note_restart "the Author's membership of h4gpu"
pending_restart
"""
    done = _restart(tmp_path, steps)
    assert done.returncode == 0, done.stderr
    assert done.stdout.strip() == (
        "the Author's membership of h4gpu, and /etc/wsl.conf's automount change"
    )


def test_nothing_noted_means_no_shutdown(tmp_path: Path) -> None:
    done = _restart(tmp_path, "next_steps")
    assert done.returncode == 0, done.stderr
    assert "No wsl --shutdown is needed" in done.stdout


@pytest.mark.parametrize("held", [True, False])
def test_a_new_gpu_group_membership_notes_a_wsl_shutdown(
    tmp_path: Path, held: bool
) -> None:
    groups = f"{ME} h4gpu" if held else ME
    steps = f"""
author={q(ME)}
getent() {{ return 0; }}
id() {{ if [ "$1" = -nG ]; then echo {q(groups)}; else command id "$@"; fi; }}
usermod() {{ :; }}
log() {{ :; }}
ensure_gpu_group
echo "WHY [$(pending_restart)]"
"""
    done = _restart(tmp_path, steps)
    assert done.returncode == 0, done.stderr
    want = "" if held else f"{ME}'s membership of h4gpu"
    assert f"WHY [{want}]" in done.stdout
