# The Makefile, and nothing else (spec 000, tasks.md T183). GNU make reads GNUmakefile first. With no file here,
# the sandbox's write-deny on this path (T045) left a placeholder no process could open, and every make in an agent
# session stopped: "make: GNUmakefile: Permission denied". Agents must not change this file. In the main tree,
# protected-paths.sh blocks their edits and the sandbox binds it read-only; a worktree has neither, so the gate (T092)
# holds a branch's copy to main's bytes before any make, and make check holds it to this text
# (tools/gates/makefiles_check.py). Never add a rule here.
include $(dir $(lastword $(MAKEFILE_LIST)))Makefile
