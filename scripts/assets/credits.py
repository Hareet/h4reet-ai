#!/usr/bin/env python3
"""The credits, rendered from the records (spec 003 FR-010, FR-033's repository half; contracts/asset-record.md §1, §4).

    python3 -I -B -X pycache_prefix=/dev/null scripts/assets/credits.py [--root DIR]           (make assets-credits)
    python3 -I -B -X pycache_prefix=/dev/null scripts/assets/credits.py [--root DIR] --check   (make arrival)

It renders assets/CREDITS.md from every records.json under assets/ (but assets/policy/), and
docs/research/images/CREDITS.md from those under docs/research/images/, when that folder exists: one section per
directory, and in it one per file, with its kind, whether it's a likeness and whose (the Author's, or for
assets/visitors/dog the Author's dog: spec 020, FR-014), its source's type (never its ID, whose meaning stays in the studio,
but for an original design, shown with its opaque ID: spec 004, Amendment C2), each step by a model or by hand, each
model with its repository, revision, and license, each step's tools, model steps' included, any hosted service (a
step the studio's agent session scripted shows the tools it drove and the session, with its disclosure row: spec 004,
Amendment C8), and the media license. Rendering also writes each records.json back in its canonical form: entries sorted by
file, keys in data-model.md's order, two-space indentation, and a trailing newline.

--check writes nothing. It exits 1, naming each file, when a rendering differs from the records or a records.json
isn't in its canonical form. A records.json that isn't JSON is exit 2, in both modes. Standard library only. The
arrival check validates what the records say; this only shows it.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

TREES = (
    ("assets", "Credits: assets"),
    ("docs/research/images", "Credits: published images"),
)
POLICY = "assets/policy"
TOP_ORDER = ("schema", "directory", "license", "entries")
ENTRY_ORDER = (
    "file",
    "sha256",
    "kind",
    "made",
    "source",
    "likeness",
    "steps",
    "media_license",
    "approval",
    "arm",
    "note",
)
SOURCE_ORDER = ("type", "id")
STEP_ORDER = (
    "name",
    "by",
    "models",
    "tools",
    "service",
    "models_checked",
    "workflow_sha256",
)
MODEL_ORDER = (
    "name",
    "repository",
    "revision",
    "role",
    "license",
    "license_version",
    "commercial_license",
)
TOOL_ORDER = ("name", "version", "license", "license_version")
SERVICE_ORDER = ("name", "license", "license_version", "disclosure_row")
SOURCES = {"photo": "a photo", "prompt": "a prompt", "asset": "another asset"}
# Whose likeness an entry's `likeness` speaks of, by its record's directory (spec 020 FR-014, Q6; plan.md R-08): the
# dog's folder holds a likeness of the Author's dog; every other directory's, as before, of the Author.
LIKENESS_OF = {"assets/visitors/dog": "the Author's dog"}
AUTHOR = "the Author"
INTRO = (
    "Rendered from each directory's `records.json` by `scripts/assets/credits.py`: run `make assets-credits` after "
    "changing a record, and don't edit this file by hand. Every file here is under the media license, all rights "
    "reserved, with viewing and linking welcome; each directory's `LICENSE.md` says so. A source is shown by its type "
    "only, its ID staying in the studio, except an original design, which is shown with its opaque ID."
)


class RecordsError(Exception):
    """A records.json that isn't JSON: exit 2."""


def ordered(item: dict, order: tuple[str, ...]) -> dict:
    """The item's keys in `order`, then any others sorted (the arrival check refuses those)."""
    return {
        **{k: item[k] for k in order if k in item},
        **{k: item[k] for k in sorted(item) if k not in order},
    }


def canonical(doc: object) -> str:
    if not isinstance(doc, dict):
        return json.dumps(doc, indent=2, ensure_ascii=False) + "\n"
    out = ordered(doc, TOP_ORDER)
    entries = out.get("entries")
    if isinstance(entries, list):
        fixed = []
        for entry in entries:
            if not isinstance(entry, dict):
                fixed.append(entry)
                continue
            entry = ordered(entry, ENTRY_ORDER)
            if isinstance(entry.get("source"), dict):
                entry["source"] = ordered(entry["source"], SOURCE_ORDER)
            if isinstance(entry.get("steps"), list):
                entry["steps"] = [step_order(s) for s in entry["steps"]]
            fixed.append(entry)
        out["entries"] = sorted(
            fixed, key=lambda e: str(e.get("file", "")) if isinstance(e, dict) else ""
        )
    return json.dumps(out, indent=2, ensure_ascii=False) + "\n"


def step_order(step: object) -> object:
    if not isinstance(step, dict):
        return step
    step = ordered(step, STEP_ORDER)
    for key, order in (("models", MODEL_ORDER), ("tools", TOOL_ORDER)):
        if isinstance(step.get(key), list):
            step[key] = [
                ordered(x, order) if isinstance(x, dict) else x for x in step[key]
            ]
    if isinstance(step.get("service"), dict):
        step["service"] = ordered(step["service"], SERVICE_ORDER)
    return step


def code(value: object) -> str:
    """A record's text as a Markdown code span, which Markdown and Prettier leave as it is."""
    text = str(value).replace("\n", " ")
    return f"`` {text} ``" if "`" in text else f"`{text}`"


def steps_lines(steps: list) -> list[str]:
    lines = []
    for n, step in enumerate(steps, 1):
        if not isinstance(step, dict):
            continue
        name = code(step.get("name", ""))
        tools = [
            f"{code(t.get('name'))} {code(t.get('version'))}, under {code(t.get('license'))} {code(t.get('license_version'))}"
            for t in step.get("tools") or []
            if isinstance(t, dict)
        ]
        if step.get("by") == "model":
            parts = []
            for model in step.get("models") or []:
                parts.append(
                    f"{code(model.get('name'))} ({code(model.get('repository'))}, revision {code(model.get('revision'))}), "
                    f"{model.get('role')}, under {code(model.get('license'))} {code(model.get('license_version'))}"
                    + (
                        f", with the studio's commercial license {code(model['commercial_license'])}"
                        if model.get("commercial_license")
                        else ""
                    )
                )
            line = f"- Step {n}, {name}, by a model: {'; '.join(parts)}"
            # A model step's tools too (spec 004, Amendment C8): a step the studio's agent session scripted shows the
            # tools it drove, then the session as its service.
            if tools:
                line += f"; with {'; '.join(tools)}"
        else:
            line = f"- Step {n}, {name}, by hand" + (
                f": {'; '.join(tools)}" if tools else ""
            )
        service = step.get("service")
        if isinstance(service, dict):
            line += (
                f"; a hosted service, {code(service.get('name'))}, under {code(service.get('license'))} "
                f"{code(service.get('license_version'))} (disclosure row {service.get('disclosure_row')})"
            )
        lines.append(line)
    return lines


def source_text(source: dict) -> str:
    """A source by its type alone, its ID staying in the studio; an original design with its opaque ID (spec 004,
    Amendment C2)."""
    if source.get("type") == "design":
        return f"an original design, {code(source.get('id'))}"
    return SOURCES.get(source.get("type"), "not recorded")


def entry_lines(entry: dict, subject: str = AUTHOR) -> list[str]:
    source = entry.get("source") if isinstance(entry.get("source"), dict) else {}
    lines = [
        f"### {code(entry.get('file'))}",
        "",
        f"- Kind: {entry.get('kind')}",
        f"- Source: {source_text(source)}",
        f"- Made: {entry.get('made')}",
        f"- A likeness of {subject}: {'yes' if entry.get('likeness') is True else 'no'}",
    ]
    if "arm" in entry:
        lines.append(f"- Arm: {entry['arm']}")
    if "note" in entry:
        lines.append(f"- Shown in: {code(entry['note'])}")
    lines += steps_lines(entry.get("steps") or [])
    lines.append(f"- Media license: {code(entry.get('media_license'))}")
    return lines


def render(root: Path, top: str, title: str, docs: dict[str, dict]) -> str:
    lines = [f"# {title}", "", INTRO]
    for directory in sorted(docs):
        lines += ["", f"## {code(directory)}", ""]
        entries = [
            e for e in docs[directory].get("entries") or [] if isinstance(e, dict)
        ]
        if not entries:
            lines.append("No files yet.")
            continue
        for i, entry in enumerate(
            sorted(entries, key=lambda e: str(e.get("file", "")))
        ):
            if i:
                lines.append("")
            lines += entry_lines(entry, LIKENESS_OF.get(directory, AUTHOR))
    return "\n".join(lines) + "\n"


def records_in(root: Path, top: str) -> dict[str, tuple[Path, str, dict]]:
    """Each records.json under `top`: its directory, its path, its text, and its parsed document."""
    found = {}
    for path in sorted((root / top).rglob("records.json")):
        directory = path.parent.relative_to(root).as_posix()
        if directory == POLICY or directory.startswith(POLICY + "/"):
            continue
        text = path.read_text(encoding="utf-8")
        try:
            doc = json.loads(text)
        except ValueError:
            raise RecordsError(f"{directory}/records.json isn't JSON") from None
        found[directory] = (path, text, doc)
    return found


def run(root: Path, check: bool) -> int:
    problems = []
    for top, title in TREES:
        if not (root / top).is_dir():
            continue
        found = records_in(root, top)
        for directory, (path, text, doc) in found.items():
            fixed = canonical(doc)
            if text != fixed:
                if check:
                    problems.append(
                        f"{directory}/records.json isn't in its canonical form (make assets-credits writes it)"
                    )
                else:
                    path.write_text(fixed, encoding="utf-8")
                    print(
                        f"credits: wrote {directory}/records.json in its canonical form"
                    )
        rendered = render(
            root,
            top,
            title,
            {
                d: doc if isinstance(doc, dict) else {}
                for d, (_, _, doc) in found.items()
            },
        )
        credits = root / top / "CREDITS.md"
        current = credits.read_text(encoding="utf-8") if credits.is_file() else None
        if current != rendered:
            if check:
                problems.append(
                    f"{top}/CREDITS.md differs from its records (make assets-credits renders it)"
                )
            else:
                credits.write_text(rendered, encoding="utf-8")
                print(f"credits: rendered {top}/CREDITS.md")
    for problem in problems:
        print(f"credits: {problem}")
    if check:
        print(
            f"credits: {'FAIL' if problems else 'OK'}: the renderings and the records' form"
        )
    return 1 if problems else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Render the credits from the records (spec 003)."
    )
    parser.add_argument(
        "--root",
        default=str(Path(__file__).resolve().parents[2]),
        help="the repository's root",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="write nothing; exit 1 when a rendering or a record is out of date",
    )
    args = parser.parse_args(argv)
    try:
        return run(Path(args.root), args.check)
    except RecordsError as exc:
        print(f"credits: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
