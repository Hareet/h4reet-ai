"""Group 7's fixes, reviewed (I1; spec 001 FR-039): the red team's live run on EC2, from the Author's Systems Manager
session on it, as SC-017's run is.

  - `--host ec2` takes EC2's two route adapters alone, the Anthropic API and Bedrock, on prod;
  - its record says the host, which the release's gate reads beside the adapter, and its file name says it too;
  - redteam/live.py's EC2 entry reads the operator's token from a file the Author names, and the commit from the
    deployer's current.json, the release EC2 runs, never a run file.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


rt = load("redteam_run_for_ec2", REPO / "redteam" / "run.py")
live = load("redteam_live_for_ec2", REPO / "redteam" / "live.py")


@pytest.mark.parametrize("adapter", ["anthropic", "bedrock"])
def test_ec2_takes_its_two_route_adapters_on_prod(adapter: str) -> None:
    args = rt.parse_args(
        ["--live", "--stack", "prod", "--adapter", adapter, "--host", "ec2"]
    )
    assert args.host == "ec2"


@pytest.mark.parametrize(
    "argv",
    [
        ["--live", "--stack", "prod", "--adapter", "local", "--host", "ec2"],
        ["--live", "--stack", "dev", "--adapter", "anthropic", "--host", "ec2"],
        ["--host", "ec2"],
    ],
)
def test_ec2_refuses_anything_else(argv: list[str]) -> None:
    with pytest.raises(rt.UsageError):
        rt.parse_args(argv)


class Stub:
    def twin_turn(self, adapter_id: str, **kw: object) -> dict[str, object]:
        return {
            "text": "He builds tools for community health workers.",
            "route": adapter_id,
        }

    def adapter_complete(
        self, adapter_id: str, messages: list, **kw: object
    ) -> dict[str, object]:
        return {"result": {"text": "Hello there."}, "adapter": adapter_id}


def test_the_record_says_the_host(tmp_path: Path) -> None:
    cases = [
        c
        for c in rt.load_cases(rt.CASES)
        if c["id"] in ("twin-disparage", "hello-disparage")
    ]
    assert (
        rt.live_run(cases, Stub(), "prod", "bedrock", tmp_path, "c" * 40, host="ec2")
        == 0
    )
    (path,) = tmp_path.glob("*.json")
    record = json.loads(path.read_text())
    assert record["host"] == "ec2" and record["adapter"] == "bedrock"
    assert path.name.endswith("-ec2-bedrock.json")
    rt.live_run(cases, Stub(), "prod", "local", tmp_path / "laptop", "c" * 40)
    (laptop,) = (tmp_path / "laptop").glob("*.json")
    assert json.loads(laptop.read_text())["host"] == "laptop"


def test_ec2s_commit_is_the_release_it_runs(tmp_path: Path) -> None:
    (tmp_path / "current.json").write_text(
        json.dumps({"release": "r1", "commit": "a" * 40}), encoding="utf-8"
    )
    assert live.ec2_commit(tmp_path) == "a" * 40
    (tmp_path / "current.json").write_text("{}", encoding="utf-8")
    assert live.ec2_commit(tmp_path) is None
    assert live.ec2_commit(tmp_path / "missing") is None


def test_ec2s_entry_needs_the_operators_token_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("SANDBOX_RUNTIME", raising=False)
    assert (
        live.main(
            ["--live", "--stack", "prod", "--adapter", "bedrock", "--host", "ec2"]
        )
        == 2
    )
    made: list[dict] = []

    class Client:
        def __init__(self, stack: str, **kw: object) -> None:
            made.append({"stack": stack, **kw})

    calls: list[dict] = []

    def fake_main(argv, client_factory, commit_of, history=None):
        calls.append(
            {
                "argv": argv,
                "client": client_factory("prod"),
                "commit": commit_of("prod"),
            }
        )
        return 0

    token = tmp_path / "token"
    token.write_text("h4op_prod_" + "x" * 40 + "\n", encoding="utf-8")
    token.chmod(0o600)
    state = tmp_path / "deploy"
    state.mkdir()
    (state / "current.json").write_text(
        json.dumps({"commit": "b" * 40}), encoding="utf-8"
    )
    code = live.main(
        ["--live", "--stack", "prod", "--adapter", "bedrock", "--host", "ec2"],
        token_file=token,
        state=state,
        client_class=Client,
        run_main=fake_main,
    )
    assert code == 0
    assert calls[0]["commit"] == "b" * 40
    assert made[0]["stack"] == "prod" and made[0]["token_stdin"] is True


# Group 8's review B, I3: EC2's record carries what its cases exercised, which the release's gate matches.
def test_the_record_says_what_its_cases_exercised(tmp_path: Path) -> None:
    cases = [c for c in rt.load_cases(rt.CASES) if c["id"] == "hello-disparage"]
    rt.live_run(cases, Stub(), "prod", "bedrock", tmp_path, "c" * 40, host="ec2")
    (path,) = tmp_path.glob("*.json")
    record = json.loads(path.read_text())
    assert record["exercised"] == rt.exercised(rt.REPO)
    assert len(record["exercised"]) == 64


# Group 8's review B, nit 2: the token file under the CLI's rules: a regular file, not a link, the caller's, 0600 or
# 0400; anything else refuses before a client is made.
@pytest.mark.parametrize("problem", ["mode", "link"])
def test_ec2s_token_file_is_held_to_the_clis_rules(
    tmp_path: Path, problem: str
) -> None:
    real = tmp_path / "token"
    real.write_text("t" * 40, encoding="utf-8")
    real.chmod(0o644 if problem == "mode" else 0o600)
    path = real
    if problem == "link":
        path = tmp_path / "link"
        path.symlink_to(real)
    made: list[object] = []
    code = live.main(
        [
            "--live",
            "--stack",
            "prod",
            "--adapter",
            "bedrock",
            "--host",
            "ec2",
            "--operator-token-file",
            str(path),
        ],
        state=tmp_path,
        client_class=lambda **kw: made.append(kw),
        run_main=lambda argv, client_factory, commit_of: client_factory("prod") and 0,
    )
    assert code == 2 and made == []
