#!/usr/bin/env python3
"""make plan ROOT=<root> [PROFILE=…]: the Author's real plan (spec 001 contracts/infra-records.md §1 and §2;
research.md R-13, R-14; tasks.md T024; FR-004, FR-005, FR-010). His terminal alone: the sandbox, and the bash gate
(P-1), refuse it to agent sessions, which hold no AWS session anyway.

    python3 -I -B -X pycache_prefix=/dev/null scripts/infra/infra_plan.py --root bootstrap|account|prod [--profile NAME]

In order, and stopping at the first that fails:
  1. infra/ is as HEAD holds it, with nothing untracked or ignored under it, since the block names HEAD:infra's tree;
     and no plan of that tree is saved, nor its stamp: a plan, reviewed or verified, is never replaced;
  2. the root's values, ~/.config/h4reet-ai/infra/<root>.env, read as data: TF_VAR_ lines of variables the root
     declares, mode 0600;
  3. the provider mirror (make infra-mirror, T011), and terraform at .devcontainer/toolchain.vars's pin;
  4. tools/gates/infra_policy.py on the HCL, BEFORE init, since init and plan run agent-written configuration with
     the Author's administrator session; then `terraform fmt -check` on the root, which reads its files and runs none;
  5. terraform init against the mirror alone (a CLI configuration naming only it), with the lockfile read-only, the
     local state's path for a root whose backend is local, and the state bucket for one whose backend is s3;
  6. terraform plan -out=~/.config/h4reet-ai/infra/plans/<root>-<tree>.tfplan;
  7. the plan's text through tools/gates/infra_redact.py (with the root's redact.txt), which refuses a secret pattern;
  8. the policy again, on the saved plan's JSON, which also covers what a module computes.
Then it prints the block to paste into the merge-request note, on stdout, alone. TF_DATA_DIR is
~/.config/h4reet-ai/infra/data/<root>, outside the tree. Exit codes: 0 the block; 1 the policy or terraform refused;
2 it couldn't run; 3 the redaction refused (no block, and the saved plan is removed).
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path

PROG = "make plan"


def _common():
    spec = importlib.util.spec_from_file_location(
        "infra_common", Path(__file__).resolve().with_name("infra_common.py")
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


c = _common()


def cli_config(mirror: Path) -> str:
    return f'provider_installation {{\n  filesystem_mirror {{\n    path = "{mirror}"\n  }}\n}}\n'


def block(root: str, tree: str, sha: str, terraform: str, made: str, text: str) -> str:
    return (
        f"<!-- h4-plan root={root} tree={tree} sha256={sha} terraform={terraform} made={made} -->\n"
        f"```terraform-plan\n{text.rstrip(chr(10))}\n```\n<!-- /h4-plan -->\n"
    )


def drop(plan: Path) -> None:
    plan.unlink(missing_ok=True)
    c.stamp_path(plan).unlink(missing_ok=True)


def run(root: str, given_profile: str | None) -> int:
    repo, home = c.REPO, Path.home()
    if root not in c.ROOTS or not (repo / "infra" / root).is_dir():
        c.say(
            PROG,
            f"ROOT must be one of {', '.join(c.ROOTS)}, with its folder under infra/",
        )
        return 2
    try:
        policy = c.load_gate(repo, "infra_policy")
        redact = c.load_gate(repo, "infra_redact")
    except FileNotFoundError as exc:
        c.say(PROG, f"PLANNED (T010): {exc} arrives with the guard patch, P-1")
        return 2
    try:
        profile = c.profile_of(given_profile)
        dirty = c.infra_dirty(repo)
        if dirty:
            raise c.Refusal(
                "dirty",
                f"{len(dirty)} path(s) differ from HEAD (first: {dirty[0]}); commit or remove them",
            )
        tree = c.git(repo, "rev-parse", "HEAD:infra").strip()
        # A plan of this tree, reviewed or verified, is never replaced (T028's review, nit 3): he removes it himself.
        for held in (
            c.plan_path(home, root, tree),
            c.stamp_path(c.plan_path(home, root, tree)),
        ):
            if held.exists():
                raise c.Refusal(
                    "plan_exists",
                    f"{held} exists, a plan of this tree; remove it and its stamp yourself to plan again",
                )
        values = c.read_env_file(home, root, c.declared_variables(policy, repo, root))
        mirror = c.mirror_dir(home)
        if not mirror.is_dir():
            raise c.Refusal(
                "no_mirror",
                f"{mirror} is missing: make infra-mirror seeds it (tasks.md T011)",
            )
        pin = c.read_pins(repo).get("TERRAFORM_VERSION", "")
        version = c.terraform(repo, root, ["version"], c.terraform_env(home, root))
        if f"Terraform v{pin}" not in version.stdout.splitlines()[:1]:
            raise c.Refusal(
                "no_terraform",
                f"terraform on PATH isn't {pin}, .devcontainer/toolchain.vars's pin",
            )
        backend = c.backend_of(policy, repo, root)
        if backend == "local":
            backend_config = [f"-backend-config=path={c.state_path(home, root)}"]
        elif backend == "s3":
            suffix = c.read_env_file(home, "bootstrap", None).get(
                "TF_VAR_state_bucket_suffix"
            )
            if not suffix:
                raise c.Refusal(
                    "no_values",
                    "the state bucket's suffix, TF_VAR_state_bucket_suffix, isn't in bootstrap.env",
                )
            backend_config = [f"-backend-config=bucket={c.STATE_BUCKET.format(suffix)}"]
        else:
            backend_config = []
    except (c.Refusal, c.GitError, OSError) as exc:
        c.say(PROG, f"can't run: {getattr(exc, 'reason', exc.__class__.__name__)}")
        return 2

    checked = subprocess.run(
        [
            sys.executable,
            "-I",
            "-B",
            "-X",
            "pycache_prefix=/dev/null",
            str(repo / "tools" / "gates" / "infra_policy.py"),
            "--root",
            str(repo),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if checked.returncode != 0:
        sys.stderr.write(checked.stdout + checked.stderr)
        c.say(
            PROG,
            "refused: the policy found the above in the HCL, so no terraform command ran",
        )
        return 1
    # terraform fmt, before init: nothing else checks this root's formatting where Terraform runs (T028's review, nit 1).
    formatted = c.terraform(
        repo, root, ["fmt", "-check", "-no-color"], c.terraform_env(home, root)
    )
    if formatted.returncode != 0:
        sys.stderr.write(formatted.stdout + formatted.stderr)
        c.say(
            PROG,
            "refused: terraform fmt -check lists the files above; run terraform fmt on them, and commit",
        )
        return 1

    plan = c.plan_path(home, root, tree)
    for folder in (
        c.plans_dir(home),
        c.data_dir(home, root),
        c.state_path(home, root).parent,
    ):
        folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.TemporaryDirectory(prefix="infra-plan-") as tmp:
        config = Path(tmp) / "terraform.rc"
        config.write_text(cli_config(mirror), encoding="utf-8")
        env = c.terraform_env(
            home, root, TF_CLI_CONFIG_FILE=str(config), AWS_PROFILE=profile, **values
        )
        steps = [
            (
                "init",
                [
                    "init",
                    "-input=false",
                    "-lockfile=readonly",
                    "-no-color",
                    *backend_config,
                ],
            ),
            (
                "plan",
                ["plan", "-input=false", "-lock=true", "-no-color", f"-out={plan}"],
            ),
            ("show", ["show", "-no-color", str(plan)]),
            ("show -json", ["show", "-json", str(plan)]),
        ]
        out = {}
        for name, args in steps:
            done = c.terraform(repo, root, args, env)
            if done.returncode != 0:
                sys.stderr.write(done.stderr)
                c.say(
                    PROG,
                    f"refused: terraform {name} exited {done.returncode}; no block",
                )
                drop(plan)
                return 1
            out[name] = done.stdout

    redact_file = repo / "infra" / root / "redact.txt"
    names = redact.read_names(redact_file) if redact_file.is_file() else set()
    try:
        text = redact.redact(out["show"], names)
    except redact.Refused as exc:
        c.say(
            PROG,
            f"refused, no block: {exc}; the plan's text holds a secret pattern, and the saved plan is removed",
        )
        drop(plan)
        return 3
    if "```" in text:
        c.say(
            PROG,
            "refused, no block: the plan's text holds a code fence, which would end the block early",
        )
        drop(plan)
        return 3
    findings = policy.check_plan_json(json.loads(out["show -json"]), root)
    if findings:
        for f in findings:
            print(f, file=sys.stderr)
        c.say(
            PROG,
            "refused: the policy found the above in the saved plan, which is removed",
        )
        drop(plan)
        return 1
    sys.stdout.write(block(root, tree, c.sha256_file(plan), pin, c.utc_now(), text))
    c.say(
        PROG,
        f"saved {plan}; paste the block above into the branch's note (tasks.md T027)",
    )
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="infra_plan.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument("--root", required=True)
    parser.add_argument("--profile")
    args = parser.parse_args(argv)
    if c.in_sandbox():
        c.say(
            PROG,
            "ROOT=… is the Author's: it runs terraform init and plan with his SSO session, in his terminal",
        )
        return 2
    return run(args.root, args.profile)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
