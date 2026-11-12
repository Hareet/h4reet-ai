#!/usr/bin/env python3
"""The studio line's checks (spec 017 User Story 4, FR-026 to FR-029; contracts/studio-line.md; research R-11).

    python3 -I -B scripts/studio/line.py brief FILE --caps <main's caps.json> --tools <main's studio-tools.json>
    python3 -I -B scripts/studio/line.py candidate DIR --brief FILE --tools <main's studio-tools.json> [--repo DIR] [--record]
    python3 -I -B scripts/studio/line.py round ASSET [--briefs DIR]

Standard library only. A repo agent writes a brief, the studio agent answers with a candidate in the handoff folder,
and these checks judge both; three rounds at most.

- brief: data-model.md's shape, every field present and no other; the round 1 to 3; each limit at or under main's
  caps.json for the kind; every tool on the list with `outputs_ship: true`, and none named Qwen-Image or FLUX [dev],
  whatever the list says. The file sits at <briefs>/<asset>/<round>.json, its round the folder's highest plus one;
  round 1 holds no findings, and a later round holds the round before's recorded findings, verbatim, after its
  recorded failure.
- candidate: candidate.json's shape, for the brief's asset and round; its files in the folder (regular files, never
  links); its tools in the brief's and on the list, at the list's version; the record's directory under assets/ (but
  assets/policy/); every model and tool a record step names in the brief's tools and on the list, and any step naming
  Qwen-Image or FLUX [dev] refused by name. Each GLB's JSON chunk gives its triangles (an indexed primitive's index
  count, else its positions, over 3; strips and fans count less 2), its skins' joints' node names (a required bone
  matches a name or a `<prefix>:<name>`, as Mixamo's `mixamorig:` does), its animations' names, and each embedded
  image's pixel size from its PNG or JPEG header; the texture bytes are the arrival check's own measure, width times
  height times 4, times 4/3 for mipmaps. Every file's bytes count against `bytes`. `skeleton` is checked for shape
  only: a GLB doesn't say which rig it follows.
  Then main's tools/gates/arrival_check.py, read from refs/heads/main (never `main:`, which a tag named main would
  answer) with replace objects off, runs from a temporary file as `python3 -I -B` on a scratch repository: its own
  refs/heads/main holds main's assets/policy/ and docs/data-flow-disclosure.md, made with plumbing only so no hook
  runs, and its work tree holds the candidate under the record's directory. A finding from either fails the round.
  With --record, the round's result goes beside the brief, <briefs>/<asset>/<round>.result.json, once.
- round: what the asset's next step is: `1` (no brief yet), `open N` (round N's brief, no result yet), `N+1` (round
  N failed), `passed N`, or `decide` (round 3 failed: no brief is written, and the asset goes on the decision page).

Output: one line per finding, `<check>: <value> (limit: <limit>)`, then a summary. Exit 0: pass. 1: findings. 2:
can't run (a policy file or the brief unreadable or invalid, the candidate folder missing, git failing, the main
branch without the arrival check, or the arrival check unable to check).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

MAIN = "refs/heads/main"
ARRIVAL = "tools/gates/arrival_check.py"
MAIN_COPIES = ("assets/policy", "docs/data-flow-disclosure.md")
BRIEFS = "/srv/studio/briefs"
ROUNDS = 3
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


def read_json(path: Path, what: str) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise CantRun(f"{what} ({clean(str(path))}) doesn't exist") from None
    except (OSError, UnicodeDecodeError, ValueError, RecursionError):
        raise CantRun(f"{what} ({clean(str(path))}) doesn't read as JSON") from None


# --------------------------------------------------------------------------------------------------
# Policy: main's caps.json and the tools list (assets/policy/studio-tools.json, the Author's P-7)
# --------------------------------------------------------------------------------------------------
def load_caps(path: Path) -> dict[str, dict]:
    doc = read_json(path, "caps.json")
    if not isinstance(doc, dict) or not isinstance(doc.get("per_asset"), dict):
        raise CantRun("caps.json has no per_asset object")
    per = doc["per_asset"]
    if not all(isinstance(v, dict) for v in per.values()):
        raise CantRun("caps.json's per_asset holds a kind that isn't an object")
    return per


def load_tools(path: Path) -> dict[str, dict]:
    doc = read_json(path, "the tools list")
    if (
        not isinstance(doc, dict)
        or set(doc) != {"schema", "tools"}
        or doc["schema"] != 1
    ):
        raise CantRun(
            "the tools list isn't schema 1 with a tools list and nothing else"
        )
    tools = doc["tools"]
    if not isinstance(tools, list):
        raise CantRun("the tools list's tools isn't a list")
    found: dict[str, dict] = {}
    for i, entry in enumerate(tools):
        where = f"the tools list's tools[{i}]"
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


def round_numbers(folder: Path, but: str | None = None) -> list[int]:
    if not folder.is_dir():
        return []
    return sorted(
        int(m[1])
        for p in folder.iterdir()
        if (m := ROUND_FILE.fullmatch(p.name)) and p.name != but
    )


def folder_findings(path: Path, doc: dict) -> list[str]:
    """The brief's place: <briefs>/<asset>/<round>.json, the folder's highest round plus one, after its failure."""
    m = ROUND_FILE.fullmatch(path.name)
    if not m:
        return [finding("brief path", path.name, "<briefs>/<asset>/<round>.json")]
    out = []
    n, asset, findings = doc["round"], doc["asset"], doc["findings"]
    if int(m[1]) != n:
        out.append(finding("round", n, f"the file's name, {int(m[1])}"))
    if path.parent.name != asset:
        out.append(finding("asset", asset, f"the folder's name, {path.parent.name}"))
    highest = max(round_numbers(path.parent, but=path.name), default=0)
    if n != highest + 1:
        out.append(
            finding("round", n, f"the folder's highest round plus one, {highest + 1}")
        )
    elif n == 1 and findings:
        out.append(finding("findings", f"{len(findings)} lines", "none in round 1"))
    elif n > 1:
        before = read_result(path.parent, n - 1)
        if before is None:
            out.append(
                finding(
                    "round",
                    n,
                    f"after round {n - 1}'s recorded failure; it has no result",
                )
            )
        elif before["result"] != "fail":
            out.append(finding("round", n, f"after round {n - 1}'s failure; it passed"))
        elif findings != before["findings"]:
            out.append(
                finding(
                    "findings",
                    f"not round {n - 1}'s",
                    f"round {n - 1}'s findings, verbatim",
                )
            )
    return out


def cmd_brief(args: argparse.Namespace) -> int:
    caps = load_caps(Path(args.caps))
    tools = load_tools(Path(args.tools))
    path = Path(args.file)
    if not path.is_file():
        raise CantRun(f"the brief ({clean(str(path))}) isn't a file")
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, ValueError, RecursionError):
        return report(
            [finding("brief", "doesn't parse as JSON", "data-model.md's Brief")]
        )
    out = brief_shape(doc)
    if isinstance(doc, dict):
        kind = doc.get("kind")
        cap = caps.get(kind) if isinstance(kind, str) else None
        if isinstance(kind, str) and kind and cap is None:
            out.append(
                finding(
                    "kind",
                    kind,
                    f"a kind in caps.json's per_asset: {', '.join(sorted(caps))}",
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
                            f"caps.json per_asset.{kind}.{key}, {ceiling}",
                        )
                    )
        listed = doc.get("tools")
        if isinstance(listed, list):
            for name in listed:
                if isinstance(name, str) and (problem := tool_problem(name, tools)):
                    out.append(tool_line("tools", name, problem))
        if not any(
            line.startswith(("round:", "asset:", "findings:", "brief:")) for line in out
        ) and not any(k not in doc for k in ("asset", "round", "findings")):
            out += folder_findings(path, doc)
    return report(out)


# --------------------------------------------------------------------------------------------------
# GLBs and images
# --------------------------------------------------------------------------------------------------
def image_size(data: bytes) -> tuple[int, int] | None:
    """(width, height) from a PNG's IHDR or a JPEG's SOF segment, or None."""
    if data[:8] == PNG_SIG and len(data) >= 24 and data[12:16] == b"IHDR":
        width, height = struct.unpack(">II", data[16:24])
        return width, height
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
    accessors = gltf.get("accessors") if isinstance(gltf.get("accessors"), list) else []

    def count(index: object) -> int:
        if (
            is_int(index)
            and 0 <= index < len(accessors)
            and isinstance(accessors[index], dict)
        ):
            value = accessors[index].get("count", 0)
            return value if is_int(value) and value > 0 else 0
        return 0

    triangles = 0
    for mesh in listed(gltf, "meshes"):
        prims = mesh.get("primitives")
        for prim in prims if isinstance(prims, list) else []:
            if not isinstance(prim, dict) or not isinstance(
                prim.get("attributes"), dict
            ):
                continue
            k = (
                count(prim["indices"])
                if "indices" in prim
                else count(prim["attributes"].get("POSITION"))
            )
            mode = prim.get("mode", 4)
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
    return {"triangles": triangles, "bones": bones, "clips": clips, "images": images}


def has_bone(required: str, bones: set[str]) -> bool:
    return any(b == required or b.endswith(":" + required) for b in bones)


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
            refused = [
                (w, s) for w, s in step_strings(step, where) if refused_by_name(s)
            ]
            for w, s in refused:
                out.append(f"{w}: {clean(s)} refused by name (limit: {REFUSED})")
            if not isinstance(step, dict):
                continue
            for key in ("models", "tools"):
                items = step.get(key)
                for k, item in enumerate(items if isinstance(items, list) else []):
                    name = item.get("name") if isinstance(item, dict) else None
                    here = f"{where}.{key}[{k}].name"
                    if not isinstance(name, str) or refused_by_name(name):
                        if not isinstance(name, str):
                            out.append(finding(here, name, "a name on the tools list"))
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
                        "an embedded PNG or JPEG",
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
    copy = (
        files
        + [RECORDS]
        + (
            [NOTICE]
            if (folder / NOTICE).is_file() and not (folder / NOTICE).is_symlink()
            else []
        )
    )
    return out, copy, directory if present else None


# --------------------------------------------------------------------------------------------------
# Main's arrival check, on a scratch repository
# --------------------------------------------------------------------------------------------------
def source_env() -> dict[str, str]:
    env = {
        k: v
        for k, v in os.environ.items()
        if k
        not in (
            "GIT_DIR",
            "GIT_WORK_TREE",
            "GIT_INDEX_FILE",
            "GIT_OBJECT_DIRECTORY",
            "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        )
    }
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


def main_snapshot(repo: Path) -> tuple[str, bytes, dict[str, bytes]]:
    """refs/heads/main's commit, its arrival check, and its policy and disclosure files, all from that one commit."""
    env = source_env()
    sha = (
        git(
            repo,
            ["rev-parse", "--verify", "--quiet", f"{MAIN}^{{commit}}"],
            env,
            f"reading {MAIN}",
        )
        .decode()
        .strip()
    )
    try:
        arrival = git(repo, ["cat-file", "blob", f"{sha}:{ARRIVAL}"], env, "")
    except CantRun:
        raise CantRun(f"the main branch ({MAIN}) has no {ARRIVAL}") from None
    listing = git(
        repo,
        ["ls-tree", "-r", "-z", "--full-tree", sha, "--", *MAIN_COPIES],
        env,
        "listing main's policy",
    )
    copies = {}
    for item in listing.split(b"\0"):
        if not item:
            continue
        meta, _, rel = item.partition(b"\t")
        mode, kind, oid = meta.split()
        if kind == b"blob" and mode in (b"100644", b"100755"):
            copies[rel.decode()] = git(
                repo, ["cat-file", "blob", oid.decode()], env, "reading main's policy"
            )
    return sha, arrival, copies


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
        commit = (
            git(
                top,
                ["commit-tree", "-m", "main's policy", tree],
                env,
                "in the scratch repository",
            )
            .decode()
            .strip()
        )
        git(top, ["update-ref", MAIN, commit], env, "in the scratch repository")
    git(top, ["symbolic-ref", "HEAD", MAIN], env, "in the scratch repository")
    dest = top / directory
    dest.mkdir(parents=True, exist_ok=True)
    paths = []
    for name in names:
        (dest / name).write_bytes((folder / name).read_bytes())
        paths.append(dest / name)
    return paths


def run_arrival(
    repo: Path, folder: Path, names: list[str], directory: str
) -> tuple[int, list[str], str]:
    """Main's arrival check on a scratch copy: its exit code, its output lines, and main's commit."""
    sha, arrival, copies = main_snapshot(repo)
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
        return code, done.stdout.splitlines(), sha
    finally:
        shutil.rmtree(work, ignore_errors=True)


def cmd_candidate(args: argparse.Namespace) -> int:
    folder = Path(args.dir)
    if not folder.is_dir():
        raise CantRun(f"the candidate folder ({clean(str(folder))}) isn't a folder")
    tools = load_tools(Path(args.tools))
    brief_path = Path(args.brief)
    if not brief_path.is_file():
        raise CantRun(f"the brief ({clean(str(brief_path))}) isn't a file")
    brief = read_json(brief_path, "the brief")
    if brief_shape(brief):
        raise CantRun("the brief isn't valid: line.py brief names why")
    assert isinstance(brief, dict)
    result_path = brief_path.parent / f"{brief['round']}.result.json"
    if args.record:
        if (
            brief_path.name != f"{brief['round']}.json"
            or brief_path.parent.name != brief["asset"]
        ):
            raise CantRun("--record needs the brief at <briefs>/<asset>/<round>.json")
        if result_path.exists():
            raise CantRun(
                f"round {brief['round']} already has a result: a round is judged once"
            )
    out, names, directory = candidate_findings(folder, brief, tools)
    for line in out:
        print(line)
    code, arrival = (1 if out else 0), []
    if directory is None:
        print(
            "arrival-check: not run, since the candidate's files or its record's directory are missing"
        )
    else:
        status, output, sha = run_arrival(Path(args.repo), folder, names, directory)
        print(
            f"arrival-check: main's copy, at {sha[:12]}, on a scratch copy under {directory}/"
        )
        for line in output:
            print(line)
        arrival = [line for line in output if ARRIVAL_FINDING.match(line)]
        if status == 2:
            raise CantRun("main's arrival check couldn't check (its reason is above)")
        if status == 1:
            code = 1
    total = len(out) + len(arrival)
    if args.record:
        result = {
            "schema": 1,
            "asset": brief["asset"],
            "round": brief["round"],
            "result": "fail" if code else "pass",
            "findings": out + arrival,
        }
        temp = result_path.with_name(result_path.name + ".tmp")
        temp.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        os.replace(temp, result_path)
    if code:
        print(
            f"line: {total} finding{'s' if total != 1 else ''}; round {brief['round']} fails"
        )
    else:
        print(f"line: pass; round {brief['round']}")
    return code


# --------------------------------------------------------------------------------------------------
# Rounds
# --------------------------------------------------------------------------------------------------
def cmd_round(args: argparse.Namespace) -> int:
    asset = args.asset
    if not ASSET_RE.fullmatch(asset):
        raise CantRun("the asset isn't an ID: a-z, 0-9, and hyphens, up to 40")
    folder = Path(args.briefs) / asset
    numbers = round_numbers(folder)
    if not numbers:
        print("1")
        return 0
    if numbers != list(range(1, len(numbers) + 1)) or len(numbers) > ROUNDS:
        raise CantRun(f"the asset's briefs aren't rounds 1 to {ROUNDS} in order")
    last = numbers[-1]
    for n in numbers[:-1]:
        before = read_result(folder, n)
        if before is None or before["result"] != "fail":
            raise CantRun(
                f"round {n + 1} has a brief, but round {n} has no recorded failure"
            )
    result = read_result(folder, last)
    if result is None:
        print(f"open {last}")
    elif result["result"] == "pass":
        print(f"passed {last}")
    else:
        print("decide" if last >= ROUNDS else str(last + 1))
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
    b = sub.add_parser("brief", help="check a brief")
    b.add_argument("file")
    b.add_argument("--caps", required=True, help="main's assets/policy/caps.json")
    b.add_argument(
        "--tools", required=True, help="main's assets/policy/studio-tools.json"
    )
    c = sub.add_parser(
        "candidate",
        help="check a candidate, then run main's arrival check on a scratch copy",
    )
    c.add_argument("dir")
    c.add_argument("--brief", required=True)
    c.add_argument(
        "--tools", required=True, help="main's assets/policy/studio-tools.json"
    )
    c.add_argument(
        "--repo",
        default=".",
        help="the repository whose refs/heads/main gives the arrival check",
    )
    c.add_argument(
        "--record",
        action="store_true",
        help="write the round's result beside the brief",
    )
    r = sub.add_parser("round", help="the asset's next step")
    r.add_argument("asset")
    r.add_argument("--briefs", default=BRIEFS)
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
