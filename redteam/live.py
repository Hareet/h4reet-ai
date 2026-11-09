#!/usr/bin/env python3
"""The red-team suite's live mode, its entry (spec 007, FR-051; plan §8; plan.md D16): the Author's, never the agent
sandbox's, since it calls a real model.

    python3 -I -B -X pycache_prefix=/dev/null redteam/live.py --live --stack prod --adapter local   # make redteam-live

redteam/run.py judges each answer and writes the history, and imports no importlib (spec 004's review of T209: the
runner executes nothing of the corpus's). So this file loads run.py and the operator CLI's AdminClient from the tree,
as data, and hands run.py the client. It reads no corpus file, and no token but the one AdminClient reads for itself.
"""

from __future__ import annotations

import importlib.util
import os
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


def main(argv: list[str]) -> int:
    if os.environ.get("SANDBOX_RUNTIME") == "1":
        print(
            "redteam: live mode runs in the Author's terminal, since it calls a real model",
            file=sys.stderr,
        )
        return 2
    run = load("redteam_run", REPO / "redteam" / "run.py")

    def client(stack: str) -> Any:
        return load("h4_operator", REPO / "scripts" / "operator.py").AdminClient(
            stack=stack
        )

    return run.main(argv=argv, client_factory=client)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
