"""Tests for evals/standins/telegram_standin.py, the Telegram stand-in (contracts/alerts.md §4.1 and §4.3; tasks.md T079).

Each test runs the stand-in on 127.0.0.1 at port 0, in this process or, for the signal test, as a subprocess by path,
and talks to it through urllib with an empty ProxyHandler: the agent sandbox sets proxy variables that would otherwise
carry a loopback request to its proxy.
"""

from __future__ import annotations

import ast
import contextlib
import datetime as dt
import importlib.util
import io
import json
import re
import signal
import subprocess
import sys
import threading
import urllib.error
import urllib.request
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
import yaml

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "evals" / "standins" / "telegram_standin.py"
SPEC = importlib.util.spec_from_file_location("h4_telegram_standin", SCRIPT)
assert SPEC and SPEC.loader
standin = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = standin
SPEC.loader.exec_module(standin)

# A distinctive token that isn't the dummy, built at run time so this file holds nothing token-shaped.
OTHER_TOKEN = "123456789:" + "x" * 35
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


@contextlib.contextmanager
def running(log: io.StringIO | None = None) -> Iterator[str]:
    server = standin.make_server("127.0.0.1", 0, log=log or io.StringIO())
    thread = threading.Thread(
        target=server.serve_forever, kwargs={"poll_interval": 0.02}, daemon=True
    )
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()


def call(
    method: str,
    url: str,
    body: Any = None,
    *,
    raw: bytes | None = None,
    content_type: str = "application/json",
) -> tuple[int, Any]:
    data = (
        raw if raw is not None else None if body is None else json.dumps(body).encode()
    )
    request = urllib.request.Request(url, data=data, method=method)
    if data is not None:
        request.add_header("Content-Type", content_type)
    try:
        with OPENER.open(request, timeout=5) as response:
            status, text = response.status, response.read()
    except urllib.error.HTTPError as answer:
        status, text = answer.code, answer.read()
    return status, json.loads(text) if text else None


def send(
    base: str, text: str = "an alert", *, token: str = "standin", chat: Any = 0
) -> tuple[int, Any]:
    return call(
        "POST", f"{base}/bot{token}/sendMessage", {"chat_id": chat, "text": text}
    )


def messages(base: str) -> list[dict[str, Any]]:
    status, body = call("GET", f"{base}/messages")
    assert status == 200
    return body["messages"]


def test_send_message_answers_as_the_bot_api_and_keeps_the_message() -> None:
    with running() as base:
        status, body = call(
            "POST",
            f"{base}/botstandin/sendMessage",
            {
                "chat_id": 0,
                "text": "[dev-cpu] WARNING: daily meter at 70%",
                "disable_web_page_preview": True,
            },
        )
        assert status == 200
        assert body["ok"] is True
        assert body["result"]["message_id"] == 1
        assert body["result"]["chat"] == {"id": 0, "type": "private"}
        assert isinstance(body["result"]["date"], int)
        # The next message gets the next ID, as Telegram's do.
        assert send(base, "a second alert")[1]["result"]["message_id"] == 2
        kept = messages(base)
    assert [m["message_id"] for m in kept] == [1, 2]
    assert kept[0]["chat_id"] == 0
    assert kept[0]["text"] == "[dev-cpu] WARNING: daily meter at 70%"
    received = dt.datetime.fromisoformat(kept[0]["received_at"].replace("Z", "+00:00"))
    assert received.tzinfo is not None
    assert re.fullmatch(
        r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z", kept[0]["received_at"]
    )


def test_a_chat_id_given_as_a_string_is_the_same_chat() -> None:
    # Telegram takes chat_id as an integer or a string.
    with running() as base:
        assert send(base, chat="0")[0] == 200
        assert messages(base)[0]["chat_id"] == 0


@pytest.mark.parametrize(
    ("token", "chat", "status", "description"),
    [
        (OTHER_TOKEN, 0, 401, "Unauthorized"),
        ("standin", 42, 400, "Bad Request: chat not found"),
        ("standin", "-1001", 400, "Bad Request: chat not found"),
        ("standin", True, 400, "Bad Request: chat not found"),
    ],
)
def test_stand_in_mode_is_the_dummy_token_and_chat_0_or_nothing(
    token: str, chat: Any, status: int, description: str
) -> None:
    # alerts.md §4.3: in stand-in mode the gateway sends the dummy token `standin` and chat 0, never the real ones.
    with running() as base:
        answer = send(base, token=token, chat=chat)
        assert answer == (
            status,
            {"ok": False, "error_code": status, "description": description},
        )
        assert messages(base) == []


@pytest.mark.parametrize(
    ("body", "description"),
    [
        ({"chat_id": 0}, "Bad Request: message text is empty"),
        ({"chat_id": 0, "text": ""}, "Bad Request: message text is empty"),
        ({"chat_id": 0, "text": 7}, "Bad Request: message text is empty"),
        ({"chat_id": 0, "text": "x" * 4097}, "Bad Request: message is too long"),
        # alerts.md §4.1: plain text, with no parse_mode.
        (
            {"chat_id": 0, "text": "x", "parse_mode": "HTML"},
            "Bad Request: the stand-in takes plain text, with no parse_mode",
        ),
        (["not", "an", "object"], "Bad Request: the body isn't a JSON object"),
    ],
)
def test_what_the_bot_api_would_refuse_is_refused(body: Any, description: str) -> None:
    with running() as base:
        assert call("POST", f"{base}/botstandin/sendMessage", body) == (
            400,
            {"ok": False, "error_code": 400, "description": description},
        )
        assert messages(base) == []


def test_a_message_of_exactly_4096_characters_is_kept() -> None:
    with running() as base:
        assert send(base, "x" * 4096)[0] == 200


def test_the_body_is_json() -> None:
    with running() as base:
        url = f"{base}/botstandin/sendMessage"
        assert call("POST", url, raw=b"{not json")[0] == 400
        status, body = call(
            "POST",
            url,
            raw=b"chat_id=0&text=x",
            content_type="application/x-www-form-urlencoded",
        )
        assert (status, body["description"]) == (
            400,
            "Bad Request: the stand-in takes JSON",
        )
        too_big = json.dumps(
            {"chat_id": 0, "text": "x" * (standin.MAX_BODY + 1)}
        ).encode()
        assert call("POST", url, raw=too_big)[0] == 413
        assert messages(base) == []


def test_health_unknown_paths_and_methods() -> None:
    with running() as base:
        assert call("GET", f"{base}/healthz") == (200, {"ok": True})
        assert call("GET", f"{base}/nothing")[0] == 404
        assert call("GET", f"{base}/botstandin/getUpdates")[0] == 404
        # sendMessage is a POST, and GET /messages a read: neither takes the other method.
        assert call("GET", f"{base}/botstandin/sendMessage")[0] == 405
        assert call("POST", f"{base}/messages", {})[0] == 405
        assert call("DELETE", f"{base}/messages")[0] == 405


def test_the_store_keeps_the_newest_messages_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(standin, "MAX_MESSAGES", 3)
    with running() as base:
        for n in range(5):
            assert send(base, f"alert {n}")[0] == 200
        kept = messages(base)
    assert [m["text"] for m in kept] == ["alert 2", "alert 3", "alert 4"]
    assert [m["message_id"] for m in kept] == [3, 4, 5]


def test_its_log_holds_neither_a_token_nor_a_text() -> None:
    log = io.StringIO()
    with running(log) as base:
        send(base, "canary-text-4b1f", token=OTHER_TOKEN)
        send(base, "canary-text-77d2")
        call("GET", f"{base}/messages")
        call("GET", f"{base}/bot{OTHER_TOKEN}/nothing")
    lines = log.getvalue()
    assert "POST /bot<token>/sendMessage 401" in lines
    assert "POST /bot<token>/sendMessage 200 message 1" in lines
    assert "GET /messages 200" in lines
    for secret in (OTHER_TOKEN, "canary-text"):
        assert secret not in lines


def test_it_never_opens_a_connection_of_its_own() -> None:
    """It forwards nothing (plan §2): it imports no client, only the standard library's server side."""
    tree = ast.parse(SCRIPT.read_text(encoding="utf-8"))
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module)
    assert imported <= {
        "__future__",
        "argparse",
        "collections",
        "datetime",
        "http",
        "http.server",
        "json",
        "re",
        "signal",
        "sys",
        "threading",
        "time",
        "typing",
        "urllib.parse",
    }, imported


def test_it_runs_by_path_and_stops_on_sigterm() -> None:
    # As PID 1 in its container, it needs its own SIGTERM handler, or docker stop waits 10 s and kills it.
    process = subprocess.Popen(
        [sys.executable, "-I", "-B", str(SCRIPT), "--host", "127.0.0.1", "--port", "0"],
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        assert process.stderr is not None
        first = process.stderr.readline()
        match = re.search(r"listening on 127\.0\.0\.1:(\d+)", first)
        assert match, first
        assert call("GET", f"http://127.0.0.1:{match.group(1)}/healthz") == (
            200,
            {"ok": True},
        )
        process.send_signal(signal.SIGTERM)
        assert process.wait(timeout=5) == 0
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()


def test_the_compose_health_check_passes_against_it_and_fails_without_it() -> None:
    """deploy/compose.yaml's health check, run as written, but at this test's port."""
    compose = yaml.safe_load(
        (REPO / "deploy" / "compose.yaml").read_text(encoding="utf-8")
    )
    check = compose["services"]["telegram-standin"]["healthcheck"]["test"]
    assert check[:4] == ["CMD", "python3", "-I", "-c"]
    with running() as base:
        port = base.rsplit(":", 1)[1]
        script = check[4].replace("127.0.0.1:8080", f"127.0.0.1:{port}")
        assert script != check[4]
        assert (
            subprocess.run(
                [sys.executable, "-I", "-c", script], timeout=10, check=False
            ).returncode
            == 0
        )
    # The stand-in has stopped: the same check fails.
    assert (
        subprocess.run(
            [sys.executable, "-I", "-c", script], timeout=10, check=False
        ).returncode
        != 0
    )


# Spec 011 (FR-041; its plan §8.1, D12): the stand-in checks message entities as the Bot API does, and as the gateway's
# own check does (FR-009, FR-010), so every dev-cpu run holds the designed messages to a second implementation of the
# rules; it counts a text's length in UTF-16 code units, as the Bot API does, and keeps each message's entities and
# its link-preview flag.
ENTITIES_REFUSED = (
    400,
    {
        "ok": False,
        "error_code": 400,
        "description": "Bad Request: can't parse entities",
    },
)
# Two units each in UTF-16: the severity's emoji the designs lead with.
RED = "\U0001f534"


def send_entities(
    base: str, text: str, entities: Any, **more: Any
) -> tuple[int, Any]:
    return call(
        "POST",
        f"{base}/botstandin/sendMessage",
        {"chat_id": 0, "text": text, "entities": entities, **more},
    )


def test_entities_are_accepted_kept_and_returned_with_the_preview_flag() -> None:
    text = f"{RED} Critical · [dev-cpu]\nKILL SWITCH\nid dev-cpu:trip:day:2026-10-22"
    entities = [
        {"type": "bold", "offset": 3, "length": 8},
        {"type": "pre", "offset": 24, "length": 11},
        {"type": "code", "offset": 39, "length": 27},
    ]
    with running() as base:
        status, body = send_entities(
            base, text, entities, disable_web_page_preview=True
        )
        assert status == 200 and body["ok"] is True
        assert send(base, "a plain alert")[0] == 200
        kept = messages(base)
    assert kept[0]["entities"] == entities
    assert kept[0]["disable_web_page_preview"] is True
    assert kept[1]["entities"] == []
    assert kept[1]["disable_web_page_preview"] is False


@pytest.mark.parametrize(
    "entities",
    [
        "bold",  # not a list
        [["bold", 0, 1]],  # not an object
        [{"type": "url", "offset": 0, "length": 2}],  # a fifth type: links
        [{"type": "text_link", "offset": 0, "length": 2, "url": "x"}],
        [{"type": "spoiler", "offset": 0, "length": 2}],
        [{"type": "pre", "offset": 0, "length": 2, "language": "ts"}],  # no language
        [{"type": "bold", "offset": -1, "length": 2}],
        [{"type": "bold", "offset": 0, "length": 0}],
        [{"type": "bold", "offset": 0.5, "length": 2}],
        [{"type": "bold", "offset": True, "length": 2}],
        [{"type": "bold", "offset": 0, "length": 99}],  # past the text's UTF-16 length
        [{"type": "bold", "offset": 1, "length": 2}],  # starts inside the emoji's pair
        [{"type": "bold", "offset": 0, "length": 1}],  # ends inside it
        [
            {"type": "bold", "offset": 3, "length": 8},
            {"type": "code", "offset": 5, "length": 2},
        ],  # an overlap
        [
            {"type": "code", "offset": 12, "length": 2},
            {"type": "bold", "offset": 3, "length": 3},
        ],  # out of order
    ],
)
def test_an_invalid_entity_list_is_refused_as_the_bot_api_refuses_it(
    entities: Any,
) -> None:
    with running() as base:
        assert send_entities(base, f"{RED} Critical · KILL", entities) == ENTITIES_REFUSED
        assert messages(base) == []


def test_a_texts_length_is_counted_in_utf16_code_units() -> None:
    with running() as base:
        # 4,096 units with emoji in them: kept; one unit more: refused.
        assert send(base, RED * 2 + "x" * 4092)[0] == 200
        assert send(base, RED * 2 + "x" * 4093) == (
            400,
            {"ok": False, "error_code": 400, "description": "Bad Request: message is too long"},
        )
        # Under 4,096 code points, over 4,096 units: refused, as the Bot API counts.
        assert len(RED * 2100) == 2100
        assert send(base, RED * 2100)[0] == 400
        assert len(messages(base)) == 1


def test_parse_mode_is_still_refused_beside_entities() -> None:
    with running() as base:
        status, body = send_entities(
            base, "x", [{"type": "bold", "offset": 0, "length": 1}], parse_mode="HTML"
        )
        assert status == 400 and "parse_mode" in body["description"]
        assert messages(base) == []


def test_its_log_holds_no_text_or_entity_of_a_designed_message() -> None:
    log = io.StringIO()
    with running(log) as base:
        send_entities(
            base,
            "secret-ish designed text",
            [{"type": "bold", "offset": 0, "length": 6}],
        )
    written = log.getvalue()
    assert "secret-ish" not in written and '"bold"' not in written
    assert "POST /bot<token>/sendMessage 200" in written
