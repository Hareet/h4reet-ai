"""The studio line's checks (spec 017 User Story 4, FR-026 to FR-029; contracts/studio-line.md; tasks.md T040 to T044).

`scripts/studio/line.py` runs as `python3 -I -B scripts/studio/line.py brief|candidate|round ...`, and every case
here runs it that way, as a subprocess:
- briefs (T040): a valid brief passes; a round outside 1 to 3, a limit above main's caps.json for the kind, a tool
  whose list entry isn't `outputs_ship: true`, a tool named Qwen-Image or FLUX [dev] whatever the list says, and a
  missing field each fail with one line naming the field;
- the policy: caps.json and studio-tools.json come from refs/heads/main only, never a path the caller names, a tag
  named main, or the working tree; while main lacks either, line.py can't run (review G3, blocker 1);
- candidates (T041), on GLBs built here with struct and json: triangles, bytes, and texture pixels and bytes from the
  embedded PNG, JPEG, and WebP headers; malformed accessors and modes; the required bones from the skins' joints and
  the clips from the animations; a tool outside the brief or the list; a record step naming Qwen-Image-2.1 or FLUX
  [dev], refused even if listed; a file named but absent; the brief re-checked in full;
- rounds (T042): `line.py round` prints `decide` after three failed rounds, and `line.py brief` refuses a round 4;
  rounds are counted from the handoff folders, which only the studio writes, so deleting or forging a result in the
  briefs folder resets nothing and passes nothing (review G3, blocker 2);
- the arrival check's step (T044): main's copy, read from refs/heads/main of a repository built here, whose
  tools/gates/arrival_check.py is a stand-in, so nothing depends on the real one. A tag named main and the working
  tree's copy never answer.

The tools list (assets/policy/studio-tools.json) is the Author's patch P-7, so the list on the fixture repository's
main is in the data model's shape. Everything is built at run time; nothing touches the network.
"""

from __future__ import annotations

import json
import os
import struct
import subprocess
import sys
import zlib
from collections.abc import Callable
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


def all_ship() -> dict:
    listed = json.loads(json.dumps(TOOLS))
    for entry in listed["tools"]:
        entry["outputs_ship"] = True
    return listed


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


def cant_run(done: subprocess.CompletedProcess, *, arguments: bool = False) -> bool:
    """Exit 2 with line.py's own reason, so Python's exit 2 for a script it can't open never passes for it, and an
    argument error passes only where the case expects one."""
    return (
        done.returncode == 2
        and "line: can't run: " in done.stdout
        and (arguments or "the arguments don't parse" not in done.stdout)
    )


# --------------------------------------------------------------------------------------------------
# A repository whose refs/heads/main holds main's policy, the tools list, the disclosure, and a stand-in arrival check
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
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env.update(GIT_ENV)
    env["GIT_INDEX_FILE"] = str(index)
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
            env=env,
            check=True,
            capture_output=True,
        )
    tree = (
        subprocess.run(
            ["git", "-C", str(repo), "write-tree"],
            env=env,
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
if EXIT == 1:
    print("arrival-check: exit 1 with no finding line")
    sys.exit(1)
print("arrival-check: %d findings in %d files" % (len(bad), len(rels)))
sys.exit(1 if bad else 0)
"""


def standin(who: str = "main", exit_code: int = 0) -> str:
    return f"WHO = {who!r}\nEXIT = {exit_code}\n" + STANDIN


CAPS_PATH = "assets/policy/caps.json"
TOOLS_PATH = "assets/policy/studio-tools.json"
ARRIVAL_PATH = "tools/gates/arrival_check.py"
DISCLOSURE = "# Data-flow disclosure\n"


def main_files(
    *,
    tools: object = TOOLS,
    caps: object = CAPS,
    arrival: str | None = None,
    drop: tuple[str, ...] = (),
) -> dict[str, str]:
    files = {
        CAPS_PATH: caps if isinstance(caps, str) else json.dumps(caps),
        TOOLS_PATH: tools if isinstance(tools, str) else json.dumps(tools),
        "assets/policy/licenses.json": '{"schema": 1, "licenses": []}',
        "assets/policy/approvals.json": '{"schema": 1, "approvals": []}',
        "docs/data-flow-disclosure.md": DISCLOSURE,
        ARRIVAL_PATH: arrival if arrival is not None else standin(),
    }
    for rel in drop:
        files.pop(rel)
    return files


def set_main(repo: Path, **kwargs) -> None:
    git(repo, "update-ref", "refs/heads/main", commit_tree(repo, main_files(**kwargs)))


def make_repo(root: Path, name: str = "repo", **kwargs) -> Path:
    repo = root / name
    repo.mkdir()
    git(repo, "init", "-q", "--template=")
    set_main(repo, **kwargs)
    git(repo, "symbolic-ref", "HEAD", "refs/heads/main")
    return repo


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    return make_repo(tmp_path)


def write_brief(root: Path, doc: dict, name: str | None = None) -> Path:
    folder = root / "briefs" / str(doc.get("asset", "dog"))
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / (name or f"{doc.get('round', 1)}.json")
    path.write_text(json.dumps(doc))
    return path


def handoff_root(brief_path: Path) -> Path:
    return brief_path.parents[2] / "handoff"


def brief(path: Path, repo: Path, *extra: str) -> subprocess.CompletedProcess:
    return run("brief", path, "--repo", repo, "--handoff", handoff_root(path), *extra)


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


def webp_chunk(fourcc: bytes, data: bytes) -> bytes:
    return fourcc + struct.pack("<I", len(data)) + data + b"\x00" * (len(data) % 2)


def riff(chunks: bytes) -> bytes:
    return b"RIFF" + struct.pack("<I", 4 + len(chunks)) + b"WEBP" + chunks


def webp_vp8l(width: int, height: int) -> bytes:
    bits = (width - 1) | ((height - 1) << 14)
    return riff(webp_chunk(b"VP8L", b"\x2f" + struct.pack("<I", bits) + b"\x00" * 4))


def webp_vp8(width: int, height: int) -> bytes:
    frame = b"\x00\x00\x00" + b"\x9d\x01\x2a" + struct.pack("<HH", width, height)
    return riff(webp_chunk(b"VP8 ", frame + b"\x00" * 4))


def webp_vp8x(width: int, height: int) -> bytes:
    header = (
        b"\x00" * 4
        + (width - 1).to_bytes(3, "little")
        + (height - 1).to_bytes(3, "little")
    )
    inner = webp_vp8l(width, height)[12:]
    return riff(webp_chunk(b"VP8X", header) + inner)


def glb(
    *,
    triangles: int = 1000,
    indexed: bool = True,
    joints: tuple[str, ...] = ("Hips", "Spine"),
    clips: tuple[str, ...] = ("idle", "walk"),
    images: tuple[bytes, ...] = (),
    pad: int = 0,
    mutate: Callable[[dict], None] | None = None,
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
    if mutate:
        mutate(gltf)
    text = json.dumps(gltf).encode()
    text += b" " * (-len(text) % 4)
    body = struct.pack("<II", len(text), 0x4E4F534A) + text
    if binary:
        body += struct.pack("<II", len(binary), 0x004E4942) + binary
    return b"glTF" + struct.pack("<II", 2, 12 + len(body)) + body


# --------------------------------------------------------------------------------------------------
# Candidates
# --------------------------------------------------------------------------------------------------
def record_doc(
    steps: list[dict] | None = None, directory: object = "assets/creatures/dog"
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
    (folder / "candidate.json").write_text(json.dumps(doc or cand_doc(round=round_)))
    return folder


def candidate(
    folder: Path,
    brief_path: Path,
    repo: Path,
    *extra: str,
) -> subprocess.CompletedProcess:
    return run(
        "candidate",
        folder,
        "--brief",
        brief_path,
        "--repo",
        repo,
        "--handoff",
        handoff_root(brief_path),
        *extra,
    )


def standin_report(done: subprocess.CompletedProcess) -> dict:
    found = starting(done, "STANDIN ")
    assert len(found) == 1, done.stdout + done.stderr
    return json.loads(found[0][len("STANDIN ") :])


@pytest.fixture
def brief_path(tmp_path: Path) -> Path:
    return write_brief(tmp_path, brief_doc())


# ==================================================================================================
# T040: briefs
# ==================================================================================================
def test_a_valid_brief_passes(tmp_path: Path, repo: Path) -> None:
    done = brief(write_brief(tmp_path, brief_doc()), repo)
    assert done.returncode == 0, done.stdout + done.stderr


@pytest.mark.parametrize("value", [0, 4, -1, "1", True, 1.0])
def test_a_round_outside_one_to_three_fails(
    tmp_path: Path, repo: Path, value: object
) -> None:
    done = brief(write_brief(tmp_path, brief_doc(round=value), name="1.json"), repo)
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
    tmp_path: Path, repo: Path, key: str, value: int, cap: str
) -> None:
    doc = brief_doc()
    doc["limits"][key] = value
    done = brief(write_brief(tmp_path, doc), repo)
    assert done.returncode == 1
    found = starting(done, f"limits.{key}")
    assert len(found) == 1, done.stdout
    assert str(value) in found[0] and cap in found[0]


def test_a_limit_at_its_cap_passes(tmp_path: Path, repo: Path) -> None:
    doc = brief_doc()
    doc["limits"]["triangles"] = 180000
    assert brief(write_brief(tmp_path, doc), repo).returncode == 0


def test_a_kind_caps_json_lacks_fails(tmp_path: Path, repo: Path) -> None:
    done = brief(write_brief(tmp_path, brief_doc(kind="creature")), repo)
    assert done.returncode == 1
    assert starting(done, "kind"), done.stdout


@pytest.mark.parametrize("tid", ["sdxl-turbo", "not-on-the-list"])
def test_a_tool_not_outputs_ship_true_fails(
    tmp_path: Path, repo: Path, tid: str
) -> None:
    done = brief(write_brief(tmp_path, brief_doc(tools=["comfyui-core", tid])), repo)
    assert done.returncode == 1
    found = starting(done, "tools")
    assert len(found) == 1 and tid in found[0], done.stdout


@pytest.mark.parametrize("tid", ["qwen-image-2.1", "flux-dev"])
def test_qwen_image_and_flux_dev_are_refused_by_name_even_if_listed(
    tmp_path: Path, repo: Path, tid: str
) -> None:
    set_main(repo, tools=all_ship())
    done = brief(write_brief(tmp_path, brief_doc(tools=[tid])), repo)
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
    tmp_path: Path, repo: Path, field: str
) -> None:
    doc = brief_doc()
    del doc[field]
    done = brief(write_brief(tmp_path, doc, name="1.json"), repo)
    assert done.returncode == 1, done.stdout + done.stderr
    assert any(line.startswith(field) and "absent" in line for line in lines(done)), (
        done.stdout
    )


def test_an_unknown_field_fails(tmp_path: Path, repo: Path) -> None:
    done = brief(write_brief(tmp_path, brief_doc(prompt="a dog")), repo)
    assert done.returncode == 1
    assert starting(done, "prompt"), done.stdout


def test_a_finding_line_names_the_check_the_value_and_the_limit(
    tmp_path: Path, repo: Path
) -> None:
    doc = brief_doc()
    doc["limits"]["triangles"] = 200000
    done = brief(write_brief(tmp_path, doc), repo)
    assert "limits.triangles: 200000 (limit: " in done.stdout


def test_round_one_holds_no_findings(tmp_path: Path, repo: Path) -> None:
    done = brief(write_brief(tmp_path, brief_doc(findings=["triangles: 1"])), repo)
    assert done.returncode == 1
    assert starting(done, "findings"), done.stdout


def test_a_brief_whose_name_or_folder_disagrees_fails(
    tmp_path: Path, repo: Path
) -> None:
    path = write_brief(tmp_path, brief_doc(), name="1.json")
    moved = path.parent.parent / "cat" / "1.json"
    moved.parent.mkdir()
    path.rename(moved)
    done = brief(moved, repo)
    assert done.returncode == 1
    assert starting(done, "asset"), done.stdout


def test_a_brief_that_isnt_json_fails(tmp_path: Path, repo: Path) -> None:
    path = write_brief(tmp_path, brief_doc())
    path.write_text("{not json")
    assert brief(path, repo).returncode == 1


# ==================================================================================================
# The policy comes from main only (review G3, blocker 1)
# ==================================================================================================
def test_no_tools_list_on_main_cant_run_and_names_p7(
    tmp_path: Path, repo: Path, brief_path: Path
) -> None:
    set_main(repo, drop=(TOOLS_PATH,))
    done = brief(brief_path, repo)
    assert cant_run(done)
    assert "studio-tools.json" in done.stdout and "P-7" in done.stdout
    assert cant_run(candidate(write_candidate(tmp_path), brief_path, repo))


def test_no_caps_on_main_cant_run(tmp_path: Path, repo: Path, brief_path: Path) -> None:
    set_main(repo, drop=(CAPS_PATH,))
    done = brief(brief_path, repo)
    assert cant_run(done) and "caps.json" in done.stdout
    assert cant_run(candidate(write_candidate(tmp_path), brief_path, repo))


@pytest.mark.parametrize(
    ("tools", "caps"),
    [
        ("[]", CAPS),
        (TOOLS, "[]"),
        ("{not json", CAPS),
        ({"schema": 1, "tools": [{**TOOLS["tools"][0], "url": "x"}]}, CAPS),
        ({"schema": 1, "tools": [TOOLS["tools"][0], TOOLS["tools"][0]]}, CAPS),
    ],
    ids=[
        "tools-list",
        "caps-list",
        "tools-json",
        "tools-unknown-field",
        "tools-duplicate",
    ],
)
def test_a_policy_on_main_that_doesnt_parse_cant_run(
    repo: Path, brief_path: Path, tools: object, caps: object
) -> None:
    set_main(repo, tools=tools, caps=caps)
    assert cant_run(brief(brief_path, repo))


@pytest.mark.parametrize("option", ["--tools", "--caps"])
def test_the_cli_takes_no_policy_path(
    tmp_path: Path, repo: Path, brief_path: Path, option: str
) -> None:
    other = tmp_path / "policy.json"
    other.write_text(json.dumps(all_ship()))
    assert cant_run(brief(brief_path, repo, option, str(other)), arguments=True)
    folder = write_candidate(tmp_path)
    assert cant_run(
        candidate(folder, brief_path, repo, option, str(other)), arguments=True
    )


def test_a_tag_named_main_and_the_working_tree_never_give_the_policy(
    tmp_path: Path, repo: Path
) -> None:
    git(repo, "tag", "main", commit_tree(repo, main_files(tools=all_ship())))
    (repo / "assets" / "policy").mkdir(parents=True)
    (repo / TOOLS_PATH).write_text(json.dumps(all_ship()))
    done = brief(write_brief(tmp_path, brief_doc(tools=["sdxl-turbo"])), repo)
    assert done.returncode == 1
    assert any("sdxl-turbo" in line for line in starting(done, "tools")), done.stdout


def test_a_policy_change_on_main_is_read(tmp_path: Path, repo: Path) -> None:
    path = write_brief(tmp_path, brief_doc(tools=["sdxl-turbo"]))
    assert brief(path, repo).returncode == 1
    set_main(repo, tools=all_ship())
    assert brief(path, repo).returncode == 0


# ==================================================================================================
# T041: candidates
# ==================================================================================================
def test_a_good_candidate_passes(tmp_path: Path, repo: Path, brief_path: Path) -> None:
    done = candidate(write_candidate(tmp_path), brief_path, repo)
    assert done.returncode == 0, done.stdout + done.stderr
    assert standin_report(done)["who"] == "main"


def test_a_non_indexed_glb_counts_positions(
    tmp_path: Path, repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(tmp_path, model=glb(triangles=180001, indexed=False))
    done = candidate(folder, brief_path, repo)
    assert done.returncode == 1
    found = starting(done, "triangles")
    assert len(found) == 1 and "180001" in found[0] and "180000" in found[0], (
        done.stdout
    )


def test_over_triangles_fails(tmp_path: Path, repo: Path, brief_path: Path) -> None:
    done = candidate(
        write_candidate(tmp_path, model=glb(triangles=200000)), brief_path, repo
    )
    assert done.returncode == 1
    found = starting(done, "triangles dog.glb")
    assert len(found) == 1 and "200000" in found[0] and "180000" in found[0], (
        done.stdout
    )


def set_accessor(index: int, **values: object) -> Callable[[dict], None]:
    def change(gltf: dict) -> None:
        for key, value in values.items():
            if value is None:
                gltf["accessors"][index].pop(key, None)
            else:
                gltf["accessors"][index][key] = value

    return change


def set_primitive(**values: object) -> Callable[[dict], None]:
    def change(gltf: dict) -> None:
        prim = gltf["meshes"][0]["primitives"][0]
        for key, value in values.items():
            if value is None:
                prim.pop(key, None)
            else:
                prim[key] = value

    return change


def drop_position(gltf: dict) -> None:
    gltf["meshes"][0]["primitives"][0]["attributes"].pop("POSITION")


@pytest.mark.parametrize(
    ("indexed", "mutate"),
    [
        (True, set_primitive(indices=9)),
        (True, set_primitive(mode="4")),
        (True, set_primitive(mode=4.0)),
        (True, set_primitive(mode=7)),
        (True, set_accessor(1, count=3.0)),
        (True, set_accessor(1, count=None)),
        (True, set_accessor(1, count=-3)),
        (False, drop_position),
        (False, set_accessor(0, count="3")),
    ],
    ids=[
        "indices-no-accessor",
        "mode-text",
        "mode-float",
        "mode-out-of-range",
        "count-float",
        "count-missing",
        "count-negative",
        "no-position",
        "position-count-text",
    ],
)
def test_malformed_accessors_and_modes_are_findings(
    tmp_path: Path,
    repo: Path,
    brief_path: Path,
    indexed: bool,
    mutate: Callable[[dict], None],
) -> None:
    folder = write_candidate(tmp_path, model=glb(indexed=indexed, mutate=mutate))
    done = candidate(folder, brief_path, repo)
    assert done.returncode == 1, done.stdout + done.stderr
    found = starting(done, "triangles dog.glb")
    assert found and all(
        "meshes[0].primitives[0]" in line or "accessors[" in line for line in found
    ), done.stdout


def test_over_bytes_fails(tmp_path: Path, repo: Path) -> None:
    doc = brief_doc()
    doc["limits"]["bytes"] = 4096
    path = write_brief(tmp_path, doc)
    model = glb(pad=8192)
    done = candidate(write_candidate(tmp_path, model=model), path, repo)
    assert done.returncode == 1
    found = starting(done, "bytes dog.glb")
    assert len(found) == 1 and str(len(model)) in found[0] and "4096" in found[0], (
        done.stdout
    )


@pytest.mark.parametrize(
    "image",
    [
        png(4096, 1024),
        jpeg(1024, 4096),
        webp_vp8l(4096, 1024),
        webp_vp8(1024, 4096),
        webp_vp8x(4096, 4096),
    ],
    ids=["png", "jpeg", "webp-vp8l", "webp-vp8", "webp-vp8x"],
)
def test_over_texture_pixels_fails(
    tmp_path: Path, repo: Path, brief_path: Path, image: bytes
) -> None:
    folder = write_candidate(tmp_path, model=glb(images=(png(512, 512), image)))
    done = candidate(folder, brief_path, repo)
    assert done.returncode == 1
    found = starting(done, "texture_px dog.glb")
    assert len(found) == 1, done.stdout
    assert "images[1]" in found[0] and "4096" in found[0] and "2048" in found[0]


@pytest.mark.parametrize(
    "image",
    [
        jpeg(2048, 1536),
        webp_vp8l(2048, 1536),
        webp_vp8(1536, 2048),
        webp_vp8x(2048, 2048),
    ],
    ids=["jpeg", "webp-vp8l", "webp-vp8", "webp-vp8x"],
)
def test_texture_pixels_read_from_jpeg_and_webp_headers(
    tmp_path: Path, repo: Path, brief_path: Path, image: bytes
) -> None:
    folder = write_candidate(tmp_path, model=glb(images=(image,)))
    done = candidate(folder, brief_path, repo)
    assert done.returncode == 0, done.stdout + done.stderr


def test_over_texture_bytes_fails(tmp_path: Path, repo: Path) -> None:
    doc = brief_doc()
    doc["limits"]["texture_bytes"] = 1000000
    path = write_brief(tmp_path, doc)
    # 1024 by 1024, RGBA with mipmaps: 1024 * 1024 * 4 * 4 // 3 bytes, the arrival check's own measure.
    folder = write_candidate(tmp_path, model=glb(images=(png(1024, 1024),)))
    done = candidate(folder, path, repo)
    assert done.returncode == 1
    found = starting(done, "texture_bytes dog.glb")
    assert len(found) == 1 and str(1024 * 1024 * 4 * 4 // 3) in found[0], done.stdout


@pytest.mark.parametrize(
    "image",
    [b"RIFF\x00\x00\x00\x00WEBP", b"GIF89a\x01\x00\x01\x00"],
    ids=["bare-riff", "gif"],
)
def test_an_image_whose_size_cant_be_read_fails(
    tmp_path: Path, repo: Path, brief_path: Path, image: bytes
) -> None:
    folder = write_candidate(tmp_path, model=glb(images=(image,)))
    done = candidate(folder, brief_path, repo)
    assert done.returncode == 1
    assert starting(done, "texture_px dog.glb"), done.stdout


def test_a_missing_required_bone_fails(
    tmp_path: Path, repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(tmp_path, model=glb(joints=("Hips", "Neck")))
    done = candidate(folder, brief_path, repo)
    assert done.returncode == 1
    found = starting(done, "bones_required")
    assert (
        len(found) == 1 and "Spine" in found[0] and "Hips" not in found[0].split("(")[0]
    ), done.stdout


def test_a_mixamo_prefixed_bone_counts(
    tmp_path: Path, repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(
        tmp_path, model=glb(joints=("mixamorig:Hips", "mixamorig:Spine"))
    )
    assert candidate(folder, brief_path, repo).returncode == 0


def test_a_missing_clip_fails(tmp_path: Path, repo: Path, brief_path: Path) -> None:
    folder = write_candidate(tmp_path, model=glb(clips=("idle",)))
    done = candidate(folder, brief_path, repo)
    assert done.returncode == 1
    found = starting(done, "clips")
    assert len(found) == 1 and "walk" in found[0], done.stdout


def test_a_glb_that_doesnt_parse_fails(
    tmp_path: Path, repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(tmp_path, model=b"glTF\x02\x00\x00\x00" + b"\x00" * 12)
    done = candidate(folder, brief_path, repo)
    assert done.returncode == 1
    assert starting(done, "glb dog.glb"), done.stdout


@pytest.mark.parametrize(
    ("tools", "named"),
    [
        ([{"id": "sdxl-turbo", "version": "1.0"}], "sdxl-turbo"),
        ([{"id": "not-on-the-list", "version": "1"}], "not-on-the-list"),
    ],
)
def test_a_tool_outside_the_brief_fails(
    tmp_path: Path,
    repo: Path,
    brief_path: Path,
    tools: list,
    named: str,
) -> None:
    folder = write_candidate(tmp_path, doc=cand_doc(tools=tools))
    done = candidate(folder, brief_path, repo)
    assert done.returncode == 1
    assert any(line.startswith("tools") and named in line for line in lines(done)), (
        done.stdout
    )


def test_a_tool_whose_version_isnt_the_lists_fails(
    tmp_path: Path, repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(
        tmp_path, doc=cand_doc(tools=[{"id": "sdxl-base-1.0", "version": "0.9"}])
    )
    done = candidate(folder, brief_path, repo)
    assert done.returncode == 1
    assert any(line.startswith("tools") and "0.9" in line for line in lines(done)), (
        done.stdout
    )


def test_a_record_naming_a_model_outside_the_brief_fails(
    tmp_path: Path, repo: Path, brief_path: Path
) -> None:
    steps = [
        {
            "name": "base",
            "by": "model",
            "models": [{"name": "SDXL Turbo", "role": "primary"}],
        }
    ]
    folder = write_candidate(tmp_path, record=record_doc(steps))
    done = candidate(folder, brief_path, repo)
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
    tmp_path: Path, repo: Path, step: dict
) -> None:
    set_main(repo, tools=all_ship())
    path = write_brief(
        tmp_path, brief_doc(tools=["sdxl-base-1.0", "comfyui-core", "blender"])
    )
    folder = write_candidate(tmp_path, record=record_doc([step]))
    done = candidate(folder, path, repo)
    assert done.returncode == 1
    found = [line for line in lines(done) if "refused by name" in line]
    assert found and all(line.startswith("record") for line in found), done.stdout


def test_a_candidate_tool_named_flux_dev_is_refused_even_if_listed(
    tmp_path: Path, repo: Path, brief_path: Path
) -> None:
    set_main(repo, tools=all_ship())
    folder = write_candidate(
        tmp_path, doc=cand_doc(tools=[{"id": "flux-dev", "version": "1.0"}])
    )
    done = candidate(folder, brief_path, repo)
    assert done.returncode == 1
    assert any(
        line.startswith("tools") and "refused by name" in line for line in lines(done)
    ), done.stdout


def test_a_file_named_but_absent_fails(
    tmp_path: Path, repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(
        tmp_path, doc=cand_doc(files=["dog.glb", "front.png", "side.png"])
    )
    done = candidate(folder, brief_path, repo)
    assert done.returncode == 1
    found = starting(done, "files")
    assert len(found) == 1 and "side.png" in found[0], done.stdout


def test_a_symlinked_file_counts_as_absent(
    tmp_path: Path, repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(tmp_path)
    (folder / "front.png").unlink()
    (folder / "front.png").symlink_to(folder / "dog.glb")
    done = candidate(folder, brief_path, repo)
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
    tmp_path: Path, repo: Path, brief_path: Path, files: object
) -> None:
    folder = write_candidate(tmp_path, doc=cand_doc(files=files))
    done = candidate(folder, brief_path, repo)
    assert done.returncode == 1
    assert starting(done, "files"), done.stdout


def test_a_candidate_for_another_asset_or_round_fails(
    tmp_path: Path, repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(tmp_path, doc=cand_doc(asset="cat", round=2))
    done = candidate(folder, brief_path, repo)
    assert done.returncode == 1
    assert starting(done, "asset") and starting(done, "round"), done.stdout


def test_a_missing_candidate_json_fails(
    tmp_path: Path, repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(tmp_path)
    (folder / "candidate.json").unlink()
    done = candidate(folder, brief_path, repo)
    assert done.returncode == 1
    assert starting(done, "candidate.json"), done.stdout


@pytest.mark.parametrize(
    "directory",
    ["assets/policy/x", "assets/../tools", "/srv/x", "docs/x", 7],
    ids=["policy", "dotdot", "abs", "docs", "int"],
)
def test_a_record_directory_outside_assets_fails(
    tmp_path: Path, repo: Path, brief_path: Path, directory: object
) -> None:
    folder = write_candidate(tmp_path, record=record_doc(directory=directory))
    done = candidate(folder, brief_path, repo)
    assert done.returncode == 1
    assert starting(done, "record directory"), done.stdout


def test_a_missing_candidate_folder_exits_2(
    tmp_path: Path, repo: Path, brief_path: Path
) -> None:
    assert cant_run(candidate(tmp_path / "nowhere", brief_path, repo))


def test_an_invalid_brief_exits_2(tmp_path: Path, repo: Path) -> None:
    doc = brief_doc()
    del doc["limits"]
    path = write_brief(tmp_path, doc)
    assert cant_run(candidate(write_candidate(tmp_path), path, repo))


@pytest.mark.parametrize(
    "change",
    ["over-caps", "tool-not-shipping", "round-order"],
)
def test_candidate_re_checks_the_brief_in_full(
    tmp_path: Path, repo: Path, change: str
) -> None:
    """Review G3, important 2: the brief's caps, tools, and round order, not only its shape."""
    doc = brief_doc()
    if change == "over-caps":
        doc["limits"]["triangles"] = 999999
    elif change == "tool-not-shipping":
        doc["tools"] = ["sdxl-base-1.0", "sdxl-turbo"]
    path = write_brief(tmp_path, doc)
    if change == "round-order":
        write_brief(tmp_path, brief_doc(round=2, findings=["x"]))
    done = candidate(write_candidate(tmp_path), path, repo)
    assert cant_run(done), done.stdout
    assert "line.py brief" in done.stdout


# ==================================================================================================
# T044: main's arrival check, on a scratch repository
# ==================================================================================================
def test_the_arrival_check_runs_from_main_on_a_scratch_repository(
    tmp_path: Path, repo: Path, brief_path: Path
) -> None:
    done = candidate(write_candidate(tmp_path), brief_path, repo)
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
    assert seen["caps"] == json.dumps(CAPS)
    assert seen["disclosure"] == DISCLOSURE
    # And the scratch is gone afterwards.
    assert not Path(seen["repo"]).exists()


def test_a_tag_named_main_and_the_working_trees_copy_never_answer(
    tmp_path: Path, repo: Path, brief_path: Path
) -> None:
    git(repo, "tag", "main", commit_tree(repo, main_files(arrival=standin(who="tag"))))
    worktree = repo / ARRIVAL_PATH
    worktree.parent.mkdir(parents=True)
    worktree.write_text(standin(who="working tree"))
    done = candidate(write_candidate(tmp_path), brief_path, repo)
    assert done.returncode == 0, done.stdout + done.stderr
    assert standin_report(done)["who"] == "main"


def test_the_arrival_checks_finding_fails_the_round(
    tmp_path: Path, repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(
        tmp_path,
        extra={"refuse.png": png(64, 64)},
        doc=cand_doc(files=["dog.glb", "front.png", "refuse.png"]),
    )
    done = candidate(folder, brief_path, repo)
    assert done.returncode == 1
    assert "A1 assets/creatures/dog/refuse.png: a stand-in finding" in lines(done)


@pytest.mark.parametrize("code", [2, 1], ids=["exit-2", "exit-1-no-finding"])
def test_the_arrival_check_unable_to_check_exits_2(
    tmp_path: Path, repo: Path, brief_path: Path, code: int
) -> None:
    """Exit 2, and exit 1 with no finding line (review G3, nit 1), are can't run, never a spent round."""
    set_main(repo, arrival=standin(exit_code=code))
    assert cant_run(candidate(write_candidate(tmp_path), brief_path, repo, "--record"))
    assert not (brief_path.parent / "1.result.json").exists()


def test_no_arrival_check_on_main_exits_2(
    tmp_path: Path, repo: Path, brief_path: Path
) -> None:
    set_main(repo, drop=(ARRIVAL_PATH,))
    done = candidate(write_candidate(tmp_path), brief_path, repo)
    assert cant_run(done)
    assert "tools/gates/arrival_check.py" in done.stdout


def test_a_findings_from_both_checks_are_all_listed(
    tmp_path: Path, repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(
        tmp_path,
        model=glb(triangles=200000),
        extra={"refuse.png": png(64, 64)},
        doc=cand_doc(files=["dog.glb", "front.png", "refuse.png"]),
    )
    done = candidate(folder, brief_path, repo)
    assert done.returncode == 1
    assert starting(done, "triangles dog.glb") and starting(done, "A1 "), done.stdout


# ==================================================================================================
# T042: rounds, counted from the handoff folders (review G3, blocker 2)
# ==================================================================================================
def rounds(tmp_path: Path, repo: Path) -> subprocess.CompletedProcess:
    return run(
        "round",
        "dog",
        "--briefs",
        tmp_path / "briefs",
        "--handoff",
        tmp_path / "handoff",
        "--repo",
        repo,
    )


def state(tmp_path: Path, repo: Path) -> str:
    done = rounds(tmp_path, repo)
    assert done.returncode == 0, done.stdout + done.stderr
    return done.stdout.strip()


def fail_round(tmp_path: Path, repo: Path, n: int, findings: list[str]) -> list[str]:
    """Write round n's brief (with round n-1's findings), a candidate over its triangles, and record the failure."""
    path = write_brief(tmp_path, brief_doc(round=n, findings=findings))
    checked = brief(path, repo)
    assert checked.returncode == 0, checked.stdout
    folder = write_candidate(
        tmp_path, model=glb(triangles=200000 + n), round_=n, doc=cand_doc(round=n)
    )
    done = candidate(folder, path, repo, "--record")
    assert done.returncode == 1, done.stdout + done.stderr
    result = json.loads((path.parent / f"{n}.result.json").read_text())
    assert result["result"] == "fail" and result["round"] == n
    return result["findings"]


def test_round_counts_from_one(tmp_path: Path, repo: Path) -> None:
    assert state(tmp_path, repo) == "1"


def test_an_open_round_and_a_passed_round(
    tmp_path: Path, repo: Path, brief_path: Path
) -> None:
    assert state(tmp_path, repo) == "open 1"
    folder = write_candidate(tmp_path)
    assert state(tmp_path, repo) == "open 1"
    done = candidate(folder, brief_path, repo, "--record")
    assert done.returncode == 0, done.stdout + done.stderr
    assert state(tmp_path, repo) == "passed 1"


def test_three_failed_rounds_mean_decide_and_no_round_4(
    tmp_path: Path, repo: Path
) -> None:
    findings: list[str] = []
    for n in (1, 2, 3):
        findings = fail_round(tmp_path, repo, n, findings)
        assert any(line.startswith("triangles dog.glb") for line in findings)
        assert state(tmp_path, repo) == ("decide" if n == 3 else str(n + 1))
    done = brief(write_brief(tmp_path, brief_doc(round=4, findings=findings)), repo)
    assert done.returncode == 1
    assert starting(done, "round"), done.stdout


def test_deleting_the_results_and_briefs_resets_nothing(
    tmp_path: Path, repo: Path
) -> None:
    findings: list[str] = []
    for n in (1, 2, 3):
        findings = fail_round(tmp_path, repo, n, findings)
    folder = tmp_path / "briefs" / "dog"
    for result in folder.glob("*.result.json"):
        result.unlink()
    assert state(tmp_path, repo) == "decide"
    for path in folder.glob("*.json"):
        path.unlink()
    assert state(tmp_path, repo) == "decide"
    done = brief(write_brief(tmp_path, brief_doc()), repo)
    assert done.returncode == 1
    assert starting(done, "round"), done.stdout


def test_a_deleted_result_leaves_the_round_spent(tmp_path: Path, repo: Path) -> None:
    findings = fail_round(tmp_path, repo, 1, [])
    (tmp_path / "briefs" / "dog" / "1.result.json").unlink()
    # The studio's handoff for round 1 is there, so round 1 is used: it's to be judged again, never written again.
    assert state(tmp_path, repo) == "open 1"
    assert (
        brief(write_brief(tmp_path, brief_doc(), name="1.json"), repo).returncode == 1
    )
    done = brief(write_brief(tmp_path, brief_doc(round=2, findings=findings)), repo)
    assert done.returncode == 1
    assert starting(done, "round"), done.stdout


def test_a_forged_pass_is_re_checked(tmp_path: Path, repo: Path) -> None:
    fail_round(tmp_path, repo, 1, [])
    result = tmp_path / "briefs" / "dog" / "1.result.json"
    forged = json.loads(result.read_text())
    forged.update({"result": "pass", "findings": []})
    result.write_text(json.dumps(forged))
    assert state(tmp_path, repo) != "passed 1"


def test_a_pass_without_its_handoff_is_no_pass(
    tmp_path: Path, repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(tmp_path)
    assert candidate(folder, brief_path, repo, "--record").returncode == 0
    (folder / "dog.glb").unlink()
    for child in folder.iterdir():
        child.unlink()
    folder.rmdir()
    assert state(tmp_path, repo) != "passed 1"


def test_round_two_carries_round_ones_findings_verbatim(
    tmp_path: Path, repo: Path
) -> None:
    findings = fail_round(tmp_path, repo, 1, [])
    done = brief(
        write_brief(
            tmp_path,
            brief_doc(round=2, findings=findings[:-1] + ["something else"]),
        ),
        repo,
    )
    assert done.returncode == 1
    assert starting(done, "findings"), done.stdout


def test_round_two_needs_round_one_to_have_failed(tmp_path: Path, repo: Path) -> None:
    write_brief(tmp_path, brief_doc())
    done = brief(write_brief(tmp_path, brief_doc(round=2, findings=["x"])), repo)
    assert done.returncode == 1
    assert starting(done, "round"), done.stdout


def test_a_round_skipping_ahead_fails(tmp_path: Path, repo: Path) -> None:
    done = brief(write_brief(tmp_path, brief_doc(round=3, findings=["x"])), repo)
    assert done.returncode == 1
    assert starting(done, "round"), done.stdout


def test_a_brief_for_a_round_the_studio_has_answered_fails(
    tmp_path: Path, repo: Path, brief_path: Path
) -> None:
    write_candidate(tmp_path)
    done = brief(brief_path, repo)
    assert done.returncode == 1
    assert starting(done, "round"), done.stdout


def test_a_recorded_round_cant_be_recorded_again(tmp_path: Path, repo: Path) -> None:
    fail_round(tmp_path, repo, 1, [])
    path = tmp_path / "briefs" / "dog" / "1.json"
    folder = tmp_path / "handoff" / "dog" / "1"
    (folder / "dog.glb").write_bytes(glb())
    assert cant_run(candidate(folder, path, repo, "--record"))
    assert json.loads((path.parent / "1.result.json").read_text())["result"] == "fail"


def test_a_round_with_a_later_handoff_cant_be_judged_again(
    tmp_path: Path, repo: Path
) -> None:
    findings = fail_round(tmp_path, repo, 1, [])
    path2 = write_brief(tmp_path, brief_doc(round=2, findings=findings))
    write_candidate(tmp_path, round_=2, doc=cand_doc(round=2))
    (tmp_path / "briefs" / "dog" / "1.result.json").unlink()
    folder = tmp_path / "handoff" / "dog" / "1"
    (folder / "dog.glb").write_bytes(glb())
    assert cant_run(
        candidate(folder, tmp_path / "briefs" / "dog" / "1.json", repo, "--record")
    )
    assert not (tmp_path / "briefs" / "dog" / "1.result.json").exists()
    assert path2.exists()


def test_record_judges_only_the_rounds_handoff_folder(
    tmp_path: Path, repo: Path, brief_path: Path
) -> None:
    folder = write_candidate(tmp_path)
    elsewhere = tmp_path / "elsewhere" / "dog" / "1"
    elsewhere.parent.mkdir(parents=True)
    folder.rename(elsewhere)
    assert cant_run(candidate(elsewhere, brief_path, repo, "--record"))
    assert not (brief_path.parent / "1.result.json").exists()


def test_a_candidate_without_record_writes_nothing(
    tmp_path: Path, repo: Path, brief_path: Path
) -> None:
    done = candidate(write_candidate(tmp_path), brief_path, repo)
    assert done.returncode == 0, done.stdout + done.stderr
    assert sorted(p.name for p in brief_path.parent.iterdir()) == ["1.json"]


@pytest.mark.parametrize("asset", ["../dog", "Dog", ""])
def test_round_refuses_an_asset_that_isnt_an_id(
    tmp_path: Path, repo: Path, asset: str
) -> None:
    assert cant_run(
        run(
            "round",
            asset,
            "--briefs",
            tmp_path / "briefs",
            "--handoff",
            tmp_path / "handoff",
            "--repo",
            repo,
        )
    )


# --------------------------------------------------------------------------------------------------
# Spec 021 (T008; FR-007, FR-013, SC-004; plan.md R-06): the dinosaur's brief, the first ```json block of
# specs/021-dinosaur-modeled-and-brought-in/contracts/dinosaur-brief.md, through `line.py brief` on a fixture
# repository whose main holds the repository's own studio-tools.json and caps.json (read as files here only).
# --------------------------------------------------------------------------------------------------
REPO_ROOT = HERE.parents[1]
DINOSAUR_BRIEF = (
    REPO_ROOT / "specs/021-dinosaur-modeled-and-brought-in/contracts/dinosaur-brief.md"
)


def dinosaur_brief() -> dict:
    text = DINOSAUR_BRIEF.read_text(encoding="utf-8")
    start = text.index("```json\n") + len("```json\n")
    return json.loads(text[start : text.index("\n```", start)])


def real_policy() -> tuple[dict, dict]:
    tools = json.loads((REPO_ROOT / TOOLS_PATH).read_text(encoding="utf-8"))
    caps = json.loads((REPO_ROOT / CAPS_PATH).read_text(encoding="utf-8"))
    return tools, caps


def write_dinosaur(root: Path, doc: dict) -> Path:
    folder = root / "briefs" / "dinosaur"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / "1.json"
    path.write_text(json.dumps(doc))
    return path


def test_the_dinosaurs_brief_passes_on_the_repositorys_tools_and_caps(
    tmp_path: Path,
) -> None:
    tools, caps = real_policy()
    repo = make_repo(tmp_path, tools=tools, caps=caps)
    doc = dinosaur_brief()
    assert doc["asset"] == "dinosaur" and doc["round"] == 1
    done = brief(write_dinosaur(tmp_path, doc), repo)
    assert done.returncode == 0, done.stdout + done.stderr


def test_the_dinosaurs_brief_fails_with_one_of_its_tools_not_shippable(
    tmp_path: Path,
) -> None:
    tools, caps = real_policy()
    doc = dinosaur_brief()
    named = doc["tools"][0]
    for entry in tools["tools"]:
        if entry["id"] == named:
            entry["outputs_ship"] = False
    repo = make_repo(tmp_path, tools=tools, caps=caps)
    done = brief(write_dinosaur(tmp_path, doc), repo)
    assert done.returncode == 1, done.stdout + done.stderr
    found = starting(done, "tools")
    assert len(found) == 1 and named in found[0], done.stdout


def test_the_dinosaurs_brief_names_shippable_tools_and_no_franchise() -> None:
    tools, _ = real_policy()
    doc = dinosaur_brief()
    ship = {t["id"]: t.get("outputs_ship") is True for t in tools["tools"]}
    assert doc["tools"] and all(ship.get(t) is True for t in doc["tools"]), doc["tools"]
    notes = doc["notes"] if isinstance(doc["notes"], str) else " ".join(doc["notes"])
    assert "no film or franchise creature" in notes
