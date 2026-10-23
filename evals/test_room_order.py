"""FR-077's order, inside make test (spec 004, FR-077; research.md R-58; contracts/intake-amendments.md §13; tasks.md
T014).

Spec 004's FR-077: "`make check` SHALL fail while a file exists under `assets/room/` and `main` lacks the arrival
check with C1 and C2, or while room text is published and `main` lacks FR-030's check." make check runs make test, and
so does the gate's container phase, so this module holds the rule with no gate of its own:

  1. While any file exists under assets/room/, main's tools/gates/arrival_check.py must hold "004-C1" and "004-C2"
     in its module-level tuple AMENDMENTS (the Author's patch P-5).
  2. While main's assets/policy/content-approvals.json approves, with kind room-text, the SHA-256 of a file under
     apps/web/content/room/*.yaml or apps/web/content/room/outlines/*.outline.json, which a release build then
     publishes, main's tools/gates/content_check.py must hold "room-text" in KINDS and in ANY_LENGTH (P-9).

It reads main with `git cat-file blob refs/heads/main:<path>`: the branch's full ref, so a tag named main never
answers, with GIT_NO_REPLACE_OBJECTS=1, so a refs/replace entry never answers either, LC_ALL=C, and no system or global
git config. It parses the two human-only checks with ast and takes their constants with ast.literal_eval: it never
imports or runs them. A file main lacks, or a constant that is missing, isn't bound once at the module's top level,
or isn't a tuple of strings, counts as lacking. Where `git rev-parse --git-dir` fails at the tree's root (the gate's
container, whose export has no .git), it reads the tree's own copies of the same three files, which rule A9 keeps
equal to main's at the branch's base: they can lag main, and never run ahead of it. Known gap: a shell write in a
linked worktree could change a branch's copy; the gate's host-phase arrival check, main's own code, and the reviewer
still hold.

A failure names files, never hashes:
  FR-077 assets/room/<file>: main's arrival check lacks Amendments C1 and C2 (spec 004)
  FR-077 apps/web/content/room/<file>: main approves this room text, and main's content check lacks the room-text
    kind (spec 004, FR-030)
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
ARRIVAL_CHECK = "tools/gates/arrival_check.py"
CONTENT_CHECK = "tools/gates/content_check.py"
CONTENT_APPROVALS = "assets/policy/content-approvals.json"
ROOM_ASSETS = "assets/room"
ROOM_TEXT = "apps/web/content/room"
# What case 1 needs in AMENDMENTS, and the kind case 2 needs in KINDS and ANY_LENGTH.
NEEDED_AMENDMENTS = ("004-C1", "004-C2")
ROOM_TEXT_KIND = "room-text"
ROOM_FILE_FINDING = (
    "FR-077 {path}: main's arrival check lacks Amendments C1 and C2 (spec 004)"
)
ROOM_TEXT_FINDING = (
    "FR-077 {path}: main approves this room text, and main's content check lacks the room-text kind "
    "(spec 004, FR-030)"
)


def constant(source: bytes | None, name: str) -> tuple[str, ...] | None:
    raise NotImplementedError("T014: tests first")


def findings(root: Path) -> list[str]:
    raise NotImplementedError("T014: tests first")


# --------------------------------------------------------------------------------------------------
# The rule, on this tree
# --------------------------------------------------------------------------------------------------
def test_fr077_holds_in_this_tree() -> None:
    found = findings(ROOT)
    assert found == [], "\n" + "\n".join(found)


# --------------------------------------------------------------------------------------------------
# Fixtures: repositories whose main holds what each case needs, or doesn't
# --------------------------------------------------------------------------------------------------
GOOD_ARRIVAL = '"""main\'s arrival check, a stand-in."""\n\nAMENDMENTS = ("004-C1", "004-C2", "004-C4", "004-C5", "004-C6", "004-C7")\n'
OLD_ARRIVAL = '"""main\'s arrival check before P-5, a stand-in."""\n\nMAX_BYTES = 1\n'
GOOD_CONTENT = 'KINDS = ("resume", "narration", "room-text")\nANY_LENGTH = ("room-text",)\nMIN_FRAGMENT = 24\n'
OLD_CONTENT = 'KINDS = ("resume", "narration")\nMIN_FRAGMENT = 24\n'
SIGN = "version: 1\nlines:\n  - text: fixture lettering, made by the test\n"
OUTLINE = '{"version": 1, "words": "fixture lettering"}\n'


def sha256(data: str | bytes) -> str:
    return hashlib.sha256(data.encode() if isinstance(data, str) else data).hexdigest()


def approvals(*entries: tuple[str, str]) -> str:
    """content-approvals.json approving each (digest, kind)."""
    return json.dumps(
        {
            "schema": 1,
            "approvals": [
                {
                    "id": f"C-{i:04d}",
                    "path_when_approved": "apps/web/content/room/fixture-sign.yaml",
                    "kind": kind,
                    "sha256": digest,
                    "date": "2026-10-23",
                    "reason": "a stand-in approval, made by the test",
                }
                for i, (digest, kind) in enumerate(entries, start=1)
            ],
        }
    )


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
            "GIT_CONFIG_GLOBAL": "/dev/null",
            "GIT_AUTHOR_NAME": "t",
            "GIT_AUTHOR_EMAIL": "t@example.invalid",
            "GIT_COMMITTER_NAME": "t",
            "GIT_COMMITTER_EMAIL": "t@example.invalid",
        },
    )
    return done.stdout.strip()


def write(root: Path, files: dict[str, str]) -> None:
    for rel, text in files.items():
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_text(text, encoding="utf-8")


def make_repo(
    path: Path,
    main: dict[str, str] | None,
    branch: dict[str, str] | None = None,
) -> Path:
    """A repository whose main holds `main` (None: no branch main at all), checked out on a branch holding `branch`
    too, committed: the room's files and the branch's own copies of anything."""
    path.mkdir(parents=True)
    git(path, "init", "-q", "-b", "main" if main is not None else "other")
    write(path, {"README.md": "x\n", **(main or {})})
    git(path, "add", "-A")
    git(path, "commit", "-qm", "base")
    git(path, "switch", "-qc", "feature")
    write(path, branch or {})
    git(path, "add", "-A")
    git(path, "commit", "-qm", "branch", "--allow-empty")
    return path


def a_room_file(path: str = "desk.glb") -> dict[str, str]:
    return {f"{ROOM_ASSETS}/{path}": "a stand-in model, made by the test\n"}


def room_line(path: str) -> str:
    return ROOM_FILE_FINDING.format(path=path)


def text_line(path: str) -> str:
    return ROOM_TEXT_FINDING.format(path=path)


# --------------------------------------------------------------------------------------------------
# Case 1: a file under assets/room/, and main's arrival check
# --------------------------------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("arrival", "holds"),
    [
        (GOOD_ARRIVAL, True),
        ('AMENDMENTS: tuple[str, ...] = ("004-C2", "004-C1")\n', True),
        (None, False),  # main has no arrival check at all
        (OLD_ARRIVAL, False),  # before P-5: no AMENDMENTS
        ('AMENDMENTS = ("004-C1",)\n', False),
        ('AMENDMENTS = ("004-C2", "004-C4")\n', False),
        ('AMENDMENTS = ["004-C1", "004-C2"]\n', False),  # not a tuple
        ('AMENDMENTS = ("004-C1", "004-C2", 3)\n', False),  # not strings alone
        ('AMENDMENTS = tuple(["004-C1", "004-C2"])\n', False),  # not a literal
        ('AMENDMENTS = ("004-C1",) + ("004-C2",)\n', False),
        ('if True:\n    AMENDMENTS = ("004-C1", "004-C2")\n', False),  # not at the top
        ('def f():\n    AMENDMENTS = ("004-C1", "004-C2")\n', False),
        ('AMENDMENTS = ("004-C1", "004-C2")\nAMENDMENTS += ("004-C9",)\n', False),
        ('AMENDMENTS = ("004-C1", "004-C2")\nAMENDMENTS = ()\n', False),  # bound twice
        ('AMENDMENTS = ("004-C1", "004-C2")\ndel AMENDMENTS\n', False),
        ("from elsewhere import AMENDMENTS\n", False),
        ('OTHER = ("004-C1", "004-C2")\n', False),
        ("AMENDMENTS = (\n", False),  # doesn't parse
    ],
)
def test_a_room_file_needs_mains_arrival_check_with_c1_and_c2(
    tmp_path: Path, arrival: str | None, holds: bool
) -> None:
    repo = make_repo(
        tmp_path / "repo",
        {} if arrival is None else {ARRIVAL_CHECK: arrival},
        a_room_file(),
    )
    expected = [] if holds else [room_line("assets/room/desk.glb")]
    assert findings(repo) == expected


def test_no_room_file_needs_nothing_of_main(tmp_path: Path) -> None:
    repo = make_repo(tmp_path / "repo", {ARRIVAL_CHECK: OLD_ARRIVAL})
    assert findings(repo) == []
    (repo / ROOM_ASSETS).mkdir(parents=True)  # an empty folder holds no file
    assert findings(repo) == []


def test_every_room_file_is_named_nested_ones_and_links_too(tmp_path: Path) -> None:
    repo = make_repo(
        tmp_path / "repo",
        {},
        {
            **a_room_file("records.json"),
            **a_room_file("desk.glb"),
            **a_room_file("cards/sign.png"),
            **a_room_file(".keep"),
        },
    )
    (repo / ROOM_ASSETS / "link.glb").symlink_to(repo / "README.md")
    assert findings(repo) == [
        room_line(f"assets/room/{name}")
        for name in (".keep", "cards/sign.png", "desk.glb", "link.glb", "records.json")
    ]


def test_assets_room_that_isnt_a_folder_counts_as_a_room_file(tmp_path: Path) -> None:
    repo = make_repo(tmp_path / "repo", {})
    (repo / "assets").mkdir()
    (repo / ROOM_ASSETS).symlink_to(repo)
    assert findings(repo) == [room_line("assets/room")]


def test_the_branchs_own_copy_never_answers_for_main(tmp_path: Path) -> None:
    # Agents can't write tools/gates/, but the test reads main, so no branch copy could pass it anyway.
    repo = make_repo(
        tmp_path / "repo",
        {ARRIVAL_CHECK: OLD_ARRIVAL},
        {ARRIVAL_CHECK: GOOD_ARRIVAL, **a_room_file()},
    )
    assert findings(repo) == [room_line("assets/room/desk.glb")]


def test_no_branch_main_counts_as_lacking(tmp_path: Path) -> None:
    repo = make_repo(
        tmp_path / "repo", None, {ARRIVAL_CHECK: GOOD_ARRIVAL, **a_room_file()}
    )
    assert findings(repo) == [room_line("assets/room/desk.glb")]


# --------------------------------------------------------------------------------------------------
# Case 2: room text main approves, and main's content check
# --------------------------------------------------------------------------------------------------
ROOM_TEXT_FILES = {
    f"{ROOM_TEXT}/fixture-sign.yaml": SIGN,
    f"{ROOM_TEXT}/outlines/fixture-sign.outline.json": OUTLINE,
}


@pytest.mark.parametrize(
    ("content", "holds"),
    [
        (GOOD_CONTENT, True),
        (
            None,
            False,
        ),  # main has no content check: spec 002's approvals patch isn't applied
        (OLD_CONTENT, False),  # before P-9
        ('KINDS = ("resume", "narration", "room-text")\n', False),  # no ANY_LENGTH
        ('KINDS = ("resume", "narration")\nANY_LENGTH = ("room-text",)\n', False),
        (
            'KINDS = ["resume", "narration", "room-text"]\nANY_LENGTH = ("room-text",)\n',
            False,
        ),
        (
            'KINDS = ("resume", "narration", "room-text")\nANY_LENGTH = "room-text"\n',
            False,
        ),
    ],
)
def test_approved_room_text_needs_mains_content_check_with_the_kind(
    tmp_path: Path, content: str | None, holds: bool
) -> None:
    main = {
        CONTENT_APPROVALS: approvals(
            (sha256(SIGN), ROOM_TEXT_KIND), (sha256(OUTLINE), ROOM_TEXT_KIND)
        )
    }
    if content is not None:
        main[CONTENT_CHECK] = content
    repo = make_repo(tmp_path / "repo", main, ROOM_TEXT_FILES)
    expected = (
        []
        if holds
        else [
            text_line("apps/web/content/room/fixture-sign.yaml"),
            text_line("apps/web/content/room/outlines/fixture-sign.outline.json"),
        ]
    )
    assert findings(repo) == expected


def test_only_a_room_text_approval_of_the_files_current_bytes_publishes_it(
    tmp_path: Path,
) -> None:
    # Another kind, another digest, or no approvals file at all: nothing of the room's text is published.
    for main in (
        {CONTENT_APPROVALS: approvals((sha256(SIGN), "resume"))},
        {CONTENT_APPROVALS: approvals((sha256(SIGN + " "), ROOM_TEXT_KIND))},
        {CONTENT_APPROVALS: approvals()},
        {
            CONTENT_APPROVALS: "{ not JSON"
        },  # the build refuses this file, so nothing is published
        {},
    ):
        repo = make_repo(
            tmp_path / f"repo-{len(list(tmp_path.iterdir()))}",
            {**main, CONTENT_CHECK: OLD_CONTENT},
            ROOM_TEXT_FILES,
        )
        assert findings(repo) == [], main


def test_only_the_room_texts_own_files_count(tmp_path: Path) -> None:
    # Not *.yaml at the folder's top, nor *.outline.json in outlines/: not room text, whatever main approves.
    others = {
        f"{ROOM_TEXT}/notes.txt": SIGN,
        f"{ROOM_TEXT}/deeper/fixture-sign.yaml": SIGN + "#\n",
        f"{ROOM_TEXT}/outlines/fixture-sign.json": SIGN + "##\n",
        "apps/web/content/fixture-sign.yaml": SIGN + "###\n",
    }
    main = {
        CONTENT_APPROVALS: approvals(
            *((sha256(text), ROOM_TEXT_KIND) for text in others.values())
        ),
        CONTENT_CHECK: OLD_CONTENT,
    }
    repo = make_repo(tmp_path / "repo", main, others)
    assert findings(repo) == []


def test_a_finding_names_the_file_never_its_hash(tmp_path: Path) -> None:
    main = {
        CONTENT_APPROVALS: approvals((sha256(SIGN), ROOM_TEXT_KIND)),
        CONTENT_CHECK: OLD_CONTENT,
    }
    repo = make_repo(tmp_path / "repo", main, {**ROOM_TEXT_FILES, **a_room_file()})
    found = findings(repo)
    assert found == [
        room_line("assets/room/desk.glb"),
        text_line("apps/web/content/room/fixture-sign.yaml"),
    ]
    for line in found:
        assert not re.search(r"[0-9a-f]{16}", line), line


# --------------------------------------------------------------------------------------------------
# How main is read: its full ref, no replace objects, no caller's config, and never its code run
# --------------------------------------------------------------------------------------------------
def test_a_tag_named_main_never_answers(tmp_path: Path) -> None:
    repo = make_repo(
        tmp_path / "repo",
        {ARRIVAL_CHECK: OLD_ARRIVAL},
        {ARRIVAL_CHECK: GOOD_ARRIVAL, **a_room_file()},
    )
    git(repo, "tag", "main", "feature")
    # Not vacuous: a bare `main` reads the tag, which holds the constants.
    assert "004-C1" in git(repo, "cat-file", "blob", f"main:{ARRIVAL_CHECK}")
    assert findings(repo) == [room_line("assets/room/desk.glb")]


def test_a_replace_entry_never_answers(tmp_path: Path) -> None:
    repo = make_repo(tmp_path / "repo", {ARRIVAL_CHECK: OLD_ARRIVAL}, a_room_file())
    old = git(repo, "rev-parse", f"refs/heads/main:{ARRIVAL_CHECK}")
    (tmp_path / "good.py").write_text(GOOD_ARRIVAL, encoding="utf-8")
    good = git(repo, "hash-object", "-w", str(tmp_path / "good.py"))
    git(repo, "replace", old, good)
    # Not vacuous: without GIT_NO_REPLACE_OBJECTS, main's blob now reads as the replacement.
    assert "004-C1" in git(repo, "cat-file", "blob", f"refs/heads/main:{ARRIVAL_CHECK}")
    assert findings(repo) == [room_line("assets/room/desk.glb")]


def test_git_reads_main_by_its_full_ref_with_its_own_minimum_of_settings(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    main = {
        ARRIVAL_CHECK: GOOD_ARRIVAL,
        CONTENT_APPROVALS: approvals((sha256(SIGN), ROOM_TEXT_KIND)),
        CONTENT_CHECK: GOOD_CONTENT,
    }
    repo = make_repo(tmp_path / "repo", main, {**ROOM_TEXT_FILES, **a_room_file()})
    seen: list[tuple[list[str], dict[str, str]]] = []
    real = subprocess.run

    def spy(argv, *args, **kwargs):  # type: ignore[no-untyped-def]
        if argv and argv[0] == "git":
            seen.append((list(argv), dict(kwargs.get("env") or {})))
        return real(argv, *args, **kwargs)

    monkeypatch.setattr(subprocess, "run", spy)
    monkeypatch.setenv("GIT_DIR", str(tmp_path / "elsewhere"))
    monkeypatch.setenv("GIT_CONFIG_PARAMETERS", "'core.bare'='true'")
    assert findings(repo) == []
    assert [argv for argv, _ in seen] == [
        ["git", "-C", str(repo), "rev-parse", "--git-dir"],
        [
            "git",
            "-C",
            str(repo),
            "cat-file",
            "blob",
            f"refs/heads/main:{ARRIVAL_CHECK}",
        ],
        [
            "git",
            "-C",
            str(repo),
            "cat-file",
            "blob",
            f"refs/heads/main:{CONTENT_APPROVALS}",
        ],
        [
            "git",
            "-C",
            str(repo),
            "cat-file",
            "blob",
            f"refs/heads/main:{CONTENT_CHECK}",
        ],
    ]
    for _, env in seen:
        assert env["GIT_NO_REPLACE_OBJECTS"] == "1"
        assert env["LC_ALL"] == "C"
        assert env["GIT_CONFIG_NOSYSTEM"] == "1"
        assert env["GIT_CONFIG_GLOBAL"] == "/dev/null"
        assert not {"GIT_DIR", "GIT_CONFIG_PARAMETERS"} & set(env)


def test_mains_checks_are_parsed_never_imported_or_run(tmp_path: Path) -> None:
    marker = tmp_path / "ran"
    arrival = f"from pathlib import Path\nPath({str(marker)!r}).write_text('ran')\n{GOOD_ARRIVAL}"
    content = f"raise SystemExit('content_check.py ran')\n{GOOD_CONTENT}"
    main = {
        ARRIVAL_CHECK: arrival,
        CONTENT_APPROVALS: approvals((sha256(SIGN), ROOM_TEXT_KIND)),
        CONTENT_CHECK: content,
    }
    repo = make_repo(tmp_path / "repo", main, {**ROOM_TEXT_FILES, **a_room_file()})
    before = set(sys.modules)
    assert findings(repo) == []
    assert not marker.exists()
    assert not {m for m in set(sys.modules) - before if "check" in m}


def test_constant_reads_a_module_level_tuple_of_strings_and_nothing_else() -> None:
    assert constant(b'X = ("a", "b")\n', "X") == ("a", "b")
    assert constant(b"X: tuple[str, ...] = ()\n", "X") == ()
    assert constant(None, "X") is None
    for source in (
        b"",
        b"X = 1\n",
        b'X = {"a"}\n',
        b'X = ("a",) * 2\n',
        b"X: tuple[str, ...]\n",  # annotated, never bound
        b'X, Y = ("a",), ("b",)\n',
        b'for X in [("a",)]:\n    pass\n',
        b"class X:\n    pass\n",
        b'X = ("a",)\nimport os as X\n',
        b'(X := ("a",))\n',
        b"\xff\xfe not source\n",
    ):
        assert constant(source, "X") is None, source


# --------------------------------------------------------------------------------------------------
# With no .git: the tree's own copies
# --------------------------------------------------------------------------------------------------
def test_without_git_it_reads_the_trees_own_copies(tmp_path: Path) -> None:
    tree = tmp_path / "export"
    write(tree, {ARRIVAL_CHECK: OLD_ARRIVAL, **a_room_file()})
    assert findings(tree) == [room_line("assets/room/desk.glb")]
    write(tree, {ARRIVAL_CHECK: GOOD_ARRIVAL})
    assert findings(tree) == []
    write(
        tree,
        {
            **ROOM_TEXT_FILES,
            CONTENT_APPROVALS: approvals((sha256(OUTLINE), ROOM_TEXT_KIND)),
            CONTENT_CHECK: OLD_CONTENT,
        },
    )
    assert findings(tree) == [
        text_line("apps/web/content/room/outlines/fixture-sign.outline.json")
    ]
    write(tree, {CONTENT_CHECK: GOOD_CONTENT})
    assert findings(tree) == []


def test_a_tree_inside_another_repository_reads_its_own_copies(tmp_path: Path) -> None:
    # The gate's export has no .git of its own: git mustn't climb out of it to a repository above.
    outer = make_repo(tmp_path / "outer", {ARRIVAL_CHECK: GOOD_ARRIVAL})
    tree = outer / "export"
    write(tree, {ARRIVAL_CHECK: OLD_ARRIVAL, **a_room_file()})
    assert findings(tree) == [room_line("assets/room/desk.glb")]


def test_without_git_a_copy_that_is_a_link_counts_as_missing(tmp_path: Path) -> None:
    tree = tmp_path / "export"
    write(tree, a_room_file())
    (tmp_path / "elsewhere.py").write_text(GOOD_ARRIVAL, encoding="utf-8")
    (tree / ARRIVAL_CHECK).parent.mkdir(parents=True)
    (tree / ARRIVAL_CHECK).symlink_to(tmp_path / "elsewhere.py")
    assert findings(tree) == [room_line("assets/room/desk.glb")]
