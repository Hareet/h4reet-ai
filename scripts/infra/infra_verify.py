#!/usr/bin/env python3
"""make infra-verify ROOT=<root> [PROFILE=…]: before the Author's apply, on main (spec 001 contracts/infra-records.md
§2, and September's §4 at 00309c47; research.md R-13; tasks.md T024; FR-005, FR-007, FR-008). His terminal alone: the
sandbox, and the bash gate (P-1), refuse it to agent sessions.

    python3 -I -B -X pycache_prefix=/dev/null scripts/infra/infra_verify.py --root bootstrap|account|prod [--profile NAME]

It refuses, naming the first reason, unless all of these hold, in this order:

  not_main            the checkout is on refs/heads/main
  dirty               no tracked change anywhere, and nothing under infra/ that HEAD doesn't hold, untracked or ignored
  no_reviewed_plan    a merge on main's first-parent line, since infra/ last changed, brought a note holding exactly one
                      block for this root whose tree is HEAD:infra
  plan_missing        the saved plan ~/.config/h4reet-ai/infra/plans/<root>-<tree>.tfplan exists, with Terraform's
  plan_stale            data folder for the root; a saved plan of an older tree alone is stale
  plan_not_reviewed   the saved plan's SHA-256 is the block's
  plan_differs        `terraform show -no-color` of it, redacted as make plan redacts it, is the block's text
  credential_finding  the credential audit (infra/lambdas/credential_audit/audit.py --terminal) finds nothing
  state_locked        no apply holds the state's lock: the local state's lock file, or the bucket's <key>.tflock

Then it writes a stamp beside the plan (<root>-<tree>.verified: the commit, the note, the time), which make infra-record
reads, and prints the one command to run, and nothing else:

    AWS_PROFILE=<profile> TF_DATA_DIR=<…/data/root> terraform -chdir=infra/<root> apply <…/plans/root-tree.tfplan>

Exit codes: 0 the command; 1 refused, with its code; 2 it couldn't run (the sandbox, the root, no profile, P-1 missing).
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import shlex
import subprocess
import sys
from pathlib import Path

PROG = "infra-verify"
NOTES = "docs/merge-requests/"


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


def check_main(repo: Path) -> None:
    head = subprocess.run(
        ["git", "--no-replace-objects", "-C", str(repo), "symbolic-ref", "-q", "HEAD"],
        capture_output=True,
        text=True,
        check=False,
    ).stdout.strip()
    if head != "refs/heads/main":
        raise c.Refusal(
            "not_main",
            "the checkout isn't on main; the Author applies only what main holds",
        )


def check_clean(repo: Path) -> None:
    dirty = c.infra_dirty(repo)
    if dirty:
        raise c.Refusal(
            "dirty", f"{len(dirty)} path(s) differ from HEAD (first: {dirty[0]})"
        )


def reviewed_block(repo: Path, root: str, tree: str, notes_mod) -> tuple[str, object]:
    """The one block for this root and tree, in a note a merge brought since infra/ last changed."""
    merges = c.git(
        repo, "log", "--first-parent", "--merges", "--format=%H", "-n", "200", "HEAD"
    ).split()
    found = []
    for m in merges:
        try:
            if c.git(repo, "rev-parse", f"{m}:infra").strip() != tree:
                break
        except c.GitError:
            break
        notes = [
            p
            for p in c.git(
                repo, "diff", "--name-only", f"{m}^1", m, "--", NOTES
            ).splitlines()
            if p.endswith(".md")
        ]
        for note in notes:
            try:
                text = c.git(repo, "show", f"HEAD:{note}")
            except c.GitError:
                continue
            for b in notes_mod.blocks_in(note, text):
                if b.attrs.get("root") == root and b.attrs.get("tree") == tree:
                    found.append((note, b))
    unique = {(note, b.line): (note, b) for note, b in found}
    if not unique:
        raise c.Refusal(
            "no_reviewed_plan",
            f"no merge since infra/ last changed brought a note with a block for {root} at infra/'s tree {tree}",
        )
    if len(unique) > 1:
        raise c.Refusal(
            "no_reviewed_plan",
            f"{len(unique)} blocks for {root} at this tree; exactly one may stand",
        )
    return next(iter(unique.values()))


def check_plan(home: Path, root: str, tree: str, sha256: str) -> Path:
    plan = c.plan_path(home, root, tree)
    if not plan.is_file():
        older = (
            sorted(p.name for p in c.plans_dir(home).glob(f"{root}-*.tfplan"))
            if c.plans_dir(home).is_dir()
            else []
        )
        if older:
            raise c.Refusal(
                "plan_stale",
                f"the saved plan is of an older infra/ tree ({older[0]}); make plan ROOT={root} again",
            )
        raise c.Refusal(
            "plan_missing",
            f"no saved plan for {root} at this tree; make plan ROOT={root}",
        )
    if c.sha256_file(plan) != sha256:
        raise c.Refusal(
            "plan_not_reviewed", "the saved plan's SHA-256 isn't the block's"
        )
    return plan


def check_rendering(
    repo: Path, home: Path, root: str, plan: Path, text: str, redact
) -> None:
    if not (c.data_dir(home, root) / "terraform.tfstate").is_file():
        raise c.Refusal(
            "plan_missing",
            f"Terraform's data folder for {root} is gone; make plan ROOT={root} again",
        )
    done = c.terraform(
        repo, root, ["show", "-no-color", str(plan)], c.terraform_env(home, root)
    )
    if done.returncode != 0:
        raise c.Refusal(
            "plan_differs",
            f"terraform show couldn't read the saved plan (exit {done.returncode})",
        )
    redact_file = repo / "infra" / root / "redact.txt"
    names = redact.read_names(redact_file) if redact_file.is_file() else set()
    try:
        shown = redact.redact(done.stdout, names)
    except redact.Refused as exc:
        raise c.Refusal(
            "plan_differs", f"the saved plan's text holds a secret pattern ({exc})"
        ) from None
    want, got = text.rstrip("\n").splitlines(), shown.rstrip("\n").splitlines()
    if want != got:
        line = next(
            (i for i, (a, b) in enumerate(zip(want, got), 1) if a != b),
            min(len(want), len(got)) + 1,
        )
        raise c.Refusal(
            "plan_differs",
            f"the saved plan's text differs from the reviewed block, from its line {line}",
        )


def check_audit(repo: Path, home: Path, profile: str) -> None:
    done = subprocess.run(
        [
            sys.executable,
            "-I",
            "-B",
            "-X",
            "pycache_prefix=/dev/null",
            str(repo / "infra" / "lambdas" / "credential_audit" / "audit.py"),
            "--terminal",
            "--profile",
            profile,
        ],
        capture_output=True,
        text=True,
        env=c.aws_env(home),
        check=False,
        stdin=subprocess.DEVNULL,
    )
    if done.returncode == 0:
        return
    try:
        findings = json.loads(done.stdout)["findings"] if done.returncode == 1 else None
    except (ValueError, KeyError, TypeError):
        findings = None
    if findings is None:
        raise c.Refusal(
            "credential_finding",
            f"the credential audit couldn't run (exit {done.returncode}); make infra-audit",
        )
    named = "; ".join(f"{f['check']}: {f['resource']}" for f in findings)
    raise c.Refusal("credential_finding", f"the credential audit found {named}")


def check_lock(repo: Path, home: Path, root: str, profile: str) -> None:
    meta = (
        json.loads(
            (c.data_dir(home, root) / "terraform.tfstate").read_text(encoding="utf-8")
        ).get("backend")
        or {}
    )
    kind, config = meta.get("type"), meta.get("config") or {}
    if kind == "local":
        state = Path(config.get("path") or repo / "infra" / root / "terraform.tfstate")
        if (state.parent / f".{state.name}.lock.info").exists():
            raise c.Refusal(
                "state_locked",
                "the local state's lock is held; only the Author releases it (force-unlock)",
            )
        return
    if kind == "s3":
        done = subprocess.run(
            [
                "aws",
                "s3api",
                "head-object",
                "--bucket",
                str(config.get("bucket")),
                "--key",
                f"{config.get('key')}.tflock",
                "--profile",
                profile,
                "--region",
                str(config.get("region") or "us-east-1"),
                "--no-cli-pager",
            ],
            capture_output=True,
            text=True,
            env=c.aws_env(home),
            check=False,
            stdin=subprocess.DEVNULL,
        )
        if done.returncode == 0:
            raise c.Refusal(
                "state_locked",
                "the bucket holds the state's lock object; only the Author releases it",
            )
        if "(404)" in done.stderr or "Not Found" in done.stderr:
            return
        raise c.Refusal(
            "state_locked",
            f"the state's lock couldn't be read (aws exit {done.returncode})",
        )
    raise c.Refusal(
        "state_locked",
        f"Terraform's data folder names a backend this check doesn't know ({kind})",
    )


def verify(repo: Path, home: Path, root: str, profile: str) -> str:
    notes_mod = c.load_gate(repo, "infra_plan_note")
    redact = c.load_gate(repo, "infra_redact")
    check_main(repo)
    check_clean(repo)
    tree = c.git(repo, "rev-parse", "HEAD:infra").strip()
    note, b = reviewed_block(repo, root, tree, notes_mod)
    plan = check_plan(home, root, tree, b.attrs.get("sha256", ""))
    check_rendering(repo, home, root, plan, b.text, redact)
    check_audit(repo, home, profile)
    check_lock(repo, home, root, profile)
    stamp = {
        "root": root,
        "tree": tree,
        "sha256": b.attrs["sha256"],
        "commit": c.git(repo, "rev-parse", "HEAD").strip(),
        "note": note,
        "verified_at": c.utc_now(),
    }
    c.stamp_path(plan).write_text(json.dumps(stamp, indent=2) + "\n", encoding="utf-8")
    data = c.data_dir(home, root)
    return (
        f"AWS_PROFILE={shlex.quote(profile)} TF_DATA_DIR={shlex.quote(str(data))} "
        f"terraform -chdir=infra/{root} apply {shlex.quote(str(plan))}"
    )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="infra_verify.py", description=__doc__.split("\n\n", 1)[0]
    )
    parser.add_argument("--root", required=True)
    parser.add_argument("--profile")
    args = parser.parse_args(argv)
    if c.in_sandbox():
        c.say(
            PROG,
            "this is the Author's: it reads his saved plans and runs the audit with his SSO session",
        )
        return 2
    if args.root not in c.ROOTS:
        c.say(PROG, f"ROOT must be one of {', '.join(c.ROOTS)}")
        return 2
    try:
        profile = c.profile_of(args.profile)
        c.terraform_bin()
    except c.Refusal as exc:
        c.say(PROG, f"can't run: {exc.reason}")
        return 2
    try:
        command = verify(c.REPO, Path.home(), args.root, profile)
    except FileNotFoundError as exc:
        c.say(PROG, f"PLANNED (T010): {exc} arrives with the guard patch, P-1")
        return 2
    except c.Refusal as exc:
        c.say(PROG, f"refused: {exc.code}: {exc.reason}")
        return 1
    except c.GitError as exc:
        c.say(PROG, f"can't run: {exc}")
        return 2
    print(command)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
