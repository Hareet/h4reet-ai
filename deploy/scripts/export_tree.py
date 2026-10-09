#!/usr/bin/env python3
"""make up's first step on a host stack: export the commit it will run (plan §4; contracts/env-files.md §12;
research.md R-33).

    python3 -I -B -X pycache_prefix=/dev/null deploy/scripts/export_tree.py --stack prod|dev [--ref REF]
        [--repo DIR] [--state-dir DIR]

It resolves REF (HEAD by default) to a commit, exports it once with `git archive` into
<state>/tree/<sha>, read-only, and writes <state>/run.env (0600): H4_TREE, H4_REF, H4_REF_BRANCH, and
H4_REF_PREVIOUS, the commit that ran before, which `make up REF=<it>` brings back. The stack then runs that
commit's compose file, configuration, and images, whatever the working tree holds later. It keeps the running and
the previous commit's exports, and at most three in all.

<state> is ~/.local/state/h4reet/<stack>, the only H4_STATE_DIR preflight allows on a host stack, so make finds
the run file without reading the env file. dev-cpu has no export: the engine serves the masked working tree.
Exit codes: 0 done; 1 REF isn't a commit, or git or the export failed; 2 usage.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import os
import re
import shutil
import stat
import subprocess
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
KEEP = 3
RUN_KEYS = ("H4_TREE", "H4_REF", "H4_REF_BRANCH", "H4_REF_PREVIOUS")
SHA_RE = re.compile(r"[0-9a-f]{40}")


class ExportError(Exception):
    pass


def git(repo: Path, *args: str, binary: bool = False) -> subprocess.CompletedProcess:
    # Replace refs live under .git/refs/replace, which agents can write and git status doesn't show; without
    # this, git archive would export the replacement objects instead of the commit's own.
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        env={**os.environ, "GIT_NO_REPLACE_OBJECTS": "1"},
        capture_output=True,
        text=not binary,
        check=False,
        timeout=300,
    )


def object_id(kind: bytes, data: bytes) -> str:
    """The ID git gives an object of this kind and content (SHA-1 object format)."""
    return hashlib.sha1(b"%s %d\0" % (kind, len(data)) + data).hexdigest()


def commit_tree(repo: Path, sha: str) -> str:
    """The tree a commit names, read from the commit object itself, after checking the object is that commit.

    git cat-file doesn't rehash what it reads, so this does. With it, export()'s tree check proves an export is the
    commit's own content, whatever .git holds, without trusting git's handling of any one file in it."""
    done = git(repo, "cat-file", "commit", sha, binary=True)
    if done.returncode or object_id(b"commit", done.stdout) != sha:
        raise ExportError(
            f"the object store's copy of {sha} isn't that commit; run git fsck"
        )
    tree = re.fullmatch(rb"tree ([0-9a-f]{40})", done.stdout.split(b"\n", 1)[0])
    if not tree:
        raise ExportError(f"commit {sha} names no tree")
    return tree.group(1).decode()


def tree_id(directory: Path) -> str | None:
    """The tree ID git would give a directory's contents, or None for an empty one, which a tree can't hold."""
    entries = []
    with os.scandir(directory) as found:
        for entry in found:
            name = os.fsencode(entry.name)
            if entry.is_symlink():
                target = os.fsencode(os.readlink(entry.path))
                entries.append((name, b"120000", object_id(b"blob", target)))
            elif entry.is_dir(follow_symlinks=False):
                sub = tree_id(Path(entry.path))
                if sub is not None:
                    # git orders a directory as if its name ended in "/"
                    entries.append((name + b"/", b"40000", sub))
            elif entry.is_file(follow_symlinks=False):
                executable = entry.stat(follow_symlinks=False).st_mode & 0o100
                data = Path(entry.path).read_bytes()
                entries.append(
                    (
                        name,
                        b"100755" if executable else b"100644",
                        object_id(b"blob", data),
                    )
                )
            else:
                raise ExportError(f"{entry.path} is not a file, a link, or a directory")
    if not entries:
        return None
    entries.sort()
    body = b"".join(
        mode + b" " + key.removesuffix(b"/") + b"\0" + bytes.fromhex(oid)
        for key, mode, oid in entries
    )
    return object_id(b"tree", body)


def resolve(repo: Path, ref: str) -> tuple[str, str]:
    """The commit's full SHA, and the branch to record: REF's own, HEAD's for HEAD, otherwise detached."""
    done = git(repo, "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}")
    sha = done.stdout.strip()
    if done.returncode or not SHA_RE.fullmatch(sha):
        raise ExportError(f"REF {ref} isn't a commit")
    if (
        git(repo, "show-ref", "--verify", "--quiet", f"refs/heads/{ref}").returncode
        == 0
    ):
        return sha, ref
    if ref == "HEAD":
        branch = git(repo, "symbolic-ref", "--short", "--quiet", "HEAD").stdout.strip()
        return sha, branch or "detached"
    return sha, "detached"


def private_dir(path: Path) -> None:
    """A 0700 directory, made if missing, and never reached through a link."""
    if path.is_symlink():
        raise ExportError(
            f"{path} is a symbolic link; move it aside and run make up again"
        )
    path.mkdir(mode=0o700, exist_ok=True)


def read_run(path: Path) -> dict[str, str]:
    values = {}
    if path.is_file():
        for line in path.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and key in RUN_KEYS:
                values[key] = value
    return values


def make_read_only(top: Path) -> None:
    for dirpath, dirnames, filenames in os.walk(top):
        for name in filenames:
            path = Path(dirpath, name)
            if not path.is_symlink():
                mode = stat.S_IMODE(path.lstat().st_mode)
                path.chmod(0o555 if mode & 0o111 else 0o444)
        Path(dirpath).chmod(0o555)


def make_writable(top: Path) -> None:
    for dirpath, _, _ in os.walk(top):
        Path(dirpath).chmod(0o755)


def export(repo: Path, sha: str, trees: Path) -> Path:
    """Export a commit once, and prove the export is that commit's own tree, whatever .git holds (R3-1)."""
    expected = commit_tree(repo, sha)
    target = trees / sha
    if target.is_dir():
        if not (target / "deploy/compose.yaml").is_file():
            raise ExportError(
                f"{target} exists but holds no deploy/compose.yaml; move it aside and run make up again"
            )
        if tree_id(target) != expected:
            raise ExportError(
                f"{target} no longer matches commit {sha}; move it aside and run make up again"
            )
        return target
    listing = git(repo, "ls-tree", "-r", "-z", sha, binary=True)
    if listing.returncode:
        raise ExportError(f"git ls-tree {sha} failed")
    if any(line.startswith(b"160000 ") for line in listing.stdout.split(b"\0")):
        # git archive writes a submodule as an empty directory, which the tree check below could never match.
        raise ExportError(
            f"commit {sha} holds a submodule, which a stack's export doesn't support"
        )
    attributes = git(repo, "rev-parse", "--git-path", "info/attributes").stdout.strip()
    if attributes and (repo / attributes).exists():
        # git archive applies its export-ignore and export-subst rules, and git status doesn't show the file.
        raise ExportError(
            f"{repo / attributes} exists, and git archive would apply it to the export; move it aside first"
        )
    archive = git(repo, "archive", "--format=tar", sha, binary=True)
    if archive.returncode:
        raise ExportError(
            f"git archive {sha} failed: {archive.stderr.decode(errors='replace').strip()[-200:]}"
        )
    staging = trees / f".{sha}.{os.getpid()}"
    if staging.exists():
        make_writable(staging)
        shutil.rmtree(staging)
    staging.mkdir(mode=0o700)
    with tarfile.open(fileobj=io.BytesIO(archive.stdout), mode="r:") as tar:
        tar.extractall(
            staging, filter="data"
        )  # no absolute paths, no "..", no device files
    if not (staging / "deploy/compose.yaml").is_file():
        make_writable(staging)
        shutil.rmtree(staging)
        raise ExportError(
            f"commit {sha} has no deploy/compose.yaml, so it can't run as a stack"
        )
    # The checks above name the files known to steer git archive. This one doesn't depend on that list: the
    # export must hash to the commit's own tree, or something in .git changed what was exported.
    if tree_id(staging) != expected:
        make_writable(staging)
        shutil.rmtree(staging)
        raise ExportError(
            f"the export of {sha} doesn't match the commit's own tree, so something in .git changed what git "
            "archive wrote (look in .git/info and .git/objects/info, and run git fsck). The repository's "
            ".gitattributes may ask for no conversion but eol=lf"
        )
    make_read_only(staging)
    staging.chmod(0o555)
    os.rename(staging, target)
    return target


def prune(trees: Path, keep: set[str]) -> list[str]:
    """Delete every export but those in keep and the newest others, so at most KEEP remain."""
    exports = sorted(
        (p for p in trees.iterdir() if p.is_dir() and SHA_RE.fullmatch(p.name)),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    kept = [p for p in exports if p.name in keep]
    for path in exports:
        if path.name not in keep and len(kept) < KEEP:
            kept.append(path)
    removed = []
    for path in exports:
        if path not in kept:
            make_writable(path)
            shutil.rmtree(path)
            removed.append(path.name)
    return removed


def write_run(path: Path, values: dict[str, str]) -> None:
    tmp = path.with_name(f".{path.name}.{os.getpid()}")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write("".join(f"{key}={values[key]}\n" for key in RUN_KEYS))
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, path)


def run(stack: str, ref: str, repo: Path, state: Path) -> int:
    sha, branch = resolve(repo, ref)
    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    trees = state / "tree"
    private_dir(trees)
    # The gateway's journal and incident drafts. Compose's long-syntax bind never creates a missing source.
    private_dir(state / "gateway")
    run_file = state / "run.env"
    before = read_run(run_file)
    previous = before.get("H4_REF", "")
    if previous == sha:  # the same commit again: keep what ran before it
        previous = before.get("H4_REF_PREVIOUS", "")
    target = export(repo, sha, trees)
    os.utime(target)  # the newest, for pruning
    write_run(
        run_file,
        {
            "H4_TREE": str(target),
            "H4_REF": sha,
            "H4_REF_BRANCH": branch,
            "H4_REF_PREVIOUS": previous,
        },
    )
    removed = prune(trees, {sha, previous} - {""})
    print(f"h4reet-{stack}: commit {sha} ({branch}), exported read-only to {target}")
    print(
        f"  previous: {previous or 'none'}{'; rollback: make up ENV=' + stack + ' REF=' + previous if previous else ''}"
    )
    if removed:
        print(f"  removed older exports: {', '.join(r[:12] for r in removed)}")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Export the commit a host stack will run"
    )
    parser.add_argument("--stack", required=True)
    parser.add_argument("--ref", default="HEAD")
    parser.add_argument("--repo", type=Path, default=ROOT)
    parser.add_argument("--state-dir", type=Path)
    args = parser.parse_args(argv)
    if args.stack not in ("prod", "dev"):
        print(
            "export: only prod and dev run an export; dev-cpu runs the working tree",
            file=sys.stderr,
        )
        return 2
    if (
        not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/~^@{}-]{0,200}", args.ref)
        or ".." in args.ref
    ):
        print("export: REF is a commit, a branch, or a tag", file=sys.stderr)
        return 2
    state = args.state_dir or Path.home() / ".local/state/h4reet" / args.stack
    try:
        return run(args.stack, args.ref, args.repo.resolve(), state)
    except (ExportError, OSError, tarfile.TarError) as error:
        print(f"export: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
