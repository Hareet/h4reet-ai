#!/usr/bin/env python3
"""Make a studio file pass the arrival check's container rules (spec 003 FR-006, FR-007, FR-034; research R-03).

    python3 -I -B -X pycache_prefix=/dev/null scripts/assets/scrub.py [--record RECORDS] [--out OUT] FILE
    make assets-scrub FILE=<path> [RECORD=<records.json>]

It rewrites a PNG, JPEG, WebP, or GLB, keeping only what research R-03 admits, and adds the one mark: an XMP packet
holding only the IPTC digital source type (KHR_xmp_json_ld's, in a GLB). It never decodes or re-encodes pixels: the
image data is copied byte for byte. Standard library only.

The mark follows the record (spec 004, Amendment C1). With --record, it reads the entry of that records.json whose
file is the output's name, and only that entry's steps' `by`: every step by a model, trainedAlgorithmicMedia; model
and hand steps mixed, compositeWithTrainedAlgorithmicMedia; every step by hand, MARK_HUMAN. A step the studio's
session scripted is recorded as a model step. It never reads the entry's sha256, which the Author fills in after the
scrub. Without --record, the mark is trainedAlgorithmicMedia, which the twin's files and the research images keep.

- PNG: IHDR, PLTE, IDAT, tRNS, gAMA, cHRM, sRGB, pHYs, and IEND stay; the mark's iTXt goes after IHDR; text chunks,
  eXIf, iCCP, tIME, and anything after IEND go.
- JPEG: the tables, the frame, the scans, and EOI stay, and JFIF's APP0 without its thumbnail; the mark's APP1 goes
  after it; EXIF, other XMP, ICC profiles, IPTC, comments, and anything after EOI go.
- WebP: the VP8 or VP8L bitstream and ALPH stay, under a VP8X whose only flags are XMP and alpha; the mark's XMP
  chunk goes last; EXIF, ICCP, and other XMP go. An animated WebP is refused.
- GLB: extras go (but mesh.extras.targetNames, the morph targets' names lip-sync needs), and asset.generator,
  asset.copyright, and every extension outside the arrival check's list, with its objects; each image's, texture's,
  sampler's, and material's name becomes a neutral ID (image-0, texture-0, ...); each embedded image is scrubbed as
  above with no mark of its own, and the BIN chunk is laid out again, so bytes no bufferView covers go. Node, mesh,
  skin, and animation names stay, since a rig's bones are named nodes; the check refuses any that look like a file name.
  A GLB that requires an extension outside the list, or names an image by uri, is refused.

ICC profiles go: the studio's outputs are sRGB. It prints what it dropped, by chunk or segment name, never content.
Exit 0 written; 1 a file it can't make pass, with the reason, and nothing written; 2 a usage error, or a record it
can't take the mark from (no entry names the output, two do, the entry has no steps, or a step's `by` isn't model or
hand), with nothing written.
"""

from __future__ import annotations

import argparse
import json
import os
import struct
import sys
import tempfile
import zlib
from pathlib import Path

MARK_NS = "http://iptc.org/std/Iptc4xmpExt/2008-02-29/"
SOURCE_TYPES = "http://cv.iptc.org/newscodes/digitalsourcetype/"
# The three marks a record's steps call for (spec 004, Amendment C1), each a term of IPTC's digital source type.
MARK_MODEL = "trainedAlgorithmicMedia"
MARK_COMPOSITE = "compositeWithTrainedAlgorithmicMedia"
# Media a person made with digital tools: IPTC's digitalCreation, "Media created by a human using non-generative
# tools", which replaced digitalArt on 2024-09-17 (cv.iptc.org/newscodes/digitalsourcetype/; tasks.md T031, settled on
# 2026-10-30). P-5's arrival check holds the same term.
MARK_HUMAN = "digitalCreation"
MARK_VALUE = SOURCE_TYPES + MARK_MODEL


def mark_packet(term: str) -> bytes:
    """The mark's XMP packet: the one property, set to IPTC's `term`."""
    return (
        '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n'
        '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n'
        ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n'
        f'  <rdf:Description rdf:about="" xmlns:Iptc4xmpExt="{MARK_NS}" '
        f'Iptc4xmpExt:DigitalSourceType="{SOURCE_TYPES}{term}"/>\n'
        " </rdf:RDF>\n"
        "</x:xmpmeta>\n"
        '<?xpacket end="w"?>'
    ).encode()


def mark_json(term: str) -> dict:
    """The mark as KHR_xmp_json_ld's packet, in a GLB."""
    return {
        "@context": {"Iptc4xmpExt": MARK_NS},
        "Iptc4xmpExt:DigitalSourceType": SOURCE_TYPES + term,
    }


MARK_PACKET = mark_packet(MARK_MODEL)
MARK_JSON = mark_json(MARK_MODEL)
KINDS = {".png": "png", ".jpg": "jpeg", ".jpeg": "jpeg", ".webp": "webp", ".glb": "glb"}

PNG_SIG = b"\x89PNG\r\n\x1a\n"
PNG_KEEP = (b"IHDR", b"PLTE", b"IDAT", b"tRNS", b"gAMA", b"cHRM", b"sRGB", b"pHYs")
JPEG_TABLES = {0xDB, 0xC4, 0xDD}
SOF = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
ARITHMETIC = {0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
XMP_APP1 = b"http://ns.adobe.com/xap/1.0/\x00"
GLB_EXTENSIONS = ("KHR_texture_transform", "KHR_mesh_quantization", "EXT_texture_webp")
NEUTRAL = {
    "images": "image",
    "textures": "texture",
    "samplers": "sampler",
    "materials": "material",
}


class ScrubError(Exception):
    """A file this tool can't make pass: nothing is written."""


class RecordError(Exception):
    """A record it can't take the mark from: exit 2, and nothing is written."""


def printable(raw: bytes) -> str:
    return (
        raw.decode("ascii")
        if raw.isascii() and raw.decode("ascii").isprintable()
        else "(unnamed)"
    )


# --------------------------------------------------------------------------------------------------
# PNG
# --------------------------------------------------------------------------------------------------
def png_chunk(kind: bytes, body: bytes) -> bytes:
    return (
        struct.pack(">I", len(body))
        + kind
        + body
        + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)
    )


def scrub_png(
    data: bytes, *, mark: bool, dropped: list[str], packet: bytes = MARK_PACKET
) -> bytes:
    if not data.startswith(PNG_SIG):
        raise ScrubError("it isn't a PNG")
    pos, kept, ended = 8, [], False
    while pos + 12 <= len(data):
        length, kind = struct.unpack(">I4s", data[pos : pos + 8])
        body = data[pos + 8 : pos + 8 + length]
        if (
            len(body) != length
            or zlib.crc32(kind + body) & 0xFFFFFFFF
            != struct.unpack(">I", data[pos + 8 + length : pos + 12 + length])[0]
        ):
            raise ScrubError(f"a chunk at byte {pos} is truncated or fails its CRC")
        pos += 12 + length
        if kind == b"IEND":
            ended = True
            break
        if kind in PNG_KEEP:
            kept.append(png_chunk(kind, body))
        else:
            dropped.append(printable(kind))
    if not ended or not kept or not kept[0][4:8] == b"IHDR":
        raise ScrubError("it has no IHDR first, or no IEND")
    if pos < len(data):
        dropped.append(f"{len(data) - pos} bytes after IEND")
    marks = (
        [png_chunk(b"iTXt", b"XML:com.adobe.xmp\x00\x00\x00\x00\x00" + packet)]
        if mark
        else []
    )
    return (
        PNG_SIG
        + kept[0]
        + b"".join(marks)
        + b"".join(kept[1:])
        + png_chunk(b"IEND", b"")
    )


# --------------------------------------------------------------------------------------------------
# JPEG
# --------------------------------------------------------------------------------------------------
def segment(marker: int, body: bytes) -> bytes:
    return bytes((0xFF, marker)) + struct.pack(">H", len(body) + 2) + body


def scan_end(data: bytes, pos: int) -> int:
    """Where an SOS's entropy-coded data ends: the next marker that isn't a stuffed FF00 or a restart."""
    while True:
        at = data.find(b"\xff", pos)
        if at == -1 or at + 1 >= len(data):
            raise ScrubError("a scan runs to the end of the file, with no EOI")
        following = data[at + 1]
        if following == 0x00 or 0xD0 <= following <= 0xD7:
            pos = at + 2
        elif following == 0xFF:
            pos = at + 1
        else:
            return at


def scrub_jpeg(
    data: bytes, *, mark: bool, dropped: list[str], packet: bytes = MARK_PACKET
) -> bytes:
    if not data.startswith(b"\xff\xd8"):
        raise ScrubError("it isn't a JPEG")
    pos, jfif, body_parts = 2, None, []
    while True:
        if pos + 2 > len(data) or data[pos] != 0xFF:
            raise ScrubError(f"bytes between segments at byte {pos}")
        while pos < len(data) and data[pos] == 0xFF:
            pos += 1
        marker = data[pos]
        pos += 1
        if marker == 0xD9:
            break
        if 0xD0 <= marker <= 0xD7 or marker in (0x01, 0xD8):
            raise ScrubError(f"a stray marker FF{marker:02X}")
        (length,) = struct.unpack(">H", data[pos : pos + 2])
        body = data[pos + 2 : pos + length]
        if length < 2 or len(body) != length - 2:
            raise ScrubError("a truncated segment")
        pos += length
        if marker in ARITHMETIC or marker == 0xCC:
            raise ScrubError("it uses arithmetic coding; export a Huffman-coded JPEG")
        if marker in SOF:
            if len(body) >= 6 and body[5] == 4:
                raise ScrubError("it has four components (CMYK); export it as RGB")
            body_parts.append(segment(marker, body))
        elif marker in JPEG_TABLES:
            body_parts.append(segment(marker, body))
        elif marker == 0xDA:
            end = scan_end(data, pos)
            body_parts.append(segment(marker, body) + data[pos:end])
            pos = end
        elif (
            marker == 0xE0
            and body.startswith(b"JFIF\x00")
            and len(body) >= 14
            and jfif is None
        ):
            jfif = segment(
                0xE0, body[:12] + b"\x00\x00"
            )  # version, units, and density, without a thumbnail
            if len(body) > 14 or body[12] or body[13]:
                dropped.append("JFIF thumbnail")
        else:
            name = {
                0xE1: "APP1",
                0xE2: "APP2",
                0xED: "APP13",
                0xEE: "APP14",
                0xFE: "COM",
            }.get(marker, f"FF{marker:02X}")
            if marker == 0xE1:
                name += (
                    " (EXIF)"
                    if body.startswith(b"Exif\x00\x00")
                    else " (XMP)"
                    if body.startswith(XMP_APP1)
                    else ""
                )
            dropped.append(name)
    if pos < len(data):
        dropped.append(f"{len(data) - pos} bytes after EOI")
    head = [jfif] if jfif else []
    if mark:
        head.append(segment(0xE1, XMP_APP1 + packet))
    return b"\xff\xd8" + b"".join(head) + b"".join(body_parts) + b"\xff\xd9"


# --------------------------------------------------------------------------------------------------
# WebP
# --------------------------------------------------------------------------------------------------
def riff_chunk(fourcc: bytes, body: bytes) -> bytes:
    return (
        fourcc
        + struct.pack("<I", len(body))
        + body
        + (b"\x00" if len(body) % 2 else b"")
    )


def scrub_webp(
    data: bytes, *, mark: bool, dropped: list[str], packet: bytes = MARK_PACKET
) -> bytes:
    if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise ScrubError("it isn't a WebP")
    end = 8 + struct.unpack("<I", data[4:8])[0]
    if end > len(data):
        raise ScrubError("its RIFF size runs past the file")
    if end < len(data):
        dropped.append(f"{len(data) - end} bytes past the RIFF size")
    pos, chunks = 12, {}
    while pos + 8 <= end:
        kind = data[pos : pos + 4]
        (length,) = struct.unpack("<I", data[pos + 4 : pos + 8])
        body = data[pos + 8 : pos + 8 + length]
        pos += 8 + length + (length & 1)
        if kind in (b"ANIM", b"ANMF"):
            raise ScrubError(
                "it's an animated WebP, which the arrival check doesn't admit"
            )
        if kind in (b"VP8 ", b"VP8L", b"ALPH") and kind not in chunks:
            chunks[kind] = body
        elif kind != b"VP8X":
            dropped.append(printable(kind).strip())
    bitstream = b"VP8L" if b"VP8L" in chunks else b"VP8 " if b"VP8 " in chunks else None
    if bitstream is None:
        raise ScrubError("it has no VP8 or VP8L bitstream")
    body = chunks[bitstream]
    if bitstream == b"VP8L":
        (bits,) = struct.unpack("<I", body[1:5])
        width, height, alpha = (
            (bits & 0x3FFF) + 1,
            ((bits >> 14) & 0x3FFF) + 1,
            bool(bits >> 28 & 1),
        )
    else:
        w, h = struct.unpack("<HH", body[6:10])
        width, height, alpha = w & 0x3FFF, h & 0x3FFF, b"ALPH" in chunks
    alph = (
        riff_chunk(b"ALPH", chunks[b"ALPH"])
        if bitstream == b"VP8 " and b"ALPH" in chunks
        else b""
    )
    image = riff_chunk(bitstream, body)
    if mark or alph:
        flags = (0x04 if mark else 0) | (0x10 if alpha else 0)
        vp8x = riff_chunk(
            b"VP8X",
            bytes((flags, 0, 0, 0))
            + (width - 1).to_bytes(3, "little")
            + (height - 1).to_bytes(3, "little"),
        )
        payload = vp8x + alph + image + (riff_chunk(b"XMP ", packet) if mark else b"")
    else:
        payload = image
    riff = b"WEBP" + payload
    return b"RIFF" + struct.pack("<I", len(riff)) + riff


# --------------------------------------------------------------------------------------------------
# GLB
# --------------------------------------------------------------------------------------------------
def allowed(extension: str) -> bool:
    return extension in GLB_EXTENSIONS or extension.startswith("KHR_materials_")


def clean_json(value: object, path: tuple[str, ...], dropped: list[str]) -> object:
    """extras, unlisted extensions, and KHR_xmp_json_ld removed everywhere; mesh.extras.targetNames kept."""
    if isinstance(value, list):
        return [clean_json(v, path, dropped) for v in value]
    if not isinstance(value, dict):
        return value
    out = {}
    for key, item in value.items():
        if key == "extras":
            names = item.get("targetNames") if isinstance(item, dict) else None
            if (
                path[-1:] == ("meshes",)
                and isinstance(names, list)
                and all(isinstance(n, str) for n in names)
            ):
                out["extras"] = {"targetNames": names}
                if set(item) != {"targetNames"}:
                    dropped.append("extras (but targetNames)")
            else:
                dropped.append("extras")
        elif key == "extensions" and isinstance(item, dict):
            kept = {}
            for name, body in item.items():
                if allowed(name):
                    kept[name] = clean_json(body, (*path, name), dropped)
                else:
                    dropped.append(
                        f"extension {name}"
                        if name != "KHR_xmp_json_ld"
                        else "another XMP packet"
                    )
            if kept:
                out["extensions"] = kept
        else:
            out[key] = clean_json(item, (*path, key), dropped)
    return out


def scrub_glb(data: bytes, *, dropped: list[str], term: str = MARK_MODEL) -> bytes:
    if len(data) < 20 or data[:4] != b"glTF" or struct.unpack("<I", data[4:8])[0] != 2:
        raise ScrubError("it isn't a glTF 2.0 GLB")
    pos, chunks = 12, []
    total = min(struct.unpack("<I", data[8:12])[0], len(data))
    while pos + 8 <= total:
        length, kind = struct.unpack("<II", data[pos : pos + 8])
        chunks.append((kind, data[pos + 8 : pos + 8 + length]))
        pos += 8 + length
    if not chunks or chunks[0][0] != 0x4E4F534A:
        raise ScrubError("its first chunk isn't JSON")
    gltf = json.loads(chunks[0][1].decode("utf-8"))
    binary = next((body for kind, body in chunks[1:] if kind == 0x004E4942), b"")
    if len(chunks) > 2:
        dropped.append(f"{len(chunks) - 2} chunk(s) besides JSON and BIN")
    required = [r for r in gltf.get("extensionsRequired", []) if not allowed(r)]
    if required:
        raise ScrubError(
            f"it requires {', '.join(required)}, which the arrival check doesn't admit; export without it"
        )
    if any(
        "uri" in item for key in ("images", "buffers") for item in gltf.get(key, [])
    ):
        raise ScrubError(
            "it names an image or a buffer by uri; export a GLB that embeds them"
        )
    asset = gltf.get("asset", {})
    for key in sorted(set(asset) - {"version", "extensions", "extras"}):
        dropped.append(f"asset.{key}")
    gltf["asset"] = {"version": asset.get("version", "2.0")}
    gltf = clean_json(gltf, (), dropped)
    gltf["extensionsUsed"] = [e for e in gltf.get("extensionsUsed", []) if allowed(e)]
    if gltf.get("extensionsRequired") == []:
        del gltf["extensionsRequired"]
    for key, stem in NEUTRAL.items():
        for i, item in enumerate(gltf.get(key, [])):
            if "name" in item:
                item["name"] = f"{stem}-{i}"
    # The BIN chunk, laid out again: each bufferView's bytes in order, an image's scrubbed, every view on a 4-byte
    # boundary, and nothing between them but zeros.
    views = gltf.get("bufferViews", [])
    images = {
        img["bufferView"]: i
        for i, img in enumerate(gltf.get("images", []))
        if "bufferView" in img
    }
    used = {a.get("bufferView") for a in gltf.get("accessors", [])}
    used |= {
        s.get(part, {}).get("bufferView")
        for a in gltf.get("accessors", [])
        for s in [a.get("sparse", {})]
        for part in ("indices", "values")
    }
    if set(images) & used:
        raise ScrubError("an image's bufferView is also an accessor's")
    out = bytearray()
    for index, view in enumerate(views):
        start = view.get("byteOffset", 0)
        piece = binary[start : start + view["byteLength"]]
        if index in images:
            inner: list[str] = []
            piece = scrub_bytes(piece, image_kind(piece), mark=False, dropped=inner)
            dropped += [f"images[{images[index]}]: {d}" for d in inner]
        out += b"\x00" * (-len(out) % 4)
        view["byteOffset"], view["byteLength"] = len(out), len(piece)
        out += piece
    if gltf.get("buffers"):
        gltf["buffers"][0]["byteLength"] = len(out)
    # The mark, once, on the asset.
    gltf["extensionsUsed"] = [*gltf["extensionsUsed"], "KHR_xmp_json_ld"]
    gltf.setdefault("extensions", {})["KHR_xmp_json_ld"] = {
        "packets": [mark_json(term)]
    }
    gltf["asset"]["extensions"] = {"KHR_xmp_json_ld": {"packet": 0}}
    text = json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode()
    text += b" " * (-len(text) % 4)
    out += b"\x00" * (-len(out) % 4)
    body = struct.pack("<I", len(text)) + b"JSON" + text
    if out:
        body += struct.pack("<I", len(out)) + b"BIN\x00" + bytes(out)
    return b"glTF" + struct.pack("<II", 2, 12 + len(body)) + body


def image_kind(data: bytes) -> str:
    if data.startswith(PNG_SIG):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    raise ScrubError("an embedded image that isn't PNG, JPEG, or WebP")


def scrub_bytes(
    data: bytes,
    kind: str,
    *,
    mark: bool = True,
    dropped: list[str] | None = None,
    term: str = MARK_MODEL,
) -> bytes:
    """The scrubbed file, marked with IPTC's `term`. `mark` is False for an image embedded in a GLB, whose one mark is
    the model's."""
    dropped = [] if dropped is None else dropped
    packet = mark_packet(term)
    if kind == "png":
        return scrub_png(data, mark=mark, dropped=dropped, packet=packet)
    if kind == "jpeg":
        return scrub_jpeg(data, mark=mark, dropped=dropped, packet=packet)
    if kind == "webp":
        return scrub_webp(data, mark=mark, dropped=dropped, packet=packet)
    if kind == "glb":
        return scrub_glb(data, dropped=dropped, term=term)
    raise ScrubError(f"{kind} isn't a format the arrival check admits")


def term_from_record(records: Path, name: str) -> str:
    """The mark the steps of the entry naming `name` call for (spec 004, Amendment C1). It reads each step's `by`
    and nothing else of the entry: never its sha256, which the Author fills in after the scrub."""
    try:
        doc = json.loads(records.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, ValueError):
        raise RecordError(f"{records.name} can't be read, or isn't JSON") from None
    entries = doc.get("entries") if isinstance(doc, dict) else None
    if not isinstance(entries, list):
        raise RecordError(f"{records.name} has no list of entries")
    found = [e for e in entries if isinstance(e, dict) and e.get("file") == name]
    if len(found) != 1:
        which = "no entry" if not found else "more than one entry"
        raise RecordError(f"{records.name} has {which} for {name}")
    steps = found[0].get("steps")
    if not isinstance(steps, list) or not steps:
        raise RecordError(f"the entry for {name} has no steps")
    by = set()
    for step in steps:
        if not isinstance(step, dict) or step.get("by") not in ("model", "hand"):
            raise RecordError(
                f"a step of the entry for {name} isn't by a model or by hand"
            )
        by.add(step["by"])
    if by == {"model"}:
        return MARK_MODEL
    if by == {"hand"}:
        return MARK_HUMAN
    return MARK_COMPOSITE


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Make a studio file pass the arrival check's container rules (spec 003)."
    )
    parser.add_argument("--out", help="write here instead of rewriting FILE")
    parser.add_argument(
        "--record",
        help="the records.json whose entry for the output's name sets the mark (spec 004, Amendment C1)",
    )
    parser.add_argument("file")
    args = parser.parse_args(argv)
    source = Path(args.file)
    kind = KINDS.get(source.suffix.lower())
    if kind is None or not source.is_file():
        print(
            f"scrub: {source.name}: give a PNG, JPEG, WebP, or GLB file",
            file=sys.stderr,
        )
        return 2
    target = Path(args.out) if args.out else source
    term = MARK_MODEL
    if args.record:
        try:
            term = term_from_record(Path(args.record), target.name)
        except RecordError as exc:
            print(f"scrub: {exc}; nothing written", file=sys.stderr)
            return 2
    dropped: list[str] = []
    try:
        clean = scrub_bytes(source.read_bytes(), kind, dropped=dropped, term=term)
    except (ScrubError, ValueError, struct.error, IndexError, KeyError) as exc:
        reason = (
            str(exc)
            if isinstance(exc, ScrubError)
            else f"it doesn't parse ({exc.__class__.__name__})"
        )
        print(f"scrub: {source.name}: {reason}; nothing written", file=sys.stderr)
        return 1
    with tempfile.NamedTemporaryFile(
        dir=target.parent, prefix=".scrub-", delete=False
    ) as tmp:
        tmp.write(clean)
    # The file keeps its mode: a temporary file is made 0600.
    os.chmod(tmp.name, (target.stat().st_mode if target.exists() else 0o644) & 0o777)
    os.replace(tmp.name, target)
    print(
        f"scrub: {target.name}: dropped {', '.join(dropped) if dropped else 'nothing'}; added the mark, {term}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
