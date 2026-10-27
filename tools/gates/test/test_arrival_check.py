"""Tests for tools/gates/arrival_check.py (spec 003 FR-001, FR-002, FR-004, FR-006 to FR-020; SC-001; tasks.md T008;
contracts/arrival-check.md §5).

Each test builds a throwaway repository with arrival_fixtures.py, whose `main` holds the policy, and runs the check as
the hook, make check, and the gate do: by path, through `python3 -I -B -X pycache_prefix=/dev/null`. It reads the
check's lines, `<rule> <path>[ @<commit>]: <reason>`, and its exit code: 0 nothing refused, 1 a finding, 2 can't check.
"""

from __future__ import annotations

import importlib.util
import re
import struct
import subprocess
import sys
import time
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "arrival_check.py"
SPEC = importlib.util.spec_from_file_location(
    "arrival_fixtures", HERE / "arrival_fixtures.py"
)
assert SPEC and SPEC.loader
fx = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = fx
SPEC.loader.exec_module(fx)

LINE = re.compile(
    r"^(?P<rule>[A-Z]\d+) (?P<path>\S+)(?: @(?P<commit>[0-9a-f]{7,40}))?: (?P<reason>.+)$"
)
DOG = "assets/visitors/dog"
TWIN = "assets/twin"
NOTE_DIR = "docs/research/images/2026-10-12-image-model-evaluation"
NOTE = "docs/research/2026-10-12-image-model-evaluation.md"


class Run:
    def __init__(self, done: subprocess.CompletedProcess[str]) -> None:
        self.code = done.returncode
        self.out = done.stdout + done.stderr
        self.findings = [
            m.groupdict() for m in map(LINE.match, done.stdout.splitlines()) if m
        ]

    def rules(self, path: str | None = None) -> set[str]:
        return {f["rule"] for f in self.findings if path is None or f["path"] == path}

    def has(
        self, rule: str, path: str | None = None, commit: str | None = None
    ) -> bool:
        return any(
            f["rule"] == rule
            and (path is None or f["path"] == path)
            and (commit is None or (f["commit"] and commit.startswith(f["commit"])))
            for f in self.findings
        )


def ident(value: object) -> str | None:
    """A short test ID: a file name as it is, and bytes by their length, never their content."""
    if isinstance(value, bytes):
        return f"{len(value)}-bytes"
    return value if isinstance(value, str) else None


def check(repo: fx.Repo, *args: str) -> Run:
    done = subprocess.run(
        [
            sys.executable,
            "-I",
            "-B",
            "-X",
            "pycache_prefix=/dev/null",
            str(SCRIPT),
            "--repo",
            str(repo.root),
            *args,
        ],
        cwd=repo.root,
        env=repo.env(),
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
    )
    return Run(done)


def paths(repo: fx.Repo, *names: str) -> list[str]:
    return [str(repo.root / n) for n in names]


@pytest.fixture
def repo(tmp_path: Path) -> fx.Repo:
    return fx.repository(tmp_path)


def twin_policy(
    *,
    glb_data: bytes,
    line: str | None = "This avatar is a stylized likeness of the Author.",
) -> list[dict]:
    return [fx.approval("A-0001", glb_data, f"{TWIN}/twin.glb", line=line)]


# --------------------------------------------------------------------------------------------------
# What passes (SC-001: every passing fixture passes)
# --------------------------------------------------------------------------------------------------
def passing_files() -> dict[str, bytes]:
    return {
        "still.png": fx.png(),
        "photo-free.jpg": fx.jpeg(),
        "preview.webp": fx.webp(),
        "dog.glb": fx.glb(),
    }


def test_every_passing_fixture_passes(repo: fx.Repo) -> None:
    files = passing_files()
    repo.directory(DOG, files)
    run = check(repo, *paths(repo, *(f"{DOG}/{n}" for n in files)))
    assert run.code == 0, run.out
    assert run.findings == []
    for name in files:
        assert f"{DOG}/{name}" in run.out  # the size table names each file


def test_the_twin_passes_with_its_approval_and_the_disclosure_line(
    tmp_path: Path,
) -> None:
    twin = fx.glb(target_names=["jawOpen", "viseme_aa"])
    repo = fx.repository(tmp_path, approvals=twin_policy(glb_data=twin))
    record = fx.entry(
        "twin.glb",
        twin,
        kind="avatar",
        likeness=True,
        source=("photo", "PH-0001"),
        approval="A-0001",
    )
    repo.directory(TWIN, {"twin.glb": twin}, [record])
    run = check(repo, *paths(repo, f"{TWIN}/twin.glb"))
    assert run.code == 0, run.out


def test_a_published_image_passes_under_research_display(repo: fx.Repo) -> None:
    grid = fx.jpeg()
    record = fx.entry(
        "t1-grid.jpg",
        grid,
        kind="published-image",
        steps=[fx.model_step("example-research", "2025-01")],
        arm="B",
        note=NOTE,
    )
    repo.directory(NOTE_DIR, {"t1-grid.jpg": grid}, [record])
    repo.write(
        NOTE,
        f"# Evaluation\n\n![T1, arm B](images/2026-10-12-image-model-evaluation/t1-grid.jpg)\n{fx.CAPTION}\n",
    )
    run = check(repo, *paths(repo, f"{NOTE_DIR}/t1-grid.jpg"))
    assert run.code == 0, run.out


def test_a_glb_keeping_its_morph_target_names_passes(repo: fx.Repo) -> None:
    model = fx.glb(target_names=["mouthSmileLeft", "viseme_PP", "Hand.L"])
    repo.directory(DOG, {"dog.glb": model})
    assert check(repo, *paths(repo, f"{DOG}/dog.glb")).code == 0


def test_pixel_data_holding_a_path_by_chance_passes(repo: fx.Repo) -> None:
    raw = fx.scanlines(8, 8, fill=b"C:\\/mnt/x")
    image = fx.png(width=8, height=8, raw=raw, level=0)
    assert b"C:\\" in image and b"/mnt/" in image
    repo.directory(DOG, {"still.png": image})
    run = check(repo, *paths(repo, f"{DOG}/still.png"))
    assert run.code == 0, run.out


def test_an_empty_directory_needs_no_policy_and_may_keep_its_placeholders(
    tmp_path: Path,
) -> None:
    repo = fx.repository(tmp_path, with_policy=False)
    repo.write(f"{TWIN}/records.json", fx.records(TWIN, []))
    repo.write(f"{TWIN}/LICENSE.md", fx.notice("<YEAR>", "<HOLDER>"))
    repo.write("assets/README.md", "# Assets\n")
    repo.commit("empty directories")
    run = check(repo, "--range", "main..HEAD")
    assert run.code == 0, run.out


# --------------------------------------------------------------------------------------------------
# Each rule refuses its fixture (SC-001)
# --------------------------------------------------------------------------------------------------
def outside(repo: fx.Repo, name: str, data: bytes) -> Run:
    repo.write(name, data)
    return check(repo, *paths(repo, name))


def in_dog(
    repo: fx.Repo, name: str, data: bytes, entries: list[dict] | None = None
) -> Run:
    repo.directory(DOG, {name: data}, entries)
    return check(repo, *paths(repo, f"{DOG}/{name}"))


@pytest.mark.parametrize(
    "name, data",
    [
        ("docs/photo.jpg", fx.jpeg()),
        ("docs/IMG_0001.heic", fx.isobmff(b"heic", b"mif1", b"heic")),
        ("docs/cover.avif", fx.isobmff(b"avif", b"mif1", b"avif")),
        ("docs/scan.tif", fx.tiff_with_gps()),
        ("docs/raw.dng", fx.tiff_with_gps(dng=True)),
        ("docs/clip.mov", fx.isobmff(b"qt  ")),
        ("docs/clip.mp4", fx.isobmff(b"isom", b"mp41")),
        (
            "docs/renamed.dat",
            fx.isobmff(b"heic"),
        ),  # a HEIC under another name: by its ftyp
        ("services/x.png", fx.png()),
        ("docs/model.glb", fx.glb()),
    ],
    ids=ident,
)
def test_a1_an_image_video_or_model_outside_the_roots(
    repo: fx.Repo, name: str, data: bytes
) -> None:
    run = outside(repo, name, data)
    assert run.code == 1 and run.has("A1", name), run.out


def test_a1_photos_with_gps_also_meet_a4(repo: fx.Repo) -> None:
    for name, data in [
        ("docs/IMG_0002.heic", fx.isobmff(b"heic")),
        ("docs/scan2.tif", fx.tiff_with_gps()),
    ]:
        run = outside(repo, name, data)
        assert run.has("A1", name) and run.has("A4", name), run.out


@pytest.mark.parametrize(
    "name, data",
    [
        ("models/style.safetensors", fx.safetensors_header()),
        ("models/renamed.dat", fx.safetensors_header()),  # by its header
        ("models/quant.gguf", b"GGUF" + bytes(32)),
        ("models/net.onnx", b"\x08\x07" + bytes(16)),
        ("models/lora.ckpt", b"PK\x03\x04" + bytes(16)),
        ("models/weights.bin", bytes(1_000_001)),
        (f"{DOG}/style.pth", b"\x80\x02" + bytes(16)),
    ],
    ids=ident,
)
def test_a2_model_weights_anywhere(repo: fx.Repo, name: str, data: bytes) -> None:
    run = outside(repo, name, data)
    assert run.code == 1 and run.has("A2", name), run.out


def test_a2_spares_a_small_bin_outside_the_roots(repo: fx.Repo) -> None:
    run = outside(repo, "services/gateway/fixture.bin", bytes(64))
    assert run.code == 0, run.out


@pytest.mark.parametrize(
    "name, data",
    [
        ("workflow.json", b'{"nodes": []}'),
        ("pack.py", b"print(1)\n"),
        ("dog.gltf", b'{"asset": {"version": "2.0"}}'),
        ("dog.ktx2", b"\xabKTX 20\xbb\r\n\x1a\n" + bytes(16)),
        ("grid.jpg_original", fx.jpeg()),
        ("IMG_0003.heic", fx.isobmff(b"heic")),
        ("clip.mp4", fx.isobmff(b"isom")),
        ("not-a.png", fx.jpeg()),  # its bytes aren't what its name says
    ],
    ids=ident,
)
def test_a3_anything_else_in_an_asset_directory(
    repo: fx.Repo, name: str, data: bytes
) -> None:
    repo.directory(DOG, {"still.png": fx.png()})
    repo.write(f"{DOG}/{name}", data)
    run = check(repo, *paths(repo, f"{DOG}/{name}"))
    assert run.code == 1 and run.has("A3", f"{DOG}/{name}"), run.out


def test_a3_a_file_at_the_top_of_the_asset_tree(repo: fx.Repo) -> None:
    run = outside(repo, "assets/notes.txt", "notes\n")
    assert run.has("A3", "assets/notes.txt"), run.out


def test_a4_camera_metadata_in_a_binary_file_of_no_listed_format(repo: fx.Repo) -> None:
    run = outside(repo, "docs/blob.dat", b"\x00\x01\x02\x03" + fx.exif_block())
    assert run.code == 1 and run.rules("docs/blob.dat") == {"A4"}, run.out
    assert "GPS" in run.out


def test_a4_an_xmp_packet_in_a_binary_file(repo: fx.Repo) -> None:
    run = outside(repo, "docs/blob2.dat", b"\x00\x00" + fx.xmp())
    assert run.has("A4", "docs/blob2.dat"), run.out


@pytest.mark.parametrize("name", ["docs/IMG_0004.xmp", f"{DOG}/still.xmp"])
def test_a4_an_xmp_sidecar_anywhere(repo: fx.Repo, name: str) -> None:
    run = outside(repo, name, fx.xmp(extra=' dc:creator="a camera"'))
    assert run.code == 1 and run.has("A4", name), run.out


def test_a4_spares_a_text_file(repo: fx.Repo) -> None:
    run = outside(
        repo,
        "docs/notes.md",
        "The EXIF header is Exif followed by two NULs; XMP starts <x:xmpmeta.\n",
    )
    assert run.code == 0, run.out


def test_a4_in_an_asset_root_anything_but_the_mark(repo: fx.Repo) -> None:
    # The mark alone passes (test_every_passing_fixture_passes); an EXIF block stored in IDAT, where the M rules
    # don't look, still meets A4, which searches the whole file but the mark's packet.
    raw = fx.scanlines(32, 2, fill=fx.exif_block())
    run = in_dog(repo, "still.png", fx.png(width=32, height=2, raw=raw, level=0))
    assert run.code == 1 and run.rules(f"{DOG}/still.png") == {"A4"}, run.out


def test_m1_a_png_chunk_outside_the_allowlist(repo: fx.Repo) -> None:
    prompt = b'parameters\x00{"prompt": "a portrait", "workflow": {}}'
    run = in_dog(repo, "still.png", fx.png(before=(fx.chunk(b"tEXt", prompt),)))
    assert run.code == 1 and run.has("M1", f"{DOG}/still.png"), run.out
    assert "tEXt" in run.out


@pytest.mark.parametrize("kind", [b"eXIf", b"tIME", b"zTXt"])
def test_m1_other_chunks(repo: fx.Repo, kind: bytes) -> None:
    run = in_dog(repo, "still.png", fx.png(before=(fx.chunk(kind, b"\x00" * 8),)))
    assert run.has("M1", f"{DOG}/still.png"), run.out


def test_m1_two_marks(repo: fx.Repo) -> None:
    run = in_dog(repo, "still.png", fx.png(before=(fx.itxt(fx.xmp()),)))
    assert run.has("M1", f"{DOG}/still.png"), run.out


@pytest.mark.parametrize(
    "extra",
    [
        (fx.segment(0xE1, fx.exif_block()),),  # EXIF APP1
        (fx.segment(0xFE, b"a comment"),),  # COM
        (fx.segment(0xED, b"Photoshop 3.0\x00" + bytes(8)),),  # APP13, IPTC
        (fx.segment(0xE2, b"MPF\x00" + bytes(8)),),  # APP2 that isn't an ICC profile
    ],
)
def test_m2_a_jpeg_segment_outside_the_allowlist(
    repo: fx.Repo, extra: tuple[bytes, ...]
) -> None:
    run = in_dog(repo, "photo-free.jpg", fx.jpeg(extra=extra))
    assert run.code == 1 and run.has("M2", f"{DOG}/photo-free.jpg"), run.out


def test_m2_an_app0_that_isnt_jfif_or_has_a_thumbnail(repo: fx.Repo) -> None:
    run = in_dog(
        repo, "a.jpg", fx.jpeg(app0=fx.segment(0xE0, b"JFXX\x00\x10" + bytes(8)))
    )
    assert run.has("M2", f"{DOG}/a.jpg"), run.out
    run = in_dog(repo, "a.jpg", fx.jpeg(app0=fx.jfif(thumbnail=True)))
    assert run.has("M2", f"{DOG}/a.jpg"), run.out


@pytest.mark.parametrize(
    "kwargs",
    [
        {"extra": (fx.riff_chunk(b"EXIF", fx.exif_block()[6:]),), "flags": 0x04 | 0x08},
        {"extra": (fx.riff_chunk(b"ANIM", bytes(6)),), "flags": 0x04 | 0x02},
        {"flags": 0x04 | 0x08},  # the EXIF flag with no chunk
    ],
)
def test_m3_a_webp_chunk_or_flag_outside_the_allowlist(
    repo: fx.Repo, kwargs: dict
) -> None:
    run = in_dog(repo, "preview.webp", fx.webp(**kwargs))
    assert run.code == 1 and run.has("M3", f"{DOG}/preview.webp"), run.out


@pytest.mark.parametrize(
    "edit",
    [
        lambda g: g["asset"].update(generator="Example Exporter 4.2"),
        lambda g: g["nodes"][0].update(extras={"prompt": "x"}),
        lambda g: g.update(extras={"workflow": 1}),
        lambda g: g["nodes"][0].update(description="not a glTF property"),
        lambda g: g.setdefault("extensionsUsed", []).append(
            "KHR_draco_mesh_compression"
        ),
        lambda g: g["meshes"][0].update(extras={"targetNames": ["a"], "other": 1}),
        lambda g: g["accessors"][0].update(type="VEC9"),
    ],
)
def test_m4_a_glb_outside_the_schema(repo: fx.Repo, edit) -> None:
    run = in_dog(repo, "dog.glb", fx.glb(edit=edit))
    assert run.code == 1 and run.has("M4", f"{DOG}/dog.glb"), run.out


def test_m4_a_third_chunk(repo: fx.Repo) -> None:
    model = fx.glb()
    extra = struct.pack("<I", 4) + b"XTRA" + b"abcd"
    model = model[:8] + struct.pack("<I", len(model) + len(extra)) + model[12:] + extra
    run = in_dog(repo, "dog.glb", model)
    assert run.has("M4", f"{DOG}/dog.glb"), run.out


@pytest.mark.parametrize(
    "name, data",
    [
        ("still.png", fx.png(mark=False)),
        ("photo-free.jpg", fx.jpeg(mark=False)),
        ("preview.webp", fx.webp(mark=False)),
        ("dog.glb", fx.glb(mark=False)),
        ("still2.png", fx.png(packet=fx.xmp(toolkit=True))),
        ("still3.png", fx.png(packet=fx.xmp(extra=' dc:creator="Someone"'))),
        (
            "still4.png",
            fx.png(
                packet=fx.xmp(
                    value="http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture"
                )
            ),
        ),
        (
            "still5.png",
            fx.png(
                packet=fx.xmp().replace(b"<x:xmpmeta", b"<!-- /home/a -->\n<x:xmpmeta")
            ),
        ),
        (
            "dog2.glb",
            fx.glb(
                edit=lambda g: g["extensions"]["KHR_xmp_json_ld"]["packets"][0].update(
                    {"dc:creator": "x"}
                )
            ),
        ),
    ],
    ids=ident,
)
def test_m5_the_mark_missing_or_holding_more(
    repo: fx.Repo, name: str, data: bytes
) -> None:
    run = in_dog(repo, name, data)
    assert run.code == 1 and run.has("M5", f"{DOG}/{name}"), run.out


@pytest.mark.parametrize(
    "image",
    [
        fx.png(mark=False, before=(fx.chunk(b"tEXt", b"Comment\x00made on a phone"),)),
        fx.png(mark=True),  # its own mark: the GLB's one mark covers the model file
        fx.jpeg(mark=False, extra=(fx.segment(0xE1, fx.exif_block()),)),
    ],
    ids=ident,
)
def test_m6_an_embedded_image_with_metadata_or_its_own_mark(
    repo: fx.Repo, image: bytes
) -> None:
    run = in_dog(
        repo,
        "dog.glb",
        fx.glb(
            image=image, edit=None if image[:4] == fx.PNG_SIG[:4] else _jpeg_texture
        ),
    )
    assert run.code == 1 and run.has("M6", f"{DOG}/dog.glb"), run.out


def _jpeg_texture(gltf: dict) -> None:
    gltf["images"][0]["mimeType"] = "image/jpeg"


def test_m7_an_icc_profile_whose_text_holds_a_path(repo: fx.Repo) -> None:
    image = fx.png(
        before=(fx.iccp(b"Display", fx.icc_profile("/home/someone/profile")),)
    )
    run = in_dog(repo, "still.png", image)
    assert run.code == 1 and run.has("M7", f"{DOG}/still.png"), run.out


@pytest.mark.parametrize(
    "kwargs",
    [
        {"image_name": "IMG_1234.jpg"},
        {"image_name": "C:\\Users\\me\\face"},
        {"image_name": "PXL_20261012"},
        {"image_name": "IMG-20261012-WA0003"},  # WhatsApp's
        {"material_name": "20261012_094101"},  # Samsung's
        {"material_name": "skin_diffuse.png"},
        {"node_name": "textures/face"},
        {"target_names": ["DSC01234"]},
        {"edit": lambda g: g["images"][0].update(uri="face.png")},
        {
            "edit": lambda g: g["buffers"][0].update(
                uri="data:application/octet-stream;base64,AAAA"
            )
        },
    ],
)
def test_m8_a_file_name_or_path_in_a_glb(repo: fx.Repo, kwargs: dict) -> None:
    run = in_dog(repo, "dog.glb", fx.glb(**kwargs))
    assert run.code == 1 and run.has("M8", f"{DOG}/dog.glb"), run.out


@pytest.mark.parametrize(
    "name, data",
    [
        ("still.png", fx.png(trailing=b"/home/someone/prompt.txt")),
        ("photo-free.jpg", fx.jpeg(trailing=b"\xff\xd8 a second image")),
        ("preview.webp", fx.webp(trailing=b"past the RIFF size")),
        ("dog.glb", fx.glb(extra_bin=b"workflow: C:\\Users\\me")),
    ],
    ids=ident,
)
def test_m9_bytes_a_container_doesnt_account_for(
    repo: fx.Repo, name: str, data: bytes
) -> None:
    run = in_dog(repo, name, data)
    assert run.code == 1 and run.has("M9", f"{DOG}/{name}"), run.out


def test_m9_spares_alignment_padding_between_views(repo: fx.Repo) -> None:
    # The fixture's index view is 6 bytes, padded with 2 zeros before the texture's view starts on a 4-byte boundary.
    model = fx.glb()
    run = in_dog(repo, "dog.glb", model)
    assert run.code == 0, run.out


def test_b1_a_workflow_record_in_a_glbs_json(repo: fx.Repo) -> None:
    run = in_dog(
        repo,
        "dog.glb",
        fx.glb(node_name='{"class_type": "KSampler", "inputs": {"seed": 1}}'),
    )
    assert run.code == 1 and run.has("B1", f"{DOG}/dog.glb"), run.out


def test_b2_a_model_files_name(repo: fx.Repo) -> None:
    run = in_dog(repo, "dog.glb", fx.glb(node_name="made with flux1-dev.safetensors"))
    assert run.code == 1 and run.has("B2", f"{DOG}/dog.glb"), run.out


def test_b3_a_local_path_in_a_text_part_and_no_matched_bytes_printed(
    repo: fx.Repo,
) -> None:
    secret = "/home/someone-private/"
    run = in_dog(
        repo,
        "still.png",
        fx.png(before=(fx.iccp(secret.encode(), fx.icc_profile("sRGB")),)),
    )
    assert run.code == 1 and run.has("B3", f"{DOG}/still.png"), run.out
    assert secret not in run.out and "someone-private" not in run.out
    assert re.search(r"byte \d+", run.out)


def test_b3_in_records_json(repo: fx.Repo) -> None:
    data = fx.png()
    record = fx.entry(
        "still.png", data, steps=[fx.model_step(revision="see file:///mnt/c/work")]
    )
    run = in_dog(repo, "still.png", data, [record])
    assert run.has("B3", f"{DOG}/records.json"), run.out


def test_r1_no_records_json(repo: fx.Repo) -> None:
    repo.write(f"{DOG}/still.png", fx.png())
    repo.write(f"{DOG}/LICENSE.md", fx.notice())
    run = check(repo, *paths(repo, f"{DOG}/still.png"))
    assert run.code == 1 and run.has("R1"), run.out


@pytest.mark.parametrize(
    "body",
    [
        b"not json",
        b'{"schema": 2, "directory": "assets/visitors/dog", "license": "all-rights-reserved-2026", "entries": []}',
        b'{"schema": 1, "directory": "assets/twin", "license": "all-rights-reserved-2026", "entries": []}',
    ],
    ids=ident,
)
def test_r1_a_records_json_that_fails_the_schema(repo: fx.Repo, body: bytes) -> None:
    repo.directory(DOG, {"still.png": fx.png()})
    repo.write(f"{DOG}/records.json", body)
    run = check(repo, *paths(repo, f"{DOG}/still.png"))
    assert run.has("R1", f"{DOG}/records.json"), run.out


def test_r2_a_file_no_entry_names_and_an_entry_naming_no_file(repo: fx.Repo) -> None:
    data = fx.png()
    repo.directory(DOG, {"still.png": data}, [fx.entry("other.png", data)])
    run = check(repo, *paths(repo, f"{DOG}/still.png"))
    assert (
        run.code == 1
        and run.has("R2", f"{DOG}/still.png")
        and run.has("R2", f"{DOG}/records.json")
    ), run.out


def test_r3_a_hash_that_doesnt_match(repo: fx.Repo) -> None:
    run = in_dog(repo, "still.png", fx.png(), [fx.entry("still.png", fx.png(width=5))])
    assert run.code == 1 and run.has("R3", f"{DOG}/still.png"), run.out


def test_r4_a_missing_field_and_an_unknown_one(repo: fx.Repo) -> None:
    data = fx.png()
    record = fx.entry("still.png", data, location="somewhere")
    del record["made"]
    run = in_dog(repo, "still.png", data, [record])
    assert run.code == 1 and run.has("R4", f"{DOG}/records.json"), run.out
    assert "made" in run.out and "location" in run.out


@pytest.mark.parametrize(
    "change",
    [
        lambda r: r["source"].update(id="IMG_1234.jpg"),
        lambda r: r["steps"][0].update(name="from /photos/front"),
        lambda r: r["steps"][0].update(name="taken at 37.774900, -122.419400"),
        lambda r: r["steps"][0].update(name="shot 2026-10-12T09:41"),
    ],
)
def test_r5_a_path_a_file_name_a_coordinate_or_a_time_in_the_record(
    repo: fx.Repo, change
) -> None:
    data = fx.png()
    record = fx.entry("still.png", data)
    change(record)
    run = in_dog(repo, "still.png", data, [record])
    assert run.code == 1 and run.has("R5", f"{DOG}/records.json"), run.out


@pytest.mark.parametrize("checked", [None, "2026-11-30"])
def test_r6_a_model_step_without_its_refresh_date_or_after_made(
    repo: fx.Repo, checked: str | None
) -> None:
    data = fx.png()
    run = in_dog(
        repo,
        "still.png",
        data,
        [fx.entry("still.png", data, steps=[fx.model_step(checked=checked)])],
    )
    assert run.code == 1 and run.has("R6", f"{DOG}/records.json"), run.out


def test_r7_a_service_whose_disclosure_row_doesnt_exist(repo: fx.Repo) -> None:
    data = fx.png()
    step = {
        "name": "upscale",
        "by": "hand",
        "service": {
            "name": "Example Upscaler",
            "license": "apache-2.0",
            "license_version": "2.0",
            "disclosure_row": "Z9",
        },
    }
    run = in_dog(
        repo,
        "still.png",
        data,
        [fx.entry("still.png", data, steps=[fx.model_step(), step])],
    )
    assert run.code == 1 and run.has("R7", f"{DOG}/records.json"), run.out
    step["service"]["disclosure_row"] = "D4"
    assert (
        check_again(
            repo, data, [fx.entry("still.png", data, steps=[fx.model_step(), step])]
        ).code
        == 0
    )


def check_again(repo: fx.Repo, data: bytes, entries: list[dict]) -> Run:
    repo.directory(DOG, {"still.png": data}, entries)
    return check(repo, *paths(repo, f"{DOG}/still.png"))


@pytest.mark.parametrize(
    "license_id, version, rule",
    [
        ("unknown-1.0", "1", "L1"),  # not on the allowlist
        ("apache-2.0", "1.1", "L1"),  # on it, but not in this version
        ("example-territorial", "1.0", "L1"),  # "everywhere" reads no
        (
            "example-nc",
            "1.0",
            "L2",
        ),  # non-commercial: evaluation-only, with no commercial license
    ],
)
def test_l1_l2_a_license_not_on_the_allowlist_or_not_reading_yes(
    repo: fx.Repo, license_id: str, version: str, rule: str
) -> None:
    data = fx.png()
    steps = [fx.model_step(license_id, version)]
    run = in_dog(repo, "still.png", data, [fx.entry("still.png", data, steps=steps)])
    assert run.code == 1 and run.has(rule, f"{DOG}/still.png"), run.out
    assert (
        license_id in run.out and "Example Model" in run.out
    )  # names the model and the license


def test_l1_a_hand_tools_license(repo: fx.Repo) -> None:
    data = fx.png()
    tool_step = {
        "name": "paint",
        "by": "hand",
        "tools": [
            {
                "name": "Painter",
                "version": "1",
                "license": "proprietary-eula",
                "license_version": "2026",
            }
        ],
    }
    run = in_dog(
        repo,
        "still.png",
        data,
        [fx.entry("still.png", data, steps=[fx.model_step(), tool_step])],
    )
    assert run.has("L1"), run.out


def test_l1_research_display_in_a_published_image_folder(repo: fx.Repo) -> None:
    grid = fx.jpeg()
    record = fx.entry(
        "t1-grid.jpg",
        grid,
        kind="published-image",
        steps=[fx.model_step("example-nc", "1.0")],
        arm="A",
        note=NOTE,
    )
    repo.directory(NOTE_DIR, {"t1-grid.jpg": grid}, [record])
    repo.write(
        NOTE,
        "# Evaluation\n\n![grid](images/2026-10-12-image-model-evaluation/t1-grid.jpg)\n",
    )
    run = check(repo, *paths(repo, f"{NOTE_DIR}/t1-grid.jpg"))
    assert run.has("L1", f"{NOTE_DIR}/t1-grid.jpg") and not run.has("L2"), run.out


def test_l2_an_evaluation_only_license_in_an_asset_directory(repo: fx.Repo) -> None:
    data = fx.png()
    research = [fx.model_step("example-research", "2025-01")]
    run = in_dog(repo, "still.png", data, [fx.entry("still.png", data, steps=research)])
    assert run.code == 1 and run.has("L2", f"{DOG}/still.png"), run.out
    licensed = [
        fx.model_step("example-research", "2025-01", commercial_license="CL-0001")
    ]
    assert (
        check_again(repo, data, [fx.entry("still.png", data, steps=licensed)]).code == 0
    )


def test_n1_no_notice(repo: fx.Repo) -> None:
    data = fx.png()
    repo.directory(DOG, {"still.png": data})
    repo.remove(f"{DOG}/LICENSE.md")
    run = check(repo, *paths(repo, f"{DOG}/still.png"))
    assert run.code == 1 and run.has("N1"), run.out


@pytest.mark.parametrize(
    "text",
    [
        fx.notice("<YEAR>", "<HOLDER>"),
        fx.notice("2026", "<HOLDER>"),
        b"MIT License\n",
        fx.notice().replace(b"All rights reserved.", b"Some rights reserved."),
    ],
    ids=ident,
)
def test_n1_a_notice_that_doesnt_name_the_license_or_keeps_a_placeholder(
    repo: fx.Repo, text: bytes
) -> None:
    repo.directory(DOG, {"still.png": fx.png()}, license_text=text)
    run = check(repo, *paths(repo, f"{DOG}/still.png"))
    assert run.code == 1 and run.has("N1", f"{DOG}/LICENSE.md"), run.out


def test_n2_an_entry_under_another_license(repo: fx.Repo) -> None:
    data = fx.png()
    record = {**fx.entry("still.png", data), "media_license": "cc-by-4.0"}
    run = in_dog(repo, "still.png", data, [record])
    assert run.code == 1 and run.has("N2", f"{DOG}/still.png"), run.out


def test_p1_a_likeness_without_the_authors_approval(repo: fx.Repo) -> None:
    data = fx.png()
    record = fx.entry(
        "still.png", data, likeness=True, source=("photo", "PH-0002"), approval="A-0009"
    )
    run = in_dog(repo, "still.png", data, [record])
    assert run.code == 1 and run.has("P1", f"{DOG}/still.png"), run.out


def test_p1_an_approval_with_a_confirmation_false(tmp_path: Path) -> None:
    data = fx.png()
    repo = fx.repository(
        tmp_path,
        approvals=[
            fx.approval(
                "A-0002", data, f"{DOG}/still.png", kind="still", nothing_locates=False
            )
        ],
    )
    record = fx.entry("still.png", data, likeness=True, approval="A-0002")
    run = in_dog(repo, "still.png", data, [record])
    assert run.has("P1", f"{DOG}/still.png"), run.out


def test_p2_a_room_file_without_the_room_confirmations(tmp_path: Path) -> None:
    model = fx.glb()
    repo = fx.repository(
        tmp_path,
        approvals=[fx.approval("A-0003", model, "assets/room/desk.glb", kind="room")],
    )
    repo.directory(
        "assets/room",
        {"desk.glb": model},
        [fx.entry("desk.glb", model, kind="room", approval="A-0003")],
    )
    run = check(repo, *paths(repo, "assets/room/desk.glb"))
    assert (
        run.code == 1 and run.has("P2", "assets/room/desk.glb") and not run.has("P1")
    ), run.out


def test_p1_every_file_of_the_twin_needs_its_own_approval_whatever_its_record_says(
    tmp_path: Path,
) -> None:
    # A record the branch wrote calls the twin's still no likeness, from a prompt: it still needs the Author's
    # approval of its own hash. Another twin file's approval, the one carrying the disclosure line, doesn't cover it.
    twin, still = fx.glb(), fx.png()
    approvals = twin_policy(glb_data=twin)
    repo = fx.repository(tmp_path, approvals=approvals)
    records = [
        fx.entry("twin.glb", twin, kind="avatar", likeness=True, approval="A-0001"),
        fx.entry(
            "still.png",
            still,
            kind="still",
            likeness=False,
            source=("prompt", "P-0003"),
        ),
    ]
    repo.directory(TWIN, {"twin.glb": twin, "still.png": still}, records)
    run = check(repo, *paths(repo, f"{TWIN}/still.png"))
    assert run.code == 1 and run.has("P1", f"{TWIN}/still.png"), run.out
    assert run.has(
        "R4", f"{TWIN}/records.json"
    )  # and its record must name the approval
    assert not run.has("P1", f"{TWIN}/twin.glb")
    # With its own approval on main, and the record naming it, it passes.
    repo.git("switch", "-q", "main")
    repo.write(
        "assets/policy/approvals.json",
        fx.dumps(
            {
                "schema": 1,
                "approvals": [
                    *approvals,
                    fx.approval("A-0002", still, f"{TWIN}/still.png", kind="still"),
                ],
            }
        ),
    )
    repo.git(
        "add", "assets/policy/approvals.json"
    )  # the policy alone: the twin's files stay untracked
    repo.git("commit", "-q", "-m", "main: the still's approval")
    repo.git("switch", "-q", "feature")
    records[1]["approval"] = "A-0002"
    repo.directory(TWIN, {"twin.glb": twin, "still.png": still}, records)
    run = check(repo, *paths(repo, f"{TWIN}/still.png"))
    assert run.code == 0, run.out


def test_p1_a_record_naming_another_approval(tmp_path: Path) -> None:
    data = fx.png()
    repo = fx.repository(
        tmp_path,
        approvals=[fx.approval("A-0006", data, f"{DOG}/still.png", kind="still")],
    )
    record = fx.entry("still.png", data, likeness=True, approval="A-0007")
    run = in_dog(repo, "still.png", data, [record])
    assert run.has("P1", f"{DOG}/still.png") and "approval ID" in run.out, run.out


def test_p3_the_twin_before_an_approval_carries_the_disclosure_line(
    tmp_path: Path,
) -> None:
    twin = fx.glb()
    repo = fx.repository(tmp_path, approvals=twin_policy(glb_data=twin, line=None))
    record = fx.entry("twin.glb", twin, kind="avatar", likeness=True, approval="A-0001")
    repo.directory(TWIN, {"twin.glb": twin}, [record])
    run = check(repo, *paths(repo, f"{TWIN}/twin.glb"))
    assert run.code == 1 and run.has("P3", f"{TWIN}/twin.glb"), run.out


def test_f1_an_avatar_before_adr_0010_is_accepted(tmp_path: Path) -> None:
    repo = fx.repository(tmp_path, limits=fx.caps(adr="not-accepted"))
    model = fx.glb()
    run = in_dog(repo, "dog.glb", model, [fx.entry("dog.glb", model, kind="avatar")])
    assert run.code == 1 and run.has("F1", f"{DOG}/dog.glb"), run.out
    repo.remove(f"{DOG}/dog.glb")
    still = fx.png()
    run = check_again(repo, still, [fx.entry("still.png", still)])
    assert run.code == 0, run.out  # a still isn't an avatar


def test_f2_over_a_per_asset_cap(tmp_path: Path) -> None:
    repo = fx.repository(
        tmp_path,
        limits=fx.caps(
            per_asset={"avatar": {"bytes": 100, "triangles": 0, "texture_bytes": 10}}
        ),
    )
    run = in_dog(repo, "dog.glb", fx.glb())
    assert run.code == 1 and run.has("F2", f"{DOG}/dog.glb"), run.out
    assert "triangles" in run.out


def test_f3_the_first_visit_over_its_budget(tmp_path: Path) -> None:
    repo = fx.repository(tmp_path, limits=fx.caps(phase2=200))
    repo.directory(DOG, {"dog.glb": fx.glb()})
    repo.directory(TWIN, {}, [])
    repo.commit("a visitor avatar")
    run = check(repo, "--range", "main..HEAD")
    assert run.code == 1 and run.has("F3"), run.out
    assert "first visit (phase 2)" in run.out


def test_h1_the_history_over_its_cap(tmp_path: Path) -> None:
    repo = fx.repository(tmp_path, limits=fx.caps(history=100))
    repo.directory(DOG, {"still.png": fx.png()})
    repo.commit("an image")
    run = check(repo, "--range", "main..HEAD")
    assert run.code == 1 and run.has("H1"), run.out
    assert re.search(r"history: [\d,]+ of 100 bytes", run.out), run.out


def test_c1_an_arm_b_image_without_its_caption(repo: fx.Repo) -> None:
    grid = fx.jpeg()
    record = fx.entry(
        "t1-grid.jpg",
        grid,
        kind="published-image",
        steps=[fx.model_step("example-research", "2025-01")],
        arm="B",
        note=NOTE,
    )
    repo.directory(NOTE_DIR, {"t1-grid.jpg": grid}, [record])
    repo.write(
        NOTE,
        "# Evaluation\n\n![T1, arm B](images/2026-10-12-image-model-evaluation/t1-grid.jpg)\nA caption of another kind.\n",
    )
    run = check(repo, *paths(repo, f"{NOTE_DIR}/t1-grid.jpg"))
    assert run.code == 1 and run.has("C1", f"{NOTE_DIR}/t1-grid.jpg"), run.out


# --------------------------------------------------------------------------------------------------
# The modes: the index, a branch's commits, merges, the tip's tree (FR-004)
# --------------------------------------------------------------------------------------------------
def test_staged_refuses_a_failing_file(repo: fx.Repo) -> None:
    repo.directory(
        DOG, {"still.png": fx.png(before=(fx.chunk(b"tEXt", b"prompt\x00a portrait"),))}
    )
    repo.git("add", "-A")
    run = check(repo, "--staged")
    assert run.code == 1 and run.has("M1", f"{DOG}/still.png"), run.out


def test_staged_passes_a_commit_with_no_studio_file_while_main_has_no_policy(
    tmp_path: Path,
) -> None:
    repo = fx.repository(tmp_path, with_policy=False)
    repo.write("README.md", "# changed\n")
    repo.git("add", "-A")
    run = check(repo, "--staged")
    assert run.code == 0, run.out


def test_exit_2_when_a_studio_file_needs_the_policy_and_main_has_none(
    tmp_path: Path,
) -> None:
    repo = fx.repository(tmp_path, with_policy=False)
    repo.directory(DOG, {"still.png": fx.png()})
    repo.git("add", "-A")
    run = check(repo, "--staged")
    assert run.code == 2 and "arrival-check: can't check" in run.out, run.out
    assert "refs/heads/main" in run.out or "main branch" in run.out


def test_exit_2_when_the_policy_doesnt_parse(tmp_path: Path) -> None:
    repo = fx.Repo(tmp_path / "repo")
    repo.write("docs/data-flow-disclosure.md", fx.DISCLOSURE)
    repo.policy()
    repo.write("assets/policy/caps.json", "{not json")
    repo.commit("main")
    repo.git("switch", "-q", "-c", "feature")
    run = in_dog(repo, "still.png", fx.png())
    assert run.code == 2 and "arrival-check: can't check" in run.out, run.out


def test_exit_2_for_a_range_that_doesnt_resolve(repo: fx.Repo) -> None:
    run = check(repo, "--range", "main..no-such-branch")
    assert run.code == 2 and "arrival-check: can't check" in run.out, run.out


def test_range_fails_on_a_file_fixed_in_a_later_commit(repo: fx.Repo) -> None:
    repo.directory(DOG, {"still.png": fx.png()})
    first = repo.commit("a clean image")
    bad = fx.png(before=(fx.chunk(b"tEXt", b"prompt\x00a portrait"),))
    repo.directory(DOG, {"still.png": bad})
    second = repo.commit("an image with its prompt")
    repo.directory(DOG, {"still.png": fx.png(width=6)})
    third = repo.commit("scrubbed")
    run = check(repo, "--range", "main..HEAD")
    assert run.code == 1 and run.has("M1", f"{DOG}/still.png", second), run.out
    assert not run.has("M1", commit=first) and not run.has("M1", commit=third)
    assert "(3 commits)" in run.out


def test_range_fails_on_a_merge_whose_resolution_adds_a_failing_file(
    repo: fx.Repo,
) -> None:
    repo.directory(DOG, {"still.png": fx.png()})
    repo.commit("feature: a clean image")
    repo.git("switch", "-q", "-c", "side", "main")
    repo.write("docs/side.md", "side\n")
    repo.commit("side: a note")
    repo.git("switch", "-q", "feature")
    repo.git("merge", "-q", "--no-ff", "--no-commit", "side")
    repo.write("docs/merged.jpg", fx.jpeg())  # neither parent has it
    merge = repo.commit("merge side, with a resolution of its own")
    run = check(repo, "--range", "main..HEAD")
    assert run.code == 1 and run.has("A1", "docs/merged.jpg", merge), run.out


def test_range_doesnt_charge_a_merge_with_what_main_brought(repo: fx.Repo) -> None:
    repo.directory(DOG, {"still.png": fx.png()})
    repo.commit("feature: a clean image")
    repo.git("switch", "-q", "main")
    data = fx.png(width=3)
    repo.write(
        "assets/policy/approvals.json",
        fx.dumps(
            {
                "schema": 1,
                "approvals": [
                    fx.approval("A-0004", data, f"{DOG}/x.png", kind="still")
                ],
            }
        ),
    )
    repo.commit("main: an approval, the Author's")
    repo.git("switch", "-q", "feature")
    repo.git("merge", "-q", "--no-ff", "-m", "merge main", "main")
    run = check(repo, "--range", "main..HEAD")
    assert run.code == 0, run.out


def test_range_fails_on_a_tip_that_deleted_a_license_notice(repo: fx.Repo) -> None:
    repo.directory(DOG, {"still.png": fx.png()})
    repo.commit("an image")
    repo.remove(f"{DOG}/LICENSE.md")
    deletion = repo.commit("drop the notice")
    run = check(repo, "--range", "main..HEAD")
    assert run.code == 1 and run.has("N1", commit=deletion), run.out


def test_history_checks_every_commit_and_spares_the_authors_policy_commits(
    repo: fx.Repo,
) -> None:
    repo.directory(DOG, {"still.png": fx.png(trailing=b"x")})
    bad = repo.commit("an image with trailing bytes")
    run = check(repo, "--history")
    assert (
        run.code == 1 and run.has("M9", f"{DOG}/still.png", bad) and not run.has("A9")
    ), run.out


# --------------------------------------------------------------------------------------------------
# The policy comes from refs/heads/main, read as the gate reads it (R-05)
# --------------------------------------------------------------------------------------------------
def likeness_dir(repo: fx.Repo) -> bytes:
    data = fx.png()
    repo.directory(
        DOG,
        {"still.png": data},
        [fx.entry("still.png", data, likeness=True, approval="A-0005")],
    )
    return data


def approving_policy(data: bytes) -> bytes:
    return fx.dumps(
        {
            "schema": 1,
            "approvals": [
                fx.approval("A-0005", data, f"{DOG}/still.png", kind="still")
            ],
        }
    )


def test_a9_a_branch_that_approves_its_own_file(repo: fx.Repo) -> None:
    data = likeness_dir(repo)
    repo.write("assets/policy/approvals.json", approving_policy(data))
    commit = repo.commit("the image and its own approval")
    run = check(repo, "--range", "main..HEAD")
    assert run.code == 1 and run.has("A9", "assets/policy/approvals.json", commit), (
        run.out
    )
    assert run.has("P1", f"{DOG}/still.png"), (
        run.out
    )  # the branch's approval doesn't count


def test_a9_staged_on_a_branch_but_not_the_authors_commit_on_main(
    repo: fx.Repo,
) -> None:
    repo.write(
        "assets/policy/approvals.json", fx.dumps({"schema": 1, "approvals": []}) + b"\n"
    )
    repo.git("add", "-A")
    assert check(repo, "--staged").has("A9", "assets/policy/approvals.json")
    repo.git("stash", "-q")
    repo.git("switch", "-q", "main")
    repo.git("stash", "pop", "-q")
    repo.git("add", "-A")
    run = check(repo, "--staged")
    assert run.code == 0, run.out


def test_the_main_working_trees_checked_out_policy_is_ignored(repo: fx.Repo) -> None:
    data = likeness_dir(repo)
    repo.write(
        "assets/policy/approvals.json", approving_policy(data)
    )  # on disk only, never on main
    run = check(repo, *paths(repo, f"{DOG}/still.png"))
    assert run.has("P1", f"{DOG}/still.png"), run.out


def test_a_tag_named_main_and_a_replace_ref_are_ignored(repo: fx.Repo) -> None:
    # A branch whose policy approves the file, then a tag named main and a replace ref that both point at it: a
    # check that read `main:` or followed refs/replace would find the approval.
    data = fx.png()
    repo.git("switch", "-q", "-c", "other", "main")
    repo.write("assets/policy/approvals.json", approving_policy(data))
    other = repo.commit("a policy main doesn't have")
    repo.git("switch", "-q", "feature")
    assert likeness_dir(repo) == data
    repo.git("tag", "main", other)
    repo.git("replace", repo.git("rev-parse", "refs/heads/main"), other)
    run = check(repo, *paths(repo, f"{DOG}/still.png"))
    assert run.has("P1", f"{DOG}/still.png"), run.out


# --------------------------------------------------------------------------------------------------
# Output, and speed
# --------------------------------------------------------------------------------------------------
def test_the_size_table_and_the_totals(repo: fx.Repo) -> None:
    repo.directory(DOG, {"dog.glb": fx.glb()})
    repo.commit("a model")
    run = check(repo, "--range", "main..HEAD")
    assert run.code == 0, run.out
    row = next(
        line for line in run.out.splitlines() if line.startswith(f"{DOG}/dog.glb")
    )
    assert row.split()[3:5] == ["3", "1"]  # vertices, triangles
    assert "first visit (phase 2):" in run.out and "of 10,000,000 bytes" in run.out
    assert "history:" in run.out and "of 500,000,000 bytes" in run.out
    assert "arrival-check: 0 findings" in run.out


def test_a_10_mb_glb_is_read_quickly(repo: fx.Repo) -> None:
    model = fx.big_glb(10)
    assert len(model) > 9_000_000
    repo.directory(DOG, {"dog.glb": model})
    start = time.monotonic()
    run = check(repo, *paths(repo, f"{DOG}/dog.glb"))
    elapsed = time.monotonic() - start
    assert run.code == 0, run.out
    assert elapsed < 5, f"{elapsed:.2f} s for a 10 MB GLB"


def test_a_path_outside_the_repository_is_refused_without_naming_it(
    repo: fx.Repo, tmp_path: Path
) -> None:
    stray = tmp_path / "elsewhere" / "private-name.png"
    stray.parent.mkdir()
    stray.write_bytes(fx.png())
    run = check(repo, str(stray))
    assert run.code == 2 and "arrival-check: can't check" in run.out, run.out
    assert "private-name" not in run.out and "elsewhere" not in run.out
