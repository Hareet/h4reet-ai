"""Tests for scripts/assets/scrub.py (spec 003 FR-006, FR-007, FR-034; research R-03; tasks.md T009).

Each format is built here, at run time, carrying what a studio's tools leave in a file: ComfyUI's prompt and workflow
in PNG text chunks, a camera's EXIF, an editor's XMP, comments, an ICC profile, a JFIF thumbnail, a GLB's extras,
generator, unlisted extension, and source image names, and an embedded texture with its own EXIF and XMP. The
scrubbed file must keep only what research R-03 admits and the one mark, with its pixel data unchanged, byte for byte.
Where the tree has the arrival check (tools/gates/arrival_check.py, which spec 003's Phase 2 patch adds), its own
container rules must find nothing in the result: M1 to M9, the B rules, and A4.

With --record (spec 004, Amendment C1; contracts/intake-amendments.md §13), the mark follows the file's record: the
entry whose file is the output's name, read only for its steps' `by`. Every step by a model writes
trainedAlgorithmicMedia; model and hand mixed, compositeWithTrainedAlgorithmicMedia; every step by hand, MARK_HUMAN,
IPTC's digitalCreation (tasks.md T031, settled on 2026-10-30). A record it can't read that way is exit 2, with nothing
written.
"""

from __future__ import annotations

import ast
import importlib.util
import json
import struct
import subprocess
import sys
import zlib
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRUB = ROOT / "scripts" / "assets" / "scrub.py"
CHECK = ROOT / "tools" / "gates" / "arrival_check.py"


def load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


scrub = load(SCRUB, "assets_scrub")
needs_check = pytest.mark.skipif(
    not CHECK.is_file(),
    reason="tools/gates/arrival_check.py arrives with spec 003's Phase 2 patch (T011)",
)

PROMPT = b'{"3": {"class_type": "KSampler", "inputs": {"ckpt_name": "model.safetensors", "image": "/home/me/IMG_1.jpg"}}}'
OTHER_XMP = (
    b'<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Editor 1.0"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    b'<rdf:Description rdf:about="" xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="37,46.5N"/></rdf:RDF></x:xmpmeta>'
)


def exif() -> bytes:
    # Exif\0\0, a little-endian TIFF header, and IFD0 with one tag, GPSInfo (0x8825), pointing past the IFD.
    return (
        b"Exif\x00\x00II*\x00"
        + struct.pack("<IH", 8, 1)
        + struct.pack("<HHII", 0x8825, 4, 1, 26)
        + struct.pack("<I", 0)
        + bytes(6)
    )


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


def png_chunks(data: bytes) -> list[tuple[bytes, bytes]]:
    pos, out = 8, []
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        out.append((data[pos + 4 : pos + 8], data[pos + 8 : pos + 8 + length]))
        pos += 12 + length
    return out


def dirty_png(width: int = 4, height: int = 4) -> bytes:
    raw = b"".join(
        b"\x00" + bytes((x * 7 + y) % 256 for x in range(width * 3))
        for y in range(height)
    )
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"tEXt", b"prompt\x00" + PROMPT)
        + chunk(b"tEXt", b"workflow\x00" + PROMPT)
        + chunk(b"iTXt", b"XML:com.adobe.xmp\x00\x00\x00\x00\x00" + OTHER_XMP)
        + chunk(b"eXIf", exif()[6:])
        + chunk(b"iCCP", b"Camera RGB\x00\x00" + zlib.compress(b"\x00" * 132))
        + chunk(b"pHYs", struct.pack(">IIB", 2835, 2835, 1))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"tIME", bytes(7))
        + chunk(b"IEND", b"")
        + b"ComfyUI appended text"
    )


def test_png_keeps_only_the_allowlist_and_one_mark() -> None:
    dirty = dirty_png()
    clean = scrub.scrub_bytes(dirty, "png")
    kinds = [k for k, _ in png_chunks(clean)]
    assert kinds == [b"IHDR", b"iTXt", b"pHYs", b"IDAT", b"IEND"]
    assert (
        dict(png_chunks(clean))[b"IDAT"] == dict(png_chunks(dirty))[b"IDAT"]
    )  # pixels, byte for byte
    mark = dict(png_chunks(clean))[b"iTXt"]
    assert mark == b"XML:com.adobe.xmp\x00\x00\x00\x00\x00" + scrub.MARK_PACKET
    assert (
        b"prompt" not in clean
        and b"Camera RGB" not in clean
        and b"ComfyUI" not in clean
    )


# --------------------------------------------------------------------------------------------------
# JPEG: a real 8x8 grey baseline JPEG, its scan the bits 00 padded with ones
# --------------------------------------------------------------------------------------------------
def segment(marker: int, body: bytes) -> bytes:
    return bytes((0xFF, marker)) + struct.pack(">H", len(body) + 2) + body


TABLES = (
    segment(0xDB, b"\x00" + b"\x01" * 64)
    + segment(0xC0, b"\x08" + struct.pack(">HH", 8, 8) + b"\x01\x01\x11\x00")
    + segment(0xC4, b"\x00\x01" + b"\x00" * 15 + b"\x00")
    + segment(0xC4, b"\x10\x01" + b"\x00" * 15 + b"\x00")
    + segment(0xDA, b"\x01\x01\x00\x00\x3f\x00")
)
SCAN = b"\x3f"


def dirty_jpeg() -> bytes:
    thumb = b"\x01\x01" + b"\x80\x80\x80"
    return (
        b"\xff\xd8"
        + segment(0xE0, b"JFIF\x00\x01\x02\x01" + struct.pack(">HH", 72, 72) + thumb)
        + segment(0xE1, exif())
        + segment(0xE1, b"http://ns.adobe.com/xap/1.0/\x00" + OTHER_XMP)
        + segment(0xE2, b"ICC_PROFILE\x00\x01\x01" + b"\x00" * 132)
        + segment(0xED, b"Photoshop 3.0\x00" + bytes(8))
        + segment(0xFE, b"taken with a phone")
        + TABLES
        + SCAN
        + b"\xff\xd9"
        + b"\xff\xd8 a second picture"
    )


def jpeg_segments(data: bytes) -> list[tuple[int, bytes]]:
    pos, out = 2, [(0xD8, b"")]
    while pos < len(data):
        marker = data[pos + 1]
        if marker == 0xD9:
            out.append((0xD9, b""))
            break
        (length,) = struct.unpack(">H", data[pos + 2 : pos + 4])
        out.append((marker, data[pos + 4 : pos + 2 + length]))
        pos += 2 + length
        if marker == 0xDA:
            end = data.index(b"\xff\xd9", pos)
            out.append((-1, data[pos:end]))
            pos = end
    return out


def test_jpeg_keeps_only_the_allowlist_and_one_mark() -> None:
    clean = scrub.scrub_bytes(dirty_jpeg(), "jpeg")
    segments = jpeg_segments(clean)
    assert [m for m, _ in segments] == [
        0xD8,
        0xE0,
        0xE1,
        0xDB,
        0xC0,
        0xC4,
        0xC4,
        0xDA,
        -1,
        0xD9,
    ]
    app0 = dict(segments)[0xE0]
    assert (
        app0[:5] == b"JFIF\x00" and app0[12:14] == b"\x00\x00" and len(app0) == 14
    )  # no thumbnail
    assert (
        dict(segments)[0xE1] == b"http://ns.adobe.com/xap/1.0/\x00" + scrub.MARK_PACKET
    )
    assert dict(segments)[-1] == SCAN  # the scan, byte for byte
    assert clean.endswith(b"\xff\xd9")
    assert b"Exif" not in clean and b"phone" not in clean and b"Photoshop" not in clean


# --------------------------------------------------------------------------------------------------
# WebP
# --------------------------------------------------------------------------------------------------
def riff(fourcc: bytes, body: bytes) -> bytes:
    return (
        fourcc
        + struct.pack("<I", len(body))
        + body
        + (b"\x00" if len(body) % 2 else b"")
    )


VP8L = b"\x2f" + struct.pack("<I", 3 | (3 << 14)) + b"\x11\x22\x33\x44\x55"


def dirty_webp() -> bytes:
    vp8x = riff(
        b"VP8X",
        bytes((0x20 | 0x08 | 0x04, 0, 0, 0))
        + (3).to_bytes(3, "little")
        + (3).to_bytes(3, "little"),
    )
    body = (
        b"WEBP"
        + vp8x
        + riff(b"ICCP", b"\x00" * 132)
        + riff(b"VP8L", VP8L)
        + riff(b"EXIF", exif()[6:])
        + riff(b"XMP ", OTHER_XMP)
    )
    return b"RIFF" + struct.pack("<I", len(body)) + body + b"trailing"


def webp_chunks(data: bytes) -> list[tuple[bytes, bytes]]:
    pos, end, out = 12, 8 + struct.unpack("<I", data[4:8])[0], []
    while pos < end:
        (length,) = struct.unpack("<I", data[pos + 4 : pos + 8])
        out.append((data[pos : pos + 4], data[pos + 8 : pos + 8 + length]))
        pos += 8 + length + (length & 1)
    return out


def test_webp_keeps_only_the_allowlist_and_one_mark() -> None:
    clean = scrub.scrub_bytes(dirty_webp(), "webp")
    chunks = webp_chunks(clean)
    assert [k for k, _ in chunks] == [b"VP8X", b"VP8L", b"XMP "]
    assert chunks[0][1][0] == 0x04  # only the XMP flag
    assert chunks[0][1][4:10] == (3).to_bytes(3, "little") * 2  # the canvas, 4 by 4
    assert chunks[1][1] == VP8L  # the bitstream, byte for byte
    assert chunks[2][1] == scrub.MARK_PACKET
    assert len(clean) == 8 + struct.unpack("<I", clean[4:8])[0]


def test_an_animated_webp_is_refused() -> None:
    body = (
        b"WEBP"
        + riff(b"VP8X", bytes((0x02, 0, 0, 0)) + bytes(6))
        + riff(b"ANIM", bytes(6))
        + riff(b"ANMF", bytes(24))
    )
    with pytest.raises(scrub.ScrubError):
        scrub.scrub_bytes(b"RIFF" + struct.pack("<I", len(body)) + body, "webp")


# --------------------------------------------------------------------------------------------------
# GLB
# --------------------------------------------------------------------------------------------------
def pack_glb(gltf: dict, binary: bytes) -> bytes:
    text = json.dumps(gltf).encode()
    text += b" " * (-len(text) % 4)
    binary += b"\x00" * (-len(binary) % 4)
    body = (
        struct.pack("<I", len(text))
        + b"JSON"
        + text
        + struct.pack("<I", len(binary))
        + b"BIN\x00"
        + binary
    )
    return b"glTF" + struct.pack("<II", 2, 12 + len(body)) + body


def unpack_glb(data: bytes) -> tuple[dict, bytes]:
    (json_len,) = struct.unpack("<I", data[12:16])
    gltf = json.loads(data[20 : 20 + json_len])
    (bin_len,) = struct.unpack("<I", data[20 + json_len : 24 + json_len])
    return gltf, data[28 + json_len : 28 + json_len + bin_len]


POSITIONS = struct.pack("<9f", 0, 0, 0, 1, 0, 0, 0, 1, 0)


def dirty_glb(**edits) -> bytes:
    texture = dirty_png()
    parts, views = [], []
    for data in (POSITIONS, texture, POSITIONS):
        views.append(
            {"buffer": 0, "byteOffset": sum(map(len, parts)), "byteLength": len(data)}
        )
        parts.append(data + b"\x00" * (-len(data) % 4))
    binary = b"".join(parts) + b"leftover export bytes"
    gltf = {
        "asset": {
            "version": "2.0",
            "generator": "Example Exporter 4.2",
            "copyright": "someone",
        },
        "extensionsUsed": ["EXT_unlisted_thing", "KHR_xmp_json_ld"],
        "extensions": {"KHR_xmp_json_ld": {"packets": [{"dc:creator": "me"}]}},
        "extras": {"workflow": "a workflow"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [
            {
                "mesh": 0,
                "name": "root",
                "extras": {"prompt": "x"},
                "extensions": {"EXT_unlisted_thing": {"a": 1}},
            }
        ],
        "meshes": [
            {
                "primitives": [
                    {
                        "attributes": {"POSITION": 0},
                        "material": 0,
                        "targets": [{"POSITION": 1}],
                    }
                ],
                "weights": [0],
                "extras": {"targetNames": ["jawOpen"], "note": "x"},
            }
        ],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": 5126,
                "count": 3,
                "type": "VEC3",
                "max": [1, 1, 0],
                "min": [0, 0, 0],
            },
            {"bufferView": 2, "componentType": 5126, "count": 3, "type": "VEC3"},
        ],
        "bufferViews": views,
        "buffers": [{"byteLength": len(binary)}],
        "materials": [
            {
                "name": "face_photo.png",
                "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}},
            }
        ],
        "samplers": [{"name": "IMG_0001 sampler"}],
        "textures": [{"source": 0, "sampler": 0, "name": "IMG_0001"}],
        "images": [{"bufferView": 1, "mimeType": "image/png", "name": "IMG_0001.jpg"}],
    }
    for key, value in edits.items():
        gltf[key] = value
    return pack_glb(gltf, binary)


def test_glb_keeps_the_schema_one_mark_and_the_morph_targets_names() -> None:
    dirty = dirty_glb()
    clean = scrub.scrub_bytes(dirty, "glb")
    gltf, binary = unpack_glb(clean)
    assert gltf["asset"] == {
        "version": "2.0",
        "extensions": {"KHR_xmp_json_ld": {"packet": 0}},
    }
    assert gltf["extensionsUsed"] == ["KHR_xmp_json_ld"]
    assert gltf["extensions"] == {"KHR_xmp_json_ld": {"packets": [scrub.MARK_JSON]}}
    assert (
        "extras" not in gltf
        and "extras" not in gltf["nodes"][0]
        and "extensions" not in gltf["nodes"][0]
    )
    assert gltf["meshes"][0]["extras"] == {"targetNames": ["jawOpen"]}
    assert (
        gltf["images"][0]["name"] == "image-0"
        and gltf["materials"][0]["name"] == "material-0"
    )
    assert (
        gltf["textures"][0]["name"] == "texture-0"
        and gltf["samplers"][0]["name"] == "sampler-0"
    )
    # A node's name stays: a rig's bones are named nodes.
    assert gltf["nodes"][0]["name"] == "root"
    views = gltf["bufferViews"]

    def view(i: int) -> bytes:
        start = views[i]["byteOffset"]
        return binary[start : start + views[i]["byteLength"]]

    assert view(0) == POSITIONS and view(2) == POSITIONS
    texture = view(1)
    assert [k for k, _ in png_chunks(texture)] == [
        b"IHDR",
        b"pHYs",
        b"IDAT",
        b"IEND",
    ]  # no mark of its own
    assert dict(png_chunks(texture))[b"IDAT"] == dict(png_chunks(dirty_png()))[b"IDAT"]
    assert (
        gltf["buffers"][0]["byteLength"]
        <= len(binary)
        < gltf["buffers"][0]["byteLength"] + 4
    )
    assert (
        b"leftover" not in clean
        and b"IMG_0001" not in clean
        and b"Example Exporter" not in clean
    )


@pytest.mark.parametrize(
    "edits",
    [
        {
            "extensionsRequired": ["KHR_draco_mesh_compression"],
            "extensionsUsed": ["KHR_draco_mesh_compression"],
        },
        {"images": [{"uri": "textures/face.png", "mimeType": "image/png"}]},
    ],
)
def test_a_glb_it_cant_make_pass_is_refused(edits: dict) -> None:
    with pytest.raises(scrub.ScrubError):
        scrub.scrub_bytes(dirty_glb(**edits), "glb")


# --------------------------------------------------------------------------------------------------
# The arrival check's own rules, where the tree has it
# --------------------------------------------------------------------------------------------------
@needs_check
@pytest.mark.parametrize(
    "kind, build",
    [
        ("png", dirty_png),
        ("jpeg", dirty_jpeg),
        ("webp", dirty_webp),
        ("glb", dirty_glb),
    ],
)
def test_the_scrubbed_file_passes_the_arrival_checks_container_rules(
    kind: str, build
) -> None:
    check = load(CHECK, "arrival_check_for_scrub")
    assert check.container_findings(build(), kind)  # the dirty file fails
    assert check.container_findings(scrub.scrub_bytes(build(), kind), kind) == []


# --------------------------------------------------------------------------------------------------
# The command
# --------------------------------------------------------------------------------------------------
def run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            "-I",
            "-B",
            "-X",
            "pycache_prefix=/dev/null",
            str(SCRUB),
            *args,
        ],
        capture_output=True,
        text=True,
        check=False,
    )


def test_the_command_rewrites_a_file_in_place_and_says_what_it_dropped(
    tmp_path: Path,
) -> None:
    target = tmp_path / "still.png"
    target.write_bytes(dirty_png())
    done = run(str(target))
    assert done.returncode == 0, done.stderr
    assert [k for k, _ in png_chunks(target.read_bytes())] == [
        b"IHDR",
        b"iTXt",
        b"pHYs",
        b"IDAT",
        b"IEND",
    ]
    assert "tEXt" in done.stdout and "eXIf" in done.stdout
    assert (
        "KSampler" not in done.stdout + done.stderr
    )  # names what it dropped, never what it held


def test_the_command_writes_elsewhere_and_refuses_what_it_cant_fix(
    tmp_path: Path,
) -> None:
    source, out = tmp_path / "in.glb", tmp_path / "out.glb"
    source.write_bytes(
        dirty_glb(
            extensionsRequired=["KHR_draco_mesh_compression"],
            extensionsUsed=["KHR_draco_mesh_compression"],
        )
    )
    done = run("--out", str(out), str(source))
    assert done.returncode == 1 and not out.exists()
    source.write_bytes(dirty_glb())
    assert run("--out", str(out), str(source)).returncode == 0 and out.exists()
    assert source.read_bytes() == dirty_glb()  # --out leaves the source as it was
    assert run(str(tmp_path / "notes.txt")).returncode == 2


# --------------------------------------------------------------------------------------------------
# The mark follows the record (spec 004, Amendment C1; contracts/intake-amendments.md §13; tasks.md T033)
# --------------------------------------------------------------------------------------------------
MODEL_STEP = {"name": "base mesh", "by": "model"}
HAND_STEP = {"name": "retopology", "by": "hand"}


def amendments(path: Path) -> tuple[str, ...]:
    """The arrival check's AMENDMENTS, read with ast and never run: () while the file or the constant is absent."""
    if not path.is_file():
        return ()
    for node in ast.parse(path.read_text(encoding="utf-8")).body:
        if isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == "AMENDMENTS" for t in node.targets
        ):
            value = ast.literal_eval(node.value)
            return tuple(value) if isinstance(value, tuple) else ()
    return ()


def terms() -> dict[str, str]:
    return {
        "model": scrub.MARK_MODEL,
        "composite": scrub.MARK_COMPOSITE,
        "hand": scrub.MARK_HUMAN,
    }


def write_record(folder: Path, name: str, **over) -> Path:
    entry = {
        "file": name,
        "kind": "room",
        "source": {"type": "design", "id": "D-0001"},
        "steps": [MODEL_STEP, HAND_STEP],
        **over,
    }
    path = folder / "records.json"
    path.write_text(
        json.dumps({"schema": 1, "entries": [entry]}, indent=2) + "\n",
        encoding="utf-8",
    )
    return path


def png_mark(data: bytes) -> bytes:
    return dict(png_chunks(data))[b"iTXt"]


def test_the_three_terms_are_one_constant_each_under_iptcs_vocabulary() -> None:
    found = terms()
    assert len(set(found.values())) == 3
    assert found["model"] == "trainedAlgorithmicMedia"
    assert found["composite"] == "compositeWithTrainedAlgorithmicMedia"
    # IPTC's term for media a human made with non-generative tools (tasks.md T031, settled on 2026-10-30).
    assert found["hand"] == "digitalCreation"
    for term in found.values():
        packet = scrub.mark_packet(term)
        assert (
            f'Iptc4xmpExt:DigitalSourceType="{scrub.SOURCE_TYPES}{term}"'.encode()
            in packet
        )
        assert scrub.mark_json(term)["Iptc4xmpExt:DigitalSourceType"] == (
            scrub.SOURCE_TYPES + term
        )
    # Without a record, the mark is the model's, as before.
    assert scrub.MARK_PACKET == scrub.mark_packet(scrub.MARK_MODEL)
    assert scrub.MARK_JSON == scrub.mark_json(scrub.MARK_MODEL)


@pytest.mark.parametrize(
    "steps, which",
    [
        ([MODEL_STEP], "model"),
        ([MODEL_STEP, MODEL_STEP], "model"),
        ([MODEL_STEP, HAND_STEP], "composite"),
        ([HAND_STEP, MODEL_STEP, HAND_STEP], "composite"),
        ([HAND_STEP], "hand"),
        ([HAND_STEP, HAND_STEP], "hand"),
    ],
    ids=["model", "models", "mixed", "mixed-3", "hand", "hands"],
)
def test_record_writes_the_mark_the_steps_call_for(
    tmp_path: Path, steps: list[dict], which: str
) -> None:
    term = terms()[which]
    record = write_record(tmp_path, "card.png", steps=steps)
    card = tmp_path / "card.png"
    card.write_bytes(dirty_png())
    done = run("--record", str(record), str(card))
    assert done.returncode == 0, done.stderr
    assert png_mark(card.read_bytes()) == (
        b"XML:com.adobe.xmp\x00\x00\x00\x00\x00" + scrub.mark_packet(term)
    )
    model = tmp_path / "desk.glb"
    model.write_bytes(dirty_glb())
    record = write_record(tmp_path, "desk.glb", steps=steps)
    done = run("--record", str(record), str(model))
    assert done.returncode == 0, done.stderr
    gltf, _ = unpack_glb(model.read_bytes())
    assert gltf["extensions"] == {
        "KHR_xmp_json_ld": {"packets": [scrub.mark_json(term)]}
    }


def test_record_matches_the_outputs_name(tmp_path: Path) -> None:
    # The entry is the one whose file is the output's name: --out's, when it's given.
    source, out = tmp_path / "export.png", tmp_path / "card.png"
    source.write_bytes(dirty_png())
    record = write_record(tmp_path, "card.png", steps=[HAND_STEP])
    done = run("--record", str(record), "--out", str(out), str(source))
    assert done.returncode == 0, done.stderr
    assert scrub.mark_packet(scrub.MARK_HUMAN) in out.read_bytes()
    record = write_record(tmp_path, "export.png", steps=[HAND_STEP])
    out.unlink()
    done = run("--record", str(record), "--out", str(out), str(source))
    assert done.returncode == 2 and not out.exists()


@pytest.mark.parametrize(
    "sha256", [None, 12, "not a hash"], ids=["absent", "a-number", "text"]
)
def test_record_never_reads_the_entrys_sha256(tmp_path: Path, sha256) -> None:
    # The Author fills the hash in after the scrub, so whatever it holds, the scrub doesn't look.
    over = {} if sha256 is None else {"sha256": sha256}
    record = write_record(tmp_path, "card.png", steps=[MODEL_STEP], **over)
    card = tmp_path / "card.png"
    card.write_bytes(dirty_png())
    done = run("--record", str(record), str(card))
    assert done.returncode == 0, done.stderr


@pytest.mark.parametrize(
    "over",
    [
        {"file": "other.png"},
        {"steps": None},
        {"steps": []},
        {"steps": [MODEL_STEP, {"name": "a pass", "by": "agent"}]},
        {"steps": [{"name": "a pass"}]},
        {"steps": ["model"]},
    ],
    ids=["no-entry", "no-steps", "empty-steps", "agent", "no-by", "not-a-step"],
)
def test_record_exits_2_and_writes_nothing_when_it_cant_say_which_mark(
    tmp_path: Path, over: dict
) -> None:
    record = write_record(tmp_path, "card.png", **over)
    if over.get("steps", 1) is None:
        doc = json.loads(record.read_text(encoding="utf-8"))
        del doc["entries"][0]["steps"]
        record.write_text(json.dumps(doc), encoding="utf-8")
    card = tmp_path / "card.png"
    card.write_bytes(dirty_png())
    done = run("--record", str(record), str(card))
    assert done.returncode == 2, done.stdout + done.stderr
    assert card.read_bytes() == dirty_png()
    assert (
        "agent" not in done.stdout + done.stderr
    )  # it names the problem, never a value


def test_record_that_isnt_json_or_isnt_there_exits_2(tmp_path: Path) -> None:
    card = tmp_path / "card.png"
    card.write_bytes(dirty_png())
    bad = tmp_path / "records.json"
    bad.write_text("{not json", encoding="utf-8")
    assert run("--record", str(bad), str(card)).returncode == 2
    assert run("--record", str(tmp_path / "missing.json"), str(card)).returncode == 2
    assert card.read_bytes() == dirty_png()


def test_two_entries_naming_the_output_exit_2(tmp_path: Path) -> None:
    card = tmp_path / "card.png"
    card.write_bytes(dirty_png())
    entry = {"file": "card.png", "steps": [HAND_STEP]}
    record = tmp_path / "records.json"
    record.write_text(json.dumps({"entries": [entry, entry]}), encoding="utf-8")
    assert run("--record", str(record), str(card)).returncode == 2


# Once spec 004's P-5 is on main (its Amendment C1), the arrival check admits all three marks; until then, only the
# model's. So the hand-made and composite parity cases wait for main's check to carry 004-C1 (T044 runs them).
@pytest.mark.parametrize("which", ["model", "composite", "hand"])
@pytest.mark.parametrize(
    "kind, build",
    [
        ("png", dirty_png),
        ("jpeg", dirty_jpeg),
        ("webp", dirty_webp),
        ("glb", dirty_glb),
    ],
)
def test_each_mark_passes_the_arrival_checks_container_rules(
    kind: str, build, which: str
) -> None:
    if not CHECK.is_file():
        pytest.skip("tools/gates/arrival_check.py arrives with spec 003's patch")
    if which != "model" and "004-C1" not in amendments(CHECK):
        pytest.skip("the arrival check admits this mark from spec 004's P-5 (004-C1)")
    check = load(CHECK, "arrival_check_for_scrub_marks")
    clean = scrub.scrub_bytes(build(), kind, term=terms()[which])
    assert check.container_findings(clean, kind) == []


# T069 (spec 016, FR-058; plan.md R-16; SC-015): the record's directory decides first. Under assets/twin, at any depth,
# or docs/research/images (the arrival check's MODEL_ONLY), the mark is trainedAlgorithmicMedia whatever the steps say,
# as the arrival check's C1 wants; under any other directory, the steps decide, as before.
@pytest.mark.parametrize(
    "directory, which",
    [
        ("assets/twin", "model"),
        ("assets/twin/sub", "model"),
        ("docs/research/images", "model"),
        ("assets/room", "composite"),
        ("assets/twinned", "composite"),
        ("assets/visitors/man", "composite"),
    ],
)
def test_record_under_the_twins_folder_takes_the_models_mark_whatever_the_steps(
    tmp_path: Path, directory: str, which: str
) -> None:
    record = tmp_path / "records.json"
    entry = {
        "file": "still.png",
        "kind": "still",
        "source": {"type": "photo", "id": "H01"},
        "steps": [MODEL_STEP, HAND_STEP, MODEL_STEP],
    }
    record.write_text(
        json.dumps({"schema": 1, "directory": directory, "entries": [entry]}, indent=2)
        + "\n",
        encoding="utf-8",
    )
    still = tmp_path / "still.png"
    still.write_bytes(dirty_png())
    done = run("--record", str(record), str(still))
    assert done.returncode == 0, done.stderr
    assert png_mark(still.read_bytes()) == (
        b"XML:com.adobe.xmp\x00\x00\x00\x00\x00" + scrub.mark_packet(terms()[which])
    )
    assert scrub.term_from_record(record, "still.png") == terms()[which]
