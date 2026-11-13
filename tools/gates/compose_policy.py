#!/usr/bin/env python3
"""The compose and file policy (spec 000 FR-014, FR-016, FR-017, FR-020, FR-036, FR-040; plan §1, §2, §11).

    python3 -I -B -X pycache_prefix=/dev/null tools/gates/compose_policy.py [--root DIR]

For each committed env file (the prod and dev templates and deploy/env.agents/dev-cpu.vars) it renders the one
compose file without interpolating anything, in an environment holding nothing but PATH and HOME:

    docker compose -p h4reet-<stack> -f deploy/compose.yaml --env-file <file> \\
      config --no-interpolate --no-path-resolution --format json

and refuses, in what compose rendered:
  - privileged mode; a pid, ipc, uts, userns, or cgroup namespace shared with the host or another container; any
    network_mode; the Docker socket;
  - devices, device cgroup rules, gpus, and runtimes, except model-server-gpu's one NVIDIA reservation in the gpu
    profile;
  - binds outside ${H4_TREE}/deploy, ${H4_TREE}/config, ${H4_MODEL_DIR}, ${H4_STATE_DIR}/gateway, and ${H4_AWS_DIR}, or
    writable outside ${H4_STATE_DIR}/gateway, but for the one read-only bind each of spec 001's tunnel's ends takes
    (SERVICE_BINDS), and the shared state's data, writable, from group 6; a volume that isn't a declared, local named
    volume;
  - ports on any service but edge, or on anything but the literal 127.0.0.1, but for the tunnel end's two, exactly,
    on its public interface's fixed address (CLOUD_PORTS);
  - the egress network on any service but gateway, spec 001's laptop tunnel, and the tunnel end's collector; the edge
    network on any service but edge and the tunnel end's sshd; a service off the internal network, and any network but
    internal (internal-only), edge, and egress;
  - an image without a digest, or one that differs from deploy/images.lock. One exception, reported PLANNED rather
    than refused: a service of OPEN_PINS whose lock line is still open (tag and digest "-") and whose image is that
    line's bare repository, until make pin-images pins it. Once the lock holds a digest the ordinary check applies,
    so the mark expires with the pin (plan §11). And two names that are no registry's: the images of SHARED_IMAGES,
    make up's own builds of the gateway (tasks.md T184) and of the room's site (spec 002, contracts/web-serving.md
    §1), each on its service alone, as written there, with pull_policy: never, so compose never pulls an image by
    either name. And spec 001's cloud classes (its contracts/env-cloud.md §3): a service in a cloud host's profile
    alone runs from the account's registry, an image its release builds by the release's digest (RELEASE_IMAGES), or
    an upstream image's copy by the lock's own digest (UPSTREAM_COPIES), and never builds;
  - a build context that is absolute, interpolated, or outside the compose file's tree; a built service that
    names an image; inline Dockerfiles, extra contexts, host networking, and entitlements in a build;
  - plan §1's rules for every service: no container_name, no env_file, no external resource, no extra_hosts or
    volumes_from, cap_drop ALL with cap_add only CHOWN, SETUID, SETGID, FOWNER, and DAC_OVERRIDE,
    no-new-privileges and nothing that relaxes it, restart unless-stopped, and Docker's local log driver;
  - a dev-only switch that compose sets itself instead of taking it from the env file;
  - the Anthropic API key (spec 010): an ANTHROPIC_* variable on any service, or a reference to one anywhere;
    GATEWAY_ANTHROPIC_API_KEY on any service but gateway, on gateway in any form but
    ${GATEWAY_ANTHROPIC_API_KEY:-}, or its name anywhere else (another variable, a build argument, a label, a
    command);
  - a service with no row in docs/data-flow-disclosure.md (a row whose "From" names it in backticks).

Then the files:
  - a dev-only switch (GATEWAY_TEST_CLOCK, GATEWAY_TEST_SYNTHETIC_SPEND) or TELEMETRY_PAYLOAD_SAMPLING=on in an
    env file whose H4_ENV isn't dev, such as the prod template, or a switch with a value it doesn't take; a
    COMPOSE_* key other than COMPOSE_PROJECT_NAME and COMPOSE_PROFILES, which would change what compose loads;
  - a Dockerfile FROM without a digest, or with one deploy/images.lock doesn't pin;
  - an env file anywhere in the working tree (*.env, .env, .env.*, but not *.env.example), ignored or not;
  - in .devcontainer/devcontainer.json: features, initializeCommand, host mounts, privileged runArgs, or a
    ${localEnv:...} reference, which would carry the host's environment in;
  - an .npmrc key outside the allowlist (node-options and script-shell run code).

It needs the docker CLI with compose, and no daemon. Without them it prints SKIP and exits 0. Exit codes: 0
clean, with a PLANNED line for each open pin, which make check shows as PLANNED; 1 a refusal; 2 it couldn't run (a
file unreadable, compose refusing the file).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMPOSE_FILE = "deploy/compose.yaml"
LOCK_FILE = "deploy/images.lock"
DISCLOSURE_FILE = "docs/data-flow-disclosure.md"
DEVCONTAINER_FILE = ".devcontainer/devcontainer.json"
ENV_FILES = (
    ("prod", "deploy/env.example/prod.env.example"),
    ("dev", "deploy/env.example/dev.env.example"),
    ("dev-cpu", "deploy/env.agents/dev-cpu.vars"),
    # Spec 001's tunnel end, prod on another host: write_env.py fills its template at boot (contracts/env-cloud.md §1).
    ("prod", "deploy/hosts/tunnel-end/tunnel-end.env.example"),
    # Spec 001 group 7's EC2, prod on another host, the same way.
    ("prod", "deploy/hosts/ec2/ec2.env.example"),
)

BIND_ROOTS = (
    "${H4_TREE}/deploy",
    "${H4_TREE}/config",
    "${H4_MODEL_DIR}",
    # Only the gateway's own corner of the state directory: the rest holds the run file and the exports whose
    # scripts the Author's terminal runs.
    "${H4_STATE_DIR}/gateway",
    "${H4_AWS_DIR}",
)
WRITABLE_ROOT = "${H4_STATE_DIR}/gateway"
NETWORKS = ("internal", "edge", "egress")
PUBLISHER = "edge"
EGRESS_SERVICE = "gateway"
# Spec 001 (its contracts/tunnel.md §1 and §3; contracts/env-cloud.md §3). The egress network's other two: the laptop's
# tunnel, which dials the tunnel end, and the tunnel end's collector, which exports to EC2's inside the VPC (its host's
# nftables keep both there). The edge network's other one: the tunnel end's sshd, since a port can't be published from
# internal alone.
EGRESS_SERVICES = frozenset({EGRESS_SERVICE, "tunnel", "tunnel-end-collector"})
# From group 6, the tunnel end's shared state too, which publishes on the private interface (its contracts/shared-
# state.md §1).
# From group 7, EC2's two doors from the tunnel end, which publish on EC2's private address.
# From group 8, the tunnel end's relay, which publishes its edge listener on the private interface (its contracts/
# relay-http.md §1).
EDGE_NETWORK_SERVICES = frozenset(
    {PUBLISHER, "tunnel-end", "shared-state", "ec2-relay-block", "relay"}
)
# The cloud hosts' classes: the profiles whose services run on a cloud host alone, which no laptop stack selects.
CLOUD_PROFILES = frozenset({"tunnel-end", "ec2"})
# What a cloud class's service publishes, exactly (host address, published port, container port): the tunnel end's
# public interface's fixed address, a literal no other host has, so the service fails closed anywhere else.
CLOUD_PORTS = {
    "tunnel-end": frozenset(
        {("10.42.0.10", "2222", 2222), ("10.42.0.10", "8087", 2203)}
    ),
    # The shared state's 5432, on the private interface's fixed address alone, which the security group holds to EC2.
    "shared-state": frozenset({("10.42.1.10", "5432", 5432)}),
    # Group 7: EC2's relay block and its collector, on EC2's one private address, which its group opens to the tunnel
    # end's two addresses alone.
    "ec2-relay-block": frozenset(
        {("10.42.0.20", "8085", 8085), ("10.42.0.20", "4318", 4318)}
    ),
    # Group 8: the relay's edge listener on the private interface's fixed address, which the security group holds to
    # CloudFront's origin-facing list, and its internal listener on the tunnel end's own loopback alone.
    "relay": frozenset({("10.42.1.10", "8080", 8080), ("127.0.0.1", "18505", 8081)}),
}
# The binds each of spec 001's services takes outside BIND_ROOTS, each read-only but where it says writable: the
# laptop's client key and pinned host key, which the Author's tunnel-keys target leaves under
# ~/.config/h4reet-ai/tunnel/ (prod's H4_TUNNEL_DIR); the tunnel end's host key and authorized key, which write_env.py
# writes to tmpfs at boot; and, from group 6, the shared state's key and certificate on tmpfs, read-only, and its data,
# the data volume's mount, its one writable bind (deploy/hosts/tunnel-end/shared_state.py).
SERVICE_BINDS: dict[str, dict[str, bool]] = {
    "tunnel": {"${H4_TUNNEL_DIR}": False},
    "tunnel-end": {"/run/h4reet/tunnel-end/keys": False},
    "shared-state": {
        "/run/h4reet/shared-state": False,
        "/srv/h4reet/shared-state": True,
    },
}
# A cloud class's images, from the account's registry (the release's ECR repositories; spec 001 contracts/releases-
# deployer.md §1). An image the release builds runs by the release's digest, which the deployer writes to the
# release's env file; an upstream image's copy runs by the lock's own digest and tag, which the copy keeps: the lock's
# line of the service it copies, by the repository's name.
REGISTRY = "${H4_REGISTRY:-registry.invalid}/h4reet/"
# Group 8: the relay, which the release builds too.
RELEASE_IMAGES = {"tunnel-end": "tunnel", "relay": "relay"}
UPSTREAM_COPIES = {
    "tunnel-end-collector": "otel-collector",
    # Group 6: the shared state runs gateway-state's Postgres, copied to a repository of its own name.
    "shared-state": "gateway-state",
    # Group 7: EC2's doors run edge's nginx, copied by its index digest.
    "ec2-relay-block": "edge",
}
# Group 7: on EC2, a shared service's upstream image runs as the account's registry's copy, which EC2's deployer names
# in its release's env file as H4_IMAGE_<SERVICE>; the reference after ":-" is the lock's, and runs on every other
# host. No env file this policy reads may name one (check_env_values).
MIRRORED_RE = re.compile(r"\$\{(H4_IMAGE_[A-Z0-9_]+):-([^}]+)\}")


def mirrored_pin(name: str, image: str) -> str | None:
    """The pin inside a shared service's EC2 override; None if image isn't one, or names another service's variable."""
    m = MIRRORED_RE.fullmatch(image)
    if m is None or m.group(1) != "H4_IMAGE_" + name.upper().replace("-", "_"):
        return None
    return m.group(2)


# A copy whose repository isn't its lock line's name.
COPY_REPOSITORIES = {"shared-state": "shared-state"}
# Spec 010 (FR-030, FR-032): prod's Anthropic API key, which compose passes to the gateway alone, from the env file.
ANTHROPIC_KEY = "GATEWAY_ANTHROPIC_API_KEY"
ANTHROPIC_KEY_FORM = "${GATEWAY_ANTHROPIC_API_KEY:-}"
# The key's name anywhere else, and a reference to a variable the Anthropic SDK reads on its own.
ANTHROPIC_KEY_NAME = re.compile(
    r"(?<![A-Za-z0-9_])GATEWAY_ANTHROPIC_API_KEY(?![A-Za-z0-9_])"
)
ANTHROPIC_REFERENCE = re.compile(r"\$\{?ANTHROPIC_")
GPU_SERVICE = "model-server-gpu"
GPU_RESERVATION = {"driver": "nvidia", "count": 1, "capabilities": ["gpu"]}
CAP_ADD_ALLOWED = {"CHOWN", "SETUID", "SETGID", "FOWNER", "DAC_OVERRIDE"}
SECURITY_OPT_ALLOWED = {"no-new-privileges:true", "no-new-privileges"}
HOST_NAMESPACES = ("pid", "ipc", "uts", "userns_mode", "cgroup")
FORBIDDEN_SERVICE_KEYS = {
    "container_name": "a container_name crosses stacks: compose names every container h4reet-<stack>-*",
    "env_file": "no env_file: each service names the few variables it needs (plan §1)",
    "extra_hosts": "extra_hosts can point a container at the host or another stack (FR-020)",
    "volumes_from": "volumes_from shares another container's mounts",
    "external_links": "external_links reach containers outside the stack (FR-020)",
    "secrets": "file-backed secrets mount host files outside the bind roots",
    "configs": "file-backed configs mount host files outside the bind roots",
    "devices": "no devices (plan §11)",
    "device_cgroup_rules": "no device cgroup rules (plan §11)",
    "runtime": "no runtime switch: the GPU is a reservation in the gpu profile (plan §3)",
    # The engine's API socket under a newer name: on the host's rootful engine it is root on the host (FR-039).
    "use_api_socket": "use_api_socket mounts the engine's API socket into the container, as docker.sock would",
    # Lifecycle hooks run commands with their own user and privileged flag, outside the service's own settings.
    "post_start": "no lifecycle hooks: they run with their own user and privileges (no service needs one)",
    "pre_stop": "no lifecycle hooks: they run with their own user and privileges (no service needs one)",
    "develop": "no develop section: compose watch syncs host paths into containers (make up never watches)",
    "provider": "no provider services: they run outside compose's containers and this policy",
    "models": "no models: model-runner pulls are flows the disclosure doesn't list",
}
SOCKETS = (
    "docker.sock",
    "/var/run/docker",
    "/run/docker",
    "containerd.sock",
    "podman.sock",
)
# The dev-only switches (contracts/env-files.md §7.1): the values each takes, and what compose may write for it.
SWITCHES = {
    "GATEWAY_TEST_CLOCK": ({"0", "1"}, "0"),
    "GATEWAY_TEST_SYNTHETIC_SPEND": ({"0", "1"}, "0"),
    "TELEMETRY_PAYLOAD_SAMPLING": ({"off", "on"}, "off"),
}
COMPOSE_KEYS_ALLOWED = {"COMPOSE_PROJECT_NAME", "COMPOSE_PROFILES"}
NPMRC_ALLOWED = {
    "audit",
    "engine-strict",
    "fund",
    "loglevel",
    "package-lock",
    "progress",
    "save-exact",
    "update-notifier",
}
NPMRC_FIXED = {"ignore-scripts": "true"}
RUN_ARGS_REFUSED = (
    "--privileged",
    "--cap-add",
    "--device",
    "--gpus",
    "-v",
    "--volume",
    "--mount",
    "--network",
    "--net",
    "--pid",
    "--ipc",
    "--uts",
    "--userns",
    "--cgroupns",
    "--add-host",
    "--volumes-from",
    "--env-file",
    "--runtime",
)
DEVCONTAINER_REFUSED = {
    "initializeCommand": "initializeCommand runs on the host",
    "mounts": "host mounts reach the Author's files",
    "workspaceMount": "a workspaceMount can mount any host path",
    "dockerComposeFile": "a devcontainer compose file escapes this policy",
    "privileged": "a privileged devcontainer",
    "capAdd": "added capabilities",
    "securityOpt": "relaxed security options",
}
SKIP_DIRS = {".git", "node_modules"}
KEY_RE = re.compile(r"[A-Z][A-Z0-9_]*")
VAR_RE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)([^}]*)\}")
DIGEST_RE = re.compile(r"sha256:[0-9a-f]{64}")
# The services whose deploy/images.lock line may still be open, each with the task that pins it (research.md R-09):
# check 2 found no SeaweedFS release tag, so make pin-images resolves it in the first stack task. While the line's
# tag and digest are "-" and the compose file names the line's bare repository, the policy reports the service
# PLANNED instead of refusing it. Once the lock holds a digest the ordinary check applies, so nothing here needs
# undoing when the pin lands. Any other open pin, or any other spelling of the image, is refused. The mark expires
# with its task, as plan §11's marks do: once tasks.md marks the task done, an open pin is refused again.
OPEN_PINS = {"seaweedfs": "T063"}
TASKS_FILE = "specs/000-local-foundations/tasks.md"
PLANNED_RULE = "planned"
# The gateway's one image per commit (tasks.md T184): make up builds it outside compose (deploy/scripts/
# gateway_image.py), h4reet-gateway:<commit> from a host stack's export, or h4reet-gateway:working-tree on dev-cpu, and
# the compose file names it, exactly as written here, with pull_policy: never. No registry has it, so no lock line
# pins it; never pulled, a missing one stops the stack instead of fetching another by the same name. The room's web
# image is the same kind of name (spec 002, contracts/web-serving.md §1 and §4): deploy/scripts/web_image.py builds it
# on every make up, its tag ending in the env file's H4_WEB_SUFFIX, empty on prod and -drafts on dev and dev-cpu.
# x005, its publication on edge, needs nothing here: the port rule already takes any edge publication on 127.0.0.1.
SHARED_IMAGES = {
    "gateway": "h4reet-gateway:${H4_REF:-working-tree}",
    "web": "h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}",
}


@dataclass(frozen=True)
class Finding:
    where: str
    rule: str
    detail: str

    @property
    def planned(self) -> bool:
        """Enforcement a later task completes (an open pin): printed as PLANNED, and not a refusal."""
        return self.rule == PLANNED_RULE

    def line(self) -> str:
        if self.planned:
            return self.detail
        return f"FAIL {self.where}: {self.rule}: {self.detail}"


@dataclass(frozen=True)
class LockEntry:
    service: str
    repository: str
    tag: str
    digest: str
    registry: str
    checked: str


class PolicyError(Exception):
    """The policy couldn't run: exit 2."""


# ---------------------------------------------------------------------------------------------------------------
# Parsers: env files, the image lock, image references. Each is its own copy, read as data: this gate runs no code
# from the agent-editable deploy/scripts.


def parse_env_file(path: Path) -> tuple[dict[str, str], list[str]]:
    """KEY=VALUE per contracts/env-files.md §1.1. Errors name the line and key, never the value."""
    values: dict[str, str] = {}
    errors: list[str] = []
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.rstrip("\r")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, sep, value = line.partition("=")
        if not sep or not KEY_RE.fullmatch(key):
            errors.append(f"line {number}: not KEY=VALUE")
            continue
        if key in values:
            errors.append(f"line {number}: {key} appears twice")
            continue
        if value.startswith("'"):
            if len(value) < 2 or not value.endswith("'") or "'" in value[1:-1]:
                errors.append(
                    f"line {number}: {key}: an unterminated or nested single quote"
                )
                continue
            value = value[1:-1]
        elif re.search(r"[\s$\"'`\\#]", value):
            errors.append(
                f"line {number}: {key}: unquoted whitespace, $, quote, backslash, or #"
            )
            continue
        if "${" in value:
            errors.append(f"line {number}: {key}: ${{...}} inside a value")
            continue
        values[key] = value
    return values, errors


def parse_lock(path: Path) -> dict[str, LockEntry]:
    entries: dict[str, LockEntry] = {}
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        fields = raw.split()
        if len(fields) != 6:
            raise PolicyError(
                f"{LOCK_FILE} line {number}: expected 6 fields, found {len(fields)}"
            )
        entry = LockEntry(*fields)
        if entry.service in entries:
            raise PolicyError(
                f"{LOCK_FILE} line {number}: {entry.service} appears twice"
            )
        if entry.digest != "-" and not DIGEST_RE.fullmatch(entry.digest):
            raise PolicyError(
                f"{LOCK_FILE} line {number}: {entry.service}: not a sha256 digest"
            )
        entries[entry.service] = entry
    return entries


def normalize_repository(name: str) -> str:
    """Docker's short names, spelled out: nvidia/cuda is docker.io/nvidia/cuda, and postgres docker.io/library/postgres."""
    first = name.split("/", 1)[0]
    if "/" in name and ("." in first or ":" in first or first == "localhost"):
        return name
    return f"docker.io/{name}" if "/" in name else f"docker.io/library/{name}"


def split_reference(ref: str) -> tuple[str, str | None, str | None]:
    """repository, tag, digest of an image reference; a missing part is None."""
    name, _, digest = ref.partition("@")
    tag = None
    slash = name.rfind("/")
    colon = name.rfind(":")
    if colon > slash:
        name, tag = name[:colon], name[colon + 1 :]
    return name, tag, digest or None


def strip_required(text: str) -> str:
    """${VAR:?message} and ${VAR?message} read as ${VAR}: the message only matters when VAR is missing."""
    return re.sub(r"\$\{([A-Za-z_][A-Za-z0-9_]*):?\?[^}]*\}", r"${\1}", text)


def split_outside_braces(text: str, sep: str = ":") -> list[str]:
    parts, depth, current = [], 0, []
    for char in text:
        if char == "{":
            depth += 1
        elif char == "}":
            depth = max(0, depth - 1)
        if char == sep and depth == 0:
            parts.append("".join(current))
            current = []
        else:
            current.append(char)
    parts.append("".join(current))
    return parts


# ---------------------------------------------------------------------------------------------------------------
# The rendered compose model.


def as_mapping(value: object) -> dict[str, object]:
    """compose's list-or-mapping fields (environment, networks) as a mapping."""
    if isinstance(value, dict):
        return {str(k): v for k, v in value.items()}
    if isinstance(value, list):
        out: dict[str, object] = {}
        for item in value:
            key, _, val = str(item).partition("=")
            out[key] = val if _ else None
        return out
    return {}


def anthropic_references(value: object, path: str = "") -> list[str]:
    """Where rendered compose names the Anthropic API key or refers to an ANTHROPIC_* variable (spec 010): each
    path, in a mapping's keys and every string, at any depth."""
    found: list[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            here = f"{path}.{key}" if path else str(key)
            if ANTHROPIC_KEY_NAME.search(str(key)):
                found.append(here)
            found.extend(anthropic_references(item, here))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            found.extend(anthropic_references(item, f"{path}[{index}]"))
    elif isinstance(value, str) and (
        ANTHROPIC_KEY_NAME.search(value) or ANTHROPIC_REFERENCE.search(value)
    ):
        found.append(path)
    return found


def volume_entries(service: dict) -> list[dict[str, object]]:
    entries = []
    for item in service.get("volumes") or []:
        if isinstance(item, dict):
            entries.append(item)
            continue
        parts = split_outside_braces(str(item))
        source, target = (parts[0], parts[1]) if len(parts) > 1 else ("", parts[0])
        mode = parts[2] if len(parts) > 2 else ""
        is_path = source[:1] in ("/", ".", "~", "$")
        entries.append(
            {
                "type": "bind" if is_path else "volume",
                "source": source,
                "target": target,
                "read_only": "ro" in mode.split(","),
                "short": True,
            }
        )
    return entries


def port_entries(service: dict) -> list[tuple[str | None, str]]:
    """(host_ip, as written) for each published port; host_ip None means every interface."""
    out = []
    for item in service.get("ports") or []:
        if isinstance(item, dict):
            out.append((item.get("host_ip") or None, json.dumps(item, sort_keys=True)))
            continue
        text = str(item)
        parts = split_outside_braces(text.split("/", 1)[0])
        out.append((parts[0] if len(parts) >= 3 else None, text))
    return out


def check_service(
    name: str, service: dict, model: dict, lock: dict[str, LockEntry], tree: Path
) -> list[Finding]:
    where = f"{COMPOSE_FILE} service {name}"
    found: list[Finding] = []

    def refuse(rule: str, detail: str) -> None:
        found.append(Finding(where, rule, detail))

    for key, why in FORBIDDEN_SERVICE_KEYS.items():
        if service.get(key):
            refuse(key, why)
    if service.get("privileged"):
        refuse("privileged", "privileged mode")
    for key in HOST_NAMESPACES:
        value = str(service.get(key, ""))
        if value.startswith(("host", "container:", "service:")):
            refuse(
                key,
                f"{key}: {value} shares the host's or another container's namespace",
            )
    if service.get("network_mode"):
        refuse(
            "network_mode",
            "a network_mode bypasses the stack's networks (FR-020, FR-040)",
        )

    # The GPU: only model-server-gpu, only in the gpu profile, only the one NVIDIA reservation (plan §3).
    reservations = (
        ((service.get("deploy") or {}).get("resources") or {}).get("reservations") or {}
    ).get("devices")
    gpu_ok = name == GPU_SERVICE and (service.get("profiles") or []) == ["gpu"]
    if reservations and not (gpu_ok and reservations == [GPU_RESERVATION]):
        refuse(
            "devices",
            "a device reservation outside model-server-gpu's one NVIDIA GPU in the gpu profile",
        )
    if service.get("gpus") and not gpu_ok:
        refuse("devices", "gpus outside model-server-gpu in the gpu profile")

    # plan §1's rules for every service.
    if "ALL" not in [str(c).upper() for c in service.get("cap_drop") or []]:
        refuse("cap_drop", "cap_drop must be [ALL]")
    extra = sorted(
        {str(c).upper() for c in service.get("cap_add") or []} - CAP_ADD_ALLOWED
    )
    if extra:
        refuse(
            "cap_add",
            f"{', '.join(extra)} beyond CHOWN, SETUID, SETGID, FOWNER, DAC_OVERRIDE",
        )
    options = [str(o) for o in service.get("security_opt") or []]
    if "no-new-privileges:true" not in options and "no-new-privileges" not in options:
        refuse("security_opt", "no-new-privileges:true is missing")
    relaxed = [o for o in options if o not in SECURITY_OPT_ALLOWED]
    if relaxed:
        refuse(
            "security_opt", f"{', '.join(relaxed)} relaxes the container's confinement"
        )
    if service.get("restart") != "unless-stopped":
        refuse("restart", "restart must be unless-stopped (plan §1)")
    driver = (service.get("logging") or {}).get("driver")
    if driver != "local":
        refuse(
            "logging",
            f"log driver {driver!r}: only Docker's local driver, so no log leaves the host",
        )

    # Ports: edge alone publishes, on the literal 127.0.0.1 (plan §1, FR-020); and a cloud class's service exactly its
    # own (CLOUD_PORTS).
    if name in CLOUD_PORTS:
        published = cloud_ports(service)
        if service.get("ports") and published != CLOUD_PORTS[name]:
            refuse(
                "ports",
                f"{name} publishes exactly "
                + ", ".join(f"{a}:{p}->{t}" for a, p, t in sorted(CLOUD_PORTS[name])),
            )
        if not cloud_only(service):
            refuse("ports", f"{name} publishes only in a cloud host's profile")
    else:
        for host_ip, text in port_entries(service):
            if name != PUBLISHER:
                refuse("ports", f"{text}: only {PUBLISHER} publishes ports")
            elif host_ip != "127.0.0.1":
                refuse("ports", f"{text}: not bound to the literal 127.0.0.1")

    # Networks (plan §1).
    networks = as_mapping(service.get("networks"))
    if not networks:
        refuse(
            "networks",
            "no networks listed: it would land on the default bridge, which has a route out",
        )
    for net in networks:
        if net not in NETWORKS:
            refuse("networks", f"network {net!r} isn't one of {', '.join(NETWORKS)}")
    if networks and "internal" not in networks:
        refuse("networks", "every service joins internal")
    if "egress" in networks and name not in EGRESS_SERVICES:
        refuse(
            "networks",
            f"only {', '.join(sorted(EGRESS_SERVICES))} join egress, the stack's routes out (FR-040)",
        )
    if "edge" in networks and name not in EDGE_NETWORK_SERVICES:
        refuse(
            "networks",
            f"only {', '.join(sorted(EDGE_NETWORK_SERVICES))} join the edge network",
        )

    # Volumes and binds (plan §11).
    declared = model.get("volumes") or {}
    for volume in volume_entries(service):
        kind = volume.get("type")
        source = str(volume.get("source") or "")
        target = volume.get("target")
        if any(s in source for s in SOCKETS):
            refuse("docker.sock", f"{source} -> {target}: a container engine's socket")
            continue
        if kind == "bind":
            if re.search(r"\$\{[A-Za-z_][A-Za-z0-9_]*:?-", source):
                refuse(
                    "binds",
                    f"{source} -> {target}: a bind source may not have a default",
                )
                continue
            plain = strip_required(source)
            if ".." in plain.split("/"):
                refuse("binds", f"{source} -> {target}: '..' in a bind source")
                continue
            own = SERVICE_BINDS.get(name, {})
            if plain in own:
                if not own[plain] and not volume.get("read_only"):
                    refuse(
                        "binds", f"{source} -> {target}: {name}'s keys bind read-only"
                    )
                continue
            root = next(
                (r for r in BIND_ROOTS if plain == r or plain.startswith(r + "/")), None
            )
            if root is None:
                refuse(
                    "binds", f"{source} -> {target}: outside {', '.join(BIND_ROOTS)}"
                )
            elif root != WRITABLE_ROOT and not volume.get("read_only"):
                refuse(
                    "binds",
                    f"{source} -> {target}: writable; only {WRITABLE_ROOT} may be",
                )
        elif kind == "volume":
            if source not in declared:
                refuse(
                    "volumes",
                    f"{source or '(anonymous)'} -> {target}: not a declared named volume"
                    " (a short-syntax bind? write binds in the long syntax)",
                )
        elif kind != "tmpfs":
            refuse("volumes", f"{source} -> {target}: volume type {kind!r}")

    # Images and builds (plan §2, §11; FR-014).
    build = service.get("build")
    image = service.get("image")
    if cloud_only(service) and build is not None:
        refuse(
            "build", "a cloud host's service runs its release's image, and never builds"
        )
    elif name in RELEASE_IMAGES or name in UPSTREAM_COPIES:
        if not cloud_only(service):
            refuse("image", f"{name} runs in a cloud host's profile alone")
        want = cloud_image(name, lock)
        if image != want:
            refuse("image", f"{image}: the account's registry's, as {want}")
    elif cloud_only(service):
        refuse(
            "image",
            f"{name} is a cloud host's, with no image in RELEASE_IMAGES or UPSTREAM_COPIES",
        )
    elif build is not None:
        found.extend(check_build(where, build, image, tree))
    elif not image:
        refuse("image", "neither an image nor a build")
    elif SHARED_IMAGES.get(name) == image:
        if service.get("pull_policy") != "never":
            refuse(
                "pull_policy",
                f"{image} is make up's own build, which no registry has: pull_policy: never, so compose never "
                "pulls an image by that name",
            )
    elif str(image).startswith("${H4_IMAGE_"):
        pin = mirrored_pin(name, str(image))
        if pin is None:
            refuse(
                "image",
                f"{image}: an override names its own service's variable, as "
                f"${{H4_IMAGE_{name.upper().replace('-', '_')}:-<the lock's pin>}}",
            )
        else:
            found.extend(check_image(where, name, pin, lock, tree))
    else:
        found.extend(check_image(where, name, str(image), lock, tree))

    # Dev-only switches come from the env file, never from compose itself (FR-036).
    environment = as_mapping(service.get("environment"))
    for key, (_, off) in SWITCHES.items():
        if key in environment and environment[key] not in (
            f"${{{key}}}",
            f"${{{key}:-{off}}}",
        ):
            refuse(
                "dev-only switch",
                f"{key} must come from the env file (${{{key}}} or ${{{key}:-{off}}})",
            )
    aws = sorted(k for k in environment if k.startswith("AWS_"))
    if aws and name != EGRESS_SERVICE:
        refuse(
            "environment", f"{', '.join(aws)}: AWS settings belong to the gateway alone"
        )
    # The Anthropic API key (spec 010): no service holds a variable the SDK reads on its own, and the gateway alone
    # holds prod's key, from the env file and in this one form.
    anthropic = sorted(k for k in environment if k.startswith("ANTHROPIC_"))
    if anthropic:
        refuse(
            "environment",
            f"{', '.join(anthropic)}: no service holds a variable the Anthropic SDK reads on its own",
        )
    if ANTHROPIC_KEY in environment:
        if name != EGRESS_SERVICE:
            refuse("environment", f"{ANTHROPIC_KEY} belongs to the gateway alone")
        elif environment[ANTHROPIC_KEY] != ANTHROPIC_KEY_FORM:
            refuse(
                "environment",
                f"{ANTHROPIC_KEY} comes from the env file, as {ANTHROPIC_KEY_FORM}",
            )
    # Any other mention of the key, or reference to an ANTHROPIC_* variable: in another variable's value, a build
    # argument, a label, a command, or any other field. The key reaches the gateway as its own entry alone.
    rest = {key: value for key, value in service.items() if key != "environment"}
    rest["environment"] = {
        key: value
        for key, value in environment.items()
        if key != ANTHROPIC_KEY and not key.startswith("ANTHROPIC_")
    }
    for path in anthropic_references(rest):
        refuse(
            "anthropic key",
            f"{path} names {ANTHROPIC_KEY} or refers to an ANTHROPIC_* variable: the key reaches the gateway as "
            "its own entry alone",
        )
    return found


def open_pin(name: str, image: str, lock: dict[str, LockEntry]) -> str | None:
    """The PLANNED line for an image whose pin is still open (OPEN_PINS), or None: the ordinary check applies."""
    task, entry = OPEN_PINS.get(name), lock.get(name)
    if task is None or entry is None or (entry.tag, entry.digest) != ("-", "-"):
        return None
    if image != entry.repository:
        return None  # a tag or a digest the lock doesn't hold, or another repository: refused as usual
    return f"PLANNED ({task}): {name}'s pin is open; make pin-images resolves it"


def done_tasks(tree: Path) -> frozenset[str]:
    """The task IDs tasks.md marks done ("- [X] Tnnn"). A mark naming one of them has expired."""
    path = tree / TASKS_FILE
    if not path.is_file():
        return frozenset()
    text = path.read_text(encoding="utf-8")
    return frozenset(re.findall(r"^- \[[Xx]\] (T\d{3})\b", text, re.MULTILINE))


def check_image(
    where: str,
    name: str,
    image: str,
    lock: dict[str, LockEntry],
    tree: Path | None = None,
) -> list[Finding]:
    planned = open_pin(name, image, lock)
    if planned is not None:
        task = OPEN_PINS[name]
        if tree is not None and task in done_tasks(tree):
            return [
                Finding(
                    where,
                    "image",
                    f"{name}'s pin is still open, but tasks.md marks {task}, which pins it, done: run make "
                    "pin-images and commit the pin",
                )
            ]
        return [Finding(where, PLANNED_RULE, planned)]
    repository, tag, digest = split_reference(image)
    if not digest or not DIGEST_RE.fullmatch(digest):
        return [
            Finding(
                where,
                "image",
                f"{image}: not pinned by digest (repository:tag@sha256:...)",
            )
        ]
    entry = lock.get(name)
    if entry is None:
        return [Finding(where, "image", f"{LOCK_FILE} has no line for {name}")]
    if (repository, tag, digest) != (entry.repository, entry.tag, entry.digest):
        return [
            Finding(
                where,
                "image",
                f"{image} differs from {LOCK_FILE}'s {entry.repository}:{entry.tag}@{entry.digest}",
            )
        ]
    return []


def check_build(where: str, build: object, image: object, tree: Path) -> list[Finding]:
    found = []
    if not isinstance(build, dict):
        build = {"context": build}
    context = str(build.get("context") or ".")
    compose_dir = tree / Path(COMPOSE_FILE).parent
    if image:
        found.append(
            Finding(
                where,
                "build",
                "a built service names no image: compose tags it h4reet-<stack>-<service>",
            )
        )
    if "$" in context or "://" in context or context.startswith("git@"):
        found.append(
            Finding(where, "build.context", f"{context!r}: interpolated or remote")
        )
    elif os.path.isabs(context):
        found.append(
            Finding(
                where,
                "build.context",
                f"{context!r}: absolute; it must be relative to the compose file",
            )
        )
    else:
        resolved = Path(os.path.normpath(compose_dir / context))
        if resolved != tree and tree not in resolved.parents:
            found.append(
                Finding(
                    where,
                    "build.context",
                    f"{context!r} resolves outside the compose file's tree",
                )
            )
        dockerfile = str(build.get("dockerfile") or "Dockerfile")
        if (
            os.path.isabs(dockerfile)
            or ".." in Path(dockerfile).parts
            or "$" in dockerfile
        ):
            found.append(
                Finding(
                    where,
                    "build.dockerfile",
                    f"{dockerfile!r}: must stay inside the context",
                )
            )
    for key, why in (
        ("dockerfile_inline", "an inline Dockerfile escapes the FROM check"),
        ("additional_contexts", "extra contexts can reach outside the tree"),
        ("entitlements", "build entitlements"),
        ("privileged", "a privileged build"),
        ("ssh", "a build's SSH forwarding hands it the host's agent or keys"),
        ("secrets", "build secrets mount host files into the build"),
        ("cache_from", "a build cache source can name a host path"),
        ("cache_to", "a build cache target can write a host path"),
        ("extra_hosts", "build extra_hosts can point the build at the host"),
    ):
        if build.get(key):
            found.append(Finding(where, f"build.{key}", why))
    if str(build.get("network") or "") not in ("", "default"):
        found.append(
            Finding(
                where,
                "build.network",
                f"{build.get('network')!r}: builds use the default network",
            )
        )
    return found


def cloud_only(service: dict) -> bool:
    """The service runs on a cloud host alone: each of its profiles is a cloud class's."""
    profiles = set(service.get("profiles") or [])
    return bool(profiles) and profiles <= CLOUD_PROFILES


def cloud_ports(service: dict) -> frozenset[tuple[str, str, int]]:
    """(host address, published port, container port) for each port, as written or as compose renders it."""
    out = set()
    for item in service.get("ports") or []:
        if isinstance(item, dict):
            out.add(
                (
                    str(item.get("host_ip") or ""),
                    str(item.get("published") or ""),
                    int(item.get("target") or 0),
                )
            )
            continue
        parts = split_outside_braces(str(item).split("/", 1)[0])
        if len(parts) == 3 and parts[2].isdigit():
            out.add((parts[0], parts[1], int(parts[2])))
        else:
            out.add(("", str(item), 0))
    return frozenset(out)


def cloud_image(name: str, lock: dict[str, LockEntry]) -> str:
    """The image a cloud class's service must name (RELEASE_IMAGES, UPSTREAM_COPIES)."""
    if name in RELEASE_IMAGES:
        repository = RELEASE_IMAGES[name]
        return f"{REGISTRY}{repository}@${{H4_DIGEST_{repository.upper().replace('-', '_')}:-}}"
    upstream = UPSTREAM_COPIES[name]
    repository = COPY_REPOSITORIES.get(name, upstream)
    entry = lock.get(upstream)
    if entry is None:
        return f"{REGISTRY}{repository}:<{LOCK_FILE} has no line for {upstream}>"
    return f"{REGISTRY}{repository}:{entry.tag}@{entry.digest}"


def check_model(
    model: dict, lock: dict[str, LockEntry], tree: Path, disclosed: set[str]
) -> list[Finding]:
    found: list[Finding] = []
    services = model.get("services") or {}
    if not services:
        found.append(Finding(COMPOSE_FILE, "services", "no services"))
    for name, service in services.items():
        found.extend(check_service(name, service or {}, model, lock, tree))
        if name not in disclosed:
            found.append(
                Finding(
                    f"{COMPOSE_FILE} service {name}",
                    "disclosure",
                    f"no row in {DISCLOSURE_FILE} whose From names `{name}` (FR-040)",
                )
            )
    networks = model.get("networks") or {}
    for net, spec in networks.items():
        spec = spec or {}
        if net not in NETWORKS:
            found.append(
                Finding(
                    COMPOSE_FILE,
                    "networks",
                    f"network {net!r} isn't one of {', '.join(NETWORKS)}",
                )
            )
        if spec.get("external"):
            found.append(
                Finding(COMPOSE_FILE, "external", f"network {net!r} is external")
            )
        # compose names each network <project>_<key>; any other name joins another stack's network (FR-020).
        if spec.get("name") not in (None, f"{model.get('name')}_{net}"):
            found.append(
                Finding(
                    COMPOSE_FILE,
                    "name",
                    f"network {net!r} is named {spec.get('name')!r}, not this stack's own",
                )
            )
        if spec.get("driver") not in (None, "bridge"):
            found.append(
                Finding(
                    COMPOSE_FILE,
                    "networks",
                    f"network {net!r} uses driver {spec.get('driver')!r}",
                )
            )
    if not (networks.get("internal") or {}).get("internal"):
        found.append(
            Finding(
                COMPOSE_FILE,
                "networks",
                "internal must be internal: true, with no route out",
            )
        )
    for vol, spec in (model.get("volumes") or {}).items():
        spec = spec or {}
        if spec.get("external"):
            found.append(
                Finding(COMPOSE_FILE, "external", f"volume {vol!r} is external")
            )
        if spec.get("name") not in (None, f"{model.get('name')}_{vol}"):
            found.append(
                Finding(
                    COMPOSE_FILE,
                    "name",
                    f"volume {vol!r} is named {spec.get('name')!r}, not this stack's own",
                )
            )
        if spec.get("driver") not in (None, "local") or spec.get("driver_opts"):
            found.append(
                Finding(
                    COMPOSE_FILE,
                    "volumes",
                    f"volume {vol!r}: a driver or driver_opts (a bind in disguise)",
                )
            )
    top_level = {
        "secrets": "bring in host files outside the bind roots",
        "configs": "bring in host files outside the bind roots",
        "include": "brings in a compose file this policy never sees",
        "models": "pull through Docker's model runner, a flow the disclosure doesn't list",
    }
    for key, why in top_level.items():
        if model.get(key):
            found.append(Finding(COMPOSE_FILE, key, f"top-level {key} {why}"))
    # The Anthropic key's name, or a reference to an ANTHROPIC_* variable, outside the services (spec 010).
    outside = {key: value for key, value in model.items() if key != "services"}
    for path in anthropic_references(outside):
        found.append(
            Finding(
                COMPOSE_FILE,
                "anthropic key",
                f"{path} names {ANTHROPIC_KEY} or refers to an ANTHROPIC_* variable",
            )
        )
    return found


# ---------------------------------------------------------------------------------------------------------------
# The files.


def check_env_values(where: str, values: dict[str, str]) -> list[Finding]:
    found = []
    is_dev = values.get("H4_ENV") == "dev"
    for key, (allowed, off) in SWITCHES.items():
        if key not in values:
            continue
        value = values[key]
        if value not in allowed:
            found.append(
                Finding(
                    where,
                    "dev-only switch",
                    f"{key} takes {' or '.join(sorted(allowed))}",
                )
            )
        elif not is_dev and value != off:
            found.append(
                Finding(
                    where, "dev-only switch", f"{key} is on outside H4_ENV=dev (FR-036)"
                )
            )
        elif not is_dev and key != "TELEMETRY_PAYLOAD_SAMPLING":
            found.append(
                Finding(
                    where,
                    "dev-only switch",
                    f"{key} exists only in dev's env files (contracts/env-files.md §7.1)",
                )
            )
    for key in values:
        if key.startswith("COMPOSE_") and key not in COMPOSE_KEYS_ALLOWED:
            found.append(
                Finding(where, "compose key", f"{key} would change what compose loads")
            )
        if key.startswith("DOCKER_"):
            found.append(
                Finding(
                    where, "docker key", f"{key} would point compose at another engine"
                )
            )
        if key.startswith("H4_IMAGE_"):
            found.append(
                Finding(
                    where,
                    "image key",
                    f"{key} would replace a pinned image: only EC2's deployer names one, in its release's env file",
                )
            )
    return found


def disclosed_services(path: Path) -> set[str]:
    """Services a disclosure row names, in backticks, in its From → To cell before the arrow."""
    names: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if not line.lstrip().startswith("|") or len(cells) < 2:
            continue
        origin = cells[1].split("→", 1)[0]
        names.update(re.findall(r"`([a-z0-9][a-z0-9-]*)`", origin))
    return names


def walk(root: Path) -> tuple[list[Path], list[Path]]:
    """Every file under root, but .git and node_modules; and the directories it couldn't read."""
    files: list[Path] = []
    unreadable: list[Path] = []

    def onerror(error: OSError) -> None:
        if error.filename:
            unreadable.append(Path(error.filename))

    for dirpath, dirnames, filenames in os.walk(root, onerror=onerror):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        files.extend(Path(dirpath, f) for f in sorted(filenames))
    return files, unreadable


def is_env_file(path: Path) -> bool:
    name = path.name
    if name.endswith(".env.example"):
        return False
    return name.endswith(".env") or name == ".env" or name.startswith(".env.")


def is_dockerfile(path: Path) -> bool:
    name = path.name
    return (
        name == "Dockerfile"
        or name.startswith("Dockerfile.")
        or name.endswith(".Dockerfile")
    )


def dockerfile_instructions(text: str) -> list[tuple[int, str, str]]:
    """(line, INSTRUCTION, arguments), with continuations joined and comments dropped."""
    out, pending, start = [], "", 0
    for number, raw in enumerate(text.splitlines(), 1):
        stripped = raw.strip()
        if not pending and (not stripped or stripped.startswith("#")):
            continue
        if not pending:
            start = number
        if stripped.endswith("\\"):
            pending += stripped[:-1] + " "
            continue
        if pending and stripped.startswith("#"):
            continue
        whole = (pending + stripped).strip()
        pending = ""
        word, _, rest = whole.partition(" ")
        out.append((start, word.upper(), rest.strip()))
    return out


def check_dockerfile(path: Path, rel: str, lock: dict[str, LockEntry]) -> list[Finding]:
    found = []
    pinned = {(e.repository, e.tag, e.digest) for e in lock.values()}
    args: dict[str, str] = {}
    stages: set[str] = set()
    seen_from = False
    for number, word, rest in dockerfile_instructions(path.read_text(encoding="utf-8")):
        if word == "ARG" and not seen_from:
            for token in rest.split():
                key, _, default = token.partition("=")
                if _:
                    args[key] = default.strip("\"'")
        if word != "FROM":
            continue
        seen_from = True
        tokens = [t for t in rest.split() if not t.startswith("--")]
        if not tokens:
            found.append(Finding(f"{rel}:{number}", "FROM", "no image"))
            continue
        ref = re.sub(
            r"\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?",
            lambda m: args.get(m.group(1), m.group(0)),
            tokens[0],
        )
        if len(tokens) >= 3 and tokens[1].upper() == "AS":
            stages.add(tokens[2].lower())
        if ref.lower() in stages or ref == "scratch":
            continue
        if "$" in ref:
            found.append(
                Finding(
                    f"{rel}:{number}",
                    "FROM",
                    f"{tokens[0]}: a build argument without a default",
                )
            )
            continue
        repository, tag, digest = split_reference(ref)
        if not digest or not DIGEST_RE.fullmatch(digest):
            found.append(
                Finding(f"{rel}:{number}", "FROM", f"{ref}: not pinned by digest")
            )
        elif (normalize_repository(repository), tag, digest) not in pinned:
            found.append(
                Finding(f"{rel}:{number}", "FROM", f"{ref}: not in {LOCK_FILE}")
            )
    return found


def check_devcontainer(path: Path) -> list[Finding]:
    rel = DEVCONTAINER_FILE
    text = path.read_text(encoding="utf-8")
    try:
        config = json.loads(text)
    except json.JSONDecodeError as exc:
        return [
            Finding(
                rel,
                "json",
                f"not plain JSON, so it can't be checked: {exc.msg} at line {exc.lineno}",
            )
        ]
    found = []
    if config.get("features"):
        found.append(
            Finding(rel, "features", "features are fetched unpinned (plan §9)")
        )
    for key, why in DEVCONTAINER_REFUSED.items():
        if config.get(key):
            found.append(Finding(rel, key, why))
    args = [str(a) for a in config.get("runArgs") or []]
    for arg in args:
        flag = arg.split("=", 1)[0]
        if flag == "--security-opt":
            value = arg.partition("=")[2]
            if value not in SECURITY_OPT_ALLOWED:
                found.append(Finding(rel, "runArgs", f"{arg}: only no-new-privileges"))
        elif flag in RUN_ARGS_REFUSED:
            found.append(
                Finding(
                    rel, "runArgs", f"{arg}: a privileged or host-reaching run argument"
                )
            )
    if "${localEnv:" in text:
        found.append(
            Finding(
                rel,
                "localEnv",
                "${localEnv:...} carries the host's environment into the container",
            )
        )
    return found


def check_npmrc(path: Path, rel: str) -> list[Finding]:
    found = []
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith(("#", ";")):
            continue
        key, _, value = (part.strip() for part in line.partition("="))
        if key in NPMRC_FIXED:
            if value != NPMRC_FIXED[key]:
                found.append(
                    Finding(
                        f"{rel}:{number}",
                        ".npmrc",
                        f"{key} may only be {NPMRC_FIXED[key]}",
                    )
                )
        elif key not in NPMRC_ALLOWED:
            found.append(
                Finding(f"{rel}:{number}", ".npmrc", f"{key} isn't on the allowlist")
            )
    return found


def check_tree(
    root: Path, lock: dict[str, LockEntry]
) -> tuple[list[Finding], list[str]]:
    found: list[Finding] = []
    notes: list[str] = []
    files, unreadable = walk(root)
    for path in files:
        rel = path.relative_to(root).as_posix()
        try:
            if is_env_file(path):
                found.append(
                    Finding(
                        rel,
                        "env file",
                        "move it to ~/.config/h4reet-ai/env/ (contracts/env-files.md §1)",
                    )
                )
            elif is_dockerfile(path):
                found.extend(check_dockerfile(path, rel, lock))
            elif path.name == ".npmrc":
                found.extend(check_npmrc(path, rel))
        except (OSError, UnicodeDecodeError) as exc:
            notes.append(
                f"NOTE {rel}: unreadable here ({type(exc).__name__}), so not checked"
            )
    for path in unreadable:
        rel = (
            path.relative_to(root).as_posix()
            if path.is_relative_to(root)
            else str(path)
        )
        notes.append(
            f"NOTE {rel}/: unreadable here (the sandbox denies it); preflight P9 checks it in the Author's terminal"
        )
    devcontainer = root / DEVCONTAINER_FILE
    if devcontainer.exists():
        found.extend(check_devcontainer(devcontainer))
    return found, notes


# ---------------------------------------------------------------------------------------------------------------


def compose_config(root: Path, stack: str, env_file: str) -> dict:
    command = [
        "docker",
        "compose",
        "-p",
        f"h4reet-{stack}",
        "-f",
        str(root / COMPOSE_FILE),
        "--env-file",
        str(root / env_file),
        "config",
        "--no-interpolate",
        "--no-path-resolution",
        "--format",
        "json",
    ]
    # Nothing from the caller's shell: a COMPOSE_* or H4_* variable there would override the file being checked.
    clean = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": os.environ.get("HOME", "/nonexistent"),
        "LC_ALL": "C",
    }
    done = subprocess.run(
        command, capture_output=True, text=True, env=clean, check=False, timeout=60
    )
    if done.returncode != 0:
        lines = done.stderr.strip().splitlines()
        raise PolicyError(
            f"docker compose config refused {COMPOSE_FILE} with {env_file}: {lines[-1] if lines else done.returncode}"
        )
    return json.loads(done.stdout)


def compose_available() -> bool:
    if not shutil.which("docker"):
        return False
    done = subprocess.run(
        ["docker", "compose", "version"], capture_output=True, text=True, check=False
    )
    return done.returncode == 0


def run(root: Path) -> int:
    if not compose_available():
        print(
            "SKIP: the docker CLI with compose isn't installed here; the Author's gate runs the policy on the host"
        )
        return 0
    try:
        lock = parse_lock(root / LOCK_FILE)
        disclosure = root / DISCLOSURE_FILE
        disclosed = disclosed_services(disclosure) if disclosure.exists() else set()
        findings: list[Finding] = []
        if not disclosure.exists():
            findings.append(Finding(DISCLOSURE_FILE, "disclosure", "missing (FR-040)"))
        seen: set[Finding] = set()
        for stack, env_file in ENV_FILES:
            values, errors = parse_env_file(root / env_file)
            findings.extend(Finding(env_file, "grammar", e) for e in errors)
            findings.extend(check_env_values(env_file, values))
            for finding in check_model(
                compose_config(root, stack, env_file), lock, root, disclosed
            ):
                if (
                    finding not in seen
                ):  # the same compose file, rendered once per env file
                    seen.add(finding)
                    findings.append(finding)
        tree_findings, notes = check_tree(root, lock)
        findings.extend(tree_findings)
    except (
        OSError,
        PolicyError,
        json.JSONDecodeError,
        subprocess.TimeoutExpired,
    ) as exc:
        print(f"compose policy: can't run: {exc}", file=sys.stderr)
        return 2
    planned = [f for f in findings if f.planned]
    refusals = [f for f in findings if not f.planned]
    for note in notes:
        print(note)
    for finding in planned + refusals:
        print(finding.line())
    scope = f"{COMPOSE_FILE} with {len(ENV_FILES)} env files, the Dockerfiles, the env-file placement, .devcontainer, .npmrc"
    if refusals:
        print(f"compose policy: {len(refusals)} refusal(s) ({scope})")
        return 1
    tail = f", {len(planned)} planned" if planned else ""
    print(f"compose policy: PASS{tail} ({scope})")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--root",
        type=Path,
        default=ROOT,
        help="the tree to check (default: this repository)",
    )
    args = parser.parse_args(argv)
    return run(args.root.resolve())


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
