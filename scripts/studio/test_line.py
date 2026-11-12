"""The studio line's checks (spec 017 User Story 4, FR-026 to FR-029; contracts/studio-line.md; tasks.md T040 to T044).

`scripts/studio/line.py` runs as `python3 -I -B scripts/studio/line.py brief|candidate|round ...`, and every case
here runs it that way, as a subprocess:
- briefs (T040): a valid brief passes; a round outside 1 to 3, a limit above main's caps.json for the kind, a tool
  whose list entry isn't `outputs_ship: true`, a tool named Qwen-Image or FLUX [dev] whatever the list says, and a
  missing field each fail with one line naming the field;
- candidates (T041), on GLBs built here with struct and json: triangles, bytes, and texture pixels and bytes from the
  embedded PNG and JPEG headers; the required bones from the skins' joints and the clips from the animations; a tool
  outside the brief or the list; a record step naming Qwen-Image-2.1 or FLUX [dev], refused even if listed; a file
  named but absent;
- rounds (T042): `line.py round` prints `decide` after three failed rounds, and `line.py brief` refuses a round 4;
- the arrival check's step (T044): main's copy, read from refs/heads/main of a repository built here, whose
  tools/gates/arrival_check.py is a stand-in, so nothing depends on the real one. A tag named main and the working
  tree's copy never answer.

The tools list (assets/policy/studio-tools.json) is the Author's patch P-7, so the list here is a fixture in the
data model's shape. Everything is built at run time; nothing touches the network.
"""

from __future__ import annotations

import json
import os
import struct
import subprocess
import sys
import zlib
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
LINE = HERE / "line.py"

CAPS = {
    "schema": 1,
    "per_asset": {
        "room": {"gzip_bytes": 2500000, "triangles": 100000},
        "avatar": {"bytes": 21000000, "triangles": 180000, "texture_bytes": 46000000},
        "animation": {"bytes": 1000000},
        "still": {"bytes": 300000},
        "preview": {"bytes": 300000},
    },
}


def tool(tid: str, kind: str, version: str, license_id: str, ship: bool) -> dict:
    return {
        "id": tid,
        "kind": kind,
        "version": version,
        "license": license_id,
        "outputs_ship": ship,
    }


TOOLS = {
    "schema": 1,
    "tools": [
        tool("comfyui-core", "node", "0.3", "gpl-3.0", True),
        tool("sdxl-base-1.0", "weight", "1.0", "apache-2.0", True),
        tool("blender", "tool", "5.2.3", "gpl-3.0-or-later", True),
        tool("sdxl-turbo", "weight", "1.0", "apache-2.0", False),
        tool("qwen-image-2.1", "weight", "2.1", "apache-2.0", False),
        tool("flux-dev", "weight", "1.0", "apache-2.0", False),
    ],
}


def brief_doc(**over) -> dict:
    doc = {
        "schema": 1,
        "asset": "dog",
        "kind": "avatar",
        "spec": "019-the-dog",
        "round": 1,
        "limits": {
            "bytes": 21000000,
            "triangles": 180000,
            "texture_bytes": 46000000,
            "texture_px": 2048,
            "skeleton": "mixamo",
            "bones_required": ["Hips", "Spine"],
            "clips": ["idle", "walk"],
        },
        "tools": ["comfyui-core", "sdxl-base-1.0", "blender"],
        "references": ["assets/visitors/dog/still.png"],
        "findings": [],
        "notes": "A dog, rigged, idle and walk.",
    }
    doc.update(over)
    return doc


def run(*args: str | Path, cwd: Path | None = None) -> subprocess.CompletedProcess:
    env = {k: v for k, v in os.environ.items() if not k.startswith(("GIT_", "PYTHON"))}
    return subprocess.run(
        [sys.executable, "-I", "-B", str(LINE), *map(str, args)],
        capture_output=True,
        text=True,
        cwd=cwd,
        env=env,
        timeout=120,
        check=False,
    )


def lines(done: subprocess.CompletedProcess) -> list[str]:
    return done.stdout.splitlines()


def starting(done: subprocess.CompletedProcess, prefix: str) -> list[str]:
    return [line for line in lines(done) if line.startswith(prefix)]


def cant_run(done: subprocess.CompletedProcess) -> bool:
    """Exit 2 with line.py's own reason, so Python's exit 2 for a script it can't open never passes for it."""
    return done.returncode == 2 and "line: can't run: " in done.stdout


@pytest.fixture
def policy(tmp_path: Path) -> dict[str, Path]:
    caps = tmp_path / "caps.json"
    caps.write_text(json.dumps(CAPS))
    tools = tmp_path / "studio-tools.json"
    tools.write_text(json.dumps(TOOLS))
    return {"caps": caps, "tools": tools}


def write_brief(root: Path, doc: dict, name: str | None = None) -> Path:
    folder = root / "briefs" / str(doc.get("asset", "dog"))
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / (name or f"{doc.get('round', 1)}.json")
    path.write_text(json.dumps(doc))
    return path


def brief(path: Path, policy: dict[str, Path]) -> subprocess.CompletedProcess:
    return run("brief", path, "--caps", policy["caps"], "--tools", policy["tools"])


# --------------------------------------------------------------------------------------------------
# Images and GLBs, built here
# --------------------------------------------------------------------------------------------------
PNG_SIG = b"\x89PNG\r\n\x1a\n"


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + kind
        + data
        + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    )


def png(width: int, height: int) -> bytes:
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (
        PNG_SIG
        + png_chunk(b"IHDR", ihdr)
        + png_chunk(b"IDAT", zlib.compress(b"\x00" * 8))
        + png_chunk(b"IEND", b"")
    )


def jpeg(width: int, height: int) -> bytes:
    app0 = b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    sof = struct.pack(">BHHB", 8, height, width, 1) + b"\x01\x11\x00"
    return (
        b"\xff\xd8"
        + b"\xff\xe0"
        + struct.pack(">H", len(app0) + 2)
        + app0
        + b"\xff\xc0"
        + struct.pack(">H", len(sof) + 2)
        + sof
        + b"\xff\xd9"
    )


def glb(
    *,
    triangles: int = 1000,
    indexed: bool = True,
    joints: tuple[str, ...] = ("Hips", "Spine"),
    clips: tuple[str, ...] = ("idle", "walk"),
    images: tuple[bytes, ...] = (),
    pad: int = 0,
) -> bytes:
    """A glTF 2.0 binary: one JSON chunk and one BIN chunk, the images' bytes in the BIN chunk's buffer views."""
    accessors = [{"componentType": 5126, "type": "VEC3", "count": triangles * 3}]
    primitive: dict = {"attributes": {"POSITION": 0}}
    if indexed:
        accessors[0]["count"] = triangles + 2
        accessors.append(
            {"componentType": 5125, "type": "SCALAR", "count": triangles * 3}
        )
        primitive["indices"] = 1
    binary, views, imgs = b"", [], []
    for i, data in enumerate(images):
        views.append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(data)})
        imgs.append({"bufferView": i, "mimeType": "image/png"})
        binary += data + b"\x00" * (-len(data) % 4)
    binary += b"\x00" * (pad + (-pad % 4))
    gltf: dict = {
        "asset": {"version": "2.0"},
        "accessors": accessors,
        "meshes": [{"primitives": [primitive]}],
        "nodes": [{"name": name} for name in joints] + [{"name": "Body", "mesh": 0}],
    }
    if joints:
        gltf["skins"] = [{"joints": list(range(len(joints)))}]
    if clips:
        gltf["animations"] = [
            {"name": c, "channels": [], "samplers": []} for c in clips
        ]
    if images:
        gltf["images"] = imgs
        gltf["bufferViews"] = views
    if binary:
        gltf["buffers"] = [{"byteLength": len(binary)}]
    text = json.dumps(gltf).encode()
    text += b" " * (-len(text) % 4)
    body = struct.pack("<II", len(text), 0x4E4F534A) + text
    if binary:
        body += struct.pack("<II", len(binary), 0x004E4942) + binary
    return b"glTF" + struct.pack("<II", 2, 12 + len(body)) + body


# --------------------------------------------------------------------------------------------------
# A repository whose refs/heads/main holds main's policy, the disclosure, and a stand-in arrival check
# --------------------------------------------------------------------------------------------------
GIT_ENV = {
    "GIT_CONFIG_NOSYSTEM": "1",
    "GIT_CONFIG_GLOBAL": os.devnull,
    "GIT_AUTHOR_NAME": "test",
    "GIT_AUTHOR_EMAIL": "test@example.invalid",
    "GIT_COMMITTER_NAME": "test",
    "GIT_COMMITTER_EMAIL": "test@example.invalid",
    "GIT_AUTHOR_DATE": "2026-11-12T00:00:00Z",
    "GIT_COMMITTER_DATE": "2026-11-12T00:00:00Z",
}


def git(repo: Path, *args: str, data: bytes | None = None) -> str:
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env.update(GIT_ENV)
    done = subprocess.run(
        ["git", "-C", str(repo), *args],
        input=data,
        capture_output=True,
        env=env,
        check=True,
    )
    return done.stdout.decode().strip()


def commit_tree(repo: Path, files: dict[str, str]) -> str:
    """A commit holding exactly `files`, made with plumbing only (no hook runs), its parentless SHA returned."""
    index = repo / ".git" / "test-index"
    env_index = {"GIT_INDEX_FILE": str(index)}
    for rel, text in files.items():
        oid = git(repo, "hash-object", "-w", "--stdin", data=text.encode())
        subprocess.run(
            [
                "git",
                "-C",
                str(repo),
                "update-index",
                "--add",
                "--cacheinfo",
                f"100644,{oid},{rel}",
            ],
            env={**os.environ, **GIT_ENV, **env_index},
            check=True,
            capture_output=True,
        )
    tree = (
        subprocess.run(
            ["git", "-C", str(repo), "write-tree"],
            env={**os.environ, **GIT_ENV, **env_index},
            check=True,
            capture_output=True,
        )
        .stdout.decode()
        .strip()
    )
    index.unlink()
    return git(repo, "commit-tree", "-m", "fixture", tree)


STANDIN = r"""
import json, os, subprocess, sys
args = sys.argv[1:]
repo = args[args.index("--repo") + 1]
paths = [a for i, a in enumerate(args) if a != "--repo" and (i == 0 or args[i - 1] != "--repo")]
rels = [os.path.relpath(p, repo) for p in paths]
def blob(rel):
    done = subprocess.run(["git", "-C", repo, "cat-file", "blob", "refs/heads/main:" + rel], capture_output=True)
    return done.stdout.decode() if done.returncode == 0 else None
print("STANDIN " + json.dumps({
    "who": WHO,
    "repo": repo,
    "rels": rels,
    "exist": all(os.path.isfile(p) for p in paths),
    "caps": blob("assets/policy/caps.json"),
    "disclosure": blob("docs/data-flow-disclosure.md"),
}))
bad = [r for r in rels if "refuse" in os.path.basename(r)]
for r in bad:
    print("A1 " + r + ": a stand-in finding")
if EXIT == 2:
    print("arrival-check: can't check: a stand-in reason")
    sys.exit(2)
print("arrival-check: %d findings in %d files" % (len(bad), len(rels)))
sys.exit(1 if bad else 0)
"""


def standin(who: str = "main", exit_code: int = 0) -> str:
    return f"WHO = {who!r}\nEXIT = {exit_code}\n" + STANDIN


MAIN_FILES = {
    "assets/policy/caps.json": json.dumps(CAPS),
    "assets/policy/licenses.json": '{"schema": 1, "licenses": []}',
    "assets/policy/approvals.json": '{"schema": 1, "approvals": []}',
    "docs/data-flow-disclosure.md": "# Data-flow disclosure\n",
}


def make_repo(root: Path, *, arrival: str | None = None) -> Path:
    repo = root / "repo"
    repo.mkdir()
    git(repo, "init", "-q", "--template=")
    files = dict(MAIN_FILES)
    if arrival is not None:
        files["tools/gates/arrival_check.py"] = arrival
    main = commit_tree(repo, files)
    git(repo, "update-ref", "refs/heads/main", main)
    git(repo, "symbolic-ref", "HEAD", "refs/heads/main")
    return repo


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    return make_repo(tmp_path, arrival=standin())


# --------------------------------------------------------------------------------------------------
# Candidates
# --------------------------------------------------------------------------------------------------
def record_doc(
    steps: list[dict] | None = None, directory: str = "assets/creatures/dog"
) -> dict:
    return {
        "schema": 1,
        "directory": directory,
        "license": "all-rights-reserved-2026",
        "entries": [
            {
                "file": "dog.glb",
                "kind": "avatar",
                "steps": steps
                if steps is not None
                else [
                    {
                        "name": "base image",
                        "by": "model",
                        "models": [{"name": "sdxl-base-1.0", "role": "primary"}],
                        "tools": [{"name": "comfyui-core", "version": "0.3"}],
                    },
                    {
                        "name": "rig",
                        "by": "hand",
                        "tools": [{"name": "Blender", "version": "5.2.3"}],
                    },
                ],
            }
        ],
    }


def write_candidate(
    root: Path,
    *,
    model: bytes | None = None,
    doc: dict | None = None,
    record: dict | None = None,
    extra: dict[str, bytes] | None = None,
    round_: int = 1,
) -> Path:
    folder = root / "handoff" / "dog" / str(round_)
    folder.mkdir(parents=True)
    files = {"dog.glb": model if model is not None else glb(images=(png(1024, 1024),))}
    files["front.png"] = png(512, 512)
    files.update(extra or {})
    for name, data in files.items():
        (folder / name).write_bytes(data)
    (folder / "records.json").write_text(json.dumps(record or record_doc()))
    cand = doc or {
        "schema": 1,
        "asset": "dog",
        "round": round_,
        "files": ["dog.glb", "front.png"],
        "tools": [{"id": "sdxl-base-1.0", "version": "1.0"}],
        "records": "records.json",
    }
    (folder / "candidate.json").write_text(json.dumps(cand))
    return folder


def candidate(
    folder: Path,
    brief_path: Path,
    policy: dict[str, Path],
    repo: Path,
    *extra: str,
) -> subprocess.CompletedProcess:
    return run(
        "candidate",
        folder,
        "--brief",
        brief_path,
        "--tools",
        policy["tools"],
        "--repo",
        repo,
        *extra,
    )


def standin_report(done: subprocess.CompletedProcess) -> dict:
    found = starting(done, "STANDIN ")
    assert len(found) == 1, done.stdout + done.stderr
    return json.loads(found[0][len("STANDIN ") :])


# ==================================================================================================
# T040: briefs
# ==================================================================================================
def test_a_valid_brief_passes(tmp_path: Path, policy: dict[str, Path]) -> None:
    done = brief(write_brief(tmp_path, brief_doc()), policy)
    assert done.returncode == 0, done.stdout + done.stderr


@pytest.mark.parametrize("value", [0, 4, -1, "1", True, 1.0])
def test_a_round_outside_one_to_three_fails(
    tmp_path: Path, policy: dict[str, Path], value: object
) -> None:
    done = brief(write_brief(tmp_path, brief_doc(round=value), name="1.json"), policy)
    assert done.returncode == 1, done.stdout + done.stderr
    assert starting(done, "round"), done.stdout


@pytest.mark.parametrize(
    ("key", "value", "cap"),
    [
        ("triangles", 180001, "180000"),
        ("bytes", 21000001, "21000000"),
        ("texture_bytes", 46000001, "46000000"),
    ],
)
def test_a_limit_above_caps_fails(
    tmp_path: Path, policy: dict[str, Path], key: str, value: int, cap: str
) -> None:
    doc = brief_doc()
    doc["limits"][key] = value
    done = brief(write_brief(tmp_path, doc), policy)
    assert done.returncode == 1
    found = starting(done, f"limits.{key}")
    assert len(found) == 1, done.stdout
    assert str(value) in found[0] and cap in found[0]


def test_a_limit_at_its_cap_passes(tmp_path: Path, policy: dict[str, Path]) -> None:
    doc = brief_doc()
    doc["limits"]["triangles"] = 180000
    assert brief(write_brief(tmp_path, doc), policy).returncode == 0


def test_a_kind_caps_json_lacks_fails(tmp_path: Path, policy: dict[str, Path]) -> None:
    done = brief(write_brief(tmp_path, brief_doc(kind="creature")), policy)
    assert done.returncode == 1
    assert starting(done, "kind"), done.stdout


@pytest.mark.parametrize("tid", ["sdxl-turbo", "not-on-the-list"])
def test_a_tool_not_outputs_ship_true_fails(
    tmp_path: Path, policy: dict[str, Path], tid: str
) -> None:
    done = brief(write_brief(tmp_path, brief_doc(tools=["comfyui-core", tid])), policy)
    assert done.returncode == 1
    found = starting(done, "tools")
    assert len(found) == 1 and tid in found[0], done.stdout


@pytest.mark.parametrize("tid", ["qwen-image-2.1", "flux-dev"])
def test_qwen_image_and_flux_dev_are_refused_by_name_even_if_listed(
    tmp_path: Path, policy: dict[str, Path], tid: str
) -> None:
    listed = json.loads(policy["tools"].read_text())
    for entry in listed["tools"]:
        entry["outputs_ship"] = True
    policy["tools"].write_text(json.dumps(listed))
    done = brief(write_brief(tmp_path, brief_doc(tools=[tid])), policy)
    assert done.returncode == 1
    found = starting(done, "tools")
    assert len(found) == 1 and tid in found[0] and "refused by name" in found[0], (
        done.stdout
    )


@pytest.mark.parametrize(
    "field",
    [
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
    ],
)
def test_a_missing_field_fails_naming_it(
    tmp_path: Path, policy: dict[str, Path], field: str
) -> None:
    doc = brief_doc()
    del doc[field]
    done = brief(write_brief(tmp_path, doc, name="1.json"), policy)
    assert done.returncode == 1, done.stdout + done.stderr
    assert any(line.startswith(field) and "absent" in line for line in lines(done)), (
        done.stdout
    )


def test_an_unknown_field_fails(tmp_path: Path, policy: dict[str, Path]) -> None:
    done = brief(write_brief(tmp_path, brief_doc(prompt="a dog")), policy)
    assert done.returncode == 1
    assert starting(done, "prompt"), done.stdout


def test_a_finding_line_names_the_check_the_value_and_the_limit(
    tmp_path: Path, policy: dict[str, Path]
) -> None:
    doc = brief_doc()
    doc["limits"]["triangles"] = 200000
    done = brief(write_brief(tmp_path, doc), policy)
    assert "limits.triangles: 200000 (limit: " in done.stdout


def test_round_one_holds_no_findings(tmp_path: Path, policy: dict[str, Path]) -> None:
    done = brief(write_brief(tmp_path, brief_doc(findings=["triangles: 1"])), policy)
    assert done.returncode == 1
    assert starting(done, "findings"), done.stdout


def test_a_brief_whose_name_or_folder_disagrees_fails(
    tmp_path: Path, policy: dict[str, Path]
) -> None:
    path = write_brief(tmp_path, brief_doc(), name="1.json")
    moved = path.parent.parent / "cat" / "1.json"
    moved.parent.mkdir()
    path.rename(moved)
    done = brief(moved, policy)
    assert done.returncode == 1
    assert starting(done, "asset"), done.stdout


def test_a_brief_that_isnt_json_fails(tmp_path: Path, policy: dict[str, Path]) -> None:
    path = write_brief(tmp_path, brief_doc())
    path.write_text("{not json")
    assert brief(path, policy).returncode == 1


@pytest.mark.parametrize("which", ["caps", "tools"])
def test_a_policy_file_that_cant_be_read_exits_2(
    tmp_path: Path, policy: dict[str, Path], which: str
) -> None:
    path = write_brief(tmp_path, brief_doc())
    policy[which].write_text("[]")
    assert cant_run(brief(path, policy))
    policy[which].unlink()
    assert cant_run(brief(path, policy))


def test_a_tools_list_with_unknown_fields_exits_2(
    tmp_path: Path, policy: dict[str, Path]
) -> None:
    listed = json.loads(policy["tools"].read_text())
    listed["tools"][0]["url"] = "x"
    policy["tools"].write_text(json.dumps(listed))
    assert cant_run(brief(write_brief(tmp_path, brief_doc()), policy))


# ==================================================================================================
# T041: candidates
# ==================================================================================================
@pytest.fixture
def brief_path(tmp_path: Path) -> Path:
    return write_brief(tmp_path, brief_doc())


def test_a_good_candidate_passes(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path
) -> None:
    done = candidate(write_candidate(tmp_path), brief_path, policy, repo)
    assert done.returncode == 0, done.stdout + done.stderr
    assert standin_report(done)["who"] == "main"


def test_a_non_indexed_glb_counts_positions(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(tmp_path, model=glb(triangles=180001, indexed=False))
    done = candidate(folder, brief_path, policy, repo)
    assert done.returncode == 1
    found = starting(done, "triangles")
    assert len(found) == 1 and "180001" in found[0] and "180000" in found[0], (
        done.stdout
    )


def test_over_triangles_fails(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path
) -> None:
    done = candidate(
        write_candidate(tmp_path, model=glb(triangles=200000)), brief_path, policy, repo
    )
    assert done.returncode == 1
    found = starting(done, "triangles dog.glb")
    assert len(found) == 1 and "200000" in found[0] and "180000" in found[0], (
        done.stdout
    )


def test_over_bytes_fails(tmp_path: Path, policy: dict[str, Path], repo: Path) -> None:
    doc = brief_doc()
    doc["limits"]["bytes"] = 4096
    path = write_brief(tmp_path, doc)
    model = glb(pad=8192)
    done = candidate(write_candidate(tmp_path, model=model), path, policy, repo)
    assert done.returncode == 1
    found = starting(done, "bytes dog.glb")
    assert len(found) == 1 and str(len(model)) in found[0] and "4096" in found[0], (
        done.stdout
    )


@pytest.mark.parametrize(
    "image", [png(4096, 1024), jpeg(1024, 4096)], ids=["png", "jpeg"]
)
def test_over_texture_pixels_fails(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path, image: bytes
) -> None:
    folder = write_candidate(tmp_path, model=glb(images=(png(512, 512), image)))
    done = candidate(folder, brief_path, policy, repo)
    assert done.returncode == 1
    found = starting(done, "texture_px dog.glb")
    assert len(found) == 1, done.stdout
    assert "images[1]" in found[0] and "4096" in found[0] and "2048" in found[0]


def test_texture_pixels_read_from_a_jpeg_header(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(tmp_path, model=glb(images=(jpeg(2048, 1536),)))
    assert candidate(folder, brief_path, policy, repo).returncode == 0


def test_over_texture_bytes_fails(
    tmp_path: Path, policy: dict[str, Path], repo: Path
) -> None:
    doc = brief_doc()
    doc["limits"]["texture_bytes"] = 1000000
    path = write_brief(tmp_path, doc)
    # 1024 by 1024, RGBA with mipmaps: 1024 * 1024 * 4 * 4 // 3 bytes, the arrival check's own measure.
    folder = write_candidate(tmp_path, model=glb(images=(png(1024, 1024),)))
    done = candidate(folder, path, policy, repo)
    assert done.returncode == 1
    found = starting(done, "texture_bytes dog.glb")
    assert len(found) == 1 and str(1024 * 1024 * 4 * 4 // 3) in found[0], done.stdout


def test_an_image_that_isnt_png_or_jpeg_fails(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(tmp_path, model=glb(images=(b"RIFF\x00\x00\x00\x00WEBP",)))
    done = candidate(folder, brief_path, policy, repo)
    assert done.returncode == 1
    assert starting(done, "texture_px dog.glb"), done.stdout


def test_a_missing_required_bone_fails(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(tmp_path, model=glb(joints=("Hips", "Neck")))
    done = candidate(folder, brief_path, policy, repo)
    assert done.returncode == 1
    found = starting(done, "bones_required")
    assert (
        len(found) == 1 and "Spine" in found[0] and "Hips" not in found[0].split("(")[0]
    ), done.stdout


def test_a_mixamo_prefixed_bone_counts(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(
        tmp_path, model=glb(joints=("mixamorig:Hips", "mixamorig:Spine"))
    )
    assert candidate(folder, brief_path, policy, repo).returncode == 0


def test_a_missing_clip_fails(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(tmp_path, model=glb(clips=("idle",)))
    done = candidate(folder, brief_path, policy, repo)
    assert done.returncode == 1
    found = starting(done, "clips")
    assert len(found) == 1 and "walk" in found[0], done.stdout


def test_a_glb_that_doesnt_parse_fails(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(tmp_path, model=b"glTF\x02\x00\x00\x00" + b"\x00" * 12)
    done = candidate(folder, brief_path, policy, repo)
    assert done.returncode == 1
    assert starting(done, "glb dog.glb"), done.stdout


def cand_doc(**over) -> dict:
    doc = {
        "schema": 1,
        "asset": "dog",
        "round": 1,
        "files": ["dog.glb", "front.png"],
        "tools": [{"id": "sdxl-base-1.0", "version": "1.0"}],
        "records": "records.json",
    }
    doc.update(over)
    return doc


@pytest.mark.parametrize(
    ("tools", "named"),
    [
        ([{"id": "sdxl-turbo", "version": "1.0"}], "sdxl-turbo"),
        ([{"id": "not-on-the-list", "version": "1"}], "not-on-the-list"),
    ],
)
def test_a_tool_outside_the_brief_fails(
    tmp_path: Path,
    policy: dict[str, Path],
    repo: Path,
    brief_path: Path,
    tools: list,
    named: str,
) -> None:
    folder = write_candidate(tmp_path, doc=cand_doc(tools=tools))
    done = candidate(folder, brief_path, policy, repo)
    assert done.returncode == 1
    assert any(line.startswith("tools") and named in line for line in lines(done)), (
        done.stdout
    )


def test_a_tool_whose_version_isnt_the_lists_fails(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(
        tmp_path, doc=cand_doc(tools=[{"id": "sdxl-base-1.0", "version": "0.9"}])
    )
    done = candidate(folder, brief_path, policy, repo)
    assert done.returncode == 1
    assert any(line.startswith("tools") and "0.9" in line for line in lines(done)), (
        done.stdout
    )


def test_a_record_naming_a_model_outside_the_brief_fails(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path
) -> None:
    steps = [
        {
            "name": "base",
            "by": "model",
            "models": [{"name": "SDXL Turbo", "role": "primary"}],
        }
    ]
    folder = write_candidate(tmp_path, record=record_doc(steps))
    done = candidate(folder, brief_path, policy, repo)
    assert done.returncode == 1
    assert any(
        line.startswith("record") and "SDXL Turbo" in line for line in lines(done)
    ), done.stdout


@pytest.mark.parametrize(
    "step",
    [
        {
            "name": "base",
            "by": "model",
            "models": [{"name": "Qwen-Image-2.1", "role": "primary"}],
        },
        {
            "name": "base",
            "by": "model",
            "models": [{"name": "x", "repository": "Qwen/Qwen-Image"}],
        },
        {
            "name": "base",
            "by": "model",
            "models": [{"name": "FLUX.1 [dev]", "role": "primary"}],
        },
        {
            "name": "base",
            "by": "model",
            "models": [{"name": "y", "repository": "black-forest-labs/FLUX.1-dev"}],
        },
        {"name": "upscale with flux1-dev", "by": "hand"},
    ],
    ids=[
        "qwen-name",
        "qwen-repository",
        "flux-dev-name",
        "flux-dev-repository",
        "step-name",
    ],
)
def test_a_record_step_naming_qwen_image_or_flux_dev_is_refused_even_if_listed(
    tmp_path: Path, policy: dict[str, Path], repo: Path, step: dict
) -> None:
    listed = json.loads(policy["tools"].read_text())
    for entry in listed["tools"]:
        entry["outputs_ship"] = True
    policy["tools"].write_text(json.dumps(listed))
    path = write_brief(
        tmp_path, brief_doc(tools=["sdxl-base-1.0", "qwen-image-2.1", "flux-dev"])
    )
    folder = write_candidate(tmp_path, record=record_doc([step]))
    done = candidate(folder, path, policy, repo)
    assert done.returncode == 1
    found = [line for line in lines(done) if "refused by name" in line]
    assert found and all(line.startswith("record") for line in found), done.stdout


def test_a_candidate_tool_named_flux_dev_is_refused_even_if_listed(
    tmp_path: Path, policy: dict[str, Path], repo: Path
) -> None:
    listed = json.loads(policy["tools"].read_text())
    for entry in listed["tools"]:
        entry["outputs_ship"] = True
    policy["tools"].write_text(json.dumps(listed))
    path = write_brief(tmp_path, brief_doc(tools=["flux-dev"]))
    folder = write_candidate(
        tmp_path, doc=cand_doc(tools=[{"id": "flux-dev", "version": "1.0"}])
    )
    done = candidate(folder, path, policy, repo)
    assert done.returncode == 1
    assert any(
        line.startswith("tools") and "refused by name" in line for line in lines(done)
    ), done.stdout


def test_a_file_named_but_absent_fails(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(
        tmp_path, doc=cand_doc(files=["dog.glb", "front.png", "side.png"])
    )
    done = candidate(folder, brief_path, policy, repo)
    assert done.returncode == 1
    found = starting(done, "files")
    assert len(found) == 1 and "side.png" in found[0], done.stdout


def test_a_symlinked_file_counts_as_absent(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(tmp_path)
    (folder / "front.png").unlink()
    (folder / "front.png").symlink_to(folder / "dog.glb")
    done = candidate(folder, brief_path, policy, repo)
    assert done.returncode == 1
    assert any(
        line.startswith("files") and "front.png" in line for line in lines(done)
    ), done.stdout


@pytest.mark.parametrize(
    "files",
    [["../dog.glb"], ["sub/dog.glb"], ["records.json"], "dog.glb"],
    ids=["dotdot", "slash", "records", "text"],
)
def test_a_file_list_outside_the_folder_fails(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path, files: object
) -> None:
    folder = write_candidate(tmp_path, doc=cand_doc(files=files))
    done = candidate(folder, brief_path, policy, repo)
    assert done.returncode == 1
    assert starting(done, "files"), done.stdout


def test_a_candidate_for_another_asset_or_round_fails(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(tmp_path, doc=cand_doc(asset="cat", round=2))
    done = candidate(folder, brief_path, policy, repo)
    assert done.returncode == 1
    assert starting(done, "asset") and starting(done, "round"), done.stdout


def test_a_missing_candidate_json_fails(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(tmp_path)
    (folder / "candidate.json").unlink()
    done = candidate(folder, brief_path, policy, repo)
    assert done.returncode == 1
    assert starting(done, "candidate.json"), done.stdout


@pytest.mark.parametrize(
    "directory",
    ["assets/policy/x", "assets/../tools", "/srv/x", "docs/x", 7],
    ids=["policy", "dotdot", "abs", "docs", "int"],
)
def test_a_record_directory_outside_assets_fails(
    tmp_path: Path,
    policy: dict[str, Path],
    repo: Path,
    brief_path: Path,
    directory: object,
) -> None:
    folder = write_candidate(tmp_path, record=record_doc(directory=directory))
    done = candidate(folder, brief_path, policy, repo)
    assert done.returncode == 1
    assert starting(done, "record directory"), done.stdout


def test_a_missing_candidate_folder_exits_2(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path
) -> None:
    assert cant_run(candidate(tmp_path / "nowhere", brief_path, policy, repo))


def test_an_invalid_brief_exits_2(
    tmp_path: Path, policy: dict[str, Path], repo: Path
) -> None:
    doc = brief_doc()
    del doc["limits"]
    path = write_brief(tmp_path, doc)
    assert cant_run(candidate(write_candidate(tmp_path), path, policy, repo))


# ==================================================================================================
# T044: main's arrival check, on a scratch repository
# ==================================================================================================
def test_the_arrival_check_runs_from_main_on_a_scratch_repository(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path
) -> None:
    done = candidate(write_candidate(tmp_path), brief_path, policy, repo)
    assert done.returncode == 0, done.stdout + done.stderr
    seen = standin_report(done)
    assert Path(seen["repo"]).resolve() != repo.resolve()
    assert sorted(seen["rels"]) == [
        "assets/creatures/dog/dog.glb",
        "assets/creatures/dog/front.png",
        "assets/creatures/dog/records.json",
    ]
    assert seen["exist"]
    # The scratch's own refs/heads/main holds main's policy and disclosure, which the arrival check reads.
    assert seen["caps"] == MAIN_FILES["assets/policy/caps.json"]
    assert seen["disclosure"] == MAIN_FILES["docs/data-flow-disclosure.md"]
    # And the scratch is gone afterwards.
    assert not Path(seen["repo"]).exists()


def test_a_tag_named_main_and_the_working_trees_copy_never_answer(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path
) -> None:
    files = dict(MAIN_FILES)
    files["tools/gates/arrival_check.py"] = standin(who="tag")
    git(repo, "tag", "main", commit_tree(repo, files))
    worktree = repo / "tools" / "gates" / "arrival_check.py"
    worktree.parent.mkdir(parents=True)
    worktree.write_text(standin(who="working tree"))
    done = candidate(write_candidate(tmp_path), brief_path, policy, repo)
    assert done.returncode == 0, done.stdout + done.stderr
    assert standin_report(done)["who"] == "main"


def test_the_arrival_checks_finding_fails_the_round(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(
        tmp_path,
        extra={"refuse.png": png(64, 64)},
        doc=cand_doc(files=["dog.glb", "front.png", "refuse.png"]),
    )
    done = candidate(folder, brief_path, policy, repo)
    assert done.returncode == 1
    assert "A1 assets/creatures/dog/refuse.png: a stand-in finding" in lines(done)


def test_the_arrival_check_unable_to_check_exits_2(
    tmp_path: Path, policy: dict[str, Path], brief_path: Path
) -> None:
    other = make_repo(tmp_path, arrival=standin(exit_code=2))
    assert cant_run(candidate(write_candidate(tmp_path), brief_path, policy, other))


def test_no_arrival_check_on_main_exits_2(
    tmp_path: Path, policy: dict[str, Path], brief_path: Path
) -> None:
    other = make_repo(tmp_path, arrival=None)
    done = candidate(write_candidate(tmp_path), brief_path, policy, other)
    assert cant_run(done)
    assert "tools/gates/arrival_check.py" in done.stdout


def test_a_findings_from_both_checks_are_all_listed(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(
        tmp_path,
        model=glb(triangles=200000),
        extra={"refuse.png": png(64, 64)},
        doc=cand_doc(files=["dog.glb", "front.png", "refuse.png"]),
    )
    done = candidate(folder, brief_path, policy, repo)
    assert done.returncode == 1
    assert starting(done, "triangles dog.glb") and starting(done, "A1 "), done.stdout


# ==================================================================================================
# T042: rounds
# ==================================================================================================
def rounds(tmp_path: Path) -> subprocess.CompletedProcess:
    return run("round", "dog", "--briefs", tmp_path / "briefs")


def fail_round(
    tmp_path: Path, policy: dict[str, Path], repo: Path, n: int, findings: list[str]
) -> list[str]:
    """Write round n's brief (with round n-1's findings), a candidate over its triangles, and record the failure."""
    path = write_brief(tmp_path, brief_doc(round=n, findings=findings))
    assert brief(path, policy).returncode == 0, brief(path, policy).stdout
    folder = write_candidate(
        tmp_path, model=glb(triangles=200000 + n), round_=n, doc=cand_doc(round=n)
    )
    done = candidate(folder, path, policy, repo, "--record")
    assert done.returncode == 1, done.stdout + done.stderr
    result = json.loads((path.parent / f"{n}.result.json").read_text())
    assert result["result"] == "fail" and result["round"] == n
    return result["findings"]


def test_round_counts_from_one(tmp_path: Path) -> None:
    done = rounds(tmp_path)
    assert done.returncode == 0 and done.stdout.strip() == "1", (
        done.stdout + done.stderr
    )


def test_an_open_round_and_a_passed_round(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path
) -> None:
    assert rounds(tmp_path).stdout.strip() == "open 1"
    done = candidate(write_candidate(tmp_path), brief_path, policy, repo, "--record")
    assert done.returncode == 0, done.stdout + done.stderr
    assert rounds(tmp_path).stdout.strip() == "passed 1"


def test_three_failed_rounds_mean_decide_and_no_round_4(
    tmp_path: Path, policy: dict[str, Path], repo: Path
) -> None:
    findings: list[str] = []
    for n in (1, 2, 3):
        findings = fail_round(tmp_path, policy, repo, n, findings)
        assert any(line.startswith("triangles dog.glb") for line in findings)
        expected = "decide" if n == 3 else str(n + 1)
        assert rounds(tmp_path).stdout.strip() == expected
    done = brief(write_brief(tmp_path, brief_doc(round=4, findings=findings)), policy)
    assert done.returncode == 1
    assert starting(done, "round"), done.stdout


def test_round_two_carries_round_ones_findings_verbatim(
    tmp_path: Path, policy: dict[str, Path], repo: Path
) -> None:
    findings = fail_round(tmp_path, policy, repo, 1, [])
    done = brief(
        write_brief(
            tmp_path, brief_doc(round=2, findings=findings[:-1] + ["something else"])
        ),
        policy,
    )
    assert done.returncode == 1
    assert starting(done, "findings"), done.stdout


def test_round_two_needs_round_one_to_have_failed(
    tmp_path: Path, policy: dict[str, Path]
) -> None:
    write_brief(tmp_path, brief_doc())
    done = brief(write_brief(tmp_path, brief_doc(round=2, findings=["x"])), policy)
    assert done.returncode == 1
    assert starting(done, "round"), done.stdout


def test_a_round_skipping_ahead_fails(tmp_path: Path, policy: dict[str, Path]) -> None:
    done = brief(write_brief(tmp_path, brief_doc(round=3, findings=["x"])), policy)
    assert done.returncode == 1
    assert starting(done, "round"), done.stdout


def test_a_recorded_round_cant_be_recorded_again(
    tmp_path: Path, policy: dict[str, Path], repo: Path
) -> None:
    fail_round(tmp_path, policy, repo, 1, [])
    path = tmp_path / "briefs" / "dog" / "1.json"
    folder = tmp_path / "handoff" / "dog" / "1"
    (folder / "dog.glb").write_bytes(glb())
    done = candidate(folder, path, policy, repo, "--record")
    assert cant_run(done)
    assert json.loads((path.parent / "1.result.json").read_text())["result"] == "fail"


def test_a_candidate_without_record_writes_nothing(
    tmp_path: Path, policy: dict[str, Path], repo: Path, brief_path: Path
) -> None:
    done = candidate(write_candidate(tmp_path), brief_path, policy, repo)
    assert done.returncode == 0, done.stdout + done.stderr
    assert sorted(p.name for p in brief_path.parent.iterdir()) == ["1.json"]


@pytest.mark.parametrize("asset", ["../dog", "Dog", ""])
def test_round_refuses_an_asset_that_isnt_an_id(tmp_path: Path, asset: str) -> None:
    assert cant_run(run("round", asset, "--briefs", tmp_path / "briefs"))
