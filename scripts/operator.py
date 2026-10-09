#!/usr/bin/env python3
"""The operator CLI (spec 000 FR-030, FR-031, FR-034; contracts/operator-admin.md §6; data-model.md §5, §8).

    python3 -I -B -X pycache_prefix=/dev/null scripts/operator.py --stack prod|dev|dev-cpu [--json] COMMAND ...

    mint     write ~/.config/h4reet-ai/operator/<stack>.token (prod, dev) and print its SHA-256   make operator-token
    status   GET /admin/status, as a summary                                                     make operator-status
    init     POST /admin/init: --reason TEXT [--renew] [--confirm-zero]                          make operator-init
             [--day-usd X] [--month-usd X] [--fallback-today-usd X]

It runs in the Author's terminal with the operator token, so it is standard library only, and it runs by path
through PY_HOST, never with -m: -I keeps out PYTHON* variables, the user's site directory, and the script's own
directory, and with the bytecode cache under /dev/null no planted __pycache__ runs (research.md R-16, R-35).

The token:
  - prod and dev: ~/.config/h4reet-ai/operator/<stack>.token, a regular file (never a link) that is yours, of mode
    0600 or 0400, in a directory of mode 0700;
  - dev-cpu: the committed public dummy, H4_DEVCPU_OPERATOR_TOKEN in deploy/env.agents/dev-cpu.vars, parsed as
    KEY=VALUE data (contracts/env-files.md §1.1) and never sourced;
  - --token-stdin: one line on standard input, which is how the CLI inside the dev-cpu hop gets it.
It never comes from the environment or the command line, and it is never printed: only its fingerprint is, the
first 8 hex characters of its SHA-256.

The transport: http://127.0.0.1:18003 (prod), 18103 (dev), or 18303 (dev-cpu), through urllib with an empty
ProxyHandler, so no proxy setting can carry the token, and with redirects refused, so it goes nowhere else.
  - --url may name 127.0.0.1 or localhost at the stack's own port and no other, since another port may be another
    stack's listener (18303 is dev-cpu's, whose gateway agents build); localhost is connected as 127.0.0.1, never
    looked up. Or, for dev or dev-cpu with --token-stdin only, a single-label in-network host, inside a container on
    the stack's network.
  - An answer whose stack field names another stack, or a status that names none, came from another listener, and
    is no usable answer.
  - Inside the sandbox, which can't reach 18303, dev-cpu without --url makes one hop: the CLI runs again in a
    one-off breach-probe container on the stack's internal network, with the dummy on standard input, through
    deploy/agents-engine/docker-relay, so on the agents' engine only. Outside the sandbox there is no hop and no
    Docker: docker there is the host's rootful engine, where agent-written images must never run (FR-039), so
    dev-cpu goes straight to 127.0.0.1:18303.

Exit codes (§6.2): 0 done; 1 the gateway refused (a 4xx other than 401); 2 usage; 3 authentication failed (401);
4 no usable answer (nothing listening, a timeout, a redirect, a 5xx, a body that isn't a JSON object, or another
stack's answer); 5 a token problem. On any failure the last line names the code and its meaning, because make
reports every failure as its own error 2.

Other tools (evals/run.py, evals/breach.py) load this file by path for AdminClient and AdminError, so the token is
handled in this one reviewed file.
"""

from __future__ import annotations

import argparse
import base64
import contextlib
import errno
import hashlib
import http.client
import json
import os
import re
import secrets
import stat
import subprocess
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from pathlib import Path
from typing import Any, NoReturn, TextIO

ROOT = Path(__file__).resolve().parents[1]
DEVCPU_VARS = ROOT / "deploy" / "env.agents" / "dev-cpu.vars"
# The dev-cpu hop's image (tasks.md T144).
PROBE_DOCKERFILE = ROOT / "evals" / "Dockerfile.probe"
RELAY = ROOT / "deploy" / "agents-engine" / "docker-relay"

STACKS = ("prod", "dev", "dev-cpu")
# The token's prefix is h4op_<scope>_ (data-model.md §5).
SCOPES = {"prod": "prod", "dev": "dev", "dev-cpu": "devcpu"}
# Each stack's x003, on the host's 127.0.0.1 (operator-admin.md §1).
ADMIN_PORTS = {"prod": 18003, "dev": 18103, "dev-cpu": 18303}
# The admin listener, from inside the stack's network.
IN_NETWORK_PORT = 8081  # the admin listener inside the stack (operator-admin.md §1)
HOP_URL = f"http://gateway:{IN_NETWORK_PORT}"
TIMEOUT_S = 30
MAX_BODY = 4 * 1024 * 1024
# The stated starting values of init (operator-admin.md §2.3): the body's key, and the CLI's flag.
STATED = (
    ("day_usd", "--day-usd"),
    ("month_usd", "--month-usd"),
    ("fallback_today_usd", "--fallback-today-usd"),
)
USD_RE = re.compile(r"[0-9]+(\.[0-9]{1,6})?")
# A compose service name. It starts with a letter, so the resolver can never read it as an address (2130706433).
LABEL_RE = re.compile(r"[a-z]([a-z0-9-]{0,61}[a-z0-9])?")
ADAPTER_ID_RE = re.compile(r"[a-z][a-z0-9_-]{0,63}")
KEY_RE = re.compile(r"[A-Z][A-Z0-9_]*")
# What the dev-cpu hop's docker client keeps from this environment: what docker and the relay need, and none of the
# COMPOSE_*, H4_*, or template keys that compose would let override the env file (contracts/env-files.md §10, P5).
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
    1: "the gateway refused the request",
    2: "usage",
    3: "authentication failed: check the token file against the env file's OPERATOR_TOKEN_SHA256",
    4: "no usable answer from the admin listener",
    5: "a token problem",
}

Runner = Callable[[list[str], str, dict[str, str]], tuple[int, str]]


class Usage(ValueError):
    """Exit 2: bad arguments."""


class TokenProblem(Exception):
    """Exit 5: the token's file or line is missing, unsafe, or malformed. The message never holds the token."""


class AdminError(Exception):
    """Any answer but a 2xx JSON object, or no answer at all (status None).

    It holds the HTTP status, the body's error, field, and detail, and the error body itself, which by contract
    carries no payload (operator-admin.md §5). It never holds the token or the request.
    """

    def __init__(
        self,
        status: int | None,
        error: str,
        detail: str | None = None,
        field: str | None = None,
        body: dict[str, Any] | None = None,
    ) -> None:
        self.status = status
        self.error = clean(error)
        super().__init__(status, self.error)
        self.detail = clean(detail) if detail else None
        self.field = clean(field) if field else None
        self.body = body

    def __str__(self) -> str:
        if self.status is None:
            return self.detail or self.error
        text = f"HTTP {self.status} {self.error}"
        if self.field:
            text += f" (field {self.field})"
        if self.detail:
            text += f": {self.detail}"
        return text


def clean(value: str, limit: int = 300) -> str:
    """A string from the listener, safe for a terminal: control characters become ?, and it is cut at limit."""
    out = "".join("?" if unicodedata.category(ch) == "Cc" else ch for ch in value)
    return out if len(out) <= limit else out[: limit - 1] + "…"


# --- the token ----------------------------------------------------------------------------------------------------


def check_token(text: str, stack: str, source: str) -> str:
    """The token in text, which may end with one newline, if it is this stack's (data-model.md §5)."""
    scope = SCOPES[stack]
    value = text.removesuffix("\n")
    if not re.fullmatch(rf"h4op_{scope}_[A-Za-z0-9_-]{{43}}", value):
        raise TokenProblem(
            f"{source} doesn't hold a {stack} operator token: h4op_{scope}_ and 43 base64url characters"
        )
    return value


def token_path(stack: str, home: Path) -> Path:
    return home / ".config" / "h4reet-ai" / "operator" / f"{stack}.token"


def check_private_dir(path: Path) -> None:
    """A directory of ours, mode 0700, and not a link."""
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode):
        raise TokenProblem(f"{path} isn't a directory")
    if info.st_uid != os.getuid():
        raise TokenProblem(f"{path} belongs to another user")
    if stat.S_IMODE(info.st_mode) != 0o700:
        raise TokenProblem(
            f"{path} is mode {stat.S_IMODE(info.st_mode):04o}; it must be 0700 (chmod 700 it yourself)"
        )


def check_token_file(path: Path, info: os.stat_result) -> None:
    if stat.S_ISLNK(info.st_mode):
        raise TokenProblem(
            f"{path} is a symbolic link; the token must be the file itself"
        )
    if not stat.S_ISREG(info.st_mode):
        raise TokenProblem(f"{path} isn't a regular file")
    if info.st_uid != os.getuid():
        raise TokenProblem(f"{path} belongs to another user")
    file_mode = stat.S_IMODE(info.st_mode)
    if file_mode not in (0o600, 0o400):
        raise TokenProblem(
            f"{path} is mode {file_mode:04o}; it must be 0600 or 0400 (chmod 600 it yourself)"
        )


def read_token_file(stack: str, home: Path) -> str:
    """prod's or dev's token, from its file, which is checked before it is opened and again once it is."""
    path = token_path(stack, home)
    missing = f"{path} is missing: make operator-token ENV={stack} mints it"
    if not os.path.lexists(path.parent):
        raise TokenProblem(missing)
    check_private_dir(path.parent)
    try:
        check_token_file(path, path.lstat())
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC)
    except FileNotFoundError:
        raise TokenProblem(missing) from None
    except OSError as error:
        if error.errno == errno.ELOOP:
            raise TokenProblem(
                f"{path} is a symbolic link; the token must be the file itself"
            ) from None
        raise TokenProblem(f"{path} can't be read: {error.strerror}") from None
    try:
        check_token_file(path, os.fstat(fd))  # the file opened is the file checked
        data = os.read(fd, 256)
    finally:
        os.close(fd)
    return check_token(data.decode("ascii", errors="replace"), stack, str(path))


def parse_env(text: str) -> tuple[dict[str, str], list[str]]:
    """KEY=VALUE data with the env files' grammar (contracts/env-files.md §1.1), as preflight parses it."""
    values: dict[str, str] = {}
    errors: list[str] = []
    for number, raw in enumerate(text.splitlines(), 1):
        line = raw.rstrip("\r")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, sep, value = line.partition("=")
        if not sep or not KEY_RE.fullmatch(key):
            errors.append(
                f"line {number}: not KEY=VALUE (no export, no spaces around =)"
            )
            continue
        if key in values:
            errors.append(f"line {number}: {key} appears twice")
            continue
        if value.startswith("'"):
            if len(value) < 2 or not value.endswith("'") or "'" in value[1:-1]:
                errors.append(
                    f"line {number}: {key}: an unterminated or nested single quote"
                )
                continue
            value = value[1:-1]
        elif re.search(r"[\s$\"'`\\#]", value):
            errors.append(
                f"line {number}: {key}: whitespace, $, a quote, a backslash, or # outside single quotes"
            )
            continue
        if "${" in value:
            errors.append(f"line {number}: {key}: ${{...}} inside a value")
            continue
        values[key] = value
    return values, errors


def read_devcpu_token(path: Path) -> str:
    """dev-cpu's public dummy, read from its committed file as data."""
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as error:
        raise TokenProblem(f"{path} can't be read: {error}") from None
    values, errors = parse_env(text)
    if errors:
        raise TokenProblem(f"{path}: {'; '.join(errors)} (contracts/env-files.md §1.1)")
    if "H4_DEVCPU_OPERATOR_TOKEN" not in values:
        raise TokenProblem(f"{path} has no H4_DEVCPU_OPERATOR_TOKEN")
    return check_token(
        values["H4_DEVCPU_OPERATOR_TOKEN"],
        "dev-cpu",
        f"{path}'s H4_DEVCPU_OPERATOR_TOKEN",
    )


def read_token_line(stack: str, stream: TextIO) -> str:
    """One line on standard input (--token-stdin)."""
    return check_token(stream.readline(256), stack, "standard input")


# --- what the CLI sends ---------------------------------------------------------------------------------------------


def check_reason(reason: str) -> str:
    """The reason rule (operator-admin.md §1.2): 10 to 500 code points once trimmed, no control characters."""
    text = reason.strip()
    if any(unicodedata.category(ch) == "Cc" for ch in text):
        raise Usage(
            "the reason can't hold control characters, newlines included (contracts/operator-admin.md §1.2)"
        )
    if not 10 <= len(text) <= 500:
        raise Usage(
            f"the reason is 10 to 500 characters once trimmed, not {len(text)} (contracts/operator-admin.md §1.2)"
        )
    return text


def check_usd(label: str, value: str) -> str:
    """A stated value: a decimal string, at least 0, with at most 6 decimal places, sent as it is written."""
    if not USD_RE.fullmatch(value):
        raise Usage(
            f"{label} is an amount in USD, at least 0, with at most 6 decimal places, such as 1.20"
        )
    return value


def check_url(url: str, stack: str, *, token_stdin: bool) -> str:
    """stack's admin listener: on this host, at the stack's own port, or, for the CLI inside a container on a dev-class
    stack's network, a service name.

    Any other port on this host may be another stack's listener: 18303 is dev-cpu's, whose gateway agents build, so a
    prod or dev token must never go there. No prod caller runs in a container, so prod never takes a service name
    (T056's review).
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
        if port != ADMIN_PORTS[stack]:
            raise Usage(
                f"--url on this host names {stack}'s own admin port, {ADMIN_PORTS[stack]}: a token goes to no "
                "other port, where another stack's listener may answer"
            )
        # localhost is connected as 127.0.0.1, where edge publishes, and never looked up: a lookup may give ::1
        # first, where none of the stack's listeners is (T056's review, round 2).
        return f"http://127.0.0.1:{port}"
    elif not LABEL_RE.fullmatch(host):
        raise Usage(
            "--url names 127.0.0.1 or localhost, or, for dev or dev-cpu with --token-stdin, a single-label "
            "in-network host"
        )
    elif stack == "prod":
        raise Usage(
            f"--url for prod names 127.0.0.1 or localhost, at port {ADMIN_PORTS['prod']}: no prod caller runs in "
            "a container on prod's network"
        )
    elif not token_stdin:
        raise Usage(
            "--url names an in-network host, which only the CLI inside a container on the stack's network "
            "calls, with the token on --token-stdin; from this host the admin listener is 127.0.0.1"
        )
    elif port != IN_NETWORK_PORT:
        raise Usage(
            f"--url's in-network host is the admin listener, at port {IN_NETWORK_PORT}: a token goes to no other"
        )
    return f"http://{host}" + (f":{port}" if port is not None else "")


# --- the admin listener -------------------------------------------------------------------------------------------


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """The admin listener never redirects; an answer that does is no answer, and the token follows no Location."""

    def redirect_request(self, *args: Any, **kwargs: Any) -> None:
        return None


def parse_body(raw: bytes) -> Any:
    if len(raw) > MAX_BODY:
        return None
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None


def failure_reason(failure: BaseException) -> str:
    reason = getattr(failure, "reason", failure)
    return str(getattr(reason, "strerror", None) or reason or type(failure).__name__)


class AdminClient:
    """One stack's admin listener (operator-admin.md §1-§5), with that stack's token, read as §6 says.

    adapter_complete is for other tools (evals/run.py's bedrock adapter, evals/breach.py): every answer but a 2xx
    JSON object raises AdminError, with .status and .error, and so does one that names another stack.
    """

    def __init__(
        self,
        stack: str,
        *,
        url: str | None = None,
        token_stdin: bool = False,
        stdin: TextIO | None = None,
        home: Path | None = None,
    ) -> None:
        if stack not in STACKS:
            raise Usage(f"the stack is prod, dev, or dev-cpu, not {stack!r}")
        if os.environ.get("SANDBOX_RUNTIME") == "1" and stack != "dev-cpu":
            raise Usage(
                f"{stack} is the Author's: agent sessions reach dev-cpu's admin listener only (FR-008)"
            )
        self.stack = stack
        self.url = (
            f"http://127.0.0.1:{ADMIN_PORTS[stack]}"
            if url is None
            else check_url(url, stack, token_stdin=token_stdin)
        )
        if token_stdin:
            token = read_token_line(stack, stdin if stdin is not None else sys.stdin)
        elif stack == "dev-cpu":
            token = read_devcpu_token(DEVCPU_VARS)
        else:
            token = read_token_file(stack, home if home is not None else Path.home())
        self.fingerprint = hashlib.sha256(token.encode("utf-8")).hexdigest()[:8]
        self._authorization = f"Bearer {token}"
        self._opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), _NoRedirect()
        )

    def __repr__(self) -> str:
        return f"AdminClient(stack={self.stack!r}, url={self.url!r}, fingerprint={self.fingerprint!r})"

    def request(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
        *,
        names_stack: bool = False,
    ) -> dict[str, Any]:
        """One call, and its answer: a 2xx JSON object, or AdminError.

        An answer whose stack field names another stack came from another stack's listener, so it is no usable
        answer; with names_stack, so is one with no stack field. The name the answer gave is never shown.
        """
        data = None if body is None else json.dumps(body).encode("utf-8")
        request = urllib.request.Request(self.url + path, data=data, method=method)
        request.add_header("Accept", "application/json")
        if data is not None:
            request.add_header("Content-Type", "application/json")
        # Unredirected: urllib would copy an ordinary header onto a redirect's request.
        request.add_unredirected_header("Authorization", self._authorization)
        try:
            with self._opener.open(request, timeout=TIMEOUT_S) as response:
                status, raw = response.status, response.read(MAX_BODY + 1)
        except urllib.error.HTTPError as answer:
            status, raw = answer.code, b""
            with contextlib.suppress(OSError, http.client.HTTPException):
                raw = answer.read(MAX_BODY + 1)
            answer.close()
            raise self.refusal(status, raw) from None
        except (urllib.error.URLError, OSError, http.client.HTTPException) as failure:
            raise AdminError(
                None,
                "unreachable",
                f"can't reach {self.url}: {failure_reason(failure)}",
            ) from None
        parsed = parse_body(raw)
        if not isinstance(parsed, dict) or not 200 <= status < 300:
            raise AdminError(status, "not_json", "the answer isn't a JSON object")
        if (names_stack or "stack" in parsed) and parsed.get("stack") != self.stack:
            raise AdminError(
                status,
                "wrong_stack",
                f"the answer at {self.url} doesn't say it comes from {self.stack}'s admin listener, so the CLI "
                "doesn't use it",
            )
        return parsed

    @staticmethod
    def refusal(status: int, raw: bytes) -> AdminError:
        if 300 <= status < 400:
            return AdminError(
                status,
                "redirect",
                "the admin listener never redirects, so the CLI doesn't follow it",
            )
        parsed = parse_body(raw)
        fields = parsed if isinstance(parsed, dict) else {}
        error = fields.get("error")
        detail = fields.get("detail")
        field = fields.get("field")
        return AdminError(
            status,
            error if isinstance(error, str) and error else f"http_{status}",
            detail if isinstance(detail, str) else None,
            field if isinstance(field, str) else None,
            fields or None,
        )

    def status(self) -> dict[str, Any]:
        """GET /admin/status (operator-admin.md §4.1), whose answer always names its stack."""
        return self.request("GET", "/admin/status", names_stack=True)

    def init(
        self,
        reason: str,
        *,
        stated: dict[str, str] | None = None,
        confirm_zero: bool = False,
        renew: bool = False,
    ) -> dict[str, Any]:
        """POST /admin/init (operator-admin.md §2.3; data-model.md §8)."""
        body: dict[str, Any] = {"reason": check_reason(reason)}
        keys = dict(STATED)
        if stated:
            unknown = sorted(set(stated) - set(keys))
            if unknown:
                raise Usage(
                    f"init states day_usd, month_usd, and fallback_today_usd, not {unknown}"
                )
            body["stated"] = {
                key: check_usd(keys[key], value) for key, value in stated.items()
            }
        body["confirm_zero"] = confirm_zero
        body["renew"] = renew
        return self.request("POST", "/admin/init", body)

    def adapter_complete(
        self,
        adapter_id: str,
        messages: list[dict[str, str]],
        *,
        max_output_tokens: int,
        purpose: str,
        reason: str,
        temperature: float | None = None,
    ) -> dict[str, Any]:
        """POST /admin/adapters/{id}/complete (operator-admin.md §5): the 200 body, with the answer in result.text."""
        if not ADAPTER_ID_RE.fullmatch(adapter_id):
            raise Usage("an adapter ID is lowercase letters, digits, - and _")
        body: dict[str, Any] = {
            "messages": messages,
            "max_output_tokens": max_output_tokens,
            "purpose": purpose,
            "reason": check_reason(reason),
        }
        if temperature is not None:
            body["temperature"] = temperature
        return self.request("POST", f"/admin/adapters/{adapter_id}/complete", body)


# --- mint (§6) ------------------------------------------------------------------------------------------------------


def ensure_private_dir(path: Path) -> None:
    """Create path at 0700 if it is missing; refuse one with another owner or a looser mode."""
    try:
        path.mkdir(mode=0o700)
    except FileExistsError:
        check_private_dir(path)
        return
    os.chmod(path, 0o700)  # mkdir's mode passes through the umask


def fsync_dir(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def write_new(path: Path, text: str) -> None:
    """A new file of mode 0600, never through a link and never over a file, flushed to disk with its directory."""
    fd = os.open(
        path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600
    )
    try:
        os.fchmod(fd, 0o600)
        data = text.encode("ascii")
        while data:
            data = data[os.write(fd, data) :]
        os.fsync(fd)
    finally:
        os.close(fd)
    fsync_dir(path.parent)


def mint(stack: str, home: Path, *, as_json: bool) -> int:
    if stack == "dev-cpu":
        raise Usage(
            "dev-cpu's token is the committed public dummy, H4_DEVCPU_OPERATOR_TOKEN in "
            "deploy/env.agents/dev-cpu.vars: there is nothing to mint"
        )
    if os.environ.get("SANDBOX_RUNTIME") == "1":
        raise Usage(
            "mint runs in the Author's terminal: agent sessions never hold an operator token (FR-007)"
        )
    base = home / ".config" / "h4reet-ai"
    path = base / "operator" / f"{stack}.token"
    try:
        base.parent.mkdir(parents=True, exist_ok=True)
        # The base holds the env files too, and make init-env holds it to 0700 (contracts/env-files.md §9.1).
        ensure_private_dir(base)
        ensure_private_dir(path.parent)
        if os.path.lexists(path):
            raise TokenProblem(
                f"{path} exists; to rotate, delete it first, then mint again (data-model.md §5)"
            )
        random_part = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=")
        token = f"h4op_{SCOPES[stack]}_" + random_part.decode("ascii")
        write_new(path, token + "\n")
    except OSError as error:
        raise TokenProblem(
            f"{path} can't be written: {error.strerror or error}"
        ) from None
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    if as_json:
        print(
            json.dumps(
                {"path": str(path), "sha256": digest, "fingerprint": digest[:8]},
                indent=2,
            )
        )
        return 0
    print(f"token: {path} (mode 0600; the token itself is never printed)")
    print(f"sha256: {digest}")
    print(f"fingerprint: {digest[:8]}")
    print(
        f"next: Set OPERATOR_TOKEN_SHA256={digest} in ~/.config/h4reet-ai/env/{stack}.env, then run "
        f"make up ENV={stack}, which recreates the gateway with the new hash."
    )
    return 0


# --- summaries ------------------------------------------------------------------------------------------------------


def obj(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def text(value: object) -> str:
    if value is None or value == "":
        return "-"
    return clean(str(value))


def usd(micro: object) -> str:
    """Integer micro-USD as USD: cents always, and every digit that isn't 0, so nothing is rounded away."""
    if not isinstance(micro, int) or isinstance(micro, bool):
        return "?"
    whole, fraction = divmod(abs(micro), 1_000_000)
    digits = f"{fraction:06d}".rstrip("0").ljust(2, "0")
    return f"{'-' if micro < 0 else ''}{whole}.{digits}"


def seconds(value: object) -> str:
    stamp = text(value)
    match = re.fullmatch(r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?Z", stamp)
    return match.group(1) + "Z" if match else stamp


def minutes(value: object) -> str:
    stamp = text(value)
    match = re.fullmatch(r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2}(\.\d+)?)?Z", stamp)
    return match.group(1) + "Z" if match else stamp


def row(label: str, amount: str, details: list[str]) -> str:
    return f"{label:<15}{amount:<17} ({', '.join(details)})"


def status_lines(stack: str, body: dict[str, Any]) -> list[str]:
    """§6's summary of GET /admin/status: the state, the three meters, and the adapters, then what needs a look.

    It names the CLI's own stack, never the answer's stack field, in its first line and in the command it suggests.
    """
    head = f"{stack}  state {text(body.get('state'))}"
    if body.get("since"):
        head += f" since {seconds(body['since'])}"
    crossed = body.get("crossed")
    if isinstance(crossed, list) and crossed:
        head += f" (crossed {', '.join(text(c) for c in crossed)})"
    parts = [head, f"store {text(body.get('store'))}"]
    if body.get("degraded_cause"):
        parts.append(f"cause {text(body['degraded_cause'])}")
    machinery = obj(body.get("test_machinery"))
    when = f"time {seconds(body.get('time'))}"
    if machinery.get("clock_offset_ms"):
        when += f" (real {seconds(body.get('real_time'))})"
    parts.append(when)
    lines = [" · ".join(parts)]

    meters = obj(body.get("meters"))
    if not meters:
        lines.append(f"{'meters':<15}none while the store is {text(body.get('store'))}")
    else:
        for key in ("day", "month"):
            meter = obj(meters.get(key))
            details = [f"warning {usd(meter.get('warn_micro_usd'))}"]
            if meter.get("reserved_micro_usd"):
                details.append(f"reserved {usd(meter.get('reserved_micro_usd'))}")
            amount = f"{usd(meter.get('spent_micro_usd'))} / {usd(meter.get('ceiling_micro_usd'))} USD"
            lines.append(row(key, amount, details))
        meter = obj(meters.get("fallback_day"))
        details = [
            f"grant {text(meter.get('grant'))}",
            f"warning {usd(meter.get('warn_micro_usd'))}",
        ]
        if meter.get("reserved_micro_usd"):
            details.append(f"reserved {usd(meter.get('reserved_micro_usd'))}")
        details.append(f"available {usd(meter.get('available_micro_usd'))}")
        fallback = obj(body.get("fallback"))
        awaiting = fallback.get("awaiting_renewal")
        renewal = "no" if awaiting is False else "-"
        if awaiting is True:
            renewal = "yes"
            if fallback.get("awaiting_since"):
                renewal += f", since {seconds(fallback['awaiting_since'])}"
        amount = f"{usd(meter.get('spent_micro_usd'))} / {usd(meter.get('allowance_micro_usd'))} USD"
        lines.append(
            row("fallback today", amount, details) + f" · awaiting renewal: {renewal}"
        )

    names = []
    for adapter in body.get("adapters") or []:
        if not isinstance(adapter, dict):
            continue
        healthy = adapter.get("healthy") is True
        item = f"{text(adapter.get('id'))} {'healthy' if healthy else 'unhealthy'}"
        if not healthy and adapter.get("reason"):
            item += f" ({text(adapter['reason'])})"
        if adapter.get("credentials_expire_at"):
            item += f", SSO session ends {minutes(adapter['credentials_expire_at'])}"
        names.append(item)
    lines.append(f"{'adapters':<15}{' · '.join(names) if names else 'none'}")

    journal = obj(body.get("journal"))
    if journal.get("status") not in (None, "ok"):
        where = f" ({text(journal['file'])})" if journal.get("file") else ""
        lines.append(f"{'journal':<15}{text(journal.get('status'))}{where}")
    alerts = obj(body.get("alerts"))
    pending, failed = alerts.get("pending"), alerts.get("failed_last_24h")
    if pending or failed:
        lines.append(
            f"{'alerts':<15}{text(pending or 0)} pending, {text(failed or 0)} failed in the last 24 h"
        )
    if machinery.get("clock") or machinery.get("synthetic"):
        clock = "on" if machinery.get("clock") else "off"
        if machinery.get("clock_offset_ms"):
            clock += f" (offset {text(machinery['clock_offset_ms'])} ms)"
        synthetic = "on" if machinery.get("synthetic") else "off"
        lines.append(f"{'test machinery':<15}clock {clock} · synthetic {synthetic}")
    if body.get("store") == "uninitialized":
        lines.append(
            f'{"next":<15}make operator-init ENV={stack} REASON="<why, at least 10 characters>", adding '
            "CONFIRM_ZERO=1 only if no earlier record survives, and RENEW=1 to grant today's fallback"
        )
    return lines


def sources(meter: dict[str, Any]) -> str:
    found = obj(meter.get("sources"))
    stated = found.get("stated")
    return (
        f"ledger {usd(found.get('ledger'))}, journal {usd(found.get('journal'))}, "
        f"stated {'none' if stated is None else usd(stated)}"
    )


def init_lines(stack: str, body: dict[str, Any]) -> list[str]:
    """A summary of POST /admin/init's answer: each meter with its candidates by source (data-model.md §8).

    Like status_lines, it names the CLI's own stack, never the answer's.
    """
    periods = obj(body.get("periods"))
    head = f"{stack}  initialized · audit #{text(body.get('audit_id'))} · state {text(body.get('state'))}"
    lines = [
        f"{head} · periods {text(periods.get('day'))} and {text(periods.get('month'))}"
    ]
    meters = obj(body.get("meters"))
    for key in ("day", "month"):
        meter = obj(meters.get(key))
        amount = f"{usd(meter.get('spent_micro_usd'))} USD"
        lines.append(f"{key:<15}{amount:<17} ({sources(meter)})")
    meter = obj(meters.get("fallback_day"))
    grant = text(meter.get("grant"))
    amount = f"{usd(meter.get('spent_micro_usd'))} / {usd(meter.get('allowance_micro_usd'))} USD"
    lines.append(
        f"{'fallback today':<15}{amount:<17} (grant {grant}; {sources(meter)})"
    )
    journal = obj(body.get("journal"))
    files = journal.get("files_read")
    count = len(files) if isinstance(files, list) else 0
    lines.append(
        f"{'journal':<15}{count} file{'' if count == 1 else 's'} read, {text(journal.get('records'))} records, "
        f"{text(journal.get('lines_skipped'))} lines skipped"
    )
    if body.get("fallback_awaiting_renewal") is False:
        renewed = (
            f"renewed: grant {grant} passes today"
            if body.get("renewed")
            else "not awaiting renewal"
        )
        lines.append(f"{'fallback':<15}{renewed}")
    else:
        lines.append(
            f'{"fallback":<15}awaiting renewal: refused until make operator-renew ENV={stack} REASON="..."'
        )
    if body.get("confirm_zero") is True:
        lines.append(f"{'confirm zero':<15}yes: no earlier records and nothing stated")
    if body.get("clock_offset_ms") is not None:
        lines.append(
            f"{'test clock':<15}offset {text(body['clock_offset_ms'])} ms, restored from the journal"
        )
    return lines


# --- the CLI --------------------------------------------------------------------------------------------------------


class Parser(argparse.ArgumentParser):
    """argparse, with its errors as exit 2 and the last line naming it, like every other failure."""

    def error(self, message: str) -> NoReturn:
        self.print_usage(sys.stderr)
        raise Usage(message)


def build_parser() -> Parser:
    # The common options go before the command or after it: the dev-cpu hop puts them first.
    common = Parser(add_help=False, allow_abbrev=False)
    common.add_argument("--stack", choices=STACKS, default=argparse.SUPPRESS)
    common.add_argument(
        "--json",
        action="store_true",
        default=argparse.SUPPRESS,
        help="print the response body instead of a summary",
    )
    common.add_argument(
        "--url",
        default=argparse.SUPPRESS,
        help="the admin listener: 127.0.0.1 or localhost, at the stack's own port (for dev and dev-cpu with "
        "--token-stdin, an in-network host too)",
    )
    common.add_argument(
        "--token-stdin",
        action="store_true",
        default=argparse.SUPPRESS,
        help="read the token from one line on standard input (the dev-cpu hop)",
    )
    parser = Parser(
        prog="operator.py",
        description="The operator CLI (contracts/operator-admin.md §6).",
        parents=[common],
        allow_abbrev=False,
    )
    commands = parser.add_subparsers(dest="command", required=True, metavar="COMMAND")
    commands.add_parser(
        "mint",
        parents=[common],
        allow_abbrev=False,
        help="write ~/.config/h4reet-ai/operator/STACK.token (prod, dev) and print its SHA-256",
    )
    commands.add_parser(
        "status", parents=[common], allow_abbrev=False, help="GET /admin/status"
    )
    init = commands.add_parser(
        "init",
        parents=[common],
        allow_abbrev=False,
        help="POST /admin/init: initialize an empty store",
    )
    init.add_argument("--reason", required=True, help="why: 10 to 500 characters")
    init.add_argument(
        "--renew",
        action="store_true",
        help="renew the fallback sub-budget in the same action",
    )
    init.add_argument(
        "--confirm-zero",
        action="store_true",
        help="start at 0 when no record survives and nothing is stated",
    )
    for _, flag in STATED:
        init.add_argument(flag, help="a stated starting value, in USD")
    return parser


def failed(code: int, message: str = "") -> int:
    if message:
        print(f"operator.py: {message}", file=sys.stderr)
    print(f"operator.py: exit {code}: {EXIT_MEANINGS[code]}", file=sys.stderr)
    return code


def exit_code(problem: AdminError) -> int:
    if problem.status == 401:
        return 3
    if problem.status is not None and 400 <= problem.status < 500:
        return 1
    return 4


def refused(problem: AdminError, client: AdminClient, as_json: bool) -> int:
    if as_json and problem.body is not None:
        print(json.dumps(problem.body, indent=2))
    message = str(problem)
    if problem.status == 401:
        message += (
            f" (the token's fingerprint is {client.fingerprint}; the env file's OPERATOR_TOKEN_SHA256 "
            "must start with it)"
        )
    return failed(exit_code(problem), message)


def init_arguments(args: argparse.Namespace) -> tuple[str, dict[str, str]]:
    stated = {
        key: check_usd(flag, getattr(args, key))
        for key, flag in STATED
        if getattr(args, key) is not None
    }
    return check_reason(args.reason), stated


def run_hop(
    command: list[str], stdin_text: str, env: dict[str, str]
) -> tuple[int, str]:
    """The hop, for real: the probe's standard output passes straight through, and its standard error line by
    line, keeping the last line, where the CLI inside names its exit code."""
    last = ""
    with subprocess.Popen(
        command,
        stdin=subprocess.PIPE,
        stderr=subprocess.PIPE,
        encoding="utf-8",
        errors="replace",
        env=env,
    ) as process:
        if process.stdin is not None:
            with contextlib.suppress(BrokenPipeError):
                process.stdin.write(stdin_text)
                process.stdin.close()
        for line in process.stderr or ():
            sys.stderr.write(line)
            if line.strip():
                last = line.strip()
        code = process.wait()
    return code, last


def hop(
    args: argparse.Namespace,
    reason: str | None,
    stated: dict[str, str],
    as_json: bool,
    runner: Runner,
) -> int:
    """dev-cpu from an agent session: the CLI again, in a one-off breach-probe container on the stack's network.

    It runs only inside the sandbox, and only through the relay, so only on the agents' engine. From the Author's
    terminal, docker is the host's rootful engine, where agent-written images must never be built or run (FR-039),
    and a hop there would skip preflight's P11; main goes straight to 127.0.0.1:18303 instead (T056's review).
    """
    if not PROBE_DOCKERFILE.is_file():
        return failed(
            4,
            "inside the sandbox, dev-cpu's admin listener is reached through the breach-probe container, built "
            "from evals/Dockerfile.probe, which this tree lacks (tasks.md T144 adds it); run this from the "
            "Author's terminal, which reaches http://127.0.0.1:18303 directly",
        )
    token = read_devcpu_token(DEVCPU_VARS)
    inner = ["--stack", "dev-cpu", "--url", HOP_URL, "--token-stdin"]
    inner += ["--json"] if as_json else []
    inner.append(args.command)
    if args.command == "init":
        inner.append(f"--reason={reason}")
        inner += ["--renew"] if args.renew else []
        inner += ["--confirm-zero"] if args.confirm_zero else []
        inner += [f"{flag}={stated[key]}" for key, flag in STATED if key in stated]
    command = [
        str(RELAY),
        "docker",
        "compose",
        "-p",
        "h4reet-dev-cpu",
        "-f",
        str(ROOT / "deploy" / "compose.yaml"),
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
        "/app/operator.py",
        *inner,
    ]
    env = {key: os.environ[key] for key in HOP_ENV if key in os.environ}
    env["LC_ALL"] = "C"
    try:
        code, last = runner(command, token + "\n", env)
    except OSError as error:
        return failed(
            4, f"the dev-cpu hop couldn't run {command[0]}: {error.strerror or error}"
        )
    if code == 0:
        return 0
    if code in EXIT_MEANINGS and last.startswith(f"operator.py: exit {code}: "):
        return code  # the CLI in the probe named its code, as its last line
    return failed(
        4,
        f"the dev-cpu hop exited {code} before the CLI in the probe container answered",
    )


def main(
    argv: list[str] | None = None,
    *,
    stdin: TextIO | None = None,
    runner: Runner | None = None,
) -> int:
    try:
        args = build_parser().parse_args(argv)
    except Usage as problem:
        return failed(2, str(problem))
    stack = getattr(args, "stack", None)
    as_json = bool(getattr(args, "json", False))
    url = getattr(args, "url", None)
    token_stdin = bool(getattr(args, "token_stdin", False))
    try:
        if stack is None:
            raise Usage("--stack prod|dev|dev-cpu is required")
        if args.command == "mint":
            if url is not None or token_stdin:
                raise Usage(
                    "mint calls nothing, so it takes neither --url nor --token-stdin"
                )
            return mint(stack, Path.home(), as_json=as_json)
        reason, stated = init_arguments(args) if args.command == "init" else (None, {})
        sandboxed = os.environ.get("SANDBOX_RUNTIME") == "1"
        if stack == "dev-cpu" and url is None and not token_stdin and sandboxed:
            return hop(args, reason, stated, as_json, runner or run_hop)
        client = AdminClient(stack, url=url, token_stdin=token_stdin, stdin=stdin)
        try:
            if args.command == "status":
                body = client.status()
                lines = status_lines(stack, body)
            else:
                body = client.init(
                    reason or "",
                    stated=stated,
                    confirm_zero=args.confirm_zero,
                    renew=args.renew,
                )
                lines = init_lines(stack, body)
        except AdminError as problem:
            return refused(problem, client, as_json)
    except Usage as problem:
        return failed(2, str(problem))
    except TokenProblem as problem:
        return failed(5, str(problem))
    print(json.dumps(body, indent=2) if as_json else "\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
