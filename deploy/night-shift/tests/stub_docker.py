#!/usr/bin/python3 -I
"""A stand-in `docker` for the install's and the container probe's tests (spec 017, tasks.md T052, T053).

It never runs a container. It keeps its images, networks, and detached containers in $STUB_STATE (JSON), appends
each call to $STUB_LOG (one JSON line: argv, and for a build its context's files and their SHA-256), and answers as
$STUB_SCENARIO (JSON) says:

  wrong_digest: <image>   that base's RepoDigests name another digest
  fail: R1|R2|R3|R4       that rehearsal step's container misbehaves (R4: the first row is allowed, and prints
                          $STUB_SECRET on stdout, which the install must never show)
  build_fail: <name>      that image's build fails
  fwd_fail: true          (the probe) the engine forwarder's `run -d` fails
  running: <name>         `docker ps` names a running night container
  egress_silent: true     the egress log records nothing (a proxy whose log can't be written)
  r3_killed: true         make check is killed partway (exit 137, no summary line)

A signed-in `claude -p` turn adds an api.anthropic.com line to the h4-night-egress helper's log, as the real proxy
does. Builds and networks keep their --label values, and `inspect` renders the `index .Labels` formats.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

STATE = Path(os.environ["STUB_STATE"])
LOG = Path(os.environ["STUB_LOG"])
SCENARIO = json.loads(os.environ.get("STUB_SCENARIO") or "{}")
ERRORS = (
    "No such file or directory; Read-only file system; Invalid cross-device link; Device or resource busy; "
    "refused: unreachable; refused: no default route; HTTP Error 403; Name or service not known; "
    "Cannot connect to the Docker daemon"
)


def load() -> dict:
    try:
        return json.loads(STATE.read_text())
    except (OSError, ValueError):
        return {
            "images": {},
            "pulled": {},
            "networks": {},
            "containers": {},
            "seq": 0,
            "rows": 0,
        }


def save(st: dict) -> None:
    STATE.write_text(json.dumps(st))


def log(entry: dict) -> None:
    with LOG.open("a") as f:
        f.write(json.dumps(entry) + "\n")


def fake_id(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode()).hexdigest()


def fmt(template: str, values: dict) -> str:
    out = template
    for k, v in values.items():
        out = out.replace("{{" + k + "}}", str(v))
    return out


def opt(argv: list[str], name: str) -> str | None:
    for i, a in enumerate(argv):
        if a == name and i + 1 < len(argv):
            return argv[i + 1]
        if a.startswith(name + "="):
            return a.split("=", 1)[1]
    return None


def context_files(ctx: str) -> dict[str, str]:
    out = {}
    for dirpath, _dirs, names in os.walk(ctx):
        for n in names:
            p = os.path.join(dirpath, n)
            out[os.path.relpath(p, ctx)] = hashlib.sha256(
                Path(p).read_bytes()
            ).hexdigest()
    return out


def run(st: dict, argv: list[str]) -> int:
    args = argv[1:]
    image_at = next(
        (i for i, a in enumerate(args) if a.startswith(("sha256:", "h4-night-probe-"))),
        None,
    )
    detached = "-d" in (args[:image_at] if image_at is not None else args)
    name = opt(args, "--name")
    envs = [args[i + 1] for i, a in enumerate(args) if a == "-e" and i + 1 < len(args)]
    vols = [args[i + 1] for i, a in enumerate(args) if a == "-v" and i + 1 < len(args)]
    cmd = args[image_at + 1 :] if image_at is not None else []
    if detached:
        if SCENARIO.get("fwd_fail") and name and "fwd" in name:
            print("stub: the forwarder failed", file=sys.stderr)
            return 125
        st["seq"] += 1
        cid = hashlib.sha256(f"{name}{st['seq']}".encode()).hexdigest()[:12]
        labels = [
            args[i + 1]
            for i, a in enumerate(args)
            if a == "--label" and i + 1 < len(args)
        ]
        st["containers"][name or cid] = {"id": cid, "labels": labels}
        for v in vols:
            host, _, rest = v.partition(":")
            if rest.startswith("/log:") and name == "h4-night-egress":
                st["egress_log"] = host
        print(cid)
        return 0
    # the container probe's checks script: the rows it would print
    if cmd[:1] == ["/night/checks.sh"]:
        src = next((v.split(":")[0] for v in vols if ":/night/checks.sh:" in v), None)
        if src:
            Path(os.environ["STUB_STATE"] + ".checks.sh").write_bytes(
                Path(src).read_bytes()
            )
        for row in os.environ.get("STUB_PROBE_ROWS", "").split(","):
            if row:
                print(f"row: {row} ok")
        print("row: dns info example.com does not resolve")
        print("row: engine-fwd info connected")
        print("row: auth-status info none")
        print("row: claude-sandbox-in-container info doesn't start")
        return 0
    if "nvidia-smi" in cmd:
        print("GPU 0: Stub GPU (UUID: GPU-stub)")
        return 0
    if "timeout" in cmd and "claude" in cmd:  # the probe's fail-closed runs
        print("ok")
        return 0
    if cmd[:1] == ["python3"]:  # the probe's readiness check
        return 0
    if cmd[:2] == ["claude", "-p"]:
        standin = [
            e
            for e in envs
            if e.startswith(("ANTHROPIC_API_KEY=", "ANTHROPIC_AUTH_TOKEN="))
        ]
        if standin:
            if SCENARIO.get("fail") == "R2":
                if st.get("egress_log"):
                    with open(os.path.join(st["egress_log"], "egress.jsonl"), "a") as f:
                        f.write(
                            json.dumps(
                                {"host": "api.anthropic.com", "decision": "allow"}
                            )
                            + "\n"
                        )
                print("Invalid API key", file=sys.stderr)
                return 1
            print(
                "This machine's managed settings require a first-party login",
                file=sys.stderr,
            )
            return 1
        if SCENARIO.get("fail") == "R1":
            print("Not logged in", file=sys.stderr)
            return 1
        if st.get("egress_log") and not SCENARIO.get("egress_silent"):
            with open(os.path.join(st["egress_log"], "egress.jsonl"), "a") as f:
                f.write(
                    json.dumps({"host": "api.anthropic.com", "decision": "allow"})
                    + "\n"
                )
        print(json.dumps({"type": "system", "subtype": "init", "apiKeySource": "none"}))
        print(json.dumps({"type": "result", "is_error": False, "result": "ok"}))
        return 0
    if cmd[:2] == ["bash", "-c"]:
        script = cmd[2] if len(cmd) > 2 else ""
        if "make check" in script:
            print("npm config: token=" + os.environ.get("STUB_SECRET", "stub-secret"))
            print("== lint\n-> PASS lint\n== toolchain-check\n-> FAIL toolchain-check")
            if SCENARIO.get("r3_killed"):
                return 137
            print(
                "== matrix\n--- stage S: the sandbox ---\nFAIL        stage-S-unwritable    x: no mask\n-> FAIL matrix"
            )
            failing = "toolchain-check FAIL, matrix FAIL"
            if SCENARIO.get("fail") == "R3":
                print("== test\n-> FAIL test")
                failing += ", test FAIL"
            n = failing.count("FAIL")
            print(
                f"make check: 1 PASS, 0 SKIP, 0 WARN, 0 PLANNED, 0 PENDING, {n} FAIL; failing: {failing}"
            )
            return 2
        if "printenv CLAUDE_CODE_OAUTH_TOKEN" in script:
            return 0
        st["rows"] += 1
        if SCENARIO.get("fail") == "R4" and st["rows"] == 1:
            print(os.environ.get("STUB_SECRET", "stub-secret"))
            return 0
        print(ERRORS, file=sys.stderr)
        return 1
    return 0


def main() -> int:
    argv = sys.argv
    st = load()
    entry = {"argv": argv}
    args = argv[1:]
    rc = 0
    if not args:
        rc = 1
    elif args[0] == "version":
        print("28.3.3" if "--format" in args else "Server: 28.3.3")
    elif args[0] == "info":
        print("runtimes: io.containerd.runc.v2 nvidia runc ")
    elif args[0] == "ps":
        if SCENARIO.get("running"):
            print(SCENARIO["running"])
        else:
            want = opt(args, "--filter") or ""
            for n, c in st["containers"].items():
                if want.startswith("label=") and want[len("label=") :] in c["labels"]:
                    print(c["id"] if "-q" in args or "-aq" in args else n)
    elif args[0] == "pull":
        ref = args[-1]
        image, _, digest = ref.partition("@")
        if SCENARIO.get("wrong_digest") and image.endswith(SCENARIO["wrong_digest"]):
            digest = "sha256:" + hashlib.sha256(b"another").hexdigest()
        st["pulled"][ref] = f"{image}@{digest}"
    elif args[:2] == ["image", "inspect"]:
        ref = args[-1]
        f = opt(args, "--format") or opt(args, "-f") or "{{.Id}}"
        if ref in st["images"]:
            label = (
                st.get("image_labels", {}).get(ref, {}).get("h4-night", "<no value>")
            )
            print(
                fmt(
                    f,
                    {
                        ".Id": st["images"][ref],
                        'index .Config.Labels "h4-night"': label,
                    },
                )
            )
        elif ref in st["pulled"]:
            print(
                fmt(
                    f,
                    {
                        ".Id": fake_id(ref),
                        'join .RepoDigests " "': st["pulled"][ref],
                        "index .RepoDigests 0": st["pulled"][ref],
                    },
                )
            )
        else:
            print(f"Error: No such image: {ref}", file=sys.stderr)
            rc = 1
    elif args[:2] == ["image", "rm"]:
        for ref in args[2:]:
            st["images"].pop(ref, None)
    elif args[0] == "build":
        tag = opt(args, "-t")
        ctx = args[-1]
        files = context_files(ctx)
        entry.update(ctx=ctx, files=files)
        name = (tag or "").split(":")[0].removeprefix("h4-night-")
        if SCENARIO.get("build_fail") and SCENARIO["build_fail"] == name:
            print("stub: the build failed", file=sys.stderr)
            rc = 1
        else:
            st["images"][tag] = fake_id(tag + json.dumps(files, sort_keys=True))
            labels = [
                args[i + 1]
                for i, a in enumerate(args)
                if a == "--label" and i + 1 < len(args)
            ]
            st.setdefault("image_labels", {})[tag] = dict(
                x.split("=", 1) for x in labels
            )
            print(st["images"][tag])
    elif args[:2] == ["network", "inspect"]:
        n = args[-1]
        f = opt(args, "--format") or opt(args, "-f")
        if n in st["networks"]:
            net = st["networks"][n]
            print(
                fmt(
                    f or "{{.Id}}",
                    {
                        ".Internal": "true" if net["internal"] else "false",
                        ".Id": net["id"],
                        'index .Labels "h4-night"': dict(
                            x.split("=", 1) for x in net.get("labels", [])
                        ).get("h4-night", "<no value>"),
                    },
                )
            )
        else:
            rc = 1
    elif args[:2] == ["network", "create"]:
        n = args[-1]
        if SCENARIO.get("net_fail") and SCENARIO["net_fail"] in n:
            rc = 1
        else:
            labels = [args[i + 1] for i, a in enumerate(args) if a == "--label"]
            st["networks"][n] = {
                "internal": "--internal" in args,
                "id": hashlib.sha256(n.encode()).hexdigest()[:12],
                "labels": labels,
            }
            print(st["networks"][n]["id"])
    elif args[:2] == ["network", "rm"]:
        for n in args[2:]:
            st["networks"].pop(n, None)
    elif args[:2] == ["network", "connect"]:
        pass
    elif args[0] == "inspect":
        print("true")
    elif args[0] in ("rm", "stop"):
        # The containers after the options, as docker reads them: only an option that takes a value (stop's -t 60)
        # hides the next argument. An ID that is all digits is still an ID (the gate's 504080177739, 2026-11-23).
        names, value_next = [], False
        for a in args[1:]:
            if value_next:
                value_next = False
            elif a in ("-t", "--time", "--timeout", "-s", "--signal"):
                value_next = True
            elif not a.startswith("-"):
                names.append(a)
        for n in names:
            for k in [k for k, c in st["containers"].items() if k == n or c["id"] == n]:
                st["containers"].pop(k)
    elif args[0] == "logs":
        pass
    elif args[0] == "run":
        rc = run(st, argv)
    entry["rc"] = rc
    log(entry)
    save(st)
    return rc


if __name__ == "__main__":
    sys.exit(main())
