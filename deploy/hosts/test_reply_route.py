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
  - `shared_state.py prepare` installs the three, enables and restarts the unit, and reloads networkd only when the
    drop-in changed; a rerun adds no second rule, and every part is on the root volume, so it holds after a reboot;
  - a routing model, from the files as written: CloudFront's reply, EC2's on 5432 and 2301, and the tunnel end's own
    connection to EC2 leave by ens5; the laptop's tunnel and the host's way out by ens6.
Nothing here reaches AWS, Docker, or the host's network.
"""

from __future__ import annotations

import importlib.util
import ipaddress
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


@pytest.fixture
def world(tmp_path: Path):
    host = sst.StubHost(tmp_path)
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
        "networkctl reload",
        f"networkctl reconfigure {PRIVATE_IF}",
    ]
    assert [c for c in commands if c in order] == order
    # Before the store's timer, so a failure here starts nothing of the store's either.
    assert commands.index(order[-1]) < commands.index(
        "systemctl enable --now h4-shared-state-backup.timer"
    )


@pytest.mark.parametrize(
    "failing",
    [
        "systemctl enable h4-reply-route.service",
        "systemctl restart h4-reply-route.service",
        "networkctl reload",
        f"networkctl reconfigure {PRIVATE_IF}",
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
    assert not [c for c in ran(host) if c.startswith("networkctl")]


def test_a_rerun_adds_no_second_rule(world) -> None:
    host, paths, tree = world
    assert ss.prepare(host, paths, tree) == 0
    host.calls.clear()
    assert ss.prepare(host, paths, tree) == 0
    commands = ran(host)
    # The drop-in, unchanged, isn't reloaded: networkd keeps the one rule of each section it made.
    assert sorted(p.name for p in paths.network.iterdir()) == [DROPIN.name]
    assert (paths.network / DROPIN.name).read_bytes() == DROPIN.read_bytes()
    assert not [c for c in commands if c.startswith("networkctl")]
    # The table's file is loaded again, and replaces its own table whole (above): one copy of each mark.
    assert commands.count("systemctl restart h4-reply-route.service") == 1


def test_a_changed_dropin_is_written_and_reloaded_again(world) -> None:
    host, paths, tree = world
    paths.network.mkdir(parents=True)
    (paths.network / DROPIN.name).write_text(
        "[Route]\nGateway=_dhcp4\nTable=105\n", encoding="utf-8"
    )
    assert ss.prepare(host, paths, tree) == 0
    assert (paths.network / DROPIN.name).read_bytes() == DROPIN.read_bytes()
    assert "networkctl reload" in ran(host)


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
