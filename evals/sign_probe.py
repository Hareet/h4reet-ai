"""The sign check's probe (spec 014, FR-056 to FR-058; contracts/sign-check.md §3; plan.md PD-20).

Runs inside the stack's breach-probe image, on its internal network, read from standard input by
``python3 -I -B - <op>``, so the image needs no new file (plan.md, departure E20). Standard library only.

    health   GET the gateway's /health, and print what the check reads of it: the kill switch's state, whether
             renewal is awaited, local's health, and whether the test machinery spends synthetically
    turn     POST one conversation turn through the edge's site listener, as the page sends it for a selected
             piece, and print its status and, for a 200, its route and cost: never its words

Each prints one JSON line. A request that fails prints {"error": <its kind>}.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

GATEWAY = "http://gateway:8080/health"
# x005, the room's site, inside the internal network (deploy/edge/nginx.conf).
EDGE_TURN = "http://edge:8087/api/room/turn"
# What turn-client.ts sends for a selected piece on the engineer path (T001's reading of the page's request).
TURN = {
    "feature": "snowboard",
    "path": "engineer",
    "turns": [{"role": "user", "text": "What is this snowboard about?"}],
}
TIMEOUT_S = 40.0


def health() -> dict[str, object]:
    try:
        with urllib.request.urlopen(GATEWAY, timeout=10) as response:
            body = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, ValueError) as error:
        return {"error": type(error).__name__}
    adapters = body.get("adapters") or []
    local = next(
        (a for a in adapters if isinstance(a, dict) and a.get("id") == "local"), {}
    )
    machinery = body.get("test_machinery") or {}
    fallback = body.get("fallback") or {}
    return {
        "status": body.get("status"),
        "state": body.get("state"),
        "awaiting_renewal": fallback.get("awaiting_renewal"),
        "local_healthy": bool(local.get("healthy")),
        "synthetic": bool(machinery.get("synthetic")),
    }


def turn() -> dict[str, object]:
    data = json.dumps(TURN).encode("utf-8")
    request = urllib.request.Request(
        EDGE_TURN,
        data=data,
        method="POST",
        headers={"content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        return {"status": error.code}
    except (urllib.error.URLError, OSError) as error:
        return {"error": type(error).__name__}
    out: dict[str, object] = {"status": status}
    if status == 200:
        try:
            body = json.loads(raw.decode("utf-8"))
        except ValueError:
            return {"status": status, "error": "body"}
        # The three facts alone (contracts/sign-check.md §3 step 4): the reply's words are read into nothing.
        out["route"] = body.get("route") if isinstance(body, dict) else None
        out["cost_micro_usd"] = (
            body.get("cost_micro_usd") if isinstance(body, dict) else None
        )
    return out


def main(argv: list[str]) -> int:
    op = argv[1] if len(argv) > 1 else ""
    if op == "health":
        print(json.dumps({"sign_probe": 1, "health": health()}))
        return 0
    if op == "turn":
        print(json.dumps({"sign_probe": 1, "turn": turn()}))
        return 0
    print(json.dumps({"sign_probe": 1, "error": "unknown op"}))
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
