#!/usr/bin/env python3
"""The eval runner (spec 000, plan §14): deterministic YAML cases, scored against one adapter.

    python3 -I evals/run.py --suite product --adapter fake          # anywhere; what `make evals` runs
    python3 -I evals/run.py --suite product --adapter local --stack dev
    python3 -I evals/run.py --suite product --adapter bedrock       # the Author only, charged to prod's meter

Standard library plus PyYAML. A case is one YAML file in evals/<suite>/cases/:

    id: hello-fake
    prompt: Say hello.
    fake_response: Hello from the scaffold.     # what the fake adapter answers
    expect:
      contains: [hello]                         # every string must appear (case-insensitive)
      not_contains: [as an ai language model]   # none may appear (case-insensitive)
      regex: "^Hello"                           # optional, re.search

Scoring is deterministic: no model judges another. Only real runs (local, bedrock) write history, to
evals/<suite>/history/, with each case's verdict and timing and a hash of the answer, never its text.
Exit codes: 0 every case passed, 1 a case failed, 2 usage or an adapter that can't run.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import yaml

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.append(
        str(REPO)
    )  # appended, never prepended, so nothing in the tree can shadow the stdlib

EVALS = REPO / "evals"
HELLO_PORTS = {"prod": 18000, "dev": 18100}  # the x000 api ports (plan §1)
CASE_KEYS = {"id", "description", "prompt", "fake_response", "expect"}
EXPECT_KEYS = {"contains", "not_contains", "regex"}


class AdapterError(Exception):
    """The adapter can't run here: a usage error, not a failed case."""


def load_cases(suite: str) -> list[dict[str, Any]]:
    folder = EVALS / suite / "cases"
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", suite) or not folder.is_dir():
        raise AdapterError(f"no suite {suite!r} (expected {folder})")
    cases = []
    for path in sorted(folder.glob("*.yaml")):
        case = yaml.safe_load(path.read_text(encoding="utf-8"))
        if (
            not isinstance(case, dict)
            or not isinstance(case.get("id"), str)
            or not isinstance(case.get("prompt"), str)
        ):
            raise AdapterError(f"{path}: a case needs a string id and a string prompt")
        unknown = set(case) - CASE_KEYS
        if unknown:
            raise AdapterError(f"{path}: unknown keys {sorted(unknown)}")
        expect = case.get("expect") or {}
        if not isinstance(expect, dict) or set(expect) - EXPECT_KEYS:
            raise AdapterError(f"{path}: expect takes only {sorted(EXPECT_KEYS)}")
        for key in ("contains", "not_contains"):
            values = expect.get(key, [])
            if not isinstance(values, list) or not all(
                isinstance(v, str) for v in values
            ):
                # YAML reads bare yes, no, on, and off as booleans; quote them.
                raise AdapterError(f"{path}: expect.{key} must be a list of strings")
        if "regex" in expect and not isinstance(expect["regex"], str):
            raise AdapterError(f"{path}: expect.regex must be a string")
        cases.append(case)
    if not cases:
        raise AdapterError(f"suite {suite!r} has no cases in {folder}")
    return cases


def score(case: dict[str, Any], answer: str) -> list[str]:
    """The reasons a case failed; an empty list means it passed."""
    expect = case.get("expect") or {}
    low = answer.lower()
    reasons = [
        f"missing {s!r}" for s in expect.get("contains", []) if s.lower() not in low
    ]
    reasons += [
        f"contains {s!r}" for s in expect.get("not_contains", []) if s.lower() in low
    ]
    if expect.get("regex") and not re.search(expect["regex"], answer):
        reasons.append(f"doesn't match /{expect['regex']}/")
    return reasons


def fake_adapter(case: dict[str, Any]) -> str:
    if not isinstance(case.get("fake_response"), str):
        raise AdapterError(f"case {case['id']}: the fake adapter needs fake_response")
    return case["fake_response"]


def local_adapter(stack: str) -> Any:
    """hello on the stack's api port, on 127.0.0.1 only, never through a proxy."""
    if stack not in HELLO_PORTS:
        raise AdapterError("--adapter local takes --stack prod or --stack dev")
    url = f"http://127.0.0.1:{HELLO_PORTS[stack]}/hello"
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def call(case: dict[str, Any]) -> str:
        body = json.dumps({"message": case["prompt"]}).encode("utf-8")
        request = urllib.request.Request(
            url, data=body, headers={"Content-Type": "application/json"}
        )
        try:
            with opener.open(request, timeout=30) as response:
                return str(json.loads(response.read())["answer"])
        except (urllib.error.URLError, OSError, ValueError, KeyError) as exc:
            raise AdapterError(f"{url}: {exc.__class__.__name__}") from exc

    return call


def bedrock_adapter() -> Any:
    """Prod's admin endpoint, with the operator token, through scripts/operator.py's AdminClient (plan §14)."""
    operator = REPO / "scripts" / "operator.py"
    if not operator.is_file():
        raise AdapterError(
            "the bedrock adapter needs scripts/operator.py's AdminClient, which tasks.md T056 creates"
        )
    spec = importlib.util.spec_from_file_location("h4_operator", operator)
    if spec is None or spec.loader is None:
        raise AdapterError(f"can't load {operator}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    client = module.AdminClient(stack="prod")

    def call(case: dict[str, Any]) -> str:
        reply = client.adapter_complete(
            "bedrock", case["prompt"], reason=f"product eval {case['id']}"
        )
        return str(reply["answer"])

    return call


def write_history(suite: str, adapter: str, results: list[dict[str, Any]]) -> Path:
    stamp = dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H%M%SZ")
    folder = EVALS / suite / "history"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{stamp}-{adapter}.json"
    path.write_text(
        json.dumps({"suite": suite, "adapter": adapter, "results": results}, indent=2)
        + "\n"
    )
    return path


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--suite", required=True)
    parser.add_argument(
        "--adapter", choices=["fake", "local", "bedrock"], default="fake"
    )
    parser.add_argument("--stack", choices=["prod", "dev"], default="dev")
    args = parser.parse_args(argv)
    try:
        cases = load_cases(args.suite)
        if args.adapter == "fake":
            call = fake_adapter
        elif args.adapter == "local":
            call = local_adapter(args.stack)
        else:
            call = bedrock_adapter()
        results, failed = [], 0
        for case in cases:
            started = time.monotonic()
            answer = call(case)
            elapsed_ms = round((time.monotonic() - started) * 1000)
            reasons = score(case, answer)
            failed += bool(reasons)
            verdict = "FAIL" if reasons else "PASS"
            print(
                f"{verdict}  {case['id']}"
                + (f"  ({'; '.join(reasons)})" if reasons else "")
            )
            results.append(
                {
                    "id": case["id"],
                    "verdict": verdict,
                    "reasons": reasons,
                    "latency_ms": elapsed_ms,
                    "answer_sha256": hashlib.sha256(answer.encode("utf-8")).hexdigest(),
                }
            )
    except AdapterError as exc:
        print(f"evals: {exc}", file=sys.stderr)
        return 2
    if args.adapter != "fake":
        print(
            f"history: {write_history(args.suite, args.adapter, results).relative_to(REPO)}"
        )
    print(
        f"evals {args.suite} ({args.adapter}): {len(cases) - failed} passed, {failed} failed"
    )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
