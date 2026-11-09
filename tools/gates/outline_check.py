#!/usr/bin/env -S python3 -I -B -X pycache_prefix=/dev/null
"""The outline check (spec 004 FR-024, FR-025, FR-032, FR-052, SC-013; contracts/intake-amendments.md §10; R-56).

    tools/gates/outline_check.py --from-svg <trace>.svg --sign <id> --words <words> --source-type photo
        --source-id <opaque id> --tool-name <name> --tool-version <version> --tool-license <id>
        --cap-height <n> [--advance <n>] [--intent-ref intent-<NNN>]
    tools/gates/outline_check.py <sign>.outline.json

The Author runs it in the Author's own terminal, with the working folder inside the photos folder, calling this file
in main's checkout directly, never through make; its first line and the guard below give it PY_HOST's flags. It is
the only code from this repository that runs there, on data traced from a photo, so agents can't change it (ADR 0017).
It reads only the files it is given: no network, and no repository. Standard library only.

--from-svg writes <sign>.outline.json in the working folder from the local tracing tool's SVG: each <path>'s d, in
document order, and the root's viewBox, and nothing else; it says how many other elements it left behind, and how
many of them were images, never what they held. It copies only what the Author sees drawn in the tracing tool, so it
refuses, counting each kind (T041's review, part 2, I-4): a path under a transform, by attribute or style (it doesn't
apply transforms: export with them applied); a path under defs, clipPath, mask, symbol, pattern, marker, metadata,
switch, foreignObject, or a foreign element; a hidden element (display, visibility, or opacity), or what sits under
one; a use or a nested svg; a style with the transform property (text-transform and transform-origin aren't one); a
style element that can hide, clip, or bring in what it draws; a clip or a mask; and a path its paint leaves undrawn,
with no fill (none, transparent, or fill-opacity 0) and no stroke, since the outline keeps only its d and would draw
it (T041's re-review). It reads only a regular file of at most MAX_SVG_BYTES, in UTF-8 with no byte-order mark, no other
declared encoding, no document type declaration or processing instruction, and elements nested at most MAX_DEPTH deep.
It refuses an output name with a folder in it or outside the room's ID grammar. The file is UTF-8 JSON with LF line
ends, two-space indents, the schema's field order, and a final newline, so the same inputs give the same bytes; a write
that fails leaves no temporary file. Then it checks the file, as the second form does. Every refusal exits 2 with
nothing written.

The rules, O1 to O10 (contracts/intake-amendments.md §10; data-model.md §6.2):
  O1  not a regular file, not UTF-8, not strict JSON (a duplicate key, NaN, Infinity, a byte-order mark, trailing
      data), or not an object
  O2  a key outside the schema, at any level, or a required key missing
  O3  schema, view_box, cap_height, or advance of the wrong type or out of range
  O4  sign outside the ID grammar, or a file not named <sign>.outline.json
  O5  words empty, longer than 200 characters, or holding a control character
  O6  intent_ref not intent-NNN
  O7  source.type other than photo or design; source.id not opaque, holding a camera file stem or a date finer than a
      day
  O8  a tool field empty, longer than 64 characters, or not printable
  O9  paths empty, more than 512, more than 262,144 characters in all, or an entry that isn't SVG path data
  O10 a string outside paths holding href, data:, url(, a run of 40 or more base64 characters, a slash or a
      backslash, a file extension, a camera file stem, or a date-time finer than a day

Output: one line per finding, `<rule> <file name>: <reason>`, then `outline-check: PASS: <file name>, <n> paths,
sha256 <64 hex>` or `outline-check: <n> findings`. It never prints a value from the file, from the SVG, or from the
folder, and never a path. Exit 0 PASS; 1 findings; 2 a file or the SVG it can't read, or a usage error.
"""

from __future__ import annotations

import os
import sys

# PY_HOST's flags (spec 000 plan §4; research.md R-35), before anything else is imported. The first line sets them; a
# bare `python3 tools/gates/outline_check.py` starts again with them, so neither PYTHONPATH nor a planted __pycache__
# in the photos folder reaches it. Imported (its tests), it runs nothing.
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
import contextlib
import hashlib
import json
import math
import re
import stat
import tempfile
import unicodedata
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.parsers import expat

# --------------------------------------------------------------------------------------------------
# The schema (data-model.md §6.2) and this contract's bounds, which change only by the Author's patch
# --------------------------------------------------------------------------------------------------
FIELDS = (
    "schema",
    "sign",
    "words",
    "intent_ref",
    "source",
    "tool",
    "view_box",
    "cap_height",
    "advance",
    "paths",
)
REQUIRED = tuple(f for f in FIELDS if f != "advance")
SOURCE_FIELDS = ("type", "id")
TOOL_FIELDS = ("name", "version", "license")
MAX_PATHS = 512
MAX_PATH_CHARS = 262_144
MAX_WORDS = 200
MAX_TOOL = 64
SUFFIX = ".outline.json"

SIGN = re.compile(r"[a-z][a-z0-9-]{1,40}")
INTENT = re.compile(r"intent-\d{3}")
OPAQUE = re.compile(r"[A-Za-z0-9-]{3,40}")
# Spec 003's camera and phone file stems (its arrival check's M8 list): IMG_, PXL_, MVIMG_, DSC and DSCN,
# Screenshot, WhatsApp's IMG-YYYYMMDD-WA, and Samsung's YYYYMMDD_HHMMSS.
CAMERA_STEM = re.compile(
    r"(?i)(?<![a-z0-9])(?:img_|img-\d{8}-wa|pxl_|mvimg_|dscn?(?=[_\d])|screenshot)"
    r"|(?<!\d)(?:19|20)\d{6}_\d{6}(?!\d)"
)
# A time of day, as spec 003's R5 reads one, or a date run on into an hour and a minute.
DATE_TIME = re.compile(
    r"\d{1,2}:\d{2}|(?<!\d)(?:19|20)\d{2}-?[01]\d-?[0-3]\d[T_ \-]?[0-2]\d[:\-]?[0-5]\d"
)
LINKISH = re.compile(r"(?i)href|data:|url\(")
# Base64's own alphabet: a hyphenated ID, which the grammars allow up to 40 or 41 characters, isn't a blob.
BASE64_RUN = re.compile(r"[A-Za-z0-9+/=]{40,}")
EXTENSION = re.compile(r"\.[A-Za-z]{1,5}(?![A-Za-z])")
# SVG path data: the commands, numbers, commas, and white space.
PATH_TOKEN = re.compile(
    r"\s+|,|[MmLlHhVvCcSsQqTtAaZz]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?"
)
SVG_NS = "{http://www.w3.org/2000/svg}"
# The SVG the conversion reads (T041's review, part 2, nits 2 and 3). 16 MiB holds a trace of a sign with the photo it
# was traced over still embedded, as the tracing tool keeps it: a phone's 12-megapixel JPEG, 3 to 8 MB, is 4 to 11 MB
# as base64. The outline's own paths are capped at 262,144 characters (O9), so nothing a valid outline needs comes
# near it, and a larger file is refused before it is read into memory. Real traces nest a few levels deep.
MAX_SVG_BYTES = 16 * 1024 * 1024
MAX_DEPTH = 256
TOO_LARGE = (
    f"the SVG is larger than {MAX_SVG_BYTES:,} bytes; in the tracing tool, delete the embedded photo, and any hidden"
    " layer, before saving"
)
XML_ENCODING = re.compile(r"""<\?xml\s[^>]*?\bencoding\s*=\s*["']([^"']*)["']""")
DTD = "the SVG has a document type declaration, which the check doesn't read; export a plain SVG"
# What the tracing tool doesn't draw where it stands: a path under one of these, or under a foreign element, is refused.
UNSEEN = frozenset(
    (
        "defs",
        "clipPath",
        "mask",
        "symbol",
        "pattern",
        "marker",
        "metadata",
        "switch",
        "foreignObject",
    )
)
# A style element that can hide, clip, or bring in what it draws (a transform is counted on its own).
STYLE_ELEMENT = re.compile(
    r"(?i)display|visibility|opacity|clip|mask|@import|\\"
    r"|(?<![\w-])fill\s*:\s*(?:none|transparent)"
)
# A transform in a style sheet: the property itself, never text-transform or transform-origin (T041's re-review).
SHEET_TRANSFORM = re.compile(r"(?i)(?<![\w-])transform\s*:")
# The paint SVG's paths inherit, and its initial values: a path is drawn with a fill of black and no stroke.
PAINT = ("fill", "fill-opacity", "stroke", "stroke-opacity", "stroke-width")
INITIAL_PAINT = {
    "fill": "black",
    "fill-opacity": "1",
    "stroke": "none",
    "stroke-opacity": "1",
    "stroke-width": "1",
}
LEADING_NUMBER = re.compile(r"\s*([+-]?(?:\d+\.?\d*|\.\d+))")


def _plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


# Each refusal of the conversion, by its count alone, in the report's order.
REFUSALS = {
    "unseen path": lambda n: (
        _plural(n, "path", "paths")
        + " under defs, clipPath, mask, symbol, pattern, marker, metadata, switch, foreignObject, or a foreign element"
    ),
    "transformed path": lambda n: (
        _plural(n, "path", "paths")
        + " under a transform, which the check doesn't apply (export with transforms applied)"
    ),
    "root transform": lambda n: (
        _plural(n, "transform", "transforms")
        + " on the svg element, which the check doesn't apply"
    ),
    "hidden": lambda n: (
        _plural(n, "hidden element", "hidden elements")
        + " (display, visibility, or opacity), or what sits under one"
    ),
    "use": lambda n: _plural(n, "use or nested svg", "uses or nested svg elements"),
    "style transform": lambda n: _plural(
        n, "style with a transform", "styles with a transform"
    ),
    "style": lambda n: (
        _plural(n, "style", "styles")
        + " that can hide, clip, or bring in what it draws, or that the check can't read"
    ),
    "clipped": lambda n: _plural(n, "clip or mask", "clips or masks"),
    "unpainted": lambda n: (
        _plural(n, "path", "paths")
        + " its paint leaves undrawn: no fill (none, transparent, or fill-opacity 0) and no stroke (none, absent,"
        " transparent, of opacity 0, or of width 0)"
    ),
}


class CannotRead(Exception):
    """Exit 2: a file or the SVG it can't read, or an output it won't write; the reason names no value."""


# --------------------------------------------------------------------------------------------------
# Strict JSON (O1)
# --------------------------------------------------------------------------------------------------
def _pairs(pairs: list[tuple[str, object]]) -> dict:
    out: dict = {}
    for key, value in pairs:
        if key in out:
            raise ValueError("a duplicate key")
        out[key] = value
    return out


def _constant(name: str) -> object:
    raise ValueError("NaN or Infinity")


def strict_json(data: bytes) -> object:
    if data.startswith(b"\xef\xbb\xbf"):
        raise ValueError("a byte-order mark")
    text = data.decode("utf-8")
    return json.loads(text, object_pairs_hook=_pairs, parse_constant=_constant)


# --------------------------------------------------------------------------------------------------
# The rules
# --------------------------------------------------------------------------------------------------
def number(value: object) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def path_data(text: str) -> bool:
    """SVG path data: only commands, finite numbers, commas, and white space, starting with a moveto."""
    pos, first = 0, None
    while pos < len(text):
        match = PATH_TOKEN.match(text, pos)
        if not match:
            return False
        token = match.group()
        pos = match.end()
        if token.strip(" \t\r\n,") == "":
            continue
        if first is None:
            first = token
        if token[0] not in "MmLlHhVvCcSsQqTtAaZz" and not math.isfinite(float(token)):
            return False
    return first is not None and first in "Mm"


def strings_outside_paths(doc: dict) -> list[tuple[str, str]]:
    """(field, value) for each string O10 reads: every string field but paths."""
    found = []
    for key in ("sign", "words", "intent_ref"):
        if isinstance(doc.get(key), str):
            found.append((key, doc[key]))
    for parent, fields in (("source", SOURCE_FIELDS), ("tool", TOOL_FIELDS)):
        part = doc.get(parent)
        if isinstance(part, dict):
            for key in fields:
                if isinstance(part.get(key), str):
                    found.append((f"{parent}.{key}", part[key]))
    return found


def o10_problem(value: str) -> str | None:
    if LINKISH.search(value):
        return "a link (href, data:, or url()"
    if BASE64_RUN.search(value):
        return "a run of 40 or more base64 characters"
    if "/" in value or "\\" in value:
        return "a slash or a backslash"
    if EXTENSION.search(value):
        return "a file extension"
    if CAMERA_STEM.search(value):
        return "a camera file stem"
    if DATE_TIME.search(value):
        return "a date-time finer than a day"
    return None


def findings(name: str, data: bytes | None) -> list[tuple[str, str]]:
    """(rule, reason) for a file's name and bytes; None bytes for a file that isn't a regular file (O1)."""
    if data is None:
        return [("O1", "it isn't a regular file")]
    try:
        doc = strict_json(data)
    except UnicodeDecodeError:
        return [("O1", "it isn't UTF-8")]
    except (ValueError, RecursionError) as exc:
        why = (
            str(exc)
            if str(exc) in ("a duplicate key", "NaN or Infinity", "a byte-order mark")
            else None
        )
        return [("O1", f"it isn't strict JSON{f': {why}' if why else ''}")]
    if not isinstance(doc, dict):
        return [("O1", "it isn't a JSON object")]
    out: list[tuple[str, str]] = []

    # O2: the schema's keys, at every level.
    def keys(
        item: dict, allowed: tuple[str, ...], required: tuple[str, ...], where: str
    ) -> None:
        unknown = [k for k in item if k not in allowed]
        missing = [k for k in required if k not in item]
        if unknown:
            out.append(
                ("O2", f"{where} holds {len(unknown)} key(s) outside the schema")
            )
        if missing:
            out.append(("O2", f"{where} lacks {', '.join(missing)}"))

    keys(doc, FIELDS, REQUIRED, "the file")
    for parent, fields in (("source", SOURCE_FIELDS), ("tool", TOOL_FIELDS)):
        if isinstance(doc.get(parent), dict):
            keys(doc[parent], fields, fields, parent)

    # O3: the numbers.
    if "schema" in doc and (doc["schema"] != 1 or isinstance(doc["schema"], bool)):
        out.append(("O3", "schema isn't 1"))
    box = doc.get("view_box")
    good_box = (
        isinstance(box, list)
        and len(box) == 4
        and all(number(v) for v in box)
        and box[2] > 0
        and box[3] > 0
    )
    if "view_box" in doc and not good_box:
        out.append(
            (
                "O3",
                "view_box isn't four finite numbers with a width and a height above 0",
            )
        )
    if "cap_height" in doc:
        cap = doc["cap_height"]
        if not number(cap) or cap <= 0 or (good_box and cap > box[3]):
            out.append(
                (
                    "O3",
                    "cap_height isn't a finite number above 0, at most the view box's height",
                )
            )
    if "advance" in doc:
        advance = doc["advance"]
        if not number(advance) or advance <= 0 or (good_box and advance > box[2]):
            out.append(
                (
                    "O3",
                    "advance isn't a finite number above 0, at most the view box's width",
                )
            )

    # O4: the sign and the file's name.
    sign = doc.get("sign")
    if "sign" in doc and not (isinstance(sign, str) and SIGN.fullmatch(sign)):
        out.append(("O4", "sign isn't a piece ID (^[a-z][a-z0-9-]{1,40}$)"))
    elif isinstance(sign, str) and name != f"{sign}{SUFFIX}":
        out.append(("O4", f"the file isn't named after its sign, <sign>{SUFFIX}"))

    # O5: the words.
    if "words" in doc:
        words = doc["words"]
        if not isinstance(words, str) or not words:
            out.append(("O5", "words isn't text"))
        elif len(words) > MAX_WORDS:
            out.append(("O5", f"words is longer than {MAX_WORDS} characters"))
        elif any(
            unicodedata.category(c).startswith("C")
            or unicodedata.category(c) in ("Zl", "Zp")
            for c in words
        ):
            out.append(("O5", "words holds a control character"))

    # O6: the intent.
    if "intent_ref" in doc and not (
        isinstance(doc["intent_ref"], str) and INTENT.fullmatch(doc["intent_ref"])
    ):
        out.append(("O6", "intent_ref isn't intent-NNN"))

    # O7: the source.
    source = doc.get("source")
    if "source" in doc and not isinstance(source, dict):
        out.append(("O7", "source isn't an object"))
    elif isinstance(source, dict):
        if "type" in source and source["type"] not in ("photo", "design"):
            out.append(("O7", "source.type isn't photo or design"))
        if "id" in source:
            sid = source["id"]
            if not (isinstance(sid, str) and OPAQUE.fullmatch(sid)):
                out.append(("O7", "source.id isn't an opaque ID ([A-Za-z0-9-]{3,40})"))
            elif CAMERA_STEM.search(sid):
                out.append(("O7", "source.id holds a camera file stem"))
            elif DATE_TIME.search(sid):
                out.append(("O7", "source.id holds a date finer than a day"))

    # O8: the tool.
    tool = doc.get("tool")
    if "tool" in doc and not isinstance(tool, dict):
        out.append(("O8", "tool isn't an object"))
    elif isinstance(tool, dict):
        for key in TOOL_FIELDS:
            if key not in tool:
                continue
            value = tool[key]
            if not isinstance(value, str) or not value:
                out.append(("O8", f"tool.{key} isn't text"))
            elif len(value) > MAX_TOOL:
                out.append(("O8", f"tool.{key} is longer than {MAX_TOOL} characters"))
            elif not value.isprintable():
                out.append(("O8", f"tool.{key} isn't printable"))

    # O9: the paths.
    if "paths" in doc:
        paths = doc["paths"]
        if not isinstance(paths, list) or not paths:
            out.append(("O9", "paths isn't a list of at least one path"))
        elif len(paths) > MAX_PATHS:
            out.append(("O9", f"paths holds more than {MAX_PATHS} paths"))
        elif not all(isinstance(p, str) for p in paths):
            out.append(("O9", "a path isn't text"))
        elif sum(map(len, paths)) > MAX_PATH_CHARS:
            out.append(
                ("O9", f"paths hold more than {MAX_PATH_CHARS:,} characters in all")
            )
        else:
            bad = [i for i, p in enumerate(paths) if not path_data(p)]
            if bad:
                out.append(
                    (
                        "O9",
                        (
                            f"paths[{bad[0]}] isn't SVG path data (commands, finite numbers, commas, and white space, "
                            f"starting with a moveto){f', and {len(bad) - 1} more' if len(bad) > 1 else ''}"
                        ),
                    )
                )

    # O10: every other string.
    for where, value in strings_outside_paths(doc):
        problem = o10_problem(value)
        if problem:
            out.append(("O10", f"{where} holds {problem}"))
    return out


def shown(name: str) -> str:
    """A file name as the output shows it: printable, at most 120 characters."""
    return "".join(c if c.isprintable() else "?" for c in name)[:120]


def check(path: Path) -> int:
    """Check one outline file, print the findings and the summary, and return the exit code."""
    name = path.name
    try:
        mode = os.lstat(path).st_mode
    except OSError:
        raise CannotRead(f"{shown(name)} can't be read") from None
    data = None
    if stat.S_ISREG(mode):
        try:
            data = path.read_bytes()
        except OSError:
            raise CannotRead(f"{shown(name)} can't be read") from None
    found = findings(name, data)
    for rule, reason in found:
        print(f"{rule} {shown(name)}: {reason}")
    if found:
        print(f"outline-check: {len(found)} findings")
        return 1
    count = len(json.loads(data)["paths"])
    print(
        f"outline-check: PASS: {shown(name)}, {count} path{'s' if count != 1 else ''}, "
        f"sha256 {hashlib.sha256(data).hexdigest()}"
    )
    return 0


# --------------------------------------------------------------------------------------------------
# --from-svg
# --------------------------------------------------------------------------------------------------
def figure(text: str) -> int | float:
    """A number as the command line or the SVG writes it: an int when it has no fraction, so the bytes stay the same."""
    value = float(text)
    if not math.isfinite(value):
        raise ValueError("not finite")
    return (
        int(value)
        if value == int(value) and re.fullmatch(r"[+-]?\d+(?:\.0*)?", text.strip())
        else value
    )


def local(tag: object) -> str | None:
    """An SVG element's name without the namespace; None for any other namespace's element, or none, which is foreign."""
    if isinstance(tag, str) and tag.startswith(SVG_NS):
        return tag[len(SVG_NS) :]
    return None


def read_svg(svg: Path) -> bytes:
    """The SVG's bytes: a regular file, never a link, a FIFO, or a device, of at most MAX_SVG_BYTES."""
    try:
        if not stat.S_ISREG(os.lstat(svg).st_mode):
            raise CannotRead("the SVG isn't a regular file")
        flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC
        handle = os.open(svg, flags)
    except OSError:
        raise CannotRead("the SVG can't be read") from None
    try:
        info = os.fstat(handle)
        if not stat.S_ISREG(info.st_mode):
            raise CannotRead("the SVG isn't a regular file")
        if info.st_size > MAX_SVG_BYTES:
            raise CannotRead(TOO_LARGE)
        chunks, size = [], 0
        while chunk := os.read(handle, 1 << 20):
            size += len(chunk)
            if size > MAX_SVG_BYTES:
                raise CannotRead(TOO_LARGE)
            chunks.append(chunk)
        return b"".join(chunks)
    except OSError:
        raise CannotRead("the SVG can't be read") from None
    finally:
        os.close(handle)


def _refuse(why: str):
    def handler(*_: object) -> None:
        raise CannotRead(why)

    return handler


def plain_xml(data: bytes) -> None:
    """Refuse what the conversion doesn't read (T041's review, part 2, nit 1): a byte-order mark, bytes that aren't
    UTF-8, a NUL, a declared encoding other than UTF-8, a document type declaration or an entity however it is
    encoded, a processing instruction (an xml-stylesheet among them), or elements nested deeper than MAX_DEPTH. Expat
    reads it as UTF-8 whatever it declares, and never reads a parameter entity."""
    if data.startswith(
        (b"\xef\xbb\xbf", b"\xff\xfe", b"\xfe\xff", b"\x00\x00\xfe\xff")
    ):
        raise CannotRead(
            "the SVG starts with a byte-order mark; export it as UTF-8 without one"
        )
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        raise CannotRead("the SVG isn't UTF-8; export it as UTF-8") from None
    if "\x00" in text:
        raise CannotRead("the SVG holds a NUL, as UTF-16 does; export it as UTF-8")
    declared = XML_ENCODING.match(text)
    if declared and declared.group(1).lower() not in ("utf-8", "utf8"):
        raise CannotRead(
            "the SVG declares an encoding other than UTF-8; export it as UTF-8"
        )
    if "<!DOCTYPE" in text or "<!ENTITY" in text:
        raise CannotRead(DTD)
    parser = expat.ParserCreate("UTF-8")
    parser.SetParamEntityParsing(expat.XML_PARAM_ENTITY_PARSING_NEVER)
    parser.StartDoctypeDeclHandler = _refuse(DTD)
    parser.EntityDeclHandler = _refuse(DTD)
    parser.UnparsedEntityDeclHandler = _refuse(DTD)
    parser.NotationDeclHandler = _refuse(DTD)
    parser.ExternalEntityRefHandler = _refuse(DTD)
    parser.ProcessingInstructionHandler = _refuse(
        "the SVG holds a processing instruction, which the check doesn't read; export a plain SVG"
    )
    depth = 0

    def start(*_: object) -> None:
        nonlocal depth
        depth += 1
        if depth > MAX_DEPTH:
            raise CannotRead(f"the SVG nests elements deeper than {MAX_DEPTH}")

    def end(*_: object) -> None:
        nonlocal depth
        depth -= 1

    parser.StartElementHandler = start
    parser.EndElementHandler = end
    try:
        parser.Parse(data, True)
    except expat.ExpatError:
        raise CannotRead("the SVG isn't well-formed XML") from None


def uncomment(css: str) -> str | None:
    """CSS without its comments, in linear time; None when a comment isn't closed."""
    out, pos = [], 0
    while (start := css.find("/*", pos)) >= 0:
        end = css.find("*/", start + 2)
        if end < 0:
            return None
        out.append(css[pos:start])
        pos = end + 2
    out.append(css[pos:])
    return "".join(out)


def declarations(style: str) -> list[tuple[str, str]]:
    """A style attribute's (property, value) pairs, lower-cased, !important set aside; its comments already gone."""
    out = []
    for part in style.split(";"):
        name, colon, value = part.partition(":")
        if colon:
            value = value.lower().replace("!important", "").strip()
            out.append((name.strip().lower(), value))
    return out


def zero(value: str | None) -> bool:
    try:
        return value is not None and float(value.strip().rstrip("%")) == 0
    except ValueError:
        return False


def hidden(element: ET.Element, styles: list[tuple[str, str]]) -> bool:
    """Hidden by an attribute or by its style: display none, visibility hidden or collapse, or opacity 0."""
    shown = {name: value for name, value in styles}
    display = shown.get("display", (element.get("display") or "").strip().lower())
    visibility = shown.get(
        "visibility", (element.get("visibility") or "").strip().lower()
    )
    opacity = shown.get("opacity", element.get("opacity"))
    return display == "none" or visibility in ("hidden", "collapse") or zero(opacity)


def clipped(element: ET.Element, styles: list[tuple[str, str]]) -> bool:
    """Clipped or masked, by an attribute or by its style, so the tool draws only part of what it holds."""
    for name in ("clip-path", "mask"):
        value = element.get(name)
        if value is not None and value.strip().lower() != "none":
            return True
    return any(
        name in ("clip-path", "mask") and value != "none" for name, value in styles
    )


def _zero(value: str) -> bool:
    """A number that reads 0 before any unit: "0", "0.0", "0px", "0%"."""
    match = LEADING_NUMBER.match(value)
    return bool(match) and float(match.group(1)) == 0


def paint(element: ET.Element, styles: list[tuple[str, str]], parent: dict) -> dict:
    """The element's fill and stroke, inherited from its parent, then its attributes, then its style."""
    out = dict(parent)
    own = {name: (element.get(name) or "").strip().lower() for name in PAINT}
    own.update((name, value) for name, value in styles if name in PAINT)
    for name, value in own.items():
        if value and value != "inherit":
            out[name] = value
    return out


def drawn(paint_of: dict) -> bool:
    """Whether a path's paint draws it: a fill, or a stroke, that shows."""
    fill = paint_of["fill"] not in ("none", "transparent") and not _zero(
        paint_of["fill-opacity"]
    )
    stroke = (
        paint_of["stroke"] not in ("none", "transparent")
        and not _zero(paint_of["stroke-opacity"])
        and not _zero(paint_of["stroke-width"])
    )
    return fill or stroke


def from_svg(svg: Path) -> tuple[list[int | float], list[str], int, int]:
    """The root's viewBox, each path's d in document order, how many other elements were left behind, and how many of
    those were images. CannotRead for an SVG it can't read, or one holding what the Author can't see in the tracing
    tool as it will be copied (T041's review, part 2, I-4): a path under a transform, under defs, clipPath, mask,
    symbol, pattern, marker, metadata, switch, or foreignObject, or under a foreign element; a hidden element, or one
    under it; a use or a nested svg; a style with the transform property; a path its paint leaves undrawn; a style
    element that can hide or move what it draws; and a clip or a mask. Each is counted, and the report names the
    counts alone."""
    data = read_svg(svg)
    plain_xml(data)
    try:
        builder = ET.XMLParser(encoding="utf-8")
        builder.feed(data)
        root = builder.close()
    except (ET.ParseError, ValueError):
        raise CannotRead("the SVG isn't well-formed XML") from None
    if local(root.tag) != "svg":
        raise CannotRead("the file's root isn't an svg element")
    parts = re.split(r"[\s,]+", (root.get("viewBox") or "").strip())
    try:
        view_box = [figure(p) for p in parts] if len(parts) == 4 else []
    except ValueError:
        view_box = []
    if len(view_box) != 4:
        raise CannotRead("the SVG's root has no viewBox of four numbers")
    paths: list[str] = []
    other = images = 0
    counts = dict.fromkeys(REFUSALS, 0)
    # Iteratively, in document order: (element, under a transform, under what the tool doesn't draw, is the root, the
    # paint it inherits).
    stack: list[tuple[ET.Element, bool, bool, bool, dict]] = [
        (root, False, False, True, INITIAL_PAINT)
    ]
    while stack:
        element, transformed, unseen, is_root, inherited = stack.pop()
        kind = local(element.tag)
        raw = element.get("style") or ""
        style = uncomment(raw)
        if style is None or "\\" in raw:
            counts["style"] += 1
        styles = declarations(style or "")
        sheet = "".join(element.itertext()) if kind == "style" else ""
        readable = uncomment(sheet) if sheet else ""
        if readable is None or STYLE_ELEMENT.search(readable):
            counts["style"] += 1
        # The transform property alone, parsed, never text-transform or transform-origin (T041's re-review, part 2).
        moved = any(name == "transform" for name, _ in styles) or bool(
            SHEET_TRANSFORM.search(readable if readable is not None else sheet)
        )
        if moved:
            counts["style transform"] += 1
        if hidden(element, styles):
            counts["hidden"] += 1
        if clipped(element, styles):
            counts["clipped"] += 1
        if kind == "use" or (kind == "svg" and not is_root):
            counts["use"] += 1
        under = transformed or moved or element.get("transform") is not None
        painted = paint(element, styles, inherited)
        if kind == "path" and element.get("d") is not None:
            if unseen:
                counts["unseen path"] += 1
            elif under:
                counts["transformed path"] += 1
            elif not drawn(painted):
                counts["unpainted"] += 1
            else:
                paths.append(element.get("d"))
        elif is_root:
            if under:
                counts["root transform"] += 1
        else:
            other += 1
            images += kind == "image"
        below = unseen or kind is None or kind in UNSEEN
        stack.extend(
            (child, under, below, False, painted) for child in reversed(element)
        )
    found = [REFUSALS[key](n) for key, n in counts.items() if n]
    if found:
        raise CannotRead(
            "the SVG holds what the Author can't see in the tracing tool as it would be copied, so nothing was "
            f"written: {'; '.join(found)}"
        )
    return view_box, paths, other, images


def write_outline(folder: Path, doc: dict, name: str) -> Path:
    """The file, UTF-8 with LF line ends, two-space indents, the schema's field order, and a final newline. A write that
    fails leaves no temporary file, and its reason names no path (T041's review, part 2, nit 2)."""
    text = (
        json.dumps(
            {k: doc[k] for k in FIELDS if k in doc}, indent=2, ensure_ascii=False
        )
        + "\n"
    )
    try:
        data = text.encode("utf-8")
    except UnicodeEncodeError:
        raise CannotRead(
            "a value given on the command line isn't text UTF-8 can hold"
        ) from None
    target = folder / name
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=folder, prefix=".outline-", suffix=".tmp", delete=False
        ) as tmp:
            temporary = tmp.name
            tmp.write(data)
        os.chmod(temporary, 0o644)
        os.replace(temporary, target)
        temporary = None
    except OSError:
        raise CannotRead("the outline can't be written in the working folder") from None
    finally:
        if temporary is not None:
            with contextlib.suppress(OSError):
                os.unlink(temporary)
    return target


# --------------------------------------------------------------------------------------------------
# The command line
# --------------------------------------------------------------------------------------------------
class Parser(argparse.ArgumentParser):
    """argparse, but a usage error names no value the Author typed."""

    def error(self, message: str) -> None:  # type: ignore[override]
        print("outline-check: can't read the command line; see --help", file=sys.stderr)
        raise SystemExit(2)


def main(argv: list[str] | None = None) -> int:
    parser = Parser(
        description="The outline check (spec 004, FR-032): run it inside the photos folder."
    )
    parser.add_argument("file", nargs="?", help="<sign>.outline.json, to check")
    parser.add_argument(
        "--from-svg", metavar="SVG", help="the tracing tool's SVG, to convert and check"
    )
    for option in (
        "--sign",
        "--words",
        "--source-type",
        "--source-id",
        "--tool-name",
        "--tool-version",
        "--tool-license",
        "--cap-height",
        "--advance",
        "--intent-ref",
    ):
        parser.add_argument(option)
    args = parser.parse_args(argv)
    try:
        if args.from_svg is None:
            if args.file is None:
                parser.error("a file")
            return check(Path(args.file))
        needed = (
            "sign",
            "words",
            "source_type",
            "source_id",
            "tool_name",
            "tool_version",
            "tool_license",
            "cap_height",
        )
        if args.file is not None or any(getattr(args, n) is None for n in needed):
            parser.error("the --from-svg form")
        sign = args.sign
        if "/" in sign or "\\" in sign or not SIGN.fullmatch(sign):
            raise CannotRead(
                "--sign isn't a piece ID, so the output's name would hold a folder or break the grammar"
            )
        try:
            cap_height = figure(args.cap_height)
            advance = None if args.advance is None else figure(args.advance)
        except ValueError:
            raise CannotRead(
                "--cap-height or --advance isn't a finite number"
            ) from None
        view_box, paths, other, images = from_svg(Path(args.from_svg))
        doc = {
            "schema": 1,
            "sign": sign,
            "words": args.words,
            "intent_ref": args.intent_ref or "intent-004",
            "source": {"type": args.source_type, "id": args.source_id},
            "tool": {
                "name": args.tool_name,
                "version": args.tool_version,
                "license": args.tool_license,
            },
            "view_box": view_box,
            "cap_height": cap_height,
            "paths": paths,
        }
        if advance is not None:
            doc["advance"] = advance
        target = write_outline(Path.cwd(), doc, f"{sign}{SUFFIX}")
        print(
            f"outline-check: from the SVG: copied {len(paths)} path{'s' if len(paths) != 1 else ''} and its viewBox; "
            f"left behind {other} other element{'s' if other != 1 else ''}, "
            f"{images} of them image{'s' if images != 1 else ''}"
        )
        return check(target)
    except CannotRead as exc:
        print(f"outline-check: can't check: {exc}")
        return 2
    except (OSError, RecursionError, MemoryError):
        # A failure the steps above don't name: exit 2, and the message holds no path (T041's review, part 2, nit 2).
        print(
            "outline-check: can't check: a file operation or the SVG's size failed; nothing was written"
        )
        return 2


if __name__ == "__main__":
    sys.exit(main())
