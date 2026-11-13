"""The night shift's install-and-rehearse script (spec 017, plan.md §6; contracts/install.md; tasks.md T052).

`deploy/night-shift/install.sh` runs here against stub `docker`, `git`, and `claude` on PATH (stub_docker.py; the
stub git logs each call and runs the real one; the stub claude must never be called), a fake $HOME, and a scratch
repository whose commit holds this worktree's night-shift files, with /srv/studio moved into the test's folder
(H4_NIGHT_STUDIO, and the same move in the commit's fragments and rows). Values that look like secrets are made at
run time. Nothing here reaches a network or a real engine.

It checks contracts/install.md and T052's list: refusals that install nothing (a SHA that doesn't resolve, a facts
file missing a key, a token file of the wrong mode or shape, a null or differing base digest, a billing variable);
reads only by `git show`; the fill, and a leftover placeholder refused; 0444 files and 0555 folders; the R-steps in
order, a failure stopping with `install: FAILED at <step>`; a summary with no planted secret; the first install
refusing a non-empty outputs folder, printing only the count; a second run printing `unchanged`; and `--undo`
leaving the fake home as it was, but the token and facts files, which it names.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import re
import secrets
import shutil
import stat
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
NIGHT = HERE.parent
ROOT = NIGHT.parent.parent
INSTALL = NIGHT / "install.sh"
STUB_DOCKER = HERE / "stub_docker.py"
GIT = "/usr/bin/git"
PY = "/usr/bin/python3"
ROLES = (
    "supervisor",
    "spec-writer",
    "implementer",
    "reviewer",
    "red-teamer",
    "ops",
    "gate-runner",
    "studio",
    "plan",
    "comfyui",
)
IMAGES = ("toolchain", "worker", "studio", "comfyui", "egress")
NETWORKS = ("h4-night", "h4-night-engine", "h4-night-studio", "h4-night-plan")
COPY = (
    ".claude/settings.json",
    ".devcontainer/Dockerfile",
    ".devcontainer/requirements-tools.txt",
    "tools/gates/lint-node/package.json",
    "tools/gates/lint-node/package-lock.json",
    "tools/gates/lint-node/eslint.config.mjs",
    "tools/gates/lint-node/prettier.config.json",
    "redteam/night-shift/rows.json",
    "redteam/night-shift/run.sh",
)
GIT_ENV = {
    "GIT_CONFIG_GLOBAL": "/dev/null",
    "GIT_CONFIG_NOSYSTEM": "1",
    "GIT_AUTHOR_NAME": "t",
    "GIT_AUTHOR_EMAIL": "t@example.invalid",
    "GIT_COMMITTER_NAME": "t",
    "GIT_COMMITTER_EMAIL": "t@example.invalid",
    "PATH": "/usr/bin:/bin",
}


def git(repo: Path, *args: str) -> str:
    return subprocess.run(
        [GIT, "-C", str(repo), *args],
        env=GIT_ENV,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def digest(name: str) -> str:
    return "sha256:" + hashlib.sha256(name.encode()).hexdigest()


# ---- the scratch commit, made once ----------------------------------------------------------------------------------
@pytest.fixture(scope="module")
def template(tmp_path_factory) -> dict:
    base = Path(os.path.realpath(tmp_path_factory.mktemp("tpl")))
    repo = base / "repo"
    repo.mkdir()
    git(repo, "init", "-q", "-b", "main")
    git(repo, "config", "gc.auto", "0")
    for src in sorted((NIGHT).rglob("*")):
        rel = src.relative_to(ROOT)
        if src.is_dir() or "tests" in rel.parts or "__pycache__" in rel.parts:
            continue
        (repo / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, repo / rel)
    for rel in COPY:
        (repo / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / rel, repo / rel)
    for rel in ("CLAUDE.md", "REVIEW.md", "Makefile"):
        (repo / rel).write_text(f"stand-in {rel}\n")
    ns = repo / "deploy" / "night-shift"
    pins = json.loads((ns / "images" / "pins.json").read_text())
    for name, b in pins["bases"].items():
        b["digest"] = digest(name)
    (ns / "images" / "pins.json").write_text(json.dumps(pins, indent=2) + "\n")
    subprocess.run(
        [
            PY,
            "-I",
            "-B",
            str(ns / "containers" / "build.py"),
            "--settings",
            str(repo / ".claude/settings.json"),
        ],
        check=True,
        capture_output=True,
    )
    (repo / "deploy" / "agents-engine").mkdir(parents=True)
    (repo / "deploy" / "agents-engine" / "egress-proxy.py").write_text(
        "# main's egress proxy\n"
    )
    # make check's secrets gate reads it from the main tree; the runner mounts main's committed copy (T090 round 2)
    (repo / ".gitleaks.toml").write_text("[extend]\nuseDefault = true\n")
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "main")
    git(repo, "checkout", "-q", "-b", "feat/night")
    (repo / "deploy" / "agents-engine" / "egress-proxy.py").write_text(
        "# the branch's egress proxy\n"
    )
    # The branch's own .claude/settings.json differs from main's: the install must build from main's (S7).
    settings = json.loads((repo / ".claude/settings.json").read_text())
    settings["sandbox"]["network"]["allowedDomains"].append(
        "branch-only.example.invalid"
    )
    (repo / ".claude/settings.json").write_text(json.dumps(settings, indent=2) + "\n")
    git(repo, "commit", "-q", "-am", "the reviewed commit")
    (base / "main-settings.json").write_text(
        git(repo, "show", "refs/heads/main:.claude/settings.json") + "\n"
    )
    for rel in (".specify/memory/constitution.md", ".github/workflows/ci.yml"):
        (repo / rel).parent.mkdir(parents=True, exist_ok=True)
        (repo / rel).write_text(f"stand-in {rel}\n")
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "more masked paths")
    return {"base": base}


class Case:
    def __init__(self, tmp: Path, template: dict, scenario: dict | None = None) -> None:
        self.tmp = Path(os.path.realpath(tmp))
        self.repo = self.tmp / "repo"
        shutil.copytree(template["base"] / "repo", self.repo, symlinks=True)
        self.studio = self.tmp / "studio"
        self.main_settings = template["base"] / "main-settings.json"
        self.sha = self.commit_here()
        self.home = self.tmp / "home"
        self.bin = self.tmp / "bin"
        self.state = self.tmp / "stub-state.json"
        self.log = self.tmp / "stub-log.jsonl"
        self.scenario = scenario or {}
        self.token_value = "sk-ant-oat01-" + secrets.token_urlsafe(24)
        self.aws_secret = secrets.token_hex(20)
        self.secret_out = "planted-" + secrets.token_hex(12)
        for d in (
            self.studio / "workflows",
            self.studio / "outputs",
            self.studio / "photos",
            self.studio / "key",
            self.bin,
            self.tmp / "t",
        ):
            d.mkdir(parents=True)
        cfg = self.home / ".config" / "h4reet-ai" / "night-shift"
        cfg.mkdir(parents=True)
        self.token = cfg / "claude.env"
        self.token.write_text(f"CLAUDE_CODE_OAUTH_TOKEN={self.token_value}\n")
        self.token.chmod(0o600)
        self.facts = cfg / "facts.env"
        for d in (
            "blender",
            "ComfyUI",
            "flux-env",
            ".config/h4reet/agents-engine/docker",
            ".aws",
            ".ssh",
            ".config/gh",
            ".docker",
            ".claude",
            ".local/state/h4reet",
            ".local/share/h4reet/terraform-providers",
        ):
            (self.home / d).mkdir(parents=True, exist_ok=True)
        for f in (".git-credentials", ".claude.json"):
            (self.home / f).write_text("stand-in\n")
        (self.home / ".aws" / "credentials").write_text(
            f"[default]\naws_secret_access_key = {self.aws_secret}\n"
        )
        self.write_facts()
        self.write_stubs()

    def commit_here(self) -> str:
        """The reviewed commit, with /srv/studio moved into this case's folder (fragments, specs, rows), and a
        working tree that differs from it, so nothing may come from the working tree."""
        ns = self.repo / "deploy" / "night-shift"
        for f in (
            ns / "containers" / "fragments.json",
            self.repo / "redteam/night-shift/rows.json",
        ):
            f.write_text(f.read_text().replace("/srv/studio", str(self.studio)))
        subprocess.run(
            [
                PY,
                "-I",
                "-B",
                str(ns / "containers" / "build.py"),
                "--settings",
                str(self.main_settings),
            ],
            check=True,
            capture_output=True,
        )
        git(self.repo, "commit", "-q", "-am", "the studio, here")
        (ns / "runner" / "prompts" / "implementer.md").write_text(
            "FROM THE WORKING TREE\n"
        )
        return git(self.repo, "rev-parse", "HEAD")

    def write_facts(self, drop: str | None = None, **extra: str) -> None:
        facts = {
            "REPO": str(self.repo),
            "NIGHT_ROOT": str(self.home / "h4reet-ai" / "night"),
            "UID": str(os.getuid()),
            "GID": str(os.getgid()),
            "CLAUDE_VERSION": "2.1.322",
            "BLENDER_DIR": str(self.home / "blender"),
            "COMFYUI_DIR": str(self.home / "ComfyUI"),
            "COMFYUI_VENV": str(self.home / "flux-env"),
            "COMFYUI_PORT": "8188",
            "ENGINE_CERTS": str(self.home / ".config/h4reet/agents-engine/docker"),
            "NIGHT_PLAN": "off",
            "NIGHT_GATE": "off",
            **extra,
        }
        facts.pop(drop, None)
        self.facts.write_text(
            "# the machine's facts\n" + "".join(f"{k}={v}\n" for k, v in facts.items())
        )

    def write_stubs(self) -> None:
        shutil.copy2(STUB_DOCKER, self.bin / "docker")
        (self.bin / "git").write_text(
            "#!/usr/bin/python3 -I\n"
            "import json, os, sys\n"
            f"with open({str(self.tmp / 'git-log.jsonl')!r}, 'a') as f:\n"
            "    keep = {k: v for k, v in os.environ.items() if k.startswith('GIT_')}\n"
            "    f.write(json.dumps({'argv': sys.argv[1:], 'env': keep, 'cwd': os.getcwd()}) + '\\n')\n"
            f"os.execv({GIT!r}, ['git', *sys.argv[1:]])\n"
        )
        (self.bin / "claude").write_text(
            f"#!/bin/sh\necho called >> {self.tmp / 'claude-called'}\nexit 1\n"
        )
        for f in ("docker", "git", "claude"):
            (self.bin / f).chmod(0o755)

    def run(
        self, *args: str, extra: dict | None = None
    ) -> subprocess.CompletedProcess[str]:
        env = {
            "HOME": str(self.home),
            "PATH": f"{self.bin}:/usr/bin:/bin",
            "TMPDIR": str(self.tmp / "t"),
            "LC_ALL": "C",
            "H4_NIGHT_STUDIO": str(self.studio),
            "STUB_STATE": str(self.state),
            "STUB_LOG": str(self.log),
            "STUB_SCENARIO": json.dumps(self.scenario),
            "STUB_SECRET": self.secret_out,
            "H4_NIGHT_TEST_RESOURCES": "100,32,62",
            **(extra or {}),
        }
        sha = args[0] if args and not args[0].startswith("--") else self.sha
        rest = args[1:] if args and not args[0].startswith("--") else args
        r = subprocess.run(
            ["bash", str(INSTALL), sha, *rest],
            env=env,
            cwd=self.repo,
            capture_output=True,
            text=True,
            check=False,
            timeout=600,
        )
        self.output = r.stdout + r.stderr
        return r

    # what the stubs saw
    def docker_calls(self) -> list[dict]:
        if not self.log.exists():
            return []
        return [json.loads(x) for x in self.log.read_text().splitlines()]

    def git_calls(self) -> list[dict]:
        p = self.tmp / "git-log.jsonl"
        return [json.loads(x) for x in p.read_text().splitlines()] if p.exists() else []

    def stub_state(self) -> dict:
        return json.loads(self.state.read_text()) if self.state.exists() else {}

    @property
    def config(self) -> Path:
        return self.home / ".config" / "h4reet-ai" / "night-shift"

    @property
    def share(self) -> Path:
        return self.home / ".local" / "share" / "h4reet-ai" / "night-shift"

    def cleanup(self) -> None:
        for dirpath, dirnames, _files in os.walk(self.tmp):
            for d in dirnames:
                p = os.path.join(dirpath, d)
                if not os.path.islink(p):
                    os.chmod(p, 0o755)


def snapshot(root: Path) -> dict[str, tuple]:
    out: dict[str, tuple] = {}
    for dirpath, dirnames, filenames in os.walk(root):
        for n in dirnames + filenames:
            p = os.path.join(dirpath, n)
            st = os.lstat(p)
            rel = os.path.relpath(p, root)
            if stat.S_ISDIR(st.st_mode):
                out[rel] = ("dir", stat.S_IMODE(st.st_mode))
            elif stat.S_ISLNK(st.st_mode):
                out[rel] = ("link", os.readlink(p))
            else:
                out[rel] = (
                    "file",
                    stat.S_IMODE(st.st_mode),
                    hashlib.sha256(Path(p).read_bytes()).hexdigest(),
                )
    return out


def summary(text: str) -> list[str]:
    m = re.search(r"== night-shift summary ==\n(.*?)\n== end ==", text, re.DOTALL)
    assert m, text[-3000:]
    return m.group(1).splitlines()


def assert_no_secret(case: Case, text: str) -> None:
    assert case.token_value not in text
    assert case.aws_secret not in text
    assert case.secret_out not in text


@pytest.fixture
def make_case(tmp_path, template):
    made = []

    def make(scenario: dict | None = None) -> Case:
        c = Case(tmp_path / f"c{len(made)}", template, scenario)
        made.append(c)
        return c

    yield make
    for c in made:
        c.cleanup()


# ---- one install, a second run, and its undo (module scope: they're the slow ones) ----------------------------------
@pytest.fixture(scope="module")
def full(tmp_path_factory, template):
    c = Case(tmp_path_factory.mktemp("full"), template)
    before = snapshot(c.home)
    first = c.run()
    calls_first = len(c.docker_calls())
    first_tree = snapshot(c.home)
    runner_view = read_as_the_runner(c)
    r3_log = (
        c.home / ".local/state/h4reet-ai/night-shift/rehearsal/r3-make-check.log"
    ).read_text()
    second = c.run()
    second_calls = c.docker_calls()[calls_first:]
    undo = c.run("--undo")
    after = snapshot(c.home)
    yield {
        "case": c,
        "before": before,
        "first": first,
        "first_out": first.stdout + first.stderr,
        "first_tree": first_tree,
        "second": second,
        "second_out": second.stdout + second.stderr,
        "second_calls": second_calls,
        "undo": undo,
        "undo_out": undo.stdout + undo.stderr,
        "after": after,
        "calls": c.docker_calls(),
        "runner_view": runner_view,
        "r3_log": r3_log,
    }
    c.cleanup()


def read_as_the_runner(c: Case) -> dict:
    """installed.txt, the stub's images and networks, and the runner's own load of each live spec, right after the
    first install (the undo removes them)."""
    night = load_night()
    view = {
        "text": (c.share / "installed.txt").read_text(),
        "got": night.read_installed(str(c.share / "installed.txt")),
        "stub": c.stub_state(),
        "specs": {},
        "hashes": {
            role: hashlib.sha256(
                (c.config / "containers" / f"{role}.json").read_bytes()
            ).hexdigest()
            for role in ROLES
        },
    }
    runner = night.Runner(
        night.Paths.from_home(str(c.home)),
        night.read_facts(str(c.facts)),
        night.Effects(),
        "x",
    )
    for role in ROLES:
        try:
            runner.load_live_spec(role)
            view["specs"][role] = "ok"
        except night.Refused as e:
            view["specs"][role] = str(e)
    return view


def test_the_install_succeeds_and_rehearses(full) -> None:
    out = full["first_out"]
    assert full["first"].returncode == 0, out[-4000:]
    assert "install: done" in out
    lines = summary(out)
    for r in ("R1", "R2", "R3", "R4"):
        assert any(line.startswith(f"{r} ok") for line in lines), (r, lines)
    assert any(
        re.fullmatch(r"row \S+ refused-by=(mount|ro-mount|network|proxy|runner)", x)
        for x in lines
    )
    assert any(x.startswith("row gap-token-env gap open, bounded") for x in lines)


def test_the_summary_names_the_sha_the_images_and_every_spec(full) -> None:
    c, lines = full["case"], summary(full["first_out"])
    assert f"sha {c.sha}" in lines
    assert "claude 2.1.322" in lines and "docker 28.3.3" in lines
    for name in IMAGES:
        assert any(
            re.fullmatch(rf"image {name} sha256:[0-9a-f]{{64}}", x) for x in lines
        ), name
    for role in ROLES:
        spec = c.config / "containers" / f"{role}.json"
        want = hashlib.sha256(spec.read_bytes()).hexdigest() if spec.exists() else None
        assert want is None or f"spec {role} {want}" in lines


def test_no_planted_secret_reaches_the_output(full) -> None:
    c = full["case"]
    for key in ("first_out", "second_out", "undo_out"):
        assert_no_secret(c, full[key])
    for call in full["calls"]:
        assert c.token_value not in json.dumps(call["argv"])


def test_the_token_reaches_containers_only_by_env_file(full) -> None:
    c = full["case"]
    runs = [
        x["argv"]
        for x in full["calls"]
        if x["argv"][1:2] == ["run"] and "-d" not in x["argv"]
    ]
    assert runs
    for argv in runs:
        assert ["--env-file", str(c.token)] == argv[
            argv.index("--env-file") : argv.index("--env-file") + 2
        ]
        assert not any(a.startswith("CLAUDE_CODE_OAUTH_TOKEN") for a in argv)
        assert "--bare" not in argv


def test_the_claude_stub_is_never_called_on_the_host(full) -> None:
    assert not (full["case"].tmp / "claude-called").exists()


def test_files_are_0444_and_folders_0555(full) -> None:
    tree = full["first_tree"]
    files = [
        k
        for k, v in tree.items()
        if v[0] == "file"
        and k.startswith(
            (
                ".config/h4reet-ai/night-shift/containers",
                ".local/share/h4reet-ai/night-shift",
            )
        )
    ]
    assert files
    for k in files:
        if "/claude/" in k and k.startswith(".local/share"):
            continue  # a role's Claude folder is the session's own
        assert tree[k][1] == 0o444, k
    for d in (
        ".config/h4reet-ai/night-shift/containers",
        ".config/h4reet-ai/night-shift/claude",
        ".local/share/h4reet-ai/night-shift",
        ".local/share/h4reet-ai/night-shift/prompts",
        ".local/share/h4reet-ai/night-shift/claude",
    ):
        assert tree[d] == ("dir", 0o555), d
    # the runner writes main's committed .gitleaks.toml here for tasks to mount; the install makes it (T090 round 2)
    assert tree[".local/share/h4reet-ai/night-shift/gate"] == ("dir", 0o700)
    for role in ("supervisor", "implementer", "studio"):
        assert tree[f".local/share/h4reet-ai/night-shift/claude/{role}"] == (
            "dir",
            0o700,
        )
    for f in (
        "allowlist.json",
        "allowlist-studio.json",
        "allowlist-plan.json",
        "comfyui-params.json",
    ):
        assert tree[f".config/h4reet-ai/night-shift/{f}"][1] == 0o444
    assert (
        tree[".config/h4reet-ai/night-shift/claude.env"][1] == 0o600
    )  # his, untouched


def test_the_specs_are_filled_and_lose_the_example_marker(full, template) -> None:
    c = full["case"]
    # the first tree's specs: read them from the snapshot's hashes against a fresh fill
    tree = full["first_tree"]
    for role in ROLES:
        assert f".config/h4reet-ai/night-shift/containers/{role}.json" in tree, role
    fill = c.tmp / "fill-check"
    subprocess.run(
        [
            PY,
            "-I",
            "-B",
            str(c.repo / "deploy/night-shift/containers/build.py"),
            "--settings",
            str(c.main_settings),
            "--fill",
            str(fill),
            "--facts",
            str(c.facts),
            "--home",
            str(c.home),
            "--tag",
            c.sha[:12],
        ],
        check=True,
        capture_output=True,
    )
    for role in ROLES:
        text = (fill / "containers" / f"{role}.json").read_text()
        assert "{{" not in text and "x-h4" not in text
        spec = json.loads(text)
        assert spec["user"] == f"{os.getuid()}:{os.getgid()}"
        assert spec["image"].endswith(":" + c.sha[:12])
        assert (
            tree[f".config/h4reet-ai/night-shift/containers/{role}.json"][2]
            == hashlib.sha256(text.encode()).hexdigest()
        )


def test_installed_txt_is_what_the_runner_reads(full) -> None:
    c, view = full["case"], full["runner_view"]
    got, st = view["got"], view["stub"]
    assert (
        full["first_tree"][".local/share/h4reet-ai/night-shift/installed.txt"][1]
        == 0o444
    )
    assert f"sha {c.sha}" in view["text"].splitlines()
    for role in ROLES:
        assert (
            got["file"][str(c.config / "containers" / f"{role}.json")]
            == view["hashes"][role]
        )
        if (
            role != "plan"
        ):  # it mounts ~/.config/h4reet-ai/infra, his, which the runner needs only with NIGHT_PLAN=on
            assert view["specs"][role] == "ok", (role, view["specs"][role])
    for f in (
        "night.py",
        "rehearse.py",
        "rows.json",
        "prompts/implementer.md",
        "prompts/studio.md",
    ):
        assert str(c.share / f) in got["file"]
    for f in (
        "allowlist.json",
        "allowlist-studio.json",
        "allowlist-plan.json",
        "comfyui-params.json",
        "claude/managed-settings.json",
    ):
        assert str(c.config / f) in got["file"]
    for name in IMAGES:
        ref = f"h4-night-{name}:{c.sha[:12]}"
        assert got["image"][ref] == st["images"][ref]
    for n in (*NETWORKS, "h4-night-out"):
        assert got["network"][n] == st["networks"][n]["id"]
        assert st["networks"][n]["internal"] is (n != "h4-night-out")
    lines = view["text"].splitlines()
    assert f"dir {c.studio}/briefs" in lines and f"dir {c.studio}/outputs" not in lines
    assert any(x.startswith("scratch ") and x.endswith("/rehearsal") for x in lines)


def load_night():
    spec = importlib.util.spec_from_file_location(
        "night_for_install", NIGHT / "runner" / "night.py"
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules["night_for_install"] = mod
    spec.loader.exec_module(mod)
    return mod


def test_it_reads_only_by_git_show_never_a_working_tree(full, template) -> None:
    c = full["case"]
    tree = full["first_tree"]
    committed = git(
        c.repo, "show", f"{c.sha}:deploy/night-shift/runner/prompts/implementer.md"
    )
    want = hashlib.sha256((committed + "\n").encode()).hexdigest()
    assert tree[".local/share/h4reet-ai/night-shift/prompts/implementer.md"][2] == want
    for call in c.git_calls():
        argv = call["argv"]
        assert "core.hooksPath=/dev/null" in argv, argv
        assert (
            call["env"].get("GIT_NO_REPLACE_OBJECTS") == "1"
            and call["env"].get("GIT_CONFIG_NOSYSTEM") == "1"
        ), argv
        sub = next(
            a
            for a in argv
            if not a.startswith("-")
            and a not in ("core.hooksPath=/dev/null", "core.fsmonitor=false")
        )
        assert sub in (
            "show",
            "rev-parse",
            "ls-tree",
            "cat-file",
            "worktree",
            "branch",
            "symbolic-ref",
            "status",
        ), argv
        assert "--work-tree" not in " ".join(argv) and sub not in (
            "checkout",
            "archive",
            "stash",
        )
    # every build context is a fresh folder in the temp dir, never the repository
    builds = [x for x in full["calls"] if x["argv"][1:2] == ["build"]]
    assert {b["argv"][b["argv"].index("-t") + 1].split(":")[0] for b in builds} == {
        f"h4-night-{n}" for n in IMAGES
    }
    for b in builds:
        assert b["ctx"].startswith(str(c.tmp / "t")), b["ctx"]


def test_the_egress_image_takes_mains_proxy_and_bases_come_by_digest(full) -> None:
    c = full["case"]
    builds = {
        x["argv"][x["argv"].index("-t") + 1].split(":")[0]: x
        for x in full["calls"]
        if x["argv"][1:2] == ["build"]
    }
    main_proxy = hashlib.sha256(b"# main's egress proxy\n").hexdigest()
    assert (
        builds["h4-night-egress"]["files"]["deploy/agents-engine/egress-proxy.py"]
        == main_proxy
    )
    worker = builds["h4-night-worker"]["argv"]
    assert "--pull=false" in worker
    args = [worker[i + 1] for i, a in enumerate(worker) if a == "--build-arg"]
    assert f"NIGHT_UID={os.getuid()}" in args and f"NIGHT_GID={os.getgid()}" in args
    assert f"TOOLCHAIN_IMAGE=h4-night-toolchain:{c.sha[:12]}" in args
    assert any(
        a.startswith(
            "DOCKER_CLI_IMAGE=docker.io/library/docker@" + digest("docker:28.3.3-cli")
        )
        for a in args
    )
    pulls = [x["argv"][-1] for x in full["calls"] if x["argv"][1:2] == ["pull"]]
    assert (
        sorted(pulls) == sorted(set(pulls))
        and all("@sha256:" in p for p in pulls)
        and len(pulls) == 4
    )
    toolchain = builds["h4-night-toolchain"]["argv"]
    assert toolchain[toolchain.index("-f") + 1].endswith(".devcontainer/Dockerfile")
    assert "WITH_CLAUDE=1" in [
        toolchain[i + 1] for i, a in enumerate(toolchain) if a == "--build-arg"
    ]


def test_the_r_steps_run_in_order(full) -> None:
    runs = [
        x["argv"]
        for x in full["calls"]
        if x["argv"][1:2] == ["run"] and "-d" not in x["argv"]
    ]
    order = []
    for argv in runs:
        text = " ".join(argv)
        kind = (
            "R2"
            if "ANTHROPIC_API_KEY=" in text or "ANTHROPIC_AUTH_TOKEN=" in text
            else "R1"
            if "claude -p" in text
            else "R3"
            if "make check" in text
            else "R4"
        )
        if not order or order[-1] != kind:
            order.append(kind)
    assert order == ["R1", "R2", "R3", "R4"], order
    out = full["first_out"]
    assert (
        out.index("step 4 R1: ok")
        < out.index("step 5 R2: ok")
        < out.index("step 6 R3: ok")
        < out.index("step 7 R4: ok")
    )


def test_r2_proves_both_stand_ins_by_the_runner_and_the_managed_settings(full) -> None:
    line = next(x for x in summary(full["first_out"]) if x.startswith("R2 ok"))
    for var in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"):
        assert var in line
    assert "the runner refuses the line" in line and "no API call" in line
    stand_ins = [
        x["argv"]
        for x in full["calls"]
        if "-e" in x["argv"]
        and any(a.endswith("=probe-not-a-credential") for a in x["argv"])
    ]
    assert len(stand_ins) == 2


def test_r3_names_its_known_environmental_items(full) -> None:
    line = next(x for x in summary(full["first_out"]) if x.startswith("R3 ok"))
    assert "toolchain-check" in line and "stage-S" in line


def test_a_second_run_at_the_same_sha_prints_unchanged(full) -> None:
    out = full["second_out"]
    assert full["second"].returncode == 0, out[-3000:]
    for step in ("1 images", "2 files", "3 networks", "4 R1", "5 R2", "6 R3", "7 R4"):
        assert f"step {step}: unchanged" in out, step
    assert summary(out) == summary(full["first_out"])
    assert not [
        x
        for x in full["second_calls"]
        if x["argv"][1:2] in (["build"], ["pull"], ["run"])
    ]


def test_undo_leaves_the_home_as_it_was_but_the_token_and_facts(full) -> None:
    c = full["case"]
    assert full["undo"].returncode == 0, full["undo_out"][-3000:]
    assert full["after"] == full["before"]
    assert f"undo: left {c.token} (yours)" in full["undo_out"]
    assert f"undo: left {c.facts} (yours)" in full["undo_out"]
    st = c.stub_state()
    assert not st["images"] or not any(k.startswith("h4-night-") for k in st["images"])
    assert not any(n.startswith("h4-night") for n in st["networks"])
    assert not (c.studio / "briefs").exists() and not (c.studio / "handoff").exists()
    assert (c.studio / "outputs").is_dir()  # his, there before
    # the rehearsal's sessions mounted main's .gitleaks.toml from the runner's gate folder, and undo took both
    assert "(not empty)" not in full["undo_out"], full["undo_out"][-2000:]
    # the rehearsal's worktrees and branches are gone from the repository
    assert "rehearse" not in git(c.repo, "worktree", "list")
    assert "rehearse" not in git(c.repo, "branch", "--list", "night/*")


# ---- refusals that install nothing --------------------------------------------------------------------------------
def assert_refused(case: Case, r, step: str, why: str) -> None:
    assert r.returncode != 0, case.output[-3000:]
    assert re.search(rf"install: FAILED at {re.escape(step)}: .*{why}", case.output), (
        case.output[-3000:]
    )
    assert "== night-shift summary ==" in case.output
    assert_no_secret(case, case.output)


def assert_nothing_installed(case: Case, before: dict) -> None:
    assert snapshot(case.home) == before
    st = case.stub_state()
    assert not st.get("images") and not st.get("networks")


def test_a_sha_that_doesnt_resolve(make_case) -> None:
    c = make_case()
    before = snapshot(c.home)
    r = c.run("0" * 40)
    assert_refused(c, r, "0 preflight", "doesn't resolve")
    assert_nothing_installed(c, before)


def test_a_short_sha_is_refused(make_case) -> None:
    c = make_case()
    r = c.run(c.sha[:12])
    assert_refused(c, r, "0 preflight", "40-hex")


def test_a_facts_file_missing_a_key(make_case) -> None:
    c = make_case()
    c.write_facts(drop="ENGINE_CERTS")
    before = snapshot(c.home)
    r = c.run()
    assert_refused(c, r, "0 preflight", "ENGINE_CERTS is missing")
    assert_nothing_installed(c, before)


def test_facts_naming_another_uid(make_case) -> None:
    c = make_case()
    c.write_facts(UID=str(os.getuid() + 1))
    assert_refused(c, c.run(), "0 preflight", "UID and GID must be yours")


def test_a_token_file_of_the_wrong_mode(make_case) -> None:
    c = make_case()
    c.token.chmod(0o644)
    before = snapshot(c.home)
    assert_refused(c, c.run(), "0 preflight", "mode 600")
    assert_nothing_installed(c, before)


def test_a_token_file_of_the_wrong_shape(make_case) -> None:
    c = make_case()
    c.token.write_text(
        f"CLAUDE_CODE_OAUTH_TOKEN={c.token_value}\nANTHROPIC_API_KEY=x\n"
    )
    c.token.chmod(0o600)
    before = snapshot(c.home)
    assert_refused(c, c.run(), "0 preflight", "exactly one line")
    assert_nothing_installed(c, before)


def test_a_missing_token_file(make_case) -> None:
    c = make_case()
    c.token.unlink()
    assert_refused(c, c.run(), "0 preflight", "no token file")


def test_a_billing_variable_in_the_shell(make_case) -> None:
    c = make_case()
    assert_refused(
        c,
        c.run(extra={"ANTHROPIC_API_KEY": "probe-not-a-credential"}),
        "0 preflight",
        "ANTHROPIC_API_KEY is set",
    )
    assert "probe-not-a-credential" not in c.output


def test_a_running_night_is_refused(make_case) -> None:
    c = make_case({"running": "h4-night-supervisor"})
    assert_refused(c, c.run(), "0 preflight", "night containers are running")


def test_the_first_install_refuses_while_outputs_holds_a_file_printing_only_the_count(
    make_case,
) -> None:
    c = make_case()
    names = [
        "dog-" + secrets.token_hex(4) + ".glb",
        "cat-" + secrets.token_hex(4) + ".png",
    ]
    for n in names:
        (c.studio / "outputs" / n).write_text("x")
    before = snapshot(c.home)
    assert_refused(c, c.run(), "0 preflight", "holds 2 files")
    for n in names:
        assert n not in c.output
    assert_nothing_installed(c, before)


def test_a_null_digest_refuses_and_names_the_line_that_reads_it(make_case) -> None:
    c = make_case()
    pins_path = c.repo / "deploy/night-shift/images/pins.json"
    git(c.repo, "show", f"{c.sha}:deploy/night-shift/images/pins.json")
    pins = json.loads(
        git(c.repo, "show", f"{c.sha}:deploy/night-shift/images/pins.json")
    )
    pins["bases"]["python:3.12.15-slim-trixie"]["digest"] = None
    pins["bases"]["ubuntu:24.04"]["digest"] = None
    pins_path.write_text(json.dumps(pins, indent=2) + "\n")
    git(c.repo, "commit", "-q", "-am", "a null digest")
    sha = git(c.repo, "rev-parse", "HEAD")
    before = snapshot(c.home)
    r = c.run(sha)
    assert_refused(c, r, "1 images", "digest is null")
    assert (
        "docker image inspect --format '{{index .RepoDigests 0}}' public.ecr.aws/docker/library/python:3.12.15-slim-trixie"
        in c.output
    )
    assert (
        "docker image inspect --format '{{index .RepoDigests 0}}' public.ecr.aws/docker/library/ubuntu:24.04"
        in c.output
    )
    assert (
        "node:24.21.0-trixie-slim"
        not in c.output.split("FAILED")[0].split("pins.json has no digest")[-1]
    )
    assert not [x for x in c.docker_calls() if x["argv"][1:2] in (["pull"], ["build"])]
    assert_nothing_installed(c, before)


def lock_lines() -> set[tuple[str, str, str]]:
    out = set()
    for raw in (ROOT / "deploy" / "images.lock").read_text().splitlines():
        if raw.strip() and not raw.lstrip().startswith("#"):
            f = raw.split()
            out.add((f[1], f[2], f[3]))
    return out


def test_every_base_is_a_line_of_the_image_lock() -> None:
    # T090 round 2: make check's policy gate takes a Dockerfile FROM only from deploy/images.lock. Node, python, and
    # ubuntu are the lock's own base: lines; docker-cli's line carries the digest the Author read (T002).
    pins = json.loads((NIGHT / "images" / "pins.json").read_text())
    lock = lock_lines()
    for key, b in pins["bases"].items():
        assert re.fullmatch(r"sha256:[0-9a-f]{64}", b["digest"]), key
        assert (b["image"], b["tag"], b["digest"]) in lock, key


def test_each_from_defaults_to_its_pinned_base_but_the_toolchains() -> None:
    # The default is what the policy gate reads; the install still passes the same value as a build argument.
    # TOOLCHAIN_IMAGE is the devcontainer image the install builds first, so no registry pins it: P-12.
    pins = json.loads((NIGHT / "images" / "pins.json").read_text())
    for name, img in pins["images"].items():
        text = (ROOT / img["dockerfile"]).read_text()
        for arg, base in img["bases"].items():
            if base == "toolchain":
                assert re.search(rf"^ARG {arg}$", text, re.MULTILINE), (name, arg)
                continue
            b = pins["bases"][base]
            want = f"ARG {arg}={b['image']}:{b['tag']}@{b['digest']}"
            assert re.search(rf"^{re.escape(want)}$", text, re.MULTILINE), (name, want)


def test_the_policy_gate_refuses_only_the_toolchain_line_until_p12() -> None:
    # The policy's own Dockerfile check, which needs no docker (its whole run SKIPs where compose is missing)
    spec = importlib.util.spec_from_file_location(
        "compose_policy_for_install", ROOT / "tools" / "gates" / "compose_policy.py"
    )
    assert spec and spec.loader
    cp = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = cp
    spec.loader.exec_module(cp)
    lock = cp.parse_lock(ROOT / cp.LOCK_FILE)
    found = []
    for path in sorted((NIGHT / "images").glob("*.Dockerfile")):
        found += cp.check_dockerfile(path, path.relative_to(ROOT).as_posix(), lock)
    got = [(f.where, f.detail) for f in found]
    if getattr(cp, "LOCAL_BASES", None):  # P-12 applied
        assert got == [], got
    else:
        assert got == [
            (
                "deploy/night-shift/images/worker.Dockerfile:21",
                "${TOOLCHAIN_IMAGE}: a build argument without a default",
            )
        ], got


def test_a_base_whose_digest_differs_installs_nothing(make_case) -> None:
    c = make_case({"wrong_digest": "public.ecr.aws/docker/library/python"})
    before = snapshot(c.home)
    r = c.run()
    assert_refused(
        c, r, "1 images", "python:3.12.15-slim-trixie's digest differs from its pin"
    )
    assert not [x for x in c.docker_calls() if x["argv"][1:2] == ["build"]]
    assert snapshot(c.home) == before
    assert not c.stub_state().get("networks")


def test_a_build_that_fails_stops_at_images(make_case) -> None:
    c = make_case({"build_fail": "studio"})
    assert_refused(c, c.run(), "1 images", "the studio image didn't build")


def test_a_leftover_placeholder_is_refused(make_case) -> None:
    c = make_case()
    ns = c.repo / "deploy" / "night-shift"
    frag_path = ns / "containers" / "fragments.json"
    frag = json.loads(
        git(c.repo, "show", f"{c.sha}:deploy/night-shift/containers/fragments.json")
    )
    frag["placeholders"].append("EXTRA")
    frag["env"]["session"]["NIGHT_EXTRA"] = "{{EXTRA}}"
    frag_path.write_text(json.dumps(frag, indent=2) + "\n")
    git(
        c.repo,
        "checkout",
        "-q",
        "--",
        "deploy/night-shift/runner/prompts/implementer.md",
    )
    subprocess.run(
        [
            PY,
            "-I",
            "-B",
            str(ns / "containers" / "build.py"),
            "--settings",
            str(c.main_settings),
        ],
        check=True,
        capture_output=True,
    )
    git(c.repo, "commit", "-q", "-am", "a placeholder the facts don't fill")
    sha = git(c.repo, "rev-parse", "HEAD")
    r = c.run(sha)
    assert_refused(c, r, "2 files", "a placeholder is left: \\{\\{EXTRA\\}\\}")
    assert not (c.config / "containers").exists() or not list(
        (c.config / "containers").iterdir()
    )


def test_specs_that_fragments_dont_make_are_refused(make_case) -> None:
    c = make_case()
    spec = c.repo / "deploy/night-shift/containers/reviewer.json"
    git(
        c.repo,
        "checkout",
        "-q",
        "--",
        "deploy/night-shift/runner/prompts/implementer.md",
    )
    spec.write_text(spec.read_text().replace('"4g"', '"8g"'))
    git(c.repo, "commit", "-q", "-am", "a hand-edited spec")
    r = c.run(git(c.repo, "rev-parse", "HEAD"))
    assert_refused(c, r, "2 files", "aren't what fragments.json makes")


# ---- the rehearsal stops at its first failure ---------------------------------------------------------------------
def rehearsal_kinds(c: Case) -> list[str]:
    out = []
    for x in c.docker_calls():
        argv = x["argv"]
        if argv[1:2] != ["run"] or "-d" in argv:
            continue
        text = " ".join(argv)
        out.append(
            "R2"
            if "=probe-not-a-credential" in text
            else "R1"
            if "claude -p" in text
            else "R3"
            if "make check" in text
            else "R4"
        )
    return out


def test_r1_failing_stops_before_r2(make_case) -> None:
    c = make_case({"fail": "R1"})
    r = c.run()
    assert_refused(c, r, "4 R1", "didn't answer ok")
    assert rehearsal_kinds(c) == ["R1"]
    assert any(x.startswith("R1 FAILED") for x in summary(c.output))


def test_r2_failing_names_the_egress_log(make_case) -> None:
    c = make_case({"fail": "R2"})
    r = c.run()
    assert_refused(c, r, "5 R2", "may have been used")
    assert "R3" not in rehearsal_kinds(c)


def test_r3_failing_stops_before_r4(make_case) -> None:
    c = make_case({"fail": "R3"})
    r = c.run()
    assert_refused(c, r, "6 R3", "make check failed: test")
    assert "R4" not in rehearsal_kinds(c)


def test_r4_failing_names_the_row_and_never_shows_what_it_read(make_case) -> None:
    c = make_case({"fail": "R4"})
    r = c.run()
    assert_refused(c, r, "7 R4", "rows weren't refused")
    assert re.search(
        r"row \S+ FAILED it was allowed \(\d+ bytes of output, not shown\)", c.output
    )
    assert c.secret_out not in c.output


def test_a_failed_rehearsal_runs_again_on_the_next_install(make_case) -> None:
    c = make_case({"fail": "R1"})
    c.run()
    c.scenario = {}
    r = c.run()
    assert r.returncode == 0, c.output[-3000:]
    assert "step 4 R1: ok" in c.output and "step 1 images: unchanged" in c.output


# ---- --undo ---------------------------------------------------------------------------------------------------------
def test_undo_with_nothing_installed(make_case) -> None:
    c = make_case()
    assert_refused(c, c.run("--undo"), "undo", "nothing to undo")


def test_undo_needs_the_installed_sha_and_keeps_a_file_that_changed(make_case) -> None:
    c = make_case()
    assert c.run().returncode == 0, c.output[-3000:]
    assert_refused(c, c.run("1" * 40, "--undo"), "undo", "installed.txt is for")
    p = c.config / "allowlist.json"
    p.chmod(0o644)
    p.write_text("{}\n")
    r = c.run("--undo")
    assert r.returncode == 0, c.output[-3000:]
    assert f"undo: left {p} (changed since the install)" in c.output
    assert p.read_text() == "{}\n"


def test_the_script_is_shellcheck_clean() -> None:
    if shutil.which("shellcheck") is None:
        pytest.skip("shellcheck isn't installed")
    for script in (
        INSTALL,
        ROOT / "redteam/night-shift/run.sh",
        NIGHT / "container-probe.sh",
    ):
        r = subprocess.run(
            ["shellcheck", str(script)], capture_output=True, text=True, check=False
        )
        assert r.returncode == 0, r.stdout


# ---- G4's review ------------------------------------------------------------------------------------------------------
def test_b1_r1_fails_when_the_egress_log_records_nothing(make_case) -> None:
    c = make_case({"egress_silent": True})
    r = c.run()
    assert_refused(
        c, r, "4 R1", "egress log .*(isn.t there|added no api.anthropic.com line)"
    )
    assert "R2" not in rehearsal_kinds(c)


def test_b1_r2_proves_the_log_itself_before_reading_a_refusal_from_it(full) -> None:
    runs = [
        x["argv"]
        for x in full["calls"]
        if x["argv"][1:2] == ["run"] and "-d" not in x["argv"]
    ]
    kinds = []
    for argv in runs:
        text = " ".join(argv)
        if "make setup && make check" in argv:
            break
        kinds.append(
            "standin"
            if "=probe-not-a-credential" in text
            else "token"
            if "claude -p" in text
            else "?"
        )
    # R1's turn, then R2's own proof turn, then the two stand-ins
    assert kinds == ["token", "token", "standin", "standin"], kinds
    line = next(x for x in summary(full["first_out"]) if x.startswith("R2 ok"))
    assert "no API call in a proven log" in line


def test_low_disk_refuses_at_step_0_before_any_build(make_case) -> None:
    # 2026-11-12: the first install built five images, Blender's download among them, with no disk check of its own;
    # step 0 now runs the runner's own disk and memory check, so nothing builds short of disk
    c = make_case()
    r = c.run(extra={"H4_NIGHT_TEST_RESOURCES": "10,32,62"})
    assert_refused(c, r, "0 preflight", "/ has 10 GB free, under 15 GB")
    assert not c.stub_state().get("images")
    assert rehearsal_kinds(c) == []


def test_low_memory_refuses_at_step_0_too(make_case) -> None:
    c = make_case()
    r = c.run(extra={"H4_NIGHT_TEST_RESOURCES": "100,4,62"})
    assert_refused(c, r, "0 preflight", "free memory is 4 GB, under 8 GB")
    assert not c.stub_state().get("images")


def test_s1_the_studio_and_comfyui_specs_are_checked_before_r1(make_case) -> None:
    c = make_case()
    (c.studio / "workflows").rmdir()
    r = c.run()
    assert_refused(c, r, "4 R1", "spec studio: .*workflows doesn't exist")
    assert rehearsal_kinds(c) == []


def test_s1_r1_uses_the_installed_implementer_prompt(full) -> None:
    first = next(
        x["argv"]
        for x in full["calls"]
        if x["argv"][1:2] == ["run"] and "claude" in x["argv"] and "-d" not in x["argv"]
    )
    prompt = first[first.index("-p") + 1]
    assert (
        "## This task" in prompt
        and "## The rehearsal" in prompt
        and "reply with exactly the word ok" in prompt
    )


def test_s2_a_held_runner_lock_refuses(make_case) -> None:
    import fcntl

    c = make_case()
    state = c.home / ".local/state/h4reet-ai/night-shift"
    state.mkdir(parents=True)
    lock = state / "runner.lock"
    lock.write_text("")
    lock.chmod(0o444)
    fd = os.open(lock, os.O_RDONLY)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        assert_refused(c, c.run(), "0 preflight", "holds the runner's lock")
    finally:
        os.close(fd)


def test_s4_the_rehearsal_never_prunes_his_worktrees(full) -> None:
    for call in full["case"].git_calls():
        assert "prune" not in call["argv"], call["argv"]


def test_s5_s6_a_new_sha_diffs_what_it_replaces_and_undo_removes_both_shas_images(
    make_case,
) -> None:
    c = make_case()
    # a network of that name the install didn't make
    st = {"images": {}, "pulled": {}, "containers": {}, "seq": 0, "rows": 0}
    st["networks"] = {
        "h4-night-plan": {"internal": True, "id": "fffffff00000", "labels": []}
    }
    c.state.write_text(json.dumps(st))
    assert c.run().returncode == 0, c.output[-3000:]
    old = c.sha
    params = c.repo / "deploy/night-shift/comfyui-params.json"
    git(
        c.repo,
        "checkout",
        "-q",
        "--",
        "deploy/night-shift/runner/prompts/implementer.md",
    )
    data = json.loads(params.read_text())
    data["x-review"] = "a changed line"
    params.write_text(json.dumps(data, indent=2) + "\n")
    git(c.repo, "commit", "-q", "-am", "a changed ComfyUI allowlist")
    new = git(c.repo, "rev-parse", "HEAD")
    r = c.run(new)
    assert r.returncode == 0, c.output[-3000:]
    assert f"replacing {c.config}/comfyui-params.json (FR-005):" in c.output
    assert '+  "x-review": "a changed line"' in c.output
    lines = summary(c.output)
    for n in ("allowlist", "allowlist-studio", "allowlist-plan"):
        assert any(re.fullmatch(rf"allowlist {n} [0-9a-f]{{64}}", x) for x in lines), n
    images = c.stub_state()["images"]
    assert (
        f"h4-night-worker:{old[:12]}" in images
        and f"h4-night-worker:{new[:12]}" in images
    )
    r = c.run(new, "--undo")
    assert r.returncode == 0, c.output[-3000:]
    images = c.stub_state()["images"]
    assert not [k for k in images if k.startswith("h4-night-")], images
    assert "h4-night-plan" in c.stub_state()["networks"]
    assert "undo: left network h4-night-plan (the install didn't make it)" in c.output
    assert not [n for n in c.stub_state()["networks"] if n != "h4-night-plan"]


def test_s7_the_specs_follow_mains_settings_not_the_commits(full) -> None:
    c = full["case"]
    assert full["first"].returncode == 0
    reads = [x["argv"] for x in c.git_calls() if "cat-file" in x["argv"]]
    assert any(
        a[-1] == "refs/heads/main:.claude/settings.json" and "blob" in a for a in reads
    ), reads
    allow = json.loads(
        git(c.repo, "show", f"{c.sha}:deploy/night-shift/allowlist.json")
    )
    assert (
        "branch-only.example.invalid"
        not in allow["sandbox"]["network"]["allowedDomains"]
    )
    branch = git(c.repo, "show", f"{c.sha}:.claude/settings.json")
    assert "branch-only.example.invalid" in branch


def test_s8_a_make_check_killed_partway_fails_r3(make_case) -> None:
    c = make_case({"r3_killed": True})
    r = c.run()
    assert_refused(c, r, "6 R3", "make check didn't finish \\(exit 137\\)")
    assert "R4" not in rehearsal_kinds(c)


def test_r3s_kept_log_is_redacted(full) -> None:
    log = full["r3_log"]
    assert "-> FAIL toolchain-check" in log
    assert full["case"].secret_out not in log and "token=<redacted>" in log


def test_s9_a_moved_branch_tip_refuses_naming_both_shas(make_case) -> None:
    c = make_case()
    older = git(c.repo, "rev-parse", "HEAD~1")
    before = snapshot(c.home)
    r = c.run(older, "--branch", "feat/night")
    assert_refused(
        c,
        r,
        "0 preflight",
        f"the branch feat/night's tip has moved: it is {c.sha}, not the reviewed {older}",
    )
    assert_nothing_installed(c, before)


def test_s9_the_branch_at_the_sha_passes_its_check(make_case) -> None:
    c = make_case({"fail": "R1"})
    c.run(c.sha, "--branch", "feat/night")
    assert "step 0 preflight: ok" in c.output


def test_a_fact_path_with_a_space_is_refused(make_case) -> None:
    c = make_case()
    (c.home / "my blender").mkdir()
    c.write_facts(BLENDER_DIR=str(c.home / "my blender"))
    assert_refused(c, c.run(), "0 preflight", "BLENDER_DIR holds a space")


def test_never_mounted_targets_absent_on_the_host_still_run_and_count(
    make_case,
) -> None:
    c = make_case()
    (c.home / ".git-credentials").unlink()
    (c.home / ".config/gh").rmdir()
    shutil.rmtree(c.home / ".local/share/h4reet")
    r = c.run()
    assert r.returncode == 0, c.output[-3000:]
    lines = summary(c.output)
    for rid in (
        "read-git-credentials-plain",
        "read-gh-plain-studio",
        "read-provider-mirror-symlink",
    ):
        assert (
            f"row {rid} refused-by=mount (absent on the host and in the container)"
            in lines
        ), rid
    r4 = next(x for x in lines if x.startswith("R4 ok"))
    assert re.search(r"\b0 of \d+ skipped", r4), r4
    assert re.search(r"[1-9]\d* absent on the host", r4), r4
    assert not [x for x in lines if x.startswith("row ") and " skipped" in x]
