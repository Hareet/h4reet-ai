"""What runs on EC2 keeps to Amazon Linux 2023's python3, 3.9 (group 8's review B, I2): redteam/live.py, which the
Author runs there as root from the release's tree (the note's group 8, step 5), and what it loads, redteam/run.py
and scripts/operator.py. A 3.10 or later feature fails there before the run writes its record, and the release's
red-team gate can't pass (FR-039).

Two reads: the syntax, as Python 3.9's grammar takes it; and the names 3.9's standard library lacks, which the grammar
can't see: datetime's UTC (3.11), tomllib (3.11), and zip's strict (3.10). Annotations are left out of the second,
since `from __future__ import annotations` keeps them unevaluated.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
ON_EC2 = ("redteam/live.py", "redteam/run.py", "scripts/operator.py")


def runtime_nodes(tree: ast.AST) -> list[ast.AST]:
    """Every node outside an annotation."""
    skip: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for arg in [*node.args.args, *node.args.kwonlyargs, *node.args.posonlyargs]:
                if arg.annotation is not None:
                    skip.update(id(n) for n in ast.walk(arg.annotation))
            for arg in (node.args.vararg, node.args.kwarg):
                if arg is not None and arg.annotation is not None:
                    skip.update(id(n) for n in ast.walk(arg.annotation))
            if node.returns is not None:
                skip.update(id(n) for n in ast.walk(node.returns))
        if isinstance(node, ast.AnnAssign):
            skip.update(id(n) for n in ast.walk(node.annotation))
    return [n for n in ast.walk(tree) if id(n) not in skip]


def too_new(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    tree = ast.parse(text, feature_version=(3, 9))
    found = []
    for node in runtime_nodes(tree):
        line = getattr(node, "lineno", 0)
        if isinstance(node, ast.Attribute) and node.attr == "UTC":
            found.append(f"{line}: datetime's UTC is 3.11's; use timezone.utc")
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            names = [a.name for a in node.names] + [getattr(node, "module", None) or ""]
            if "tomllib" in names:
                found.append(f"{line}: tomllib is 3.11's")
            if (
                isinstance(node, ast.ImportFrom)
                and node.module == "datetime"
                and "UTC" in names
            ):
                found.append(f"{line}: datetime's UTC is 3.11's")
        if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "zip":
            if any(k.arg == "strict" for k in node.keywords):
                found.append(f"{line}: zip's strict is 3.10's")
        if isinstance(node, ast.Call) and getattr(node.func, "id", None) in (
            "isinstance",
            "issubclass",
        ):
            if len(node.args) == 2 and isinstance(node.args[1], ast.BinOp):
                found.append(f"{line}: a union in isinstance is 3.10's")
    return found


@pytest.mark.parametrize("rel", ON_EC2)
def test_what_runs_on_ec2_keeps_to_python_3_9(rel: str) -> None:
    assert too_new(REPO / rel) == [], rel


def test_the_check_finds_what_it_looks_for(tmp_path: Path) -> None:
    sample = tmp_path / "sample.py"
    sample.write_text(
        "from __future__ import annotations\n"
        "import datetime as dt\n"
        "def f(x: int | None) -> dt.UTC:\n"
        "    return dt.datetime.now(dt.UTC), isinstance(x, int | str), zip([1], [2], strict=True)\n",
        encoding="utf-8",
    )
    found = too_new(sample)
    assert len(found) == 3, found
