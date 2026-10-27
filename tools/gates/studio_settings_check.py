#!/usr/bin/env -S python3 -I -B -X pycache_prefix=/dev/null
"""The studio settings check (spec 004 FR-025, SC-013; contracts/intake-amendments.md §5; research.md R-52).

    tools/gates/studio_settings_check.py

The Author runs it directly from main's checkout, in the Author's own terminal, never through make, where a planted
GNUmakefile could shadow the Makefile; its first line and the guard below give it PY_HOST's flags. It reads the
settings the studio's Claude Code session loads on this machine, at Claude Code CLAUDE_CODE, the floor
.devcontainer/toolchain.vars pins (ADR 0023), and proves three things: they deny the studio's photos folder and its blinding key
to the file tools and in the sandbox; nothing re-allows either; and the session has no route to a loopback listener,
such as ComfyUI's server, which hands out the photos folder's files at /view, and its previews, whatever the file
denies say. Standard library only.

What it reads:
- tools/gates/studio-folders.txt, beside it: the workflows line names the studio's workspace, the folder its session
  starts in; the photos and blinding-key lines name the two folders it proves. The outputs folder is the studio
  session's to work in, so the check doesn't prove it denied.
- TOOLCHAIN, for the floor: the check's key list is for CLAUDE_CODE, so a floor that names another version, or none it
  can read, leaves it unable to check (SS8).
- Every settings scope that session loads: managed, MANAGED_SETTINGS and then the *.json files in MANAGED_DIR, in name
  order, then WIN_MANAGED_SETTINGS and the *.json files in WIN_MANAGED_DIR, Windows' managed settings, which Claude Code
  under WSL reads too, each over the ones before it; user, settings.json in $CLAUDE_CONFIG_DIR when it is set,
  otherwise in ~/.claude; and the workspace's .claude/settings.json and .claude/settings.local.json.
- The MCP servers in every place that version reads them: MANAGED_MCP and WIN_MANAGED_MCP; the user scope's servers,
  and the workspace's
  own entry under projects, in the user's .claude.json ($CLAUDE_CONFIG_DIR/.claude.json when that is set, otherwise
  ~/.claude.json); and the workspace's .mcp.json, whose servers count whether or not they are enabled.
- HOSTS, for the names it gives a loopback address, which a proxy that reads it would connect to.

An absent file is an absent scope. Lists are unioned across scopes: permissions.allow, .deny, and
.additionalDirectories, every list under sandbox.filesystem and sandbox.network, and sandbox.excludedCommands; every
hook, MCP server, plugin, and helper command, from every scope, counts. A single value comes from the highest scope
that sets it, in Claude Code's order: managed, then the workspace's local file, then its shared file, then the user's.
When managed's allowManagedPermissionRulesOnly is true, Claude Code reads permission rules (permissions.allow, .ask, and
.deny) from managed alone, and so do SS3, SS5's first form, and SS11; the switch counts only from managed, the only
scope Claude Code takes it from.

The rules. SS1, SS2, and SS8 leave it unable to check, and exit 2; the rest are findings, and exit 1:
SS1   an unusable folder list: missing, with a placeholder left, without a workflows, photos, or blinding-key line,
      or with a path that isn't absolute.
SS2   a file that isn't strict JSON (a duplicate key, NaN, Infinity) or isn't an object, or a value the check reads
      that isn't shaped as Claude Code reads it.
SS3   the file tools: a protected folder for which no scope's permissions.deny holds Read(//<p>/**), with <p> the
      folder or a folder above it.
SS4   the sandbox: the effective sandbox.enabled or sandbox.failIfUnavailable isn't true; the effective
      sandbox.enableWeakerNestedSandbox is true; or no scope's sandbox.filesystem.denyRead holds the folder or a
      folder above it.
SS5   a re-allow, in any of four forms: a permissions.allow rule naming a path at or under either folder; a
      sandbox.filesystem entry that allows a path at or under either (a folder above it allows its contents); a
      permissions.additionalDirectories entry at, under, or above either; or a workspace at, under, or above either.
SS6   unsandboxed commands: the effective sandbox.allowUnsandboxedCommands isn't false, or any scope's
      sandbox.excludedCommands names a command.
SS7   bypass: the effective permissions.defaultMode is bypassPermissions.
SS8   a top-level key, or a key under permissions, sandbox, sandbox.filesystem, or sandbox.network, in any scope,
      that isn't on this script's list for the pinned version: the check fails closed rather than guess what it does;
      or a floor in TOOLCHAIN that isn't CLAUDE_CODE, or that it can't read.
SS9   a route that runs outside the sandbox, in any scope: a hook, an MCP server, or a helper command (the status
      line; the API key, AWS, and OpenTelemetry header helpers) that isn't on APPROVED; or an enabled plugin, whose
      hooks and servers don't show in the settings.
SS10  the sandbox's network, in any scope: allowedDomains holding a loopback host (localhost or a name under
      .localhost, a name HOSTS gives a loopback address, or an address in 127.0.0.0/8, ::1, or 0.0.0.0, in any
      notation a proxy might parse: dotted, shortened, decimal, octal, hexadecimal, or IPv4-mapped; with or without
      a port), or a wildcard that matches one, such as *; allowLocalBinding true; a local socket allowed
      (allowUnixSockets, allowAllUnixSockets); or a proxy of the scope's own (httpProxyPort, socksProxyPort), whose
      allowlist the check can't read.
SS11  WebFetch for a loopback host: a permissions.allow rule WebFetch with no domain, which allows every host, or
      WebFetch(domain:<host>) whose host is a loopback host as SS10 reads one, or a wildcard that matches one; unless a
      permissions.deny rule WebFetch, with no domain, denies it everywhere, since Claude Code's deny wins over an allow
      in every scope.

APPROVED is the Author's: each entry is (scope, kind, sha256). The scope is where the entry sits: managed (the file
or a drop-in), user, workspace, or workspace.local for a hook or a helper, and managed.mcp, user.mcp, or
workspace.mcp for an MCP server. The hash is the SHA-256 of the entry's definition as canonical JSON (sorted keys, no
white space): for a hook, {"event": <its event>, "matcher": <its group's matcher, or null>, "hook": <the hook>}; for
an MCP server, {"name": <its name>, "server": <its definition>}; for a helper, {"key": <the setting>, "value": <its
value>}. The Author adds an entry only by hand, in a commit on main, after reading the definition the finding's hash
names. A plugin can't be approved: what it brings doesn't show in the settings.

Output: one verdict line, "studio-settings: PASS: ..." or "studio-settings: FAIL: <n> findings"; on a pass, a line
for each folder, one for the sandbox, and the listeners line; on a failure, one line per finding; then the floor's
line; then a line for each scope, absent or its file's SHA-256 (managed.win, managed.win.d, and managed.win.mcp for
Windows' managed files), so a later note can show the settings haven't changed. user.mcp hashes the
canonical JSON of the two server lists it reads in .claude.json, never the whole file, which Claude Code rewrites as it
runs. It prints folder names, scope names, and hashes; never a path, a rule's text, a command, a host, or a file's
contents.

What it can't see: a session started with --settings, --setting-sources, --mcp-config, --plugin-dir,
--allowedTools, --permission-mode, or --dangerously-skip-permissions. The studio starts its sessions with none.

The options are the tests', which build fixture scopes in temporary folders. The Author's run passes none; when one
is given, the output's last line says the run proves nothing about the studio's own settings.

Exit 0 on a pass, 1 on a finding, 2 when it can't check (SS1, SS2, SS8, or a usage error).
"""

from __future__ import annotations

import os
import sys

# PY_HOST's flags (spec 000 plan §4; research.md R-35), before anything else is imported. The first line sets them; a
# bare `python3 tools/gates/studio_settings_check.py` starts again with them, so neither PYTHONPATH nor a planted
# __pycache__ reaches it. Imported (its tests), it runs nothing.
REEXEC = ["-I", "-B", "-X", "pycache_prefix=/dev/null"]
if __name__ == "__main__" and not (
    sys.flags.isolated
    and sys.flags.dont_write_bytecode
    and sys.pycache_prefix == "/dev/null"
):
    os.execv(
        sys.executable,
        [sys.executable, *REEXEC, os.path.abspath(__file__), *sys.argv[1:]],
    )

import argparse
import hashlib
import ipaddress
import json
import posixpath
import re
import urllib.parse
from dataclasses import dataclass
from pathlib import Path
from typing import Any

CLAUDE_CODE = "2.1.296"
LIST = Path(__file__).resolve().parent / "studio-folders.txt"
MANAGED_SETTINGS = Path("/etc/claude-code/managed-settings.json")
MANAGED_DIR = Path("/etc/claude-code/managed-settings.d")
MANAGED_MCP = Path("/etc/claude-code/managed-mcp.json")
# Windows' managed settings, which Claude Code under WSL reads too, through the C: drive's mount.
WIN_MANAGED = Path("/mnt/c/Program Files/ClaudeCode")
WIN_MANAGED_SETTINGS = WIN_MANAGED / "managed-settings.json"
WIN_MANAGED_DIR = WIN_MANAGED / "managed-settings.d"
WIN_MANAGED_MCP = WIN_MANAGED / "managed-mcp.json"
HOSTS = Path("/etc/hosts")
TOOLCHAIN = Path(__file__).resolve().parents[2] / ".devcontainer" / "toolchain.vars"

# The Author's approvals, (scope, kind, sha256), each added by hand in a commit on main. Empty as P-3 writes it.
APPROVED: tuple[tuple[str, str, str], ...] = ()

PROTECTED = ("photos", "blinding-key")
PRECEDENCE = ("managed", "workspace.local", "workspace", "user")
SHOWN_ORDER = ("managed", "user", "workspace", "workspace.local")
HELPERS = (
    "statusLine",
    "apiKeyHelper",
    "awsAuthRefresh",
    "awsCredentialExport",
    "otelHeadersHelper",
)
# The keys Claude Code 2.1.296 reads, as the check knows them. Each one either creates no route outside the sandbox and
# reopens no path, or is one the rules read (the helpers, hooks, plugins, permissions, and sandbox).
TOP_KEYS = frozenset(
    {
        "$schema",
        *HELPERS,
        "hooks",
        "disableAllHooks",
        "allowManagedHooksOnly",
        "allowManagedPermissionRulesOnly",
        "permissions",
        "sandbox",
        "env",
        "enabledPlugins",
        "extraKnownMarketplaces",
        "strictKnownMarketplaces",
        "enableAllProjectMcpServers",
        "enabledMcpjsonServers",
        "disabledMcpjsonServers",
        "allowedMcpServers",
        "deniedMcpServers",
        "model",
        "outputStyle",
        "alwaysThinkingEnabled",
        "includeCoAuthoredBy",
        "attribution",
        "cleanupPeriodDays",
        "companyAnnouncements",
        "forceLoginMethod",
        "forceLoginOrgUUID",
        "spinnerTipsEnabled",
        "autoUpdatesChannel",
        "language",
        "respectGitignore",
        "plansDirectory",
        "showTurnDuration",
        "spinnerVerbs",
        "terminalProgressBarEnabled",
        # Written by Claude Code 2.1.311 into the Author's user settings, reviewed 2026-10-26: the interface theme,
        # a model's effort level, switching models by flag, and push notifications on the Author's devices. None runs
        # a command, opens a route to a listener, or reopens a path.
        "theme",
        "modelSettings",
        "switchModelsOnFlag",
        "agentPushNotifEnabled",
    }
)
PERMISSIONS_KEYS = frozenset(
    {
        "allow",
        "ask",
        "deny",
        "additionalDirectories",
        "defaultMode",
        "disableBypassPermissionsMode",
    }
)
# SS10's keys are taken at the sandbox's own level too, where the rule refuses them as it does under network.
LOCAL = (
    "allowLocalBinding",
    "allowUnixSockets",
    "allowAllUnixSockets",
    "httpProxyPort",
    "socksProxyPort",
)
SANDBOX_KEYS = frozenset(
    {
        "enabled",
        "failIfUnavailable",
        "autoAllowBashIfSandboxed",
        "allowUnsandboxedCommands",
        "excludedCommands",
        "enableWeakerNestedSandbox",
        "filesystem",
        "network",
        "credentials",
        *LOCAL,
    }
)
FILESYSTEM_KEYS = frozenset({"denyRead", "denyWrite", "allowRead", "allowWrite"})
# The lists the rules read, which must be lists of strings wherever they sit.
LISTS = frozenset({*FILESYSTEM_KEYS, "allowedDomains", "deniedDomains"})
NETWORK_KEYS = frozenset({"allowedDomains", "deniedDomains", "tlsTerminate", *LOCAL})
LOOPBACK_NAMES = frozenset(
    {"localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"}
)
GLOB = re.compile(r"[*?\[{]")
PRINTABLE_KEY = re.compile(r"[A-Za-z0-9_$.-]{1,64}")
WIDTH = 17
MISSING = object()


class Strict(Exception):
    """A file that isn't a strict JSON object, or a value that isn't shaped as Claude Code reads it (SS2)."""


@dataclass
class Source:
    """One settings file of a scope: its parsed object."""

    scope: str
    data: dict[str, Any]


@dataclass
class Report:
    findings: list[tuple[int, str]]
    scope_lines: list[str]

    def add(self, rule: int, text: str) -> None:
        self.findings.append((rule, f"SS{rule} {text}"))

    def stops(self) -> bool:
        return any(rule in (1, 2, 8) for rule, _ in self.findings)


# ---------------------------------------------------------------------------------------------------------------
# Reading: the list, strict JSON, and the shape the rules read
# ---------------------------------------------------------------------------------------------------------------
def norm(path: str) -> str:
    """A path with . and .. resolved as text, and one leading slash, which POSIX lets a path keep two of."""
    out = posixpath.normpath(path)
    return "/" + out.lstrip("/") if out.startswith("/") else out


def read_list(path: Path, report: Report) -> dict[str, str]:
    """The list's folders by name, as the matrix reads them: the rest of a name's first line, trimmed, without a
    trailing slash. SS1 for a list that can't be used."""
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        report.add(1, "the folder list, tools/gates/studio-folders.txt, can't be read")
        return {}
    folders: dict[str, str] = {}
    for line in text.splitlines():
        words = line.strip().split(None, 1)
        if words and not words[0].startswith("#"):
            folders.setdefault(words[0], (words[1:] or [""])[0].strip())
    usable = {}
    for name in ("workflows", *PROTECTED):
        given = folders.get(name)
        if given is None:
            report.add(1, f"the folder list has no {name} line")
        elif "<STUDIO_" in given:
            report.add(1, f"{name}: the folder list's line still holds its placeholder")
        elif not given.rstrip("/").startswith("/"):
            report.add(1, f"{name}: the folder list's path isn't absolute")
        else:
            usable[name] = norm(given.rstrip("/"))
    return usable


def _pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in pairs:
        if key in out:
            raise Strict("isn't strict JSON: a duplicate key")
        out[key] = value
    return out


def _constant(_name: str) -> Any:
    raise Strict("isn't strict JSON: NaN or Infinity")


def strict_object(data: bytes) -> dict[str, Any]:
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        raise Strict("isn't UTF-8") from None
    try:
        value = json.loads(text, object_pairs_hook=_pairs, parse_constant=_constant)
    except json.JSONDecodeError as exc:
        raise Strict(
            f"isn't strict JSON: a syntax error at line {exc.lineno}"
        ) from None
    if not isinstance(value, dict):
        raise Strict("isn't a JSON object")
    return value


def read_json(
    path: Path, scope: str, report: Report
) -> tuple[dict[str, Any] | None, str]:
    """The file's object and its scope line's value: None and "absent" for a file that isn't there."""
    try:
        data = path.read_bytes()
    except FileNotFoundError:
        return None, "absent"
    except OSError as exc:
        report.add(2, f"{scope}: can't be read ({exc.strerror})")
        return None, "unreadable"
    digest = f"sha256 {hashlib.sha256(data).hexdigest()}"
    try:
        return strict_object(data), digest
    except Strict as exc:
        report.add(2, f"{scope}: {exc}")
        return None, digest


def shown_key(key: str) -> str:
    return key if PRINTABLE_KEY.fullmatch(key) else "a key it can't print"


def strings(value: Any, what: str) -> list[str]:
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise Strict(f"{what} isn't a list of strings")
    return value


def shape(scope: str, data: dict[str, Any], report: Report) -> None:
    """SS8 for each key the check doesn't know, and SS2 for each value it reads that isn't shaped as Claude Code reads
    it; neither prints a value."""

    def unknown(keys: Any, known: frozenset[str], prefix: str) -> None:
        for key in keys:
            if key not in known:
                named = (
                    prefix + key
                    if PRINTABLE_KEY.fullmatch(key)
                    else "a key it can't print"
                )
                report.add(
                    8,
                    f"{scope}: {named} isn't a key the check knows for Claude Code {CLAUDE_CODE}",
                )

    try:
        unknown(data, TOP_KEYS, "")
        permissions = data.get("permissions", {})
        if not isinstance(permissions, dict):
            raise Strict("permissions isn't an object")
        unknown(permissions, PERMISSIONS_KEYS, "permissions.")
        for key in ("allow", "ask", "deny", "additionalDirectories"):
            if key in permissions:
                strings(permissions[key], f"permissions.{key}")
        sandbox = data.get("sandbox", {})
        if not isinstance(sandbox, dict):
            raise Strict("sandbox isn't an object")
        unknown(sandbox, SANDBOX_KEYS, "sandbox.")
        if "excludedCommands" in sandbox:
            strings(sandbox["excludedCommands"], "sandbox.excludedCommands")
        for part, known in (("filesystem", FILESYSTEM_KEYS), ("network", NETWORK_KEYS)):
            node = sandbox.get(part, {})
            if not isinstance(node, dict):
                raise Strict(f"sandbox.{part} isn't an object")
            unknown(node, known, f"sandbox.{part}.")
            for key, value in node.items():
                if key in LISTS or isinstance(value, list):
                    strings(value, f"sandbox.{part}.{shown_key(key)}")
        hooks = data.get("hooks", {})
        if not (
            isinstance(hooks, dict)
            and all(
                isinstance(groups, list)
                and all(
                    isinstance(group, dict)
                    and isinstance(group.get("hooks", []), list)
                    and all(isinstance(hook, dict) for hook in group.get("hooks", []))
                    for group in groups
                )
                for groups in hooks.values()
            )
        ):
            raise Strict("hooks isn't shaped as Claude Code reads it")
        if not isinstance(data.get("enabledPlugins", {}), dict):
            raise Strict("enabledPlugins isn't an object")
    except Strict as exc:
        report.add(2, f"{scope}: {exc}")


def servers_of(node: Any, what: str) -> dict[str, Any]:
    servers = node.get("mcpServers", {}) if isinstance(node, dict) else {}
    if not isinstance(servers, dict) or not all(
        isinstance(s, dict) for s in servers.values()
    ):
        raise Strict(f"{what}mcpServers isn't an object of server objects")
    return servers


# ---------------------------------------------------------------------------------------------------------------
# Paths, hosts, and hashes
# ---------------------------------------------------------------------------------------------------------------
def relation(path: str, folder: str) -> str:
    """Where a path sits against a folder: at it, under it, above it, or apart."""
    if path == folder:
        return "at"
    if path.startswith(folder.rstrip("/") + "/"):
        return "under"
    if folder.startswith(path.rstrip("/") + "/"):
        return "above"
    return "apart"


def related(path: str, folder: str) -> set[str]:
    """Each relation between the path and the folder, both as text and with links followed."""
    return {
        relation(p, f)
        for p in {norm(path), os.path.realpath(path)}
        for f in {norm(folder), os.path.realpath(folder)}
    }


def reaches(pattern: str, folder: str, *, subtree: bool) -> bool:
    """Whether an absolute path pattern names a path at or under the folder: its part before the first wildcard at or
    under it, or above it with a wildcard after, which can reach in, or with none when the pattern stands for its
    whole subtree."""
    match = GLOB.search(pattern)
    if match:
        literal = pattern[: pattern.rfind("/", 0, match.start())] or "/"
    else:
        literal = pattern
    found = related(literal, folder)
    return bool(found & {"at", "under"}) or (
        "above" in found and (bool(match) or subtree)
    )


def entry_path(entry: str, workspace: str) -> str:
    """A sandbox path or a directory as settings write it, made absolute: ~ against the home folder, a relative one
    against the workspace."""
    text = (
        os.path.expanduser(entry.strip())
        if entry.strip().startswith("~")
        else entry.strip()
    )
    return norm(text if text.startswith("/") else posixpath.join(workspace, text))


def rule_paths(spec: str, workspace: str) -> list[str]:
    """A file tool's rule specifier as absolute paths: //x is the root's x, ~/x the home folder's, and /x or x the
    project's, read as the root's too when it starts with one slash, so either reading counts."""
    spec = spec.strip()
    if spec.startswith("//"):
        return [norm(spec[1:])]
    if spec.startswith("~"):
        return [norm(os.path.expanduser(spec))]
    if spec.startswith("/"):
        return [norm(workspace + spec), norm(spec)]
    return [norm(posixpath.join(workspace, spec))]


def inet_aton(text: str) -> int | None:
    """An IPv4 address in any notation inet_aton takes: one to four parts, each decimal, octal (a leading 0), or
    hexadecimal (0x), the last filling the bits the others leave."""
    parts = text.split(".")
    if not 1 <= len(parts) <= 4:
        return None
    values = []
    for part in parts:
        if re.fullmatch(r"0[xX][0-9a-fA-F]*", part):
            values.append(int(part[2:] or "0", 16))
        elif re.fullmatch(r"0[0-7]*", part):
            values.append(int(part, 8))
        elif re.fullmatch(r"[1-9][0-9]*", part):
            values.append(int(part))
        else:
            return None
    *head, last = values
    if any(v > 255 for v in head) or last >= 1 << (32 - 8 * len(head)):
        return None
    value = last
    for i, v in enumerate(head):
        value |= v << (24 - 8 * i)
    return value


def loopback_v4(value: int) -> bool:
    return value >> 24 == 127 or value == 0


def host_of(entry: str) -> str:
    """The host an allowlist entry names: without a scheme, a path, brackets, or a port; lowercase."""
    text = entry.strip().lower()
    if "://" in text:
        text = urllib.parse.urlsplit(text).netloc
    text = text.split("/", 1)[0].rsplit("@", 1)[-1]
    if text.startswith("["):
        return text[1:].split("]", 1)[0]
    if text.count(":") == 1:
        text = text.split(":", 1)[0]
    return text.rstrip(".")


def is_loopback(host: str, names: frozenset[str]) -> bool:
    """A loopback host as SS10 reads one; a wildcard matches one if it matches any of them."""
    if "*" in host:
        pattern = re.compile(".*".join(re.escape(p) for p in host.split("*")))
        probes = [
            *LOOPBACK_NAMES,
            *names,
            "h4-probe.localhost",
            "127.0.0.1",
            "127.0.1.1",
            "0.0.0.0",
            "::1",
        ]
        return any(pattern.fullmatch(p) for p in probes)
    if host in LOOPBACK_NAMES or host in names or host.endswith(".localhost"):
        return True
    value = inet_aton(host)
    if value is not None:
        return loopback_v4(value)
    try:
        address = ipaddress.IPv6Address(host.split("%", 1)[0])
    except ValueError:
        return False
    if address.ipv4_mapped is not None:
        return loopback_v4(int(address.ipv4_mapped))
    value = int(address)
    if value == 1:  # ::1
        return True
    # :: and the IPv4-compatible ::a.b.c.d, which some parsers still map to the IPv4 address
    return value >> 32 == 0 and loopback_v4(value & 0xFFFFFFFF)


def hosts_names(path: Path) -> frozenset[str]:
    """The names a hosts file gives a loopback address; none when it can't be read."""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return frozenset()
    names = set()
    for line in text.splitlines():
        words = line.split("#", 1)[0].split()
        if len(words) > 1 and is_loopback(words[0].lower(), frozenset()):
            names.update(w.lower().rstrip(".") for w in words[1:])
    return frozenset(names)


def canonical(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def approved(scope: str, kind: str, digest: str) -> bool:
    return (scope, kind, digest) in APPROVED


def dig(data: Any, *keys: str) -> Any:
    for key in keys:
        if not isinstance(data, dict) or key not in data:
            return MISSING
        data = data[key]
    return data


def effective(sources: list[Source], *keys: str) -> tuple[Any, str | None]:
    """The value of the highest scope that sets it; within managed, the last file read."""
    for scope in PRECEDENCE:
        for source in reversed([s for s in sources if s.scope == scope]):
            value = dig(source.data, *keys)
            if value is not MISSING:
                return value, scope
    return MISSING, None


def listed(source: Source, *keys: str) -> list[Any]:
    value = dig(source.data, *keys)
    return value if isinstance(value, list) else []


def split_rule(rule: str) -> tuple[str, str | None]:
    match = re.fullmatch(r"([^()]+)\((.*)\)", rule.strip(), re.DOTALL)
    return (match.group(1).strip(), match.group(2)) if match else (rule.strip(), None)


def scopes_in(names: list[str]) -> str:
    return ", ".join(s for s in SHOWN_ORDER if s in names)


def read_floor(path: Path) -> str | None:
    """The Claude Code floor the toolchain's pins name: dotted numbers, or None when there is none to read."""
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None
    for line in text.splitlines():
        key, _, value = line.partition("=")
        if key.strip() == "CLAUDE_CODE_VERSION":
            value = value.strip()
            return value if re.fullmatch(r"\d+(?:\.\d+)+", value) else None
    return None


def rule_sources(sources: list[Source]) -> list[Source]:
    """The sources whose permission rules Claude Code reads: managed's alone when managed's
    allowManagedPermissionRulesOnly is true, a switch it takes from managed only; every source otherwise."""
    managed = [s for s in sources if s.scope == "managed"]
    only, _ = effective(managed, "allowManagedPermissionRulesOnly")
    return managed if only is True else sources


# ---------------------------------------------------------------------------------------------------------------
# The rules
# ---------------------------------------------------------------------------------------------------------------
def check_folders(
    sources: list[Source], folders: dict[str, str], report: Report
) -> list[str]:
    """SS3, SS4's denyRead, and SS5; the folders' lines for a pass."""
    workspace = folders["workflows"]
    ruled = rule_sources(sources)
    lines = []
    for name in PROTECTED:
        folder = folders[name]
        above = [folder, *(str(p) for p in Path(folder).parents)]
        wanted = {f"Read(/{p}/**)" if p != "/" else "Read(///**)" for p in above}
        read_by = [
            s.scope for s in ruled if wanted & set(listed(s, "permissions", "deny"))
        ]
        if not read_by:
            report.add(
                3,
                f"{name}: no scope's permissions.deny holds Read(//…/**) for it or for a folder above it",
            )
        hidden_by = [
            s.scope
            for s in sources
            if any(
                related(entry_path(e, workspace), folder) & {"at", "above"}
                for e in listed(s, "sandbox", "filesystem", "denyRead")
            )
        ]
        if not hidden_by:
            report.add(
                4,
                f"{name}: no scope's sandbox.filesystem.denyRead holds it or a folder above it",
            )
        reopened = False
        for source in sources:
            if source in ruled and any(
                rule_reaches(rule, folder, workspace)
                for rule in listed(source, "permissions", "allow")
            ):
                reopened = True
                report.add(
                    5,
                    f"{name}: a permissions.allow rule in {source.scope} names a path at or under it",
                )
            filesystem = dig(source.data, "sandbox", "filesystem")
            for key in sorted(filesystem) if isinstance(filesystem, dict) else []:
                if key.startswith("allow") and any(
                    reaches(entry_path(e, workspace), folder, subtree=True)
                    for e in listed(source, "sandbox", "filesystem", key)
                ):
                    reopened = True
                    report.add(
                        5,
                        f"{name}: a sandbox.filesystem.{key} entry in {source.scope} reaches it",
                    )
            if any(
                related(entry_path(e, workspace), folder) - {"apart"}
                for e in listed(source, "permissions", "additionalDirectories")
            ):
                reopened = True
                report.add(
                    5,
                    f"{name}: a permissions.additionalDirectories entry in {source.scope} is at, under, or "
                    "above it",
                )
        if related(workspace, folder) - {"apart"}:
            reopened = True
            report.add(5, f"{name}: the workspace is at, under, or above it")
        lines.append(
            f"{name:<{WIDTH}}Read denied ({scopes_in(read_by)}) · sandbox denyRead ({scopes_in(hidden_by)}) · "
            f"{'re-allowed' if reopened else 'not re-allowed'}"
        )
    return lines


def rule_reaches(rule: str, folder: str, workspace: str) -> bool:
    """SS5's first form: an allow rule naming a path at or under the folder. A file tool's specifier is a path pattern,
    whose bare folder stands for its contents; a Bash rule names paths among its words, and its * matches anything."""
    tool, spec = split_rule(rule)
    if spec is None or tool in ("WebFetch", "WebSearch") or tool.startswith("mcp__"):
        return False
    if tool == "Bash":
        words = re.findall(r"(?:~|/)[^\s'\"`;|&()<>]*", spec)
        return any(
            reaches(entry_path(w, workspace), folder, subtree=False) for w in words
        )
    return any(reaches(p, folder, subtree=True) for p in rule_paths(spec, workspace))


def check_sandbox(sources: list[Source], report: Report) -> str:
    """SS4's switches, SS6, and SS7; the sandbox's line for a pass."""
    enabled, by_enabled = effective(sources, "sandbox", "enabled")
    fails, by_fails = effective(sources, "sandbox", "failIfUnavailable")
    weaker, _ = effective(sources, "sandbox", "enableWeakerNestedSandbox")
    if enabled is not True:
        report.add(4, "sandbox: the effective sandbox.enabled isn't true")
    if fails is not True:
        report.add(4, "sandbox: the effective sandbox.failIfUnavailable isn't true")
    if weaker is True:
        report.add(
            4, "sandbox: the effective sandbox.enableWeakerNestedSandbox is true"
        )
    unsandboxed, _ = effective(sources, "sandbox", "allowUnsandboxedCommands")
    if unsandboxed is not False:
        report.add(
            6, "sandbox: the effective sandbox.allowUnsandboxedCommands isn't false"
        )
    for source in sources:
        if listed(source, "sandbox", "excludedCommands"):
            report.add(6, f"{source.scope}: sandbox.excludedCommands names a command")
    mode, _ = effective(sources, "permissions", "defaultMode")
    if mode == "bypassPermissions":
        report.add(
            7, "permissions: the effective permissions.defaultMode is bypassPermissions"
        )
    setters = [s for s in (by_enabled, by_fails) if s]
    return (
        f"{'sandbox':<{WIDTH}}enabled, fails if unavailable ({scopes_in(setters)}) · unsandboxed commands refused · "
        "no excluded commands · default mode not bypass"
    )


def check_routes(
    sources: list[Source],
    servers: dict[str, list[tuple[str, Any]]],
    names: frozenset[str],
    report: Report,
) -> str:
    """SS9, SS10, and SS11; the listeners' line for a pass."""
    for scope in SHOWN_ORDER:
        mine = [s for s in sources if s.scope == scope]
        n = 0
        for source in mine:
            for event, groups in source.data.get("hooks", {}).items():
                for group in groups:
                    for hook in group.get("hooks", []):
                        n += 1
                        digest = canonical(
                            {
                                "event": event,
                                "matcher": group.get("matcher"),
                                "hook": hook,
                            }
                        )
                        if not approved(scope, "hook", digest):
                            report.add(
                                9,
                                f"{scope}: hook {n}, sha256 {digest}, isn't on the approved list",
                            )
        for source in mine:
            for key in HELPERS:
                if source.data.get(key) is not None:
                    digest = canonical({"key": key, "value": source.data[key]})
                    if not approved(scope, "helper", digest):
                        report.add(
                            9,
                            f"{scope}: helper {key}, sha256 {digest}, isn't on the approved list",
                        )
        if any(
            value is not False
            for source in mine
            for value in source.data.get("enabledPlugins", {}).values()
        ):
            report.add(
                9,
                f"{scope}: an enabled plugin, whose hooks and servers don't show in the settings, so no approval "
                "covers it",
            )
    for scope, entries in servers.items():
        for n, (name, server) in enumerate(entries, start=1):
            digest = canonical({"name": name, "server": server})
            if not approved(scope, "mcp", digest):
                report.add(
                    9,
                    f"{scope}: MCP server {n}, sha256 {digest}, isn't on the approved list",
                )
    for source in sources:
        if any(
            is_loopback(host_of(entry), names)
            for entry in listed(source, "sandbox", "network", "allowedDomains")
        ):
            report.add(
                10,
                f"{source.scope}: sandbox.network.allowedDomains holds a loopback host",
            )
        for where in (("sandbox", "network"), ("sandbox",)):
            node = dig(source.data, *where)
            if not isinstance(node, dict):
                continue
            prefix = ".".join(where)
            if node.get("allowLocalBinding") is True:
                report.add(10, f"{source.scope}: {prefix}.allowLocalBinding is true")
            for key in ("allowUnixSockets", "allowAllUnixSockets"):
                if node.get(key) not in (None, False, []):
                    report.add(
                        10, f"{source.scope}: {prefix}.{key} allows a local socket"
                    )
            for key in ("httpProxyPort", "socksProxyPort"):
                if node.get(key) is not None:
                    report.add(
                        10,
                        f"{source.scope}: {prefix}.{key} sets a proxy of its own, whose allowlist the check can't "
                        "read",
                    )
    # SS11: a deny wins over an allow in Claude Code, from any scope whose rules it reads.
    ruled = rule_sources(sources)
    denied = any(
        split_rule(rule) == ("WebFetch", None)
        for source in ruled
        for rule in listed(source, "permissions", "deny")
    )
    for source in [] if denied else ruled:
        for rule in listed(source, "permissions", "allow"):
            tool, spec = split_rule(rule)
            if tool != "WebFetch":
                continue
            if spec is None or not spec.strip().startswith("domain:"):
                report.add(
                    11,
                    f"{source.scope}: a permissions.allow rule allows WebFetch for every host",
                )
            elif is_loopback(host_of(spec.strip()[len("domain:") :]), names):
                report.add(
                    11,
                    f"{source.scope}: a permissions.allow rule allows WebFetch for a loopback host",
                )
    return (
        f"{'listeners':<{WIDTH}}no hook, MCP server, or helper command beyond the approved list · no plugin · no "
        "loopback host, local binding, local socket, or proxy of its own · WebFetch for no loopback host"
    )


# ---------------------------------------------------------------------------------------------------------------
# The run
# ---------------------------------------------------------------------------------------------------------------
def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="studio_settings_check.py",
        description="The studio settings check (spec 004 FR-025). The Author's run takes no option; the options are "
        "the tests'.",
    )
    parser.add_argument("--list", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--managed", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--managed-dir", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--managed-mcp", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--win-managed", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--win-managed-dir", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--win-managed-mcp", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--toolchain", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--hosts", type=Path, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    overridden = any(value is not None for value in vars(args).values())
    report = Report([], [])
    folders = read_list(args.list or LIST, report)
    if report.stops():
        return finish(report, [], overridden)
    workspace = folders["workflows"]
    floor = read_floor(args.toolchain or TOOLCHAIN)
    if floor is None:
        report.add(8, "claude code: the floor in the toolchain's pins can't be read")
    elif floor != CLAUDE_CODE:
        report.add(
            8,
            f"claude code: the floor is {floor}, but the check knows the keys of Claude Code {CLAUDE_CODE}",
        )
    report.scope_lines.append(
        f"{'claude code':<{WIDTH}}floor {floor or 'unreadable'}"
        + (", the version whose keys the check knows" if floor == CLAUDE_CODE else "")
    )
    config = Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude")
    claude_json = (
        Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home()) / ".claude.json"
    )
    sources: list[Source] = []

    def settings(path: Path, scope: str, shown: str) -> None:
        data, line = read_json(path, scope, report)
        report.scope_lines.append(f"{shown:<{WIDTH}}{line}")
        if data is not None:
            shape(scope, data, report)
            sources.append(Source(scope, data))

    def dropins(folder: Path, shown: str) -> None:
        try:
            names = sorted(
                p.name
                for p in folder.iterdir()
                if p.name.endswith(".json") and p.is_file()
            )
        except OSError:
            names = []
        combined = hashlib.sha256()
        for name in names:
            data, line = read_json(folder / name, "managed", report)
            combined.update(f"{name}\0{line}\n".encode())
            if data is not None:
                shape("managed", data, report)
                sources.append(Source("managed", data))
        report.scope_lines.append(
            f"{shown:<{WIDTH}}"
            + (
                f"{len(names)} file{'s' if len(names) != 1 else ''}, sha256 {combined.hexdigest()}"
                if names
                else "absent"
            )
        )

    servers: dict[str, list[tuple[str, Any]]] = {"managed.mcp": []}

    def managed_mcp(path: Path, shown: str) -> None:
        mcp, line = read_json(path, "managed.mcp", report)
        report.scope_lines.append(f"{shown:<{WIDTH}}{line}")
        try:
            if mcp is not None:
                servers["managed.mcp"] += list(servers_of(mcp, "").items())
        except Strict as exc:
            report.add(2, f"managed.mcp: {exc}")

    # Linux's managed files, then Windows', which Claude Code under WSL reads too: each a scope line of its own, and
    # all of them managed, a later file over an earlier one.
    settings(args.managed or MANAGED_SETTINGS, "managed", "managed")
    dropins(args.managed_dir or MANAGED_DIR, "managed.d")
    managed_mcp(args.managed_mcp or MANAGED_MCP, "managed.mcp")
    settings(args.win_managed or WIN_MANAGED_SETTINGS, "managed", "managed.win")
    dropins(args.win_managed_dir or WIN_MANAGED_DIR, "managed.win.d")
    managed_mcp(args.win_managed_mcp or WIN_MANAGED_MCP, "managed.win.mcp")
    settings(config / "settings.json", "user", "user")
    # The user scope's servers, and the workspace's own entry's, by the path the list gives and the one it resolves to.
    # The line hashes those two lists alone, never the whole file, which Claude Code rewrites as it runs.
    user, line = read_json(claude_json, "user.mcp", report)
    if user is not None:
        line = "sha256 of its server lists can't be taken"
        try:
            projects = user.get("projects", {})
            if not isinstance(projects, dict):
                raise Strict("projects isn't an object")
            entries = [
                projects[key]
                for key in dict.fromkeys([workspace, os.path.realpath(workspace)])
                if key in projects
            ]
            if not all(isinstance(entry, dict) for entry in entries):
                raise Strict("the workspace's entry under projects isn't an object")
            servers["user.mcp"] = [
                *servers_of(user, "").items(),
                *(
                    item
                    for entry in entries
                    for item in servers_of(entry, "the workspace's entry's ").items()
                ),
            ]
            lists = {
                "user": user.get("mcpServers"),
                "workspace": [entry.get("mcpServers") for entry in entries] or None,
            }
            line = f"sha256 {canonical(lists)}"
        except Strict as exc:
            report.add(2, f"user.mcp: {exc}")
    elif line.startswith(
        "sha256 "
    ):  # the file is there, but isn't a strict JSON object
        line = "sha256 of its server lists can't be taken"
    report.scope_lines.append(f"{'user.mcp':<{WIDTH}}{line}")
    settings(Path(workspace) / ".claude" / "settings.json", "workspace", "workspace")
    settings(
        Path(workspace) / ".claude" / "settings.local.json",
        "workspace.local",
        "workspace.local",
    )
    project, line = read_json(Path(workspace) / ".mcp.json", "workspace.mcp", report)
    report.scope_lines.append(f"{'workspace.mcp':<{WIDTH}}{line}")
    try:
        servers["workspace.mcp"] = (
            list(servers_of(project, "").items()) if project is not None else []
        )
    except Strict as exc:
        report.add(2, f"workspace.mcp: {exc}")
    if report.stops():
        return finish(report, [], overridden)
    lines = check_folders(sources, folders, report)
    lines.append(check_sandbox(sources, report))
    lines.append(
        check_routes(sources, servers, hosts_names(args.hosts or HOSTS), report)
    )
    return finish(report, lines, overridden)


def finish(report: Report, lines: list[str], overridden: bool) -> int:
    findings = [text for _, text in sorted(report.findings, key=lambda f: f[0])]
    if findings:
        n = len(findings)
        print(f"studio-settings: FAIL: {n} finding{'s' if n != 1 else ''}")
        print("\n".join(findings))
    else:
        print(
            "studio-settings: PASS: the studio session's settings deny the photos folder and the blinding key, to the "
            "file tools and in the sandbox, and give it no route to a loopback listener"
        )
        print("\n".join(lines))
    if report.scope_lines:
        print("\n".join(report.scope_lines))
    if overridden:
        print(
            f"{'note':<{WIDTH}}locations set by options, as the tests set them: this run proves nothing about the "
            "studio's own settings"
        )
    if not findings:
        return 0
    return 2 if report.stops() else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
