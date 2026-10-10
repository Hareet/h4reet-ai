"""Tests for evals/docs_links.py (spec 000 FR-003, SC-009; plan §16; tasks.md T114), on throwaway trees.

Each check must fail when its subject is broken: a missing file or heading anywhere in README.md, docs/**, or specs/**;
a README that doesn't link the ADR index; an index that misses an ADR file; and a missing ADR for one of the five
decisions User Story 6 names. The last test runs the check on the repository itself.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "h4_docs_links", REPO / "evals" / "docs_links.py"
)
assert SPEC and SPEC.loader
docs_links = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = docs_links
SPEC.loader.exec_module(docs_links)

ADRS = {
    "0001": "local-first",
    "0002": "one-topology",
    "0003": "compose-first",
    "0004": "langfuse-grafana",
    "0005": "telegram-smtp",
}


def write(root: Path, name: str, text: str) -> Path:
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def append(root: Path, name: str, text: str) -> int:
    """Append text to a file; the line number of its first line."""
    path = root / name
    before = path.read_text(encoding="utf-8")
    path.write_text(before + text, encoding="utf-8")
    return before.count("\n") + 1


@pytest.fixture
def tree(tmp_path: Path) -> Path:
    """A repository whose every relative link resolves: the README, the ADR index and five ADRs, a guide, a spec."""
    root = tmp_path / "repo"
    write(
        root,
        "README.md",
        "# Project\n\n"
        "[ADRs](docs/adr/) · [Guide](docs/guide.md#getting-started) · [Spec](specs/000-x/spec.md)\n"
        "[Site](https://example.com/a(b)) · [Mail](mailto:someone@example.com) · [Top](#project)\n",
    )
    index = "# ADRs\n\n| # | Decision |\n|---|---|\n"
    for number, name in ADRS.items():
        write(root, f"docs/adr/{number}-{name}.md", f"# ADR {number}\n")
        index += f"| [{number}]({number}-{name}.md) | {name} |\n"
    write(root, "docs/adr/README.md", index + "| 0006 | not written yet |\n")
    write(
        root,
        "docs/guide.md",
        "# Guide\n\n## Getting started\n\n## Getting started\n\n### 6.2 `engine.sh seed`\n\n"
        "## The view `v_state` and the role `grafana_ro`\n",
    )
    write(
        root,
        "specs/000-x/spec.md",
        "# Spec\n\n[again](../../docs/guide.md#getting-started-1) "
        "[seed](../../docs/guide.md#62-enginesh-seed) "
        "[view](../../docs/guide.md#the-view-v_state-and-the-role-grafana_ro)\n",
    )
    return root


def run(root: Path, capsys: pytest.CaptureFixture[str]) -> tuple[int, str]:
    code = docs_links.main(root)
    return code, capsys.readouterr().out


def test_a_tree_whose_links_all_resolve_passes(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code, out = run(tree, capsys)
    assert code == 0, out
    assert "FAIL" not in out
    assert out.splitlines()[-1].startswith("docs links: 0 failed")


def test_a_missing_file_fails_naming_the_file_and_line(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    line = append(tree, "README.md", "\nSee [the runbook](docs/runbooks/nope.md).\n")
    code, out = run(tree, capsys)
    assert code == 1
    assert f"FAIL  README.md:{line + 1}: docs/runbooks/nope.md: " in out


@pytest.mark.parametrize(
    "name", ["docs/deep/er/page.md", "specs/000-x/plan.md", "specs/001-y/spec.md"]
)
def test_every_root_is_scanned(
    tree: Path, capsys: pytest.CaptureFixture[str], name: str
) -> None:
    write(tree, name, "# Page\n\n[gone](missing.md)\n")
    code, out = run(tree, capsys)
    assert code == 1
    assert f"FAIL  {name}:3: missing.md: " in out


@pytest.mark.parametrize(
    "name", ["corpus/README.md", "CONTRIBUTING.md", "intent/README.md"]
)
def test_files_outside_the_roots_are_not_read(
    tree: Path, capsys: pytest.CaptureFixture[str], name: str
) -> None:
    write(tree, name, "[gone](missing.md)\n")
    code, out = run(tree, capsys)
    assert code == 0, out


def test_only_markdown_is_read(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
    write(tree, "docs/merge-requests/x.patch", "+[gone](missing.md)\n")
    write(tree, "docs/recordings/x.cast", '[1.0, "o", "[gone](missing.md)"]\n')
    code, out = run(tree, capsys)
    assert code == 0, out


def test_code_and_comments_hold_no_links(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    append(
        tree,
        "docs/guide.md",
        "\n```markdown\n[gone](missing.md)\n```\n\n"
        "- a list item:\n\n  ~~~\n  [gone](missing.md)\n  ~~~\n\n"
        "Inline: `[gone](missing.md)` and ``[gone](missing.md) with a ` inside``.\n\n"
        "<!-- [gone](missing.md)\n[gone](missing.md) -->\n",
    )
    code, out = run(tree, capsys)
    assert code == 0, out


def test_external_links_are_not_followed(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    append(
        tree,
        "docs/guide.md",
        "\n[a](http://example.com/x.md) [b](//cdn.example.com/y.md) [c](tel:+100) [d](<https://example.com/a b>)\n",
    )
    code, out = run(tree, capsys)
    assert code == 0, out


def test_a_missing_heading_fails(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    line = append(tree, "specs/000-x/spec.md", "[g](../../docs/guide.md#nope)\n")
    code, out = run(tree, capsys)
    assert code == 1
    assert f"FAIL  specs/000-x/spec.md:{line}: ../../docs/guide.md#nope: " in out
    assert "#nope" in out


def test_an_in_page_fragment_is_checked(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    line = append(tree, "README.md", "[here](#no-such-heading)\n")
    code, out = run(tree, capsys)
    assert code == 1
    assert f"FAIL  README.md:{line}: #no-such-heading: " in out


def test_a_fragment_on_a_file_that_isnt_markdown_isnt_checked(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    write(tree, "Makefile", "all:\n")
    append(tree, "README.md", "[the rule](Makefile#L1) [and](Makefile#anything)\n")
    code, out = run(tree, capsys)
    assert code == 0, out


@pytest.mark.parametrize(
    ("heading", "slug"),
    [
        ("6.2 `engine.sh seed`", "62-enginesh-seed"),
        (
            "17. Data flows that leave the local tier (FR-040)",
            "17-data-flows-that-leave-the-local-tier-fr-040",
        ),
        (
            "The view `v_state` and the role `grafana_ro`",
            "the-view-v_state-and-the-role-grafana_ro",
        ),
        (
            "R-17. The runtime AWS identity (the Author, narrowed by the plan)",
            "r-17-the-runtime-aws-identity-the-author-narrowed-by-the-plan",
        ),
        (
            "Phase 7: User Story 6 — the repository explains itself (P3) — branch `feat/000-us6-docs`",
            "phase-7-user-story-6--the-repository-explains-itself-p3--branch-feat000-us6-docs",
        ),
        ("**Bold**, _emphasis_, and snake_case", "bold-emphasis-and-snake_case"),
        ("[Link text](other.md) after", "link-text-after"),
        ("§1.3 Hello → there · ok", "13-hello--there--ok"),
        ("Straße für Unicode", "straße-für-unicode"),
        ("Escaped \\_underscores\\_ stay", "escaped-_underscores_-stay"),
        ("What `make check` prints: PASS, FAIL", "what-make-check-prints-pass-fail"),
    ],
)
def test_headings_take_githubs_anchors(heading: str, slug: str) -> None:
    assert docs_links.slug(heading) == slug


def test_repeated_headings_get_numbered_anchors() -> None:
    found = docs_links.anchors(
        "# A\n\n## A\n\n### A\n\nA closing sequence:\n\n## B ##\n"
    )
    assert {"a", "a-1", "a-2", "b"} <= found


def test_headings_inside_code_or_front_matter_dont_count() -> None:
    found = docs_links.anchors(
        "---\ntitle: x\n# not-a-heading-either\n---\n\n```\n# not a heading\n```\n\n# Real\n"
    )
    assert "real" in found
    assert "not-a-heading" not in found and "not-a-heading-either" not in found


def test_explicit_anchors_count() -> None:
    assert "custom-spot" in docs_links.anchors('Text <a id="custom-spot"></a> more\n')
    assert "old-name" in docs_links.anchors("<a name='old-name'></a>\n")


def test_directory_links_resolve_and_missing_ones_fail(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    line = append(
        tree, "README.md", "[docs](docs/) [specs](specs) [gone](docs/nope/)\n"
    )
    code, out = run(tree, capsys)
    assert code == 1
    assert out.count("FAIL  ") == 1
    assert f"FAIL  README.md:{line}: docs/nope/: " in out


def test_a_fragment_on_a_directory_reads_its_readme(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    append(tree, "README.md", "[index](docs/adr/#adrs)\n")
    code, out = run(tree, capsys)
    assert code == 0, out
    line = append(tree, "README.md", "[index](docs/adr/#nope)\n")
    code, out = run(tree, capsys)
    assert code == 1
    assert f"FAIL  README.md:{line}: docs/adr/#nope: " in out


def test_encoded_titled_and_bracketed_destinations_resolve(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    write(tree, "docs/a b.md", "# A B\n")
    write(tree, "docs/file_(1).md", "# One\n")
    append(
        tree,
        "docs/guide.md",
        '\n[x](a%20b.md) [y](guide.md "A title") [z](<a b.md>) [w](file_(1).md#one) [q](guide.md?plain=1)\n'
        "[across\nlines](a%20b.md#a-b)\n",
    )
    code, out = run(tree, capsys)
    assert code == 0, out


def test_a_link_out_of_the_repository_fails(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    write(tree.parent, "outside.md", "# Outside\n")
    line = append(tree, "README.md", "[out](../outside.md)\n")
    code, out = run(tree, capsys)
    assert code == 1
    assert f"FAIL  README.md:{line}: ../outside.md: " in out
    assert "outside the repository" in out


def test_a_root_relative_link_resolves_from_the_repository(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    append(tree, "specs/000-x/spec.md", "[r](/docs/guide.md)\n")
    code, out = run(tree, capsys)
    assert code == 0, out
    line = append(tree, "specs/000-x/spec.md", "[r](/nope.md)\n")
    code, out = run(tree, capsys)
    assert code == 1
    assert f"FAIL  specs/000-x/spec.md:{line}: /nope.md: " in out


def test_reference_definitions_and_images_are_checked(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    append(
        tree,
        "docs/guide.md",
        "\n[ok]: guide.md\n\n[^1]: a footnote, not a link\n\n[Note]: prose, not a definition\n",
    )
    code, out = run(tree, capsys)
    assert code == 0, out
    line = append(
        tree, "docs/guide.md", "\n[ref]: nope.md 'A title'\n\n![a picture](nope.gif)\n"
    )
    code, out = run(tree, capsys)
    assert code == 1
    assert f"FAIL  docs/guide.md:{line + 1}: nope.md: " in out
    assert f"FAIL  docs/guide.md:{line + 3}: nope.gif: " in out


def test_the_readme_must_link_the_adr_index(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    readme = tree / "README.md"
    readme.write_text(
        readme.read_text(encoding="utf-8").replace("[ADRs](docs/adr/) · ", ""),
        encoding="utf-8",
    )
    code, out = run(tree, capsys)
    assert code == 1
    assert "FAIL  README.md doesn't link the ADR index" in out
    # The index's own file counts as the index too.
    append(tree, "README.md", "[decisions](docs/adr/README.md)\n")
    code, out = run(tree, capsys)
    assert code == 0, out


def test_the_index_must_link_every_adr_file(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    write(tree, "docs/adr/0023-a-new-decision.md", "# ADR 0023\n")
    code, out = run(tree, capsys)
    assert code == 1
    assert "FAIL  the ADR index doesn't link 0023-a-new-decision.md" in out
    append(tree, "docs/adr/README.md", "| [0023](0023-a-new-decision.md) | new |\n")
    code, out = run(tree, capsys)
    assert code == 0, out


def test_each_decision_user_story_6_names_needs_its_adr(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tree / "docs" / "adr" / "0003-compose-first.md").unlink()
    index = tree / "docs" / "adr" / "README.md"
    index.write_text(
        "".join(
            line
            for line in index.read_text(encoding="utf-8").splitlines(keepends=True)
            if "0003" not in line
        ),
        encoding="utf-8",
    )
    code, out = run(tree, capsys)
    assert code == 1
    assert "FAIL  no ADR 0003" in out


def test_a_missing_index_fails(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
    (tree / "docs" / "adr" / "README.md").unlink()
    code, out = run(tree, capsys)
    assert code == 1
    assert "FAIL  docs/adr/README.md, the ADR index, is missing" in out


def test_a_file_that_isnt_utf8_fails_rather_than_crashing(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tree / "docs" / "latin1.md").write_bytes(b"# Caf\xe9\n")
    code, out = run(tree, capsys)
    assert code == 1
    assert "FAIL  docs/latin1.md: not UTF-8" in out


def test_the_repository_passes(capsys: pytest.CaptureFixture[str]) -> None:
    code, out = run(REPO, capsys)
    assert code == 0, "\n".join(line for line in out.splitlines() if "FAIL" in line)
    # Not vacuous: the scan reads the spec folder's hundreds of links and every ADR.
    summary = out.splitlines()[-1]
    links = int(summary.split(", ")[1].split()[0])
    assert links > 500, summary
    assert "the ADR index links every ADR file" in out
