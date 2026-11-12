#!/usr/bin/env python3
"""The plan block's redaction, and its check (spec 001 contracts/infra-records.md §2; September's §2 at 00309c47;
research.md R-13; FR-005, FR-010). Human-only, from the guard patch P-1.

    terraform show -no-color <plan> | python3 -I -B -X pycache_prefix=/dev/null tools/gates/infra_redact.py \\
        [--redact-file infra/<root>/redact.txt]
    python3 -I -B -X pycache_prefix=/dev/null tools/gates/infra_redact.py --check FILE|-

The filter, which the Author's make plan runs on the saved plan's text before it prints the block:
  - every run of exactly 12 digits becomes <account> (ARNs, registry hosts, and principals among them);
  - every email address becomes <email>;
  - Terraform's own "(sensitive value)" and "(sensitive)" become <redacted>, and so does the value of every attribute
    the root's redact.txt names (one name a line; # starts a comment), on the line that sets or changes it;
  - then, if the text still matches a secret pattern (an AWS access key ID, a private key, an operator token, an
    Anthropic key, a Telegram bot token), it refuses: it prints nothing on stdout, a line naming the kind and the line
    number on stderr, and exits 3. The gate's gitleaks scan reads the note the block lands in as well.

--check reads a block's text and prints "line N: <kind>" for each 12-digit run, email address, or secret pattern, never
the value: the gate's infra-plan-note step runs it on every block. Exit codes: 0 clean; 1 findings (--check); 2 it
couldn't run; 3 refused.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ACCOUNT = re.compile(r"(?<![0-9])[0-9]{12}(?![0-9])")
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
SENSITIVE = re.compile(r"\((?:sensitive value|sensitive)\)")
SECRETS = (
    ("an AWS access key ID", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("a private key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("an operator token", re.compile(r"h4op_[A-Za-z0-9_-]{8,}")),
    ("an Anthropic key", re.compile(r"sk-ant-[A-Za-z0-9_-]{8,}")),
    ("a Telegram bot token", re.compile(r"\b[0-9]{8,10}:[A-Za-z0-9_-]{35}\b")),
)


class Refused(ValueError):
    """The text still holds a secret pattern after redaction. The message names its kind and line, never the value."""


def read_names(path: Path) -> set[str]:
    names = set()
    for raw in path.read_text(encoding="utf-8").splitlines():
        name = raw.split("#", 1)[0].strip()
        if name:
            names.add(name)
    return names


def secret_hits(text: str) -> list[tuple[int, str]]:
    hits = []
    for number, line in enumerate(text.splitlines(), 1):
        for kind, pattern in SECRETS:
            if pattern.search(line):
                hits.append((number, kind))
                break
    return hits


def redact(text: str, names: set[str] | frozenset[str] = frozenset()) -> str:
    out = ACCOUNT.sub("<account>", text)
    out = EMAIL.sub("<email>", out)
    out = SENSITIVE.sub("<redacted>", out)
    if names:
        alternatives = "|".join(re.escape(n) for n in sorted(names))
        attribute = re.compile(
            rf'^(\s*[+~-]?\s*"?(?:{alternatives})"?\s*=\s*).*$', re.MULTILINE
        )
        out = attribute.sub(lambda m: m.group(1) + "<redacted>", out)
    hits = secret_hits(out)
    if hits:
        number, kind = hits[0]
        raise Refused(f"line {number}: {kind}")
    return out


def check(text: str) -> list[tuple[int, str]]:
    found = []
    for number, line in enumerate(text.splitlines(), 1):
        if ACCOUNT.search(line):
            found.append((number, "a 12-digit run"))
        if EMAIL.search(line):
            found.append((number, "an email address"))
        if any(p.search(line) for _, p in SECRETS):
            found.append((number, "a secret pattern"))
    return found


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="infra_redact.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument(
        "--redact-file",
        type=Path,
        help="the root's redact.txt: attribute names whose values go",
    )
    parser.add_argument(
        "--check",
        metavar="FILE",
        help="check a block's text (- for stdin) instead of filtering",
    )
    args = parser.parse_args(argv)
    try:
        if args.check is not None:
            text = (
                sys.stdin.read()
                if args.check == "-"
                else Path(args.check).read_text(encoding="utf-8")
            )
            found = check(text)
            for number, kind in found:
                print(f"line {number}: {kind}")
            return 1 if found else 0
        names = read_names(args.redact_file) if args.redact_file else set()
        text = sys.stdin.read()
    except (OSError, UnicodeDecodeError) as exc:
        print(
            f"infra-redact: can't read the input: {exc.__class__.__name__}",
            file=sys.stderr,
        )
        return 2
    try:
        out = redact(text, names)
    except Refused as exc:
        print(
            f"infra-redact: refused, no block printed: {exc}; the plan's text holds a secret pattern",
            file=sys.stderr,
        )
        return 3
    sys.stdout.write(out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
