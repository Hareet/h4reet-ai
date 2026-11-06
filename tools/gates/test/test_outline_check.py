"""Tests for tools/gates/outline_check.py (spec 004 FR-024, FR-025, FR-032, FR-052, SC-013; contracts/intake-amendments.md
§10; tasks.md T038).

Every SVG and outline file here is written at run time into a temporary folder, which stands for the photos folder;
the check runs there as the Author runs it, by path, with the working folder inside it. Each fixture's own values
(its words, IDs, tool fields, and the SVG's other content) are marked, so a test can show that no output line holds
one.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "outline_check.py"

WORDS = "I am very busy"
SVG_NS = "http://www.w3.org/2000/svg"
PATH_A = "M 10 10 L 90 10 L 90 60 Z"
PATH_B = "m100,10 c5,0 10,5 10,10 s-5,10 -10,10 z"
# A value no output line may hold: each fixture's fields carry it.
MARK = "h4fixturevalue"


def run(cwd: Path, *args: str) -> subprocess.CompletedProcess[str]:
    """The check as the Author runs it: by path, in the working folder; its first line and guard give it PY_HOST."""
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        check=False,
        timeout=60,
        env={"PATH": "/usr/bin:/bin", "LC_ALL": "C.UTF-8"},
    )


def svg(body: str, *, view_box: str = "0 0 400 120", extra: str = "") -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="{SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="{view_box}"{extra}>\n'
        f"{body}\n</svg>\n"
    )


TRACE = svg(
    f'  <metadata id="{MARK}-meta">{MARK} traced over a photo</metadata>\n'
    f'  <g id="{MARK}-layer">\n'
    f'    <path id="{MARK}-a" style="fill:#000" d="{PATH_A}"/>\n'
    f'    <path d="{PATH_B}"/>\n'
    "  </g>"
)
FIELDS = [
    "--sign",
    "busy-sign",
    "--words",
    WORDS,
    "--source-type",
    "photo",
    "--source-id",
    "PH-0042",
    "--tool-name",
    "Inkscape",
    "--tool-version",
    "1.4",
    "--tool-license",
    "GPL-2.0-or-later",
    "--cap-height",
    "80",
]


def from_svg(
    folder: Path, text: str = TRACE, *extra: str
) -> subprocess.CompletedProcess[str]:
    (folder / "trace.svg").write_text(text, encoding="utf-8")
    return run(folder, "--from-svg", "trace.svg", *FIELDS, *extra)


def outline(**over: object) -> dict:
    doc: dict = {
        "schema": 1,
        "sign": "busy-sign",
        "words": WORDS,
        "intent_ref": "intent-004",
        "source": {"type": "design", "id": "D-0001"},
        "tool": {"name": "Inkscape", "version": "1.4", "license": "GPL-2.0-or-later"},
        "view_box": [0, 0, 400, 120],
        "cap_height": 80,
        "advance": 380,
        "paths": [PATH_A, PATH_B],
    }
    doc.update(over)
    return {k: v for k, v in doc.items() if v is not None}


def write(folder: Path, doc: object, name: str = "busy-sign.outline.json") -> Path:
    target = folder / name
    text = doc if isinstance(doc, str) else json.dumps(doc, indent=2) + "\n"
    target.write_bytes(text.encode("utf-8") if isinstance(text, str) else text)
    return target


def check_file(folder: Path, doc: object, name: str = "busy-sign.outline.json"):
    write(folder, doc, name)
    return run(folder, name)


def rules(done: subprocess.CompletedProcess[str]) -> set[str]:
    return {
        line.split(" ", 1)[0]
        for line in done.stdout.splitlines()
        if line[:1] == "O" and line[1:2].isdigit()
    }


# --------------------------------------------------------------------------------------------------
# --from-svg: the conversion
# --------------------------------------------------------------------------------------------------
def test_a_clean_photo_traced_file_passes(tmp_path: Path) -> None:
    done = from_svg(tmp_path)
    assert done.returncode == 0, done.stdout + done.stderr
    written = tmp_path / "busy-sign.outline.json"
    data = written.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    assert done.stdout.splitlines()[-1] == (
        f"outline-check: PASS: busy-sign.outline.json, 2 paths, sha256 {digest}"
    )
    doc = json.loads(data)
    assert list(doc) == [
        "schema",
        "sign",
        "words",
        "intent_ref",
        "source",
        "tool",
        "view_box",
        "cap_height",
        "paths",
    ]
    assert doc == {
        "schema": 1,
        "sign": "busy-sign",
        "words": WORDS,
        "intent_ref": "intent-004",
        "source": {"type": "photo", "id": "PH-0042"},
        "tool": {"name": "Inkscape", "version": "1.4", "license": "GPL-2.0-or-later"},
        "view_box": [0, 0, 400, 120],
        "cap_height": 80,
        "paths": [PATH_A, PATH_B],
    }
    # UTF-8 JSON, LF line ends, two-space indents, a final newline.
    assert b"\r" not in data and data.endswith(b"}\n") and not data.endswith(b"\n\n")
    assert data.startswith(b'{\n  "schema": 1,\n  "sign": "busy-sign",\n')


def test_the_same_inputs_give_the_same_bytes(tmp_path: Path) -> None:
    one, two = tmp_path / "one", tmp_path / "two"
    one.mkdir()
    two.mkdir()
    assert from_svg(one).returncode == 0
    assert from_svg(two).returncode == 0
    first = (one / "busy-sign.outline.json").read_bytes()
    assert first == (two / "busy-sign.outline.json").read_bytes()
    # And again in place, over the first.
    assert from_svg(one).returncode == 0
    assert (one / "busy-sign.outline.json").read_bytes() == first


def test_advance_and_the_intent_are_taken_when_given(tmp_path: Path) -> None:
    done = from_svg(tmp_path, TRACE, "--advance", "372.5", "--intent-ref", "intent-005")
    assert done.returncode == 0, done.stdout + done.stderr
    doc = json.loads((tmp_path / "busy-sign.outline.json").read_text(encoding="utf-8"))
    assert doc["advance"] == 372.5 and doc["intent_ref"] == "intent-005"
    assert list(doc)[-3:] == ["cap_height", "advance", "paths"]


def test_it_reports_what_it_left_behind_an_embedded_image_among_it(
    tmp_path: Path,
) -> None:
    image = (
        f'  <image xlink:href="data:image/png;base64,{"QUJD" * 40}" width="400" height="120"/>\n'
        f'  <image href="{MARK}.jpg" width="400" height="120"/>\n'
        f'  <text x="0" y="10">{MARK}</text>\n'
        f'  <path d="{PATH_A}"/>'
    )
    done = from_svg(tmp_path, svg(image))
    assert done.returncode == 0, done.stdout + done.stderr
    doc = json.loads((tmp_path / "busy-sign.outline.json").read_text(encoding="utf-8"))
    assert doc["paths"] == [PATH_A]
    assert (
        "outline-check: from the SVG: copied 1 path and its viewBox; left behind 3 other elements, 2 of them images"
        in done.stdout
    )
    assert "base64" not in done.stdout and MARK not in done.stdout


@pytest.mark.parametrize(
    "body",
    [
        f'<path transform="translate(5 0)" d="{PATH_A}"/>',
        f'<g transform="scale(2)"><g><path d="{PATH_A}"/></g></g>',
    ],
    ids=["on-the-path", "on-a-group-above"],
)
def test_a_path_under_a_transform_is_refused(tmp_path: Path, body: str) -> None:
    done = from_svg(tmp_path, svg(body))
    assert done.returncode == 2, done.stdout + done.stderr
    assert "transform" in done.stdout
    assert not (tmp_path / "busy-sign.outline.json").exists()


@pytest.mark.parametrize(
    "sign", ["nested/busy-sign", "../busy-sign", "busy\\sign", "Busy Sign"]
)
def test_an_output_name_with_a_folder_or_outside_the_grammar_is_refused(
    tmp_path: Path, sign: str
) -> None:
    (tmp_path / "trace.svg").write_text(TRACE, encoding="utf-8")
    (tmp_path / "nested").mkdir()
    args = list(FIELDS)
    args[args.index("busy-sign")] = sign
    done = run(tmp_path, "--from-svg", "trace.svg", *args)
    assert done.returncode == 2, done.stdout + done.stderr
    assert sorted(p.name for p in tmp_path.rglob("*.json")) == []
    assert sign not in done.stdout + done.stderr


@pytest.mark.parametrize(
    "text",
    [
        "not xml at all",
        svg(f'<path d="{PATH_A}"/>', view_box=""),
        svg(f'<path d="{PATH_A}"/>', view_box="0 0 400"),
        (
            '<?xml version="1.0"?>\n<!DOCTYPE svg [<!ENTITY a "aaaa">]>\n'
            f'<svg xmlns="{SVG_NS}" viewBox="0 0 10 10"><path d="{PATH_A}"/></svg>\n'
        ),
        f'<html xmlns="{SVG_NS}"><path d="{PATH_A}"/></html>',
    ],
    ids=["not-xml", "no-viewbox", "short-viewbox", "doctype", "not-svg"],
)
def test_an_svg_it_cant_read_exits_2_and_writes_nothing(
    tmp_path: Path, text: str
) -> None:
    done = from_svg(tmp_path, text)
    assert done.returncode == 2, done.stdout + done.stderr
    assert not (tmp_path / "busy-sign.outline.json").exists()


def test_a_missing_svg_or_file_exits_2(tmp_path: Path) -> None:
    assert run(tmp_path, "--from-svg", "absent.svg", *FIELDS).returncode == 2
    assert run(tmp_path, "absent.outline.json").returncode == 2


def test_usage_errors_exit_2_without_echoing_a_value(tmp_path: Path) -> None:
    done = run(tmp_path, "--from-svg", "trace.svg", "--sign", f"{MARK}-x")
    assert done.returncode == 2
    assert MARK not in done.stdout + done.stderr
    done = run(tmp_path, f"--{MARK}", "x")
    assert done.returncode == 2 and MARK not in done.stdout + done.stderr


# --------------------------------------------------------------------------------------------------
# --from-svg: what the Author can't see in the tracing tool (T041's review, part 2, I-4; §10, As built, after the
# review). Each is refused, exit 2, with nothing written, and the report names counts, never the SVG's content.
# --------------------------------------------------------------------------------------------------
def refused(folder: Path, done: subprocess.CompletedProcess[str]) -> None:
    out = done.stdout + done.stderr
    assert done.returncode == 2, out
    assert sorted(p.name for p in folder.iterdir()) == ["trace.svg"], out
    assert MARK not in out and str(folder) not in out and "trace.svg" not in out
    (line,) = [x for x in done.stdout.splitlines() if x.startswith("outline-check:")]
    assert line.startswith("outline-check: can't check: "), out
    assert "Traceback" not in out


VISIBLE = f'<path d="{PATH_A}"/>'
UNSEEN = [
    f'<defs><path id="{MARK}" d="{PATH_B}"/></defs>',
    f'<clipPath id="{MARK}"><path d="{PATH_B}"/></clipPath>',
    f'<mask id="{MARK}"><path d="{PATH_B}"/></mask>',
    f'<symbol id="{MARK}"><path d="{PATH_B}"/></symbol>',
    f'<pattern id="{MARK}" width="4" height="4"><path d="{PATH_B}"/></pattern>',
    f'<marker id="{MARK}"><path d="{PATH_B}"/></marker>',
    f'<metadata><path id="{MARK}" d="{PATH_B}"/></metadata>',
    f'<switch><g id="{MARK}"/><path d="{PATH_B}"/></switch>',
    f'<foreignObject width="4" height="4"><path id="{MARK}" d="{PATH_B}"/></foreignObject>',
    f'<x:layer xmlns:x="urn:{MARK}"><path d="{PATH_B}"/></x:layer>',
    f'<g><x:layer xmlns:x="urn:{MARK}"><g><path d="{PATH_B}"/></g></x:layer></g>',
]


@pytest.mark.parametrize(
    "body",
    UNSEEN,
    ids=[
        "defs",
        "clipPath",
        "mask",
        "symbol",
        "pattern",
        "marker",
        "metadata",
        "switch",
        "foreignObject",
        "foreign",
        "under-a-foreign-ancestor",
    ],
)
def test_a_path_the_tool_doesnt_draw_is_refused(tmp_path: Path, body: str) -> None:
    done = from_svg(tmp_path, svg(f"{VISIBLE}\n{body}"))
    refused(tmp_path, done)
    assert "1 path under" in done.stdout


HIDDEN = [
    f'<g id="{MARK}" style="display:none"><path d="{PATH_B}"/></g>',
    f'<g id="{MARK}" style="fill:#000; DISPLAY : None !important"><path d="{PATH_B}"/></g>',
    f'<g id="{MARK}" style="display:/* a comment */none"><path d="{PATH_B}"/></g>',
    f'<path id="{MARK}" display="none" d="{PATH_B}"/>',
    f'<g id="{MARK}" visibility="hidden"><g><path d="{PATH_B}"/></g></g>',
    f'<path id="{MARK}" style="visibility:collapse" d="{PATH_B}"/>',
    f'<g id="{MARK}" opacity="0"><path d="{PATH_B}"/></g>',
    f'<path id="{MARK}" style="opacity:0.0" d="{PATH_B}"/>',
    f'<path id="{MARK}" style="opacity:0%" d="{PATH_B}"/>',
    f'<rect id="{MARK}" style="display:none" width="4" height="4"/>',
]


@pytest.mark.parametrize(
    "body",
    HIDDEN,
    ids=[
        "style-display",
        "style-display-cased",
        "style-display-comment",
        "attribute-display",
        "attribute-visibility-on-an-ancestor",
        "style-visibility",
        "attribute-opacity",
        "style-opacity",
        "style-opacity-percent",
        "a-hidden-element-with-no-path",
    ],
)
def test_a_hidden_element_or_one_under_it_is_refused(tmp_path: Path, body: str) -> None:
    done = from_svg(tmp_path, svg(f"{VISIBLE}\n{body}"))
    refused(tmp_path, done)
    assert "1 hidden element" in done.stdout


@pytest.mark.parametrize(
    "body",
    [
        f'<path id="{MARK}" d="{PATH_B}"/><use href="#{MARK}" x="40" y="0"/>',
        f'<use xlink:href="#{MARK}"/>',
        f'<svg x="40" y="0" viewBox="0 0 10 10"><path id="{MARK}" d="{PATH_B}"/></svg>',
    ],
    ids=["use", "use-xlink", "nested-svg"],
)
def test_a_use_or_a_nested_svg_is_refused(tmp_path: Path, body: str) -> None:
    done = from_svg(tmp_path, svg(f"{VISIBLE}\n{body}"))
    refused(tmp_path, done)
    assert "1 use or nested svg" in done.stdout


@pytest.mark.parametrize(
    "body",
    [
        f'<g id="{MARK}" style="transform:translate(5px, 0)"><path d="{PATH_B}"/></g>',
        f'<rect id="{MARK}" style="fill:#000;Transform: scale(2)" width="4" height="4"/>',
        f'<path id="{MARK}" style="fill:#000; TRANSFORM : rotate(5deg) !important" d="{PATH_B}"/>',
        f"<style>/* {MARK} */ path {{ transform: scale(2) }}</style>",
    ],
    ids=[
        "style-on-a-group",
        "style-on-another-element",
        "cased-and-important",
        "style-element",
    ],
)
def test_a_style_with_a_transform_is_refused(tmp_path: Path, body: str) -> None:
    done = from_svg(tmp_path, svg(f"{VISIBLE}\n{body}"))
    refused(tmp_path, done)
    assert "1 style with a transform" in done.stdout


@pytest.mark.parametrize(
    "body",
    [
        f"<style>/* {MARK} */ .a {{ display: none }}</style>",
        f"<style>/* {MARK} */ .a {{ visibility: hidden }}</style>",
        f"<style>/* {MARK} */ .a {{ opacity: 0 }}</style>",
        f"<style>/* {MARK} */ .a {{ clip-path: url(#c) }}</style>",
        f'<style>@import "{MARK}.css";</style>',
        f'<g id="{MARK}" style="fill:\\23 000"><path d="{PATH_B}"/></g>',
        f'<path id="{MARK}" clip-path="url(#c)" d="{PATH_B}"/>',
        f'<g id="{MARK}" mask="url(#m)"><path d="{PATH_B}"/></g>',
        f'<path id="{MARK}" style="clip-path:url(#c)" d="{PATH_B}"/>',
    ],
    ids=[
        "style-element-display",
        "style-element-visibility",
        "style-element-opacity",
        "style-element-clip",
        "style-element-import",
        "a-backslash-in-a-style",
        "clip-path-attribute",
        "mask-attribute",
        "clip-path-style",
    ],
)
def test_a_style_or_a_clip_that_can_hide_what_it_draws_is_refused(
    tmp_path: Path, body: str
) -> None:
    done = from_svg(tmp_path, svg(f"{VISIBLE}\n{body}"))
    refused(tmp_path, done)


def test_each_kind_is_counted_in_one_report(tmp_path: Path) -> None:
    body = "\n".join(
        [
            VISIBLE,
            f'<defs><path d="{PATH_B}"/><path d="{PATH_B}"/></defs>',
            f'<g style="display:none"><path d="{PATH_B}"/></g>',
            f'<use href="#{MARK}"/>',
            f'<g style="transform:scale(2)"><path d="{PATH_B}"/></g>',
            f'<g transform="scale(2)"><path d="{PATH_B}"/></g>',
        ]
    )
    done = from_svg(tmp_path, svg(body))
    refused(tmp_path, done)
    for part in (
        "2 paths under",
        "1 hidden element",
        "1 use or nested svg",
        "1 style with a transform",
        "2 paths under a transform",
    ):
        assert part in done.stdout, done.stdout


# Inkscape's own style block on a path made by Object to Path or Stroke to Path (T041's re-review, part 2): its
# text-transform:none is a text property, not a transform, and a fill with no stroke draws the path.
INKSCAPE_STYLE = (
    "font-style:normal;font-variant:normal;font-weight:normal;font-stretch:normal;font-size:40px;"
    "line-height:1.25;font-family:sans-serif;-inkscape-font-specification:sans-serif;text-align:start;"
    "writing-mode:lr-tb;text-anchor:start;text-transform:none;letter-spacing:0px;word-spacing:0px;"
    "fill:#000000;fill-opacity:1;stroke:none;stroke-width:0.26458332"
)


@pytest.mark.parametrize(
    "body",
    [
        f'<g style="{INKSCAPE_STYLE}"><path style="{INKSCAPE_STYLE}" d="{PATH_A}"/></g>',
        f'<path style="transform-origin:center;text-transform:uppercase" d="{PATH_A}"/>',
        f'<style>text {{ text-transform: none; font-family: sans-serif }}</style><path d="{PATH_A}"/>',
        f'<path style="fill:none;stroke:#000;stroke-width:2" d="{PATH_A}"/>',
        f'<g fill="none" stroke="#000"><path d="{PATH_A}"/></g>',
        f'<g style="fill:none"><path style="fill:#000" d="{PATH_A}"/></g>',
    ],
    ids=[
        "inkscape-text-transform",
        "transform-origin-and-text-transform",
        "style-element-text-transform",
        "a-stroke-and-no-fill",
        "an-inherited-stroke",
        "a-fill-over-an-inherited-none",
    ],
)
def test_a_drawn_path_with_a_text_property_or_a_stroke_converts(
    tmp_path: Path, body: str
) -> None:
    done = from_svg(tmp_path, svg(body))
    assert done.returncode == 0, done.stdout + done.stderr
    doc = json.loads((tmp_path / "busy-sign.outline.json").read_text(encoding="utf-8"))
    assert doc["paths"] == [PATH_A]


@pytest.mark.parametrize(
    "body",
    [
        f'<path id="{MARK}" style="fill:none;stroke:none" d="{PATH_B}"/>',
        f'<path id="{MARK}" fill="none" d="{PATH_B}"/>',
        f'<path id="{MARK}" style="fill:transparent" d="{PATH_B}"/>',
        f'<path id="{MARK}" style="fill-opacity:0" d="{PATH_B}"/>',
        f'<g id="{MARK}" style="fill:none"><g><path d="{PATH_B}"/></g></g>',
        f'<g id="{MARK}" fill="none" stroke="#000"><path stroke="none" d="{PATH_B}"/></g>',
        f'<path id="{MARK}" style="fill:none;stroke:#000;stroke-opacity:0" d="{PATH_B}"/>',
        f'<path id="{MARK}" style="fill:none;stroke:#000;stroke-width:0" d="{PATH_B}"/>',
        f"<style>/* {MARK} */ .a {{ fill: none }}</style>",
    ],
    ids=[
        "fill-and-stroke-none",
        "fill-none-no-stroke",
        "fill-transparent",
        "fill-opacity-0",
        "an-inherited-fill-none",
        "an-inherited-fill-none-and-its-own-stroke-none",
        "stroke-opacity-0",
        "stroke-width-0",
        "a-style-element-with-fill-none",
    ],
)
def test_a_path_its_paint_makes_invisible_is_refused(tmp_path: Path, body: str) -> None:
    done = from_svg(tmp_path, svg(f"{VISIBLE}\n{body}"))
    refused(tmp_path, done)


def test_an_inkscape_style_export_still_converts(tmp_path: Path) -> None:
    # What the tracing tool writes around a visible trace: its namedview and metadata (foreign, with no path), an
    # empty defs, a layer shown with display:inline, and a path's fill style; all left behind but the paths.
    body = (
        '<sodipodi:namedview xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" id="nv"/>\n'
        '<defs id="defs1"/>\n'
        '<metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></metadata>\n'
        f'<g style="display:inline" opacity="1"><path style="fill:#000000;stroke:none" d="{PATH_A}"/>'
        f'<path d="{PATH_B}"/></g>'
    )
    done = from_svg(tmp_path, svg(body))
    assert done.returncode == 0, done.stdout + done.stderr
    doc = json.loads((tmp_path / "busy-sign.outline.json").read_text(encoding="utf-8"))
    assert doc["paths"] == [PATH_A, PATH_B]


# Nit 1: an encoding other than UTF-8, or any DTD, however it is spelled.
@pytest.mark.parametrize(
    "data",
    [
        TRACE.replace('encoding="UTF-8"', 'encoding="UTF-16"').encode("utf-16"),
        TRACE.replace('encoding="UTF-8"', 'encoding="UTF-16"').encode("utf-16-le"),
        TRACE.replace('encoding="UTF-8"', 'encoding="UTF-16"').encode("utf-16-be"),
        (
            '<?xml version="1.0" encoding="UTF-16"?>\n<!DOCTYPE svg [<!ENTITY a "aaaa">]>\n'
            f'<svg xmlns="{SVG_NS}" viewBox="0 0 10 10"><path id="{MARK}" d="{PATH_A}"/></svg>\n'
        ).encode("utf-16"),
        TRACE.replace('encoding="UTF-8"', 'encoding="ISO-8859-1"').encode("utf-8"),
        b"\xef\xbb\xbf" + TRACE.encode("utf-8"),
        TRACE.encode("utf-8").replace(b"traced", b"tr\xe9ced"),
        (
            '<?xml version="1.0"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" '
            '"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n'
            f'<svg xmlns="{SVG_NS}" viewBox="0 0 10 10"><path id="{MARK}" d="{PATH_A}"/></svg>\n'
        ).encode(),
        (
            '<?xml version="1.0"?>\n<?xml-stylesheet href="hide.css" type="text/css"?>\n'
            f'<svg xmlns="{SVG_NS}" viewBox="0 0 10 10"><path id="{MARK}" d="{PATH_A}"/></svg>\n'
        ).encode(),
    ],
    ids=[
        "utf-16-with-a-bom",
        "utf-16-le-without",
        "utf-16-be-without",
        "utf-16-with-a-dtd",
        "another-declared-encoding",
        "a-utf-8-bom",
        "not-utf-8",
        "an-external-dtd",
        "a-stylesheet-instruction",
    ],
)
def test_an_svg_in_another_encoding_or_with_a_dtd_is_refused(
    tmp_path: Path, data: bytes
) -> None:
    (tmp_path / "trace.svg").write_bytes(data)
    done = run(tmp_path, "--from-svg", "trace.svg", *FIELDS)
    refused(tmp_path, done)


# Nit 2: failures that once escaped exit 2.
def test_deep_nesting_exits_2_and_writes_nothing(tmp_path: Path) -> None:
    for depth in (300, 5000):
        done = from_svg(tmp_path, svg("<g>" * depth + VISIBLE + "</g>" * depth))
        refused(tmp_path, done)
        assert "deeper than" in done.stdout


def test_a_folder_it_cant_write_exits_2_naming_no_path(tmp_path: Path) -> None:
    (tmp_path / "trace.svg").write_text(TRACE, encoding="utf-8")
    tmp_path.chmod(0o555)
    try:
        done = run(tmp_path, "--from-svg", "trace.svg", *FIELDS)
    finally:
        tmp_path.chmod(0o755)
    refused(tmp_path, done)
    assert "can't be written" in done.stdout


def test_an_output_it_cant_replace_exits_2_and_leaves_no_temporary_file(
    tmp_path: Path,
) -> None:
    (tmp_path / "trace.svg").write_text(TRACE, encoding="utf-8")
    (tmp_path / "busy-sign.outline.json").mkdir()
    done = run(tmp_path, "--from-svg", "trace.svg", *FIELDS)
    assert done.returncode == 2, done.stdout + done.stderr
    assert sorted(p.name for p in tmp_path.iterdir()) == [
        "busy-sign.outline.json",
        "trace.svg",
    ]
    assert str(tmp_path) not in done.stdout + done.stderr
    assert "Traceback" not in done.stderr


def test_words_that_arent_text_exit_2_and_write_nothing(tmp_path: Path) -> None:
    # Bytes that aren't UTF-8 on the command line reach Python as surrogates, which UTF-8 can't encode.
    (tmp_path / "trace.svg").write_text(TRACE, encoding="utf-8")
    args = [a.encode() for a in FIELDS]
    args[args.index(WORDS.encode())] = b"busy \xff"
    done = subprocess.run(
        [sys.executable, str(SCRIPT), b"--from-svg", b"trace.svg", *args],
        cwd=tmp_path,
        capture_output=True,
        check=False,
        timeout=60,
        env={"PATH": "/usr/bin:/bin", "LC_ALL": "C.UTF-8"},
    )
    out = done.stdout.decode("utf-8", "replace") + done.stderr.decode(
        "utf-8", "replace"
    )
    assert done.returncode == 2, out
    assert sorted(p.name for p in tmp_path.iterdir()) == ["trace.svg"], out
    assert "Traceback" not in out


# Nit 3: a regular file, within the size cap.
def test_an_svg_that_isnt_a_regular_file_exits_2(tmp_path: Path) -> None:
    os.mkfifo(tmp_path / "fifo.svg")
    (tmp_path / "real.svg").write_text(TRACE, encoding="utf-8")
    (tmp_path / "link.svg").symlink_to(tmp_path / "real.svg")
    (tmp_path / "folder.svg").mkdir()
    for name in ("fifo.svg", "link.svg", "folder.svg", "/dev/zero"):
        done = run(tmp_path, "--from-svg", name, *FIELDS)
        assert done.returncode == 2, (name, done.stdout + done.stderr)
        assert "isn't a regular file" in done.stdout, (name, done.stdout)
        assert not (tmp_path / "busy-sign.outline.json").exists()


def test_an_svg_over_the_size_cap_exits_2(tmp_path: Path) -> None:
    spec = importlib.util.spec_from_file_location("outline_check_cap", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.MAX_SVG_BYTES == 16 * 1024 * 1024
    big = tmp_path / "trace.svg"
    with big.open("wb") as out:
        out.write(TRACE.encode("utf-8"))
        out.truncate(module.MAX_SVG_BYTES + 1)
    done = run(tmp_path, "--from-svg", "trace.svg", *FIELDS)
    refused(tmp_path, done)
    assert f"larger than {module.MAX_SVG_BYTES:,} bytes" in done.stdout
    assert "delete the embedded photo" in done.stdout


# --------------------------------------------------------------------------------------------------
# The file: O1 to O10
# --------------------------------------------------------------------------------------------------
def test_a_design_traced_file_passes(tmp_path: Path) -> None:
    done = check_file(tmp_path, outline())
    assert done.returncode == 0, done.stdout
    assert done.stdout.startswith(
        "outline-check: PASS: busy-sign.outline.json, 2 paths"
    )


def test_o1_not_a_regular_file(tmp_path: Path) -> None:
    write(tmp_path, outline(), "real.json")
    (tmp_path / "busy-sign.outline.json").symlink_to(tmp_path / "real.json")
    done = run(tmp_path, "busy-sign.outline.json")
    assert done.returncode == 1 and rules(done) == {"O1"}, done.stdout
    (tmp_path / "dir.outline.json").mkdir()
    done = run(tmp_path, "dir.outline.json")
    assert done.returncode == 1 and rules(done) == {"O1"}, done.stdout


@pytest.mark.parametrize(
    "raw",
    [
        b"\xef\xbb\xbf" + json.dumps(outline()).encode(),
        json.dumps(outline()).encode() + b" {}",
        b'{"schema": 1, "schema": 1}',
        json.dumps(outline()).replace("80", "NaN").encode(),
        json.dumps(outline()).replace("80", "Infinity").encode(),
        b"\xff\xfe not utf-8",
        b"[1, 2]",
        b"{not json",
    ],
    ids=[
        "bom",
        "trailing",
        "duplicate",
        "nan",
        "infinity",
        "not-utf8",
        "array",
        "broken",
    ],
)
def test_o1_not_strict_json_or_not_an_object(tmp_path: Path, raw: bytes) -> None:
    (tmp_path / "busy-sign.outline.json").write_bytes(raw)
    done = run(tmp_path, "busy-sign.outline.json")
    assert done.returncode == 1 and rules(done) == {"O1"}, done.stdout


@pytest.mark.parametrize(
    "doc",
    [
        {**outline(), MARK: 1},
        {**outline(), "source": {"type": "photo", "id": "PH-0001", "file": "x"}},
        {
            **outline(),
            "tool": {
                "name": "Inkscape",
                "version": "1.4",
                "license": "MIT",
                "url": "x",
            },
        },
        outline(paths=None),
        outline(words=None),
        {**outline(), "source": {"type": "photo"}},
    ],
    ids=["top", "source", "tool", "no-paths", "no-words", "no-source-id"],
)
def test_o2_a_key_outside_the_schema_or_one_missing(tmp_path: Path, doc: dict) -> None:
    done = check_file(tmp_path, doc)
    assert done.returncode == 1 and "O2" in rules(done), done.stdout


@pytest.mark.parametrize(
    "over",
    [
        {"schema": 2},
        {"schema": True},
        {"view_box": [0, 0, 400]},
        {"view_box": [0, 0, 0, 120]},
        {"view_box": [0, 0, 400, "120"]},
        {"view_box": [0, 0, 400, 1e309]},
        {"cap_height": 0},
        {"cap_height": 121},
        {"cap_height": "80"},
        {"advance": 401},
        {"advance": -1},
    ],
    ids=[
        "schema",
        "schema-bool",
        "viewbox-short",
        "viewbox-zero",
        "viewbox-text",
        "viewbox-infinite",
        "cap-zero",
        "cap-over",
        "cap-text",
        "advance-over",
        "advance-negative",
    ],
)
def test_o3_a_value_of_the_wrong_type_or_out_of_range(
    tmp_path: Path, over: dict
) -> None:
    doc = outline(**over)
    raw = json.dumps(doc).replace("Infinity", "1e309")
    done = check_file(tmp_path, raw + "\n")
    assert done.returncode == 1 and "O3" in rules(done), done.stdout


def test_o4_a_sign_outside_the_grammar_or_a_file_named_otherwise(
    tmp_path: Path,
) -> None:
    done = check_file(tmp_path, outline(sign="Busy Sign"))
    assert done.returncode == 1 and "O4" in rules(done), done.stdout
    done = check_file(tmp_path, outline(), name="other-sign.outline.json")
    assert done.returncode == 1 and rules(done) == {"O4"}, done.stdout


@pytest.mark.parametrize(
    "words",
    ["", "x" * 201, "I am\nvery busy", "I am\x07busy", 14],
    ids=["empty", "long", "newline", "bell", "number"],
)
def test_o5_words_empty_long_or_holding_a_control_character(
    tmp_path: Path, words: object
) -> None:
    done = check_file(tmp_path, outline(words=words))
    assert done.returncode == 1 and "O5" in rules(done), done.stdout


@pytest.mark.parametrize(
    "ref",
    ["intent-4", "intent/004.md", "004", "intent-0042", 4],
)
def test_o6_an_intent_ref_not_intent_nnn(tmp_path: Path, ref: object) -> None:
    done = check_file(tmp_path, outline(intent_ref=ref))
    assert done.returncode == 1 and "O6" in rules(done), done.stdout


@pytest.mark.parametrize(
    "source",
    [
        {"type": "prompt", "id": "P-0001"},
        {"type": "photo", "id": "IMG_4521"},
        {"type": "photo", "id": "IMG-20261022-WA0001"},
        {"type": "photo", "id": "20261022_143000"},
        {"type": "photo", "id": "2026-10-22T14-30"},
        {"type": "photo", "id": "my photo"},
        {"type": "photo", "id": "ab"},
        {"type": "photo", "id": 42},
    ],
    ids=["type", "camera", "whatsapp", "samsung", "time", "space", "short", "number"],
)
def test_o7_a_source_type_or_an_id_that_isnt_opaque(
    tmp_path: Path, source: dict
) -> None:
    done = check_file(tmp_path, outline(source=source))
    assert done.returncode == 1 and "O7" in rules(done), done.stdout


@pytest.mark.parametrize(
    "tool",
    [
        {"name": "", "version": "1.4", "license": "MIT"},
        {"name": "x" * 65, "version": "1.4", "license": "MIT"},
        {"name": "Inkscape", "version": "1.4\n", "license": "MIT"},
        {"name": "Inkscape", "version": 1.4, "license": "MIT"},
    ],
    ids=["empty", "long", "not-printable", "number"],
)
def test_o8_a_tool_field_empty_long_or_not_printable(
    tmp_path: Path, tool: dict
) -> None:
    done = check_file(tmp_path, outline(tool=tool))
    assert done.returncode == 1 and "O8" in rules(done), done.stdout


@pytest.mark.parametrize(
    "paths",
    [
        [],
        [PATH_A] * 513,
        ["M0 0 " + "L1 1 " * 52429],
        ["L 10 10 Z"],
        ["M 10 10 <image/>"],
        ["M 10 10 L 1e999 2"],
        ["M 10 10 url(#a)"],
        "M 10 10",
        [12],
    ],
    ids=[
        "empty",
        "too-many",
        "too-long",
        "no-moveto",
        "markup",
        "infinite",
        "url",
        "not-a-list",
        "not-a-string",
    ],
)
def test_o9_paths_empty_beyond_a_bound_or_not_path_data(
    tmp_path: Path, paths: object
) -> None:
    done = check_file(tmp_path, outline(paths=paths))
    assert done.returncode == 1 and "O9" in rules(done), done.stdout


def test_o9_the_bounds_themselves_pass(tmp_path: Path) -> None:
    unit = "M0 0 L1 1 "
    total = 262_144
    paths = [unit] * 511 + ["M0 0" + " " * (total - 511 * len(unit) - 4)]
    assert len(paths) == 512 and sum(map(len, paths)) == total
    assert check_file(tmp_path, outline(paths=paths)).returncode == 0


@pytest.mark.parametrize(
    "over",
    [
        {"words": "see href here"},
        {"words": "data:image/png"},
        {"words": "url(x)"},
        {"tool": {"name": "Q" * 40, "version": "1.4", "license": "MIT"}},
        {"words": "my dog/thinks"},
        {"words": "my dog\\thinks"},
        {"tool": {"name": "Inkscape", "version": "1.4", "license": "license.txt"}},
        {"words": "IMG_4521 is cool"},
        {"words": "busy at 14:30"},
    ],
    ids=[
        "href",
        "data",
        "url",
        "base64",
        "slash",
        "backslash",
        "extension",
        "camera-stem",
        "time",
    ],
)
def test_o10_a_string_outside_paths_holding_a_link_a_blob_a_name_or_a_time(
    tmp_path: Path, over: dict
) -> None:
    done = check_file(tmp_path, outline(**over))
    assert done.returncode == 1 and "O10" in rules(done), done.stdout


def test_the_signs_words_and_a_tools_version_pass_o10(tmp_path: Path) -> None:
    for words in ("I am very busy", "my dog thinks i'm cool"):
        done = check_file(
            tmp_path,
            outline(
                words=words,
                tool={
                    "name": "Inkscape",
                    "version": "1.4.2",
                    "license": "GPL-2.0-or-later",
                },
            ),
        )
        assert done.returncode == 0, done.stdout


# --------------------------------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------------------------------
def test_findings_then_a_count_and_no_output_line_holds_a_fixtures_value(
    tmp_path: Path,
) -> None:
    doc = outline(
        words=f"{MARK}\x07",
        intent_ref=f"{MARK}-1",
        source={"type": "photo", "id": f"{MARK}_IMG_1"},
        tool={"name": f"{MARK}/x", "version": f"{MARK}.jpeg", "license": f"{MARK}" * 6},
        paths=[f"M0 0 {MARK}"],
        **{MARK: MARK},
    )
    done = check_file(tmp_path, doc)
    assert done.returncode == 1
    lines = done.stdout.splitlines()
    assert lines[-1] == f"outline-check: {len(lines) - 1} findings"
    for line in lines[:-1]:
        assert line.split(" ", 2)[1] == "busy-sign.outline.json:", line
    assert MARK not in done.stdout + done.stderr
    assert str(tmp_path) not in done.stdout + done.stderr
    assert rules(done) >= {"O2", "O5", "O6", "O7", "O8", "O9", "O10"}


def test_the_svgs_content_and_path_never_reach_the_output(tmp_path: Path) -> None:
    done = from_svg(tmp_path)
    assert done.returncode == 0
    assert MARK not in done.stdout + done.stderr
    assert str(tmp_path) not in done.stdout + done.stderr
    assert "trace.svg" not in done.stdout + done.stderr


def test_a_long_hyphenated_sign_and_id_arent_a_blob(tmp_path: Path) -> None:
    sign = "a" + "-b" * 20
    assert len(sign) == 41
    doc = outline(sign=sign, source={"type": "design", "id": "D-" + "0a" * 19})
    done = check_file(tmp_path, doc, name=f"{sign}.outline.json")
    assert done.returncode == 0, done.stdout
