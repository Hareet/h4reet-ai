"""Shared by spec 001's Author-only Terraform scripts, make plan ROOT=…, make infra-verify, and make infra-record
(contracts/infra-records.md §1 and §2; research.md R-13, R-14, R-32; tasks.md T024). They run in the Author's terminal
through PY_HOST (python3 -I), so each loads this file by path, as it loads the guard patch's checkers.

Where things live, all outside the tree and under spec 000's deny of ~/.config/h4reet-ai:
  - the root's values: ~/.config/h4reet-ai/infra/<root>.env, TF_VAR_ lines, mode 0600, read as data;
  - the saved plans: ~/.config/h4reet-ai/infra/plans/<root>-<tree>.tfplan, and the verified stamp beside each;
  - Terraform's data folder, per root: ~/.config/h4reet-ai/infra/data/<root>, its TF_DATA_DIR, so no .terraform/
    folder ever sits in the tree, where an agent could plant a provider that his terraform would run (rule T4);
  - the local state, until it moves: ~/.config/h4reet-ai/infra/state/<root>.tfstate.
Terraform runs with PATH, HOME, and the values each step needs, never the shell's TF_CLI_ARGS*, TF_VAR_*, or AWS_*.
"""

from __future__ import annotations

import hashlib
import importlib.util
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ROOTS = ("bootstrap", "account", "prod")
PROFILE = re.compile(r"[A-Za-z0-9._-]+")
TF_VAR = re.compile(r"TF_VAR_([A-Za-z_][A-Za-z0-9_]*)=(.*)")
STATE_BUCKET = "h4reet-ai-tfstate-{}"


class Refusal(Exception):
    """A refusal with its contract code (contracts/infra-records.md §2) and a reason that never holds a value."""

    def __init__(self, code: str, reason: str) -> None:
        super().__init__(reason)
        self.code = code
        self.reason = reason


def infra_home(home: Path) -> Path:
    return home / ".config" / "h4reet-ai" / "infra"


def plans_dir(home: Path) -> Path:
    return infra_home(home) / "plans"


def plan_path(home: Path, root: str, tree: str) -> Path:
    return plans_dir(home) / f"{root}-{tree}.tfplan"


def stamp_path(plan: Path) -> Path:
    return plan.with_suffix(".verified")


def data_dir(home: Path, root: str) -> Path:
    return infra_home(home) / "data" / root


def state_path(home: Path, root: str) -> Path:
    return infra_home(home) / "state" / f"{root}.tfstate"


def mirror_dir(home: Path) -> Path:
    return home / ".local" / "share" / "h4reet" / "terraform-providers"


def in_sandbox() -> bool:
    return os.environ.get("SANDBOX_RUNTIME") == "1"


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class GitError(RuntimeError):
    pass


def git(
    repo: Path, *args: str, stdin: str | None = None, env: dict[str, str] | None = None
) -> str:
    done = subprocess.run(
        ["git", "--no-replace-objects", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        input=stdin,
        env=env,
        check=False,
    )
    if done.returncode != 0:
        raise GitError(f"git {args[0]} failed")
    return done.stdout


def load_gate(repo: Path, name: str):
    """One of the guard patch's checkers, tools/gates/<name>.py, by path (P-1)."""
    path = repo / "tools" / "gates" / f"{name}.py"
    if not path.is_file():
        raise FileNotFoundError(f"tools/gates/{name}.py")
    spec = importlib.util.spec_from_file_location(f"gate_{name}", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def read_pins(repo: Path) -> dict[str, str]:
    pins = {}
    for raw in (
        (repo / ".devcontainer" / "toolchain.vars")
        .read_text(encoding="utf-8")
        .splitlines()
    ):
        key, sep, value = raw.strip().partition("=")
        if sep and not key.startswith("#"):
            pins[key] = value
    return pins


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def profile_of(given: str | None) -> str:
    profile = given or os.environ.get("AWS_PROFILE", "")
    if not profile:
        raise Refusal(
            "no_profile",
            "name your SSO profile: PROFILE=h4reet-… (make aws-login PROFILE=… starts its session)",
        )
    if not PROFILE.fullmatch(profile):
        raise Refusal(
            "no_profile", "PROFILE takes letters, digits, '.', '_', and '-' only"
        )
    return profile


def terraform_bin() -> str:
    found = shutil.which("terraform")
    if found is None:
        raise Refusal("no_terraform", "there is no terraform on PATH")
    return found


def terraform_env(home: Path, root: str, **extra: str) -> dict[str, str]:
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": str(home),
        "CHECKPOINT_DISABLE": "1",
        "TF_IN_AUTOMATION": "1",
        "TF_INPUT": "0",
        "TF_DATA_DIR": str(data_dir(home, root)),
    }
    env.update({k: v for k, v in extra.items() if v is not None})
    return env


def terraform(
    repo: Path, root: str, args: list[str], env: dict[str, str]
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [terraform_bin(), f"-chdir=infra/{root}", *args],
        capture_output=True,
        text=True,
        cwd=repo,
        env=env,
        check=False,
        stdin=subprocess.DEVNULL,
    )


def aws_env(home: Path) -> dict[str, str]:
    """The AWS CLI's environment: the profile goes by --profile, so none of the shell's AWS_* reaches it."""
    return {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(home)}


def read_env_file(home: Path, root: str, declared: set[str] | None) -> dict[str, str]:
    """~/.config/h4reet-ai/infra/<root>.env as data: TF_VAR_<name>=<value> lines, comments, and blanks, never sourced.
    Each name must be one the root declares. The reasons name the line, never a value."""
    path = infra_home(home) / f"{root}.env"
    rel = f"~/.config/h4reet-ai/infra/{root}.env"
    if not path.is_file():
        raise Refusal(
            "no_values",
            f"{rel} is missing: write the root's TF_VAR_ lines there, mode 0600",
        )
    if path.stat().st_mode & 0o077:
        raise Refusal("no_values", f"{rel} is readable by others: chmod 600 it")
    values = {}
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        m = TF_VAR.fullmatch(line)
        if not m:
            raise Refusal(
                "no_values", f"{rel}:{number} isn't a TF_VAR_<name>=<value> line"
            )
        name, value = m.group(1), m.group(2).strip()
        if declared is not None and name not in declared:
            raise Refusal(
                "no_values",
                f"{rel}:{number}: TF_VAR_{name} isn't a variable of infra/{root}",
            )
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[f"TF_VAR_{name}"] = value
    return values


def root_blocks(policy, repo: Path, root: str) -> list:
    blocks = []
    for path in sorted((repo / "infra" / root).glob("*.tf")):
        blocks += [
            b
            for b in policy.parse_hcl(path.read_text(encoding="utf-8"))
            if isinstance(b, policy.Block)
        ]
    return blocks


def declared_variables(policy, repo: Path, root: str) -> set[str]:
    return {
        b.labels[0]
        for b in root_blocks(policy, repo, root)
        if b.type == "variable" and b.labels
    }


def backend_of(policy, repo: Path, root: str) -> str | None:
    found = [
        b.labels[0]
        for t in root_blocks(policy, repo, root)
        if t.type == "terraform"
        for b in t.blocks("backend")
    ]
    return found[0] if found else None


def terraform_reads(path: str) -> bool:
    """Whether terraform could read the path: a configuration, variable, test, or lock file, or a .terraform/ folder."""
    name = path.rstrip("/").rsplit("/", 1)[-1]
    return (
        "/.terraform/" in f"/{path}"
        or name == ".terraform"
        or name.endswith(
            (
                ".tf",
                ".tf.json",
                ".tfvars",
                ".tfvars.json",
                ".hcl",
                ".tfstate",
                ".tfplan",
            )
        )
        or ".tfstate." in name
    )


def infra_dirty(repo: Path) -> list[str]:
    """Tracked changes anywhere; any untracked file under infra/; and an ignored one there that terraform could read,
    since it reads every .tf file in a root, ignored or not (an ignored __pycache__ under infra/test/ doesn't count).
    The Author's own untracked files elsewhere in his checkout don't count either."""
    tracked = git(repo, "status", "--porcelain=v1", "--untracked-files=no").splitlines()
    infra = git(
        repo,
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
        "--ignored=matching",
        "--",
        "infra",
    ).splitlines()
    found = {line[3:] for line in tracked if line.strip()}
    for line in infra:
        if line.startswith("!! ") and not terraform_reads(line[3:]):
            continue
        if line.strip():
            found.add(line[3:])
    return sorted(found)


def say(prog: str, message: str) -> None:
    print(f"{prog}: {message}", file=sys.stderr)
