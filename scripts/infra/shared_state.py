#!/usr/bin/env python3
"""The shared state's three Author-only targets (spec 001 tasks.md T164; FR-019; contracts/shared-state.md §2, §3, §8;
plan.md §16, "The shared state on the tunnel end"). His terminal alone, with his SSO session: each refuses inside the
agent sandbox, and the bash gate refuses the targets to agent sessions (P-G2).

    python3 -I -B scripts/infra/shared_state.py tls [--rotate] [--profile NAME]
    python3 -I -B scripts/infra/shared_state.py roles [--profile NAME]
    python3 -I -B scripts/infra/shared_state.py restore [--dump dumps/<UTC>.dump] [--profile NAME]

tls      a CA kept in ~/.config/h4reet-ai/shared-state/ (0600 in 0700), which agents can't read, made once unless
         --rotate (ROTATE=1); and a new server key and certificate for the one name `shared-state`, signed by it. It
         writes the key to the SecureString /h4reet/tunnel-end/SHARED_STATE_TLS_KEY, the certificate to
         /h4reet/tunnel-end/SHARED_STATE_TLS_CERT, and the CA's to /h4reet/hosts/SHARED_STATE_TLS_CA, each from a 0600
         file, never a command line, and no copy of the server's key stays on the laptop. Then the laptop prod env
         file's GATEWAY_DB_TLS_CA (base64 of the CA's PEM) and GATEWAY_DB_TLS_SERVERNAME, and nothing else in it.
roles    one Systems Manager command on the tunnel end: its host script reads the four role passwords from Parameter
         Store and sets each as a verifier over the store's socket. No password passes through here.
restore  refuses while EC2 runs or the laptop's prod does. It lists the backups' prefix with his session, takes the dump
         he names or the latest, makes a presigned GET for that one object, valid for 15 minutes, and passes it to the
         tunnel end in one Systems Manager command, whose host script fetches it, empties the store, and loads it. It
         prints the dump's name, its time, and the command's ID, never the URL. Systems Manager's command history keeps
         the URL past its expiry (docs/runbooks/shared-state.md).
It prints names, never a value. Exit codes: 0 done; 1 refused; 2 it couldn't run.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

PROG = "shared-state"
PROFILE = re.compile(r"[A-Za-z0-9._-]+")
TARGETS = "Key=tag:Name,Values=h4-prod-tunnel-end"
HOST_SCRIPT = "/opt/h4reet/shared-state/shared_state.py"
SERVER_NAME = "shared-state"
KEY_PARAMETER = "/h4reet/tunnel-end/SHARED_STATE_TLS_KEY"
CERT_PARAMETER = "/h4reet/tunnel-end/SHARED_STATE_TLS_CERT"
CA_PARAMETER = "/h4reet/hosts/SHARED_STATE_TLS_CA"
ENV_KEYS = ("GATEWAY_DB_TLS_SERVERNAME", "GATEWAY_DB_TLS_CA")
DUMP_RE = re.compile(
    r"dumps/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z\.dump"
)
URL_EXPIRY_S = 900
EC2_TAG = "h4-prod-ec2"


class Refused(Exception):
    pass


def config() -> Path:
    return Path.home() / ".config" / "h4reet-ai"


def aws(profile: str, *args: str) -> object:
    done = subprocess.run(
        [
            "aws",
            *args,
            "--profile",
            profile,
            "--region",
            "us-east-1",
            "--output",
            "json",
            "--no-cli-pager",
        ],
        capture_output=True,
        text=True,
        env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(Path.home())},
        check=False,
        stdin=subprocess.DEVNULL,
    )
    if done.returncode != 0:
        raise RuntimeError(f"aws {' '.join(args[:2])} exited {done.returncode}")
    return json.loads(done.stdout or "{}")


def put(profile: str, name: str, value: str, kind: str, folder: Path) -> None:
    """One parameter, its value from a 0600 file that's gone afterwards."""
    fd, path = tempfile.mkstemp(dir=folder)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(value)
        os.chmod(path, 0o600)
        aws(
            profile,
            "ssm",
            "put-parameter",
            "--name",
            name,
            "--type",
            kind,
            "--overwrite",
            "--value",
            f"file://{path}",
        )
    finally:
        os.unlink(path)


def openssl(*args: str) -> None:
    done = subprocess.run(
        ["openssl", *args],
        capture_output=True,
        check=False,
        stdin=subprocess.DEVNULL,
        env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(Path.home())},
    )
    if done.returncode != 0:
        raise RuntimeError(f"openssl {args[0]} failed")


def env_lines(path: Path) -> list[str]:
    if not path.is_file():
        raise Refused(f"{path} is missing: make init-env ENV=prod first")
    lines = path.read_text(encoding="utf-8").splitlines()
    present = {
        line.split("=", 1)[0]
        for line in lines
        if "=" in line and not line.startswith("#")
    }
    missing = [k for k in ENV_KEYS if k not in present]
    if missing:
        raise Refused(
            f"the prod env file lacks {', '.join(missing)}: make init-env ENV=prod SYNC=1 adds them first"
        )
    return lines


def write_env(path: Path, lines: list[str], values: dict[str, str]) -> None:
    out = []
    for line in lines:
        key = line.split("=", 1)[0]
        out.append(
            f"{key}={values[key]}"
            if key in values and not line.startswith("#")
            else line
        )
    tmp = path.with_name(f".{path.name}.tmp")
    fd = os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write("\n".join(out) + "\n")
    os.replace(tmp, path)
    os.chmod(path, 0o600)


def tls(profile: str, rotate: bool) -> int:
    base = config()
    folder = base / "shared-state"
    env_file = base / "env" / "prod.env"
    lines = env_lines(env_file)
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(folder, 0o700)
    ca_key, ca_crt = folder / "ca.key", folder / "ca.crt"
    stage = Path(tempfile.mkdtemp(prefix=".stage-", dir=folder))
    try:
        os.chmod(stage, 0o700)
        if rotate or not (ca_key.is_file() and ca_crt.is_file()):
            openssl(
                "genpkey",
                "-algorithm",
                "EC",
                "-pkeyopt",
                "ec_paramgen_curve:P-256",
                "-out",
                str(stage / "ca.key"),
            )
            openssl(
                "req",
                "-x509",
                "-new",
                "-key",
                str(stage / "ca.key"),
                "-sha256",
                "-days",
                "3650",
                "-subj",
                "/CN=h4reet shared-state CA",
                "-addext",
                "basicConstraints=critical,CA:TRUE",
                "-addext",
                "keyUsage=critical,keyCertSign,cRLSign",
                "-out",
                str(stage / "ca.crt"),
            )
            for name in ("ca.key", "ca.crt"):
                os.chmod(stage / name, 0o600)
                os.replace(stage / name, folder / name)
        key, csr, crt, ext = (
            stage / n for n in ("server.key", "server.csr", "server.crt", "server.ext")
        )
        openssl(
            "genpkey",
            "-algorithm",
            "EC",
            "-pkeyopt",
            "ec_paramgen_curve:P-256",
            "-out",
            str(key),
        )
        os.chmod(key, 0o600)
        openssl(
            "req",
            "-new",
            "-key",
            str(key),
            "-subj",
            f"/CN={SERVER_NAME}",
            "-out",
            str(csr),
        )
        ext.write_text(
            "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\n"
            f"subjectAltName=DNS:{SERVER_NAME}\n",
            encoding="utf-8",
        )
        openssl(
            "x509",
            "-req",
            "-in",
            str(csr),
            "-CA",
            str(ca_crt),
            "-CAkey",
            str(ca_key),
            "-set_serial",
            str(secrets.randbits(63)),
            "-days",
            "825",
            "-sha256",
            "-extfile",
            str(ext),
            "-out",
            str(crt),
        )
        ca_pem = ca_crt.read_text(encoding="utf-8")
        put(
            profile,
            KEY_PARAMETER,
            key.read_text(encoding="utf-8"),
            "SecureString",
            stage,
        )
        put(profile, CERT_PARAMETER, crt.read_text(encoding="utf-8"), "String", stage)
        put(profile, CA_PARAMETER, ca_pem, "String", stage)
        write_env(
            env_file,
            lines,
            {
                "GATEWAY_DB_TLS_CA": base64.b64encode(ca_pem.encode()).decode(),
                "GATEWAY_DB_TLS_SERVERNAME": SERVER_NAME,
            },
        )
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    print(f"{PROG}: wrote {KEY_PARAMETER}, {CERT_PARAMETER}, and {CA_PARAMETER}")
    print(
        f"{PROG}: the laptop's prod env file has GATEWAY_DB_TLS_CA and GATEWAY_DB_TLS_SERVERNAME; the CA stays in {folder}"
    )
    return 0


def send(profile: str, command: str, comment: str) -> str:
    sent = aws(
        profile,
        "ssm",
        "send-command",
        "--document-name",
        "AWS-RunShellScript",
        "--targets",
        TARGETS,
        "--comment",
        comment,
        "--parameters",
        json.dumps({"commands": [command]}),
    )
    return (
        str((sent.get("Command") or {}).get("CommandId", ""))
        if isinstance(sent, dict)
        else ""
    )


def roles(profile: str) -> int:
    command_id = send(
        profile, f"python3 -I -B {HOST_SCRIPT} roles", "h4reet shared-state roles"
    )
    print(
        f"{PROG}: the tunnel end sets the four roles' passwords: Systems Manager command {command_id}"
    )
    return 0


def laptop_prod_running() -> bool:
    try:
        done = subprocess.run(
            [
                "docker",
                "ps",
                "--filter",
                "label=com.docker.compose.project=h4reet-prod",
                "--format",
                "{{.Names}}",
            ],
            capture_output=True,
            text=True,
            check=False,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise Refused(
            "docker didn't answer, so whether the laptop's prod runs is unknown"
        ) from None
    if done.returncode != 0:
        raise Refused("docker ps failed, so whether the laptop's prod runs is unknown")
    return bool(done.stdout.strip())


def restore(profile: str, dump: str | None) -> int:
    found = aws(
        profile,
        "ec2",
        "describe-instances",
        "--filters",
        f"Name=tag:Name,Values={EC2_TAG}",
        "Name=instance-state-name,Values=pending,running,stopping,shutting-down",
    )
    if not isinstance(found, dict) or any(
        r.get("Instances") for r in found.get("Reservations") or []
    ):
        raise Refused(
            "EC2 isn't stopped: make ec2-autostart STATE=off and make ec2-stop first (§8, step 1)"
        )
    if laptop_prod_running():
        raise Refused("the laptop's prod runs: make down ENV=prod first (§8, step 1)")
    identity = aws(profile, "sts", "get-caller-identity")
    account = str(identity.get("Account", "")) if isinstance(identity, dict) else ""
    if not re.fullmatch(r"[0-9]{12}", account):
        raise RuntimeError("sts get-caller-identity named no account")
    bucket = f"h4reet-ai-shared-state-{account}"
    listed = aws(
        profile, "s3api", "list-objects-v2", "--bucket", bucket, "--prefix", "dumps/"
    )
    objects = {
        str(o.get("Key")): str(o.get("LastModified", ""))
        for o in (listed.get("Contents") or [] if isinstance(listed, dict) else [])
        if DUMP_RE.fullmatch(str(o.get("Key", "")))
    }
    if not objects:
        raise Refused(f"no dump under dumps/ in {bucket}: nothing to restore")
    key = dump if dump is not None else max(objects)
    if key not in objects:
        raise Refused(f"{key} isn't in the backups' bucket")
    url = aws(
        profile,
        "s3",
        "presign",
        f"s3://{bucket}/{key}",
        "--expires-in",
        str(URL_EXPIRY_S),
    )
    if not isinstance(url, str) or not url.startswith("https://") or "'" in url:
        raise RuntimeError("s3 presign answered no URL")
    command_id = send(
        profile,
        f"printf '%s\\n' '{url}' | python3 -I -B {HOST_SCRIPT} restore",
        "h4reet shared-state restore",
    )
    print(
        f"{PROG}: restoring {key} (written {objects[key]}) on the tunnel end: Systems Manager command {command_id}"
    )
    print(
        f"{PROG}: next, once it reports success: make operator-restore ENV=shared, then operator-init (§8, steps 3, 4)"
    )
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="shared_state.py", description=__doc__.split("\n\n", 1)[0]
    )
    sub = parser.add_subparsers(dest="action", required=True)
    make_tls = sub.add_parser("tls")
    make_tls.add_argument("--rotate", action="store_true")
    sub.add_parser("roles")
    load = sub.add_parser("restore")
    load.add_argument("--dump")
    for p in (make_tls, *(sub.choices[n] for n in ("roles", "restore"))):
        p.add_argument("--profile")
    args = parser.parse_args(argv)
    if os.environ.get("SANDBOX_RUNTIME") == "1":
        print(
            f"{PROG}: this is the Author's: it reaches his account with his SSO session",
            file=sys.stderr,
        )
        return 2
    profile = args.profile or os.environ.get("AWS_PROFILE", "")
    if not PROFILE.fullmatch(profile or ""):
        print(f"{PROG}: name the SSO profile: PROFILE=<name>", file=sys.stderr)
        return 2
    if (
        args.action == "restore"
        and args.dump is not None
        and not DUMP_RE.fullmatch(args.dump)
    ):
        print(
            f"{PROG}: --dump names a key under dumps/, as dumps/<UTC>.dump",
            file=sys.stderr,
        )
        return 2
    try:
        if args.action == "tls":
            return tls(profile, args.rotate)
        if args.action == "roles":
            return roles(profile)
        return restore(profile, args.dump)
    except Refused as refused:
        print(f"{PROG}: {refused}", file=sys.stderr)
        return 1
    except (RuntimeError, OSError, ValueError) as error:
        print(f"{PROG}: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
