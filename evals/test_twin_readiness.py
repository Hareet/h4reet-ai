"""Tests for evals/twin_readiness.py (spec 007, FR-031; plan §6): the readiness file's evidence, as information.

`make evals` runs it beside the behavioral tier's line. It prints one line per ready entry whose hashes moved, whose
evidence is missing, names other hashes, or misses the thresholds, and fails nothing, so a slip in the Author's file
never blocks another branch's gate. Hashes are computed at run time, never written here.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "evals_twin_readiness", REPO / "evals" / "twin_readiness.py"
)
assert SPEC and SPEC.loader
report = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = report
SPEC.loader.exec_module(report)


def h(word: str) -> str:
    return hashlib.sha256(word.encode()).hexdigest()


@pytest.fixture
def tree(tmp_path: Path) -> Path:
    """A repository of the twin's files: a pack with one topic, the prompt, and the fixed lines."""
    (tmp_path / "config" / "twin").mkdir(parents=True)
    pack = {
        "sha256": h("whole"),
        "topics": [
            {
                "id": "hobbies-and-travel",
                "files": ["corpus/04-hobbies-and-travel.md"],
                "sha256": h("topic"),
            }
        ],
    }
    (tmp_path / "config" / "twin" / "corpus.json").write_text(
        json.dumps(pack), encoding="utf-8"
    )
    (tmp_path / "config" / "twin" / "prompt.md").write_text("# p\n", encoding="utf-8")
    (tmp_path / "config" / "twin" / "lines.yaml").write_text(
        "schema: 1\n", encoding="utf-8"
    )
    return tmp_path


def prompt_sha(tree: Path) -> str:
    return report.prompt_hash(
        (tree / "config/twin/prompt.md").read_text(encoding="utf-8"),
        (tree / "config/twin/lines.yaml").read_text(encoding="utf-8"),
    )


def history(
    tree: Path,
    folder: str,
    name: str,
    *,
    pack: str,
    prompt: str,
    passed: int = 2,
    total: int = 2,
) -> str:
    """A live run's history entry: two golden cases on each path of 04, and how many passed."""
    results = []
    for path in ("engineer", "non-engineer"):
        for i in range(total):
            results.append(
                {
                    "id": f"twin-04-hobbies-and-travel-q{i + 1}-{path}",
                    "verdict": "PASS" if i < passed else "FAIL",
                    "pack_sha256": pack,
                    "guard": None,
                }
            )
    record = {
        "results": results,
        "failed": sum(r["verdict"] == "FAIL" for r in results),
        "prompt_sha256": [prompt],
    }
    path = tree / folder / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(record), encoding="utf-8")
    return f"{folder}/{name}"


def readiness(tree: Path, entry: str, free_talk: str = "{ ready: false }") -> None:
    (tree / "config" / "twin-readiness.yaml").write_text(
        "schema: 1\nthresholds: { safety: 1.0, golden: 0.90 }\n"
        f"topics:\n  hobbies-and-travel: {entry}\nfree_talk: {free_talk}\n",
        encoding="utf-8",
    )


def evidence(tree: Path, *, pack: str, prompt: str, passed: int = 2) -> list[str]:
    return [
        history(
            tree,
            "evals/product/history",
            "2026-11-08T000000Z-local.json",
            pack=pack,
            prompt=prompt,
            passed=passed,
        ),
        history(
            tree,
            "evals/product/history",
            "2026-11-08T010000Z-bedrock.json",
            pack=pack,
            prompt=prompt,
        ),
        history(
            tree,
            "redteam/history",
            "2026-11-08T020000Z-local.json",
            pack=pack,
            prompt=prompt,
        ),
        history(
            tree,
            "redteam/history",
            "2026-11-08T030000Z-bedrock.json",
            pack=pack,
            prompt=prompt,
        ),
    ]


def ready_entry(pack: str, prompt: str, files: list[str]) -> str:
    return (
        f'{{ ready: true, pack_sha256: "{pack}", prompt_sha256: "{prompt}", '
        f"evidence: [{', '.join(files)}] }}"
    )


def test_a_missing_file_is_information_and_fails_nothing(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert report.main(["--root", str(tree)]) == 0
    assert (
        "INFO (twin readiness): no config/twin-readiness.yaml"
        in capsys.readouterr().out
    )


def test_nothing_ready_says_so(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
    readiness(tree, "{ ready: false }")
    assert report.main(["--root", str(tree)]) == 0
    assert "nothing is marked ready" in capsys.readouterr().out


def test_a_ready_entry_with_its_evidence_at_the_running_hashes_reads_ready(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    files = evidence(tree, pack=h("topic"), prompt=prompt_sha(tree))
    readiness(tree, ready_entry(h("topic"), prompt_sha(tree), files))
    assert report.main(["--root", str(tree)]) == 0
    out = capsys.readouterr().out
    assert "hobbies-and-travel: ready, its evidence at the running hashes" in out


def test_moved_hashes_missing_evidence_other_hashes_and_missed_thresholds_each_get_a_line(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    files = evidence(tree, pack=h("topic"), prompt=prompt_sha(tree))
    readiness(tree, ready_entry(h("moved"), prompt_sha(tree), files))
    assert report.main(["--root", str(tree)]) == 0
    assert "hobbies-and-travel: hashes moved" in capsys.readouterr().out

    readiness(tree, ready_entry(h("topic"), prompt_sha(tree), files[:2]))
    assert report.main(["--root", str(tree)]) == 0
    assert "evidence missing" in capsys.readouterr().out

    other = evidence(tree, pack=h("another pack"), prompt=prompt_sha(tree))
    readiness(tree, ready_entry(h("topic"), prompt_sha(tree), other))
    assert report.main(["--root", str(tree)]) == 0
    assert "names other hashes" in capsys.readouterr().out

    weak = evidence(tree, pack=h("topic"), prompt=prompt_sha(tree), passed=1)
    readiness(tree, ready_entry(h("topic"), prompt_sha(tree), weak))
    assert report.main(["--root", str(tree)]) == 0
    assert "misses the thresholds" in capsys.readouterr().out


def test_an_invalid_file_is_information_too(
    tree: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tree / "config" / "twin-readiness.yaml").write_text(
        "schema: 2\n", encoding="utf-8"
    )
    assert report.main(["--root", str(tree)]) == 0
    assert "doesn't read as the readiness file" in capsys.readouterr().out


def test_the_prompt_hash_matches_the_gateways_canonical_json() -> None:
    """The shared matrix's prefix pins this hash to the gateway's and the room build's."""
    matrix = json.loads(
        (REPO / "services/gateway/test/fixtures/twin-readiness-matrix.json").read_text(
            encoding="utf-8"
        )
    )
    texts = matrix["texts"]
    got = report.prompt_hash(texts["prompt.md"], texts["lines.yaml"])
    assert got[:12] == matrix["prompt_sha_prefix"]


def test_the_repository_reports_without_failing(
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert report.main(["--root", str(REPO)]) == 0
    assert "INFO (twin readiness)" in capsys.readouterr().out
