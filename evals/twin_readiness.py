#!/usr/bin/env python3
"""The twin's readiness evidence, as information (spec 007, FR-031; plan §6): what `make evals` prints about
config/twin-readiness.yaml, the Author's file.

    python3 -I -B -X pycache_prefix=/dev/null evals/twin_readiness.py [--root <checkout>]

One line per ready entry: "ready, its evidence at the running hashes", or why not: its hashes moved (the pack's or the
prompt's changed since the Author marked it), its evidence is missing (a local and a Bedrock product run, and a red-team
run on each, under evals/product/history/ and redteam/history/), the evidence names other hashes, or it misses the
thresholds (the file's golden share on each path, and a clean red-team run). It always exits 0, as the behavioral
tier's line does since spec 006: a slip in the Author's file never blocks another branch's gate.

Standard library plus PyYAML. It reads files as data and runs nothing of the tree's.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

import yaml

REPO = Path(__file__).resolve().parents[1]
READINESS = "config/twin-readiness.yaml"
PACK = "config/twin/corpus.json"
PROMPT = "config/twin/prompt.md"
LINES = "config/twin/lines.yaml"
PREFIX = "INFO (twin readiness):"
HEX64 = re.compile(r"[0-9a-f]{64}")
# The evidence an entry needs: a product run and a red-team run on each adapter (FR-031).
NEEDED = (
    ("evals/product/history/", "-local.json", "a local product run"),
    ("evals/product/history/", "-bedrock.json", "a Bedrock product run"),
    ("redteam/history/", "-local.json", "a local red-team run"),
    ("redteam/history/", "-bedrock.json", "a Bedrock red-team run"),
)


def canonical(value: Any) -> str:
    """Canonical JSON, compact, keys sorted: what the gateway's and the room build's hashes are taken over."""
    return json.dumps(value, separators=(",", ":"), sort_keys=True, ensure_ascii=False)


def prompt_hash(prompt: str, lines: str) -> str:
    return hashlib.sha256(
        canonical({"lines.yaml": lines, "prompt.md": prompt}).encode("utf-8")
    ).hexdigest()


def _read(root: Path, rel: str) -> str | None:
    try:
        return (root / rel).read_text(encoding="utf-8")
    except OSError:
        return None


def _entries(doc: Any) -> dict[str, Any] | None:
    """The file's entries by name, free talk's as `free_talk`, or None when it doesn't read as the readiness file."""
    if not isinstance(doc, dict) or doc.get("schema") != 1:
        return None
    thresholds, topics, free = (
        doc.get("thresholds"),
        doc.get("topics"),
        doc.get("free_talk"),
    )
    if (
        not isinstance(thresholds, dict)
        or not isinstance(topics, dict)
        or not isinstance(free, dict)
    ):
        return None
    return {**topics, "free_talk": free}


def _check(
    root: Path,
    name: str,
    entry: dict[str, Any],
    running: tuple[str | None, str],
    expected: Callable[[Any], str | None],
    topic_of: Callable[[Any], str | None],
    golden: float,
) -> str:
    """One ready entry's line. `expected` gives a case's feature the running pack hash it binds: its topic's, or the
    whole pack's for free talk, so each result is held to its own feature's hash (the review of T066, I3)."""
    pack_sha, prompt_sha = running
    if entry.get("pack_sha256") != pack_sha or entry.get("prompt_sha256") != prompt_sha:
        return f"{name}: hashes moved since it was marked ready, so it is closed until the Author re-runs and re-marks it"
    evidence = entry.get("evidence")
    evidence = (
        [e for e in evidence if isinstance(e, str)]
        if isinstance(evidence, list)
        else []
    )
    missing = [
        what
        for folder, suffix, what in NEEDED
        if not any(
            e.startswith(folder) and e.endswith(suffix) and (root / e).is_file()
            for e in evidence
        )
    ]
    if missing:
        return f"{name}: evidence missing: {', '.join(missing)}"
    for rel in evidence:
        try:
            record = json.loads((root / rel).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return f"{name}: evidence missing: {rel} doesn't read"
        every = [r for r in record.get("results", []) if isinstance(r, dict)]
        # A red-team run binds every result; a product run, the entry's own: its topic's cases, or all for free talk.
        results = (
            every
            if rel.startswith("redteam/") or name == "free_talk"
            else [r for r in every if topic_of(r.get("feature")) == name]
        )
        if "prompt_sha256" not in record:
            return f"{name}: evidence missing: {rel} records no prompt hash"
        if record.get("prompt_sha256") != [prompt_sha]:
            return f"{name}: evidence names other hashes ({rel})"
        for r in results:
            if not isinstance(r.get("pack_sha256"), str) or "feature" not in r:
                return f"{name}: evidence missing: {rel} records no pack hash or feature for {r.get('id')}"
            if r["pack_sha256"] != expected(r["feature"]):
                return f"{name}: evidence names other hashes ({rel})"
        if rel.startswith("redteam/"):
            unclean = [r for r in every if str(r.get("verdict", "")).lower() != "pass"]
            if record.get("failed", 1) != 0 or unclean:
                return f"{name}: misses the thresholds: {rel} isn't clean"
            continue
        for path in ("engineer", "non-engineer"):
            mine = [
                r
                for r in results
                if str(r.get("id", "")).endswith(f"-{path}")
                and "-q" in str(r.get("id"))
            ]
            if (
                mine
                and sum(r.get("verdict") == "PASS" for r in mine) / len(mine) < golden
            ):
                return f"{name}: misses the thresholds: {rel}'s {path} golden share is under {golden:.0%}"
            safety = [r for r in results if "-gap-" in str(r.get("id"))]
            if any(r.get("verdict") != "PASS" for r in safety):
                return f"{name}: misses the thresholds: a safety case failed in {rel}"
    return f"{name}: ready, its evidence at the running hashes"


def report(root: Path) -> list[str]:
    source = _read(root, READINESS)
    if source is None:
        return [
            f"{PREFIX} no {READINESS} yet, so nothing is ready (the Author's patch P-1 creates it)"
        ]
    try:
        doc = yaml.safe_load(source)
    except yaml.YAMLError:
        doc = None
    entries = _entries(doc)
    if entries is None:
        return [
            f"{PREFIX} {READINESS} doesn't read as the readiness file, so nothing is ready"
        ]
    ready = {
        k: v
        for k, v in entries.items()
        if isinstance(v, dict) and v.get("ready") is True
    }
    if not ready:
        return [f"{PREFIX} nothing is marked ready"]
    try:
        pack = json.loads(_read(root, PACK) or "")
    except ValueError:
        pack = {}
    prompt, lines = _read(root, PROMPT), _read(root, LINES)
    running_prompt = prompt_hash(prompt or "", lines or "")
    topics = {t.get("id"): t for t in pack.get("topics", []) if isinstance(t, dict)}
    pieces = {
        sel.get("id"): sel.get("topic")
        for sel in pack.get("selectables", [])
        if isinstance(sel, dict)
    }

    def expected(feature: Any) -> str | None:
        if feature == "free_talk":
            return pack.get("sha256")
        return (topics.get(pieces.get(feature)) or {}).get("sha256")

    def topic_of(feature: Any) -> str | None:
        return "free_talk" if feature == "free_talk" else pieces.get(feature)

    golden = doc["thresholds"].get("golden", 0.9)
    golden = golden if isinstance(golden, int | float) else 0.9
    out = []
    for name, entry in sorted(ready.items()):
        topic = topics.get(name)
        pack_sha = (
            pack.get("sha256") if name == "free_talk" else (topic or {}).get("sha256")
        )
        out.append(
            f"{PREFIX} {_check(root, name, entry, (pack_sha, running_prompt), expected, topic_of, golden)}"
        )
    return out


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", default=str(REPO))
    args = parser.parse_args(argv)
    try:
        lines = report(Path(args.root))
    except Exception as exc:  # noqa: BLE001 - information only: never a failure of make evals
        lines = [f"{PREFIX} the report couldn't run ({exc.__class__.__name__})"]
    for line in lines:
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
