"""Tests for the decision page (spec 017, tasks.md T017; contracts/decision-page.md).

The supervisor writes the page; the runner appends to `## The runner` only. `check_page` is what the supervisor's
prompt and the morning's reading rely on: the sections in order, each question once, each with the task it blocks and
a recommended answer.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location(
    "night_fixtures", HERE / "night_fixtures.py"
)
assert _spec and _spec.loader
nf = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(nf)


@pytest.fixture
def night():
    return nf.load_night()


GOOD = """# The night of 2026-11-14

## Questions
### Q1: Should the resume link to the talk's recording?
Blocks: res-02 · Recommended: yes, the public one · Others: no; only the slides

### Q2: Which licence for the dog's textures?
Blocks: dog-01 · Recommended: CC0

## Stacks
| Branch | Tip | Note | Gate |
|---|---|---|---|
| feat/018-resume-links | 0123456789ab | docs/merge-requests/x.md | — |

## Interruptions
| When | Task | Cause |
|---|---|---|

## Requests

## The runner
- 01:00Z the night starts
"""


def test_the_template_passes(night):
    text = night.page_template("2026-11-14")
    assert night.check_page(text) == []
    assert text.startswith("# The night of 2026-11-14\n")


def test_a_good_page_passes(night):
    assert night.check_page(GOOD) == []


def test_the_sections_come_in_order(night):
    heads = [
        ln
        for ln in night.page_template("2026-11-14").splitlines()
        if ln.startswith("## ")
    ]
    assert heads == [
        "## Questions",
        "## Stacks",
        "## Interruptions",
        "## Requests",
        "## The runner",
    ]


@pytest.mark.parametrize(
    ("text", "finding"),
    [
        (GOOD.replace("## Stacks", "## Stackz"), "sections"),
        (
            GOOD.replace("## Interruptions", "## TEMP")
            .replace("## Stacks", "## Interruptions")
            .replace("## TEMP", "## Stacks"),
            "sections",
        ),
        (GOOD.replace("## Requests\n", ""), "sections"),
        (GOOD.replace("# The night of", "# A night of"), "title"),
        (
            GOOD.replace(
                "Q2: Which licence for the dog's textures?",
                "Q2: Should the resume link to the talk's recording?",
            ),
            "once",
        ),
        (GOOD.replace("Q2:", "Q1:"), "once"),
        (GOOD.replace(" · Recommended: CC0", ""), "Recommended"),
        (GOOD.replace("Blocks: dog-01 · ", ""), "Blocks"),
        (GOOD.replace("textures?", "textures"), "?"),
        (GOOD.replace("Blocks: dog-01 · Recommended: CC0\n", ""), "Blocks"),
    ],
)
def test_each_broken_rule_is_a_finding(night, text, finding):
    findings = night.check_page(text)
    assert findings, text
    assert any(finding in f for f in findings), findings


def test_the_runner_appends_only_under_its_section(night):
    out = night.append_runner_line(GOOD, "02:00Z usage limit: the night waits")
    head, sep, tail = out.partition("## The runner\n")
    assert sep
    assert head == GOOD.partition("## The runner\n")[0]
    assert tail == "- 01:00Z the night starts\n- 02:00Z usage limit: the night waits\n"
    assert night.check_page(out) == []


def test_appending_keeps_a_later_section_in_place(night):
    text = GOOD + "\n## Notes\nby hand\n"
    out = night.append_runner_line(text, "x")
    assert out.endswith("- x\n\n## Notes\nby hand\n")
    assert out.partition("## The runner\n")[0] == text.partition("## The runner\n")[0]


def test_appending_to_an_empty_page_starts_from_the_template(night):
    out = night.append_runner_line("", "x", date="2026-11-14")
    assert out.startswith("# The night of 2026-11-14\n")
    assert out.endswith("## The runner\n- x\n")


def test_appending_to_a_page_without_the_section_adds_it_last(night):
    text = GOOD.partition("## The runner\n")[0].rstrip("\n") + "\n"
    out = night.append_runner_line(text, "x")
    assert out.startswith(text)
    assert out.endswith("\n## The runner\n- x\n")


def test_a_line_is_one_line(night):
    out = night.append_runner_line(GOOD, "two\nlines\n## Questions")
    added = out[len(GOOD) :]
    assert added.count("\n") == 1 and "## Questions" not in added.replace(
        "- two lines ## Questions", ""
    )
    assert night.check_page(out) == []


def test_the_runners_page_lines_go_on_the_supervisors_branch_file(night, tmp_path):
    h = nf.Home(tmp_path)
    runner, _fx = nf.make_runner(night, h)
    runner.start_supervisor()
    runner.page("hello from the runner")
    p = Path(runner.page_path())
    assert p == Path(runner.sup.worktree) / "docs" / "night-shift" / f"{nf.NIGHT}.md"
    text = p.read_text()
    assert night.check_page(text) == []
    assert text.rstrip().endswith("hello from the runner")


def test_a_symlinked_page_folder_isnt_followed(night, tmp_path):
    h = nf.Home(tmp_path)
    runner, _fx = nf.make_runner(night, h)
    runner.start_supervisor()
    victim = tmp_path / "victim"
    victim.mkdir()
    docs = Path(runner.sup.worktree) / "docs"
    docs.mkdir(exist_ok=True)
    (docs / "night-shift").symlink_to(victim)
    runner.page("x")
    assert list(victim.iterdir()) == []
