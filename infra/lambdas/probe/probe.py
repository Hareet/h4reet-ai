#!/usr/bin/env python3
"""The uptime probe, h4-probe (spec 001 FR-061; contracts/aws-alerts.md §5, and September's §4 at 00309c47; research.md
R-24; tasks.md T035). It runs from AWS's side, once a minute when infra/account/alerts.tf's schedule is enabled (group
8's P-I5), outside every host, and makes two checks:

    site    GET https://hareet.ai/
    status  GET https://hareet.ai/api/status

both with `X-H4-Probe: 1`, which marks them as the probe's. A check passes on a 200 within 5 s, and, for status, a JSON
object with a `serving` field. It never calls hello or a turn, sends no cookie and no credential, and follows no
redirect. Each run logs one line per check, the name, the status, the duration, and pass or fail, never a body; a run
whose checks don't all pass raises, so Lambda counts an error, which the probe's alarm reads (group 8). It doesn't retry:
the next minute is its retry.

The standard library alone; the function runs on python3.14, arm64 (research.md R-02), and this file holds to 3.12's
syntax, the tests' interpreter.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable

DEFAULT_SITE = "https://hareet.ai"
PATHS = ("/", "/api/status")
NAMES = {"/": "site", "/api/status": "status"}
HEADERS = {
    "X-H4-Probe": "1",
    "User-Agent": "h4reet-probe/1",
    "Accept": "*/*",
}
DEADLINE_S = 5
MAX_BODY = 65536

Fetch = Callable[[str, dict[str, str], float], tuple[int, bytes]]


class ProbeFailed(RuntimeError):
    """A run whose checks didn't all pass. Its message names the checks, never a body."""


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        return None  # a redirect is the answer, and it isn't a 200


_OPENER = urllib.request.build_opener(_NoRedirect)


def http_fetch(url: str, headers: dict[str, str], timeout: float) -> tuple[int, bytes]:
    """One GET, no body, no redirect followed; its status and at most MAX_BODY bytes. Network errors raise OSError."""
    request = urllib.request.Request(url, headers=dict(headers), method="GET")
    try:
        with _OPENER.open(request, timeout=timeout) as response:
            return response.status, response.read(MAX_BODY)
    except urllib.error.HTTPError as exc:
        return exc.code, b""


def site_from_env() -> str:
    """The site the probe checks: H4_PROBE_SITE, https and a bare host, or hareet.ai."""
    site = os.environ.get("H4_PROBE_SITE", DEFAULT_SITE).rstrip("/")
    parts = urllib.parse.urlsplit(site)
    if parts.scheme != "https" or not parts.hostname or parts.path or parts.query:
        raise ValueError("H4_PROBE_SITE must be https://<host>, with no path")
    return site


def _serving(body: bytes) -> bool:
    try:
        doc = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return False
    return isinstance(doc, dict) and "serving" in doc


def check(path: str, site: str, fetch: Fetch, clock: Callable[[], float]) -> dict:
    """One check: its name, the status (None when no answer came), its milliseconds, and whether it passed."""
    started = clock()
    try:
        status, body = fetch(f"{site}{path}", HEADERS, DEADLINE_S)
    except OSError:
        status, body = None, b""
    seconds = clock() - started
    passed = status == 200 and seconds <= DEADLINE_S
    if passed and path == "/api/status":
        passed = _serving(body)
    return {
        "check": NAMES[path],
        "status": status,
        "ms": round(seconds * 1000),
        "pass": passed,
    }


def run(
    site: str,
    fetch: Fetch = http_fetch,
    clock: Callable[[], float] = time.monotonic,
) -> dict:
    checks = [check(path, site, fetch, clock) for path in PATHS]
    return {"pass": all(c["pass"] for c in checks), "checks": checks}


def handler(
    event: object,
    context: object,
    fetch: Fetch | None = None,
    clock: Callable[[], float] | None = None,
) -> dict:
    """h4-probe's entry (infra/account/lambdas.tf)."""
    result = run(site_from_env(), fetch or http_fetch, clock or time.monotonic)
    for c in result["checks"]:
        print(json.dumps(c, sort_keys=True))
    if not result["pass"]:
        failing = ", ".join(c["check"] for c in result["checks"] if not c["pass"])
        raise ProbeFailed(f"failing: {failing}")
    return result
