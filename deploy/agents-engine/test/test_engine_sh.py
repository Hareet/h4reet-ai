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
# $CALLS; the image stores are directories of files named for the reference, holding its size.
SEED_FAKES = r"""
key() { printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '_'; }
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
	save) printf 'tar-of %s\n' "${!#}" ;;
	*) return 1 ;;
	esac
}
engine_docker() {
	printf 'engine %s\n' "$*" >>"$CALLS"
	case "$1" in
	version) [ "$ENGINE_UP" = 1 ] ;;
	image) [ -f "$STATE/engine/$(key "${!#}")" ] ;;
	load) local line; read -r line; : >"$STATE/engine/$(key "${line#tar-of }")" ;;
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


def _seed(
    tmp_path: Path,
    *,
    host: dict[str, int | str],
    engine_has: tuple[str, ...] = (),
    registry: dict[str, int] | None = None,
    unpinned: tuple[str, ...] = (),
    driver_status: str = CONTAINERD,
    disk_ok: bool = True,
    engine_up: bool = True,
) -> tuple[subprocess.CompletedProcess[str], list[str]]:
    """Run cmd_seed with the stand-ins. `host` and `registry` map image names to their host-side size."""
    names = sorted(set(host) | set(engine_has) | set(registry or {}))
    lock = tmp_path / "images.lock"
    lines = ["# service repository tag digest registry checked"]
    lines += [
        f"{n} registry.example/{n} 1.0 sha256:{n[0] * 64} example 2026-10-08"
        for n in names
    ]
    lines += [f"{n} registry.example/{n} 1.0 - example -" for n in unpinned]
    lock.write_text("\n".join(lines) + "\n", encoding="utf-8")
    state = tmp_path / "state"
    for store in ("host", "engine", "registry"):
        (state / store).mkdir(parents=True)
    key = "".join

    def path(store: str, name: str) -> Path:
        ref = _ref(name)
        safe = key(c if c.isalnum() or c in "._-" else "_" for c in ref)
        return state / store / safe

    for name, size in host.items():
        path("host", name).write_text(f"{size}\n", encoding="utf-8")
    for name in engine_has:
        path("engine", name).write_text("", encoding="utf-8")
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
        DRIVER_STATUS=driver_status,
        DISK_OK="1" if disk_ok else "0",
        ENGINE_UP="1" if engine_up else "0",
    )
    return done, calls.read_text(encoding="utf-8").splitlines()


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
