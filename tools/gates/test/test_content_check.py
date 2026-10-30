"""Tests for tools/gates/content_check.py: the published-content check (spec 002, T080; contracts/resume-source.md §5).

The build's own approvals code (apps/web/build/approvals.ts) is agent-editable, so a branch could make it publish a
draft and say otherwise. This check is the enforcement, in human-only code, and it trusts none of the build's
bookkeeping. It reads main's approvals itself, by main's full ref, and recomputes each content file's SHA-256 from
the tree. Then:
  - every file room-data.json says it published must be a content file whose current digest main approves;
  - no text of a file main doesn't approve may appear anywhere in dist/, whatever room-data.json says.
The fixtures are builds: dist/ directories, honest or not. Every digest is made at run time.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / "tools" / "gates" / "content_check.py"
SPEC = importlib.util.spec_from_file_location("content_check", SCRIPT)
assert SPEC and SPEC.loader
cc = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = cc
SPEC.loader.exec_module(cc)

RESUME = "apps/web/content/resume.yaml"
NARRATION = "apps/web/content/narration/x.engineer.md"
RESUME_ITEM = "Led the move of the platform's hosting to a managed cluster"
RESUME_TEXT = (
    "version: 1\n"
    "sections:\n"
    "  - id: work\n"
    "    title: Experience\n"
    "    items:\n"
    f'      - id: hosting\n        text: "{RESUME_ITEM}"\n'
    "        claims: [{file: corpus/00-profile.md, quote: a span of a tagged sentence in the corpus}]\n"
)
NARRATION_SENTENCE = (
    "The twin walks you through the night the deploy pipeline first ran end to end."
)
NARRATION_TEXT = (
    "---\nitem: hosting\npath: engineer\nclaims: [{file: corpus/00-profile.md, quote: a corpus span}]\n---\n"
    f"{NARRATION_SENTENCE} It still runs every night.\n"
)


def sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def approvals(*digests: str) -> str:
    return json.dumps(
        {
            "schema": 1,
            "approvals": [
                {
                    "id": f"C-{i:04d}",
                    "path_when_approved": RESUME,
                    "kind": "resume",
                    "sha256": digest,
                    "date": "2026-10-18",
                    "reason": "a stand-in approval, made by the test",
                }
                for i, digest in enumerate(digests, 1)
            ],
        }
    )


def make_tree(root: Path, files: dict[str, str] | None = None) -> Path:
    files = {RESUME: RESUME_TEXT, NARRATION: NARRATION_TEXT} if files is None else files
    root.mkdir(parents=True, exist_ok=True)
    for rel, text in files.items():
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_text(text, encoding="utf-8")
    return root


def build(
    root: Path,
    published: object,
    files: dict[str, str] | None = None,
    drafts: object = None,
) -> Path:
    """A dist/ as a build writes it: room-data.json with what it says it published, and any other files."""
    dist = root / "dist"
    dist.mkdir(parents=True)
    data = {
        "built_from": {"policy": "x"},
        "published": published,
        "drafts": drafts or [],
    }
    (dist / "room-data.json").write_text(json.dumps(data), encoding="utf-8")
    for rel, text in (files or {}).items():
        (dist / rel).parent.mkdir(parents=True, exist_ok=True)
        (dist / rel).write_text(text, encoding="utf-8")
    return dist


def policy_dir(root: Path, approvals_text: str | None) -> Path:
    folder = root / "policy"
    folder.mkdir(parents=True, exist_ok=True)
    if approvals_text is not None:
        (folder / "content-approvals.json").write_text(approvals_text, encoding="utf-8")
    return folder


def run(tree: Path, dist: Path, *source: str) -> int:
    return cc.main(["--tree", str(tree), "--dist", str(dist), *source])


def entry(path: str, text: str) -> dict:
    return {"path": path, "sha256": sha(text)}


def page(*texts: str) -> str:
    return (
        "<!doctype html><html><body>"
        + "".join(f"<li>{t}</li>" for t in texts)
        + "</body></html>"
    )


@pytest.fixture
def tree(tmp_path: Path) -> Path:
    return make_tree(tmp_path / "tree")


# --------------------------------------------------------------------------------------------------
# An honest build passes
# --------------------------------------------------------------------------------------------------
def test_an_honest_build_passes(
    tmp_path: Path, tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    folder = policy_dir(tmp_path, approvals(sha(RESUME_TEXT)))
    dist = build(
        tmp_path,
        [entry(RESUME, RESUME_TEXT)],
        {"index.html": page(RESUME_ITEM)},
        drafts=[NARRATION],
    )
    assert run(tree, dist, "--policy-dir", str(folder)) == 0
    out = capsys.readouterr().out
    assert (
        "content check: PASS" in out
        and "2 content files" in out
        and "1 approved by main" in out
    )


def test_no_content_files_yet_passes_and_says_so(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    tree = make_tree(tmp_path / "tree", {})
    dist = build(
        tmp_path,
        [],
        {"index.html": page("anything at all, since nothing is content yet")},
    )
    assert run(tree, dist, "--policy-dir", str(policy_dir(tmp_path, None))) == 0
    assert "no content files yet" in capsys.readouterr().out


# --------------------------------------------------------------------------------------------------
# What the build says it published
# --------------------------------------------------------------------------------------------------
def test_a_build_that_says_it_published_a_draft_fails(
    tmp_path: Path, tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    folder = policy_dir(tmp_path, approvals(sha(RESUME_TEXT)))
    dist = build(
        tmp_path, [entry(RESUME, RESUME_TEXT), entry(NARRATION, NARRATION_TEXT)]
    )
    assert run(tree, dist, "--policy-dir", str(folder)) == 1
    assert (
        f"FAIL {NARRATION}: published, and main doesn't approve its SHA-256"
        in capsys.readouterr().out
    )


def test_a_published_digest_that_isnt_the_trees_fails(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # The file changed after its approval; the build reports the approved digest, not the file's.
    tree = make_tree(tmp_path / "tree", {RESUME: RESUME_TEXT + "edited: true\n"})
    folder = policy_dir(tmp_path, approvals(sha(RESUME_TEXT)))
    dist = build(tmp_path, [entry(RESUME, RESUME_TEXT)])
    assert run(tree, dist, "--policy-dir", str(folder)) == 1
    assert (
        f"FAIL {RESUME}: room-data.json's SHA-256 for it isn't the file's"
        in capsys.readouterr().out
    )


@pytest.mark.parametrize(
    "path", ["apps/web/src/main.ts", "../outside.yaml", "apps/web/content/notes.txt"]
)
def test_a_published_path_that_isnt_a_content_file_fails(
    tmp_path: Path, tree: Path, path: str
) -> None:
    folder = policy_dir(tmp_path, approvals(sha(RESUME_TEXT)))
    dist = build(tmp_path, [{"path": path, "sha256": sha(RESUME_TEXT)}])
    assert run(tree, dist, "--policy-dir", str(folder)) == 1


# --------------------------------------------------------------------------------------------------
# What dist/ holds, whatever room-data.json says
# --------------------------------------------------------------------------------------------------
def test_a_build_that_lists_a_draft_but_renders_it_fails(
    tmp_path: Path, tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # The review's case: the bookkeeping is honest (the script is a draft, listed as one, and not "published"),
    # and the page carries its words anyway.
    folder = policy_dir(tmp_path, approvals(sha(RESUME_TEXT)))
    dist = build(
        tmp_path,
        [entry(RESUME, RESUME_TEXT)],
        {"index.html": page(RESUME_ITEM, NARRATION_SENTENCE)},
        drafts=[NARRATION],
    )
    assert run(tree, dist, "--policy-dir", str(folder)) == 1
    assert (
        f"FAIL {NARRATION}: main doesn't approve it, and its text is in dist/index.html"
        in capsys.readouterr().out
    )


@pytest.mark.parametrize(
    ("name", "text"),
    [
        # In the room's data, as JSON writes it.
        ("room-data.json", None),
        # In a bundle, as a minifier writes a string: a \u escape, or an escaped apostrophe.
        (
            "assets/index-abc.js",
            'const s="' + RESUME_ITEM.replace("'", "\\u0027") + '";',
        ),
        ("assets/index-def.js", "const s='" + RESUME_ITEM.replace("'", "\\'") + "';"),
        # In a page, as HTML escapes it.
        ("disclosure/index.html", page(RESUME_ITEM.replace("'", "&#39;"))),
        # In an uncompressed PDF's text.
        ("resume.pdf", "%PDF-1.7\n1 0 obj\n(" + RESUME_ITEM + ") Tj\nendobj\n"),
    ],
)
def test_a_drafts_text_is_found_however_the_build_wrote_it(
    tmp_path: Path, name: str, text: str | None
) -> None:
    tree = make_tree(tmp_path / "tree")
    folder = policy_dir(tmp_path, None)  # nothing approved: the resume is a draft
    dist = build(tmp_path, [], drafts=[RESUME, NARRATION])
    if text is None:
        data = json.loads((dist / "room-data.json").read_text(encoding="utf-8"))
        data["sections"] = [{"items": [{"id": "hosting", "text": RESUME_ITEM}]}]
        (dist / "room-data.json").write_text(json.dumps(data), encoding="utf-8")
    else:
        (dist / name).parent.mkdir(parents=True, exist_ok=True)
        (dist / name).write_text(text, encoding="utf-8")
    assert run(tree, dist, "--policy-dir", str(folder)) == 1


def test_text_on_either_side_of_a_slot_is_found(tmp_path: Path) -> None:
    item = "Ran the nightly builds for {{slot:projects.count}} projects across the whole national rollout"
    tree = make_tree(
        tmp_path / "tree",
        {RESUME: f'version: 1\nsections:\n  - items:\n      - text: "{item}"\n'},
    )
    shown = "Ran the nightly builds for 12 projects across the whole national rollout"
    dist = build(tmp_path, [], {"index.html": page(shown)})
    assert run(tree, dist, "--policy-dir", str(policy_dir(tmp_path, None))) == 1


def test_a_block_scalar_is_read_whole(tmp_path: Path) -> None:
    resume = (
        "version: 1\nsections:\n  - items:\n      - text: >\n"
        "          Wrote the runbook the on-call\n          team still follows today\n"
    )
    tree = make_tree(tmp_path / "tree", {RESUME: resume})
    dist = build(
        tmp_path,
        [],
        {"index.html": page("Wrote the runbook the on-call team still follows today")},
    )
    assert run(tree, dist, "--policy-dir", str(policy_dir(tmp_path, None))) == 1


def test_short_shared_words_and_structure_never_count(
    tmp_path: Path, tree: Path
) -> None:
    # A section title, a key, an ID, a citation's quote: none is the draft's published text.
    dist = build(
        tmp_path,
        [],
        {
            "index.html": page(
                "Experience",
                "hosting",
                "engineer",
                "a span of a tagged sentence in the corpus",
            )
        },
    )
    assert run(tree, dist, "--policy-dir", str(policy_dir(tmp_path, None))) == 0


def test_a_drafts_words_that_an_approved_file_also_holds_never_count(
    tmp_path: Path,
) -> None:
    # The draft script quotes the approved resume's item; the page shows the approved item, which is fine.
    script = f"---\nitem: hosting\n---\n{RESUME_ITEM}. That is the one to ask about.\n"
    tree = make_tree(tmp_path / "tree", {RESUME: RESUME_TEXT, NARRATION: script})
    folder = policy_dir(tmp_path, approvals(sha(RESUME_TEXT)))
    dist = build(
        tmp_path, [entry(RESUME, RESUME_TEXT)], {"index.html": page(RESUME_ITEM)}
    )
    assert run(tree, dist, "--policy-dir", str(folder)) == 0


def test_an_edit_after_approval_makes_a_draft_whose_text_mustnt_ship(
    tmp_path: Path,
) -> None:
    edited_item = (
        "Led the move of the platform's hosting to a managed cluster, twice over"
    )
    tree = make_tree(
        tmp_path / "tree", {RESUME: RESUME_TEXT.replace(RESUME_ITEM, edited_item)}
    )
    folder = policy_dir(tmp_path, approvals(sha(RESUME_TEXT)))
    dist = build(tmp_path, [], {"index.html": page(edited_item)})
    assert run(tree, dist, "--policy-dir", str(folder)) == 1


def test_the_output_names_paths_and_never_content(
    tmp_path: Path, tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    dist = build(tmp_path, [], {"index.html": page(NARRATION_SENTENCE)})
    assert run(tree, dist, "--policy-dir", str(policy_dir(tmp_path, None))) == 1
    captured = capsys.readouterr()
    assert "first ran end to end" not in captured.out + captured.err


def test_a_content_file_that_is_a_link_fails(tmp_path: Path) -> None:
    tree = make_tree(tmp_path / "tree", {})
    (tree / "apps/web/content").mkdir(parents=True)
    (tmp_path / "elsewhere.yaml").write_text(RESUME_TEXT, encoding="utf-8")
    (tree / RESUME).symlink_to(tmp_path / "elsewhere.yaml")
    folder = policy_dir(tmp_path, approvals(sha(RESUME_TEXT)))
    assert run(tree, build(tmp_path, []), "--policy-dir", str(folder)) == 1


# --------------------------------------------------------------------------------------------------
# room-data.json, as the build wrote it
# --------------------------------------------------------------------------------------------------
@pytest.mark.parametrize(
    "text",
    [
        None,  # no room-data.json: the build didn't run, or wrote none
        "{",
        json.dumps([]),
        json.dumps({"built_from": {}}),
        json.dumps({"published": RESUME}),
        json.dumps({"published": [RESUME]}),
        json.dumps({"published": [{"path": RESUME}]}),
    ],
)
def test_a_room_data_file_that_isnt_a_builds_fails(
    tmp_path: Path, tree: Path, text: str | None
) -> None:
    dist = tmp_path / "dist"
    dist.mkdir()
    if text is not None:
        (dist / "room-data.json").write_text(text, encoding="utf-8")
    assert run(tree, dist, "--policy-dir", str(policy_dir(tmp_path, None))) == 1


# --------------------------------------------------------------------------------------------------
# main's approvals: from a policy directory the gate filled, or read from main by this script itself
# --------------------------------------------------------------------------------------------------
@pytest.mark.parametrize(
    "text",
    [
        "{",
        json.dumps({"schema": 2, "approvals": []}),
        json.dumps({"schema": 1}),
        json.dumps({"schema": 1, "approvals": {}}),
        json.dumps({"schema": 1, "approvals": [{"sha256": "abc"}]}),
        approvals("A" * 64),
        approvals(sha("x")).replace('"kind": "resume"', '"kind": "poem"'),
        approvals(sha("x")).replace('"id": "C-0001"', '"id": "C-1"'),
        approvals(sha("x")).replace('"date": "2026-10-18"', '"date": "18 October"'),
    ],
)
def test_approvals_that_arent_the_contracts_shape_stop_the_check(
    tmp_path: Path, tree: Path, text: str, capsys: pytest.CaptureFixture[str]
) -> None:
    assert (
        run(tree, build(tmp_path, []), "--policy-dir", str(policy_dir(tmp_path, text)))
        == 2
    )
    assert "content-approvals.json" in capsys.readouterr().err


def git(repo: Path, *args: str) -> str:
    done = subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        check=True,
        env={
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": str(repo),
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_AUTHOR_NAME": "t",
            "GIT_AUTHOR_EMAIL": "t@example.invalid",
            "GIT_COMMITTER_NAME": "t",
            "GIT_COMMITTER_EMAIL": "t@example.invalid",
        },
    )
    return done.stdout.strip()


def make_repo(
    root: Path, main_approvals: str | None, branch_approvals: str | None = None
) -> Path:
    """A checkout on a branch, with main's approvals (None: no main at all) and the branch's own copy."""
    root.mkdir(parents=True)
    git(root, "init", "-q", "-b", "main" if main_approvals is not None else "other")
    make_tree(root)
    if main_approvals is not None:
        (root / "assets/policy").mkdir(parents=True)
        (root / "assets/policy/content-approvals.json").write_text(
            main_approvals, encoding="utf-8"
        )
    git(root, "add", "-A")
    git(root, "commit", "-qm", "base")
    git(root, "switch", "-qc", "feature")
    if branch_approvals is not None:
        (root / "assets/policy").mkdir(parents=True, exist_ok=True)
        (root / "assets/policy/content-approvals.json").write_text(
            branch_approvals, encoding="utf-8"
        )
        git(root, "add", "-A")
        git(root, "commit", "-qm", "the branch approves itself")
    return root


SELF_APPROVED = approvals(sha(RESUME_TEXT), sha(NARRATION_TEXT))


def test_the_branchs_own_approvals_are_never_read(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    repo = make_repo(
        tmp_path / "repo", approvals(sha(RESUME_TEXT)), branch_approvals=SELF_APPROVED
    )
    dist = build(
        tmp_path, [entry(RESUME, RESUME_TEXT), entry(NARRATION, NARRATION_TEXT)]
    )
    assert run(repo, dist, "--repo", str(repo)) == 1
    assert f"FAIL {NARRATION}: published" in capsys.readouterr().out


def test_a_tag_named_main_never_stands_in_for_the_branch(tmp_path: Path) -> None:
    # git resolves a bare `main` to refs/tags/main before refs/heads/main, and an agent session can make that tag.
    repo = make_repo(
        tmp_path / "repo", approvals(sha(RESUME_TEXT)), branch_approvals=SELF_APPROVED
    )
    git(repo, "tag", "main", "feature")
    assert "C-0002" in git(
        repo, "show", "main:assets/policy/content-approvals.json"
    )  # what a bare read would see
    dist = build(
        tmp_path, [entry(RESUME, RESUME_TEXT), entry(NARRATION, NARRATION_TEXT)]
    )
    assert run(repo, dist, "--repo", str(repo)) == 1
    # With no branch main, a tag named main approves nothing.
    bare = make_repo(tmp_path / "bare", None, branch_approvals=SELF_APPROVED)
    git(bare, "tag", "main", "feature")
    assert (
        run(
            bare,
            build(tmp_path / "b", [entry(RESUME, RESUME_TEXT)]),
            "--repo",
            str(bare),
        )
        == 1
    )
    assert run(bare, build(tmp_path / "c", []), "--repo", str(bare)) == 0


def test_git_reads_mains_full_ref_without_replace_objects_or_the_callers_settings(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    repo = make_repo(tmp_path / "repo", approvals(sha(RESUME_TEXT)))
    seen: list[tuple[list[str], dict[str, str]]] = []
    real = subprocess.run

    def spy(argv, *args, **kwargs):  # type: ignore[no-untyped-def]
        seen.append((list(argv), dict(kwargs.get("env") or {})))
        return real(argv, *args, **kwargs)

    monkeypatch.setattr(cc.subprocess, "run", spy)
    monkeypatch.setenv("GIT_DIR", str(tmp_path / "elsewhere"))
    assert (
        run(repo, build(tmp_path, [entry(RESUME, RESUME_TEXT)]), "--repo", str(repo))
        == 0
    )
    assert [a for a, _ in seen] == [
        [
            "git",
            "-C",
            str(repo),
            "cat-file",
            "blob",
            "refs/heads/main:assets/policy/content-approvals.json",
        ]
    ]
    (env,) = [e for _, e in seen]
    assert env["GIT_NO_REPLACE_OBJECTS"] == "1" and "GIT_DIR" not in env


def test_it_runs_isolated_by_path(tmp_path: Path, tree: Path) -> None:
    # As make check and the gate run it: python3 -I -B -X pycache_prefix=/dev/null, by path, never -m.
    done = subprocess.run(
        [
            sys.executable,
            "-I",
            "-B",
            "-X",
            "pycache_prefix=/dev/null",
            str(SCRIPT),
            "--tree",
            str(tree),
            "--dist",
            str(build(tmp_path, [])),
            "--policy-dir",
            str(policy_dir(tmp_path, None)),
        ],
        capture_output=True,
        text=True,
        check=False,
        timeout=60,
    )
    assert done.returncode == 0, done.stdout + done.stderr
    assert done.stdout.strip().splitlines()[-1].startswith("content check: PASS")


def test_it_takes_one_source_of_main_approvals(tmp_path: Path, tree: Path) -> None:
    dist = build(tmp_path, [])
    with pytest.raises(SystemExit):
        run(tree, dist)
    with pytest.raises(SystemExit):
        run(tree, dist, "--repo", str(tree), "--policy-dir", str(tmp_path))
