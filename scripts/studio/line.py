#!/usr/bin/env python3
"""The studio line's checks (spec 017 User Story 4, FR-026 to FR-029; contracts/studio-line.md; research R-11).

    python3 -I -B scripts/studio/line.py brief FILE [--repo DIR] [--handoff DIR]
    python3 -I -B scripts/studio/line.py candidate DIR --brief FILE [--repo DIR] [--handoff DIR] [--record]
    python3 -I -B scripts/studio/line.py round ASSET [--briefs DIR] [--handoff DIR] [--repo DIR]

Standard library only. A repo agent writes a brief, the studio agent answers with a candidate in the handoff folder,
and these checks judge both; four rounds at most (ROUNDS), for every asset.

The policy is main's only: caps.json and studio-tools.json (the Author's P-7) are read from refs/heads/main's commit
in --repo (the working directory's repository by default), with replace objects off, never from a path the caller
names, a tag named main, or a working tree. While main lacks either, line.py can't run. The arrival check doesn't
read the tools list, so this is FR-029's one machine check of the list (review G3, blocker 1).

- brief: data-model.md's shape, every field present and no other; the round 1 to 4; each limit at or under main's
  caps.json for the kind; every tool on the list with `outputs_ship: true`, and none named Qwen-Image or FLUX [dev],
  whatever the list says. The file sits at <briefs>/<asset>/<round>.json, its round the folder's highest brief plus
  one, with no later brief, handoff, or result, and no handoff or result yet for its own round. Round 1 holds no
  findings; a later round follows round n-1's handoff and either its recorded failure, whose findings it holds
  verbatim, or its recorded pass, which must re-check clean as `round` re-checks it, and then holds none. A failure
  that follows a pass is the Author's to decide: no brief after it.
- candidate: the brief, re-checked in full; candidate.json's shape, for the brief's asset and round; its files in the
  folder (regular files, never links); its tools in the brief's and on the list, at the list's version; the record's
  directory under assets/ (but assets/policy/); every model and tool a record step names in the brief's tools and on
  the list, and any step naming Qwen-Image or FLUX [dev] refused by name. Each GLB's JSON chunk gives its triangles
  (an indexed primitive's index count, else its positions, over 3; strips and fans count less 2; an accessor or mode
  that doesn't count is a finding, never 0), its skins' joints' node names (a required bone matches a name or a
  `<prefix>:<name>`, as Mixamo's `mixamorig:` does), its animations' names, and each embedded image's pixel size from
  its PNG, JPEG, or WebP header; the texture bytes are the arrival check's own measure, width times height times 4,
  times 4/3 for mipmaps. Every file's bytes count against `bytes`. `skeleton` is checked for shape only.
  For a `still` brief (spec 030 FR-022), each PNG's pixels are read by zlib and the five filters: it is within
  `texture_px`, 8-bit, not interlaced, with an alpha channel and alpha 0 on its outermost ring; and for a `ui-` asset,
  slices.json beside the files (never in `files`) names every PNG's insets, inside the image, and each variant's
  label, every two states of a variant (`btn-<variant>-<state>.png`) lie at least ΔE76 15 apart in their centres'
  alpha-weighted mean colours, and the label reaches 4.5:1 over every centre pixel of alpha 0.5 or more, composited
  over white and over black.
  Then main's tools/gates/arrival_check.py, from the same commit, runs from a temporary file as `python3 -I -B` on a
  scratch repository: its own refs/heads/main holds that commit's assets/policy/ and docs/data-flow-disclosure.md,
  made with plumbing only and no system or global git config, so no hook runs; its work tree holds the candidate
  under the record's directory. A finding from either fails the round; the check's exit 2, or exit 1 with no finding
  line, is can't run. With --record, the folder must be <handoff>/<asset>/<round>/, and the round's result goes
  beside the brief, <briefs>/<asset>/<round>.result.json, once: never for a round with a result, or one a later
  handoff or result follows.
- round: the asset's next step. Rounds are counted from the handoff folders, <handoff>/<asset>/<n>/, which only the
  studio writes, and the results, whichever is higher, so deleting a result or a brief resets nothing (review G3,
  blocker 2). A recorded pass counts only once its round's handoff is there and the candidate re-checks clean. The
  re-check takes later rounds only in the shape that follows a pass, round n+1's brief holding no findings; any
  other later round still refuses it (rv-rounds4-020, I-2). Prints `1` (nothing yet), `open N` (round N's brief or
  handoff, waiting for the studio or for judging, after a pass too), `N+1` (round N failed), `passed N` (the latest
  round, and it passed), `decide (round P passed)` (a round after P's pass failed: the Author chooses, and the line
  never takes P by itself; Q267), or `decide` (four rounds used without a pass: no brief is written, and the asset
  goes on the decision page).

Output: one line per finding, `<check>: <value> (limit: <limit>)`, then a summary. Exit 0: pass. 1: findings. 2:
can't run (main without its policy or the arrival check, a policy or the brief invalid, the candidate folder missing,
git failing, or the arrival check unable to check).
"""

from __future__ import annotations

import argparse
import itertools
import json
import math
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path

MAIN = "refs/heads/main"
ARRIVAL = "tools/gates/arrival_check.py"
CAPS = "assets/policy/caps.json"
TOOLS = "assets/policy/studio-tools.json"
MAIN_COPIES = ("assets/policy", "docs/data-flow-disclosure.md")
BRIEFS = "/srv/studio/briefs"
HANDOFF = "/srv/studio/handoff"
ROUNDS = 4  # the Author, 2026-11-14 (about 21:00Z); spec 017's data-model.md, Brief
RECORDS = "records.json"
NOTICE = "LICENSE.md"

BRIEF_KEYS = (
    "schema",
    "asset",
    "kind",
    "spec",
    "round",
    "limits",
    "tools",
    "references",
    "findings",
    "notes",
)
NUMERIC_LIMITS = ("bytes", "triangles", "texture_bytes", "texture_px")
LIST_LIMITS = ("bones_required", "clips")
LIMIT_KEYS = (*NUMERIC_LIMITS, "skeleton", *LIST_LIMITS)
CANDIDATE_KEYS = ("schema", "asset", "round", "files", "tools", "records")
CANDIDATE_TOOL_KEYS = ("id", "version")
TOOL_KEYS = ("id", "kind", "version", "license", "outputs_ship")
RESULT_KEYS = ("schema", "asset", "round", "result", "findings")

ASSET_RE = re.compile(r"[a-z0-9][a-z0-9-]{0,39}")
SPEC_RE = re.compile(r"\d{3}-[a-z0-9][a-z0-9-]{0,60}")
TOOL_ID_RE = re.compile(r"[a-z0-9][a-z0-9._-]{0,79}")
FILE_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,99}")
DIR_RE = re.compile(r"assets(/[a-z0-9][a-z0-9_-]*)+")
ROUND_FILE = re.compile(r"(\d{1,3})\.json")
RESULT_FILE = re.compile(r"(\d{1,3})\.result\.json")
ROUND_DIR = re.compile(r"\d{1,3}")
ARRIVAL_FINDING = re.compile(r"[A-Z]\d+ \S")
QWEN = re.compile(r"qwen[^a-z0-9]*image")
DEV = re.compile(r"dev(?![a-z])")
REFUSED = "Qwen-Image and FLUX [dev] outputs never ship, whatever the list says"

PNG_SIG = b"\x89PNG\r\n\x1a\n"
JPEG_SOF = frozenset(range(0xC0, 0xD0)) - {0xC4, 0xC8, 0xCC}


class CantRun(Exception):
    pass


class GlbError(Exception):
    """A GLB that doesn't parse: a finding for the round, never a crash."""


def clean(value: object, size: int = 120) -> str:
    """A value fit for one output line: printable, short. A record's strings are the studio's, never trusted."""
    text = value if isinstance(value, str) else json.dumps(value)
    text = "".join(c if c.isprintable() else "?" for c in text)
    return text if len(text) <= size else text[: size - 1] + "…"


def finding(check: str, value: object, limit: str) -> str:
    return f"{check}: {clean(value)} (limit: {limit})"


def norm(name: str) -> str:
    """A name as a list ID: lower case, each run of other characters a hyphen. "SDXL Base 1.0" is sdxl-base-1.0."""
    return re.sub(r"[^a-z0-9.]+", "-", name.lower()).strip("-")


def refused_by_name(text: str) -> bool:
    low = text.lower()
    return bool(QWEN.search(low)) or ("flux" in low and bool(DEV.search(low)))


def is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def parse_json(data: bytes, what: str) -> object:
    try:
        return json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, ValueError, RecursionError):
        raise CantRun(f"{what} doesn't read as JSON") from None


def read_json(path: Path, what: str) -> object:
    try:
        data = path.read_bytes()
    except FileNotFoundError:
        raise CantRun(f"{what} ({clean(str(path))}) doesn't exist") from None
    except OSError:
        raise CantRun(f"{what} ({clean(str(path))}) can't be read") from None
    return parse_json(data, f"{what} ({clean(str(path))})")


# --------------------------------------------------------------------------------------------------
# Main: one commit of refs/heads/main, read with replace objects off
# --------------------------------------------------------------------------------------------------
def source_env() -> dict[str, str]:
    """The caller's environment without any GIT_* variable (review G3, nit 2), so none redirects the repository."""
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env.update({"GIT_NO_REPLACE_OBJECTS": "1", "LC_ALL": "C"})
    return env


def scratch_env() -> dict[str, str]:
    """No system or global git config in the scratch repository, so nothing configured elsewhere runs there."""
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env.update(
        {
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_NO_REPLACE_OBJECTS": "1",
            "LC_ALL": "C",
            "GIT_AUTHOR_NAME": "line.py",
            "GIT_AUTHOR_EMAIL": "line@localhost",
            "GIT_COMMITTER_NAME": "line.py",
            "GIT_COMMITTER_EMAIL": "line@localhost",
            "GIT_AUTHOR_DATE": "2026-01-01T00:00:00Z",
            "GIT_COMMITTER_DATE": "2026-01-01T00:00:00Z",
        }
    )
    return env


def git(
    repo: Path,
    args: list[str],
    env: dict[str, str],
    what: str,
    data: bytes | None = None,
) -> bytes:
    try:
        done = subprocess.run(
            ["git", "-C", str(repo), *args],
            input=data,
            env=env,
            capture_output=True,
            check=False,
            timeout=300,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise CantRun(f"git couldn't run ({exc.__class__.__name__}) {what}") from None
    if done.returncode:
        raise CantRun(f"git {args[0]} failed (exit {done.returncode}) {what}")
    return done.stdout


class Main:
    """refs/heads/main's commit in one repository, resolved once, so every file read comes from the same commit."""

    def __init__(self, repo: Path) -> None:
        self.repo, self.env = repo, source_env()
        self.sha = (
            git(
                repo,
                ["rev-parse", "--verify", "--quiet", f"{MAIN}^{{commit}}"],
                self.env,
                f"reading {MAIN}",
            )
            .decode()
            .strip()
        )
        self._caps: dict[str, dict] | None = None
        self._tools: dict[str, dict] | None = None

    def blob(self, rel: str) -> bytes | None:
        try:
            return git(
                self.repo, ["cat-file", "blob", f"{self.sha}:{rel}"], self.env, ""
            )
        except CantRun:
            return None

    def copies(self) -> dict[str, bytes]:
        listing = git(
            self.repo,
            ["ls-tree", "-r", "-z", "--full-tree", self.sha, "--", *MAIN_COPIES],
            self.env,
            "listing main's policy",
        )
        found = {}
        for item in listing.split(b"\0"):
            if not item:
                continue
            meta, _, rel = item.partition(b"\t")
            mode, kind, oid = meta.split()
            if kind == b"blob" and mode in (b"100644", b"100755"):
                found[rel.decode()] = git(
                    self.repo,
                    ["cat-file", "blob", oid.decode()],
                    self.env,
                    "reading main's policy",
                )
        return found

    def arrival(self) -> bytes:
        data = self.blob(ARRIVAL)
        if data is None:
            raise CantRun(f"the main branch ({MAIN}) has no {ARRIVAL}")
        return data

    def caps(self) -> dict[str, dict]:
        if self._caps is None:
            self._caps = load_caps(self.blob(CAPS))
        return self._caps

    def tools(self) -> dict[str, dict]:
        if self._tools is None:
            self._tools = load_tools(self.blob(TOOLS))
        return self._tools


# --------------------------------------------------------------------------------------------------
# Policy: main's caps.json and the tools list (assets/policy/studio-tools.json, the Author's P-7)
# --------------------------------------------------------------------------------------------------
def load_caps(data: bytes | None) -> dict[str, dict]:
    if data is None:
        raise CantRun(f"the main branch ({MAIN}) has no {CAPS}")
    doc = parse_json(data, f"main's {CAPS}")
    if not isinstance(doc, dict) or not isinstance(doc.get("per_asset"), dict):
        raise CantRun(f"main's {CAPS} has no per_asset object")
    per = doc["per_asset"]
    if not all(isinstance(v, dict) for v in per.values()):
        raise CantRun(f"main's {CAPS} per_asset holds a kind that isn't an object")
    return per


def load_tools(data: bytes | None) -> dict[str, dict]:
    if data is None:
        raise CantRun(
            f"the main branch ({MAIN}) has no {TOOLS}; it arrives as the Author's patch P-7"
        )
    doc = parse_json(data, f"main's {TOOLS}")
    if (
        not isinstance(doc, dict)
        or set(doc) != {"schema", "tools"}
        or doc["schema"] != 1
    ):
        raise CantRun(
            f"main's {TOOLS} isn't schema 1 with a tools list and nothing else"
        )
    tools = doc["tools"]
    if not isinstance(tools, list):
        raise CantRun(f"main's {TOOLS} tools isn't a list")
    found: dict[str, dict] = {}
    for i, entry in enumerate(tools):
        where = f"main's {TOOLS} tools[{i}]"
        if not isinstance(entry, dict) or set(entry) != set(TOOL_KEYS):
            raise CantRun(f"{where} isn't an object of {', '.join(TOOL_KEYS)}")
        if not isinstance(entry["id"], str) or not TOOL_ID_RE.fullmatch(entry["id"]):
            raise CantRun(f"{where}.id isn't an ID")
        for key in ("kind", "version", "license"):
            if not isinstance(entry[key], str) or not entry[key].strip():
                raise CantRun(f"{where}.{key} isn't text")
        if not isinstance(entry["outputs_ship"], bool):
            raise CantRun(f"{where}.outputs_ship isn't true or false")
        if norm(entry["id"]) in found:
            raise CantRun(f"{where}.id names an ID another entry names")
        found[norm(entry["id"])] = entry
    return found


def tool_problem(name: str, tools: dict[str, dict]) -> str | None:
    """Why a tool can't make a shipping output, or None. The by-name refusal comes first, whatever the list says."""
    if refused_by_name(name):
        return f"refused by name ({REFUSED})"
    entry = tools.get(norm(name))
    if entry is None:
        return "not on the tools list (limit: an entry with outputs_ship true)"
    if entry["outputs_ship"] is not True:
        return "outputs_ship false on the tools list (limit: outputs_ship true)"
    return None


def tool_line(check: str, name: str, problem: str) -> str:
    if problem.startswith("refused by name"):
        return f"{check}: {clean(name)} refused by name (limit: {REFUSED})"
    reason, _, limit = problem.partition(" (limit: ")
    return f"{check}: {clean(name)} {reason} (limit: {limit}"


# --------------------------------------------------------------------------------------------------
# Rounds: briefs and results in the briefs folder, the studio's handoff folders
# --------------------------------------------------------------------------------------------------
def brief_rounds(folder: Path, but: str | None = None) -> set[int]:
    if not folder.is_dir():
        return set()
    return {
        int(m[1])
        for p in folder.iterdir()
        if (m := ROUND_FILE.fullmatch(p.name)) and p.name != but
    }


def result_rounds(folder: Path) -> set[int]:
    if not folder.is_dir():
        return set()
    return {int(m[1]) for p in folder.iterdir() if (m := RESULT_FILE.fullmatch(p.name))}


def handoff_rounds(handoff: Path, asset: str) -> set[int]:
    """The rounds the studio has answered: <handoff>/<asset>/<n>/ folders, which repo agents only read."""
    folder = handoff / asset
    if not folder.is_dir():
        return set()
    return {
        int(p.name)
        for p in folder.iterdir()
        if ROUND_DIR.fullmatch(p.name) and p.is_dir()
    }


def read_result(folder: Path, n: int) -> dict | None:
    path = folder / f"{n}.result.json"
    if not path.exists():
        return None
    doc = read_json(path, f"round {n}'s result")
    if (
        not isinstance(doc, dict)
        or set(doc) != set(RESULT_KEYS)
        or doc["schema"] != 1
        or doc["round"] != n
        or doc["result"] not in ("pass", "fail")
        or not isinstance(doc["findings"], list)
        or not all(isinstance(f, str) for f in doc["findings"])
    ):
        raise CantRun(f"round {n}'s result ({clean(str(path))}) isn't a result")
    return doc


# --------------------------------------------------------------------------------------------------
# Briefs
# --------------------------------------------------------------------------------------------------
def brief_shape(doc: object) -> list[str]:
    """data-model.md's Brief: every field present, none other, each of its type. Caps and the folder come after."""
    if not isinstance(doc, dict):
        return [finding("brief", "not a JSON object", "data-model.md's Brief")]
    out = [
        finding(k, "absent", "a field every brief holds")
        for k in BRIEF_KEYS
        if k not in doc
    ]
    out += [
        finding(k, "an unknown field", ", ".join(BRIEF_KEYS))
        for k in doc
        if k not in BRIEF_KEYS
    ]
    if "schema" in doc and doc["schema"] != 1:
        out.append(finding("schema", doc["schema"], "1"))
    if "asset" in doc and not (
        isinstance(doc["asset"], str) and ASSET_RE.fullmatch(doc["asset"])
    ):
        out.append(
            finding("asset", doc["asset"], "an ID: a-z, 0-9, and hyphens, up to 40")
        )
    if "kind" in doc and not (isinstance(doc["kind"], str) and doc["kind"]):
        out.append(finding("kind", doc["kind"], "a kind in caps.json's per_asset"))
    if "spec" in doc and not (
        isinstance(doc["spec"], str) and SPEC_RE.fullmatch(doc["spec"])
    ):
        out.append(finding("spec", doc["spec"], "a spec's folder name, NNN-name"))
    if "round" in doc and not (is_int(doc["round"]) and 1 <= doc["round"] <= ROUNDS):
        out.append(finding("round", doc["round"], f"1 to {ROUNDS}"))
    limits = doc.get("limits")
    if "limits" in doc and not isinstance(limits, dict):
        out.append(finding("limits", limits, "an object"))
    elif isinstance(limits, dict):
        for key, value in limits.items():
            here = f"limits.{key}"
            if key not in LIMIT_KEYS:
                out.append(finding(here, "an unknown limit", ", ".join(LIMIT_KEYS)))
            elif key in NUMERIC_LIMITS and not (is_int(value) and value > 0):
                out.append(finding(here, value, "a positive whole number"))
            elif key == "skeleton" and not (isinstance(value, str) and value.strip()):
                out.append(finding(here, value, "text"))
            elif key in LIST_LIMITS and not (
                isinstance(value, list)
                and all(isinstance(v, str) and v for v in value)
                and len(set(value)) == len(value)
            ):
                out.append(finding(here, value, "a list of distinct names"))
    tools = doc.get("tools")
    if "tools" in doc and not (
        isinstance(tools, list)
        and all(isinstance(t, str) and t for t in tools)
        and len(set(tools)) == len(tools)
    ):
        out.append(
            finding("tools", tools, "a list of distinct IDs from the tools list")
        )
    refs = doc.get("references")
    if "references" in doc and not (
        isinstance(refs, list)
        and all(
            isinstance(r, str)
            and r
            and not r.startswith("/")
            and ".." not in r.split("/")
            for r in refs
        )
    ):
        out.append(finding("references", refs, "a list of repository paths"))
    found = doc.get("findings")
    if "findings" in doc and not (
        isinstance(found, list) and all(isinstance(f, str) for f in found)
    ):
        out.append(finding("findings", found, "a list of lines"))
    if "notes" in doc and not isinstance(doc["notes"], str):
        out.append(finding("notes", doc["notes"], "text"))
    return out


def order_findings(
    path: Path,
    doc: dict,
    main: Main,
    handoff: Path,
    *,
    judging: bool,
    rechecking: bool = False,
) -> list[str]:
    """The brief's place in its asset's rounds. Judging (candidate, round), its own round's handoff and result may
    exist; writing (brief), they may not. Either way no later brief, handoff, or result may, except when a recorded
    pass is re-checked (rechecking): a later round doesn't undo a pass."""
    m = ROUND_FILE.fullmatch(path.name)
    if not m:
        return [finding("brief path", path.name, "<briefs>/<asset>/<round>.json")]
    out = []
    n, asset, findings = doc["round"], doc["asset"], doc["findings"]
    if int(m[1]) != n:
        out.append(finding("round", n, f"the file's name, {int(m[1])}"))
    if path.parent.name != asset:
        out.append(finding("asset", asset, f"the folder's name, {path.parent.name}"))
    briefs = brief_rounds(path.parent, but=path.name)
    answered = handoff_rounds(handoff, asset)
    judged = result_rounds(path.parent)
    later = sorted(x for x in briefs | answered | judged if x > n)
    # A re-checked pass may have later rounds only in the one shape that follows a pass: round n+1's brief, holding
    # no findings. Any other later round keeps the refusal, so a rewritten early brief and result pass nothing.
    if later and not (rechecking and follows_a_pass(path.parent, n)):
        out.append(
            finding(
                "round",
                n,
                f"the asset's latest round; round {later[-1]} already exists",
            )
        )
    if not judging and (n in answered or n in judged):
        out.append(
            finding(
                "round",
                n,
                "a round the studio hasn't answered yet: its handoff or result exists",
            )
        )
    highest = max(briefs, default=0)
    if not later and highest != n - 1:
        out.append(
            finding("round", n, f"the folder's highest brief plus one, {highest + 1}")
        )
    if n == 1:
        if findings:
            out.append(finding("findings", f"{len(findings)} lines", "none in round 1"))
        return out
    if n - 1 not in answered:
        out.append(finding("round", n, f"after round {n - 1}'s handoff; it has none"))
    before = read_result(path.parent, n - 1)
    if before is None:
        out.append(
            finding(
                "round", n, f"after round {n - 1}'s recorded failure; it has no result"
            )
        )
    elif before["result"] == "pass":
        if findings:
            out.append(
                finding(
                    "findings",
                    f"{len(findings)} lines",
                    f"none after round {n - 1}'s pass",
                )
            )
        elif n - 1 in answered and not passes_again(path.parent, n - 1, main, handoff):
            out.append(
                finding(
                    "round", n, f"after round {n - 1}'s pass; it doesn't re-check clean"
                )
            )
    else:
        if findings != before["findings"]:
            out.append(
                finding(
                    "findings",
                    f"not round {n - 1}'s",
                    f"round {n - 1}'s findings, verbatim",
                )
            )
        passed = [
            m
            for m in sorted(judged)
            if m < n - 1
            and (r := read_result(path.parent, m))
            and r["result"] == "pass"
        ]
        if passed:
            out.append(
                finding(
                    "round",
                    n,
                    f"no brief after round {n - 1}'s failure, which follows round {passed[-1]}'s pass: "
                    "the Author decides",
                )
            )
    return out


def follows_a_pass(folder: Path, n: int) -> bool:
    """Round n+1's brief exists and holds no findings: the only round that may follow round n's pass."""
    path = folder / f"{n + 1}.json"
    if not path.is_file():
        return False
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, ValueError, RecursionError):
        return False
    return isinstance(doc, dict) and doc.get("findings") == []


def brief_findings(
    path: Path, main: Main, handoff: Path, *, judging: bool, rechecking: bool = False
) -> tuple[list[str], object]:
    """Every check on a brief: its shape, main's caps and tools, and its place in the rounds."""
    if not path.is_file():
        raise CantRun(f"the brief ({clean(str(path))}) isn't a file")
    caps, tools = main.caps(), main.tools()
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, ValueError, RecursionError):
        return [
            finding("brief", "doesn't parse as JSON", "data-model.md's Brief")
        ], None
    out = brief_shape(doc)
    if not isinstance(doc, dict):
        return out, doc
    kind = doc.get("kind")
    cap = caps.get(kind) if isinstance(kind, str) else None
    if isinstance(kind, str) and kind and cap is None:
        out.append(
            finding(
                "kind",
                kind,
                f"a kind in main's caps.json per_asset: {', '.join(sorted(caps))}",
            )
        )
    limits = doc.get("limits")
    if isinstance(cap, dict) and isinstance(limits, dict):
        for key in NUMERIC_LIMITS:
            value, ceiling = limits.get(key), cap.get(key)
            if is_int(value) and is_int(ceiling) and value > ceiling:
                out.append(
                    finding(
                        f"limits.{key}",
                        value,
                        f"main's caps.json per_asset.{kind}.{key}, {ceiling}",
                    )
                )
    listed = doc.get("tools")
    if isinstance(listed, list):
        for name in listed:
            if isinstance(name, str) and (problem := tool_problem(name, tools)):
                out.append(tool_line("tools", name, problem))
    if not any(
        line.startswith(("round:", "asset:", "findings:", "brief:")) for line in out
    ) and all(k in doc for k in ("asset", "round", "findings")):
        out += order_findings(
            path, doc, main, handoff, judging=judging, rechecking=rechecking
        )
    return out, doc


def cmd_brief(args: argparse.Namespace) -> int:
    out, _ = brief_findings(
        Path(args.file), Main(Path(args.repo)), Path(args.handoff), judging=False
    )
    return report(out)


# --------------------------------------------------------------------------------------------------
# GLBs and images
# --------------------------------------------------------------------------------------------------
def webp_size(data: bytes) -> tuple[int, int] | None:
    """(width, height) from a WebP's first chunk: VP8X's canvas, VP8L's header, or VP8's key frame."""
    if len(data) < 30 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return None
    fourcc, body = data[12:16], data[20:]
    if fourcc == b"VP8X" and len(body) >= 10:
        return 1 + int.from_bytes(body[4:7], "little"), 1 + int.from_bytes(
            body[7:10], "little"
        )
    if fourcc == b"VP8L" and len(body) >= 5 and body[0] == 0x2F:
        bits = int.from_bytes(body[1:5], "little")
        return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    if fourcc == b"VP8 " and len(body) >= 10 and body[3:6] == b"\x9d\x01\x2a":
        width, height = struct.unpack("<HH", body[6:10])
        return width & 0x3FFF, height & 0x3FFF
    return None


def image_size(data: bytes) -> tuple[int, int] | None:
    """(width, height) from a PNG's IHDR, a JPEG's SOF segment, or a WebP's header, or None."""
    if data[:8] == PNG_SIG and len(data) >= 24 and data[12:16] == b"IHDR":
        width, height = struct.unpack(">II", data[16:24])
        return width, height
    if data[:4] == b"RIFF":
        return webp_size(data)
    if data[:2] != b"\xff\xd8":
        return None
    i = 2
    while i + 4 <= len(data):
        if data[i] != 0xFF:
            return None
        marker = data[i + 1]
        if marker == 0xFF:
            i += 1
            continue
        if marker == 0x01 or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        if marker in (0xD8, 0xD9, 0xDA):
            return None
        (length,) = struct.unpack(">H", data[i + 2 : i + 4])
        if length < 2:
            return None
        if marker in JPEG_SOF:
            if i + 9 > len(data):
                return None
            height, width = struct.unpack(">HH", data[i + 5 : i + 9])
            return width, height
        i += 2 + length
    return None


def read_glb(data: bytes) -> tuple[dict, bytes]:
    """The JSON chunk, parsed, and the BIN chunk's bytes. GlbError names what's wrong."""
    if len(data) < 20 or data[:4] != b"glTF":
        raise GlbError("no GLB header")
    version, total = struct.unpack("<II", data[4:12])
    if version != 2 or total > len(data):
        raise GlbError("not glTF 2.0 within the file")
    chunks, pos = [], 12
    while pos + 8 <= total:
        length, kind = struct.unpack("<II", data[pos : pos + 8])
        if pos + 8 + length > total:
            raise GlbError("a chunk runs past the file")
        chunks.append((kind, data[pos + 8 : pos + 8 + length]))
        pos += 8 + length
    if not chunks or chunks[0][0] != 0x4E4F534A:
        raise GlbError("no JSON chunk first")
    try:
        gltf = json.loads(chunks[0][1].decode("utf-8"))
    except (UnicodeDecodeError, ValueError, RecursionError):
        raise GlbError("its JSON chunk doesn't parse") from None
    if not isinstance(gltf, dict):
        raise GlbError("its JSON isn't an object")
    binary = chunks[1][1] if len(chunks) > 1 and chunks[1][0] == 0x004E4942 else b""
    return gltf, binary


def listed(gltf: dict, key: str) -> list:
    value = gltf.get(key)
    return [v for v in value if isinstance(v, dict)] if isinstance(value, list) else []


def measure(gltf: dict, binary: bytes) -> dict:
    """Triangles, bones, clips, and images' sizes. `problems` names every accessor or mode that doesn't count, so a
    malformed primitive is a finding, never 0 triangles (review G3, important 3)."""
    problems: list[str] = []
    accessors = gltf.get("accessors", [])
    if not isinstance(accessors, list):
        problems.append("accessors isn't a list")
        accessors = []

    def count(index: object, where: str) -> int | None:
        if not (
            is_int(index)
            and 0 <= index < len(accessors)
            and isinstance(accessors[index], dict)
        ):
            problems.append(f"{where} names no accessor")
            return None
        value = accessors[index].get("count")
        if not (is_int(value) and value >= 1):
            problems.append(
                f"{where}: accessors[{index}].count isn't a whole number of at least 1"
            )
            return None
        return value

    triangles = 0
    meshes = gltf.get("meshes", [])
    if not isinstance(meshes, list):
        problems.append("meshes isn't a list")
        meshes = []
    for i, mesh in enumerate(meshes):
        prims = mesh.get("primitives") if isinstance(mesh, dict) else None
        if not isinstance(prims, list):
            problems.append(f"meshes[{i}].primitives isn't a list")
            continue
        for j, prim in enumerate(prims):
            where = f"meshes[{i}].primitives[{j}]"
            if not isinstance(prim, dict) or not isinstance(
                prim.get("attributes"), dict
            ):
                problems.append(f"{where} has no attributes object")
                continue
            mode = prim.get("mode", 4)
            if not (is_int(mode) and 0 <= mode <= 6):
                problems.append(f"{where}.mode isn't a whole number from 0 to 6")
                continue
            if "indices" in prim:
                k = count(prim["indices"], f"{where}.indices")
            else:
                k = count(
                    prim["attributes"].get("POSITION"), f"{where}.attributes.POSITION"
                )
            if k is None:
                continue
            triangles += k // 3 if mode == 4 else max(k - 2, 0) if mode in (5, 6) else 0
    nodes = gltf.get("nodes") if isinstance(gltf.get("nodes"), list) else []
    bones = set()
    for skin in listed(gltf, "skins"):
        joints = skin.get("joints")
        for j in joints if isinstance(joints, list) else []:
            if is_int(j) and 0 <= j < len(nodes) and isinstance(nodes[j], dict):
                name = nodes[j].get("name")
                if isinstance(name, str):
                    bones.add(name)
    clips = {
        a["name"] for a in listed(gltf, "animations") if isinstance(a.get("name"), str)
    }
    views = gltf.get("bufferViews") if isinstance(gltf.get("bufferViews"), list) else []
    images: list[tuple[int, tuple[int, int] | None]] = []
    raw = gltf.get("images") if isinstance(gltf.get("images"), list) else []
    for i, image in enumerate(raw):
        size = None
        index = image.get("bufferView") if isinstance(image, dict) else None
        if is_int(index) and 0 <= index < len(views) and isinstance(views[index], dict):
            view = views[index]
            start, length = view.get("byteOffset", 0), view.get("byteLength")
            if (
                view.get("buffer", 0) == 0
                and is_int(start)
                and is_int(length)
                and start >= 0
            ):
                size = image_size(binary[start : start + length])
        images.append((i, size))
    return {
        "triangles": triangles,
        "problems": problems,
        "bones": bones,
        "clips": clips,
        "images": images,
    }


def has_bone(required: str, bones: set[str]) -> bool:
    return any(b == required or b.endswith(":" + required) for b in bones)


# --------------------------------------------------------------------------------------------------
# Still sets (spec 030 FR-022; its plan §R-D1): each PNG's pixels, read by zlib and PNG's five filters
# --------------------------------------------------------------------------------------------------
SLICES = "slices.json"
SLICE_KEYS = ("schema", "files", "labels")
SIDES = ("top", "right", "bottom", "left")
BUTTON_FILE = re.compile(r"btn-([a-z0-9]+)-([a-z0-9]+)\.png")
HEX_COLOUR = re.compile(r"#[0-9a-fA-F]{6}")
CHANNELS = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}
READ_PX = (
    2048 * 2048
)  # the most pixels read from one file (16 MiB of RGBA), whatever the brief's texture_px
STATES_APART = 15  # ΔE76, spec 030 FR-022
LABEL_RATIO = 4.5  # WCAG AA for text, spec 030 FR-022
LABEL_ALPHA = 128  # alpha 0.5 or more, of 255
SLICES_SHAPE = '{"schema": 1, "files": {name: {top, right, bottom, left}}, "labels": {variant: "#rrggbb"}}'
INSET_LIMIT = "top, right, bottom, and left, whole numbers of at least 1"
INSIDE_LIMIT = "left + right under the width, top + bottom under the height"
LABEL_LIMIT = f"{LABEL_RATIO}:1 over every centre pixel of alpha 0.5 or more, over white and over black"


class PngError(Exception):
    """A PNG whose header or pixels can't be read: a finding for the round, never a crash."""


Rows = list[bytes]  # one bytes object of RGBA samples per row


def png_header(data: bytes) -> dict:
    """IHDR's fields, and the PLTE, tRNS, and IDAT chunks' bodies. PngError names what's wrong."""
    if data[:8] != PNG_SIG:
        raise PngError("no PNG signature")
    pos, chunks = 8, {"PLTE": None, "tRNS": None, "IDAT": []}
    ihdr = None
    while pos + 12 <= len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        kind, end = data[pos + 4 : pos + 8], pos + 8 + length
        if end + 4 > len(data):
            raise PngError(f"a chunk at byte {pos} runs past the file")
        body = data[pos + 8 : end]
        if kind == b"IHDR" and ihdr is None:
            ihdr = body
        elif kind == b"IDAT":
            chunks["IDAT"].append(body)
        elif kind in (b"PLTE", b"tRNS"):
            chunks[kind.decode()] = body
        elif kind == b"IEND":
            break
        pos = end + 4
    if ihdr is None or len(ihdr) != 13:
        raise PngError("no IHDR chunk of 13 bytes")
    width, height, depth, colour, _, _, interlace = struct.unpack(">IIBBBBB", ihdr)
    if not (width and height) or colour not in CHANNELS:
        raise PngError(f"IHDR gives {width} by {height}, colour type {colour}")
    return {
        "width": width,
        "height": height,
        "depth": depth,
        "colour": colour,
        "interlace": interlace,
        **chunks,
    }


def unfilter(raw: bytes, width: int, height: int, bpp: int) -> Rows:
    """The scanlines, each under its filter (0 None, 1 Sub, 2 Up, 3 Average, 4 Paeth), undone."""
    stride, rows = width * bpp, []
    prior = bytearray(stride)
    for y in range(height):
        start = y * (stride + 1)
        kind, line = raw[start], bytearray(raw[start + 1 : start + 1 + stride])
        if kind == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 0xFF
        elif kind == 2:
            for i in range(stride):
                line[i] = (line[i] + prior[i]) & 0xFF
        elif kind == 3:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + (left + prior[i]) // 2) & 0xFF
        elif kind == 4:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                b, c = prior[i], prior[i - bpp] if i >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if pa <= pb and pa <= pc else b if pb <= pc else c
                line[i] = (line[i] + pred) & 0xFF
        elif kind != 0:
            raise PngError(f"row {y} has filter {kind}, not 0 to 4")
        rows.append(bytes(line))
        prior = line
    return rows


def png_pixels(head: dict) -> Rows:
    """An 8-bit, non-interlaced PNG's pixels as RGBA rows, its palette and tRNS applied. PngError names what stops
    the reading."""
    width, height, colour = head["width"], head["height"], head["colour"]
    bpp = CHANNELS[colour]
    size = height * (width * bpp + 1)
    try:
        raw = zlib.decompressobj().decompress(b"".join(head["IDAT"]), size)
    except zlib.error:
        raise PngError("its pixel data doesn't inflate") from None
    if len(raw) < size:
        raise PngError(f"its pixel data ends at {len(raw)} bytes, not {size}")
    rows, trns, out = unfilter(raw, width, height, bpp), head["tRNS"], []
    if colour == 6:
        return rows
    palette = head["PLTE"] or b""
    for row in rows:
        rgba = bytearray()
        for x in range(width):
            if colour == 4:
                g, a = row[2 * x], row[2 * x + 1]
                rgba += bytes((g, g, g, a))
            elif colour == 3:
                i = row[x]
                if 3 * i + 3 > len(palette):
                    raise PngError(f"palette index {i} past its PLTE")
                a = trns[i] if trns is not None and i < len(trns) else 255
                rgba += palette[3 * i : 3 * i + 3] + bytes((a,))
            else:
                px = row[3 * x : 3 * x + 3] if colour == 2 else row[x : x + 1] * 3
                key = px if colour == 2 else px[:1]
                clear = trns is not None and trns[1::2] == key
                rgba += px + bytes((0 if clear else 255,))
        out.append(bytes(rgba))
    return out


def ring_finding(name: str, width: int, height: int, rows: Rows) -> str | None:
    """Alpha 0 on the outermost one-pixel ring, or the count of pixels above it and the first, in reading order."""
    ring = [
        (x, y)
        for y in range(height)
        for x in (range(width) if y in (0, height - 1) else sorted({0, width - 1}))
    ]
    above = [(x, y) for x, y in ring if rows[y][4 * x + 3] > 0]
    if not above:
        return None
    x, y = above[0]
    count = f"{len(above)} pixel{'s' if len(above) != 1 else ''}"
    return finding(
        f"ring {name}",
        f"{count} above alpha 0, the first at {x},{y}",
        "alpha 0 on the outermost one-pixel ring",
    )


def linear(value: float) -> float:
    c = value / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(rgb: tuple[float, float, float]) -> float:
    """WCAG's relative luminance of an sRGB colour, 0 to 255 a channel."""
    r, g, b = (linear(v) for v in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def lab(rgb: tuple[float, float, float]) -> tuple[float, float, float]:
    """CIELAB (D65) of an sRGB colour, 0 to 255 a channel."""
    r, g, b = (linear(v) for v in rgb)
    xyz = (
        (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047,
        0.2126729 * r + 0.7151522 * g + 0.0721750 * b,
        (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883,
    )
    fx, fy, fz = (
        t ** (1 / 3) if t > (6 / 29) ** 3 else t / (3 * (6 / 29) ** 2) + 4 / 29
        for t in xyz
    )
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def floored(value: float, places: int) -> str:
    """A measure printed without rounding up past its limit: 4.499 is 4.49, never 4.50."""
    scale = 10**places
    return f"{math.floor(value * scale) / scale:.{places}f}"


def centre(rows: Rows, width: int, height: int, inset: dict):
    """(x, y, r, g, b, a) of each pixel inside the insets."""
    for y in range(inset["top"], height - inset["bottom"]):
        row = rows[y]
        for x in range(inset["left"], width - inset["right"]):
            yield x, y, *row[4 * x : 4 * x + 4]


def centre_mean(
    rows: Rows, width: int, height: int, inset: dict
) -> tuple[float, float, float] | None:
    """The centre's alpha-weighted mean sRGB colour, or None for a centre with no alpha."""
    total, sums = 0, [0, 0, 0]
    for _, _, r, g, b, a in centre(rows, width, height, inset):
        total += a
        sums[0] += r * a
        sums[1] += g * a
        sums[2] += b * a
    return (sums[0] / total, sums[1] / total, sums[2] / total) if total else None


def label_finding(
    name: str, label: str, rows: Rows, width: int, height: int, inset: dict
) -> str | None:
    """The label against every centre pixel of alpha 0.5 or more, composited over white and over black: the lowest
    ratio, if under 4.5:1, at its pixel."""
    ink = luminance(tuple(int(label[i : i + 2], 16) for i in (1, 3, 5)))
    worst: tuple[float, str, int, int] | None = None
    seen: dict[tuple[int, int, int, int], tuple[float, str]] = {}
    for x, y, r, g, b, a in centre(rows, width, height, inset):
        if a < LABEL_ALPHA:
            continue
        key = (r, g, b, a)
        if key not in seen:
            low = None
            for ground, bg in (("white", 255), ("black", 0)):
                mixed = tuple((v * a + bg * (255 - a)) / 255 for v in (r, g, b))
                hi, lo = sorted((ink, luminance(mixed)), reverse=True)
                ratio = (hi + 0.05) / (lo + 0.05)
                if low is None or ratio < low[0]:
                    low = (ratio, ground)
            seen[key] = low
        ratio, ground = seen[key]
        if worst is None or ratio < worst[0]:
            worst = (ratio, ground, x, y)
    if worst is None or worst[0] >= LABEL_RATIO:
        return None
    ratio, ground, x, y = worst
    return finding(
        f"label {name}",
        f"{label} at {floored(ratio, 2)}:1 over {ground} at {x},{y}",
        LABEL_LIMIT,
    )


def slices_findings(
    folder: Path, pngs: list[str], sizes: dict[str, tuple[int, int]]
) -> tuple[list[str], dict[str, dict], dict[str, str]]:
    """slices.json beside the files: its shape, every PNG named and no other, each inset inside its image. Returns
    the findings, the insets that hold, and the labels."""
    path = folder / SLICES
    if not path.is_file() or path.is_symlink():
        return (
            [finding(SLICES, "absent", "a file beside the files, for a ui- asset")],
            {},
            {},
        )
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, ValueError, RecursionError):
        return [finding(SLICES, "doesn't parse as JSON", SLICES_SHAPE)], {}, {}
    if not isinstance(doc, dict):
        return [finding(SLICES, "not a JSON object", SLICES_SHAPE)], {}, {}
    out = [
        finding(SLICES, f"{k} absent", SLICES_SHAPE) for k in SLICE_KEYS if k not in doc
    ]
    out += [
        finding(SLICES, f"{k} an unknown field", SLICES_SHAPE)
        for k in doc
        if k not in SLICE_KEYS
    ]
    if "schema" in doc and doc["schema"] != 1:
        out.append(finding(SLICES, f"schema {clean(doc['schema'])}", "1"))
    for key in ("files", "labels"):
        if key in doc and not isinstance(doc[key], dict):
            out.append(finding(SLICES, f"{key} {clean(doc[key])}", SLICES_SHAPE))
    if out:
        return out, {}, {}
    named, labels = doc["files"], doc["labels"]
    variants = {m.group(1) for n in pngs if (m := BUTTON_FILE.fullmatch(n))}
    for variant, colour in labels.items():
        if variant not in variants:
            out.append(
                finding(
                    f"{SLICES} labels",
                    variant,
                    "only the variants of the btn-<variant>-<state>.png files",
                )
            )
        elif not (isinstance(colour, str) and HEX_COLOUR.fullmatch(colour)):
            out.append(finding(f"{SLICES} labels.{variant}", colour, "#rrggbb"))
    for variant in sorted(variants - set(labels)):
        out.append(
            finding(
                f"{SLICES} labels",
                f"{variant} absent",
                "a label colour for every variant's buttons",
            )
        )
    for name in pngs:
        if name not in named:
            out.append(
                finding(
                    f"{SLICES} files",
                    f"{name} absent",
                    "every PNG candidate.json names",
                )
            )
    for name in named:
        if name not in pngs:
            out.append(
                finding(f"{SLICES} files", name, "only the PNGs candidate.json names")
            )
    insets: dict[str, dict] = {}
    for name in pngs:
        inset = named.get(name)
        if inset is None:
            continue
        if not (
            isinstance(inset, dict)
            and set(inset) == set(SIDES)
            and all(is_int(inset[s]) and inset[s] >= 1 for s in SIDES)
        ):
            out.append(finding(f"{SLICES} {name}", inset, INSET_LIMIT))
            continue
        bad = False
        if name in sizes:
            width, height = sizes[name]
            left, right, top, bottom = (
                inset[s] for s in ("left", "right", "top", "bottom")
            )
            if left + right >= width:
                out.append(
                    finding(
                        f"{SLICES} {name}",
                        f"left {left} + right {right} = {left + right}, width {width}",
                        INSIDE_LIMIT,
                    )
                )
                bad = True
            if top + bottom >= height:
                out.append(
                    finding(
                        f"{SLICES} {name}",
                        f"top {top} + bottom {bottom} = {top + bottom}, height {height}",
                        INSIDE_LIMIT,
                    )
                )
                bad = True
        if not bad:
            insets[name] = inset
    good = {
        v: c
        for v, c in labels.items()
        if v in variants and isinstance(c, str) and HEX_COLOUR.fullmatch(c)
    }
    return out, insets, good


def still_findings(
    folder: Path, brief: dict, files: list[str], named: object
) -> list[str]:
    """A still set's checks (spec 030 FR-022): each PNG's size, depth, alpha, and ring; for a ui- asset, slices.json,
    the states apart, and the labels' contrast. Only the handoff folder and the brief are read."""
    out: list[str] = []
    side = brief["limits"].get("texture_px")
    pngs = [n for n in files if n.lower().endswith(".png")]
    sizes: dict[str, tuple[int, int]] = {}
    pixels: dict[str, Rows] = {}
    for name in pngs:
        try:
            head = png_header((folder / name).read_bytes())
        except PngError as exc:
            out.append(finding(f"png {name}", f"doesn't read ({exc})", "an 8-bit PNG"))
            continue
        width, height = head["width"], head["height"]
        sizes[name] = (width, height)
        readable = True
        if is_int(side) and max(width, height) > side:
            out.append(
                finding(
                    f"texture_px {name}",
                    f"{width} by {height}",
                    f"the brief's, {side}",
                )
            )
            readable = False
        if head["colour"] not in (4, 6) and head["tRNS"] is None:
            out.append(
                finding(
                    f"alpha {name}",
                    f"colour type {head['colour']} and no tRNS chunk",
                    "an alpha channel: colour type 6 or 4, or a tRNS chunk",
                )
            )
        if head["depth"] != 8:
            out.append(
                finding(f"png {name}", f"bit depth {head['depth']}", "8 bits a sample")
            )
            readable = False
        if head["interlace"] != 0:
            out.append(
                finding(
                    f"png {name}",
                    "interlaced",
                    "a non-interlaced PNG, whose rows the judge reads",
                )
            )
            readable = False
        if readable and width * height > READ_PX:
            out.append(
                finding(
                    f"png {name}",
                    f"{width} by {height}",
                    f"at most {READ_PX} pixels to read",
                )
            )
            readable = False
        if not readable:
            continue
        try:
            rows = png_pixels(head)
        except PngError as exc:
            out.append(finding(f"png {name}", f"doesn't read ({exc})", "an 8-bit PNG"))
            continue
        pixels[name] = rows
        if line := ring_finding(name, width, height, rows):
            out.append(line)
    if not brief["asset"].startswith("ui-"):
        return out
    if isinstance(named, list) and SLICES in named:
        out.append(
            finding(
                "files",
                SLICES,
                "never in files: it sits beside them, as records.json does",
            )
        )
    found, insets, labels = slices_findings(folder, pngs, sizes)
    out += found
    states: dict[str, list[tuple[str, tuple[float, float, float]]]] = {}
    for name in sorted(insets):
        match = BUTTON_FILE.fullmatch(name)
        if not match or name not in pixels:
            continue
        width, height = sizes[name]
        rows, inset, variant = pixels[name], insets[name], match.group(1)
        mean = centre_mean(rows, width, height, inset)
        if mean is None:
            out.append(
                finding(
                    f"states {name}",
                    "its centre is transparent",
                    "a centre with colour to compare",
                )
            )
        else:
            states.setdefault(variant, []).append((name, lab(mean)))
        if variant in labels and (
            line := label_finding(name, labels[variant], rows, width, height, inset)
        ):
            out.append(line)
    for variant in sorted(states):
        for (a, lab_a), (b, lab_b) in itertools.combinations(states[variant], 2):
            delta = math.dist(lab_a, lab_b)
            if delta < STATES_APART:
                out.append(
                    finding(
                        f"states {a} {b}",
                        f"delta E76 {floored(delta, 1)}",
                        f"at least {STATES_APART} apart",
                    )
                )
    return out


# --------------------------------------------------------------------------------------------------
# Candidates
# --------------------------------------------------------------------------------------------------
def step_strings(value: object, where: str) -> list[tuple[str, str]]:
    if isinstance(value, str):
        return [(where, value)]
    if isinstance(value, dict):
        return [s for k, v in value.items() for s in step_strings(v, f"{where}.{k}")]
    if isinstance(value, list):
        return [
            s for i, v in enumerate(value) for s in step_strings(v, f"{where}[{i}]")
        ]
    return []


def record_findings(
    doc: object, brief_tools: set[str], tools: dict[str, dict]
) -> tuple[list[str], str | None]:
    """The record's directory, and every step's models and tools: on the list, in the brief, and never Qwen-Image or
    FLUX [dev], refused by name. The arrival check holds the rest of the record to its own rules."""
    if not isinstance(doc, dict):
        return [
            finding("record", "not a JSON object", "the arrival check's records.json")
        ], None
    out, directory = [], doc.get("directory")
    if not (
        isinstance(directory, str)
        and DIR_RE.fullmatch(directory)
        and not (directory + "/").startswith("assets/policy/")
    ):
        out.append(
            finding(
                "record directory",
                directory,
                "a folder under assets/, but assets/policy/",
            )
        )
        directory = None
    entries = doc.get("entries")
    for i, entry in enumerate(entries if isinstance(entries, list) else []):
        steps = entry.get("steps") if isinstance(entry, dict) else None
        for j, step in enumerate(steps if isinstance(steps, list) else []):
            where = f"record entries[{i}].steps[{j}]"
            for w, s in step_strings(step, where):
                if refused_by_name(s):
                    out.append(f"{w}: {clean(s)} refused by name (limit: {REFUSED})")
            if not isinstance(step, dict):
                continue
            for key in ("models", "tools"):
                items = step.get(key)
                for k, item in enumerate(items if isinstance(items, list) else []):
                    name = item.get("name") if isinstance(item, dict) else None
                    here = f"{where}.{key}[{k}].name"
                    if not isinstance(name, str):
                        out.append(finding(here, name, "a name on the tools list"))
                        continue
                    if refused_by_name(name):
                        continue
                    problem = tool_problem(name, tools)
                    if problem:
                        out.append(tool_line(here, name, problem))
                    elif norm(name) not in brief_tools:
                        out.append(finding(here, name, "a tool the brief names"))
    return out, directory


def candidate_findings(
    folder: Path, brief: dict, tools: dict[str, dict]
) -> tuple[list[str], list[str], str | None]:
    """Findings, the files to copy, and the record's directory (None when the arrival check can't be given one)."""
    path = folder / "candidate.json"
    if not path.is_file() or path.is_symlink():
        return (
            [finding("candidate.json", "absent", "a file in the handoff folder")],
            [],
            None,
        )
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, ValueError, RecursionError):
        return (
            [
                finding(
                    "candidate.json",
                    "doesn't parse as JSON",
                    "data-model.md's Candidate",
                )
            ],
            [],
            None,
        )
    if not isinstance(doc, dict):
        return (
            [
                finding(
                    "candidate.json", "not a JSON object", "data-model.md's Candidate"
                )
            ],
            [],
            None,
        )
    out = [
        finding(k, "absent", "a field every candidate holds")
        for k in CANDIDATE_KEYS
        if k not in doc
    ]
    out += [
        finding(k, "an unknown field", ", ".join(CANDIDATE_KEYS))
        for k in doc
        if k not in CANDIDATE_KEYS
    ]
    if "schema" in doc and doc["schema"] != 1:
        out.append(finding("schema", doc["schema"], "1"))
    if "asset" in doc and doc["asset"] != brief["asset"]:
        out.append(finding("asset", doc["asset"], f"the brief's, {brief['asset']}"))
    if "round" in doc and doc["round"] != brief["round"]:
        out.append(finding("round", doc["round"], f"the brief's, {brief['round']}"))
    limits, brief_tools = brief["limits"], {norm(t) for t in brief["tools"]}

    # The files, each a regular file in the folder.
    files: list[str] = []
    named = doc.get("files")
    if "files" in doc and not (isinstance(named, list) and named):
        out.append(finding("files", named, "a list of file names in the folder"))
        named = []
    present = True
    for name in named if isinstance(named, list) else []:
        if (
            not isinstance(name, str)
            or not FILE_RE.fullmatch(name)
            or name in (RECORDS, NOTICE, "candidate.json")
            or name in files
        ):
            out.append(
                finding(
                    "files",
                    name,
                    "a distinct file name in the folder, not the record or the notice",
                )
            )
            present = False
        elif not (folder / name).is_file() or (folder / name).is_symlink():
            out.append(
                finding(
                    "files",
                    f"{name} absent",
                    "every file candidate.json names, in the folder",
                )
            )
            present = False
        else:
            files.append(name)

    # The tools candidate.json names: in the brief, on the list, at the list's version.
    named_tools = doc.get("tools")
    if "tools" in doc and not isinstance(named_tools, list):
        out.append(finding("tools", named_tools, "a list of {id, version}"))
    for i, item in enumerate(named_tools if isinstance(named_tools, list) else []):
        if (
            not isinstance(item, dict)
            or set(item) != set(CANDIDATE_TOOL_KEYS)
            or not all(isinstance(item[k], str) for k in CANDIDATE_TOOL_KEYS)
        ):
            out.append(finding(f"tools[{i}]", item, "{id, version}"))
            continue
        tid, version = item["id"], item["version"]
        problem = tool_problem(tid, tools)
        if problem:
            out.append(tool_line("tools", tid, problem))
        elif norm(tid) not in brief_tools:
            out.append(
                finding("tools", tid, f"the brief's tools: {', '.join(brief['tools'])}")
            )
        elif version != tools[norm(tid)]["version"]:
            out.append(
                finding(
                    "tools",
                    f"{tid} {version}",
                    f"the list's version, {tools[norm(tid)]['version']}",
                )
            )

    # The record.
    directory = None
    records = doc.get("records")
    if "records" in doc and records != RECORDS:
        out.append(finding("records", records, RECORDS))
        present = False
    elif not (folder / RECORDS).is_file() or (folder / RECORDS).is_symlink():
        out.append(finding("records", f"{RECORDS} absent", "the record, in the folder"))
        present = False
    else:
        try:
            record = json.loads((folder / RECORDS).read_text(encoding="utf-8"))
        except (UnicodeDecodeError, ValueError, RecursionError):
            out.append(
                finding(
                    "record",
                    "doesn't parse as JSON",
                    "the arrival check's records.json",
                )
            )
        else:
            found, directory = record_findings(record, brief_tools, tools)
            out += found

    # Each file's bytes, and each GLB's measures.
    bones: set[str] = set()
    clips: set[str] = set()
    for name in files:
        data = (folder / name).read_bytes()
        if is_int(limits.get("bytes")) and len(data) > limits["bytes"]:
            out.append(
                finding(f"bytes {name}", len(data), f"the brief's, {limits['bytes']}")
            )
        if not name.lower().endswith(".glb"):
            continue
        try:
            gltf, binary = read_glb(data)
        except GlbError as exc:
            out.append(
                finding(f"glb {name}", f"doesn't parse ({exc})", "a glTF 2.0 binary")
            )
            continue
        facts = measure(gltf, binary)
        bones |= facts["bones"]
        clips |= facts["clips"]
        for problem in facts["problems"]:
            out.append(
                finding(
                    f"triangles {name}",
                    problem,
                    "accessors and modes whose triangles can be counted",
                )
            )
        if is_int(limits.get("triangles")) and facts["triangles"] > limits["triangles"]:
            out.append(
                finding(
                    f"triangles {name}",
                    facts["triangles"],
                    f"the brief's, {limits['triangles']}",
                )
            )
        texture = 0
        side = limits.get("texture_px")
        for i, size in facts["images"]:
            if size is None:
                out.append(
                    finding(
                        f"texture_px {name} images[{i}]",
                        "unreadable",
                        "an embedded PNG, JPEG, or WebP",
                    )
                )
                continue
            width, height = size
            texture += width * height * 4 * 4 // 3
            if is_int(side) and max(width, height) > side:
                out.append(
                    finding(
                        f"texture_px {name} images[{i}]",
                        f"{width} by {height}",
                        f"the brief's, {side}",
                    )
                )
        if is_int(limits.get("texture_bytes")) and texture > limits["texture_bytes"]:
            out.append(
                finding(
                    f"texture_bytes {name}",
                    texture,
                    f"the brief's, {limits['texture_bytes']}",
                )
            )
    if brief["kind"] == "still":
        out += still_findings(folder, brief, files, named)
    for bone in limits.get("bones_required", []):
        if not has_bone(bone, bones):
            out.append(
                finding(
                    "bones_required",
                    f"{bone} absent",
                    "every bone the brief requires, in a skin's joints",
                )
            )
    for clip in limits.get("clips", []):
        if clip not in clips:
            out.append(
                finding(
                    "clips",
                    f"{clip} absent",
                    "every clip the brief requires, as an animation's name",
                )
            )
    notice = (folder / NOTICE).is_file() and not (folder / NOTICE).is_symlink()
    copy = files + [RECORDS] + ([NOTICE] if notice else [])
    return out, copy, directory if present else None


# --------------------------------------------------------------------------------------------------
# Main's arrival check, on a scratch repository
# --------------------------------------------------------------------------------------------------
def build_scratch(
    top: Path, copies: dict[str, bytes], folder: Path, names: list[str], directory: str
) -> list[Path]:
    """A repository whose refs/heads/main holds main's copies (plumbing only: no hook runs), with the candidate's
    files on disk under the record's directory. Returns the copied files' paths."""
    env = scratch_env()
    git(top, ["init", "-q", "--template="], env, "making the scratch repository")
    for rel, data in copies.items():
        target = top / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    if copies:
        git(top, ["add", "--", *copies], env, "in the scratch repository")
        tree = (
            git(top, ["write-tree"], env, "in the scratch repository").decode().strip()
        )
        commit = git(
            top,
            ["commit-tree", "-m", "main's policy", tree],
            env,
            "in the scratch repository",
        )
        git(
            top,
            ["update-ref", MAIN, commit.decode().strip()],
            env,
            "in the scratch repository",
        )
    git(top, ["symbolic-ref", "HEAD", MAIN], env, "in the scratch repository")
    dest = top / directory
    dest.mkdir(parents=True, exist_ok=True)
    paths = []
    for name in names:
        (dest / name).write_bytes((folder / name).read_bytes())
        paths.append(dest / name)
    return paths


def run_arrival(
    main: Main, folder: Path, names: list[str], directory: str
) -> tuple[int, list[str]]:
    """Main's arrival check on a scratch copy: its exit code and its output lines."""
    arrival, copies = main.arrival(), main.copies()
    work = Path(tempfile.mkdtemp(prefix="line-")).resolve()
    try:
        script = work / "arrival_check.py"
        script.write_bytes(arrival)
        script.chmod(0o400)
        top = work / "scratch"
        top.mkdir()
        paths = build_scratch(top, copies, folder, names, directory)
        try:
            done = subprocess.run(
                [
                    sys.executable,
                    "-I",
                    "-B",
                    str(script),
                    "--repo",
                    str(top),
                    *map(str, paths),
                ],
                cwd=top,
                env=scratch_env(),
                stdin=subprocess.DEVNULL,
                capture_output=True,
                text=True,
                errors="replace",
                check=False,
                timeout=900,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise CantRun(
                f"main's arrival check couldn't run ({exc.__class__.__name__})"
            ) from None
        code = done.returncode if done.returncode in (0, 1, 2) else 2
        return code, done.stdout.splitlines()
    finally:
        shutil.rmtree(work, ignore_errors=True)


def judge(
    folder: Path,
    brief_path: Path,
    main: Main,
    handoff: Path,
    *,
    rechecking: bool = False,
) -> tuple[int, list[str], list[str], dict]:
    """One round's verdict: (0 pass or 1 fail, the lines to print, the findings to record, the brief). The brief is
    re-checked in full first (review G3, important 2); anything that can't be judged raises CantRun. Rechecking, a
    recorded pass is judged again, and a later round doesn't count against its brief."""
    if not folder.is_dir():
        raise CantRun(f"the candidate folder ({clean(str(folder))}) isn't a folder")
    problems, brief = brief_findings(
        brief_path, main, handoff, judging=True, rechecking=rechecking
    )
    if problems:
        raise CantRun(f"the brief doesn't pass line.py brief: {problems[0]}")
    assert isinstance(brief, dict)
    out, names, directory = candidate_findings(folder, brief, main.tools())
    printed = list(out)
    arrival: list[str] = []
    code = 1 if out else 0
    if directory is None:
        printed.append(
            "arrival-check: not run, since the candidate's files or its record's directory are missing"
        )
    else:
        status, output = run_arrival(main, folder, names, directory)
        printed.append(
            f"arrival-check: main's copy, at {main.sha[:12]}, on a scratch copy under {directory}/"
        )
        printed += output
        arrival = [line for line in output if ARRIVAL_FINDING.match(line)]
        if status == 2:
            for line in printed:
                print(line)
            raise CantRun("main's arrival check couldn't check (its reason is above)")
        if status == 1 and not arrival:
            for line in printed:
                print(line)
            raise CantRun("main's arrival check exited 1 with no finding line")
        if status == 1:
            code = 1
    return code, printed, out + arrival, brief


def cmd_candidate(args: argparse.Namespace) -> int:
    folder, brief_path, handoff = Path(args.dir), Path(args.brief), Path(args.handoff)
    main = Main(Path(args.repo))
    if args.record:
        doc = read_json(brief_path, "the brief")
        if brief_shape(doc):
            raise CantRun("the brief isn't valid: line.py brief names why")
        assert isinstance(doc, dict)
        n, asset = doc["round"], doc["asset"]
        if brief_path.name != f"{n}.json" or brief_path.parent.name != asset:
            raise CantRun("--record needs the brief at <briefs>/<asset>/<round>.json")
        if (
            not folder.is_dir()
            or folder.resolve() != (handoff / asset / str(n)).resolve()
        ):
            raise CantRun(
                "--record judges only the round's own handoff folder, <handoff>/<asset>/<round>/"
            )
        if (brief_path.parent / f"{n}.result.json").exists():
            raise CantRun(f"round {n} already has a result: a round is judged once")
        later = sorted(
            x
            for x in handoff_rounds(handoff, asset) | result_rounds(brief_path.parent)
            if x > n
        )
        if later:
            raise CantRun(
                f"round {later[-1]} follows round {n}: round {n} can't be judged again"
            )
    code, printed, findings, brief = judge(folder, brief_path, main, handoff)
    for line in printed:
        print(line)
    if args.record:
        result = {
            "schema": 1,
            "asset": brief["asset"],
            "round": brief["round"],
            "result": "fail" if code else "pass",
            "findings": findings,
        }
        path = brief_path.parent / f"{brief['round']}.result.json"
        temp = path.with_name(path.name + ".tmp")
        temp.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        os.replace(temp, path)
    if code:
        total = len(findings)
        print(
            f"line: {total} finding{'s' if total != 1 else ''}; round {brief['round']} fails"
        )
    else:
        print(f"line: pass; round {brief['round']}")
    return code


# --------------------------------------------------------------------------------------------------
# Rounds
# --------------------------------------------------------------------------------------------------
def passes_again(folder: Path, n: int, main: Main, handoff: Path) -> bool:
    """Round n's recorded pass, judged again: its brief in <folder>, its handoff folder, main's checks."""
    code, _, _, _ = judge(
        handoff / folder.name / str(n),
        folder / f"{n}.json",
        main,
        handoff,
        rechecking=True,
    )
    return code == 0


def cmd_round(args: argparse.Namespace) -> int:
    asset = args.asset
    if not ASSET_RE.fullmatch(asset):
        raise CantRun("the asset isn't an ID: a-z, 0-9, and hyphens, up to 40")
    folder, handoff = Path(args.briefs) / asset, Path(args.handoff)
    answered = handoff_rounds(handoff, asset)
    judged = {n: read_result(folder, n) for n in sorted(result_rounds(folder))}
    # A recorded pass counts once its handoff is there and the candidate re-checks clean: the file alone is no pass.
    # The latest pass is the one that counts. A round after it is `open N` while it's open; if it fails, the Author
    # decides, with the pass named as one option, so the line never takes the earlier candidate by itself (Q267).
    main, passed = None, 0
    for n, result in sorted(judged.items(), reverse=True):
        if result and result["result"] == "pass" and n in answered:
            main = main or Main(Path(args.repo))
            if passes_again(folder, n, main, handoff):
                passed = n
                break
    used = max(answered | set(judged), default=0)
    latest = max(brief_rounds(folder), default=0)
    if passed and used > passed and used in judged:
        print(f"decide (round {passed} passed)")
    elif passed and max(used, latest) > passed:
        print(f"open {max(used, latest)}")
    elif passed:
        print(f"passed {passed}")
    elif used >= ROUNDS:
        print("decide")
    elif used == 0:
        print(f"open {latest}" if latest else "1")
    elif used in answered and used not in judged:
        print(f"open {used}")
    elif latest > used:
        print(f"open {latest}")
    else:
        print(str(used + 1))
    return 0


# --------------------------------------------------------------------------------------------------
def report(out: list[str]) -> int:
    for line in out:
        print(line)
    print(
        f"line: {len(out)} finding{'s' if len(out) != 1 else ''}"
        if out
        else "line: pass"
    )
    return 1 if out else 0


def parse(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="The studio line's checks (spec 017, contracts/studio-line.md)."
    )
    sub = parser.add_subparsers(dest="command", required=True)
    repo_help = (
        "the repository whose refs/heads/main gives the policy and the arrival check"
    )
    b = sub.add_parser("brief", help="check a brief")
    b.add_argument("file")
    b.add_argument("--repo", default=".", help=repo_help)
    b.add_argument("--handoff", default=HANDOFF)
    c = sub.add_parser(
        "candidate",
        help="check a candidate, then run main's arrival check on a scratch copy",
    )
    c.add_argument("dir")
    c.add_argument("--brief", required=True)
    c.add_argument("--repo", default=".", help=repo_help)
    c.add_argument("--handoff", default=HANDOFF)
    c.add_argument(
        "--record",
        action="store_true",
        help="write the round's result beside the brief, once",
    )
    r = sub.add_parser("round", help="the asset's next step")
    r.add_argument("asset")
    r.add_argument("--briefs", default=BRIEFS)
    r.add_argument("--handoff", default=HANDOFF)
    r.add_argument("--repo", default=".", help=repo_help)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    try:
        args = parse(sys.argv[1:] if argv is None else argv)
    except SystemExit as exc:
        if exc.code:
            print("line: can't run: the arguments don't parse")
            return 2
        return 0
    try:
        return {"brief": cmd_brief, "candidate": cmd_candidate, "round": cmd_round}[
            args.command
        ](args)
    except CantRun as exc:
        print(f"line: can't run: {exc}")
        return 2
    except Exception as exc:  # noqa: BLE001 (a crash must read as can't run, exit 2, never as a pass)
        print(f"line: can't run: the check itself failed ({exc.__class__.__name__})")
        return 2


if __name__ == "__main__":
    sys.exit(main())
