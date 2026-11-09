"""Tests for tools/gates/content_check.py: the published-content check (spec 002, T080; contracts/resume-source.md §5).

The build's own approvals code (apps/web/build/approvals.ts) is agent-editable, so a branch could make it publish a
draft and say otherwise. This check is the enforcement, in human-only code, and it trusts none of the build's
bookkeeping. It reads main's approvals itself, by main's full ref, and recomputes each content file's SHA-256 from
the tree. Then:
  - every file room-data.json says it published must be a content file whose current digest main approves;
  - every string in room-data.json's room_text must be, whole, a displayed value of a room-text file main approves
    (spec 004, P-9);
  - no text of a file main doesn't approve may appear anywhere in dist/, whatever room-data.json says; a room-text
    file's values count as whole strings, at any length.
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
    room_text: object = None,
) -> Path:
    """A dist/ as a build writes it: room-data.json with what it says it published, and any other files."""
    dist = root / "dist"
    dist.mkdir(parents=True)
    data: dict[str, object] = {
        "built_from": {"policy": "x"},
        "published": published,
        "drafts": drafts or [],
    }
    if room_text is not None:
        data["room_text"] = room_text
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
    tmp_path: Path, tree: Path, path: str, capsys: pytest.CaptureFixture[str]
) -> None:
    folder = policy_dir(tmp_path, approvals(sha(RESUME_TEXT)))
    dist = build(
        tmp_path,
        [entry(RESUME, RESUME_TEXT), {"path": path, "sha256": sha(RESUME_TEXT)}],
    )
    assert run(tree, dist, "--policy-dir", str(folder)) == 1
    # The entry by its index: the path is a value the build wrote, and the check prints none (P-9's review, nit 4).
    out = capsys.readouterr().out
    assert (
        "FAIL room-data.json: published[1] says it published a file that isn't a content file"
        in out
    )
    assert path not in out


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
        # Under a key given twice, before its second value (P-9's review, nit 2).
        ("strings.json", '{"s": "' + RESUME_ITEM + '", "s": "x"}'),
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
# Room text (spec 004, P-9; FR-030, SC-008, Amendment B9; contracts/intake-amendments.md §11): a room-text file's
# displayed values are matched whole, at any length. main has no room text yet, so these fixtures stand in for line R's
# room-text blocks, outlines, and room-data.json's room_text (spec 004's data-model.md §6.1, §6.2, §10.3).
# --------------------------------------------------------------------------------------------------
ROOM = "apps/web/content/room/chalk-busy.yaml"
ROOM_OTHER = "apps/web/content/room/terminal-desk.yaml"
OUTLINE = "apps/web/content/room/outlines/dog-sign.outline.json"
# 14 characters, under MIN_FRAGMENT: only a whole-string match finds it (Amendment B9).
BUSY = "I am very busy"
DOG = "my dog thinks i'm cool"
BUNDLE = "assets/index-abc.js"


def room_file(*texts: str, block: str = "chalk-busy") -> str:
    """A room-text block (data-model.md §6.1), its lines' text double-quoted."""
    lines = "".join(
        f'  - text: "{t}"\n    about_author: false\n    pending: false\n' for t in texts
    )
    head = f"version: 1\nblock: {block}\nrenderer: chalk\nexclude: [Seva]\n"
    return f"{head}lines:\n{lines}"


def outline_file(words: str) -> str:
    """An outline (data-model.md §6.2), as strict JSON."""
    return json.dumps(
        {
            "schema": 1,
            "sign": "dog-sign",
            "words": words,
            "intent_ref": "intent-004",
            "source": {"type": "design", "id": "design-0001"},
            "tool": {"name": "tracer", "version": "1.0", "license": "MIT"},
            "view_box": [0, 0, 1000, 250],
            "cap_height": 180,
            "advance": 960,
            "paths": ["M0 0L10 10Z"],
        }
    )


def approvals_of(*entries: tuple[str, str]) -> str:
    """main's approvals, each (digest, kind)."""
    doc = json.loads(approvals(*(digest for digest, _ in entries)))
    for item, (_, kind) in zip(doc["approvals"], entries, strict=True):
        item["kind"] = kind
    return json.dumps(doc)


def room_text(*blocks: tuple[str, str, list[str]]) -> dict:
    """room-data.json's room_text (data-model.md §10.3): each block (path, the file's text, its published lines)."""
    return {
        "blocks": [
            {
                "id": Path(rel).name.split(".")[0],
                "source": rel,
                "sha256": sha(text),
                "state": "approved",
                "lines": [{"text": line} for line in lines],
            }
            for rel, text, lines in blocks
        ]
    }


def test_the_kinds_name_room_text_and_match_it_whole() -> None:
    assert cc.KINDS == ("resume", "narration", "room-text")
    assert cc.ANY_LENGTH == ("room-text",)


def test_the_content_files_gain_the_room_text_after_the_scripts_each_sorted(
    tmp_path: Path,
) -> None:
    room = "apps/web/content/room"
    tree = make_tree(
        tmp_path / "tree",
        {
            RESUME: RESUME_TEXT,
            "apps/web/content/narration/b.md": "b",
            "apps/web/content/narration/a.md": "a",
            f"{room}/z-block.yaml": room_file(BUSY),
            f"{room}/a-block.yaml": room_file(BUSY),
            f"{room}/notes.txt": "not room text",
            f"{room}/outlines/b-sign.outline.json": outline_file(DOG),
            f"{room}/outlines/a-sign.outline.json": outline_file(DOG),
            f"{room}/outlines/c-sign.json": "not an outline",
        },
    )
    assert cc.content_files(tree) == [
        RESUME,
        "apps/web/content/narration/a.md",
        "apps/web/content/narration/b.md",
        f"{room}/a-block.yaml",
        f"{room}/z-block.yaml",
        f"{room}/outlines/a-sign.outline.json",
        f"{room}/outlines/b-sign.outline.json",
    ]


def test_a_room_text_files_displayed_values_are_its_lines_and_an_outlines_its_words() -> (
    None
):
    block = (
        "version: 1\nblock: chalk-approach\nrenderer: chalk\nexclude: [Seva, selfless service]\nlines:\n"
        "  - text: production-grade rigor\n    about_author: true\n    claims:\n"
        "      - file: corpus/01-ai-strategy-and-cht.md\n"
        '        quote: "production-grade rigor from an SRE background"\n'
        "  - text: 'it''s judged by its ability to help'\n"
        f'  - text: "{BUSY}"\n'
    )
    assert cc.displayed(ROOM, block.encode()) == [
        "production-grade rigor",
        "it's judged by its ability to help",
        BUSY,
    ]
    assert cc.displayed(OUTLINE, outline_file(DOG).encode()) == [DOG]


# A room-text block's `text` values are read exactly, or the file is refused (P-9's review, I1): a check that reads
# YAML by pattern must never read a spelling it can't read exactly as something else.
BLOCK_HEAD = "version: 1\nblock: chalk-busy\nrenderer: chalk\nlines:\n"


@pytest.mark.parametrize(
    ("lines", "values"),
    [
        # Block scalars, followed by the line's other keys in data-model.md §6.1's order.
        (
            "  - text: >-\n      I am\n      very busy\n    about_author: false\n    pending: false\n",
            [BUSY],
        ),
        ("  - text: |\n      I am very busy\n    about_author: false\n", [BUSY]),
        (
            "  - text: >\n      I am\n\n      very busy\n  - text: next\n",
            [BUSY, "next"],
        ),
        ("  - text: |+\n      I am very busy\n\n", [BUSY]),
        # Double-quoted, read as JSON reads it, a trailing comment dropped.
        (f'  - text: "{BUSY}"  # chalk\n', [BUSY]),
        ('  - text: "I am \\"very\\" busy"\n', ['I am "very" busy']),
        ('  - text: "I am very busy\\u0021"\n', ["I am very busy!"]),
        # Single-quoted, '' as its one escape.
        (f"  - text: '{BUSY}'  # chalk\n", [BUSY]),
        ("  - text: 'it''s busy'\n", ["it's busy"]),
        # Plain, on one line.
        (f"  - text: {BUSY}\n    about_author: false\n", [BUSY]),
        (f"  - text:   {BUSY}   \n", [BUSY]),
        (f'  -   text: "{BUSY}"\n', [BUSY]),
        (f'  - text : "{BUSY}"\n', [BUSY]),
        ("  - text: production-grade rigor\n", ["production-grade rigor"]),
        # One-line flow collections stay readable, and a quote's commas and colons are its own (the last look).
        (
            (
                f"  - text: {BUSY}\n    claims:\n"
                '      - {file: corpus/a.md, quote: "a span, with a key: in it"}\n'
                "    tags: [Seva, selfless service]\n"
            ),
            [BUSY],
        ),
        ("  - text: it's {busy} [now]\n", ["it's {busy} [now]"]),
    ],
)
def test_a_room_text_value_in_a_form_read_exactly_is_read(
    lines: str, values: list[str]
) -> None:
    read = cc.displayed(ROOM, (BLOCK_HEAD + lines).encode())
    assert [cc.collapse(v) for v in read] == values


@pytest.mark.parametrize(
    "lines",
    [
        # A plain value with a comment, or continued onto another line.
        f"  - text: {BUSY} # chalk\n",
        "  - text: I am very\n      busy\n",
        "  - text:\n      I am very busy\n",
        "  - text: I am very\n\n      busy\n",
        # A quoted value continued onto another line, or with more after its closing quote.
        '  - text: "I am very\n      busy"\n',
        "  - text: 'I am very\n      busy'\n",
        '  - text: "I am" very busy\n',
        # A double-quoted escape JSON doesn't read the same way.
        '  - text: "I am very busy\\x21"\n',
        '  - text: "I am very busy\\_"\n',
        # Flow style, a quoted key, a complex key, or a key with no space after its colon.
        f'  - {{text: "{BUSY}"}}\n',
        f'  - {{about_author: false, text: "{BUSY}"}}\n',
        f'  - "text": "{BUSY}"\n',
        f"  - 'text': {BUSY}\n",
        f"  - ? text\n    : {BUSY}\n",
        f"  - text:{BUSY}\n",
        # A tag, an anchor, an alias, or a flow value.
        f"  - text: !!str {BUSY}\n",
        f"  - text: &busy {BUSY}\n",
        "  - text: *busy\n",
        f"  - text: [{BUSY}]\n",
        f"  - text: {{a: {BUSY}}}\n",
        # A block scalar's header with an indentation indicator or a comment.
        "  - text: >2\n      I am very busy\n",
        "  - text: > # chalk\n      I am very busy\n",
        # A plain value YAML reads as something other than a string.
        "  - text: 2026\n",
        "  - text: true\n",
        "  - text: null\n",
        "  - text: ~\n",
        "  - text: 2026-10-27\n",
        "  - text: .inf\n",
        "  - text: 0x1F\n",
    ],
)
def test_a_room_text_value_in_a_form_not_read_exactly_is_refused(lines: str) -> None:
    with pytest.raises(cc.Unreadable):
        cc.displayed(ROOM, (BLOCK_HEAD + lines).encode())


def test_flow_style_lines_are_refused() -> None:
    with pytest.raises(cc.Unreadable):
        cc.displayed(
            ROOM,
            f'version: 1\nblock: chalk-busy\nrenderer: chalk\nlines: [{{text: "{BUSY}"}}]\n'.encode(),
        )


# The last look at P-9's I1: legal spellings that PyYAML and the build's yaml both read as
# lines: [{text: "I am very busy"}], each refused rather than read as nothing or as another value.
LAST_LOOK = {
    # J: a quoted key with an escape, so its spelling isn't "text".
    "J, \\x": f'{BLOCK_HEAD}  - "te\\x78t": "{BUSY}"\n',
    "J, \\u": f'{BLOCK_HEAD}  - "te\\u0078t": "{BUSY}"\n',
    "J, after a key": f'{BLOCK_HEAD}  - pending: false\n    "te\\x78t": "{BUSY}"\n',
    "J, in a flow mapping": f'{BLOCK_HEAD}  - {{pending: false, "te\\x78t": "{BUSY}"}}\n',
    # K: an alias as a key, at the item's dash or after another key.
    "K": f'version: 1\nblock: chalk-busy\nrenderer: chalk\nalias: &k text\nlines:\n  - *k : "{BUSY}"\n',
    "K2": (
        "version: 1\nblock: chalk-busy\nrenderer: chalk\nalias: &k text\nlines:\n"
        f'  - pending: false\n    *k : "{BUSY}"\n'
    ),
    # L: a flow mapping over several lines, with a plain value.
    "L": f"{BLOCK_HEAD}  - {{\n    text: {BUSY}}}\n",
    "L2": f"{BLOCK_HEAD}  - {{\n    text: {BUSY},\n    pending: false}}\n",
    # Any other flow collection over several lines, or a quoted value over several lines, anywhere in the file.
    "a flow sequence": f"{BLOCK_HEAD}  - text: {BUSY}\n    tags: [Seva,\n      selfless service]\n",
    "a quoted value": f'{BLOCK_HEAD}  - text: {BUSY}\n    claims:\n      - quote: "a span\n          continued"\n',
}


@pytest.mark.parametrize("name", list(LAST_LOOK))
def test_a_quoted_or_alias_key_or_a_multi_line_flow_or_quote_is_refused(
    name: str,
) -> None:
    with pytest.raises(cc.Unreadable):
        cc.displayed(ROOM, LAST_LOOK[name].encode())


@pytest.mark.parametrize("name", ["J, \\x", "K", "L2"])
def test_such_a_draft_fails_the_check_without_printing_its_words(
    tmp_path: Path, name: str, capsys: pytest.CaptureFixture[str]
) -> None:
    tree, folder = draft_tree(tmp_path, {ROOM: LAST_LOOK[name]})
    dist = build(
        tmp_path,
        [entry(RESUME, RESUME_TEXT)],
        {BUNDLE: f'const t="{BUSY}";'},
        drafts=[ROOM],
    )
    assert run(tree, dist, "--policy-dir", str(folder)) == 1
    captured = capsys.readouterr()
    assert f"FAIL {ROOM}: " in captured.out
    assert "very busy" not in captured.out + captured.err


# The last look at round three: an alias with no space before its colon (K3), and the line separators that
# str.splitlines breaks a line at and YAML doesn't, each refused.
ALIAS_HEAD = "version: 1\nblock: chalk-busy\nrenderer: chalk\nalias: &k text\nlines:\n"
SEPARATORS = ["\x0b", "\x0c", "\x1c", "\x1d", "\x1e", "\x85", " ", " "]


@pytest.mark.parametrize(
    "lines",
    [
        f'  - *k: "{BUSY}"\n',
        f'  - pending: false\n    *k: "{BUSY}"\n',
        "  - text: *k\n",
        "  - text: a line\n    about_author: *k\n",
    ],
)
def test_an_alias_anywhere_is_refused(lines: str) -> None:
    with pytest.raises(cc.Unreadable):
        cc.displayed(ROOM, (ALIAS_HEAD + lines).encode())


@pytest.mark.parametrize("separator", SEPARATORS, ids=[hex(ord(s)) for s in SEPARATORS])
def test_a_line_separator_yaml_doesnt_break_at_is_refused(separator: str) -> None:
    with pytest.raises(cc.Unreadable):
        cc.displayed(ROOM, f"{BLOCK_HEAD}  - text: I am very{separator}busy\n".encode())


def test_a_draft_with_a_line_separator_fails_without_printing_its_words(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    tree, folder = draft_tree(
        tmp_path, {ROOM: f"{BLOCK_HEAD}  - text: I am very busy\n"}
    )
    dist = build(
        tmp_path,
        [entry(RESUME, RESUME_TEXT)],
        {BUNDLE: 'const t="I am very\\u2028busy";'},
        drafts=[ROOM],
    )
    assert run(tree, dist, "--policy-dir", str(folder)) == 1
    captured = capsys.readouterr()
    assert f"FAIL {ROOM}: " in captured.out
    assert "very" not in captured.out + captured.err


def test_a_room_text_file_that_cant_be_read_exactly_fails_the_check(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    room = BLOCK_HEAD + f'  - {{text: "{BUSY}"}}\n'
    tree, folder = draft_tree(tmp_path, {ROOM: room})
    dist = build(tmp_path, [entry(RESUME, RESUME_TEXT)], drafts=[ROOM])
    assert run(tree, dist, "--policy-dir", str(folder)) == 1
    captured = capsys.readouterr()
    assert f"FAIL {ROOM}: " in captured.out
    assert "very busy" not in captured.out + captured.err


def test_a_resume_block_scalar_ends_at_its_keys_column() -> None:
    # The indent is the key's column, not the dash's, so the item's next key isn't read as the value's words.
    resume = (
        "version: 1\nsections:\n  - items:\n      - text: >-\n"
        "          Wrote the runbook the on-call\n          team still follows today\n"
        "        claims: [{file: corpus/00-profile.md, quote: a span}]\n"
    )
    assert cc.displayed(RESUME, resume.encode()) == [
        "Wrote the runbook the on-call team still follows today"
    ]


def test_an_approved_room_text_file_published_passes(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    room, sign = room_file(BUSY, "production-grade rigor"), outline_file(DOG)
    tree = make_tree(
        tmp_path / "tree", {RESUME: RESUME_TEXT, ROOM: room, OUTLINE: sign}
    )
    folder = policy_dir(
        tmp_path,
        approvals_of(
            (sha(RESUME_TEXT), "resume"),
            (sha(room), "room-text"),
            (sha(sign), "room-text"),
        ),
    )
    dist = build(
        tmp_path,
        [entry(RESUME, RESUME_TEXT), entry(ROOM, room), entry(OUTLINE, sign)],
        {
            BUNDLE: f'const t=["{BUSY}","production-grade rigor",`{DOG}`];',
            "index.html": page(BUSY, DOG),
        },
        room_text=room_text(
            (ROOM, room, [BUSY, "production-grade rigor"]), (OUTLINE, sign, [DOG])
        ),
    )
    assert run(tree, dist, "--policy-dir", str(folder)) == 0
    out = capsys.readouterr().out
    assert "content check: PASS" in out and "3 content files: 3 approved by main" in out


def draft_tree(tmp_path: Path, files: dict[str, str]) -> tuple[Path, Path]:
    """A tree whose resume main approves, beside the given drafts; and main's approvals."""
    tree = make_tree(tmp_path / "tree", {RESUME: RESUME_TEXT, **files})
    return tree, policy_dir(tmp_path, approvals(sha(RESUME_TEXT)))


def test_an_unapproved_fourteen_character_value_as_a_whole_js_string_fails(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    tree, folder = draft_tree(tmp_path, {ROOM: room_file(BUSY)})
    dist = build(
        tmp_path,
        [entry(RESUME, RESUME_TEXT)],
        {BUNDLE: f'const a=1,t="{BUSY}";export{{t}};'},
        drafts=[ROOM],
    )
    assert run(tree, dist, "--policy-dir", str(folder)) == 1
    assert (
        f"FAIL {ROOM}: main doesn't approve it, and its text is in dist/{BUNDLE}"
        in capsys.readouterr().out
    )


@pytest.mark.parametrize(
    ("name", "text"),
    [
        (BUNDLE, f"const t='{BUSY}';"),
        (BUNDLE, f"const t=`{BUSY}`;"),
        # A bundle's escapes undone, its white space collapsed.
        (BUNDLE, 'const t="I\\u0020am very\\nbusy";'),
        (BUNDLE, 'const t="I am very \\x62usy",u="\\u{49} am very busy";'),
        (BUNDLE, 'const t="I am \\\nvery busy";'),
        # A quote in a comment or a regular expression doesn't hide the string after it.
        (BUNDLE, f'/* it\'s */const r=/"/g,t="{BUSY}";'),
        # A large JSON import, as a bundler inlines it: one string literal that JSON.parse reads.
        (BUNDLE, 'const d=JSON.parse(\'{"t":["' + BUSY + "\"]}');"),
        # A key given twice keeps both values; JSON inside a JSON string is read too (P-9's review, nit 2).
        ("dup.json", '{"t": "' + BUSY + '", "t": "other"}'),
        ("nested.json", json.dumps({"payload": json.dumps({"t": [BUSY]})})),
        # A glTF file is JSON; another text file is read for its string literals (P-9's review, nit 3).
        ("models/sign.gltf", json.dumps({"asset": {"extras": {"t": BUSY}}})),
        ("assets/index-abc.css", '.a::after{content:"' + BUSY + '"}'),
        ("notes.md", f'a line, then "{BUSY}"\n'),
        # Such a file's lines too, as a .txt file's (the last look's nit 2).
        ("notes.md", f"# Notes\n{BUSY}\n"),
        # JSON's strings, keys included, white space collapsed.
        ("strings.json", json.dumps({BUSY: 1})),
        ("data/deep.json", json.dumps({"a": [{"b": f"  {BUSY.replace(' ', '  ')} "}]})),
        # An HTML or SVG file's text nodes and attribute values, entities decoded.
        ("index.html", page(BUSY)),
        ("index.html", f'<img alt="{BUSY}">'),
        ("index.html", "<p>I&#32;am&nbsp;very\n  busy</p>"),
        (
            "sign.svg",
            f'<svg xmlns="http://www.w3.org/2000/svg"><text>{BUSY}</text></svg>',
        ),
        # An inline script's string literals, as a bundle's.
        ("index.html", f'<script>window.t="{BUSY}"</script>'),
        # A .txt file's lines.
        ("robots.txt", f"User-agent: *\n{BUSY}\n"),
    ],
)
def test_an_unapproved_room_text_value_is_found_however_dist_writes_it_whole(
    tmp_path: Path, name: str, text: str
) -> None:
    tree, folder = draft_tree(tmp_path, {ROOM: room_file(BUSY)})
    dist = build(tmp_path, [entry(RESUME, RESUME_TEXT)], {name: text}, drafts=[ROOM])
    assert run(tree, dist, "--policy-dir", str(folder)) == 1


@pytest.mark.parametrize(
    ("name", "text"),
    [
        (BUNDLE, f'const t="Today {BUSY} with work";'),
        (BUNDLE, f"const t=`${{who}} {BUSY}`;"),
        ("index.html", page(f"Yes, {BUSY}.")),
        ("strings.json", json.dumps({"a": f"{BUSY}, said no one"})),
        ("robots.txt", f"{BUSY} indeed\n"),
    ],
)
def test_the_same_characters_inside_a_longer_string_pass(
    tmp_path: Path, name: str, text: str
) -> None:
    tree, folder = draft_tree(tmp_path, {ROOM: room_file(BUSY)})
    dist = build(tmp_path, [entry(RESUME, RESUME_TEXT)], {name: text}, drafts=[ROOM])
    assert run(tree, dist, "--policy-dir", str(folder)) == 0


def test_a_long_room_text_value_is_matched_whole_never_cut_into_fragments(
    tmp_path: Path,
) -> None:
    # ANY_LENGTH: a room-text value is never cut into MIN_FRAGMENT pieces, whatever its length (§11).
    line = "shared tools, shared standards, shared learning"
    tree, folder = draft_tree(tmp_path, {ROOM: room_file(line)})
    dist = build(
        tmp_path,
        [entry(RESUME, RESUME_TEXT)],
        {"index.html": page(f"We value {line} here")},
    )
    assert run(tree, dist, "--policy-dir", str(folder)) == 0
    dist2 = build(
        tmp_path / "b", [entry(RESUME, RESUME_TEXT)], {"index.html": page(line)}
    )
    assert run(tree, dist2, "--policy-dir", str(folder)) == 1


def test_an_outlines_unapproved_words_in_dist_fail(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    tree, folder = draft_tree(tmp_path, {OUTLINE: outline_file(DOG)})
    dist = build(
        tmp_path,
        [entry(RESUME, RESUME_TEXT)],
        {BUNDLE: "const w='" + DOG.replace("'", "\\'") + "';"},
        drafts=[OUTLINE],
    )
    assert run(tree, dist, "--policy-dir", str(folder)) == 1
    assert (
        f"FAIL {OUTLINE}: main doesn't approve it, and its text is in dist/{BUNDLE}"
        in capsys.readouterr().out
    )


POSITIVE_FAIL = "FAIL room-data.json: a room-text string isn't a displayed value of any approved room-text file"


@pytest.mark.parametrize(
    "line",
    [
        "I am never busy",  # no file holds it
        "the draft's own line",  # only a draft holds it
        RESUME_ITEM,  # an approved file holds it, and it isn't room text
        "I am very",  # part of an approved value
    ],
)
def test_a_published_room_text_string_no_approved_room_text_file_holds_fails(
    tmp_path: Path, line: str, capsys: pytest.CaptureFixture[str]
) -> None:
    room, draft = (
        room_file(BUSY),
        room_file("the draft's own line", block="terminal-desk"),
    )
    tree = make_tree(
        tmp_path / "tree", {RESUME: RESUME_TEXT, ROOM: room, ROOM_OTHER: draft}
    )
    folder = policy_dir(
        tmp_path,
        approvals_of((sha(RESUME_TEXT), "resume"), (sha(room), "room-text")),
    )
    dist = build(
        tmp_path,
        [entry(RESUME, RESUME_TEXT), entry(ROOM, room)],
        room_text=room_text((ROOM, room, [BUSY, line])),
    )
    assert run(tree, dist, "--policy-dir", str(folder)) == 1
    assert POSITIVE_FAIL in capsys.readouterr().out


def test_a_published_room_text_string_matches_with_white_space_collapsed(
    tmp_path: Path,
) -> None:
    # A folded block scalar: YAML joins its lines with a space and ends it with a newline.
    room = "version: 1\nblock: chalk-busy\nrenderer: chalk\nlines:\n  - text: >\n      I am\n      very busy\n"
    tree = make_tree(tmp_path / "tree", {ROOM: room})
    folder = policy_dir(tmp_path, approvals_of((sha(room), "room-text")))
    dist = build(
        tmp_path, [entry(ROOM, room)], room_text=room_text((ROOM, room, [f"{BUSY}\n"]))
    )
    assert run(tree, dist, "--policy-dir", str(folder)) == 0


@pytest.mark.parametrize(
    "shape",
    [
        [],
        {"blocks": {}},
        {"blocks": [{"lines": "x"}]},
        {"blocks": [{"lines": [{"text": 3}]}]},
        {"blocks": [{"lines": [BUSY]}]},
        {"blocks": ["x"]},
    ],
)
def test_a_room_text_part_that_isnt_a_builds_fails(
    tmp_path: Path, shape: object
) -> None:
    tree, folder = draft_tree(tmp_path, {})
    dist = build(tmp_path, [entry(RESUME, RESUME_TEXT)], room_text=shape)
    assert run(tree, dist, "--policy-dir", str(folder)) == 1


def test_a_draft_whose_value_an_approved_file_also_shows_passes(
    tmp_path: Path,
) -> None:
    room = room_file(BUSY, "production-grade rigor")
    # The draft repeats the approved block's line, the approved outline's words, and the approved resume's title.
    draft = room_file(BUSY, DOG, "Experience", block="terminal-desk")
    sign = outline_file(DOG)
    draft_sign = outline_file("production-grade rigor")
    tree = make_tree(
        tmp_path / "tree",
        {
            RESUME: RESUME_TEXT,
            ROOM: room,
            ROOM_OTHER: draft,
            OUTLINE: sign,
            "apps/web/content/room/outlines/rigor.outline.json": draft_sign,
        },
    )
    folder = policy_dir(
        tmp_path,
        approvals_of(
            (sha(RESUME_TEXT), "resume"),
            (sha(room), "room-text"),
            (sha(sign), "room-text"),
        ),
    )
    dist = build(
        tmp_path,
        [entry(RESUME, RESUME_TEXT), entry(ROOM, room), entry(OUTLINE, sign)],
        {BUNDLE: f'const t=["{BUSY}","production-grade rigor","{DOG}","Experience"];'},
        drafts=[ROOM_OTHER],
        room_text=room_text(
            (ROOM, room, [BUSY, "production-grade rigor"]), (OUTLINE, sign, [DOG])
        ),
    )
    assert run(tree, dist, "--policy-dir", str(folder)) == 0


def test_a_room_text_approval_no_longer_stops_the_check_and_an_unknown_kind_still_does(
    tmp_path: Path, tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    good = approvals_of((sha(RESUME_TEXT), "resume"), (sha("a block"), "room-text"))
    dist = build(tmp_path, [entry(RESUME, RESUME_TEXT)])
    assert run(tree, dist, "--policy-dir", str(policy_dir(tmp_path, good))) == 0
    for kind in ("room_text", "outline", "Room-Text"):
        bad = approvals_of((sha(RESUME_TEXT), "resume"), (sha("a block"), kind))
        folder = policy_dir(tmp_path / kind, bad)
        assert run(tree, dist, "--policy-dir", str(folder)) == 2
    assert "kind" in capsys.readouterr().err


def test_a_room_text_file_that_is_a_link_fails(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    tree, folder = draft_tree(tmp_path, {})
    (tree / OUTLINE).parent.mkdir(parents=True)
    (tmp_path / "elsewhere.yaml").write_text(room_file(BUSY), encoding="utf-8")
    (tree / ROOM).symlink_to(tmp_path / "elsewhere.yaml")
    (tree / OUTLINE).symlink_to(tmp_path / "elsewhere.yaml")
    assert run(tree, build(tmp_path, []), "--policy-dir", str(folder)) == 1
    out = capsys.readouterr().out
    assert f"FAIL {ROOM}: not a regular file" in out
    assert f"FAIL {OUTLINE}: not a regular file" in out


@pytest.mark.parametrize(
    "text",
    [
        "{words: 'x'}",
        '{"words": "x", "words": "y"}',
        '{"words": "x", "cap_height": NaN}',
        json.dumps({"words": ["x"]}),
        json.dumps(["x"]),
        "﻿" + json.dumps({"words": "x"}),
    ],
)
def test_an_outline_that_isnt_strict_json_with_its_words_fails_closed(
    tmp_path: Path, text: str, capsys: pytest.CaptureFixture[str]
) -> None:
    # Its words can't be read, so they can't be held out of dist/.
    tree, folder = draft_tree(tmp_path, {OUTLINE: text})
    assert (
        run(
            tree,
            build(tmp_path, [entry(RESUME, RESUME_TEXT)]),
            "--policy-dir",
            str(folder),
        )
        == 1
    )
    assert f"FAIL {OUTLINE}: " in capsys.readouterr().out


def test_room_text_output_names_paths_and_never_its_words(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    room = room_file(BUSY)
    tree, _ = draft_tree(tmp_path, {ROOM: room})
    dist = build(
        tmp_path,
        [entry(RESUME, RESUME_TEXT)],
        {BUNDLE: f'const t="{BUSY}";'},
        room_text=room_text((ROOM, room, [BUSY])),
    )
    folder = policy_dir(tmp_path / "p", approvals(sha(RESUME_TEXT)))
    assert run(tree, dist, "--policy-dir", str(folder)) == 1
    captured = capsys.readouterr()
    assert POSITIVE_FAIL in captured.out
    assert "very busy" not in captured.out + captured.err


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
