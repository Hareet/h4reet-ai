#!/usr/bin/env python3
"""The red-team suite's live mode, its entry (spec 007, FR-051; plan §8; plan.md D16): the Author's, never the agent
sandbox's, since it calls a real model.

    python3 -I -B -X pycache_prefix=/dev/null redteam/live.py --live --stack prod --adapter local   # make redteam-live

On EC2 (group 7's fixes' review, I1; spec 001 FR-039), from the running release's tree, in the Author's Systems
Manager session, as SC-017's run is, with the prod operator token in a file of his, mode 0600:

    sudo python3 -I -B -X pycache_prefix=/dev/null <tree>/redteam/live.py --live --stack prod --adapter bedrock \
        --host ec2 --operator-token-file FILE [--state /var/lib/h4reet/deploy]

It reaches EC2's own admin listener on its loopback, and records the commit EC2 runs, from the deployer's
current.json, never a run file.

redteam/run.py judges each answer and writes the history, and imports no importlib (spec 004's review of T209: the
runner executes nothing of the corpus's). So this file loads run.py and the operator CLI's AdminClient from the tree,
as data, and hands run.py the client. It reads no corpus file, and no token but the one AdminClient reads for itself.
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import stat
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

REPO = Path(__file__).resolve().parents[1]


def load(name: str, path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise SystemExit(f"redteam: can't load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


COMMIT_RE = re.compile(r"[0-9a-f]{40}")
# EC2's deployer's state folder, whose current.json is the release EC2 runs (deploy/scripts/deployer.py).
EC2_STATE = Path("/var/lib/h4reet/deploy")


def running_commit(stack: str) -> str | None:
    """The commit a host stack runs, its run file's H4_REF, which make up writes; None for dev-cpu, which runs the
    working tree, or for a run file that names none. The release's red-team gate matches a run by it (spec 001)."""
    if stack not in ("prod", "dev"):
        return None
    path = Path.home() / ".local" / "state" / "h4reet" / stack / "run.env"
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    for line in lines:
        if line.startswith("H4_REF="):
            value = line.partition("=")[2].strip()
            return value if COMMIT_RE.fullmatch(value) else None
    return None


def ec2_commit(state: Path = EC2_STATE) -> str | None:
    """The commit EC2 runs: its deployer's current.json, the release it started; None when there is none."""
    try:
        value = json.loads((state / "current.json").read_text(encoding="utf-8")).get(
            "commit"
        )
    except (OSError, ValueError, AttributeError):
        return None
    return value if isinstance(value, str) and COMMIT_RE.fullmatch(value) else None


def _take(argv: list[str], flag: str) -> tuple[list[str], str | None]:
    """argv without `flag VALUE`, and the value."""
    if flag not in argv:
        return argv, None
    i = argv.index(flag)
    if i + 1 >= len(argv):
        return argv[:i], None
    return argv[:i] + argv[i + 2 :], argv[i + 1]


def token_file_problem(path: Path) -> str | None:
    """The operator CLI's rules for a token file (its check_token_file; group 8's review B, nit 2): the file itself,
    not a link; a regular file; the caller's; mode 0600 or 0400. None when it keeps them."""
    try:
        info = os.lstat(path)
    except OSError:
        return f"{path} can't be read"
    if stat.S_ISLNK(info.st_mode):
        return f"{path} is a symbolic link; the token must be the file itself"
    if not stat.S_ISREG(info.st_mode):
        return f"{path} isn't a regular file"
    if info.st_uid != os.getuid():
        return f"{path} belongs to another user"
    if stat.S_IMODE(info.st_mode) not in (0o600, 0o400):
        return (
            f"{path} is mode {stat.S_IMODE(info.st_mode):04o}; it must be 0600 or 0400"
        )
    return None


def main(
    argv: list[str],
    token_file: Path | None = None,
    state: Path = EC2_STATE,
    client_class: Any = None,
    run_main: Any = None,
) -> int:
    if os.environ.get("SANDBOX_RUNTIME") == "1":
        print(
            "redteam: live mode runs in the Author's terminal, since it calls a real model",
            file=sys.stderr,
        )
        return 2
    argv, named = _take(list(argv), "--operator-token-file")
    argv, folder = _take(argv, "--state")
    token_file = Path(named) if named else token_file
    state = Path(folder) if folder else state
    if run_main is None:
        run_main = load("redteam_run", REPO / "redteam" / "run.py").main
    if client_class is None:
        client_class = load("h4_operator", REPO / "scripts" / "operator.py").AdminClient
    if (
        "--host" in argv
        and "ec2" in argv[argv.index("--host") + 1 : argv.index("--host") + 2]
    ):
        if token_file is None:
            print(
                "redteam: on EC2, name the prod operator token's file: --operator-token-file FILE",
                file=sys.stderr,
            )
            return 2

        problem = token_file_problem(token_file)
        if problem is not None:
            print(f"redteam: {problem}", file=sys.stderr)
            return 2

        def ec2_client(stack: str) -> Any:
            fd = os.open(token_file, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
            with os.fdopen(fd, encoding="utf-8") as stdin:
                return client_class(stack=stack, token_stdin=True, stdin=stdin)

        return run_main(
            argv=argv,
            client_factory=ec2_client,
            commit_of=lambda stack: ec2_commit(state),
        )

    def client(stack: str) -> Any:
        return client_class(stack=stack)

    return run_main(argv=argv, client_factory=client, commit_of=running_commit)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
