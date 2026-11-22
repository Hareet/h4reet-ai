"""The private interface's replies (spec 001, fix F2; specs/001-cloud-elevation/fixes/f2.md): the relay, the shared
state, and the sink are Docker's published ports on the private address, 10.42.1.10 on ens5, and their replies are
routed from Docker's bridges before conntrack writes that address back as their source. Main's table sends
10.42.0.0/24, CloudFront's VPC origin's subnet, out ens6, whose source/dest check drops them: the 30 s timeout of the
night of the deploy. The Author's lines, in memory that night, from the release's tree by the deployer's host step:

  - ens5's networkd drop-in: table 105's default by ens5's DHCP gateway; `fwmark 0x105 lookup 105` at priority 104,
    `from 10.42.1.10 lookup 105` at 105;
  - `inet h4reet_reply`, its own table, so the user data's `inet h4reet` load leaves it whole: first
    `iifname "ens5" ct state new ct mark set 0x105`, then `iifname != "ens5" meta mark set ct mark`, hooked before
    `inet h4reet`'s prerouting;
  - a oneshot unit that loads it at each boot, after the user data's filter and before Docker;
  - `shared_state.py prepare` installs the three, enables and restarts the unit, and (fix F9, fixes/f9.md) never
    reloads or reconfigures networkd on the live interface: it writes the drop-in for the next boot and makes its
    route and rules live itself, with `ip`, as networkd makes them at boot, touching nothing that is right already;
    it checks ens5's address before and after, and undoes its own changes and fails the step when the address is
    gone; a rerun adds no second rule, and every part is on the root volume, so it holds after a reboot;
  - a routing model, from the files as written: CloudFront's reply, EC2's on 5432 and 2301, and the tunnel end's own
    connection to EC2 leave by ens5; the laptop's tunnel and the host's way out by ens6.
Nothing here reaches AWS, Docker, or the host's network.
"""

from __future__ import annotations

import importlib.util
import ipaddress
import json
import re
import shutil
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
HOST = HERE / "tunnel-end"
RELEASE = HOST / "release"
DROPIN = RELEASE / "zz-h4-reply-route.conf"
TABLE = RELEASE / "h4-reply-route.nft"
UNIT = RELEASE / "h4-reply-route.service"
USER_DATA_NFT = HOST / "nftables.nft"
EC2_ROUTE = HOST / "networkd" / "zz-h4-ec2-route.conf"
SCRIPT = HOST / "shared_state.py"
SINK = REPO / "deploy" / "scripts" / "snapshot_sink.py"
PRIVATE_IF, PUBLIC_IF = "ens5", "ens6"
PRIVATE, PUBLIC, EC2 = "10.42.1.10", "10.42.0.10", "10.42.0.20"
MARK, TABLE_ID = 0x105, 105
# Netfilter's named priorities (nft(8), "PRIORITY"), the ones these files name.
PRIORITIES = {"raw": -300, "mangle": -150, "dstnat": -100, "filter": 0}
DOCKER_DNAT = PRIORITIES["dstnat"]


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


ss = _load("shared_state_for_reply_route", SCRIPT)
sst = _load("test_shared_state_for_reply_route", HERE / "test_shared_state.py")
td = _load(
    "test_deployer_for_reply_route", REPO / "deploy" / "scripts" / "test_deployer.py"
)
patches = _load("infra_patches_for_reply_route", REPO / "infra" / "test" / "patches.py")


def sections(path: Path) -> list[tuple[str, dict[str, str]]]:
    """systemd's syntax, each section in its order: a section may repeat, and each is its own rule (configparser would
    merge them)."""
    out: list[tuple[str, dict[str, str]]] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith(("#", ";")):
            continue
        if line.startswith("[") and line.endswith("]"):
            out.append((line[1:-1], {}))
            continue
        key, _, value = line.partition("=")
        out[-1][1][key.strip()] = value.strip()
    return out


def statements(text: str) -> list[str]:
    return [
        line.strip()
        for line in text.splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]


def chain(text: str, table: str, name: str) -> tuple[int, str, list[str]]:
    """A base chain's priority, its hook line, and its rules."""
    t = re.search(
        rf"^table {re.escape(table)} \{{\n(.*?)^\}}", text, re.MULTILINE | re.DOTALL
    )
    assert t, f"no table {table}"
    c = re.search(rf"chain {name} \{{\n(.*?)\n  \}}", t.group(1), re.DOTALL)
    assert c, f"no chain {name} in {table}"
    hook, *rules = statements(c.group(1))
    p = re.search(r"priority (\w+|-?\d+)(?: ([+-]) (\d+))?;", hook)
    assert p, hook
    base = PRIORITIES[p.group(1)] if p.group(1) in PRIORITIES else int(p.group(1))
    offset = int(p.group(3) or 0) * (-1 if p.group(2) == "-" else 1)
    return base + offset, hook, rules


def host_files() -> dict[str, str]:
    tf = patches.patched_text("infra/prod/tunnel-end.tf") or ""
    return dict(re.findall(r'"([^"]+)"\s*=\s*\{ source = "([^"]+)"', tf))


# ----------------------------------------------------------------------------------------------------------------------
# What the step writes.


def test_the_dropin_is_his_route_and_his_two_rules_at_his_priorities() -> None:
    assert sections(DROPIN) == [
        ("Route", {"Gateway": "_dhcp4", "Table": str(TABLE_ID)}),
        (
            "RoutingPolicyRule",
            {"From": PRIVATE, "Table": str(TABLE_ID), "Priority": "105"},
        ),
        (
            "RoutingPolicyRule",
            {"FirewallMark": str(MARK), "Table": str(TABLE_ID), "Priority": "104"},
        ),
    ]
    # The address is the private interface's, as prod's plan fixes it.
    tf = patches.patched_text("infra/prod/tunnel-end.tf") or ""
    assert re.search(rf'private_ips\s*=\s*\["{re.escape(PRIVATE)}"\]', tf)


def test_the_dropin_goes_where_the_user_data_puts_ens5s_and_sorts_after_it() -> None:
    (place,) = [
        p
        for p, s in host_files().items()
        if s == "deploy/hosts/tunnel-end/networkd/zz-h4-ec2-route.conf"
    ]
    assert ss.Paths().network == Path(place).parent
    assert Path(place).parent.name == f"70-{PRIVATE_IF}.network.d"
    assert DROPIN.name > Path(place).name


def test_the_marks_table_is_his_two_lines_in_his_order_before_inet_h4reets() -> None:
    text = TABLE.read_text(encoding="utf-8")
    # Replaced whole at each load, as the user data's file is: one copy, whatever the number of loads.
    assert statements(text)[:2] == [
        "table inet h4reet_reply",
        "delete table inet h4reet_reply",
    ]
    assert len(re.findall(r"^table inet h4reet_reply \{$", text, re.MULTILINE)) == 1
    # No other table: the idiom's two lines and the block name this one alone.
    assert set(re.findall(r"^(?:delete )?table (\S+ \S+)", text, re.MULTILINE)) == {
        "inet h4reet_reply"
    }
    assert re.findall(r"^\s*chain (\w+) \{", text, re.MULTILINE) == ["prerouting"]
    priority, hook, rules = chain(text, "inet h4reet_reply", "prerouting")
    assert hook.startswith("type filter hook prerouting priority ") and hook.endswith(
        "policy accept;"
    )
    assert rules == [
        f'iifname "{PRIVATE_IF}" ct state new ct mark set {MARK:#x}',
        f'iifname != "{PRIVATE_IF}" meta mark set ct mark',
    ]
    # "First": before the user data's filter, and so before Docker's DNAT and the routing decision.
    theirs, _, _ = chain(
        USER_DATA_NFT.read_text(encoding="utf-8"), "inet h4reet", "prerouting"
    )
    assert priority < theirs < DOCKER_DNAT


def test_the_user_datas_filter_never_names_the_marks_table() -> None:
    # h4-nftables.service deletes and makes again `inet h4reet` alone; a load of it leaves the marks' table whole.
    text = USER_DATA_NFT.read_text(encoding="utf-8")
    assert "h4reet_reply" not in text
    assert re.findall(r"^table (\S+ \S+) \{", text, re.MULTILINE) == ["inet h4reet"]


def test_the_unit_loads_the_table_after_the_filter_and_before_docker_at_every_boot() -> (
    None
):
    unit = dict(sections(UNIT))
    assert "h4-nftables.service" in unit["Unit"]["After"].split()
    assert "docker.service" in unit["Unit"]["Before"].split()
    assert unit["Service"]["Type"] == "oneshot"
    assert unit["Service"]["RemainAfterExit"] == "yes"
    assert (
        unit["Service"]["ExecStart"]
        == f"/usr/sbin/nft -f {ss.Paths().config / TABLE.name}"
    )
    assert unit["Install"] == {"WantedBy": "multi-user.target"}


def test_none_of_it_travels_in_the_user_data_so_nothing_is_replaced() -> None:
    sources = set(host_files().values())
    assert sources, "local.host_files"
    for path in (DROPIN, TABLE, UNIT):
        assert str(path.relative_to(REPO)) not in sources, path
    assert not [s for s in sources if s.startswith("deploy/hosts/tunnel-end/release/")]


# ----------------------------------------------------------------------------------------------------------------------
# The host step.

# Fix F9 (specs/001-cloud-elevation/fixes/f9.md): ens5 as the kernel holds it, read and changed by `ip` as iproute2
# prints and takes it. On 2026-11-18 the release's step ran `networkctl reload` and `networkctl reconfigure ens5`, and
# networkd failed ens5 ("Could not set DHCPv4 route: Nexthop has invalid gateway"), leaving it with no IPv4; after a
# clean reboot networkd made the same drop-in's route and rules perfectly. These are what it made, as the Author read
# them then: table 105's default by ens5's DHCP gateway, with its proto and metric, and the two rules, proto static.
ADDRESS_LINE = (
    b"2: ens5    inet 10.42.1.10/24 metric 512 brd 10.42.1.255 scope global dynamic ens5\\       "
    b"valid_lft 3400sec preferred_lft 3400sec\n"
)
MAIN_DEFAULT = {
    "dst": "default",
    "gateway": "10.42.1.1",
    "protocol": "dhcp",
    "prefsrc": PRIVATE,
    "metric": 512,
    "flags": [],
}
NETWORKD_ROUTE = {
    "dst": "default",
    "gateway": "10.42.1.1",
    "dev": PRIVATE_IF,
    "protocol": "dhcp",
    "metric": 512,
    "flags": [],
}
NETWORKD_RULES = [
    {
        "priority": 104,
        "src": "all",
        "fwmark": f"{MARK:#x}",
        "table": str(TABLE_ID),
        "protocol": "static",
    },
    {"priority": 105, "src": PRIVATE, "table": str(TABLE_ID), "protocol": "static"},
]
KERNEL_RULES = (
    [{"priority": 0, "src": "all", "table": "local"}],
    [
        {"priority": 32766, "src": "all", "table": "main"},
        {"priority": 32767, "src": "all", "table": "default"},
    ],
)


def rule_entry(kv: dict[str, str]) -> dict:
    entry: dict = {"priority": int(kv["priority"]), "src": kv.get("from", "all")}
    if "fwmark" in kv:
        entry["fwmark"] = f"{int(kv['fwmark'], 0):#x}"
    entry["table"] = kv["table"]
    if "protocol" in kv:
        entry["protocol"] = kv["protocol"]
    return entry


class NetHost(sst.StubHost):
    """The stub host, with ens5's address, main's DHCP default by it, table 105, and the rules. An answer a test sets
    wins, as the stub's do. `networkctl reconfigure ens5` loses the address, as it did on the night; `lose_address_on`
    makes any other command lose it."""

    def __init__(self, tmp: Path) -> None:
        super().__init__(tmp)
        self.address = True
        self.table: list[dict] = []
        self.rules: list[dict] = []
        self.lose_address_on: str | None = None

    def networkd_made_it(self) -> None:
        self.table = [dict(NETWORKD_ROUTE)]
        self.rules = [dict(r) for r in NETWORKD_RULES]

    def run(self, args: list[str], data: bytes | None = None) -> tuple[int, bytes]:
        joined = " ".join(args)
        answered = super().run(args, data)
        if any(joined.startswith(prefix) for prefix in self.answers):
            return answered
        code, out = 0, b""
        if args[:1] == ["networkctl"] and "reconfigure" in args:
            self.address = False
        if args[:2] == ["ip", "-4"]:
            code, out = self.ip(args[2:])
        if self.lose_address_on and joined.startswith(self.lose_address_on):
            self.address = False
        return code, out

    def ip(self, a: list[str]) -> tuple[int, bytes]:
        if a == ["-o", "addr", "show", "dev", PRIVATE_IF]:
            return 0, ADDRESS_LINE if self.address else b""
        if a == ["-j", "rule", "show"]:
            before, after = KERNEL_RULES
            ordered = sorted(self.rules, key=lambda r: r["priority"])
            return 0, json.dumps([*before, *ordered, *after]).encode()
        if a == ["-j", "route", "show", "table", str(TABLE_ID)]:
            return 0, json.dumps(self.table).encode()
        if a == ["-j", "route", "show", "default", "dev", PRIVATE_IF]:
            # iproute2 leaves out the device a filter names.
            return 0, json.dumps([MAIN_DEFAULT] if self.address else []).encode()
        if a[:1] == ["route"] and a[1] in ("replace", "del"):
            kv = dict(zip(a[3::2], a[4::2]))
            assert kv.get("table") == str(TABLE_ID), a
            same = [
                r
                for r in self.table
                if r["dst"] == a[2]
                and ("metric" not in kv or r.get("metric") == int(kv["metric"]))
            ]
            if a[1] == "del":
                if not same:
                    return 2, b""
                self.table.remove(same[0])
                return 0, b""
            entry = {"dst": a[2], "gateway": kv["via"], "dev": kv["dev"]}
            entry["protocol"] = kv.get("proto", "boot")
            if "metric" in kv:
                entry["metric"] = int(kv["metric"])
            entry["flags"] = []
            for r in same:
                self.table.remove(r)
            self.table.append(entry)
            return 0, b""
        if a[:1] == ["rule"] and a[1] in ("add", "del"):
            entry = rule_entry(dict(zip(a[2::2], a[3::2])))
            if a[1] == "add":
                if entry in self.rules:
                    return 2, b""  # EEXIST: iproute2 asks NLM_F_EXCL
                self.rules.append(entry)
                return 0, b""
            if entry not in self.rules:
                return 2, b""
            self.rules.remove(entry)
            return 0, b""
        raise AssertionError(f"ip {' '.join(a)}: not a command the model knows")


@pytest.fixture
def world(tmp_path: Path):
    host = NetHost(tmp_path)
    paths = ss.Paths(
        data=tmp_path / "srv",
        tls=tmp_path / "run" / "shared-state",
        state=tmp_path / "var" / "shared-state",
        install=tmp_path / "opt",
        units=tmp_path / "etc" / "systemd" / "system",
        snapshot=tmp_path / "opt-snapshot",
    )
    paths.network = tmp_path / "etc" / "systemd" / "network" / "70-ens5.network.d"
    paths.config = tmp_path / "etc" / "h4reet"
    host.answer("blkid", 0, b"ext4\n")
    host.answer("findmnt", 0, b"/srv\n")
    host.answer(
        "aws ssm get-parameters",
        out=sst.parameters(
            {
                "/h4reet/tunnel-end/SHARED_STATE_TLS_KEY": sst.KEY_PEM,
                "/h4reet/tunnel-end/SHARED_STATE_TLS_CERT": sst.CERT_PEM,
            }
        ),
    )
    tree = tmp_path / "tree"
    shutil.copytree(RELEASE, tree / "deploy" / "hosts" / "tunnel-end" / "release")
    shutil.copy2(SCRIPT, tree / "deploy" / "hosts" / "tunnel-end" / "shared_state.py")
    (tree / "deploy" / "scripts").mkdir(parents=True)
    shutil.copy2(SINK, tree / "deploy" / "scripts" / "snapshot_sink.py")
    return host, paths, tree


def ran(host) -> list[str]:
    return [" ".join(args) for args, _ in host.calls]


# Fix F9: what makes the drop-in live, as networkd makes it at boot, with no networkd command: the route first, so a
# rule never points into an empty table, then the rules.
MAKE_LIVE = [
    f"ip -4 route replace default via 10.42.1.1 dev {PRIVATE_IF} table {TABLE_ID} proto dhcp metric 512",
    f"ip -4 rule add from {PRIVATE} table {TABLE_ID} priority 105 protocol static",
    f"ip -4 rule add fwmark {MARK:#x} table {TABLE_ID} priority 104 protocol static",
]


def changes(host) -> list[str]:
    return [
        c
        for c in ran(host)
        if c.startswith(
            (
                "ip -4 route replace",
                "ip -4 route del",
                "ip -4 rule add",
                "ip -4 rule del",
            )
        )
    ]


def touches_networkd(command: str) -> bool:
    return command.startswith("networkctl") or "systemd-networkd" in command


def test_prepare_installs_the_three_from_the_releases_tree_and_loads_them(
    world,
) -> None:
    host, paths, tree = world
    assert ss.prepare(host, paths, tree) == 0
    installed = {
        paths.network / DROPIN.name: (DROPIN, 0o644),
        paths.config / TABLE.name: (TABLE, 0o600),
        paths.units / UNIT.name: (UNIT, 0o644),
    }
    for place, (source, mode) in installed.items():
        assert place.read_bytes() == source.read_bytes(), place
        assert place.stat().st_mode & 0o777 == mode, place
    commands = ran(host)
    order = [
        "systemctl daemon-reload",
        "systemctl enable h4-reply-route.service",
        "systemctl restart h4-reply-route.service",
        *MAKE_LIVE,
    ]
    assert [c for c in commands if c in order] == order
    # Fix F9: networkd is never asked to reload or reconfigure the live interface.
    assert not [c for c in commands if touches_networkd(c)]
    # Before the store's timer, so a failure here starts nothing of the store's either.
    assert commands.index(order[-1]) < commands.index(
        "systemctl enable --now h4-shared-state-backup.timer"
    )


@pytest.mark.parametrize(
    "failing",
    [
        "systemctl enable h4-reply-route.service",
        "systemctl restart h4-reply-route.service",
        *MAKE_LIVE,
    ],
)
def test_a_part_that_doesnt_load_fails_the_step(world, failing: str, capsys) -> None:
    host, paths, tree = world
    host.answer(failing, 1)
    assert ss.prepare(host, paths, tree) == 1
    err = capsys.readouterr().err
    assert "the private interface's replies" in err, err
    assert "systemctl enable --now h4-shared-state-backup.timer" not in ran(host)


def test_a_dropin_that_doesnt_install_fails_the_step(world, capsys) -> None:
    host, paths, tree = world
    (tree / "deploy" / "hosts" / "tunnel-end" / "release" / DROPIN.name).unlink()
    assert ss.prepare(host, paths, tree) == 1
    assert "didn't install" in capsys.readouterr().err
    assert not [c for c in ran(host) if touches_networkd(c)]
    assert not changes(host)


def test_a_rerun_adds_no_second_rule(world) -> None:
    host, paths, tree = world
    assert ss.prepare(host, paths, tree) == 0
    host.calls.clear()
    assert ss.prepare(host, paths, tree) == 0
    commands = ran(host)
    # The drop-in, unchanged, is left as it is, and so is what's live: one rule of each, one route.
    assert sorted(p.name for p in paths.network.iterdir()) == [DROPIN.name]
    assert (paths.network / DROPIN.name).read_bytes() == DROPIN.read_bytes()
    assert not [c for c in commands if touches_networkd(c)]
    assert not changes(host)
    assert sorted(host.rules, key=lambda r: r["priority"]) == NETWORKD_RULES
    assert host.table == [NETWORKD_ROUTE]
    # The table's file is loaded again, and replaces its own table whole (above): one copy of each mark.
    assert commands.count("systemctl restart h4-reply-route.service") == 1


def test_a_changed_dropin_is_written_for_the_boot_and_made_live_without_networkd(
    world,
) -> None:
    host, paths, tree = world
    paths.network.mkdir(parents=True)
    (paths.network / DROPIN.name).write_text(
        "[Route]\nGateway=_dhcp4\nTable=105\n", encoding="utf-8"
    )
    host.table = [dict(NETWORKD_ROUTE)]
    assert ss.prepare(host, paths, tree) == 0
    assert (paths.network / DROPIN.name).read_bytes() == DROPIN.read_bytes()
    assert not [c for c in ran(host) if touches_networkd(c)]
    # The route was there already: only the two rules are added.
    assert changes(host) == MAKE_LIVE[1:]
    assert host.rules == [NETWORKD_RULES[1], NETWORKD_RULES[0]]


# ----------------------------------------------------------------------------------------------------------------------
# Fix F9: a release never reconfigures the live private interface.


def test_a_new_dropin_is_made_live_as_networkd_makes_it_at_boot(world) -> None:
    # The table and the rules the step makes are the ones networkd made from the same drop-in after the reboot of
    # 2026-11-18, field for field: the reading the Author took then.
    host, paths, tree = world
    assert ss.prepare(host, paths, tree) == 0
    assert host.table == [NETWORKD_ROUTE]
    assert sorted(host.rules, key=lambda r: r["priority"]) == NETWORKD_RULES
    assert host.address


def test_what_networkd_made_already_is_left_alone(world) -> None:
    # After a boot, networkd's route and rules are there: the step reads them, and changes nothing.
    host, paths, tree = world
    paths.network.mkdir(parents=True)
    shutil.copy2(DROPIN, paths.network / DROPIN.name)
    host.networkd_made_it()
    assert ss.prepare(host, paths, tree) == 0
    assert not changes(host)
    assert host.table == [NETWORKD_ROUTE] and host.rules == NETWORKD_RULES


def test_an_unchanged_dropin_whose_rules_are_gone_has_them_made_again(world) -> None:
    # F2's backlog R-1, and a reconfigure that dropped them: the drop-in is the release's, so nothing is written, and
    # what's live is made again from it.
    host, paths, tree = world
    paths.network.mkdir(parents=True)
    shutil.copy2(DROPIN, paths.network / DROPIN.name)
    host.table = [dict(NETWORKD_ROUTE)]
    assert ss.prepare(host, paths, tree) == 0
    assert changes(host) == MAKE_LIVE[1:]
    assert sorted(host.rules, key=lambda r: r["priority"]) == NETWORKD_RULES


def test_the_step_checks_the_address_before_and_after(world) -> None:
    host, paths, tree = world
    assert ss.prepare(host, paths, tree) == 0
    commands = ran(host)
    check = f"ip -4 -o addr show dev {PRIVATE_IF}"
    first, last = commands.index(check), len(commands) - 1 - commands[::-1].index(check)
    assert first < commands.index(MAKE_LIVE[0])
    assert last > commands.index(MAKE_LIVE[-1])
    assert ss.PRIVATE_ADDRESS == PRIVATE


def test_an_address_missing_before_the_step_changes_nothing_and_fails(
    world, capsys
) -> None:
    host, paths, tree = world
    host.address = False
    assert ss.prepare(host, paths, tree) == 1
    err = capsys.readouterr().err
    assert PRIVATE in err and PRIVATE_IF in err and "before" in err, err
    assert not (paths.network / DROPIN.name).exists()
    assert not changes(host)
    assert not [c for c in ran(host) if touches_networkd(c)]
    assert "systemctl enable --now h4-shared-state-backup.timer" not in ran(host)
    # It waits a little for a boot's lease, bounded, and never sleeps for real here.
    assert host.slept and sum(host.slept) <= 60


def test_an_address_that_comes_with_the_boots_lease_is_waited_for(world) -> None:
    host, paths, tree = world
    host.address = False
    waits: list[float] = []

    def sleep(seconds: float) -> None:
        waits.append(seconds)
        if len(waits) == 3:
            host.address = True

    host.sleep = sleep  # type: ignore[method-assign]
    assert ss.prepare(host, paths, tree) == 0
    assert len(waits) >= 3


@pytest.mark.parametrize("before", ["new", "changed"])
@pytest.mark.parametrize("losing", MAKE_LIVE)
def test_an_address_lost_during_the_step_is_undone_and_fails_it(
    world, capsys, before: str, losing: str
) -> None:
    host, paths, tree = world
    old = "[Route]\nGateway=_dhcp4\nTable=105\n"
    if before == "changed":
        paths.network.mkdir(parents=True)
        (paths.network / DROPIN.name).write_text(old, encoding="utf-8")
    host.lose_address_on = losing
    assert ss.prepare(host, paths, tree) == 1
    err = capsys.readouterr().err
    assert PRIVATE in err and "undone" in err, err
    # Its own changes undone: the route and the rules it made gone, a changed drop-in as it was. A new one stays (the
    # review of bd7e0765, nit 1): its text is right for the next boot, and a rollback to a step that still reloads
    # networkd on a changed drop-in (f1abe245's) must find it unchanged, never missing.
    assert host.table == [] and host.rules == []
    placed = paths.network / DROPIN.name
    if before == "new":
        assert placed.read_bytes() == DROPIN.read_bytes()
    else:
        assert placed.read_text(encoding="utf-8") == old
    assert not [c for c in ran(host) if touches_networkd(c)]
    assert "systemctl enable --now h4-shared-state-backup.timer" not in ran(host)


def test_an_undo_leaves_what_was_there_before_the_step(world, capsys) -> None:
    # networkd's route was there; the step adds the rules, then the address goes: the rules go, the route stays.
    host, paths, tree = world
    host.table = [dict(NETWORKD_ROUTE)]
    host.lose_address_on = MAKE_LIVE[-1]
    assert ss.prepare(host, paths, tree) == 1
    assert host.table == [NETWORKD_ROUTE] and host.rules == []
    assert "undone" in capsys.readouterr().err


def test_a_live_command_that_fails_undoes_the_ones_before_it(world, capsys) -> None:
    host, paths, tree = world
    host.answer(MAKE_LIVE[-1], 1)
    assert ss.prepare(host, paths, tree) == 1
    assert host.table == [] and host.rules == []
    assert (paths.network / DROPIN.name).read_bytes() == DROPIN.read_bytes()
    err = capsys.readouterr().err
    assert "the private interface's replies" in err and "undone" in err, err


def older_step_reloads(paths, tree) -> bool:
    """F2's rule, as f1abe245's host step has it (shared_state.py:248-249, 269-273 there): networkd is reloaded and
    ens5 reconfigured when the drop-in on disk is missing or differs from its release's."""
    placed = paths.network / DROPIN.name
    release = tree / "deploy" / "hosts" / "tunnel-end" / "release" / DROPIN.name
    return not placed.is_file() or placed.read_bytes() != release.read_bytes()


@pytest.mark.parametrize("losing", MAKE_LIVE)
def test_after_an_undo_a_rollback_to_the_older_step_reloads_nothing(
    world, losing: str
) -> None:
    # A host whose drop-in is missing (one F2's step never reached): this step writes it, then fails and undoes. The
    # deployer's rollback runs the previous release's step; with this branch's drop-in text unchanged from f1abe245's,
    # that step must find nothing to reload.
    host, paths, tree = world
    host.lose_address_on = losing
    assert ss.prepare(host, paths, tree) == 1
    assert not older_step_reloads(paths, tree)


def test_a_dropin_the_step_cant_make_live_fails_before_anything_changes(
    world, capsys
) -> None:
    # The step makes live only what it can read in the drop-in; a key it doesn't know would leave the boot's and the
    # live state apart, so it fails the step and writes nothing.
    host, paths, tree = world
    release = tree / "deploy" / "hosts" / "tunnel-end" / "release" / DROPIN.name
    release.write_text(
        DROPIN.read_text(encoding="utf-8")
        + "\n[Route]\nGateway=_dhcp4\nTable=105\nScope=link\n",
        encoding="utf-8",
    )
    assert ss.prepare(host, paths, tree) == 1
    assert "Scope" in capsys.readouterr().err
    assert not (paths.network / DROPIN.name).exists()
    assert not changes(host)


def test_nothing_after_the_first_boot_reloads_or_reconfigures_networkd() -> None:
    # The user data's runcmd runs once, at the instance's first boot, before Docker or the stack start; nothing a
    # release, a boot's deployer, or a timer runs may touch networkd on the live host (the night of 2026-11-18).
    found = []
    for path in sorted((REPO / "deploy").rglob("*")):
        if not path.is_file() or path.name.startswith("test_") or path.suffix == ".md":
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for number, line in enumerate(text.splitlines(), 1):
            code = line.split("#", 1)[0]
            if "networkctl" in code or re.search(
                r"\b(restart|reload|try-restart|reload-or-restart)\b.*systemd-networkd",
                code,
            ):
                found.append(f"{path.relative_to(REPO)}:{number}: {line.strip()}")
    first_boot = [
        f
        for f in found
        if f.startswith("deploy/hosts/tunnel-end/cloud-init.yaml.tftpl:")
    ]
    assert found == first_boot, found
    runcmd = (
        (HOST / "cloud-init.yaml.tftpl")
        .read_text(encoding="utf-8")
        .split("\nruncmd:\n", 1)
    )
    assert len(runcmd) == 2 and all(
        f.split(": ", 1)[1].startswith("- networkctl") for f in first_boot
    )


def test_it_holds_after_a_reboot(tmp_path: Path) -> None:
    # Every part on the root volume, never tmpfs; the unit enabled for the boot's target (above, and the step's
    # `systemctl enable`).
    defaults = ss.Paths()
    for place in (defaults.network, defaults.config, defaults.units):
        assert place.parts[1] == "etc", place
    # And a boot is a start of the last release, so the host step runs again, from its tree (deployer.boot).
    w = td.World(tmp_path)
    w.release("r1")
    assert w.run() == 0
    w.docker.calls.clear()
    w.aws.reachable = False
    assert w.run(boot=True) == 0
    assert [args for _, args, _ in w.docker.calls if args[0] == "host-step"] == [
        ["host-step", "tunnel-end"]
    ]


# ----------------------------------------------------------------------------------------------------------------------
# The routing model: the kernel's choice, as the files write it, for each connection the private interface takes.

BRIDGE = "br-h4"  # a Docker bridge on 172.30.0.0/16
CONTAINER = "172.30.1.5"
CLOUDFRONT = "10.42.0.57"  # one of the VPC origin's interfaces, in 10.42.0.0/24
LAPTOP = "203.0.113.7"


def main_table() -> list[tuple[str, str, int]]:
    """The routes the host has, by T058's reading (docs/runbooks/tunnel-end.md): each interface's subnet, ens6's
    default first (zz-h4-public-first.conf), device 0's at 512, the bridges, and the user data's EC2 route."""
    (route,) = [s for name, s in sections(EC2_ROUTE) if name == "Route"]
    return [
        ("10.42.0.0/24", PUBLIC_IF, 0),
        ("10.42.1.0/24", PRIVATE_IF, 0),
        ("172.30.0.0/16", BRIDGE, 0),
        ("0.0.0.0/0", PUBLIC_IF, 100),
        ("0.0.0.0/0", PRIVATE_IF, 512),
        (route["Destination"], PRIVATE_IF, 0),
    ]


def fix_tables() -> tuple[
    list[tuple[int, dict[str, str]]], dict[int, list[tuple[str, str, int]]]
]:
    """The drop-in's rules, by priority, and its tables: a route with no destination is the table's default, by the
    drop-in's interface."""
    interface = re.fullmatch(r"\d+-(\w+)\.network\.d", ss.Paths().network.name)
    assert interface
    rules, tables = [], {}
    for name, s in sections(DROPIN):
        if name == "RoutingPolicyRule":
            rules.append((int(s["Priority"]), s))
        elif name == "Route":
            tables.setdefault(int(s["Table"]), []).append(
                (s.get("Destination", "0.0.0.0/0"), interface.group(1), 0)
            )
    return sorted(rules, key=lambda r: r[0]), tables


def lookup(table: list[tuple[str, str, int]], dst: str) -> str | None:
    hits = [
        (ipaddress.ip_network(net).prefixlen, -metric, dev)
        for net, dev, metric in table
        if ipaddress.ip_address(dst) in ipaddress.ip_network(net)
    ]
    return max(hits)[2] if hits else None


def marks(conn_iif: str, packet_iif: str) -> int:
    """The packet's mark, by the table's two rules: the connection's mark from its first packet's interface, and the
    packet's from the connection's unless it came in by the private interface."""
    _, _, (first, second) = chain(
        TABLE.read_text(encoding="utf-8"), "inet h4reet_reply", "prerouting"
    )
    m1 = re.fullmatch(r'iifname "(\w+)" ct state new ct mark set (0x[0-9a-f]+)', first)
    m2 = re.fullmatch(r'iifname != "(\w+)" meta mark set ct mark', second)
    assert m1 and m2
    ct = int(m1.group(2), 16) if conn_iif == m1.group(1) else 0
    return ct if packet_iif != m2.group(1) else 0


def route(src: str, dst: str, mark: int, fix: bool = True) -> str | None:
    rules, tables = fix_tables() if fix else ([], {})
    for _, s in rules:
        if "FirewallMark" in s and mark != int(s["FirewallMark"]):
            continue
        if "From" in s and ipaddress.ip_address(src) not in ipaddress.ip_network(
            s["From"]
        ):
            continue
        dev = lookup(tables.get(int(s["Table"]), []), dst)
        if dev is not None:
            return dev
    return lookup(main_table(), dst)


def test_cloudfronts_replies_leave_by_the_private_interface() -> None:
    # CloudFront to the relay's 8080: in by ens5, DNATed to the relay's container; its reply comes from the bridge.
    assert route(CONTAINER, CLOUDFRONT, marks(PRIVATE_IF, BRIDGE)) == PRIVATE_IF
    # A reply the host itself sends from the private address: the address's rule.
    assert route(PRIVATE, CLOUDFRONT, 0) == PRIVATE_IF
    # The incoming leg keeps no mark, so it still reaches the container.
    assert marks(PRIVATE_IF, PRIVATE_IF) == 0
    assert route(CLOUDFRONT, CONTAINER, marks(PRIVATE_IF, PRIVATE_IF)) == BRIDGE


def test_without_the_fix_they_left_by_the_public_one() -> None:
    # The night of the deploy: the connected 10.42.0.0/24 is ens6's.
    assert route(CONTAINER, CLOUDFRONT, 0, fix=False) == PUBLIC_IF


@pytest.mark.parametrize("port", [5432, 2301])
def test_ec2s_replies_on_5432_and_2301_leave_by_the_private_interface_with_or_without_the_fix(
    port: int,
) -> None:
    # EC2 to 10.42.1.10:5432 (the shared state) and :2301 (the sink): Docker's ports, as the relay's. The user data's
    # host route answered them before the fix; the mark's rule, first, answers them by the same interface now.
    assert route(CONTAINER, EC2, marks(PRIVATE_IF, BRIDGE)) == PRIVATE_IF
    assert route(CONTAINER, EC2, 0, fix=False) == PRIVATE_IF


def test_the_tunnel_ends_own_connections_to_ec2_still_need_the_host_route() -> None:
    # The relay to EC2's relay block (10.42.0.20:8085) and its collector (:4318): new from a bridge, so no mark.
    assert marks(BRIDGE, BRIDGE) == 0
    assert route(CONTAINER, EC2, marks(BRIDGE, BRIDGE)) == PRIVATE_IF


def test_the_tunnel_and_the_hosts_way_out_stay_on_the_public_interface() -> None:
    # The laptop's tunnel, 2222 on the Elastic IP: in by ens6, so its replies carry no mark.
    assert route(CONTAINER, LAPTOP, marks(PUBLIC_IF, BRIDGE)) == PUBLIC_IF
    # The host's own way out: the egress proxy's 443, from the public address.
    assert route(PUBLIC, "192.0.2.1", 0) == PUBLIC_IF
