#!/usr/bin/env python3
"""hello's client (spec 000 FR-038; contracts/gateway-http.md §2 and §9; tasks.md T147).

    python3 -I -B -X pycache_prefix=/dev/null scripts/hello.py --stack prod|dev|dev-cpu [--message TEXT]   make hello

It sends POST /hello to the stack's gateway, then prints the status and the body: a JSON body indented, anything else
as text, with the listener's control characters escaped or replaced, so no escape sequence in a model's answer
reaches the terminal. It sends no token, because hello needs none, and no client label. The message, when given, goes
as typed, and the gateway checks it (§2.1); without one the body is {}, and the gateway's default, "Hello.", applies.

Standard library only, run by path through PY_HOST and never with -m (research.md R-35), as the operator CLI is.

Where it goes:
  - from the Author's terminal, straight to the stack's api port on 127.0.0.1: 18000 (prod), 18100 (dev), or 18300
    (dev-cpu, which the agents' engine publishes there). urllib runs with an empty ProxyHandler, so no proxy setting
    carries the message, and refuses redirects, so it goes nowhere else;
  - inside the sandbox (SANDBOX_RUNTIME=1), dev-cpu only. The sandbox can't reach 18300, so the script runs again in a
    one-off breach-probe container on the stack's internal network, always through deploy/agents-engine/docker-relay,
    so only on the agents' engine, and that copy calls http://gateway:8080: the operator CLI's hop
    (contracts/operator-admin.md §6). prod and dev are the Author's, so inside the sandbox they are refused, as make
    hello refuses them;
  - --url names the stack's own api port on 127.0.0.1 or localhost, where no other stack's gateway answers, or, for
    dev and dev-cpu, a single-label in-network host at 8080, which only a copy inside a container on the stack's
    network calls. The hop passes it; make never does.

Exit codes: 0 the stack answered 2xx; 1 it answered with any other status, printed with its body (a degraded 503, a
refusal, a redirect, which is never followed); 2 usage, or prod or dev inside the sandbox; 4 no answer (nothing
listening, a timeout, a dropped connection), or a hop that failed before the copy in the probe answered. On a failure
the last line names the code and its meaning, because make reports every failure as its own error 2; the hop passes
on the code the copy in the probe named.
"""

from __future__ import annotations

import argparse
import contextlib
import http.client
import json
import os
import re
import subprocess
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from pathlib import Path
from typing import Any, NoReturn

ROOT = Path(__file__).resolve().parents[1]
COMPOSE_FILE = ROOT / "deploy" / "compose.yaml"
DEVCPU_VARS = ROOT / "deploy" / "env.agents" / "dev-cpu.vars"
RELAY = ROOT / "deploy" / "agents-engine" / "docker-relay"

STACKS = ("prod", "dev", "dev-cpu")
# Each stack's x000, on the host's 127.0.0.1 (gateway-http.md §1).
API_PORTS = {"prod": 18000, "dev": 18100, "dev-cpu": 18300}
# The gateway's api listener, from inside the stack's network.
IN_NETWORK_PORT = 8080
HOP_URL = f"http://gateway:{IN_NETWORK_PORT}"
# Longer than the gateway's 20 s deadline and edge's 30 s read timeout (gateway-http.md §7): the stack answers first.
TIMEOUT_S = 35
MAX_BODY = 1024 * 1024
# A compose service name. It starts with a letter, so the resolver can never read it as an address (2130706433).
LABEL_RE = re.compile(r"[a-z]([a-z0-9-]{0,61}[a-z0-9])?")
# What the dev-cpu hop's docker client keeps from this environment, as operator.py's does: what docker and the relay
# need, and none of the COMPOSE_*, H4_*, or template keys that compose would let override the env file
# (contracts/env-files.md §10, P5).
HOP_ENV = (
    "PATH",
    "HOME",
    "TMPDIR",
    "SANDBOX_RUNTIME",
    "HTTPS_PROXY",
    "https_proxy",
    "DOCKER_HOST",
    "DOCKER_TLS_VERIFY",
    "DOCKER_CERT_PATH",
    "DOCKER_CONFIG",
    "DOCKER_CONTEXT",
    "BUILDX_CONFIG",
    "XDG_RUNTIME_DIR",
)
EXIT_MEANINGS = {
    1: "the stack answered, but not with a hello answer: its status and body are above",
    2: "usage",
    4: "no answer from the stack's api listener",
}

Runner = Callable[[list[str], dict[str, str]], tuple[int, str]]


class Usage(ValueError):
    """Exit 2: bad arguments."""


class NoAnswer(Exception):
    """Exit 4: nothing answered."""


# --- where it goes ------------------------------------------------------------------------------------------------


def check_url(url: str, stack: str) -> str:
    """stack's api listener: on this host, at the stack's own port, or, for a copy inside a container on a dev-class
    stack's network, a service name at 8080.

    Any other port on this host may be another stack's gateway, and prod's may answer from the fallback, which is
    metered, so a hello for one stack goes to no other's. No prod caller runs in a container, so prod never takes a
    service name.
    """
    try:
        parts = urllib.parse.urlsplit(url)
        port = parts.port
    except ValueError:
        raise Usage("--url isn't a URL with a valid port") from None
    host = parts.hostname or ""
    if (
        parts.scheme != "http"
        or not host
        or parts.username is not None
        or parts.password is not None
        or parts.path not in ("", "/")
        or parts.query
        or parts.fragment
    ):
        raise Usage("--url is http://HOST:PORT, with no path, query, or credentials")
    if host in ("127.0.0.1", "localhost"):
        if port != API_PORTS[stack]:
            raise Usage(
                f"--url on this host names {stack}'s own api port, {API_PORTS[stack]}: a hello for {stack} goes to "
                "no other port, where another stack's gateway may answer"
            )
    elif not LABEL_RE.fullmatch(host):
        raise Usage(
            "--url names 127.0.0.1 or localhost, or, for dev or dev-cpu, a single-label in-network host"
        )
    elif stack == "prod":
        raise Usage(
            f"--url for prod names 127.0.0.1 or localhost, at port {API_PORTS['prod']}: no prod caller runs in a "
            "container on prod's network"
        )
    elif port != IN_NETWORK_PORT:
        raise Usage(
            f"--url's in-network host is the gateway's api listener, at port {IN_NETWORK_PORT}"
        )
    return f"http://{host}" + (f":{port}" if port is not None else "")


def target(stack: str, url: str | None) -> str:
    """Where a hello for stack goes from here: its own api port on 127.0.0.1, or the --url it was given."""
    return (
        f"http://127.0.0.1:{API_PORTS[stack]}" if url is None else check_url(url, stack)
    )


def check_message(message: str) -> str:
    """The message as typed. Bytes that aren't UTF-8 reach argv as lone surrogates, which JSON can't carry as text."""
    try:
        message.encode("utf-8")
    except UnicodeEncodeError:
        raise Usage(
            "the message isn't text: it holds bytes that aren't UTF-8"
        ) from None
    return message


# --- the call -----------------------------------------------------------------------------------------------------


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """The gateway never redirects; an answer that does is printed as it is, and the message follows no Location."""

    def redirect_request(self, *args: Any, **kwargs: Any) -> None:
        return None


def failure_reason(failure: BaseException) -> str:
    reason = getattr(failure, "reason", failure)
    return str(getattr(reason, "strerror", None) or reason or type(failure).__name__)


def send(url: str, message: str | None) -> tuple[int, bytes, bool]:
    """POST /hello at url: the status, the body (at most MAX_BODY bytes), and whether the body was cut."""
    body = {} if message is None else {"message": message}
    request = urllib.request.Request(
        url + "/hello", data=json.dumps(body).encode("utf-8"), method="POST"
    )
    request.add_header("Content-Type", "application/json")
    request.add_header("Accept", "application/json")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())
    try:
        with opener.open(request, timeout=TIMEOUT_S) as response:
            status, raw = response.status, response.read(MAX_BODY + 1)
    except urllib.error.HTTPError as answer:
        status, raw = answer.code, b""
        with contextlib.suppress(OSError, http.client.HTTPException):
            raw = answer.read(MAX_BODY + 1)
        answer.close()
    except (urllib.error.URLError, OSError, http.client.HTTPException) as failure:
        raise NoAnswer(f"can't reach {url}: {failure_reason(failure)}") from None
    return status, raw[:MAX_BODY], len(raw) > MAX_BODY


def is_control(ch: str) -> bool:
    return unicodedata.category(ch) == "Cc"


def render(status: int, raw: bytes) -> str:
    """The status, then the body: JSON indented, with every control character left in it escaped as JSON escapes it
    (only inside strings can one be, so the text stays the same JSON); anything else as text, with control characters
    but newline and tab shown as ?."""
    head = f"HTTP {status}\n"
    if not raw:
        return head
    try:
        parsed = json.loads(raw.decode("utf-8"))
    except ValueError:  # not UTF-8, or not JSON
        text = raw.decode("utf-8", errors="replace").replace("\r\n", "\n")
        text = "".join(
            "?" if is_control(ch) and ch not in "\n\t" else ch for ch in text
        )
        return head + text + ("" if text.endswith("\n") else "\n")
    dumped = json.dumps(parsed, indent=2, ensure_ascii=False)
    escaped = "".join(
        f"\\u{ord(ch):04x}" if is_control(ch) and ch != "\n" else ch for ch in dumped
    )
    return head + escaped + "\n"


# --- the dev-cpu hop ----------------------------------------------------------------------------------------------


def run_hop(command: list[str], env: dict[str, str]) -> tuple[int, str]:
    """The hop, for real: the probe's standard output passes straight through, and its standard error line by line,
    keeping the last line, where the copy inside names its exit code. It gets no input."""
    last = ""
    with subprocess.Popen(
        command,
        stdin=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        encoding="utf-8",
        errors="replace",
        env=env,
    ) as process:
        for line in process.stderr or ():
            sys.stderr.write(line)
            if line.strip():
                last = line.strip()
        code = process.wait()
    return code, last


def hop(message: str | None, runner: Runner) -> int:
    """dev-cpu from an agent session: this script again, in a one-off breach-probe container on the stack's network.

    It runs only inside the sandbox, and only through the relay, so only on the agents' engine. From the Author's
    terminal, docker is the host's rootful engine, where agent-written images must never be built or run (FR-039);
    main goes straight to 127.0.0.1:18300 instead.
    """
    inner = ["--stack", "dev-cpu", "--url", HOP_URL]
    if message is not None:
        # One argument, with =, so a message that starts with - stays a value.
        inner.append(f"--message={message}")
    command = [
        str(RELAY),
        "docker",
        "compose",
        "-p",
        "h4reet-dev-cpu",
        "-f",
        str(COMPOSE_FILE),
        "--env-file",
        str(DEVCPU_VARS),
        "--profile",
        "breach",
        "run",
        "--rm",
        "-T",
        "breach-probe",
        "python3",
        "-I",
        "/app/hello.py",
        *inner,
    ]
    env = {key: os.environ[key] for key in HOP_ENV if key in os.environ}
    env["LC_ALL"] = "C"
    try:
        code, last = runner(command, env)
    except OSError as error:
        return failed(
            4, f"the dev-cpu hop couldn't run {command[0]}: {error.strerror or error}"
        )
    if code == 0:
        return 0
    if code in EXIT_MEANINGS and last.startswith(f"hello.py: exit {code}: "):
        return code  # the copy in the probe named its code, as its last line
    return failed(
        4,
        f"the dev-cpu hop exited {code} before hello.py in the probe container answered",
    )


# --- the CLI ------------------------------------------------------------------------------------------------------


class Parser(argparse.ArgumentParser):
    """argparse, with its errors as exit 2 and the last line naming it, like every other failure."""

    def error(self, message: str) -> NoReturn:
        self.print_usage(sys.stderr)
        raise Usage(message)


def build_parser() -> Parser:
    parser = Parser(
        prog="hello.py",
        description="POST /hello to a stack's gateway, and print the status and the body "
        "(contracts/gateway-http.md §2 and §9).",
        allow_abbrev=False,
    )
    parser.add_argument("--stack", choices=STACKS, required=True)
    parser.add_argument(
        "--message",
        help="the message, sent as typed (1 to 500 characters, which the gateway checks); "
        'without it the gateway answers "Hello."',
    )
    parser.add_argument(
        "--url",
        help="the api listener: 127.0.0.1 or localhost at the stack's own port, or, for dev and dev-cpu, an "
        "in-network host at 8080 (the hop's copy in the probe)",
    )
    return parser


def failed(code: int, message: str = "") -> int:
    if message:
        print(f"hello.py: {message}", file=sys.stderr)
    print(f"hello.py: exit {code}: {EXIT_MEANINGS[code]}", file=sys.stderr)
    return code


def main(argv: list[str] | None = None, *, runner: Runner | None = None) -> int:
    try:
        args = build_parser().parse_args(argv)
        message = None if args.message is None else check_message(args.message)
        sandboxed = os.environ.get("SANDBOX_RUNTIME") == "1"
        if sandboxed and args.stack != "dev-cpu":
            raise Usage(
                f"{args.stack} is the Author's: agent sessions send hello to dev-cpu only (FR-008, FR-039)"
            )
        if sandboxed and args.url is None:
            return hop(message, runner or run_hop)
        url = target(args.stack, args.url)
    except Usage as problem:
        return failed(2, str(problem))
    try:
        status, raw, cut = send(url, message)
    except NoAnswer as problem:
        return failed(4, str(problem))
    sys.stdout.write(render(status, raw))
    sys.stdout.flush()
    if cut:
        print(f"hello.py: the body was cut at {MAX_BODY} bytes", file=sys.stderr)
    return 0 if 200 <= status < 300 else failed(1)


if __name__ == "__main__":
    sys.exit(main())
