"""Tests for deploy/night-shift/runner/night.py (spec 017, tasks.md T010 to T016; contracts/runner.md, queue.md).

The runner is the only process outside every container, and the only one that uses the host's Docker socket. These
tests run it against `FakeFx` (night_fixtures.py): a stub `docker`, `git`, `aws`, and gate, a fake clock, and fake
streams. Nothing here starts a container or touches a real repository.
"""

from __future__ import annotations

import importlib.util
import json
import os
import stat
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location(
    "night_fixtures", HERE / "night_fixtures.py"
)
assert _spec and _spec.loader
nf = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(nf)


@pytest.fixture
def night():
    return nf.load_night()


@pytest.fixture
def h(tmp_path):
    return nf.Home(tmp_path)


def started(fx) -> list[str]:
    return [key.split("#", 1)[0] for key, _ in fx.spawned]


def running_ids(runner) -> list[str]:
    return [t.id for t in runner.tasks.values() if t.state == "running"]


def ready_runner(night, h, *tasks, fx=None):
    runner, fx = nf.make_runner(night, h, fx)
    runner.start_supervisor()
    nf.write_queue(runner, nf.queue(*tasks))
    assert runner.load_queue() is True
    return runner, fx


# ================================================================================================================
# T010: the queue (contracts/queue.md)
# ================================================================================================================


class TestQueue:
    def validate(self, night, h, data):
        runner, _ = nf.make_runner(night, h)
        return runner.validate_queue(data)

    def test_a_valid_queue_passes(self, night, h):
        tasks = self.validate(
            night, h, nf.queue(nf.task("res-01"), nf.task("res-02", after=["res-01"]))
        )
        assert [t["id"] for t in tasks] == ["res-01", "res-02"]

    @pytest.mark.parametrize(
        ("mutate", "field"),
        [
            (lambda q: q.update(schema=2), "schema"),
            (lambda q: q["tasks"][0].update(id="AB"), "tasks[0].id"),
            (lambda q: q["tasks"][0].update(id="x" * 41), "tasks[0].id"),
            (lambda q: q["tasks"][0].update(id="has space"), "tasks[0].id"),
            (lambda q: q["tasks"][1].update(id="res-01"), "tasks[1].id"),
            (lambda q: q["tasks"][0].update(role="admin"), "tasks[0].role"),
            (lambda q: q["tasks"][0].update(role="supervisor"), "tasks[0].role"),
            (lambda q: q["tasks"][0].update(locks=["docker"]), "tasks[0].locks"),
            (lambda q: q["tasks"][1].update(after=["nope"]), "tasks[1].after"),
            (lambda q: q["tasks"][0].update(base="main"), "tasks[0].base"),
            (lambda q: q["tasks"][0].update(base="abc123"), "tasks[0].base"),
            (
                lambda q: q["tasks"][0].update(prompt="prompts/evil.md"),
                "tasks[0].prompt",
            ),
            (lambda q: q["tasks"][0].update(prompt="../../.bashrc"), "tasks[0].prompt"),
            (lambda q: q["tasks"][0].update(slug="Bad/Slug"), "tasks[0].slug"),
            (lambda q: q["tasks"][0].update(name="main"), "tasks[0].name"),
            (lambda q: q["tasks"][0].update(role="studio", locks=[]), "tasks[0].locks"),
        ],
    )
    def test_each_refusal_names_its_field(self, night, h, mutate, field):
        q = nf.queue(nf.task("res-01"), nf.task("res-02", after=["res-01"]))
        mutate(q)
        with pytest.raises(night.QueueRefused) as e:
            self.validate(night, h, q)
        assert str(e.value).startswith(field), str(e.value)
        assert "\n" not in str(e.value)

    def test_a_cycle_is_refused(self, night, h):
        q = nf.queue(
            nf.task("aaa", after=["ccc"]),
            nf.task("bbb", after=["aaa"]),
            nf.task("ccc", after=["bbb"]),
        )
        with pytest.raises(night.QueueRefused) as e:
            self.validate(night, h, q)
        assert "after" in str(e.value) and "cycle" in str(e.value)

    def test_a_base_that_doesnt_resolve_is_refused(self, night, h):
        runner, fx = nf.make_runner(night, h)
        fx.unresolvable.add("refs/heads/gone")
        with pytest.raises(night.QueueRefused) as e:
            runner.validate_queue(nf.queue(nf.task("res-01", base="refs/heads/gone")))
        assert str(e.value).startswith("tasks[0].base")

    def test_a_full_sha_base_passes(self, night, h):
        tasks = self.validate(night, h, nf.queue(nf.task("res-01", base=nf.sha40("x"))))
        assert tasks[0]["base"] == nf.sha40("x")

    def test_a_refused_file_keeps_the_last_good_one_and_writes_one_page_line(
        self, night, h
    ):
        runner, _fx = nf.make_runner(night, h)
        runner.start_supervisor()
        nf.write_queue(runner, nf.queue(nf.task("res-01")))
        assert runner.load_queue() is True
        nf.write_queue(runner, nf.queue(nf.task("res-01", role="admin")))
        assert runner.load_queue() is False
        assert list(runner.tasks) == ["res-01"]
        assert runner.tasks["res-01"].role == "implementer"
        lines = [
            ln for ln in nf.page_text(runner).splitlines() if "queue refused" in ln
        ]
        assert len(lines) == 1 and "tasks[0].role" in lines[0]

    def test_not_json_is_refused(self, night, h):
        runner, _fx = nf.make_runner(night, h)
        runner.start_supervisor()
        nf.write_queue(runner, "{not json")
        assert runner.load_queue() is False

    def test_a_symlinked_queue_is_not_followed(self, night, h, tmp_path):
        runner, _fx = nf.make_runner(night, h)
        runner.start_supervisor()
        outside = tmp_path / "outside.json"
        outside.write_text(json.dumps(nf.queue(nf.task("res-01"))))
        qp = Path(runner.queue_path())
        qp.parent.mkdir(parents=True, exist_ok=True)
        qp.symlink_to(outside)
        assert runner.load_queue() is False
        assert runner.tasks == {}
        assert runner.load_queue() is None  # the same refusal isn't written again
        lines = [
            ln for ln in nf.page_text(runner).splitlines() if "queue refused" in ln
        ]
        assert len(lines) == 1

    def test_the_queue_is_read_again_only_when_its_mtime_changes(self, night, h):
        runner, _fx = nf.make_runner(night, h)
        runner.start_supervisor()
        nf.write_queue(runner, nf.queue(nf.task("res-01")))
        assert runner.load_queue() is True
        assert runner.load_queue() is None  # unchanged: not read


# ================================================================================================================
# T011: scheduling
# ================================================================================================================


class TestScheduling:
    def test_at_most_ten_run_with_fifteen_ready(self, night, h):
        runner, fx = ready_runner(night, h, *(nf.task(f"t-{i:02d}") for i in range(15)))
        for _ in range(30):
            fx.t += 10
            runner.schedule()
        assert len(running_ids(runner)) == 10
        assert started(fx)[1:] == [
            f"t-{i:02d}" for i in range(10)
        ]  # file order, after the supervisor

    def test_starts_are_staggered_by_ten_seconds(self, night, h):
        runner, fx = ready_runner(night, h, nf.task("aaa"), nf.task("bbb"))
        fx.t += 10
        runner.schedule()
        runner.schedule()
        fx.t += 9
        runner.schedule()
        assert running_ids(runner) == ["aaa"]
        fx.t += 1
        runner.schedule()
        assert running_ids(runner) == ["aaa", "bbb"]

    def test_locks_serialise_two_gpu_tasks(self, night, h):
        runner, fx = ready_runner(
            night, h, nf.task("gpu-1", role="studio"), nf.task("gpu-2", role="studio")
        )
        for _ in range(5):
            fx.t += 10
            runner.schedule()
        assert running_ids(runner) == ["gpu-1"]
        runner.dispatch(("line", runner.tasks["gpu-1"].key, nf.result_event()))
        runner.dispatch(("exit", runner.tasks["gpu-1"].key, 0))
        fx.t += 10
        runner.schedule()
        assert running_ids(runner) == ["gpu-2"]
        assert runner.tasks["gpu-1"].state == "done"

    def test_a_lock_held_by_another_process_waits(self, night, h):
        runner, fx = ready_runner(night, h, nf.task("mat-1", locks=["matrix"]))
        (h.state / "locks").mkdir(parents=True, exist_ok=True)
        held = fx.lock(str(h.state / "locks" / "matrix"))
        assert held is not None
        fx.t += 10
        runner.schedule()
        assert running_ids(runner) == []
        fx.unlock(held)
        fx.t += 10
        runner.schedule()
        assert running_ids(runner) == ["mat-1"]

    def test_after_waits_for_done(self, night, h):
        runner, fx = ready_runner(
            night, h, nf.task("aaa"), nf.task("bbb", after=["aaa"])
        )
        for _ in range(3):
            fx.t += 10
            runner.schedule()
        assert running_ids(runner) == ["aaa"]
        runner.dispatch(("line", runner.tasks["aaa"].key, nf.result_event()))
        runner.dispatch(("exit", runner.tasks["aaa"].key, 0))
        fx.t += 10
        runner.schedule()
        assert running_ids(runner) == ["bbb"]

    def test_after_a_failed_task_never_starts(self, night, h):
        runner, fx = ready_runner(
            night, h, nf.task("aaa"), nf.task("bbb", after=["aaa"])
        )
        fx.t += 10
        runner.schedule()
        runner.dispatch(("exit", runner.tasks["aaa"].key, 1))
        for _ in range(3):
            fx.t += 10
            runner.schedule()
        assert runner.tasks["aaa"].state == "failed"
        assert runner.tasks["bbb"].state == "queued"

    def test_a_gpu_task_reruns_the_disk_and_memory_checks(self, night, h):
        runner, fx = ready_runner(night, h, nf.task("gpu-1", role="studio"))
        fx.disk["/mnt/c"] = 10 * 2**30
        fx.t += 10
        runner.schedule()
        runner.schedule()
        assert runner.tasks["gpu-1"].state == "queued"
        lines = [ln for ln in nf.page_text(runner).splitlines() if "gpu-1" in ln]
        assert len(lines) == 1 and "/mnt/c" in lines[0]
        fx.disk["/mnt/c"] = 100 * 2**30
        fx.mem = 2 * 2**30
        fx.t += 10
        runner.schedule()
        assert runner.tasks["gpu-1"].state == "queued"
        assert "memory" in nf.page_text(runner)
        fx.mem = 32 * 2**30
        fx.t += 10
        runner.schedule()
        assert runner.tasks["gpu-1"].state == "running"

    def test_every_task_reruns_them(self, night, h):
        # 2026-11-12: a night that starts above the floor mustn't run C: down to zero, so each task start checks
        runner, fx = ready_runner(night, h, nf.task("aaa"))
        fx.disk["/mnt/c"] = 10 * 2**30
        fx.t += 10
        runner.schedule()
        runner.schedule()
        assert running_ids(runner) == []
        lines = [ln for ln in nf.page_text(runner).splitlines() if "aaa" in ln]
        assert len(lines) == 1 and "/mnt/c has 10 GB free, under 15 GB" in lines[0]
        fx.disk["/mnt/c"] = 20 * 2**30
        fx.t += 10
        runner.schedule()
        assert running_ids(runner) == ["aaa"]

    def test_locks_are_released_at_the_end(self, night, h):
        runner, fx = ready_runner(night, h, nf.task("gpu-1", role="studio"))
        fx.t += 10
        runner.schedule()
        lock = str(h.state / "locks" / "gpu")
        assert fx.lock(lock) is None
        runner.dispatch(("exit", runner.tasks["gpu-1"].key, 0))
        probe = fx.lock(lock)
        assert probe is not None
        fx.unlock(probe)

    def test_the_lock_files_are_0444(self, night, h):
        runner, fx = ready_runner(night, h, nf.task("mat-1", locks=["matrix"]))
        fx.t += 10
        runner.schedule()
        assert stat.S_IMODE(os.stat(h.state / "locks" / "matrix").st_mode) == 0o444

    def test_worktrees_live_under_night_root_on_their_branch(self, night, h):
        runner, fx = ready_runner(night, h, nf.task("res-01", slug="resume-links"))
        fx.t += 10
        runner.schedule()
        adds = [c for c, _ in fx.git_calls() if "worktree" in c and "add" in c]
        assert any("night/res-01/resume-links" in c for c in adds)
        wt = runner.tasks["res-01"].worktree
        assert wt.startswith(str(h.night_root) + "/")

    def test_a_worker_end_wakes_the_supervisor(self, night, h):
        runner, fx = ready_runner(night, h, nf.task("aaa"))
        runner.dispatch(("exit", runner.sup.key, 0))
        assert runner.sup.state == "done"
        fx.t += 10
        runner.schedule()
        runner.dispatch(("exit", runner.tasks["aaa"].key, 0))
        assert runner.sup.state == "running"
        assert "aaa" in fx.spawned[-1][1][fx.spawned[-1][1].index("-p") + 1]

    def test_a_done_task_with_a_name_names_its_stack(self, night, h):
        runner, fx = ready_runner(
            night, h, nf.task("res-01", slug="links", name="feat/018-resume-links")
        )
        fx.t += 10
        runner.schedule()
        runner.dispatch(("line", runner.tasks["res-01"].key, nf.result_event()))
        runner.dispatch(("exit", runner.tasks["res-01"].key, 0))
        branch = [
            c
            for c, _ in fx.git_calls()
            if "branch" in c and "feat/018-resume-links" in c
        ]
        assert branch and branch[0][-1] == nf.sha40("refs/heads/night/res-01/links")
        assert "feat/018-resume-links" in nf.page_text(runner)

    def test_a_taken_name_is_left_alone(self, night, h):
        runner, fx = ready_runner(
            night, h, nf.task("res-01", name="feat/018-resume-links")
        )
        fx.existing_branches.add("feat/018-resume-links")
        fx.t += 10
        runner.schedule()
        runner.dispatch(("exit", runner.tasks["res-01"].key, 0))
        assert not [
            c
            for c, _ in fx.git_calls()
            if c[len(nf.GIT_PREFIX) + 1 : len(nf.GIT_PREFIX) + 2] == ["branch"]
        ]
        assert "taken" in nf.page_text(runner)


# ================================================================================================================
# T012: the usage limit
# ================================================================================================================


class TestUsageLimit:
    def test_the_matcher_reads_epoch_after_a_bar(self, night):
        assert night.parse_limit(
            "Claude AI usage limit reached|1800003600", now=1_800_000_000.0
        ) == (
            True,
            1_800_003_600.0,
        )

    def test_the_matcher_reads_iso_8601(self, night):
        # 1800000000 is 2027-01-15T08:00:00Z.
        ok, reset = night.parse_limit(
            "Usage limit reached. Resets at 2027-01-15T10:30:00Z", now=1_800_000_000.0
        )
        assert ok and reset == 1_800_000_000.0 + 9000
        ok, reset = night.parse_limit(
            "usage limit reached, resets 2027-01-15T11:00:00+01:00", now=1_800_000_000.0
        )
        assert ok and reset == 1_800_000_000.0 + 7200  # 11:00+01:00 is 10:00Z

    def test_the_matcher_reads_resets_at_with_a_zone(self, night):
        # 1800000000 is 2027-01-15T08:00:00Z. "resets 3pm (UTC)" is that day at 15:00Z.
        ok, reset = night.parse_limit(
            "You've hit your limit · resets 3pm (UTC)", now=1_800_000_000.0
        )
        assert ok and reset == 1_800_000_000.0 + 7 * 3600

    def test_the_matcher_rolls_a_past_clock_time_to_tomorrow(self, night):
        ok, reset = night.parse_limit(
            "5-hour limit reached · resets 7am (UTC)", now=1_800_000_000.0
        )
        assert ok and reset == 1_800_000_000.0 + 23 * 3600

    def test_a_limit_without_a_time(self, night):
        assert night.parse_limit("Claude usage limit reached.", now=1.0) == (True, None)

    @pytest.mark.parametrize(
        "text", ["all good", "the limit of the function", "rate of 3 per second"]
    )
    def test_ordinary_text_isnt_a_limit(self, night, text):
        assert night.parse_limit(text, now=1.0) is None

    def test_only_synthetic_or_error_result_events_count(self, night):
        now = 1_800_000_000.0
        text = "Claude AI usage limit reached|1800003600"
        assert night.limit_from_event(json.loads(nf.assistant_text(text)), now) == (
            True,
            1_800_003_600.0,
        )
        assert night.limit_from_event(
            json.loads(nf.result_event(text, is_error=True)), now
        ) == (True, 1_800_003_600.0)
        # A model's own words, a tool's output, or a successful result never stop the night.
        assert (
            night.limit_from_event(
                json.loads(nf.assistant_text(text, model="claude-opus")), now
            )
            is None
        )
        assert (
            night.limit_from_event(
                json.loads(nf.result_event(text, is_error=False)), now
            )
            is None
        )
        tool = {
            "type": "user",
            "message": {"content": [{"type": "tool_result", "content": text}]},
        }
        assert night.limit_from_event(tool, now) is None

    def test_a_limit_stops_all_sleeps_once_and_requeues(self, night, h):
        runner, fx = ready_runner(night, h, nf.task("aaa"), nf.task("bbb"))
        for _ in range(2):
            fx.t += 10
            runner.schedule()
        assert running_ids(runner) == ["aaa", "bbb"]
        old_keys = {t.id: t.key for t in runner.tasks.values()}
        t0 = fx.t
        reset = int(t0) + 3600
        runner.dispatch(
            (
                "line",
                runner.tasks["aaa"].key,
                nf.assistant_text(f"Claude AI usage limit reached|{reset}"),
            )
        )
        stops = fx.docker_calls("stop")
        assert stops, "docker stop wasn't called"
        stopped = {n for c in stops for n in c[4:]}
        assert {"h4-night-aaa", "h4-night-bbb", "h4-night-supervisor"} <= stopped
        assert all(c[2:4] == ["-t", "60"] for c in stops)
        assert fx.sleeps == [reset + 300 - t0]
        assert fx.pauses == []
        assert (
            runner.tasks["aaa"].state == "queued"
            and runner.tasks["bbb"].state == "queued"
        )
        assert runner.sup.state == "running"  # the supervisor restarts first
        # A stale exit from a stopped container changes nothing.
        runner.dispatch(("exit", old_keys["aaa"], 137))
        assert runner.tasks["aaa"].state == "queued"
        assert "usage limit" in nf.page_text(runner)

    def test_a_limit_without_a_time_stops_the_night(self, night, h):
        runner, fx = ready_runner(night, h, nf.task("aaa"))
        fx.t += 10
        runner.schedule()
        runner.dispatch(
            (
                "line",
                runner.tasks["aaa"].key,
                nf.assistant_text("Claude usage limit reached."),
            )
        )
        assert fx.sleeps == []
        assert runner.ended
        assert runner.tasks["aaa"].state == "stopped-limit"
        assert "no reset time" in nf.page_text(runner)

    @pytest.mark.parametrize("offset", [-50, 0, 8 * 86400 + 1, 30 * 86400])
    def test_a_reset_past_or_over_eight_days_ahead_stops_the_night(
        self, night, h, offset
    ):
        runner, fx = ready_runner(night, h, nf.task("aaa"))
        fx.t += 10
        runner.schedule()
        reset = int(fx.t) + offset
        runner.dispatch(
            (
                "line",
                runner.tasks["aaa"].key,
                nf.assistant_text(f"usage limit reached|{reset}"),
            )
        )
        assert fx.sleeps == []
        assert runner.ended
        assert "no usable reset time" in nf.page_text(runner)

    def test_a_reset_eight_days_ahead_is_waited_for(self, night, h):
        runner, fx = ready_runner(night, h, nf.task("aaa"))
        fx.t += 10
        runner.schedule()
        t0 = fx.t
        reset = int(t0) + 8 * 86400
        runner.dispatch(
            (
                "line",
                runner.tasks["aaa"].key,
                nf.assistant_text(f"usage limit reached|{reset}"),
            )
        )
        assert fx.sleeps == [reset + 300 - t0]

    def test_a_second_limit_soon_after_resuming_stops_the_night(self, night, h):
        runner, fx = ready_runner(night, h, nf.task("aaa"))
        fx.t += 10
        runner.schedule()
        reset = int(fx.t) + 3600
        runner.dispatch(
            (
                "line",
                runner.tasks["aaa"].key,
                nf.assistant_text(f"usage limit reached|{reset}"),
            )
        )
        assert len(fx.sleeps) == 1 and not runner.ended
        fx.t += 9 * 60
        again = int(fx.t) + 3600
        runner.dispatch(
            ("line", runner.sup.key, nf.assistant_text(f"usage limit reached|{again}"))
        )
        assert len(fx.sleeps) == 1
        assert runner.ended
        assert "within 10 minutes" in nf.page_text(runner)

    def test_a_second_limit_later_waits_again(self, night, h):
        runner, fx = ready_runner(night, h, nf.task("aaa"))
        fx.t += 10
        runner.schedule()
        reset = int(fx.t) + 3600
        runner.dispatch(
            (
                "line",
                runner.tasks["aaa"].key,
                nf.assistant_text(f"usage limit reached|{reset}"),
            )
        )
        fx.t += 11 * 60
        again = int(fx.t) + 3600
        runner.dispatch(
            ("line", runner.sup.key, nf.assistant_text(f"usage limit reached|{again}"))
        )
        assert len(fx.sleeps) == 2 and not runner.ended

    def test_three_fast_failures_stop_the_night(self, night, h):
        runner, fx = ready_runner(night, h, *(nf.task(f"f-{i}") for i in range(4)))
        for i in range(3):
            fx.t += 10
            runner.schedule()
            runner.dispatch(("exit", runner.tasks[f"f-{i}"].key, 1))
        assert runner.ended
        assert "fail" in nf.page_text(runner)


# ================================================================================================================
# T013: the idle stop
# ================================================================================================================


class TestIdle:
    def one(self, night, h):
        runner, fx = ready_runner(night, h, nf.task("aaa"))
        fx.t += 10
        runner.schedule()
        return runner, fx

    def test_silent_and_clean_is_stopped_and_recorded(self, night, h):
        runner, fx = self.one(night, h)
        fx.t += 15 * 60
        runner.check_idle()
        assert ["docker", "stop", "-t", "60", "h4-night-aaa"] in fx.docker_calls("stop")
        assert runner.tasks["aaa"].state == "stopped-idle"
        assert "stopped: waited with nothing to do" in nf.page_text(runner)

    def test_fourteen_minutes_isnt_idle(self, night, h):
        runner, fx = self.one(night, h)
        fx.t += 14 * 60
        runner.check_idle()
        assert runner.tasks["aaa"].state == "running"

    def test_an_event_resets_the_clock(self, night, h):
        runner, fx = self.one(night, h)
        fx.t += 10 * 60
        runner.dispatch(
            ("line", runner.tasks["aaa"].key, nf.event_line({"type": "system"}))
        )
        fx.t += 10 * 60
        runner.check_idle()
        assert runner.tasks["aaa"].state == "running"

    def test_a_dirty_worktree_isnt_stopped(self, night, h):
        runner, fx = self.one(night, h)
        fx.dirty[runner.tasks["aaa"].worktree] = " M README.md\n"
        fx.t += 16 * 60
        runner.check_idle()
        assert runner.tasks["aaa"].state == "running"

    def test_a_busy_process_list_isnt_stopped(self, night, h):
        runner, fx = self.one(night, h)
        fx.procs["h4-night-aaa"] = "claude\nmake\npython3\n"
        fx.t += 16 * 60
        runner.check_idle()
        assert runner.tasks["aaa"].state == "running"

    def test_the_status_check_uses_the_runners_own_git_dir(self, night, h):
        runner, fx = self.one(night, h)
        fx.t += 16 * 60
        runner.check_idle()
        status = [k for c, k in fx.git_calls() if "status" in c]
        assert status
        env = status[-1]["env"]
        assert env["GIT_DIR"] == str(h.repo / ".git" / "worktrees" / "aaa")
        assert env["GIT_COMMON_DIR"] == str(h.repo / ".git")
        assert env["GIT_WORK_TREE"] == runner.tasks["aaa"].worktree

    def test_ending_dirty_is_recorded_never_committed(self, night, h):
        runner, fx = self.one(night, h)
        fx.dirty[runner.tasks["aaa"].worktree] = "?? new.txt\n"
        runner.dispatch(("line", runner.tasks["aaa"].key, nf.result_event()))
        runner.dispatch(("exit", runner.tasks["aaa"].key, 0))
        assert "aaa" in nf.page_text(runner) and "uncommitted" in nf.page_text(runner)
        for c, _ in fx.git_calls():
            assert (
                "commit" not in c
                and "add" not in c[len(nf.GIT_PREFIX) :][:2]
                or "worktree" in c
            )


# ================================================================================================================
# T014: the preflight (contracts/runner.md §2)
# ================================================================================================================


def run_check(night, h, fx, capsys):
    rc = night.main(["check"], fx=fx, home=h.home)
    out = capsys.readouterr()
    return rc, out.out + out.err


class TestPreflight:
    def test_a_good_machine_passes(self, night, h, capsys):
        fx = nf.FakeFx(night, h)
        rc, out = run_check(night, h, fx, capsys)
        assert rc == 0, out
        assert out.strip() == "check: ok"

    def test_the_authors_c_drive_on_2026_11_12_passes(self, night, h, capsys):
        # the first install's R1 refused at 20 GB free on /mnt/c, under the old 30 GB floor
        fx = nf.FakeFx(night, h)
        fx.disk["/mnt/c"] = 20 * 2**30
        rc, out = run_check(night, h, fx, capsys)
        assert rc == 0, out

    def refused(self, night, h, capsys, fx=None):
        fx = fx or nf.FakeFx(night, h)
        rc, out = run_check(night, h, fx, capsys)
        assert rc == 1, out
        assert len(out.strip().splitlines()) == 1, out
        assert out.startswith("check: refused: ")
        assert nf.token_value() not in out
        return out

    def test_the_example_marker(self, night, h, capsys):
        spec = h.spec_for("implementer")
        spec["x-h4"] = {"example": True}
        h.write_spec("implementer", spec)
        assert "example" in self.refused(night, h, capsys)

    def test_a_spec_outside_the_live_folder(self, night, h, capsys, tmp_path):
        elsewhere = tmp_path / "elsewhere.json"
        elsewhere.write_text((h.live / "implementer.json").read_text())
        (h.live / "implementer.json").unlink()
        (h.live / "implementer.json").symlink_to(elsewhere)
        assert "outside" in self.refused(night, h, capsys)

    def test_a_missing_spec(self, night, h, capsys):
        (h.live / "reviewer.json").unlink()
        h.record_installed()
        assert "reviewer" in self.refused(night, h, capsys)

    def test_a_sha256_mismatch(self, night, h, capsys):
        spec = h.spec_for("implementer")
        spec["limits"]["memory"] = "8g"
        h.write_spec("implementer", spec, record=False)
        assert "SHA-256" in self.refused(night, h, capsys)

    def test_a_leftover_placeholder(self, night, h, capsys):
        spec = h.spec_for("implementer")
        spec["user"] = "{{UID}}:{{GID}}"
        h.write_spec("implementer", spec)
        assert "placeholder" in self.refused(night, h, capsys)

    def test_an_image_id_mismatch(self, night, h, capsys):
        fx = nf.FakeFx(night, h)
        fx.docker_images[f"h4-night-worker:{nf.SHA12}"] = "sha256:" + "0" * 8
        assert "image" in self.refused(night, h, capsys, fx)

    @pytest.mark.parametrize("mode", [0o644, 0o640, 0o400, 0o700])
    def test_a_token_file_not_0600(self, night, h, capsys, mode):
        h.write_token(f"CLAUDE_CODE_OAUTH_TOKEN={nf.token_value()}\n", mode)
        assert "0600" in self.refused(night, h, capsys)

    @pytest.mark.parametrize(
        "text",
        [
            "",
            "{v}\n",
            "ANTHROPIC_API_KEY={v}\n",
            "CLAUDE_CODE_OAUTH_TOKEN={v}\nCLAUDE_CODE_OAUTH_TOKEN={v}\n",
            "CLAUDE_CODE_OAUTH_TOKEN={v}\nANTHROPIC_API_KEY={v}\n",
            "CLAUDE_CODE_OAUTH_TOKEN=\n",
            "export CLAUDE_CODE_OAUTH_TOKEN={v}\n",
            "CLAUDE_CODE_OAUTH_TOKEN={v} extra\n",
        ],
    )
    def test_a_token_file_of_the_wrong_shape(self, night, h, capsys, text):
        h.write_token(text.format(v=nf.token_value()))
        out = self.refused(night, h, capsys)
        assert "token" in out

    def test_a_missing_token_file(self, night, h, capsys):
        h.token.unlink()
        assert "token" in self.refused(night, h, capsys)

    def test_a_symlinked_token_file(self, night, h, capsys, tmp_path):
        real = tmp_path / "real.env"
        real.write_text(h.token.read_text())
        os.chmod(real, 0o600)
        h.token.unlink()
        h.token.symlink_to(real)
        assert "token" in self.refused(night, h, capsys)

    @pytest.mark.parametrize("name", nf.BILLING_VARS)
    def test_an_api_billing_variable_in_the_runners_environment(
        self, night, h, capsys, name
    ):
        fx = nf.FakeFx(night, h)
        fx.environ[name] = nf.token_value()
        out = self.refused(night, h, capsys, fx)
        assert name in out

    @pytest.mark.parametrize(
        "name", ["h4-night", "h4-night-studio", "h4-night-plan", "h4-night-engine"]
    )
    def test_a_network_that_isnt_internal(self, night, h, capsys, name):
        fx = nf.FakeFx(night, h)
        fx.internal[name] = "false"
        assert name in self.refused(night, h, capsys, fx)

    def test_a_missing_network(self, night, h, capsys):
        fx = nf.FakeFx(night, h)
        del fx.internal["h4-night-plan"]
        assert "h4-night-plan" in self.refused(night, h, capsys, fx)

    @pytest.mark.parametrize(("where", "free"), [("/", 14), ("/mnt/c", 5)])
    def test_low_disk(self, night, h, capsys, where, free):
        fx = nf.FakeFx(night, h)
        fx.disk[where] = free * 2**30
        assert where in self.refused(night, h, capsys, fx)

    def test_low_memory(self, night, h, capsys):
        fx = nf.FakeFx(night, h)
        fx.mem = 7 * 2**30
        assert "memory" in self.refused(night, h, capsys, fx)

    def test_a_second_runner(self, night, h, capsys):
        fx = nf.FakeFx(night, h)
        h.state.mkdir(parents=True, exist_ok=True)
        held = fx.lock(str(h.state / "runner.lock"))
        assert held is not None
        try:
            assert "runner" in self.refused(night, h, capsys, fx)
        finally:
            fx.unlock(held)

    def test_check_releases_the_runner_lock(self, night, h, capsys):
        fx = nf.FakeFx(night, h)
        assert run_check(night, h, fx, capsys)[0] == 0
        probe = fx.lock(str(h.state / "runner.lock"))
        assert probe is not None
        fx.unlock(probe)

    def test_bad_facts_cant_run(self, night, h, capsys):
        h.set_fact("REPO", None)
        rc, out = run_check(night, h, nf.FakeFx(night, h), capsys)
        assert rc == 2 and "REPO" in out

    @pytest.mark.parametrize(
        ("key", "value"),
        [("NIGHT_PLAN", "maybe"), ("REPO", "relative/path"), ("UID", "{{UID}}")],
    )
    def test_invalid_facts_cant_run(self, night, h, capsys, key, value):
        h.set_fact(key, value)
        rc, out = run_check(night, h, nf.FakeFx(night, h), capsys)
        assert rc == 2 and key in out

    def test_facts_are_read_as_data(self, night, h):
        h.facts.write_text(h.facts.read_text() + "EXTRA=$(touch /tmp/pwned)\n")
        facts = night.read_facts(night.Paths.from_home(h.home).facts)
        assert facts["EXTRA"] == "$(touch /tmp/pwned)"


# ================================================================================================================
# T015: the docker run line (contracts/runner.md §3, contracts/containers.md)
# ================================================================================================================

NEVER = (
    ".aws",
    ".ssh",
    ".config/h4reet-ai",
    ".config/gh",
    ".git-credentials",
    ".docker",
    ".claude",
    ".claude.json",
)


def vols(argv) -> list[tuple[str, str, str]]:
    out = []
    for i, a in enumerate(argv):
        if a == "-v":
            host, cont, mode = argv[i + 1].split(":")
            out.append((host, cont, mode))
    return out


def envs(argv) -> dict[str, str]:
    out = {}
    for i, a in enumerate(argv):
        if a == "-e":
            k, _, v = argv[i + 1].partition("=")
            out[k] = v
    return out


class TestDockerRun:
    def start_role(self, night, h, role):
        runner, fx = nf.make_runner(night, h)
        if role == "supervisor":
            runner.start_supervisor()
            return runner, fx, runner.sup, fx.spawned[-1][1]
        runner.start_supervisor()
        nf.write_queue(runner, nf.queue(nf.task("t-1", role=role)))
        assert runner.load_queue()
        fx.t += 10
        runner.schedule()
        t = runner.tasks["t-1"]
        assert t.state == "running", t.state
        return runner, fx, t, fx.spawned[-1][1]

    @pytest.mark.parametrize("role", ["implementer", "reviewer", "gate-runner"])
    def test_a_task_reads_mains_committed_gitleaks_config(self, night, h, role):
        # T090 round 2: make check's secrets gate reads .gitleaks.toml from the main working tree, which no task
        # mounts. The runner writes refs/heads/main's committed copy into its own state and mounts that, read-only.
        h.share.chmod(0o555)  # as the install leaves it
        try:
            _runner, fx, _t, argv = self.start_role(night, h, role)
        finally:
            h.share.chmod(0o755)
        want = f"{h.repo}/.gitleaks.toml"
        got = [(host, mode) for host, c, mode in vols(argv) if c == want]
        assert len(got) == 1, got
        host, mode = got[0]
        assert mode == "ro"
        assert not host.startswith(str(h.repo) + "/"), host
        assert Path(host).read_text() == fx.main_gitleaks
        assert Path(host).stat().st_mode & 0o777 == 0o444

    def test_a_missing_gate_folder_refuses_the_task_and_says_why(self, night, h):
        # The install leaves the share folder 0555 and makes gate/ itself; the runner never makes it.
        runner, fx = nf.make_runner(night, h)
        (h.share / "gate").rmdir()
        with pytest.raises(night.Refused) as e:
            runner.start_supervisor()
        assert "gate is missing" in str(e.value) and "install" in str(e.value)
        assert not (h.share / "gate").exists()
        assert not fx.spawned

    def test_without_one_on_main_none_is_mounted(self, night, h):
        runner, fx = nf.make_runner(night, h)
        fx.main_gitleaks = None
        runner.start_supervisor()
        nf.write_queue(runner, nf.queue(nf.task("t-1", role="implementer")))
        assert runner.load_queue()
        fx.t += 10
        runner.schedule()
        argv = fx.spawned[-1][1]
        assert not [c for _h, c, _m in vols(argv) if c.endswith("/.gitleaks.toml")]

    def test_the_implementer_line_exactly(self, night, h):
        _runner, _fx, _t, argv = self.start_role(night, h, "implementer")
        wt = str(h.night_root / nf.NIGHT / "t-1")
        g = str(h.repo / ".git")
        prompt = argv[argv.index("-p") + 1]
        expected = [
            "docker", "run", "--rm", "--name", "h4-night-t-1", "--init", "--user", "1000:1000",
            "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--read-only",
            "--tmpfs", "/tmp:rw,nosuid,size=2g",
            "--memory", "4g", "--cpus", "2", "--pids-limit", "512",
            "--network", "h4-night", "--network", "h4-night-engine",
            "--env-file", str(h.token),
            "-e", "HTTPS_PROXY=http://egress:3128", "-e", "NO_PROXY=engine-fwd", "-e", "SANDBOX_RUNTIME=1",
            "-e", "CLAUDE_CONFIG_DIR=/night/claude", "-e", "DISABLE_AUTOUPDATER=1", "-e", "DISABLE_TELEMETRY=1",
            "-e", "DISABLE_ERROR_REPORTING=1", "-e", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1",
            "-v", f"{wt}:{wt}:rw",
            "-v", f"{g}:{g}:ro",
            "-v", f"{g}/objects:{g}/objects:rw",
            "-v", f"{g}/objects/info:{g}/objects/info:ro",
            "-v", f"{g}/worktrees/t-1:{g}/worktrees/t-1:rw",
            "-v", f"{g}/worktrees/t-1/commondir:{g}/worktrees/t-1/commondir:ro",
            "-v", f"{g}/refs/heads/night/t-1:{g}/refs/heads/night/t-1:rw",
            "-v", f"{g}/logs/refs/heads/night/t-1:{g}/logs/refs/heads/night/t-1:rw",
            "-v", f"{wt}/CLAUDE.md:{wt}/CLAUDE.md:ro",
            "-v", f"{wt}/REVIEW.md:{wt}/REVIEW.md:ro",
            "-v", f"{wt}/.claude:{wt}/.claude:ro",
            "-v", f"{wt}/.specify/memory/constitution.md:{wt}/.specify/memory/constitution.md:ro",
            "-v", f"{wt}/tools/gates:{wt}/tools/gates:ro",
            "-v", f"{wt}/GNUmakefile:{wt}/GNUmakefile:ro",
            "-v", f"{h.share}/gate/gitleaks.toml:{h.repo}/.gitleaks.toml:ro",
            "-v", "/srv/studio/briefs:/srv/studio/briefs:rw",
            "-v", "/srv/studio/handoff:/srv/studio/handoff:ro",
            "-v", f"{h.engine_certs}:/night/engine-certs:ro",
            "-v", f"{h.share}/claude/implementer:/night/claude:rw",
            "-v", f"{h.night_root}/.io/t-1:/night/io:rw",
            "-w", wt, h.images[f"h4-night-worker:{nf.SHA12}"],
            "claude", "-p", prompt, "--output-format", "stream-json", "--verbose",
            "--settings", "/night/settings-implementer.json",
        ]  # fmt: skip
        assert argv == expected
        assert prompt.startswith("You are the night shift's implementer.")
        assert "t-1" in prompt and "night/t-1/s" in prompt

    @pytest.mark.parametrize("role", nf.SESSION_ROLES)
    def test_every_roles_line_holds_the_locks(self, night, h, role):
        _runner, _fx, _t, argv = self.start_role(night, h, role)
        assert argv[:3] == ["docker", "run", "--rm"]
        assert argv[argv.index("--cap-drop") + 1] == "ALL"
        assert argv[argv.index("--security-opt") + 1] == "no-new-privileges"
        assert argv[argv.index("--user") + 1] == "1000:1000"
        if role == "studio":
            assert (
                "--read-only" not in argv
            )  # contracts/containers.md §7: the NVIDIA hook writes at start
            assert argv[argv.index("--gpus") + 1] == "all"
        else:
            assert "--read-only" in argv
            assert "--gpus" not in argv
        for flag in ("--memory", "--cpus", "--pids-limit", "--tmpfs"):
            assert flag in argv
        nets = [argv[i + 1] for i, a in enumerate(argv) if a == "--network"]
        assert nets and all(
            n.startswith("h4-night") and n != "h4-night-out" for n in nets
        )
        assert argv[argv.index("--env-file") + 1] == str(h.token)
        assert "--bare" not in argv
        assert not any(a.startswith("--dangerously") for a in argv)
        env = envs(argv)
        for name in (*nf.BILLING_VARS, "ANTHROPIC_BASE_URL", "CLAUDE_CODE_OAUTH_TOKEN"):
            assert name not in env
        assert not [k for k in env if k.startswith("AWS_")]
        assert env["CLAUDE_CONFIG_DIR"] == "/night/claude"
        assert env["SANDBOX_RUNTIME"] == "1"
        assert nf.token_value() not in " ".join(argv)
        assert argv[argv.index("--settings") + 1] == f"/night/settings-{role}.json"
        assert argv[argv.index("--output-format") + 1] == "stream-json"

    @pytest.mark.parametrize("role", nf.SESSION_ROLES)
    def test_no_never_mounted_path_nor_an_ancestor(self, night, h, role):
        _runner, _fx, _t, argv = self.start_role(night, h, role)
        never = [str(h.home / p) for p in NEVER] + [
            "/srv/studio/photos",
            "/srv/studio/key",
            "/var/run/docker.sock",
            "/run/docker.sock",
        ]
        if role != "studio":
            never.append("/srv/studio/outputs")
        for host, _cont, _mode in vols(argv):
            for f in never:
                assert (
                    host != f
                    and not host.startswith(f + "/")
                    and not f.startswith(host.rstrip("/") + "/")
                ), (
                    host,
                    f,
                )
            assert host != str(h.repo) and not str(h.repo).startswith(host + "/")
            if host.startswith(str(h.repo) + "/"):
                assert host.startswith(str(h.repo / ".git")), host
            assert not host.endswith(".sock")

    @pytest.mark.parametrize(
        "role", ["supervisor", "spec-writer", "implementer", "ops"]
    )
    def test_every_writing_role_has_every_mask(self, night, h, role):
        _runner, _fx, t, argv = self.start_role(night, h, role)
        v = {(host, mode) for host, _c, mode in vols(argv)}
        g = h.repo / ".git"
        admin = Path(t.admin)
        task = t.id
        # FR-012: .git read-only, and read-write only where a commit on the task's own branch writes.
        assert (str(g), "ro") in v
        rw_git = {host for host, mode in v if mode == "rw" and host.startswith(str(g))}
        assert rw_git == {
            str(g / "objects"),
            str(admin),
            str(g / "refs/heads/night" / task),
            str(g / "logs/refs/heads/night" / task),
        }
        assert (str(g / "objects/info"), "ro") in v
        assert (str(admin / "commondir"), "ro") in v
        for p in rw_git:
            assert Path(p).is_dir(), p  # made outside, before the run
        # Paths under the read-only .git need no mask of their own.
        for p in (
            "hooks",
            "config",
            "info",
            "packed-refs",
            "refs/heads/main",
            "refs/tags",
            "refs/replace",
        ):
            assert not [x for x in v if x[0] == str(g / p)], p
        wt = Path(t.worktree)
        for p in (
            "CLAUDE.md",
            "REVIEW.md",
            ".claude",
            ".specify/memory/constitution.md",
            "tools/gates",
        ):
            assert (str(wt / p), "ro") in v, p
        assert (str(wt), "rw") in v

    @pytest.mark.parametrize("role", nf.SESSION_ROLES)
    def test_no_session_binds_git_itself_read_write(self, night, h, role):
        _runner, _fx, _t, argv = self.start_role(night, h, role)
        g = str(h.repo / ".git")
        for host, cont, mode in vols(argv):
            if host == g or cont == g:
                assert mode == "ro"
            if mode == "rw" and host.startswith(g + "/"):
                rel = host[len(g) + 1 :]
                assert rel == "objects" or rel.startswith(
                    ("worktrees/", "refs/heads/night/", "logs/refs/heads/night/")
                ), rel

    def test_a_denied_git_path_under_a_read_write_mount_is_masked(self, night, h):
        runner, fx = nf.make_runner(night, h)
        settings = json.loads(fx.main_settings)
        settings["sandbox"]["filesystem"]["denyWrite"].append("./.git/objects/pack")
        fx.main_settings = json.dumps(settings)
        (h.repo / ".git/objects/pack").mkdir(parents=True)
        runner.start_supervisor()
        g = str(h.repo / ".git")
        assert (f"{g}/objects/pack", f"{g}/objects/pack", "ro") in vols(
            fx.spawned[-1][1]
        )

    def test_a_denied_git_path_over_a_read_write_mount_refuses(self, night, h):
        runner, fx = nf.make_runner(night, h)
        settings = json.loads(fx.main_settings)
        settings["sandbox"]["filesystem"]["denyWrite"].append("./.git/objects")
        fx.main_settings = json.dumps(settings)
        with pytest.raises(night.Refused) as e:
            runner.start_supervisor()
        assert "objects" in str(e.value)

    @pytest.mark.parametrize("role", ["reviewer", "red-teamer", "gate-runner"])
    def test_reading_roles_mount_the_worktree_and_git_read_only(self, night, h, role):
        _runner, _fx, t, argv = self.start_role(night, h, role)
        v = {host: mode for host, _c, mode in vols(argv)}
        assert v[t.worktree] == "ro"
        assert v[str(h.repo / ".git")] == "ro"

    def test_the_studio_has_no_worktree_and_works_in_its_io(self, night, h):
        _runner, _fx, _t, argv = self.start_role(night, h, "studio")
        assert argv[argv.index("-w") + 1] == "/night/io"
        assert not [v for v in vols(argv) if v[0].startswith(str(h.repo))]
        assert ("/srv/studio/outputs", "/srv/studio/outputs", "rw") in vols(argv)

    def test_masks_follow_mains_settings(self, night, h):
        runner, fx = nf.make_runner(night, h)
        settings = json.loads(fx.main_settings)
        settings["sandbox"]["filesystem"]["denyWrite"].append("./README.md")
        fx.main_settings = json.dumps(settings)
        runner.start_supervisor()
        argv = fx.spawned[-1][1]
        wt = runner.sup.worktree
        assert (f"{wt}/README.md", f"{wt}/README.md", "ro") in vols(argv)
        reads = [c for c, k in fx.git_calls() if "cat-file" in c]
        assert reads and reads[0][-1] == "refs/heads/main:.claude/settings.json"

    def test_an_absent_mask_path_is_skipped_and_logged(self, night, h):
        runner, fx = nf.make_runner(night, h)
        runner.start_supervisor()
        argv = fx.spawned[-1][1]
        assert not [v for v in vols(argv) if v[0].endswith("/makefile")]
        assert "makefile" in (h.state / "log").read_text()

    def test_unreadable_main_settings_refuse_the_start(self, night, h):
        runner, fx = ready_runner(night, h)
        fx.main_settings = "{broken"
        nf.write_queue(runner, nf.queue(nf.task("t-1")))
        runner.load_queue()
        fx.t += 10
        runner.schedule()
        assert runner.tasks["t-1"].state == "refused"
        assert len(fx.spawned) == 1  # only the supervisor

    def test_a_symlinked_mask_path_refuses_the_start(self, night, h, tmp_path):
        runner, fx = nf.make_runner(night, h)
        wt = h.night_root / nf.NIGHT / "supervisor"
        fx.make_worktree(wt)
        runner.state_tasks["supervisor"] = {
            "admin": str(h.repo / ".git/worktrees/supervisor"),
            "worktree": str(wt),
        }
        (wt / ".claude").rmdir()
        (wt / ".claude").symlink_to(tmp_path)
        with pytest.raises(night.Refused) as e:
            runner.start_supervisor()
        assert ".claude" in str(e.value)

    def test_a_missing_loose_main_ref_needs_no_mask(self, night, h):
        # .git is read-only, so a session can't create a loose refs/heads/main; the runner writes nothing there.
        (h.repo / ".git/refs/heads/main").unlink()
        runner, _fx = nf.make_runner(night, h)
        runner.start_supervisor()
        assert not (h.repo / ".git/refs/heads/main").exists()

    @pytest.mark.parametrize(
        "bad",
        [
            {"host": "{home}/.aws", "container": "/x", "mode": "ro"},
            {"host": "{home}/.aws/credentials", "container": "/x", "mode": "ro"},
            {"host": "{home}/.ssh", "container": "/x", "mode": "ro"},
            {"host": "{home}/.config/h4reet-ai", "container": "/x", "mode": "ro"},
            {"host": "{home}/.config/gh", "container": "/x", "mode": "ro"},
            {"host": "{home}/.git-credentials", "container": "/x", "mode": "ro"},
            {"host": "{home}/.docker", "container": "/x", "mode": "ro"},
            {"host": "{home}/.claude", "container": "/x", "mode": "ro"},
            {"host": "{home}/.claude.json", "container": "/x", "mode": "ro"},
            {"host": "/srv/studio/photos", "container": "/x", "mode": "ro"},
            {"host": "/srv/studio/key", "container": "/x", "mode": "ro"},
            {"host": "/srv/studio/outputs", "container": "/x", "mode": "ro"},
            {"host": "/var/run/docker.sock", "container": "/x", "mode": "rw"},
            {"host": "/run/docker.sock", "container": "/x", "mode": "rw"},
            {"host": "{home}", "container": "/x", "mode": "ro"},
            {"host": "/", "container": "/x", "mode": "ro"},
            {"host": "/srv", "container": "/x", "mode": "ro"},
            {"host": "/srv/studio", "container": "/x", "mode": "ro"},
            {"host": "/var/run", "container": "/x", "mode": "ro"},
            {"host": "/run", "container": "/x", "mode": "ro"},
            {"host": "{repo}", "container": "/x", "mode": "ro"},
            {"host": "{repo}/apps", "container": "/x", "mode": "ro"},
            {"host": "{home}/h4reet-ai", "container": "/x", "mode": "ro"},
            {"host": "/x/../srv/studio/key", "container": "/x", "mode": "ro"},
            {"host": "relative", "container": "/x", "mode": "ro"},
            {"host": "/srv/studio/briefs", "container": "/x", "mode": "rwx"},
            {"host": "/srv/a:b", "container": "/x", "mode": "ro"},
            {"host": "/srv/studio/briefs", "container": "{wt}", "mode": "ro"},
        ],
    )
    def test_a_spec_that_mounts_a_never_mounted_path_is_refused(self, night, h, bad):
        runner, fx = nf.make_runner(night, h)
        wt = str(h.night_root / nf.NIGHT / "supervisor")
        m = {k: v.format(home=h.home, repo=h.repo, wt=wt) for k, v in bad.items()}
        spec = h.spec_for("supervisor")
        spec["mounts"].append(m)
        h.write_spec("supervisor", spec)
        with pytest.raises(night.Refused):
            runner.start_supervisor()
        assert fx.spawned == []

    @pytest.mark.parametrize(
        "mutate",
        [
            lambda s: s["env"].update(ANTHROPIC_API_KEY="x"),
            lambda s: s["env"].update(ANTHROPIC_AUTH_TOKEN="x"),
            lambda s: s["env"].update(ANTHROPIC_BASE_URL="http://x"),
            lambda s: s["env"].update(CLAUDE_CODE_USE_BEDROCK="1"),
            lambda s: s["env"].update(CLAUDE_CODE_USE_VERTEX="1"),
            lambda s: s["env"].update(CLAUDE_CODE_USE_FOUNDRY="1"),
            lambda s: s["env"].update(CLAUDE_CODE_OAUTH_TOKEN="x"),
            lambda s: s["env"].update(AWS_PROFILE="x"),
            lambda s: s["env"].pop("SANDBOX_RUNTIME"),
            lambda s: s["env"].update(HTTPS_PROXY="http://elsewhere:3128"),
            lambda s: s.update(cap_drop=[]),
            lambda s: s.update(security_opt=[]),
            lambda s: s.update(read_only=False),
            lambda s: s.update(gpus="all"),
            lambda s: s.update(user="0:0"),
            lambda s: s.update(image="h4-night-worker:latest"),
            lambda s: s.update(image="h4-night-worker"),
            lambda s: s.update(networks=["host"]),
            lambda s: s.update(networks=["bridge"]),
            lambda s: s.update(networks=["h4-night-out"]),
            lambda s: s.update(env_file="/tmp/other.env"),
        ],
    )
    def test_a_spec_that_breaks_a_lock_is_refused(self, night, h, mutate):
        runner, fx = nf.make_runner(night, h)
        spec = h.spec_for("supervisor")
        mutate(spec)
        h.write_spec("supervisor", spec)
        with pytest.raises(night.Refused):
            runner.start_supervisor()
        assert fx.spawned == []

    def test_a_prompt_that_looks_like_a_flag_is_refused(self, night, h):
        (h.prompts / "supervisor.md").write_text("--bare\n")
        runner, _fx = nf.make_runner(night, h)
        with pytest.raises(night.Refused):
            runner.start_supervisor()

    def test_the_runner_never_mounts_a_worktree_outside_night_root(self, night, h):
        runner, _fx = nf.make_runner(night, h)
        with pytest.raises(night.Refused):
            runner.check_task_mount(str(h.home / "elsewhere"))

    def test_the_egress_and_forwarder_lines(self, night, h):
        runner, fx = nf.make_runner(night, h)
        runner.start_network_helpers()
        runs = fx.docker_calls("run")
        names = [c[c.index("--name") + 1] for c in runs]
        assert names == [
            "h4-night-egress",
            "h4-night-egress-studio",
            "h4-night-engine-fwd",
        ]
        for c in runs:
            assert c[c.index("--cap-drop") + 1] == "ALL" and "--read-only" in c
            assert c[c.index("--network") + 1] == "h4-night-out"
            assert "--env-file" not in c
            assert nf.token_value() not in " ".join(c)
        fwd = runs[2]
        assert fwd[-1] == "TCP:198.18.0.1:2376"
        assert runs[0][-1] == h.images[f"h4-night-egress:{nf.SHA12}"]
        assert h.images[f"h4-night-worker:{nf.SHA12}"] in fwd
        connects = fx.docker_calls("network")
        connects = [c for c in connects if c[2:3] == ["connect"]]
        assert [
            "docker",
            "network",
            "connect",
            "--alias",
            "egress",
            "h4-night",
            "h4-night-egress",
        ] in connects
        assert [
            "docker", "network", "connect", "--alias", "egress-studio", "h4-night-studio", "h4-night-egress-studio",
        ] in connects  # fmt: skip
        assert [
            "docker", "network", "connect", "--alias", "engine-fwd", "h4-night-engine", "h4-night-engine-fwd",
        ] in connects  # fmt: skip


class TestRunnerGit:
    def test_every_git_call_has_no_hooks_no_fsmonitor_no_replace_no_system(
        self, night, h
    ):
        runner, fx = ready_runner(night, h, nf.task("aaa", name="feat/018-a"))
        fx.t += 10
        runner.schedule()
        fx.t += 16 * 60
        runner.check_idle()
        runner.dispatch(("exit", runner.tasks["aaa"].key, 0))
        calls = fx.git_calls()
        assert len(calls) >= 4
        for argv, kw in calls:
            assert argv[: len(nf.GIT_PREFIX)] == nf.GIT_PREFIX
            assert kw["env"].get("GIT_NO_REPLACE_OBJECTS") == "1"
            assert kw["env"].get("GIT_CONFIG_NOSYSTEM") == "1"
            for a in argv:
                assert a != "main" and not a.startswith(("main:", "main^", "main~")), (
                    argv
                )

    def test_git_drops_the_callers_git_variables(self, night, h):
        runner, fx = nf.make_runner(night, h)
        fx.environ["GIT_DIR"] = "/elsewhere"
        fx.environ["GIT_CONFIG_GLOBAL"] = "/elsewhere/config"
        runner.git("rev-parse", "--verify", "--quiet", "refs/heads/main^{commit}")
        env = fx.git_calls()[-1][1]["env"]
        assert "GIT_CONFIG_GLOBAL" not in env and env.get("GIT_DIR") != "/elsewhere"


# ================================================================================================================
# T016: requests (contracts/runner.md §5)
# ================================================================================================================


def put_request(runner, t, n, req) -> None:
    out = Path(runner.io_dir(t)) / "out"
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{n}.json").write_text(req if isinstance(req, str) else json.dumps(req))


def answer(runner, t, n) -> dict:
    return json.loads((Path(runner.io_dir(t)) / "in" / f"{n}.json").read_text())


def running_task(night, h, role, fx=None, **kw):
    runner, fx = ready_runner(night, h, nf.task("t-1", role=role, **kw), fx=fx)
    fx.t += 10
    runner.schedule()
    t = runner.tasks["t-1"]
    assert t.state == "running"
    return runner, fx, t


def ask(runner, t, n, req) -> dict:
    put_request(runner, t, n, req)
    runner.dispatch(("line", t.key, nf.event_line({"type": "system"})))
    runner.pump()
    return answer(runner, t, n)


class TestRequests:
    def test_plan_while_off(self, night, h):
        runner, fx, t = running_task(night, h, "ops")
        a = ask(
            runner, t, 1, {"kind": "plan", "root": "bootstrap", "sha": nf.sha40("x")}
        )
        assert a["ok"] is False and a["answer"] == "off: waiting for P-2, P-3, P-6"
        assert not [c for c, _ in fx.calls if c[:1] == ["aws"]]

    def test_gate_while_off(self, night, h):
        runner, fx, t = running_task(night, h, "gate-runner")
        a = ask(runner, t, 1, {"kind": "gate", "sha": nf.sha40("x")})
        assert a["ok"] is False and a["answer"] == "off: waiting for P-2, P-3, P-6"
        assert fx.gate_seen == []

    def gate_on(self, h):
        h.set_fact("NIGHT_GATE", "on")

    def test_gate_on_runs_on_main_clean_under_the_lock_never_prove(self, night, h):
        self.gate_on(h)
        runner, fx, t = running_task(night, h, "gate-runner")
        sha = nf.sha40("tip")
        a = ask(runner, t, 1, {"kind": "gate", "sha": sha})
        assert a["ok"] is True, a
        assert len(fx.gate_seen) == 1
        seen = fx.gate_seen[0]
        assert seen["argv"] == ["/usr/bin/python3", "-I", "-B", "tools/gates/gate", sha]
        assert seen["cwd"] == str(h.repo)
        assert seen["gate_lock_held"] is True
        assert "--prove" not in seen["argv"]
        assert a["lines"] == ["gate: passed (fixture)", "merge: would merge cleanly"]
        assert (Path(runner.io_dir(t)) / "in" / "1.log").exists()
        probe = fx.lock(str(h.state / "locks" / "gate"))
        assert probe is not None  # released after
        fx.unlock(probe)

    def test_gate_refuses_off_main(self, night, h):
        self.gate_on(h)
        runner, fx, t = running_task(night, h, "gate-runner")
        fx.repo_head = "refs/heads/wip/away"
        a = ask(runner, t, 1, {"kind": "gate", "sha": nf.sha40("tip")})
        assert a["ok"] is False and "refs/heads/main" in a["answer"]
        assert fx.gate_seen == []
        assert "refs/heads/main" in nf.page_text(runner)

    def test_gate_refuses_a_dirty_checkout(self, night, h):
        self.gate_on(h)
        runner, fx, t = running_task(night, h, "gate-runner")
        fx.repo_dirty = " M Makefile\n"
        a = ask(runner, t, 1, {"kind": "gate", "sha": nf.sha40("tip")})
        assert a["ok"] is False and "clean" in a["answer"]
        assert fx.gate_seen == []

    @pytest.mark.parametrize(
        "req",
        [
            {"kind": "gate", "sha": "abc"},
            {"kind": "gate", "sha": nf.sha40("x"), "prove": True},
            {"kind": "gate", "sha": nf.sha40("x"), "args": ["--prove"]},
            {"kind": "gate", "sha": "--prove"},
        ],
    )
    def test_gate_refuses_a_bad_request(self, night, h, req):
        self.gate_on(h)
        runner, fx, t = running_task(night, h, "gate-runner")
        assert ask(runner, t, 1, req)["ok"] is False
        assert fx.gate_seen == []

    def test_gate_from_another_role_is_refused(self, night, h):
        self.gate_on(h)
        runner, fx, t = running_task(night, h, "implementer")
        assert ask(runner, t, 1, {"kind": "gate", "sha": nf.sha40("x")})["ok"] is False
        assert fx.gate_seen == []

    def test_gate_with_its_lock_held_elsewhere_is_refused(self, night, h):
        self.gate_on(h)
        runner, fx, t = running_task(night, h, "gate-runner")
        (h.state / "locks").mkdir(parents=True, exist_ok=True)
        held = fx.lock(str(h.state / "locks" / "gate"))
        try:
            a = ask(runner, t, 1, {"kind": "gate", "sha": nf.sha40("x")})
        finally:
            fx.unlock(held)
        assert a["ok"] is False and "gate lock" in a["answer"]

    def test_plan_on_writes_its_credentials_0600_and_deletes_them(self, night, h):
        h.set_fact("NIGHT_PLAN", "on")
        runner, fx, t = running_task(night, h, "ops")
        sha = nf.sha40("plan")
        a = ask(runner, t, 1, {"kind": "plan", "root": "bootstrap", "sha": sha})
        assert a["ok"] is True, a
        assert "h4-plan" in a["answer"]
        assert len(fx.plan_seen) == 1
        seen = fx.plan_seen[0]
        assert seen["mode"] == 0o600
        assert not os.path.exists(seen["env_file"])
        aws = [c for c, _ in fx.calls if c[:1] == ["aws"]]
        assert aws == [
            [
                "aws",
                "configure",
                "export-credentials",
                "--profile",
                "h4-agent-plan",
                "--format",
                "env-no-export",
            ]
        ]
        argv = seen["argv"]
        assert argv[argv.index("--network") + 1] == "h4-night-plan"
        assert argv[-6:] == [
            "/usr/bin/python3",
            "-I",
            "-B",
            "scripts/infra/infra_plan.py",
            "--root",
            "bootstrap",
        ]
        wt = argv[argv.index("-w") + 1]
        assert (wt, wt, "ro") in vols(argv)
        assert sha[:12] in wt
        assert [c for c, _ in fx.git_calls() if "--detach" in c and sha in c]
        assert str(h.token) not in argv
        assert "AKIA" not in json.dumps(a) and "AKIA" not in nf.page_text(runner)
        assert "AKIA" not in (h.state / "log").read_text()

    @pytest.mark.parametrize(
        "req",
        [
            {"kind": "plan", "root": "everything", "sha": nf.sha40("x")},
            {"kind": "plan", "root": "bootstrap", "sha": "short"},
            {"kind": "plan", "root": "bootstrap", "sha": nf.sha40("x"), "apply": True},
        ],
    )
    def test_plan_refuses_a_bad_request(self, night, h, req):
        h.set_fact("NIGHT_PLAN", "on")
        runner, fx, t = running_task(night, h, "ops")
        assert ask(runner, t, 1, req)["ok"] is False
        assert fx.plan_seen == []

    def test_plan_from_another_role_is_refused(self, night, h):
        h.set_fact("NIGHT_PLAN", "on")
        runner, _fx, t = running_task(night, h, "implementer")
        assert (
            ask(
                runner,
                t,
                1,
                {"kind": "plan", "root": "bootstrap", "sha": nf.sha40("x")},
            )["ok"]
            is False
        )

    def test_comfyui_start_from_a_studio_task_with_the_gpu_lock(self, night, h):
        runner, fx, t = running_task(night, h, "studio")
        a = ask(
            runner,
            t,
            1,
            {"kind": "comfyui", "action": "start", "params": ["--birefnet"]},
        )
        assert a["ok"] is True, a
        run = next(c for c in fx.docker_calls("run") if "h4-night-comfyui" in c)
        assert run[run.index("--network") + 1] == "h4-night-studio"
        assert run[run.index("--gpus") + 1] == "all"
        assert "--env-file" not in run
        tail = run[run.index(h.images[f"h4-night-comfyui:{nf.SHA12}"]) + 1 :]
        assert tail == [
            f"{h.comfyui_venv}/bin/python", "main.py", "--listen", "0.0.0.0", "--port", "8188",
            "--output-directory", "/srv/studio/outputs", "--temp-directory", "/comfyui/temp",
            "--user-directory", "/comfyui/user", "--birefnet",
        ]  # fmt: skip
        # The end of the task stops it.
        runner.dispatch(("exit", t.key, 0))
        assert ["docker", "stop", "-t", "60", "h4-night-comfyui"] in fx.docker_calls(
            "stop"
        )

    def test_comfyui_stop(self, night, h):
        runner, fx, t = running_task(night, h, "studio")
        ask(runner, t, 1, {"kind": "comfyui", "action": "start", "params": []})
        a = ask(runner, t, 2, {"kind": "comfyui", "action": "stop"})
        assert a["ok"] is True
        assert ["docker", "stop", "-t", "60", "h4-night-comfyui"] in fx.docker_calls(
            "stop"
        )

    def test_comfyui_not_ready_answers_with_its_last_lines(self, night, h):
        runner, fx, t = running_task(night, h, "studio")
        fx.comfy_ready = False
        a = ask(runner, t, 1, {"kind": "comfyui", "action": "start", "params": []})
        assert a["ok"] is False and "comfyui: last line" in a["answer"]
        assert sum(fx.pauses) <= 120 + 5

    @pytest.mark.parametrize(
        "params",
        [["--listen", "1.2.3.4"], ["--evil"], ["--port", "1"], "--birefnet", [1]],
    )
    def test_comfyui_refuses_a_parameter_off_the_allowlist(self, night, h, params):
        runner, fx, t = running_task(night, h, "studio")
        a = ask(runner, t, 1, {"kind": "comfyui", "action": "start", "params": params})
        assert a["ok"] is False
        if isinstance(params, list) and isinstance(params[0], str):
            assert params[0] in a["answer"]
        assert not [c for c in fx.docker_calls("run") if "h4-night-comfyui" in c]

    def test_comfyui_from_another_role_is_refused(self, night, h):
        runner, fx, t = running_task(night, h, "implementer", locks=["gpu"])
        a = ask(runner, t, 1, {"kind": "comfyui", "action": "start", "params": []})
        assert a["ok"] is False
        assert not [c for c in fx.docker_calls("run") if "h4-night-comfyui" in c]

    @pytest.mark.parametrize(
        "req", [{"kind": "shell", "cmd": "id"}, {"kind": 3}, [], "not json", {}]
    )
    def test_anything_else_is_refused(self, night, h, req):
        runner, _fx, t = running_task(night, h, "implementer")
        a = ask(runner, t, 1, req)
        assert a["ok"] is False and a["answer"].startswith("refused")

    def test_each_request_is_answered_once(self, night, h):
        runner, _fx, t = running_task(night, h, "implementer")
        ask(runner, t, 1, {"kind": "shell"})
        before = (Path(runner.io_dir(t)) / "in" / "1.json").stat().st_mtime_ns
        runner.dispatch(("line", t.key, nf.event_line({"type": "system"})))
        assert (Path(runner.io_dir(t)) / "in" / "1.json").stat().st_mtime_ns == before

    def test_a_symlinked_inbox_isnt_followed(self, night, h, tmp_path):
        runner, _fx, t = running_task(night, h, "implementer")
        target = tmp_path / "victim"
        target.mkdir()
        io = Path(runner.io_dir(t))
        (io / "in").rmdir() if (io / "in").exists() else None
        (io / "in").symlink_to(target)
        put_request(runner, t, 1, {"kind": "shell"})
        runner.dispatch(("line", t.key, nf.event_line({"type": "system"})))
        assert list(target.iterdir()) == []

    def test_a_symlinked_request_isnt_read(self, night, h, tmp_path):
        runner, _fx, t = running_task(night, h, "implementer")
        secret = tmp_path / "secret.json"
        secret.write_text(json.dumps({"kind": "gate", "sha": nf.token_value()}))
        out = Path(runner.io_dir(t)) / "out"
        out.mkdir(parents=True, exist_ok=True)
        (out / "1.json").symlink_to(secret)
        runner.dispatch(("line", t.key, nf.event_line({"type": "system"})))
        a = answer(runner, t, 1)
        assert a["ok"] is False and nf.token_value() not in json.dumps(a)


# ================================================================================================================
# A whole night, and a second start
# ================================================================================================================


class ScriptedFx(nf.FakeFx):
    """Sessions that end at once: the supervisor writes the queue on its first run; each worker succeeds."""

    def __init__(self, night, h, runner_ref):
        super().__init__(night, h)
        self.runner_ref = runner_ref
        self.waits = 0

    def spawn(self, key, argv, log_path=None):
        super().spawn(key, argv, log_path)
        if key == "supervisor#1":
            nf.write_queue(
                self.runner_ref[0],
                nf.queue(nf.task("aaa"), nf.task("bbb", after=["aaa"])),
            )
        self.events.append(("line", key, nf.result_event()))
        self.events.append(("exit", key, 0))

    def wait(self, timeout):
        self.waits += 1
        assert self.waits < 500, "the loop didn't end"
        return super().wait(timeout)


class TestTheNight:
    def test_a_whole_night_runs_event_by_event(self, night, h):
        ref = []
        fx = ScriptedFx(night, h, ref)
        runner, _ = nf.make_runner(night, h, fx)
        ref.append(runner)
        assert runner.run_night() == 0
        assert runner.tasks["aaa"].state == "done"
        assert runner.tasks["bbb"].state == "done"
        assert fx.sleeps == []  # no limit, so no sleep
        names = [c[c.index("--name") + 1] for c in fx.docker_calls("run")]
        assert names[:3] == [
            "h4-night-egress",
            "h4-night-egress-studio",
            "h4-night-engine-fwd",
        ]
        assert ["docker", "stop", "-t", "10", "h4-night-egress"] == fx.docker_calls(
            "stop"
        )[-1][:5]
        assert "the night ends: 2 of 2 tasks done" in nf.page_text(runner)
        order = [k.split("#")[0] for k, _ in fx.spawned]
        assert order.index("aaa") < order.index("bbb")

    def test_a_second_start_keeps_what_finished(self, night, h):
        runner, fx = ready_runner(night, h, nf.task("aaa"), nf.task("bbb"))
        fx.t += 10
        runner.schedule()
        runner.dispatch(("exit", runner.tasks["aaa"].key, 0))
        runner.save_state()
        again, _fx2 = nf.make_runner(night, h)
        again.start_supervisor()
        assert again.load_queue() is True
        assert again.tasks["aaa"].state == "done"
        assert again.tasks["bbb"].state == "queued"

    def test_a_worktree_the_runner_didnt_make_refuses(self, night, h):
        runner, _fx = nf.make_runner(night, h)
        (h.night_root / nf.NIGHT / "supervisor").mkdir(parents=True)
        with pytest.raises(night.Refused) as e:
            runner.start_supervisor()
        assert "didn't make it" in str(e.value)

    def test_a_tampered_commondir_refuses(self, night, h):
        runner, _fx = nf.make_runner(night, h)
        runner.start_supervisor()
        runner.dispatch(("exit", runner.sup.key, 0))
        (Path(runner.sup.admin) / "commondir").write_text("/tmp/elsewhere\n")
        with pytest.raises(night.Refused) as e:
            runner.start_supervisor()
        assert "commondir" in str(e.value)


# ================================================================================================================
# The commands: stop and status
# ================================================================================================================


class TestCommands:
    def test_status_with_no_night(self, night, h, capsys):
        assert night.main(["status"], fx=nf.FakeFx(night, h), home=h.home) == 0
        assert "no night" in capsys.readouterr().out

    def test_status_names_states_locks_and_the_reset(self, night, h, capsys):
        runner, fx = ready_runner(
            night, h, nf.task("gpu-1", role="studio"), nf.task("aaa")
        )
        fx.t += 10
        runner.schedule()
        runner.waiting_until = fx.t + 3600
        runner.save_state()
        assert night.main(["status"], fx=fx, home=h.home) == 0
        out = capsys.readouterr().out
        assert "gpu-1 running" in out and "aaa queued" in out
        assert "lock gpu gpu-1" in out
        assert "waiting until" in out

    def test_stop_stops_every_night_container_and_signals_the_runner(
        self, night, h, capsys
    ):
        runner, fx = ready_runner(night, h, nf.task("aaa"))
        runner.save_state()
        fx.cmdlines[4242] = b"/usr/bin/python3\0-I\0-B\0night.py\0start\0"
        assert night.main(["stop"], fx=fx, home=h.home) == 0
        assert fx.kills and fx.kills[0][0] == 4242
        stops = fx.docker_calls("stop")
        assert stops and stops[-1][:4] == ["docker", "stop", "-t", "60"]
        assert "h4-night-supervisor" in stops[-1]
        assert "aaa queued" in capsys.readouterr().out

    def test_stop_doesnt_signal_a_pid_that_isnt_the_runner(self, night, h):
        runner, fx = ready_runner(night, h)
        runner.save_state()
        fx.cmdlines[4242] = b"/usr/bin/vim\0"
        night.main(["stop"], fx=fx, home=h.home)
        assert fx.kills == []

    def test_an_unknown_command(self, night, h, capsys):
        assert night.main(["apply"], fx=nf.FakeFx(night, h), home=h.home) == 2


# ---- the ComfyUI allowlist in G3's shape (tasks.md T045; fixtures/comfyui-params.json is its file, verbatim) ----

G3_PARAMS = json.loads(nf.COMFY_PARAMS.read_text())


def comfy_start(night, h, params):
    runner, fx, t = running_task(night, h, "studio")
    a = ask(runner, t, 1, {"kind": "comfyui", "action": "start", "params": params})
    runs = [c for c in fx.docker_calls("run") if "h4-night-comfyui" in c]
    return a, runs


class TestComfyAllowlist:
    def test_the_fake_home_holds_g3s_file(self, h):
        assert (
            h.config / "comfyui-params.json"
        ).read_bytes() == nf.COMFY_PARAMS.read_bytes()
        assert (
            G3_PARAMS["schema"] == 1 and G3_PARAMS["allowed"][0]["flag"] == "--birefnet"
        )

    def test_birefnet_is_allowed(self, night, h):
        a, runs = comfy_start(night, h, ["--birefnet"])
        assert a["ok"] is True, a
        assert runs and runs[0][-1] == "--birefnet"

    def test_a_value_taking_form_is_refused(self, night, h):
        a, runs = comfy_start(night, h, ["--birefnet=x"])
        assert a["ok"] is False and "--birefnet=x" in a["answer"]
        assert runs == []

    @pytest.mark.parametrize("flag", G3_PARAMS["fixed_by_runner"])
    def test_each_flag_fixed_by_the_runner_is_refused(self, night, h, flag):
        a, runs = comfy_start(night, h, [flag])
        assert a["ok"] is False and flag in a["answer"]
        assert runs == []

    def test_an_unknown_flag_is_refused(self, night, h):
        a, runs = comfy_start(night, h, ["--enable-manager"])
        assert a["ok"] is False and "--enable-manager" in a["answer"]
        assert runs == []

    def test_the_files_own_fixed_list_counts_beyond_the_floor(self, night, h):
        data = json.loads(nf.COMFY_PARAMS.read_text())
        data["fixed_by_runner"].append("--birefnet")
        (h.config / "comfyui-params.json").write_text(json.dumps(data))
        a, runs = comfy_start(night, h, ["--birefnet"])
        assert a["ok"] is False and "--birefnet" in a["answer"]
        assert runs == []

    def test_the_floor_holds_if_the_file_drops_a_fixed_flag(self, night, h):
        data = json.loads(nf.COMFY_PARAMS.read_text())
        data["fixed_by_runner"] = []
        data["allowed"].append({"flag": "--listen", "value": None})
        (h.config / "comfyui-params.json").write_text(json.dumps(data))
        a, runs = comfy_start(night, h, ["--listen"])
        assert a["ok"] is False and runs == []

    def test_an_entry_taking_a_value_isnt_allowed_yet(self, night, h):
        data = json.loads(nf.COMFY_PARAMS.read_text())
        data["allowed"][0]["value"] = "x"
        (h.config / "comfyui-params.json").write_text(json.dumps(data))
        a, runs = comfy_start(night, h, ["--birefnet"])
        assert a["ok"] is False and runs == []

    @pytest.mark.parametrize(
        "data",
        [
            {"schema": 1, "params": ["--birefnet"]},  # the draft shape
            {
                "schema": 2,
                "fixed_by_runner": [],
                "allowed": [{"flag": "--birefnet", "value": None}],
            },
            {"schema": 1, "allowed": [{"flag": "--birefnet", "value": None}]},
            {"schema": 1, "fixed_by_runner": [], "allowed": {"flag": "--birefnet"}},
            {"schema": 1, "fixed_by_runner": [], "allowed": [{"flag": "--birefnet"}]},
            {
                "schema": 1,
                "fixed_by_runner": [],
                "allowed": [{"flag": "birefnet", "value": None}],
            },
            {
                "schema": 1,
                "fixed_by_runner": [3],
                "allowed": [{"flag": "--birefnet", "value": None}],
            },
            [],
            "not json",
        ],
    )
    def test_any_other_shape_fails_closed(self, night, h, data):
        p = h.config / "comfyui-params.json"
        p.write_text(data if isinstance(data, str) else json.dumps(data))
        a, runs = comfy_start(night, h, ["--birefnet"])
        assert a["ok"] is False and runs == []


# ================================================================================================================
# G1's review: B1 (the narrow .git mount and the runner's own git), and the should-fixes
# ================================================================================================================


class TestReviewFixes:
    def test_every_runner_git_call_names_the_common_dir(self, night, h):
        h.set_fact("NIGHT_GATE", "on")
        h.set_fact("NIGHT_PLAN", "on")
        runner, fx = ready_runner(
            night,
            h,
            nf.task("aaa", name="feat/018-a"),
            nf.task("gat", role="gate-runner"),
            nf.task("opx", role="ops"),
        )
        for _ in range(3):
            fx.t += 10
            runner.schedule()
        ask(runner, runner.tasks["gat"], 1, {"kind": "gate", "sha": nf.sha40("x")})
        ask(
            runner,
            runner.tasks["opx"],
            1,
            {"kind": "plan", "root": "bootstrap", "sha": nf.sha40("y")},
        )
        fx.t += 16 * 60
        runner.check_idle()
        runner.dispatch(("exit", runner.tasks["aaa"].key, 0))
        calls = fx.git_calls()
        assert len(calls) >= 8
        for argv, kw in calls:
            assert kw["env"].get("GIT_COMMON_DIR") == str(h.repo / ".git"), argv
            assert kw["env"].get("GIT_DIR"), argv

    @pytest.mark.parametrize(
        "rel", ["commondir", "main", "refs/main", "refs/remotes/main", "refs/tags/main"]
    )
    def test_a_planted_git_path_refuses_the_preflight(self, night, h, capsys, rel):
        p = h.repo / ".git" / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("x\n")
        rc, out = run_check(night, h, nf.FakeFx(night, h), capsys)
        assert rc == 1 and len(out.strip().splitlines()) == 1
        assert f".git/{rel}" in out

    @pytest.mark.parametrize(
        "ref", ["refs/tags/main", "refs/main", "refs/remotes/main"]
    )
    def test_a_packed_ref_named_main_refuses_the_preflight(self, night, h, capsys, ref):
        (h.repo / ".git/packed-refs").write_text(f"{nf.sha40('x')} {ref}\n")
        rc, out = run_check(night, h, nf.FakeFx(night, h), capsys)
        assert rc == 1 and ref in out

    def gate_pending(self, night, h):
        h.set_fact("NIGHT_GATE", "on")
        fx = nf.FakeFx(night, h)
        fx.defer_jobs = True
        runner, fx, t = running_task(night, h, "gate-runner", fx=fx)
        put_request(runner, t, 1, {"kind": "gate", "sha": nf.sha40("tip")})
        runner.dispatch(("line", t.key, nf.event_line({"type": "system"})))
        assert runner.pending
        return runner, fx, t

    def test_stopping_with_a_gate_running_ends_it_before_the_lock_goes(self, night, h):
        import signal as sig

        runner, fx, t = self.gate_pending(night, h)
        runner.abort_night()
        assert [d["key"] for d in fx.terminated] == [f"job:{t.id}:1"]
        assert fx.terminated[0]["gate_lock_held"] is True
        probe = fx.lock(str(h.state / "locks" / "gate"))
        assert probe is not None
        fx.unlock(probe)
        assert (sig.SIGTERM, sig.SIG_IGN) in fx.signals
        assert (sig.SIGINT, sig.SIG_IGN) in fx.signals
        assert runner.pending == {}
        assert t.state == "queued"

    def test_stopping_with_a_plan_running_stops_its_containers(self, night, h):
        h.set_fact("NIGHT_PLAN", "on")
        fx = nf.FakeFx(night, h)
        fx.defer_jobs = True
        runner, fx, t = running_task(night, h, "ops", fx=fx)
        put_request(
            runner, t, 1, {"kind": "plan", "root": "bootstrap", "sha": nf.sha40("p")}
        )
        runner.dispatch(("line", t.key, nf.event_line({"type": "system"})))
        assert runner.pending
        plan_dir = h.state / "plan"
        plan_dir.mkdir(parents=True, exist_ok=True)
        (plan_dir / "t-1-1.env").write_text("left over\n")
        runner.abort_night()
        stopped = {n for c in fx.docker_calls("stop") for n in c[4:]}
        assert {"h4-night-plan-t-1-1", "h4-night-egress-plan"} <= stopped
        assert not (plan_dir / "t-1-1.env").exists()

    def test_the_helpers_stop_includes_the_plan_egress(self, night, h):
        runner, fx = nf.make_runner(night, h)
        runner.stop_helpers()
        names = {n for c in fx.docker_calls("stop") for n in c[4:]}
        assert names == {
            "h4-night-egress",
            "h4-night-egress-studio",
            "h4-night-engine-fwd",
            "h4-night-egress-plan",
        }

    def test_ctrl_c_mid_night_is_a_clean_stop(self, night, h):
        class InterruptFx(nf.FakeFx):
            def wait(self, timeout):
                raise KeyboardInterrupt

        fx = InterruptFx(night, h)
        runner, _ = nf.make_runner(night, h, fx)
        assert runner.run_night() == 0
        assert runner.sup.state == "queued"
        assert "night.py stop" in nf.page_text(runner)
        names = {n for c in fx.docker_calls("stop") for n in c[4:]}
        assert "h4-night-egress-plan" in names

    def test_comfyui_reruns_the_disk_and_memory_checks(self, night, h):
        runner, fx, t = running_task(night, h, "studio")
        fx.disk["/mnt/c"] = 5 * 2**30
        a = ask(
            runner,
            t,
            1,
            {"kind": "comfyui", "action": "start", "params": ["--birefnet"]},
        )
        assert a["ok"] is False and "/mnt/c" in a["answer"]
        assert not [c for c in fx.docker_calls("run") if "h4-night-comfyui" in c]

    def test_idle_skips_a_task_with_a_pending_request(self, night, h):
        runner, fx, t = self.gate_pending(night, h)
        fx.t += 16 * 60
        runner.check_idle()
        assert t.state == "running"

    def test_an_engine_role_needs_no_proxy_for_the_forwarder(self, night, h):
        spec = h.spec_for("implementer")
        spec["env"].pop("NO_PROXY")
        h.write_spec("implementer", spec)
        runner, _fx = nf.make_runner(night, h)
        with pytest.raises(night.Refused) as e:
            runner.load_live_spec("implementer")
        assert "NO_PROXY" in str(e.value)

    @pytest.mark.parametrize(
        "role", ["supervisor", "spec-writer", "reviewer", "gate-runner"]
    )
    def test_only_engine_roles_join_the_engine_network(self, night, h, role):
        spec = h.spec_for(role)
        spec["networks"] = ["h4-night", "h4-night-engine"]
        h.write_spec(role, spec)
        runner, _fx = nf.make_runner(night, h)
        with pytest.raises(night.Refused) as e:
            runner.load_live_spec(role)
        assert "h4-night-engine" in str(e.value)


# ================================================================================================================
# The integration review (G2 fed its specs to the runner): the merge-time refusal, and the should-fixes
# ================================================================================================================

G2_SETTINGS = (nf.HERE / "fixtures" / "main-settings.json").read_text()

# Paths main's settings deny or main's protected-paths.sh guards. Some are absent from a fresh worktree, so no
# mask can cover them; others a session can change through the index and objects without touching a masked file.
HUMAN_ONLY = [
    ".mcp.json",  # absent from a fresh worktree, then created on the branch
    "CLAUDE.md",  # changed through the index: hash-object -w, then update-index --cacheinfo
    ".claude/settings.json",
    ".claude/hooks/bash-gate.sh",
    "REVIEW.md",
    ".specify/memory/constitution.md",
    "tools/gates/gate",
    "evals/agent-config/static.py",
    "deploy/night-shift/runner/night.py",
    "deploy/night-shift/containers/implementer.json",
    "deploy/env/prod.env",
    "config/prices.yaml",
    "makefile",
    "GNUmakefile",
    ".github/workflows/ci.yml",
    ".gitleaksignore",
    "infra/account/iam.tf",
    "corpus/00-profile.md",
    "assets/policy/caps.json",
]
NOT_HUMAN_ONLY = [
    "apps/web/src/room.ts",
    "corpus/proposals/x.md",
    "specs/018-x/spec.md",
    "Makefile",
]


def named_branches(fx) -> list[list[str]]:
    n = len(nf.GIT_PREFIX)
    return [c for c, _ in fx.git_calls() if c[n + 1 : n + 2] == ["branch"]]


def finish(runner, fx, tid: str) -> None:
    fx.t += 10
    runner.schedule()
    runner.dispatch(("line", runner.tasks[tid].key, nf.result_event()))
    runner.dispatch(("exit", runner.tasks[tid].key, 0))


class TestMergeTimeRefusal:
    @pytest.mark.parametrize("path", HUMAN_ONLY)
    def test_naming_refuses_a_stack_that_touches_a_human_only_path(
        self, night, h, path
    ):
        runner, fx = ready_runner(
            night, h, nf.task("res-01", slug="links", name="feat/018-resume-links")
        )
        fx.branch_changes = ["apps/web/src/room.ts", path]
        finish(runner, fx, "res-01")
        assert named_branches(fx) == []
        page = nf.page_text(runner)
        lines = [ln for ln in page.splitlines() if "touches a human-only path" in ln]
        assert [
            ln
            for ln in lines
            if ln.endswith(
                f"touches a human-only path: {path}; the Author's patch route"
            )
        ]
        assert not [ln for ln in lines if "apps/web/src/room.ts" in ln]
        assert "feat/018-resume-links not named" in page

    def test_each_path_is_one_line(self, night, h):
        runner, fx = ready_runner(
            night, h, nf.task("res-01", name="feat/018-resume-links")
        )
        fx.branch_changes = [".mcp.json", "CLAUDE.md"]
        finish(runner, fx, "res-01")
        nf.write_queue(
            runner, nf.queue(nf.task("res-01", name="feat/018-resume-links"))
        )
        runner.load_queue()
        page = nf.page_text(runner)
        for p in (".mcp.json", "CLAUDE.md"):
            assert page.count(f"touches a human-only path: {p};") == 1, p

    @pytest.mark.parametrize("path", NOT_HUMAN_ONLY)
    def test_an_ordinary_stack_is_named(self, night, h, path):
        runner, fx = ready_runner(
            night, h, nf.task("res-01", slug="links", name="feat/018-resume-links")
        )
        fx.branch_changes = [path]
        finish(runner, fx, "res-01")
        assert len(named_branches(fx)) == 1
        assert "human-only" not in nf.page_text(runner)

    def test_every_worker_end_is_checked(self, night, h):
        runner, fx = ready_runner(
            night, h, nf.task("res-01")
        )  # no name: not a finished stack
        fx.branch_changes = [".claude/agents/new.md"]
        finish(runner, fx, "res-01")
        assert (
            "res-01 touches a human-only path: .claude/agents/new.md"
            in nf.page_text(runner)
        )

    def test_the_diff_is_from_the_merge_base_with_main(self, night, h):
        runner, fx = ready_runner(
            night, h, nf.task("res-01", slug="links", name="feat/018-resume-links")
        )
        finish(runner, fx, "res-01")
        n = len(nf.GIT_PREFIX)
        bases = [c for c, _ in fx.git_calls() if c[n + 1 : n + 2] == ["merge-base"]]
        assert bases and bases[0][-2:] == [
            "refs/heads/main",
            nf.sha40("refs/heads/night/res-01/links"),
        ]
        trees = [c for c, _ in fx.git_calls() if c[n + 1 : n + 2] == ["diff-tree"]]
        assert trees and trees[0][-2:] == [
            nf.sha40("merge-base"),
            nf.sha40("refs/heads/night/res-01/links"),
        ]
        assert "--no-renames" in trees[0] and "-z" in trees[0]
        reads = [c[-1] for c, _ in fx.git_calls() if "cat-file" in c]
        assert "refs/heads/main:.claude/hooks/protected-paths.sh" in reads

    @pytest.mark.parametrize("hook", [None, "#!/usr/bin/env bash\nexit 0\n"])
    def test_an_unreadable_human_only_list_refuses_every_name(self, night, h, hook):
        runner, fx = ready_runner(
            night, h, nf.task("res-01", name="feat/018-resume-links")
        )
        fx.main_hook = hook
        fx.branch_changes = ["apps/web/src/room.ts"]
        finish(runner, fx, "res-01")
        assert named_branches(fx) == []
        assert "human-only list" in nf.page_text(runner)

    def test_the_matcher_follows_the_hooks_first_match(self, night):
        hook = nf.HOOK_FIXTURE.read_text()
        settings = json.loads(G2_SETTINGS)
        found = night.human_only_paths(HUMAN_ONLY + NOT_HUMAN_ONLY, settings, hook)
        assert found == HUMAN_ONLY


class TestNeverMountedMore:
    @pytest.mark.parametrize(
        "host",
        [
            "{home}/.local/state/h4reet",
            "{home}/.local/state/h4reet/agents-engine",
            "{home}/.local/state/h4reet-ai",
            "{home}/.local/share/h4reet/terraform-providers",
            "/srv/studio/workflows",
            "{home}/.gnupg",  # main's denyRead
            "{home}/.npmrc",  # main's denyRead
            "/mnt/c/Users",  # main's denyRead
        ],
    )
    def test_a_session_spec_may_not_mount(self, night, h, host):
        runner, fx = nf.make_runner(night, h)
        fx.main_settings = G2_SETTINGS
        host = host.format(home=h.home)
        fx.present.add(host)
        spec = h.spec_for("supervisor")
        spec["mounts"].append({"host": host, "container": "/x", "mode": "ro"})
        h.write_spec("supervisor", spec)
        with pytest.raises(night.Refused):
            runner.start_supervisor()
        assert fx.spawned == []

    def test_a_credentials_file_entry_is_never_mounted(self, night, h):
        runner, fx = nf.make_runner(night, h)
        settings = json.loads(G2_SETTINGS)
        settings["sandbox"].setdefault("credentials", {}).setdefault(
            "files", []
        ).append({"path": "~/.config/some-tool/token"})
        fx.main_settings = json.dumps(settings)
        host = f"{h.home}/.config/some-tool"
        fx.present.add(host)
        spec = h.spec_for("supervisor")
        spec["mounts"].append({"host": host, "container": "/x", "mode": "ro"})
        h.write_spec("supervisor", spec)
        with pytest.raises(night.Refused):
            runner.start_supervisor()

    def test_the_studio_may_mount_its_workflows(self, night, h):
        runner, fx = ready_runner(night, h, nf.task("st-1", role="studio"))
        fx.main_settings = G2_SETTINGS
        fx.t += 10
        runner.schedule()
        assert runner.tasks["st-1"].state == "running"

    def test_the_plan_may_mount_the_provider_mirror(self, night, h):
        h.set_fact("NIGHT_PLAN", "on")
        mirror = h.home / ".local/share/h4reet/terraform-providers"
        mirror.mkdir(parents=True)
        spec = h.spec_for("plan")
        spec["mounts"].append(
            {"host": str(mirror), "container": str(mirror), "mode": "ro"}
        )
        h.write_spec("plan", spec)
        runner, fx = nf.make_runner(night, h)
        fx.main_settings = G2_SETTINGS
        assert runner.load_live_spec("plan")["image"]


class TestThePlanContainer:
    def test_it_mounts_the_repositorys_git_read_only_and_sets_no_aws_variable(
        self, night, h
    ):
        h.set_fact("NIGHT_PLAN", "on")
        runner, fx, t = running_task(night, h, "ops")
        a = ask(
            runner, t, 1, {"kind": "plan", "root": "bootstrap", "sha": nf.sha40("p")}
        )
        assert a["ok"] is True, a
        argv = fx.plan_seen[0]["argv"]
        g = str(h.repo / ".git")
        assert (g, g, "ro") in vols(argv)
        assert not [k for k in envs(argv) if k.startswith("AWS_")]

    def test_a_plan_spec_naming_an_aws_variable_is_refused(self, night, h):
        h.set_fact("NIGHT_PLAN", "on")
        spec = h.spec_for("plan")
        spec["env"]["AWS_PROFILE"] = "h4-agent-plan"
        h.write_spec("plan", spec)
        runner, _fx = nf.make_runner(night, h)
        with pytest.raises(night.Refused):
            runner.load_live_spec("plan")


class TestInit:
    @pytest.mark.parametrize("role", nf.SESSION_ROLES)
    def test_every_session_runs_with_init(self, night, h, role):
        _r, _f, _t, argv = TestDockerRun().start_role(night, h, role)
        assert argv.index("--init") < argv.index("--user")

    def test_every_helper_runs_with_init(self, night, h):
        runner, fx = nf.make_runner(night, h)
        runner.start_network_helpers()
        for c in fx.docker_calls("run"):
            assert "--init" in c, c

    def test_comfyui_and_the_plan_run_with_init(self, night, h):
        runner, fx, t = running_task(night, h, "studio")
        ask(runner, t, 1, {"kind": "comfyui", "action": "start", "params": []})
        comfy = [c for c in fx.docker_calls("run") if "h4-night-comfyui" in c]
        assert comfy and "--init" in comfy[0]
        h2 = nf.Home(h.root / "second")
        h2.set_fact("NIGHT_PLAN", "on")
        runner2, fx2, t2 = running_task(night, h2, "ops")
        ask(runner2, t2, 1, {"kind": "plan", "root": "bootstrap", "sha": nf.sha40("p")})
        assert "--init" in fx2.plan_seen[0]["argv"]


class TestMemorySum:
    def test_starts_stop_at_total_memory_less_eight_gb(self, night, h):
        fx = nf.FakeFx(night, h)
        fx.mem_total_bytes = (
            40 * 2**30
        )  # 32 GB to give: the supervisor's 2, then seven workers of 4
        runner, fx = ready_runner(
            night, h, *(nf.task(f"t-{i:02d}") for i in range(10)), fx=fx
        )
        for _ in range(12):
            fx.t += 10
            runner.schedule()
        assert len(running_ids(runner)) == 7
        lines = [
            ln
            for ln in nf.page_text(runner).splitlines()
            if "t-07" in ln and "memory" in ln
        ]
        assert len(lines) == 1
        runner.dispatch(("exit", runner.tasks["t-00"].key, 0))
        fx.t += 10
        runner.schedule()
        assert runner.tasks["t-07"].state == "running"

    def test_the_helpers_count(self, night, h):
        runner, _fx = nf.make_runner(night, h)
        runner.start_network_helpers()
        runner.start_supervisor()
        assert runner.mem_committed() == 2 * 2**30 + (256 + 256 + 128) * 2**20

    def test_comfyui_counts_and_is_refused_over_the_sum(self, night, h):
        fx = nf.FakeFx(night, h)
        fx.mem_total_bytes = (
            17 * 2**30
        )  # 9 GB to give: the supervisor's 2 and the studio's 4 fit; ComfyUI's 4 doesn't
        runner, fx, t = running_task(night, h, "studio", fx=fx)
        a = ask(runner, t, 1, {"kind": "comfyui", "action": "start", "params": []})
        assert a["ok"] is False and "memory" in a["answer"]
        assert not [c for c in fx.docker_calls("run") if "h4-night-comfyui" in c]

    def test_a_supervisor_over_the_sum_refuses_the_start(self, night, h):
        fx = nf.FakeFx(night, h)
        fx.mem_total_bytes = 9 * 2**30
        runner, fx = nf.make_runner(night, h, fx)
        with pytest.raises(night.Refused) as e:
            runner.start_supervisor()
        assert "memory" in str(e.value)

    @pytest.mark.parametrize(
        ("text", "n"), [("4g", 4 * 2**30), ("512m", 512 * 2**20), ("1024k", 2**20)]
    )
    def test_memory_limits_parse(self, night, text, n):
        assert night.mem_bytes(text) == n
