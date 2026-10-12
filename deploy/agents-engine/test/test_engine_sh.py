"""Tests for deploy/agents-engine/engine.sh (spec 000, FR-039; contracts/agents-engine.md §5, §6, §8).

engine.sh runs as the Author, with sudo, Docker, and systemd, none of which the sandbox has. Sourced, it
defines its functions and runs nothing, so these tests call them in bash, with shell functions standing
in for the commands they would run (`docker`, `systemctl`, `df`). Nothing here reaches the host's
Docker, systemd, or network. The environment each bash gets is minimal on purpose: the sandbox's own
variables, its proxy's credentials among them, never reach it or a failure's report.
"""

from __future__ import annotations

import getpass
import grp
import importlib.util
import json
import os
import shlex
import shutil
import subprocess
import sys
import time
from pathlib import Path

import pytest

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
# T046's bring-up on 2026-10-09: setup under sudo, up's reload of h4agents' units, a bounded TLS wait
# --------------------------------------------------------------------------------------------------
def test_setup_refuses_to_run_under_sudo(tmp_path: Path) -> None:
    # setup-host.sh takes the Author from SUDO_USER, which a second sudo sets to root. A sudo of the test's own
    # comes first on PATH, so a guard that regressed runs it, not the real one.
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake = bin_dir / "sudo"
    fake.write_text("#!/bin/sh\necho FAKE-SUDO-RAN\n", encoding="utf-8")
    fake.chmod(0o755)
    script = (
        'id() { if [ "$*" = "-u" ]; then echo 0; else command id "$@"; fi; }\ncmd_setup'
    )
    done = engine(script, tmp_path, PATH=f"{bin_dir}:/usr/local/bin:/usr/bin:/bin")
    assert done.returncode == 1
    assert "FAKE-SUDO-RAN" not in done.stdout
    assert "run setup as yourself, without sudo" in done.stderr


def test_up_reloads_both_user_managers_before_it_starts_their_units(
    tmp_path: Path,
) -> None:
    # A re-run of setup installs new unit files, h4agents' and the Author's proxy's; a start without a reload
    # runs the old ones.
    calls = tmp_path / "calls"
    lib = tmp_path / "lib"
    lib.mkdir()
    (lib / "bind-tree.sh").symlink_to(shutil.which("true") or "/bin/true")
    script = f"""
lib={q(lib)}
check_tree_masks() {{ :; }}
sudo() {{ :; }}
systemctl() {{ printf 'author %s\\n' "$*" >>{q(calls)}; }}
as_h4agents_systemctl() {{ printf 'h4agents %s\\n' "$*" >>{q(calls)}; }}
wait_for_tls() {{ :; }}
chown_state() {{ :; }}
engine_docker() {{ :; }}
cmd_up
"""
    done = engine(script, tmp_path)
    assert done.returncode == 0, done.stderr
    lines = calls.read_text(encoding="utf-8").splitlines()
    h4agents = [line for line in lines if line.startswith("h4agents ")]
    assert h4agents[0] == "h4agents daemon-reload"
    assert "h4agents start h4-authz.service" in h4agents
    assert "h4agents start docker.service" in h4agents
    assert lines.index("author --user daemon-reload") < lines.index(
        "author --user restart h4-egress-proxy.service"
    )


def test_wait_for_tls_takes_only_whole_seconds(tmp_path: Path) -> None:
    # bash evaluates a name inside $(( )), so a value like a[$(cmd)] would run cmd.
    ran = tmp_path / "ran"
    script = f"""
tls_wait='a[$(touch {q(ran)})]'
engine_docker() {{ return 0; }}
wait_for_tls
echo ANSWERED
"""
    done = engine(script, tmp_path)
    assert done.returncode == 1
    assert "tls_wait and tls_try take whole seconds" in done.stderr
    assert not ran.exists()


def _refusals(
    tmp_path: Path, log: str | None, *, password: bool = False
) -> subprocess.CompletedProcess[str]:
    """status_refusals with `log` as the decision log (None: no log), read through a stand-in sudo that runs
    the command as this user, or refuses as sudo -n does when it would ask for a password."""
    path = tmp_path / "authz.jsonl"
    if log is not None:
        path.write_text(log, encoding="utf-8")
    sudo = (
        "sudo() { return 1; }"
        if password
        else 'sudo() { [ "$1" = -n ] && shift; [ "$1" = -u ] && shift 2; "$@"; }'
    )
    return engine(f"H4_AUTHZ_LOG={q(path)}\n{sudo}\nstatus_refusals", tmp_path)


def test_status_lists_the_refusals_it_reads_as_h4agents(tmp_path: Path) -> None:
    log = '{"decision":"allow","rule":"allow"}\n{"decision":"refuse","rule":"A14"}\n'
    done = _refusals(tmp_path, log)
    assert done.returncode == 0, done.stderr
    assert done.stdout.strip() == '{"decision":"refuse","rule":"A14"}'


@pytest.mark.parametrize(
    ("log", "password", "said"),
    [
        ('{"decision":"allow","rule":"allow"}\n', False, "(none)"),
        (None, False, "(no log yet at "),
        ('{"decision":"refuse","rule":"A14"}\n', True, "sudo would ask for a password"),
    ],
)
def test_status_says_why_it_lists_no_refusals(
    tmp_path: Path, log: str | None, password: bool, said: str
) -> None:
    # It once printed nothing at all when the Author couldn't read h4agents' log (§3.5).
    done = _refusals(tmp_path, log, password=password)
    assert done.returncode == 0, done.stderr
    assert said in done.stdout
    assert '"refuse"' not in done.stdout


# systemctl, standing in: it answers with the manager it was asked of and what it was asked, so each state names
# its own unit, or it answers nothing and fails, as when it can't reach a manager.
ECHO_SYSTEMCTL = 'systemctl() { local who=system; if [ "$1" = --user ]; then who=user; shift; fi; echo "$who:$*"; }'
UNITS = ["h4agents-net", "h4agents-nft", "h4agents-dxg", "h4agents-tree"]
NAMED_UNITS = [
    *([f"{unit}.service", f"system:is-active {unit}.service"] for unit in UNITS),
    ["h4-egress-proxy.service", "user:is-active h4-egress-proxy.service"],
]


def test_status_names_each_unit_and_asks_the_proxy_of_the_authors_manager(
    tmp_path: Path,
) -> None:
    # The proxy is the Author's user unit: asked of the system manager, it always read "inactive" (2026-10-09).
    done = engine(f"{ECHO_SYSTEMCTL}\nstatus_units", tmp_path)
    assert done.returncode == 0, done.stderr
    assert [line.split(maxsplit=1) for line in done.stdout.splitlines()] == NAMED_UNITS


def test_status_says_unknown_when_systemctl_cant_answer(tmp_path: Path) -> None:
    done = engine("systemctl() { return 1; }\nstatus_units", tmp_path)
    assert done.returncode == 0, done.stderr
    assert [line.split() for line in done.stdout.splitlines()] == [
        *([f"{unit}.service", "unknown"] for unit in UNITS),
        ["h4-egress-proxy.service", "unknown"],
    ]


def test_the_authors_status_lists_the_units_by_name(tmp_path: Path) -> None:
    # In the Author's terminal (no SANDBOX_RUNTIME), cmd_status itself gives the named list.
    script = f"""
{ECHO_SYSTEMCTL}
engine_docker() {{ :; }}
images_lock={q(tmp_path / "no-images.lock")}
status_gpu() {{ echo "GPU LINE"; }}
status_list_hashes() {{ :; }}
status_refusals() {{ :; }}
cmd_status
"""
    done = engine(script, tmp_path)
    assert done.returncode == 0, done.stderr
    lines = done.stdout.splitlines()
    start = lines.index("-- the engine's system units, and the Author's proxy") + 1
    named = [line.split(maxsplit=1) for line in lines[start : start + len(NAMED_UNITS)]]
    assert named == NAMED_UNITS
    assert lines[:2] == [
        "-- the host's GPU (H6)",
        "GPU LINE",
    ]  # first, the GPU's line (T179)


def test_the_gpu_line_prints_with_the_agents_engine_down(tmp_path: Path) -> None:
    # The line is about the host's rootful engine, so the agents' engine being down mustn't hide it (T179's review).
    script = """
engine_docker() { return 1; }
status_gpu() { echo "GPU LINE"; }
cmd_status
"""
    done = engine(script, tmp_path)
    assert done.returncode == 1
    assert done.stdout.splitlines()[:3] == [
        "-- the host's GPU (H6)",
        "GPU LINE",
        "engine: unreachable (ask the Author: deploy/agents-engine/engine.sh up)",
    ]


@pytest.mark.parametrize(
    ("config", "device", "said"),
    [
        ('[nvidia-container-cli]\nuser = "root:h4gpu"\n', True, "root:h4gpu"),
        ('[nvidia-container-cli]\n#user = "root:video"\n', True, "its default, unset"),
        (
            '[nvidia-container-runtime]\nuser = "x"\n[nvidia-container-cli]\n',
            True,
            "its default, unset",
        ),
        ("", False, "its default, unset"),
    ],
)
def test_status_names_the_gpu_device_and_the_clis_user(
    tmp_path: Path, config: str, device: bool, said: str
) -> None:
    # The host's side of H6: the device's owner and mode, and the user setup-host.sh gave the NVIDIA CLI (T179).
    (tmp_path / "config.toml").write_text(config, encoding="utf-8")
    if device:
        (tmp_path / "dxg").write_text("", encoding="utf-8")
        (tmp_path / "dxg").chmod(0o660)
    script = f"""
dxg={q(tmp_path / "dxg")}
nvidia_config={q(tmp_path / "config.toml")}
status_gpu
"""
    done = engine(script, tmp_path)
    assert done.returncode == 0, done.stderr
    (line,) = done.stdout.splitlines()
    owner = (
        f"{getpass.getuser()}:{grp.getgrgid(os.getgid()).gr_name} 660"
        if device
        else "absent"
    )
    assert line.split()[0] == "/dev/dxg"
    assert line.endswith(f" {owner}; the NVIDIA container CLI runs as {said}")


def _running(pid: str) -> bool:
    """Is the process there and not a zombie waiting to be reaped?"""
    try:
        stat_line = Path(f"/proc/{pid}/stat").read_text(encoding="utf-8")
    except OSError:
        return False
    return stat_line.rpartition(")")[2].split()[0] != "Z"


def _wait_for_tls(
    tmp_path: Path, probe: str
) -> tuple[subprocess.CompletedProcess[str], float]:
    """wait_for_tls with `probe` standing in for docker version: a 3 s wait, each try stopped at 1 s."""
    script = f"""
tls_wait=3
tls_try=1
engine_docker() {{ {probe}; }}
h4_uid() {{ echo 999; }}
wait_for_tls
echo ANSWERED
"""
    start = time.monotonic()
    done = engine(script, tmp_path)
    return done, time.monotonic() - start


def test_wait_for_tls_returns_once_the_engine_answers(tmp_path: Path) -> None:
    done, _ = _wait_for_tls(tmp_path, "return 0")
    assert "ANSWERED" in done.stdout, done.stderr


def test_wait_for_tls_gives_up_on_an_engine_that_refuses(tmp_path: Path) -> None:
    done, took = _wait_for_tls(tmp_path, "return 1")
    assert done.returncode == 1
    assert "did not answer TLS on 198.18.0.1:2376 within 3 s" in done.stderr
    assert took < 20


def test_wait_for_tls_stops_a_try_that_never_returns(tmp_path: Path) -> None:
    # The forward that took the connection and never reached the daemon: docker version hung for minutes.
    pids = tmp_path / "pids"
    probe = f"sh -c 'echo $$ >>{q(pids)}; exec sleep 300'"
    done, took = _wait_for_tls(tmp_path, probe)
    assert done.returncode == 1
    assert "ANSWERED" not in done.stdout
    assert "did not answer TLS on 198.18.0.1:2376 within 3 s" in done.stderr
    assert "sudo journalctl _UID=999" in done.stderr
    assert took < 20
    started = pids.read_text(encoding="utf-8").split()
    assert started  # at least one try ran
    assert not [pid for pid in started if _running(pid)]  # and none outlives the wait


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


# --------------------------------------------------------------------------------------------------
# up's mask check: each sandbox read deny, in Claude Code's rule syntax, against tree-masks.txt
# (§5 H8, tasks.md T129)
# --------------------------------------------------------------------------------------------------
def _normalized(tmp_path: Path, rows: list[tuple[str, str]], repo: Path) -> dict:
    """read_deny_path for each (kind, entry), with HOME the test's home and `repo` the tree."""
    table = tmp_path / "table.tsv"
    table.write_text("".join(f"{k}\t{e}\n" for k, e in rows), encoding="utf-8")
    script = f"""
while IFS=$'\\t' read -r kind entry; do
	printf '%s\\t%s\\t[%s]\\n' "$kind" "$entry" "$(read_deny_path "$kind" "$entry" {q(repo)} "$HOME")"
done <{q(table)}
"""
    done = engine(script, tmp_path)
    assert done.returncode == 0, done.stderr
    out = {}
    for line in done.stdout.splitlines():
        kind, entry, result = line.split("\t")
        out[(kind, entry)] = result[1:-1]
    return out


def test_read_deny_path_follows_claude_codes_rule_syntax(tmp_path: Path) -> None:
    repo = tmp_path / "work" / "repo"
    rel_repo = str(repo).lstrip("/")
    rows = {
        # Read(...) rules: ./x and x are the project's; a single leading / is the project's too;
        # // is absolute and ~/ is home. A trailing /** or /* goes.
        ("rule", "./secrets/**"): "secrets",
        ("rule", "/corpus/intake/private/**"): "corpus/intake/private",
        ("rule", "secrets/**"): "secrets",
        ("rule", "./secrets/*"): "secrets",
        ("rule", "./secrets/**/*"): "secrets",
        ("rule", "secrets/"): "secrets",
        ("rule", "./deploy/env"): "deploy/env",
        ("rule", ".env*"): ".env*",
        ("rule", "*.env"): "*.env",
        ("rule", "./config/*.key"): "config/*.key",
        ("rule", "~/.aws/**"): "",
        ("rule", "~/.git-credentials"): "",
        ("rule", "//etc/**"): "",
        # A rule's single / is the project's even before an absolute-looking path: it names
        # <tree>/<that path>, which no mask holds, so up refuses it rather than skip it.
        ("rule", f"{repo}/secrets/**"): f"{rel_repo}/secrets",
        # Absolute (//) and home (~/) rules count when they land inside the tree.
        ("rule", f"/{repo}/secrets/**"): "secrets",
        ("rule", f"//{repo}/secrets/**"): "secrets",  # extra slashes collapse
        ("rule", "~/work/repo/secrets/**"): "secrets",
        ("rule", "../elsewhere/**"): "",
        ("rule", "./"): "",  # the tree itself is not a path inside it
        ("rule", "/**"): "",
        # sandbox.filesystem.denyRead: ./x and x are the project's, but / and // are both absolute.
        ("sandbox", "./corpus/intake/private"): "corpus/intake/private",
        ("sandbox", "./deploy/env"): "deploy/env",
        ("sandbox", "secrets"): "secrets",
        ("sandbox", "/mnt/c/Users"): "",
        ("sandbox", "/etc/h4agents/pki"): "",
        ("sandbox", "//etc/h4agents/pki"): "",
        ("sandbox", "~/.config/h4reet-ai"): "",
        ("sandbox", f"{repo}/secrets"): "secrets",
        ("sandbox", f"{repo}/corpus/intake/private/"): "corpus/intake/private",
        ("sandbox", str(repo)): "",
        ("sandbox", "."): "",
    }
    got = _normalized(tmp_path, list(rows), repo)
    assert got == rows


def _check_masks(
    tmp_path: Path,
    masks: list[str],
    *,
    deny_read: list[str] = (),
    read_rules: list[str] = (),
    files: list[str] = (),
    settings_text: str | None = None,
    settings_missing: bool = False,
) -> subprocess.CompletedProcess[str]:
    """Run check_tree_masks on a temporary tree, with these masks installed and these denies."""
    tree = tmp_path / "home" / "tree"
    tree.mkdir(parents=True)
    for rel in files:
        (tree / rel).parent.mkdir(parents=True, exist_ok=True)
        (tree / rel).write_text("x\n", encoding="utf-8")
    here = tmp_path / "here"
    lib = tmp_path / "lib"
    for directory in (here, lib):
        directory.mkdir()
        (directory / "tree-masks.txt").write_text(
            "# masks\n\n" + "".join(f"{m}\n" for m in masks), encoding="utf-8"
        )
    settings = tmp_path / "settings.json"
    if settings_text is None:
        settings_text = json.dumps(
            {
                "permissions": {"deny": [f"Read({r})" for r in read_rules]},
                "sandbox": {"filesystem": {"denyRead": list(deny_read)}},
            }
        )
    settings.write_text(settings_text, encoding="utf-8")
    if settings_missing:
        settings.unlink()
    script = f"""
here={q(here)}
lib={q(lib)}
repo={q(tree)}
H4_EGRESS_SETTINGS={q(settings)}
check_tree_masks
echo MASKS-OK
"""
    return engine(script, tmp_path / "home")


MASKS = ["deploy/env", "corpus/intake/private", "secrets", ".git"]


def test_masks_hold_every_in_tree_deny_of_the_repositorys_own_settings(
    tmp_path: Path,
) -> None:
    masks_file = REPO / "deploy" / "agents-engine" / "tree-masks.txt"
    masks = [
        line.strip()
        for line in masks_file.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    settings = (REPO / ".claude" / "settings.json").read_text(encoding="utf-8")
    done = _check_masks(tmp_path, masks, settings_text=settings)
    assert "MASKS-OK" in done.stdout, done.stderr


def test_masks_skip_the_early_patchs_absolute_and_home_denies(tmp_path: Path) -> None:
    # In denyRead a single leading / is absolute: /mnt/c/Users and /etc/h4agents/pki are the host's
    # paths, not the tree's (docs/merge-requests/2026-10-08-feat-000-foundations-enforcement.patch).
    deny_read = [
        "./corpus/intake/private",
        "./deploy/env",
        "~/.config/h4reet-ai",
        "~/.docker/config.json",
        "~/.npmrc",
        "~/.gnupg",
        "~/.bash_history",
        "/mnt/c/Users",
        "/etc/h4agents/pki",
    ]
    read_rules = [".env*", "*.env", "./secrets/**", "~/.aws/**", "~/.ssh/**"]
    read_rules += ["~/.config/h4reet-ai/**", "/corpus/intake/private/**"]
    done = _check_masks(tmp_path, MASKS, deny_read=deny_read, read_rules=read_rules)
    assert "MASKS-OK" in done.stdout, done.stderr


def test_a_dot_slash_globstar_rule_is_checked(tmp_path: Path) -> None:
    done = _check_masks(tmp_path, [".git"], read_rules=["./secrets/**"])
    assert done.returncode != 0
    assert "read-denies 'secrets' inside the tree" in done.stderr


def test_a_project_relative_slash_rule_is_checked(tmp_path: Path) -> None:
    done = _check_masks(tmp_path, [".git"], read_rules=["/corpus/intake/private/**"])
    assert done.returncode != 0
    assert "read-denies 'corpus/intake/private' inside the tree" in done.stderr


def test_a_trailing_star_rule_is_checked_and_passes_once_masked(tmp_path: Path) -> None:
    refused = _check_masks(tmp_path / "a", [".git"], read_rules=["./secrets/*"])
    assert "read-denies 'secrets' inside the tree" in refused.stderr
    passed = _check_masks(tmp_path / "b", ["secrets"], read_rules=["./secrets/*"])
    assert "MASKS-OK" in passed.stdout, passed.stderr


def test_absolute_and_home_denies_inside_the_tree_are_checked(tmp_path: Path) -> None:
    tree = tmp_path / "a" / "home" / "tree"
    absolute = _check_masks(tmp_path / "a", [".git"], deny_read=[f"{tree}/secrets"])
    assert "read-denies 'secrets' inside the tree" in absolute.stderr
    tree = tmp_path / "b" / "home" / "tree"
    # //<path>: the tree's absolute path starts with its own /, so one more makes the rule's //.
    rule = _check_masks(tmp_path / "b", [".git"], read_rules=[f"/{tree}/secrets/**"])
    assert "read-denies 'secrets' inside the tree" in rule.stderr
    home = _check_masks(tmp_path / "c", [".git"], read_rules=["~/tree/secrets/**"])
    assert "read-denies 'secrets' inside the tree" in home.stderr


def test_a_pattern_no_mask_holds_is_refused(tmp_path: Path) -> None:
    done = _check_masks(tmp_path, MASKS, read_rules=["./config/*.key"])
    assert done.returncode != 0
    assert "./config/*.key" in done.stderr


def test_a_pattern_under_a_mask_passes(tmp_path: Path) -> None:
    done = _check_masks(tmp_path, MASKS, read_rules=["./secrets/**/*.pem"])
    assert "MASKS-OK" in done.stdout, done.stderr


def test_a_deny_above_a_mask_is_not_held_by_it(tmp_path: Path) -> None:
    # Masking corpus/intake/private leaves the rest of corpus/ visible, which a deny on corpus hides.
    done = _check_masks(tmp_path, MASKS, deny_read=["./corpus"])
    assert done.returncode != 0
    assert "read-denies 'corpus' inside the tree" in done.stderr


@pytest.mark.parametrize("settings_text", ["{not json", "[]"])
def test_settings_it_cannot_read_fail_closed(
    tmp_path: Path, settings_text: str
) -> None:
    done = _check_masks(tmp_path, MASKS, settings_text=settings_text)
    assert done.returncode != 0
    assert "MASKS-OK" not in done.stdout
    assert "cannot read the sandbox's read denies" in done.stderr


def test_settings_with_no_denies_pass(tmp_path: Path) -> None:
    done = _check_masks(tmp_path, MASKS, settings_text="{}")
    assert "MASKS-OK" in done.stdout, done.stderr


def test_missing_settings_fail_closed(tmp_path: Path) -> None:
    done = _check_masks(tmp_path, MASKS, settings_text=None, settings_missing=True)
    assert done.returncode != 0
    assert "MASKS-OK" not in done.stdout
    assert "cannot read the sandbox's read denies" in done.stderr


@pytest.mark.parametrize("name", [".env", ".env.local", ".envrc", "deploy/x.env"])
def test_an_env_file_outside_a_mask_is_refused(tmp_path: Path, name: str) -> None:
    # The denied globs are .env* and *.env; the env-file check holds them, whatever the deny's shape.
    done = _check_masks(tmp_path, MASKS, read_rules=[".env*", "*.env"], files=[name])
    assert done.returncode != 0
    assert f"an env file sits outside a masked path: {name}" in done.stderr


def test_env_templates_and_masked_env_files_pass(tmp_path: Path) -> None:
    files = ["x.env.example", ".env.example", "deploy/env/prod.env", "secrets/.env"]
    done = _check_masks(tmp_path, MASKS, read_rules=[".env*", "*.env"], files=files)
    assert "MASKS-OK" in done.stdout, done.stderr


# --------------------------------------------------------------------------------------------------
# seed: the host's image store, then the disk, before any pull (§6.1, §6.2, tasks.md T130)
# --------------------------------------------------------------------------------------------------
GIB = 1024**3
CONTAINERD = '[["driver-type","io.containerd.snapshotter.v1"]]'
OVERLAY2 = (
    '[["Backing Filesystem","extfs"],["Supports d_type","true"],["userxattr","false"]]'
)

# Stand-ins for the host's docker, the engine's, the disk check, and the model copy. Each call goes to
# $CALLS. The host's image store is a directory of files named for the reference, holding its size. The
# engine's is the containerd image store's shape: images by ID (id-<digest>), and names (names: one
# "repository:tag digest" line each), which a load never adds and a tag adds or moves.
SEED_FAKES = r"""
key() { printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '_'; }
# Is the image in this list of names?
listed() { case " $1 " in *" $2 "*) return 0 ;; esac; return 1; }
# A daemon's error on stderr, as docker prints it: ERR_TEXT when the test gives one, else this message.
daemon_error() {
	if [ -n "${ERR_TEXT:-}" ]; then
		printf '%s' "$ERR_TEXT" >&2
	else
		printf 'Error response from daemon: %s\n' "$1" >&2
	fi
	return 1
}
docker() {
	printf 'host %s\n' "$*" >>"$CALLS"
	case "$1" in
	info) [ "$DRIVER_STATUS" != fail ] || return 1; printf '%s\n' "$DRIVER_STATUS" ;;
	image)
		local ref="${!#}"
		[ -f "$STATE/host/$(key "$ref")" ] || return 1
		[ "$3" != --format ] || cat "$STATE/host/$(key "$ref")"
		;;
	pull) cp "$STATE/registry/$(key "$2")" "$STATE/host/$(key "$2")" 2>/dev/null ;;
	save)
		# docker save [--platform <os/arch>] <image>: a tar of every platform the host holds, under the index the pin
		# names, or with --platform of that platform's manifest alone (T063). The tar runs past a pipe's buffer, so a
		# save whose reader stops early dies of SIGPIPE. SAVE_FAIL names images whose save fails before it writes.
		local platform="" name
		shift
		while [ "$#" -gt 1 ]; do
			case "$1" in
			--platform) platform="$2"; shift 2 ;;
			--platform=*) platform="${1#*=}"; shift ;;
			-*) echo "unknown flag: $1" >&2; return 125 ;;
			*) echo "the stand-in saves one image at a time" >&2; return 125 ;;
			esac
		done
		name="${1#registry.example/}"
		name="${name%%:*}"
		if listed "${SAVE_FAIL:-}" "$name"; then daemon_error "content digest ${1##*@}: not found"; return 1; fi
		printf 'tar-of %s%s\n' "$1" "${platform:+ platform=$platform}"
		head -c 1048576 /dev/zero
		;;
	*) return 1 ;;
	esac
}
engine_docker() {
	printf 'engine %s\n' "$*" >>"$CALLS"
	case "$1" in
	version) [ "$ENGINE_UP" = 1 ] ;;
	image)
		# docker image inspect <ref>, as the containerd image store resolves it: repository:tag by that name, and
		# repository:tag@digest by the digest, among the names in that repository, whatever their tag.
		local ref="${!#}" repo name target
		repo="${ref%@*}"
		repo="${repo%:*}"
		while read -r name target; do
			case "$ref" in
			*@*) [ "${name%:*}" = "$repo" ] && [ "$target" = "${ref##*@}" ] && return 0 ;;
			*) [ "$name" = "$ref" ] && return 0 ;;
			esac
		done <"$STATE/engine/names"
		daemon_error "No such image: $ref"
		;;
	load)
		# As the real engine does (T063): a load adds the image under its ID alone, and names nothing. A tar of every
		# platform brings the index, whose digest the pin names; a one-platform tar, that platform's manifest, under its
		# own digest. LOAD_FAIL names images whose load breaks part-way and stops reading, so the save dies of SIGPIPE;
		# LOAD_REFUSE, images the engine refuses once it has read the whole tar; LOAD_SHORT, images whose load stops
		# reading part-way and still says it loaded; MISMATCH, images that arrive under another ID.
		local line ref platform="" name id
		read -r line || { daemon_error "unexpected EOF"; return 1; }
		ref="${line#tar-of }"
		case "$ref" in *" platform="*) platform="${ref#* platform=}" ;; esac
		ref="${ref%% platform=*}"
		name="${ref#registry.example/}"
		name="${name%%:*}"
		if listed "${LOAD_FAIL:-}" "$name"; then daemon_error "unexpected EOF"; return 1; fi
		listed "${LOAD_SHORT:-}" "$name" || cat >/dev/null
		if listed "${LOAD_REFUSE:-}" "$name"; then daemon_error "no space left on device"; return 1; fi
		id="${ref#*@}"
		if [ -n "$platform" ]; then id="sha256:$(printf '%s %s' "$ref" "$platform" | sha256sum | cut -c1-64)"; fi
		if listed "${MISMATCH:-}" "$name"; then id="sha256:$(printf '%064d' 0 | tr 0 f)"; fi
		: >"$STATE/engine/id-$(key "$id")"
		echo "Loaded image ID: $id"
		;;
	tag)
		# docker tag <image ID> <repository:tag>: only an ID the engine holds. The name then points at that image; one
		# that pointed at another image moves, and that image no longer answers to it. UNTAG names images another client
		# untags right after, as an agent session could through the relay.
		local name="${3#registry.example/}"
		name="${name%%:*}"
		[ -f "$STATE/engine/id-$(key "$2")" ] || { daemon_error "No such image: $2"; return 1; }
		awk -v n="$3" '$1 != n' "$STATE/engine/names" >"$STATE/engine/names.new"
		listed "${UNTAG:-}" "$name" || printf '%s %s\n' "$3" "$2" >>"$STATE/engine/names.new"
		mv "$STATE/engine/names.new" "$STATE/engine/names"
		;;
	run)
		[ "$CHOWN_OK" = 1 ] && return 0
		printf 'Unable to find image locally\ndocker: Error response from daemon: refused by h4-authz (A14)\n' >&2
		return 125
		;;
	*) return 1 ;;
	esac
}
disk_check_bytes() {
	printf 'disk %s\n' "$1" >>"$CALLS"
	[ "$DISK_OK" = 1 ] || die "not enough free space to seed: need $1 bytes"
}
seed_model() { printf 'model\n' >>"$CALLS"; }
"""


def _ref(name: str) -> str:
    return f"registry.example/{name}:1.0@sha256:{name[0] * 64}"


# The base:node pin chown_state runs (T145): every seed's lock has it, and the engine already holds it.
BASE_NODE_LINE = (
    f"base:node registry.example/node 24-slim sha256:{'e' * 64} example 2026-10-08"
)
BASE_NODE = f"registry.example/node:24-slim@sha256:{'e' * 64}"


def _store_key(ref: str) -> str:
    return "".join(c if c.isalnum() or c in "._-" else "_" for c in ref)


# The digest an older lock pinned, which the engine may still hold under the same repository:tag.
OLD_DIGEST = "sha256:" + "9" * 64


def _hold(state: Path, ref: str) -> None:
    """The stand-in engine holds `ref`'s image under its ID, named by its repository:tag."""
    repo_tag, _, digest = ref.partition("@")
    (state / "engine" / f"id-{_store_key(digest)}").write_text("", encoding="utf-8")
    with (state / "engine" / "names").open("a", encoding="utf-8") as names:
        names.write(f"{repo_tag} {digest}\n")


def _seed(
    tmp_path: Path,
    *,
    host: dict[str, int | str],
    engine_has: tuple[str, ...] = (),
    stale: tuple[str, ...] = (),
    registry: dict[str, int] | None = None,
    unpinned: tuple[str, ...] = (),
    extra_lines: tuple[str, ...] = (),
    driver_status: str = CONTAINERD,
    disk_ok: bool = True,
    engine_up: bool = True,
    base_node: bool = True,
    chown_ok: bool = True,
    save_fail: tuple[str, ...] = (),
    load_fail: tuple[str, ...] = (),
    load_refuse: tuple[str, ...] = (),
    load_short: tuple[str, ...] = (),
    mismatch: tuple[str, ...] = (),
    untag: tuple[str, ...] = (),
    err_text: str = "",
) -> tuple[subprocess.CompletedProcess[str], list[str]]:
    """Run cmd_seed with the stand-ins. `host` and `registry` map image names to their host-side size.
    `stale` names images the engine holds under their repository:tag at OLD_DIGEST. The fault lists name
    the images whose step fails, as SEED_FAKES says; `err_text` replaces every daemon error's message."""
    names = sorted(set(host) | set(engine_has) | set(registry or {}))
    lock = tmp_path / "images.lock"
    lines = ["# service repository tag digest registry checked"]
    lines += [
        f"{n} registry.example/{n} 1.0 sha256:{n[0] * 64} example 2026-10-08"
        for n in names
    ]
    lines += [f"{n} registry.example/{n} 1.0 - example -" for n in unpinned]
    lines += extra_lines
    if base_node:
        lines.append(BASE_NODE_LINE)
    lock.write_text("\n".join(lines) + "\n", encoding="utf-8")
    state = tmp_path / "state"
    for store in ("host", "engine", "registry"):
        (state / store).mkdir(parents=True)
    (state / "engine" / "names").write_text("", encoding="utf-8")
    (tmp_path / "tmp").mkdir()
    key = "".join

    def path(store: str, name: str) -> Path:
        ref = _ref(name)
        safe = key(c if c.isalnum() or c in "._-" else "_" for c in ref)
        return state / store / safe

    for name, size in host.items():
        path("host", name).write_text(f"{size}\n", encoding="utf-8")
    for name in engine_has:
        _hold(state, _ref(name))
    for name in stale:
        _hold(state, f"registry.example/{name}:1.0@{OLD_DIGEST}")
    if base_node:
        _hold(state, BASE_NODE)
    for name, size in (registry or {}).items():
        path("registry", name).write_text(f"{size}\n", encoding="utf-8")
    calls = tmp_path / "calls.log"
    calls.write_text("", encoding="utf-8")
    script = SEED_FAKES + f"\nimages_lock={q(lock)}\ncmd_seed\n"
    done = engine(
        script,
        tmp_path,
        CALLS=str(calls),
        STATE=str(state),
        TMPDIR=str(tmp_path / "tmp"),
        DRIVER_STATUS=driver_status,
        DISK_OK="1" if disk_ok else "0",
        ENGINE_UP="1" if engine_up else "0",
        CHOWN_OK="1" if chown_ok else "0",
        SAVE_FAIL=" ".join(save_fail),
        LOAD_FAIL=" ".join(load_fail),
        LOAD_REFUSE=" ".join(load_refuse),
        LOAD_SHORT=" ".join(load_short),
        MISMATCH=" ".join(mismatch),
        UNTAG=" ".join(untag),
        ERR_TEXT=err_text,
    )
    return done, calls.read_text(encoding="utf-8").splitlines()


def _row(done: subprocess.CompletedProcess[str], name: str) -> tuple[str, str]:
    """seed's table row for an image, and the line under it."""
    lines = [*done.stdout.splitlines(), ""]
    i = next(
        i
        for i, line in enumerate(lines)
        if line.startswith(f"registry.example/{name}:1.0 ")
    )
    return lines[i].rstrip(), lines[i + 1].strip()


def test_seed_saves_every_platform_and_names_the_image_by_its_pinned_digest(
    tmp_path: Path,
) -> None:
    # T063, 2026-10-09: a --platform save lost the index digest, and the load named nothing, so all 19 failed.
    # The stand-ins do both, so a --platform save would fail the row too, not only the call check.
    done, calls = _seed(tmp_path, host={"alpha": GIB})
    assert done.returncode == 0, done.stderr
    ref = _ref("alpha")
    repo_tag, _, digest = ref.partition("@")
    assert f"host save {ref}" in calls
    assert not [c for c in calls if c.startswith("host save") and "--platform" in c]
    tag = f"engine tag {digest} {repo_tag}"
    assert calls.index(tag) > _first(calls, "engine load")
    row, _ = _row(done, "alpha")
    assert row.endswith("seeded")


def test_seed_says_why_an_image_failed(tmp_path: Path) -> None:
    # The load breaks and stops reading, so the save dies of SIGPIPE: the load is the side that failed.
    done, _ = _seed(tmp_path, host={"alpha": GIB, "bravo": GIB}, load_fail=("bravo",))
    assert done.returncode != 0
    row, why = _row(done, "bravo")
    assert row.endswith("FAILED")
    assert why == "engine load: Error response from daemon: unexpected EOF"
    assert _row(done, "alpha")[0].endswith("seeded")
    assert "1 image(s) failed to seed" in done.stderr


def test_seed_fails_an_image_whose_digest_changed_on_the_way(tmp_path: Path) -> None:
    # The tag names only the pinned digest: a load that brings another ID fails, and never seeds.
    done, _ = _seed(tmp_path, host={"alpha": GIB}, mismatch=("alpha",))
    assert done.returncode != 0
    row, why = _row(done, "alpha")
    assert row.endswith("FAILED")
    assert (
        why
        == f"engine tag: Error response from daemon: No such image: sha256:{'a' * 64}"
    )


@pytest.mark.parametrize(
    ("fault", "said"),
    [
        pytest.param(
            "save_fail",
            "host save: Error response from daemon: content digest "
            f"sha256:{'b' * 64}: not found",
            id="save-fails",
        ),
        pytest.param(
            "load_refuse",
            "engine load: Error response from daemon: no space left on device",
            id="load-refused-at-the-end",
        ),
        pytest.param(
            "load_short", "host save: exit 141, no message", id="load-stops-short"
        ),
        pytest.param(
            "untag",
            f"engine inspect: Error response from daemon: No such image: {_ref('bravo')}",
            id="untagged-before-the-check",
        ),
    ],
)
def test_seed_names_the_side_that_failed(tmp_path: Path, fault: str, said: str) -> None:
    # The save's errors are kept apart from the load's. A save that fails cuts the load's stream short, so the
    # load fails too, with an error that says nothing of why: the save is named. A load that stops reading and
    # still says it loaded leaves the save dead of SIGPIPE: that fails the image too, and names the save.
    done, _ = _seed(tmp_path, host={"alpha": GIB, "bravo": GIB}, **{fault: ("bravo",)})
    assert done.returncode != 0
    row, why = _row(done, "bravo")
    assert row.endswith("FAILED")
    assert why == said
    assert _row(done, "alpha")[0].endswith("seeded")
    assert "1 image(s) failed to seed" in done.stderr


@pytest.mark.parametrize("load_fail", [(), ("bravo",)], ids=["seeds", "dies"])
def test_seed_leaves_no_temporary_files(
    tmp_path: Path, load_fail: tuple[str, ...]
) -> None:
    # The transfer keeps each side's errors in a temporary directory, which goes when seed ends, either way.
    done, _ = _seed(tmp_path, host={"alpha": GIB, "bravo": GIB}, load_fail=load_fail)
    assert (done.returncode == 0) == (not load_fail), done.stderr
    assert not list((tmp_path / "tmp").iterdir())


# A daemon's error over three lines, with ESC (colours, a window title) and CR (a line end, an overwrite) on
# each, and BEL ending the title.
RAW_ERROR = (
    "\x1b[31mfirst: in red\x1b[0m\r\n"
    "second: \rover\x1b]0;a window title\x07written\r\n"
    "\x1b[2K\rError response from daemon: the \x1b[1mlast\x1b[0m line\r\n"
)
# Its last line as seed prints it: printable characters only, so no ESC or CR reaches the terminal.
CLEAN_LAST_LINE = "[2KError response from daemon: the [1mlast[0m line"


@pytest.mark.parametrize(
    ("fault", "side"),
    [
        ("save_fail", "host save"),
        ("load_fail", "engine load"),
        ("mismatch", "engine tag"),
        ("untag", "engine inspect"),
    ],
)
def test_a_failure_line_keeps_no_esc_or_cr_from_any_of_the_tools_lines(
    tmp_path: Path, fault: str, side: str
) -> None:
    # Each side's output, through each way seed reads it: only the last line reaches the terminal, and only its
    # printable characters, whatever the lines before it held.
    done, _ = _seed(
        tmp_path, host={"bravo": GIB}, err_text=RAW_ERROR, **{fault: ("bravo",)}
    )
    assert done.returncode != 0
    _, why = _row(done, "bravo")
    assert why == f"{side}: {CLEAN_LAST_LINE}"
    for out in (done.stdout, done.stderr):
        assert "\x1b" not in out
        assert "\r" not in out
        assert "\x07" not in out
    assert "first:" not in done.stdout
    assert "second:" not in done.stdout


def test_seed_refuses_a_lock_that_gives_one_tag_two_digests(tmp_path: Path) -> None:
    # The tag step names each image by its repository:tag, so the second digest would take the tag from the
    # first, which would then no longer answer to its pin. Refused before anything is counted or moved.
    other = f"alpha-next registry.example/alpha 1.0 {OLD_DIGEST} example 2026-10-08"
    done, calls = _seed(
        tmp_path, host={"alpha": GIB, "bravo": GIB}, extra_lines=(other,)
    )
    assert done.returncode != 0
    assert "registry.example/alpha:1.0" in done.stderr
    assert "more than one digest" in done.stderr
    assert "registry.example/bravo" not in done.stderr
    moved = ("disk", "host pull", "host save", "engine load", "engine tag")
    assert not [c for c in calls if c.startswith(moved)]


def test_seed_moves_one_image_once_when_two_lines_pin_it_alike(tmp_path: Path) -> None:
    # Two services on one image, as gateway-state and langfuse-db share postgres: one pin, not a clash.
    twin = f"alpha-db registry.example/alpha 1.0 sha256:{'a' * 64} example 2026-10-08"
    done, calls = _seed(tmp_path, host={"alpha": GIB}, extra_lines=(twin,))
    assert done.returncode == 0, done.stderr
    assert [c for c in calls if c.startswith("host save")] == [
        f"host save {_ref('alpha')}"
    ]
    assert _row(done, "alpha")[0].endswith("seeded")


def test_the_repositorys_lock_gives_each_tag_one_digest(tmp_path: Path) -> None:
    # The next seed must not refuse the lock as it stands, whose postgres serves two services at one digest.
    script = f"""
images_lock={q(REPO / "deploy" / "images.lock")}
mapfile -t refs < <(seed_image_refs)
echo "refs=${{#refs[@]}}"
seed_tag_clashes "${{refs[@]}}"
"""
    done = engine(script, tmp_path)
    assert done.returncode == 0, done.stderr
    lines = done.stdout.splitlines()
    assert int(lines[0].removeprefix("refs=")) > 1
    assert lines[1:] == []


def test_seed_moves_the_tag_of_an_image_the_engine_holds_at_an_older_pin(
    tmp_path: Path,
) -> None:
    # A re-pin: the engine holds alpha:1.0 at the digest an older lock pinned. That image answers to the tag,
    # not to the pin, so seed counts it as missing and moves the pinned one in, and the tag moves to it.
    done, calls = _seed(tmp_path, host={"alpha": GIB}, stale=("alpha",))
    assert done.returncode == 0, done.stderr
    assert [c for c in calls if c.startswith("disk ")] == [f"disk {GIB + 20 * GIB}"]
    assert _row(done, "alpha")[0].endswith("seeded")
    names = tmp_path / "state" / "engine" / "names"
    held = names.read_text(encoding="utf-8").splitlines()
    assert f"registry.example/alpha:1.0 sha256:{'a' * 64}" in held
    assert f"registry.example/alpha:1.0 {OLD_DIGEST}" not in held


def _stand_ins(tmp_path: Path, script: str) -> subprocess.CompletedProcess[str]:
    """`script` against the stand-ins alone, with an empty engine."""
    state = tmp_path / "state"
    (state / "engine").mkdir(parents=True)
    (state / "engine" / "names").write_text("", encoding="utf-8")
    calls = tmp_path / "calls.log"
    return engine(SEED_FAKES + script, tmp_path, CALLS=str(calls), STATE=str(state))


def test_the_stand_in_engine_gets_another_id_from_a_one_platform_save(
    tmp_path: Path,
) -> None:
    # As the real engine did at T063: a --platform save brings that platform's manifest alone, under its own
    # ID, so the pinned digest can't be tagged. A save of every platform keeps it.
    ref = _ref("alpha")
    repo_tag, _, digest = ref.partition("@")
    script = f"""
docker save --platform linux/amd64 {q(ref)} | engine_docker load
engine_docker tag {q(digest)} {q(repo_tag)} || echo ONE-PLATFORM-UNTAGGED
docker save {q(ref)} | engine_docker load
engine_docker tag {q(digest)} {q(repo_tag)} && echo ALL-PLATFORMS-TAGGED
"""
    done = _stand_ins(tmp_path, script)
    assert done.returncode == 0, done.stderr
    loaded = [line for line in done.stdout.splitlines() if line.startswith("Loaded")]
    assert len(loaded) == 2
    assert loaded[0] != f"Loaded image ID: {digest}"
    assert loaded[1] == f"Loaded image ID: {digest}"
    assert "ONE-PLATFORM-UNTAGGED" in done.stdout
    assert f"No such image: {digest}" in done.stderr
    assert "ALL-PLATFORMS-TAGGED" in done.stdout


def test_the_stand_in_engine_moves_a_tag_as_the_real_one_does(tmp_path: Path) -> None:
    # A tag names one image: tagging another with it takes the name from the first, which then no longer
    # answers to repository:tag@its digest.
    first = _ref("alpha")
    second = f"registry.example/alpha:1.0@{OLD_DIGEST}"
    script = f"""
for ref in {q(first)} {q(second)}; do docker save "$ref" | engine_docker load >/dev/null; done
engine_docker tag {q(first.partition("@")[2])} registry.example/alpha:1.0
engine_docker image inspect {q(first)} && echo FIRST-ANSWERS
engine_docker tag {q(OLD_DIGEST)} registry.example/alpha:1.0
engine_docker image inspect {q(second)} && echo SECOND-ANSWERS
engine_docker image inspect {q(first)} || echo FIRST-NO-LONGER-ANSWERS
"""
    done = _stand_ins(tmp_path, script)
    assert done.returncode == 0, done.stderr
    assert done.stdout.split() == [
        "FIRST-ANSWERS",
        "SECOND-ANSWERS",
        "FIRST-NO-LONGER-ANSWERS",
    ]
    assert f"No such image: {first}" in done.stderr


def _first(calls: list[str], prefix: str) -> int:
    return next((i for i, c in enumerate(calls) if c.startswith(prefix)), len(calls))


def test_seed_refuses_without_the_containerd_image_store(tmp_path: Path) -> None:
    done, calls = _seed(tmp_path, host={"alpha": GIB}, driver_status=OVERLAY2)
    assert done.returncode != 0
    assert "containerd image store" in done.stderr
    assert "§6.1" in done.stderr
    # Refused before it looks at anything else: no disk check, no pull, nothing moved.
    assert not [
        c
        for c in calls
        if c.startswith(("disk", "host pull", "host save", "engine load"))
    ]


def test_seed_refuses_when_docker_info_fails(tmp_path: Path) -> None:
    done, calls = _seed(tmp_path, host={"alpha": GIB}, driver_status="fail")
    assert done.returncode != 0
    assert "containerd image store" in done.stderr
    assert not [c for c in calls if c.startswith(("disk", "host pull"))]


def test_seed_checks_the_disk_before_any_pull_and_counts_only_what_the_engine_lacks(
    tmp_path: Path,
) -> None:
    # alpha is on both; bravo is on the host only; charlie is on neither, so the host pulls it.
    done, calls = _seed(
        tmp_path,
        host={"alpha": 1 * GIB, "bravo": 2 * GIB},
        engine_has=("alpha",),
        registry={"charlie": 3 * GIB},
    )
    assert done.returncode == 0, done.stderr
    disks = [int(c.split()[1]) for c in calls if c.startswith("disk ")]
    # Before the pull: bravo's size, 12 GB for what must be pulled first, the 20 GB margin. Not alpha.
    assert disks[0] == 2 * GIB + 12 * GIB + 20 * GIB
    assert _first(calls, "disk ") < _first(calls, "host pull")
    # After it, before any load: the real sizes of bravo and charlie, and the margin.
    assert disks[1:] == [2 * GIB + 3 * GIB + 20 * GIB]
    assert (
        _first(calls, "host pull")
        < calls.index(f"disk {disks[1]}")
        < _first(calls, "engine load")
    )
    assert [c for c in calls if c.startswith("host pull")] == [
        f"host pull {_ref('charlie')}"
    ]
    table = done.stdout
    assert "registry.example/alpha:1.0" in table and "present" in table
    assert table.count("seeded") == 2
    assert "FAILED" not in table


def test_seed_with_nothing_to_pull_checks_the_disk_once(tmp_path: Path) -> None:
    done, calls = _seed(
        tmp_path, host={"alpha": 1 * GIB, "bravo": 2 * GIB}, engine_has=("alpha",)
    )
    assert done.returncode == 0, done.stderr
    assert [c for c in calls if c.startswith("disk ")] == [f"disk {2 * GIB + 20 * GIB}"]
    assert not [c for c in calls if c.startswith("host pull")]


def test_seed_with_the_engine_complete_needs_only_the_margin(tmp_path: Path) -> None:
    done, calls = _seed(tmp_path, host={"alpha": GIB}, engine_has=("alpha",))
    assert done.returncode == 0, done.stderr
    assert [c for c in calls if c.startswith("disk ")] == [f"disk {20 * GIB}"]


def test_seed_short_of_disk_pulls_nothing(tmp_path: Path) -> None:
    done, calls = _seed(
        tmp_path, host={"bravo": GIB}, registry={"charlie": GIB}, disk_ok=False
    )
    assert done.returncode != 0
    assert "not enough free space" in done.stderr
    assert not [
        c for c in calls if c.startswith(("host pull", "host save", "engine load"))
    ]


def test_seed_refuses_while_the_engine_is_unreachable(tmp_path: Path) -> None:
    # What the engine lacks can't be known without it, so nothing is counted or pulled.
    done, calls = _seed(
        tmp_path, host={"bravo": GIB}, registry={"charlie": GIB}, engine_up=False
    )
    assert done.returncode != 0
    assert "engine.sh" in done.stderr and "up" in done.stderr
    assert not [c for c in calls if c.startswith(("disk", "host pull"))]


def test_seed_fails_closed_on_a_size_it_cannot_read(tmp_path: Path) -> None:
    done, calls = _seed(tmp_path, host={"bravo": "unknown"})
    assert done.returncode != 0
    assert "size" in done.stderr
    assert not [c for c in calls if c.startswith(("disk", "host pull"))]


def _disk(
    tmp_path: Path, need: int, win: str, ext4: str
) -> subprocess.CompletedProcess[str]:
    """disk_check_bytes with a stand-in df: `win` for the Windows drive, `ext4` for /, in bytes."""
    script = f"""
devcpu_vars={q(tmp_path / "absent.vars")}
df() {{
	case "${{!#}}" in
	/mnt/c) printf 'Avail\\n%s\\n' "$WIN" ;;
	/) printf 'Avail\\n%s\\n' "$EXT4" ;;
	*) return 1 ;;
	esac
}}
disk_check_bytes {need}
echo DISK-OK
"""
    return engine(script, tmp_path, WIN=win, EXT4=ext4)


def test_disk_check_passes_with_room_on_both(tmp_path: Path) -> None:
    done = _disk(tmp_path, 30 * GIB, str(100 * GIB), str(100 * GIB))
    assert "DISK-OK" in done.stdout, done.stderr
    assert "need 30 GiB; Windows /mnt/c has 100 GiB; ext4 / has 100 GiB" in done.stdout


def test_disk_check_refuses_short_on_either_and_names_both_figures(
    tmp_path: Path,
) -> None:
    done = _disk(tmp_path, 30 * GIB, str(10 * GIB), str(100 * GIB))
    assert done.returncode != 0
    assert "Windows /mnt/c has 10 GiB; ext4 / has 100 GiB" in done.stdout
    assert "not enough free space to seed" in done.stderr


def test_disk_check_fails_closed_without_ext4s_figure(tmp_path: Path) -> None:
    done = _disk(tmp_path, 30 * GIB, str(100 * GIB), "")
    assert done.returncode != 0
    assert "DISK-OK" not in done.stdout
    assert "cannot read free space on ext4" in done.stderr


def test_seed_keeps_its_note_for_unpinned_entries(tmp_path: Path) -> None:
    done, _ = _seed(tmp_path, host={"alpha": GIB}, unpinned=("seaweedfs",))
    assert done.returncode == 0, done.stderr
    assert "note: not seeded, no digest yet: seaweedfs" in done.stdout


# --------------------------------------------------------------------------------------------------
# dev-cpu's state directory, through the engine (plan §10, tasks.md T145 and its review)
# --------------------------------------------------------------------------------------------------
CHOWN_RUN = (
    "engine run --rm --pull never -v /var/lib/h4agents/state:/s "
    f"{BASE_NODE} sh -c mkdir -p /s/dev-cpu/gateway && chown -R 1000:1000 /s/dev-cpu"
)


def test_seed_makes_dev_cpus_state_directory_after_the_images(tmp_path: Path) -> None:
    done, calls = _seed(tmp_path, host={"alpha": GIB})
    assert done.returncode == 0, done.stderr
    # From the pinned base:node, never pulled, with the state root bound, after every load.
    assert [c for c in calls if c.startswith("engine run")] == [CHOWN_RUN]
    assert calls.index(CHOWN_RUN) > _first(calls, "engine load")
    assert (
        "== dev-cpu's state directory: /var/lib/h4agents/state/dev-cpu/gateway"
        in done.stdout
    )
    assert done.stdout.rstrip().endswith("== seed complete")


def test_seed_fails_loudly_without_a_pinned_base_node(tmp_path: Path) -> None:
    done, calls = _seed(tmp_path, host={"alpha": GIB}, base_node=False)
    assert done.returncode != 0
    assert "no single base:node line pinned by digest" in done.stderr
    assert "seed complete" not in done.stdout
    assert not [c for c in calls if c.startswith("engine run")]


def test_seed_fails_loudly_and_says_why_when_the_directory_cant_be_made(
    tmp_path: Path,
) -> None:
    done, _ = _seed(tmp_path, host={"alpha": GIB}, chown_ok=False)
    assert done.returncode != 0
    # The engine's own last line, not a guess.
    assert (
        "could not make dev-cpu's state directory: "
        "docker: Error response from daemon: refused by h4-authz (A14)"
    ) in done.stderr
    assert "seed complete" not in done.stdout


def _chown_at_up(
    tmp_path: Path, lines: list[str], *, chown_ok: bool = True, **env: str
) -> tuple[subprocess.CompletedProcess[str], list[str]]:
    lock = tmp_path / "images.lock"
    lock.write_text("\n".join(lines) + "\n", encoding="utf-8")
    calls = tmp_path / "calls.log"
    calls.write_text("", encoding="utf-8")
    script = SEED_FAKES + f"\nimages_lock={q(lock)}\nchown_state up\necho UP-GOES-ON\n"
    done = engine(
        script,
        tmp_path,
        CALLS=str(calls),
        STATE=str(tmp_path),
        CHOWN_OK="1" if chown_ok else "0",
        **env,
    )
    return done, calls.read_text(encoding="utf-8").splitlines()


def test_no_variable_in_the_shell_chooses_the_image(tmp_path: Path) -> None:
    # The image that runs with the state root bound comes from images.lock alone (T145's review).
    done, calls = _chown_at_up(
        tmp_path, [BASE_NODE_LINE], H4_STATE_CHOWN_IMAGE="registry.example/other:latest"
    )
    assert done.returncode == 0, done.stderr
    assert calls == [CHOWN_RUN]


def test_up_notes_a_missing_base_node_and_goes_on(tmp_path: Path) -> None:
    # At up the image may not be seeded yet: a note, and up continues.
    done, calls = _chown_at_up(
        tmp_path, ["# service repository tag digest registry checked"]
    )
    assert done.returncode == 0, done.stderr
    assert "note: no pinned base:node" in done.stdout
    assert "UP-GOES-ON" in done.stdout
    assert not calls


def test_up_notes_why_the_directory_waits_and_goes_on(tmp_path: Path) -> None:
    done, calls = _chown_at_up(tmp_path, [BASE_NODE_LINE], chown_ok=False)
    assert done.returncode == 0, done.stderr
    assert calls == [CHOWN_RUN]
    assert "note: dev-cpu's state directory waits for:" in done.stdout
    assert "refused by h4-authz (A14)" in done.stdout
    assert "UP-GOES-ON" in done.stdout


DIGEST = "sha256:" + "a" * 64


def _pinned(tmp_path: Path, lines: list[str]) -> subprocess.CompletedProcess[str]:
    lock = tmp_path / "images.lock"
    lock.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return engine(f"images_lock={q(lock)}\npinned_base_node", tmp_path)


def test_pinned_base_node_reads_the_one_pinned_line(tmp_path: Path) -> None:
    done = _pinned(
        tmp_path,
        [
            "# base:node commented out",
            f"base:python registry.example/python 3.12 {DIGEST} example 2026-10-08",
            f"base:node public.ecr.aws/docker/library/node 24.21.0-trixie-slim {DIGEST} public.ecr.aws 2026-10-08",
        ],
    )
    assert done.returncode == 0, done.stderr
    assert (
        done.stdout
        == f"public.ecr.aws/docker/library/node:24.21.0-trixie-slim@{DIGEST}\n"
    )


@pytest.mark.parametrize(
    "lines",
    [
        pytest.param([], id="none"),
        pytest.param(
            [
                f"base:node registry.example/node 24 {DIGEST} example -",
                f"base:node registry.example/node 25 {DIGEST} example -",
            ],
            id="two",
        ),
        pytest.param(["base:node registry.example/node 24 - example -"], id="open-pin"),
        pytest.param(
            [f"base:node --entrypoint=x 24 {DIGEST} example -"], id="option-repo"
        ),
        pytest.param(
            [f"base:node registry.example/node -rm {DIGEST} example -"], id="option-tag"
        ),
        pytest.param(
            [f"base:node Registry.Example/node 24 {DIGEST} example -"], id="upper-repo"
        ),
        pytest.param(
            [f"base:node registry.example/node {'t' * 129} {DIGEST} example -"],
            id="long-tag",
        ),
        pytest.param(
            ["base:node registry.example/node 24 sha256:abc example -"], id="short"
        ),
        pytest.param(
            [f"base:node registry.example/node 24 {DIGEST}0 example -"], id="long"
        ),
        pytest.param(
            [f"base:node registry.example/node 24 {DIGEST.upper()} example -"],
            id="upper",
        ),
        pytest.param(["base:node registry.example/node"], id="no-fields"),
    ],
)
def test_pinned_base_node_refuses_anything_but_one_line_in_shape(
    tmp_path: Path, lines: list[str]
) -> None:
    done = _pinned(tmp_path, lines)
    assert done.returncode != 0
    assert done.stdout == ""


def test_the_repositorys_lock_pins_base_node(tmp_path: Path) -> None:
    done = _pinned(
        tmp_path,
        (REPO / "deploy" / "images.lock").read_text(encoding="utf-8").splitlines(),
    )
    assert done.returncode == 0, done.stderr
    assert done.stdout.startswith("public.ecr.aws/docker/library/node:")


# --------------------------------------------------------------------------------------------------
# The engine's client: the Author's is pinned, a session's is the relay's (T145's review)
# --------------------------------------------------------------------------------------------------
CLIENT_VARS = (
    "DOCKER_HOST",
    "DOCKER_TLS_VERIFY",
    "DOCKER_CERT_PATH",
    "DOCKER_CONTEXT",
    "HTTPS_PROXY",
    "https_proxy",
    "HTTP_PROXY",
    "http_proxy",
    "ALL_PROXY",
    "all_proxy",
    "NO_PROXY",
    "no_proxy",
)


def _client(
    tmp_path: Path, *, script: str = "engine_docker version", **env: str
) -> dict[str, str]:
    """A client function with a stand-in docker on PATH that names only the client's variables."""
    bindir = tmp_path / "bin"
    bindir.mkdir()
    fake = bindir / "docker"
    fake.write_text(
        "#!/bin/sh\n"
        + "".join(f"printf '{n}=%s\\n' \"${{{n}-<unset>}}\"\n" for n in CLIENT_VARS)
        + "printf 'args=%s\\n' \"$*\"\n",
        encoding="utf-8",
    )
    fake.chmod(0o755)
    done = engine(
        script,
        tmp_path,
        PATH=f"{bindir}:/usr/local/bin:/usr/bin:/bin",
        **env,
    )
    assert done.returncode == 0, done.stderr
    return dict(line.split("=", 1) for line in done.stdout.splitlines())


def test_the_authors_client_is_the_engine_whatever_the_shell_names(
    tmp_path: Path,
) -> None:
    seen = _client(
        tmp_path,
        DOCKER_HOST="unix:///var/run/docker.sock",
        DOCKER_CONTEXT="rootful",
        DOCKER_TLS_VERIFY="",
        DOCKER_CERT_PATH=str(tmp_path / "elsewhere"),
        HTTPS_PROXY="http://proxy.example:3128",
        http_proxy="http://proxy.example:3128",
        NO_PROXY="*",
    )
    assert seen["DOCKER_HOST"] == "tcp://198.18.0.1:2376"
    assert seen["DOCKER_TLS_VERIFY"] == "1"
    assert (
        seen["DOCKER_CERT_PATH"] == f"{tmp_path}/.config/h4reet-ai/agents-engine/docker"
    )
    for name in CLIENT_VARS[3:]:
        assert seen[name] == "<unset>", name
    assert seen["args"] == "version"


def test_the_hosts_client_is_the_hosts_daemon_whatever_the_shell_names(
    tmp_path: Path,
) -> None:
    seen = _client(
        tmp_path,
        script="host_docker version",
        DOCKER_HOST="tcp://198.18.0.1:2376",
        DOCKER_CONTEXT="engine",
        DOCKER_TLS_VERIFY="1",
        DOCKER_CERT_PATH=str(tmp_path / "elsewhere"),
    )
    assert seen["DOCKER_HOST"] == "unix:///var/run/docker.sock"
    for name in ("DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "DOCKER_CONTEXT"):
        assert seen[name] == "<unset>", name
    assert seen["args"] == "version"


def test_a_sessions_client_is_the_relays(tmp_path: Path) -> None:
    seen = _client(
        tmp_path,
        SANDBOX_RUNTIME="1",
        DOCKER_HOST="tcp://relay.example:2375",
        DOCKER_TLS_VERIFY="1",
        DOCKER_CERT_PATH=str(tmp_path / "agents"),
    )
    assert seen["DOCKER_HOST"] == "tcp://relay.example:2375"
    assert seen["DOCKER_CERT_PATH"] == str(tmp_path / "agents")


# --------------------------------------------------------------------------------------------------
# prove writes the report matrix stage E folds, headed with what it proved
# --------------------------------------------------------------------------------------------------
STAND_IN_GIT = """
git() {
  case "$*" in
    *"rev-parse -q --verify HEAD") [ -z "${NO_GIT:-}" ] && echo "$COMMIT" ;;
    *"rev-parse -q --verify HEAD:./") echo "$TREE" ;;
    *"diff --no-ext-diff --no-textconv --quiet HEAD -- .") return "${DIRTY:-0}" ;;
    *) return 9 ;;
  esac
}
"""
COMMIT = "1" * 40
TREE = "2" * 40
ROWS = "ROW   RES  DETAIL\nE1    PASS one\nE2    FAIL two\n"


def _prove(
    tmp_path: Path, *, rc: int = 0, **env: str
) -> tuple[subprocess.CompletedProcess[str], Path]:
    """cmd_prove with stand-ins for git and prove-limits.sh, in a scratch HOME."""
    script = (
        STAND_IN_GIT
        + f"run_prove_limits() {{ printf '%s' {q(ROWS)}; return {rc}; }}\n"
        + 'cmd_prove || echo "rc=$?"'
    )
    done = engine(script, tmp_path, COMMIT=COMMIT, TREE=TREE, **env)
    return done, tmp_path / ".local/state/h4reet/agents-engine/prove-report.txt"


def _header(line: str) -> dict[str, str]:
    tag, *fields = line.split(" ")
    assert tag == "H4-PROVE-REPORT", line
    return dict(field.split("=", 1) for field in fields)


def test_prove_writes_its_report_headed_with_the_commit_and_the_engine_tree(
    tmp_path: Path,
) -> None:
    done, report = _prove(tmp_path, rc=1)
    assert done.returncode == 0, done.stderr
    assert "rc=1" in done.stdout  # prove-limits.sh's status, through tee
    assert ROWS in done.stdout  # the terminal still gets every row
    header, _, body = report.read_text(encoding="utf-8").partition("\n")
    fields = _header(header)
    assert fields["commit"] == COMMIT
    assert fields["engine-tree"] == TREE
    time.strptime(fields["utc"], "%Y-%m-%dT%H:%M:%SZ")
    assert body == ROWS
    assert sorted(p.name for p in report.parent.iterdir()) == [report.name]


def test_prove_marks_an_engine_tree_with_changes_dirty(tmp_path: Path) -> None:
    done, report = _prove(tmp_path, DIRTY="1")
    assert "rc=" not in done.stdout, done.stderr
    fields = _header(report.read_text(encoding="utf-8").splitlines()[0])
    assert fields["engine-tree"] == TREE + "+dirty"


def test_prove_replaces_the_last_report(tmp_path: Path) -> None:
    report = tmp_path / ".local/state/h4reet/agents-engine/prove-report.txt"
    report.parent.mkdir(parents=True)
    report.write_text("an older report\n", encoding="utf-8")
    done, _ = _prove(tmp_path)
    assert done.returncode == 0, done.stderr
    assert "an older report" not in report.read_text(encoding="utf-8")


def test_prove_without_the_commit_writes_no_report(tmp_path: Path) -> None:
    done, report = _prove(tmp_path, NO_GIT="1")
    assert done.returncode == 1
    assert "can't read the commit" in done.stderr
    assert not report.exists()
    assert "PASS" not in done.stdout  # no probe ran


def test_run_prove_limits_runs_the_script_beside_this_one(tmp_path: Path) -> None:
    done = engine("declare -f run_prove_limits", tmp_path)
    assert done.returncode == 0, done.stderr
    assert '"$here/prove-limits.sh"' in done.stdout
