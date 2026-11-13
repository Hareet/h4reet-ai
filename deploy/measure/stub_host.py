#!/usr/bin/env python3
"""MEASUREMENT ONLY (tasks.md T166): the serving host the tunnel end's measurement forwards to, in place of the
laptop's and EC2's relay blocks. It answers the relay's health checks, hello with a short answer, and the collector's
OTLP posts, and keeps nothing. The standard library alone.

    python3 -I stub_host.py [--port 8080]
"""

from __future__ import annotations

import argparse
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ANSWER_DELAY_S = 0.05


class Handler(BaseHTTPRequestHandler):
    server_version = "measure-host"
    sys_version = ""
    timeout = 10

    def _send(self, status: int, doc: dict) -> None:
        body = json.dumps(doc).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path.startswith("/health"):
            self._send(200, {"status": "serving"})
        else:
            self._send(404, {"error": "not_found"})

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        if length:
            self.rfile.read(min(length, 1 << 22))
        if self.path.startswith("/v1/"):
            self._send(200, {})
        elif self.path in ("/api/hello", "/hello"):
            time.sleep(ANSWER_DELAY_S)
            self._send(200, {"answer": "a stand-in answer"})
        else:
            self._send(404, {"error": "not_found"})

    def log_message(self, format: str, *args: object) -> None:
        return


def main() -> None:
    parser = argparse.ArgumentParser(prog="stub_host.py")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    ThreadingHTTPServer(("0.0.0.0", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
