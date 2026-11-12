"""Tests for the night shift's Claude settings and prompts (spec 017, tasks.md T019, T020; FR-036, FR-041).

- `deploy/night-shift/claude/managed-settings.json` is baked into every image at /etc/claude-code/. It must be exactly
  the file the container probe's third run proved (research R-18).
- `deploy/night-shift/claude/<role>.settings.json` is each role's layer: its permissions, `forceLoginMethod`, Claude
  Code's sandbox off (it can't start in a container, the probe), and nothing that could carry a credential.
- `deploy/night-shift/runner/prompts/<role>.md` is each session's opening prompt.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
CLAUDE = ROOT / "claude"
PROMPTS = ROOT / "runner" / "prompts"
ROLES = (
    "supervisor",
    "spec-writer",
    "implementer",
    "reviewer",
    "red-teamer",
    "ops",
    "gate-runner",
    "studio",
)
WRITING = {"supervisor", "spec-writer", "implementer", "ops", "studio"}
READING = {"reviewer", "red-teamer", "gate-runner"}
CREDENTIAL_WORDS = (
    "KEY",
    "TOKEN",
    "SECRET",
    "PASSWORD",
    "CREDENTIAL",
    "AWS_",
    "ANTHROPIC",
    "BEDROCK",
    "VERTEX",
)


def test_managed_settings_are_exactly_the_proven_file():
    data = json.loads((CLAUDE / "managed-settings.json").read_text())
    assert data == {
        "forceLoginMethod": "claudeai",
        "env": {"ANTHROPIC_API_KEY": "", "ANTHROPIC_AUTH_TOKEN": ""},
    }


def test_there_is_a_layer_for_each_role_and_no_other():
    names = sorted(p.name for p in CLAUDE.glob("*.settings.json"))
    assert names == sorted(f"{r}.settings.json" for r in ROLES)


def walk(obj, path=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield f"{path}.{k}", k, v
            yield from walk(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk(v, f"{path}[{i}]")


@pytest.mark.parametrize("role", ROLES)
def test_each_layer(role):
    data = json.loads((CLAUDE / f"{role}.settings.json").read_text())
    assert data["forceLoginMethod"] == "claudeai"
    assert data["sandbox"] == {"enabled": False}
    for where, key, _value in walk(data):
        assert key not in (
            "apiKeyHelper",
            "awsAuthRefresh",
            "awsCredentialExport",
            "otelHeadersHelper",
        ), where
    # No environment at all: a layer can't carry a credential, and the runner sets each container's environment.
    assert "env" not in data
    perms = data["permissions"]
    assert perms["defaultMode"] in ("default", "acceptEdits")
    assert perms["defaultMode"] != "bypassPermissions"
    assert (
        "disableBypassPermissionsMode" in perms
        and perms["disableBypassPermissionsMode"] == "disable"
    )
    allow = perms.get("allow", [])
    if role in READING:
        assert perms["defaultMode"] == "default"
        for rule in allow:
            tool = rule.split("(", 1)[0]
            if tool in ("Edit", "Write", "NotebookEdit"):
                assert rule in ("Write(//night/io/out/**)",), rule
    else:
        assert role in WRITING
        assert "Edit" in allow and "Write" in allow
    # Never widen past the project: no rule names the Author's secrets or the socket.
    text = json.dumps(data)
    for word in (".aws", ".ssh", "docker.sock", "h4reet-ai/night-shift/claude.env"):
        assert word not in text


@pytest.mark.parametrize("role", ROLES)
def test_each_layer_holds_no_credential_shaped_value(role):
    data = json.loads((CLAUDE / f"{role}.settings.json").read_text())
    for where, key, value in walk(data):
        assert not any(w in key.upper() for w in CREDENTIAL_WORDS), where
        if isinstance(value, str):
            assert len(value) < 200, where


@pytest.mark.parametrize("role", ROLES)
def test_each_prompt(role):
    text = (PROMPTS / f"{role}.md").read_text()
    assert len(text) < 6000
    assert not text.startswith(
        "-"
    )  # it follows `claude -p`, so it must never read as a flag
    low = text.lower()
    assert "save point" in low and "wip(" in text
    assert "decision page" in low and "recommended" in low
    for kind in ('"plan"', '"gate"', '"comfyui"'):
        assert kind in text, kind
    assert "/night/io/out/" in text and "/night/io/in/" in text
    assert "--bare" not in text
    assert "push" not in low or "never push" in low


def test_the_prompts_are_exactly_the_eight_roles():
    assert sorted(p.stem for p in PROMPTS.glob("*.md")) == sorted(ROLES)
