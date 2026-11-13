#!/usr/bin/env python3
"""MEASUREMENT ONLY (tasks.md T166): the tunnel end's load, from a one-off container on the measurement's own network.

    python3 -I load_tunnel_end.py --minutes N [--per-minute 60]

For N minutes, on a fixed schedule (time.monotonic):
  - hello to the relay's edge listener at the gateway's global metered limit (config/budgets.yaml's
    `global.metered_per_minute`, which the harness passes as --per-minute), each with CloudFront-Viewer-Address from 16
    documentation addresses (198.51.100.1 to .16) in turn, so no address passes the stand-in public cap;
  - the status every 5 s, as visitors' rooms and the probe ask it;
  - a host part to the sink every minute, as a serving host's publisher posts it, with the measurement's stand-in token.
It prints one JSON line, "h4_measure_load": 1, with each request kind's answers by status. No payload but a fixed
stand-in message, no address of a visitor, no secret.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

RELAY = "http://relay:8080"
SINK = "http://snapshot-sink:8080"
ADDRESSES = [f"198.51.100.{n}" for n in range(1, 17)]
STATUS_EVERY_S = 5.0
PART_EVERY_S = 60.0


def request(url: str, method: str, body: dict | None, headers: dict[str, str]) -> int:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={**headers, **({"Content-Type": "application/json"} if data else {})},
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=30) as response:
            response.read(65536)
            return response.status
    except urllib.error.HTTPError as exc:
        return exc.code
    except OSError:
        return 0


def part(now: float) -> dict:
    return {
        "host": "laptop",
        "taken_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)),
        "requests_per_s": 1.0,
        "error_rate": 0.0,
        "latency_p50_s": 0.05,
        "latency_p95_s": 0.1,
        "model_server_up": True,
        "degraded_causes": [],
        "ceilings": {"day_usd": 5.0, "month_usd": 20.0},
        "warnings": {"day_usd": 3.5, "month_usd": 14.0},
        "release": None,
        "tunnel_up": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser(prog="load_tunnel_end.py")
    parser.add_argument("--minutes", type=int, required=True)
    parser.add_argument("--per-minute", type=int, default=60)
    args = parser.parse_args()
    token = os.environ.get("SNAPSHOT_SINK_TOKEN", "")
    counts: dict[str, dict[str, int]] = {"hello": {}, "status": {}, "part": {}}

    def count(kind: str, status: int) -> None:
        counts[kind][str(status)] = counts[kind].get(str(status), 0) + 1

    start = time.monotonic()
    end = start + args.minutes * 60
    hello_every = 60.0 / max(1, args.per_minute)
    next_hello, next_status, next_part = start, start, start
    sent = 0
    while True:
        now = time.monotonic()
        if now >= end:
            break
        if now >= next_hello:
            viewer = f"{ADDRESSES[sent % len(ADDRESSES)]}:443"
            sent += 1
            count(
                "hello",
                request(
                    f"{RELAY}/api/hello",
                    "POST",
                    {"message": "a measurement's stand-in hello"},
                    {"CloudFront-Viewer-Address": viewer},
                ),
            )
            next_hello += hello_every
        if now >= next_status:
            count(
                "status",
                request(
                    f"{RELAY}/api/status",
                    "GET",
                    None,
                    {"CloudFront-Viewer-Address": f"{ADDRESSES[0]}:443"},
                ),
            )
            next_status += STATUS_EVERY_S
        if now >= next_part:
            count(
                "part",
                request(
                    f"{SINK}/v1/host",
                    "POST",
                    part(time.time()),
                    {"Authorization": f"Bearer {token}"},
                ),
            )
            next_part += PART_EVERY_S
        time.sleep(
            max(0.0, min(next_hello, next_status, next_part, end) - time.monotonic())
        )
    print(
        json.dumps(
            {
                "h4_measure_load": 1,
                "minutes": args.minutes,
                "per_minute": args.per_minute,
                **counts,
            }
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
