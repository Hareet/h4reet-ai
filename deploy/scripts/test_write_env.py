"""Tests for deploy/scripts/write_env.py (spec 001 tasks.md T044, T049; contracts/env-cloud.md §1; contracts/tunnel.md
§5; research.md R-26): a cloud host's env file and its key files, written at boot from Parameter Store to tmpfs.

  - every key its template names: a literal value as written, a __PARAMETER__ from /h4reet/<host>/<KEY>, a
    __PARAMETER:<path>__ from that path, and H4_REGISTRY from the instance's account;
  - the tunnel end's two key files from /h4reet/tunnel-end/HOST_KEY and AUTHORIZED_KEY, owned by the tunnel's user;
  - files 0600 in 0700 folders, replaced whole, never half-written;
  - a missing name refuses the whole write, naming it; a value outside the env file's grammar refuses too, naming the
    key; no value is ever printed.

Parameter Store and the instance's metadata are stood in for: write_env.main takes the fetch and the account as
functions. Secret-shaped values are made at run time.
"""

from __future__ import annotations

import importlib.util
import secrets
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
SPEC = importlib.util.spec_from_file_location("write_env", HERE / "write_env.py")
assert SPEC and SPEC.loader
we = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = we
SPEC.loader.exec_module(we)

TEMPLATE = REPO / "deploy" / "hosts" / "tunnel-end" / "tunnel-end.env.example"
ACCOUNT = "".join(str((i * 7) % 10) for i in range(12))
DASHES = "-" * 5


def pem(body: str) -> str:
    kind = "OPENSSH " + "PRIVATE KEY"
    return f"{DASHES}BEGIN {kind}{DASHES}\n{body}\n{DASHES}END {kind}{DASHES}\n"


def store() -> dict[str, str]:
    return {
        "/h4reet/tunnel-end/TELEMETRY_BLOCK_TOKEN": secrets.token_urlsafe(32),
        "/h4reet/tunnel-end/HOST_KEY": pem(secrets.token_hex(24)),
        "/h4reet/tunnel-end/AUTHORIZED_KEY": "ssh-ed25519 "
        + secrets.token_hex(24)
        + " laptop\n",
        "/h4reet/hosts/RELEASE_BUCKET": "h4reet-ai-releases-" + secrets.token_hex(6),
    }


class World:
    def __init__(self, tmp_path: Path, held: dict[str, str]) -> None:
        self.held = held
        self.asked: list[str] = []
        self.chowned: list[tuple[str, int]] = []
        self.out = tmp_path / "run" / "h4reet" / "tunnel-end.env"
        self.keys = tmp_path / "run" / "h4reet" / "tunnel-end" / "keys"

    def fetch(self, names: list[str]) -> dict[str, str]:
        self.asked.extend(names)
        return {n: self.held[n] for n in names if n in self.held}

    def chown(self, path: Path, uid: int) -> None:
        self.chowned.append((path.name, uid))

    def args(self) -> list[str]:
        return [
            "--host",
            "tunnel-end",
            "--template",
            str(TEMPLATE),
            "--out",
            str(self.out),
            "--keys-dir",
            str(self.keys),
        ]

    def run(
        self, capsys: pytest.CaptureFixture[str], account: str = ACCOUNT
    ) -> tuple[int, str]:
        code = we.main(
            self.args(), fetch=self.fetch, account=lambda: account, chown=self.chown
        )
        captured = capsys.readouterr()
        return code, captured.out + captured.err


def test_it_writes_the_env_file_and_the_key_files(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    held = store()
    w = World(tmp_path, held)
    code, said = w.run(capsys)
    assert code == 0, said
    values, errors = we.parse_env(w.out.read_text(encoding="utf-8"))
    assert errors == []
    assert values["H4_HOST"] == "tunnel-end"
    assert (
        values["TELEMETRY_BLOCK_TOKEN"]
        == held["/h4reet/tunnel-end/TELEMETRY_BLOCK_TOKEN"]
    )
    assert values["RELEASE_BUCKET"] == held["/h4reet/hosts/RELEASE_BUCKET"]
    assert values["H4_REGISTRY"] == f"{ACCOUNT}.dkr.ecr.us-east-1.amazonaws.com"
    host_key = w.keys / "ssh_host_ed25519_key"
    assert host_key.read_text() == held["/h4reet/tunnel-end/HOST_KEY"]
    assert (w.keys / "authorized_keys").read_text() == held[
        "/h4reet/tunnel-end/AUTHORIZED_KEY"
    ]
    for path in (w.out, host_key, w.keys / "authorized_keys"):
        assert path.stat().st_mode & 0o777 == 0o600, path
    for folder in (w.out.parent, w.keys):
        assert folder.stat().st_mode & 0o777 == 0o700, folder
    for name in ("ssh_host_ed25519_key", "authorized_keys", "keys"):
        assert (name, 10001) in w.chowned, name
    for value in held.values():
        assert value.strip() not in said


def test_the_template_keys_and_nothing_else(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    w = World(tmp_path, store())
    assert w.run(capsys)[0] == 0
    written = set(we.parse_env(w.out.read_text(encoding="utf-8"))[0])
    template = set(we.parse_env(TEMPLATE.read_text(encoding="utf-8"))[0])
    assert written == template


@pytest.mark.parametrize(
    "missing",
    [
        "/h4reet/tunnel-end/TELEMETRY_BLOCK_TOKEN",
        "/h4reet/tunnel-end/HOST_KEY",
        "/h4reet/hosts/RELEASE_BUCKET",
    ],
)
def test_a_missing_name_refuses_the_whole_write_naming_it(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], missing: str
) -> None:
    held = store()
    del held[missing]
    w = World(tmp_path, held)
    code, said = w.run(capsys)
    assert code == 1
    assert missing in said
    assert not w.out.exists() and not (w.keys / "authorized_keys").exists()
    for value in held.values():
        assert value.strip() not in said


@pytest.mark.parametrize(
    "bad", ["two words", "a'quote", "dollar$sign", "line\nbreak", ""]
)
def test_a_value_outside_the_grammar_refuses_naming_the_key_only(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], bad: str
) -> None:
    held = store()
    held["/h4reet/tunnel-end/TELEMETRY_BLOCK_TOKEN"] = bad
    w = World(tmp_path, held)
    code, said = w.run(capsys)
    assert code == 1
    assert "TELEMETRY_BLOCK_TOKEN" in said
    assert bad == "" or bad not in said
    assert not w.out.exists()


def test_it_replaces_an_earlier_file_whole(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    w = World(tmp_path, store())
    assert w.run(capsys)[0] == 0
    first = w.out.read_text(encoding="utf-8")
    w.held = store()
    assert w.run(capsys)[0] == 0
    assert w.out.read_text(encoding="utf-8") != first
    assert [p.name for p in w.out.parent.iterdir() if p.name.startswith(".")] == []


def test_it_asks_only_for_the_names_it_needs(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    w = World(tmp_path, store())
    assert w.run(capsys)[0] == 0
    assert sorted(w.asked) == sorted(store().keys())


def test_an_account_that_isnt_twelve_digits_refuses(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    w = World(tmp_path, store())
    code, said = w.run(capsys, account="not-an-account")
    assert code == 1
    assert "H4_REGISTRY" in said
    assert not w.out.exists()


# ----------------------------------------------------------------------------------------------------------------------
# Spec 001 group 7 (tasks.md T081): EC2's env file, after its instance's metadata confirms it is h4-prod-ec2.

EC2_TEMPLATE = REPO / "deploy" / "hosts" / "ec2" / "ec2.env.example"


def ec2_store() -> dict[str, str]:
    values, _ = we.parse_env(EC2_TEMPLATE.read_text(encoding="utf-8"))
    return {
        param: (
            "h4reet-ai-releases-" + secrets.token_hex(6)
            if param.endswith("RELEASE_BUCKET")
            else secrets.token_urlsafe(24)
        )
        for param in we.wanted("ec2", values).values()
    }


def ec2_run(
    tmp_path: Path, held: dict[str, str], tag: str, capsys: pytest.CaptureFixture[str]
) -> tuple[int, str, Path]:
    out = tmp_path / "run" / "h4reet" / "ec2.env"
    code = we.main(
        [
            "--host",
            "ec2",
            "--template",
            str(EC2_TEMPLATE),
            "--out",
            str(out),
            "--keys-dir",
            str(tmp_path / "run" / "h4reet" / "ec2"),
        ],
        fetch=lambda names: {n: held[n] for n in names if n in held},
        account=lambda: ACCOUNT,
        chown=lambda path, uid: None,
        name_tag=lambda: tag,
    )
    captured = capsys.readouterr()
    return code, captured.out + captured.err, out


def test_ec2s_env_file_is_written_on_h4_prod_ec2(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    held = ec2_store()
    code, said, out = ec2_run(tmp_path, held, "h4-prod-ec2", capsys)
    assert code == 0, said
    values, errors = we.parse_env(out.read_text(encoding="utf-8"))
    assert errors == [] and values["H4_HOST"] == "ec2"
    assert (
        values["GATEWAY_ANTHROPIC_API_KEY"]
        == held["/h4reet/ec2/GATEWAY_ANTHROPIC_API_KEY"]
    )
    assert values["GATEWAY_DB_PASSWORD"] == held["/h4reet/ec2/DB_GATEWAY_PASSWORD"]
    assert out.stat().st_mode & 0o777 == 0o600
    for value in held.values():
        assert value not in said


@pytest.mark.parametrize("tag", ["", "h4-prod-tunnel-end", "h4-prod-ec2x"])
def test_ec2s_env_file_is_refused_on_any_other_instance(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], tag: str
) -> None:
    # The IMDSv2 tag check (research.md R-28), against a stub: EC2's secrets reach no other instance's tmpfs.
    code, said, out = ec2_run(tmp_path, ec2_store(), tag, capsys)
    assert code == 1 and "h4-prod-ec2" in said
    assert not out.exists()


@pytest.mark.parametrize(
    "missing",
    [
        "/h4reet/ec2/GATEWAY_ANTHROPIC_API_KEY",
        "/h4reet/ec2/DB_GATEWAY_PASSWORD",
        "/h4reet/hosts/SHARED_STATE_TLS_CA",
    ],
)
def test_ec2s_missing_name_refuses_naming_it_never_a_value(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], missing: str
) -> None:
    held = ec2_store()
    del held[missing]
    code, said, out = ec2_run(tmp_path, held, "h4-prod-ec2", capsys)
    assert code == 1 and missing in said
    assert not out.exists()
    for value in held.values():
        assert value not in said
