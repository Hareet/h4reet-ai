"""Fixtures for tools/gates/arrival_check.py's tests (spec 003, tasks.md T007; contracts/arrival-check.md §5).

Everything is built at run time: a committed image would itself be refused outside the asset roots (rule A1), and the
content scan refuses hash-shaped literals, so every file, hash, record, policy, and repository here is made when a test
runs. The containers follow the formats themselves:
- PNG: the 8-byte signature, then chunks of a 4-byte big-endian length, a 4-byte type, the data, and a CRC-32 over the
  type and the data; IHDR first, IEND last. The mark is an iTXt chunk, keyword XML:com.adobe.xmp, uncompressed.
- JPEG: SOI (FF D8), then marker segments, each FF xx and a 2-byte big-endian length that counts itself; SOS's
  entropy-coded data runs to the next marker; EOI (FF D9) ends it. The image here is a real 8x8 grey baseline JPEG:
  one-code Huffman tables (DC category 0, AC end-of-block), so its whole scan is the bits 00 padded with ones, 0x3F.
- WebP: RIFF, a little-endian size counting from "WEBP", then chunks of a FourCC, a little-endian size, and the data,
  padded to an even length. VP8X's first byte holds the flags (0x20 ICC, 0x10 alpha, 0x08 EXIF, 0x04 XMP, 0x02
  animation). The VP8L chunk has a real header (0x2F, then 14-bit width-1 and height-1) before a stand-in bitstream:
  the check reads containers and headers, never pixels.
- GLB: "glTF", version 2, the total length, then a JSON chunk (type 0x4E4F534A, padded with spaces to 4 bytes) and a
  BIN chunk (0x004E4942, padded with zeros). The mark is KHR_xmp_json_ld's packet on the asset.
- TIFF and DNG: II*\\0 and an IFD whose tags include GPSInfo (0x8825); HEIC, AVIF, and MOV: ISO BMFF's ftyp box at
  byte 4, with an EXIF block in an mdat box.
"""

from __future__ import annotations

import hashlib
import json
import os
import struct
import subprocess
import zlib
from pathlib import Path

MEDIA = "all-rights-reserved-2026"
MARK_NS = "http://iptc.org/std/Iptc4xmpExt/2008-02-29/"
MARK_VALUE = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"
MARK_JSON = {
    "@context": {"Iptc4xmpExt": MARK_NS},
    "Iptc4xmpExt:DigitalSourceType": MARK_VALUE,
}
PNG_SIG = b"\x89PNG\r\n\x1a\n"
XMP_ID = b"http://ns.adobe.com/xap/1.0/\x00"
CAPTION = "Evaluation output; not used in the site's assets."
DISCLOSURE = (
    "# Data-flow disclosure\n\n"
    "| ID | From → To | Why |\n|---|---|---|\n"
    "| D1 | agent sessions → Anthropic | the harness |\n"
    "| D4 | a hosted image service | a studio step |\n"
)


# --------------------------------------------------------------------------------------------------
# The mark
# --------------------------------------------------------------------------------------------------
def xmp(*, extra: str = "", toolkit: bool = False, value: str = MARK_VALUE) -> bytes:
    """The mark's XMP packet: one property, the IPTC digital source type, as research R-03 fixes it."""
    tk = ' x:xmptk="Example Toolkit 1.0"' if toolkit else ""
    return (
        '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n'
        f'<x:xmpmeta xmlns:x="adobe:ns:meta/"{tk}>\n'
        ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n'
        f'  <rdf:Description rdf:about="" xmlns:Iptc4xmpExt="{MARK_NS}"'
        ' xmlns:dc="http://purl.org/dc/elements/1.1/"'
        f' Iptc4xmpExt:DigitalSourceType="{value}"{extra}/>\n'
        " </rdf:RDF>\n"
        "</x:xmpmeta>\n"
        '<?xpacket end="w"?>'
    ).encode()


# --------------------------------------------------------------------------------------------------
# EXIF, and the formats outside the asset roots
# --------------------------------------------------------------------------------------------------
def tiff_with_gps(*, dng: bool = False) -> bytes:
    """A little-endian TIFF header and IFD0 with Make and GPSInfo, and a GPS IFD with a latitude reference."""
    tags = [
        (0x010F, 2, 6, b"Phone\x00")
    ]  # Make, ASCII, its 6 bytes inline would need <= 4: stored after the IFDs
    if dng:
        tags.append((0xC612, 1, 4, b"\x01\x04\x00\x00"))  # DNGVersion 1.4.0.0
    count = len(tags) + 1
    ifd0 = 8
    gps_ifd = ifd0 + 2 + 12 * count + 4
    data_at = gps_ifd + 2 + 12 + 4
    out = bytearray(b"II*\x00" + struct.pack("<I", ifd0))
    entries = []
    extra = bytearray()
    for tag, kind, n, value in tags:
        if len(value) <= 4:
            entries.append(struct.pack("<HHI", tag, kind, n) + value.ljust(4, b"\x00"))
        else:
            entries.append(struct.pack("<HHII", tag, kind, n, data_at + len(extra)))
            extra += value
    entries.append(struct.pack("<HHII", 0x8825, 4, 1, gps_ifd))  # GPSInfo, LONG
    entries.sort(key=lambda e: struct.unpack("<H", e[:2])[0])
    out += struct.pack("<H", count) + b"".join(entries) + struct.pack("<I", 0)
    out += (
        struct.pack("<H", 1)
        + struct.pack("<HHI", 0x0001, 2, 2)
        + b"N\x00\x00\x00"
        + struct.pack("<I", 0)
    )
    out += extra
    return bytes(out)


def exif_block(*, gps: bool = True) -> bytes:
    """An EXIF block as JPEG's APP1 and HEIF's Exif item carry it: Exif\\0\\0, then a TIFF header and IFD0."""
    tiff = (
        tiff_with_gps()
        if gps
        else b"II*\x00" + struct.pack("<IH", 8, 0) + struct.pack("<I", 0)
    )
    return b"Exif\x00\x00" + tiff


def _box(kind: bytes, body: bytes) -> bytes:
    return struct.pack(">I", 8 + len(body)) + kind + body


def isobmff(brand: bytes, *compatible: bytes) -> bytes:
    """An ISO BMFF file (HEIC, AVIF, MP4, MOV): an ftyp box at byte 0, its type at byte 4, then an mdat box holding an
    EXIF block with a GPS directory, as a phone's photo or video carries one."""
    ftyp = _box(
        b"ftyp", brand + struct.pack(">I", 0) + b"".join(compatible or (brand,))
    )
    return ftyp + _box(b"mdat", struct.pack(">I", 6) + exif_block() + bytes(range(16)))


def safetensors_header() -> bytes:
    header = json.dumps(
        {"w": {"dtype": "F32", "shape": [1], "data_offsets": [0, 4]}}
    ).encode()
    return struct.pack("<Q", len(header)) + header + b"\x00\x00\x80\x3f"


# --------------------------------------------------------------------------------------------------
# PNG
# --------------------------------------------------------------------------------------------------
def chunk(kind: bytes, body: bytes) -> bytes:
    return (
        struct.pack(">I", len(body))
        + kind
        + body
        + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)
    )


def itxt(text: bytes, keyword: bytes = b"XML:com.adobe.xmp") -> bytes:
    # keyword, NUL, compression flag 0, method 0, an empty language tag, NUL, an empty translated keyword, NUL
    return chunk(b"iTXt", keyword + b"\x00\x00\x00\x00\x00" + text)


def scanlines(width: int, height: int, fill: bytes | None = None) -> bytes:
    if fill is not None:
        row = (fill * (width * 3))[: width * 3]
        return b"".join(b"\x00" + row for _ in range(height))
    return b"".join(
        b"\x00" + bytes((x * 37 + y * 11) % 251 for x in range(width * 3))
        for y in range(height)
    )


def png(
    *,
    width: int = 4,
    height: int = 4,
    mark: bool = True,
    packet: bytes | None = None,
    before: tuple[bytes, ...] = (),
    after: tuple[bytes, ...] = (),
    raw: bytes | None = None,
    level: int = 9,
    trailing: bytes = b"",
) -> bytes:
    """An 8-bit RGB PNG. `before` and `after` are whole chunks placed before and after IDAT. level 0 stores the
    scanlines uncompressed, so bytes in `raw` sit in IDAT as they are."""
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    data = zlib.compress(raw if raw is not None else scanlines(width, height), level)
    marks = (itxt(packet or xmp()),) if mark else ()
    return (
        PNG_SIG
        + ihdr
        + b"".join(marks + before)
        + chunk(b"IDAT", data)
        + b"".join(after)
        + chunk(b"IEND", b"")
        + trailing
    )


def icc_profile(description: str) -> bytes:
    """A minimal ICC v2 profile: a 128-byte header, a tag table, and one 'desc' tag (textDescriptionType)."""
    text = description.encode("ascii") + b"\x00"
    desc = (
        b"desc"
        + b"\x00" * 4
        + struct.pack(">I", len(text))
        + text
        + b"\x00" * 12
        + b"\x00" * 67
    )
    table = struct.pack(">I", 1) + struct.pack(
        ">4sII", b"desc", 128 + 4 + 12, len(desc)
    )
    body = table + desc
    header = (
        struct.pack(">I", 128 + len(body))
        + b"none"
        + b"\x02\x10\x00\x00"
        + b"mntrRGB XYZ "
        + b"\x00" * 104
    )
    return header + body


def iccp(name: bytes, profile: bytes) -> bytes:
    return chunk(b"iCCP", name + b"\x00\x00" + zlib.compress(profile))


# --------------------------------------------------------------------------------------------------
# JPEG
# --------------------------------------------------------------------------------------------------
def segment(marker: int, body: bytes) -> bytes:
    return bytes((0xFF, marker)) + struct.pack(">H", len(body) + 2) + body


def jfif(thumbnail: bool = False) -> bytes:
    thumb = b"\x01\x01" + b"\x80\x80\x80" if thumbnail else b"\x00\x00"
    return segment(0xE0, b"JFIF\x00\x01\x01\x00" + struct.pack(">HH", 1, 1) + thumb)


def jpeg(
    *,
    mark: bool = True,
    packet: bytes | None = None,
    app0: bytes | None = None,
    extra: tuple[bytes, ...] = (),
    scan: bytes = b"\x3f",
    trailing: bytes = b"",
) -> bytes:
    """A real 8x8 grey baseline JPEG; `extra` segments sit before the tables."""
    parts = [b"\xff\xd8", jfif() if app0 is None else app0]
    if mark:
        parts.append(segment(0xE1, XMP_ID + (packet or xmp())))
    parts += list(extra)
    parts.append(segment(0xDB, b"\x00" + b"\x01" * 64))  # DQT: table 0, 8-bit, all ones
    parts.append(
        segment(0xC0, b"\x08" + struct.pack(">HH", 8, 8) + b"\x01\x01\x11\x00")
    )  # SOF0: 8x8, one component
    parts.append(
        segment(0xC4, b"\x00" + b"\x01" + b"\x00" * 15 + b"\x00")
    )  # DHT DC 0: one code, category 0
    parts.append(
        segment(0xC4, b"\x10" + b"\x01" + b"\x00" * 15 + b"\x00")
    )  # DHT AC 0: one code, end of block
    parts.append(
        segment(0xDA, b"\x01\x01\x00\x00\x3f\x00")
    )  # SOS: one component, spectral 0..63
    parts.append(scan)
    parts.append(b"\xff\xd9")
    return b"".join(parts) + trailing


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


def vp8l(width: int = 4, height: int = 4) -> bytes:
    return (
        b"\x2f"
        + struct.pack("<I", (width - 1) | ((height - 1) << 14))
        + b"\x00\x00\x00\x00\x00"
    )


def webp(
    *,
    mark: bool = True,
    packet: bytes | None = None,
    flags: int | None = None,
    extra: tuple[bytes, ...] = (),
    width: int = 4,
    height: int = 4,
    trailing: bytes = b"",
    size_delta: int = 0,
) -> bytes:
    image = riff_chunk(b"VP8L", vp8l(width, height))
    if mark or flags is not None or extra:
        bits = flags if flags is not None else (0x04 if mark else 0)
        vp8x = riff_chunk(
            b"VP8X",
            bytes((bits, 0, 0, 0))
            + (width - 1).to_bytes(3, "little")
            + (height - 1).to_bytes(3, "little"),
        )
        body = (
            vp8x
            + image
            + b"".join(extra)
            + (riff_chunk(b"XMP ", packet or xmp()) if mark else b"")
        )
    else:
        body = image
    riff = b"WEBP" + body
    return b"RIFF" + struct.pack("<I", len(riff) + size_delta) + riff + trailing


# --------------------------------------------------------------------------------------------------
# GLB
# --------------------------------------------------------------------------------------------------
def pack_glb(gltf: dict, binary: bytes) -> bytes:
    text = json.dumps(gltf, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    binary += b"\x00" * (-len(binary) % 4)
    chunks = (
        struct.pack("<I", len(text))
        + b"JSON"
        + text
        + struct.pack("<I", len(binary))
        + b"BIN\x00"
        + binary
    )
    return b"glTF" + struct.pack("<II", 2, 12 + len(chunks)) + chunks


def glb(
    *,
    mark: bool = True,
    image: bytes | None = None,
    image_name: str | None = None,
    material_name: str | None = None,
    node_name: str = "root",
    target_names: list[str] | None = None,
    extra_bin: bytes = b"",
    edit=None,
) -> bytes:
    """One triangle with an embedded PNG texture, and, with target_names, a morph target and mesh.extras.targetNames.
    `edit` changes the glTF JSON before it's packed; extra_bin adds bytes no bufferView covers."""
    image = png(mark=False) if image is None else image
    parts: list[bytes] = []
    views: list[dict] = []

    def view(data: bytes) -> int:
        views.append(
            {"buffer": 0, "byteOffset": sum(map(len, parts)), "byteLength": len(data)}
        )
        parts.append(data + b"\x00" * (-len(data) % 4))
        return len(views) - 1

    positions = view(struct.pack("<9f", 0, 0, 0, 1, 0, 0, 0, 1, 0))
    indices = view(struct.pack("<3H", 0, 1, 2))
    texture = view(image)
    binary = b"".join(parts) + extra_bin
    primitive: dict = {"attributes": {"POSITION": 0}, "indices": 1, "material": 0}
    mesh: dict = {"primitives": [primitive]}
    if target_names is not None:
        primitive["targets"] = [{"POSITION": 0}]
        mesh["weights"] = [0]
        mesh["extras"] = {"targetNames": target_names}
    gltf: dict = {
        "asset": {"version": "2.0"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": node_name}],
        "meshes": [mesh],
        "accessors": [
            {
                "bufferView": positions,
                "componentType": 5126,
                "count": 3,
                "type": "VEC3",
                "max": [1, 1, 0],
                "min": [0, 0, 0],
            },
            {
                "bufferView": indices,
                "componentType": 5123,
                "count": 3,
                "type": "SCALAR",
            },
        ],
        "bufferViews": views,
        "buffers": [{"byteLength": len(binary)}],
        "materials": [{"pbrMetallicRoughness": {"baseColorTexture": {"index": 0}}}],
        "samplers": [{}],
        "textures": [{"source": 0, "sampler": 0}],
        "images": [{"bufferView": texture, "mimeType": "image/png"}],
    }
    if image_name is not None:
        gltf["images"][0]["name"] = image_name
    if material_name is not None:
        gltf["materials"][0]["name"] = material_name
    if mark:
        gltf["extensionsUsed"] = ["KHR_xmp_json_ld"]
        gltf["extensions"] = {
            "KHR_xmp_json_ld": {"packets": [json.loads(json.dumps(MARK_JSON))]}
        }
        gltf["asset"]["extensions"] = {"KHR_xmp_json_ld": {"packet": 0}}
    if edit is not None:
        edit(gltf)
    return pack_glb(gltf, binary)


def big_glb(megabytes: int = 10) -> bytes:
    """A GLB of about `megabytes` MB: its texture a stored (uncompressed) PNG of that size."""
    side = int((megabytes * 1_000_000 / 3) ** 0.5)
    return glb(image=png(width=side, height=side, mark=False, level=0))


# --------------------------------------------------------------------------------------------------
# Records, notices, and the policy
# --------------------------------------------------------------------------------------------------
def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def model_step(
    license_id: str = "apache-2.0",
    version: str = "2.0",
    *,
    checked: str | None = "2026-11-01",
    **model,
) -> dict:
    step: dict = {
        "name": "concept image",
        "by": "model",
        "models": [
            {
                "name": "Example Model",
                "repository": "example-org/example-model",
                "revision": "v1",
                "role": "primary",
                "license": license_id,
                "license_version": version,
                **model,
            }
        ],
    }
    if checked is not None:
        step["models_checked"] = checked
    return step


def hand_step() -> dict:
    return {
        "name": "retopology and rig",
        "by": "hand",
        "tools": [
            {
                "name": "Blender",
                "version": "4.2",
                "license": "gpl-3.0-or-later",
                "license_version": "3",
            }
        ],
    }


def entry(
    file: str,
    data: bytes,
    *,
    kind: str = "still",
    source: tuple[str, str] = ("prompt", "P-0001"),
    likeness: bool = False,
    steps: list[dict] | None = None,
    approval: str | None = None,
    made: str = "2026-11-02",
    **extra,
) -> dict:
    record = {
        "file": file,
        "sha256": sha(data),
        "kind": kind,
        "made": made,
        "source": {"type": source[0], "id": source[1]},
        "likeness": likeness,
        "steps": steps if steps is not None else [model_step(), hand_step()],
        "media_license": MEDIA,
    }
    if approval is not None:
        record["approval"] = approval
    record.update(extra)
    return record


def records(directory: str, entries: list[dict]) -> bytes:
    body = {
        "schema": 1,
        "directory": directory,
        "license": MEDIA,
        "entries": sorted(entries, key=lambda e: e["file"]),
    }
    return (json.dumps(body, indent=2) + "\n").encode()


def notice(year: str = "2026", holder: str = "h4reet.ai") -> bytes:
    return (
        f"Copyright (c) {year} {holder}. All rights reserved.\n\n"
        "The files in this directory are not covered by this repository's MIT license. You are welcome to view them and "
        "to link to them. Any other use needs the copyright holder's written permission.\n\n"
        "Each file's provenance is in records.json, and in CREDITS.md at the root of its tree.\n"
    ).encode()


def license_entry(
    lid: str,
    version: str,
    *,
    terms: str = "yes",
    research: str = "yes",
    evaluation_only: bool = False,
    **over,
) -> dict:
    entry = {
        "id": lid,
        "name": lid,
        "version": version,
        "url": f"https://licenses.example/{lid}",
        "display_on_site_that_promotes_the_studio": terms,
        "everywhere": terms,
        "public_distribution": terms,
        "research_display": research,
        "evaluation_only": evaluation_only,
        "read_by_the_author": "2026-10-18",
    }
    entry.update(over)
    return entry


LICENSES = [
    license_entry("apache-2.0", "2.0"),
    license_entry("gpl-3.0-or-later", "3"),
    license_entry(
        "example-research", "2025-01", terms="no", research="yes", evaluation_only=True
    ),
    license_entry("example-nc", "1.0", terms="no", research="no", evaluation_only=True),
    license_entry("example-territorial", "1.0", everywhere="no"),
]


def approval(
    aid: str,
    data: bytes,
    path: str,
    kind: str = "avatar",
    *,
    room: dict | None = None,
    line: str | None = None,
    **confirms,
) -> dict:
    yes = {
        "likeness_accepted": True,
        "nothing_locates": True,
        "no_screen_logo_text_or_art": True,
        "recreation_not_photo": True,
        "record_complete": True,
    }
    yes.update(confirms)
    return {
        "id": aid,
        "sha256": sha(data),
        "path_when_approved": path,
        "kind": kind,
        "date": "2026-11-03",
        "confirms": yes,
        "room": room,
        "disclosure_line": line,
        "reason": "the fixture's approval",
    }


ROOM_YES = {
    "window_view_recreated": True,
    "screens_plain_glow": True,
    "artwork_original_or_absent": True,
}


def caps(
    *,
    adr: str = "accepted",
    per_asset: dict | None = None,
    phase2: int = 10_000_000,
    phase3: int = 25_000_000,
    history: int = 500_000_000,
) -> dict:
    return {
        "schema": 1,
        "adr_0010": adr,
        "per_asset": per_asset or {},
        "first_visit_bytes": {"phase2": phase2, "phase3": phase3},
        "history_bytes": history,
    }


def dumps(value: object) -> bytes:
    return (json.dumps(value, indent=2) + "\n").encode()


# --------------------------------------------------------------------------------------------------
# A repository
# --------------------------------------------------------------------------------------------------
class Repo:
    """A throwaway repository: `main` holds the policy (unless told not to) and the disclosure document; tests work on
    `feature`. git runs with no system or global configuration and a fixed identity."""

    def __init__(self, root: Path) -> None:
        self.root = root
        root.mkdir(parents=True)
        (root.parent / "home").mkdir(exist_ok=True)
        self.git("init", "-q", "-b", "main")

    def env(self) -> dict[str, str]:
        env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
        env.update(
            GIT_CONFIG_NOSYSTEM="1",
            GIT_CONFIG_GLOBAL=os.devnull,
            HOME=str(self.root.parent / "home"),
            GIT_AUTHOR_NAME="Fixture",
            GIT_AUTHOR_EMAIL="fixture@example.invalid",
            GIT_COMMITTER_NAME="Fixture",
            GIT_COMMITTER_EMAIL="fixture@example.invalid",
            LC_ALL="C",
        )
        return env

    def git(self, *args: str) -> str:
        done = subprocess.run(
            ["git", "-C", str(self.root), *args],
            env=self.env(),
            capture_output=True,
            text=True,
            check=False,
        )
        if done.returncode:
            raise AssertionError(f"git {' '.join(args)}: {done.stderr}")
        return done.stdout.strip()

    def write(self, path: str, data: bytes | str) -> Path:
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data.encode() if isinstance(data, str) else data)
        return target

    def remove(self, path: str) -> None:
        (self.root / path).unlink()

    def commit(self, message: str) -> str:
        self.git("add", "-A")
        self.git("commit", "-q", "--allow-empty", "-m", message)
        return self.git("rev-parse", "HEAD")

    def policy(
        self,
        *,
        licenses: list[dict] | None = None,
        approvals: list[dict] | None = None,
        limits: dict | None = None,
    ) -> None:
        self.write(
            "assets/policy/licenses.json",
            dumps(
                {"schema": 1, "licenses": LICENSES if licenses is None else licenses}
            ),
        )
        self.write(
            "assets/policy/approvals.json",
            dumps({"schema": 1, "approvals": approvals or []}),
        )
        self.write("assets/policy/caps.json", dumps(limits or caps()))

    def directory(
        self,
        directory: str,
        files: dict[str, bytes],
        entries: list[dict] | None = None,
        *,
        license_text: bytes | None = None,
    ) -> None:
        """Write an asset directory: its files, a records.json naming each (unless `entries` says otherwise), and its
        LICENSE.md."""
        for name, data in files.items():
            self.write(f"{directory}/{name}", data)
        if entries is None:
            entries = [
                entry(name, data, kind="avatar" if name.endswith(".glb") else "still")
                for name, data in files.items()
            ]
        self.write(f"{directory}/records.json", records(directory, entries))
        self.write(
            f"{directory}/LICENSE.md",
            notice() if license_text is None else license_text,
        )


def repository(tmp: Path, *, with_policy: bool = True, **policy) -> Repo:
    """A repository whose `main` has the policy and the disclosure document, with `feature` checked out."""
    repo = Repo(tmp / "repo")
    repo.write("README.md", "# fixture\n")
    repo.write("docs/data-flow-disclosure.md", DISCLOSURE)
    if with_policy:
        repo.policy(**policy)
    repo.commit("main: the policy")
    repo.git("switch", "-q", "-c", "feature")
    return repo
