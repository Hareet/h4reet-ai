"""Tests for evals/agent-config/static.py, on a throwaway copy of the governance files."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "agent_config_static", REPO / "evals" / "agent-config" / "static.py"
)
assert SPEC and SPEC.loader
static = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = static
SPEC.loader.exec_module(static)

SUPERSEDES_LINE = "`.specify/memory/constitution.md` supersedes this file.\n"


def settings(names: list[str], hooks: list[tuple[str, str, str]]) -> dict:
    groups: dict[str, list] = {}
    for event, matcher, script in hooks:
        groups.setdefault(event, []).append(
            {
                "matcher": matcher,
                "hooks": [
                    {"type": "command", "command": "${CLAUDE_PROJECT_DIR}/" + script}
                ],
            }
        )
    return {
        "hooks": groups,
        "sandbox": {
            "credentials": {"envVars": [{"name": n, "mode": "deny"} for n in names]}
        },
    }


@pytest.fixture
def tree(tmp_path: Path) -> Path:
    """A minimal repository whose governance files pass every check, with today's planned items."""
    (tmp_path / "CLAUDE.md").write_text("# rules\n" + SUPERSEDES_LINE, encoding="utf-8")
    (tmp_path / "REVIEW.md").write_text(
        "# review\n" + SUPERSEDES_LINE, encoding="utf-8"
    )
    agents = tmp_path / ".claude" / "agents"
    agents.mkdir(parents=True)
    (agents / "reviewer.md").write_text(
        "---\nname: reviewer\ntools: Read, Grep\n---\n", encoding="utf-8"
    )
    gates = tmp_path / "tools" / "gates"
    gates.mkdir(parents=True)
    (gates / "roles.expected").write_text(
        "# comment\nreviewer: Read, Grep\n", encoding="utf-8"
    )
    current = [h for h in static.HOOKS if f"hook {h[2]}" not in static.PLANNED]
    names = sorted(static.DENIED_BEFORE_SPEC_000)
    (tmp_path / ".claude" / "settings.json").write_text(
        json.dumps(settings(names, current)), encoding="utf-8"
    )
    return tmp_path


def test_the_repository_passes_with_only_planned_items(
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert static.main(REPO) == 0
    assert "0 failed" in capsys.readouterr().out


def test_a_minimal_tree_passes(tree: Path) -> None:
    assert static.main(tree) == 0


def test_claude_md_over_sixty_lines_fails(tree: Path) -> None:
    (tree / "CLAUDE.md").write_text(SUPERSEDES_LINE + "x\n" * 60, encoding="utf-8")
    assert static.main(tree) == 1


def test_a_missing_supersedes_line_fails(tree: Path) -> None:
    (tree / "REVIEW.md").write_text("# review\n", encoding="utf-8")
    assert static.main(tree) == 1


def test_a_role_whose_tools_drift_fails(tree: Path) -> None:
    (tree / ".claude" / "agents" / "reviewer.md").write_text(
        "tools: Read, Grep, Bash\n", encoding="utf-8"
    )
    assert static.main(tree) == 1


def test_a_role_without_an_expected_line_fails(tree: Path) -> None:
    (tree / ".claude" / "agents" / "ops.md").write_text(
        "tools: Read\n", encoding="utf-8"
    )
    assert static.main(tree) == 1


def test_an_unregistered_current_hook_fails_but_a_planned_one_does_not(
    tree: Path,
) -> None:
    names = sorted(static.DENIED_BEFORE_SPEC_000)
    path = tree / ".claude" / "settings.json"
    path.write_text(json.dumps(settings(names, [])), encoding="utf-8")
    assert (
        static.main(tree) == 1
    )  # bash-gate and the others are current, so their absence fails
    planned_only = [h for h in static.HOOKS if f"hook {h[2]}" not in static.PLANNED]
    path.write_text(json.dumps(settings(names, planned_only)), encoding="utf-8")
    assert (
        static.main(tree) == 0
    )  # content-scan.sh is PLANNED (T045), so its absence doesn't fail


def test_an_fr007_name_that_is_neither_denied_nor_planned_fails(
    tree: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        static,
        "PLANNED",
        {k: v for k, v in static.PLANNED.items() if k != "variable SMTP_PASSWORD"},
    )
    assert static.main(tree) == 1


def test_a_denied_name_is_reported_as_denied(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    current = [h for h in static.HOOKS if f"hook {h[2]}" not in static.PLANNED]
    names = sorted(static.DENIED_BEFORE_SPEC_000 | {"SMTP_PASSWORD"})
    (tree / ".claude" / "settings.json").write_text(
        json.dumps(settings(names, current)), encoding="utf-8"
    )
    assert static.main(tree) == 0
    out = capsys.readouterr().out
    assert "variable SMTP_PASSWORD" not in out
    assert (
        f"{len(static.DENIED_BEFORE_SPEC_000) + 1} of {len(static.FR007_VARIABLES)} variables"
        in out
    )
