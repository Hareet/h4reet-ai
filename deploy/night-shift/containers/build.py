#!/usr/bin/env python3
"""Make the night shift's container specs and allowlists (spec 017; plan.md §2; contracts/containers.md).

    python3 -I -B deploy/night-shift/containers/build.py [--check] [--settings FILE]
    python3 -I -B build.py --fill DIR --facts FILE --home PATH --tag SHA12 [--settings FILE]   (the install's)

From `fragments.json` beside it, it writes one spec per role (`<role>.json` here) and the three allowlists
(`../allowlist.json`, `../allowlist-studio.json`, `../allowlist-plan.json`). The night allowlist follows main's
settings: by default it reads them as `GIT_NO_REPLACE_OBJECTS=1 git cat-file blob refs/heads/main:.claude/settings.json`
from the repository it sits in; `--settings FILE` reads a copy instead (the tests' fixture).

A spec holds its role's own mounts only. The runner adds the task's (the worktree, `.git`, the masks it computes
from main's settings at each start, the role's Claude folder, and the io folder), as `x-h4.task` names, and refuses
a spec mount that touches any of them (contracts/containers.md §4; contracts/runner.md §3).

`--check` writes nothing: it exits 1 naming each file that differs from what it would make (or is missing), and 0
when every one matches. Exit 2: it couldn't run (unreadable settings or fragments, an unknown placeholder, or a
runner token in a spec, which the runner never fills). The output is JSON in the shape Prettier gives it, so
`make lint` and `--check` agree.

`--fill DIR` is the install's fill step (contracts/install.md, G4), run from a temp copy of the commit: it refuses
(exit 1) unless every committed file is what it would make, then writes each spec with `x-h4` dropped and every
placeholder filled (from `--facts`, `--home`, and `--tag`) into `DIR/containers/`. A placeholder left over refuses the
whole fill (exit 1), and nothing is written.

Standard library only. It runs nothing but that one `git cat-file`.
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
NIGHT = HERE.parent
WIDTH = 120  # Prettier's printWidth here (tools/gates/lint-node/prettier.config.json)
PLACEHOLDER = re.compile(r"\{\{([^{}]*)\}\}")
TASKS = ("writing", "reading", "none", "plan")
ORDER = [
    "role",
    "parent",
    "image",
    "user",
    "mounts",
    "networks",
    "env",
    "env_file",
    "cap_drop",
    "security_opt",
    "read_only",
    "tmpfs",
    "limits",
    "gpus",
    "requests",
    "x-h4",
]


class BuildError(Exception):
    """One line saying why the build can't run (exit 2)."""


# ---------------------------------------------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------------------------------------------
def read_settings(path: str | None) -> dict:
    if path is not None:
        try:
            text = Path(path).read_text(encoding="utf-8")
        except OSError as e:
            raise BuildError(f"can't read {path}: {e.strerror}") from None
        where = path
    else:
        env = dict(os.environ)
        env.update(
            GIT_NO_REPLACE_OBJECTS="1",
            GIT_CONFIG_NOSYSTEM="1",
            GIT_CONFIG_GLOBAL="/dev/null",
        )
        done = subprocess.run(
            [
                "git",
                "--no-replace-objects",
                "-C",
                str(HERE),
                "cat-file",
                "blob",
                "refs/heads/main:.claude/settings.json",
            ],
            capture_output=True,
            text=True,
            env=env,
            check=False,
        )
        if done.returncode != 0:
            raise BuildError(
                "can't read refs/heads/main:.claude/settings.json here; pass --settings FILE"
            )
        text, where = done.stdout, "refs/heads/main:.claude/settings.json"
    try:
        data = json.loads(text)
    except ValueError:
        raise BuildError(f"{where} isn't valid JSON") from None
    sandbox = data.get("sandbox") if isinstance(data, dict) else None
    net = sandbox.get("network") if isinstance(sandbox, dict) else None
    allowed = net.get("allowedDomains") if isinstance(net, dict) else None
    if not isinstance(allowed, list) or not all(isinstance(v, str) for v in allowed):
        raise BuildError(
            f"{where} has no sandbox.network.allowedDomains list of strings"
        )
    return data


def read_fragments() -> tuple[dict, str]:
    try:
        raw = (HERE / "fragments.json").read_text(encoding="utf-8")
        return json.loads(raw), raw
    except (OSError, ValueError) as e:
        raise BuildError(f"can't read fragments.json: {e}") from None


# ---------------------------------------------------------------------------------------------------------------
# Composing a spec
# ---------------------------------------------------------------------------------------------------------------
def expand(entry: dict) -> dict:
    if "path" in entry:
        return {
            "host": entry["path"],
            "container": entry["path"],
            "mode": entry["mode"],
        }
    return {
        "host": entry["host"],
        "container": entry["container"],
        "mode": entry["mode"],
    }


def compose(frag: dict, role: str) -> dict:
    r = frag["roles"][role]
    if r["task"] not in TASKS:
        raise BuildError(f"{role}: task must be one of {', '.join(TASKS)}")
    if r["parent"] not in set(frag["roles"]) | {"ceiling", "runner"}:
        raise BuildError(f"{role}: unknown parent {r['parent']}")
    mounts = [expand(e) for group in r["mounts"] for e in frag["mounts"][group]]
    # Parents before children: a mount's own path count, then the path, so the order never depends on the machine.
    mounts.sort(key=lambda m: (m["container"].count("/"), m["container"]))
    env: dict[str, str] = {}
    for group in r["env"]:
        env.update(
            {k: v.replace("{role}", role) for k, v in frag["env"][group].items()}
        )
    for net in r["networks"]:
        if not frag["networks"].get(net, {}).get("internal"):
            raise BuildError(f"{role}: {net} isn't one of the internal networks")
    spec = {
        "role": role,
        "parent": r["parent"],
        "image": frag["images"][r["image"]],
        "user": frag["base"]["user"],
        "mounts": mounts,
        "networks": list(r["networks"]),
        "env": dict(sorted(env.items())),
        "env_file": frag["env_files"][r["env_file"]] if r["env_file"] else None,
        "cap_drop": list(frag["base"]["cap_drop"]),
        "security_opt": list(frag["base"]["security_opt"]),
        # GPU containers run without a read-only root: the NVIDIA runtime's hook writes into it at start (R-18).
        "read_only": "gpus" not in r,
        "tmpfs": list(frag["tmpfs"][r["tmpfs"]]),
        "limits": dict(frag["limits"][r["limits"]]),
        "requests": list(r["requests"]),
        "x-h4": {"example": True, "task": r["task"]},
    }
    if "gpus" in r:
        spec["gpus"] = r["gpus"]
    return {k: spec[k] for k in ORDER if k in spec}


def strings(value: object) -> list[str]:
    """Every key and string value in a JSON value."""
    if isinstance(value, dict):
        return [s for k, v in value.items() for s in [k, *strings(v)]]
    if isinstance(value, list):
        return [s for v in value for s in strings(v)]
    return [value] if isinstance(value, str) else []


def check_names(frag: dict, name: str, spec: dict) -> None:
    text = "\n".join(strings(spec))
    for found in PLACEHOLDER.findall(text):
        if found not in frag["placeholders"]:
            raise BuildError(f"{name}: unknown placeholder {{{{{found}}}}}")
    if text.count("{{") != len(PLACEHOLDER.findall(text)) or text.count(
        "}}"
    ) != text.count("{{"):
        raise BuildError(f"{name}: a malformed placeholder")
    paths = [m[k] for m in spec["mounts"] for k in ("host", "container")] + list(
        spec["tmpfs"]
    )
    paths.append(spec["env_file"] or "")
    for value in paths:
        if "<" in value or ">" in value:
            raise BuildError(
                f"{name}: {value} holds a runner token; the runner fills none in a spec"
            )


# ---------------------------------------------------------------------------------------------------------------
# The allowlists
# ---------------------------------------------------------------------------------------------------------------
def hostnames(entries: list[str]) -> list[str]:
    """As egress-proxy.py's parse_domains keeps them: no `host:port` entry, no IP literal, lowercased."""
    out = []
    for entry in entries:
        name = entry.strip()
        if not name or ":" in name:
            continue
        try:
            ipaddress.ip_address(name.removeprefix("*."))
            continue
        except ValueError:
            out.append(name.lower())
    return out


def allowlist(frag: dict, name: str, settings: dict) -> dict:
    a = frag["allowlists"][name]
    hosts = list(a.get("hosts", []))
    if a.get("from_settings"):
        hosts += settings["sandbox"]["network"]["allowedDomains"]
    hosts += a.get("add", [])
    return {"sandbox": {"network": {"allowedDomains": sorted(set(hostnames(hosts)))}}}


# ---------------------------------------------------------------------------------------------------------------
# Output, as Prettier prints JSON: objects broken one key a line, arrays of plain values on one line when that fits
# ---------------------------------------------------------------------------------------------------------------
def render(value: object) -> str:
    return _render(value, 0, 0, 0) + "\n"


def _scalar(value: object) -> str:
    return json.dumps(value, ensure_ascii=False)


def _render(value: object, indent: int, lead: int, trail: int) -> str:
    pad = " " * indent
    inner = " " * (indent + 2)
    if isinstance(value, dict):
        if not value:
            return "{}"
        items = list(value.items())
        lines = []
        for i, (k, v) in enumerate(items):
            key = f"{_scalar(k)}: "
            comma = "," if i < len(items) - 1 else ""
            lines.append(
                inner
                + key
                + _render(v, indent + 2, len(inner) + len(key), len(comma))
                + comma
            )
        return "{\n" + "\n".join(lines) + "\n" + pad + "}"
    if isinstance(value, list):
        if not value:
            return "[]"
        if all(not isinstance(v, (dict, list)) for v in value):
            flat = "[" + ", ".join(_scalar(v) for v in value) + "]"
            if lead + len(flat) + trail <= WIDTH:
                return flat
        lines = []
        for i, v in enumerate(value):
            comma = "," if i < len(value) - 1 else ""
            lines.append(inner + _render(v, indent + 2, len(inner), len(comma)) + comma)
        return "[\n" + "\n".join(lines) + "\n" + pad + "]"
    return _scalar(value)


# ---------------------------------------------------------------------------------------------------------------
def outputs(settings: dict) -> dict[Path, str]:
    frag, raw = read_fragments()
    for found in PLACEHOLDER.findall(raw):
        if found not in frag["placeholders"]:
            raise BuildError(f"fragments.json: unknown placeholder {{{{{found}}}}}")
    files: dict[Path, str] = {}
    for role in frag["roles"]:
        spec = compose(frag, role)
        check_names(frag, f"{role}.json", spec)
        files[HERE / f"{role}.json"] = render(spec)
    for name in frag["allowlists"]:
        files[NIGHT / name] = render(allowlist(frag, name, settings))
    return files


def read_facts_data(path: str) -> dict[str, str]:
    """The facts file as data, never sourced (data-model.md); the install has already checked it with the runner's
    own read_facts."""
    try:
        text = Path(path).read_text(encoding="utf-8")
    except OSError as e:
        raise BuildError(f"can't read {path}: {e.strerror}") from None
    facts: dict[str, str] = {}
    for line in text.splitlines():
        s = line.strip()
        if s and not s.startswith("#") and "=" in s:
            key, _, value = s.partition("=")
            facts[key] = value
    return facts


def fill_value(value: object, values: dict[str, str]) -> object:
    if isinstance(value, dict):
        return {k: fill_value(v, values) for k, v in value.items()}
    if isinstance(value, list):
        return [fill_value(v, values) for v in value]
    if isinstance(value, str):
        return PLACEHOLDER.sub(lambda m: values.get(m.group(1), m.group(0)), value)
    return value


def fill(out: Path, facts_path: str, home: str, tag: str) -> int:
    """The install's fill step (contracts/install.md; plan §6 step 2): each committed spec, the example marker
    dropped and every placeholder filled from the facts file, `--home`, and `--tag`, into `<out>/containers/`.
    A placeholder left over refuses the whole fill (exit 1), and nothing is written."""
    if not re.fullmatch(r"[0-9a-f]{12}", tag):
        raise BuildError("--tag must be the reviewed SHA's first twelve characters")
    if not os.path.isabs(home) or os.path.normpath(home) != home:
        raise BuildError("--home must be an absolute, normal path")
    frag, _raw = read_fragments()
    facts = read_facts_data(facts_path)
    values = {k: facts[k] for k in frag["placeholders"] if k in facts}
    values.update(HOME=home, IMAGE_TAG=tag)
    for k, v in values.items():
        if "{{" in v or "}}" in v or any(ord(c) < 32 for c in v):
            raise BuildError(f"the value for {{{{{k}}}}} is malformed")
    made: dict[str, str] = {}
    for role in frag["roles"]:
        try:
            spec = json.loads((HERE / f"{role}.json").read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            raise BuildError(f"can't read {role}.json: {e}") from None
        spec.pop("x-h4", None)
        text = render(fill_value(spec, values))
        left = PLACEHOLDER.findall(text)
        if left or "{{" in text:
            print(
                f"build: {role}.json: a placeholder is left: {{{{{left[0] if left else '?'}}}}}"
            )
            return 1
        made[f"{role}.json"] = text
    (out / "containers").mkdir(parents=True, exist_ok=True)
    for name, text in made.items():
        (out / "containers" / name).write_text(text, encoding="utf-8")
    print(f"build: filled {len(made)} specs into {out / 'containers'}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Make the night shift's container specs and allowlists."
    )
    parser.add_argument(
        "--check", action="store_true", help="write nothing; exit 1 if a file differs"
    )
    parser.add_argument(
        "--settings",
        help="a copy of main's .claude/settings.json (default: refs/heads/main's)",
    )
    parser.add_argument(
        "--fill",
        metavar="DIR",
        help="the install's fill step: write the filled live specs into DIR/containers (needs --facts, --home, --tag)",
    )
    parser.add_argument("--facts", help="--fill: the facts file")
    parser.add_argument("--home", help="--fill: the value of {{HOME}}")
    parser.add_argument("--tag", help="--fill: the value of {{IMAGE_TAG}}")
    args = parser.parse_args(argv)
    try:
        files = outputs(read_settings(args.settings))
    except (BuildError, KeyError, TypeError) as e:
        print(f"build: {e}", file=sys.stderr)
        return 2
    if args.fill is not None:
        if not (args.facts and args.home and args.tag):
            print("build: --fill needs --facts, --home, and --tag", file=sys.stderr)
            return 2
        stale = [
            str(p.relative_to(NIGHT))
            for p, text in files.items()
            if not p.exists() or p.read_text(encoding="utf-8") != text
        ]
        if stale:
            for r in stale:
                print(f"build: differs: {r}")
            print(
                "build: can't fill: the committed specs aren't what fragments.json makes"
            )
            return 1
        try:
            return fill(Path(args.fill), args.facts, args.home, args.tag)
        except (BuildError, KeyError, TypeError) as e:
            print(f"build: {e}", file=sys.stderr)
            return 2
    differ = []
    for path, text in files.items():
        try:
            current = path.read_text(encoding="utf-8")
        except OSError:
            current = None
        if current != text:
            differ.append(path)
    rel = [str(p.relative_to(NIGHT)) for p in differ]
    if args.check:
        for r in rel:
            print(f"build: differs: {r}")
        if not differ:
            print(f"build: up to date ({len(files)} files)")
        return 1 if differ else 0
    for path in differ:
        path.write_text(files[path], encoding="utf-8")
    for r in rel:
        print(f"build: wrote {r}")
    if not differ:
        print("build: unchanged")
    return 0


if __name__ == "__main__":
    sys.exit(main())
