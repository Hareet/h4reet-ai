#!/usr/bin/env python3
"""The eval runner (spec 000, plan §14): deterministic YAML cases, scored against one adapter.

    python3 -I -B -X pycache_prefix=/dev/null evals/run.py --suite product --adapter fake   # what `make evals` runs
    ... --adapter local --stack dev     # hello on the stack, answered by its local model and nothing else
    ... --adapter bedrock               # the Author only: prod's admin endpoint, charged to prod's meter
    ... --suite narration --adapter fake   # spec 002's narration scripts, which run on the fake adapter only

Standard library plus PyYAML. A case is one YAML file in evals/<suite>/cases/:

    id: hello-fake
    prompt: Say hello.
    fake_response: Hello from the scaffold.     # what the fake adapter answers
    expect:                                     # at least one check
      contains: [hello]                         # every string must appear (case-insensitive)
      not_contains: [as an ai language model]   # none may appear (case-insensitive)
      regex: "^Hello"                           # re.search; it must compile
    fake_only: true                             # optional: the fake adapter alone runs it (below)

Scoring is deterministic: no model judges another. A fake-only case scores its own fake_response, as the scaffold's
hello case does: a live run skips it, and prints and records each one it skipped (spec 007's live runs, 2026-11-08).
The adapters reach models only through the gateway:
  - local: POST /hello on the stack's api port (contracts/gateway-http.md §2). Only the local route counts. A fallback
    answer stops the run, so the local model is never scored on another provider's answer, and the run spends no more
    of the sub-budget. A 429 waits out its Retry-After, except the daily cap.
  - bedrock: POST /admin/adapters/bedrock/complete on prod, through scripts/operator.py's AdminClient
    (contracts/operator-admin.md §5, §6), which never fails over. It sends the prompt as the only message, without
    hello's fixed system prompt. Its cost is §5's decimal string of micro-USD, read as an integer.
Only real runs write history, to evals/<suite>/history/: per case, the verdict, the route, provider, model, tokens,
cost, trace ID, and a hash of the answer, never its text; per run, the stack, the commit it runs, and the totals.
The history folder is untracked, so the file is created without following a link and never replaces one.
Exit codes: 0 every case passed, 1 a case failed, 2 usage or an adapter that can't run.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from pathlib import Path
from typing import Any

import yaml

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    # Appended, never prepended, so nothing in the tree can shadow the standard library.
    sys.path.append(str(REPO))

EVALS = REPO / "evals"
STATE = (
    Path.home() / ".local" / "state" / "h4reet"
)  # each host stack's run file (contracts/env-files.md §12)
HELLO_PORTS = {"prod": 18000, "dev": 18100}  # the x000 api ports (plan §1)
HELLO_MAX_CHARS = 500  # the message limit (gateway-http.md §2.1)
HELLO_MAX_OUTPUT_TOKENS = (
    128  # hello's output cap, which bedrock runs use too (gateway-http.md §2.1)
)
RETRIES = 5
RETRY_CAP_S = 60.0
CASE_KEYS = {
    "id",
    "description",
    "prompt",
    "fake_response",
    "expect",
    "twin",
    "kind",
    "fake_only",
}
# Spec 007's twin cases (its FR-049): what the case asks the twin, and what kind of case it is.
TWIN_KEYS = {"feature", "path", "turns"}
TWIN_PATHS = {"engineer", "non-engineer"}
TWIN_KINDS = {"golden", "gap"}
TWIN_ROLES = {"visitor", "twin"}
# Spec 007's readiness file (its FR-031), the Author's: its thresholds.golden is the share a path with ten or more golden
# cases needs, which the summary reads as information (golden_share, golden_bar), with evals/twin_readiness.py's own
# default when the file gives none (the review of c52655f7; plan.md D31).
READINESS_FILE = Path("config") / "twin-readiness.yaml"
GOLDEN_SHARE_DEFAULT = 0.9
# Suites that only the fake adapter runs. Spec 002's narration cases (contracts/narration.md §2) score prepared
# scripts, not a model: a local run would send them to a stack's /hello, and the other adapter would charge prod's meter.
FAKE_ONLY_SUITES = {"narration"}
EXPECT_KEYS = {"contains", "not_contains", "regex"}

Reply = dict[str, Any]
Adapter = Callable[[dict[str, Any]], Reply]


class AdapterError(Exception):
    """The adapter can't run here, or answered from the wrong route: a usage error, not a failed case."""


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
        if "twin" in case or "kind" in case:
            check_twin(path, case)
        if not isinstance(case.get("fake_only", False), bool):
            raise AdapterError(f"{path}: fake_only is true or false")
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
        if "regex" in expect:
            if not isinstance(expect["regex"], str):
                raise AdapterError(f"{path}: expect.regex must be a string")
            try:
                re.compile(expect["regex"])
            except re.error as exc:
                raise AdapterError(
                    f"{path}: expect.regex doesn't compile: {exc}"
                ) from exc
        if not (
            expect.get("contains") or expect.get("not_contains") or expect.get("regex")
        ):
            raise AdapterError(
                f"{path}: a case needs at least one check under expect, or it always passes"
            )
        cases.append(case)
    if not cases:
        raise AdapterError(f"suite {suite!r} has no cases in {folder}")
    return cases


def check_twin(path: Path, case: dict[str, Any]) -> None:
    """A twin case's `twin` and `kind` (spec 007, plan §8): the turn the twin's pipeline answers, and golden or gap."""
    twin, kind = case.get("twin"), case.get("kind")
    if kind not in TWIN_KINDS:
        raise AdapterError(f"{path}: kind is one of {sorted(TWIN_KINDS)}")
    if not isinstance(twin, dict) or set(twin) != TWIN_KEYS:
        raise AdapterError(f"{path}: twin is exactly {sorted(TWIN_KEYS)}")
    if not isinstance(twin["feature"], str) or not re.fullmatch(
        r"[a-z0-9][a-z0-9_-]{0,63}", twin["feature"]
    ):
        raise AdapterError(f"{path}: twin.feature is a selectable's ID or free_talk")
    if twin["path"] not in TWIN_PATHS:
        raise AdapterError(f"{path}: twin.path is engineer or non-engineer")
    turns = twin["turns"]
    if not isinstance(turns, list) or not all(
        isinstance(t, dict)
        and set(t) == {"role", "text"}
        and t["role"] in TWIN_ROLES
        and isinstance(t["text"], str)
        for t in turns
    ):
        raise AdapterError(f"{path}: twin.turns is a list of {{role, text}}")


def twin_topic(case_id: str) -> str:
    """A generated case's corpus file, from its ID: twin-04-hobbies-and-travel-q1-engineer is 04-hobbies-and-travel."""
    match = re.fullmatch(
        r"twin-(.+?)-(?:q\d+|gap-\d+)-(?:engineer|non-engineer)", case_id
    )
    return match.group(1) if match else case_id


def golden_share(root: Path | None = None) -> float:
    """The readiness file's golden share, read as evals/twin_readiness.py reads it: thresholds.golden when it's a
    number, else that file's default, 0.9, as also when the file is missing or doesn't parse (readiness then marks
    nothing ready)."""
    try:
        doc = yaml.safe_load(
            ((root or REPO) / READINESS_FILE).read_text(encoding="utf-8")
        )
    except (OSError, yaml.YAMLError):
        return GOLDEN_SHARE_DEFAULT
    thresholds = doc.get("thresholds") if isinstance(doc, dict) else None
    share = (
        thresholds.get("golden", GOLDEN_SHARE_DEFAULT)
        if isinstance(thresholds, dict)
        else GOLDEN_SHARE_DEFAULT
    )
    return share if isinstance(share, int | float) else GOLDEN_SHARE_DEFAULT


def golden_bar(n: int, share: float) -> int:
    """The passes a path's n golden cases need (spec 007's FR-031, amended 2026-11-08): all but one when it has two to
    nine, its one when it has one, and the readiness file's share from ten. evals/twin_readiness.py's golden_bar is the
    rule; a test holds this one to it."""
    if n < 10:
        return max(n - 1, 1) if n > 0 else 0
    return next((k for k in range(n + 1) if k / n >= share), n)


def golden_line(topic: str, path: str, passed: int, total: int, share: float) -> str:
    """A topic's and path's summary line: its golden cases passed, against the bar that applies."""
    return (
        f"twin {topic} {path}: {passed} of {total} golden cases passed"
        f" ({passed / total:.0%}; the bar is {golden_bar(total, share)} of {total})"
    )


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


def reply(
    answer: Any,
    route: Any,
    provider: Any,
    model: Any,
    usage: Any,
    cost: Any,
    trace_id: Any,
) -> Reply:
    """One answer and what the gateway says about it, checked for shape."""
    if not isinstance(answer, str):
        raise AdapterError("the reply has no answer text")
    usage = usage if isinstance(usage, dict) else {}
    tokens = {k: usage.get(k) for k in ("input_tokens", "output_tokens")}
    if not all(isinstance(v, int) and v >= 0 for v in tokens.values()):
        raise AdapterError("the reply's usage isn't two non-negative token counts")
    if not isinstance(cost, int) or cost < 0:
        raise AdapterError("the reply's cost_micro_usd isn't a non-negative integer")
    return {
        "answer": answer,
        "route": str(route),
        "provider": str(provider),
        "model": str(model),
        "usage": tokens,
        "cost_micro_usd": cost,
        "trace_id": trace_id if isinstance(trace_id, str) else None,
    }


def fake_adapter(case: dict[str, Any]) -> Reply:
    if not isinstance(case.get("fake_response"), str):
        raise AdapterError(f"case {case['id']}: the fake adapter needs fake_response")
    usage = {"input_tokens": 0, "output_tokens": 0}
    return reply(case["fake_response"], "fake", "fake", "fake", usage, 0, None)


def retry_after(exc: urllib.error.HTTPError) -> float | None:
    """Seconds to wait before retrying a 429, or None when waiting can't help (the day's cap)."""
    try:
        body = json.loads(exc.read() or b"{}")
    except (OSError, ValueError):
        body = {}
    if not isinstance(body, dict) or body.get("limit") == "per_day":
        return None
    try:
        wait = float(body.get("retry_after_s") or exc.headers.get("Retry-After") or 3)
    except (TypeError, ValueError):
        wait = 3.0
    return min(max(wait, 0.0), RETRY_CAP_S)


def local_adapter(
    stack: str,
    opener: urllib.request.OpenerDirector | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> Adapter:
    """hello on the stack's api port, on 127.0.0.1 only, never through a proxy."""
    if stack not in HELLO_PORTS:
        raise AdapterError("--adapter local takes --stack prod or --stack dev")
    url = f"http://127.0.0.1:{HELLO_PORTS[stack]}/hello"
    opener = opener or urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def post(message: str) -> dict[str, Any]:
        body = json.dumps({"message": message}).encode("utf-8")
        headers = {"Content-Type": "application/json", "X-H4-Client": "evals"}
        for attempt in range(RETRIES + 1):
            request = urllib.request.Request(url, data=body, headers=headers)
            try:
                with opener.open(request, timeout=30) as response:
                    answer = json.loads(response.read())
                    if not isinstance(answer, dict):
                        raise AdapterError(f"{url}: the reply isn't a JSON object")
                    return answer
            except urllib.error.HTTPError as exc:
                wait = (
                    retry_after(exc) if exc.code == 429 and attempt < RETRIES else None
                )
                if wait is None:
                    cause = (
                        exc.headers.get("X-H4-Degraded-Cause") if exc.headers else None
                    )
                    raise AdapterError(
                        f"{url}: HTTP {exc.code}"
                        + (f", degraded: {cause}" if cause else "")
                    ) from exc
                sleep(wait)
            except (urllib.error.URLError, OSError, ValueError) as exc:
                raise AdapterError(f"{url}: {exc.__class__.__name__}") from exc
        raise AdapterError(f"{url}: still refused after {RETRIES} retries")

    def call(case: dict[str, Any]) -> Reply:
        message = case["prompt"].strip()
        if not 1 <= len(message) <= HELLO_MAX_CHARS:
            raise AdapterError(
                f"case {case['id']}: hello takes a prompt of 1 to {HELLO_MAX_CHARS} characters"
            )
        answer = post(message)
        route, provider = answer.get("route"), answer.get("provider")
        if route != "local" or provider != "local":
            raise AdapterError(
                f"{url}: the {route!r} route answered ({provider}, {answer.get('route_reason')}), not the local "
                "model, so the run stops before it spends more"
            )
        return reply(
            answer.get("answer"),
            route,
            provider,
            answer.get("model"),
            answer.get("usage"),
            answer.get("cost_micro_usd"),
            answer.get("trace_id"),
        )

    return call


def admin_client(stack: str) -> Any:
    """scripts/operator.py's AdminClient for a stack, with the operator token, loaded from the tree as data."""
    operator = REPO / "scripts" / "operator.py"
    if not operator.is_file():
        raise AdapterError(
            "the admin adapters need scripts/operator.py's AdminClient, which tasks.md T056 creates"
        )
    spec = importlib.util.spec_from_file_location("h4_operator", operator)
    if spec is None or spec.loader is None:
        raise AdapterError(f"can't load {operator}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module.AdminClient(stack=stack)


def twin_adapter(suite: str, stack: str, adapter_id: str) -> Adapter:
    """Spec 007's twin cases: POST /admin/twin/turn on the stack's admin listener, on one named adapter, never failing
    over (contracts/operator-admin.md §8). The reply adds the guard and the pack's and the prompt's hashes."""
    client = admin_client(stack)

    def call(case: dict[str, Any]) -> Reply:
        twin = case["twin"]
        try:
            answer = client.twin_turn(
                adapter_id,
                feature=twin["feature"],
                path=twin["path"],
                turns=twin["turns"],
                reason=f"evals {suite} {case['id']}",
            )
        except (
            Exception
        ) as exc:  # AdminError carries a status and an error code, never the token
            status = getattr(exc, "status", None)
            raise AdapterError(
                f"{adapter_id}: {exc.__class__.__name__}"
                + (f", HTTP {status}" if status else "")
            ) from exc
        if not isinstance(answer, dict):
            raise AdapterError(f"{adapter_id}: the reply isn't a JSON object")
        out = reply(
            answer.get("text"),
            answer.get("route"),
            "aws.bedrock" if adapter_id == "bedrock" else adapter_id,
            answer.get("model"),
            answer.get("usage"),
            answer.get("cost_micro_usd"),
            answer.get("trace_id"),
        )
        guard = answer.get("guard")
        out["guard"] = guard if isinstance(guard, str) else None
        for key in ("pack_sha256", "prompt_sha256"):
            value = answer.get(key)
            out[key] = (
                value
                if isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value)
                else None
            )
        return out

    return call


def micro_usd(cost: Any) -> Any:
    """operator-admin.md §5's cost, as an integer: "Costs are decimal strings of micro-USD in both answers, as BigInt
    can't travel in JSON" (T103's readings). ASCII digits only, at most 18 of them; anything else stays as it came,
    for reply() to refuse."""
    if isinstance(cost, str) and re.fullmatch(r"[0-9]{1,18}", cost):
        return int(cost)
    return cost


def bedrock_adapter(suite: str) -> Adapter:
    """Prod's admin endpoint, with the operator token, through scripts/operator.py's AdminClient (plan §14)."""
    client = admin_client("prod")

    def call(case: dict[str, Any]) -> Reply:
        try:
            answer = client.adapter_complete(
                "bedrock",
                messages=[{"role": "user", "content": case["prompt"]}],
                max_output_tokens=HELLO_MAX_OUTPUT_TOKENS,
                purpose="eval",
                reason=f"evals {suite} {case['id']}",
            )
        except (
            Exception
        ) as exc:  # AdminError carries a status and an error code, never the token (§6)
            status = getattr(exc, "status", None)
            raise AdapterError(
                f"bedrock: {exc.__class__.__name__}"
                + (f", HTTP {status}" if status else "")
            ) from exc
        result = answer.get("result") if isinstance(answer, dict) else None
        if not isinstance(result, dict):
            raise AdapterError(
                "bedrock: the reply has no result (operator-admin.md §5)"
            )
        return reply(
            result.get("text"),
            "admin",  # the admin endpoint calls the named adapter and never fails over
            "aws.bedrock",
            result.get("response_model"),
            result.get("usage"),
            micro_usd(answer.get("cost_micro_usd")),
            answer.get("trace_id"),
        )

    return call


def stack_ref(stack: str) -> str | None:
    """The commit the stack runs, from its run file, read as KEY=VALUE data (contracts/env-files.md §12)."""
    try:
        text = (STATE / stack / "run.env").read_text(encoding="utf-8")
    except OSError:
        return None
    refs = [
        ln.partition("=")[2].strip()
        for ln in text.splitlines()
        if ln.startswith("H4_REF=")
    ]
    return refs[0] if refs and re.fullmatch(r"[0-9a-f]{40}", refs[0]) else None


def write_history(suite: str, adapter: str, record: dict[str, Any]) -> Path:
    """Create the run's file under evals/<suite>/history/, never through a link and never over an existing path."""
    suite_dir = EVALS / suite
    folder = suite_dir / "history"
    if suite_dir.resolve() != EVALS.resolve() / suite or folder.is_symlink():
        raise AdapterError(
            f"{folder} isn't a plain folder inside {EVALS}, so no history is written through it"
        )
    try:
        folder.mkdir(exist_ok=True)
        directory = os.open(folder, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    except OSError as exc:
        raise AdapterError(
            f"{folder}: {exc.__class__.__name__}, so no history is written"
        ) from exc
    name = f"{dt.datetime.now(dt.UTC).strftime('%Y-%m-%dT%H%M%SZ')}-{adapter}.json"
    try:
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
        handle = os.open(name, flags, 0o644, dir_fd=directory)
    except OSError as exc:
        raise AdapterError(
            f"{folder / name}: {exc.__class__.__name__}, so no history is written"
        ) from exc
    finally:
        os.close(directory)
    with os.fdopen(handle, "w", encoding="utf-8") as out:
        out.write(json.dumps(record, indent=2) + "\n")
    return folder / name


def twin_readiness(root: Path = REPO) -> None:
    """Spec 007's readiness evidence (its FR-031; plan.md D19), printed after the product suite as information:
    evals/twin_readiness.py, loaded from the tree as data, as the operator CLI is, so make evals's recipe runs no script
    of its own for it. It prints one line per ready entry, or why not, and never changes the run's exit code."""
    path = root / "evals" / "twin_readiness.py"
    try:
        spec = importlib.util.spec_from_file_location("h4_twin_readiness", path)
        if spec is None or spec.loader is None:
            raise ImportError(str(path))
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
    except (ImportError, OSError, SyntaxError) as exc:
        print(
            f"INFO (twin readiness): {path.name} didn't load ({exc.__class__.__name__})"
        )
        return
    module.main(["--root", str(root)])


def main(argv: list[str], *, readiness: bool = False) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--suite", required=True)
    parser.add_argument(
        "--adapter", choices=["fake", "local", "bedrock"], default="fake"
    )
    parser.add_argument("--stack", choices=["prod", "dev"], default="dev")
    args = parser.parse_args(argv)
    if args.suite in FAKE_ONLY_SUITES and args.adapter != "fake":
        print(
            f"evals: the {args.suite} suite runs on the fake adapter only (spec 002, contracts/narration.md §2)",
            file=sys.stderr,
        )
        return 2
    stack = "prod" if args.adapter == "bedrock" else args.stack
    started = dt.datetime.now(dt.UTC)
    try:
        loaded = load_cases(args.suite)
        # A fake-only case scores its own fake_response, so a live run never sends it: no real model is scored
        # against scripted words, and prod's meter isn't charged for them (spec 007's live runs, 2026-11-08).
        skipped = (
            []
            if args.adapter == "fake"
            else [c["id"] for c in loaded if c.get("fake_only")]
        )
        cases = [c for c in loaded if args.adapter == "fake" or not c.get("fake_only")]
        for case_id in skipped:
            print(f"SKIP  {case_id}  (the fake adapter only)")
        if not cases:
            raise AdapterError(
                f"every case in the {args.suite} suite runs on the fake adapter only"
            )
        hello_call: Adapter | None = None
        twin_call: Adapter | None = None

        def adapter_for(case: dict[str, Any]) -> Adapter:
            """The case's adapter, made when first needed: a twin case goes through the twin's admin route
            (spec 007), every other case as before."""
            nonlocal hello_call, twin_call
            if args.adapter == "fake":
                return fake_adapter
            if "twin" in case:
                if twin_call is None:
                    adapter_id = "bedrock" if args.adapter == "bedrock" else "local"
                    twin_call = twin_adapter(args.suite, stack, adapter_id)
                return twin_call
            if hello_call is None:
                hello_call = (
                    local_adapter(args.stack)
                    if args.adapter == "local"
                    else bedrock_adapter(args.suite)
                )
            return hello_call

        results, failed = [], 0
        twin_rates: dict[tuple[str, str], list[int]] = {}
        prompt_hashes: set[str] = set()
        for case in cases:
            begun = time.monotonic()
            answer = adapter_for(case)(case)
            elapsed_ms = round((time.monotonic() - begun) * 1000)
            reasons = score(case, answer["answer"])
            failed += bool(reasons)
            verdict = "FAIL" if reasons else "PASS"
            # A failing twin case names the guard that withheld its answer, if one did (the review of c52655f7; D31).
            withheld = (
                [f"withheld by {answer['guard']}"]
                if reasons and answer.get("guard")
                else []
            )
            print(
                f"{verdict}  {case['id']}"
                + (f"  ({'; '.join(reasons + withheld)})" if reasons else "")
            )
            results.append(
                {
                    "id": case["id"],
                    "verdict": verdict,
                    "reasons": reasons,
                    "latency_ms": elapsed_ms,
                    **{
                        k: answer[k]
                        for k in (
                            "route",
                            "provider",
                            "model",
                            "usage",
                            "cost_micro_usd",
                            "trace_id",
                        )
                    },
                    "answer_sha256": hashlib.sha256(
                        answer["answer"].encode("utf-8")
                    ).hexdigest(),
                    # Spec 007 (its FR-050): the twin's guard, and the pack's hash the answer was grounded in.
                    **(
                        {
                            "feature": case["twin"]["feature"],
                            "guard": answer.get("guard"),
                            "pack_sha256": answer.get("pack_sha256"),
                        }
                        if "twin" in case
                        else {}
                    ),
                }
            )
            if case.get("kind") == "golden":
                rate = twin_rates.setdefault(
                    (twin_topic(case["id"]), case["twin"]["path"]), [0, 0]
                )
                rate[0] += not reasons
                rate[1] += 1
            if "twin" in case and answer.get("prompt_sha256"):
                prompt_hashes.add(answer["prompt_sha256"])
        cost = sum(r["cost_micro_usd"] for r in results)
        # Each topic's and path's Golden Q&A pass rate, against the bar that applies: information, which fails nothing
        # here, as the exit status follows every case's verdict (spec 007, FR-031 as amended on 2026-11-08;
        # evals/twin_readiness.py reads the committed history), at the readiness file's share.
        share = golden_share()
        for (topic, path), (passed, total) in sorted(twin_rates.items()):
            print(golden_line(topic, path, passed, total, share))
        if args.adapter != "fake":
            record = {
                "suite": args.suite,
                "adapter": args.adapter,
                "stack": stack,
                "stack_ref": stack_ref(stack),
                "started": started.isoformat(timespec="seconds"),
                "finished": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
                "cases": len(cases),
                "failed": failed,
                "skipped": skipped,
                "cost_micro_usd": cost,
                "tokens": {
                    k: sum(r["usage"][k] for r in results)
                    for k in ("input_tokens", "output_tokens")
                },
                "results": results,
            }
            if prompt_hashes:
                # The prompt hashes the twin's cases ran at (spec 007, FR-050): one, unless the stack changed mid-run.
                record["prompt_sha256"] = sorted(prompt_hashes)
            print(
                f"history: {write_history(args.suite, args.adapter, record).relative_to(EVALS.parent)}"
            )
    except AdapterError as exc:
        print(f"evals: {exc}", file=sys.stderr)
        return 2
    print(
        f"evals {args.suite} ({args.adapter}): {len(cases) - failed} passed, {failed} failed"
        + (f", {len(skipped)} skipped (the fake adapter only)" if skipped else "")
        + (f", {cost} micro-USD" if args.adapter != "fake" else "")
    )
    if readiness and args.suite == "product":
        twin_readiness()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:], readiness=True))
