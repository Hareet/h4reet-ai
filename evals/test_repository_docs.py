"""The repository's front door against spec 000's User Story 6 (tasks.md T109, T111, T112, T113; plan §16).

- README.md links what User Story 6's first scenario names (quickstart.md §5.1), and what T109 adds: the data-flow
  disclosure, the runbooks, and the recordings, the breach recording on the non-engineer path. It carries the status
  and a devcontainer quickstart with the CLI version quickstart.md §6.2 pins.
- docs/START-HERE.md has §16's steps, its gotchas, and its "Before you merge" section, and keeps the section numbers
  the plan, the spec, and tasks.md cite (START-HERE §4, §6).
- .github/CODEOWNERS covers the human-only paths T113 lists (FR-001).
- docs/how-we-build/lifecycle.md's enforcement table has the layers each later patch and gate adds (T111).
"""

from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "h4_docs_links_front_door", REPO / "evals" / "docs_links.py"
)
assert SPEC and SPEC.loader
docs_links = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = docs_links
SPEC.loader.exec_module(docs_links)

README = REPO / "README.md"
START_HERE = (REPO / "docs" / "START-HERE.md").read_text(encoding="utf-8")
QUICKSTART = (REPO / "specs" / "000-local-foundations" / "quickstart.md").read_text(
    encoding="utf-8"
)


def section(text: str, heading: str) -> str:
    """A Markdown section: from the heading line that starts with `heading` to the next heading of its level or above."""
    level = len(heading) - len(heading.lstrip("#"))
    lines = text.splitlines()
    start = next(i for i, line in enumerate(lines) if line.startswith(heading))
    end = next(
        (
            i
            for i in range(start + 1, len(lines))
            if re.match(rf"#{{1,{level}}} ", lines[i])
        ),
        len(lines),
    )
    return "\n".join(lines[start:end])


def readme_targets(text: str) -> set[Path]:
    checker = docs_links.Checker(REPO)
    return checker.targets(README, docs_links.find_links(text))


def links_into(targets: set[Path], path: str) -> bool:
    """Whether a link leads to the path, or into it when it is a directory."""
    want = REPO / path
    return any(t == want or want in t.parents for t in targets)


# User Story 6's first scenario (quickstart.md §5.1), then what T109 adds.
US6_LINKS = [
    ".specify/memory/constitution.md",
    "intent",
    "specs",
    "docs/adr",
    "docs/how-we-build",
    "SECURITY.md",
    "LICENSE",
]
T109_LINKS = ["docs/data-flow-disclosure.md", "docs/runbooks", "docs/recordings"]


def test_the_readme_links_what_user_story_6_and_t109_name() -> None:
    targets = readme_targets(README.read_text(encoding="utf-8"))
    missing = [p for p in US6_LINKS + T109_LINKS if not links_into(targets, p)]
    assert missing == []
    assert all((REPO / p).exists() for p in US6_LINKS + T109_LINKS)


def test_the_breach_recording_is_on_the_non_engineer_path() -> None:
    path = section(README.read_text(encoding="utf-8"), "### Not an engineer?")
    assert links_into(readme_targets(path), "docs/recordings")
    assert "breach" in path.lower()


def test_the_readme_has_the_status_and_a_devcontainer_quickstart() -> None:
    text = README.read_text(encoding="utf-8")
    assert "Nothing runs yet" not in text
    assert re.search(r"^> \*\*Status: ", text, re.MULTILINE)
    (version,) = set(re.findall(r"npx @devcontainers/cli@([0-9.]+) up", QUICKSTART))
    quickstart = section(text, "## Quickstart")
    assert f"npx @devcontainers/cli@{version} up --workspace-folder ." in quickstart
    assert "make test" in quickstart and "SC-007" in quickstart


def test_start_here_keeps_the_section_numbers_others_cite() -> None:
    # plan §12 and tasks.md T120 cite START-HERE §6 and its step 1; plan §16 and tasks.md T112 cite §4.
    assert re.search(r"^## 4\. Gotchas", START_HERE, re.MULTILINE)
    assert re.search(r"^## 6\. Going public", START_HERE, re.MULTILINE)


def test_start_here_section_1_has_plan_16s_steps() -> None:
    first = section(START_HERE, "## 1. ")
    for step in (
        "sudo nvidia-ctk runtime configure --runtime=docker",
        "df -h /mnt/c",
        "make tools",
        "deploy/agents-engine/engine.sh setup",
        "wsl --shutdown",
    ):
        assert step in first, step
    assert "nvm alias default" in first  # the default Node is left alone


def test_start_here_has_the_three_gotchas() -> None:
    gotchas = section(START_HERE, "## 4. ")
    assert "glob" in gotchas.lower() and "Linux" in gotchas
    assert "`-p`" in gotchas and "claude doctor" in gotchas
    assert "User-level settings" in gotchas
    assert (
        "shell profile" in gotchas
    )  # where the Telegram token must not go (preflight's P5)


def test_start_heres_going_public_starts_with_publish_check() -> None:
    going_public = section(START_HERE, "## 6. ")
    first_step = re.search(r"^1\. (.*)$", going_public, re.MULTILINE)
    assert first_step and first_step.group(1).startswith("**`make publish-check`")


def test_start_here_has_a_before_you_merge_section() -> None:
    merge = section(START_HERE, "## 7. Before you merge")
    for item in (
        "tools/gates/gate <branch>",
        "make evals-agent-config",
        "evals/agent-config/history/",
        "`make check`",
        "`make test`",
        "claude doctor",
    ):
        assert item in merge, item
    assert "never through make" in merge


# tasks.md T113: the human-only paths spec 000 adds (FR-001; ADR 0017).
T113_PATTERNS = [
    "/tools/gates/",
    "/evals/agent-config/",
    "/.gitleaks.toml",
    "/deploy/agents-engine/",
    "/.mcp.json",
    "/config/prices*",
]


def test_codeowners_covers_the_new_human_only_paths() -> None:
    entries = {}
    for line in (
        (REPO / ".github" / "CODEOWNERS").read_text(encoding="utf-8").splitlines()
    ):
        if line.strip() and not line.startswith("#"):
            pattern, *owners = line.split()
            entries[pattern] = owners
    owner = entries["/.claude/"]
    assert owner  # the enforcement layer's owner, whom the new paths share
    assert {p: entries.get(p) for p in T113_PATTERNS} == {
        p: owner for p in T113_PATTERNS
    }


def test_the_enforcement_table_has_the_later_layers() -> None:
    lifecycle = (REPO / "docs" / "how-we-build" / "lifecycle.md").read_text(
        encoding="utf-8"
    )
    table = section(lifecycle, "## Enforcement layers")
    for layer in (
        "T098",  # the governance patch
        "T103",  # US5's patch
        "T117",  # the closing patch
        "tools/gates/gate",
        "make check",
        "make secrets",
        "make publish-check",
        "make evals-agent-config",
        "redteam/forbidden-actions.sh",
        "CODEOWNERS",
        "subagent-report-check.sh",
    ):
        assert layer in table, layer
