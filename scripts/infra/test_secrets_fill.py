"""Tests for scripts/infra/secrets_fill.py, the Author's make secrets-fill (spec 001 fixes/f8.md; research.md R-26;
contracts/env-cloud.md §1). His terminal alone: it refuses inside the agent sandbox, and the bash gate refuses the
target to agent sessions (the patch for his hand, P-1's list).

It writes each Parameter Store name infra/parameters.txt expects and lacks, once:
  - copied from the laptop's prod env file where the laptop has the value, under the key the laptop's file uses;
  - generated in deploy/scripts/init_env.py's shapes otherwise;
  - asked at a hidden prompt when neither, and only on a terminal;
never with --overwrite, each value through a 0600 file in a 0700 folder, never on a command line; it prints names,
never values, and leaves the names another writer owns (make tunnel-keys, make shared-state-tls, Terraform) to it.

The aws CLI is a fake of this file's, which records each call's argv and, for put-parameter, the value file's mode,
its folder's mode, and its content. The values below are made-up stand-ins, never a secret.
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import select
import subprocess
import sys
import time
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
PROFILE = "h4reet-admin"

LIST = """# A stand-in for infra/parameters.txt: one name of each kind.
/h4reet/alerts/TELEGRAM_BOT_TOKEN SecureString
/h4reet/audit/IAM_ALLOW SecureString
/h4reet/tunnel-end/HOST_KEY SecureString
/h4reet/tunnel-end/AUTHORIZED_KEY String
/h4reet/tunnel-end/RELAY_TOKEN_EC2 SecureString
/h4reet/tunnel-end/DB_RELAY_RO_PASSWORD SecureString
/h4reet/tunnel-end/DB_RELAY_RW_PASSWORD SecureString
/h4reet/ec2/RELAY_TOKEN_SELF SecureString
/h4reet/ec2/SNAPSHOT_SINK_TOKEN SecureString
/h4reet/hosts/RELEASE_BUCKET String
/h4reet/prod/tunnel-end-address String
/h4reet/hosts/SHARED_STATE_TLS_CA String
/h4reet/ec2/DB_GATEWAY_PASSWORD SecureString
/h4reet/ec2/DB_GRAFANA_RO_PASSWORD SecureString
/h4reet/ec2/GATEWAY_ANTHROPIC_API_KEY SecureString
/h4reet/ec2/OPERATOR_TOKEN_SHA256 SecureString
/h4reet/ec2/SMTP_HOST SecureString
/h4reet/ec2/LANGFUSE_PUBLIC_KEY SecureString
/h4reet/ec2/LANGFUSE_SECRET_KEY SecureString
/h4reet/ec2/SEAWEEDFS_S3_ACCESS_KEY SecureString
/h4reet/ec2/VALKEY_PASSWORD SecureString
/h4reet/ec2/CLICKHOUSE_PASSWORD SecureString
"""
TYPES = {
    line.split()[0]: line.split()[1]
    for line in LIST.splitlines()
    if line.startswith("/")
}
# The laptop's prod env file: made-up stand-ins, in the file's own forms (a quoted value, a placeholder, an empty one).
PROD_ENV = {
    "H4_HOST": "laptop",
    "TELEGRAM_BOT_TOKEN": "standin-telegram-bot",
    "GATEWAY_DB_PASSWORD": "standin-laptop-gateway-db",
    "GATEWAY_GRAFANA_RO_PASSWORD": "standin-laptop-grafana-ro",
    "GATEWAY_ANTHROPIC_API_KEY": "standin-anthropic-key",
    "OPERATOR_TOKEN_SHA256": "'standin-operator-hash'",
    "SMTP_HOST": "standin-smtp-host",
    "RELAY_TOKEN_SELF": "standin-laptop-relay-token",
    "SNAPSHOT_SINK_TOKEN": "standin-laptop-sink-token",
    "CLICKHOUSE_PASSWORD": "__GENERATE__",
    "VALKEY_PASSWORD": "standin-laptop-valkey",
}
IAM_ALLOW = "arn:aws:iam::000000000000:role/standin-one\narn:aws:iam::000000000000:role/standin-two\n"
# What exists already: the store's answer to describe-parameters.
HAVE = {"/h4reet/ec2/VALKEY_PASSWORD": "SecureString"}
# Names another writer owns, and the words that name it.
OTHERS = {
    "/h4reet/tunnel-end/HOST_KEY": "make tunnel-keys",
    "/h4reet/tunnel-end/AUTHORIZED_KEY": "make tunnel-keys",
    "/h4reet/tunnel-end/RELAY_TOKEN_EC2": "make tunnel-keys",
    "/h4reet/ec2/RELAY_TOKEN_SELF": "make tunnel-keys",
    "/h4reet/ec2/SNAPSHOT_SINK_TOKEN": "make tunnel-keys",
    "/h4reet/hosts/SHARED_STATE_TLS_CA": "make shared-state-tls",
    "/h4reet/hosts/RELEASE_BUCKET": "apply",
    "/h4reet/prod/tunnel-end-address": "apply",
}

FAKE_AWS = f"""#!{sys.executable} -I
import json, stat, sys
from pathlib import Path
args = sys.argv[1:]
fake = json.loads(Path(__file__).with_name("fake.json").read_text(encoding="utf-8"))
row = {{"argv": args}}
code = 0
out = ""
if args[:2] == ["ssm", "describe-parameters"]:
    out = json.dumps({{"Parameters": [{{"Name": n, "Type": t}} for n, t in fake["have"].items()]}})
elif args[:2] == ["ssm", "put-parameter"]:
    value = args[args.index("--value") + 1] if "--value" in args else ""
    if value.startswith("file://"):
        path = Path(value[len("file://"):])
        row["file_mode"] = stat.S_IMODE(path.stat().st_mode)
        row["dir_mode"] = stat.S_IMODE(path.parent.stat().st_mode)
        row["content"] = path.read_text(encoding="utf-8")
        row["path"] = str(path)
    name = args[args.index("--name") + 1]
    if name in fake.get("exists_on_put", []):
        sys.stderr.write("An error occurred (ParameterAlreadyExists) when calling the PutParameter operation\\n")
        code = 254
    else:
        out = json.dumps({{"Version": 1, "Tier": "Standard"}})
else:
    sys.stderr.write("An error occurred (AccessDenied) when calling it\\n")
    code = 254
with open(fake["log"], "a", encoding="utf-8") as log:
    log.write(json.dumps(row) + "\\n")
sys.stdout.write(out)
sys.exit(code)
"""


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def write_prod_env(home: Path, values: dict[str, str]) -> Path:
    path = home / ".config" / "h4reet-ai" / "env" / "prod.env"
    path.write_text(
        "# the laptop's prod env file\n"
        + "".join(f"{k}={v}\n" for k, v in values.items()),
        encoding="utf-8",
    )
    path.chmod(0o600)
    return path


def fake(world: dict, **extra: object) -> None:
    (world["bin"] / "fake.json").write_text(
        json.dumps({"log": str(world["log"]), "have": HAVE, **extra}), encoding="utf-8"
    )


@pytest.fixture
def world(tmp_path: Path) -> dict:
    repo = tmp_path / "repo"
    (repo / "scripts" / "infra").mkdir(parents=True)
    (repo / "scripts" / "infra" / "secrets_fill.py").write_bytes(
        (HERE / "secrets_fill.py").read_bytes()
    )
    (repo / "deploy" / "scripts").mkdir(parents=True)
    (repo / "deploy" / "scripts" / "init_env.py").write_bytes(
        (REPO / "deploy" / "scripts" / "init_env.py").read_bytes()
    )
    (repo / "infra").mkdir()
    (repo / "infra" / "parameters.txt").write_text(LIST, encoding="utf-8")
    home = tmp_path / "home"
    base = home / ".config" / "h4reet-ai"
    (base / "env").mkdir(parents=True)
    (base / "infra").mkdir()
    for folder in (base, base / "env", base / "infra"):
        folder.chmod(0o700)
    write_prod_env(home, PROD_ENV)
    (base / "infra" / "iam-allow.txt").write_text(IAM_ALLOW, encoding="utf-8")
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "aws").write_text(FAKE_AWS, encoding="utf-8")
    (bin_dir / "aws").chmod(0o755)
    w = {
        "repo": repo,
        "home": home,
        "base": base,
        "bin": bin_dir,
        "log": tmp_path / "calls.jsonl",
    }
    fake(w)
    return w


def argv(w: dict, *args: str) -> tuple[list[str], dict[str, str]]:
    env = {"PATH": f"{w['bin']}:/usr/bin:/bin", "HOME": str(w["home"])}
    return [
        sys.executable,
        "-I",
        "-B",
        str(w["repo"] / "scripts" / "infra" / "secrets_fill.py"),
        *args,
    ], env


def run(
    w: dict, *args: str, profile: bool = True, **env: str
) -> subprocess.CompletedProcess[str]:
    cmd, base = argv(w, *args, *(("--profile", PROFILE) if profile else ()))
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=w["repo"],
        env={**base, **env},
        check=False,
        stdin=subprocess.DEVNULL,
        timeout=120,
    )


def calls(w: dict) -> list[dict]:
    if not w["log"].is_file():
        return []
    return [
        json.loads(line) for line in w["log"].read_text(encoding="utf-8").splitlines()
    ]


def puts(w: dict) -> dict[str, dict]:
    return {
        c["argv"][c["argv"].index("--name") + 1]: c
        for c in calls(w)
        if c["argv"][:2] == ["ssm", "put-parameter"]
    }


def every_value(w: dict) -> list[str]:
    """Each value written, and the laptop's values, which must show nowhere but in a value file."""
    laptop = [
        v.strip("'")
        for k, v in PROD_ENV.items()
        if k != "H4_HOST" and v and not v.startswith("__")
    ]
    return (
        [c["content"] for c in puts(w).values() if c.get("content")]
        + laptop
        + [IAM_ALLOW.strip()]
    )


def test_refuses_inside_the_sandbox(world: dict) -> None:
    done = run(world, SANDBOX_RUNTIME="1")
    assert done.returncode == 2
    assert "the Author's" in done.stderr
    assert calls(world) == []


def test_needs_a_named_profile(world: dict) -> None:
    done = run(world, profile=False)
    assert done.returncode == 2
    assert "PROFILE=" in done.stderr
    assert calls(world) == []


def test_writes_only_the_missing_names_each_once_never_overwriting(world: dict) -> None:
    done = run(world)
    assert done.returncode == 0, done.stderr
    written = puts(world)
    fillable = set(TYPES) - set(HAVE) - set(OTHERS)
    assert set(written) == fillable
    for name, call in written.items():
        args = call["argv"]
        assert args[args.index("--type") + 1] == TYPES[name], name
        assert "--overwrite" not in args, name
        assert args[args.index("--profile") + 1] == PROFILE
    assert "/h4reet/ec2/VALKEY_PASSWORD" not in written
    assert [c["argv"][:2] for c in calls(world)].count(["ssm", "put-parameter"]) == len(
        fillable
    )


def test_copies_from_prod_env_where_the_laptop_has_the_value(world: dict) -> None:
    done = run(world)
    assert done.returncode == 0, done.stderr
    written = puts(world)
    expect = {
        "/h4reet/alerts/TELEGRAM_BOT_TOKEN": PROD_ENV["TELEGRAM_BOT_TOKEN"],
        # The shared state's roles: the laptop's file names them GATEWAY_DB_PASSWORD and GATEWAY_GRAFANA_RO_PASSWORD.
        "/h4reet/ec2/DB_GATEWAY_PASSWORD": PROD_ENV["GATEWAY_DB_PASSWORD"],
        "/h4reet/ec2/DB_GRAFANA_RO_PASSWORD": PROD_ENV["GATEWAY_GRAFANA_RO_PASSWORD"],
        "/h4reet/ec2/GATEWAY_ANTHROPIC_API_KEY": PROD_ENV["GATEWAY_ANTHROPIC_API_KEY"],
        "/h4reet/ec2/OPERATOR_TOKEN_SHA256": "standin-operator-hash",
        "/h4reet/ec2/SMTP_HOST": PROD_ENV["SMTP_HOST"],
        # The audit's allowlist: the same lines as the laptop's iam-allow.txt.
        "/h4reet/audit/IAM_ALLOW": IAM_ALLOW,
    }
    for name, value in expect.items():
        assert written[name]["content"] == value, name
    assert "copied from prod.env's GATEWAY_DB_PASSWORD" in done.stdout
    assert "copied from prod.env's GATEWAY_GRAFANA_RO_PASSWORD" in done.stdout


def test_never_copies_the_laptops_relay_token_to_ec2(world: dict) -> None:
    done = run(world)
    assert done.returncode == 0, done.stderr
    written = puts(world)
    assert "/h4reet/ec2/RELAY_TOKEN_SELF" not in written
    assert "/h4reet/ec2/SNAPSHOT_SINK_TOKEN" not in written
    for call in written.values():
        assert call["content"] not in (
            PROD_ENV["RELAY_TOKEN_SELF"],
            PROD_ENV["SNAPSHOT_SINK_TOKEN"],
        )


def test_generates_in_init_envs_shapes_where_the_laptop_has_none(world: dict) -> None:
    done = run(world)
    assert done.returncode == 0, done.stderr
    written = puts(world)
    hex64 = re.compile(r"[0-9a-f]{64}")
    uuid4 = r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
    shapes = {
        "/h4reet/tunnel-end/DB_RELAY_RO_PASSWORD": hex64,
        "/h4reet/tunnel-end/DB_RELAY_RW_PASSWORD": hex64,
        # __GENERATE__ in the laptop's file is no value: a shape of init_env's.
        "/h4reet/ec2/CLICKHOUSE_PASSWORD": hex64,
        "/h4reet/ec2/LANGFUSE_PUBLIC_KEY": re.compile("pk-lf-" + uuid4),
        "/h4reet/ec2/LANGFUSE_SECRET_KEY": re.compile("sk-lf-" + uuid4),
        "/h4reet/ec2/SEAWEEDFS_S3_ACCESS_KEY": re.compile(r"[0-9A-F]{20}"),
    }
    for name, shape in shapes.items():
        assert shape.fullmatch(written[name]["content"]), name
        assert f"{name}" in done.stdout and "generated" in done.stdout
    ro = written["/h4reet/tunnel-end/DB_RELAY_RO_PASSWORD"]["content"]
    rw = written["/h4reet/tunnel-end/DB_RELAY_RW_PASSWORD"]["content"]
    assert ro != rw


def test_leaves_the_names_another_writer_owns_to_it(world: dict) -> None:
    done = run(world)
    assert done.returncode == 0, done.stderr
    written = puts(world)
    lines = done.stdout.splitlines()
    for name, writer in OTHERS.items():
        assert name not in written, name
        (line,) = [line for line in lines if line.startswith(name + " ")]
        assert writer in line, line


def test_values_only_through_0600_files_never_a_command_line_or_the_output(
    world: dict,
) -> None:
    done = run(world)
    assert done.returncode == 0, done.stderr
    written = puts(world)
    assert written
    for name, call in written.items():
        value = call["argv"][call["argv"].index("--value") + 1]
        assert value.startswith("file://"), name
        assert call["file_mode"] == 0o600, name
        assert call["dir_mode"] == 0o700, name
        path = Path(call["path"])
        assert world["base"] in path.parents, name
        assert not path.exists(), name
        assert not path.parent.exists(), name
    said = done.stdout + done.stderr
    for value in every_value(world):
        assert value not in said
        for call in calls(world):
            assert value not in " ".join(call["argv"])


def test_refuses_without_the_laptops_prod_env_file(world: dict) -> None:
    (world["base"] / "env" / "prod.env").unlink()
    done = run(world)
    assert done.returncode == 1
    assert "make init-env ENV=prod" in done.stderr
    assert puts(world) == {}


def test_a_name_written_meanwhile_is_reported_never_replaced(world: dict) -> None:
    fake(world, exists_on_put=["/h4reet/ec2/SMTP_HOST"])
    done = run(world)
    assert done.returncode == 1
    assert "/h4reet/ec2/SMTP_HOST" in done.stdout + done.stderr
    assert "ParameterAlreadyExists" in done.stdout + done.stderr
    assert "/h4reet/ec2/LANGFUSE_PUBLIC_KEY" in puts(world)
    assert all("--overwrite" not in c["argv"] for c in calls(world))


def test_writes_nothing_when_nothing_is_missing(world: dict) -> None:
    fake(world, have=TYPES)
    done = run(world)
    assert done.returncode == 0, done.stderr
    assert puts(world) == {}
    assert "nothing to write" in done.stdout


def neither(world: dict) -> None:
    """The laptop has neither SMTP_HOST (still __ASK__) nor GATEWAY_ANTHROPIC_API_KEY (empty), and neither has a shape."""
    write_prod_env(
        world["home"],
        {**PROD_ENV, "SMTP_HOST": "__ASK__", "GATEWAY_ANTHROPIC_API_KEY": ""},
    )


def test_refuses_to_ask_without_a_terminal_and_writes_nothing(world: dict) -> None:
    neither(world)
    done = run(world)
    assert done.returncode == 1
    assert "/h4reet/ec2/SMTP_HOST" in done.stderr
    assert "/h4reet/ec2/GATEWAY_ANTHROPIC_API_KEY" in done.stderr
    assert "terminal" in done.stderr
    assert puts(world) == {}


def read_until(
    fd: int, want: bytes, have: bytearray, count: int = 1, seconds: float = 60.0
) -> None:
    """Read fd into have until want shows count times."""
    end = time.monotonic() + seconds
    while have.count(want) < count:
        left = end - time.monotonic()
        assert left > 0, f"no {want!r} in {bytes(have)!r}"
        ready, _, _ = select.select([fd], [], [], left)
        if ready:
            chunk = os.read(fd, 4096)
            assert chunk, f"closed before {want!r}: {bytes(have)!r}"
            have.extend(chunk)


def test_asks_at_a_hidden_prompt_when_neither_source_has_a_value(world: dict) -> None:
    neither(world)
    answers = {
        "/h4reet/ec2/SMTP_HOST": "standin-typed-smtp",
        "/h4reet/ec2/GATEWAY_ANTHROPIC_API_KEY": "standin-typed-key",
    }
    master, slave = os.openpty()
    cmd, env = argv(world, "--profile", PROFILE)
    child = subprocess.Popen(
        cmd,
        cwd=world["repo"],
        env=env,
        stdin=slave,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
    )
    os.close(slave)
    err = bytearray()
    echoed = bytearray()
    try:
        for count in (1, 2):
            # Each answer only once its prompt shows: getpass turns the echo off before it writes the prompt.
            read_until(child.stderr.fileno(), b"(hidden): ", err, count)
            prompt = (
                bytes(err).rsplit(b"(hidden): ", 1)[0].rsplit(b"\n", 1)[-1].decode()
            )
            (name,) = [n for n in answers if n in prompt]
            os.write(master, answers[name].encode() + b"\n")
        out, rest = child.communicate(timeout=120)
        err.extend(rest)
        while True:
            ready, _, _ = select.select([master], [], [], 0.2)
            if not ready:
                break
            try:
                chunk = os.read(master, 4096)
            except OSError:
                break
            if not chunk:
                break
            echoed.extend(chunk)
    finally:
        if child.poll() is None:
            child.kill()
        os.close(master)
    assert child.returncode == 0, bytes(err).decode()
    written = puts(world)
    for name, value in answers.items():
        assert written[name]["content"] == value, name
        assert "--overwrite" not in written[name]["argv"]
        assert value.encode() not in echoed, "the terminal echoed the answer"
        assert value.encode() not in out + bytes(err)
        assert all(value not in " ".join(c["argv"]) for c in calls(world))
    assert "from the prompt" in out.decode()


# Q30 (rv-f8's R-1): every String on the list is Terraform's or a target's. impl-f7's autostart switch and health
# check's ID are Terraform's, and OTHERS doesn't name them; the third is made up, with no laptop value and no shape.
STRINGS = {
    "/h4reet/prod/ec2-autostart": "standin-autostart",
    "/h4reet/tunnel-end/HEALTH_CHECK_ID": "standin-health-check-id",
    "/h4reet/prod/standin-switch": None,
}
STRINGS_LIST = (
    "# Three Strings another writer owns, and a SecureString the laptop has.\n"
    + "".join(f"{name} String\n" for name in STRINGS)
    + "/h4reet/ec2/SMTP_HOST SecureString\n"
)


def test_leaves_every_string_to_its_writer_never_asking_or_writing_one(
    world: dict,
) -> None:
    (world["repo"] / "infra" / "parameters.txt").write_text(
        STRINGS_LIST, encoding="utf-8"
    )
    laptop = {
        name.rsplit("/", 1)[1]: value
        for name, value in STRINGS.items()
        if value is not None
    }
    write_prod_env(world["home"], {**PROD_ENV, **laptop})
    fake(world, have={})
    master, slave = os.openpty()
    cmd, env = argv(world, "--profile", PROFILE)
    child = subprocess.Popen(
        cmd,
        cwd=world["repo"],
        env=env,
        stdin=slave,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
    )
    os.close(slave)
    err = bytearray()
    prompts = 0
    try:
        # A terminal is attached, so a name that fell through would be asked for: each prompt seen is counted and
        # answered empty (a skip), so the run goes on to its writes.
        fd = child.stderr.fileno()
        end = time.monotonic() + 60
        while True:
            left = end - time.monotonic()
            assert left > 0, f"no end: {bytes(err)!r}"
            ready, _, _ = select.select([fd], [], [], left)
            if not ready:
                continue
            chunk = os.read(fd, 4096)
            if not chunk:
                break
            err.extend(chunk)
            while err.count(b"(hidden): ") > prompts:
                prompts += 1
                os.write(master, b"\n")
        out, rest = child.communicate(timeout=120)
        err.extend(rest)
    finally:
        if child.poll() is None:
            child.kill()
        os.close(master)
    written = puts(world)
    for name in STRINGS:
        assert name not in written, f"{name} written from outside its writer"
    assert prompts == 0, bytes(err).decode()
    assert child.returncode == 0, bytes(err).decode()
    lines = out.decode().splitlines()
    for name in STRINGS:
        (line,) = [line for line in lines if line.startswith(name + " ")]
        assert "missing;" in line, line
        assert "Terraform's or a target's" in line, line
    assert "3 left to their writers" in out.decode()
    assert written["/h4reet/ec2/SMTP_HOST"]["content"] == PROD_ENV["SMTP_HOST"]
    said = out + bytes(err)
    for value in laptop.values():
        assert value.encode() not in said
        assert all(value not in " ".join(c["argv"]) for c in calls(world))


def test_every_string_on_the_repositorys_list_is_left_to_its_writer(
    world: dict,
) -> None:
    listed = (REPO / "infra" / "parameters.txt").read_text(encoding="utf-8")
    (world["repo"] / "infra" / "parameters.txt").write_text(listed, encoding="utf-8")
    kinds = {
        line.split()[0]: line.split()[1]
        for line in listed.splitlines()
        if line.startswith("/")
    }
    strings = sorted(name for name, kind in kinds.items() if kind == "String")
    assert strings
    # A laptop value under every name's last part, so nothing is generated or asked: a String that fell through
    # would be copied.
    laptop = {
        name.rsplit("/", 1)[1]: f"standin-laptop-{number}"
        for number, name in enumerate(kinds)
    }
    write_prod_env(world["home"], {**PROD_ENV, **laptop})
    fake(world, have={})
    done = run(world)
    assert done.returncode == 0, done.stderr
    written = puts(world)
    lines = done.stdout.splitlines()
    for name in strings:
        assert name not in written, f"{name} written from outside its writer"
        (line,) = [line for line in lines if line.startswith(name + " ")]
        assert "missing;" in line, line
        assert "wrote" not in line, line


def test_its_tables_match_the_other_writers_and_the_laptops_file() -> None:
    module = _load("secrets_fill_tables", HERE / "secrets_fill.py")
    for script in ("tunnel_keys.py", "shared_state.py"):
        text = (HERE / script).read_text(encoding="utf-8")
        for name in set(re.findall(r'"(/h4reet/[A-Za-z0-9_./-]+)"', text)):
            if name == "/h4reet/prod/tunnel-end-address":
                continue  # tunnel_keys.py reads it; prod's apply writes it
            assert name in module.OTHERS, (script, name)
    laptop = {
        line.split("=", 1)[0]
        for line in (REPO / "deploy" / "env.example" / "prod.env.example")
        .read_text(encoding="utf-8")
        .splitlines()
        if "=" in line and not line.startswith("#")
    }
    for name, key in module.LAPTOP_KEY.items():
        assert key in laptop, (name, key)
    listed = {
        line.split()[0]
        for line in (REPO / "infra" / "parameters.txt")
        .read_text(encoding="utf-8")
        .splitlines()
        if line.startswith("/")
    }
    for name in (*module.LAPTOP_KEY, *module.SHAPE_AS, *module.LAPTOP_FILE):
        assert name in listed, name


MAKEFILE = (REPO / "Makefile").read_text(encoding="utf-8")


def test_the_target_is_the_authors_and_runs_its_script() -> None:
    recipe = MAKEFILE.split("\nsecrets-fill:", 1)[1].split("\n\n", 1)[0]
    assert "## (the Author)" in recipe.splitlines()[0]
    assert "$(call AUTHOR_ONLY," in recipe
    assert "@$(PY_HOST) scripts/infra/secrets_fill.py$(WITH_PROFILE)" in recipe
    phony = " ".join(
        block.split("\n\n", 1)[0].replace("\\\n", " ")
        for block in MAKEFILE.split("\n.PHONY:")[1:]
    )
    assert " secrets-fill " in f" {phony} "
