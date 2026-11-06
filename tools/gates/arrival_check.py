#!/usr/bin/env python3
"""The arrival check (spec 003 FR-001, FR-002, FR-004, FR-006 to FR-020; plan §3; contracts/arrival-check.md).

    python3 -I -B -X pycache_prefix=/dev/null tools/gates/arrival_check.py [--repo DIR] --staged
    python3 -I -B -X pycache_prefix=/dev/null tools/gates/arrival_check.py [--repo DIR] --range refs/heads/main..HEAD
    python3 -I -B -X pycache_prefix=/dev/null tools/gates/arrival_check.py [--repo DIR] --history
    python3 -I -B -X pycache_prefix=/dev/null tools/gates/arrival_check.py [--repo DIR] PATH...

Every file the studio makes passes this before it enters any commit: the pre-commit hook runs it over the index, make
check's `arrival` and the Author's gate over every commit since main, and make publish-check over the whole history.
Standard library only. Human-only: the hook, make check, and the gate each run the main working tree's copy.

- Where a file may be (rules A): images, videos, and models only under the asset roots, assets/ (but assets/policy/)
  and docs/research/images/, found by extension and by their leading bytes; model weights nowhere; in an asset
  directory only PNG, JPEG, WebP, GLB, records.json, and LICENSE.md; camera metadata (EXIF, XMP, a GPS directory) in
  no binary file anywhere, but the mark's own packet in a file the M rules admit.
- What a file holds (rules M): each admitted format parsed down to its chunks, and only research R-03's allowlist and
  one mark admitted: the XMP packet holding only the IPTC digital source type (KHR_xmp_json_ld's, in a GLB); no name
  or uri in a GLB that holds a file name or a path; no byte a container doesn't account for.
- Text (rules B): the parts of a file that hold text, never compressed pixel data, searched for a prompt or workflow
  record, a model file's name, and a local path. A finding names the byte offset, never the bytes.
- The record, the notice, the licenses, the approvals, the format and the caps, the history, and the caption (rules R,
  N, L, P, F, H, C), against the directory's records.json and LICENSE.md, and the policy and the caps read from the
  main branch as the gate reads it: `GIT_NO_REPLACE_OBJECTS=1 git cat-file blob refs/heads/main:assets/policy/<file>`,
  never `main:` (a tag named main would answer first), never a branch, never a checked-out copy (research R-05).

Spec 004's amendments (its contracts/intake-amendments.md §7; AMENDMENTS below names them):
- C1, on M5: the mark follows the record. Its term is trainedAlgorithmicMedia when every step of the file's record is
  by a model, compositeWithTrainedAlgorithmicMedia when model and hand steps mix, and MARK_HUMAN when every step is by
  hand; under assets/twin/ and docs/research/images/, trainedAlgorithmicMedia alone, whatever the steps say. P1 asks
  no more than spec 003's breadth: a hand-made or composite file that isn't a room file, the twin's, a likeness, or
  from a photo needs no approval, and gets a WARN line, which fails nothing: it's up to the contributor to check for
  likeness (the Author's answer of 2026-10-30).
- C2, on R1: a source may be a `design`, its ID held to the opaque-ID rule.
- C4, on P2: a room file's room confirmations, window_view_recreated, screens_plain_live_face (once
  screens_plain_glow), and artwork_original_or_absent, each read true or "not_applicable".
- C5, on P1: a room file whose record says likeness: false may have confirms.likeness_accepted read "not_applicable".
- C6, on F3: the first visit counts every file under assets/room/ at gzip level 9, and phase 3's budget applies once
  that folder holds one.
- C7, on F2: a room file against main's per_asset.room: its gzip-9 size, a GLB's triangles, and, on a small prop, each
  texture's width and height. A room file is refused while the block is absent, and a block holding other keys, or a
  key of the wrong type, can't be checked (exit 2), named by its key, never its value.
A room file is one whose record's kind is room, or any file under assets/room/, whatever its record says.

The modes: --staged checks the index's added and changed files, and the directories they touch. --range A..B checks
each commit in it: the files it added or changed, as it had them, and their directories; for a merge, what it holds
that differs from every parent, so a conflict's resolution is checked; then B's whole tree, so a deletion is judged
by the tree it leaves. --history checks every commit reachable from any ref. PATH... checks the named files as they
are on disk. Rule A9, a branch changing assets/policy/, applies under --range, and under --staged when the current
branch isn't main: the Author's own policy commits on main are expected.

Output: one line per finding, `<rule> <path>[ @<commit>]: <reason>`, then the size table, the totals, and a summary.
Exit 0: nothing refused. 1: at least one finding. 2: it can't check (a range that doesn't resolve, a path outside the
repository, git failing, or a studio file that needs the policy while the main branch has none or it doesn't parse).
A run that meets no studio file needs no policy. A warning, `WARN <path>[ @<commit>]: <reason>`, follows the findings,
and no exit code counts it (spec 004, Amendment C1). It names only a file the changes being checked add or change (the
staged files, each walked commit's, or the named paths); the last pass over a tip's whole tree records none, so a file
main already holds isn't named again at every later gate.
"""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import hashlib
import json
import os
import re
import struct
import subprocess
import sys
import unicodedata
import zlib
from dataclasses import dataclass, field
from pathlib import Path
from xml.etree import ElementTree as ET

# --------------------------------------------------------------------------------------------------
# Where files may be, and what they may be (contracts/arrival-check.md §2; research R-01, R-02)
# --------------------------------------------------------------------------------------------------
ROOTS = ("assets/", "docs/research/images/")
ROOT_TOPS = ("assets", "docs/research/images")
POLICY = "assets/policy/"
POLICY_FILES = ("licenses.json", "approvals.json", "caps.json")
PUBLISHED = "docs/research/images/"
ROOT_FILES = frozenset(
    {"assets/README.md", "assets/CREDITS.md", "docs/research/images/CREDITS.md"}
)
RECORDS = "records.json"
NOTICE = "LICENSE.md"
DISCLOSURE = "docs/data-flow-disclosure.md"
MEDIA_LICENSE = "all-rights-reserved-2026"
MAIN = "refs/heads/main"
ROOM = "assets/room/"
# Only the model's mark here, whatever a record's steps say (spec 004, Amendment C1).
MODEL_ONLY = ("assets/twin/", PUBLISHED)

# The spec 004 amendments this check carries (spec 004, FR-077). evals/test_room_order.py reads this tuple from main's
# copy with ast, and fails make test while a file sits under assets/room/ and the tuple lacks 004-C1 and 004-C2.
AMENDMENTS = ("004-C1", "004-C2", "004-C4", "004-C5", "004-C6", "004-C7")

ADMITTED = {
    ".png": "png",
    ".jpg": "jpeg",
    ".jpeg": "jpeg",
    ".webp": "webp",
    ".glb": "glb",
}
IMAGE_EXT = frozenset(
    {
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".gif",
        ".tif",
        ".tiff",
        ".dng",
        ".heic",
        ".heif",
        ".avif",
    }
)
VIDEO_EXT = frozenset({".mp4", ".mov", ".m4v"})
MODEL_EXT = frozenset({".glb", ".gltf", ".ktx2"})
WEIGHT_EXT = frozenset({".safetensors", ".ckpt", ".pt", ".pth", ".gguf", ".onnx"})
BIN_WEIGHTS = 1_000_000  # a .bin over 1 MB counts as weights (FR-001)
DESCRIBE = {
    "png": "a PNG image",
    "jpeg": "a JPEG image",
    "webp": "a WebP image",
    "gif": "a GIF image",
    "tiff": "a TIFF or DNG image",
    "isobmff": "an ISO BMFF file (HEIC, HEIF, AVIF, MP4, or MOV)",
    "glb": "a binary glTF model",
    "ktx2": "a KTX2 texture",
    "gguf": "GGUF model weights",
    "safetensors": "safetensors model weights",
}
BY_EXTENSION = {
    **{ext: "an image" for ext in IMAGE_EXT},
    **{ext: "a video" for ext in VIDEO_EXT},
    **{ext: "a model" for ext in MODEL_EXT},
}

# The mark (research R-03, FR-034): an XMP packet holding exactly this property, and nothing else. Its value is one of
# three terms of IPTC's digital source type, the one the file's record calls for (spec 004, Amendment C1).
X_NS = "adobe:ns:meta/"
RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
MARK_NS = "http://iptc.org/std/Iptc4xmpExt/2008-02-29/"
SOURCE_TYPES = "http://cv.iptc.org/newscodes/digitalsourcetype/"
MARK_MODEL = "trainedAlgorithmicMedia"
MARK_COMPOSITE = "compositeWithTrainedAlgorithmicMedia"
# Media a person made with digital tools: IPTC's digitalCreation, "Media created by a human using non-generative
# tools", which replaced digitalArt on 2024-09-17 (cv.iptc.org/newscodes/digitalsourcetype/; spec 004, tasks.md T031,
# settled on 2026-10-30).
MARK_HUMAN = "digitalCreation"
MARK_TERMS = (MARK_MODEL, MARK_COMPOSITE, MARK_HUMAN)
MARK_VALUE = SOURCE_TYPES + MARK_MODEL
NOT_A_TERM = "the mark's digital source type isn't one of the three terms a record's steps call for (spec 004, C1)"


def mark_json(term: str) -> dict:
    """The mark as KHR_xmp_json_ld's one packet, in a GLB."""
    return {
        "@context": {"Iptc4xmpExt": MARK_NS},
        "Iptc4xmpExt:DigitalSourceType": SOURCE_TYPES + term,
    }


MARK_JSON = mark_json(MARK_MODEL)
XPACKET_BEGIN = re.compile(
    rb"\A\s*<\?xpacket begin=([\"'])(?:\xef\xbb\xbf)?\1 id=([\"'])W5M0MpCehiHzreSzNTczkc9d\2\?>"
)
XPACKET_END = re.compile(rb"<\?xpacket end=([\"'])[rw]\1\?>\s*\Z")

# Camera metadata (rule A4), searched for in every binary file.
EXIF_HEADER = b"Exif\x00\x00"
XMP_MARKERS = (b"<x:xmpmeta", b"http://ns.adobe.com/xap/1.0/")
GPS_TAG = 0x8825

# The B rules (FR-007), over the parts of a file that hold text.
B_RULES = (
    (
        "B1",
        re.compile(rb'"(?:prompt|workflow)"\s*:'),
        "a prompt or workflow record (ComfyUI's keys)",
    ),
    (
        "B2",
        re.compile(
            rb"(?i)(?<![a-z0-9])[a-z0-9_.\-]*[a-z0-9_\-]\.(?:safetensors|ckpt|pth?|gguf|onnx|bin)(?![a-z0-9])"
        ),
        "a model file's name",
    ),
    (
        "B3",
        re.compile(
            rb"/home/|/Users/|/mnt/|/tmp/|(?<![A-Za-z])[A-Za-z]:\\|\\\\wsl|(?i:file://)"
        ),
        "a local path",
    ),
)
CLASS_TYPE, INPUTS = re.compile(rb'"class_type"'), re.compile(rb'"inputs"')

# M8: a name that looks like a file name or a path. Blender's side suffixes, .L and .R, aren't extensions.
NAME_EXTENSION = re.compile(r"\.(?![LRlr](?![A-Za-z]))[A-Za-z]{1,5}(?![A-Za-z0-9])")
# A camera's or a phone's file stem: IMG_, PXL_, MVIMG_, DSC and DSCN, Screenshot, WhatsApp's IMG-YYYYMMDD-WA, and
# Samsung's YYYYMMDD_HHMMSS.
CAMERA_STEM = re.compile(
    r"(?i)(?<![a-z0-9])(?:img_|img-\d{8}-wa|pxl_|mvimg_|dscn?(?=[_\d])|screenshot)"
    r"|(?<!\d)(?:19|20)\d{6}_\d{6}(?!\d)"
)

# R5: what a record field may not hold.
R5_EXTENSION = re.compile(
    r"(?<=[A-Za-z0-9_\-])\.[A-Za-z][A-Za-z0-9]{0,4}(?![A-Za-z0-9])"
)
R5_COORDINATE = re.compile(r"-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}|\d{1,3}\s*°")
R5_TIME = re.compile(r"\d{1,2}:\d{2}")
ID_RE = re.compile(r"[A-Za-z0-9-]{3,40}")
HEX64 = re.compile(r"[0-9a-f]{64}")
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
REPOSITORY = re.compile(
    r"https?://[^\s\\]+|[A-Za-z0-9][A-Za-z0-9._\-]*/[A-Za-z0-9][A-Za-z0-9._\-]*"
)

# The LICENSE.md every asset directory carries (contracts/asset-record.md §3); the Author fills the copyright line.
NOTICE_RE = re.compile(
    r"\ACopyright \(c\) (?P<year><YEAR>|\d{4}) (?P<holder><HOLDER>|[^\n<>]+?)\. All rights reserved\.\n\n"
    r"The files in this directory are not covered by this repository's MIT license\. You are welcome to view them "
    r"and to link to them\. Any other use needs the copyright holder's written permission\.\n\n"
    r"Each file's provenance is in records\.json, and in CREDITS\.md at the root of its tree\.\n\Z"
)
CAPTION = "Evaluation output; not used in the site's assets."


class CannotCheck(Exception):
    """Exit 2: the check can't run, or can't finish."""


class PolicyError(Exception):
    """The main branch's policy doesn't parse, or doesn't have the shape data-model.md §3 to §5 give it."""


def clean(text: str) -> str:
    """Control characters as ?, so nothing a file or a path holds can drive a terminal."""
    return "".join(ch if unicodedata.category(ch) != "Cc" else "?" for ch in text)


def ext_of(path: str) -> str:
    name = path.rsplit("/", 1)[-1]
    return name[name.rfind(".") :].lower() if "." in name else ""


def parent(path: str) -> str:
    return path.rsplit("/", 1)[0] if "/" in path else ""


def in_roots(path: str) -> bool:
    return path.startswith(ROOTS) and not path.startswith(POLICY)


def binary(data: bytes) -> bool:
    return b"\x00" in data[:8000]


def sniff(data: bytes) -> str | None:
    """A format from the leading bytes, as each format's own signature gives it."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if data[:4] in (b"II*\x00", b"MM\x00*"):
        return "tiff"
    if data[4:8] == b"ftyp":
        return "isobmff"
    if data[:4] == b"glTF":
        return "glb"
    if data[:12] == b"\xabKTX 20\xbb\r\n\x1a\n":
        return "ktx2"
    if data[:4] == b"GGUF":
        return "gguf"
    if len(data) >= 10:
        (size,) = struct.unpack("<Q", data[:8])
        if (
            2 <= size <= len(data) - 8
            and data[8:9] == b"{"
            and data[7 + size : 8 + size] in (b"}", b" ")
        ):
            return "safetensors"
    return None


# --------------------------------------------------------------------------------------------------
# git, and the trees a check reads: a commit's, the index's, or the disk's
# --------------------------------------------------------------------------------------------------
class Git:
    """git in one repository, with replace objects off, as the gate runs it."""

    def __init__(self, repo: Path, env: dict[str, str] | None = None) -> None:
        self.repo = repo
        base = os.environ if env is None else env
        self.env = {**base, "GIT_NO_REPLACE_OBJECTS": "1", "LC_ALL": "C"}
        self._batch: subprocess.Popen[bytes] | None = None

    def run(self, *args: str, ok: tuple[int, ...] = (0,)) -> bytes:
        try:
            done = subprocess.run(
                ["git", "-C", str(self.repo), *args],
                env=self.env,
                stdin=subprocess.DEVNULL,
                capture_output=True,
                check=False,
                timeout=600,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise CannotCheck(
                f"git {args[0]} couldn't run ({exc.__class__.__name__})"
            ) from None
        if done.returncode not in ok:
            raise CannotCheck(f"git {args[0]} failed (exit {done.returncode})")
        return done.stdout

    def try_run(self, *args: str) -> bytes | None:
        try:
            return self.run(*args)
        except CannotCheck:
            return None

    def blob(self, oid: str) -> bytes:
        if self._batch is None:
            self._batch = subprocess.Popen(
                ["git", "-C", str(self.repo), "cat-file", "--batch"],
                env=self.env,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
            )
        proc = self._batch
        assert proc.stdin is not None and proc.stdout is not None
        proc.stdin.write(oid.encode() + b"\n")
        proc.stdin.flush()
        header = proc.stdout.readline().split()
        if len(header) != 3 or header[1] != b"blob":
            raise CannotCheck(f"git can't read object {oid[:12]}")
        size = int(header[2])
        data = proc.stdout.read(size)
        proc.stdout.read(1)
        return data

    def close(self) -> None:
        if self._batch is not None:
            assert self._batch.stdin is not None
            self._batch.stdin.close()
            self._batch.wait()
            self._batch = None


@dataclass
class Item:
    mode: str
    oid: str | None = None


class Tree:
    """A tree of files as one commit, the index, or the disk holds them."""

    label: str | None = None

    def items(self) -> dict[str, Item]:
        raise NotImplementedError

    def read(self, path: str) -> bytes | None:
        raise NotImplementedError

    def listdir(self, directory: str) -> list[str]:
        prefix = directory + "/"
        return sorted(
            p
            for p in self.items()
            if p.startswith(prefix) and "/" not in p[len(prefix) :]
        )

    def under(self, prefix: str) -> list[str]:
        return sorted(p for p in self.items() if p.startswith(prefix))


class GitTree(Tree):
    def __init__(
        self, git: Git, rev: str, label: str | None, *, index: bool = False
    ) -> None:
        self.git, self.rev, self.label, self.index = git, rev, label, index
        self._items: dict[str, Item] | None = None

    def items(self) -> dict[str, Item]:
        if self._items is None:
            found: dict[str, Item] = {}
            if self.index:
                for record in self.git.run("ls-files", "-s", "-z").split(b"\0"):
                    if not record:
                        continue
                    meta, _, path = record.partition(b"\t")
                    mode, oid, stage = meta.split()
                    if stage == b"0":
                        found[path.decode("utf-8", "surrogateescape")] = Item(
                            mode.decode(), oid.decode()
                        )
            else:
                for record in self.git.run(
                    "ls-tree", "-r", "-z", "--full-tree", self.rev
                ).split(b"\0"):
                    if not record:
                        continue
                    meta, _, path = record.partition(b"\t")
                    mode, kind, oid = meta.split()
                    found[path.decode("utf-8", "surrogateescape")] = Item(
                        mode.decode(), oid.decode() if kind == b"blob" else None
                    )
            self._items = found
        return self._items

    def read(self, path: str) -> bytes | None:
        item = self.items().get(path)
        if item is None or item.oid is None:
            return None
        return self.git.blob(item.oid)


class DiskTree(Tree):
    """The work tree on disk: the asset roots, the disclosure document, the notes, and the files named."""

    def __init__(self, root: Path, named: list[str]) -> None:
        self.root, self.named = root, named
        self._items: dict[str, Item] | None = None

    def items(self) -> dict[str, Item]:
        if self._items is None:
            found: dict[str, Item] = {}
            for top in ROOT_TOPS:
                base = self.root / top
                for here, dirs, files in os.walk(base):
                    dirs[:] = [d for d in dirs if d != ".git"]
                    for name in files + [
                        d for d in dirs if (Path(here) / d).is_symlink()
                    ]:
                        full = Path(here) / name
                        rel = full.relative_to(self.root).as_posix()
                        found[rel] = Item("120000" if full.is_symlink() else "100644")
            research = self.root / "docs" / "research"
            extra = [DISCLOSURE, *self.named]
            if research.is_dir():
                extra += [
                    f"docs/research/{p.name}"
                    for p in research.iterdir()
                    if p.suffix == ".md"
                ]
            for rel in extra:
                full = self.root / rel
                if full.is_symlink() or full.is_file():
                    found[rel] = Item("120000" if full.is_symlink() else "100644")
            self._items = found
        return self._items

    def read(self, path: str) -> bytes | None:
        full = self.root / path
        if full.is_symlink() or not full.is_file():
            return None
        return full.read_bytes()


# --------------------------------------------------------------------------------------------------
# Findings and sizes
# --------------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class Finding:
    rule: str
    path: str
    reason: str
    commit: str | None = None

    def render(self) -> str:
        at = f" @{self.commit[:7]}" if self.commit else ""
        return clean(f"{self.rule} {self.path}{at}: {self.reason}")


@dataclass
class Size:
    path: str
    size: int
    gzip: int
    vertices: int | None = None
    triangles: int | None = None
    texture: int | None = None


@dataclass(frozen=True)
class Facts:
    """A file's mark, its gzip-9 size, its triangles, and its textures' sides: a GLB's embedded images, or an image's
    own (spec 004, Amendments C1 and C7)."""

    term: str | None
    gzip: int
    triangles: int | None
    sides: tuple[tuple[int, int], ...]

    @staticmethod
    def of(parsed: Parsed, kind: str, gzipped: int) -> Facts:
        sides = (
            tuple(parsed.images) if kind == "glb" else ((parsed.width, parsed.height),)
        )
        return Facts(parsed.term, gzipped, parsed.triangles, sides)


@dataclass
class Parsed:
    """What a container's parse found: problems by rule, the parts that hold text, and the mark's byte ranges."""

    problems: list[tuple[str, str]] = field(default_factory=list)
    texts: list[tuple[str, int, bytes]] = field(default_factory=list)
    marks: list[tuple[int, int]] = field(default_factory=list)
    width: int = 0
    height: int = 0
    vertices: int | None = None
    triangles: int | None = None
    texture: int | None = None
    # The mark's term, once it reads as one of MARK_TERMS (spec 004, Amendment C1), and each embedded image's width
    # and height, which a small prop's texture cap reads (Amendment C7).
    term: str | None = None
    images: list[tuple[int, int]] = field(default_factory=list)

    def bad(self, rule: str, reason: str) -> None:
        self.problems.append((rule, reason))


# --------------------------------------------------------------------------------------------------
# The mark's packet (M5)
# --------------------------------------------------------------------------------------------------
def mark_problems(packet: bytes) -> list[str]:
    """Why an XMP packet isn't the mark, or nothing: exactly Iptc4xmpExt:DigitalSourceType, set to one of
    MARK_TERMS, with no toolkit attribute, no other property, and nothing else in the packet."""
    return read_mark(packet)[0]


def read_mark(packet: bytes) -> tuple[list[str], str | None]:
    """mark_problems' reasons, and the mark's term when there are none."""
    body = packet
    begin = XPACKET_BEGIN.match(body)
    end = XPACKET_END.search(body)
    if bool(begin) != bool(end):
        return [
            "the mark's packet has one xpacket wrapper line without the other"
        ], None
    if begin and end:
        body = body[begin.end() : end.start()]
    if b"<!" in body or b"<?" in body:
        return [
            "the mark's packet holds a comment, a declaration, or a processing instruction"
        ], None
    try:
        root = ET.fromstring(body)
    except (ET.ParseError, ValueError):
        return ["the mark's packet isn't well-formed XML"], None

    def blank(text: str | None) -> bool:
        return text is None or not text.strip()

    if root.tag != f"{{{X_NS}}}xmpmeta":
        return ["the mark's packet doesn't start with x:xmpmeta"], None
    if root.attrib:
        return [
            "the mark's packet carries a toolkit or another attribute on x:xmpmeta"
        ], None
    if (
        len(root) != 1
        or not blank(root.text)
        or root[0].tag != f"{{{RDF_NS}}}RDF"
        or root[0].attrib
    ):
        return ["the mark's packet holds something besides one rdf:RDF"], None
    rdf = root[0]
    if (
        len(rdf) != 1
        or not blank(rdf.text)
        or not blank(rdf.tail)
        or rdf[0].tag != f"{{{RDF_NS}}}Description"
    ):
        return ["the mark's packet holds something besides one rdf:Description"], None
    desc = rdf[0]
    if not blank(desc.tail) or not blank(desc.text):
        return ["the mark's packet holds text outside the property"], None
    prop = f"{{{MARK_NS}}}DigitalSourceType"
    attrs = dict(desc.attrib)
    if attrs.pop(f"{{{RDF_NS}}}about", "") != "":
        return ["the mark's rdf:about isn't empty"], None
    if attrs and set(attrs) != {prop}:
        return ["the mark's packet holds a second property"], None
    if prop in attrs:
        if len(desc):
            return ["the mark's packet holds a second property"], None
        value = attrs[prop]
    else:
        if (
            len(desc) != 1
            or desc[0].tag != prop
            or len(desc[0])
            or not blank(desc[0].tail)
        ):
            return [
                "the mark's packet holds a property other than Iptc4xmpExt:DigitalSourceType"
            ], None
        child = desc[0]
        extra = {k: v for k, v in child.attrib.items() if k != f"{{{RDF_NS}}}resource"}
        if extra:
            return ["the mark's property carries an attribute"], None
        value = (child.text or "").strip() or child.attrib.get(
            f"{{{RDF_NS}}}resource", ""
        )
    term = value[len(SOURCE_TYPES) :] if value.startswith(SOURCE_TYPES) else ""
    if term not in MARK_TERMS:
        return [NOT_A_TERM], None
    return [], term


# --------------------------------------------------------------------------------------------------
# Camera metadata (A4)
# --------------------------------------------------------------------------------------------------
def tiff_tags(data: bytes, start: int) -> set[int] | None:
    """IFD0's tags of a TIFF header at `start`, or None when there's no readable one."""
    head = data[start : start + 8]
    if head[:4] == b"II*\x00":
        order = "<"
    elif head[:4] == b"MM\x00*":
        order = ">"
    else:
        return None
    (ifd,) = struct.unpack(order + "I", head[4:8])
    at = start + ifd
    if at + 2 > len(data):
        return None
    (count,) = struct.unpack(order + "H", data[at : at + 2])
    if count > 1000 or at + 2 + 12 * count > len(data):
        return None
    return {
        struct.unpack(order + "H", data[at + 2 + 12 * i : at + 4 + 12 * i])[0]
        for i in range(count)
    }


def camera_metadata(
    data: bytes, marks: list[tuple[int, int]] | None = None
) -> list[str]:
    """Where a binary file holds an EXIF header, an XMP packet, or a GPS directory, outside the mark's packets."""

    def outside(at: int) -> bool:
        return not any(lo <= at < hi for lo, hi in marks or ())

    found = []
    at = data.find(EXIF_HEADER)
    while at != -1:
        if outside(at):
            tags = tiff_tags(data, at + len(EXIF_HEADER)) or set()
            found.append(
                f"an EXIF header at byte {at}"
                + (", with a GPS directory" if GPS_TAG in tags else "")
            )
            break
        at = data.find(EXIF_HEADER, at + 1)
    if sniff(data) == "tiff":
        tags = tiff_tags(data, 0) or set()
        if GPS_TAG in tags:
            found.append("a GPS directory in its TIFF header")
        elif 0x8769 in tags:
            found.append("an EXIF directory in its TIFF header")
    for marker in XMP_MARKERS:
        at = data.find(marker)
        while at != -1 and not outside(at):
            at = data.find(marker, at + 1)
        if at != -1:
            found.append(f"an XMP packet at byte {at}")
            break
    return found


# --------------------------------------------------------------------------------------------------
# Text (the B rules) and ICC profiles (M7)
# --------------------------------------------------------------------------------------------------
def text_hits(text: bytes) -> list[tuple[str, int, str]]:
    """(rule, offset, what) for each B rule a piece of text breaks, the first match of each."""
    hits = []
    for rule, pattern, what in B_RULES:
        found = pattern.search(text)
        if found:
            hits.append((rule, found.start(), what))
    if not any(h[0] == "B1" for h in hits):
        first = CLASS_TYPE.search(text)
        if first and INPUTS.search(text):
            hits.append(
                ("B1", first.start(), "a workflow record (class_type and inputs)")
            )
    return hits


def icc_texts(profile: bytes) -> list[bytes]:
    """The text an ICC profile carries: every tag of type desc, text, or mluc (description, copyright, device)."""
    if len(profile) < 132:
        return []
    (count,) = struct.unpack(">I", profile[128:132])
    texts = []
    for i in range(min(count, 1000)):
        at = 132 + 12 * i
        if at + 12 > len(profile):
            break
        _, offset, size = struct.unpack(">4sII", profile[at : at + 12])
        tag = profile[offset : offset + size]
        kind = tag[:4]
        if kind == b"desc" and len(tag) >= 12:
            (n,) = struct.unpack(">I", tag[8:12])
            texts.append(tag[12 : 12 + n].rstrip(b"\0"))
            rest = tag[12 + n :]
            if len(rest) >= 8:
                (m,) = struct.unpack(">I", rest[4:8])
                texts.append(
                    rest[8 : 8 + 2 * m].decode("utf-16-be", "replace").encode()
                )
        elif kind == b"text":
            texts.append(tag[8:].rstrip(b"\0"))
        elif kind == b"mluc" and len(tag) >= 16:
            n, record = struct.unpack(">II", tag[8:16])
            for j in range(min(n, 100)):
                base = 16 + j * record
                if base + 12 > len(tag):
                    break
                length, start = struct.unpack(">II", tag[base + 4 : base + 12])
                texts.append(
                    tag[start : start + length].decode("utf-16-be", "replace").encode()
                )
    return texts


def check_icc(profile: bytes, out: Parsed) -> None:
    for text in icc_texts(profile):
        for rule, _, what in text_hits(text):
            out.bad("M7", f"its ICC profile's text holds {what} (rule {rule})")


def inflate(data: bytes, limit: int = 16 * 1024 * 1024) -> bytes | None:
    try:
        stream = zlib.decompressobj()
        out = stream.decompress(data, limit)
        if stream.unconsumed_tail:
            return None
        return out
    except zlib.error:
        return None


# --------------------------------------------------------------------------------------------------
# PNG (M1, research R-03's list)
# --------------------------------------------------------------------------------------------------
PNG_SIG = b"\x89PNG\r\n\x1a\n"
PNG_ADMITTED = frozenset(
    {
        b"IHDR",
        b"PLTE",
        b"IDAT",
        b"IEND",
        b"tRNS",
        b"gAMA",
        b"cHRM",
        b"sRGB",
        b"iCCP",
        b"pHYs",
        b"iTXt",
    }
)
XMP_KEYWORD = b"XML:com.adobe.xmp"


def chunk_name(raw: bytes) -> str:
    return (
        f"chunk {raw.decode('ascii')}"
        if re.fullmatch(rb"[A-Za-z]{4}", raw)
        else "a chunk of no readable type"
    )


def parse_png(data: bytes, out: Parsed) -> None:
    if not data.startswith(PNG_SIG):
        out.bad("M1", "it doesn't start with PNG's signature")
        return
    pos, ended, marks, first = 8, False, 0, True
    while pos < len(data):
        if pos + 12 > len(data):
            out.bad("M1", f"a truncated chunk at byte {pos}")
            return
        length, kind = struct.unpack(">I4s", data[pos : pos + 8])
        end = pos + 8 + length
        if length > 0x7FFFFFFF or end + 4 > len(data):
            out.bad("M1", f"a chunk at byte {pos} runs past the file")
            return
        body = data[pos + 8 : end]
        name = chunk_name(kind)
        if (
            zlib.crc32(kind + body) & 0xFFFFFFFF
            != struct.unpack(">I", data[end : end + 4])[0]
        ):
            out.bad("M1", f"{name} at byte {pos} fails its CRC")
        if first and kind != b"IHDR":
            out.bad("M1", "its first chunk isn't IHDR")
        first = False
        if kind == b"IHDR" and len(body) >= 8:
            out.width, out.height = struct.unpack(">II", body[:8])
        elif kind == b"iTXt":
            keyword, _, rest = body.partition(b"\0")
            if keyword != XMP_KEYWORD:
                out.bad("M1", f"an iTXt chunk at byte {pos} that isn't the mark")
            else:
                marks += 1
                if len(rest) < 2:
                    out.bad("M5", "the mark's iTXt chunk is truncated")
                else:
                    flag, rest = rest[0], rest[2:]
                    lang, sep1, rest = rest.partition(b"\0")
                    tkey, sep2, text = rest.partition(b"\0")
                    if flag or lang or tkey or not (sep1 and sep2):
                        out.bad(
                            "M5",
                            "the mark's iTXt chunk is compressed, or carries a language or a translated keyword",
                        )
                    start = end - len(text)
                    out.marks.append((start, end))
                    out.texts.append(("the mark's packet", start, text))
                    problems, term = read_mark(text)
                    for problem in problems:
                        out.bad("M5", problem)
                    out.term = term or out.term
        elif kind == b"iCCP":
            name_bytes, _, rest = body.partition(b"\0")
            out.texts.append(("the ICC profile's name", pos + 8, name_bytes))
            profile = inflate(rest[1:]) if rest[:1] == b"\0" else None
            if profile is None:
                out.bad("M1", "an iCCP profile that doesn't inflate")
            else:
                check_icc(profile, out)
        elif kind not in PNG_ADMITTED:
            out.bad("M1", f"{name} at byte {pos}, outside the allowlist")
        pos = end + 4
        if kind == b"IEND":
            ended = True
            break
    if not ended:
        out.bad("M1", "no IEND chunk")
    elif pos < len(data):
        out.bad("M9", f"{len(data) - pos} bytes after IEND")
    if marks > 1:
        out.bad("M1", "more than one iTXt mark")


# --------------------------------------------------------------------------------------------------
# JPEG (M2)
# --------------------------------------------------------------------------------------------------
SOF = frozenset(
    {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
)
XMP_APP1 = b"http://ns.adobe.com/xap/1.0/\x00"
MARKER_NAMES = {
    0xE1: "APP1",
    0xFE: "COM",
    0xED: "APP13 (IPTC)",
    0xEE: "APP14 (Adobe)",
    0xCC: "DAC",
    0xDC: "DNL",
}


def marker_name(marker: int) -> str:
    if marker in MARKER_NAMES:
        return MARKER_NAMES[marker]
    if 0xE0 <= marker <= 0xEF:
        return f"APP{marker - 0xE0}"
    return f"FF{marker:02X}"


def parse_jpeg(data: bytes, out: Parsed) -> None:
    if not data.startswith(b"\xff\xd8"):
        out.bad("M2", "it doesn't start with JPEG's SOI")
        return
    pos, eoi, icc, marks, scans = 2, None, {}, 0, 0
    while pos < len(data):
        if data[pos] != 0xFF:
            out.bad("M2", f"bytes between segments at byte {pos}")
            return
        while pos < len(data) and data[pos] == 0xFF:
            pos += 1
        if pos >= len(data):
            break
        marker, start = data[pos], pos - 1
        pos += 1
        if marker == 0xD9:
            eoi = pos
            break
        if marker == 0xD8 or 0xD0 <= marker <= 0xD7 or marker == 0x01:
            out.bad("M2", f"a stray {marker_name(marker)} marker at byte {start}")
            continue
        if pos + 2 > len(data):
            out.bad("M2", f"a truncated segment at byte {start}")
            return
        (length,) = struct.unpack(">H", data[pos : pos + 2])
        if length < 2 or pos + length > len(data):
            out.bad("M2", f"a segment at byte {start} runs past the file")
            return
        body_at = pos + 2
        body = data[body_at : pos + length]
        pos += length
        if marker in (0xDB, 0xC4, 0xDD):
            pass
        elif marker in SOF:
            if len(body) >= 5:
                out.height, out.width = struct.unpack(">HH", body[1:5])
        elif marker == 0xE0:
            if not body.startswith(b"JFIF\x00") or len(body) < 14:
                out.bad("M2", f"an APP0 segment at byte {start} that isn't JFIF")
            elif body[12] or body[13] or len(body) != 14:
                out.bad("M2", "an APP0 JFIF segment carrying a thumbnail")
        elif marker == 0xE1:
            if body.startswith(EXIF_HEADER):
                out.bad("M2", f"an EXIF APP1 segment at byte {start}")
            elif body.startswith(XMP_APP1):
                marks += 1
                text = body[len(XMP_APP1) :]
                text_at = body_at + len(XMP_APP1)
                # The segment's identifier, the XMP namespace A4 searches for, is part of the mark.
                out.marks.append((body_at, text_at + len(text)))
                out.texts.append(("the mark's packet", text_at, text))
                problems, term = read_mark(text)
                for problem in problems:
                    out.bad("M5", problem)
                out.term = term or out.term
            else:
                out.bad("M2", f"an APP1 segment at byte {start} that isn't the mark")
        elif marker == 0xE2 and body.startswith(b"ICC_PROFILE\x00") and len(body) >= 14:
            icc[body[12]] = body[14:]
        elif marker == 0xE2:
            out.bad("M2", f"an APP2 segment at byte {start} that isn't an ICC profile")
        elif marker == 0xDA:
            scans += 1
            # Entropy-coded data runs to the next marker that isn't a stuffed FF00 or a restart marker.
            while True:
                at = data.find(b"\xff", pos)
                if at == -1 or at + 1 >= len(data):
                    pos = len(data)
                    break
                following = data[at + 1]
                if following == 0x00 or 0xD0 <= following <= 0xD7:
                    pos = at + 2
                    continue
                if following == 0xFF:
                    pos = at + 1
                    continue
                pos = at
                break
        else:
            out.bad(
                "M2",
                f"a {marker_name(marker)} segment at byte {start}, outside the allowlist",
            )
    if eoi is None:
        out.bad("M2", "no EOI marker")
    elif eoi < len(data):
        out.bad("M9", f"{len(data) - eoi} bytes after EOI")
    if not scans:
        out.bad("M2", "no scan (SOS)")
    if marks > 1:
        out.bad("M2", "more than one XMP APP1 segment")
    if icc:
        check_icc(b"".join(icc[k] for k in sorted(icc)), out)


# --------------------------------------------------------------------------------------------------
# WebP (M3)
# --------------------------------------------------------------------------------------------------
WEBP_ADMITTED = frozenset({b"VP8 ", b"VP8L", b"VP8X", b"ALPH", b"ICCP", b"XMP "})


def fourcc_name(raw: bytes) -> str:
    return (
        f"chunk {raw.decode('ascii').strip()}"
        if re.fullmatch(rb"[A-Za-z0-9 ]{4}", raw)
        else "a chunk of no readable type"
    )


def parse_webp(data: bytes, out: Parsed) -> None:
    if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        out.bad("M3", "it isn't a RIFF WebP file")
        return
    (size,) = struct.unpack("<I", data[4:8])
    end = 8 + size
    if end > len(data):
        out.bad("M3", "its RIFF size runs past the file")
        return
    if end < len(data):
        out.bad("M9", f"{len(data) - end} bytes past the RIFF size")
    pos, chunks = 12, []
    while pos + 8 <= end:
        kind = data[pos : pos + 4]
        (length,) = struct.unpack("<I", data[pos + 4 : pos + 8])
        if pos + 8 + length > end:
            out.bad("M3", f"{fourcc_name(kind)} at byte {pos} runs past the RIFF size")
            return
        chunks.append((kind, pos, data[pos + 8 : pos + 8 + length]))
        pos += 8 + length + (length & 1)
    if pos != end:
        out.bad("M3", "bytes inside the RIFF size that no chunk accounts for")
    kinds = [k for k, _, _ in chunks]
    for kind, at, body in chunks:
        if kind not in WEBP_ADMITTED:
            out.bad("M3", f"{fourcc_name(kind)} at byte {at}, outside the allowlist")
        elif kind == b"XMP ":
            start = at + 8
            out.marks.append((start, start + len(body)))
            out.texts.append(("the mark's packet", start, body))
            problems, term = read_mark(body)
            for problem in problems:
                out.bad("M5", problem)
            out.term = term or out.term
        elif kind == b"ICCP":
            check_icc(body, out)
        elif kind == b"VP8 " and len(body) >= 10 and not out.width:
            w, h = struct.unpack("<HH", body[6:10])
            out.width, out.height = w & 0x3FFF, h & 0x3FFF
        elif kind == b"VP8L" and len(body) >= 5 and not out.width:
            (bits,) = struct.unpack("<I", body[1:5])
            out.width, out.height = (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    if kinds.count(b"XMP ") > 1:
        out.bad("M3", "more than one XMP chunk")
    if (kinds.count(b"VP8 ") + kinds.count(b"VP8L")) != 1:
        out.bad("M3", "not exactly one VP8 or VP8L bitstream")
    if b"VP8X" in kinds:
        if kinds[0] != b"VP8X":
            out.bad("M3", "VP8X isn't the first chunk")
        body = chunks[kinds.index(b"VP8X")][2]
        flags = body[0] if body else 0
        if flags & ~(0x20 | 0x10 | 0x04):
            out.bad(
                "M3",
                "a VP8X flag other than XMP, ICC, and alpha (EXIF, animation, or a reserved bit)",
            )
        if bool(flags & 0x04) != (b"XMP " in kinds) or bool(flags & 0x20) != (
            b"ICCP" in kinds
        ):
            out.bad("M3", "VP8X's XMP or ICC flag doesn't match the chunks")
        if len(body) >= 10:
            out.width = int.from_bytes(body[4:7], "little") + 1
            out.height = int.from_bytes(body[7:10], "little") + 1
    elif b"XMP " in kinds or b"ICCP" in kinds or b"ALPH" in kinds:
        out.bad("M3", "metadata chunks without a VP8X header")


# --------------------------------------------------------------------------------------------------
# GLB (M4, M5, M6, M8, M9): the glTF 2.0 schema's properties, by object
# --------------------------------------------------------------------------------------------------
ENUMS = {
    "type": {"SCALAR", "VEC2", "VEC3", "VEC4", "MAT2", "MAT3", "MAT4"},
    "path": {"translation", "rotation", "scale", "weights"},
    "interpolation": {"LINEAR", "STEP", "CUBICSPLINE"},
    "cameraType": {"perspective", "orthographic"},
    "alphaMode": {"OPAQUE", "MASK", "BLEND"},
    "mimeType": {"image/png", "image/jpeg", "image/webp"},
}
SCHEMA: dict[str, dict[str, object]] = {
    "root": {
        "extensionsUsed": "strs",
        "extensionsRequired": "strs",
        "accessors": ["accessor"],
        "animations": ["animation"],
        "asset": "asset",
        "buffers": ["buffer"],
        "bufferViews": ["bufferView"],
        "cameras": ["camera"],
        "images": ["image"],
        "materials": ["material"],
        "meshes": ["mesh"],
        "nodes": ["node"],
        "samplers": ["sampler"],
        "scene": "int",
        "scenes": ["scene"],
        "skins": ["skin"],
        "textures": ["texture"],
    },
    "accessor": {
        "bufferView": "int",
        "byteOffset": "int",
        "componentType": "int",
        "normalized": "bool",
        "count": "int",
        "type": "enum:type",
        "max": "nums",
        "min": "nums",
        "sparse": "sparse",
        "name": "name",
    },
    "sparse": {"count": "int", "indices": "sparseIndices", "values": "sparseValues"},
    "sparseIndices": {"bufferView": "int", "byteOffset": "int", "componentType": "int"},
    "sparseValues": {"bufferView": "int", "byteOffset": "int"},
    "animation": {
        "channels": ["channel"],
        "samplers": ["animationSampler"],
        "name": "name",
    },
    "channel": {"sampler": "int", "target": "target"},
    "target": {"node": "int", "path": "enum:path"},
    "animationSampler": {
        "input": "int",
        "interpolation": "enum:interpolation",
        "output": "int",
    },
    "asset": {"copyright": "copyright", "version": "version"},
    "buffer": {"uri": "uri", "byteLength": "int", "name": "name"},
    "bufferView": {
        "buffer": "int",
        "byteOffset": "int",
        "byteLength": "int",
        "byteStride": "int",
        "target": "int",
        "name": "name",
    },
    "camera": {
        "orthographic": "orthographic",
        "perspective": "perspective",
        "type": "enum:cameraType",
        "name": "name",
    },
    "orthographic": {"xmag": "num", "ymag": "num", "zfar": "num", "znear": "num"},
    "perspective": {"aspectRatio": "num", "yfov": "num", "zfar": "num", "znear": "num"},
    "image": {
        "uri": "uri",
        "mimeType": "enum:mimeType",
        "bufferView": "int",
        "name": "name",
    },
    "material": {
        "name": "name",
        "pbrMetallicRoughness": "pbr",
        "normalTexture": "normalTextureInfo",
        "occlusionTexture": "occlusionTextureInfo",
        "emissiveTexture": "textureInfo",
        "emissiveFactor": "nums",
        "alphaMode": "enum:alphaMode",
        "alphaCutoff": "num",
        "doubleSided": "bool",
    },
    "pbr": {
        "baseColorFactor": "nums",
        "baseColorTexture": "textureInfo",
        "metallicFactor": "num",
        "roughnessFactor": "num",
        "metallicRoughnessTexture": "textureInfo",
    },
    "textureInfo": {"index": "int", "texCoord": "int"},
    "normalTextureInfo": {"index": "int", "texCoord": "int", "scale": "num"},
    "occlusionTextureInfo": {"index": "int", "texCoord": "int", "strength": "num"},
    "mesh": {"primitives": ["primitive"], "weights": "nums", "name": "name"},
    "primitive": {
        "attributes": "attributes",
        "indices": "int",
        "material": "int",
        "mode": "int",
        "targets": "targets",
    },
    "node": {
        "camera": "int",
        "children": "ints",
        "skin": "int",
        "matrix": "nums",
        "mesh": "int",
        "rotation": "nums",
        "scale": "nums",
        "translation": "nums",
        "weights": "nums",
        "name": "name",
    },
    "sampler": {
        "magFilter": "int",
        "minFilter": "int",
        "wrapS": "int",
        "wrapT": "int",
        "name": "name",
    },
    "scene": {"nodes": "ints", "name": "name"},
    "skin": {
        "inverseBindMatrices": "int",
        "skeleton": "int",
        "joints": "ints",
        "name": "name",
    },
    "texture": {"sampler": "int", "source": "int", "name": "name"},
}
ATTRIBUTE = re.compile(r"POSITION|NORMAL|TANGENT|(?:TEXCOORD|COLOR|JOINTS|WEIGHTS)_\d+")
EXTENSIONS_ALLOWED = (
    "KHR_xmp_json_ld",
    "KHR_texture_transform",
    "KHR_mesh_quantization",
    "EXT_texture_webp",
)
TEXTURE_TRANSFORM = {
    "offset": "nums",
    "rotation": "num",
    "scale": "nums",
    "texCoord": "int",
}


def allowed_extension(name: str) -> bool:
    return name in EXTENSIONS_ALLOWED or name.startswith("KHR_materials_")


def name_problem(value: str) -> str | None:
    if "/" in value or "\\" in value:
        return "a path"
    if NAME_EXTENSION.search(value):
        return "a file name"
    if CAMERA_STEM.search(value):
        return "a camera's file stem"
    return None


class GltfCheck:
    """The glTF JSON against the schema: M4 for anything outside it, M5 for the mark, M8 for names and uris."""

    def __init__(self, out: Parsed, used: set[str]) -> None:
        self.out, self.used = out, used
        self.mark_refs: list[str] = []

    def walk(self, value: object, kind: str, where: str) -> None:
        if not isinstance(value, dict):
            self.out.bad("M4", f"{where} isn't an object")
            return
        allowed = SCHEMA[kind]
        for key, item in value.items():
            here = f"{where}.{key}"
            if key == "extras":
                if (
                    kind == "mesh"
                    and isinstance(item, dict)
                    and set(item) == {"targetNames"}
                ):
                    names = item["targetNames"]
                    if not isinstance(names, list) or not all(
                        isinstance(n, str) for n in names
                    ):
                        self.out.bad("M4", f"{here}.targetNames isn't a list of names")
                    else:
                        for n in names:
                            problem = name_problem(n)
                            if problem:
                                self.out.bad(
                                    "M8",
                                    f"a morph target's name at {here}.targetNames holds {problem}",
                                )
                else:
                    self.out.bad("M4", f"extras at {where}")
            elif key == "extensions":
                self.extensions(item, kind, here)
            elif key not in allowed:
                self.out.bad(
                    "M4",
                    f"{here}, outside the glTF 2.0 schema"
                    + (
                        " (asset holds only version and copyright)"
                        if kind == "asset"
                        else ""
                    ),
                )
            else:
                self.value(item, allowed[key], here)

    def value(self, item: object, spec: object, where: str) -> None:
        if isinstance(spec, list):
            if not isinstance(item, list):
                self.out.bad("M4", f"{where} isn't an array")
                return
            for i, element in enumerate(item):
                self.walk(element, str(spec[0]), f"{where}[{i}]")
            return
        assert isinstance(spec, str)
        if spec in SCHEMA:
            self.walk(item, spec, where)
        elif spec == "int":
            if not isinstance(item, int) or isinstance(item, bool):
                self.out.bad("M4", f"{where} isn't an integer")
        elif spec == "num":
            if not isinstance(item, (int, float)) or isinstance(item, bool):
                self.out.bad("M4", f"{where} isn't a number")
        elif spec == "bool":
            if not isinstance(item, bool):
                self.out.bad("M4", f"{where} isn't a boolean")
        elif spec in ("nums", "ints"):
            ok = (int,) if spec == "ints" else (int, float)
            if not isinstance(item, list) or not all(
                isinstance(x, ok) and not isinstance(x, bool) for x in item
            ):
                self.out.bad("M4", f"{where} isn't an array of numbers")
        elif spec == "strs":
            if not isinstance(item, list) or not all(isinstance(x, str) for x in item):
                self.out.bad("M4", f"{where} isn't an array of names")
        elif spec.startswith("enum:"):
            if item not in ENUMS[spec[5:]]:
                self.out.bad("M4", f"{where} isn't one of the schema's values")
        elif spec == "version":
            if item != "2.0":
                self.out.bad("M4", "asset.version isn't 2.0")
        elif spec == "copyright":
            if not isinstance(item, str) or "all rights reserved" not in item.lower():
                self.out.bad("M4", "asset.copyright doesn't name the media license")
        elif spec == "name":
            if not isinstance(item, str):
                self.out.bad("M4", f"{where} isn't a string")
            else:
                problem = name_problem(item)
                if problem:
                    self.out.bad("M8", f"the name at {where} holds {problem}")
        elif spec == "uri":
            self.out.bad(
                "M8",
                f"a uri at {where}: a GLB embeds its images and buffers through its BIN chunk",
            )
        elif spec == "attributes":
            self.attributes(item, where)
        elif spec == "targets":
            if not isinstance(item, list):
                self.out.bad("M4", f"{where} isn't an array")
            else:
                for i, target in enumerate(item):
                    self.attributes(target, f"{where}[{i}]")

    def attributes(self, item: object, where: str) -> None:
        if not isinstance(item, dict):
            self.out.bad("M4", f"{where} isn't an object")
            return
        for key, index in item.items():
            if not ATTRIBUTE.fullmatch(key):
                self.out.bad("M4", f"{where} holds an attribute outside the schema's")
            elif not isinstance(index, int) or isinstance(index, bool):
                self.out.bad("M4", f"{where}.{key} isn't an accessor index")

    def extensions(self, item: object, kind: str, where: str) -> None:
        if not isinstance(item, dict):
            self.out.bad("M4", f"{where} isn't an object")
            return
        for name, body in item.items():
            here = f"{where}.{name}"
            if not allowed_extension(name):
                self.out.bad(
                    "M4", f"extension {clean(name)[:60]} at {where}, outside the list"
                )
                continue
            if name not in self.used:
                self.out.bad("M4", f"{here} isn't in extensionsUsed")
            if name == "KHR_xmp_json_ld":
                self.mark_refs.append(f"{kind}:{json.dumps(body, sort_keys=True)}")
            elif name == "KHR_texture_transform":
                self.loose(body, TEXTURE_TRANSFORM, here)
            elif name == "EXT_texture_webp":
                self.loose(body, {"source": "int"}, here)
            elif name == "KHR_mesh_quantization":
                self.out.bad(
                    "M4", f"{here}: KHR_mesh_quantization has no object of its own"
                )
            else:
                self.materials_extension(body, here)

    def loose(self, body: object, spec: dict[str, str], where: str) -> None:
        if not isinstance(body, dict):
            self.out.bad("M4", f"{where} isn't an object")
            return
        for key, item in body.items():
            if key not in spec:
                self.out.bad("M4", f"{where}.{key}, outside the extension's schema")
            else:
                self.value(item, spec[key], f"{where}.{key}")

    def materials_extension(self, body: object, where: str) -> None:
        """A KHR_materials_* object: numbers, arrays of numbers, booleans, texture references, and names. No other
        text, and no extras."""
        if isinstance(body, dict):
            for key, item in body.items():
                here = f"{where}.{key}"
                if key == "extras":
                    self.out.bad("M4", f"extras at {where}")
                elif key == "extensions":
                    self.extensions(item, "textureInfo", here)
                elif key == "name":
                    self.value(item, "name", here)
                elif isinstance(item, str):
                    self.out.bad(
                        "M4", f"{here} holds text a material extension has no use for"
                    )
                else:
                    self.materials_extension(item, here)
        elif isinstance(body, list):
            for i, item in enumerate(body):
                self.materials_extension(item, f"{where}[{i}]")
        elif isinstance(body, str):
            self.out.bad(
                "M4", f"{where} holds text a material extension has no use for"
            )


def strings(value: object) -> list[str]:
    """Every key and string value in parsed JSON, so escaped text (\\/home, \\u002f) is searched decoded too."""
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [s for k, v in value.items() for s in (k, *strings(v))]
    if isinstance(value, list):
        return [s for v in value for s in strings(v)]
    return []


def strict_json(text: bytes) -> object:
    def pairs(items: list[tuple[str, object]]) -> dict[str, object]:
        keys = [k for k, _ in items]
        if len(keys) != len(set(keys)):
            raise ValueError("a duplicate key")
        return dict(items)

    def constant(name: str) -> object:
        raise ValueError(f"{name} isn't JSON")

    return json.loads(
        text.decode("utf-8"), object_pairs_hook=pairs, parse_constant=constant
    )


def parse_glb(data: bytes, out: Parsed, *, inspect_image) -> None:
    if len(data) < 20 or data[:4] != b"glTF":
        out.bad("M4", "it doesn't start with GLB's header")
        return
    version, total = struct.unpack("<II", data[4:12])
    if version != 2:
        out.bad("M4", "it isn't glTF 2.0")
        return
    if total > len(data):
        out.bad("M4", "its declared length runs past the file")
        return
    if total < len(data):
        out.bad("M9", f"{len(data) - total} bytes past the GLB's declared length")
    pos, chunks = 12, []
    while pos + 8 <= total:
        length, kind = struct.unpack("<II", data[pos : pos + 8])
        if pos + 8 + length > total or length % 4:
            out.bad("M4", f"a chunk at byte {pos} isn't 4-byte padded within the file")
            return
        chunks.append((kind, pos + 8, data[pos + 8 : pos + 8 + length]))
        pos += 8 + length
    if pos != total:
        out.bad("M9", "bytes inside the GLB's length that no chunk accounts for")
    kinds = [k for k, _, _ in chunks]
    if not kinds or kinds[0] != 0x4E4F534A or kinds[1:] not in ([], [0x004E4942]):
        out.bad("M4", "its chunks aren't one JSON and at most one BIN")
        return
    json_at, json_bytes = chunks[0][1], chunks[0][2]
    out.texts.append(("the GLB's JSON chunk", json_at, json_bytes))
    try:
        gltf = strict_json(json_bytes)
    except (ValueError, UnicodeDecodeError, RecursionError):
        out.bad("M4", "its JSON chunk doesn't parse, or holds a duplicate key")
        return
    if not isinstance(gltf, dict):
        out.bad("M4", "its JSON isn't an object")
        return
    for text in strings(gltf):
        out.texts.append(
            (
                "a string in the GLB's JSON chunk",
                json_at,
                text.encode("utf-8", "surrogatepass"),
            )
        )
    used_list = gltf.get("extensionsUsed", [])
    used = (
        {u for u in used_list if isinstance(u, str)}
        if isinstance(used_list, list)
        else set()
    )
    for name in sorted(used):
        if not allowed_extension(name):
            out.bad(
                "M4",
                f"extension {clean(name)[:60]} in extensionsUsed, outside the list",
            )
    required = gltf.get("extensionsRequired", [])
    if (
        isinstance(required, list)
        and not {r for r in required if isinstance(r, str)} <= used
    ):
        out.bad("M4", "extensionsRequired names an extension extensionsUsed doesn't")
    if "asset" not in gltf:
        out.bad("M4", "no asset object")
    checker = GltfCheck(out, used)
    checker.walk(gltf, "root", "glTF")
    # The mark: one packet, on the root, holding only the mark, referenced by the asset and nothing else (M5).
    packets = (
        (gltf.get("extensions") or {}).get("KHR_xmp_json_ld", {})
        if isinstance(gltf.get("extensions"), dict)
        else {}
    )
    asset_ext = (
        gltf.get("asset", {}).get("extensions", {})
        if isinstance(gltf.get("asset"), dict)
        else {}
    )
    root_ref = 'root:{"packets": '
    if not isinstance(packets, dict) or "packets" not in packets:
        out.bad(
            "M5", "no mark: KHR_xmp_json_ld's packet with the IPTC digital source type"
        )
    else:
        found = packets["packets"]
        if (
            not isinstance(found, list)
            or len(found) != 1
            or set(packets) != {"packets"}
        ):
            out.bad("M5", "the mark's KHR_xmp_json_ld holds more than one packet")
        elif not any(found[0] == mark_json(term) for term in MARK_TERMS):
            out.bad(
                "M5",
                "the mark's packet holds something besides Iptc4xmpExt:DigitalSourceType, set to one of the three "
                "terms a record's steps call for",
            )
        else:
            out.term = found[0]["Iptc4xmpExt:DigitalSourceType"][len(SOURCE_TYPES) :]
        if asset_ext.get("KHR_xmp_json_ld") != {"packet": 0}:
            out.bad("M5", "the asset doesn't reference the mark's packet")
        others = [
            r
            for r in checker.mark_refs
            if not r.startswith(root_ref) and r != 'asset:{"packet": 0}'
        ]
        if others:
            out.bad("M5", "a packet referenced from an object other than the asset")
    binary_chunk = chunks[1][2] if len(chunks) > 1 else b""
    bin_at = chunks[1][1] if len(chunks) > 1 else 0
    buffers = gltf.get("buffers") if isinstance(gltf.get("buffers"), list) else []
    views = gltf.get("bufferViews") if isinstance(gltf.get("bufferViews"), list) else []
    if len(buffers) > 1:
        out.bad("M4", "more than one buffer: a GLB holds one, its BIN chunk")
    length = (
        buffers[0].get("byteLength", 0)
        if buffers and isinstance(buffers[0], dict)
        else 0
    )
    if (
        not isinstance(length, int)
        or length > len(binary_chunk)
        or len(binary_chunk) - length > 3
    ):
        out.bad("M4", "the buffer's byteLength doesn't match the BIN chunk")
        return
    ranges = []
    for i, view in enumerate(views):
        if not isinstance(view, dict):
            continue
        offset, size = view.get("byteOffset", 0), view.get("byteLength", 0)
        if (
            not (isinstance(offset, int) and isinstance(size, int))
            or offset < 0
            or size < 0
            or offset + size > length
            or view.get("buffer", 0) != 0
        ):
            out.bad("M4", f"bufferViews[{i}] lies outside the buffer")
            return
        ranges.append((offset, offset + size))
    covered, cursor = sorted(ranges), 0
    for lo, hi in covered + [(length, length)]:
        if lo > cursor:
            gap = binary_chunk[cursor:lo]
            if len(gap) > 3 or gap.strip(b"\x00"):
                out.bad(
                    "M9",
                    f"{len(gap)} bytes in the BIN chunk at byte {bin_at + cursor} that no bufferView covers",
                )
        cursor = max(cursor, hi)
    tail = binary_chunk[length:]
    if tail.strip(b"\x00"):
        out.bad("M9", "the BIN chunk's padding isn't zeros")
    # Sizes: vertices, triangles, and the textures' memory (research R-08).
    accessors = gltf.get("accessors") if isinstance(gltf.get("accessors"), list) else []

    def count(index: object) -> int:
        if (
            isinstance(index, int)
            and 0 <= index < len(accessors)
            and isinstance(accessors[index], dict)
        ):
            value = accessors[index].get("count", 0)
            return value if isinstance(value, int) else 0
        return 0

    vertices = triangles = 0
    for mesh in gltf.get("meshes") or []:
        for prim in (mesh.get("primitives") or []) if isinstance(mesh, dict) else []:
            if not isinstance(prim, dict) or not isinstance(
                prim.get("attributes"), dict
            ):
                continue
            n = count(prim["attributes"].get("POSITION"))
            vertices += n
            k = count(prim["indices"]) if "indices" in prim else n
            mode = prim.get("mode", 4)
            triangles += k // 3 if mode == 4 else max(k - 2, 0) if mode in (5, 6) else 0
    out.vertices, out.triangles, out.texture = vertices, triangles, 0
    # Embedded images: metadata-free (M6), checked as images; the GLB's one mark covers the model file.
    for i, image in enumerate(gltf.get("images") or []):
        if not isinstance(image, dict) or "bufferView" not in image:
            continue
        index = image["bufferView"]
        if not isinstance(index, int) or not 0 <= index < len(ranges):
            out.bad("M4", f"images[{i}] names no bufferView")
            continue
        lo, hi = ranges[index]
        inner = inspect_image(binary_chunk[lo:hi])
        out.texture += inner.width * inner.height * 4 * 4 // 3
        out.images.append((inner.width, inner.height))
        for rule, reason in inner.problems:
            if rule == "M9":
                out.bad("M9", f"images[{i}], embedded: {reason}")
            else:
                out.bad("M6", f"images[{i}], embedded, fails {rule}: {reason}")
        if inner.marks:
            out.bad(
                "M6",
                f"images[{i}], embedded, carries its own XMP packet: the GLB's one mark covers the model file",
            )
        for what, at, text in inner.texts:
            out.texts.append((f"images[{i}]'s {what}", bin_at + lo + at, text))


def inspect_image(data: bytes) -> Parsed:
    """An image embedded in a GLB: its format by its signature, parsed as a standalone file would be."""
    out = Parsed()
    kind = sniff(data)
    if kind == "png":
        parse_png(data, out)
    elif kind == "jpeg":
        parse_jpeg(data, out)
    elif kind == "webp":
        parse_webp(data, out)
    else:
        out.bad("M4", "an embedded image that isn't PNG, JPEG, or WebP")
    return out


def inspect(data: bytes, kind: str) -> Parsed:
    """A file in an asset directory, by its admitted format: the M rules, the parts that hold text, and the mark."""
    out = Parsed()
    if kind == "png":
        parse_png(data, out)
    elif kind == "jpeg":
        parse_jpeg(data, out)
    elif kind == "webp":
        parse_webp(data, out)
    elif kind == "glb":
        parse_glb(data, out, inspect_image=inspect_image)
    if kind != "glb" and not out.marks:
        out.bad("M5", "no mark: the XMP packet with the IPTC digital source type")
    return out


def container_findings(data: bytes, kind: str) -> list[tuple[str, str]]:
    """(rule, reason) for a standalone file of an admitted format: the M rules, the B rules on its text, and A4 beyond
    its mark. The scrubber's tests read this."""
    parsed = inspect(data, kind)
    found = list(parsed.problems)
    for what, at, text in parsed.texts:
        for rule, offset, description in text_hits(text):
            found.append((rule, f"{description} in {what} at byte {at + offset}"))
    found += [("A4", reason) for reason in camera_metadata(data, parsed.marks)]
    return found


# --------------------------------------------------------------------------------------------------
# The policy, from the main branch (R-05)
# --------------------------------------------------------------------------------------------------
@dataclass
class Policy:
    licenses: dict[tuple[str, str], dict]
    approvals: list[dict]
    caps: dict


YES_NO = ("yes", "no")
CONFIRMS = (
    "likeness_accepted",
    "nothing_locates",
    "no_screen_logo_text_or_art",
    "recreation_not_photo",
    "record_complete",
)
# Each true or "not_applicable" (spec 004, Amendment C4); screens_plain_live_face was screens_plain_glow, no longer read.
ROOM_CONFIRMS = (
    "window_view_recreated",
    "screens_plain_live_face",
    "artwork_original_or_absent",
)
NOT_APPLICABLE = "not_applicable"
# per_asset.room (spec 004, Amendment C7; contracts/intake-amendments.md §8): exactly these keys.
ROOM_CAPS = (
    "gzip_bytes",
    "triangles",
    "small_props",
    "small_prop_texture_px",
    "scene_texture_bytes",
    "legibility_floor_css_px",
)
PIECE_ID = re.compile(r"[a-z][a-z0-9-]{1,40}")


def room_caps_problem(room: object) -> str | None:
    """Why main's per_asset.room can't be read, naming a key and never its value; None when it can."""
    where = "caps.json's per_asset.room"
    if not isinstance(room, dict):
        return f"{where} isn't an object"
    unknown = [k for k in room if k not in ROOM_CAPS]
    if unknown:
        return f"{where} holds a key it doesn't know: {clean(str(unknown[0]))[:40]}"
    missing = [k for k in ROOM_CAPS if k not in room]
    if missing:
        return f"{where} lacks {missing[0]}"

    def positive_int(value: object) -> bool:
        return isinstance(value, int) and not isinstance(value, bool) and value > 0

    for key in ("gzip_bytes", "triangles", "scene_texture_bytes"):
        if not positive_int(room[key]):
            return f"{where}'s {key} isn't a positive integer"
    side = room["small_prop_texture_px"]
    if not positive_int(side) or side & (side - 1):
        return f"{where}'s small_prop_texture_px isn't a positive power of two"
    floor = room["legibility_floor_css_px"]
    if (
        not isinstance(floor, (int, float))
        or isinstance(floor, bool)
        or not 0 < floor < float("inf")
    ):
        return f"{where}'s legibility_floor_css_px isn't a positive number"
    props = room["small_props"]
    if (
        not isinstance(props, list)
        or not all(isinstance(p, str) and PIECE_ID.fullmatch(p) for p in props)
        or len(set(props)) != len(props)
    ):
        return f"{where}'s small_props isn't a list of unique piece IDs"
    return None


def parse_policy(texts: dict[str, bytes]) -> Policy:
    """The three files, or a PolicyError naming what doesn't parse."""
    docs = {}
    for name, text in texts.items():
        try:
            docs[name] = strict_json(text)
        except (ValueError, UnicodeDecodeError, RecursionError):
            raise PolicyError(f"{name} isn't JSON") from None
        if not isinstance(docs[name], dict) or docs[name].get("schema") != 1:
            raise PolicyError(f"{name} isn't schema 1")
    licenses: dict[tuple[str, str], dict] = {}
    for item in docs["licenses.json"].get("licenses", []):
        terms = (
            "display_on_site_that_promotes_the_studio",
            "everywhere",
            "public_distribution",
        )
        if (
            not isinstance(item, dict)
            or not isinstance(item.get("id"), str)
            or not isinstance(item.get("version"), str)
        ):
            raise PolicyError("licenses.json has an entry without an id and a version")
        if (
            any(item.get(t) not in YES_NO for t in terms)
            or item.get("research_display", "no") not in YES_NO
        ):
            raise PolicyError(
                f"licenses.json's {item['id']} doesn't read yes or no on each term"
            )
        if not isinstance(item.get("evaluation_only"), bool):
            raise PolicyError(f"licenses.json's {item['id']} has no evaluation_only")
        licenses[(item["id"], item["version"])] = item
    approvals = docs["approvals.json"].get("approvals", [])
    if not isinstance(approvals, list):
        raise PolicyError("approvals.json's approvals isn't a list")
    for item in approvals:
        if not isinstance(item, dict) or not all(
            isinstance(item.get(k), str)
            for k in ("id", "sha256", "path_when_approved", "kind")
        ):
            raise PolicyError(
                "approvals.json has an entry without an id, a sha256, a path, and a kind"
            )
        if not isinstance(item.get("confirms"), dict) or (
            item.get("room") is not None and not isinstance(item["room"], dict)
        ):
            raise PolicyError(
                f"approvals.json's {item['id']} has malformed confirmations"
            )
    caps = docs["caps.json"]
    visit = caps.get("first_visit_bytes")
    if not isinstance(caps.get("adr_0010"), str) or not isinstance(
        caps.get("per_asset"), dict
    ):
        raise PolicyError("caps.json has no adr_0010 or per_asset")
    if "room" in caps["per_asset"]:
        problem = room_caps_problem(caps["per_asset"]["room"])
        if problem:
            raise PolicyError(problem)
    if not isinstance(visit, dict) or not all(
        isinstance(visit.get(k), int) for k in ("phase2", "phase3")
    ):
        raise PolicyError(
            "caps.json's first_visit_bytes isn't phase2 and phase3 in bytes"
        )
    if not isinstance(caps.get("history_bytes"), int):
        raise PolicyError("caps.json has no history_bytes")
    return Policy(licenses, approvals, caps)


# --------------------------------------------------------------------------------------------------
# The record (R1 to R7; contracts/asset-record.md)
# --------------------------------------------------------------------------------------------------
TOP_KEYS = ("schema", "directory", "license", "entries")
ENTRY_KEYS = (
    "file",
    "sha256",
    "kind",
    "made",
    "source",
    "likeness",
    "steps",
    "media_license",
    "approval",
    "arm",
    "note",
)
ENTRY_REQUIRED = (
    "file",
    "sha256",
    "kind",
    "made",
    "source",
    "likeness",
    "steps",
    "media_license",
)
STEP_KEYS = (
    "name",
    "by",
    "models",
    "tools",
    "service",
    "models_checked",
    "workflow_sha256",
)
MODEL_KEYS = (
    "name",
    "repository",
    "revision",
    "role",
    "license",
    "license_version",
    "commercial_license",
)
MODEL_REQUIRED = MODEL_KEYS[:6]
TOOL_KEYS = ("name", "version", "license", "license_version")
SERVICE_KEYS = ("name", "license", "license_version", "disclosure_row")
KINDS = frozenset(
    {"avatar", "animation", "room", "still", "preview", "published-image"}
)


def as_date(text: object) -> dt.date | None:
    if not isinstance(text, str) or not DATE_RE.fullmatch(text):
        return None
    try:
        return dt.date.fromisoformat(text)
    except ValueError:
        return None


def r5_problem(value: str) -> str | None:
    if "/" in value or "\\" in value:
        return "a path"
    if R5_EXTENSION.search(value):
        return "a file name with an extension"
    if R5_COORDINATE.search(value):
        return "a coordinate"
    if R5_TIME.search(value):
        return "a time finer than a day"
    return None


class Record:
    """One directory's records.json, validated. `bad` collects (rule, reason) for the records file itself."""

    def __init__(
        self, directory: str, data: bytes, disclosure_rows: set[str], published: bool
    ) -> None:
        self.directory, self.published, self.rows = (
            directory,
            published,
            disclosure_rows,
        )
        self.entries: list[dict] = []
        self.problems: list[tuple[str, str]] = []
        self.texts: list[bytes] = [data]
        try:
            doc = strict_json(data)
        except (ValueError, UnicodeDecodeError, RecursionError):
            self.problems.append(
                ("R1", "records.json isn't JSON, or holds a duplicate key")
            )
            return
        self.texts += [s.encode("utf-8", "surrogatepass") for s in strings(doc)]
        if not isinstance(doc, dict):
            self.problems.append(("R1", "records.json isn't an object"))
            return
        self.keys(doc, TOP_KEYS, TOP_KEYS, "records.json")
        if doc.get("schema") != 1:
            self.problems.append(("R1", "records.json's schema isn't 1"))
        if doc.get("directory") != directory:
            self.problems.append(
                ("R1", "records.json's directory isn't the directory it's in")
            )
        if doc.get("license") != MEDIA_LICENSE:
            self.problems.append(
                ("R1", f"records.json's license isn't {MEDIA_LICENSE}")
            )
        self.license = doc.get("license")
        entries = doc.get("entries")
        if not isinstance(entries, list):
            self.problems.append(("R1", "records.json's entries isn't a list"))
            return
        seen = set()
        for i, item in enumerate(entries):
            where = f"entries[{i}]"
            if not isinstance(item, dict):
                self.problems.append(("R1", f"{where} isn't an object"))
                continue
            if item.get("file") in seen:
                self.problems.append(
                    ("R1", f"{where} names a file another entry names")
                )
            seen.add(item.get("file"))
            self.entry(item, where)
            self.entries.append(item)

    def keys(
        self,
        item: dict,
        allowed: tuple[str, ...],
        required: tuple[str, ...],
        where: str,
    ) -> None:
        missing = [k for k in required if k not in item]
        unknown = [k for k in item if k not in allowed]
        if missing:
            self.problems.append(("R4", f"{where} lacks {', '.join(missing)}"))
        if unknown:
            self.problems.append(
                (
                    "R4",
                    f"{where} holds unknown fields: {', '.join(clean(k)[:40] for k in unknown)}",
                )
            )

    def text(self, value: object, where: str, *, required: bool = True) -> str | None:
        if value is None and not required:
            return None
        if not isinstance(value, str) or not value.strip():
            self.problems.append(("R1", f"{where} isn't text"))
            return None
        problem = r5_problem(value)
        if problem:
            self.problems.append(("R5", f"{where} holds {problem}"))
        return value

    def entry(self, item: dict, where: str) -> None:
        required = list(ENTRY_REQUIRED)
        if (
            item.get("likeness") is True
            or (
                isinstance(item.get("source"), dict)
                and item["source"].get("type") == "photo"
            )
            or item.get("kind") == "room"
            or self.directory == "assets/twin"
            or self.directory.startswith("assets/twin/")
            or (self.directory + "/").startswith(ROOM)
        ):
            required.append("approval")
        if self.published:
            required.append("note")
        self.keys(item, ENTRY_KEYS, tuple(required), where)
        name = item.get("file")
        if (
            not isinstance(name, str)
            or "/" in name
            or "\\" in name
            or ext_of(name) not in ADMITTED
            or name in (RECORDS, NOTICE)
        ):
            self.problems.append(
                (
                    "R1",
                    f"{where}.file isn't a PNG, JPEG, WebP, or GLB file name in this directory",
                )
            )
        if "sha256" in item and not (
            isinstance(item["sha256"], str) and HEX64.fullmatch(item["sha256"])
        ):
            self.problems.append(("R1", f"{where}.sha256 isn't a lowercase SHA-256"))
        kind = item.get("kind")
        if "kind" in item and (
            kind not in KINDS or (kind == "published-image") != self.published
        ):
            self.problems.append(("R1", f"{where}.kind isn't one the directory takes"))
        made = as_date(item.get("made"))
        if "made" in item and made is None:
            self.problems.append(
                (
                    "R5"
                    if isinstance(item.get("made"), str)
                    and R5_TIME.search(item["made"])
                    else "R1",
                    f"{where}.made isn't a date (YYYY-MM-DD)",
                )
            )
        source = item.get("source")
        if isinstance(source, dict):
            self.keys(source, ("type", "id"), ("type", "id"), f"{where}.source")
            # A design: an original design with no photo or prompt (spec 004, Amendment C2).
            if source.get("type") not in ("photo", "prompt", "asset", "design"):
                self.problems.append(
                    (
                        "R1",
                        f"{where}.source.type isn't photo, prompt, asset, or design",
                    )
                )
            sid = source.get("id")
            if isinstance(sid, str) and r5_problem(sid):
                self.problems.append(
                    (
                        "R5",
                        f"{where}.source.id holds {r5_problem(sid)}: sources are opaque IDs",
                    )
                )
            elif not isinstance(sid, str) or not ID_RE.fullmatch(sid):
                self.problems.append(("R1", f"{where}.source.id isn't an opaque ID"))
        elif "source" in item:
            self.problems.append(("R1", f"{where}.source isn't an object"))
        if "likeness" in item and not isinstance(item["likeness"], bool):
            self.problems.append(("R1", f"{where}.likeness isn't true or false"))
        if "media_license" in item and not isinstance(item["media_license"], str):
            self.problems.append(("R1", f"{where}.media_license isn't text"))
        if "approval" in item and not (
            isinstance(item["approval"], str) and ID_RE.fullmatch(item["approval"])
        ):
            self.problems.append(("R1", f"{where}.approval isn't an approval's ID"))
        if "arm" in item and (
            not self.published or item["arm"] not in ("A", "B", "C", "D")
        ):
            self.problems.append(
                ("R1", f"{where}.arm is A, B, C, or D, and only for a published image")
            )
        if "note" in item:
            stem = self.directory.rsplit("/", 1)[-1]
            if not self.published or item["note"] != f"docs/research/{stem}.md":
                self.problems.append(
                    ("R1", f"{where}.note isn't docs/research/{stem}.md")
                )
        steps = item.get("steps")
        if "steps" in item and (not isinstance(steps, list) or not steps):
            self.problems.append(
                ("R1", f"{where}.steps isn't a list of at least one step")
            )
            return
        for j, step in enumerate(steps or []):
            self.step(step, f"{where}.steps[{j}]", made)

    def step(self, step: object, where: str, made: dt.date | None) -> None:
        if not isinstance(step, dict):
            self.problems.append(("R1", f"{where} isn't an object"))
            return
        self.keys(step, STEP_KEYS, ("name", "by"), where)
        self.text(step.get("name"), f"{where}.name")
        by = step.get("by")
        if by not in ("model", "hand"):
            self.problems.append(("R1", f"{where}.by isn't model or hand"))
        if by == "model":
            models = step.get("models")
            if not isinstance(models, list) or not models:
                self.problems.append(("R4", f"{where} is a model step with no models"))
            checked = as_date(step.get("models_checked"))
            if checked is None:
                self.problems.append(
                    ("R6", f"{where} is a model step with no models_checked date")
                )
            elif made is not None and checked > made:
                self.problems.append(
                    ("R6", f"{where}'s models_checked falls after the file was made")
                )
        elif "models" in step:
            self.problems.append(("R1", f"{where} names models on a step done by hand"))
        if "workflow_sha256" in step and not (
            isinstance(step["workflow_sha256"], str)
            and HEX64.fullmatch(step["workflow_sha256"])
        ):
            self.problems.append(("R1", f"{where}.workflow_sha256 isn't a SHA-256"))
        for k, model in enumerate(step.get("models") or []):
            here = f"{where}.models[{k}]"
            if not isinstance(model, dict):
                self.problems.append(("R1", f"{here} isn't an object"))
                continue
            self.keys(model, MODEL_KEYS, MODEL_REQUIRED, here)
            for key in ("name", "revision", "license", "license_version"):
                self.text(model.get(key), f"{here}.{key}")
            self.text(
                model.get("commercial_license"),
                f"{here}.commercial_license",
                required=False,
            )
            if model.get("role") not in ("primary", "auxiliary"):
                self.problems.append(("R1", f"{here}.role isn't primary or auxiliary"))
            repo = model.get("repository")
            if not isinstance(repo, str) or not REPOSITORY.fullmatch(repo):
                self.problems.append(
                    ("R5", f"{here}.repository isn't a URL or org/name")
                )
        for k, tool in enumerate(step.get("tools") or []):
            here = f"{where}.tools[{k}]"
            if not isinstance(tool, dict):
                self.problems.append(("R1", f"{here} isn't an object"))
                continue
            self.keys(tool, TOOL_KEYS, TOOL_KEYS, here)
            for key in TOOL_KEYS:
                self.text(tool.get(key), f"{here}.{key}")
        service = step.get("service")
        if service is not None:
            if not isinstance(service, dict):
                self.problems.append(("R1", f"{where}.service isn't an object"))
            else:
                self.keys(service, SERVICE_KEYS, SERVICE_KEYS, f"{where}.service")
                for key in SERVICE_KEYS:
                    self.text(service.get(key), f"{where}.service.{key}")
                if service.get("disclosure_row") not in self.rows:
                    self.problems.append(
                        (
                            "R7",
                            f"{where}.service names a disclosure row docs/data-flow-disclosure.md doesn't have",
                        )
                    )


def disclosure_rows(text: bytes | None) -> set[str]:
    if text is None:
        return set()
    return set(
        re.findall(r"(?m)^\| ([A-Z]\d+[a-z]?) \|", text.decode("utf-8", "replace"))
    )


def expected_term(path: str, entry: dict) -> str | None:
    """The mark's term the file must carry (spec 004, Amendment C1): the one its record's steps call for, and under
    assets/twin/ and docs/research/images/, MARK_MODEL whatever the steps say. None while the steps can't say, which
    R1 refuses on its own."""
    if path.startswith(MODEL_ONLY):
        return MARK_MODEL
    return steps_term(entry)


def steps_term(entry: dict) -> str | None:
    """The term the record's steps call for, wherever the file lives: every step by a model, MARK_MODEL; model and
    hand mixed, MARK_COMPOSITE; every step by hand, MARK_HUMAN. None while the steps can't say."""
    steps = entry.get("steps")
    if not isinstance(steps, list) or not steps:
        return None
    by = {step.get("by") if isinstance(step, dict) else None for step in steps}
    if by == {"model"}:
        return MARK_MODEL
    if by == {"hand"}:
        return MARK_HUMAN
    if by == {"model", "hand"}:
        return MARK_COMPOSITE
    return None


def room_file(path: str, entry: dict) -> bool:
    """A room file: its record's kind is room, or it sits under assets/room/, whatever its record says."""
    return entry.get("kind") == "room" or path.startswith(ROOM)


def licenses_of(entry: dict) -> list[tuple[str, str, str, str | None]]:
    """(what, license, version, commercial license) for each model, tool, and service an entry names."""
    found = []
    for step in entry.get("steps") or []:
        if not isinstance(step, dict):
            continue
        for model in step.get("models") or []:
            if isinstance(model, dict):
                found.append(
                    (
                        f"model {model.get('name')}",
                        model.get("license"),
                        model.get("license_version"),
                        model.get("commercial_license"),
                    )
                )
        for tool in step.get("tools") or []:
            if isinstance(tool, dict):
                found.append(
                    (
                        f"tool {tool.get('name')}",
                        tool.get("license"),
                        tool.get("license_version"),
                        None,
                    )
                )
        service = step.get("service")
        if isinstance(service, dict):
            found.append(
                (
                    f"service {service.get('name')}",
                    service.get("license"),
                    service.get("license_version"),
                    None,
                )
            )
    return found


# --------------------------------------------------------------------------------------------------
# The check
# --------------------------------------------------------------------------------------------------
class Checker:
    def __init__(self, git: Git | None) -> None:
        self.git = git
        self.findings: list[Finding] = []
        self._seen: set[tuple[str, str, str]] = set()
        # What no exit code counts: a hand-made or composite file P1 doesn't hold (spec 004, Amendment C1), recorded
        # only for the files the changes being checked add or change, never for one main already holds.
        self.warnings: list[Finding] = []
        self.warn_for: set[str] = set()
        self._files: dict[tuple[str, str], None] = {}
        self.sizes: dict[str, Size] = {}
        # What a file's parse found that its entry's rules read (spec 004, Amendments C1 and C7), by the file's SHA-256.
        self.facts: dict[str, Facts] = {}
        self.reasons: list[str] = []
        self._policy: Policy | None = None
        self._policy_tried = False
        self.files_checked = 0
        self.commits = 0
        self.first_visit: tuple[str, int, int] | None = None
        self.history: tuple[int, int] | None = None
        # Whether the run met a studio file: only then does it need the policy (exit 2 without one).
        self.studio = False

    def add(self, rule: str, path: str, reason: str, commit: str | None) -> None:
        key = (rule, path, reason)
        if key not in self._seen:
            self._seen.add(key)
            self.findings.append(Finding(rule, path, reason, commit))

    def warn(self, path: str, reason: str, commit: str | None) -> None:
        """A WARN line, once per file and reason, which fails nothing: only for a file the changes being checked add or
        change (check_changes), so a range's last pass over the tip's whole tree records none."""
        key = ("WARN", path, reason)
        if path in self.warn_for and key not in self._seen:
            self._seen.add(key)
            self.warnings.append(Finding("WARN", path, reason, commit))

    def cannot(self, reason: str) -> None:
        if reason not in self.reasons:
            self.reasons.append(reason)

    def policy(self) -> Policy | None:
        """The main branch's policy, read once; None, with a reason recorded, when it's missing or doesn't parse."""
        if not self._policy_tried:
            self._policy_tried = True
            texts = {}
            for name in POLICY_FILES:
                data = (
                    self.git.try_run("cat-file", "blob", f"{MAIN}:{POLICY}{name}")
                    if self.git
                    else None
                )
                if data is None:
                    self.cannot(
                        f"a studio file needs the policy, and the main branch ({MAIN}) has no {POLICY}{name}"
                    )
                    return None
                texts[name] = data
            try:
                self._policy = parse_policy(texts)
            except PolicyError as exc:
                # The room block's problems read as the contract gives them: caps.json's per_asset.room …
                reason = str(exc)
                self.cannot(
                    reason
                    if reason.startswith("caps.json's per_asset.room")
                    else f"the main branch's {POLICY}{reason}"
                )
        return self._policy

    # -- one file ------------------------------------------------------------------------------
    def check_file(self, tree: Tree, path: str, commit: str | None) -> None:
        item = tree.items().get(path)
        if item is None:
            return
        key = (path, item.oid or "")
        data = tree.read(path)
        if data is None and item.mode not in ("120000", "160000"):
            return
        if item.oid is None and data is not None:
            key = (path, hashlib.sha256(data).hexdigest())
        if key in self._files:
            return
        self._files[key] = None
        self.files_checked += 1
        data = data or b""
        ext = ext_of(path)
        name = path.rsplit("/", 1)[-1]
        found = sniff(data)
        if ext == ".xmp":
            # An XMP sidecar is metadata alone, a camera's or an editor's, text or not, wherever it is (FR-002).
            self.add(
                "A4", path, "an XMP sidecar file: camera or editor metadata", commit
            )
        weights = (
            ext in WEIGHT_EXT
            or found in ("safetensors", "gguf")
            or (ext == ".bin" and len(data) > BIN_WEIGHTS)
        )
        if weights:
            self.add(
                "A2",
                path,
                f"model weights ({ext or DESCRIBE.get(found or '', 'by its header')}); the studio's models stay in the studio",
                commit,
            )
        if in_roots(path):
            if parent(path) in ROOT_TOPS:
                if path not in ROOT_FILES:
                    self.add(
                        "A3",
                        path,
                        "a file at the top of the asset tree, which holds only README.md and CREDITS.md",
                        commit,
                    )
                return
            if item.mode in ("120000", "160000"):
                self.add(
                    "A3", path, "a link or a submodule in an asset directory", commit
                )
                return
            if name in (RECORDS, NOTICE):
                return  # its directory's check reads it, text and all
            self.studio = True
            kind = ADMITTED.get(ext)
            if kind is None:
                if not weights:
                    what = (
                        DESCRIBE.get(found or "") or BY_EXTENSION.get(ext) or "a file"
                    )
                    self.add(
                        "A3",
                        path,
                        f"{what} of a kind asset directories don't take (only PNG, JPEG, WebP, GLB, records.json, and LICENSE.md)",
                        commit,
                    )
                if binary(data):
                    for reason in camera_metadata(data):
                        self.add("A4", path, f"camera metadata: {reason}", commit)
                return
            if found != kind:
                self.add(
                    "A3",
                    path,
                    f"its bytes aren't the {kind.upper()} its name says",
                    commit,
                )
                return
            parsed = inspect(data, kind)
            for rule, reason in parsed.problems:
                self.add(rule, path, reason, commit)
            for what, at, text in parsed.texts:
                for rule, offset, description in text_hits(text):
                    self.add(
                        rule,
                        path,
                        f"{description} in {what} at byte {at + offset}",
                        commit,
                    )
            for reason in camera_metadata(data, parsed.marks):
                self.add(
                    "A4", path, f"camera metadata outside the mark: {reason}", commit
                )
            self.sizes[path] = Size(
                path,
                len(data),
                len(gzip.compress(data, 9, mtime=0)),
                parsed.vertices,
                parsed.triangles,
                parsed.texture,
            )
            self.facts[hashlib.sha256(data).hexdigest()] = Facts.of(
                parsed, kind, self.sizes[path].gzip
            )
            return
        if path.startswith(POLICY):
            return
        media = (
            found in DESCRIBE
            and found not in ("safetensors", "gguf")
            or ext in BY_EXTENSION
        )
        if media:
            what = DESCRIBE.get(found or "") or BY_EXTENSION[ext]
            self.add(
                "A1",
                path,
                f"{what} outside the asset roots (assets/ and docs/research/images/)",
                commit,
            )
        if binary(data):
            for reason in camera_metadata(data):
                self.add("A4", path, f"camera metadata: {reason}", commit)

    def scan_text(self, data: bytes, path: str, what: str, commit: str | None) -> None:
        for rule, offset, description in text_hits(data):
            self.add(rule, path, f"{description} in {what} at byte {offset}", commit)

    # -- one asset directory -----------------------------------------------------------------------
    def check_dir(self, tree: Tree, directory: str, commit: str | None) -> None:
        if not in_roots(directory + "/") or directory in ROOT_TOPS:
            return
        files = tree.listdir(directory)
        names = {p.rsplit("/", 1)[-1]: p for p in files}
        assets = [p for n, p in names.items() if n not in (RECORDS, NOTICE)]
        records_path, notice_path = f"{directory}/{RECORDS}", f"{directory}/{NOTICE}"
        published = directory.startswith(PUBLISHED)
        record = None
        if RECORDS in names:
            data = tree.read(records_path) or b""
            record = Record(
                directory, data, disclosure_rows(tree.read(DISCLOSURE)), published
            )
            for rule, reason in record.problems:
                self.add(rule, records_path, reason, commit)
            raw = {rule for rule, _, _ in text_hits(data)}
            self.scan_text(data, records_path, RECORDS, commit)
            for text in record.texts[1:]:
                for rule, _, description in text_hits(text):
                    if rule not in raw:  # escaped in the file, so found only decoded
                        raw.add(rule)
                        self.add(
                            rule,
                            records_path,
                            f"{description} in an escaped string in records.json",
                            commit,
                        )
        elif assets:
            self.add(
                "R1",
                records_path,
                "the directory has asset files and no records.json",
                commit,
            )
        entries = record.entries if record else []
        if assets or entries:
            self.studio = True
        if NOTICE in names:
            notice = tree.read(notice_path) or b""
            self.scan_text(notice, notice_path, NOTICE, commit)
            match = NOTICE_RE.match(notice.decode("utf-8", "replace"))
            if not match:
                self.add(
                    "N1",
                    notice_path,
                    f"LICENSE.md doesn't read as the media license's notice ({MEDIA_LICENSE}, contracts/asset-record.md §3)",
                    commit,
                )
            elif (match["year"] == "<YEAR>" or match["holder"] == "<HOLDER>") and (
                assets or entries
            ):
                self.add(
                    "N1",
                    notice_path,
                    "LICENSE.md's copyright line still holds a placeholder, and the directory holds files",
                    commit,
                )
        elif assets or entries:
            self.add(
                "N1",
                notice_path,
                "the directory has no LICENSE.md, the media license's notice",
                commit,
            )
        by_file = {e.get("file"): e for e in entries if isinstance(e.get("file"), str)}
        for path in assets:
            if path.rsplit("/", 1)[-1] not in by_file:
                self.add("R2", path, "no entry in records.json names it", commit)
        for name in by_file:
            if name not in names:
                self.add(
                    "R2",
                    records_path,
                    f"an entry names {clean(name)[:80]}, which isn't in the directory",
                    commit,
                )
        if not entries:
            return
        policy = self.policy()
        for name, item in by_file.items():
            if name not in names:
                continue
            self.check_entry(
                tree, f"{directory}/{name}", item, record, policy, published, commit
            )

    def facts_of(self, path: str, data: bytes, digest: str) -> Facts | None:
        """The file's Facts: from its check in this run, or parsed now when this run didn't check it (its directory's
        record changed, not the file). None for a file of no admitted format, which the A rules refuse."""
        if digest not in self.facts:
            kind = ADMITTED.get(ext_of(path))
            if kind is None or sniff(data) != kind:
                return None
            self.facts[digest] = Facts.of(
                inspect(data, kind), kind, len(gzip.compress(data, 9, mtime=0))
            )
        return self.facts[digest]

    def check_entry(
        self,
        tree: Tree,
        path: str,
        entry: dict,
        record: Record,
        policy: Policy | None,
        published: bool,
        commit: str | None,
    ) -> None:
        data = tree.read(path) or b""
        actual = hashlib.sha256(data).hexdigest()
        if entry.get("sha256") != actual:
            self.add("R3", path, "its sha256 differs from records.json", commit)
        if entry.get("media_license") != MEDIA_LICENSE or entry.get(
            "media_license"
        ) != getattr(record, "license", None):
            self.add(
                "N2", path, "its media_license differs from the directory's", commit
            )
        facts = self.facts_of(path, data, actual)
        # M5, the mark that follows the record (spec 004, Amendment C1).
        expected = expected_term(path, entry)
        if facts and facts.term and expected and facts.term != expected:
            self.add(
                "M5",
                path,
                f"the mark is {facts.term} where files under assets/twin/ and docs/research/images/ carry "
                f"{MARK_MODEL}"
                if path.startswith(MODEL_ONLY)
                else f"the mark is {facts.term} where its record's steps call for {expected}",
                commit,
            )
        if policy is None:
            return
        for what, lid, version, commercial in licenses_of(entry):
            label = clean(f"{what}'s license {lid} {version}")
            allowed = (
                policy.licenses.get((lid, version))
                if isinstance(lid, str) and isinstance(version, str)
                else None
            )
            if allowed is None:
                self.add(
                    "L1", path, f"{label} isn't on the main branch's allowlist", commit
                )
            elif published:
                if allowed.get("research_display") != "yes":
                    self.add(
                        "L1",
                        path,
                        f"{label} doesn't read yes on research display (FR-036)",
                        commit,
                    )
            elif allowed["evaluation_only"]:
                if not commercial:
                    self.add(
                        "L2",
                        path,
                        f"{label} is evaluation-only, and the record cites no commercial license (FR-014)",
                        commit,
                    )
            elif not all(
                allowed[t] == "yes"
                for t in (
                    "display_on_site_that_promotes_the_studio",
                    "everywhere",
                    "public_distribution",
                )
            ):
                self.add(
                    "L1",
                    path,
                    f"{label} doesn't read yes on FR-013's three terms",
                    commit,
                )
        kind = entry.get("kind")
        room = room_file(path, entry)
        source = entry.get("source") if isinstance(entry.get("source"), dict) else {}
        approval = None

        def confirmed(item: dict, key: str) -> bool:
            # A room file whose record says it shows no likeness may have likeness_accepted read not_applicable;
            # the other four stay true (spec 004, Amendment C5).
            value = item["confirms"].get(key)
            return value is True or (
                value == NOT_APPLICABLE
                and key == "likeness_accepted"
                and room
                and entry.get("likeness") is False
            )

        # Every file of the twin, and of the room, needs its own approval, whatever its record says: the record is the
        # branch's, and a record calling a twin's still no likeness, from a prompt, mustn't skip the Author.
        held = (
            entry.get("likeness") is True
            or source.get("type") == "photo"
            or room
            or path.startswith("assets/twin/")
        )
        term = steps_term(entry)
        if not held and term in (MARK_HUMAN, MARK_COMPOSITE):
            # A hand-made or composite file outside those needs no approval, and the check warns that its likeness is
            # the contributor's to check: "No, let's relax that with a warning of saying it's up to the contributor to
            # check for likeness. Deprecate the heavy check." (the Author, 2026-10-30; spec 004, Amendment C1).
            made = "hand-made" if term == MARK_HUMAN else "composite"
            self.warn(
                path,
                f"its record's steps call for the {made} mark, and the file needs no approval, so it's up to the "
                "contributor to check for likeness (spec 004, Amendment C1)",
                commit,
            )
        if held:
            matches = [a for a in policy.approvals if a.get("sha256") == actual]
            good = [a for a in matches if all(confirmed(a, c) for c in CONFIRMS)]
            approval = good[0] if good else None
            if approval is None:
                why = (
                    "the approval naming this file's hash has a confirmation that isn't true"
                    if matches
                    else "no approval names this file's hash"
                )
                self.add(
                    "P1",
                    path,
                    f"it needs the Author's approval on the main branch, and {why}",
                    commit,
                )
            elif "approval" in entry and entry["approval"] != approval.get("id"):
                approval = None
                self.add(
                    "P1",
                    path,
                    "its record's approval ID isn't the one the main branch's approval of this hash carries",
                    commit,
                )
            elif room and not (
                isinstance(approval.get("room"), dict)
                and all(
                    approval["room"].get(c) is True
                    or approval["room"].get(c) == NOT_APPLICABLE
                    for c in ROOM_CONFIRMS
                )
            ):
                self.add(
                    "P2",
                    path,
                    "a room file whose approval lacks the room confirmations, each true or not_applicable "
                    "(FR-037; spec 004, Amendment C4)",
                    commit,
                )
        if path.startswith("assets/twin/"):
            lines = [
                a
                for a in policy.approvals
                if a.get("path_when_approved", "").startswith("assets/twin/")
                and isinstance(a.get("disclosure_line"), str)
                and a["disclosure_line"].strip()
            ]
            if not lines:
                self.add(
                    "P3",
                    path,
                    "a file of the twin before an approval carries the disclosure line (research R-11)",
                    commit,
                )
        caps = policy.caps
        if kind in ("avatar", "animation") and caps.get("adr_0010") != "accepted":
            self.add(
                "F1",
                path,
                f"an {kind} while caps.json says ADR 0010 isn't accepted (FR-018)",
                commit,
            )
        if room:
            self.check_room_caps(path, facts, caps["per_asset"].get("room"), commit)
            limits = {}
        else:
            limits = (
                caps["per_asset"].get(kind)
                if isinstance(caps["per_asset"].get(kind), dict)
                else {}
            )
        size = self.sizes.get(path)
        measured = {
            "bytes": len(data),
            "triangles": size.triangles if size else None,
            "texture_bytes": size.texture if size else None,
        }
        for key, cap in limits.items():
            value = measured.get(key)
            if isinstance(cap, int) and value is not None and value > cap:
                self.add(
                    "F2",
                    path,
                    f"{value:,} {key.replace('_', ' ')} over its cap of {cap:,} (FR-019)",
                    commit,
                )
        arm = entry.get("arm")
        if published and arm in ("B", "D"):
            self.check_caption(tree, path, entry, commit)

    def check_room_caps(
        self, path: str, facts: Facts | None, caps: object, commit: str | None
    ) -> None:
        """F2 for a room file (spec 004, Amendment C7): its gzip-9 size, a GLB's triangles, and, on a small prop, each
        texture's sides, against main's per_asset.room, which parse_policy has already held to its six keys."""
        if not isinstance(caps, dict):
            self.add(
                "F2",
                path,
                "a room file while the main branch's caps.json has no per_asset.room, the caps it needs "
                "(spec 004, Amendment C7)",
                commit,
            )
            return
        if facts is None:
            return
        if facts.gzip > caps["gzip_bytes"]:
            self.add(
                "F2",
                path,
                f"{facts.gzip:,} bytes at gzip level 9 over its cap of {caps['gzip_bytes']:,} (spec 004, FR-053)",
                commit,
            )
        if facts.triangles is not None and facts.triangles > caps["triangles"]:
            self.add(
                "F2",
                path,
                f"{facts.triangles:,} triangles over its cap of {caps['triangles']:,} (spec 004, FR-053)",
                commit,
            )
        stem = path.rsplit("/", 1)[-1].rsplit(".", 1)[0]
        side = caps["small_prop_texture_px"]
        if stem in caps["small_props"]:
            for i, (width, height) in enumerate(facts.sides):
                if max(width, height) > side:
                    self.add(
                        "F2",
                        path,
                        f"a small prop's texture {i}, {width} by {height} pixels, over its cap of {side} a side "
                        "(spec 004, FR-053)",
                        commit,
                    )

    def check_caption(
        self, tree: Tree, path: str, entry: dict, commit: str | None
    ) -> None:
        note = entry.get("note")
        text = tree.read(note) if isinstance(note, str) else None
        if text is None:
            self.add(
                "C1", path, "an arm B or D image whose note isn't in the tree", commit
            )
            return
        lines = text.decode("utf-8", "replace").splitlines()
        base = parent(note)
        for i, line in enumerate(lines):
            for target in re.findall(r"!?\[[^\]]*\]\(\s*<?([^)\s>]+)", line):
                resolved = os.path.normpath(f"{base}/{target}").replace(os.sep, "/")
                if resolved == path:
                    following = (
                        lines[i + 1].strip().strip("*_") if i + 1 < len(lines) else ""
                    )
                    if following == CAPTION:
                        return
        self.add(
            "C1",
            path,
            f'an arm {entry["arm"]} image whose note doesn\'t carry "{CAPTION}" on the line after its link',
            commit,
        )

    # -- changes, trees, and totals --------------------------------------------------------------
    def check_changes(
        self,
        tree: Tree,
        changed: list[str],
        deleted: list[str],
        commit: str | None,
        a9: bool,
    ) -> None:
        touched = set()
        for path in changed + deleted:
            if path.startswith(POLICY):
                if a9:
                    self.add(
                        "A9",
                        path,
                        "the branch changes assets/policy/, which changes only by the Author's hand, on main (FR-005)",
                        commit,
                    )
                continue
            if in_roots(path):
                touched.add(parent(path))
        # A warning names a file these changes add or change, not another its directory's record holds (C1).
        self.warn_for = {path for path in changed if in_roots(path)}
        try:
            for path in changed:
                self.check_file(tree, path, commit)
            for directory in sorted(touched):
                self.check_dir(tree, directory, commit)
        finally:
            self.warn_for = set()

    def check_tree(self, tree: Tree, commit: str | None) -> None:
        """Every asset directory in a tree, whole, and the first visit's total."""
        paths = [p for top in ROOTS for p in tree.under(top) if in_roots(p)]
        directories = sorted({parent(p) for p in paths})
        for path in paths:
            self.check_file(tree, path, commit)
        for directory in directories:
            self.check_dir(tree, directory, commit)
        self.first_visit_total(tree, commit)

    def first_visit_total(self, tree: Tree, commit: str | None) -> None:
        """SC-006's first visit, by transfer size: every GLB under assets/twin/ and assets/animations/, every file the
        room serves under assets/room/, image cards included (spec 004, Amendment C6), and the largest visitor
        avatar's GLBs; phase 3's budget once assets/room/ holds such a file. A directory's records.json and
        LICENSE.md aren't served, so they count for neither."""
        room_files = [
            p
            for p in tree.under(ROOM)
            if in_roots(p) and p.rsplit("/", 1)[-1] not in (RECORDS, NOTICE)
        ]
        glbs = [
            p
            for p in tree.under("assets/")
            if p.endswith(".glb") and in_roots(p) and not p.startswith(ROOM)
        ]
        if not glbs and not room_files:
            return
        policy = self.policy()
        if policy is None:
            return

        def gz(path: str) -> int:
            if path not in self.sizes:
                data = tree.read(path) or b""
                self.sizes[path] = Size(
                    path, len(data), len(gzip.compress(data, 9, mtime=0))
                )
            return self.sizes[path].gzip

        room = bool(room_files)
        total = sum(
            gz(p) for p in glbs if p.startswith(("assets/twin/", "assets/animations/"))
        ) + sum(gz(p) for p in room_files)
        visitors: dict[str, int] = {}
        for p in glbs:
            if p.startswith("assets/visitors/"):
                character = p.split("/")[2] if p.count("/") >= 3 else ""
                visitors[character] = visitors.get(character, 0) + gz(p)
        total += max(visitors.values(), default=0)
        phase = "phase3" if room else "phase2"
        budget = policy.caps["first_visit_bytes"][phase]
        self.first_visit = (phase.replace("phase", "phase "), total, budget)
        if total > budget:
            self.add(
                "F3",
                "assets/",
                f"the first visit transfers {total:,} bytes, over its {phase.replace('phase', 'phase ')} budget of {budget:,} (FR-019, SC-006)",
                commit,
            )

    def history_total(self, revs: list[str], extra: list[tuple[str, str]] = ()) -> None:
        """The distinct blobs ever stored under the asset roots (FR-020), across `revs` and any staged blobs."""
        if self.git is None:
            return
        listing = self.git.run("rev-list", "--objects", *revs) if revs else b""
        oids = {}
        for line in listing.decode("utf-8", "surrogateescape").splitlines():
            oid, _, path = line.partition(" ")
            if path and in_roots(path):
                oids[oid] = path
        for oid, path in extra:
            oids[oid] = path
        if not oids or not (self.studio or self._policy):
            return
        policy = self.policy()
        if policy is None:
            return
        total = 0
        query = "".join(f"{oid}\n" for oid in oids).encode()
        done = subprocess.run(
            [
                "git",
                "-C",
                str(self.git.repo),
                "cat-file",
                "--batch-check=%(objecttype) %(objectsize)",
            ],
            env=self.git.env,
            input=query,
            capture_output=True,
            check=False,
        )
        if done.returncode:
            self.cannot("git cat-file couldn't size the history's blobs")
            return
        for line in done.stdout.decode().splitlines():
            kind, _, size = line.partition(" ")
            if kind == "blob":
                total += int(size)
        cap = policy.caps["history_bytes"]
        self.history = (total, cap)
        if total > cap:
            self.add(
                "H1",
                "assets/",
                f"the asset and published-image blobs in the history total {total:,} bytes, over the cap of {cap:,} (FR-020)",
                None,
            )


# --------------------------------------------------------------------------------------------------
# The modes
# --------------------------------------------------------------------------------------------------
def name_status(git: Git, *args: str) -> tuple[list[str], list[str]]:
    """(added or changed, deleted) paths from a NUL-separated --name-status listing."""
    fields = [
        f.decode("utf-8", "surrogateescape") for f in git.run(*args).split(b"\0") if f
    ]
    changed, deleted = [], []
    for status, path in zip(fields[::2], fields[1::2]):
        (deleted if status.startswith("D") else changed).append(path)
    return changed, deleted


def commit_changes(
    git: Git, sha: str, parents: list[str]
) -> tuple[list[str], list[str]]:
    """What a commit adds, changes, and deletes. For a merge, only what differs from every parent: what a resolution
    brought in, or took out, rather than what either side already had."""
    if not parents:
        files = [
            f.decode("utf-8", "surrogateescape")
            for f in git.run(
                "ls-tree", "-r", "-z", "--name-only", "--full-tree", sha
            ).split(b"\0")
            if f
        ]
        return files, []
    per_parent = [
        name_status(
            git,
            "diff-tree",
            "-r",
            "-z",
            "--no-renames",
            "--no-commit-id",
            "--name-status",
            p,
            sha,
        )
        for p in parents
    ]
    changed = set(per_parent[0][0])
    deleted = set(per_parent[0][1])
    for c, d in per_parent[1:]:
        changed &= set(c)
        deleted &= set(d)
    return sorted(changed), sorted(deleted)


def resolve(git: Git, rev: str) -> str:
    rev = MAIN if rev == "main" else rev
    out = git.try_run(
        "rev-parse", "--verify", "--quiet", "--end-of-options", f"{rev}^{{commit}}"
    )
    if not out:
        raise CannotCheck(f"{clean(rev)[:80]} doesn't name a commit")
    return out.decode().strip()


def run_range(git: Git, checker: Checker, spec: str) -> None:
    if spec.count("..") != 1 or "..." in spec:
        raise CannotCheck("--range takes A..B")
    left, right = spec.split("..")
    base, tip = resolve(git, left or "HEAD"), resolve(git, right or "HEAD")
    shas = (
        git.run("rev-list", "--reverse", "--topo-order", f"{tip}", f"^{base}")
        .decode()
        .split()
    )
    walk(git, checker, shas, a9=True)
    checker.check_tree(GitTree(git, tip, tip), tip)
    revs = [tip] + (
        [MAIN] if git.try_run("rev-parse", "--verify", "--quiet", MAIN) else []
    )
    checker.history_total(revs)


def run_history(git: Git, checker: Checker) -> None:
    shas = git.run("rev-list", "--all", "--reverse", "--topo-order").decode().split()
    walk(git, checker, shas, a9=False)
    head = git.try_run("rev-parse", "--verify", "--quiet", "HEAD^{commit}")
    if head:
        sha = head.decode().strip()
        checker.check_tree(GitTree(git, sha, sha), sha)
    checker.history_total(["--all"])


def walk(git: Git, checker: Checker, shas: list[str], *, a9: bool) -> None:
    for sha in shas:
        checker.commits += 1
        parents = git.run("rev-list", "--parents", "-n", "1", sha).decode().split()[1:]
        changed, deleted = commit_changes(git, sha, parents)
        checker.check_changes(GitTree(git, sha, sha), changed, deleted, sha, a9)


def run_staged(git: Git, checker: Checker) -> None:
    head = git.try_run("rev-parse", "--verify", "--quiet", "HEAD^{commit}")
    against = (
        head.decode().strip()
        if head
        else git.run("hash-object", "-t", "tree", os.devnull).decode().strip()
    )
    changed, deleted = name_status(
        git,
        "diff-index",
        "--cached",
        "-r",
        "-z",
        "--no-renames",
        "--name-status",
        against,
    )
    branch = (git.try_run("symbolic-ref", "-q", "HEAD") or b"").decode().strip()
    index = GitTree(git, ":", None, index=True)
    checker.check_changes(index, changed, deleted, None, a9=branch != MAIN)
    staged = [p for p in changed if in_roots(p)]
    if staged:
        checker.first_visit_total(index, None)
        items = index.items()
        extra = [
            (items[p].oid or "", p) for p in staged if items.get(p) and items[p].oid
        ]
        revs = ([head.decode().strip()] if head else []) + (
            [MAIN] if git.try_run("rev-parse", "--verify", "--quiet", MAIN) else []
        )
        checker.history_total(revs, extra)


def run_paths(top: Path, checker: Checker, names: list[str]) -> None:
    rels = []
    for name in names:
        full = Path(os.path.abspath(name))
        try:
            rel = full.relative_to(top).as_posix()
        except ValueError:
            raise CannotCheck("a named path is outside the repository") from None
        if not (full.is_file() or full.is_symlink()):
            raise CannotCheck(f"{clean(rel)[:120]} isn't a file")
        rels.append(rel)
    tree = DiskTree(top, rels)
    checker.check_changes(tree, rels, [], None, a9=False)


# --------------------------------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------------------------------
def report(checker: Checker) -> str:
    lines = [f.render() for f in checker.findings + checker.warnings]
    rows = [s for s in checker.sizes.values() if in_roots(s.path)]
    if rows:
        width = max(36, max(len(s.path) for s in rows) + 2)
        lines.append(
            f"{'file':<{width}}{'bytes':<10}{'gzip':<10}{'vertices':<10}{'triangles':<11}texture"
        )

        def cell(value: int | None, size: int) -> str:
            return f"{'-' if value is None else value:<{size}}"

        for s in sorted(rows, key=lambda r: r.path):
            lines.append(
                clean(
                    f"{s.path:<{width}}{s.size:<10}{s.gzip:<10}{cell(s.vertices, 10)}{cell(s.triangles, 11)}{'-' if s.texture is None else s.texture}"
                )
            )
    totals = []
    if checker.first_visit:
        phase, total, budget = checker.first_visit
        totals.append(f"first visit ({phase}): {total:,} of {budget:,} bytes")
    if checker.history:
        total, cap = checker.history
        totals.append(f"history: {total:,} of {cap:,} bytes")
    if totals:
        lines.append(" · ".join(totals))
    for reason in checker.reasons:
        lines.append(clean(f"arrival-check: can't check: {reason}"))
    commits = (
        f" ({checker.commits} commit{'s' if checker.commits != 1 else ''})"
        if checker.commits
        else ""
    )
    count = len(checker.findings)
    warned = len(checker.warnings)
    warnings = f", {warned} warning{'s' if warned != 1 else ''}" if warned else ""
    lines.append(
        f"arrival-check: {count} finding{'s' if count != 1 else ''} in {checker.files_checked} file{'s' if checker.files_checked != 1 else ''}{commits}{warnings}"
    )
    return "\n".join(lines)


def exit_code(checker: Checker) -> int:
    return 2 if checker.reasons else 1 if checker.findings else 0


def toplevel(repo: str | None, env: dict[str, str] | None = None) -> Path:
    where = Path(repo) if repo else Path.cwd()
    try:
        done = subprocess.run(
            ["git", "-C", str(where), "rev-parse", "--show-toplevel"],
            env=env,
            capture_output=True,
            check=False,
        )
    except OSError:
        raise CannotCheck("git couldn't run") from None
    if done.returncode:
        raise CannotCheck("not inside a git work tree")
    return Path(done.stdout.decode().strip()).resolve()


def check(argv: list[str], env: dict[str, str] | None = None) -> Checker:
    """Run one invocation and return its checker, with findings and any reason it couldn't check. `env` is git's
    environment: the caller's own by default; the history scan before the first push passes its scrubbed one."""
    parser = argparse.ArgumentParser(
        description="The arrival check (spec 003): every studio file before any commit."
    )
    parser.add_argument(
        "--repo",
        help="the repository to check (default: the one holding the working directory)",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--staged", action="store_true", help="the files in the index")
    mode.add_argument(
        "--range", metavar="A..B", help="each commit in A..B, then B's whole tree"
    )
    mode.add_argument(
        "--history", action="store_true", help="every commit reachable from any ref"
    )
    parser.add_argument("paths", nargs="*", help="files on disk")
    args = parser.parse_args(argv)
    checker = Checker(None)
    try:
        top = toplevel(args.repo, env)
        git = Git(top, env)
        checker.git = git
        try:
            if args.staged:
                run_staged(git, checker)
            elif args.range:
                run_range(git, checker, args.range)
            elif args.history:
                run_history(git, checker)
            elif args.paths:
                run_paths(top, checker, args.paths)
            else:
                raise CannotCheck(
                    "nothing to check: give --staged, --range A..B, --history, or paths"
                )
        finally:
            git.close()
    except CannotCheck as exc:
        checker.cannot(str(exc))
    return checker


def main(argv: list[str] | None = None) -> int:
    try:
        checker = check(sys.argv[1:] if argv is None else argv)
    except Exception as exc:  # noqa: BLE001 (a crash must read as can't check, exit 2, never as a pass)
        print(
            f"arrival-check: can't check: the check itself failed ({exc.__class__.__name__})"
        )
        return 2
    print(report(checker))
    return exit_code(checker)


if __name__ == "__main__":
    sys.exit(main())
