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
