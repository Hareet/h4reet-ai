"""The gzip-9 parity, through Python (spec 004 T064; FR-079, SC-006; Amendment C11; research.md R-26;
contracts/plain-model-fit.md §7 and §12).

apps/web/test/fixtures/gzip-parity.json holds cases cut from a seeded xorshift32 stream, which this file and
apps/web/test/room/gzip.test.ts generate identically (the fixture's "about" gives the recipe), each with its bytes'
CRC-32 and its expected gzip-9 length. Python's gzip.compress(data, 9, mtime=0), the arrival check's measure for its
F2 and F3, must give each case that length, as pako must in gzip.test.ts, so the bytes the site serves are the bytes
the caps count. A zlib other than stock zlib can fail it, naming the case: Chromium's fork, which Node bundles, gives
four of these cases other lengths. Only the length is compared, with the trailer: Python 3.12's gzip.compress with mtime=0
returns zlib's own header, whose OS byte is 3 (Unix) where pako's is 255, and the length never depends on that byte.
Self-contained: spec 003's intake adds its own files to this folder.
"""

from __future__ import annotations

import gzip
import json
import struct
from pathlib import Path
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "apps" / "web" / "test" / "fixtures" / "gzip-parity.json"
CASES: list[dict[str, Any]] = json.loads(FIXTURE.read_text(encoding="utf-8"))["cases"]

MASK = 0xFFFFFFFF


class Xorshift32:
    """Marsaglia's xorshift32 (13, 17, 5), stepped as gzip.test.ts steps it."""

    def __init__(self, seed: int) -> None:
        self.x = seed

    def next(self) -> int:
        x = self.x
        x ^= (x << 13) & MASK
        x ^= x >> 17
        x ^= (x << 5) & MASK
        self.x = x
        return x

    def draw(self, span: list[int]) -> int:
        """lo + (the next value mod (hi - lo + 1)), for the span [lo, hi]."""
        lo, hi = span
        return lo + self.next() % (hi - lo + 1)

    def random_bytes(self, n: int) -> bytes:
        """n bytes: the next ceil(n / 4) values, each little-endian, the last cut short."""
        words = [self.next() for _ in range((n + 3) // 4)]
        return struct.pack(f"<{len(words)}I", *words)[:n]


def case_bytes(case: dict[str, Any]) -> bytes:
    """A case's bytes: its pool of patterns, then rounds of a random run and, with a pool, a pattern's run."""
    if case["random"][1] == 0 and (not case["pool"] or case["pattern"][1] == 0):
        raise ValueError(f"{case['name']}: its rounds add no bytes")
    s = Xorshift32(case["seed"])
    patterns = [s.random_bytes(s.draw(case["period"])) for _ in range(case["pool"])]
    out = bytearray()
    while len(out) < case["bytes"]:
        out += s.random_bytes(s.draw(case["random"]))
        if case["pool"]:
            pattern = patterns[s.draw([0, case["pool"] - 1])]
            if not pattern:
                raise ValueError(f"{case['name']}: a pattern is empty")
            n = s.draw(case["pattern"])
            out += (pattern * (n // len(pattern) + 1))[:n]
    return bytes(out[: case["bytes"]])


def test_the_cases_run_from_empty_to_past_the_cap() -> None:
    sizes = [case["bytes"] for case in CASES]
    assert min(sizes) == 0
    assert max(sizes) > 2_500_000, "no case is past the room's 2,500,000-byte cap"
    assert len({case["name"] for case in CASES}) == len(CASES), "two cases share a name"


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_gzip_compress_gives_each_case_its_length(case: dict[str, Any]) -> None:
    name = case["name"]
    data = case_bytes(case)
    out = gzip.compress(data, 9, mtime=0)
    crc, size = struct.unpack("<II", out[-8:])
    assert crc == case["crc32"], (
        f"{name}: the generator's bytes aren't the fixture's "
        f"(CRC-32 {crc:#010x}, the fixture's {case['crc32']:#010x})"
    )
    assert size == case["bytes"], f"{name}: the trailer counts {size} bytes"
    assert len(out) == case["gzip9"], (
        f"{name}: gzip.compress(data, 9, mtime=0) gives {len(out)} bytes, "
        f"the fixture {case['gzip9']}"
    )
