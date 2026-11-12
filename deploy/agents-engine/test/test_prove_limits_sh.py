"""Tests for deploy/agents-engine/prove-limits.sh's classifiers (spec 000, FR-039; contracts/agents-engine.md §7).

The script runs only on the host, against the live engine, so these load its pure functions alone: each is cut from
the script by name and run in bash on recorded engine output.

    PYTHONPYCACHEPREFIX=$TMPDIR/pyc pytest -q -p no:cacheprovider --import-mode=importlib deploy/agents-engine
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "prove-limits.sh"
TEXT = SCRIPT.read_text(encoding="utf-8")
LINK = "/run/h4agents/tree/.h4-prove-e5c"


def function(name: str) -> str:
    """A function's definition, from its `name() {` line to the `}` that closes it at the start of a line."""
    match = re.search(rf"^{name}\(\) {{\n.*?^}}\n", TEXT, re.MULTILINE | re.DOTALL)
    assert match, name
    return match.group(0)


def link_refusal(rc: int, out: str, source: str = LINK) -> str:
    script = (
        function("refusal_rule")
        + function("link_refusal")
        + 'link_refusal "$1" "$2" "$3"\n'
    )
    done = subprocess.run(
        ["bash", "-c", script, "bash", str(rc), out, source],
        capture_output=True,
        text=True,
        check=True,
    )
    return done.stdout.strip()


def test_the_plugins_refusal_names_its_rule() -> None:
    out = "docker: Error response from daemon: refused by h4-authz (A14): HostConfig.Binds."
    assert link_refusal(125, out) == "the plugin (A14)"


def test_the_kernels_eloop_is_named() -> None:
    out = f"docker: Error response from daemon: {LINK}: too many levels of symbolic links."
    assert link_refusal(125, out) == "ELOOP"


def test_the_daemons_mkdir_over_the_unfollowed_link_is_the_kernels_refusal() -> None:
    # Stage E, 2026-10-13: on a nosymfollow root the daemon's stat of the link gets ELOOP, so it makes the source as a
    # directory, and mkdir finds the link itself there.
    out = (
        "docker: Error response from daemon: error while creating mount source path "
        f"'{LINK}': mkdir {LINK}: file exists."
    )
    assert link_refusal(125, out).startswith("the kernel (nosymfollow")


@pytest.mark.parametrize(
    "out",
    [
        (
            "docker: Error response from daemon: error while creating mount source path "
            "'/run/h4agents/tree/other': mkdir /run/h4agents/tree/other: file exists."
        ),
        (
            "docker: Error response from daemon: error while creating mount source path "
            f"'{LINK}': mkdir {LINK}: permission denied."
        ),
        "",
    ],
)
def test_other_failures_name_no_refusal(out: str) -> None:
    assert link_refusal(125, out) == ""


def test_a_run_that_succeeded_is_no_refusal() -> None:
    out = f"error while creating mount source path '{LINK}': mkdir {LINK}: file exists"
    assert link_refusal(0, out) == ""


# E7 and the bare file-name patterns (spec 001's P-1: *.tfstate*, *.tfplan, *.tfvars*), which no mask can hold:
# the host side takes them from the settings, as engine.sh's check_tree_masks does, and walks the container's view
# of the tree for a file one matches, and plants one for engine.sh up to refuse.


def bash_function(name: str, *args: str) -> str:
    done = subprocess.run(
        ["bash", "-c", function(name) + f'{name} "$@"\n', "bash", *args],
        capture_output=True,
        text=True,
        check=True,
    )
    return done.stdout.strip()


@pytest.mark.parametrize(
    ("layer", "entry", "glob"),
    [
        ("rule", "*.tfstate*", "*.tfstate*"),
        ("rule", "*.tfplan", "*.tfplan"),
        ("rule", "*.tfvars*", "*.tfvars*"),
        ("fs", "*.pem", "*.pem"),
        # The env globs are the env probe's, as engine.sh's step 3 holds them apart.
        ("rule", ".env*", ""),
        ("rule", "*.env", ""),
        ("fs", ".env.*", ""),
        # A / makes it a path, which a mask must hold; no glob makes it a name the masks hold.
        ("rule", "./config/*.key", ""),
        ("rule", "infra/*.tfstate", ""),
        ("rule", "~/.aws/**", ""),
        ("fs", "secrets", ""),
        # The whole tree is no name.
        ("rule", "*", ""),
        ("rule", "**", ""),
    ],
)
def test_deny_name_glob_takes_bare_name_patterns_alone(
    layer: str, entry: str, glob: str
) -> None:
    assert bash_function("deny_name_glob", layer, entry) == glob


@pytest.mark.parametrize(
    ("glob", "sample"),
    [
        ("*.tfstate*", "__h4-prove-e7.tfstate"),
        ("*.tfplan", "__h4-prove-e7.tfplan"),
        ("*.tfvars*", "__h4-prove-e7.tfvars"),
        (
            "key-?.pem*",
            "",
        ),  # no leading star: no sample, so no plausible name is planted
        ("*.[pk]em", ""),  # a bracket: no sample
    ],
)
def test_glob_sample_is_a_planted_name_the_pattern_matches(
    glob: str, sample: str
) -> None:
    got = bash_function("glob_sample", glob)
    assert got == sample
    if got:
        matched = subprocess.run(
            ["bash", "-c", "[[ $1 == $2 ]]", "bash", got, glob], check=False
        )
        assert matched.returncode == 0


def walk(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    """E7's in-container walk, run against a tree at root instead of the container's /tree."""
    body = function("e7_hidden_paths")
    match = re.search(r"local script='(.*?)'\n", body, re.DOTALL)
    assert match
    script = match.group(1)
    assert script.count('tree = "/tree"') == 1
    script = script.replace('tree = "/tree"', f"tree = {str(root)!r}")
    return subprocess.run(
        ["python3", "-I", "-c", script, *args],
        capture_output=True,
        text=True,
        check=False,
    )


def tree_with(tmp_path: Path, *files: str) -> Path:
    root = tmp_path / "tree"
    for rel in ("deploy/agents-engine/tree-masks.txt", *files):
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_text("x\n", encoding="utf-8")
    return root


def test_the_walk_finds_a_file_a_bare_pattern_matches(tmp_path: Path) -> None:
    root = tree_with(tmp_path, "infra/bootstrap/terraform.tfstate", "infra/main.tf")
    done = walk(root, "--", "*.tfstate*", "*.tfplan")
    assert done.returncode == 3, done.stdout + done.stderr
    assert (
        "files the sandbox denies by name visible: infra/bootstrap/terraform.tfstate"
        in done.stdout
    )


def test_the_walk_passes_with_no_such_file(tmp_path: Path) -> None:
    root = tree_with(tmp_path, "infra/main.tf", "x.env.example")
    done = walk(root, "--", "*.tfstate*", "*.tfplan", "*.tfvars*")
    assert done.returncode == 0, done.stdout + done.stderr
    assert done.stdout.startswith("0 masks, 3 files walked")


def test_the_walk_still_finds_env_files_without_patterns(tmp_path: Path) -> None:
    done = walk(tree_with(tmp_path, "deploy/x.env"))
    assert done.returncode == 3
    assert "env files visible: deploy/x.env" in done.stdout
