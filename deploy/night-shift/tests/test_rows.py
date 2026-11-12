"""The night shift's red-team rows (spec 017, plan.md §9; tasks.md T050, T051): redteam/night-shift/rows.json.

Every never-mounted path (contracts/containers.md §3, from the runner's own `never_mounted`) and every forbidden write
has a row in each spelling CLAUDE.md's list asks for (`git -C`/`-c`, `bash -c`, a subshell, quoting, a config or
API equivalent) plus a symlink and a hard link; every row names a role that exists; the sign-in rows, the gap row
and its bounds, the socket, the network, the requests while off, and the refused specs are all there. Also
rehearse.py's verdicts on a row and on make check's output (R3), and run.sh's refusals.

No conftest.py: modules load by path. Nothing here runs Docker.
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
NIGHT = HERE.parent
ROOT = NIGHT.parent.parent
ROWS = ROOT / "redteam" / "night-shift" / "rows.json"
RUN_SH = ROOT / "redteam" / "night-shift" / "run.sh"


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


night = load("night_for_rows", NIGHT / "runner" / "night.py")
rehearse = load("rehearse_for_rows", NIGHT / "rehearse.py")

READ_SPELLINGS = (
    "plain",
    "python",
    "git",
    "bash-c",
    "subshell",
    "quoted",
    "symlink",
    "hardlink",
)
WRITE_SPELLINGS = READ_SPELLINGS
TOPS = (
    "supervisor",
    "ops",
    "gate-runner",
    "studio",
)  # the lattice's tops under the ceiling (plan §2)
STUDIO_OWN = ("/srv/studio/outputs", "/srv/studio/workflows")
FORBIDDEN_WRITES = (
    "@GIT@/config",
    "@GIT@/hooks",
    "@GIT@/refs/heads/main",
    "@GIT@/refs/tags",
    "@GIT@/objects/info",
    "@ADMIN@/commondir",
    "@GIT@",
    "@GIT@/refs/heads/night",
    "@OTHER@",
)
MASKS = (
    ".claude",
    "CLAUDE.md",
    "REVIEW.md",
    ".specify/memory/constitution.md",
    "tools/gates",
    "deploy/agents-engine",
    ".github/workflows",
)


@pytest.fixture(scope="module")
def doc() -> dict:
    return json.loads(ROWS.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def rows(doc) -> list[dict]:
    return doc["rows"]


def never_mounted_targets() -> list[str]:
    out = [p.replace("@HOME@", "@HOME@") for p in night.never_mounted("@HOME@", "ops")]
    out += [
        "@REPO@",
        "@HOME@/.local/state/h4reet-ai",
        "@HOME@/.local/state/h4reet",
        "@HOME@/.local/share/h4reet/terraform-providers",
        "/srv/studio/workflows",
    ]
    return sorted(set(out))


def roles() -> set[str]:
    return {
        json.loads(p.read_text())["role"]
        for p in (NIGHT / "containers").glob("*.json")
        if p.name != "fragments.json"
    }


# ---- shape ---------------------------------------------------------------------------------------------------------
def test_rows_load_through_rehearse_py() -> None:
    assert len(rehearse.load_rows(str(ROWS))) > 100


def test_every_row_has_its_fields_and_names_a_role_that_exists(rows) -> None:
    known = roles()
    assert {"supervisor", "ops", "studio", "plan", "comfyui"} <= known
    for r in rows:
        for key in (
            "id",
            "role",
            "kind",
            "category",
            "command",
            "expect",
            "layer",
            "rehearsal",
        ):
            assert key in r, (r.get("id"), key)
        assert r["role"] in known, r["id"]
        assert r["layer"] in rehearse.LAYERS, r["id"]
        assert isinstance(r["rehearsal"], bool), r["id"]
        if r["kind"] == "runner":
            assert r["check"] in rehearse.RUNNER_CHECKS, r["id"]
        else:
            re.compile(r["expect"])


def test_row_ids_are_unique(rows) -> None:
    ids = [r["id"] for r in rows]
    assert len(ids) == len(set(ids))


def test_rows_use_only_known_placeholders(rows) -> None:
    for r in rows:
        for field in ("command", "host", "creates"):
            for name in re.findall(r"@([A-Z]+)@", r.get(field, "")):
                assert name in rehearse.ROW_PLACEHOLDERS, (r["id"], name)


def test_a_studio_row_never_names_a_worktree_it_lacks_as_a_place_to_plant(rows) -> None:
    for r in rows:
        if r["role"] == "studio" and r["category"] == "read":
            assert "@WT@" not in r["command"], r["id"]


# ---- reads ---------------------------------------------------------------------------------------------------------
def test_every_never_mounted_path_has_every_spelling_in_ops(rows) -> None:
    have = {
        (r["target"], r["spelling"])
        for r in rows
        if r["category"] == "read" and r["role"] == "ops"
    }
    for target in never_mounted_targets():
        for spelling in READ_SPELLINGS:
            assert (target, spelling) in have, (target, spelling)


def test_every_never_mounted_path_is_read_in_every_top_of_the_lattice(rows) -> None:
    have = {
        (r["target"], r["role"])
        for r in rows
        if r["category"] == "read" and r["spelling"] == "plain"
    }
    for target in never_mounted_targets():
        for role in TOPS:
            if role == "studio" and target in STUDIO_OWN:
                continue
            assert (target, role) in have, (target, role)


def test_read_rows_expect_the_path_to_be_absent_and_check_the_host_first(rows) -> None:
    for r in rows:
        if r["category"] != "read":
            continue
        assert r["expect"] == "No such file or directory", r["id"]
        assert r["layer"] == "mount", r["id"]
        assert r.get("host"), r[
            "id"
        ]  # a path absent on the host proves nothing; the rehearsal skips it


def test_the_spellings_are_the_ones_they_claim(rows) -> None:
    shapes = {
        "python": r"^python3 -c ",
        "git": r"^git -C ",
        "bash-c": r"^bash -c ",
        "subshell": r"^\( .* \)$",
        "quoted": r"\"[^\"]+\"'[^']+'",
        "symlink": r"ln -s -- ",
        "hardlink": r"(cp -al|ln) -- ",
    }
    for r in rows:
        want = shapes.get(r.get("spelling", ""))
        if (
            want
            and r["category"] in ("read", "write")
            and not r["id"].startswith(
                (
                    "write-git-config-git",
                    "write-main-ref-git",
                    "write-tag-main-git",
                    "write-other-branch-git",
                )
            )
        ):
            assert re.search(want, r["command"]), r["id"]


# ---- writes --------------------------------------------------------------------------------------------------------
def test_every_forbidden_write_has_every_spelling(rows) -> None:
    have = {
        (r["target"], r["spelling"])
        for r in rows
        if r["category"] == "write" and r["role"] == "ops"
    }
    for target in (*FORBIDDEN_WRITES, *(f"@WT@/{m}" for m in MASKS)):
        for spelling in WRITE_SPELLINGS:
            if (target, spelling) == ("@GIT@/config", "git"):
                # G4's review, S3: a git spelling that got through would write his real config; the plain append,
                # which writes nothing, proves the read-only mount.
                assert (target, spelling) not in have
                continue
            assert (target, spelling) in have, (target, spelling)


def test_the_masked_paths_are_main_settings_denied_writes() -> None:
    settings = json.loads(
        (ROOT / ".claude" / "settings.json").read_text(encoding="utf-8")
    )
    denied = {
        e[2:]
        for e in settings["sandbox"]["filesystem"]["denyWrite"]
        if e.startswith("./")
    }
    for m in MASKS:
        assert m in denied, m


def test_no_row_writes_his_real_config_or_hooks_without_a_restore(rows) -> None:
    """S3: no row runs a git config on the repository's own config, and every row that would make a file in his .git
    (a hook, a ref, alternates, a commondir) names it in `creates`, so the rehearsal removes it if it got through."""
    ids = {r["id"] for r in rows}
    assert "write-git-config-git" not in ids and "write-git-config-git-c" not in ids
    for r in rows:
        c = r["command"]
        if re.search(r"\bgit\b[^|;&]*\sconfig\s", c):
            assert "--file " in c, r["id"]
            f = c.split("--file ", 1)[1].split()[0]
            assert not f.startswith("@GIT@/config"), r["id"]
            if f.startswith("@GIT@"):
                assert r.get("creates") == f, r["id"]
        if "@GIT@/hooks" in c:
            assert r.get("creates", "").startswith("@GIT@/hooks/rt-@ID@"), r["id"]
        if "@GIT@/config" in c:
            # only `: >>` (open for append, write nothing), python's open(…, "a").close(), and links
            assert not re.search(r"\bgit\b", c), r["id"]
            assert not re.search(r"(?<!: )>>? ", c.replace(": >> ", ": >>_")), r["id"]
        makes = r.get("target") in (
            "@GIT@/hooks",
            "@GIT@/refs/tags",
            "@GIT@/objects/info",
            "@GIT@",
            "@GIT@/refs/heads/night",
        )
        if r["category"] == "write" and makes and r["spelling"] != "hardlink":
            assert r.get("creates"), r["id"]


def test_main_tags_and_branches_are_written_by_git_too(rows) -> None:
    by_id = {r["id"]: r["command"] for r in rows}
    assert "update-ref refs/heads/main" in by_id["write-main-ref-git"]
    assert by_id["write-tag-main-git"].endswith("tag main")
    assert " branch night/" in by_id["write-other-branch-git"]


def test_a_write_that_got_through_would_write_nothing_or_a_benign_line(rows) -> None:
    for r in rows:
        if r["category"] != "write":
            continue
        c = r["command"]
        assert not re.search(
            r"(?<!:) >>? ", c.replace(": >> ", "").replace(": > ", "")
        ), r["id"]
        assert "printf x" not in c and "echo" not in c, r["id"]
        # main moves only to itself, if ever
        if "update-ref refs/heads/main" in c:
            assert "rev-parse refs/heads/main" in c


def test_write_rows_into_a_folder_name_what_they_would_create(rows) -> None:
    for r in rows:
        if (
            r["category"] == "write"
            and r["spelling"] in ("plain", "python")
            and r["target"]
            in (
                "@GIT@/hooks",
                "@GIT@/refs/tags",
                "@GIT@/objects/info",
                "@GIT@",
            )
        ):
            assert r.get("creates"), r["id"]


def test_reading_roles_and_the_supervisor_cant_write_other_worktrees(rows) -> None:
    ids = {r["id"] for r in rows}
    assert {
        "write-other-worktree-plain-supervisor",
        "write-worktree-plain-reviewer",
        "write-worktree-plain-gate-runner",
    } <= ids


# ---- the socket, the network ------------------------------------------------------------------------------------
def test_the_docker_socket_by_python_socat_and_docker_h(rows) -> None:
    have = {(r["target"], r["spelling"]) for r in rows if r["category"] == "socket"}
    for sock in ("/var/run/docker.sock", "/run/docker.sock"):
        for spelling in ("python", "socat", "docker-h"):
            assert (sock, spelling) in have
    docker_h = [r["command"] for r in rows if r.get("spelling") == "docker-h"]
    assert all(c.startswith("docker -H unix://") for c in docker_h)


def test_the_network_rows(rows) -> None:
    net = {r["id"]: r for r in rows if r["category"] == "network"}
    assert net["network-direct-ops"]["layer"] == "network"
    assert net["network-off-list-ops"]["layer"] == "proxy"
    assert "403" in net["network-off-list-ops"]["expect"]
    assert "network-no-default-route-ops" in net
    engine = [r for r in net.values() if "engine-fwd" in r["command"]]
    assert engine and all(r["role"] not in night.ENGINE_ROLES for r in engine)
    assert any(r["rehearsal"] for r in engine)


# ---- signing in, the gap -----------------------------------------------------------------------------------------
def test_every_billing_variable_and_bare_are_refused_by_the_runner(rows) -> None:
    env = {r["var"] for r in rows if r.get("check") == "env"}
    assert set(night.BILLING_VARS) <= env
    assert "ANTHROPIC_BASE_URL" in env and any(v.startswith("AWS_") for v in env)
    bare = [r for r in rows if r.get("check") == "bare"]
    assert bare and bare[0]["layer"] == "runner"


def test_the_gap_row_records_the_token_with_its_bounds_and_never_prints_it(
    rows,
) -> None:
    gap = [r for r in rows if r["category"] == "gap"]
    assert len(gap) == 1
    r = gap[0]
    assert r["expect"] == "gap" and r["layer"] == "gap" and r["rehearsal"]
    assert "CLAUDE_CODE_OAUTH_TOKEN" in r["command"]
    assert r["command"].rstrip().endswith(">/dev/null")
    text = " ".join(r["bounds"])
    for word in ("revocable", "plan", "AWS", "allowlist"):
        assert word in text


def test_no_row_prints_the_token(rows) -> None:
    for r in rows:
        c = r["command"]
        assert (
            "$CLAUDE_CODE_OAUTH_TOKEN" not in c and "${CLAUDE_CODE_OAUTH_TOKEN" not in c
        )
        if "printenv" in c or "env" == c.split()[0]:
            assert c.rstrip().endswith(">/dev/null"), r["id"]


# ---- requests, specs -----------------------------------------------------------------------------------------------
def test_plan_and_gate_requests_while_off_and_refused_specs(rows) -> None:
    by_check = {r.get("check"): r for r in rows if r["kind"] == "runner"}
    assert by_check["plan-off"]["role"] == "ops"
    assert by_check["gate-off"]["role"] == "gate-runner"
    assert by_check["plan-off"]["expect"] == night.OFF_ANSWER
    assert "example marker" in by_check["example-spec"]["expect"]
    assert "placeholder" in by_check["placeholder-spec"]["expect"]


def test_every_category_has_a_rehearsal_row(rows) -> None:
    for cat in rehearse.CATEGORIES:
        assert any(r["category"] == cat and r["rehearsal"] for r in rows), cat


def test_the_rehearsal_runs_the_spellings_that_reach_another_path_or_program(
    rows,
) -> None:
    for r in rows:
        if (
            r["category"] == "write"
            and r["role"] == "ops"
            and r["spelling"] in ("plain", "git", "symlink", "hardlink")
        ):
            assert r["rehearsal"], r["id"]
        if (
            r["category"] == "read"
            and r["role"] == "ops"
            and r["spelling"] in ("plain", "symlink")
        ):
            assert r["rehearsal"], r["id"]


# ---- rehearse.py's verdicts --------------------------------------------------------------------------------------
ROW = {"id": "x", "expect": "Read-only file system", "layer": "ro-mount"}


def test_a_refusal_as_expected_names_its_layer() -> None:
    assert rehearse.judge_row(ROW, 1, "", "touch: Read-only file system") == (
        "refused",
        "ro-mount",
    )


def test_an_allowed_row_fails_and_never_shows_its_output() -> None:
    secret = "aws_secret_" + os.urandom(8).hex()
    verdict, text = rehearse.judge_row(ROW, 0, secret, "")
    assert verdict == "FAILED" and secret not in text and str(len(secret)) in text


def test_a_refusal_for_another_reason_fails() -> None:
    verdict, text = rehearse.judge_row(ROW, 1, "", "bash: python3: command not found")
    assert verdict == "FAILED" and "not as expected" in text


def test_a_timeout_fails() -> None:
    assert rehearse.judge_row(ROW, 124, "", "")[0] == "FAILED"


def test_the_gap_row_is_open_or_closed_never_a_failure() -> None:
    gap = {"id": "g", "expect": "gap", "layer": "gap", "bounds": ["revocable"]}
    assert rehearse.judge_row(gap, 0, "", "")[0] == "gap"
    assert "closed" in rehearse.judge_row(gap, 1, "", "")[1]


def test_substitute_refuses_an_unknown_or_unquotable_value() -> None:
    assert (
        rehearse.substitute("ls @HOME@/.aws", {"HOME": "/home/a"}) == "ls /home/a/.aws"
    )
    with pytest.raises(rehearse.Stop):
        rehearse.substitute("ls @WT@", {"HOME": "/home/a"})
    with pytest.raises(rehearse.Stop):
        rehearse.substitute("ls @HOME@", {"HOME": "/home/a b"})


SUMMARY_LINE = "make check: 1 PASS, 0 SKIP, 0 WARN, 0 PLANNED, 1 PENDING, 2 FAIL; failing: toolchain-check FAIL"
CHECK_OK = (
    """== lint
-> PASS lint
== toolchain-check
claude: 2.1.322, want 2.1.296
-> FAIL toolchain-check
== matrix
--- stage S: the sandbox (SANDBOX_RUNTIME=1, .git/hooks unwritable) ---
FAIL        stage-S-unwritable    ./CLAUDE.md has no mask: none
FAIL        stage-S-unreadable    ~/.aws: its contents are readable
-> FAIL matrix
== evals
-> PENDING evals
"""
    + SUMMARY_LINE
    + "\n"
)


def test_r3_allows_the_known_environmental_items_and_names_them() -> None:
    ok, detail = rehearse.judge_check(CHECK_OK, 2)
    assert ok, detail
    assert "toolchain-check" in detail and "P-8" in detail
    assert "2 stage-S rows" in detail and "P-5" in detail
    assert "evals PENDING" in detail


def test_r3_fails_on_any_other_failure() -> None:
    ok, detail = rehearse.judge_check(CHECK_OK + "== test\n-> FAIL test\n", 2)
    assert not ok and "test" in detail


def test_r3_fails_on_a_matrix_failure_outside_stage_s() -> None:
    text = CHECK_OK.replace(
        "-> FAIL matrix",
        "FAIL        bash-gate.sh          git push: expected block\n-> FAIL matrix",
    )
    ok, detail = rehearse.judge_check(text, 2)
    assert not ok and "matrix" in detail


def test_r3_fails_when_make_check_printed_no_gates() -> None:
    assert (
        rehearse.judge_check("make: *** No rule to make target 'check'.\n")[0] is False
    )


def test_r3_fails_when_make_check_was_killed_partway() -> None:
    ok, detail = rehearse.judge_check(CHECK_OK.replace(SUMMARY_LINE, ""), 137)
    assert not ok and "didn't finish (exit 137)" in detail
    ok, detail = rehearse.judge_check(CHECK_OK, 137)
    assert not ok


def test_r3_fails_without_the_summary_line_whatever_the_gates_said() -> None:
    ok, detail = rehearse.judge_check(CHECK_OK.replace(SUMMARY_LINE, ""), 2)
    assert not ok and "no summary line" in detail


def test_r3_fails_on_a_non_zero_exit_with_nothing_failing() -> None:
    text = "== lint\n-> PASS lint\nmake check: 1 PASS, 0 SKIP, 0 WARN, 0 PLANNED, 0 PENDING, 0 FAIL\n"
    assert rehearse.judge_check(text, 0)[0] is True
    assert rehearse.judge_check(text, 2)[0] is False


def test_r4_needs_most_of_its_rows_to_run() -> None:
    assert rehearse.enough_ran(90, 100) and not rehearse.enough_ran(89, 100)
    assert not rehearse.enough_ran(0, 0)


def test_the_engine_dependent_gate_is_named() -> None:
    assert "agents' engine" in rehearse.KNOWN_FAIL["image"]


# ---- run.sh --------------------------------------------------------------------------------------------------------
def run_sh(
    tmp_path: Path, *args: str, extra: dict | None = None
) -> subprocess.CompletedProcess[str]:
    home = tmp_path / "home"
    home.mkdir(exist_ok=True)
    env = {"HOME": str(home), "PATH": "/usr/bin:/bin", **(extra or {})}
    return subprocess.run(
        ["bash", str(RUN_SH), *args],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def test_run_sh_refuses_before_an_install(tmp_path: Path) -> None:
    r = run_sh(tmp_path)
    assert r.returncode == 2 and "install.sh first" in r.stderr


def test_run_sh_refuses_a_billing_variable(tmp_path: Path) -> None:
    r = run_sh(tmp_path, extra={"ANTHROPIC_API_KEY": "probe-not-a-credential"})
    assert (
        r.returncode == 2
        and "ANTHROPIC_API_KEY" in r.stderr
        and "probe-not" not in r.stderr
    )


def test_run_sh_refuses_an_installed_file_that_changed(tmp_path: Path) -> None:
    share = tmp_path / "home" / ".local" / "share" / "h4reet-ai" / "night-shift"
    share.mkdir(parents=True)
    for f in ("rehearse.py", "night.py", "rows.json"):
        (share / f).write_text("changed\n")
    (share / "installed.txt").write_text(
        "sha "
        + "a" * 40
        + "\n"
        + "".join(
            f"file {share}/{f} {'0' * 8}\n"
            for f in ("rehearse.py", "night.py", "rows.json")
        )
    )
    r = run_sh(tmp_path, "--all")
    assert r.returncode == 2 and "isn't the file installed.txt records" in r.stderr


def test_run_sh_takes_only_all(tmp_path: Path) -> None:
    assert run_sh(tmp_path, "--everything").returncode == 2
