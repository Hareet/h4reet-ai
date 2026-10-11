#!/usr/bin/env python3
"""make publish-check, the Author's, before the first push (spec 000 FR-042; plan §12; research.md R-36).

    python3 -I -B -X pycache_prefix=/dev/null tools/gates/publish_check.py

Run from anywhere in a full clone's work tree, it certifies the whole history for publication, or says why it can't.
Standard library only.
  1. Secrets: gitleaks over every commit, `gitleaks git --log-opts="--all --text" --redact`, with the main working
     tree's .gitleaks.toml, an empty ignore path, and --ignore-gitleaks-allow. git log's --text makes it read what git
     takes for binary. It refuses while a .gitleaksignore exists at the repository root (or the main working tree's),
     which gitleaks obeys whatever its flags say (research.md R-36). The report goes to a 0700 temporary directory,
     deleted on exit.
  2. The denylist, corpus/intake/private/denylist.txt in the main working tree, read as corpus-check reads it (strip,
     lowercase, skip blank and # lines): against every blob of every commit in `git rev-list --all`, each unique blob
     read once through `git cat-file --batch`; against every path; and against the history's metadata: commit and
     tag messages, author, committer, and tagger names and emails, and tag and ref names.
  3. Currency amounts, with corpus-check's own CURRENCY rule, in corpus/**/*.md outside corpus/intake/private/, line
     by line, in every commit.
A finding names the commit, the path, the line, and the rule or the denylist's line number, never the phrase or the
matching line; a path or a ref name it shows has each phrase replaced by [denylist line N]. Each is attributed to the
first commit (parents before children) and path that hold it, so a line that stays put through later commits is
reported once. Every git and gitleaks call runs with replace refs off and without the caller's GIT_* variables, so
what is scanned is this repository's stored history, not a replacement or another repository.
Exit codes: 0 clean; 1 findings; 3 cannot certify: inside the agent sandbox, in a shallow clone, with gitleaks missing
or not the pinned version, without a readable denylist, or when the scan can't read the whole history. make shows any
non-zero exit as error 2, so the summary line says which it was.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Self

REPO = Path(__file__).resolve().parents[2]
TOOLCHAIN = REPO / ".devcontainer" / "toolchain.vars"
CHECK_CORPUS = REPO / "corpus" / "tools" / "check_corpus.py"
# The denylist, in the main working tree: corpus/intake/private/ is gitignored, so a linked worktree has none.
DENYLIST = Path("corpus", "intake", "private", "denylist.txt")
PRIVATE = "corpus/intake/private/"
CLEAN, FINDINGS, CANNOT_CERTIFY = 0, 1, 3
# gitleaks exits 1 on a fatal error, and 0 when git itself fails under it (it only logs git's error). So findings get
# an exit code of their own, and its log is read for errors.
LEAKS = 99
GITLEAKS_FINE = re.compile(r"^\S+ (?:TRC|DBG|INF|WRN) ")
GITLEAKS_SCANNED = re.compile(r"\b(\d+) commits scanned\b")
VERSION = re.compile(r"(\d+(?:\.\d+)+)")
IDENT = re.compile(r"^(?P<name>.*?) ?<(?P<email>[^<>]*)> -?\d+ [+-]\d{4}$")
LABEL = re.compile(r"\[denylist line \d+\]")
CURRENCY_RULE = "currency amount (corpus-check's rule)"
# Headers that hold object IDs or signatures, not words: a short phrase could match their hex or base64 by chance.
OPAQUE_HEADERS = {"tree", "parent", "object", "type", "gpgsig", "gpgsig-sha256"}


class CannotCertify(Exception):
    """A reason the history can't be certified: exit 3."""


def plural(count: int, noun: str) -> str:
    return f"{count} {noun}{'' if count == 1 else 's'}"


def printable(text: str) -> str:
    """Text from the history, safe for a terminal: control characters shown escaped."""
    return "".join(c if c.isprintable() else repr(c)[1:-1] for c in text)


def decode(data: bytes, encoding: str = "utf-8") -> str:
    try:
        return data.decode(encoding, "replace")
    except LookupError:  # a codec Python knows that isn't a text encoding
        return data.decode("utf-8", "replace")


def last_line(data: bytes) -> str:
    lines = [line for line in decode(data).splitlines() if line.strip()]
    return lines[-1].strip() if lines else "no message"


# --------------------------------------------------------------------------------------------------
# The denylist and the corpus rule, as corpus-check has them
# --------------------------------------------------------------------------------------------------
def read_denylist(path: Path) -> list[tuple[int, str]]:
    """(line number, phrase) for each phrase, read exactly as check_corpus reads the file: strip, lowercase, skip
    blank and # lines. A repeated phrase keeps its first line."""
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise CannotCertify(
            f"the denylist is missing ({path}): without it nothing private can be ruled out"
        ) from None
    except (OSError, UnicodeDecodeError) as exc:
        raise CannotCertify(
            f"the denylist can't be read ({path}: {exc.__class__.__name__})"
        ) from None
    phrases: dict[str, int] = {}
    for number, raw in enumerate(text.splitlines(), 1):
        if raw.strip() and not raw.lstrip().startswith("#"):
            phrases.setdefault(raw.strip().lower(), number)
    if not phrases:
        raise CannotCertify(f"the denylist ({path}) holds no phrases")
    return [(number, phrase) for phrase, number in phrases.items()]


class Denylist:
    """The Author's phrases, matched as corpus-check matches them: the lowercased phrase in the lowercased text."""

    def __init__(self, phrases: list[tuple[int, str]]) -> None:
        self.phrases = phrases
        self.number = {phrase: number for number, phrase in phrases}
        longest = sorted(phrases, key=lambda item: len(item[1]), reverse=True)
        self.pattern = re.compile(
            "|".join(re.escape(phrase) for _, phrase in longest), re.IGNORECASE
        )

    def numbers(self, text: str) -> list[int]:
        low = text.lower()
        return [number for number, phrase in self.phrases if phrase in low]

    def lines(self, text: str) -> list[tuple[int, int, str]]:
        """(denylist line, line number, line) for each line of the text that holds a phrase."""
        low = text.lower()
        present = [(n, phrase) for n, phrase in self.phrases if phrase in low]
        if not present:
            return []
        hits = []
        for number, line in enumerate(text.splitlines(), 1):
            lowered = line.lower()
            hits.extend((n, number, line) for n, phrase in present if phrase in lowered)
        return hits

    def redact(self, text: str) -> str:
        """The text with each phrase shown as [denylist line N]. Where the case-insensitive match and corpus-check's
        lowercasing disagree, so a phrase would survive, the whole text is hidden instead."""
        found = self.numbers(text)
        if not found:
            return text
        shown = self.pattern.sub(
            lambda m: (
                f"[denylist line {self.number.get(m.group(0).lower(), found[0])}]"
            ),
            text,
        )
        if self.numbers(LABEL.sub(" ", shown)):
            return f"[hidden: it holds denylist line {found[0]}]"
        return shown


def corpus_rule() -> re.Pattern[str]:
    """corpus-check's CURRENCY rule, loaded from corpus/tools/check_corpus.py as its own test loads it."""
    try:
        spec = importlib.util.spec_from_file_location(
            "check_corpus_for_publish_check", CHECK_CORPUS
        )
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        rule = module.CURRENCY
    except Exception as exc:  # noqa: BLE001 — loading runs the module: whatever stops it, the rule can't be applied
        raise CannotCertify(
            f"corpus-check's currency rule can't be loaded from {CHECK_CORPUS} ({exc.__class__.__name__})"
        ) from None
    if not isinstance(rule, re.Pattern):
        raise CannotCertify(f"{CHECK_CORPUS}'s CURRENCY isn't a pattern")
    return rule


def public_corpus_markdown(path: str) -> bool:
    return (
        path.startswith("corpus/")
        and path.endswith(".md")
        and not path.startswith(PRIVATE)
    )


# --------------------------------------------------------------------------------------------------
# git and gitleaks
# --------------------------------------------------------------------------------------------------
def scan_env() -> dict[str, str]:
    """The environment for git and gitleaks. No GIT_* variable of the caller's can point them at another repository,
    object store, namespace, or config, nor GITLEAKS_* at another config; replace refs and lazy fetches are off."""
    env = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith(("GIT_", "GITLEAKS_"))
    }
    env.update(
        GIT_NO_REPLACE_OBJECTS="1", GIT_NO_LAZY_FETCH="1", GIT_TERMINAL_PROMPT="0"
    )
    return env


class Git:
    def __init__(self, top: Path, env: dict[str, str]) -> None:
        self.top = top
        self.env = env

    def run(self, *args: str) -> bytes:
        try:
            done = subprocess.run(
                ["git", *args],
                cwd=self.top,
                env=self.env,
                stdin=subprocess.DEVNULL,
                capture_output=True,
                check=False,
            )
        except OSError as exc:
            raise CannotCertify(f"git can't run ({exc.__class__.__name__})") from None
        if done.returncode != 0:
            raise CannotCertify(f"git {args[0]} failed: {last_line(done.stderr)}")
        return done.stdout

    def lines(self, *args: str) -> list[str]:
        return decode(self.run(*args)).splitlines()

    def tree_blobs(self, tree: str) -> list[tuple[str, str]]:
        """(blob, path) for every blob in a tree, recursively. Gitlinks, another repository's commits, are skipped."""
        blobs = []
        for record in self.run("ls-tree", "-r", "-z", tree).split(b"\0"):
            if not record:
                continue
            meta, _, path = record.partition(b"\t")
            _mode, kind, oid = meta.split(b" ")
            if kind == b"blob":
                blobs.append((oid.decode("ascii"), decode(path)))
        return blobs


class Objects:
    """One `git cat-file --batch`: each object read by its ID, in turn."""

    def __init__(self, git: Git) -> None:
        try:
            self.proc = subprocess.Popen(
                ["git", "cat-file", "--batch"],
                cwd=git.top,
                env=git.env,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
            )
        except OSError as exc:
            raise CannotCertify(
                f"git cat-file can't run ({exc.__class__.__name__})"
            ) from None

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *_: object) -> None:
        if self.proc.stdin:
            self.proc.stdin.close()
        self.proc.wait()

    def read(self, oid: str) -> tuple[str, bytes]:
        assert self.proc.stdin and self.proc.stdout
        try:
            self.proc.stdin.write(oid.encode("ascii") + b"\n")
            self.proc.stdin.flush()
            header = self.proc.stdout.readline().split()
            if header[1:] == [b"missing"]:
                raise CannotCertify(
                    f"object {oid[:12]} is missing from this clone (a partial clone?), so it can't be read"
                )
            if len(header) != 3:
                raise CannotCertify(f"git cat-file gave nothing for {oid[:12]}")
            size = int(header[2])
            data = self.proc.stdout.read(size)
            self.proc.stdout.read(1)  # the newline after each object
        except (OSError, ValueError) as exc:
            raise CannotCertify(
                f"git cat-file failed ({exc.__class__.__name__})"
            ) from None
        if len(data) != size:
            raise CannotCertify(f"git cat-file cut object {oid[:12]} short")
        return decode(header[1]), data


def read_pin(path: Path, key: str) -> str:
    """A tool's pin from .devcontainer/toolchain.vars, KEY=VALUE lines read as data."""
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise CannotCertify(
            f"the tool pins can't be read ({path}: {exc.__class__.__name__})"
        ) from None
    for raw in lines:
        name, sep, value = raw.strip().partition("=")
        if sep and name == key and value:
            return value
    raise CannotCertify(f"{path} pins no {key}")


def pinned_gitleaks(env: dict[str, str]) -> tuple[str, str]:
    """gitleaks' path and version, which must be toolchain.vars' pin (the same rule as make toolchain-check)."""
    wanted = read_pin(TOOLCHAIN, "GITLEAKS_VERSION")
    exe = shutil.which("gitleaks", path=env.get("PATH"))
    if exe is None:
        raise CannotCertify(
            "gitleaks isn't installed, so secrets can't be scanned (make tools installs the pinned version)"
        )
    try:
        done = subprocess.run(
            [exe, "version"],
            env=env,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            timeout=60,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise CannotCertify(
            f"gitleaks at {exe} can't say its version ({exc.__class__.__name__})"
        ) from None
    found = VERSION.search(decode(done.stdout + done.stderr))
    version = found.group(1) if found else None
    if (
        done.returncode != 0
        or version is None
        or not (version == wanted or version.startswith(wanted + "."))
    ):
        raise CannotCertify(
            f"gitleaks at {exe} is {version or 'of no version it will say'}, not the pinned {wanted} "
            "(.devcontainer/toolchain.vars; make tools installs it)"
        )
    return exe, version


# --------------------------------------------------------------------------------------------------
# The report
# --------------------------------------------------------------------------------------------------
@dataclass
class Finding:
    oid: str  # the object it's attributed to: a commit, a tag object, or what a ref names
    where: str  # printable already: "notes/draft.md:3", "author email", "commit message:2", "ref refs/heads/x"
    rule: str  # "denylist line 3", "gitleaks rule <id>", or CURRENCY_RULE
    noun: str = "commit"
    more: int = 0  # later objects that hold the same thing (metadata)

    def render(self) -> str:
        tail = (
            f" (and {self.more} more {self.noun}{'s' if self.more > 1 else ''})"
            if self.more
            else ""
        )
        return f"{self.oid[:12]} {self.where}: {self.rule}{tail}"


@dataclass
class Report:
    findings: list[Finding] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)
    deny: Denylist | None = None
    commits: int | None = None
    blobs: int | None = None
    refs: int | None = None
    # gitleaks' version, and how many commits it says it scanned.
    gitleaks: tuple[str, int] | None = None

    def show(self, text: str) -> str:
        return printable(self.deny.redact(text) if self.deny else text)

    def code(self) -> int:
        return CANNOT_CERTIFY if self.reasons else FINDINGS if self.findings else CLEAN

    def summary(self) -> str:
        code = self.code()
        verdict = {CLEAN: "OK", FINDINGS: "FAIL", CANNOT_CERTIFY: "CANNOT CERTIFY"}[
            code
        ]
        parts = []
        if self.blobs is not None:
            parts.append(
                f"{plural(self.commits or 0, 'commit')}, {plural(self.blobs, 'blob')}, "
                f"{plural(self.refs or 0, 'ref')}"
            )
            if self.gitleaks:
                version, scanned = self.gitleaks
                parts.append(f"gitleaks {version} scanned {plural(scanned, 'commit')}")
            if self.deny:
                parts.append(
                    f"denylist applied ({plural(len(self.deny.phrases), 'phrase')})"
                )
            parts.append(plural(len(self.findings), "problem"))
        if self.reasons:
            parts.append("; ".join(self.show(reason) for reason in self.reasons))
        return f"publish-check: {verdict} (exit {code}) — " + "; ".join(parts)


def scan_secrets(
    exe: str, version: str, top: Path, config: Path, env: dict[str, str], report: Report
) -> list[tuple[str, str, int, str]]:
    """gitleaks over every commit: (commit, file, line, rule) for each finding. A run that may have read less than
    the whole history, which gitleaks doesn't always say with its exit code, is a reason it can't certify."""
    findings: list[tuple[str, str, int, str]] = []
    try:
        # mkdtemp's directory is 0700, and it raises rather than return an empty path (research.md R-35).
        holder = tempfile.TemporaryDirectory(prefix="publish-check-")
    except OSError as exc:
        report.reasons.append(
            f"there is no temporary directory for gitleaks' report ({exc.__class__.__name__})"
        )
        return findings
    with holder as work:  # deleted on exit, with the report
        empty = Path(work, "empty")
        empty.mkdir(mode=0o700)
        path = Path(work, "report.json")
        argv = [
            exe, "git", "--log-opts=--all --text", "--redact", "--no-banner", "--no-color",
            "--config", str(config), "--gitleaks-ignore-path", str(empty), "--ignore-gitleaks-allow",
            "--report-format", "json", "--report-path", str(path), "--exit-code", str(LEAKS), str(top),
        ]  # fmt: skip
        # git log's --text: without it git shows no diff for what it takes for binary, a file with a NUL byte or one a
        # -diff attribute marks in any .gitattributes in the work tree, even an untracked one, and gitleaks reads only
        # what git shows. gitleaks splits --log-opts at its spaces.
        try:
            # It runs from the empty directory too: gitleaks' default ignore path is the working directory.
            done = subprocess.run(
                argv,
                cwd=empty,
                env=env,
                stdin=subprocess.DEVNULL,
                capture_output=True,
                check=False,
            )
        except OSError as exc:
            report.reasons.append(f"gitleaks can't run ({exc.__class__.__name__})")
            return findings
        log = decode(done.stderr)
        errors = [
            line
            for line in log.splitlines()
            if line.strip() and not GITLEAKS_FINE.match(line)
        ]
        if errors:
            report.reasons.append(
                f"gitleaks reported errors, so its scan may be partial: {errors[0].strip()}"
            )
        if done.returncode not in (0, LEAKS):
            report.reasons.append(f"gitleaks exited {done.returncode}")
        scanned = GITLEAKS_SCANNED.search(log)
        if scanned is None:
            report.reasons.append("gitleaks didn't say how many commits it scanned")
        else:
            report.gitleaks = (version, int(scanned.group(1)))
        try:
            entries = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            if done.returncode in (0, LEAKS):
                report.reasons.append("gitleaks' report can't be read")
            return findings
    if not isinstance(entries, list):
        report.reasons.append("gitleaks' report isn't a list of findings")
        return findings
    if done.returncode in (0, LEAKS) and (done.returncode == LEAKS) != bool(entries):
        report.reasons.append(
            f"gitleaks exited {done.returncode} with {plural(len(entries), 'finding')} in its report"
        )
    for entry in entries:
        try:
            item = (entry["Commit"], entry["File"], entry["StartLine"], entry["RuleID"])
        except (TypeError, KeyError):
            report.reasons.append("gitleaks' report holds an entry it can't read")
            continue
        if not all(
            isinstance(value, str) for value in item[:2] + item[3:]
        ) or not isinstance(item[2], int):
            report.reasons.append("gitleaks' report holds an entry it can't read")
            continue
        findings.append(item)
    return findings


# --------------------------------------------------------------------------------------------------
# The history: every commit's blobs and paths, its metadata, and the refs
# --------------------------------------------------------------------------------------------------
def parse_object(raw: bytes) -> tuple[list[tuple[str, str]], str]:
    """A commit's or tag's headers, (key, value) with continuation lines joined, and its message, decoded with the
    object's own encoding header when Python knows it."""
    head, _, body = raw.partition(b"\n\n")
    encoding = "utf-8"
    for line in head.split(b"\n"):
        if line.startswith(b"encoding "):
            encoding = decode(line[len(b"encoding ") :]).strip() or "utf-8"
            try:
                "".encode(encoding)
            except LookupError:
                encoding = "utf-8"
    headers: list[tuple[str, str]] = []
    for line in head.split(b"\n"):
        if line.startswith(b" ") and headers:
            key, value = headers[-1]
            headers[-1] = (key, value + "\n" + decode(line[1:], encoding))
        else:
            key, _, value = line.partition(b" ")
            headers.append((decode(key), decode(value, encoding)))
    return headers, decode(body, encoding)


def header(headers: list[tuple[str, str]], key: str) -> str | None:
    return next((value for name, value in headers if name == key), None)


def metadata(
    headers: list[tuple[str, str]], body: str, kind: str
) -> list[tuple[str, str, str]]:
    """(where, field, text) for each part of a commit or tag object that a phrase could be in. Findings are the same
    when their field and text are, whichever line of the message holds them."""
    fields = []
    for key, value in headers:
        if key in OPAQUE_HEADERS:
            continue
        if key in ("author", "committer", "tagger"):
            ident = IDENT.match(value)
            if ident:
                fields.append((f"{key} name", f"{key} name", ident["name"]))
                fields.append((f"{key} email", f"{key} email", ident["email"]))
                continue
        name = "tag name" if key == "tag" else f"{kind} header {key}"
        fields.append((name, name, value))
    for number, line in enumerate(body.splitlines(), 1):
        fields.append((f"{kind} message:{number}", f"{kind} message", line))
    return fields


class Scanner:
    def __init__(
        self,
        git: Git,
        objects: Objects,
        deny: Denylist,
        currency: re.Pattern[str],
        report: Report,
    ) -> None:
        self.git = git
        self.objects = objects
        self.deny = deny
        self.currency = currency
        self.report = report
        self.blobs: dict[
            str, tuple[list[tuple[int, int, str]], list[tuple[int, str]]]
        ] = {}
        self.nonempty = 0
        self.paths: set[str] = set()
        self.reported: set[tuple[object, ...]] = set()
        self.meta: dict[tuple[str, str, int], Finding] = {}
        self.tags: dict[str, str] = {}  # tag object -> the type it finally names

    def add(self, finding: Finding) -> None:
        self.report.findings.append(finding)

    def commits(self, shas: list[str]) -> None:
        trees: set[str] = set()
        for sha in shas:
            kind, raw = self.objects.read(sha)
            if kind != "commit":
                raise CannotCertify(f"{sha[:12]} is a {kind}, not a commit")
            headers, body = parse_object(raw)
            self.check_metadata(sha, metadata(headers, body, "commit"), "commit")
            tree = header(headers, "tree")
            if tree is None:
                raise CannotCertify(f"commit {sha[:12]} names no tree")
            if tree in trees:  # an earlier commit has every path and blob of it
                continue
            trees.add(tree)
            for oid, path in self.git.tree_blobs(tree):
                self.check_path(sha, path)
                self.check_blob(sha, oid, path)

    def check_metadata(
        self, oid: str, fields: list[tuple[str, str, str]], noun: str
    ) -> None:
        for where, name, text in fields:
            for number in self.deny.numbers(text):
                key = (name, text, number)
                if key in self.meta:
                    self.meta[key].more += 1
                    continue
                finding = Finding(oid, where, f"denylist line {number}", noun)
                self.meta[key] = finding
                self.add(finding)

    def check_path(self, sha: str, path: str) -> None:
        if path in self.paths:
            return
        self.paths.add(path)
        for number in self.deny.numbers(path):
            self.add(
                Finding(
                    sha, f"path {self.report.show(path)}", f"denylist line {number}"
                )
            )

    def check_blob(self, sha: str, oid: str, path: str) -> None:
        hits = self.blobs.get(oid)
        if hits is None:  # each unique blob is read once, and both rules run on it then
            kind, data = self.objects.read(oid)
            if kind != "blob":
                raise CannotCertify(
                    f"{oid[:12]} at {self.report.show(path)} is a {kind}, not a blob"
                )
            self.nonempty += bool(data)
            text = decode(data)
            money = [
                (n, line)
                for n, line in enumerate(text.splitlines(), 1)
                if self.currency.search(line)
            ]
            hits = self.blobs[oid] = (self.deny.lines(text), money)
        phrases, money = hits
        for denylist_line, number, line in phrases:
            key = ("denylist", denylist_line, path, line)
            if key not in self.reported:
                self.reported.add(key)
                self.add(
                    Finding(
                        sha,
                        f"{self.report.show(path)}:{number}",
                        f"denylist line {denylist_line}",
                    )
                )
        if public_corpus_markdown(path):
            for number, line in money:
                key = ("currency", path, line)
                if key not in self.reported:
                    self.reported.add(key)
                    self.add(
                        Finding(
                            sha, f"{self.report.show(path)}:{number}", CURRENCY_RULE
                        )
                    )

    def peel(self, oid: str, kind: str) -> str:
        """The type a ref finally names, through any tags; each tag object's metadata is checked once."""
        chain = []
        while kind == "tag":
            if oid in self.tags:
                kind = self.tags[oid]
                break
            chain.append(oid)
            if len(chain) > 100:
                raise CannotCertify("a chain of more than 100 tags")
            _, raw = self.objects.read(oid)
            headers, body = parse_object(raw)
            self.check_metadata(oid, metadata(headers, body, "tag"), "tag")
            oid, kind = header(headers, "object") or "", header(headers, "type") or "?"
        for tag in chain:
            self.tags[tag] = kind
        return kind

    def refs(self) -> int:
        """Each ref's name, and the tags it names; a ref that names no commit at last is out of gitleaks' reach."""
        count = 0
        for line in self.git.lines(
            "for-each-ref", "--format=%(objectname) %(objecttype) %(refname)"
        ):
            oid, kind, name = line.split(" ", 2)
            count += 1
            for number in self.deny.numbers(name):
                self.add(
                    Finding(
                        oid,
                        f"ref {self.report.show(name)}",
                        f"denylist line {number}",
                        "ref",
                    )
                )
            final = self.peel(oid, kind)
            if final != "commit":
                self.report.reasons.append(
                    f"ref {name} names a {final} outside every commit, which gitleaks' scan of the commits "
                    "can't read: delete the ref, or point it at a commit"
                )
        return count


def certify(cwd: Path, report: Report) -> None:
    if os.environ.get("SANDBOX_RUNTIME") == "1":
        raise CannotCertify(
            "it runs inside the agent sandbox (SANDBOX_RUNTIME=1): publish-check is the Author's, in a full clone"
        )
    env = scan_env()
    try:
        top = Path(Git(cwd, env).lines("rev-parse", "--show-toplevel")[0])
        common = Path(
            Git(cwd, env).lines(
                "rev-parse", "--path-format=absolute", "--git-common-dir"
            )[0]
        )
    except (CannotCertify, IndexError) as exc:
        raise CannotCertify(f"{cwd} isn't inside a git work tree ({exc})") from None
    main_tree = common.parent
    git = Git(top, env)
    if git.lines("rev-parse", "--is-shallow-repository") != ["false"]:
        raise CannotCertify(
            "the clone is shallow, so part of the history isn't here to scan: run it in a full clone"
        )
    for root in dict.fromkeys((top, main_tree)):
        if os.path.lexists(root / ".gitleaksignore"):
            raise CannotCertify(
                f"a .gitleaksignore exists at {root}, and gitleaks obeys it whatever its flags say "
                "(research.md R-36): remove it"
            )
    config = main_tree / ".gitleaks.toml"
    if not config.is_file():
        raise CannotCertify(
            f"there is no .gitleaks.toml in the main working tree, {main_tree} (the early patch adds it, tasks.md T045)"
        )
    exe, version = pinned_gitleaks(env)
    report.deny = deny = Denylist(read_denylist(main_tree / DENYLIST))
    currency = corpus_rule()

    shas = git.lines("rev-list", "--all", "--topo-order", "--reverse")
    report.commits = len(shas)
    secrets = scan_secrets(exe, version, top, config, env, report)
    order = {sha: index for index, sha in enumerate(shas)}
    for commit, path, line, rule in sorted(
        secrets, key=lambda s: (order.get(s[0], len(order)), s[1], s[2], s[3])
    ):
        report.findings.append(
            Finding(
                commit,
                f"{report.show(path)}:{line}",
                f"gitleaks rule {printable(rule)}",
            )
        )
    with Objects(git) as objects:
        scanner = Scanner(git, objects, deny, currency, report)
        scanner.commits(shas)
        report.refs = scanner.refs()
    report.blobs = len(scanner.blobs)
    if report.gitleaks and report.gitleaks[1] == 0 and scanner.nonempty:
        report.reasons.append(
            "gitleaks scanned no commits, though the history holds content"
        )


def main(argv: list[str] | None = None) -> int:
    argparse.ArgumentParser(
        description="Certify the whole history for publication: secrets, denylisted phrases, and corpus amounts "
        "(spec 000 FR-042; plan §12). Exit 0 clean, 1 findings, 3 cannot certify."
    ).parse_args(argv)
    report = Report()
    try:
        certify(Path.cwd(), report)
    except CannotCertify as exc:
        report.reasons.append(str(exc))
    except Exception as exc:  # noqa: BLE001 — a crash must read as exit 3, never as 1 (findings), with a summary line
        # The class alone: the message could quote a blob, and a blob can hold a secret.
        report.reasons.append(f"publish-check itself failed ({exc.__class__.__name__})")
    for finding in report.findings:
        print(finding.render())
    print(report.summary())
    return report.code()


if __name__ == "__main__":
    sys.exit(main())
