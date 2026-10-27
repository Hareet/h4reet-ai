"""Tests for tools/gates/studio_settings_check.py (spec 004 FR-025, SC-013; contracts/intake-amendments.md §5).

Every test builds the studio's folders and each settings scope its session loads in a temporary folder: the managed
files, through the options only tests pass; the user's, under a temporary HOME or CLAUDE_CONFIG_DIR; and the
workspace's, in the temporary workflows folder. No test reads the Author's settings or the studio's folders.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parents[3]
CHECK = REPO / "tools" / "gates" / "studio_settings_check.py"
SPEC = importlib.util.spec_from_file_location("studio_settings_check", CHECK)
assert SPEC and SPEC.loader
ssc = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ssc  # dataclasses look their module up here
SPEC.loader.exec_module(ssc)

PASS_LINE = (
    "studio-settings: PASS: the studio session's settings deny the photos folder and the blinding key, to the file "
    "tools and in the sandbox, and give it no route to a loopback listener"
)
HEX = r"[0-9a-f]{64}"
# What no fixture's output may hold: a command a hook, helper, or server runs, and a host an allowlist names.
COMMAND = "h4-fixture-command"
HOST = "h4-fixture-host.example"
# The floor .devcontainer/toolchain.vars pins (ADR 0023), which the output names.
FLOOR = dict(
    line.split("=", 1)
    for line in (REPO / ".devcontainer" / "toolchain.vars")
    .read_text(encoding="utf-8")
    .splitlines()
    if "=" in line and not line.startswith("#")
)["CLAUDE_CODE_VERSION"]
FLOOR_LINE = f"claude code      floor {FLOOR}, the version whose keys the check knows"
MANAGED_ONLY = {"allowManagedPermissionRulesOnly": True}


def canonical(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


class World:
    """The studio's four folders, the list naming them, and the settings of the passing set, written on run()."""

    def __init__(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        self.tmp = tmp_path
        self.monkeypatch = monkeypatch
        self.studio = tmp_path / "srv" / "studio"
        self.photos = self.studio / "photos"
        self.outputs = self.studio / "outputs"
        self.workflows = self.studio / "workflows"
        self.key = self.studio / "key"
        for folder in (self.photos, self.outputs, self.workflows, self.key):
            folder.mkdir(parents=True)
        self.home = tmp_path / "home"
        self.home.mkdir()
        monkeypatch.setenv("HOME", str(self.home))
        monkeypatch.delenv("CLAUDE_CONFIG_DIR", raising=False)
        self.list = tmp_path / "studio-folders.txt"
        self.lines = {
            "photos": str(self.photos),
            "outputs": str(self.outputs),
            "workflows": str(self.workflows),
            "blinding-key": str(self.key),
        }
        self.etc = tmp_path / "etc" / "claude-code"
        # Windows' managed settings, which Claude Code under WSL reads too, through /mnt/c.
        self.win = tmp_path / "mnt" / "c" / "Program Files" / "ClaudeCode"
        self.toolchain = REPO / ".devcontainer" / "toolchain.vars"
        self.hosts = tmp_path / "hosts"
        self.hosts.write_text(
            "127.0.0.1 localhost\n127.0.1.1 studio-box.localdomain studio-box\n"
            "::1 ip6-localhost ip6-loopback\nfe00::0 ip6-localnet\n192.0.2.7 printer\n"
        )
        # The passing set: the user scope denies both folders in both layers, and the workspace turns the sandbox on.
        self.scopes: dict[str, Any] = {
            "user": {
                "permissions": {"deny": [self.read(self.photos), self.read(self.key)]},
                "sandbox": {
                    "filesystem": {"denyRead": [str(self.photos), str(self.key)]}
                },
            },
            "workspace": {
                "permissions": {"deny": [self.read(self.photos), self.read(self.key)]},
                "sandbox": {
                    "enabled": True,
                    "failIfUnavailable": True,
                    "allowUnsandboxedCommands": False,
                },
            },
        }

    @staticmethod
    def read(folder: Path) -> str:
        return f"Read(/{folder}/**)"

    def path(self, scope: str) -> Path:
        config = Path(os.environ.get("CLAUDE_CONFIG_DIR") or self.home / ".claude")
        return {
            "managed": self.etc / "managed-settings.json",
            "managed.mcp": self.etc / "managed-mcp.json",
            "managed.win": self.win / "managed-settings.json",
            "managed.win.mcp": self.win / "managed-mcp.json",
            "user": config / "settings.json",
            "user.json": Path(os.environ.get("CLAUDE_CONFIG_DIR") or self.home)
            / ".claude.json",
            "workspace": self.workflows / ".claude" / "settings.json",
            "workspace.local": self.workflows / ".claude" / "settings.local.json",
            "workspace.mcp": self.workflows / ".mcp.json",
        }[scope]

    def dropin(self, name: str, data: Any, *, win: bool = False) -> None:
        folder = (self.win if win else self.etc) / "managed-settings.d"
        folder.mkdir(parents=True, exist_ok=True)
        (folder / name).write_text(json.dumps(data))

    def raw(self, scope: str, text: str) -> None:
        """A scope's file holding exactly text, whatever run() would write."""
        self.scopes.pop(scope, None)
        path = self.path(scope)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def run(self, capsys: pytest.CaptureFixture[str]) -> tuple[int, str]:
        self.list.write_text(
            "# the studio's folders\n# writes: denied (spec 004, Amendment C3)\n"
            + "".join(f"{name} {path}\n" for name, path in self.lines.items())
        )
        for scope, data in self.scopes.items():
            path = self.path(scope)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(data, indent=2))
        code = ssc.main(
            [
                "--list",
                str(self.list),
                "--managed",
                str(self.etc / "managed-settings.json"),
                "--managed-dir",
                str(self.etc / "managed-settings.d"),
                "--managed-mcp",
                str(self.etc / "managed-mcp.json"),
                "--win-managed",
                str(self.win / "managed-settings.json"),
                "--win-managed-dir",
                str(self.win / "managed-settings.d"),
                "--win-managed-mcp",
                str(self.win / "managed-mcp.json"),
                "--toolchain",
                str(self.toolchain),
                "--hosts",
                str(self.hosts),
            ]
        )
        out = capsys.readouterr().out
        # Never a path, a command, or a host, whatever the fixture holds (contracts/intake-amendments.md §5).
        for secret in (str(self.tmp), COMMAND, HOST, "studio-box"):
            assert secret not in out, (secret, out)
        return code, out


@pytest.fixture
def world(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> World:
    return World(tmp_path, monkeypatch)


def findings(out: str) -> list[str]:
    return [line for line in out.splitlines() if re.match(r"SS\d+ ", line)]


def failed(code: int, out: str, rule: str, expect: int = 1) -> list[str]:
    assert code == expect, out
    assert re.match(r"studio-settings: FAIL: \d+ findings?$", out.splitlines()[0]), out
    found = [line for line in findings(out) if line.startswith(rule + " ")]
    assert found, out
    return found


# --------------------------------------------------------------------------------------------------
# The passing set, and what the output holds
# --------------------------------------------------------------------------------------------------
def test_a_passing_set_passes_and_prints_folders_scopes_and_hashes(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    world.raw("user.json", json.dumps({"numStartups": 3, "projects": {}}))
    code, out = world.run(capsys)
    assert code == 0, out
    lines = out.splitlines()
    assert lines[0] == PASS_LINE
    user = hashlib.sha256(world.path("user").read_bytes()).hexdigest()
    workspace = hashlib.sha256(world.path("workspace").read_bytes()).hexdigest()
    servers = canonical({"user": None, "workspace": None})
    assert lines[1:] == [
        "photos           Read denied (user, workspace) · sandbox denyRead (user) · not re-allowed",
        "blinding-key     Read denied (user, workspace) · sandbox denyRead (user) · not re-allowed",
        (
            "sandbox          enabled, fails if unavailable (workspace) · unsandboxed commands refused · no "
            "excluded commands · default mode not bypass"
        ),
        (
            "listeners        no hook, MCP server, or helper command beyond the approved list · no plugin · no "
            "loopback host, local binding, local socket, or proxy of its own · WebFetch for no loopback host"
        ),
        FLOOR_LINE,
        "managed          absent",
        "managed.d        absent",
        "managed.mcp      absent",
        "managed.win      absent",
        "managed.win.d    absent",
        "managed.win.mcp  absent",
        f"user             sha256 {user}",
        f"user.mcp         sha256 {servers}",
        f"workspace        sha256 {workspace}",
        "workspace.local  absent",
        "workspace.mcp    absent",
        (
            "note             locations set by options, as the tests set them: this run proves nothing about "
            "the studio's own settings"
        ),
    ]


def test_user_mcp_hashes_the_two_server_lists_never_the_whole_file(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    # Claude Code rewrites .claude.json as it runs, so only the two lists the check reads go into its hash.
    base = {"projects": {str(world.workflows): {"allowedTools": []}}}
    world.raw("user.json", json.dumps({**base, "numStartups": 1}))
    _, first = world.run(capsys)
    world.raw("user.json", json.dumps({**base, "numStartups": 2, "tipsHistory": {}}))
    _, second = world.run(capsys)
    pick = [line for line in first.splitlines() if line.startswith("user.mcp")]
    assert pick and pick == [
        line for line in second.splitlines() if line.startswith("user.mcp")
    ]


def test_the_options_are_the_tests_and_the_authors_run_needs_none() -> None:
    # The Author runs it bare, from main's checkout: the defaults are the managed locations Claude Code reads on
    # Linux and the list beside the check.
    assert ssc.MANAGED_SETTINGS == Path("/etc/claude-code/managed-settings.json")
    assert ssc.MANAGED_DIR == Path("/etc/claude-code/managed-settings.d")
    assert ssc.MANAGED_MCP == Path("/etc/claude-code/managed-mcp.json")
    # Claude Code under WSL reads Windows' managed settings too.
    windows = Path("/mnt/c/Program Files/ClaudeCode")
    assert ssc.WIN_MANAGED_SETTINGS == windows / "managed-settings.json"
    assert ssc.WIN_MANAGED_DIR == windows / "managed-settings.d"
    assert ssc.WIN_MANAGED_MCP == windows / "managed-mcp.json"
    assert ssc.TOOLCHAIN == REPO / ".devcontainer" / "toolchain.vars"
    assert ssc.LIST == CHECK.parent / "studio-folders.txt"
    assert (
        ssc.APPROVED == ()
    )  # empty as the patch writes it; the Author adds entries on main by hand


def test_the_key_list_is_for_the_claude_code_the_repository_pins() -> None:
    pins = dict(
        line.split("=", 1)
        for line in (REPO / ".devcontainer" / "toolchain.vars")
        .read_text(encoding="utf-8")
        .splitlines()
        if "=" in line and not line.startswith("#")
    )
    assert ssc.CLAUDE_CODE == pins["CLAUDE_CODE_VERSION"]


def test_it_runs_as_the_author_runs_it_with_py_hosts_flags(
    world: World, tmp_path: Path
) -> None:
    # The first line and the re-exec guard give it PY_HOST's flags, however it's started.
    assert CHECK.read_text(encoding="utf-8").splitlines()[0] == (
        "#!/usr/bin/env -S python3 -I -B -X pycache_prefix=/dev/null"
    )
    for scope, data in world.scopes.items():
        path = world.path(scope)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data))
    world.list.write_text(
        "".join(f"{name} {path}\n" for name, path in world.lines.items())
    )
    done = subprocess.run(
        [
            sys.executable,
            str(CHECK),
            "--list",
            str(world.list),
            "--managed",
            str(world.etc / "m.json"),
            "--managed-dir",
            str(world.etc / "m.d"),
            "--managed-mcp",
            str(world.etc / "mcp.json"),
            "--win-managed",
            str(world.win / "m.json"),
            "--win-managed-dir",
            str(world.win / "m.d"),
            "--win-managed-mcp",
            str(world.win / "mcp.json"),
            "--hosts",
            str(world.hosts),
        ],
        capture_output=True,
        text=True,
        env={**os.environ, "HOME": str(world.home)},
        check=False,
    )
    assert done.returncode == 0, done.stdout + done.stderr
    assert done.stdout.splitlines()[0] == PASS_LINE
    assert ssc.REEXEC == ["-I", "-B", "-X", "pycache_prefix=/dev/null"]


# --------------------------------------------------------------------------------------------------
# SS1: the folder list
# --------------------------------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"workflows": None}, "the folder list has no workflows line"),
        ({"photos": None}, "the folder list has no photos line"),
        ({"blinding-key": None}, "the folder list has no blinding-key line"),
        (
            {
                "photos": "<STUDIO_" + "PHOTOS>"
            },  # never a placeholder a fill would replace
            "photos: the folder list's line still holds its placeholder",
        ),
        (
            {"blinding-key": "studio/key"},
            "blinding-key: the folder list's path isn't absolute",
        ),
        ({"workflows": "/"}, "workflows: the folder list's path isn't absolute"),
    ],
)
def test_an_unusable_folder_list_cant_be_checked(
    world: World,
    capsys: pytest.CaptureFixture[str],
    change: dict[str, str | None],
    message: str,
) -> None:
    for name, value in change.items():
        if value is None:
            del world.lines[name]
        else:
            world.lines[name] = value
    code, out = world.run(capsys)
    (line,) = failed(code, out, "SS1", expect=2)
    assert line == f"SS1 {message}"


def test_a_missing_folder_list_cant_be_checked(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    code = ssc.main(
        ["--list", str(world.tmp / "nowhere.txt"), "--hosts", str(world.hosts)]
    )
    out = capsys.readouterr().out
    assert (
        code == 2
        and "SS1 the folder list, tools/gates/studio-folders.txt, can't be read" in out
    )
    assert str(world.tmp) not in out


def test_the_outputs_line_isnt_needed_and_a_trailing_slash_is_trimmed(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    del world.lines["outputs"]
    world.lines["photos"] = str(world.photos) + "/"
    code, out = world.run(capsys)
    assert code == 0, out


# --------------------------------------------------------------------------------------------------
# SS2: strict JSON objects
# --------------------------------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("scope", "text", "why"),
    [
        ("user", '{"model": "a", "model": "b"}', "a duplicate key"),
        ("workspace", '{"cleanupPeriodDays": NaN}', "NaN or Infinity"),
        ("workspace.local", '{"cleanupPeriodDays": -Infinity}', "NaN or Infinity"),
        ("user", "[]", "isn't a JSON object"),
        ("user", '{"permissions": ', "a syntax error at line 1"),
        ("workspace.mcp", '{"mcpServers": {"a": {}, "a": {}}}', "a duplicate key"),
        ("user.json", "[1]", "isn't a JSON object"),
        ("managed.mcp", '{"mcpServers": []}', "mcpServers isn't an object"),
        (
            "user",
            '{"permissions": {"deny": "Read(//x/**)"}}',
            "permissions.deny isn't a list of strings",
        ),
        (
            "user",
            '{"hooks": {"PreToolUse": {"hooks": []}}}',
            "hooks isn't shaped as Claude Code reads it",
        ),
        ("user", '{"enabledPlugins": ["a@b"]}', "enabledPlugins isn't an object"),
    ],
)
def test_a_file_that_isnt_a_strict_json_object_cant_be_checked(
    world: World, capsys: pytest.CaptureFixture[str], scope: str, text: str, why: str
) -> None:
    world.raw(scope, text)
    code, out = world.run(capsys)
    (line,) = failed(code, out, "SS2", expect=2)
    shown = {"user.json": "user.mcp"}.get(scope, scope)
    assert line.startswith(f"SS2 {shown}: ") and why in line


# --------------------------------------------------------------------------------------------------
# SS3 and SS4: the photos folder and the key, denied to the file tools and in the sandbox
# --------------------------------------------------------------------------------------------------
def test_a_folder_no_scope_read_denies_fails(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    for scope in ("user", "workspace"):
        world.scopes[scope]["permissions"]["deny"] = [world.read(world.key)]
    code, out = world.run(capsys)
    assert failed(code, out, "SS3") == [
        "SS3 photos: no scope's permissions.deny holds Read(//…/**) for it or for a folder above it"
    ]


def test_a_read_deny_of_a_folder_above_counts_and_another_form_doesnt(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    for scope in ("user", "workspace"):
        world.scopes[scope]["permissions"]["deny"] = [
            world.read(world.studio),
            f"Read(/{world.key})",
        ]
    code, out = world.run(capsys)
    assert code == 0, out
    for scope in ("user", "workspace"):
        world.scopes[scope]["permissions"]["deny"] = [
            world.read(world.photos),
            f"Read({world.key}/**)",
        ]
    code, out = world.run(capsys)
    assert failed(code, out, "SS3") == [
        "SS3 blinding-key: no scope's permissions.deny holds Read(//…/**) for it or for a folder above it"
    ]


@pytest.mark.parametrize(
    ("sandbox", "message"),
    [
        ({"enabled": False}, "SS4 sandbox: the effective sandbox.enabled isn't true"),
        ({"enabled": None}, "SS4 sandbox: the effective sandbox.enabled isn't true"),
        (
            {"failIfUnavailable": None},
            "SS4 sandbox: the effective sandbox.failIfUnavailable isn't true",
        ),
        (
            {"enableWeakerNestedSandbox": True},
            "SS4 sandbox: the effective sandbox.enableWeakerNestedSandbox is true",
        ),
    ],
)
def test_the_sandbox_must_be_on_and_whole(
    world: World,
    capsys: pytest.CaptureFixture[str],
    sandbox: dict[str, Any],
    message: str,
) -> None:
    for key, value in sandbox.items():
        if value is None:
            del world.scopes["workspace"]["sandbox"][key]
        else:
            world.scopes["workspace"]["sandbox"][key] = value
    code, out = world.run(capsys)
    assert failed(code, out, "SS4") == [message]


def test_a_folder_no_scope_hides_in_the_sandbox_fails_and_a_folder_above_counts(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    world.scopes["user"]["sandbox"]["filesystem"]["denyRead"] = [str(world.photos)]
    code, out = world.run(capsys)
    assert failed(code, out, "SS4") == [
        "SS4 blinding-key: no scope's sandbox.filesystem.denyRead holds it or a folder above it"
    ]
    world.scopes["user"]["sandbox"]["filesystem"]["denyRead"] = [
        str(world.studio) + "/"
    ]
    code, out = world.run(capsys)
    assert code == 0, out


def test_a_home_relative_deny_counts(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    keys = world.home / "keys"
    keys.mkdir()
    world.lines["blinding-key"] = str(keys)
    world.scopes["user"] = {
        "permissions": {"deny": [world.read(world.photos), world.read(keys)]},
        "sandbox": {"filesystem": {"denyRead": [str(world.photos), "~/keys"]}},
    }
    code, out = world.run(capsys)
    assert code == 0, out


# --------------------------------------------------------------------------------------------------
# SS5: a re-allow, in each of its four forms
# --------------------------------------------------------------------------------------------------
def test_an_allow_rule_naming_a_path_at_or_under_a_folder_fails(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    world.scopes["user"]["permissions"]["allow"] = [f"Read(/{world.photos}/raw/**)"]
    code, out = world.run(capsys)
    assert failed(code, out, "SS5") == [
        "SS5 photos: a permissions.allow rule in user names a path at or under it"
    ]
    world.scopes["user"]["permissions"]["allow"] = [f"Bash(cat {world.key}/key.csv)"]
    code, out = world.run(capsys)
    assert failed(code, out, "SS5") == [
        "SS5 blinding-key: a permissions.allow rule in user names a path at or under it"
    ]


def test_allow_rules_elsewhere_pass(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    world.scopes["user"]["permissions"]["allow"] = [
        f"Read(/{world.outputs}/**)",
        f"Edit(/{world.workflows}/**)",
        "Bash(git status:*)",
        f"Bash(ls {world.studio})",
        "WebFetch(domain:example.com)",
    ]
    code, out = world.run(capsys)
    assert code == 0, out


@pytest.mark.parametrize("key", ["allowRead", "allowWrite"])
def test_a_sandbox_allowance_reaching_a_folder_fails(
    world: World, capsys: pytest.CaptureFixture[str], key: str
) -> None:
    world.scopes["workspace"]["sandbox"]["filesystem"] = {
        key: [str(world.photos / "raw")]
    }
    code, out = world.run(capsys)
    assert failed(code, out, "SS5") == [
        f"SS5 photos: a sandbox.filesystem.{key} entry in workspace reaches it"
    ]


@pytest.mark.parametrize("where", ["at", "under", "above"])
def test_an_added_directory_at_under_or_above_a_folder_fails(
    world: World, capsys: pytest.CaptureFixture[str], where: str
) -> None:
    folder = {"at": world.key, "under": world.key / "old", "above": world.studio}[where]
    world.scopes["user"]["permissions"]["additionalDirectories"] = [str(folder)]
    code, out = world.run(capsys)
    found = failed(code, out, "SS5")
    assert (
        "SS5 blinding-key: a permissions.additionalDirectories entry in user is at, under, or above it"
        in found
    )
    assert (where == "above") == (
        "SS5 photos: a permissions.additionalDirectories entry in user is at, under, or above it"
        in found
    )


def test_a_workspace_at_under_or_above_a_folder_fails(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    # The studio's session starting in the studio's parent folder would have both folders inside its workspace.
    settings = world.scopes.pop("workspace")
    world.workflows = world.studio
    world.lines["workflows"] = str(world.studio)
    world.scopes["workspace"] = settings
    code, out = world.run(capsys)
    found = failed(code, out, "SS5")
    assert "SS5 photos: the workspace is at, under, or above it" in found
    assert "SS5 blinding-key: the workspace is at, under, or above it" in found


# --------------------------------------------------------------------------------------------------
# SS6 and SS7: unsandboxed commands, and bypass
# --------------------------------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("change", "message"),
    [
        (
            {"allowUnsandboxedCommands": None},
            "SS6 sandbox: the effective sandbox.allowUnsandboxedCommands isn't false",
        ),
        (
            {"allowUnsandboxedCommands": True},
            "SS6 sandbox: the effective sandbox.allowUnsandboxedCommands isn't false",
        ),
        (
            {"excludedCommands": ["docker"]},
            "SS6 workspace: sandbox.excludedCommands names a command",
        ),
    ],
)
def test_unsandboxed_commands_fail(
    world: World,
    capsys: pytest.CaptureFixture[str],
    change: dict[str, Any],
    message: str,
) -> None:
    for key, value in change.items():
        if value is None:
            del world.scopes["workspace"]["sandbox"][key]
        else:
            world.scopes["workspace"]["sandbox"][key] = value
    code, out = world.run(capsys)
    assert failed(code, out, "SS6") == [message]


def test_bypass_fails_and_a_higher_scope_overrules_it(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    world.scopes["user"]["permissions"]["defaultMode"] = "bypassPermissions"
    code, out = world.run(capsys)
    assert failed(code, out, "SS7") == [
        "SS7 permissions: the effective permissions.defaultMode is bypassPermissions"
    ]
    world.scopes["workspace"]["permissions"]["defaultMode"] = "acceptEdits"
    code, out = world.run(capsys)
    assert code == 0, out


# --------------------------------------------------------------------------------------------------
# Precedence: managed, the workspace's local file, its shared file, the user's
# --------------------------------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("values", "passes"),
    [
        ({"user": False, "workspace": True}, True),
        ({"user": True, "workspace": True, "workspace.local": False}, False),
        ({"workspace": True, "workspace.local": True, "managed": False}, False),
        ({"workspace": False, "managed": True}, True),
        ({"workspace": True, "managed": True, "dropin": False}, False),
        ({"workspace": False, "managed": False, "dropin": True}, True),
    ],
)
def test_a_single_value_comes_from_the_highest_scope_that_sets_it(
    world: World,
    capsys: pytest.CaptureFixture[str],
    values: dict[str, bool],
    passes: bool,
) -> None:
    del world.scopes["workspace"]["sandbox"]["enabled"]
    for scope, value in values.items():
        if scope == "dropin":
            world.dropin("50-studio.json", {"sandbox": {"enabled": value}})
            continue
        world.scopes.setdefault(scope, {}).setdefault("sandbox", {})["enabled"] = value
    code, out = world.run(capsys)
    if passes:
        assert code == 0, out
    else:
        assert failed(code, out, "SS4") == [
            "SS4 sandbox: the effective sandbox.enabled isn't true"
        ]


def test_lists_union_across_scopes(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    # Each folder denied in a different scope still counts, and a re-allow in any scope fails.
    world.scopes["user"]["permissions"]["deny"] = [world.read(world.photos)]
    world.scopes["workspace"]["permissions"]["deny"] = []
    world.scopes["workspace.local"] = {"permissions": {"deny": [world.read(world.key)]}}
    code, out = world.run(capsys)
    assert code == 0, out
    assert "blinding-key     Read denied (workspace.local)" in out
    world.dropin("10-x.json", {"permissions": {"allow": [f"Read(/{world.key}/**)"]}})
    code, out = world.run(capsys)
    assert failed(code, out, "SS5") == [
        "SS5 blinding-key: a permissions.allow rule in managed names a path at or under it"
    ]


def test_claude_config_dir_moves_the_user_scope(
    world: World, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    config = world.tmp / "config"
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(config))
    # ~/.claude's files are no longer the user's; $CLAUDE_CONFIG_DIR's are.
    (world.home / ".claude").mkdir()
    (world.home / ".claude" / "settings.json").write_text(
        '{"permissions": {"defaultMode": "bypassPermissions"}}'
    )
    (world.home / ".claude.json").write_text(
        json.dumps({"mcpServers": {"x": {"command": COMMAND}}})
    )
    code, out = world.run(capsys)
    assert code == 0, out
    world.raw("user.json", json.dumps({"mcpServers": {"x": {"command": COMMAND}}}))
    code, out = world.run(capsys)
    assert failed(code, out, "SS9")[0].startswith("SS9 user.mcp: MCP server 1, sha256 ")


# --------------------------------------------------------------------------------------------------
# SS8: a key the check doesn't know
# --------------------------------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("where", "shown"),
    [
        ((), "h4FixtureKey"),
        (("permissions",), "permissions.h4FixtureKey"),
        (("sandbox",), "sandbox.h4FixtureKey"),
        (("sandbox", "filesystem"), "sandbox.filesystem.h4FixtureKey"),
        (("sandbox", "network"), "sandbox.network.h4FixtureKey"),
    ],
)
def test_an_unknown_key_cant_be_checked_and_its_value_never_shows(
    world: World,
    capsys: pytest.CaptureFixture[str],
    where: tuple[str, ...],
    shown: str,
) -> None:
    node = world.scopes["user"]
    for key in where:
        node = node.setdefault(key, {})
    node["h4FixtureKey"] = COMMAND
    code, out = world.run(capsys)
    assert failed(code, out, "SS8", expect=2) == [
        f"SS8 user: {shown} isn't a key the check knows for Claude Code {ssc.CLAUDE_CODE}"
    ]


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("theme", "dark"),
        ("modelSettings", {"claude-opus-5-5": {"effortLevel": "high"}}),
        ("switchModelsOnFlag", True),
        ("agentPushNotifEnabled", True),
    ],
)
def test_the_keys_claude_code_2_1_311_writes_are_known(
    world: World, capsys: pytest.CaptureFixture[str], key: str, value: object
) -> None:
    # Claude Code 2.1.311 writes these into the user's settings; reviewed as opening no route (2026-10-26). Any other
    # key still fails closed, as the case above shows.
    world.scopes["user"][key] = value
    code, out = world.run(capsys)
    assert code == 0, out
    assert out.splitlines()[0].startswith("studio-settings: PASS"), out


def test_a_key_it_cant_print_is_named_as_such(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    world.scopes["user"][str(world.tmp)] = 1
    code, out = world.run(capsys)
    assert failed(code, out, "SS8", expect=2) == [
        f"SS8 user: a key it can't print isn't a key the check knows for Claude Code {ssc.CLAUDE_CODE}"
    ]


# --------------------------------------------------------------------------------------------------
# SS9: hooks, helpers, MCP servers, and plugins, each in every place one can sit
# --------------------------------------------------------------------------------------------------
HOOK = {"type": "command", "command": f"{COMMAND} --fetch http://127.0.0.1:8188/view"}


def place_hook(world: World, scope: str) -> tuple[str, str]:
    """A PostToolUse hook in the scope; the scope and the hash an approval names."""
    hooks = {"PostToolUse": [{"matcher": "Read", "hooks": [HOOK]}]}
    if scope == "managed.d":
        world.dropin("20-hooks.json", {"hooks": hooks})
        scope = "managed"
    else:
        world.scopes.setdefault(scope, {})["hooks"] = hooks
    return scope, canonical({"event": "PostToolUse", "matcher": "Read", "hook": HOOK})


@pytest.mark.parametrize(
    "scope", ["managed", "managed.d", "user", "workspace", "workspace.local"]
)
def test_a_hook_in_any_scope_fails_until_approved_by_its_hash(
    world: World,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
    scope: str,
) -> None:
    named, digest = place_hook(world, scope)
    code, out = world.run(capsys)
    assert failed(code, out, "SS9") == [
        f"SS9 {named}: hook 1, sha256 {digest}, isn't on the approved list"
    ]
    monkeypatch.setattr(ssc, "APPROVED", ((named, "hook", digest),))
    code, out = world.run(capsys)
    assert code == 0, out
    # An approval names its scope and kind as well as the hash.
    monkeypatch.setattr(
        ssc, "APPROVED", (("elsewhere", "hook", digest), (named, "mcp", digest))
    )
    code, out = world.run(capsys)
    assert code == 1, out


@pytest.mark.parametrize(
    "key",
    [
        "statusLine",
        "apiKeyHelper",
        "awsAuthRefresh",
        "awsCredentialExport",
        "otelHeadersHelper",
    ],
)
@pytest.mark.parametrize("scope", ["managed", "user", "workspace", "workspace.local"])
def test_a_helper_command_in_any_scope_fails_until_approved_by_its_hash(
    world: World,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
    key: str,
    scope: str,
) -> None:
    value: Any = (
        {"type": "command", "command": COMMAND} if key == "statusLine" else COMMAND
    )
    world.scopes.setdefault(scope, {})[key] = value
    digest = canonical({"key": key, "value": value})
    code, out = world.run(capsys)
    assert failed(code, out, "SS9") == [
        f"SS9 {scope}: helper {key}, sha256 {digest}, isn't on the approved list"
    ]
    monkeypatch.setattr(ssc, "APPROVED", ((scope, "helper", digest),))
    code, out = world.run(capsys)
    assert code == 0, out


SERVER = {"command": COMMAND, "args": ["--host", HOST, "--port", "8188"]}


@pytest.mark.parametrize("place", ["managed.mcp", "user", "project", "workspace.mcp"])
def test_an_mcp_server_in_any_place_fails_until_approved_by_its_hash(
    world: World,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
    place: str,
) -> None:
    servers = {"comfy": SERVER}
    if place == "managed.mcp":
        world.etc.mkdir(parents=True, exist_ok=True)
        (world.etc / "managed-mcp.json").write_text(json.dumps({"mcpServers": servers}))
        scope = "managed.mcp"
    elif place == "workspace.mcp":
        world.raw("workspace.mcp", json.dumps({"mcpServers": servers}))
        scope = "workspace.mcp"
    elif place == "user":
        world.raw("user.json", json.dumps({"mcpServers": servers}))
        scope = "user.mcp"
    else:  # the workflows folder's own entry in the user's .claude.json, enabled or not
        entry = {"mcpServers": servers, "disabledMcpServers": ["comfy"]}
        world.raw("user.json", json.dumps({"projects": {str(world.workflows): entry}}))
        scope = "user.mcp"
    digest = canonical({"name": "comfy", "server": SERVER})
    code, out = world.run(capsys)
    assert failed(code, out, "SS9") == [
        f"SS9 {scope}: MCP server 1, sha256 {digest}, isn't on the approved list"
    ]
    monkeypatch.setattr(ssc, "APPROVED", ((scope, "mcp", digest),))
    code, out = world.run(capsys)
    assert code == 0, out


def test_a_server_in_mcp_json_counts_whether_or_not_it_is_enabled(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    world.raw("workspace.mcp", json.dumps({"mcpServers": {"comfy": SERVER}}))
    world.scopes["workspace"]["disabledMcpjsonServers"] = ["comfy"]
    code, out = world.run(capsys)
    assert len(failed(code, out, "SS9")) == 1


def test_an_enabled_plugin_fails_and_no_approval_covers_it(
    world: World, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    world.scopes["user"]["enabledPlugins"] = {
        "comfy-tools@h4-fixture": True,
        "off@h4-fixture": False,
    }
    code, out = world.run(capsys)
    assert failed(code, out, "SS9") == [
        "SS9 user: an enabled plugin, whose hooks and servers don't show in the settings, so no approval covers it"
    ]
    assert "comfy-tools" not in out and "h4-fixture" not in out
    monkeypatch.setattr(
        ssc,
        "APPROVED",
        tuple(
            ("user", kind, canonical({"comfy-tools@h4-fixture": True}))
            for kind in ("hook", "mcp", "helper")
        ),
    )
    code, out = world.run(capsys)
    assert code == 1
    world.scopes["user"]["enabledPlugins"] = {"off@h4-fixture": False}
    code, out = world.run(capsys)
    assert code == 0, out


# --------------------------------------------------------------------------------------------------
# SS10: the sandbox's network, and SS11: WebFetch
# --------------------------------------------------------------------------------------------------
LOOPBACK = [
    "localhost",
    "app.localhost",
    "127.0.0.2",
    "127.1",
    "2130706433",
    "0x7f000001",
    "0177.0.0.1",
    "[::1]",
    "::ffff:127.0.0.1",
    "0.0.0.0",
    "0",
]


def with_port(host: str) -> str:
    if host.startswith("[") or ":" not in host:
        return f"{host}:8188"
    return f"[{host}]:8188"


@pytest.mark.parametrize(
    "entry",
    [
        *LOOPBACK,
        *(with_port(h) for h in LOOPBACK),
        "*",
        "*.localhost",
        "127.*",
        "studio-box",  # /etc/hosts maps it to 127.0.1.1
        "studio-box.localdomain:8188",
        "ip6-localhost",
        "http://localhost:8188/view",
    ],
)
def test_a_loopback_host_in_the_allowlist_fails(
    world: World, capsys: pytest.CaptureFixture[str], entry: str
) -> None:
    world.scopes["user"]["sandbox"]["network"] = {
        "allowedDomains": ["registry.npmjs.org", entry, HOST]
    }
    code, out = world.run(capsys)
    assert failed(code, out, "SS10") == [
        "SS10 user: sandbox.network.allowedDomains holds a loopback host"
    ]
    assert entry not in out or entry in ("*", "0", "127.1")


@pytest.mark.parametrize(
    "entry",
    [
        "registry.npmjs.org",
        "198.18.0.1:2376",
        "*.example.com",
        "localhost.example.com",
        "printer",
        "128.0.0.1",
        "::2",
        "[2001:db8::1]:443",
    ],
)
def test_hosts_elsewhere_pass(
    world: World, capsys: pytest.CaptureFixture[str], entry: str
) -> None:
    world.scopes["user"]["sandbox"]["network"] = {"allowedDomains": [entry]}
    code, out = world.run(capsys)
    assert code == 0, out


@pytest.mark.parametrize(
    ("network", "message"),
    [
        (
            {"allowLocalBinding": True},
            "SS10 workspace: sandbox.network.allowLocalBinding is true",
        ),
        (
            {"allowUnixSockets": ["/run/h4-fixture.sock"]},
            "SS10 workspace: sandbox.network.allowUnixSockets allows a local socket",
        ),
        (
            {"allowAllUnixSockets": True},
            "SS10 workspace: sandbox.network.allowAllUnixSockets allows a local socket",
        ),
        (
            {"httpProxyPort": 8188},
            "SS10 workspace: sandbox.network.httpProxyPort sets a proxy of its own, whose allowlist the check can't read",
        ),
        (
            {"socksProxyPort": 1080},
            "SS10 workspace: sandbox.network.socksProxyPort sets a proxy of its own, whose allowlist the check can't read",
        ),
    ],
)
def test_a_local_binding_a_socket_or_a_proxy_of_its_own_fails(
    world: World,
    capsys: pytest.CaptureFixture[str],
    network: dict[str, Any],
    message: str,
) -> None:
    world.scopes["workspace"]["sandbox"]["network"] = network
    code, out = world.run(capsys)
    assert failed(code, out, "SS10") == [message]
    assert "h4-fixture.sock" not in out


def test_a_local_socket_allowed_at_the_sandbox_level_fails_too(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    world.scopes["workspace"]["sandbox"]["allowAllUnixSockets"] = True
    code, out = world.run(capsys)
    assert failed(code, out, "SS10") == [
        "SS10 workspace: sandbox.allowAllUnixSockets allows a local socket"
    ]


@pytest.mark.parametrize(
    ("rule", "message"),
    [
        (
            "WebFetch",
            "SS11 user: a permissions.allow rule allows WebFetch for every host",
        ),
        (
            "WebFetch(domain:localhost)",
            "SS11 user: a permissions.allow rule allows WebFetch for a loopback host",
        ),
        (
            "WebFetch(domain:127.0.0.1)",
            "SS11 user: a permissions.allow rule allows WebFetch for a loopback host",
        ),
        (
            "WebFetch(domain:*)",
            "SS11 user: a permissions.allow rule allows WebFetch for a loopback host",
        ),
        (
            "WebFetch(*)",
            "SS11 user: a permissions.allow rule allows WebFetch for every host",
        ),
    ],
)
def test_webfetch_for_a_loopback_host_fails(
    world: World, capsys: pytest.CaptureFixture[str], rule: str, message: str
) -> None:
    world.scopes["user"]["permissions"]["allow"] = [rule, f"WebFetch(domain:{HOST})"]
    code, out = world.run(capsys)
    assert failed(code, out, "SS11") == [message]


# --------------------------------------------------------------------------------------------------
# The verdict: every finding, then the scope lines
# --------------------------------------------------------------------------------------------------
def test_a_failure_lists_every_finding_then_the_scope_lines(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    world.scopes["user"]["permissions"]["allow"] = ["WebFetch"]
    world.scopes["workspace"]["sandbox"]["enabled"] = False
    code, out = world.run(capsys)
    lines = out.splitlines()
    assert code == 1
    assert lines[0] == "studio-settings: FAIL: 2 findings"
    assert lines[1:3] == [
        "SS4 sandbox: the effective sandbox.enabled isn't true",
        "SS11 user: a permissions.allow rule allows WebFetch for every host",
    ]
    assert [line.split()[0] for line in lines[3:]] == [
        "claude",
        "managed",
        "managed.d",
        "managed.mcp",
        "managed.win",
        "managed.win.d",
        "managed.win.mcp",
        "user",
        "user.mcp",
        "workspace",
        "workspace.local",
        "workspace.mcp",
        "note",
    ]
    assert lines[3] == FLOOR_LINE
    assert re.fullmatch(rf"user {{13}}sha256 {HEX}", lines[10])


def test_the_managed_drop_ins_hash_together_by_name(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    world.dropin("10-a.json", {"model": "a"})
    world.dropin("20-b.json", {"model": "b"})
    (world.etc / "managed-settings.d" / "README.txt").write_text("not a settings file")
    code, out = world.run(capsys)
    assert code == 0, out
    (line,) = [x for x in out.splitlines() if x.startswith("managed.d")]
    assert re.fullmatch(rf"managed\.d {{8}}2 files, sha256 {HEX}", line)


# --------------------------------------------------------------------------------------------------
# A deny wins: Claude Code refuses what any scope's permissions.deny names, whatever an allow says (SS11)
# --------------------------------------------------------------------------------------------------
def test_a_deny_of_webfetch_in_any_scope_wins_over_an_allow(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    world.scopes["user"]["permissions"]["allow"] = ["WebFetch"]
    code, out = world.run(capsys)
    assert failed(code, out, "SS11") == [
        "SS11 user: a permissions.allow rule allows WebFetch for every host"
    ]
    world.scopes["workspace"]["permissions"]["deny"].append("WebFetch")
    code, out = world.run(capsys)
    assert code == 0, out
    # A deny for one host isn't a deny of WebFetch: the allow still reaches the others.
    world.scopes["workspace"]["permissions"]["deny"][-1] = "WebFetch(domain:localhost)"
    code, out = world.run(capsys)
    assert failed(code, out, "SS11") == [
        "SS11 user: a permissions.allow rule allows WebFetch for every host"
    ]


# --------------------------------------------------------------------------------------------------
# allowManagedPermissionRulesOnly: Claude Code then reads permission rules from managed alone (SS3, SS5, SS11)
# --------------------------------------------------------------------------------------------------
def test_with_managed_rules_only_the_other_scopes_denies_dont_count(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    world.scopes["managed"] = dict(MANAGED_ONLY)
    code, out = world.run(capsys)
    assert failed(code, out, "SS3") == [
        "SS3 photos: no scope's permissions.deny holds Read(//…/**) for it or for a folder above it",
        "SS3 blinding-key: no scope's permissions.deny holds Read(//…/**) for it or for a folder above it",
    ]
    assert len(findings(out)) == 2
    world.scopes["managed"]["permissions"] = {
        "deny": [world.read(world.photos), world.read(world.key)]
    }
    code, out = world.run(capsys)
    assert code == 0, out
    assert "photos           Read denied (managed)" in out


def test_with_managed_rules_only_the_other_scopes_allows_reopen_nothing(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    deny = [world.read(world.photos), world.read(world.key)]
    world.scopes["managed"] = {**MANAGED_ONLY, "permissions": {"deny": list(deny)}}
    world.scopes["user"]["permissions"]["allow"] = [
        f"Read(/{world.key}/**)",
        "WebFetch",
    ]
    code, out = world.run(capsys)
    assert code == 0, out
    # Managed's own allow counts, and another scope's deny doesn't answer it.
    world.scopes["managed"]["permissions"]["allow"] = ["WebFetch"]
    world.scopes["workspace"]["permissions"]["deny"].append("WebFetch")
    code, out = world.run(capsys)
    assert failed(code, out, "SS11") == [
        "SS11 managed: a permissions.allow rule allows WebFetch for every host"
    ]
    world.scopes["managed"]["permissions"]["deny"].append("WebFetch")
    code, out = world.run(capsys)
    assert code == 0, out


def test_only_managed_settings_turn_managed_rules_only_on(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    world.scopes["user"].update(MANAGED_ONLY)
    world.scopes["user"]["permissions"]["allow"] = [f"Read(/{world.key}/**)"]
    code, out = world.run(capsys)
    assert failed(code, out, "SS5") == [
        "SS5 blinding-key: a permissions.allow rule in user names a path at or under it"
    ]


# --------------------------------------------------------------------------------------------------
# Windows' managed settings, which Claude Code under WSL reads too; and the floor
# --------------------------------------------------------------------------------------------------
def test_windows_managed_settings_count_as_managed_and_show_as_their_own_scope(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    world.raw(
        "managed.win",
        json.dumps({"permissions": {"allow": [f"Read(/{world.key}/**)"]}}),
    )
    code, out = world.run(capsys)
    assert failed(code, out, "SS5") == [
        "SS5 blinding-key: a permissions.allow rule in managed names a path at or under it"
    ]
    (line,) = [x for x in out.splitlines() if x.startswith("managed.win ")]
    digest = hashlib.sha256(world.path("managed.win").read_bytes()).hexdigest()
    assert line == f"managed.win      sha256 {digest}"


def test_a_windows_managed_drop_in_counts_and_hashes_as_its_own_scope(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    world.dropin("50-studio.json", {"sandbox": {"enabled": False}}, win=True)
    code, out = world.run(capsys)
    assert failed(code, out, "SS4") == [
        "SS4 sandbox: the effective sandbox.enabled isn't true"
    ]
    (line,) = [x for x in out.splitlines() if x.startswith("managed.win.d")]
    assert re.fullmatch(rf"managed\.win\.d {{4}}1 file, sha256 {HEX}", line)


def test_windows_managed_settings_are_read_after_linuxs(
    world: World, capsys: pytest.CaptureFixture[str]
) -> None:
    world.scopes["managed"] = {"sandbox": {"enabled": True}}
    world.raw("managed.win", json.dumps({"sandbox": {"enabled": False}}))
    code, out = world.run(capsys)
    assert failed(code, out, "SS4") == [
        "SS4 sandbox: the effective sandbox.enabled isn't true"
    ]


def test_a_windows_managed_mcp_server_fails_until_approved_by_its_hash(
    world: World, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    world.raw("managed.win.mcp", json.dumps({"mcpServers": {"comfy": SERVER}}))
    digest = canonical({"name": "comfy", "server": SERVER})
    code, out = world.run(capsys)
    assert failed(code, out, "SS9") == [
        f"SS9 managed.mcp: MCP server 1, sha256 {digest}, isn't on the approved list"
    ]
    (line,) = [x for x in out.splitlines() if x.startswith("managed.win.mcp")]
    assert re.fullmatch(rf"managed\.win\.mcp  sha256 {HEX}", line)
    monkeypatch.setattr(ssc, "APPROVED", (("managed.mcp", "mcp", digest),))
    code, out = world.run(capsys)
    assert code == 0, out


@pytest.mark.parametrize(
    ("text", "message"),
    [
        (
            "CLAUDE_CODE_VERSION=9.9.9\n",
            (
                "SS8 claude code: the floor is 9.9.9, but the check knows the keys of Claude Code "
                f"{ssc.CLAUDE_CODE}"
            ),
        ),
        (
            "CLAUDE_CODE_VERSION=$(h4-fixture-command)\n",
            "SS8 claude code: the floor in the toolchain's pins can't be read",
        ),
        (
            "NODE_VERSION=24\n",
            "SS8 claude code: the floor in the toolchain's pins can't be read",
        ),
    ],
)
def test_a_floor_the_key_list_isnt_for_cant_be_checked(
    world: World,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
    text: str,
    message: str,
) -> None:
    world.toolchain = tmp_path / "toolchain.vars"
    world.toolchain.write_text(text)
    code, out = world.run(capsys)
    assert failed(code, out, "SS8", expect=2) == [message]
