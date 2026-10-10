// core/resolve.ts (tasks.md T188): a lookup with dns.lookup's contract, answered through c-ares, so a lookup the
// resolver never answers holds no libuv thread. A fake resolver stands in for c-ares, answering as it does: addresses,
// or an error with c-ares's code (ENOTFOUND, ETIMEOUT, ENODATA) and nothing else.
import { ADDRCONFIG, type LookupAddress } from "node:dns";
import os from "node:os";

import { describe, expect, it, vi } from "vitest";

import { configuredFamilies, makeLookup, type AddressResolver } from "../../src/core/resolve.js";

type Reply = string[] | { code: string } | "never";

/** A resolver answering from a table of (type, host) to a reply; it records every query it gets. */
function fakeResolver(table: Record<string, Reply>): AddressResolver & { asked: string[] } {
  const asked: string[] = [];
  const query =
    (type: "A" | "AAAA") =>
    (host: string, done: (err: NodeJS.ErrnoException | null, addresses: string[]) => void): void => {
      asked.push(`${type} ${host}`);
      const reply = table[`${type} ${host}`] ?? { code: "ENOTFOUND" };
      if (reply === "never") return;
      setImmediate(() => {
        if (Array.isArray(reply)) done(null, reply);
        else done(Object.assign(new Error(`query${type} ${reply.code} ${host}`), { code: reply.code }), []);
      });
    };
  return { asked, resolve4: query("A"), resolve6: query("AAAA") };
}

type Outcome = { err: NodeJS.ErrnoException | null; address: string | LookupAddress[]; family?: number | undefined };

function look(
  resolver: AddressResolver,
  host: string,
  options: { family?: number; all?: boolean; hints?: number },
  families: ReadonlySet<4 | 6> = new Set([4, 6]),
): Promise<Outcome> {
  const lookup = makeLookup(resolver, () => families);
  return new Promise((resolve) => {
    lookup(host, options, (err, address, family) => resolve({ err, address, family }));
  });
}

describe("makeLookup: dns.lookup's contract over c-ares", () => {
  it("answers an IP literal itself, asking no resolver", async () => {
    const r = fakeResolver({});
    expect(await look(r, "10.1.2.3", {})).toEqual({ err: null, address: "10.1.2.3", family: 4 });
    expect(await look(r, "::1", { all: true })).toEqual({
      err: null,
      address: [{ address: "::1", family: 6 }],
      family: undefined,
    });
    expect(r.asked).toEqual([]);
  });

  it("answers localhost itself, since c-ares doesn't read /etc/hosts", async () => {
    const r = fakeResolver({});
    expect(await look(r, "localhost", {})).toEqual({ err: null, address: "127.0.0.1", family: 4 });
    expect(await look(r, "LOCALHOST", { family: 6 })).toEqual({ err: null, address: "::1", family: 6 });
    expect((await look(r, "localhost", { all: true })).address).toEqual([
      { address: "127.0.0.1", family: 4 },
      { address: "::1", family: 6 },
    ]);
    expect(r.asked).toEqual([]);
  });

  it("answers a name's first A record, or every A and AAAA record when all is set", async () => {
    const r = fakeResolver({ "A model-server": ["172.18.0.5", "172.18.0.6"], "AAAA model-server": ["fd00::5"] });
    expect(await look(r, "model-server", {})).toEqual({ err: null, address: "172.18.0.5", family: 4 });
    expect(r.asked).toEqual(["A model-server"]); // one family answered: no AAAA query
    expect((await look(r, "model-server", { all: true })).address).toEqual([
      { address: "172.18.0.5", family: 4 },
      { address: "172.18.0.6", family: 4 },
      { address: "fd00::5", family: 6 },
    ]);
  });

  it("asks only the family asked for", async () => {
    const r = fakeResolver({ "AAAA model-server": ["fd00::5"] });
    expect(await look(r, "model-server", { family: 6 })).toEqual({ err: null, address: "fd00::5", family: 6 });
    expect(r.asked).toEqual(["AAAA model-server"]);
  });

  it("asks for AAAA after an A query only when the name has no A record (ENODATA)", async () => {
    const r = fakeResolver({ "A v6only": { code: "ENODATA" }, "AAAA v6only": ["fd00::7"] });
    expect(await look(r, "v6only", {})).toEqual({ err: null, address: "fd00::7", family: 6 });
    expect(r.asked).toEqual(["A v6only", "AAAA v6only"]);
  });

  for (const code of ["ENOTFOUND", "ETIMEOUT", "ESERVFAIL"]) {
    it(`fails with ${code} from the A query alone, without asking for AAAA`, async () => {
      const r = fakeResolver({ "A gone": { code }, "AAAA gone": ["fd00::9"] });
      const out = await look(r, "gone", { all: true });
      expect(out.err?.code).toBe(code);
      expect(out.address).toEqual([]);
      expect(r.asked).toEqual(["A gone"]);
    });
  }

  it("fails with the first error when no family has a record, and with ENOTFOUND, no hostname, when none answers one", async () => {
    const both = fakeResolver({ "A empty": { code: "ENODATA" }, "AAAA empty": { code: "ENODATA" } });
    expect((await look(both, "empty", {})).err?.code).toBe("ENODATA");
    const blank = fakeResolver({ "A blank": [], "AAAA blank": [] });
    const out = await look(blank, "blank", {});
    expect(out).toMatchObject({ address: "" });
    expect(out.err?.code).toBe("ENOTFOUND");
    expect(out.err?.message).not.toContain("blank");
  });

  it("with ADDRCONFIG, as net asks, skips a family no interface has an address in", async () => {
    // A host with both records, from a container without IPv6: getaddrinfo returned only the A record (S1).
    const r = fakeResolver({ "A api.example": ["203.0.113.7"], "AAAA api.example": ["2001:db8::7"] });
    const v4only = await look(r, "api.example", { all: true, hints: ADDRCONFIG }, new Set([4]));
    expect(v4only.address).toEqual([{ address: "203.0.113.7", family: 4 }]);
    expect(r.asked).toEqual(["A api.example"]);
    const both = await look(r, "api.example", { all: true, hints: ADDRCONFIG }, new Set([4, 6]));
    expect(both.address).toEqual([
      { address: "203.0.113.7", family: 4 },
      { address: "2001:db8::7", family: 6 },
    ]);
    // With no interface in either family, it asks both rather than none.
    const none = await look(r, "api.example", { hints: ADDRCONFIG }, new Set());
    expect(none.address).toBe("203.0.113.7");
    // Without the hint, a missing family doesn't matter: dns.lookup's own behavior.
    expect((await look(r, "api.example", { all: true }, new Set([4]))).address).toHaveLength(2);
  });

  for (const code of ["ENODATA", "ETIMEOUT"]) {
    it(`keeps the A answer when, asked for every address, the AAAA query fails with ${code}`, async () => {
      const r = fakeResolver({ "A model-server": ["172.18.0.5"], "AAAA model-server": { code } });
      const out = await look(r, "model-server", { all: true });
      expect(out).toEqual({ err: null, address: [{ address: "172.18.0.5", family: 4 }], family: undefined });
      expect(r.asked).toEqual(["A model-server", "AAAA model-server"]);
    });
  }

  it("answers localhost under ADDRCONFIG with the configured families alone, as getaddrinfo does", async () => {
    const r = fakeResolver({});
    expect((await look(r, "localhost", { all: true, hints: ADDRCONFIG }, new Set([4]))).address).toEqual([
      { address: "127.0.0.1", family: 4 },
    ]);
    expect(r.asked).toEqual([]);
  });

  it("filters nothing when the interfaces can't be read", async () => {
    const r = fakeResolver({ "A api.example": ["203.0.113.7"], "AAAA api.example": ["2001:db8::7"] });
    const lookup = makeLookup(r, () => {
      throw new Error("no interfaces here");
    });
    const out = await new Promise<Outcome>((resolve) =>
      lookup("api.example", { all: true, hints: ADDRCONFIG }, (err, address, family) =>
        resolve({ err, address, family }),
      ),
    );
    expect(out.address).toHaveLength(2);
  });

  it("reports the error that says more than ENODATA", async () => {
    const r = fakeResolver({ "A slow": { code: "ENODATA" }, "AAAA slow": { code: "ETIMEOUT" } });
    expect((await look(r, "slow", {})).err?.code).toBe("ETIMEOUT");
  });

  it("reads the interfaces' families as getaddrinfo's ADDRCONFIG does, loopback left out", () => {
    const address = (family: "IPv4" | "IPv6", internal: boolean) =>
      ({ address: "x", netmask: "x", family, mac: "x", internal, cidr: null }) as os.NetworkInterfaceInfo;
    vi.spyOn(os, "networkInterfaces").mockReturnValue({
      lo: [address("IPv4", true), address("IPv6", true)],
      eth0: [address("IPv4", false)],
    });
    expect([...configuredFamilies()]).toEqual([4]);
  });

  it("always calls back on a later tick, as dns.lookup does", async () => {
    const lookup = makeLookup(fakeResolver({}));
    let calledBack = false;
    const done = new Promise<void>((resolve) =>
      lookup("10.0.0.1", {}, () => {
        calledBack = true;
        resolve();
      }),
    );
    expect(calledBack).toBe(false);
    await done;
    expect(calledBack).toBe(true);
  });

  it("never answers for a resolver that never answers: the request's own deadline ends the wait", async () => {
    const lookup = makeLookup(fakeResolver({ "A silent": "never" }));
    let calledBack = false;
    lookup("silent", {}, () => {
      calledBack = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calledBack).toBe(false);
  });
});
