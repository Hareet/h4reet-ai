#!/usr/bin/env python3
"""Deterministic gate for the public corpus. Run by `make corpus-check`, `make test`, and CI.

Rules
1. facts/*.yaml: every fact has an id, a label, and a phrasing containing {value}; ids are unique.
   A fact with a value must also have tag A or C, a source, and public_safe: true.
2. Every {{slot:<id>}} in a corpus Markdown file names a fact that exists.
3. No currency amounts in corpus Markdown. Amounts are not public-safe by policy; one that ever
   becomes public-safe goes through an attested facts slot.
4. If intake/private/denylist.txt exists (gitignored, local only), none of its phrases may appear
   in any public corpus file. Phrases are never printed.
Exit 0 when clean, 1 with one line per problem.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # corpus/
PRIVATE = ROOT / "intake" / "private"
SLOT = re.compile(r"\{\{slot:([a-z0-9_.-]+)(?:\s*\|[^}]*)?\}\}")
CURRENCY = re.compile(r"[$€£]\s?\d|\b\d[\d,.]*\s?[kKmM]?\s?(?:USD|dollars|EUR|GBP)\b")
TEXT = {".md", ".yaml", ".yml", ".txt"}


def public(pattern: str):
    for p in sorted(ROOT.rglob(pattern)):
        if p.is_file() and PRIVATE not in p.parents:
            yield p


def main() -> int:
    try:
        import yaml
    except ImportError:
        print("corpus-check: PyYAML is required (pip install pyyaml)")
        return 1

    errors: list[str] = []
    facts: dict[str, dict] = {}
    for f in public("facts/*.yaml"):
        for i, fact in enumerate((yaml.safe_load(f.read_text()) or {}).get("facts") or []):
            where = f"{f.relative_to(ROOT)}[{i}]"
            fid = fact.get("id")
            if not fid:
                errors.append(f"{where}: missing id")
                continue
            if fid in facts:
                errors.append(f"{where}: duplicate id {fid}")
            facts[fid] = fact
            if not fact.get("label"):
                errors.append(f"{where} {fid}: missing label")
            if "{value}" not in str(fact.get("phrasing", "")):
                errors.append(f"{where} {fid}: phrasing must contain {{value}}")
            if fact.get("value") is not None:
                if fact.get("tag") not in ("A", "C"):
                    errors.append(f"{where} {fid}: value set, so tag must be A or C")
                if not fact.get("source"):
                    errors.append(f"{where} {fid}: value set, so source is required")
                if fact.get("public_safe") is not True:
                    errors.append(f"{where} {fid}: value set, so public_safe must be true")

    for md in public("*.md"):
        rel = md.relative_to(ROOT)
        for n, line in enumerate(md.read_text().splitlines(), 1):
            for m in SLOT.finditer(line):
                if m.group(1) not in facts:
                    errors.append(f"{rel}:{n}: unknown slot {m.group(1)}")
            if CURRENCY.search(line):
                errors.append(f"{rel}:{n}: currency amount in a public corpus file")

    denylist = PRIVATE / "denylist.txt"
    if denylist.exists():
        phrases = [s.strip().lower() for s in denylist.read_text().splitlines()
                   if s.strip() and not s.lstrip().startswith("#")]
        for p in public("*"):
            if p.suffix in TEXT and any(ph in p.read_text().lower() for ph in phrases):
                errors.append(f"{p.relative_to(ROOT)}: contains a denylisted phrase")

    for e in errors:
        print(e)
    filled = sum(1 for f in facts.values() if f.get("value") is not None)
    print(f"corpus-check: {'FAIL' if errors else 'OK'} — {len(facts)} slots, {filled} filled, {len(errors)} problems")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
