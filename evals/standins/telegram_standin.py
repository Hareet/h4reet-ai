#!/usr/bin/env python3
"""The Telegram stand-in (spec 000 FR-032, FR-036; contracts/alerts.md §4.1, §4.3; plan §2, §8; tasks.md T079; spec 011
FR-041, its plan §8.1).

    python3 -I -B /app/telegram_standin.py [--host 0.0.0.0] [--port 8080]      the telegram-standin service

A standard-library HTTP server in place of Telegram's Bot API, for dev and dev-cpu, whose gateways send their alerts
here in stand-in mode (ALERT_DELIVERY=standin, at config/alerts.yaml's standin.telegram_base). It answers the
dispatcher's request as the Bot API would, and keeps each message in memory, so the breach test can see what arrived:

    POST /bot<token>/sendMessage   JSON {"chat_id", "text", "entities", "disable_web_page_preview"}:
                                   200 {"ok": true, "result": {"message_id", "date", "chat"}}
    GET  /messages                 200 {"messages": [{"message_id", "chat_id", "text", "entities",
                                   "disable_web_page_preview", "received_at"}]}, oldest first
    GET  /healthz                  200 {"ok": true}, for the compose health check

It forwards nothing: it opens no connection of its own, and the stack's internal network, its only one, has no route
out. It refuses what stand-in mode never sends, with the Bot API's own errors, so a gateway that sent anything else
would show it: a token other than the dummy `standin` gets 401, a chat other than 0 gets 400 (alerts.md §4.3: "the
gateway sends the stand-in a fixed dummy token (`standin`) and chat ID `0`, never the real bot token"), and so does a
parse_mode, since an alert's formatting is message entities, never markup (§4.1; spec 011, FR-008).

Spec 011's designed messages carry `entities` beside the text, which it checks as the Bot API does and as the
gateway's own check does (FR-009, FR-010): a list of objects of the types bold, italic, code, and pre, each with an
integer offset of 0 or more and a length of 1 or more and no other key (so no `language`), inside the text, neither end
inside a surrogate pair, in order, with no overlap. Anything else is the Bot API's 400, "can't parse entities". It
counts a text's length in UTF-16 code units, as the Bot API does, against 4,096, and keeps each message's entities
(an empty list when none) and whether it disabled link previews.

It keeps and logs no token: each request's log line names the route, with the token's place shown as <token>, and
the status, never a body, a message's text, or its entities. It keeps the newest MAX_MESSAGES messages, so its memory
stays inside the container's 64 MiB.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import signal
import sys
import threading
import time
import urllib.parse
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, TextIO

DUMMY_TOKEN = "standin"  # stand-in mode's token (contracts/alerts.md §4.3)
DUMMY_CHAT = 0
MAX_BODY = 64 * 1024
MAX_TEXT = 4096  # the Bot API's own limit for a message's text, in UTF-16 code units
ENTITY_TYPES = frozenset(
    {"bold", "italic", "code", "pre"}
)  # spec 011, FR-009: none links, mentions, or hides
ENTITY_KEYS = frozenset({"type", "offset", "length"})
MAX_MESSAGES = 1000
SEND_RE = re.compile(r"/bot([^/]+)/sendMessage")


class Store:
    """The messages received, oldest first, with Telegram's increasing message IDs."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._messages: deque[dict[str, Any]] = deque()
        self._next_id = 1

    def add(
        self,
        text: str,
        entities: list[dict[str, Any]] | None = None,
        no_preview: bool = False,
    ) -> dict[str, Any]:
        received = dt.datetime.now(dt.timezone.utc)
        with self._lock:
            message = {
                "message_id": self._next_id,
                "chat_id": DUMMY_CHAT,
                "text": text,
                "entities": list(entities or []),
                "disable_web_page_preview": no_preview,
                "received_at": received.isoformat(timespec="milliseconds").replace(
                    "+00:00", "Z"
                ),
            }
            self._next_id += 1
            self._messages.append(message)
            while len(self._messages) > MAX_MESSAGES:
                self._messages.popleft()
        return message

    def all(self) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._messages)


def refusal(status: int, description: str) -> tuple[int, dict[str, Any]]:
    """The Bot API's error shape."""
    return status, {"ok": False, "error_code": status, "description": description}


def utf16_units(text: str) -> list[int]:
    """The text's UTF-16 code units, as the Bot API counts a message's length and its entities' offsets."""
    data = text.encode("utf-16-le", "surrogatepass")
    return [int.from_bytes(data[i : i + 2], "little") for i in range(0, len(data), 2)]


def entities_ok(entities: object, units: list[int]) -> bool:
    """Spec 011's FR-009 and FR-010, as the Bot API reads them (its plan §8.1)."""
    if not isinstance(entities, list):
        return False

    def low(i: int) -> bool:
        """Whether the unit at i is a surrogate pair's second half."""
        return 0xDC00 <= units[i] <= 0xDFFF

    end = 0
    for entity in entities:
        if not isinstance(entity, dict) or set(entity) != ENTITY_KEYS:
            return False
        offset, length = entity["offset"], entity["length"]
        if entity["type"] not in ENTITY_TYPES:
            return False
        if any(isinstance(v, bool) or not isinstance(v, int) for v in (offset, length)):
            return False
        if offset < 0 or length < 1 or offset + length > len(units):
            return False
        if low(offset) or (offset + length < len(units) and low(offset + length)):
            return False
        if offset < end:
            return False
        end = offset + length
    return True


def is_dummy_chat(chat: object) -> bool:
    if isinstance(chat, bool):
        return False
    return chat == DUMMY_CHAT or chat == str(DUMMY_CHAT)


def send_message(
    store: Store, token: str, content_type: str, raw: bytes
) -> tuple[int, dict[str, Any], str]:
    """POST /bot<token>/sendMessage: the status, the answer, and what the log line adds."""
    if token != DUMMY_TOKEN:
        return (*refusal(401, "Unauthorized"), "")
    if content_type.split(";", 1)[0].strip().lower() != "application/json":
        return (*refusal(400, "Bad Request: the stand-in takes JSON"), "")
    try:
        body = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return (*refusal(400, "Bad Request: can't parse JSON"), "")
    if not isinstance(body, dict):
        return (*refusal(400, "Bad Request: the body isn't a JSON object"), "")
    if not is_dummy_chat(body.get("chat_id")):
        return (*refusal(400, "Bad Request: chat not found"), "")
    text = body.get("text")
    if not isinstance(text, str) or not text:
        return (*refusal(400, "Bad Request: message text is empty"), "")
    units = utf16_units(text)
    if len(units) > MAX_TEXT:
        return (*refusal(400, "Bad Request: message is too long"), "")
    if "parse_mode" in body:
        return (
            *refusal(
                400, "Bad Request: the stand-in takes plain text, with no parse_mode"
            ),
            "",
        )
    entities = body.get("entities", [])
    if not entities_ok(entities, units):
        return (*refusal(400, "Bad Request: can't parse entities"), "")
    message = store.add(text, entities, body.get("disable_web_page_preview") is True)
    result = {
        "message_id": message["message_id"],
        "date": int(time.time()),
        "chat": {"id": DUMMY_CHAT, "type": "private"},
    }
    return 200, {"ok": True, "result": result}, f" message {message['message_id']}"


def make_handler(store: Store, log: TextIO) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        server_version = "telegram-standin"
        sys_version = ""
        timeout = 10

        def answer(
            self, status: int, body: dict[str, Any], route: str, note: str = ""
        ) -> None:
            data = json.dumps(body).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            # The route, never the path: a sendMessage path carries a token.
            print(
                f"telegram-standin: {self.command} {route} {status}{note}",
                file=log,
                flush=True,
            )

        def route(self) -> tuple[str, str | None]:
            """The route template for the log, and the path's token for sendMessage."""
            path = urllib.parse.urlsplit(self.path).path
            match = SEND_RE.fullmatch(path)
            if match:
                return "/bot<token>/sendMessage", match.group(1)
            if path in ("/messages", "/healthz"):
                return path, None
            return "other", None

        def do_POST(self) -> None:
            route, token = self.route()
            if route == "other":
                self.answer(*refusal(404, "Not Found"), route)
                return
            if token is None:
                self.answer(*refusal(405, "Method Not Allowed"), route)
                return
            length = self.headers.get("Content-Length")
            if length is None or not length.isdigit():
                self.answer(*refusal(411, "Length Required"), route)
                return
            if int(length) > MAX_BODY:
                self.answer(*refusal(413, "Request Entity Too Large"), route)
                self.close_connection = True
                return
            raw = self.rfile.read(int(length))
            status, body, note = send_message(
                store, token, self.headers.get("Content-Type", ""), raw
            )
            self.answer(status, body, route, note)

        def do_GET(self) -> None:
            route, token = self.route()
            if route == "/healthz":
                self.answer(200, {"ok": True}, route)
            elif route == "/messages":
                self.answer(200, {"messages": store.all()}, route)
            elif token is not None:
                self.answer(*refusal(405, "Method Not Allowed"), route)
            else:
                self.answer(*refusal(404, "Not Found"), route)

        def not_allowed(self) -> None:
            route, _ = self.route()
            if route == "other":
                self.answer(*refusal(404, "Not Found"), route)
            else:
                self.answer(*refusal(405, "Method Not Allowed"), route)

        do_PUT = do_DELETE = do_PATCH = not_allowed

        def log_message(self, format: str, *args: Any) -> None:
            # http.server's own lines carry the request line, and so a sendMessage path's token: never written.
            return

    return Handler


def make_server(
    host: str, port: int, *, log: TextIO | None = None, store: Store | None = None
) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer(
        (host, port), make_handler(store or Store(), log or sys.stderr)
    )
    server.daemon_threads = True
    return server


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="telegram_standin.py",
        description="The Telegram stand-in for dev and dev-cpu (contracts/alerts.md §4.3).",
    )
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args(argv)
    server = make_server(args.host, args.port)

    def stop(signum: int, frame: object) -> None:
        raise SystemExit(0)

    # As PID 1 in its container it gets no default SIGTERM action: without a handler, docker stop would wait and kill.
    signal.signal(signal.SIGTERM, stop)
    host, port = server.server_address[:2]
    print(f"telegram-standin: listening on {host}:{port}", file=sys.stderr, flush=True)
    try:
        server.serve_forever()
    except (SystemExit, KeyboardInterrupt):
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
