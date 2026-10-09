#!/usr/bin/env python3
"""make pin-images, the Author's terminal (spec 000 FR-014; plan §2; research.md R-02 and R-09).

    python3 -I -B -X pycache_prefix=/dev/null deploy/scripts/pin_images.py [--only SERVICE,...]
        [--tag SERVICE=TAG ...] [--dry-run]

For each line of deploy/images.lock it resolves repository:tag to the tag's index digest with
`docker buildx imagetools inspect`, then rewrites the lock and the image: lines of deploy/compose.yaml together,
and prints the table: service, image, the old and new digests (their first 12 hex), and what changed.

- A line whose tag is "-" is still open (seaweedfs, research.md R-09). It gets the newest release tag the
  registry lists, a plain version number such as 3.97, unless --tag SERVICE=TAG names one. The tags come from
  the registry's own API (/v2/<name>/tags/list), with an anonymous token: no credential is ever sent. If no tag
  looks like a release, it prints the newest tags and stops, for the Author to choose (ADR 0022).
- It's all or nothing: if any image fails to resolve, it writes neither file and exits 1, so the lock and the
  compose file never disagree.
- Dockerfile FROM lines aren't rewritten. When a base's digest changes, it names the Dockerfiles that use it;
  the compose policy refuses them until they match the lock (plan §11).

Every call reaches only the registries the lock names (the data-flow disclosure's image-pull row). Exit codes:
0 done, 1 a resolution failed or no release tag was found, 2 usage.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, replace
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCK = "deploy/images.lock"
COMPOSE = "deploy/compose.yaml"
COLUMNS = ("service", "repository", "tag", "digest", "registry", "checked")
DIGEST_RE = re.compile(r"sha256:[0-9a-f]{64}")
RELEASE_RE = re.compile(r"v?(\d+)\.(\d+)(?:\.(\d+))?")
HEADER_RE = re.compile(r"# " + r"\s+".join(COLUMNS) + r"\s*")
TIMEOUT_S = 20


@dataclass(frozen=True)
class Entry:
    service: str
    repository: str
    tag: str
    digest: str
    registry: str
    checked: str

    @property
    def ref(self) -> str:
        return f"{self.repository}:{self.tag}@{self.digest}"


class PinError(Exception):
    pass


# ---------------------------------------------------------------------------------------------------------------
# The lock.


def read_lock(path: Path) -> tuple[list[str], list[Entry]]:
    """The comment lines before the column header, and the entries, in order."""
    header: list[str] = []
    entries: list[Entry] = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if HEADER_RE.fullmatch(line):
            continue  # the column header, which render_lock writes again
        if not line.strip() or line.startswith("#"):
            if not entries:
                header.append(line)
            continue
        fields = line.split()
        if len(fields) != len(COLUMNS):
            raise PinError(
                f"{LOCK} line {number}: expected {len(COLUMNS)} fields, found {len(fields)}"
            )
        entry = Entry(*fields)
        if entry.service in {e.service for e in entries}:
            raise PinError(f"{LOCK} line {number}: {entry.service} appears twice")
        entries.append(entry)
    return header, entries


def render_lock(header: list[str], entries: list[Entry]) -> str:
    rows = [("# " + COLUMNS[0], *COLUMNS[1:])] + [
        (e.service, e.repository, e.tag, e.digest, e.registry, e.checked)
        for e in entries
    ]
    widths = [max(len(row[i]) for row in rows) for i in range(len(COLUMNS) - 1)]
    lines = list(header)
    for row in rows:
        cells = [cell.ljust(widths[i]) for i, cell in enumerate(row[:-1])]
        lines.append("  ".join([*cells, row[-1]]))
    return "\n".join(lines) + "\n"


def registry_of(repository: str) -> str:
    return repository.split("/", 1)[0]


# ---------------------------------------------------------------------------------------------------------------
# Resolving: digests through buildx, tags through the registry's API.


def parse_inspect(text: str) -> str:
    """The index digest from `docker buildx imagetools inspect`'s default output: its first Digest line."""
    for line in text.splitlines():
        if line.startswith("Manifests:"):
            break
        if line.startswith("Digest:"):
            digest = line.split(":", 1)[1].strip()
            if DIGEST_RE.fullmatch(digest):
                return digest
    raise PinError("no index digest in imagetools inspect's output")


def inspect_digest(
    ref: str, run: Callable[..., subprocess.CompletedProcess] = subprocess.run
) -> str:
    done = run(
        ["docker", "buildx", "imagetools", "inspect", ref],
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
    )
    if done.returncode != 0:
        lines = (done.stderr or "").strip().splitlines()
        reason = lines[-1] if lines else f"exit {done.returncode}"
        if "429" in reason or "toomanyrequests" in reason.lower():
            reason = f"HTTP 429, the registry's rate limit: {reason}"
        raise PinError(f"{ref}: {reason}")
    return parse_inspect(done.stdout)


def newest_release(tags: list[str]) -> str | None:
    def version(tag: str) -> tuple[int, int, int] | None:
        found = RELEASE_RE.fullmatch(tag)
        return (int(found[1]), int(found[2]), int(found[3] or 0)) if found else None

    releases = [(version(t), t) for t in tags if version(t)]
    return max(releases)[1] if releases else None


def api_host(repository: str) -> tuple[str, str]:
    host, _, name = repository.partition("/")
    if host == "docker.io":
        host = "registry-1.docker.io"
    return host, name


def anonymous_token(challenge: str, urlopen: Callable) -> str:
    """A pull token for an anonymous client, from a `WWW-Authenticate: Bearer realm=...` challenge."""
    params = dict(re.findall(r'(\w+)="([^"]*)"', challenge))
    realm = params.pop("realm", "")
    if not challenge.lower().startswith("bearer") or not realm.startswith("https://"):
        raise PinError("the registry's token challenge isn't an https Bearer realm")
    url = realm + "?" + urllib.parse.urlencode(params)
    with urlopen(urllib.request.Request(url), timeout=TIMEOUT_S) as response:
        body = json.load(response)
    token = body.get("token") or body.get("access_token")
    if not token:
        raise PinError("the registry gave no anonymous token")
    return token


def list_tags(repository: str, urlopen: Callable = urllib.request.urlopen) -> list[str]:
    host, name = api_host(repository)
    url: str | None = f"https://{host}/v2/{name}/tags/list?n=1000"
    token: str | None = None
    tags: list[str] = []
    while url:
        request = urllib.request.Request(url, headers={"Accept": "application/json"})
        if token:
            request.add_header("Authorization", f"Bearer {token}")
        try:
            with urlopen(request, timeout=TIMEOUT_S) as response:
                body = json.load(response)
                link = response.headers.get("Link") or ""
        except urllib.error.HTTPError as error:
            if error.code == 401 and token is None:
                token = anonymous_token(
                    error.headers.get("WWW-Authenticate") or "", urlopen
                )
                continue
            raise PinError(f"{repository}: listing tags: HTTP {error.code}") from None
        except (urllib.error.URLError, TimeoutError) as error:
            raise PinError(f"{repository}: listing tags: {error}") from None
        tags.extend(body.get("tags") or [])
        found = re.search(r'<([^>]+)>;\s*rel="next"', link)
        url = urllib.parse.urljoin(f"https://{host}/", found[1]) if found else None
    return tags


# ---------------------------------------------------------------------------------------------------------------
# The compose file: only each service's own image: line changes, so comments and layout stay.

SERVICE_RE = re.compile(r"^  ([a-z0-9][a-z0-9-]*):\s*(#.*)?$")
IMAGE_RE = re.compile(r"^(    image:\s*)(\S+)(\s*(#.*)?)$")


def rewrite_compose(
    text: str, pins: dict[str, str]
) -> tuple[str, dict[str, tuple[str, str]]]:
    """The text with each pinned service's image: line set to its pin; and the lines that changed."""
    out, changes = [], {}
    section = service = None
    for line in text.splitlines(keepends=True):
        bare = line.rstrip("\n")
        if re.match(r"^[a-z][a-z0-9_-]*:", bare):
            section, service = bare.split(":", 1)[0], None
        elif section == "services" and (found := SERVICE_RE.match(bare)):
            service = found[1]
        elif (
            section == "services"
            and service in pins
            and (image := IMAGE_RE.match(bare))
            and image[2] != pins[service]
        ):
            changes[service] = (image[2], pins[service])
            line = f"{image[1]}{pins[service]}{image[3]}\n"
        out.append(line)
    return "".join(out), changes


def dockerfiles_using(root: Path, repository: str) -> list[str]:
    users = []
    for path in sorted(root.rglob("*Dockerfile*")):
        if "node_modules" in path.parts or ".git" in path.parts or not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        pattern = rf"^\s*FROM\s+(--\S+\s+)*{re.escape(repository)}[:@]"
        if re.search(pattern, text, re.MULTILINE | re.IGNORECASE):
            users.append(path.relative_to(root).as_posix())
    return users


def atomic_write(path: Path, text: str) -> None:
    """Write through a temp file beside the target, never through a link: deploy/ is agent-writable."""
    tmp = path.with_name(f".{path.name}.pin-images")
    try:
        tmp.unlink()  # a stale temp, or a planted link: removing a link never touches what it names
    except FileNotFoundError:
        pass
    # O_EXCL and O_NOFOLLOW: a link planted again in between makes this fail, rather than write through it.
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(text)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, path)


# ---------------------------------------------------------------------------------------------------------------


def pin(
    root: Path,
    only: set[str] | None,
    tags: dict[str, str],
    dry_run: bool,
    run: Callable = subprocess.run,
    urlopen: Callable = urllib.request.urlopen,
    today: str | None = None,
) -> int:
    today = today or datetime.datetime.now(datetime.UTC).date().isoformat()
    header, entries = read_lock(root / LOCK)
    known = {e.service for e in entries}
    unknown = sorted((only or set()) | set(tags)) and sorted(
        ((only or set()) | set(tags)) - known
    )
    if unknown:
        print(f"pin-images: no {LOCK} line for {', '.join(unknown)}", file=sys.stderr)
        return 2
    updated, rows, failures = [], [], []
    for entry in entries:
        if only and entry.service not in only:
            updated.append(entry)
            continue
        tag = tags.get(entry.service, entry.tag)
        try:
            if tag == "-":
                listed = list_tags(entry.repository, urlopen)
                tag = newest_release(listed) or ""
                if not tag:
                    newest = ", ".join(sorted(listed)[-15:]) or "none"
                    raise PinError(
                        f"no release tag (a plain version such as 3.97) among {len(listed)} tags; the newest by"
                        f" name: {newest}. Choose one with TAG={entry.service}=<tag> (ADR 0022)"
                    )
            digest = inspect_digest(f"{entry.repository}:{tag}", run)
        except (PinError, subprocess.TimeoutExpired) as error:
            failures.append(f"{entry.service}: {error}")
            rows.append(
                (
                    entry.service,
                    f"{entry.repository}:{tag}",
                    entry.digest,
                    "-",
                    "FAILED",
                )
            )
            updated.append(entry)
            continue
        new = replace(
            entry,
            tag=tag,
            digest=digest,
            registry=registry_of(entry.repository),
            checked=today,
        )
        status = (
            "same" if (new.tag, new.digest) == (entry.tag, entry.digest) else "updated"
        )
        if entry.digest == "-":
            status = "pinned"
        rows.append(
            (
                entry.service,
                f"{new.repository}:{new.tag}",
                entry.digest,
                new.digest,
                status,
            )
        )
        updated.append(new)

    def short(digest: str) -> str:
        return digest[7:19] if digest.startswith("sha256:") else digest

    width = max(len(r[1]) for r in rows) if rows else 10
    print(f"{'service':<18} {'image':<{width}} {'was':<12} {'now':<12} status")
    for service, image, was, now, status in rows:
        print(
            f"{service:<18} {image:<{width}} {short(was):<12} {short(now):<12} {status}"
        )
    if failures:
        for failure in failures:
            print(f"FAIL {failure}", file=sys.stderr)
        print(
            f"pin-images: {len(failures)} failed; wrote nothing, so {LOCK} and {COMPOSE} still agree",
            file=sys.stderr,
        )
        return 1

    compose_path = root / COMPOSE
    pins = {e.service: e.ref for e in updated if e.digest != "-"}
    compose_text, changes = rewrite_compose(
        compose_path.read_text(encoding="utf-8"), pins
    )
    for service, (was, now) in sorted(changes.items()):
        print(f"{COMPOSE}: {service}: {was} -> {now}")
    moved = [
        e
        for e, old in zip(updated, entries, strict=True)
        if e.digest != old.digest and ":" in e.service
    ]
    for entry in moved:
        users = dockerfiles_using(root, entry.repository)
        if users:
            print(
                f"update FROM by hand ({entry.service}, now {entry.ref}): {', '.join(users)}"
            )
    if dry_run:
        print("pin-images: dry run, nothing written")
        return 0
    atomic_write(root / LOCK, render_lock(header, updated))
    if changes:
        atomic_write(compose_path, compose_text)
    print(
        f"pin-images: wrote {LOCK}{' and ' + COMPOSE if changes else ''}; review the diff and commit both"
    )
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Resolve deploy/images.lock's tags to index digests."
    )
    parser.add_argument(
        "--only", default="", help="comma-separated services; the default is every line"
    )
    parser.add_argument(
        "--tag",
        action="append",
        default=[],
        metavar="SERVICE=TAG",
        help="pin SERVICE to TAG",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args(argv)
    if os.environ.get("SANDBOX_RUNTIME") == "1":
        print(
            "pin-images runs in the Author's terminal: it reaches registries the sandbox can't",
            file=sys.stderr,
        )
        return 2
    tags = {}
    for item in args.tag:
        service, sep, tag = item.partition("=")
        if not sep or not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9._-]{0,127}", tag):
            print(f"pin-images: --tag {item!r}: SERVICE=TAG", file=sys.stderr)
            return 2
        tags[service] = tag
    only = {s for s in args.only.split(",") if s} or None
    try:
        return pin(args.root.resolve(), only, tags, args.dry_run)
    except (OSError, PinError) as error:
        print(f"pin-images: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
