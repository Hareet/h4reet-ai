"""The shared state's CA certificate in Parameter Store, in the form its readers take (spec 001 F3, fixes/f3.md;
contracts/shared-state.md §3; contracts/env-cloud.md, `GATEWAY_DB_TLS_CA`).

`make shared-state-tls` (scripts/infra/shared_state.py tls) writes `/h4reet/hosts/SHARED_STATE_TLS_CA`, which both
hosts' env templates read: EC2's as `GATEWAY_DB_TLS_CA`, the tunnel end's as `SHARED_STATE_TLS_CA`, the relay's
`RELAY_DB_TLS_CA`. The value must be base64 of the CA's PEM on one line, the laptop's `GATEWAY_DB_TLS_CA` exactly:

  - each reader's own decoding and pattern (services/gateway/src/meter/store.ts, services/relay/src/config.ts), read
    out of its source and run in Node, takes it as one PEM certificate;
  - deploy/scripts/write_env.py's grammar takes it, on both hosts' real templates, and writes it unchanged;
  - `--rotate` writes the new CA in the same form, and a run without it keeps the value.

The fake `aws` records each `file://` value's contents as the script hands it over (the script deletes the file after
the call). Certificates are made at run time by openssl; nothing here reaches AWS.
"""

from __future__ import annotations

import base64
import importlib.util
import json
import re
import secrets
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
INFRA = REPO / "scripts" / "infra"
CA_PARAMETER = "/h4reet/hosts/SHARED_STATE_TLS_CA"
ACCOUNT = "".join(str((i * 3) % 10) for i in range(12))
PROFILE = "h4reet-admin"
STORE_TS = REPO / "services" / "gateway" / "src" / "meter" / "store.ts"
RELAY_TS = REPO / "services" / "relay" / "src" / "config.ts"
TEMPLATES = {
    "ec2": (REPO / "deploy" / "hosts" / "ec2" / "ec2.env.example", "GATEWAY_DB_TLS_CA"),
    "tunnel-end": (
        REPO / "deploy" / "hosts" / "tunnel-end" / "tunnel-end.env.example",
        "SHARED_STATE_TLS_CA",
    ),
}

pytestmark = pytest.mark.skipif(
    shutil.which("openssl") is None or shutil.which("node") is None,
    reason="needs openssl and node",
)


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


kit = _load("infra_testkit_for_shared_state_ca", INFRA / "infra_testkit.py")
we = _load(
    "write_env_for_shared_state_ca", REPO / "deploy" / "scripts" / "write_env.py"
)

# Wraps the kit's fake: a put-parameter's `file://` value is read before the script deletes it, then the kit's fake
# answers as it always does.
RECORDING_AWS = f"""#!{sys.executable} -I
import json, os, sys
from pathlib import Path
args = sys.argv[1:]
here = Path(__file__).parent
if args[:2] == ["ssm", "put-parameter"]:
    name = args[args.index("--name") + 1]
    value = args[args.index("--value") + 1]
    text = Path(value[len("file://"):]).read_text(encoding="utf-8") if value.startswith("file://") else None
    with open(here.parent / "puts.jsonl", "a", encoding="utf-8") as log:
        log.write(json.dumps({{"name": name, "value": text}}) + "\\n")
os.execv(str(here / "aws-kit"), [str(here / "aws-kit"), *args])
"""


@pytest.fixture
def terminal(tmp_path: Path) -> dict:
    repo = tmp_path / "repo"
    (repo / "scripts" / "infra").mkdir(parents=True)
    (repo / "scripts" / "infra" / "shared_state.py").write_bytes(
        (INFRA / "shared_state.py").read_bytes()
    )
    home = tmp_path / "home"
    env_dir = home / ".config" / "h4reet-ai" / "env"
    env_dir.mkdir(parents=True)
    (home / ".config" / "h4reet-ai").chmod(0o700)
    env_dir.chmod(0o700)
    prod = env_dir / "prod.env"
    prod.write_text(
        "H4_STACK=prod\nGATEWAY_DB_URL=\nGATEWAY_DB_TLS_SERVERNAME=\nGATEWAY_DB_TLS_CA=\n",
        encoding="utf-8",
    )
    prod.chmod(0o600)
    bin_dir = kit.fakes(tmp_path, aws={"ssm put-parameter": {"Version": 1}})
    (bin_dir / "aws").rename(bin_dir / "aws-kit")
    (bin_dir / "aws").write_text(RECORDING_AWS, encoding="utf-8")
    (bin_dir / "aws").chmod(0o755)
    return {
        "repo": repo,
        "home": home,
        "bin": bin_dir,
        "prod": prod,
        "puts": tmp_path / "puts.jsonl",
        "ca": home / ".config" / "h4reet-ai" / "shared-state" / "ca.crt",
    }


def tls(w: dict, *extra: str) -> str:
    """Runs the target; answers the CA parameter's value this run stored."""
    before = len(stored(w))
    done = kit.run_script(
        w["repo"],
        w["home"],
        w["bin"],
        "shared_state.py",
        "tls",
        *extra,
        "--profile",
        PROFILE,
    )
    assert done.returncode == 0, done.stderr
    now = stored(w)
    assert len(now) == before + 1, "one put of the CA parameter a run"
    value = now[-1]
    assert value is not None, "the CA parameter's value came from a file://"
    return value


def stored(w: dict) -> list[str | None]:
    if not w["puts"].is_file():
        return []
    rows = [
        json.loads(line) for line in w["puts"].read_text(encoding="utf-8").splitlines()
    ]
    return [r["value"] for r in rows if r["name"] == CA_PARAMETER]


def laptop_ca(w: dict) -> str:
    lines = w["prod"].read_text(encoding="utf-8").splitlines()
    return dict(ln.split("=", 1) for ln in lines if "=" in ln)["GATEWAY_DB_TLS_CA"]


def assert_one_line_base64_of(value: str, w: dict) -> None:
    assert re.fullmatch(r"[A-Za-z0-9+/]+={0,2}", value), (
        "one line of base64, nothing else"
    )
    assert base64.b64decode(value, validate=True) == w["ca"].read_bytes()
    assert value == laptop_ca(w), (
        "the parameter and the laptop's GATEWAY_DB_TLS_CA are one value"
    )


def reader_patterns() -> tuple[str, str]:
    """Each reader's PEM pattern, out of its own source, after checking each still decodes as this test does."""
    store = STORE_TS.read_text(encoding="utf-8")
    relay = RELAY_TS.read_text(encoding="utf-8")
    assert (
        'const ca = Buffer.from(env.GATEWAY_DB_TLS_CA ?? "", "base64").toString("utf8");'
        in store
    )
    assert "if (!PEM_CERTIFICATE.test(ca)) {" in store
    gateway = re.search(r"^const PEM_CERTIFICATE = (/.+/);$", store, re.MULTILINE)
    assert 'const pem = Buffer.from(caText, "base64").toString("utf8");' in relay
    relay_pattern = re.search(
        r"^\s*if \(!(/.+/)\.test\(pem\)\) \{$", relay, re.MULTILINE
    )
    assert gateway and relay_pattern
    return gateway.group(1), relay_pattern.group(1)


def assert_both_readers_take(value: str) -> None:
    gateway, relay = reader_patterns()
    code = (
        f"const GATEWAY = {gateway};\n"
        f"const RELAY = {relay};\n"
        'const value = require("node:fs").readFileSync(0, "utf8");\n'
        'const ca = Buffer.from(value ?? "", "base64").toString("utf8");\n'
        'const pem = Buffer.from(value, "base64").toString("utf8");\n'
        "console.log(JSON.stringify({ gateway: GATEWAY.test(ca), relay: RELAY.test(pem) }));\n"
    )
    done = subprocess.run(
        ["node", "--input-type=commonjs", "-e", code],
        input=value,
        capture_output=True,
        text=True,
        check=False,
        timeout=60,
    )
    assert done.returncode == 0, done.stderr
    assert json.loads(done.stdout) == {"gateway": True, "relay": True}


def assert_both_hosts_env_files_take(value: str) -> None:
    for host, (template, key) in TEMPLATES.items():

        def fetch(names: list[str]) -> dict[str, str]:
            return {
                n: value if n == CA_PARAMETER else secrets.token_urlsafe(24)
                for n in names
            }

        text, _ = we.render(
            host, template.read_text(encoding="utf-8"), fetch, lambda: ACCOUNT
        )
        values, errors = we.parse_env(text)
        assert errors == []
        assert values[key] == value, f"{host}'s {key} carries the parameter unchanged"


def test_the_ca_parameter_is_base64_of_its_pem_on_one_line_as_the_laptops_is(
    terminal: dict,
) -> None:
    assert_one_line_base64_of(tls(terminal), terminal)


def test_both_readers_take_what_the_script_stores(terminal: dict) -> None:
    assert_both_readers_take(tls(terminal))


def test_both_hosts_env_files_take_it_through_write_envs_grammar(
    terminal: dict,
) -> None:
    assert_both_hosts_env_files_take(tls(terminal))


def test_a_rotation_writes_the_new_ca_in_the_same_form(terminal: dict) -> None:
    first = tls(terminal)
    assert tls(terminal) == first, "without --rotate the CA stays"
    rotated = tls(terminal, "--rotate")
    assert rotated != first, "--rotate makes a new CA"
    assert_one_line_base64_of(rotated, terminal)
    assert_both_readers_take(rotated)
    assert_both_hosts_env_files_take(rotated)
