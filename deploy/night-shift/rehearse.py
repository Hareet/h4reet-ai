#!/usr/bin/env python3
"""The install's Python half, and the rehearsal (spec 017; plan.md §6, §9; contracts/install.md).

    /usr/bin/python3 -I -B rehearse.py facts --night NIGHT_PY --facts FILE --pins PINS
    /usr/bin/python3 -I -B rehearse.py pins --pins PINS --facts FILE --tag SHA12
    /usr/bin/python3 -I -B rehearse.py step R1|R2|R3|R4 --sha SHA [--all]

`install.sh` runs the first two from a temp copy it wrote with `git show <sha>:…`, before anything is installed:
`facts` checks the facts file with the runner's own `read_facts`, and `pins` turns `images/pins.json` into one line a
fact for the shell (`base`, `build`, `ctx`, `main`, `arg`), every token checked so `read` can split it.

`step` runs one rehearsal step from the installed copy (`~/.local/share/h4reet-ai/night-shift/rehearse.py`), and
loads the installed runner (`night.py` beside it) only after its SHA-256 matches `installed.txt`. Each session it
starts is built by the runner's own code: `load_live_spec` (the SHA-256, the example marker, the spec's rules),
`ensure_worktree`, `ensure_io`, `task_mounts` (the narrow `.git` mount and the masks from main's settings), and
`build_run_argv`, then started by the image ID `installed.txt` records. So the rehearsal proves the runner's line:

- R1: an implementer session on a scratch worktree of the SHA answers `ok` on the night-shift token;
- R2: the same line with a stand-in `ANTHROPIC_API_KEY`, then `ANTHROPIC_AUTH_TOKEN`: the runner's last look
  refuses it (layer 1), and the image's managed settings neutralize or refuse it with no API call, proven by the
  egress proxy's log as the container probe did (layer 2, research R-18);
- R3: `make setup && make check` in the implementer's container (make check holds the red-team suite and the
  matrix). Known, environmental results don't fail it, and each is named: KNOWN_FAIL, the matrix's stage-S rows
  (P-5), and PENDING gates (the Author's runs);
- R4: the rows of `redteam/night-shift/rows.json` marked `rehearsal` (all of them with `--all`, which
  `redteam/night-shift/run.sh` passes), each expecting its refusal, plus one row for each read-only mask the runner
  computed for the ops task.

The rehearsal's state (the egress helpers' logs, the runner's log, R3's log) lives in
`~/.local/state/h4reet-ai/night-shift/rehearsal/`, never in the night's own state. Its worktrees are
`<NIGHT_ROOT>/rehearsal/rehearse-<role>` on `night/rehearse-<role>/<sha12>`, removed with their branches at the end.
It prints one line a result and never a secret: a row's output is never shown, only its size; an error line is
redacted and cut. Standard library only.
"""

from __future__ import annotations

import argparse
import dataclasses
import fcntl
import hashlib
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

SAFE_TOKEN = re.compile(r"[A-Za-z0-9._:/@+=,-]+")
DIGEST = re.compile(r"sha256:[0-9a-f]{64}")
SHA40 = re.compile(r"[0-9a-f]{40}")
PATH_SAFE = re.compile(r"/[A-Za-z0-9._/+-]*")
ROW_ID = re.compile(r"[a-z0-9][a-z0-9-]{1,80}")
PLACEHOLDER = re.compile(r"@([A-Z]+)@")

STANDIN = "probe-not-a-credential"
STANDIN_VARS = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")
API_HOST = "api.anthropic.com"

ROW_KEYS = (
    "id",
    "role",
    "kind",
    "category",
    "command",
    "expect",
    "layer",
    "rehearsal",
)
OPTIONAL_KEYS = (
    "target",
    "spelling",
    "host",
    "creates",
    "check",
    "var",
    "bounds",
    "note",
)
KINDS = ("container", "runner")
CATEGORIES = ("read", "write", "socket", "network", "signin", "gap", "request", "spec")
LAYERS = ("mount", "ro-mount", "network", "proxy", "runner", "gap")
RUNNER_CHECKS = (
    "bare",
    "env",
    "plan-off",
    "gate-off",
    "example-spec",
    "placeholder-spec",
)
ROW_PLACEHOLDERS = ("HOME", "REPO", "GIT", "WT", "ADMIN", "OTHER", "ID")

# make check's gates whose FAIL is known and environmental in a night container, each with why (R3).
KNOWN_FAIL = {
    "toolchain-check": "the night images pin Claude Code at pins.json's version, which toolchain.vars doesn't name until P-8",
    "image": "it builds the compose images on the agents' engine, through engine-fwd; it fails when the engine is down",
}
# The policy gate's one line that only P-12 (a tools/gates change, the Author's) clears: the worker's toolchain base.
P12_POLICY = re.compile(
    r"FAIL deploy/night-shift/images/worker\.Dockerfile:\d+: FROM: \$\{TOOLCHAIN_IMAGE\}: a build argument without a default"
)
R3_COMMAND = "make setup && make check"
R3_TIMEOUT = 2 * 3600
ROW_TIMEOUT = 60
MIN_RAN = 0.9  # R4 fails when fewer than this share of its rows actually ran
# make exits 2 when a recipe fails, and run_checks exits 1 when any gate is FAIL or PENDING: either ends a make check
# that finished. Any other non-zero exit (137, a kill; 124, the timeout) is a run that didn't.
R3_FINISHED = (0, 1, 2)
R3_SUMMARY = re.compile(r"^make check: \d+ PASS, ", re.MULTILINE)
REHEARSAL_TASK = (
    "## The rehearsal\n"
    "This session is the install's rehearsal, not a task. Do nothing else: reply with exactly the word ok and nothing else."
)
FAKE_RESOURCES = "H4_NIGHT_TEST_RESOURCES"  # "<disk GB>,<free memory GB>,<total memory GB>", the install's tests only
SESSION_TIMEOUT = 300

REDACT = (
    (re.compile(r"sk-ant-[A-Za-z0-9_-]+"), "sk-ant-<redacted>"),
    (
        re.compile(
            r"((?:token|password|passwd|secret|api_?key)[^:=\s]*\s*[:=]\s*).*",
            re.IGNORECASE,
        ),
        r"\1<redacted>",
    ),
    (
        re.compile(r"(authorization[^:=\s]{0,2}\s*[:=]\s*).*", re.IGNORECASE),
        r"\1<redacted>",
    ),
)


class Stop(Exception):
    """A step can't go on: one line."""


def redact(text: str, width: int = 120) -> str:
    line = " ".join(str(text).split())
    for pattern, repl in REDACT:
        line = pattern.sub(repl, line)
    return line[:width]


def redact_line(line: str) -> str:
    """One line as ops.md's filter leaves it, whole (R3's log)."""
    for pattern, repl in REDACT:
        line = pattern.sub(repl, line)
    return line


def last_line(text: str) -> str:
    lines = [x for x in (text or "").splitlines() if x.strip()]
    return redact(lines[-1]) if lines else "no output"


def say(line: str) -> None:
    print(line, flush=True)


# ---- installed.txt and the runner --------------------------------------------------------------------------------
def read_installed(path: str) -> dict[str, dict[str, str] | list[str] | str]:
    files: dict[str, str] = {}
    images: dict[str, str] = {}
    sha = ""
    try:
        text = Path(path).read_text(encoding="utf-8")
    except OSError:
        raise Stop(f"can't read {path}: run install.sh first") from None
    for line in text.splitlines():
        kind, _, rest = line.partition(" ")
        if kind == "sha":
            sha = rest.strip()
        elif kind in ("file", "image"):
            name, _, value = rest.rpartition(" ")
            (files if kind == "file" else images)[name] = value
    return {"file": files, "image": images, "sha": sha}


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def load_night(path: str, want: str | None = None):
    """The runner, loaded by path (never from sys.path), after its SHA-256 matches what the install recorded."""
    if want is not None and sha256(path) != want:
        raise Stop(f"{path}'s SHA-256 isn't the one installed.txt records")
    spec = importlib.util.spec_from_file_location("night", path)
    if spec is None or spec.loader is None:
        raise Stop(f"can't load {path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["night"] = mod
    spec.loader.exec_module(mod)
    return mod


def parse_facts_data(path: str) -> dict[str, str]:
    facts: dict[str, str] = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if s and not s.startswith("#") and "=" in s:
            k, _, v = s.partition("=")
            facts[k] = v
    return facts


# ---- facts and pins (before the install) -------------------------------------------------------------------------
def disk_floor(N, gb: int | None) -> int:
    """The disk floor for this run: the runner's own, or the Author's --disk-floor, from 5 to 15 GB (2026-11-12)."""
    if gb is None:
        return N.MIN_DISK
    if not N.MIN_DISK_OVERRIDE <= gb * 2**30 <= N.MIN_DISK:
        raise Stop("--disk-floor takes a whole number of GB from 5 to 15")
    say(
        f"note: the disk floor is {gb} GB for this run (--disk-floor); a night keeps {N.MIN_DISK // 2**30} GB"
    )
    return gb * 2**30


def cmd_facts(args) -> int:
    night = load_night(args.night)
    try:
        facts = night.read_facts(args.facts)
    except night.CantRun as e:
        say(f"facts: {e}")
        return 1
    for key in night.PATH_FACTS:
        if re.search(r"\s", facts[key]):
            say(
                f"facts: {key} holds a space or other whitespace, which the install's shell can't pass safely"
            )
            return 1
    if facts["UID"] != str(os.getuid()) or facts["GID"] != str(os.getgid()):
        say(
            f"facts: UID and GID must be yours ({os.getuid()}:{os.getgid()}), not {facts['UID']}:{facts['GID']}"
        )
        return 1
    home = os.path.realpath(os.path.expanduser("~"))
    if not night.is_under(facts["NIGHT_ROOT"], home):
        say(f"facts: NIGHT_ROOT must sit in your home ({home})")
        return 1
    try:
        pins = json.loads(Path(args.pins).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        say("facts: can't read pins.json")
        return 1
    if facts["CLAUDE_VERSION"] != pins.get("claude_code"):
        say(
            f"facts: CLAUDE_VERSION is {facts['CLAUDE_VERSION']}, but the images pin {pins.get('claude_code')}"
        )
        return 1
    # before any build (2026-11-12): the heavy-scripts rule
    why = night.resources_short(effects(night), disk_floor(night, args.disk_floor))
    if why:
        say(f"facts: {why}")
        return 1
    for key in ("REPO", "NIGHT_ROOT", "UID", "GID", "NIGHT_PLAN", "NIGHT_GATE"):
        say(f"fact {key} {facts[key]}")
    say("facts: ok")
    return 0


def _resolve(pins: dict, facts: dict, source: dict) -> str:
    path = source["from"].split(".")
    if path[0] == "facts":
        value = facts.get(path[1])
        if value is None:
            raise Stop(f"pins: facts has no {path[1]}")
    else:
        value = pins
        for p in path:
            value = value[p]
    if isinstance(value, list):
        if "join" not in source:
            raise Stop(f"pins: {source['from']} is a list with no join")
        value = source["join"].join(value)
    return str(value)


def _token(value: str, what: str) -> str:
    if not SAFE_TOKEN.fullmatch(value):
        raise Stop(f"pins: {what} holds a character the install can't pass ({value!r})")
    return value


def cmd_pins(args) -> int:
    try:
        pins = json.loads(Path(args.pins).read_text(encoding="utf-8"))
        facts = parse_facts_data(args.facts)
        if not re.fullmatch(r"[0-9a-f]{12}", args.tag):
            raise Stop("pins: the tag must be the SHA's first twelve characters")
        out = [f"claude {_token(pins['claude_code'], 'claude_code')}"]
        for key, b in pins["bases"].items():
            digest = b.get("digest")
            if digest is not None and not DIGEST.fullmatch(str(digest)):
                raise Stop(f"pins: base {key}'s digest isn't sha256:<64 hex>")
            out.append(
                f"base {_token(key, 'a base name')} {_token(b['image'], key)} {_token(b['tag'], key)} {digest or 'null'}"
            )
        tc = pins["toolchain"]
        out.append(f"build toolchain {_token(tc['dockerfile'], 'toolchain')}")
        out += [f"ctx toolchain {_token(p, 'toolchain')}" for p in tc["context"]]
        out += [
            f"arg toolchain {_token(k, k)} {_token(str(v), k)}"
            for k, v in tc["args"].items()
        ]
        for name, img in pins["images"].items():
            _token(name, "an image name")
            out.append(f"build {name} {_token(img['dockerfile'], name)}")
            mains = set(img.get("context_from_main", []))
            for p in img["context"]:
                out.append(
                    f"{'main' if p in mains else 'ctx'} {name} {_token(p, name)}"
                )
            for k, basekey in img.get("bases", {}).items():
                if basekey == "toolchain":
                    value = f"h4-night-toolchain:{args.tag}"
                else:
                    b = pins["bases"][basekey]
                    value = f"{b['image']}@{b['digest']}" if b.get("digest") else "null"
                out.append(f"arg {name} {_token(k, k)} {_token(value, k)}")
            for k, source in img.get("args", {}).items():
                out.append(
                    f"arg {name} {_token(k, k)} {_token(_resolve(pins, facts, source), k)}"
                )
    except Stop as e:
        say(str(e))
        return 1
    except (OSError, ValueError, KeyError, TypeError) as e:
        say(f"pins: pins.json is malformed ({type(e).__name__}: {e})")
        return 1
    for line in out:
        say(line)
    return 0


# ---- rows ----------------------------------------------------------------------------------------------------------
def load_rows(path: str) -> list[dict]:
    """rows.json, checked: one line saying what's wrong, or the rows."""
    try:
        doc = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise Stop(f"rows: can't read {path} ({type(e).__name__})") from None
    if (
        not isinstance(doc, dict)
        or doc.get("schema") != 1
        or not isinstance(doc.get("rows"), list)
    ):
        raise Stop("rows: schema must be 1, with a rows list")
    seen = set()
    for i, r in enumerate(doc["rows"]):
        where = f"rows[{i}]"
        if not isinstance(r, dict):
            raise Stop(f"{where}: must be an object")
        missing = [k for k in ROW_KEYS if k not in r]
        extra = sorted(set(r) - set(ROW_KEYS) - set(OPTIONAL_KEYS))
        if missing or extra:
            raise Stop(f"{where}: missing {missing}, unknown {extra}")
        if (
            not isinstance(r["id"], str)
            or not ROW_ID.fullmatch(r["id"])
            or r["id"] in seen
        ):
            raise Stop(f"{where}: id must be unique and match {ROW_ID.pattern}")
        seen.add(r["id"])
        if (
            r["kind"] not in KINDS
            or r["category"] not in CATEGORIES
            or r["layer"] not in LAYERS
        ):
            raise Stop(f"{r['id']}: kind, category, or layer is unknown")
        if not isinstance(r["rehearsal"], bool):
            raise Stop(f"{r['id']}: rehearsal must be true or false")
        if r["kind"] == "runner" and r.get("check") not in RUNNER_CHECKS:
            raise Stop(f"{r['id']}: a runner row names one of {RUNNER_CHECKS}")
        if r["kind"] == "container":
            try:
                re.compile(r["expect"])
            except re.error:
                raise Stop(f"{r['id']}: expect isn't a regular expression") from None
        for field in ("command", "host", "creates"):
            for name in PLACEHOLDER.findall(str(r.get(field, ""))):
                if name not in ROW_PLACEHOLDERS:
                    raise Stop(f"{r['id']}: unknown placeholder @{name}@")
    return doc["rows"]


def substitute(text: str, values: dict[str, str]) -> str:
    def one(m: re.Match) -> str:
        name = m.group(1)
        value = values.get(name)
        if value is None:
            raise Stop(f"no value for @{name}@ here")
        if name != "ID" and not PATH_SAFE.fullmatch(value):
            raise Stop(f"@{name}@ is {value!r}, which a row can't quote")
        return value

    return PLACEHOLDER.sub(one, text)


def judge_row(row: dict, rc: int, out: str, err: str) -> tuple[str, str]:
    """(verdict, text): verdict is refused, gap, or FAILED. A row's stdout is never shown, only its size."""
    if row["expect"] == "gap":
        if rc == 0:
            return "gap", "open, bounded: " + "; ".join(row.get("bounds", []))[:200]
        return "gap", "closed: the session's own commands can't read it"
    if rc == 124:
        return "FAILED", "it timed out"
    if rc == 0:
        return "FAILED", f"it was allowed ({len(out)} bytes of output, not shown)"
    if re.search(row["expect"], err or ""):
        return "refused", row["layer"]
    return "FAILED", f"refused, but not as expected (exit {rc}): {last_line(err)}"


def judge_check(text: str, rc: int = 0) -> tuple[bool, str]:
    """R3: make check's exit code, its summary line, and its `-> STATUS gate` lines, with the known items named. A run
    that was killed or stopped partway, or printed no summary, fails whatever its gates said."""
    if rc not in R3_FINISHED:
        return False, f"make check didn't finish (exit {rc})"
    if not R3_SUMMARY.search(text):
        return False, f"make check printed no summary line (exit {rc})"
    gates: dict[str, str] = {}
    current = None
    stage_s, other = 0, 0
    policy_p12, policy_other = 0, 0
    for line in text.splitlines():
        m = re.match(r"== ([a-z][a-z0-9-]*)\s*$", line)
        if m:
            current = m.group(1)
            continue
        m = re.match(
            r"-> (FAIL|PENDING|PLANNED|WARN|SKIP|PASS) ([a-z][a-z0-9-]*)", line
        )
        if m:
            gates[m.group(2)] = m.group(1)
            current = None
            continue
        if current == "policy" and line.startswith("FAIL "):
            if P12_POLICY.fullmatch(line):
                policy_p12 += 1
            else:
                policy_other += 1
            continue
        if current == "matrix" and line.startswith("FAIL "):
            field = (line.split() + ["", ""])[1]
            if field.startswith("stage-S"):
                stage_s += 1
            else:
                other += 1
    if not gates:
        return False, "make check printed no gate results"
    known, bad = [], []
    for label, status in gates.items():
        if status == "FAIL":
            if label in KNOWN_FAIL:
                known.append(f"{label} ({KNOWN_FAIL[label]})")
            elif label == "policy" and policy_p12 and not policy_other:
                known.append(
                    "policy: the worker's FROM ${TOOLCHAIN_IMAGE}, a local base no registry pins (P-12)"
                )
            elif label == "matrix" and stage_s and not other:
                known.append(
                    f"matrix: {stage_s} stage-S rows (Claude Code's sandbox masks, absent in a container; P-5)"
                )
            else:
                bad.append(label)
        elif status == "PENDING":
            known.append(f"{label} PENDING (the Author's run)")
    passed = sum(1 for s in gates.values() if s == "PASS")
    if rc != 0 and not known and not bad:
        bad.append(f"exit {rc} with no failing gate")
    if bad:
        return False, f"make check failed: {', '.join(bad)}" + (
            f"; known: {'; '.join(known)}" if known else ""
        )
    return True, f"make check: {passed} of {len(gates)} gates PASS" + (
        f"; known: {'; '.join(known)}" if known else ""
    )


ABSENT = "No such file or directory"
ABSENT_TEXT = "mount (absent on the host and in the container)"


def expects_absence(row: dict) -> bool:
    """A row whose refusal is the path's absence: when the host lacks its path, it still runs, and proves the
    container lacks it too."""
    return row.get("layer") == "mount" and bool(
        re.search(row.get("expect", "$^"), ABSENT)
    )


def judge_absent(row: dict, rc: int, out: str, err: str) -> tuple[str, str]:
    """A target absent on the host, checked in the container: ok only when it's absent there too."""
    verdict, text = judge_row(row, rc, out, err)
    if verdict == "refused" and ABSENT in (err or ""):
        return "absent", ABSENT_TEXT
    if verdict == "refused":
        return (
            "FAILED",
            f"absent on the host, but the container refused another way: {last_line(err)}",
        )
    return verdict, text


def mask_rows(pre: list, worktree: str, repo: str, is_under) -> list[dict]:
    """A row for each read-only mount of the ops session but .git itself: it appends nothing to the mount's path as
    the container sees it (the gitleaks config's comes from the share and lands at the main checkout's path), and
    `creates` names the host's file a folder's row would make. A mount outside the worktree and .git is the main
    checkout's, named `mask-main-…`."""
    out = []
    for h, c, m in pre:
        if m != "ro" or c == f"{repo}/.git":
            continue
        if is_under(c, worktree):
            rel = os.path.relpath(c, worktree)
        else:
            rel = os.path.relpath(c, repo)
            if not (rel == ".git" or rel.startswith(".git/")):
                rel = f"main/{rel}"
        slug = re.sub(r"[^a-z0-9]+", "-", rel.lower()).strip("-")[:60] or "root"
        folder = os.path.isdir(h)
        out.append(
            {
                "id": f"mask-{slug}",
                "role": "ops",
                "kind": "container",
                "category": "write",
                "command": f": >> {c}/.rt-mask" if folder else f": >> {c}",
                "expect": "Read-only file system",
                "layer": "ro-mount",
                "rehearsal": True,
                "creates": f"{h}/.rt-mask" if folder else "",
            }
        )
    return out


def tally(verdicts: list[str]) -> tuple[int, int]:
    """(rows that ran, rows skipped): a row checked absent on the host and in the container ran."""
    ran = sum(1 for v in verdicts if v in ("refused", "absent", "gap"))
    return ran, sum(1 for v in verdicts if v == "skipped")


def enough_ran(ran: int, chosen: int) -> bool:
    """R4 proves nothing if most of its rows were skipped (a wrong home, a missing path)."""
    return chosen > 0 and ran >= MIN_RAN * chosen


def parse_stream(out: str) -> tuple[dict | None, str]:
    result, source = None, "unknown"
    for line in out.splitlines():
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        if not isinstance(ev, dict):
            continue
        if ev.get("type") == "system" and ev.get("subtype") == "init":
            source = str(ev.get("apiKeySource", source))
        if ev.get("type") == "result":
            result = ev
    return result, source


def answered_ok(rc: int, out: str) -> bool:
    result, _ = parse_stream(out)
    if rc != 0 or not result or result.get("is_error"):
        return False
    return str(result.get("result", "")).strip().strip(".").strip().lower() == "ok"


# ---- the rehearsal -----------------------------------------------------------------------------------------------
@dataclasses.dataclass
class Session:
    task: object
    spec: dict
    argv: list[str]
    base: list[str]
    pre: list


def effects(N):
    """The runner's own Effects. FAKE_RESOURCES replaces its disk and memory readings, for the install's tests only,
    and every step says so when it's set."""
    fake = os.environ.get(FAKE_RESOURCES)
    if not fake:
        return N.Effects()
    disk, avail, total = (int(x) * 2**30 for x in fake.split(","))

    class Faked(N.Effects):
        def disk_free(self, path: str) -> int:
            return disk

        def mem_available(self) -> int:
            return avail

        def mem_total(self) -> int:
            return total

    say(
        f"note: {FAKE_RESOURCES} is set: disk and memory readings are faked (the tests only)"
    )
    return Faked()


def night_running(N, fx, runner_lock: str) -> str | None:
    """A running night container, or the runner's own lock held: the rehearsal would step on a night (S2)."""
    r = fx.run(
        ["docker", "ps", "--filter", "name=^h4-night", "--format", "{{.Names}}"],
        env=dict(fx.environ),
        timeout=60,
    )
    names = r.out.split()
    if r.rc != 0:
        return "docker ps failed, so a running night can't be ruled out"
    if names:
        return f"night containers are running ({' '.join(names[:3])}): run night.py stop first"
    if os.path.lexists(runner_lock):
        try:
            fd = os.open(runner_lock, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        except OSError:
            return f"can't open {runner_lock}"
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            return "a night.py start holds the runner's lock: run night.py stop first"
        finally:
            os.close(fd)
    return None


class Rehearsal:
    def __init__(self, home: str, sha: str) -> None:
        if not SHA40.fullmatch(sha):
            raise Stop("the SHA must be 40 hex")
        self.home = home
        self.sha = sha
        self.share = f"{home}/.local/share/h4reet-ai/night-shift"
        installed = read_installed(f"{self.share}/installed.txt")
        if installed["sha"] != sha:
            raise Stop(
                f"installed.txt is for {installed['sha'] or 'no SHA'}, not {sha}"
            )
        self.installed = installed
        night_py = f"{self.share}/night.py"
        self.N = load_night(night_py, installed["file"].get(night_py, "missing"))
        paths = self.N.Paths.from_home(home)
        self.fx = effects(self.N)
        why = night_running(self.N, self.fx, paths.runner_lock)
        if why:
            raise Stop(why)
        self.rstate = f"{paths.state}/rehearsal"
        self.paths = dataclasses.replace(
            paths,
            state=self.rstate,
            locks=f"{self.rstate}/locks",
            log=f"{self.rstate}/log",
            runner_lock=f"{self.rstate}/runner.lock",
            state_file=f"{self.rstate}/state.json",
        )
        os.makedirs(self.rstate, mode=0o700, exist_ok=True)
        try:
            self.facts = self.N.read_facts(self.paths.facts)
        except self.N.CantRun as e:
            raise Stop(str(e)) from None
        self.runner = self.N.Runner(self.paths, self.facts, self.fx, "rehearsal")
        self.sessions: dict[str, Session] = {}
        self.extra_tasks: list = []
        self.io_root = f"{self.facts['NIGHT_ROOT']}/.io"
        self.io_root_existed = os.path.lexists(self.io_root)
        self.helpers = False
        self.left: set[str] = set()

    # -- effects
    def docker(self, *args: str, timeout: int = 120):
        return self.fx.run(
            ["docker", *args], env=dict(self.fx.environ), timeout=timeout
        )

    def run(self, argv: list[str], timeout: int) -> tuple[int, str, str]:
        try:
            p = subprocess.run(
                argv,
                stdin=subprocess.DEVNULL,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return 124, "", "timed out"
        return p.returncode, p.stdout, p.stderr

    # -- tasks and sessions
    def make_task(self, tid: str, role: str):
        t = self.N.Task(
            id=tid,
            role=role,
            base=self.sha,
            branch=f"night/{tid}/{self.sha[:12]}",
            prompt=f"prompts/{role}.md",
        )
        self.clear_task(t)
        return t

    def clear_task(self, t) -> None:
        wt = f"{self.facts['NIGHT_ROOT']}/rehearsal/{t.id}"
        if os.path.lexists(wt):
            self.runner.git("worktree", "remove", "--force", "--force", wt)
            if os.path.lexists(wt) and not os.path.islink(wt):
                shutil.rmtree(wt, ignore_errors=True)
        # Never `git worktree prune` on his repository: only this rehearsal's own admin folder goes, and only when its
        # gitdir names this rehearsal's own path.
        admin_root = f"{self.runner.git_dir}/worktrees"
        try:
            names = os.listdir(admin_root)
        except OSError:
            names = []
        for name in names:
            admin = f"{admin_root}/{name}"
            if not name.startswith(t.id) or os.path.islink(admin):
                continue
            try:
                gitdir = Path(f"{admin}/gitdir").read_text(encoding="utf-8").strip()
            except OSError:
                continue
            if gitdir == f"{wt}/.git":
                shutil.rmtree(admin, ignore_errors=True)
        self.runner.git("branch", "-D", t.branch)
        io = f"{self.io_root}/{t.id}"
        if os.path.isdir(io) and not os.path.islink(io):
            shutil.rmtree(io, ignore_errors=True)
        g = self.runner.git_dir
        for d in (f"{g}/refs/heads/night/{t.id}", f"{g}/logs/refs/heads/night/{t.id}"):
            _rmdir_empty(d)

    def session(self, role: str) -> Session:
        if role in self.sessions:
            return self.sessions[role]
        N = self.N
        t = self.make_task(f"rehearse-{role}", role)
        self.extra_tasks.append(t)
        spec = self.runner.load_live_spec(role)
        if role not in N.NO_WT:
            self.runner.ensure_worktree(t)
        io = self.runner.ensure_io(t)
        pre, post = self.runner.task_mounts(t, io)
        task_containers = [c for _h, c, _m in pre + post]
        for m in spec["mounts"]:
            why = N.container_refusal(m["container"], task_containers)
            if why:
                raise Stop(f"spec {role}: {why}")
        image = self.runner.image_id(spec["image"])
        prompt = self.runner.compose_prompt(t, REHEARSAL_TASK)
        argv = N.build_run_argv(
            spec,
            name=f"h4-night-rehearse-{role}",
            role=role,
            pre=pre,
            post=post,
            workdir=t.worktree or N.IO_IN,
            prompt=prompt,
            token=self.paths.token,
            image=image,
        )
        i = argv.index(image)
        s = Session(task=t, spec=spec, argv=argv, base=argv[: i + 1], pre=pre)
        self.sessions[role] = s
        self.left.add(f"h4-night-rehearse-{role}")  # one an earlier, broken run left
        return s

    def other_worktree(self) -> str:
        t = self.make_task("rehearse-other", "spec-writer")
        self.extra_tasks.append(t)
        self.runner.ensure_worktree(t)
        return t.worktree

    def start_helpers(self) -> None:
        self.helpers = True
        self.runner.start_network_helpers()
        for _ in range(10):
            states = [
                self.docker("inspect", "-f", "{{.State.Running}}", name).out.strip()
                for name in (
                    "h4-night-egress",
                    "h4-night-egress-studio",
                    "h4-night-engine-fwd",
                )
            ]
            if states == ["true"] * 3:
                return
            time.sleep(1)
        raise Stop("the egress helpers or engine-fwd aren't running")

    def cleanup(self) -> None:
        if self.helpers:
            self.runner.stop_helpers()
        for s in list(self.sessions.values()):
            self.docker("rm", "-f", f"h4-night-rehearse-{s.task.role}")
        for t in self.extra_tasks:
            self.clear_task(t)
        _rmdir_empty(f"{self.facts['NIGHT_ROOT']}/rehearsal")
        if not self.io_root_existed:
            _rmdir_empty(self.io_root)
        g = self.runner.git_dir
        for d in (f"{g}/refs/heads/night", f"{g}/logs/refs/heads/night"):
            _rmdir_empty(d)

    def container(
        self, s: Session, command: list[str], timeout: int
    ) -> tuple[int, str, str]:
        # --rm removes each container when it ends; one left by a timeout goes before its name is used again.
        name = f"h4-night-rehearse-{s.task.role}"
        if name in self.left:
            self.docker("rm", "-f", name)
            self.left.discard(name)
        rc, out, err = self.run(s.base + command, timeout)
        if rc == 124:
            self.left.add(name)
        return rc, out, err

    def with_env(self, s: Session, var: str) -> list[str]:
        line = list(s.argv)
        i = line.index("-w")
        return [*line[:i], "-e", f"{var}={STANDIN}", *line[i:]]

    def api_lines(self, required: bool) -> int:
        """The api.anthropic.com lines in the egress log. Missing before the first turn counts 0; missing after one,
        or unreadable at any time, is a failure (B1): a log that isn't written proves nothing."""
        path = f"{self.rstate}/egress/egress.jsonl"
        try:
            text = Path(path).read_text(encoding="utf-8", errors="replace")
        except FileNotFoundError:
            if required:
                raise Stop(
                    f"the egress log {path} isn't there, so it proves nothing"
                ) from None
            return 0
        except OSError as e:
            raise Stop(
                f"the egress log {path} is unreadable ({type(e).__name__})"
            ) from None
        return sum(1 for line in text.splitlines() if API_HOST in line)

    def proof_turn(self, s: Session) -> str:
        """One turn on the night-shift token that must answer ok and add an api.anthropic.com line to the egress log,
        which proves the log records this run's calls before any count of it is trusted (the probe's rule, R-17)."""
        before = self.api_lines(required=False)
        rc, out, err = self.container(
            s, s.argv[len(s.base) :] + ["--max-turns", "2"], SESSION_TIMEOUT
        )
        if not answered_ok(rc, out):
            result, _ = parse_stream(out)
            why = (result or {}).get("result") or err
            raise Stop(
                f"the session didn't answer ok (exit {rc}): {last_line(str(why))}"
            )
        time.sleep(1)
        after = self.api_lines(required=True)
        if after <= before:
            raise Stop(
                f"a signed-in turn added no {API_HOST} line to the egress log ({before} -> {after}), so the log proves nothing"
            )
        _result, source = parse_stream(out)
        return source

    # -- the steps
    def r1(self) -> str:
        s = self.session("implementer")
        self.start_helpers()
        source = self.proof_turn(s)
        return (
            f"an implementer session on a scratch worktree of {self.sha[:12]} answered on the plan's token "
            f"(apiKeySource {source}), and the egress log recorded its calls"
        )

    def r2(self) -> str:
        s = self.session("implementer")
        self.start_helpers()
        self.proof_turn(
            s
        )  # the log is proven in this step, before any refusal is read from it
        notes = []
        for var in STANDIN_VARS:
            line = self.with_env(s, var)
            try:
                self.N.final_line_refusal(line)
            except self.N.Refused:
                pass
            else:
                raise Stop(f"the runner's last look let {var} through")
            before = self.api_lines(required=True)
            self.docker("rm", "-f", f"h4-night-rehearse-{s.task.role}")
            rc, out, err = self.run(line + ["--max-turns", "2"], SESSION_TIMEOUT)
            time.sleep(1)
            after = self.api_lines(required=True)
            if answered_ok(rc, out):
                notes.append(
                    f"with {var} set, the runner refuses the line, and the managed settings neutralize it (it answered on the token)"
                )
            elif rc == 124:
                raise Stop(f"with {var} set, the session hung until its timeout")
            elif rc != 0 and after == before:
                notes.append(
                    f"with {var} set, the runner refuses the line, and the managed settings refuse to start, no API call in a proven log"
                )
            else:
                raise Stop(
                    f"with {var} set, the stand-in may have been used ({before} -> {after} {API_HOST} lines in the egress log, exit {rc}): {last_line(err)}"
                )
        return "; ".join(notes)

    def r3(self) -> str:
        s = self.session("implementer")
        self.start_helpers()
        rc, out, err = self.container(s, ["bash", "-c", R3_COMMAND], R3_TIMEOUT)
        log = f"{self.rstate}/r3-make-check.log"
        fd = os.open(log, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            for line in (out + err).splitlines():
                f.write(redact_line(line) + "\n")
        if rc == 124:
            raise Stop(f"make check timed out (its log: {log})")
        ok, detail = judge_check(out + "\n" + err, rc)
        if not ok:
            raise Stop(f"{detail} (its log: {log})")
        return f"{detail} (its log: {log})"

    def row_values(self, s: Session | None, row: dict) -> dict[str, str]:
        repo = self.facts["REPO"]
        values = {
            "HOME": self.home,
            "REPO": repo,
            "GIT": f"{repo}/.git",
            "ID": row["id"],
        }
        if s is not None:
            values["WT"] = s.task.worktree or self.N.IO_IN
            if s.task.admin:
                values["ADMIN"] = s.task.admin
        if "@OTHER@" in json.dumps(row):
            if not hasattr(self, "_other"):
                self._other = self.other_worktree()
            values["OTHER"] = self._other
        return values

    def runner_row(self, row: dict) -> tuple[str, str]:
        N = self.N
        check = row["check"]
        if check in ("plan-off", "gate-off"):
            key = "NIGHT_PLAN" if check == "plan-off" else "NIGHT_GATE"
            if self.facts[key] == "on":
                return "skipped", f"{key} is on"
            req = (
                {"kind": "plan", "root": "bootstrap", "sha": self.sha}
                if check == "plan-off"
                else {"kind": "gate", "sha": self.sha}
            )
            t = N.Task(id=f"rehearse-{row['role']}", role=row["role"])
            ans = self.runner.handle_request(t, 1, req)
            if (
                ans
                and not ans.get("ok")
                and re.search(re.escape(row["expect"]), ans.get("answer", ""))
            ):
                return "refused", row["layer"]
            return "FAILED", f"the runner answered {redact(json.dumps(ans))}"
        if check in ("bare", "env"):
            s = self.session(row["role"])
            line = (
                s.argv + ["--bare"] if check == "bare" else self.with_env(s, row["var"])
            )
            try:
                N.final_line_refusal(line)
            except N.Refused as e:
                if re.search(re.escape(row["expect"]), str(e)):
                    return "refused", row["layer"]
                return "FAILED", f"refused, but not as expected: {redact(str(e))}"
            return "FAILED", "the runner's last look let it through"
        # example-spec, placeholder-spec: the installed spec, changed, in a scratch home the runner reads
        src = f"{self.paths.live}/{row['role']}.json"
        spec = json.loads(Path(src).read_text(encoding="utf-8"))
        if check == "example-spec":
            spec["x-h4"] = {"example": True}
        else:
            spec["user"] = "{{UID}}:{{GID}}"
        scratch = tempfile.mkdtemp(prefix="spec-", dir=self.rstate)
        try:
            p = N.Paths.from_home(scratch)
            os.makedirs(p.live)
            os.makedirs(os.path.dirname(p.installed), exist_ok=True)
            data = (json.dumps(spec, indent=2) + "\n").encode()
            live = f"{p.live}/{row['role']}.json"
            Path(live).write_bytes(data)
            Path(p.installed).write_text(
                f"file {live} {hashlib.sha256(data).hexdigest()}\n"
            )
            other = N.Runner(p, self.facts, self.fx, "rehearsal")
            try:
                other.load_live_spec(row["role"])
            except N.Refused as e:
                if re.search(re.escape(row["expect"]), str(e)):
                    return "refused", row["layer"]
                return "FAILED", f"refused, but not as expected: {redact(str(e))}"
            return "FAILED", "the runner took the spec"
        finally:
            shutil.rmtree(scratch, ignore_errors=True)

    def container_row(self, row: dict) -> tuple[str, str]:
        s = self.session(row["role"])
        values = self.row_values(s, row)
        try:
            command = substitute(row["command"], values)
            host = substitute(row.get("host", ""), values)
            creates = substitute(row.get("creates", ""), values)
        except Stop as e:
            return "skipped", str(e)
        absent_here = bool(host) and not os.path.lexists(host)
        if absent_here and not expects_absence(row):
            return (
                "skipped",
                "its path is absent on the host, so a write there would prove nothing",
            )
        made_before = bool(creates) and os.path.lexists(creates)
        rc, out, err = self.container(s, ["bash", "-c", command], ROW_TIMEOUT)
        if absent_here:
            verdict, text = judge_absent(row, rc, out, err)
        else:
            verdict, text = judge_row(row, rc, out, err)
        if (
            creates
            and not made_before
            and os.path.lexists(creates)
            and not os.path.isdir(creates)
        ):
            os.remove(creates)
            text += f"; it made {creates}, which the rehearsal removed"
        return verdict, text

    def mask_rows(self) -> list[dict]:
        s = self.session("ops")
        return mask_rows(s.pre, s.task.worktree, self.facts["REPO"], self.N.is_under)

    def preflight(self) -> None:
        """The installed runner's own preflight (S1): every live spec (the studio's and ComfyUI's folders included),
        the images, the token, nothing planted in .git, no billing variable, the networks, and the disk and memory
        floors; then the memory sum for the implementer's container. So `install: done` means `night.py start` passes
        its preflight, but under a --disk-floor run, whose lowered floor a night never takes. Every step runs it first, R3's long builds included."""
        try:
            self.runner.preflight(keep_lock=False)
            spec = self.runner.load_live_spec("implementer")
            why = self.runner.mem_refusal(self.N.mem_bytes(spec["limits"]["memory"]))
        except self.N.Refused as e:
            raise Stop(f"the runner's preflight refuses: {e}") from None
        if why:
            raise Stop(f"the runner's preflight refuses: {why}")

    def r4(self, all_rows: bool) -> str:
        rows = load_rows(f"{self.share}/rows.json")
        chosen = [r for r in rows if all_rows or r["rehearsal"]]
        self.start_helpers()
        failed, refused, gaps, skipped, absent = [], 0, 0, 0, 0
        verdicts: list[str] = []
        masks = self.mask_rows()
        for row in chosen + masks:
            try:
                if row["kind"] == "runner":
                    verdict, text = self.runner_row(row)
                else:
                    verdict, text = self.container_row(row)
            except (Stop, self.N.Refused) as e:
                verdict, text = "FAILED", redact(str(e))
            verdicts.append(verdict)
            if verdict == "refused":
                refused += 1
                say(f"row {row['id']} refused-by={text}")
            elif verdict == "absent":
                absent += 1
                say(f"row {row['id']} refused-by={text}")
            elif verdict == "gap":
                gaps += 1
                say(f"row {row['id']} gap {text}")
            elif verdict == "skipped":
                skipped += 1
                say(f"row {row['id']} skipped: {text}")
            else:
                failed.append(row["id"])
                say(f"row {row['id']} FAILED {text}")
        if failed:
            raise Stop(f"{len(failed)} rows weren't refused: {', '.join(failed[:12])}")
        total = len(chosen) + len(masks)
        ran, skipped = tally(verdicts)
        if not enough_ran(ran, total):
            raise Stop(
                f"only {ran} of {total} rows ran ({skipped} skipped); R4 needs {MIN_RAN:.0%}: "
                "see the skipped rows above"
            )
        return (
            f"{refused} rows refused, {absent} absent on the host and in the container, "
            f"{gaps} gap row recorded, {skipped} of {total} skipped"
        )


def _rmdir_empty(path: str) -> None:
    try:
        if os.path.isdir(path) and not os.path.islink(path):
            os.rmdir(path)
    except OSError:
        pass


def cmd_step(args) -> int:
    home = os.path.expanduser("~")
    name = args.step
    try:
        r = Rehearsal(home, args.sha)
        r.runner.disk_floor = disk_floor(r.N, args.disk_floor)
    except (Stop, OSError) as e:
        say(f"{name} FAILED {redact(str(e))}")
        return 1
    try:
        r.preflight()
        if name == "R1":
            detail = r.r1()
        elif name == "R2":
            detail = r.r2()
        elif name == "R3":
            detail = r.r3()
        else:
            detail = r.r4(args.all)
    except (Stop, r.N.Refused, r.N.CantRun, OSError) as e:
        say(f"{name} FAILED {redact(str(e), 300)}")
        return 1
    finally:
        r.cleanup()
    say(f"{name} ok {redact(detail, 600)}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="The night shift's install helper and rehearsal."
    )
    sub = parser.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("facts")
    f.add_argument("--night", required=True)
    f.add_argument("--facts", required=True)
    f.add_argument("--pins", required=True)
    f.add_argument("--disk-floor", type=int)
    p = sub.add_parser("pins")
    p.add_argument("--pins", required=True)
    p.add_argument("--facts", required=True)
    p.add_argument("--tag", required=True)
    s = sub.add_parser("step")
    s.add_argument("step", choices=("R1", "R2", "R3", "R4"))
    s.add_argument("--sha", required=True)
    s.add_argument("--disk-floor", type=int)
    s.add_argument(
        "--all", action="store_true", help="R4: every row, not only the rehearsal's"
    )
    args = parser.parse_args(argv)
    if args.cmd == "facts":
        try:
            return cmd_facts(args)
        except Stop as e:
            say(f"facts: {e}")
            return 1
    if args.cmd == "pins":
        return cmd_pins(args)
    return cmd_step(args)


if __name__ == "__main__":
    sys.exit(main())
