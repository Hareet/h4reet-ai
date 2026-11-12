"""Scaffolding for scripts/infra's tests of the Author's Terraform targets (spec 001 tasks.md T021, T024): a scratch
repository on main, with infra/, the scripts under test, and the guard patch's checkers (P-1) copied in; a home with
~/.config/h4reet-ai/infra/ for the saved plans, Terraform's data folder, and the local state; and fake terraform and aws
executables that log each call and answer from a JSON file beside them. Nothing here reaches AWS or a registry.

The tests load this file by path (scripts/infra holds no package), and skip while P-1's checkers are missing.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
GATES = REPO / "tools" / "gates"
CHECKERS = ("infra_policy.py", "infra_redact.py", "infra_plan_note.py")
NOTE = "docs/merge-requests/2026-11-11-feat-001-x.md"
# Git without the machine's global or system configuration, so no hook or signing setting of the host applies.
GIT_ENV = {
    "GIT_CONFIG_GLOBAL": os.devnull,
    "GIT_CONFIG_NOSYSTEM": "1",
    "GIT_AUTHOR_NAME": "Test",
    "GIT_AUTHOR_EMAIL": "test" + "@" + "example.invalid",
    "GIT_COMMITTER_NAME": "Test",
    "GIT_COMMITTER_EMAIL": "test" + "@" + "example.invalid",
}

FAKE_TERRAFORM = f"""#!{sys.executable} -I
import json, os, sys
from pathlib import Path
args = sys.argv[1:]
fake = json.loads(Path(__file__).with_name("fake.json").read_text(encoding="utf-8"))
with open(fake["log"], "a", encoding="utf-8") as log:
    cfg = os.environ.get("TF_CLI_CONFIG_FILE")
    cli_config = Path(cfg).read_text(encoding="utf-8") if cfg and Path(cfg).is_file() else None
    log.write(json.dumps({{"tool": "terraform", "argv": args, "env": dict(os.environ), "cwd": os.getcwd(),
                          "cli_config": cli_config}}) + "\\n")
words = [a for a in args if not a.startswith("-chdir=")]
if words[:1] == ["version"]:
    print("Terraform v" + fake.get("tf", "1.17.1"))
    print("on linux_amd64")
    sys.exit(0)
if words[:1] == ["fmt"]:
    sys.stdout.write(fake.get("fmt_out", ""))
    sys.exit(int(fake.get("fmt_exit", 0)))
if words[:1] == ["init"]:
    data = Path(os.environ.get("TF_DATA_DIR", ".terraform"))
    data.mkdir(parents=True, exist_ok=True)
    config = {{a.split("=", 2)[1]: a.split("=", 2)[2] for a in words if a.startswith("-backend-config=")}}
    (data / "terraform.tfstate").write_text(
        json.dumps({{"version": 3, "backend": {{"type": fake.get("backend", "local"), "config": config}}}}),
        encoding="utf-8",
    )
    sys.exit(int(fake.get("init_exit", 0)))
if words[:1] == ["plan"]:
    out = next(a.split("=", 1)[1] for a in words if a.startswith("-out="))
    Path(out).write_bytes(fake.get("plan_bytes", "PLAN").encode())
    sys.exit(int(fake.get("plan_exit", 0)))
if words[:1] == ["show"]:
    rest = words[1:]
    if "-json" in rest:
        files = [a for a in rest if not a.startswith("-")]
        sys.stdout.write(json.dumps(fake["plan_json"] if files else fake.get("state_json", {{}})))
        sys.exit(int(fake.get("show_exit", 0)))
    sys.stdout.write(fake.get("show_text", ""))
    sys.exit(int(fake.get("show_exit", 0)))
sys.exit(9)
"""

FAKE_AWS = f"""#!{sys.executable} -I
import json, os, sys
from pathlib import Path
args = sys.argv[1:]
fake = json.loads(Path(__file__).with_name("fake.json").read_text(encoding="utf-8"))
with open(fake["log"], "a", encoding="utf-8") as log:
    log.write(json.dumps({{"tool": "aws", "argv": args, "env": dict(os.environ)}}) + "\\n")
words = [a for a in args if not a.startswith("--")]
key = " ".join(words[:2])
answer = fake.get("aws", {{}}).get(key)
if answer is None:
    sys.stderr.write("An error occurred (" + fake.get("aws_error", "AccessDenied") + ") when calling it\\n")
    sys.exit(254)
if isinstance(answer, dict) and "__error__" in answer:
    sys.stderr.write("An error occurred (" + answer["__error__"] + ") when calling it\\n")
    sys.exit(254)
sys.stdout.write(json.dumps(answer))
"""

# A stand-in for infra/lambdas/credential_audit/audit.py in the scratch repository: infra-verify runs the audit by
# path, so the tests give it one that answers from ~/audit.json.
STUB_AUDIT = """import json, sys
from pathlib import Path
fake = json.loads((Path.home() / "audit.json").read_text(encoding="utf-8"))
print(json.dumps(fake["result"]))
sys.exit(int(fake.get("exit", 0)))
"""


def git(repo: Path, *args: str) -> str:
    done = subprocess.run(
        ["git", "--no-replace-objects", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        env={**os.environ, **GIT_ENV},
        check=False,
    )
    assert done.returncode == 0, (args, done.stderr)
    return done.stdout


def checkers_present() -> bool:
    return all((GATES / name).is_file() for name in CHECKERS)


WHOLE_ROOT = {
    "versions.tf": (
        "terraform {\n"
        '  required_version = "{tf}"\n\n'
        "  required_providers {\n"
        "    aws = {\n"
        '      source  = "hashicorp/aws"\n'
        '      version = "{aws}"\n'
        "    }\n"
        "  }\n\n"
        '  backend "local" {}\n'
        "}\n"
    ),
    "variables.tf": (
        'variable "state_bucket_suffix" {\n  type = string\n}\n\n'
        'variable "alert_email" {\n  type      = string\n  sensitive = true\n}\n\n'
        'variable "server_budget_usd" {\n  type = number\n}\n'
    ),
    # A stand-in for the lockfile the Author makes from his mirror: the version alone, which is what rule T10 reads.
    ".terraform.lock.hcl": (
        'provider "registry.terraform.io/hashicorp/aws" {\n'
        '  version     = "{aws}"\n'
        '  constraints = "{aws}"\n'
        "}\n"
    ),
}


def make_repo(tmp: Path, scripts: tuple[str, ...], whole_root: bool = False) -> Path:
    """The scratch repository. With whole_root, infra/bootstrap is a root the guard patch's policy passes."""
    repo = tmp / "repo"
    repo.mkdir()
    git(repo, "init", "-q", "-b", "main")
    for name in CHECKERS:
        (repo / "tools" / "gates").mkdir(parents=True, exist_ok=True)
        shutil.copy(GATES / name, repo / "tools" / "gates" / name)
    for name in (*scripts, "infra_common.py"):
        (repo / "scripts" / "infra").mkdir(parents=True, exist_ok=True)
        shutil.copy(
            REPO / "scripts" / "infra" / name, repo / "scripts" / "infra" / name
        )
    (repo / ".devcontainer").mkdir()
    shutil.copy(
        REPO / ".devcontainer" / "toolchain.vars",
        repo / ".devcontainer" / "toolchain.vars",
    )
    audit = repo / "infra" / "lambdas" / "credential_audit" / "audit.py"
    audit.parent.mkdir(parents=True)
    audit.write_text(STUB_AUDIT, encoding="utf-8")
    root = repo / "infra" / "bootstrap"
    root.mkdir(parents=True)
    (root / "main.tf").write_text(
        'provider "aws" {\n  region = "us-east-1"\n\n  default_tags {\n    tags = {\n'
        '      project     = "h4reet-ai"\n      environment = "account"\n    }\n  }\n}\n',
        encoding="utf-8",
    )
    (root / "redact.txt").write_text(
        "bucket  # the state bucket's name\n", encoding="utf-8"
    )
    if whole_root:
        pins = dict(
            line.split("=", 1)
            for line in (repo / ".devcontainer" / "toolchain.vars")
            .read_text(encoding="utf-8")
            .splitlines()
            if "=" in line and not line.startswith("#")
        )
        for name, text in WHOLE_ROOT.items():
            (root / name).write_text(
                text.replace("{tf}", pins["TERRAFORM_VERSION"]).replace(
                    "{aws}", pins["TERRAFORM_AWS_PROVIDER_VERSION"]
                ),
                encoding="utf-8",
            )
    (repo / "docs" / "merge-requests").mkdir(parents=True)
    (repo / "docs" / "merge-requests" / "README.md").write_text(
        "notes\n", encoding="utf-8"
    )
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "base")
    return repo


def tree(repo: Path, rev: str = "HEAD") -> str:
    return git(repo, "rev-parse", f"{rev}:infra").strip()


def block(
    root: str, tree_hash: str, sha256: str, text: str, terraform: str = "1.17.1"
) -> str:
    return (
        f"<!-- h4-plan root={root} tree={tree_hash} sha256={sha256} terraform={terraform} "
        f"made=2026-11-11T08:00:00Z -->\n```terraform-plan\n{text.rstrip(chr(10))}\n```\n<!-- /h4-plan -->\n"
    )


def merge_note(
    repo: Path, body: str, branch: str = "feat/001-x", note_path: str = NOTE
) -> None:
    """A feature branch whose note holds `body`, merged into main with --no-ff, as the Author's gate merges."""
    git(repo, "switch", "-q", "-c", branch)
    note = repo / note_path
    note.write_text(f"# {branch}\n\n{body}", encoding="utf-8")
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "the note")
    git(repo, "switch", "-q", "main")
    git(repo, "merge", "-q", "--no-ff", "-m", f"Merge {branch}", branch)


def infra_home(home: Path) -> Path:
    return home / ".config" / "h4reet-ai" / "infra"


def write_plan(
    home: Path, root: str, tree_hash: str, data: bytes = b"PLAN"
) -> tuple[Path, str]:
    plans = infra_home(home) / "plans"
    plans.mkdir(parents=True, exist_ok=True)
    path = plans / f"{root}-{tree_hash}.tfplan"
    path.write_bytes(data)
    return path, hashlib.sha256(data).hexdigest()


def write_backend(home: Path, root: str, backend: str = "local", **config: str) -> Path:
    data = infra_home(home) / "data" / root
    data.mkdir(parents=True, exist_ok=True)
    if backend == "local" and "path" not in config:
        config["path"] = str(infra_home(home) / "state" / f"{root}.tfstate")
    (data / "terraform.tfstate").write_text(
        json.dumps({"version": 3, "backend": {"type": backend, "config": config}}),
        encoding="utf-8",
    )
    return data


def fakes(tmp: Path, **answers: object) -> Path:
    """The bin folder with fake terraform and aws, and their shared answers; returns the folder."""
    bin_dir = tmp / "bin"
    bin_dir.mkdir(exist_ok=True)
    for name, text in (("terraform", FAKE_TERRAFORM), ("aws", FAKE_AWS)):
        (bin_dir / name).write_text(text, encoding="utf-8")
        (bin_dir / name).chmod(0o755)
    answer(bin_dir, **answers)
    return bin_dir


def answer(bin_dir: Path, **answers: object) -> None:
    fake = {"log": str(bin_dir.parent / "calls.jsonl"), **answers}
    (bin_dir / "fake.json").write_text(json.dumps(fake), encoding="utf-8")


def calls(bin_dir: Path, tool: str | None = None) -> list[dict]:
    log = bin_dir.parent / "calls.jsonl"
    if not log.is_file():
        return []
    rows = [json.loads(line) for line in log.read_text(encoding="utf-8").splitlines()]
    return [r for r in rows if tool is None or r["tool"] == tool]


def run_script(
    repo: Path, home: Path, bin_dir: Path, script: str, *args: str, **env: str
) -> subprocess.CompletedProcess[str]:
    """The copy of the script inside the scratch repository, as the Makefile's PY_HOST runs it, outside the sandbox."""
    base = {"PATH": f"{bin_dir}:/usr/bin:/bin", "HOME": str(home), **GIT_ENV, **env}
    return subprocess.run(
        [sys.executable, "-I", "-B", str(repo / "scripts" / "infra" / script), *args],
        capture_output=True,
        text=True,
        cwd=repo,
        env=base,
        check=False,
        timeout=120,
    )


def set_audit(
    home: Path, findings: list[dict] | None = None, exit_code: int | None = None
) -> None:
    findings = findings or []
    result = {
        "schema": 1,
        "run_at": "2026-11-11T08:00:00Z",
        "source": "terminal",
        "clean": not findings,
        "findings": findings,
    }
    code = (1 if findings else 0) if exit_code is None else exit_code
    (home / "audit.json").write_text(
        json.dumps({"result": result, "exit": code}), encoding="utf-8"
    )


def write_env(home: Path, root: str, text: str, mode: int = 0o600) -> Path:
    """~/.config/h4reet-ai/infra/<root>.env, the root's TF_VAR_ lines (contracts/infra-records.md §1)."""
    path = infra_home(home) / f"{root}.env"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    path.chmod(mode)
    return path


def seed_mirror(home: Path) -> Path:
    mirror = home / ".local" / "share" / "h4reet" / "terraform-providers"
    mirror.mkdir(parents=True, exist_ok=True)
    return mirror
